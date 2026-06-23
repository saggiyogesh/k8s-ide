import { useEffect } from "react";
import type { K8sApiClient } from "@k8s-ide/api-client";
import { useSessionStore } from "@k8s-ide/store";

interface ConnectionBannerProps {
  client: K8sApiClient;
}

export function ConnectionBanner({ client }: ConnectionBannerProps) {
  const { backendStatus, setBackendStatus, currentContext } = useSessionStore();

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      setBackendStatus("connecting");
      try {
        await client.listContexts();
        if (!cancelled) setBackendStatus("connected");
      } catch (e) {
        if (!cancelled) {
          setBackendStatus("error", e instanceof Error ? e.message : "Connection failed");
        }
      }
    };
    check();
    const id = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, setBackendStatus]);

  if (backendStatus === "connected" || !currentContext) return null;

  return (
    <div className="border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-xs text-yellow-200">
      {backendStatus === "connecting" && "Connecting to backend..."}
      {backendStatus === "error" && "Backend unreachable. Start the Go server or check the URL in settings."}
      {backendStatus === "disconnected" && "Backend disconnected."}
    </div>
  );
}
