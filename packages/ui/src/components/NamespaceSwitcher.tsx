import { useState } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { useNamespaces, useSessionStore } from "@k8s-ide/store";
import { cn } from "../utils.js";

export function NamespaceSwitcher() {
  const { data } = useNamespaces();
  const { selectedNamespace, setSelectedNamespace } = useSessionStore();
  const [open, setOpen] = useState(false);

  const namespaces = data?.items.map((ns) => ns.metadata.name) ?? [];

  return (
    <div className="relative">
      <button
        className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-sm"
        onClick={() => setOpen((o) => !o)}
      >
        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="max-w-[140px] truncate">{selectedNamespace ?? "All namespaces"}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[200px] max-h-80 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1">
            <button
              className={cn(
                "flex items-center w-full px-3 py-2 text-sm hover:bg-accent/50",
                !selectedNamespace && "font-medium text-primary",
              )}
              onClick={() => {
                setSelectedNamespace(null);
                setOpen(false);
              }}
            >
              All namespaces
            </button>
            <div className="border-t border-border my-1" />
            {namespaces.map((ns) => (
              <button
                key={ns}
                className={cn(
                  "flex items-center w-full px-3 py-2 text-sm hover:bg-accent/50",
                  ns === selectedNamespace && "font-medium text-primary",
                )}
                onClick={() => {
                  setSelectedNamespace(ns);
                  setOpen(false);
                }}
              >
                {ns}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
