import type { ApiResourceDescriptor, ResourceCapabilities } from './types.js'

const SCALE_KINDS = new Set(['Deployment', 'StatefulSet', 'ReplicaSet', 'ReplicationController'])
const RESTART_KINDS = new Set(['Deployment', 'StatefulSet', 'DaemonSet'])
const LOG_KINDS = new Set(['Pod'])
const EXEC_KINDS = new Set(['Pod'])
const PORT_FORWARD_KINDS = new Set(['Pod', 'Service'])

function hasVerb(descriptor: ApiResourceDescriptor, verb: string): boolean {
  return descriptor.verbs.includes(verb) || descriptor.verbs.includes('*')
}

/** Derive UI action capabilities from discovery metadata and known adapters. */
export function getResourceCapabilities(descriptor: ApiResourceDescriptor): ResourceCapabilities {
  const canGet = hasVerb(descriptor, 'get')
  const canList = hasVerb(descriptor, 'list')
  const canWatch = hasVerb(descriptor, 'watch')
  const canCreate = hasVerb(descriptor, 'create')
  const canUpdate = hasVerb(descriptor, 'update') || hasVerb(descriptor, 'patch')
  const canDelete = hasVerb(descriptor, 'delete')

  return {
    canGet,
    canList,
    canWatch,
    canCreate,
    canUpdate,
    canDelete,
    canApply: canCreate || canUpdate,
    canScale: SCALE_KINDS.has(descriptor.kind),
    canRestart: RESTART_KINDS.has(descriptor.kind),
    canLogs: LOG_KINDS.has(descriptor.kind),
    canExec: EXEC_KINDS.has(descriptor.kind),
    canPortForward: PORT_FORWARD_KINDS.has(descriptor.kind),
  }
}

export function supportsLogs(kind: string): boolean {
  return LOG_KINDS.has(kind)
}

export function supportsExec(kind: string): boolean {
  return EXEC_KINDS.has(kind)
}

export function supportsScale(kind: string): boolean {
  return SCALE_KINDS.has(kind)
}

export function supportsRestart(kind: string): boolean {
  return RESTART_KINDS.has(kind)
}

export function supportsPortForward(kind: string): boolean {
  return PORT_FORWARD_KINDS.has(kind)
}
