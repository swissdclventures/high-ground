/**
 * Bubble Bash — live match tunables + the impact resolver.
 *
 * Nothing here imports the SDK. The in-world panel mutates this config every
 * frame; the tests lock the maths so a knob cannot silently do nothing.
 *
 * Humans have no physics body in Decentraland. NPCs and the ball do. This file
 * owns the numbers both paths share: fresh-impact gating, knock force, angle,
 * combos, projectile state, trajectories.
 */

export type Team = "A" | "B";
export type SlotKind = "human" | "npc" | "empty";
export type NpcBehaviour =
  | "aggressive"
  | "defensive"
  | "rescue"
  | "support"
  | "projectile"
  | "chaos"
  | "dummy";
export type ArenaPreset = "small" | "medium" | "large" | "xlarge";
export type WallMode = "bounce" | "soft" | "open" | "goal";
export type BoostMode = "instant" | "charge";
export type ChargeCurve = "linear" | "ease" | "stepped";
export type SpeedCurve = "linear" | "quadratic" | "stepped";
export type ResolverKind = "hybrid" | "scripted" | "physical";
export type LaunchSampling = "single" | "arc" | "chain";
export type TrajectoryKind = "straight" | "arc" | "pinball" | "heavy" | "cartoon";
export type GameMode = "ringout" | "designated" | "hot" | "ball" | "rush" | "sandbox";
export type MatchFormat = "1v1" | "2v2" | "3v3";

export interface BubbleSlot {
  team: Team;
  kind: SlotKind;
  behaviour: NpcBehaviour;
}

export interface BubbleMatchConfig {
  format: MatchFormat;
  slots: BubbleSlot[];
  arenaPreset: ArenaPreset;
  wallMode: WallMode;
  wallRestitution: number;
  bubbleDiameterM: number;
  accelMps2: number;
  maxSpeedMps: number;
  decelMps2: number;
  turnRateDegS: number;
  highSpeedTurnScale: number;
  dragPerS: number;
  massKg: number;
  boostEnabled: boolean;
  boostMode: BoostMode;
  boostImpulseMps: number;
  chargeMaxMs: number;
  chargeCurve: ChargeCurve;
  boostDurationMs: number;
  boostCooldownMs: number;
  knockMultiplier: number;
  speedScaling01: number;
  speedCurve: SpeedCurve;
  angleScaling01: number;
  angleProfile: { frontal: number; side: number; rear: number };
  freshImpactMultiplier: number;
  sustainedContactForce: number;
  separationM: number;
  impactResetMs: number;
  attackerRecoveryMs: number;
  victimRecoveryMs: number;
  recoverySteer01: number;
  recoveryLocksBoost: boolean;
  comboWindowMs: number;
  comboMult2: number;
  comboMult3: number;
  launchTeammateMult: number;
  projectileMs: number;
  projectileImpactMult: number;
  projectileMaxSpeedMps: number;
  projectileSteer01: number;
  projectileCancelsOnHit: boolean;
  passMultipliers: number[];
  resolver: ResolverKind;
  launchSampling: LaunchSampling;
  trajectory: TrajectoryKind;
  launchLiftM: number;
  launchDurationMs: number;
  launchDamping: number;
  launchSteer01: number;
  gameMode: GameMode;
  scoreLimit: number;
  respawnMs: number;
  pauseAfterScore: boolean;
  resetAfterScore: boolean;
  hotTargetBonus: number;
  hotTargetMs: number;
  hotTargetEveryMs: number;
  ballMassKg: number;
  ballRestitution: number;
  ballDragPerS: number;
  debugHud: boolean;
  debugVectors: boolean;
  /** Local mute. Not a match rule — each client keeps their own. */
  soundOn: boolean;
  /**
   * Drive WASD with movePlayerTo so speed/accel pills change YOUR body.
   * Off = Decentraland's own walk (the pills then only move bots).
   */
  driveWalk: boolean;
  /** Optional hop (E) so you can jump over a bubble. Space stays smash. */
  hopEnabled: boolean;
  hopLiftM: number;
  hopForwardM: number;
  hopDurationMs: number;
  hopCooldownMs: number;
}

export const ARENA_PRESET_M: Record<ArenaPreset, number> = {
  small: 24,
  medium: 40,
  large: 64,
  xlarge: 96,
};

export const KNOCK_PRESETS = [1, 2, 4, 8, 16] as const;

/** Shift+WASD on the pitch. Explorer run is too slow; the match drives this itself. */
export const BUBBLE_SPRINT_ACCEL_MPS2 = 62;
export const BUBBLE_SPRINT_MAX_MPS = 28;
export const BUBBLE_SPRINT_STEP_HZ = 4;
export const BUBBLE_SPRINT_CARRY_S = 1 / BUBBLE_SPRINT_STEP_HZ;

export const MATCH_PRESET_IDS = [
  "heavyBumpers",
  "speedGame",
  "teamCombo",
  "humanBilliards",
  "scriptedArcade",
  "chaos",
  "ballPool",
  "rushLine",
  "mobile",
] as const;
export type MatchPresetId = (typeof MATCH_PRESET_IDS)[number];

export const MATCH_PRESET_LABELS: Record<MatchPresetId, string> = {
  heavyBumpers: "HEAVY",
  speedGame: "SPEED",
  teamCombo: "COMBO",
  humanBilliards: "BILLIARD",
  scriptedArcade: "ARCADE",
  chaos: "CHAOS",
  ballPool: "BALL",
  rushLine: "RUSH",
  mobile: "PHONE",
};

function slot(team: Team, kind: SlotKind, behaviour: NpcBehaviour): BubbleSlot {
  return { team, kind, behaviour };
}

export function defaultSlots(format: MatchFormat): BubbleSlot[] {
  if (format === "3v3") {
    return [
      slot("A", "human", "dummy"),
      slot("A", "npc", "support"),
      slot("A", "npc", "dummy"),
      slot("B", "npc", "aggressive"),
      slot("B", "npc", "aggressive"),
      slot("B", "npc", "dummy"),
    ];
  }
  if (format === "2v2") {
    return [
      slot("A", "human", "dummy"),
      slot("A", "npc", "support"),
      slot("B", "npc", "aggressive"),
      slot("B", "npc", "dummy"),
      slot("A", "empty", "dummy"),
      slot("B", "empty", "dummy"),
    ];
  }
  return [
    slot("A", "human", "dummy"),
    slot("B", "npc", "aggressive"),
    slot("A", "empty", "dummy"),
    slot("B", "empty", "dummy"),
    slot("A", "empty", "dummy"),
    slot("B", "empty", "dummy"),
  ];
}

export function defaultBubbleMatchConfig(): BubbleMatchConfig {
  return {
    format: "2v2",
    slots: defaultSlots("2v2"),
    arenaPreset: "medium",
    wallMode: "soft",
    wallRestitution: 0.85,
    bubbleDiameterM: 2.3,
    accelMps2: 48,
    maxSpeedMps: 20,
    decelMps2: 14,
    turnRateDegS: 360,
    highSpeedTurnScale: 0.45,
    dragPerS: 0.6,
    massKg: 80,
    boostEnabled: true,
    boostMode: "charge",
    boostImpulseMps: 14,
    chargeMaxMs: 800,
    chargeCurve: "ease",
    boostDurationMs: 220,
    boostCooldownMs: 900,
    knockMultiplier: 1,
    speedScaling01: 1,
    speedCurve: "linear",
    angleScaling01: 0.7,
    angleProfile: { frontal: 1, side: 1.4, rear: 1.8 },
    freshImpactMultiplier: 1.35,
    sustainedContactForce: 0.1,
    separationM: 2.6,
    impactResetMs: 420,
    attackerRecoveryMs: 180,
    victimRecoveryMs: 420,
    recoverySteer01: 0.25,
    recoveryLocksBoost: true,
    comboWindowMs: 420,
    comboMult2: 2.5,
    comboMult3: 5,
    launchTeammateMult: 1.8,
    projectileMs: 1400,
    projectileImpactMult: 1.6,
    projectileMaxSpeedMps: 22,
    projectileSteer01: 0.2,
    projectileCancelsOnHit: true,
    passMultipliers: [2, 3, 5],
    resolver: "hybrid",
    launchSampling: "arc",
    trajectory: "arc",
    launchLiftM: 1.6,
    launchDurationMs: 480,
    launchDamping: 0.35,
    launchSteer01: 0.15,
    gameMode: "ball",
    scoreLimit: 3,
    respawnMs: 1400,
    pauseAfterScore: false,
    resetAfterScore: false,
    hotTargetBonus: 2,
    hotTargetMs: 8000,
    hotTargetEveryMs: 12000,
    ballMassKg: 12,
    ballRestitution: 0.92,
    ballDragPerS: 0.35,
    debugHud: true,
    debugVectors: false,
    soundOn: true,
    driveWalk: true,
    hopEnabled: true,
    hopLiftM: 1.8,
    hopForwardM: 1.4,
    hopDurationMs: 420,
    hopCooldownMs: 800,
  };
}

const TEAMS: Team[] = ["A", "B"];
const KINDS: SlotKind[] = ["human", "npc", "empty"];
const BEHAVIOURS: NpcBehaviour[] = [
  "aggressive",
  "defensive",
  "rescue",
  "support",
  "projectile",
  "chaos",
  "dummy",
];
const PRESETS: ArenaPreset[] = ["small", "medium", "large", "xlarge"];
const WALLS: WallMode[] = ["bounce", "soft", "open", "goal"];
const BOOSTS: BoostMode[] = ["instant", "charge"];
const CHARGES: ChargeCurve[] = ["linear", "ease", "stepped"];
const SPEEDS: SpeedCurve[] = ["linear", "quadratic", "stepped"];
const RESOLVERS: ResolverKind[] = ["hybrid", "scripted", "physical"];
const SAMPLINGS: LaunchSampling[] = ["single", "arc", "chain"];
const TRAJECTORIES: TrajectoryKind[] = ["straight", "arc", "pinball", "heavy", "cartoon"];
const MODES: GameMode[] = ["ringout", "designated", "hot", "ball", "rush", "sandbox"];
const FORMATS: MatchFormat[] = ["1v1", "2v2", "3v3"];

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function one<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function normalizeSlot(raw: unknown, fallback: BubbleSlot): BubbleSlot {
  if (!raw || typeof raw !== "object") return fallback;
  const partial = raw as Partial<BubbleSlot>;
  return {
    team: one(partial.team, TEAMS, fallback.team),
    kind: one(partial.kind, KINDS, fallback.kind),
    behaviour: one(partial.behaviour, BEHAVIOURS, fallback.behaviour),
  };
}

export function normalizeBubbleMatchConfig(raw: unknown): BubbleMatchConfig {
  const base = defaultBubbleMatchConfig();
  if (!raw || typeof raw !== "object") return base;
  const p = raw as Partial<BubbleMatchConfig>;
  const format = one(p.format, FORMATS, base.format);
  const slotSource = Array.isArray(p.slots) && p.slots.length > 0 ? p.slots : defaultSlots(format);
  const padded = defaultSlots(format).map((fallback, i) => normalizeSlot(slotSource[i], fallback));
  const passes = Array.isArray(p.passMultipliers) ? p.passMultipliers : base.passMultipliers;
  const angle = p.angleProfile && typeof p.angleProfile === "object" ? p.angleProfile : base.angleProfile;
  return {
    format,
    slots: padded,
    arenaPreset: one(p.arenaPreset, PRESETS, base.arenaPreset),
    wallMode: one(p.wallMode, WALLS, base.wallMode),
    wallRestitution: num(p.wallRestitution, base.wallRestitution, 0, 1.2),
    bubbleDiameterM: num(p.bubbleDiameterM, base.bubbleDiameterM, 2, 3.2),
    accelMps2: num(p.accelMps2, base.accelMps2, 8, 80),
    maxSpeedMps: num(p.maxSpeedMps, base.maxSpeedMps, 6, 36),
    decelMps2: num(p.decelMps2, base.decelMps2, 4, 40),
    turnRateDegS: num(p.turnRateDegS, base.turnRateDegS, 90, 900),
    highSpeedTurnScale: num(p.highSpeedTurnScale, base.highSpeedTurnScale, 0, 1),
    dragPerS: num(p.dragPerS, base.dragPerS, 0, 4),
    massKg: num(p.massKg, base.massKg, 40, 200),
    boostEnabled: flag(p.boostEnabled, base.boostEnabled),
    boostMode: one(p.boostMode, BOOSTS, base.boostMode),
    boostImpulseMps: num(p.boostImpulseMps, base.boostImpulseMps, 4, 40),
    chargeMaxMs: num(p.chargeMaxMs, base.chargeMaxMs, 300, 2500),
    chargeCurve: one(p.chargeCurve, CHARGES, base.chargeCurve),
    boostDurationMs: num(p.boostDurationMs, base.boostDurationMs, 0, 1200),
    boostCooldownMs: num(p.boostCooldownMs, base.boostCooldownMs, 0, 4000),
    knockMultiplier: snapKnock(p.knockMultiplier, base.knockMultiplier),
    speedScaling01: num(p.speedScaling01, base.speedScaling01, 0, 1),
    speedCurve: one(p.speedCurve, SPEEDS, base.speedCurve),
    angleScaling01: num(p.angleScaling01, base.angleScaling01, 0, 1),
    angleProfile: {
      frontal: num(angle.frontal, base.angleProfile.frontal, 0.2, 3),
      side: num(angle.side, base.angleProfile.side, 0.2, 3),
      rear: num(angle.rear, base.angleProfile.rear, 0.2, 3),
    },
    freshImpactMultiplier: num(p.freshImpactMultiplier, base.freshImpactMultiplier, 0.5, 3),
    sustainedContactForce: num(p.sustainedContactForce, base.sustainedContactForce, 0, 1),
    separationM: num(p.separationM, base.separationM, 0.4, 8),
    impactResetMs: num(p.impactResetMs, base.impactResetMs, 80, 2000),
    attackerRecoveryMs: num(p.attackerRecoveryMs, base.attackerRecoveryMs, 0, 2000),
    victimRecoveryMs: num(p.victimRecoveryMs, base.victimRecoveryMs, 0, 3000),
    recoverySteer01: num(p.recoverySteer01, base.recoverySteer01, 0, 1),
    recoveryLocksBoost: flag(p.recoveryLocksBoost, base.recoveryLocksBoost),
    comboWindowMs: num(p.comboWindowMs, base.comboWindowMs, 150, 800),
    comboMult2: num(p.comboMult2, base.comboMult2, 1, 6),
    comboMult3: num(p.comboMult3, base.comboMult3, 1, 10),
    launchTeammateMult: num(p.launchTeammateMult, base.launchTeammateMult, 1, 4),
    projectileMs: num(p.projectileMs, base.projectileMs, 200, 4000),
    projectileImpactMult: num(p.projectileImpactMult, base.projectileImpactMult, 1, 5),
    projectileMaxSpeedMps: num(p.projectileMaxSpeedMps, base.projectileMaxSpeedMps, 8, 40),
    projectileSteer01: num(p.projectileSteer01, base.projectileSteer01, 0, 1),
    projectileCancelsOnHit: flag(p.projectileCancelsOnHit, base.projectileCancelsOnHit),
    passMultipliers: [0, 1, 2].map((i) => num(passes[i], base.passMultipliers[i] ?? 2, 1, 8)),
    resolver: one(p.resolver, RESOLVERS, base.resolver),
    launchSampling: one(p.launchSampling, SAMPLINGS, base.launchSampling),
    trajectory: one(p.trajectory, TRAJECTORIES, base.trajectory),
    launchLiftM: num(p.launchLiftM, base.launchLiftM, 0, 4),
    launchDurationMs: num(p.launchDurationMs, base.launchDurationMs, 180, 1200),
    launchDamping: num(p.launchDamping, base.launchDamping, 0, 1),
    launchSteer01: num(p.launchSteer01, base.launchSteer01, 0, 1),
    gameMode: one(p.gameMode, MODES, base.gameMode),
    scoreLimit: num(p.scoreLimit, base.scoreLimit, 1, 21),
    respawnMs: num(p.respawnMs, base.respawnMs, 400, 5000),
    pauseAfterScore: flag(p.pauseAfterScore, base.pauseAfterScore),
    resetAfterScore: flag(p.resetAfterScore, base.resetAfterScore),
    hotTargetBonus: num(p.hotTargetBonus, base.hotTargetBonus, 1, 5),
    hotTargetMs: num(p.hotTargetMs, base.hotTargetMs, 2000, 20000),
    hotTargetEveryMs: num(p.hotTargetEveryMs, base.hotTargetEveryMs, 1000, 30000),
    ballMassKg: num(p.ballMassKg, base.ballMassKg, 2, 80),
    ballRestitution: num(p.ballRestitution, base.ballRestitution, 0, 1.2),
    ballDragPerS: num(p.ballDragPerS, base.ballDragPerS, 0, 4),
    debugHud: flag(p.debugHud, base.debugHud),
    debugVectors: flag(p.debugVectors, base.debugVectors),
    soundOn: flag(p.soundOn, base.soundOn),
    driveWalk: flag(p.driveWalk, base.driveWalk),
    hopEnabled: flag(p.hopEnabled, base.hopEnabled),
    hopLiftM: num(p.hopLiftM, base.hopLiftM, 0.4, 4),
    hopForwardM: num(p.hopForwardM, base.hopForwardM, 0, 6),
    hopDurationMs: num(p.hopDurationMs, base.hopDurationMs, 180, 900),
    hopCooldownMs: num(p.hopCooldownMs, base.hopCooldownMs, 200, 2500),
  };
}

/** Ring-out / rush / open / goal: let the body leave the square so a score can happen. */
export function knockClampInsetM(cfg: BubbleMatchConfig, containInsetM: number): number {
  if (
    cfg.gameMode === "ringout" ||
    cfg.gameMode === "rush" ||
    cfg.wallMode === "open" ||
    cfg.wallMode === "goal"
  ) {
    return -64;
  }
  return containInsetM;
}

/** Leaving any edge of the play square awards the other side. */
export function matchScoresOnExit(cfg: BubbleMatchConfig): boolean {
  if (cfg.gameMode === "rush" || cfg.gameMode === "ball") return false;
  return cfg.gameMode === "ringout" || cfg.wallMode === "open";
}

export type ArenaExit =
  | { kind: "ringout" }
  | { kind: "endline"; winner: Team }
  | { kind: "goal"; winner: Team };

/**
 * Ring-out is "they just stepped off this pitch", not "they exist anywhere
 * else on the plot". `clampToArena` and a leftover wasInPlay flag both turn a
 * plaza boxing hop into a teleport onto the bubble square.
 */
export function bubblePitchLeave(
  playerIn: boolean,
  wasInPlay: boolean
): { nextInPlay: boolean; left: boolean } {
  if (playerIn) return { nextInPlay: true, left: false };
  if (!wasInPlay) return { nextInPlay: false, left: false };
  return { nextInPlay: false, left: true };
}

/**
 * Smash steals Space, and a launch may freeze walk, only while the guest is
 * still on this pitch. The moment they step off, both locks must drop — a
 * leftover InputModifier is what stranded people outside the floor.
 */
export function bubbleMatchSteersInput(playerIn: boolean, scrapOwnsInput: boolean): boolean {
  return playerIn && !scrapOwnsInput;
}

export function bubbleWalkLockSurvives(playerIn: boolean, scrapOwnsInput: boolean, walkLocked: boolean): boolean {
  if (!bubbleMatchSteersInput(playerIn, scrapOwnsInput)) return false;
  return walkLocked;
}

/**
 * What crossing the pitch edge means right now.
 *
 * Rush: only the two team-back lines (local X) score. The Z lights are
 * crossable. Ball: only the Z goals score. Ring-out: any edge scores.
 */
export function classifyArenaExit(
  cfg: BubbleMatchConfig,
  lx: number,
  lz: number,
  half: number
): ArenaExit | null {
  const pastX = Math.abs(lx) > half;
  const pastZ = Math.abs(lz) > half;
  if (!pastX && !pastZ) return null;
  if (cfg.gameMode === "rush") {
    if (!pastX) return null;
    return { kind: "endline", winner: lx > 0 ? "A" : "B" };
  }
  if (cfg.gameMode === "ball" || cfg.wallMode === "goal") {
    if (!pastZ) return null;
    return { kind: "goal", winner: lz > 0 ? "A" : "B" };
  }
  if (cfg.gameMode === "ringout" || cfg.wallMode === "open") {
    return { kind: "ringout" };
  }
  return null;
}

export function matchPreset(id: MatchPresetId): BubbleMatchConfig {
  const d = defaultBubbleMatchConfig();
  if (id === "heavyBumpers") {
    return normalizeBubbleMatchConfig({
      ...d,
      knockMultiplier: 8,
      speedScaling01: 0.35,
      maxSpeedMps: 8,
      accelMps2: 16,
      trajectory: "heavy",
      launchLiftM: 0.8,
      wallRestitution: 0.55,
      freshImpactMultiplier: 1.6,
    });
  }
  if (id === "speedGame") {
    return normalizeBubbleMatchConfig({
      ...d,
      knockMultiplier: 2,
      speedScaling01: 1,
      speedCurve: "quadratic",
      maxSpeedMps: 28,
      accelMps2: 70,
      trajectory: "pinball",
      launchLiftM: 0.4,
      wallRestitution: 1.1,
      boostImpulseMps: 24,
    });
  }
  if (id === "teamCombo") {
    return normalizeBubbleMatchConfig({
      ...d,
      format: "2v2",
      slots: defaultSlots("2v2"),
      comboMult2: 3,
      comboMult3: 6,
      launchTeammateMult: 2.2,
      projectileMs: 1800,
    });
  }
  if (id === "humanBilliards") {
    return normalizeBubbleMatchConfig({
      ...d,
      format: "2v2",
      slots: defaultSlots("2v2"),
      gameMode: "sandbox",
      trajectory: "pinball",
      wallMode: "bounce",
      wallRestitution: 1.15,
      launchTeammateMult: 2.6,
      projectileSteer01: 0,
      launchSampling: "chain",
    });
  }
  if (id === "scriptedArcade") {
    return normalizeBubbleMatchConfig({
      ...d,
      resolver: "scripted",
      trajectory: "cartoon",
      launchSampling: "single",
      launchLiftM: 2.4,
      knockMultiplier: 8,
      launchDurationMs: 700,
    });
  }
  if (id === "chaos") {
    return normalizeBubbleMatchConfig({
      ...d,
      format: "3v3",
      slots: defaultSlots("3v3").map((s, i) =>
        i === 0 ? s : { ...s, kind: "npc" as const, behaviour: "chaos" as const }
      ),
      knockMultiplier: 16,
      trajectory: "cartoon",
      wallRestitution: 1.2,
      gameMode: "sandbox",
    });
  }
  if (id === "ballPool") {
    return normalizeBubbleMatchConfig({
      ...d,
      gameMode: "ball",
      wallMode: "soft",
      scoreLimit: 3,
      knockMultiplier: 1,
      maxSpeedMps: 12,
      accelMps2: 22,
      trajectory: "arc",
      boostMode: "charge",
      hopEnabled: true,
      driveWalk: true,
    });
  }
  if (id === "rushLine") {
    return normalizeBubbleMatchConfig({
      ...d,
      gameMode: "rush",
      wallMode: "open",
      scoreLimit: 3,
      knockMultiplier: 4,
      maxSpeedMps: 14,
      accelMps2: 24,
    });
  }
  return normalizeBubbleMatchConfig({
    ...d,
    boostMode: "instant",
    maxSpeedMps: 10,
    accelMps2: 18,
    turnRateDegS: 420,
    knockMultiplier: 4,
    launchDurationMs: 380,
    debugHud: true,
  });
}

function snapKnock(value: unknown, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  let best: number = KNOCK_PRESETS[0]!;
  for (const preset of KNOCK_PRESETS) {
    if (Math.abs(preset - n) < Math.abs(best - n)) best = preset;
  }
  return best;
}

export function chargeAmount01(heldMs: number, cfg: BubbleMatchConfig): number {
  const t = Math.max(0, Math.min(1, heldMs / Math.max(1, cfg.chargeMaxMs)));
  if (cfg.chargeCurve === "linear") return t;
  if (cfg.chargeCurve === "ease") return t * t * (3 - 2 * t);
  if (t < 1 / 3) return 0.33;
  if (t < 2 / 3) return 0.66;
  return 1;
}

/** lerp(1, speedCurve(approach), speedScaling01). 0 = fixed force, 1 = fully speed-driven. */
export function speedScale(speedMps: number, cfg: BubbleMatchConfig): number {
  const u = Math.max(0, Math.min(1, speedMps / Math.max(0.1, cfg.maxSpeedMps)));
  let curved = u;
  if (cfg.speedCurve === "quadratic") curved = u * u;
  else if (cfg.speedCurve === "stepped") curved = u < 0.33 ? 0.3 : u < 0.66 ? 0.6 : 1;
  return 1 + (curved - 1) * cfg.speedScaling01;
}

export function angleBand(dot: number): "frontal" | "side" | "rear" {
  if (dot > 0.5) return "frontal";
  if (dot < -0.5) return "rear";
  return "side";
}

export function angleScale(dot: number, cfg: BubbleMatchConfig): number {
  const band = angleBand(dot);
  const profile = cfg.angleProfile[band];
  return 1 + (profile - 1) * cfg.angleScaling01;
}

export function hitDistanceM(cfg: BubbleMatchConfig): number {
  return Math.max(1.4, cfg.bubbleDiameterM * 0.91);
}

/**
 * How far to push two overlapping shells apart. Zero when they are already clear.
 * The slack stops the next frame from counting as a fresh merge.
 */
export function overlapPushM(distM: number, hitDistM: number, slackM = 0.45): number {
  const dist = Number.isFinite(distM) ? Math.max(0, distM) : 0;
  const hit = Number.isFinite(hitDistM) ? Math.max(0.4, hitDistM) : 2.1;
  if (dist >= hit) return 0;
  return hit - dist + Math.max(0, slackM);
}

/** Unit axis from one actor toward another. Coincident bodies get a fallback, never a zero vector. */
export function contactAxis(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  fallbackX = 0,
  fallbackZ = 1
): { x: number; z: number; dist: number } {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const dist = Math.hypot(dx, dz);
  if (dist >= 0.08) return { x: dx / dist, z: dz / dist, dist };
  const fl = Math.hypot(fallbackX, fallbackZ) || 1;
  return { x: fallbackX / fl, z: fallbackZ / fl, dist };
}

export function minSeparationKnockM(distM: number, hitDistM: number, knockM: number): number {
  return Math.max(knockM, overlapPushM(distM, hitDistM));
}

/**
 * Vertical centre of the shell above the avatar's feet.
 *
 * A Ø2.3 m sphere sitting on the floor only reaches 2.3 m. Hair and hats sit
 * above a 1.8 m body, so the old 1.05 m centre (top at 2.2 m) left heads out.
 * Lift the centre; keep a small ground gap rather than burying the membrane.
 */
export function bubbleCenterY(diameterM: number): number {
  const diameter = Number.isFinite(diameterM) ? diameterM : 2.3;
  return Math.max(1.32, diameter * 0.5 + 0.08);
}

export function sweptClosestT(
  a0x: number,
  a0z: number,
  a1x: number,
  a1z: number,
  b0x: number,
  b0z: number,
  b1x: number,
  b1z: number
): { t: number; dist: number } {
  const rx = a0x - b0x;
  const rz = a0z - b0z;
  const vx = a1x - a0x - (b1x - b0x);
  const vz = a1z - a0z - (b1z - b0z);
  const vv = vx * vx + vz * vz;
  const t = vv < 1e-6 ? 0 : Math.max(0, Math.min(1, -(rx * vx + rz * vz) / vv));
  return { t, dist: Math.hypot(rx + vx * t, rz + vz * t) };
}

export function isFreshImpact(input: {
  lastSeparationM: number;
  lastImpactAtMs: number;
  nowMs: number;
  cfg: BubbleMatchConfig;
}): boolean {
  if (input.lastSeparationM >= input.cfg.separationM) return true;
  return input.nowMs - input.lastImpactAtMs >= input.cfg.impactResetMs;
}

export interface ImpactActor {
  id: string;
  team: Team;
  speedMps: number;
  headingX: number;
  headingZ: number;
  projectile: boolean;
  passCount: number;
}

export interface ImpactContact {
  nx: number;
  nz: number;
  t: number;
}

export interface ImpactResult {
  gated: boolean;
  fresh: boolean;
  force: number;
  knockM: number;
  liftM: number;
  durationMs: number;
  dirX: number;
  dirZ: number;
  victimProjectile: boolean;
  multipliers: {
    knock: number;
    speed: number;
    angle: number;
    combo: number;
    projectile: number;
    teammate: number;
    fresh: number;
    sustained: number;
  };
}

const BASE_KNOCK_M = 4.5;

export function resolveImpact(input: {
  attacker: ImpactActor;
  victim: ImpactActor;
  contact: ImpactContact;
  cfg: BubbleMatchConfig;
  lastSeparationM: number;
  lastImpactAtMs: number;
  nowMs: number;
  comboHits: number;
}): ImpactResult {
  const { attacker, victim, contact, cfg } = input;
  const fresh = isFreshImpact(input);
  const knock = cfg.knockMultiplier;
  const speed = speedScale(attacker.speedMps, cfg);
  const headingLen = Math.hypot(attacker.headingX, attacker.headingZ) || 1;
  const hx = attacker.headingX / headingLen;
  const hz = attacker.headingZ / headingLen;
  const nLen = Math.hypot(contact.nx, contact.nz) || 1;
  const nx = contact.nx / nLen;
  const nz = contact.nz / nLen;
  const angle = angleScale(hx * nx + hz * nz, cfg);
  const comboHits = Math.max(1, Math.min(3, Math.round(input.comboHits)));
  const combo = comboHits >= 3 ? cfg.comboMult3 : comboHits === 2 ? cfg.comboMult2 : 1;
  const proj =
    attacker.projectile
      ? cfg.projectileImpactMult *
        (cfg.passMultipliers[Math.max(0, Math.min(cfg.passMultipliers.length - 1, attacker.passCount))] ?? 1)
      : 1;
  const teammate = attacker.team === victim.team && attacker.id !== victim.id ? cfg.launchTeammateMult : 1;
  const freshMul = fresh ? cfg.freshImpactMultiplier : 1;
  const sustained = fresh ? 1 : cfg.sustainedContactForce;
  const force = knock * speed * angle * combo * proj * teammate * freshMul * sustained;
  const distScale = cfg.trajectory === "cartoon" ? 2 : cfg.trajectory === "pinball" ? 1.15 : 1;
  // Gated contact is overlap, not a smash. A 0.4 m retrigger every frame locked
  // walk and glued the shells together — especially in pinball.
  const knockM = fresh ? Math.max(0.4, BASE_KNOCK_M * force * distScale) : 0;
  // Lift does NOT scale with knock. ×1 therefore reads as a hop (up more than
  // out). ×16 reads as a shove (out more than up). That is why a low knock
  // felt like "jumping higher" — the height was always there; the slide was not.
  const lift =
    cfg.trajectory === "pinball"
      ? cfg.launchLiftM * 0.25
      : cfg.trajectory === "cartoon"
        ? cfg.launchLiftM * 1.6
        : cfg.launchLiftM;
  return {
    gated: !fresh,
    fresh,
    force,
    knockM,
    liftM: lift,
    durationMs: cfg.launchDurationMs,
    dirX: nx,
    dirZ: nz,
    victimProjectile: teammate > 1,
    multipliers: {
      knock,
      speed,
      angle,
      combo,
      projectile: proj,
      teammate,
      fresh: freshMul,
      sustained,
    },
  };
}

export function sampleTrajectory(input: {
  originX: number;
  originY: number;
  originZ: number;
  dirX: number;
  dirZ: number;
  knockM: number;
  liftM: number;
  kind: TrajectoryKind;
  damping: number;
  t01: number;
}): { x: number; y: number; z: number } {
  const t = Math.max(0, Math.min(1, input.t01));
  const len = Math.hypot(input.dirX, input.dirZ) || 1;
  const nx = input.dirX / len;
  const nz = input.dirZ / len;
  let along = input.knockM * t;
  let lift = 0;
  if (input.kind === "straight") {
    along = input.knockM * (t + (1 - t) * (1 - input.damping) * 0);
    along = input.knockM * (1 - Math.pow(1 - t, 1 + input.damping * 2));
    lift = input.liftM * Math.sin(Math.PI * t) * 0.25;
  } else if (input.kind === "arc") {
    along = input.knockM * t;
    const apexAt = 0.45;
    lift = t <= apexAt
      ? input.liftM * (t / apexAt)
      : input.liftM * (1 - (t - apexAt) / (1 - apexAt));
  } else if (input.kind === "pinball") {
    along = input.knockM * t;
    lift = input.liftM * 0.15 * Math.sin(Math.PI * t);
  } else if (input.kind === "heavy") {
    const u = t < 1 / 3 ? t / (1 / 3) * 0.7 : 0.7 + ((t - 1 / 3) / (2 / 3)) * 0.3;
    along = input.knockM * u;
    lift = input.liftM * 0.35 * Math.sin(Math.PI * t);
  } else {
    along = input.knockM * 2 * t;
    lift = input.liftM * 1.8 * Math.sin(Math.PI * Math.min(1, t / 0.55));
    if (t > 0.7) along = input.knockM * 2 * (0.7 + (t - 0.7) * 0.4);
  }
  return {
    x: input.originX + nx * along,
    y: input.originY + Math.max(0, lift),
    z: input.originZ + nz * along,
  };
}

export function playHalfM(cfg: BubbleMatchConfig, _placedHalfM = 0): number {
  void _placedHalfM;
  return ARENA_PRESET_M[cfg.arenaPreset] / 2;
}

/** Stamp the live play square onto the pitch. The placed object is only the centre. */
export function applyPlaySize(a: { halfW: number; halfD: number }, cfg: BubbleMatchConfig): void {
  const half = playHalfM(cfg);
  a.halfW = half;
  a.halfD = half;
}

export function wallRestitutionNow(cfg: BubbleMatchConfig): number {
  if (cfg.wallMode === "open") return 0;
  if (cfg.wallMode === "soft") return cfg.wallRestitution * 0.35;
  return cfg.wallRestitution;
}
