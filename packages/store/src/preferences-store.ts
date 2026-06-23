import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";
type RefreshPolicy = "manual" | "30s" | "60s" | "5m";

interface PreferencesState {
  theme: Theme;
  refreshPolicy: RefreshPolicy;
  lastNamespace: Record<string, string>;
  backendUrl: string;

  setTheme: (theme: Theme) => void;
  setRefreshPolicy: (policy: RefreshPolicy) => void;
  setLastNamespace: (context: string, namespace: string) => void;
  setBackendUrl: (url: string) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "system",
      refreshPolicy: "30s",
      lastNamespace: {},
      backendUrl: "http://127.0.0.1:7777",

      setTheme: (theme) => set({ theme }),
      setRefreshPolicy: (policy) => set({ refreshPolicy: policy }),
      setLastNamespace: (context, namespace) =>
        set((state) => ({
          lastNamespace: { ...state.lastNamespace, [context]: namespace },
        })),
      setBackendUrl: (url) => set({ backendUrl: url }),
    }),
    { name: "k8s-ide-preferences" },
  ),
);
