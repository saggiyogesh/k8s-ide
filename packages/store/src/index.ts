import type {
  ApiResourceDescriptor,
  GetResourceOptions,
  ListResourcesOptions,
  ResourceRef,
  SessionInfo,
} from '@k8s-ide/core';
import type { K8sApiClient } from '@k8s-ide/api-client';
import { QueryClient, queryOptions } from '@tanstack/react-query';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export function createQueryCache(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export const queryKeys = {
  contexts: ['contexts'] as const,
  discovery: (context: string | undefined) => ['discovery', context] as const,
  resourceList: (opts: ListResourcesOptions) =>
    [
      'resources',
      opts.context,
      opts.group || 'core',
      opts.version,
      opts.resource,
      opts.namespace ?? '_cluster',
      opts.labelSelector ?? '',
      opts.fieldSelector ?? '',
    ] as const,
  resource: (opts: GetResourceOptions) =>
    [
      'resource',
      opts.context,
      opts.group || 'core',
      opts.version,
      opts.resource,
      opts.namespace ?? '_cluster',
      opts.name,
    ] as const,
};

export function contextsQuery(api: K8sApiClient) {
  return queryOptions({
    queryKey: queryKeys.contexts,
    queryFn: () => api.listContexts(),
  });
}

export function discoveryQuery(api: K8sApiClient, context: string | undefined) {
  return queryOptions({
    queryKey: queryKeys.discovery(context),
    enabled: Boolean(context),
    queryFn: () => api.getDiscovery(),
  });
}

export function resourceListQuery(api: K8sApiClient, opts: ListResourcesOptions) {
  return queryOptions({
    queryKey: queryKeys.resourceList(opts),
    queryFn: () => api.listResources(opts),
  });
}

export function resourceQuery(api: K8sApiClient, opts: GetResourceOptions) {
  return queryOptions({
    queryKey: queryKeys.resource(opts),
    queryFn: () => api.getResource(opts),
  });
}

type BackendStatus = 'idle' | 'connecting' | 'ready' | 'error';

type SessionState = {
  backendStatus: BackendStatus;
  currentContext?: string;
  currentNamespace?: string;
  kubeconfigPath?: string;
  session?: SessionInfo;
  setBackendStatus: (status: BackendStatus) => void;
  setContext: (context?: string) => void;
  setNamespace: (namespace?: string) => void;
  setSession: (session?: SessionInfo) => void;
  setKubeconfigPath: (path?: string) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  backendStatus: 'idle',
  currentContext: undefined,
  currentNamespace: 'default',
  kubeconfigPath: undefined,
  session: undefined,
  setBackendStatus: (backendStatus) => set({ backendStatus }),
  setContext: (currentContext) => set({ currentContext }),
  setNamespace: (currentNamespace) => set({ currentNamespace }),
  setSession: (session) => set({ session }),
  setKubeconfigPath: (kubeconfigPath) => set({ kubeconfigPath }),
}));

type PaneMode = 'split' | 'stacked';

type ExplorerState = {
  selectedDescriptor?: ApiResourceDescriptor;
  selectedResource?: ResourceRef;
  namespaceFilter?: string;
  search: string;
  paneMode: PaneMode;
  setSelectedDescriptor: (descriptor?: ApiResourceDescriptor) => void;
  setSelectedResource: (resource?: ResourceRef) => void;
  setNamespaceFilter: (namespace?: string) => void;
  setSearch: (value: string) => void;
  setPaneMode: (mode: PaneMode) => void;
};

export const useExplorerStore = create<ExplorerState>((set) => ({
  selectedDescriptor: undefined,
  selectedResource: undefined,
  namespaceFilter: 'default',
  search: '',
  paneMode: 'split',
  setSelectedDescriptor: (selectedDescriptor) => set({ selectedDescriptor }),
  setSelectedResource: (selectedResource) => set({ selectedResource }),
  setNamespaceFilter: (namespaceFilter) => set({ namespaceFilter }),
  setSearch: (search) => set({ search }),
  setPaneMode: (paneMode) => set({ paneMode }),
}));

type PreferencesState = {
  theme: 'system' | 'light' | 'dark';
  refreshPolicy: 'watch' | 'poll' | 'manual';
  mobileMode: 'auto' | 'on' | 'off';
  lastNamespace?: string;
  setTheme: (theme: PreferencesState['theme']) => void;
  setRefreshPolicy: (refreshPolicy: PreferencesState['refreshPolicy']) => void;
  setMobileMode: (mobileMode: PreferencesState['mobileMode']) => void;
  setLastNamespace: (namespace?: string) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      refreshPolicy: 'watch',
      mobileMode: 'auto',
      lastNamespace: 'default',
      setTheme: (theme) => set({ theme }),
      setRefreshPolicy: (refreshPolicy) => set({ refreshPolicy }),
      setMobileMode: (mobileMode) => set({ mobileMode }),
      setLastNamespace: (lastNamespace) => set({ lastNamespace }),
    }),
    {
      name: 'k8s-ide-preferences',
    },
  ),
);
