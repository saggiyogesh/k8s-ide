import { useMemo, useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ApiResourceDescriptor, KubeResource } from '@k8s-ide/core';
import { stringify } from 'yaml';

type LayoutProps = {
  title: string;
  platform: 'desktop' | 'web' | 'mobile';
  header: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
  details: ReactNode;
};

export function AppLayout({ title, platform, header, sidebar, children, details }: LayoutProps) {
  const isMobile = platform === 'mobile';

  return (
    <div style={{ minHeight: '100vh', background: '#081018', color: '#e2e8f0' }}>
      <header
        style={{
          borderBottom: '1px solid #1e293b',
          padding: '1rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          position: 'sticky',
          top: 0,
          background: 'rgba(8, 16, 24, 0.95)',
          backdropFilter: 'blur(12px)',
          zIndex: 10,
        }}
      >
        <div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#38bdf8' }}>
            {platform}
          </div>
          <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.4rem' }}>{title}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>{header}</div>
      </header>
      <main
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '280px minmax(0, 1fr) minmax(320px, 0.85fr)',
          minHeight: 'calc(100vh - 84px)',
        }}
      >
        <aside style={{ borderRight: '1px solid #1e293b', padding: '1rem', background: '#0f172a' }}>
          {sidebar}
        </aside>
        <section style={{ padding: '1rem', borderRight: isMobile ? undefined : '1px solid #1e293b' }}>
          {children}
        </section>
        <section style={{ padding: '1rem', background: '#020617' }}>{details}</section>
      </main>
    </div>
  );
}

type SidebarProps = {
  resources: ApiResourceDescriptor[];
  selectedKey?: string;
  search: string;
  onSearchChange: (search: string) => void;
  onSelect: (descriptor: ApiResourceDescriptor) => void;
};

export function ResourceSidebar({
  resources,
  selectedKey,
  search,
  onSearchChange,
  onSelect,
}: SidebarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Search resources</span>
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="pods, deployments, ingresses..."
          style={{
            borderRadius: 8,
            border: '1px solid #334155',
            background: '#020617',
            color: 'inherit',
            padding: '0.65rem 0.75rem',
          }}
        />
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '72vh', overflow: 'auto' }}>
        {resources.map((resource) => {
          const key = `${resource.group || 'core'}:${resource.version}:${resource.resource}`;
          const selected = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(resource)}
              style={{
                textAlign: 'left',
                borderRadius: 10,
                border: selected ? '1px solid #38bdf8' : '1px solid #1e293b',
                padding: '0.75rem',
                background: selected ? '#0c4a6e' : '#111827',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600 }}>{resource.kind}</div>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                {(resource.group || 'core')}/{resource.version} - {resource.resource}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type TableColumn<T> = {
  key: string;
  header: string;
  width?: string;
  render: (item: T) => ReactNode;
};

type ResourceTableProps<T> = {
  title: string;
  rows: T[];
  columns: TableColumn<T>[];
  selectedRowKey?: string;
  getRowKey: (item: T) => string;
  onSelectRow: (item: T) => void;
  compact?: boolean;
};

export function ResourceTable<T>({
  title,
  rows,
  columns,
  selectedRowKey,
  getRowKey,
  onSelectRow,
  compact = false,
}: ResourceTableProps<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowHeight = compact ? 48 : 58;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 6,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{rows.length} rows</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: columns.map((column) => column.width ?? 'minmax(120px, 1fr)').join(' '),
          gap: '0.75rem',
          padding: '0 0.75rem',
          color: '#94a3b8',
          fontSize: '0.85rem',
          textTransform: 'uppercase',
        }}
      >
        {columns.map((column) => (
          <div key={column.key}>{column.header}</div>
        ))}
      </div>
      <div
        ref={parentRef}
        style={{
          height: '70vh',
          overflow: 'auto',
          border: '1px solid #1e293b',
          borderRadius: 16,
          background: '#020617',
        }}
      >
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) {
              return null;
            }
            const key = getRowKey(row);
            const selected = key === selectedRowKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectRow(row)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'grid',
                  gridTemplateColumns: columns.map((column) => column.width ?? 'minmax(120px, 1fr)').join(' '),
                  gap: '0.75rem',
                  padding: compact ? '0.75rem' : '1rem 0.75rem',
                  alignItems: 'center',
                  border: 'none',
                  borderBottom: '1px solid #1e293b',
                  background: selected ? '#082f49' : 'transparent',
                  color: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {columns.map((column) => (
                  <div key={column.key}>{column.render(row)}</div>
                ))}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type DetailPanelProps = {
  descriptor?: ApiResourceDescriptor;
  resource?: KubeResource;
  onApply?: (yaml: string) => Promise<void>;
  applyLabel?: string;
};

export function ResourceDetailsPanel({
  descriptor,
  resource,
  onApply,
  applyLabel = 'Apply YAML',
}: DetailPanelProps) {
  const yamlText = useMemo(() => (resource ? stringify(resource) : ''), [resource]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div>
        <div style={{ fontSize: '0.75rem', color: '#38bdf8', textTransform: 'uppercase' }}>Details</div>
        <h2 style={{ margin: '0.2rem 0 0' }}>{resource?.metadata.name ?? 'Select a resource'}</h2>
        <p style={{ color: '#94a3b8', lineHeight: 1.5 }}>
          {descriptor
            ? `${descriptor.kind} in ${(descriptor.group || 'core')}/${descriptor.version}`
            : 'Browse a discovered resource type, then select a row to inspect and edit YAML.'}
        </p>
      </div>
      {resource ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
            <Stat label="Namespace" value={resource.metadata.namespace ?? 'cluster'} />
            <Stat label="Created" value={resource.metadata.creationTimestamp ?? 'n/a'} />
            <Stat label="Kind" value={resource.kind} />
            <Stat label="Version" value={resource.apiVersion} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>YAML</h3>
            {onApply ? (
              <button
                type="button"
                onClick={() => {
                  void onApply(yamlText);
                }}
                style={{
                  borderRadius: 8,
                  border: '1px solid #38bdf8',
                  background: '#082f49',
                  color: '#e0f2fe',
                  padding: '0.55rem 0.85rem',
                  cursor: 'pointer',
                }}
              >
                {applyLabel}
              </button>
            ) : null}
          </div>
          <textarea
            value={yamlText}
            readOnly
            style={{
              minHeight: '55vh',
              width: '100%',
              borderRadius: 14,
              border: '1px solid #1e293b',
              background: '#0f172a',
              color: '#e2e8f0',
              padding: '0.85rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '0.85rem',
            }}
          />
        </>
      ) : (
        <EmptyState
          title="No resource selected"
          description="The shared detail pane will evolve into the YAML editor, events, logs, and terminal surface for desktop, web, and mobile."
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #1e293b', borderRadius: 12, padding: '0.85rem', background: '#0f172a' }}>
      <div style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ marginTop: '0.35rem' }}>{value}</div>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        padding: '2rem',
        borderRadius: 16,
        border: '1px dashed #334155',
        background: '#020617',
      }}
    >
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ color: '#94a3b8', lineHeight: 1.6 }}>{description}</p>
    </div>
  );
}
