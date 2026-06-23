import { useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ApiResourceDescriptor, JsonObject, ResourceCapabilities, ResourceRef } from '@k8s-ide/core';

export interface AppShellProps {
  sidebar: ReactNode;
  content: ReactNode;
  detail?: ReactNode;
  header?: ReactNode;
}

export function AppShell({ sidebar, content, detail, header }: AppShellProps): ReactElement {
  return (
    <div className="app-shell">
      <header className="panel panel-header">{header}</header>
      <aside className="panel panel-sidebar">{sidebar}</aside>
      <main className="panel panel-content">{content}</main>
      <section className="panel panel-detail">{detail}</section>
    </div>
  );
}

interface ContextSwitcherProps {
  contexts: Array<{ name: string; isCurrent?: boolean }>;
  value?: string;
  status?: string;
  onChange: (context: string) => void;
}

export function ContextSwitcher({
  contexts,
  value,
  status,
  onChange
}: ContextSwitcherProps): ReactElement {
  return (
    <div className="stack gap-sm">
      <label className="label">
        Context
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select a cluster context</option>
          {contexts.map((context) => (
            <option key={context.name} value={context.name}>
              {context.name}
              {context.isCurrent ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </label>
      {status ? <StatusBadge>{status}</StatusBadge> : null}
    </div>
  );
}

interface ResourceExplorerProps {
  descriptors: ApiResourceDescriptor[];
  selectedKey?: string;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (descriptor: ApiResourceDescriptor) => void;
}

export function ResourceExplorer({
  descriptors,
  selectedKey,
  search,
  onSearch,
  onSelect
}: ResourceExplorerProps): ReactElement {
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return descriptors;
    }

    return descriptors.filter((descriptor) =>
      [descriptor.kind, descriptor.resource, descriptor.group, ...descriptor.shortNames]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [descriptors, search]);

  return (
    <div className="stack gap-md">
      <label className="label">
        Resource search
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="pods, deployments, crds..." />
      </label>

      <div className="stack gap-xs resource-list">
        {filtered.map((descriptor) => {
          const key = `${descriptor.group}:${descriptor.version}:${descriptor.resource}`;
          return (
            <button
              key={key}
              type="button"
              className={`resource-chip ${selectedKey === key ? 'active' : ''}`}
              onClick={() => onSelect(descriptor)}
            >
              <span>{descriptor.kind}</span>
              <small>{descriptor.resource}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface ResourceTableProps {
  rows: JsonObject[];
  onSelect?: (resource: JsonObject) => void;
}

export function ResourceTable({ rows, onSelect }: ResourceTableProps): ReactElement {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 46,
    overscan: 6
  });

  return (
    <div ref={parentRef} className="resource-table">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => {
          const resource = rows[item.index];
          const metadata = (resource.metadata as JsonObject | undefined) ?? {};
          const name = displayValue(metadata.name, 'unknown');
          const namespace = displayValue(metadata.namespace, 'cluster');

          return (
            <button
              key={`${namespace}:${name}`}
              type="button"
              className="resource-row"
              style={{ transform: `translateY(${item.start}px)` }}
              onClick={() => onSelect?.(resource)}
            >
              <strong>{name}</strong>
              <span>{namespace}</span>
              <span>{displayValue(resource.kind, '')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface ActionBarProps {
  capabilities?: ResourceCapabilities;
  onApplyYaml?: () => void;
  onDelete?: () => void;
  onScale?: () => void;
  onRestart?: () => void;
  onLogs?: () => void;
}

export function ActionBar({
  capabilities,
  onApplyYaml,
  onDelete,
  onScale,
  onRestart,
  onLogs
}: ActionBarProps): ReactElement {
  return (
    <div className="action-bar">
      <button type="button" onClick={onApplyYaml}>
        Apply YAML
      </button>
      <button type="button" onClick={onDelete} disabled={!capabilities?.canDelete}>
        Delete
      </button>
      <button type="button" onClick={onScale} disabled={!capabilities?.supportsScale}>
        Scale
      </button>
      <button type="button" onClick={onRestart} disabled={!capabilities?.supportsRestart}>
        Restart
      </button>
      <button type="button" onClick={onLogs} disabled={!capabilities?.supportsLogs}>
        Logs
      </button>
    </div>
  );
}

interface ResourceDetailProps {
  descriptor?: ApiResourceDescriptor;
  resource?: JsonObject;
  onOpenYaml?: () => void;
}

export function ResourceDetail({ descriptor, resource, onOpenYaml }: ResourceDetailProps): ReactElement {
  if (!descriptor || !resource) {
    return (
      <div className="stack gap-md">
        <h2>Resource detail</h2>
        <p>Select a resource from the explorer to inspect its metadata and YAML.</p>
      </div>
    );
  }

  const metadata = (resource.metadata as JsonObject | undefined) ?? {};

  return (
    <div className="stack gap-md">
      <div className="row space-between">
        <div>
          <h2>{displayValue(metadata.name, 'unknown')}</h2>
          <p>
            {descriptor.kind} · {descriptor.resource}
          </p>
        </div>
        <button type="button" onClick={onOpenYaml}>
          View YAML
        </button>
      </div>

      <dl className="resource-meta">
        <div>
          <dt>Namespace</dt>
          <dd>{displayValue(metadata.namespace, 'cluster')}</dd>
        </div>
        <div>
          <dt>Resource version</dt>
          <dd>{displayValue(metadata.resourceVersion, '-')}</dd>
        </div>
        <div>
          <dt>UID</dt>
          <dd>{displayValue(metadata.uid, '-')}</dd>
        </div>
      </dl>

      <pre className="code-block">{JSON.stringify(resource, null, 2)}</pre>
    </div>
  );
}

interface YamlEditorProps {
  initialValue: string;
  onApply?: (value: string) => void;
}

export function YamlEditor({ initialValue, onApply }: YamlEditorProps): ReactElement {
  const [draft, setDraft] = useState(initialValue);

  return (
    <div className="stack gap-sm">
      <div className="row space-between">
        <h3>YAML editor</h3>
        <button type="button" onClick={() => onApply?.(draft)}>
          Apply
        </button>
      </div>
      <textarea className="yaml-editor" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} />
    </div>
  );
}

export function StatusBadge({ children }: { children: ReactNode }): ReactElement {
  return <span className="status-badge">{children}</span>;
}

export function refFromResource(descriptor: ApiResourceDescriptor, resource: JsonObject): ResourceRef & { name: string } {
  const metadata = (resource.metadata as JsonObject | undefined) ?? {};

  return {
    group: descriptor.group,
    version: descriptor.version,
    resource: descriptor.resource,
    name: displayValue(metadata.name, ''),
    namespace: metadata.namespace !== undefined ? displayValue(metadata.namespace, '') || undefined : undefined
  };
}

function displayValue(value: unknown, fallback: string): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return fallback;
}
