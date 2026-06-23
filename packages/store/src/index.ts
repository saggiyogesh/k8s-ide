import { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

import type {
  ClusterContext,
  GetResourceOptions,
  ListResourcesOptions,
  ResourceRef,
  SessionInfo,
} from '@k8s-ide/core';
import { refKey } from '@k8s-ide/core';

export const createK8sQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });

export const queryKeys = {
  contexts: ['contexts'] as const,
  discovery: ['discovery'] as const,
  resources: (opts: ListResourcesOptions) =>
    [
      'resources',
      opts.group || 'core',
      opts.version,
      opts.resource,
      opts.namespace || 'all',
      opts.labelSelector || '',
      opts.search || '',
    ] as const,
  resource: (opts: GetResourceOptions) => ['resource', refKey(opts)] as const,
};

interface SessionState {
  backendUrl: string;
  currentContext?: ClusterContext;
  availableContexts: ClusterContext[];
  session?: SessionInfo;
  namespace: string;
  backendHealthy: boolean;
  setBackendUrl: (backendUrl: string) => void;
  setContexts: (contexts: ClusterContext[]) => void;
  setCurrentContext: (context?: ClusterContext) => void;
  setSession: (session?: SessionInfo) => void;
  setNamespace: (namespace: string) => void;
  setBackendHealthy: (healthy: boolean) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  backendUrl: 'http://127.0.0.1:8787/api',
  currentContext: undefined,
  availableContexts: [],
  session: undefined,
  namespace: 'default',
  backendHealthy: false,
  setBackendUrl: (backendUrl) => set({ backendUrl }),
  setContexts: (availableContexts) =>
    set((state) => ({
      availableContexts,
      currentContext:
        state.currentContext &&
        availableContexts.some((context) => context.name === state.currentContext?.name)
          ? state.currentContext
          : availableContexts.find((context) => context.isCurrent) ?? availableContexts[0],
    })),
  setCurrentContext: (currentContext) => set({ currentContext }),
  setSession: (session) => set({ session }),
  setNamespace: (namespace) => set({ namespace }),
  setBackendHealthy: (backendHealthy) => set({ backendHealthy }),
}));

interface ExplorerState {
  activeResource?: {
    group: string;
    version: string;
    resource: string;
    namespace?: string;
  };
  selectedResource?: ResourceRef;
  search: string;
  splitRatio: number;
  setActiveResource: (resource: ExplorerState['activeResource']) => void;
  setSelectedResource: (resource?: ResourceRef) => void;
  setSearch: (search: string) => void;
  setSplitRatio: (ratio: number) => void;
}

export const useExplorerStore = create<ExplorerState>((set) => ({
  activeResource: undefined,
  selectedResource: undefined,
  search: '',
  splitRatio: 0.55,
  setActiveResource: (activeResource) => set({ activeResource }),
  setSelectedResource: (selectedResource) => set({ selectedResource }),
  setSearch: (search) => set({ search }),
  setSplitRatio: (splitRatio) => set({ splitRatio }),
}));

interface PreferencesState {
  theme: 'system' | 'light' | 'dark';
  refreshPolicy: 'watch' | 'poll';
  lastNamespace?: string;
  compactMode: boolean;
  setTheme: (theme: PreferencesState['theme']) => void;
  setRefreshPolicy: (policy: PreferencesState['refreshPolicy']) => void;
  setLastNamespace: (namespace?: string) => void;
  setCompactMode: (compactMode: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: 'system',
  refreshPolicy: 'watch',
  lastNamespace: 'default',
  compactMode: false,
  setTheme: (theme) => set({ theme }),
  setRefreshPolicy: (refreshPolicy) => set({ refreshPolicy }),
  setLastNamespace: (lastNamespace) => set({ lastNamespace }),
  setCompactMode: (compactMode) => set({ compactMode }),
}));
