import type { ResourceCapabilities } from "@k8s-ide/core";
import { Trash2, RefreshCw, Scale, Terminal, FileText } from "lucide-react";
import { Button } from "./ui/button.js";

export interface ActionBarProps {
  capabilities?: ResourceCapabilities;
  onDelete?: () => void;
  onRestart?: () => void;
  onLogs?: () => void;
  onExec?: () => void;
  onPortForward?: () => void;
  onScale?: () => void;
  disabled?: boolean;
}

export function ActionBar({
  capabilities,
  onDelete,
  onRestart,
  onLogs,
  onExec,
  onScale,
  disabled,
}: ActionBarProps) {
  return (
    <div className="flex items-center gap-1.5">
      {capabilities?.supportsLogs && onLogs && (
        <Button size="sm" variant="outline" onClick={onLogs} disabled={disabled}>
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          Logs
        </Button>
      )}
      {capabilities?.supportsExec && onExec && (
        <Button size="sm" variant="outline" onClick={onExec} disabled={disabled}>
          <Terminal className="mr-1.5 h-3.5 w-3.5" />
          Exec
        </Button>
      )}
      {capabilities?.supportsScale && onScale && (
        <Button size="sm" variant="outline" onClick={onScale} disabled={disabled}>
          <Scale className="mr-1.5 h-3.5 w-3.5" />
          Scale
        </Button>
      )}
      {capabilities?.supportsRollout && onRestart && (
        <Button size="sm" variant="outline" onClick={onRestart} disabled={disabled}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Restart
        </Button>
      )}
      {capabilities?.canDelete && onDelete && (
        <Button size="sm" variant="destructive" onClick={onDelete} disabled={disabled}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      )}
    </div>
  );
}
