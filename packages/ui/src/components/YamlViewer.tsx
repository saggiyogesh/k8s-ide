import { useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";
import type { KubeResource } from "@k8s-ide/core";

interface YamlViewerProps {
  resource: KubeResource | undefined;
}

// Minimal JSON→YAML converter for display (no external dep required in UI package).
function jsonToYaml(obj: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") {
    if (obj.includes("\n") || obj.includes(": ") || obj.startsWith("{")) {
      return `|\n${obj
        .split("\n")
        .map((l) => pad + "  " + l)
        .join("\n")}`;
    }
    return JSON.stringify(obj);
  }
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return obj
      .map((item) => {
        const val = jsonToYaml(item, indent + 1);
        return `${pad}- ${val.trimStart()}`;
      })
      .join("\n");
  }
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return entries
      .map(([k, v]) => {
        const val = jsonToYaml(v, indent + 1);
        if (val.includes("\n")) {
          return `${pad}${k}:\n${val}`;
        }
        return `${pad}${k}: ${val}`;
      })
      .join("\n");
  }
  return String(obj);
}

export function YamlViewer({ resource }: YamlViewerProps) {
  const [copied, setCopied] = useState(false);

  const yaml = useMemo(() => {
    if (!resource) return "";
    // Remove managed fields to reduce noise.
    const clean = { ...resource };
    if (clean.metadata) {
      const meta = { ...clean.metadata };
      delete (meta as Record<string, unknown>)["managedFields"];
      clean.metadata = meta;
    }
    return jsonToYaml(clean);
  }, [resource]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!resource) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No resource loaded
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 z-10 p-1.5 rounded bg-background/80 hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors"
        title="Copy YAML"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <pre className="h-full overflow-auto p-4 text-xs font-mono leading-relaxed text-foreground bg-transparent">
        {yaml}
      </pre>
    </div>
  );
}
