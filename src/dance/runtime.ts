/**
 * Dance loop runtime — coordinator election + reducer hosting + presence +
 * emote watch. See shared/dance-venue-contract.ts for the authority model.
 *
 * Every client runs this system. Each frame (throttled):
 *  1. Sample own zone presence → heartbeat dance.join / dance.leave.
 *  2. If I'm the active dancer → watch my own AvatarEmoteCommand and report
 *     every new emote (this is how ANY emote — wheel, wearable, scene UI —
 *     counts: they all land in AvatarEmoteCommand).
 *  3. Elect coordinator (lowest userId among present players). If me: drain
 *     inbound events through the pure reducer, tick it, broadcast snapshots.
 */
import { engine, AvatarEmoteCommand, PlayerIdentityData } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/players'
import type {
  DanceModel,
  DanceReducerEvent,
  DanceStateSnapshot,
  DanceVenueConfig,
  ResumableActivityMode,
  VenueActivityMode
} from '@shared/dance-venue-contract'
import type { CrowdHostFormation, CrowdHostMood, CrowdHostSync } from '@shared/crowd-host-control'
import {
  activityModeFromLegacyActivated,
  danceReducer,
  effectiveActivityMode,
  initialDanceModel,
  isClubAtmosphereMode,
  isCompetitiveShowMode,
  isNpcUserId,
  modelFromSnapshot,
  npcNextEmote,
  npcTurnPlan,
  snapshotFromModel
} from '@shared/dance-venue-contract'
import { emitDance, onDance } from './bus'
import { samplePresence } from './zones'
import { BREAKDANCE_SHOW_APP } from '@shared/venue-app-contract'
import { isPluginActive } from '../plugins/active'
import { isDanceBugEquipped, showDanceBugChip, syncDanceBugFloorHint } from './dance-bug-gate'

/** Cypher HUD and auto-join. A plain NPC crowd (Cloud Scrap) starts the same
 * runtime so the troupe and Scrap director can run, and must not put you in a
 * dance queue for standing on the plaza. */
export function isDanceCompetitionLive(): boolean {
  return isPluginActive(BREAKDANCE_SHOW_APP.id)
}

const PRESENCE_INTERVAL_S = 0.25
const HEARTBEAT_INTERVAL_S = 3
const BROADCAST_HEARTBEAT_S = 2

let config: DanceVenueConfig | null = null
let model: DanceModel = initialDanceModel()
let latestSnapshot: DanceStateSnapshot | null = null
let iAmCoordinator = false

let presenceTimer = 0
let heartbeatTimer = 0
let broadcastTimer = 0
let wasInSupport = false
let optedOut = false
/** Explicit opt-in to the dance game. Off = pure spectator (no HUD / no queue). */
let participating = false
let lastEmoteTimestamp = -1
let emoteWatchArmed = false

/** Wall-clock ms of the last NEW own emote observed (manual-override detection). */
let lastOwnEmoteSeenAt = 0

const inbound: DanceReducerEvent[] = []

export function localUserId(): string | null {
  const id = getPlayer()?.userId
  return id ? id.toLowerCase() : null
}

export function getDanceSnapshot(): DanceStateSnapshot | null {
  return latestSnapshot
}

export function getDanceConfig(): DanceVenueConfig | null {
  return config
}

/** The one client allowed to advance and publish NPC simulation state. */
export function isDanceCoordinator(): boolean {
  return iAmCoordinator
}

export function isLocalDancer(): boolean {
  const me = localUserId()
  return !!me && latestSnapshot?.dancer === me
}

export function isLocalQueued(): boolean {
  const me = localUserId()
  return !!me && !!latestSnapshot && latestSnapshot.queue.includes(me)
}

export function lastOwnEmoteWallClock(): number {
  return lastOwnEmoteSeenAt
}

/** "Leave queue" — suppress auto-rejoin until the player exits the circle. */
export function optOutOfQueue(): void {
  const me = localUserId()
  if (!me) return
  optedOut = true
  emitDance({ type: 'dance.leave', userId: me })
}

/** Opt into / out of playing the dance game (local only — spectators stay quiet). */
export function isParticipating(): boolean {
  return participating
}

export function setParticipating(on: boolean): void {
  const me = localUserId()
  if (on && !isDanceBugEquipped()) {
    showDanceBugChip('Equip DANCE BUG to join', 6000)
    return
  }
  participating = on
  if (!on) {
    optedOut = true
    if (me) emitDance({ type: 'dance.leave', userId: me })
  } else {
    optedOut = false
  }
}

export function toggleParticipating(): boolean {
  setParticipating(!participating)
  return participating
}

/** Breakdance mode start/stop — host console (admin-gated at the UI layer). */
export function setDanceActive(on: boolean): void {
  setVenueActivity(on ? 'show' : 'social')
}

/** Host crowd-activity director — social / show / free_roam / choreography / paused. */
export function setVenueActivity(mode: VenueActivityMode): void {
  const me = localUserId()
  emitDance({ type: 'dance.setActivity', mode, byUserId: me ?? '' })
}

/** Host picks a named performance. Starts choreography mode and restarts the routine. */
export function setChoreographyRoutine(routineId: string): void {
  const me = localUserId()
  emitDance({ type: 'dance.setChoreography', routineId, byUserId: me ?? '' })
}

/** Host live crowd overlay — formation / mood / sync for the whole hangout. */
export function setCrowdControl(patch: {
  formation?: CrowdHostFormation | ''
  mood?: CrowdHostMood | ''
  sync?: CrowdHostSync | ''
}): void {
  const me = localUserId()
  emitDance({ type: 'dance.setCrowd', ...patch, byUserId: me ?? '' })
}

export function getCrowdFormation(): CrowdHostFormation | '' {
  return latestSnapshot?.crowdFormation ?? ''
}

export function getCrowdMood(): CrowdHostMood | '' {
  return latestSnapshot?.crowdMood ?? ''
}

export function getCrowdSync(): CrowdHostSync | '' {
  return latestSnapshot?.crowdSync ?? ''
}

export function getCrowdControlAt(): number {
  return latestSnapshot?.crowdControlAt ?? 0
}

export function getChoreographyRoutineId(): string {
  const live = latestSnapshot?.choreographyRoutineId?.trim()
  if (live) return live
  return config?.choreography.activeRoutineId ?? ''
}

export function getVenueActivityMode(): VenueActivityMode {
  return latestSnapshot?.activityMode ?? activityModeFromLegacyActivated(isDanceActivated())
}

export function getEffectiveVenueActivityMode(): ResumableActivityMode {
  const snap = latestSnapshot
  if (!snap) return activityModeFromLegacyActivated(config?.autoStart ?? false)
  return effectiveActivityMode(snap.activityMode, snap.resumeMode)
}

export function isVenueActivityPaused(): boolean {
  return getVenueActivityMode() === 'paused'
}

export function isClubAtmosphereActive(): boolean {
  const mode = getVenueActivityMode()
  if (mode === 'paused') {
    return isClubAtmosphereMode(latestSnapshot?.resumeMode ?? 'social')
  }
  return isClubAtmosphereMode(mode)
}

export function isCompetitiveShowActive(): boolean {
  return isCompetitiveShowMode(getEffectiveVenueActivityMode())
}

export function isDanceActivated(): boolean {
  return latestSnapshot?.activated ?? config?.autoStart ?? false
}

export function isOptedOut(): boolean {
  return optedOut
}

function presentUserIds(): string[] {
  const ids: string[] = []
  for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address) ids.push(identity.address.toLowerCase())
  }
  ids.sort()
  return ids
}

function computeCoordinator(): string | null {
  const ids = presentUserIds()
  const me = localUserId()
  // THE SILENT FREEZE. presentUserIds() reads PlayerIdentityData out of the
  // ECS, and the LOCAL player's copy can be late - or, for a guest, never
  // arrive at all. An empty list made computeCoordinator return null, which
  // made runCoordinator bail before it could ever set iAmCoordinator, which
  // left botMoveSystem returning early for the whole session: no crowd
  // director, no Scrap approach, no fight, and no error anywhere. If I know
  // who I am, I drive my own scene; with other players present the lowest
  // address still wins, so the election itself is unchanged.
  if (me && !ids.includes(me)) {
    ids.push(me)
    ids.sort()
  }
  return ids.length ? ids[0] : null
}

function applySnapshot(snap: DanceStateSnapshot): void {
  if (latestSnapshot && snap.rev < latestSnapshot.rev) return
  latestSnapshot = snap
}

function watchOwnEmotes(now: number): void {
  const me = localUserId()
  if (!me) return
  const commands = AvatarEmoteCommand.get(engine.PlayerEntity)
  let maxTs = -1
  let latestUrn: string | null = null
  for (const cmd of commands) {
    if (cmd.timestamp > maxTs) {
      maxTs = cmd.timestamp
      latestUrn = cmd.emoteUrn
    }
  }
  if (maxTs < 0) return
  if (!emoteWatchArmed) {
    // First sample: baseline, don't count emotes played before this moment.
    emoteWatchArmed = true
    lastEmoteTimestamp = maxTs
    return
  }
  if (maxTs > lastEmoteTimestamp) {
    lastEmoteTimestamp = maxTs
    lastOwnEmoteSeenAt = now
    if (latestUrn && isLocalDancer()) {
      emitDance({ type: 'dance.emote', userId: me, urn: latestUrn, ts: maxTs })
    }
  }
}

function runPresence(now: number, dt: number): void {
  const me = localUserId()
  if (!me) return
  const presence = samplePresence()
  if (!presence) return

  const dancing = isLocalDancer()
  if (!isDanceCompetitionLive()) {
    wasInSupport = presence.inSupport
    return
  }
  const { mayJoin } = syncDanceBugFloorHint(presence.inFloor)

  if (presence.inFloor && !participating && !optedOut && mayJoin) {
    participating = true
  }

  heartbeatTimer -= dt
  const allowed = mayJoin || isDanceBugEquipped()
  const shouldHeartbeat =
    (participating && !optedOut && allowed) ||
    (presence.inFloor && !optedOut && allowed) ||
    (dancing && (presence.inFloor || presence.inSupport))
  if (shouldHeartbeat && heartbeatTimer <= 0) {
    heartbeatTimer = HEARTBEAT_INTERVAL_S
    emitDance({ type: 'dance.join', userId: me, name: getPlayer()?.name ?? '' })
  }

  if (wasInSupport && !presence.inSupport && !presence.inFloor && !dancing && !participating) {
    emitDance({ type: 'dance.leave', userId: me })
  }
  wasInSupport = presence.inSupport

  // Dancer left the floor mid-performance → immediate report (faster than prune).
  if (dancing && latestSnapshot?.phase === 'active' && !presence.inFloor) {
    emitDance({ type: 'dance.floorExit', userId: me })
  }
}

/**
 * Scripted NPC turn — while the active dancer is a bot, the coordinator feeds
 * the deterministic emote plan through the same reducer path humans use. When
 * the plan ends (or the turn is a scripted fail) the feed simply stops and the
 * normal idle rule ejects the bot, exactly like a hesitating human.
 */
let npcScriptKey = ''
let npcScriptEndAt = 0
let npcNextEmoteAt = 0
let npcMoveIdx = 0

function driveNpcTurn(now: number): void {
  if (!config) return
  if (!isCompetitiveShowMode(model.activityMode)) return
  if (model.phase !== 'active' || !model.dancer || !isNpcUserId(model.dancer)) return
  const turn = model.turnCounter - 1
  const key = `${model.dancer}:${model.startedAt}`
  if (key !== npcScriptKey) {
    npcScriptKey = key
    const plan = npcTurnPlan(config, turn)
    npcScriptEndAt = model.startedAt + plan.durationS * 1000
    npcNextEmoteAt = model.startedAt + 400 // first move lands right after GO
    npcMoveIdx = 0
  }
  if (now >= npcScriptEndAt) return // silence → idle ejection does the rest
  if (now >= npcNextEmoteAt) {
    npcNextEmoteAt = now + 2200
    const urn = npcNextEmote(config, turn, npcMoveIdx++)
    inbound.push({ kind: 'emote', userId: model.dancer, urn, now })
  }
}

function runCoordinator(now: number, dt: number): void {
  const me = localUserId()
  const coordinator = computeCoordinator()
  if (!me || !coordinator) return

  const amCoordinator = coordinator === me
  if (amCoordinator && !iAmCoordinator) {
    // Takeover: resume from the last broadcast state rather than resetting.
    if (latestSnapshot && latestSnapshot.rev > model.rev) {
      model = modelFromSnapshot(latestSnapshot, now)
    }
  }
  iAmCoordinator = amCoordinator
  if (!amCoordinator) {
    inbound.length = 0 // only the coordinator consumes events
    return
  }
  if (!config) return

  driveNpcTurn(now)

  let changed = false
  while (inbound.length) {
    const event = inbound.shift()!
    const next = danceReducer(model, event, config)
    if (next !== model) {
      changed = changed || next.rev !== model.rev
      model = next
    }
  }
  const ticked = danceReducer(model, { kind: 'tick', now }, config)
  if (ticked !== model) {
    changed = changed || ticked.rev !== model.rev
    model = ticked
  }

  broadcastTimer -= dt
  if (changed || broadcastTimer <= 0) {
    broadcastTimer = BROADCAST_HEARTBEAT_S
    const snap = snapshotFromModel(model, me, config)
    latestSnapshot = snap
    emitDance({ type: 'dance.state', snap })
  }
}

function danceRuntimeSystem(dt: number): void {
  if (!config) return
  presenceTimer -= dt
  if (presenceTimer > 0) return
  presenceTimer = PRESENCE_INTERVAL_S

  const now = Date.now()
  runPresence(now, PRESENCE_INTERVAL_S)
  watchOwnEmotes(now)
  runCoordinator(now, PRESENCE_INTERVAL_S)
}

export function initDanceRuntime(danceConfig: DanceVenueConfig): void {
  config = danceConfig
  model = initialDanceModel(danceConfig.autoStart)

  onDance('dance.state', (msg) => {
    // Coordinator trusts its own model; everyone else applies broadcasts.
    if (!iAmCoordinator) applySnapshot(msg.snap)
  })
  onDance('dance.join', (msg) => {
    inbound.push({ kind: 'join', userId: msg.userId.toLowerCase(), name: msg.name, now: Date.now() })
  })
  onDance('dance.leave', (msg) => {
    inbound.push({ kind: 'leave', userId: msg.userId.toLowerCase(), now: Date.now() })
  })
  onDance('dance.emote', (msg) => {
    inbound.push({ kind: 'emote', userId: msg.userId.toLowerCase(), urn: msg.urn, now: Date.now() })
  })
  onDance('dance.floorExit', (msg) => {
    inbound.push({ kind: 'floorExit', userId: msg.userId.toLowerCase(), now: Date.now() })
  })
  onDance('dance.setActive', (msg) => {
    inbound.push({ kind: 'setActive', on: msg.on, now: Date.now() })
  })
  onDance('dance.setActivity', (msg) => {
    inbound.push({ kind: 'setActivity', mode: msg.mode, now: Date.now() })
  })
  onDance('dance.setChoreography', (msg) => {
    inbound.push({ kind: 'setChoreography', routineId: msg.routineId, now: Date.now() })
  })
  onDance('dance.setCrowd', (msg) => {
    inbound.push({
      kind: 'setCrowd',
      formation: msg.formation,
      mood: msg.mood,
      sync: msg.sync,
      now: Date.now()
    })
  })

  engine.addSystem(danceRuntimeSystem)
}
