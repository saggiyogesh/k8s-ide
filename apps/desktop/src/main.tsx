import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { HttpK8sApiClient } from "@k8s-ide/api-client";
import { K8sIdeApp } from "@k8s-ide/app";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element");
}

const client = new HttpK8sApiClient(import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:9845");

createRoot(rootElement).render(
  <StrictMode>
    <K8sIdeApp client={client} platform="desktop" />
  </StrictMode>
);
