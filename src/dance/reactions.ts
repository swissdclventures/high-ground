/**
 * Breakdance adapter for the reusable crowd-reaction contract.
 *
 * Automatic show outcomes are derived from the shared dance snapshot, while a
 * host cue rides the existing dance MessageBus. Consumers subscribe once and
 * drive their own presentation layer (NPC motion, audio, lights, future apps).
 */
import { engine } from '@dcl/sdk/ecs'
import type {
  CrowdReactionCue,
  CrowdReactionIntensity,
  CrowdReactionMood,
  CrowdReactionTarget
} from '@shared/crowd-reaction-contract'
import { ALL_CROWD_REACTION_TARGET, normalizeCrowdReactionCue } from '@shared/crowd-reaction-contract'
import { isNpcUserId } from '@shared/dance-venue-contract'
import { combinedMoveIntensity } from '@shared/breakdance-move-spectacle'
import { emitDance, onDance } from './bus'
import { getDanceConfig, getDanceSnapshot } from './runtime'

type ReactionListener = (cue: CrowdReactionCue) => void

const listeners = new Set<ReactionListener>()
let activeCue: CrowdReactionCue | null = null
let lastCueId = ''
let lastPhase = ''
let lastDancer = ''
let lastEmoteAt = 0
let timer = 0
let installed = false

function activateCue(cue: CrowdReactionCue): void {
  if (cue.id === lastCueId) return
  lastCueId = cue.id
  activeCue = cue
  for (const listener of listeners) listener(cue)
}

export function onCrowdReaction(listener: ReactionListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getActiveCrowdReaction(now = Date.now()): CrowdReactionCue | null {
  if (!activeCue) return null
  if (now > activeCue.startedAt + activeCue.durationMs) {
    activeCue = null
    return null
  }
  return activeCue
}

function cue(
  id: string,
  mood: CrowdReactionMood,
  intensity: CrowdReactionIntensity,
  startedAt: number,
  durationMs: number,
  focusUserId?: string | null
): CrowdReactionCue {
  return {
    id,
    target: ALL_CROWD_REACTION_TARGET,
    mood,
    intensity,
    startedAt,
    durationMs,
    seed: Math.trunc(startedAt + intensity * 1009),
    focus: focusUserId ? { userId: focusUserId } : undefined
  }
}

/**
 * Crowd audio / speech / overlay ONLY as a consequence of a scored move (or a fail).
 * Phase changes and NPC filler turns must stay silent — that was the constant cheer.
 */
function syncAutomaticReactions(): void {
  const config = getDanceConfig()
  const snap = getDanceSnapshot()
  if (!config?.reactions.enabled || !snap) return
  const cap = config.reactions.maxAutomaticIntensity

  if (snap.phase !== lastPhase || (snap.dancer ?? '') !== lastDancer) {
    lastPhase = snap.phase
    lastDancer = snap.dancer ?? ''
    const failedHuman =
      snap.phase === 'failure' && snap.lastResult && !isNpcUserId(snap.lastResult.userId)
    if (failedHuman) {
      const at = snap.phaseEndsAt - config.failureDisplayS * 1000
      const failedHard = snap.lastResult?.reason === 'repeat' || snap.lastResult?.reason === 'variety'
      const intensity = Math.min(cap, failedHard ? 3 : 2) as CrowdReactionIntensity
      activateCue(cue(`failure:${snap.rev}`, 'negative', intensity, at, 5000, snap.lastResult?.userId))
    }
  }

  if (
    snap.phase === 'active' &&
    snap.lastEmoteAt > 0 &&
    snap.lastEmoteAt !== lastEmoteAt &&
    !isNpcUserId(snap.dancer)
  ) {
    lastEmoteAt = snap.lastEmoteAt
    // A new move or original four-move sequence gets the promised ovation even
    // when it appears early in the run. Ordinary moves retain the progressive
    // spectacle curve and the host's configured intensity cap.
    const intensity = Math.min(
      cap,
      snap.lastDiscovery ? 4 : combinedMoveIntensity(snap.moveCount, snap.lastEmoteUrn, cap)
    ) as CrowdReactionIntensity
    activateCue(
      cue(
        `move:${snap.lastEmoteAt}:${snap.moveCount}`,
        'positive',
        intensity,
        snap.lastEmoteAt,
        intensity >= 4 ? 6500 : 2800 + intensity * 600,
        snap.dancer
      )
    )
  }
}

function reactionSystem(dt: number): void {
  timer -= dt
  if (timer > 0) return
  timer = 0.15
  syncAutomaticReactions()
  getActiveCrowdReaction()
}

/**
 * Who asked for this cue — and it is load-bearing, not a label.
 *
 * The world-FX consumers in `dance/index.ts` fire ONLY on `host:`, because the
 * spectacle they run (`playSpectacleClimax`) plants its fire burst three metres
 * in front of the LOCAL CAMERA. That is right for a host pressing Frenzy on
 * their own dance floor and catastrophic for anything else: every other client
 * renders the same burst at its own feet.
 *
 * The punch machine had been borrowing this call to make its NPC crowd react,
 * and inherited the burst with it — which is the whole of "the fireball hits
 * the wrong player", reported three times and never found, because nothing in
 * the punch plugin spawns a fireball. It asks for `punch` now: the crowd still
 * reacts, and the fire is spawned by the cabinet, anchored to the cabinet.
 */
export type CrowdReactionSource = 'host' | 'punch'

export function triggerBreakdanceCrowdReaction(
  mood: CrowdReactionMood,
  intensity: CrowdReactionIntensity,
  target: CrowdReactionTarget = ALL_CROWD_REACTION_TARGET,
  source: CrowdReactionSource = 'host'
): CrowdReactionCue {
  const now = Date.now()
  const nextCue: CrowdReactionCue = {
    id: `${source}:${now}:${mood}:${intensity}`,
    target,
    mood,
    intensity,
    startedAt: now + 120,
    durationMs: intensity >= 4 ? 7000 : 4800,
    seed: now ^ (intensity * 7919)
  }

  // Do not make a host button depend on the network adapter to produce local
  // feedback. emitDance also dispatches locally, but activateCue is idempotent
  // and makes this path resilient even if MessageBus setup/send fails.
  activateCue(nextCue)
  emitDance({
    type: 'dance.crowdCue',
    cue: nextCue
  })
  return nextCue
}

export function initCrowdReactions(): void {
  if (installed) return
  installed = true
  onDance('dance.crowdCue', (message) => {
    const normalized = normalizeCrowdReactionCue(message.cue)
    if (normalized) activateCue(normalized)
  })
  engine.addSystem(reactionSystem)
}
