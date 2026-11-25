import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(PROJECT_ROOT, "public/navarra-photos");
const JSON_FILE = path.join(PROJECT_ROOT, "navarra-import/documents.json");
const CACHE_FILE = path.join(PROJECT_ROOT, "navarra-import/download-state.json");

interface DocumentEntry {
  id: string;
  title?: string;
  reference?: string;
}

interface DownloadCache {
  downloaded: string[];
  noCopy: string[];
}

function loadCache(): DownloadCache {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    } catch {}
  }
  return { downloaded: [], noCopy: [] };
}

function saveCache(cache: DownloadCache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function run() {
  console.log("Starting Navarra images migration (Playwright browser automation mode)...");
  
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log(`Created directory: ${OUT_DIR}`);
  }

  if (!fs.existsSync(JSON_FILE)) {
    console.error(`Error: Cannot find documents file at ${JSON_FILE}`);
    process.exit(1);
  }

  const entries: DocumentEntry[] = JSON.parse(fs.readFileSync(JSON_FILE, "utf8"));
  const validEntries = entries.filter(e => e.title && e.id);
  const startArg = process.argv.find(a => a.startsWith("--start="))?.split("=")[1];
  const limitArg = process.argv.find(a => a.startsWith("--limit="))?.split("=")[1];
  const startIndex = startArg ? parseInt(startArg, 10) : 0;
  const maxToProcess = limitArg ? parseInt(limitArg, 10) : validEntries.length;
  const endIndex = Math.min(validEntries.length, startIndex + maxToProcess);

  const cache = loadCache();
  const noCopySet = new Set(cache.noCopy);
  const downloadedSet = new Set(cache.downloaded);

  console.log(`Loaded ${validEntries.length} photo entries from local JSON.`);
  console.log(`Range: [${startIndex} to ${endIndex}] (Processing up to ${maxToProcess})`);
  console.log(`Cached: ${downloadedSet.size} downloaded, ${noCopySet.size} without digital copy.`);

  console.log("Launching headless browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "es-ES",
  });
  const page = await context.newPage();

  // Track S3 URLs loaded during the page lifetime
  let lastS3Url: string | null = null;
  page.on("request", request => {
    const url = request.url();
    if (url.includes("amazonaws.com") && url.includes("thumbnail")) {
      lastS3Url = url;
    }
  });

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  try {
    for (let i = startIndex; i < endIndex; i++) {
      const entry = validEntries[i];
      const docId = `navarra_${entry.id}`;
      const destPath = path.join(OUT_DIR, `${docId}.jpg`);

      process.stdout.write(`[${i + 1}/${validEntries.length}] Photo ${docId}... `);

      if (downloadedSet.has(docId) || (fs.existsSync(destPath) && fs.statSync(destPath).size > 100)) {
        console.log("SKIPPED (already downloaded)");
        downloadedSet.add(docId);
        skipCount++;
        continue;
      }

      if (noCopySet.has(docId)) {
        console.log("SKIPPED (cached: no digital copy)");
        skipCount++;
        continue;
      }

      // Reset S3 URL tracker
      lastS3Url = null;

      try {
        // Search portal (Navarra Archivo Abierto)
        await page.goto("https://navarra.archivoabierto.es/portalArchivo/seleccionopac?action=inicio&OP=OP999&usr=consulta&PT=PT000001", { 
          waitUntil: "networkidle",
          timeout: 25000 
        });

        // Search by title or reference
        const cleanTitle = entry.title!.replace(/[.\/]/g, " ").trim();
        await page.fill("#valx", cleanTitle);
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle", timeout: 20000 }),
          page.keyboard.press("Enter")
        ]);

        await page.waitForTimeout(1500);

        // Find .doc-attachment background image
        const bgUrl = await page.$eval(".doc-attachment", (el: any) => {
          const m = el.style.backgroundImage.match(/url\(["\x27]?([^"\x27\)]+)["\x27]?\)/);
          return m ? m[1] : null;
        }).catch(() => null);

        const targetUrl = bgUrl || lastS3Url;

        if (targetUrl) {
          const imgResponse = await page.request.get(targetUrl);
          if (imgResponse.ok()) {
            const buffer = await imgResponse.body();
            fs.writeFileSync(destPath, buffer);
            console.log(`DESCARGADA (${(buffer.length / 1024).toFixed(0)} KB)`);
            downloadedSet.add(docId);
            successCount++;
            saveCache({ downloaded: [...downloadedSet], noCopy: [...noCopySet] });
          } else {
            console.log("ERROR en descarga S3");
            failCount++;
          }
        } else {
          console.log("SIN COPIA DIGITAL O NO ENCONTRADA");
          noCopySet.add(docId);
          failCount++;
          saveCache({ downloaded: [...downloadedSet], noCopy: [...noCopySet] });
        }
      } catch (err: any) {
        console.log(`ERROR (${err.message})`);
        failCount++;
      }

      // Be nice to the server
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (globalErr: any) {
    console.error("\nGlobal execution error:", globalErr.message);
  } finally {
    await browser.close();
    console.log("\nDownload session summary:");
    console.log(`- Successfully downloaded: ${successCount}`);
    console.log(`- Already existing: ${skipCount}`);
    console.log(`- Failed/Not found: ${failCount}`);
    console.log(`Images are saved in: ${OUT_DIR}`);
    console.log("\nNext step: rebuild and upload dist/ to Hostinger, then update Firestore URLs.");
  }
}

run().catch(console.error);
