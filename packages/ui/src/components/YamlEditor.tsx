import { useEffect, useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onApply?: () => void;
  readOnly?: boolean;
  applying?: boolean;
};

export function YamlEditor({ value, onChange, onApply, readOnly, applying }: Props) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", minHeight: 0 }}>
      <textarea
        className="k8s-yaml-editor"
        value={local}
        readOnly={readOnly}
        onChange={(event) => {
          setLocal(event.target.value);
          onChange(event.target.value);
        }}
      />
      {!readOnly && onApply && (
        <div>
          <button className="k8s-button k8s-button-primary" disabled={applying} onClick={onApply}>
            {applying ? "Applying..." : "Apply YAML"}
          </button>
        </div>
      )}
    </div>
  );
}
