import { K8sIdeApp } from "@k8s-ide/app";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <K8sIdeApp backendUrl={import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:9477"} />
  </StrictMode>,
);
