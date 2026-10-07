/**
 * build-static-archive.mjs
 * 
 * Exporta todas las fotos de Firestore a public/data/photos.json
 * y optimiza las 1.216 imágenes a public/archive-photos/ (grandes y miniaturas)
 * usando la utilidad nativa sips de macOS.
 * 
 * Una vez ejecutado, la web puede ser servida 100% desde Hostinger
 * sin coste ni dependencia de cuotas de lectura de Firestore.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { initializeFirestore, collection, getDocs } from "firebase/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(PUBLIC_DIR, "data");
const PHOTOS_DIR = path.join(PUBLIC_DIR, "archive-photos");
const THUMBS_DIR = path.join(PHOTOS_DIR, "thumbs");
const LOCAL_IMAGES_DIR = path.join(ROOT, "facebook-import", "images");

// Asegurar directorios
[DATA_DIR, PHOTOS_DIR, THUMBS_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Inicializar Firebase
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase-applet-config.json"), "utf8"));
const app = initializeApp(config);
const db = initializeFirestore(app, {}, config.firestoreDatabaseId);

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log(" 📦 CONSTRUYENDO ARCHIVO ESTÁTICO DE ESTELLA-LIZARRA");
  console.log("═══════════════════════════════════════════════════\n");

  console.log("1. Obteniendo todas las fotos de Firestore...");
  const snap = await getDocs(collection(db, "photos"));
  console.log(`   Total de documentos encontrados: ${snap.size}\n`);

  const photosList = [];
  let processedCount = 0;
  let downloadedCount = 0;
  let skippedCount = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const photoId = d.id;
    const destPhotoPath = path.join(PHOTOS_DIR, `${photoId}.jpg`);
    const destThumbPath = path.join(THUMBS_DIR, `${photoId}.jpg`);

    // Comprobar si ya existen ambas versiones
    const alreadyDone = fs.existsSync(destPhotoPath) && fs.existsSync(destThumbPath);

    if (!alreadyDone) {
      // Buscar imagen origen
      const decodedUrl = decodeURIComponent(data.imageUrl || "");
      const originalFilename = path.basename(decodedUrl.split("?")[0]);
      let sourcePath = path.join(LOCAL_IMAGES_DIR, originalFilename);

      if (!fs.existsSync(sourcePath)) {
        // Intentar buscar variantes en local o descargar
        const tempDownloadPath = path.join(PHOTOS_DIR, `temp_${photoId}`);
        try {
          console.log(`   ⬇️ Descargando imagen faltante [${photoId}]...`);
          await downloadFile(data.imageUrl, tempDownloadPath);
          sourcePath = tempDownloadPath;
          downloadedCount++;
        } catch (err) {
          console.error(`   ❌ Error descargando ${photoId}:`, err.message);
        }
      }

      if (fs.existsSync(sourcePath)) {
        try {
          // Generar versión grande (1280px máx, calidad 80)
          execSync(`sips -s format jpeg -s formatOptions 80 -Z 1280 "${sourcePath}" --out "${destPhotoPath}" > /dev/null 2>&1`);
          // Generar miniatura (450px máx, calidad 75)
          execSync(`sips -s format jpeg -s formatOptions 75 -Z 450 "${sourcePath}" --out "${destThumbPath}" > /dev/null 2>&1`);
          processedCount++;
        } catch (e) {
          console.error(`   ⚠️ Error optimizando imagen para ${photoId}:`, e.message);
        }

        // Limpiar archivo temporal si se descargó
        if (sourcePath.startsWith(path.join(PHOTOS_DIR, "temp_")) && fs.existsSync(sourcePath)) {
          fs.unlinkSync(sourcePath);
        }
      }
    } else {
      skippedCount++;
    }

    // Normalizar objeto foto para el catálogo JSON
    photosList.push({
      id: photoId,
      title: data.title || "",
      description: data.description || "",
      year: data.year || null,
      owner: data.owner || data.facebookAuthor || "Archivo Histórico de Estella",
      photographer: data.photographer || "",
      location: data.location || "",
      collection: data.collection || "",
      tags: data.tags || [],
      quality: data.quality || "normal",
      priority: data.priority || "normal",
      relatedArticles: data.relatedArticles || [],
      facebookPostUrl: data.facebookPostUrl || "",
      facebookAuthor: data.facebookAuthor || "",
      // Rutas relativas para que funcionen directamente en Hostinger
      imageUrl: `/archive-photos/${photoId}.jpg`,
      thumbnailUrl: `/archive-photos/thumbs/${photoId}.jpg`,
      createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : (typeof data.createdAt === "number" ? data.createdAt : Date.now()),
    });

    if ((processedCount + skippedCount) % 100 === 0 || (processedCount + skippedCount) === snap.size) {
      process.stdout.write(`   Procesando: ${processedCount + skippedCount} / ${snap.size} fotos...\r`);
    }
  }

  console.log(`\n\n✅ Imágenes preparadas:`);
  console.log(`   - Nuevas optimizadas: ${processedCount}`);
  console.log(`   - Descargadas de Firebase: ${downloadedCount}`);
  console.log(`   - Ya existentes (omitidas): ${skippedCount}`);

  // Ordenar por fecha de creación descendente
  photosList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Guardar archivo JSON
  const jsonPath = path.join(DATA_DIR, "photos.json");
  fs.writeFileSync(jsonPath, JSON.stringify(photosList));
  const jsonSizeKb = Math.round(fs.statSync(jsonPath).size / 1024);

  console.log(`\n💾 Catálogo guardado en: public/data/photos.json (${jsonSizeKb} KB, ${photosList.length} fotos)`);

  // Extraer catálogo de Hemeroteca (artículos de prensa y documentación)
  const articlesList = [];
  const seenArticles = new Set();
  photosList.forEach((p) => {
    (p.relatedArticles || []).forEach((a) => {
      if (!a.titulo) return;
      const cleanTitle = a.titulo.trim();
      const key = cleanTitle.toLowerCase() + "_" + (a.fuente || "");
      if (seenArticles.has(key)) return;
      seenArticles.add(key);

      let year = null;
      if (a.fecha) {
        const m = String(a.fecha).match(/\b(19\d{2}|20\d{2})\b/);
        if (m) year = parseInt(m[1], 10);
      }
      if (!year && p.year) year = p.year;

      articlesList.push({
        id: "art_" + articlesList.length,
        titulo: cleanTitle,
        fuente: a.fuente || "callemayor",
        fecha: a.fecha || (year ? String(year) : ""),
        year: year,
        url: a.url || "",
        resumen: a.resumen || "",
        seccion: a.seccion || "",
        score: a.score || 0,
        photoId: p.id,
        photoTitle: p.title || p.description?.slice(0, 60) || "Fotografía de Estella",
        photoThumbnail: p.thumbnailUrl || p.imageUrl,
        photoYear: p.year,
      });
    });
  });
  articlesList.sort((a, b) => (b.year || 0) - (a.year || 0));
  const articlesPath = path.join(DATA_DIR, "articles.json");
  fs.writeFileSync(articlesPath, JSON.stringify(articlesList));
  const articlesSizeKb = Math.round(fs.statSync(articlesPath).size / 1024);
  console.log(`📰 Hemeroteca guardada en: public/data/articles.json (${articlesSizeKb} KB, ${articlesList.length} artículos)`);

  // Calcular espacio total ocupado
  try {
    const photosSize = execSync(`du -sh "${PHOTOS_DIR}"`).toString().trim().split("\t")[0];
    console.log(`📊 Espacio total ocupado por todas las imágenes en Hostinger: ${photosSize}`);
  } catch {}

  console.log("\n═══════════════════════════════════════════════════");
  console.log(" 🎉 ARCHIVO ESTÁTICO CREADO CON ÉXITO");
  console.log("═══════════════════════════════════════════════════\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
