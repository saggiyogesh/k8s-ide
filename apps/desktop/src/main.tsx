import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { HttpK8sApiClient } from "@k8s-ide/api-client";
import { AppShell } from "@k8s-ide/app";
import { startBackend } from "./backend.js";
import "./index.css";

const BACKEND_URL = "http://127.0.0.1:8080";

function DesktopApp() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startBackend(
      () => setReady(true),
      (err) => setError(err),
    );
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 text-red-400">
        <p className="text-sm">Backend failed to start</p>
        <pre className="text-xs bg-zinc-800 px-3 py-2 rounded max-w-lg overflow-auto">{error}</pre>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen text-zinc-500 text-sm">
        Starting backend…
      </div>
    );
  }

  const client = new HttpK8sApiClient({ baseUrl: BACKEND_URL });
  return <AppShell client={client} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DesktopApp />
  </React.StrictMode>,
);
