import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";
export type RefreshPolicy = "manual" | "10s" | "30s" | "60s";

interface PreferencesState {
  theme: Theme;
  refreshPolicy: RefreshPolicy;
  defaultNamespace: string;
  yamlWrapLines: boolean;
  tablePageSize: number;
  lastKubeconfigPath: string | null;

  setTheme(theme: Theme): void;
  setRefreshPolicy(policy: RefreshPolicy): void;
  setDefaultNamespace(ns: string): void;
  setYamlWrapLines(wrap: boolean): void;
  setTablePageSize(size: number): void;
  setLastKubeconfigPath(path: string | null): void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "system",
      refreshPolicy: "30s",
      defaultNamespace: "default",
      yamlWrapLines: false,
      tablePageSize: 50,
      lastKubeconfigPath: null,

      setTheme: (theme) => set({ theme }),
      setRefreshPolicy: (policy) => set({ refreshPolicy: policy }),
      setDefaultNamespace: (ns) => set({ defaultNamespace: ns }),
      setYamlWrapLines: (wrap) => set({ yamlWrapLines: wrap }),
      setTablePageSize: (size) => set({ tablePageSize: size }),
      setLastKubeconfigPath: (path) => set({ lastKubeconfigPath: path }),
    }),
    { name: "k8s-ide-preferences" },
  ),
);
