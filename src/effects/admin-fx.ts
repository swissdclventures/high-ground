/**
 * Admin FX Lab runtime.
 *
 * Commands originate from the wallet-gated host UI and travel over the social
 * MessageBus, so every visitor in the same scene instance renders the effect.
 * Persistent effects (rain / snow / fog / sky / blackout / vignette / day-night)
 * remain active until changed or reset; shake, lightning, flash, and bursts are
 * short impulses.
 *
 * Two rules make the difference between "nothing happens" and a visible effect:
 *
 * 1. Every emitter FOLLOWS THE LOCAL CAMERA. Spreading weather across the
 *    whole plot puts a handful of particles per square metre, which reads as
 *    empty air. A dense volume carried with each visitor looks like real weather.
 * 2. Every emitter has a TEXTURE. An untextured DCL particle is an opaque quad.
 * 3. Rain/snow must surround the look direction. A single unrotated Box reads
 *    as one face (turn around → empty air). Four yaw-rotated boxes plus a
 *    sphere, billboarded, fill every side of the camera.
 * 4. Interiors stay dry. The volume is pushed outside the facade so you can
 *    watch weather through the glass without standing in it.
 * 5. First-person keeps fat close drops. Any pulled-back camera shrinks them
 *    and, for rain, raises the count toward the engine's ~1000 cap.
 */
import {
  engine,
  Entity,
  LightSource,
  MainCamera,
  Material,
  MaterialTransparencyMode,
  MeshRenderer,
  ParticleSystem,
  SkyboxTime,
  TextureFilterMode,
  TextureWrapMode,
  Transform,
  VirtualCamera,
  VisibilityComponent
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import type {
  AdminFxBurstKind,
  AdminFxCommand,
  AdminFxDayNight,
  AdminFxFogLevel,
  AdminFxOverlayMode,
  AdminFxRainLevel,
  AdminFxSkyPreset,
  AdminFxSnowLevel
} from '@shared/social-surface-contract'
import {
  buildingAtPosition,
  insideFloorPlanXZ,
  type BuildingFloorPlan
} from '@shared/floor-directory'
import { danceFloorZone, danceSupportZone, zoneCenterScene, zoneRadius } from '../dance/zones'
import { getSocialConfig } from '../social/config'
import { isAdmin } from '../social/player'
import { getRuntimeContext } from '../social/runtime-context'
import { emitSocial, onSocial } from '../social/sync'
import { setClubFxBlackout } from './club-fx'

export interface AdminFxState {
  rain: AdminFxRainLevel
  snow: AdminFxSnowLevel
  fog: AdminFxFogLevel
  sky: AdminFxSkyPreset
  dayNight: AdminFxDayNight
  blackout: boolean
  overlay: AdminFxOverlayMode
  shaking: boolean
  /** 0..1 white screen flash remaining (local UI). */
  flashAlpha: number
}

const SKY_TEXTURES: Record<Exclude<AdminFxSkyPreset, 'off'>, string> = {
  aurora: 'images/fx-sky-aurora.jpg',
  portal: 'images/fx-sky-portal.jpg',
  red_storm: 'images/fx-sky-red-storm.jpg'
}

const DAY_NIGHT_SECONDS: Record<Exclude<AdminFxDayNight, 'default'>, number> = {
  day: 43200,
  sunset: 68400,
  night: 0
}

/** Particle sprites. Without these DCL draws every particle as a hard square. */
const TEX_DOT = 'images/fx-particle-dot.png'
const TEX_SMOKE = 'images/fx-particle-smoke.png'
const TEX_RAIN = 'images/fx-particle-rain.png'

// PBParticleSystem enum values. The SDK ships these as const enums that do not
// survive the type-only import, so they are spelled out once here.
const PS_BLEND_ALPHA = 0
const PS_BLEND_ADD = 1
const PS_SPACE_WORLD = 1
const PS_PLAYING = 0

/**
 * Sky shell. Two constraints pull against each other: a WIDE shell shows more of
 * Decentraland's distant landscape under its horizon, while a NARROW one reads as
 * a close cardboard box. 110 m keeps neighbouring parcels out of frame without
 * feeling like a room.
 *
 * Height is set by the catapults: a launch pad climbs ~200 m (see
 * smart-entities.ts), so the ceiling clears that with margin rather than relying
 * on the lift below — a shell that rises puts its own FLOOR panel between a
 * high-flying player and the venue they are looking down at.
 */
const SKY_RADIUS = 110
const SKY_TOP = 320
const SKY_BOTTOM = 30
const SKY_PANEL_OVERLAP = 1.08
/** Blackout sits just inside the sky shell so no textured sky edge peeks past it. */
const BLACKOUT_RADIUS = SKY_RADIUS - 14
const BLACKOUT_TOP = SKY_TOP - 20
const BLACKOUT_BOTTOM = SKY_BOTTOM - 6

/**
 * Weather volumes ride with each visitor's camera. A single unrotated Box emits
 * from one face in Explorer, so four yaw-rotated boxes plus a sphere fill every
 * look direction. Keep the combined live count under the engine's hard 1000 cap.
 */
const WEATHER_BOX = Vector3.create(24, 16, 18)
/** Thin outdoor sheet when the player is indoors — wide facade, shallow depth so
 *  the volume cannot reach back through the glass into the room. */
const WEATHER_OUTDOOR_BOX = Vector3.create(36, 18, 5)
const WEATHER_SPHERE_RADIUS = 14
const WEATHER_FOLLOW_Y = 2
const WEATHER_RING_YAWS = [0, 90, 180, 270] as const
/** 3D camera-to-head distance: under this is first-person (eyes). */
const WEATHER_FP_PULL = 0.85
/** Furthest Explorer zoom — tiniest, densest weather around the avatar. */
const WEATHER_FAR_PULL = 18
const WEATHER_LOD_STEPS = 8
/** Past the glass: half the surround box + margin, or the volume bleeds indoors. */
const WEATHER_OUTDOOR_CLEARANCE = Math.max(WEATHER_BOX.x, WEATHER_BOX.z) * 0.5 + 10
const FOG_BOX = 24
const FOG_FOLLOW_Y = 0.8

interface WeatherRig {
  root: Entity
  emitters: Entity[]
  sphere: Entity
}

interface ShellSize {
  radius: number
  top: number
  bottom: number
}

const state: AdminFxState = {
  rain: 'off',
  snow: 'off',
  fog: 'off',
  sky: 'off',
  dayNight: 'default',
  blackout: false,
  overlay: 'off',
  shaking: false,
  flashAlpha: 0
}
let initialized = false
let refreshUi: () => void = () => {}

let rainRig: WeatherRig | null = null
let snowRig: WeatherRig | null = null
let weatherLodApplied = -1
let weatherIndoorApplied: boolean | null = null
let weatherFlashIn = 10
let fogEntity: Entity | null = null
let burstEntity: Entity | null = null
let burstRemaining = 0
let skyRoot: Entity | null = null
const skyPanels: Entity[] = []
let skyYaw = 0
let blackoutRoot: Entity | null = null
const blackoutPanels: Entity[] = []
let blackoutSpot: Entity | null = null

let cameraRig: Entity | null = null
let lightningLight: Entity | null = null
let lightningRemaining = 0
let lightningLit = false
let shakeDuration = 0
let shakeRemaining = 0
let shakeStrength = 0
let cameraBasePosition = Vector3.Zero()
let cameraBaseRotation = Quaternion.Identity()
let shockDiscs: Entity[] = []
/** Camera-free shock wave (playWorldShockwave) — independent of state.shaking. */
let scrapWaveRemaining = 0
let scrapWaveDuration = 0
let dustEntity: Entity | null = null
/** Seconds left before a reaction climax clears its vignette. */
let climaxVignetteRemaining = 0
/** True while the climax owns the vignette (don't clear a host-lab toggle early). */
let climaxOwnsVignette = false

export function setAdminFxUiRefresh(fn: () => void): void {
  refreshUi = fn
}

export function getAdminFxState(): Readonly<AdminFxState> {
  return state
}

function parcelExtents(): { width: number; depth: number; groundY: number } {
  const ctx = getRuntimeContext()
  const width = Math.max(16, (ctx?.scene.cols ?? 1) * 16)
  const depth = Math.max(16, (ctx?.scene.rows ?? 1) * 16)
  const groundY = ctx?.floors.find((floor) => floor.floor === 0)?.y ?? ctx?.modelOrigin?.y ?? 0
  return { width, depth, groundY }
}

function sceneCenter(): { x: number; y: number; z: number } {
  const { width, depth, groundY } = parcelExtents()
  return { x: width / 2, y: groundY, z: depth / 2 }
}

/** Where the local player is standing — every follow effect is anchored here. */
function playerPoint(): { x: number; y: number; z: number } {
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (player) return { x: player.position.x, y: player.position.y, z: player.position.z }
  const camera = Transform.getOrNull(engine.CameraEntity)
  if (camera) return { x: camera.position.x, y: camera.position.y - 1.6, z: camera.position.z }
  return sceneCenter()
}

function effectCenter(): { x: number; y: number; z: number; radius: number } {
  const zone = danceSupportZone() ?? danceFloorZone()
  if (zone) {
    const center = zoneCenterScene(zone)
    return { ...center, radius: zoneRadius(zone) }
  }
  const center = sceneCenter()
  const { width, depth } = parcelExtents()
  return { ...center, radius: Math.min(width, depth) * 0.35 }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function cameraPull(): number {
  const camera = Transform.getOrNull(engine.CameraEntity)
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (!camera || !player) return 0
  return Math.hypot(
    camera.position.x - player.position.x,
    camera.position.y - (player.position.y + 1.5),
    camera.position.z - player.position.z
  )
}

/** 0 = first-person eyes, 1 = furthest Explorer / free camera. */
function weatherLodT(): number {
  return Math.min(1, Math.max(0, (cameraPull() - WEATHER_FP_PULL) / (WEATHER_FAR_PULL - WEATHER_FP_PULL)))
}

function weatherLodBucket(): number {
  return Math.round(weatherLodT() * (WEATHER_LOD_STEPS - 1))
}

function cameraLookXZ(): { x: number; z: number } {
  const camera = Transform.getOrNull(engine.CameraEntity)
  if (!camera) return { x: 0, z: 1 }
  const fwd = Vector3.rotate(Vector3.Forward(), camera.rotation)
  const len = Math.hypot(fwd.x, fwd.z)
  if (len < 0.18) return { x: 0, z: 1 }
  return { x: fwd.x / len, z: fwd.z / len }
}

function outlineCentroid(outline: ReadonlyArray<{ x: number; z: number }>): { x: number; z: number } {
  let x = 0
  let z = 0
  for (const p of outline) {
    x += p.x
    z += p.z
  }
  const n = Math.max(1, outline.length)
  return { x: x / n, z: z / n }
}

function shelteredPlan(x: number, y: number, z: number): BuildingFloorPlan | null {
  const ctx = getRuntimeContext()
  const plan = buildingAtPosition(ctx?.floorDirectories ?? [], x, y, z)
  if (plan) {
    const roof = plan.stops.find((stop) => stop.level === 'roof')
    if (roof && y >= roof.y - 0.35) return null
    return plan
  }
  for (const raw of ctx?.buildingOutlines ?? []) {
    const outline = (raw.points ?? []).map((p) => ({ x: p.x * 16, z: p.y * 16 }))
    if (outline.length < 3) continue
    const top = raw.heightM ?? 48
    if (y < -1 || y > top - 0.6) continue
    if (insideFloorPlanXZ(x, z, outline)) {
      return { buildingId: raw.id, outline, baseY: 0, topY: top, stops: [] }
    }
  }
  return null
}

function pushOutsideGlass(
  x: number,
  z: number,
  outline: ReadonlyArray<{ x: number; z: number }>
): { x: number; z: number } {
  let look = cameraLookXZ()
  if (!insideFloorPlanXZ(x + look.x * 1.2, z + look.z * 1.2, outline, 0)) {
    const c = outlineCentroid(outline)
    const ox = x - c.x
    const oz = z - c.z
    const len = Math.hypot(ox, oz)
    look = len > 0.05 ? { x: ox / len, z: oz / len } : look
  }
  let px = x
  let pz = z
  for (let i = 0; i < 90; i++) {
    if (!insideFloorPlanXZ(px, pz, outline, 0)) break
    px += look.x * 0.65
    pz += look.z * 0.65
  }
  const extra = WEATHER_OUTDOOR_CLEARANCE
  return { x: px + look.x * extra, z: pz + look.z * extra }
}

/** First-person: on the eyes. Pulled-back: on the avatar. Indoor: just outside the glass. */
function weatherAnchor(): { x: number; y: number; z: number } {
  const player = playerPoint()
  const camera = Transform.getOrNull(engine.CameraEntity)
  const plan = shelteredPlan(player.x, player.y, player.z)
  if (plan) {
    const outside = pushOutsideGlass(player.x, player.z, plan.outline)
    return { x: outside.x, y: player.y + 2.2, z: outside.z }
  }
  if (weatherLodT() < 0.12 && camera) {
    return { x: camera.position.x, y: camera.position.y, z: camera.position.z }
  }
  return { x: player.x, y: player.y + 1.8, z: player.z }
}

function ensureEmitter(current: Entity | null, y: number): Entity {
  if (current) return current
  const at = playerPoint()
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(at.x, at.y + y, at.z) })
  return entity
}

function stopEmitter(entity: Entity | null): void {
  if (!entity) return
  const particles = ParticleSystem.getMutableOrNull(entity)
  if (particles) particles.active = false
}

function ensureWeatherRig(current: WeatherRig | null, followY: number): WeatherRig {
  if (current) return current
  const at = weatherAnchor()
  const root = engine.addEntity()
  Transform.create(root, { position: Vector3.create(at.x, at.y + followY, at.z) })
  const emitters: Entity[] = []
  for (const yaw of WEATHER_RING_YAWS) {
    const child = engine.addEntity()
    Transform.create(child, {
      parent: root,
      position: Vector3.Zero(),
      rotation: Quaternion.fromEulerDegrees(0, yaw, 0)
    })
    emitters.push(child)
  }
  const sphere = engine.addEntity()
  Transform.create(sphere, { parent: root, position: Vector3.Zero() })
  return { root, emitters, sphere }
}

function stopWeatherRig(rig: WeatherRig | null): void {
  if (!rig) return
  for (const entity of rig.emitters) stopEmitter(entity)
  stopEmitter(rig.sphere)
}

function followWeatherRig(rig: WeatherRig, followY: number): void {
  const at = weatherAnchor()
  Transform.getMutable(rig.root).position = Vector3.create(at.x, at.y + followY, at.z)
  // Indoor curtain: keep the thin sheet parallel to the facade the player faces.
  if (weatherIndoorApplied && rig.emitters[0]) {
    const look = cameraLookXZ()
    const yaw = (Math.atan2(look.x, look.z) * 180) / Math.PI
    Transform.getMutable(rig.emitters[0]).rotation = Quaternion.fromEulerDegrees(0, yaw, 0)
  }
}

function paintRain(level: Exclude<AdminFxRainLevel, 'off'>): void {
  rainRig = ensureWeatherRig(rainRig, WEATHER_FOLLOW_Y)
  const storm = level === 'storm'
  const indoor = !!shelteredPlan(playerPoint().x, playerPoint().y, playerPoint().z)
  // Through glass: never use first-person fat drops. Far cam: tiny dense rain.
  const t = indoor ? Math.max(0.85, weatherLodT()) : weatherLodT()
  const rainShared = {
    lifetime: lerp(storm ? 2.6 : 3.2, storm ? 2.0 : 2.4, t),
    gravity: storm ? 1.25 : 0.8,
    additionalForce: Vector3.create(storm ? 5 : 1.1, storm ? -2.2 : -1.0, storm ? 2.2 : 0.4),
    initialVelocitySpeed: { start: 0, end: 0 },
    initialSize: {
      start: lerp(storm ? 0.75 : 0.48, storm ? 0.018 : 0.014, t),
      end: lerp(storm ? 1.15 : 0.85, storm ? 0.03 : 0.022, t)
    },
    sizeOverTime: { start: 1, end: 0.9 },
    initialColor: {
      start: Color4.create(0.78, 0.88, 1, storm ? 0.95 : 0.8),
      end: Color4.create(0.55, 0.72, 0.95, storm ? 0.85 : 0.7)
    },
    colorOverTime: {
      start: Color4.create(0.85, 0.92, 1, storm ? 0.95 : 0.8),
      end: Color4.create(0.55, 0.72, 0.95, 0.25)
    },
    texture: { src: TEX_RAIN },
    blendMode: PS_BLEND_ALPHA,
    faceTravelDirection: false,
    billboard: true,
    loop: true,
    prewarm: true,
    playbackState: PS_PLAYING,
    simulationSpace: PS_SPACE_WORLD
  }
  if (indoor) {
    // One thin outdoor curtain past the glass — the surround volume was bleeding
    // half a box-width back into the room.
    for (const entity of rainRig.emitters) {
      ParticleSystem.createOrReplace(entity, {
        ...rainShared,
        active: false,
        rate: 0,
        maxParticles: 1,
        shape: ParticleSystem.Shape.Box({ size: WEATHER_OUTDOOR_BOX })
      })
    }
    ParticleSystem.createOrReplace(rainRig.emitters[0]!, {
      ...rainShared,
      active: true,
      rate: storm ? 220 : 160,
      maxParticles: storm ? 700 : 520,
      shape: ParticleSystem.Shape.Box({ size: WEATHER_OUTDOOR_BOX })
    })
    ParticleSystem.createOrReplace(rainRig.sphere, {
      ...rainShared,
      active: false,
      rate: 0,
      maxParticles: 1,
      shape: ParticleSystem.Shape.Sphere({ radius: WEATHER_SPHERE_RADIUS })
    })
    return
  }
  const boxRate = lerp(storm ? 70 : 36, storm ? 150 : 120, t)
  const boxMax = lerp(storm ? 150 : 110, storm ? 180 : 160, t)
  for (const entity of rainRig.emitters) {
    ParticleSystem.createOrReplace(entity, {
      ...rainShared,
      active: true,
      rate: boxRate,
      maxParticles: boxMax,
      shape: ParticleSystem.Shape.Box({ size: WEATHER_BOX })
    })
  }
  ParticleSystem.createOrReplace(rainRig.sphere, {
    ...rainShared,
    active: true,
    rate: lerp(storm ? 80 : 40, storm ? 280 : 220, t),
    maxParticles: lerp(storm ? 220 : 140, storm ? 280 : 240, t),
    shape: ParticleSystem.Shape.Sphere({ radius: WEATHER_SPHERE_RADIUS })
  })
}

function applyRain(level: AdminFxRainLevel): void {
  if (level === 'off') {
    stopWeatherRig(rainRig)
    state.rain = 'off'
    weatherLodApplied = -1
    refreshUi()
    return
  }

  if (state.snow !== 'off') applySnow('off')
  paintRain(level)
  weatherLodApplied = weatherLodBucket()
  weatherIndoorApplied = !!shelteredPlan(playerPoint().x, playerPoint().y, playerPoint().z)
  state.rain = level
  refreshUi()
}

function paintSnow(level: Exclude<AdminFxSnowLevel, 'off'>): void {
  snowRig = ensureWeatherRig(snowRig, WEATHER_FOLLOW_Y)
  const blizzard = level === 'blizzard'
  const indoor = !!shelteredPlan(playerPoint().x, playerPoint().y, playerPoint().z)
  const t = indoor ? Math.max(0.85, weatherLodT()) : weatherLodT()
  const snowShared = {
    lifetime: blizzard ? 4.5 : 6,
    gravity: blizzard ? 0.55 : 0.22,
    additionalForce: Vector3.create(blizzard ? 7 : 0.7, blizzard ? -0.35 : -0.08, blizzard ? 3.4 : 0.45),
    initialVelocitySpeed: { start: 0, end: 0 },
    initialSize: {
      start: lerp(blizzard ? 0.12 : 0.09, 0.02, t),
      end: lerp(blizzard ? 0.22 : 0.16, 0.035, t)
    },
    sizeOverTime: { start: 1, end: 0.9 },
    initialColor: {
      start: Color4.create(1, 1, 1, blizzard ? 0.95 : 0.85),
      end: Color4.create(0.93, 0.96, 1, 0.7)
    },
    colorOverTime: {
      start: Color4.create(1, 1, 1, blizzard ? 0.95 : 0.85),
      end: Color4.create(0.88, 0.93, 1, 0.15)
    },
    texture: { src: TEX_DOT },
    blendMode: PS_BLEND_ALPHA,
    faceTravelDirection: false,
    billboard: true,
    loop: true,
    prewarm: true,
    playbackState: PS_PLAYING,
    simulationSpace: PS_SPACE_WORLD
  }
  if (indoor) {
    // One thin outdoor snow curtain past the glass.
    for (const entity of snowRig.emitters) {
      ParticleSystem.createOrReplace(entity, {
        ...snowShared,
        active: false,
        rate: 0,
        maxParticles: 1,
        shape: ParticleSystem.Shape.Box({ size: WEATHER_OUTDOOR_BOX })
      })
    }
    ParticleSystem.createOrReplace(snowRig.emitters[0]!, {
      ...snowShared,
      active: true,
      rate: blizzard ? 140 : 90,
      maxParticles: blizzard ? 480 : 320,
      shape: ParticleSystem.Shape.Box({ size: WEATHER_OUTDOOR_BOX })
    })
    ParticleSystem.createOrReplace(snowRig.sphere, {
      ...snowShared,
      active: false,
      rate: 0,
      maxParticles: 1,
      shape: ParticleSystem.Shape.Sphere({ radius: WEATHER_SPHERE_RADIUS })
    })
    return
  }
  for (const entity of snowRig.emitters) {
    ParticleSystem.createOrReplace(entity, {
      ...snowShared,
      active: true,
      rate: blizzard ? 70 : 32,
      maxParticles: blizzard ? 150 : 100,
      shape: ParticleSystem.Shape.Box({ size: WEATHER_BOX })
    })
  }
  ParticleSystem.createOrReplace(snowRig.sphere, {
    ...snowShared,
    active: true,
    rate: blizzard ? 80 : 36,
    maxParticles: blizzard ? 220 : 130,
    shape: ParticleSystem.Shape.Sphere({ radius: WEATHER_SPHERE_RADIUS })
  })
}

function applySnow(level: AdminFxSnowLevel): void {
  if (level === 'off') {
    stopWeatherRig(snowRig)
    state.snow = 'off'
    weatherLodApplied = -1
    refreshUi()
    return
  }

  if (state.rain !== 'off') applyRain('off')
  paintSnow(level)
  weatherLodApplied = weatherLodBucket()
  weatherIndoorApplied = !!shelteredPlan(playerPoint().x, playerPoint().y, playerPoint().z)
  state.snow = level
  refreshUi()
}

function applyFog(level: AdminFxFogLevel): void {
  if (level === 'off') {
    stopEmitter(fogEntity)
    state.fog = 'off'
    refreshUi()
    return
  }

  fogEntity = ensureEmitter(fogEntity, FOG_FOLLOW_Y)
  const dense = level === 'dense'
  // Few, large, very transparent puffs drifting slowly at knee height. The soft
  // sprite is what stops these reading as squares; the low alpha is what stops
  // a dozen overlapping puffs turning into a white wall.
  ParticleSystem.createOrReplace(fogEntity, {
    active: true,
    rate: dense ? 34 : 15,
    maxParticles: dense ? 320 : 150,
    lifetime: 10,
    gravity: 0,
    additionalForce: Vector3.create(0.3, 0.015, 0.18),
    initialVelocitySpeed: { start: 0, end: 0.08 },
    initialSize: { start: 2.4, end: 4 },
    sizeOverTime: { start: 0.65, end: 1.3 },
    initialColor: {
      start: Color4.create(0.78, 0.82, 0.9, 0),
      end: Color4.create(0.72, 0.77, 0.86, 0)
    },
    colorOverTime: {
      start: Color4.create(0.8, 0.84, 0.92, dense ? 0.2 : 0.1),
      end: Color4.create(0.68, 0.73, 0.82, 0)
    },
    texture: { src: TEX_SMOKE },
    blendMode: PS_BLEND_ALPHA,
    billboard: true,
    loop: true,
    prewarm: true,
    playbackState: PS_PLAYING,
    simulationSpace: PS_SPACE_WORLD,
    shape: ParticleSystem.Shape.Box({ size: Vector3.create(FOG_BOX, 2.5, FOG_BOX) })
  })
  state.fog = level
  refreshUi()
}

function makeShellPanel(
  parent: Entity,
  bucket: Entity[],
  position: ReturnType<typeof Vector3.create>,
  scale: ReturnType<typeof Vector3.create>,
  rotation = Quaternion.Identity()
): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { parent, position, scale, rotation })
  MeshRenderer.setPlane(entity)
  bucket.push(entity)
  return entity
}

/** Inward-facing box centred on the shell root: 4 walls, a ceiling, and a floor. */
function buildShell(root: Entity, bucket: Entity[], size: ShellSize): void {
  const span = size.radius * 2 * SKY_PANEL_OVERLAP
  const wallHeight = (size.top + size.bottom) * SKY_PANEL_OVERLAP
  const wallY = (size.top - size.bottom) / 2

  makeShellPanel(root, bucket, Vector3.create(0, wallY, size.radius), Vector3.create(span, wallHeight, 1), Quaternion.fromEulerDegrees(0, 180, 0))
  makeShellPanel(root, bucket, Vector3.create(0, wallY, -size.radius), Vector3.create(span, wallHeight, 1))
  makeShellPanel(root, bucket, Vector3.create(size.radius, wallY, 0), Vector3.create(span, wallHeight, 1), Quaternion.fromEulerDegrees(0, -90, 0))
  makeShellPanel(root, bucket, Vector3.create(-size.radius, wallY, 0), Vector3.create(span, wallHeight, 1), Quaternion.fromEulerDegrees(0, 90, 0))
  makeShellPanel(root, bucket, Vector3.create(0, size.top, 0), Vector3.create(span, span, 1), Quaternion.fromEulerDegrees(90, 0, 0))
  makeShellPanel(root, bucket, Vector3.create(0, -size.bottom, 0), Vector3.create(span, span, 1), Quaternion.fromEulerDegrees(-90, 0, 0))
}

/**
 * Shell placement. X/Z track the player so they can never walk out of the side.
 * The ceiling already clears every launch pad, so the vertical lift is only a
 * backstop for a plot with unusually tall traversal: it engages near the top of
 * the shell and guarantees the sky stays overhead no matter how high you get.
 */
function shellPosition(size: ShellSize): ReturnType<typeof Vector3.create> {
  const at = playerPoint()
  const { groundY } = parcelExtents()
  const lift = Math.max(0, at.y - (groundY + size.top * 0.85))
  return Vector3.create(at.x, groundY + lift, at.z)
}

function destroySkyShell(): void {
  for (const panel of skyPanels) engine.removeEntity(panel)
  skyPanels.length = 0
  if (skyRoot) {
    engine.removeEntity(skyRoot)
    skyRoot = null
  }
  skyYaw = 0
}

function skySize(): ShellSize {
  return { radius: SKY_RADIUS, top: SKY_TOP, bottom: SKY_BOTTOM }
}

function applySky(preset: AdminFxSkyPreset): void {
  if (preset === 'off') {
    if (skyRoot) VisibilityComponent.getMutable(skyRoot).visible = false
    state.sky = 'off'
    refreshUi()
    return
  }

  destroySkyShell()
  const size = skySize()
  skyRoot = engine.addEntity()
  Transform.create(skyRoot, { position: shellPosition(size), rotation: Quaternion.Identity() })
  VisibilityComponent.create(skyRoot, { visible: false, propagateToChildren: true })
  buildShell(skyRoot, skyPanels, size)

  const texture = Material.Texture.Common({
    src: SKY_TEXTURES[preset],
    wrapMode: TextureWrapMode.TWM_MIRROR,
    filterMode: TextureFilterMode.TFM_TRILINEAR
  })
  for (const panel of skyPanels) {
    Material.setBasicMaterial(panel, {
      diffuseColor: Color4.White(),
      texture,
      castShadows: false
    })
  }
  VisibilityComponent.getMutable(skyRoot).visible = true
  state.sky = preset
  refreshUi()
}

function destroyBlackoutShell(): void {
  for (const panel of blackoutPanels) engine.removeEntity(panel)
  blackoutPanels.length = 0
  if (blackoutRoot) {
    engine.removeEntity(blackoutRoot)
    blackoutRoot = null
  }
}

function blackoutSize(): ShellSize {
  return { radius: BLACKOUT_RADIUS, top: BLACKOUT_TOP, bottom: BLACKOUT_BOTTOM }
}

function applyBlackout(active: boolean): void {
  setClubFxBlackout(active)
  if (!active) {
    if (blackoutRoot) VisibilityComponent.getMutable(blackoutRoot).visible = false
    if (blackoutSpot) {
      const light = LightSource.getMutableOrNull(blackoutSpot)
      if (light) light.active = false
    }
    state.blackout = false
    refreshUi()
    return
  }

  destroyBlackoutShell()
  const size = blackoutSize()
  blackoutRoot = engine.addEntity()
  Transform.create(blackoutRoot, { position: shellPosition(size) })
  VisibilityComponent.create(blackoutRoot, { visible: true, propagateToChildren: true })
  buildShell(blackoutRoot, blackoutPanels, size)
  for (const panel of blackoutPanels) {
    Material.setBasicMaterial(panel, {
      diffuseColor: Color4.create(0.004, 0.004, 0.008, 1),
      castShadows: false
    })
  }

  // The club sweep only runs during a show, so blackout owns its own hero beam.
  // Without it "blackout" is just a dark screen with nothing to look at.
  const center = effectCenter()
  if (!blackoutSpot) blackoutSpot = engine.addEntity()
  Transform.createOrReplace(blackoutSpot, {
    position: Vector3.create(center.x, center.y + 12, center.z),
    rotation: Quaternion.fromEulerDegrees(90, 0, 0)
  })
  LightSource.createOrReplace(blackoutSpot, {
    active: true,
    color: Color3.create(1, 0.97, 0.9),
    intensity: 90000,
    range: 45,
    shadow: false,
    type: LightSource.Type.Spot({ innerAngle: 12, outerAngle: 34 })
  })

  state.blackout = true
  refreshUi()
}

/**
 * Published atmosphere → fixed seconds-of-day, or null when the scene intentionally
 * leaves DCL's day/night cycle alone (`timeOfDay: "default"`).
 *
 * IMPORTANT: unlocking the cycle (deleting SkyboxTime) makes Explorer draw its
 * native skybox clock in the top-left ("0:56"). Venue publishes that chose night /
 * club / sunset must restore THAT lock on FX reset — never strip SkyboxTime.
 */
function publishedSkyboxFixedTime(): number | null {
  const tod = getSocialConfig()?.event.timeOfDay ?? getRuntimeContext()?.social?.event.timeOfDay
  if (tod === 'club' || tod === 'night') return 0
  if (tod === 'sunset') return 68400
  return null
}

function applyDayNight(preset: AdminFxDayNight): void {
  if (preset === 'default') {
    const published = publishedSkyboxFixedTime()
    if (published === null) {
      if (SkyboxTime.getOrNull(engine.RootEntity)) {
        SkyboxTime.deleteFrom(engine.RootEntity)
      }
    } else {
      SkyboxTime.createOrReplace(engine.RootEntity, { fixedTime: published })
    }
    state.dayNight = 'default'
    refreshUi()
    return
  }
  SkyboxTime.createOrReplace(engine.RootEntity, {
    fixedTime: DAY_NIGHT_SECONDS[preset]
  })
  state.dayNight = preset
  refreshUi()
}

const LIGHTNING_DURATION = 1.2
/** Strike windows within the sequence: [start, end] seconds. Three-flash crack. */
const LIGHTNING_STRIKES: Array<[number, number]> = [
  [0, 0.07],
  [0.13, 0.19],
  [0.34, 0.52]
]

function lightningIsLitAt(elapsed: number): boolean {
  for (const [from, to] of LIGHTNING_STRIKES) {
    if (elapsed >= from && elapsed <= to) return true
  }
  return false
}

function setLightningLit(lit: boolean): void {
  if (lit === lightningLit) return
  lightningLit = lit
  if (!lightningLight) return
  const light = LightSource.getMutableOrNull(lightningLight)
  if (light) {
    light.active = lit
    light.intensity = lit ? 400000 : 0
  }
}

function stopLightning(): void {
  lightningRemaining = 0
  lightningLit = true
  setLightningLit(false)
  restoreSkyTexture()
}

function triggerLightning(opts?: { thunder?: boolean }): void {
  const at = playerPoint()
  const position = Vector3.create(at.x, at.y + 30, at.z)
  if (!lightningLight) {
    lightningLight = engine.addEntity()
    Transform.create(lightningLight, { position })
  } else {
    Transform.getMutable(lightningLight).position = position
  }
  LightSource.createOrReplace(lightningLight, {
    active: true,
    color: Color3.create(0.88, 0.94, 1),
    intensity: 400000,
    range: 160,
    shadow: false,
    type: LightSource.Type.Point({})
  })
  lightningLit = true
  lightningRemaining = LIGHTNING_DURATION
  state.flashAlpha = Math.max(state.flashAlpha, opts?.thunder === false ? 0.55 : 0.9)
  // Crowd/reaction audio is globally quarantined. Lightning remains visual.
  washSkyWhite()
  refreshUi()
}

function washSkyWhite(): void {
  if (state.sky === 'off') return
  for (const panel of skyPanels) {
    Material.setBasicMaterial(panel, {
      diffuseColor: Color4.create(0.95, 0.98, 1, 1),
      castShadows: false
    })
  }
}

function restoreSkyTexture(): void {
  if (state.sky === 'off') return
  const texture = Material.Texture.Common({
    src: SKY_TEXTURES[state.sky],
    wrapMode: TextureWrapMode.TWM_MIRROR,
    filterMode: TextureFilterMode.TFM_TRILINEAR
  })
  for (const panel of skyPanels) {
    Material.setBasicMaterial(panel, {
      diffuseColor: Color4.White(),
      texture,
      castShadows: false
    })
  }
}

interface BurstConfig {
  count: number
  lifetime: number
  gravity: number
  force: ReturnType<typeof Vector3.create>
  size: { start: number; end: number }
  color: Color4
  endColor: Color4
  angle: number
  radius: number
  speed: { start: number; end: number }
  additive: boolean
}

const BURSTS: Record<AdminFxBurstKind, BurstConfig> = {
  confetti: {
    count: 260,
    lifetime: 3.2,
    gravity: 0.9,
    force: Vector3.create(0.6, 0, 0.3),
    size: { start: 0.22, end: 0.36 },
    color: Color4.create(1, 0.35, 0.7, 1),
    endColor: Color4.create(0.25, 0.85, 1, 0.9),
    angle: 42,
    radius: 0.8,
    speed: { start: 7, end: 12 },
    additive: false
  },
  sparks: {
    count: 220,
    lifetime: 1.6,
    gravity: 1.6,
    force: Vector3.create(0, 0, 0),
    size: { start: 0.14, end: 0.24 },
    color: Color4.create(1, 0.9, 0.45, 1),
    endColor: Color4.create(1, 0.35, 0.05, 1),
    angle: 55,
    radius: 0.4,
    speed: { start: 9, end: 16 },
    additive: true
  },
  ash: {
    count: 200,
    lifetime: 5,
    gravity: 0.18,
    force: Vector3.create(1.4, 0.4, 0.7),
    size: { start: 0.18, end: 0.34 },
    color: Color4.create(0.4, 0.37, 0.34, 0.9),
    endColor: Color4.create(0.22, 0.2, 0.18, 0.5),
    angle: 72,
    radius: 2.4,
    speed: { start: 2, end: 5 },
    additive: false
  },
  fire: {
    count: 180,
    lifetime: 1.8,
    // Negative multiplier = rise (flames). Positive would slam them into the floor.
    gravity: -0.85,
    force: Vector3.create(0, 3.5, 0),
    size: { start: 0.55, end: 1.1 },
    color: Color4.create(1, 0.6, 0.12, 1),
    endColor: Color4.create(1, 0.12, 0.02, 1),
    angle: 22,
    radius: 0.7,
    speed: { start: 4, end: 8 },
    additive: true
  }
}

/**
 * One-shot bursts fire a few metres in FRONT of the player, at their feet —
 * emitting at the dance-floor centre meant a host standing anywhere else saw
 * nothing at all. A fresh entity per press guarantees the burst replays even
 * when the same button is hit twice.
 */
function triggerBurst(style: AdminFxBurstKind): void {
  if (burstEntity) {
    engine.removeEntity(burstEntity)
    burstEntity = null
  }
  const at = playerPoint()
  const camera = Transform.getOrNull(engine.CameraEntity)
  const forward = camera ? Vector3.rotate(Vector3.Forward(), camera.rotation) : Vector3.Forward()
  const flat = Math.hypot(forward.x, forward.z) || 1
  const position = Vector3.create(at.x + (forward.x / flat) * 3, at.y + 0.4, at.z + (forward.z / flat) * 3)

  const c = BURSTS[style]
  burstEntity = engine.addEntity()
  Transform.create(burstEntity, { position })
  ParticleSystem.create(burstEntity, {
    active: true,
    rate: 0,
    maxParticles: c.count + 60,
    lifetime: c.lifetime,
    gravity: c.gravity,
    additionalForce: c.force,
    initialSize: c.size,
    sizeOverTime: { start: 1, end: style === 'fire' ? 0.25 : 0.7 },
    initialVelocitySpeed: c.speed,
    initialColor: { start: c.color, end: c.endColor },
    colorOverTime: { start: c.color, end: Color4.create(c.endColor.r, c.endColor.g, c.endColor.b, 0) },
    texture: { src: TEX_DOT },
    blendMode: c.additive ? PS_BLEND_ADD : PS_BLEND_ALPHA,
    billboard: true,
    loop: false,
    playbackState: PS_PLAYING,
    simulationSpace: PS_SPACE_WORLD,
    shape: ParticleSystem.Shape.Cone({ angle: c.angle, radius: c.radius }),
    bursts: { values: [{ time: 0, count: c.count, cycles: 1 }] }
  })
  burstRemaining = c.lifetime + 1

  refreshUi()
}

function applyOverlay(mode: AdminFxOverlayMode): void {
  state.overlay = mode
  refreshUi()
}

function triggerFlash(): void {
  state.flashAlpha = 1
  refreshUi()
}

const CLIMAX_VIGNETTE_S = 2.6

/**
 * Host-steered spectacle hit (Host → Frenzy / Big cheer). Automatic dance
 * moves never call this — crowd hands/audio/speech belong to Breakdance; world
 * FX belongs to Host or FX Lab.
 *
 * intensity ≥ 4: vignette + heavy shake + flash + fire
 * intensity ≥ 3: flash only (Big cheer)
 */
export function playSpectacleClimax(intensity: number): void {
  if (intensity >= 4) {
    applyOverlay('vignette')
    climaxOwnsVignette = true
    climaxVignetteRemaining = CLIMAX_VIGNETTE_S
    startGroundShake('heavy')
    triggerFlash()
    triggerBurst('fire')
    refreshUi()
    return
  }
  if (intensity >= 3) {
    triggerFlash()
    refreshUi()
  }
}

/** Move-mapped spectacle — shake/fire only for tagged power moves or a pinnacle streak. */
export function playMoveSpectacle(kind: 'none' | 'flash' | 'shake' | 'climax'): void {
  if (kind === 'none') return
  if (kind === 'flash') {
    triggerFlash()
    refreshUi()
    return
  }
  if (kind === 'shake') {
    startGroundShake('light')
    triggerFlash()
    refreshUi()
    return
  }
  playSpectacleClimax(4)
}

/** Bounded gameplay camera impulse. Never replaces another feature's camera. */
/**
 * ‼️THE SHAKE'S OWN VIRTUAL CAMERA, NAMED SO THE PUNCH CAN TAKE IT BACK.
 *
 * `startGroundShake` installs `cameraRig` as the MainCamera for the length of
 * the shake. Any other feature reading "is a virtual camera up?" sees it and
 * stands down — which is how the punch machine's behind-the-back shot came to
 * "fluctuate" (owner, 2026-09-07): a punch's own kick took the slot, and the
 * next charge found it occupied. The punch camera outranks a shake, so it is
 * given a way to say so rather than a rule to guess with.
 */
export function fxShakeCameraEntity(): Entity | null {
  return cameraRig;
}

/** Hand the camera back if — and only if — the shake is the one holding it. */
export function releaseFxShakeCamera(): boolean {
  if (!cameraRig) return false;
  if (MainCamera.getOrNull(engine.CameraEntity)?.virtualCameraEntity !== cameraRig) return false;
  stopShake();
  return true;
}

export function playPunchCameraImpulse(gain: number): void {
  if (gain <= 0 || MainCamera.getOrNull(engine.CameraEntity)?.virtualCameraEntity !== undefined) return
  startGroundShake('light')
  // ‼️THREE TIMES THE OLD CEILING, AND LONGER WITH IT. At gain 1 this was a
  // 0.42 s wobble at 0.14 — the owner's reading across an eight-punch streak
  // was that the screen shake "is just not active". The punch floor now
  // sends a gain that grows with score and streak, up to 3; the shake grows
  // with it instead of clamping at the first rung.
  const kick = Math.min(3, Math.max(0, gain))
  shakeDuration = 0.42 + 0.12 * kick
  shakeRemaining = shakeDuration
  shakeStrength = kick * 0.14
  // The punch owns its particles; the camera API must not add a second burst at the visitor.
  for (const disc of shockDiscs) VisibilityComponent.getMutable(disc).visible = false
  if (dustEntity) ParticleSystem.deleteFrom(dustEntity)
}
function ensureShockwave(): void {
  if (shockDiscs.length) return
  const center = effectCenter()
  for (let i = 0; i < 3; i++) {
    const disc = engine.addEntity()
    Transform.create(disc, {
      position: Vector3.create(center.x, center.y + 0.025 + i * 0.004, center.z),
      scale: Vector3.create(0.01, 0.008, 0.01)
    })
    MeshRenderer.setCylinder(disc, 0.5, 0.5)
    VisibilityComponent.create(disc, { visible: false })
    shockDiscs.push(disc)
  }

  dustEntity = engine.addEntity()
  Transform.create(dustEntity, {
    position: Vector3.create(center.x, center.y + 0.05, center.z)
  })
}

/**
 * Hand the camera back to the player. FX only ever clears a camera it OWNS: if
 * another system (the claw machine, a launch pad) has taken over since the shake
 * started, stomping it to undefined would yank that experience out from under
 * the player.
 */
function forceReleaseCamera(): void {
  if (!cameraRig) {
    MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: undefined })
    return
  }
  const current = MainCamera.getOrNull(engine.CameraEntity)?.virtualCameraEntity
  if (current === cameraRig || current === undefined) {
    MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: undefined })
  }
}

function stopShake(): void {
  if (!state.shaking && shakeRemaining <= 0) {
    if (cameraRig) {
      const current = MainCamera.getOrNull(engine.CameraEntity)?.virtualCameraEntity
      if (current === cameraRig) forceReleaseCamera()
    }
    return
  }
  state.shaking = false
  shakeRemaining = 0
  forceReleaseCamera()
  for (const disc of shockDiscs) {
    const visibility = VisibilityComponent.getMutableOrNull(disc)
    if (visibility) visibility.visible = false
  }
  refreshUi()
}

function startGroundShake(intensity: 'light' | 'heavy'): void {
  if (state.shaking) stopShake()
  ensureShockwave()
  const camera = Transform.getOrNull(engine.CameraEntity)
  if (!camera) return
  const strong = intensity === 'heavy'
  shakeDuration = strong ? 1.5 : 0.85
  shakeRemaining = shakeDuration
  shakeStrength = strong ? 0.2 : 0.09
  state.shaking = true

  cameraBasePosition = Vector3.create(camera.position.x, camera.position.y, camera.position.z)
  cameraBaseRotation = Quaternion.create(
    camera.rotation.x,
    camera.rotation.y,
    camera.rotation.z,
    camera.rotation.w
  )
  if (!cameraRig) {
    cameraRig = engine.addEntity()
    VirtualCamera.create(cameraRig, {
      defaultTransition: { transitionMode: VirtualCamera.Transition.Time(0.03) }
    })
  }
  Transform.createOrReplace(cameraRig, {
    position: cameraBasePosition,
    rotation: cameraBaseRotation
  })
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: cameraRig })

  for (const disc of shockDiscs) VisibilityComponent.getMutable(disc).visible = true
  const center = effectCenter()
  if (dustEntity) {
    ParticleSystem.createOrReplace(dustEntity, {
      active: true,
      rate: 0,
      maxParticles: strong ? 220 : 100,
      lifetime: strong ? 1.7 : 1.1,
      // Negative multiplier = loft the dust up off the floor.
      gravity: -0.35,
      additionalForce: Vector3.create(0, strong ? 2.4 : 1.5, 0),
      initialSize: { start: 0.35, end: 0.7 },
      sizeOverTime: { start: 0.8, end: 2.4 },
      initialVelocitySpeed: { start: 1.1, end: strong ? 3.2 : 2.1 },
      initialColor: {
        start: Color4.create(0.7, 0.62, 0.5, 0.58),
        end: Color4.create(0.42, 0.36, 0.3, 0.25)
      },
      colorOverTime: {
        start: Color4.create(0.75, 0.68, 0.58, 0.5),
        end: Color4.create(0.4, 0.35, 0.3, 0)
      },
      texture: { src: TEX_SMOKE },
      blendMode: PS_BLEND_ALPHA,
      billboard: true,
      loop: false,
      playbackState: PS_PLAYING,
      simulationSpace: PS_SPACE_WORLD,
      shape: ParticleSystem.Shape.Cone({ angle: 72, radius: Math.max(1.5, center.radius * 0.7) }),
      bursts: { values: [{ time: 0, count: strong ? 180 : 80, cycles: 1 }] }
    })
  }
  refreshUi()
}

function resetAll(): void {
  state.shaking = false
  shakeRemaining = 0
  state.flashAlpha = 0
  forceReleaseCamera()
  for (const disc of shockDiscs) {
    const visibility = VisibilityComponent.getMutableOrNull(disc)
    if (visibility) visibility.visible = false
  }
  stopLightning()
  climaxVignetteRemaining = 0
  climaxOwnsVignette = false
  if (burstEntity) {
    engine.removeEntity(burstEntity)
    burstEntity = null
    burstRemaining = 0
  }
  applyRain('off')
  applySnow('off')
  applyFog('off')
  applySky('off')
  applyBlackout(false)
  applyDayNight('default')
  applyOverlay('off')
  refreshUi()
}

function applyCommand(command: AdminFxCommand): void {
  switch (command.kind) {
    case 'ground_shake':
      startGroundShake(command.intensity)
      break
    case 'rain':
      applyRain(command.level)
      break
    case 'sky':
      applySky(command.preset)
      break
    case 'snow':
      applySnow(command.level)
      break
    case 'fog':
      applyFog(command.level)
      break
    case 'day_night':
      applyDayNight(command.preset)
      break
    case 'lightning':
      triggerLightning()
      break
    case 'blackout':
      applyBlackout(command.active)
      break
    case 'burst':
      triggerBurst(command.style)
      break
    case 'overlay':
      applyOverlay(command.mode)
      break
    case 'flash':
      triggerFlash()
      break
    case 'reset':
      resetAll()
      break
  }
}

function retuneWeatherIfNeeded(): void {
  if (state.rain === 'off' && state.snow === 'off') return
  const bucket = weatherLodBucket()
  const indoor = !!shelteredPlan(playerPoint().x, playerPoint().y, playerPoint().z)
  if (bucket === weatherLodApplied && indoor === weatherIndoorApplied) return
  weatherLodApplied = bucket
  weatherIndoorApplied = indoor
  if (state.rain !== 'off') paintRain(state.rain)
  if (state.snow !== 'off') paintSnow(state.snow)
}

function tickWeatherFlash(dt: number): void {
  const stormy = state.rain === 'storm' || state.snow === 'blizzard'
  const flashing = state.rain !== 'off' || state.snow === 'blizzard'
  if (!flashing) {
    weatherFlashIn = 10
    return
  }
  weatherFlashIn -= dt
  if (weatherFlashIn > 0 || lightningRemaining > 0) return
  weatherFlashIn = stormy ? 7 + Math.random() * 9 : 14 + Math.random() * 14
  triggerLightning({ thunder: false })
}

/** Weather volumes and shells ride along with the player every frame. */
function followPlayer(): void {
  retuneWeatherIfNeeded()
  if (state.rain !== 'off' && rainRig) followWeatherRig(rainRig, WEATHER_FOLLOW_Y)
  if (state.snow !== 'off' && snowRig) followWeatherRig(snowRig, WEATHER_FOLLOW_Y)
  if (state.fog !== 'off' && fogEntity) {
    const at = weatherAnchor()
    Transform.getMutable(fogEntity).position = Vector3.create(at.x, at.y + FOG_FOLLOW_Y, at.z)
  }
  if (state.blackout && blackoutRoot) {
    Transform.getMutable(blackoutRoot).position = shellPosition(blackoutSize())
  }
}

function fxSystem(dt: number): void {
  followPlayer()
  tickWeatherFlash(dt)

  if (state.sky !== 'off' && skyRoot) {
    const speed = state.sky === 'portal' ? 1.35 : state.sky === 'aurora' ? 0.16 : 0.35
    skyYaw = (skyYaw + dt * speed) % 360
    const tf = Transform.getMutable(skyRoot)
    tf.position = shellPosition(skySize())
    tf.rotation = Quaternion.fromEulerDegrees(0, skyYaw, 0)
  }

  if (state.flashAlpha > 0) {
    state.flashAlpha = Math.max(0, state.flashAlpha - dt * 2.8)
    refreshUi()
  }

  if (climaxVignetteRemaining > 0) {
    climaxVignetteRemaining -= dt
    if (climaxVignetteRemaining <= 0) {
      climaxVignetteRemaining = 0
      if (climaxOwnsVignette) {
        climaxOwnsVignette = false
        applyOverlay('off')
      }
    }
  }

  if (lightningRemaining > 0) {
    lightningRemaining -= dt
    const elapsed = LIGHTNING_DURATION - lightningRemaining
    if (lightningRemaining <= 0) {
      stopLightning()
    } else {
      const lit = lightningIsLitAt(elapsed)
      setLightningLit(lit)
      if (lit) state.flashAlpha = Math.max(state.flashAlpha, 0.45)
      if (!lit) restoreSkyTexture()
      else washSkyWhite()
    }
  }

  if (burstRemaining > 0) {
    burstRemaining -= dt
    if (burstRemaining <= 0 && burstEntity) {
      engine.removeEntity(burstEntity)
      burstEntity = null
    }
  }

  tickWorldShockwave(dt)

  if (!state.shaking && cameraRig) {
    const current = MainCamera.getOrNull(engine.CameraEntity)?.virtualCameraEntity
    if (current === cameraRig) forceReleaseCamera()
  }

  if (!state.shaking || !cameraRig) return
  shakeRemaining -= dt
  if (shakeRemaining <= 0) {
    stopShake()
    return
  }

  const elapsed = shakeDuration - shakeRemaining
  const envelope = Math.max(0, shakeRemaining / shakeDuration)
  const x = (Math.sin(elapsed * 71) + Math.sin(elapsed * 113) * 0.45) * shakeStrength * envelope
  const y = Math.sin(elapsed * 93) * shakeStrength * 0.55 * envelope
  const z = Math.sin(elapsed * 57 + 1.4) * shakeStrength * 0.6 * envelope
  const roll = Math.sin(elapsed * 79) * shakeStrength * 3.2 * envelope
  const pitch = Math.sin(elapsed * 61 + 0.7) * shakeStrength * 2.1 * envelope
  const tf = Transform.getMutable(cameraRig)
  tf.position = Vector3.create(
    cameraBasePosition.x + x,
    cameraBasePosition.y + y,
    cameraBasePosition.z + z
  )
  tf.rotation = Quaternion.multiply(
    cameraBaseRotation,
    Quaternion.fromEulerDegrees(pitch, 0, roll)
  )

  const progress = elapsed / shakeDuration
  for (let i = 0; i < shockDiscs.length; i++) {
    const local = Math.max(0, Math.min(1, progress * 1.55 - i * 0.16))
    const radius = 1 + local * (effectCenter().radius * 2.3 + i * 1.4)
    const discTf = Transform.getMutable(shockDiscs[i])
    discTf.scale = Vector3.create(radius, 0.008, radius)
    const alpha = Math.max(0, (1 - local) * (i === 0 ? 0.2 : 0.12))
    Material.setPbrMaterial(shockDiscs[i], {
      albedoColor: Color4.create(0.35, 0.75, 1, alpha),
      emissiveColor: Color3.create(0.2, 0.65, 1),
      emissiveIntensity: 1.2 + envelope * 2,
      metallic: 0,
      roughness: 1,
      transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
      castShadows: false
    })
  }
}

function emitAdminCommand(command: AdminFxCommand): void {
  const config = getSocialConfig()
  if (!config || !isAdmin(config)) return
  emitSocial({ type: 'host.fx', command })
}

/**
 * The FX Lab ground wave WITHOUT the camera takeover.
 *
 * `startGroundShake` binds its own VirtualCamera, which would rip the camera
 * out of a fight (or the claw machine, or a flight) mid-experience. A punch
 * landing on you wants the WORLD to jolt — expanding shock discs, dust and a
 * stomp — while whatever owns the camera keeps owning it and does its own
 * shake. Same wave, no camera.
 */
export function playWorldShockwave(strong: boolean): void {
  ensureShockwave()
  scrapWaveDuration = strong ? 1.1 : 0.7
  scrapWaveRemaining = scrapWaveDuration
  for (const disc of shockDiscs) {
    const visibility = VisibilityComponent.getMutableOrNull(disc)
    if (visibility) visibility.visible = true
  }
}

/** Drives the camera-free wave. Runs inside the FX system, below. */
function tickWorldShockwave(dt: number): void {
  if (scrapWaveRemaining <= 0) return
  scrapWaveRemaining -= dt
  if (scrapWaveRemaining <= 0) {
    scrapWaveRemaining = 0
    // Only hide the discs if the FX Lab shake is not using them right now.
    if (!state.shaking) {
      for (const disc of shockDiscs) {
        const visibility = VisibilityComponent.getMutableOrNull(disc)
        if (visibility) visibility.visible = false
      }
    }
    return
  }
  if (state.shaking) return // the full effect owns the discs
  const progress = (scrapWaveDuration - scrapWaveRemaining) / scrapWaveDuration
  const envelope = Math.max(0, scrapWaveRemaining / scrapWaveDuration)
  const center = effectCenter()
  for (let i = 0; i < shockDiscs.length; i++) {
    const local = Math.max(0, Math.min(1, progress * 1.7 - i * 0.16))
    const radius = 1 + local * (center.radius * 2 + i * 1.2)
    const discTf = Transform.getMutableOrNull(shockDiscs[i])
    if (discTf) discTf.scale = Vector3.create(radius, 0.008, radius)
    const alpha = Math.max(0, (1 - local) * (i === 0 ? 0.26 : 0.15))
    Material.setPbrMaterial(shockDiscs[i], {
      albedoColor: Color4.create(1, 0.4, 0.35, alpha),
      emissiveColor: Color3.create(1, 0.3, 0.25),
      emissiveIntensity: 1.4 + envelope * 2.4,
      metallic: 0,
      roughness: 1,
      transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
      castShadows: false
    })
  }
}

export function adminTriggerGroundShake(intensity: 'light' | 'heavy'): void {
  emitAdminCommand({ kind: 'ground_shake', intensity })
}

export function adminSetRain(level: AdminFxRainLevel): void {
  emitAdminCommand({ kind: 'rain', level })
}

export function adminSetSky(preset: AdminFxSkyPreset): void {
  emitAdminCommand({ kind: 'sky', preset })
}

export function adminSetSnow(level: AdminFxSnowLevel): void {
  emitAdminCommand({ kind: 'snow', level })
}

export function adminSetFog(level: AdminFxFogLevel): void {
  emitAdminCommand({ kind: 'fog', level })
}

export function adminSetDayNight(preset: AdminFxDayNight): void {
  emitAdminCommand({ kind: 'day_night', preset })
}

export function adminTriggerLightning(): void {
  emitAdminCommand({ kind: 'lightning' })
}

export function adminSetBlackout(active: boolean): void {
  emitAdminCommand({ kind: 'blackout', active })
}

export function adminTriggerBurst(style: AdminFxBurstKind): void {
  emitAdminCommand({ kind: 'burst', style })
}

export function adminSetOverlay(mode: AdminFxOverlayMode): void {
  emitAdminCommand({ kind: 'overlay', mode })
}

export function adminTriggerFlash(): void {
  emitAdminCommand({ kind: 'flash' })
}

export function adminResetFx(): void {
  emitAdminCommand({ kind: 'reset' })
}

export function initAdminFx(): void {
  if (initialized) return
  initialized = true
  onSocial('host.fx', (message) => applyCommand(message.command))
  engine.addSystem(fxSystem)
  console.log('[admin-fx] FX Lab ready')
}
