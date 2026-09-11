import { punchOwnsCrowd } from '../plugins/punch-crowd-lease'
/**
 * Crowd Activity Director — dispatches NPC troupe behavior by venue activity mode.
 */
import { Transform } from '@dcl/sdk/ecs'
import { isScrapLeased } from '../plugins/scrap'
import type { DanceStateSnapshot, DanceVenueConfig } from '@shared/dance-venue-contract'
import {
  choreographyBeatAt,
  choreographyEmoteAt,
  choreographyFormationSlot,
  choreographyRoleForIndex,
  choreographyScheduleAt,
  choreographyTrackForRole,
  isNpcUserId,
  longestChoreographyTrack,
  npcIndexFromUserId,
  npcGroupForIndex,
  resolveChoreographyRoutine
} from '@shared/dance-venue-contract'
import {
  breakdanceReactionPreset,
  breakdanceSpeechAtMs,
  breakdanceSpeechLine,
  breakdanceSpeechShowMs
} from '@shared/breakdance-reactions'
import { scheduleCrowdReactionActor } from '@shared/crowd-reaction-contract'
import {
  findCrowdRoute,
  nextRouteHop,
  sampleRoamWaypoint,
  type CrowdWaypoint
} from '@shared/crowd-navigation'
import { glbLocalToScene, sceneToGlbLocal } from '@shared/dcl-placement'
import { insideAnyDisc } from '@shared/dance-crowd-steering'
import {
  getCrowdControlAt,
  getDanceConfig,
  getDanceSnapshot,
  getEffectiveVenueActivityMode,
  getVenueActivityMode,
  isVenueActivityPaused
} from './runtime'
import {
  type TroupeBot,
  botHasAuthoredGroup,
  botIsPerforming,
  cypherSupportMove,
  getTroupeBots,
  hangoutRole,
  onTroupePhaseChange,
  playBotEmote,
  runHangoutLife,
  setBotSceneTarget,
  setBotTarget,
  stopBotEmote,
  botHoldsFormation
} from './troupe'
import {
  danceFloorRadius,
  danceFloorZone,
  floorSurfaceY,
  obstructionDiscsScene,
  plotBoundsScene,
  roamPlotBounds,
  zoneCenterScene
} from './zones'
import { getRuntimeContext } from '../social/runtime-context'
import { getActiveCrowdReaction } from './reactions'
import { showNpcSpeech } from './npc-speech'
import { ambientEmoteFor, ambientWindow, rememberAmbientEmote } from '@shared/npc-ambient-emotes'

/**
 * Per-bot memory of what it has just done, so nobody catches an NPC repeating
 * itself. Keyed by bot index; the catalogue and the choice live in
 * shared/npc-ambient-emotes.ts where they can be tested.
 */
const ambientRecent = new Map<number, string[]>()

let lastPhase: DanceStateSnapshot['phase'] | null = null
let lastCrowdControlAt = 0
let lastSeenEmoteAt = 0
let lastChoreoMoveIndex = -1
let lastChoreoEpoch = 0
let choreoPlaybackStartedAt = 0
let choreoStagingStartedAt = 0
const pauseSnapshot = new Map<number, TroupePauseState>()
let reactionCueId = ''
const reactionPlayCount = new Map<number, number>()
const reactionSpeechBeat = new Map<number, number>()

interface TroupePauseState {
  tx: number
  ty: number
  tz: number
  mode: TroupeBot['mode']
  routeIds: string[]
  routeCursor: number
  roamRole: TroupeBot['roamRole']
  chaseTarget: number | null
  facePx: number | null
  facePz: number | null
  nextRoamAt: number
  nextGestureAt: number
  lastProgressAt: number
  lastTargetDistance: number
  recoveryCount: number
  yieldUntil: number
  freeRoamTrips: number
  ambientAnchorX: number | null
  ambientAnchorY: number | null
  ambientAnchorZ: number | null
  nextAmbientAt: number
}

function capturePauseState(bot: TroupeBot): TroupePauseState {
  return {
    tx: bot.tx,
    ty: bot.ty,
    tz: bot.tz,
    mode: bot.mode,
    routeIds: [...bot.routeIds],
    routeCursor: bot.routeCursor,
    roamRole: bot.roamRole,
    chaseTarget: bot.chaseTarget,
    facePx: bot.facePx,
    facePz: bot.facePz,
    nextRoamAt: bot.nextRoamAt,
    nextGestureAt: bot.nextGestureAt,
    lastProgressAt: bot.lastProgressAt,
    lastTargetDistance: bot.lastTargetDistance,
    recoveryCount: bot.recoveryCount,
    yieldUntil: bot.yieldUntil,
    freeRoamTrips: bot.freeRoamTrips,
    ambientAnchorX: bot.ambientAnchorX,
    ambientAnchorY: bot.ambientAnchorY,
    ambientAnchorZ: bot.ambientAnchorZ,
    nextAmbientAt: bot.nextAmbientAt
  }
}

function restorePauseState(bot: TroupeBot, saved: TroupePauseState): void {
  bot.tx = saved.tx
  bot.ty = saved.ty
  bot.tz = saved.tz
  bot.mode = saved.mode
  bot.routeIds = [...saved.routeIds]
  bot.routeCursor = saved.routeCursor
  bot.roamRole = saved.roamRole
  bot.chaseTarget = saved.chaseTarget
  bot.facePx = saved.facePx
  bot.facePz = saved.facePz
  bot.nextRoamAt = saved.nextRoamAt
  bot.nextGestureAt = saved.nextGestureAt
  bot.lastProgressAt = saved.lastProgressAt
  bot.lastTargetDistance = saved.lastTargetDistance
  bot.recoveryCount = saved.recoveryCount
  bot.yieldUntil = saved.yieldUntil
  bot.freeRoamTrips = saved.freeRoamTrips
  bot.ambientAnchorX = saved.ambientAnchorX
  bot.ambientAnchorY = saved.ambientAnchorY
  bot.ambientAnchorZ = saved.ambientAnchorZ
  bot.nextAmbientAt = saved.nextAmbientAt
}

function assignFreeRoamRoles(bots: readonly TroupeBot[]): void {
  for (const bot of bots) {
    if (bot.roamRole) continue
    const roll = bot.index % 10
    if (roll === 9) bot.roamRole = 'jump'
    else bot.roamRole = hangoutRole(bot.index) === 'roam' ? 'roam' : hangoutRole(bot.index)
  }
}

function waypointSceneTarget(
  wp: CrowdWaypoint,
  botIndex: number,
  spreadArrival: boolean
): { x: number; y: number; z: number } {
  const ctx = getRuntimeContext()
  const origin = ctx?.modelOrigin ?? { x: 8, y: 0, z: 8 }
  const spread = spreadArrival ? 0.42 : 0
  const angle = botIndex * 2.399963229728653
  const localX = wp.x + Math.cos(angle) * spread
  const localZ = wp.z + Math.sin(angle) * spread
  const scene = glbLocalToScene(origin, localX, localZ)
  // floorSurfaceY, not a raw floors lookup: a SITE waypoint is on the plaza and must not
  // inherit the building's ground-floor slab height. See dance/zones.ts.
  const floorY = floorSurfaceY(wp.floorIndex)
  return { x: scene.x, y: wp.y === undefined ? floorY : origin.y + wp.y, z: scene.z }
}

function targetWaypoint(bot: TroupeBot, wp: CrowdWaypoint, spreadArrival: boolean): void {
  const target = waypointSceneTarget(wp, bot.index, spreadArrival)
  bot.tx = target.x
  bot.ty = target.y
  bot.tz = target.z
  bot.floorIndex = wp.floorIndex
  bot.ambientAnchorX = null
  bot.ambientAnchorY = null
  bot.ambientAnchorZ = null
}

function roamReservations(excludeIndex: number): { floorIndex: number; x: number; z: number }[] {
  const origin = getRuntimeContext()?.modelOrigin
  if (!origin) return []
  return getTroupeBots()
    .filter((other) => other.index !== excludeIndex)
    .map((other) => {
      const local = sceneToGlbLocal(origin, other.tx, other.tz)
      return { floorIndex: other.floorIndex, x: local.x, z: local.z }
    })
}

function setBotWaypoint(bot: TroupeBot, wp: CrowdWaypoint, config: DanceVenueConfig): void {
  targetWaypoint(bot, wp, true)
  bot.mode = 'free_roam'
  bot.facePx = null
  bot.facePz = null

  if (config.crowdNavigation.waypoints.length >= 2) {
    const fromId =
      bot.routeIds[bot.routeCursor] ??
      config.crowdNavigation.waypoints[bot.index % config.crowdNavigation.waypoints.length]?.id
    if (fromId && fromId !== wp.id) {
      const route = findCrowdRoute(config.crowdNavigation, fromId, wp.id, config.obstructions)
      if (route && route.length > 1) {
        bot.routeIds = route
        bot.routeCursor = 1
        const hop = nextRouteHop(config.crowdNavigation, route, 1)
        if (hop) {
          targetWaypoint(bot, hop, route.length === 2)
        }
        return
      }
    }
  }
  bot.routeIds = [wp.id]
  bot.routeCursor = 0
}

function advanceRouteIfArrived(bot: TroupeBot, config: DanceVenueConfig, now: number): void {
  if (bot.routeIds.length && bot.routeCursor < bot.routeIds.length - 1) {
    bot.routeCursor += 1
    const hop = nextRouteHop(config.crowdNavigation, bot.routeIds, bot.routeCursor)
    if (hop) {
      targetWaypoint(bot, hop, bot.routeCursor === bot.routeIds.length - 1)
      return
    }
  }
  const tick = Math.floor(now / 10000)
  const wp = sampleRoamWaypoint(
    config.crowdNavigation,
    bot.index,
    tick,
    roamPlotBounds(),
    config.obstructions,
    roamReservations(bot.index)
  )
  if (wp) setBotWaypoint(bot, wp, config)
}

function botArrived(bot: TroupeBot): boolean {
  const tf = Transform.getOrNull(bot.entity)
  if (!tf) return false
  return Math.hypot(bot.tx - tf.position.x, bot.tz - tf.position.z) < 0.35
}

/**
 * Baseline life for any NPC without a higher-priority instruction: periodically
 * shift weight/position, face a nearby person or focus, and make a subtle gesture.
 */
function runAmbientLife(
  bot: TroupeBot,
  bots: readonly TroupeBot[],
  now: number,
  focus: { x: number; z: number } | null = null
): void {
  if (!botArrived(bot)) return
  const tf = Transform.getOrNull(bot.entity)
  if (!tf) return

  if (bot.lastEmoteUrn && bot.stopEmoteAt > 0 && now >= bot.stopEmoteAt) {
    stopBotEmote(bot)
    bot.stopEmoteAt = 0
  }
  if (bot.ambientAnchorX === null) {
    bot.ambientAnchorX = tf.position.x
    bot.ambientAnchorY = tf.position.y
    bot.ambientAnchorZ = tf.position.z
  }
  if (bot.nextAmbientAt === 0) {
    bot.nextAmbientAt = now + 1800 + (bot.index % 11) * 650
    return
  }
  if (now < bot.nextAmbientAt) return
  bot.nextAmbientAt = now + 7000 + (bot.index % 9) * 1100

  const nearest = bots
    .filter((other) => other.index !== bot.index && other.floorIndex === bot.floorIndex)
    .map((other) => {
      const otherTf = Transform.getOrNull(other.entity)
      return otherTf
        ? {
            x: otherTf.position.x,
            z: otherTf.position.z,
            distance: Math.hypot(
              otherTf.position.x - tf.position.x,
              otherTf.position.z - tf.position.z
            )
          }
        : null
    })
    .filter((other): other is { x: number; z: number; distance: number } => !!other)
    .sort((a, b) => a.distance - b.distance)[0]
  const lookAt = focus ?? (nearest && nearest.distance < 4 ? nearest : null)
  if (lookAt) {
    bot.facePx = lookAt.x
    bot.facePz = lookAt.z
  }

  // Wander a little, gesture rarely. The window is deliberately long and the
  // odds deliberately low: a crowd is mostly people standing still, and the
  // occasional gesture only reads as life BECAUSE the rest is stillness.
  const window = ambientWindow(now)
  const action = (bot.index + window) % 5
  if (action <= 1) {
    const anchorX = bot.ambientAnchorX
    const anchorZ = bot.ambientAnchorZ!
    const angle = bot.index * 2.399963229728653 + action * 1.3 + Math.floor(now / 10000)
    const radius = 0.28 + (bot.index % 4) * 0.09
    const x = anchorX + Math.cos(angle) * radius
    const z = anchorZ + Math.sin(angle) * radius
    const bounds = plotBoundsScene()
    const discs = obstructionDiscsScene(bot.floorIndex)
    const occupied = bots.some((other) => {
      if (other.index === bot.index || other.floorIndex !== bot.floorIndex) return false
      const otherTf = Transform.getOrNull(other.entity)
      return !!otherTf && Math.hypot(x - otherTf.position.x, z - otherTf.position.z) < 0.72
    })
    if (
      !occupied &&
      !insideAnyDisc(x, z, discs) &&
      (!bounds || (x > 1 && z > 1 && x < bounds.maxX - 1 && z < bounds.maxZ - 1))
    ) {
      bot.tx = x
      bot.ty = bot.ambientAnchorY ?? tf.position.y
      bot.tz = z
    }
    return
  }

  if (bot.lastEmoteUrn) return
  const recent = ambientRecent.get(bot.index) ?? []
  const emote = ambientEmoteFor(bot.index, window, recent)
  if (!emote) return
  rememberAmbientEmote(recent, emote)
  ambientRecent.set(bot.index, recent)
  bot.stopEmoteAt = now + 2200 + (bot.index % 3) * 500
  playBotEmote(bot, emote)
}

/** Stop a stalled NPC in place, let it socialize, and retry after a cooldown. */
function parkStuckBot(bot: TroupeBot, now: number): void {
  const tf = Transform.getOrNull(bot.entity)
  if (!tf) return
  bot.tx = tf.position.x
  bot.ty = tf.position.y
  bot.tz = tf.position.z
  bot.mode = 'free_roam'
  bot.facePx = null
  bot.facePz = null
  bot.ambientAnchorX = tf.position.x
  bot.ambientAnchorY = tf.position.y
  bot.ambientAnchorZ = tf.position.z
  bot.routeIds = []
  bot.routeCursor = 0
  bot.chaseTarget = null
  bot.yieldUntil = now + 8000 + (bot.index % 9) * 1200
  bot.nextRoamAt = bot.yieldUntil
  bot.lastProgressAt = now
  bot.lastTargetDistance = 0
  bot.recoveryCount += 1
  stopBotEmote(bot)
  bot.stopEmoteAt = now + 2800
  playBotEmote(bot, bot.index % 2 === 0 ? 'shrug' : 'wave')
}

function monitorFreeRoamProgress(
  bot: TroupeBot,
  now: number,
  arrived: boolean
): void {
  const tf = Transform.getOrNull(bot.entity)
  if (!tf || bot.yieldUntil > now) return
  const distance = Math.hypot(bot.tx - tf.position.x, bot.tz - tf.position.z)
  if (arrived) {
    bot.lastProgressAt = now
    bot.lastTargetDistance = 0
    return
  }
  if (
    bot.lastProgressAt === 0 ||
    !Number.isFinite(bot.lastTargetDistance) ||
    distance < bot.lastTargetDistance - 0.2
  ) {
    bot.lastProgressAt = now
    bot.lastTargetDistance = distance
    return
  }
  if (now - bot.lastProgressAt >= 5000) parkStuckBot(bot, now)
}

function runFreeRoamLife(
  bot: TroupeBot,
  config: DanceVenueConfig,
  now: number,
  bots: readonly TroupeBot[]
): void {
  if (now < bot.holdUntil) return
  assignFreeRoamRoles(bots)

  if (bot.yieldUntil > 0) {
    if (now < bot.yieldUntil) {
      if (bot.lastEmoteUrn && bot.stopEmoteAt > 0 && now >= bot.stopEmoteAt) {
        stopBotEmote(bot)
        bot.stopEmoteAt = 0
      }
      runAmbientLife(bot, bots, now)
      return
    }
    // A fresh reserved destination is the "opportunity to leave".
    bot.yieldUntil = 0
    advanceRouteIfArrived(bot, config, now + bot.recoveryCount * 1000)
    bot.freeRoamTrips += 1
    bot.nextRoamAt = now + config.crowdNavigation.dwellMinS * 1000
    return
  }

  const arrived = botArrived(bot)
  monitorFreeRoamProgress(bot, now, arrived)
  if (arrived && now >= bot.nextRoamAt) {
    const span = config.crowdNavigation.dwellMaxS - config.crowdNavigation.dwellMinS
    const frequentMover = bot.roamRole === 'roam'
    const firstVenueTrip = bot.freeRoamTrips === 0
    if (firstVenueTrip || frequentMover) {
      advanceRouteIfArrived(bot, config, now)
      bot.freeRoamTrips += 1
    }
    const dwell = frequentMover
      ? config.crowdNavigation.dwellMinS + (bot.index % 5) * (span / 5)
      : 60 + (bot.index % 7) * 6
    bot.nextRoamAt = now + dwell * 1000
  }

  runAmbientLife(bot, bots, now)
}

function runReactionOverlay(bot: TroupeBot, config: DanceVenueConfig, now: number): boolean {
  const cue = getActiveCrowdReaction(now)
  if (!cue || cue.intensity <= 0) return false
  if (cue.id !== reactionCueId) {
    reactionCueId = cue.id
    reactionPlayCount.clear()
    reactionSpeechBeat.clear()
  }
  const group = npcGroupForIndex(config.npc.count, config.npc.groups, bot.index)
  const schedule = scheduleCrowdReactionActor(
    cue,
    breakdanceReactionPreset(config.reactions, cue.mood, cue.intensity),
    {
      id: `npc:${bot.index}`,
      index: bot.index,
      groupId: group?.id ?? null,
      zoneId: group?.place.kind === 'zone' ? group.place.zoneId : null
    }
  )
  if (!schedule.participates || !schedule.emote) return false

  const spoken = reactionSpeechBeat.get(bot.index) ?? -1
  const speechAt = cue.startedAt + breakdanceSpeechAtMs(cue.intensity, cue.seed, bot.index)
  if (now >= speechAt && spoken < 0) {
    reactionSpeechBeat.set(bot.index, 0)
    const line = breakdanceSpeechLine(
      config.reactions,
      cue.mood,
      cue.intensity,
      cue.seed,
      bot.index,
      0
    )
    if (line) showNpcSpeech(bot.entity, line, breakdanceSpeechShowMs(cue.intensity))
  }

  if (now < schedule.startsAt) return true

  const elapsed = now - schedule.startsAt
  const desiredPlayCount = Math.min(
    schedule.repeatCount,
    1 + Math.floor(Math.max(0, elapsed) / schedule.repeatEveryMs)
  )
  const played = reactionPlayCount.get(bot.index) ?? 0
  if (desiredPlayCount > played) {
    reactionPlayCount.set(bot.index, desiredPlayCount)
    stopBotEmote(bot)
    playBotEmote(bot, schedule.emote)
    if (desiredPlayCount > 1) {
      const line = breakdanceSpeechLine(
        config.reactions,
        cue.mood,
        cue.intensity,
        cue.seed,
        bot.index,
        desiredPlayCount
      )
      if (line) showNpcSpeech(bot.entity, line, breakdanceSpeechShowMs(cue.intensity))
    }
    const floor = danceFloorZone()
    if (floor) {
      const focus = zoneCenterScene(floor)
      bot.facePx = focus.x
      bot.facePz = focus.z
    }
  }
  return now <= cue.startedAt + cue.durationMs
}

function runShowMode(
  bot: TroupeBot,
  config: DanceVenueConfig,
  snap: DanceStateSnapshot | null,
  now: number,
  dancingNpcIndex: number,
  livePhase: boolean
): void {
  const performing = livePhase && bot.index === dancingNpcIndex
  const held = now < bot.holdUntil
  const desiredMode: 'center' | 'hangout' = performing ? 'center' : 'hangout'
  if (!held && bot.mode !== desiredMode) {
    bot.yieldUntil = 0
    bot.freeRoamTrips = 0
    setBotTarget(bot, desiredMode)
  }

  if (performing && snap) {
    if (snap.phase === 'countdown') {
      if (bot.lastEmoteUrn !== (config.prepEmotes[0] ?? 'fistpump')) {
        playBotEmote(bot, config.prepEmotes[0] ?? 'fistpump')
      }
    } else if (snap.phase === 'active') {
      if (snap.lastEmoteUrn && snap.lastEmoteAt !== lastSeenEmoteAt) {
        lastSeenEmoteAt = snap.lastEmoteAt
        playBotEmote(bot, snap.lastEmoteUrn)
      }
    }
    return
  }

  if (!snap?.activated) return

  switch (snap.phase) {
    case 'empty':
      if (now >= bot.nextIdleAt) {
        bot.nextIdleAt = now + 12000 + bot.index * 3000
        playBotEmote(bot, cypherSupportMove(now, false))
      }
      break
    default:
      break
  }
}

function runChoreographyMode(
  bots: readonly TroupeBot[],
  config: DanceVenueConfig,
  snap: DanceStateSnapshot,
  now: number
): void {
  const routine = resolveChoreographyRoutine(config.choreography, snap.choreographyRoutineId)
  // A BOT IN A FIGHT BELONGS TO SCRAP, NOBODY ELSE — choreography included.
  // Both halves of this mode write emotes every tick (the cast gets its step,
  // the ambient crowd gets `runHangoutLife`, which CLEARS a leftover trigger).
  // Neither knew about the lease, so a routine running anywhere in the venue
  // wiped the opponent's knockout clip on the frame after it fired and left
  // them standing through the KO cut.
  const free = bots.filter((bot) => !isScrapLeased(bot.index))
  const performers = Math.min(routine.performerCount, free.length)
  const performerBots = free.slice(0, performers)
  const ambientBots = free.slice(performers)
  const zone = danceFloorZone()
  if (!zone) return
  const center = zoneCenterScene(zone)
  // 0.85 m put large wearable silhouettes almost on top of one another. Keep
  // enough shoulder room for all nine dancers to read as a visible formation.
  const spacing = Math.max(1.25, routine.formationSpacing)
  const yaw = (routine.audienceYawDeg * Math.PI) / 180
  const audienceForward = { x: Math.sin(yaw), z: Math.cos(yaw) }
  const formationRight = { x: -Math.cos(yaw), z: Math.sin(yaw) }
  const faceAudience = {
    x: center.x + audienceForward.x * 10,
    z: center.z + audienceForward.z * 10
  }

  if (snap.choreographyStartedAt !== lastChoreoEpoch) {
    lastChoreoEpoch = snap.choreographyStartedAt
    choreoPlaybackStartedAt = 0
    choreoStagingStartedAt = now
    lastChoreoMoveIndex = -1
  }

  performerBots.forEach((bot, slot) => {
    // Choreography is an explicit host command and supersedes temporary
    // practice holds/send-to-zone destinations for the cast.
    bot.holdUntil = 0
    bot.yieldUntil = 0
    bot.freeRoamTrips = 0
    if (bot.mode !== 'choreo') stopBotEmote(bot)
    const rawSlot = choreographyFormationSlot(
      slot,
      center.x,
      center.z,
      spacing,
      routine.formation,
      performers
    )
    const lateral = rawSlot.x - center.x
    const depth = -(rawSlot.z - center.z)
    const slotPos = {
      x: center.x + formationRight.x * lateral + audienceForward.x * depth,
      z: center.z + formationRight.z * lateral + audienceForward.z * depth
    }
    setBotSceneTarget(bot, {
      x: slotPos.x,
      y: center.y,
      z: slotPos.z,
      mode: 'choreo',
      faceAt: faceAudience
    })
  })

  // Choreography only owns its cast. Everyone else keeps normal venue life;
  // a small nearby subset naturally watches because they are close.
  runChoreographyAmbient(ambientBots, config, now, center, danceFloorRadius())

  // Do not burn through the routine while performers are still walking in.
  // Staging has a hard deadline: targets were validated clear, so settle any
  // stragglers instead of allowing one blocked route to ruin the performance.
  if (now - choreoStagingStartedAt >= 12000) {
    for (const bot of performerBots) {
      if (botArrived(bot)) continue
      const tf = Transform.getMutableOrNull(bot.entity)
      if (!tf) continue
      tf.position.x = bot.tx
      tf.position.y = bot.ty
      tf.position.z = bot.tz
    }
  }
  const allReady = performerBots.every((bot) => botArrived(bot))
  if (!allReady) return
  if (choreoPlaybackStartedAt === 0) {
    choreoPlaybackStartedAt = now
    lastChoreoMoveIndex = -1
  }

  const beat = choreographyBeatAt(
    routine.moveDurationMs,
    routine.loop,
    choreoPlaybackStartedAt,
    now,
    longestChoreographyTrack(routine)
  )
  if (!beat || beat.beat === lastChoreoMoveIndex) return
  lastChoreoMoveIndex = beat.beat
  performerBots.forEach((bot, slot) => {
    const role = choreographyRoleForIndex(routine, slot)
    const emote = choreographyEmoteAt(choreographyTrackForRole(routine, role), beat.beat)
    stopBotEmote(bot)
    playBotEmote(bot, emote)
  })
}

function runChoreographyAmbient(
  bots: readonly TroupeBot[],
  config: DanceVenueConfig,
  now: number,
  center: { x: number; y: number; z: number },
  stageRadius: number
): void {
  for (const bot of bots) {
    const tf = Transform.getOrNull(bot.entity)
    if (!tf) continue
    const distance = Math.hypot(tf.position.x - center.x, tf.position.z - center.z)
    const nearbyWatcher = distance <= stageRadius + 3 && bot.index % 5 === 0

    if (nearbyWatcher) {
      if (bot.mode !== 'audience') {
        stopBotEmote(bot)
        setBotSceneTarget(bot, {
          x: tf.position.x,
          y: tf.position.y,
          z: tf.position.z,
          mode: 'audience',
          faceAt: { x: center.x, z: center.z }
        })
      }
      runAmbientLife(bot, bots, now, { x: center.x, z: center.z })
      continue
    }

    const targetCrossesStage =
      Math.hypot(bot.tx - center.x, bot.tz - center.z) < stageRadius + 1.5
    if (bot.mode === 'free_roam' && !targetCrossesStage) {
      runFreeRoamLife(bot, config, now, bots)
      continue
    }

    if (bot.mode !== 'hangout') {
      bot.yieldUntil = 0
      bot.freeRoamTrips = 0
      setBotTarget(bot, 'hangout')
    }
    runHangoutLife(bot, now)
  }
}

function bootstrapFreeRoam(bots: readonly TroupeBot[], now: number): void {
  for (const bot of bots) {
    if (bot.mode === 'free_roam') continue
    const tf = Transform.getOrNull(bot.entity)
    if (tf) {
      bot.tx = tf.position.x
      bot.ty = tf.position.y
      bot.tz = tf.position.z
    }
    bot.mode = 'free_roam'
    bot.routeIds = []
    bot.routeCursor = 0
    bot.chaseTarget = null
    bot.yieldUntil = 0
    bot.freeRoamTrips = 0
    bot.lastProgressAt = now
    bot.lastTargetDistance = 0
    // Release small cohorts instead of sending 99 avatars through chokepoints
    // on the same frame.
    bot.nextRoamAt = now + (bot.index % 20) * 650
  }
}

export function runCrowdDirectorTick(now: number): void {
  const config = getDanceConfig()
  if (!config?.npc.enabled) return
  const bots = getTroupeBots()
  if (!bots.length) return

  const snap = getDanceSnapshot()
  const rawMode = getVenueActivityMode()
  const mode = getEffectiveVenueActivityMode()

  if (snap && snap.phase !== lastPhase) {
    onTroupePhaseChange(snap, now)
    lastPhase = snap.phase
  }

  if (rawMode === 'paused') {
    if (pauseSnapshot.size === 0) {
      for (const bot of bots) {
        pauseSnapshot.set(bot.index, capturePauseState(bot))
        stopBotEmote(bot)
      }
    }
    return
  }

  if (pauseSnapshot.size) {
    for (const bot of bots) {
      const saved = pauseSnapshot.get(bot.index)
      if (saved) restorePauseState(bot, saved)
    }
    pauseSnapshot.clear()
  }

  const dancingNpcIndex =
    snap && snap.dancer && isNpcUserId(snap.dancer) ? npcIndexFromUserId(snap.dancer) : -1
  const livePhase =
    !!snap && (snap.phase === 'selected' || snap.phase === 'countdown' || snap.phase === 'active')

  if (mode === 'choreography' && snap) {
    if (snap.choreographyStartedAt !== 0 && lastChoreoMoveIndex < 0) {
      lastChoreoMoveIndex = -2
    }
    runChoreographyMode(bots, config, snap, now)
    return
  }
  lastChoreoMoveIndex = -1
  lastChoreoEpoch = 0
  choreoPlaybackStartedAt = 0
  choreoStagingStartedAt = 0

  if (mode === 'free_roam') {
    bootstrapFreeRoam(bots, now)
    for (const bot of bots) {
      if (isScrapLeased(bot.index) || punchOwnsCrowd(bot.entity)) continue
      if (now < bot.holdUntil) continue
      runFreeRoamLife(bot, config, now, bots)
    }
    return
  }

  const crowdAt = getCrowdControlAt()
  const crowdDirty = crowdAt > 0 && crowdAt !== lastCrowdControlAt
  if (crowdDirty && mode === 'social') lastCrowdControlAt = crowdAt

  for (const bot of bots) {
    // A BOT IN A FIGHT BELONGS TO SCRAP, NOBODY ELSE.
    //
    // Every crowd behaviour below writes emotes: the reaction overlay
    // (Frenzy = handsair), choreography steps, ambient gestures. None of them
    // knew about the Scrap lease, so the NPC you were boxing kept throwing her
    // hands up mid-bout - and worse, the crowd emote overwrote her jab, cross
    // and hit-reaction every tick, which is why punches "never landed" on her.
    // Scrap drives her position AND her animation for the whole session.
    if (isScrapLeased(bot.index) || punchOwnsCrowd(bot.entity)) continue
    // AND A BOT AT THE PUNCH BAG BELONGS TO THE MACHINE. Exactly the same
    // reason: it armed a stance and a swing onto this body, and every branch
    // below would write over both within a tick — which is why the NPC taking
    // its turn stood there in the ambient idle while the bag jumped.
    if (botIsPerforming(bot)) continue
    // The active dancer keeps performing; everyone else may be temporarily
    // claimed by the reaction overlay regardless of their ambient activity.
    if (!(livePhase && bot.index === dancingNpcIndex) && runReactionOverlay(bot, config, now)) {
      continue
    }
    if (mode === 'social') {
      if (now >= bot.holdUntil && (bot.mode !== 'hangout' || crowdDirty)) {
        bot.yieldUntil = 0
        bot.freeRoamTrips = 0
        setBotTarget(bot, 'hangout')
      }
      runHangoutLife(bot, now)
      if (!botHoldsFormation(bot)) runAmbientLife(bot, bots, now)
      continue
    }
    if (mode === 'show') {
      // A dancer in an authored group keeps its assigned activity even during a show —
      // unless it IS the performer. Group roles are an authored instruction, not a mode;
      // routing everyone through the generic crowd behaviour (which never reads
      // group.role) is why "dance together" groups stood around idle whenever the dance
      // app was on.
      if (!(livePhase && bot.index === dancingNpcIndex) && botHasAuthoredGroup(bot.index)) {
        if (now >= bot.holdUntil && bot.mode !== 'hangout') {
          bot.yieldUntil = 0
          bot.freeRoamTrips = 0
          setBotTarget(bot, 'hangout')
        }
        runHangoutLife(bot, now)
        continue
      }
      runShowMode(bot, config, snap, now, dancingNpcIndex, livePhase)
    }
  }

}

export function crowdDirectorDiag(): string {
  const mode = getVenueActivityMode()
  const effective = getEffectiveVenueActivityMode()
  const paused = isVenueActivityPaused()
  const snap = getDanceSnapshot()
  let choreo = ''
  if (effective === 'choreography' && snap?.choreographyStartedAt) {
    const config = getDanceConfig()
    if (config) {
      const routine = resolveChoreographyRoutine(config.choreography, snap.choreographyRoutineId)
      const tick = choreographyScheduleAt(
        { ...config.choreography, activeRoutineId: routine.id },
        snap.choreographyStartedAt,
        Date.now()
      )
      if (tick) choreo = ` ${routine.id} move:${tick.moveIndex + 1}/${longestChoreographyTrack(routine)}`
    }
  }
  return `activity:${mode}${paused ? `→${effective}` : ''}${choreo}`
}
