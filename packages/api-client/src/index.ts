export type {
  K8sApiClient,
  ListOpts,
  GetOpts,
  DeleteOpts,
  WatchOpts,
  LogOpts,
  ExecOpts,
  PortForwardOpts,
  ScaleOpts,
  RestartOpts,
  ResourceActionRequest,
} from "./contract.js";

export { HttpK8sApiClient, ApiError } from "./http-client.js";
export type { HttpK8sApiClientConfig } from "./http-client.js";
