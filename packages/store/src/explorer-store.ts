import { create } from "zustand";
import type { ApiResourceDescriptor, ResourceRef } from "@k8s-ide/core";

type ExplorerState = {
  selectedDescriptor: ApiResourceDescriptor | null;
  selectedResource: ResourceRef | null;
  searchQuery: string;
  resourceFilter: string;
  sidebarCollapsed: boolean;
  detailPanelOpen: boolean;
  setSelectedDescriptor: (descriptor: ApiResourceDescriptor | null) => void;
  setSelectedResource: (resource: ResourceRef | null) => void;
  setSearchQuery: (query: string) => void;
  setResourceFilter: (filter: string) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setDetailPanelOpen: (open: boolean) => void;
};

export const useExplorerStore = create<ExplorerState>((set) => ({
  selectedDescriptor: null,
  selectedResource: null,
  searchQuery: "",
  resourceFilter: "",
  sidebarCollapsed: false,
  detailPanelOpen: true,
  setSelectedDescriptor: (selectedDescriptor) => set({ selectedDescriptor }),
  setSelectedResource: (selectedResource) => set({ selectedResource, detailPanelOpen: !!selectedResource }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setResourceFilter: (resourceFilter) => set({ resourceFilter }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setDetailPanelOpen: (detailPanelOpen) => set({ detailPanelOpen }),
}));
