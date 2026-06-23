import { useState, useEffect } from "react";
import { HttpK8sApiClient } from "@k8s-ide/api-client";
import { ExplorerApp, SettingsPanel } from "@k8s-ide/app";
import { useSessionStore, usePreferencesStore } from "@k8s-ide/store";

export function App() {
  const [showSettings, setShowSettings] = useState(false);
  const { theme } = usePreferencesStore();
  const { backendUrl } = useSessionStore();

  // Apply theme class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      return;
    } else if (theme === "light") {
      root.classList.remove("dark");
      return;
    } else {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      root.classList.toggle("dark", mq.matches);
      const handler = (e: MediaQueryListEvent) => root.classList.toggle("dark", e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  const client = new HttpK8sApiClient({ baseUrl: backendUrl });

  return (
    <>
      <ExplorerApp
        client={client}
        onOpenSettings={() => setShowSettings(true)}
      />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </>
  );
}
