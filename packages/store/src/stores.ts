import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ClusterContext } from "@k8s-ide/core";

export type BackendStatus = "disconnected" | "connecting" | "connected" | "error";

interface SessionState {
  backendUrl: string;
  backendStatus: BackendStatus;
  backendError?: string;
  contexts: ClusterContext[];
  currentContext?: string;
  namespaces: string[];
  selectedNamespace?: string;
  setBackendUrl: (url: string) => void;
  setBackendStatus: (status: BackendStatus, error?: string) => void;
  setContexts: (contexts: ClusterContext[]) => void;
  setCurrentContext: (context: string) => void;
  setNamespaces: (namespaces: string[]) => void;
  setSelectedNamespace: (namespace?: string) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      backendUrl: "http://127.0.0.1:9475",
      backendStatus: "disconnected",
      contexts: [],
      namespaces: [],
      setBackendUrl: (backendUrl) => set({ backendUrl }),
      setBackendStatus: (backendStatus, backendError) =>
        set({ backendStatus, backendError }),
      setContexts: (contexts) => set({ contexts }),
      setCurrentContext: (currentContext) => set({ currentContext }),
      setNamespaces: (namespaces) => set({ namespaces }),
      setSelectedNamespace: (selectedNamespace) => set({ selectedNamespace }),
    }),
    {
      name: "k8s-ide-session",
      partialize: (s) => ({
        backendUrl: s.backendUrl,
        currentContext: s.currentContext,
        selectedNamespace: s.selectedNamespace,
      }),
    },
  ),
);

export type PaneLayout = "list" | "split" | "detail";

interface ExplorerState {
  selectedGvr?: { group: string; version: string; resource: string; kind: string };
  selectedRef?: {
    group: string;
    version: string;
    resource: string;
    kind: string;
    namespace?: string;
    name: string;
  };
  searchQuery: string;
  labelSelector: string;
  paneLayout: PaneLayout;
  sidebarCollapsed: boolean;
  setSelectedGvr: (gvr?: ExplorerState["selectedGvr"]) => void;
  setSelectedRef: (ref?: ExplorerState["selectedRef"]) => void;
  setSearchQuery: (searchQuery: string) => void;
  setLabelSelector: (labelSelector: string) => void;
  setPaneLayout: (paneLayout: PaneLayout) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useExplorerStore = create<ExplorerState>((set) => ({
  searchQuery: "",
  labelSelector: "",
  paneLayout: "split",
  sidebarCollapsed: false,
  setSelectedGvr: (selectedGvr) => set({ selectedGvr }),
  setSelectedRef: (selectedRef) => set({ selectedRef }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setLabelSelector: (labelSelector) => set({ labelSelector }),
  setPaneLayout: (paneLayout) => set({ paneLayout }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
}));

type Theme = "light" | "dark" | "system";

interface PreferencesState {
  theme: Theme;
  refreshIntervalMs: number;
  yamlWordWrap: boolean;
  setTheme: (theme: Theme) => void;
  setRefreshIntervalMs: (ms: number) => void;
  setYamlWordWrap: (wrap: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "system",
      refreshIntervalMs: 30_000,
      yamlWordWrap: true,
      setTheme: (theme) => set({ theme }),
      setRefreshIntervalMs: (refreshIntervalMs) => set({ refreshIntervalMs }),
      setYamlWordWrap: (yamlWordWrap) => set({ yamlWordWrap }),
    }),
    { name: "k8s-ide-preferences" },
  ),
);
