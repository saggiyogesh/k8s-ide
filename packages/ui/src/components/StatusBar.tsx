import { Circle } from "lucide-react";
import { cn } from "../lib/utils.js";

export interface StatusBarProps {
  status: "unknown" | "connecting" | "connected" | "error";
  context?: string | null;
  namespace?: string | null;
  error?: string | null;
}

export function StatusBar({ status, context, namespace, error }: StatusBarProps) {
  return (
    <div className="flex h-6 items-center gap-3 border-t border-border bg-muted/50 px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <Circle
          className={cn(
            "h-2 w-2 fill-current",
            status === "connected" && "text-green-500",
            status === "connecting" && "animate-pulse text-yellow-500",
            status === "error" && "text-red-500",
            status === "unknown" && "text-muted-foreground",
          )}
        />
        <span>
          {status === "connected" && "Connected"}
          {status === "connecting" && "Connecting…"}
          {status === "error" && (error ?? "Error")}
          {status === "unknown" && "Not connected"}
        </span>
      </div>
      {context && <span className="text-muted-foreground/60">·</span>}
      {context && <span>{context}</span>}
      {namespace && <span className="text-muted-foreground/60">·</span>}
      {namespace && <span>{namespace}</span>}
    </div>
  );
}
