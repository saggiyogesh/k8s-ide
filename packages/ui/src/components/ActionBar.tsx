import type { ResourceCapabilities } from "@k8s-ide/core";

type Props = {
  capabilities?: ResourceCapabilities;
  onDelete?: () => void;
  onRestart?: () => void;
  onScale?: (replicas: number) => void;
};

export function ActionBar({ capabilities, onDelete, onRestart, onScale }: Props) {
  if (!capabilities) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {capabilities.canScale && onScale && (
        <button
          type="button"
          onClick={() => {
            const val = prompt("Replicas", "1");
            if (val) onScale(Number(val));
          }}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
        >
          Scale
        </button>
      )}
      {capabilities.canRestart && onRestart && (
        <button
          type="button"
          onClick={onRestart}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
        >
          Restart
        </button>
      )}
      {capabilities.canDelete && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
        >
          Delete
        </button>
      )}
    </div>
  );
}
