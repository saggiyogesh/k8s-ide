import { create } from "zustand";

interface ExplorerState {
  selectedGroup: string;
  selectedVersion: string;
  selectedResource: string;
  selectedNamespace: string | null;
  selectedName: string | null;
  filterText: string;
  labelSelector: string;
  sidebarOpen: boolean;
  detailPaneOpen: boolean;

  selectResource(opts: {
    group: string;
    version: string;
    resource: string;
    namespace?: string;
    name?: string;
  }): void;
  setFilterText(text: string): void;
  setLabelSelector(selector: string): void;
  setSelectedNamespace(ns: string | null): void;
  toggleSidebar(): void;
  toggleDetailPane(): void;
  closeDetail(): void;
}

export const useExplorerStore = create<ExplorerState>()((set) => ({
  selectedGroup: "",
  selectedVersion: "v1",
  selectedResource: "pods",
  selectedNamespace: null,
  selectedName: null,
  filterText: "",
  labelSelector: "",
  sidebarOpen: true,
  detailPaneOpen: false,

  selectResource: ({ group, version, resource, namespace, name }) =>
    set({
      selectedGroup: group,
      selectedVersion: version,
      selectedResource: resource,
      selectedNamespace: namespace ?? null,
      selectedName: name ?? null,
      detailPaneOpen: !!name,
    }),

  setFilterText: (text) => set({ filterText: text }),
  setLabelSelector: (selector) => set({ labelSelector: selector }),
  setSelectedNamespace: (ns) => set({ selectedNamespace: ns }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleDetailPane: () => set((s) => ({ detailPaneOpen: !s.detailPaneOpen })),
  closeDetail: () => set({ detailPaneOpen: false, selectedName: null }),
}));
