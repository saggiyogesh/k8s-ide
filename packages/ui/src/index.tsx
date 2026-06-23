import type { CSSProperties, PropsWithChildren } from 'react';

import type {
  ActionResult,
  ApiResourceDescriptor,
  KubeResource,
  ResourceCapabilities,
  ResourceRef,
} from '@k8s-ide/core';

const panelStyle: CSSProperties = {
  border: '1px solid rgba(148, 163, 184, 0.25)',
  borderRadius: 16,
  background: 'rgba(15, 23, 42, 0.72)',
  padding: 16,
  boxShadow: '0 18px 48px rgba(15, 23, 42, 0.16)',
};

export function SectionCard({ children }: PropsWithChildren) {
  return <section style={panelStyle}>{children}</section>;
}

interface ExplorerSidebarProps {
  resources: ApiResourceDescriptor[];
  activeResource?: Pick<ApiResourceDescriptor, 'group' | 'version' | 'resource'>;
  onSelect: (resource: ApiResourceDescriptor) => void;
}

export function ResourceExplorerSidebar({
  resources,
  activeResource,
  onSelect,
}: ExplorerSidebarProps) {
  return (
    <SectionCard>
      <div style={{ display: 'grid', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.7 }}>Explorer</div>
          <h2 style={{ margin: '6px 0 0', fontSize: 20 }}>Discovered resources</h2>
        </div>
        {resources.map((resource) => {
          const active =
            resource.group === activeResource?.group &&
            resource.version === activeResource?.version &&
            resource.resource === activeResource?.resource;

          return (
            <button
              key={`${resource.group}/${resource.version}/${resource.resource}`}
              type="button"
              onClick={() => onSelect(resource)}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 12,
                border: active ? '1px solid #60a5fa' : '1px solid rgba(148, 163, 184, 0.2)',
                background: active ? 'rgba(96, 165, 250, 0.18)' : 'rgba(15, 23, 42, 0.25)',
                color: '#e2e8f0',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600 }}>{resource.kind}</div>
              <div style={{ opacity: 0.7, fontSize: 13 }}>
                {resource.namespaced ? 'Namespaced' : 'Cluster'} · {resource.resource}
              </div>
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

interface ResourceTableProps {
  items: KubeResource[];
  selectedResource?: ResourceRef;
  onSelect: (resource: KubeResource) => void;
}

export function ResourceTable({ items, selectedResource, onSelect }: ResourceTableProps) {
  return (
    <SectionCard>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.7 }}>Table</div>
          <h3 style={{ margin: '6px 0 0', fontSize: 20 }}>Cluster objects</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.78 }}>
                <th style={{ paddingBottom: 10 }}>Name</th>
                <th style={{ paddingBottom: 10 }}>Namespace</th>
                <th style={{ paddingBottom: 10 }}>Status</th>
                <th style={{ paddingBottom: 10 }}>Age</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const selected = selectedResource?.name === item.ref.name;
                return (
                  <tr
                    key={`${item.ref.namespace || 'cluster'}:${item.ref.name}`}
                    onClick={() => onSelect(item)}
                    style={{
                      cursor: 'pointer',
                      background: selected ? 'rgba(96, 165, 250, 0.12)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '12px 0', fontWeight: 600 }}>{item.ref.name}</td>
                    <td style={{ padding: '12px 0', opacity: 0.8 }}>
                      {item.ref.namespace || 'cluster'}
                    </td>
                    <td style={{ padding: '12px 0' }}>{String(item.summary.status ?? item.phase)}</td>
                    <td style={{ padding: '12px 0', opacity: 0.8 }}>
                      {String(item.summary.age ?? 'n/a')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {items.length === 0 ? (
            <div style={{ padding: '12px 0', opacity: 0.68 }}>
              No resources match the selected scope yet.
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

interface ActionBarProps {
  capabilities?: ResourceCapabilities;
  busy?: boolean;
  lastAction?: ActionResult;
  onAction: (action: 'delete' | 'scale' | 'restart' | 'logs' | 'exec' | 'port-forward') => void;
}

export function ActionBar({ capabilities, busy, lastAction, onAction }: ActionBarProps) {
  const actionButton = (
    action: 'delete' | 'scale' | 'restart' | 'logs' | 'exec' | 'port-forward',
    label: string,
    enabled: boolean | undefined,
  ) => (
    <button
      key={action}
      type="button"
      disabled={!enabled || busy}
      onClick={() => onAction(action)}
      style={{
        borderRadius: 999,
        border: '1px solid rgba(148, 163, 184, 0.2)',
        padding: '10px 14px',
        background: enabled ? 'rgba(15, 23, 42, 0.5)' : 'rgba(15, 23, 42, 0.2)',
        color: enabled ? '#e2e8f0' : 'rgba(226, 232, 240, 0.45)',
        cursor: enabled ? 'pointer' : 'not-allowed',
      }}
    >
      {label}
    </button>
  );

  return (
    <SectionCard>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.7 }}>Actions</div>
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {actionButton('logs', 'Logs', capabilities?.canStreamLogs)}
            {actionButton('exec', 'Exec', capabilities?.canExec)}
            {actionButton('port-forward', 'Port-forward', capabilities?.canPortForward)}
            {actionButton('scale', 'Scale', capabilities?.canScale)}
            {actionButton('restart', 'Rollout restart', capabilities?.canRestart)}
            {actionButton('delete', 'Delete', capabilities?.canDelete)}
          </div>
        </div>
        {lastAction ? (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: lastAction.success ? 'rgba(34, 197, 94, 0.16)' : 'rgba(248, 113, 113, 0.16)',
            }}
          >
            {lastAction.message}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

interface ResourceDetailProps {
  resource?: KubeResource;
}

export function ResourceDetail({ resource }: ResourceDetailProps) {
  return (
    <SectionCard>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.7 }}>Detail</div>
          <h3 style={{ margin: '6px 0 0', fontSize: 20 }}>
            {resource ? resource.ref.name : 'Select a resource'}
          </h3>
        </div>
        {resource ? (
          <>
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
                margin: 0,
              }}
            >
              <div>
                <dt style={{ opacity: 0.65 }}>Kind</dt>
                <dd style={{ margin: 0 }}>{resource.kind}</dd>
              </div>
              <div>
                <dt style={{ opacity: 0.65 }}>Namespace</dt>
                <dd style={{ margin: 0 }}>{resource.ref.namespace || 'cluster'}</dd>
              </div>
              <div>
                <dt style={{ opacity: 0.65 }}>Phase</dt>
                <dd style={{ margin: 0 }}>{resource.phase}</dd>
              </div>
              <div>
                <dt style={{ opacity: 0.65 }}>Created</dt>
                <dd style={{ margin: 0 }}>{resource.metadata.creationTimestamp}</dd>
              </div>
            </dl>
            <YamlEditor value={resource.yaml} />
          </>
        ) : (
          <div style={{ opacity: 0.68 }}>Choose an item from the table to inspect and edit YAML.</div>
        )}
      </div>
    </SectionCard>
  );
}

interface YamlEditorProps {
  value: string;
  readOnly?: boolean;
}

export function YamlEditor({ value, readOnly = true }: YamlEditorProps) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.7 }}>YAML</div>
      <textarea
        readOnly={readOnly}
        value={value}
        style={{
          minHeight: 240,
          width: '100%',
          borderRadius: 14,
          border: '1px solid rgba(148, 163, 184, 0.2)',
          background: 'rgba(2, 6, 23, 0.72)',
          color: '#e2e8f0',
          padding: 14,
          fontFamily:
            'ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        }}
      />
    </div>
  );
}
