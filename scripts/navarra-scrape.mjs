// navarra-scrape.mjs — scraper del Archivo Abierto de Navarra (Fototeca, búsqueda "estella")
// Sin login, sin browser: HTML servido por servidor + fetch nativo de Node.
// Ejecutar con: node "$(pwd)/navarra-scrape.mjs"

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../navarra-import");
const DOCS_FILE = path.join(OUT_DIR, "documents.json");

const BASE = "https://www.navarra.es";
const SEARCH_BASE = BASE + "/home_es/Temas/Turismo+ocio+y+cultura/Archivos/Programas/Archivo+Abierto/Buscador/?Ambito=FOTOTECA&TextoLibre=estella&Pagina=";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DELAY_MS = 350;
const MAX_PAGES = 60;

function loadJson(file, fallback) {
  if (fs.existsSync(file)) { try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch {} }
  return fallback;
}
function saveJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return await res.text();
}

function decodeEntities(s) {
  return s
    .replace(/&aacute;/g, "á").replace(/&eacute;/g, "é").replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó").replace(/&uacute;/g, "ú").replace(/&ntilde;/g, "ñ")
    .replace(/&Aacute;/g, "Á").replace(/&Eacute;/g, "É").replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó").replace(/&Uacute;/g, "Ú").replace(/&Ntilde;/g, "Ñ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&iexcl;/g, "¡").replace(/&iquest;/g, "¿")
    .replace(/&aelig;/gi, "æ");
}

function clean(s) {
  return decodeEntities((s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

// --- Página de resultados: extraer enlaces a fichas de documento ---
function extractDocLinks(html) {
  const links = new Set();
  const re = /href="([^"]*\/Archivo\+Abierto\/Documentos\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    let href = m[1];
    if (!href.startsWith("http")) href = BASE + href;
    links.add(href.replace(/&amp;/g, "&"));
  }
  return [...links];
}

// --- Ficha de documento: extraer metadatos ---
function extractDoc(html, url) {
  const doc = { url };

  // Campos simples: <li class="x"><span class="etiqueta">Label:</span><span class="entrada">VALUE</span></li>
  const simpleRe = /<li(?:\s+class="[\w-]*")?>\s*<span class="etiqueta">\s*([^<]+?)\s*<\/span>\s*<span class="entrada">([\s\S]*?)<\/span>\s*<\/li>/g;
  let m;
  while ((m = simpleRe.exec(html))) {
    const label = clean(m[1]).replace(/:$/, "").toLowerCase();
    const value = clean(m[2]);
    if (label.includes("título")) doc.title = value;
    else if (label.includes("serie")) doc.series = value;
    else if (label.includes("productor")) doc.producer = value;
    else if (label.includes("fecha")) doc.dateRaw = value;
    else if (label.includes("nota")) doc.notes = value;
    else if (label.includes("referencia")) doc.reference = value;
  }

  // Campos con lista anidada: Lugar, Características -> <ul class="derecha"><li><span class="entrada">..</span></li>...</ul>
  const nestedRe = /<li>\s*<span class="etiqueta">\s*([^<]+?)\s*<\/span>\s*<ul class="derecha">([\s\S]*?)<\/ul>\s*<\/li>/g;
  while ((m = nestedRe.exec(html))) {
    const label = clean(m[1]).replace(/:$/, "").toLowerCase();
    const entries = [...m[2].matchAll(/<span class="entrada">([\s\S]*?)<\/span>/g)].map(e => clean(e[1])).filter(Boolean);
    if (label.includes("lugar")) doc.place = entries.join(" / ");
    else if (label.includes("caracter")) doc.characteristics = entries.join(" / ");
  }

  // Licencia (puede contener html con enlace CC)
  const licMatch = html.match(/<li class="licencia">[\s\S]*?<span class="entrada">([\s\S]*?)<\/span>\s*<\/li>/);
  if (licMatch) {
    const txt = licMatch[1];
    const ccMatch = txt.match(/licencias\/([\w-]+)\/([\d.]+)/);
    doc.license = ccMatch ? `CC ${ccMatch[1].toUpperCase()} ${ccMatch[2]}` : clean(txt).slice(0, 200);
  }

  // Enlace de descarga: dentro de "Documentos descargables"
  const dlIdx = html.search(/Documentos descargables/i);
  if (dlIdx !== -1) {
    const section = html.slice(dlIdx, dlIdx + 3000);
    const a = section.match(/<a[^>]*href="([^"]*Descargar\.ashx[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (a) {
      let href = a[1].replace(/&amp;/g, "&");
      if (!href.startsWith("http")) href = BASE + href;
      doc.imageUrl = href;
      doc.imageName = clean(a[2]);
    }
  }

  // Año: primer número de 4 cifras en dateRaw
  if (doc.dateRaw) {
    const ym = doc.dateRaw.match(/(1[5-9]\d{2}|20[0-2]\d)/);
    if (ym) doc.year = parseInt(ym[1], 10);
  }

  // id: usar la referencia archivística (limpia) o el nombre de imagen, o el slug de la URL
  const refClean = (doc.reference || doc.imageName || "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  const slug = url.split("/Documentos/")[1] || "";
  doc.id = refClean || slug.split("_").pop() || slug;

  return doc;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const documents = loadJson(DOCS_FILE, []);
  const known = new Map(documents.map(d => [d.url, d]));

  console.log(`\n══════════════════════════════════════`);
  console.log(` Documentos ya guardados: ${documents.length}`);
  console.log(`══════════════════════════════════════\n`);

  // 1) Recopilar enlaces a fichas, recorriendo páginas de resultados
  console.log("Recorriendo páginas de resultados...");
  const allLinks = new Set(documents.map(d => d.url));
  let page = 1;
  let emptyStreak = 0;
  while (page <= MAX_PAGES && emptyStreak < 2) {
    const url = SEARCH_BASE + page;
    process.stdout.write(`  Página ${page}... `);
    try {
      const html = await fetchHtml(url);
      const links = extractDocLinks(html);
      let added = 0;
      for (const l of links) { if (!allLinks.has(l)) { allLinks.add(l); added++; } }
      console.log(`${links.length} fichas (${added} nuevas)`);
      emptyStreak = links.length === 0 ? emptyStreak + 1 : 0;
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      emptyStreak++;
    }
    page++;
    await delay(DELAY_MS);
  }

  console.log(`\nTotal fichas únicas encontradas: ${allLinks.size}\n`);

  // 2) Visitar cada ficha y extraer metadatos
  const pending = [...allLinks].filter(u => !known.has(u) || !known.get(u).imageUrl);
  console.log(`Fichas pendientes de procesar: ${pending.length}\n`);

  let done = 0, errors = 0;
  for (let i = 0; i < pending.length; i++) {
    const url = pending[i];
    process.stdout.write(`[${i + 1}/${pending.length}] `);
    try {
      const html = await fetchHtml(url);
      const doc = extractDoc(html, url);
      console.log(`${doc.title || "(sin título)"} | ${doc.year || "?"} | ${doc.imageUrl ? "img ✓" : "sin imagen"}`);

      if (known.has(url)) {
        Object.assign(known.get(url), doc);
      } else {
        documents.push(doc);
        known.set(url, doc);
      }
      done++;
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      errors++;
    }

    if ((i + 1) % 20 === 0) saveJson(DOCS_FILE, documents);
    await delay(DELAY_MS);
  }

  saveJson(DOCS_FILE, documents);

  console.log(`\n══════════════════════════════════════`);
  console.log(` Procesadas en esta sesión: ${done}`);
  console.log(` Errores:                   ${errors}`);
  console.log(` Total documentos guardados:${documents.length}`);
  console.log(`══════════════════════════════════════`);
  console.log(`\nGuardado en: ${DOCS_FILE}\n`);
}

main().catch(console.error);
