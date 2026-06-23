import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";
import type { K8sApiClient } from "@k8s-ide/api-client";
import { createQueryClient } from "./query.js";

const ApiClientContext = createContext<K8sApiClient | null>(null);

export function StoreProvider({
  client,
  children,
}: {
  client: K8sApiClient;
  children: ReactNode;
}) {
  const queryClient = useMemo(() => createQueryClient(), []);

  return (
    <ApiClientContext.Provider value={client}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiClientContext.Provider>
  );
}

export function useApiClient(): K8sApiClient {
  const client = useContext(ApiClientContext);
  if (!client) {
    throw new Error("useApiClient must be used within StoreProvider");
  }
  return client;
}

export { useSessionStore } from "./session-store.js";
export { useExplorerStore } from "./explorer-store.js";
export { usePreferencesStore } from "./preferences-store.js";
export { createResourceQueries, queryKeys, createQueryClient } from "./query.js";
