/**
 * Spawn smart entity GLBs as separate SDK7 entities and drive interactive behaviors.
 *
 * Media screens use a dark MeshRenderer box; the video feed is textured onto it
 * later by registerScreen() (media.ts) via a basic material bound to the box's
 * VideoPlayer — the dark material here is only the "screen off" fallback.
 * A thin frame is added as child boxes so the in-world look matches the composer.
 * Gates are collider-only — never a visible white box.
 */

import {
  engine,
  Entity,
  GltfContainer,
  Transform,
  ColliderLayer,
  MeshRenderer,
  MeshCollider,
  Material,
  AudioSource,
  InputAction,
  PointerEventType,
  inputSystem,
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import type { SceneRuntimeConfig, SmartRuntimeEntity } from '@shared/scene-runtime-config'
import { GRID, resolveStoryHeight } from '@shared/types'
import { isSiteScoped, SITE_FLOOR_INDEX } from '@shared/floor-props'
import { walkSurfaceY } from '@shared/kit-geometry'
import { moverMotion, resolveElevatorTravelForRuntime } from '@shared/smart-object-contract'
import { attachMotion, resetMotion } from './motion'
import type { MotionSpec } from '@shared/motion-contract'
import { glbLocalToScene, glbYawToScene } from '@shared/dcl-placement'
import {
  advanceJumpPadWander,
  jumpPadWanderWorldFromOutlines,
  startJumpPadWander,
  type JumpPadWanderState,
  type JumpPadWanderWorld,
} from '@shared/jump-pad-wander'
import {
  arcPointAt,
  corridorLaneContains,
  LAUNCH_COOLDOWN_S,
  padFlightSeconds,
  PAD_FLIGHT_STEP_HZ,
  PICKER_HOP_ARC_M,
  throwHeadingRad,
  traversalPresetSpec,
  VERTICAL_THROW_M,
} from '@shared/traversal'
import { movePlayerTo } from '~system/RestrictedActions'
import { isRidingGlider } from './neon-glider-dock'

export interface SmartEntityHandle {
  entity: Entity
  spec: SmartRuntimeEntity
  worldX: number
  worldY: number
  worldZ: number
}

/** Initial entity Y from manifest resting floor (composer-local meters). */
export function smartEntityOriginY(
  entity: SmartRuntimeEntity,
  storyHeight: number
): number {
  // Pads name their own surface height. floorIndex × storyHeight would misplace the
  // roof pad (the roof is a level, not a floor) and any pad in a per-floor-heights
  // building — padY is the authority the editor already resolved.
  const padY = Number(entity.spec.padY)
  if (entity.behavior === 'launch_pad' && Number.isFinite(padY)) return padY
  const centerY = Number(entity.spec.centerY)
  if (Number.isFinite(centerY)) return centerY
  const floorIndex =
    typeof entity.spec.floorIndex === 'number'
      ? entity.spec.floorIndex
      : (entity.movement?.currentFloor ?? 0)
  const scope = typeof entity.spec.scope === 'string' ? entity.spec.scope : undefined
  if (isSiteScoped({ floorIndex, scope }) || floorIndex === SITE_FLOOR_INDEX) {
    return walkSurfaceY(0)
  }
  return walkSurfaceY(floorIndex * storyHeight)
}

/** Vertical frame delta baked by the Builder for building- or plot-owned entities. */
export function smartEntityRuntimeOriginYOffset(entity: SmartRuntimeEntity): number {
  const value = Number(entity.spec.runtimeOriginYOffset)
  return Number.isFinite(value) ? value : 0
}

type ElevatorState = 'rest' | 'up' | 'dwell' | 'down'

interface ElevatorMover {
  entity: Entity
  originY: number
  worldX: number
  worldZ: number
  half: number
  lowY: number
  highY: number
  speed: number
  dwell: number
  y: number
  state: ElevatorState
  dwellTimer: number
  /** Seconds the cab has been rider-free during the top dwell. */
  emptyTimer: number
  /** Cab must be vacated once at the bottom before it will lift again. */
  armed: boolean
}

const movers: ElevatorMover[] = []
let elevatorSystemAdded = false

function playerOnPlatform(m: ElevatorMover): boolean {
  const p = Transform.getOrNull(engine.PlayerEntity)
  if (!p) return false
  const dx = Math.abs(p.position.x - m.worldX)
  const dz = Math.abs(p.position.z - m.worldZ)
  const dy = p.position.y - (m.originY + m.y)
  return dx <= m.half && dz <= m.half && dy >= -0.5 && dy <= 2.5
}

// Empty cab descends this much faster than ride speed, so "the elevator is at the
// bottom" is true within a few seconds of the rider stepping off — not 30-60 s later
// on a tall tower.
const EMPTY_RETURN_MULT = 4
// After the rider steps off at the top, wait this long before heading down — a smooth
// short grace, NOT the old instant snap that opened the roof boarding-gap underfoot.
const EXIT_GRACE_S = 1.0
// Standing this close to the shaft at the bottom summons an empty cab immediately.
const SUMMON_RADIUS = 2.0

/** Player waiting in the ground boarding zone (beside/under the shaft, bottom level). */
function playerWaitingAtBottom(m: ElevatorMover): boolean {
  const p = Transform.getOrNull(engine.PlayerEntity)
  if (!p) return false
  const dx = Math.abs(p.position.x - m.worldX)
  const dz = Math.abs(p.position.z - m.worldZ)
  const dy = p.position.y - (m.originY + m.lowY)
  return dx <= m.half + SUMMON_RADIUS && dz <= m.half + SUMMON_RADIUS && dy >= -1.5 && dy <= 2.5
}

// A real elevator: it ALWAYS cycles back to the bottom on its own so it is never
// stranded up top. Board at the bottom → rises → dwells at the top long enough to step
// off → descends → waits at the bottom, ready again. Riders get priority: a cab with
// someone aboard moves at ride speed and holds the full dwell. An EMPTY cab returns at
// EMPTY_RETURN_MULT× speed, and a player standing in the bottom boarding zone summons
// it down instantly (standing there IS the call button). Earlier it snapped instantly
// to the bottom the moment you stepped off, so you never saw it return and the roof
// boarding-gap became an open hole under your feet.
function elevatorSystem(dt: number): void {
  for (const m of movers) {
    const onPlat = playerOnPlatform(m)
    switch (m.state) {
      case 'rest':
        m.y = m.lowY
        // Re-arm only once the platform has been vacated — otherwise a rider coming
        // DOWN gets yanked straight back up the frame the cab touches the bottom.
        if (!onPlat) {
          m.armed = true
        } else if (m.armed) {
          m.state = 'up'
          m.armed = false
        }
        break
      case 'up':
        m.y += m.speed * dt
        if (m.y >= m.highY) {
          m.y = m.highY
          m.state = 'dwell'
          m.dwellTimer = 0
          m.emptyTimer = 0
        }
        break
      case 'dwell':
        m.dwellTimer += dt
        if (onPlat) {
          m.emptyTimer = 0
        } else {
          m.emptyTimer += dt
        }
        if (onPlat || !playerWaitingAtBottom(m)) {
          // Rider aboard (or nobody calling): full dwell; empty cab leaves after the
          // short exit grace so it's back at the bottom well before anyone misses it.
          if (m.dwellTimer >= m.dwell || (!onPlat && m.emptyTimer >= EXIT_GRACE_S)) {
            m.state = 'down'
          }
        } else {
          // Empty cab + someone waiting below → skip the rest of the dwell.
          m.state = 'down'
        }
        break
      case 'down':
        m.y -= (onPlat ? m.speed : m.speed * EMPTY_RETURN_MULT) * dt
        if (m.y <= m.lowY) {
          m.y = m.lowY
          m.state = 'rest'
          m.armed = !onPlat
        }
        break
    }
    Transform.getMutable(m.entity).position.y = m.originY + m.y
  }
}

/**
 * Launch pads — vertical traversal without a lift.
 *
 * Decentraland gives no way to push the player: avatar movement is client-side and there
 * is no impulse API. `movePlayerTo` is a teleport, so a "launch" is a teleport to an APEX
 * above the destination followed by Decentraland's own gravity dropping you onto it. That
 * is the whole trick, and it is the only shape this can take on this platform.
 */
/** One level a picker pad can send you to — label straight from the manifest. */
export interface PadStop {
  label: string
  /** Scene-space Y of that level's walk surface. */
  y: number
}

interface LaunchPad {
  id: string
  entity: Entity
  /**
   * 'fire' walks on and throws — the authored catapult, one fixed target, stepping on
   * IS the choice. 'picker' is the building pad: standing on it opens the floor list
   * and NOTHING happens until a level is chosen. The bucket-brigade version of the
   * building stack (auto-fire one floor up, nineteen times to a 20-storey roof) is
   * exactly what this replaces.
   */
  mode: 'fire' | 'picker'
  worldX: number
  worldZ: number
  /** Scene-space Y of the pad surface. */
  padY: number
  /**
   * WHERE IT THROWS YOU. Separate from the pad's own position, because a pad that could
   * only fire straight up over itself was a lift with extra steps — a catapult has to be
   * able to send you across the plot.
   */
  targetX: number
  targetZ: number
  /** Scene-space Y of the surface you land on. */
  landingY: number
  apexY: number
  /** Picker pads only: the levels on offer. Empty for fire pads. */
  stops: PadStop[]
  /** Flight feel — 'teleport' goes instantly, everything else flies a small arc. */
  preset: string
  /** 'corridor' rides a lane to a target; 'jump' launches straight up and releases. */
  kind: 'corridor' | 'jump'
  /** Corridor lane orientation (radians, 0 = +Z toward the target). */
  headingRad: number
  /** Lane half-length = radius × lengthScale; 1 for jump pads. */
  lengthScale: number
  radius: number
  /** Device animation entities — see spawnPadFx. */
  pulses?: Entity[][]
  streaks?: Entity[]
  bands?: Entity[]
  flash?: Entity
  litIndex?: number
  /** Brief glow boost after firing, decaying per frame. */
  fxBoost?: number
  /**
   * A pad that just threw you must NOT throw you again the moment you come back down on
   * it. The old guard was a 1.5 s timer, which worked only while the whole trip took
   * under 1.5 s. Now that a catapult climbs 200 m the fall alone is seven seconds, the
   * timer is long gone by the time you land, and you would bounce on the same pad
   * forever. Arming is positional instead: a pad re-arms when you step OFF it.
   */
  armed: boolean
  /**
   * Fire jump pads only. Clock-synced street wander; corridors and picker pads omit this
   * so they stay where they were authored.
   */
  wander?: JumpPadWanderState
}

/** A throw in progress — the player being carried along the arc, not teleported to it. */
interface PadFlight {
  /** Generation stamp — a flight whose gen is retired must never write. See endFlight. */
  gen: number
  from: { x: number; y: number; z: number }
  to: { x: number; y: number; z: number }
  apexY: number
  elapsed: number
  duration: number
  /** Seconds since the last movePlayerTo — the call rate is throttled on purpose. */
  sinceStep: number
  /**
   * Corridor boosts are interruptible — the player can bail mid-lane. Picker arcs are
   * not: cancelling halfway leaves you inside a solid floor slab.
   */
  cancelable: boolean
}

const launchPads: LaunchPad[] = []
let launchSystemAdded = false
/** Published building AABBs + plot edge. Null → pads stay put (old scenes, no outlines). */
let jumpPadWanderWorld: JumpPadWanderWorld | null = null
/** `syncedAt` as epoch ms so every client integrates the same clock. */
let jumpPadWanderEpochMs = 0
/** Seconds until this player can be launched again — see LAUNCH_COOLDOWN_S. */
let launchCooldown = 0
/** One global SFX entity — the player is teleported 200 m up, so spatial audio at the pad would vanish. */
let launchAudio: Entity | null = null
const JUMP_PAD_LAUNCH_CLIP = 'sounds/jump-pad-launch.wav'
let flight: PadFlight | null = null
/** Device animations advance on a shared clock so a route pulses as one thing. */
let animClock = 0
/** The picker pad the player is standing on right now — the floor-picker UI reads this. */
let activePicker: LaunchPad | null = null

/** What the floor-picker UI should offer this frame, or null when it should be closed. */
export function activeFloorPicker(): { padId: string; stops: PadStop[] } | null {
  if (!activePicker || flight) return null
  return { padId: activePicker.id, stops: activePicker.stops }
}

/** True while a speed-corridor boost is carrying the player (and can be stopped). */
export function activeCorridorBoost(): boolean {
  return !!flight && flight.cancelable && flight.gen === flightGen
}

/**
 * Bail out of a corridor boost right where you are. Leaves the avatar under player
 * control immediately — same release contract as a natural landing (see endFlight).
 * No-op if nothing cancelable is in flight (jump pads / floor-picker arcs).
 */
export function cancelCorridorBoost(): void {
  if (!flight?.cancelable || flight.gen !== flightGen) return
  endFlight()
}

/**
 * The player picked a level. One arc, straight there — CARRIED the whole way, never
 * released to gravity: the floors are solid (launch mode cuts no holes), so a gravity
 * drop would land on the slab you just left instead of the floor you asked for. The
 * flight teleports through the slabs; that is the whole reason no shaft exists.
 */
export function chooseFloorStop(stop: PadStop): void {
  const pad = activePicker
  if (!pad || flight) return
  const from = { x: pad.worldX, y: pad.padY + 0.2, z: pad.worldZ }
  const to = { x: pad.worldX, y: stop.y, z: pad.worldZ }
  pad.armed = false
  if (pad.preset === 'teleport') {
    // The teleport style keeps its definition: straight there, no arc, one call.
    moveTo(to.x, to.y, to.z)
    return
  }
  const apexY = Math.max(from.y, to.y) + PICKER_HOP_ARC_M
  flightGen += 1
  flight = {
    gen: flightGen,
    from,
    to,
    apexY,
    elapsed: 0,
    duration: padFlightSeconds(Math.abs(to.y - from.y) + PICKER_HOP_ARC_M),
    sinceStep: 1,
    // Through solid slabs — mid-cancel would leave the player inside a floor.
    cancelable: false,
  }
}

function moveTo(x: number, y: number, z: number): void {
  void movePlayerTo({ newRelativePosition: { x, y, z } })
}

/**
 * THE RELEASE CONTRACT (issue #13). Every launch ends through this one door: the flight
 * is destroyed, its generation is retired so no queued write can ever touch the player
 * again, and the cooldown starts WITHOUT retaining any control of the avatar. After
 * endFlight the player owns their body — input, gravity, camera, and the native flying
 * device all behave as if the pad never existed. A jump pad calls it AT THE APEX;
 * nothing anywhere schedules a scripted descent.
 */
let flightGen = 0

/** Manual keyboard flight waits until any pad/picker-authored ride has released. */
export function isTraversalFlightActive(): boolean {
  return flight !== null
}

function endFlight(): void {
  flightGen += 1
  flight = null
  launchCooldown = LAUNCH_COOLDOWN_S
}

function playJumpPadLaunchSound(): void {
  if (!launchAudio) {
    launchAudio = engine.addEntity()
    Transform.create(launchAudio, { position: Vector3.Zero() })
  }
  AudioSource.createOrReplace(launchAudio, {
    audioClipUrl: JUMP_PAD_LAUNCH_CLIP,
    playing: true,
    loop: false,
    volume: 0.88,
    global: true,
  })
}

function firePad(pad: LaunchPad): void {
  const from = { x: pad.worldX, y: pad.padY + 0.2, z: pad.worldZ }
  const to = { x: pad.targetX, y: pad.landingY, z: pad.targetZ }
  const ground = Math.hypot(to.x - from.x, to.z - from.z)
  const vertical = pad.kind === 'jump'
  pad.armed = false
  pad.fxBoost = 1

  // A VERTICAL LAUNCH IS ONE WRITE. Stepping the climb at 20 Hz kept the client's
  // locomotion state machine fed with position deltas, so the avatar RAN up the sky —
  // "when you're jumping up it's still pretending to run". One instant move to the
  // apex leaves nothing to animate: the client sees a teleport, then an avatar with
  // no ground under it, and plays its own falling animation. The descent (and the
  // native flying device) belong entirely to the player from that instant.
  if (vertical) {
    playJumpPadLaunchSound()
    moveTo(from.x, pad.apexY, from.z)
    endFlight()
    return
  }

  // A corridor still FLIES: being carried along the lane is the whole feel of it, and
  // horizontal travel never triggered the run-animation problem.
  if (pad.apexY <= Math.max(from.y, to.y) + 0.05) {
    moveTo(to.x, to.y, to.z)
    endFlight()
    return
  }
  const rise = Math.max(0, pad.apexY - from.y)
  flightGen += 1
  flight = {
    gen: flightGen,
    from,
    to,
    apexY: pad.apexY,
    elapsed: 0,
    duration: padFlightSeconds(ground + rise),
    sinceStep: 1,
    // Speed corridors: the player must be able to bail mid-lane.
    cancelable: true,
  }
}

/** Advance an in-progress throw. Returns true while the player is still being carried. */
function stepFlight(dt: number): boolean {
  const f = flight
  if (!f) return false
  // Defensive: a stale flight from before the last release must never write. This can
  // only trip if state leaks (interruption, scene reload) — exactly when it matters.
  if (f.gen !== flightGen) {
    flight = null
    return false
  }
  // Player gone (disconnect, scene unload mid-flight): release everything, write nothing.
  if (!Transform.getOrNull(engine.PlayerEntity)) {
    endFlight()
    return false
  }
  f.elapsed += dt
  f.sinceStep += dt
  const t = Math.min(1, f.elapsed / f.duration)
  const done = t >= 1
  if (!done && f.sinceStep < 1 / PAD_FLIGHT_STEP_HZ) return true
  f.sinceStep = 0
  // Only horizontal travel is flown. A vertical launch is a single write in firePad —
  // stepping it made the avatar run up the sky.
  const p = arcPointAt(t, f.from, f.to, f.apexY)
  moveTo(p.x, p.y, p.z)
  if (!done) return true
  // One exit for every flight — see endFlight.
  endFlight()
  return false
}

function jumpPadWanderElapsedS(): number {
  if (!jumpPadWanderEpochMs) return 0
  return Math.max(0, (Date.now() - jumpPadWanderEpochMs) / 1000)
}

function syncJumpPadXz(pad: LaunchPad): void {
  const tf = Transform.getMutableOrNull(pad.entity)
  if (tf) {
    tf.position.x = pad.worldX
    tf.position.z = pad.worldZ
  }
  pad.bands?.forEach((b, i) => {
    const band = Transform.getMutableOrNull(b)
    if (!band) return
    band.position.x = pad.worldX + (i - 1) * 0.22
    band.position.z = pad.worldZ
  })
  if (pad.flash) {
    const flash = Transform.getMutableOrNull(pad.flash)
    if (flash) {
      flash.position.x = pad.worldX
      flash.position.z = pad.worldZ
    }
  }
}

/** Drift fire jump pads along the streets. Corridors and pickers do not move. */
function driftJumpPads(): void {
  const world = jumpPadWanderWorld
  if (!world) return
  const elapsed = jumpPadWanderElapsedS()
  for (const pad of launchPads) {
    if (pad.kind !== 'jump' || pad.mode !== 'fire' || !pad.wander) continue
    pad.wander = advanceJumpPadWander(pad.wander, elapsed, pad.radius, world)
    pad.worldX = pad.wander.x
    pad.worldZ = pad.wander.z
    syncJumpPadXz(pad)
  }
}

function launchSystem(dt: number): void {
  driftJumpPads()
  animClock += dt
  updatePadFx()
  // A mounted hoverboard owns the visitor's position. Pads must be inert before any
  // arming, boost effect, sound or movePlayerTo call. Disarm pads crossed while riding
  // so stepping off on top of one does not become an accidental auto-dismount launch;
  // walking clear is what re-arms it through the ordinary path below.
  if (isRidingGlider()) {
    if (flight) endFlight()
    activePicker = null
    const rider = Transform.getOrNull(engine.PlayerEntity)
    if (rider) {
      for (const pad of launchPads) {
        const dx = rider.position.x - pad.worldX
        const dz = rider.position.z - pad.worldZ
        const onIt =
          pad.kind === 'corridor'
            ? corridorLaneContains(
                pad.worldX,
                pad.worldZ,
                pad.headingRad,
                pad.radius,
                pad.lengthScale,
                rider.position.x,
                rider.position.z
              )
            : dx * dx + dz * dz <= pad.radius * pad.radius
        if (onIt) pad.armed = false
      }
    }
    return
  }
  if (flight) {
    // Clear, intentional bail: E / primary, or jump. Corridor only — see cancelable.
    if (
      flight.cancelable &&
      (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN) ||
        inputSystem.isTriggered(InputAction.IA_JUMP, PointerEventType.PET_DOWN))
    ) {
      cancelCorridorBoost()
      return
    }
    stepFlight(dt)
    return
  }
  const p = Transform.getOrNull(engine.PlayerEntity)
  if (!p) return
  let standingPicker: LaunchPad | null = null
  for (const pad of launchPads) {
    const dx = p.position.x - pad.worldX
    const dz = p.position.z - pad.worldZ
    // A corridor's trigger is its whole RUNWAY, not a dot at its centre — "the player
    // should not have to step on a small center point" (issue #13).
    const onIt =
      pad.kind === 'corridor'
        ? corridorLaneContains(
            pad.worldX,
            pad.worldZ,
            pad.headingRad,
            pad.radius,
            pad.lengthScale,
            p.position.x,
            p.position.z
          )
        : dx * dx + dz * dz <= pad.radius * pad.radius
    if (!onIt) {
      // Stepping off is what re-arms it — see LaunchPad.armed.
      pad.armed = true
      continue
    }
    // Must be STANDING on it. Without the vertical window a pad would fire at anyone
    // passing above or below it — including the player it just launched, mid-fall.
    // A zero-arc pad (teleport) lands you exactly on the surface, so the window still
    // has to admit dy ≈ 0.
    const dy = p.position.y - pad.padY
    if (dy < -0.6 || dy > 2.4) continue
    if (pad.mode === 'picker') {
      // A picker never fires on its own — it opens the floor list and waits.
      standingPicker = pad
      continue
    }
    if (!pad.armed || launchCooldown > 0) continue
    firePad(pad)
    activePicker = null
    return
  }
  // Standing on a picker opens its list; walking off closes it. No timers, no arming.
  activePicker = standingPicker
  if (launchCooldown > 0) launchCooldown -= dt
}

function padColor(preset: unknown): Color4 {
  const hex = traversalPresetSpec(typeof preset === 'string' ? preset : undefined).color
  return Color4.create(
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
    1
  )
}

function glowMaterial(e: Entity, color: Color4, alpha: number, intensity: number): void {
  Material.setPbrMaterial(e, {
    albedoColor: Color4.create(color.r, color.g, color.b, alpha),
    emissiveColor: Color4.create(color.r, color.g, color.b, 1),
    emissiveIntensity: intensity,
    roughness: 0.35,
    metallic: 0,
  })
}

function setEmissive(e: Entity, intensity: number): void {
  const m = Material.getMutableOrNull(e)
  if (m?.material?.$case === 'pbr') m.material.pbr.emissiveIntensity = intensity
}

/**
 * DEVICE ANIMATION, not route decoration (issue #13). Nothing is drawn at the
 * destination and nothing traces the path — the device itself moves:
 *
 * - CORRIDOR: solid arrows pulse along the lane entrance → exit over the baked arrows,
 *   and two low light streaks fly the lane on a loop. Direction and speed, on the lane.
 * - JUMP PAD: vertical light strokes rise through the translucent arrow and the core
 *   flashes at the top of the cycle. Firing boosts the glow briefly.
 *
 * The corridor uses eleven lightweight primitive entities and only changes emissive
 * intensity on one three-part arrow group per animation step.
 */
const CORRIDOR_PULSES = 3
const CORRIDOR_STREAKS = 2
const JUMP_BANDS = 3
const FX_DIM = 0.5
const FX_LIT = 3

function spawnPadFx(pad: LaunchPad): void {
  const color = padColor(pad.preset)
  if (pad.kind === 'corridor') {
    const halfL = pad.radius * pad.lengthScale
    const sin = Math.sin(pad.headingRad)
    const cos = Math.cos(pad.headingRad)
    const at = (along: number, y: number) => ({
      x: pad.worldX + sin * along,
      y: pad.padY + y,
      z: pad.worldZ + cos * along,
    })
    // REAL ARROWS, not centreline dashes. Each marker has a shaft and two diagonal head
    // wings. Every piece uses the same forward/right basis as the throw, so the visual
    // cannot acquire a separate direction from the acceleration corridor itself.
    const forward = { x: sin, z: cos }
    const right = { x: cos, z: -sin }
    const shaftLen = Math.min(1.35, (halfL * 2) / CORRIDOR_PULSES * 0.42)
    const shaftWidth = Math.max(0.16, pad.radius * 0.1)
    const headAcross = Math.min(0.72, pad.radius * 0.32)
    const headBack = Math.min(0.72, shaftLen * 0.62)
    const headLen = Math.hypot(headAcross, headBack)
    const headingDeg = (pad.headingRad * 180) / Math.PI
    pad.pulses = []
    for (let i = 0; i < CORRIDOR_PULSES; i++) {
      const centerAlong = -halfL + ((i + 0.5) / CORRIDOR_PULSES) * halfL * 2
      const tipAlong = centerAlong + shaftLen * 0.48
      const shaftCenter = at(centerAlong - shaftLen * 0.12, 0.16)
      const arrow: Entity[] = []

      const shaft = engine.addEntity()
      Transform.create(shaft, {
        position: Vector3.create(shaftCenter.x, shaftCenter.y, shaftCenter.z),
        scale: Vector3.create(shaftWidth, 0.04, shaftLen),
        rotation: Quaternion.fromEulerDegrees(0, headingDeg, 0),
      })
      MeshRenderer.setBox(shaft)
      glowMaterial(shaft, color, 0.9, FX_DIM)
      arrow.push(shaft)

      for (const side of [-1, 1] as const) {
        const across = side * headAcross * 0.5
        const along = tipAlong - headBack * 0.5
        const wing = engine.addEntity()
        Transform.create(wing, {
          position: Vector3.create(
            pad.worldX + forward.x * along + right.x * across,
            pad.padY + 0.16,
            pad.worldZ + forward.z * along + right.z * across
          ),
          scale: Vector3.create(shaftWidth, 0.04, headLen),
          rotation: Quaternion.fromEulerDegrees(
            0,
            headingDeg - side * (Math.atan2(headAcross, headBack) * 180) / Math.PI,
            0
          ),
        })
        MeshRenderer.setBox(wing)
        glowMaterial(wing, color, 0.9, FX_DIM)
        arrow.push(wing)
      }
      pad.pulses.push(arrow)
    }
    pad.streaks = []
    for (let i = 0; i < CORRIDOR_STREAKS; i++) {
      const e = engine.addEntity()
      const p = at(-halfL, 0.35)
      Transform.create(e, {
        position: Vector3.create(p.x, p.y, p.z),
        scale: Vector3.create(0.12, 0.06, 1.6),
        rotation: Quaternion.fromEulerDegrees(0, (pad.headingRad * 180) / Math.PI, 0),
      })
      MeshRenderer.setBox(e)
      glowMaterial(e, Color4.White(), 0.75, 2.2)
      pad.streaks.push(e)
    }
    return
  }
  // Jump pad: slim vertical light strokes rise through the crossed arrow. Cylindrical
  // discs read as fountain ripples; upright streaks read as lift and cost fewer sides.
  pad.bands = []
  for (let i = 0; i < JUMP_BANDS; i++) {
    const e = engine.addEntity()
    Transform.create(e, {
      position: Vector3.create(pad.worldX + (i - 1) * 0.22, pad.padY + 0.5 + i * 1.1, pad.worldZ),
      scale: Vector3.create(0.12, 0.72, 0.12),
    })
    MeshRenderer.setBox(e)
    glowMaterial(e, color, 0.8, 1.6)
    pad.bands.push(e)
  }
  const flash = engine.addEntity()
  Transform.create(flash, {
    position: Vector3.create(pad.worldX, pad.padY + 0.12, pad.worldZ),
    scale: Vector3.create(pad.radius * 0.5, 0.04, pad.radius * 0.5),
  })
  MeshRenderer.setCylinder(flash, 1, 1)
  glowMaterial(flash, color, 0.9, FX_DIM)
  pad.flash = flash
}

/** The charge/pulse cycles share a clock so nearby devices feel like one visual system. */
const CHARGE_PERIOD_S = 1.6
const COLUMN_TRAVEL_M = 4.7

function updatePadFx(): void {
  for (const pad of launchPads) {
    const boost = pad.fxBoost ?? 0
    if (pad.kind === 'corridor' && pad.pulses?.length) {
      const step = Math.floor(((animClock % CHARGE_PERIOD_S) / CHARGE_PERIOD_S) * pad.pulses.length)
      if (step !== pad.litIndex) {
        if (typeof pad.litIndex === 'number' && pad.pulses[pad.litIndex]) {
          for (const part of pad.pulses[pad.litIndex]!) setEmissive(part, FX_DIM)
        }
        pad.litIndex = step
        if (pad.pulses[step]) {
          for (const part of pad.pulses[step]!) setEmissive(part, FX_LIT + boost * 2)
        }
      }
      if (pad.streaks?.length) {
        const halfL = pad.radius * pad.lengthScale
        const sin = Math.sin(pad.headingRad)
        const cos = Math.cos(pad.headingRad)
        pad.streaks.forEach((s, i) => {
          const t = ((animClock * 1.4 + i * 0.5) % 1)
          const along = -halfL + t * halfL * 2
          const tf = Transform.getMutableOrNull(s)
          if (tf) {
            tf.position.x = pad.worldX + sin * along
            tf.position.z = pad.worldZ + cos * along
          }
        })
      }
    } else if (pad.kind === 'jump' && pad.bands?.length) {
      pad.bands.forEach((b, i) => {
        const t = ((animClock / CHARGE_PERIOD_S + i / JUMP_BANDS) % 1)
        const tf = Transform.getMutableOrNull(b)
        if (tf) tf.position.y = pad.padY + 0.35 + t * COLUMN_TRAVEL_M
        // Bands fade as they near the top of the column, so the loop reads as flow.
        setEmissive(b, (0.6 + (1 - t) * 1.6) * (1 + boost))
      })
      if (pad.flash) {
        const phase = (animClock % CHARGE_PERIOD_S) / CHARGE_PERIOD_S
        setEmissive(pad.flash, (phase > 0.88 ? FX_LIT : FX_DIM) * (1 + boost * 2))
      }
    }
    if (boost > 0) pad.fxBoost = Math.max(0, boost - 0.04)
  }
}

function yRotation(rotationY: number): { rotation: ReturnType<typeof Quaternion.fromEulerDegrees> } | Record<string, never> {
  if (!Number.isFinite(rotationY) || Math.abs(rotationY) <= 1e-6) return {}
  // Composer yaw → scene yaw through the z-mirror (sign flips).
  const sceneYaw = glbYawToScene(rotationY)
  return { rotation: Quaternion.fromEulerDegrees(0, (sceneYaw * 180) / Math.PI, 0) }
}

/** Invisible barrier — collider only. Never MeshRenderer (that was the white box). */
function spawnGateCollider(
  spec: SmartRuntimeEntity,
  e: Entity,
  worldX: number,
  worldY: number,
  worldZ: number
): void {
  const width = (spec.spec.width as number) ?? 2
  const height = (spec.spec.height as number) ?? 2.5
  const depth = (spec.spec.depth as number) ?? 0.15
  const rotationY = Number(spec.spec.rotationY)

  Transform.create(e, {
    position: Vector3.create(worldX, worldY + height / 2, worldZ),
    scale: Vector3.create(width, height, depth),
    ...yRotation(rotationY),
  })
  MeshCollider.setBox(e, ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER)
}

function spawnFrameBar(
  parent: Entity,
  localPos: Vector3,
  scale: Vector3
): void {
  const bar = engine.addEntity()
  Transform.create(bar, { parent, position: localPos, scale })
  MeshRenderer.setBox(bar)
  Material.setPbrMaterial(bar, {
    albedoColor: Color4.create(0.08, 0.08, 0.08, 1),
    roughness: 0.85,
    metallic: 0.1,
  })
}

/**
 * Dark screen panel + black frame. VideoPlayer textures the root box.
 * Do not leave MeshRenderer on the default white material — that is what
 * showed up in-world as unexplained white boxes.
 */
function spawnMediaScreen(
  spec: SmartRuntimeEntity,
  e: Entity,
  worldX: number,
  worldY: number,
  worldZ: number
): void {
  const width = (spec.spec.width as number) ?? 3
  const height = (spec.spec.height as number) ?? 1.7
  const thickness = Math.max(0.04, (spec.spec.thickness as number) ?? 0.05)
  const rotationY = Number(spec.spec.rotationY)
  const frameT = 0.06

  Transform.create(e, {
    position: Vector3.create(worldX, worldY + height / 2, worldZ),
    scale: Vector3.create(width, height, thickness),
    ...yRotation(rotationY),
  })
  MeshRenderer.setBox(e)
  Material.setBasicMaterial(e, {
    diffuseColor: Color4.create(0.1, 0.1, 0.12, 1),
  })
  MeshCollider.setBox(e, ColliderLayer.CL_POINTER)

  // Frame in parent-local units (parent is already scaled to width×height×thickness).
  const fx = 1 + (frameT * 2) / width
  const fy = frameT / height
  const fz = (thickness + 0.02) / thickness
  spawnFrameBar(e, Vector3.create(0, 0.5 + fy / 2, 0), Vector3.create(fx, fy, fz))
  spawnFrameBar(e, Vector3.create(0, -0.5 - fy / 2, 0), Vector3.create(fx, fy, fz))
}

export function loadSmartEntities(config: SceneRuntimeConfig): SmartEntityHandle[] {
  movers.length = 0
  launchPads.length = 0
  resetMotion()
  jumpPadWanderWorld = jumpPadWanderWorldFromOutlines({
    cols: config.scene.cols,
    rows: config.scene.rows,
    parcelSize: GRID.parcelSize,
    outlines: config.buildingOutlines,
  })
  const stamp = Date.parse(config.syncedAt)
  jumpPadWanderEpochMs = Number.isFinite(stamp) ? stamp : Date.now()
  const entities = config.smartEntities ?? []
  if (!entities.length) return []

  const storyHeight = resolveStoryHeight(config.building)
  const floors = Math.max(1, config.building.floors ?? 1)
  const roofTerrace = !!config.building.roofTerrace
  const origin = config.modelOrigin
  const handles: SmartEntityHandle[] = []
  // Every mover's motion in authored order, so the always-cap demotion is stable.
  const motionSpecs: MotionSpec[] = entities
    .map((row) => moverMotion(row))
    .filter((row): row is MotionSpec => row !== null)
  let motionIndex = 0

  for (const spec of entities) {
    // The primary Speakeasy cabinet is a placeable smart item, but its runtime
    // geometry and interaction are installed by the claw-machine package. Loading
    // its exported editor GLB as well would draw two cabinets in the same spot.
    // Additional authored copies use interactive:false and remain ordinary GLBs.
    if (spec.behavior === 'claw_vending' && spec.spec.interactive !== false) continue
    const e = engine.addEntity()
    const centerX = (spec.spec.centerX as number) ?? 0
    const centerZ = (spec.spec.centerZ as number) ?? 0
    const width = (spec.spec.width as number) ?? 0.9
    // Building-local → scene through the z-mirror (see THE COORDINATE MIRROR
    // in shared/dcl-placement.ts) so placed pieces land where the composer
    // shows them relative to the mirrored building render.
    const scenePos = glbLocalToScene(origin, centerX, centerZ)
    const worldX = scenePos.x
    const worldZ = scenePos.z
    const isElevator =
      spec.behavior === 'vertical_elevator' && spec.movement?.mode === 'floor_stops'
    const entityFloors = Number.isFinite(Number(spec.spec.runtimeFloors))
      ? Math.max(1, Math.round(Number(spec.spec.runtimeFloors)))
      : floors
    const entityStoryHeight = Number.isFinite(Number(spec.spec.runtimeStoryHeight))
      ? Math.max(0.5, Number(spec.spec.runtimeStoryHeight))
      : storyHeight
    const entityRoofTerrace =
      typeof spec.spec.runtimeRoofTerrace === 'boolean'
        ? spec.spec.runtimeRoofTerrace
        : roofTerrace
    const entityFloorBaseYs = Array.isArray(spec.spec.runtimeFloorBaseYs)
      ? spec.spec.runtimeFloorBaseYs.filter(
          (value): value is number => typeof value === 'number' && Number.isFinite(value)
        )
      : undefined
    const runtimeOriginYOffset = smartEntityRuntimeOriginYOffset(spec)
    const travel = isElevator
      ? resolveElevatorTravelForRuntime(
          entityFloors,
          entityStoryHeight,
          entityRoofTerrace,
          spec.movement,
          spec.spec as { travelLowY?: number; travelHighY?: number },
          entityFloorBaseYs
        )
      : null
    const restY = travel?.lowY ?? smartEntityOriginY(spec, entityStoryHeight)
    const worldY = origin.y + runtimeOriginYOffset + restY

    if (spec.behavior === 'gate_barrier') {
      spawnGateCollider(spec, e, worldX, worldY, worldZ)
    } else if (spec.behavior === 'video_surface') {
      spawnMediaScreen(spec, e, worldX, worldY, worldZ)
    } else {
      // Launch-pad GLBs are exported in canonical +Z. Aim the WHOLE model here from the
      // same scene-space target used by its trigger, FX and actual travel. Baking Three's
      // yaw into the GLB while rotating SDK7 effects separately made the white centreline
      // cross the cyan arrow body in-world.
      let rotationY = Number(spec.spec.rotationY)
      if (spec.behavior === 'launch_pad') {
        const targetLocalX = Number(spec.spec.targetX)
        const targetLocalZ = Number(spec.spec.targetZ)
        const target =
          Number.isFinite(targetLocalX) && Number.isFinite(targetLocalZ)
            ? glbLocalToScene(origin, targetLocalX, targetLocalZ)
            : { x: worldX, z: worldZ }
        const style = traversalPresetSpec(
          typeof spec.spec.preset === 'string' ? spec.spec.preset : undefined
        )
        const groundDist = Math.hypot(target.x - worldX, target.z - worldZ)
        rotationY =
          style.lengthScale > 1.2 && groundDist >= VERTICAL_THROW_M
            ? throwHeadingRad(target.x - worldX, target.z - worldZ)
            : 0
      }
      Transform.create(e, {
        position: Vector3.create(worldX, worldY, worldZ),
        scale: Vector3.One(),
        ...yRotation(rotationY),
      })
      // Audio sources are INVISIBLE positional emitters. The placeholder speaker
      // GLB lost its material through GLB export and rendered as DCL's magenta
      // "no-material" box — a mystery cube dumped in the middle of the venue. The
      // AudioStream component (attached in registerAudio) carries the sound from
      // this Transform, so the emitter needs no mesh and no collider.
      // The Bubble Bash arena is a POSE, like the scrap ring: its plugin draws the
      // pitch floor and corner posts. Loading the exported plate here too would
      // z-fight that floor and drop a solid slab where players must walk.
      if (
        spec.behavior !== 'audio_stream' &&
        spec.behavior !== 'scrap_ring' &&
        spec.behavior !== 'bubble_arena' &&
        // The punch-machine plugin owns the canonical animated cabinet. Keeping the
        // smart object itself as a pose avoids loading the generic export underneath it.
        spec.behavior !== 'punch_machine'
      ) {
        const decorative = spec.behavior === 'motion'
        GltfContainer.create(e, {
          src: spec.modelFile,
          // A mover is decorative by law: no physics, and pointer only when it is clickable.
          invisibleMeshesCollisionMask: decorative
            ? ColliderLayer.CL_NONE
            : ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER,
          visibleMeshesCollisionMask: decorative && spec.spec.motion && (spec.spec.motion as { trigger?: string }).trigger === 'click'
            ? ColliderLayer.CL_POINTER
            : ColliderLayer.CL_NONE,
        })
      }
      const motion = moverMotion(spec)
      if (motion) {
        attachMotion(
          e,
          motion,
          {
            x: worldX,
            y: worldY,
            z: worldZ,
            // spec.rotationY is composer radians; the planner wants scene degrees.
            rotationYDeg: Number.isFinite(rotationY) ? (glbYawToScene(rotationY) * 180) / Math.PI : 0,
          },
          motionSpecs,
          motionIndex++
        )
      }
    }

    if (spec.behavior === 'launch_pad' && spec.spec.mode === 'picker') {
      // A BUILDING pad: a floor picker, not a trigger. Standing on it opens the level
      // list (see traversal-picker.tsx); it never fires by itself, so a 20-storey tower
      // is one chosen arc, not nineteen involuntary hops.
      const padLocalY = Number(spec.spec.padY)
      const rawStops = Array.isArray(spec.spec.floorStops) ? spec.spec.floorStops : []
      const stops = rawStops
        .map((s) => ({
          label: String((s as { label?: unknown }).label ?? ''),
          y: origin.y + runtimeOriginYOffset + Number((s as { y?: unknown }).y),
        }))
        .filter((s) => s.label.length > 0 && Number.isFinite(s.y))
      if (Number.isFinite(padLocalY) && stops.length) {
        launchPads.push({
          id: spec.id,
          entity: e,
          mode: 'picker',
          worldX,
          worldZ,
          targetX: worldX,
          targetZ: worldZ,
          padY: origin.y + runtimeOriginYOffset + padLocalY,
          landingY: origin.y + runtimeOriginYOffset + padLocalY,
          apexY: origin.y + runtimeOriginYOffset + padLocalY,
          stops,
          preset: typeof spec.spec.preset === 'string' ? spec.spec.preset : 'jump_pad',
          kind: 'jump',
          headingRad: 0,
          lengthScale: 1,
          radius: Math.max(0.4, Number(spec.spec.radius) || 1.6),
          armed: true,
        })
      }
    } else if (spec.behavior === 'launch_pad') {
      const apexLocalY = Number(spec.spec.apexY)
      const padLocalY = Number(spec.spec.padY)
      if (Number.isFinite(apexLocalY) && Number.isFinite(padLocalY)) {
        // A placed pad names its destination in the same local frame as its own centre,
        // so it goes through the identical mirror conversion. Falling back to the pad's
        // own position keeps every derived vertical pad behaving exactly as before.
        const targetLocalX = Number(spec.spec.targetX)
        const targetLocalZ = Number(spec.spec.targetZ)
        const target =
          Number.isFinite(targetLocalX) && Number.isFinite(targetLocalZ)
            ? glbLocalToScene(origin, targetLocalX, targetLocalZ)
            : { x: worldX, z: worldZ }
        const landingLocalY = Number(spec.spec.landingY)
        const presetName = typeof spec.spec.preset === 'string' ? spec.spec.preset : 'jump_pad'
        const style = traversalPresetSpec(presetName)
        const groundDist = Math.hypot(target.x - worldX, target.z - worldZ)
        const pad: LaunchPad = {
          id: spec.id,
          entity: e,
          mode: 'fire',
          worldX,
          worldZ,
          targetX: target.x,
          targetZ: target.z,
          padY: origin.y + runtimeOriginYOffset + padLocalY,
          landingY:
            origin.y +
            runtimeOriginYOffset +
            (Number.isFinite(landingLocalY) ? landingLocalY : padLocalY),
          apexY: origin.y + runtimeOriginYOffset + apexLocalY,
          stops: [],
          preset: presetName,
          // The lane IS the trigger and the direction: a corridor's oriented box, a
          // jump pad's circle. Kind decides both the hit test and the animation.
          kind: style.lengthScale > 1.2 ? 'corridor' : 'jump',
          headingRad:
            groundDist >= VERTICAL_THROW_M
              ? throwHeadingRad(target.x - worldX, target.z - worldZ)
              : 0,
          lengthScale: style.lengthScale,
          radius: Math.max(0.4, Number(spec.spec.radius) || 1.1),
          armed: true,
        }
        if (pad.kind === 'jump' && jumpPadWanderWorld) {
          pad.wander = startJumpPadWander(
            pad.id,
            pad.worldX,
            pad.worldZ,
            pad.radius,
            jumpPadWanderWorld
          )
          pad.wander = advanceJumpPadWander(
            pad.wander,
            jumpPadWanderElapsedS(),
            pad.radius,
            jumpPadWanderWorld
          )
          pad.worldX = pad.wander.x
          pad.worldZ = pad.wander.z
          const tf = Transform.getMutableOrNull(e)
          if (tf) {
            tf.position.x = pad.worldX
            tf.position.z = pad.worldZ
          }
        }
        launchPads.push(pad)
        // Device animation only — no beads, no landing disc, no destination pillar:
        // nothing is drawn anywhere but ON the device itself (issue #13).
        spawnPadFx(pad)
      }
    }

    if (isElevator && travel) {
      if (travel.highY - travel.lowY > 0.05) {
        movers.push({
          entity: e,
          originY: origin.y + runtimeOriginYOffset,
          worldX,
          worldZ,
          half: Math.max(0.6, width / 2 + 0.2),
          lowY: travel.lowY,
          highY: travel.highY,
          speed: Math.max(0.1, spec.movement?.speedMps ?? 1),
          // Dwell at the top at least ~2.5 s so a rider can step onto the roof/landing
          // before the cab heads back down; honor a longer configured dwell if set.
          dwell: Math.max(2.5, spec.movement?.dwellSeconds ?? 2.5),
          y: travel.lowY,
          state: 'rest',
          dwellTimer: 0,
          emptyTimer: 0,
          armed: true,
        })
      }
    }

    handles.push({
      entity: e,
      spec,
      worldX,
      worldY,
      worldZ,
    })
  }

  if (movers.length && !elevatorSystemAdded) {
    engine.addSystem(elevatorSystem)
    elevatorSystemAdded = true
  }
  if (launchPads.length && !launchSystemAdded) {
    engine.addSystem(launchSystem)
    launchSystemAdded = true
  }

  return handles
}
