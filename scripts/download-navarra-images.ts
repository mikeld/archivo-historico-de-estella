import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(PROJECT_ROOT, "public/navarra-photos");
const JSON_FILE = path.join(PROJECT_ROOT, "navarra-import/documents.json");

interface DocumentEntry {
  id: string;
  title?: string;
  reference?: string;
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
  console.log(`Loaded ${validEntries.length} photo entries from the local JSON.`);

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
    for (let i = 0; i < validEntries.length; i++) {
      const entry = validEntries[i];
      const docId = `navarra_${entry.id}`;
      const destPath = path.join(OUT_DIR, `${docId}.jpg`);

      process.stdout.write(`[${i + 1}/${validEntries.length}] Photo ${docId}... `);

      if (fs.existsSync(destPath) && fs.statSync(destPath).size > 100) {
        console.log("SKIPPED (already downloaded)");
        skipCount++;
        continue;
      }

      // Reset S3 URL tracker
      lastS3Url = null;

      try {
        // Go to search portal page (resets filters and modals)
        await page.goto("https://a3w-navarra.odilo.es/portalArchivo/controladorconopac?usr=null", { 
          waitUntil: "networkidle",
          timeout: 20000 
        });

        // Find search input
        const searchInput = page.locator('input[type="text"]').first();
        await searchInput.waitFor({ state: "visible", timeout: 5000 });
        
        // Search by title (titles are clean and yield correct records in the new portal)
        const cleanTitle = entry.title!.replace(/[.\/]/g, " ").trim();
        await searchInput.fill(cleanTitle);
        await page.keyboard.press("Enter");

        // Wait for results or empty modal to load
        // S3 urls are requested immediately when results render in the table
        await Promise.race([
          page.waitForResponse(resp => resp.url().includes("amazonaws.com") && resp.url().includes("thumbnail"), { timeout: 8000 }).catch(() => {}),
          page.waitForSelector('.modal-body:has-text("No hay resultados")', { timeout: 8000 }).catch(() => {}),
          page.waitForTimeout(6000)
        ]);

        if (lastS3Url) {
          // Download directly from the S3 signed URL (S3 doesn't block hotlinking/curl)
          const imgResponse = await page.request.get(lastS3Url);
          if (imgResponse.ok()) {
            const buffer = await imgResponse.body();
            fs.writeFileSync(destPath, buffer);
            console.log(`DOWNLOADED (${(buffer.length / 1024).toFixed(0)} KB)`);
            successCount++;
          } else {
            console.log("FAILED to download from S3");
            failCount++;
          }
        } else {
          console.log("NOT FOUND (No digital copy or not matching title)");
          failCount++;
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
