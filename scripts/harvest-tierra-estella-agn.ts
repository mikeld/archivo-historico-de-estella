/**
 * scripts/harvest-tierra-estella-agn.ts
 * 
 * Cosechador automático de la Fototeca del Archivo General de Navarra (AGN)
 * especializado en los municipios de Tierra Estella:
 * Viana, Lodosa, San Adrián, Los Arcos, Lerín, Améscoa, Mendavia, Andosilla,
 * Sesma, Allo, Dicastillo, Villatuerta, Montejurra, Irache, etc.
 * 
 * 1. Busca en la Fototeca de Navarra.
 * 2. Pagina automáticamente todos los resultados.
 * 3. Descarga la imagen histórica original a public/navarra-photos/
 * 4. Guarda metadatos limpios en navarra-import/documents.json
 * 
 * Uso: npx tsx scripts/harvest-tierra-estella-agn.ts [--town=Viana] [--limit=100]
 */

import { chromium, Page } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PHOTOS_DIR = path.join(ROOT, "public/navarra-photos");
const DOCS_FILE = path.join(ROOT, "navarra-import/documents.json");
const PHOTOS_JSON_FILE = path.join(ROOT, "public/data/photos.json");

if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
const docsDir = path.dirname(DOCS_FILE);
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

// Cargar documentos existentes para no duplicar
let existingDocs: any[] = [];
if (fs.existsSync(DOCS_FILE)) {
  try {
    existingDocs = JSON.parse(fs.readFileSync(DOCS_FILE, "utf8"));
  } catch {
    existingDocs = [];
  }
}
const seenDocIds = new Set(existingDocs.map((d: any) => d.id));

// Cargar catálogo actual de fotos.json
let currentPhotos: any[] = [];
if (fs.existsSync(PHOTOS_JSON_FILE)) {
  try {
    currentPhotos = JSON.parse(fs.readFileSync(PHOTOS_JSON_FILE, "utf8"));
  } catch {
    currentPhotos = [];
  }
}
currentPhotos.forEach((p: any) => {
  seenDocIds.add(p.id.replace(/^navarra_/, ""));
  seenDocIds.add(p.id);
});

// Pueblos objetivo de Tierra Estella
const DEFAULT_TOWNS = [
  "Viana",
  "Lodosa",
  "San Adrián",
  "Los Arcos",
  "Lerín",
  "Améscoa",
  "Mendavia",
  "Andosilla",
  "Sesma",
  "Allo",
  "Dicastillo",
  "Villatuerta",
  "Montejurra",
  "Irache"
];

// Analizar argumentos CLI
const args = process.argv.slice(2);
let townsToScrape = DEFAULT_TOWNS;
const townArg = args.find((a) => a.startsWith("--town="));
if (townArg) {
  townsToScrape = [townArg.replace("--town=", "").trim()];
}

const limitArg = args.find((a) => a.startsWith("--limit="));
const maxPerTown = limitArg ? parseInt(limitArg.replace("--limit=", ""), 10) : 500;

function parseYear(title: string): number | null {
  // Buscar 4 dígitos entre 1850 y 1999
  const m = title.match(/\b(18[5-9]\d|19[0-9]\d)\b/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function extractSignatura(url: string, numInf: string): string {
  // Ejemplo: .../R01863094/DFN_IMG2531_jpg_thumbnail.jpg?...
  const match = url.match(/\/R\d+\/([A-Za-z0-9_]+?)(?:_jpg_thumbnail|\.jpg)/i);
  if (match && match[1]) {
    return match[1];
  }
  return `FOT_${numInf}`;
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return false;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 1000) return false; // Imagen corrupta o placeholder
    fs.writeFileSync(destPath, buffer);
    return true;
  } catch (err) {
    return false;
  }
}

async function scrapeTown(page: Page, town: string) {
  console.log(`\n════════════════════════════════════════════════════════════`);
  console.log(` 🔍 COSECHANDO: ${town.toUpperCase()} (Tierra Estella)`);
  console.log(`════════════════════════════════════════════════════════════`);

  // Ir a inicio y seleccionar Fototeca
  await page.goto("https://navarra.archivoabierto.es/portalArchivo/seleccionopac?action=inicio&OP=OP999&usr=consulta&PT=PT000001", {
    waitUntil: "networkidle",
    timeout: 30000
  });

  const cookieBtn = await page.$("button:has-text('Aceptar todas')").catch(() => null);
  if (cookieBtn) await cookieBtn.click();

  const fototecaLink = await page.locator("a:has-text('Fototeca de Navarra')").first();
  if (await fototecaLink.isVisible()) {
    await fototecaLink.click();
    await page.waitForTimeout(1000);
  }

  // Escribir búsqueda
  await page.fill("#valx", town);
  const searchBtn = page.locator("button:has-text('Buscar')").first();
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 25000 }).catch(() => {}),
    searchBtn.click(),
  ]);

  await page.waitForTimeout(2000);

  let pageNum = 1;
  let townDownloaded = 0;
  let hasNext = true;
  let prevPageSignature = "";

  while (hasNext && townDownloaded < maxPerTown) {
    console.log(`\n📄 [${town}] Procesando Página ${pageNum}...`);

    // Extraer resultados del scope Angular
    const pageResults = await page.evaluate(() => {
      const el = document.querySelector(".results-element");
      if (!el || !(window as any).angular) return [];
      const scope = (window as any).angular.element(el).scope();
      if (!scope || !scope.resultados) return [];

      return scope.resultados.map((r: any) => ({
        numInf: r.numInf,
        txtFichero: r.txtFichero,
        ficheroUrl: r.ficheroUrl,
        title: r.datos?.[2]?.[0]?.trim() || "",
        format: r.formato
      }));
    });

    if (!pageResults || pageResults.length === 0) {
      console.log(`   ℹ️ No hay más resultados para ${town}.`);
      break;
    }

    const currentSignature = pageResults.map((r: any) => r.numInf).join(",");
    if (currentSignature === prevPageSignature) {
      console.log(`   🏁 Fin alcanzado (página idéntica a la anterior).`);
      break;
    }
    prevPageSignature = currentSignature;

    console.log(`   ✨ Encontrados ${pageResults.length} registros en esta página.`);

    for (const r of pageResults) {
      if (townDownloaded >= maxPerTown) break;
      if (!r.ficheroUrl || !r.ficheroUrl.startsWith("http")) continue;

      const signatura = extractSignatura(r.ficheroUrl, r.numInf);
      const docId = `ES_NA_AGN_${signatura}`;
      const fileTarget = `navarra_${docId}.jpg`;
      const fullDestPath = path.join(PHOTOS_DIR, fileTarget);

      if (seenDocIds.has(docId) && fs.existsSync(fullDestPath)) {
        process.stdout.write(`   ⏭️ Ya existe: ${docId}\n`);
        continue;
      }

      const year = parseYear(r.title);
      process.stdout.write(`   ⬇️ Descargando [${signatura}] ${r.title.slice(0, 45)}... `);

      const ok = await downloadImage(r.ficheroUrl, fullDestPath);
      if (!ok) {
        console.log(`❌ Error al descargar`);
        continue;
      }

      console.log(`✅ OK (${(fs.statSync(fullDestPath).size / 1024).toFixed(1)} KB)`);

      // Crear entrada en documents.json
      const docEntry = {
        url: "https://navarra.archivoabierto.es/portalArchivo/seleccionopac",
        title: r.title,
        series: "Fototeca de Navarra",
        producer: "Archivo General de Navarra",
        dateRaw: year ? String(year) : "",
        notes: `Fondo Fototeca de Navarra (${town}). Signatura oficial: ${signatura}`,
        reference: `ES/NA/AGN/${signatura}`,
        place: `${town.toUpperCase()} - NAVARRA - ESPAÑA`,
        characteristics: "Fotografía histórica - Fondo AGN",
        license: "Archivo General de Navarra - Fototeca de Navarra",
        imageUrl: r.ficheroUrl,
        imageName: signatura,
        year: year,
        id: docId
      };

      existingDocs.push(docEntry);
      seenDocIds.add(docId);
      townDownloaded++;
    }

    // Guardar documents.json incrementalmente
    fs.writeFileSync(DOCS_FILE, JSON.stringify(existingDocs, null, 2), "utf8");

    // Verificar si hay botón "Posterior"
    const canGoNext = await page.evaluate(() => {
      const nextBtn = Array.from(document.querySelectorAll("a")).find(
        (a) => a.innerText.trim() === "Posterior"
      );
      if (nextBtn) {
        nextBtn.click();
        return true;
      }
      return false;
    });

    if (!canGoNext) {
      console.log(`   🏁 Fin de páginas para ${town}.`);
      hasNext = false;
    } else {
      pageNum++;
      await page.waitForTimeout(2500);
    }
  }

  console.log(`\n🎉 [${town}] Completado: ${townDownloaded} nuevas fotos cosechadas.`);
}

async function run() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  🏛️ ARCHIVO HISTÓRICO - COSECHADOR DE TIERRA ESTELLA (AGN)║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  for (const town of townsToScrape) {
    try {
      await scrapeTown(page, town);
    } catch (err) {
      console.error(`❌ Error al cosechar ${town}:`, err);
    }
  }

  await browser.close();
  console.log("\n============================================================");
  console.log(`✅ PROCESO COMPLETADO. Total documentos en archivo: ${existingDocs.length}`);
  console.log("============================================================\n");
}

run().catch(console.error);
