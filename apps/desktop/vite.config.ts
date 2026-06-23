import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env["TAURI_DEV_HOST"];

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: host ?? false,
    port: 1420,
    strictPort: true,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: ["es2021", "chrome100", "safari15"],
    outDir: "dist",
    sourcemap: true,
    minify: !process.env["TAURI_DEBUG"] ? "esbuild" : false,
  },
});
