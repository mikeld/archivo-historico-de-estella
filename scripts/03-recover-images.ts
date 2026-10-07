/**
 * 03-recover-images.ts
 * Recupera las imágenes de las fotos históricas ya catalogadas.
 * Lee cataloged-posts.json, navega a cada foto en Facebook
 * y descarga la imagen usando las cookies del browser.
 *
 * Uso: npx tsx scripts/03-recover-images.ts
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMPORT_DIR    = path.join(__dirname, "../facebook-import");
const CATALOGED     = path.join(IMPORT_DIR, "cataloged-posts.json");
const IMAGES_DIR    = path.join(IMPORT_DIR, "images");
const PROFILE_DIR   = path.join(IMPORT_DIR, ".browser-profile");
const MIN_SIZE      = 10240;

function saveJson(file: string, data: unknown) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function downloadImage(page: any, photoId: string, postUrl?: string): Promise<{ buffer: Buffer; ext: string } | null> {
  // Usar postUrl directo (sin query params) o construir URL de foto
  let url = postUrl ? postUrl.split("?")[0] : `https://www.facebook.com/photo/?fbid=${photoId}`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(800);

    await page.waitForSelector('img[src*="fbcdn"]', { timeout: 6000 }).catch(() => {});

    const imgs = await page.locator('img[src*="fbcdn"]').all();
    let bestSrc = "";
    let bestWidth = 0;

    for (const img of imgs) {
      const src = await img.getAttribute("src").catch(() => "");
      if (!src) continue;
      if (src.includes("emoji") || src.includes("avatar") ||
          src.includes("/p32x32/") || src.includes("/p40x40/") ||
          src.includes("/p50x50/") || src.includes("/p64x64/")) continue;
      const w = await img.evaluate((el: HTMLImageElement) => el.naturalWidth).catch(() => 0);
      if (w > bestWidth) { bestWidth = w; bestSrc = src; }
    }

    if (!bestSrc || bestWidth < 100) return null;

    const response = await page.request.get(bestSrc, {
      headers: { Referer: "https://www.facebook.com/" },
      timeout: 20000,
    });

    if (!response.ok()) return null;
    const buffer = await response.body();
    if (!buffer || buffer.length < MIN_SIZE) return null;

    const ext = bestSrc.includes(".png") ? "png" : bestSrc.includes(".webp") ? "webp" : "jpg";
    return { buffer, ext };
  } catch {
    return null;
  }
}

async function main() {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  if (!fs.existsSync(CATALOGED)) {
    console.error("❌ No existe cataloged-posts.json"); process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(CATALOGED, "utf-8"));
  const total = catalog.reduce((n: number, e: any) => n + (e.images?.length || 0), 0);
  const pending = catalog.filter((e: any) =>
    (e.images || []).some((img: any) => {
      if (!img.localImage) return true;
      const p = path.join(IMAGES_DIR, img.localImage);
      return !fs.existsSync(p) || fs.statSync(p).size < MIN_SIZE;
    })
  );

  console.log(`\n══════════════════════════════════════`);
  console.log(` Fotos históricas catalogadas: ${catalog.length}`);
  console.log(` Imágenes totales: ${total}`);
  console.log(` Posts sin imagen local: ${pending.length}`);
  console.log(`══════════════════════════════════════\n`);

  if (pending.length === 0) {
    console.log("✅ Todas las imágenes ya están descargadas."); return;
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: "es-ES",
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] ?? await context.newPage();

  // Navegar a Facebook primero para verificar la sesión
  console.log("Abriendo Facebook...");
  await page.goto("https://www.facebook.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);

  console.log("\n📌 Comprueba que estás logueado en Facebook.");
  console.log("   Cuando estés listo, pulsa ENTER...\n");
  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => { process.stdin.pause(); resolve(); });
  });

  let downloaded = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const entry = pending[i];
    process.stdout.write(`[${i + 1}/${pending.length}] Foto ${entry.id}... `);

    const result = await downloadImage(page, entry.id, entry.postUrl);

    if (!result) {
      console.log("❌ sin imagen");
      failed++;
    } else {
      const filename = `${entry.id}_0.${result.ext}`;
      const dest = path.join(IMAGES_DIR, filename);
      fs.writeFileSync(dest, result.buffer);

      // Actualizar todas las imágenes del entry con este filename
      if (entry.images) {
        entry.images.forEach((img: any) => { img.localImage = filename; });
      }

      console.log(`✅ ${(result.buffer.length / 1024).toFixed(0)} KB`);
      downloaded++;
    }

    // Guardar progreso cada 10 fotos
    if ((i + 1) % 10 === 0) {
      saveJson(CATALOGED, catalog);
      console.log(`  💾 Guardado (${downloaded} descargadas)`);
    }

    await page.waitForTimeout(400);
  }

  saveJson(CATALOGED, catalog);
  await context.close();

  console.log(`\n══════════════════════════════════════`);
  console.log(` ✅ Recuperación completada`);
  console.log(` Descargadas: ${downloaded} | Fallidas: ${failed}`);
  console.log(`══════════════════════════════════════`);
  console.log(`\nSiguiente: abre import-fotos.html en el navegador\n`);
}

main().catch(console.error);
