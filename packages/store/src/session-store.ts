import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ClusterContext, SessionInfo } from "@k8s-ide/core";

interface SessionState {
  activeContext: string | null;
  sessionInfo: SessionInfo | null;
  availableContexts: ClusterContext[];
  backendStatus: "disconnected" | "connecting" | "connected" | "error";
  backendError: string | null;

  setActiveContext(context: string | null): void;
  setSessionInfo(info: SessionInfo | null): void;
  setAvailableContexts(contexts: ClusterContext[]): void;
  setBackendStatus(
    status: SessionState["backendStatus"],
    error?: string,
  ): void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      activeContext: null,
      sessionInfo: null,
      availableContexts: [],
      backendStatus: "disconnected",
      backendError: null,

      setActiveContext: (context) => set({ activeContext: context }),
      setSessionInfo: (info) => set({ sessionInfo: info }),
      setAvailableContexts: (contexts) => set({ availableContexts: contexts }),
      setBackendStatus: (status, error) =>
        set({ backendStatus: status, backendError: error ?? null }),
    }),
    {
      name: "k8s-ide-session",
      partialize: (state) => ({ activeContext: state.activeContext }),
    },
  ),
);
