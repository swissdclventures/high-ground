/**
 * In-world seating — bench circles, and the click that puts you in one.
 *
 * ★ HOW SITTING WORKS IN SDK7. There is no seat component: a sitter is `movePlayerTo` onto the
 * seat anchor plus `triggerSceneEmote` looping one of the bundled seated clips. The clips are
 * authored, not owned wearables, so every guest can sit regardless of their inventory.
 *
 * ★ THE TELEPORT CANCELS THE EMOTE. Moving the player is movement, and movement kills a running
 * emote — firing both in the same frame gives you a standing avatar on a bench. The emote goes
 * out a few frames LATER, and is re-fired on the clip's own loop seam, which is stitched to
 * 0.00° so the re-fire is invisible.
 *
 * ★ STANDING UP IS WALKING AWAY. Any WASD input cancels a scene emote by itself, so there is no
 * "stand" button to get out of sync — the system just notices the player left the anchor and
 * drops the seat. Clicking the seat you are already on cycles to the next pose instead.
 *
 * ★ NO PHYSICS COLLIDERS. See the note on `SeatingPiece.clickable`: a blocking collider under
 * the sitter makes the character controller shove them back out of the pose.
 *
 * The layout is NOT transported — `planSeating` re-solves it here from the same config the
 * Builder preview uses, so both frames show the same circles in the same places.
 */
import {
  ColliderLayer,
  engine,
  Entity,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  PointerEvents,
  Transform,
  pointerEventsSystem,
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { movePlayerTo, triggerSceneEmote } from '~system/RestrictedActions'
import { composerToDcl } from '@shared/dcl-placement'
import { DCL_DISC_PRIMITIVE_RADIUS } from '@shared/dcl-disc'
import { siteGroundOverlayTransform } from '@shared/kit-geometry'
import { aabbsFromBuildingOutlines } from '@shared/jump-pad-wander'
import {
  BENCH_SEAT_TOP_M,
  SEAT_POSE_LABELS,
  SEAT_POSE_LOOP_S,
  normalizeSeatingConfig,
  planSeating,
  seatPoseEmotePath,
  type SeatPoseId,
  type SeatSlot,
} from '@shared/seating'
import { clampAlbedo } from '@shared/surface-finish'
import { GRID } from '@shared/types'
import type { SceneRuntimeConfig } from './assets/building-config'

const BUILDING_GAP_M = 1.25
/** Reach for the click. Further than this and guests sit on benches across the plaza. */
const SEAT_CLICK_RANGE_M = 8
/** Frames of grace between the teleport and the emote, so the move does not eat the pose. */
const POSE_DELAY_S = 0.25
/** Walk this far from the anchor and the seat lets go. */
const LEAVE_DISTANCE_M = 1.2
/** Invisible click box over each seat: roughly a seated torso. */
const HIT_W = 0.5
const HIT_H = 0.7
const HIT_D = 0.45

interface Seated {
  slot: SeatSlot
  poseIndex: number
  /** Scene-metre anchor, for the walked-away test. */
  anchor: { x: number; z: number }
  /** Seconds until the next emote fire. Negative means nothing pending. */
  fireIn: number
  sinceFireS: number
}

let seated: Seated | null = null
let poses: SeatPoseId[] = []
/** Seat id → its click box, so the hover text can follow what the click will actually do. */
const seatEntities = new Map<string, Entity>()

function hexToColor4(hex: string, alpha: number): Color4 {
  const n = parseInt(hex.slice(1), 16)
  return Color4.create(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha)
}

function hexToColor3(hex: string): Color3 {
  const n = parseInt(hex.slice(1), 16)
  return Color3.create(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export function loadSeating(config: SceneRuntimeConfig): void {
  const seating = normalizeSeatingConfig(config.building.siteGround?.seating)
  if (!seating.enabled) return

  const pose = siteGroundOverlayTransform(config.scene)
  const plan = planSeating({
    width: pose.width,
    depth: pose.depth,
    config: seating,
    exclusions: aabbsFromBuildingOutlines(config.buildingOutlines, GRID.parcelSize).map((box) => ({
      minX: box.minX - pose.width / 2 - BUILDING_GAP_M,
      maxX: box.maxX - pose.width / 2 + BUILDING_GAP_M,
      minZ: box.minZ - pose.depth / 2 - BUILDING_GAP_M,
      maxZ: box.maxZ - pose.depth / 2 + BUILDING_GAP_M,
    })),
  })
  if (plan.clusters.length === 0) {
    console.log('[seating] enabled, but no circle fits the plot — check clearance and spacing')
    return
  }

  poses = seating.poses
  const baseY = pose.y

  for (const piece of plan.pieces) {
    const dcl = composerToDcl(piece.x, piece.z, config.scene)
    const entity = engine.addEntity()
    Transform.create(entity, {
      position: Vector3.create(dcl.x, baseY + piece.y, dcl.z),
      rotation: Quaternion.fromEulerDegrees(0, (piece.yawRad * 180) / Math.PI, 0),
      scale: Vector3.create(piece.sx, piece.sy, piece.sz),
    })
    // Cylinder scale is a DIAMETER: the primitive stays at radius 0.5 (see shared/dcl-disc).
    if (piece.mesh === 'cylinder')
      MeshRenderer.setCylinder(entity, DCL_DISC_PRIMITIVE_RADIUS, DCL_DISC_PRIMITIVE_RADIUS)
    else MeshRenderer.setBox(entity)
    // ★ A LIGHT STRIP IS NOT A BRIGHT COLOUR. clampAlbedo exists to stop a surface blowing out
    // under the district's own lights, so it must NOT be applied to the emissive channel -- that
    // is the one that has to run hot, or the strips read as pale grey plastic after dark.
    Material.setPbrMaterial(entity, {
      albedoColor: hexToColor4(clampAlbedo(piece.color), 1),
      roughness: piece.roughness,
      metallic: piece.metalness,
      emissiveColor: piece.emissive ? hexToColor3(piece.emissive) : Color3.Black(),
      emissiveIntensity: piece.emissive ? (piece.emissiveIntensity ?? 1) : 0,
    })
    // Pointer layer only: the furniture is clickable, never a wall.
    if (piece.clickable) MeshCollider.setBox(entity, ColliderLayer.CL_POINTER)
  }

  for (const slot of plan.seats) spawnSeatTarget(slot, config, baseY)

  installSeatSystem()
  console.log(
    `[seating] ${plan.clusters.length} circle(s), ${plan.seats.length} seats, ` +
      `${plan.triangles} triangles, poses: ${poses.length}`
  )
}

function spawnSeatTarget(slot: SeatSlot, config: SceneRuntimeConfig, baseY: number): void {
  const dcl = composerToDcl(slot.x, slot.z, config.scene)
  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.create(dcl.x, baseY + BENCH_SEAT_TOP_M + HIT_H / 2, dcl.z),
    rotation: Quaternion.fromEulerDegrees(0, (slot.yawRad * 180) / Math.PI, 0),
    scale: Vector3.create(HIT_W, HIT_H, HIT_D),
  })
  // No MeshRenderer: the hit box is invisible, the bench under it is what the guest sees.
  MeshCollider.setBox(entity, ColliderLayer.CL_POINTER)
  seatEntities.set(slot.id, entity)
  bindSeatClick(entity, slot, config, baseY)
}

function bindSeatClick(entity: Entity, slot: SeatSlot, config: SceneRuntimeConfig, baseY: number): void {
  pointerEventsSystem.onPointerDown(
    {
      entity,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: 'Sit',
        maxDistance: SEAT_CLICK_RANGE_M,
        showFeedback: true,
      },
    },
    () => {
      if (seated && seated.slot.id === slot.id) cyclePose()
      else sitOn(slot, config, baseY)
    }
  )
}

function sitOn(slot: SeatSlot, config: SceneRuntimeConfig, baseY: number): void {
  // Leaving the old seat first, or its hover text keeps offering a pose change you cannot make.
  if (seated) standUp()
  const dcl = composerToDcl(slot.x, slot.z, config.scene)
  // Look across the circle: the seat's own facing, six metres out and at eye height.
  const look = {
    x: dcl.x + Math.sin(slot.yawRad) * 6,
    y: baseY + 1.7,
    z: dcl.z + Math.cos(slot.yawRad) * 6,
  }
  void movePlayerTo({
    newRelativePosition: { x: dcl.x, y: baseY + 0.05, z: dcl.z },
    cameraTarget: look,
  })
  seated = { slot, poseIndex: 0, anchor: { x: dcl.x, z: dcl.z }, fireIn: POSE_DELAY_S, sinceFireS: 0 }
  setHoverText(slot.id, poses.length > 1 ? 'Change pose' : 'Sit')
}

/** The seat you are on offers a different action from the one you are not on — say so. */
function setHoverText(slotId: string, text: string): void {
  const entity = seatEntities.get(slotId)
  if (entity === undefined) return
  const events = PointerEvents.getMutableOrNull(entity)
  const row = events?.pointerEvents[0]
  if (row?.eventInfo) row.eventInfo.hoverText = text
}

function standUp(): void {
  if (!seated) return
  setHoverText(seated.slot.id, 'Sit')
  seated = null
}

function cyclePose(): void {
  if (!seated || poses.length === 0) return
  seated.poseIndex = (seated.poseIndex + 1) % poses.length
  seated.fireIn = 0
  console.log(`[seating] pose → ${SEAT_POSE_LABELS[poses[seated.poseIndex]]}`)
}

function playPose(): void {
  if (!seated || poses.length === 0) return
  void triggerSceneEmote({ src: seatPoseEmotePath(poses[seated.poseIndex]), loop: true })
  seated.sinceFireS = 0
}

function installSeatSystem(): void {
  engine.addSystem((dt: number) => {
    if (!seated) return
    const step = Math.min(0.2, dt)

    if (seated.fireIn >= 0) {
      seated.fireIn -= step
      if (seated.fireIn <= 0) {
        seated.fireIn = -1
        playPose()
      }
      return
    }

    const player = Transform.getOrNull(engine.PlayerEntity)
    if (player) {
      const dx = player.position.x - seated.anchor.x
      const dz = player.position.z - seated.anchor.z
      if (dx * dx + dz * dz > LEAVE_DISTANCE_M * LEAVE_DISTANCE_M) {
        standUp()
        return
      }
    }

    // Re-fire on the clip's own seam. Stitched to 0.00°, so this never shows.
    seated.sinceFireS += step
    if (seated.sinceFireS >= SEAT_POSE_LOOP_S - 0.1) playPose()
  })
}
