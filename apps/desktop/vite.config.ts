import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@k8s-ide/core": path.resolve(__dirname, "../../packages/core/src"),
      "@k8s-ide/api-client": path.resolve(__dirname, "../../packages/api-client/src"),
      "@k8s-ide/store": path.resolve(__dirname, "../../packages/store/src"),
      "@k8s-ide/ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@k8s-ide/app": path.resolve(__dirname, "../../packages/app/src"),
    },
  },
  clearScreen: false,
  server: {
    port: 5174,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 5175 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    outDir: "dist",
  },
});
