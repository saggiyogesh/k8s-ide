import { useState } from "react";
import { ChevronDown, Loader2, CheckCircle2, XCircle, Server } from "lucide-react";
import { useContexts, useSessionStore } from "@k8s-ide/store";
import { useK8sClient } from "@k8s-ide/store";
import { cn } from "../utils.js";

export function ContextSwitcher() {
  const client = useK8sClient();
  const { data: contexts } = useContexts();
  const {
    activeContext,
    backendStatus,
    setActiveContext,
    setSessionInfo,
    setBackendStatus,
    setDiscovery,
  } = useSessionStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSwitch = async (ctx: string) => {
    setOpen(false);
    if (ctx === activeContext) return;
    setLoading(true);
    setBackendStatus("connecting");
    try {
      const info = await client.openSession(ctx);
      setSessionInfo(info);
      setActiveContext(ctx);
      setBackendStatus("connected");
      const discovery = await client.getDiscovery();
      setDiscovery(discovery);
    } catch (err) {
      console.error(err);
      setBackendStatus("error");
    } finally {
      setLoading(false);
    }
  };

  const statusIcon = {
    disconnected: <XCircle className="w-3.5 h-3.5 text-muted-foreground" />,
    connecting: <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-500" />,
    connected: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
    error: <XCircle className="w-3.5 h-3.5 text-destructive" />,
  }[backendStatus];

  return (
    <div className="relative">
      <button
        className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-sm"
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
      >
        <Server className="w-4 h-4 text-muted-foreground" />
        <span className="max-w-[180px] truncate">
          {activeContext ?? "Select context…"}
        </span>
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" />
        ) : (
          <>
            {statusIcon}
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[240px] rounded-lg border border-border bg-popover shadow-lg py-1">
            {!contexts?.length ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">No contexts found</div>
            ) : (
              contexts.map((ctx) => (
                <button
                  key={ctx.name}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2 text-sm hover:bg-accent/50 transition-colors text-left",
                    ctx.name === activeContext && "font-medium text-primary",
                  )}
                  onClick={() => handleSwitch(ctx.name)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{ctx.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{ctx.cluster}</p>
                  </div>
                  {ctx.name === activeContext && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
