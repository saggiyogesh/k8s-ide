import { createContext, useContext, type ReactNode } from "react"
import type { K8sApiClient } from "@k8s-ide/api-client"

const ClientContext = createContext<K8sApiClient | null>(null)

export function ClientProvider({
  client,
  children,
}: {
  client: K8sApiClient
  children: ReactNode
}) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
}

export function useClient(): K8sApiClient {
  const client = useContext(ClientContext)
  if (!client) throw new Error("useClient must be used inside <ClientProvider>")
  return client
}
