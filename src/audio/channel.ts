/**
 * THE AUDIO CHANNEL — who owns the sound where you are standing.
 *
 * Two kinds of audio share one scene and they must not talk over each other:
 *
 *   ZONE AUDIO   an app's authored sound tied to a place — the breakdance
 *                floor's set, a video screen, a placed spatial emitter. Inside
 *                its zone it WINS, because that is the experience the owner
 *                built there.
 *
 *   AMBIENT      the venue-wide background bed (audio/ambient.ts). It fills the
 *                space between zones so a district does not read as broken.
 *
 * Every zone source registers a CLAIM here. The ambient bed asks one question
 * per frame — "is anything claiming the channel where I stand?" — and ducks if
 * so. Zone owners never reach into the bed and the bed never reaches into them;
 * this module is the only thing they share.
 *
 * A claim is either:
 *   • SPATIAL  — a centre and a radius. Wins only while the player is inside it.
 *                Radius is generous on purpose: DCL's own falloff means you hear
 *                a screen before you reach it, and the bed must be gone by then.
 *   • VENUE    — no geometry. Wins everywhere while active (a club whose set is
 *                playing IS the whole venue).
 *
 * Claims are cheap and declarative: `active()` is polled, so a source can go
 * quiet and loud again without re-registering. Registering the same id twice
 * replaces the old claim, so a re-bound emitter never leaves a ghost behind.
 */
import { engine, Transform, type Entity } from '@dcl/sdk/ecs'
import { pickAudioClaim, type AudioZoneShape } from '@shared/ambient-audio-contract'

/** The zone shape is contract-owned so the arbitration rule can be tested. */
export type AudioZone = AudioZoneShape

export interface AudioClaim {
  /** Stable id — re-registering the same id replaces the claim. */
  id: string
  /** Shown in the guest widget so a paused bed is explained, not mysterious. */
  label: string
  /**
   * null = venue-wide: wins everywhere while active.
   *
   * A THUNK is the form to use for anything attached to a placed entity: smart
   * objects are parented (a screen's own Transform is building-local, not scene
   * coordinates), so the centre has to be resolved through the parent chain at
   * query time — see `audibleZone`.
   */
  zone: AudioZone | null | (() => AudioZone | null)
  /** Polled — true while this source is actually making sound. */
  active: () => boolean
}

const claims = new Map<string, AudioClaim>()

export function claimAudioChannel(claim: AudioClaim): void {
  claims.set(claim.id, claim)
}

export function releaseAudioChannel(id: string): void {
  claims.delete(id)
}

/** Test seam + reset for a scene reload. */
export function clearAudioClaims(): void {
  claims.clear()
}

/**
 * The claim that owns the channel at a point, or null when nothing does.
 *
 * Resolving happens here (polling `active()`, walking thunks); the RULE — venue
 * beats spatial, spatial beats nothing — is `pickAudioClaim` in the contract.
 */
export function claimAt(x: number, y: number, z: number): AudioClaim | null {
  const resolved: { value: AudioClaim; zone: AudioZone | null }[] = []
  for (const claim of claims.values()) {
    let live = false
    try {
      live = claim.active()
    } catch {
      // A source mid-teardown must never take the bed down with it.
      live = false
    }
    if (!live) continue
    if (claim.zone === null) {
      resolved.push({ value: claim, zone: null })
      continue
    }
    const zone = typeof claim.zone === 'function' ? claim.zone() : claim.zone
    // A thunk that cannot resolve a position yet (entity not placed) claims
    // nothing — better a moment of bed than silencing the whole plot.
    if (zone) resolved.push({ value: claim, zone })
  }
  return pickAudioClaim(resolved, x, y, z)
}

/** The claim owning the channel where the local player stands. */
export function activeAudioClaim(): AudioClaim | null {
  const player = Transform.getOrNull(engine.PlayerEntity) ?? Transform.getOrNull(engine.CameraEntity)
  if (!player) return null
  const p = player.position
  return claimAt(p.x, p.y, p.z)
}

/**
 * World-space position of an entity, walking the Transform parent chain.
 *
 * Smart objects are parented to their building root, so `Transform.get(entity)
 * .position` is building-local — using it raw puts a top-floor screen's zone
 * near the plot origin and silences the bed in the wrong place. Rotation is
 * ignored on purpose: an audio radius is a sphere, so only the translation
 * matters, and skipping quaternion maths keeps this cheap enough to poll.
 */
export function audibleZone(entity: Entity, radius: number): AudioZone | null {
  let current: Entity | undefined = entity
  let x = 0
  let y = 0
  let z = 0
  let placed = false
  // Bounded walk: a cycle in the parent chain must not hang the frame.
  for (let hops = 0; current && hops < 16; hops += 1) {
    const transform = Transform.getOrNull(current)
    if (!transform) break
    placed = true
    x += transform.position.x
    y += transform.position.y
    z += transform.position.z
    current = transform.parent
  }
  // Un-placed entity: claim nothing rather than claiming a sphere at the plot
  // origin, which would silence the bed in a corner nothing is playing in.
  if (!placed) return null
  return { x, y, z, radius }
}
