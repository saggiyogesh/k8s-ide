import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:9475",
      "/ws": { target: "ws://127.0.0.1:9475", ws: true },
    },
  },
  build: {
    outDir: "dist",
  },
});
