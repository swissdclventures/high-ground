/**
 * Per-NPC Scrap skill — pure, no SDK.
 *
 * Skill is DERIVED, never a fourth thing the owner has to fill in: the group's
 * attitude sets the base, the wardrobe nudges it (a leather jacket fights
 * harder than a skirt), and the NPC's own seed jitters it so two guys in the
 * same jacket are not clones. An explicit per-group override always wins.
 *
 * One number, 0..1, feeds one tuning table. No per-NPC branching anywhere else.
 */

import { SCRAP_PATTERNS, type ScrapFightTiming, type ScrapPattern } from "./scrap-fight";

export type ScrapAttitude = "friendly" | "aloof" | "cocky";

export const SCRAP_SKILL_BY_ATTITUDE: Record<ScrapAttitude, number> = {
  friendly: 0.3,
  aloof: 0.5,
  cocky: 0.75,
};

export const SCRAP_SKILL_DEFAULT = 0.5;
export const SCRAP_SKILL_JITTER = 0.1;

/**
 * Wardrobe read. Matched against the group name, dress code and outfit names,
 * lowercased. First hit in each direction counts — this is a nudge, not a sum.
 */
export const SCRAP_SKILL_HARD_WORDS: readonly string[] = [
  "leather",
  "jacket",
  "biker",
  "punk",
  "boots",
  "bouncer",
  "guard",
  "brawler",
  "boxer",
  "muscle",
];

export const SCRAP_SKILL_SOFT_WORDS: readonly string[] = [
  "skirt",
  "dress",
  "heels",
  "gown",
  "pastel",
  "tourist",
  "guest",
  "kid",
  "flower",
  "silk",
];

export const SCRAP_SKILL_WARDROBE_NUDGE = 0.15;

export interface ScrapSkillInput {
  npcIndex: number;
  attitude?: ScrapAttitude | null;
  /** Group name, dress code, outfit names — anything that describes the look. */
  looks?: readonly string[];
  /** Explicit per-group value from `scrap.configure`. Wins outright. */
  override?: number | null;
}

function mix(a: number, b: number): number {
  return Math.imul((a ^ 0x9e3779b9) + b, 2654435761) >>> 0;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** −1 soft, 0 neutral, +1 hard. */
export function scrapWardrobeRead(looks: readonly string[] | undefined): number {
  if (!looks || !looks.length) return 0;
  const blob = looks.join(" ").toLowerCase();
  const hard = SCRAP_SKILL_HARD_WORDS.some((word) => blob.includes(word));
  const soft = SCRAP_SKILL_SOFT_WORDS.some((word) => blob.includes(word));
  if (hard && !soft) return 1;
  if (soft && !hard) return -1;
  return 0;
}

export function scrapSkillFor(input: ScrapSkillInput): number {
  if (typeof input.override === "number" && Number.isFinite(input.override)) {
    return clamp01(input.override);
  }
  const base = input.attitude ? SCRAP_SKILL_BY_ATTITUDE[input.attitude] : SCRAP_SKILL_DEFAULT;
  const wardrobe = scrapWardrobeRead(input.looks) * SCRAP_SKILL_WARDROBE_NUDGE;
  const jitter = ((mix(input.npcIndex, 0x5c8a1) % 2001) / 1000 - 1) * SCRAP_SKILL_JITTER;
  return clamp01(base + wardrobe + jitter);
}

/** 1–3, for the `Fight ★★★` hover text. You know what you are walking into. */
export function scrapSkillStars(skill: number): 1 | 2 | 3 {
  if (skill >= 0.68) return 3;
  if (skill >= 0.42) return 2;
  return 1;
}

export function scrapSkillStarText(skill: number): string {
  const stars = scrapSkillStars(skill);
  return "★".repeat(stars) + "☆".repeat(3 - stars);
}

export type ScrapSkillTuning = ScrapFightTiming;

export type ScrapSkillTier = "soft" | "mid" | "boss";

/** Three tiers. The boss is the one guy who is too strong. */
export function scrapSkillTier(skill: number): ScrapSkillTier {
  const t = clamp01(skill);
  if (t >= 0.68) return "boss";
  if (t >= 0.42) return "mid";
  return "soft";
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Which rhythm this opponent fights to. Seeded, so the same NPC keeps its tell. */
export function scrapPatternFor(npcIndex: number, skill: number): ScrapPattern {
  if (scrapSkillTier(skill) === "boss") return SCRAP_PATTERNS[SCRAP_PATTERNS.length - 1]!;
  const pool = SCRAP_PATTERNS.slice(0, SCRAP_PATTERNS.length - 1);
  return pool[mix(npcIndex, 0x7a77) % pool.length]!;
}

/**
 * One table, driven by skill. Soft fights slow and takes a couple of charged
 * reds; the boss still fights fastest, but every tier leaves a learnable read.
 */
export function scrapSkillTuning(skill: number, npcIndex = 0): ScrapSkillTuning {
  const t = clamp01(skill);
  const tier = scrapSkillTier(t);
  return {
    speed: lerp(1.45, 1, t),
    theirHp: tier === "boss" ? 8 : tier === "mid" ? 5 : 3,
    jabDamage: tier === "boss" ? 0.7 : 0.45,
    crossDamage: tier === "boss" ? 1.2 : 0.85,
    pattern: scrapPatternFor(npcIndex, t),
  };
}

/** Backers who peel off to watch. Cocky crews travel in packs. */
export function scrapBackerCount(_skill: number, max: number): number {
  // ONE ON ONE. Onlookers were the "two NPCs switching places" in the ring:
  // a second leased avatar standing on the fight spot. Nobody else is borrowed
  // for a bout, whatever the config says.
  void max;
  return 0;
}
