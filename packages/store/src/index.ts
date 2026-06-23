import { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import type { K8sApiClient } from "@k8s-ide/api-client";
import type { ApiResourceDescriptor, ResourceRef, SessionInfo } from "@k8s-ide/core";

export const queryKeys = {
  contexts: () => ["contexts"] as const,
  session: (context?: string) => ["session", context ?? "none"] as const,
  discovery: (context?: string) => ["discovery", context ?? "none"] as const,
  resources: (params: {
    context?: string;
    group: string;
    version: string;
    resource: string;
    namespace?: string;
    labelSelector?: string;
    fieldSelector?: string;
  }) =>
    [
      "resources",
      params.context ?? "none",
      params.group || "core",
      params.version,
      params.resource,
      params.namespace ?? "_cluster",
      params.labelSelector ?? "",
      params.fieldSelector ?? ""
    ] as const,
  resource: (params: {
    context?: string;
    ref: ResourceRef;
  }) =>
    [
      "resource",
      params.context ?? "none",
      params.ref.group || "core",
      params.ref.version,
      params.ref.resource,
      params.ref.namespace ?? "_cluster",
      params.ref.name
    ] as const
};

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1
      }
    }
  });
}

type PlatformMode = "desktop" | "web" | "mobile";

interface SessionState {
  client?: K8sApiClient;
  activeContext?: string;
  backendStatus: "idle" | "connecting" | "ready" | "error";
  session?: SessionInfo;
  platform: PlatformMode;
  setClient: (client: K8sApiClient) => void;
  setBackendStatus: (status: SessionState["backendStatus"]) => void;
  setActiveContext: (context?: string) => void;
  setSession: (session?: SessionInfo) => void;
  setPlatform: (platform: PlatformMode) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  activeContext: undefined,
  backendStatus: "idle",
  platform: "web",
  client: undefined,
  session: undefined,
  setClient: (client) => set({ client }),
  setBackendStatus: (backendStatus) => set({ backendStatus }),
  setActiveContext: (activeContext) => set({ activeContext }),
  setSession: (session) => set({ session }),
  setPlatform: (platform) => set({ platform })
}));

interface ExplorerState {
  namespace?: string;
  labelSelector: string;
  fieldSelector: string;
  selectedDescriptor?: ApiResourceDescriptor;
  selectedResource?: ResourceRef;
  layout: "split" | "detail";
  setNamespace: (namespace?: string) => void;
  setLabelSelector: (labelSelector: string) => void;
  setFieldSelector: (fieldSelector: string) => void;
  setSelectedDescriptor: (descriptor?: ApiResourceDescriptor) => void;
  setSelectedResource: (resource?: ResourceRef) => void;
  setLayout: (layout: ExplorerState["layout"]) => void;
}

export const useExplorerStore = create<ExplorerState>((set) => ({
  namespace: "default",
  labelSelector: "",
  fieldSelector: "",
  selectedDescriptor: undefined,
  selectedResource: undefined,
  layout: "split",
  setNamespace: (namespace) => set({ namespace }),
  setLabelSelector: (labelSelector) => set({ labelSelector }),
  setFieldSelector: (fieldSelector) => set({ fieldSelector }),
  setSelectedDescriptor: (selectedDescriptor) => set({ selectedDescriptor, selectedResource: undefined }),
  setSelectedResource: (selectedResource) => set({ selectedResource }),
  setLayout: (layout) => set({ layout })
}));

interface PreferencesState {
  theme: "system" | "light" | "dark";
  refreshPolicy: "manual" | "watch" | "poll";
  lastNamespace?: string;
  setTheme: (theme: PreferencesState["theme"]) => void;
  setRefreshPolicy: (refreshPolicy: PreferencesState["refreshPolicy"]) => void;
  setLastNamespace: (lastNamespace?: string) => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: "system",
  refreshPolicy: "watch",
  lastNamespace: "default",
  setTheme: (theme) => set({ theme }),
  setRefreshPolicy: (refreshPolicy) => set({ refreshPolicy }),
  setLastNamespace: (lastNamespace) => set({ lastNamespace })
}));
