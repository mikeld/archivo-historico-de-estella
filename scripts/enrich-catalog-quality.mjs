/**
 * scripts/enrich-catalog-quality.mjs
 * 
 * Enriquecimiento masivo de metadatos con Gemini Flash:
 * - Detección estricta de punto de interés en el mapa (landmarkId) sin falsos positivos.
 * - Extracción de año exacto, década, autor/fotógrafo real y procedencia.
 * - Identificación de personas citadas y normalización de pueblo.
 * - Guardado incremental y reanudable en facebook-import/enriched-metadata.json.
 */

import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// Cargar .env
const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [k, ...rest] = line.split("=");
    const v = rest.join("=").trim().replace(/^"|"$/g, "");
    if (k?.trim() && v && !process.env[k.trim()]) process.env[k.trim()] = v;
  });
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ ERROR: No se encontró GEMINI_API_KEY en .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

const PHOTOS_FILE = path.join(ROOT, "public/data/photos.json");
const CATALOGED_FILE = path.join(ROOT, "facebook-import/cataloged-posts.json");
const ENRICHED_CACHE = path.join(ROOT, "facebook-import/enriched-metadata.json");

const photos = JSON.parse(fs.readFileSync(PHOTOS_FILE, "utf8"));
const cataloged = fs.existsSync(CATALOGED_FILE)
  ? JSON.parse(fs.readFileSync(CATALOGED_FILE, "utf8"))
  : [];

const catalogedMap = new Map();
cataloged.forEach((p) => catalogedMap.set(p.id, p));

// Cargar caché si existe
let cache = {};
if (fs.existsSync(ENRICHED_CACHE)) {
  try {
    cache = JSON.parse(fs.readFileSync(ENRICHED_CACHE, "utf8"));
    console.log(`📂 Caché cargada con ${Object.keys(cache).length} fotos ya procesadas.`);
  } catch (e) {
    console.warn("⚠️ No se pudo leer la caché previa, empezando desde cero.");
  }
}

const LANDMARKS_GUIDE = `
Available landmark IDs in Estella-Lizarra:
- "fueros": Plaza de los Fueros / Quiosco / soportales de la plaza principal
- "san_pedro": Iglesia de San Pedro de la Rúa / escalinata medieval
- "trenico": Antigua Estación de ferrocarril / El Trenico / vías / andenes
- "llanos": Paseo o parque de Los Llanos / Convento de San Benito / zona verde
- "rio_ega": Río Ega / orillas del río / presa / pescadores / crecida del río
- "puy": Basílica de Ntra. Sra. del Puy / explanada de la patrona
- "calle_mayor": Calle Mayor de Estella o Calle de la Rúa
- "reyes_navarra": Palacio de los Reyes de Navarra / Plaza de San Martín / fuente de la mona
- "santiago": Plaza de Santiago
- "toros": Plaza de Toros
- "san_miguel": Iglesia de San Miguel / portada románica
- "puente_carcel": Puente de la Cárcel (Puente Picudo)
- "sepulcro": Iglesia del Santo Sepulcro
- "inmaculada": Paseo de la Inmaculada
- null: CUALQUIER foto de interiores, retratos familiares, fotos de grupo, carnavales o calles no identificables con total certeza. Si dudas, devuelve null.
`;

const BATCH_SIZE = 25;

async function processBatch(batch) {
  const payload = batch.map((p) => {
    const parts = p.id.split("_");
    const postId = parts[1];
    const post = catalogedMap.get(postId);
    return {
      id: p.id,
      title: p.title || "",
      currentLocation: p.location || "",
      description: p.description || "",
      postText: post?.postText || "",
      authorInPost: post?.facebookAuthor || p.facebookAuthor || ""
    };
  });

  const prompt = `Actúas como archivero e historiador experto de Estella-Lizarra y Navarra.
Analiza cada uno de estos registros fotográficos y extrae metadatos con estricta rigurosidad:

${LANDMARKS_GUIDE}

Devuelve un JSON array con un objeto por cada elemento:
[{
  "id": string,
  "landmarkId": string o null, // SOLO si muestra claramente ese lugar. Si no, null.
  "year": number o null,       // Año exacto solo si se menciona explícitamente o es indudable. Si no, null.
  "decade": string o null,     // Ej: "1920s", "1950s", "1960s", "1970s", "1980s", "1990s"
  "photographer": string,     // Fotógrafo real o colección/archivo citado (ej. "Nicolás Ardanaz", "Domingo Lasa", "Archivo Peluso", etc.). String vacío si no se conoce.
  "uploader": string,         // Nombre de la persona que compartió la foto en Facebook si se deduce.
  "town": string,             // "Estella-Lizarra" por defecto, o nombre del pueblo navarro si es de otra localidad.
  "people": string[],         // Nombres propios de personas identificadas en el post.
  "cleanTitle": string        // Título limpio, conciso y formal en español (máx 60 caracteres).
}]

Registros a procesar:
${JSON.stringify(payload, null, 2)}`;

  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json"
    }
  });

  return JSON.parse(res.text);
}

async function main() {
  console.log("══════════════════════════════════════════════════════════");
  console.log(" 🔍 ENRIQUECIMIENTO RIGUROSO DE METADATOS Y MAPA HISTÓRICO");
  console.log("══════════════════════════════════════════════════════════\n");

  const pending = photos.filter((p) => !cache[p.id]);
  console.log(`Total fotos: ${photos.length}`);
  console.log(`Ya en caché: ${Object.keys(cache).length}`);
  console.log(`Pendientes de procesar: ${pending.length}\n`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(pending.length / BATCH_SIZE);

    console.log(`⏳ Procesando lote ${batchNum}/${totalBatches} (${batch.length} fotos)...`);

    try {
      const results = await processBatch(batch);
      for (const item of results) {
        if (item && item.id) {
          cache[item.id] = item;
        }
      }

      // Guardar incrementalmente
      fs.writeFileSync(ENRICHED_CACHE, JSON.stringify(cache, null, 2));
      console.log(`   ✅ Guardado. Progreso total: ${Object.keys(cache).length}/${photos.length}`);
    } catch (err) {
      console.error(`   ❌ Error en lote ${batchNum}:`, err.message);
    }

    // Pequeño descanso para respetar rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("\n══════════════════════════════════════════════════════════");
  console.log(" 🔄 ACTUALIZANDO public/data/photos.json Y dist/...");
  console.log("══════════════════════════════════════════════════════════");

  let enrichedCount = 0;
  let landmarkAssignedCount = 0;
  let photographerCount = 0;
  let yearCount = 0;

  const updatedPhotos = photos.map((p) => {
    const meta = cache[p.id];
    if (!meta) return p;

    enrichedCount++;
    const updated = { ...p };

    if (meta.landmarkId) {
      updated.landmarkId = meta.landmarkId;
      landmarkAssignedCount++;
    } else {
      delete updated.landmarkId;
    }

    if (meta.year && typeof meta.year === "number") {
      updated.year = meta.year;
      yearCount++;
    }

    if (meta.decade) {
      updated.decade = meta.decade;
      const tagKey = `anos_${meta.decade.slice(2, 4)}`;
      if (!updated.tags) updated.tags = [];
      if (!updated.tags.includes(tagKey)) updated.tags.push(tagKey);
    }

    if (meta.photographer && meta.photographer.trim()) {
      updated.photographer = meta.photographer.trim();
      photographerCount++;
    }

    if (meta.uploader && meta.uploader.trim() && (!updated.facebookAuthor || updated.facebookAuthor === "desconocido")) {
      updated.facebookAuthor = meta.uploader.trim();
    }

    if (meta.town && meta.town.trim()) {
      updated.town = meta.town.trim();
    } else {
      updated.town = "Estella-Lizarra";
    }

    if (meta.cleanTitle && meta.cleanTitle.trim() && meta.cleanTitle.length > 5) {
      updated.title = meta.cleanTitle.trim();
    }

    if (meta.people && Array.isArray(meta.people) && meta.people.length > 0) {
      updated.people = meta.people;
    }

    return updated;
  });

  fs.writeFileSync(PHOTOS_FILE, JSON.stringify(updatedPhotos, null, 2));

  const DIST_PHOTOS = path.join(ROOT, "dist/data/photos.json");
  if (fs.existsSync(path.dirname(DIST_PHOTOS))) {
    fs.writeFileSync(DIST_PHOTOS, JSON.stringify(updatedPhotos, null, 2));
  }

  console.log(`\n🎉 PROCESO COMPLETADO:`);
  console.log(`- Fotos enriquecidas: ${enrichedCount}`);
  console.log(`- Fotos con lugar verificado asignado al mapa: ${landmarkAssignedCount}`);
  console.log(`- Fotos con año exacto: ${yearCount}`);
  console.log(`- Fotos con fotógrafo/autor reconocido: ${photographerCount}`);
}

main().catch(console.error);
