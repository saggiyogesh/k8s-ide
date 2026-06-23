import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

type PreferencesState = {
  theme: Theme;
  refreshIntervalMs: number;
  tablePageSize: number;
  setTheme: (theme: Theme) => void;
  setRefreshIntervalMs: (ms: number) => void;
  setTablePageSize: (size: number) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "system",
      refreshIntervalMs: 30_000,
      tablePageSize: 50,
      setTheme: (theme) => set({ theme }),
      setRefreshIntervalMs: (refreshIntervalMs) => set({ refreshIntervalMs }),
      setTablePageSize: (tablePageSize) => set({ tablePageSize }),
    }),
    { name: "k8s-ide-preferences" },
  ),
);
