import { useState, useEffect } from "react";
import { HttpK8sApiClient } from "@k8s-ide/api-client";
import { ExplorerApp, SettingsPanel } from "@k8s-ide/app";
import { usePreferencesStore } from "@k8s-ide/store";
import { startBackend, stopBackend, getBackendUrl } from "./backend.js";
import { Loader2 } from "lucide-react";

const BACKEND_PORT = 8080;
const BACKEND_URL = getBackendUrl(BACKEND_PORT);

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { theme } = usePreferencesStore();

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      root.classList.toggle("dark", mq.matches);
    }
  }, [theme]);

  // Start backend sidecar
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await startBackend(BACKEND_PORT);
        // Wait for backend to become ready
        await waitForBackend(BACKEND_URL);
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => {
      cancelled = true;
      void stopBackend();
    };
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 text-sm">
        <p className="text-destructive font-medium">Failed to start backend</p>
        <p className="text-muted-foreground max-w-sm text-center">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p>Starting backend…</p>
      </div>
    );
  }

  const client = new HttpK8sApiClient({ baseUrl: BACKEND_URL });

  return (
    <>
      <ExplorerApp client={client} onOpenSettings={() => setShowSettings(true)} />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </>
  );
}

async function waitForBackend(url: string, maxRetries = 20): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Backend did not start in time");
}
