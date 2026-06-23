import React, { useState } from "react";
import type { KubeResource, ApiResourceDescriptor } from "@k8s-ide/core";
import { getCapabilities } from "@k8s-ide/core";
import { useApplyYaml } from "@k8s-ide/store";
import { YamlEditor } from "./YamlEditor.js";
import { Button } from "./Button.js";
import { Badge } from "./Badge.js";
import { formatAge, cn } from "../utils.js";

type Tab = "overview" | "yaml" | "events" | "logs";

interface ResourceDetailProps {
  resource: KubeResource;
  descriptor?: ApiResourceDescriptor;
  onClose?: () => void;
  onDelete?: (resource: KubeResource) => void;
  onScale?: (resource: KubeResource, replicas: number) => void;
  onRestart?: (resource: KubeResource) => void;
}

export function ResourceDetail({
  resource,
  descriptor,
  onClose,
  onDelete,
  onScale,
  onRestart,
}: ResourceDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [yamlValue, setYamlValue] = useState<string>("");
  const applyMutation = useApplyYaml();

  const caps = descriptor ? getCapabilities(descriptor) : null;

  // Lazy-load YAML serialisation when the tab is activated.
  React.useEffect(() => {
    if (activeTab === "yaml") {
      import("js-yaml")
        .then((mod) => {
          setYamlValue(mod.dump(resource));
        })
        .catch(() => {
          setYamlValue(JSON.stringify(resource, null, 2));
        });
    }
  }, [activeTab, resource]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "yaml", label: "YAML" },
    { id: "events", label: "Events" },
    ...(caps?.supportsLogs ? [{ id: "logs" as Tab, label: "Logs" }] : []),
  ];

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-l border-zinc-700">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-zinc-700">
        <div>
          <div className="text-sm font-semibold text-zinc-100">{resource.metadata.name}</div>
          {resource.metadata.namespace && (
            <div className="text-xs text-zinc-500 mt-0.5">{resource.metadata.namespace}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {caps?.supportsScale && onScale && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const replicas = window.prompt("Replicas:");
                if (replicas !== null) onScale(resource, parseInt(replicas, 10));
              }}
            >
              Scale
            </Button>
          )}
          {caps?.supportsRollout && onRestart && (
            <Button variant="ghost" size="sm" onClick={() => onRestart(resource)}>
              Restart
            </Button>
          )}
          {caps?.canDelete && onDelete && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (window.confirm(`Delete ${resource.metadata.name}?`)) {
                  onDelete(resource);
                }
              }}
            >
              Delete
            </Button>
          )}
          <button
            onClick={onClose}
            className="ml-2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 text-sm transition-colors",
              activeTab === tab.id
                ? "text-sky-400 border-b-2 border-sky-400"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "overview" && <OverviewTab resource={resource} />}
        {activeTab === "yaml" && (
          <YamlEditor
            value={yamlValue}
            onChange={setYamlValue}
            onApply={(v) => applyMutation.mutate(v)}
            isApplying={applyMutation.isPending}
          />
        )}
        {activeTab === "events" && (
          <div className="p-4 text-sm text-zinc-500">Events not yet implemented.</div>
        )}
        {activeTab === "logs" && (
          <div className="p-4 text-sm text-zinc-500">Log streaming not yet implemented.</div>
        )}
      </div>
    </div>
  );
}

function OverviewTab({ resource }: { resource: KubeResource }) {
  const meta = resource.metadata;
  return (
    <div className="p-4 space-y-4">
      <Section title="Metadata">
        <Field label="Name" value={meta.name} />
        {meta.namespace && <Field label="Namespace" value={meta.namespace} />}
        <Field label="UID" value={meta.uid ?? "–"} />
        <Field label="Created" value={formatAge(meta.creationTimestamp)} />
        {meta.deletionTimestamp && (
          <Field label="Terminating since" value={formatAge(meta.deletionTimestamp)} />
        )}
      </Section>
      {meta.labels && Object.keys(meta.labels).length > 0 && (
        <Section title="Labels">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(meta.labels).map(([k, v]) => (
              <Badge key={k} variant="info">
                {k}={v}
              </Badge>
            ))}
          </div>
        </Section>
      )}
      {meta.annotations && Object.keys(meta.annotations).length > 0 && (
        <Section title="Annotations">
          {Object.entries(meta.annotations)
            .filter(([k]) => !k.startsWith("kubectl.kubernetes.io/last-applied"))
            .slice(0, 10)
            .map(([k, v]) => (
              <Field key={k} label={k} value={v} />
            ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-zinc-500 w-32 shrink-0">{label}</span>
      <span className="text-zinc-200 font-mono break-all">{value}</span>
    </div>
  );
}
