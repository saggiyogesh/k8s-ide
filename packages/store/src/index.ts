import { QueryClient } from '@tanstack/react-query';
import type { ListResourcesOptions, ResourceRef } from '@k8s-ide/core';
import { create } from 'zustand';

export type BackendStatus = 'idle' | 'loading' | 'ready' | 'error';

export function createK8sIdeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export const queryKeys = {
  contexts: () => ['contexts'] as const,
  discovery: (context: string) => ['discovery', context] as const,
  resources: (options: ListResourcesOptions) =>
    [
      'resources',
      options.context,
      options.group || 'core',
      options.version,
      options.resource,
      options.namespace || 'all',
      options.labelSelector || '',
      options.fieldSelector || '',
    ] as const,
  resource: (ref: ResourceRef) =>
    [
      'resource',
      ref.context,
      ref.group || 'core',
      ref.version,
      ref.resource,
      ref.namespace || 'cluster',
      ref.name,
    ] as const,
};

type SessionState = {
  currentContext?: string;
  currentNamespace?: string;
  backendStatus: BackendStatus;
  setCurrentContext: (context?: string) => void;
  setCurrentNamespace: (namespace?: string) => void;
  setBackendStatus: (status: BackendStatus) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  currentContext: undefined,
  currentNamespace: undefined,
  backendStatus: 'idle',
  setCurrentContext: (currentContext) => set({ currentContext }),
  setCurrentNamespace: (currentNamespace) => set({ currentNamespace }),
  setBackendStatus: (backendStatus) => set({ backendStatus }),
}));

type ExplorerSelection = {
  group: string;
  version: string;
  resource: string;
  kind: string;
  scope: 'Namespaced' | 'Cluster';
};

type ExplorerState = {
  resourceSearch: string;
  selected?: ExplorerSelection;
  selectedName?: string;
  paneLayout: 'split' | 'detail';
  setResourceSearch: (search: string) => void;
  setSelected: (selection?: ExplorerSelection) => void;
  setSelectedName: (name?: string) => void;
  setPaneLayout: (layout: 'split' | 'detail') => void;
};

export const useExplorerStore = create<ExplorerState>((set) => ({
  resourceSearch: '',
  selected: undefined,
  selectedName: undefined,
  paneLayout: 'split',
  setResourceSearch: (resourceSearch) => set({ resourceSearch }),
  setSelected: (selected) => set({ selected, selectedName: undefined }),
  setSelectedName: (selectedName) => set({ selectedName }),
  setPaneLayout: (paneLayout) => set({ paneLayout }),
}));

type PreferencesState = {
  theme: 'system' | 'light' | 'dark';
  compactTables: boolean;
  refreshPolicy: 'watch' | 'poll';
  setTheme: (theme: 'system' | 'light' | 'dark') => void;
  setCompactTables: (compactTables: boolean) => void;
  setRefreshPolicy: (policy: 'watch' | 'poll') => void;
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: 'system',
  compactTables: false,
  refreshPolicy: 'watch',
  setTheme: (theme) => set({ theme }),
  setCompactTables: (compactTables) => set({ compactTables }),
  setRefreshPolicy: (refreshPolicy) => set({ refreshPolicy }),
}));
