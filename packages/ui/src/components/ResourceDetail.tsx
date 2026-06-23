import { useState } from "react";
import { X, RefreshCw, Trash2, RotateCcw, ZoomIn } from "lucide-react";
import { useResource, useExplorerStore, useSessionStore, useDeleteResource } from "@k8s-ide/store";
import { ageFromTimestamp, isBeingDeleted } from "@k8s-ide/core";
import { cn } from "../utils.js";
import { YamlViewer } from "./YamlViewer.js";

type Tab = "overview" | "yaml" | "events" | "logs";

export function ResourceDetail() {
  const { selectedResource, selectedItem, setSelectedItem, activeDetailTab, setActiveDetailTab } =
    useExplorerStore((s) => ({
      selectedResource: s.selectedResource,
      selectedItem: s.selectedItem,
      setSelectedItem: s.setSelectedItem,
      activeDetailTab: s.activeDetailTab,
      setActiveDetailTab: s.setActiveDetailTab,
    }));

  const activeContext = useSessionStore((s) => s.activeContext);
  const { mutate: deleteResource } = useDeleteResource();

  const opts =
    selectedResource && selectedItem
      ? {
          group: selectedResource.group,
          version: selectedResource.version,
          resource: selectedResource.resource,
          ...(selectedItem.namespace ? { namespace: selectedItem.namespace } : {}),
          name: selectedItem.name,
        }
      : null;

  const { data: resource, isLoading, refetch } = useResource(
    opts ?? { group: "", version: "v1", resource: "pods", name: "" },
  );

  if (!selectedItem || !activeContext) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
        Select a resource to view details
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "yaml", label: "YAML" },
    { id: "events", label: "Events" },
    ...(selectedResource?.kind === "Pod" ? [{ id: "logs" as Tab, label: "Logs" }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Detail header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{selectedItem.name}</p>
          {selectedItem.namespace && (
            <p className="text-xs text-muted-foreground">{selectedItem.namespace}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete ${selectedItem.name}?`)) {
                deleteResource({
                  group: selectedResource?.group ?? "",
                  version: selectedResource?.version ?? "v1",
                  resource: selectedResource?.resource ?? "",
                  ...(selectedItem.namespace ? { namespace: selectedItem.namespace } : {}),
                  name: selectedItem.name,
                });
                setSelectedItem(null);
              }
            }}
            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setSelectedItem(null)}
            className="p-1.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={cn(
              "px-3 py-2 text-xs font-medium transition-colors",
              activeDetailTab === tab.id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setActiveDetailTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : activeDetailTab === "yaml" ? (
          <YamlViewer resource={resource} />
        ) : activeDetailTab === "overview" ? (
          <OverviewPane resource={resource} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {activeDetailTab} — coming soon
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewPane({ resource }: { resource: ReturnType<typeof useResource>["data"] }) {
  if (!resource) return null;

  const meta = resource.metadata;

  const fields: { label: string; value: string | undefined }[] = [
    { label: "Name", value: meta.name },
    { label: "Namespace", value: meta.namespace },
    { label: "UID", value: meta.uid },
    { label: "Resource Version", value: meta.resourceVersion },
    {
      label: "Created",
      value: meta.creationTimestamp ? ageFromTimestamp(meta.creationTimestamp) + " ago" : undefined,
    },
    {
      label: "Deleting",
      value: isBeingDeleted(resource) ? "Yes" : undefined,
    },
  ];

  return (
    <div className="p-4 space-y-4">
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Metadata
        </h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          {fields
            .filter((f) => f.value)
            .map((f) => (
              <>
                <dt key={`${f.label}-dt`} className="text-xs text-muted-foreground">
                  {f.label}
                </dt>
                <dd key={`${f.label}-dd`} className="text-xs font-mono break-all">
                  {f.value}
                </dd>
              </>
            ))}
        </dl>
      </section>

      {meta.labels && Object.keys(meta.labels).length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Labels
          </h3>
          <div className="flex flex-wrap gap-1">
            {Object.entries(meta.labels).map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs font-mono"
              >
                {k}={v}
              </span>
            ))}
          </div>
        </section>
      )}

      {meta.annotations && Object.keys(meta.annotations).length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Annotations
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {Object.entries(meta.annotations).map(([k, v]) => (
              <>
                <dt key={`${k}-dt`} className="text-xs text-muted-foreground font-mono truncate">
                  {k}
                </dt>
                <dd key={`${k}-dd`} className="text-xs font-mono break-all">
                  {v}
                </dd>
              </>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
