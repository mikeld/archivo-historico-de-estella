/**
 * 01-facebook-scraper.ts  v6
 * Scraper de la pestaña FOTOS del grupo (no el feed).
 * La pestaña de fotos carga TODAS las fotos históricas sin límite de scroll.
 *
 * v6: NO descarga imágenes (las descarga 02-ai-catalog solo para las históricas)
 *     Tiempos reducidos → ~3-4x más rápido
 *
 * Modos:
 *   npx tsx scripts/01-facebook-scraper.ts             → todo el historial
 *   npx tsx scripts/01-facebook-scraper.ts --mode=new  → solo fotos nuevas
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────
const townArg = process.argv.find(a => a.startsWith("--town="))?.split("=")[1] || "estella-lizarra";
const groupUrlArg = process.argv.find(a => a.startsWith("--group-url="))?.split("=")[1];
const townSources = JSON.parse(fs.readFileSync(path.join(__dirname, "town-sources.json"), "utf8"));
const townConfig = townSources[townArg] || townSources["estella-lizarra"];

const GROUP_PHOTOS_URL = groupUrlArg
  ? (groupUrlArg.includes("/media/photos") ? groupUrlArg : `${groupUrlArg.replace(/\/$/, "")}/media/photos`)
  : (townConfig.facebookPhotosUrl || "https://www.facebook.com/groups/393354891012356/media/photos");
const OUTPUT_DIR       = townArg === "estella-lizarra"
  ? path.join(__dirname, "../facebook-import")
  : path.join(__dirname, `../facebook-import/${townArg}`);
const IMAGES_DIR       = path.join(OUTPUT_DIR, "images");
const RAW_FILE         = path.join(OUTPUT_DIR, "raw-posts.json");
const STATE_FILE       = path.join(OUTPUT_DIR, "scraper-state.json");
const PROFILE_DIR      = path.join(__dirname, "../facebook-import/.browser-profile");

const limitArg          = process.argv.find(a => a.startsWith("--limit="))?.split("=")[1];
const MAX_PHOTOS        = limitArg ? parseInt(limitArg, 10) : 6000;
const SCROLL_PAUSE_MS   = 2000;
const MAX_EMPTY_SCROLLS = 15;
const SAVE_EVERY        = 50;   // guardar cada 50 (no cada 20)

const MODE: "all" | "new" = process.argv.includes("--mode=new") ? "new" : "all";
const SKIP_GRID = process.argv.includes("--skip-grid");
const IS_AUTO = process.argv.includes("--auto") || !process.stdin.isTTY;
// ──────────────────────────────────────────────────────────────────────────────

interface RawPost {
  id: string; postText: string; dateRaw: string; dateUnix?: number;
  imageUrls: string[]; localImages: string[]; postUrl: string;
  facebookAuthor: string; facebookAuthorUrl: string; facebookComments: string[];
  scrapedAt: string;
}

function loadJson<T>(file: string, fallback: T): T {
  if (fs.existsSync(file)) { try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch {} }
  return fallback;
}
function saveJson(file: string, data: unknown) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// v6: no descargamos imágenes en el scraper — las descarga 02-ai-catalog tras el filtro IA

function bigImageUrl(src: string): string {
  // Mantener query params (pueden ser necesarios para auth en el fetch del browser)
  return src.replace(/\/[sp]\d+x\d+\//, "/").replace(/_[stqb]\.(jpg|png|webp)/, "_n.$1");
}

/** Abre un popup de foto y extrae toda la información enriquecida (post completo + hilo de comentarios profundo) */
async function scrapePhotoDetail(page: any, photoUrl: string): Promise<{
  postText: string; dateRaw: string; dateUnix?: number;
  facebookAuthor: string; facebookAuthorUrl: string;
  facebookComments: string[]; imageUrl: string; postUrl: string;
  commentImages?: string[];
}> {
  // 1. Expandir texto del post si hay botón "Ver más"
  try {
    const seeMore = page.locator('[role="button"]:has-text("Ver más"), [role="button"]:has-text("See more")').first();
    if (await seeMore.isVisible({ timeout: 500 }).catch(() => false)) {
      await seeMore.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  } catch {}

  // 2. Expandir comentarios anteriores / ver más comentarios (hasta 4 veces) para conseguir el debate vecinal
  try {
    for (let i = 0; i < 4; i++) {
      const moreCommentsBtn = page.locator('[role="button"]:has-text("Ver más comentarios"), [role="button"]:has-text("Ver comentarios anteriores"), [role="button"]:has-text("View more comments"), [role="button"]:has-text("comentarios anteriores")').first();
      if (await moreCommentsBtn.isVisible({ timeout: 400 }).catch(() => false)) {
        await moreCommentsBtn.click().catch(() => {});
        await page.waitForTimeout(400);
      } else {
        break;
      }
    }
  } catch {}

  const detail = await page.evaluate(() => {
    let postText = "";
    for (const sel of ['[data-ad-comet-preview="message"]', '[data-ad-preview="message"]']) {
      const el = document.querySelector(sel);
      if (el && el.textContent) { postText = el.textContent.trim(); break; }
    }
    if (!postText) {
      for (const div of Array.from(document.querySelectorAll('div[dir="auto"]'))) {
        const t = (div.textContent || "").trim();
        if (t.length > postText.length && t.length > 15 && !t.includes("Mueve el ratón")) {
          postText = t;
        }
      }
    }

    let dateRaw = "";
    let dateUnix: number | undefined;
    const abbr = document.querySelector("abbr");
    if (abbr) {
      dateRaw = abbr.textContent?.trim() || "";
      const ut = abbr.getAttribute("data-utime");
      if (ut) dateUnix = parseInt(ut, 10);
    }
    if (!dateRaw) {
      for (const s of Array.from(document.querySelectorAll("span[title]"))) {
        const t = s.getAttribute("title") || "";
        if (/\d{4}/.test(t)) { dateRaw = t; break; }
      }
    }

    let facebookAuthor = "";
    let facebookAuthorUrl = "";
    const a = document.querySelector("strong a, h3 a, h4 a");
    if (a) {
      facebookAuthor = a.textContent?.trim() || "";
      const href = a.getAttribute("href") || "";
      facebookAuthorUrl = href.startsWith("http") ? href : (href ? "https://www.facebook.com" + href : "");
    }

    // Extraer TODOS los comentarios con autor si está disponible
    const facebookComments: string[] = [];
    const commentNodes = Array.from(document.querySelectorAll('[aria-label*="comentario"], [data-commentid]'));
    for (const c of commentNodes) {
      const authorNode = c.querySelector('span[dir="auto"] strong, a strong');
      const author = authorNode ? authorNode.textContent?.trim() + ": " : "";
      const t = (c.textContent || "").trim();
      if (t.length > 3 && !t.includes("Me gusta") && !t.includes("Responder")) {
        // Limpiar botones repetidos de la UI de FB
        const cleanT = t.replace(/\b(Me gusta|Responder|Compartir|\d+[hdsm]|Hace \d+.*?)\b/g, "").trim();
        if (cleanT.length > 3) {
          facebookComments.push(author ? author + cleanT : cleanT);
        }
      }
    }

    // Extraer fotos adjuntas dentro de los comentarios
    const commentImages: string[] = [];
    for (const c of commentNodes) {
      const img = c.querySelector('img[src*="fbcdn"]') as HTMLImageElement;
      if (img && img.src && !img.src.includes("emoji") && !img.src.includes("avatar")) {
        commentImages.push(img.src);
      }
    }

    // Buscar la imagen principal más grande
    let bestSrc = "";
    let bestSize = 0;
    for (const img of Array.from(document.querySelectorAll('img[src*="fbcdn"]')) as HTMLImageElement[]) {
      const src = img.src || "";
      if (!src || src.includes("emoji") || src.includes("avatar") || src.includes("/p32x32/") || src.includes("/p40x40/") || src.includes("/p50x50/")) continue;
      const w = img.naturalWidth || img.width || 0;
      if (w > bestSize) {
        bestSize = w;
        bestSrc = src;
      }
    }

    return { postText, dateRaw, dateUnix, facebookAuthor, facebookAuthorUrl, facebookComments, imageUrl: bestSrc, commentImages };
  }).catch(() => null);

  if (!detail) {
    return { postText: "", dateRaw: "", facebookAuthor: "", facebookAuthorUrl: "", facebookComments: [], imageUrl: "", postUrl: photoUrl };
  }

  const finalImageUrl = detail.imageUrl ? bigImageUrl(detail.imageUrl) : "";
  const finalCommentImages = (detail.commentImages || []).map((src: string) => bigImageUrl(src));
  return { ...detail, imageUrl: finalImageUrl, postUrl: photoUrl, commentImages: finalCommentImages };
}

async function main() {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const savedPosts = loadJson<RawPost[]>(RAW_FILE, []);
  const savedIds   = new Set(savedPosts.map(p => p.id));
  const newPosts: RawPost[] = [];

  console.log(`\n══════════════════════════════════════`);
  console.log(` Modo: ${MODE === "new" ? "NUEVOS (diario)" : "COMPLETO (todas las fotos)"}`);
  console.log(` Posts ya guardados: ${savedPosts.length}`);
  console.log(` Estrategia: pestaña FOTOS del grupo (sin límite de scroll)`);
  console.log(`══════════════════════════════════════\n`);

  // Usar perfil persistente → en modo automático o desatendido es 100% invisible (headless: true)
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: IS_AUTO,
    viewport: { width: 1280, height: 900 },
    locale: "es-ES",
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] ?? await context.newPage();

  console.log("Abriendo pestaña de Fotos del grupo...");
  await page.goto(GROUP_PHOTOS_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  if (!IS_AUTO) {
    console.log("\n📌 Si Facebook pide login, hazlo ahora.");
    console.log("   Cuando veas la cuadrícula de fotos, pulsa ENTER...\n");
    await new Promise<void>((resolve) => {
      process.stdin.resume();
      process.stdin.once("data", () => { process.stdin.pause(); resolve(); });
    });
  } else {
    console.log("\n⚡ Modo automático (desatendido): esperando carga de la cuadrícula...");
    await page.waitForTimeout(4000);
  }

  // Cerrar popups
  for (const sel of ['[aria-label="Close"]', '[aria-label="Cerrar"]']) {
    try { const el = page.locator(sel).first(); if (await el.isVisible({ timeout: 800 })) await el.click(); } catch {}
  }
  await page.waitForTimeout(1500);

  console.log("▶ Recolectando URLs de fotos de la cuadrícula...\n");

  // ── FASE 1: Recopilar todas las URLs de fotos haciendo scroll en la cuadrícula ──
  // Cargar URLs ya recopiladas en sesiones anteriores (por si se interrumpió)
  const URLS_FILE = path.join(OUTPUT_DIR, "photo-urls.json");
  const photoUrls = new Set<string>(loadJson<string[]>(URLS_FILE, []));
  if (photoUrls.size > 0) console.log(`  Reanudando: ${photoUrls.size} URLs ya recopiladas\n`);

  let emptyScrolls = 0;
  let scrollCount  = 0;
  const MAX_SCROLLS_MODE = MODE === "new" ? 6 : 999999;

  if (!SKIP_GRID) {
    while (photoUrls.size < MAX_PHOTOS && emptyScrolls < MAX_EMPTY_SCROLLS && scrollCount < MAX_SCROLLS_MODE) {
      const links = await page.locator('a[href*="/photo/"], a[href*="/photos/"]').all();
      let foundNew = 0;
      for (const link of links) {
        const href = await link.getAttribute("href").catch(() => "");
        if (!href) continue;
        const fullUrl = href.startsWith("http") ? href : "https://www.facebook.com" + href;
        const photoId = fullUrl.match(/\/photo\/(\d+)/)?.[1] || fullUrl.match(/fbid=(\d+)/)?.[1];
        if (!photoId) continue;
        if (!photoUrls.has(photoId)) { photoUrls.add(photoId); foundNew++; }
      }

      emptyScrolls = foundNew > 0 ? 0 : emptyScrolls + 1;
      scrollCount++;
      process.stdout.write(`\rFotos encontradas: ${photoUrls.size} | Scroll: ${scrollCount} | Sin nuevas: ${emptyScrolls}/${MAX_EMPTY_SCROLLS}   `);

      // Guardar URLs cada 50 scrolls por si se interrumpe
      if (scrollCount % 50 === 0) saveJson(URLS_FILE, [...photoUrls]);

      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 3));
      await page.waitForTimeout(SCROLL_PAUSE_MS);
    }

    // Guardar lista completa de URLs al terminar la fase 1
    saveJson(URLS_FILE, [...photoUrls]);
    console.log(`\n\n✅ Cuadrícula completa: ${photoUrls.size} fotos encontradas\n`);
  } else {
    console.log(`\n⏭ Saltando fase de scroll (--skip-grid activo). Usando ${photoUrls.size} URLs recopiladas.\n`);
  }

  // ── FASE 2: Visitar cada foto y extraer detalles ──────────────────────────────
  const pendingPhotoIds = [...photoUrls]
    .filter(id => !savedIds.has(id))
    .slice(0, limitArg ? parseInt(limitArg, 10) : undefined);
  console.log(`▶ Fotos nuevas pendientes de procesar: ${pendingPhotoIds.length}\n`);

  if (pendingPhotoIds.length === 0) {
    console.log("✅ No hay fotos nuevas pendientes. Todo al día.");
    await context.close();
    return;
  }

  let processed = 0;

  for (const photoId of pendingPhotoIds) {
    if (savedPosts.length + newPosts.length >= MAX_PHOTOS) break;

    const photoUrl = `https://www.facebook.com/photo/?fbid=${photoId}`;
    process.stdout.write(`[${processed + 1}/${pendingPhotoIds.length}] Abriendo foto ${photoId}... `);

    try {
      await page.goto(photoUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(400);

      const detail = await scrapePhotoDetail(page, photoUrl);

      if (!detail.imageUrl) {
        process.stdout.write("(sin imagen / 3D omitida)\n");
        processed++;
        continue;
      }

      // Descargar imagen directamente a la carpeta local
      const localFilename = `${photoId}.jpg`;
      const localPath = path.join(IMAGES_DIR, localFilename);
      const localImages: string[] = [];

      try {
        if (fs.existsSync(localPath) && fs.statSync(localPath).size > 10240) {
          localImages.push(localFilename);
        } else {
          const resp = await page.request.get(detail.imageUrl, {
            headers: { Referer: "https://www.facebook.com/" },
            timeout: 10000,
          });
          if (resp.ok()) {
            const buffer = await resp.body();
            if (buffer.length > 10240) {
              fs.writeFileSync(localPath, buffer);
              localImages.push(localFilename);
            }
          }
        }
      } catch (err: any) {
        process.stdout.write(`(err descarga: ${err.message?.slice(0, 30)}) `);
      }

      const post: RawPost = {
        id: photoId,
        postText: detail.postText,
        dateRaw: detail.dateRaw,
        dateUnix: detail.dateUnix,
        imageUrls: [detail.imageUrl],
        localImages,
        postUrl: photoUrl,
        facebookAuthor: detail.facebookAuthor,
        facebookAuthorUrl: detail.facebookAuthorUrl,
        facebookComments: detail.facebookComments,
        scrapedAt: new Date().toISOString(),
      };

      newPosts.push(post);
      savedIds.add(photoId);

      const d = detail.dateRaw || (detail.dateUnix ? new Date(detail.dateUnix * 1000).toLocaleDateString("es-ES") : "?");
      console.log(`✅ ${d} | ${detail.facebookAuthor || "?"} | ${detail.postText.slice(0, 50).replace(/\n/g, " ") || "(sin texto)"}`);

      if (newPosts.length % SAVE_EVERY === 0) {
        saveJson(RAW_FILE, [...savedPosts, ...newPosts]);
        console.log(`  💾 Checkpoint: ${savedPosts.length + newPosts.length} posts guardados`);
      }
    } catch (e: any) {
      console.log(`ERROR: ${e.message?.slice(0, 60)}`);
    }

    processed++;
    await page.waitForTimeout(200);  // v6: reducido de 800 → 200ms
  }

  // Guardar todo
  const allPosts = [...savedPosts, ...newPosts];
  saveJson(RAW_FILE, allPosts);
  saveJson(STATE_FILE, { totalScraped: allPosts.length, lastRunAt: new Date().toISOString() });

  console.log(`\n══════════════════════════════════════`);
  console.log(` ✅ Scraping finalizado`);
  console.log(` Nuevos esta sesión: ${newPosts.length} | Total: ${allPosts.length}`);
  console.log(`══════════════════════════════════════`);
  console.log(`\nSiguiente: npx tsx scripts/02-ai-catalog.ts\n`);

  await context.close();
}

main().catch(console.error);
