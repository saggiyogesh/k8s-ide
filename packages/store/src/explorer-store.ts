import type { ApiResourceDescriptor, ResourceRef } from '@k8s-ide/core'
import { create } from 'zustand'

export type PaneLayout = 'list-detail' | 'list-only' | 'detail-only'

export interface ExplorerState {
  selectedDescriptor: ApiResourceDescriptor | null
  selectedResource: ResourceRef | null
  searchQuery: string
  category: string
  namespaceFilter: string
  labelSelector: string
  paneLayout: PaneLayout
  sidebarCollapsed: boolean

  setSelectedDescriptor: (d: ApiResourceDescriptor | null) => void
  setSelectedResource: (ref: ResourceRef | null) => void
  setSearchQuery: (q: string) => void
  setCategory: (c: string) => void
  setNamespaceFilter: (ns: string) => void
  setLabelSelector: (s: string) => void
  setPaneLayout: (layout: PaneLayout) => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

export const useExplorerStore = create<ExplorerState>((set) => ({
  selectedDescriptor: null,
  selectedResource: null,
  searchQuery: '',
  category: 'all',
  namespaceFilter: '',
  labelSelector: '',
  paneLayout: 'list-detail',
  sidebarCollapsed: false,

  setSelectedDescriptor: (d) => set({ selectedDescriptor: d, selectedResource: null }),
  setSelectedResource: (ref) => set({ selectedResource: ref }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setCategory: (c) => set({ category: c }),
  setNamespaceFilter: (ns) => set({ namespaceFilter: ns }),
  setLabelSelector: (s) => set({ labelSelector: s }),
  setPaneLayout: (layout) => set({ paneLayout: layout }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
}))
