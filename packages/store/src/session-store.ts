import type { K8sApiClient } from '@k8s-ide/api-client'
import type { BackendStatus, SessionInfo } from '@k8s-ide/core'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SessionState {
  backendUrl: string
  backendStatus: BackendStatus
  backendError: string | null
  contexts: string[]
  currentContext: string | null
  session: SessionInfo | null
  selectedNamespaces: string[]
  client: K8sApiClient | null

  setBackendUrl: (url: string) => void
  setBackendStatus: (status: BackendStatus, error?: string | null) => void
  setClient: (client: K8sApiClient | null) => void
  setContexts: (contexts: string[]) => void
  setCurrentContext: (context: string | null) => void
  setSession: (session: SessionInfo | null) => void
  setSelectedNamespaces: (namespaces: string[]) => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      backendUrl: 'http://127.0.0.1:9470',
      backendStatus: 'disconnected',
      backendError: null,
      contexts: [],
      currentContext: null,
      session: null,
      selectedNamespaces: [],
      client: null,

      setBackendUrl: (url) => set({ backendUrl: url }),
      setBackendStatus: (status, error = null) =>
        set({ backendStatus: status, backendError: error }),
      setClient: (client) => set({ client }),
      setContexts: (contexts) => set({ contexts }),
      setCurrentContext: (context) => set({ currentContext: context }),
      setSession: (session) => set({ session }),
      setSelectedNamespaces: (namespaces) => set({ selectedNamespaces: namespaces }),
    }),
    {
      name: 'k8s-ide-session',
      partialize: (state) => ({
        backendUrl: state.backendUrl,
        currentContext: state.currentContext,
        selectedNamespaces: state.selectedNamespaces,
      }),
    },
  ),
)
