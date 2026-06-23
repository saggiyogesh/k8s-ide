type YamlEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onApply?: () => void;
  disabled?: boolean;
};

export function YamlEditor({ value, onChange, onApply, disabled }: YamlEditorProps) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        spellCheck={false}
        style={{
          minHeight: 260,
          resize: 'vertical',
          borderRadius: 12,
          border: '1px solid #374151',
          background: '#111827',
          color: '#f9fafb',
          padding: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, SFMono-Regular, Consolas, monospace',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onApply}
          disabled={disabled || !onApply}
          type="button"
          style={{
            background: '#2563eb',
            border: 'none',
            borderRadius: 10,
            color: '#fff',
            padding: '10px 14px',
            cursor: disabled || !onApply ? 'not-allowed' : 'pointer',
            opacity: disabled || !onApply ? 0.6 : 1,
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
