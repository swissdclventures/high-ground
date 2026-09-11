/**
 * Club FX — dynamic spotlights + ground smoke jets over the dance floor.
 *
 * Lights: four REAL LightSource spots hung HIGH over the floor centre, each
 * assigned a base yaw (0/90/180/270) so together they cover the whole circle,
 * sweeping within their sector. They FLASH to the simulated club beat (and can
 * strobe) so the room feels alive. A translucent emissive beam cone rides each
 * spot so the shaft is visible in the air (DCL spots don't draw the beam).
 *
 * Smoke: ground OUTLETS (no visible machine box) at the floor edge that jet
 * upward and toward the stage — strength + direction configurable.
 */
import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  Material,
  LightSource,
  ParticleSystem
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { isMusicPlaying } from '../dance/music'
import { isClubAtmosphereActive } from '../dance/runtime'
import type { CrowdReactionCue } from '@shared/crowd-reaction-contract'

const smokes: Entity[] = []
let fxWasOn = true

export interface ClubFxOptions {
  /** flash the lights to the (simulated) beat while music plays */
  beatFlash: boolean
  /** 0..1+ smoke output multiplier */
  smokeStrength: number
  /** yaw (deg) the smoke blows toward — 0 = +Z (toward the stage/screen wall) */
  smokeAngleDeg: number
  /** metres the lamps hang above the floor */
  lightHeight: number
}

const DEFAULTS: ClubFxOptions = {
  beatFlash: true,
  smokeStrength: 1,
  smokeAngleDeg: 0,
  lightHeight: 7
}

let installed = false
let opts: ClubFxOptions = DEFAULTS

interface SweepRig {
  entity: Entity
  beam: Entity
  color: Color3
  baseYaw: number
  tilt: number
  sweep: number
  speed: number
  phase: number
  baseIntensity: number
}

const rigs: SweepRig[] = []
let elapsed = 0
let reaction: CrowdReactionCue | null = null
/** Admin FX Lab blackout — hero white spot, other lamps dimmed. */
let blackoutMode = false

// magenta / cyan / amber / green — a full club wash around the circle.
const SPOT_COLORS: Color3[] = [
  Color3.create(1.0, 0.2, 0.75),
  Color3.create(0.2, 0.85, 1.0),
  Color3.create(1.0, 0.72, 0.25),
  Color3.create(0.35, 1.0, 0.55)
]

const BEAT_S = 60 / 124
function beat(): number {
  if (!opts.beatFlash || !isMusicPlaying()) return 0
  const phase = (elapsed % BEAT_S) / BEAT_S
  return Math.max(0, Math.pow(1 - phase * 2.2, 3))
}

function spawnSpotlight(
  center: { x: number; y: number; z: number },
  color: Color3,
  rig: Omit<SweepRig, 'entity' | 'beam' | 'color'>,
  lampY: number
): void {
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(center.x, lampY, center.z),
    rotation: Quaternion.fromEulerDegrees(rig.tilt, rig.baseYaw, 0)
  })
  LightSource.create(e, {
    active: true,
    color,
    intensity: rig.baseIntensity,
    range: Math.max(18, lampY - center.y + 12),
    shadow: false,
    type: LightSource.Type.Spot({ innerAngle: 10, outerAngle: 26 })
  })

  // Visible beam cone from the lamp down to the floor.
  const beamLen = Math.max(7, lampY - center.y + 1)
  const beamWide = 2.6
  const beam = engine.addEntity()
  Transform.create(beam, {
    parent: e,
    position: Vector3.create(0, 0, beamLen / 2),
    rotation: Quaternion.fromEulerDegrees(90, 0, 0),
    scale: Vector3.create(1, beamLen, 1)
  })
  MeshRenderer.setCylinder(beam, 0.05, beamWide)
  Material.setPbrMaterial(beam, {
    albedoColor: Color4.create(color.r, color.g, color.b, 0.1),
    emissiveColor: color,
    emissiveIntensity: 1.5,
    metallic: 0,
    roughness: 1,
    castShadows: false
  })

  rigs.push({ entity: e, beam, color, ...rig })
}

function setFxActive(on: boolean): void {
  for (const r of rigs) {
    const light = LightSource.getMutableOrNull(r.entity)
    if (light) light.active = on
    // Hide/show the visible beam cone.
    Material.setPbrMaterial(r.beam, {
      albedoColor: Color4.create(r.color.r, r.color.g, r.color.b, on ? 0.1 : 0),
      emissiveColor: r.color,
      emissiveIntensity: on ? 1.3 : 0,
      metallic: 0,
      roughness: 1,
      castShadows: false
    })
  }
  for (const s of smokes) {
    const ps = ParticleSystem.getMutableOrNull(s)
    if (ps) ps.active = on
  }
}

function sweepSystem(dt: number): void {
  // The show gates the WHOLE rig: stop the show → lights + smoke off.
  const on = isClubAtmosphereActive()
  if (on !== fxWasOn) {
    fxWasOn = on
    setFxActive(on)
  }
  if (!on) return

  elapsed += dt
  const b = beat()
  const now = Date.now()
  if (reaction && now > reaction.startedAt + reaction.durationMs) reaction = null
  const activeReaction = reaction && now >= reaction.startedAt ? reaction : null
  for (let index = 0; index < rigs.length; index++) {
    const r = rigs[index]!
    const yaw = r.baseYaw + Math.sin(elapsed * r.speed + r.phase) * r.sweep
    const t = Transform.getMutable(r.entity)
    t.rotation = Quaternion.fromEulerDegrees(r.tilt, yaw, 0)
    // Beat flash: kick the light intensity + beam glow on the downbeat.
    const light = LightSource.getMutableOrNull(r.entity)
    let multiplier = 1 + b * 1.6
    let color = r.color
    if (blackoutMode) {
      const pulse = 0.7 + Math.abs(Math.sin(elapsed * 2.4)) * 0.3
      multiplier = index === 0 ? 4.2 * pulse : 0.08
      color = index === 0 ? Color3.White() : Color3.create(0.05, 0.05, 0.08)
    } else if (activeReaction) {
      const pulse = 0.55 + Math.abs(Math.sin(elapsed * (3 + activeReaction.intensity)))
      if (activeReaction.mood === 'positive' && activeReaction.intensity >= 4) {
        // Blackout + hero spotlight: one white shaft isolates the performer,
        // surrounding rigs stay barely alive so the room does not disappear.
        multiplier = index === 0 ? 3.8 * pulse : 0.12
        color = index === 0 ? Color3.White() : r.color
      } else if (activeReaction.mood === 'negative') {
        multiplier = activeReaction.intensity >= 3 ? 0.18 : 0.45
        color = Color3.create(0.3, 0.35, 0.55)
      } else if (activeReaction.mood === 'aggressive') {
        multiplier = (1.3 + activeReaction.intensity * 0.45) * pulse
        color = Color3.create(1, 0.08, 0.05)
      } else {
        multiplier += activeReaction.intensity * 0.55 * pulse
      }
    }
    if (light) {
      light.intensity = r.baseIntensity * multiplier
      light.color = color
    }
    Material.setPbrMaterial(r.beam, {
      albedoColor: Color4.create(color.r, color.g, color.b, 0.08 + b * 0.14),
      emissiveColor: color,
      emissiveIntensity: 1.3 + b * 2.2 + (activeReaction ? activeReaction.intensity * 0.55 : 0),
      metallic: 0,
      roughness: 1,
      castShadows: false
    })
  }
}

/** Breakdance reaction adapter. Other apps can feed the same generic cue. */
export function setClubFxReaction(cue: CrowdReactionCue): void {
  reaction = cue
}

/** Admin FX Lab: isolate the floor with one white hero shaft. */
export function setClubFxBlackout(active: boolean): void {
  blackoutMode = active
}

export function isClubFxBlackout(): boolean {
  return blackoutMode
}

/** A ground smoke OUTLET — no machine box; particles jet up + toward the stage. */
function spawnSmokeOutlet(
  pos: { x: number; y: number; z: number },
  angleRad: number
): void {
  const strength = Math.max(0.1, opts.smokeStrength)
  // Blow up strongly, with a horizontal push in the configured direction.
  const push = Vector3.create(
    Math.sin(angleRad) * 1.6 * strength,
    2.4 * strength,
    Math.cos(angleRad) * 1.6 * strength
  )
  const emitter = engine.addEntity()
  smokes.push(emitter)
  Transform.create(emitter, { position: Vector3.create(pos.x, pos.y + 0.05, pos.z) })
  ParticleSystem.create(emitter, {
    active: true,
    rate: 26 * strength, // continuous haze, not a shy puff
    maxParticles: 600,
    lifetime: 5.5,
    gravity: -0.02,
    additionalForce: push,
    initialSize: { start: 0.4, end: 0.4 },
    sizeOverTime: { start: 0.8, end: 4.5 },
    initialVelocitySpeed: { start: 2.2 * strength, end: 3.4 * strength },
    initialColor: {
      start: Color4.create(0.85, 0.85, 0.9, 0.6),
      end: Color4.create(0.85, 0.85, 0.9, 0.6)
    },
    colorOverTime: {
      start: Color4.create(0.85, 0.85, 0.9, 0.55),
      end: Color4.create(0.72, 0.72, 0.8, 0.0)
    },
    billboard: true,
    loop: true,
    simulationSpace: 1, // PSS_WORLD — drifts across the floor
    shape: ParticleSystem.Shape.Cone({ angle: 20, radius: 0.25 })
  })
}

export function initClubFx(
  center: { x: number; y: number; z: number },
  zoneRadius: number,
  options?: Partial<ClubFxOptions>
): void {
  if (installed) return
  installed = true
  opts = { ...DEFAULTS, ...options }

  const lampY = center.y + Math.max(3, opts.lightHeight)
  const tilt = 66 // steep-ish so the floor is well lit from high up
  const sweep = 40
  for (let i = 0; i < 4; i++) {
    spawnSpotlight(
      center,
      SPOT_COLORS[i],
      {
        baseYaw: i * 90,
        tilt,
        sweep,
        speed: 0.7 + i * 0.12,
        phase: i * 1.7,
        baseIntensity: 24000
      },
      lampY
    )
  }
  engine.addSystem(sweepSystem)

  // Ground outlets at the floor's front edge, blowing up + toward the stage.
  const ang = (opts.smokeAngleDeg * Math.PI) / 180
  const edge = Math.max(0.8, zoneRadius - 0.5)
  // Two outlets flanking the front, both aimed the configured way.
  spawnSmokeOutlet({ x: center.x - edge * 0.5, y: center.y, z: center.z - edge * 0.7 }, ang)
  spawnSmokeOutlet({ x: center.x + edge * 0.5, y: center.y, z: center.z - edge * 0.7 }, ang)

  console.log('[club-fx] lights + ground smoke installed')
}
