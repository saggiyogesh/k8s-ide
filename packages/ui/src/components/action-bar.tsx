import type { ResourceCapabilities } from '@k8s-ide/core';

type ActionBarProps = {
  capabilities: ResourceCapabilities;
  onApply?: () => void;
  onDelete?: () => void;
  onScale?: () => void;
  onRestart?: () => void;
  onLogs?: () => void;
  onExec?: () => void;
  onPortForward?: () => void;
};

export function ActionBar(props: ActionBarProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {props.capabilities.supportsYamlEditor ? (
        <ActionButton label="Apply YAML" onClick={props.onApply} />
      ) : null}
      {props.capabilities.canDelete ? <ActionButton label="Delete" onClick={props.onDelete} tone="danger" /> : null}
      {props.capabilities.supportsScale ? <ActionButton label="Scale" onClick={props.onScale} /> : null}
      {props.capabilities.supportsRestart ? <ActionButton label="Restart" onClick={props.onRestart} /> : null}
      {props.capabilities.supportsLogs ? <ActionButton label="Logs" onClick={props.onLogs} /> : null}
      {props.capabilities.supportsExec ? <ActionButton label="Exec" onClick={props.onExec} /> : null}
      {props.capabilities.supportsPortForward ? (
        <ActionButton label="Port Forward" onClick={props.onPortForward} />
      ) : null}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  tone = 'default',
}: {
  label: string;
  onClick?: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        background: tone === 'danger' ? '#7f1d1d' : '#1d4ed8',
        color: '#f8fafc',
        border: 'none',
        borderRadius: 999,
        padding: '8px 12px',
        cursor: onClick ? 'pointer' : 'not-allowed',
        opacity: onClick ? 1 : 0.6,
      }}
      type="button"
    >
      {label}
    </button>
  );
}
