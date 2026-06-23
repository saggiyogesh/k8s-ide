import { useState } from "react";
import type { KubeResource } from "@k8s-ide/core";
import type { ResourceCapabilities } from "@k8s-ide/core";
import { YamlEditor } from "./YamlEditor.js";
import { ActionBar } from "./ActionBar.js";
import { cn } from "../lib/cn.js";

type Tab = "overview" | "yaml";

type Props = {
  resource: KubeResource | null;
  yaml: string;
  capabilities?: ResourceCapabilities;
  onApplyYaml?: (yaml: string) => void;
  onDelete?: () => void;
  onRestart?: () => void;
  onScale?: (replicas: number) => void;
  loading?: boolean;
};

export function ResourceDetail({
  resource,
  yaml,
  capabilities,
  onApplyYaml,
  onDelete,
  onRestart,
  onScale,
  loading,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [draft, setDraft] = useState(yaml);

  if (!resource) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Select a resource to inspect
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-sm text-zinc-400">Loading resource...</div>;
  }

  return (
    <div className="flex h-full flex-col border-l border-white/10 bg-zinc-950/50">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">{resource.metadata.name}</h2>
          <p className="text-xs text-zinc-500">
            {resource.kind} · {resource.apiVersion}
          </p>
        </div>
        <ActionBar
          capabilities={capabilities}
          onDelete={onDelete}
          onRestart={onRestart}
          onScale={onScale}
        />
      </div>
      <div className="flex gap-1 border-b border-white/10 px-4">
        {(["overview", "yaml"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-2 text-sm capitalize",
              tab === t ? "border-b-2 border-sky-500 text-sky-200" : "text-zinc-400",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {tab === "overview" && (
          <dl className="grid grid-cols-[120px_1fr] gap-3 text-sm">
            <dt className="text-zinc-500">Name</dt>
            <dd>{resource.metadata.name}</dd>
            <dt className="text-zinc-500">Namespace</dt>
            <dd>{resource.metadata.namespace ?? "—"}</dd>
            <dt className="text-zinc-500">UID</dt>
            <dd className="font-mono text-xs">{resource.metadata.uid ?? "—"}</dd>
            <dt className="text-zinc-500">Resource Version</dt>
            <dd className="font-mono text-xs">{resource.metadata.resourceVersion ?? "—"}</dd>
          </dl>
        )}
        {tab === "yaml" && (
          <YamlEditor
            value={draft}
            onChange={setDraft}
            onApply={() => onApplyYaml?.(draft)}
            readOnly={!capabilities?.canApply}
          />
        )}
      </div>
    </div>
  );
}
