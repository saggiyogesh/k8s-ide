import type { BackendStatus } from "@k8s-ide/core";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type SessionState = {
  context: string | null;
  namespace: string;
  backendUrl: string;
  backendStatus: BackendStatus;
  backendError: string | null;
  setContext: (context: string | null) => void;
  setNamespace: (namespace: string) => void;
  setBackendUrl: (url: string) => void;
  setBackendStatus: (status: BackendStatus, error?: string | null) => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      context: null,
      namespace: "default",
      backendUrl: "http://127.0.0.1:9477",
      backendStatus: "disconnected",
      backendError: null,
      setContext: (context) => set({ context }),
      setNamespace: (namespace) => set({ namespace }),
      setBackendUrl: (backendUrl) => set({ backendUrl }),
      setBackendStatus: (backendStatus, backendError = null) =>
        set({ backendStatus, backendError }),
    }),
    {
      name: "k8s-ide-session",
      partialize: (state) => ({
        context: state.context,
        namespace: state.namespace,
        backendUrl: state.backendUrl,
      }),
    },
  ),
);
