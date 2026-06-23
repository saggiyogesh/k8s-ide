import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

type PreferencesState = {
  theme: Theme;
  refreshIntervalMs: number;
  kubeconfigPath: string | null;
  setTheme: (theme: Theme) => void;
  setRefreshIntervalMs: (ms: number) => void;
  setKubeconfigPath: (path: string | null) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "system",
      refreshIntervalMs: 30_000,
      kubeconfigPath: null,
      setTheme: (theme) => set({ theme }),
      setRefreshIntervalMs: (refreshIntervalMs) => set({ refreshIntervalMs }),
      setKubeconfigPath: (kubeconfigPath) => set({ kubeconfigPath }),
    }),
    { name: "k8s-ide-preferences" },
  ),
);
