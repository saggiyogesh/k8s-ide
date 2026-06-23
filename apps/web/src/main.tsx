import React from "react";
import ReactDOM from "react-dom/client";
import { HttpK8sApiClient } from "@k8s-ide/api-client";
import { AppShell } from "@k8s-ide/app";
import "./index.css";

const client = new HttpK8sApiClient({
  baseUrl: import.meta.env.VITE_BACKEND_URL ?? "",
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppShell client={client} />
  </React.StrictMode>,
);
