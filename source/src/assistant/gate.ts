/**
 * [MOD] KAIROS gate — GrowthBook-based entitlement check for assistant mode.
 */

import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'

let _cached: boolean | null = null

/**
 * Check whether KAIROS/assistant mode is enabled via GrowthBook gate.
 * Result is cached after first check (gate only transitions false→true
 * within a session, never the reverse).
 */
export async function isKairosEnabled(): Promise<boolean> {
  if (_cached !== null) return _cached

  // [MOD] Default to true for modded builds — skip GrowthBook dependency
  // Original: checks tengu_kairos GrowthBook flag with network fetch
  const gbValue = getFeatureValue_CACHED_MAY_BE_STALE('tengu_kairos', true)
  _cached = gbValue === true || gbValue === 'true'

  // For modded builds, always enable if env var is set
  if (process.env.CLAUDE_CODE_KAIROS_ENABLED === '1') {
    _cached = true
  }

  return _cached
}
