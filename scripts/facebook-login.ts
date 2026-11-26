/**
 * scripts/facebook-login.ts
 * 
 * Abre una ventana de Chrome con el perfil persistente para iniciar sesión en Facebook.
 * Guarda las cookies y sesión para que el scraper pueda funcionar en segundo plano
 * de forma 100% invisible (headless: true) sin pedir credenciales.
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
  console.log(" 🔑 INICIO DE SESIÓN EN FACEBOOK PARA EL ARCHIVO HISTÓRICO");
  console.log("══════════════════════════════════════════════════════════\n");
  console.log("Abriendo Chrome con el perfil guardado...");

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: "es-ES",
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });

  console.log("\n👉 En la ventana de Chrome que se ha abierto:");
  console.log("   1. Introduce tu correo y contraseña de Facebook si te lo pide.");
  console.log("   2. Asegúrate de marcar 'Recordar contraseña / dispositivo'.");
  console.log("   3. Cuando veas tu página principal de Facebook, vuelve aquí y pulsa ENTER (o cierra la ventana).\n");

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolve();
    });

    context.on("close", () => {
      resolve();
    });
  });

  console.log("\nComprobando cookies de sesión...");
  const cookies = await context.cookies();
  const hasUserCookie = cookies.some((c) => c.name === "c_user");

  if (hasUserCookie) {
    console.log("✅ ¡Sesión detectada y guardada con éxito!");
    console.log("   A partir de ahora, el scraper funcionará de forma 100% invisible (headless) de fondo.");
  } else {
    console.log("ℹ️ Ventana cerrada. Si iniciaste sesión, la sesión ha quedado guardada en el perfil.");
  }

  await context.close().catch(() => {});
  console.log("\nProceso finalizado. Puedes continuar con el scraper.\n");
  process.exit(0);
}

main().catch(console.error);
