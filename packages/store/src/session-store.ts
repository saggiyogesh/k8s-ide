import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ClusterContext, SessionInfo } from "@k8s-ide/core"

interface SessionState {
  /** All kubeconfig contexts available */
  contexts: ClusterContext[]
  /** Currently active context name */
  activeContext: string | null
  /** Current session info (returned after openSession) */
  session: SessionInfo | null
  /** Active namespace filter (empty string = all namespaces) */
  activeNamespace: string
  /** Whether the backend is reachable */
  backendStatus: "unknown" | "connecting" | "online" | "offline"
  backendUrl: string

  setContexts: (contexts: ClusterContext[]) => void
  setActiveContext: (context: string) => void
  setSession: (session: SessionInfo | null) => void
  setActiveNamespace: (ns: string) => void
  setBackendStatus: (status: SessionState["backendStatus"]) => void
  setBackendUrl: (url: string) => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      contexts: [],
      activeContext: null,
      session: null,
      activeNamespace: "",
      backendStatus: "unknown",
      backendUrl: "http://localhost:7080",

      setContexts: (contexts) => set({ contexts }),
      setActiveContext: (context) => set({ activeContext: context }),
      setSession: (session) => set({ session }),
      setActiveNamespace: (ns) => set({ activeNamespace: ns }),
      setBackendStatus: (status) => set({ backendStatus: status }),
      setBackendUrl: (url) => set({ backendUrl: url }),
    }),
    {
      name: "k8s-ide-session",
      partialize: (state) => ({
        activeContext: state.activeContext,
        activeNamespace: state.activeNamespace,
        backendUrl: state.backendUrl,
      }),
    },
  ),
)
