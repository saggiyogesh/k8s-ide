import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '@k8s-ide/store'
import { AppShell } from './app-shell.js'

export interface K8sIdeAppProps {
  backendUrl?: string
}

const queryClient = createQueryClient()

export function K8sIdeApp({ backendUrl }: K8sIdeAppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell backendUrl={backendUrl} />
    </QueryClientProvider>
  )
}

export { AppShell } from './app-shell.js'
