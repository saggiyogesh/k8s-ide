import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";
type RefreshPolicy = "off" | "30s" | "60s" | "5m";

interface PreferencesState {
  theme: Theme;
  refreshPolicy: RefreshPolicy;
  lastNamespace: string | null;
  fontSize: number;

  setTheme(theme: Theme): void;
  setRefreshPolicy(policy: RefreshPolicy): void;
  setLastNamespace(ns: string | null): void;
  setFontSize(size: number): void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "system",
      refreshPolicy: "30s",
      lastNamespace: null,
      fontSize: 13,

      setTheme: (theme) => set({ theme }),
      setRefreshPolicy: (refreshPolicy) => set({ refreshPolicy }),
      setLastNamespace: (lastNamespace) => set({ lastNamespace }),
      setFontSize: (fontSize) => set({ fontSize }),
    }),
    { name: "k8s-ide-preferences" },
  ),
);
