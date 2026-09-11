/**
 * Scrap boxing — pure engine, no SDK.
 *
 * THE GAME IS FILL + RELEASE. Every opponent fights to a PATTERN: a short,
 * seeded loop of beats — guard, a tell, a jab, a cross, and one OPENING.
 * Holding an attack automatically builds alignment and power in one visible
 * square; release when the opening and fully lit MAX coincide.
 *
 * One square, only while you are in punch range:
 *   Dim outline + bottom fill = keep holding.
 *   Amber = opening near; gold = opening live; green MAX = ideal release.
 *   During defense the square disappears and the required glove edge glows.
 *
 * Uppercut / hook needs proximity — too far and it whiffs hard.
 *
 * Nothing here is a dice roll: same seed, same pattern, same inputs, same
 * result. Six readable rhythms prevent one memorized loop from solving every
 * opponent while keeping each individual rival fair.
 *
 * Feet stay free. Walk in close for the hook activator.
 */

import { scrapMove, scrapMoveInRange, type ScrapMoveKind } from "./scrap-moves";

export type ScrapMechanic = "aim" | "cue";

export const SCRAP_FIGHT_MAX_MS = 60_000;
/** Your hit points. Theirs come from the skill tuning (soft / mid / boss). */
export const SCRAP_FIGHT_YOUR_HP = 8;
/** Full-charge hit in the RED. Tap charge deals a fraction of this. */
export const SCRAP_FIGHT_TURBO_DAMAGE = 2;
/** Full-charge hit in the ORANGE shoulders. */
export const SCRAP_FIGHT_CLOSE_DAMAGE = 0.8;
export const SCRAP_FIGHT_PUNCH_COOLDOWN_MS = 260;
/**
 * Hold-to-charge. Tap ≈ SCRAP_CHARGE_MIN power and fires on release; holding
 * pulses through MAX so the player must synchronize power and target overlap.
 */
/** First peak of the power pulse. */
export const SCRAP_CHARGE_FULL_MS = 1100;
/** One complete low → MAX → low power cycle. */
export const SCRAP_CHARGE_CYCLE_MS = SCRAP_CHARGE_FULL_MS * 2;
/** Two readable pulses, then fatigue forces the strike. */
export const SCRAP_CHARGE_MAX_HOLD_MS = 4100;
/** Floor power on a quick tap — still a real punch, just short. */
export const SCRAP_CHARGE_MIN = 0.28;
/** Holds at or under this are treated as taps (min charge). */
export const SCRAP_CHARGE_TAP_MS = 90;
export const SCRAP_STAMINA_MAX = 100;
export const SCRAP_STAMINA_REGEN_PER_SEC = 17;
export const SCRAP_GUARD_DRAIN_PER_SEC = 21;
export const SCRAP_DOUBLE_GUARD_DRAIN_PER_SEC = 34;
export const SCRAP_GUARD_MIN_STAMINA = 5;
export const SCRAP_GUARD_CHIP_FRACTION = 0.12;
export const SCRAP_DOUBLE_GUARD_CHIP_FRACTION = 0.2;
export const SCRAP_PERFECT_GUARD_MS = 450;
/**
 * THE PRICE OF TURTLING. A full two-handed guard stops every straight they
 * throw, so left alone it is a free answer to the whole pattern. It is not:
 * hold it this long inside uppercut range and they read it and come UP THE
 * MIDDLE. The uppercut ignores the guard entirely — the only outs are dropping
 * to a single hand, dodging, or stepping out of reach before it lands.
 */
export const SCRAP_TURTLE_UPPER_AFTER_MS = 1500;
/** Visible warning before it arrives. Long enough to react, short enough to hurt. */
export const SCRAP_TURTLE_UPPER_TELL_MS = 520;
/** They cannot chain them — this is a punish, not a second rhythm. */
export const SCRAP_TURTLE_UPPER_COOLDOWN_MS = 2800;
/** Stamina it knocks out of you on top of the damage. */
export const SCRAP_TURTLE_UPPER_STAMINA = 12;
export const SCRAP_COUNTER_WINDOW_MS = 620;
/** A white click leaves you open: their next swing cannot be dodged for this long. */
export const SCRAP_FIGHT_EXPOSED_MS = 800;
/** Tap a dodge and you are leaning aside for this long. */
export const SCRAP_DODGE_MS = 520;
export const SCRAP_DODGE_COOLDOWN_MS = 380;
/** Their swing connects this far into the swing beat (the clip's contact frame). */
export const SCRAP_SWING_CONTACT = 0.7;
/** ORANGE shoulders either side of the opening, at speed 1. */
export const SCRAP_OPEN_SHOULDER_MS = 380;
/** Grace before their first beat so you can find them and read the marker. */
export const SCRAP_FIGHT_FIRST_BEAT_MS = 2000;
/**
 * How far through their incoming aim (0 at wind-up, 1 at contact) before the
 * hit is locked. Dodge before this or you eat it.
 */
export const SCRAP_LOCK_SETTLE = 0.4;
/** Legacy export — the stance reader in the view still uses it for "planted". */
export const SCRAP_STILL_SPEED = 0.12;
/** Hold ALIGN this long to pull a full shape match (0 → 1). */
export const SCRAP_ALIGN_FULL_MS = 400;
/** Align decays this much per second when ALIGN is released. */
export const SCRAP_ALIGN_DECAY_PER_SEC = 1.35;
/**
 * Small square sits inside their square. 0.72 was tighter than that look, so
 * a contained stack still scored the weak "CLOSE" callout.
 */
export const SCRAP_ALIGN_MATCH = 0.58;
/** Squares overlapping at all (edges touching). */
export const SCRAP_ALIGN_GLANCE = 0.22;
/** Horizontal metres — uppercut / hook only lands inside this gap. */
export const SCRAP_HOOK_RANGE_M = 2.35;
/**
 * Bang both gloves together (Space). Instant MAX power for the next punch,
 * not a free turbo every swing: stamina, a short open window, and a cooldown.
 */
export const SCRAP_HYPE_CLAP_MS = 420;
export const SCRAP_HYPE_COOLDOWN_MS = 8000;
export const SCRAP_HYPE_STAMINA = 18;
/** Banked MAX expires if you do not throw. */
export const SCRAP_HYPE_POWER_HOLD_MS = 2500;

export type ScrapFightOutcome = "pending" | "player_win" | "npc_win" | "walk_away";
export type ScrapPunchResult = "turbo" | "close" | "miss" | "ignored";
export type ScrapSwingKind = "jab" | "cross";
export type ScrapOverlapQuality = "miss" | "glance" | "locked";

/** Which gloves are up for a hold-to-block. */
export type ScrapDefendHands = "both" | "left" | "right" | null;

/**
 * Hold-to-block from A / D (or ◀ ▶). No Shift gate — RMB / Shift is ALIGN now.
 * Left alone / right alone / both / neither.
 */
export function scrapDefendHandsFromInput(input: {
  leftHand?: boolean;
  rightHand?: boolean;
  /** @deprecated Ignored — block no longer needs a modifier. */
  defend?: boolean;
}): ScrapDefendHands {
  const left = !!input.leftHand;
  const right = !!input.rightHand;
  if (!left && !right) return null;
  if (left && !right) return "left";
  if (right && !left) return "right";
  return "both";
}

/**
 * Their jab comes at your RIGHT cheek; their cross at your LEFT.
 * Full guard covers either. Wrong hand alone does not.
 */
export function scrapBlocksSwing(hands: ScrapDefendHands, swing: ScrapSwingKind): boolean {
  if (!hands) return false;
  if (hands === "both") return true;
  if (swing === "jab") return hands === "right";
  return hands === "left";
}

/** Which glove must be up to block this swing. */
export function scrapBlockSide(swing: ScrapSwingKind): "left" | "right" {
  return swing === "jab" ? "right" : "left";
}

/** Advance align while holding ALIGN; decay when released. */
export function scrapAlignStep(align: number, holding: boolean, dtMs: number): number {
  const cur = Math.min(1, Math.max(0, align));
  const dt = Math.max(0, dtMs);
  if (holding) {
    return Math.min(1, cur + dt / SCRAP_ALIGN_FULL_MS);
  }
  return Math.max(0, cur - (dt / 1000) * SCRAP_ALIGN_DECAY_PER_SEC);
}

/**
 * Overlap quality from their opening cue + your align effort.
 * Waiting for RED alone is not enough — you must pull the match.
 */
export function scrapOverlapQuality(cue: ScrapCue, align: number): ScrapOverlapQuality {
  const a = Math.min(1, Math.max(0, align));
  if (cue === "now" && a >= SCRAP_ALIGN_MATCH) return "locked";
  if (cue === "now") return "glance";
  if (cue === "close" && a >= SCRAP_ALIGN_GLANCE) return "glance";
  return "miss";
}

/** HUD word for a landed overlap: glance = HIT, full match = MAX. */
export function scrapHitCallout(quality: ScrapOverlapQuality): "miss" | "hit" | "max" {
  if (quality === "locked") return "max";
  if (quality === "glance") return "hit";
  return "miss";
}

export function scrapHookReachable(distM: number): boolean {
  return Number.isFinite(distM) && distM <= SCRAP_HOOK_RANGE_M;
}
export type ScrapBeatKind = "guard" | "tell" | "jab" | "cross" | "open";
export type ScrapCue = "wait" | "close" | "now" | "incoming";
export type ScrapDodgeDir = "left" | "right";
/**
 * How they go down. Seeded per bout so the same opponent falls the same way.
 * The curated finish pool. Each silhouette is distinct and ends on the floor.
 */
export type ScrapKoStyle =
  | "fly_back"
  | "slam"
  | "crumple"
  | "face_down"
  | "knees"
  | "spin"
  | "daze"
  | "stagger"
  | "roll"
  | "three_point"
  | "crouch"
  | "heap";
export const SCRAP_KO_STYLES: readonly ScrapKoStyle[] = [
  "fly_back",
  "slam",
  "crumple",
  "face_down",
  "spin",
  "roll",
];

/**
 * Body travel for a KO — the clip is the pose; this is a hard stumble onto
 * the floor. Keep launches under ~3 m: further reads as "flying away".
 */
export interface ScrapKoTravel {
  durationMs: number;
  backM: number;
  upM: number;
  spinDeg: number;
}

export function scrapKoTravel(style: ScrapKoStyle): ScrapKoTravel {
  switch (style) {
    case "fly_back":
      return { durationMs: 1700, backM: 2.4, upM: 0.85, spinDeg: 0 };
    case "slam":
      return { durationMs: 1500, backM: 2.8, upM: 0.95, spinDeg: 25 };
    case "crumple":
      return { durationMs: 1300, backM: 0.9, upM: 0.25, spinDeg: 0 };
    case "face_down":
      return { durationMs: 2100, backM: 1.8, upM: 0.4, spinDeg: 0 };
    case "knees":
      return { durationMs: 900, backM: 0.35, upM: 0, spinDeg: 0 };
    case "spin":
      return { durationMs: 1600, backM: 1.6, upM: 0.7, spinDeg: 420 };
    case "daze":
      return { durationMs: 1400, backM: 0.8, upM: 0.2, spinDeg: 0 };
    case "stagger":
      return { durationMs: 1800, backM: 1.5, upM: 0.45, spinDeg: 0 };
    case "roll":
      return { durationMs: 1600, backM: 2.2, upM: 0.55, spinDeg: 180 };
    case "three_point":
      return { durationMs: 1200, backM: 1.1, upM: 0.6, spinDeg: 0 };
    case "crouch":
      return { durationMs: 800, backM: 0.4, upM: 0, spinDeg: 0 };
    case "heap":
      return { durationMs: 1100, backM: 0.7, upM: 0.15, spinDeg: 40 };
  }
}

/** Dizzy / wind-up before the body clip. 0 = the fall starts immediately. */
export function scrapKoPreludeMs(style: ScrapKoStyle): number {
  if (style === "daze") return 900;
  if (style === "stagger") return 650;
  return 0;
}

export function scrapKoPose(
  u: number,
  travel: ScrapKoTravel
): { back: number; lift: number; yawAdd: number } {
  const t = u <= 0 ? 0 : u >= 1 ? 1 : u;
  const ease = t * t * (3 - 2 * t);
  return {
    back: travel.backM * ease,
    lift: travel.upM * Math.sin(t * Math.PI),
    yawAdd: travel.spinDeg * ease,
  };
}

/**
 * Guaranteed NPC body tumble for a knockout.
 *
 * AvatarShape expression triggers are best-effort in Explorer: locomotion or a
 * late slot bind can swallow a one-shot death clip. Knockout travel therefore
 * owns the coarse body silhouette as well as displacement. Even if every emote
 * trigger is ignored, the opponent visibly tips during the wide shot and ends
 * flat on the floor. The bundled clip may add articulation, but it is no longer
 * the only thing capable of making a body fall.
 */
export function scrapKoBodyAngles(
  style: ScrapKoStyle,
  u: number
): { pitchDeg: number; rollDeg: number; floorLiftM: number } {
  const t = u <= 0 ? 0 : u >= 1 ? 1 : u;
  const fall = 1 - (1 - t) ** 2;
  const wobble = Math.sin(t * Math.PI);
  switch (style) {
    case "face_down":
      return { pitchDeg: 92 * fall, rollDeg: 5 * wobble, floorLiftM: 0.15 * fall };
    case "roll":
      return { pitchDeg: -38 * fall, rollDeg: 92 * fall, floorLiftM: 0.11 * fall };
    case "spin":
      return { pitchDeg: -82 * fall, rollDeg: 18 * wobble, floorLiftM: 0.15 * fall };
    case "slam":
      return { pitchDeg: -104 * fall, rollDeg: 12 * wobble, floorLiftM: 0.16 * fall };
    case "knees":
    case "crouch":
    case "three_point":
      return { pitchDeg: -68 * fall, rollDeg: -8 * wobble, floorLiftM: 0.12 * fall };
    case "heap":
      return { pitchDeg: -86 * fall, rollDeg: 28 * fall, floorLiftM: 0.13 * fall };
    case "fly_back":
    case "crumple":
    case "daze":
    case "stagger":
    default:
      return { pitchDeg: -90 * fall, rollDeg: -7 * wobble, floorLiftM: 0.15 * fall };
  }
}

/** Hold first person so the last punch reads, then cut wide. */
export const SCRAP_KO_CAM_HOLD_MS = 420;
/** Seconds the orbit camera turns around the fallen body. */
export const SCRAP_KO_CAM_ORBIT_MS = 7200;
/** How far the wide shot turns around them (~207°). */
export const SCRAP_KO_CAM_SWEEP = Math.PI * 1.15;

/**
 * Wide KO camera: start side-on, turn around the body, look down as they hit
 * the floor. A second VirtualCamera must bind this pose — moving the eye-cam
 * in place is what made the fall invisible (Explorer kept first person).
 */
export function scrapKoCutPose(
  progress: number,
  input: {
    playerX: number;
    playerY: number;
    playerZ: number;
    npcX: number;
    npcY: number;
    npcZ: number;
  }
): { x: number; y: number; z: number; yawDeg: number; pitchDeg: number } {
  const t = progress <= 0 ? 0 : progress >= 1 ? 1 : progress;
  const ease = 1 - (1 - t) ** 3;
  let dx = input.npcX - input.playerX;
  let dz = input.npcZ - input.playerZ;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  const midX = (input.playerX + input.npcX) / 2;
  const midZ = (input.playerZ + input.npcZ) / 2;
  const rightX = -dz;
  const rightZ = dx;
  const ang = -SCRAP_KO_CAM_SWEEP * ease;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const ox = rightX * cos - rightZ * sin;
  const oz = rightX * sin + rightZ * cos;
  const dist = 4.4 + 2.6 * ease;
  const lookY = input.npcY + 1.45 - 1.05 * ease;
  const camY = input.playerY + 1.55 + 1.85 * ease;
  const x = midX + ox * dist;
  const z = midZ + oz * dist;
  const flat = Math.max(0.6, Math.hypot(input.npcX - x, input.npcZ - z));
  const pitchDeg = (Math.atan2(camY - lookY, flat) * 180) / Math.PI;
  const yawDeg = (Math.atan2(input.npcX - x, input.npcZ - z) * 180) / Math.PI;
  return { x, y: camY, z, yawDeg, pitchDeg };
}

export interface ScrapBeat {
  kind: ScrapBeatKind;
  /** Length at speed 1. */
  ms: number;
}

export interface ScrapPattern {
  id: string;
  /** One line for the owner's tuning table and the fight log. */
  read: string;
  beats: readonly ScrapBeat[];
}

/**
 * THE PATTERNS. Six regular rhythms plus the boss, each with exactly ONE
 * opening per loop and a readable tell before or after it. Regular opponents
 * get a seeded read; the boss always fights the final, fastest pattern.
 */
export const SCRAP_PATTERNS: readonly ScrapPattern[] = [
  {
    id: "braggart",
    read: "taunts, then drops the guard — hit right after the taunt",
    beats: [
      { kind: "guard", ms: 900 },
      { kind: "tell", ms: 700 },
      { kind: "open", ms: 760 },
      { kind: "cross", ms: 820 },
      { kind: "guard", ms: 520 },
    ],
  },
  {
    id: "jabber",
    read: "two quick jabs, a breath, then open",
    beats: [
      { kind: "jab", ms: 780 },
      { kind: "jab", ms: 780 },
      { kind: "guard", ms: 460 },
      { kind: "open", ms: 800 },
      { kind: "guard", ms: 720 },
    ],
  },
  {
    id: "heavy",
    read: "winds up, throws the big one, and is wide open after it — dodge, then hit",
    beats: [
      { kind: "guard", ms: 1200 },
      { kind: "tell", ms: 620 },
      { kind: "cross", ms: 860 },
      { kind: "open", ms: 900 },
      { kind: "guard", ms: 420 },
    ],
  },
  {
    id: "counterpuncher",
    read: "guards the cheek, checks with a jab, then leaves a short counter lane",
    beats: [
      { kind: "guard", ms: 720 },
      { kind: "jab", ms: 740 },
      { kind: "open", ms: 800 },
      { kind: "cross", ms: 800 },
      { kind: "guard", ms: 680 },
    ],
  },
  {
    id: "switch",
    read: "opens with the rear hand, resets, feints, then switches into an opening",
    beats: [
      { kind: "cross", ms: 800 },
      { kind: "guard", ms: 540 },
      { kind: "tell", ms: 430 },
      { kind: "open", ms: 800 },
      { kind: "jab", ms: 720 },
      { kind: "guard", ms: 480 },
    ],
  },
  {
    id: "rusher",
    read: "rushes a one-two, overcommits, then snaps one last jab",
    beats: [
      { kind: "jab", ms: 720 },
      { kind: "cross", ms: 780 },
      { kind: "open", ms: 800 },
      { kind: "jab", ms: 700 },
      { kind: "guard", ms: 760 },
    ],
  },
  {
    id: "boss",
    read: "jab, cross, feint, jab — the opening is short and comes after the fourth beat",
    beats: [
      { kind: "jab", ms: 720 },
      { kind: "cross", ms: 800 },
      { kind: "guard", ms: 360 },
      { kind: "tell", ms: 440 },
      { kind: "jab", ms: 720 },
      { kind: "open", ms: 700 },
      { kind: "guard", ms: 620 },
    ],
  },
];

export interface ScrapFightTiming {
  /** Beat-length multiplier. <1 is faster. */
  speed: number;
  theirHp: number;
  /** Damage of their jab / cross on you. */
  jabDamage: number;
  crossDamage: number;
  /** Which rhythm they fight to. */
  pattern: ScrapPattern;
}

export interface ScrapFightState {
  startedAtMs: number;
  seed: number;
  theirHp: number;
  theirMaxHp: number;
  yourHp: number;
  yourMaxHp: number;
  punchIndex: number;
  lastPunchAtMs: number;
  /** No new committed move until its recovery finishes. */
  recoveryUntilMs: number;
  yourStamina: number;
  yourMaxStamina: number;
  lastTickAtMs: number;
  guardHands: ScrapDefendHands;
  guardStartedAtMs: number;
  /** When the CURRENT unbroken two-handed guard began. 0 when not turtling. */
  bothGuardSinceMs: number;
  /** Their turtle-punish uppercut is winding up since this time. 0 = none. */
  upperTellAtMs: number;
  /** No new turtle punish before this time. */
  upperReadyAtMs: number;
  /** A correctly timed guard creates a short attacking opportunity. */
  counterUntilMs: number;
  /** Until when their swing cannot be dodged (you clicked white). */
  exposedUntilMs: number;
  /** The dodge you are in, if any. */
  dodgeAtMs: number;
  dodgeDir: ScrapDodgeDir | null;
  /** True while A/D (or a dodge button) is held — stays dodging past the tap window. */
  dodgeHeld: boolean;
  /** Gloves-together clap animation ends at this time. */
  hypeClapUntilMs: number;
  /** Instant MAX power is banked until this time (or the next punch). */
  hypePowerUntilMs: number;
  /** Next clap is legal at this time. */
  hypeReadyAtMs: number;
  /** Swings already resolved, keyed `${cycle}:${beatIndex}`. */
  resolvedSwingKey: string | null;
  /** Last beat we emitted a start event for. */
  beatKey: string | null;
  landedAtMs: number;
  hurtAtMs: number;
  lastResult: ScrapPunchResult | null;
  outcome: ScrapFightOutcome;
  koStyle: ScrapKoStyle;
}

export type ScrapFightEvent =
  | { kind: "beat"; beat: ScrapBeatKind; index: number; cycle: number }
  | { kind: "swing_start"; swing: ScrapSwingKind }
  | { kind: "swing_land"; swing: ScrapSwingKind; damage: number; exposed: boolean }
  | { kind: "swing_whiffed"; swing: ScrapSwingKind; distanceM: number }
  | { kind: "swing_dodged"; swing: ScrapSwingKind; dir: ScrapDodgeDir }
  | { kind: "swing_blocked"; swing: ScrapSwingKind; hands: Exclude<ScrapDefendHands, null>; perfect: boolean; chip: number }
  | { kind: "upper_tell"; inMs: number }
  | { kind: "upper_land"; damage: number }
  | { kind: "upper_avoided"; reason: "guard_dropped" | "dodge" | "range" }
  | { kind: "npc_win" };

function mix(a: number, b: number): number {
  return Math.imul((a ^ 0x9e3779b9) + b, 2654435761) >>> 0;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function scrapKoStyleFor(seed: number): ScrapKoStyle {
  return SCRAP_KO_STYLES[mix(seed, 0x4b0) % SCRAP_KO_STYLES.length]!;
}

/** Every pattern loops this long at speed 1. */
export function scrapPatternCycleMs(pattern: ScrapPattern, speed = 1): number {
  return pattern.beats.reduce((sum, beat) => sum + beat.ms, 0) * speed;
}

/**
 * Every few loops they step OUT of reach to breathe. Purely positional: the
 * view walks them back ~1.5 m and every existing range gate does the rest —
 * their swings whiff, your punches read TOO FAR, then they wade back in.
 * The engine's beat clock never pauses, so determinism is untouched.
 */
export const SCRAP_BREATHER_EVERY_CYCLES = 3;
export const SCRAP_BREATHER_MS = 3000;
export const SCRAP_BREATHER_STEP_M = 1.6;

/** True on the cycles whose first beat opens with the breather. */
export function scrapBreatherCycle(cycle: number): boolean {
  return cycle > 0 && cycle % SCRAP_BREATHER_EVERY_CYCLES === 0;
}

export function emptyScrapFight(
  nowMs: number,
  seed: number,
  timing: ScrapFightTiming,
  yourPenalty = 0
): ScrapFightState {
  return {
    startedAtMs: nowMs + SCRAP_FIGHT_FIRST_BEAT_MS,
    seed,
    theirHp: timing.theirHp,
    theirMaxHp: timing.theirHp,
    yourHp: Math.max(1, SCRAP_FIGHT_YOUR_HP - Math.max(0, yourPenalty)),
    yourMaxHp: SCRAP_FIGHT_YOUR_HP,
    punchIndex: 0,
    lastPunchAtMs: nowMs - SCRAP_FIGHT_PUNCH_COOLDOWN_MS,
    recoveryUntilMs: nowMs,
    yourStamina: SCRAP_STAMINA_MAX,
    yourMaxStamina: SCRAP_STAMINA_MAX,
    lastTickAtMs: nowMs,
    guardHands: null,
    guardStartedAtMs: 0,
    bothGuardSinceMs: 0,
    upperTellAtMs: 0,
    upperReadyAtMs: nowMs,
    counterUntilMs: 0,
    exposedUntilMs: 0,
    dodgeAtMs: 0,
    dodgeDir: null,
    dodgeHeld: false,
    hypeClapUntilMs: 0,
    hypePowerUntilMs: 0,
    hypeReadyAtMs: 0,
    resolvedSwingKey: null,
    beatKey: null,
    landedAtMs: 0,
    hurtAtMs: 0,
    lastResult: null,
    outcome: "pending",
    koStyle: scrapKoStyleFor(seed),
  };
}

export interface ScrapBeatAt {
  beat: ScrapBeat;
  index: number;
  cycle: number;
  /** 0 → 1 through the beat. */
  progress: number;
  /** Milliseconds into the beat. */
  intoMs: number;
  /** Beat length at this speed. */
  lengthMs: number;
  /** Before the first beat (the arrival grace). */
  grace: boolean;
}

/** Where they are in their loop right now. */
export function scrapBeatAt(state: ScrapFightState, nowMs: number, timing: ScrapFightTiming): ScrapBeatAt {
  const beats = timing.pattern.beats;
  const cycleMs = scrapPatternCycleMs(timing.pattern, timing.speed);
  const elapsed = nowMs - state.startedAtMs;
  if (elapsed < 0) {
    const first = beats[0]!;
    return { beat: first, index: 0, cycle: -1, progress: 0, intoMs: 0, lengthMs: first.ms * timing.speed, grace: true };
  }
  const cycle = Math.floor(elapsed / cycleMs);
  let into = elapsed - cycle * cycleMs;
  for (let index = 0; index < beats.length; index += 1) {
    const beat = beats[index]!;
    const lengthMs = beat.ms * timing.speed;
    if (into < lengthMs || index === beats.length - 1) {
      return { beat, index, cycle, progress: clamp(into / lengthMs, 0, 1), intoMs: into, lengthMs, grace: false };
    }
    into -= lengthMs;
  }
  const last = beats[beats.length - 1]!;
  return { beat: last, index: beats.length - 1, cycle, progress: 1, intoMs: 0, lengthMs: last.ms * timing.speed, grace: false };
}

/** Milliseconds from `nowMs` to the start of the next `open` beat (≥ 0). */
export function scrapMsToOpen(state: ScrapFightState, nowMs: number, timing: ScrapFightTiming): number {
  const beats = timing.pattern.beats;
  const cycleMs = scrapPatternCycleMs(timing.pattern, timing.speed);
  const elapsed = nowMs - state.startedAtMs;
  let offset = 0;
  let openOffset = -1;
  for (const beat of beats) {
    if (beat.kind === "open") {
      openOffset = offset;
      break;
    }
    offset += beat.ms * timing.speed;
  }
  if (openOffset < 0) return Infinity;
  // Before the first beat, count through the full arrival grace to the first
  // opening. A long grace can otherwise floor into cycle -1 and wrap early.
  if (elapsed < 0) return openOffset - elapsed;
  const cycle = Math.floor(elapsed / cycleMs);
  const thisCycle = cycle * cycleMs + openOffset;
  const target = thisCycle >= elapsed ? thisCycle : thisCycle + cycleMs;
  return Math.max(0, target - elapsed);
}

/**
 * The marker colour right now, plus the fuel of the open window (1 → 0) for
 * a shrinking ring. BLUE (incoming) wins over everything while a swing is on
 * its way; a swing that has connected goes back to WAIT.
 */
export function scrapCueAt(
  state: ScrapFightState,
  nowMs: number,
  timing: ScrapFightTiming
): { cue: ScrapCue; fuel: number; swing: ScrapSwingKind | null } {
  const at = scrapBeatAt(state, nowMs, timing);
  if (at.grace) return { cue: "wait", fuel: 0, swing: null };
  const kind = at.beat.kind;
  if ((kind === "jab" || kind === "cross") && at.progress < SCRAP_SWING_CONTACT) {
    return { cue: "incoming", fuel: 1 - at.progress / SCRAP_SWING_CONTACT, swing: kind };
  }
  if (kind === "open") {
    return { cue: "now", fuel: 1 - at.progress, swing: null };
  }
  const shoulder = SCRAP_OPEN_SHOULDER_MS * timing.speed;
  const toOpen = scrapMsToOpen(state, nowMs, timing);
  if (toOpen <= shoulder) return { cue: "close", fuel: 0, swing: null };
  // Just after the opening closed: the beat that follows it, for one shoulder.
  const beats = timing.pattern.beats;
  const prevIndex = (at.index + beats.length - 1) % beats.length;
  if (beats[prevIndex]!.kind === "open" && at.intoMs <= shoulder && at.cycle >= 0) {
    return { cue: "close", fuel: 0, swing: null };
  }
  return { cue: "wait", fuel: 0, swing: null };
}

/** 0..100: how square in the RED the click was. 100 for the first 45 %. */
export function scrapPunchScore(cue: ScrapCue, fuel: number): number {
  if (cue === "now") {
    if (fuel >= 0.55) return 100;
    return Math.round(40 + (fuel / 0.55) * 60);
  }
  if (cue === "close") return 30;
  return 0;
}

export type ScrapShockwave = "none" | "light" | "heavy";

/** Three camera-shake characters. Amplitude lives on shakeStrength; this picks the waveform. */
export type ScrapShakeStage = "light" | "medium" | "heavy";

export interface ScrapHitFeel {
  /** Camera offset in metres at peak. Outgoing hits intentionally use zero. */
  shakeStrength: number;
  shakeMs: number;
  shockwave: ScrapShockwave;
  stage: ScrapShakeStage;
}

const SHAKE_STAGE = {
  light: { shatter: 0, rollDeg: 3.2 },
  medium: { shatter: 0.32, rollDeg: 7.5 },
  heavy: { shatter: 1, rollDeg: 13 },
} as const;

/**
 * Outgoing impact feedback. Your own hit must never shake your camera; the
 * stage and shockwave still select the opponent-side flash/world effect.
 */
export function scrapLandedHitFeel(result: "close" | "turbo", score: number): ScrapHitFeel {
  if (result === "close") {
    return { stage: "light", shakeStrength: 0, shakeMs: 0, shockwave: "none" };
  }
  if (score >= 100) {
    return { stage: "heavy", shakeStrength: 0, shakeMs: 0, shockwave: "heavy" };
  }
  return { stage: "medium", shakeStrength: 0, shakeMs: 0, shockwave: "light" };
}

/**
 * How hard the frame jumps when THEY land on YOU.
 * Jab = a light nudge. Cross = a real hit. Exposed cross / uppercut = the smash.
 * Exposed does not promote a jab all the way to smash — that made every hit feel identical.
 */
export function scrapReceivedHitFeel(input: {
  swing: ScrapSwingKind | "upper";
  exposed: boolean;
}): ScrapHitFeel {
  if (input.swing === "upper" || (input.swing === "cross" && input.exposed)) {
    return { stage: "heavy", shakeStrength: 0.34, shakeMs: 620, shockwave: "heavy" };
  }
  if (input.swing === "cross" || input.exposed) {
    return { stage: "medium", shakeStrength: 0.15, shakeMs: 360, shockwave: "light" };
  }
  return { stage: "light", shakeStrength: 0.05, shakeMs: 190, shockwave: "none" };
}

/** Hold full strength, then decay — a linear fade from frame 0 never reads as a hit. */
export function scrapShakeEnvelope(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs < 0 || elapsedMs >= durationMs) return 0;
  const u = elapsedMs / durationMs;
  if (u < 0.28) return 1;
  return 1 - (u - 0.28) / 0.72;
}

/** First-person camera offset for a hit. Stage picks shatter vs nudge; strength is metres. */
export function scrapShakeMotion(
  elapsedMs: number,
  durationMs: number,
  strengthM: number,
  stage: ScrapShakeStage,
): { x: number; y: number; z: number; roll: number } {
  const envelope = scrapShakeEnvelope(elapsedMs, durationMs);
  if (envelope <= 0) return { x: 0, y: 0, z: 0, roll: 0 };
  const t = elapsedMs / 1000;
  const spec = SHAKE_STAGE[stage];
  const shatter =
    (Math.sin(t * 240) * 0.35 + Math.sin(t * 410) * 0.22 + Math.sin(t * 610) * 0.12) * spec.shatter;
  const s = strengthM * envelope;
  return {
    x: (Math.sin(t * 71) + Math.sin(t * 113) * 0.45) * s + shatter * s * 0.55,
    y: Math.sin(t * 93) * s * 0.6 + shatter * s * 0.35,
    z: Math.sin(t * 57 + 1.4) * s * 0.6 + shatter * s * 0.4,
    roll: (Math.sin(t * 79) * spec.rollDeg + Math.sin(t * 190) * 6 * spec.shatter) * envelope,
  };
}

export function scrapPunchTier(cue: ScrapCue): Exclude<ScrapPunchResult, "ignored"> {
  if (cue === "now") return "turbo";
  if (cue === "close") return "close";
  return "miss";
}

/** Map overlap quality to the punch tier the HUD already speaks. */
export function scrapPunchTierFromOverlap(quality: ScrapOverlapQuality): Exclude<ScrapPunchResult, "ignored"> {
  if (quality === "locked") return "turbo";
  if (quality === "glance") return "close";
  return "miss";
}

/**
 * 0..1 charge from how long the button has been held. Tap floor, then linear
 * to full. Used by the HUD fill and by damage.
 */
export function scrapChargePower(heldMs: number): number {
  if (heldMs <= 0) return 0;
  if (heldMs <= SCRAP_CHARGE_TAP_MS) return SCRAP_CHARGE_MIN;
  const cycleAt = heldMs % Math.max(1, SCRAP_CHARGE_CYCLE_MS);
  const pulse =
    cycleAt <= SCRAP_CHARGE_FULL_MS
      ? (cycleAt - SCRAP_CHARGE_TAP_MS) /
        Math.max(1, SCRAP_CHARGE_FULL_MS - SCRAP_CHARGE_TAP_MS)
      : 1 -
        (cycleAt - SCRAP_CHARGE_FULL_MS) /
          Math.max(1, SCRAP_CHARGE_CYCLE_MS - SCRAP_CHARGE_FULL_MS);
  return SCRAP_CHARGE_MIN + (1 - SCRAP_CHARGE_MIN) * clamp(pulse, 0, 1);
}

/** True while the pulsing meter is in its narrow MAX band. */
export function scrapChargeFull(heldMs: number): boolean {
  return scrapChargePower(heldMs) >= 0.98;
}

/** A charge cannot be parked forever while the player waits for an opening. */
export function scrapChargeExhausted(heldMs: number): boolean {
  return heldMs >= SCRAP_CHARGE_MAX_HOLD_MS;
}

export type ScrapHypeFail = "cooldown" | "tired" | "busy" | "dead";

/**
 * HYPE IS EARNED, NOT PRESSED.
 *
 * The clap used to sit on Space — the easiest key on the board spent on a
 * once-per-eight-seconds buff, while the uppercut was stranded on the number
 * row. The mechanic is unchanged (bank instant MAX power for one punch); only
 * the trigger moved. The meter fills from pressure — landing, chaining,
 * beating a swing — and banks itself at the top, so Space is free for a punch
 * that deserves it.
 *
 * It bleeds when nothing is happening: a fighter who circles for ten seconds
 * should not arrive at MAX for free.
 */
export type ScrapHypeEvent = "landed" | "turbo" | "combo" | "dodge" | "block";

export const SCRAP_HYPE_GAIN: Readonly<Record<ScrapHypeEvent, number>> = {
  landed: 0.16,
  turbo: 0.1,
  combo: 0.12,
  dodge: 0.12,
  block: 0.07,
};

export const SCRAP_HYPE_DECAY_PER_SEC = 0.035;

export function scrapHypeGain(meter: number, event: ScrapHypeEvent): number {
  return clamp(meter + SCRAP_HYPE_GAIN[event], 0, 1);
}

export function scrapHypeDecay(meter: number, dtMs: number): number {
  if (!(dtMs > 0)) return clamp(meter, 0, 1);
  const step = (SCRAP_HYPE_DECAY_PER_SEC * Math.min(dtMs, 250)) / 1000;
  return clamp(meter - step, 0, 1);
}

/** The meter is full and the cooldown has expired — bank it this frame. */
export function scrapHypeBankReady(state: ScrapFightState, meter: number, nowMs: number): boolean {
  if (state.outcome !== "pending") return false;
  if (meter < 1) return false;
  return nowMs >= state.hypeReadyAtMs;
}

/**
 * Bank MAX power from a FULL meter. Unlike the manual clap this costs no
 * stamina and does not leave you open — the fight already charged for it in
 * the hits that filled the bar.
 */
export function scrapFightHypeBank(state: ScrapFightState, nowMs: number): ScrapFightState {
  if (state.outcome !== "pending") return state;
  return {
    ...state,
    hypePowerUntilMs: nowMs + SCRAP_HYPE_POWER_HOLD_MS,
    hypeReadyAtMs: nowMs + SCRAP_HYPE_COOLDOWN_MS,
  };
}

export function scrapHypeClapping(state: ScrapFightState, nowMs: number): boolean {
  return nowMs < state.hypeClapUntilMs;
}

export function scrapHypePowerLive(state: ScrapFightState, nowMs: number): boolean {
  return nowMs < state.hypePowerUntilMs;
}

export function scrapHypeClapElapsed(state: ScrapFightState, nowMs: number): number {
  if (!scrapHypeClapping(state, nowMs)) return -1;
  return Math.max(0, SCRAP_HYPE_CLAP_MS - (state.hypeClapUntilMs - nowMs));
}

/**
 * Bang the gloves: spend stamina, go open for the clap, bank MAX power.
 * One use per cooldown. Rejected mid-punch so the fists are free to meet.
 */
export function scrapFightHypeClap(
  state: ScrapFightState,
  nowMs: number
): { state: ScrapFightState; ok: boolean; reason?: ScrapHypeFail } {
  if (state.outcome !== "pending") return { state, ok: false, reason: "dead" };
  if (nowMs < state.hypeClapUntilMs || nowMs < state.recoveryUntilMs) {
    return { state, ok: false, reason: "busy" };
  }
  if (nowMs < state.hypeReadyAtMs) return { state, ok: false, reason: "cooldown" };
  if (state.yourStamina < SCRAP_HYPE_STAMINA) return { state, ok: false, reason: "tired" };
  return {
    ok: true,
    state: {
      ...state,
      yourStamina: Math.max(0, state.yourStamina - SCRAP_HYPE_STAMINA),
      hypeClapUntilMs: nowMs + SCRAP_HYPE_CLAP_MS,
      hypePowerUntilMs: nowMs + SCRAP_HYPE_POWER_HOLD_MS,
      hypeReadyAtMs: nowMs + SCRAP_HYPE_COOLDOWN_MS,
      exposedUntilMs: Math.max(state.exposedUntilMs, nowMs + SCRAP_HYPE_CLAP_MS),
      guardHands: null,
      guardStartedAtMs: 0,
    },
  };
}

export function scrapPunchDamage(
  tier: Exclude<ScrapPunchResult, "ignored">,
  charge = 1
): number {
  const power = Math.min(1, Math.max(0, charge));
  if (tier === "turbo") return SCRAP_FIGHT_TURBO_DAMAGE * power;
  if (tier === "close") return SCRAP_FIGHT_CLOSE_DAMAGE * power;
  return 0;
}

export function scrapFightOver(state: ScrapFightState): boolean {
  return state.outcome !== "pending";
}

/** A deliberate quit. The only voluntary way out of a bout. */
export function scrapFightQuit(state: ScrapFightState): ScrapFightState {
  if (state.outcome !== "pending") return state;
  return { ...state, outcome: "walk_away" };
}

/** True while a dodge tap is still carrying you, or A / D is held. */
export function scrapIsDodging(state: ScrapFightState, nowMs: number): boolean {
  if (state.dodgeHeld && state.dodgeDir) return true;
  return state.dodgeAtMs > 0 && nowMs - state.dodgeAtMs < SCRAP_DODGE_MS;
}

/** 0 → 1 → 0 across a tap; stays high while you hold the dodge. */
export function scrapDodgeLean(state: ScrapFightState, nowMs: number): number {
  if (!scrapIsDodging(state, nowMs)) return 0;
  const u = (nowMs - state.dodgeAtMs) / SCRAP_DODGE_MS;
  if (state.dodgeHeld && u >= 1) return 0.85;
  return Math.sin(Math.min(1, u) * Math.PI);
}

export function scrapFightDodge(state: ScrapFightState, nowMs: number, dir: ScrapDodgeDir): ScrapFightState {
  if (state.outcome !== "pending") return state;
  if (state.dodgeAtMs && nowMs - state.dodgeAtMs < SCRAP_DODGE_MS + SCRAP_DODGE_COOLDOWN_MS) return state;
  return { ...state, dodgeAtMs: nowMs, dodgeDir: dir, dodgeHeld: false };
}

export function scrapFightHoldDodge(state: ScrapFightState, nowMs: number, dir: ScrapDodgeDir): ScrapFightState {
  if (state.outcome !== "pending") return state;
  if (state.dodgeHeld && state.dodgeDir === dir) return state;
  return { ...state, dodgeAtMs: nowMs, dodgeDir: dir, dodgeHeld: true };
}

export function scrapFightReleaseDodge(state: ScrapFightState): ScrapFightState {
  if (!state.dodgeHeld) return state;
  return { ...state, dodgeHeld: false };
}

export function scrapTheirLock(
  state: ScrapFightState,
  nowMs: number,
  timing: ScrapFightTiming
): { aiming: boolean; settle: number; locked: boolean; swing: ScrapSwingKind | null } {
  const at = scrapCueAt(state, nowMs, timing);
  if (at.cue !== "incoming") return { aiming: false, settle: 0, locked: false, swing: null };
  const settle = 1 - at.fuel;
  return { aiming: true, settle, locked: settle >= SCRAP_LOCK_SETTLE, swing: at.swing };
}

/** Is their turtle-punish uppercut in the air right now? 0..1 through the tell. */
export function scrapTurtleUpperTell(
  state: ScrapFightState,
  nowMs: number
): { live: boolean; settle: number } {
  if (state.upperTellAtMs <= 0) return { live: false, settle: 0 };
  const through = (nowMs - state.upperTellAtMs) / SCRAP_TURTLE_UPPER_TELL_MS;
  return { live: true, settle: Math.min(1, Math.max(0, through)) };
}

/**
 * Arm, hold and resolve the uppercut that punishes a held double guard. Mutates
 * nothing: returns the next state and pushes its events.
 *
 * It goes UNDER a guard by design — `scrapBlocksSwing` is deliberately not
 * consulted. Dropping to one hand, dodging, or backing out of uppercut range
 * are the three outs, and all three are decided at the contact frame.
 */
function resolveTurtleUpper(
  state: ScrapFightState,
  nowMs: number,
  timing: ScrapFightTiming,
  hands: ScrapDefendHands,
  opponentDistanceM: number | undefined,
  events: ScrapFightEvent[]
): ScrapFightState {
  const inRange = opponentDistanceM === undefined || scrapMoveInRange("uppercut", opponentDistanceM);

  if (state.upperTellAtMs > 0) {
    if (nowMs - state.upperTellAtMs < SCRAP_TURTLE_UPPER_TELL_MS) return state;
    const settled: ScrapFightState = {
      ...state,
      upperTellAtMs: 0,
      upperReadyAtMs: nowMs + SCRAP_TURTLE_UPPER_COOLDOWN_MS,
      bothGuardSinceMs: hands === "both" ? nowMs : 0,
    };
    if (!inRange) {
      events.push({ kind: "upper_avoided", reason: "range" });
      return settled;
    }
    if (scrapIsDodging(settled, nowMs)) {
      events.push({ kind: "upper_avoided", reason: "dodge" });
      return settled;
    }
    if (hands !== "both") {
      events.push({ kind: "upper_avoided", reason: "guard_dropped" });
      return settled;
    }
    const damage = timing.crossDamage * scrapMove("uppercut").damageMultiplier;
    const yourHp = Math.max(0, settled.yourHp - damage);
    const hit: ScrapFightState = {
      ...settled,
      yourHp,
      hurtAtMs: nowMs,
      exposedUntilMs: 0,
      yourStamina: Math.max(0, settled.yourStamina - SCRAP_TURTLE_UPPER_STAMINA),
    };
    events.push({ kind: "upper_land", damage });
    if (yourHp <= 0) {
      events.push({ kind: "npc_win" });
      return { ...hit, outcome: "npc_win" };
    }
    return hit;
  }

  const turtling =
    hands === "both" &&
    state.bothGuardSinceMs > 0 &&
    nowMs - state.bothGuardSinceMs >= SCRAP_TURTLE_UPPER_AFTER_MS;
  if (!turtling || !inRange || nowMs < state.upperReadyAtMs) return state;
  events.push({ kind: "upper_tell", inMs: SCRAP_TURTLE_UPPER_TELL_MS });
  return { ...state, upperTellAtMs: nowMs };
}

/**
 * Advance their rhythm. Emits the beat starts (so the view can play the jab /
 * cross / taunt clip on the beat) and resolves every swing exactly once at its
 * contact point: a matching hold-guard = it whiffs, exposed = it lands no
 * matter what. Dodge still whiffs if the view arms it; A / D now raise gloves
 * for block by default. Distance is checked at the contact frame: walking out
 * of the move's measured range beats guard, dodge, and exposure. Omitting the
 * distance keeps pure/legacy callers at ringside range.
 */
export function scrapFightTick(
  state: ScrapFightState,
  nowMs: number,
  timing: ScrapFightTiming,
  defendHands: ScrapDefendHands = null,
  opponentDistanceM?: number
): { state: ScrapFightState; events: ScrapFightEvent[] } {
  const events: ScrapFightEvent[] = [];
  if (state.outcome !== "pending") return { state, events };
  if (nowMs - state.startedAtMs >= SCRAP_FIGHT_MAX_MS) {
    events.push({ kind: "npc_win" });
    return { state: { ...state, outcome: "npc_win" }, events };
  }
  const clapping = scrapHypeClapping(state, nowMs);
  const hands = clapping ? null : defendHands;
  const dtMs = Math.min(250, Math.max(0, nowMs - state.lastTickAtMs));
  const changedGuard = hands !== state.guardHands;
  const drainRate = hands === "both" ? SCRAP_DOUBLE_GUARD_DRAIN_PER_SEC : SCRAP_GUARD_DRAIN_PER_SEC;
  const staminaDelta = hands
    ? -(drainRate * dtMs) / 1000
    : (SCRAP_STAMINA_REGEN_PER_SEC * dtMs) / 1000;
  let next: ScrapFightState = {
    ...state,
    lastTickAtMs: nowMs,
    guardHands: hands,
    guardStartedAtMs: changedGuard && hands ? nowMs : hands ? state.guardStartedAtMs : 0,
    bothGuardSinceMs:
      hands === "both" ? (state.guardHands === "both" ? state.bothGuardSinceMs || nowMs : nowMs) : 0,
    yourStamina: clamp(state.yourStamina + staminaDelta, 0, state.yourMaxStamina),
  };
  const at = scrapBeatAt(next, nowMs, timing);
  if (at.grace) return { state: next, events };

  // The turtle punish. Runs alongside their pattern, not inside it: a sustained
  // two-handed guard is what triggers it, so it is a reply to YOU, not a beat.
  const upperResolved = resolveTurtleUpper(next, nowMs, timing, hands, opponentDistanceM, events);
  next = upperResolved;
  if (next.outcome !== "pending") return { state: next, events };
  const key = `${at.cycle}:${at.index}`;
  if (key !== state.beatKey) {
    next = { ...next, beatKey: key };
    events.push({ kind: "beat", beat: at.beat.kind, index: at.index, cycle: at.cycle });
    if (at.beat.kind === "jab" || at.beat.kind === "cross") {
      events.push({ kind: "swing_start", swing: at.beat.kind });
    }
  }
  const swinging = at.beat.kind === "jab" || at.beat.kind === "cross";
  if (swinging && at.progress >= SCRAP_SWING_CONTACT && next.resolvedSwingKey !== key) {
    next = { ...next, resolvedSwingKey: key };
    const swing = at.beat.kind as ScrapSwingKind;
    const exposed = nowMs < next.exposedUntilMs;
    const inRange = opponentDistanceM === undefined || scrapMoveInRange(swing, opponentDistanceM);
    if (!inRange) {
      events.push({ kind: "swing_whiffed", swing, distanceM: opponentDistanceM! });
    } else if (!exposed && next.yourStamina >= SCRAP_GUARD_MIN_STAMINA && scrapBlocksSwing(hands, swing)) {
      const perfect = next.guardStartedAtMs > 0 && nowMs - next.guardStartedAtMs <= SCRAP_PERFECT_GUARD_MS;
      const rawDamage = swing === "jab" ? timing.jabDamage : timing.crossDamage;
      const chipFraction = hands === "both" ? SCRAP_DOUBLE_GUARD_CHIP_FRACTION : SCRAP_GUARD_CHIP_FRACTION;
      const chip = perfect ? 0 : rawDamage * chipFraction;
      const yourHp = Math.max(0, next.yourHp - chip);
      next = {
        ...next,
        yourHp,
        counterUntilMs: perfect ? nowMs + SCRAP_COUNTER_WINDOW_MS : next.counterUntilMs,
        yourStamina: Math.max(0, next.yourStamina - (perfect ? 2 : hands === "both" ? 10 : 6)),
      };
      events.push({ kind: "swing_blocked", swing, hands: hands!, perfect, chip });
      if (yourHp <= 0) {
        events.push({ kind: "npc_win" });
        next = { ...next, outcome: "npc_win" };
      }
    } else if (!exposed && scrapIsDodging(next, nowMs)) {
      events.push({ kind: "swing_dodged", swing, dir: next.dodgeDir ?? "left" });
    } else {
      const damage = swing === "jab" ? timing.jabDamage : timing.crossDamage;
      const yourHp = Math.max(0, next.yourHp - damage);
      next = { ...next, yourHp, hurtAtMs: nowMs, exposedUntilMs: 0 };
      events.push({ kind: "swing_land", swing, damage, exposed });
      if (yourHp <= 0) {
        events.push({ kind: "npc_win" });
        next = { ...next, outcome: "npc_win" };
      }
    }
  }
  return { state: next, events };
}

/**
 * Throw one. Align + cue decide quality; charge scales damage. Out-of-reach
 * hooks (`reachOk: false`) always miss. Spam inside the cooldown is ignored.
 */
export function scrapFightPunch(input: {
  state: ScrapFightState;
  nowMs: number;
  timing: ScrapFightTiming;
  /** Hold power 0..1. Default 1 keeps older call sites at full strength. */
  charge?: number;
  /** Shape-match effort 0..1 from holding ALIGN. Default 1 = legacy full match. */
  align?: number;
  /** False for uppercut / hook thrown outside SCRAP_HOOK_RANGE_M. */
  reachOk?: boolean;
  move?: ScrapMoveKind;
}): {
  state: ScrapFightState;
  result: ScrapPunchResult;
  /** 0..100 — shown on screen. */
  score: number;
  cue: ScrapCue;
  /** Charge that actually landed (clamped). */
  charge: number;
  align: number;
  overlap: ScrapOverlapQuality;
  move: ScrapMoveKind;
  damage: number;
  counter: boolean;
  reason?: "grace" | "cooldown" | "tired";
} {
  const { state, nowMs, timing } = input;
  const move = input.move ?? "cross";
  const moveSpec = scrapMove(move);
  const charge = Math.min(1, Math.max(0, input.charge ?? 1));
  const align = Math.min(1, Math.max(0, input.align ?? 1));
  const at = scrapCueAt(state, nowMs, timing);
  const empty = {
    state,
    result: "ignored" as const,
    score: 0,
    cue: at.cue,
    charge,
    align,
    overlap: "miss" as const,
    move,
    damage: 0,
    counter: false,
  };
  if (state.outcome !== "pending") return empty;
  if (scrapBeatAt(state, nowMs, timing).grace) return { ...empty, reason: "grace" as const };
  if (scrapHypeClapping(state, nowMs)) return { ...empty, reason: "cooldown" as const };
  if (nowMs < state.recoveryUntilMs || nowMs - state.lastPunchAtMs < SCRAP_FIGHT_PUNCH_COOLDOWN_MS) {
    return { ...empty, reason: "cooldown" as const };
  }
  if (state.yourStamina < moveSpec.staminaCost) return { ...empty, reason: "tired" as const };

  const reachOk = input.reachOk !== false;
  const counter = nowMs <= state.counterUntilMs;
  // A perfect guard is itself the opening: an immediate, aligned counter may
  // connect even when the normal red target is closed.
  const overlap = reachOk
    ? counter && align >= SCRAP_ALIGN_GLANCE
      ? "locked"
      : scrapOverlapQuality(at.cue, align)
    : "miss";
  const tier = scrapPunchTierFromOverlap(overlap);
  const score =
    tier === "miss"
      ? 0
      : tier === "close"
        ? Math.round(30 + align * 25)
        : align >= 0.95 && at.fuel >= 0.95
          ? 100
          : Math.round(55 + align * 45 * at.fuel);
  const damage = scrapPunchDamage(tier, charge) * moveSpec.damageMultiplier * (counter ? 1.18 : 1);
  const theirHp = Math.max(0, state.theirHp - damage);
  const usedHype = scrapHypePowerLive(state, nowMs) && charge >= 0.98;
  const next: ScrapFightState = {
    ...state,
    punchIndex: state.punchIndex + 1,
    lastPunchAtMs: nowMs,
    recoveryUntilMs: nowMs + moveSpec.recoveryMs,
    yourStamina: Math.max(0, state.yourStamina - moveSpec.staminaCost),
    theirHp,
    landedAtMs: damage > 0 ? nowMs : state.landedAtMs,
    lastResult: tier,
    // A swing into nothing leaves you open. A landed one does not.
    exposedUntilMs: tier === "miss" ? nowMs + SCRAP_FIGHT_EXPOSED_MS : state.exposedUntilMs,
    hypePowerUntilMs: usedHype ? 0 : state.hypePowerUntilMs,
  };
  if (theirHp <= 0) {
    return {
      state: { ...next, outcome: "player_win" },
      result: tier,
      score,
      cue: at.cue,
      charge,
      align,
      overlap,
      move,
      damage,
      counter,
    };
  }
  return { state: next, result: tier, score, cue: at.cue, charge, align, overlap, move, damage, counter };
}
