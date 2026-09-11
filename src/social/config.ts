import type { SocialSurfaceConfig } from '@shared/social-surface-contract'
import { normalizeDeployedSocialConfig } from '@shared/deployed-social-config'

let activeConfig: SocialSurfaceConfig | null = null

export function loadSocialConfig(
  partial: SocialSurfaceConfig | null | undefined,
  buildingName?: string
): SocialSurfaceConfig | null {
  if (!partial) {
    activeConfig = null
    return null
  }
  activeConfig = normalizeDeployedSocialConfig(partial, buildingName)
  return activeConfig.enabled || Object.values(activeConfig.apps).some((app) => app.enabled)
    ? activeConfig
    : null
}

export function getSocialConfig(): SocialSurfaceConfig | null {
  if (!activeConfig) return null
  return activeConfig.enabled || Object.values(activeConfig.apps).some((app) => app.enabled)
    ? activeConfig
    : null
}

/** Spatial policies (notably floor overrides) remain available when Venue is off. */
export function getConfiguredSocialConfig(): SocialSurfaceConfig | null {
  return activeConfig
}

export function isSocialEnabled(): boolean {
  return activeConfig?.enabled === true
}
