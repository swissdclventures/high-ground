/**
 * Dance Studio — the wearable's sequence-builder panel, running in-scene so
 * EVERY visitor gets the full moves palette + sequencer (18 bundled breakdance
 * emotes + DCL base emotes + their own wallet emotes). Ported 1:1 from
 * C:\...\DCL Dance Smart Wearable\wearable\src (see docs/dance-venue-v2-plan.md §B).
 *
 * Sequences played here fire normal emotes → they land in AvatarEmoteCommand →
 * the dance loop (scene/src/dance/) scores them with zero extra wiring.
 */
import { engine } from '@dcl/sdk/ecs'
import { playerEmoteLoadSystem, sequencerSystem, transitionVfxSystem } from './emotes'
import { getSocialConfig } from '../social/config'
import { passesGateRule } from '../social/player'
import type { GateRule } from '@shared/social-surface-contract'

let enabled = false

export function isDanceStudioEnabled(): boolean {
  const config = getSocialConfig()
  const app = config?.apps.emoteLibrary
  if (!enabled || !config || !app?.enabled) return false
  const entitlement: GateRule = {
    id: 'emote-library-entitlement',
    ...app.entitlement,
    deniedMessage: 'This emote library is not included with your access.',
  }
  return passesGateRule(entitlement, config)
}

export function initDanceStudio(): void {
  if (enabled) return
  enabled = true
  engine.addSystem(sequencerSystem)
  engine.addSystem(transitionVfxSystem)
  if (getSocialConfig()?.apps.emoteLibrary.includeOwned) {
    engine.addSystem(playerEmoteLoadSystem)
  }
}
