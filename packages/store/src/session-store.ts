import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ApiResourceDescriptor, ClusterContext, SessionInfo } from "@k8s-ide/core";

export type BackendStatus = "disconnected" | "connecting" | "connected" | "error";

interface SessionState {
  backendUrl: string;
  backendStatus: BackendStatus;
  contexts: ClusterContext[];
  activeContext: string | null;
  sessionInfo: SessionInfo | null;
  discovery: ApiResourceDescriptor[];
  selectedNamespace: string | null;
  namespaceFilter: string[];

  setBackendUrl(url: string): void;
  setBackendStatus(status: BackendStatus): void;
  setContexts(contexts: ClusterContext[]): void;
  setActiveContext(context: string | null): void;
  setSessionInfo(info: SessionInfo | null): void;
  setDiscovery(resources: ApiResourceDescriptor[]): void;
  setSelectedNamespace(ns: string | null): void;
  setNamespaceFilter(namespaces: string[]): void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      backendUrl: "http://localhost:8080",
      backendStatus: "disconnected",
      contexts: [],
      activeContext: null,
      sessionInfo: null,
      discovery: [],
      selectedNamespace: null,
      namespaceFilter: [],

      setBackendUrl: (url) => set({ backendUrl: url }),
      setBackendStatus: (status) => set({ backendStatus: status }),
      setContexts: (contexts) => set({ contexts }),
      setActiveContext: (context) => set({ activeContext: context }),
      setSessionInfo: (info) => set({ sessionInfo: info }),
      setDiscovery: (resources) => set({ discovery: resources }),
      setSelectedNamespace: (ns) => set({ selectedNamespace: ns }),
      setNamespaceFilter: (namespaces) => set({ namespaceFilter: namespaces }),
    }),
    {
      name: "k8s-ide-session",
      partialize: (state) => ({
        backendUrl: state.backendUrl,
        activeContext: state.activeContext,
        selectedNamespace: state.selectedNamespace,
        namespaceFilter: state.namespaceFilter,
      }),
    },
  ),
);
