/**
 * scripts/merge-facebook-archive.mjs
 * 
 * Fusiona las fotos catalogadas por IA de Facebook en public/data/photos.json:
 * 1. Lee facebook-import/${townArg}/cataloged-posts.json.
 * 2. Comprime cada imagen a WebP (1280px full y 450px thumbnail) con cwebp nativo.
 * 3. Sube a Cloudflare R2 (archivo-historico-navarra).
 * 4. Asigna metadatos ricos (título, descripción, testimonios orales, pueblo, vecinos).
 * 5. Actualiza public/data/photos.json y dist/data/photos.json.
 * 
 * Uso: node scripts/merge-facebook-archive.mjs [--town=pamplona-iruna]
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const townArg = process.argv.find((a) => a.startsWith("--town="))?.split("=")[1] || "pamplona-iruna";
const townSources = JSON.parse(fs.readFileSync(path.join(__dirname, "town-sources.json"), "utf8"));
const currentTown = townSources[townArg] || {
  name: "Pamplona-Iruña",
  slug: "pamplona-iruna",
  merindad: "Pamplona",
  comarca: "Cuenca de Pamplona",
};

const IMPORT_DIR = townArg === "estella-lizarra"
  ? path.join(ROOT, "facebook-import")
  : path.join(ROOT, `facebook-import/${townArg}`);

const IMAGES_DIR = path.join(IMPORT_DIR, "images");
const CATALOGED_FILE = path.join(IMPORT_DIR, "cataloged-posts.json");
const PHOTOS_JSON_FILE = path.join(ROOT, "public/data/photos.json");

// Cargar .env
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
  console.log(` 🚀 FUSIÓN DE FACEBOOK (${currentTown.name.toUpperCase()}) A R2`);
  console.log("════════════════════════════════════════════════════════════\n");

  if (!fs.existsSync(CATALOGED_FILE)) {
    console.error(`❌ No existe ${CATALOGED_FILE}. Ejecuta primero 02-ai-catalog.ts`);
    process.exit(1);
  }

  const cataloged = JSON.parse(fs.readFileSync(CATALOGED_FILE, "utf8"));
  console.log(`Posts catalogados en ${path.basename(IMPORT_DIR)}: ${cataloged.length}`);

  const photos = fs.existsSync(PHOTOS_JSON_FILE)
    ? JSON.parse(fs.readFileSync(PHOTOS_JSON_FILE, "utf8"))
    : [];
  const existingIds = new Set(photos.map((p) => p.id));
  console.log(`Fotos ya existentes en photos.json: ${photos.length}\n`);

  const tmpDir = path.join(ROOT, "tmp_webp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  let addedPhotos = 0;
  let skippedPhotos = 0;

  for (const post of cataloged) {
    if (!post.images || post.images.length === 0) continue;

    for (let imgIdx = 0; imgIdx < post.images.length; imgIdx++) {
      const img = post.images[imgIdx];
      const photoId = `fb_${post.id}_${imgIdx}`;

      if (existingIds.has(photoId)) {
        skippedPhotos++;
        continue;
      }

      // Buscar imagen local
      const localFilename = img.localImage || `${post.id}.jpg`;
      const localPath = path.join(IMAGES_DIR, localFilename);

      if (!fs.existsSync(localPath)) {
        console.warn(`⚠️ No se encontró imagen local para ${photoId} (${localFilename})`);
        continue;
      }

      const townSlug = img.town || currentTown.slug || "pamplona-iruna";
      const townName = img.townName || currentTown.name || "Pamplona-Iruña";
      const merindad = img.merindad || currentTown.merindad || "Pamplona";

      const fullWebp = path.join(tmpDir, `${photoId}_full.webp`);
      const thumbWebp = path.join(tmpDir, `${photoId}_thumb.webp`);

      process.stdout.write(`Subiendo ${photoId} [${townName}]... `);

      try {
        // 1. Compresión WebP
        execSync(`${CWEBP} -q 80 -resize 1280 0 "${localPath}" -o "${fullWebp}" 2>/dev/null`, { stdio: "pipe" });
        execSync(`${CWEBP} -q 75 -resize 450 0 "${localPath}" -o "${thumbWebp}" 2>/dev/null`, { stdio: "pipe" });

        const fullKey = `${townSlug}/photos/${photoId}.webp`;
        const thumbKey = `${townSlug}/thumbs/${photoId}.webp`;

        // 2. Subir a Cloudflare R2
        await uploadToR2(fs.readFileSync(fullWebp), fullKey);
        await uploadToR2(fs.readFileSync(thumbWebp), thumbKey);

        // Limpiar temporales
        if (fs.existsSync(fullWebp)) fs.unlinkSync(fullWebp);
        if (fs.existsSync(thumbWebp)) fs.unlinkSync(thumbWebp);

        // 3. Preparar metadatos
        const year = img.year || (img.yearRange ? parseInt(img.yearRange.slice(0, 4), 10) : undefined);
        const decade = img.decade || (year ? `${Math.floor(year / 10) * 10}s` : undefined);

        const newPhoto = {
          id: photoId,
          title: img.title || "Fotografía histórica de Navarra",
          description: img.description || post.postText || "",
          year: year || null,
          decade: decade || null,
          owner: post.facebookAuthor || "desconocido",
          photographer: img.photographer || post.photographer || "",
          location: img.location || townName,
          collection: "La Pamplona desaparecida · La Navarra olvidada",
          tags: Array.isArray(img.tags) && img.tags.length > 0 ? img.tags : ["memoria_historica", "navarra"],
          keywords: Array.isArray(img.keywords) ? img.keywords : [],
          people: Array.isArray(img.people) ? img.people : (img.people ? [img.people] : []),
          landmarkId: img.landmarkId || null,
          quality: img.confidence >= 0.8 ? "high" : "normal",
          priority: img.confidence >= 0.8 ? "high" : "normal",
          relatedArticles: [],
          facebookPostUrl: post.postUrl || `https://www.facebook.com/photo/?fbid=${post.id}`,
          facebookAuthor: post.facebookAuthor || "desconocido",
          imageUrl: `${R2_PUBLIC_URL}/${fullKey}`,
          thumbnailUrl: `${R2_PUBLIC_URL}/${thumbKey}`,
          createdAt: Date.now(),
          town: townName,
          townSlug: townSlug,
          merindad: merindad,
          aiAnalysis: img.description || "",
        };

        photos.push(newPhoto);
        existingIds.add(photoId);
        addedPhotos++;
        console.log(`✅ OK (${img.title.slice(0, 40)})`);
      } catch (err) {
        console.error(`❌ Error en ${photoId}:`, err.message);
      }
    }
  }

  // Guardar archivo actualizado
  fs.writeFileSync(PHOTOS_JSON_FILE, JSON.stringify(photos, null, 2));
  console.log(`\n💾 Guardado en public/data/photos.json (Total fotos: ${photos.length})`);

  const distFile = path.join(ROOT, "dist/data/photos.json");
  if (fs.existsSync(path.dirname(distFile))) {
    fs.writeFileSync(distFile, JSON.stringify(photos, null, 2));
    console.log(`💾 Actualizado también en dist/data/photos.json`);
  }

  console.log(`\n════════════════════════════════════════════════════════════`);
  console.log(` 🎉 FUSIÓN COMPLETADA:`);
  console.log(` - Nuevas fotos agregadas: ${addedPhotos}`);
  console.log(` - Fotos omitidas (ya en catálogo): ${skippedPhotos}`);
  console.log(` - Total catálogo actual: ${photos.length} fotos`);
  console.log(`════════════════════════════════════════════════════════════\n`);
}

main().catch(console.error);
