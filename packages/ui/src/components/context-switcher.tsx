import type { CSSProperties } from 'react';
import type { ClusterContext } from '@k8s-ide/core';

type ContextSwitcherProps = {
  contexts: ClusterContext[];
  value?: string;
  namespace?: string;
  onContextChange: (context: string) => void;
  onNamespaceChange: (namespace: string) => void;
};

export function ContextSwitcher({
  contexts,
  value,
  namespace,
  onContextChange,
  onNamespaceChange,
}: ContextSwitcherProps) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      }}
    >
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase' }}>Context</span>
        <select
          value={value ?? ''}
          onChange={(event) => onContextChange(event.target.value)}
          style={inputStyle}
        >
          <option value="" disabled>
            Select context
          </option>
          {contexts.map((context) => (
            <option key={context.name} value={context.name}>
              {context.name}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase' }}>Namespace</span>
        <input
          value={namespace ?? ''}
          onChange={(event) => onNamespaceChange(event.target.value)}
          placeholder="default"
          style={inputStyle}
        />
      </label>
    </div>
  );
}

const inputStyle: CSSProperties = {
  background: '#111827',
  color: '#f9fafb',
  border: '1px solid #374151',
  borderRadius: 8,
  padding: '10px 12px',
};
