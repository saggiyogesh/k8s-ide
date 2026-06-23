import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { HttpK8sApiClient } from "@k8s-ide/api-client";
import { App } from "@k8s-ide/app";
import { useSessionStore } from "@k8s-ide/store";
import "@k8s-ide/ui/styles.css";
import "./index.css";

const DEFAULT_BACKEND = "http://127.0.0.1:9475";

const client = new HttpK8sApiClient({
  baseUrl: import.meta.env.VITE_BACKEND_URL ?? DEFAULT_BACKEND,
});

function DesktopRoot() {
  useEffect(() => {
    // Desktop shell starts the Go sidecar separately (see src-tauri/src/lib.rs).
    useSessionStore.getState().setBackendUrl(DEFAULT_BACKEND);
  }, []);

  return <App client={client} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DesktopRoot />
  </StrictMode>,
);
