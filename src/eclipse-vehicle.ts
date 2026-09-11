/**
 * Host vehicles — a craft you board by clicking a seat, stay seated in, and DRIVE.
 *
 * ONE LOCAL BODY. Never spawn an AvatarShape copy of yourself on this client —
 * that is the standing "SWISSVERSE0fab" twin on the roof. Remotes still get a
 * seated puppet so other people see you in the seat.
 *
 *   Parked: Genesis Plaza sit (`triggerSceneEmote` loop) on the LIVE avatar only.
 *   Feet land on the cushion (seat.y ≈ cushionY), not the footwell — footwell Y
 *   puts the sit clip under the seat with legs through the hull.
 *
 *   Moving (closed coupe / Eclipse): VirtualCamera on the cabin (created once,
 *   never destroyed — Scrap law). Hide the live body. Do NOT carry it with
 *   movePlayerTo while driving.
 *
 *   Moving (open cabrio / Cadillac): keep third-person — no cabin cam, no hide.
 *   The live body stays visible from outside; follow the seat with movePlayerTo.
 *
 * Neon Glider is a separate path (stand on a physics deck). Do not merge the two.
 *
 * Click a pad, occupy that seat, E stands you up. Four pads on the Eclipse.
 */
import {
  AvatarModifierArea,
  AvatarModifierType,
  AvatarShape,
  engine,
  Entity,
  InputAction,
  InputModifier,
  PlayerIdentityData,
  Schemas,
  Transform,
  inputSystem,
  pointerEventsSystem,
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { clientMaySyncEntity } from './plugins/punch-authority-runtime'
import { getPlayer } from '@dcl/sdk/players'
import { movePlayerTo, triggerSceneEmote } from '~system/RestrictedActions'
import {
  DRIVER_SEAT_ID,
  HOVER_POD_RADIUS_M,
  clearExitSpot,
  freeParkingSpot,
  gateHeldDriveInput,
  nextVehiclePose,
  normalizeVehicleList,
  vehicleForward,
  vehicleSeatLocals,
  vehicleSeatWorldAt,
  type VehicleBlockers,
  type VehicleBounds,
  type VehicleDriveInput,
  type VehiclePose,
  type VehicleSeatId,
  type VehicleSeatLocal,
  type VehicleSpec,
} from '@shared/vehicle-contract'
import { aabbsFromBuildingOutlines } from '@shared/jump-pad-wander'
import { SIT_EMOTE_DURATION_S, SIT_EMOTE_PATH } from '@shared/emote-library'
import { GRID, type SceneLayout } from '@shared/types'
import type { SceneRuntimeConfig } from '@shared/scene-runtime-config'
import { onActionKey } from './action-keys'
import { buildVehicleHull, pulseHoverGlow, setBoostPlume, setHoverGlow } from './eclipse-vehicle-hull'
import { reportBootHealth } from './boot-health'
import { setRideHint } from './ride-hint'
import { isRidingGlider } from './neon-glider-dock'
import { bindVehicleCabinCam, releaseVehicleCabinCam, vehicleCabinCamBound } from './vehicle-cabin-cam'
import { onSceneEmotesResolved, resolveSceneEmotes, sceneEmoteUrnFor } from './dance/scene-emotes'

const NETWORK_ID_BASE = 8101
const NET_HZ = 10
/** Hull motion that switches the view from plaza-sit to cabin-cam. */
const MOVE_EPS_M = 0.02
const MOVE_EPS_YAW = 0.01
/**
 * Same envelope as the flight puppet. Hide only while the cabin cam is bound —
 * a parked hide left standing wearable fragments in the cabin.
 */
const HIDE_AREA = Vector3.create(5, 3.6, 5)
const BOUNDS_INSET_M = 1.2

const VehicleNet = engine.defineComponent('swissverse::VehicleNetV2', {
  driverId: Schemas.String,
  frontRightId: Schemas.String,
  rearLeftId: Schemas.String,
  rearRightId: Schemas.String,
  x: Schemas.Float,
  z: Schemas.Float,
  yaw: Schemas.Float,
  revision: Schemas.Int,
})

type SeatNetKey = 'driverId' | 'frontRightId' | 'rearLeftId' | 'rearRightId'

type Craft = {
  spec: VehicleSpec
  root: Entity
  pose: VehiclePose
  netAttached: boolean
  netIndex: number
  sinceNet: number
}

type Ride = { craft: Craft; seatId: VehicleSeatId }

type OccupantVisual = { puppet: Entity; hide: Entity | null; userId: string }

const crafts: Craft[] = []
const visuals = new Map<string, OccupantVisual>()
let localRide: Ride | null = null
let localHide: Entity | null = null
let lastPassengerPose: VehiclePose | null = null
let driveArmed = false
let poseCountdown = 0
let emoteTimestamp = 0
let bounds: VehicleBounds | null = null
let blockers: VehicleBlockers = { radius: HOVER_POD_RADIUS_M, obstacles: [] }
let initialized = false

export function isVehicleDriving(): boolean {
  return localRide !== null
}

/** Neon Glider (and anything else) calls this so a leftover car seat cannot block boarding. */
export function exitVehicleRide(): boolean {
  if (!localRide) return false
  standUp()
  return true
}

function localId(): string {
  return PlayerIdentityData.getOrNull(engine.PlayerEntity)?.address ?? ''
}

function seatNetKey(seatId: VehicleSeatId): SeatNetKey {
  if (seatId === 'passenger_front_right') return 'frontRightId'
  if (seatId === 'passenger_rear_left') return 'rearLeftId'
  if (seatId === 'passenger_rear_right') return 'rearRightId'
  return 'driverId'
}

function readOccupant(craft: Craft, seatId: VehicleSeatId): string {
  const net = VehicleNet.getOrNull(craft.root)
  if (!net) return ''
  return net[seatNetKey(seatId)] ?? ''
}

function writeOccupant(craft: Craft, seatId: VehicleSeatId, userId: string): void {
  const net = VehicleNet.getMutableOrNull(craft.root)
  if (!net) return
  net[seatNetKey(seatId)] = userId
  net.revision += 1
}

function seatLocal(craft: Craft, seatId: VehicleSeatId): VehicleSeatLocal {
  return vehicleSeatLocals(craft.spec).find((seat) => seat.id === seatId) ?? {
    id: DRIVER_SEAT_ID,
    ...craft.spec.seat,
  }
}

function visualKey(craft: Craft, seatId: VehicleSeatId): string {
  return `${craft.netIndex}:${seatId}`
}

function readDriveInput(): VehicleDriveInput {
  return {
    forward: inputSystem.isPressed(InputAction.IA_FORWARD),
    backward: inputSystem.isPressed(InputAction.IA_BACKWARD),
    left: inputSystem.isPressed(InputAction.IA_LEFT),
    right: inputSystem.isPressed(InputAction.IA_RIGHT),
    boost: inputSystem.isPressed(InputAction.IA_MODIFIER),
  }
}

function applyPose(craft: Craft): void {
  const transform = Transform.getMutableOrNull(craft.root)
  if (!transform) return
  transform.position = Vector3.create(craft.pose.x, craft.spec.hoverY, craft.pose.z)
  transform.rotation = Quaternion.fromEulerDegrees(0, craft.pose.yaw, 0)
}

function lockWalker(lock: boolean): void {
  if (!lock) {
    if (InputModifier.has(engine.PlayerEntity)) InputModifier.deleteFrom(engine.PlayerEntity)
    return
  }
  // Write it ONCE. The drive loop calls this every frame, and re-creating the component 30
  // times a second is a CRDT write per frame that also re-arms the input state underneath the
  // key reader -- the most likely reason the car drove off with nothing held down.
  if (InputModifier.has(engine.PlayerEntity)) return
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: {
      $case: 'standard',
      standard: {
        disableWalk: true,
        disableJog: true,
        disableRun: true,
        disableJump: true,
        disableDoubleJump: true,
        disableGliding: true,
      },
    },
  })
}

function seatFeet(craft: Craft, seatId: VehicleSeatId): { x: number; y: number; z: number } {
  const seat = vehicleSeatWorldAt(craft.spec, craft.pose, seatLocal(craft, seatId))
  return { x: seat.x, y: seat.y + 0.04, z: seat.z }
}

function lookAhead(craft: Craft): { x: number; y: number; z: number } {
  const feet = seatFeet(craft, localRide?.seatId ?? DRIVER_SEAT_ID)
  const fwd = vehicleForward(craft.pose.yaw)
  return { x: feet.x + fwd.x * 6, y: feet.y + 1.15, z: feet.z + fwd.z * 6 }
}

function liveOccupant(craft: Craft, seatId: VehicleSeatId): string | null {
  const holder = readOccupant(craft, seatId)
  if (!holder) return null
  if (holder === localId()) return holder
  if (getPlayer({ userId: holder })) return holder
  writeOccupant(craft, seatId, '')
  console.log(`[vehicle] released ${craft.spec.id} ${seatId} — ${holder} is no longer in the scene`)
  return null
}

function occupiedSeats(craft: Craft): VehicleSeatId[] {
  return vehicleSeatLocals(craft.spec)
    .map((seat) => seat.id)
    .filter((id) => liveOccupant(craft, id) !== null)
}

function anyoneAboard(craft: Craft): boolean {
  return occupiedSeats(craft).length > 0
}

function iAmDriver(craft: Craft): boolean {
  return localRide?.craft === craft && localRide.seatId === DRIVER_SEAT_ID
}

function occupantEntity(userId: string): Entity | null {
  if (userId === localId()) return engine.PlayerEntity
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address === userId) return entity
  }
  return null
}

/**
 * Blank YOUR mesh on this client. Parent to PlayerEntity — the same trick Scrap uses
 * so a first-person bout does not show your arms next to the gloves. Bound for the
 * whole closed-cabin ride, parked or moving.
 */
function hideOwnAvatar(hidden: boolean): void {
  if (!hidden) {
    if (localHide !== null) {
      engine.removeEntity(localHide)
      localHide = null
    }
    return
  }
  if (localHide !== null) {
    Transform.createOrReplace(localHide, {
      parent: engine.PlayerEntity,
      position: Vector3.create(0, 1.05, 0),
    })
    return
  }
  localHide = engine.addEntity()
  Transform.create(localHide, {
    parent: engine.PlayerEntity,
    position: Vector3.create(0, 1.05, 0),
  })
  AvatarModifierArea.create(localHide, {
    area: HIDE_AREA,
    excludeIds: [],
    modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
  })
}

function attachHideToBody(hide: Entity, userId: string): void {
  const parent = occupantEntity(userId)
  if (!parent) return
  Transform.createOrReplace(hide, {
    parent,
    position: Vector3.create(0, 1.05, 0),
  })
}

/** Sit clip on the SEATED copy. Loop, or it plays once and snaps back to stand. */
function applySitPose(puppet: Entity): void {
  const shape = AvatarShape.getMutableOrNull(puppet)
  if (!shape) return
  const urn = sceneEmoteUrnFor(SIT_EMOTE_PATH, true)
  if (urn) shape.emotes = [urn]
  emoteTimestamp += 1
  // The client plays a scene clip on an AvatarShape by its PATH (npcEmoteTrigger).
  shape.expressionTriggerId = SIT_EMOTE_PATH
  shape.expressionTriggerTimestamp = emoteTimestamp
}

function playLiveSit(): void {
  void triggerSceneEmote({ src: SIT_EMOTE_PATH, loop: true })
}

function hullShifted(before: VehiclePose, after: VehiclePose): boolean {
  return (
    Math.abs(after.x - before.x) > MOVE_EPS_M ||
    Math.abs(after.z - before.z) > MOVE_EPS_M ||
    Math.abs(after.yaw - before.yaw) > MOVE_EPS_YAW
  )
}

/**
 * Parked / moving:
 *   Closed coupe (Eclipse): hide the live body and bind cabin cam on sit — never wait
 *   for the hull to move, and never play a plaza sit (that is the standing-through-roof bug).
 *   Open cabrio (Cadillac): third-person, visible, follow the seat with movePlayerTo.
 */
function isOpenCabinCraft(spec: VehicleSpec): boolean {
  return spec.hull.kind === 'glb' && spec.hull.src.includes('cadillac')
}

function occupyClosedCabin(craft: Craft, seatId: VehicleSeatId): void {
  hideOwnAvatar(true)
  bindVehicleCabinCam(craft.root, seatLocal(craft, seatId))
}

function rideOpenCabin(craft: Craft, seatId: VehicleSeatId, moved: boolean): void {
  if (vehicleCabinCamBound()) releaseVehicleCabinCam()
  hideOwnAvatar(false)
  if (!moved) return
  const feet = seatFeet(craft, seatId)
  void movePlayerTo({
    newRelativePosition: { x: feet.x, y: feet.y, z: feet.z },
    cameraTarget: lookAhead(craft),
  })
  playLiveSit()
}

function rideWithCabin(craft: Craft, seatId: VehicleSeatId, moved: boolean): void {
  if (isOpenCabinCraft(craft.spec)) {
    rideOpenCabin(craft, seatId, moved)
    return
  }
  occupyClosedCabin(craft, seatId)
}

function clearVisual(key: string): void {
  const visual = visuals.get(key)
  if (!visual) return
  engine.removeEntity(visual.puppet)
  if (visual.hide !== null) engine.removeEntity(visual.hide)
  visuals.delete(key)
}

function ensureVisual(craft: Craft, seatId: VehicleSeatId, userId: string): void {
  const key = visualKey(craft, seatId)
  // You are the live sit — never a second copy of yourself on this client.
  if (userId === localId()) {
    clearVisual(key)
    return
  }
  const existing = visuals.get(key)
  if (existing?.userId === userId) {
    if (existing.hide !== null) attachHideToBody(existing.hide, userId)
    return
  }
  if (existing) clearVisual(key)

  const player = getPlayer({ userId })
  if (!player) {
    resolveSceneEmotes([SIT_EMOTE_PATH])
    return
  }
  const urn = sceneEmoteUrnFor(SIT_EMOTE_PATH, true)
  if (!urn) resolveSceneEmotes([SIT_EMOTE_PATH])

  const local = seatLocal(craft, seatId)
  const body = engine.addEntity()
  Transform.create(body, {
    parent: craft.root,
    // Cushion height: AvatarShape sits from this origin. Footwell Y sinks them under the seat.
    position: Vector3.create(local.x, local.y, local.z),
    rotation: Quaternion.Identity(),
  })
  emoteTimestamp += 1
  AvatarShape.create(body, {
    id: `eclipse-${craft.netIndex}-${seatId}-${player.userId}`,
    // Empty string makes Explorer invent a stranger's tag ("Nina") over the body.
    name: player.name || ' ',
    ...(player.avatar?.bodyShapeUrn ? { bodyShape: player.avatar.bodyShapeUrn } : {}),
    ...(player.avatar?.skinColor ? { skinColor: player.avatar.skinColor } : {}),
    ...(player.avatar?.hairColor ? { hairColor: player.avatar.hairColor } : {}),
    ...(player.avatar?.eyesColor ? { eyeColor: player.avatar.eyesColor } : {}),
    wearables: [...player.wearables],
    emotes: urn ? [urn] : [],
    expressionTriggerId: urn ?? '',
    expressionTriggerTimestamp: emoteTimestamp,
  })

  // Blank THEIR lagging live mesh for you; parent to their player entity when known.
  const hide = engine.addEntity()
  const parent = occupantEntity(userId)
  Transform.create(hide, parent
    ? { parent, position: Vector3.create(0, 1.05, 0) }
    : { position: Vector3.create(craft.pose.x, craft.spec.hoverY + 1.2, craft.pose.z) }
  )
  AvatarModifierArea.create(hide, {
    area: HIDE_AREA,
    excludeIds: [],
    modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
  })
  visuals.set(key, { puppet: body, hide, userId })
}

function syncCabinVisuals(craft: Craft): void {
  for (const seat of vehicleSeatLocals(craft.spec)) {
    const holder = liveOccupant(craft, seat.id)
    const key = visualKey(craft, seat.id)
    if (!holder) {
      clearVisual(key)
      continue
    }
    ensureVisual(craft, seat.id, holder)
  }
}

function firstEmptySeat(craft: Craft): VehicleSeatId | null {
  for (const seat of vehicleSeatLocals(craft.spec)) {
    const holder = liveOccupant(craft, seat.id)
    if (!holder || holder === localId()) return seat.id
  }
  return null
}

function nearestEmptySeat(): Ride | null {
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (!player) return null
  let best: Ride | null = null
  let bestD = HOVER_POD_RADIUS_M + 0.8
  for (const craft of crafts) {
    const dx = player.position.x - craft.pose.x
    const dz = player.position.z - craft.pose.z
    const d = Math.sqrt(dx * dx + dz * dz)
    if (d >= bestD) continue
    const seatId = firstEmptySeat(craft)
    if (!seatId) continue
    best = { craft, seatId }
    bestD = d
  }
  return best
}

function sitIn(craft: Craft, seatId: VehicleSeatId): void {
  const holder = liveOccupant(craft, seatId)
  if (holder && holder !== localId()) {
    const fallback = firstEmptySeat(craft)
    if (!fallback) {
      console.log(`[vehicle] ${craft.spec.id} refused — every seat is taken`)
      return
    }
    sitIn(craft, fallback)
    return
  }
  if (localRide && (localRide.craft !== craft || localRide.seatId !== seatId)) standUp()
  if (localRide) return
  writeOccupant(craft, seatId, localId())
  localRide = { craft, seatId }
  lastPassengerPose = { x: craft.pose.x, z: craft.pose.z, yaw: craft.pose.yaw }
  driveArmed = false
  lockWalker(true)
  const driving = seatId === DRIVER_SEAT_ID
  setRideHint(driving ? 'WASD · Shift boost · E stand up' : 'E stand up')
  setHoverGlow(craft.root, true)
  if (isOpenCabinCraft(craft.spec)) {
    hideOwnAvatar(false)
    const feet = seatFeet(craft, seatId)
    void movePlayerTo({
      newRelativePosition: { x: feet.x, y: feet.y, z: feet.z },
      cameraTarget: lookAhead(craft),
    })
    playLiveSit()
  } else {
    occupyClosedCabin(craft, seatId)
  }
  syncCabinVisuals(craft)
  console.log(
    `[vehicle] sat in ${craft.spec.id} ${seatId}${driving ? ' — WASD to drive, E to stand up' : ' — E to stand up'}`
  )
}

function standUp(): void {
  if (!localRide) return
  const { craft, seatId } = localRide
  localRide = null
  lastPassengerPose = null
  driveArmed = false
  releaseVehicleCabinCam()
  hideOwnAvatar(false)
  writeOccupant(craft, seatId, '')
  setRideHint(null)
  setBoostPlume(craft.root, false)
  // Always clear — do not early-return if another system already touched InputModifier.
  if (InputModifier.has(engine.PlayerEntity)) InputModifier.deleteFrom(engine.PlayerEntity)
  setHoverGlow(craft.root, anyoneAboard(craft))
  syncCabinVisuals(craft)
  const spot = bounds
    ? clearExitSpot(craft.pose, bounds, blockers)
    : { x: craft.pose.x, z: craft.pose.z }
  void movePlayerTo({
    newRelativePosition: { x: spot.x, y: craft.spec.hoverY + 0.6, z: spot.z },
  })
  console.log(`[vehicle] stood up from ${craft.spec.id} ${seatId}`)
}

function attachNet(craft: Craft): void {
  if (craft.netAttached) return
  if (!clientMaySyncEntity()) {
    // Multiplayer Server scenes: only the headless server may syncEntity.
    // Client calls error and can leave the Room stuck at ready=NO.
    craft.netAttached = true
    return
  }
  try {
    syncEntity(craft.root, [VehicleNet.componentId], NETWORK_ID_BASE + craft.netIndex)
    craft.netAttached = true
    console.log(`[vehicle] ${craft.spec.id} attached to scene-room CRDT`)
  } catch (error) {
    const message = String((error as Error)?.message ?? error)
    if (!message.includes('Profile not initialized')) {
      console.log('[vehicle] sync attach failed; will retry', error)
    }
  }
}

function followRemote(craft: Craft, dt: number): void {
  const net = VehicleNet.getOrNull(craft.root)
  if (!net || iAmDriver(craft)) return
  const t = Math.min(1, dt * 8)
  craft.pose = {
    x: craft.pose.x + (net.x - craft.pose.x) * t,
    z: craft.pose.z + (net.z - craft.pose.z) * t,
    yaw: net.yaw,
  }
  applyPose(craft)
}

function updateOccupiedGlow(craft: Craft): void {
  setHoverGlow(craft.root, iAmDriver(craft) || anyoneAboard(craft))
}

function drive(craft: Craft, dt: number): void {
  if (!bounds) return
  const before = craft.pose
  const gated = gateHeldDriveInput(readDriveInput(), driveArmed)
  driveArmed = gated.armed
  craft.pose = nextVehiclePose(craft.pose, gated.input, dt, craft.spec, bounds, blockers)
  applyPose(craft)
  setBoostPlume(craft.root, gated.input.boost === true && gated.input.forward)
  rideWithCabin(craft, DRIVER_SEAT_ID, hullShifted(before, craft.pose))

  craft.sinceNet += dt
  if (craft.sinceNet < 1 / NET_HZ) return
  craft.sinceNet = 0
  const net = VehicleNet.getMutableOrNull(craft.root)
  if (net) {
    net.x = craft.pose.x
    net.z = craft.pose.z
    net.yaw = craft.pose.yaw
    net.revision += 1
  }
}

function rideAsPassenger(craft: Craft, seatId: VehicleSeatId): void {
  const moved = lastPassengerPose ? hullShifted(lastPassengerPose, craft.pose) : false
  lastPassengerPose = { x: craft.pose.x, z: craft.pose.z, yaw: craft.pose.yaw }
  rideWithCabin(craft, seatId, moved)
}

function spawnCraft(spec: VehicleSpec, index: number): void {
  const root = engine.addEntity()
  Transform.create(root, {
    position: Vector3.create(spec.x, spec.hoverY, spec.z),
    rotation: Quaternion.fromEulerDegrees(0, spec.yaw, 0),
  })
  VehicleNet.create(root, {
    driverId: '',
    frontRightId: '',
    rearLeftId: '',
    rearRightId: '',
    x: spec.x,
    z: spec.z,
    yaw: spec.yaw,
    revision: 0,
  })
  const clickTargets = buildVehicleHull(root, spec)

  const craft: Craft = {
    spec,
    root,
    pose: { x: spec.x, z: spec.z, yaw: spec.yaw },
    netAttached: false,
    netIndex: index,
    sinceNet: 0,
  }
  crafts.push(craft)

  for (const { entity, seatId } of clickTargets) {
    const hover = seatId === DRIVER_SEAT_ID ? 'Sit · Drive' : 'Sit'
    pointerEventsSystem.onPointerDown(
      {
        entity,
        opts: { button: InputAction.IA_POINTER, hoverText: hover, maxDistance: 12, showFeedback: true },
      },
      () => {
        const pick =
          !liveOccupant(craft, seatId) || liveOccupant(craft, seatId) === localId()
            ? seatId
            : firstEmptySeat(craft)
        if (pick) sitIn(craft, pick)
      }
    )
  }
  attachNet(craft)
}

export function initVehicles(config: SceneRuntimeConfig): void {
  if (initialized) return
  const list = normalizeVehicleList(config.vehicles)
  if (!list.length) return
  initialized = true
  resolveSceneEmotes([SIT_EMOTE_PATH])
  onSceneEmotesResolved(() => {
    poseCountdown = 0
    for (const visual of visuals.values()) applySitPose(visual.puppet)
  })

  const layout: SceneLayout = config.scene
  bounds = {
    minX: BOUNDS_INSET_M,
    maxX: layout.cols * GRID.parcelSize - BOUNDS_INSET_M,
    minZ: BOUNDS_INSET_M,
    maxZ: layout.rows * GRID.parcelSize - BOUNDS_INSET_M,
  }
  blockers = {
    radius: HOVER_POD_RADIUS_M,
    obstacles: aabbsFromBuildingOutlines(config.buildingOutlines, GRID.parcelSize),
  }
  list.forEach((spec, index) => {
    const parked = freeParkingSpot({ x: spec.x, z: spec.z, yaw: spec.yaw }, bounds!, blockers)
    if (parked.x !== spec.x || parked.z !== spec.z) {
      console.log(
        `[vehicle] ${spec.id} was parked inside a building at ${spec.x.toFixed(0)}, ` +
          `${spec.z.toFixed(0)} — moved to ${parked.x.toFixed(0)}, ${parked.z.toFixed(0)}`
      )
    }
    spawnCraft({ ...spec, x: parked.x, z: parked.z }, index)
  })

  onActionKey('primary', () => {
    if (localRide) {
      standUp()
      return
    }
    if (isRidingGlider()) return
    const near = nearestEmptySeat()
    if (near) sitIn(near.craft, near.seatId)
  })

  let elapsed = 0
  engine.addSystem((dt) => {
    elapsed += dt
    pulseHoverGlow(elapsed)
    for (const craft of crafts) {
      attachNet(craft)
      followRemote(craft, dt)
      syncCabinVisuals(craft)
      updateOccupiedGlow(craft)
    }
    poseCountdown -= dt
    if (poseCountdown <= 0) {
      poseCountdown = SIT_EMOTE_DURATION_S
      for (const visual of visuals.values()) applySitPose(visual.puppet)
    }
    if (!localRide) return
    lockWalker(true)
    if (localRide.seatId === DRIVER_SEAT_ID) drive(localRide.craft, Math.min(0.1, dt))
    else rideAsPassenger(localRide.craft, localRide.seatId)
  })
  console.log(
    `[vehicle] ${list.length} craft on plot — ${vehicleSeatLocals(list[0]!).length} sit pads, ${blockers.obstacles.length} building blockers`
  )
  reportBootHealth(
    'vehicles',
    'ok',
    crafts.map((c) => `${c.spec.id} @ ${c.pose.x.toFixed(0)},${c.pose.z.toFixed(0)}`).join(' ')
  )
}
