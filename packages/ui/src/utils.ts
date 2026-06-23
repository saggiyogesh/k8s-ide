import { clsx, type ClassValue } from "clsx"

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}

export function formatAge(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function truncate(s: string, maxLen = 40): string {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s
}
