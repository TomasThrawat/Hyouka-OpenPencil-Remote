import { useLocalStorage } from '@vueuse/core'

/**
 * Number of most recent events kept locally. Bounded rather than a closed set
 * so retention can be tuned beyond the offered presets.
 */
export type DiagnosticsRetention = number

/** Offered directly in Settings; any value in range is accepted. */
export const diagnosticsRetentionPresets = [100, 500, 1000] as const

export const DIAGNOSTICS_RETENTION_DEFAULT: DiagnosticsRetention = 500
export const DIAGNOSTICS_RETENTION_MIN = 50
export const DIAGNOSTICS_RETENTION_MAX = 20_000

/** Clamp stored or entered values, falling back to the default when unusable. */
export function resolveDiagnosticsRetention(value: unknown): DiagnosticsRetention {
  const parsed =
    typeof value === 'string' ? (value.trim() === '' ? Number.NaN : Number(value)) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    return DIAGNOSTICS_RETENTION_DEFAULT
  }
  const whole = Math.round(parsed)
  return Math.min(Math.max(whole, DIAGNOSTICS_RETENTION_MIN), DIAGNOSTICS_RETENTION_MAX)
}

export const diagnosticsEnabled = useLocalStorage('open-pencil:diagnostics-enabled', true)
export const usageEnabled = useLocalStorage('open-pencil:usage-enabled', true)
export const diagnosticsRetention = useLocalStorage<DiagnosticsRetention>(
  'open-pencil:diagnostics-retention',
  500,
  { serializer: { read: (value) => resolveDiagnosticsRetention(value), write: String } }
)

export function isDiagnosticsEnabled(): boolean {
  return diagnosticsEnabled.value
}

export function getDiagnosticsRetention(): DiagnosticsRetention {
  return diagnosticsRetention.value
}
