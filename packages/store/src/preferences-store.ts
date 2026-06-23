import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'

export interface PreferencesState {
  theme: Theme
  refreshIntervalMs: number
  lastNamespace: string
  compactMode: boolean

  setTheme: (theme: Theme) => void
  setRefreshIntervalMs: (ms: number) => void
  setLastNamespace: (ns: string) => void
  setCompactMode: (compact: boolean) => void
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      refreshIntervalMs: 30_000,
      lastNamespace: 'default',
      compactMode: false,

      setTheme: (theme) => set({ theme }),
      setRefreshIntervalMs: (ms) => set({ refreshIntervalMs: ms }),
      setLastNamespace: (ns) => set({ lastNamespace: ns }),
      setCompactMode: (compact) => set({ compactMode: compact }),
    }),
    { name: 'k8s-ide-preferences' },
  ),
)
