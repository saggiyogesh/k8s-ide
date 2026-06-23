import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import type { KubeResource, ResourceCapabilities } from "@k8s-ide/core";
import { resourceAge } from "@k8s-ide/core";
import { cn } from "../lib/utils.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { YamlEditor } from "./YamlEditor.js";

export interface ResourceDetailProps {
  resource: KubeResource;
  capabilities?: ResourceCapabilities;
  yaml?: string;
  onApplyYaml?: (yaml: string) => void;
  onDelete?: () => void;
  onScale?: (replicas: number) => void;
  onRestart?: () => void;
  isApplying?: boolean;
  className?: string;
}

export function ResourceDetail({
  resource,
  capabilities,
  yaml,
  onApplyYaml,
  onDelete,
  onScale,
  onRestart,
  isApplying,
  className,
}: ResourceDetailProps) {
  const [scaleInput, setScaleInput] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const meta = resource.metadata;

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">{meta.name}</h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{resource.kind}</span>
              {meta.namespace && (
                <>
                  <span>·</span>
                  <Badge variant="secondary">{meta.namespace}</Badge>
                </>
              )}
              <span>·</span>
              <span>Age: {resourceAge(meta.creationTimestamp)}</span>
            </div>
          </div>
          {/* Action bar */}
          <div className="flex items-center gap-1.5">
            {capabilities?.supportsRollout && onRestart && (
              <Button size="sm" variant="outline" onClick={onRestart}>
                Restart
              </Button>
            )}
            {capabilities?.supportsScale && onScale && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  className="h-8 w-16 rounded border border-input bg-transparent px-2 text-xs"
                  placeholder="Replicas"
                  value={scaleInput}
                  onChange={(e) => setScaleInput(e.target.value)}
                  min={0}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onScale(parseInt(scaleInput, 10))}
                  disabled={!scaleInput || isNaN(parseInt(scaleInput, 10))}
                >
                  Scale
                </Button>
              </div>
            )}
            {capabilities?.canDelete && onDelete && (
              <Button size="sm" variant="destructive" onClick={onDelete}>
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col overflow-hidden">
        <Tabs.List className="flex shrink-0 border-b border-border px-4">
          {[
            { value: "overview", label: "Overview" },
            { value: "yaml", label: "YAML" },
            { value: "labels", label: "Labels" },
          ].map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className={cn(
                "border-b-2 border-transparent px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
                "data-[state=active]:border-primary data-[state=active]:text-foreground",
              )}
            >
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="overview" className="flex-1 overflow-auto p-4">
          <OverviewPane resource={resource} />
        </Tabs.Content>

        <Tabs.Content value="yaml" className="flex-1 overflow-hidden">
          <YamlEditor
            value={yaml ?? "# Loading…"}
            {...(onApplyYaml !== undefined ? { onApply: onApplyYaml } : {})}
            {...(isApplying !== undefined ? { isApplying } : {})}
          />
        </Tabs.Content>

        <Tabs.Content value="labels" className="flex-1 overflow-auto p-4">
          <LabelsPane
            {...(meta.labels !== undefined ? { labels: meta.labels } : {})}
            {...(meta.annotations !== undefined ? { annotations: meta.annotations } : {})}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function OverviewPane({ resource }: { resource: KubeResource }) {
  const meta = resource.metadata;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="font-medium text-muted-foreground">UID</dt>
      <dd className="font-mono text-xs">{meta.uid}</dd>
      <dt className="font-medium text-muted-foreground">Resource Version</dt>
      <dd className="font-mono text-xs">{meta.resourceVersion}</dd>
      <dt className="font-medium text-muted-foreground">Created</dt>
      <dd>{new Date(meta.creationTimestamp).toLocaleString()}</dd>
      {meta.generation !== undefined && (
        <>
          <dt className="font-medium text-muted-foreground">Generation</dt>
          <dd>{meta.generation}</dd>
        </>
      )}
      {meta.ownerReferences && meta.ownerReferences.length > 0 && (
        <>
          <dt className="font-medium text-muted-foreground">Owners</dt>
          <dd>
            <ul className="space-y-0.5">
              {meta.ownerReferences.map((ref) => (
                <li key={ref.uid} className="font-mono text-xs">
                  {ref.kind}/{ref.name}
                </li>
              ))}
            </ul>
          </dd>
        </>
      )}
    </dl>
  );
}

function LabelsPane({
  labels,
  annotations,
}: {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Labels
        </h3>
        {labels && Object.keys(labels).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(labels).map(([k, v]) => (
              <Badge key={k} variant="outline" className="font-mono text-xs">
                {k}={v}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No labels</p>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Annotations
        </h3>
        {annotations && Object.keys(annotations).length > 0 ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            {Object.entries(annotations).map(([k, v]) => (
              <>
                <dt key={k + "-k"} className="font-mono text-muted-foreground">{k}</dt>
                <dd key={k + "-v"} className="break-all font-mono">{v}</dd>
              </>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">No annotations</p>
        )}
      </section>
    </div>
  );
}
