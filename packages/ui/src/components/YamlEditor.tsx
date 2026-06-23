type Props = {
  value: string;
  onChange?: (value: string) => void;
  onApply?: () => void;
  readOnly?: boolean;
};

export function YamlEditor({ value, onChange, onApply, readOnly }: Props) {
  return (
    <div className="flex h-full flex-col gap-2">
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        spellCheck={false}
        className="min-h-[320px] flex-1 resize-none rounded-md border border-white/10 bg-zinc-900 p-3 font-mono text-xs leading-relaxed text-zinc-100 focus:border-sky-500 focus:outline-none"
      />
      {!readOnly && onApply && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onApply}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500"
          >
            Apply YAML
          </button>
        </div>
      )}
    </div>
  );
}
