import type { GetOpts, ListOpts } from '@k8s-ide/core'
import { listKey } from '@k8s-ide/core'
import type { K8sApiClient } from '@k8s-ide/api-client'

export const queryKeys = {
  contexts: ['contexts'] as const,
  discovery: ['discovery'] as const,
  resources: (opts: ListOpts) =>
    [
      'resources',
      listKey(opts, opts.namespace),
      opts.labelSelector ?? '',
      opts.fieldSelector ?? '',
      opts.continue ?? '',
    ] as const,
  resource: (opts: GetOpts) =>
    [
      'resource',
      opts.group,
      opts.version,
      opts.resource,
      opts.namespace ?? '_cluster',
      opts.name,
    ] as const,
}

export function createQueryClientDefaults() {
  return {
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }
}

export type QueryClientFactory = () => import('@tanstack/react-query').QueryClient

export async function fetchWithClient<T>(
  client: K8sApiClient | null,
  fn: (c: K8sApiClient) => Promise<T>,
): Promise<T> {
  if (!client) throw new Error('API client not initialized')
  return fn(client)
}
