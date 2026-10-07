/**
 * 03-import-firebase.ts
 * Uso: npx tsx scripts/03-import-firebase.ts [--dry-run] [--limit=50]
 * Requiere: service-account.json en la raiz del proyecto
 */

import { initializeApp, cert, ServiceAccount } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMPORT_DIR = path.join(__dirname, "../facebook-import");
const CATALOGED_FILE = path.join(IMPORT_DIR, "cataloged-posts.json");
const IMAGES_DIR = path.join(IMPORT_DIR, "images");
const LOG_FILE = path.join(IMPORT_DIR, "import-log.json");

const PROJECT_ID = "project-4938c1eb-c32b-4494-95c";
const STORAGE_BUCKET = "project-4938c1eb-c32b-4494-95c.firebasestorage.app";
const FIRESTORE_DB = "ai-studio-d55aaa70-4a7c-4319-86af-28ede5db32a3";
const IMPORTER_UID = process.env.IMPORTER_UID || "facebook-import-bot";

interface CatalogEntry {
  id: string; localImages: string[]; postText: string; postUrl: string;
  author: string; dateRaw: string; dateUnix?: number;
  aiTitle: string; aiDescription: string; aiYear?: number; aiYearRange?: string;
  aiLocation: string; aiTags: string[]; aiConfidence: "high" | "medium" | "low";
  processed: boolean; importedAt?: string;
}

function buildSearchTerms(e: CatalogEntry): string[] {
  const terms = new Set<string>();
  const add = (s?: string) => s?.toLowerCase().split(/[\s,.\-\/]+/).filter(t => t.length > 2).forEach(t => terms.add(t));
  add(e.aiTitle); add(e.aiLocation); add(e.postText);
  e.aiTags.forEach(t => terms.add(t));
  if (e.aiYear) terms.add(String(e.aiYear));
  if (e.aiYearRange) {
    const [y1, y2] = e.aiYearRange.split("-").map(Number);
    for (let y = y1; y <= y2; y += 5) terms.add(String(y));
  }
  return Array.from(terms).slice(0, 50);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limit = parseInt(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "9999");
  const from = parseInt(process.argv.find(a => a.startsWith("--from="))?.split("=")[1] ?? "0");

  if (dryRun) console.log("DRY RUN - no se subira nada.\n");

  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || path.join(__dirname, "../service-account.json");

  if (!fs.existsSync(serviceAccountPath)) {
    console.error(`No se encontro: ${serviceAccountPath}\n`);
    console.error("Para obtenerlo:");
    console.error("  1. Firebase Console -> tu proyecto -> Configuracion -> Cuentas de servicio");
    console.error("  2. 'Generar nueva clave privada' -> descarga el JSON");
    console.error(`  3. Guardalo como: ${path.join(__dirname, "../service-account.json")}`);
    process.exit(1);
  }

  const serviceAccount: ServiceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
  const app = initializeApp({ credential: cert(serviceAccount), storageBucket: STORAGE_BUCKET });
  const db = getFirestore(app, FIRESTORE_DB);
  const bucket = getStorage(app).bucket();

  if (!fs.existsSync(CATALOGED_FILE)) {
    console.error(`No existe ${CATALOGED_FILE}. Ejecuta primero 02-ai-catalog.ts`);
    process.exit(1);
  }

  const entries: CatalogEntry[] = JSON.parse(fs.readFileSync(CATALOGED_FILE, "utf-8"));
  const pending = entries.filter(e => !e.processed).slice(from, from + limit);
  console.log(`${entries.length} entradas totales | ${pending.length} por importar\n`);

  const log: Record<string, string> = fs.existsSync(LOG_FILE)
    ? JSON.parse(fs.readFileSync(LOG_FILE, "utf-8")) : {};

  let imported = 0, errors = 0;

  for (let i = 0; i < pending.length; i++) {
    const entry = pending[i];
    const imagePath = path.join(IMAGES_DIR, entry.localImages[0]);

    if (!fs.existsSync(imagePath)) {
      console.log(`[${i+1}/${pending.length}] Imagen no encontrada: ${imagePath}`);
      continue;
    }

    process.stdout.write(`[${i+1}/${pending.length}] ${entry.aiTitle || entry.id}... `);

    try {
      let imageUrl = "";
      const storagePath = `photos/facebook-import/${entry.id}/${entry.localImages[0]}`;

      if (!dryRun) {
        await bucket.upload(imagePath, {
          destination: storagePath,
          metadata: {
            contentType: imagePath.endsWith(".png") ? "image/png" : "image/jpeg",
            metadata: { source: "facebook-import", originalPostUrl: entry.postUrl },
          },
        });
        const [file] = await bucket.file(storagePath).getSignedUrl({ action: "read", expires: "03-01-2500" });
        imageUrl = file;
      } else {
        imageUrl = `[DRY] gs://${STORAGE_BUCKET}/${storagePath}`;
      }

      const description = [
        entry.aiDescription,
        entry.postText ? `\nTexto original del post: "${entry.postText.slice(0, 500)}"` : "",
      ].filter(Boolean).join("\n");

      const photoDoc: Record<string, unknown> = {
        title: entry.aiTitle || entry.postText.slice(0, 80) || "Sin titulo",
        imageUrl,
        thumbnailUrl: imageUrl,
        owner: entry.author || "Desconocido",
        location: entry.aiLocation || null,
        collection: "Fotos Antiguas Facebook",
        source: "Grupo Facebook: Fotos Antiguas de Estella-Lizarra",
        year: entry.aiYear || null,
        description,
        tags: entry.aiTags,
        searchTerms: buildSearchTerms(entry),
        uploadedBy: IMPORTER_UID,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        facebookPostUrl: entry.postUrl || null,
        facebookAuthor: entry.author || null,
        aiYearRange: entry.aiYearRange || null,
        aiConfidence: entry.aiConfidence,
      };

      // Limpiar nulls
      Object.keys(photoDoc).forEach(k => photoDoc[k] === null && delete photoDoc[k]);

      if (!dryRun) {
        const docRef = await db.collection("photos").add(photoDoc);
        log[entry.id] = docRef.id;
        fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
        entry.processed = true;
        entry.importedAt = new Date().toISOString();
        fs.writeFileSync(CATALOGED_FILE, JSON.stringify(entries, null, 2));
      }

      imported++;
      console.log(`OK ${dryRun ? "" : `-> ${log[entry.id]}`}`);
    } catch (e: any) {
      errors++;
      console.log(`ERROR: ${e.message}`);
    }

    if (!dryRun) await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nImportacion ${dryRun ? "simulada" : "completada"}.`);
  console.log(`  OK: ${imported} | Errores: ${errors}`);
  if (!dryRun) console.log(`  Log: ${LOG_FILE}`);
}

main().catch(console.error);
