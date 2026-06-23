import React, { useCallback } from "react";
import { EditorView, basicSetup } from "codemirror";
import type { ViewUpdate } from "@codemirror/view";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";
import { Button } from "./Button.js";
import { cn } from "../utils.js";

interface YamlEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onApply?: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  isApplying?: boolean;
}

export function YamlEditor({
  value,
  onChange,
  onApply,
  readOnly = false,
  className,
  isApplying,
}: YamlEditorProps) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef<EditorView | null>(null);

  React.useEffect(() => {
    if (!editorRef.current) return;

    const view = new EditorView({
      doc: value,
      extensions: [
        basicSetup,
        yaml(),
        oneDark,
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged && onChange) {
            onChange(update.state.doc.toString());
          }
        }),
        EditorView.editable.of(!readOnly),
      ],
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => view.destroy();
    // Only create once on mount.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external value changes.
  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  const handleApply = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    onApply?.(view.state.doc.toString());
  }, [onApply]);

  return (
    <div className={cn("flex flex-col h-full bg-zinc-900", className)}>
      <div className="flex-1 overflow-auto" ref={editorRef} />
      {!readOnly && onApply && (
        <div className="flex justify-end gap-2 border-t border-zinc-700 p-2">
          <Button variant="primary" size="sm" onClick={handleApply} loading={isApplying}>
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
