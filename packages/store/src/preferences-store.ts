import { create } from "zustand"
import { persist } from "zustand/middleware"

type Theme = "light" | "dark" | "system"
type RefreshPolicy = "manual" | "30s" | "60s" | "5m"

interface PreferencesState {
  theme: Theme
  refreshPolicy: RefreshPolicy
  lastNamespace: string
  fontSize: number

  setTheme: (theme: Theme) => void
  setRefreshPolicy: (policy: RefreshPolicy) => void
  setLastNamespace: (ns: string) => void
  setFontSize: (size: number) => void
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "system",
      refreshPolicy: "30s",
      lastNamespace: "default",
      fontSize: 13,

      setTheme: (theme) => set({ theme }),
      setRefreshPolicy: (policy) => set({ refreshPolicy: policy }),
      setLastNamespace: (ns) => set({ lastNamespace: ns }),
      setFontSize: (size) => set({ fontSize: size }),
    }),
    { name: "k8s-ide-preferences" },
  ),
)
