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
  console.log("Starting targeted AGN photographic fond downloader...");

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const entries: DocumentEntry[] = JSON.parse(fs.readFileSync(JSON_FILE, "utf8"));
  const cache = loadCache();
  const noCopySet = new Set(cache.noCopy.map(id => id.replace(/^navarra_/, "")));
  const downloadedSet = new Set(cache.downloaded.map(id => id.replace(/^navarra_/, "")));

  // Target ONLY photographic fonds, omitting administrative files (DFN, MIR)
  const targets = entries.filter(d => 
    !d.id.includes("F001_DFN") && 
    !d.id.includes("F001_MIR") &&
    !noCopySet.has(d.id) &&
    !downloadedSet.has(d.id) &&
    !fs.existsSync(path.join(OUT_DIR, `navarra_${d.id}.jpg`))
  );

  console.log(`Found ${targets.length} pending photographic records to download.`);
  if (targets.length === 0) {
    console.log("No pending photographic records found!");
    return;
  }

  const limitArg = process.argv.find(a => a.startsWith("--limit="))?.split("=")[1];
  const limit = limitArg ? parseInt(limitArg, 10) : targets.length;
  const batch = targets.slice(0, limit);

  console.log(`Launching headless browser for batch of ${batch.length} photos...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "es-ES",
  });
  const page = await context.newPage();

  let lastS3Url: string | null = null;
  page.on("request", request => {
    const url = request.url();
    if (url.includes("amazonaws.com") && url.includes("thumbnail")) {
      lastS3Url = url;
    }
  });

  let downloadedCount = 0;
  let noCopyCount = 0;

  for (let i = 0; i < batch.length; i++) {
    const entry = batch[i];
    const docId = `navarra_${entry.id}`;
    const destPath = path.join(OUT_DIR, `${docId}.jpg`);

    process.stdout.write(`[${i + 1}/${batch.length}] (${entry.id}) "${entry.title?.slice(0, 35)}"... `);

    lastS3Url = null;

    try {
      await page.goto("https://navarra.archivoabierto.es/portalArchivo/seleccionopac?action=inicio&OP=OP999&usr=consulta&PT=PT000001", {
        waitUntil: "networkidle",
        timeout: 25000,
      });

      // Search by clean title or reference
      const cleanTitle = (entry.title || "").replace(/[.\/]/g, " ").trim();
      await page.fill("#valx", cleanTitle);
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 20000 }),
        page.keyboard.press("Enter"),
      ]);

      await page.waitForTimeout(1500);

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
          console.log(`OK (${(buffer.length / 1024).toFixed(0)} KB)`);
          downloadedSet.add(entry.id);
          cache.downloaded.push(docId);
          downloadedCount++;
        } else {
          console.log("FAIL (HTTP error)");
        }
      } else {
        console.log("NO DIGITAL COPY");
        noCopySet.add(entry.id);
        cache.noCopy.push(docId);
        noCopyCount++;
      }
      saveCache(cache);
    } catch (err: any) {
      console.log(`ERROR (${err.message})`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  await browser.close();
  console.log(`\nBatch finished: ${downloadedCount} downloaded, ${noCopyCount} marked without copy.`);
}

run().catch(console.error);
