import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "child_process";
import { defineConfig } from "vite";

export default defineConfig(() => {
  const buildTime = new Date().toISOString();
  let gitSha = "dev";
  try {
    gitSha = execSync("git rev-parse --short HEAD", { stdio: "pipe" }).toString().trim();
  } catch {}
  const buildId = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${gitSha}`;

  const buildMetadata = {
    buildId,
    buildTime,
    gitSha,
  };

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "emit-build-info",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "build-info.json",
            source: JSON.stringify(buildMetadata, null, 2),
          });
          this.emitFile({
            type: "asset",
            fileName: "version.txt",
            source: `${buildMetadata.buildId}\n${buildMetadata.buildTime}\n${buildMetadata.gitSha}\n`,
          });
        },
      },
    ],
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildMetadata.buildId),
      __APP_BUILD_TIME__: JSON.stringify(buildMetadata.buildTime),
      __APP_GIT_SHA__: JSON.stringify(buildMetadata.gitSha),
    },
    // Sin claves en el navegador: la IA va por la función archivoIA (servidor). La clave de Gemini
    // solo la usan los scripts locales (scripts/), que leen .env.
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    build: {
      rollupOptions: {
        output: {
          entryFileNames: `assets/[name]-[hash]-${buildId}.js`,
          chunkFileNames: `assets/[name]-[hash]-${buildId}.js`,
          assetFileNames: `assets/[name]-[hash]-${buildId}.[ext]`,
          manualChunks(id) {
            if (id.includes("node_modules/firebase/")) {
              return "vendor-firebase";
            }
            if (id.includes("node_modules/motion/") || id.includes("node_modules/motion-dom/")) {
              return "vendor-motion";
            }
            if (id.includes("node_modules/lucide-react/")) {
              return "vendor-lucide";
            }
            if (
              id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/react-router-dom/")
            ) {
              return "vendor-react";
            }
          },
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== "true",
    },
  };
});
