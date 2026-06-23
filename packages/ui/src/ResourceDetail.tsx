import { useState } from "react"
import type { KubeResource, ResourceCapabilities } from "@k8s-ide/core"
import { buildCapabilities } from "@k8s-ide/core"
import { useExplorerStore } from "@k8s-ide/store"
import { cn } from "./utils.js"

interface ResourceDetailProps {
  resource: KubeResource
  capabilities?: ResourceCapabilities
  className?: string
}

type Tab = "overview" | "yaml" | "events" | "logs" | "terminal"

export function ResourceDetail({ resource, capabilities, className }: ResourceDetailProps) {
  const { activeDetailTab, setActiveDetailTab } = useExplorerStore()
  const tab = activeDetailTab as Tab

  const tabs: { id: Tab; label: string; available: boolean }[] = [
    { id: "overview", label: "Overview", available: true },
    { id: "yaml", label: "YAML", available: true },
    { id: "events", label: "Events", available: true },
    { id: "logs", label: "Logs", available: capabilities?.hasLogs ?? false },
    { id: "terminal", label: "Terminal", available: capabilities?.hasExec ?? false },
  ]

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div>
          <h2 className="text-sm font-semibold">{resource.metadata.name}</h2>
          <p className="text-xs text-muted-foreground">
            {resource.kind} · {resource.metadata.namespace ?? "cluster-scoped"}
          </p>
        </div>
      </div>

      <div className="flex gap-0 border-b text-sm">
        {tabs
          .filter((t) => t.available)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveDetailTab(t.id)}
              className={cn(
                "px-4 py-2 border-b-2 transition-colors",
                tab === t.id
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {tab === "overview" && <OverviewTab resource={resource} />}
        {tab === "yaml" && <YamlTab resource={resource} />}
        {tab === "events" && <EventsTab resource={resource} />}
        {tab === "logs" && <LogsTab resource={resource} />}
        {tab === "terminal" && <TerminalTab resource={resource} />}
      </div>
    </div>
  )
}

function OverviewTab({ resource }: { resource: KubeResource }) {
  const labels = resource.metadata.labels ?? {}
  const annotations = resource.metadata.annotations ?? {}

  return (
    <div className="space-y-4">
      <Section title="Metadata">
        <Field label="Name" value={resource.metadata.name} />
        {resource.metadata.namespace && (
          <Field label="Namespace" value={resource.metadata.namespace} />
        )}
        <Field label="UID" value={resource.metadata.uid} />
        <Field label="Resource Version" value={resource.metadata.resourceVersion} />
        <Field label="Created" value={new Date(resource.metadata.creationTimestamp).toLocaleString()} />
      </Section>

      {Object.keys(labels).length > 0 && (
        <Section title="Labels">
          {Object.entries(labels).map(([k, v]) => (
            <Field key={k} label={k} value={v} />
          ))}
        </Section>
      )}

      {Object.keys(annotations).length > 0 && (
        <Section title="Annotations">
          {Object.entries(annotations)
            .slice(0, 10)
            .map(([k, v]) => (
              <Field key={k} label={k} value={v} />
            ))}
          {Object.keys(annotations).length > 10 && (
            <p className="text-xs text-muted-foreground">
              +{Object.keys(annotations).length - 10} more
            </p>
          )}
        </Section>
      )}
    </div>
  )
}

function YamlTab({ resource }: { resource: KubeResource }) {
  const [copied, setCopied] = useState(false)
  const yaml = JSON.stringify(resource, null, 2)

  const handleCopy = () => {
    void navigator.clipboard.writeText(yaml).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex justify-end">
        <button
          onClick={handleCopy}
          className="text-xs px-2 py-1 rounded border hover:bg-accent transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="flex-1 overflow-auto text-xs font-mono bg-muted rounded-md p-4">{yaml}</pre>
    </div>
  )
}

function EventsTab({ resource }: { resource: KubeResource }) {
  return (
    <div className="text-sm text-muted-foreground">
      Events for {resource.metadata.name} will appear here.
    </div>
  )
}

function LogsTab({ resource }: { resource: KubeResource }) {
  return (
    <div className="font-mono text-xs bg-black text-green-400 rounded-md p-4 h-full overflow-auto">
      <p className="text-muted-foreground">
        Logs for {resource.metadata.name} — select a container to begin streaming.
      </p>
    </div>
  )
}

function TerminalTab({ resource }: { resource: KubeResource }) {
  return (
    <div className="font-mono text-xs bg-black text-green-400 rounded-md p-4 h-full overflow-auto">
      <p className="text-muted-foreground">
        Exec into {resource.metadata.name} — select a container to open a terminal.
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground w-36 shrink-0 truncate">{label}</span>
      <span className="font-mono text-xs break-all">{value}</span>
    </div>
  )
}
