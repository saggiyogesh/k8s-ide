import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createK8sApiClient, type K8sApiClient } from "@k8s-ide/api-client";
import { createQueryClient, useSessionStore } from "@k8s-ide/store";

const ApiClientContext = createContext<K8sApiClient | null>(null);

export function useApiClient(): K8sApiClient {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error("useApiClient must be used within K8sAppProvider");
  return client;
}

type Props = {
  children: ReactNode;
  backendUrl?: string;
};

export function K8sAppProvider({ children, backendUrl }: Props) {
  const storedUrl = useSessionStore((s) => s.backendUrl);
  const setBackendStatus = useSessionStore((s) => s.setBackendStatus);
  const url = backendUrl ?? storedUrl;

  const queryClient = useMemo(() => createQueryClient(), []);
  const client = useMemo(() => createK8sApiClient({ baseUrl: url }), [url]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      setBackendStatus("connecting");
      const ok = await client.healthCheck();
      if (!cancelled) setBackendStatus(ok ? "connected" : "error");
    };
    void check();
    const id = setInterval(() => void check(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, setBackendStatus]);

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>
    </QueryClientProvider>
  );
}
