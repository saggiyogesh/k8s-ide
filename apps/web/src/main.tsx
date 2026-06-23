import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { HttpK8sApiClient, type HttpK8sApiClientConfig } from "@k8s-ide/api-client";
import { createAppRouter } from "@k8s-ide/app";
import "./index.css";

const clientConfig: HttpK8sApiClientConfig = {
  baseUrl: import.meta.env.VITE_API_URL ?? "",
};
if (import.meta.env.VITE_WS_URL) {
  clientConfig.wsBaseUrl = import.meta.env.VITE_WS_URL;
}
const client = new HttpK8sApiClient(clientConfig);

const router = createAppRouter(client);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
