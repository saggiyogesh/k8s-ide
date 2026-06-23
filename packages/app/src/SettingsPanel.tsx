import { useSessionStore, usePreferencesStore } from "@k8s-ide/store";
import type { Theme, RefreshPolicy } from "@k8s-ide/store";
import { X } from "lucide-react";
import { cn } from "@k8s-ide/ui";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { backendUrl, setBackendUrl } = useSessionStore();
  const { theme, setTheme, refreshPolicy, setRefreshPolicy } = usePreferencesStore();

  const themes: { value: Theme; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];

  const policies: { value: RefreshPolicy; label: string }[] = [
    { value: "manual", label: "Manual" },
    { value: "10s", label: "Every 10s" },
    { value: "30s", label: "Every 30s" },
    { value: "60s", label: "Every 60s" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-accent/50 text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Backend URL */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Backend URL</label>
            <input
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="http://localhost:8080"
            />
          </div>

          {/* Theme */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Theme</label>
            <div className="flex gap-2">
              {themes.map((t) => (
                <button
                  key={t.value}
                  className={cn(
                    "flex-1 py-2 rounded-md border text-sm transition-colors",
                    theme === t.value
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:bg-accent/50",
                  )}
                  onClick={() => setTheme(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Refresh policy */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Auto-refresh</label>
            <div className="flex gap-2 flex-wrap">
              {policies.map((p) => (
                <button
                  key={p.value}
                  className={cn(
                    "px-3 py-1.5 rounded-md border text-sm transition-colors",
                    refreshPolicy === p.value
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:bg-accent/50",
                  )}
                  onClick={() => setRefreshPolicy(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
