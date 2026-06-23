import { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { JsonObject, ListOpts, ResourceRef } from '@k8s-ide/core';

export const queryKeys = {
  contexts: ['contexts'] as const,
  discovery: ['discovery'] as const,
  resources: (opts: ListOpts) => ['resources', opts] as const,
  resource: (ref: ResourceRef & { name: string }) => ['resource', ref] as const
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false
      }
    }
  });
}

interface SessionState {
  selectedContext?: string;
  namespace?: string;
  backendStatus: 'idle' | 'connecting' | 'ready' | 'error';
  kubeconfigPath?: string;
  setContext: (context?: string) => void;
  setNamespace: (namespace?: string) => void;
  setBackendStatus: (status: SessionState['backendStatus']) => void;
  setKubeconfigPath: (path?: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  backendStatus: 'idle',
  setContext: (selectedContext) => set({ selectedContext }),
  setNamespace: (namespace) => set({ namespace }),
  setBackendStatus: (backendStatus) => set({ backendStatus }),
  setKubeconfigPath: (kubeconfigPath) => set({ kubeconfigPath })
}));

interface ExplorerState {
  selectedDescriptorKey?: string;
  selectedResource?: ResourceRef & { name: string };
  search: string;
  filters: {
    labelSelector?: string;
    fieldSelector?: string;
  };
  showYamlEditor: boolean;
  setSelectedDescriptorKey: (key?: string) => void;
  setSelectedResource: (ref?: ResourceRef & { name: string }) => void;
  setSearch: (value: string) => void;
  setFilters: (filters: ExplorerState['filters']) => void;
  toggleYamlEditor: (show?: boolean) => void;
}

export const useExplorerStore = create<ExplorerState>((set, get) => ({
  search: '',
  filters: {},
  showYamlEditor: false,
  setSelectedDescriptorKey: (selectedDescriptorKey) => set({ selectedDescriptorKey }),
  setSelectedResource: (selectedResource) => set({ selectedResource }),
  setSearch: (search) => set({ search }),
  setFilters: (filters) => set({ filters }),
  toggleYamlEditor: (showYamlEditor) => set({ showYamlEditor: showYamlEditor ?? !get().showYamlEditor })
}));

interface PreferencesState {
  theme: 'system' | 'light' | 'dark';
  compactMode: boolean;
  autoRefresh: boolean;
  lastNamespaceByContext: Record<string, string>;
  setTheme: (theme: PreferencesState['theme']) => void;
  setCompactMode: (compactMode: boolean) => void;
  setAutoRefresh: (autoRefresh: boolean) => void;
  rememberNamespace: (context: string, namespace: string) => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: 'system',
  compactMode: false,
  autoRefresh: true,
  lastNamespaceByContext: {},
  setTheme: (theme) => set({ theme }),
  setCompactMode: (compactMode) => set({ compactMode }),
  setAutoRefresh: (autoRefresh) => set({ autoRefresh }),
  rememberNamespace: (context, namespace) =>
    set((state) => ({
      lastNamespaceByContext: {
        ...state.lastNamespaceByContext,
        [context]: namespace
      }
    }))
}));

export function summarizeResource(resource: JsonObject): { name: string; namespace?: string; kind?: string } {
  const metadata = (resource.metadata as JsonObject | undefined) ?? {};
  const name = metadata.name;
  const namespace = metadata.namespace;
  const kind = resource.kind;

  return {
    name: typeof name === 'string' ? name : 'unknown',
    namespace: typeof namespace === 'string' ? namespace : undefined,
    kind: typeof kind === 'string' ? kind : undefined
  };
}
