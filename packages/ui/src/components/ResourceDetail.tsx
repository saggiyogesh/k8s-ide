import { useMemo } from "react";
import type { KubeResource, ResourceCapabilities } from "@k8s-ide/core";
import { Button } from "./primitives.js";

interface YamlEditorProps {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}

export function YamlEditor({ value, onChange, readOnly }: YamlEditorProps) {
  return (
    <textarea
      className="h-full w-full resize-none bg-black/30 p-4 font-mono text-xs leading-relaxed text-white/90 focus:outline-none"
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
      spellCheck={false}
    />
  );
}

export function resourceToYaml(obj: KubeResource): string {
  // Simple JSON-to-YAML-ish display for MVP; Monaco can replace later
  return JSON.stringify(obj, null, 2);
}

interface ResourceDetailProps {
  resource?: KubeResource;
  yaml: string;
  capabilities?: ResourceCapabilities;
  onYamlChange?: (v: string) => void;
  onApply?: () => void;
  onDelete?: () => void;
  onScale?: (replicas: number) => void;
  onRestart?: () => void;
  applying?: boolean;
}

export function ResourceDetail({
  resource,
  yaml,
  capabilities,
  onYamlChange,
  onApply,
  onDelete,
  onScale,
  onRestart,
  applying,
}: ResourceDetailProps) {
  const replicas = useMemo(() => {
    const spec = resource?.spec as { replicas?: number } | undefined;
    return spec?.replicas ?? 1;
  }, [resource]);

  if (!resource) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/50">
        Select a resource to view details
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex-1">
          <div className="text-sm font-semibold">{resource.metadata.name}</div>
          <div className="text-xs text-white/50">
            {resource.kind}
            {resource.metadata.namespace ? ` · ${resource.metadata.namespace}` : ""}
          </div>
        </div>
        {capabilities?.canUpdate && onApply && (
          <Button size="sm" onClick={onApply} disabled={applying}>
            {applying ? "Applying..." : "Apply"}
          </Button>
        )}
        {capabilities?.canScale && onScale && (
          <Button size="sm" variant="outline" onClick={() => onScale(replicas + 1)}>
            Scale +1
          </Button>
        )}
        {capabilities?.canRestart && onRestart && (
          <Button size="sm" variant="outline" onClick={onRestart}>
            Restart
          </Button>
        )}
        {capabilities?.canDelete && onDelete && (
          <Button size="sm" variant="destructive" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <YamlEditor value={yaml} onChange={onYamlChange} readOnly={!capabilities?.canUpdate} />
      </div>
    </div>
  );
}

interface ActionBarProps {
  title: string;
  children?: React.ReactNode;
}

export function ActionBar({ title, children }: ActionBarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
      <h1 className="flex-1 text-lg font-semibold">{title}</h1>
      {children}
    </div>
  );
}
