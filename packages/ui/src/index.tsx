import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface TableColumn<T> {
  id: string;
  header: string;
  className?: string;
  cell: (item: T) => React.ReactNode;
}

interface ShellLayoutProps {
  header: React.ReactNode;
  sidebar: React.ReactNode;
  content: React.ReactNode;
  detail?: React.ReactNode;
}

export function ShellLayout({ header, sidebar, content, detail }: ShellLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-3 px-4 py-4 lg:px-6">
          {header}
        </div>
      </header>
      <main className="mx-auto grid max-w-[1800px] gap-4 p-4 lg:grid-cols-[280px,minmax(0,1fr)] lg:px-6 xl:grid-cols-[280px,minmax(0,1fr),360px]">
        <div className="space-y-4">{sidebar}</div>
        <div className="space-y-4">{content}</div>
        {detail ? <div className="space-y-4 xl:block">{detail}</div> : null}
      </main>
    </div>
  );
}

interface SectionCardProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function SectionCard({ title, description, action, children }: SectionCardProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-slate-950/40">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-200">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/50 px-4 py-6 text-sm text-slate-400">
      <p className="font-medium text-slate-200">{title}</p>
      <p className="mt-2 leading-6">{body}</p>
    </div>
  );
}

export function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    neutral: 'border-slate-700 bg-slate-800 text-slate-300',
    success: 'border-emerald-700/50 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-700/50 bg-amber-500/10 text-amber-300',
    danger: 'border-rose-700/50 bg-rose-500/10 text-rose-300',
  }[tone];

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {label}
    </span>
  );
}

export function KeyValueList({ values }: { values: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="space-y-3 text-sm">
      {values.map((item) => (
        <div key={item.label} className="grid gap-1 border-b border-slate-800/70 pb-3 last:border-b-0 last:pb-0">
          <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</dt>
          <dd className="break-all text-slate-200">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface ResourceTableProps<T extends { id: string }> {
  items: T[];
  columns: TableColumn<T>[];
  selectedId?: string | null;
  onSelect?: (item: T) => void;
  emptyState?: React.ReactNode;
}

export function ResourceTable<T extends { id: string }>({
  items,
  columns,
  selectedId,
  onSelect,
  emptyState,
}: ResourceTableProps<T>) {
  const parentRef = React.useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 8,
  });

  if (items.length === 0) {
    return emptyState ?? <EmptyState title="No rows" body="There is no data to render yet." />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <div className="grid grid-cols-12 gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {columns.map((column) => (
          <div key={column.id} className={column.className ?? 'col-span-4'}>
            {column.header}
          </div>
        ))}
      </div>
      <div ref={parentRef} className="relative h-[420px] overflow-auto bg-slate-950/30">
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            const active = selectedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`absolute left-0 grid w-full grid-cols-12 gap-3 border-b border-slate-800 px-4 text-left text-sm transition hover:bg-slate-900/70 ${
                  active ? 'bg-sky-500/10 text-sky-100' : 'text-slate-200'
                }`}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => onSelect?.(item)}
              >
                {columns.map((column) => (
                  <div
                    key={column.id}
                    className={`flex min-h-[52px] items-center ${column.className ?? 'col-span-4'}`}
                  >
                    {column.cell(item)}
                  </div>
                ))}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
