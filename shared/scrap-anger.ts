/**
 * The argument before the fight — pure, no SDK.
 *
 * THREE PRESSES. Not a meter you mash: three deliberate presses of E, each
 * with a visible consequence. One — they notice you and turn. Two — they say
 * something and give you a look (a line from the persona library and one of
 * three gestures). Three — they come at you, SHOVE you, and it is on. The bar
 * still exists so you can see where you are (1/3, 2/3, full), but every press
 * is worth exactly a third and the heat only bleeds away if you stop for a
 * while — "press E like a madman and hope" is gone.
 */

import { scrapLine, type ScrapPersona } from "./scrap-lines";

export const SCRAP_ANGER_PRESSES = 3;
export const SCRAP_ANGER_PER_PRESS = 1 / SCRAP_ANGER_PRESSES + 0.001;
/** Slow: walk off mid-argument and it cools, but a breath between presses does not. */
export const SCRAP_ANGER_DECAY_PER_SEC = 0.05;
/** Presses inside this window are one mash, not two arguments. */
export const SCRAP_ANGER_PRESS_COOLDOWN_MS = 320;
export const SCRAP_ANGER_FULL = 1;

/** The third press plays out (they walk up and shove) before the ring opens. */
export const SCRAP_ANGER_BOIL_HOLD_MS = 1400;

export interface ScrapAngerState {
  value: number;
  lastPressAtMs: number;
  /** When the bar first hit full; 0 while it is not. */
  fullSinceMs: number;
  /** Latches once the bar has held full - the fight starts exactly once. */
  boiled: boolean;
}

export function emptyScrapAnger(): ScrapAngerState {
  return { value: 0, lastPressAtMs: 0, fullSinceMs: 0, boiled: false };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** One press is one third, whoever they are. Skill shapes the FIGHT, not the argument. */
export function scrapAngerGain(_skill: number): number {
  return SCRAP_ANGER_PER_PRESS;
}

export function scrapAngerPress(
  state: ScrapAngerState,
  nowMs: number,
  skill: number
): ScrapAngerState {
  if (state.boiled) return state;
  if (nowMs - state.lastPressAtMs < SCRAP_ANGER_PRESS_COOLDOWN_MS) return state;
  const value = clamp01(state.value + scrapAngerGain(skill));
  const full = value >= SCRAP_ANGER_FULL;
  return {
    value,
    lastPressAtMs: nowMs,
    fullSinceMs: full ? state.fullSinceMs || nowMs : 0,
    boiled: false,
  };
}

/**
 * Heat bleeds off when you stop pressing, so a walk-away still works. A FULL
 * bar does not bleed - it holds, and after SCRAP_ANGER_BOIL_HOLD_MS it boils.
 */
export function scrapAngerTick(state: ScrapAngerState, dtMs: number, nowMs = 0): ScrapAngerState {
  if (state.boiled) return state;
  if (state.value >= SCRAP_ANGER_FULL) {
    const since = state.fullSinceMs || nowMs;
    if (nowMs && nowMs - since >= SCRAP_ANGER_BOIL_HOLD_MS) {
      return { ...state, fullSinceMs: since, boiled: true };
    }
    return state.fullSinceMs ? state : { ...state, fullSinceMs: since };
  }
  if (state.value <= 0) return state;
  const drop = (SCRAP_ANGER_DECAY_PER_SEC * Math.min(500, Math.max(0, dtMs))) / 1000;
  const value = clamp01(state.value - drop);
  return value === state.value ? state : { ...state, value, fullSinceMs: 0 };
}

/** Presses still needed from cold. Drives the "keep pressing" copy. */
export function scrapAngerPressesToBoil(skill: number): number {
  return Math.ceil(SCRAP_ANGER_FULL / scrapAngerGain(skill));
}

export type ScrapAngerMood = "cold" | "warming" | "hot" | "boiling";

export function scrapAngerMood(value: number): ScrapAngerMood {
  if (value >= SCRAP_ANGER_FULL) return "boiling";
  if (value >= 0.66) return "hot";
  if (value > 0) return "warming";
  return "cold";
}

/**
 * What they DO when your pressing crosses a stage. Every threshold has a
 * consequence you can see and hear - a line, a gesture, and at the top a
 * shove - so pressing E is never silent and the escalation is something that
 * happens TO you, not a number that ticks up.
 */
export type ScrapProvocationStage = 0 | 1 | 2 | 3;

export function scrapProvocationStage(value: number): ScrapProvocationStage {
  if (value >= 1) return 3;
  if (value >= 0.66) return 2;
  if (value > 0.33) return 1;
  return 0;
}

export interface ScrapProvocationBeat {
  stage: ScrapProvocationStage;
  /** Fight-emote roles to choose from, by seed. */
  emotes: readonly ScrapProvocationEmote[];
  /** True = they close in and movePlayerTo-shove you. */
  shove: boolean;
  /** True = they WALK UP to you first (stage 3). */
  approach: boolean;
}

export type ScrapProvocationEmote = "attention" | "taunt1" | "taunt2" | "taunt3" | "push";

export const SCRAP_PROVOCATION_BEATS: readonly ScrapProvocationBeat[] = [
  // One: they notice you. Turn, face you, a "what?" of the chest.
  { stage: 1, emotes: ["attention"], shove: false, approach: false },
  // Two: a line and one of three looks — angry, dismissive, "what's up".
  { stage: 2, emotes: ["taunt1", "taunt2", "taunt3"], shove: false, approach: false },
  // Three: they come at you and PUSH. The ring opens when the push lands.
  { stage: 3, emotes: ["push"], shove: true, approach: true },
];

export function scrapProvocationBeat(stage: ScrapProvocationStage): ScrapProvocationBeat | null {
  return SCRAP_PROVOCATION_BEATS.find((b) => b.stage === stage) ?? null;
}

export function scrapProvocationEmote(stage: ScrapProvocationStage, seed: number): ScrapProvocationEmote | null {
  const beat = scrapProvocationBeat(stage);
  if (!beat) return null;
  return beat.emotes[Math.abs(seed) % beat.emotes.length] ?? null;
}

/**
 * YOUR call-out when you press E. Chest Open reads as "come on" from any
 * distance — not a punch (that's the ring) and not a wave (that's a greeting).
 * Same clip every counted press so the provocation is always visible.
 */
export function scrapPlayerProvokeRole(_stage: ScrapProvocationStage = 1): ScrapProvocationEmote {
  return "taunt1";
}

/** Stage line: persona-flavoured. Kept here so the troupe has one import. */
export function scrapProvocationLine(
  stage: ScrapProvocationStage,
  seed: number,
  persona: ScrapPersona = "default"
): string | null {
  if (stage < 1) return null;
  return scrapLine(persona, stage as 1 | 2 | 3, seed);
}
