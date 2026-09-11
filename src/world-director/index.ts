/** Polls persistent live NPC configuration and reconciles only changed revisions. */
import { engine } from '@dcl/sdk/ecs'
import type { DanceVenueConfig } from '@shared/dance-venue-contract'
import type { WorldDirectorBinding } from '@shared/world-director-contract'
import { normalizeWorldDirectorDocument } from '@shared/world-director-contract'
import { applyWorldDirectorSettings } from '../dance/troupe'

export function initWorldDirector(binding: WorldDirectorBinding | undefined, dance: DanceVenueConfig): void {
  if (!binding?.directorId || !binding.url) return
  let fetching = false
  let revision = 0

  const refresh = async (): Promise<void> => {
    if (fetching) return
    fetching = true
    try {
      const response = await fetch(binding.url)
      if (!response.ok) {
        if (response.status !== 404) console.log(`[world-director] fetch -> ${response.status}`)
        return
      }
      const document = normalizeWorldDirectorDocument(
        await response.json(),
        dance,
        binding.directorId
      )
      if (!document || document.revision <= revision) return
      applyWorldDirectorSettings(document.settings)
      revision = document.revision
      console.log(`[world-director] applied NPC revision ${revision}`)
    } catch (error) {
      // Published settings remain the complete offline fallback.
      console.log('[world-director] refresh failed; keeping published NPC settings', error)
    } finally {
      fetching = false
    }
  }

  void refresh()
  let elapsed = 0
  engine.addSystem((dt: number) => {
    elapsed += dt
    if (elapsed < binding.pollSeconds) return
    elapsed = 0
    void refresh()
  })
}
