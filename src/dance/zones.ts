/**
 * Dance zone geometry — where is the local player relative to the dance floor
 * and support circle. Mirrors social/zone-gates.ts: zone shapes are authored in
 * composer-local coords, so scene positions map through the z-mirror
 * (shared/dcl-placement.ts) before hit-testing.
 *
 * Ring semantics: the support circle usually CONTAINS the dance floor shape
 * (a circle around a circle) — "in support" means inside the support shape but
 * NOT inside the floor shape.
 */
import { engine, Transform } from '@dcl/sdk/ecs'
import { movePlayerTo } from '~system/RestrictedActions'
import { pointInFloorZone } from '@shared/floor-zone-hit'
import { glbLocalToScene, sceneToGlbLocal } from '@shared/dcl-placement'
import { projectOutOfDiscs, type SteerDisc } from '@shared/dance-crowd-steering'
import type { DanceObstruction, NpcGroupFormation } from '@shared/dance-venue-contract'
import { npcFormationUnitPoint } from '@shared/npc-formation'
import type { RuntimeFloorZone } from '@shared/scene-runtime-config'
import { SITE_FLOOR_INDEX } from '@shared/floor-props'
import { resolveDanceRuntimeZones } from '@shared/dance-zone-resolution'
import {
  punchIslandLookLocal,
  punchIslandQueueStandLocal
} from '@shared/punch-machine-layout'
import { getRuntimeContext, getRuntimeFloorZones } from '../social/runtime-context'

/** Publish-baked no-go discs (columns, benches, statues). NPC/dancer positions
 *  are nudged out of these — characters must never stand inside mesh. */
let obstructions: DanceObstruction[] = []

/**
 * The OUTDOOR walk surface, in scene metres.
 *
 * Nothing the kit draws outdoors carries a collider: the site paving is a render-only
 * overlay (`scene/src/site-ground.ts` adds MeshRenderer and no MeshCollider), so a guest
 * standing on the plaza stands on Decentraland's own terrain at exactly 0. A character
 * placed on the plot must match the GUEST, not the paving.
 */
const PLOT_GROUND_Y = 0

/**
 * Y a character's feet sit at on a given storey.
 *
 * A SITE zone (floorIndex SITE_FLOOR_INDEX) is on the PLAZA, not on a storey. Resolving
 * it as "floor 0" handed it the building's INTERIOR slab top — `floors[0].y` is 0.2 m,
 * the site datum plus slab thickness — and stood the entire plaza crowd 20 cm in the air
 * beside a guest walking on the ground (owner in-world, 2026-08-18: "the NPCs seem to be
 * standing a lot higher... they're all floating"). The building's ground floor and the
 * plot outside it are two different surfaces and only ever agree indoors.
 */
export function floorSurfaceY(floorIndex: number): number {
  if (floorIndex === SITE_FLOOR_INDEX) return PLOT_GROUND_Y
  const ctx = getRuntimeContext()
  return (
    ctx?.floors.find((floor) => floor.floor === floorIndex)?.y ?? ctx?.modelOrigin?.y ?? PLOT_GROUND_Y
  )
}

/** Y a zone's occupants stand on — see floorSurfaceY. */
export function zoneFloorY(zone: RuntimeFloorZone): number {
  if (Number.isFinite(zone.floorY)) return Number(zone.floorY)
  return floorSurfaceY(zone.floorIndex)
}

function clearOfMesh(localX: number, localZ: number): { x: number; z: number } {
  if (!obstructions.length) return { x: localX, z: localZ }
  return projectOutOfDiscs(
    localX,
    localZ,
    obstructions.map((o) => ({ x: o.x, z: o.z, r: o.r, hx: o.hx, hz: o.hz, x2: o.x2, z2: o.z2 }))
  )
}

/** Nudge a composer-local point out of the publish-baked no-go discs. Exported
 *  so ANY teleport/placement (zone sends, NPC hangouts) can respect mesh — a
 *  character must never be planted inside a screen, bench, or column. */
export function clearOfMeshLocal(localX: number, localZ: number): { x: number; z: number } {
  return clearOfMesh(localX, localZ)
}

/** The no-go discs converted to SCENE space (radius is rigid-invariant), cached —
 *  the troupe steers every walk step against these so bots round the amphitheatre
 *  seating instead of gliding through it. */
let sceneDiscsCache: SteerDisc[] | null = null
export function obstructionDiscsScene(floorIndex?: number): SteerDisc[] {
  if (sceneDiscsCache && floorIndex === undefined) return sceneDiscsCache
  const origin = getRuntimeContext()?.modelOrigin
  if (!origin || !obstructions.length) return []
  const relevant = obstructions.filter(
    (o) => floorIndex === undefined || o.floorIndex === undefined || o.floorIndex === floorIndex
  )
  const discs = relevant.map((o) => {
    const p = glbLocalToScene(origin, o.x, o.z)
    const q =
      o.x2 != null && o.z2 != null ? glbLocalToScene(origin, o.x2, o.z2) : null
    return q
      ? { x: p.x, z: p.z, r: o.r, x2: q.x, z2: q.z }
      : { x: p.x, z: p.z, r: o.r, hx: o.hx, hz: o.hz }
  })
  if (floorIndex === undefined) sceneDiscsCache = discs
  return discs
}

/** Plot bounds in scene space (parcels × 16 m) — roaming bots stay inside. */
export function plotBoundsScene(): { maxX: number; maxZ: number } | null {
  const scene = getRuntimeContext()?.scene
  if (!scene) return null
  return { maxX: scene.cols * 16, maxZ: scene.rows * 16 }
}

/**
 * The roamable plot in GLB-local coordinates, inset 2 m from the edges.
 *
 * Lives here rather than in crowd-director because the troupe needs it too: a
 * scene-placed group picks its home with the same sampler the director roams with, and
 * `crowd-director` already imports `troupe`, so importing back would be a cycle.
 */
export function roamPlotBounds(): {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
} | null {
  const b = plotBoundsScene()
  const origin = getRuntimeContext()?.modelOrigin
  if (!b || !origin) return null
  const min = sceneToGlbLocal(origin, 2, 2)
  const max = sceneToGlbLocal(origin, b.maxX - 2, b.maxZ - 2)
  return { minX: min.x, minZ: min.z, maxX: max.x, maxZ: max.z }
}

/** A nudged scene-space point at (angle, radius) from the dance-floor centre —
 *  like floorRingPointScene but WITHOUT the support-circle clamp, for hangout
 *  spots that live OUTSIDE the gather ring. */
export function dancePointScene(
  angleRad: number,
  radius: number
): { x: number; y: number; z: number } | null {
  if (!floorZone) return null
  const clear = clearOfMesh(
    floorZone.shape.centerX + Math.cos(angleRad) * radius,
    floorZone.shape.centerZ + Math.sin(angleRad) * radius
  )
  const origin = getRuntimeContext()?.modelOrigin ?? { x: 8, y: 0, z: 8 }
  const pos = glbLocalToScene(origin, clear.x, clear.z)
  return { x: pos.x, y: zoneFloorY(floorZone), z: pos.z }
}

/**
 * A ground-level point at ABSOLUTE scene coordinates — not measured from the dance floor.
 *
 * Everything else here is dance-floor-relative, which is right for a crowd gathered around
 * a show and wrong for a crew that is supposed to inhabit the whole plot. Scene-wide
 * roaming needs to name a spot between the buildings, where no dance floor exists to be
 * relative to.
 */
export function groundPointScene(
  sceneX: number,
  sceneZ: number
): { x: number; y: number; z: number } | null {
  const ctx = getRuntimeContext()
  if (!ctx) return null
  // The PLOT, not the lobby: a roamer crossing the plaza walks on the ground outside the
  // building, so this is the site surface — never floors[0], which is the interior slab.
  return { x: sceneX, y: PLOT_GROUND_Y, z: sceneZ }
}

export interface DanceZonePresence {
  inFloor: boolean
  inSupport: boolean
  /** Composer-local XZ of the player (for push-out math). */
  localX: number
  localZ: number
}

let floorZone: RuntimeFloorZone | null = null
let supportZone: RuntimeFloorZone | null = null

/**
 * Resolve the dance set's two concentric circles: inner = dancer-only floor, outer
 * ring = crowd/queue.
 *
 * Phase 2: the dance set now lives as generic `floor_zone` components (the app syncs
 * them from `placement`), so we PREFER the authored zones referenced by
 * danceFloorZoneId / supportZoneId. We fall back to building them straight from
 * `placement` when those zones aren't present (older / un-synced configs) — same
 * numbers, so the fallback is byte-identical to the previous behaviour.
 */
export function resolveDanceSet(config: {
  placement?: {
    floorIndex: number
    centerX: number
    centerZ: number
    floorRadius: number
    gatherRadius: number
  } | null
  danceFloorZoneId: string | null
  supportZoneId: string | null
  obstructions?: DanceObstruction[]
}): boolean {
  obstructions = config.obstructions ?? []
  sceneDiscsCache = null

  // Prefer the authored generic zones — the generic infra drives the dance floor.
  const resolved = resolveDanceRuntimeZones(getRuntimeFloorZones(), config)
  if (resolved) {
    floorZone = resolved.floor
    supportZone = resolved.support
    return true
  }

  floorZone = null
  supportZone = null
  return false
}

export function danceFloorZone(): RuntimeFloorZone | null {
  return floorZone
}

export function danceSupportZone(): RuntimeFloorZone | null {
  return supportZone
}

function playerFloorIndex(y: number): number {
  const ctx = getRuntimeContext()
  if (!ctx?.floors?.length) return 0
  let best = ctx.floors[0].floor
  let bestDist = Infinity
  for (const f of ctx.floors) {
    const dist = Math.abs(y - f.y)
    if (dist < bestDist) {
      bestDist = dist
      best = f.floor
    }
  }
  return best
}

export function samplePresence(): DanceZonePresence | null {
  if (!floorZone || !supportZone) return null
  const tf = Transform.getOrNull(engine.PlayerEntity)
  if (!tf) return null
  const origin = getRuntimeContext()?.modelOrigin ?? { x: 8, y: 0, z: 8 }
  const local = sceneToGlbLocal(origin, tf.position.x, tf.position.z)
  const floor = playerFloorIndex(tf.position.y)

  const atZoneHeight = (zone: RuntimeFloorZone): boolean =>
    Number.isFinite(zone.floorY)
      ? Math.abs(tf.position.y - Number(zone.floorY)) <= 1.25
      : floor === zone.floorIndex
  const inFloorShape =
    atZoneHeight(floorZone) && pointInFloorZone(local.x, local.z, floorZone.shape)
  const inSupportShape =
    atZoneHeight(supportZone) && pointInFloorZone(local.x, local.z, supportZone.shape)

  return {
    inFloor: inFloorShape,
    inSupport: inSupportShape && !inFloorShape,
    localX: local.x,
    localZ: local.z
  }
}

/**
 * A point on a ring around the dance floor center (composer-local math, then the
 * mirror) — where the troupe stands. Radius is clamped so the ring never leaves
 * the support circle.
 */
export function floorRingPointScene(
  angleRad: number,
  radius: number
): { x: number; y: number; z: number } | null {
  if (!floorZone) return null
  const maxR =
    supportZone && supportZone.shape.kind === 'circle'
      ? supportZone.shape.radius - 0.4
      : radius
  const r = Math.min(radius, Math.max(1, maxR))
  // Nudge out of baked no-go discs — an NPC must never stand inside a bench,
  // statue, column, or seating tier.
  const clear = clearOfMesh(
    floorZone.shape.centerX + Math.cos(angleRad) * r,
    floorZone.shape.centerZ + Math.sin(angleRad) * r
  )
  const localX = clear.x
  const localZ = clear.z
  const origin = getRuntimeContext()?.modelOrigin ?? { x: 8, y: 0, z: 8 }
  const pos = glbLocalToScene(origin, localX, localZ)
  return { x: pos.x, y: zoneFloorY(floorZone), z: pos.z }
}

export function danceFloorRadius(): number {
  if (!floorZone) return 2
  return floorZone.shape.kind === 'circle'
    ? floorZone.shape.radius
    : Math.max(floorZone.shape.width, floorZone.shape.depth) / 2
}

/** Outer gather-ring radius — where the crowd fills in around the floor. */
export function danceGatherRadius(): number {
  if (!supportZone) return 5
  return supportZone.shape.kind === 'circle'
    ? supportZone.shape.radius
    : Math.max(supportZone.shape.width, supportZone.shape.depth) / 2
}

export function zoneRadius(zone: RuntimeFloorZone): number {
  return zone.shape.kind === 'circle'
    ? zone.shape.radius
    : Math.max(zone.shape.width, zone.shape.depth) / 2
}

export function runtimeZoneById(id: string | null | undefined): RuntimeFloorZone | null {
  return id ? getRuntimeFloorZones().find((zone) => zone.id === id) ?? null : null
}

/**
 * Stable point inside an authored generic zone, used by NPC groups and watchers.
 *
 * Deterministic in every formation: the same (index, salt, size) always yields the same
 * spot, so the editor's map preview and the live world agree.
 */
export function zoneMemberPointScene(
  zone: RuntimeFloorZone,
  index: number,
  salt = 0,
  formation: NpcGroupFormation = 'scatter',
  size = 0
): { x: number; y: number; z: number } {
  const { x: unitX, z: unitZ } = npcFormationUnitPoint(formation, index, size, salt)

  let localX: number
  let localZ: number
  if (zone.shape.kind === 'circle') {
    const radius = Math.max(0, zone.shape.radius - 0.45)
    localX = zone.shape.centerX + unitX * radius
    localZ = zone.shape.centerZ + unitZ * radius
  } else {
    const halfW = Math.max(0, zone.shape.width / 2 - 0.35)
    const halfD = Math.max(0, zone.shape.depth / 2 - 0.35)
    localX = zone.shape.centerX + unitX * halfW
    localZ = zone.shape.centerZ + unitZ * halfD
  }
  const clear = clearOfMesh(localX, localZ)
  const ctx = getRuntimeContext()
  const origin = ctx?.modelOrigin ?? { x: 8, y: 0, z: 8 }
  const pos = glbLocalToScene(origin, clear.x, clear.z)
  return { x: pos.x, y: zoneFloorY(zone), z: pos.z }
}

export function zoneCenterScene(zone: RuntimeFloorZone): { x: number; y: number; z: number } {
  const ctx = getRuntimeContext()
  const origin = ctx?.modelOrigin ?? { x: 8, y: 0, z: 8 }
  const pos = glbLocalToScene(origin, zone.shape.centerX, zone.shape.centerZ)
  return { x: pos.x, y: zoneFloorY(zone), z: pos.z }
}

/** Curved island screen: wait-spots and look-at must stay on the open mouth. */
function islandDanceBackdrop(): boolean {
  const punch = getRuntimeContext()?.social?.apps.punchMachine
  return punch?.enabled === true && punch.skyIslandEnabled === true && punch.bigScreenEnabled !== false
}

function floorLookScene(
  origin: { x: number; z: number },
  localX: number,
  localZ: number,
  y: number
): { x: number; y: number; z: number } {
  const look = islandDanceBackdrop()
    ? punchIslandLookLocal(localX, localZ)
    : { x: localX, z: localZ + 2 }
  const pos = glbLocalToScene(origin, look.x, look.z)
  return { x: pos.x, y: y + 1.5, z: pos.z }
}

/** Teleport the local player onto the dance floor center (nudged off any mesh). */
export function teleportToFloor(): void {
  if (!floorZone) return
  const ctx = getRuntimeContext()
  const origin = ctx?.modelOrigin ?? { x: 8, y: 0, z: 8 }
  const clear = clearOfMesh(floorZone.shape.centerX, floorZone.shape.centerZ)
  const pos = glbLocalToScene(origin, clear.x, clear.z)
  const y = zoneFloorY(floorZone)
  void movePlayerTo({
    newRelativePosition: { x: pos.x, y, z: pos.z },
    cameraTarget: floorLookScene(origin, clear.x, clear.z, y)
  })
}

/**
 * Push the local player OFF the dance floor — radially out past the floor edge
 * (into the support circle). Same compute-in-local-space-then-mirror discipline
 * as zone-gates pushPlayerOut: mixing spaces here caused the phantom offsets.
 */
export function pushOffFloor(localX: number, localZ: number): void {
  if (!floorZone) return
  const shape = floorZone.shape
  const radius =
    shape.kind === 'circle' ? shape.radius : Math.max(shape.width, shape.depth) / 2
  const margin = radius + 0.8
  const origin = getRuntimeContext()?.modelOrigin ?? { x: 8, y: 0, z: 8 }
  const center = zoneCenterScene(floorZone)
  let standX: number
  let standZ: number
  if (islandDanceBackdrop()) {
    // Never park behind the arc — radial push toward −Z is how the camera
    // ended up on the red back while the owner waited in queue.
    const stand = punchIslandQueueStandLocal(shape.centerX, shape.centerZ, radius)
    standX = stand.x
    standZ = stand.z
  } else {
    const dx = localX - shape.centerX
    const dz = localZ - shape.centerZ
    const len = Math.hypot(dx, dz)
    const ux = len < 0.05 ? 0 : dx / len
    const uz = len < 0.05 ? 1 : dz / len
    standX = shape.centerX + ux * margin
    standZ = shape.centerZ + uz * margin
  }
  const target = glbLocalToScene(origin, standX, standZ)
  void movePlayerTo({
    newRelativePosition: { x: target.x, y: center.y, z: target.z },
    cameraTarget: floorLookScene(origin, shape.centerX, shape.centerZ, center.y)
  })
}

/** Queued guests who drifted onto the screen half get the amphitheater stand. */
export function parkQueuedGuestIfBehindScreen(localX: number, localZ: number): boolean {
  if (!islandDanceBackdrop() || !floorZone) return false
  if (localZ >= floorZone.shape.centerZ - 0.3) return false
  pushOffFloor(localX, localZ)
  return true
}
