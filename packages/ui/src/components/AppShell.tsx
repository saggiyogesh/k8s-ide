import type { ReactNode } from "react";
import { StatusBadge } from "./StatusBadge.js";
import type { BackendStatus } from "@k8s-ide/core";

type Props = {
  title?: string;
  backendStatus: BackendStatus;
  headerRight?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
  detail?: ReactNode;
};

export function AppShell({ title = "K8s IDE", backendStatus, headerRight, sidebar, children, detail }: Props) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/10 bg-zinc-950 px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold tracking-tight">{title}</h1>
          <StatusBadge status={backendStatus} />
        </div>
        <div className="flex items-center gap-4">{headerRight}</div>
      </header>
      <div className="flex min-h-0 flex-1">
        {sidebar}
        <main className="min-w-0 flex-1">{children}</main>
        {detail && <section className="w-[420px] shrink-0">{detail}</section>}
      </div>
    </div>
  );
}
