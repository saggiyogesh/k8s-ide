import type { KubeResource, ResourceCapabilities } from "@k8s-ide/core"
import { Trash2, RefreshCw, Scale, Play, Terminal } from "lucide-react"
import { cn } from "./utils.js"

interface ActionBarProps {
  resource: KubeResource
  capabilities: ResourceCapabilities
  onDelete?: () => void
  onScale?: () => void
  onRestart?: () => void
  onLogs?: () => void
  onExec?: () => void
  onPortForward?: () => void
  className?: string
}

export function ActionBar({
  resource,
  capabilities,
  onDelete,
  onScale,
  onRestart,
  onLogs,
  onExec,
  onPortForward,
  className,
}: ActionBarProps) {
  return (
    <div className={cn("flex items-center gap-2 p-2 border-b bg-muted/20", className)}>
      {capabilities.canDelete && (
        <ActionButton
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="Delete"
          variant="destructive"
          {...(onDelete ? { onClick: onDelete } : {})}
        />
      )}
      {capabilities.hasScale && (
        <ActionButton
          icon={<Scale className="h-3.5 w-3.5" />}
          label="Scale"
          {...(onScale ? { onClick: onScale } : {})}
        />
      )}
      {capabilities.hasRolloutRestart && (
        <ActionButton
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          label="Restart"
          {...(onRestart ? { onClick: onRestart } : {})}
        />
      )}
      {capabilities.hasLogs && (
        <ActionButton
          icon={<Play className="h-3.5 w-3.5" />}
          label="Logs"
          {...(onLogs ? { onClick: onLogs } : {})}
        />
      )}
      {capabilities.hasExec && (
        <ActionButton
          icon={<Terminal className="h-3.5 w-3.5" />}
          label="Exec"
          {...(onExec ? { onClick: onExec } : {})}
        />
      )}
    </div>
  )
}

interface ActionButtonProps {
  icon: React.ReactNode
  label: string
  variant?: "default" | "destructive"
  onClick?: () => void
  disabled?: boolean
}

function ActionButton({ icon, label, variant = "default", onClick, disabled }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors font-medium",
        variant === "destructive"
          ? "border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          : "border-border text-foreground/80 hover:bg-accent hover:text-accent-foreground",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      {icon}
      {label}
    </button>
  )
}
