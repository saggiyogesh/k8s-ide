import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Kubernetes IDE",
        short_name: "K8s IDE",
        description: "Single-user Kubernetes IDE companion",
        theme_color: "#0b1020",
        background_color: "#0b1020",
        display: "standalone",
        start_url: "/",
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:9477",
      "/ws": {
        target: "ws://127.0.0.1:9477",
        ws: true,
      },
    },
  },
});
