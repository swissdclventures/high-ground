import { normalizePunchProfile, punchProfile, PUNCH_PROFILE_IDS, punchRoundAward, punchGoldenArmed, punchBoostLive, punchKarmaLive, punchProfileBoardKey, punchRescueOpportunity, punchIsAdmin, type PunchProfileId, type PunchRescueSkill } from '@shared/punch-game-profile'
import { punchScorePhaseMs } from '@shared/punch-machine-contract'
import { PUNCH_PUSH_MAX_PER_ROUND, PUNCH_PUSH_REVIEW_MS, PUNCH_PUSH_THRESHOLD, punchPushSettle } from '@shared/punch-push'
import { PUNCH_AUTHORITY_DEFAULT, PUNCH_ROOM_DEAD_MS, PUNCH_SERVER_ADOPT_MS, PUNCH_SERVER_SILENCE_MS, type PunchAuthorityMode } from '@shared/punch-authority'
import {
  punchChallengeAward,
  punchRescueClaim,
  punchRescueClosest01
} from '@shared/punch-challenge'
import { MessageBus } from '@dcl/sdk/message-bus'
import { punchSaveShares, punchSaveSplit, punchSaveUnlockedDelta } from '@shared/punch-results-store'
import {
  PUNCH_FOCUS_IDLE_MS,
  PUNCH_FOCUS_SMOOTHING_PER_S,
  PUNCH_HOUSE_BOT_ID,
  punchReloadMs,
  PUNCH_ROUND_ATTEMPTS,
  PUNCH_ROUND_SUMMARY_MS,
  punchFocusBandHalfWidth,
  punchFocusDecay,
  punchFocusDriftAdvance,
  punchFocusGustAt,
  punchFocusQuality01,
  punchFocusStreakMultiplier,
  punchFocusTap,
  punchFocusTargetAt,
  punchFocusBotAim01,
  PUNCH_FOCUS_BOT_IDS,
  PUNCH_FOCUS_TAP_COOLDOWN_MS,
  punchFocusZoneHalfWidth,
  punchBoostPoints,
  type PunchBoostContribution,
  punchFocusKarma01,
  punchKarmaRunMs,
  punchCircleScore,
  punchBoostKarmaMultiplier,
  punchKarmaEarned,
  punchKarmaBanked,
  punchCrowdAssist01,
  type PunchKarmaEntry,
  type PunchPrepEntry,
  PUNCH_PREP_FOCUS_MAX,
  PUNCH_PREP_GRACE_MS,
  PUNCH_ROUND_EXTEND_SCORE as PUNCH_STREAK_THRESHOLD,
  punchFocusEarned,
  punchFocusRescue,
  PUNCH_ROUND_ATTEMPTS_MAX,
  PUNCH_ROUND_EXTEND_SCORE,
  punchQueueHasRoom,
  punchRingHasRoom,
  punchRoundAttemptsAfter,
  punchStreakAfter,
  punchStreakBonus,
  punchStreakName,
  PUNCH_SCORE_PHASE_MS,
  punchScoreForAttempt,
  punchAttemptMarker01,
  rankPunchScores,
  type PunchAttemptBreakdown,
  type PunchLeaderboardEntry,
  type PunchMachineAppConfig
} from '@shared/punch-machine-contract'

export type PunchCompetitionPhase =
  | 'waiting'
  | 'ready'
  | 'charging'
  | 'scoring'
  | 'cooldown'
  /** The round is over and its total is on the board before the queue moves. */
  | 'summary'

export interface PunchParticipant {
  profileId?: PunchProfileId
  userId: string
  name: string
  joinedAt: number
}

/**
 * What one Boosting spectator is worth right now, as the coordinator sees it.
 * Broadcast with the rest of the snapshot so every client draws the same crowd
 * meter — a spectator's own bar is predicted locally, but the number that pays
 * out is this one.
 *
 * ‼️ONE CIRCLE. There is no opposing side any more; see the dormant
 * `PunchFocusSide` in the contract for what used to be here and why it went.
 */
export interface PunchFocusMember {
  userId: string
  name: string
  /** Their own meter, 0..PUNCH_FOCUS_CEILING. */
  level01: number
  /** What that level is worth where they are standing, 0..1. */
  quality01: number
  /** What they would hand over if the punch landed now, in score points. */
  points: number
  /** 1 for an ordinary Boost. The hook for future extraordinary ones. */
  multiplier: number
  /**
   * THE RING, PER PERSON. How deep inside `PUNCH_FOCUS_KARMA_BAND_01` this one
   * is right now (0..1), and the unbroken time they have kept it there this
   * attempt. `multiplier` is derived from `karmaMs` — these two are what make
   * it move, and they travel so the HUD can show a booster their own ring
   * rather than only the number it produced.
   */
  karma01: number
  karmaMs: number
  /** A decorative body rather than a person — see PUNCH_BOOST_NPC_SHARE. */
  npc: boolean
  /** THE CIRCLE: this person's own 0..999 for the wind-up so far. */
  circleScore: number
}

export interface PunchFocusState {
  /** Humans currently holding the rhythm, excluding whoever is punching. */
  meditators: number
  /** Smoothed crowd mean, 0..PUNCH_FOCUS_CEILING. */
  level01: number
  /** Half-width of the healthy GREEN band at this headcount. */
  band01: number
  /** Half-width of the outer YELLOW ring — green plus its fixed margin. */
  zone01: number
  /** How well they are holding it, 0..1. */
  quality01: number
  /**
   * WHERE THE DRIFTING STILL POINT IS, and where it is in its cycle.
   *
   * `target01` is what the coordinator actually paid against on this tick;
   * `driftMs` is the phase that produced it. Both travel, and the pair is the
   * point: a client draws the band from the phase it advances itself between
   * heartbeats — which is smooth — and the value is what lets it check that its
   * own advance has not slipped. Sending only the value would give a band that
   * jumps 800 ms at a time; sending only the phase would give a client no way
   * to notice it had drifted out of step.
   */
  target01: number
  driftMs: number
  /**
   * How hard the bleed is pulling this tick, from the same phase. Broadcast so
   * the HUD can SAY the weather: an invisible force that empties your meter is
   * a bug report, and the same force drawn on the track is a mechanic.
   */
  gust: number
  /**
   * Unbroken time this circle has spent inside its ring, and what that is
   * currently multiplying their share by. Broadcast rather than derived so the
   * HUD can show a streak the coordinator actually credited.
   */
  streakMs: number
  streak: number
  /**
   * ‼️THE NUMBER THE PUNCH IS SCORED WITH, in points, live.
   *
   * What the crowd would hand over if the fist landed this instant. It is the
   * sum of `circle`, not a separate aggregate, so the total on the HUD and the
   * lines on the result card can never tell different stories.
   */
  boostPoints: number
  /** The human half of it — what the High Ground threshold is tested against. */
  humanBoostPoints: number
  /**
   * ‼️THE CROWD'S HAND ON THE AIM, LIVE — how much wider the puncher's gold band
   * is right now because of the ring-holders in the room, 0..1.
   *
   * This is a PREDICTION and is allowed to be a frame behind: the band the punch
   * is actually scored against is recomputed at contact from the committed
   * ledger (see `punchCrowdAssist01` in the contract). It travels so the puncher
   * can watch their own window swell while the crowd works, which is the only
   * way "the crowd influenced my aim" is a thing anybody can feel.
   */
  assist01: number
  /** People, excluding the decorative regulars. The headcount that matters. */
  humans: number
  /**
   * WHO IS MEDITATING, by name.
   *
   * A headcount answered "how many" and nothing else, so a deck of people
   * doing the same silent emote was unreadable: nobody could tell who was in
   * the circle, or that the circle was a thing you could join. The roster is
   * what the bubbles over their heads and the board on the arc are drawn from.
   * Capped, because this rides the state heartbeat: past a dozen names the list
   * stops being readable long before it stops being cheap.
   */
  circle: PunchFocusMember[]
}

/** Enough for a full deck to see itself; a crowd beyond it reads as a count. */
export const PUNCH_FOCUS_CIRCLE_MAX = 8

export function emptyPunchFocusState(): PunchFocusState {
  return {
    meditators: 0,
    level01: 0,
    band01: punchFocusBandHalfWidth(0),
    zone01: punchFocusZoneHalfWidth(0),
    quality01: 0,
    target01: punchFocusTargetAt(0),
    driftMs: 0,
    gust: punchFocusGustAt(0),
    streakMs: 0,
    streak: 1,
    boostPoints: 0,
    humanBoostPoints: 0,
    assist01: 0,
    humans: 0,
    circle: []
  }
}

export interface PunchCompetitionSnapshot {
  attemptReadyAt?: number
  roundMomentum?: number
  supporters?: NonNullable<PunchLeaderboardEntry['supporters']>
  supportScores?: NonNullable<PunchLeaderboardEntry['supporters']>
  /**
   * ‼️THE SAVE'S SECOND SCORE. Once a last-chance lands, every point the
   * puncher then scores is unlocked play — ten more punches is a different
   * number than dying on the next swing.
   */
  saveLegacy?: {
    roundTotalAt: number
    credited: number
    rescuedName: string
    rescuedUserId?: string
    shares: Array<{ userId: string; name: string; share01: number }>
  }
  rescue?: {
    announcedAt: number
    startsAt: number
    endsAt: number
    streak: number
    momentum: number
    tapsRequired: number
    tried: string[]
    rescuedName: string
    /** Wallet of the puncher this window is for — the result card needs both faces. */
    rescuedUserId?: string
    winner?: string
    winnerName?: string
    completedAt?: number
    /** Which game the room is playing for this save. See `PUNCH_RESCUE_SKILLS`. */
    skill: PunchRescueSkill
    /** Net band taps that save it, and the half-width of the gold band. */
    bandTapsRequired: number
    band01: number
    /**
     * ‼️THE LAST CHANCE, SAID ON THE WIRE, because the panel has to be able to
     * tell the two apart. A save on a player who still has punches left is a
     * favour; a save on a player with none is the difference between one more
     * swing and going home, and the room should be told which one it is.
     */
    lastChance: boolean
    /**
     * The best anybody reached, 0…1, and who reached it — for the near-miss
     * tell. Written on every attempt, winning or not, so a window that nobody
     * wins can still say how close the room came.
     */
    best01?: number
    /** The wallet, kept beside the name because `creditSupport` pays an id, not a label. */
    bestUserId?: string
    bestName?: string
    bestDetail?: string
    /** `closest-shot` is decided at the END of the window, not on arrival. */
    settled?: boolean
    /**
     * THE PUSH. The gap the room is fighting over -- `pushFrom` is the punch as
     * it scored, `pushTo` the threshold it fell short of -- and where the room
     * has dragged it to so far. See `shared/punch-push.ts`.
     *
     * NOTE: NO DRIFT PHASE TRAVELS. The band is derived from `now - startsAt`, a
     * duration every client computes off a number already on this snapshot, so
     * two explorers agree on where the green is without trusting either clock.
     */
    pushFrom?: number
    pushTo?: number
    pushScore?: number
    /**
     * Who said yes during the ask. Its LENGTH is the difficulty: it feeds
     * `punchFocusBandHalfWidth`, so the sweet spot widens with the room and
     * nothing anywhere checks a player count.
     */
    pushAccepted?: string[]
    /** Credit per pusher, live, biggest first -- the cabinet names them while it happens. */
    pushers?: Array<{ userId: string; name: string; gain: number; pulses: number; quality01?: number }>
  }
  lastRescueSerial?: number
  /** Saves this round has already spent. Capped by `rescueMaxPerRound`. */
  roundRescues?: number
  /**
   * ‼️AN ADMIN HAS ARMED THE NEXT FUMBLE. The Rescue needs five conditions to
   * line up at once and an admin cannot arrange any of them, so this is the one
   * way the observer half of the game can be reached on purpose. Set by an
   * allowlisted wallet, cleared the moment a window opens on it.
   *
   * It rides the SNAPSHOT rather than living in a coordinator local so that the
   * chip can say ARMED on the admin's own screen — an arm nobody can see is
   * pressed twice — and so the arm survives the coordinator changing hands mid
   * test, which is exactly what happens when the person testing walks away.
   */
  forceRescueNext?: boolean
  challengeAward?: ReturnType<typeof punchChallengeAward>
  profileId?: PunchProfileId
  streakMultiplier?: number
  streakSaved?: boolean
  streakSaves?: Array<{ userId: string; points: number; available: boolean }>
  scorePhaseStartedAt?: number
  scorePhaseDurationMs?: number
  machineId: string
  coordinatorId: string
  revision: number
  phase: PunchCompetitionPhase
  active: PunchParticipant | null
  queue: PunchParticipant[]
  /**
   * THE RING — everybody who entered beyond the four seats, in arrival order.
   * Optional on the wire: a coordinator still running a pre-ring build sends
   * none at all, and every reader of it iterates.
   */
  ring?: PunchParticipant[]
  /**
   * Mean length of the last few COMPLETED human rounds, so the ring can print a
   * time instead of only a place. 0 until enough has finished to mean anything.
   */
  roundPaceMs?: number
  profileBoards?: Record<string, PunchLeaderboardEntry[]>
  leaderboard: PunchLeaderboardEntry[]
  chargeStartedAt: number
  phaseEndsAt: number
  score: number
  attempt: PunchAttemptBreakdown | null
  chargeAccuracy01: number
  serial: number
  /**
   * ‼️THE MOST PUNCHES THIS ROUND MAY REACH -- the runaway guard, and only that.
   *
   * The queue has no claim on the bag: a round ends when the player finally
   * misses, and what is limited instead is how many people may hold or wait for
   * it (`PUNCH_MAX_PLAYERS`). Still broadcast rather than derived per client,
   * so the HUD's 'LAST PUNCH' is the coordinator's number and not each
   * spectator's guess at it.
   */
  attemptsCeiling: number
  /** Punches taken in the active player's round. */
  attemptsUsed: number
  /** Punches granted — starts at three, grows when a big one lands. */
  attemptsAllowed: number
  /** The round's running total, which is what actually scores. */
  roundTotal: number
  /**
   * ‼️CONSECUTIVE 900s IN THIS ROUND, AND THE COORDINATOR OWNS IT.
   *
   * It has to live on the shared state rather than on each client, because the
   * bonus is part of `roundTotal` and `roundTotal` is what the board ranks: two
   * clients counting their own streaks would rank the same round differently
   * and the leaderboard would flicker between them. Cleared with the rest of
   * the round in `advance`, never on phase — see the boost ledger's note for
   * why gating a clear behind a phase let one punch pay for the next.
   */
  roundStreak: number
  /** What the ladder has paid this round, so the surfaces can name it. */
  roundStreakBonus: number
  /** This round's story for the card: best single punch, punches over 900, longest run. */
  roundBestPunch: number
  roundStrong: number
  roundLongestStreak: number
  /** The rung the LAST punch reached, and its payout. 0 when it broke one. */
  streakBonus: number
  streakName: string
  /** Stamps the round so its board row can be replaced as the total grows. */
  roundStartedAt: number
  /** The audience's contribution, live. Read at the instant a punch lands. */
  focus: PunchFocusState
  /**
   * ‼️THE KARMA BANK, AND IT LIVES ON THE SNAPSHOT ON PURPOSE.
   *
   * It is the one number in this game that outlives a turn: earned holding the
   * ring for somebody else, spent on your own punch several turns later. Kept on
   * the replicated state rather than in the coordinator's closure so that when
   * the coordinator leaves and another client takes over — which happens every
   * time somebody walks off the island — the room's banked karma is inherited
   * with the rest of the state instead of being quietly zeroed under everyone.
   *
   * ‼️IT IS NOT CLEARED BY `advance`. Rounds end; karma does not. The only
   * things that reduce a bank are punching with it and leaving the parcel.
   */
  karma: PunchKarmaEntry[]
  /** PREPARATION per player — Focus and Momentum for their own next turn. */
  prep: PunchPrepEntry[]
}

type HelloMessage = {
  machineId: string
  userId: string
  name: string
  sentAt: number
  startedAt: number
  /** This Explorer session. Same wallet on two devices must not look like one echo. */
  sessionId?: string
}
/**
 * `intent` separates WALKING UP from ASKING FOR THE BAG. The queue reconciles
 * itself every second from a local opt-in flag, and that flag is the same signal
 * a player who wandered off keeps sending — so it cannot be what buys a no-show
 * their place back. Only 'player', a deliberate press, does.
 */
type QueueMessage = HelloMessage & { action: 'join' | 'leave'; intent?: 'auto' | 'player'; profileId?: PunchProfileId }
type PunchMessage = HelloMessage & {
  stancePower?: number
  action: 'start' | 'release'
  heldMs?: number
  timingMarker01?: number
  accuracy01?: number
}
/**
 * One meditation beat. Only the TAP travels — the level itself is simulated,
 * identically, by the sender (for an instant meter) and by the coordinator (for
 * the number that pays). Sending levels instead would have put a continuous
 * float on the wire per spectator per frame; a tap is a few bytes a second.
 */
/**
 * `at` is the list of elapsed times the SENDER saw on the rescue marker when
 * they reached for it, and `taps` its length — kept for a client on an older
 * build, which sends only the count and must still be able to try. See
 * `punchRescueClaim` for why the reading is taken from the person rather than
 * from the wire.
 *
 * ‼️THE LIST IS THE POINT. A count is a number a client asserts and the
 * coordinator can only believe or refuse; a list of times is a claim it can
 * re-score with the same pure function the sender used and DISAGREE with. That
 * is the difference between "twelve taps arrived" — which hammering satisfied
 * in under a second — and "three of these landed inside a band that is open 29%
 * of the time", which hammering cannot satisfy at all.
 */
type RescueMessage = HelloMessage & { action: 'tap'; taps: number; at?: number[]; heldMs?: number }
/**
 * A Focus beat. Only the TAP travels — the level itself is simulated,
 * identically, by the sender (for an instant meter) and by the coordinator (for
 * the number that pays). Sending levels instead would have put a continuous
 * float on the wire per spectator per frame; a tap is a few bytes a second.
 *
 * ‼️`rescueMs` IS GONE FROM THIS MESSAGE. It used to carry a save claim, because
 * the save and the Focus beat once shared a key AND a packet. They no longer
 * share the packet: `RescueMessage` is the save's own wire and `handleRescue`
 * its own authority, so a Focus tap can never again be scored as a rescue claim
 * or vice versa. They still share the key — see `punchPrimaryPress`.
 */
type FocusMessage = HelloMessage & { action: 'tap' | 'stop' | 'momentum' }
/**
 * An admin control press. `arm` opens the next fumble as a Rescue whatever the
 * gates say; `disarm` takes it back.
 *
 * ‼️THE SENDER IS NOT TRUSTED. The coordinator re-checks the wallet against
 * the director's allowlist in `handleAdmin` — the chip on the sender's screen is
 * only what stops an admin pressing something they cannot use, never what makes
 * the press legal. A client on a doctored build can emit this event; it will be
 * dropped on the machine that owns the state.
 */
type AdminMessage = HelloMessage & { action: 'arm-rescue' | 'disarm-rescue' }
type StateMessage = {
  machineId: string
  coordinatorId: string
  sentAt: number
  startedAt: number
  sessionId?: string
  snapshot: PunchCompetitionSnapshot
}

export interface PunchCompetitionNetwork {
  snapshot(): PunchCompetitionSnapshot
  /** This Explorer session — HTTP skip-self is keyed on this, never the wallet alone. */
  sessionId(): string
  isCoordinator(): boolean
  /**
   * 'auto' is the standing opt-in reconciling itself — ignored while this player
   * is sitting out a missed turn. 'player' is a deliberate ask, and clears it.
   */
  joinQueue(intent?: 'auto' | 'player', profileId?: PunchProfileId): void
  leaveQueue(intent?: 'auto' | 'player'): void
  startCharge(accuracy01: number): void
  releasePunch(heldMs: number, timingMarker01: number, accuracy01: number, stancePower?: number): void
  /** Completed local rescue meter. The coordinator accepts the first valid finisher. */
  /** `at` carries the elapsed of every press, which is what the coordinator re-scores. */
  rescueTap(taps: number, at?: number[], heldMs?: number): void
  /**
   * Focus beats. Refused by the coordinator when `focusEnabled` is off, rather
   * than gated at the sender: a client on a stale profile must not be able to
   * bank a point the director has switched the mechanic off for.
   */
  focusTap(): void
  focusStop(): void
  prepMomentum(): void
  /**
   * Arm (or disarm) the next Fumble Rescue. Refused by the coordinator unless
   * the sender's wallet is on the director's `adminIds` list.
   */
  armRescue(on: boolean): void
  /** Is anybody hosting right now? Always true without a server. */
  serverAlive(now: number): boolean
  /**
   * WHO IS RUNNING THIS DEVICE'S GAME — and it must be SAID ON SCREEN.
   *
   * `'server'`: DCL's Multiplayer Server answered and hosts. `'orphan'`: this
   * device was built for a server, waited out `PUNCH_SERVER_ADOPT_MS`, heard
   * nothing, and is hosting its own game so the island is not a dead cabinet.
   * `'coordinator'`: built serverless.
   */
  authorityMode(): 'server' | 'orphan' | 'coordinator'
  /** Milliseconds left on the adopt window. Zero once this device hosts. */
  houseWaitLeftMs(now: number): number
  tick(now: number, room?: PunchRoomHint): void
  onChange(listener: (snapshot: PunchCompetitionSnapshot) => void): void
}

/** What the Explorer's room looks like this frame — see `punchRoomDiagnostics`. */
export interface PunchRoomHint {
  connected: boolean | null
  ready: boolean
  synced: boolean
  framesIn: number
}

/**
 * THE HOUSE BOT — one NPC that stands in the real queue.
 *
 * A competition with nobody else in it is not a competition: the queue never
 * rotates, the shot clock never hands the bag over, and there is no way to see
 * the multiplayer behaviour without a second headset. So the coordinator keeps
 * one synthetic participant in the queue at all times. It is a REAL entrant —
 * it takes turns through the same `scorePunch` path a human does, so its punch
 * drives the marquee, the slam, the crowd reaction and the leaderboard on every
 * client, and everyone in the world sees the same rotation.
 *
 * It is the coordinator's alone to drive: the id is fixed, so a second client
 * electing itself coordinator inherits the same bot rather than adding another.
 *
 * ‼️The id itself now lives in the CONTRACT, not here, and re-exporting it is
 * the point rather than a convenience. It used to be a private fact of this
 * module, so the arc had no way to ask "is that a person?" and answered with a
 * headcount instead — which is how a shipped leaderboard spent a week behind a
 * condition this module made permanently false.
 */
export { PUNCH_HOUSE_BOT_ID }

const HELLO_EVENT = 'punch.hello'
const QUEUE_EVENT = 'punch.queue'
const ACTION_EVENT = 'punch.action'
const RESCUE_EVENT = 'punch.rescue'
const FOCUS_EVENT = 'punch.focus'
const ADMIN_EVENT = 'punch.admin'
const STATE_EVENT = 'punch.state'
const PEER_TIMEOUT_MS = 9_000
/** See scorePunch: the ring pays into Focus now, never into a banked multiplier. */
const PUNCH_KARMA_BANK_ENABLED = false
const STATE_HEARTBEAT_MS = 250
const HELLO_HEARTBEAT_MS = 2_500

function cleanId(value: string): string {
  return value.trim().toLowerCase()
}

function cloneSnapshot(snapshot: PunchCompetitionSnapshot): PunchCompetitionSnapshot {
  return {
    ...snapshot,
    supporters: snapshot.supporters?.map(row => ({ ...row })),
    supportScores: snapshot.supportScores?.map(row => ({ ...row })),
    saveLegacy: snapshot.saveLegacy
      ? { ...snapshot.saveLegacy, shares: snapshot.saveLegacy.shares.map(row => ({ ...row })) }
      : undefined,
    // A coordinator from before the guard was broadcast sends no number, and a
    // HUD that read `undefined` would draw every punch as the last one.
    attemptsCeiling: snapshot.attemptsCeiling ?? PUNCH_ROUND_ATTEMPTS_MAX,
    rescue: snapshot.rescue
      ? {
          ...snapshot.rescue,
          tried: [...snapshot.rescue.tried],
          pushAccepted: snapshot.rescue.pushAccepted ? [...snapshot.rescue.pushAccepted] : undefined,
          pushers: snapshot.rescue.pushers?.map(row => ({ ...row })),
        }
      : undefined,
    // Same mixed-version defence as `focus` below: a coordinator still running a
    // pre-streak build sends none of these, and `undefined` reaching the HUD
    // prints 'undefined IN A ROW' on a badge rather than simply not drawing one.
    roundStreak: snapshot.roundStreak ?? 0,
    roundStreakBonus: snapshot.roundStreakBonus ?? 0,
    roundBestPunch: snapshot.roundBestPunch ?? 0,
    roundStrong: snapshot.roundStrong ?? 0,
    roundLongestStreak: snapshot.roundLongestStreak ?? 0,
    streakBonus: snapshot.streakBonus ?? 0,
    streakName: snapshot.streakName ?? '',
    streakSaves: (snapshot.streakSaves ?? []).map(entry => ({ ...entry })),
    active: snapshot.active ? { ...snapshot.active } : null,
    queue: snapshot.queue.map((entry) => ({ ...entry })),
    ring: (snapshot.ring ?? []).map((entry) => ({ ...entry })),
    profileBoards: Object.fromEntries(Object.entries(snapshot.profileBoards ?? {}).map(([key, rows]) => [key, rows.map(row => ({ ...row }))])),
    leaderboard: snapshot.leaderboard.map((entry) => ({ ...entry })),
    attempt: snapshot.attempt ? { ...snapshot.attempt } : null,
    // A coordinator still running the pre-focus build sends no `focus` at all.
    // Defaulting here is what keeps a mixed-version island from reading
    // `undefined.bonus01` on every frame of the meter. The roster gets the same
    // treatment one level down: a pre-roster coordinator sends a `focus` with
    // no `circle`, and every reader of it iterates.
    focus: snapshot.focus
      ? {
          ...emptyPunchFocusState(),
          ...snapshot.focus,
          circle: (snapshot.focus.circle ?? []).map((member) => ({ ...member }))
        }
      : emptyPunchFocusState(),
    // Same defence, one turn later in the story: a pre-karma coordinator sends
    // no bank, and every reader of it iterates.
    karma: (snapshot.karma ?? []).map((entry) => ({ ...entry })),
    prep: (snapshot.prep ?? []).map((entry) => ({ ...entry }))
  }
}

/**
 * THE WIRE, as the coordinator needs it.
 *
 * `MessageBus` satisfies this already — the point of naming the shape is that
 * anything else can too. A scene-shaped transport is the only thing standing
 * between "the queue looks right" and "the queue IS right under five clients,
 * a mid-round disconnect and a spectator mashing a key", and that difference
 * cannot be checked by reading the file.
 *
 * ‼️A bus does NOT loop back to its sender. Every `send*` below handles its own
 * message locally and THEN emits, so a fake that echoes to the sender would
 * double-apply every action — the one thing a stand-in has to get right.
 */
export interface PunchCompetitionBus {
  on(event: string, handler: (message: never) => void): unknown
  emit(event: string, message: never): void
}

export function startPunchCompetitionNetwork(args: {
  machineId: string
  userId: string
  name: string
  config: PunchMachineAppConfig
  /**
   * Names the NPC that will stand in the queue, and claims it on the scene side
   * so the avatar who walks up matches the name on the board. Return null when
   * no NPC is available yet — the coordinator simply asks again next tick.
   * Omit entirely for a humans-only machine.
   */
  houseBot?: () => string | null
  /**
   * Claims the NPCs who channel at the machine's flanks and names them, in the
   * order the reserved ids are dealt. Return an empty list — or omit this
   * entirely — for a machine whose circle is people only.
   *
   * Asked once per turn rather than once per boot: the arc re-deals whenever a
   * human arrives, so the two bodies standing beside the cabinet on this turn
   * are not necessarily the two who stood there on the last one.
   */
  focusBots?: () => string[] | null
  /**
   * ‼️IS THIS WALLET A HOST OF THE SCENE — the person who published it, or
   * anyone they added on Scene ▸ Hosts. Passed in rather than imported because
   * the answer lives behind `@dcl/sdk/ecs`, and this module is deliberately
   * plain enough to run in a test against a fake bus.
   *
   * Called with the SENDER'S id, never the local player's, so the coordinator
   * can judge a press that arrived from somebody else.
   */
  isSceneHost?: (userId: string) => boolean
  /** The transport. Defaults to the explorer's own scene bus. */
  bus?: PunchCompetitionBus
  /**
   * The clock. `tick(now)` already carries the frame's time, but joining,
   * punching and electing a coordinator all read the wall clock on their own —
   * so without this a test cannot place two clients at a known instant, and a
   * race is only reproducible by luck.
   */
  now?: () => number
  /** The bot's dice. Injectable so a rotation can be replayed exactly. */
  random?: () => number
  /** Who owns the round: the oldest session, or DCL's headless server. */
  authority?: PunchAuthorityMode
  /** The server's peer id, lower-cased. Required in 'server' mode. */
  serverId?: string
}): PunchCompetitionNetwork {
  const machineId = args.machineId
  const clock = args.now ?? Date.now
  const dice = args.random ?? Math.random
  const serverId = cleanId(args.serverId ?? '')
  let authority: PunchAuthorityMode =
    (args.authority ?? PUNCH_AUTHORITY_DEFAULT) === 'server' && serverId ? 'server' : 'coordinator'
  /** Set once if no server ever answers; see the tick. */
  let degradedToCoordinator = false
  /**
   * What this client was BUILT for, which `authority` stops telling you the
   * moment it degrades. The re-adoption below is only ever for a client that
   * was promised a server and gave up waiting — never for a serverless build,
   * which has no server to adopt and no reason to trust a peer claiming to be one.
   */
  const builtForServer = authority === 'server'
  const me = cleanId(args.userId) || `guest-${Math.floor(dice() * 1_000_000)}`
  const myName = args.name.trim() || 'Player'
  const sessionStartedAt = clock()
  /**
   * One Explorer, one id. The wallet is who you are in the queue; this is which
   * device is talking. A phone that resumes while the same wallet is already
   * on desktop must not look like an HTTP echo of that desktop.
   */
  const mySessionId = `${me}:${sessionStartedAt}:${Math.random().toString(36).slice(2, 10)}`
  /** False when another session of this wallet (or another host) owns the round. */
  let hosting = true
  /** Last time a different Explorer of THIS wallet sent punch.state. */
  let lastSiblingHostAt = 0
  const config = args.config
  const authoredProfile = normalizePunchProfile(config.gameProfile)
  function profile() {
    const id = state.active?.profileId ?? authoredProfile.id
    return id === authoredProfile.id ? authoredProfile : punchProfile(id)
  }
  // `as unknown as` is the honest bridge, not a shrug: MessageBus is generic in
  // its payload where this interface is not, so the two never structurally
  // overlap even though MessageBus satisfies every call made through it.
  const bus: PunchCompetitionBus = args.bus ?? (new MessageBus() as unknown as PunchCompetitionBus)
  const peers = new Map<string, { participant: PunchParticipant; receivedAt: number; startedAt: number }>()
  /**
   * THE PUSH's raw claims, coordinator-local and cleared when a window opens.
   * They are NOT on the snapshot: four people's tap lists would be rebroadcast
   * on every revise for a number the snapshot already carries as `pushScore`.
   */
  const pushTaps = new Map<string, number[]>()
  const pushNames = new Map<string, string>()
  const listeners = new Set<(snapshot: PunchCompetitionSnapshot) => void>()
  const houseBot = args.houseBot ?? null
  const focusBots = args.focusBots ?? null
  const sceneHost = (userId: string): boolean => args.isSceneHost?.(userId) ?? false
  /** When the bot stops sizing up the bag and starts charging. 0 = not armed. */
  let botChargeAt = 0
  /** When it lets go. 0 = not charging. */
  let botReleaseAt = 0
  let lastHelloAt = 0
  let lastStateAt = 0
  /** When a snapshot last ARRIVED here, by our own clock. */
  let lastStateSeenAt = 0
  let coordinatorId = me
  /** Full cold-start window unless this frame's room is a dead wire. */
  let adoptDeadlineMs = PUNCH_SERVER_ADOPT_MS
  /**
   * The meditation circle, coordinator-side. One entry per spectator who has
   * tapped recently; the level here is the authoritative copy of the bar they
   * are watching locally.
   */
  const focusPeers = new Map<
    string,
    {
      level01: number
      lastTapAt: number
      name: string
      npc: boolean
      multiplier: number
      /** Unbroken ring-time this attempt. Zeroed when `state.serial` moves. */
      karmaMs: number
      /** The attempt `karmaMs` belongs to, so a stale run cannot be inherited. */
      karmaSerial: number
      /** Circle-score inputs for this attempt: time fully in the green, time in the circle. */
      greenMs: number
      liveMs: number
    }
  >()
  /**
   * ‼️THE COMMITTED LEDGER — what the crowd has ALREADY earned on this punch.
   *
   * A Boost is spent the moment it is given. Without this the roster is a live
   * sample and the payout is whatever happened to be true on the frame the fist
   * landed, so a spectator who Boosted hard through the whole wind-up and then
   * walked off the edge — or simply lapsed for one beat — contributed nothing.
   * The owner's rule is explicit: leaving, jumping or flying off must not
   * invalidate a contribution already made to the punch in progress.
   *
   * So every tick keeps the BEST each person reached during this attempt, and
   * the punch is scored from here rather than from the live circle. It is reset
   * when a new attempt begins, never mid-punch.
   */
  const boostLedger = new Map<string, PunchBoostContribution>()
  /**
   * THE SAME PROMISE, FOR RING-TIME: the best unbroken run each person held
   * inside `PUNCH_FOCUS_KARMA_BAND_01` during this attempt, in milliseconds.
   *
   * Karma has to be banked from a committed high-water mark for exactly the
   * reason the points are: a booster who feathers a perfect ring through the
   * whole wind-up and then lapses on the frame the fist lands has done the work,
   * and the machine must not pretend otherwise. Cleared with `boostLedger`, off
   * the same serial, so points and karma can never describe different attempts.
   */
  const karmaLedger = new Map<string, { ms: number; name: string }>()
  /**
   * WHICH PUNCH THE LEDGER IS FOR. `serial` steps once per punch, so it names
   * the window: the taps banked between one result and the next belong to the
   * attempt that is coming, and the ledger empties itself the moment that
   * number moves. Clearing on the punch alone was not enough — the reveal ends
   * and the deck goes back to 'ready' while the last person's meter is still
   * bleeding out, so their spent Boost was banked again for the punch after.
   */
  let boostLedgerSerial = -1
  /**
   * When the ledger was last CASHED IN. A meter keeps its level across the
   * reveal, which is right — the deck should not go dead between punches — but
   * a level that has already been paid out must not be paid out again. Only a
   * press after this instant puts somebody back on the next punch's card.
   */
  let boostSpentAt = 0
  /**
   * MISS YOUR TURN AND YOU ARE OUT — the standing opt-in will not put you back.
   *
   * A queued player's client re-asserts its place about once a second, which
   * means an absent player is re-added the instant the shot clock drops them and
   * every rotation stalls on the same person again. A turn that ends with the
   * bag untouched drops that player here, and nothing but a deliberate join
   * takes them out again.
   */
  const noShows = new Set<string>()
  /** Real punches thrown in the current turn. A spent shot clock is not one. */
  let turnSwings = 0
  /** Last time the circle was stepped, so decay is measured, not assumed. */
  let focusSteppedAt = 0
  /** The broadcast crowd level, chasing the raw mean so one tap cannot spike it. */
  let focusSmoothed01 = 0
  /**
   * Where the drifting still point is in its cycle. Advanced by MEASURED
   * elapsed time rather than read off the clock, so a coordinator that loses a
   * frame moves the target by exactly the time that passed, and a client can
   * reproduce the same advance from the same broadcast phase.
   */
  let focusDriftMs = 0
  /** Unbroken time each circle has held its ring. The streak, in milliseconds. */
  let focusStreakMs = 0
  /**
   * The flanking regulars, coordinator-side. They hold a meter of their own in
   * `focusPeers` alongside every human, and this is only the hand that taps it.
   */
  const focusBotHands = PUNCH_FOCUS_BOT_IDS.map((id, index) => ({
    id,
    name: '',
    nextTapAt: 0,
    // Half a wobble apart, so the pair is never wrong the same way at once.
    seed: index * Math.PI
  }))
  /** The turn the regulars were last dealt for. Changing it re-seats them. */
  let focusBotTurnKey = ''
  let state: PunchCompetitionSnapshot = {
    machineId,
    coordinatorId: me,
    revision: 0,
    phase: 'waiting',
    active: null,
    queue: [],
    ring: [],
    leaderboard: [],
    chargeStartedAt: 0,
    phaseEndsAt: 0,
    score: 0,
    attempt: null,
    chargeAccuracy01: 0,
    serial: 0,
    attemptsUsed: 0,
    attemptsAllowed: PUNCH_ROUND_ATTEMPTS,
    attemptsCeiling: PUNCH_ROUND_ATTEMPTS_MAX,
    roundTotal: 0,
    roundStreak: 0,
    roundBestPunch: 0,
    roundStrong: 0,
    roundLongestStreak: 0,
    roundStreakBonus: 0,
    streakBonus: 0,
    streakName: '',
    roundStartedAt: 0,
    focus: emptyPunchFocusState(),
    karma: [],
    prep: []
  }

  function participant(userId: string, name: string, joinedAt = clock()): PunchParticipant {
    return { userId: cleanId(userId), name: name.trim() || 'Player', joinedAt }
  }

  function iHost(): boolean {
    return coordinatorId === me && hosting
  }

  function remember(message: Pick<HelloMessage, 'userId' | 'name'> & { startedAt?: number }, now = clock()): void {
    const userId = cleanId(message.userId)
    if (!userId) return
    const previous = peers.get(userId)?.participant
    // ‼️THE SERVER SAYS WHO IT CAN HEAR, ONCE PER PEER. `sdk-server-logs` is
    // the only window into a headless host, and until this line it showed
    // "hosting 1 punch machine(s)" and then silence — so on 2026-09-09, with a
    // phone and a desktop in the world playing two different games, the log
    // could not say which of the two had ever reached the room. Server-only:
    // a client printing its neighbours would be noise in every Explorer console.
    if (!previous && me === serverId && authority === 'server') {
      console.log(`[SERVER] hears ${userId} "${message.name.trim() || 'Player'}"`)
    }
    peers.set(userId, {
      participant: participant(userId, message.name, previous?.joinedAt ?? now),
      receivedAt: now,
      startedAt: Math.min(
        peers.get(userId)?.startedAt ?? Number.POSITIVE_INFINITY,
        Number.isFinite(message.startedAt) ? Number(message.startedAt) : now
      )
    })
  }

  function electCoordinator(): string {
    // One right answer when a server hosts: no client can promote itself.
    if (authority === 'server') return serverId
    return (
      [
        ...peers.entries(),
        [me, { participant: participant(me, myName), receivedAt: clock(), startedAt: sessionStartedAt }] as const
      ].sort((a, b) => a[1].startedAt - b[1].startedAt || a[0].localeCompare(b[0]))[0]?.[0] ?? me
    )
  }

  function notify(): void {
    const snapshot = cloneSnapshot(state)
    for (const listener of listeners) listener(snapshot)
  }

  function broadcastState(now: number): void {
    lastStateAt = now
    emit(STATE_EVENT, {
      machineId,
      coordinatorId: me,
      sentAt: now,
      startedAt: sessionStartedAt,
      sessionId: mySessionId,
      snapshot: cloneSnapshot(state)
    } satisfies StateMessage)
  }

  function revise(): void {
    if (!iHost()) return
    state.revision += 1
    state.coordinatorId = me
    notify()
  }

  /** Waiting PEOPLE. The house bot stands in the line forever and never counts. */
  function humansWaiting(): number {
    return state.queue.filter((entry) => entry.userId !== PUNCH_HOUSE_BOT_ID).length
  }

  /**
   * ‼️THE SEATS: the player holding the bag plus everybody in the line for it.
   *
   * This is the number `PUNCH_MAX_PLAYERS` caps, and the house bot is outside
   * it in both halves -- it exists to keep the rotation turning when the island
   * is empty, and a synthetic entrant spending a seat would leave the machine
   * one short of full from the moment it was seeded.
   */
  function humansInPlay(): number {
    const active = state.active && state.active.userId !== PUNCH_HOUSE_BOT_ID ? 1 : 0
    return active + humansWaiting()
  }

  /**
   * The ceiling for the round in progress -- the runaway guard, and nothing
   * else. The line no longer shortens a round; the DOOR is what is limited.
   */
  function attemptCeilingNow(): number {
    return Math.max(state.attemptsAllowed, PUNCH_ROUND_ATTEMPTS_MAX)
  }

  /** Standing in the ring: entered, not playing, waiting for a seat. */
  function inRing(userId: string): boolean {
    return (state.ring ?? []).some((entry) => entry.userId === userId)
  }
  /** Recent completed human rounds, for the ring's estimate. Five is enough to survive one freak run. */
  const PACE_SAMPLES = 5
  const paceSamples: number[] = []
  /**
   * ‼️PROMOTION HAPPENS IN THE SAME CALL THAT FREES THE SEAT, AND THAT TIMING
   * IS THE WHOLE FAIRNESS RULE.
   *
   * A player whose round has just ended re-asserts their join about once a
   * second (see `noShows`). So the ring has to be dealt the seat SYNCHRONOUSLY
   * with it coming free — a promotion one tick later loses the race to the
   * client that never stopped asking, and the machine rotates between the same
   * four people all night while four more watch.
   *
   * What falls out of that costs no extra branch and is exactly the rule worth
   * having: RING EMPTY, NOTHING CHANGES. Nobody waiting means the re-assert
   * finds the seat still open — a solo player is never interrupted, never
   * bounced, never made to rejoin a machine only they are standing at. Somebody
   * waiting means the seat is already taken and the finished player joins the
   * back of the ring. Pressure rotates the machine; quiet leaves it alone.
   */
  function promoteFromRing(): boolean {
    let moved = false
    while ((state.ring?.length ?? 0) > 0 && punchQueueHasRoom(humansInPlay())) {
      state.queue.push(state.ring!.shift()!)
      moved = true
    }
    return moved
  }
  function nextPlayer(now: number): void {
    // The seat this call is about to deal is free RIGHT NOW, so the ring gets
    // first refusal on it before the queue is read.
    promoteFromRing()
    turnSwings = 0
    // A new player is a new punch. Nothing the last one's crowd earned carries.
    boostLedger.clear()
    boostLedgerSerial = -1
    boostSpentAt = now
    state.active = state.queue.shift() ?? null
    state.chargeStartedAt = 0
    state.score = 0
    state.attempt = null
    state.chargeAccuracy01 = 0
    // A fresh round for whoever steps up. There is no half-round to restore:
    // the bag is never taken off a live run, so a round that ended, ended.
    state.attemptsUsed = 0
    state.attemptsAllowed = PUNCH_ROUND_ATTEMPTS
    state.roundTotal = 0
    // A streak belongs to the round that built it, and a round belongs to one
    // player: the next person up starts on rung zero however hot the bag is.
    state.roundStreak = 0
    state.roundMomentum = 0
    state.supporters = []
    state.rescue = undefined
    state.challengeAward = undefined
    state.roundStreakBonus = 0
    state.roundBestPunch = 0
    state.roundStrong = 0
    state.roundLongestStreak = 0
    state.streakBonus = 0
    state.streakName = ''
    state.streakSaved = false
    state.streakMultiplier = 1
    // ‼️THE SAVE COUNT IS ROUND STATE AND DIES WITH THE ROUND. Leaving it on the
    // state across `nextPlayer` would hand this round's spent save to whoever
    // came second, and the round it belonged to is over.
    state.roundRescues = 0
    state.saveLegacy = undefined
    state.rescue = undefined
    state.lastRescueSerial = undefined
    state.profileId = profile().id
    state.leaderboard = (state.profileBoards?.[punchProfileBoardKey(profile())] ?? []).map(row => ({ ...row }))
    state.roundStartedAt = now
    state.attemptsCeiling = attemptCeilingNow()
    if (state.active) {
      state.phase = 'ready'
      state.attemptReadyAt = now
      state.phaseEndsAt = now + config.turnTimeoutMs
    } else {
      state.phase = 'waiting'
      state.phaseEndsAt = 0
    }
    revise()
  }

  function finishTurn(now: number): void {
    // THE PACE, so the ring can say how long and not merely how many. Only
    // human rounds count: a house-bot round is what happens when the island is
    // empty, which is by definition a moment nobody is waiting through.
    if (state.active && state.active.userId !== PUNCH_HOUSE_BOT_ID && state.roundStartedAt > 0) {
      const span = Math.max(0, now - state.roundStartedAt)
      if (span > 0) {
        paceSamples.push(span)
        if (paceSamples.length > PACE_SAMPLES) paceSamples.shift()
        state.roundPaceMs = Math.round(paceSamples.reduce((sum, ms) => sum + ms, 0) / paceSamples.length)
      }
    }
    // The house bot is exempt: it exists to keep the queue turning, and
    // `ensureHouseBot` re-seeds it on the very next tick regardless.
    if (state.active && turnSwings === 0 && state.active.userId !== PUNCH_HOUSE_BOT_ID) {
      noShows.add(state.active.userId)
    }
    state.active = null
    nextPlayer(now)
  }

  /**
   * THE BANK, READ AND WRITTEN IN THREE PLACES AND NOWHERE ELSE.
   *
   * A plain array on the state rather than a Map beside it, because it has to
   * survive the wire: a coordinator handing over mid-session sends its snapshot,
   * and anything kept in this closure would be lost with it. Small by
   * construction — one row per person who has ever held the ring here, and
   * `PUNCH_KARMA_BANK_MAX` keeps each row three digits.
   */
  /** One preparation row per player, created on first touch. */
  function prepFor(userId: string, name = ''): PunchPrepEntry {
    const id = cleanId(userId)
    let entry = state.prep.find((row) => row.userId === id)
    if (!entry) {
      entry = { userId: id, name: name.trim() || peers.get(id)?.participant.name || 'Player', focus: 0, momentumReady: false, leftQueueAt: 0 }
      state.prep.push(entry)
    } else if (name.trim()) entry.name = name.trim()
    return entry
  }
  /**
   * Up at the bag, in the queue, or in the ring: the three states that may EARN
   * preparation.
   *
   * ‼️THE RING EARNS TOO. Somebody waiting for a seat has entered the
   * competition — they are not a passer-by, and the Focus they store is for the
   * turn they are queued for. Leaving them out would have made the ring the one
   * place on the island where holding the key pays nothing, which is the exact
   * complaint the ring exists to answer.
   */
  function prepQueued(userId: string): boolean {
    const id = cleanId(userId)
    return state.active?.userId === id || state.queue.some((row) => row.userId === id) || inRing(id)
  }
  /**
   * The grace: leaving the queue starts a clock, rejoining stops it, and a
   * player gone for longer than PUNCH_PREP_GRACE_MS loses what they stored.
   * A fall, a cloud, a knock-back or a mis-click never costs a full Focus.
   */
  function sweepPrep(now: number): void {
    let changed = false
    state.prep = state.prep.filter((entry) => {
      if (prepQueued(entry.userId)) {
        if (entry.leftQueueAt !== 0) { entry.leftQueueAt = 0; changed = true }
        return true
      }
      if (entry.leftQueueAt === 0) { entry.leftQueueAt = now; changed = true; return true }
      if (now - entry.leftQueueAt > PUNCH_PREP_GRACE_MS) { changed = true; return false }
      return true
    })
    if (changed) revise()
  }

  function karmaFor(userId: string): number {
    return state.karma.find((entry) => entry.userId === userId)?.karma ?? 0
  }

  function bankKarma(userId: string, name: string, earned: number): void {
    const id = cleanId(userId)
    if (!id || earned <= 0) return
    const held = state.karma.find((entry) => entry.userId === id)
    const label = name.trim() || peers.get(id)?.participant.name || held?.name || 'Player'
    if (held) {
      held.karma = punchKarmaBanked(held.karma, earned)
      held.name = label
      return
    }
    state.karma.push({ userId: id, name: label, karma: punchKarmaBanked(0, earned) })
  }

  function spendKarma(userId: string, spent: number): void {
    if (spent <= 0) return
    const held = state.karma.find((entry) => entry.userId === cleanId(userId))
    if (!held) return
    held.karma = Math.max(0, held.karma - spent)
  }

  function scorePunch(userId: string, heldMs: number, timingMarker01: number, accuracy01: number, now: number, stancePower = 1): void {
    if (!state.active || state.active.userId !== cleanId(userId)) return
    turnSwings += 1
    state.serial += 1
    // ‼️THE CROWD IS READ HERE, at the instant of contact, from the coordinator's
    // own committed ledger — never from a number a client sent, and never from
    // the live circle. The ledger is what makes a Boost a thing you GAVE: it
    // survives the giver lapsing, walking off, or flying off the island between
    // the beat and the fist.
    //
    // The serial seeds the High Ground draw so every client independently
    // composes the same event off the same snapshot.
    state.attempt = punchScoreForAttempt(
      {
        heldMs,
        stancePower,
        timingMarker01,
        accuracy01,
        // ‼️THE LEDGER, READ AT LAST. This argument was `boosts: []` for the
        // whole build — a hardwired empty list that made `crowdBoost` zero on
        // every punch ever thrown, pinned the ceiling at `maxScore` (999) and
        // left `PUNCH_HIGH_GROUND_THRESHOLD` (1000) one point out of reach for
        // everybody. The liftoff event, the broken/storm/rapture bands and the
        // crowd rows on the result card were all downstream of it and had
        // therefore never fired. With Boost off the ledger is empty anyway and
        // this is exactly the old behaviour; with it on, the room can finally
        // put a fourth digit on the cabinet, which is what the mechanic is for.
        boosts: [...boostLedger.values()],
        // ‼️AND THE BANK, READ AT LAST TOO. This was `karma: 0` while the ring,
        // the pill's KARMA row, the reveal card's gain/spent/clipped lines and
        // the client's own estimate were all built and waiting — so every bank
        // was empty and every multiplier was ×1. It multiplies the SKILL score
        // and is re-clamped at `maxScore`, so it can make a scrappy punch
        // perfect and can never, alone, be the reason one breaks High Ground.
        karma: punchKarmaLive(profile()) ? karmaFor(cleanId(userId)) : 0,
        eventSeed: state.serial
      },
      { ...config, gameProfile: profile() }
    )
    state.score = state.attempt.score
    const momentumWasReady = false
    // ‼️THE BANK IS SPENT BY THE PUNCH THAT USED IT, which is what keeps the
    // ring worth holding: an edge that only ever grew would be a one-evening
    // grind. `punchKarmaSpend` takes half, and both calls below are no-ops when
    // the switch is off (`karmaSpent` is 0 and the ledger is empty), so this is
    // exactly the old behaviour until a director turns it on.
    spendKarma(userId, state.attempt.karmaSpent)
    // ...and the ring-time held through THIS wind-up is banked for its holders'
    // own next turns. Read off the committed ledger, not the live circle, for
    // the same reason a Boost is: a spectator who held the beat and then walked
    // off has still earned it.
    if (punchKarmaLive(profile())) {
      for (const [holder, held] of karmaLedger) {
        bankKarma(holder, held.name, punchKarmaEarned(held.ms))
      }
    }
    // Spent. Everyone on that card has to tap again to pay into the next punch.
    boostSpentAt = now
    // The round is the score: punches add up, and a big one buys another punch.
    state.attemptsUsed += 1
    state.roundTotal += state.score
    // ‼️THE STREAK IS SETTLED HERE, BEFORE THE BOARD ROW IS BUILT, and on the
    // AUTHORITATIVE score — the one the Boost has already been added to. A
    // crowd that pushes an 880 over the line has genuinely kept the run alive,
    // and reading the pre-Boost number here would have quietly made the room's
    // contribution count for the total and not for the streak.
    const rules = profile()
    state.streakSaves = []
    const priorStreak = state.roundStreak
    const priorMomentum = state.roundMomentum ?? state.roundStreak
    // ‼️THE BANKED SAVE COULD NEVER BE SPENT. `hasSave` was the literal `false`
    // here, and `punchRoundAward` computes `saved = score < 900 && previousStreak
    // > 0 && hasSave && savesEnabled` -- so `award.saved` was false in every
    // round this machine has ever run. The bank below fills correctly, the HUD
    // names it on the boost rail as "SAVE A FUMBLE", and the one branch that
    // spends it (`award.saved && save`) was unreachable. Owner, 2026-09-06:
    // "I've never seen a fumble option yet." Nobody has.
    //
    // A save belongs to the PUNCHER and was earned by boosting somebody else,
    // which is why it is looked up on `userId` and not on the booster.
    // ‼️THE TEAMMATE GETS FIRST REFUSAL. There are two saves in this game and
    // they must not race: the RESCUE is a live window a spectator taps into
    // (below), and the BANK is a save this player earned by boosting somebody
    // else. Spending the bank here unconditionally would pre-empt the rescue and
    // delete the more social of the two -- which is what it did the moment the
    // bank stopped being unspendable.
    //
    // So the bank pays only where a rescue cannot: alone, or in a room whose
    // only other occupants are NPCs. If a rescue DOES open and nobody claims it,
    // the bank still pays -- see the scoring -> cooldown transition, which is
    // where that is settled rather than guessed at here.
    const spectatorPresent = [...peers.keys()].some(id => id !== userId && id !== PUNCH_HOUSE_BOT_ID
      && !state.queue.some(row => row.userId === id))
    const cooldownReady = state.lastRescueSerial === undefined
      || state.serial - state.lastRescueSerial > rules.rescueCooldownAttempts
    // ‼️THE TWO GATES THAT GIVE THE MECHANIC AN ENDING.
    //
    // Owner, 2026-09-08: *"it's never ending, it's too easy to save and the
    // person keeps on hitting… they should get one save and that's it… this is
    // really for people who are about to leave the game, no more hits, they get
    // one last chance."* Nothing in the old gate could ever close: `maximum`
    // made the opportunity roll a constant `true`, a cooldown of 0 made
    // `cooldownReady` a constant `true`, and there was no per-round count at
    // all. Two additions, and they are different kinds of limit on purpose —
    // one is about WHEN it is allowed to open, the other about HOW MANY TIMES.
    //
    // `attemptsUsed` has already been incremented for this punch above, so
    // "no punches left" is `used >= allowed` read right here. `award.extendsRound`
    // is deliberately NOT consulted: a 900+ never fumbles, so a punch that earns
    // another attempt is never the punch a rescue opens on.
    const outOfPunches = state.attemptsUsed >= state.attemptsAllowed
    const rescuesLeft = (state.roundRescues ?? 0) < Math.max(0, Math.min(PUNCH_PUSH_MAX_PER_ROUND, rules.rescueMaxPerRound || PUNCH_PUSH_MAX_PER_ROUND))
    // ‼️THE ADMIN ARM IS AN OR, NOT AN EXTRA CONDITION, and it deliberately
    // bypasses EVERY gate above including the per-round cap and the 900 floor.
    // The whole complaint it answers is that the five real conditions cannot be
    // arranged on purpose — an arm that still needed four of them would only
    // narrow the wait, and the mechanic would go on being shipped unplayed.
    //
    // The ONE thing it does not bypass is `spectatorPresent`, because a Rescue
    // with nobody watching has no player: the window would open, draw for
    // nobody and expire. Testing alone therefore means standing OUT of the queue
    // and letting the house bot punch — which is exactly the seat the mechanic
    // is designed to be seen from.
    const forced = state.forceRescueNext === true && spectatorPresent
    const rescueCanOpen = forced || (state.score < 900 && priorStreak > 0 && spectatorPresent
      && cooldownReady && rescuesLeft && outOfPunches
      && punchRescueOpportunity(rules, state.serial))
    const award = punchRoundAward(state.score, priorMomentum, false, rules, momentumWasReady)
    // ‼️AND A SAVE HAS TO ACTUALLY KEEP THE RUN. These two lines read the score
    // alone, so even once `award.saved` could be true the streak and the
    // momentum were still both thrown away on the miss it was spent on -- the
    // save would have burned itself to change a banner. The teammate rescue
    // below already restores both; a spent save is the same promise.
    state.roundStreak = state.score >= 900 ? priorStreak + 1 : award.saved ? priorStreak : 0
    state.roundMomentum = state.score >= 900
      ? Math.min(rules.multipliers.length - 1, award.streak)
      : award.saved ? priorMomentum : Math.max(0, priorMomentum - 2)
    state.streakSaved = award.saved
    state.streakMultiplier = award.multiplier
    state.streakBonus = award.bonus
    // A spent save scores under 900, so the multiplier is 1 and the streak line
    // would have gone blank on the one punch that most needs to explain itself.
    state.streakName = award.saved
      ? 'FUMBLE SAVED · RUN ALIVE'
      : award.golden ? 'GOLDEN PUNCH x' + award.multiplier
      : award.multiplier > 1 ? (state.roundStreak < award.streak ? 'COMEBACK x' : 'STREAK x') + award.multiplier : ''
    state.roundTotal += award.bonus
    state.challengeAward = punchChallengeAward({ attempt: state.attemptsUsed, heldMs,
      idealMs: config.idealChargeMs, timing01: state.attempt.timing01, points: award.points,
      remaining01: 1 - (now - (state.attemptReadyAt ?? state.chargeStartedAt)) / config.turnTimeoutMs }, rules)
    state.roundTotal += state.challengeAward.difficultyBonus + state.challengeAward.timeBonus
    paySaveLegacy()
    state.roundStreakBonus += award.bonus
    // THIS ROUND'S STORY, for the card: best punch, punches over 900, longest run.
    state.roundBestPunch = Math.max(state.roundBestPunch ?? 0, state.score)
    if (state.score >= 900) state.roundStrong = (state.roundStrong ?? 0) + 1
    state.roundLongestStreak = Math.max(state.roundLongestStreak ?? 0, state.roundStreak)
    // ‼️THE QUEUE'S CEILING IS READ AT THE MOMENT OF THE GRANT, not at the start
    // of the round: somebody joining the line on punch four has to be able to
    // shorten a run that is already going, or the fairness rule only ever
    // applies to people who were late.
    state.attemptsCeiling = attemptCeilingNow()
    if (award.extendsRound) {
      state.attemptsAllowed = punchRoundAttemptsAfter(
        state.attemptsAllowed,
        PUNCH_ROUND_EXTEND_SCORE,
        state.attemptsCeiling
      )
    }
    // The board ranks ROUNDS, so it is replaced, not appended, as the total
    // grows — otherwise one round would occupy every row on the way up.
    state.leaderboard = rankPunchScores(
      [
        ...state.leaderboard.filter(
          (entry) => entry.userId !== state.active!.userId || entry.achievedAt < state.roundStartedAt
        ),
        {
          userId: state.active.userId,
          name: state.active.name,
          score: state.roundTotal,
          supporters: state.supporters?.map(row => ({ ...row })),
          achievedAt: state.roundStartedAt
        }
      ],
      config.leaderboardSize
    )
    state.profileBoards ??= {}
    state.profileBoards[punchProfileBoardKey(profile())] = state.leaderboard.map(row => ({ ...row }))
    state.phase = 'scoring'
    // The whole reveal theatre — slam, held 000, the power-4 crawl, a linger on
    // the full number — fits inside the scoring phase, on every client alike.
    state.scorePhaseStartedAt = now
    // `config` carries `maxScore`, which is the only way this can know a 999
    // when it sees one and add the cut's 1.2 s to the phase.
    state.scorePhaseDurationMs = punchScorePhaseMs(state.score, profile(), config)
    state.phaseEndsAt = now + state.scorePhaseDurationMs
    state.rescue = undefined
    if (rescueCanOpen) {
      const announcedAt = state.phaseEndsAt
      // THE PUSH'S PREPARATION IS THE ASK, AND IT IS LONGER ON PURPOSE. The
      // other shapes use the gap to say "get ready"; the push uses it to blank
      // the screen and ask the room whether they want to play at all, because
      // the people it is for do not know they are in the game. See
      // `PUNCH_PUSH_ASK_MS`.
      const isPush = rules.rescueSkill === 'push'
      const startsAt = announcedAt + (isPush ? rules.rescuePushAskMs : rules.rescuePreparationMs)
      pushTaps.clear()
      pushNames.clear()
      state.rescue = { announcedAt, startsAt, endsAt: startsAt + rules.rescueWindowMs,
        streak: priorStreak, momentum: priorMomentum, tapsRequired: rules.rescueTapsRequired,
        tried: [], rescuedName: state.active.name, rescuedUserId: state.active.userId,
        skill: rules.rescueSkill, bandTapsRequired: rules.rescueBandTapsRequired,
        band01: rules.rescueBand01, lastChance: outOfPunches,
        ...(isPush
          ? { pushFrom: state.score, pushTo: PUNCH_PUSH_THRESHOLD, pushScore: state.score, pushAccepted: [] }
          : {}) }
      state.lastRescueSerial = state.serial
      state.phaseEndsAt = state.rescue.endsAt
      // ONE ARM, ONE WINDOW. Spent here rather than at settle so a window that
      // opens and is then abandoned still costs the arm — otherwise a forgotten
      // press keeps re-opening the panel on strangers for the rest of the night.
      state.forceRescueNext = false
    }
    revise()
  }

  function creditSupport(userId: string, name: string, points: number, saves: number, circle = 0, lastSavedName = '', unlocked = 0, lastSavedUserId = ''): void {
    for (const key of ['supporters', 'supportScores'] as const) {
      state[key] ??= []
      let row = state[key]!.find(row => row.userId === userId)
      if (!row) { row = { userId, name, points: 0, saves: 0, unlocked: 0 }; state[key]!.push(row) }
      row.points += points
      row.saves += saves
      if (unlocked) row.unlocked = (row.unlocked ?? 0) + unlocked
      if (lastSavedName) row.lastSavedName = lastSavedName
      if (lastSavedUserId) row.lastSavedUserId = lastSavedUserId
      if (circle > 0) {
        row.circle = (row.circle ?? 0) + circle
        row.bestCircle = Math.max(row.bestCircle ?? 0, circle)
      }
    }
  }

  /**
   * ‼️REPLAY THE WHOLE ROOM FROM THE TAP LISTS, THEN NAME EVERYBODY WHO SAID YES.
   *
   * The coordinator's score is this function, not a number a client asserted.
   * Accepted people with no pulses yet still get a row at zero — that is how
   * the puncher can see who is in before the first point lands.
   */
  function replayPush(now: number) {
    const rescue = state.rescue
    if (!rescue || rescue.skill !== 'push') return null
    const accepted = rescue.pushAccepted ?? []
    const gap = { from: rescue.pushFrom ?? 0, to: rescue.pushTo ?? PUNCH_PUSH_THRESHOLD }
    const settled = punchPushSettle(
      accepted.map(id => ({ userId: id, name: pushNames.get(id), taps: pushTaps.get(id) ?? [] })),
      gap,
      {
        phase0: 0, people: Math.max(1, accepted.length),
        rescueIndex: state.roundRescues ?? 0,
        windowMs: Math.max(0, rescue.endsAt - rescue.startsAt),
        full: profile().rescuePushFull, perSec: profile().rescuePushPerSec,
        bleedPerSec: profile().rescuePushBleedPerSec,
        elapsedMs: Math.max(0, now - rescue.startsAt),
      },
    )
    const named = settled.pushers.map(row => ({
      userId: row.userId,
      name: pushNames.get(row.userId) ?? row.name ?? 'Player',
      gain: Math.round(row.gain),
      pulses: row.pulses,
      quality01: row.quality01,
    }))
    rescue.pushScore = settled.score
    rescue.pushers = named
    return settled
  }

  function creditPushers(
    settled: NonNullable<ReturnType<typeof replayPush>>,
    saves: number,
    rescuedName: string,
    rescuedUserId = '',
  ): void {
    const gapFrom = state.rescue?.pushFrom ?? 0
    const pointsAdded = Math.max(0, Math.round(settled.score - gapFrom))
    const totalGain = settled.pushers.reduce((acc, row) => acc + Math.max(0, row.gain), 0)
    for (const row of settled.pushers) {
      if (row.gain <= 0) continue
      const share = totalGain > 0 && pointsAdded > 0
        ? Math.round((row.gain / totalGain) * pointsAdded)
        : Math.round(row.gain)
      creditSupport(
        row.userId,
        pushNames.get(row.userId) ?? row.name ?? 'Player',
        share,
        saves,
        0,
        saves > 0 ? rescuedName : '',
        saves > 0 ? share : 0,
        saves > 0 ? rescuedUserId : '',
      )
    }
  }

  function stampPushOnLeaderboard(): void {
    state.leaderboard = state.leaderboard.map(row =>
      row.userId === state.active?.userId && row.achievedAt === state.roundStartedAt
        ? { ...row, supporters: state.supporters?.map(entry => ({ ...entry })) }
        : row)
    state.profileBoards![punchProfileBoardKey(profile())] = state.leaderboard.map(row => ({ ...row }))
  }

  function beginSaveLegacy(
    shares: Array<{ userId: string; name: string; share01: number }>,
    rescuedName: string,
    rescuedUserId = '',
  ): void {
    if (shares.length === 0) return
    state.saveLegacy = {
      roundTotalAt: Math.round(state.roundTotal),
      credited: 0,
      rescuedName,
      rescuedUserId,
      shares,
    }
  }

  function paySaveLegacy(): void {
    const legacy = state.saveLegacy
    if (!legacy) return
    const delta = punchSaveUnlockedDelta(state.roundTotal, legacy.roundTotalAt, legacy.credited)
    if (delta <= 0) return
    for (const part of punchSaveSplit(delta, legacy.shares)) {
      creditSupport(part.userId, part.name, part.points, 0, 0, legacy.rescuedName, part.points, legacy.rescuedUserId ?? '')
    }
    legacy.credited += delta
    stampPushOnLeaderboard()
  }

  /**
   * ‼️THE END OF THE WINDOW, WHICH IS A DIFFERENT MOMENT FROM A CLAIM ARRIVING.
   *
   * Two things can only happen here. `closest-shot` is a CONTEST — every
   * spectator gets one press and the nearest to the centre wins — so it cannot
   * be decided when a press arrives, only when there are no more presses
   * coming. And the failure tell has to know that the room actually failed,
   * which is not knowable until the same instant.
   *
   * Called from the scoring→cooldown transition, so it runs exactly once per
   * window, on the coordinator, before the phase that reads `streakName`.
   */
  function settleRescue(now: number): void {
    const rescue = state.rescue
    if (!rescue || rescue.settled) return
    rescue.settled = true
    const rules = profile()
    if (!rescue.winner && rescue.skill === 'closest-shot' && rescue.bestUserId && rescue.bestName && (rescue.best01 ?? 0) > 0) {
      // The best press in the room takes it. There is no threshold: somebody
      // always saves them when the shape is `closest-shot`, and the skill is in
      // WHO — which is the whole reason it is a contest and not a pass/fail.
      rescue.winner = rescue.bestUserId
      rescue.winnerName = rescue.bestName
      rescue.completedAt = now
      state.roundStreak = rescue.streak
      state.roundMomentum = rescue.momentum
      state.streakSaved = true
      state.streakName = rescue.bestName.toUpperCase() + ' SAVED ' + rescue.rescuedName.toUpperCase()
      state.streakMultiplier = rules.multipliers[Math.min(rescue.momentum, rules.multipliers.length - 1)]!
      state.roundRescues = (state.roundRescues ?? 0) + 1
      state.attemptsAllowed = Math.min(PUNCH_ROUND_ATTEMPTS_MAX, state.attemptsAllowed + 1)
      state.attemptsCeiling = Math.max(state.attemptsCeiling, state.attemptsAllowed)
      creditSupport(rescue.bestUserId, rescue.bestName, 0, 1, 0, rescue.rescuedName, 0, rescue.rescuedUserId ?? '')
      beginSaveLegacy([{ userId: rescue.bestUserId, name: rescue.bestName, share01: 1 }], rescue.rescuedName, rescue.rescuedUserId ?? '')
      revise()
      return
    }
    if (rescue.winner) return
    // ‼️A PUSH THAT RUNS TO THE BUZZER STILL HAS TO BE SETTLED. Live pulses
    // only replay up to the last message; the dwell after it — the whole point
    // of "stay in the green" — would otherwise vanish, and a room that came
    // up six points short would never be told they were six points short.
    if (rescue.skill === 'push') {
      const settled = replayPush(now)
      if (settled?.saved && settled.pushers[0]) {
        if (!rescue.winner) {
          const top = settled.pushers[0]
          const lead = pushNames.get(top.userId) ?? top.name ?? 'Player'
          const accepted = rescue.pushAccepted ?? []
          const gapTo = rescue.pushTo ?? PUNCH_PUSH_THRESHOLD
          const headline = accepted.length > 1
            ? 'THE ROOM PUSHED ' + rescue.rescuedName.toUpperCase() + ' TO ' + gapTo
            : lead.toUpperCase() + ' PUSHED ' + rescue.rescuedName.toUpperCase() + ' TO ' + gapTo
          awardSave(rescue, top.userId, lead, now, headline)
          creditPushers(settled, 1, rescue.rescuedName, rescue.rescuedUserId ?? '')
          beginSaveLegacy(punchSaveShares(settled.pushers), rescue.rescuedName, rescue.rescuedUserId ?? '')
          stampPushOnLeaderboard()
          revise()
          return
        }
      }
      if (settled && !rescue.winner) creditPushers(settled, 0, '')
    }
    // ‼️NOBODY SAVED THEM, AND THE ROOM IS TOLD HOW CLOSE IT CAME. Owner's
    // choice, 2026-09-08: a failure that says nothing teaches nothing, and a
    // save nobody has watched succeed stays a rumour. `near-miss` names the best
    // attempt; `house-bot` guarantees everyone sees the mechanic work once, at
    // the cost of the ending we just built; `silent` is the old behaviour.
    if (rules.rescueFailureTell === 'near-miss') {
      state.streakName = rescue.bestName
        ? `NOBODY SAVED ${rescue.rescuedName.toUpperCase()} · CLOSEST ${rescue.bestName.toUpperCase()} ${rescue.bestDetail ?? ''}`.trim()
        : `NOBODY REACHED FOR ${rescue.rescuedName.toUpperCase()}`
      revise()
    } else if (rules.rescueFailureTell === 'house-bot') {
      state.roundStreak = rescue.streak
      state.roundMomentum = rescue.momentum
      state.streakSaved = true
      state.streakName = 'THE HOUSE SAVED ' + rescue.rescuedName.toUpperCase()
      state.roundRescues = (state.roundRescues ?? 0) + 1
      state.attemptsAllowed = Math.min(PUNCH_ROUND_ATTEMPTS_MAX, state.attemptsAllowed + 1)
      state.attemptsCeiling = Math.max(state.attemptsCeiling, state.attemptsAllowed)
      revise()
    }
  }

  /**
   * A Focus beat from anybody, restored behind `focusEnabled`.
   *
   * ‼️THE RESCUE BRANCH THAT USED TO LIVE HERE IS DELETED, NOT MOVED. The old
   * version scored save claims inside this function, on the old hold rules, from
   * a `rescueMs` field on this message — a second authority for the save, with
   * its own copy of the eligibility list, its own idea of what a claim was, and
   * no knowledge of the band. `handleRescue` below is the only one now. Do not
   * reintroduce a save path here because the two games share a key; they share
   * a key and nothing else.
   */
  function handleFocus(message: FocusMessage): void {
    if (message.machineId !== machineId) return
    remember(message)
    if (!iHost()) return
    if (!profile().focusEnabled) return
    const userId = cleanId(message.userId)
    if (!userId) return
    if (message.action === 'stop') {
      focusPeers.delete(userId)
      return
    }
    if (message.action === 'momentum') {
      // Only a queued player with full Focus can bank it; anyone else's win is
      // just a win.
      const entry = prepFor(userId, message.name)
      if (prepQueued(userId) && entry.focus >= PUNCH_PREP_FOCUS_MAX - 1e-6 && !entry.momentumReady) {
        entry.momentumReady = true
        revise()
      }
      return
    }
    const now = clock()
    const entry =
      focusPeers.get(userId) ??
      { level01: 0, lastTapAt: now, name: '', npc: false, multiplier: 1, karmaMs: 0, karmaSerial: -1, greenMs: 0, liveMs: 0 }
    entry.level01 = punchFocusTap(entry.level01)
    entry.lastTapAt = now
    // Carried on the tap itself rather than looked up: `peers` only knows the
    // people who have said hello on this machine, and the roster has to be able
    // to name a spectator from their very first beat.
    entry.name = message.name.trim() || peers.get(userId)?.participant.name || 'Player'
    focusPeers.set(userId, entry)
  }

  /**
   * ‼️THE ONE PLACE AN ADMIN PRESS BECOMES REAL, and the only one that checks
   * the wallet. `punchIsAdmin` reads the DIRECTOR'S OWN profile as this machine
   * knows it, so removing an address from the panel and republishing takes the
   * button away from that person even if their client still draws it.
   */
  function handleAdmin(message: AdminMessage): void {
    if (message.machineId !== machineId) return
    remember(message)
    if (!iHost()) return
    const userId = cleanId(message.userId)
    // ‼️THE SCENE'S OWN HOSTS COME FIRST, and `adminIds` is only ever an EXTRA.
    // Whoever published this world is its admin by definition; asking them to
    // type their own wallet into a second list to unlock their own test button
    // was the wrong shape, and it shipped a chip nobody could see.
    const rules = profile()
    if (!rules.adminToolsEnabled) return
    if (!sceneHost(userId) && !punchIsAdmin(rules, userId)) return
    const armed = message.action === 'arm-rescue'
    if (state.forceRescueNext === armed) return
    state.forceRescueNext = armed
    revise()
  }

  /** Coordinator-authoritative Fumble Rescue. Every client may fill locally;
   * only the first eligible completed meter becomes the savior. */
  /**
   * Everything a granted save does, in one place. The two older shapes still
   * carry their own copies of this -- deliberately untouched, because rewriting
   * a working payout to save nine lines is how a shipped mechanic breaks.
   */
  function awardSave(rescue: NonNullable<typeof state.rescue>, userId: string, name: string, now: number, headline: string): void {
    const rules = profile()
    rescue.winner = userId
    rescue.winnerName = name
    rescue.completedAt = now
    state.roundStreak = rescue.streak
    state.roundMomentum = rescue.momentum
    state.streakSaved = true
    state.streakName = headline
    state.streakMultiplier = rules.multipliers[Math.min(rescue.momentum, rules.multipliers.length - 1)]!
    state.roundRescues = (state.roundRescues ?? 0) + 1
    state.attemptsAllowed = Math.min(PUNCH_ROUND_ATTEMPTS_MAX, state.attemptsAllowed + 1)
    state.attemptsCeiling = Math.max(state.attemptsCeiling, state.attemptsAllowed)
    rescue.endsAt = now + 2_200
    state.phaseEndsAt = rescue.endsAt
  }

  /**
   * THE PUSH -- an accept during the ask, a pulse after it.
   *
   * NOTE: PRESSING DURING THE ASK IS THE "YES". There is no second control and
   * no second message: the ask is three seconds of blanked screen with one
   * question on it, and the thumb that answers it is the same thumb that plays.
   * `pushAccepted.length` then IS the difficulty, because it sets the band.
   *
   * NOTE: THE WHOLE WINDOW IS RE-SETTLED ON EVERY MESSAGE, not accumulated. A
   * claim carries the sender's entire tap list, so the coordinator replays all
   * of them from scratch and arrives at a score it computed -- an accumulator
   * would be adding numbers it was handed, and would double-count the overlap
   * between one message and the next.
   */
  function handlePush(message: RescueMessage, userId: string, name: string, now: number): void {
    const rescue = state.rescue
    if (!rescue || rescue.winner) return
    const accepted = (rescue.pushAccepted ??= [])
    pushNames.set(userId, name)
    if (now < rescue.startsAt) {
      if (accepted.includes(userId)) return
      accepted.push(userId)
      rescue.pushers = [
        ...(rescue.pushers ?? []).filter(row => row.userId !== userId),
        { userId, name, gain: 0, pulses: 0, quality01: 0 },
      ]
      revise()
      emit(STATE_EVENT, { machineId, coordinatorId: me, sentAt: now, startedAt: sessionStartedAt,
        snapshot: cloneSnapshot(state) } satisfies StateMessage)
      return
    }
    // A LATE HAND IS STILL A HAND. Somebody who looks up two seconds in and
    // starts pulsing is exactly the player this feature exists for; refusing
    // them because they missed a three-second prompt would be the old gate all
    // over again, in a nicer coat.
    if (!accepted.includes(userId)) accepted.push(userId)
    pushTaps.set(userId, [...(message.at ?? [])])

    const settled = replayPush(now)
    if (!settled) return
    const gap = { from: rescue.pushFrom ?? 0, to: rescue.pushTo ?? PUNCH_PUSH_THRESHOLD }
    const top = settled.pushers[0]
    if (top && top.best01 > (rescue.best01 ?? 0)) {
      rescue.best01 = top.best01
      rescue.bestUserId = top.userId
      rescue.bestName = pushNames.get(top.userId) ?? name
      rescue.bestDetail = 'REACHED ' + Math.round(settled.score)
    }
    // ‼️DO NOT AWARD ON THE CROSS. Owner: it stops you out before the clock.
    // Replay keeps climbing past 900 until the buzzer; settleRescue pays.
    revise()
    emit(STATE_EVENT, { machineId, coordinatorId: me, sentAt: now, startedAt: sessionStartedAt,
      snapshot: cloneSnapshot(state) } satisfies StateMessage)
  }

  function handleRescue(message: RescueMessage): void {
    if (message.machineId !== machineId) return
    remember(message)
    if (!iHost()) return
    const userId = cleanId(message.userId)
    if (!userId) return
    const now = clock()
    const rescue = state.rescue
    const rescueElapsed = rescue ? now - rescue.startsAt : -1
    if (!rescue || state.phase !== 'scoring' || rescue.winner) return
    const queued = state.queue.some(row => row.userId === userId)
    // NOTE: `tried` IS NOT A GUARD FOR THE PUSH. Every other shape gets one
    // claim per person, so a repeat is a forgery; the push is thirty presses
    // over ten seconds and the same list arrives again each time it grows.
    // Blocking a second message here would make the push a one-pulse game.
    const oncePerPerson = rescue.skill !== 'push'
    if (userId === state.active?.userId || queued || userId === PUNCH_HOUSE_BOT_ID
      || (oncePerPerson && rescue.tried.includes(userId))) return
    const name = message.name.trim() || peers.get(userId)?.participant.name || 'Player'
    if (rescue.skill === 'push') { handlePush(message, userId, name, now); return }
    // ‼️RE-SCORED HERE, FROM THE TIMES THE PLAYER SAW. `message.taps` is now only
    // the fallback for a client too old to send the list; a modern claim stands
    // or falls on `at`, run through the same function that drew the band.
    const claim = punchRescueClaim({
      skill: rescue.skill,
      taps: message.at,
      heldMs: message.heldMs,
      arrivalElapsedMs: rescueElapsed,
      bandTapsRequired: rescue.bandTapsRequired,
      band01: rescue.band01,
      windowMs: rescue.endsAt - rescue.startsAt,
    })
    // ‼️THE NEAR MISS IS RECORDED BEFORE THE SAVE IS DECIDED, and for everyone —
    // a room that fails still has a best attempt, and naming it is what turns a
    // window nobody won into a thing people understood. Owner's choice, 09-08:
    // "round ends, name the near-miss".
    if (claim.progress01 > (rescue.best01 ?? 0)) {
      rescue.best01 = claim.progress01
      rescue.bestUserId = userId
      rescue.bestName = name
      rescue.bestDetail = claim.detail
    }
    // ‼️`closest-shot` IS A CONTEST, NOT A RACE: it is settled at the end of the
    // window by comparing everyone, so a press only records a score here. Every
    // other shape is decided on arrival, first valid claim wins.
    rescue.tried.push(userId)
    if (!claim.saved) { revise(); return }
    rescue.winner = userId
    rescue.winnerName = name
    rescue.completedAt = now
    state.roundStreak = rescue.streak
    state.roundMomentum = rescue.momentum
    state.streakSaved = true
    state.streakName = rescue.winnerName.toUpperCase() + ' SAVED ' + rescue.rescuedName.toUpperCase()
    state.streakMultiplier = profile().multipliers[Math.min(rescue.momentum, profile().multipliers.length - 1)]!
    // ‼️THE SAVE IS SPENT, AND THE ROUND COUNTS IT. Without this the cap is a
    // comment: `rescueMaxPerRound` is only real if something increments.
    state.roundRescues = (state.roundRescues ?? 0) + 1
    // ‼️ONE MORE PUNCH, ABOVE THE CEILING, AND THAT IS DELIBERATE.
    //
    // A last chance is BY DEFINITION granted to somebody who has already reached
    // their limit — `rescueLastChanceOnly` opens the window on `used >= allowed`
    // — so clamping the grant to `attemptsCeiling` would hand out a save worth
    // exactly nothing. The ceiling has to bend; the question is what stops it
    // bending forever, and the answer is no longer the ceiling itself.
    //
    // It used to be. The old line raised the ceiling on EVERY save with nothing
    // counting them, so a run could be rescued indefinitely while the queue
    // waited — the "never ending" the owner hit. `roundRescues` is the bound
    // now: at most `rescueMaxPerRound` extra punches per round, checked
    // before the window ever opens. `PUNCH_ROUND_ATTEMPTS_MAX` is still the hard
    // stop, because a director who sets the cap to 5 should not be able to
    // out-vote the scene's own limit.
    //
    // From here the ordinary law takes over, which is the ending that was asked
    // for: the saved punch scores 900+ and earns another attempt like any other,
    // or it does not and the round is over. There is no second rescue, because
    // `roundRescues` has just reached the cap.
    state.attemptsAllowed = Math.min(PUNCH_ROUND_ATTEMPTS_MAX, state.attemptsAllowed + 1)
    state.attemptsCeiling = Math.max(state.attemptsCeiling, state.attemptsAllowed)
    rescue.endsAt = now + 2_200
    state.phaseEndsAt = rescue.endsAt
    creditSupport(userId, rescue.winnerName, 0, 1, 0, rescue.rescuedName, 0, rescue.rescuedUserId ?? '')
    beginSaveLegacy([{ userId, name: rescue.winnerName, share01: 1 }], rescue.rescuedName, rescue.rescuedUserId ?? '')
    state.leaderboard = state.leaderboard.map(row => row.userId === state.active?.userId && row.achievedAt === state.roundStartedAt
      ? { ...row, supporters: state.supporters?.map(entry => ({ ...entry })) } : row)
    state.profileBoards![punchProfileBoardKey(profile())] = state.leaderboard.map(row => ({ ...row }))
    revise()
    emit(STATE_EVENT, { machineId, coordinatorId: me, sentAt: now, startedAt: sessionStartedAt,
      snapshot: cloneSnapshot(state) } satisfies StateMessage)
  }

  /**
   * Tap for the two regulars standing at the machine's flanks.
   *
   * They are not a second mechanic: every beat lands in `focusPeers` through
   * the same fields a human's tap writes, so `updateFocus` bleeds them, scores
   * them, drops them when they go quiet and pays them exactly as it does
   * anybody else. All this owes them is a finger on the key.
   *
   * ‼️THEY BOTH BOOST, AND THEY ARE WORTH A QUARTER OF A PERSON EACH.
   *
   * They used to be dealt one lifting and one dragging, which meant the pair
   * netted to roughly nothing and a single human's Boost was arithmetic noise
   * between them. That is exactly the behaviour the redesign exists to delete:
   * *a single human BOOST must matter.* They are scenery with a pulse now —
   * `npc: true` marks every point they add as decorative, and the contract will
   * not let those points carry a punch across the High Ground line.
   */
  function driveFocusBots(now: number): void {
    if (!focusBots) return
    const live = !!state.active && state.phase !== 'waiting'
    if (!live) {
      // Nothing to channel for. The regulars leave the circle rather than
      // idling in it, or the roster keeps two members through the whole gap
      // between turns and the count on every HUD lies about an empty deck.
      for (const hand of focusBotHands) {
        if (hand.name) focusPeers.delete(hand.id)
        hand.name = ''
        hand.nextTapAt = 0
      }
      focusBotTurnKey = ''
      return
    }
    const turnKey = `${state.active?.userId ?? ''}:${state.roundStartedAt}`
    if (turnKey !== focusBotTurnKey) {
      focusBotTurnKey = turnKey
      const names = focusBots() ?? []
      focusBotHands.forEach((hand, index) => {
        // A NAME IS THE CLAIM. The scene hands back one per body it actually
        // has to lend, so a crowded deck with no spare NPCs simply runs the
        // turn with the people who are there.
        hand.name = names[index]?.trim() ?? ''
        hand.nextTapAt = 0
        focusPeers.delete(hand.id)
      })
    }
    const target01 = punchFocusTargetAt(focusDriftMs)
    for (const hand of focusBotHands) {
      if (!hand.name) continue
      if (now < hand.nextTapAt) continue
      const entry = focusPeers.get(hand.id)
      // Read off the coordinator's own copy, never off a level kept here: the
      // bleed and the gust are applied over there, and a hand watching its own
      // private number would tap against weather nobody else is feeling.
      const level01 = entry?.level01 ?? 0
      if (entry && level01 > punchFocusBotAim01(target01, focusDriftMs, hand.seed)) continue
      const next =
        entry ??
        { level01: 0, lastTapAt: now, name: hand.name, npc: true, multiplier: 1, karmaMs: 0, karmaSerial: -1, greenMs: 0, liveMs: 0 }
      next.npc = true
      next.name = hand.name
      next.level01 = punchFocusTap(next.level01)
      next.lastTapAt = now
      focusPeers.set(hand.id, next)
      // The same floor a person's finger is held to, so a regular can never
      // out-tap the player standing next to it.
      hand.nextTapAt = now + PUNCH_FOCUS_TAP_COOLDOWN_MS
    }
  }

  /**
   * Step the circle. Bleeds every meditator's level, drops the ones who went
   * quiet, and folds what is left into the one number that pays out.
   *
   * The MEAN is the whole social mechanic: one person's sawtooth swings a full
   * impulse either side of the target and mostly sits outside the band, while
   * four independent sawteeth average into something that barely moves. Nobody
   * has to coordinate with anybody — arithmetic does it for them.
   *
   * Deliberately does NOT call revise(): focus changes every tick, and bumping
   * the revision for it would drown out the round's own state. It rides the
   * next state heartbeat instead, which is why the local bar is predicted.
   */
  function updateFocus(now: number): void {
    // ‼️ONE TICK IS ONE TICK, HOWEVER LONG THE ROOM WAS QUIET. This step only
    // runs while somebody is on the meter, so after a lull the first tick saw
    // the whole lull as its dt — and paid Focus for it. One tap after a quiet
    // minute landed in the yellow for a frame and banked sixty seconds of
    // earnings: "I pressed E once and it filled up to 100 without me reaching
    // the zone at all" (owner, 2026-09-07). A frame is at most a quarter second.
    const dtMs = focusSteppedAt > 0 ? Math.min(250, Math.max(0, now - focusSteppedAt)) : 0
    focusSteppedAt = now
    // THE WEATHER IS SETTLED FIRST, before a single level is touched.
    //
    // It has to be: the loop below BLEEDS every meditator by `gust`, so the
    // wind must already exist when that loop runs. Advancing it here also means
    // the still point and the levels chasing it move by the same measured
    // `dtMs` on the same tick, rather than one of them stepping a frame ahead.
    focusDriftMs = punchFocusDriftAdvance(focusDriftMs, dtMs)
    const target01 = punchFocusTargetAt(focusDriftMs)
    const gust = punchFocusGustAt(focusDriftMs)
    // The venue's ring width — the Game director's spectator difficulty.
    const ringBand01 = profile().karmaRingBand01
    const karmaZone01 = punchFocusZoneHalfWidth(Math.max(1, state.focus.meditators))
    let sum = 0
    let count = 0
    let humans = 0
    let humanSum = 0
    const circle: PunchFocusMember[] = []
    /** When each member last actually pressed, for the spend rule below. */
    const tappedAt = new Map<string, number>()
    for (const [userId, entry] of focusPeers) {
      if (now - entry.lastTapAt > PUNCH_FOCUS_IDLE_MS) {
        focusPeers.delete(userId)
        continue
      }
      entry.level01 = punchFocusDecay(entry.level01, dtMs, gust)
      // You cannot Boost yourself. The player holding the bag is excluded from
      // the average rather than dropped, so stepping up to punch does not also
      // cost you the circle you were in.
      if (state.active && userId === state.active.userId) continue
      // ‼️THE RING IS MEASURED PER PERSON, ON THEIR OWN LEVEL, and it is stepped
      // HERE rather than in the payout loop below because it has to be advanced
      // for everybody the tick touches, whether or not they end up paying.
      //
      // The run belongs to ONE attempt. Carrying it across `state.serial` would
      // let a spectator bank a multiplier during a lull and spend it on a punch
      // they never worked for — the same trap the boost ledger's serial clear
      // exists to close, one mechanic further along.
      if (entry.karmaSerial !== state.serial) {
        entry.karmaSerial = state.serial
        entry.karmaMs = 0
        entry.greenMs = 0
        entry.liveMs = 0
      }
      const karma01 = punchFocusKarma01(entry.level01, target01, ringBand01)
      // ‼️A tap does not end the run. It used to: falling out of the ring zeroed
      // the clock, and since every tap is an overshoot the clock never got past
      // one cycle — measured 2026-09-05, a perfect player banked nothing. The
      // run now pauses outside the ring and resets only on leaving the yellow
      // zone, the same rule `focusStreakMs` has always used. The zone is read at
      // LAST tick's headcount because this tick's is still being counted.
      entry.karmaMs = punchKarmaRunMs(
        entry.karmaMs,
        dtMs,
        karma01,
        Math.abs(entry.level01 - target01) <= karmaZone01
      )
      entry.multiplier = punchBoostKarmaMultiplier(entry.karmaMs)
      sum += entry.level01
      count += 1
      if (!entry.npc) {
        humans += 1
        humanSum += entry.level01
      }
      tappedAt.set(userId, entry.lastTapAt)
      circle.push({
        userId,
        name: entry.name || peers.get(userId)?.participant.name || 'Player',
        level01: entry.level01,
        quality01: 0,
        points: 0,
        multiplier: entry.multiplier,
        karma01,
        karmaMs: entry.karmaMs,
        npc: entry.npc,
        circleScore: 0
      })
    }
    // ‼️THE REGULARS CHEER; THEY DO NOT PAD. Owner, 2026-09-06: the observer
    // game was "easy and boring" — because the two NPC channellers counted as
    // meditators, a lone human was already playing at a three-person band
    // (0.165, 2.2× solo) against a mean the bots held steady for them. With a
    // human in the circle the band, the zone and the mean are the HUMANS'; the
    // bots stay in the roster, keep their balloons and their capped points,
    // and only carry the circle when nobody else is in it.
    const bandCount = humans > 0 ? humans : count
    const chase = dtMs > 0 ? Math.min(1, (dtMs / 1000) * PUNCH_FOCUS_SMOOTHING_PER_S) : 1
    const mean = humans > 0 ? humanSum / humans : count > 0 ? sum / count : 0
    const level = count > 0 ? focusSmoothed01 + (mean - focusSmoothed01) * chase : 0
    focusSmoothed01 = level
    const quality01 = punchFocusQuality01(level, bandCount, target01)
    // THE STREAK, and the reset is deliberately generous about the green and
    // strict about the ring. A lone sawtooth crosses the green edge on every
    // cycle by construction, so resetting on that would zero the streak for
    // exactly the players it exists to reward; falling out of the RING is the
    // lapse that costs it. An empty circle carries nothing forward — a streak
    // has to be held by somebody.
    if (count <= 0 || quality01 <= 0) focusStreakMs = 0
    else focusStreakMs += dtMs
    const streak = punchFocusStreakMultiplier(focusStreakMs)
    // ‼️PER PERSON, NEVER A SHARE OF ONE POT.
    //
    // Each member is scored against the SAME band their own crowd is aiming at,
    // and then turned into POINTS on their own — so the line beside a name on
    // the result card is that person's own work, and recruiting somebody else
    // adds to the punch instead of diluting what you already gave it.
    let boostPoints = 0
    let humanBoostPoints = 0
    // ‼️THE SWITCH THAT USED TO BE A HARDWIRED ZERO. Off, this is the game of
    // 2026-09-06 — owner: "they never help the current competitor" — the meter
    // pays FOCUS to the tapper for their own next turn and nothing reaches the
    // puncher. On, a held beat is banked per person and ADDED to the punch,
    // which is the only way `PUNCH_HIGH_GROUND_THRESHOLD` is ever met. Read
    // once per tick so a director flipping it mid-round cannot split a single
    // circle between two rules.
    const boostLive = punchBoostLive(profile())
    const windingUp = state.phase === 'ready' || state.phase === 'charging'
    for (const member of circle) {
      member.quality01 = punchFocusQuality01(member.level01, bandCount, target01)
      member.points = boostLive
        ? punchBoostPoints(
            member.quality01,
            streak,
            member.multiplier,
            member.npc
          )
        : 0
      // The live totals the meter draws. A PREDICTION, deliberately — the punch
      // is paid from the committed ledger below, which is allowed to differ
      // from whatever the circle happens to be holding this frame.
      boostPoints += member.points
      if (!member.npc) humanBoostPoints += member.points
      const entry = focusPeers.get(member.userId)
      if (entry && !member.npc) {
        if (windingUp) {
          entry.liveMs += dtMs
          if (member.quality01 >= 0.999) entry.greenMs += dtMs
        }
        member.circleScore = punchCircleScore(entry.greenMs, entry.liveMs, entry.karmaMs)
        // ‼️THROUGH THE WHOLE TURN, NOT THE WIND-UP. `windingUp` gated this
        // to the few seconds the puncher spends in ready/charging, which is
        // why an hour of good tapping banked "2 out of 100" (owner,
        // 2026-09-07). The green still has to be held — a level that is not
        // being pumped decays to zero and pays zero — but it pays whenever it
        // is held, for as long as somebody else has the bag.
        if (prepQueued(member.userId)) {
          const row = prepFor(member.userId, member.name)
          const gained = punchFocusEarned(dtMs, member.quality01, member.karma01, Math.abs(member.level01 - target01) <= karmaZone01)
          if (gained > 0 && row.focus < PUNCH_PREP_FOCUS_MAX) row.focus = Math.min(PUNCH_PREP_FOCUS_MAX, row.focus + gained)
        }
      }
    }
    circle.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    // THE COMMITTED LEDGER. Keep the best each person has reached during this
    // attempt — see `boostLedger`. A Boost already given is not taken back by
    // walking away, lapsing for a beat, or falling off the island.
    //
    // ‼️BANKED THROUGH THE WHOLE WIND-UP, not just the charge. The charge is
    // under two seconds; the crowd works the beat for the whole time somebody
    // is standing at the bag, and a spectator who Boosts and then walks off has
    // to be on the card for the punch they paid into. That is the owner's rule.
    //
    // ‼️AND A BOOST IS SPENT WHEN IT PAYS. `boostSpentAt` is stamped by the
    // punch that consumed the ledger, and nobody re-enters it without TAPPING
    // AGAIN afterwards. Without that, the moment a reveal ended the last
    // crowd's still-warm meters were banked a second time and a spectator who
    // had stopped playing kept paying into every punch that followed.
    const banking = state.phase === 'ready' || state.phase === 'charging'
    // ‼️EMPTIED ON THE SERIAL, NOT ON THE PHASE. Gating this behind `banking`
    // meant a punch thrown before any ready/charging tick had run still read the
    // PREVIOUS punch's ledger — the crowd from one swing paid for the next one.
    // The serial names the attempt, so the moment it moves the ledger is stale.
    if (boostLedgerSerial !== state.serial) {
      boostLedger.clear()
      karmaLedger.clear()
      boostLedgerSerial = state.serial
    }
    for (const member of banking ? circle : []) {
      if ((tappedAt.get(member.userId) ?? 0) <= boostSpentAt) continue
      // ‼️RING-TIME IS BANKED ON ITS OWN HIGH-WATER MARK, beside the points and
      // not inside them. The two peak at different moments — points ride the
      // crowd's shared streak, ring-time is yours alone — and filing karma under
      // the points ledger would credit whatever ring-time happened to coincide
      // with your best-paying frame rather than your best-held one.
      //
      // ‼️AND ON ITS OWN SWITCH. This used to sit below `if (member.points <= 0)
      // continue`, which silently tied karma to Crowd Boost: with Boost off
      // every member's points are zero, so nobody banked a millisecond and the
      // entire "boost well, punch harder" loop was dead alongside it. They are
      // different trades and they get different gates — karma never touches the
      // current puncher's score, so it is allowed to pay while Boost does not.
      karmaLedger.set(member.userId, {
        ms: Math.max(karmaLedger.get(member.userId)?.ms ?? 0, member.npc ? 0 : member.karmaMs),
        name: member.name
      })
      if (member.points <= 0) continue
      const held = boostLedger.get(member.userId)
      if (held && held.points >= member.points) {
        // The NAME still refreshes: a spectator whose display name arrived on a
        // later packet should not be filed under the placeholder forever.
        held.name = member.name
        // The circle score only ever climbs through a wind-up, so its high-water
        // mark is simply the latest reading.
        held.circleScore = Math.max(held.circleScore ?? 0, member.circleScore)
        continue
      }
      boostLedger.set(member.userId, {
        userId: member.userId,
        name: member.name,
        points: member.points,
        quality01: member.quality01,
        multiplier: member.multiplier,
        npc: member.npc,
        circleScore: Math.max(held?.circleScore ?? 0, member.circleScore)
      })
    }
    state.focus = {
      meditators: count,
      level01: level,
      band01: punchFocusBandHalfWidth(bandCount),
      zone01: punchFocusZoneHalfWidth(bandCount),
      quality01,
      target01,
      driftMs: focusDriftMs,
      gust,
      streakMs: focusStreakMs,
      streak,
      boostPoints,
      humanBoostPoints,
      // The live prediction of the puncher's window, off the SAME function the
      // score will use at contact — fed the live circle instead of the ledger.
      assist01: punchCrowdAssist01(circle),
      humans,
      circle: circle.slice(0, PUNCH_FOCUS_CIRCLE_MAX)
    }
  }

  /** Keep exactly one house bot in the rotation — never two, never none. */
  function ensureHouseBot(now: number): void {
    const humanInPlay =
      (state.active && state.active.userId !== PUNCH_HOUSE_BOT_ID) ||
      state.queue.some((entry) => entry.userId !== PUNCH_HOUSE_BOT_ID)
    // Spectators — including a second Explorer on the same wallet — are not
    // players. Pulling the bot because two people are merely IN THE WORLD is
    // how the island went dead after everybody left the queue: one punch, then
    // the regular froze at the bag and nobody else ever walked up.
    if (humanInPlay) {
      const before = state.queue.length
      state.queue = state.queue.filter(entry => entry.userId !== PUNCH_HOUSE_BOT_ID)
      if (state.queue.length !== before) revise()
      return
    }
    if (!houseBot) return
    if (
      state.active?.userId === PUNCH_HOUSE_BOT_ID ||
      state.queue.some((entry) => entry.userId === PUNCH_HOUSE_BOT_ID)
    ) {
      return
    }
    const name = houseBot()
    if (!name) return
    state.queue.push({ userId: PUNCH_HOUSE_BOT_ID, name, joinedAt: now })
    if (!state.active && state.phase === 'waiting') nextPlayer(now)
    else revise()
  }

  /**
   * Play the bot's turn. It sizes the bag up for a beat, charges, and lets go
   * somewhere either side of the ideal hold — so it lands a spread of scores
   * rather than the same one every round, and can be beaten.
   */
  function driveHouseBot(now: number): void {
    if (state.active?.userId !== PUNCH_HOUSE_BOT_ID) {
      botChargeAt = 0
      botReleaseAt = 0
      return
    }
    if (state.phase === 'ready') {
      if (botChargeAt === 0) botChargeAt = now + 1_400 + dice() * 1_800
      if (now < botChargeAt) return
      botChargeAt = 0
      state.phase = 'charging'
      state.chargeStartedAt = now
      state.chargeAccuracy01 = 0.55 + dice() * 0.4
      // The TURN clock, not a charge clock — see `handleAction` below.
      state.phaseEndsAt = now + config.turnTimeoutMs
      botReleaseAt = now + config.idealChargeMs * (0.72 + dice() * 0.62)
      revise()
      return
    }
    if (state.phase === 'charging' && botReleaseAt > 0 && now >= botReleaseAt) {
      botReleaseAt = 0
      const heldMs = Math.max(0, now - state.chargeStartedAt)
      scorePunch(
        PUNCH_HOUSE_BOT_ID,
        heldMs,
        punchAttemptMarker01(heldMs, state.attemptsUsed + 1, state.chargeStartedAt, config.idealChargeMs, profile()),
        state.chargeAccuracy01,
        now
      )
    }
  }

  function handleQueue(message: QueueMessage): void {
    if (message.machineId !== machineId) return
    remember(message)
    if (!iHost()) return
    const userId = cleanId(message.userId)
    // Same window, one line per decision the host makes about a seat. See the
    // note in `remember`.
    if (me === serverId && authority === 'server') {
      console.log(`[SERVER] queue ${message.action} ${userId} (${message.intent ?? 'auto'})`)
    }
    if (message.action === 'leave') {
      state.queue = state.queue.filter((entry) => entry.userId !== userId)
      // Leaving is one decision whichever line you were standing in.
      if (state.ring) state.ring = state.ring.filter((entry) => entry.userId !== userId)
      // A leave from the QUEUE frees a seat here and now. A leave from the bag
      // does not — the leaver is still `state.active` at this point — and that
      // seat is dealt by `nextPlayer` a few lines below instead.
      promoteFromRing()
      // ‼️A LEAVE IS A DECISION; THE GRACE IS FOR ACCIDENTS. The 60 s grace
      // exists for a fall, a cloud, a knock-back — absences, handled by
      // sweepPrep. This message is the button. Pressing LEAVE QUEUE and still
      // reading FOCUS STORED 100 a minute later (owner, 2026-09-07) is not
      // protection, it is a meter that ignores you.
      //
      // Only the BUTTON says 'player'. Stepping out of range also sends a leave,
      // and that one keeps the grace it always had.
      const held = state.prep.find((entry) => entry.userId === userId)
      if (held && message.intent === 'player') { held.focus = 0; held.momentumReady = false }
      if (held && held.leftQueueAt === 0) held.leftQueueAt = clock()
      // ‼️ONLY THE BUTTON ENDS A LIVE ROUND. A 'player' leave is a decision and
      // is honoured on the spot. An 'auto' leave is the client's PROXIMITY READ
      // and it is a guess — it fires on a hitch, a jump, a knock-back or a
      // celebration the game itself threw — so ending an active round on one
      // is how a run that was still going "just ended" with nothing said. The
      // client now sits on that read for three seconds before it sends
      // (`PUNCH_AWAY_GRACE_MS`); here it costs the CLOCK, not the round:
      // whoever really walked off loses the bag in five seconds, and whoever is
      // still standing there punches and keeps everything they built.
      if (state.active?.userId === userId && (state.phase === 'ready' || state.phase === 'charging')) {
        if (message.intent === 'player') finishTurn(clock())
        else {
          const soon = clock() + 5_000
          if (state.phaseEndsAt === 0 || state.phaseEndsAt > soon) state.phaseEndsAt = soon
          revise()
        }
      } else {
        revise()
      }
      return
    }
    if (message.intent === 'player') noShows.delete(userId)
    else if (noShows.has(userId)) return
    if (state.active?.userId === userId || state.queue.some((entry) => entry.userId === userId)) return
    // ‼️THE DOOR, AND IT IS THE ONLY LIMIT IN THE GAME. Four people share the
    // bag; the fifth stays a spectator until a seat comes free. Enforced here on
    // the coordinator, because this is the one place every join -- walked-in,
    // asked-for, or re-asserted a second later by a client that is already in
    // the line -- has to pass through.
    if (!punchQueueHasRoom(humansInPlay())) {
      // ‼️A REFUSAL IS A PLACE NOW, NOT A BARE `return`. The fifth person's join
      // used to leave their client, die on this line, and send nothing back —
      // so their button went on saying they were in while the bag never came.
      // They stand in the ring instead, in arrival order, and `promoteFromRing`
      // deals them the next seat that frees.
      if (!inRing(userId) && punchRingHasRoom(state.ring?.length ?? 0)) {
        if (!state.ring) state.ring = []
        state.ring.push({ ...participant(userId, message.name, message.sentAt), profileId: PUNCH_PROFILE_IDS.includes(message.profileId!) ? message.profileId : authoredProfile.id })
        // Entering the ring stops the Focus grace exactly as entering the queue
        // does: they are in the competition, so nothing they stored is decaying.
        { const held = state.prep.find((entry) => entry.userId === userId); if (held) held.leftQueueAt = 0 }
        revise()
      }
      return
    }
    { const held = state.prep.find((entry) => entry.userId === userId); if (held) held.leftQueueAt = 0 }
    state.queue.push({ ...participant(userId, message.name, message.sentAt), profileId: PUNCH_PROFILE_IDS.includes(message.profileId!) ? message.profileId : authoredProfile.id })
    if (!state.active && state.phase === 'waiting') nextPlayer(clock())
    else revise()
  }

  function handleAction(message: PunchMessage): void {
    if (message.machineId !== machineId) return
    remember(message)
    if (!iHost() || state.active?.userId !== cleanId(message.userId)) return
    const now = clock()
    if (message.action === 'start' && state.phase === 'ready') {
      state.phase = 'charging'
      state.chargeStartedAt = now
      state.chargeAccuracy01 = Math.max(0, Math.min(1, Number(message.accuracy01) || 0))
      // ‼️THE TURN CLOCK, NOT A CHARGE CLOCK. This used to be `idealChargeMs * 2`
      // and the expiry below threw the punch for the player — the auto-punch the
      // owner reported on 2026-09-04. Holding is allowed for as long as the turn
      // lasts now; `punchPowerQuality01` and `punchHoldSpeed` are what make it a
      // bad idea. The only clock left is the one that stops a player who has
      // walked away from owning the machine, which is what it was always for.
      state.phaseEndsAt = now + config.turnTimeoutMs
      revise()
      if (iHost()) broadcastState(now)
      return
    }
    if (message.action === 'release' && state.phase === 'charging') {
      // Clamped to the TURN, not to twice ideal: a long hold is now a legal
      // (and punished) play, so clipping it here would quietly hand a camper
      // back the full power the bleed just took off them.
      const measured = Math.max(
        0,
        Math.min(config.turnTimeoutMs, Number(message.heldMs) || now - state.chargeStartedAt)
      )
      scorePunch(
        message.userId,
        measured,
        Number.isFinite(message.timingMarker01)
          ? Number(message.timingMarker01)
          : punchAttemptMarker01(measured, state.attemptsUsed + 1, state.chargeStartedAt, config.idealChargeMs, profile()),
        Number.isFinite(message.accuracy01) ? Number(message.accuracy01) : state.chargeAccuracy01,
        now,
        message.stancePower
      )
      if (iHost()) broadcastState(now)
    }
  }

  bus.on(HELLO_EVENT, (message: HelloMessage) => {
    if (message?.machineId === machineId) remember(message)
  })
  bus.on(QUEUE_EVENT, (message: QueueMessage) => handleQueue(message))
  bus.on(ACTION_EVENT, (message: PunchMessage) => handleAction(message))
  bus.on(RESCUE_EVENT, (message: RescueMessage) => handleRescue(message))
  bus.on(FOCUS_EVENT, (message: FocusMessage) => handleFocus(message))
  bus.on(ADMIN_EVENT, (message: AdminMessage) => handleAdmin(message))
  bus.on(STATE_EVENT, (message: StateMessage) => {
    if (message?.machineId !== machineId || !message.snapshot) return
    // Arrival, on OUR clock: a stale snapshot carries a convincing sentAt.
    lastStateSeenAt = clock()
    remember({ userId: message.coordinatorId, name: message.coordinatorId, startedAt: message.startedAt })
    // ‼️A SERVER THAT SPEAKS LATE STILL WINS. The first person into an empty
    // world is the one who wakes the server, and its cold start can outlast
    // PUNCH_SERVER_ADOPT_MS — so that client gives up, becomes its own
    // coordinator, and then the server's first snapshot lands HERE. Without
    // this block the old election ran on it: this session is older than the
    // server's, so it elected itself and threw every server snapshot away, for
    // the rest of the session. Measured 2026-09-09 22:34: desktop entered
    // first → "NO SERVER ANSWERED", phone entered second → "HOUSE · SERVER",
    // same world, same server, two games. An orphan's game is solo by
    // definition, so there is nothing to fork by dropping it.
    if (builtForServer && degradedToCoordinator && cleanId(message.coordinatorId) === serverId) {
      degradedToCoordinator = false
      authority = 'server'
      coordinatorId = serverId
      hosting = false
      console.log('[punch] Multiplayer Server answered after the adopt window; adopting it.')
      state = cloneSnapshot(message.snapshot)
      notify()
      return
    }
    const incomingSession = typeof message.sessionId === 'string' ? message.sessionId : ''
    // Same wallet, two Explorers: the older session hosts. A younger private
    // game — higher revision and all — must not overwrite the live one
    // (HIGHGROUND: phone still in flight after a republish, desktop already in).
    if (incomingSession && incomingSession !== mySessionId && cleanId(message.coordinatorId) === me) {
      if (Number(message.startedAt) > sessionStartedAt) return
      hosting = false
      lastSiblingHostAt = clock()
      coordinatorId = me
      state = cloneSnapshot(message.snapshot)
      notify()
      return
    }
    coordinatorId = electCoordinator()
    if (cleanId(message.coordinatorId) !== coordinatorId) return
    if (message.snapshot.revision < state.revision) return
    state = cloneSnapshot(message.snapshot)
    hosting = coordinatorId === me && (!incomingSession || incomingSession === mySessionId)
    notify()
  })

  function emit<T extends object>(event: string, payload: T): void {
    try {
      bus.emit(event, payload as never)
    } catch (error) {
      console.log('[punch-machine] message send failed; local coordinator state remains available', error)
    }
  }

  function hello(now: number): HelloMessage {
    return { machineId, userId: me, name: myName, sentAt: now, startedAt: sessionStartedAt, sessionId: mySessionId }
  }

  function sendQueue(action: QueueMessage['action'], intent: 'auto' | 'player' = 'auto', profileId?: PunchProfileId): void {
    const message: QueueMessage = { ...hello(clock()), action, intent, profileId }
    remember(message)
    handleQueue(message)
    emit(QUEUE_EVENT, message)
  }

  function sendAction(
    action: PunchMessage['action'],
    heldMs?: number,
    timingMarker01?: number,
    accuracy01?: number,
    stancePower?: number
  ): void {
    const message: PunchMessage = { ...hello(clock()), action, heldMs, timingMarker01, accuracy01, stancePower }
    remember(message)
    handleAction(message)
    emit(ACTION_EVENT, message)
  }

  function sendFocus(action: FocusMessage['action']): void {
    const message: FocusMessage = { ...hello(clock()), action }
    remember(message)
    handleFocus(message)
    emit(FOCUS_EVENT, message)
  }

  function sendAdmin(action: AdminMessage['action']): void {
    const message: AdminMessage = { ...hello(clock()), action }
    remember(message)
    handleAdmin(message)
    emit(ADMIN_EVENT, message)
  }

  function sendRescue(taps: number, at?: number[], heldMs?: number): void {
    const message: RescueMessage = { ...hello(clock()), action: 'tap', taps: Math.max(0, Math.round(taps)),
      // Bounded before it leaves: a window this long cannot hold more presses
      // than the debounce allows, so a longer list is a bug or a forgery either
      // way, and truncating here keeps the wire small without a second rule.
      at: at?.slice(0, 64).map(ms => Math.round(ms)), heldMs: heldMs === undefined ? undefined : Math.round(heldMs) }
    remember(message)
    handleRescue(message)
    emit(RESCUE_EVENT, message)
  }

  function roomIsDeadWire(room?: PunchRoomHint): boolean {
    return !!room && room.connected === true && !room.ready && !room.synced && room.framesIn === 0
  }

  function tick(now: number, room?: PunchRoomHint): void {
    adoptDeadlineMs = roomIsDeadWire(room) ? PUNCH_ROOM_DEAD_MS : PUNCH_SERVER_ADOPT_MS
    // Give up ONCE on a house that never arrived. Waiting forever is a dead
    // cabinet (HIGHGROUND 2026-09-10: WAKING THE HOUSE UP, score 000, no
    // queue). A room that is connected but never ready is a dead wire, not a
    // slow boot — give up on that sooner. A late snapshot still wins.
    if (
      authority === 'server' && !degradedToCoordinator && me !== serverId &&
      lastStateSeenAt === 0 && now - sessionStartedAt > adoptDeadlineMs
    ) {
      degradedToCoordinator = true
      authority = 'coordinator'
      console.error('[punch] no Multiplayer Server answered; falling back to the serverless coordinator.')
    }
    remember({ userId: me, name: myName, startedAt: sessionStartedAt }, now)
    if (now - lastHelloAt >= HELLO_HEARTBEAT_MS) {
      lastHelloAt = now
      emit(HELLO_EVENT, hello(now))
    }
    for (const [userId, peer] of peers) {
      if (now - peer.receivedAt > PEER_TIMEOUT_MS) peers.delete(userId)
    }
    const elected = electCoordinator()
    if (elected === me && (lastSiblingHostAt === 0 || now - lastSiblingHostAt > PEER_TIMEOUT_MS)) {
      if (!hosting) {
        hosting = true
        coordinatorId = me
        revise()
      }
    }
    if (elected !== coordinatorId) {
      coordinatorId = elected
      state.coordinatorId = elected
      if (iHost()) revise()
    }
    if (!iHost()) return

    const live = new Set([...peers.keys(), me])
    // The house bot has no peer heartbeat — it is always live, or the liveness
    // sweep would evict it the moment it was seeded.
    const isLive = (userId: string): boolean => userId === PUNCH_HOUSE_BOT_ID || live.has(userId)
    // The ring is swept on the same heartbeat as the queue: somebody who walked
    // off the island holds a place in line until they do not.
    if ((state.ring?.length ?? 0) > 0) {
      const nextRing = state.ring!.filter((entry) => isLive(entry.userId))
      if (nextRing.length !== state.ring!.length) {
        state.ring = nextRing
        revise()
      }
    }
    const nextQueue = state.queue.filter((entry) => isLive(entry.userId))
    if (nextQueue.length !== state.queue.length) {
      state.queue = nextQueue
      revise()
    }
    // A seat may have just come free with the dead. The ring is what fills it.
    if (promoteFromRing()) revise()
    // Before the bot swings: its punch reads state.focus too, so the circle has
    // to be stepped first or the crowd's work would land one tick late.
    // The flanks tap FIRST, so a beat they land this tick is in the average
    // this tick pays out rather than trailing the humans by a frame.
    //
    // ‼️THREE CALLS, ONE FLAG, AND THE ORDER IS NOT NEGOTIABLE. `sweepPrep`
    // expires rows, `driveFocusBots` lands the regulars' beats and `updateFocus`
    // banks what everybody earned this tick — all three were simply deleted from
    // the tick in `0f094b96`, leaving their definitions in the file as dead
    // code. They are back behind the director's switch: with Focus off the
    // coordinator does not simulate a meter, does not bank a point and does not
    // put one on the wire, which is exactly the game that shipped tonight.
    if (profile().focusEnabled) {
      sweepPrep(now)
      driveFocusBots(now)
      updateFocus(now)
    }
    ensureHouseBot(now)
    driveHouseBot(now)
    if (state.active && !isLive(state.active.userId)) finishTurn(now)
    // THE CLOCK IS THE CLOCK. It runs out and the bag changes hands, there and
    // then. A second countdown behind a red warning was tried and it only made
    // the wait longer for everyone in the line: the machine spent forty seconds
    // on somebody who was not playing. One clock, one turn.
    else if (state.phase === 'ready' && state.phaseEndsAt > 0 && now >= state.phaseEndsAt)
      finishTurn(now)
    else if (state.phase === 'charging' && state.phaseEndsAt > 0 && now >= state.phaseEndsAt) {
      // The turn ran out with a fist still on the bag. It resolves at the time
      // ACTUALLY held — twenty seconds of overhold, which the bleed has already
      // reduced to the floor — rather than at a fabricated `ideal * 2` the
      // player never chose. Nobody is punched early; somebody who never let go
      // simply gets the punch their hold earned.
      const heldMs = Math.max(0, now - state.chargeStartedAt)
      scorePunch(
        state.active?.userId ?? '',
        heldMs,
        punchAttemptMarker01(heldMs, state.attemptsUsed + 1, state.chargeStartedAt, config.idealChargeMs, profile()),
        state.chargeAccuracy01,
        now
      )
    } else if (state.phase === 'scoring' && now >= state.phaseEndsAt) {
      settleRescue(now)
      state.phase = 'cooldown'
      state.phaseEndsAt = now + (state.rescue?.skill === 'push'
        ? PUNCH_PUSH_REVIEW_MS
        : punchReloadMs(state.score, state.roundStreak))
      revise()
    } else if (state.phase === 'cooldown' && now >= state.phaseEndsAt) {
      // A turn is a ROUND, not a punch: hand the bag back until the round's
      // attempts are spent, then hold the total up before the queue moves on.
      if (state.active && state.attemptsUsed < state.attemptsAllowed) {
        state.phase = 'ready'
        state.attemptReadyAt = now
        state.phaseEndsAt = now + config.turnTimeoutMs
        state.score = 0
        state.attempt = null
        // The RUNG the last punch reached clears with the score it belonged to,
        // for the same reason: both describe a punch that is over. `roundStreak`
        // and `roundStreakBonus` are round state and stay — losing a streak has
        // to cost the next rung, never the rungs already climbed.
        state.streakBonus = 0
        state.streakName = ''
        state.chargeStartedAt = 0
        state.chargeAccuracy01 = 0
        revise()
      } else {
        state.phase = 'summary'
        state.phaseEndsAt = now + PUNCH_ROUND_SUMMARY_MS
        revise()
      }
    }     else if (state.phase === 'summary' && now >= state.phaseEndsAt) finishTurn(now)

    // Live quality on each helper has to move between taps — a bar that only
    // updates on a press would freeze gold after they left the green.
    if (
      state.rescue?.skill === 'push' &&
      !state.rescue.winner &&
      now >= state.rescue.startsAt &&
      now <= state.rescue.endsAt
    ) {
      replayPush(now)
    }

    if (now - lastStateAt >= STATE_HEARTBEAT_MS) {
      broadcastState(now)
    }
  }

  return {
    snapshot: () => cloneSnapshot(state),
    sessionId: () => mySessionId,
    isCoordinator: () => iHost(),
    serverAlive: (now: number) => {
      if (authority !== 'server') return true
      if (me === serverId) return true
      return lastStateSeenAt > 0 && now - lastStateSeenAt < PUNCH_SERVER_SILENCE_MS
    },
    authorityMode: () => (degradedToCoordinator ? 'orphan' : authority),
    houseWaitLeftMs: (now: number) => {
      if (authority !== 'server' || degradedToCoordinator) return 0
      return Math.max(0, adoptDeadlineMs - (now - sessionStartedAt))
    },
    joinQueue: (intent, profileId) => sendQueue('join', intent ?? 'auto', profileId),
    leaveQueue: (intent) => sendQueue('leave', intent ?? 'auto'),
    startCharge: (accuracy01) => sendAction('start', undefined, undefined, accuracy01),
    releasePunch: (heldMs, timingMarker01, accuracy01, stancePower) => sendAction('release', heldMs, timingMarker01, accuracy01, stancePower),
    rescueTap: (taps, at, heldMs) => sendRescue(taps, at, heldMs),
    focusTap: () => sendFocus('tap'),
    focusStop: () => sendFocus('stop'),
    prepMomentum: () => sendFocus('momentum'),
    armRescue: (on) => sendAdmin(on ? 'arm-rescue' : 'disarm-rescue'),
    tick,
    onChange: (listener) => listeners.add(listener)
  }
}
