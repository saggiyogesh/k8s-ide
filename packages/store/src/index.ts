import { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { ApiResourceDescriptor } from '@k8s-ide/core';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: 1,
        refetchOnWindowFocus: false
      }
    }
  });
}

export const queryKeys = {
  session: ['session'] as const,
  contexts: ['contexts'] as const,
  discovery: ['discovery'] as const,
  resources: (parts: {
    context?: string;
    group: string;
    version: string;
    resource: string;
    namespace?: string;
    labelSelector?: string;
    fieldSelector?: string;
  }) => ['resources', parts] as const
};

export interface SessionState {
  context?: string;
  namespace?: string;
  backendStatus: 'idle' | 'connecting' | 'ready' | 'error';
  setContext: (context?: string) => void;
  setNamespace: (namespace?: string) => void;
  setBackendStatus: (status: SessionState['backendStatus']) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  context: undefined,
  namespace: 'default',
  backendStatus: 'idle',
  setContext: (context) => set({ context }),
  setNamespace: (namespace) => set({ namespace }),
  setBackendStatus: (backendStatus) => set({ backendStatus })
}));

export interface ExplorerState {
  resource?: ApiResourceDescriptor;
  search: string;
  selectedResourceName?: string;
  leftPaneWidth: number;
  setResource: (resource?: ApiResourceDescriptor) => void;
  setSearch: (search: string) => void;
  setSelectedResourceName: (name?: string) => void;
  setLeftPaneWidth: (width: number) => void;
}

export const useExplorerStore = create<ExplorerState>((set) => ({
  resource: undefined,
  search: '',
  selectedResourceName: undefined,
  leftPaneWidth: 320,
  setResource: (resource) => set({ resource }),
  setSearch: (search) => set({ search }),
  setSelectedResourceName: (selectedResourceName) => set({ selectedResourceName }),
  setLeftPaneWidth: (leftPaneWidth) => set({ leftPaneWidth })
}));

export interface PreferencesState {
  theme: 'system' | 'light' | 'dark';
  refreshPolicy: 'watch' | 'manual' | 'poll';
  lastNamespace?: string;
  setTheme: (theme: PreferencesState['theme']) => void;
  setRefreshPolicy: (policy: PreferencesState['refreshPolicy']) => void;
  setLastNamespace: (namespace?: string) => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: 'system',
  refreshPolicy: 'watch',
  lastNamespace: 'default',
  setTheme: (theme) => set({ theme }),
  setRefreshPolicy: (refreshPolicy) => set({ refreshPolicy }),
  setLastNamespace: (lastNamespace) => set({ lastNamespace })
}));
