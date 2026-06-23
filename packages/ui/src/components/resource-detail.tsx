import type { CSSProperties, ReactNode } from 'react';
import type { KubeResource } from '@k8s-ide/core';

type ResourceDetailProps = {
  resource?: KubeResource;
  logs?: string[];
  yamlEditor?: ReactNode;
};

export function ResourceDetail({ resource, logs = [], yamlEditor }: ResourceDetailProps) {
  if (!resource) {
    return (
      <EmptyState
        title="No resource selected"
        description="Choose a resource from the explorer to inspect metadata, YAML, and workload actions."
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={sectionStyle}>
        <h3 style={headingStyle}>Overview</h3>
        <dl style={{ display: 'grid', gap: 8, margin: 0 }}>
          <MetaRow label="Name" value={resource.metadata?.name ?? '-'} />
          <MetaRow label="Namespace" value={resource.metadata?.namespace ?? 'cluster'} />
          <MetaRow label="Kind" value={resource.kind ?? '-'} />
          <MetaRow label="API version" value={resource.apiVersion ?? '-'} />
          <MetaRow label="UID" value={resource.metadata?.uid ?? '-'} />
        </dl>
      </section>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>YAML</h3>
        {yamlEditor}
      </section>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>Logs / stream preview</h3>
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            background: '#111827',
            borderRadius: 12,
            padding: 12,
            minHeight: 140,
          }}
        >
          {logs.length > 0 ? logs.join('\n') : 'No stream attached yet.'}
        </pre>
      </section>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
      <dt style={{ color: '#9ca3af' }}>{label}</dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        border: '1px dashed #374151',
        borderRadius: 12,
        padding: 20,
        display: 'grid',
        gap: 8,
      }}
    >
      <strong>{title}</strong>
      <span style={{ color: '#9ca3af' }}>{description}</span>
    </div>
  );
}

const sectionStyle: CSSProperties = {
  border: '1px solid #1f2937',
  borderRadius: 16,
  padding: 16,
  display: 'grid',
  gap: 12,
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
};
