/**
 * Dance venue module entry — activated ONLY when the published
 * building-config.json carries social.dance.enabled (the builder's dance
 * tick-box). Without that block none of these systems register: plain
 * buildings pay zero runtime cost.
 */
import type { DanceVenueConfig } from '@shared/dance-venue-contract'
import {
  resolveDanceSet,
  runtimeZoneById,
  zoneRadius,
  zoneCenterScene
} from './zones'
import { initDanceRuntime } from './runtime'
import { initDanceEffects } from './effects'
import { initDanceTroupe } from './troupe'
import { initDanceMusic } from './music'
import { initDanceFloorMarker } from './floor-marker'
import { initClubFx, setClubFxReaction } from '../effects/club-fx'
import { playSpectacleClimax } from '../effects/admin-fx'
import { initCrowdReactions, onCrowdReaction } from './reactions'
import { initBreakdanceReactionAudio } from './reaction-audio'
import { BREAKDANCE_SHOW_APP } from '@shared/venue-app-contract'
import { markPluginActive } from '../plugins/active'
import { initNpcActivity } from './npc-activity'

/** Each init step is ISOLATED: one throwing step (e.g. club-FX) must not abort
 *  the ones after it — that's what was leaving the floor empty (troupe never
 *  registered because an earlier step threw). Failures are recorded and surfaced
 *  in the on-screen DIAG line via danceInitReport(). */
const danceInitErrors: string[] = []
export function danceInitReport(): string {
  return danceInitErrors.join(' | ')
}
function safeInit(step: string, fn: () => void): void {
  try {
    fn()
  } catch (e) {
    const msg = `${step}:${String((e as Error)?.message ?? e).slice(0, 60)}`
    danceInitErrors.push(msg)
    console.log('[dance] init step failed —', msg)
  }
}

export function initDanceVenue(
  config: DanceVenueConfig,
  arrivalMedia: 'none' | 'music' | 'video' = 'none'
): void {
  if (!config.enabled) return
  const ok = resolveDanceSet(config)
  if (!ok) {
    console.log('[dance] disabled — no placement and no bound floor zones')
    return
  }
  // Runtime first (sets the shared config the troupe reads), then the troupe,
  // then the rest — each isolated so a later failure can't strand the crowd.
  safeInit('activity', () => initNpcActivity())
  safeInit('runtime', () => initDanceRuntime(config))
  safeInit('reactions', () => initCrowdReactions())
  safeInit('troupe', () => initDanceTroupe())
  safeInit('effects', () => initDanceEffects())
  safeInit('reaction-audio', () => initBreakdanceReactionAudio(config.reactions))
  // The cypher is a place. Venue-wide spread is how breakdance ripped the plaza.
  config.musicSpread = 'floor'
  safeInit('music', () => initDanceMusic(config, config.music.tracks.length > 0))
  safeInit('marker', () => initDanceFloorMarker())

  // Club lighting + smoke over the floor — owner-configurable (config.clubFx).
  // World FX (shake / fire / weather) is Host Frenzy or FX Lab only — scored
  // moves must not bombard the room. Crowd hands/audio/speech stay on the app.
  const fxZone = runtimeZoneById(config.clubFxZoneId)
  if (fxZone && config.clubFx?.enabled !== false) {
    safeInit('clubfx', () =>
      initClubFx(zoneCenterScene(fxZone), zoneRadius(fxZone), config.clubFx)
    )
  }
  safeInit('reaction-fx', () => {
    onCrowdReaction((cue) => {
      if (!config.reactions.spectacleEnabled || cue.target.kind === 'npcs') return
      if (fxZone && config.clubFx?.enabled !== false) setClubFxReaction(cue)
      if (cue.id.startsWith('host:') && cue.mood === 'positive') playSpectacleClimax(cue.intensity)
    })
  })

  // The Break Dancing plugin is live from HERE and nowhere else. initVenueNpcs
  // below runs the same troupe runtime for a plain NPC crowd and must NOT mark
  // it — that is the difference between a World with a cypher and a World that
  // merely has people in it, and the whole Dance Admin panel hangs off it.
  markPluginActive(BREAKDANCE_SHOW_APP.id)
  console.log('[dance] venue active — floor + support circle resolved')
}

/** Generic Venue NPC layer. It reuses the proven troupe/navigation runtime but
 * starts in social mode and deliberately omits Show music, marker, and club FX. */
export function initVenueNpcs(config: DanceVenueConfig): void {
  if (!config.npc.enabled || config.npc.count <= 0) return
  if (!resolveDanceSet(config) && config.npc.groups.length === 0) {
    console.log('[venue-npcs] disabled — no roam placement resolved')
    return
  }
  // `enabled: true` is for the troupe runtime only. Breakdance is NOT marked
  // active here, so standing on a plaza (Cloud Scrap) cannot auto-join a cypher.
  const socialConfig = { ...config, enabled: true, autoStart: false }
  safeInit('npc-activity', () => initNpcActivity())
  safeInit('npc-runtime', () => initDanceRuntime(socialConfig))
  safeInit('npc-reactions', () => initCrowdReactions())
  safeInit('npc-troupe', () => initDanceTroupe())
  // NPC-only venues still expose Host → Reactions. Previously this path
  // registered the cue + troupe consumers but skipped the audio and spectacle
  // consumers, producing a working-looking panel whose buttons were silent.
  safeInit('npc-reaction-audio', () => initBreakdanceReactionAudio(config.reactions))
  safeInit('npc-reaction-fx', () => {
    onCrowdReaction((cue) => {
      if (!config.reactions.spectacleEnabled || cue.target.kind === 'npcs') return
      if (cue.id.startsWith('host:') && cue.mood === 'positive') playSpectacleClimax(cue.intensity)
    })
  })
  console.log('[venue-npcs] social crew active')
}
