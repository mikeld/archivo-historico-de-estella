import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig(() => {
  const buildId = Date.now().toString(36); // unique per build, forces cache bust
  return {
    plugins: [react(), tailwindcss()],
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
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== "true",
    },
  };
});
