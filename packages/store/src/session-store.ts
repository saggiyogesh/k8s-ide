import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BackendStatus } from "@k8s-ide/core";

type SessionState = {
  backendUrl: string;
  backendStatus: BackendStatus;
  currentContext: string | null;
  currentNamespace: string;
  kubeconfigPath: string | null;
  setBackendUrl: (url: string) => void;
  setBackendStatus: (status: BackendStatus) => void;
  setCurrentContext: (context: string | null) => void;
  setCurrentNamespace: (namespace: string) => void;
  setKubeconfigPath: (path: string | null) => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      backendUrl: "http://127.0.0.1:9475",
      backendStatus: "disconnected",
      currentContext: null,
      currentNamespace: "default",
      kubeconfigPath: null,
      setBackendUrl: (backendUrl) => set({ backendUrl }),
      setBackendStatus: (backendStatus) => set({ backendStatus }),
      setCurrentContext: (currentContext) => set({ currentContext }),
      setCurrentNamespace: (currentNamespace) => set({ currentNamespace }),
      setKubeconfigPath: (kubeconfigPath) => set({ kubeconfigPath }),
    }),
    { name: "k8s-ide-session" },
  ),
);
