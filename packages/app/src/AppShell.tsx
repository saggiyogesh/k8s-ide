import { useEffect } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { HttpK8sApiClient } from "@k8s-ide/api-client"
import { useSessionStore } from "@k8s-ide/store"
import { ClientProvider } from "./client-context.js"
import { ExplorerLayout } from "./ExplorerLayout.js"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 10_000,
    },
  },
})

interface AppShellProps {
  /** Override the backend URL (e.g. for web/self-hosted mode). */
  backendUrl?: string
}

export function AppShell({ backendUrl }: AppShellProps) {
  const { setBackendUrl, backendUrl: storedUrl } = useSessionStore()
  const resolvedUrl = backendUrl ?? storedUrl

  const client = new HttpK8sApiClient(resolvedUrl)

  useEffect(() => {
    if (backendUrl) setBackendUrl(backendUrl)
  }, [backendUrl, setBackendUrl])

  return (
    <QueryClientProvider client={queryClient}>
      <ClientProvider client={client}>
        <ExplorerLayout />
      </ClientProvider>
    </QueryClientProvider>
  )
}
