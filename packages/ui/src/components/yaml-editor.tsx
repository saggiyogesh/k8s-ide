import Editor from '@monaco-editor/react'
import { useState } from 'react'
import { Button } from './button.js'

export interface YamlEditorProps {
  value: string
  readOnly?: boolean
  onApply?: (yaml: string) => Promise<void>
  height?: string
}

export function YamlEditor({ value, readOnly = false, onApply, height = '100%' }: YamlEditorProps) {
  const [draft, setDraft] = useState(value)
  const [applying, setApplying] = useState(false)
  const dirty = draft !== value

  return (
    <div className="flex h-full flex-col">
      {!readOnly && onApply && (
        <div className="flex items-center justify-end gap-2 border-b border-[var(--color-border)] p-2">
          <Button
            size="sm"
            disabled={!dirty || applying}
            onClick={async () => {
              setApplying(true)
              try {
                await onApply(draft)
              } finally {
                setApplying(false)
              }
            }}
          >
            {applying ? 'Applying…' : 'Apply'}
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Editor
          height={height}
          defaultLanguage="yaml"
          value={draft}
          onChange={(v) => setDraft(v ?? '')}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
          theme="vs-dark"
        />
      </div>
    </div>
  )
}
