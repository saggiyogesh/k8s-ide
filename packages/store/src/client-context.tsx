import { createContext, useContext, type ReactNode } from "react";
import type { K8sApiClient } from "@k8s-ide/api-client";

const ClientContext = createContext<K8sApiClient | null>(null);

export function K8sClientProvider({
  client,
  children,
}: {
  client: K8sApiClient;
  children: ReactNode;
}) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useK8sClient(): K8sApiClient {
  const client = useContext(ClientContext);
  if (!client) {
    throw new Error("useK8sClient must be used inside K8sClientProvider");
  }
  return client;
}
