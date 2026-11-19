/**
 * scripts/merge-navarra-archive.mjs
 * 
 * Procesa las fotos oficiales descargadas de la Fototeca del Archivo de Navarra:
 * 1. Comprime a WebP (1280px y 450px thumbnail) con cwebp nativo.
 * 2. Sube a Cloudflare R2 (archivo-historico-navarra).
 * 3. Asigna metadatos oficiales (signatura, año, fotógrafo, pueblo, landmark).
 * 4. Fusiona en public/data/photos.json.
 * 
 * Uso: node scripts/merge-navarra-archive.mjs
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const NAVARRA_PHOTOS_DIR = path.join(ROOT, "public/navarra-photos");
const DOCS_FILE = path.join(ROOT, "navarra-import/documents.json");
const PHOTOS_JSON_FILE = path.join(ROOT, "public/data/photos.json");

// Cargar .env manualmente si existe
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

const R2_BUCKET = process.env.R2_BUCKET_NAME || "archivo-historico-navarra";
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "https://pub-bcb74c316f9a4ea699f7d0ac7a064336.r2.dev").replace(/\/$/, "");
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error("❌ Faltan credenciales de Cloudflare R2 en .env");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const CWEBP = fs.existsSync("/opt/homebrew/bin/cwebp")
  ? "/opt/homebrew/bin/cwebp"
  : fs.existsSync("/usr/local/bin/cwebp")
  ? "/usr/local/bin/cwebp"
  : "cwebp";

function getTownInfo(place) {
  const p = (place || "").toLowerCase();
  if (p.includes("pamplona") || p.includes("iruña")) {
    return { town: "Pamplona-Iruña", slug: "pamplona-iruna", merindad: "Pamplona" };
  }
  if (p.includes("olite") || p.includes("erriberri")) {
    return { town: "Olite-Erriberri", slug: "olite-erriberri", merindad: "Olite" };
  }
  if (p.includes("tafalla")) {
    return { town: "Tafalla", slug: "tafalla", merindad: "Olite" };
  }
  if (p.includes("tudela")) {
    return { town: "Tudela", slug: "tudela", merindad: "Tudela" };
  }
  if (p.includes("sangüesa") || p.includes("zangoza")) {
    return { town: "Sangüesa-Zangoza", slug: "sanguesa-zangoza", merindad: "Sangüesa" };
  }
  if (p.includes("etxauri")) {
    return { town: "Etxauri", slug: "etxauri", merindad: "Pamplona" };
  }
  if (p.includes("olazti") || p.includes("olazagutía")) {
    return { town: "Olazti / Olazagutía", slug: "olazagutia", merindad: "Pamplona" };
  }
  if (p.includes("lizarraga") || p.includes("ergoiena")) {
    return { town: "Lizarraga (Ergoiena)", slug: "ergoiena", merindad: "Pamplona" };
  }
  // Default: Estella-Lizarra
  return { town: "Estella-Lizarra", slug: "estella-lizarra", merindad: "Estella" };
}

function detectLandmark(title, text) {
  const t = `${title} ${text}`.toLowerCase();
  if (t.includes("san pedro de la rúa") || t.includes("san pedro de la rua")) return "san_pedro";
  if (t.includes("san miguel")) return "san_miguel";
  if (t.includes("reyes de navarra")) return "reyes_navarra";
  if (t.includes("puy") || t.includes("basílica del puy")) return "el_puy";
  if (t.includes("plaza de los fueros") || t.includes("los fueros")) return "fueros";
  if (t.includes("plaza de santiago")) return "santiago";
  if (t.includes("puente de la cárcel") || t.includes("puente picudo")) return "puente_carcel";
  if (t.includes("santo sepulcro")) return "sepulcro";
  if (t.includes("los llanos") || t.includes("río ega")) return "llanos_ega";
  if (t.includes("irache")) return "irache";
  if (t.includes("estación") || t.includes("trenico") || t.includes("ferrocarril")) return "trenico";
  if (t.includes("plaza de toros")) return "toros";
  if (t.includes("calle mayor")) return "calle_mayor";
  return undefined;
}

async function uploadToR2(buffer, key, contentType = "image/webp") {
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });
  await s3.send(cmd);
}

async function main() {
  console.log("════════════════════════════════════════════════════════════");
  console.log(" 🏛️ FUSIÓN DEL ARCHIVO GENERAL DE NAVARRA (AGN) A R2");
  console.log("════════════════════════════════════════════════════════════\n");

  if (!fs.existsSync(DOCS_FILE)) {
    console.error(`No existe ${DOCS_FILE}`);
    process.exit(1);
  }

  const docs = JSON.parse(fs.readFileSync(DOCS_FILE, "utf8"));
  const docsById = new Map(docs.map((d) => [`navarra_${d.id}`, d]));

  const photos = fs.existsSync(PHOTOS_JSON_FILE)
    ? JSON.parse(fs.readFileSync(PHOTOS_JSON_FILE, "utf8"))
    : [];
  const existingIds = new Set(photos.map((p) => p.id));

  if (!fs.existsSync(NAVARRA_PHOTOS_DIR)) {
    console.log("No hay fotos descargadas en public/navarra-photos todavía.");
    return;
  }

  const downloadedFiles = fs.readdirSync(NAVARRA_PHOTOS_DIR).filter((f) => f.endsWith(".jpg"));
  console.log(`Encontradas ${downloadedFiles.length} imágenes descargadas en public/navarra-photos/\n`);

  const tmpDir = path.join(ROOT, "tmp_webp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  let addedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < downloadedFiles.length; i++) {
    const file = downloadedFiles[i];
    const docId = file.replace(/\.jpg$/, "");
    const docEntry = docsById.get(docId);

    if (!docEntry) {
      console.log(`[${i + 1}/${downloadedFiles.length}] ${docId}: Sin ficha en documents.json (omitida)`);
      continue;
    }

    if (existingIds.has(docId)) {
      skippedCount++;
      continue;
    }

    const townInfo = getTownInfo(docEntry.place);
    const landmarkId = townInfo.slug === "estella-lizarra" ? detectLandmark(docEntry.title || "", docEntry.notes || "") : undefined;

    const srcPath = path.join(NAVARRA_PHOTOS_DIR, file);
    const fullWebp = path.join(tmpDir, `${docId}_full.webp`);
    const thumbWebp = path.join(tmpDir, `${docId}_thumb.webp`);

    process.stdout.write(`[${i + 1}/${downloadedFiles.length}] Procesando ${docId}... `);

    try {
      // 1. Convertir a WebP
      execSync(`${CWEBP} -q 80 -resize 1280 0 "${srcPath}" -o "${fullWebp}" 2>/dev/null`, { stdio: "pipe" });
      execSync(`${CWEBP} -q 75 -resize 450 0 "${srcPath}" -o "${thumbWebp}" 2>/dev/null`, { stdio: "pipe" });

      const fullKey = `${townInfo.slug}/photos/${docId}.webp`;
      const thumbKey = `${townInfo.slug}/thumbs/${docId}.webp`;

      // 2. Subir a R2
      await uploadToR2(fs.readFileSync(fullWebp), fullKey);
      await uploadToR2(fs.readFileSync(thumbWebp), thumbKey);

      // Limpiar temporales
      fs.unlinkSync(fullWebp);
      fs.unlinkSync(thumbWebp);

      // 3. Crear registro de Photo
      const year = docEntry.year || (docEntry.dateRaw ? parseInt(docEntry.dateRaw.slice(0, 4), 10) : undefined);
      const decade = year ? `${Math.floor(year / 10) * 10}s` : undefined;

      const cleanDesc = [
        docEntry.notes,
        docEntry.characteristics,
        docEntry.series ? `Serie: ${docEntry.series}` : "",
        `Licencia: ${docEntry.license || "Dominio Público / Archivo de Navarra"}`,
      ]
        .filter(Boolean)
        .join(" · ");

      const photoRecord = {
        id: docId,
        title: docEntry.title || "Fotografía histórica de Navarra",
        description: cleanDesc,
        year: year || null,
        decade: decade,
        owner: "Archivo General de Navarra",
        photographer: docEntry.producer || "",
        location: docEntry.place ? docEntry.place.split(" - ")[0] : townInfo.town,
        collection: "Fototeca del Archivo General de Navarra",
        tags: ["archivo_oficial", "fototeca", "patrimonio", townInfo.slug],
        quality: "high",
        priority: "high",
        relatedArticles: [],
        imageUrl: `${R2_PUBLIC_URL}/${fullKey}`,
        thumbnailUrl: `${R2_PUBLIC_URL}/${thumbKey}`,
        createdAt: Date.now(),
        town: townInfo.town,
        townSlug: townInfo.slug,
        merindad: townInfo.merindad,
        landmarkId: landmarkId,
        archiveReference: docEntry.reference,
        verifiedLocation: true,
      };

      photos.push(photoRecord);
      existingIds.add(docId);
      addedCount++;
      console.log(`✅ Subida a R2 y catalogada (${townInfo.town}${landmarkId ? ` - ${landmarkId}` : ""})`);
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
    }
  }

  // Guardar catálogo actualizado
  fs.writeFileSync(PHOTOS_JSON_FILE, JSON.stringify(photos, null, 2));

  // Limpiar tmpDir
  try { fs.rmdirSync(tmpDir); } catch {}

  console.log(`\n════════════════════════════════════════════════════════════`);
  console.log(` ✅ Fusión completada`);
  console.log(` Nuevas fotos añadidas a R2: ${addedCount}`);
  console.log(` Ya existentes:              ${skippedCount}`);
  console.log(` Total fotos en el catálogo: ${photos.length}`);
  console.log(`════════════════════════════════════════════════════════════\n`);
}

main().catch(console.error);
