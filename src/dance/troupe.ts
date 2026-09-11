/**
 * The NPC troupe — uniquely named bots placed by their groups' authored zones.
 * Behavior states are driven by the shared snapshot:
 *
 *   idle       — mode off or nothing happening: hangout LIFE (see below)
 *   cheer      — countdown / human dancing: staggered claps & hands-up
 *   celebrate  — a new dancer was just selected: hype
 *   reaction   — a dancer failed: playful shrug/"ooooh"
 *   performing — the bot whose turn it is walks to center and mirrors the
 *                scripted emotes the coordinator feeds through the reducer
 *
 * Bots are AvatarShape renderings (no physics). Path respect is three-layered:
 * TARGETS are nudged out of the publish-baked no-go discs (zones.ts), every
 * walk STEP steers around mesh discs (@shared/dance-crowd-steering), and live
 * guests are temporary discs plus a brief acknowledge interrupt
 * (@shared/npc-ground-rules) — pause, face + wave, walk around, resume.
 *
 * Hangout life (show off): bots get deterministic roles — chat clusters that
 * face each other and gesture now and then, watchers that face the floor with a
 * ready bounce, and roamers that wander waypoints around the venue.
 */
import { engine, AvatarShape, PlayerIdentityData, Transform, Entity, MeshCollider, ColliderLayer, InputAction, PointerEvents, pointerEventsSystem } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import {
  isNpcDanceRole,
  npcDanceTempoScale,
  npcAvatarShapeId,
  npcDisplayName,
  npcGroupForIndex,
  npcGroupSlices,
  resolveNpcAttributes
} from '@shared/dance-venue-contract'
import { castDefaultLooks } from '@shared/cast-packs'
import type { DanceOutfit } from '@shared/dance-venue-contract'
import type {
  DanceStateSnapshot,
  DanceVenueConfig,
  NpcGroup,
  NpcGroupRole
} from '@shared/dance-venue-contract'
import { effectiveNpcRole } from './npc-activity'
import type { WorldDirectorSettings } from '@shared/world-director-contract'
import { NPC_SPAWN_PER_TICK, nextNpcSpawnCount } from '@shared/boot-pace'
import { npcLodDiff, npcLodLiveCap, npcLodPromoteBudget, pickNpcLodLive, NPC_LOD } from '@shared/npc-lod'
import {
  insideAnyDisc,
  projectOutOfDiscs,
  separateAgentStep,
  settleStandingStep,
  steerStep,
  type SteerDisc
} from '@shared/dance-crowd-steering'
import {
  emptyGuestAckState,
  guestPersonalSpaceDiscs,
  planGuestAcknowledge,
  type GuestAckState
} from '@shared/npc-ground-rules'
import { sampleRoamWaypoint } from '@shared/crowd-navigation'
import { planGreeting } from '@shared/npc-encounters'
import { reportLandingCrowdProgress } from '../plugins/landing'
import { scrapGuestUnavailable } from '../plugins/scrap-guard'
import { scrapEngageHoverText } from '@shared/scrap-contract'
import { showScreenAnnouncement } from '../social/announcement-banner'
import { isScrapActive, isScrapLeased, scrapIntentFor, scrapPluginConfig, activeScrapSession, tickScrapDirector, queuePlayerScrap, localScrapPlayerId, scrapInputLocked, scrapCrowdQuiet } from '../plugins/scrap'
import {
  createScrapTargetMark,
  destroyScrapTargetMark,
  hoveredScrapNpcIndex,
  paintScrapTargetMark,
  registerScrapHit,
  scrapPickModeFor,
  scrapProvokeNpcIndex,
  selectScrapNpc,
  selectedScrapNpcIndex,
  unregisterScrapHit,
  runNpcClickAction,
  notifyNpcProvoke,
  hasNpcClickAction,
  type ScrapTargetMark
} from '../plugins/scrap-pick'
import {
  isScrapCrowdClapEmote,
  scrapCrowdEmoteDuringBout,
  scrapStandOff,
  SCRAP_FIGHT_MIN_M,
  SCRAP_NPC_WIN_RESOLVE_MS
} from '@shared/scrap-session'
import { onActionKey } from '../action-keys'
import { syncScrapFight, consumeScrapFightFx } from '../plugins/scrap-fight'
import { executeScrapShove, executeScrapProvocationShove, scrapProvocation } from '../plugins/scrap'
import { silenceBreakdanceCrowdAudioForScrap } from './reaction-audio'
import { scrapProvocationBeat, scrapProvocationEmote, scrapProvocationLine } from '@shared/scrap-anger'
import { scrapGloatBeat, scrapGloatBeatIndex, scrapPersonaFor, type ScrapPersona } from '@shared/scrap-lines'
import { scrapKoClipMs, scrapKoLoopRole, scrapKoRole } from '@shared/scrap-emotes'
import { scrapKoBodyAngles, scrapKoPose, scrapKoPreludeMs, scrapKoStyleFor, scrapKoTravel, type ScrapKoStyle } from '@shared/scrap-fight'
import {
  scrapKoClampToDeck,
  scrapKoDeck,
  scrapKoDropY,
  scrapKoFallPlan,
  scrapKoGround,
  scrapKoKnockbackPlan,
  scrapKoPointOffDeck,
  scrapKoReturnPoint,
  scrapNpcNeedsDeckRescue
} from '@shared/scrap-ko-ground'
import { scrapHitKnockSpec, type ScrapHitKnockSpec } from '@shared/scrap-hit-physics'
import { SCRAP_GLOAT_MARKER, SCRAP_GUARD_MARKER } from '@shared/scrap-emotes'
import { scrapSkillFor } from '@shared/scrap-skill'
import { scrapEmotePaths, scrapEmoteRef, scrapFightBoutRoles, type ScrapEmoteRole } from '@shared/scrap-emotes'
import { allSceneEmoteUrns, dedupeUrns, ensureNpcEmote, npcEmoteArmed, npcEmoteTrigger, npcHoldEmoteUrns, NPC_EMOTE_SLOTS, onSceneEmotesResolved, resolveSceneEmotes, sceneEmoteUrn as resolveSceneEmoteUrn, sceneEmoteUrnFor, setNpcEmotesIfChanged } from './scene-emotes'
import { showNpcSpeech } from './npc-speech'
import { getDanceConfig, getCrowdControlAt, getCrowdFormation, getCrowdMood, getCrowdSync, isDanceCoordinator, isVenueActivityPaused, localUserId } from './runtime'
import {
  crowdHostBeatOffsetMs,
  crowdHostEmote,
  crowdHostSpeechLine,
  crowdFormationHoldsStill,
  effectiveCrowdFormation
} from '@shared/crowd-host-control'
import { punchOwnsCrowd } from '../plugins/punch-crowd-lease'
import { emitDance, onDance } from './bus'
import { initNpcNetworkSync, npcNetworkDiag } from './npc-network'
import { runCrowdDirectorTick } from './crowd-director'
import { getRuntimeContext, getRuntimeFloorZones } from '../social/runtime-context'
import {
  dancePointScene,
  danceGatherRadius,
  danceFloorZone,
  danceSupportZone,
  floorSurfaceY,
  groundPointScene,
  obstructionDiscsScene,
  plotBoundsScene,
  roamPlotBounds,
  zoneCenterScene,
  zoneMemberPointScene
} from './zones'

const TROUPE_INTERVAL_S = 0.4
type HangoutRole = 'chat' | 'watch' | 'roam'

export interface TroupeBot {
  entity: Entity
  index: number
  atCenter: boolean
  emoteTimestamp: number
  lastEmoteUrn: string
  nextIdleAt: number
  nextCheerAt: number
  /** Walk target (scene coords) — bots steer toward it so they visibly move. */
  tx: number
  ty: number
  tz: number
  mode: 'center' | 'hangout' | 'free_roam' | 'choreo' | 'audience'
  holdUntil: number
  /**
   * ‼️A HARD PIN, owned by whatever staged the bot (the punch machine's fighter).
   * While set, the walk pass, the personal-space settle and Scrap all leave
   * the body exactly here — the same treatment a stationed vendor gets. The
   * fighter used to be steered off its mark by guests and neighbours every
   * tick and snapped back by the machine: "going left and right like crazy".
   */
  pin: { x: number; z: number } | null
  facePx: number | null
  facePz: number | null
  stopEmoteAt: number
  nextRoamAt: number
  seed: number
  /** Authored-route cursor for free-roam mode. */
  routeIds: string[]
  routeCursor: number
  floorIndex: number
  roamRole: 'chat' | 'watch' | 'roam' | 'chase' | 'jump' | null
  chaseTarget: number | null
  nextGestureAt: number
  /** Free-roam progress watchdog — used to escape visual mesh dead ends. */
  lastProgressAt: number
  lastTargetDistance: number
  recoveryCount: number
  /** Stuck agents park and socialize until this retry time. */
  yieldUntil: number
  /** Completed venue-wide relocations in the current free-roam session. */
  freeRoamTrips: number
  /** Stable home for subtle ambient shifts; reset by explicit destinations. */
  ambientAnchorX: number | null
  ambientAnchorY: number | null
  ambientAnchorZ: number | null
  nextAmbientAt: number
  /** Ground rule: brief guest-acknowledge interrupt state. */
  guestAck: GuestAckState
  /** Greetings performed so far — rotates this bot through its card pool. */
  greetCount: number
  /** Last Scrap beat applied — replay only when the director changes it. */
  scrapBeatKey: string
  /** Knocked down after a player win; cleared when they flee. */
  scrapDown: boolean
  /** Wall-clock start of the KO fall lerp. 0 = not falling. */
  scrapFallAt: number
  scrapFallOx: number
  scrapFallOy: number
  scrapFallOz: number
  scrapFallYaw: number
  /** Guest they fell away from — used if the intent is still `guard_up`. */
  scrapFallGuestX: number
  scrapFallGuestZ: number
  /** Invisible pointer volume so guests can click Fight on this NPC. */
  scrapHit: Entity | null
  /** Hover last written to `scrapHit` — rewritten only when the answer changes. */
  scrapHover: string
  scrapMark: ScrapTargetMark | null
  scrapWall: Entity | null
  scrapWasLeased: boolean
  scrapSolid: boolean
  /** How they went down this bout, set by the KO fx; null = standing. */
  scrapKoStyle: ScrapKoStyle | null
  /** True once the floor idle replaced the knockout clip. */
  scrapKoIdle: boolean
  /** True once the body clip replaced a dizzy prelude. */
  scrapKoBody: boolean
  /** Wall-clock end of the knockback arc. 0 = still being launched. */
  scrapKoLandedAt: number
  /** When they cleared the sky-island rope. 0 = still on the deck. */
  scrapKoRimAt: number
  /** Wall-clock start of the body clip — the floor idle is timed from here. */
  scrapKoBodyAt: number
  /** True once the fatal has been LOADED into the emote slots (not yet played). */
  scrapKoArmed: boolean
  /** Third press: they walk up and push until this time. */
  scrapPushUntil: number
  /** The shove that goes with the push, fired once at this time. 0 = done. */
  scrapPushShoveAt: number
  /** Getting up after a knockout: no walking until this time. */
  scrapRiseUntil: number
  /** A fight clip (jab / cross / taunt / hurt) is playing until this time: do not re-fire the guard over it. */
  scrapClipUntil: number
  /** Wall-clock moment they last stopped moving in the ring. 0 = moving now. */
  scrapStillSince: number
  /** A clip held back by one tick so a pre-step cannot cancel it. 0 = nothing pending. */
  scrapClipAt: number
  scrapClipRole: ScrapEmoteRole | null
  scrapClipLoop: boolean
  /** Mid-fight hit hop. 0 = not sliding. */
  scrapHitUntil: number
  scrapHitOx: number
  scrapHitOy: number
  scrapHitOz: number
  scrapHitDx: number
  scrapHitDz: number
  scrapHitLift: number
  scrapHitDuration: number
  /** AvatarShape is attached — far bots keep a Transform only. */
  avatarLive: boolean
  /** Stationed host NPC (vendor). Not crowd-synced. Hover-select like everyone else. */
  stationed: boolean
  stationX: number
  stationY: number
  stationZ: number
  /** Hover label. Empty → Scrap skill word. */
  selectLabel: string
  /** Host floor_zone id this stationed NPC acts inside. */
  zoneId: string | null
  /** Scene metres from station — scrap steps stay inside this disc. */
  zoneRadiusM: number
  /**
   * Clips a scripted performance has ARMED on this bot (already resolved URNs).
   * Empty = this bot carries the generic crowd list. While it is set, the crowd
   * backfill leaves the list alone and `playBotEmote` reserves these slots, so
   * the clip is bound long before the frame it has to fire on.
   */
  pinnedEmotes: string[]
}

/** Deterministic hangout role: ~3/5 chat in clusters, 1/5 watch the floor,
 *  1/5 roam the venue. */
export function hangoutRole(index: number): HangoutRole {
  const m = index % 5
  if (m === 2) return 'watch'
  if (m === 3) return 'roam'
  return 'chat'
}

function botCrowdOverlay() {
  return {
    formation: getCrowdFormation(),
    mood: getCrowdMood(),
    sync: getCrowdSync(),
    changedAt: getCrowdControlAt()
  }
}

function botCrowdFormation(bot: TroupeBot): ReturnType<typeof effectiveCrowdFormation> {
  const config = getDanceConfig()
  const group = config ? botGroup(config, bot.index) : null
  return effectiveCrowdFormation(botCrowdOverlay(), group?.formation)
}

/** Squad overlay (or a published grid group) stands in rank. */
export function botHoldsFormation(bot: TroupeBot): boolean {
  return crowdFormationHoldsStill(botCrowdFormation(bot))
}

export function isSupportRingBot(index: number): boolean {
  const config = getDanceConfig()
  if (!config?.supportZoneId) return false
  const group = botGroup(config, index)
  return group?.place.kind === 'zone' && group.place.zoneId === config.supportZoneId
}

/** Cypher beat with low-intensity spectator variation. The queued player's
 *  dedicated ready bounce remains visually distinct from this ambient mix. */
export function cypherSupportMove(now: number, live: boolean, spectatorIndex = 0): string {
  const config = getDanceConfig()
  const crowd = config?.crowd
  const twoHand = crowd?.handsUpEmote || 'handsair'
  const oneHand = 'fistpump'
  const clap = 'clap'
  const ready = crowd?.readyEmote || 'emotes/bd_ready_3_x2_emote.glb'
  const periodMs = live ? 2800 : Math.max(3000, (crowd?.periodS || 4) * 1000)
  const beat = Math.floor(now / periodMs)
  const ambient = [clap, 'dontsee', twoHand, ready]
  const move = live
    ? [twoHand, oneHand, twoHand, clap][(beat + spectatorIndex) % 4]!
    : ambient[(beat + spectatorIndex) % ambient.length]!
  return scrapCrowdEmoteDuringBout(move, activeScrapSession()?.phase)
}

function nextRand(bot: TroupeBot): number {
  bot.seed = (Math.imul(bot.seed, 1103515245) + 12345) >>> 0
  return bot.seed / 4294967296
}

let bots: TroupeBot[] = []

export function getTroupeBots(): readonly TroupeBot[] {
  return bots.filter((bot) => !bot.stationed)
}
let troupeTimer = 0
const WALK_SPEED = 1.9 // m/s
const FLEE_SPEED = 4.4 // m/s — panic flee (tease walk-off / escape), not post-KO
/**
 * Ring-station arrive tolerance. 0.04 m was inside the noise of the orbit
 * solver, so the bot "chased" forever and never left its walk animation.
 */
const SCRAP_RING_ARRIVE_M = 0.12
/**
 * How long an AvatarShape must hold still before a fight clip is fired at it.
 * Trigger on the same tick you stop walking and the Explorer is still blending
 * out of locomotion — the expression is swallowed.
 */
const SCRAP_CLIP_SETTLE_MS = 120
/** Get-up clip length before they may walk after a knockout. */
const SCRAP_RISE_MS = 2200

/** The bundled fatal for a style, or '' when this build ships no clip for it. */
function koClipRef(style: ScrapKoStyle): string {
  const ref = scrapEmoteRef(scrapKoRole(style), (path) => resolveSceneEmoteUrn(path) !== null)
  return ref.startsWith('emotes/') ? ref : ''
}

/**
 * LOAD THE FATAL BEFORE YOU FIRE IT.
 *
 * An AvatarShape can only play a clip that is in its `emotes` list, and the
 * Explorer needs a beat to bind a newly added GLB to that armature. The KO clip
 * used to be slotted in on the very frame it was triggered — a one-shot, with
 * nothing to re-fire it — so the trigger landed on a clip that was not resident
 * yet and the opponent stayed on their feet. The player fell correctly through
 * the whole bug, because `triggerSceneEmote` plays a fatal by PATH and never
 * touches a slot list. That asymmetry is what "he never falls" was.
 *
 * Arming at the top of the fall hands the launch arc (0.8-2.1 s) to the loader,
 * and pins the floor idle behind it so the handover needs no new clip either.
 */
function armKoClip(bot: TroupeBot, style: ScrapKoStyle): void {
  const ref = koClipRef(style)
  if (!ref) return
  const shape = AvatarShape.getMutableOrNull(bot.entity)
  if (!shape) return
  const urn = sceneEmoteUrnFor(ref, scrapKoLoopRole(scrapKoRole(style)))
  if (urn) ensureNpcEmote(shape, urn)
}

/**
 * THE FALL. The clip is the body; Transform is a short stumble onto the floor.
 * A death clip LOOPS on an AvatarShape (fall, snap up, fall...), so once the
 * clip has run its length the floor idle takes over — looping — and holds them.
 */
function playKoClip(bot: TroupeBot, style: ScrapKoStyle): void {
  const role = scrapKoRole(style)
  const ref = koClipRef(style)
  if (ref) {
    const shape = AvatarShape.getMutableOrNull(bot.entity)
    const urn = sceneEmoteUrnFor(ref, scrapKoLoopRole(role))
    // Fire only from a slot armed at bout start (or during the launch). Slotting
    // the fatal on this frame is the standing dummy: Explorer has not bound it.
    if (shape && urn && npcEmoteArmed(shape, urn)) {
      playFightEmote(bot, role, scrapKoLoopRole(role))
      return
    }
    layBotDown(bot)
    bot.scrapKoIdle = true
    return
  }
  // No fatal in this build. Every KO role falls back to `dontsee`, which is a
  // STANDING base emote — playing it here is precisely the "he never falls"
  // report. Go straight to the floor hold instead; it is the honest answer and
  // it is the one clip that is already pinned in every NPC's slots.
  const downRef = scrapEmoteRef('downIdle', (p) => resolveSceneEmoteUrn(p) !== null)
  const downUrn = downRef.startsWith('emotes/') ? sceneEmoteUrnFor(downRef, true) : null
  const shape = AvatarShape.getMutableOrNull(bot.entity)
  if (downUrn && shape && npcEmoteArmed(shape, downUrn)) {
    playFightEmote(bot, 'downIdle', true)
  } else {
    layBotDown(bot)
  }
  bot.scrapKoIdle = true
}

/**
 * Last resort: no fatal, no floor hold, nothing bundled that can put a body on
 * the ground. Lay them down with the Transform so a knockout is still a
 * knockout. `standBotUp` restores both the height and the upright yaw.
 */
function layBotDown(bot: TroupeBot): void {
  const tf = Transform.getMutableOrNull(bot.entity)
  if (!tf) return
  tf.rotation = Quaternion.fromEulerDegrees(-90, bot.scrapFallYaw, 0)
  const y = scrapKoPointOffDeck(tf.position.x, tf.position.z) ? tf.position.y : bot.ty + 0.15
  tf.position = Vector3.create(tf.position.x, y, tf.position.z)
}

function tickKnockoutFall(
  bot: TroupeBot,
  tf: ReturnType<typeof Transform.getMutable>,
  guestX: number,
  guestZ: number,
  nowMs: number
): void {
  const style = bot.scrapKoStyle ?? 'crumple'
  const preludeMs = scrapKoPreludeMs(style)
  if (!bot.scrapFallAt) {
    bot.scrapFallAt = nowMs
    bot.scrapFallOx = tf.position.x
    bot.scrapFallOy = tf.position.y
    bot.scrapFallOz = tf.position.z
    bot.scrapFallGuestX = guestX
    bot.scrapFallGuestZ = guestZ
    const dx = guestX - tf.position.x
    const dz = guestZ - tf.position.z
    bot.scrapFallYaw = (Math.atan2(dx, dz) * 180) / Math.PI
    bot.scrapKoIdle = false
    bot.scrapKoBody = false
    bot.scrapKoLandedAt = 0
    bot.scrapKoRimAt = 0
    bot.scrapKoBodyAt = 0
    bot.scrapKoArmed = false
    // A lingering guard/idle expression must not keep an already-defeated body
    // standing. From this frame the guaranteed Transform tumble owns the pose.
    stopBotEmote(bot)
    // The prelude plays on a STILL body, so it is the one clip here that always
    // showed. Everything after it used to be thrown away — see below.
    if (preludeMs > 0) playFightEmote(bot, style === 'stagger' ? 'hurt' : 'dizzy')
  }
  if (preludeMs > 0 && nowMs - bot.scrapFallAt < preludeMs) {
    bot.scrapDown = false
    return
  }
  // Load the fatal now, play it after the landing. A prelude would have taken
  // slot zero back, so this waits until the prelude is behind us.
  if (!bot.scrapKoArmed) {
    bot.scrapKoArmed = true
    armKoClip(bot, style)
  }
  const travel = scrapKoTravel(style)
  const originT = bot.scrapFallAt + preludeMs
  const u = Math.min(1, (nowMs - originT) / travel.durationMs)
  const ground = scrapKoGround()
  const plan = scrapKoFallPlan({
    originX: bot.scrapFallOx,
    originY: bot.scrapFallOy,
    originZ: bot.scrapFallOz,
    foeX: guestX,
    foeZ: guestZ,
    backM: travel.backM,
    upM: travel.upM,
    solids: ground.solids,
    sceneMin: ground.sceneMin,
    sceneMax: ground.sceneMax,
  })
  const pose = scrapKoPose(u, { ...travel, backM: plan.appliedBackM, upM: plan.appliedLiftM })
  const body = scrapKoBodyAngles(style, Math.max(u, bot.scrapKoRimAt ? 1 : 0))
  const frac = plan.appliedBackM > 0.001 ? pose.back / plan.appliedBackM : 0
  const x = bot.scrapFallOx + (plan.destX - bot.scrapFallOx) * frac
  const z = bot.scrapFallOz + (plan.destZ - bot.scrapFallOz) * frac
  if (plan.overRim && scrapKoPointOffDeck(x, z) && !bot.scrapKoRimAt) {
    bot.scrapKoRimAt = nowMs
  }
  /**
   * THE FALL RUNS IN TWO ACTS, NEVER AT ONCE.
   *
   * The knockback arc used to write `tf.position` on every tick of an 800-2100 ms
   * travel while the death clip was supposed to be playing over exactly that
   * window — and a moving AvatarShape is in its locomotion state, which outranks
   * `expressionTriggerId`. So the clip was cancelled on every frame of its own
   * length: the opponent slid backwards standing bolt upright and never
   * collapsed, while the player's own KO (triggerSceneEmote, path-based, on a
   * pinned body) fell correctly. That asymmetry is the whole bug.
   *
   * The Transform now owns the coarse tumble as well as the launch. This makes
   * the fall visible from the KO frame and guarantees an on-floor result even
   * when Explorer swallows the one-shot AvatarShape death expression. The body
   * freezes after landing on a plaza; on a sky island it keeps dropping in Y
   * so they cannot hang beside the rope.
   */
  let y = bot.scrapFallOy + pose.lift + body.floorLiftM
  if (bot.scrapKoRimAt) {
    y = scrapKoDropY(bot.scrapFallOy, (nowMs - bot.scrapKoRimAt) / 1000)
    bot.scrapDown = true
  }
  const freezePlaza = !plan.overRim && !!bot.scrapKoLandedAt
  if (!freezePlaza) {
    tf.position = Vector3.create(x, y, z)
    tf.rotation = Quaternion.fromEulerDegrees(
      body.pitchDeg,
      bot.scrapFallYaw + pose.yawAdd,
      body.rollDeg
    )
    bot.tx = x
    bot.tz = z
    if (!bot.scrapKoRimAt) bot.scrapDown = u >= 1
    if (u >= 1 && !bot.scrapKoLandedAt) {
      bot.scrapKoLandedAt = nowMs
      bot.scrapKoBody = true
      bot.scrapKoBodyAt = nowMs
      bot.scrapKoIdle = true
      if (plan.overRim && !bot.scrapKoRimAt) bot.scrapKoRimAt = nowMs
    }
  }
  // A death clip LOOPS on an AvatarShape (fall, snap up, fall...), so hand over
  // to the floor idle once it has run its length — measured from when the clip
  // actually STARTED, not from the top of the launch.
  if (
    bot.scrapKoBody &&
    !bot.scrapKoIdle &&
    nowMs - bot.scrapKoBodyAt >= scrapKoClipMs(style)
  ) {
    bot.scrapKoIdle = true
    playFightEmote(bot, 'downIdle', true)
  }
}

function standBotUp(bot: TroupeBot, tf: ReturnType<typeof Transform.getMutable>, nowMs = 0): void {
  if (!bot.scrapDown && !bot.scrapFallAt) return
  bot.scrapDown = false
  bot.scrapFallAt = 0
  bot.scrapKoStyle = null
  bot.scrapKoIdle = false
  bot.scrapKoBody = false
  bot.scrapKoLandedAt = 0
  bot.scrapKoRimAt = 0
  bot.scrapKoBodyAt = 0
  bot.scrapKoArmed = false
  const offIsland =
    scrapKoPointOffDeck(tf.position.x, tf.position.z) || tf.position.y < bot.ty - 1.5
  const home = offIsland
    ? scrapKoReturnPoint(bot.scrapFallOx || tf.position.x, bot.scrapFallOz || tf.position.z)
    : null
  if (home) {
    tf.position = Vector3.create(home.x, bot.ty, home.z)
    bot.tx = home.x
    bot.tz = home.z
  } else {
    tf.position = Vector3.create(tf.position.x, bot.ty, tf.position.z)
  }
  tf.rotation = Quaternion.fromEulerDegrees(0, bot.scrapFallYaw, 0)
  bot.scrapClipUntil = 0
  bot.scrapClipAt = 0
  // Up off the floor first; the walk waits for the clip.
  if (nowMs) {
    playFightEmote(bot, 'rise')
    bot.scrapRiseUntil = nowMs + SCRAP_RISE_MS
  }
}

function stepStraight(pos: { x: number; z: number }, to: { x: number; z: number }, maxM: number): { x: number; z: number } {
  const dx = to.x - pos.x
  const dz = to.z - pos.z
  const dist = Math.hypot(dx, dz)
  if (dist <= maxM || dist < 1e-6) return { x: to.x, z: to.z }
  return { x: pos.x + (dx / dist) * maxM, z: pos.z + (dz / dist) * maxM }
}

function faceToward(entity: Entity, pos: { x: number; z: number }, at: { x: number; z: number }): void {
  const dx = at.x - pos.x
  const dz = at.z - pos.z
  if (Math.hypot(dx, dz) < 0.05) return
  const yawDeg = (Math.atan2(dx, dz) * 180) / Math.PI
  const tf = Transform.getMutableOrNull(entity)
  if (tf) tf.rotation = Quaternion.fromEulerDegrees(0, yawDeg, 0)
}

function rebakeBotTransform(entity: Entity): void {
  const tf = Transform.getMutableOrNull(entity)
  if (!tf) return
  tf.position = Vector3.create(tf.position.x, tf.position.y, tf.position.z)
  tf.rotation = Quaternion.create(tf.rotation.x, tf.rotation.y, tf.rotation.z, tf.rotation.w)
}

function startHitKnock(
  bot: TroupeBot,
  tf: ReturnType<typeof Transform.getMutable>,
  guestX: number,
  guestZ: number,
  spec: ScrapHitKnockSpec,
  nowMs: number
): boolean {
  const ground = scrapKoGround()
  const plan = scrapKoKnockbackPlan({
    originX: tf.position.x,
    originY: tf.position.y,
    originZ: tf.position.z,
    foeX: guestX,
    foeZ: guestZ,
    backM: spec.backM,
    upM: spec.liftM,
    solids: ground.solids,
    sceneMin: ground.sceneMin,
    sceneMax: ground.sceneMax,
    minTravelM: 0.28
  })
  if (plan.stayPut) return false
  const dest = scrapKoClampToDeck(plan.destX, plan.destZ)
  bot.scrapHitOx = tf.position.x
  bot.scrapHitOy = tf.position.y
  bot.scrapHitOz = tf.position.z
  bot.scrapHitDx = dest.x
  bot.scrapHitDz = dest.z
  bot.scrapHitLift = plan.appliedLiftM
  bot.scrapHitDuration = spec.durationMs
  bot.scrapHitUntil = nowMs + spec.durationMs
  bot.scrapStillSince = 0
  return true
}

function tickHitKnock(
  bot: TroupeBot,
  tf: ReturnType<typeof Transform.getMutable>,
  nowMs: number
): boolean {
  if (!bot.scrapHitUntil) return false
  if (nowMs >= bot.scrapHitUntil) {
    tf.position = Vector3.create(bot.scrapHitDx, bot.scrapHitOy, bot.scrapHitDz)
    bot.tx = bot.scrapHitDx
    bot.tz = bot.scrapHitDz
    bot.scrapHitUntil = 0
    bot.scrapStillSince = nowMs
    return false
  }
  const u = Math.max(0, Math.min(1, 1 - (bot.scrapHitUntil - nowMs) / Math.max(1, bot.scrapHitDuration)))
  const ease = 1 - (1 - u) * (1 - u)
  const x = bot.scrapHitOx + (bot.scrapHitDx - bot.scrapHitOx) * ease
  const z = bot.scrapHitOz + (bot.scrapHitDz - bot.scrapHitOz) * ease
  const lift = bot.scrapHitLift * Math.sin(Math.PI * u)
  tf.position = Vector3.create(x, bot.scrapHitOy + lift, z)
  bot.tx = x
  bot.tz = z
  return true
}

function faceCenter(entity: Entity, pos: { x: number; z: number }): void {
  const zone = danceFloorZone()
  if (!zone) return
  faceToward(entity, pos, zoneCenterScene(zone))
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5))

function botGroup(config: DanceVenueConfig, index: number): NpcGroup | null {
  return npcGroupForIndex(config.npc.count, config.npc.groups, index)
}

/**
 * The role this bot is acting on RIGHT NOW.
 *
 * Host → ACTIVITY retargets one group live (dance/npc-activity.ts); with no override
 * this is exactly the published `group.role`. Returns null for an unclaimed NPC with no
 * blanket override, so the ambient remainder keeps its deterministic hangout role.
 * Read this — never `group.role` — anywhere behaviour is chosen.
 */
function botRole(group: NpcGroup | null): NpcGroupRole | null {
  return effectiveNpcRole(group)
}

/**
 * True when this dancer belongs to a group the author actually created.
 *
 * A group assignment is an AUTHORED instruction, not a mode: "these 25 dance together"
 * has to hold whether or not a show happens to be running. Show mode used to route every
 * bot through the generic crowd behaviour, which never reads group.role — so switching
 * the dance app on silently threw away every group role the author had set. The crowd
 * director asks this before taking over a bot.
 */
export function botHasAuthoredGroup(index: number): boolean {
  const config = getDanceConfig()
  return !!config && !!botGroup(config, index)
}

/** Stable home inside the group's authored place. Floor changes are applied as
 * direct runtime placement; NPCs do not pretend to walk stairs or use elevators. */
function groupHomePoint(
  config: DanceVenueConfig,
  bot: TroupeBot,
  salt = 0
): { x: number; y: number; z: number } | null {
  const group = botGroup(config, bot.index)
  if (!group) {
    const support = danceSupportZone()
    if (!support) return null
    bot.floorIndex = support.floorIndex
    return zoneMemberPointScene(support, bot.index, salt)
  }
  if (group.place.kind === 'zone') {
    const authored = getRuntimeFloorZones().find((item) => item.id === group.place.zoneId)
    if (authored) {
      bot.floorIndex = authored.floorIndex
      // Index WITHIN the group, not the crew — circle and rows need to know where this
      // dancer sits in its own formation, and how many dancers share it.
      const slice = npcGroupSlices(config.npc.count, config.npc.groups).find(
        (s) => s.group?.id === group.id
      )
      const localIndex = slice ? bot.index - slice.start : bot.index
      const groupSize = slice ? slice.size : group.count
      const formation = botCrowdFormation(bot)
      return zoneMemberPointScene(authored, localIndex, salt, formation, groupSize)
    }
    // A group can be saved with `zoneId: null` (or pointing at a zone that was since
    // deleted). Returning null here left the whole group on its initial target of
    // 0,0,0 — 25 bots stacked on the scene corner, emoting but never placed. Fall
    // back to the support zone, exactly like a bot with no group at all.
    const support = danceSupportZone()
    if (!support) return null
    bot.floorIndex = support.floorIndex
    return zoneMemberPointScene(support, bot.index, salt)
  }
  if (group.place.kind === 'scene') {
    // A scene-placed group roams the WHOLE plot — that is the whole point of it, and it
    // is what a city district uses. This branch did not exist: `kind: 'scene'` fell
    // through to `return null`, so setBotTarget saw no home, bailed on `!home && !zone`
    // in hangout mode, and every bot kept its spawn target of 0,0,0. A hundred roamers
    // published correctly and stacked invisibly on the scene origin (owner in-world,
    // 2026-08-12: "there is no population, no avatars, no NPCs walking around").
    const wp = sampleRoamWaypoint(
      config.crowdNavigation,
      bot.index,
      salt,
      roamPlotBounds(),
      config.obstructions
    )
    if (wp) {
      bot.floorIndex = wp.floorIndex
      // The waypoint's own storey, resolved by the one helper — a hardcoded 0 here was
      // right outdoors and wrong the moment a roam zone lived on a floor.
      return { x: wp.x, y: floorSurfaceY(wp.floorIndex), z: wp.z }
    }
    // No roam zones and no plot bounds — fall back to the support circle rather than
    // leaving the bot on the origin.
    const support = danceSupportZone()
    if (!support) return null
    bot.floorIndex = support.floorIndex
    return zoneMemberPointScene(support, bot.index, salt)
  }
  return null
}

/** Centre of a bot's chat cluster — where chatters look, so a group reads as a
 *  conversation circle instead of three people staring at walls. */
function clusterCentroid(bot: TroupeBot): { x: number; z: number } | null {
  const config = getDanceConfig()
  const group = config ? botGroup(config, bot.index) : null
  const zone =
    group?.place.kind === 'zone'
      ? getRuntimeFloorZones().find((item) => item.id === group.place.zoneId) ?? null
      : danceSupportZone()
  return zone ? zoneCenterScene(zone) : null
}

/** Set a bot's walk TARGET for the given mode (it steers there via botMoveSystem). */
export function setBotTarget(bot: TroupeBot, mode: 'center' | 'hangout'): void {
  const config = getDanceConfig()
  // A group anchored to a zone or a floor knows where it lives WITHOUT a dance
  // floor to be relative to. Asking for the dance set first meant a venue with no
  // dance placement left every bot on its spawn target — targets at 0,0,0, the
  // whole crew stacked on the scene corner.
  const home = mode === 'hangout' && config ? groupHomePoint(config, bot) : null
  const zone = danceFloorZone()
  if (!home && !zone) return
  const pos = mode === 'center' ? (zone ? zoneCenterScene(zone) : null) : home
  if (!pos) return
  bot.tx = pos.x
  bot.ty = pos.y
  bot.tz = pos.z
  bot.mode = mode
  bot.atCenter = mode === 'center'
  bot.ambientAnchorX = null
  bot.ambientAnchorY = null
  bot.ambientAnchorZ = null
  // Arrival facing: chatters face their group, watchers/others face the floor
  // (ring/center facing is handled by faceCenter in botMoveSystem).
  if (mode === 'hangout') {
    if (botHoldsFormation(bot)) {
      bot.facePx = pos.x
      bot.facePz = pos.z + 1
    } else {
      const role = isSupportRingBot(bot.index) ? 'watch' : hangoutRole(bot.index)
      if (role === 'chat') {
        const c = clusterCentroid(bot)
        bot.facePx = c?.x ?? null
        bot.facePz = c?.z ?? null
      } else if (role === 'watch' && zone) {
        const center = zoneCenterScene(zone)
        bot.facePx = center.x
        bot.facePz = center.z
      } else {
        bot.facePx = null
        bot.facePz = null
      }
    }
  } else {
    bot.facePx = null
    bot.facePz = null
  }
}

/** Direct scene target — free-roam / choreography. */
export function setBotSceneTarget(
  bot: TroupeBot,
  opts: {
    x: number
    y: number
    z: number
    mode: TroupeBot['mode']
    faceCenter?: boolean
    faceAt?: { x: number; z: number }
  }
): void {
  bot.tx = opts.x
  bot.ty = opts.y
  bot.tz = opts.z
  bot.mode = opts.mode
  bot.atCenter = opts.mode === 'center' || opts.mode === 'choreo'
  bot.ambientAnchorX = null
  bot.ambientAnchorY = null
  bot.ambientAnchorZ = null
  if (opts.faceAt) {
    bot.facePx = opts.faceAt.x
    bot.facePz = opts.faceAt.z
  } else if (opts.faceCenter) {
    const zone = danceFloorZone()
    if (zone) {
      const c = zoneCenterScene(zone)
      bot.facePx = c.x
      bot.facePz = c.z
    }
  } else {
    bot.facePx = null
    bot.facePz = null
  }
}

/** Pick a roam waypoint around the venue: an annulus outside the gather ring,
 *  inside the plot, out of every no-go disc (dancePointScene nudges + steering
 *  keeps the walk clean). A few deterministic tries; falls back to staying put. */
function setRoamTarget(bot: TroupeBot): void {
  const config = getDanceConfig()
  const group = config ? botGroup(config, bot.index) : null
  const freeRoam = !group || group.place.kind === 'anywhere' || group.place.kind === 'scene'
  if (config && group && !freeRoam) {
    const placed = groupHomePoint(config, bot, Math.floor(nextRand(bot) * 1000))
    if (placed) {
      bot.tx = placed.x
      bot.ty = placed.y
      bot.tz = placed.z
      bot.ambientAnchorX = null
      bot.ambientAnchorY = null
      bot.ambientAnchorZ = null
      bot.facePx = null
      bot.facePz = null
      return
    }
  }
  const bounds = plotBoundsScene()
  // Scene-wide roaming picks anywhere on the PLOT rather than a ring around the dance
  // floor. "Near the crowd" wanders about ten metres from the floor, which on a large
  // plot leaves the whole site — and everything between the buildings — deserted.
  if (group?.place.kind === 'scene' && bounds) {
    const margin = 2
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = margin + nextRand(bot) * Math.max(1, bounds.maxX - margin * 2)
      const z = margin + nextRand(bot) * Math.max(1, bounds.maxZ - margin * 2)
      const ground = groundPointScene(x, z)
      if (!ground) continue
      bot.tx = ground.x
      bot.ty = ground.y
      bot.tz = ground.z
      bot.ambientAnchorX = null
      bot.ambientAnchorY = null
      bot.ambientAnchorZ = null
      bot.facePx = null
      bot.facePz = null
      return
    }
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const ang = nextRand(bot) * Math.PI * 2
    const rad = danceGatherRadius() + 2 + nextRand(bot) * 10
    const p = dancePointScene(ang, rad)
    if (!p) return
    if (bounds && (p.x < 1 || p.z < 1 || p.x > bounds.maxX - 1 || p.z > bounds.maxZ - 1)) continue
    bot.tx = p.x
    bot.ty = p.y
    bot.tz = p.z
    bot.ambientAnchorX = null
    bot.ambientAnchorY = null
    bot.ambientAnchorZ = null
    bot.facePx = null
    bot.facePz = null
    return
  }
}

/** Snap a bot to its target instantly (spawn only — avoids a walk from origin). */
function snapBot(bot: TroupeBot): void {
  const tf = Transform.getMutableOrNull(bot.entity)
  if (!tf) return
  tf.position = Vector3.create(bot.tx, bot.ty, bot.tz)
  faceCenter(bot.entity, { x: bot.tx, z: bot.tz })
}

/**
 * ‼️A WALKING BODY UNDER THE ISLAND KEEPS ITS NAMETAG.
 *
 * Owner, 2026-09-11: Nico fell through the stone and kept pacing, so the
 * Explorer nametag slid left and right under the surface. NPCs have no physics,
 * so they only go under the deck when a KO drop, a missed hangout Y, or an
 * "arrived" walk that never interpolates height leaves them there. The walk
 * pass only corrects Y WHILE they are moving in x/z — once they are under the
 * plaza and already on their hangout mark, they wander at that depth forever.
 *
 * A KO drop is allowed to fall. Everyone else is put back on the stone, and a
 * tiny offstage extra loses its nametag so a 1 mm body cannot still wear a
 * full-size name.
 */
function botInKoDrop(bot: TroupeBot): boolean {
  return !!bot.scrapKoStyle && (!!bot.scrapFallAt || bot.scrapDown || !!bot.scrapKoRimAt)
}

function rescueBotsUnderDeck(): void {
  const deck = scrapKoDeck()
  const config = getDanceConfig()
  for (const bot of bots) {
    const tf = Transform.getMutableOrNull(bot.entity)
    if (!tf) continue
    const dropping = botInKoDrop(bot)
    const under = scrapNpcNeedsDeckRescue({
      x: tf.position.x,
      z: tf.position.z,
      y: tf.position.y,
      dropping: false,
      deck
    })
    const shape = AvatarShape.getMutableOrNull(bot.entity)
    const properName = config ? npcDisplayName(config, bot.index) : ''
    const hideName = tf.scale.x < 0.05 || (under && dropping)
    if (shape) {
      if (hideName) {
        if (shape.name) shape.name = ''
      } else if (properName && shape.name !== properName) {
        shape.name = properName
      }
    }
    if (!under || dropping) continue
    const home =
      scrapKoReturnPoint(tf.position.x, tf.position.z, deck) ??
      (deck ? { x: deck.centerX, z: deck.centerZ } : null)
    if (!home || !deck) continue
    tf.position = Vector3.create(home.x, deck.deckY, home.z)
    bot.tx = home.x
    bot.ty = deck.deckY
    bot.tz = home.z
    bot.ambientAnchorX = home.x
    bot.ambientAnchorY = deck.deckY
    bot.ambientAnchorZ = home.z
    if (shape && properName) shape.name = properName
  }
}

/** Live guests as personal-space discs — ground rule: never walk through people. */
function liveGuestPositions(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  for (const [entity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const tf = Transform.getOrNull(entity)
    if (!tf) continue
    out.push({ x: tf.position.x, z: tf.position.z })
  }
  return out
}

/** Per-frame walk: steer each bot toward its target — around mesh no-gos AND
 *  live guests — and briefly interrupt to acknowledge a guest on contact. */
function botMoveSystem(dt: number): void {
  // Followers render the compact authoritative snapshot in npc-network.ts.
  // Running avoidance/waypoint choice on every client is the divergence bug this
  // layer exists to remove.
  // Height rescue runs on every client: a nametag under the stone is visible
  // even to a follower, and the coordinator snapshot otherwise leaves them
  // pacing there until the next walk step — which never comes once they have
  // "arrived" in x/z.
  rescueBotsUnderDeck()
  if (!isDanceCoordinator()) return
  if (isVenueActivityPaused()) return
  const nowMs = Date.now()
  const config = getDanceConfig()
  const guests = liveGuestPositions()
  const guestDiscs = guestPersonalSpaceDiscs(guests)
  const positions = bots.flatMap((bot) => {
    const tf = Transform.getOrNull(bot.entity)
    return tf ? [{ index: bot.index, floorIndex: bot.floorIndex, x: tf.position.x, z: tf.position.z }] : []
  })
  // Bots that WALKED this tick already separated inside the walk step. Everyone
  // else gets the standing settle pass below.
  const movedThisTick = new Set<number>()
  if (isScrapActive()) {
    tickScrapDirector({
      nowMs,
      npcs: bots.map((bot) => {
        const tf = Transform.getOrNull(bot.entity)
        const group = config ? botGroup(config, bot.index) : null
        return {
          npcIndex: bot.index,
          groupId: bot.stationed ? 'vendor' : (group?.id ?? 'crew'),
          // Stationed NPCs (vendor) stay in their zone — Scrap may still fight
          // on explicit E, but must not walk them across the plot.
          interruptible:
            !bot.stationed &&
            !bot.atCenter &&
            bot.mode !== 'center' &&
            // The regular pinned at the bag is not a target.
            !bot.pin &&
            group?.interruptible !== false,
          x: tf?.position.x ?? bot.tx,
          z: tf?.position.z ?? bot.tz,
          // The FLOOR they are standing on. Every gap inside the planner is
          // flat and stays flat; this is only so the director can refuse a
          // guest who is not on this deck at all — see SCRAP_SAME_FLOOR_M.
          y: tf?.position.y,
          skill: botScrapSkill(config, bot.index)
        }
      })
    })
    const session = activeScrapSession()
    silenceScrapCrowdClapEmotes()
    silenceBreakdanceCrowdAudioForScrap()
    syncScrapFight({
      nowMs,
      config: scrapPluginConfig(),
      session,
      selectedNpcIndex: selectedScrapNpcIndex(),
      hoveredNpcIndex: hoveredScrapNpcIndex(),
      actors: bots.map((bot) => {
        const tf = Transform.getOrNull(bot.entity)
        return {
          npcIndex: bot.index,
          entity: bot.entity,
          x: tf?.position.x ?? bot.tx,
          y: tf?.position.y ?? bot.ty,
          z: tf?.position.z ?? bot.tz
        }
      })
    })
    const fightBot = session ? bots.find((bot) => bot.index === session.npcIndex) : undefined
    // Your presses PROVOKE. Each stage crossing = a line, a gesture, and from
    // stage 2 a shove. This is what makes pressing E an act with a consequence.
    if (session && fightBot) {
      const prov = scrapProvocation()
      if (prov.seq !== lastProvocationSeq) {
        lastProvocationSeq = prov.seq
        const beat = scrapProvocationBeat(prov.stage)
        if (beat) {
          // Press one: they notice you. Two: a line in THEIR voice and a look.
          // Three: they walk up and push - the shove lands mid-clip, and the
          // ring opens on the planner's boil hold right behind it.
          const persona = botScrapPersona(config, fightBot.index)
          const line = scrapProvocationLine(prov.stage, session.seed + prov.stage, persona)
          if (line) showNpcSpeech(fightBot.entity, line)
          const emote = scrapProvocationEmote(prov.stage, session.seed + prov.stage * 7)
          if (emote) playFightEmote(fightBot, emote)
          if (beat.approach) {
            fightBot.scrapPushUntil = nowMs + 1600
            fightBot.scrapPushShoveAt = beat.shove ? nowMs + 650 : 0
          } else if (beat.shove) {
            const tf = Transform.getOrNull(fightBot.entity)
            executeScrapProvocationShove(fightBot.index, tf?.position.x ?? fightBot.tx, tf?.position.z ?? fightBot.tz)
          }
        }
      }
    }
    // The push lands mid-clip: movePlayerTo, clamped, once.
    if (session && fightBot && fightBot.scrapPushShoveAt && nowMs >= fightBot.scrapPushShoveAt) {
      fightBot.scrapPushShoveAt = 0
      const tf = Transform.getOrNull(fightBot.entity)
      executeScrapProvocationShove(fightBot.index, tf?.position.x ?? fightBot.tx, tf?.position.z ?? fightBot.tz)
    }
    // Planner-armed shoves (legacy ladder): still honoured, once per seq.
    if (session && fightBot) {
      const tf = Transform.getOrNull(fightBot.entity)
      if (executeScrapShove(session, tf?.position.x ?? fightBot.tx, tf?.position.z ?? fightBot.tz)) {
        playFightEmote(fightBot, 'push')
      }
    }
    if (fightBot) {
      for (const fx of consumeScrapFightFx()) {
        const tf = Transform.getMutableOrNull(fightBot.entity)
        const intent = scrapIntentFor(fightBot.index)
        let toGuest: { x: number; z: number } | null = null
        if (tf && intent && 'guestX' in intent) {
          const dx = intent.guestX - tf.position.x
          const dz = intent.guestZ - tf.position.z
          const len = Math.hypot(dx, dz) || 1
          toGuest = { x: dx / len, z: dz / len }
        }
        /**
         * A step taken BEFORE the clip window, never during one, and never on
         * the trigger tick. Writing Transform puts AvatarShape into locomotion,
         * which outranks `expressionTriggerId` — that is why a jab became a
         * twitch. Swings and hurts do not step at all: the Motion Studio clip
         * is the punch. A breather still teleports out of range, then waits
         * `SCRAP_CLIP_SETTLE_MS` so the walk blend is gone before tired plays.
         */
        const preStep = (m: number): void => {
          if (!tf || !toGuest) return
          let nx = tf.position.x + toGuest.x * m
          let nz = tf.position.z + toGuest.z * m
          if (fightBot.stationed) {
            const c = clampToStationZone(fightBot, nx, nz)
            nx = c.x
            nz = c.z
          }
          tf.position = Vector3.create(nx, tf.position.y, nz)
          fightBot.tx = nx
          fightBot.tz = nz
          fightBot.scrapStillSince = 0
        }
        if (fx.kind === 'npc_swing') {
          // Approach first, then freeze, then play. Never lunge on this tick:
          // a Transform write puts AvatarShape into locomotion, which outranks
          // expressionTriggerId. Walk BETWEEN clips; freeze only once they are
          // in punching range (or already there). Face you BEFORE the freeze —
          // a clip on a body that is still looking at the plaza reads as idle.
          fightBot.scrapClipRole = fx.visual
          fightBot.scrapClipLoop = false
          fightBot.scrapBeatKey = `swing:${nowMs}`
          const holdMs = fx.swing === 'cross' ? 1400 : 1200
          const guest = intent && 'guestX' in intent ? intent : null
          if (tf && guest) {
            faceToward(fightBot.entity, { x: tf.position.x, z: tf.position.z }, { x: guest.guestX, z: guest.guestZ })
            fightBot.scrapStillSince = 0
          }
          const gap = tf && guest
            ? Math.hypot(guest.guestX - tf.position.x, guest.guestZ - tf.position.z)
            : 0
          if (tf && guest && gap > SCRAP_FIGHT_MIN_M + SCRAP_RING_ARRIVE_M) {
            const stand = scrapStandOff(tf.position.x, tf.position.z, guest.guestX, guest.guestZ, SCRAP_FIGHT_MIN_M)
            fightBot.tx = stand.x
            fightBot.tz = stand.z
            const walkMs = Math.min(800, Math.max(0, ((gap - SCRAP_FIGHT_MIN_M) / WALK_SPEED) * 1000))
            fightBot.scrapClipAt = nowMs + walkMs + SCRAP_CLIP_SETTLE_MS
            if (nowMs >= fightBot.scrapClipUntil) fightBot.scrapClipUntil = 0
          } else {
            fightBot.scrapClipAt = nowMs + SCRAP_CLIP_SETTLE_MS
            fightBot.scrapClipUntil = nowMs + SCRAP_CLIP_SETTLE_MS + holdMs
          }
        } else if (fx.kind === 'npc_breather') {
          // They step OUT of reach and breathe — tired loop while the range
          // gates make both sides whiff; the ring orbit walks them back in
          // once the window closes.
          preStep(-1.4)
          fightBot.scrapClipAt = nowMs + SCRAP_CLIP_SETTLE_MS
          fightBot.scrapClipRole = 'tired'
          fightBot.scrapClipLoop = true
          fightBot.scrapBeatKey = `breather:${nowMs}`
          fightBot.scrapClipUntil = nowMs + fx.ms
        } else if (fx.kind === 'npc_guard' || fx.kind === 'stance') {
          playFightEmote(fightBot, 'guard', true)
          fightBot.scrapBeatKey = `guard:${nowMs}`
          fightBot.scrapClipUntil = nowMs + 2800
        } else if (fx.kind === 'tell') {
          // The tell: a taunt before the opening. Seeded per NPC so it is THEIR tell.
          const taunts = ['taunt1', 'taunt2', 'taunt3'] as const
          playFightEmote(fightBot, taunts[(session?.seed ?? 0) % 3]!)
          fightBot.scrapBeatKey = `tell:${nowMs}`
          fightBot.scrapClipUntil = nowMs + 1100
        } else if (fx.kind === 'landed') {
          const guest = intent && 'guestX' in intent ? intent : null
          const spec = scrapHitKnockSpec({
            side: 'landed',
            charge: fx.charge,
            turbo: fx.tier === 'turbo',
            heavy: false,
            score: fx.score
          })
          let hopMs = 0
          if (tf && guest && spec) {
            hopMs = startHitKnock(fightBot, tf, guest.guestX, guest.guestZ, spec, nowMs)
              ? spec.durationMs
              : 0
          }
          fightBot.scrapClipAt = nowMs + hopMs + SCRAP_CLIP_SETTLE_MS
          fightBot.scrapClipRole = 'hurt'
          fightBot.scrapClipLoop = false
          fightBot.scrapBeatKey = `hurt:${nowMs}`
          fightBot.scrapClipUntil = nowMs + hopMs + SCRAP_CLIP_SETTLE_MS + 850
        } else if (fx.kind === 'ko') {
          fightBot.scrapKoStyle = fx.style
          fightBot.scrapDown = false
          fightBot.scrapFallAt = 0
          fightBot.scrapKoIdle = false
          fightBot.scrapKoLandedAt = 0
          fightBot.scrapKoRimAt = 0
          fightBot.scrapKoBodyAt = 0
          // Clap audio is baked into the DCL clip — stop anyone still looping it.
          silenceScrapCrowdClapEmotes()
          fightBot.scrapKoBody = false
          fightBot.scrapKoArmed = false
          if (intent && 'guestX' in intent) {
            fightBot.scrapFallGuestX = intent.guestX
            fightBot.scrapFallGuestZ = intent.guestZ
          }
          fightBot.scrapClipUntil = nowMs + 60_000
          fightBot.scrapClipAt = 0
        } else if (fx.kind === 'lost') {
          fightBot.scrapBeatKey = ''
          fightBot.scrapClipAt = 0
        }
      }
      // Fire the clip that a pre-step deferred. One tick of separation is all the
      // Explorer needs to finish blending out of the walk it was just put into;
      // trigger on the step tick and the expression is swallowed by locomotion.
      if (fightBot.scrapClipAt && nowMs >= fightBot.scrapClipAt) {
        const role = fightBot.scrapClipRole
        const still = fightBot.scrapStillSince > 0 && nowMs - fightBot.scrapStillSince >= SCRAP_CLIP_SETTLE_MS
        const late = nowMs >= fightBot.scrapClipAt + 400
        if (still || late) {
          fightBot.scrapClipAt = 0
          if (role) {
            playFightEmote(fightBot, role, fightBot.scrapClipLoop)
            const holdMs = role === 'jab' || role === 'hurt' ? 1200 : 1400
            if (nowMs >= fightBot.scrapClipUntil) fightBot.scrapClipUntil = nowMs + holdMs
          }
        }
      }
    }
  }
  for (const bot of bots) {
    const tf = Transform.getMutableOrNull(bot.entity)
    if (!tf) continue
    const meshDiscs = obstructionDiscsScene(bot.floorIndex)
    const leased = isScrapLeased(bot.index)
    if (bot.stationed && !leased) {
      bot.tx = bot.stationX
      bot.ty = bot.stationY
      bot.tz = bot.stationZ
      bot.holdUntil = Number.MAX_SAFE_INTEGER
      tf.position = Vector3.create(bot.stationX, bot.stationY, bot.stationZ)
    }
    paintScrapTargetMark(bot.scrapMark, scrapPickModeFor(bot.index, leased))
    if (leased !== bot.scrapWasLeased) {
      bot.scrapWasLeased = leased
      bot.scrapBeatKey = ''
      if (leased) {
        // Bind jab/cross/kick/hurt/KO BEFORE the first swing. Slotting any of
        // those on the fire frame is the standing dummy.
        const bout = activeScrapSession()
        if (bout) armFightClips(bot, bout.seed)
        // Interrupt clap WITH the guard clip. Clearing the trigger first
        // leaves baked clap audio playing with no replacement.
        const intent = scrapIntentFor(bot.index)
        if (tf && intent && 'guestX' in intent) {
          faceToward(bot.entity, { x: tf.position.x, z: tf.position.z }, { x: intent.guestX, z: intent.guestZ })
          bot.scrapStillSince = 0
          bot.scrapClipRole = 'guard'
          bot.scrapClipLoop = true
          bot.scrapClipAt = nowMs + SCRAP_CLIP_SETTLE_MS
          bot.scrapBeatKey = 'approach'
        } else {
          playFightEmote(bot, 'guard')
        }
        unbindScrapEngage(bot)
      } else {
        // The lease used to end while they were still 28 m under the island
        // after a KO drop. Hangout then saw them as already on their x/z mark
        // and never lifted Y, so the nametag kept pacing under the stone.
        standBotUp(bot, tf)
        stopBotEmote(bot)
        setBotTarget(bot, 'hangout')
        rebakeBotTransform(bot.entity)
      }
    }
    const holdRank = !leased && botHoldsFormation(bot)
    const discs: SteerDisc[] = !leased && !holdRank && guestDiscs.length ? [...meshDiscs, ...guestDiscs] : meshDiscs
    const pos = { x: tf.position.x, z: tf.position.z }
    let walkSpeed = WALK_SPEED

    // Center-stage performers keep the show; everyone else honors the ground
    // rule. A group marked non-interruptible acknowledges no one — it has a job.
    const group = config ? botGroup(config, bot.index) : null
    const allowInterrupt =
      !bot.stationed &&
      !bot.atCenter &&
      bot.mode !== 'center' &&
      group?.interruptible !== false
    if (bot.stationed && !leased) {
      // Zone-bound shopkeep: no guest-ack roam, no free walk.
      continue
    }
    if (bot.pin && !leased) {
      tf.position = Vector3.create(bot.pin.x, tf.position.y, bot.pin.z)
      bot.tx = bot.pin.x
      bot.tz = bot.pin.z
      continue
    }
    if (leased) {
      const intent = scrapIntentFor(bot.index)
      // THE FALL OUTRANKS EVERYTHING except the split. Start it on the KO fx,
      // even if the planner is still in `fight` / `guard_up` — otherwise the
      // guard clip keeps them standing through the knockout cut. CONTINUE
      // turns the intent to retreat, which stands them up.
      const falling =
        !!bot.scrapKoStyle &&
        intent?.kind !== "retreat" &&
        intent?.kind !== "flee" &&
        intent?.kind !== "return_to_job";
      if (falling || intent?.kind === "knockout") {
        const gx = intent && "guestX" in intent ? intent.guestX : bot.scrapFallGuestX
        const gz = intent && "guestZ" in intent ? intent.guestZ : bot.scrapFallGuestZ
        tickKnockoutFall(bot, tf, gx, gz, nowMs)
        if (bot.stationed && !scrapKoPointOffDeck(tf.position.x, tf.position.z)) {
          const c = clampToStationZone(bot, tf.position.x, tf.position.z)
          tf.position = Vector3.create(c.x, tf.position.y, c.z)
        }
        bot.scrapBeatKey = "ko"
        continue
      }
      if (tickHitKnock(bot, tf, nowMs)) {
        continue
      }
      // Getting up after a knockout: the rise clip plays out before any walk.
      if (bot.scrapRiseUntil && nowMs < bot.scrapRiseUntil) {
        bot.tx = pos.x
        bot.tz = pos.z
        continue
      }
      bot.scrapRiseUntil = 0
      // Freeze the body while a fight clip is live. A Transform write (orbit,
      // face, walk, preStep) puts AvatarShape into locomotion, which outranks
      // `expressionTriggerId` — jab became a twitch and the opponent never fell.
      // KO launch is the exception: it runs above. Retreat/flee must not freeze
      // or the 60s KO clip window would pin them on the floor forever.
      const leaving =
        intent?.kind === 'retreat' ||
        intent?.kind === 'flee' ||
        intent?.kind === 'return_to_job'
      if (nowMs < bot.scrapClipUntil && !leaving) {
        bot.tx = pos.x
        bot.tz = pos.z
        if (!bot.scrapStillSince) bot.scrapStillSince = nowMs
        continue
      }
      const pendingThrow =
        bot.scrapClipAt > nowMs &&
        (bot.scrapClipRole === 'jab' ||
          bot.scrapClipRole === 'cross' ||
          bot.scrapClipRole === 'uppercut' ||
          bot.scrapClipRole === 'frontKick')
      if (pendingThrow && intent && 'guestX' in intent) {
        // Close to punching range with fists up, then freeze for the clip.
        const stand = scrapStandOff(pos.x, pos.z, intent.guestX, intent.guestZ, SCRAP_FIGHT_MIN_M)
        bot.tx = stand.x
        bot.tz = stand.z
        if (bot.scrapBeatKey !== 'throw-approach') {
          bot.scrapBeatKey = 'throw-approach'
          playFightEmote(bot, 'guard')
        }
        const gapToThrow = Math.hypot(stand.x - pos.x, stand.z - pos.z)
        if (gapToThrow <= SCRAP_RING_ARRIVE_M) {
          faceToward(bot.entity, pos, { x: intent.guestX, z: intent.guestZ })
          if (!bot.scrapStillSince) bot.scrapStillSince = nowMs
          const holdMs = bot.scrapClipRole === 'jab' ? 1200 : 1400
          bot.scrapClipUntil = Math.max(bot.scrapClipAt, nowMs + SCRAP_CLIP_SETTLE_MS) + holdMs
          continue
        }
      }
      // Third press: they come at you. Walk to arm's length, face you, push.
      // This outranks the talk beat (which would `continue` past the walk).
      const pushing = bot.scrapPushUntil > nowMs && intent !== undefined && 'guestX' in intent
      if (!pushing && bot.scrapPushUntil) bot.scrapPushUntil = 0
      if (pendingThrow && intent && 'guestX' in intent) {
        // tx already aimed at punching range; walk loop below closes it.
      } else if (pushing && intent && 'guestX' in intent) {
        standBotUp(bot, tf, nowMs)
        const stand = scrapStandOff(pos.x, pos.z, intent.guestX, intent.guestZ, 1.0)
        bot.tx = stand.x
        bot.tz = stand.z
        if (Math.hypot(stand.x - pos.x, stand.z - pos.z) <= 0.3) {
          faceToward(bot.entity, pos, { x: intent.guestX, z: intent.guestZ })
          continue
        }
        // otherwise: the walk loop below carries them in
      } else if (intent?.kind === 'walk_to_guest') {
        bot.tx = intent.standX
        bot.tz = intent.standZ
        // Fists up on the way in. Without this she closed the distance still
        // looping whatever the crowd had her doing.
        if (bot.scrapBeatKey !== 'approach') {
          bot.scrapBeatKey = 'approach'
          playFightEmote(bot, 'guard')
        }
      } else if (intent?.kind === 'face_guest') {
        standBotUp(bot, tf)
        faceToward(bot.entity, pos, { x: intent.guestX, z: intent.guestZ })
        if (intent.emote === SCRAP_GLOAT_MARKER) {
          const bout = activeScrapSession()
          if (bout) {
            const started = bout.phaseUntilMs - SCRAP_NPC_WIN_RESOLVE_MS
            const beat = scrapGloatBeatIndex(nowMs - started)
            const key = `gloat:${beat}`
            if (bot.scrapBeatKey !== key) {
              bot.scrapBeatKey = key
              const persona = botScrapPersona(config, bot.index)
              const step = scrapGloatBeat(persona, bout.seed, beat)
              // gloat: taunt1 (point) -> taunt2 (dismiss) -> koKnees (kneel + smack)
              playFightEmote(bot, step.emote)
              showNpcSpeech(bot.entity, step.line, 2200)
              bot.stopEmoteAt = nowMs + 2200
            }
          }
          continue
        }
        const key = `${intent.emote}:${intent.line ?? ''}:${intent.holdMs}`
        if (bot.scrapBeatKey !== key) {
          bot.scrapBeatKey = key
          // Squaring-up beats ask for the boxing guard by role, so the real
          // Fighting Idle clip plays instead of a card emote.
          if (intent.emote === SCRAP_GUARD_MARKER) playFightEmote(bot, 'guard')
          else if (intent.emote) playBotEmote(bot, intent.emote)
          if (intent.line) showNpcSpeech(bot.entity, intent.line)
          bot.stopEmoteAt = nowMs + intent.holdMs
        }
        continue
      } else if (intent?.kind === 'guard_up') {
        // Between punches they hold a boxing guard at RING distance — never
        // closing into your face — and re-trigger it on a slow beat, because an
        // AvatarShape plays an expression once and then drops to its walk idle.
        // If a KO already landed, never stand them up for the guard beat.
        if (bot.scrapKoStyle) {
          tickKnockoutFall(bot, tf, intent.guestX, intent.guestZ, nowMs)
          bot.scrapBeatKey = 'ko'
          continue
        }
        standBotUp(bot, tf)
        // Soft-chase the orbit point in-place so they circle without the walk
        // loop yawing them away from you. Always face the guest.
        //
        // THE STILLNESS LAW — a moving AvatarShape is in its locomotion state and
        // the walk clip outranks `expressionTriggerId`. Any position write during
        // a swing / taunt / hurt window kills the very clip that window exists to
        // protect, so the chase is SUSPENDED while `scrapClipUntil` is live. The
        // orbit gives up a step, never a punch.
        const clipPlaying = nowMs < bot.scrapClipUntil
        const standX = intent.standX
        const standZ = intent.standZ
        const dx = standX - pos.x
        const dz = standZ - pos.z
        const gapToStand = Math.hypot(dx, dz)
        // Arrive with a real tolerance: sub-decimetre jitter is not a walk, and
        // chasing it held the bot in locomotion forever.
        if (!clipPlaying && gapToStand > SCRAP_RING_ARRIVE_M) {
          const step = Math.min(gapToStand, WALK_SPEED * dt * 0.7)
          let nx = pos.x + (dx / gapToStand) * step
          let nz = pos.z + (dz / gapToStand) * step
          if (bot.stationed) {
            const c = clampToStationZone(bot, nx, nz)
            nx = c.x
            nz = c.z
          }
          tf.position = Vector3.create(nx, tf.position.y, nz)
          bot.tx = nx
          bot.tz = nz
          pos.x = nx
          pos.z = nz
          bot.scrapStillSince = 0
        } else {
          bot.tx = pos.x
          bot.tz = pos.z
          if (!bot.scrapStillSince) bot.scrapStillSince = nowMs
        }
        // Back to the guard between beats — but never over a swing, a taunt or
        // a hurt clip that is still playing (that cut every jab to a twitch), and
        // never while they are still walking to the station: the Explorer needs a
        // beat of stillness before it will let an expression through.
        const settled = !clipPlaying && bot.scrapStillSince > 0 && nowMs - bot.scrapStillSince >= SCRAP_CLIP_SETTLE_MS
        if (settled && bot.scrapBeatKey !== `guard:${intent.beat}`) {
          bot.scrapBeatKey = `guard:${intent.beat}`
          // Hurt idle when low; otherwise alternate stance / footwork bounce so
          // the ring reads as alive while they orbit.
          const pose = intent.hurt
            ? 'hurtIdle'
            : intent.beat % 2 === 0
              ? 'guard'
              : 'footwork'
          playFightEmote(bot, pose)
        }
        if (!clipPlaying) faceToward(bot.entity, pos, { x: intent.guestX, z: intent.guestZ })
        continue
      } else if (intent?.kind === 'back_crowd') {
        // Onlookers. They never fight — they stand behind the boss, react, and
        // go SOLID once it is a challenge so the ring closes around you. The
        // planner always leaves one gap, and the collider drops the moment the
        // session ends (below), so nobody can be trapped.
        standBotUp(bot, tf)
        bot.tx = intent.standX
        bot.tz = intent.standZ
        setBotSolid(bot, intent.solid)
        const key = `back:${intent.emote}:${intent.solid ? 'solid' : 'open'}`
        if (bot.scrapBeatKey !== key) {
          bot.scrapBeatKey = key
          playBotEmote(bot, intent.emote)
          bot.stopEmoteAt = nowMs + 2200
        }
        if (Math.hypot(intent.standX - pos.x, intent.standZ - pos.z) <= 0.45) {
          faceToward(bot.entity, pos, { x: intent.guestX, z: intent.guestZ })
          continue
        }
      } else if (intent?.kind === 'retreat') {
        // The split. Both of you leave; standing shoulder to shoulder after a
        // fight reads worse than either outcome. A knocked-out NPC gets UP
        // first (rise clip) and only then walks off — at walk speed, not a sprint.
        const wasDown = bot.scrapDown || !!bot.scrapFallAt
        standBotUp(bot, tf, nowMs)
        setBotSolid(bot, false)
        if (wasDown && bot.scrapRiseUntil && nowMs < bot.scrapRiseUntil) {
          bot.tx = pos.x
          bot.tz = pos.z
          continue
        }
        bot.tx = intent.awayX
        bot.tz = intent.awayZ
        if (bot.scrapBeatKey !== 'split') {
          bot.scrapBeatKey = 'split'
          playFightEmote(bot, 'shake')
        }
        walkSpeed = WALK_SPEED
      } else if (intent?.kind === 'flee') {
        standBotUp(bot, tf)
        bot.tx = intent.awayX
        bot.tz = intent.awayZ
        bot.scrapBeatKey = ''
        walkSpeed = FLEE_SPEED
      } else {
        standBotUp(bot, tf)
        bot.scrapBeatKey = ''
      }
    } else {
      standBotUp(bot, tf)
      bot.scrapBeatKey = ''
    }
    if (bot.stationed) {
      // Fights stay at the stall — never flee or chase outside the zone disc.
      const clamped = clampToStationZone(bot, bot.tx, bot.tz)
      bot.tx = clamped.x
      bot.tz = clamped.z
      if (intentKindIsFlee(scrapIntentFor(bot.index))) {
        bot.tx = bot.stationX
        bot.tz = bot.stationZ
      }
    }
    // A performer at the bag greets nobody. The guest-acknowledge beat plays a
    // wave and holds it — on the one bot standing closest to the player, which
    // is exactly the fighter — and that wave lands on top of its stance and its
    // swing. Whoever armed the clips owns the body until it is released.
    if (!leased) setBotSolid(bot, false)
    if (!leased && !botIsPerforming(bot)) {
      const ack = planGuestAcknowledge({
        nowMs,
        botX: pos.x,
        botZ: pos.z,
        state: bot.guestAck,
        guests,
        allowInterrupt
      })
      bot.guestAck = ack.state
      if (ack.action === 'start' && ack.faceGuest) {
        faceToward(bot.entity, pos, ack.faceGuest)
        // WHAT the acknowledge beat looks like comes from the encounter cards:
        // group attitude + scene mood pick the emote, line, and hold length.
        const beat = planGreeting({
          attitude: group?.attitude ?? null,
          mood: config?.encounterMood ?? 'friendly',
          seed: bot.seed,
          sequence: bot.greetCount++
        })
        playBotEmote(bot, beat.emote)
        if (beat.line) showNpcSpeech(bot.entity, beat.line)
        bot.stopEmoteAt = nowMs + beat.holdMs
        continue
      }
      if (ack.action === 'hold') {
        if (ack.faceGuest) faceToward(bot.entity, pos, ack.faceGuest)
        continue
      }
    }

    const dist = Math.hypot(bot.tx - pos.x, bot.tz - pos.z)
    if (dist < 0.18) {
      // Arrived in x/z. Y is NOT a walk axis, so a body that fell through the
      // deck while already on its mark would stay under forever without this.
      if (Math.abs(tf.position.y - bot.ty) > 0.25) {
        tf.position = Vector3.create(tf.position.x, bot.ty, tf.position.z)
      }
      // Arrived. Ring/centre bots FACE THE DANCE FLOOR (the show); hangout bots
      // face their conversation cluster or the floor per role (facePx/facePz),
      // and roamers keep whatever heading they wandered in with.
      if (bot.facePx != null && bot.facePz != null) {
        faceToward(bot.entity, pos, { x: bot.facePx, z: bot.facePz })
      } else if (bot.mode !== 'hangout' && bot.mode !== 'free_roam') {
        faceCenter(bot.entity, pos)
      }
      continue
    }
    // A bout is a straight line: the opponent walks at you (or away) without
    // steering round furniture or the crowd.
    const straight = leased
    const steered = straight
      ? stepStraight(pos, { x: bot.tx, z: bot.tz }, walkSpeed * dt)
      : steerStep(pos, { x: bot.tx, z: bot.tz }, discs, walkSpeed * dt)
    // Only bots sharing a STOREY are bodies in each other's way. Repelling
    // against someone three floors up pushed ground-floor crowds sideways for
    // no visible reason.
    const neighbours = positions.filter((other) => other.floorIndex === bot.floorIndex)
    const separated = holdRank || straight ? steered : separateAgentStep(bot.index, pos, steered, neighbours)
    const next = holdRank || straight || insideAnyDisc(separated.x, separated.z, discs) ? steered : separated
    const movedX = next.x - pos.x
    const movedZ = next.z - pos.z
    if (Math.hypot(movedX, movedZ) < 1e-6) continue // boxed in — pause, never clip
    movedThisTick.add(bot.index)
    const progress = Math.min(1, Math.hypot(movedX, movedZ) / Math.max(dist, 0.001))
    const nextY = tf.position.y + (bot.ty - tf.position.y) * progress
    tf.position = Vector3.create(next.x, nextY, next.z)
    // Face the way they're actually moving while in transit.
    const yawDeg = (Math.atan2(movedX, movedZ) * 180) / Math.PI
    tf.rotation = Quaternion.fromEulerDegrees(0, yawDeg, 0)
  }
  settleStandingBots(dt, movedThisTick)
}

/** How fast a fused pair drifts apart. Slow enough to read as people shuffling
 *  aside, fast enough that a spawn collapse clears in about a second. */
const SETTLE_SPEED = 0.6 // m/s

/**
 * Personal space for bots that are NOT walking — see `settleStandingStep`.
 * Excluded: Scrap-leased bots (Scrap owns the position), a stationed shopkeep
 * (owns its station), a rank formation and choreography (both AUTHORED grids).
 */
function settleStandingBots(dt: number, movedThisTick: ReadonlySet<number>): void {
  const step = Math.min(0.12, SETTLE_SPEED * Math.max(0, dt))
  if (step <= 0) return
  const standing = bots.flatMap((bot) => {
    const tf = Transform.getOrNull(bot.entity)
    return tf ? [{ bot, x: tf.position.x, z: tf.position.z }] : []
  })
  for (const { bot, x, z } of standing) {
    if (movedThisTick.has(bot.index)) continue
    if (isScrapLeased(bot.index) || bot.stationed || botHoldsFormation(bot)) continue
    if (punchOwnsCrowd(bot.entity)) continue
    // A performer stands on an exact mark and is mid-clip. A settle step writes
    // Transform, which puts AvatarShape into locomotion — and locomotion
    // outranks `expressionTriggerId`, so the nudge eats the punch.
    if (botIsPerforming(bot)) continue
    if (bot.mode === 'choreo') continue
    // ‼️THE FIGHTER AT THE BAG HOLDS THE MARK — see `pin`.
    if (bot.pin) continue
    // Only bots sharing a STOREY are bodies in each other's way.
    const neighbours = standing
      .filter((other) => other.bot.floorIndex === bot.floorIndex)
      .map((other) => ({ index: other.bot.index, x: other.x, z: other.z }))
    const settled = settleStandingStep(bot.index, { x, z }, neighbours, step)
    if (!settled) continue
    // Never settle INTO mesh. Boxed in beats clipping through a bench.
    if (insideAnyDisc(settled.x, settled.z, obstructionDiscsScene(bot.floorIndex))) continue
    const tf = Transform.getMutableOrNull(bot.entity)
    if (!tf) continue
    tf.position = Vector3.create(settled.x, tf.position.y, settled.z)
    // Carry the TARGET with them. Without this the walk pass sees the bot 0.2 m
    // off target next tick and marches it straight back into the neighbour it
    // just stepped away from — a permanent shuffle instead of a settle.
    bot.tx += settled.x - x
    bot.tz += settled.z - z
  }
}

export function playBotEmote(bot: TroupeBot, emote: string, loop = false): void {
  const next = scrapCrowdEmoteDuringBout(emote, activeScrapSession()?.phase, scrapCrowdQuiet())
  const shape = AvatarShape.getMutableOrNull(bot.entity)
  if (!shape) return
  // The Unity client plays a bundled clip by its PATH (`emotes/x.glb`), never by
  // a scene-emote URN — see npcEmoteTrigger. `loop` is accepted for callers'
  // sake but the client does not loop NPC scene emotes; holds re-trigger.
  void loop
  const trigger = npcEmoteTrigger(next)
  // Slot bookkeeping stays for the URN-era resolvers that still read `emotes`;
  // it is a no-op for a path trigger.
  ensureNpcEmote(shape, sceneEmoteUrnFor(next, false) ?? '', reservedEmoteUrns(bot))
  bot.emoteTimestamp += 1
  bot.lastEmoteUrn = next
  shape.expressionTriggerId = trigger
  shape.expressionTriggerTimestamp = bot.emoteTimestamp
}

/**
 * ARM a scripted performance's clips on this bot, ahead of the frame any of
 * them has to fire.
 *
 * Slotting a clip in on the trigger frame is the standing dummy: Explorer binds
 * the GLB to the armature asynchronously, so the trigger lands on nothing and
 * the NPC just stands there. Every performance that knows its clips in advance
 * — a Scrap bout, a walk-up to the punch bag — arms them during the walk-up and
 * fires into an already-bound list.
 *
 * Returns false when the clips are not resolvable yet (the content map has not
 * come back), so the caller can retry rather than fire into thin air.
 */
export function armBotEmotes(bot: TroupeBot, paths: readonly string[], loop = false): boolean {
  const shape = AvatarShape.getMutableOrNull(bot.entity)
  if (!shape) return false
  const urns: string[] = []
  for (const path of paths) {
    const urn = path.startsWith('emotes/')
      ? sceneEmoteUrnFor(path, loop)
      : resolveSceneEmoteUrn(path)
    if (urn) urns.push(urn)
  }
  if (urns.length < paths.length) return false
  const next = dedupeUrns(urns).slice(0, NPC_EMOTE_SLOTS)
  bot.pinnedEmotes = next
  // Idempotent: reassigning an identical list makes Explorer rebind the whole
  // armature, which eats the very trigger this arming exists to protect.
  setNpcEmotesIfChanged(shape, next)
  return true
}

/** Hand the bot back to the crowd list — the performance is over. */
export function releaseBotEmotes(bot: TroupeBot): void {
  bot.pinnedEmotes = []
}

/**
 * True while a scripted performance owns this bot's ANIMATION.
 *
 * Same rule Scrap's lease established: every crowd behaviour writes emotes —
 * the reaction overlay, choreography steps, ambient gestures — so a bot the
 * crowd is still driving has its stance and its swing overwritten within a
 * tick. Whoever armed the clips drives the body until they release it.
 */
export function botIsPerforming(bot: TroupeBot): boolean {
  return bot.pinnedEmotes.length > 0
}

/**
 * Hard-cut clap/fistpump audio. Clearing expressionTriggerId is not enough —
 * DCL keeps playing the baked clap until another emote interrupts it.
 * One shrug at bout start is not enough either: if the interrupt does not
 * stick, clap audio runs for the rest of the fight. Keep pulsing a silent
 * emote for the first seconds, and interrupt anyone still on clap every tick.
 */
let scrapClapCutKey = ''
let scrapClapCutAt = 0
let scrapClapPulseAt = 0
const SCRAP_CLAP_HOLD_MS = 12_000
const SCRAP_CLAP_PULSE_MS = 450
function silenceScrapCrowdClapEmotes(): void {
  if (!scrapCrowdQuiet()) {
    scrapClapCutKey = ''
    scrapClapCutAt = 0
    scrapClapPulseAt = 0
    return
  }
  const now = Date.now()
  const key = activeScrapSession()?.id ?? 'fight-input'
  const firstCut = scrapClapCutKey !== key
  if (firstCut) {
    scrapClapCutKey = key
    scrapClapCutAt = now
    scrapClapPulseAt = 0
  }
  const holdCut = now - scrapClapCutAt < SCRAP_CLAP_HOLD_MS
  const pulse = holdCut && (firstCut || now - scrapClapPulseAt >= SCRAP_CLAP_PULSE_MS)
  if (pulse) scrapClapPulseAt = now
  const pulseEmote = Math.floor(now / SCRAP_CLAP_PULSE_MS) % 2 === 0 ? 'dontsee' : 'wave'
  for (const bot of bots) {
    if (isScrapLeased(bot.index)) continue
    const shape = AvatarShape.getOrNull(bot.entity)
    if (!shape) continue
    const trigger = shape.expressionTriggerId ?? ''
    const clapping =
      isScrapCrowdClapEmote(bot.lastEmoteUrn ?? '') || isScrapCrowdClapEmote(trigger)
    if (clapping) playBotEmote(bot, 'shrug')
    else if (pulse) playBotEmote(bot, pulseEmote)
  }
}

/** Hard-stop a bot's animation. An AvatarShape LOOPS its last expression forever,
 *  so a stopped show left random bots clapping into the void until this clears
 *  the trigger. */
export function stopBotEmote(bot: TroupeBot): void {
  if (!bot.lastEmoteUrn) return
  const shape = AvatarShape.getMutableOrNull(bot.entity)
  if (!shape) return
  bot.emoteTimestamp += 1
  bot.lastEmoteUrn = ''
  shape.expressionTriggerId = ''
  shape.expressionTriggerTimestamp = bot.emoteTimestamp
}

/** Keep standing bots out of each other — nudge targets apart when two arrived
 *  bots overlap (<0.7m), so nobody reads as two avatars merged into one body.
 *  Runs on the throttled troupe tick, only for settled bots. */
const MIN_BOT_GAP = 0.7
export function separateBots(): void {
  for (let a = 0; a < bots.length; a++) {
    for (let b = a + 1; b < bots.length; b++) {
      const A = bots[a]
      const B = bots[b]
      if (botHoldsFormation(A) || botHoldsFormation(B)) continue
      // A leased bot belongs to Scrap — position included. In the white room
      // her target sits over the crowd in XZ and must not be shoved.
      if (isScrapLeased(A.index) || isScrapLeased(B.index)) continue
      // Same for a performer: its mark IS the strike spot. Shoving that target
      // walks the fighter off the bag mid-turn.
      if (botIsPerforming(A) || botIsPerforming(B)) continue
      if (A.stationed || B.stationed) continue
      const dx = B.tx - A.tx
      const dz = B.tz - A.tz
      const dist = Math.hypot(dx, dz)
      if (dist >= MIN_BOT_GAP) continue
      // Push B's target away from A's along their axis (or a deterministic
      // sideways step when exactly stacked).
      const push = (MIN_BOT_GAP - dist) + 0.05
      const nx = dist > 0.01 ? dx / dist : Math.cos(b * GOLDEN)
      const nz = dist > 0.01 ? dz / dist : Math.sin(b * GOLDEN)
      B.tx += nx * push
      B.tz += nz * push
    }
  }
  // Separation must never shove a target into mesh — project pushed targets
  // back out of the no-go discs.
  for (const b of bots) {
    if (isScrapLeased(b.index)) continue
    const discs = obstructionDiscsScene(b.floorIndex)
    if (discs.length) {
      const out = projectOutOfDiscs(b.tx, b.tz, discs)
      b.tx = out.x
      b.tz = out.z
    }
  }
}

// Built-in dance-crew outfits, cycled per NPC so the troupe reads as a varied
/**
 * The built-in crowd, built once. Deterministic, so every client dresses the
 * same NPC identically — a crowd that differs between viewers reads as a bug.
 */
let defaultCrewCache: DanceOutfit[] | null = null
function defaultCrewLooks(): DanceOutfit[] {
  if (!defaultCrewCache) defaultCrewCache = castDefaultLooks(64, 1)
  return defaultCrewCache
}

// crowd instead of identical bare bodies. All are DCL base wearables (always
// available, no ownership). Face features (eyes/eyebrows/mouth) are included so
// the bots aren't blank-faced. If config.npc.wearables is set, it overrides ALL
// of these (the owner dressing the whole crew from a URN list).
const BASE = 'urn:decentraland:off-chain:base-avatars:'
const FACE = [`${BASE}eyes_00`, `${BASE}eyebrows_00`, `${BASE}mouth_00`]
interface Outfit {
  bodyShape: string
  hairColor: { r: number; g: number; b: number }
  wearables: string[]
}
const CREW_OUTFITS: Outfit[] = [
  { bodyShape: `${BASE}BaseMale`, hairColor: { r: 0.1, g: 0.08, b: 0.06 }, wearables: [`${BASE}casual_hair_01`, `${BASE}green_hoodie`, `${BASE}brown_pants`, `${BASE}sneakers`] },
  { bodyShape: `${BASE}BaseFemale`, hairColor: { r: 0.9, g: 0.3, b: 0.55 }, wearables: [`${BASE}pony_tail`, `${BASE}blue_tshirt`, `${BASE}f_jeans`, `${BASE}sneakers`] },
  { bodyShape: `${BASE}BaseMale`, hairColor: { r: 0.05, g: 0.05, b: 0.05 }, wearables: [`${BASE}cornrows`, `${BASE}sport_jacket`, `${BASE}basketball_shorts`, `${BASE}sport_black_shoes`] },
  { bodyShape: `${BASE}BaseFemale`, hairColor: { r: 0.35, g: 0.2, b: 0.08 }, wearables: [`${BASE}shoulder_hair`, `${BASE}red_tshirt`, `${BASE}hip_hop_joggers`, `${BASE}sneakers`] },
]

function resolvedBotAppearance(config: DanceVenueConfig, index: number): {
  bodyShape: string
  wearables: string[]
  hairColor: { r: number; g: number; b: number }
  skinColor?: { r: number; g: number; b: number }
  eyeColor?: { r: number; g: number; b: number }
} {
  const ownOutfits = resolveNpcAttributes(config, index).outfits
  const custom = config.npc.wearables
  let bodyShape: string
  let wearables: string[]
  let hairColor = { r: 0.1, g: 0.08, b: 0.06 }
  let skinColor: { r: number; g: number; b: number } | undefined
  let eyeColor: { r: number; g: number; b: number } | undefined
  if (ownOutfits.length) {
    const outfit = ownOutfits[index % ownOutfits.length]
    bodyShape = outfit.bodyShape
    wearables = [...FACE, ...outfit.wearables]
    if (outfit.hairColor) hairColor = outfit.hairColor
    skinColor = outfit.skinColor
    eyeColor = outfit.eyeColor
  } else if (custom.length) {
    bodyShape = CREW_OUTFITS[index % CREW_OUTFITS.length].bodyShape
    wearables = [...FACE, ...custom]
  } else {
    // Nobody dressed this crew, so give them the built-in mix: 64 authored
    // characters blended across the everyday cast packs. The old fallback was
    // four outfits cycled across the whole crowd, which is exactly why ten
    // NPCs standing together looked like three people repeated.
    const mix = defaultCrewLooks()
    if (mix.length) {
      const outfit = mix[index % mix.length]!
      bodyShape = outfit.bodyShape
      wearables = [...FACE, ...outfit.wearables]
      if (outfit.hairColor) hairColor = outfit.hairColor
      skinColor = outfit.skinColor
      eyeColor = outfit.eyeColor
    } else {
      const outfit = CREW_OUTFITS[index % CREW_OUTFITS.length]
      bodyShape = outfit.bodyShape
      wearables = [...FACE, ...outfit.wearables]
      hairColor = outfit.hairColor
    }
  }
  return { bodyShape, wearables, hairColor, skinColor, eyeColor }
}

function writeBotAvatarShape(config: DanceVenueConfig, bot: Pick<TroupeBot, 'entity' | 'index' | 'emoteTimestamp' | 'lastEmoteUrn'>): void {
  const appearance = resolvedBotAppearance(config, bot.index)
  const existing = AvatarShape.getOrNull(bot.entity)
  const bout = activeScrapSession()
  const fightUrns = bout && bout.npcIndex === bot.index ? fightBoutEmoteUrns(bout.seed) : []
  AvatarShape.createOrReplace(bot.entity, {
    id: npcAvatarShapeId(config, bot.index),
    name: npcDisplayName(config, bot.index),
    bodyShape: appearance.bodyShape,
    hairColor: appearance.hairColor,
    ...(appearance.skinColor ? { skinColor: appearance.skinColor } : {}),
    ...(appearance.eyeColor ? { eyeColor: appearance.eyeColor } : {}),
    emotes: fightUrns.length ? fightUrns : npcEmoteUrns(),
    wearables: appearance.wearables,
    expressionTriggerId: existing?.expressionTriggerId ?? '',
    expressionTriggerTimestamp: existing?.expressionTriggerTimestamp ?? bot.emoteTimestamp
  })
  rebakeBotTransform(bot.entity)
}

/** Diagnostic: how many times spawn was attempted, and the last error (if any).
 *  Surfaced in the on-screen DIAG line so an empty floor is self-explaining. */
let spawnRuns = 0
let lastSpawnError = ''
/** Next crew index to spawn. Independent of `bots.length` so a failed avatar is skipped, not retried forever. */
let nextSpawnIndex = 0
/** Content map has scene-emote hashes. Backfill already-spawned bots a few per tick. */
let sceneEmotesReady = false

function unbindScrapEngage(bot: TroupeBot): void {
  if (bot.scrapHit) {
    unregisterScrapHit(bot.scrapHit)
    engine.removeEntity(bot.scrapHit)
    bot.scrapHit = null
  }
  destroyScrapTargetMark(bot.scrapMark)
  bot.scrapMark = null
}

function viewerXZ(): { x: number; z: number } {
  const me = Transform.getOrNull(engine.PlayerEntity) ?? Transform.getOrNull(engine.CameraEntity)
  if (me) return { x: me.position.x, z: me.position.z }
  const spawn = getRuntimeContext()?.spawn
  if (spawn) return { x: spawn.x, z: spawn.z }
  return { x: 0, z: 0 }
}

function botLodPinned(bot: TroupeBot): boolean {
  if (bot.stationed) return true
  if (bot.atCenter || bot.mode === 'center') return true
  return isScrapLeased(bot.index)
}

function promoteBotAvatar(config: DanceVenueConfig, bot: TroupeBot): void {
  if (bot.stationed) {
    bot.avatarLive = true
    bindScrapEngage(bot, config)
    return
  }
  if (bot.avatarLive) return
  writeBotAvatarShape(config, bot)
  bot.avatarLive = true
  bindScrapEngage(bot, config)
}

function demoteBotAvatar(bot: TroupeBot): void {
  if (bot.stationed) return
  if (!bot.avatarLive) return
  stopBotEmote(bot)
  if (AvatarShape.getOrNull(bot.entity)) AvatarShape.deleteFrom(bot.entity)
  unbindScrapEngage(bot)
  bot.avatarLive = false
}

function nearbyOtherGuests(view: { x: number; z: number }): number {
  let n = 0
  for (const [entity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (entity === engine.PlayerEntity) continue
    const tf = Transform.getOrNull(entity)
    if (!tf) continue
    if (Math.hypot(tf.position.x - view.x, tf.position.z - view.z) <= NPC_LOD.nearM) n += 1
  }
  return n
}

function reconcileNpcLod(): void {
  const config = getDanceConfig()
  if (!config) return
  const view = viewerXZ()
  // ONE ON ONE. While a bout runs (or resolves) nobody but the opponent keeps
  // an avatar: the cap drops to the pinned set, so the crowd is not in frame
  // and no second face can swap in on the fight spot. They come back after.
  const bout = activeScrapSession()
  /**
   * ‼️ONLY YOUR OWN BOUT MAY EMPTY YOUR OWN ROOM.
   *
   * Owner, 2026-09-09: *"after returning to the island, almost all NPCs became
   * invisible and only one remained visible… somebody could be boxing or
   * interacting while the relevant NPC is invisible."* Both halves are this
   * line. `activeScrapSession()` is ANY bout in the shared world state, not
   * this client's — so a fight anybody in the room picked dropped the LOD cap
   * to zero on EVERY screen, demoted the whole crowd to a bare Transform, and
   * left one visible face: the opponent, who is pinned. A regular somebody else
   * is talking to is then an invisible person you can still hover and click.
   *
   * The isolation itself is right and stays: when the ring is YOURS the crowd
   * gets out of frame so no second face can swap onto the fight spot. It just
   * has to be yours. `guestId` is stamped on the session by the planner, and
   * the ids are already lowercased on both sides.
   */
  const mine = localScrapPlayerId()
  const isolated =
    bout !== null &&
    (bout.phase === 'fight' || bout.phase === 'resolve') &&
    !!mine &&
    bout.guestId === mine
  const cap = isolated ? 0 : npcLodLiveCap(nearbyOtherGuests(view))
  const agents = bots.map((bot) => {
    const tf = Transform.getOrNull(bot.entity)
    const x = tf?.position.x ?? bot.tx
    const z = tf?.position.z ?? bot.tz
    return {
      id: bot.index,
      dist: Math.hypot(x - view.x, z - view.z),
      live: bot.avatarLive,
      pin: botLodPinned(bot)
    }
  })
  const want = pickNpcLodLive(agents, cap)
  const have = bots.filter((bot) => bot.avatarLive).map((bot) => bot.index)
  const { promote, demote } = npcLodDiff(want, have, npcLodPromoteBudget(have.length))
  const byIndex = new Map(bots.map((bot) => [bot.index, bot]))
  for (const id of demote) {
    const bot = byIndex.get(id)
    if (bot) demoteBotAvatar(bot)
  }
  for (const id of promote) {
    const bot = byIndex.get(id)
    if (bot) promoteBotAvatar(config, bot)
  }
  if (isolated) {
    for (const bot of bots) {
      if (botLodPinned(bot) && !bot.avatarLive) promoteBotAvatar(config, bot)
    }
  }
}

/**
 * A crowd that can actually box you in. NPC avatars have no physics, so the
 * only way to stop you walking through someone is a physics collider. It is
 * added only for the challenge/fight beats and removed the moment the lease
 * ends — a leftover solid NPC is how you trap a guest in the scene forever.
 */
function setBotSolid(bot: TroupeBot, solid: boolean): void {
  if (solid === bot.scrapSolid) return
  bot.scrapSolid = solid
  if (!solid) {
    if (bot.scrapWall) {
      engine.removeEntity(bot.scrapWall)
      bot.scrapWall = null
    }
    return
  }
  if (!bot.scrapWall) {
    bot.scrapWall = engine.addEntity()
    Transform.create(bot.scrapWall, {
      parent: bot.entity,
      position: Vector3.create(0, 0.95, 0),
      scale: Vector3.create(0.7, 1.9, 0.7)
    })
    MeshCollider.setBox(bot.scrapWall, ColliderLayer.CL_PHYSICS)
  }
}

let lastProvocationSeq = 0

/** "Fight ★★★" read as decoration; a WORD reads as a warning. */
function scrapSkillWord(skill: number): string {
  if (skill >= 0.68) return '(tough)'
  if (skill >= 0.42) return '(fair)'
  return '(pushover)'
}

const skillByBot = new Map<number, number>()
const personaByBot = new Map<number, ScrapPersona>()

/** Persona = the same wardrobe/attitude read as the skill, for the lines they say. */
function botScrapPersona(config: DanceVenueConfig | null, index: number): ScrapPersona {
  const cached = personaByBot.get(index)
  if (cached !== undefined) return cached
  const group = config ? botGroup(config, index) : null
  const attrs = config ? resolveNpcAttributes(config, index) : null
  const looks = [
    group?.name ?? '',
    group?.dressCode ?? '',
    ...(attrs?.outfits ?? []).map((outfit) => (typeof outfit === 'string' ? outfit : JSON.stringify(outfit)))
  ]
  const persona = scrapPersonaFor({ attitude: group?.attitude ?? null, looks })
  personaByBot.set(index, persona)
  return persona
}

/** Skill = attitude + wardrobe + seed jitter, with the config override on top. */
function botScrapSkill(config: DanceVenueConfig | null, index: number): number {
  const cached = skillByBot.get(index)
  if (cached !== undefined) return cached
  const group = config ? botGroup(config, index) : null
  const attrs = config ? resolveNpcAttributes(config, index) : null
  const looks = [
    group?.name ?? '',
    group?.dressCode ?? '',
    ...(attrs?.outfits ?? []).map((outfit) => (typeof outfit === 'string' ? outfit : JSON.stringify(outfit)))
  ]
  const skill = scrapSkillFor({
    npcIndex: index,
    attitude: group?.attitude ?? null,
    looks,
    override: group ? scrapPluginConfig().skillByGroup[group.id] ?? null : null
  })
  skillByBot.set(index, skill)
  return skill
}

/**
 * A fight emote by role — the Motion Studio clip if bundled, else the base
 * fallback, else NOTHING. An empty ref means the role has no non-dance base
 * emote, and standing in idle always beats dancing mid-fight.
 */
function isFatalFightRole(role: Parameters<typeof scrapEmoteRef>[0]): boolean {
  return role === 'down' || role === 'downIdle' || role.startsWith('ko')
}

function playFightEmote(bot: TroupeBot, role: Parameters<typeof scrapEmoteRef>[0], loop = false): void {
  const ref = scrapEmoteRef(role, (path) => resolveSceneEmoteUrn(path) !== null)
  if (!ref) {
    stopBotEmote(bot)
    return
  }
  const shouldLoop = loop || scrapKoLoopRole(role)
  const fatal = isFatalFightRole(role)
  // A standing base emote (`dontsee`) as a KO/floor fallback is exactly
  // "he never falls". Lay them down instead of playing it.
  if (fatal && !ref.startsWith('emotes/')) {
    layBotDown(bot)
    return
  }
  const shape = AvatarShape.getMutableOrNull(bot.entity)
  if (shape) {
    const requiredUrn = ref.startsWith('emotes/') ? sceneEmoteUrnFor(ref, shouldLoop) : null
    if (requiredUrn) {
      if (!npcEmoteArmed(shape, requiredUrn)) {
        if (fatal) {
          // Do not slot-on-fire. Explorer needs a beat to bind a newly added
          // GLB; a one-shot trigger on that frame is the standing dummy.
          layBotDown(bot)
          return
        }
        // Taunt / push / etc. that were not in the bout preload: last resort.
        ensureNpcEmote(shape, requiredUrn, reservedFightUrns(bot))
      }
    } else if (!isScrapLeased(bot.index) && !bot.pinnedEmotes.length) {
      const urns = npcEmoteUrns()
      if (urns.length && (shape.emotes?.[0] ?? '') !== (urns[0] ?? '')) shape.emotes = urns
    }
  }
  playBotEmote(bot, ref, shouldLoop)
}

/**
 * ‼️SELECTING A REGULAR IS OFF UNLESS SOMETHING CAN HAPPEN. "Select (pushover)"
 * hovered over every NPC on the punch island — a leftover of the fight it
 * starts in the Scrap venue, promising an interaction that does not exist here
 * (owner, 2026-09-06). The Scrap plugin switches it on when it boots; nothing
 * else does.
 */
let npcSelectEnabled = false
export function setNpcSelectEnabled(on: boolean): void {
  npcSelectEnabled = on
}

function bindScrapEngage(bot: TroupeBot, config: DanceVenueConfig | null): void {
  if (!npcSelectEnabled) return
  wireScrapEngageKey()
  // No select mark on someone you are already fighting — during a bout the
  // pointer collider is removed entirely, so the hover prompt cannot appear.
  if (isScrapLeased(bot.index)) return
  if (bot.scrapHit) return
  const hit = engine.addEntity()
  Transform.create(hit, {
    parent: bot.entity,
    position: Vector3.create(0, 0.95, 0),
    scale: Vector3.create(0.75, 1.9, 0.75)
  })
  MeshCollider.setBox(hit, ColliderLayer.CL_POINTER)
  const label = bot.selectLabel || scrapSkillWord(botScrapSkill(config, bot.index))
  const hover = scrapEngageHoverText({ scrapOn: isScrapActive(), pinned: !!bot.pin, guestBusy: scrapGuestUnavailable(), label })
  pointerEventsSystem.onPointerDown(
    {
      entity: hit,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: hover,
        maxDistance: 16,
        showFeedback: true
      }
    },
    () => {
      if (scrapInputLocked()) return
      // Not the regular at the bag, and not while you are the one at it. SAID,
      // not swallowed: the hover reads "Fight" and a click that does nothing
      // reads as a bug (owner, 2026-09-08: "it says fight and I cannot start
      // the fight -- if that wouldn't be a problem I wouldn't report it").
      if (bot.pin) { showScreenAnnouncement("THAT'S A REGULAR AT THE BAG — PICK SOMEONE OFF THE DECK TO FIGHT"); return }
      if (scrapGuestUnavailable()) { showScreenAnnouncement('NOT WHILE YOU HOLD THE BAG'); return }
      selectScrapNpc(bot.index)
      runNpcClickAction(bot.index)
      if (
        isScrapActive() &&
        scrapPluginConfig().playerCanInitiate !== false &&
        !hasNpcClickAction(bot.index)
      ) {
        notifyNpcProvoke(bot.index)
        queuePlayerScrap(bot.index, localScrapPlayerId() ?? localUserId())
      }
    }
  )
  registerScrapHit(hit, bot.index)
  bot.scrapHit = hit
  bot.scrapHover = hover
  if (!bot.scrapMark) bot.scrapMark = createScrapTargetMark(bot.entity)
}

let scrapEngageKeyWired = false

/** E provokes the selected NPC — or the one under the pointer. Never the nearest. */
function wireScrapEngageKey(): void {
  if (scrapEngageKeyWired) return
  scrapEngageKeyWired = true
  onActionKey('primary', () => {
    if (!isScrapActive() || scrapPluginConfig().playerCanInitiate === false) return
    if (scrapInputLocked()) return
    const target = scrapProvokeNpcIndex()
    if (target == null) return
    notifyNpcProvoke(target)
    queuePlayerScrap(target, localScrapPlayerId() ?? localUserId())
  })
}

/**
 * Fight clips FIRST. `AvatarShape.emotes` has no documented cap, but the avatar
 * emote wheel has ten slots and this scene now bundles 29 clips — if anything
 * downstream truncates the list, the looping fighting pose must not be dropped.
 */
function npcEmoteUrns(): string[] {
  const fightUrns = scrapEmotePaths()
    .map((path) => resolveSceneEmoteUrn(path))
    .filter((urn): urn is string => urn !== null)
  // Hold URNs first: AvatarShape ignores a loop=true trigger that is not in
  // this list, which is why the opponent stood in the default idle.
  const head = dedupeUrns([...npcHoldEmoteUrns(), ...fightUrns])
  if (head.length) return head.slice(0, NPC_EMOTE_SLOTS)
  // No Scrap clips in this build — carry a small slice so idle/support moves
  // still have something bound. Never the whole library.
  return allSceneEmoteUrns().slice(0, NPC_EMOTE_SLOTS)
}

/**
 * The ten clips THIS bout will fire, already in `emotes` so Explorer can bind
 * them during the walk-up. Holds-first `npcEmoteUrns` only has room for three
 * one-shots after seven looping holds — jab, kick and the fatal were never in
 * the list until the fire frame, which is the standing dummy.
 */
function fightBoutEmoteUrns(seed: number): string[] {
  const urns: string[] = []
  for (const role of scrapFightBoutRoles(scrapKoStyleFor(seed))) {
    const ref = scrapEmoteRef(role, (path) => resolveSceneEmoteUrn(path) !== null)
    if (!ref.startsWith('emotes/')) continue
    const urn = sceneEmoteUrnFor(ref, scrapKoLoopRole(role))
    if (urn) urns.push(urn)
  }
  return dedupeUrns(urns).slice(0, NPC_EMOTE_SLOTS)
}

function reservedFightUrns(bot: TroupeBot): string[] {
  if (!isScrapLeased(bot.index)) return []
  const bout = activeScrapSession()
  if (!bout || bout.npcIndex !== bot.index) return []
  return fightBoutEmoteUrns(bout.seed)
}

/**
 * Slots that must survive a stray crowd emote. A bout's clips, or whatever a
 * scripted performance armed on this bot — a taunt evicting the punch would
 * put us straight back to the standing dummy.
 */
function reservedEmoteUrns(bot: TroupeBot): string[] {
  const fight = reservedFightUrns(bot)
  if (fight.length) return fight
  return bot.pinnedEmotes
}

function armFightClips(bot: TroupeBot, seed: number): void {
  const shape = AvatarShape.getMutableOrNull(bot.entity)
  if (!shape) return
  const urns = fightBoutEmoteUrns(seed)
  if (!urns.length) return
  // Backfill visits the leased opponent every troupe tick. Reassigning an
  // identical list makes Explorer rebind the armature every time and can eat
  // every expression trigger. Arm once; subsequent ticks must be true no-ops.
  setNpcEmotesIfChanged(shape, urns)
  bot.scrapKoArmed = true
}

function backfillSceneEmotes(limit: number): void {
  if (!sceneEmotesReady) return
  const urns = npcEmoteUrns()
  if (!urns.length) return
  let n = 0
  for (const bot of bots) {
    if (n >= limit) return
    const shape = AvatarShape.getMutableOrNull(bot.entity)
    if (!shape) continue
    // Never overwrite a live opponent with the generic ten-slot crowd list —
    // that drop is how jab/KO vanished from the armature mid-bout.
    if (isScrapLeased(bot.index)) {
      const bout = activeScrapSession()
      if (bout && bout.npcIndex === bot.index) armFightClips(bot, bout.seed)
      n++
      continue
    }
    // Same rule for a scripted performance: the punch performer walked up with
    // its stance and swing already bound. Dropping the crowd list on top of it
    // is the standing dummy by another route. Re-assert instead — idempotent,
    // so a settled performer costs nothing.
    if (bot.pinnedEmotes.length) {
      setNpcEmotesIfChanged(shape, bot.pinnedEmotes)
      n++
      continue
    }
    const have = shape.emotes ?? []
    if (have.length === urns.length && have[0] === urns[0]) continue
    shape.emotes = urns
    n++
  }
}

function spawnTroupe(): void {
  const config = getDanceConfig()
  if (!config) return
  const batch = nextNpcSpawnCount(nextSpawnIndex, config.npc.count)
  if (batch <= 0) {
    reportLandingCrowdProgress(bots.length, config.npc.count)
    backfillSceneEmotes(NPC_SPAWN_PER_TICK)
    return
  }
  spawnRuns += 1
  wireScrapEngageKey()
  const until = nextSpawnIndex + batch
  while (nextSpawnIndex < until) {
    const i = nextSpawnIndex
    nextSpawnIndex += 1
    try {
      spawnOneBot(config, i)
    } catch (e) {
      // One bad avatar must not kill the whole troupe — record it and continue.
      lastSpawnError = String((e as Error)?.message ?? e).slice(0, 90)
    }
  }
  reportLandingCrowdProgress(bots.length, config.npc.count)
  backfillSceneEmotes(NPC_SPAWN_PER_TICK)
}

function spawnOneBot(config: DanceVenueConfig, i: number): void {
  // Crew default → group → this one dancer. Resolved by the shared chain so the panel's
  // promise and what actually spawns cannot disagree.
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(0, 0, 0) })
  const bot: TroupeBot = {
    entity,
    index: i,
    atCenter: false,
    emoteTimestamp: 0,
    lastEmoteUrn: '',
    nextIdleAt: 0,
    nextCheerAt: 0,
    tx: 0,
    ty: 0,
    tz: 0,
    mode: 'hangout',
    holdUntil: 0,
    pin: null,
    facePx: null,
    facePz: null,
    stopEmoteAt: 0,
    nextRoamAt: 0,
    seed: (Math.imul(i + 1, 2654435761) ^ 0x9e3779b9) >>> 0,
    routeIds: [],
    routeCursor: 0,
    floorIndex: 0,
    roamRole: null,
    chaseTarget: null,
    nextGestureAt: 0,
    lastProgressAt: 0,
    lastTargetDistance: Number.POSITIVE_INFINITY,
    recoveryCount: 0,
    yieldUntil: 0,
    freeRoamTrips: 0,
    ambientAnchorX: null,
    ambientAnchorY: null,
    ambientAnchorZ: null,
    nextAmbientAt: 0,
    guestAck: emptyGuestAckState(),
    greetCount: 0,
    scrapBeatKey: '',
    scrapDown: false,
    scrapFallAt: 0,
    scrapFallOx: 0,
    scrapFallOy: 0,
    scrapFallOz: 0,
    scrapFallYaw: 0,
    scrapFallGuestX: 0,
    scrapFallGuestZ: 0,
    scrapHit: null,
    scrapHover: '',
    scrapMark: null,
    scrapWall: null,
    scrapWasLeased: false,
    scrapSolid: false,
    scrapKoStyle: null,
    scrapKoIdle: false,
    scrapKoLandedAt: 0,
    scrapKoRimAt: 0,
    scrapKoBodyAt: 0,
    scrapKoArmed: false,
    scrapKoBody: false,
    scrapPushUntil: 0,
    scrapPushShoveAt: 0,
    scrapRiseUntil: 0,
    scrapClipUntil: 0,
    scrapStillSince: 0,
    scrapClipAt: 0,
    scrapClipRole: null,
    scrapClipLoop: false,
    scrapHitUntil: 0,
    scrapHitOx: 0,
    scrapHitOy: 0,
    scrapHitOz: 0,
    scrapHitDx: 0,
    scrapHitDz: 0,
    scrapHitLift: 0,
    scrapHitDuration: 0,
    avatarLive: false,
    stationed: false,
    stationX: 0,
    stationY: 0,
    stationZ: 0,
    selectLabel: '',
    zoneId: null,
    zoneRadiusM: 0,
    pinnedEmotes: []
  }
  bots.push(bot)
  setBotTarget(bot, 'hangout')
  snapBot(bot)
}

function clampToStationZone(bot: TroupeBot, x: number, z: number): { x: number; z: number } {
  const r = bot.zoneRadiusM
  if (!(r > 0)) return { x: bot.stationX, z: bot.stationZ }
  const dx = x - bot.stationX
  const dz = z - bot.stationZ
  const d = Math.hypot(dx, dz)
  if (d <= r || d < 0.001) return { x, z }
  const s = r / d
  return { x: bot.stationX + dx * s, z: bot.stationZ + dz * s }
}

function intentKindIsFlee(intent: ReturnType<typeof scrapIntentFor>): boolean {
  return intent?.kind === 'flee' || intent?.kind === 'retreat' || intent?.kind === 'return_to_job'
}

/**
 * Adopt a host NPC that already has an AvatarShape (Vendor stall).
 * Same yellow-tube select as the crowd. Bound to a floor_zone disc — never free roam.
 */
export function adoptStationedNpc(args: {
  entity: Entity
  index: number
  x: number
  y: number
  z: number
  selectLabel: string
  zoneId?: string | null
  zoneRadiusM?: number
}): void {
  if (bots.some((bot) => bot.index === args.index)) return
  ensureTroupeSystems()
  const bot: TroupeBot = {
    entity: args.entity,
    index: args.index,
    atCenter: false,
    emoteTimestamp: 0,
    lastEmoteUrn: '',
    nextIdleAt: 0,
    nextCheerAt: 0,
    tx: args.x,
    ty: args.y,
    tz: args.z,
    mode: 'hangout',
    holdUntil: Number.MAX_SAFE_INTEGER,
    pin: null,
    facePx: null,
    facePz: null,
    stopEmoteAt: 0,
    nextRoamAt: 0,
    seed: (Math.imul(args.index + 1, 2654435761) ^ 0x9e3779b9) >>> 0,
    routeIds: [],
    routeCursor: 0,
    floorIndex: 0,
    roamRole: null,
    chaseTarget: null,
    nextGestureAt: 0,
    lastProgressAt: 0,
    lastTargetDistance: Number.POSITIVE_INFINITY,
    recoveryCount: 0,
    yieldUntil: 0,
    freeRoamTrips: 0,
    ambientAnchorX: args.x,
    ambientAnchorY: args.y,
    ambientAnchorZ: args.z,
    nextAmbientAt: 0,
    guestAck: emptyGuestAckState(),
    greetCount: 0,
    scrapBeatKey: '',
    scrapDown: false,
    scrapFallAt: 0,
    scrapFallOx: 0,
    scrapFallOy: 0,
    scrapFallOz: 0,
    scrapFallYaw: 0,
    scrapFallGuestX: 0,
    scrapFallGuestZ: 0,
    scrapHit: null,
    scrapHover: '',
    scrapMark: null,
    scrapWall: null,
    scrapWasLeased: false,
    scrapSolid: false,
    scrapKoStyle: null,
    scrapKoIdle: false,
    scrapKoLandedAt: 0,
    scrapKoRimAt: 0,
    scrapKoBodyAt: 0,
    scrapKoArmed: false,
    scrapKoBody: false,
    scrapPushUntil: 0,
    scrapPushShoveAt: 0,
    scrapRiseUntil: 0,
    scrapClipUntil: 0,
    scrapStillSince: 0,
    scrapClipAt: 0,
    scrapClipRole: null,
    scrapClipLoop: false,
    scrapHitUntil: 0,
    scrapHitOx: 0,
    scrapHitOy: 0,
    scrapHitOz: 0,
    scrapHitDx: 0,
    scrapHitDz: 0,
    scrapHitLift: 0,
    scrapHitDuration: 0,
    avatarLive: true,
    stationed: true,
    stationX: args.x,
    stationY: args.y,
    stationZ: args.z,
    selectLabel: args.selectLabel,
    zoneId: args.zoneId ?? null,
    zoneRadiusM: Math.max(0, args.zoneRadiusM ?? 0),
    pinnedEmotes: []
  }
  const shape = AvatarShape.getMutableOrNull(args.entity)
  if (shape) {
    const urns = npcEmoteUrns()
    if (urns.length) shape.emotes = urns
  }
  bots.push(bot)
  bindScrapEngage(bot, getDanceConfig())
  console.log(`[npc] stationed ${args.selectLabel || args.index} at ${args.x.toFixed(1)}, ${args.z.toFixed(1)}`)
}

export function pickEmote(list: string[], seed: number): string | null {
  if (!list.length) return null
  return list[seed % list.length] ?? list[0]
}

/** Ring-crowd "supportive / ready to dance" moves while the show runs. Owner's
 *  curation (2026-07-13): BOTH-hands-up ('handsair') is the party staple — used
 *  most (listed twice = double weight). 'clap' stays (good atmosphere + visible
 *  hand animation). 'dontsee' fits breakdance culture. Single-hand 'raiseHand'
 *  is OUT ("really not suitable"). Breakdance ready/uprock poses read as
 *  aggression toward the floor — trying to jump in next. */
export const SUPPORT_MOVES: string[] = [
  'handsair', // both hands up — party staple, double-weighted
  'emotes/bd_ready_3_x2_emote.glb', // ready bounce — "let me in"
  'clap',
  'emotes/bd_uprock_new_emote.glb', // uprock at the edge — hyped to jump in
  'handsair',
  'dontsee',
  'emotes/bboy_uprock_emote.glb',
  'emotes/bd_ready_3_x2_emote.glb'
]

/** Sparse ambient gestures per hangout role (base emotes are always available;
 *  the watcher's ready-bounce GLB resolves once scene emotes land). */
const CHAT_GESTURES = ['shrug', 'clap', 'wave']
const WATCH_GESTURES = ['emotes/bd_ready_3_x2_emote.glb', 'clap']

/** Dispersed-crowd behavior (show off). Chat clusters face each other and
 *  gesture now and then; watchers face the floor with a waiting bounce; roamers
 *  wander waypoint to waypoint. Nobody freezes mid-loop: ring emotes carry no
 *  stop timer and are cleared on entry, gestures stop themselves. */
export function runHangoutLife(bot: TroupeBot, now: number): void {
  if (bot.stationed) return
  const config = getDanceConfig()
  const group = config ? botGroup(config, bot.index) : null
  const onRing = isSupportRingBot(bot.index)
  // stopEmoteAt === 0 means "keep looping" on the support ring (hands-up ↔
  // ready-bounce). Treating that as leftover show residue every hangout tick
  // played one frame then froze the whole cypher in idle.
  if (!onRing && bot.lastEmoteUrn && bot.stopEmoteAt === 0) {
    stopBotEmote(bot)
  } else if (bot.lastEmoteUrn && bot.stopEmoteAt > 0 && now >= bot.stopEmoteAt) {
    stopBotEmote(bot)
    bot.stopEmoteAt = 0
  }

  // Host-held bots (send-to-zone, boot) keep their custom spot — no roaming.
  if (now < bot.holdUntil) return

  const tf = Transform.getOrNull(bot.entity)
  if (!tf) return
  const arrived = Math.hypot(bot.tx - tf.position.x, bot.tz - tf.position.z) < 0.3
  // The host's live ACTIVITY override wins over the published role; with no
  // override this is the published role, so a World nobody is hosting behaves
  // exactly as it did before.
  const acting = botRole(group)
  const role: HangoutRole =
    onRing
      ? 'watch'
      : acting === 'roam'
        ? 'roam'
        : acting === 'hangout'
          ? 'chat'
          : acting === 'dance_solo' || acting === 'dance_together'
            ? 'watch'
            : hangoutRole(bot.index)

  const crowdMood = getCrowdMood()
  const crowdSync = getCrowdSync()
  const crowdOverlayOn = !!(getCrowdFormation() || crowdMood || crowdSync)
  // Host CROWD holds the whole hangout in formation. Roamers would walk off
  // the triangle / circle / squad the moment they arrived.
  if (role === 'roam' && !crowdOverlayOn) {
    if (arrived && now >= bot.nextRoamAt) {
      setRoamTarget(bot)
      // Linger at the next stop 8–22 s before moving on.
      const pace = group?.energetic === true ? 0.55 : group?.energetic === false ? 1.45 : 1
      bot.nextRoamAt = now + (8000 + Math.floor(nextRand(bot) * 14000)) * pace
    }
    return
  }

  if (!arrived) return
  if (botHoldsFormation(bot)) {
    const home = config ? groupHomePoint(config, bot) : null
    if (home) {
      bot.tx = home.x
      bot.ty = home.y
      bot.tz = home.z
    }
    if (!(crowdMood || crowdSync)) {
      if (bot.lastEmoteUrn) stopBotEmote(bot)
      return
    }
  }
  if (crowdMood || crowdSync) {
    const interval = Math.max(2800, crowdMood === 'battle' ? 3200 : 4500)
    const offset = crowdHostBeatOffsetMs(crowdSync, bot.index)
    const epoch = Math.floor((now - offset) / interval)
    const nextBoundary = (epoch + 1) * interval + offset
    if (bot.nextIdleAt >= nextBoundary) return
    bot.nextIdleAt = nextBoundary
    bot.stopEmoteAt = Math.min(nextBoundary, now + (crowdMood === 'battle' ? 2200 : 3800))
    playBotEmote(bot, crowdHostEmote(crowdMood, crowdSync, bot.index, epoch))
    const line = crowdHostSpeechLine(crowdMood, bot.index, epoch)
    if (line) showNpcSpeech(bot.entity, line, crowdMood === 'battle' ? 1800 : 2400)
    return
  }
  // A group told to dance DANCES. Its own emote list wins; an empty one inherits the
  // crew list, exactly as NpcGroup.emotes documents ("Empty = inherit crew-level
  // npc.emotes"). Requiring group.emotes.length here meant every freshly created group
  // — which starts with emotes: [] — fell through to the ambient watch gestures and
  // read as "assigned to dance, still standing around".
  if (acting && isNpcDanceRole(acting)) {
    const moves = group?.emotes.length ? group.emotes : (config?.npc.emotes ?? [])
    if (moves.length) {
      // Movement is the group's TEMPO while it dances: Energetic changes move more often,
      // Calm holds each one longer. It used to reach only the roam/ambient branches below,
      // which return early for dancers — so the control read as dead for exactly the role
      // people set it on. Scaled from the GROUP so a unison routine stays in unison.
      const interval =
        Math.max(3, (config?.npc.routineSeconds ?? 8) * npcDanceTempoScale(group?.energetic ?? null)) *
        1000
      const epoch = Math.floor(now / interval)
      const nextBoundary = (epoch + 1) * interval
      if (bot.nextIdleAt >= nextBoundary) return
      bot.nextIdleAt = nextBoundary
      bot.stopEmoteAt = Math.min(nextBoundary, now + 6000)
      // dance_together = one routine, in unison. dance_solo = the same library, but each
      // dancer offset by their own index so the group never locks step.
      const step = acting === 'dance_together' ? epoch : epoch + bot.index
      playBotEmote(bot, moves[step % moves.length]!)
      return
    }
  }
  if (onRing) {
    const periodMs = Math.max(3000, (config?.crowd.periodS || 4) * 1000)
    const nextBoundary = (Math.floor(now / periodMs) + 1) * periodMs
    if (bot.nextIdleAt >= nextBoundary) return
    bot.nextIdleAt = nextBoundary
    bot.stopEmoteAt = 0
    // Idle hands only. Live cheer is a reaction overlay — a consequence of a move.
    playBotEmote(bot, cypherSupportMove(now, false, bot.index))
    const floor = danceFloorZone()
    if (floor) {
      const focus = zoneCenterScene(floor)
      bot.facePx = focus.x
      bot.facePz = focus.z
    }
    return
  }
  if (now < bot.nextIdleAt) return
  // No config = no crew to resolve against; fall back to the group's answer.
  const resolved = config ? resolveNpcAttributes(config, bot.index) : null
  const energetic = resolved ? resolved.energetic : (group?.energetic ?? null)
  const pace = energetic === true ? 0.55 : energetic === false ? 1.45 : 1
  bot.nextIdleAt = now + (14000 + ((bot.index * 3697) % 16000)) * pace
  bot.stopEmoteAt = now + 3800
  // An emote list that came from the crew default is NOT a per-dancer gesture set — the
  // ambient watch/chat gestures still win there. Only a group's or a dancer's own list
  // replaces them.
  const list =
    !resolved || resolved.source.emotes === 'crew'
      ? role === 'watch'
        ? WATCH_GESTURES
        : CHAT_GESTURES
      : resolved.emotes
  playBotEmote(bot, list[(bot.index + Math.floor(now / 10000)) % list.length]!)
}

export function onTroupePhaseChange(snap: DanceStateSnapshot, now: number): void {
  const config = getDanceConfig()
  if (!config) return
  for (const bot of bots) {
    if (bot.stationed) continue
    const isDancer = snap.dancer === `npc:${bot.index}`
    if (snap.phase === 'selected' && !isDancer) {
      // celebrate the incoming dancer — staggered so it reads organic
      bot.nextCheerAt = now + bot.index * 350
    } else if (snap.phase === 'failure' && !isDancer) {
      playBotEmote(bot, pickEmote(['dontsee', 'shrug', 'clap'], bot.index) ?? 'shrug')
    }
  }
}

/**
 * The hover is written once at bind time, but the answer moves: the regular
 * gets pinned at the bag, the guest picks the bag up and puts it down. Re-ask
 * every tick and rewrite the prompt only when it differs, so "Fight" never
 * stands over a click that is about to refuse.
 */
function refreshScrapHover(bot: TroupeBot): void {
  if (!bot.scrapHit || !isScrapActive()) return
  const text = scrapEngageHoverText({ scrapOn: true, pinned: !!bot.pin, guestBusy: scrapGuestUnavailable(), label: '' })
  if (text === bot.scrapHover) return
  const info = PointerEvents.getMutableOrNull(bot.scrapHit)?.pointerEvents[0]?.eventInfo
  if (!info) return
  info.hoverText = text
  bot.scrapHover = text
}

function npcSelectSystem(): void {
  const config = getDanceConfig()
  for (const bot of bots) {
    if (bot.avatarLive || bot.stationed) bindScrapEngage(bot, config)
    paintScrapTargetMark(bot.scrapMark, scrapPickModeFor(bot.index, isScrapLeased(bot.index)))
    refreshScrapHover(bot)
  }
}

function troupeSystem(dt: number): void {
  const config = getDanceConfig()
  if (!config?.npc.enabled || config.npc.count === 0) return
  troupeTimer -= dt
  if (troupeTimer > 0) return
  troupeTimer = TROUPE_INTERVAL_S

  spawnTroupe()
  reconcileNpcLod()
  for (const bot of bots) {
    if (bot.avatarLive) bindScrapEngage(bot, getDanceConfig())
  }
  if (!isDanceCoordinator()) return
  runCrowdDirectorTick(Date.now())
}

/** Host practice: walk an NPC pseudo-guest to a point (e.g. a zone centre) and
 *  hold it there so the crowd brain doesn't instantly march it back. */
export function hostWalkBotTo(
  index: number,
  pos: { x: number; y: number; z: number },
  holdMs = 60000
): void {
  emitDance({
    type: 'dance.npcCommand',
    command: { kind: 'walk', index, x: pos.x, y: pos.y, z: pos.z, holdMs },
    byUserId: localUserId() ?? ''
  })
}

function applyHostWalkBotTo(
  index: number,
  pos: { x: number; y: number; z: number },
  holdMs: number
): void {
  const bot = bots.find((b) => b.index === index)
  if (!bot) return
  bot.tx = pos.x
  bot.ty = pos.y
  bot.tz = pos.z
  bot.mode = 'hangout' // custom destination — don't face-lock to the floor
  bot.facePx = null // and don't face a stale chat cluster on arrival
  bot.facePz = null
  bot.holdUntil = Date.now() + holdMs
}

/** Host practice: "boot" an NPC — it walks far out past the crowd and stays
 *  there (held indefinitely), reading as kicked out of the party. */
export function hostDismissBot(index: number): void {
  emitDance({
    type: 'dance.npcCommand',
    command: { kind: 'dismiss', index },
    byUserId: localUserId() ?? ''
  })
}

function applyHostDismissBot(index: number): void {
  const bot = bots.find((b) => b.index === index)
  if (!bot) return
  stopBotEmote(bot)
  const away = dancePointScene(bot.index * GOLDEN, danceGatherRadius() + 14)
  if (away) {
    bot.tx = away.x
    bot.ty = away.y
    bot.tz = away.z
  }
  bot.mode = 'hangout'
  bot.facePx = null
  bot.facePz = null
  bot.holdUntil = Number.MAX_SAFE_INTEGER
}

/** On-screen diagnostic snapshot — how many bots exist, is the floor resolved,
 *  and where the first bot is standing. Lets us read the real NPC state in-world
 *  instead of guessing why the floor looks empty. */
/** Apply a validated persistent Director document without recreating the scene
 * or its NPC entities. Capacity stays deployment-owned; appearance and behavior
 * are reconciled in place. */
export function applyWorldDirectorSettings(settings: WorldDirectorSettings): void {
  const config = getDanceConfig()
  if (!config) return
  Object.assign(config.npc, settings.npc)
  config.crowd = settings.crowd
  config.crowdNavigation = settings.crowdNavigation
  config.reactions = settings.reactions
  config.encounterMood = settings.encounterMood
  for (const bot of bots) {
    if (bot.stationed) continue
    if (bot.avatarLive) writeBotAvatarShape(config, bot)
  }
}

export function troupeDiag(): {
  bots: number
  live: number
  floorOk: boolean
  sample: { x: number; z: number } | null
  runs: number
  error: string
  sync: ReturnType<typeof npcNetworkDiag>
} {
  const floor = danceFloorZone()
  const sample = bots.length
    ? { x: Math.round(bots[0].tx * 10) / 10, z: Math.round(bots[0].tz * 10) / 10 }
    : null
  return {
    bots: bots.length,
    live: bots.filter((bot) => bot.avatarLive).length,
    floorOk: !!floor,
    sample,
    runs: spawnRuns,
    error: lastSpawnError,
    sync: npcNetworkDiag()
  }
}

let troupeSystemsOn = false

function ensureTroupeSystems(): void {
  if (troupeSystemsOn) return
  troupeSystemsOn = true
  engine.addSystem(npcSelectSystem)
  engine.addSystem(troupeSystem)
  engine.addSystem(botMoveSystem)
  initNpcNetworkSync(getTroupeBots)
}

export function initDanceTroupe(): void {
  // Resolve scene-emote URNs in the background. Do NOT write them onto every
  // AvatarShape the instant they land — that was a second 100-NPC hitch on
  // top of spawn. Spawn writes the list per bot; already-spawned bots backfill
  // a few per troupe tick.

  // CRITICAL: emote resolution must NOT be able to prevent the troupe systems
  // from registering. If resolveSceneEmotes threw here, engine.addSystem below
  // never ran and the floor stayed empty (spawnTroupe never called). Guard it so
  // the crowd always spawns — worst case on base emotes.
  try {
    resolveSceneEmotes()
    onSceneEmotesResolved(() => {
      sceneEmotesReady = true
    })
  } catch (e) {
    lastSpawnError = `emote-resolve:${String((e as Error)?.message ?? e).slice(0, 60)}`
    console.log('[troupe] scene-emote resolve failed, NPCs use base emotes:', e)
  }
  if (!troupeSystemsOn) {
    onDance('dance.npcCommand', (message) => {
      if (!isDanceCoordinator()) return
      const command = message.command
      if (command.kind === 'walk') {
        applyHostWalkBotTo(
          Math.max(0, Math.round(command.index)),
          { x: command.x, y: command.y, z: command.z },
          Math.max(0, command.holdMs)
        )
      } else {
        applyHostDismissBot(Math.max(0, Math.round(command.index)))
      }
    })
  }
  ensureTroupeSystems()
}
