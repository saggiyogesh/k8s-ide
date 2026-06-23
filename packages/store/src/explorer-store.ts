import { create } from "zustand"
import type { ResourceRef } from "@k8s-ide/core"

type PaneLayout = "single" | "split-horizontal" | "split-vertical"

interface ExplorerState {
  /** Currently selected resource in the explorer */
  selectedResource: ResourceRef | null
  /** Active group/version/resource filter in the sidebar */
  activeGVR: { group: string; version: string; resource: string } | null
  /** Search/filter string */
  searchQuery: string
  /** Detail pane layout */
  layout: PaneLayout
  /** Which detail tab is active */
  activeDetailTab: "overview" | "yaml" | "events" | "logs" | "terminal"

  setSelectedResource: (ref: ResourceRef | null) => void
  setActiveGVR: (gvr: ExplorerState["activeGVR"]) => void
  setSearchQuery: (q: string) => void
  setLayout: (layout: PaneLayout) => void
  setActiveDetailTab: (tab: ExplorerState["activeDetailTab"]) => void
}

export const useExplorerStore = create<ExplorerState>()((set) => ({
  selectedResource: null,
  activeGVR: null,
  searchQuery: "",
  layout: "split-horizontal",
  activeDetailTab: "overview",

  setSelectedResource: (ref) => set({ selectedResource: ref }),
  setActiveGVR: (gvr) => set({ activeGVR: gvr }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setLayout: (layout) => set({ layout }),
  setActiveDetailTab: (tab) => set({ activeDetailTab: tab }),
}))
