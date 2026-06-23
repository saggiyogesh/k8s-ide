import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  activeContext: string | null;
  activeNamespace: string | null;
  availableNamespaces: string[];
  backendStatus: "unknown" | "connecting" | "connected" | "error";
  backendError: string | null;

  setActiveContext: (context: string) => void;
  setActiveNamespace: (namespace: string | null) => void;
  setAvailableNamespaces: (namespaces: string[]) => void;
  setBackendStatus: (status: SessionState["backendStatus"], error?: string) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      activeContext: null,
      activeNamespace: null,
      availableNamespaces: [],
      backendStatus: "unknown",
      backendError: null,

      setActiveContext: (context) =>
        set({ activeContext: context, activeNamespace: null, availableNamespaces: [] }),
      setActiveNamespace: (namespace) => set({ activeNamespace: namespace }),
      setAvailableNamespaces: (namespaces) => set({ availableNamespaces: namespaces }),
      setBackendStatus: (status, error) =>
        set({ backendStatus: status, backendError: error ?? null }),
    }),
    {
      name: "k8s-ide-session",
      partialize: (state) => ({
        activeContext: state.activeContext,
        activeNamespace: state.activeNamespace,
      }),
    },
  ),
);
