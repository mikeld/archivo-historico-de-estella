/**
 * 03-import-firebase-client.ts
 * Importa fotos a Firebase usando el SDK de Cliente (sin requerir service-account.json).
 * Inicia sesión con el email/password del bot configurados en el archivo .env.
 * 
 * Uso: npx tsx scripts/03-import-firebase-client.ts [--dry-run] [--limit=50]
 */

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, addDoc, serverTimestamp, doc, setDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");
const IMPORT_DIR = path.join(PROJECT_ROOT, "facebook-import");
const CATALOGED_FILE = path.join(IMPORT_DIR, "cataloged-posts.json");
const IMAGES_DIR = path.join(IMPORT_DIR, "images");
const LOG_FILE = path.join(IMPORT_DIR, "import-log.json");

// Load Firebase Config
const rawConfig = fs.readFileSync(path.join(PROJECT_ROOT, "firebase-applet-config.json"), "utf8");
const firebaseConfig = JSON.parse(rawConfig);

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
  
  if (dryRun) console.log("DRY RUN - no se subirá nada.\n");

  const botEmail = process.env.IMPORT_BOT_EMAIL;
  const botPassword = process.env.IMPORT_BOT_PASSWORD;

  if (!botEmail || !botPassword) {
    console.error("Error: IMPORT_BOT_EMAIL y IMPORT_BOT_PASSWORD deben estar configurados en el archivo .env");
    process.exit(1);
  }

  if (!fs.existsSync(CATALOGED_FILE)) {
    console.error(`Error: No existe el archivo ${CATALOGED_FILE}`);
    process.exit(1);
  }

  const entries: CatalogEntry[] = JSON.parse(fs.readFileSync(CATALOGED_FILE, "utf-8"));
  const pending = entries.filter(e => !e.processed && e.localImages && e.localImages.length > 0);

  console.log(`Encontrados ${pending.length} posts pendientes de importar.`);
  if (pending.length === 0) {
    console.log("Nada que importar.");
    process.exit();
  }

  // Initialize Firebase Client SDK
  console.log("Inicializando Firebase...");
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  const storage = getStorage(app);

  console.log(`Iniciando sesión como ${botEmail}...`);
  const userCredential = await signInWithEmailAndPassword(auth, botEmail, botPassword);
  const user = userCredential.user;
  console.log("Sesión iniciada con UID:", user.uid);

  const log = fs.existsSync(LOG_FILE) ? JSON.parse(fs.readFileSync(LOG_FILE, "utf-8")) : {};
  let imported = 0, errors = 0;

  const toProcess = pending.slice(0, limit);
  console.log(`Procesando ${toProcess.length} posts...`);

  for (let i = 0; i < toProcess.length; i++) {
    const entry = toProcess[i];
    const imagePath = path.join(IMAGES_DIR, entry.localImages[0]);

    if (!fs.existsSync(imagePath)) {
      console.log(`[${i+1}/${toProcess.length}] Imagen no encontrada: ${imagePath}`);
      continue;
    }

    process.stdout.write(`[${i+1}/${toProcess.length}] subiendo "${entry.aiTitle || entry.id}"... `);

    try {
      let imageUrl = "";
      const storagePath = `photos/facebook-import/${entry.id}/${entry.localImages[0]}`;

      if (!dryRun) {
        // Upload to Firebase Storage using Client SDK
        const storageRef = ref(storage, storagePath);
        const imageBuffer = fs.readFileSync(imagePath);
        
        await uploadBytes(storageRef, imageBuffer, {
          contentType: imagePath.endsWith(".png") ? "image/png" : "image/jpeg",
          customMetadata: { source: "facebook-import", originalPostUrl: entry.postUrl }
        });
        
        imageUrl = await getDownloadURL(storageRef);
      } else {
        imageUrl = `[DRY] https://storage.googleapis.com/${firebaseConfig.storageBucket}/${storagePath}`;
      }

      const description = [
        entry.aiDescription,
        entry.postText ? `\nTexto original del post: "${entry.postText.slice(0, 500)}"` : "",
      ].filter(Boolean).join("\n");

      const photoDoc: Record<string, any> = {
        title: entry.aiTitle || entry.postText.slice(0, 80) || "Sin título",
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
        uploadedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        facebookPostUrl: entry.postUrl || null,
        facebookAuthor: entry.author || null,
        aiYearRange: entry.aiYearRange || null,
        aiConfidence: entry.aiConfidence,
      };

      // Clean nulls
      Object.keys(photoDoc).forEach(k => photoDoc[k] === null && delete photoDoc[k]);

      if (!dryRun) {
        // Create document in Firestore with custom ID to prevent duplicates
        const docId = `fb_${entry.id}`;
        await setDoc(doc(db, "photos", docId), photoDoc);
        
        log[entry.id] = docId;
        fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
        
        entry.processed = true;
        entry.importedAt = new Date().toISOString();
        fs.writeFileSync(CATALOGED_FILE, JSON.stringify(entries, null, 2));
      }

      imported++;
      console.log(`OK ${dryRun ? "" : `-> fb_${entry.id}`}`);
    } catch (e: any) {
      errors++;
      console.log(`ERROR: ${e.message}`);
    }

    if (!dryRun) await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nImportación ${dryRun ? "simulada" : "completada"}.`);
  console.log(`  OK: ${imported} | Errores: ${errors}`);
}

main().catch(console.error);
