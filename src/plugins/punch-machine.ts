import { normalizePunchProfile, punchProfile, PUNCH_PROFILE_IDS, planPunchEffects, punchRoundAward, punchGoldenArmed, punchBoostLive, punchProfileBoardKey, punchProfileSpeed, punchStreakEnergy, punchIsAdmin, type PunchProfileId, type PunchGameProfile, type PunchEffectPlan, type PunchRescueSkill, type PunchFumbleRiskStyle } from '@shared/punch-game-profile'
import { PUNCH_PUSH_DECAY_SCALE, PUNCH_PUSH_REVIEW_MS, PUNCH_PUSH_START_AT_TARGET, PUNCH_PUSH_TAP_COOLDOWN_MS, PUNCH_PUSH_THRESHOLD, punchPushBandHalfWidth, punchPushLatches, punchPushQuality01, punchPushReplay, punchPushTargetAt } from '@shared/punch-push'
import { PUNCH_GOLD_MATERIAL } from '@shared/punch-visual-theme'
import { punchArenaSpotlight } from '@shared/punch-arena-spotlight'
import {
  punchRevealCountMs,
  punchScorePhaseMs,
  punchPerfectCutMs,
  punchPerfectCutSince,
  punchPerfectCutLit,
  punchRevealSettled,
  PUNCH_PERFECT_CUT_MS
} from '@shared/punch-machine-contract'
import {
  punchStance,
  punchChallenge,
  punchFumbleRisk01,
  punchFumbleStake01,
  punchChallengeAward,
  punchRescueInBand,
  punchRescueMarker,
  PUNCH_RESCUE_BAND_TAPS,
  PUNCH_RESCUE_TAP_COOLDOWN_MS
} from '@shared/punch-challenge'
import { PUNCH_MUSIC_TRACKS, PUNCH_MUSIC_TRACK_MS, punchEscalationTrack } from '@shared/punch-game-profile'
import { claimPunchCrowd, releasePunchCrowd } from './punch-crowd-lease'
import { fxShakeCameraEntity, playPunchCameraImpulse, releaseFxShakeCamera } from '../effects/admin-fx'
import {
  AudioSource,
  AvatarShape,
  ColliderLayer,
  EasingFunction,
  Entity,
  GltfContainer,
  GltfNodeModifiers,
  InputAction,
  InputModifier,
  LightSource,
  MainCamera,
  Material,
  MaterialTransparencyMode,
  MeshCollider,
  MeshRenderer,
  PlayerIdentityData,
  ParticleSystem,
  Physics,
  PointerEventType,
  SkyboxTime,
  TextShape,
  Transform,
  Tween,
  TweenLoop,
  TweenSequence,
  VideoPlayer,
  VirtualCamera,
  VisibilityComponent,
  engine,
  inputSystem,
  pointerEventsSystem
} from '@dcl/sdk/ecs'
import { getWorldPosition, RealmInfo } from '@dcl/ecs'
import { punchRoomDiagnostics } from './punch-room-wire'
import { punchServerPulseAlive } from './punch-server-pulse'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { movePlayerTo, triggerEmote, triggerSceneEmote, changeRealm } from '~system/RestrictedActions'
import { getRealm } from '~system/Runtime'
import { setScrapGuestGuard, setScrapBoutListener } from './scrap-guard'
import { setScrapKoDeck } from '@shared/scrap-ko-ground'
import { bundledEmotePaths } from '@shared/emote-library'
import { pointInFloorZone } from '@shared/floor-zone-hit'
import { sceneToGlbLocal } from '@shared/dcl-placement'
import {
  normalizePunchMachineAppConfig,
  isPunchFocusBotId,
  PUNCH_FOCUS_BOT_IDS,
  PUNCH_FOCUS_IDLE_MS,
  PUNCH_FOCUS_MAX_BONUS_01,
  PUNCH_FOCUS_RANGE_M,
  PUNCH_FOCUS_TAP_COOLDOWN_MS,
  PUNCH_FOCUS_TARGET_01,
  PUNCH_FOCUS_CEILING,
  PUNCH_FOCUS_FLOOR_01,
  punchFocusDriftAdvance,
  punchFocusGustAt,
  punchFocusTargetAt,
  punchFocusBandHalfWidth,
  punchFocusDecay,
  punchFocusQuality01,
  punchBoostPoints,
  type PunchBoostContribution,
  punchFocusTap,
  punchFocusZoneHalfWidth,
  PUNCH_MACHINE_WIDTH_M,
  punchReactionIntensity,
  punchReachableCeiling,
  PUNCH_HIGH_GROUND_THRESHOLD,
  punchScoreForAttempt,
  punchAttemptMarker01,
  punchTimingDisplayElapsedMs,
  punchPowerQuality01,
  punchReloadMs,
  PUNCH_ROUND_ATTEMPTS,
  PUNCH_ROUND_ATTEMPTS_MAX,
  punchRoundAttemptsAfter,
  punchStreakAfter,
  punchStreakBonus,
  punchStreakName,
  PUNCH_ROUND_SUMMARY_MS,
  punchRevealLanded,
  punchRevealShownScore,
  PUNCH_SCORE_COUNT_MS,
  PUNCH_SCORE_HOLD_MS,
  PUNCH_SCORE_PHASE_MS,
  PUNCH_TIMING_TARGET_01,
  PUNCH_TIMING_SWEET_WIDTH_01,
  punchTimingSweetWidth01,
  punchFocusKarma01,
  punchKarmaBand01,
  punchKarmaRunMs,
  punchCircleScore,
  PUNCH_CARD_HOLD_MS,
  type PunchCircleBest,
  punchBoostKarmaMultiplier,
  punchKarmaSelfMultiplier,
  type PunchAttemptBreakdown,
  type PunchLeaderboardEntry,
  type PunchMachineAppConfig
} from '@shared/punch-machine-contract'
import { triggerBreakdanceCrowdReaction } from '../dance/reactions'
import { armBotEmotes, getTroupeBots, playBotEmote, releaseBotEmotes, setBotSceneTarget, setBotTarget, stopBotEmote, type TroupeBot } from '../dance/troupe'
import { showNpcSpeech } from '../dance/npc-speech'
import { runtimeZoneById } from '../dance/zones'
import { getRuntimeContext } from '../social/runtime-context'
import { getSocialConfig } from '../social/config'
import { isSocialAdminWallet } from '@shared/social-surface-contract'
import { applyPunchIslandTouchControls } from '../mobile-controls'
import {
  PUNCH_ISLAND_HEADROOM_M,
  punchMaxIslandHeightM,
  punchSceneCeilingM,
  PUNCH_BAG_SPIN_DPS,
  PUNCH_BAG_Z,
  PUNCH_BOUNCE_MAX_MPS,
  PUNCH_CABINET_FACE_DEG,
  PUNCH_CABINET_SPAWN_X,
  PUNCH_CABINET_SPAWN_Z,
  punchCabinetSpawnLook,
  PUNCH_CONTACT_BAND_M,
  PUNCH_PUMP_WINDOW_MS,
  punchCloudLaunchMps,
  punchPumpBeat,
  punchPumpDecay,
  PUNCH_DECK_RADIUS,
  PUNCH_HINGE_Z,
  clampPunchIslandCrowd,
  PUNCH_TURN_COUNTDOWN_S,
  PUNCH_ISLAND_LAMPS,
  PUNCH_SKY_FIXED_TIME_S,
  punchJumpCloudsFor,
  isPunchSeatCloud,
  PUNCH_MODELS,
  PUNCH_RAIL_HEIGHT,
  PUNCH_RAIL_RADIUS,
  PUNCH_RAIL_SEGMENTS,
  PUNCH_SCREEN_BOTTOM,
  PUNCH_SCREEN_TOP,
  PUNCH_SKY_FLOOR_M,
  PUNCH_VENT_CEILING_M,
  PUNCH_VENT_FLOOR_M,
  PUNCH_VENT_MARGIN_M,
  punchFlightCeilingY,
  punchAudienceSlot,
  punchCabinetOffsetZ,
  punchCabinetScale,
  punchOnCabinet,
  punchWatcherCount,
  PUNCH_OFFSTAGE_SPOTS,
  PUNCH_STANCE_RADIUS,
  PUNCH_STANCE_Y_BAND,
  PUNCH_STRIKE_Z,
  punchStrikeEvict,
  punchStrikeLook,
  punchStrikeStand,
  punchKnockAssist,
  punchSeamBoost,
  punchTwistAssist,
  punchWatcherSlot,
  PUNCH_BIG_SCREEN_FACE_DEG,
  PUNCH_BIG_SCREEN_NODE_PATHS,
  PUNCH_BIG_SCREEN_SCALE
} from '@shared/punch-machine-layout'
import { Billboard, BillboardMode } from '@dcl/sdk/ecs'
import { isLandingCoverBlocking } from './landing'
import { spawnCaptureOptedOut } from '../world-session'
import {
  arenaScreenLampCue,
  arenaScreenPattern,
  arenaScreenSlam,
  createArenaScreen,
  updateArenaScreen,
  type ArenaLampCue,
  type ArenaScreen
} from './punch-arena-screen'
import { attachCloudScreenVideo } from './cloud-screen-video'
import {
  composeShow,
  createShowLedger,
  dealShowClips,
  punchHeat,
  ShowRng,
  type ShowBeat,
  type ShowPlan
} from '@shared/punch-show'
import {
  HEAT_APOCALYPSE,
  HEAT_EXTREME,
  HEAT_LOUD,
  PUNCH_SHOW_CATALOG,
  PUNCH_SWING_CARDS
} from '@shared/punch-show-catalog'
import {
  SCREEN_PALETTES,
  screenPalette,
  type ScreenPatternId
} from '@shared/punch-show-patterns'
import { applyAvatarControls } from '../avatar-controls'
import {
  avatarControlsActive,
  type AvatarControlsConfig
} from '@shared/avatar-controls'
import { PUNCH_AUDIO } from './punch-audio-manifest'
import { PUNCH_AUDIO_ENVELOPES, PUNCH_ENVELOPE_STEP_MS } from './punch-audio-envelopes'
import {
  createPunchBoardStore,
  refreshPunchBoard,
  submitPunchBoardScore,
  type PunchBoardStore
} from './punch-board-store'
import {
  mergePunchBoards,
  punchBoardEnabled,
  type PunchBoardEntry
} from '@shared/punch-board-store'
import { rankPunchSaviors, punchSaviorScore, type PunchRoundResult, type PunchSaviorEntry } from '@shared/punch-results-store'
import {
  createPunchResultsLog,
  recordPunchRound,
  recordPunchSupport,
  refreshPunchSupportTotals,
  type PunchResultsLog
} from './punch-results-log'
import {
  clearFocusBubbles,
  updateFocusBubbles,
  type FocusSignalMember
} from './punch-focus-signals'
import {
  clearPushBars,
  updatePushBars,
  type PushSignalMember
} from './punch-push-signals'
import {
  showExtraPunchOverHead,
  updateExtraPunchOverHead
} from './punch-extra-punch-signal'
import {
  clearFocusWaves,
  emitFocusWave,
  setFocusWaveTarget,
  updateFocusWaves
} from './punch-focus-waves'
import {
  PUNCH_HOUSE_BOT_ID,
  startPunchCompetitionNetwork,
  type PunchCompetitionNetwork,
  type PunchCompetitionSnapshot,
  type PunchFocusMember,
  type PunchFocusState
} from './punch-machine-network'
import { punchAuthority } from './punch-authority-runtime'
import { punchHttpBindUser, punchHttpDiagnostics } from './punch-http-wire'
import type { ScenePluginContext } from './types'

type SoloPhase = 'ready' | 'charging' | 'scoring' | 'cooldown' | 'summary'

interface PunchMachineRuntime {
  authoredProfile?: PunchGameProfile
  effectPlan?: PunchEffectPlan
  slamStreak?: number
  /** De-duplicates the shared rescue success choreography on this client. */
  rescueFxKey?: string
  screenCrackUntil?: number
  recordBaselineRoundAt?: number
  personalBestBeforeRound?: number
  hourlyBestBeforeRound?: number
  dailyBestBeforeRound?: number
  allTimeBestBeforeRound?: number
  recordFxKey?: string
  musicEntity?: Entity
  goldenEntity?: Entity
  goldenActive?: boolean
  /** The sparkle around a gold ball. */
  goldenSparkle?: Entity
  /** When the gold armed, for the spin-up. 0 = not armed. */
  goldenSince?: number
  /** The round whose rungs have already been celebrated — the melody's memory. */
  musicRound?: string
  /** Highest rung this round has already played a melody for. */
  musicRung?: number
  /** The melody in the air, and the ms timestamp it finishes on its own fade. */
  musicPlaying?: keyof typeof PUNCH_MUSIC_TRACKS | ''
  musicUntil?: number
  reactionAt?: number
  cameraKickAt?: number
  /** How hard the kick lands, set by the punch floor with the timestamp. */
  cameraKickGain?: number
  celebrationSerial?: number
  celebrationUntil?: number
  /** Best divine punch this client has actually witnessed — the choir's record. */
  divineBest?: number
  /** When the heavens last opened here, so they cannot open twice in a run. */
  divineAt?: number
  id: string
  root: Entity
  model: Entity
  hitbox: Entity
  scoreText: Entity
  statusText: Entity
  queueText: Entity
  indicator: Entity
  lights: Entity[]
  firstPersonCamera: Entity
  revealCamera: Entity
  cameraFocus: Entity
  glovePunchStartedAt: number
  /** Hinged punch arm — swung in code because the authored parts carry no clips. */
  armPivot: Entity
  /** When the arm swing begins (release + emote wind-up). 0 = idle. */
  armSwingAt: number
  /** How long THIS swing’s fall lasts — the reload the punch earned. */
  armReturnMs: number
  /** Pending slam payload — impact SFX, smoke, shake and flash fire here. */
  slamAt: number
  /**
   * When the SCORING PHASE began (the release), which is a different instant
   * from the slam — the slam lands `SLAM_DELAY_MS` into it. The arc needs the
   * phase start, not the impact, because that is the clock the marquee's
   * count-up reads; handing it the impact instead is what let the big screen
   * finish counting before the cabinet did.
   */
  slamPhaseAt: number
  /** Score behind the pending slam — drives fireworks/escalation ON impact. */
  slamScore: number
  /** Whose punch it was, for the arc's verdict card. */
  slamName: string
  /** Each bot's assigned mark, so drifters can be put back. */
  slots: Array<{ x: number; z: number }>
  /** How many of them are watching rather than waiting off-stage. */
  watcherCount: number
  /** Humans on the deck last time we dealt the crowd out. */
  lastHumanCount: number
  /** Attempt allowance we have already announced, so +1 fires exactly once. */
  seenAllowed: number
  /** Last punch serial whose streak rung has already been shouted about. */
  seenStreakSerial: number
  /** When we last asked this player to clear the strike spot. 0 = not asking. */
  stepAsideSince: number
  /**
   * Seat this player on the mark until this time. Armed the instant THEIR turn
   * begins; cleared once they are squared up or the window ends.
   */
  strikeSeatUntil: number
  /** Last seat teleport, so declined movePlayerTo calls retry instead of stalling. */
  strikeSeatAt: number
  /** Reload countdown after a punch: 0 = ready. */
  reloadUntil: number
  slamIntensity: number
  /** World shake, driven from the slam on every client. */
  shakeUntil: number
  shakeMag: number
  rootBase: Vector3
  /**
   * THE CABINET'S OWN NODE, between the island and the hardware. Everything
   * bolted to the machine hangs off this and rides its recoil; nothing a player
   * can stand on or walk into ever does. See `updateCabinetRock`.
   */
  rig: Entity
  /** When the current recoil began. 0 = the machine is standing still. */
  rockAt: number
  /** Peak tip in degrees, front-up, about the cabinet's rear bottom edge. */
  rockPitchDeg: number
  /** Peak sideways stagger in degrees; the sign is which way it goes. */
  rockRollDeg: number
  /** How long the whole rock runs before the rig is parked upright again. */
  rockMs: number
  /** How long the first tip HANGS at its peak - the "it nearly went" beat. */
  rockHangMs: number
  /**
   * THE PUNCH'S OWN SPEAKER, and nothing else may ever use it.
   *
   * The shared pool is a round robin, so the loudest moment in the game was also
   * the most crowded: `playImpact` wrote two slots and everything that fires on
   * the same frame behind it — sting, crowd roar, machine rattle — wrapped round
   * and overwrote them before a frame had played. The report was exact: *"when I
   * smash the ball there is no sound of me smashing the ball... there is some
   * confetti, some people screaming, but me smashing the ball into the machine
   * is gone."*
   *
   * A bigger pool alone would only move the collision further away. The sound of
   * your own fist landing is the single most important sound in this game and it
   * gets a source that cannot be claimed, so no effect added later can silence
   * it by being added.
   */
  impactAudio: Entity
  /** 8-segment score meter inside the cabinet cavity. */
  meter: Entity[]
  /** Overlay glows on the marquee's side pods. */
  podLights: Entity[]
  /** Escalation: consecutive 900+ hits, read by the streak cards' `when`. */
  streak900: number
  /**
   * The swing card the director dealt for the last punch, so the emote picker
   * can use it instead of guessing from the tier. Empty until one is dealt.
   */
  showSwingCard: string
  overloadUntil: number
  lurchUntil: number
  railGlow: Entity[]
  starGlow: Entity
  starBlinkAt: number
  lightFlashUntil: number
  bestToday: number
  bestTodayName: string
  /** Solo round: three hits, best counts. */
  attemptInRound: number
  roundBest: number
  /** Punches granted this round — three, plus one for every big hit. */
  roundAttemptsAllowed: number
  /** The round's running total: the number that actually counts. */
  roundTotal: number
  /**
   * ‼️THE SCORING STREAK — consecutive 900s in THIS solo round, and not the same
   * number as `streak900` above. That one is spectacle bookkeeping the overload
   * card zeroes when it fires; this one pays points and nothing may spend it but
   * a punch that misses the threshold. See `punchStreakAfter` in the contract.
   */
  roundStreak: number
  /** Streak points banked this round, so the round card can name them. */
  roundStreakBonus: number
  audio: Entity[]
  audioCursor: number
  config: PunchMachineAppConfig
  network: PunchCompetitionNetwork | null
  localUserId: string
  /**
   * ‼️THE CONTEST BLOCKER THESE TWO FIELDS EXIST FOR.
   *
   * `getPlayer()` is asked ONCE, while the scene is still being built, and on a
   * cold client the profile is frequently not there yet -- the comms handshake
   * and the avatar fetch both land after the first frames. A blank id made
   * `competitionReady` false, the network was never started, and the machine
   * spent the entire session in SOLO while the player stood in a room full of
   * people wondering why there was no queue. Nothing recovered it: the check
   * never ran again.
   *
   * `identityNextAt` is the next moment to ask again, `identityUntil` the point
   * at which we stop asking. Stopping matters: a genuine guest has no id and
   * never will, and a scene that asks forever is a lie about what is coming.
   */
  identityNextAt: number
  identityUntil: number
  localHeldMs: number
  localChargeStartedAt: number
  localCharging: boolean
  localReleased: boolean
  localAccuracy01: number
  /** The Knock secret: progress through the 1-3-1 taps, and the armed window. */
  knockStep: number
  knockTapAt: number
  knockArmedUntil: number
  key1Held: boolean
  key3Held: boolean
  /** The Twist secret: when F was last seen held during a charge. */
  twistFDownAt: number
  /**
   * SPECTATOR FOCUS, this client's half. `focusLevel01` is a PREDICTION of the
   * level the coordinator is keeping for us: same impulse, same bleed, applied
   * the instant the key goes down so the bar answers the hand rather than the
   * network. The coordinator's copy is what pays out; this one is what is felt.
   */
  focusLevel01: number
  focusLastTapAt: number
  /**
   * ‼️THE RING RUN, PREDICTED HERE FOR THE SAME REASON THE LEVEL IS.
   *
   * `focusKarmaMs` is this client's own unbroken time inside
   * `PUNCH_FOCUS_KARMA_BAND_01`, stepped off the LOCAL meter. The coordinator
   * keeps the copy that pays; reading its echo here would show a booster a
   * multiplier a round trip behind the bar under their thumb, and the ring is
   * small enough that a round trip is most of a rung.
   *
   * `focusKarmaSerial` names the attempt the run belongs to, so a punch landing
   * cannot leave a warm run behind to be spent on the next one — the same rule
   * the coordinator's ledger keeps, kept identically on this side.
   */
  focusKarmaMs: number
  focusKarmaSerial: number
  /**
   * THE DRIFT CLOCK, kept locally and re-anchored from every snapshot.
   *
   * The still point wanders, and the band drawn under this client's thumb has
   * to be the same one the coordinator is paying against. It cannot be read off
   * a wall clock — two explorers are skewed by more than a green band is wide —
   * and it cannot be read off the heartbeat alone either, or the band would
   * jump 800 ms at a time under a bar that moves every frame.
   *
   * So the phase is advanced locally by measured elapsed time, which is
   * skew-free, and SNAPPED back to the coordinator's phase whenever a snapshot
   * carries a newer one. Between beats the band glides; on each beat it agrees.
   */
  focusDriftMs: number
  /** The phase the last snapshot carried, so a repeat is not re-anchored. */
  focusDriftSeenMs: number
  /**
   * WHICH SIDE THIS CLIENT IS ON. Both keys drive one meter, never two: a
   * spectator is lifting the punch or dragging it down, and switching wipes the
   * level they had built. Two independent meters would let one person hold both
   * ends of the tug of war at once, which is not a duel, it is a dial.
   */
  /** Rate limit on the wire — a tap is cheap, a held key at 60 Hz is not. */
  focusSentAt: number
  /** The avatar re-composes itself on a slow beat, not on every tap. */
  focusEmoteAt: number
  /** Throttled local replay of this client's own push contribution. */
  rescueMine?: number
  rescueMineAt?: number
  /** The window whose result sting has already played. */
  rescueReviewKey?: number
  /** Last time this helper's looped meditate was re-asserted. */
  rescueEmoteAt?: number
  /** Crowd cheer cadence while THIS client's needle is in the green. */
  rescueCheerAt?: number
  /** Spoken hype cadence while THIS client's needle is in the green. */
  rescueHypeAt?: number
  /** The window whose save/miss pose has already played. */
  rescuePoseKey?: number
  /**
   * THE HOUSE BOT'S BODY. `houseBotIndex` is the troupe NPC standing in for the
   * queue's synthetic entrant, claimed when the coordinator seeds it so the
   * avatar who walks up is the name on the board. Distinct from the attract show
   * below: that one takes FAKE turns, this one is really in the competition.
   */
  houseBotIndex: number
  /**
   * THE FLANKING CHANNELLERS. Troupe array indices of the two regulars standing
   * left and right of the cabinet who channel for and against every turn, in
   * the order the coordinator's reserved ids are dealt — so index 0 here is the
   * body that wears whatever side the first reserved id was given this turn.
   *
   * Claimed per turn rather than per boot, because the arc re-deals itself
   * whenever a human arrives and the two bodies on the flanks change with it.
   */
  focusBotIndices: number[]
  /** The meditation clip is re-triggered on a beat, not held by the client. */
  focusBotEmoteAt: number
  /**
   * The body actually ON the mark, which is not always the one claimed: the
   * coordinator seeds the next turn's NPC in the same tick the last turn ends,
   * so for one frame the claim has moved and the previous athlete is still
   * standing at the bag. Keeping both is what swaps them cleanly.
   */
  houseBotStagedIndex: number
  /** When the current body took the mark — the grace before it is placed. */
  houseBotStagedAt: number
  /** Whether the bag currently carries its click affordance. */
  bagArmed: boolean
  /** Punch serial already performed, so one swing is thrown per punch. */
  housePunchedSerial: number
  /**
   * THE PERFORMER'S STANCE. `botStanceIndex` is whose stance is being held —
   * the house bot or the attract show's athlete — so a handover resets the
   * cadence instead of leaving the new fighter in the default idle for up to
   * one re-trigger period.
   */
  botStanceIndex: number
  botStanceAt: number
  /** NPC attract show — a bot takes fake turns while no human is engaged. */
  showBotIndex: number
  showBotName: string
  showPhase: 'idle' | 'approach' | 'windup' | 'result'
  showPhaseAt: number
  showResultAt: number
  showScore: number
  ownsInput: boolean
  cameraMode: 'none' | 'first' | 'reveal'
  wasInQueue: boolean
  /**
   * ASKED TO PLAY. Standing on the deck used to enter you in the competition on
   * its own, so a visitor who came to watch was in the rotation before they had
   * read a word of it, and the bag was handed to people who were not looking at
   * it. Entering is a decision now; this is that decision, held locally and
   * reconciled against the shared queue every tick.
   */
  queueOptIn: boolean
  /**
   * MISSED YOUR TURN — out until you ask back in.
   *
   * The opt-in above is a LEVEL that reconciles itself every second, so the
   * coordinator dropping a no-show just handed them straight back in on the
   * next pass; every rotation stalled on the same absent player. A turn that
   * ends with the bag untouched clears the opt-in and raises this, and only a
   * deliberate ask lowers it again.
   */
  missedTurn: boolean
  /**
   * WHEN the notice was raised, so the banner can retire itself while the latch
   * above stays up. 0 = never raised on this entry.
   */
  missedTurnAt: number
  /** Did this player actually swing during the turn they are holding now? */
  swungThisTurn: boolean
  wasMyTurn: boolean
  /**
   * The last whole second the shot clock has already spoken, so a 30 Hz system
   * ticks ONCE per second instead of thirty times. -1 = nothing said yet.
   */
  turnTickSecond: number
  /**
   * How the NEXT join should be spelled. The reconcile is the only sender, so a
   * deliberate press has to leave its intent here for the reconcile to carry.
   */
  queueIntent: 'auto' | 'player'
  /** Throttle on re-sending the join/leave, so a slow snapshot cannot spam. */
  queueSyncAt: number
  /** When JOIN was pressed this entry, so a ghost join can time out. 0 = not asking. */
  joinAskedAt: number
  /** When this device started the punch network, for the dead-wire ghost clock. */
  networkSince: number
  /**
   * When the proximity read FIRST said "not at the machine" — 0 while it says
   * you are. The slot is only given up once it has said so for
   * `PUNCH_AWAY_GRACE_MS` without interruption. See the grace note at the read.
   */
  awaySince: number
  crowdGathered: boolean
  crowdWhisperAt: number
  crowdWhisperIndex: number
  crowdBotCount: number
  crowdReactionSerial: number
  /**
   * THE LAST PUNCH'S BREAKDOWN, KEPT ALIVE ACROSS THE RELOAD.
   *
   * The network clears `score` and `attempt` on the way from cooldown to ready,
   * so without a copy the result card dies with them. See `revealLanded`.
   */
  lastAwarded: PunchAttemptBreakdown | null
  /** The puncher's own last card, held for `PUNCH_CARD_HOLD_MS` from the moment it landed. */
  cardAttempt: PunchAttemptBreakdown | null
  cardSerial: number
  cardShownAt: number
  /** The blinking mark on the deck that says where to stand. Built on first use. */
  strikeRing: Entity | null
  /** Circle-score inputs, predicted locally like the meter: time fully in the green, time in the circle. */
  focusGreenMs: number
  focusLiveMs: number
  /** What the arm's ball nodes are currently painted — see paintArmBall. */
  armBallPaint: 'own' | 'gold' | 'gone'
  /** The ball that came off the arm on a monster punch, while it is loose. */
  looseBall: { entity: Entity; shell: Entity; vel: { x: number; y: number; z: number }; until: number; floorY: number; spinDeg: number } | null
  /** Reveal audio is deferred until the score counter lands. 0 = nothing pending. */
  revealAt: number
  revealScore: number
  lastRevision: number
  lastPresentedPhase: string
  soloPhase: SoloPhase
  soloHeldMs: number
  /** Seeds the solo sweep's reversals. Nobody else is watching, so it is local. */
  soloChargeStartedAt: number
  soloElapsedMs: number
  soloTargetScore: number
  soloAttempt: PunchAttemptBreakdown | null
  soloShownScore: number
  soloSerial: number
}

const machines: PunchMachineRuntime[] = []
const bursts: Array<{ entity: Entity; expiresAt: number }> = []

/**
 * A living jump cloud: the root rides a yoyo Tween (the explorer carries avatars
 * standing on Tween-moved colliders — per-frame Transform writes make them slide),
 * the visual squashes when someone lands, the collider dips a few centimetres so
 * the landing has give.
 */
interface JumpCloud {
  root: Entity
  visual: Entity
  /** The island the cloud hangs off — its outward direction throws a rider clear. */
  island: Entity
  /** True while the quake is displacing this cloud, so it is reset exactly once. */
  quaking: boolean
  collider: Entity
  audio: Entity
  radius: number
  soundsEnabled: boolean
  /** Seat terraces bounce and bob, with no updraught. Jump clouds also blow. */
  kind: 'jump' | 'seat'
  wasOn: boolean
  animKind: 'none' | 'land' | 'leave'
  animAt: number
  /** How hard the last landing hit, 0..1 — scales the dent and the sound. */
  bounce01: number
  /** The updraught: a particle column plus its own speaker, off until it blows. Seats have none. */
  vent: Entity | null
  /** True while the player is inside this cloud's column, on ANY frame. */
  inColumn: boolean
  /** True while this cloud is actually blowing, so the particles switch once. */
  venting: boolean
  /** When the current gust runs out. */
  ventUntil: number
  /** Earliest this cloud may catch the player again — one gust per pass. */
  ventReadyAt: number
  /** Last time the hold topped the player up: the servo runs at 10 Hz, not 60. */
  ventStepAt: number
}
const jumpClouds: JumpCloud[] = []
/**
 * Island root + config when the cabinet is off (Cloud Dance Floor). Fall prompt
 * and the way back up still need a place to aim, and they used to read that
 * off PunchMachineRuntime.
 */
let islandHost: { root: Entity; config: PunchMachineAppConfig } | null = null
/** Previous frame's avatar height, differentiated into a fall speed. */
let lastPlayerY: number | null = null
/** All clouds share ONE bob phase and period: they are the way back up, and
 * desynced bobbing widens the jump gaps between them at the worst moment. */
const CLOUD_BOB_M = 0.16
const CLOUD_BOB_MS = 4600
/** Amphitheater seats: a smaller bob, and each cloud on its own clock. */
const CLOUD_SEAT_BOB_M = 0.1
const CLOUD_LAND_MS = 700
const CLOUD_LEAVE_MS = 450
let systemAdded = false
let fallMachine: PunchMachineRuntime | null = null
/**
 * When a return teleport is allowed to still be in flight. movePlayerTo can be
 * refused outright (the player is outside this scene, so RestrictedActions decline
 * it) and it resolves either way, so a boolean "in progress" latch never cleared
 * and the prompt was gone for good — the owner was left on the ground with no way
 * back up. A deadline self-heals: if the player is still down when it passes, the
 * prompt returns.
 */
let fallReturnUntil = 0
/** Set when a return attempt visibly failed, so the prompt can say so. */
let fallReturnFailed = false
const FALL_RETURN_GRACE_MS = 2500

const CYAN = Color4.fromHexString('#32E9F2')
const WARM_WHITE = Color4.fromHexString('#F3E5C7')
const INDICATOR_GLOW = Color3.fromHexString('#32E9F2')
/**
 * Punch Machine audio. One clip per reaction tier (1-4, see punchReactionIntensity)
 * so a weak tap and a record hit do not share a sound. Reveal clips fire after the
 * score finishes counting up, not on impact.
 */
const SFX_IMPACT = [
  'sounds/punch/impact-1.mp3',
  'sounds/punch/impact-2.mp3',
  'sounds/punch/impact-3.mp3',
  'sounds/punch/impact-4.mp3'
]
const SFX_RATTLE = 'sounds/punch/machine-rattle.mp3'
const SFX_CHARGE = 'sounds/punch/charge-rise.mp3'
const SFX_TALLY = 'sounds/punch/score-tally.mp3'
/** Rows the ALL TIME page can draw (SCOREBOARD_ROWS in the HUD). The merge is capped here. */
const ALL_TIME_ROWS = 10
/**
 * How long "MISSED YOUR TURN" stays on screen. It is a NOTIFICATION, and a
 * notification that never leaves is not a notification — it is a permanent
 * accusation on the screen of somebody who has decided to watch instead.
 */
const PUNCH_MISSED_TURN_NOTICE_MS = 8_000
const SFX_HIGH_SCORE = 'sounds/punch/high-score.mp3'
const SFX_CHAMPION = 'sounds/punch/champion.mp3'
/**
 * THE SHOT CLOCK'S OWN VOICE. Three clips, one job each: the turn STARTING
 * (two rising notes, once), the seconds RUNNING OUT (a tick, once a second) and
 * the LAST one (an urgent double blip that cannot be mistaken for a tick).
 *
 * On the MACHINE channel, not CROWD: this is the cabinet telling you the rules,
 * and someone who has muted the audience still has to be able to take a turn.
 */
const SFX_TURN_START = 'sounds/punch/turn-start.mp3'
const SFX_TURN_TICK = 'sounds/punch/turn-tick.mp3'
const SFX_TURN_LAST = 'sounds/punch/turn-last.mp3'
// WORDLESS cheers only. The old crowd-1/crowd-2 takes had a spoken line baked
// into them ("wow, that was seriously good") and played on every decent hit,
// outside every voice throttle — which is why the machine would not shut up.
const SFX_CROWD = [
  'sounds/punch/crowd-cheer-1.mp3',
  'sounds/punch/crowd-cheer-2.mp3',
  'sounds/punch/crowd-cheer-3.mp3'
]
/**
 * Encouragement while a helper holds the green. Existing spectator takes that
 * already shout "come on" / "nice" — not punch-result lines, and never he/she.
 */
const PUSH_HYPE_VOICE: readonly string[] = [
  PUNCH_AUDIO.voiceBad[10]!,
  PUNCH_AUDIO.voiceBad[8]!,
  PUNCH_AUDIO.voiceWeak[17]!,
  PUNCH_AUDIO.voiceWeak[19]!,
  PUNCH_AUDIO.voiceGood[1]!,
  PUNCH_AUDIO.voiceGood[2]!,
]
const PUSH_CHEER_EVERY_MS = 850
const PUSH_HYPE_EVERY_MS = 1_650
const PUSH_RATTLE_MAG = 0.07
/**
 * Three reaction tiers: BAD (intensity 1), GOOD (2-3), TOP (4). This is the
 * IMPACT and CABINET ladder — those layers own three sets of clips and want
 * three. The SPOKEN layer has six of its own; see `voiceTier` below.
 */
type ReactionTier = 'bad' | 'good' | 'top'

function reactionTier(intensity: number): ReactionTier {
  return intensity >= 4 ? 'top' : intensity >= 2 ? 'good' : 'bad'
}

/**
 * SIX SPOKEN TIERS, BECAUSE SIX IS WHAT WAS WRITTEN.
 *
 * The crowd used to speak on the three-tier ladder above, and `reactionTier`
 * folds intensity 2 AND 3 into `good` — so every punch from 472 to 899, which
 * is most of the punches anybody is proud of, drew on ONE pool. The owner's
 * reaction doc has always had six tiers with their own lines; the bands below
 * are those six, and the boundaries the show already used (472, 753, 900, and
 * DIVINE_SCORE) are kept so nothing else in the ladder shifts under them.
 */
type VoiceTier = 'bad' | 'weak' | 'good' | 'strong' | 'top' | 'riot'

function voiceTier(score: number, config: PunchMachineAppConfig): VoiceTier {
  if (score >= DIVINE_SCORE) return 'riot'
  if (punchReactionIntensity(score, config) >= 4) return 'top'
  const span = Math.max(1, config.maxScore - config.minScore)
  const ratio = Math.max(0, Math.min(1, (score - config.minScore) / span))
  if (ratio >= 0.72) return 'strong'
  if (ratio >= 0.4) return 'good'
  // The one new boundary: a complete whiff and a real-but-limp punch used to get
  // the same sarcasm, and the doc writes them as separate tiers.
  if (ratio >= 0.2) return 'weak'
  return 'bad'
}

// The legacy first-draft voice takes ("wow, that was seriously good…") are
// RETIRED by owner order — heard once too often, gone from every pool and from
// the template bundle. An empty pool means silence, and silence beats a rerun.
const VOICE_POOLS: Record<VoiceTier, readonly string[]> = {
  bad: PUNCH_AUDIO.voiceBad,
  weak: PUNCH_AUDIO.voiceWeak,
  good: PUNCH_AUDIO.voiceGood,
  strong: PUNCH_AUDIO.voiceStrong,
  top: PUNCH_AUDIO.voiceTop,
  riot: PUNCH_AUDIO.voiceRiot
}

// The deal itself lives in shared/punch-show.ts beside ShowRng, where a test
// can reach it: `dealShowClips`.

const IMPACT_POOLS: Record<ReactionTier, readonly string[]> = {
  bad: PUNCH_AUDIO.punchNormal.length ? PUNCH_AUDIO.punchNormal : [SFX_IMPACT[0]!],
  good: PUNCH_AUDIO.punchStrong.length ? PUNCH_AUDIO.punchStrong : [SFX_IMPACT[2]!],
  top: PUNCH_AUDIO.punchTop.length ? PUNCH_AUDIO.punchTop : [SFX_IMPACT[3]!]
}

/** The cabinet's own answer: mechanical clunk on good, the big rattle on top. */
const MACHINE_POOLS: Record<ReactionTier, readonly string[]> = {
  // ‼️NOT EMPTY. A weak punch produced no cabinet layer at all, so the machine
  // simply did not answer a third of the hits thrown at it — the fist landed and
  // the cabinet said nothing. It borrows the `good` takes and plays them quietly
  // (see playImpact): the same body, heard further away, which is what a weak hit
  // sounds like. Silence is not a quiet sound.
  bad: PUNCH_AUDIO.machineGood,
  good: PUNCH_AUDIO.machineGood,
  top: PUNCH_AUDIO.machineTop.length ? PUNCH_AUDIO.machineTop : [SFX_RATTLE]
}

const SCORE_POOL: readonly string[] = PUNCH_AUDIO.score.length ? PUNCH_AUDIO.score : [SFX_TALLY]

/**
 * A punch should LOOK like its score — and it should not look the SAME every
 * time it earns the same score.
 *
 * Three clips keyed to three tiers is what the ladder used to be, and it meant
 * every good punch anybody ever threw was the identical cross. The swing is a
 * SHOW CHANNEL now: the card list lives in the catalog beside every other
 * effect, the heat window decides which clips a punch of that size may throw,
 * and the pick is seeded so it varies between attempts instead of being fixed
 * by the score.
 *
 * ‼️THE MAP IS THE ONLY PLACE A CLIP PATH IS WRITTEN. Adding the spin kick, the
 * elbow or the Bruce Lee stance is one card in the catalog and one line here —
 * and then the two allowlists, or it will silently do nothing in world.
 */
const SWING_EMOTE_BY_CARD: Record<string, string> = {
  'swing-jab': 'emotes/punch_jab_emote.glb',
  'swing-cross': 'emotes/punch_cross_emote.glb',
  // `angry_emote` is a misnomer inherited from the scrap-fight role table: the
  // motion is a right hand cocked a full 0.54 m behind the hip, driven forward
  // at constant chest height to +0.585 m at 417 ms while the left arm swings
  // back as the counterweight. 1.126 m of hand travel — more than double the
  // cross, the biggest strike in the library. See the swing-card comment in
  // shared/punch-show-catalog.ts for the measurements and why four other clips
  // that were dealt as "swings" turned out not to throw a punch at all.
  'swing-haymaker': 'emotes/angry_emote.glb',
  'swing-uppercut': 'emotes/scrap_uppercut_emote.glb'
}

/**
 * Which swing this punch throws.
 *
 * Seeded rather than random so the four places that ask — the local estimate at
 * release, the confirmed slam, the networked snapshot and the attract show —
 * all arrive at the SAME clip for the same punch. They used to each roll their
 * own, which is how a predicted jab could be followed by a cross on the replay.
 */
function punchSwingCardId(score: number, config: PunchMachineAppConfig, seed: number): string {
  const heat = punchHeat(score, config)
  const rng = new ShowRng(seed * 2654435761 + 101)
  const open = PUNCH_SWING_CARDS.filter(
    (card) => heat >= card.minHeat && heat <= (card.maxHeat ?? 1)
  )
  if (!open.length) return 'swing-jab'
  // The rare swings roll first and win when they come up; otherwise the common
  // ones share the punch out between them.
  const rare = open.filter((card) => typeof card.rarity === 'number' && card.rarity > 1)
  for (const card of rare) {
    if (rng.next() < 1 / (card.rarity as number)) return card.id
  }
  const common = open.filter((card) => !card.rarity)
  const pool = common.length ? common : open
  return pool[Math.floor(rng.next() * pool.length)]!.id
}

function punchEmoteFor(score: number, config: PunchMachineAppConfig, seed: number): string {
  return SWING_EMOTE_BY_CARD[punchSwingCardId(score, config, seed)] ?? SWING_EMOTE_BY_CARD['swing-jab']!
}

/** The stance a fighter holds at the bag. The player's, and now the NPC's. */
const PUNCH_STANCE_EMOTE = 'emotes/fighting_idle_emote.glb'

/**
 * Every clip a swing might ask for, so all of them can be bound at once.
 *
 * ‼️Derived from the map, never hand-listed. An NPC carries ten emote slots and a
 * clip written into one AT TRIGGER TIME lands unbound — the avatar just stands
 * there. Every swing has to be armed before it is needed, so this list must
 * grow the moment the map does.
 */
const PUNCH_SWING_EMOTES: readonly string[] = [...new Set(Object.values(SWING_EMOTE_BY_CARD))]

/**
 * Everything an NPC at the bag can fire — the stance it waits in plus every
 * swing a score can pick. One list, armed in one write, so the stance cannot
 * evict a swing (or the reverse) by being armed separately.
 */
const PUNCH_PERFORMER_EMOTES: readonly string[] = [PUNCH_STANCE_EMOTE, ...PUNCH_SWING_EMOTES]

/**
 * BIND THE SWING BEFORE IT IS NEEDED, never on the frame it is thrown.
 *
 * An NPC carries ten emote slots and `ensureNpcEmote` writes a clip it has not
 * seen into slot zero — at trigger time. Explorer re-binds the whole armature
 * when that list changes, so the trigger fired in the same frame lands on an
 * unbound GLB and the avatar just stands there. scene-emotes.ts names this
 * exactly ("the standing dummy") and guards the already-bound case; the NEW
 * clip case is the one that bit here. A different regular is claimed for every
 * turn, and the punch clips are new to any bot that has only ever been
 * audience, so EVERY punch was that first punch. The crowd's cheers kept
 * working throughout because clap/wave/handsair are base emotes and need no
 * slot at all — which is why the athlete appeared to do nothing but wave.
 *
 * Bound at staging instead, the swing has the whole walk-in to settle.
 *
 * ★ Binding is only half of it. `armBotEmotes` also LEASES the body: while a
 * bot carries pinned clips the crowd director, the guest-greeting beat, the
 * emote backfill, the standing settle and the target separation all leave it
 * alone. Each of those wrote over the stance and the swing within a tick, so
 * an armed clip alone still showed nothing.
 */
function armSwingEmotes(bot: TroupeBot): boolean {
  return armBotEmotes(bot, PUNCH_PERFORMER_EMOTES)
}

/** Re-triggered on this cadence so the stance reads as held, not as one twitch. */
const BOT_STANCE_EVERY_MS = 2_400

/** How long a swing owns the body before the stance may resume. */
const PUNCH_CLIP_MS = 2_500

/**
 * Put a performer into the ready stance and keep it there.
 *
 * The arming is retried rather than assumed: the content map resolves
 * asynchronously, so an NPC that walks up during boot has no URNs yet. Firing
 * the stance before then spends the trigger on nothing and leaves the fighter
 * in the default idle for the whole turn.
 */
function holdBotStance(machine: PunchMachineRuntime, bot: TroupeBot, now: number): void {
  if (machine.botStanceIndex !== bot.index) {
    machine.botStanceIndex = bot.index
    machine.botStanceAt = 0
  }
  if (now < machine.botStanceAt) return
  if (!armSwingEmotes(bot)) {
    // Not resolvable yet — come back next tick rather than every frame.
    machine.botStanceAt = now + 500
    return
  }
  machine.botStanceAt = now + BOT_STANCE_EVERY_MS
  playBotEmote(bot, PUNCH_STANCE_EMOTE, false)
  // Outlive the next re-trigger, not the turn: the crowd's own tick clears any
  // trigger whose stop time has passed, so a stance nobody renews drops on its
  // own when the fighter walks back to the rail.
  bot.stopEmoteAt = now + BOT_STANCE_EVERY_MS + 900
}

/** A swing is playing — hold the stance off until the clip has run. */
function suspendBotStance(machine: PunchMachineRuntime, now: number, ms: number): void {
  machine.botStanceAt = Math.max(machine.botStanceAt, now + ms)
}

/** The turn is over: drop the armed clips and let the crowd have the bot back. */
function endBotPerformance(machine: PunchMachineRuntime, bot: TroupeBot | null): void {
  if (machine.botStanceIndex >= 0 && (!bot || machine.botStanceIndex === bot.index)) {
    machine.botStanceIndex = -1
    machine.botStanceAt = 0
  }
  if (!bot) return
  bot.pin = null
  releaseBotEmotes(bot)
  stopBotEmote(bot)
}

let nextVoiceOkAt = 0
let hitsSinceVoice = 0
/** Above this, the crowd always finds its voice — no rationing, no dice. */
const ALWAYS_SPEAK_SCORE = 950
/**
 * How impressed the deck is, by score. A crowd that whoops at everything is
 * telling you nothing, so approval has to be earned and withheld:
 *   under 700  — near silence. A rare dry line, text only, never a cheer.
 *   700-819    — mild. Occasional half-hearted word, still no cheering.
 *   820+       — the crowd makes noise, louder the higher it goes.
 *   900+       — the heavy sting layers onto the punch itself.
 */
const CROWD_MEH_SCORE = 700
const CROWD_MILD_SCORE = 820
const CROWD_CHEER_SCORE = 820
const HEAVY_SLAM_SCORE = 900

/**
 * ‼️WHAT THE ROOM DOES WITH A NUMBER — ONE TABLE, READ BY BOTH CROWD PASSES.
 *
 * There were two of them. `updateCrowd` held this graded ladder, and the
 * celebration block in `playReveal` held a flat four — `[celebrationEmote,
 * 'fistpump', 'clap', 'handsair']`, half of it `handsair` — handed to EVERY bot
 * in the arc on EVERY punch. And because the celebration card is enabled from a
 * minScore of 0, its `gain > 0` short-circuits the graded pass entirely (see
 * the early return in `updateCrowd`), so the flat four was the only one that
 * ever ran and the ladder below was dead code. Three avatars threw the same
 * arms up for a 300. Owner, 2026-09-08: *"it just shouldn't be always raising
 * the same emote."*
 *
 * Applause is EARNED. A weak punch mostly gets nothing at all, and when it does
 * get something it is a shrug — people who cheer a bad hit make the good ones
 * worth nothing. `reacting` is a CAP; the caller clamps it to the bodies it has.
 *
 * `lead` is the Director's shared celebration. It rides at the front of the top
 * band's pool so the knob still shows, but it is never PINNED to a bot: pinning
 * is the complaint, restated.
 */
function crowdReactionPlan(
  score: number,
  config: PunchMachineAppConfig,
  lead: string
): { pool: readonly string[]; reacting: number } {
  if (score < CROWD_MEH_SCORE) {
    // Unimpressed has more than one face. A single 'shrug' on every weak punch
    // was itself the repetition the crowd was accused of.
    return { pool: ['shrug', 'dontsee', 'tik'], reacting: Math.random() < 0.15 ? 1 : 0 }
  }
  if (score < CROWD_MILD_SCORE) return { pool: ['clap', 'shrug', 'raiseHand', 'dontsee'], reacting: Math.random() < 0.4 ? 1 : 0 }
  if (punchReactionIntensity(score, config) >= 4) {
    // NOTHING FROM `AVATAR_VFX_EMOTES` — see shared/npc-ambient-emotes.ts.
    // `disco` and `money` were still here after `headexplode` went, and they do
    // the same damage: a mirror ball over the neighbour's head and banknotes
    // raining round their feet both land on YOUR screen, on the biggest punches,
    // when the crowd is packed tightest. This pool is motion only.
    const top = ['handsair', 'fistpump', 'clap', 'dab', 'raiseHand', 'tektonik', 'robot']
    return { pool: [lead, ...top.filter((emote) => emote !== lead)], reacting: 4 }
  }
  return { pool: ['clap', 'fistpump', 'wave', 'raiseHand', 'tik', 'hammer'], reacting: 2 }
}

/** Never the same clip twice in a row, per pool. */
const lastPick = new Map<readonly string[], number>()
function pickFrom(pool: readonly string[]): string | null {
  if (!pool.length) return null
  if (pool.length === 1) return pool[0]!
  let index = Math.floor(Math.random() * pool.length)
  if (index === lastPick.get(pool)) index = (index + 1) % pool.length
  lastPick.set(pool, index)
  return pool[index]!
}
/**
 * Authored assets, all in real metres — no scaling. The plaza's walk surface is
 * its own origin (mesh spans y -3.44..1.03), which is the same y=0 the colliders,
 * the machine root and the spawn point already agree on.
 */
const ISLAND_MODEL = PUNCH_MODELS.plaza
/**
 * The lowest a lowered island may sit. Below this the fall back up stops being
 * a climb and the deck reads as a platform on the ground.
 */
const PUNCH_ISLAND_MIN_DECK_M = 24
/** The plot the championship is authored for; named in the log, never assumed. */
const PUNCH_ISLAND_PLOT = '7x7'
const MACHINE_BODY = PUNCH_MODELS.body
const MACHINE_ARM = PUNCH_MODELS.arm
const MACHINE_DISPLAY = PUNCH_MODELS.display
const ARM_HINGE = Vector3.create(0, 2.0, PUNCH_HINGE_Z)
const DISPLAY_POS = Vector3.create(0, PUNCH_SCREEN_BOTTOM.y, PUNCH_SCREEN_BOTTOM.z)
const MACHINE_SCALE = punchCabinetScale(PUNCH_MACHINE_WIDTH_M)
const CABINET_Z = punchCabinetOffsetZ(MACHINE_SCALE)
/**
 * THE EDGE THE MACHINE TIPS OVER, in machine-root metres.
 *
 * machine-body.glb is authored with its origin AT THE BACK of the base plinth
 * (the plinth runs z -1.93..0, y 0..0.11) and the cabinet is turned 180 degrees
 * to face the spawn, so this point is the real machine's rear bottom edge - the
 * one a punch actually levers it over. Rock about anything else and the back
 * corner drives down through the deck instead.
 */
const ROCK_PIVOT = Vector3.create(0, 0, CABINET_Z)
/** Half the base's width in root metres: how far a rolled corner would sink. */
const ROCK_HALF_WIDTH = 0.81 * MACHINE_SCALE
/** Settle rate. Bigger = the rocking dies out sooner. */
const ROCK_DECAY = 2.4
/** Pitch is the fast axis: a hit knocks it back and it snaps up. */
const ROCK_PITCH_W = 8.7
/** Roll is slower and half the size, so the stagger trails the recoil. */
const ROCK_ROLL_W = 5.2

/**
 * Peak of `e^(-decay*t) * sin(w*t)`, so the amplitudes elsewhere can be written
 * in REAL DEGREES instead of a gain that has to be guessed against the decay.
 */
function rockPeak(w: number, decay: number): number {
  const t = Math.atan(w / decay) / w
  return Math.exp(-decay * t) * Math.sin(w * t)
}
const ROCK_PITCH_NORM = rockPeak(ROCK_PITCH_W, ROCK_DECAY)
const ROCK_ROLL_NORM = rockPeak(ROCK_ROLL_W, ROCK_DECAY)
/** When the first tip reaches its peak - where the hang, if any, freezes it. */
const ROCK_PEAK_MS = (Math.atan(ROCK_PITCH_W / ROCK_DECAY) / ROCK_PITCH_W) * 1_000
/**
 * Centre of the hanging bag at rest, in machine-root metres — DERIVED, because
 * a hand-tuned aim height is how the camera ended up above the bag looking down
 * into the plinth. machine-arm.glb hangs its ball from the hinge origin with the
 * centre 0.5 m below it (mesh bounds -0.845..-0.155), so the bag rides the hinge
 * height minus that, through the cabinet's own scale.
 */
const BALL_DROP_FROM_HINGE = 0.5
const BAG_REST_Y = (ARM_HINGE.y - BALL_DROP_FROM_HINGE) * MACHINE_SCALE
const DECK_RADIUS = PUNCH_DECK_RADIUS
const RAIL_RADIUS = PUNCH_RAIL_RADIUS
const RAIL_HEIGHT = PUNCH_RAIL_HEIGHT
/** Big marquee screen: score up top, leaderboard beneath it, same glass. */
// Straight from the measured layout. The old local value (z -1.86) sat 0.16 m
// BEHIND the panel's front face, so the score was rendering inside the cabinet
// every frame — the display looked dead when it was merely buried.
const SCREEN_TOP = { y: PUNCH_SCREEN_TOP.y, z: PUNCH_SCREEN_TOP.z }
const SCREEN_LEADERBOARD = { y: 2.3, z: -1.86 }
/** The base's black display: status line with the queue hint under it. */
const SCREEN_BOTTOM = { y: 0.345, z: -2.07 }
const SCREEN_QUEUE = { y: 0.255, z: -2.07 }
/**
 * The swing timeline (ms from arm start): rise, slam at the top, slow damped
 * return. The slam is the audiovisual centre of the whole game.
 */
const ARM_RISE_MS = 250
const ARM_HOLD_MS = 130
/** The avatar emote's wind-up: the arm waits for the fist to land. */
const EMOTE_CONTACT_MS = 380
/**
 * The bag creeps back down for as long as the machine is out of action, so the
 * wait has a cause you can watch instead of a dead button. The return starts
 * EMOTE_CONTACT + RISE + HOLD after the release and has to last until the
 * counter has finished and the reload has run out — derive it, so retuning any
 * of those never leaves the bag hanging in the roof again.
 */
function armReturnMs(score: number, streak: number, profile?: PunchGameProfile): number {
  // ‼️PER PUNCH, NOT A CONSTANT. `punchReloadMs` shortens the wait on a 900,
  // and a bag falling on the old fixed schedule would still be halfway up when
  // the button came back.
  return (
    PUNCH_SCORE_HOLD_MS +
    punchRevealCountMs(score, profile) +
    punchReloadMs(score, streak) -
    (EMOTE_CONTACT_MS + ARM_RISE_MS + ARM_HOLD_MS)
  )
}
/** The cold fall, for an idle bag and any swing scheduled without a score. */
const ARM_RETURN_COLD_MS = armReturnMs(0, 0)
/** Ball slams 155 degrees up and back into the machine's top housing. */
const ARM_SLAM_DEG = 155
/** Release -> slam: emote wind-up plus the arm's rise. */
const SLAM_DELAY_MS = EMOTE_CONTACT_MS + ARM_RISE_MS

/** Cabinet-local metres -> machine-root metres. See punchOnCabinet. */
function onCabinet(x: number, y: number, z: number): Vector3 {
  const mapped = punchOnCabinet(x, y, z, MACHINE_SCALE)
  return Vector3.create(mapped.x, mapped.y, mapped.z)
}

const LEFT_GLOVE_SRC = 'models/scrap/boxing-glove-left.glb'
const RIGHT_GLOVE_SRC = 'models/scrap/boxing-glove-right.glb'
const HIDDEN_SCALE = Vector3.create(0.0001, 0.0001, 0.0001)

export interface PunchMachineHudState {
  difficultyLabel?: string
  /** Live / last-punch challenge, for arcade events rather than a standing chip. */
  challengeSpeed: number
  challengeHitMult: number
  challengeBonus: number
  /**
   * True once this punch already sits inside `roundTotal`. Network commits at
   * impact; solo commits when the count lands. The plate uses this so it can
   * hold the prior total while +N plays in the slot.
   */
  scoreCommitted: boolean
  stanceLabel?: string
  challengeLabel?: string
  rescueLabel?: string
  /** The second line of the rescue panel: what to do, in one sentence. */
  rescueHint?: string
  /** Large tap field, shown only to an eligible local spectator. */
  rescueRingVisible?: boolean
  rescueBallX?: number
  rescueBallY?: number
  rescueWindX?: number
  rescueWindY?: number
  rescueHold01?: number
  rescueShoves?: number
  rescueCalmR?: number
  rescueOutFlash?: boolean
  rescueCanTap?: boolean
  rescuePreparing?: boolean
  rescueSecondsLeft?: number
  rescueTaps?: number
  rescueTapsRequired?: number
  rescueInputPulse?: number
  /** THE PUSH -- see shared/punch-push.ts and the panel in punch-machine-ui.tsx. */
  rescuePushOn?: boolean
  rescuePushAsking?: boolean
  rescuePushJoined?: boolean
  rescuePushFrom?: number
  rescuePushTo?: number
  rescuePushScore?: number
  rescuePushLatches?: number[]
  rescuePushPeople?: number
  rescuePushLevel01?: number
  rescuePushTarget01?: number
  rescuePushBandHalf01?: number
  rescuePushQuality01?: number
  rescuePushAskLeft?: number
  rescuePushers?: Array<{ userId?: string; name: string; gain: number; mine: boolean; quality01?: number }>
  /**
   * Who gets which screen during THE PUSH.
   * ask/play/result = full overlay; watch = a small chip so the world is visible;
   * off = nothing on the HUD (the nametag bars still draw).
   */
  rescuePushHud?: 'off' | 'ask' | 'play' | 'watch' | 'result'
  /** Helpers wearing a nametag bar this frame. Empty outside a live push. */
  rescuePushWorld?: PushSignalMember[]
  /** What THIS player has added so far, predicted locally so it climbs smoothly. */
  rescuePushMine?: number
  /** The window is over and the panel is holding the reconciliation. */
  rescuePushDone?: boolean
  rescuePushSaved?: boolean
  /** 1 = top pusher, 0 = did not push. */
  rescuePushMineRank?: number
  rescuePushMineFinal?: number
  rescueWinnerName?: string
  rescueRescuedName?: string
  rescueRescuedUserId?: string
  rescueHeroUserId?: string
  rescueHeroName?: string
  /**
   * After a last-chance lands, this is the helper banking the rest of the
   * round. The number grows as the rescued player scores — a 10 is the save
   * itself; ten more punches is a different number.
   */
  saveRunVisible?: boolean
  saveRunHelperId?: string
  saveRunHelperName?: string
  saveRunKeptName?: string
  saveRunPoints?: number
  saveRunPeople?: number
  saveRunMine?: boolean
  /** Which save game is running. The panel draws a different shape for each. */
  rescueSkill?: PunchRescueSkill
  /** The sweep, 0..1, identical on every screen in the room. */
  rescueMarker01?: number
  /** Half-width of the gold band, in marker units. 0 hides it. */
  rescueBand01?: number
  /** Is the marker inside the band RIGHT NOW — the whole of "press here". */
  rescueInBand?: boolean
  rescueHitFlash?: boolean
  /** This save is the fumbler's last punch, not a favour. Said louder. */
  rescueLastChance?: boolean
  /** Active-player-only extreme-impact glass treatment, 0..1. */
  screenCrack01?: number
  supportScore?: number
  nextMultiplier?: number
  profileTitle?: string
  selectedProfile?: string
  streakSaved?: boolean
  streakSaveReady?: boolean
  streakSaveProgress?: string
  /** Banked points toward a save, but not enough yet — shown while spectating. */
  streakSaveEarning?: boolean
  myBoostAward?: number
  streakMultiplier?: number
  helpGoal?: string
  reactionExplanation?: string
  visible: boolean
  phase: string
  playerName: string
  instruction: string
  power01: number
  timingMarker01: number
  timingTarget01: number
  timingSweetWidth01: number
  accuracy01: number
  score: number
  result: PunchAttemptBreakdown | null
  fallPrompt: boolean
  fallDistanceM: number
  /** Collapsed to a corner chip so the player can roam and still get back. */
  fallMinimized: boolean
  /** 0..1 sawtooth for pulsing UI — DCL UI has no CSS animation. */
  pulse01: number
  /** Aim UI only shows while actually looking at the machine. */
  facingMachine: boolean
  /** Punches already taken this round. */
  attempt: number
  /** Punches granted this round — grows when a big one lands. */
  attemptsMax: number
  /**
   * The most punches this visit may reach -- the runaway guard alone, or the
   * queue's hard cap once somebody human is waiting. `attemptsMax` reaching it
   * is what turns the marquee into 'LAST PUNCH'.
   */
  attemptsCeiling: number
  /**
   * ‼️A ROUND OF MINE THE QUEUE SUSPENDED, waiting for me to reach the bag
   * again: the rung it kept and the total it banked. Zero means no token. This
   * is the visible half of the fairness rule -- a player handed back to the line
   * has to be able to SEE that their streak went with them.
   */
  /** Running round total, the number that actually scores. */
  roundTotal: number
  /** Reload fill, 0..1. Exactly 1 means loaded — the bar hides itself. */
  reload01: number
  /** When an extra punch was granted, so the UI can shout about it. */
  extraPunchAt: number
  /**
   * THE STREAK, on the HUD. `streakAt` is the moment the last rung paid, so the
   * badge can be a flash rather than a permanent chip; `streak` stays up for the
   * whole run so a player mid-streak can see what they are defending.
   */
  streak: number
  streakBonus: number
  streakName: string
  streakAt: number
  /** Streak points banked across this whole round, for the round-over card. */
  streakTotal: number
  /** Milliseconds left on the round-over card. 0 = no round is finishing. */
  summaryMsLeft: number
  /** Seconds left for the player whose turn it is to step up. */
  turnMsLeft: number
  /**
   * In the SHARED queue. Local opt-in alone is not enough: that is how a
   * ghost phone looked queued while nobody else could see the join.
   */
  queued: boolean
  /** Pressed JOIN; the live list has not confirmed this device yet. */
  joiningQueue: boolean
  /**
   * This device is on a private copy of the game — join never landed, or the
   * live wire is silent while other people are standing in the world.
   */
  ghostLive: boolean
  /** Place in the line, 1-based. 0 while holding the bag or not entered. */
  queuePlace: number
  /** Your place in the ring, 1-based. 0 while you hold a seat or have not entered. */
  ringPlace: number
  /** How many are standing behind the four seats. */
  ringSize: number
  /** Mean length of recent completed rounds, so the ring can print a time. 0 = unknown. */
  roundPaceMs: number
  /** Humans at the bag or in line — the house bot is not a player. */
  playersIn: number
  /** Close enough to enter — the button has somewhere to point. */
  canJoinQueue: boolean
  /** Who holds the bag right now, for everyone watching. */
  activeName: string
  activeUserId: string
  isMyTurn: boolean
  /** True when you are loitering in the strike zone on someone else's turn. */
  mustStepAside: boolean
  /** True when the bag is yours and you are not yet on the strike mark. */
  mustStandOnMark: boolean
  /** Your turn came and went without a punch: you are out until you rejoin. */
  missedTurn: boolean
  /** The punch that ended the run, so the card can say why it ended. */
  lastPunch: number
  /**
   * THE RANKED BOARD, ON THE HUD RATHER THAN ON THE ARC.
   *
   * It used to be three TextShapes painted across the curved screen, and a
   * cylinder is the one surface a list cannot be read on: the letters follow
   * the curve, so the ends of every row turn away from whoever is standing in
   * front of it. Flat, in a panel, behind a button the player opens when they
   * actually want to read it — a list is a reading job, and reading jobs
   * belong on the HUD.
   */
  leaderboard: readonly PunchLeaderboardEntry[]
  /** The persisted board. Empty when no store is configured, or it is down. */
  allTime: readonly PunchLeaderboardEntry[]
  /**
   * Tonight's saviors — spectators who kept a streak alive. A separate category
   * from the punch ranking, because a helper who never punched had no row and
   * no way to know they had done anything.
   */
  saviors: readonly PunchSaviorEntry[]
  /** This client's address, so the SAVES board can mark YOUR row. */
  localUserId: string
  /**
   * This venue's store has ANSWERED — its rows outlive the night, proven.
   * Not "a store is configured": a key in the bundle proves nothing reached it.
   */
  allTimeSaved: boolean
  /** The panel is open. Opened by the player, never by the game. */
  scoreboardOpen: boolean
  arenaSpotlightLabel: string
  /** Which list the open panel is showing: 0 tonight, 1 all time, 2 saves. */
  scoreboardPage: number
  /** Still in the air. The big panel is a chip until both feet are down. */
  fallAirborne: boolean
  /** Show the meditation panel at all: a spectator, in range, with a punch to boost. */
  focusVisible: boolean
  /** This client's own predicted level, 0..PUNCH_FOCUS_CEILING. */
  focusLevel01: number
  /** Where the still point is RIGHT NOW — it drifts — and how wide the band is. */
  focusTarget01: number
  focusBand01: number
  /**
   * THE WEATHER on the same drift clock as the target: >1 is a gust draining
   * faster than usual, <1 a lull that holds. Read by the bar to tint its track,
   * because a force that empties a meter under a perfect rhythm is
   * indistinguishable from a broken control unless the track says so.
   */
  focusGust: number
  /**
   * The precision streak: unbroken time this client's circle has held the ring,
   * and what it is multiplying their share by. Drawn as pips beside the bar,
   * because a multiplier nobody can see is a multiplier nobody plays for.
   */
  focusStreak: number
  focusStreakMs: number
  /** The coordinator's smoothed crowd level — the one that actually pays. */
  focusCrowd01: number
  focusQuality01: number
  /** What the whole crowd would hand over right now, in POINTS. */
  focusBoostPoints: number
  /** The human half of that — what can actually break High Ground. */
  focusHumanBoostPoints: number
  focusMeditators: number
  /** True while this client is still inside the idle window, i.e. Boosting. */
  focusActive: boolean
  /** Close enough to see the round, too far back to join the circle. */
  focusOutOfRange: boolean
  /**
   * The pill is showing, but as a READOUT rather than a control: this client is
   * the one holding the bag. You cannot meditate for yourself, but the crowd is
   * working on your behalf and hiding that from you until the score card was
   * hiding the only part of the round somebody else is playing for you.
   */
  focusReadOnly: boolean
  /** Who the crowd is Boosting. */
  focusForName: string
  /**
   * ‼️THE RESULT CARD'S OWN COPY OF THE PUNCH ON THE MARQUEE.
   *
   * The whole story, not a net: what the puncher earned alone, what the room
   * added, WHO added it and how much each of them gave, and whether the three
   * of those together broke the ceiling. A person who Boosted has to be able to
   * look at this and find their own name with their own number beside it —
   * that requirement is why the crowd is a list everywhere upstream of here.
   */
  focusAwardedBase: number
  /**
   * ‼️THE PUNCH BEFORE ITS OWN KARMA, and the multiplier that was applied.
   *
   * `focusAwardedBase` has always meant "the punch before the CROWD", and it
   * still does — karma is already inside it. These two are what let the card
   * show its work: a player who has been Boosting all night needs to see that
   * the reason their 640 read 896 was the ring they held for somebody else.
   */
  focusAwardedSkill: number
  focusAwardedKarmaMult: number
  /**
   * ‼️THE LEDGER — WHERE THE SCORE CAME FROM AND WHERE IT WENT.
   *
   * Owner, 2026-09-05: *"when we get minus percentages it needs to show in the
   * final calculation where the score went and where it came from."* Every one
   * of these is copied straight off the authoritative attempt, exactly like the
   * fields above it, so the puncher, each booster and a bystander read one
   * story. See `PunchAttemptBreakdown` for what each one means and, for the
   * `missed` trio, why they must never be summed.
   */
  focusAwardedPower01: number
  focusAwardedTiming01: number
  focusAwardedAccuracy01: number
  focusAwardedMissedPower: number
  focusAwardedMissedTiming: number
  focusAwardedMissedAim: number
  focusAwardedKarmaGain: number
  focusAwardedKarmaClipped: number
  focusAwardedStanceLost: number
  focusAwardedKarmaSpent: number
  focusAwardedCrowdTrimmed: number
  /** How much wider the crowd made the window for the punch on the card. */
  focusAwardedAssist01: number
  focusAwardedBoost: number
  focusAwardedBoosts: PunchBoostContribution[]
  focusAwardedScore: number
  /**
   * ‼️TRUE ONLY ONCE THE COUNTER HAS STOPPED CLIMBING — and the breakdown card
   * is not allowed on screen before it.
   *
   * Owner, 2026-09-05: *"the summary that we get to see in the black box on the
   * left, I think it's showing the numbers before they are determined on the
   * screen, so they are a little bit ahead. We need to keep the suspense and let
   * the numbers run without showing them and spoiling it on the left."*
   *
   * Exactly what was happening. Every field above is the FINAL, authoritative
   * attempt and is filled the frame the punch is scored, while `hud.score` is
   * the theatre — `punchRevealShownScore` crawling up from 000 over 2.6 s. So
   * the card printed FINAL 812 in the corner while the big number was still
   * passing 300, and the whole reveal was over before it started. Same law the
   * arc already lives under (`punchRevealLanded`): no surface may name the
   * number before the machine does.
   */
  revealLanded: boolean
  /**
   * Milliseconds into THE CUT, or -1 when there is no cut running — the 1.2 s
   * of silence and darkness a 999 gets and no other score does. See
   * `punchPerfectCutSince`; the plate is the only thing drawn while this is up.
   */
  perfectCutSince: number
  /** Is the plate lit this frame? Pulses four times across the cut. */
  perfectCutLit: boolean
  focusHighGround: boolean
  focusHighGroundEvent: string
  /** Half-width of the OUTER ring — the amber consolation region round the band. */
  focusZone01: number
  /**
   * What THIS client's own level is worth where it currently sits. The crowd
   * number is what pays; this is the one that answers "am I helping?", which is
   * the question a spectator holding the key is actually asking.
   */
  focusSelfQuality01: number
  /** ...and what that is worth in points, so the pill can say it out loud. */
  focusSelfPoints: number
  /**
   * ‼️THE RING, AS THIS CLIENT IS HOLDING IT — the hard target inside the easy
   * one, and the only part of Boosting that is purely this person's skill.
   *
   * `focusSelfKarma01` is how deep inside `PUNCH_FOCUS_KARMA_BAND_01` they are
   * this frame (drawn), `focusSelfKarmaMs` is the run they have kept (banked),
   * and `focusSelfMultiplier` is what those two are currently multiplying their
   * own contribution by. All three are shown because the multiplier alone tells
   * a player what they earned and never how to earn more.
   */
  focusSelfKarma01: number
  focusSelfKarmaMs: number
  focusSelfMultiplier: number
  /** The venue's ring half-width, so the pill draws the ring the coordinator pays. */
  focusKarmaBand01: number
  /**
   * The result card is being held past its phase (see `PUNCH_CARD_HOLD_MS`).
   * While true the `focusAwarded*` fields describe the held punch, which may
   * no longer be the round's live attempt.
   */
  cardHeld: boolean
  /**
   * ‼️THE ISLAND DOES NOT FIT THIS SCENE. Empty while it does. See
   * `checkIslandFits`: a plot too small for the deck renders NOTHING at all,
   * and the player falls through the sky.
   */
  islandFitWarning: string
  /** Server authority only: no host is answering yet. */
  serverWaking: boolean
  /** Whole seconds left on the house wait. Zero once this device hosts. */
  houseWaitLeftSec: number
  /**
   * Who runs THIS device's game, printed on the rail — see
   * `PunchCompetitionNetwork.authorityMode`. Two devices in one world showing
   * two different words here is the whole diagnosis, read off the screens.
   */
  houseMode: 'server' | 'orphan' | 'coordinator'
  /**
   * The layer readout behind the house word — see `punchRoomDiagnostics`.
   * `roomConnected` is the Explorer's own `RealmInfo.isConnectedSceneRoom`
   * (null = the component is not there at all); `roomReady` is whether the
   * SDK Room will transmit; `roomSynced` is `isStateSyncronized()`; `roomFramesIn`
   * is how many room frames have ever arrived; `roomLastFrom` is who sent the last one.
   */
  roomConnected: boolean | null
  roomReady: boolean
  roomSynced: boolean
  roomFramesIn: number
  roomLastFrom: string
  /**
   * WHICH room the Explorer put this scene in (`RealmInfo.room`) and through
   * which adapter. Two devices "connected" to two differently-named rooms are
   * in two different rooms, and the server peer stands in only one of them.
   */
  roomName: string
  roomAdapter: string
  /** HTTPS live wire — same store as the board, independent of the DCL room. */
  httpWire: boolean
  httpFramesIn: number
  httpSeq: number
  httpError: string
  /** How dangerous the next punch is, 0..1. Zero when the tell is switched off. */
  fumbleRisk01: number
  /** What a fumble would cost, 0..1 — the rung the run is standing on. */
  fumbleStake01: number
  fumbleRiskStyle: PunchFumbleRiskStyle
  /** PREPARATION — this player's own: stored Focus 0..100, Momentum, and whether they may earn (queued or up). */
  prepFocus: number
  prepMomentum: boolean
  prepQueued: boolean
  /** The escalation melody in the air, by track id — '' the rest of the time. Printed on the rail so "there is no music" is answerable. */
  musicTrack: string
  /** THIS ROUND, for the card: best punch, punches over 900, longest run. */
  roundBestPunch: number
  roundStrong: number
  roundLongestStreak: number
  /** The round that just ended tops tonight's board / the all-time board. */
  recordTonight: boolean
  recordPersonal: boolean
  recordHourly: boolean
  recordDaily: boolean
  recordAllTime: boolean
  /** The breakdown ladder: rows up so far, and rows in total — written by the HUD, voiced by `playRevealTicks`. */
  revealRowsShown: number
  revealRowsTotal: number
  /** The wallet whose face presents the Focus tutorial; empty for the emblem. */
  coachUserId: string
  /** What the last landed punch spent to reach the streak threshold. */
  focusAwardedFocusUsed: number
  /** The next ball is gold (see `punchGoldenArmed`), and what a 900+ on it pays. */
  goldenArmed: boolean
  goldenPayout: number
  /** THE CIRCLE: your own 0..999 this wind-up, and who is leading it. */
  focusSelfCircle: number
  focusCircleBestName: string
  focusCircleBestScore: number
  /** Who boosted the last landed punch best, off the committed ledger. */
  circleBest: PunchCircleBest | null
  /** Tonight's best boosters by summed circle score, top three. */
  circleBoard: Array<{ name: string; circle: number; best: number }>
  /**
   * THIS CLIENT'S BANKED KARMA and what it will multiply their NEXT punch by.
   * Read off the coordinator's bank, never counted locally — a number that pays
   * points is authoritative or it is decoration.
   */
  karmaBank: number
  karmaMultiplier: number
  /**
   * ‼️HOW MUCH WIDER THE CROWD HAS MADE THE GOLD BAND, 0..1, LIVE.
   *
   * The one thing a Boost does that the puncher feels while they are still
   * swinging. `timingSweetWidth01` above is the width itself, already widened —
   * this is kept beside it so a surface can SAY the crowd did it rather than
   * silently drawing a bigger band nobody can attribute.
   */
  crowdAssist01: number
  /**
   * The circle by NAME, coordinator order. The HUD lists it, the world draws
   * balloons from it, and the arc board prints it — one roster, three surfaces,
   * so they can never name different people.
   */
  focusCircle: FocusSignalMember[]
}

/**
 * The arena screen, if this scene has an island. One island, one arc — held
 * here rather than on the machine so the frame loop can reach it without
 * threading it through every call that only cares about the cabinet.
 */
let arenaScreen: ArenaScreen | null = null
/**
 * ‼️★★★WHAT THE ARC IS DOING, READ ONCE A FRAME — the cabinet's half of the bond.
 *
 * Owner, 2026-09-05: the pods above the score and the meter at the back "are
 * completely disconnected from the screen behind it… every now and again those
 * three need to be in sync, and fairly frequently."
 *
 * They are three separate painters (`updateShowLights` for the marquee, the pods
 * and the rail; `paintMeter` for the cavity column, called from four different
 * score paths) and NONE of them shares a call stack with the other. Passing the
 * cue down would mean threading it through `updateIndicator`, `updateSolo`,
 * `updateFromSnapshot` and `presentShowScore`, and the first one anybody forgot
 * would be a lamp family quietly out of step again — which is the exact failure
 * being repaired here.
 *
 * So it is refreshed ONCE, at the top of `updateShowLights`, and read from there
 * by everything. `updateShowLights` runs early in the per-machine loop and every
 * score path that repaints the meter runs after it, so a frame's lamps are all
 * answering the same cue rather than a mix of this frame's and last frame's.
 */
let lampCue: ArenaLampCue = {
  colour: Color4.fromHexString('#FFD15A'),
  energy01: 0.6,
  beatMs: 220,
  bonded: false,
  reacting: false
}
/** The machine's own voice this frame, 0..1 — see `punchAudioLevel01`. */
let lampVoice = 0
/**
 * How far the machine's voice may lift a BONDED bulb above its own brightness.
 *
 * The arc's equivalent is AUDIO_LIFT (0.34 toward white) and this is deliberately
 * bigger, because the two surfaces are not doing the same job with the sound. The
 * screen is a picture and may only lean; a bulb IS the reaction, and a bulb that
 * pumps by a third on a hit is a bulb nobody notices pumping at all.
 */
const LAMP_VOICE_LIFT = 0.9

/** The roster printed on the arc. Same lifetime and same frame as the screen. */

/**
 * The ALL-TIME board's client, or null when no store is configured.
 *
 * Null is the default and the normal case. Nothing below it is allowed to
 * matter: every read of this is optional-chained, and the arc draws an empty
 * all-time list exactly the way it draws the first night of a new venue.
 */
let boardStore: PunchBoardStore | null = null
/**
 * ‼️THE CONTEST'S RECORD, beside the board rather than inside it.
 *
 * The board answers "who is top ten"; this answers "who played, and who helped
 * them". A competitor ranked eleventh has no board row BY DESIGN -- the read is
 * capped at `leaderboardSize` -- and before this existed that meant their round
 * was never written down anywhere at all. The tables have been live since
 * 20260905160000_punch_contest_log.sql; this is the client that fills them.
 */
let resultsLog: PunchResultsLog | null = null
/**
 * WHAT MY OWN ROUND LOOKED LIKE AT ITS BEST, watched from this client.
 *
 * `roundStreak` is the LIVE rung and drops to zero on a miss, so a round that
 * reached five and ended on a fumble would be logged as a round that never
 * streaked at all. Keyed by machine and round stamp so switching machines
 * resets it without anybody having to remember to.
 */
let myRoundPeak = { key: '', streak: 0 }
/** The support row this client last sent, so an unchanged one is not re-sent. */
let mySupportSent = { key: '', points: -1, saves: -1, at: 0 }
const profileBoardStores = new Map<string, PunchBoardStore>()

/**
 * THE RING IS HEAVY — unless the author of this scene said otherwise.
 *
 * An arena that moves exactly like open ground never reads as somewhere you
 * arrived; you sprint through it the way you sprint through everything else. So
 * the island asks for a slightly heavier body by default.
 *
 * `scene/src/avatar-controls.ts` does the applying and explains why everything
 * here is a multiplier rather than a speed. What this constant adds is only the
 * DEFAULT: a scene whose author set avatar controls in the Builder gets theirs
 * instead, because an explicit choice always outranks a venue's house opinion.
 */
const ARENA_LOCOMOTION: AvatarControlsConfig = {
  enabled: true,
  // Walking is how people line up at the machine and read the board. Slowing
  // that makes the venue feel broken rather than heavy.
  walk: 1,
  jog: 0.86,
  run: 0.86,
  jump: 1
}

function holdArenaLocomotion(): void {
  const authored = getRuntimeContext()?.avatarControls
  applyAvatarControls(
    authored && avatarControlsActive(authored) ? authored : ARENA_LOCOMOTION
  )
}

const hud: PunchMachineHudState = {
  visible: false,
  phase: 'waiting',
  playerName: '',
  instruction: '',
  power01: 0,
  timingMarker01: 0,
  timingTarget01: PUNCH_TIMING_TARGET_01,
  timingSweetWidth01: PUNCH_TIMING_SWEET_WIDTH_01,
  accuracy01: 0,
  score: 0,
  challengeSpeed: 1,
  challengeHitMult: 1,
  challengeBonus: 0,
  scoreCommitted: false,
  result: null,
  fallPrompt: false,
  fallDistanceM: 0,
  fallMinimized: false,
  pulse01: 0,
  facingMachine: false,
  attempt: 0,
  attemptsMax: PUNCH_ROUND_ATTEMPTS,
  attemptsCeiling: PUNCH_ROUND_ATTEMPTS_MAX,
  roundTotal: 0,
  reload01: 1,
  extraPunchAt: 0,
  streak: 0,
  streakBonus: 0,
  streakName: '',
  streakAt: 0,
  streakTotal: 0,
  summaryMsLeft: 0,
  turnMsLeft: 0,
  queued: false,
  joiningQueue: false,
  ghostLive: false,
  queuePlace: 0,
  ringPlace: 0,
  ringSize: 0,
  roundPaceMs: 0,
  playersIn: 0,
  canJoinQueue: false,
  activeName: '',
  activeUserId: '',
  isMyTurn: false,
  mustStepAside: false,
  mustStandOnMark: false,
  missedTurn: false,
  lastPunch: 0,
  leaderboard: [],
  allTime: [],
  saviors: [],
  localUserId: '',
  allTimeSaved: false,
  scoreboardOpen: false,
  arenaSpotlightLabel: '',
  scoreboardPage: 0,
  fallAirborne: true,
  focusVisible: false,
  focusLevel01: 0,
  focusTarget01: PUNCH_FOCUS_TARGET_01,
  focusGust: 1,
  focusStreak: 1,
  focusStreakMs: 0,
  focusBand01: punchFocusBandHalfWidth(1),
  focusCrowd01: 0,
  focusQuality01: 0,
  focusBoostPoints: 0,
  focusHumanBoostPoints: 0,
  focusMeditators: 0,
  focusActive: false,
  focusOutOfRange: false,
  focusReadOnly: false,
  focusForName: '',
  focusAwardedBase: 0,
  focusAwardedSkill: 0,
  focusAwardedKarmaMult: 1,
  focusAwardedPower01: 0,
  focusAwardedTiming01: 0,
  focusAwardedAccuracy01: 0,
  focusAwardedMissedPower: 0,
  focusAwardedMissedTiming: 0,
  focusAwardedMissedAim: 0,
  focusAwardedKarmaGain: 0,
  focusAwardedKarmaClipped: 0,
  focusAwardedStanceLost: 0,
  focusAwardedKarmaSpent: 0,
  focusAwardedCrowdTrimmed: 0,
  focusAwardedAssist01: 0,
  focusAwardedBoost: 0,
  focusAwardedBoosts: [],
  focusAwardedScore: 0,
  revealLanded: false,
  perfectCutSince: -1,
  perfectCutLit: false,
  focusHighGround: false,
  focusHighGroundEvent: '',
  focusZone01: punchFocusZoneHalfWidth(1),
  focusSelfQuality01: 0,
  focusSelfPoints: 0,
  focusSelfKarma01: 0,
  focusSelfKarmaMs: 0,
  focusSelfMultiplier: 1,
  focusKarmaBand01: punchKarmaBand01(undefined),
  cardHeld: false,
  islandFitWarning: '',
  serverWaking: false,
  houseWaitLeftSec: 0,
  houseMode: 'coordinator',
  roomConnected: null,
  roomReady: false,
  roomSynced: false,
  roomFramesIn: 0,
  roomLastFrom: '',
  roomName: '',
  roomAdapter: '',
  httpWire: false,
  httpFramesIn: 0,
  httpSeq: 0,
  httpError: '',
  fumbleRisk01: 0,
  fumbleStake01: 0,
  fumbleRiskStyle: 'physical',
  prepFocus: 0,
  prepMomentum: false,
  prepQueued: false,
  musicTrack: '',
  roundBestPunch: 0,
  roundStrong: 0,
  roundLongestStreak: 0,
  recordTonight: false,
  recordPersonal: false,
  recordHourly: false,
  recordDaily: false,
  recordAllTime: false,
  revealRowsShown: 0,
  revealRowsTotal: 0,
  coachUserId: '',
  focusAwardedFocusUsed: 0,
  goldenArmed: false,
  goldenPayout: 1,
  focusSelfCircle: 0,
  focusCircleBestName: '',
  focusCircleBestScore: 0,
  circleBest: null,
  circleBoard: [],
  karmaBank: 0,
  karmaMultiplier: 1,
  crowdAssist01: 0,
  focusCircle: []
}

export function punchMachineHud(): PunchMachineHudState {
  return hud
}

/**
 * Ask to play. The queue is opt-in: arriving on the island makes you a
 * spectator, and this is the one step that makes you a competitor.
 */
let selectedPunchProfile: PunchProfileId = 'streak-rush'
const presetProfiles = new Map(PUNCH_PROFILE_IDS.map(id => [id, punchProfile(id)]))
export function cyclePunchProfile(): void {
  selectedPunchProfile = PUNCH_PROFILE_IDS[(PUNCH_PROFILE_IDS.indexOf(selectedPunchProfile) + 1) % PUNCH_PROFILE_IDS.length]!
}
function activeProfile(machine: PunchMachineRuntime): PunchGameProfile {
  return machine.config.gameProfile ?? machine.authoredProfile ?? presetProfiles.get('streak-rush')!
}
function effectPlan(machine: PunchMachineRuntime): PunchEffectPlan {
  return machine.effectPlan ??= planPunchEffects(activeProfile(machine), { score: 0, streak: 0, serial: 1, seed: 1 })
}
export function joinPunchQueue(): void {
  const machine = machineForPlayer()
  if (!machine) return
  machine.queueOptIn = true
  // The deliberate ask — the one join that buys a missed turn back.
  machine.missedTurn = false
  machine.missedTurnAt = 0
  machine.queueIntent = 'player'
  machine.queueSyncAt = 0
  if (machine.joinAskedAt === 0) machine.joinAskedAt = Date.now()
}

/**
 * Reload this World from Explorer. The scene cannot repair a dead phone
 * session, a second client on the same wallet, or a publish that landed while
 * this Explorer was backgrounded — those need a fresh join.
 */
export function rejoinPunchWorld(): void {
  void (async () => {
    try {
      const realm = await getRealm({})
      const info = realm.realmInfo
      const name = (info?.realmName ?? '').trim()
      const base = (info?.baseUrl ?? '').replace(/\/contents\/?$/i, '').replace(/\/$/, '')
      const target = name.includes('://')
        ? name
        : base && name
          ? `${base}/world/${name}`
          : name
            ? `https://worlds-content-server.decentraland.org/world/${name}`
            : ''
      if (!target) {
        console.error('[punch] rejoin: Explorer did not name this realm')
        return
      }
      await changeRealm({ realm: target })
    } catch (error) {
      console.error('[punch] rejoin failed', error)
    }
  })()
}

/**
 * Step out again. Pressed while you hold the bag it ENDS the turn there and
 * then — the coordinator treats a leave from the active player as a finish, and
 * the queue moves on. That is the honest reading of the button.
 */
export function leavePunchQueue(): void {
  const machine = machineForPlayer()
  if (!machine) return
  machine.queueOptIn = false
  // The button is a decision, and the coordinator clears stored Focus on a
  // decision. Walking out of range also leaves, with 'auto', and keeps it.
  machine.queueIntent = 'player'
  machine.queueSyncAt = 0
}

/**
 * Open or close the ranked board.
 *
 * A TOGGLE, and the same button both ways: the panel covers the middle of the
 * screen, so the control that opened it has to be the control that clears it —
 * a player who cannot find the way out of a panel is a player who has been
 * taken out of the game by the scoreboard.
 */
export function togglePunchScoreboard(): void {
  hud.scoreboardOpen = !hud.scoreboardOpen
  // Always reopens on TONIGHT. Which page you last read is not worth
  // remembering, and a panel that opens on a different tab each time reads as
  // the button doing something different each time.
  if (hud.scoreboardOpen) hud.scoreboardPage = 0
}

export function closePunchScoreboard(): void {
  hud.scoreboardOpen = false
}

/** Switch tabs inside the open panel. */
export function setPunchScoreboardPage(page: number): void {
  hud.scoreboardPage = page === 1 ? 1 : page === 2 ? 2 : 0
}

/** Shrink the fall panel to a corner chip; the way back is never taken away. */
export function minimizePunchFallPanel(): void {
  hud.fallMinimized = true
}

export function restorePunchFallPanel(): void {
  hud.fallMinimized = false
}

export function isPunchMachineActive(): boolean {
  return hud.visible || hud.fallPrompt
}

export function returnToPunchIsland(): void {
  const machine = fallMachine
  const root = machine?.root ?? islandHost?.root
  if (!root) return
  const center = getWorldPosition(engine, root)
  hud.fallPrompt = false
  hud.fallDistanceM = 0
  // KEEP fallMachine: the teleport can be declined, and dropping the reference
  // here is what made the prompt unrecoverable — there was nothing left to
  // return to. updateFallPrompt clears it once the player is actually up.
  fallReturnUntil = Date.now() + FALL_RETURN_GRACE_MS
  fallReturnFailed = false
  if (machine) setPunchCamera(machine, 'none')
  // Instant, and a metre ABOVE the deck: the old 0.45 s glide approached from
  // below, clipped the deck collider edge-on and shed the player straight back
  // off — the "float back up and immediately fall down again".
  void flyPlayerToDeck(center)
}

/**
 * The teleport itself, behind an async wrapper.
 *
 * `~system` bindings are RPC proxies, not native Promises: chaining `.then()`
 * onto one threw "is not a function" in the live Explorer and took a whole
 * plugin down with it. `await` inside async accepts a plain value or a thenable,
 * so the way home has to be awaited — never chained.
 *
 * Resolving proves the call was ACCEPTED, not that the player moved;
 * updateFallPrompt confirms by reading the player's actual height.
 */
async function flyPlayerToDeck(center: { x: number; y: number; z: number }): Promise<void> {
  try {
    await movePlayerTo({
      newRelativePosition: {
        x: center.x + PUNCH_CABINET_SPAWN_X,
        y: center.y + 1.2,
        z: center.z + PUNCH_CABINET_SPAWN_Z
      },
      cameraTarget: punchCabinetSpawnLook(center.x, center.y, center.z)
    })
  } catch {
    fallReturnFailed = true
    fallReturnUntil = 0
  }
}

/** Step the loiterer off the strike spot — awaited, for the same reason. */
async function nudgePlayerOffStrikeSpot(center: {
  x: number
  y: number
  z: number
}): Promise<void> {
  try {
    const at = punchStrikeEvict(center.x, center.y, center.z)
    await movePlayerTo({
      newRelativePosition: at,
      cameraTarget: punchStrikeLook(center.x, center.y, center.z)
    })
  } catch {
    // A declined nudge is not worth a log line; the ask retries on the next beat.
  }
}

/**
 * THE INVITATION — put the player whose turn it is ON the mark, facing the bag.
 *
 * Owner, 2026-09-11: you can hit from anywhere and take major deductions, and
 * there was no system invite onto the spot. The floor ring already said where;
 * this is the move that actually puts you there, so the next person is not
 * guessing a 20% stance tax from three metres back.
 */
async function seatPlayerOnStrikeSpot(center: {
  x: number
  y: number
  z: number
}): Promise<void> {
  try {
    await movePlayerTo({
      newRelativePosition: punchStrikeStand(center.x, center.y, center.z),
      cameraTarget: punchStrikeLook(center.x, center.y, center.z)
    })
  } catch {
    // Same as the fall return: declined during hitch. The window retries.
  }
}

/** True when the player is inside this scene's own parcels (not a neighbour's). */
function playerInsideScene(): boolean {
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (!player) return false
  const layout = getRuntimeContext()?.scene
  if (!layout) return true
  return (
    player.position.x >= 0 &&
    player.position.z >= 0 &&
    player.position.x <= layout.cols * 16 &&
    player.position.z <= layout.rows * 16
  )
}

/**
 * WHO IS CLOSE ENOUGH FOR THE SHOW.
 *
 * Two different questions, and conflating them is what made the sky quake feel
 * like an assault. This one is about REACH: a punch is a spectacle with a
 * radius, and someone three hundred metres away doing something else is not in
 * it. "If I'm away from the machine that means I'm not playing, that means
 * nothing should reach me."
 *
 * Standing on the deck watching IS in it — the world motion, sound, lights and
 * the sky jolt are the show, and a spectator came to see them. The separate
 * question of what may touch a spectator's BODY is answered by punchIsMine.
 */
/** Am I the one holding the bag? The only body a punch is allowed to move. */
function punchIsMine(machine: PunchMachineRuntime): boolean {
  return machine.network?.snapshot().active?.userId === machine.localUserId
}

function punchSpectacleReachesMe(machine: PunchMachineRuntime): boolean {
  if (punchIsMine(machine)) return true
  if (machine.queueOptIn) return true
  return (
    playerNearMachine(machine, PUNCH_FOCUS_RANGE_M) ||
    playerInZone(machine.config.audienceZoneId) ||
    playerInZone(machine.config.queueZoneId) ||
    playerInZone(machine.config.strikeZoneId)
  )
}

function playerNearMachine(machine: PunchMachineRuntime, radius = 10): boolean {
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (!player) return false
  const center = getWorldPosition(engine, machine.root)
  return (
    Math.abs(player.position.y - center.y) < 3 &&
    Math.hypot(player.position.x - center.x, player.position.z - center.z) <= radius
  )
}

function currentPunchStance(machine: PunchMachineRuntime) {
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (!player) return punchStance(10, 0, false)
  const center = getWorldPosition(engine, machine.root)
  const bag = getWorldPosition(engine, machine.hitbox)
  const forward = Vector3.rotate(Vector3.Forward(), player.rotation)
  const dx = bag.x - player.position.x, dz = bag.z - player.position.z
  const length = Math.max(0.001, Math.hypot(dx, dz))
  const offset = Math.hypot(player.position.x - center.x, player.position.z - (center.z + PUNCH_STRIKE_Z))
  return punchStance(offset, (forward.x * dx + forward.z * dz) / length, playerAtStrikeSpot(machine))
}

function invisibleBox(parent: Entity, position: Vector3, scale: Vector3, rotation = Quaternion.Identity()): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { parent, position, scale, rotation })
  MeshCollider.setBox(entity)
  return entity
}

/** A disc of standable ground — the plaza is round, so a box never fitted it. */
function invisibleCylinder(parent: Entity, position: Vector3, radius: number, height: number): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { parent, position, scale: Vector3.create(radius * 2, height, radius * 2) })
  MeshCollider.setCylinder(entity, 0.5, 0.5)
  return entity
}

/**
 * Clickable but not solid. The punch bag needs to receive pointer events; making
 * it physical too meant an avatar's arms fouled it and it could be stood on.
 */
function pointerBox(parent: Entity, position: Vector3, scale: Vector3): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { parent, position, scale })
  MeshCollider.setBox(entity, ColliderLayer.CL_POINTER)
  return entity
}

function primitive(
  parent: Entity,
  position: Vector3,
  scale: Vector3,
  color: Color4,
  shape: 'box' | 'sphere' | 'cylinder',
  rotation = Quaternion.Identity(),
  emissive = 0
): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { parent, position, scale, rotation })
  if (shape === 'box') MeshRenderer.setBox(entity)
  else if (shape === 'sphere') MeshRenderer.setSphere(entity)
  else MeshRenderer.setCylinder(entity, 0.5, 0.5)
  Material.setPbrMaterial(entity, {
    albedoColor: color,
    emissiveColor: emissive > 0 ? Color3.create(color.r, color.g, color.b) : Color3.Black(),
    emissiveIntensity: emissive,
    roughness: shape === 'cylinder' ? 0.82 : 0.9,
    metallic: 0.02
  })
  return entity
}

/**
 * THE HOUSE RIG, HUNG. See `PUNCH_ISLAND_LAMPS` for what each lamp is for and
 * why there are five of them and not fifteen.
 *
 * Two things this function owns, and neither belongs in the layout table:
 *
 * AIMING. A lamp declares the POINT it is pointed at, not a rotation, because a
 * rotation is unreadable and unverifiable in a table of numbers. The cabinet's
 * front is +Z, so `yaw = atan2(dx, dz)` measures from +Z, and `pitch` is the
 * angle below the horizon; applied in that order they turn the entity's forward
 * (+Z) onto the aim vector. `Quaternion.fromEulerDegrees(90, 0, 0)` pointing
 * straight down is the same convention the blackout spot in admin-fx uses.
 *
 * WHERE IT HANGS. Parented to the machine root, so the rig rides the island (or
 * the room) wherever it is placed and no world coordinate is ever guessed.
 */
function spawnIslandLights(parent: Entity): void {
  for (const lamp of PUNCH_ISLAND_LAMPS) {
    const entity = engine.addEntity()
    const aim = lamp.aim
    let rotation = Quaternion.Identity()
    if (aim) {
      const dx = aim.x - lamp.x
      const dy = aim.y - lamp.y
      const dz = aim.z - lamp.z
      const horizontal = Math.sqrt(dx * dx + dz * dz)
      const yaw = (Math.atan2(dx, dz) * 180) / Math.PI
      const pitch = (Math.atan2(-dy, horizontal) * 180) / Math.PI
      rotation = Quaternion.fromEulerDegrees(pitch, yaw, 0)
    }
    Transform.create(entity, {
      parent,
      position: Vector3.create(lamp.x, lamp.y, lamp.z),
      rotation
    })
    LightSource.create(entity, {
      active: true,
      color: Color3.create(lamp.color.r, lamp.color.g, lamp.color.b),
      intensity: lamp.candela,
      range: lamp.rangeM,
      // ‼️NEVER TRUE ON ANY OF THESE. A shadow map per lamp is the expensive
      // half of a light, five of them would cost more than the whole cabinet,
      // and the owner's complaint is about shadows there being too MANY of.
      shadow: false,
      type: aim
        ? LightSource.Type.Spot({
            innerAngle: lamp.innerDeg ?? 25,
            outerAngle: lamp.outerDeg ?? 55
          })
        : LightSource.Type.Point({})
    })
  }
}


/**
 * ‼️THE HOUR THIS SCENE STANDS IN — A DEFAULT, AND ONLY EVER A DEFAULT.
 *
 * The lamps above cannot remove a shadow: the only thing casting one here is
 * the Explorer's directional sun, and at a low hour it rakes hard black bars
 * across an island 80 m up with nothing near it to break them (owner,
 * 2026-09-08: "some weird shadows if you choose the wrong time of day").
 *
 * A scene cannot switch that sun off, but `SkyboxTime` says what hour it is
 * standing in. The Championship uses midnight so its authored neon, flashes
 * and lightning read against a dark sky.
 *
 * ‼️A DELIBERATE CHOICE OUTRANKS THIS. If the venue published a night, club or
 * sunset atmosphere, or an admin has already pinned the sky by hand, that lock
 * is somebody's decision and this must not overwrite it — which is why the
 * component is only written when there is NOTHING there. `applyDayNight` in
 * effects/admin-fx owns the lock after that, and it restores the published time
 * on reset, so this runs once at spawn and never fights it.
 */
function lockPunchSky(): void {
  if (SkyboxTime.getOrNull(engine.RootEntity)) return
  SkyboxTime.create(engine.RootEntity, { fixedTime: PUNCH_SKY_FIXED_TIME_S })
}

/**
 * ‼️A PLOT TOO SMALL FOR THE ISLAND RENDERS NOTHING AT ALL — AND SAYS SO.
 *
 * Decentraland caps a scene at `log2(parcels + 1) × 20` metres and stops
 * applying it past that line: geometry above the roof is out of bounds, and the
 * colliders under a player up there stop existing. An island deck at 80 m in a
 * 3×3 scene (roof 66 m) is therefore not a SHORT island — it is no island, and
 * the player spawns in the sky and falls.
 *
 * That happened on 2026-09-07: the championship was published at 3×3 instead of
 * its 7×7, and the owner's report was "there is no island, everything else is
 * happening, you always fall down from the sky". Nothing said a word — the
 * formula was known (`punchMaxIslandHeightM`), pinned by a test at 7×7, and
 * read by NOBODY at runtime. This is that reader: one loud log line and one
 * line on screen, because a silent nothing costs an evening to diagnose.
 */
function fitIslandToScene(
  config: PunchMachineAppConfig,
  cols: number,
  rows: number
): PunchMachineAppConfig {
  hud.islandFitWarning = ''
  if (!config.skyIslandEnabled) return config
  const parcels = Math.max(0, Math.floor(cols)) * Math.max(0, Math.floor(rows))
  if (parcels <= 0) return config
  const maxDeck = punchMaxIslandHeightM(parcels)
  if (config.islandHeightM <= maxDeck) return config
  // ‼️LOWERED, NOT REFUSED. Everything that reads the deck height — the fall
  // prompt, the clouds, the vent ceiling, the tornado — takes it from this one
  // field, so correcting it here corrects the whole island at once and it
  // lands INSIDE the scene at any plot size. The alternative, which is what
  // shipped for a day, is a warning beside an empty sky.
  const deck = Math.max(PUNCH_ISLAND_MIN_DECK_M, Math.floor(maxDeck))
  hud.islandFitWarning = `ISLAND LOWERED TO ${deck} m · A ${cols}×${rows} PLOT CANNOT CARRY ${Math.round(config.islandHeightM)} m`
  console.error(
    `[punch] the sky island was ABOVE this scene and has been lowered: the saved deck is ${config.islandHeightM} m, ` +
      `but a ${cols}x${rows} plot (${parcels} parcels) has a ${punchSceneCeilingM(parcels).toFixed(1)} m roof and can carry ` +
      `${maxDeck.toFixed(1)} m once the clouds and the vent above the deck are counted. Nothing above the roof is drawn ` +
      `and its colliders do not exist, so the island would have been invisible and players would fall through it. ` +
      `Deck set to ${deck} m for this session — publish the scene at ${PUNCH_ISLAND_PLOT} to fly it at its authored height.`
  )
  return { ...config, islandHeightM: deck }
}

function syncScrapKoDeck(root: Entity): void {
  const center = getWorldPosition(engine, root)
  setScrapKoDeck({
    centerX: center.x,
    centerZ: center.z,
    radiusM: PUNCH_RAIL_RADIUS,
    deckY: center.y,
  })
}

function spawnSkyIsland(parent: Entity, config: PunchMachineAppConfig): void {
  const soundsEnabled = config.soundsEnabled
  // The island itself is a modelled asset. Collision comes from the invisible
  // boxes below, so the mesh is render-only — a GLB collider disc would fight the
  // boxes and change where the player actually stands.
  const island = engine.addEntity()
  Transform.create(island, { parent, position: Vector3.Zero(), scale: Vector3.One() })
  GltfContainer.create(island, {
    src: ISLAND_MODEL,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })
  /**
   * ‼️THE ISLAND CASTS NO SHADOW, AND THAT IS THE "WEIRD SHADOWS" FIX.
   *
   * Owner, 2026-09-08: *"there are some weird shadows if you choose the wrong
   * time of day."* Nothing we hang casts one — every lamp in the house rig is
   * `shadow: false` — so what is drawing them is the Explorer's directional sun
   * against the island's own rim and rocks. At a low hour (a venue published as
   * `sunset`, say) that rakes long hard bars right across the deck the player
   * is standing and punching on, and the deck is the one surface in this scene
   * that must stay readable.
   *
   * An island floating 80 m up in an empty sky has nothing beneath it for its
   * shadow to fall on, so the ONLY thing that shadow ever lands on is the
   * island itself. Switching it off loses nothing and removes the rake at every
   * hour, including the ones `lockPunchSky` does not get to choose.
   *
   * The CABINET keeps its shadow — that one is a short pool under the machine
   * and it is what stops it reading as floating.
   *
   * An empty `path` is the documented "all nodes" form of the modifier.
   */
  GltfNodeModifiers.createOrReplace(island, {
    modifiers: [{ path: '', castShadows: false }]
  })
  // Kept so the `world-tilt` card can roll it. Safe precisely BECAUSE of the
  // three lines above: this mesh carries no collider at all, so rotating it
  // moves the picture of the island and nothing a player can stand on.
  islandVisual = island

  islandHost = { root: parent, config }
  syncScrapKoDeck(parent)

  // Stepping clouds down from the island edge: a way back up that works even if
  // the prompt is dismissed, the cursor is locked, or a teleport is refused.
  // Each bobs on a Tween so an avatar standing on it is carried along; model and
  // collider hang off the tweened root so they never separate. Seat clouds bob
  // too — a little, and out of phase — but they never grow an updraught.
  punchJumpCloudsFor(config.cloudLayout).forEach((step, index) => {
    const seat = isPunchSeatCloud(step)
    const bobM = seat ? CLOUD_SEAT_BOB_M : CLOUD_BOB_M
    const cloudRoot = engine.addEntity()
    Transform.create(cloudRoot, {
      parent,
      position: Vector3.create(step.x, step.y, step.z),
      scale: Vector3.One()
    })
    Tween.create(cloudRoot, {
      mode: Tween.Mode.Move({
        start: Vector3.create(step.x, step.y - bobM, step.z),
        end: Vector3.create(step.x, step.y + bobM, step.z)
      }),
      duration: seat ? CLOUD_BOB_MS + (index % 7) * 370 : CLOUD_BOB_MS,
      easingFunction: EasingFunction.EF_EASESINE
    })
    TweenSequence.create(cloudRoot, { sequence: [], loop: TweenLoop.TL_YOYO })

    const visual = engine.addEntity()
    Transform.create(visual, { parent: cloudRoot, position: Vector3.Zero(), scale: Vector3.One() })
    GltfContainer.create(visual, {
      src: step.model,
      visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
      invisibleMeshesCollisionMask: ColliderLayer.CL_NONE
    })
    // The model's top face is its own origin, so the stand-on box sits just under it.
    const radius = step.radius
    const collider = invisibleBox(
      cloudRoot,
      Vector3.create(0, -0.15, 0),
      Vector3.create(radius * 2, 0.3, radius * 2)
    )
    const audio = engine.addEntity()
    Transform.create(audio, { parent: cloudRoot, position: Vector3.Zero() })
    jumpClouds.push({
      root: cloudRoot,
      visual,
      island: parent,
      quaking: false,
      collider,
      audio,
      vent: seat ? null : spawnCloudVent(cloudRoot, radius),
      inColumn: false,
      venting: false,
      ventUntil: 0,
      ventReadyAt: 0,
      ventStepAt: 0,
      radius,
      soundsEnabled,
      kind: seat ? 'seat' : 'jump',
      wasOn: false,
      animKind: 'none',
      animAt: 0,
      bounce01: 0
    })
  })
  if (config.bigScreenEnabled) {
    // Dance floor: the punch wash is the game, and there is no game. Play the
    // placeholder (or whatever URL the recipe stored) on the same GLB.
    if (config.cabinetEnabled === false && config.bigScreenVideoUrl) {
      attachCloudScreenVideo(parent, config.bigScreenVideoUrl, config.bigScreenVolume)
    } else {
      arenaScreen = createArenaScreen(parent)
    }
  }
  // The focus board that used to be built here is gone — it named each
  // participant's side, which the secrecy rule forbids, and its backing plate
  // covered the challenger's portrait. The live count is a HUD chip now.
  // Built even with no arc to show it on. The store is where a venue's history
  // lives, and a future cabinet, HUD or dashboard reads the same rows.
  boardStore = createPunchBoardStore(config.boardStore, config.leaderboardSize)
  // Same credentials, same venue, same cowardice -- a second set of tables in
  // the project the board already points at.
  resultsLog = createPunchResultsLog(config.boardStore, config.leaderboardSize)

  // One disc, inset well inside the modelled rope. The old square-plus-tabs
  // reached 6.95 m on the axes and 7.92 m at the corners — standable ground
  // OUTSIDE the barrier, on a plaza that only extends to about 6.9.
  invisibleCylinder(parent, Vector3.create(0, -0.16, 0), DECK_RADIUS, 0.32)

  const postCount = PUNCH_RAIL_SEGMENTS
  const radius = RAIL_RADIUS
  for (let index = 0; index < postCount; index += 1) {
    const angle = (index / postCount) * Math.PI * 2
    const next = ((index + 1) / postCount) * Math.PI * 2
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    // No posts or rope drawn here: cloud-plaza.glb models its own fence
    // (Combined_cream / _cyan / _red). Drawing a second one put two rails round
    // the island. The invisible barrier below is still ours — it is what stops a
    // player walking off the edge, and the model carries no collision.
    const nx = Math.cos(next) * radius
    const nz = Math.sin(next) * radius
    const dx = nx - x
    const dz = nz - z
    const length = Math.sqrt(dx * dx + dz * dz)
    // Waist height. At 1.35 m centred on 0.72 it spanned 0.045..1.395, so an
    // avatar's hands and face caught on it while walking the rim.
    invisibleBox(
      parent,
      Vector3.create((x + nx) / 2, RAIL_HEIGHT / 2, (z + nz) / 2),
      Vector3.create(length, RAIL_HEIGHT, 0.24),
      Quaternion.fromEulerDegrees(0, (-Math.atan2(dz, dx) * 180) / Math.PI, 0)
    )
  }
}

function textDisplay(
  parent: Entity,
  position: Vector3,
  value: string,
  color: Color4,
  fontSize: number,
  width: number,
  height: number
): Entity {
  const entity = engine.addEntity()
  // The display faces the visitor (+Z). Identity made every generated label read backwards.
  Transform.create(entity, { parent, position, rotation: Quaternion.fromEulerDegrees(0, 180, 0), scale: Vector3.One() })
  // Outlined: the one text in the game that CAN be, so the score on the glass
  // reads like a machine's display and not a caption.
  TextShape.create(entity, { text: value, textColor: color, fontSize, width, height, outlineWidth: 0.12, outlineColor: Color4.create(0.02, 0.01, 0.05, 1) })
  return entity
}

/**
 * The multi-stage score meter: eight segments climbing the cabinet's inner
 * cavity, lighting bottom-to-top with the score — cyan, gold, then red at the
 * top. Replaces the single indicator cube that floated beside the machine.
 */
const METER_SEGMENTS = 8
/**
 * The marquee's three-light side pods, as code: the modelled lights are baked
 * into the GLB, so these glows sit just proud of them and do the animating.
 * Cabinet-local; nudge the constants if they drift against the art.
 */
// Read straight from machine-body.glb accessor bounds (LeftLights_Bar_1..3 /
// RightLights_Bar_1..3): centres x ±0.715, y 2.390/2.525/2.660, z −1.948 with
// the bar front face at −1.957 — the glows sit 0.01 proud of that face.
const POD_X = 0.715
const POD_Z = -1.968
const POD_YS = [2.39, 2.525, 2.66] as const
function createPodLights(cabinet: Entity): Entity[] {
  const out: Entity[] = []
  for (const side of [-1, 1]) {
    POD_YS.forEach((y) => {
      const light = engine.addEntity()
      Transform.create(light, {
        parent: cabinet,
        position: Vector3.create(POD_X * side, y, POD_Z),
        scale: Vector3.create(0.125, 0.08, 0.012)
      })
      MeshRenderer.setBox(light)
      Material.setPbrMaterial(light, {
        albedoColor: CYAN,
        emissiveColor: INDICATOR_GLOW,
        emissiveIntensity: 1.5,
        roughness: 0.3
      })
      out.push(light)
    })
  }
  return out
}

function createMeter(cabinet: Entity): Entity[] {
  const segments: Entity[] = []
  for (let i = 0; i < METER_SEGMENTS; i += 1) {
    const seg = engine.addEntity()
    Transform.create(seg, {
      parent: cabinet,
      position: Vector3.create(0, 0.78 + i * 0.17, -0.3),
      scale: Vector3.create(0.52 - i * 0.02, 0.11, 0.05)
    })
    MeshRenderer.setBox(seg)
    Material.setPbrMaterial(seg, {
      albedoColor: Color4.create(0.08, 0.1, 0.12, 1),
      emissiveColor: Color3.create(0, 0, 0),
      emissiveIntensity: 0,
      roughness: 0.5,
      metallic: 0.1
    })
    segments.push(seg)
  }
  return segments
}

function paintMeter(machine: PunchMachineRuntime, value01: number): void {
  const lit = Math.round(Math.max(0, Math.min(1, value01)) * METER_SEGMENTS)
  // ★THE BOND CHANGES THE HUE, NEVER THE HEIGHT. What this column says is HOW
  // FAR UP the score has got, and it says it with the NUMBER OF LIT SEGMENTS —
  // so handing the arc the colour costs the reading nothing, while a bond that
  // touched `lit` would be the screen overwriting the one fact the meter exists
  // to report. Unbonded it keeps its own heat ramp, which is what makes the
  // locked cycles read as a deliberate move rather than as the default.
  const bond = lampCue.bonded ? lampCue.colour : null
  const gain = lampCue.bonded ? 1 + lampVoice * LAMP_VOICE_LIFT : 1
  machine.meter.forEach((seg, i) => {
    const on = i < lit
    // Bright yellow into green into RED at the top — the climb should feel
    // like the machine heating up, not a calm dashboard.
    const color = bond
      ? Color3.create(bond.r, bond.g, bond.b)
      : i >= 6 ? Color3.create(1, 0.12, 0.06) : i >= 3 ? Color3.create(0.25, 1, 0.3) : Color3.create(1, 0.9, 0.1)
    Material.setPbrMaterial(seg, {
      albedoColor: on ? Color4.create(color.r, color.g, color.b, 1) : Color4.create(0.08, 0.1, 0.12, 1),
      emissiveColor: on ? color : Color3.create(0, 0, 0),
      emissiveIntensity: on ? 4.5 * gain : 0,
      roughness: 0.5,
      metallic: 0.1
    })
  })
}

/** Emissive pucks on the rail posts — they cheer along with the machine. */
function createRailGlow(parent: Entity): Entity[] {
  const out: Entity[] = []
  for (let i = 0; i < PUNCH_RAIL_SEGMENTS; i += 1) {
    const angle = (i / PUNCH_RAIL_SEGMENTS) * Math.PI * 2
    const glow = engine.addEntity()
    Transform.create(glow, {
      parent,
      position: Vector3.create(Math.cos(angle) * RAIL_RADIUS, 1.0, Math.sin(angle) * RAIL_RADIUS),
      scale: Vector3.create(0.16, 0.08, 0.16)
    })
    MeshRenderer.setCylinder(glow, 0.5, 0.5)
    Material.setPbrMaterial(glow, {
      albedoColor: Color4.fromHexString('#123A3EFF'),
      emissiveColor: INDICATOR_GLOW,
      emissiveIntensity: 0.7,
      roughness: 0.4
    })
    out.push(glow)
  }
  return out
}

/** Placeholder entity: the star halo read as a floating yellow disc and was cut. */
function createStarGlow(cabinet: Entity): Entity {
  const glow = engine.addEntity()
  Transform.create(glow, { parent: cabinet, position: Vector3.create(0, 2.98, -0.95), scale: HIDDEN_SCALE })
  return glow
}

function createIndicator(parent: Entity): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, {
    parent,
    position: onCabinet(-0.62, 1.26, -1.95),
    rotation: Quaternion.Identity(),
    scale: HIDDEN_SCALE
  })
  MeshRenderer.setBox(entity)
  Material.setPbrMaterial(entity, {
    albedoColor: CYAN,
    emissiveColor: INDICATOR_GLOW,
    emissiveIntensity: 2.2,
    roughness: 0.55,
    metallic: 0.05
  })
  return entity
}

function setText(entity: Entity, value: string): void {
  TextShape.getMutable(entity).text = value
}

/**
 * The big panel is cut for three digits. A round total runs to four or five,
 * so shrink the type to keep it inside the glass instead of letting it wrap.
 */
function setScoreDisplay(machine: PunchMachineRuntime, value: string): void {
  const shape = TextShape.getMutable(machine.scoreText)
  shape.text = value
  shape.fontSize = value.length >= 5 ? 1.9 : value.length === 4 ? 2.4 : 3.2
}

function updateIndicator(machine: PunchMachineRuntime, score: number): void {
  const span = Math.max(1, machine.config.maxScore - machine.config.minScore)
  const ratio = Math.max(0, Math.min(1, (score - machine.config.minScore) / span))
  paintMeter(machine, ratio)
}

function playerInZone(zoneId: string | null): boolean {
  const zone = runtimeZoneById(zoneId)
  const player = Transform.getOrNull(engine.PlayerEntity)
  const origin = getRuntimeContext()?.modelOrigin
  if (!zone || !player || !origin) return false
  if (Number.isFinite(zone.floorY) && Math.abs(player.position.y - Number(zone.floorY)) > 1.8) return false
  const local = sceneToGlbLocal(origin, player.position.x, player.position.z)
  return pointInFloorZone(local.x, local.z, zone.shape)
}

function nextAudio(machine: PunchMachineRuntime): Entity {
  const entity = machine.audio[machine.audioCursor % machine.audio.length]!
  machine.audioCursor += 1
  return entity
}

/**
 * Three channels, because they wear people out for different reasons. CROWD is
 * the ring — cheers and every spoken line. MACHINE is the cabinet — impacts,
 * clunks, the charge rise, the score stings and the attract jingle. CLOUDS is
 * the sky furniture: the updraft fan and the landing pomf on the jump clouds.
 * A player silences any of them and stays in the game.
 *
 * ‼️THE MIXER HAS TO BE COMPLETE OR IT IS A LIAR. CLOUDS exists because it was
 * the one thing left making noise with both other boxes ticked — the vent whoosh
 * fires whenever you cross a cloud's column, which is constantly if you are
 * flying around the island, and it has no visible source from the deck. A switch
 * panel that does not cover every sound the scene can make sends the owner
 * hunting for a sound nothing on screen admits to.
 *
 * The mute is local by construction: every clip below is played by an
 * AudioSource on the client that hears it, so nothing leaves this Explorer and
 * nobody else's mix moves. Session-scoped — a scene gets no storage, so
 * walking out and back in starts unmuted.
 */
/**
 * ‼️VOICE IS ITS OWN CHANNEL, AND IT USED TO BE PART OF `crowd`.
 *
 * Owner, 2026-09-09: *"the spoken voices have become much more frequent. Add
 * separate controls for voices and other game audio."* A spoken line and a
 * cheer wear a listener out at completely different rates — the cheer is
 * texture and the line is a sentence you are asked to parse — so one switch
 * over both means the only way to stop being talked at is to mute the room.
 *
 * The split is one enum member because every clip in this plugin already goes
 * through `playSfx`, and `playSfx` already takes a channel. What changes is the
 * two call sites that speak: the crowd's punch commentary and the divine line.
 */
export type PunchSfxChannel = 'crowd' | 'machine' | 'clouds' | 'voice'

/** Every channel, in one place, so a new one cannot be forgotten by a loop. */
const PUNCH_SFX_CHANNELS: PunchSfxChannel[] = ['crowd', 'machine', 'clouds', 'voice']

/**
 * GAME SOUNDS is everything that is not somebody talking. Named here so the
 * HUD's two-row menu and the mute primitives agree by construction rather than
 * by both listing the same three strings.
 */
const PUNCH_GAME_SFX_CHANNELS: PunchSfxChannel[] = ['crowd', 'machine', 'clouds']

const sfxMuted: Record<PunchSfxChannel, boolean> = { crowd: false, machine: false, clouds: false, voice: false }

export function punchSfxMuted(channel: PunchSfxChannel): boolean {
  return sfxMuted[channel]
}

/**
 * Ticking the box has to land NOW, not once the cheer already in the air runs
 * out. The slots are a shared ring buffer that keeps no record of which channel
 * filled them, so the honest move is to cut every slot: the muted channel goes
 * quiet for good, and the other one loses at most one clip it plays again on
 * the next punch.
 */
/** Is the room silent — every channel, not just the one you last touched? */
export function punchSfxAllMuted(): boolean {
  return PUNCH_SFX_CHANNELS.every((channel) => sfxMuted[channel])
}

/** Is anything at all making noise? Drives the icon's own on/off plate. */
export function punchSfxAnyAudible(): boolean {
  return PUNCH_SFX_CHANNELS.some((channel) => !sfxMuted[channel])
}

/** The two questions the HUD's little menu asks, and the two it answers. */
export function punchVoicesMuted(): boolean {
  return sfxMuted.voice
}

export function punchGameSoundsMuted(): boolean {
  return PUNCH_GAME_SFX_CHANNELS.every((channel) => sfxMuted[channel])
}

export function setPunchVoicesMuted(muted: boolean): void {
  if (sfxMuted.voice !== muted) togglePunchSfxMute('voice')
}

/**
 * DON'T SHOW AGAIN on the rescue ask. Lives for this visit, and in localStorage
 * when the Explorer has it (web). Native Explorer has no store — leaving the
 * world is the reset, and HELP OFF on the HUD is the re-enable.
 */
const RESCUE_PROMPT_PREF = 'sv.highground.rescuePrompts'

function readRescuePromptPref(): boolean {
  try {
    const storage = (globalThis as { localStorage?: { getItem(key: string): string | null } }).localStorage
    return storage?.getItem(RESCUE_PROMPT_PREF) === '0'
  } catch {
    return false
  }
}

function writeRescuePromptPref(muted: boolean): void {
  try {
    const storage = (globalThis as { localStorage?: { setItem(key: string, value: string): void } }).localStorage
    storage?.setItem(RESCUE_PROMPT_PREF, muted ? '0' : '1')
  } catch {
    /* no persistent store on this client — the in-memory flag still holds. */
  }
}

let rescuePromptsMuted = readRescuePromptPref()

export function punchRescuePromptsMuted(): boolean {
  return rescuePromptsMuted
}

export function setPunchRescuePromptsMuted(muted: boolean): void {
  rescuePromptsMuted = muted === true
  writeRescuePromptPref(rescuePromptsMuted)
}

export function setPunchGameSoundsMuted(muted: boolean): void {
  for (const channel of PUNCH_GAME_SFX_CHANNELS) {
    if (sfxMuted[channel] !== muted) togglePunchSfxMute(channel)
  }
}

/**
 * One switch for the whole room.
 *
 * Three named channels were the honest way to FIND the sound nobody could
 * silence (it was the jump clouds), and a poor way to live with it: on a phone
 * it is three small targets asking a visitor to care which of our subsystems is
 * making the noise. They do not. The per-channel switches stay in the code —
 * `togglePunchSfxMute` is still the primitive — but the HUD asks one question.
 */
export function setPunchSfxAllMuted(muted: boolean): void {
  for (const channel of PUNCH_SFX_CHANNELS) {
    if (sfxMuted[channel] !== muted) togglePunchSfxMute(channel)
  }
}

export function togglePunchSfxMute(channel: PunchSfxChannel): void {
  sfxMuted[channel] = !sfxMuted[channel]
  if (!sfxMuted[channel]) return
  if (channel === 'voice') {
    // ‼️THE QUEUE IS THE POINT. Spoken lines are DEALT up to three at a time
    // and fire 3.2 s apart, so a mute that only cuts the slots still leaves the
    // player being talked at for the next ten seconds — which is exactly the
    // complaint the switch exists to answer. Drop what has not been said yet,
    // then cut the slot carrying whatever is mid-sentence.
    pendingPunchVoices.length = 0
    for (let i = pendingMachineSfx.length - 1; i >= 0; i -= 1) {
      if (pendingMachineSfx[i]!.channel === 'voice') pendingMachineSfx.splice(i, 1)
    }
    for (const machine of machines) {
      for (const entity of machine.audio) {
        const source = AudioSource.getMutableOrNull(entity)
        if (source) source.playing = false
      }
    }
    return
  }
  if (channel === 'clouds') {
    // The clouds own two dedicated slots per cloud rather than the machine's
    // ring, so this one cuts its own hardware and leaves the cabinet alone.
    for (const cloud of jumpClouds) {
      for (const entity of [cloud.vent, cloud.audio]) {
        if (!entity) continue
        const source = AudioSource.getMutableOrNull(entity)
        if (source) source.playing = false
      }
    }
    return
  }
  for (const machine of machines) {
    for (const entity of machine.audio) {
      const source = AudioSource.getMutableOrNull(entity)
      if (source) source.playing = false
    }
  }
}

/**
 * ‼️THE ARC FOLLOWS THE MACHINE'S VOICE — and this is the only way it can.
 *
 * Owner, 2026-09-04: *"the audio that we get from the machine is probably what
 * should drive the screen, and that would make it work — I think that's what we
 * have missed."* SDK7 gives a scene no analysis of an `AudioSource` at all: no
 * level, no FFT, not even a playback position. Asking the runtime how loud the
 * speaker is right now is not a thing that can be done.
 *
 * What the scene DOES know exactly is which clip it started and on which frame.
 * So every clip's loudness is measured offline and shipped as an envelope
 * (scripts/punch/bake-audio-envelopes.py), and the arc reads it forward from
 * `startedAt`. The screen is then tracking the same waveform the ear is,
 * without anything being analysed at runtime.
 *
 * ONE VOICE, AND IT IS THE MACHINE'S. Nine slots can be sounding at once and
 * the crowd is the loudest thing on the island — following the mix would make
 * the arc pump to a cheer that has nothing to do with the cabinet. Only the
 * `machine` channel is followed, which is the impact, the machine's answer and
 * the score tally: the sounds the OWNER means by "the audio we get from the
 * machine". Latest clip wins, because that is the event the ear is on.
 */
interface ScreenVoice {
  steps: Uint8Array
  startedAt: number
}
let screenVoice: ScreenVoice | null = null
/** Parsed envelopes, kept so a hex string is decoded once per clip, not per punch. */
const envelopeCache = new Map<string, Uint8Array | null>()

function envelopeFor(clip: string): Uint8Array | null {
  const held = envelopeCache.get(clip)
  if (held !== undefined) return held
  const hexed = PUNCH_AUDIO_ENVELOPES[clip]
  let steps: Uint8Array | null = null
  if (hexed && hexed.length >= 2) {
    steps = new Uint8Array(hexed.length / 2)
    for (let i = 0; i < steps.length; i += 1) {
      steps[i] = parseInt(hexed.substr(i * 2, 2), 16)
    }
  }
  envelopeCache.set(clip, steps)
  return steps
}

/**
 * How loud the machine is RIGHT NOW, 0..1 — or 0 between clips.
 *
 * Clears itself once the clip has run out, so a screen reading this never holds
 * the last frame of a sound that finished two minutes ago.
 */
export function punchAudioLevel01(now: number): number {
  if (!screenVoice) return 0
  const index = Math.floor((now - screenVoice.startedAt) / PUNCH_ENVELOPE_STEP_MS)
  if (index < 0) return 0
  if (index >= screenVoice.steps.length) {
    screenVoice = null
    return 0
  }
  return screenVoice.steps[index]! / 255
}

function playSfx(
  machine: PunchMachineRuntime,
  clip: string,
  volume = 0.7,
  channel: PunchSfxChannel = 'machine',
  pitch = 1
): void {
  if (!machine.config.soundsEnabled || activeProfile(machine).disabledAudio.includes(clip)) return
  if (sfxMuted[channel]) return
  if (channel === 'machine') volume *= effectPlan(machine).cabinetAudio.gain
  if (volume <= 0) return
  AudioSource.createOrReplace(nextAudio(machine), {
    audioClipUrl: clip,
    playing: true,
    loop: false,
    volume: volume * channelGain(channel),
    pitch,
    global: false
  })
  if (channel === 'machine') {
    const steps = envelopeFor(clip)
    // Volume rides the envelope too: a clip played at a third of its level
    // should not drive the arc as hard as the same clip played flat out.
    if (steps) screenVoice = { steps, startedAt: Date.now() }
  }
}

/**
 * THE DUCK, and it is the only mixing this plugin does.
 *
 * There is no mixer here in the mixing-desk sense — no bus, no priority, no
 * concurrency cap. Nine slots play whatever they are handed at whatever volume
 * the caller typed. That is survivable everywhere except across the punch
 * itself, where the crowd is the loudest thing on the island and lands on the
 * same frames as the fist: the hit, the cabinet answering it and the tally all
 * arrive underneath a cheer that started before them.
 *
 * So the crowd steps back for the length of one punch's beat, and only the
 * crowd. It is a gain applied at the single point every clip already passes
 * through, rather than a number edited into thirty call sites — the cheer is
 * still there, still triggered by the same cards, just no longer standing in
 * front of the sound the player came for.
 */
const CROWD_DUCK_MS = 900
const CROWD_DUCK_GAIN = 0.45
let crowdDuckUntil = 0

function channelGain(channel: PunchSfxChannel): number {
  // ‼️VOICE DUCKS WITH THE CROWD. A spoken line landing on the frame of the
  // fist is the same fault the duck was written for, and it was inside `crowd`
  // when the duck was written — splitting the channel without splitting the
  // duck would quietly hand the commentary back its full volume over the punch.
  if (channel !== 'crowd' && channel !== 'voice') return 1
  return Date.now() < crowdDuckUntil ? CROWD_DUCK_GAIN : 1
}

/** Called by the punch's own impact, which is what the crowd steps back for. */
function duckCrowdForPunch(): void {
  crowdDuckUntil = Date.now() + CROWD_DUCK_MS
}

/**
 * ONE TICK PER WHOLE SECOND, inside the countdown window, and never twice.
 *
 * The system runs at frame rate, so the guard is the SECOND ITSELF, not a
 * timestamp: we remember the last whole second already spoken and only speak
 * when the number on screen actually changes. That also makes it self-healing —
 * a dropped frame skips a tick rather than firing a burst to catch up.
 *
 * The tick climbs in pitch as it runs out (1.0 at ten, ~1.35 at two) so urgency
 * is audible without a second clip, and the last second gets its own.
 */
function tickTurnClock(machine: PunchMachineRuntime, msLeft: number): void {
  if (msLeft <= 0) {
    machine.turnTickSecond = -1
    return
  }
  const second = Math.ceil(msLeft / 1000)
  if (second > PUNCH_TURN_COUNTDOWN_S) {
    // Above the window we still track the second, so stepping INTO the window
    // speaks on the first whole second inside it rather than mid-second.
    machine.turnTickSecond = second
    return
  }
  if (second === machine.turnTickSecond) return
  machine.turnTickSecond = second
  if (second <= 1) {
    playSfx(machine, SFX_TURN_LAST, 0.9, 'machine')
    return
  }
  const t = 1 - (second - 2) / Math.max(1, PUNCH_TURN_COUNTDOWN_S - 2)
  playSfx(machine, SFX_TURN_TICK, 0.5 + t * 0.35, 'machine', 1 + t * 0.35)
}

/**
 * The three boxes: regular, strong, massive. The massive one wraps the machine —
 * top impact plus the special rattle plus smoke off the bag, and it is loud.
 */
function playImpact(machine: PunchMachineRuntime, intensity: number): void {
  const tier = reactionTier(intensity)
  const impact = pickFrom(IMPACT_POOLS[activeProfile(machine).impactStyle === 'bass' && (machine.slamScore >= 950 || (machine.slamStreak ?? 0) >= 3) ? 'top' : tier].filter(clip => !activeProfile(machine).disabledAudio.includes(clip)))
  // ‼️THE DEDICATED SOURCE, never the pool. See `impactAudio`. Pitched DOWN on
  // the big hits: the same take a fifth lower is the "deep bass" the owner
  // asked for on 2026-09-06 without a second library of clips.
  if (impact) playImpactSfx(machine, impact, tier === 'top' ? 1 : tier === 'good' ? 0.82 : 0.6, tier === 'top' ? 0.84 : tier === 'good' ? 0.93 : 1)
  const body = pickFrom(MACHINE_POOLS[tier])
  // ‼️THE CABINET ANSWERS A BEAT LATER. Owner: "when it hits the machine you
  // want to hear the rattle of the machine slightly delayed." Impact and rattle
  // used to fire on the same frame and read as one muddled sound.
  if (body) pendingMachineSfx.push({ machine, clip: body, at: Date.now() + (tier === 'top' ? 140 : 110), volume: tier === 'top' ? 0.95 : tier === 'good' ? 0.5 : 0.3 })
  // Particle and fire rules own emissions; impact audio never spawns a second burst.
}

/**
 * The punch's own clip, on the one source reserved for it.
 *
 * Deliberately a separate function rather than a flag on `playSfx`: it makes the
 * reservation greppable, and it means adding a new sound somewhere else in the
 * plugin cannot accidentally opt into the protected slot.
 */
function playImpactSfx(machine: PunchMachineRuntime, clip: string, volume: number, pitch = 1): void {
  if (!machine.config.soundsEnabled) return
  if (sfxMuted.machine || effectPlan(machine).impactAudio.gain === 0) return
  volume *= effectPlan(machine).impactAudio.gain
  // The punch owns the next second of the mix. See channelGain.
  duckCrowdForPunch()
  AudioSource.createOrReplace(machine.impactAudio, {
    audioClipUrl: clip,
    playing: true,
    loop: false,
    volume,
    pitch,
    global: false
  })
}

/**
 * The cabinet's answer, queued a beat after the fist — drained by `flushPendingMachineSfx`.
 *
 * `channel` rides the entry because the queue carries two different things: the
 * cabinet's own body clip, and the DIVINE LINE, which is a sentence spoken from
 * the sky. Both are delayed the same way and only one of them is a voice.
 */
const pendingMachineSfx: Array<{ machine: PunchMachineRuntime; clip: string; at: number; volume: number; channel?: PunchSfxChannel }> = []
function flushPendingMachineSfx(machine: PunchMachineRuntime, now: number): void {
  for (let i = pendingMachineSfx.length - 1; i >= 0; i -= 1) {
    const entry = pendingMachineSfx[i]!
    if (entry.machine !== machine || now < entry.at) continue
    pendingMachineSfx.splice(i, 1)
    playSfx(machine, entry.clip, entry.volume, entry.channel ?? 'machine')
  }
}

/**
 * ‼️EVERY IMPACT AND CABINET CLIP IS LOADED BEFORE THE FIRST PUNCH. Thirty-odd
 * takes are drawn from at random, and an AudioSource pointed at a clip the
 * Explorer has never fetched plays it when the fetch lands — a beat late, on
 * the one frame the whole game is timed to (owner, 2026-09-06: "always a
 * little bit late… this is the core moment, it has to be timed"). A silent
 * source per clip at boot pulls each file into the cache once.
 */
let audioPrewarmed = false
/** Runs on the first machine tick that has a runtime to read the profile from. */
function prewarmAudioOnce(): void {
  audioPrewarmed = false
}
function prewarmAudioFor(machine: PunchMachineRuntime): void {
  if (audioPrewarmed) return
  audioPrewarmed = true
  prewarmPunchAudio(machine, machine.root)
}
function prewarmPunchAudio(machine: PunchMachineRuntime, parent: Entity): void {
  const clips = new Set<string>([
    ...IMPACT_POOLS.bad, ...IMPACT_POOLS.good, ...IMPACT_POOLS.top,
    ...MACHINE_POOLS.bad, ...MACHINE_POOLS.good, ...MACHINE_POOLS.top,
    ...SCORE_POOL
  ])
  for (const clip of clips) {
    if (activeProfile(machine).disabledAudio.includes(clip)) continue
    const entity = engine.addEntity()
    Transform.create(entity, { parent, position: Vector3.create(0, 1, 0) })
    AudioSource.create(entity, { audioClipUrl: clip, playing: false, loop: false, volume: 0, global: false })
  }
}

/** Grey burst off the bag for massive hits — same particle kit as the celebration. */
function spawnImpactSmoke(machine: PunchMachineRuntime): void {
  if (effectPlan(machine).particles.gain <= 0) return
  const entity = engine.addEntity()
  Transform.create(entity, { parent: machine.root, position: Vector3.create(0, 1.6, PUNCH_BAG_Z) })
  ParticleSystem.create(entity, {
    active: true,
    rate: 70,
    maxParticles: 70,
    lifetime: 1.1,
    gravity: 0.25,
    additionalForce: Vector3.create(0, 0.6, 0),
    initialSize: { start: 0.22, end: 0.55 },
    sizeOverTime: { start: 1, end: 2.2 },
    initialVelocitySpeed: { start: 1.6, end: 3 },
    initialColor: { start: Color4.create(0.92, 0.92, 0.95, 0.85), end: Color4.create(0.75, 0.75, 0.8, 0.5) },
    colorOverTime: { start: Color4.create(1, 1, 1, 0.6), end: Color4.create(0.8, 0.8, 0.85, 0) },
    billboard: true,
    loop: false,
    // LOCAL, not world: these sparks belong to the CABINET. World simulation
    // detaches a particle from its parent's frame the instant it is emitted, so
    // any discrepancy between where the machine's root sits and where its body
    // is drawn puts the burst somewhere else entirely — and "the fire effect
    // lands on me, across the island" is exactly what that looks like. Local
    // space makes the question unanswerable: they are drawn in the machine's
    // frame or not at all.
    simulationSpace: 0,
    texture: { src: 'images/fx-particle-smoke.png' },
    shape: ParticleSystem.Shape.Cone({ angle: 75, radius: 0.3 })
  })
  bursts.push({ entity, expiresAt: Date.now() + 1_600 })
}

/** Queue the score-reveal audio for when the counter finishes climbing. */
/**
 * The machine grants another punch: gold flash on the marquee, a bright sting,
 * and a badge the HUD throws up next to the counter. Without this the streak
 * reward is invisible — the allowance just quietly changed.
 */
function announceExtraPunch(machine: PunchMachineRuntime): void {
  const now = Date.now()
  hud.extraPunchAt = now
  machine.lightFlashUntil = Math.max(machine.lightFlashUntil, now + 1_400 * effectPlan(machine).screenFx.gain)
  if (!(machine.network?.snapshot().streakBonus ?? 0)) playSfx(machine, SFX_HIGH_SCORE, 0.7)
  // Owner, 2026-09-11: the room has to SEE the extra punch on the person who
  // got it, not only as a HUD chip. Attach to their nametag on every client.
  const active = machine.network?.snapshot().active
  const activeId = (active?.userId || machine.localUserId || '').trim()
  if (activeId && activeId !== PUNCH_HOUSE_BOT_ID) {
    showExtraPunchOverHead({
      userId: activeId,
      mine: activeId === machine.localUserId,
      now
    })
  }
}

/**
 * The ladder pays out. Louder and longer than the extra punch on purpose: the
 * allowance is a promise of points and this is the points, so the rung that
 * actually moved the total is the one that gets the bigger moment.
 *
 * ‼️It says the NUMBER, not just the name. 'CRAZY STREAK' over a total that
 * jumped by 1500 leaves the player to work out which part of the jump was the
 * punch and which was the reward, and a bonus nobody can attribute reads as the
 * scoreboard being loose with its arithmetic rather than as a prize.
 */
function announceStreak(machine: PunchMachineRuntime, streak: number, bonus: number): void {
  const now = Date.now()
  hud.streakAt = now
  hud.streak = streak
  hud.streakBonus = bonus
  hud.streakName = machine.network?.snapshot().streakName || ('STREAK x' + (activeProfile(machine).multipliers[Math.min(streak, activeProfile(machine).multipliers.length - 1)] ?? 1))
  // Every rung above the second gets the cabinet's full jackpot lurch as well:
  // by then the room is watching one person, and the machine should look like
  // it is struggling to contain what is being done to it.
  machine.lightFlashUntil = Math.max(machine.lightFlashUntil, now + 2_200 * effectPlan(machine).screenFx.gain)
  if (streak >= 3) machine.lurchUntil = Math.max(machine.lurchUntil, now + 2_200)
  playSfx(machine, SFX_HIGH_SCORE, 0.85)
  // Spoken reactions and shared celebrations are scheduled by the effect plan.
}

function scheduleReveal(machine: PunchMachineRuntime, score: number, now: number): void {
  for (let i = pendingPunchVoices.length - 1; i >= 0; i--) if (pendingPunchVoices[i]!.machine === machine) pendingPunchVoices.splice(i, 1)
  // ‼️THE CUT PUSHES THE WHOLE PAYLOAD BACK, and this line is why it works at
  // all. `playReveal` is where the score jingle, the crowd's spoken lines and
  // the divine choir are queued — fire it at the count's end on a 999 and the
  // cut would silence sounds it had only just started, and worse, would have
  // spent the divine RECORD and its five-minute cooldown on a miracle nobody
  // heard. Everything the number is owed arrives when the lights come back.
  machine.revealAt = now + punchRevealCountMs(score, activeProfile(machine)) + punchPerfectCutMs(score, machine.config)
  machine.revealScore = score
}

/**
 * The reveal count-up: 000 through the slam and one extra breath, then a
 * power-4 crawl where the last tens take the longest — a 950 visibly slows
 * through 900 and creeps in, so the whole ring leans in to see where it stops.
 * `sincePhaseStartMs` is time since the scoring phase (the release) began.
 */
function revealShownScore(score: number, sincePhaseStartMs: number, profile?: PunchGameProfile): number {
  // The curve moved into the contract so the ARC counts off the same one; a
  // second copy here is what let the big screen print the answer early.
  return punchRevealShownScore(score, sincePhaseStartMs, punchRevealCountMs(score, profile))
}

/**
 * THE ESCALATION LADDER IS GONE FROM HERE, and this is its headstone.
 *
 * It used to be four hardcoded rungs read straight off the score: tiers, then
 * `streak900 >= 3` for the OVERLOAD, then 950 for the SKY QUAKE, then 980 for
 * the JACKPOT lurch. Every one of them fired on every qualifying punch, forever,
 * in the same order — which is precisely why the top of the range stopped
 * escalating: past 900 there was nothing left to reveal, and a 999 got the same
 * three things a 980 did.
 *
 * All four are cards now (`cabinet-overload`, `world-cloud-quake`,
 * `cabinet-lurch`, and the rest of shared/punch-show-catalog.ts), each with a
 * heat window, a cooldown and in some cases a rarity roll. They still fire — but
 * they take turns, they share the stage with a dozen effects that did not exist,
 * and no two big punches in a row can produce the same set.
 *
 * Add the next rung as a CARD. Adding it here would rebuild the thing that had
 * to be taken apart.
 */

/** Thin smoke from the back panel — a machine pushed past its limit. */
function spawnRearSmoke(machine: PunchMachineRuntime): void {
  if (effectPlan(machine).particles.gain <= 0) return
  const entity = engine.addEntity()
  Transform.create(entity, { parent: machine.root, position: Vector3.create(0, 2.7, -1.6) })
  ParticleSystem.create(entity, {
    active: true,
    rate: 14,
    maxParticles: 60,
    lifetime: 2.6,
    gravity: 0.1,
    additionalForce: Vector3.create(0.15, 0.9, -0.2),
    initialSize: { start: 0.14, end: 0.4 },
    sizeOverTime: { start: 1, end: 2.6 },
    initialVelocitySpeed: { start: 0.3, end: 0.8 },
    initialColor: { start: Color4.create(0.35, 0.35, 0.38, 0.7), end: Color4.create(0.5, 0.5, 0.52, 0.4) },
    colorOverTime: { start: Color4.create(0.6, 0.6, 0.62, 0.5), end: Color4.create(0.7, 0.7, 0.72, 0) },
    billboard: true,
    loop: false,
    // LOCAL, not world: these sparks belong to the CABINET. World simulation
    // detaches a particle from its parent's frame the instant it is emitted, so
    // any discrepancy between where the machine's root sits and where its body
    // is drawn puts the burst somewhere else entirely — and "the fire effect
    // lands on me, across the island" is exactly what that looks like. Local
    // space makes the question unanswerable: they are drawn in the machine's
    // frame or not at all.
    simulationSpace: 0,
    texture: { src: 'images/fx-particle-smoke.png' },
    shape: ParticleSystem.Shape.Cone({ angle: 30, radius: 0.2 })
  })
  bursts.push({ entity, expiresAt: Date.now() + 5_200 })
}

/**
 * The NUMBER's moment, not the punch's: only the score jingle and a possible
 * spoken line live here. Everything physical — explosion, fireworks, crowd
 * roar, escalation — fires at the SLAM (see fireSlam): if you smash it, you
 * smash it, and the counter creeping up afterwards is the suspense, not a
 * delay on the impact.
 */
function playReveal(machine: PunchMachineRuntime, score: number): void {
  const now = Date.now()
  const fx = effectPlan(machine)
  const rules = activeProfile(machine)
  const tally = pickFrom(SCORE_POOL)
  if (tally) playSfx(machine, tally, 0.62, 'machine')
  // ‼️THE HEAVENS, on a 980+: the choir swells as the count lands and a voice
  // from the sky speaks a beat later. Owner, 2026-09-06, three times: "some
  // kind of god-like voice… some kind of angel sound effect while the player
  // spreads his arms and looks up". Generated with ElevenLabs, shipped under
  // sounds/punch, drawn by the attempt so the same night hears each line.
  const divine = punchClaimDivineMoment(machine, score, now)
  if (divine) {
    const choir = PUNCH_AUDIO.choir[0]
    if (choir) playSfx(machine, choir, 0.85, 'machine')
    const serial = machine.network?.snapshot().serial ?? machine.attemptInRound
    const line = PUNCH_AUDIO.divine[Math.abs(serial) % Math.max(1, PUNCH_AUDIO.divine.length)]
    // The choir above is a SOUND and stays on `machine`; this is a SENTENCE.
    if (line) pendingMachineSfx.push({ machine, clip: line, at: now + 900, volume: 1, channel: 'voice' })
  }
  if (fx.crowdVoice.gain > 0 && arcBots(machine).length > 0) {
    const pool = VOICE_POOLS[voiceTier(score, machine.config)].filter(clip => !rules.disabledAudio.includes(clip))
    const shot = machine.network?.snapshot()
    const dealt = dealShowClips(
      pool,
      shot?.serial ?? machine.attemptInRound,
      shot?.roundStartedAt ?? machine.slamPhaseAt,
      rules.voices
    )
    dealt.forEach((clip, i) => {
      pendingPunchVoices.push({ machine, clip, at: now + i * 3200, gain: fx.crowdVoice.gain })
    })
  }
  if (fx.celebration.gain > 0) {
    const serial = machine.network?.snapshot().serial ?? machine.attemptInRound
    if (machine.celebrationSerial !== serial) {
      machine.celebrationSerial = serial
      machine.celebrationUntil = now + 2500
      const snapshot = machine.network?.snapshot()
      // Body-only celebration: NOT `headexplode` or another particle emote.
      // The crowd reads the NUMBER (see crowdReactionPlan) rather than clapping
      // every punch through the same flat pool, and the serial walks the pool so
      // the same bot does not repeat itself attempt after attempt.
      const reaction = crowdReactionPlan(score, machine.config, rules.celebrationEmote)
      const cast = arcBots(machine)
      cast.slice(0, Math.min(reaction.reacting, cast.length)).forEach((bot, index) => {
        playBotEmote(bot, reaction.pool[Math.abs(serial + index * 3 + bot.index) % reaction.pool.length]!, false)
        bot.stopEmoteAt = now + 2000 + index * 180
      })
      const contributed = snapshot?.attempt?.boosts.some(entry => entry.userId === machine.localUserId && !entry.npc)
      // ‼️A SIGNATURE MOVE ON A 900+, from a pool of the breakdance clips the
      // scene already ships — owner, 2026-09-06: "it's always raising one arm
      // or two arms… some kind of signature move, a disco move, a 360, a
      // Michael Jackson move". Seeded by the attempt so the room sees the same
      // move.
      //
      // ‼️AND NEVER ARMS-UP BELOW 900. The `else` here used to throw
      // `rules.celebrationEmote` — `handsair` — on EVERY punch, so a 300 and a
      // 950 looked identical from outside the cabinet and the arms-up moment was
      // worth nothing. Owner, 2026-09-08: *"he should only raise his hands above
      // 900."* `celebrationEmote` steers the CROWD now, not the puncher.
      //
      // ‼️BUT NOT SILENCE EITHER. Taking the celebration away left the puncher
      // standing dead still on everything under 900 — the same flatness from the
      // other end. `PUNCH_REACTION_BANDS` answers the number with a body that is
      // NOT a celebration: deflate, shrug, shake it out, reset.
      if (punchIsMine(machine) || contributed) {
        const signature = score >= DIVINE_SCORE ? DIVINE_MOVE : score >= ISLAND_ROLL_SCORE ? SIGNATURE_MOVES[serial % SIGNATURE_MOVES.length] : null
        const move = signature ?? (rules.reactionMovesEnabled ? punchReactionMoveFor(score, serial) : null)
        if (move) playPunchMove(move)
      }
      if (snapshot?.attempt?.highGround) runHighGroundEvent(machine, 'liftoff', score, now)
      if (fx.islandMotion.gain > 0) startCloudQuake(Math.max(950, score), punchIsMine(machine), fx.islandMotion.gain * punchStreakEnergy(machine.slamStreak ?? 0))
      spawnCelebration(machine)
      playSfx(machine, SFX_CHAMPION, 0.9)
    }
  }
}
const pendingPunchVoices: Array<{ machine: PunchMachineRuntime; clip: string; at: number; gain: number }> = []


function punchModifierIsStillOurs(): boolean {
  const mode = InputModifier.getOrNull(engine.PlayerEntity)?.mode
  if (mode?.$case !== 'standard') return false
  const value = mode.standard
  return (
    value.disableWalk === true &&
    value.disableJog === true &&
    value.disableRun === true &&
    value.disableJump === true &&
    value.disableDoubleJump === true &&
    value.disableGliding === true
  )
}

/** The rig this machine wants bound for a given mode. */
function punchCameraRig(machine: PunchMachineRuntime, mode: 'first' | 'reveal'): Entity {
  return mode === 'first' ? machine.firstPersonCamera : machine.revealCamera
}

function setPunchCamera(machine: PunchMachineRuntime, mode: 'none' | 'first' | 'reveal'): void {
  const current = MainCamera.getOrNull(engine.CameraEntity)?.virtualCameraEntity
  // ‼️"ALREADY IN THAT MODE" IS A CLAIM ABOUT THE ENGINE, NOT ABOUT US, so it has
  // to be checked against the engine. `cameraMode` is our own bookkeeping and it
  // goes stale the moment anything else writes MainCamera: the flag still said
  // 'first' while the slot held someone else's rig, and this early return then
  // refused to re-bind for the whole rest of the session. A punch that silently
  // does nothing, for ever, from one unlucky frame. Re-binding an already-correct
  // camera costs nothing, so the only skip left is the one that is actually true.
  if (machine.cameraMode === mode && (mode === 'none' ? true : current === punchCameraRig(machine, mode))) {
    return
  }
  if (mode === 'none') {
    // ‼️RELEASE HANDS THE CAMERA BACK TO THE PLAYER. ALWAYS. `undefined` is the
    // player's own camera — the one they can turn and zoom. An earlier version of
    // this restored the rig the punch had borrowed the slot from, which sounded
    // considerate and was not: the borrowed rig belongs to a feature that has
    // stopped updating it, so the punch ended by parking the player inside a dead
    // camera they could not zoom out of. Owner, 2026-09-07: "you locked the camera
    // so that I cannot even zoom out of it. I can walk around but the camera is
    // stuck." Whoever owned that rig will re-bind it if it still wants the slot.
    if (current === machine.firstPersonCamera || current === machine.revealCamera) {
      MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: undefined })
    }
    if (machine.ownsInput && punchModifierIsStillOurs()) InputModifier.deleteFrom(engine.PlayerEntity)
    machine.ownsInput = false
    machine.cameraMode = 'none'
    return
  }
  // ‼️THE PUNCH TAKES ITS OWN CAMERA BACK. The slot can be held by this very
  // machine's show — notably the FX SHAKE rig the punch kick installs — and it
  // used to veto the behind-the-back shot through the
  // guard below, which is why it worked on one punch and not the next (owner,
  // 2026-09-07: "this feature seems to fluctuate"). Neither is a reason to
  // refuse: the person at the bag outranks the flourish that celebrates them.
  // A camera belonging to ANY OTHER feature (a vehicle, the claw, a Scrap
  // fight) is still respected outright.
  let held = current
  if (held !== undefined && held === fxShakeCameraEntity() && releaseFxShakeCamera()) {
    held = MainCamera.getOrNull(engine.CameraEntity)?.virtualCameraEntity
  }
  // ‼️NOBODY OUTRANKS THE PERSON AT THE BAG. This used to `return` whenever any
  // other feature held the slot, and that single line is why the behind-the-back
  // shot has now died three times in a week without anyone touching it: a video
  // screen focus, a vehicle cabin cam, a Scrap fight, any of them left bound for
  // any reason, and the punch camera simply never happened again. Owner,
  // 2026-09-07, after the third fix: "I still don't have a proper zoom."
  //
  // The punch is two seconds long and it is the whole game. It BORROWS the slot
  // and gives it back on release (see the 'none' branch), so a vehicle cam the
  // player is genuinely using survives the punch instead of vetoing it.
  // ‼️A FOREIGN INPUT LOCK NO LONGER VETOES THE CAMERA. With the Scrap app on,
  // its fight can leave an InputModifier on the player, and this early return
  // silently dropped the behind-the-back shot on every punch (owner,
  // 2026-09-06: "it does not move the camera behind your back anymore"). The
  // camera is ours to set; the lock is not ours to take, so it is left alone.
  const foreignLock = InputModifier.has(engine.PlayerEntity) && !machine.ownsInput
  if (!foreignLock && !InputModifier.has(engine.PlayerEntity)) {
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
  if (!foreignLock) machine.ownsInput = true
  MainCamera.createOrReplace(engine.CameraEntity, {
    virtualCameraEntity: punchCameraRig(machine, mode)
  })
  machine.cameraMode = mode
}

/**
 * Only the bots actually watching. The ones parked behind the cabinet must not
 * speak, react or drop lore — a voice from off-stage has no visible source.
 */
function arcBots(machine: PunchMachineRuntime): readonly TroupeBot[] {
  const bots = getTroupeBots()
  const watching = machine.crowdGathered ? bots.slice(0, machine.watcherCount) : bots
  // WHOEVER IS UP IS NOT IN THE CROWD. The reaction pass fires on the same
  // scoring transition the swing does and runs one step later, so handing the
  // puncher a 'handsair' overwrote its own punch a frame after it started: the
  // NPC stood at the bag with both arms in the air and never appeared to hit
  // anything. Nobody claps for their own punch, and nobody whispers about the
  // player while being that player.
  const performer = performingBot(machine)
  return performer ? watching.filter((bot) => bot !== performer) : watching
}

/** How many of the arc channel rather than watch. One lifts, one drags. */
const PUNCH_CHANNELLERS = 2

/**
 * THE TWO STANDING LEFT AND RIGHT OF THE CABINET.
 *
 * `punchWatcherSlot` deals the arc as two wings out of a centre gap, innermost
 * pair first, so the LAST pair of slots is the outermost one — ±118° from
 * straight-behind, which at the arc's radius puts them level with the machine
 * and roughly 2.6 m to either side of it. Those two are the flanks a player
 * standing at the bag sees in their peripheral vision, and they are the two who
 * channel: taking them off the applause detail is deliberate, because a clap
 * overwrites their clip and someone visibly working is worth more than a fourth
 * pair of hands.
 *
 * A body is always left over for the crowd itself — hence the `<=` rather than
 * `<`. An arc of two would otherwise leave nobody to whisper or applaud at all.
 */
function channellerBots(machine: PunchMachineRuntime): readonly TroupeBot[] {
  const arc = arcBots(machine)
  if (arc.length <= PUNCH_CHANNELLERS) return []
  return arc.slice(arc.length - PUNCH_CHANNELLERS)
}

/** The arc minus the flanks: whoever is free to whisper and applaud. */
function watcherBots(machine: PunchMachineRuntime): readonly TroupeBot[] {
  const channelling = channellerBots(machine)
  if (!channelling.length) return arcBots(machine)
  return arcBots(machine).filter((bot) => !channelling.includes(bot))
}

/** Humans standing on or near the deck, the local player included. */
function humansNearMachine(machine: PunchMachineRuntime): number {
  const center = getWorldPosition(engine, machine.root)
  let count = 0
  for (const [entity] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    const tf = Transform.getOrNull(entity)
    if (!tf) continue
    if (Math.hypot(tf.position.x - center.x, tf.position.z - center.z) <= DECK_RADIUS + 1) {
      count += 1
    }
  }
  return count
}

/** Other Explorers in this scene. Avatars can be visible while the punch wire is dead. */
function otherHumansInScene(): number {
  let n = 0
  for (const [entity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (entity === engine.PlayerEntity) continue
    n += 1
  }
  return n
}

/**
 * Place every bot for the current audience: a handful watch from an arc behind
 * the player, and the rest wait behind the cabinet. Placement is a TELEPORT and
 * the walk target is the same spot, so the crowd is simply THERE when a player
 * arrives — no procession filing in across the sky — and no two of them are
 * ever pathing through each other, which is what left them spinning in place.
 */
function gatherCrowd(machine: PunchMachineRuntime, now: number): void {
  const bots = getTroupeBots()
  if (!bots.length) return
  claimPunchCrowd(bots.map(bot => bot.entity))
  const performer = performingBot(machine)
  const center = getWorldPosition(engine, machine.root)
  const watchers = Math.min(bots.length, punchWatcherCount(humansNearMachine(machine)))
  machine.watcherCount = watchers
  machine.slots.length = 0
  for (let index = 0; index < bots.length; index += 1) {
    const bot = bots[index]!
    let slotX: number
    let slotZ: number
    if (index < watchers) {
      const { dx, dz } = punchWatcherSlot(index, watchers)
      slotX = center.x + dx
      slotZ = center.z + PUNCH_STRIKE_Z + dz
    } else {
      // Surplus: park behind the machine, out of the shot.
      const spot = PUNCH_OFFSTAGE_SPOTS[(index - watchers) % PUNCH_OFFSTAGE_SPOTS.length]!
      slotX = center.x + spot.x
      slotZ = center.z + spot.z
    }
    machine.slots.push({ x: slotX, z: slotZ })
    // The mark is recorded so the arc keeps its shape, but the athlete on stage
    // is not moved onto it: a re-deal fires whenever the human count changes,
    // and one arriving visitor used to teleport the punching NPC off the bag.
    if (bot === performer) continue
    const botTf = Transform.getMutableOrNull(bot.entity)
    if (botTf) {
      botTf.position = Vector3.create(slotX, center.y, slotZ)
      botTf.scale = index < watchers ? Vector3.One() : Vector3.create(.001, .001, .001)
    }
    setBotSceneTarget(bot, {
      x: slotX,
      y: center.y,
      z: slotZ,
      mode: 'audience',
      faceAt: { x: center.x, z: center.z + PUNCH_BAG_Z }
    })
    // Held INDEFINITELY (the troupe's own boot/send-to-zone pattern). A timed
    // hold expires into zone roaming, and the saved scene's audience zone reaches
    // past the deck — so ten minutes after gathering, the crowd was back on air.
    bot.holdUntil = Number.MAX_SAFE_INTEGER
    stopBotEmote(bot)
  }
}

/**
 * Anyone who has drifted off their mark goes straight back to it. Bots are
 * spawned by the troupe wherever it likes and only then assigned here, so
 * without this the first thing a joining player sees is the audience walking
 * in over open air.
 */
function holdCrowdInPlace(machine: PunchMachineRuntime): void {
  const bots = getTroupeBots()
  const center = getWorldPosition(engine, machine.root)
  // ...EXCEPT whoever is up. This ran every frame and teleported any bot more
  // than 0.9 m off its audience mark straight back to it — which is exactly what
  // a performer walking to the bag is doing. So the machine punched itself with
  // nobody in front of it: the athlete was snatched back to the rail the instant
  // it took a step, every step, and no arrival was ever possible.
  const performer = performingBot(machine)
  for (let index = 0; index < bots.length && index < machine.slots.length; index += 1) {
    const bot = bots[index]!
    const slot = machine.slots[index]!
    const tf = Transform.getMutableOrNull(bot.entity)
    if (!tf) continue
    if (bot === performer) {
      // Walking to the bag is allowed. Walking UNDER the island is not — the
      // keeper used to skip this body entirely, so a KO that did not stand them
      // up left the nametag pacing under the stone.
      if (!bot.scrapKoRimAt && !bot.scrapFallAt && tf.position.y < center.y - 0.6) {
        tf.position = Vector3.create(tf.position.x, center.y, tf.position.z)
        bot.ty = center.y
      }
      continue
    }
    const off = Math.hypot(tf.position.x - slot.x, tf.position.z - slot.z)
    if (off > 0.9 || Math.abs(tf.position.y - center.y) > 0.6) {
      tf.position = Vector3.create(slot.x, center.y, slot.z)
    }
  }
}

function releaseCrowd(): void {
  releasePunchCrowd()
  for (const bot of getTroupeBots()) {
    const tf = Transform.getMutableOrNull(bot.entity)
    if (tf) tf.scale = Vector3.One()
    bot.holdUntil = 0
    // Drop any armed performance too. A pinned bot is skipped by the crowd
    // director, so a performer still holding its clips when the crowd
    // disperses would stand frozen out of every ambient behaviour.
    releaseBotEmotes(bot)
    stopBotEmote(bot)
    setBotTarget(bot, 'hangout')
  }
}

function updateCrowd(
  machine: PunchMachineRuntime,
  now: number,
  activeNearby: boolean,
  reactionSerial: number,
  score: number
): void {
  const botCount = getTroupeBots().length
  // On a sky island the audience has nowhere else to be, and their zone reaches
  // past the deck edge — so leaving them to wander it puts them on thin air.
  // Gather them and keep them gathered, rather than waiting on a proximity test
  // that also made them ignore a player walking up.
  const alwaysGathered = machine.config.skyIslandEnabled
  // Every arriving human costs a bot its spot, so re-deal whenever the count
  // changes — that is how the deck empties out as real players turn up.
  const humans = humansNearMachine(machine)
  const reshuffle = humans !== machine.lastHumanCount
  if (reshuffle) machine.lastHumanCount = humans
  if (
    (activeNearby || alwaysGathered) &&
    reactionSerial === 0 &&
    (!machine.crowdGathered || botCount > machine.crowdBotCount || reshuffle)
  ) {
    machine.crowdGathered = botCount > 0
    machine.crowdBotCount = botCount
    machine.crowdWhisperAt = now + 900
    machine.crowdWhisperIndex = 0
    gatherCrowd(machine, now)
  } else if (!activeNearby && !alwaysGathered && machine.crowdGathered) {
    machine.crowdGathered = false
    machine.crowdBotCount = 0
    releaseCrowd()
  }
  if (!machine.crowdGathered) return
  holdCrowdInPlace(machine)
  if (machine.crowdWhisperIndex < 1 && now >= machine.crowdWhisperAt && !machine.network?.snapshot().active) {
    const bots = watcherBots(machine)
    const lines = ["Someone's up.", 'Watch the timing.', 'This could be big.']
    const bot = bots[(machine.crowdWhisperIndex * 3) % Math.max(1, bots.length)]
    if (bot) showNpcSpeech(bot.entity, lines[machine.crowdWhisperIndex]!, 1900)
    machine.crowdWhisperIndex += 1
    machine.crowdWhisperAt = now + 1150
  }
  if (reactionSerial <= machine.crowdReactionSerial || now < (machine.reactionAt ?? 0)) return
  machine.crowdReactionSerial = reactionSerial
  if (effectPlan(machine).crowdBody.gain <= 0 || effectPlan(machine).celebration.gain > 0) return
  const bots = watcherBots(machine)
  const plan = crowdReactionPlan(score, machine.config, activeProfile(machine).celebrationEmote)
  const pool = plan.pool
  const reacting = Math.min(Math.ceil(Math.min(plan.reacting, bots.length) * effectPlan(machine).crowdBody.gain), bots.length)
  const emotes = [...pool].sort(() => Math.random() - 0.5)
  // The crowd's WORDS moved to the Show Director (`text-*` cards): the mood is
  // chosen from heat, the line is built from a grammar, and no two clients hear
  // a different room. Calling the old score-keyed picker from here as well would
  // put two bubbles on one NPC for one punch.
  // The fighter does not applaud its own punch. The reaction fires on the same
  // serial as the swing, so leaving the performer in this list overwrote the
  // hit clip with a clap on the very frame it should have landed.
  const performer = performingBot(machine)
  const reactors = bots.filter((bot) => bot !== performer)
  for (let index = 0; index < Math.min(reacting, reactors.length); index += 1) {
    const bot = reactors[index]!
    playBotEmote(bot, emotes[index % emotes.length]!, false)
    bot.stopEmoteAt = now + 3_500
  }
}

function updateHud(machine: PunchMachineRuntime, now: number): void {
  const nearby =
    playerNearMachine(machine) ||
    playerInZone(machine.config.audienceZoneId) ||
    playerInZone(machine.config.queueZoneId) ||
    playerInZone(machine.config.strikeZoneId)
  const snapshot = machine.network?.snapshot()
  if (!snapshot) {
    hud.visible = nearby || machine.soloPhase !== 'ready'
    hud.phase = machine.soloPhase
    hud.playerName = 'YOU'
    // THE BAR TELLS THE TRUTH ABOUT AN OVERHOLD. It used to be a raw ramp
    // clamped at 1, which kept reading 100% while the bleed was quietly taking
    // the punch apart. It is the scoring function itself now, so the bar falls
    // as the power does and the cost of waiting is visible while it is paid.
    hud.power01 = punchPowerQuality01(Math.min(machine.soloHeldMs, machine.config.idealChargeMs * 2), machine.config.idealChargeMs)
    hud.timingMarker01 = punchAttemptMarker01(
      punchTimingDisplayElapsedMs(machine.soloHeldMs, machine.soloPhase === 'charging'),
      machine.attemptInRound + 1,
      machine.soloChargeStartedAt,
      machine.config.idealChargeMs,
      activeProfile(machine)
    )
    hud.accuracy01 = machine.localAccuracy01
    hud.score = machine.soloTargetScore
    // Solo prints the target straight away — there is no count to spoil, and no
    // crowd to break down either, so the card this gates never draws here.
    hud.revealLanded = true
    // No count means no cut. Cleared rather than left alone, or a 999 thrown in
    // competition would leave the plate pulsing into the practice mode after it.
    hud.perfectCutSince = -1
    hud.perfectCutLit = false
    hud.result = machine.soloAttempt
    const soloStance = currentPunchStance(machine)
    hud.instruction =
      machine.soloPhase === 'charging'
        ? 'RELEASE WHEN POWER AND TIMING ALIGN'
        : soloStance.penaltyPercent > 0
          ? soloStance.cue
          : 'HOLD THE BAG TO CHARGE'
    return
  }
  const mine = snapshot.active?.userId === machine.localUserId
  // Charge feel is THIS DEVICE'S. Waiting on the HTTP snapshot made the glove
  // sit dead for a beat, then jump — and the marker the player released on was
  // the coordinator's late clock, not the one they held against.
  const locallyHolding = mine && machine.localCharging && !machine.localReleased
  const locallyThrown = mine && machine.localReleased
  const showingCharge = snapshot.phase === 'charging' || locallyHolding
  const chargeStartedAt =
    (locallyHolding || locallyThrown) && machine.localChargeStartedAt > 0
      ? machine.localChargeStartedAt
      : snapshot.chargeStartedAt
  // Same reload read in competition: the bar fills across the cooldown phase.
  hud.reload01 =
    snapshot.phase === 'cooldown'
      ? Math.max(
          0,
          Math.min(1, 1 - (snapshot.phaseEndsAt - now) / punchReloadMs(snapshot.score, snapshot.roundStreak))
        )
      : snapshot.phase === 'scoring'
        ? 0
        : 1
  const held =
    showingCharge && !locallyThrown
      ? (mine ? machine.localHeldMs : Math.max(0, now - snapshot.chargeStartedAt))
      : (locallyThrown ? machine.localHeldMs : 0)
  // The focus panel reaches further out than the punching radius, so a
  // meditator standing at the back of the deck still gets a HUD to read — and
  // so does one standing just beyond it, who needs to be told to come closer.
  hud.visible =
    nearby || hud.focusVisible || hud.focusOutOfRange || (mine && snapshot.phase !== 'waiting')
  hud.phase = locallyThrown ? 'scoring' : locallyHolding ? 'charging' : snapshot.phase
  hud.playerName = snapshot.active?.name ?? ''
  hud.power01 =
    (showingCharge || locallyThrown)
      ? punchPowerQuality01(Math.min(held, machine.config.idealChargeMs * 2), machine.config.idealChargeMs)
      : (snapshot.attempt?.power01 ?? 0)
  hud.timingMarker01 =
    (showingCharge || locallyThrown)
      ? punchAttemptMarker01(
          punchTimingDisplayElapsedMs(held, locallyHolding),
          snapshot.attemptsUsed + 1,
          chargeStartedAt,
          machine.config.idealChargeMs,
          activeProfile(machine)
        )
      : (snapshot.attempt?.timingMarker01 ?? 0)
  hud.accuracy01 = snapshot.attempt?.accuracy01 ?? (mine ? machine.localAccuracy01 : snapshot.chargeAccuracy01)
  if (snapshot.phase === 'scoring') {
    const since = now - (snapshot.phaseEndsAt - (snapshot.scorePhaseDurationMs ?? PUNCH_SCORE_PHASE_MS))
    const countMs = punchRevealCountMs(snapshot.score, activeProfile(machine))
    hud.score = revealShownScore(snapshot.score, since, activeProfile(machine))
    // THE CUT. On a 999 and nothing else, the count lands and then the world
    // goes out for 1.2 s — see `punchPerfectCutSince`. The plate keeps the
    // number and pulses it; `revealLanded` is what every other surface waits
    // on, so holding it here is what keeps the card, the arc's verdict and the
    // ledger out of a screen that is supposed to be empty.
    hud.perfectCutSince = punchPerfectCutSince(snapshot.score, since, countMs, machine.config)
    hud.perfectCutLit = punchPerfectCutLit(hud.perfectCutSince)
    hud.revealLanded = punchRevealSettled(snapshot.score, since, countMs, machine.config)
    if (hud.perfectCutSince >= 0) startPerfectCut(machine, snapshot.serial, now)
  } else {
    hud.perfectCutSince = -1
    hud.perfectCutLit = false
    hud.score = snapshot.score
    // Cooldown is AFTER the count: the breakdown belongs on screen for the whole
    // of it — and so does `ready`, the beat where the machine is waiting for the
    // player rather than the other way round. Anything earlier in the round has
    // no number to break down, and `focusAwardedScore` is zero there anyway, so
    // the card cannot draw itself over a turn that has not scored yet.
    hud.revealLanded = snapshot.phase === 'cooldown' || snapshot.phase === 'ready'
  }
  hud.result = snapshot.attempt
  const stanceCue = currentPunchStance(machine)
  hud.instruction =
    hud.phase === 'ready' && mine
      ? stanceCue.penaltyPercent > 0
        ? stanceCue.cue
        : 'CLICK AND HOLD THE BAG'
      : hud.phase === 'charging' && mine
        ? 'RELEASE WHEN THE MARKER CROSSES THE GOLD TARGET'
        : snapshot.phase === 'scoring' || snapshot.phase === 'cooldown'
          ? 'CROWD RESULT'
          : snapshot.active
            ? `WATCHING ${snapshot.active.name.toUpperCase()}`
            : 'STEP INTO THE QUEUE'
}

function spawnCelebration(machine: PunchMachineRuntime): void {
  const entity = engine.addEntity()
  Transform.create(entity, { parent: machine.root, position: Vector3.create(0, 3.45, 0.7) })
  ParticleSystem.create(entity, {
    active: true,
    rate: 90,
    maxParticles: 100,
    lifetime: 1.25,
    gravity: -1.4,
    additionalForce: Vector3.create(0, 1.1, 0),
    initialSize: { start: 0.04, end: 0.1 },
    sizeOverTime: { start: 1, end: 0.4 },
    initialVelocitySpeed: { start: 1.2, end: 2.8 },
    initialColor: { start: CYAN, end: Color4.fromHexString('#F3B82D') },
    // Fades out through gold. It faded out through RED, so the tail of every
    // celebration was a red drizzle — third of the three (owner, 2026-09-04).
    colorOverTime: { start: WARM_WHITE, end: Color4.create(1, 0.85, 0.4, 0) },
    billboard: true,
    loop: false,
    // LOCAL, not world: these sparks belong to the CABINET. World simulation
    // detaches a particle from its parent's frame the instant it is emitted, so
    // any discrepancy between where the machine's root sits and where its body
    // is drawn puts the burst somewhere else entirely — and "the fire effect
    // lands on me, across the island" is exactly what that looks like. Local
    // space makes the question unanswerable: they are drawn in the machine's
    // frame or not at all.
    simulationSpace: 0,
    texture: { src: 'images/fx-particle-smoke.png' },
    shape: ParticleSystem.Shape.Cone({ angle: 58, radius: 0.18 })
  })
  bursts.push({ entity, expiresAt: Date.now() + 1_800 })
}

/**
 * THE FIREBALL, ON THE CABINET — and the reason it is here and not anywhere else.
 *
 * A monster punch has always deserved fire. What it had instead was the dance
 * venue's host burst, reached through the crowd cue: `playSpectacleClimax` →
 * `triggerBurst('fire')`, which plants 180 additive particles three metres along
 * the LOCAL CAMERA'S forward vector in WORLD simulation space. Every spectator's
 * client therefore drew the fireball at that spectator's own feet, facing their
 * own view. Three rounds of fixes hardened the punch plugin's own particles and
 * never touched it, because the punch plugin never spawned it.
 *
 * So the effect moves to the one anchor that is identical on every client and
 * can never resolve to a bystander: the bag, in the machine root's LOCAL frame.
 * That is also where the puncher is standing, so a spectator sees the fire
 * happening around the person who actually threw it — which is the requirement,
 * reached without trusting any client to resolve an avatar.
 */
function spawnBagFireball(machine: PunchMachineRuntime): void {
  const entity = engine.addEntity()
  Transform.create(entity, { parent: machine.root, position: Vector3.create(0, 1.35, PUNCH_BAG_Z) })
  ParticleSystem.create(entity, {
    active: true,
    rate: 0,
    maxParticles: 200,
    lifetime: 1.5,
    // Negative gravity is LIFT: flames rise. Positive slams them into the deck.
    gravity: -0.85,
    additionalForce: Vector3.create(0, 3.2, 0),
    initialSize: { start: 0.5, end: 1 },
    sizeOverTime: { start: 1, end: 0.25 },
    initialVelocitySpeed: { start: 3.5, end: 7 },
    // A short warm fire burst, restored for the top rung. It is cabinet-local
    // and expires after 2.6 s; no avatar emote can carry it around the scene.
    initialColor: { start: Color4.create(1, 0.48, 0.08, 1), end: Color4.create(1, 0.97, 0.88, 1) },
    colorOverTime: { start: Color4.create(1, 0.97, 0.88, 1), end: Color4.create(1, 0.8, 0.3, 0) },
    billboard: true,
    loop: false,
    // LOCAL, for the same reason every other burst in this file is local: world
    // simulation cuts a particle loose from its parent's frame the instant it is
    // emitted, and any drift between where the root sits and where the body is
    // drawn puts the fire somewhere else on the island.
    simulationSpace: 0,
    texture: { src: 'images/fx-particle-dot.png' },
    shape: ParticleSystem.Shape.Cone({ angle: 22, radius: 0.7 }),
    bursts: { values: [{ time: 0, count: Math.round(120 * effectPlan(machine).fire.gain), cycles: 1 }] }
  })
  bursts.push({ entity, expiresAt: Date.now() + 2_600 })
}

/** How often a machine with no identity yet asks the player module again. */
const IDENTITY_RETRY_MS = 1_000
/**
 * How long it keeps asking. Comfortably past a slow realm handshake and a cold
 * profile fetch, and short enough that a guest is not left with a machine
 * pretending a queue is about to appear.
 */
const IDENTITY_WINDOW_MS = 120_000

/**
 * ‼️MULTIPLAYER STARTS WHEN THE PLAYER HAS A NAME, NOT WHEN THE SCENE LOADS.
 *
 * Called every frame for every machine and, in the overwhelming majority of
 * them, does nothing at all: the first guard is a null check on a field that is
 * set for the entire life of a healthy session.
 *
 * The one thing it must never do is start a SECOND network. `network` is
 * assigned before anything else can await, and it is the guard -- a machine that
 * has one is finished with this function forever.
 */
function adoptIdentity(machine: PunchMachineRuntime, now: number): void {
  if (machine.network) return
  if (machine.localUserId) return
  if (machine.identityUntil <= 0 || now > machine.identityUntil) return
  if (machine.config.mode !== 'competition') return
  if (!machine.config.queueZoneId || !machine.config.strikeZoneId) return
  if (now < machine.identityNextAt) return
  machine.identityNextAt = now + IDENTITY_RETRY_MS
  const player = getPlayer()
  const userId = (player?.userId ?? '').trim().toLowerCase()
  if (!userId) return
  machine.localUserId = userId
  machine.network = startPunchCompetitionNetwork({
    machineId: machine.id,
    userId,
    name: player?.name ?? 'Player',
    config: machine.config,
    houseBot: () => claimHouseBot(machine),
    focusBots: () => claimFocusBots(machine),
    isSceneHost: punchSceneHost,
    authority: punchAuthority().authority,
    serverId: punchAuthority().serverId,
    bus: punchAuthority().bus
  })
  machine.networkSince = now
  punchHttpBindUser(userId, machine.network.sessionId())
}

/**
 * The cabinet marquee while it is your turn -- and the one place the queue's cap
 * is allowed to surprise nobody.
 *
 * ‼️A CAP THE PLAYER MEETS WITHOUT WARNING READS AS A BUG. 'HIT 8 OF 8' looks
 * exactly like every other punch until the bag is taken away, so the last punch
 * under a queue ceiling says so out loud, and a round that came back from the
 * shelf opens by naming the streak it is defending rather than starting at
 * 'HIT 9' with no explanation of where punches one to eight went.
 */
/** What a 900+ on a gold ball pays: the NEXT rung of the ladder times the gold multiplier. */
function goldenPayout(machine: PunchMachineRuntime, streakIn: number): number {
  const rules = activeProfile(machine)
  const ladder = rules.multipliers[Math.min(Math.max(0, streakIn) + 1, rules.multipliers.length - 1)] ?? 1
  return Math.round(ladder * rules.goldenMultiplier * 10) / 10
}

function roundMarqueeText(snapshot: PunchCompetitionSnapshot): string {
  const next = Math.min(snapshot.attemptsUsed + 1, snapshot.attemptsAllowed)
  // The only thing left that can say LAST PUNCH is the runaway guard at 99, and
  // reaching it is a story of its own rather than a rule anybody is meant to hit.
  if (snapshot.attemptsAllowed >= snapshot.attemptsCeiling && next >= snapshot.attemptsAllowed) {
    return 'LAST PUNCH'
  }
  return `HIT ${next} OF ${snapshot.attemptsAllowed}`
}

/**
 * ‼️MY OWN ROW FOR THE ALL-TIME BOARD, and why it is not read off the board.
 *
 * The shared leaderboard is capped at `leaderboardSize`, so on a busy night it
 * simply does not contain everybody. Reading my score from it meant a player
 * outside the top rows submitted NOTHING -- the store recorded winners and
 * pretended everyone else had not turned up, which is exactly the complaint the
 * contest checklist opens with.
 *
 * My live round is the honest answer while I hold the bag. The board row is the
 * fallback for the rest of the night, when my best is behind me and the shared
 * ranking is the only place it still lives on this client.
 */
function myBoardEntry(
  machine: PunchMachineRuntime,
  snapshot: PunchCompetitionSnapshot
): PunchBoardEntry | undefined {
  const mine = snapshot.leaderboard.find((entry) => entry.userId === machine.localUserId)
  if (snapshot.active?.userId !== machine.localUserId) return mine
  if (snapshot.roundTotal <= 0) return mine
  const live: PunchBoardEntry = {
    userId: machine.localUserId,
    name: snapshot.active.name,
    score: snapshot.roundTotal,
    achievedAt: snapshot.roundStartedAt
  }
  return !mine || live.score >= mine.score ? live : mine
}

/** My round as the contest log records it, or null when none of it is mine. */
function myRoundResult(
  machine: PunchMachineRuntime,
  snapshot: PunchCompetitionSnapshot,
  now: number
): PunchRoundResult | null {
  if (snapshot.active?.userId !== machine.localUserId) return null
  const key = `${machine.id}:${machine.localUserId}:${snapshot.roundStartedAt}`
  if (myRoundPeak.key !== key) myRoundPeak = { key, streak: 0 }
  // The PEAK, not the live rung: a round that reached five and ended on a
  // fumble is a round that streaked, and the log has to say so.
  myRoundPeak.streak = Math.max(myRoundPeak.streak, snapshot.roundStreak)
  if (snapshot.roundTotal <= 0) return null
  return {
    machineId: machine.id,
    userId: machine.localUserId,
    name: snapshot.active.name,
    score: snapshot.roundTotal,
    attempts: snapshot.attemptsUsed,
    streak: myRoundPeak.streak,
    streakBonus: snapshot.roundStreakBonus,
    // What the room added to my round, off the coordinator's own tally.
    boostPoints: (snapshot.supporters ?? []).reduce((sum, row) => sum + row.points, 0),
    startedAt: snapshot.roundStartedAt,
    finishedAt: now,
    complete: snapshot.phase === 'summary'
  }
}

/** The shortest gap between two writes of the same in-progress support row. */
const SUPPORT_WRITE_THROTTLE_MS = 6_000

/**
 * ‼️WHAT I GAVE SOMEBODY ELSE'S ROUND -- the half of the contest record that
 * had nowhere to live.
 *
 * A supporter's whole contribution existed only on the live snapshot: cleared
 * with the round, gone with the session. So the people who make the crowd
 * mechanic work were, on paper, absent from the event.
 *
 * Read from `snapshot.supporters`, the coordinator's own tally for the round in
 * progress -- never from a live meter and never from a claim this client made
 * about itself -- and written by the SUPPORTER, because a person is the only
 * party entitled to claim their own help. The same trust rule the board obeys.
 */
function recordMySupport(
  machine: PunchMachineRuntime,
  snapshot: PunchCompetitionSnapshot,
  now: number
): void {
  const active = snapshot.active
  // Holding the bag is not supporting it.
  if (!active || active.userId === machine.localUserId) return
  const mine = (snapshot.supporters ?? []).find(
    (row) => row.userId === machine.localUserId
  )
  if (!mine || (mine.points <= 0 && mine.saves <= 0)) return
  const key = `${machine.id}:${active.userId}:${snapshot.roundStartedAt}`
  if (mySupportSent.key !== key) mySupportSent = { key, points: -1, saves: -1, at: 0 }
  const moved = mine.points !== mySupportSent.points || mine.saves !== mySupportSent.saves
  if (!moved) return
  // The round card is the moment the row matters most, and the moment the
  // player is most likely to walk away straight afterwards -- so it ignores the
  // throttle, and everything before it does not.
  const finishing = snapshot.phase === 'summary'
  if (!finishing && now - mySupportSent.at < SUPPORT_WRITE_THROTTLE_MS) return
  mySupportSent = { key, points: mine.points, saves: mine.saves, at: now }
  recordPunchSupport(
    resultsLog,
    {
      machineId: machine.id,
      userId: machine.localUserId,
      name: mine.name,
      forUserId: active.userId,
      forName: active.name,
      roundStartedAt: snapshot.roundStartedAt,
      points: mine.points,
      boosts: 0,
      saves: mine.saves
    },
    now
  )
}

function triggerAudience(machine: PunchMachineRuntime, score: number): void {
  if (!machine.network?.isCoordinator()) return
  const intensity = punchReactionIntensity(score, machine.config)
  const target = machine.config.audienceGroupId
    ? ({ kind: 'group', groupId: machine.config.audienceGroupId } as const)
    : machine.config.audienceZoneId
      ? ({ kind: 'zone', zoneId: machine.config.audienceZoneId } as const)
      : ({ kind: 'all' } as const)
  // 'punch', NOT 'host' — see CrowdReactionSource. The host prefix routes this
  // cue into playSpectacleClimax, which spawns its fire three metres in front of
  // whichever camera is reading it. The crowd reaction is what we came for; the
  // fire is spawned below by the cabinet, in the cabinet's own frame.
  triggerBreakdanceCrowdReaction('positive', intensity, target, 'punch')
}

function presentCompetitionState(machine: PunchMachineRuntime, now: number): void {
  const net = machine.network
  if (!net) return
  const snapshot = net.snapshot()
  const isMe = snapshot.active?.userId === machine.localUserId
  let shownScore = snapshot.score
  if ((snapshot.phase === 'charging' || (isMe && machine.localCharging)) && !(isMe && machine.localReleased)) {
    const held = isMe ? machine.localHeldMs : Math.max(0, now - snapshot.chargeStartedAt)
    const percent = Math.min(199, Math.round((held / machine.config.idealChargeMs) * 100))
    shownScore =
      machine.config.minScore + (machine.config.maxScore - machine.config.minScore) * Math.min(1, percent / 100)
    setText(machine.scoreText, String(percent).padStart(3, '0'))
  } else if (snapshot.phase === 'scoring' || (isMe && machine.localReleased)) {
    shownScore = revealShownScore(snapshot.score, now - (snapshot.phaseEndsAt - (snapshot.scorePhaseDurationMs ?? PUNCH_SCORE_PHASE_MS)), activeProfile(machine))
    setText(machine.scoreText, String(shownScore).padStart(3, '0'))
  } else if (snapshot.phase === 'summary') {
    // The round's total takes the big panel while the board holds it up.
    shownScore = snapshot.roundTotal
    setScoreDisplay(machine, String(snapshot.roundTotal))
  } else {
    // Between punches the big screen carries the ROUND, not a stale last hit.
    const resting = snapshot.roundTotal > 0 ? snapshot.roundTotal : snapshot.score || 0
    setText(machine.scoreText, String(resting).padStart(3, '0'))
  }
  updateIndicator(machine, shownScore)
  hud.screenCrack01 = Math.max(0, Math.min(1, ((machine.screenCrackUntil ?? 0) - now) / 650))

  const status =
    snapshot.phase === 'summary'
      ? `ROUND ${snapshot.roundTotal}`
      : snapshot.phase === 'waiting'
      ? 'HOLD THE BAG'
      : snapshot.phase === 'ready'
        ? isMe
          ? machine.goldenActive
            ? `GOLDEN BALL · 900+ PAYS x${hud.goldenPayout}`
            : roundMarqueeText(snapshot)
          : `${snapshot.active?.name.slice(0, 10) ?? 'PLAYER'} IS UP`
        : snapshot.phase === 'charging'
          ? isMe
            ? 'RELEASE'
            : 'CHARGING'
          : snapshot.phase === 'scoring'
            ? 'POWER'
            : // Cooldown: the number has landed, so the marquee may finally name
              // what it was worth. The streak banner outranks CHAMPION — anyone
              // can throw one 950, and the rung is the rarer thing to have seen.
              snapshot.streakBonus > 0
              ? `${snapshot.streakName} +${snapshot.streakBonus}`
              : snapshot.score >= machine.config.celebrationScore
                ? 'CHAMPION'
                : 'SCORE'
  setText(machine.statusText, status)

  // First person is the game: gloves up while charging and through the slam,
  // control back once the score has landed.
  if (isMe && (snapshot.phase === 'charging' || snapshot.phase === 'scoring')) {
    setPunchCamera(machine, 'first')
  } else if (machine.cameraMode !== 'none') {
    setPunchCamera(machine, 'none')
  }

  if (snapshot.revision === machine.lastRevision) return
  machine.lastRevision = snapshot.revision
  // The allowance grows at the punch, but the player only learns their score
  // when the count lands — so hold a 900's "+1 PUNCH" until the number is in.
  // A SAVE pays during the last-chance window (still `scoring`): that punch
  // already landed, and the extra swing is the whole point of the room working.
  if (snapshot.attemptsAllowed > machine.seenAllowed) {
    const savePaid = snapshot.phase === 'scoring' && !!snapshot.rescue && snapshot.streakSaved
    if (snapshot.phase === 'cooldown' || savePaid) {
      machine.seenAllowed = snapshot.attemptsAllowed
      announceExtraPunch(machine)
    }
  } else if (snapshot.attemptsAllowed < machine.seenAllowed) {
    machine.seenAllowed = snapshot.attemptsAllowed
  }
  // ‼️SAME GATE FOR THE STREAK, AND FOR THE SAME REASON: the coordinator settled
  // the rung the instant the punch was released, but the counter is still
  // crawling and no surface may name a number before the machine does. Keyed on
  // the SERIAL rather than the phase, so a rung is announced exactly once even
  // though this runs every frame the cooldown lasts.
  if (
    snapshot.phase === 'cooldown' &&
    snapshot.serial !== machine.seenStreakSerial &&
    snapshot.streakBonus > 0
  ) {
    machine.seenStreakSerial = snapshot.serial
    announceStreak(machine, snapshot.roundStreak, snapshot.streakBonus)
  }
  if (snapshot.phase === 'scoring' && machine.lastPresentedPhase !== 'scoring') {
    machine.glovePunchStartedAt = now
    // Arm swing is driven from glovePunchStartedAt in the system tick.
    const intensity = punchReactionIntensity(snapshot.score, machine.config)
    machine.armSwingAt = now + EMOTE_CONTACT_MS
    machine.armReturnMs = armReturnMs(snapshot.score, snapshot.roundStreak, activeProfile(machine))
    machine.slamPhaseAt = snapshot.scorePhaseStartedAt ?? now
    machine.slamAt = machine.slamPhaseAt + SLAM_DELAY_MS
    machine.slamIntensity = intensity
    machine.slamScore = snapshot.score
    machine.slamName = snapshot.active?.name ?? ''
    // Reveal (and any fireworks) belong to the moment the counter TOPS OUT,
    // not the moment the ball is struck — the crawl is the suspense.
    scheduleReveal(machine, snapshot.score, machine.slamPhaseAt + PUNCH_SCORE_HOLD_MS)
  }
  if (isMe && snapshot.phase === 'charging' && machine.lastPresentedPhase !== 'charging') {
    playSfx(machine, SFX_CHARGE, 0.45)
  }
  machine.lastPresentedPhase = snapshot.phase
}

function beginSolo(machine: PunchMachineRuntime, accuracy01 = 0.85): void {
  if (machine.soloPhase !== 'ready') return
  // A spent round starts over cleanly — attempts, total and best together.
  if (machine.attemptInRound >= machine.roundAttemptsAllowed) {
    machine.attemptInRound = 0
    machine.roundBest = 0
    machine.roundTotal = 0
    machine.roundStreak = 0
    machine.roundStreakBonus = 0
    machine.roundAttemptsAllowed = PUNCH_ROUND_ATTEMPTS
  }
  // The punch is played in first person, gloves up.
  setPunchCamera(machine, 'first')
  machine.soloPhase = 'charging'
  machine.soloHeldMs = 0
  machine.soloChargeStartedAt = Date.now()
  machine.localAccuracy01 = accuracy01
  machine.soloAttempt = null
  setText(machine.scoreText, '000')
  setText(machine.statusText, 'RELEASE')
  playSfx(machine, SFX_CHARGE, 0.45)
}

/**
 * THE SECRET. The bag keeps its idle spin while you charge; release while the
 * seam faces you and the aim channel is boosted. Nobody is told — the crowd's
 * lore whispers are the only clue. Folded into localAccuracy01 right at
 * release so solo, the coordinator and spectators all score the same inputs.
 */
function applySeamSecret(machine: PunchMachineRuntime): void {
  const yaw = ((Date.now() / 1000) * PUNCH_BAG_SPIN_DPS) % 360
  machine.localAccuracy01 = Math.min(1, machine.localAccuracy01 * punchSeamBoost(yaw))
}

/**
 * SECRET TWO — the Knock. Tap 1-3-1 at the machine and the next punch's
 * timing marker snaps 40% toward the sweet spot. The only tell is a low
 * rattle and a shiver: the bag "listens". SECRET THREE — the Twist. Hold F
 * through the charge (two hands in, one hand out) and an early release is
 * forgiven. Both fold into the submitted inputs at release, seam law.
 */
const KNOCK_TAP_WINDOW_MS = 2_500
const KNOCK_ARMED_MS = 15_000
const TWIST_CHORD_GRACE_MS = 400

function updateSecretInputs(machine: PunchMachineRuntime, now: number, charging: boolean): void {
  if (charging && inputSystem.isPressed(InputAction.IA_SECONDARY)) machine.twistFDownAt = now

  const key1 = inputSystem.isPressed(InputAction.IA_ACTION_3)
  const key3 = inputSystem.isPressed(InputAction.IA_ACTION_5)
  const tap1 = key1 && !machine.key1Held
  const tap3 = key3 && !machine.key3Held
  machine.key1Held = key1
  machine.key3Held = key3
  if (!playerNearMachine(machine)) {
    machine.knockStep = 0
    return
  }
  if (!tap1 && !tap3) return
  if (now - machine.knockTapAt > KNOCK_TAP_WINDOW_MS) machine.knockStep = 0
  machine.knockTapAt = now
  const expectOne = machine.knockStep !== 1
  if ((expectOne && tap1 && !tap3) || (!expectOne && tap3 && !tap1)) {
    machine.knockStep += 1
  } else {
    // A stray 1 can still open a fresh attempt; anything else resets cold.
    machine.knockStep = tap1 && !tap3 ? 1 : 0
    return
  }
  if (machine.knockStep < 3) return
  machine.knockStep = 0
  machine.knockArmedUntil = now + KNOCK_ARMED_MS
  // The bag answers: a low rattle and a shiver nothing else explains.
  playSfx(machine, SFX_RATTLE, 0.28)
  if (now >= machine.shakeUntil) {
    machine.shakeMag = 0.03
    machine.shakeUntil = now + 300
  }
}

/** Fold the armed secrets into the submitted inputs. One knock = one punch. */
function applySecretAssists(
  machine: PunchMachineRuntime,
  heldMs: number,
  marker01: number,
  now: number
): { heldMs: number; marker01: number; twist: boolean } {
  let held = heldMs
  let marker = marker01
  const twist = now - machine.twistFDownAt <= TWIST_CHORD_GRACE_MS
  if (twist) {
    held = punchTwistAssist(held, machine.config.idealChargeMs)
  }
  if (machine.knockArmedUntil > now) {
    machine.knockArmedUntil = 0
    marker = punchKnockAssist(marker, PUNCH_TIMING_TARGET_01)
  }
  return { heldMs: held, marker01: marker, twist }
}

/**
 * The Twist is the one secret spectators SEE: the strike becomes a two-handed
 * shove instead of a punch. Nobody at the rail can miss that something
 * different just happened — and the only place to learn it is the whisper rail.
 */
const TWIST_EMOTE = 'emotes/push_emote.glb'

/**
 * Let go of a competition punch. Factored out so the on-screen glove and the
 * 3D bag run the exact same code, and safe to call twice: the phase check
 * turns every call after the first into a no-op.
 */
function releaseNetworkPunch(machine: PunchMachineRuntime, now: number): void {
  const network = machine.network
  if (!network) return
  const snapshot = network.snapshot()
  if (snapshot.active?.userId !== machine.localUserId) return
  if (snapshot.phase !== 'charging' && !machine.localCharging) return
  if (machine.localChargeStartedAt > 0) {
    machine.localHeldMs = Math.max(0, now - machine.localChargeStartedAt)
  }
  machine.localCharging = false
  machine.localReleased = true
  hud.phase = 'scoring'
  // You showed up. Whatever this punch scores, the turn is no longer a no-show.
  machine.swungThisTurn = true
  applySeamSecret(machine)
  const secret = applySecretAssists(
    machine,
    machine.localHeldMs,
    // The coordinator recomputes this from the same attempt number AND the same
    // charge start, so both are read from the shared snapshot rather than guessed
    // locally — the sweep's reversals are seeded off `chargeStartedAt`.
    punchAttemptMarker01(
      machine.localHeldMs,
      snapshot.attemptsUsed + 1,
      machine.localChargeStartedAt || snapshot.chargeStartedAt,
      machine.config.idealChargeMs,
      activeProfile(machine)
    ),
    now
  )
  // The server scores the punch, but the emote has to fire NOW — estimate the
  // tier locally from the same inputs the server will use.
  //
  // ‼️THE CROWD AND THE BANK BELONG IN THE ESTIMATE. Without them a punch the
  // room carried from 700 to 1100 fired the emote of a 700 — the body would
  // have shrugged off the biggest hit of the night. The live circle is passed
  // as the ledger: it is the same shape, it is what the coordinator's committed
  // copy was built from a tick ago, and being a tick stale only ever costs a
  // tier at the boundary. The bank is this client's own and is exact.
  const estimate = punchScoreForAttempt(
    {
      heldMs: secret.heldMs,
      timingMarker01: secret.marker01,
      accuracy01: machine.localAccuracy01,
      boosts: snapshot.focus.circle,
      stancePower: currentPunchStance(machine).power,
      karma: hud.karmaBank
    },
    machine.config
  )
  void triggerSceneEmote({
    src: secret.twist
      ? TWIST_EMOTE
      : punchEmoteFor(estimate.score, machine.config, snapshot.chargeStartedAt),
    loop: false
  })
  network.releasePunch(secret.heldMs, secret.marker01, machine.localAccuracy01, currentPunchStance(machine).power)
}

/** Start a punch on this machine, however the player asked for it. */
function startPunchOn(runtime: PunchMachineRuntime, accuracy01: number): void {
  // Off the mark, the start is refused — the glove and the bag highlight only
  // appear in the strike disc, so a distant click is not a secret second door.
  if (!runtime.localCharging && !playerAtStrikeSpot(runtime)) return
  runtime.localAccuracy01 = Math.max(0, Math.min(1, accuracy01))
  if (runtime.network) {
    // Throwing a punch IS asking to play; the reconcile above does the sending.
    runtime.queueOptIn = true
    runtime.missedTurn = false
    runtime.missedTurnAt = 0
    runtime.queueIntent = 'player'
    const snapshot = runtime.network.snapshot()
    if (snapshot.active?.userId === runtime.localUserId && (snapshot.phase === 'ready' || snapshot.phase === 'charging')) {
      if (runtime.localCharging || runtime.localReleased) return
      runtime.localChargeStartedAt = Date.now()
      runtime.localHeldMs = 0
      runtime.localCharging = true
      runtime.localReleased = false
      hud.phase = 'charging'
      runtime.network.startCharge(runtime.localAccuracy01)
    }
  } else {
    beginSolo(runtime, runtime.localAccuracy01)
  }
}

/** The machine the player is standing at, if any. */
function machineForPlayer(): PunchMachineRuntime | null {
  for (const machine of machines) {
    if (playerNearMachine(machine, 6)) return machine
  }
  return null
}

/**
 * Aim granted to the on-screen glove. Clicking the bag can beat this by hitting
 * dead centre, so precision still pays; the glove is the dependable option, not
 * the better one.
 */
/**
 * THE BAG IS ONLY CLICKABLE ON YOUR OWN TURN.
 *
 * The hover text and the highlight are a promise that you may hit this thing.
 * Registered once at spawn, that promise was made to every spectator on the
 * deck for somebody else's round — an affordance pointing at a control they do
 * not have. It is armed and disarmed with the turn instead, so the machine
 * offers itself to exactly one person at a time.
 */
function armBagPointer(machine: PunchMachineRuntime): void {
  if (machine.bagArmed) return
  machine.bagArmed = true
  pointerEventsSystem.onPointerDown(
    {
      entity: machine.hitbox,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: 'Hold — release on the timing target',
        maxDistance: PUNCH_STANCE_RADIUS + 0.7,
        showFeedback: true
      }
    },
    (event) => {
      const hit = event.hit?.position
      const center = getWorldPosition(engine, machine.hitbox)
      const dx = hit ? Math.abs(hit.x - center.x) / 0.48 : 0.2
      const dy = hit ? Math.abs(hit.y - center.y) / 0.64 : 0.2
      // Hitting the bag dead centre is worth more than the glove's flat rate.
      startPunchOn(machine, 1 - Math.sqrt(dx * dx + dy * dy))
    }
  )
}

function disarmBagPointer(machine: PunchMachineRuntime): void {
  if (!machine.bagArmed) return
  machine.bagArmed = false
  pointerEventsSystem.removeOnPointerDown(machine.hitbox)
}

const GLOVE_ACCURACY_01 = 1

/**
 * Should the glove be on screen at all?
 *
 * In a COMPETITION the answer is "only on your own turn". The old test read the
 * round phase and nothing else, so a nine-metre deck full of spectators all saw a
 * PUNCH button during somebody else's round — the button is the whole promise that
 * you may hit the bag, and it was lying to everyone but one person.
 */
export function punchGloveVisible(): boolean {
  const machine = machineForPlayer()
  if (!machine) return false
  if (machine.network) {
    const snapshot = machine.network.snapshot()
    if (!snapshot.active || snapshot.active.userId !== machine.localUserId) return false
    if (machine.localReleased) return false
    const myTurn = snapshot.phase === 'ready' || snapshot.phase === 'charging' || machine.localCharging
    if (!myTurn) return false
    if (machine.localCharging || snapshot.phase === 'charging') return true
    return playerAtStrikeSpot(machine)
  }
  if (machine.soloPhase === 'charging') return true
  if (machine.soloPhase !== 'ready') return false
  return playerAtStrikeSpot(machine)
}

/** Glove pressed — begin the charge. */
export function punchGlovePress(): void {
  const machine = machineForPlayer()
  if (machine) startPunchOn(machine, GLOVE_ACCURACY_01)
}

/** Glove released — throw the punch. */
export function punchGloveRelease(): void {
  const machine = machineForPlayer()
  if (!machine) return
  if (machine.network) releaseNetworkPunch(machine, Date.now())
  else releaseSolo(machine)
}

/**
 * SPECTATOR FOCUS — the crowd's half of the game.
 *
 * Everyone on the deck who is not holding the bag can meditate for whoever is.
 * The control is E, the same key the Explorer uses for "interact" everywhere
 * else, chosen because it is the one input that works with the cursor LOCKED —
 * a spectator watching the punch does not have a free mouse, and a mechanic
 * that demanded one would go unused. Touch gets the same thing as an on-screen
 * button, so a phone is not shut out.
 *
 * Tap it and three things happen at once: the avatar raises a hand to its
 * temple, this client's meter jumps, and one tiny message tells the coordinator
 * the same. The meter bleeds down on its own, so the whole skill is rhythm —
 * and the band is narrower than one tap, which is why a lone meditator wobbles
 * through it rather than sitting in it. The fix is other people; see the
 * contract for why the mean does the work.
 */

/**
 * The pose. The intent is a two-fingers-to-the-temple concentration loop, and
 * this constant is where that GLB will plug in — drop it into scene/emotes/ and
 * register it in shared/emote-library.ts and the check below switches over with
 * no other change. Until then the bundled library genuinely has nothing that
 * reads as "focusing", so the fallback is the base-avatar raise-hand: a hand up
 * beside the head, which is at least the right silhouette.
 */
const FOCUS_EMOTE_SRC = 'emotes/meditate_focus_emote.glb'
const FOCUS_BASE_EMOTE = 'raiseHand'
const FOCUS_EMOTE_BUNDLED = bundledEmotePaths().includes(FOCUS_EMOTE_SRC)
/**
 * What the flanking regulars are armed with. EMPTY when the clip did not ship,
 * which is not the same as broken: an unbundled path arms nothing, so the pose
 * falls back to the base emote the player's own fallback uses. A base emote
 * needs no slot and cannot be armed, so it also cannot lease the body — the
 * crowd will overwrite it, and that is the honest degradation.
 */
const CHANNEL_BOT_EMOTES: readonly string[] = FOCUS_EMOTE_BUNDLED ? [FOCUS_EMOTE_SRC] : []
/** The avatar re-composes on a slow beat; firing per tap would be a twitch. */
const FOCUS_EMOTE_EVERY_MS = 2_400

function playFocusEmote(): void {
  // Hold the pose. Re-firing the one-shot every beat restarted the arms
  // from idle, which read as waving. Loop it; Explorer cancels on walk.
  void triggerSceneEmote({ src: FOCUS_EMOTE_SRC, loop: true }).catch(() => {
    void triggerEmote({ predefinedEmote: FOCUS_BASE_EMOTE })
  })
}

/**
 * The machine a spectator can meditate at. A wider reach than the punching
 * radius on purpose: the ring of people watching stands further back than the
 * one person at the bag, and the audience zone counts however far it runs.
 */
function focusMachineForPlayer(): PunchMachineRuntime | null {
  for (const machine of machines) {
    if (!machine.network) continue
    if (
      playerNearMachine(machine, PUNCH_FOCUS_RANGE_M) ||
      playerInZone(machine.config.audienceZoneId)
    ) {
      return machine
    }
  }
  return null
}

/**
 * Is there anything to meditate for? Someone has to be holding the bag, and it
 * cannot be us — you do not get to boost your own punch. Every other phase of
 * a live round counts, including the reveal and the reload: dropping the circle
 * between punches would mean it never survived to the next one.
 */
function canFocus(machine: PunchMachineRuntime): boolean {
  const snapshot = machine.network?.snapshot()
  if (!snapshot?.active) return false
  if (snapshot.active.userId === machine.localUserId) return false
  return snapshot.phase !== 'waiting'
}

/**
 * The other half of the same question: a live round that IS mine. Not a thing I
 * can meditate for, but very much a thing I should be able to watch — the pill
 * runs read-only for whoever is holding the bag.
 */
function focusIsForMe(machine: PunchMachineRuntime): boolean {
  const snapshot = machine.network?.snapshot()
  if (!snapshot?.active) return false
  return snapshot.active.userId === machine.localUserId && snapshot.phase !== 'waiting'
}

/**
 * ONE BOOST BEAT, however the spectator asked for it (key or button).
 *
 * ‼️There is exactly one crowd action now. The old signature took a side and
 * the whole mechanic branched on it; if you are adding a parameter back here,
 * check the dormant `PunchFocusSide` in the contract first — Jinx was removed
 * deliberately, not by accident.
 */
/**
 * THIS CLIENT'S RING for the save in progress. `at` is the rescue's start,
 * so a new fumble gets a new ring; `claimed` means the hold went out.
 */
/**
 * THE SAVE IS A HOLD. Owner, 2026-09-08: "the fumble mechanics -- I don't
 * understand how it works, it's too complicated: a weird circle and three
 * dots and you don't know what to do. It needs to be simple, it needs to tell
 * you what to click, it needs a sound when it's on so you know your attention
 * is required, and it needs to disconnect you from what's going on -- suddenly
 * it's your game."
 *
 * ‼️SUPERSEDED 2026-09-08 BY THE BAND, and the reason is worth keeping. The
 * circle-you-hold that answered the note above was then found to be *"way too
 * easy — it's never ending and the person keeps on hitting"*: a hold is legible
 * but it is barely a test, and the 12-tap meter that briefly replaced it was
 * worse, because hammering satisfied it in under a second.
 *
 * What ships is a LANE: a marker sweeps, a press inside the gold band is +1 and
 * a press outside it is -1. The demands above are all still met — one
 * instruction, a horn on open, the music ducked, a veil over everything else —
 * and "you don't know what to do" is answered by the band itself rather than by
 * a caption, because a standing gold zone with a runner crossing it says *press
 * here* without a word. `rescueSkill` keeps the hold available as an option.
 *
 * The coordinator scores it in `punchRescueClaim`. The old `punchRescueClaimOk`
 * is unreferenced by the runtime and kept only for its own test and for a
 * client on a build that still sends a bare count.
 */
const SFX_RESCUE_OPEN = 'sounds/punch/turn-last.mp3'
const SFX_RESCUE_TAP = 'sounds/punch/score-tally.mp3'
/**
 * ‼️`stamps` IS WHAT MAKES THE SAVE A SKILL TEST AND `taps` IS ONLY THE SCORE.
 *
 * The elapsed of every press, kept so the claim can carry the times the player
 * actually saw and the coordinator can re-score them with the same function
 * that drew the band. `net` is the running score under the band rule — a press
 * inside is +1, a press outside is -1, floored at zero — so hammering visibly
 * goes backwards on the player's own meter, which is the lesson.
 *
 * `lastHit` drives the flash and lets the panel say WHY the number moved
 * without printing a word about it.
 */
let rescueInput:
  | { at: number; taps: number; net: number; claimed: boolean; lastTapAt: number; pulse: number; stamps: number[]; lastHit: boolean; heldMs: number
      /** THE PUSH: this client's own copy of the focus meter, and its last grade. */
      accepted: boolean; level: number; lastStamp: number; quality01: number }
  | null = null
const freshRescueInput = (at: number) =>
  ({ at, taps: 0, net: 0, claimed: false, lastTapAt: 0, pulse: 0, stamps: [] as number[], lastHit: false, heldMs: 0,
     accepted: false,
     // ★★★ OPENS IN THE GREEN, matching punchPushReplay's own first line. A
     // client that started at 0 while the payout started on target would draw a
     // marker climbing towards points it had already been given.
     level: PUNCH_PUSH_START_AT_TARGET ? punchPushTargetAt(0) : 0,
     lastStamp: 0, quality01: 0 })

/**
 * ‼️ONE KEY, TWO GAMES, AND RESCUE ALWAYS WINS IT.
 *
 * Focus and the Fumble Rescue both want E, and they cannot collide by accident:
 * a rescue window is a few seconds long, it is the only thing on screen while it
 * is open, and it is offered to exactly the people Focus is NOT for — spectators
 * off the queue. So the rule is priority, not a mode: while a window is live the
 * key is the save's, and every other moment it is Focus's, if Focus is on at all.
 *
 * Written as one exported entry point rather than two call sites, because the
 * ordering IS the rule and a second caller that got it backwards would be a bug
 * nobody could see — the two games look identical from the keyboard.
 */
export function punchPrimaryPress(): void {
  const machine = focusMachineForPlayer()
  if (!machine?.network) return
  const now = Date.now()
  const round = machine.network.snapshot()
  const rescue = round.rescue
  const self = round.active?.userId === machine.localUserId
    || round.queue.some(row => row.userId === machine.localUserId)
  // The puncher does not play the save. E stays punch/focus on their turn.
  if (rescue && !self && now >= rescue.announcedAt && now <= rescue.endsAt) { punchRescuePress(); return }
  if (activeProfile(machine).focusEnabled) punchFocusPress()
}

/**
 * One meditation beat, when the Focus game is on.
 *
 * Restored from `0f094b96^` unchanged except for its guard: it no longer has to
 * check for a live rescue itself, because `punchPrimaryPress` above settles that
 * before it ever gets here, and a second copy of a priority rule is how the two
 * halves of one decision drift apart.
 */
export function punchFocusPress(): void {
  const machine = focusMachineForPlayer()
  if (!machine?.network || !canFocus(machine)) return
  if (!activeProfile(machine).focusEnabled) return
  const now = Date.now()
  // Dropped outright inside the cooldown — see the contract for why this is not
  // a wire-only throttle.
  if (now - machine.focusLastTapAt < PUNCH_FOCUS_TAP_COOLDOWN_MS) return
  machine.focusLevel01 = punchFocusTap(machine.focusLevel01)
  machine.focusLastTapAt = now
  machine.network.focusTap()
  emitFocusWave(machine.localUserId, true)
  if (now >= (machine.celebrationUntil ?? 0) && now - machine.focusEmoteAt >= FOCUS_EMOTE_EVERY_MS) {
    machine.focusEmoteAt = now
    playFocusEmote()
  }
}

/**
 * ‼️THE ADMIN CHIP, AND WHY THE GAME HAS ONE AT ALL.
 *
 * The Fumble Rescue is the only mechanic here that a person cannot choose to
 * play. It opens on somebody ELSE'S last punch, under 900, on a live streak,
 * with a spectator watching and a save still unspent — so the observer's half
 * of the game has always been shipped on a reading of the code rather than on a
 * turn at it. This is the door: an allowlisted wallet gets one chip nobody else
 * in the room can see, and it arms the next fumble whatever the gates say.
 *
 * Visible ONLY to `adminIds` in the director profile, and the press is checked
 * again on the coordinator — see `handleAdmin`. An empty list, which is what
 * every scene ships with, means the chip does not exist for anyone.
 */
const MAIN_ADMIN_WALLET = '0x23be90335e79d3245615985d91f69814f98a0fab'

export function punchIsMainAdmin(userId?: string | null): boolean {
  if (!userId) return false
  const clean = userId.trim().toLowerCase()
  if (clean === MAIN_ADMIN_WALLET.toLowerCase()) return true
  const hosts = getSocialConfig()?.event.adminWallets ?? []
  if (hosts.length > 0 && hosts[0]?.trim().toLowerCase() === clean) return true
  return false
}

function punchSceneHost(userId: string): boolean {
  const hosts = getSocialConfig()?.event.adminWallets ?? []
  const isHost = hosts.length > 0 && isSocialAdminWallet(userId, hosts)
  return isHost && punchIsMainAdmin(userId)
}

export function punchAdminVisible(): boolean {
  const machine = focusMachineForPlayer()
  if (!machine?.network) return false
  const rules = activeProfile(machine)
  if (!rules.adminToolsEnabled) return false
  return (punchSceneHost(machine.localUserId) || punchIsAdmin(rules, machine.localUserId)) && punchIsMainAdmin(machine.localUserId)
}

/** Is an arm currently standing? Read off the snapshot, so it survives a reload. */
export function punchAdminRescueArmed(): boolean {
  const machine = focusMachineForPlayer()
  if (!machine?.network) return false
  return machine.network.snapshot().forceRescueNext === true
}

/**
 * Toggle the arm. A second press disarms rather than re-arming, because the one
 * thing an admin cannot see from the chip is whether the last press arrived —
 * so the chip has to be able to say both states and take back either.
 */
export function punchAdminToggleRescue(): void {
  const machine = focusMachineForPlayer()
  if (!machine?.network) return
  if (!punchAdminVisible()) return
  const armed = machine.network.snapshot().forceRescueNext === true
  machine.network.armRescue(!armed)
  playSfx(machine, SFX_RESCUE_TAP, 0.7, 'machine', armed ? 0.9 : 1.5)
}

/** The only spectator input: fill an active Fumble Rescue meter. */
export function punchRescuePress(): void {
  const machine = focusMachineForPlayer()
  if (!machine?.network) return
  const now = Date.now()
  const round = machine.network.snapshot()
  const rescue = round.rescue
  const queued = round.active?.userId === machine.localUserId || round.queue.some(row => row.userId === machine.localUserId)
  const skill = rescue?.skill ?? 'band-taps'
  const isPush = skill === 'push'
  if (!rescue || queued || rescue.winner || now > rescue.endsAt) return
  // THE ASK IS PRESSABLE, and only for the push: the other shapes use the gap
  // before `startsAt` to say "get ready", so a press there is a mis-click. The
  // push uses it to ask the room a question, and the press is the answer.
  if (now < (isPush ? rescue.announcedAt : rescue.startsAt)) return
  const alreadyIn = !!rescueInput?.accepted
    || !!(rescue.pushAccepted?.includes(machine.localUserId))
  if (isPush && punchRescuePromptsMuted() && !alreadyIn) return
  if (!rescueInput || rescueInput.at !== rescue.startsAt) rescueInput = freshRescueInput(rescue.startsAt)
  if (isPush && now < rescue.startsAt) {
    if (rescueInput.accepted) return
    rescueInput.accepted = true
    rescueInput.pulse += 1
    playSfx(machine, SFX_RESCUE_TAP, 0.9, 'machine', 1.5)
    // An empty claim: the coordinator reads a message arriving before `startsAt`
    // as a YES and puts them in `pushAccepted`.
    machine.network.rescueTap(0, [])
    return
  }
  if (rescueInput.claimed) return
  const cooldown = isPush ? PUNCH_PUSH_TAP_COOLDOWN_MS : PUNCH_RESCUE_TAP_COOLDOWN_MS
  if (now - rescueInput.lastTapAt < cooldown) return
  const elapsed = now - rescue.startsAt
  rescueInput.lastTapAt = now
  rescueInput.stamps.push(elapsed)
  rescueInput.pulse += 1
  if (isPush) {
    // THE SAME TWO FUNCTIONS THE COORDINATOR REPLAYS. Running them here is not
    // a second source of truth -- it is the identical pure code twice, so the
    // meter the thumb sees is the meter the payout is computed from.
    const people = Math.max(1, rescue.pushAccepted?.length ?? 1)
    rescueInput.level = punchFocusDecay(rescueInput.level, elapsed - rescueInput.lastStamp,
      PUNCH_PUSH_DECAY_SCALE * punchFocusGustAt(rescueInput.lastStamp))
    if (rescueInput.level <= PUNCH_FOCUS_FLOOR_01) rescueInput.level = 0
    rescueInput.lastStamp = elapsed
    rescueInput.level = Math.min(PUNCH_FOCUS_CEILING, punchFocusTap(rescueInput.level))
    rescueInput.quality01 = punchPushQuality01(rescueInput.level, people, punchPushTargetAt(elapsed), round.roundRescues ?? 0)
    rescueInput.lastHit = rescueInput.quality01 > 0.5
    rescueInput.accepted = true
    // In the green it has to SOUND like a hit. Outside yellow it has to sound
    // like a miss — that difference is the only reason the number stops.
    if (rescueInput.quality01 >= 0.999) {
      playSfx(machine, SFX_RESCUE_TAP, 0.95, 'machine', 1.35)
    } else if (rescueInput.quality01 > 0) {
      playSfx(machine, SFX_RESCUE_TAP, 0.4 + 0.4 * rescueInput.quality01,
        'machine', 0.8 + 0.4 * rescueInput.quality01)
    } else {
      playSfx(machine, SFX_RESCUE_TAP, 0.14, 'machine', 0.48)
    }
    machine.network.rescueTap(rescueInput.stamps.length, rescueInput.stamps)
    return
  }
  if (skill === 'closest-shot') {
    // ‼️ONE PRESS EACH, AND IT IS SENT IMMEDIATELY EVEN THOUGH IT CANNOT WIN
    // HERE. The contest is settled at the end of the window by the coordinator
    // comparing everybody, so the only job on this side is to get the reading
    // there — and to stop the player pressing again, which `claimed` does.
    rescueInput.claimed = true
    rescueInput.lastHit = punchRescueInBand(elapsed, rescue.band01)
    rescueInput.taps = 1
    playSfx(machine, SFX_RESCUE_TAP, 0.85, 'machine', 1.4)
    machine.network.rescueTap(1, rescueInput.stamps)
    return
  }
  // THE BAND RULE, RUN LOCALLY SO THE METER MOVES ON THE FRAME OF THE PRESS.
  // The coordinator will re-derive exactly this from `stamps`; running it here
  // too is not a second source of truth, it is the same function twice.
  const hit = punchRescueInBand(elapsed, rescue.band01)
  const need = Math.max(1, rescue.bandTapsRequired ?? PUNCH_RESCUE_BAND_TAPS)
  rescueInput.lastHit = hit
  rescueInput.net = hit ? rescueInput.net + 1 : Math.max(0, rescueInput.net - 1)
  rescueInput.taps = rescueInput.net
  // ‼️A MISS SOUNDS WRONG. It is the only feedback a hammering player gets that
  // says the thing they are doing is the reason the bar is going down.
  playSfx(machine, SFX_RESCUE_TAP, hit ? 0.35 + 0.55 * rescueInput.net / need : 0.5,
    'machine', hit ? 0.95 + 0.75 * rescueInput.net / need : 0.55)
  if (rescueInput.net >= need) {
    rescueInput.claimed = true
    machine.network.rescueTap(rescueInput.net, rescueInput.stamps)
  }
}

/**
 * Step this client's own copy of the meter and publish what the panel draws.
 * Runs every frame, before updateHud, because the panel's visibility is one of
 * the things that decides whether the HUD is on screen at all.
 */
function updateSpectatorFocus(machine: PunchMachineRuntime, now: number, dtMs: number): void {
  const network = machine.network
  const snapshot = network?.snapshot()
  const watchable = !!network && canFocus(machine)
  // Mine to watch, not to drive — and only worth the strip of screen once
  // somebody is actually meditating, or it is an empty bar shown to a player
  // who has no way to fill it.
  const readOnly =
    !!network && focusIsForMe(machine) && (snapshot?.focus.meditators ?? 0) > 0
  const inRange =
    playerNearMachine(machine, PUNCH_FOCUS_RANGE_M) ||
    playerInZone(machine.config.audienceZoneId)
  // Standing too far back is the one failure the panel cannot show by
  // disappearing — that reads as "there is no such feature". Say it instead.
  hud.focusOutOfRange =
    watchable && !inRange && playerNearMachine(machine, PUNCH_FOCUS_RANGE_M * 2)
  // Set before anything can return: the person the crowd just Boosted is by
  // definition NOT eligible to Boost, and they are the one who most needs to
  // see the card. Leaving this inside the spectator branch hid it from them.
  //
  // ‼️Every reader of the result card takes it from HERE, off the authoritative
  // attempt, so the puncher, each booster and a bystander all read one story.
  //  ‼️THE CARD OUTLIVES THE RELOAD, BECAUSE THE RELOAD IS NOT A READING BEAT.
  //
  // Owner, 2026-09-06: "the summary of the score on the left appears and
  // disappears so fast you cannot read it". Measured, the card was up for
  // `PUNCH_SCORE_LINGER_MS` plus `punchReloadMs` — and the reload SHRINKS with
  // score and streak, to a 640 ms floor. So the card's read time was 2.3 s after
  // a bad punch and 1.24 s after a 997 on a streak: the better the punch, the
  // less of its own breakdown the puncher was allowed to see. Five rows cannot
  // be read in 1.24 s by anyone.
  //
  // The fix is NOT to lengthen the reveal. `punch-hot-reload.test.ts` pins HOLD,
  // COUNT and LINGER as constants, and the reload was deliberately cut on
  // 2026-09-05 for "too little action" — re-inflating either would undo that.
  // Instead the card keeps its own copy and stays up through `ready`, which is
  // dead time the player already owns. Start the next punch and it goes: the
  // reader gets to read, and the fast player is not held up for a millisecond.
  const live = snapshot?.attempt ?? null
  if (live) machine.lastAwarded = live
  else if (snapshot?.phase !== 'ready') machine.lastAwarded = null
  // ‼️AND HELD FOR A READABLE MINIMUM, ACROSS THE HANDOVER. Owner, 2026-09-06,
  // again: *"it appears and disappears too fast"*. The kept copy above only
  // ever reached the screen while the round sat in `ready` — after the LAST
  // punch of a turn the bag moves on within a second and the card went with
  // it. This pins the puncher's own card for `PUNCH_CARD_HOLD_MS` from the
  // moment the count lands, whatever phase the round moves to and whoever is
  // up next; starting your own next punch is the one early dismissal.
  const cardMine = snapshot?.active?.userId === machine.localUserId
  const cardSerial = snapshot?.serial ?? 0
  if (live && cardMine && hud.revealLanded && live.score > 0 && machine.cardSerial !== cardSerial) {
    machine.cardSerial = cardSerial
    machine.cardAttempt = live
    machine.cardShownAt = now
  }
  if (
    machine.cardAttempt &&
    ((cardMine && snapshot?.phase === 'charging') || now - machine.cardShownAt > PUNCH_CARD_HOLD_MS)
  ) {
    machine.cardAttempt = null
  }
  hud.cardHeld = machine.cardAttempt !== null
  const awarded = machine.cardAttempt ?? live ?? machine.lastAwarded
  hud.focusAwardedBase = awarded?.baseScore ?? 0
  hud.focusAwardedSkill = awarded?.skillScore ?? 0
  hud.focusAwardedKarmaMult = awarded?.karmaMultiplier ?? 1
  hud.focusAwardedPower01 = awarded?.power01 ?? 0
  hud.focusAwardedTiming01 = awarded?.timing01 ?? 0
  hud.focusAwardedAccuracy01 = awarded?.accuracy01 ?? 0
  hud.focusAwardedMissedPower = awarded?.missedPower ?? 0
  hud.focusAwardedMissedTiming = awarded?.missedTiming ?? 0
  hud.focusAwardedMissedAim = awarded?.missedAim ?? 0
  hud.focusAwardedKarmaGain = awarded?.karmaGain ?? 0
  hud.focusAwardedKarmaClipped = awarded?.karmaClipped ?? 0
  hud.focusAwardedStanceLost = awarded?.stanceLost ?? 0
  hud.focusAwardedKarmaSpent = awarded?.karmaSpent ?? 0
  hud.focusAwardedCrowdTrimmed = awarded?.crowdTrimmed ?? 0
  hud.focusAwardedAssist01 = awarded?.crowdAssist01 ?? 0
  hud.focusAwardedBoost = awarded?.crowdBoost ?? 0
  hud.focusAwardedBoosts = awarded?.boosts ?? []
  hud.focusAwardedScore = awarded?.score ?? 0
  hud.focusHighGround = awarded?.highGround ?? false
  hud.focusHighGroundEvent = awarded?.highGroundEvent ?? ''
  hud.circleBest = awarded?.circleBest ?? null
  hud.focusAwardedFocusUsed = awarded?.focusUsed ?? 0
  /**
   * ‼️THE FOCUS SWITCH, AND WHY IT IS A RETURN RATHER THAN A DELETION.
   *
   * Everything below this line is the Focus game. `0f094b96` switched it off by
   * putting a bare `return;` here and deleting its sixteen tests, which left the
   * whole mechanic in the file as unreachable code — a deletion that could not
   * be undone from anywhere except a code edit. Owner, 2026-09-08: *"I want to
   * bring it back but I want to put it behind the toggle so we can switch it on
   * and off at will and we should be able to manage it in the director space."*
   *
   * So the `return` stays and gets a condition. OFF is byte-for-byte the game
   * that shipped tonight — the fields below are zeroed and nothing downstream
   * simulates, scores, draws or transmits a meter. ON runs the same code that
   * ran before it was cut.
   *
   * ‼️THE RESULT-CARD FIELDS ABOVE THIS COMMENT ARE NOT PART OF THE SWITCH.
   * They are named `focusAwarded*` for historical reasons only; they describe
   * the punch that just landed and every surface in the game reads them. Moving
   * one below this line blanks the breakdown card.
   */
  if (!activeProfile(machine).focusEnabled) {
    hud.focusVisible = false
    hud.focusOutOfRange = false
    hud.focusActive = false
    hud.focusReadOnly = false
    hud.focusLevel01 = 0
    hud.focusCrowd01 = 0
    hud.focusBoostPoints = 0
    hud.focusHumanBoostPoints = 0
    hud.focusMeditators = 0
    hud.focusCircle = []
    hud.prepFocus = 0
    hud.prepMomentum = false
    hud.prepQueued = false
    hud.crowdAssist01 = 0
    hud.timingSweetWidth01 = punchTimingSweetWidth01(0)
    return
  }
  // ‼️SET BEFORE ANY BRANCH CAN RETURN, because all three of them need it: the
  // window the crowd bought belongs to the punch, not to the person reading it.
  // The puncher aims inside it, a booster is watching what they just widened,
  // and a bystander is watching the room do it.
  hud.crowdAssist01 = snapshot?.focus.assist01 ?? 0
  hud.timingSweetWidth01 = punchTimingSweetWidth01(hud.crowdAssist01)
  // The bank is the one number that outlives the turn — read for whoever this
  // client is, in every branch, so the pill can promise a booster their next
  // punch even while they are still working on somebody else's.
  hud.karmaBank =
    snapshot?.karma.find((entry) => entry.userId === machine.localUserId)?.karma ?? 0
  hud.karmaMultiplier = punchKarmaSelfMultiplier(hud.karmaBank)
  // PREPARATION, mine, off the authoritative snapshot — the same row the
  // balloons, the card and the golden ball read.
  const myPrep = snapshot?.prep?.find((entry) => entry.userId === machine.localUserId)
  hud.prepFocus = myPrep?.focus ?? 0
  hud.prepMomentum = myPrep?.momentumReady ?? false
  hud.coachUserId = activeProfile(machine).coachUserId
  hud.prepQueued =
    !!snapshot &&
    (snapshot?.active?.userId === machine.localUserId || snapshot?.queue.some((entry) => entry.userId === machine.localUserId) === true)
  // THE DRIFT CLOCK, before any branch reads a target off it. Glide locally,
  // snap to the coordinator whenever the snapshot carries a phase we have not
  // already taken — see `focusDriftMs`. Both branches below need the band, so
  // this cannot live inside either of them.
  machine.focusDriftMs = punchFocusDriftAdvance(machine.focusDriftMs, dtMs)
  const wirePhase = snapshot?.focus.driftMs ?? Number.NaN
  if (typeof wirePhase === 'number' && wirePhase !== machine.focusDriftSeenMs) {
    machine.focusDriftSeenMs = wirePhase
    machine.focusDriftMs = wirePhase
  }
  hud.focusTarget01 = punchFocusTargetAt(machine.focusDriftMs)
  // Read off the SAME phase as the target, so the weather a client feels in its
  // own predicted meter is the weather the coordinator applied to the copy that
  // pays. One clock, two effects, nothing extra on the wire.
  const gust = punchFocusGustAt(machine.focusDriftMs)
  hud.focusGust = gust
  const eligible = watchable && inRange
  if (!eligible && readOnly) {
    // The puncher's readout. No local meter to step: everything on it is the
    // crowd's, straight off the coordinator's aggregate.
    // Stepping up to the bag LEAVES the circle. Without this the read-only
    // branch returns before the exit message, and the coordinator keeps a
    // meditator who is now the one being meditated for.
    if (machine.focusLastTapAt > 0) {
      machine.focusLastTapAt = 0
      machine.focusLevel01 = 0
      network?.focusStop()
    }
    const crowd = snapshot?.focus
    hud.focusVisible = true
    hud.focusReadOnly = true
    hud.focusActive = false
    hud.focusLevel01 = 0
    hud.focusCrowd01 = crowd?.level01 ?? 0
    // The HUMANS' band — the regulars no longer widen it (see updateFocus).
    hud.focusBand01 = punchFocusBandHalfWidth(Math.max(1, crowd?.humans ?? crowd?.meditators ?? 0))
    hud.focusZone01 = punchFocusZoneHalfWidth(Math.max(1, crowd?.humans ?? crowd?.meditators ?? 0))
    hud.focusQuality01 = crowd?.quality01 ?? 0
    hud.focusBoostPoints = crowd?.boostPoints ?? 0
    hud.focusHumanBoostPoints = crowd?.humanBoostPoints ?? 0
    hud.focusMeditators = crowd?.meditators ?? 0
    hud.focusStreak = crowd?.streak ?? 1
    hud.focusStreakMs = crowd?.streakMs ?? 0
    hud.focusSelfQuality01 = 0
    hud.focusSelfPoints = 0
    // You are not in the circle, so you hold no ring of your own — but the
    // circle's ring is the reason your gold band is wider than it was, and that
    // is the one thing about Boosting the person at the bag actually feels.
    hud.focusSelfKarma01 = 0
    hud.focusSelfKarmaMs = 0
    hud.focusSelfMultiplier = 1
    hud.focusSelfCircle = 0
    hud.focusForName = snapshot?.active?.name ?? ''
    // The puncher watches the circle race for them.
    circleBestInto(machine, crowd?.circle, 0)
    // The puncher gets the roster too — these are the people working for them,
    // and the whole point of naming the circle is that it is nameable.
    hud.focusCircle = circleFrom(machine, crowd, snapshot?.active?.userId ?? null)
    return
  }
  hud.focusReadOnly = false
  if (!eligible) {
    // Leaving the ring is a deliberate message, sent once: without it the
    // coordinator would hold a departed spectator for the full idle window and
    // keep counting their fading level into everyone else's average.
    if (machine.focusLastTapAt > 0) {
      machine.focusLastTapAt = 0
      machine.focusLevel01 = 0
      network?.focusStop()
    }
    hud.focusVisible = false
    hud.focusActive = false
    hud.focusLevel01 = 0
    hud.focusSelfQuality01 = 0
    hud.focusSelfPoints = 0
    // Out of the circle is out of the run. A ring held from the deck and then
    // abandoned must not still be ticking when its owner wanders back.
    machine.focusKarmaMs = 0
    machine.focusGreenMs = 0
    machine.focusLiveMs = 0
    hud.focusSelfKarma01 = 0
    hud.focusSelfKarmaMs = 0
    hud.focusSelfMultiplier = 1
    hud.focusSelfCircle = 0
    hud.focusForName = hud.focusOutOfRange ? (snapshot?.active?.name ?? '') : ''
    // Still drawn in the world: a spectator who has stepped back is exactly the
    // person the balloons and the board are trying to recruit.
    hud.focusCircle = circleFrom(machine, snapshot?.focus, snapshot?.active?.userId ?? null)
    return
  }
  if (now - machine.focusLastTapAt > PUNCH_FOCUS_IDLE_MS) machine.focusLevel01 = 0
  else machine.focusLevel01 = punchFocusDecay(machine.focusLevel01, dtMs, gust)
  const focus = snapshot?.focus
  const meditators = focus?.meditators ?? 0
  hud.focusVisible = true
  hud.focusActive = machine.focusLastTapAt > 0 && now - machine.focusLastTapAt <= PUNCH_FOCUS_IDLE_MS
  hud.focusLevel01 = machine.focusLevel01
  hud.focusCrowd01 = focus?.level01 ?? 0
  // Shown for at least one Booster: the band a lone spectator is aiming at is
  // real even in the tick before the coordinator has counted them.
  // The HUMANS' band — the regulars no longer widen it (see updateFocus).
  const myCount = Math.max(1, focus?.humans ?? meditators)
  hud.focusBand01 = punchFocusBandHalfWidth(myCount)
  hud.focusZone01 = punchFocusZoneHalfWidth(myCount)
  hud.focusQuality01 = focus?.quality01 ?? 0
  hud.focusBoostPoints = focus?.boostPoints ?? 0
  hud.focusHumanBoostPoints = focus?.humanBoostPoints ?? 0
  hud.focusMeditators = meditators
  hud.focusStreak = focus?.streak ?? 1
  hud.focusStreakMs = focus?.streakMs ?? 0
  // Scored against the crowd's own target, so "you are in the green" on the
  // pill and the number on your balloon are the same claim measured the same
  // way — and against the DRIFTING still point, so the green the bar is painting
  // and the green this reads are the same green at the same instant.
  hud.focusSelfQuality01 = hud.focusActive
    ? punchFocusQuality01(machine.focusLevel01, myCount, hud.focusTarget01)
    : 0
  // ‼️WHAT YOU ARE WORTH, IN POINTS, PREDICTED LOCALLY.
  //
  // The same curve the coordinator runs, off this client's own meter rather
  // than the echo of it — both sample a 200 ms sawtooth a round trip apart, so
  // reading the wire here would show a spectator a number a beat behind the bar
  // in their hand. This is the honest answer to "how much am I adding?", which
  // is the entire question the control exists to answer.
  // ‼️THE RING, STEPPED ON THE LOCAL METER — the same rule the coordinator runs
  // in `updateFocus`, off the bar this player is actually holding. Both sides
  // reset on `serial`, so the two runs describe one attempt even though only one
  // of them is ever paid.
  const serial = snapshot?.serial ?? 0
  if (machine.focusKarmaSerial !== serial) {
    machine.focusKarmaSerial = serial
    machine.focusKarmaMs = 0
    machine.focusGreenMs = 0
    machine.focusLiveMs = 0
  }
  hud.focusKarmaBand01 = punchKarmaBand01(activeProfile(machine).karmaRingBand01)
  hud.focusSelfKarma01 = hud.focusActive
    ? punchFocusKarma01(machine.focusLevel01, hud.focusTarget01, hud.focusKarmaBand01)
    : 0
  // Same run rule as the coordinator: a tap pauses the clock, leaving the
  // yellow zone resets it. See `punchKarmaRunMs`.
  machine.focusKarmaMs = hud.focusActive
    ? punchKarmaRunMs(
        machine.focusKarmaMs,
        dtMs,
        hud.focusSelfKarma01,
        Math.abs(machine.focusLevel01 - hud.focusTarget01) <= hud.focusZone01
      )
    : 0
  hud.focusSelfKarmaMs = machine.focusKarmaMs
  hud.focusSelfMultiplier = punchBoostKarmaMultiplier(machine.focusKarmaMs)
  // THE CIRCLE, PREDICTED LOCALLY like everything else on this control, and
  // stepped only through the wind-up — the reveal is nobody's play time.
  const windingUp = snapshot?.phase === 'ready' || snapshot?.phase === 'charging'
  if (hud.focusActive && windingUp) {
    machine.focusLiveMs += dtMs
    if (hud.focusSelfQuality01 >= 0.999) machine.focusGreenMs += dtMs
  }
  hud.focusSelfCircle = hud.focusActive
    ? punchCircleScore(machine.focusGreenMs, machine.focusLiveMs, machine.focusKarmaMs)
    : 0
  circleBestInto(machine, focus?.circle, hud.focusSelfCircle)
  hud.focusSelfPoints = punchBoostPoints(
    hud.focusSelfQuality01,
    hud.focusStreak,
    hud.focusSelfMultiplier
  )
  hud.focusForName = snapshot?.active?.name ?? ''
  hud.focusCircle = circleFrom(machine, focus, snapshot?.active?.userId ?? null)
}

/**
 * The circle, as the world draws it — the coordinator's roster, plus THIS
 * client if it is already tapping and the roster has not caught up.
 *
 * That last part is not cosmetic. The roster rides the state heartbeat, so a
 * spectator's first three or four taps land before any snapshot names them, and
 * without the local graft the one balloon that must appear instantly — your own
 * — was the last one to arrive.
 */
/**
 * Who is leading the circle right now — the competition the owner asked for.
 * Your own score is the local prediction; everyone else's is the wire's.
 */
function circleBestInto(
  machine: PunchMachineRuntime,
  circle: PunchFocusState['circle'] | undefined,
  selfScore: number
): void {
  let bestName = ''
  let bestScore = 0
  for (const member of circle ?? []) {
    if (member.npc) continue
    const mine = !!machine.localUserId && member.userId === machine.localUserId
    const score = mine ? selfScore : member.circleScore ?? 0
    if (score > bestScore) {
      bestScore = score
      bestName = mine ? 'YOU' : member.name
    }
  }
  if (selfScore > bestScore) {
    bestScore = selfScore
    bestName = 'YOU'
  }
  hud.focusCircleBestName = bestName
  hud.focusCircleBestScore = bestScore
}

function circleFrom(
  machine: PunchMachineRuntime,
  focus: PunchFocusState | undefined,
  activeUserId: string | null
): FocusSignalMember[] {
  const circle = focus?.circle ?? []
  const crowd = focus?.meditators ?? 0
  const roster: FocusSignalMember[] = []
  const snapshotPrep = machine.network?.snapshot().prep ?? []
  const prepRows = new Map(snapshotPrep.map((row) => [row.userId, row] as const))
  // Named `onStage`, not `performer`: a source test elsewhere slices the file at the
  // first `const performer = performingBot(machine)` and this must not be it.
  const onStage = performingBot(machine)?.entity
  for (const member of circle) {
    // ‼️ THE FIGHTER IS NEVER IN THE CIRCLE, whatever the coordinator says. A human
    // who was focusing when their own turn came up is still named in the roster
    // for a heartbeat or two; a bot can be named while its body is on stage. Nobody
    // focuses on themself, and a FOCUSING cloud over the person at the bag reads as
    // nonsense because it is.
    if (activeUserId && member.userId === activeUserId) continue
    const mine = !!machine.localUserId && member.userId === machine.localUserId
    // A REGULAR WITH NO BODY ON THIS CLIENT IS NOT DRAWN. The coordinator's
    // circle is authoritative about how many are channelling, but the bodies
    // wearing the part are each client's own — a client whose arc had nothing
    // to lend has a member it cannot anchor anything to, and drawing it would
    // park a balloon at the world origin.
    const body = focusBotBody(machine, member.userId)?.entity
    if (!body && isPunchFocusBotId(member.userId)) continue
    if (body && onStage && body === onStage) continue
    roster.push({
      userId: member.userId,
      npc: member.npc,
      name: member.name,
      // YOUR OWN LINE IS SCORED LOCALLY, never from the coordinator echo. Both
      // sides run the same curve, but they sample a 200 ms sawtooth a round
      // trip apart, so the balloon over your head said +2% while the pill in
      // your hand said +8% — the same claim, measured a beat later.
      quality01: mine && hud.focusActive ? hud.focusSelfQuality01 : member.quality01,
      points: mine && hud.focusActive ? hud.focusSelfPoints : member.points,
      circleScore: mine && hud.focusActive ? hud.focusSelfCircle : member.circleScore ?? 0,
      focus: prepRows.get(member.userId)?.focus ?? 0,
      momentum: prepRows.get(member.userId)?.momentumReady ?? false,
      crowd,
      mine,
      body
    })
  }
  // THE LOCAL GRAFT. The roster rides the state heartbeat, so this client's
  // first three or four taps land before any snapshot names it — and without
  // this the one balloon that must appear instantly, your own, was the last to
  // arrive. Grafted here, where "am I already named?" can actually be answered.
  if (hud.focusActive && machine.localUserId && !roster.some((m) => m.mine)) {
    roster.unshift({
      userId: machine.localUserId,
      name: 'YOU',
      quality01: hud.focusSelfQuality01,
      points: hud.focusSelfPoints,
      circleScore: hud.focusSelfCircle,
      focus: hud.prepFocus,
      momentum: hud.prepMomentum,
      crowd: Math.max(1, crowd),
      mine: true
    })
  }
  // ‼️THE STATUS ABOVE THE NAME. A player with stored Focus or Momentum wears
  // it whether or not they are tapping right now — that is how the room reads
  // "this one enters their turn prepared". The puncher's own is not drawn: the
  // machine is theirs for the moment and the balloon would sit over the bag.
  const activeId = machine.network?.snapshot().active?.userId
  for (const row of snapshotPrep) {
    if (row.userId === activeId) continue
    if (row.focus <= 0 && !row.momentumReady) continue
    if (roster.some((member) => member.userId === row.userId)) continue
    const mine = !!machine.localUserId && row.userId === machine.localUserId
    roster.push({
      userId: row.userId,
      name: mine ? 'YOU' : row.name,
      quality01: 0,
      points: 0,
      circleScore: 0,
      focus: row.focus,
      momentum: row.momentumReady,
      crowd: Math.max(1, crowd),
      mine
    })
  }
  return roster
}

function releaseSolo(machine: PunchMachineRuntime): void {
  if (machine.soloPhase !== 'charging') return
  applySeamSecret(machine)
  const secret = applySecretAssists(
    machine,
    machine.soloHeldMs,
    punchAttemptMarker01(
      machine.soloHeldMs,
      machine.attemptInRound + 1,
      machine.soloChargeStartedAt,
      machine.config.idealChargeMs,
      activeProfile(machine)
    ),
    Date.now()
  )
  machine.soloSerial += 1
  machine.soloAttempt = punchScoreForAttempt(
    {
      heldMs: secret.heldMs,
      timingMarker01: secret.marker01,
      accuracy01: machine.localAccuracy01,
      stancePower: currentPunchStance(machine).power
    },
    machine.config
  )
  machine.soloTargetScore = machine.soloAttempt.score
  machine.soloShownScore = 0
  machine.soloElapsedMs = 0
  machine.soloPhase = 'scoring'
  hud.reload01 = 0
  const releaseNow = Date.now()
  machine.glovePunchStartedAt = releaseNow
  const intensity = punchReactionIntensity(machine.soloTargetScore, machine.config)
  // The event unfolds: emote wind-up, arm rise, SLAM (sound/smoke/shake), then
  // the score rolls. Nothing fires at the click itself except the emote.
  machine.armSwingAt = releaseNow + EMOTE_CONTACT_MS
  machine.armReturnMs = armReturnMs(
    machine.soloTargetScore,
    punchStreakAfter(machine.roundStreak, machine.soloTargetScore),
    activeProfile(machine)
  )
  machine.slamAt = releaseNow + SLAM_DELAY_MS
  machine.slamPhaseAt = releaseNow
  machine.slamIntensity = intensity
  machine.slamScore = machine.soloTargetScore
  // Solo: the puncher is whoever is standing here.
  machine.slamName = getPlayer()?.name ?? ''
  machine.attemptInRound += 1
  setText(machine.statusText, 'POWER')
  void triggerSceneEmote({
    src: secret.twist
      ? TWIST_EMOTE
      : punchEmoteFor(machine.soloTargetScore, machine.config, machine.slamPhaseAt),
    loop: false
  })
}

function updateSolo(machine: PunchMachineRuntime, dt: number): void {
  if (machine.soloPhase === 'charging') {
    machine.soloHeldMs += dt * 1000
    // The cabinet counter reads the SCORING power, so the marquee falls back
    // during an overhold exactly as the HUD bar does. It used to climb past
    // 100 and sit there while the punch was rotting.
    const power01 = punchPowerQuality01(Math.min(machine.soloHeldMs, machine.config.idealChargeMs * 2), machine.config.idealChargeMs)
    const percent = Math.round(power01 * 100)
    setText(machine.scoreText, String(percent).padStart(3, '0'))
    updateIndicator(
      machine,
      machine.config.minScore + (machine.config.maxScore - machine.config.minScore) * power01
    )
    // ‼️NO AUTO-PUNCH. This was `idealChargeMs * 4` and it threw the punch for
    // the player — see the overhold note in the contract. The only release left
    // here is the TURN clock, which exists so an abandoned machine frees itself,
    // not to take the shot out of somebody's hands mid-aim.
    if (machine.soloHeldMs >= machine.config.turnTimeoutMs) releaseSolo(machine)
  } else if (machine.soloPhase === 'scoring') {
    machine.soloElapsedMs += dt * 1000
    machine.soloShownScore = revealShownScore(machine.soloTargetScore, machine.soloElapsedMs, activeProfile(machine))
    setText(machine.scoreText, String(machine.soloShownScore).padStart(3, '0'))
    updateIndicator(machine, machine.soloShownScore)
    if (machine.soloElapsedMs >= PUNCH_SCORE_HOLD_MS + punchRevealCountMs(machine.soloTargetScore, activeProfile(machine))) {
      machine.soloPhase = 'cooldown'
      machine.soloElapsedMs = 0
      machine.roundBest = Math.max(machine.roundBest, machine.soloTargetScore)
      machine.roundTotal += machine.soloTargetScore
      // THE STREAK, BEFORE THE ALLOWANCE. A punch that lands on the threshold
      // pays twice — points for the run it is continuing, then the extra punch
      // — and it has to be settled first because the banner it earns outranks
      // 'EXTRA PUNCH!' on the one marquee they share.
      const award = punchRoundAward(machine.soloTargetScore, machine.roundStreak, false, activeProfile(machine))
      machine.roundStreak = award.streak
      const streakBonus = award.bonus
      machine.roundTotal += streakBonus
      const challenge = punchChallengeAward({ attempt: machine.attemptInRound,
        heldMs: machine.soloAttempt?.heldMs ?? 0, idealMs: machine.config.idealChargeMs,
        timing01: machine.soloAttempt?.timing01 ?? 0, points: award.points,
        remaining01: 1 - machine.soloHeldMs / machine.config.turnTimeoutMs }, activeProfile(machine))
      machine.roundTotal += challenge.difficultyBonus + challenge.timeBonus
      hud.challengeLabel = `DIFFICULTY ×${challenge.difficultyMultiplier.toFixed(2)} +${challenge.difficultyBonus}`
      hud.challengeSpeed = challenge.speed
      hud.challengeHitMult = challenge.difficultyMultiplier
      hud.challengeBonus = challenge.difficultyBonus + challenge.timeBonus
      machine.roundStreakBonus += streakBonus
      // A big punch buys another punch onto this same round.
      const grown = punchRoundAttemptsAfter(machine.roundAttemptsAllowed, machine.soloTargetScore)
      const extended = grown > machine.roundAttemptsAllowed
      machine.roundAttemptsAllowed = grown
      // An earned punch is a REWARD — it gets its own moment, not a silently
      // larger denominator that the player is left to notice on their own.
      if (extended) announceExtraPunch(machine)
      if (streakBonus > 0) announceStreak(machine, machine.roundStreak, streakBonus)
      setText(
        machine.statusText,
        streakBonus > 0
          ? `${punchStreakName(machine.roundStreak)} +${streakBonus}`
          : extended
            ? 'EXTRA PUNCH!'
            : machine.soloTargetScore >= machine.config.celebrationScore
              ? 'CHAMPION'
              : 'SCORE'
      )
      playReveal(machine, machine.soloTargetScore)
      setPunchCamera(machine, 'none')
    }
  } else if (machine.soloPhase === 'summary') {
    // The round is over and the machine says so before anything resets.
    machine.soloElapsedMs += dt * 1000
    if (machine.soloElapsedMs >= PUNCH_ROUND_SUMMARY_MS) {
      machine.soloPhase = 'ready'
      machine.soloElapsedMs = 0
      machine.attemptInRound = 0
      machine.roundBest = 0
      machine.roundTotal = 0
      // A streak belongs to the round that built it. Carrying it over would let
      // a player bank one 900, walk away, and collect the ladder's second rung
      // on a fresh set of three easy punches.
      machine.roundStreak = 0
      machine.roundStreakBonus = 0
      machine.roundAttemptsAllowed = PUNCH_ROUND_ATTEMPTS
      setScoreDisplay(machine, '000')
      setText(machine.statusText, 'HOLD THE BAG')
    }
  } else if (machine.soloPhase === 'cooldown') {
    machine.soloElapsedMs += dt * 1000
    // The reload the player can SEE: bar filling, bag still coming down.
    const reloadMs = punchReloadMs(machine.soloTargetScore, machine.roundStreak)
    hud.reload01 = Math.min(1, machine.soloElapsedMs / reloadMs)
    if (machine.soloElapsedMs >= reloadMs) {
      hud.reload01 = 1
      // Round spent? Hold the total up instead of silently starting over.
      if (machine.attemptInRound >= machine.roundAttemptsAllowed) {
        machine.soloPhase = 'summary'
        machine.soloElapsedMs = 0
        if (machine.roundTotal > machine.bestToday) {
          machine.bestToday = machine.roundTotal
          machine.bestTodayName = hud.playerName || 'YOU'
        }
        setScoreDisplay(machine, String(machine.roundTotal))
        setText(machine.statusText, `ROUND ${machine.roundTotal}`)
        const cheer = pickFrom(SFX_CROWD)
        if (cheer) playSfx(machine, cheer, 0.5, 'crowd')
        return
      }
      machine.soloPhase = 'ready'
      machine.soloElapsedMs = 0
      setText(machine.statusText, 'HOLD BAG')
      setPunchCamera(machine, 'none')
    }
  }
}

/**
 * Are both feet down? The SDK exposes no grounded flag, so it is measured: a
 * fall moves the avatar metres per second while standing still moves it none.
 * Only a settled player gets the full panel — mid-air it stays a chip, because
 * a cloud the size of the screen is not something to read while falling, and
 * it sat squarely over the view you steer by.
 *
 * Two things make that reading STEADY rather than a flicker:
 *
 * 1. Speed is metres per SECOND. The old test was a per-frame delta of 0.06 m,
 *    which at 30 fps calls 1.8 m/s "standing" — so the hang at the top of every
 *    cloud bounce, and any slow drift on the way down, read as a landing and
 *    threw the whole cloud panel over the view for a few frames. That blink,
 *    once per bounce, is the flashing the owner watched all the way down.
 * 2. The landing LATCHES. Once the player is actually down, hopping about on
 *    the ground is not a new fall, so the panel does not blink out and back
 *    every time they jump. Only climbing back up to the deck clears it.
 */
let lastFallY: number | null = null
let lastFallAt = 0
let stillSince = 0
/** Latched true once this drop has ended with the player standing still. */
let fallLanded = false
/** Vertical speed that still counts as standing, in metres per second. */
const FALL_STILL_SPEED = 0.35
/** How long that has to hold before the drop counts as over. */
const FALL_SETTLE_MS = 600

function updateGrounded(y: number, now: number): void {
  const prevY = lastFallY
  const prevAt = lastFallAt
  lastFallY = y
  lastFallAt = now
  // Only a player the prompt is up for can "land". Standing on a cloud halfway
  // down is not the ground, and latching there is what would put the full panel
  // back on screen mid-drop.
  if (!hud.fallPrompt) stillSince = 0
  else if (prevY !== null && now > prevAt) {
    const speed = (Math.abs(y - prevY) * 1000) / (now - prevAt)
    if (speed > FALL_STILL_SPEED) stillSince = 0
    else {
      if (stillSince === 0) stillSince = now
      if (now - stillSince >= FALL_SETTLE_MS) fallLanded = true
    }
  }
  hud.fallAirborne = !fallLanded
}

/** A new drop starts in the air again — called the moment the player is back up. */
function resetFallLanding(): void {
  lastFallY = null
  lastFallAt = 0
  stillSince = 0
  fallLanded = false
  hud.fallAirborne = true
}

function updateFallPrompt(machine: PunchMachineRuntime): void {
  updateFallFromIsland(machine.root, machine.config, machine)
}

function updateFallPromptFromHost(host: { root: Entity; config: PunchMachineAppConfig }): void {
  updateFallFromIsland(host.root, host.config, null)
}

function updateFallFromIsland(
  root: Entity,
  config: PunchMachineAppConfig,
  machine: PunchMachineRuntime | null
): void {
  if (!config.skyIslandEnabled) return
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (!player) return
  updateGrounded(player.position.y, Date.now())
  const islandY = getWorldPosition(engine, root).y
  syncScrapKoDeck(root)

  // Back up top: everything resets, including the "you fell" memory.
  if (player.position.y >= islandY - 2) {
    // Arrival only counts as SETTLED once the cover is gone. The spawn point is
    // on the deck, so frame one always reads "up top" — latching here is what
    // spent the entry catch before the player had fallen anywhere, leaving them
    // on the ground with only the manual button to get back up.
    if (!isLandingCoverBlocking()) arrivalSettled = true
    hud.fallPrompt = false
    hud.fallDistanceM = 0
    hud.fallMinimized = false
    if (!machine) hud.visible = false
    fallMachine = null
    fallReturnUntil = 0
    fallReturnFailed = false
    // The landing latch is part of that memory: the next drop has to earn its
    // panel again, the same way this one did.
    resetFallLanding()
    return
  }

  // A return teleport may still be flying. The grace window is a DEADLINE, so a
  // refused teleport re-shows the prompt instead of hiding it forever.
  if (fallReturnUntil > 0) {
    if (Date.now() < fallReturnUntil) {
      hud.fallPrompt = false
      return
    }
    // The window closed and the player is still down: the move did not take.
    fallReturnUntil = 0
    fallReturnFailed = true
  }

  // Being inside THIS scene's parcels is the whole gate. Someone standing in a
  // neighbouring scene is on the ground legitimately, and a teleport out of our
  // scene would be refused anyway — but anyone inside our own parcels and below
  // the deck belongs up on the island, whether they have been up there yet or
  // not. Also requiring visitedIsland stranded players who arrived below it with
  // no prompt and no way up at all.
  if (!playerInsideScene()) {
    hud.fallPrompt = false
    return
  }
  // fallPromptY is an absolute floor (default 60), so on a 100 m island it made
  // the player drop FORTY METRES before the way back appeared — the "it showed up
  // a minute later" the owner hit. Whichever trigger is HIGHER wins, so stepping
  // off the deck is enough.
  //
  // Except where the sky itself hangs lower than the rim. Clouds below the deck
  // are a PLACE now — you drop to them on purpose and get blown back up — so the
  // prompt waits until the player is under the lowest one, where there really is
  // nothing left to catch them. See PUNCH_SKY_FLOOR_M.
  const skyFloorY = Math.min(islandY - 6, islandY + PUNCH_SKY_FLOOR_M)
  if (player.position.y >= Math.max(config.fallPromptY, skyFloorY)) return
  fallMachine = machine
  hud.visible = true
  hud.fallPrompt = true
  hud.fallDistanceM = Math.max(0, islandY - player.position.y)
  if (machine) setPunchCamera(machine, 'none')
}

const sceneBootAt = Date.now()
/** True once the player has stood on the deck with the arrival cover gone. */
let arrivalSettled = false
let lastAutoReturnAt = 0
let autoReturns = 0
/** Retry cadence and ceiling for the arrival catch — movePlayerTo can be
 *  declined during boot, and one refused call must not strand the visitor. */
const AUTO_RETURN_EVERY_MS = 2_000
const AUTO_RETURN_MAX = 12

/** Did the last return attempt visibly fail? Drives the prompt's wording. */
export function punchReturnFailed(): boolean {
  return fallReturnFailed
}

/**
 * Swing the hinged arm through one punch. The authored arm has its origin ON the
 * hinge with the ball hanging below, so this is a plain rotation about X — out on
 * impact, then settling back. Reads the same clock the first-person gloves do, so
 * the cabinet and the player's hands stay in step.
 */
function swingArm(machine: PunchMachineRuntime, now: number): void {
  updatePunchMilestoneMedia(machine)
  const transform = Transform.getMutableOrNull(machine.armPivot)
  if (!transform) return
  const started = machine.armSwingAt
  if (started <= 0 || now < started) {
    // Idle: the ball slowly turns on its chain, begging to be hit.
    const spin = ((now / 1000) * PUNCH_BAG_SPIN_DPS * goldenSpinFactor(machine, now)) % 360
    transform.rotation = Quaternion.fromEulerDegrees(0, spin, 0)
    return
  }
  const t = now - started
  // The fall lasts as long as THIS punch’s reload: a hot 900 reloads in a
  // second, so the bag has to be back on the plinth in a second.
  const returnMs = machine.armReturnMs > 0 ? machine.armReturnMs : ARM_RETURN_COLD_MS
  if (t >= ARM_RISE_MS + ARM_HOLD_MS + returnMs) {
    machine.armSwingAt = 0
    transform.rotation = Quaternion.Identity()
    return
  }
  let angle: number
  if (t < ARM_RISE_MS) {
    // Whip up and back — ease-out so it decelerates INTO the slam.
    const k = t / ARM_RISE_MS
    angle = ARM_SLAM_DEG * (1 - (1 - k) * (1 - k))
  } else if (t < ARM_RISE_MS + ARM_HOLD_MS) {
    angle = ARM_SLAM_DEG
  } else {
    // The slow, watchable fall back down, with a damped double bounce.
    const k = (t - ARM_RISE_MS - ARM_HOLD_MS) / returnMs
    const fall = 1 - k * k
    const bounce = Math.exp(-4.2 * k) * Math.sin(k * Math.PI * 3.2) * 0.12
    angle = ARM_SLAM_DEG * Math.max(0, fall + bounce)
  }
  // Negative X: up and BACK over the hinge, into the top housing — a bag
  // folding toward the puncher's face is physically impossible.
  transform.rotation = Quaternion.fromEulerDegrees(-angle, 0, 0)
}

function updatePunchMilestoneMedia(machine: PunchMachineRuntime): void {
  const snapshot = machine.network?.snapshot(), rules = activeProfile(machine)
  const phase = snapshot?.phase ?? machine.soloPhase
  // ‼️GOLD IS ARMED BY THE STREAK, NOT BY OVER-HOLDING. It used to turn gold
  // only when the charge was held ~3–4× the ideal (challenge speed ≥ 1.5),
  // which nobody meets, and paid the precision bonus — a different mechanic
  // from the one the owner designed on 09-05 and asked for again on 09-06:
  // "3 over 900, then the 4th one becomes a golden ball". `punchGoldenArmed`
  // reads the streak the puncher carries INTO this ball; the payout lives in
  // `punchRoundAward`, on the ladder, where a multiplier can be seen.
  const streakIn = snapshot?.roundStreak ?? machine.roundStreak
  // MOMENTUM arms it after the first 900+ — read for whoever is up.
  const activeMomentum = snapshot?.prep?.find((entry) => entry.userId === snapshot.active?.userId)?.momentumReady ?? false
  machine.goldenActive = punchGoldenArmed(streakIn, rules, activeMomentum) && (phase === 'ready' || phase === 'charging' || phase === 'scoring')
  hud.goldenArmed = machine.goldenActive
  hud.goldenPayout = goldenPayout(machine, streakIn)
  // ‼️THE GOLDEN BALL IS THE BALL. Owner, 2026-09-06: "it should look exactly
  // like the red ball, just gold — not this yellow berry-looking thing." The
  // yellow sphere is gone; the arm's own ball nodes are repainted gold through
  // GltfNodeModifiers (`paintArmBall`), so every facet stays. Around it, a
  // sparkle; under it, the arcade loop — a special moment, not a quiet spin.
  if (machine.goldenEntity) {
    engine.removeEntity(machine.goldenEntity)
    machine.goldenEntity = undefined
  }
  paintArmBall(machine)
  updateGoldenShow(machine, phase)
  const roundKey = snapshot ? `${snapshot.active?.userId}:${snapshot.roundStartedAt}` : `solo:${machine.localUserId}`
  updatePunchEscalationMelody(machine, roundKey, snapshot?.roundStreak ?? machine.roundStreak, rules)
}

/**
 * THE ESCALATION MELODY — one melody, ONCE, for the moment a run climbs a rung.
 *
 * ‼️THIS IS NOT A MUSIC BED AND MUST NEVER BECOME ONE AGAIN. Owner, 2026-09-08:
 * *"music is an escalation level melody — if you reach a certain level of
 * escalation the music should play once to celebrate that moment, not as
 * background music."* The bed it replaces failed twice over in the same session:
 *
 *   IT RESTARTED, HUNDREDS OF TIMES.  The old block wrote the AudioSource on
 *   EVERY FRAME — `source.playing = true; source.volume = …` inside a system —
 *   and a written component is a dirty component, re-applied by the renderer
 *   each tick, which takes the clip back to zero. The duck maths made it look
 *   deliberate; it was a stutter. So the rule here is arithmetic, not taste:
 *   ONE write to start the melody, ONE to release it, and not a single frame's
 *   write in between. No ducking, no fades, no volume rides.
 *
 *   THEN IT WAS CUT OFF.  The bed's gate mixed the round key, the spectacle
 *   range and the mute into one boolean; any of them flickering pulled
 *   `playing` down mid-phrase. A melody here owns its slot until
 *   `PUNCH_MUSIC_TRACK_MS` says the file has finished on its own fade, and
 *   nothing below re-reads the gate while it is in the air. Only a real mute
 *   silences it.
 *
 * The rung is remembered per ROUND, so a run that climbs 3 → 4 → 5 is three
 * different celebrations and a streak broken and rebuilt to 3 does not replay
 * the same one. Global, not positional: the melody is the venue's moment, not a
 * whisper that falls off with distance.
 */
function updatePunchEscalationMelody(
  machine: PunchMachineRuntime,
  roundKey: string,
  streak: number,
  rules: PunchGameProfile
): void {
  const now = Date.now()
  const silenced = !machine.config.soundsEnabled || sfxMuted.machine
  if (machine.musicUntil && now < machine.musicUntil && !silenced) return
  if (machine.musicUntil) {
    // The one write that ends it — after the file's own fade, or on a mute.
    machine.musicUntil = 0
    machine.musicPlaying = ''
    hud.musicTrack = ''
    const source = machine.musicEntity ? AudioSource.getMutableOrNull(machine.musicEntity) : null
    if (source) source.playing = false
  }
  if (machine.musicRound !== roundKey) {
    machine.musicRound = roundKey
    machine.musicRung = 0
  }
  if (silenced || !punchSpectacleReachesMe(machine)) return
  const rung = Math.max(0, Math.floor(streak))
  if (rung <= (machine.musicRung ?? 0)) return
  // Recorded even when the rung is owed nothing, so a rung is asked once.
  machine.musicRung = rung
  const track = punchEscalationTrack(rung, rules)
  if (!track) return
  if (!machine.musicEntity) {
    machine.musicEntity = engine.addEntity()
    Transform.create(machine.musicEntity, { parent: machine.root })
  }
  AudioSource.createOrReplace(machine.musicEntity, {
    audioClipUrl: PUNCH_MUSIC_TRACKS[track], playing: true, loop: false, volume: rules.musicVolume, global: true
  })
  machine.musicPlaying = track
  machine.musicUntil = now + (PUNCH_MUSIC_TRACK_MS[track] ?? 14_000)
  hud.musicTrack = track
}

/**
 * THE SHOW LEDGER, one per visit.
 *
 * Module-level and not per-machine on purpose: it is a record of what THIS
 * PLAYER has been shown, and an island with two cabinets must not be allowed to
 * hand them the same effect twice by keeping two sets of books.
 */
const showLedger = createShowLedger()
let showBeatIndex = 0
/** The island's render-only mesh, kept so `world-tilt` can roll it. */
let islandVisual: Entity | null = null
/** Lamp state parked by `world-blackout`, and when to hand it back. */
let blackoutUntil = 0

/**
 * Build the beat. The seed has to be a value EVERY CLIENT ALREADY AGREES ON, or
 * spectators compose a different show from the puncher and the island stops
 * looking like one place: `slamPhaseAt` comes off the shared snapshot's phase
 * clock and the score is the score.
 */
function showBeatFor(machine: PunchMachineRuntime, score: number): ShowBeat {
  const snapshot = machine.network?.snapshot()
  const serial = snapshot?.serial ?? machine.attemptInRound
  return { index: serial, seed: serial * 7919 + (snapshot?.roundStartedAt ?? machine.slamPhaseAt),
    score, heat: punchHeat(score, machine.config), streak900: snapshot?.roundStreak ?? machine.roundStreak,
    isRecord: false, isPersonalBest: false, isMine: false, isSecret: false }
}

/**
 * ONE PARTICLE BURST, parameterised — the shape every impact and world card is
 * cut from.
 *
 * ‼️`simulationSpace: 0` (LOCAL) throughout, and it is not a preference. World
 * simulation cuts a particle loose from its parent's frame the instant it is
 * emitted, so any drift between where the machine's root sits and where its body
 * is drawn puts the burst somewhere else on the island — which is how the
 * fireball came to be going off on bystanders' own avatars.
 */
function spawnShowBurst(
  machine: PunchMachineRuntime,
  options: {
    y: number
    z?: number
    count: number
    lifetime: number
    gravity: number
    speed: [number, number]
    size: [number, number]
    from: Color4
    to: Color4
    angle: number
    radius: number
    lift?: number
    holdMs?: number
  }
): void {
  if (effectPlan(machine).particles.gain <= 0) return
  const entity = engine.addEntity()
  Transform.create(entity, {
    parent: machine.root,
    position: Vector3.create(0, options.y, options.z ?? PUNCH_BAG_Z)
  })
  ParticleSystem.create(entity, {
    active: true,
    rate: 0,
    maxParticles: Math.max(1, Math.round(options.count * effectPlan(machine).particles.gain)),
    lifetime: options.lifetime,
    gravity: options.gravity,
    additionalForce: Vector3.create(0, options.lift ?? 0, 0),
    initialSize: { start: options.size[0], end: options.size[1] },
    sizeOverTime: { start: 1, end: 1.8 },
    initialVelocitySpeed: { start: options.speed[0], end: options.speed[1] },
    initialColor: { start: options.from, end: options.to },
    colorOverTime: {
      start: options.from,
      end: Color4.create(options.to.r, options.to.g, options.to.b, 0)
    },
    billboard: true,
    loop: false,
    simulationSpace: 0,
    texture: { src: 'images/fx-particle-smoke.png' },
    shape: ParticleSystem.Shape.Cone({ angle: options.angle, radius: options.radius }),
    bursts: { values: [{ time: 0, count: Math.max(1, Math.round(options.count * effectPlan(machine).particles.gain)), cycles: 1 }] }
  })
  bursts.push({ entity, expiresAt: Date.now() + (options.holdMs ?? 2_600) })
}

/**
 * RUN ONE PLAN. The whole executor, and the only place a card id turns into
 * something happening.
 *
 * Every branch is a `case '<card-id>'` and nothing else dispatches on score —
 * which is the point. Adding an effect is one entry in the catalog and one case
 * here; `tests/scene/punch-show-wiring.test.ts` greps this switch for every id
 * in the catalog, so a card that was added and never wired fails the build
 * rather than silently doing nothing in world (the failure mode that let a
 * pruned emote ship as a standing dummy for weeks).
 */
function runShowPlan(machine: PunchMachineRuntime, plan: ShowPlan, now: number): void {
  const heat = plan.beat.heat
  const rng = new ShowRng(plan.beat.seed ^ 0x5bf03635)
  for (const card of plan.cards) {
    const category = card.id === 'cabinet-smoke' ? 'particles' : card.channel === 'screen' ? 'screenFx' : card.channel === 'world' ? 'worldFx'
      : card.channel === 'impact' ? 'particles' : card.channel === 'cabinet' ? 'cabinetMotion'
      : card.channel === 'crowdText' ? 'crowdText' : null
    if (activeProfile(machine).disabledCards.includes(card.id) || (category && effectPlan(machine)[category].gain === 0)) continue
    switch (card.id) {
      // ── the arc ──────────────────────────────────────────────────────────
      // One branch for all fifteen: the card id names the pattern, the palette
      // and speed are drawn from the same seed every client is using, and the
      // window is the card's own duration class.
      case 'screen-solid':
      case 'screen-gradient':
      case 'screen-bars':
      case 'screen-wipe':
      case 'screen-meter':
      case 'screen-chase':
      case 'screen-ripple':
      case 'screen-drain':
      case 'screen-heartbeat':
      case 'screen-split':
      case 'screen-noise':
      case 'screen-sparkle':
      case 'screen-shockwave':
      case 'screen-strobe':
      case 'screen-collapse': {
        const pattern = card.id.slice('screen-'.length) as ScreenPatternId
        arenaScreenPattern(
          arenaScreen,
          {
            pattern,
            palette: screenPalette(Math.floor(rng.next() * SCREEN_PALETTES.length)),
            // Energy is the punch itself, floored so even a tap is visible.
            energy: (0.35 + heat * 0.65) * effectPlan(machine).screenFx.gain,
            // Faster the harder it lands, plus a per-punch wobble so the same
            // pattern twice is still not the same picture.
            speed: 1.2 + heat * 3.5 + rng.next() * 1.2,
            direction: rng.next() < 0.5 ? -1 : 1,
            seed: plan.beat.seed
          },
          card.duration === 'flash' ? 420 : card.duration === 'beat' ? 1_500 : 3_200,
          now
        )
        break
      }

      // ── the bag ──────────────────────────────────────────────────────────
      case 'impact-puff':
        spawnShowBurst(machine, {
          y: 1.5, count: 18, lifetime: 0.7, gravity: 0.4, speed: [0.7, 1.4],
          size: [0.1, 0.24], from: Color4.create(0.9, 0.9, 0.92, 0.6),
          to: Color4.create(0.8, 0.8, 0.84, 0.3), angle: 70, radius: 0.2, holdMs: 1_200
        })
        break
      case 'impact-dust':
        spawnShowBurst(machine, {
          y: 1.35, count: 40, lifetime: 1, gravity: 0.5, speed: [1, 2.2],
          size: [0.16, 0.42], from: Color4.create(0.86, 0.82, 0.74, 0.8),
          to: Color4.create(0.7, 0.66, 0.6, 0.35), angle: 80, radius: 0.34, holdMs: 1_600
        })
        break
      case 'impact-sparks':
        spawnShowBurst(machine, {
          y: 1.55, count: 70, lifetime: 0.9, gravity: 1.6, speed: [3, 6],
          size: [0.05, 0.11], from: Color4.create(1, 0.86, 0.4, 1),
          to: Color4.create(1, 0.4, 0.08, 1), angle: 55, radius: 0.22, holdMs: 1_800
        })
        break
      case 'impact-ring':
        // Flat and wide: a shock ring leaving the bag sideways, which reads as
        // force in a way an upward plume never does.
        spawnShowBurst(machine, {
          y: 1.4, count: 90, lifetime: 0.8, gravity: 0, speed: [5, 8],
          size: [0.18, 0.5], from: Color4.create(1, 0.95, 0.85, 0.9),
          to: Color4.create(0.9, 0.6, 0.3, 0.2), angle: 89, radius: 0.5, holdMs: 1_800
        })
        break
      case 'impact-shards':
        // Hard bright fragments thrown wide and fast — the read is BREAKAGE,
        // which no amount of smoke ever gives you.
        spawnShowBurst(machine, {
          y: 1.5, count: 120, lifetime: 1, gravity: 3.2, speed: [7, 13],
          size: [0.08, 0.2], from: Color4.create(1, 0.97, 0.85, 1),
          to: Color4.create(1, 0.55, 0.15, 0.5), angle: 62, radius: 0.3, holdMs: 2_000
        })
        break
      case 'impact-plasma':
        spawnShowBurst(machine, {
          y: 1.35, count: 200, lifetime: 1.4, gravity: -0.9, speed: [4, 9],
          size: [0.45, 1.1], from: Color4.create(0.55, 0.85, 1, 1),
          to: Color4.create(0.15, 0.3, 1, 1), angle: 26, radius: 0.75, lift: 3.4, holdMs: 2_600
        })
        break

      // ── the cabinet ──────────────────────────────────────────────────────
      case 'cabinet-smoke':
        spawnImpactSmoke(machine)
        break
      case 'cabinet-glitch':
        // The marquee stuttering: the lights cut in and out twice rather than
        // holding, so the machine looks briefly unwell without going dark.
        machine.lightFlashUntil = now + 90
        machine.overloadUntil = now + 900
        break
      case 'cabinet-overload':
        // The old `streak900 >= 3` rung, now reached through its card's `when`.
        machine.streak900 = 0
        machine.overloadUntil = now + 5_000
        machine.lightFlashUntil = 0
        spawnRearSmoke(machine)
        break
      case 'cabinet-blowout':
        // The machine losing an argument with a fist: it rocks, it smokes from
        // the back, and its lights give up entirely for a beat.
        machine.lurchUntil = now + 2_600
        machine.shakeMag = 0.2
        machine.shakeUntil = now + 1_800
        machine.lightFlashUntil = 0
        machine.overloadUntil = now + 3_400
        raiseRock(machine, { pitch: 10.5, roll: 4.4, hangMs: 640, ms: 3_400 })
        spawnRearSmoke(machine)
        spawnImpactSmoke(machine)
        break
      case 'cabinet-tipback':
        // THE ONE THAT NEARLY GOES OVER. Deeper than the floor's rock, and it
        // hangs at the top long enough for the deck to believe it.
        raiseRock(machine, { pitch: 9.5, hangMs: 520, ms: 3_200 })
        break
      case 'cabinet-stagger':
        // Sideways instead of backwards: it comes off one corner and rights
        // itself. The pitch is left alone, so this reads as a different event.
        raiseRock(machine, { roll: 5.2, ms: 2_400 })
        break

      // ── the crowd's words ────────────────────────────────────────────────
      case 'text-dry':
      case 'text-mild':
      case 'text-warm':
      case 'text-loud':
      case 'text-riot':
      case 'text-record':
      case 'text-streak':
        queueShowSpeech(machine, card.id, plan.beat, rng)
        break

      // ── the world ────────────────────────────────────────────────────────
      case 'world-sky-flash':
        spawnShowBurst(machine, {
          y: 14, z: 0, count: 40, lifetime: 1.2, gravity: 0.2, speed: [2, 5],
          size: [0.7, 2.2], from: Color4.create(1, 0.98, 0.9, 0.55),
          to: Color4.create(0.8, 0.85, 1, 0.15), angle: 88, radius: 6, holdMs: 2_000
        })
        break
      case 'world-lightning':
        // Two hard strikes rather than one: a single flash reads as a bug in the
        // lighting, a double reads as weather.
        machine.lightFlashUntil = now + 160
        spawnShowBurst(machine, {
          y: 20, z: 0, count: 60, lifetime: 0.5, gravity: 3, speed: [12, 20],
          size: [0.12, 0.5], from: Color4.create(0.92, 0.96, 1, 1),
          to: Color4.create(0.6, 0.75, 1, 0.4), angle: 8, radius: 7, holdMs: 1_400
        })
        break
      case 'world-blizzard':
        spawnShowBurst(machine, {
          y: 7, z: 0, count: Math.round(120 * effectPlan(machine).blizzard.gain), lifetime: 2.4,
          gravity: 1.4, speed: [3, 6], size: [0.035, 0.11],
          from: Color4.create(.82,.94,1,.85), to: Color4.create(.95,.98,1,0),
          angle: 75, radius: 5, holdMs: 2800
        })
        break
      case 'world-aurora':
        spawnShowBurst(machine, {
          y: 18, z: 0, count: 90, lifetime: 3.4, gravity: -0.05, speed: [0.4, 1.2],
          size: [1.6, 4.5], from: Color4.create(0.25, 1, 0.7, 0.35),
          to: Color4.create(0.5, 0.3, 1, 0.1), angle: 88, radius: 9, lift: 0.4, holdMs: 4_200
        })
        break
      case 'world-confetti':
        spawnShowBurst(machine, {
          y: 16, z: 0, count: 220, lifetime: 4, gravity: 1.1, speed: [0.6, 2.4],
          size: [0.12, 0.12], from: Color4.create(1, 0.85, 0.25, 1),
          to: Color4.create(0.3, 0.85, 1, 0.8), angle: 88, radius: 8, holdMs: 4_800
        })
        break
      case 'world-blackout':
        // The loudest tool available is a moment of nothing. Everything goes out
        // for a beat and comes back on the blast; the arc's `collapse` pattern is
        // its partner and the two are tagged so they cannot cancel each other.
        blackoutUntil = now + 520
        machine.lightFlashUntil = 0
        break
      case 'world-meteor':
        spawnShowBurst(machine, {
          y: 26, z: -6, count: 24, lifetime: 1.6, gravity: 5, speed: [16, 24],
          size: [0.5, 1.6], from: Color4.create(1, 0.75, 0.3, 1),
          // Same rule as the bag: warm, never red (owner, 2026-09-04).
          to: Color4.create(1, 0.78, 0.3, 0.6), angle: 6, radius: 2.5, holdMs: 2_600
        })
        break
      case 'world-shockring':
        spawnShowBurst(machine, {
          y: 0.4, z: 0, count: 260, lifetime: 1.8, gravity: 0, speed: [14, 22],
          size: [0.5, 2.4], from: Color4.create(1, 1, 0.95, 0.85),
          to: Color4.create(0.4, 0.8, 1, 0), angle: 90, radius: 1.5, holdMs: 2_600
        })
        break

      // The swing is chosen where the emote is armed, not here — see
      // `punchEmoteFor`. Listed so the wiring test can see them accounted for.
      case 'swing-jab':
      case 'swing-cross':
      case 'swing-haymaker':
      case 'swing-uppercut':
        machine.showSwingCard = card.id
        break
    }
  }
}

/** The island's visual roll, driven from `world-tilt`. */
let islandTiltUntil = 0
let islandTiltDeg = 0
let islandTiltAxis: 1 | -1 = 1
/**
 * ‼️THE ISLAND ROLLS ON EVERY 900+, AS FLOOR. Owner, 2026-09-06, after an
 * eight-punch streak: "I haven't seen any of it." Measured: the "island shake"
 * shook the JUMP CLOUDS, the High Ground roll was set to ZERO degrees, and both
 * effects ran on a cadence that skipped three punches in four. The roll is
 * now monotonic in score and streak, capped where the mesh starts sweeping
 * through the deck (20°, owner: "it starts to clip into everybody"), and it
 * obeys the Game director's ON switch and intensity for islandMotion — never
 * its chance or cadence, because a floor has neither.
 */
const ISLAND_TILT_CAP_DEG = 20
const ISLAND_ROLL_SCORE = 900
/**
 * Special, not weather. The owner's words on it, 2026-09-07, were "it looks
 * cheap, it's blurry, and it's coming up all the time instead of on special
 * moments" — a note on the LOOK and the frequency, never a request to lose it.
 * 990 was the top one punch in a session, i.e. never; 940 is the great punch,
 * a few times a good round, and it stays a short burst rather than a rain.
 */
const CONFETTI_SCORE = 940
/** A threshold card as floor: on, non-zero, and past the score OR the streak the director set. */
function floorCardFires(rule: { enabled: boolean; intensity: number; minScore: number; minStreak: number }, score: number, streak: number): boolean {
  if (!rule.enabled || rule.intensity <= 0) return false
  return score >= rule.minScore || (rule.minStreak > 0 && streak >= rule.minStreak)
}
/** A floor effect reads the rule's switch and intensity only. */
function floorGain(rule: { enabled: boolean; intensity: number }): number {
  return rule.enabled ? Math.max(0, Math.min(1, rule.intensity / 100)) : 0
}

/**
 * One frame of the roll and of the blackout — both are world state that outlives
 * the punch that started them, so they tick rather than fire.
 */
/**
 * ONE TICK PER ROW OF THE LADDER, RISING, AND A BELL FOR FINAL.
 *
 * The HUD staggers the breakdown's rows (see RevealRow) and reports how many
 * are up; this voices each new one exactly once, a semitone or so higher each
 * time, so the card reads like a machine paying out rather than a table. The
 * cabinet's own turn tick is the sound — the same family, a different use.
 */
let revealTicksPlayed = 0
function playRevealTicks(machine: PunchMachineRuntime): void {
  if (!hud.revealLanded) { revealTicksPlayed = 0; return }
  const shown = hud.revealRowsShown
  while (revealTicksPlayed < shown) {
    const i = revealTicksPlayed
    const bell = i === hud.revealRowsTotal - 1
    playSfx(machine, SFX_TURN_TICK, bell ? 0.95 : 0.5, 'machine', bell ? 1.6 : 1 + i * 0.07)
    revealTicksPlayed += 1
  }
}

function updateShowWorld(machine: PunchMachineRuntime, now: number): void {
  if (islandVisual !== null) {
    const tf = Transform.getMutableOrNull(islandVisual)
    if (tf) {
      if (now < islandTiltUntil) {
        // Out fast, back slow, with a damped wobble at the end — an island that
        // snapped level again would read as a glitch rather than as a recovery.
        const t = 1 - (islandTiltUntil - now) / 3_400
        const envelope = t < 0.18 ? t / 0.18 : Math.exp(-2.6 * (t - 0.18)) * Math.cos(t * 9)
        const roll = islandTiltDeg * envelope * islandTiltAxis
        tf.rotation = Quaternion.fromEulerDegrees(roll * 0.45, 0, roll)
      } else if (islandTiltDeg !== 0) {
        islandTiltDeg = 0
        tf.rotation = Quaternion.Identity()
      }
    }
  }
  if (blackoutUntil > 0 && now >= blackoutUntil) {
    blackoutUntil = 0
    // Coming back is the event, not going out: the lamps return at full flash.
    machine.lightFlashUntil = now + 900
  }
}

/* -------------------------------------------------------------------------- *
 * HIGH GROUND — the layer above 999.
 * -------------------------------------------------------------------------- */

/**
 * ‼️THE HOOK. One function, called once per punch, off the AUTHORITATIVE score.
 *
 * The Show Director owns everything from 0 to 999 and is deliberately not a
 * threshold ladder — see `fireSlamFloor`, and do not fold this into it. This is
 * a different kind of thing: the discrete consequence of the room having pushed
 * a punch past a ceiling one person cannot reach alone. The score is the
 * trigger; the reaction to the PLACE and the PEOPLE is the reward, which is why
 * every event here has to happen to the island and the crowd rather than to the
 * scoreboard.
 *
 * ‼️ADDING AN EVENT is two edits, exactly like a show card: one id in
 * `PUNCH_HIGH_GROUND_BANDS` in the contract, one `case` here. The band it goes
 * in is what makes 1000 and 1100 different experiences instead of the same
 * animation with a bigger number over it.
 *
 * Everything is seeded off the snapshot, never `Math.random()`: two people
 * standing next to each other must draw the same event, or one gets launched
 * into the sky while the other watches nothing happen.
 */
function runHighGroundEvent(
  machine: PunchMachineRuntime,
  event: string,
  score: number,
  now: number
): void {
  switch (event) {
    // TEMPORARY, AND LABELLED AS SUCH. It exists so the whole chain — Boost,
    // attribution, threshold, hook, world reaction — can be played end to end
    // today. The real catalogue (lightning, blizzards, launching clouds, NPC
    // reactions, the island coming apart) is a separate pass and replaces this.
    case 'liftoff':
    default: {
      // THE PLACE. The island rolls further and longer than any ordinary punch
      // can make it, so the room can see it did something the machine alone
      // could not. Still the render-only mesh: collision is the separate
      // invisible boxes, so the picture heaves while the floor stays put.
      // Was 4_200 and ZERO DEGREES — the roll the whole event was named for
      // never happened. The cap is the event's whole roll; the envelope in
      // `updateShowWorld` runs on a 3_400 window, so the timings must agree.
      islandTiltUntil = now + 3_400
      islandTiltDeg = ISLAND_TILT_CAP_DEG
      islandTiltAxis = (score & 1) === 0 ? -1 : 1
      // THE MACHINE. Beyond the floor's own recoil, and layered with `max` so
      // this can only ever add to what the punch already dealt.
      machine.lurchUntil = Math.max(machine.lurchUntil, now + 3_000)
      raiseRock(machine, { pitch: 10, hangMs: 400, ms: 2200 })
      machine.shakeUntil = Math.max(machine.shakeUntil, now + 2_400)
      machine.lightFlashUntil = Math.max(machine.lightFlashUntil, now + 2_000)
      // THE PEOPLE. Everyone near the cabinet is thrown up off the deck — the
      // one reaction that is unmistakably happening to YOU rather than on a
      // screen. Declined moves are normal and are not worth a log line.
      // Fire belongs to contact. The group celebration owns the later payoff.
      break
    }
  }
}

/**
 * The catapult. `movePlayerTo` only moves THIS client's own player, which is
 * exactly right here: every client runs this for itself off the same snapshot,
 * so the whole deck goes up together without anybody's position being sent.
 *
 * Height is fixed rather than scaled by score. A launch that varies is a launch
 * players compare; the first version of this layer only has to prove the chain
 * works, and the ladder above it is where the drama gets tuned.
 */
function liftEveryoneNearby(machine: PunchMachineRuntime): void {
  if (!playerNearMachine(machine, PUNCH_HIGH_GROUND_LIFT_RANGE_M)) return
  const at = Transform.getOrNull(engine.PlayerEntity)?.position
  if (!at) return
  void (async () => {
    try {
      await movePlayerTo({
        newRelativePosition: {
          x: at.x,
          y: at.y + PUNCH_HIGH_GROUND_LIFT_M,
          z: at.z
        }
      })
    } catch {
      // Declined while the world is busy. The island roll still landed.
    }
  })()
}

/**
 * How long a declined seat teleport may keep retrying after the turn starts.
 */
const PUNCH_STRIKE_SEAT_WINDOW_MS = 3_500
/** Retry cadence for seat and evict — movePlayerTo is routinely declined once. */
const PUNCH_STRIKE_MOVE_RETRY_MS = 800
/**
 * How long the proximity read has to keep saying "not at the machine" before
 * the slot is actually given up. Long enough to outlast a hitch, a jump, a
 * knock-back and a celebration; short enough that somebody who really walked
 * off frees the bag before the shot clock would have.
 */
const PUNCH_AWAY_GRACE_MS = 3_000
/** JOIN that never appears on the shared list is a ghost session, not lag. */
const PUNCH_JOIN_CONFIRM_MS = 4_000
/** Live HTTP wire silent this long, with other people here, is a dead session. */
const PUNCH_GHOST_WIRE_MS = 8_000

/** Who the catapult reaches. Wide enough to be the whole deck, not the plaza. */
const PUNCH_HIGH_GROUND_LIFT_RANGE_M = 22
/** How far up. Survivable: the deck catches them on the way down. */
const PUNCH_HIGH_GROUND_LIFT_M = 9

/** The attempt whose cut has already fired. Serials only ever move forward. */
let perfectCutSerial = -1

/**
 * ‼️THE CUT — the machine's answer to a 999, and the only effect in this file
 * that works by SUBTRACTION.
 *
 * Owner, 2026-09-09: *"the 999 is never celebrated very specifically, it feels
 * like any other score."* True, and unfixable by adding anything: by 990 the
 * island is rolling, the cabinet is blowing out, meteors and blizzards and the
 * arc's own collapse are all live, and a fifteenth simultaneous effect is
 * invisible. Every additive channel was already spent.
 *
 * So the ceiling punch turns the room OFF. No sound, no light, no particles,
 * a dark arc — and one gold plate pulsing the number, which is the only thing
 * anybody can look at. Nothing else in this game has ever gone quiet, so it
 * reads instantly and costs nothing from the particle budget to do.
 *
 * ‼️FLOOR, NOT A CARD. It is called straight off the HUD's cut window with no
 * bag, no cooldown and no rarity roll, because a 999 that only *sometimes*
 * goes quiet would mean nothing. See `PUNCH_PERFECT_CUT_MS` for the rest.
 *
 * ‼️AND IT IS NOT THE HIGH GROUND EVENT. `punchIsPerfectScore` is exact
 * equality on `maxScore`: a four-digit punch is the room's doing and gets
 * `liftoff`, which throws the island rather than stopping it.
 */
function startPerfectCut(machine: PunchMachineRuntime, serial: number, now: number): void {
  if (perfectCutSerial === serial) return
  perfectCutSerial = serial
  // THE SOUND, in the two halves the voice mute had to learn (see
  // `togglePunchSfxMute`): dropping the queue is not enough on its own, because
  // what is already mid-clip plays straight through the silence; cutting the
  // slots is not enough either, because the queue refills them 3.2 s later.
  pendingPunchVoices.length = 0
  pendingMachineSfx.length = 0
  for (const other of machines) {
    for (const entity of other.audio) {
      const source = AudioSource.getMutableOrNull(entity)
      if (source) source.playing = false
    }
    // ‼️THE MUSIC GOES TOO, and that is deliberate rather than an oversight to
    // be fixed later: a celebration track playing on over the silence is the
    // one surface still arguing that this is an ordinary punch.
    for (const entity of [other.impactAudio, other.musicEntity]) {
      const source = entity ? AudioSource.getMutableOrNull(entity) : null
      if (source) source.playing = false
    }
  }
  // THE PARTICLES. Expired rather than deleted here — the sweep that owns
  // `bursts` already knows how to take one down, and two owners for one entity
  // is how a burst gets removed twice.
  for (const burst of bursts) burst.expiresAt = Math.min(burst.expiresAt, now)
  // THE LIGHT, on `world-blackout`'s own hook so there is one way for this deck
  // to go dark, held for the whole cut instead of that card's 520 ms beat.
  blackoutUntil = Math.max(blackoutUntil, now + PUNCH_PERFECT_CUT_MS)
  machine.lightFlashUntil = 0
  machine.shakeUntil = 0
  machine.lurchUntil = 0
  // THE ARC. Sixteen metres of screen left playing would be the loudest thing
  // on the island during the one moment nothing is supposed to be.
  arenaScreenPattern(
    arenaScreen,
    { pattern: 'collapse', palette: screenPalette(0), energy: 1, speed: 0.6, direction: 1, seed: serial },
    PUNCH_PERFECT_CUT_MS,
    now
  )
}

/**
 * THE FLOOR — everything a punch is GUARANTEED, every time, with no draw, no
 * cooldown and no rarity roll anywhere near it.
 *
 * ‼️THIS IS THE MOST IMPORTANT FUNCTION IN THE PLUGIN AND IT WAS DELETED ONCE.
 *
 * The Show Director shipped having replaced the old guaranteed stack — hard
 * flash, shake, sting, crowd roar, fireball, sky quake, celebration, all firing
 * together on every qualifying punch — with ONE CARD PER CHANNEL drawn from a
 * bag. Every measure of variety improved and the game died: a 940 could come
 * back as a puff of smoke and a slow screen fade, because the reward had stopped
 * being a certainty and become a lottery. The owner played it for one sitting:
 * *"I've never been this bored... before I was addicted... it's gotten
 * significantly worse."* He was right, and the cause was exactly this.
 *
 * So the contract is now explicit, and nothing may weaken it:
 *
 *   THE FLOOR IS GUARANTEED AND MONOTONIC. Harder punch, more of everything,
 *   always, with no randomness anywhere in this function.
 *   CARDS ARE ADDED ON TOP. They may never replace, gate or subtract from it.
 *
 * The three bands are the owner's own: a lot of feedback from 800, extremes
 * from 900, earth-shattering near 1000. Below 800 is deliberately still busy —
 * most punches land there, and they are what a session actually feels like.
 */
function fireSlamFloor(machine: PunchMachineRuntime, score: number, now: number): void {
  const heat = punchHeat(score, machine.config)
  const fx = effectPlan(machine)
  machine.lightFlashUntil = now + (300 + heat * 900) * fx.screenFx.gain
  // Keep the standing surface still. The cabinet has its own physical recoil.
  machine.shakeMag = 0
  machine.rockAt = now
  const energy = punchStreakEnergy(machine.slamStreak ?? 0)
  machine.rockPitchDeg = (0.7 + heat * heat * 7.5) * fx.cabinetMotion.gain * energy
  machine.rockRollDeg = (0.3 + heat * heat * 2.8) * fx.cabinetMotion.gain * energy
  machine.rockMs = 700 + heat * 1500
  machine.rockHangMs = score >= 950 ? 350 : 0
  if (fx.particles.gain > 0) spawnShowBurst(machine, {
    y: 1.45, count: Math.round(12 + heat * 55), lifetime: 0.65,
    gravity: 1.2, speed: [1 + heat * 2, 2 + heat * 4], size: [0.04, 0.11],
    from: Color4.create(1, 0.88, 0.45, 1), to: Color4.create(1, 0.65, 0.2, 0),
    angle: 65, radius: 0.22, holdMs: 1200
  })
  if (fx.fire.gain > 0) spawnBagFireball(machine)
  // SMOKE OFF THE BAG IS FLOOR, NOT A CARD. Owner, 2026-09-07: "there would be
  // smoke coming from the machine — I don't know what switched off the smoke."
  // The Show Director had: `cabinet-smoke` became one card in a bag, with a
  // window and a cooldown, so most punches had none. A machine that has just
  // been hit smokes; the cards may add the rear-panel plume on top.
  if (fx.particles.gain > 0 && heat >= 0.3) spawnImpactSmoke(machine)
  const rules = activeProfile(machine)
  const islandGain = floorGain(rules.effects.islandMotion)
  const cameraGain = floorGain(rules.effects.cameraMotion)
  const over01 = Math.max(0, Math.min(1, (score - ISLAND_ROLL_SCORE) / (machine.config.maxScore - ISLAND_ROLL_SCORE)))
  const reaches = punchSpectacleReachesMe(machine)
  // ‼️THE DIRECTOR DECIDES, NOT A CONSTANT. Both of these were hard-wired to
  // 900+ whatever the panel said, which is how "I upped every intensity to
  // 100% and nothing changed" (owner, 2026-09-08) was literally true for the
  // roll and the kick. floorCardFires reads the switch and the score and streak
  // gates the owner set; heat scales the size, so a 400 nudges the deck and a
  // 999 still throws it.
  const streakNow = machine.slamStreak ?? 0
  if (floorCardFires(rules.effects.islandMotion, score, streakNow) && islandGain > 0 && reaches) {
    // The clouds still quake with it — they are what a rider feels.
    startCloudQuake(score, punchIsMine(machine), islandGain * energy)
    // ~3° on a tap, 6° at 900, 16° at 999, growing with the streak, capped at 20°.
    islandTiltUntil = now + 3_400
    islandTiltDeg = Math.min(ISLAND_TILT_CAP_DEG, (2 + 4 * heat + 10 * over01) * energy * islandGain)
    islandTiltAxis = (score & 1) === 0 ? -1 : 1
  }
  // The camera kick — every punch the director allows, growing with heat,
  // score and streak to 3× the old ceiling; see `playPunchCameraImpulse`.
  if (punchIsMine(machine) && floorCardFires(rules.effects.cameraMotion, score, streakNow) && cameraGain > 0) {
    machine.cameraKickAt = now
    machine.cameraKickGain = cameraGain * (0.35 + 0.65 * heat + 2 * over01) * energy
  } else {
    machine.cameraKickAt = 0
    machine.cameraKickGain = 0
  }
  if (score >= 900 && punchIsMine(machine)) machine.screenCrackUntil = now + 650
  // THE BALL COMES OFF. 950+ knocks it clean off the arm; it bounces across
  // the deck, rolls out, and is back on the arm for the next punch.
  if (BALL_FLY_ENABLED && score >= BALL_FLY_SCORE && reaches && rules.effects.particles.enabled) launchLooseBall(machine, now, score, over01)
  // CONFETTI FROM THE SKY on every 900+ — the owner's "something falling from
  // the sky"; more of it the harder the hit, drifting down over the deck.
  // Special, not standard (owner, 2026-09-06: "don't overdo it on the confetti"): 950+.
  if (score >= CONFETTI_SCORE && reaches && rules.effects.particles.enabled) spawnConfetti(machine, over01)
}

/** Everything that must happen the instant the ball hits the top. */
function fireSlam(machine: PunchMachineRuntime, now: number): void {
  const beat = showBeatFor(machine, machine.slamScore)
  machine.slamStreak = beat.streak900
  machine.effectPlan = planPunchEffects(activeProfile(machine), { score: beat.score, streak: beat.streak900, serial: beat.index, seed: beat.seed })
  const intensity = machine.slamIntensity
  playImpact(machine, intensity)
  // The arc goes white-gold on the same frame the fist arrives — the flash and
  // the impact have to be one event or the screen reads as commentary on the
  // punch rather than part of it.
  arenaScreenSlam(
    arenaScreen,
    machine.slamScore,
    now,
    machine.slamName,
    machine.config,
    machine.slamPhaseAt || now,
    // The arc's motion is FLOOR too: the director's switch and intensity, never its cadence.
    floorGain(activeProfile(machine).effects.screenMotion) * punchStreakEnergy(beat.streak900),
    effectPlan(machine).particles.gain
  )
  const score = machine.slamScore
  // FLOOR FIRST, ALWAYS — then the variety on top of it. The order is the whole
  // lesson of the release that made this game boring; see `fireSlamFloor`.
  fireSlamFloor(machine, score, now)
  const showPlan = composeShow(beat, createShowLedger(), PUNCH_SHOW_CATALOG)
  for (const [effect, cardId] of [['lightning','world-lightning'], ['blizzard','world-blizzard']] as const) {
    showPlan.cards = showPlan.cards.filter(card => card.id !== cardId)
    // FLOOR, like the roll and the kick: the director's switch, intensity and
    // thresholds decide — never its chance or cadence, which is why a night
    // of 950s produced "no lightning coming from the sky".
    if (floorCardFires(activeProfile(machine).effects[effect], beat.score, beat.streak900)) {
      const card = PUNCH_SHOW_CATALOG.find(card => card.id === cardId)
      // The card keeps its own window: with every gate open, a tap must not
      // bring a blizzard. Lightning from heat 0.66, the blizzard from 0.97 —
      // the director can push these gates higher, never below the weather.
      if (card && beat.heat >= card.minHeat) showPlan.cards = [...showPlan.cards, card]
    }
  }
  runShowPlan(machine, showPlan, now)
  // Observers never surrender their camera to show choreography. World motion,
  // particles, lighting and audio carry the spectator impact; camera motion is
  // reserved for the active player's authored punch shot.
  // ‼️HIGH GROUND LAST, on top of a complete ordinary reaction. It is an EXTRA
  // layer, never a replacement: a 1043 must still get everything a 999 gets,
  // then the island heaves. Read off the authoritative attempt so every client
  // fires the same event for the same punch — the local `slamScore` is what
  // the marquee is counting to, not what the coordinator scored.
  // Consequences and voices wait for the number. A weak hit no longer gets a full chorus.
  machine.reactionAt = machine.slamPhaseAt + PUNCH_SCORE_HOLD_MS + punchRevealCountMs(score, activeProfile(machine))

}

/**
 * ‼️THE DECK NEVER CHANGES HEIGHT, AND THAT IS THE WHOLE OF THIS FIX.
 *
 * Owner, 2026-09-05: *"when the island shakes it looks like the avatars stay, so
 * they're kind of sinking with their feet into the ground when the island moves
 * up. Can avatars actually move with the island? Can we remove the collider?"*
 *
 * The answers, in order, because they decide the shape of everything below:
 *
 *   CAN THEY RIDE IT?  Not from a per-frame transform write, no. The explorer's
 *                      character controller only carries an avatar on a collider
 *                      moved by a **Tween** — which is exactly why the jump
 *                      clouds in `spawnSkyIsland` bob on one and carry whoever is
 *                      standing on them. A shake is chaotic, sub-frame noise; a
 *                      Tween per direction change is a CRDT message per direction
 *                      change, so the trick that works for a 3-second bob cannot
 *                      be turned into a 12 Hz rattle.
 *   REMOVE THE COLLIDER? Then everybody falls through the island. It is also not
 *                      what causes the look: the sinking is a picture problem.
 *                      Even if the collider stayed still and only the DRAWN deck
 *                      rose, the feet standing on it would still be buried — the
 *                      eye compares the boots to the floor it can see.
 *
 * So the deck's height is fixed, permanently, and the quake energy goes where
 * nothing is standing:
 *
 *   LATERAL   the island slides under everybody's feet, capped at
 *             `SHAKE_LATERAL_MAX`. Sliding costs nothing — a foot on a surface
 *             that moves sideways reads as the ground being shaken, which is what
 *             an earthquake looks like from inside one.
 *   VERTICAL  deleted. It was ±`shakeMag`/2, up to 17 cm on a big hit, and 17 cm
 *             is most of a boot.
 *   THE TIP   the jackpot lurch used to rotate `machine.root`, which is the
 *             parent of the invisible collider boxes — so the floor itself tipped
 *             and the rim rose nearly half a metre under anyone standing on it.
 *             It moves to the render-only island mesh (the same surface the
 *             `world-tilt` card uses, for the same reason) and comes down to a
 *             couple of degrees.
 *
 * The impact itself is not lost: the CABINET has its own node and rocks as hard
 * as it ever did — see `updateCabinetRock`, which is the thing that actually
 * reads as a two-tonne box being hit.
 */
/** The standing surface stays fixed. Recoil belongs to the cabinet and scenery. */
function updateShake(machine: PunchMachineRuntime, _now: number): void {
  const tf = Transform.getMutableOrNull(machine.root)
  if (tf) tf.position = Vector3.clone(machine.rootBase)
}

/**
 * A card RAISING the recoil the floor has already dealt, never replacing it.
 *
 * Every field is a `max`, so a card can only ever make the machine rock harder,
 * longer or further - which is the catalog's whole contract: cards are the
 * topping and the floor is the meal. The roll keeps whichever side the floor
 * seeded, so two clients can never disagree about which way the cabinet went.
 */
function raiseRock(
  machine: PunchMachineRuntime,
  spec: { pitch?: number; roll?: number; hangMs?: number; ms?: number }
): void {
  const gain = effectPlan(machine).cabinetMotion.gain
  if (!gain) return
  spec = { ...spec, pitch: spec.pitch === undefined ? undefined : spec.pitch * gain, roll: spec.roll === undefined ? undefined : spec.roll * gain }
  if (spec.pitch !== undefined) machine.rockPitchDeg = Math.max(machine.rockPitchDeg, spec.pitch)
  if (spec.roll !== undefined) {
    machine.rockRollDeg =
      machine.rockRollDeg < 0
        ? Math.min(machine.rockRollDeg, -spec.roll)
        : Math.max(machine.rockRollDeg, spec.roll)
  }
  if (spec.hangMs !== undefined) machine.rockHangMs = Math.max(machine.rockHangMs, spec.hangMs)
  if (spec.ms !== undefined) machine.rockMs = Math.max(machine.rockMs, spec.ms)
}

/**
 * THE MACHINE TAKES THE PUNCH.
 *
 * (!) THE BUG THIS FIXES IS A HIERARCHY BUG, NOT A MISSING EFFECT. The floor
 * already shook hard on every hit - and the owner's report was that the shaking
 * is exactly the problem: *"everything moves, even the island almost collapses,
 * but the machine itself never moves"*. He was right, and `updateShake` above is
 * why: it jitters `machine.root`, and the island, the crowd, the bag and the
 * cabinet all hang off that ONE entity, so they move together and nothing moves
 * relative to anything. A rigid group sliding about reads as a camera shake, not
 * as a two-tonne cabinet being hit. Turning the shake up cannot fix that; only
 * giving the cabinet a node of its own can.
 *
 * So `machine.rig` sits between the island and the hardware. Riding it: the
 * body, the marquee, the arm and its hanging bag, the meter, the score and
 * status text, the bulbs. (!) NOT riding it, ever: the colliders, the pointer
 * hitbox, the cameras and their focus, the crowd, the island. Collision never
 * moves - the island's own tilt has the same rule for the same reason, because
 * the floor under everybody's feet has to stay exactly where it was.
 *
 * The motion is a struck bell rather than a wobble - angular velocity at impact
 * and an exponential settle, so the tip is instant and the recovery is the slow
 * part:
 *
 *   PITCH  about the rear bottom edge, so the FRONT lifts off the deck and comes
 *          back down. This is the one the owner asked for by name.
 *   ROLL   half the size and slower, so the machine staggers sideways on the way
 *          down instead of nodding on rails. The side is seeded, never random.
 *
 * A hard enough hit HANGS at the top of the first tip before the settle starts,
 * which is the beat where the deck thinks the cabinet is going over. Below that
 * it simply rocks.
 */
function updateCabinetRock(machine: PunchMachineRuntime, now: number): void {
  if (machine.rockAt === 0) return
  const tf = Transform.getMutableOrNull(machine.rig)
  if (!tf) return
  const elapsed = now - machine.rockAt
  if (elapsed < 0) return
  if (elapsed >= machine.rockMs) {
    machine.rockAt = 0
    tf.position = Vector3.Zero()
    tf.rotation = Quaternion.Identity()
    return
  }
  // The hang is the CLOCK held still at the peak, not a second animation: the
  // curve is already at its maximum there, so freezing t is the whole trick.
  const held = Math.min(machine.rockHangMs, Math.max(0, elapsed - ROCK_PEAK_MS))
  const t = (elapsed - held) / 1_000
  const decay = Math.exp(-ROCK_DECAY * t)
  // sin(), not cos(): the machine is upright at the instant of contact and the
  // punch hands it angular VELOCITY. Starting at full tilt is a teleport.
  const pitch = (machine.rockPitchDeg / ROCK_PITCH_NORM) * decay * Math.sin(t * ROCK_PITCH_W)
  const roll = (machine.rockRollDeg / ROCK_ROLL_NORM) * decay * Math.sin(t * ROCK_ROLL_W)
  // Negative X lifts the front: the cabinet faces +Z in root space and the
  // pivot sits behind it, at -Z.
  tf.rotation = Quaternion.fromEulerDegrees(-pitch, 0, roll)
  // Rotate about that rear edge rather than about the root, and lift by however
  // far the rolled bottom corner would otherwise have gone through the deck.
  const swung = Vector3.rotate(ROCK_PIVOT, tf.rotation)
  tf.position = Vector3.create(
    ROCK_PIVOT.x - swung.x,
    ROCK_PIVOT.y - swung.y + Math.abs(Math.sin((roll * Math.PI) / 180)) * ROCK_HALF_WIDTH,
    ROCK_PIVOT.z - swung.z
  )
}

/**
 * THE SAME CROWD, WITH MORE TO SAY — a grammar, not a list.
 *
 * Twenty-five hand-written lines is twenty-five lines however cleverly they are
 * rationed, and the owner heard all of them: "other people say stuff, but always
 * the same stuff". Two short slots multiply instead of adding — the pools below
 * are about forty fragments and produce over two hundred lines, and every one of
 * them is short enough to survive a speech bubble, which a written-out sentence
 * frequently was not.
 *
 * Growth is a WORD, not a sentence: adding one opener adds a line to every body
 * in its mood at once.
 */
const SHOW_LINES: Record<string, { open: readonly string[]; body: readonly string[] }> = {
  'text-dry': {
    open: ['Hm.', 'Oof.', 'Eh.', 'Ouch.', 'Well.'],
    body: ['Warm up.', 'Next.', 'Try again.', 'Nope.', 'Barely moved.', 'Bad luck.']
  },
  'text-mild': {
    open: ['OK.', 'Right.', 'Fine.', 'Sure.'],
    body: ['Not bad.', 'Getting there.', 'A bit more.', 'Seen worse.', 'Halfway.']
  },
  'text-warm': {
    open: ['Nice!', 'Yes!', 'Ooh!', 'Hey!'],
    body: ['Big hit.', 'Real power.', 'Now we talk.', 'Solid one.', 'That landed.', 'Proper.']
  },
  'text-loud': {
    open: ['WOW!', 'YES!', 'HUGE!', 'OH!'],
    body: ['Massive!', 'Look at it!', 'Smashed it!', 'Insane!', 'Unreal!']
  },
  'text-riot': {
    open: ['NO WAY!', 'WHAT?!', 'STOP!', 'HELP!'],
    body: ['IT BROKE!', 'INSANE!', 'MONSTER!', 'UNREAL!', 'I FELT THAT!']
  },
  // The two that react to what HAPPENED rather than to the number — the cheapest
  // way to make a crowd sound like it has been watching.
  'text-record': {
    open: ['RECORD!', 'TOP SCORE!', 'NEW BEST!', 'THAT IS IT!'],
    body: ['Nobody beats that.', 'Put it up!', 'Best today.', 'Get the board!']
  },
  'text-streak': {
    open: ['AGAIN?!', 'TWICE!', 'STILL GOING!', 'NON-STOP!'],
    body: ['Every time!', 'On fire.', 'Not human.', 'Again and again.']
  }
}

/** Bubbles are decoration, not subtitles; anything longer gets cut in world. */
const SHOW_LINE_MAX = 22

/**
 * Deal one mood's words out to the watchers.
 *
 * Seeded from the beat, so every client hears the same crowd — a room where each
 * spectator's neighbours are saying different things is not one room.
 */
function queueShowSpeech(
  machine: PunchMachineRuntime,
  cardId: string,
  beat: ShowBeat,
  rng: ShowRng
): void {
  const grammar = SHOW_LINES[cardId]
  if (!grammar) return
  const bots = watcherBots(machine)
  if (!bots.length) return
  // The bigger the punch, the more of the room joins in — one mutterer for a
  // tap, three people shouting over each other for a monster.
  // ONE VOICE, unless the punch genuinely warrants a second. Three bots
  // answering at once reads as a chorus rather than a crowd, and it was three
  // on anything over 0.9 — which, with heat cubed, is most of the punches
  // anybody is proud of. The ceiling drops to two, and only at the very top.
  const speakers = Math.min(bots.length, Math.ceil(activeProfile(machine).bubbles * effectPlan(machine).crowdText.gain))
  const order = rng.shuffle(bots.map((_, index) => index))
  const now = Date.now()
  const used = new Set<string>()
  for (let i = 0; i < speakers; i += 1) {
    let line = ''
    // Two people must not say the same thing on the same punch; a handful of
    // tries is plenty against pools this size and cannot loop.
    for (let attempt = 0; attempt < 6 && (!line || used.has(line)); attempt += 1) {
      const open = grammar.open[Math.floor(rng.next() * grammar.open.length)]!
      const body = grammar.body[Math.floor(rng.next() * grammar.body.length)]!
      const joined = `${open} ${body}`
      line = joined.length <= SHOW_LINE_MAX ? joined : open
    }
    if (used.has(line)) continue
    used.add(line)
    // Staggered, so the crowd ripples instead of popping like a wall of balloons.
    pendingSpeech.push({
      at: machine.slamPhaseAt + PUNCH_SCORE_HOLD_MS + punchRevealCountMs(beat.score, activeProfile(machine)) + 200 + i * 2400,
      bot: bots[order[i]!]!.entity,
      line
    })
  }
}

const pendingSpeech: Array<{ at: number; bot: Entity; line: string }> = []

function flushCrowdSpeech(now: number): void {
  for (let i = pendingSpeech.length - 1; i >= 0; i -= 1) {
    const item = pendingSpeech[i]!
    if (now < item.at) continue
    pendingSpeech.splice(i, 1)
    showNpcSpeech(item.bot, item.line, 2_200)
  }
}

/**
 * Lore whispers: every couple of minutes one NPC murmurs a fragment about the
 * machine's secrets. This is the seam mechanic's only tutorial — learning the
 * game by listening to the regulars IS the game.
 */
const LORE_LINES = [
  'The old-timers always waited for the seam…',
  'They say the bag remembers which way it was facing.',
  'Watch the stitching. That is all I will say.',
  'The OGs never punched a turning back.',
  'Strongest hits land face-on. Face-on to WHAT, though…',
  'Knock one, three, one. The bag listens.',
  'I saw a champ rattle the bag before the punch. One-three-one, like a door.',
  'Two hands in, one hand out — that is how the old champs let go.',
  'Keep a finger on F when you let it fly. The wrist locks true.'
]
let nextLoreAt = 0
function updateLore(machine: PunchMachineRuntime, now: number, nearby: boolean): void {
  if (!nearby || machine.network?.snapshot().active) return
  if (nextLoreAt === 0) nextLoreAt = now + 45_000
  if (now < nextLoreAt) return
  nextLoreAt = now + 120_000 + Math.random() * 60_000
  const bots = watcherBots(machine)
  const bot = bots[Math.floor(Math.random() * bots.length)]
  const line = LORE_LINES[Math.floor(Math.random() * LORE_LINES.length)]!
  if (bot) showNpcSpeech(bot.entity, line, 3_200)
}

/**
 * THE IDLE JINGLE IS GONE, and this note is its headstone.
 *
 * `updateAttract` played a chiptune sting from `PUNCH_AUDIO.attract` every ~30 s
 * for anyone standing near the machine. Two things made it read as a bug rather
 * than as ambience, and the owner asked for it removed outright (2026-09-03):
 *
 *   THE GATE WAS WRONG.  It suppressed the jingle only while the phase was
 *   'charging'. A finished round goes 'scoring' -> 'cooldown' -> 'summary',
 *   none of which are 'charging' — so the jingle was free to fire the instant
 *   somebody's game ended, which is exactly when it was heard.
 *
 *   THEN IT WAS CUT OFF.  `playSfx` writes through a small round-robin entity
 *   pool with `createOrReplace`. The score sting, the voice line and the crowd
 *   reaction all fire immediately after a punch lands, wrap the pool and
 *   overwrite the entity still playing the three-second jingle. One second of
 *   music, then silence — the reported symptom, exactly.
 *
 * It could not be turned off either: it played on the 'machine' channel,
 * bundled with impacts, clunks, the charge rise and the score stings, so there
 * was no mute that reached it without killing the cabinet's whole voice.
 *
 * ‼️Do not reinstate it by re-reading `PUNCH_AUDIO.attract`. The twelve clips
 * are also dropped from the bundle allowlist in `scripts/publish/
 * bundle-scene-template.ts`, so a caller added later would resolve nothing in a
 * deployed scene and only misbehave in local dev.
 */

/**
 * ATTRACT SHOW — the machine is never dead. While no human is engaged a troupe
 * bot steps up, takes a real-looking turn (walk in, cross punch, arm swing,
 * slam, score reveal, two fans react) and returns to the horseshoe. Local
 * theater only: every client improvises its own show and nothing touches the
 * shared leaderboard — ambience, not history — so nothing can desync. The
 * moment a human engages, the bot yields and the stage is theirs. Bot scores
 * stay under 900 on purpose: the celebration belongs to people.
 */
const SHOW_IDLE_MS = 18_000
const SHOW_WATCH_RADIUS_M = 40

function playerWithinM(machine: PunchMachineRuntime, radius: number): boolean {
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (!player) return false
  const center = getWorldPosition(engine, machine.root)
  return Math.hypot(player.position.x - center.x, player.position.z - center.z) <= radius
}

/** Send a performer back to the watching arc it came from. */
function returnBotToCrowd(machine: PunchMachineRuntime, bot: TroupeBot | null): void {
  endBotPerformance(machine, bot)
  if (!bot) return
  if (machine.crowdGathered || machine.config.skyIslandEnabled) {
    const center = getWorldPosition(engine, machine.root)
    const { dx, dz } = punchWatcherSlot(bot.index, Math.max(1, machine.watcherCount))
    setBotSceneTarget(bot, {
      x: center.x + dx,
      y: center.y,
      z: center.z + PUNCH_STRIKE_Z + dz,
      mode: 'audience',
      faceAt: { x: center.x, z: center.z + PUNCH_BAG_Z }
    })
    bot.holdUntil = Number.MAX_SAFE_INTEGER
  } else {
    bot.holdUntil = 0
    setBotTarget(bot, 'hangout')
  }
}

/** Walk a performer onto the strike spot, facing the bag. */
function stageBotAtBag(machine: PunchMachineRuntime, bot: TroupeBot): void {
  const visible = Transform.getMutableOrNull(bot.entity)
  if (visible) visible.scale = Vector3.One()
  const center = getWorldPosition(engine, machine.root)
  setBotSceneTarget(bot, {
    x: center.x,
    y: center.y,
    z: center.z + PUNCH_STRIKE_Z,
    mode: 'audience',
    faceAt: { x: center.x, z: center.z + PUNCH_BAG_Z }
  })
  bot.holdUntil = Number.MAX_SAFE_INTEGER
  stopBotEmote(bot)
  armSwingEmotes(bot)
}

/**
 * Point the athlete at the bag, every frame, from here.
 *
 * The troupe only applies a bot's `faceAt` once it has ARRIVED — within 0.18 m
 * of its target — and a fighter that stops 30 cm short because it steered round
 * a neighbour never qualifies. It then stands at the machine looking sideways,
 * which is precisely how it looked. Facing is cheap; owning it outright beats
 * depending on an arrival test that a crowded deck can deny forever.
 */
function faceBotAtBag(machine: PunchMachineRuntime, bot: TroupeBot): void {
  const tf = Transform.getMutableOrNull(bot.entity)
  if (!tf) return
  const center = getWorldPosition(engine, machine.root)
  const dx = center.x - tf.position.x
  const dz = center.z + PUNCH_BAG_Z - tf.position.z
  if (Math.hypot(dx, dz) < 0.05) return
  tf.rotation = Quaternion.fromEulerDegrees(0, (Math.atan2(dx, dz) * 180) / Math.PI, 0)
}

/**
 * Claim a troupe NPC for the house bot and report the name to put on the board.
 * Called by the coordinator the moment it seeds the queue — once per turn, so a
 * DIFFERENT regular steps up each round and the rotation is visible rather than
 * one NPC monopolising the bag.
 *
 * The claim is stored as the bot's own `index`, not a position in the array
 * `getTroupeBots()` builds: that array is filtered fresh on every call, so a
 * stored position silently starts pointing at somebody else the moment a bot is
 * stationed or released.
 */
function claimHouseBot(machine: PunchMachineRuntime): string | null {
  const bots = getTroupeBots()
  if (!bots.length) return null
  // NOT A BODY THAT IS CHANNELLING. The two flanks wear the FOCUSING part; pulling
  // one of them to the bag re-deals the part to another body and leaves whatever
  // balloon was over this one exactly where it was - over the fighter. Prefer any
  // other body; fall back to the whole troupe only if nobody else exists.
  const free = bots.filter((candidate) => !machine.focusBotIndices.includes(candidate.index))
  const pool = free.length ? free : bots
  const bot = pool[Math.floor(Math.random() * pool.length)]
  if (!bot) return null
  machine.houseBotIndex = bot.index
  return AvatarShape.getOrNull(bot.entity)?.name ?? 'The Regular'
}

/** The claimed NPC, resolved by identity every time it is needed. */
function houseBotBody(machine: PunchMachineRuntime): TroupeBot | null {
  if (machine.houseBotIndex < 0) return null
  return getTroupeBots().find((bot) => bot.index === machine.houseBotIndex) ?? null
}

/**
 * NAME THE FLANKS FOR THE COORDINATOR — the `focusBots` callback.
 *
 * Two names means "run two regulars this turn"; an empty list means the arc has
 * no bodies to spare and the circle is people only. It is asked once per turn,
 * so a deck that has filled up with humans quietly stops lending NPCs, which is
 * the right answer: the whole reason they are there is that nobody else was.
 */
function claimFocusBots(machine: PunchMachineRuntime): string[] {
  return channellerBots(machine).map(
    (bot) => AvatarShape.getOrNull(bot.entity)?.name ?? 'A regular'
  )
}

/** The local body wearing a reserved roster id, or null while none is bound. */
function focusBotBody(machine: PunchMachineRuntime, userId: string): TroupeBot | null {
  const slot = (PUNCH_FOCUS_BOT_IDS as readonly string[]).indexOf(userId.toLowerCase())
  if (slot < 0) return null
  const index = machine.focusBotIndices[slot] ?? -1
  if (index < 0) return null
  return getTroupeBots().find((bot) => bot.index === index) ?? null
}

/** The meditation clip is a one-shot, so the pose is a re-trigger on a beat. */
const CHANNEL_EMOTE_EVERY_MS = 2_400

/**
 * BIND THE ROSTER'S REGULARS TO LOCAL BODIES, AND KEEP THEM CHANNELLING.
 *
 * The coordinator decides how many regulars are in the circle and which way
 * each is pushing; every client decides for itself WHICH of its own NPCs wears
 * that part, exactly as it already does for the house bot. Binding is by the
 * reserved id's fixed position rather than by where the member landed in the
 * roster, because the roster is re-sorted by quality on every tick — a
 * positional binding would swap the two bodies several times a second.
 *
 * ‼️The clip is ARMED before it is fired and the arming LEASES the body: an NPC
 * writes a scene emote by path into one of ten slots, and a clip slotted in on
 * the frame it is triggered lands unbound (the standing dummy). The lease is
 * the other half — without it the crowd director, the ambient backfill and the
 * applause pass all overwrite the pose within a tick, which is the difference
 * between two NPCs meditating and two NPCs standing there.
 */
function updateFocusChannellers(
  machine: PunchMachineRuntime,
  focus: PunchFocusState | undefined,
  now: number
): void {
  if (now < (machine.celebrationUntil ?? 0)) return
  const present = new Set(
    (focus?.circle ?? []).map((member) => member.userId.toLowerCase())
  )
  const wanted = PUNCH_FOCUS_BOT_IDS.map((id) => present.has(id))
  const bodies = wanted.some(Boolean) ? channellerBots(machine) : []
  let cursor = 0
  const next = wanted.map((isWanted) => {
    if (!isWanted) return -1
    const bot = bodies[cursor]
    if (!bot) return -1
    cursor += 1
    return bot.index
  })
  const changed = next.some((index, slot) => index !== (machine.focusBotIndices[slot] ?? -1))
  if (changed) {
    // HAND BACK WHOEVER IS NO LONGER CHANNELLING, or the lease outlives the
    // turn and that NPC never claps, never whispers and never dances again.
    for (const index of machine.focusBotIndices) {
      if (index < 0 || next.includes(index)) continue
      const leaving = getTroupeBots().find((bot) => bot.index === index) ?? null
      if (!leaving) continue
      releaseBotEmotes(leaving)
      stopBotEmote(leaving)
    }
    machine.focusBotIndices = next
    // A fresh body starts its pose now rather than up to a beat from now.
    machine.focusBotEmoteAt = 0
  }
  const channelling = next
    .map((index) => (index < 0 ? null : getTroupeBots().find((bot) => bot.index === index) ?? null))
    .filter((bot): bot is TroupeBot => !!bot)
  if (!channelling.length) return
  const center = getWorldPosition(engine, machine.root)
  for (const bot of channelling) {
    // Turned toward the bag every frame, for the same reason the athlete is:
    // the troupe only applies `faceAt` once a bot has ARRIVED, and one that
    // stopped 30 cm short of its mark stands channelling at the sky.
    const tf = Transform.getMutableOrNull(bot.entity)
    if (!tf) continue
    const dx = center.x - tf.position.x
    const dz = center.z + PUNCH_BAG_Z - tf.position.z
    if (Math.hypot(dx, dz) > 0.05) {
      tf.rotation = Quaternion.fromEulerDegrees(0, (Math.atan2(dx, dz) * 180) / Math.PI, 0)
    }
  }
  if (now < machine.focusBotEmoteAt) return
  if (CHANNEL_BOT_EMOTES.length) {
    // Retried rather than assumed: the content map resolves asynchronously, so
    // a bot that took the flank during boot has no URNs to bind yet.
    for (const bot of channelling) {
      if (armBotEmotes(bot, CHANNEL_BOT_EMOTES)) continue
      machine.focusBotEmoteAt = now + 500
      return
    }
  }
  machine.focusBotEmoteAt = now + CHANNEL_EMOTE_EVERY_MS
  for (const bot of channelling) {
    playBotEmote(bot, CHANNEL_BOT_EMOTES[0] ?? FOCUS_BASE_EMOTE, true)
    // Outlive the next re-trigger, not the turn: the crowd's own tick clears
    // any trigger whose stop time has passed, so a pose nobody renews drops on
    // its own the moment the circle breaks up.
    bot.stopEmoteAt = now + CHANNEL_EMOTE_EVERY_MS + 900
  }
}

/**
 * WHO IS ON STAGE. The house bot's body while it is up, otherwise the attract
 * show's athlete. Exists so the crowd keeper can leave that one bot alone: it
 * is the only NPC in the scene that is supposed to be off its audience mark.
 */
function performingBot(machine: PunchMachineRuntime): TroupeBot | null {
  if (machine.houseBotStagedIndex >= 0) {
    return getTroupeBots().find((bot) => bot.index === machine.houseBotStagedIndex) ?? null
  }
  if (machine.showPhase !== 'idle' && machine.showBotIndex >= 0) {
    return getTroupeBots()[machine.showBotIndex] ?? null
  }
  return null
}

/**
 * The house bot's BODY, driven off the shared snapshot — never off local timers.
 * The score, the slam, the marquee and the crowd already come from the round
 * state (presentCompetitionState), so all this owes the world is an avatar that
 * walks up on its turn, throws the swing on the frame the punch lands, and goes
 * back to the rail when the turn passes.
 */
function updateHouseBotTurn(
  machine: PunchMachineRuntime,
  snapshot: PunchCompetitionSnapshot,
  now: number
): void {
  const botIsUp = snapshot.active?.userId === PUNCH_HOUSE_BOT_ID
  // Anyone standing at the bag who should no longer be there goes back to the
  // rail first — the turn passed to a human, or the coordinator has already
  // claimed a different regular for the next round.
  if (
    machine.houseBotStagedIndex >= 0 &&
    (!botIsUp || machine.houseBotStagedIndex !== machine.houseBotIndex)
  ) {
    const leaving = getTroupeBots().find((b) => b.index === machine.houseBotStagedIndex) ?? null
    machine.houseBotStagedIndex = -1
    returnBotToCrowd(machine, leaving)
  }
  if (!botIsUp) return
  const bot = houseBotBody(machine)
  if (!bot) return
  if (machine.houseBotStagedIndex !== machine.houseBotIndex) {
    machine.houseBotStagedIndex = machine.houseBotIndex
    machine.houseBotStagedAt = now
    stageBotAtBag(machine, bot)
  }
  const center = getWorldPosition(engine, machine.root)
  const markZ = center.z + PUNCH_STRIKE_Z
  const tf = Transform.getMutableOrNull(bot.entity)
  if (tf) {
    const off = Math.hypot(tf.position.x - center.x, tf.position.z - markZ)
    // ‼ NEVER re-stage on a per-frame distance test. `stageBotAtBag` calls
    // `stopBotEmote`, so a fighter that settles even 50 cm short — steering
    // round a neighbour is enough — had its target reset and its emote killed
    // on EVERY frame: it could not finish walking and it could not throw a
    // punch. That one line is why the NPC stood at the machine doing nothing.
    //
    // So: give it a couple of seconds to walk in on its own legs, and if the
    // deck will not let it through, put it on the mark. gatherCrowd already
    // teleports the whole audience into place for exactly this reason — a
    // procession that never arrives is worse than one that was simply there.
    // Walked in, or given its two seconds: from here the body is PINNED to the
    // mark (troupe honours `pin` before any steering), so nothing on the deck
    // can shove it and nothing needs to snap it back.
    if (!bot.pin && (off <= 0.35 || now - machine.houseBotStagedAt > 2_200)) {
      bot.pin = { x: center.x, z: markZ }
      tf.position = Vector3.create(center.x, center.y, markZ)
    }
  }
  faceBotAtBag(machine, bot)
  // Squared up at the bag between punches — the same fighting idle the player
  // drops into standing on this spot. The arming lives in here too, so the
  // swing below fires into a list Explorer has already bound.
  holdBotStance(machine, bot, now)
  // The swing, on the frame the punch lands — the same instant the arm, the
  // slam and the crowd reaction are scheduled from the snapshot, so the NPC
  // hits the bag rather than miming next to it.
  if (snapshot.phase === 'scoring' && machine.housePunchedSerial !== snapshot.serial) {
    machine.housePunchedSerial = snapshot.serial
    // The same clip a human's score would pick, so a big hit from the house
    // looks like a big hit — jab, cross, haymaker or uppercut off the score it
    // just made, seeded so every viewer sees the same swing.
    playBotEmote(
      bot,
      punchEmoteFor(snapshot.score, machine.config, snapshot.chargeStartedAt),
      false
    )
    bot.stopEmoteAt = now + PUNCH_CLIP_MS
    // The swing owns the body until it has played out. Without this the stance
    // re-trigger lands a beat later and cuts the punch back to the idle.
    suspendBotStance(machine, now, PUNCH_CLIP_MS)
  }
}

function dismissShowBot(machine: PunchMachineRuntime, bot: TroupeBot | null): void {
  machine.showPhase = 'idle'
  machine.showPhaseAt = Date.now() + SHOW_IDLE_MS + Math.random() * 15_000
  machine.showBotIndex = -1
  machine.showBotName = ''
  returnBotToCrowd(machine, bot)
}

function presentShowScore(machine: PunchMachineRuntime, now: number): void {
  const shown = revealShownScore(machine.showScore, now - machine.showResultAt)
  setText(machine.scoreText, String(shown).padStart(3, '0'))
  updateIndicator(machine, shown)
  setText(
    machine.statusText,
    now - machine.showResultAt >= PUNCH_SCORE_HOLD_MS + PUNCH_SCORE_COUNT_MS ? 'SCORE' : 'POWER'
  )
}

function updateAttractShow(machine: PunchMachineRuntime, now: number, humanEngaged: boolean): void {
  const bots = getTroupeBots()
  if (machine.showPhase === 'idle') {
    if (humanEngaged || !bots.length || !playerWithinM(machine, SHOW_WATCH_RADIUS_M)) return
    if (now < machine.showPhaseAt) return
    const index = Math.floor(Math.random() * bots.length)
    const bot = bots[index]
    if (!bot) return
    machine.showBotIndex = index
    machine.showBotName = (AvatarShape.getOrNull(bot.entity)?.name ?? 'A REGULAR').toUpperCase()
    machine.showPhase = 'approach'
    machine.showPhaseAt = now + 2_400
    armSwingEmotes(bot)
    const center = getWorldPosition(engine, machine.root)
    setBotSceneTarget(bot, {
      x: center.x,
      y: center.y,
      z: center.z + PUNCH_STRIKE_Z,
      mode: 'audience',
      faceAt: { x: center.x, z: center.z + PUNCH_BAG_Z }
    })
    bot.holdUntil = Number.MAX_SAFE_INTEGER
    stopBotEmote(bot)
    // Square up on the walk-up. The approach beat exists so the clips are bound
    // and the fighter is already in its stance before the windup ends.
    holdBotStance(machine, bot, now)
    return
  }
  const bot = bots[machine.showBotIndex] ?? null
  // A human stepping up ends the show instantly — the stage is theirs. The
  // in-flight arm/slam is left to finish; it reads as the machine settling.
  if (humanEngaged || !bot) {
    dismissShowBot(machine, bot)
    return
  }
  // World-space queue copy used to float as cyan text in the sky from a glider.
  // Held for the whole turn, swing included — `suspendBotStance` keeps it off
  // the body while the punch plays and it comes back the moment the clip is
  // done. Without the resume the fighter loops its own punch at the bag: an
  // AvatarShape repeats its last expression until something replaces it.
  holdBotStance(machine, bot, now)
  if (machine.showPhase === 'approach' && now >= machine.showPhaseAt) {
    machine.showPhase = 'windup'
    machine.showPhaseAt = now + 900
  } else if (machine.showPhase === 'windup' && now >= machine.showPhaseAt) {
    machine.showPhase = 'result'
    machine.showResultAt = now
    machine.showScore = Math.round(480 + Math.random() * 390)
    machine.showPhaseAt = now + PUNCH_SCORE_HOLD_MS + PUNCH_SCORE_COUNT_MS + 900
    // Same rule as a real turn: the clip matches the score it just put up.
    playBotEmote(
      bot,
      punchEmoteFor(machine.showScore, machine.config, machine.showPhaseAt),
      false
    )
    bot.stopEmoteAt = now + PUNCH_CLIP_MS
    suspendBotStance(machine, now, PUNCH_CLIP_MS)
    machine.armSwingAt = now + EMOTE_CONTACT_MS
    machine.armReturnMs = armReturnMs(machine.showScore, 0, activeProfile(machine))
    machine.slamAt = now + SLAM_DELAY_MS
    machine.slamPhaseAt = now
    machine.slamIntensity = punchReactionIntensity(machine.showScore, machine.config)
    machine.slamScore = machine.showScore
    machine.slamName = machine.showBotName
    scheduleReveal(machine, machine.showScore, now + PUNCH_SCORE_HOLD_MS)
  } else if (machine.showPhase === 'result') {
    presentShowScore(machine, now)
    if (now < machine.showPhaseAt) return
    // Count finished: two regulars approve, the athlete rejoins the rail.
    for (let offset = 1; offset <= 2; offset += 1) {
      const fan = bots[(machine.showBotIndex + offset) % bots.length]
      if (!fan || fan === bot) continue
      playBotEmote(fan, offset === 1 ? 'clap' : 'fistpump', false)
      fan.stopEmoteAt = now + 3_000
    }
    dismissShowBot(machine, bot)
  }
}

/**
 * The machine performs even when nobody is punching: the marquee arc chases,
 * the rail pucks breathe, the star blinks with a chime — and on a slam the
 * whole set flashes together.
 */
function updateShowLights(machine: PunchMachineRuntime, now: number): void {
  // THE FRAME'S ONE READ OF THE SCREEN. Everything that paints a bulb this frame
  // — here and in `paintMeter`, which is called from four different score paths
  // later in the same loop — answers this, so the set can only ever agree.
  lampCue = arenaScreenLampCue(arenaScreen, now)
  lampVoice = punchAudioLevel01(now)
  // OVERLOAD: everything strobes RED like a hardware fault, then recovers.
  if (now < machine.overloadUntil) {
    const strobe = Math.floor(now / 130) % 2 === 0
    const red = Color3.create(1, 0.1, 0.05)
    for (const light of [...machine.lights, ...machine.podLights]) {
      Material.setPbrMaterial(light, {
        albedoColor: Color4.create(1, 0.1, 0.05, 1),
        emissiveColor: red,
        emissiveIntensity: strobe ? 7 : 0.4,
        roughness: 0.3
      })
    }
    machine.meter.forEach((seg) => {
      Material.setPbrMaterial(seg, {
        albedoColor: Color4.create(0.6, 0.05, 0.03, 1),
        emissiveColor: red,
        emissiveIntensity: strobe ? 5 : 0.8,
        roughness: 0.5,
        metallic: 0.1
      })
    })
    return
  }
  // ‼️★★★THE BOND, and everything below reads it. See `arenaScreenLampCue`.
  //
  // Note what this does NOT do: it does not add an animation, change a chase or
  // introduce a new state machine. Every family below moves exactly as it always
  // did. What changes is the two things that were making the cabinet and the
  // screen read as strangers — the COLOUR each bulb wears and the CLOCK its
  // chase steps on — which come from the arc while the bond is on and from the
  // bulb's own constants while it is off.
  const cue = lampCue
  const voice = lampVoice
  // How hard the machine's voice is pushing the set this frame. Unbonded it is
  // 1, i.e. the lamps as they have always been: the sound only reaches them
  // through the bond, so an unlocked cycle is genuinely the old behaviour and
  // not a quieter version of the new one.
  const pump = cue.bonded ? 1 + voice * LAMP_VOICE_LIFT : 1
  const bondColor = Color3.create(cue.colour.r, cue.colour.g, cue.colour.b)
  const bondAlbedo = Color4.create(cue.colour.r, cue.colour.g, cue.colour.b, 1)

  const flashing = now < machine.lightFlashUntil
  // The marquee. Bonded, the whole arc of bulbs wears the tier's colour and
  // steps on the arc's beat, so the seven above the glass and the twenty behind
  // the machine are running one chase rather than two.
  const chase = Math.floor(now / (cue.bonded ? cue.beatMs : 150)) % machine.lights.length
  machine.lights.forEach((light, i) => {
    const color = cue.bonded ? bondAlbedo : i % 2 === 0 ? Color4.fromHexString('#FFD15A') : CYAN
    const lit = flashing || i === chase || i === (chase + 1) % machine.lights.length
    Material.setPbrMaterial(light, {
      albedoColor: color,
      emissiveColor: Color3.create(color.r, color.g, color.b),
      emissiveIntensity: (flashing ? 6 : lit ? 3.2 : 0.35) * pump,
      roughness: 0.25,
      metallic: 0.05
    })
  })
  // Side pods: a light runs up each column; on a slam all six burn gold.
  //
  // ★These are the three-a-side the owner names first, and they are the pair the
  // bond helps most: they sit directly under the score panel with sixteen metres
  // of screen immediately behind them, so any disagreement between the two is
  // in a single glance. Bonded they take the arc's colour and the arc's step.
  const podStep = Math.floor(now / (cue.bonded ? cue.beatMs : 220)) % 3
  machine.podLights.forEach((light, i) => {
    const lit = flashing || i % 3 === podStep
    const podColor = cue.bonded ? bondColor : flashing ? Color3.create(1, 0.82, 0.35) : INDICATOR_GLOW
    Material.setPbrMaterial(light, {
      albedoColor: cue.bonded ? bondAlbedo : flashing ? Color4.fromHexString('#FFD15A') : CYAN,
      emissiveColor: podColor,
      emissiveIntensity: (flashing ? 6 : lit ? 4 : 0.6) * pump,
      roughness: 0.3
    })
  })
  /**
   * ‼️THE CABINET'S HALF OF THE FUMBLE WARNING — the rail, TIGHTENING.
   *
   * Owner, 2026-09-08: *"make it physical, not text."* The reticle carries the
   * warning where the player is looking; this carries it where the ROOM is
   * looking, so a spectator can see a dangerous punch coming without reading
   * anything. Two changes, both to things the rail already does:
   *
   *   the BREATH SPEEDS UP — 640 ms at rest down to about 200 ms at full risk;
   *   the OFFSET COLLAPSES — `(i % 2)` staggers the strip into two alternating
   *     halves at rest, and that stagger goes to zero as risk climbs, so the
   *     whole rail pulses as ONE. That is the "tightening": the machine stops
   *     idling and starts holding its breath with you.
   *
   * ‼️IT YIELDS TO EVERYTHING. `flashing` (an impact) and `cue.bonded` (the arc
   * owns the colour) both win outright — a warning about the next punch must
   * never overwrite the reaction to the last one. See [[punch-house-light-rig]]:
   * these emissives light nothing, so this is a colour the room reads, not
   * illumination it depends on.
   */
  const risk = cue.bonded || flashing ? 0 : Math.max(0, Math.min(1, (hud.fumbleRisk01 ?? 0) * (0.4 + 0.6 * (hud.fumbleStake01 ?? 0))))
  const breathe = 0.5 + Math.sin(now / (640 - risk * 440)) * (0.35 + risk * 0.4)
  const alertGlow = Color3.create(1, 0.24, 0.16)
  machine.railGlow.forEach((glow, i) => {
    Material.setPbrMaterial(glow, {
      albedoColor: Color4.fromHexString('#123A3EFF'),
      emissiveColor: cue.bonded ? bondColor : flashing ? Color3.create(1, 0.82, 0.35)
        : risk > 0.02 ? Color3.lerp(INDICATOR_GLOW, alertGlow, risk) : INDICATOR_GLOW,
      emissiveIntensity: (flashing ? 4.5 : breathe + (i % 2) * 0.2 * (1 - risk)) * pump,
      roughness: 0.4
    })
  })
}

/**
 * Aim UI only when ENGAGED: standing at the machine (within 4.2 m) and looking
 * at it (~40° cone). The old wide cone with no distance cap floated targets
 * over the deck the moment the machine drifted into view.
 */
function updateFacing(machine: PunchMachineRuntime): void {
  const cam = Transform.getOrNull(engine.CameraEntity)
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (!cam || !player) {
    // Default CLOSED: the old `true` fallback fired during the first frames
    // after arrival (camera not yet real) and armed the stance mid-landing.
    hud.facingMachine = false
    return
  }
  const center = getWorldPosition(engine, machine.root)
  // Full 3D distance: the XZ-only test passed for a player hovering ABOVE the
  // island (overhead means dx=dz=0) and floated the aim rings over the deck.
  const dist = Math.hypot(
    player.position.x - center.x,
    player.position.y - center.y,
    player.position.z - center.z
  )
  if (dist > 4.2) {
    hud.facingMachine = false
    return
  }
  const toMachine = Vector3.subtract(Vector3.create(center.x, center.y + 1.6, center.z), cam.position)
  const len = Math.hypot(toMachine.x, toMachine.y, toMachine.z) || 1
  const forward = Vector3.rotate(Vector3.Forward(), cam.rotation)
  const dot = (toMachine.x * forward.x + toMachine.y * forward.y + toMachine.z * forward.z) / len
  hud.facingMachine = dot > 0.72
}

/**
 * At the bag on your turn you HOLD A STANCE — a looping fighting idle instead
 * of a tourist standing at an arcade cabinet. Movement cancels it (that is the
 * engine's rule), so a slow heartbeat re-arms it while you stay engaged.
 */
/**
 * THE SIGNATURE MOVES — every one a clip that already ships in scene/emotes and
 * is in the emote library's bundle list, so nothing new crosses the allowlist.
 * Order matters: the attempt serial indexes it, so the same score on the same
 * night walks through the whole set rather than repeating one.
 */
// The breakdance clips are OUT (owner, 2026-09-06: "they don't fit"). What is
// left is a victory, a fist pump, a full turn and a chest-open — celebration,
// not a floor routine. More authored moves come through the Mixamo pipeline.
const SIGNATURE_MOVES: readonly string[] = [
  'emotes/victory_emote.glb',
  'emotes/victory_fist_pump_emote.glb',
  'emotes/chest_open_emote.glb'
]
/** 980+: arms open, face up — the pose the choir and the voice from the sky are for. */
const DIVINE_MOVE = 'emotes/chest_open_emote.glb'
const DIVINE_SCORE = 980

/**
 * ‼️THE REACTION LADDER — WHAT THE PUNCHER'S BODY SAYS BELOW 900.
 *
 * Taking `handsair` off every punch (09-08) fixed the complaint that a 300 and a
 * 950 looked identical, but it left every band under 900 EMPTY: the puncher just
 * stood there. Owner, 2026-09-08: *"you're always celebrating raising the arms
 * up… I'm missing a series of emotes that represent something else — seeking
 * approval or humble… turning around and shrugging."*
 *
 * ★ NOTHING HERE WAS FILMED OR GENERATED. Every clip already ships in
 * `scene/emotes/` and is registered in `shared/emote-library.ts`, so nothing new
 * crosses the bundle allowlist — an unlisted GLB resolves to nothing and the
 * avatar stands there again, which is the bug this table exists to fix. The
 * wiring test asserts each entry against `bundledEmotePaths()`.
 *
 * Bare ids (`shrug`) are DCL base emotes and fire through `triggerEmote`; only
 * `emotes/…` paths go through `triggerSceneEmote`. See `playPunchMove`.
 *
 * ‼️STILL MISSING, deliberately: a HUMBLE beat (hand to chest, small bow) and an
 * APPEAL TO THE CROWD. Neither exists in any bundled clip and text-to-motion has
 * no concept of gaze, so 820–899 borrows the fighter's reset instead of faking
 * one. That band is the place a generated clip goes when we author it.
 *
 * Ordered ascending by `under`; the first match wins. 900+ never reaches here —
 * that is `SIGNATURE_MOVES`, and it is untouched.
 */
const PUNCH_REACTION_BANDS: readonly { readonly under: number; readonly moves: readonly string[] }[] = [
  // Under 500 — it barely moved. Deflate: hunched and spent, no arms anywhere.
  { under: 500, moves: ['emotes/tired_hunched_emote.glb', 'emotes/kneeling_tired_emote.glb'] },
  // 500–699 — "was that it?" The shrug the owner asked for, already a base emote.
  { under: CROWD_MEH_SCORE, moves: ['shrug', 'emotes/confused_emote.glb'] },
  // 700–819 — respectable, not worth a cheer. Shake the hand out and reset.
  { under: CROWD_MILD_SCORE, moves: ['emotes/idle_shakeoff_emote.glb', 'shrug'] },
  // 820–899 — a real hit that missed the signature band. Composure, not applause:
  // drop back into stance like you meant it. `chest_open` stays reserved for 980.
  { under: ISLAND_ROLL_SCORE, moves: ['emotes/idle_shakeoff_emote.glb', 'emotes/state_guard_neutral_emote.glb'] }
]

/**
 * The band move for a score, seeded by the attempt serial so the whole room sees
 * the same body and a repeat attempt does not repeat the clip.
 */
function punchReactionMoveFor(score: number, serial: number): string | null {
  if (score >= ISLAND_ROLL_SCORE) return null
  const band = PUNCH_REACTION_BANDS.find(entry => score < entry.under)
  if (!band?.moves.length) return null
  return band.moves[Math.abs(serial) % band.moves.length] ?? null
}

/** A bundled path goes through the scene emote; a bare id is a DCL base emote. */
function playPunchMove(src: string, loop = false): void {
  if (src.startsWith('emotes/')) void triggerSceneEmote({ src, loop }).catch(() => {})
  else void triggerEmote({ predefinedEmote: src }).catch(() => {})
}
/** No second choir inside this window, whatever the cabinet says. */
const DIVINE_COOLDOWN_MS = 5 * 60_000

/**
 * ‼️EXCLUSIVE, NOT A THRESHOLD. Owner, 2026-09-08: *"the Angel music is
 * supposed to be exclusive not every single turn"*. 980 was written as the bar
 * for a miracle, but 980 is what a warmed-up player does every turn once karma
 * and the crowd's Boost are on the score — so the rarest sound in the scene
 * became the sound of the scene, and the arms-open pose with it.
 *
 * The bar stays. What changes is that a bar alone can never be exclusive: the
 * heavens open for a RECORD — the best punch this client has actually
 * witnessed on this machine — and never twice inside `DIVINE_COOLDOWN_MS`, so
 * a 981 followed by a 984 followed by a 990 is one miracle and two great
 * punches, in that order.
 *
 * It CLAIMS the moment rather than merely reporting it: the caller plays the
 * choir, the voice from the sky and the pose off this one answer, so those
 * three can never disagree about whether the moment happened. Out of earshot
 * is not a miracle — a punch nobody here heard leaves the record untouched, so
 * the first one a new arrival witnesses is still theirs.
 */
function punchClaimDivineMoment(machine: PunchMachineRuntime, score: number, now: number): boolean {
  if (score < DIVINE_SCORE) return false
  if (!punchSpectacleReachesMe(machine)) return false
  if (score <= (machine.divineBest ?? 0)) return false
  if (now - (machine.divineAt ?? 0) < DIVINE_COOLDOWN_MS) return false
  machine.divineBest = score
  machine.divineAt = now
  return true
}

/**
 * CONFETTI FROM THE SKY. The first cut was a cone burst fired UPWARD from
 * 7.5 m, which sent it into the sky above the arc where nobody looks (owner,
 * 2026-09-06: "we don't have any confetti"). This is a rain: born in a wide
 * sphere over the deck, drifting down through the crowd for four seconds, in
 * the machine's gold and the circle's violet.
 */
function spawnConfetti(machine: PunchMachineRuntime, over01: number): void {
  const entity = engine.addEntity()
  Transform.create(entity, { parent: machine.root, position: Vector3.create(0, 4.6, PUNCH_STRIKE_Z) })
  ParticleSystem.create(entity, {
    active: true,
    // A burst that falls through the deck and is gone — not a four-second rain.
    rate: Math.round(60 + over01 * 90),
    maxParticles: 220,
    lifetime: 2.6,
    gravity: 0.08,
    additionalForce: Vector3.create(0, -0.35, 0),
    initialSize: { start: 0.11, end: 0.2 },
    sizeOverTime: { start: 1, end: 0.9 },
    initialVelocitySpeed: { start: 0.15, end: 0.6 },
    initialColor: { start: Color4.create(1, 0.86, 0.35, 1), end: Color4.create(0.61, 0.42, 1, 1) },
    colorOverTime: { start: Color4.create(1, 1, 1, 1), end: Color4.create(1, 1, 1, 0) },
    billboard: true,
    loop: true,
    simulationSpace: 0,
    texture: { src: 'images/fx-particle-dot.png' },
    shape: ParticleSystem.Shape.Sphere({ radius: 3.4 })
  })
  bursts.push({ entity, expiresAt: Date.now() + 1_200 + 2_600 })
}

/**
 * ‼️THE BALL COMES OFF THE ARM. Owner, 2026-09-06: "if you hit really strong,
 * maybe above 950, sometimes you can hit the ball so strong that the ball
 * falls off to the side on the ground and bounces around and rolls, and then
 * it's put back into position for the next game."
 *
 * There is no rigid-body physics for scene entities in Decentraland, so this
 * is the ball's physics written out: gravity, a bounce with restitution on
 * the deck plane, rolling friction, a fence at the deck's edge. The arm's own
 * ball is a node inside `machine-arm.glb`; GltfNodeModifiers cannot hide a
 * node but CAN repaint it, so it is painted fully transparent for the flight
 * and the modifier is removed when the loose ball is picked up. Every client
 * runs the same seeded throw off the same score, so the room sees one ball.
 */
// ‼️EXCLUSIVE. At 950 it happened "constantly" (owner, 2026-09-06); the ball
// leaving the arm is the rarest thing the machine does, so it is a 990+.
/**
 * ‼️SWITCHED OFF 2026-09-07 — THE FREEZE. Four freezes, and this is the only
 * feature present in all four: 999 ("the ball flew away exactly like I wanted
 * and suddenly it all stopped"), 997, one after the choir, and 999 again with
 * the arc's fall already disabled. The fall is therefore exonerated and this
 * is not.
 *
 * It is also the one effect here that builds a GLTF AT RUNTIME — a second
 * instance of machine-arm.glb, with GltfNodeModifiers painted onto a container
 * that may not have finished loading — and then tears it down 3.8 s later, on
 * the frame a monster punch is already spending on everything else. A
 * try/catch cannot protect a renderer, which is why the frame fence never
 * caught it.
 *
 * Three days from the deadline a spectacle that stops the game is not
 * shippable. The code stays, tested, behind this flag; the way back is a
 * pre-built hidden copy parented at boot rather than a container per punch.
 */
const BALL_FLY_ENABLED = false
const BALL_FLY_SCORE = 990
const BALL_FLY_MS = 3_800
const BALL_RADIUS = 0.3
const BALL_RESTITUTION = 0.52
const BALL_DECK_RADIUS = 4.2
const BALL_INK = Color4.create(0.86, 0.09, 0.11, 1)
// Both generations are supported. The refined GLB batches by material, so
// retaining only the traced mesh's names would silently disable golden mode.
const BALL_RED_PATHS = ['PunchBall_RedFacets', 'world/PunchArmAndBall/PunchBall_RedFacets', 'machine-arm_Leather_Oxblood']
const BALL_DARK_PATHS = ['PunchBall_DarkFacets', 'world/PunchArmAndBall/PunchBall_DarkFacets', 'machine-arm_Leather_Seam', 'machine-arm_Waxed_Linen_Stitch']
const BALL_NODE_PATHS = [...BALL_RED_PATHS, ...BALL_DARK_PATHS]
/** The arm without its ball — hidden on the loose copy so only the ball rolls away. */
const ARM_NODE_PATHS = ['PunchArm_Upper', 'PunchArm_Collar', 'world/PunchArmAndBall/PunchArm_Upper', 'world/PunchArmAndBall/PunchArm_Collar', 'machine-arm_Brushed_Nickel', 'machine-arm_Rubber_Graphite', 'machine-arm_Aged_Brass']
const TRANSPARENT_PBR = { albedoColor: Color4.create(0, 0, 0, 0), transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND }

/**
 * ‼️FENCED. Twice on 2026-09-06 the whole island froze the moment the ball's
 * flight ended: the frame loop threw inside this feature and every system after
 * it — the coordinator included — stopped for good, with the arm's ball still
 * painted away. A monster punch must never be able to stop the game, so the
 * ball is behind a try/catch that puts everything back and logs, and the
 * entities are removed one by one rather than through the SDK's tree helper.
 */
function launchLooseBall(machine: PunchMachineRuntime, now: number, score: number, over01: number): void {
  try {
    spawnLooseBall(machine, now, score, over01)
  } catch (error) {
    console.error('[punch] loose ball launch failed: ' + String(error))
    dropLooseBall(machine)
  }
}

function dropLooseBall(machine: PunchMachineRuntime): void {
  const ball = machine.looseBall
  machine.looseBall = null
  if (ball) {
    try { engine.removeEntity(ball.shell) } catch { /* already gone */ }
    try { engine.removeEntity(ball.entity) } catch { /* already gone */ }
  }
  try { paintArmBall(machine) } catch (error) { console.error('[punch] arm ball repaint failed: ' + String(error)) }
}

function updateLooseBall(machine: PunchMachineRuntime, now: number, dt: number): void {
  if (!machine.looseBall) return
  try {
    stepLooseBall(machine, now, dt)
  } catch (error) {
    console.error('[punch] loose ball step failed: ' + String(error))
    dropLooseBall(machine)
  }
}

function spawnLooseBall(machine: PunchMachineRuntime, now: number, score: number, over01: number): void {
  if (machine.looseBall) return
  const from = getWorldPosition(engine, machine.hitbox)
  const center = getWorldPosition(engine, machine.root)
  // ‼️THE SAME BALL, NOT A RED SPHERE. Owner: "it needs to feel like the ball
  // I'm hitting just fell off the machine — the same design." The loose body
  // is a second copy of machine-arm.glb with the ARM painted away, hung so
  // the ball's centre sits on this pivot; the pivot is what rolls.
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(from.x, from.y, from.z) })
  const shell = engine.addEntity()
  Transform.create(shell, { parent: entity, position: Vector3.create(0, BALL_DROP_FROM_HINGE, 0) })
  GltfContainer.create(shell, {
    src: MACHINE_ARM,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })
  GltfNodeModifiers.createOrReplace(shell, {
    modifiers: ARM_NODE_PATHS.map((path) => ({ path, material: { material: { $case: 'pbr' as const, pbr: TRANSPARENT_PBR } } }))
  })
  // Seeded by the score: the same side on every screen, a different side punch to punch.
  const side = (score & 1) === 0 ? 1 : -1
  machine.looseBall = {
    entity,
    shell,
    vel: { x: side * (2.4 + over01 * 1.6), y: 3.6 + over01 * 2, z: 0.9 + over01 * 1.2 },
    until: now + BALL_FLY_MS,
    floorY: center.y + BALL_RADIUS,
    spinDeg: 0
  }
  paintArmBall(machine)
}

/**
 * One writer for the arm's ball material: transparent while a loose ball is
 * flying, gold while the golden ball is armed, the model's own paint otherwise.
 * Two features repainting the same nodes independently would fight over them.
 */
function paintArmBall(machine: PunchMachineRuntime): void {
  const wanted = machine.looseBall ? 'gone' : machine.goldenActive ? 'gold' : 'own'
  if (machine.armBallPaint === wanted) return
  machine.armBallPaint = wanted
  if (wanted === 'own') {
    GltfNodeModifiers.deleteFrom(machine.armPivot)
    return
  }
  // "Part black, part golden" (owner, 2026-09-06): only the RED facets turn
  // gold; the dark facets keep the model's own paint, so the ball reads as the
  // same object in a different metal rather than a yellow blob.
  const pbr = wanted === 'gone'
    ? TRANSPARENT_PBR
    : { albedoColor: Color4.create(...PUNCH_GOLD_MATERIAL.albedo, 1), emissiveColor: Color3.create(...PUNCH_GOLD_MATERIAL.emissive),
        emissiveIntensity: PUNCH_GOLD_MATERIAL.emissiveIntensity, metallic: PUNCH_GOLD_MATERIAL.metallic, roughness: PUNCH_GOLD_MATERIAL.roughness,
        bumpTexture: Material.Texture.Common({ src: 'images/punch/bag-grain-normal.png' }) }
  const paths = wanted === 'gone' ? BALL_NODE_PATHS : BALL_RED_PATHS
  GltfNodeModifiers.createOrReplace(machine.armPivot, {
    modifiers: paths.map((path) => ({ path, material: { material: { $case: 'pbr' as const, pbr } } }))
  })
}

/**
 * The golden ball's SHOW: a sparkle and one clear arming sting. The old
 * four-second `music-ball.wav` loop fought the full-length arena music and was
 * heard as a disturbing background buzz. Gold remains unmistakable without a
 * second music bed.
 */
/** The moment it arms: one arcade sting, so the gold is heard before it is seen. */
const GOLDEN_STING = 'sounds/bubble/start.wav'
/** From the ball's idle rate to eight times it over two and a half seconds — it winds UP. */
const GOLDEN_SPIN_MAX = 8
const GOLDEN_SPIN_RAMP_MS = 2_500
function goldenSpinFactor(machine: PunchMachineRuntime, now: number): number {
  if (!machine.goldenActive || !machine.goldenSince) return 1
  const k = Math.min(1, Math.max(0, (now - machine.goldenSince) / GOLDEN_SPIN_RAMP_MS))
  return 1 + (GOLDEN_SPIN_MAX - 1) * k * k
}
function updateGoldenShow(machine: PunchMachineRuntime, phase: string): void {
  const on = !!machine.goldenActive && phase !== 'scoring' && phase !== 'cooldown'
  if (on && !machine.goldenSince) {
    machine.goldenSince = Date.now()
    playSfx(machine, GOLDEN_STING, 0.9)
  } else if (!on) machine.goldenSince = 0
  if (on && !machine.goldenSparkle) {
    const sparkle = engine.addEntity()
    Transform.create(sparkle, { parent: machine.armPivot, position: Vector3.create(0, -BALL_DROP_FROM_HINGE, 0) })
    ParticleSystem.create(sparkle, {
      active: true,
      rate: 55,
      maxParticles: 140,
      lifetime: 0.9,
      gravity: -0.15,
      initialSize: { start: 0.05, end: 0.11 },
      sizeOverTime: { start: 1, end: 0 },
      initialVelocitySpeed: { start: 0.5, end: 1.3 },
      initialColor: { start: Color4.create(1, 0.95, 0.6, 1), end: Color4.create(1, 0.78, 0.2, 1) },
      colorOverTime: { start: Color4.create(1, 1, 0.85, 1), end: Color4.create(1, 0.7, 0.1, 0) },
      billboard: true,
      loop: true,
      simulationSpace: 0,
      texture: { src: 'images/fx-particle-dot.png' },
      shape: ParticleSystem.Shape.Sphere({ radius: 0.42 })
    })
    machine.goldenSparkle = sparkle
  } else if (!on && machine.goldenSparkle) {
    engine.removeEntity(machine.goldenSparkle)
    machine.goldenSparkle = undefined
  }
}

function stepLooseBall(machine: PunchMachineRuntime, now: number, dt: number): void {
  const ball = machine.looseBall
  if (!ball) return
  const tf = Transform.getMutableOrNull(ball.entity)
  if (!tf || now >= ball.until) {
    dropLooseBall(machine)
    return
  }
  const step = Math.min(0.05, Math.max(0, dt))
  const v = ball.vel
  v.y -= 9.8 * step
  let x = tf.position.x + v.x * step
  let y = tf.position.y + v.y * step
  let z = tf.position.z + v.z * step
  if (y <= ball.floorY) {
    y = ball.floorY
    if (v.y < -0.6) v.y = -v.y * BALL_RESTITUTION
    else v.y = 0
    // Rolling: the deck takes speed out of it every metre.
    v.x *= 1 - Math.min(1, 1.4 * step)
    v.z *= 1 - Math.min(1, 1.4 * step)
  }
  // The fence: the deck is round and the ball stays on it.
  const center = getWorldPosition(engine, machine.root)
  const dx = x - center.x
  const dz = z - center.z
  const out = Math.hypot(dx, dz)
  if (out > BALL_DECK_RADIUS) {
    const nx = dx / out
    const nz = dz / out
    const along = v.x * nx + v.z * nz
    if (along > 0) {
      v.x -= 1.6 * along * nx
      v.z -= 1.6 * along * nz
    }
    x = center.x + nx * BALL_DECK_RADIUS
    z = center.z + nz * BALL_DECK_RADIUS
  }
  tf.position = Vector3.create(x, y, z)
  // Spin with the ground speed, about the axis it is rolling around.
  const speed = Math.hypot(v.x, v.z)
  ball.spinDeg = (ball.spinDeg + ((speed * step) / BALL_RADIUS) * (180 / Math.PI)) % 360
  const heading = speed > 0.01 ? (Math.atan2(v.x, v.z) * 180) / Math.PI : 0
  tf.rotation = Quaternion.multiply(
    Quaternion.fromEulerDegrees(0, heading, 0),
    Quaternion.fromEulerDegrees(ball.spinDeg, 0, 0)
  )
}

/**
 * ‼️THE SPOT ON THE GROUND, SAID WITHOUT WORDS.
 *
 * Owner, 2026-09-06: *"when it's your turn it needs to show you where you need
 * to go to get the maximum benefit... on the ground it needs to blink with a
 * red circle telling you to go there and to stand there, without a lot of
 * words."* The stance penalty (`punchStance`) has always been real — you can
 * swing from three metres back and lose a fifth of the punch — but the only
 * thing that said so was a sixteen-pixel chip on the top rail. The floor now
 * says it: a bullseye on the deck at the strike spot, RED and blinking while
 * your stance would cost you, GREEN and still the moment it would not.
 *
 * It rides `machine.root` at `PUNCH_STRIKE_Z`, which is the exact point
 * `currentPunchStance` measures the offset from, so the mark and the maths
 * cannot drift apart. The rings texture is the one the Boost pulses already
 * ship, so nothing new crosses the asset allowlist. Hidden by scale rather
 * than by a visibility component: it is one plane, and scale is already the
 * thing being animated.
 */
const STRIKE_MARK_TEX = 'images/punch/wave-ring.png'
const STRIKE_MARK_SIZE_M = 1.5
const STRIKE_MARK_RED = Color4.create(1, 0.14, 0.1, 1)
const STRIKE_MARK_GREEN = Color4.create(0.3, 1, 0.42, 1)
/** Two blinks a second: urgent enough to catch a player walking the other way. */
const STRIKE_MARK_BLINK_MS = 500

function updateStrikeMarker(machine: PunchMachineRuntime, now: number, wanted: boolean): void {
  if (!wanted) {
    if (machine.strikeRing) Transform.getMutable(machine.strikeRing).scale = Vector3.Zero()
    return
  }
  if (!machine.strikeRing) {
    const entity = engine.addEntity()
    Transform.create(entity, {
      parent: machine.root,
      // A hair above the deck so it never z-fights the floor it is painted on.
      position: Vector3.create(0, 0.04, PUNCH_STRIKE_Z),
      rotation: Quaternion.fromEulerDegrees(90, 0, 0),
      scale: Vector3.Zero()
    })
    MeshRenderer.setPlane(entity)
    machine.strikeRing = entity
  }
  const stance = currentPunchStance(machine)
  const perfect = stance.penaltyPercent === 0
  // Red BLINKS (a square wave eased by a sine so it never looks like a glitch);
  // green holds — a steady light is the reward for having arrived.
  const blink = perfect ? 1 : 0.25 + 0.75 * Math.abs(Math.sin((Math.PI * now) / STRIKE_MARK_BLINK_MS))
  const ink = perfect ? STRIKE_MARK_GREEN : STRIKE_MARK_RED
  const size = STRIKE_MARK_SIZE_M * (perfect ? 1 : 0.92 + 0.12 * blink)
  Transform.getMutable(machine.strikeRing).scale = Vector3.create(size, size, 1)
  Material.setPbrMaterial(machine.strikeRing, {
    texture: Material.Texture.Common({ src: STRIKE_MARK_TEX }),
    alphaTexture: Material.Texture.Common({ src: STRIKE_MARK_TEX }),
    albedoColor: Color4.create(ink.r, ink.g, ink.b, 0.45 + 0.55 * blink),
    emissiveColor: Color4.create(ink.r, ink.g, ink.b, 1),
    emissiveIntensity: 1.4 + 2.2 * blink,
    transparencyMode: 2,
    roughness: 1,
    metallic: 0,
    castShadows: false
  })
}

/**
 * The fighting zone: within arm's reach of the strike spot itself. The stance
 * belongs to the player squared up at the bag — not to someone who merely
 * landed on the island or wandered past the cabinet. The fall return drops
 * players 4.2 m out, safely outside this circle.
 */
function playerAtStrikeSpot(machine: PunchMachineRuntime): boolean {
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (!player) return false
  const center = getWorldPosition(engine, machine.root)
  // Height matters too: without it, standing on a cloud directly overhead
  // counted as standing at the bag.
  if (Math.abs(player.position.y - center.y) > PUNCH_STANCE_Y_BAND) return false
  return (
    Math.hypot(player.position.x - center.x, player.position.z - (center.z + PUNCH_STRIKE_Z)) <
    PUNCH_STANCE_RADIUS
  )
}

let stanceRetriggerAt = 0
function holdReadyStance(now: number, engaged: boolean, celebrationUntil = 0): void {
  // The shared win owns the player's pose for its full beat.
  if (now < celebrationUntil) return
  if (!engaged) {
    stanceRetriggerAt = 0
    return
  }
  if (now < stanceRetriggerAt) return
  stanceRetriggerAt = now + 2_400
  // NOT looped. A looping emote keeps running after the player walks away —
  // there is no "stop emote" call — so the stance would follow them onto the
  // clouds and read as firing at random. Re-triggering a one-shot while they
  // stand in the zone looks identical and simply stops when they leave.
  void triggerSceneEmote({ src: 'emotes/fighting_idle_emote.glb', loop: false })
}

/**
 * A 950 doesn't just light up the machine — it knocks the sky loose. Every jump
 * cloud shudders, and anyone riding one is thrown off it.
 *
 * The throw is aimed OUTWARD (the direction from the island to the cloud, tilted
 * toward wherever the rider is standing on it) so nobody is fired back into the
 * cabinet. Landing below is already a handled state: the scene's own fall prompt
 * catches them and offers the way back up, so being knocked off is a story beat
 * rather than a dead end.
 */
const CLOUD_QUAKE_SCORE = 950
const CLOUD_QUAKE_MS = 1_900
let cloudQuakeAt = 0
let cloudQuakeGain = 1

function throwRiderOff(cloud: JumpCloud, force: number): void {
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (!player) return
  const top = getWorldPosition(engine, cloud.root)
  let dx = player.position.x - top.x
  let dz = player.position.z - top.z
  // Dead centre gives no usable direction, so fall back to the cloud's own
  // bearing from the island — the one direction that is never back inward.
  if (Math.hypot(dx, dz) < 0.2) {
    const hub = getWorldPosition(engine, cloud.island)
    dx = top.x - hub.x
    dz = top.z - hub.z
  }
  const length = Math.hypot(dx, dz) || 1
  Physics.applyImpulseToPlayer(
    Vector3.create((dx / length) * force, force * 0.55, (dz / length) * force)
  )
}

/**
 * The sky answers a monster punch — and only the puncher is thrown by it.
 *
 * `mine` is not a volume knob, it is the line between a show and a shove. The
 * jolt is visual and belongs to everyone in range: a spectator on the deck came
 * to watch the island shudder, and taking that away would be taking the reward
 * away from the crowd the whole venue is built around. The IMPULSE is different
 * in kind — it picks a body up and moves it — and the owner drew the line
 * exactly there: "I still want to experience the shaking and the music and the
 * effects, I shouldn't experience fireballs hitting my body if I'm not playing."
 */
function startCloudQuake(score: number, mine: boolean, gain = 1): void {
  cloudQuakeGain = gain
  if (jumpClouds.length === 0) return
  cloudQuakeAt = Date.now()
  if (!mine) return
  // 950 shrugs them off; 1000 hurls them.
  const force = 6 + Math.min(1, Math.max(0, (score - CLOUD_QUAKE_SCORE) / 50)) * 3
  for (const cloud of jumpClouds) {
    if (cloud.wasOn) throwRiderOff(cloud, force)
  }
}

/** A small white puff off the cloud top when someone lands on it. */
function spawnCloudPoof(cloud: JumpCloud): void {
  const entity = engine.addEntity()
  Transform.create(entity, { parent: cloud.root, position: Vector3.create(0, 0.05, 0) })
  ParticleSystem.create(entity, {
    active: true,
    rate: 40,
    maxParticles: 26,
    lifetime: 0.7,
    gravity: 0.05,
    additionalForce: Vector3.create(0, 0.4, 0),
    initialSize: { start: 0.16, end: 0.4 },
    sizeOverTime: { start: 1, end: 2 },
    initialVelocitySpeed: { start: 0.9, end: 1.6 },
    initialColor: { start: Color4.create(1, 1, 1, 0.9), end: Color4.create(0.92, 0.96, 1, 0.55) },
    colorOverTime: { start: Color4.create(1, 1, 1, 0.7), end: Color4.create(1, 1, 1, 0) },
    billboard: true,
    loop: false,
    simulationSpace: 1,
    texture: { src: 'images/fx-particle-smoke.png' },
    shape: ParticleSystem.Shape.Cone({ angle: 85, radius: cloud.radius * 0.6 })
  })
  bursts.push({ entity, expiresAt: Date.now() + 1_100 })
}

/**
 * The updraught column: a cloud's second job.
 *
 * Land on a cloud and it is a trampoline. Fly OVER one and it is a ventilator —
 * a shaft of rising air that catches whatever fall you arrive with and blows you
 * back up, so a lap of the island can be flown cloud to cloud without ever
 * touching one. The column is deliberately WIDER than the cloud (you aim at a
 * puff from twenty metres away, not at a disc) and it starts well above the top
 * face: hopping about on a cloud you are standing on must never trip it, which
 * is the one thing the owner asked for by name.
 *
 * Why a gust and not a permanent lift: an always-on column over a cloud you are
 * inside is an elevator, and the player would simply park in it. Each pass gets
 * ONE gust, then the cloud needs you to leave and come back — which is what
 * turns "fly over a cloud" into a route around the island rather than a hover.
 *
 * The column's SHAPE comes from the layout module rather than from here: the
 * cloud spacing over there is only legal for those three numbers, and a tweak
 * made in the plugin would quietly park a cloud inside its neighbour's draught.
 */
const CLOUD_VENT_MARGIN = PUNCH_VENT_MARGIN_M
const CLOUD_VENT_FLOOR = PUNCH_VENT_FLOOR_M
const CLOUD_VENT_CEILING = PUNCH_VENT_CEILING_M
/**
 * The absolute roof, learned from the scene rather than chosen here.
 *
 * The column above is a RELATIVE reach — sixteen metres over whichever cloud
 * you are crossing — so on a tall island it happily holds a player past the
 * top of the scene, where DCL stops applying colliders and the sky becomes a
 * hole. Infinity until the scene tells us its size, so a machine dropped into
 * a scene that declares nothing behaves exactly as it always did.
 */
let flightCeilingY = Infinity
/** The catch: cancel the arriving fall, then add the blow on top of it. */
const CLOUD_VENT_CATCH = 0.9
const CLOUD_VENT_KICK = 2.8
const CLOUD_VENT_KICK_MAX = 8
/** While the gust lasts the fan holds this climb rate — it tops the player back
 *  up rather than launching, so height is never LOST over a cloud. */
const CLOUD_VENT_HOLD_MPS = 1.6
const CLOUD_VENT_STEP_MAX = 3
const CLOUD_VENT_STEP_MS = 100
const CLOUD_VENT_MS = 1_700
const CLOUD_VENT_COOLDOWN_MS = 900
/** A cloud does not vent the player it just threw: the trampoline owns that
 *  launch, and stacking the two read as a rocket off one single cloud. */
const CLOUD_VENT_AFTER_BOUNCE_MS = 1_400
/**
 * ‼️THE LANDING CORRIDOR — the fan lifts crossing traffic, never a landing.
 *
 * The fan used to catch EVERY descent that crossed the column: sixteen metres
 * up, in a shaft wider than the cloud itself. So a player dropping onto a cloud
 * was thrown back before they ever touched it, and nine hundred milliseconds
 * later the same shaft handed them the same gust on the way down again. You
 * could not land. The sky simply kept you — which is exactly what the owner
 * reported, and it is the fan doing its job in a situation it was never meant
 * to judge.
 *
 * The rule now, in three lines:
 *  · sinking over the cloud's OWN top face  → stand down; this is a landing and
 *    the trampoline owns it. Stands down mid-gust too, so a fall that drifts
 *    onto the disc after being caught stops being held up and comes down.
 *  · sinking anywhere else in the column    → the fan still catches you. You
 *    missed the cloud, and there is nothing under you but sky.
 *  · climbing or level                      → the fan tops you up. That is the
 *    cloud-to-cloud tour: bounce, then thread the columns on the way up.
 *
 * Which is the owner's own sentence — the push was for flying, not for jumping.
 */
const CLOUD_LAND_FALL_MPS = 0.6

/** The wind itself, parked inside the cloud and switched on only while it blows. */
function spawnCloudVent(parent: Entity, radius: number): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { parent, position: Vector3.create(0, 0.4, 0) })
  ParticleSystem.create(entity, {
    active: false,
    rate: 26,
    maxParticles: 40,
    lifetime: 2.2,
    gravity: 0,
    // The whole point, made visible: everything this emitter makes goes UP.
    additionalForce: Vector3.create(0, 3.4, 0),
    initialSize: { start: 0.24, end: 0.5 },
    sizeOverTime: { start: 1, end: 1.9 },
    initialVelocitySpeed: { start: 2.4, end: 4.2 },
    initialColor: { start: Color4.create(1, 1, 1, 0.75), end: Color4.create(0.86, 0.95, 1, 0.5) },
    colorOverTime: { start: Color4.create(1, 1, 1, 0.6), end: Color4.create(1, 1, 1, 0) },
    billboard: true,
    loop: true,
    // WORLD, so the column stands still in the air while the cloud bobs under
    // it — particles that ride the tween read as the cloud shivering, not wind.
    simulationSpace: 1,
    texture: { src: 'images/fx-particle-smoke.png' },
    shape: ParticleSystem.Shape.Cone({ angle: 14, radius: radius * 0.8 })
  })
  return entity
}

/**
 * One cloud's ventilator for this frame.
 *
 * The hold is a servo, not a force: vertical speed is measured from the avatar's
 * own transform and topped back up to the target with an impulse, which is the
 * same unit the trampoline bounce already speaks. That is what makes "you cannot
 * sink over a cloud" literally true at any frame rate, and it tapers to nothing
 * at the top of the column so the fan lifts you to a ceiling rather than forever.
 */
function updateCloudVent(
  cloud: JumpCloud,
  now: number,
  inShaft: boolean,
  landing: boolean,
  up: number,
  climbSpeed: number,
  fallSpeed: number
): void {
  const vent = cloud.vent
  if (!vent) {
    cloud.inColumn = false
    return
  }
  // A landing approach takes the player out of the column entirely, for this
  // frame and every frame it lasts: no entry edge, so no gust, and `blowing`
  // below goes false, so a gust already running lets go. The cloud is still
  // there — it is the AIR above it that stands aside.
  const inColumn = inShaft && !landing
  const entered = inColumn && !cloud.inColumn
  cloud.inColumn = inColumn
  if (entered && now >= cloud.ventReadyAt) {
    cloud.ventUntil = now + CLOUD_VENT_MS
    // A dive over a cloud has to come out CLIMBING, so the arriving fall is paid
    // off first and the blow is added on top of what is left.
    const kick = Math.min(CLOUD_VENT_KICK_MAX, fallSpeed * CLOUD_VENT_CATCH + CLOUD_VENT_KICK)
    Physics.applyImpulseToPlayer(Vector3.create(0, kick, 0))
    if (cloud.soundsEnabled && !sfxMuted.clouds) {
      AudioSource.createOrReplace(vent, {
        audioClipUrl: 'sounds/jump-pad-launch.wav',
        playing: true,
        loop: false,
        volume: 0.5,
        pitch: 0.85,
        global: false
      })
    }
  }
  const blowing = inColumn && now < cloud.ventUntil
  if (blowing) {
    const span = CLOUD_VENT_CEILING - CLOUD_VENT_FLOOR
    const reach = Math.max(0, Math.min(1, (up - CLOUD_VENT_FLOOR) / span))
    const hold = CLOUD_VENT_HOLD_MPS * (1 - reach)
    // Already climbing faster than the fan blows means the fan has nothing to
    // add. And the top-up runs at 10 Hz, not once a frame: an impulse is an
    // EVENT on the wire, and sixty of them a second to hold one climb rate is
    // sixty times the traffic for a difference nobody can see — between steps
    // gravity takes about a metre per second back, which the next step returns.
    if (climbSpeed < hold - 0.05 && now - cloud.ventStepAt >= CLOUD_VENT_STEP_MS) {
      cloud.ventStepAt = now
      Physics.applyImpulseToPlayer(
        Vector3.create(0, Math.min(CLOUD_VENT_STEP_MAX, hold - climbSpeed), 0)
      )
    }
  } else if (cloud.ventUntil > 0) {
    cloud.ventUntil = 0
    cloud.ventReadyAt = now + CLOUD_VENT_COOLDOWN_MS
  }
  if (blowing !== cloud.venting) {
    cloud.venting = blowing
    const particles = ParticleSystem.getMutableOrNull(vent)
    if (particles) particles.active = blowing
  }
}

/**
 * A real trampoline. `Physics.applyImpulseToPlayer` throws the avatar back up —
 * no teleport, no puppet, the explorer's own gravity brings them down. Landing
 * is read from position (no collision event fires for an avatar): inside the
 * cloud's disc and within a standing band of its top face, which is the root's
 * origin. The visual squashes on a damped wobble and the collider dips a few
 * centimetres so the surface visibly gives.
 *
 * WHAT A LANDING IS WORTH now lives in the layout module, as
 * `punchCloudLaunchMps` — one function holding all three of the cloud's answers
 * so they cannot drift apart:
 *
 *   arrive gently, nothing stored  -> ZERO. The cloud takes your weight. Landing
 *     to stand, breathe and jump back up under your own power is the whole point
 *     of the staircase, and a surface that answers a step-down with a throw is
 *     one you cannot use as a stair.
 *   arrive hard                    -> `fall × RESTITUTION + FLOOR`. Under 1 that
 *     coefficient is what makes a dropped ball settle instead of climbing, so a
 *     big fall throws you high and each following bounce is gentler. ‼️FLOOR was
 *     2.2, whose fixed point `FLOOR / (1 - r)` is 5.8 m/s — a 1.7 m hop, clear of
 *     the contact band, so the landing re-armed for ever and standing on a cloud
 *     was not something the surface allowed. At 1.0 the fixed point is a 35 cm
 *     hop that never leaves the band and dies on its own.
 *   arrive mid-rhythm              -> the pump on top, and the settle cut
 *     suspended. See PUNCH_PUMP_* over there.
 *
 * A test holds the passive curve to that fixed point, so making the clouds
 * bouncier by raising FLOOR fails loudly instead of quietly bobbing people.
 */
// Lower than it was: the throw now starts at the surface instead of a metre and
// a half up, so the same number carried the player noticeably higher.
const CLOUD_BOUNCE_MAX = PUNCH_BOUNCE_MAX_MPS

/**
 * THE PUMP'S STATE — the player's, not the cloud's, and deliberately so.
 *
 * A charge that lived on the cloud would be spent the moment you left it, and
 * the spiral is climbed BETWEEN clouds: bounce off this one with what you built,
 * ride the next one's draught, land on the rung above still working. It is the
 * player who is pumping, so the player carries it — and `punchPumpDecay` is what
 * stops that being a free launch off every cloud for the rest of the session.
 */
let pump01 = 0
/** Last jump PRESS, anywhere. A landing looks back at this to find its beat. */
let pumpBeatAt = 0
/** Edge detector: `isPressed` is a level, and a held key is not a rhythm. */
let jumpWasDown = false

function updateJumpClouds(now: number, dt: number): void {
  if (jumpClouds.length === 0) return
  const player = Transform.getOrNull(engine.PlayerEntity)
  // Vertical speed, differentiated from the avatar's own transform: the fall
  // that arrives is what decides how hard the cloud throws them back. The SIGN
  // is kept as well as the size — a ventilator has to know whether the player is
  // still sinking, and a fall-only number can never say "already climbing".
  let climbSpeed = 0
  if (player) {
    if (lastPlayerY !== null && dt > 0) climbSpeed = (player.position.y - lastPlayerY) / dt
    lastPlayerY = player.position.y
  } else {
    lastPlayerY = null
  }
  const fallSpeed = Math.max(0, -climbSpeed)
  // The beat, read once per frame rather than once per cloud: two overlapping
  // discs must not read one press as two.
  const jumpDown = inputSystem.isPressed(InputAction.IA_JUMP)
  if (jumpDown && !jumpWasDown) pumpBeatAt = now
  jumpWasDown = jumpDown
  // Bleed BEFORE the landings are judged, so a charge that has run out cannot
  // pay for the very landing that discovered it was gone.
  pump01 = punchPumpDecay(pump01, now - pumpBeatAt, dt * 1000)
  for (const cloud of jumpClouds) {
    let on = false
    let overDisc = false
    let inShaft = false
    let landing = false
    let columnUp = 0
    if (player) {
      const top = getWorldPosition(engine, cloud.root)
      const dx = player.position.x - top.x
      const dz = player.position.z - top.z
      const dy = player.position.y - top.y
      const reach = cloud.radius + 0.3
      const ventReach = cloud.radius + CLOUD_VENT_MARGIN
      // The same disc the trampoline contacts on — the cloud's own top face.
      // Sinking over it means the player is coming HERE, so the fan lets go.
      overDisc = dx * dx + dz * dz <= reach * reach
      landing = overDisc && fallSpeed > CLOUD_LAND_FALL_MPS
      // ‼️The roof is part of the column's shape. Without this the fan holds a
      // climb sixteen metres over a cloud that is already near the top of the
      // scene, and the player ends up outside it — where the colliders stop
      // and the clouds they are standing on cease to exist. See
      // punchFlightCeilingY: this is the fall-through-the-floor, at its source.
      inShaft =
        dx * dx + dz * dz <= ventReach * ventReach &&
        dy >= CLOUD_VENT_FLOOR &&
        dy <= CLOUD_VENT_CEILING &&
        player.position.y < flightCeilingY
      columnUp = dy
      // ‼️This band IS the contact test, so it has to hug the surface. At 1.5 m
      // the bounce fired while the player was still a metre and a half in the
      // air: you had to jump clear of the band to start it, and every bounce
      // after that re-triggered up at the ceiling — so the bouncing floated
      // above the cloud instead of off it. 0.55 is a step's worth of slack,
      // wide enough to survive the ±0.16 bob and a 30 fps frame at full speed.
      on = overDisc && dy > -0.5 && dy < PUNCH_CONTACT_BAND_M
    }
    updateCloudVent(cloud, now, inShaft, landing, columnUp, climbSpeed, fallSpeed)
    if (on !== cloud.wasOn) {
      cloud.wasOn = on
      // Debounce: skirting the band's edge must not machine-gun the animation.
      if (now - cloud.animAt > 260) {
        cloud.animKind = on ? 'land' : 'leave'
        cloud.animAt = now
        if (on) {
          // A press on the way down is THIS landing's beat, and it is spent
          // here — the charge it buys is what the cloud gives back, so the
          // gesture and its answer land on the same frame.
          if (now - pumpBeatAt <= PUNCH_PUMP_WINDOW_MS) pump01 = punchPumpBeat(pump01)
          const bounce = punchCloudLaunchMps(fallSpeed, pump01)
          cloud.bounce01 = Math.min(1, bounce / CLOUD_BOUNCE_MAX)
          // A settled landing still poofs and still speaks — it just is not
          // thrown. Zero impulse is the cloud ACCEPTING you.
          if (bounce > 0) Physics.applyImpulseToPlayer(Vector3.create(0, bounce, 0))
          // The throw owns this launch. Without this the rider climbed straight
          // through the cloud's own column and got vented on top of the bounce —
          // one cloud, two pushes, and a trampoline that read as a rocket.
          cloud.ventReadyAt = now + CLOUD_VENT_AFTER_BOUNCE_MS
          spawnCloudPoof(cloud)
          if (cloud.soundsEnabled && !sfxMuted.clouds) {
            const clip = pickFrom(PUNCH_AUDIO.punchNormal)
            // A punch thud, quiet and pitched up, reads as a soft pomf. A harder
            // landing speaks lower and louder — the cloud answers the weight.
            if (clip) {
              AudioSource.createOrReplace(cloud.audio, {
                audioClipUrl: clip,
                playing: true,
                loop: false,
                volume: 0.2 + cloud.bounce01 * 0.35,
                pitch: 1.6 - cloud.bounce01 * 0.45,
                global: false
              })
            }
          }
        }
      }
    }
    // The quake owns position and rotation; the landing squash owns scale, so
    // the two never fight over the same channel and can run together.
    const quakeLeft = cloudQuakeAt === 0 ? 0 : CLOUD_QUAKE_MS - (now - cloudQuakeAt)
    if (quakeLeft > 0) {
      const decay = (quakeLeft / CLOUD_QUAKE_MS) * cloudQuakeGain
      const seed = cloud.radius * 7
      const t = (now - cloudQuakeAt) / 1000
      const amp = 0.26 * decay
      const shakeT = Transform.getMutableOrNull(cloud.visual)
      if (shakeT) {
        shakeT.position = Vector3.create(
          Math.sin(t * 47 + seed) * amp,
          Math.sin(t * 61 + seed * 2) * amp * 0.5,
          Math.cos(t * 53 + seed) * amp
        )
        shakeT.rotation = Quaternion.fromEulerDegrees(
          Math.sin(t * 43 + seed) * 9 * decay,
          0,
          Math.cos(t * 39 + seed) * 9 * decay
        )
      }
      cloud.quaking = true
    } else if (cloud.quaking) {
      cloud.quaking = false
      const restT = Transform.getMutableOrNull(cloud.visual)
      if (restT) {
        restT.position = Vector3.Zero()
        restT.rotation = Quaternion.Identity()
      }
    }
    if (cloud.animKind === 'none') continue
    const life = cloud.animKind === 'land' ? CLOUD_LAND_MS : CLOUD_LEAVE_MS
    const p = Math.max(0, Math.min(1, (now - cloud.animAt) / life))
    const wobble = Math.exp(-3.1 * p) * Math.sin(p * Math.PI * 3)
    const visualT = Transform.getMutableOrNull(cloud.visual)
    const colliderT = Transform.getMutableOrNull(cloud.collider)
    if (p >= 1) {
      cloud.animKind = 'none'
      if (visualT) visualT.scale = Vector3.One()
      if (colliderT) colliderT.position = Vector3.create(0, -0.15, 0)
      continue
    }
    // Land compresses first (weight arrives); leave puffs up first (weight gone).
    // A harder landing digs deeper, so the dent matches the throw it just gave.
    const depth = 0.2 + cloud.bounce01 * 0.24
    const squash = cloud.animKind === 'land' ? 1 - depth * wobble : 1 + 0.16 * wobble
    if (visualT) visualT.scale = Vector3.create(1 + (1 - squash) * 0.55, squash, 1 + (1 - squash) * 0.55)
    // Only the landing moves the floor — giving way under someone, not under no one.
    if (colliderT && cloud.animKind === 'land') {
      colliderT.position = Vector3.create(0, -0.15 - 0.09 * wobble, 0)
    }
  }
}

/**
 * ‼️NOTHING IN THIS PLUGIN MAY STOP THE ISLAND. Twice on 2026-09-06 a first-time
 * spectacle path threw inside the frame loop and every system after it — the
 * coordinator included — stopped for the rest of the session: once at the end
 * of the loose ball's flight, once after the choir on a 980. A throw is now
 * caught here, logged once a second as `[punch] frame`, and the next frame
 * runs. Whatever broke degrades; the game goes on. Grep Player.log for it.
 */
let frameErrorLoggedAt = 0
function punchMachineSystem(dt: number): void {
  try {
    punchMachineSystemUnfenced(dt)
  } catch (error) {
    const now = Date.now()
    if (now - frameErrorLoggedAt > 1_000) {
      frameErrorLoggedAt = now
      console.error('[punch] frame: ' + String(error) + (error instanceof Error && error.stack ? ' ' + error.stack.split('\n').slice(0, 3).join(' | ') : ''))
    }
  }
}

function punchMachineSystemUnfenced(dt: number): void {
  const now = Date.now()
  updateJumpClouds(now, dt)
  if (machines.length > 0) holdArenaLocomotion()
  // Fire-and-forget by construction — see punch-board-store. It is called from
  // the frame loop precisely BECAUSE it cannot block one.
  refreshPunchBoard(boardStore, now)
  refreshPunchSupportTotals(resultsLog, now)
  // ~1.1 s sawtooth. The UI re-reads hud every frame, so this is what makes the
  // aim ring breathe and the target flash without any animation system.
  hud.pulse01 = (hud.pulse01 + dt / 1.1) % 1
  // A keyboard escape hatch. The prompt's button needs a free cursor, and a
  // player who lands mid-fall with the pointer locked cannot click anything —
  // E works with the cursor locked, so the way back never depends on the UI.
  //
  // The same key is the spectators' Rescue tap. Outside an active rescue it
  // has no crowd-game meaning.
  const pressedPrimary = inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
  if (hud.fallPrompt && pressedPrimary) returnToPunchIsland()
  else if (pressedPrimary && machines.length > 0) punchPrimaryPress()
  // ‼️F IS NO LONGER A CROWD KEY. It used to be JINX — the second half of a duel
  // that has been removed from the live mechanic — and there is now exactly one
  // spectator action, on E. Do not re-bind F here without reading the dormant
  // `PunchFocusSide` note in the contract: the Twist secret already reads F
  // while charging, and giving it a second meaning is how that breaks.
  // Entry catch: ARRIVING in the world must never mean falling past the island.
  // The spawn point is on the deck, but nothing is standing under it until this
  // scene's own colliders exist, so gravity gets a head start every single time.
  // Until the player has actually SETTLED up there — deck underfoot, arrival
  // cover gone — the scene keeps pressing its own button, retrying because
  // movePlayerTo is routinely declined while the world is still booting. One
  // shot was not enough: the first refusal was what left the visitor on the
  // ground looking up, with a manual "float back up" as the only way in.
  // Join/login still auto-returns: gravity on the island starts before the
  // deck exists. KEEP FLYING opts out of that capture and must not be undone.
  // The fall cloud is still offered so they can choose to come back up.
  if (
    !arrivalSettled &&
    !spawnCaptureOptedOut() &&
    hud.fallPrompt &&
    autoReturns < AUTO_RETURN_MAX &&
    now - lastAutoReturnAt >= AUTO_RETURN_EVERY_MS &&
    now - sceneBootAt < 180_000
  ) {
    lastAutoReturnAt = now
    autoReturns += 1
    returnToPunchIsland()
  }
  for (const machine of machines) {
    // One snapshot for profile selection per frame, rather than cloning all
    // queue/board/save rows every time an audio or visual helper reads a rule.
    const frameRound = machine.network?.snapshot()
    const profileId = frameRound?.profileId ?? selectedPunchProfile
    const authored = machine.authoredProfile ?? activeProfile(machine)
    const profile = profileId === authored.id ? authored : presetProfiles.get(profileId)!
    if (machine.config.gameProfile !== profile) machine.effectPlan = undefined
    machine.config.gameProfile = profile
    adoptIdentity(machine, now)
    swingArm(machine, now)
    if (machine.slamAt > 0 && now >= machine.slamAt) {
      machine.slamAt = 0
      fireSlam(machine, now)
    }
    updateShake(machine, now)
    updateCabinetRock(machine, now)
    updateShowWorld(machine, now)
    playRevealTicks(machine)
    for (let i = pendingPunchVoices.length - 1; i >= 0; i--) {
      const voice = pendingPunchVoices[i]!
      // 'voice', not 'crowd': these are the commentary lines, and they are what
      // the owner's separate switch is for. The cheer stays with the crowd.
      if (voice.machine === machine && now >= voice.at) { pendingPunchVoices.splice(i, 1); playSfx(machine, voice.clip, 0.85 * voice.gain, 'voice') }
    }
    flushCrowdSpeech(now)
    updateShowLights(machine, now)
    updateFacing(machine)
    // Round state, from whichever mode is actually running. The competition
    // path used to hardcode attempt = 1, which is why the counter never moved.
    const round = frameRound
    // ‼️THE VENUE IS THE MODE, AND NEVER THE TUNING. It used to carry a hash of
    // every scoring rule, so one slider in the Game director sent the next
    // punch to a venue nothing had ever been written to and the ALL TIME page
    // read as wiped. `punchProfileBoardKey` is now the mode id alone, and the
    // read is a prefix sweep that collects the venues that hash left behind.
    const boardKey = punchProfileBoardKey(activeProfile(machine))
    const venue = machine.config.boardStore.venue + ':' + boardKey
    if (!profileBoardStores.has(venue)) profileBoardStores.set(venue, createPunchBoardStore({ ...machine.config.boardStore, venue }, machine.config.leaderboardSize))
    boardStore = profileBoardStores.get(venue)!
    hud.profileTitle = activeProfile(machine).title
    hud.selectedProfile = punchProfile(selectedPunchProfile).title
    hud.streakSaved = round?.streakSaved === true
    hud.myBoostAward = round?.attempt?.boosts.find(entry => entry.userId === machine.localUserId)?.points ?? 0
    hud.supportScore = round?.supportScores?.find(entry => entry.userId === machine.localUserId)?.points ?? 0
    // Tonight's circle, ranked by summed circle score — the boosters' own board.
    hud.circleBoard = (round?.supportScores ?? [])
      .filter(row => (row.circle ?? 0) > 0)
      .sort((a, b) => (b.circle ?? 0) - (a.circle ?? 0))
      .slice(0, 3)
      .map(row => ({ name: row.name, circle: row.circle ?? 0, best: row.bestCircle ?? 0 }))
    const rescue = round?.rescue
    /* ‼️THE PANEL OUTLIVES THE WINDOW, FOR THE PUSH ONLY. `rescueVisible` used
       to end at `endsAt`, which is the same instant the result becomes true --
       so the reconciliation was drawn for zero frames and the owner's report was
       "it just switches off and nothing happens". `rescueLive` is the old gate
       and still owns every INPUT decision; the extension is presentation only. */
    const rescueLive = !!rescue && now >= rescue.announcedAt && now <= rescue.endsAt
    const rescueReview = !!rescue && rescue.skill === 'push'
      && now > rescue.endsAt && now <= rescue.endsAt + PUNCH_PUSH_REVIEW_MS
    const rescueVisible = rescueLive || rescueReview
    const queuedHere = !!round && (round.active?.userId === machine.localUserId || round.queue.some(row => row.userId === machine.localUserId))
    const inGameArea = playerNearMachine(machine, 20) || playerInZone(machine.config.audienceZoneId)
    const eligibleSpectator = !!round?.active && !queuedHere && inGameArea
    const iJoinedEarly = !!rescueInput?.accepted
      || !!(rescue?.pushAccepted?.includes(machine.localUserId))
    const inviteSpectator = eligibleSpectator && (!punchRescuePromptsMuted() || iJoinedEarly)
    const preparing = rescueLive && !!rescue && now < rescue.startsAt
    // Input dies with the window, never with the panel: a review beat is for
    // reading, and a press landing in it would be scored into a closed claim.
    const liveRescue = rescueLive && !!rescue && inviteSpectator && !preparing && !rescue.winner
    if (rescueLive && inviteSpectator && rescue && (!rescueInput || rescueInput.at !== rescue.startsAt)) {
      rescueInput = freshRescueInput(rescue.startsAt)
      playSfx(machine, SFX_RESCUE_OPEN, 1, 'machine')
    } else if (!rescueVisible) rescueInput = null
    const fumbler = (rescue?.rescuedName ?? round?.active?.name ?? 'THE PUNCHER').toUpperCase()
    const winner = rescue?.winnerName?.toUpperCase() ?? ''
    const secondsLeft = rescue ? Math.max(0, Math.ceil((rescue.endsAt - now) / 1000)) : 0
    const winnerFxKey = rescue?.winner && rescue.completedAt ? `${rescue.startsAt}:${rescue.winner}` : ''
    if (winnerFxKey && machine.rescueFxKey !== winnerFxKey) {
      machine.rescueFxKey = winnerFxKey
      machine.celebrationUntil = now + 2_400
      playSfx(machine, SFX_CHAMPION, 1, 'machine')
      spawnCelebration(machine)
      triggerAudience(machine, 999)
      startCloudQuake(999, round?.active?.userId === machine.localUserId, 1)
      if (round?.active?.userId === machine.localUserId) playPunchCameraImpulse(0.9)
      // ‼️EVERYBODY WHO PUSHED, NOT ONLY THE NAMED WINNER. Owner: "they're not
      // showing any kind of emotes when I do this." The old line fired handsair
      // for `rescue.winner` alone — one body in a room that just did it together.
      const iPushed = (rescue?.pushers ?? []).some(row => row.userId === machine.localUserId && row.gain > 0)
      if (iPushed) playPunchMove('handsair')
      machine.rescuePoseKey = rescue?.startsAt ?? 0
    }
    const showRescueHud = rescueVisible && (!!rescue?.winner || inviteSpectator || round?.active?.userId === machine.localUserId)
    /* ‼️THE COPY NAMES THE STAKE, AND THE STAKE IS "LAST". The window only opens
       on a player with no punches left now, so "SAVE MARIA" is literally the
       difference between one more swing and going home — and the room will not
       play for it unless it is told so. `rescueLastChance` is false only when a
       director has switched `rescueLastChanceOnly` off. */
    const lastChance = rescue?.lastChance !== false
    const rescueSkillNow = rescue?.skill ?? 'band-taps'
    const rescueNeed = Math.max(1, rescue?.bandTapsRequired ?? PUNCH_RESCUE_BAND_TAPS)
    const takenShot = rescueSkillNow === 'closest-shot' && rescueInput?.claimed
    hud.rescueLabel = showRescueHud
      ? rescue?.winner
        ? `${winner} SAVED ${fumbler}`
        : round?.active?.userId === machine.localUserId
          ? lastChance
            ? `LAST CHANCE · THE ROOM CAN BUY YOU ONE MORE PUNCH`
            : `FUMBLE · SPECTATORS CAN SAVE YOUR ${rescue?.streak ?? 0}-HIT RUN`
          : preparing
            ? `${lastChance ? 'LAST CHANCE FOR ' : 'SAVE '}${fumbler}! · GET READY`
            : takenShot
              ? 'SHOT TAKEN · WAITING FOR THE CALL'
              : rescueInput?.claimed
                ? 'SAVED IT · WAITING FOR THE CALL'
                : `SAVE ${fumbler}! · ${secondsLeft}`
      : ''
    /* ‼️THE HINT IS THE PENALTY NOW, NOT THE VERB. What to press is said by
       `punchRescueOrder` at four times this size and in words the DEVICE can obey
       — this line said "PRESS E" to a handset that has no E, and said it in 15 px
       cyan below the countdown, which is why a save could be played through
       without ever learning what it wanted. What is left here is the one rule the
       order has no room for: a press outside the zone SUBTRACTS. */
    hud.rescueHint = showRescueHud
      ? rescue?.winner
        ? `RUN PRESERVED · +1 PUNCH · ${winner} ADDED TO CONTRIBUTORS`
        : round?.active?.userId === machine.localUserId
          ? 'A SPECTATOR HAS TO EARN IT · YOU GET ONE SAVE A ROUND'
          : preparing
            ? 'GET READY'
            : rescueSkillNow === 'closest-shot'
              ? 'ONE SHOT EACH · CLOSEST TO THE MIDDLE WINS'
              : rescueSkillNow === 'hold'
                ? 'KEEP THE CIRCLE FULL'
                : `MISS AND YOU LOSE ONE · ${rescueInput?.net ?? 0}/${rescueNeed}`
      : ''
    hud.rescueRingVisible = showRescueHud && inviteSpectator
    hud.rescuePreparing = preparing
    hud.rescueSecondsLeft = secondsLeft
    hud.rescueTaps = rescueInput?.net ?? 0
    hud.rescueTapsRequired = rescueNeed
    hud.rescueInputPulse = rescueInput?.pulse ?? 0
    hud.rescueHold01 = rescue?.winner ? 1 : rescueInput ? Math.min(1, rescueInput.net / rescueNeed) : 0
    // ‼️THE MARKER, THE BAND AND WHETHER THE LAST PRESS LANDED — the three things
    // the panel needs to be a game rather than a progress bar. All three are
    // pure functions of `startsAt`, which every client has, so every screen in
    // the room draws the identical sweep and the coordinator scores that sweep.
    hud.rescueSkill = rescue?.skill ?? 'band-taps'
    /* THE PUSH's panel reads these. The band and the target are pure functions
       of the elapsed time since `startsAt`, so every screen in the room draws
       the same green in the same place without a clock crossing the wire. */
    const pushOn = rescue?.skill === 'push'
    const pushElapsed = rescue ? now - rescue.startsAt : 0
    const pushPeople = Math.max(1, rescue?.pushAccepted?.length ?? 1)
    const pushGap = { from: rescue?.pushFrom ?? 0, to: rescue?.pushTo ?? PUNCH_PUSH_THRESHOLD }
    hud.rescuePushOn = pushOn && showRescueHud
    hud.rescuePushAsking = pushOn && !!rescue && now < rescue.startsAt
    hud.rescuePushJoined = !!rescueInput?.accepted
    hud.rescuePushFrom = pushGap.from
    hud.rescuePushTo = pushGap.to
    hud.rescuePushScore = rescue?.pushScore ?? pushGap.from
    hud.rescuePushLatches = pushOn ? punchPushLatches(pushGap) : []
    hud.rescuePushPeople = pushPeople
    hud.rescuePushLevel01 = pushOn && rescueInput
      ? punchFocusDecay(rescueInput.level, Math.max(0, pushElapsed - rescueInput.lastStamp),
          PUNCH_PUSH_DECAY_SCALE * punchFocusGustAt(rescueInput.lastStamp))
      : 0
    hud.rescuePushTarget01 = pushOn ? punchPushTargetAt(Math.max(0, pushElapsed)) : PUNCH_FOCUS_TARGET_01
    hud.rescuePushBandHalf01 = punchPushBandHalfWidth(pushPeople, round?.roundRescues ?? 0)
    hud.rescuePushQuality01 = pushOn
      ? punchPushQuality01(hud.rescuePushLevel01 ?? 0, pushPeople, hud.rescuePushTarget01 ?? PUNCH_FOCUS_TARGET_01, round?.roundRescues ?? 0)
      : 0
    hud.rescuePushAskLeft = pushOn && rescue ? Math.max(0, Math.ceil((rescue.startsAt - now) / 1000)) : 0
    /* ‼️MY OWN CONTRIBUTION, PREDICTED LOCALLY. Owner: "it doesn't show how much
       extra points I have produced through my action -- I want everybody to see
       that I'm fighting for her." The coordinator's per-pusher number only
       arrives with the next snapshot, which is far too slow to feel like it is
       responding to a thumb. Replayed here with the SAME function the payout
       uses, over the elapsed window only, so the climbing number and the banked
       one are the same arithmetic and cannot disagree at the end. */
    if (pushOn && rescueInput && pushElapsed > 0 && !rescue?.winner) {
      if (now - (machine.rescueMineAt ?? 0) >= 100) {
        machine.rescueMineAt = now
        // Cap to the live window — never integrate past endsAt, or a late
        // snapshot that stretched endsAt for the celebration beat would keep
        // minting dwell points the board never received.
        const liveWindow = Math.max(0, Math.min(pushElapsed, (rescue.endsAt || 0) - (rescue.startsAt || 0)))
        machine.rescueMine = punchPushReplay(rescueInput.stamps, {
          phase0: 0, people: pushPeople, windowMs: liveWindow,
          rescueIndex: round?.roundRescues ?? 0,
          perSec: activeProfile(machine).rescuePushPerSec,
        }).gain
      }
    } else if (!pushOn) machine.rescueMine = 0
    hud.rescuePushMine = machine.rescueMine ?? 0
    /* ‼️EVERY PUSHER, NAMED, WHILE IT IS HAPPENING -- not only in the result
       card. This is the "none of that is visible from the outside" half: the
       puncher watching their own number climb should be able to read who is
       lifting it, and each pusher should see their own line among them.
       Local prediction overlays YOUR row so the number climbs with the thumb
       instead of waiting for the next snapshot. */
    const pushRows: Array<{ userId?: string; name: string; gain: number; mine: boolean; quality01?: number }> = (rescue?.pushers ?? []).map(row => ({
      userId: row.userId, name: row.name, gain: row.gain, mine: row.userId === machine.localUserId,
      quality01: row.quality01 ?? 0,
    }))
    if (rescueInput?.accepted) {
      const mineIdx = pushRows.findIndex(row => row.mine)
      const serverGain = mineIdx >= 0 ? pushRows[mineIdx]!.gain : 0
      // Once the window is over (save or buzzer), the coordinator's attributed
      // share is the truth — Math.max with local raw dwell is how YOU ADDED
      // read +498 on a room that only climbed +247.
      const live = !rescue?.winner && !!rescue && now < rescue.endsAt
      const mineGain = live
        ? Math.max(serverGain, machine.rescueMine ?? 0)
        : (mineIdx >= 0 ? serverGain : Math.round(machine.rescueMine ?? 0))
      if (mineIdx >= 0) pushRows[mineIdx] = {
        ...pushRows[mineIdx]!,
        gain: mineGain,
        quality01: hud.rescuePushQuality01 ?? pushRows[mineIdx]!.quality01 ?? 0,
      }
      else pushRows.push({
        userId: machine.localUserId, name: 'YOU', gain: mineGain, mine: true,
        quality01: hud.rescuePushQuality01 ?? 0,
      })
    }
    pushRows.sort((a, b) => b.gain - a.gain)
    hud.rescuePushers = pushRows
    hud.rescuePushDone = pushOn && !!rescue?.settled
    hud.rescuePushSaved = !!rescue?.winner
    /* ‼️WHO SEES THE VEIL. Owner, 2026-09-10: others must see the struggle on
       the BODY, not a copy of the full-screen meter. The person whose thumb is
       on the save keeps the instrument. The puncher and anyone who has not
       said yes get a chip, or nothing, so they can look at the people. */
    const iAmPuncher = !!round?.active && round.active.userId === machine.localUserId
    const iJoined = !!rescueInput?.accepted
      || pushRows.some(row => row.mine)
      || !!(rescue?.pushAccepted?.includes(machine.localUserId))
    let pushHud: NonNullable<PunchMachineHudState['rescuePushHud']> = 'off'
    if (pushOn && rescueVisible) {
      if (preparing) {
        if (iAmPuncher) pushHud = 'watch'
        else if (inviteSpectator) pushHud = 'ask'
        else pushHud = 'off'
      }
      else if (rescueReview || rescue?.settled) pushHud = (iJoined || iAmPuncher) ? 'result' : 'off'
      else if (inviteSpectator && iJoined) pushHud = 'play'
      else if (inviteSpectator || iAmPuncher) pushHud = 'watch'
    }
    hud.rescuePushHud = pushHud
    const worldLive = pushOn && !!rescue && now >= rescue.startsAt
      && now <= rescue.endsAt + (rescueReview || rescue?.settled ? PUNCH_PUSH_REVIEW_MS : 0)
    const worldRows: PushSignalMember[] = []
    if (worldLive) {
      const seen = new Set<string>()
      for (const row of pushRows) {
        const id = (row.userId ?? '').trim().toLowerCase()
        if (!id || id === (round?.active?.userId ?? '')) continue
        seen.add(id)
        worldRows.push({
          userId: id,
          name: row.name,
          quality01: row.mine ? (hud.rescuePushQuality01 ?? row.quality01 ?? 0) : (row.quality01 ?? 0),
          gain: row.gain,
          mine: row.mine,
          done: !!hud.rescuePushDone,
          saved: !!hud.rescuePushSaved
        })
      }
      for (const id of rescue?.pushAccepted ?? []) {
        const uid = id.trim().toLowerCase()
        if (!uid || seen.has(uid) || uid === (round?.active?.userId ?? '')) continue
        const mine = uid === machine.localUserId
        worldRows.push({
          userId: uid,
          name: mine ? 'YOU' : 'PLAYER',
          quality01: mine ? (hud.rescuePushQuality01 ?? 0) : 0,
          gain: 0,
          mine,
          done: !!hud.rescuePushDone,
          saved: !!hud.rescuePushSaved
        })
      }
    }
    hud.rescuePushWorld = worldRows
    /* ‼️DID *I* DO ANYTHING, AND WAS I THE BIGGEST? "There is no summary for me,
       there is no scoreboard for me" -- the puncher has always had a result
       card and the people who saved them had nothing with their name on it. */
    /* ‼️A SOUND AT THE MOMENT THE RESULT APPEARS, for the people who played it.
       The champion sting already fires at the machine when a save lands, but it
       belongs to the SAVE; this one belongs to the reader, and it fires on both
       endings so "did I do it" is answered by ear before it is read. Keyed by
       the window so it plays exactly once. */
    if (rescueReview && rescue && machine.rescueReviewKey !== rescue.startsAt) {
      machine.rescueReviewKey = rescue.startsAt
      const iPushed = (rescue.pushers ?? []).some(row => row.userId === machine.localUserId && row.gain > 0)
        || (rescueInput?.accepted && (machine.rescueMine ?? 0) > 0)
      if (iPushed || round?.active?.userId === machine.localUserId) {
        playSfx(machine, rescue.winner ? SFX_HIGH_SCORE : SFX_TURN_LAST,
          rescue.winner ? 1 : 0.7, 'machine', rescue.winner ? 1.15 : 0.85)
      }
      // A miss has no winnerFx, so the body still has to say how it ended.
      if (iPushed && !rescue.winner && machine.rescuePoseKey !== rescue.startsAt) {
        machine.rescuePoseKey = rescue.startsAt
        playPunchMove('shrug')
      }
    }
    /* ‼️THE HELPER MEDITATES. Owner, 2026-09-10: in the green the SCREEN has
       to be alive — shake, crowd, GO GO GO — and outside it has to go quiet.
       The body is not the alarm: clap is a different emote with baked applause,
       and swapping into it every beat read as "all sorts of emotes" on a job
       that is supposed to be the same looped focus as tapping Focus. Cheers
       and shouts stay only while THIS client's grade is full. */
    if (pushOn && rescueLive && rescueInput?.accepted && !rescue?.winner && !preparing) {
      const quality = hud.rescuePushQuality01 ?? 0
      const inGreen = quality >= 0.999
      if (now - (machine.rescueEmoteAt ?? 0) >= FOCUS_EMOTE_EVERY_MS) {
        machine.rescueEmoteAt = now
        playFocusEmote()
      }
      if (inGreen) {
        if (now >= machine.shakeUntil || machine.shakeMag <= PUSH_RATTLE_MAG) {
          machine.shakeMag = PUSH_RATTLE_MAG
          machine.shakeUntil = now + 240
        }
        if (now - (machine.rescueCheerAt ?? 0) >= PUSH_CHEER_EVERY_MS) {
          machine.rescueCheerAt = now
          const cheer = pickFrom(SFX_CROWD)
          if (cheer) playSfx(machine, cheer, 0.62, 'crowd')
          playSfx(machine, SFX_RATTLE, 0.22, 'machine', 1.05)
        }
        if (PUSH_HYPE_VOICE.length > 0 && now - (machine.rescueHypeAt ?? 0) >= PUSH_HYPE_EVERY_MS) {
          machine.rescueHypeAt = now
          const line = pickFrom(PUSH_HYPE_VOICE)
          if (line) playSfx(machine, line, 0.8, 'voice')
        }
      }
    }
    const mineFromList = pushRows.findIndex(row => row.mine)
    const totalPushGain = pushRows.reduce((sum, r) => sum + Math.max(0, r.gain), 0)
    const gapFrom = rescue?.pushFrom ?? 0
    const roomAdded = Math.max(0, Math.round((rescue?.pushScore ?? 0) - gapFrom))
    const mineRawGain = mineFromList >= 0 ? pushRows[mineFromList]!.gain : 0
    hud.rescuePushMineRank = mineFromList >= 0 && mineRawGain > 0 ? mineFromList + 1 : 0
    hud.rescuePushMineFinal = totalPushGain > 0 && roomAdded > 0
      ? Math.min(roomAdded, Math.round((mineRawGain / totalPushGain) * roomAdded))
      : mineRawGain
    hud.rescueMarker01 = rescue && !preparing ? punchRescueMarker(now - rescue.startsAt) : 0.5
    hud.rescueBand01 = rescue?.band01 ?? 0
    hud.rescueInBand = !!rescue && !preparing && punchRescueInBand(now - rescue.startsAt, rescue.band01)
    hud.rescueLastChance = rescue?.lastChance === true
    // A miss flashes for longer than a hit, because a miss is the one that has
    // something to teach and 160 ms is under the threshold of "did that happen".
    hud.rescueOutFlash = !!rescueInput && !rescueInput.lastHit && now - rescueInput.lastTapAt < 260
    hud.rescueHitFlash = !!rescueInput && rescueInput.lastHit && now - rescueInput.lastTapAt < 200
    hud.rescueCanTap = liveRescue && !rescueInput?.claimed
    hud.rescueWinnerName = winner
    hud.rescueRescuedName = fumbler
    hud.rescueRescuedUserId = rescue?.rescuedUserId ?? round?.active?.userId
    hud.rescueHeroUserId = pushRows[0]?.userId
    hud.rescueHeroName = pushRows[0]?.name
    hud.streakSaveReady = false
    hud.streakSaveProgress = ''
    hud.streakSaveEarning = false
    hud.streakMultiplier = round?.streakMultiplier ?? 1
    hud.nextMultiplier = activeProfile(machine).multipliers[Math.min((round?.roundMomentum ?? machine.roundStreak) + 1, activeProfile(machine).multipliers.length - 1)] ?? 1
    /* The old line promised a fumble watch that fired on every sub-900 and paid
       whoever hammered first. Both halves of that are gone: the window opens on
       a player's LAST punch, and it is won by landing presses in the band. */
    /* "We need to see how many players are playing — if the maximum is 4, show
       one out of 4" (owner, 2026-09-08). Lifted above its own HUD field below,
       because the goal line needs it first: whether four digits are on the table
       depends on whether anybody else is here to pay for them. */
    const playersIn = round
      ? (round.active && round.active.userId !== PUNCH_HOUSE_BOT_ID ? 1 : 0) +
        round.queue.filter((entry) => entry.userId !== PUNCH_HOUSE_BOT_ID).length
      : 0
    /* ‼️THE GOAL LINE IS DERIVED NOW, AND HERE IS THE BUG THAT MADE IT SO.
       It read a hardcoded 'BREAK 1,000' for the whole build while the ceiling was
       999 and Boost was passing an empty array. Owner, 2026-09-08: *"It says break
       the 1000 but I don't think it's possible to break the one 1000, I've never
       seen anything above it."* He was right, and the island had been saying it to
       every solo player on it.

       ‼️SO NEVER TYPE A TARGET INTO THIS STRING AGAIN. `punchReachableCeiling`
       is the one place that knows what a punch can currently pay; ask it. And when
       the CROWD is the missing ingredient rather than the skill, say THAT — naming
       a number nobody in the room can reach is the same lie in a smaller font. */
    const boostLive = punchBoostLive(activeProfile(machine))
    const soloCeiling = punchReachableCeiling(machine.config, false).toLocaleString()
    const highGround = PUNCH_HIGH_GROUND_THRESHOLD.toLocaleString()
    hud.helpGoal = eligibleSpectator
      ? 'WATCH FOR A LAST CHANCE · EARN THE SAVE'
      : !boostLive
        ? `PERFECT IS ${soloCeiling} · BUILD THE RUN`
        : playersIn >= 2
          ? `BREAK ${highGround} TOGETHER · BUILD THE RUN`
          : `PERFECT IS ${soloCeiling} ALONE · ${highGround} NEEDS THE ROOM`
    hud.reactionExplanation = Object.entries(effectPlan(machine)).map(([id,r]) => id + ': ' + r.reason).join(' | ')
    hud.attempt = round ? round.attemptsUsed : machine.attemptInRound
    const challenge = punchChallenge(hud.attempt + 1, hud.phase === 'charging' ? (round ? machine.localHeldMs : machine.soloHeldMs) : 0, machine.config.idealChargeMs, activeProfile(machine))
    hud.difficultyLabel = `${machine.goldenActive ? 'GOLDEN · ' : ''}SPEED ${challenge.speed.toFixed(2)}× · PRECISE HIT ×${challenge.multiplier.toFixed(2)}`
    const landedChallenge = round?.challengeAward
    if (landedChallenge) {
      hud.challengeSpeed = landedChallenge.speed
      hud.challengeHitMult = landedChallenge.difficultyMultiplier
      hud.challengeBonus = landedChallenge.difficultyBonus + landedChallenge.timeBonus
    } else if (hud.phase !== 'scoring' && hud.phase !== 'cooldown') {
      hud.challengeSpeed = challenge.speed
      hud.challengeHitMult = challenge.multiplier
      hud.challengeBonus = 0
    }
    hud.scoreCommitted = round
      ? hud.phase === 'scoring' || hud.phase === 'cooldown' || hud.phase === 'summary'
      : hud.phase === 'cooldown' || hud.phase === 'summary'
    /* ‼️FUMBLE RISK, SAID BEFORE THE PUNCH RATHER THAN AFTER IT. Computed here
       for the same attempt number and held time the marker itself is computed
       from, so the warning and the needle can never describe different punches.
       Off by default for nobody: it is the director's switch, and when it is off
       both numbers are zero and every surface downstream draws its ordinary
       self rather than a muted version of the warning. */
    const riskProfile = activeProfile(machine)
    const risking = riskProfile.fumbleRiskTellEnabled && hud.isMyTurn
      && (hud.phase === 'ready' || hud.phase === 'charging')
    hud.fumbleRisk01 = risking
      ? punchFumbleRisk01(hud.attempt + 1, hud.phase === 'charging' ? (round ? machine.localHeldMs : machine.soloHeldMs) : 0, machine.config.idealChargeMs, riskProfile)
      : 0
    hud.fumbleStake01 = risking ? punchFumbleStake01(round?.roundStreak ?? machine.roundStreak, riskProfile) : 0
    hud.fumbleRiskStyle = riskProfile.fumbleRiskTellStyle
    const stance = currentPunchStance(machine)
    hud.stanceLabel = `${stance.cue} · ${stance.penaltyPercent ? '−' + stance.penaltyPercent + '%' : 'FULL POWER'}`
    if (round) hud.challengeLabel = round.challengeAward ? `DIFFICULTY ×${round.challengeAward.difficultyMultiplier.toFixed(2)} +${round.challengeAward.difficultyBonus}` : ''
    hud.attemptsMax = round ? round.attemptsAllowed : machine.roundAttemptsAllowed
    // Solo has no queue, so it has no cap: a player alone with the machine
    // rides the runaway guard, exactly as they always did.
    hud.attemptsCeiling = round ? round.attemptsCeiling : PUNCH_ROUND_ATTEMPTS_MAX
    hud.roundTotal = round ? round.roundTotal : machine.roundTotal
    hud.lastPunch = round ? round.score : machine.soloTargetScore
    // The streak follows the same rule as every other round instrument: read the
    // coordinator when there is one, the local round when there is not. In
    // competition `streakAt` is still stamped by `announceStreak` off the shared
    // scoring phase, so the badge flashes on every client at the same moment.
    hud.streak = round ? round.roundStreak : machine.roundStreak
    hud.streakTotal = round ? round.roundStreakBonus : machine.roundStreakBonus
    // Both lists, every frame, whether or not the panel is open: the button
    // has to know whether there is anything to show before it is pressed.
    hud.leaderboard = round?.leaderboard ?? []
    hud.localUserId = machine.localUserId
    const liveSaviors = round?.supportScores ?? []
    const dbSaviors = resultsLog?.supportTotals ?? []
    hud.saviors = rankPunchSaviors([...dbSaviors, ...liveSaviors], ALL_TIME_ROWS)
    const legacy = round?.saveLegacy
    const shares = legacy?.shares ?? []
    const localId = (machine.localUserId ?? '').trim().toLowerCase()
    const mineShare = shares.find((row) => row.userId === localId)
    const hero = mineShare ?? shares[0]
    const heroRow = hero
      ? liveSaviors.find((row) => (row.userId ?? '').trim().toLowerCase() === hero.userId)
      : undefined
    hud.saveRunPoints = punchSaviorScore(heroRow ?? {})
    hud.saveRunVisible = !!legacy && !!hero && hud.saveRunPoints > 0
    hud.saveRunHelperId = hero?.userId ?? ''
    hud.saveRunHelperName = hero?.name ?? ''
    hud.saveRunKeptName = legacy?.rescuedName ?? ''
    hud.saveRunPeople = shares.length
    hud.saveRunMine = !!mineShare
    // ALL TIME IS NEVER EMPTIER THAN TONIGHT — see mergePunchBoards. The store's
    // rows are the venue's memory; tonight's board is what is happening now, and
    // it was being left off a page that calls itself ALL TIME.
    hud.allTime = mergePunchBoards(
      boardStore?.allTime ?? [],
      hud.leaderboard,
      Math.max(ALL_TIME_ROWS, boardStore?.size ?? 0)
    )
    // So the panel can say, under rows it CAN show, whether this venue keeps them.
    //
    // ‼️`live`, NOT `punchBoardEnabled`. This read a configured KEY and called
    // that "saved", which is the defect the owner caught on 2026-09-05: the
    // island printed BEST PUNCH PER PLAYER, ALL TIME over a list that was
    // tonight's peer-synced session and nothing else, because a url and a key
    // were present in the bundle. `punch_board` had never received a single row
    // in its life. Every failure in the store is a silent catch by design, so
    // the ONE place the truth could have surfaced was this line, and it was
    // asserting the opposite.
    //
    // `live` turns true only once a read has actually come back, so a store
    // that is off, unreachable, denied USE_FETCH or has given up now falls
    // through to the copy the panel already carries for it — ALL TIME · NOT
    // SAVED FOR THIS VENUE — instead of claiming a history nobody has.
    hud.allTimeSaved = !!boardStore && punchBoardEnabled(boardStore.config) && boardStore.live
    // THIS ROUND'S STORY, and whether it is a RECORD. The board ranks rounds and
    // re-ranks on every punch, so at the summary the top row IS this round when
    // it is the best of tonight; the same test against the merged all-time list
    // says whether it is the best ever. "If you make a new best score we need
    // to take care of that" (owner, 2026-09-08). Both lists exist for every
    // client, so the rail can say it to the room, not only to the puncher.
    hud.roundBestPunch = round?.roundBestPunch ?? 0
    hud.roundStrong = round?.roundStrong ?? 0
    hud.roundLongestStreak = round?.roundLongestStreak ?? 0
    if (round?.active && machine.recordBaselineRoundAt !== round.roundStartedAt) {
      machine.recordBaselineRoundAt = round.roundStartedAt
      const previous = hud.allTime.filter(row => row.achievedAt !== round.roundStartedAt)
      const playerId = round.active.userId.toLowerCase()
      machine.personalBestBeforeRound = previous.find(row => row.userId.toLowerCase() === playerId)?.score ?? 0
      machine.hourlyBestBeforeRound = Math.max(0, ...previous.filter(row => row.achievedAt >= now - 3_600_000).map(row => row.score))
      machine.dailyBestBeforeRound = Math.max(0, ...previous.filter(row => row.achievedAt >= now - 86_400_000).map(row => row.score))
      machine.allTimeBestBeforeRound = Math.max(0, ...previous.map(row => row.score))
    }
    const overWith = !!round && round.phase === 'summary' && !!round.active && round.roundTotal > 0
    const topTonight = overWith ? hud.leaderboard[0] : undefined
    hud.recordTonight = !!topTonight && topTonight.userId === round!.active!.userId && topTonight.achievedAt === round!.roundStartedAt
    hud.recordPersonal = overWith && round!.roundTotal > (machine.personalBestBeforeRound ?? 0)
    hud.recordHourly = overWith && round!.roundTotal > (machine.hourlyBestBeforeRound ?? 0)
    hud.recordDaily = overWith && round!.roundTotal > (machine.dailyBestBeforeRound ?? 0)
    hud.recordAllTime = overWith && round!.roundTotal > (machine.allTimeBestBeforeRound ?? 0)
    const recordFxKey = overWith && (hud.recordPersonal || hud.recordHourly || hud.recordDaily || hud.recordAllTime)
      ? `${round!.roundStartedAt}:${hud.recordAllTime ? 'all' : hud.recordDaily ? 'day' : hud.recordHourly ? 'hour' : 'personal'}` : ''
    if (recordFxKey && machine.recordFxKey !== recordFxKey) {
      machine.recordFxKey = recordFxKey
      playSfx(machine, SFX_HIGH_SCORE, 1, 'machine')
      spawnCelebration(machine)
      triggerAudience(machine, hud.recordAllTime ? 999 : 930)
    }
    // A round that has ENDED must look ended: the card counts itself out
    // instead of the machine quietly dealing a new one.
    hud.summaryMsLeft = round
      ? round.phase === 'summary'
        ? Math.max(0, round.phaseEndsAt - now)
        : 0
      : machine.soloPhase === 'summary'
        ? Math.max(0, PUNCH_ROUND_SUMMARY_MS - machine.soloElapsedMs)
        : 0
    // Entry state, so the button can say what pressing it will do.
    // `queued` is filled after the network tick: it means the SHARED list, not
    // this device's opt-in. Opt-in alone is how a ghost phone looked in line.
    hud.queued = false
    hud.joiningQueue = false
    hud.ghostLive = false
    hud.queuePlace = round
      ? round.queue.findIndex((entry) => entry.userId === machine.localUserId) + 1
      : 0
    // Computed at the goal line above, which reasons about it. One expression, so
    // the count the HUD prints and the count the goal line trusts cannot differ.
    hud.playersIn = playersIn
    /* THE RING. Four play; everybody else stands here in arrival order and takes
       the next seat that frees, so a fifth arrival is a place in line rather than
       a button that quietly does nothing. `roundPaceMs` is measured by the
       coordinator from completed rounds — 0 means the line prints a place and no
       time, never an invented one. */
    hud.ringPlace = round
      ? (round.ring ?? []).findIndex((entry) => entry.userId === machine.localUserId) + 1
      : 0
    hud.ringSize = round ? (round.ring ?? []).length : 0
    hud.roundPaceMs = round?.roundPaceMs ?? 0
    hud.canJoinQueue =
      !!round &&
      !machine.queueOptIn &&
      (playerNearMachine(machine) ||
        playerInZone(machine.config.queueZoneId) ||
        playerInZone(machine.config.audienceZoneId))
    // Whose turn, and how long they have to step up to the bag.
    hud.activeName = round?.active?.name ?? ''
    hud.activeUserId = round?.active?.userId ?? ''
    hud.isMyTurn = round ? round.active?.userId === machine.localUserId : true
    // The panel sits over the middle of the screen and a wind-up needs that
    // space. Held shut for the duration of YOUR charge only - a spectator
    // reading the board while somebody else swings is exactly the moment the
    // board is for.
    if (hud.scoreboardOpen && hud.isMyTurn && hud.phase === 'charging') {
      hud.scoreboardOpen = false
    }
    // THE SHOT CLOCK'S REAL CONSEQUENCE. A turn that ends without a single
    // swing takes the player out of the rotation — read on the EDGE out of the
    // turn rather than from a snapshot flag, because the coordinator's own
    // no-show list is not on the wire and does not need to be: both sides are
    // watching the same thing happen. Clearing the opt-in is what makes it
    // stick, since the reconcile would otherwise re-add them within the second.
    //
    // ‼️SAID ONCE PER ENTRY. The no-show list is the COORDINATOR'S private
    // memory and is not on the wire, so a handover — or a coordinator that
    // never received the leave — deals the bag straight back to somebody who
    // has already sat down. That phantom turn used to replay the entire notice
    // every time it came round: two rising notes, the banner again, a silent
    // leave a second later, and again on the next rotation, forever, at a
    // player who was doing nothing but watching. A player who is ALREADY
    // sitting out is now told nothing further. The latch is only lowered by a
    // deliberate ask, so the notice fires on the first no-show of each entry
    // and never again on the machine's own confusion.
    if (round) {
      const myTurn = round.active?.userId === machine.localUserId
      // Out by the shot clock, and not asked back in. Nothing about a turn —
      // no sound, no clock, no banner — is allowed to reach this player.
      const sittingOut = machine.missedTurn && !machine.queueOptIn
      if (myTurn && !machine.wasMyTurn) {
        machine.swungThisTurn = false
        // YOU ARE UP. A turn used to begin with nothing but a 22 px chip
        // changing in the top rail, so the first a player knew of their turn was
        // often the clock running out. Two rising notes, once, on the edge in.
        machine.turnTickSecond = -1
        if (!sittingOut) {
          playSfx(machine, SFX_TURN_START, 0.85, 'machine')
          // Seat them on the mark for a few seconds of retries. The previous
          // body is evicted on their own client in the same frame.
          machine.strikeSeatUntil = now + PUNCH_STRIKE_SEAT_WINDOW_MS
          machine.strikeSeatAt = 0
        }
      } else if (!myTurn && machine.wasMyTurn && !machine.swungThisTurn && !sittingOut) {
        machine.missedTurn = true
        machine.missedTurnAt = now
        machine.queueOptIn = false
        machine.queueSyncAt = 0
      }
      if (!myTurn) {
        machine.turnTickSecond = -1
        machine.strikeSeatUntil = 0
      }
      machine.wasMyTurn = myTurn
    }
    // A NOTICE, NOT A STATE. The latch has to persist — it is the only thing
    // stopping the reconcile from handing a no-show their place straight back.
    // The BANNER does not: it says its piece and leaves, and the player watches
    // in peace with a clean screen until they choose to press JOIN.
    hud.missedTurn =
      machine.missedTurn && now - machine.missedTurnAt < PUNCH_MISSED_TURN_NOTICE_MS
    hud.turnMsLeft =
      round && round.phase === 'ready' ? Math.max(0, round.phaseEndsAt - now) : 0
    // The countdown ticks for whoever is holding the bag BY CHOICE. A phantom
    // turn dealt to somebody sitting out gets no clock and no ticking.
    if (hud.isMyTurn && !(machine.missedTurn && !machine.queueOptIn)) {
      tickTurnClock(machine, hud.turnMsLeft)
    } else machine.turnTickSecond = -1
    // Loitering on the strike spot during someone else's turn.
    hud.mustStepAside =
      !!round && !hud.isMyTurn && !!round.active && playerAtStrikeSpot(machine)
    if (!hud.mustStepAside) machine.stepAsideSince = 0
    else if (machine.stepAsideSince === 0 || now - machine.stepAsideSince >= PUNCH_STRIKE_MOVE_RETRY_MS) {
      // Right away, then retry if the teleport was declined. Only ever OURSELVES:
      // the SDK cannot move another avatar, so every client clears its own
      // player and the spot ends up free without anyone shoving anyone.
      machine.stepAsideSince = now
      const center = getWorldPosition(engine, machine.root)
      void nudgePlayerOffStrikeSpot(center)
    }
    hud.mustStandOnMark =
      hud.isMyTurn &&
      !(machine.missedTurn && !machine.queueOptIn) &&
      !!round &&
      round.phase === 'ready' &&
      currentPunchStance(machine).penaltyPercent > 0 &&
      !hud.fallPrompt
    if (hud.mustStandOnMark && now < machine.strikeSeatUntil) {
      if (machine.strikeSeatAt === 0 || now - machine.strikeSeatAt >= PUNCH_STRIKE_MOVE_RETRY_MS) {
        machine.strikeSeatAt = now
        void seatPlayerOnStrikeSpot(getWorldPosition(engine, machine.root))
      }
    } else if (!hud.mustStandOnMark) {
      machine.strikeSeatUntil = 0
    }
    if (machine.revealAt > 0 && now >= machine.revealAt) {
      machine.revealAt = 0
      playReveal(machine, machine.revealScore)
    }
    const network = machine.network
    if (network) {
      {
        const realm = RealmInfo.getOrNull(engine.RootEntity)
        hud.roomConnected = realm ? realm.isConnectedSceneRoom ?? false : null
        hud.roomName = realm?.room ?? ''
        hud.roomAdapter = realm?.commsAdapter ?? ''
        const room = punchRoomDiagnostics()
        hud.roomReady = room.ready
        hud.roomSynced = room.synced
        hud.roomFramesIn = room.framesIn
        hud.roomLastFrom = room.lastFrom
      }
      network.tick(now, {
        connected: hud.roomConnected,
        ready: hud.roomReady,
        synced: hud.roomSynced,
        framesIn: hud.roomFramesIn
      })
      hud.serverWaking = !network.serverAlive(now) && !punchServerPulseAlive(now)
      hud.houseMode = network.authorityMode()
      hud.houseWaitLeftSec = Math.ceil(network.houseWaitLeftMs(now) / 1000)
      {
        const http = punchHttpDiagnostics()
        hud.httpWire = http.enabled
        hud.httpFramesIn = http.framesIn
        hud.httpSeq = http.lastActionId
        hud.httpError = http.lastError
      }
      const snapshot = network.snapshot()
      const atMachine =
        playerNearMachine(machine) ||
        playerInZone(machine.config.queueZoneId) ||
        playerInZone(machine.config.strikeZoneId)
      // ‼️LEAVING IS A JOURNEY, NOT A FRAME. Giving up the slot the instant this
      // read goes false is what let a live round die with no explanation: the
      // reconcile below turns it into a `leave`, and the coordinator ends the
      // ACTIVE player's turn on one. Every input to the read can be false for a
      // frame while the player has not moved an inch —
      // `Transform.getOrNull(engine.PlayerEntity)` is null on a hitch or a
      // realm blip, `playerInZone` needs a `modelOrigin` that is briefly absent
      // after a reload, and both height gates (3 m from the cabinet, 1.8 m off
      // the zone floor) are crossed by a jump, a jump-cloud, a knock-back or a
      // celebration the game itself fired. Owner, 2026-09-09: *"I hit 999 and
      // then something above 900 and the game just ended anyway."*
      //
      // So the read has to say "away" for `PUNCH_AWAY_GRACE_MS` UNBROKEN before
      // it costs anybody a slot. An opted-in ghost still loses it — three
      // seconds later — which is what the rule was for. A single bad frame no
      // longer ends a run.
      if (atMachine) machine.awaySince = 0
      else if (machine.awaySince === 0) machine.awaySince = now
      else if (now - machine.awaySince > PUNCH_AWAY_GRACE_MS) machine.queueOptIn = false
      // Reconcile, do not edge-trigger. The old join fired once on the way in
      // and never again, so a player dropped out of the rotation the moment
      // their own round ended and had no way back without leaving and
      // returning. Comparing intent against the shared list every tick is
      // self-healing: a dropped message, a coordinator handover or a finished
      // turn all repair themselves on the next pass.
      const listed =
        snapshot.active?.userId === machine.localUserId ||
        snapshot.queue.some((entry) => entry.userId === machine.localUserId)
      const listedLive =
        listed || (snapshot.ring ?? []).some((entry) => entry.userId === machine.localUserId)
      if (machine.queueOptIn) {
        if (machine.joinAskedAt === 0) machine.joinAskedAt = now
      } else machine.joinAskedAt = 0
      hud.queued = machine.queueOptIn && listedLive
      hud.joiningQueue = machine.queueOptIn && !listedLive
      hud.ghostLive =
        (hud.joiningQueue && now - machine.joinAskedAt > PUNCH_JOIN_CONFIRM_MS) ||
        (machine.queueOptIn &&
          otherHumansInScene() > 0 &&
          hud.httpWire &&
          Boolean(hud.httpError) &&
          machine.networkSince > 0 &&
          now - machine.networkSince > PUNCH_GHOST_WIRE_MS &&
          network.isCoordinator())
      // HOLDING A BAG NOBODY ASKED FOR is the one case that cannot wait out
      // the throttle: every second of it is a second the whole rotation is
      // stalled on a spectator, and it is what gives the phantom turn long
      // enough to be seen and heard at all. Handed straight back.
      const dealtToASpectator =
        !machine.queueOptIn && snapshot.active?.userId === machine.localUserId
      if (machine.queueOptIn !== listed && (dealtToASpectator || now - machine.queueSyncAt > 900)) {
        machine.queueSyncAt = now
        if (machine.queueOptIn) {
          // Carries the deliberate flag exactly once — the reconcile is the only
          // sender, so a press has to hand its intent over rather than send.
          // ‼️NO PER-PLAYER MODE OVERRIDE IN A SHARED ROOM. Owner, 2026-09-06:
          // "aren't they playing together? if you play together you have to
          // play the same, so we have to choose for them until we have some
          // kind of isolated gaming environment."
          //
          // Correct, and the code was worse than ambiguous about it. `profile()`
          // in punch-machine-network.ts resolves `state.active?.profileId ??
          // authoredProfile.id`, so a queue entry's mode BEAT the venue setting
          // the owner authored in Apps -> Punch Machine -> Game director. And
          // `punchProfileBoardKey` hashes the scoring rules, so every mode keeps
          // its OWN leaderboard: a room where players cycled modes was quietly
          // splitting its scoreboard into three, none of them the venue's.
          //
          // Sending nothing falls the queue entry back to the authored profile,
          // which is the one authority a shared venue can have. The per-entry
          // `profileId` plumbing stays exactly where it is -- it is what an
          // isolated instance will need on the day there is one.
          network.joinQueue(machine.queueIntent)
          machine.queueIntent = 'auto'
        } else {
          network.leaveQueue(machine.queueIntent)
          machine.queueIntent = 'auto'
        }
      }
      const inQueue = machine.queueOptIn
      machine.wasInQueue = inQueue
      const isMyTurn = snapshot.active?.userId === machine.localUserId
      if (snapshot.phase !== 'ready' && snapshot.phase !== 'charging') {
        machine.localCharging = false
        machine.localReleased = false
      }
      // Pointer-up is global on purpose: a held cursor often drifts off the moving bag.
      if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_UP)) {
        releaseNetworkPunch(machine, now)
      }
      if ((snapshot.phase === 'charging' || machine.localCharging) && !machine.localReleased && isMyTurn) {
        machine.localHeldMs = Math.max(0, now - (machine.localChargeStartedAt || now))
      }
      updateSecretInputs(machine, now, (snapshot.phase === 'charging' || machine.localCharging) && !machine.localReleased && isMyTurn)
      presentCompetitionState(machine, now)
      submitPunchBoardScore(
        boardStore,
        // ‼️MY OWN ROUND FIRST, THE SHARED BOARD ONLY AS A FALLBACK -- and the
        // order is the fix, not a preference. See `myBoardEntry`: the shared
        // ranking is READ CAPPED, so a player outside the top rows had no entry
        // to find and their score was never written to the store at all.
        myBoardEntry(machine, snapshot),
        now
      )
      recordPunchRound(resultsLog, myRoundResult(machine, snapshot, now), now)
      recordMySupport(machine, snapshot, now)
      updateHouseBotTurn(machine, snapshot, now)
      if (isMyTurn && (snapshot.phase === 'ready' || snapshot.phase === 'charging')) {
        armBagPointer(machine)
      } else {
        disarmBagPointer(machine)
      }
      // The floor mark is lit for exactly the turn the bag pointer is armed for,
      // minus a phantom turn dealt to somebody who has opted out.
      updateStrikeMarker(
        machine,
        now,
        isMyTurn &&
          (snapshot.phase === 'ready' || snapshot.phase === 'charging') &&
          !(machine.missedTurn && !machine.queueOptIn)
      )
      holdReadyStance(
        now,
        (isMyTurn && (snapshot.phase === 'charging' || machine.localCharging) && !machine.localReleased)
          || playerAtStrikeSpot(machine),
        machine.celebrationUntil
      )
      const nearby =
        playerNearMachine(machine) ||
        playerInZone(machine.config.audienceZoneId) ||
        inQueue ||
        snapshot.active?.userId === machine.localUserId
      updateAttractShow(
        machine,
        now,
        inQueue || Boolean(snapshot.active) || snapshot.queue.length > 0
      )
      updateLore(machine, now, nearby)
      updateSpectatorFocus(machine, now, dt * 1000)
      updateLooseBall(machine, now, dt)
      prewarmAudioFor(machine)
      flushPendingMachineSfx(machine, now)
      updateCrowd(
        machine,
        now,
        nearby,
        snapshot.phase === 'scoring' || snapshot.phase === 'cooldown' ? snapshot.serial : 0,
        snapshot.score
      )
      updateHud(machine, now)
      machine.lights.forEach((entity, index) => {
        const pulse = 0.78 + 0.22 * Math.sin(now * 0.006 + index * 0.8)
        Transform.getMutable(entity).scale = Vector3.create(0.11 * pulse, 0.11 * pulse, 0.08)
      })
      updateFallPrompt(machine)
      updatePunchCameraImpulse(machine, now)
    updateIslandSurfaces(machine, round, now)
      continue
    }

    if (machine.soloPhase === 'ready' || machine.soloPhase === 'charging') {
      armBagPointer(machine)
    } else {
      disarmBagPointer(machine)
    }
    // Solo is always 'ready', so the mark would burn all day; it lights when
    // somebody is actually close enough to be walking up to the bag.
    updateStrikeMarker(
      machine,
      now,
      (machine.soloPhase === 'ready' || machine.soloPhase === 'charging') && playerNearMachine(machine, 8)
    )
    updateSecretInputs(machine, now, machine.soloPhase === 'charging')
    updateAttractShow(machine, now, machine.soloPhase !== 'ready' || playerNearMachine(machine))
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_UP)) releaseSolo(machine)
    // Standing in the fighting zone IS the condition — the stance is the
    // default pose there and nowhere else.
    holdReadyStance(now, machine.soloPhase === 'charging' || playerAtStrikeSpot(machine), machine.celebrationUntil)
    updateSolo(machine, dt)
    // Solo has no crowd to meditate with; this clears the panel rather than
    // leaving a stale one on screen after a mode change.
    updateSpectatorFocus(machine, now, dt * 1000)
    updateLooseBall(machine, now, dt)
    prewarmAudioFor(machine)
    flushPendingMachineSfx(machine, now)
    updateHud(machine, now)
    updateFallPrompt(machine)
    updatePunchCameraImpulse(machine, now)
    updateIslandSurfaces(machine, round, now)
  }

  if (machines.length === 0 && islandHost) updateFallPromptFromHost(islandHost)

  for (let i = bursts.length - 1; i >= 0; i -= 1) {
    if (now < bursts[i]!.expiresAt) continue
    engine.removeEntityWithChildren(bursts[i]!.entity)
    bursts.splice(i, 1)
  }
}

/**
 * THE ISLAND'S OWN SURFACES — the arc's weather, the balloons and the board.
 *
 * Last in the frame, so all three read state this frame has already settled
 * rather than a mix of this one's and last one's.
 *
 * Called from BOTH modes' tails. It used to live only in the solo one, behind
 * the competition branch's `continue` — so on a real competition island the arc
 * never advanced a mood, never took the challenger's face and never breathed
 * with the crowd. The one place the feature was built for was the one place it
 * had never run.
 */
/** Whether Focus's world surfaces are currently on screen, so they can be taken down once. */
let focusWorldDrawn = false
function updateIslandSurfaces(
  machine: PunchMachineRuntime,
  round: PunchCompetitionSnapshot | undefined,
  now: number
): void {
  /* ‼️THE WORLD SIDE OF THE FOCUS SWITCH — the balloons over heads and the
     pulses that fly at the machine. `hud.focusCircle` is already empty whenever
     the mechanic is off (updateSpectatorFocus returns before filling it), so
     these calls would draw nothing regardless; they are gated anyway because
     both allocate and both walk the roster every frame, and a retired mechanic
     should cost zero, not "nearly zero". `clear*` runs on the transition so
     switching the director's box mid-round takes the balloons down with it. */
  if (activeProfile(machine).focusEnabled) {
    updateFocusBubbles(hud.focusCircle, now)
    // WHERE THE ENERGY IS AIMED. Refreshed every frame off the live cabinet
    // rather than captured once: the machine sits on a rocking root and a target
    // frozen at boot would point the crowd's pulses at where it used to be.
    setFocusWaveTarget(getWorldPosition(engine, machine.root))
    updateFocusWaves(hud.focusCircle, now)
    focusWorldDrawn = true
  } else if (focusWorldDrawn) {
    focusWorldDrawn = false
    clearFocusBubbles()
    clearFocusWaves()
  }
  // The puncher is looking at the bag. Helper +N / Swiss Mob nametag bars
  // sit in that hoop; spectators still see them on the bodies.
  updatePushBars(hud.isMyTurn && !hud.rescueLabel ? [] : (hud.rescuePushWorld ?? []), now)
  updateExtraPunchOverHead(now)
  const spotlightLabel = updateArenaScreen(
    arenaScreen,
    {
      config: machine.config,
      // What the cabinet is SAYING, as a level. See punchAudioLevel01.
      audio01: punchAudioLevel01(now),
      // The attract bot has no avatar to show — an island idling on its own
      // must fall through to the moods, not to a blank face.
      activeUserId:
        round?.active && round.active.userId !== PUNCH_HOUSE_BOT_ID
          ? round.active.userId
          : machine.network
            ? ''
            : hud.phase === 'waiting'
              ? ''
              : machine.localUserId,
      phase: hud.phase,
      power01: hud.power01,
      lastScore: hud.lastPunch,
      spotlight: punchArenaSpotlight(hud.leaderboard, hud.allTimeSaved ? hud.allTime : [], hud.lastPunch, now),
      // Clamped, because the two contracts disagree at the top end: the crowd
      // meter runs to PUNCH_FOCUS_CEILING (an overshooting crowd reads above
      // 1) while the arc wants a 0..1 and multiplies it into a tint, where a
      // component over 1 is not a brighter white, it is undefined.
      focus01: Math.min(1, hud.focusCrowd01),
      // ‼️THE RANKED LIST IS NOT THE ARC'S JOB, and this is where it stopped
      // being one. Three rows of 5.4-unit text spread over a HALF CYLINDER —
      // the letters ran round the curve, the ends of every line pointed away
      // from the crowd, and the middle of the list was the only part anyone
      // could read. The board is a flat HUD panel now, opened from a button
      // (`togglePunchScoreboard`), where a list can be a list. The arc keeps
      // what a curve is good at: a face, a colour and motion.
    },
    now
  )
  hud.arenaSpotlightLabel = spotlightLabel ?? ''
}

function cameraRig(parent: Entity, position: Vector3, focus: Entity, seconds: number): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { parent, position, rotation: Quaternion.Identity() })
  VirtualCamera.create(entity, {
    defaultTransition: { transitionMode: VirtualCamera.Transition.Time(seconds) },
    lookAtEntity: focus
  })
  return entity
}

function casinoLights(parent: Entity): Entity[] {
  const result: Entity[] = []
  const positions = [
    [-0.62, 2.33],
    [-0.42, 2.39],
    [-0.21, 2.43],
    [0, 2.45],
    [0.21, 2.43],
    [0.42, 2.39],
    [0.62, 2.33]
  ]
  positions.forEach(([x, y], index) => {
    const entity = engine.addEntity()
    Transform.create(entity, {
      parent,
      // On the modelled marquee shell (top edge ~y 2.49, face ~z -1.81). The old
      // arc used the 4 m primitive model's heights and floated above everything.
      position: onCabinet(x!, y!, -1.83),
      rotation: Quaternion.Identity(),
      scale: Vector3.create(0.11, 0.11, 0.08)
    })
    MeshRenderer.setSphere(entity)
    const color = index % 2 === 0 ? Color4.fromHexString('#FFD15A') : CYAN
    Material.setPbrMaterial(entity, {
      albedoColor: color,
      emissiveColor: Color3.create(color.r, color.g, color.b),
      emissiveIntensity: 3.2,
      roughness: 0.25,
      metallic: 0.05
    })
    result.push(entity)
  })
  return result
}

function spawnMachine(parent: Entity, id: string, config: PunchMachineAppConfig): void {
  if (config.skyIslandEnabled) spawnSkyIsland(parent, config)
  // ‼️THE RIG IS THE MACHINE'S, NOT THE ISLAND'S.
  //
  // It hung inside `spawnSkyIsland`, so a punch machine standing anywhere else
  // — a venue floor, a plaza, the Builder's own preview — got NO real light at
  // all and was lit by whatever the sky happened to be doing. Every complaint
  // about the cabinet reading flat and colourless applies at least as much
  // there, and the lamps are authored in machine-root metres, which is exactly
  // as true off the island as on it.
  spawnIslandLights(parent)
  lockPunchSky()
  if (config.cabinetEnabled === false) return
  // The cabinet ships as three authored parts. They carry no animation clips, so
  // the arm is hinged and swung in code rather than played back.
  // One scaled group so the parts keep their authored relationship to each other
  // and to the arm's hinge; scaling them individually would pull them apart.
  // THE RIG - one node between the island and the hardware so the machine can
  // move without the island moving and without a single collider moving. See
  // `updateCabinetRock`; (!) nothing a player stands on or walks into goes here.
  const rig = engine.addEntity()
  Transform.create(rig, {
    parent,
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })
  const cabinet = engine.addEntity()
  Transform.create(cabinet, {
    parent: rig,
    position: Vector3.create(0, 0, CABINET_Z),
    rotation: Quaternion.fromEulerDegrees(0, PUNCH_CABINET_FACE_DEG, 0),
    scale: Vector3.create(MACHINE_SCALE, MACHINE_SCALE, MACHINE_SCALE)
  })
  const model = engine.addEntity()
  Transform.create(model, { parent: cabinet, position: Vector3.Zero(), rotation: Quaternion.Identity(), scale: Vector3.One() })
  GltfContainer.create(model, {
    src: MACHINE_BODY,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })

  const display = engine.addEntity()
  Transform.create(display, { parent: cabinet, position: DISPLAY_POS, scale: Vector3.One() })
  GltfContainer.create(display, {
    src: MACHINE_DISPLAY,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })

  // Authored with its origin ON the hinge and the ball hanging below, so a
  // rotation about this entity is the swing — no offset pivot needed.
  const meter = createMeter(cabinet)
  const podLights = createPodLights(cabinet)
  // No free-floating glow pucks: they read as debris drifting round the island.
  const railGlow: Entity[] = []
  const starGlow = createStarGlow(cabinet)

  const arm = engine.addEntity()
  Transform.create(arm, { parent: cabinet, position: ARM_HINGE, rotation: Quaternion.Identity(), scale: Vector3.One() })
  GltfContainer.create(arm, {
    src: MACHINE_ARM,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })

  invisibleBox(parent, Vector3.create(0, 0.3, 0), Vector3.create(2.12, 0.6, 1.65))
  invisibleBox(parent, Vector3.create(0, 2.02, -0.72), Vector3.create(1.75, 2.7, 0.36))
  // Was 3.55 m deep centred at -0.3, so it reached 1.5 m out in FRONT of the
  // cabinet at chest height: the ledge players climbed and walked into. Pulled
  // back onto the machine's own footprint.
  invisibleBox(parent, Vector3.create(0, 3.42, -0.9), Vector3.create(2.14, 1.08, 2.2))
  // THE BACK OF THE CABINET, which had no collider at all. The three boxes above
  // stop at z -0.90 below the marquee, but machine-body.glb reaches back to
  // z -2.19 — so the front was solid and the rear third was open air, and anyone
  // walking round the machine walked straight into it up to the spine slab.
  // Sized to the modelled body (x -0.81..0.81, z -2.03..0.041 at cabinet scale)
  // and stopped at the slab's own rear face so the two meet with no seam.
  invisibleBox(parent, Vector3.create(0, 1.69, -1.515), Vector3.create(2.12, 3.38, 1.29))
  // ONE call to action: pointerEventsSystem's own hover text is the whole
  // prompt now — this manual pair put a second, duplicate tooltip on screen.
  const hitbox = pointerBox(parent, Vector3.create(0, 2.08, 0.18), Vector3.create(0.96, 1.28, 0.94))

  // The text is bolted to the marquee glass, so it rides the rig with it - left
  // on the root it slid off the panel the moment the cabinet tipped. It keeps
  // its own 180 degree turn and does NOT inherit the cabinet's, so it still
  // reads the right way round.
  const scoreText = textDisplay(rig, onCabinet(0, SCREEN_TOP.y, SCREEN_TOP.z), '000', CYAN, 3.2, 1.12, 0.32)
  const statusText = textDisplay(
    rig,
    onCabinet(0, SCREEN_BOTTOM.y, SCREEN_BOTTOM.z),
    'HOLD THE BAG',
    WARM_WHITE,
    0.6,
    1.05,
    0.12
  )
  // Hidden leftover: parked at y=-5 this still rendered as cyan world-space
  // text, visible from the air beside the island (Neon Glider, 2026-09-10).
  const queueText = textDisplay(rig, onCabinet(0, -5, SCREEN_QUEUE.z), '', CYAN, 0.42, 1.05, 0.1)
  VisibilityComponent.create(queueText, { visible: false })
  Transform.getMutable(queueText).scale = HIDDEN_SCALE
  const cameraFocus = engine.addEntity()
  Transform.create(cameraFocus, {
    parent,
    // The bag itself, not a guessed height near it.
    position: Vector3.create(0, BAG_REST_Y, PUNCH_BAG_Z),
    scale: Vector3.create(0.01, 0.01, 0.01)
  })
  // Eye height, BELOW the bag: you square up to a punch machine and look UP at
  // the thing you are about to hit. The old rig sat above the bag and aimed
  // down, so the shot framed the base plinth with the bag clipped off the top.
  const firstPersonCamera = cameraRig(parent, Vector3.create(0, 1.62, 2.3), cameraFocus, 0.15)
  const revealCamera = cameraRig(parent, Vector3.create(4.8, 3.2, 5.7), cameraFocus, 0.48)
  // EIGHT, not three. A big punch layers impact, cabinet body, sting, crowd
  // roar and rattle in one frame, and three round-robin slots meant the fourth
  // clip silenced the first. Cheap: an AudioSource that is not playing costs
  // nothing.
  const audio = [0, 1, 2, 3, 4, 5, 6, 7].map(() => {
    const entity = engine.addEntity()
    Transform.create(entity, { parent, position: Vector3.create(0, 1.5, 0.25) })
    return entity
  })
  // The punch's own speaker. Parented at the BAG, not the cabinet centre, so the
  // hit sounds like it came from where the fist arrived.
  const impactAudio = engine.addEntity()
  Transform.create(impactAudio, { parent, position: Vector3.create(0, 1.45, PUNCH_BAG_Z) })
  const player = getPlayer()
  const localUserId = (player?.userId ?? '').trim().toLowerCase()
  const competitionReady =
    config.mode === 'competition' && Boolean(config.queueZoneId && config.strikeZoneId && localUserId)
  const runtime: PunchMachineRuntime = {
    id,
    root: parent,
    model,
    hitbox,
    scoreText,
    statusText,
    queueText,
    indicator: createIndicator(rig),
    lights: casinoLights(rig),
    firstPersonCamera,
    revealCamera,
    cameraFocus,
    glovePunchStartedAt: 0,
    armPivot: arm,
    armSwingAt: 0,
    armReturnMs: 0,
    slamAt: 0,
    slamPhaseAt: 0,
    slamIntensity: 0,
    slamScore: 0,
    slamName: '',
    slots: [],
    watcherCount: 0,
    lastHumanCount: -1,
    seenAllowed: PUNCH_ROUND_ATTEMPTS,
    seenStreakSerial: -1,
    stepAsideSince: 0,
    strikeSeatUntil: 0,
    strikeSeatAt: 0,
    reloadUntil: 0,
    shakeUntil: 0,
    shakeMag: 0,
    rootBase: Vector3.clone(Transform.get(parent).position),
    rig,
    rockAt: 0,
    rockPitchDeg: 0,
    rockRollDeg: 0,
    rockMs: 0,
    rockHangMs: 0,
    meter,
    podLights,
    streak900: 0,
    showSwingCard: '',
    overloadUntil: 0,
    lurchUntil: 0,
    railGlow,
    starGlow,
    starBlinkAt: Date.now() + 12_000,
    lightFlashUntil: 0,
    bestToday: 0,
    bestTodayName: '',
    attemptInRound: 0,
    roundBest: 0,
    roundAttemptsAllowed: PUNCH_ROUND_ATTEMPTS,
    roundTotal: 0,
    roundStreak: 0,
    roundStreakBonus: 0,
    audio,
    audioCursor: 0,
    impactAudio,
    authoredProfile: normalizePunchProfile(config.gameProfile),
    config,
    // Assigned below, not here: the house-bot callback has to close over the
    // runtime it is about to be attached to.
    network: null,
    localUserId,
    // ‼️THE RETRY WINDOW OPENS ONLY WHEN THE ID IS MISSING. A machine that
    // already knows who is standing at it never asks again, and a machine that
    // is not a competition never asks at all -- see `adoptIdentity`.
    identityNextAt: 0,
    identityUntil: localUserId ? 0 : Date.now() + IDENTITY_WINDOW_MS,
    knockStep: 0,
    knockTapAt: 0,
    knockArmedUntil: 0,
    key1Held: false,
    key3Held: false,
    twistFDownAt: 0,
    focusLevel01: 0,
    focusLastTapAt: 0,
    focusKarmaMs: 0,
    focusKarmaSerial: -1,
    focusDriftMs: 0,
    focusDriftSeenMs: -1,
    focusSentAt: 0,
    focusEmoteAt: 0,
    rescueMine: 0,
    rescueMineAt: 0,
    rescueReviewKey: 0,
    rescueEmoteAt: 0,
    rescueCheerAt: 0,
    rescueHypeAt: 0,
    rescuePoseKey: 0,
    houseBotIndex: -1,
    focusBotIndices: [],
    focusBotEmoteAt: 0,
    houseBotStagedIndex: -1,
    houseBotStagedAt: 0,
    bagArmed: false,
    housePunchedSerial: -1,
    botStanceIndex: -1,
    botStanceAt: 0,
    showBotIndex: -1,
    showBotName: '',
    showPhase: 'idle',
    showPhaseAt: Date.now() + 20_000,
    showResultAt: 0,
    showScore: 0,
    localHeldMs: 0,
    localChargeStartedAt: 0,
    localCharging: false,
    localReleased: false,
    localAccuracy01: 0.85,
    ownsInput: false,
    cameraMode: 'none',
    wasInQueue: false,
    queueOptIn: false,
    awaySince: 0,
    missedTurn: false,
    missedTurnAt: 0,
    swungThisTurn: false,
    wasMyTurn: false,
    turnTickSecond: -1,
    queueIntent: 'auto',
    queueSyncAt: 0,
    joinAskedAt: 0,
    networkSince: 0,
    crowdGathered: false,
    crowdWhisperAt: 0,
    lastAwarded: null,
    cardAttempt: null,
    cardSerial: -1,
    cardShownAt: 0,
    strikeRing: null,
    focusGreenMs: 0,
    focusLiveMs: 0,
    armBallPaint: 'own',
    looseBall: null,
    revealAt: 0,
    revealScore: 0,
    crowdWhisperIndex: 0,
    crowdBotCount: 0,
    crowdReactionSerial: 0,
    lastRevision: -1,
    lastPresentedPhase: '',
    soloPhase: 'ready',
    soloHeldMs: 0,
    soloChargeStartedAt: 0,
    soloElapsedMs: 0,
    soloTargetScore: 0,
    soloAttempt: null,
    soloShownScore: 0,
    soloSerial: 0
  }
  if (competitionReady) {
    runtime.network = startPunchCompetitionNetwork({
      machineId: id,
      userId: localUserId,
      name: player?.name ?? 'Player',
      config,
      houseBot: () => claimHouseBot(runtime),
      focusBots: () => claimFocusBots(runtime),
      isSceneHost: punchSceneHost,
    authority: punchAuthority().authority,
    serverId: punchAuthority().serverId,
    bus: punchAuthority().bus
    })
    runtime.networkSince = Date.now()
    if (localUserId) punchHttpBindUser(localUserId, runtime.network.sessionId())
  }
  machines.push(runtime)
  paintMeter(runtime, 0)
}

/**
 * THE ISLAND IS SMALL, SO THE CAST IS SMALL.
 *
 * A saved competition shipped with ten NPCs. Five stood on the watcher arc and
 * the surplus was parked "offstage" behind the cabinet — which on a 5.6 m deck
 * is three metres away and fully in frame. Ten avatars shoulder to shoulder is a
 * mob on a monitor and unreadable on a phone, and the arc puts one of them
 * directly behind whoever is at the bag.
 *
 * Clamped HERE rather than only in the recipe because plugins start before
 * `initDanceVenue`/`initVenueNpcs` (see scene/src/social/index.ts) and the
 * troupe spawns from `config.npc.count`. Clamping the live config means an
 * island already published with ten obeys the ceiling on its next load, with no
 * re-publish and no edit to anyone's saved scene beyond the number of extras.
 */
/**
 * The BACKSTOP, not the fix.
 *
 * This plugin is `loadClass: "deferred"`, so the kernel starts it several
 * seconds after `initDanceVenue` has already dealt the troupe out — which is
 * exactly why an island with a saved `npc.count: 10` kept standing ten bots
 * deep while this function was the only clamp there was. The clamp that counts
 * now runs at config load in `scene/src/social/index.ts`. This one stays for the
 * case that one cannot see: a config swapped in after boot.
 */
function clampIslandCrowd(ctx: ScenePluginContext): void {
  const dance = ctx.social.dance
  if (!dance?.npc?.enabled) return
  clampPunchIslandCrowd(dance)
}

export function startPunchMachinePlugin(ctx: ScenePluginContext): void {
  setScrapKoDeck(null)
  // Scrap asks here before it hassles, matches or lets a fight run on: not
  // while you hold the bag, and never while you are falling off the island.
  prewarmAudioOnce()
  // MOMENTUM comes from the boxing interaction: beat a regular while queued with
  // full Focus and the coordinator marks you ready. Scrap reports through the
  // guard module so neither plugin imports the other.
  //
  // ‼️THE LISTENER IS ALWAYS REGISTERED AND THE GATE IS INSIDE IT. Registration
  // happens once at plugin start, before any profile is loaded and long before
  // a director can change one — reading `focusEnabled` out here would pin the
  // answer to whatever the scene booted with and make the toggle a restart.
  setScrapBoutListener((outcome) => {
    if (outcome !== 'player_win') return
    const machine = machineForPlayer()
    if (!machine || !activeProfile(machine).focusEnabled) return
    machine.network?.prepMomentum()
  })
  setScrapGuestGuard({
    busy: () => {
      /**
       * ‼️OFF THE ISLAND, NOT MERELY FALLING — and this is the whole of the
       * "boxing game activated on the ground" report.
       *
       * Owner, 2026-09-09: *"after jumping off the island, landing on the
       * ground, and minimizing the beam-back message, the boxing game
       * unexpectedly activated. The player entered a fighting position and
       * pointed upward toward the distant island."*
       *
       * This read `fallAirborne`, which `updateGrounded` clears 600 ms after
       * the player stops moving vertically — i.e. the instant they LAND. So the
       * guard covered the drop and let go at the bottom, which is precisely
       * where the fault is: the Scrap director is measured in x/z only
       * (`ScrapGuest` carries no y, and every gap in shared/scrap-session.ts is
       * a `Math.hypot(dx, dz)`), so a guest standing on the ground DIRECTLY
       * UNDER the sky island reads as zero metres from every regular on it.
       * They approach, the ring opens, and the stance aims at somebody a
       * hundred metres overhead — the "pointing upward".
       *
       * `fallPrompt` is the honest question: it is true from the moment the
       * player is below the deck until they are actually back on it, and
       * minimising the panel only sets `fallMinimized`, so dismissing the
       * message cannot dismiss the guard. Fixing it here rather than in Scrap
       * keeps the one door this file already owns (see scrap-guard.ts) instead
       * of threading a height through a module that has never had one.
       */
      if (hud.fallPrompt) return true
      const busyPhase = hud.phase === 'ready' || hud.phase === 'charging' || hud.phase === 'scoring'
      const mine = machineForPlayer()
      return !!mine && hud.isMyTurn && busyPhase && !(mine.missedTurn && !mine.queueOptIn)
    },
    // Still the FALL, not the prompt: it lets a live bout go of somebody who is
    // dropping. Standing on the deck must not count — `resetFallLanding` sets
    // `fallAirborne` true every frame you are up top, which is how Cloud Scrap
    // told every guest they were holding a bag that is not there.
    leaving: () => hud.fallPrompt && hud.fallAirborne
  })
  // ‼️THE ISLAND IS MADE TO FIT THE SCENE IT WAS PUBLISHED INTO. A saved deck
  // height that the plot cannot carry is corrected here, once, before anything
  // reads it — see `fitIslandToScene`.
  const config = fitIslandToScene(
    normalizePunchMachineAppConfig(ctx.social.apps.punchMachine),
    ctx.config.scene?.cols ?? 0,
    ctx.config.scene?.rows ?? 0
  )
  // The balloons are keyed by wallet in a module map that outlives a plugin
  // restart, so a reload without a fresh engine would strand one over every
  // head that was meditating when the last scene went away.
  releasePunchCrowd()
  // The scene's own roof, before any cloud is spawned. `scene.cols/rows` is the
  // same source the skybox reads for its shell, and a scene that declares
  // neither leaves the ceiling at Infinity — the fan then behaves exactly as it
  // did before this existed, rather than refusing to blow at all.
  const cols = ctx.config.scene?.cols
  const rows = ctx.config.scene?.rows
  flightCeilingY = cols && rows ? punchFlightCeilingY(cols * rows) : Infinity
  for (const handle of ctx.handles) {
    if (handle.spec.behavior !== 'punch_machine') continue
    // The entity spec is the island's own word. Social config can drift back
    // to the championship default (`cabinetEnabled` absent means on), which is
    // how Cloud Scrap grew a bag in the middle of a hassle scene.
    spawnMachine(handle.entity, handle.spec.id, {
      ...config,
      cabinetEnabled: config.cabinetEnabled !== false && handle.spec.spec.cabinet !== false
    })
  }
  // Only a sky island has this problem: it is one small deck with nowhere for a
  // surplus crowd to be. A machine standing in a room keeps whatever cast that
  // room was authored with.
  if (machines.length > 0 && config.skyIslandEnabled && config.cabinetEnabled) clampIslandCrowd(ctx)
  const islandLive = machines.length > 0 || islandHost !== null || jumpClouds.length > 0
  if (islandLive && !systemAdded) {
    systemAdded = true
    // Trim the phone's on-screen button cluster to what this scene reads. Must
    // follow the machine check: a scene with no machine is not the punch island
    // and has no business editing the client's controls.
    if (machines.length > 0) applyPunchIslandTouchControls()
    engine.addSystem(punchMachineSystem)
  }
}

function updatePunchCameraImpulse(machine: PunchMachineRuntime, now: number): void {
  if (!machine.cameraKickAt) return
  const elapsed = now - machine.cameraKickAt
  const gain = machine.cameraKickGain ?? 0
  if (machine.cameraMode === 'none') {
    const base = punchCameraBases.get(machine.firstPersonCamera)
    const tf = Transform.getMutableOrNull(machine.firstPersonCamera)
    if (base && tf) tf.position = Vector3.clone(base)
    punchCameraBases.delete(machine.firstPersonCamera)
    // A spectator never receives a virtual shake camera. Their impact comes
    // from world-space reactions, while this camera channel belongs exclusively
    // to the active player's authored punch shot.
    machine.cameraKickAt = 0
    return
  }
  const camera = Transform.getMutableOrNull(machine.firstPersonCamera)
  if (!camera) return
  // The first-person camera's authored transform is captured once per impulse.
  if (!punchCameraBases.has(machine.firstPersonCamera)) punchCameraBases.set(machine.firstPersonCamera, Vector3.clone(camera.position))
  const base = punchCameraBases.get(machine.firstPersonCamera)!
  const envelope = Math.max(0, 1 - elapsed / 420)
  camera.position = Vector3.create(base.x + Math.sin(elapsed * .071) * .055 * gain * envelope, base.y + Math.sin(elapsed * .093) * .025 * gain * envelope, base.z)
  if (elapsed >= 420) { camera.position = Vector3.clone(base); punchCameraBases.delete(machine.firstPersonCamera); machine.cameraKickAt = 0 }
}
const punchCameraBases = new Map<Entity, Vector3>()
