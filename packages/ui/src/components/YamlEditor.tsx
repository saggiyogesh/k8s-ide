import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "./ui/button.js";
import { cn } from "../lib/utils.js";

export interface YamlEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  onApply?: (value: string) => void;
  isApplying?: boolean;
  className?: string;
}

/**
 * A minimal YAML editor with copy and apply support.
 * Monaco Editor integration is deferred to the app layer to avoid
 * bundling the full Monaco dependency in the shared UI package.
 */
export function YamlEditor({
  value,
  onChange,
  readOnly = false,
  onApply,
  isApplying,
  className,
}: YamlEditorProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs text-muted-foreground">YAML</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          {onApply && (
            <Button
              size="sm"
              className="h-7"
              onClick={() => onApply(value)}
              disabled={isApplying || readOnly}
            >
              {isApplying ? "Applying…" : "Apply"}
            </Button>
          )}
        </div>
      </div>
      <textarea
        className="flex-1 resize-none bg-background p-3 font-mono text-xs text-foreground focus:outline-none"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
      />
    </div>
  );
}
