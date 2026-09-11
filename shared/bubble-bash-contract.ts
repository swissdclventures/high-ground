import {
  defaultBubbleMatchConfig,
  hitDistanceM,
  normalizeBubbleMatchConfig,
  overlapPushM,
  type BubbleMatchConfig,
} from "./bubble-match-contract";

/**
 * Bubble Bash — avatar-bubble knockback game.
 *
 * Feel law: a successful impact is a shove, a visible squash-and-spring, a
 * short loss of control, and a loud thud. A 1 m slide is a failed hit. The
 * Scrap KO solver (3.2 m cap, 1 m blind cap on empty ground) must never plan
 * a Bubble Bash bounce — the pitch wall is the only clamp.
 */

export const BUBBLE_BASH_VERSION = 1 as const;
export const BUBBLE_LEGACY_KNOCK_CAP_M = 3.2;
export const BUBBLE_KNOCK_MIN_M = 5;
export const BUBBLE_KNOCK_MAX_M = 22;
export const BUBBLE_LIFT_MIN_M = 0.6;
export const BUBBLE_LIFT_MAX_M = 2.8;

export interface BubbleBashAppConfig {
  enabled: boolean;
  botEnabled: boolean;
  /**
   * Arm the Bubble Lab capability probe (scene/src/plugins/bubble-lab.ts).
   *
   * Off in every published World. It only ARMS the admin panel — nothing moves
   * until an admin presses START — but the rig drives a real player's body, so
   * it must never be something a scene turns on by accident.
   */
  labMode: boolean;
  knockbackM: number;
  liftM: number;
  hitCooldownMs: number;
  chargeHoldMs: number;
  dashM: number;
  /** Live-tunable match. The in-world lab writes this; a Builder save must keep it. */
  match: BubbleMatchConfig;
}

export function defaultBubbleBashAppConfig(): BubbleBashAppConfig {
  return {
    enabled: false,
    botEnabled: true,
    labMode: false,
    knockbackM: 9,
    liftM: 1.6,
    hitCooldownMs: 750,
    chargeHoldMs: 800,
    dashM: 10,
    match: defaultBubbleMatchConfig(),
  };
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeBubbleBashAppConfig(raw: unknown): BubbleBashAppConfig {
  const base = defaultBubbleBashAppConfig();
  if (!raw || typeof raw !== "object") return base;
  const partial = raw as Partial<BubbleBashAppConfig>;
  const rawKnock = partial.knockbackM;
  const knockbackM =
    typeof rawKnock === "number" && Number.isFinite(rawKnock) && rawKnock > BUBBLE_LEGACY_KNOCK_CAP_M
      ? num(rawKnock, base.knockbackM, BUBBLE_KNOCK_MIN_M, BUBBLE_KNOCK_MAX_M)
      : base.knockbackM;
  return {
    enabled: partial.enabled === true,
    botEnabled: partial.botEnabled !== false,
    labMode: partial.labMode === true,
    knockbackM,
    liftM: num(partial.liftM, base.liftM, BUBBLE_LIFT_MIN_M, BUBBLE_LIFT_MAX_M),
    hitCooldownMs: num(partial.hitCooldownMs, base.hitCooldownMs, 200, 5000),
    chargeHoldMs: num(partial.chargeHoldMs, base.chargeHoldMs, 300, 2500),
    dashM: num(partial.dashM, base.dashM, 3, 16),
    match: normalizeBubbleMatchConfig(partial.match ?? base.match),
  };
}

export function bubbleHitPower(speedMps: number, charge01: number): number {
  const speed = Math.max(0.45, Math.min(1.75, (Number.isFinite(speedMps) ? speedMps : 0) / 7));
  const charge = 1 + Math.max(0, Math.min(1, charge01)) * 1.35;
  return Math.max(0.45, Math.min(2.8, speed * charge));
}

export interface BubbleImpactRoles {
  iAmAttacker: boolean;
  myPower: number;
  theirPower: number;
}

export function bubbleImpactRoles(speedMps: number, charge01: number, dashing: boolean): BubbleImpactRoles {
  const smash = dashing || charge01 >= 0.35;
  const smashPower = bubbleHitPower(Math.max(speedMps, dashing ? 11 : 0), charge01);
  if (smash) {
    return {
      iAmAttacker: true,
      myPower: 0.28 + (1 - Math.min(1, charge01)) * 0.12,
      theirPower: smashPower,
    };
  }
  const bump = bubbleHitPower(speedMps, 0);
  return { iAmAttacker: false, myPower: bump, theirPower: bump };
}

export interface BubbleKnockPlan {
  destX: number;
  destY: number;
  destZ: number;
  apexX: number;
  apexY: number;
  apexZ: number;
  backM: number;
  liftM: number;
  knockMs: number;
}

export function bubbleKnockMs(backM: number): number {
  return Math.round(Math.max(320, Math.min(720, 200 + backM * 24)));
}

export function planBubbleKnock(input: {
  originX: number;
  originY: number;
  originZ: number;
  foeX: number;
  foeZ: number;
  backM: number;
  liftM: number;
  hitDistM?: number;
  fallbackX?: number;
  fallbackZ?: number;
}): BubbleKnockPlan {
  const wantLift = Math.max(0, Math.min(BUBBLE_LIFT_MAX_M, input.liftM));
  const dx = input.originX - input.foeX;
  const dz = input.originZ - input.foeZ;
  const dist = Math.hypot(dx, dz);
  let nx: number;
  let nz: number;
  if (dist >= 0.08) {
    nx = dx / dist;
    nz = dz / dist;
  } else {
    const fx = input.fallbackX ?? 0;
    const fz = input.fallbackZ ?? 1;
    const fl = Math.hypot(fx, fz) || 1;
    nx = fx / fl;
    nz = fz / fl;
  }
  const push = overlapPushM(dist, input.hitDistM ?? hitDistanceM(defaultBubbleMatchConfig()));
  const wantBack = Math.max(BUBBLE_KNOCK_MIN_M, Math.min(BUBBLE_KNOCK_MAX_M, Math.max(0, input.backM, push)));
  return {
    destX: input.originX + nx * wantBack,
    destY: input.originY,
    destZ: input.originZ + nz * wantBack,
    apexX: input.originX + nx * wantBack * 0.42,
    apexY: input.originY + wantLift,
    apexZ: input.originZ + nz * wantBack * 0.42,
    backM: wantBack,
    liftM: wantLift,
    knockMs: bubbleKnockMs(wantBack),
  };
}

export function bubbleSquashPinch(t01: number): number {
  const t = Math.max(0, Math.min(1, t01));
  if (t < 0.18) return (t / 0.18) * 0.42;
  if (t < 0.48) {
    const u = (t - 0.18) / 0.3;
    return 0.42 * (1 - u) - 0.2 * u;
  }
  const u = (t - 0.48) / 0.52;
  return -0.2 * (1 - u) * (1 - u);
}

export function bubbleCharge01(heldMs: number, chargeHoldMs: number): number {
  const hold = Math.max(1, chargeHoldMs);
  return Math.max(0, Math.min(1, heldMs / hold));
}

export const BUBBLE_BUS_TYPES = [
  "bubble.hit",
  "bubble.score",
  "bubble.state",
  "bubble.hello",
  "bubble.peer",
  "bubble.intent",
  "bubble.snapshot",
  "bubble.event",
  "bubble.frame",
] as const;

export interface BubbleHitMessage {
  type: "bubble.hit";
  id: string;
  from: string;
  to: string;
  fromX: number;
  fromZ: number;
  power: number;
}

export type BubbleScoreReason = "ringout" | "goal" | "hot" | "designated" | "ball" | "rush";

export interface BubbleScoreMessage {
  type: "bubble.score";
  id: string;
  from: string;
  reason: BubbleScoreReason;
  against: "A" | "B";
  victim: string;
  scoreA: number;
  scoreB: number;
}

export interface BubbleStateMessage {
  type: "bubble.state";
  from: string;
  scoreA: number;
  scoreB: number;
  seq: number;
}

export type BubbleBusMessage = BubbleHitMessage | BubbleScoreMessage | BubbleStateMessage;
