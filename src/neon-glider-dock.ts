/**
 * Personal Neon Glider hoverboard.
 *
 * Vehicles grants every visitor a World-scoped board through the HUD. The board is
 * created under the local player and mounted in the same click; toggling again (or E)
 * removes it. There are no scene-owned docks to find, claim, or leave behind.
 *
 * Multiplayer state is player-keyed. Each client owns only its local ride and broadcasts
 * that rider's pose. Other clients render non-colliding visual copies keyed by player id,
 * so simultaneous riders never compete for an entity, seat, or network id.
 */
import {
  ColliderLayer,
  engine,
  Entity,
  GltfContainer,
  InputAction,
  InputModifier,
  Material,
  MaterialTransparencyMode,
  MeshCollider,
  MeshRenderer,
  PlayerIdentityData,
  Transform,
  VisibilityComponent,
  inputSystem
} from '@dcl/sdk/ecs'
import { MessageBus } from '@dcl/sdk/message-bus'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { movePlayerTo } from '~system/RestrictedActions'
import { NEON_GLIDER } from '@shared/neon-glider-contract'
import { nextVehiclePose, vehicleForward, type VehicleBlockers } from '@shared/vehicle-contract'
import { aabbsFromBuildingOutlines } from '@shared/jump-pad-wander'
import { GRID } from '@shared/types'
import type { SceneRuntimeConfig } from '@shared/scene-runtime-config'
import { onActionKey } from './action-keys'
import { exitVehicleRide, isVehicleDriving } from './eclipse-vehicle'
import { reportBootHealth } from './boot-health'
import { setRideHint } from './ride-hint'

/** Minimum deck-top height on ground. Higher floors preserve the player's current Y. */
const GROUND_DECK_Y = 0.55
const CRUISE_MPS = NEON_GLIDER.cruiseMps
const BOOST_MPS = NEON_GLIDER.boostMps
const TURN_DEG_PER_S = 110
const ACCEL_PER_S = 3.5
const GLIDER_CLEARANCE_M = 0.72
const REDECK_DRIFT_M = 0.9
const BOUNDS_INSET_M = 1.2
const POSE_BROADCAST_HZ = 10
const REMOTE_TIMEOUT_MS = 4_000

type GliderPose = { x: number; y: number; z: number; yaw: number }

type Board = {
  root: Entity
  entities: Entity[]
  boostCrystals: Entity[]
  pose: GliderPose
}

type RemoteBoard = Board & { lastSeenMs: number }

type GliderWire = GliderPose & {
  playerId: string
  active: boolean
  boost: boolean
}

const gliderBus = new MessageBus()
const remoteBoards = new Map<string, RemoteBoard>()
let active: Board | null = null
let initialized = false
let available = false
let busWired = false
let riding = false
let speed = 0
let sinceBroadcast = 0
let bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }
let blockers: VehicleBlockers = { radius: GLIDER_CLEARANCE_M, obstacles: [] }

export function isRidingGlider(): boolean {
  return riding
}

export function isNeonGliderAvailable(): boolean {
  return available
}

function localPlayerId(): string {
  return (
    PlayerIdentityData.getOrNull(engine.PlayerEntity)?.address?.trim().toLowerCase() ||
    getPlayer()?.userId?.trim().toLowerCase() ||
    ''
  )
}

function validWire(raw: unknown): raw is GliderWire {
  if (!raw || typeof raw !== 'object') return false
  const msg = raw as Partial<GliderWire>
  return (
    typeof msg.playerId === 'string' &&
    msg.playerId.length > 0 &&
    typeof msg.active === 'boolean' &&
    typeof msg.boost === 'boolean' &&
    Number.isFinite(msg.x) &&
    Number.isFinite(msg.y) &&
    Number.isFinite(msg.z) &&
    Number.isFinite(msg.yaw)
  )
}

function removeBoard(board: Board): void {
  for (let i = board.entities.length - 1; i >= 0; i -= 1) {
    engine.removeEntity(board.entities[i]!)
  }
}

function removeRemote(playerId: string): void {
  const board = remoteBoards.get(playerId)
  if (!board) return
  removeBoard(board)
  remoteBoards.delete(playerId)
}

function applyPose(board: Board): void {
  const transform = Transform.getMutableOrNull(board.root)
  if (!transform) return
  transform.position = Vector3.create(board.pose.x, board.pose.y - NEON_GLIDER.deckTopM, board.pose.z)
  transform.rotation = Quaternion.fromEulerDegrees(0, board.pose.yaw, 0)
}

function setBoostCrystals(board: Board, on: boolean): void {
  for (const crystal of board.boostCrystals) {
    VisibilityComponent.createOrReplace(crystal, { visible: on })
  }
}

const THRUSTERS = [
  { x: -0.22, y: 0.075, z: -1.32 },
  { x: 0.22, y: 0.075, z: -1.32 }
] as const

function attachBoostCrystals(root: Entity, entities: Entity[]): Entity[] {
  const pieces: Entity[] = []
  const shaftM = 0.34
  const tipM = 0.28
  for (const nozzle of THRUSTERS) {
    const shaft = engine.addEntity()
    entities.push(shaft)
    Transform.create(shaft, {
      parent: root,
      position: Vector3.create(nozzle.x, nozzle.y, nozzle.z - shaftM / 2),
      rotation: Quaternion.fromEulerDegrees(-90, 0, 0),
      scale: Vector3.create(0.18, shaftM, 0.18)
    })
    MeshRenderer.setCylinder(shaft, 0.5, 0.5)
    Material.setPbrMaterial(shaft, {
      emissiveColor: Color3.create(0.35, 0.92, 1),
      emissiveIntensity: 4.2,
      albedoColor: Color4.create(0.2, 0.82, 1, 1),
      metallic: 0.22,
      roughness: 0.2
    })
    VisibilityComponent.create(shaft, { visible: false })

    const tip = engine.addEntity()
    entities.push(tip)
    Transform.create(tip, {
      parent: root,
      position: Vector3.create(nozzle.x, nozzle.y, nozzle.z - shaftM - tipM / 2),
      rotation: Quaternion.fromEulerDegrees(-90, 0, 0),
      scale: Vector3.create(0.18, tipM, 0.18)
    })
    MeshRenderer.setCylinder(tip, 0, 0.5)
    Material.setPbrMaterial(tip, {
      emissiveColor: Color3.create(0.58, 0.96, 1),
      emissiveIntensity: 5,
      albedoColor: Color4.create(0.72, 0.98, 1, 1),
      metallic: 0.08,
      roughness: 0.16
    })
    VisibilityComponent.create(tip, { visible: false })
    pieces.push(shaft, tip)
  }
  return pieces
}

function spawnBoard(at: GliderPose, local: boolean): Board {
  const root = engine.addEntity()
  const entities = [root]
  Transform.create(root, {
    position: Vector3.create(at.x, at.y - NEON_GLIDER.deckTopM, at.z),
    rotation: Quaternion.fromEulerDegrees(0, at.yaw, 0)
  })
  GltfContainer.create(root, {
    src: NEON_GLIDER.modelSrc,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })

  if (local) {
    const deck = engine.addEntity()
    entities.push(deck)
    Transform.create(deck, {
      parent: root,
      position: Vector3.create(0, NEON_GLIDER.deckTopM - 0.04, 0),
      scale: Vector3.create(0.82, 0.08, 2.7)
    })
    MeshCollider.setBox(deck, ColliderLayer.CL_PHYSICS)
  }

  const glow = engine.addEntity()
  entities.push(glow)
  Transform.create(glow, {
    parent: root,
    // Keep the pool on the surface under this personal board, including upper floors.
    position: Vector3.create(0, -GROUND_DECK_Y + NEON_GLIDER.deckTopM + 0.03, 0),
    scale: Vector3.create(1.6, 2.6, 1),
    rotation: Quaternion.fromEulerDegrees(90, 0, 0)
  })
  MeshRenderer.setPlane(glow)
  Material.setPbrMaterial(glow, {
    texture: Material.Texture.Common({ src: 'images/glow.png' }),
    alphaTexture: Material.Texture.Common({ src: 'images/glow.png' }),
    emissiveTexture: Material.Texture.Common({ src: 'images/glow.png' }),
    emissiveColor: Color3.create(0.4, 0.85, 1),
    emissiveIntensity: 2.2,
    albedoColor: Color4.create(0.4, 0.85, 1, 0.45),
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
    metallic: 0,
    roughness: 1
  })

  return {
    root,
    entities,
    boostCrystals: attachBoostCrystals(root, entities),
    pose: { ...at }
  }
}

function wireMultiplayer(): void {
  if (busWired) return
  busWired = true
  gliderBus.on('hoverboard.pose', (raw: unknown) => {
    if (!validWire(raw)) return
    const playerId = raw.playerId.trim().toLowerCase()
    if (!playerId || playerId === localPlayerId()) return
    if (!raw.active) {
      removeRemote(playerId)
      return
    }
    let remote = remoteBoards.get(playerId)
    if (!remote) {
      remote = { ...spawnBoard(raw, false), lastSeenMs: Date.now() }
      remoteBoards.set(playerId, remote)
    }
    remote.pose = { x: raw.x, y: raw.y, z: raw.z, yaw: raw.yaw }
    remote.lastSeenMs = Date.now()
    applyPose(remote)
    setBoostCrystals(remote, raw.boost)
  })
}

function emitPose(activeState: boolean, boost: boolean): void {
  const playerId = localPlayerId()
  const board = active
  if (!playerId || (!board && activeState)) return
  const pose = board?.pose ?? { x: 0, y: 0, z: 0, yaw: 0 }
  gliderBus.emit('hoverboard.pose', {
    playerId,
    active: activeState,
    boost,
    ...pose
  } satisfies GliderWire)
}

function lockWalker(lock: boolean): void {
  if (!lock) {
    if (InputModifier.has(engine.PlayerEntity)) InputModifier.deleteFrom(engine.PlayerEntity)
    return
  }
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
        disableGliding: true
      }
    }
  })
}

function deckFeet(board: Board): { x: number; y: number; z: number } {
  return { x: board.pose.x, y: board.pose.y + 0.04, z: board.pose.z }
}

function cameraYaw(): number {
  const camera = Transform.getOrNull(engine.CameraEntity)
  if (!camera) return 0
  const forward = Vector3.rotate(Vector3.Forward(), camera.rotation)
  return (Math.atan2(forward.x, forward.z) * 180) / Math.PI
}

function boardPersonalGlider(): boolean {
  if (!available || riding) return riding
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (!player) return false
  if (isVehicleDriving()) exitVehicleRide()

  const pose: GliderPose = {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, player.position.x)),
    // Lift the deck one hover gap above the surface the player's feet currently occupy.
    y: Math.max(GROUND_DECK_Y, player.position.y + GROUND_DECK_Y),
    z: Math.max(bounds.minZ, Math.min(bounds.maxZ, player.position.z)),
    yaw: cameraYaw()
  }
  active = spawnBoard(pose, true)
  riding = true
  speed = 0
  sinceBroadcast = 0
  lockWalker(true)
  void movePlayerTo({ newRelativePosition: deckFeet(active) })
  setRideHint('W accelerate · S brake/reverse · A/D carve · Shift boost · E or HUD step off')
  emitPose(true, false)
  reportBootHealth('glider', 'ok', 'personal hoverboard riding')
  console.log(`[vehicle] personal Hoverboard ON for ${localPlayerId() || 'local player'}`)
  return true
}

function stepOff(): boolean {
  if (!riding) return false
  const board = active
  riding = false
  speed = 0
  sinceBroadcast = 0
  emitPose(false, false)
  active = null
  if (board) {
    setBoostCrystals(board, false)
    const feet = deckFeet(board)
    void movePlayerTo({ newRelativePosition: feet })
    removeBoard(board)
  }
  lockWalker(false)
  setRideHint(null)
  console.log(`[vehicle] personal Hoverboard OFF for ${localPlayerId() || 'local player'}`)
  return true
}

export function togglePersonalNeonGlider(): void {
  if (riding) stepOff()
  else boardPersonalGlider()
}

function rideStep(dt: number): void {
  const board = active
  if (!board) return
  const forwardHeld = inputSystem.isPressed(InputAction.IA_FORWARD)
  const backwardHeld = inputSystem.isPressed(InputAction.IA_BACKWARD)
  const left = inputSystem.isPressed(InputAction.IA_LEFT)
  const right = inputSystem.isPressed(InputAction.IA_RIGHT)
  const boost = inputSystem.isPressed(InputAction.IA_MODIFIER)

  const target = forwardHeld ? (boost ? BOOST_MPS : CRUISE_MPS) : backwardHeld ? -CRUISE_MPS * 0.4 : 0
  speed += (target - speed) * Math.min(1, dt * ACCEL_PER_S)
  if (Math.abs(speed) < 0.05) speed = 0

  const speedRatio = Math.min(1, Math.abs(speed) / BOOST_MPS)
  const steerScale = 1 - speedRatio * 0.45
  if (left) board.pose.yaw -= TURN_DEG_PER_S * steerScale * dt
  if (right) board.pose.yaw += TURN_DEG_PER_S * steerScale * dt

  board.pose = {
    ...nextVehiclePose(
      board.pose,
      { forward: speed > 0, backward: speed < 0, left: false, right: false },
      dt,
      { cruiseMps: Math.abs(speed), reverseMps: Math.abs(speed), turnRateDeg: 0 },
      bounds,
      blockers
    ),
    y: board.pose.y
  }
  applyPose(board)
  const boosting = boost && forwardHeld && speed > CRUISE_MPS * 0.75
  setBoostCrystals(board, boosting)

  const feet = deckFeet(board)
  const capsule = Transform.getOrNull(engine.PlayerEntity)
  const drift = capsule
    ? Math.hypot(capsule.position.x - feet.x, capsule.position.z - feet.z) + Math.max(0, feet.y - capsule.position.y)
    : Infinity
  if (Math.abs(speed) > 0.05 || drift > REDECK_DRIFT_M) {
    const forward = vehicleForward(board.pose.yaw)
    void movePlayerTo({
      newRelativePosition: feet,
      cameraTarget: {
        x: feet.x + forward.x * 8,
        y: feet.y + 1.4,
        z: feet.z + forward.z * 8
      }
    })
  }

  sinceBroadcast += dt
  if (sinceBroadcast >= 1 / POSE_BROADCAST_HZ) {
    sinceBroadcast = 0
    emitPose(true, boosting)
  }
}

function pruneRemoteBoards(): void {
  const now = Date.now()
  for (const [playerId, board] of remoteBoards) {
    if (now - board.lastSeenMs > REMOTE_TIMEOUT_MS) removeRemote(playerId)
  }
}

export function initNeonGliderDock(config: SceneRuntimeConfig): void {
  if (initialized) return
  initialized = true
  available = true
  bounds = {
    minX: BOUNDS_INSET_M,
    maxX: config.scene.cols * GRID.parcelSize - BOUNDS_INSET_M,
    minZ: BOUNDS_INSET_M,
    maxZ: config.scene.rows * GRID.parcelSize - BOUNDS_INSET_M
  }
  blockers = {
    radius: GLIDER_CLEARANCE_M,
    obstacles: aabbsFromBuildingOutlines(config.buildingOutlines, GRID.parcelSize)
  }
  wireMultiplayer()
  onActionKey('primary', () => {
    if (riding) stepOff()
  })
  engine.addSystem((dt) => {
    if (riding) {
      lockWalker(true)
      rideStep(Math.min(0.1, dt))
    }
    pruneRemoteBoards()
  })
  console.log(`[vehicle] personal Hoverboard HUD ready — World access, ${blockers.obstacles.length} building blockers`)
}
