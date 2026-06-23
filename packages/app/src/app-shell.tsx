import { HttpK8sApiClient } from '@k8s-ide/api-client'
import type { ApiResourceDescriptor } from '@k8s-ide/core'
import { getResourceCapabilities, refFromResource } from '@k8s-ide/core'
import { fetchWithClient, queryKeys, useExplorerStore, useSessionStore } from '@k8s-ide/store'
import { ResourceDetail, ResourceExplorer, ResourceTable } from '@k8s-ide/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import YAML from 'yaml'

export interface AppShellProps {
  backendUrl?: string
}

export function AppShell({ backendUrl }: AppShellProps) {
  const queryClient = useQueryClient()
  const {
    backendUrl: storedUrl,
    setBackendUrl,
    setClient,
    setBackendStatus,
    setContexts,
    setCurrentContext,
    setSession,
    currentContext,
    client,
    backendStatus,
  } = useSessionStore()

  const {
    selectedDescriptor,
    selectedResource,
    namespaceFilter,
    labelSelector,
    setSelectedDescriptor,
    setSelectedResource,
  } = useExplorerStore()

  const url = backendUrl ?? storedUrl

  useEffect(() => {
    if (backendUrl) setBackendUrl(backendUrl)
  }, [backendUrl, setBackendUrl])

  useEffect(() => {
    const apiClient = new HttpK8sApiClient({ baseUrl: url })
    setClient(apiClient)
    setBackendStatus('connecting')

    apiClient
      .listContexts()
      .then((contexts) => {
        setContexts(contexts.map((c) => c.name))
        setBackendStatus('connected')
        const current = contexts.find((c) => c.isCurrent)
        if (current && !currentContext) {
          setCurrentContext(current.name)
        }
      })
      .catch((err: Error) => {
        setBackendStatus('error', err.message)
      })
  }, [url, setClient, setBackendStatus, setContexts, setCurrentContext, currentContext])

  useEffect(() => {
    if (!client || !currentContext) return
    client
      .openSession(currentContext)
      .then((session) => setSession(session))
      .catch((err: Error) => setBackendStatus('error', err.message))
  }, [client, currentContext, setSession, setBackendStatus])

  const { data: descriptors = [] } = useQuery({
    queryKey: queryKeys.discovery,
    queryFn: () => fetchWithClient(client, (c) => c.getDiscovery()),
    enabled: !!client && backendStatus === 'connected',
  })

  const listOpts = useMemo(() => {
    if (!selectedDescriptor) return null
    return {
      group: selectedDescriptor.group,
      version: selectedDescriptor.version,
      resource: selectedDescriptor.resource,
      namespace: selectedDescriptor.namespaced ? namespaceFilter || undefined : undefined,
      labelSelector: labelSelector || undefined,
    }
  }, [selectedDescriptor, namespaceFilter, labelSelector])

  const { data: listResult, isLoading: listLoading } = useQuery({
    queryKey: listOpts ? queryKeys.resources(listOpts) : ['resources', 'none'],
    queryFn: () => fetchWithClient(client, (c) => c.listResources(listOpts!)),
    enabled: !!client && !!listOpts,
    refetchInterval: 30_000,
  })

  const getOpts = useMemo(() => {
    if (!selectedResource) return null
    return {
      group: selectedResource.group,
      version: selectedResource.version,
      resource: selectedResource.resource,
      name: selectedResource.name,
      namespace: selectedResource.namespace,
    }
  }, [selectedResource])

  const { data: resourceData } = useQuery({
    queryKey: getOpts ? queryKeys.resource(getOpts) : ['resource', 'none'],
    queryFn: () => fetchWithClient(client, (c) => c.getResource(getOpts!)),
    enabled: !!client && !!getOpts,
  })

  const applyMutation = useMutation({
    mutationFn: (yaml: string) => fetchWithClient(client, (c) => c.applyYaml(yaml)),
    onSuccess: () => {
      if (listOpts) queryClient.invalidateQueries({ queryKey: queryKeys.resources(listOpts) })
      if (getOpts) queryClient.invalidateQueries({ queryKey: queryKeys.resource(getOpts) })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => fetchWithClient(client, (c) => c.deleteResource(getOpts!)),
    onSuccess: () => {
      setSelectedResource(null)
      if (listOpts) queryClient.invalidateQueries({ queryKey: queryKeys.resources(listOpts) })
    },
  })

  const capabilities = selectedDescriptor ? getResourceCapabilities(selectedDescriptor) : null
  const yaml = resourceData ? YAML.stringify(resourceData) : ''

  const handleSelectDescriptor = (d: ApiResourceDescriptor) => {
    setSelectedDescriptor(d)
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">K8s IDE</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              backendStatus === 'connected'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : backendStatus === 'error'
                  ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            }`}
          >
            {backendStatus}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-[var(--color-muted-foreground)]">Context</label>
          <select
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-sm"
            value={currentContext ?? ''}
            onChange={(e) => setCurrentContext(e.target.value || null)}
          >
            <option value="">Select context…</option>
            {useSessionStore.getState().contexts.map((ctx) => (
              <option key={ctx} value={ctx}>
                {ctx}
              </option>
            ))}
          </select>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r border-[var(--color-border)]">
          <ResourceExplorer descriptors={descriptors} onSelectDescriptor={handleSelectDescriptor} />
        </aside>
        <main className="flex min-w-0 flex-1">
          <section className="w-1/2 border-r border-[var(--color-border)]">
            {selectedDescriptor && (
              <div className="border-b border-[var(--color-border)] px-3 py-2">
                <h2 className="font-semibold">{selectedDescriptor.kind}</h2>
                {selectedDescriptor.namespaced && (
                  <input
                    className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-sm"
                    placeholder="Namespace filter (empty = all)"
                    value={namespaceFilter}
                    onChange={(e) => useExplorerStore.getState().setNamespaceFilter(e.target.value)}
                  />
                )}
              </div>
            )}
            <div className="h-[calc(100%-52px)]">
              <ResourceTable
                items={listResult?.items ?? []}
                selectedName={selectedResource?.name}
                isLoading={listLoading}
                onSelect={(item) => {
                  if (!selectedDescriptor) return
                  const ref = refFromResource(selectedDescriptor, item)
                  setSelectedResource(ref)
                }}
              />
            </div>
          </section>
          <section className="w-1/2">
            <ResourceDetail
              resource={selectedResource}
              yaml={yaml}
              capabilities={{
                canApply: capabilities?.canApply,
                canDelete: capabilities?.canDelete,
              }}
              onApply={async (y) => {
                await applyMutation.mutateAsync(y)
              }}
              onDelete={() => deleteMutation.mutate()}
            />
          </section>
        </main>
      </div>
    </div>
  )
}
