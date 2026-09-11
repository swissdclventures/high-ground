/**
 * SUCCESSION — what a piece of ground becomes when nobody touches it.
 *
 * The lawn had six rungs and all six were grass: 4 cm to 60 cm, five days end to
 * end, and then it stopped. That is a mowing simulator, not a garden. The owner's
 * ask was the opposite of a ceiling — "letting things go as crazy as growing tens of
 * metres into the sky, real jungles if you don't touch something for years... you may
 * change the destiny of the land".
 *
 * So the ladder keeps going, and the rungs above the grass change WHAT the ground is
 * rather than how tall its grass stands: scrub, then thicket, then saplings, then a
 * young wood, then old growth. Eleven rungs, and the last one takes over a year of
 * neglect to reach.
 *
 * ★ THE WOODY LINE IS THE GAME. Below rung 7 a walk mows: cross the cell and it goes
 * back to bare. At rung 7 and above the ground has gone woody and walking does
 * nothing at all — you cannot tread a thicket back into a lawn. Neglect stops being
 * reversible, which is the moment a garden acquires a history and a mistake acquires
 * a cost. Everything else here is scenery; this is the mechanic.
 *
 * ★ THE TREES ARE SCALE, THE GROUND BETWEEN THEM IS NOT. A rung-10 oak is the same
 * GLB as a rung-8 sapling with a bigger number on it, which is a law this repo already
 * keeps for the Garden's grass and the vegetation library's saplings, and it is what
 * let a lawn become a wood without waiting on an asset commission.
 *
 * But scale alone made a wood look like TREES ON A LAWN, because the cells between the
 * trunks went on drawing grass. What you stand in at rung 9 is not the canopy, it is
 * the layer at eye level, and that layer needed its own models. It has them now — see
 * understorey-contract.ts, which paints most non-stem cells above the woody line with
 * giant overlapping leaf cards for no extra entities and fewer triangles than the
 * grass it replaces.
 *
 * WHAT IS HONESTLY MISSING, and should not be pretended otherwise:
 *  - Climbers. There is still no vine. The understorey closes the ground and the trees
 *    close the sky, but nothing ties the two together, so a jungle reads as a dense
 *    floor under a canopy rather than as one tangled mass.
 *  - Felling. Nothing yet takes ground back DOWN across the woody line. That is the
 *    other half of "you may change the destiny of the land" and it needs a deliberate
 *    act with its own tool, not a walk.
 */

import { canopyModel } from "./canopy-contract";
import {
  VEGETATION_HEIGHT_M,
  VEGETATION_SHRUB_SPECIES,
  VEGETATION_VARIANTS,
  vegetationModelSrc,
  type VegetationSeason,
  type VegetationShrubSpecies,
} from "./vegetation-contract";

export const SUCCESSION_VERSION = 1 as const;

/** 0 mown … 10 old growth. */
export type SuccessionRung = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const SUCCESSION_MAX: SuccessionRung = 10;

/** What kind of thing stands on the ground at a rung. */
export type SuccessionKind = "grass" | "scrub" | "wood";

export interface SuccessionStep {
  rung: SuccessionRung;
  label: string;
  kind: SuccessionKind;
  /**
   * Hours of neglect to reach this rung, as a MULTIPLE of the scene's stageHours.
   *
   * The grass rungs are one step each, which keeps the lawn behaving exactly as it
   * always has: at the default 24 hours it is wild in five days. Above the grass the
   * steps stretch hard, because the point of the upper ladder is that it measures
   * seasons and years rather than afternoons. At 24 hours a step, rung 10 is about
   * sixteen months of nobody touching the ground.
   */
  steps: number;
  /** Roughly how tall this rung stands, metres. For the console and the budget. */
  heightM: number;
  /**
   * Scale for the rungs whose model is a fixed size — the scrub layer's ground cover.
   * A WOOD rung ignores it: its scale is derived from `heightM` against the species'
   * own mature height, so a 12 m columnar and an 8 m bare tree both arrive at the
   * rung's stated height instead of one towering over the other by half again.
   */
  scale: number;
  /** One line the console shows, so a rung explains itself. */
  note: string;
}

/**
 * The ladder.
 *
 * Rungs 0-5 are the six grass models and are unchanged — a scene that never gets
 * neglected behaves exactly as it did. 6 is the ground cover that arrived with the
 * fern and the meadow grass. 7 is library bushes; 8 upward is the jungle canopy.
 */
export const SUCCESSION: readonly SuccessionStep[] = [
  { rung: 0, label: "Mown", kind: "grass", steps: 0, heightM: 0.04, scale: 1, note: "Cut this week." },
  { rung: 1, label: "Short", kind: "grass", steps: 1, heightM: 0.08, scale: 1, note: "Tidy." },
  { rung: 2, label: "Healthy", kind: "grass", steps: 2, heightM: 0.14, scale: 1, note: "A lawn." },
  { rung: 3, label: "Long", kind: "grass", steps: 3, heightM: 0.26, scale: 1, note: "Wants cutting." },
  { rung: 4, label: "Overgrown", kind: "grass", steps: 4, heightM: 0.42, scale: 1, note: "Going over." },
  { rung: 5, label: "Wild", kind: "grass", steps: 5, heightM: 0.6, scale: 1, note: "Meadow. The old ceiling." },
  {
    rung: 6,
    label: "Scrub",
    kind: "scrub",
    steps: 10,
    heightM: 0.9,
    scale: 1.15,
    note: "Ferns and rank grass take hold. Ten days untouched.",
  },
  {
    rung: 7,
    label: "Thicket",
    kind: "wood",
    steps: 25,
    heightM: 1.4,
    scale: 0.14,
    note: "Bushes close in. Walking no longer clears it.",
  },
  {
    rung: 8,
    label: "Saplings",
    kind: "wood",
    steps: 62,
    heightM: 3.2,
    scale: 0.34,
    note: "Two months. Young trees over head height, jungle at eye level.",
  },
  {
    rung: 9,
    label: "Young wood",
    kind: "wood",
    steps: 165,
    heightM: 6.5,
    scale: 0.68,
    note: "Half a year. A canopy closes above, and you push through what is below.",
  },
  {
    rung: 10,
    label: "Old growth",
    kind: "wood",
    steps: 500,
    heightM: 11,
    scale: 1,
    note: "Over a year of neglect. The land has decided.",
  },
];

/**
 * The rung at which the ground turns woody and a walk stops undoing it.
 *
 * ★ This one constant is the game. Below it, neglect is a chore you can walk off; at
 * it and above, neglect is a decision you have already made.
 */
export const SUCCESSION_WOODY_RUNG: SuccessionRung = 7;

/**
 * What fraction of a bed's cells carry a woody stem at each rung.
 *
 * ‼️ A WOOD IS NOT A LAWN OF TREES. Every cell carrying grass is right — a bed is a
 * lawn and grass is continuous. Every cell carrying an 11 m tree is not a wood, it is
 * a solid green wall, and on a 16 m bed of 64 cells it is also 64 trees where three
 * belong. So the ladder THINS as it climbs: a thicket is dense with low stems, and
 * old growth is a handful of big trunks with rank grass between them, which is what a
 * real wood looks like from inside it.
 *
 * The numbers are also what keeps the budget honest. At rung 7 across a nine-bed plot
 * this is about 125 stems at roughly 120 triangles — some 15,000, on top of the lawn.
 * Without the thinning the same rung would be 288 stems and would not fit.
 */
export function successionStemDensity(rung: number): number {
  const r = clampSuccessionRung(rung);
  if (r < SUCCESSION_WOODY_RUNG) return 0;
  return [0.22, 0.12, 0.07, 0.04][r - SUCCESSION_WOODY_RUNG] ?? 0;
}

/**
 * Does THIS cell carry a stem at this rung?
 *
 * Hashed from the cell's own position, so the wood is the same for everyone and
 * survives a reload without a stored coordinate — and so a cell that grew a trunk
 * keeps it as the rungs climb rather than the wood rearranging itselfevery time.
 */
export function successionHasStem(rung: number, localX: number, localZ: number): boolean {
  const density = successionStemDensity(rung);
  if (density <= 0) return false;
  const xi = (Math.round(localX * 100) | 0) + 0x2545f491;
  const zi = (Math.round(localZ * 100) | 0) + 0x9e3779b9;
  let h = Math.imul(xi ^ (xi >>> 16), 0x7feb352d);
  h = Math.imul((h ^ zi) ^ ((h ^ zi) >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296 < density;
}

/**
 * Which GRASS model still shows between the plants at a rung.
 *
 * Below the woody line this is just the rung — the grass ladder is the whole ladder
 * and nothing has changed. Above it, the grass gets SHORTER AND GREENER as the canopy
 * closes, which looks backwards for a page about neglect and is the one place it
 * isn't: rank meadow grass is a full-sun plant. Shade it out under a thicket and what
 * survives on a wood's floor is shorter, greener and sparser.
 *
 * ‼️ It is also the difference between a jungle and a dead lawn with leaves on it. The
 * top grass model is `#8d8a2c`, a dry straw yellow that is exactly right for a meadow
 * going over in August and exactly wrong as the floor of a rainforest. Left alone it
 * was the most eye-catching colour in a mature bed.
 */
export function successionGrassStage(rung: number): number {
  const r = clampSuccessionRung(rung);
  if (r < SUCCESSION_WOODY_RUNG) return Math.min(r, 5);
  // thicket, saplings, young wood, old growth
  return [4, 3, 3, 3][r - SUCCESSION_WOODY_RUNG] ?? 3;
}

export function successionStep(rung: number): SuccessionStep {
  const r = Math.max(0, Math.min(SUCCESSION_MAX, Math.floor(rung) || 0));
  return SUCCESSION[r];
}

export function clampSuccessionRung(value: unknown): SuccessionRung {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(SUCCESSION_MAX, n)) as SuccessionRung;
}

/** Can a walk still take this ground back to bare? */
export function successionIsMowable(rung: number): boolean {
  return clampSuccessionRung(rung) < SUCCESSION_WOODY_RUNG;
}

/**
 * How far a cell has come, from the time it was last cut (or planted).
 *
 * Deliberately a search down the ladder rather than arithmetic: the steps are not
 * evenly spaced and never will be, because the whole point is that the first rungs
 * take a day and the last takes a year.
 */
export function successionRungFor(
  cutAtMs: number | null,
  plantedAtMs: number,
  nowMs: number,
  stageHours: number
): SuccessionRung {
  const since = cutAtMs ?? plantedAtMs;
  if (!Number.isFinite(since)) return 0;
  const step = Math.max(0.05, stageHours || 24);
  const elapsed = Math.max(0, nowMs - since) / 3_600_000 / step;
  for (let r = SUCCESSION_MAX; r >= 0; r -= 1) {
    if (elapsed >= SUCCESSION[r].steps) return r as SuccessionRung;
  }
  return 0;
}

/**
 * Progress toward the NEXT rung, 0 to 1.
 *
 * The console shows this rather than progress across the whole ladder, because the
 * whole ladder is over a year long and a bar that fills by a thousandth a day tells
 * nobody anything.
 */
export function successionProgress01(
  cutAtMs: number | null,
  plantedAtMs: number,
  nowMs: number,
  stageHours: number
): number {
  const since = cutAtMs ?? plantedAtMs;
  if (!Number.isFinite(since)) return 0;
  const step = Math.max(0.05, stageHours || 24);
  const elapsed = Math.max(0, nowMs - since) / 3_600_000 / step;
  const rung = successionRungFor(cutAtMs, plantedAtMs, nowMs, stageHours);
  if (rung >= SUCCESSION_MAX) return 1;
  const from = SUCCESSION[rung].steps;
  const to = SUCCESSION[rung + 1].steps;
  if (!(to > from)) return 1;
  return Math.max(0, Math.min(1, (elapsed - from) / (to - from)));
}

/** Real hours from a fresh cut to a given rung, for the console's "how long" line. */
export function successionHoursTo(rung: number, stageHours: number): number {
  return successionStep(rung).steps * Math.max(0.05, stageHours || 24);
}

/**
 * Which bush a thicket cell grew. Hashed from the cell, same discipline as the canopy:
 * the wood is the same for everyone and does not rearrange itself as rungs climb.
 *
 * ‼️ NOT a tree scaled to 1.4 m. That was the old rung-7 model and it read as a tiny
 * tree, not a bush. These are the library's shrub species, authored at bush height.
 */
export function thicketPlantFor(
  localX: number,
  localZ: number
): { species: VegetationShrubSpecies; variant: number } {
  const xi = (Math.round(localX * 100) | 0) + 0x9e3779b9;
  const zi = (Math.round(localZ * 100) | 0) + 0x85ebca6b;
  let h = Math.imul(xi ^ (xi >>> 16), 0x7feb352d);
  h = Math.imul((h ^ zi) ^ ((h ^ zi) >>> 15), 0x846ca68b);
  h = (h ^ (h >>> 16)) >>> 0;
  return {
    species: VEGETATION_SHRUB_SPECIES[h % VEGETATION_SHRUB_SPECIES.length]!,
    variant: (h >>> 8) % VEGETATION_VARIANTS,
  };
}

/**
 * The model a rung draws, and the scale to draw it at.
 *
 * `null` means the runtime keeps drawing what the grass ladder already gives it —
 * rungs 0-5 are the existing grass models and this file does not second-guess them.
 */
export function successionModel(
  rung: number,
  localX: number,
  localZ: number,
  /**
   * Ignored, and kept only so every existing caller still compiles.
   *
   * ‼️ A DATE USED TO DECIDE THE COLOUR OF THE LAND. The woody rungs drew the seasonal
   * vegetation library, so on 7 September a neglected bed came up as maroon autumn
   * lumps standing over a green jungle — "they look like pieces of meat". A wood is
   * evergreen: thicket bushes and canopy trees both pick a summer (or unseasoned)
   * file. Seasonal recolours belong on placed plants, not on neglect.
   */
  _season?: VegetationSeason
): { src: string; scale: number } | null {
  const step = successionStep(rung);
  if (step.kind !== "wood") return null;
  if (step.rung === SUCCESSION_WOODY_RUNG) {
    const bush = thicketPlantFor(localX, localZ);
    const nominal = VEGETATION_HEIGHT_M[bush.species] || 1.5;
    return {
      src: vegetationModelSrc(bush.species, bush.variant, "summer"),
      scale: step.heightM / nominal,
    };
  }
  // ‼️ NOT THE KIT. The owner's seven-tree kit is contract-clean and it is not a wood:
  // it has no green species at all, and at rung 10 it is scaled ~1.9x, so sparse leaf
  // cards double in size and float off thin branches — "these trees are embarrassing."
  // A wood is made of the canopy: bark trunks under crowns of enormous green cards from
  // the SAME atlas as the understorey, so floor and sky read as one thing. The kit stays
  // in the landscaping library, where a pink blossom tree is placed on purpose.
  //
  // Scale is taken against the chosen tree's own modelled height, so a palm and a
  // broad-crowned tree both arrive at the rung's stated height.
  const tree = canopyModel(localX, localZ, step.heightM);
  return { src: tree.src, scale: tree.scale };
}
