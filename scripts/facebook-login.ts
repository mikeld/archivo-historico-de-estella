/**
 * scripts/facebook-login.ts
 * 
 * Abre una ventana de Chrome con el perfil persistente para iniciar sesión en Facebook.
 * Detecta automáticamente cuando se inicia sesión (cookie c_user) o cuando se cierra la ventana.
 * Guarda las cookies y sesión para que el scraper funcione siempre en segundo plano (headless: true).
 * 
 * Uso: npx tsx scripts/facebook-login.ts
 */

import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, "../facebook-import/.browser-profile");

async function main() {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log(" 🔑 INICIO DE SESIÓN EN FACEBOOK");
  console.log("══════════════════════════════════════════════════════════\n");
  console.log("Abriendo ventana de Chrome...");

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: "es-ES",
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });

  console.log("\n👉 En la ventana de Chrome que se ha abierto en tu pantalla:");
  console.log("   1. Introduce tu correo y contraseña de Facebook.");
  console.log("   2. Marca 'Recordar contraseña / dispositivo' si te lo pregunta.");
  console.log("   3. En cuanto entres, el sistema detectará la sesión automáticamente y cerrará la ventana.\n");

  await new Promise<void>((resolve) => {
    let resolved = false;

    // 1. Detectar inicio de sesión automáticamente por cookies
    const checkInterval = setInterval(async () => {
      try {
        const cookies = await context.cookies();
        if (cookies.some((c) => c.name === "c_user")) {
          if (!resolved) {
            resolved = true;
            clearInterval(checkInterval);
            console.log("\n🎉 ¡Sesión iniciada con éxito! Cookie de usuario detectada.");
            await page.waitForTimeout(2000);
            resolve();
          }
        }
      } catch {
        // Context might be closing
      }
    }, 2000);

    // 2. Si el usuario cierra la ventana manualmente
    context.on("close", () => {
      if (!resolved) {
        resolved = true;
        clearInterval(checkInterval);
        resolve();
      }
    });

    // 3. Timeout máximo de 3 minutos
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(checkInterval);
        console.log("\nTiempo de espera agotado (3 minutos).");
        resolve();
      }
    }, 180000);
  });

  const cookies = await context.cookies().catch(() => []);
  const hasUserCookie = cookies.some((c) => c.name === "c_user");

  if (hasUserCookie) {
    console.log("✅ ¡Sesión guardada en el perfil persistente!");
    console.log("   A partir de ahora, el scraper funcionará 100% invisible (headless: true) sin abrir ventanas.");
  } else {
    console.log("ℹ️ Ventana cerrada. Se comprobará el estado de la sesión.");
  }

  await context.close().catch(() => {});
  console.log("\n══════════════════════════════════════════════════════════");
  console.log(" Listo para continuar.");
  console.log("══════════════════════════════════════════════════════════\n");
  process.exit(0);
}

main().catch(console.error);
