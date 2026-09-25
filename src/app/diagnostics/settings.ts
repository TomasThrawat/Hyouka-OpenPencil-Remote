import { computed, ref } from 'vue'

import { diagnostics } from './recorder'
import {
  diagnosticsEnabled,
  diagnosticsRetention,
  diagnosticsRetentionPresets,
  usageEnabled,
  type DiagnosticsRetention
} from './state'

export {
  diagnosticsRetentionPresets,
  DIAGNOSTICS_RETENTION_DEFAULT,
  DIAGNOSTICS_RETENTION_MAX,
  DIAGNOSTICS_RETENTION_MIN,
  resolveDiagnosticsRetention
} from './state'

const diagnosticsCount = ref(0)
const diagnosticsSize = ref(0)

export function useDiagnosticsSettings() {
  return {
    diagnosticsEnabled,
    usageEnabled,
    diagnosticsRetention,
    diagnosticsCount: computed(() => diagnosticsCount.value),
    diagnosticsSize: computed(() => diagnosticsSize.value),
    refreshDiagnosticsStats: async () => {
      const events = await diagnostics.list()
      diagnosticsCount.value = events.length
      diagnosticsSize.value = JSON.stringify(events).length
    }
  }
}

export function isDiagnosticsEnabled(): boolean {
  return diagnosticsEnabled.value
}

export function isUsageEnabled(): boolean {
  return usageEnabled.value
}

export function getDiagnosticsRetention(): DiagnosticsRetention {
  return diagnosticsRetention.value
}

export async function pruneDiagnostics(retention: DiagnosticsRetention): Promise<void> {
  await diagnostics.prune(retention)
}

export const diagnosticsRetentionOptions = computed(() => diagnosticsRetentionPresets)
