/**
 * Decentraland-native crowd synchronization.
 *
 * One client (the same deterministic coordinator used by the dance reducer)
 * simulates the NPCs. It publishes a packed custom component through
 * `syncEntity`; followers interpolate local AvatarShapes toward that snapshot.
 * This gives late joiners CRDT state transfer without sending 100 Transform
 * updates on every render frame.
 */
import { AvatarShape, engine, Entity, Schemas, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { isStateSyncronized, syncEntity } from '@dcl/sdk/network'
import { clientMaySyncEntity } from '../plugins/punch-authority-runtime'
import {
  buildNpcNetworkSnapshot,
  emptyNpcNetworkSnapshot,
  normalizeNpcNetworkSnapshot,
  npcNetworkPoseAt,
  type NpcNetworkPose,
  type NpcNetworkSnapshot
} from '@shared/npc-network-contract'
import type { TroupeBot } from './troupe'
import { isDanceCoordinator, localUserId } from './runtime'
import { ensureNpcEmote, npcEmoteTrigger, sceneEmoteUrnFor } from './scene-emotes'
import { silenceClappingAudioEmote } from '@shared/world-audio-policy'

const DIRECTOR_ENTITY_ENUM_ID = 7001
const SNAPSHOT_INTERVAL_S = 0.5
const FOLLOW_RATE = 10
const SNAP_DISTANCE = 4

const NpcCrowdState = engine.defineComponent('swissverse::NpcCrowdStateV1', {
  version: Schemas.Int,
  revision: Schemas.Int,
  authorityId: Schemas.String,
  generatedAt: Schemas.Int64,
  count: Schemas.Int,
  poses: Schemas.Array(Schemas.Float),
  emotes: Schemas.Array(Schemas.String),
  emoteTicks: Schemas.Array(Schemas.Int)
})

let directorEntity: Entity | null = null
let networkAttached = false
let initialized = false
let publishTimer = 0
let lastSnapshotKey = ''
let latestSnapshot: NpcNetworkSnapshot | null = null
let getBots: (() => readonly TroupeBot[]) | null = null
const lastRemoteEmote = new Map<number, string>()

function ensureDirector(): boolean {
  if (directorEntity === null) {
    directorEntity = engine.addEntity()
    NpcCrowdState.create(directorEntity, emptyNpcNetworkSnapshot())
  }
  if (networkAttached) return true
  try {
    syncEntity(directorEntity, [NpcCrowdState.componentId], DIRECTOR_ENTITY_ENUM_ID)
    networkAttached = true
    console.log('[npc-sync] attached to Decentraland scene-room CRDT')
  } catch (error) {
    // The SDK profile can finish initializing a frame or two after main(). Retry
    // from the system instead of disabling multiplayer for the whole visit.
    const message = String((error as Error)?.message ?? error)
    if (!message.includes('Profile not initialized')) {
      console.log('[npc-sync] attach failed; will retry', error)
    }
  }
  return networkAttached
}

function componentSnapshot(): NpcNetworkSnapshot | null {
  if (directorEntity === null) return null
  const state = NpcCrowdState.getOrNull(directorEntity)
  if (!state) return null
  return normalizeNpcNetworkSnapshot({
    version: state.version,
    revision: state.revision,
    authorityId: state.authorityId,
    generatedAt: state.generatedAt,
    count: state.count,
    poses: [...state.poses],
    emotes: [...state.emotes],
    emoteTicks: [...state.emoteTicks]
  })
}

function publishSnapshot(): void {
  if (directorEntity === null || !getBots) return
  const authorityId = localUserId()
  if (!authorityId) return
  const current = componentSnapshot()
  const snapshot = buildNpcNetworkSnapshot({
    revision: (current?.revision ?? 0) + 1,
    authorityId,
    generatedAt: Date.now(),
    sources: getBots().flatMap((bot) => {
      const transform = Transform.getOrNull(bot.entity)
      if (!transform) return []
      return [{
        index: bot.index,
        x: transform.position.x,
        y: transform.position.y,
        z: transform.position.z,
        qx: transform.rotation.x,
        qy: transform.rotation.y,
        qz: transform.rotation.z,
        qw: transform.rotation.w,
        emote: bot.lastEmoteUrn,
        emoteTick: bot.emoteTimestamp
      }]
    })
  })
  NpcCrowdState.createOrReplace(directorEntity, snapshot)
  latestSnapshot = snapshot
  lastSnapshotKey = `${snapshot.authorityId}:${snapshot.revision}`
}

function readFollowerSnapshot(): void {
  const snapshot = componentSnapshot()
  if (!snapshot || !snapshot.authorityId || snapshot.count === 0) return
  const key = `${snapshot.authorityId}:${snapshot.revision}`
  if (key === lastSnapshotKey) return
  lastSnapshotKey = key
  latestSnapshot = snapshot
}

function nlerpRotation(
  from: { x: number; y: number; z: number; w: number },
  to: NpcNetworkPose,
  alpha: number
) {
  const dot = from.x * to.qx + from.y * to.qy + from.z * to.qz + from.w * to.qw
  const sign = dot < 0 ? -1 : 1
  let x = from.x + (to.qx * sign - from.x) * alpha
  let y = from.y + (to.qy * sign - from.y) * alpha
  let z = from.z + (to.qz * sign - from.z) * alpha
  let w = from.w + (to.qw * sign - from.w) * alpha
  const length = Math.hypot(x, y, z, w) || 1
  x /= length
  y /= length
  z /= length
  w /= length
  return Quaternion.create(x, y, z, w)
}

function applyRemoteEmote(bot: TroupeBot, snapshot: NpcNetworkSnapshot): void {
  const urn = silenceClappingAudioEmote(snapshot.emotes[bot.index] ?? '')
  const tick = snapshot.emoteTicks[bot.index] ?? 0
  const key = `${snapshot.authorityId}:${tick}:${urn}`
  if (lastRemoteEmote.get(bot.index) === key) return
  lastRemoteEmote.set(bot.index, key)

  const shape = AvatarShape.getMutableOrNull(bot.entity)
  if (!shape) return
  // The snapshot carries the PATH, not the loop flag, and a scene-emote URN is
  // per-loop: `…-false` plays once. Floor holds (the knockout sleep, the boxing
  // guard) played a single frame on every follower and snapped back to idle —
  // which is a downed NPC standing up again on everybody else's screen. Derive
  // the flag from the clip itself so a hold is a hold on every client.
  // The client plays a bundled clip by its PATH, so the snapshot's path IS the
  // trigger (see npcEmoteTrigger). Looping is not supported client-side.
  const trigger = urn ? npcEmoteTrigger(urn) : ''
  // Followers slot the clip in on demand too — their AvatarShapes carry the same
  // ten-slot budget as the coordinator's, not the whole library. Clips a local
  // performance already armed are reserved: a follower runs the punch machine's
  // own walk-up (it is driven off the shared round, not off the coordinator),
  // so evicting the stance or the swing here is the standing dummy on every
  // screen but the coordinator's.
  ensureNpcEmote(shape, urn ? (sceneEmoteUrnFor(urn, false) ?? '') : '', bot.pinnedEmotes)
  bot.emoteTimestamp += 1
  bot.lastEmoteUrn = urn
  shape.expressionTriggerId = trigger
  shape.expressionTriggerTimestamp = bot.emoteTimestamp
}

function followSnapshot(dt: number): void {
  if (!latestSnapshot || !getBots) return
  const alpha = 1 - Math.exp(-FOLLOW_RATE * Math.max(0, dt))
  for (const bot of getBots()) {
    const pose = npcNetworkPoseAt(latestSnapshot, bot.index)
    const transform = Transform.getMutableOrNull(bot.entity)
    if (!pose || !transform) continue
    const distance = Math.hypot(
      pose.x - transform.position.x,
      pose.y - transform.position.y,
      pose.z - transform.position.z
    )
    if (distance > SNAP_DISTANCE) {
      transform.position = Vector3.create(pose.x, pose.y, pose.z)
      transform.rotation = Quaternion.create(pose.qx, pose.qy, pose.qz, pose.qw)
    } else {
      transform.position = Vector3.create(
        transform.position.x + (pose.x - transform.position.x) * alpha,
        transform.position.y + (pose.y - transform.position.y) * alpha,
        transform.position.z + (pose.z - transform.position.z) * alpha
      )
      transform.rotation = nlerpRotation(transform.rotation, pose, alpha)
    }
    // Keep takeover targets near the last authoritative pose. If this follower
    // becomes coordinator, the crowd resumes from where everybody saw it.
    bot.tx = pose.x
    bot.ty = pose.y
    bot.tz = pose.z
    applyRemoteEmote(bot, latestSnapshot)
  }
}

function npcNetworkSystem(dt: number): void {
  if (!ensureDirector()) return
  if (isDanceCoordinator()) {
    publishTimer -= dt
    if (publishTimer <= 0) {
      publishTimer = SNAPSHOT_INTERVAL_S
      publishSnapshot()
    }
    return
  }
  // A room/island handoff invalidates the previous room's authority. Wait for
  // Decentraland's CRDT state transfer before rendering that state again.
  if (!isStateSyncronized()) {
    latestSnapshot = null
    lastSnapshotKey = ''
    lastRemoteEmote.clear()
    return
  }
  readFollowerSnapshot()
  followSnapshot(dt)
}

export function initNpcNetworkSync(botProvider: () => readonly TroupeBot[]): void {
  getBots = botProvider
  if (initialized) return
  if (!clientMaySyncEntity()) {
    console.log('[npc-sync] skipped: Multiplayer Server owns CRDT; clients must not syncEntity')
    return
  }
  initialized = true
  ensureDirector()
  engine.addSystem(npcNetworkSystem)
}

export function npcNetworkDiag(): {
  role: 'authority' | 'follower'
  attached: boolean
  roomStateReady: boolean
  revision: number
  authorityId: string
} {
  return {
    role: isDanceCoordinator() ? 'authority' : 'follower',
    attached: networkAttached,
    roomStateReady: networkAttached && isStateSyncronized(),
    revision: latestSnapshot?.revision ?? 0,
    authorityId: latestSnapshot?.authorityId ?? ''
  }
}
