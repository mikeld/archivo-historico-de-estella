// catalogo.mjs — JavaScript puro, sin TypeScript, sin tsx
// Ejecutar con: node scripts/catalogo.mjs

import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cargar .env
const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach(line => {
    const [k, ...rest] = line.split("=");
    const v = rest.join("=").trim().replace(/^"|"$/g, "");
    if (k?.trim() && v && !process.env[k.trim()]) process.env[k.trim()] = v;
  });
}

const IMPORT_DIR     = path.join(__dirname, "../facebook-import");
const RAW_FILE       = path.join(IMPORT_DIR, "raw-posts.json");
const CATALOGED_FILE = path.join(IMPORT_DIR, "cataloged-posts.json");
const SKIPPED_FILE   = path.join(IMPORT_DIR, "skipped-posts.json");
const IMAGES_DIR     = path.join(IMPORT_DIR, "images");

const MAX_YEAR       = 1995;
const MIN_IMAGE_SIZE = 10240;
const MIN_CONFIDENCE = 0.4;
const DELAY_MS       = 400;
const MAX_PER_TAG    = 15;

const KNOWN_ZONES = "Plaza de los Fueros, Calle Mayor, Barrio de San Nicolas, Barrio de San Martin, Iglesia de San Pedro de la Rua, Basilica de Nuestra Senora del Puy, Palacio de los Reyes de Navarra, Plaza de Santiago, Rio Ega, Portal de Castilla, Estacion de tren, Mercado, Ayuntamiento";

function loadJson(file, fallback) {
  if (fs.existsSync(file)) { try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch(e) {} }
  return fallback;
}
function saveJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function getValidImages(localImages) {
  return (localImages || [])
    .map(img => path.join(IMAGES_DIR, img))
    .filter(p => fs.existsSync(p) && fs.statSync(p).size > MIN_IMAGE_SIZE);
}

const MODERN_KEYWORDS = ["buenos días","buenas tardes","buenas noches","whatsapp","instagram","tiktok","precio","venta","oferta","covid","pandemia","elecciones","streaming"];
const HISTORICAL_HINTS = ["año","años","década","siglo","antiguo","antigua","histórico","recuerdo","nostalgia","archivo","colección","fotografía","foto de","postal","blanco y negro","1900","1910","1920","1930","1940","1950","1960","1970","1980","1990"];

function preFilter(text) {
  if (!text || text.length < 10) return "maybe";
  const lower = text.toLowerCase();
  if (HISTORICAL_HINTS.some(h => lower.includes(h))) return "likely";
  if (MODERN_KEYWORDS.some(k => lower.includes(k))) return "skip";
  return "maybe";
}

async function analyzeImage(imagePath, postText, ai) {
  const imageData = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const filename = path.basename(imagePath);

  const prompt = `Eres un archivero especializado en historia de Estella-Lizarra (Navarra, España).
Texto del post: """${(postText||"").slice(0,500)}"""

ACEPTA: fotos B&N (alta prioridad), calles/plazas/edificios antiguos de Estella, documentos historicos, postales.
RECHAZA: fotos actuales, fuegos artificiales, memes, fotos posteriores a ${MAX_YEAR}.

Responde SOLO con JSON valido sin markdown:
{
  "isHistorical": true/false,
  "contentType": "photo_bw|photo_color_old|photo_color_recent|document|postcard|fireworks|other",
  "skipReason": "motivo si false, sino null",
  "title": "titulo descriptivo max 10 palabras",
  "description": "descripcion detallada de lo que se ve en la foto",
  "year": numero o null,
  "yearRange": "XXXX-XXXX" o null,
  "yearMax": numero obligatorio,
  "location": "zona de Estella o cadena vacia",
  "tags": ["tag1","tag2"],
  "keywords": ["palabra1","palabra2"],
  "confidence": 0.0 a 1.0
}
Zonas conocidas: ${KNOWN_ZONES}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [
      { inlineData: { mimeType, data: imageData.toString("base64") } },
      { text: prompt }
    ]}],
    config: { temperature: 0.1, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } }
  });

  let text = (response.text || "").trim()
    .replace(/^```json[\r\n]*/i, "").replace(/^```[\r\n]*/i, "").replace(/```[\s]*$/, "").trim();

  let parsed;
  try { parsed = JSON.parse(text); }
  catch {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s !== -1 && e > s) parsed = JSON.parse(text.slice(s, e+1));
    else throw new Error("JSON invalido: " + text.slice(0, 80));
  }

  if (parsed.contentType === "fireworks") {
    parsed.isHistorical = false;
    parsed.skipReason = "Fuegos artificiales";
  }

  return { ...parsed, localImage: filename };
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error("Falta GEMINI_API_KEY en .env"); process.exit(1); }

  const ai = new GoogleGenAI({ apiKey });
  const rawPosts = loadJson(RAW_FILE, []);
  const cataloged = loadJson(CATALOGED_FILE, []);
  const skipped   = loadJson(SKIPPED_FILE, []);

  const processedIds = new Set([...cataloged.map(c => c.id), ...skipped.map(s => s.id)]);
  const pending = rawPosts.filter(p => !processedIds.has(p.id));

  console.log(`\n═══════════════════════════════════════`);
  console.log(` Total posts:      ${rawPosts.length}`);
  console.log(` Ya aceptados:     ${cataloged.length}`);
  console.log(` Ya descartados:   ${skipped.length}`);
  console.log(` Pendientes:       ${pending.length}`);
  console.log(`═══════════════════════════════════════\n`);

  if (pending.length === 0) { console.log("Todo catalogado."); return; }

  let accepted = 0, skippedCount = 0, errors = 0;
  const tagCount = {};

  for (let i = 0; i < pending.length; i++) {
    const post = pending[i];
    const author = post.facebookAuthor || post.author || "desconocido";
    console.log(`\n[${i+1}/${pending.length}] ${author}`);
    console.log(`  Texto: ${(post.postText||"(sin texto)").slice(0,70).replace(/\n/g," ")}`);

    const verdict = preFilter(post.postText);
    if (verdict === "skip") {
      skipped.push({ id: post.id, reason: "Pre-filtro: moderno", postText: post.postText });
      saveJson(SKIPPED_FILE, skipped);
      skippedCount++;
      continue;
    }
    if (verdict === "likely") console.log(`  ✨ Pinta a historico`);

    const validImages = getValidImages(post.localImages);
    if (validImages.length === 0) {
      skipped.push({ id: post.id, reason: "Sin imagen valida", postText: post.postText });
      saveJson(SKIPPED_FILE, skipped);
      skippedCount++;
      continue;
    }

    console.log(`  Imagenes a analizar: ${validImages.length}`);
    const acceptedImages = [];

    for (const imagePath of validImages) {
      process.stdout.write(`    → ${path.basename(imagePath)}... `);
      let retries = 0;
      while (retries < 3) {
        try {
          const result = await analyzeImage(imagePath, post.postText, ai);
          if (!result.isHistorical) { console.log(`DESCARTADA (${result.skipReason||"no historica"})`); break; }
          if ((result.yearMax || result.year || 0) > MAX_YEAR) { console.log(`DESCARTADA (>1995)`); break; }
          if ((result.confidence || 0) < MIN_CONFIDENCE) { console.log(`DESCARTADA (confianza baja)`); break; }
          const tag = (result.tags||[])[0] || "general";
          tagCount[tag] = (tagCount[tag]||0) + 1;
          if (tagCount[tag] > MAX_PER_TAG) { console.log(`DESCARTADA (repeticion: ${tag})`); break; }
          acceptedImages.push(result);
          const icon = result.contentType === "photo_bw" ? "⬛" : result.contentType === "document" ? "📄" : "🟫";
          console.log(`✅ ${icon} "${result.title}" | ${result.year||result.yearRange||"?"} | conf:${(result.confidence||0).toFixed(2)}`);
          break;
        } catch(e) {
          if (e.message && (e.message.includes("429") || e.message.includes("RESOURCE_EXHAUSTED"))) {
            retries++;
            console.log(`\n  Rate limit. Espera ${30*retries}s...`);
            await delay(30000 * retries);
          } else {
            console.log(`ERROR: ${(e.message||"").slice(0,80)}`);
            errors++;
            break;
          }
        }
      }
      await delay(DELAY_MS);
    }

    if (acceptedImages.length === 0) {
      skipped.push({ id: post.id, reason: "Ninguna imagen historica", postText: post.postText });
      saveJson(SKIPPED_FILE, skipped);
      skippedCount++;
      continue;
    }

    cataloged.push({
      id: post.id,
      postText: post.postText,
      postUrl: post.postUrl,
      facebookAuthor: author,
      facebookAuthorUrl: post.facebookAuthorUrl || "",
      facebookComments: post.facebookComments || [],
      facebookDate: post.dateRaw || "",
      photographerSource: "unknown",
      images: acceptedImages,
      processed: false,
    });
    saveJson(CATALOGED_FILE, cataloged);
    accepted++;
    console.log(`  Guardado: ${acceptedImages.length} imagen(es) historica(s)`);
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(` Aceptados esta sesion: ${accepted}`);
  console.log(` Descartados:          ${skippedCount}`);
  console.log(` Errores:              ${errors}`);
  console.log(` Total historicos:     ${cataloged.length}`);
  console.log(`═══════════════════════════════════════\n`);
}

main().catch(console.error);
