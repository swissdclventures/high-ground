/**
 * In-world site paving. The GLB plane loses the depth fight against Decentraland's
 * y=0 terrain on a 256 m plot: GLTF drops polygonOffset, and the SDK has no way to
 * put it back. This overlay is plot-centred from the runtime config (not parented
 * to the primary tower) and draws in the transparent queue so it composites over
 * the explorer ground without covering nearby opaque slabs.
 *
 * Accents spawn here (not in the exported GLB) so they sit above this overlay and
 * are not doubled. Same plan as the Builder preview. Visual only — no collider.
 */
import { engine, Entity, LightSource, Material, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { composerToDcl } from '@shared/dcl-placement'
import { DCL_DISC_PRIMITIVE_RADIUS } from '@shared/dcl-disc'
import { siteGroundOverlayTransform } from '@shared/kit-geometry'
import {
  planSiteGroundAccents,
  type GroundAccentAnimation,
  type GroundAccentBeacon,
  type SiteGroundAccentPiece,
} from '@shared/site-ground-accents'
import { clampAlbedo, finishPbr } from '@shared/surface-finish'
import { aabbsFromBuildingOutlines } from '@shared/jump-pad-wander'
import { GRASS_GROUND_COLOR, GRID } from '@shared/types'
import type { SceneRuntimeConfig } from './assets/building-config'

const DEFAULT_GROUND_COLOR = '#9a978f'
/** Alpha < 1 forces the transparent pass so this draws after DCL's opaque terrain. */
const OVERLAY_ALPHA = 0.98
const ARTIFACT_BUILDING_GAP_M = 1.25
const ANIMATION_STEP_S = 1 / 12
/**
 * Real lights are scarce: the Explorer keeps only the nearest handful in the WHOLE
 * scene, and the interior-lights pool already claims six. Two here, re-pointed at
 * whichever beacons the player is standing near, so WE pick the survivors instead
 * of letting the renderer truncate silently.
 */
const BEACON_POOL = 2

interface AnimatedArtifact {
  entity: Entity
  piece: SiteGroundAccentPiece
  animation: GroundAccentAnimation
  baseY: number
  baseRotY: number
  worldX: number
  worldZ: number
}

interface BeaconAnchor {
  beacon: GroundAccentBeacon
  x: number
  y: number
  z: number
}

function hexToColor4(hex: string, alpha: number): Color4 {
  const n = parseInt(hex.slice(1), 16)
  return Color4.create(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha)
}

function hexToColor3(hex: string): Color3 {
  const c = hexToColor4(hex, 1)
  return Color3.create(c.r, c.g, c.b)
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

export function loadSiteGround(config: SceneRuntimeConfig): void {
  const ground = config.building.siteGround
  const surface = ground?.surface ?? 'none'
  if (surface === 'none') return

  const pose = siteGroundOverlayTransform(config.scene)
  const fallback = surface === 'grass' ? GRASS_GROUND_COLOR : DEFAULT_GROUND_COLOR
  const hex = ground?.color && /^#[0-9a-fA-F]{6}$/.test(ground.color) ? ground.color : fallback
  const { roughness, metallic } = (() => {
    const p = finishPbr(ground?.finish)
    return { roughness: p.roughness, metallic: p.metalness }
  })()

  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.create(pose.x, pose.y, pose.z),
    // SDK plane faces +Z; -90 X lays it onto XZ. Local XY then maps to world XZ.
    rotation: Quaternion.fromEulerDegrees(-90, 0, 0),
    scale: Vector3.create(pose.width, pose.depth, 1),
  })
  MeshRenderer.setPlane(entity)
  Material.setPbrMaterial(entity, {
    albedoColor: hexToColor4(clampAlbedo(hex), OVERLAY_ALPHA),
    roughness,
    metallic,
    transparencyMode: 2,
  })

  const pieces = planSiteGroundAccents({
    width: pose.width,
    depth: pose.depth,
    groundHex: hex,
    accents: ground?.accents ?? [],
    exclusions: aabbsFromBuildingOutlines(config.buildingOutlines, GRID.parcelSize).map((box) => ({
      minX: box.minX - pose.width / 2 - ARTIFACT_BUILDING_GAP_M,
      maxX: box.maxX - pose.width / 2 + ARTIFACT_BUILDING_GAP_M,
      minZ: box.minZ - pose.depth / 2 - ARTIFACT_BUILDING_GAP_M,
      maxZ: box.maxZ - pose.depth / 2 + ARTIFACT_BUILDING_GAP_M,
    })),
  })
  const animated: AnimatedArtifact[] = []
  const beacons: BeaconAnchor[] = []
  for (const piece of pieces) {
    const dcl = composerToDcl(piece.x, piece.z, config.scene)
    const e = engine.addEntity()
    const worldY = pose.y + piece.y
    Transform.create(e, {
      position: Vector3.create(dcl.x, worldY, dcl.z),
      rotation: Quaternion.fromEulerDegrees(radToDeg(piece.rotX), radToDeg(piece.rotY), radToDeg(piece.rotZ)),
      scale: Vector3.create(piece.sx, piece.sy, piece.sz),
    })
    if (piece.mesh === 'cylinder') {
      MeshRenderer.setCylinder(
        e,
        piece.radiusTop ?? DCL_DISC_PRIMITIVE_RADIUS,
        piece.radiusBottom ?? DCL_DISC_PRIMITIVE_RADIUS
      )
    } else {
      MeshRenderer.setBox(e)
    }
    const opacity = piece.opacity ?? 1
    const emissiveHex = piece.emissiveColor ?? piece.color
    Material.setPbrMaterial(e, {
      albedoColor: hexToColor4(clampAlbedo(piece.color), opacity),
      roughness: piece.roughness,
      metallic: piece.metalness,
      emissiveColor: hexToColor3(emissiveHex),
      emissiveIntensity: piece.emissiveIntensity ?? 0,
      ...(opacity < 1 ? { transparencyMode: 2 } : {}),
    })
    if (piece.animation) {
      animated.push({ entity: e, piece, animation: piece.animation, baseY: worldY, baseRotY: piece.rotY, worldX: dcl.x, worldZ: dcl.z })
    }
    if (piece.beacon) {
      beacons.push({ beacon: piece.beacon, x: dcl.x, y: pose.y + piece.beacon.heightM, z: dcl.z })
    }
  }

  if (animated.length > 0) installArtifactAnimation(animated, beacons)

  console.log(
    `[site-ground] overlay ${pose.width.toFixed(0)}×${pose.depth.toFixed(0)} m at y=${pose.y}` +
      (pieces.length ? ` + ${pieces.length} accents` : '')
  )
}

function installArtifactAnimation(artifacts: AnimatedArtifact[], beacons: BeaconAnchor[]): void {
  let elapsedS = 0
  let accumulatedS = 0
  const lamps = beacons.length > 0 ? createBeaconLamps() : []

  engine.addSystem((dt) => {
    elapsedS += Math.min(0.1, dt)
    accumulatedS += dt
    if (accumulatedS < ANIMATION_STEP_S) return
    accumulatedS = 0

    const player = Transform.getOrNull(engine.PlayerEntity)?.position
    if (player && lamps.length > 0) driveBeaconLamps(lamps, beacons, player)

    for (const artifact of artifacts) {
      const a = artifact.animation
      const cycle = positiveFraction(elapsedS * a.speed - a.phase)
      const wave =
        a.kind === 'flow'
          ? Math.pow(Math.max(0, Math.cos(cycle * Math.PI * 2)), 10)
          : 0.5 + 0.5 * Math.sin(cycle * Math.PI * 2)
      const material = Material.getMutableOrNull(artifact.entity)
      if (material?.material?.$case === 'pbr') {
        const lit = a.minIntensity + (a.maxIntensity - a.minIntensity) * wave
        material.material.pbr.emissiveIntensity = lit * presenceGain(a, artifact, player)
      }
      if (a.kind !== 'hover') continue
      const transform = Transform.getMutableOrNull(artifact.entity)
      if (!transform) continue
      transform.position.y = artifact.baseY + Math.sin(cycle * Math.PI * 2) * (a.bobM ?? 0.2)
      transform.rotation = Quaternion.fromEulerDegrees(
        radToDeg(artifact.piece.rotX),
        radToDeg(artifact.baseRotY + elapsedS * (a.spinRps ?? 0)),
        radToDeg(artifact.piece.rotZ)
      )
    }
  })
}

function positiveFraction(value: number): number {
  return ((value % 1) + 1) % 1
}

/**
 * How much brighter a piece burns because somebody is standing near it. Squared
 * falloff so the field stays calm at its edge and only really wakes when walked
 * into. Returns 1 — no change — for pieces with no proximity response, and while
 * the player transform is not yet available.
 */
function presenceGain(
  animation: GroundAccentAnimation,
  artifact: AnimatedArtifact,
  player: Vector3 | undefined
): number {
  const near = animation.proximity
  if (!near || !player || near.radiusM <= 0) return 1
  const dx = player.x - artifact.worldX
  const dz = player.z - artifact.worldZ
  const distance = Math.sqrt(dx * dx + dz * dz)
  if (distance >= near.radiusM) return 1
  const closeness = 1 - distance / near.radiusM
  return 1 + (near.boost - 1) * closeness * closeness
}

/** The fixed pool. Created dark; `driveBeaconLamps` decides where each one stands. */
function createBeaconLamps(): Entity[] {
  const lamps: Entity[] = []
  for (let i = 0; i < BEACON_POOL; i++) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, -50, 0) })
    LightSource.create(e, {
      color: Color3.White(),
      intensity: 0,
      range: 12,
      active: false,
      shadow: false,
      type: LightSource.Type.Point({}),
    })
    lamps.push(e)
  }
  return lamps
}

/**
 * Re-point the pool at the beacons nearest the player and fade each in over its
 * own wake distance, so a crystal lights as you walk up to it and goes out behind
 * you. Selection is a partial sort over a handful of anchors — cheap at 12 Hz.
 */
function driveBeaconLamps(lamps: Entity[], beacons: BeaconAnchor[], player: Vector3): void {
  const taken: number[] = []
  for (let slot = 0; slot < lamps.length; slot++) {
    let best = -1
    let bestDistance = Number.MAX_VALUE
    for (let i = 0; i < beacons.length; i++) {
      if (taken.indexOf(i) >= 0) continue
      const b = beacons[i]
      const dx = player.x - b.x
      const dz = player.z - b.z
      const distance = Math.sqrt(dx * dx + dz * dz)
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    }
    const lamp = LightSource.getMutableOrNull(lamps[slot])
    if (!lamp) continue
    if (best < 0 || bestDistance >= beacons[best].beacon.wakeM) {
      lamp.active = false
      continue
    }
    taken.push(best)
    const anchor = beacons[best]
    const closeness = 1 - bestDistance / anchor.beacon.wakeM
    const transform = Transform.getMutableOrNull(lamps[slot])
    if (transform) {
      transform.position.x = anchor.x
      transform.position.y = anchor.y
      transform.position.z = anchor.z
    }
    lamp.active = true
    lamp.color = hexToColor3(anchor.beacon.colorHex)
    lamp.range = anchor.beacon.rangeM
    lamp.intensity = anchor.beacon.intensityCd * closeness * closeness
  }
}
