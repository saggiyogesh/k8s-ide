import { create } from "zustand";
import type { ResourceRef } from "@k8s-ide/core";

export type PaneLayout = "list-only" | "list-detail" | "list-yaml";

interface ExplorerState {
  selectedResource: ResourceRef | null;
  selectedItem: { namespace?: string; name: string } | null;
  searchQuery: string;
  labelSelector: string;
  paneLayout: PaneLayout;
  activeDetailTab: string;
  sidebarCollapsed: boolean;
  resourceGroupExpanded: Record<string, boolean>;

  setSelectedResource(ref: ResourceRef | null): void;
  setSelectedItem(item: { namespace?: string; name: string } | null): void;
  setSearchQuery(q: string): void;
  setLabelSelector(sel: string): void;
  setPaneLayout(layout: PaneLayout): void;
  setActiveDetailTab(tab: string): void;
  setSidebarCollapsed(collapsed: boolean): void;
  toggleResourceGroup(group: string): void;
}

export const useExplorerStore = create<ExplorerState>()((set, get) => ({
  selectedResource: null,
  selectedItem: null,
  searchQuery: "",
  labelSelector: "",
  paneLayout: "list-detail",
  activeDetailTab: "overview",
  sidebarCollapsed: false,
  resourceGroupExpanded: {},

  setSelectedResource: (ref) => set({ selectedResource: ref, selectedItem: null }),
  setSelectedItem: (item) => set({ selectedItem: item }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setLabelSelector: (sel) => set({ labelSelector: sel }),
  setPaneLayout: (layout) => set({ paneLayout: layout }),
  setActiveDetailTab: (tab) => set({ activeDetailTab: tab }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleResourceGroup: (group) => {
    const current = get().resourceGroupExpanded[group] ?? true;
    set({
      resourceGroupExpanded: { ...get().resourceGroupExpanded, [group]: !current },
    });
  },
}));
