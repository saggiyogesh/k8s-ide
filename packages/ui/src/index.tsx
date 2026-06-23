import { useVirtualizer } from '@tanstack/react-virtual';
import type { ApiResourceDescriptor, KubeResourceSummary, ResourceCapabilities, ResourceRef } from '@k8s-ide/core';
import { getResourceCapabilities } from '@k8s-ide/core';
import { useMemo, useRef, type CSSProperties, type ReactElement } from 'react';

export interface ResourceExplorerProps {
  descriptors: ApiResourceDescriptor[];
  resources: KubeResourceSummary[];
  selectedDescriptor?: ApiResourceDescriptor;
  selectedResource?: ResourceRef;
  yamlValue: string;
  search: string;
  backendStatus: string;
  onSearchChange: (value: string) => void;
  onSelectDescriptor: (descriptor: ApiResourceDescriptor) => void;
  onSelectResource: (ref: ResourceRef) => void;
  onYamlChange?: (value: string) => void;
}

function panelStyle(border = true): CSSProperties {
  return {
    background: 'rgba(15, 23, 42, 0.82)',
    border: border ? '1px solid rgba(148, 163, 184, 0.16)' : 'none',
    borderRadius: 18,
    padding: 16,
    boxShadow: '0 10px 30px rgba(2, 6, 23, 0.25)'
  };
}

function capabilityList(capabilities: ResourceCapabilities): string[] {
  return Object.entries(capabilities)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
}

export function StatusBadge({ status }: { status: string }): ReactElement {
  const background =
    status === 'ready' ? 'rgba(34, 197, 94, 0.18)' : status === 'error' ? 'rgba(239, 68, 68, 0.18)' : 'rgba(96, 165, 250, 0.18)';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 999,
        background,
        fontSize: 12,
        fontWeight: 600
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: status === 'ready' ? '#22c55e' : status === 'error' ? '#ef4444' : '#60a5fa'
        }}
      />
      {status}
    </span>
  );
}

export function YamlEditor({
  value,
  onChange,
  readOnly = false
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}): ReactElement {
  return (
    <textarea
      aria-label="YAML editor"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      readOnly={readOnly}
      spellCheck={false}
      style={{
        width: '100%',
        minHeight: 280,
        resize: 'vertical',
        background: '#020617',
        color: '#e2e8f0',
        border: '1px solid rgba(148, 163, 184, 0.24)',
        borderRadius: 14,
        padding: 14,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 13
      }}
    />
  );
}

export function ActionBar({ descriptor }: { descriptor?: ApiResourceDescriptor }): ReactElement {
  const capabilities = descriptor ? getResourceCapabilities(descriptor) : undefined;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {capabilities ? (
        capabilityList(capabilities).map((capability) => (
          <button
            key={capability}
            type="button"
            style={{
              border: '1px solid rgba(148, 163, 184, 0.18)',
              background: '#0f172a',
              color: '#cbd5e1',
              borderRadius: 999,
              padding: '8px 12px',
              textTransform: 'capitalize'
            }}
          >
            {capability.replace(/^can/, '').replace(/^supports/, '')}
          </button>
        ))
      ) : (
        <span style={{ color: '#94a3b8' }}>Select a resource type to see actions.</span>
      )}
    </div>
  );
}

export function ResourceTable({
  resources,
  selectedResource,
  onSelectResource
}: {
  resources: KubeResourceSummary[];
  selectedResource?: ResourceRef;
  onSelectResource: (resource: ResourceRef) => void;
}): ReactElement {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: resources.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 8
  });

  return (
    <div
      ref={parentRef}
      style={{
        height: 320,
        overflow: 'auto',
        border: '1px solid rgba(148, 163, 184, 0.16)',
        borderRadius: 14,
        background: '#020617'
      }}
    >
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const resource = resources[virtualRow.index];
          const isSelected = resource && selectedResource && resource.ref.name === selectedResource.name && resource.ref.namespace === selectedResource.namespace;

          if (!resource) {
            return null;
          }

          return (
            <button
              key={resource.ref.name + (resource.ref.namespace || '')}
              type="button"
              onClick={() => onSelectResource(resource.ref)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `translateY(${virtualRow.start}px)`,
                width: '100%',
                height: virtualRow.size,
                border: 'none',
                borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
                background: isSelected ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                color: '#e2e8f0',
                textAlign: 'left',
                padding: '0 14px',
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr 1fr',
                gap: 12,
                alignItems: 'center',
                cursor: 'pointer'
              }}
            >
              <span>{resource.name}</span>
              <span style={{ color: '#94a3b8' }}>{resource.namespace || 'cluster-wide'}</span>
              <span style={{ color: '#94a3b8' }}>{resource.status || resource.kind}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ResourceExplorer(props: ResourceExplorerProps): ReactElement {
  const filteredDescriptors = useMemo(() => {
    const term = props.search.trim().toLowerCase();
    if (!term) {
      return props.descriptors;
    }

    return props.descriptors.filter((descriptor) =>
      [descriptor.kind, descriptor.resource, descriptor.group].some((value) => value.toLowerCase().includes(term))
    );
  }, [props.descriptors, props.search]);

  const descriptorCapabilities = props.selectedDescriptor ? getResourceCapabilities(props.selectedDescriptor) : undefined;

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: 24,
        color: '#e2e8f0',
        background: 'linear-gradient(180deg, #020617 0%, #0f172a 100%)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Kubernetes IDE</h1>
          <p style={{ margin: '8px 0 0', color: '#94a3b8' }}>
            Shared explorer shell for desktop, web, and responsive companion views.
          </p>
        </div>
        <StatusBadge status={props.backendStatus} />
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '320px minmax(0, 1fr)' }}>
        <section style={panelStyle()}>
          <input
            aria-label="Search resources"
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder="Search by group, kind, or resource"
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid rgba(148, 163, 184, 0.18)',
              background: '#020617',
              color: '#e2e8f0',
              marginBottom: 12
            }}
          />
          <div style={{ display: 'grid', gap: 8, maxHeight: 640, overflow: 'auto' }}>
            {filteredDescriptors.map((descriptor) => {
              const selected =
                descriptor.resource === props.selectedDescriptor?.resource &&
                descriptor.version === props.selectedDescriptor?.version;

              return (
                <button
                  key={`${descriptor.group}/${descriptor.version}/${descriptor.resource}`}
                  type="button"
                  onClick={() => props.onSelectDescriptor(descriptor)}
                  style={{
                    ...panelStyle(false),
                    width: '100%',
                    textAlign: 'left',
                    border: selected ? '1px solid rgba(56, 189, 248, 0.75)' : '1px solid rgba(148, 163, 184, 0.16)',
                    background: selected ? 'rgba(14, 165, 233, 0.12)' : 'rgba(15, 23, 42, 0.7)'
                  }}
                >
                  <strong>{descriptor.kind}</strong>
                  <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>{descriptor.resource}</div>
                  <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                    {descriptor.group || 'core'}/{descriptor.version}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section style={{ display: 'grid', gap: 16 }}>
          <div style={panelStyle()}>
            <h2 style={{ marginTop: 0 }}>Capability-aware actions</h2>
            <p style={{ color: '#94a3b8' }}>
              {descriptorCapabilities
                ? `Detected actions for ${props.selectedDescriptor?.kind}.`
                : 'Discovery metadata drives which actions the UI enables.'}
            </p>
            <ActionBar descriptor={props.selectedDescriptor} />
          </div>

          <div style={panelStyle()}>
            <h2 style={{ marginTop: 0 }}>Resources</h2>
            <ResourceTable resources={props.resources} selectedResource={props.selectedResource} onSelectResource={props.onSelectResource} />
          </div>

          <div style={panelStyle()}>
            <h2 style={{ marginTop: 0 }}>YAML editor</h2>
            <YamlEditor value={props.yamlValue} onChange={props.onYamlChange} />
          </div>
        </section>
      </div>
    </div>
  );
}
