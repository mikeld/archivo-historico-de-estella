/**
 * scripts/daily-sync.ts
 * 
 * Pipeline Unificado de Sincronización Diaria:
 * 1. Facebook Scraper (modo incremental / fotos nuevas) con extracción profunda de comentarios.
 * 2. IA Catalogación con Gemini 2.5 Flash (filtro histórico, año, fotógrafo, personas, landmarkId estricto).
 * 3. Conversión instantánea a WebP (alta resolución 1280px + miniatura 450px con cwebp).
 * 4. Subida directa a Cloudflare R2 (CDN global con 0€ de coste de tráfico).
 * 5. Actualización de public/data/photos.json y auto-deploy a Hostinger via Git push.
 * 
 * Uso: npx tsx scripts/daily-sync.ts [--auto]
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// Asegurar que Homebrew, Node y utilidades de macOS están en PATH para launchd
const EXTRA_PATHS = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
process.env.PATH = `${EXTRA_PATHS}:${process.env.PATH || ""}`;

const isAuto = process.argv.includes("--auto");
const townArg = process.argv.find(a => a.startsWith("--town="))?.split("=")[1] || "estella-lizarra";

function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

async function run() {
  log("══════════════════════════════════════════════════════════");
  log(` 🔄 INICIO DE SINCRONIZACIÓN DIARIA: ${townArg.toUpperCase()}`);
  log("══════════════════════════════════════════════════════════");

  // 1. Scraping incremental de Facebook
  log("Paso 1/4: Comprobando fotos nuevas en el grupo de Facebook...");
  try {
    const scraperCmd = `npx tsx scripts/01-facebook-scraper.ts --town=${townArg} --mode=new ${isAuto ? "--auto" : ""}`;
    execSync(scraperCmd, { cwd: ROOT, stdio: "inherit" });
  } catch (err: any) {
    log(`⚠️ Advertencia en scraper: ${err.message}`);
  }

  // 2. Catalogación y análisis de testimonios con Gemini
  log("\nPaso 2/4: Catalogando con Gemini Vision y analizando testimonios...");
  try {
    execSync(`npx tsx scripts/02-ai-catalog.ts --town=${townArg}`, { cwd: ROOT, stdio: "inherit" });
  } catch (err: any) {
    log(`⚠️ Advertencia en catalogación: ${err.message}`);
  }

  // 3. Conversión a WebP y sincronización con Cloudflare R2
  log("\nPaso 3/4: Optimizando a WebP y subiendo a Cloudflare R2...");
  try {
    execSync(`node scripts/sync-r2-webp.mjs --town=${townArg}`, { cwd: ROOT, stdio: "inherit" });
  } catch (err: any) {
    log(`⚠️ Advertencia en subida R2: ${err.message}`);
  }

  // 4. Comprobar si hay cambios y auto-desplegar a Hostinger
  log("\nPaso 4/4: Comprobando cambios en el repositorio...");
  try {
    const status = execSync("git status --porcelain public/data/photos.json", { cwd: ROOT, encoding: "utf8" });
    if (status.trim()) {
      log("✨ Se han detectado nuevas fotos históricas. Desplegando a Hostinger...");
      execSync('git add public/data/photos.json && git commit -m "feat(archive): actualizacion automatica de nuevas fotos historicas" && git push origin main', {
        cwd: ROOT,
        stdio: "inherit",
      });
      log("🚀 Despliegue en marcha en GitHub Actions.");
    } else {
      log("ℹ️ No hay fotos nuevas hoy. El archivo está completamente al día.");
    }
  } catch (err: any) {
    log(`⚠️ Error en git push: ${err.message}`);
  }

  log("\n✅ Sincronización diaria finalizada con éxito.");
}

run().catch((e) => {
  console.error("Error fatal en sincronización:", e);
  process.exit(1);
});
