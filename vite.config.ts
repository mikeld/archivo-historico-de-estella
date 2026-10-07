import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const buildId = Date.now().toString(36); // unique per build, forces cache bust
  return {
    plugins: [react(), tailwindcss()],
    define: {
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
    },
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
