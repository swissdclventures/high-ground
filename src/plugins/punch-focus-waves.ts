import { PUNCH_UI } from './punch-visual-theme'
/**
 * THE WAVES — channelling made visible, travelling out of the body.
 *
 * Meditation was a silent pose and two numbers. Standing on that deck you could
 * see four people doing the same emote and had no way to tell who they were
 * working ON, which way the energy was going, or that anything was leaving them
 * at all. The balloons said the words; nothing showed the ACT.
 *
 * So every beat emits a pulse that leaves the channeller's chest and travels the
 * way they are FACING. Point yourself at the machine and your work visibly lands
 * on it; face the wrong way and it visibly does not — which is the cheapest
 * possible teacher for "stand where you can see the punch".
 *
 * ‼️THE RING IS A WAVEFRONT, NOT A BILLBOARD. Owner, 2026-09-05: *"from the side
 * they always look like circles… they only look correct when you stand behind the
 * casting avatar. They're not supposed to look like circles, they're always
 * supposed to be moving away from the caster."* Exactly right, and the billboard
 * was the cause: `BM_ALL` turns every pulse to face the CAMERA, so a viewer at 90°
 * to the flow saw perfect circles sliding sideways across their view — a shape
 * that says nothing about which way anything is going.
 *
 * A wave leaving a body is a FRONT: its face is square to its own travel, so it
 * reads as a circle from behind the caster and as a narrow bar from the side,
 * which is what "moving away" looks like from there. Each pulse is tipped a few
 * degrees off dead-square, alternating, so a viewer standing exactly side-on
 * still catches some face instead of an invisible zero-thickness edge — and the
 * train fans like a wake rather than stacking like slides.
 *
 * COLOUR IS DELIBERATELY NOT A LEGEND ANY MORE.
 *
 * Light blue used to leave the people lifting the punch and black used to leave
 * the people dragging it down, so a contested bag had two colours crossing over
 * the deck and anybody could read, live, exactly who had chosen what. ‼️That is
 * the disclosure the secrecy rule forbids. Both sides emit the SAME channel color,
 * and the pulses are the loudest thing on the deck precisely because they no
 * longer have to be told apart: a spectator sees the room channelling and
 * cannot tell for or against, which is the whole point of the suspense.
 *
 * They are also roughly THREE TIMES the presence they had — bigger, denser,
 * more opaque, longer-lived and emitted more often — which was the other half
 * of the same instruction. Black smoke at 0.34 m and 72% alpha was invisible
 * against a bright sky; a bright ring at 1.0 m is legible.
 *
 * POSITIONS COME FROM THE AVATARS THEMSELVES. `PlayerIdentityData` + `Transform`
 * is the only thing on the wire that knows where a remote body actually is and
 * which way it is turned — the coordinator's roster carries names and numbers,
 * never coordinates. A member whose avatar is not resolvable this frame simply
 * emits nothing, which is correct: they are out of the client's range.
 */
import {
  Entity,
  Material,
  MeshRenderer,
  PlayerIdentityData,
  Transform,
  engine
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import type { FocusSignalMember } from './punch-focus-signals'

/**
 * ‼️A RIPPLE, NOT SMOKE. Owner, 2026-09-04: *"replace it with something
 * resembling wave lines... the smoke is just very ambiguous and unclear."*
 *
 * This borrowed the machine's soft grey blob (`fx-particle-smoke.png`) and
 * tinted it violet, which is a cloud, and a cloud says only that something is
 * present near these people. Concentric rings say a wave is leaving a source —
 * and being rotationally symmetric they cannot be caught at a wrong-looking
 * angle, which matters for a billboard whose screen orientation is the
 * camera's to pick. Drawn white so the material's tint is the only hue applied;
 * see scripts/punch/generate-wave-ring.py.
 */
const WAVE_TEX = 'images/punch/wave-ring.png'

/**
 * Light blue LIFTS, black DRAGS. Picked against this venue rather than from a
 * palette: the deck is violet and the sky behind it is bright, so a pale cyan
 * reads at distance without competing with the machine's own gold, and a near
 * black is the only thing on the island that reads as an absence of light.
 */
/**
 * ONE COLOUR, BOTH SIDES — and it is a `Record` on purpose rather than a bare
 * constant. Keeping the shape means the day somebody is tempted to re-separate
 * the channels they have to walk past the rule written above to do it.
 *
 * The value is the visual family's neutral channel accent: the buttons, the balloons, the HUD pill and the pulses in the air all
 * carry it, so a player who knows the controls recognises the effect without
 * the effect telling on them.
 */
const CHANNEL_VIOLET = PUNCH_UI.channel
const CHANNEL_WAVE = PUNCH_UI.channel
/**
 * ‼️SOFTER THAN THE 3x PASS, ON PURPOSE. Owner, 2026-09-05: *"the waves are way
 * too strong, make them more transparent so they are a little bit softer…
 * they're way too fast and too aggressive."*
 *
 * The 3x pass raised four numbers together — opacity to 1, glow to 2.6, rate to
 * one every 150 ms, life down to 1.2 s — because the effect it replaced (grey
 * smoke) could not be seen at all. Stacked, they made a hard violet strobe that
 * out-shouted the punch it was supposed to be feeding. Every one of them comes
 * back down here, and the REACH is untouched: the mechanic is still legible
 * because a ring is a shape, and a shape survives being quiet.
 */
const WAVE_GLOW = 1.05

/** Chest height. Below the balloon, above the hands, clear of the floor. */
const WAVE_LIFT_M = 1.15
/** Where the pulse is born, ahead of the body so it never clips the avatar. */
const WAVE_START_M = 0.55
/**
 * ‼️THE REACH CAME BACK IN. The 3x pass pushed a pulse 5.2 m across the deck and
 * grew it to 2.6 m wide on the way, and the owner's reading of the result was
 * *"quite disturbing that it goes this far into the distance"* — at that reach
 * the pulses stop belonging to the people making them and become weather over
 * the whole island.
 *
 * A ring is legible at a fraction of a blob's size, because it is a SHAPE
 * rather than a density, so the presence survives the trim. What is kept from
 * the 3x pass is the rate and the opacity: a continuous train of small clear
 * rings reads as a flow, which is the thing the mechanic has to show.
 */
/** Roughly half the old reach: the pulse dies about where the ring of people ends. */
const WAVE_TRAVEL_M = 2.6
/** Longer life over the same reach: the pulse DRIFTS out now instead of darting. */
const WAVE_LIFE_MS = 2_100
/** A ring reads at a third of the area a blob needed. */
const WAVE_SIZE_START = 0.34
const WAVE_SIZE_END = 1.15
/** Was 1. A pulse you can see the deck through — present, never a flashbulb. */
const WAVE_ALPHA = 0.4
/** Was 150. Roughly a beat every third of a second: a pulse, not a strobe. */
const WAVE_EVERY_MS = 340
/**
 * A hard ceiling on live pulses, raised from 36 with the rest of it. Ten
 * channellers at nearly seven a second is a lot of transparent geometry over
 * one small deck, and the mechanic is worth nothing if it costs the frame rate
 * the punch is judged on — so the pool grew by the same factor as the emission
 * and no further. Past this the oldest pulses simply are not replaced, which
 * degrades the density rather than the frame.
 */
const WAVE_MAX = 110
/**
 * How far off dead-square each front is tipped, alternating side to side.
 *
 * Zero would be physically right and visually fatal: a plane seen exactly edge-on
 * has no area, so a spectator standing at 90° to the flow would watch the effect
 * blink out entirely. A few degrees costs nothing from behind and keeps a sliver
 * of face pointed at everybody else.
 */
const WAVE_TILT_DEG = 17
/** Alpha is written in steps, not per frame: every write is a component update. */
const FADE_STEPS = 6

interface Wave {
  entity: Entity
  bornAt: number
  from: Vector3
  dir: Vector3
  rotation: Quaternion
  step: number
  live: boolean
}

const waves: Wave[] = []
const lastEmitAt = new Map<string, number>()
/** Which way the next front is tipped. Flipped on every emit — see `WAVE_TILT_DEG`. */
let waveTip = 1
/**
 * WHERE THE ENERGY IS GOING. Set by the plugin from the live cabinet's world
 * position; null in a scene that has not told us, which falls the pulses back
 * to the body's own facing rather than aiming them at the origin.
 */
let waveTarget: Vector3 | null = null

export function setFocusWaveTarget(at: Vector3 | null): void {
  waveTarget = at ? Vector3.clone(at) : null
}

function key(member: { userId: string; mine: boolean }): string {
  return member.mine ? 'me' : member.userId.toLowerCase()
}

/**
 * Where a channeller is standing and which way they are turned.
 *
 * The local player is read straight off `engine.PlayerEntity`, which is exact
 * and always present. Everyone else is matched by address against the avatars
 * the explorer has actually loaded — a member who is too far away to be loaded
 * has no body to emit from, and is skipped rather than guessed at.
 */
function bodyOf(
  userId: string,
  mine: boolean,
  body?: Entity
): { position: Vector3; rotation: Quaternion } | null {
  // A CHANNELLING NPC IS NOT IN `PlayerIdentityData` and never will be, so the
  // address lookup below can only ever fail for one. The entity is handed
  // straight in instead — it is the scene's own, and its transform is already
  // in the same space every wave is spawned into.
  if (body) {
    const tf = Transform.getOrNull(body)
    return tf ? { position: tf.position, rotation: tf.rotation } : null
  }
  if (mine) {
    const tf = Transform.getOrNull(engine.PlayerEntity)
    return tf ? { position: tf.position, rotation: tf.rotation } : null
  }
  const wanted = userId.toLowerCase()
  if (!wanted) return null
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if ((identity.address ?? '').toLowerCase() !== wanted) continue
    const tf = Transform.getOrNull(entity)
    return tf ? { position: tf.position, rotation: tf.rotation } : null
  }
  return null
}

function claimWave(): Wave | null {
  for (const wave of waves) if (!wave.live) return wave
  if (waves.length >= WAVE_MAX) return null
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(0, -50, 0) })
  MeshRenderer.setPlane(entity)
  // ‼️NO BILLBOARD. The orientation is the message — see the head of this file.
  // A plane is drawn from both sides, so a front tipped away from a viewer is
  // still lit for them; nothing here depends on which face is forward.
  const wave: Wave = {
    entity,
    bornAt: 0,
    from: Vector3.Zero(),
    dir: Vector3.create(0, 0, 1),
    rotation: Quaternion.Identity(),
    step: -1,
    live: false
  }
  waves.push(wave)
  return wave
}

function paint(wave: Wave, alpha: number): void {
  const base = CHANNEL_WAVE
  Material.setPbrMaterial(wave.entity, {
    texture: Material.Texture.Common({ src: WAVE_TEX }),
    alphaTexture: Material.Texture.Common({ src: WAVE_TEX }),
    albedoColor: Color4.create(base.r, base.g, base.b, alpha),
    emissiveColor: Color4.create(base.r, base.g, base.b, 1),
    emissiveIntensity: WAVE_GLOW * alpha,
    transparencyMode: 2,
    roughness: 1,
    metallic: 0,
    castShadows: false
  })
}

/**
 * One pulse, now. Called directly on this client's own key press so the answer
 * to the hand is instant, and on a timer for everybody else.
 */
export function emitFocusWave(userId: string, mine: boolean, from?: Entity): void {
  const body = bodyOf(userId, mine, from)
  if (!body) return
  const wave = claimWave()
  if (!wave) return
  // ‼️THE PULSE FLIES AT THE MACHINE, NOT WHEREVER THE BODY HAPPENS TO FACE.
  //
  // It used to leave along the booster's own forward vector, which meant a
  // crowd standing in a ring around the cabinet fired its energy outward, in
  // every direction, away from the thing it was supposed to be feeding. The
  // read was ambient smoke: *something* is happening near these people. The
  // owner's note is exactly that — the relationship between spectator and
  // machine has to be legible, and the message is THESE PEOPLE ARE FEEDING THE
  // PUNCH. Aimed at the cabinet, the same pulses become a visible flow: every
  // contributor draws a line to the machine and the lines converge on it.
  //
  // Falls back to the body's facing only when nobody has told us where the
  // machine is, so a scene without a registered target still emits something.
  const forward = Vector3.rotate(Vector3.Forward(), body.rotation)
  let dir = Vector3.create(forward.x, 0, forward.z)
  if (waveTarget) {
    const toward = Vector3.create(
      waveTarget.x - body.position.x,
      0,
      waveTarget.z - body.position.z
    )
    // Standing ON the machine gives a zero vector, which normalizes to NaN and
    // parks the pulse nowhere. Keep the facing in that one case.
    if (Vector3.lengthSquared(toward) > 0.04) dir = toward
  }
  wave.bornAt = Date.now()
  wave.dir = Vector3.normalize(dir)
  // THE FRONT'S OWN FACING: square to the direction of travel, then tipped by
  // `WAVE_TILT_DEG` about the horizontal axis across the flow. The side alternates
  // per pulse (`waveTip`), so consecutive fronts open like a wake instead of
  // stacking into one flat pane.
  waveTip = -waveTip
  const across = Vector3.create(-wave.dir.z, 0, wave.dir.x)
  wave.rotation = Quaternion.multiply(
    Quaternion.fromAngleAxis(WAVE_TILT_DEG * waveTip, across),
    Quaternion.lookRotation(wave.dir, Vector3.Up())
  )
  wave.from = Vector3.create(
    body.position.x + wave.dir.x * WAVE_START_M,
    body.position.y + WAVE_LIFT_M,
    body.position.z + wave.dir.z * WAVE_START_M
  )
  wave.live = true
  wave.step = -1
  lastEmitAt.set(mine ? 'me' : userId.toLowerCase(), wave.bornAt)
  advance(wave, wave.bornAt)
}

function advance(wave: Wave, now: number): void {
  const age = (now - wave.bornAt) / WAVE_LIFE_MS
  const tf = Transform.getMutableOrNull(wave.entity)
  if (!tf) return
  if (age >= 1) {
    wave.live = false
    // Parked under the deck rather than deleted: the pool is the point, and a
    // scene that adds and removes entities at four a second per person spends
    // its whole budget on bookkeeping.
    tf.position = Vector3.create(0, -50, 0)
    return
  }
  const reach = WAVE_TRAVEL_M * age
  const size = WAVE_SIZE_START + (WAVE_SIZE_END - WAVE_SIZE_START) * age
  tf.position = Vector3.create(
    wave.from.x + wave.dir.x * reach,
    // A thought drifts as it goes, so the train fans upward slightly instead of
    // running dead flat — flat read as a conveyor belt.
    wave.from.y + age * 0.35,
    wave.from.z + wave.dir.z * reach
  )
  tf.scale = Vector3.create(size, size, size)
  tf.rotation = wave.rotation
  // Fades in over the first fifth, then out — a pulse that appears at full
  // strength looks like a pop rather than something leaving a body.
  const shape = age < 0.2 ? age / 0.2 : 1 - (age - 0.2) / 0.8
  const step = Math.max(0, Math.min(FADE_STEPS, Math.round(shape * FADE_STEPS)))
  if (step === wave.step) return
  wave.step = step
  paint(wave, (WAVE_ALPHA * step) / FADE_STEPS)
}

/**
 * Step the field. Emits for every channeller who is due one — this client's own
 * beats have usually emitted already, on the key press — and moves what is in
 * the air.
 */
export function updateFocusWaves(members: FocusSignalMember[], now: number): void {
  for (const member of members) {
    // NO QUALITY GATE. Being in the roster already means "tapping right now" —
    // the coordinator drops anyone who has gone quiet. Gating on quality would
    // have made the pulses vanish for exactly the person doing it badly, which
    // is the person the feedback is for.
    const id = key(member)
    if (now - (lastEmitAt.get(id) ?? 0) < WAVE_EVERY_MS) continue
    lastEmitAt.set(id, now)
    emitFocusWave(member.userId, member.mine, member.body)
  }
  for (const wave of waves) if (wave.live) advance(wave, now)
}

/** Take the field down — round over, mode change, teardown. */
export function clearFocusWaves(): void {
  for (const wave of waves) engine.removeEntity(wave.entity)
  waves.length = 0
  lastEmitAt.clear()
}
