/**
 * scripts/sync-r2-webp.mjs
 * 
 * Convierte las fotos históricas a WebP de alta fidelidad con cwebp
 * y las sincroniza con el bucket de Cloudflare R2 de forma incremental.
 * Actualiza public/data/photos.json con las URLs de la CDN de Cloudflare R2.
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
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

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
} = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
  console.error("❌ Faltan credenciales de Cloudflare R2 en .env.");
  console.error("Asegúrate de definir en .env:");
  console.error("- R2_ACCOUNT_ID");
  console.error("- R2_ACCESS_KEY_ID");
  console.error("- R2_SECRET_ACCESS_KEY");
  console.error("- R2_BUCKET_NAME");
  console.error("- R2_PUBLIC_URL");
  process.exit(1);
}

// Normalizar Account ID si el usuario pegó la URL entera
const cleanAccountId = R2_ACCOUNT_ID.replace("https://", "").replace(".r2.cloudflarestorage.com", "").trim();
const cleanPublicUrl = R2_PUBLIC_URL.replace(/\/$/, "").trim();

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${cleanAccountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const PHOTOS_FILE = path.join(ROOT, "public/data/photos.json");
const ARCHIVE_PHOTOS_DIR = path.join(ROOT, "public/archive-photos");
const CACHE_FILE = path.join(ROOT, "facebook-import/r2-uploaded.json");
const TEMP_DIR = path.join(ROOT, "facebook-import/temp-webp");

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

let uploadedCache = {};
if (fs.existsSync(CACHE_FILE)) {
  try {
    uploadedCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {}
}

async function uploadToR2(key, filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

async function main() {
  console.log("══════════════════════════════════════════════════════════");
  console.log(" ☁️  SINCRONIZACIÓN Y COMPRESIÓN WEBP -> CLOUDFLARE R2");
  console.log("══════════════════════════════════════════════════════════\n");
  console.log(`Bucket:     ${R2_BUCKET_NAME}`);
  console.log(`Public URL: ${cleanPublicUrl}\n`);

  const photos = JSON.parse(fs.readFileSync(PHOTOS_FILE, "utf8"));
  console.log(`Total fotos a procesar: ${photos.length}`);
  console.log(`Fotos ya en R2 (caché): ${Object.keys(uploadedCache).length}\n`);

  let count = 0;
  let skipped = 0;

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const id = photo.id;

    const townSlug = (photo.town || "Estella-Lizarra")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-");

    const r2PhotoKey = `${townSlug}/photos/${id}.webp`;
    const r2ThumbKey = `${townSlug}/thumbs/${id}.webp`;

    const expectedPhotoUrl = `${cleanPublicUrl}/${r2PhotoKey}`;
    const expectedThumbUrl = `${cleanPublicUrl}/${r2ThumbKey}`;

    // Si ya está subida en caché y la URL coincide, saltar
    if (uploadedCache[id] && photo.imageUrl === expectedPhotoUrl) {
      skipped++;
      continue;
    }

    // Buscar archivo origen en local
    const possiblePaths = [
      path.join(ARCHIVE_PHOTOS_DIR, `${id}.jpg`),
      path.join(ARCHIVE_PHOTOS_DIR, `${id}.png`),
      path.join(ROOT, "facebook-import/images", `${id}.jpg`),
      path.join(ROOT, "facebook-import/images", `${id}.png`),
      path.join(ROOT, "facebook-import/images", `${id}.webp`),
    ];

    let sourceFile = possiblePaths.find((p) => fs.existsSync(p));

    if (!sourceFile) {
      console.warn(`⚠️ No se encontró imagen local para [${id}], saltando.`);
      continue;
    }

    const tempPhoto = path.join(TEMP_DIR, `${id}.webp`);
    const tempThumb = path.join(TEMP_DIR, `${id}_thumb.webp`);

    try {
      // 1. Generar WebP grande (1280px máx)
      execSync(`/opt/homebrew/bin/cwebp -q 80 -resize 1280 0 "${sourceFile}" -o "${tempPhoto}" > /dev/null 2>&1`);
      // 2. Generar WebP miniatura (450px máx)
      execSync(`/opt/homebrew/bin/cwebp -q 75 -resize 450 0 "${sourceFile}" -o "${tempThumb}" > /dev/null 2>&1`);

      // 3. Subir a R2
      await uploadToR2(r2PhotoKey, tempPhoto);
      await uploadToR2(r2ThumbKey, tempThumb);

      // 4. Limpiar temporales
      if (fs.existsSync(tempPhoto)) fs.unlinkSync(tempPhoto);
      if (fs.existsSync(tempThumb)) fs.unlinkSync(tempThumb);

      // 5. Actualizar registro en memoria
      photo.imageUrl = expectedPhotoUrl;
      photo.thumbnailUrl = expectedThumbUrl;

      uploadedCache[id] = true;
      count++;

      if (count % 25 === 0 || i === photos.length - 1) {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(uploadedCache, null, 2));
        fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 2));
        console.log(`⏳ Progreso: ${i + 1}/${photos.length} (${count} subidas, ${skipped} omitidas)`);
      }
    } catch (err) {
      console.error(`❌ Error procesando [${id}]:`, err.message);
    }
  }

  // Guardar estado final
  fs.writeFileSync(CACHE_FILE, JSON.stringify(uploadedCache, null, 2));
  fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 2));

  const DIST_PHOTOS = path.join(ROOT, "dist/data/photos.json");
  if (fs.existsSync(path.dirname(DIST_PHOTOS))) {
    fs.writeFileSync(DIST_PHOTOS, JSON.stringify(photos, null, 2));
  }

  console.log(`\n🎉 SINCRONIZACIÓN R2 COMPLETADA:`);
  console.log(`- Nuevas fotos subidas: ${count}`);
  console.log(`- Fotos que ya estaban al día: ${skipped}`);
  console.log(`- URLs en photos.json migradas a Cloudflare R2.`);
}

main().catch(console.error);
