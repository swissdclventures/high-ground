/**
 * THE FIGHT METER — one definition, every bar.
 *
 * Health, stamina and hype are the same physical object in different colours.
 * Before this file each one carried its own width, height and tint inline, so
 * "YOU" was 290 wide and 14 tall while STAMINA was 280 wide and 10 tall and the
 * whole top of the screen read as a developer panel rather than a game HUD.
 *
 * Everything a bar can differ by lives in exactly two inputs: a FAMILY (the
 * gradient) and a fraction. Dimensions, frame, gloss, MAX and CRITICAL come
 * from here and are not overridable — that is the point.
 *
 * Pure module: no SDK import, so the maths is unit-testable and the same
 * numbers drive the NPC fight and the Human Edition ring.
 */

export interface ScrapBarRgb {
  r: number;
  g: number;
  b: number;
}

/**
 * The one geometry. `fillH` is the coloured track; `frame` is the chunky dark
 * border on every side, so a bar occupies `fillH + frame * 2` on screen.
 */
export const SCRAP_BAR = {
  width: 250,
  fillH: 22,
  frame: 4,
  /** Total painted height — width/height parity is what makes the row read as a set. */
  get totalH(): number {
    return this.fillH + this.frame * 2;
  },
  /** Inner track width once the frame is removed from both sides. */
  get innerW(): number {
    return this.width - this.frame * 2;
  },
  labelH: 17,
  labelSize: 13,
  valueSize: 13,
  /** Gradient resolution. 12 reads as a smooth ramp and costs 12 ui entities. */
  segments: 12,
  /** Glossy highlight covers this much of the fill from the top. */
  glossFraction: 0.42,
  /** Bevel / inset shadow along the bottom of the track, in px. */
  bevelH: 3,
  /** At or below this the bar is in trouble. */
  criticalFraction: 0.25,
  /** At or above this the bar is full. */
  maxFraction: 0.995,
} as const;

export type ScrapBarFamily = "you" | "them" | "stamina" | "hype";

export interface ScrapBarGradient {
  /** Empty end — muted and dark. */
  from: ScrapBarRgb;
  /** Full end — saturated and strong, so max feels powerful. */
  to: ScrapBarRgb;
  /** Label / value text and the MAX glow. */
  text: ScrapBarRgb;
}

/**
 * Colour is the ONLY thing a caller picks. Every family runs dark → vivid so
 * the same bar shape reads as "nearly gone" or "loaded" at a glance.
 */
export const SCRAP_BAR_FAMILY: Readonly<Record<ScrapBarFamily, ScrapBarGradient>> = {
  you: {
    from: { r: 0.05, g: 0.3, b: 0.13 },
    to: { r: 0.36, g: 1, b: 0.46 },
    text: { r: 0.6, g: 1, b: 0.68 },
  },
  them: {
    from: { r: 0.32, g: 0.04, b: 0.04 },
    to: { r: 1, g: 0.24, b: 0.16 },
    text: { r: 1, g: 0.6, b: 0.52 },
  },
  stamina: {
    from: { r: 0.03, g: 0.22, b: 0.33 },
    to: { r: 0.3, g: 0.92, b: 1 },
    text: { r: 0.6, g: 0.92, b: 1 },
  },
  hype: {
    from: { r: 0.24, g: 0.07, b: 0.42 },
    to: { r: 1, g: 0.72, b: 0.18 },
    text: { r: 1, g: 0.82, b: 0.45 },
  },
};

export type ScrapBarState = "normal" | "critical" | "max";

export function scrapBarFraction(value: number, max: number): number {
  if (!(max > 0)) return 0;
  const f = value / max;
  if (!Number.isFinite(f)) return 0;
  return Math.max(0, Math.min(1, f));
}

/** MAX wins over CRITICAL; an empty bar is critical, not "normal". */
export function scrapBarState(fraction: number): ScrapBarState {
  const f = Math.max(0, Math.min(1, fraction));
  if (f >= SCRAP_BAR.maxFraction) return "max";
  if (f <= SCRAP_BAR.criticalFraction) return "critical";
  return "normal";
}

/**
 * State pulse, 0 → 1. Restrained on purpose: a HUD that strobes during a fight
 * is a HUD the player learns to ignore. MAX breathes; critical warns slowly;
 * a normal bar does not move at all.
 */
export function scrapBarPulse(state: ScrapBarState, nowMs: number): number {
  if (state === "normal") return 0;
  const hz = state === "max" ? 1.15 : 0.85;
  const phase = (nowMs / 1000) * hz * Math.PI * 2;
  return 0.5 + 0.5 * Math.sin(phase);
}

export interface ScrapBarSegment {
  /** Left edge as a fraction of the track width. */
  left: number;
  /** Width as a fraction of the track width. */
  width: number;
  tint: ScrapBarRgb;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixRgb(a: ScrapBarRgb, b: ScrapBarRgb, t: number): ScrapBarRgb {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

/**
 * The gradient, as drawable slices.
 *
 * SDK7 UI has no gradient fill, so the ramp is N flat slices whose tint is
 * sampled along the FULL bar — not along the filled part. That matters: sample
 * along the fill and a half-empty bar would still show its brightest colour at
 * the fill edge, which kills the "stronger as it approaches maximum" read.
 * The last slice is clipped to the exact fraction so the edge never snaps.
 */
export function scrapBarSegments(input: {
  fraction: number;
  family: ScrapBarFamily;
  segments?: number;
}): ScrapBarSegment[] {
  const count = Math.max(1, Math.round(input.segments ?? SCRAP_BAR.segments));
  const fraction = Math.max(0, Math.min(1, input.fraction));
  if (fraction <= 0) return [];
  const grad = SCRAP_BAR_FAMILY[input.family];
  const step = 1 / count;
  const out: ScrapBarSegment[] = [];
  for (let i = 0; i < count; i += 1) {
    const left = i * step;
    if (left >= fraction) break;
    const width = Math.min(step, fraction - left);
    // Sample at the slice centre along the whole track, never along the fill.
    const t = count === 1 ? 1 : (i + 0.5) / count;
    out.push({ left, width, tint: mixRgb(grad.from, grad.to, t) });
  }
  return out;
}

/** Right-hand readout on a bar. MAX replaces the number; it is the loud state. */
export function scrapBarValueText(fraction: number, state: ScrapBarState): string {
  if (state === "max") return "MAX";
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}
