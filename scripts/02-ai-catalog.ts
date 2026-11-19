/**
 * 02-ai-catalog.ts  v4
 *
 * Usa Gemini Vision para catalogar las fotos históricas scrapeadas.
 * - Analiza TODAS las imágenes válidas de cada post (no solo la primera)
 * - Extrae el fotógrafo/autor del texto del post con patrones regex
 * - Genera estructura images[] con una entrada por imagen histórica aceptada
 * - Guarda quién subió el post (facebookAuthor) y el autor real (photographer)
 *
 * Uso: npx tsx scripts/02-ai-catalog.ts
 */

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

// ─── Configuración ────────────────────────────────────────────────────────────
const townArg = process.argv.find(a => a.startsWith("--town="))?.split("=")[1] || "estella-lizarra";
const townSources = JSON.parse(fs.readFileSync(path.join(__dirname, "town-sources.json"), "utf8"));
const currentTown = townSources[townArg] || townSources["estella-lizarra"];

const IMPORT_DIR      = fs.existsSync(path.join(__dirname, `../facebook-import/${townArg}`))
  ? path.join(__dirname, `../facebook-import/${townArg}`)
  : path.join(__dirname, "../facebook-import");
const RAW_FILE        = path.join(IMPORT_DIR, "raw-posts.json");
const CATALOGED_FILE  = path.join(IMPORT_DIR, "cataloged-posts.json");
const SKIPPED_FILE    = path.join(IMPORT_DIR, "skipped-posts.json");
const IMAGES_DIR      = path.join(IMPORT_DIR, "images");

const MAX_YEAR        = 1995;      // fotos más modernas que esto se descartan
const MIN_IMAGE_SIZE  = 10240;     // 10 KB mínimo (evita píxeles de tracking)
const MIN_CONFIDENCE  = 0.4;       // umbral mínimo de confianza IA para aceptar
const GEMINI_DELAY_MS = 300;       // ms entre llamadas a Gemini (300ms es suficiente para Flash)
// ──────────────────────────────────────────────────────────────────────────────

const KNOWN_ZONES = [
  "Plaza de los Fueros", "Calle Mayor", "Barrio de San Nicolás",
  "Barrio de San Martín", "Barrio de San Miguel", "Calle de la Rúa",
  "Puente de la Cárcel", "Iglesia de San Pedro de la Rúa",
  "Iglesia del Santo Sepulcro", "Basílica de Nuestra Señora del Puy",
  "Palacio de los Reyes de Navarra", "Plaza de Santiago", "Río Ega",
  "Barrio Judío", "Portal de Castilla", "Estación de tren", "Mercado",
  "Ayuntamiento", "Las Eras", "Calle San Nicolás", "Calle Curtidores",
].join(", ");

// Patrones para extraer fotógrafo del texto del post
const PHOTOGRAPHER_PATTERNS = [
  /foto(?:grafía)?(?:\s+de)?:?\s+([A-ZÁÉÍÓÚÑ][^.\n,]{2,60})/i,
  /fotógrafo:?\s+([A-ZÁÉÍÓÚÑ][^.\n,]{2,60})/i,
  /autor(?:a)?:?\s+([A-ZÁÉÍÓÚÑ][^.\n,]{2,60})/i,
  /cedida?\s+por:?\s+([A-ZÁÉÍÓÚÑ][^.\n,]{2,60})/i,
  /archivo(?:\s+de)?:?\s+([A-ZÁÉÍÓÚÑ][^.\n,]{2,60})/i,
  /colecci[oó]n(?:\s+de)?:?\s+([A-ZÁÉÍÓÚÑ][^.\n,]{2,60})/i,
  /©\s*([A-ZÁÉÍÓÚÑ][^.\n,]{2,60})/i,
  /propiedad(?:\s+de)?:?\s+([A-ZÁÉÍÓÚÑ][^.\n,]{2,60})/i,
  /\bpor\b\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/,
];

function extractPhotographerFromText(text: string): string | null {
  if (!text) return null;
  for (const pattern of PHOTOGRAPHER_PATTERNS) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const name = m[1].trim().replace(/[.,;:]+$/, "");
      if (name.length >= 3 && name.length <= 80) return name;
    }
  }
  return null;
}

// ─── Pre-filtro de texto (sin coste de IA) ───────────────────────────────────
// Palabras que indican claramente que NO es una foto histórica
const MODERN_KEYWORDS = [
  // Saludos diarios (ambiguos como "hoy" o "ayer" los eliminamos para no descartar
  // posts como "hoy comparto esta foto antigua de 1950")
  "buenos días", "buenas tardes", "buenas noches",
  "whatsapp", "instagram", "tiktok", "twitter",
  "emoji", "gif", "meme", "viral",
  "precio", "venta", "oferta", "descuento", "alquiler",
  "liga", "partido", "gol", "clasificación",
  "covid", "pandemia", "vacuna",
  "elecciones", "votación", "streaming",
  "cumpleaños feliz", // solo si va junto, no "feliz inauguración"
];
// Palabras que sugieren que SÍ puede ser histórico (da prioridad)
const HISTORICAL_HINTS = [
  "año", "años", "década", "siglo", "antiguo", "antigua", "histórico",
  "recuerdo", "nostalgia", "archivo", "colección", "fotografía",
  "foto de", "imagen de", "postal", "blanco y negro",
  "inauguración", "fundación", "construcción",
  "1800", "1900", "1910", "1920", "1930", "1940", "1950", "1960", "1970", "1980", "1990",
];

function preFilterText(postText: string): "skip" | "maybe" | "likely" {
  if (!postText || postText.length < 10) return "maybe"; // sin texto → dejar que la IA decida
  const lower = postText.toLowerCase();
  if (HISTORICAL_HINTS.some(h => lower.includes(h))) return "likely";
  if (MODERN_KEYWORDS.some(k => lower.includes(k))) return "skip";
  return "maybe";
}
// ──────────────────────────────────────────────────────────────────────────────

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface RawPost {
  id: string; postText: string; dateRaw: string; dateUnix?: number;
  imageUrls: string[]; localImages: string[]; postUrl: string;
  // v3 campos (pueden no existir en posts scrapeados con v1)
  facebookAuthor?: string; facebookAuthorUrl?: string; facebookComments?: string[];
  // compatibilidad v1
  author?: string; authorProfileUrl?: string;
  scrapedAt?: string;
}

interface ImageCatalog {
  localImage: string;
  imageUrl?: string;
  title: string;
  description: string;
  year?: number;
  yearRange?: string;
  yearMax?: number;
  location: string;
  tags: string[];
  keywords: string[];          // palabras clave para búsqueda
  people?: string;             // descripción de personas visibles
  landmarks?: string[];        // edificios/monumentos reconocibles
  activities?: string;         // qué ocurre en la foto
  era?: string;                // época visual ("años 50", "principios siglo XX")
  confidence: number;
  isHistorical: boolean;
  contentType?: string;
  skipReason?: string;
  photographer?: string;
  photographerHint?: string;
}

interface CatalogEntry {
  id: string;
  postText: string;
  postUrl: string;
  facebookAuthor: string;      // quien subió el post a Facebook
  facebookAuthorUrl: string;
  facebookComments: string[];
  facebookDate: string;
  facebookDateUnix?: number;
  photographer?: string;       // autor real de la foto (si se identifica)
  photographerSource: "post_text" | "ai_guess" | "comment" | "unknown";
  images: ImageCatalog[];      // una entrada por imagen válida aceptada
  localImages?: string[];
  processed: boolean;          // false hasta que se importe a Firebase
  importedAt?: string;
}

interface SkippedEntry {
  id: string; reason: string; postText: string; localImages?: string[];
  facebookAuthor?: string;
}


// ─── Utilidades ───────────────────────────────────────────────────────────────
function loadJson<T>(file: string, fallback: T): T {
  if (fs.existsSync(file)) { try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch {} }
  return fallback;
}

function saveJson(file: string, data: unknown) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getValidImages(localImages: string[]): string[] {
  return localImages
    .map(img => path.join(IMAGES_DIR, img))
    .filter(p => fs.existsSync(p) && fs.statSync(p).size > MIN_IMAGE_SIZE);
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Llamada a Gemini ─────────────────────────────────────────────────────────
async function analyzeImage(
  imagePath: string,
  postText: string,
  facebookComments: string[],
  facebookAuthor: string,
  ai: GoogleGenAI,
): Promise<ImageCatalog> {
  const imageData = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = (ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";
  const filename = path.basename(imagePath);

  const commentsSnippet = (facebookComments || []).slice(0, 20).join("\n---\n");

  const prompt = `Eres un archivero e historiador experto especializado en Estella-Lizarra y Navarra (España).
Tu misión es seleccionar y documentar con MÁXIMO RIGOR fotografías con VALOR HISTÓRICO REAL para un archivo público.

Texto del post original de Facebook:
"""${postText?.slice(0, 1000) || "(sin texto)"}"""
Publicado por: ${facebookAuthor || "desconocido"}

Comentarios y testimonios orales de los vecinos en el grupo:
"""
${commentsSnippet || "(sin comentarios adicionales)"}
"""

━━ ACEPTA (isHistorical: true) ━━
✅ Fotos en blanco y negro → casi siempre históricas, alta prioridad
✅ Vistas de calles, plazas, edificios antiguos de Estella (aunque sean en color si son claramente antiguas)
✅ Grupos de personas en lugares reconocibles de Estella en épocas pasadas
✅ Documentos históricos, periódicos, postales, mapas, grabados antiguos de Estella
✅ Fotos de oficios tradicionales, mercados antiguos, fiestas históricas
✅ Imágenes aéreas o panorámicas antiguas de la ciudad
✅ Retratos de personas con indumentaria claramente antigua

━━ RECHAZA (isHistorical: false) ━━
❌ Fotos actuales o recientes (mercado de esta semana, eventos actuales)
❌ Fuegos artificiales, castillos de fuegos → no aportan valor histórico aunque sean antiguos
❌ Fotos nocturnas de fuegos/pirotecnia → descartar siempre
❌ Fotos de otras ciudades o lugares no identificables como Estella
❌ Memes, carteles publicitarios, logos, imágenes de redes sociales
❌ Fotos de muy mala calidad, completamente borrosas o ilegibles
❌ Capturas de pantalla, fotos de móvil de objetos sin interés histórico
❌ Reportajes actuales aunque hablen de historia (foto es moderna)
❌ Cualquier imagen posterior a ${MAX_YEAR}

━━ PUNTOS DE INTERÉS DEL MAPA (landmarkId) ━━
Asigna estrictamente uno de estos IDs solo si la foto muestra claramente ese lugar:
- "fueros": Plaza de los Fueros / Quiosco central / soportales
- "san_pedro": Iglesia de San Pedro de la Rúa / escalinata
- "trenico": Antigua Estación de ferrocarril / El Trenico / vías / andenes
- "llanos": Paseo de Los Llanos / Convento de San Benito
- "rio_ega": Río Ega / presa / orillas / crecidas
- "puy": Basílica de Ntra. Sra. del Puy
- "calle_mayor": Calle Mayor de Estella o Calle de la Rúa
- "reyes_navarra": Palacio de los Reyes de Navarra / Plaza San Martín
- "santiago": Plaza de Santiago
- "toros": Plaza de Toros
- "san_miguel": Iglesia de San Miguel
- "puente_carcel": Puente de la Cárcel (Puente Picudo)
- "sepulcro": Iglesia del Santo Sepulcro
- "inmaculada": Paseo de la Inmaculada
- null: Si es un retrato familiar, boda, interior, o calle/paraje no identificable con total seguridad. (NO ADIVINES).

Responde SOLO con JSON válido (sin markdown, sin texto extra):
{
  "isHistorical": true/false,
  "contentType": "photo_bw|photo_color_old|photo_color_recent|document|postcard|fireworks|other",
  "skipReason": "motivo breve si isHistorical=false, sino null",
  "title": "título conciso y formal en español (máx 10 palabras)",
  "description": "descripción detallada: qué se ve, contexto, edificios y testimonios (máx 250 palabras)",
  "year": número exacto o null,
  "yearRange": "XXXX-XXXX" o null,
  "yearMax": número (año máximo estimado),
  "decade": "1920s|1930s|1940s|1950s|1960s|1970s|1980s|1990s" o null,
  "location": "zona concreta de Estella, o vacío si no se identifica",
  "landmarkId": "fueros|san_pedro|trenico|llanos|rio_ega|puy|calle_mayor|reyes_navarra|santiago|toros|san_miguel|puente_carcel|sepulcro|inmaculada" o null,
  "tags": ["tag1", "tag2"],
  "keywords": ["palabra1", "palabra2"],
  "people": ["Nombre 1", "Nombre 2"],
  "landmarks": ["nombre del edificio reconocible"],
  "activities": "qué están haciendo las personas o qué evento muestra la foto",
  "era": "época visual estimada (ej: 'años 50')",
  "confidence": número de 0.0 a 1.0,
  "photographer": "nombre del fotógrafo o colección si se menciona en post o comentarios, sino null"
}

━━ SOBRE "keywords" ━━
Genera 10-15 palabras clave en español para búsqueda. Incluye:
- Nombres propios visibles (calles, plazas, iglesias, ríos)
- Oficios o profesiones visibles (herrero, lavandera, sacerdote, militar)
- Objetos característicos (carro de caballos, tranvía, toldo, farol)
- Eventos (inauguración, procesión, nevada, inundación, boda)
- Gentilicios y variantes (estellés, estellesa, navarro, navarra)
- Variantes en euskera si aplica (Lizarra, Nafarroa)

━━ CRITERIOS DE CONFIANZA ━━
1.0 = foto B&N clara de Estella con ubicación reconocible
0.8 = foto antigua identificable como Estella
0.6 = probablemente Estella y antigua pero algo dudoso
0.4 = posiblemente histórica pero incertidumbre alta
< 0.4 = no se puede determinar → pon isHistorical: false

Tags: plaza, calle, iglesia, mercado, fiestas, procesion, semana_santa, san_andres, carnaval, deporte, escuela, hospital, rio_ega, puente, tren, comercio, familia, retrato, aerea, inundacion, nevada, obras, militar, boda, documento, postal, panoramica, anos_10, anos_20, anos_30, anos_40, anos_50, anos_60, anos_70, anos_80, anos_90

Zonas: ${KNOWN_ZONES}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data: imageData.toString("base64") } },
        { text: prompt },
      ],
    }],
    config: { temperature: 0.1, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
  });

  let text = (response.text || "").trim()
    .replace(/^```json[\r\n]*/i, "").replace(/^```[\r\n]*/i, "").replace(/```[\s]*$/, "").trim();

  let parsed: any;
  try { parsed = JSON.parse(text); }
  catch {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s !== -1 && e > s) {
      const chunk = text.slice(s, e + 1).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
      try { parsed = JSON.parse(chunk); }
      catch { throw new Error("JSON inválido: " + text.slice(0, 100)); }
    } else throw new Error("Sin JSON en respuesta: " + text.slice(0, 100));
  }

  // Fuegos artificiales → rechazar siempre independientemente de lo que diga isHistorical
  if (parsed.contentType === "fireworks") {
    parsed.isHistorical = false;
    parsed.skipReason = parsed.skipReason || "Fuegos artificiales — sin valor histórico";
  }

  return {
    localImage: filename,
    title: parsed.title || "",
    description: parsed.description || "",
    year: parsed.year ?? undefined,
    yearRange: parsed.yearRange ?? undefined,
    yearMax: parsed.yearMax ?? undefined,
    location: parsed.location || "",
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    people: parsed.people ?? undefined,
    landmarks: Array.isArray(parsed.landmarks) ? parsed.landmarks : undefined,
    activities: parsed.activities ?? undefined,
    era: parsed.era ?? undefined,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    isHistorical: Boolean(parsed.isHistorical),
    contentType: parsed.contentType ?? undefined,
    skipReason: parsed.skipReason ?? undefined,
    photographer: parsed.photographer ?? undefined,
    photographerHint: parsed.photographerHint ?? undefined,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.error("❌ Falta GEMINI_API_KEY en .env\n   Obtén una en: https://aistudio.google.com/app/apikey");
    process.exit(1);
  }
  if (!fs.existsSync(RAW_FILE)) {
    console.error(`❌ No existe ${RAW_FILE}\n   Ejecuta primero 01-facebook-scraper.ts`);
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  const rawPosts = loadJson<RawPost[]>(RAW_FILE, []);
  const cataloged = loadJson<CatalogEntry[]>(CATALOGED_FILE, []);
  const skipped   = loadJson<SkippedEntry[]>(SKIPPED_FILE, []);

  const processedIds = new Set([...cataloged.map(c => c.id), ...skipped.map(s => s.id)]);
  const pending = rawPosts.filter(p => !processedIds.has(p.id));

  console.log(`\n═══════════════════════════════════════`);
  console.log(` Total posts: ${rawPosts.length}`);
  console.log(` Históricos aceptados: ${cataloged.length}`);
  console.log(` Descartados: ${skipped.length}`);
  console.log(` Pendientes de catalogar: ${pending.length}`);
  console.log(`═══════════════════════════════════════\n`);

  if (pending.length === 0) {
    console.log("✅ Todo ya está catalogado. Nada que hacer.");
    return;
  }

  let acceptedCount = 0;
  let skippedCount  = 0;
  let errorCount    = 0;

  // Anti-repetición: máximo N fotos aceptadas con el mismo tag dominante
  const MAX_PER_TAG = 15; // ej: máx 15 fotos de "fuegos", 15 de "mercado", etc.
  const tagCount: Record<string, number> = {};

  for (let i = 0; i < pending.length; i++) {
    const post = pending[i];
    const facebookAuthor    = post.facebookAuthor || post.author || "desconocido";
    const facebookAuthorUrl = post.facebookAuthorUrl || post.authorProfileUrl || "";
    const facebookComments  = post.facebookComments || [];

    console.log(`\n[${i + 1}/${pending.length}] Post de: ${facebookAuthor} | ${post.dateRaw || "sin fecha"}`);
    console.log(`  Texto: ${post.postText.slice(0, 80).replace(/\n/g, " ") || "(sin texto)"}`);

    // Detectar fotógrafo en el texto del post
    const photographerFromText = extractPhotographerFromText(post.postText);
    // También buscar en comentarios
    const photographerFromComment = facebookComments
      .map(c => extractPhotographerFromText(c))
      .find(Boolean) || null;

    // Pre-filtro de texto gratis (antes de llamar a Gemini)
    const textVerdict = preFilterText(post.postText);
    if (textVerdict === "skip") {
      console.log(`  ⏭  Pre-filtro texto: parece moderno → descartado sin IA`);
      skipped.push({ id: post.id, reason: "Pre-filtro: texto moderno", postText: post.postText, facebookAuthor });
      saveJson(SKIPPED_FILE, skipped);
      skippedCount++;
      continue;
    }
    if (textVerdict === "likely") console.log(`  ✨ Pre-filtro: pinta a histórico`);

    const validImages = getValidImages(post.localImages);

    if (validImages.length === 0) {
      console.log(`  ⚠️  Sin imágenes válidas (todas < ${MIN_IMAGE_SIZE / 1024}KB) → descartado`);
      skipped.push({ id: post.id, reason: "Sin imagen válida", postText: post.postText, facebookAuthor });
      saveJson(SKIPPED_FILE, skipped);
      skippedCount++;
      continue;
    }

    console.log(`  📷 ${validImages.length} imagen(es) válida(s) a analizar`);

    const acceptedImages: ImageCatalog[] = [];

    // Analizar cada imagen del post
    for (const imagePath of validImages) {
      const filename = path.basename(imagePath);
      process.stdout.write(`    → ${filename}... `);

      let retries = 0;
      while (retries < 3) {
        try {
          const result = await analyzeImage(imagePath, post.postText, post.facebookComments || [], facebookAuthor, ai);

          // Filtros de rechazo
          if (!result.isHistorical) {
            console.log(`DESCARTADA (${result.skipReason || "no histórica"})`);
            break;
          }
          const yearMax = result.yearMax ?? result.year ?? 0;
          if (yearMax > MAX_YEAR) {
            console.log(`DESCARTADA (año ${yearMax} > ${MAX_YEAR})`);
            break;
          }
          if (result.confidence < MIN_CONFIDENCE) {
            console.log(`DESCARTADA (confianza ${result.confidence.toFixed(2)} < ${MIN_CONFIDENCE})`);
            break;
          }

          // Añadir URL original si disponible
          const imgIndex = post.localImages.indexOf(filename);
          if (imgIndex >= 0 && post.imageUrls?.[imgIndex]) {
            result.imageUrl = post.imageUrls[imgIndex];
          }

          // Anti-repetición: contar por tag dominante
          const dominantTag = result.tags[0] || "general";
          tagCount[dominantTag] = (tagCount[dominantTag] || 0) + 1;
          if (tagCount[dominantTag] > MAX_PER_TAG) {
            console.log(`DESCARTADA (repetición: ya tenemos ${tagCount[dominantTag]-1} fotos de "${dominantTag}")`);
            break;
          }

          acceptedImages.push(result);
          const typeIcon = result.contentType === "photo_bw" ? "⬛" : result.contentType === "document" ? "📄" : "🟫";
          console.log(`✅ ${typeIcon} "${result.title}" | ${result.year || result.yearRange || "?"} | ${result.location || "sin ubicación"} | conf: ${result.confidence.toFixed(2)}`);
          break;
        } catch (e: any) {
          if (e.message?.includes("429") || e.message?.includes("quota") || e.message?.includes("RESOURCE_EXHAUSTED")) {
            retries++;
            console.log(`\n  ⏳ Rate limit. Espera ${30 * retries}s... (intento ${retries}/3)`);
            await delay(30000 * retries);
          } else {
            console.log(`ERROR: ${e.message?.slice(0, 80)}`);
            errorCount++;
            break;
          }
        }
      }

      await delay(GEMINI_DELAY_MS);
    }

    // Si ninguna imagen fue aceptada → descartar el post
    if (acceptedImages.length === 0) {
      skipped.push({ id: post.id, reason: "Ninguna imagen histórica válida", postText: post.postText, facebookAuthor });
      saveJson(SKIPPED_FILE, skipped);
      skippedCount++;
      continue;
    }

    // Determinar fotógrafo y fuente
    let photographer: string | undefined;
    let photographerSource: CatalogEntry["photographerSource"] = "unknown";

    if (photographerFromText) {
      photographer = photographerFromText;
      photographerSource = "post_text";
    } else if (photographerFromComment) {
      photographer = photographerFromComment;
      photographerSource = "comment";
    } else {
      // Ver si alguna imagen detectó el fotógrafo
      const aiPhotographer = acceptedImages.find(img => img.photographer)?.photographer;
      if (aiPhotographer) {
        photographer = aiPhotographer;
        photographerSource = "ai_guess";
      }
    }

    const entry: CatalogEntry = {
      id: post.id,
      postText: post.postText,
      postUrl: post.postUrl,
      facebookAuthor,
      facebookAuthorUrl,
      facebookComments,
      facebookDate: post.dateRaw || "",
      facebookDateUnix: post.dateUnix,
      photographer,
      photographerSource,
      images: acceptedImages,
      localImages: post.localImages || [],
      processed: false,
    };

    cataloged.push(entry);
    saveJson(CATALOGED_FILE, cataloged);
    acceptedCount++;

    console.log(`  💾 Post guardado: ${acceptedImages.length} imagen(es) histórica(s) de ${facebookAuthor}${photographer ? ` | Fotógrafo: ${photographer}` : ""}`);
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(` ✅ Catalogación completada`);
  console.log(` Posts aceptados esta sesión: ${acceptedCount}`);
  console.log(` Posts descartados: ${skippedCount}`);
  console.log(` Errores: ${errorCount}`);
  console.log(` Total históricos acumulados: ${cataloged.length}`);
  console.log(`═══════════════════════════════════════`);
  console.log(`\nSiguiente paso:`);
  console.log(`  1. npm run build`);
  console.log(`  2. Subir dist/ a Hostinger`);
  console.log(`  3. Abrir https://springgreen-grouse-873895.hostingersite.com/import-fotos.html\n`);
}

main().catch(console.error);
