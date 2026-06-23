import { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

export type BackendStatus = 'idle' | 'connecting' | 'ready' | 'error';
export type LayoutMode = 'stacked' | 'split';
export type ThemeMode = 'system' | 'light' | 'dark';
export type RefreshPolicy = 'watch' | 'poll' | 'manual';

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
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
  contexts: (backendUrl: string) => ['contexts', backendUrl] as const,
  discovery: (backendUrl: string, context: string | null) =>
    ['discovery', backendUrl, context] as const,
  resourceList: (
    backendUrl: string,
    context: string | null,
    group: string,
    version: string,
    resource: string,
    namespace?: string,
  ) => ['resource-list', backendUrl, context, group, version, resource, namespace ?? '_'] as const,
  resourceItem: (
    backendUrl: string,
    context: string | null,
    group: string,
    version: string,
    resource: string,
    namespace: string | undefined,
    name: string,
  ) =>
    ['resource-item', backendUrl, context, group, version, resource, namespace ?? '_', name] as const,
};

interface SessionState {
  backendUrl: string;
  backendStatus: BackendStatus;
  selectedContext: string | null;
  lastError: string | null;
  setBackendUrl: (url: string) => void;
  setBackendStatus: (status: BackendStatus) => void;
  setSelectedContext: (context: string | null) => void;
  setLastError: (message: string | null) => void;
}

interface ExplorerState {
  namespace: string;
  search: string;
  selectedDiscoveryKey: string | null;
  selectedResourceKey: string | null;
  layoutMode: LayoutMode;
  setNamespace: (namespace: string) => void;
  setSearch: (search: string) => void;
  setSelectedDiscoveryKey: (key: string | null) => void;
  setSelectedResourceKey: (key: string | null) => void;
  setLayoutMode: (mode: LayoutMode) => void;
}

interface PreferencesState {
  theme: ThemeMode;
  refreshPolicy: RefreshPolicy;
  lastNamespace: string;
  setTheme: (theme: ThemeMode) => void;
  setRefreshPolicy: (policy: RefreshPolicy) => void;
  setLastNamespace: (namespace: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  backendUrl: 'http://127.0.0.1:3010',
  backendStatus: 'idle',
  selectedContext: null,
  lastError: null,
  setBackendUrl: (backendUrl) => set({ backendUrl }),
  setBackendStatus: (backendStatus) => set({ backendStatus }),
  setSelectedContext: (selectedContext) => set({ selectedContext }),
  setLastError: (lastError) => set({ lastError }),
}));

export const useExplorerStore = create<ExplorerState>((set) => ({
  namespace: 'default',
  search: '',
  selectedDiscoveryKey: null,
  selectedResourceKey: null,
  layoutMode: 'split',
  setNamespace: (namespace) => set({ namespace }),
  setSearch: (search) => set({ search }),
  setSelectedDiscoveryKey: (selectedDiscoveryKey) => set({ selectedDiscoveryKey }),
  setSelectedResourceKey: (selectedResourceKey) => set({ selectedResourceKey }),
  setLayoutMode: (layoutMode) => set({ layoutMode }),
}));

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: 'system',
  refreshPolicy: 'watch',
  lastNamespace: 'default',
  setTheme: (theme) => set({ theme }),
  setRefreshPolicy: (refreshPolicy) => set({ refreshPolicy }),
  setLastNamespace: (lastNamespace) => set({ lastNamespace }),
}));
