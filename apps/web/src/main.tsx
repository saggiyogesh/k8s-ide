import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { K8sAppProvider, ExplorerPage } from "@k8s-ide/app";
import "@k8s-ide/ui/styles.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <K8sAppProvider backendUrl={import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:9475"}>
      <ExplorerPage />
    </K8sAppProvider>
  </StrictMode>,
);
