import type { ApiResourceDescriptor, KubeResource, ResourceCapabilities } from '@k8s-ide/core';
import React from 'react';

export interface LayoutShellProps {
  title: string;
  subtitle: string;
  sidebar: React.ReactNode;
  content: React.ReactNode;
  detail: React.ReactNode;
}

export function LayoutShell(props: LayoutShellProps): React.ReactElement {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>{props.title}</h1>
          <p style={styles.subtitle}>{props.subtitle}</p>
        </div>
      </header>
      <main style={styles.main}>
        <aside style={styles.sidebar}>{props.sidebar}</aside>
        <section style={styles.content}>{props.content}</section>
        <aside style={styles.detail}>{props.detail}</aside>
      </main>
    </div>
  );
}

export interface ResourceSidebarProps {
  resources: ApiResourceDescriptor[];
  active?: ApiResourceDescriptor;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (resource: ApiResourceDescriptor) => void;
}

export function ResourceSidebar(props: ResourceSidebarProps): React.ReactElement {
  return (
    <div style={styles.panel}>
      <input
        aria-label="Search resources"
        placeholder="Search resources"
        style={styles.input}
        value={props.search}
        onChange={(event) => props.onSearchChange(event.target.value)}
      />
      <div style={styles.scrollList}>
        {props.resources.map((resource) => {
          const selected =
            props.active?.group === resource.group &&
            props.active.version === resource.version &&
            props.active.resource === resource.resource;

          return (
            <button
              key={`${resource.group}/${resource.version}/${resource.resource}`}
              style={{
                ...styles.sidebarButton,
                ...(selected ? styles.sidebarButtonActive : null)
              }}
              onClick={() => props.onSelect(resource)}
            >
              <strong>{resource.kind}</strong>
              <span style={styles.mutedText}>{resource.resource}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface ResourceTableProps {
  resource?: ApiResourceDescriptor;
  items: KubeResource[];
  selectedName?: string;
  onSelect: (item: KubeResource) => void;
}

export function ResourceTable(props: ResourceTableProps): React.ReactElement {
  if (!props.resource) {
    return <EmptyState title="Choose a resource" body="Pick a discovered resource from the left pane." />;
  }

  return (
    <div style={styles.panel}>
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>{props.resource.kind}</h2>
          <p style={styles.subtitle}>
            Generic list view powered by discovery and the dynamic client contract.
          </p>
        </div>
      </div>
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Namespace</th>
              <th style={styles.th}>Age</th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => {
              const name = item.metadata?.name || 'unknown';
              const selected = props.selectedName === name;

              return (
                <tr
                  key={`${item.metadata?.namespace || '_cluster'}/${name}`}
                  style={selected ? styles.rowActive : undefined}
                  onClick={() => props.onSelect(item)}
                >
                  <td style={styles.td}>{name}</td>
                  <td style={styles.td}>{item.metadata?.namespace || 'cluster'}</td>
                  <td style={styles.td}>{formatAge(item.metadata?.creationTimestamp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface ResourceDetailProps {
  resource?: ApiResourceDescriptor;
  item?: KubeResource;
  capabilities?: ResourceCapabilities;
}

export function ResourceDetail(props: ResourceDetailProps): React.ReactElement {
  if (!props.resource) {
    return (
      <EmptyState title="No detail selected" body="Select a resource type, then choose an item to inspect." />
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>Details</h2>
          <p style={styles.subtitle}>
            {props.item?.metadata?.name || `Choose a ${props.resource.kind.toLowerCase()}`}
          </p>
        </div>
      </div>
      <CapabilityPills capabilities={props.capabilities} />
      <pre style={styles.pre}>{JSON.stringify(props.item || {}, null, 2)}</pre>
    </div>
  );
}

export function CapabilityPills(props: {
  capabilities?: ResourceCapabilities;
}): React.ReactElement | null {
  if (!props.capabilities) {
    return null;
  }

  const enabled = Object.entries(props.capabilities)
    .filter(([, value]) => value)
    .map(([key]) => key);

  return (
    <div style={styles.pillRow}>
      {enabled.map((value) => (
        <span key={value} style={styles.pill}>
          {value}
        </span>
      ))}
    </div>
  );
}

export function EmptyState(props: { title: string; body: string }): React.ReactElement {
  return (
    <div style={styles.emptyState}>
      <h2 style={styles.sectionTitle}>{props.title}</h2>
      <p style={styles.subtitle}>{props.body}</p>
    </div>
  );
}

function formatAge(value?: string): string {
  if (!value) {
    return 'unknown';
  }

  const date = new Date(value);
  const hours = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60)));
  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#08111f',
    color: '#e2e8f0'
  },
  header: {
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid rgba(148, 163, 184, 0.2)'
  },
  title: {
    margin: 0,
    fontSize: '1.75rem'
  },
  subtitle: {
    margin: '0.35rem 0 0',
    color: '#94a3b8',
    lineHeight: 1.5
  },
  main: {
    display: 'grid',
    gridTemplateColumns: '280px minmax(0, 1fr) 420px',
    gap: '1rem',
    padding: '1rem',
    minHeight: 'calc(100vh - 100px)'
  },
  sidebar: {
    minWidth: 0
  },
  content: {
    minWidth: 0
  },
  detail: {
    minWidth: 0
  },
  panel: {
    background: '#0f172a',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    borderRadius: '0.75rem',
    padding: '1rem',
    height: '100%',
    boxSizing: 'border-box'
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    background: '#020617',
    color: '#e2e8f0',
    border: '1px solid rgba(148, 163, 184, 0.24)',
    borderRadius: '0.5rem',
    padding: '0.75rem'
  },
  scrollList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginTop: '0.75rem',
    maxHeight: 'calc(100vh - 210px)',
    overflow: 'auto'
  },
  sidebarButton: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
    alignItems: 'flex-start',
    background: '#020617',
    color: '#e2e8f0',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    borderRadius: '0.75rem',
    padding: '0.75rem',
    cursor: 'pointer'
  },
  sidebarButtonActive: {
    borderColor: '#38bdf8',
    boxShadow: '0 0 0 1px rgba(56, 189, 248, 0.35)'
  },
  mutedText: {
    color: '#94a3b8',
    fontSize: '0.85rem'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem'
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1.1rem'
  },
  tableWrapper: {
    overflow: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    textAlign: 'left',
    padding: '0.75rem',
    color: '#94a3b8',
    borderBottom: '1px solid rgba(148, 163, 184, 0.12)'
  },
  td: {
    padding: '0.75rem',
    borderBottom: '1px solid rgba(148, 163, 184, 0.08)'
  },
  rowActive: {
    background: 'rgba(14, 165, 233, 0.1)',
    cursor: 'pointer'
  },
  pre: {
    background: '#020617',
    borderRadius: '0.75rem',
    padding: '1rem',
    overflow: 'auto',
    fontSize: '0.8rem',
    minHeight: '320px'
  },
  pillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginBottom: '1rem'
  },
  pill: {
    background: 'rgba(56, 189, 248, 0.16)',
    color: '#bae6fd',
    borderRadius: '999px',
    padding: '0.35rem 0.75rem',
    fontSize: '0.8rem'
  },
  emptyState: {
    ...{
      background: '#0f172a',
      border: '1px dashed rgba(148, 163, 184, 0.2)',
      borderRadius: '0.75rem',
      padding: '1.5rem'
    }
  }
};
