/**
 * 03-download-images.ts
 * Descarga imágenes para posts que ya tienen metadatos pero no imagen local.
 * Usa el browser con tu sesión de Facebook → no pide login.
 *
 * Uso: npx tsx scripts/03-download-images.ts
 *
 * - Lee raw-posts.json
 * - Salta posts que ya tienen imagen local válida
 * - Para el resto: abre la foto en el browser y descarga la imagen
 * - Actualiza raw-posts.json con localImages
 * - Si se interrumpe: relánzalo, continúa donde estaba
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUTPUT_DIR  = path.join(__dirname, "../facebook-import");
const RAW_FILE    = path.join(OUTPUT_DIR, "raw-posts.json");
const IMAGES_DIR  = path.join(OUTPUT_DIR, "images");
const PROFILE_DIR = path.join(OUTPUT_DIR, ".browser-profile");

const MIN_IMAGE_SIZE = 10240; // 10 KB mínimo

// Hash del anuncio de Aerolineas Argentinas que Facebook devuelve para fotos no disponibles.
// Se calcula automáticamente la primera vez que aparece y se guarda aquí.
let AD_IMAGE_HASH = "";
const PAUSE_MS       = 300;   // pausa entre fotos (ms)
const SAVE_EVERY     = 50;    // guardar raw-posts.json cada N fotos

interface RawPost {
  id: string; postText: string; dateRaw: string; dateUnix?: number;
  imageUrls: string[]; localImages: string[]; postUrl: string;
  facebookAuthor?: string; facebookAuthorUrl?: string; scrapedAt?: string;
}

function loadJson<T>(file: string, fallback: T): T {
  if (fs.existsSync(file)) { try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch {} }
  return fallback;
}
function saveJson(file: string, data: unknown) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function hasValidLocalImage(post: RawPost): boolean {
  return post.localImages.some(img => {
    const p = path.join(IMAGES_DIR, img);
    return fs.existsSync(p) && fs.statSync(p).size > MIN_IMAGE_SIZE;
  });
}

function bigImageUrl(src: string): string {
  return src.replace(/\/[sp]\d+x\d+\//, "/").replace(/_[stqb]\.(jpg|png|webp)/, "_n.$1");
}

async function downloadWithBrowser(page: any, photoUrl: string, imageUrl: string, dest: string): Promise<boolean> {
  try {
    // Navegar siempre a la página de la foto para obtener URL fresca
    await page.goto(photoUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(600);

    // Buscar la imagen más grande
    await page.waitForSelector('img[src*="fbcdn"]', { timeout: 5000 }).catch(() => {});
    const imgs = await page.locator('img[src*="fbcdn"]').all();
    let bestSrc = "";
    let bestSize = 0;
    for (const img of imgs) {
      const src = await img.getAttribute("src").catch(() => "");
      if (!src || src.includes("emoji") || src.includes("avatar") ||
          src.includes("/p32x32/") || src.includes("/p40x40/") || src.includes("/p50x50/")) continue;
      const w = await img.evaluate((el: HTMLImageElement) => el.naturalWidth).catch(() => 0);
      if (w > bestSize) { bestSize = w; bestSrc = src; }
    }

    if (!bestSrc) return false;

    const freshUrl = bigImageUrl(bestSrc);
    const response2 = await page.request.get(freshUrl, {
      headers: { Referer: "https://www.facebook.com/" },
      timeout: 20000,
    });
    if (!response2.ok()) return false;
    const buffer2 = await response2.body();
    if (!buffer2 || buffer2.length < MIN_IMAGE_SIZE) return false;

    // Rechazar si es el anuncio placeholder (siempre el mismo hash)
    const hash = crypto.createHash("md5").update(buffer2).digest("hex");
    if (!AD_IMAGE_HASH && buffer2.length < 130000) {
      AD_IMAGE_HASH = hash;
      process.stdout.write(`(anuncio detectado: ${hash.slice(0,8)}) `);
      return false;
    }
    if (AD_IMAGE_HASH && hash === AD_IMAGE_HASH) return false;

    fs.writeFileSync(dest, buffer2);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const posts = loadJson<RawPost[]>(RAW_FILE, []);
  if (posts.length === 0) {
    console.error("❌ raw-posts.json vacío o no existe.");
    process.exit(1);
  }

  // Posts que necesitan imagen
  const pending = posts.filter(p => !hasValidLocalImage(p) && p.imageUrls?.length > 0);
  const already = posts.length - pending.length;

  console.log(`\n══════════════════════════════════════════`);
  console.log(` Total posts: ${posts.length}`);
  console.log(` Ya tienen imagen: ${already}`);
  console.log(` Pendientes de descargar: ${pending.length}`);
  console.log(`══════════════════════════════════════════\n`);

  if (pending.length === 0) {
    console.log("✅ Todos los posts ya tienen imagen. Nada que hacer.");
    return;
  }

  // Abrir browser con perfil persistente (sesión de Facebook guardada)
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: "es-ES",
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] ?? await context.newPage();

  console.log("📌 Si Facebook pide login, hazlo ahora.");
  console.log("   Cuando estés listo, pulsa ENTER...\n");
  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => { process.stdin.pause(); resolve(); });
  });

  // Índice para actualizar posts por ID
  const postIndex = new Map(posts.map(p => [p.id, p]));

  let downloaded = 0;
  let failed = 0;
  let savedCount = 0;

  for (let i = 0; i < pending.length; i++) {
    const post = pending[i];
    const photoUrl = post.postUrl || `https://www.facebook.com/photo/?fbid=${post.id}`;
    const imageUrl = post.imageUrls[0];
    const ext = imageUrl.includes(".png") ? "png" : imageUrl.includes(".webp") ? "webp" : "jpg";
    const filename = `${post.id}_0.${ext}`;
    const dest = path.join(IMAGES_DIR, filename);

    process.stdout.write(`[${i + 1}/${pending.length}] ${post.id}... `);

    // Si ya existe en disco (de una sesión anterior interrumpida)
    if (fs.existsSync(dest) && fs.statSync(dest).size > MIN_IMAGE_SIZE) {
      const p = postIndex.get(post.id)!;
      p.localImages = [filename];
      console.log("ya existe ✓");
      downloaded++;
    } else {
      const ok = await downloadWithBrowser(page, photoUrl, imageUrl, dest);
      if (ok) {
        const p = postIndex.get(post.id)!;
        p.localImages = [filename];
        console.log(`✅ descargada (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
        downloaded++;
      } else {
        console.log("❌ falló");
        failed++;
      }
    }

    savedCount++;
    if (savedCount % SAVE_EVERY === 0) {
      saveJson(RAW_FILE, posts);
      console.log(`  💾 Checkpoint: ${downloaded} descargadas, ${failed} fallidas`);
    }

    await page.waitForTimeout(PAUSE_MS);
  }

  // Guardar final
  saveJson(RAW_FILE, posts);

  console.log(`\n══════════════════════════════════════════`);
  console.log(` ✅ Descarga completada`);
  console.log(` Descargadas: ${downloaded}`);
  console.log(` Fallidas:    ${failed}`);
  console.log(`══════════════════════════════════════════`);
  console.log(`\nSiguiente: npx tsx scripts/02-ai-catalog.ts\n`);

  await context.close();
}

main().catch(console.error);
