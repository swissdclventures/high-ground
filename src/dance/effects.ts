/**
 * Dance loop side effects — each client acts on ITS OWN avatar in response to
 * state snapshots (established DCL constraint: a scene can only emote/teleport
 * the local player). Covers: dancer teleport-in, floor exclusivity (ejection),
 * floor prep step, outer-circle wait bounce loop, and crowd reactions.
 */
import { engine } from '@dcl/sdk/ecs'
import { triggerEmote, triggerSceneEmote } from '~system/RestrictedActions'
import type { DancePhase } from '@shared/dance-venue-contract'
import {
  getDanceConfig,
  getDanceSnapshot,
  isCompetitiveShowActive,
  isLocalDancer,
  isParticipating,
  lastOwnEmoteWallClock,
  localUserId
} from './runtime'
import { parkQueuedGuestIfBehindScreen, pushOffFloor, samplePresence, teleportToFloor } from './zones'
import { silenceClappingAudioEmote } from '@shared/world-audio-policy'
import { scrapCrowdQuiet } from '../plugins/scrap'

const EFFECTS_INTERVAL_S = 0.3
/** Don't spam movePlayerTo — one push per interval is plenty. */
const PUSH_COOLDOWN_S = 1.2

let effectsTimer = 0
let pushCooldown = 0
let crowdTimer = 0
let waitTimer = 0
let lastAutoEmoteAt = 0
let lastPhase: DancePhase | null = null
let lastDancer: string | null = null
let crowdSeed = 0
let playerClapCut = false

function pickEmote(list: string[]): string | null {
  if (!list.length) return null
  return list[Math.floor(Math.random() * list.length)] ?? list[0]
}

function fireCrowdEmote(emote: string | null, now: number): void {
  if (!emote) return
  lastAutoEmoteAt = now
  void triggerEmote({ predefinedEmote: silenceClappingAudioEmote(emote) })
}

function fireSceneEmote(src: string, now: number, loop = false): void {
  if (!src) return
  lastAutoEmoteAt = now
  void triggerSceneEmote({ src, loop })
}

/**
 * Dancer-only floor. Allowed on the floor iff you are the active dancer in a
 * live phase — everyone else (including a just-failed dancer) is pushed out.
 */
function enforceFloorExclusivity(_now: number, dt: number): void {
  pushCooldown -= dt
  if (pushCooldown > 0) return
  const snap = getDanceSnapshot()
  const presence = samplePresence()
  if (!presence) return
  const me = localUserId()
  const allowed =
    !!snap &&
    !!me &&
    snap.dancer === me &&
    (snap.phase === 'selected' || snap.phase === 'countdown' || snap.phase === 'active')
  if (presence.inFloor && !allowed) {
    pushCooldown = PUSH_COOLDOWN_S
    pushOffFloor(presence.localX, presence.localZ)
    return
  }
  if (
    isParticipating() &&
    !isLocalDancer() &&
    presence.inSupport &&
    parkQueuedGuestIfBehindScreen(presence.localX, presence.localZ)
  ) {
    pushCooldown = PUSH_COOLDOWN_S
  }
}

function onPhaseChange(_prev: DancePhase | null, next: DancePhase, now: number): void {
  const config = getDanceConfig()
  if (!config) return
  const snap = getDanceSnapshot()
  const me = localUserId()
  const dancing = isLocalDancer()
  const presence = samplePresence()
  const inCrowd = !!presence?.inSupport && !dancing

  switch (next) {
    case 'selected': {
      if (dancing) teleportToFloor()
      if (inCrowd && isParticipating()) {
        // Start the wait bounce immediately when someone is called up.
        fireSceneEmote(config.waitEmoteSrc, now, true)
        waitTimer = (config.waitEmoteDurationMs / 1000) * 0.85
      } else if (inCrowd) {
        fireCrowdEmote(pickEmote(['clap', 'fistpump']), now)
      }
      break
    }
    case 'countdown': {
      if (dancing) {
        // Light floor step during 3-2-1 — NEVER the outer wait bounce.
        if (config.floorPrepEmoteSrc) {
          fireSceneEmote(config.floorPrepEmoteSrc, now, false)
        } else {
          const prep = pickEmote(config.prepEmotes)
          if (prep) void triggerEmote({ predefinedEmote: silenceClappingAudioEmote(prep) })
        }
      }
      if (inCrowd && isParticipating()) {
        fireSceneEmote(config.waitEmoteSrc, now, true)
        waitTimer = (config.waitEmoteDurationMs / 1000) * 0.85
      } else if (inCrowd) {
        fireCrowdEmote(pickEmote(config.crowd.emotes), now)
      }
      break
    }
    case 'active': {
      if (inCrowd && isParticipating()) {
        fireSceneEmote(config.waitEmoteSrc, now, true)
        waitTimer = (config.waitEmoteDurationMs / 1000) * 0.85
      } else if (inCrowd) {
        fireCrowdEmote(pickEmote(['handsair', 'clap']), now)
      }
      break
    }
    case 'failure': {
      const failedMe = snap?.lastResult?.userId === me
      if (inCrowd && !failedMe) fireCrowdEmote(pickEmote(['dontsee', 'shrug', 'clap']), now)
      break
    }
    default:
      break
  }
}

/**
 * Outer support circle: participants MUST keep the wait bounce going.
 * Completely standing still is not allowed while checked into the event.
 * Manual emotes briefly pause the auto-loop, then it resumes.
 */
function runWaitBounceLoop(now: number, dt: number): void {
  const config = getDanceConfig()
  const snap = getDanceSnapshot()
  if (!config || !snap || !isCompetitiveShowActive()) return
  if (!isParticipating()) return
  if (isLocalDancer()) return

  const presence = samplePresence()
  // Outer ring OR anywhere in the dance set while participating & not on floor.
  if (!presence?.inSupport && !presence?.inFloor) return
  if (presence.inFloor) return // floor exclusivity will push; don't bounce there
  if (snap.phase === 'failure' || snap.phase === 'transition') return

  waitTimer -= dt
  if (waitTimer > 0) return

  // Respect a recent manual emote — don't fight the player mid-expression.
  const manualRecent =
    lastOwnEmoteWallClock() > lastAutoEmoteAt + 400 &&
    now - lastOwnEmoteWallClock() < config.waitEmoteDurationMs
  if (manualRecent) {
    waitTimer = 0.6
    return
  }

  fireSceneEmote(config.waitEmoteSrc, now, true)
  waitTimer = Math.max(1.5, (config.waitEmoteDurationMs / 1000) * 0.85)
}

/**
 * Occasional crowd flavor for non-participants standing in the ring.
 * Participants use the wait bounce instead (see runWaitBounceLoop).
 */
function runCrowdAutomation(now: number, dt: number): void {
  const config = getDanceConfig()
  const snap = getDanceSnapshot()
  if (!config || !snap || !isCompetitiveShowActive()) return
  if (isParticipating()) return // wait bounce owns their motion
  crowdTimer -= dt
  if (crowdTimer > 0) return
  crowdSeed += 1
  crowdTimer = config.crowd.periodS * (0.8 + (0.4 * ((crowdSeed * 2654435761) % 100)) / 100)

  if (isLocalDancer()) return
  const presence = samplePresence()
  if (!presence?.inSupport) return
  if (snap.phase === 'failure' || snap.phase === 'transition') return
  const manualSince = lastOwnEmoteWallClock() > lastAutoEmoteAt + 1500
  if (manualSince && now - lastOwnEmoteWallClock() < config.crowd.periodS * 1000) return
  fireCrowdEmote(pickEmote(config.crowd.emotes), now)
}

function danceEffectsSystem(dt: number): void {
  const config = getDanceConfig()
  if (!config) return
  effectsTimer -= dt
  if (effectsTimer > 0) return
  effectsTimer = EFFECTS_INTERVAL_S

  const now = Date.now()
  if (scrapCrowdQuiet()) {
    if (!playerClapCut) {
      playerClapCut = true
      lastAutoEmoteAt = now
      void triggerEmote({ predefinedEmote: 'shrug' })
    }
    return
  }
  playerClapCut = false
  const snap = getDanceSnapshot()
  if (snap) {
    if (snap.phase !== lastPhase || snap.dancer !== lastDancer) {
      onPhaseChange(lastPhase, snap.phase, now)
      lastPhase = snap.phase
      lastDancer = snap.dancer
    }
  }
  enforceFloorExclusivity(now, EFFECTS_INTERVAL_S)
  runWaitBounceLoop(now, EFFECTS_INTERVAL_S)
  runCrowdAutomation(now, EFFECTS_INTERVAL_S)
}

export function initDanceEffects(): void {
  engine.addSystem(danceEffectsSystem)
}
