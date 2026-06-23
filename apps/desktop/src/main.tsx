import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { HttpK8sApiClient } from "@k8s-ide/api-client";
import { createAppRouter } from "@k8s-ide/app";
import { BackendManager } from "./backend-manager.js";
import "./index.css";

const backendManager = new BackendManager();

async function bootstrap() {
  await backendManager.start();

  const client = new HttpK8sApiClient({
    baseUrl: `http://127.0.0.1:${backendManager.port}`,
    wsBaseUrl: `ws://127.0.0.1:${backendManager.port}`,
  });

  const router = createAppRouter(client);

  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Root element not found");

  createRoot(rootEl).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

bootstrap().catch(console.error);
