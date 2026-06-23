import type { ClusterContext } from "@k8s-ide/core"
import { useSessionStore } from "@k8s-ide/store"
import { ChevronDown, Circle } from "lucide-react"
import { useState } from "react"
import { cn } from "./utils.js"

interface ContextSwitcherProps {
  contexts: ClusterContext[]
  onSelect?: (context: string) => void
  className?: string
}

export function ContextSwitcher({ contexts, onSelect, className }: ContextSwitcherProps) {
  const { activeContext, backendStatus } = useSessionStore()
  const [open, setOpen] = useState(false)

  const statusColor =
    backendStatus === "online"
      ? "text-green-500"
      : backendStatus === "offline"
        ? "text-red-500"
        : "text-yellow-500"

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors w-full"
      >
        <Circle className={cn("h-2 w-2 fill-current", statusColor)} />
        <span className="flex-1 truncate text-left">
          {activeContext ?? "No context selected"}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 py-1">
          {contexts.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No contexts available</p>
          )}
          {contexts.map((ctx) => (
            <button
              key={ctx.name}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors",
                ctx.name === activeContext && "bg-accent/50 font-medium",
              )}
              onClick={() => {
                setOpen(false)
                onSelect?.(ctx.name)
              }}
            >
              <div className="font-medium">{ctx.name}</div>
              <div className="text-xs text-muted-foreground">{ctx.cluster}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
