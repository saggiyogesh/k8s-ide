import type { ResourceRef } from "@k8s-ide/core";
import { create } from "zustand";

export type ExplorerPane = "list" | "detail" | "yaml";

type ExplorerState = {
  selectedResource: ResourceRef | null;
  searchQuery: string;
  labelSelector: string;
  activePane: ExplorerPane;
  sidebarCollapsed: boolean;
  setSelectedResource: (resource: ResourceRef | null) => void;
  setSearchQuery: (query: string) => void;
  setLabelSelector: (selector: string) => void;
  setActivePane: (pane: ExplorerPane) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
};

export const useExplorerStore = create<ExplorerState>((set) => ({
  selectedResource: null,
  searchQuery: "",
  labelSelector: "",
  activePane: "list",
  sidebarCollapsed: false,
  setSelectedResource: (selectedResource) => set({ selectedResource }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setLabelSelector: (labelSelector) => set({ labelSelector }),
  setActivePane: (activePane) => set({ activePane }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
}));
