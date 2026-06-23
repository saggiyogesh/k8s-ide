export type ClusterContext = {
  name: string;
  cluster: string;
  user: string;
  namespace: string;
  isCurrent: boolean;
};

export type SessionInfo = {
  context: string;
  namespace: string;
  serverVersion?: string;
};

export type ApiResourceDescriptor = {
  group: string;
  version: string;
  resource: string;
  kind: string;
  namespaced: boolean;
  verbs: string[];
  shortNames?: string[];
  categories?: string[];
  singularName?: string;
};

export type ResourceRef = {
  group: string;
  version: string;
  resource: string;
  kind?: string;
  namespace?: string;
  name: string;
};

export type KubeResource = {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    uid?: string;
    resourceVersion?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: Array<{
      apiVersion: string;
      kind: string;
      name: string;
      uid: string;
    }>;
  };
  [key: string]: unknown;
};

export type ResourceListResult = {
  items: KubeResource[];
  continue?: string;
  resourceVersion?: string;
};

export type ListOpts = {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  limit?: number;
  continue?: string;
};

export type GetOpts = {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  name: string;
};

export type DeleteOpts = GetOpts;

export type ApplyResult = {
  action: "created" | "updated" | "unchanged";
  resource: KubeResource;
};

export type WatchEventType = "ADDED" | "MODIFIED" | "DELETED" | "BOOKMARK" | "ERROR";

export type WatchEvent = {
  type: WatchEventType;
  object?: KubeResource;
  error?: string;
};

export type WatchOpts = {
  group: string;
  version: string;
  resource: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  resourceVersion?: string;
};

export type LogOpts = {
  namespace: string;
  pod: string;
  container?: string;
  follow?: boolean;
  tailLines?: number;
  previous?: boolean;
};

export type ExecOpts = {
  namespace: string;
  pod: string;
  container?: string;
  command: string[];
  tty?: boolean;
  stdin?: boolean;
};

export type ExecSession = {
  sessionId: string;
};

export type PortForwardOpts = {
  namespace: string;
  pod: string;
  ports: Array<{ local: number; remote: number }>;
};

export type PortForwardSession = {
  sessionId: string;
};

export type ResourceAction =
  | "delete"
  | "scale"
  | "restart"
  | "port-forward"
  | "logs"
  | "exec"
  | "apply";

export type ResourceActionRequest = {
  action: ResourceAction;
  ref: ResourceRef;
  payload?: Record<string, unknown>;
};

export type ActionResult = {
  success: boolean;
  message?: string;
  data?: unknown;
};

export type BackendStatus = "disconnected" | "connecting" | "connected" | "error";

export type ResourceCapabilities = {
  canList: boolean;
  canGet: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canWatch: boolean;
  canApply: boolean;
  canScale: boolean;
  canRestart: boolean;
  canLogs: boolean;
  canExec: boolean;
  canPortForward: boolean;
};
