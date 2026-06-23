import { QueryClient } from '@tanstack/react-query';
import type { ApiResourceDescriptor, ResourceRef } from '@k8s-ide/core';
import { create } from 'zustand';

export function createAppQueryClient(): QueryClient {
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

export const discoveryKeys = {
  all: ['discovery'] as const,
  byContext: (context: string) => [...discoveryKeys.all, context] as const
};

export const resourceKeys = {
  all: ['resources'] as const,
  list: (options: {
    context: string;
    group: string;
    version: string;
    resource: string;
    namespace?: string;
    labelSelector?: string;
    fieldSelector?: string;
  }) =>
    [
      ...resourceKeys.all,
      options.context,
      options.group || 'core',
      options.version,
      options.resource,
      options.namespace || '_cluster',
      options.labelSelector || '',
      options.fieldSelector || ''
    ] as const,
  detail: (ref: ResourceRef) =>
    [
      ...resourceKeys.all,
      'detail',
      ref.context,
      ref.group || 'core',
      ref.version,
      ref.resource,
      ref.namespace || '_cluster',
      ref.name
    ] as const
};

interface SessionState {
  activeContext?: string;
  activeNamespace?: string;
  backendStatus: 'idle' | 'connecting' | 'ready' | 'error';
  lastError?: string;
  setActiveContext: (context?: string) => void;
  setActiveNamespace: (namespace?: string) => void;
  setBackendStatus: (status: SessionState['backendStatus'], lastError?: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  backendStatus: 'idle',
  setActiveContext: (activeContext) => set({ activeContext }),
  setActiveNamespace: (activeNamespace) => set({ activeNamespace }),
  setBackendStatus: (backendStatus, lastError) => set({ backendStatus, lastError })
}));

interface ExplorerState {
  selectedDescriptor?: ApiResourceDescriptor;
  selectedResource?: ResourceRef;
  search: string;
  splitView: boolean;
  setSelectedDescriptor: (descriptor?: ApiResourceDescriptor) => void;
  setSelectedResource: (resource?: ResourceRef) => void;
  setSearch: (search: string) => void;
  setSplitView: (splitView: boolean) => void;
}

export const useExplorerStore = create<ExplorerState>((set) => ({
  search: '',
  splitView: true,
  setSelectedDescriptor: (selectedDescriptor) => set({ selectedDescriptor }),
  setSelectedResource: (selectedResource) => set({ selectedResource }),
  setSearch: (search) => set({ search }),
  setSplitView: (splitView) => set({ splitView })
}));

interface PreferencesState {
  theme: 'system' | 'light' | 'dark';
  refreshPolicy: 'watch' | 'poll';
  lastNamespaceByContext: Record<string, string>;
  setTheme: (theme: PreferencesState['theme']) => void;
  setRefreshPolicy: (policy: PreferencesState['refreshPolicy']) => void;
  rememberNamespace: (context: string, namespace: string) => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: 'system',
  refreshPolicy: 'watch',
  lastNamespaceByContext: {},
  setTheme: (theme) => set({ theme }),
  setRefreshPolicy: (refreshPolicy) => set({ refreshPolicy }),
  rememberNamespace: (context, namespace) =>
    set((state) => ({
      lastNamespaceByContext: {
        ...state.lastNamespaceByContext,
        [context]: namespace
      }
    }))
}));
