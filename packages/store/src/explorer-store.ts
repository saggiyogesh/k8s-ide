import { create } from "zustand";
import type { ResourceRef } from "@k8s-ide/core";

type PaneLayout = "list" | "detail" | "split";

interface ExplorerState {
  selectedRef: ResourceRef | null;
  searchQuery: string;
  labelFilter: string;
  paneLayout: PaneLayout;
  detailTab: "overview" | "yaml" | "events" | "logs" | "terminal";

  setSelectedRef: (ref: ResourceRef | null) => void;
  setSearchQuery: (query: string) => void;
  setLabelFilter: (filter: string) => void;
  setPaneLayout: (layout: PaneLayout) => void;
  setDetailTab: (tab: ExplorerState["detailTab"]) => void;
}

export const useExplorerStore = create<ExplorerState>()((set) => ({
  selectedRef: null,
  searchQuery: "",
  labelFilter: "",
  paneLayout: "split",
  detailTab: "overview",

  setSelectedRef: (ref) => set({ selectedRef: ref }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setLabelFilter: (filter) => set({ labelFilter: filter }),
  setPaneLayout: (layout) => set({ paneLayout: layout }),
  setDetailTab: (tab) => set({ detailTab: tab }),
}));
