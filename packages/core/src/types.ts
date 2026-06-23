/**
 * A Kubernetes cluster context parsed from a kubeconfig file.
 */
export interface ClusterContext {
  name: string
  cluster: string
  user: string
  namespace?: string
}

/**
 * Describes a single API resource as returned by the discovery API.
 * Mirrors `k8s.io/apimachinery/pkg/apis/meta/v1.APIResource` fields that are
 * relevant to the IDE.
 */
export interface ApiResourceDescriptor {
  group: string
  version: string
  /** Plural resource name, e.g. "pods", "deployments" */
  resource: string
  /** Singular name, e.g. "pod" */
  singular: string
  /** Kind name, e.g. "Pod" */
  kind: string
  namespaced: boolean
  shortNames: string[]
  verbs: string[]
  categories: string[]
}

/**
 * A lightweight reference that uniquely identifies one Kubernetes object.
 */
export interface ResourceRef {
  group: string
  version: string
  resource: string
  kind: string
  name: string
  namespace?: string
}

/**
 * A thin wrapper around a raw Kubernetes object returned from the API.
 * We keep it structurally typed so any resource works without codegen.
 */
export interface KubeResource {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    namespace?: string
    uid: string
    resourceVersion: string
    creationTimestamp: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    ownerReferences?: OwnerReference[]
    deletionTimestamp?: string
    finalizers?: string[]
    generation?: number
  }
  spec?: Record<string, unknown>
  status?: Record<string, unknown>
  [key: string]: unknown
}

export interface OwnerReference {
  apiVersion: string
  kind: string
  name: string
  uid: string
  controller?: boolean
  blockOwnerDeletion?: boolean
}

/**
 * Session info returned after opening a cluster context.
 */
export interface SessionInfo {
  context: string
  namespace: string
  serverVersion: string
}

/**
 * Watch event streamed from the backend.
 */
export type WatchEventType = "ADDED" | "MODIFIED" | "DELETED" | "BOOKMARK" | "ERROR"

export interface WatchEvent {
  type: WatchEventType
  object: KubeResource
}

/**
 * Describes what operations the IDE supports for a given resource kind.
 * Derived from discovery verbs plus known kind-specific adapters.
 */
export interface ResourceCapabilities {
  canList: boolean
  canGet: boolean
  canCreate: boolean
  canUpdate: boolean
  canPatch: boolean
  canDelete: boolean
  canWatch: boolean
  /** Pod containers emit log streams */
  hasLogs: boolean
  /** Pod containers accept exec sessions */
  hasExec: boolean
  /** Pods and Services support port-forward */
  hasPortForward: boolean
  /** Deployments, StatefulSets, DaemonSets */
  hasScale: boolean
  /** Deployments, StatefulSets, DaemonSets */
  hasRolloutRestart: boolean
}
