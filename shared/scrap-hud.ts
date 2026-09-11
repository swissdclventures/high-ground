/**
 * Scrap fight HUD maths — pure, no SDK.
 *
 * Two health bars side by side at the top of the frame (YOU left, THEM right),
 * a chip that lags behind the drain so you SEE the chunk you just lost, a
 * floating damage number, an impact burst, and a low-health pulse.
 *
 * Bars drain instead of snapping: a bar that jumps is a bar nobody notices.
 */

/** Health units drained per second — a 3-point bar empties one pip in ~0.45 s. */
export const SCRAP_BAR_DRAIN_PER_SEC = 2.2;
/** The white chip holds, then catches up slower than the fill. */
export const SCRAP_CHIP_HOLD_MS = 220;
export const SCRAP_CHIP_DRAIN_PER_SEC = 1.1;
export const SCRAP_DMG_POP_MS = 620;
export const SCRAP_DMG_RISE_M = 0.45;
/**
 * The hit flash. 260 ms was over before the eye caught it - "sometimes I don't
 * see them land". Slower and bigger: a landed punch should read as an event.
 */
export const SCRAP_IMPACT_MS = 520;
export const SCRAP_IMPACT_MAX_SCALE = 1.45;
export const SCRAP_LOW_HEALTH_FRACTION = 0.4;
export const SCRAP_PULSE_HZ = 1.6;

export interface ScrapRgb {
  r: number;
  g: number;
  b: number;
}

/** Move a displayed bar value toward the real one. Never overshoots. */
export function scrapBarDrain(
  displayed: number,
  target: number,
  dtMs: number,
  perSecond: number = SCRAP_BAR_DRAIN_PER_SEC
): number {
  if (dtMs <= 0) return displayed;
  const step = (Math.max(0, perSecond) * Math.min(dtMs, 250)) / 1000;
  if (displayed > target) return Math.max(target, displayed - step);
  if (displayed < target) return Math.min(target, displayed + step);
  return target;
}

/** The chip waits `SCRAP_CHIP_HOLD_MS` after the last damage, then catches up. */
export function scrapChipDrain(
  chip: number,
  target: number,
  nowMs: number,
  lastDamageAtMs: number,
  dtMs: number
): number {
  if (nowMs - lastDamageAtMs < SCRAP_CHIP_HOLD_MS) return chip;
  return scrapBarDrain(chip, target, dtMs, SCRAP_CHIP_DRAIN_PER_SEC);
}

export function scrapHealthFraction(remaining: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, remaining / total));
}

/** Green while healthy, amber at a third gone, red on the last pip. */
export function scrapHealthTint(fraction: number): ScrapRgb {
  if (fraction > 0.66) return { r: 0.22, g: 0.95, b: 0.36 };
  if (fraction > 0.33) return { r: 1, g: 0.72, b: 0.12 };
  return { r: 1, g: 0.18, b: 0.12 };
}

/**
 * Hold-to-charge meter: green at the start, orange through the climb, red at max.
 * Charge 0 is still green (empty track); only the fill colour climbs with power.
 */
export function scrapChargeTint(charge: number): ScrapRgb {
  const t = Math.max(0, Math.min(1, charge));
  if (t <= 0.5) {
    const u = t / 0.5;
    return {
      r: 0.22 + (1 - 0.22) * u,
      g: 0.95 + (0.6 - 0.95) * u,
      b: 0.36 + (0.16 - 0.36) * u,
    };
  }
  const u = (t - 0.5) / 0.5;
  return {
    r: 1,
    g: 0.6 + (0.18 - 0.6) * u,
    b: 0.16 + (0.12 - 0.16) * u,
  };
}

export interface ScrapAimSquareVisual {
  /** Bottom-to-top fill shared by target alignment and punch power. */
  fill: number;
  border: ScrapRgb;
  fillTint: ScrapRgb;
  borderEmissive: number;
  fillEmissive: number;
  /** The attack square yields completely while a defensive read is active. */
  visible: boolean;
  /** The one unambiguous strongest-release state. */
  max: boolean;
}

/**
 * One square, one reading. Holding an attack both aligns and charges, so the
 * inner square fills from the bottom by the weaker of those two values. The
 * border carries timing: dim wait, amber close, gold opening, green MAX.
 * Incoming attacks hide this square so the glove cue owns the frame.
 */
export function scrapAimSquareVisual(input: {
  cue: "wait" | "close" | "now" | "incoming";
  charge: number;
  align: number;
}): ScrapAimSquareVisual {
  const charge = Math.max(0, Math.min(1, input.charge));
  const align = Math.max(0, Math.min(1, input.align));
  const fill = Math.min(charge, align);
  if (input.cue === "incoming") {
    return {
      fill: 0,
      border: { r: 0.72, g: 0.74, b: 0.78 },
      fillTint: { r: 0.72, g: 0.74, b: 0.78 },
      borderEmissive: 0,
      fillEmissive: 0,
      visible: false,
      max: false,
    };
  }

  const max = input.cue === "now" && charge >= 0.98 && align >= 0.98;
  if (max) {
    return {
      fill: 1,
      border: { r: 0.28, g: 1, b: 0.42 },
      fillTint: { r: 0.28, g: 1, b: 0.42 },
      borderEmissive: 24,
      fillEmissive: 28,
      visible: true,
      max: true,
    };
  }
  if (input.cue === "now") {
    return {
      fill,
      border: { r: 1, g: 0.82, b: 0.22 },
      fillTint: { r: 1, g: 0.7, b: 0.12 },
      borderEmissive: 14,
      fillEmissive: 12,
      visible: true,
      max: false,
    };
  }
  if (input.cue === "close") {
    return {
      fill,
      border: { r: 1, g: 0.58, b: 0.16 },
      fillTint: { r: 0.94, g: 0.48, b: 0.12 },
      borderEmissive: 7,
      fillEmissive: 6,
      visible: true,
      max: false,
    };
  }
  return {
    fill,
    border: { r: 0.78, g: 0.8, b: 0.84 },
    fillTint: { r: 0.68, g: 0.7, b: 0.74 },
    borderEmissive: 1.5,
    fillEmissive: 2.5,
    visible: true,
    max: false,
  };
}

export type ScrapBlockCue = "left" | "right" | "both" | null;

/**
 * Which glove edge owns the defensive read. Jabs threaten the right, ordinary
 * crosses the left, and the deliberately big heavy/boss cross asks for both.
 * Raising both is already a valid guard in the fight engine.
 */
export function scrapBlockCue(
  swing: "jab" | "cross" | null,
  patternId: string
): ScrapBlockCue {
  if (!swing) return null;
  if (swing === "jab") return "right";
  if (patternId === "heavy" || patternId === "boss") return "both";
  return "left";
}

/** Floating "-1": rises, grows a touch, fades out. */
export function scrapDamagePop(elapsedMs: number): { alpha: number; rise: number; scale: number } {
  if (elapsedMs < 0 || elapsedMs >= SCRAP_DMG_POP_MS) return { alpha: 0, rise: 0, scale: 0 };
  const u = elapsedMs / SCRAP_DMG_POP_MS;
  const alpha = u < 0.12 ? u / 0.12 : Math.max(0, 1 - (u - 0.12) / 0.88);
  return {
    alpha,
    rise: SCRAP_DMG_RISE_M * (1 - (1 - u) ** 2),
    scale: 0.8 + 0.5 * Math.min(1, u * 4),
  };
}

/** Impact star: snaps open, fades fast. */
export function scrapImpactBurst(elapsedMs: number): { alpha: number; scale: number } {
  if (elapsedMs < 0 || elapsedMs >= SCRAP_IMPACT_MS) return { alpha: 0, scale: 0 };
  const u = elapsedMs / SCRAP_IMPACT_MS;
  return {
    alpha: Math.max(0, 1 - u * u),
    scale: SCRAP_IMPACT_MAX_SCALE * (0.25 + 0.75 * (1 - (1 - u) ** 3)),
  };
}

/** Red edge pulse once you are one hit from the floor. 0 while healthy. */
export function scrapLowHealthPulse(fraction: number, nowMs: number): number {
  if (fraction > SCRAP_LOW_HEALTH_FRACTION) return 0;
  const depth = 1 - fraction / SCRAP_LOW_HEALTH_FRACTION;
  const wave = 0.55 + 0.45 * Math.sin((nowMs / 1000) * SCRAP_PULSE_HZ * Math.PI * 2);
  return Math.max(0, Math.min(1, depth * wave));
}

/**
 * A left-anchored fill inside a 1-wide bar: the plane keeps its centre, so a
 * shrinking fill has to shift left by half of what it lost.
 */
export function scrapBarFillPlane(fraction: number, width: number): { width: number; offsetX: number } {
  const f = Math.max(0, Math.min(1, fraction));
  return { width: width * f, offsetX: -(width * (1 - f)) / 2 };
}

/**
 * How long the threatened-glove edge keeps shining after their swing
 * resolves. Long enough to see; short enough not to lie about the next beat.
 */
export const SCRAP_GLOVE_GLOW_LINGER_MS = 500;

/**
 * Glow on the glove you must raise. Ramps through their wind-up (BLUE→RED),
 * pulses once committed, then lingers. The quiet glove stays at 0.
 */
export function scrapGloveBlockGlow(input: {
  threatened: boolean;
  locked: boolean;
  settle: number;
  linger: number;
  nowMs: number;
}): { intensity: number; lockedLook: boolean } {
  const settle = Math.max(0, Math.min(1, input.settle));
  const linger = Math.max(0, Math.min(1, input.linger));
  if (!input.threatened && linger <= 0) return { intensity: 0, lockedLook: false };
  // settle is 0 at wind-up and 1 at contact; lock fires at 0.4. Normalize
  // so the glove edge is already fully on when the swing is committed.
  const ramp = Math.max(0, Math.min(1, settle / 0.4));
  const live = input.threatened ? (input.locked ? 1 : 0.32 + 0.68 * ramp) : 0.55 * linger;
  const pulse =
    input.locked && input.threatened
      ? 0.76 + 0.24 * (0.5 + 0.5 * Math.sin((input.nowMs / 1000) * 6.5 * Math.PI * 2))
      : 1;
  return { intensity: live * pulse, lockedLook: input.locked && input.threatened };
}

/**
 * One fight hint, TWO WORDS MAXIMUM. Attack timing lives in the fill square
 * and incoming defense lives on the gloves; the numbers live in the big score
 * readout — copy this short never competes with either.
 */
export function scrapFightHint(input: {
  safe: boolean;
  exposed: boolean;
  incoming: boolean;
  overlap: "miss" | "glance" | "locked";
  aligning: boolean;
  cue: "wait" | "close" | "now" | "incoming";
}): string {
  if (input.safe) return "CLOSER";
  if (input.exposed) return "EXPOSED";
  if (input.incoming) return "";
  if (input.overlap === "locked" || input.overlap === "glance" || input.aligning) return "";
  return "";
}
