import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HttpK8sApiClient } from "@k8s-ide/api-client";
import { App } from "@k8s-ide/app";
import { useSessionStore } from "@k8s-ide/store";
import "@k8s-ide/ui/styles.css";
import "./index.css";

const backendUrl =
  import.meta.env.VITE_BACKEND_URL ?? useSessionStore.getState().backendUrl;

const client = new HttpK8sApiClient({ baseUrl: backendUrl });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App client={client} />
  </StrictMode>,
);
