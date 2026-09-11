/**
 * THE ARC'S MASKS — what stops sixty emissive boxes from being sixty
 * rectangles.
 *
 * `punch-show-patterns.ts` answers "what colour is this panel now". It cannot
 * answer "what does the panel look like", because a panel has no inside: one
 * box, one colour, edge to edge. Fifteen patterns across five palettes is
 * hundreds of ARRANGEMENTS of the same single mark, and the arc reads flat for
 * the same reason a chart with one bar reads flat — the vocabulary has one word
 * in it.
 *
 * A mask is a greyscale texture that MULTIPLIES the colour the pattern already
 * computed. It adds structure and cannot add hue, so:
 *
 *   - the LED-wall register set on 2026-09-04 is untouched — the mask carries
 *     no colour of its own and cannot drag an island hue onto the screen;
 *   - the arc-carries-no-text law is untouched — a mask is a repeating field,
 *     never a glyph, and nothing in here can be read;
 *   - every existing pattern gains texture without learning a single new term.
 *     `screenSegmentColour` is not touched by this file.
 *
 * ‼️THE MASK IS SELECTED, NEVER BLENDED. One texture is on the arc at a time,
 * chosen when a pattern starts. Two masks cross-fading would need a second
 * material layer per panel — 60 more entities on an island whose boot pacing is
 * already budgeted — to buy an effect nobody standing in a 9.7 m ring can see.
 *
 * The images are generated, not drawn: `scripts/art/gen-arc-masks.mjs`. Change
 * a cell size there and re-run it rather than editing a PNG by hand.
 */
import type { ScreenPatternId } from "./punch-show-patterns";

export const SCREEN_MASKS = ["none", "grille", "chevron", "halftone"] as const;

export type ScreenMaskId = (typeof SCREEN_MASKS)[number];

export interface ScreenMask {
  id: ScreenMaskId;
  /**
   * Path inside the scene bundle, or null for the bare panel.
   *
   * ‼️Every path here must also appear in the allowlist in
   * `scripts/publish/bundle-scene-template.ts`, or the texture is silently left
   * out of the deployment and the arc comes back untextured with no error
   * anywhere. `images/punch/` is already a keep-prefix for the compact punch
   * profile, so that third gate needs nothing.
   */
  src: string | null;
  /**
   * Brightness compensation, because a mask spends part of every panel dark.
   *
   * ‼️NOT 1/mean. Full compensation (1.61 / 1.37 / 2.35 — the generator prints
   * them) restores the average and blows the lit cells past white, which turns
   * a grille into a sheet of glare and loses the gutters that were the whole
   * point. These are roughly half of it: the arc reads as bright as it did, and
   * the structure survives.
   */
  gain: number;
}

const MASK_LIST: readonly ScreenMask[] = [
  { id: "none", src: null, gain: 1 },
  // The house mask. Rounded cells with dark gutters — the thing that makes an
  // emissive box read as one panel of an LED wall.
  { id: "grille", src: "images/punch/arc-mask-grille.png", gain: 1.35 },
  // Diagonal arrows, for the patterns that TRAVEL. A sweep across a flat panel
  // only changes its brightness; the same sweep across chevrons has a heading.
  { id: "chevron", src: "images/punch/arc-mask-chevron.png", gain: 1.2 },
  // A breathing dot field, for the patterns that are already about grain.
  { id: "halftone", src: "images/punch/arc-mask-halftone.png", gain: 1.6 },
];

const BY_ID = new Map<ScreenMaskId, ScreenMask>(MASK_LIST.map((m) => [m.id, m]));

export function screenMask(id: ScreenMaskId): ScreenMask {
  return BY_ID.get(id) ?? MASK_LIST[0]!;
}

/** Every mask that ships a texture — what the bundler allowlist has to carry. */
export function screenMaskSources(): readonly string[] {
  return MASK_LIST.map((m) => m.src).filter((s): s is string => s !== null);
}

/**
 * WHICH MASK A PATTERN WEARS.
 *
 * Chosen by what the pattern DOES, not by how big the punch was — the palette
 * already carries the punch. Three groups:
 *
 *   TRAVEL     something crosses the arc, so give it a direction to cross.
 *   GRAIN      the pattern is already flicker, so give the flicker a body.
 *   STRUCTURE  everything else wears the house grille and reads as a wall.
 *
 * ‼️A pattern missing from both lists falls to `grille` deliberately. A new
 * entry in `SCREEN_PATTERNS` should look like the screen on the day it lands,
 * not like an untextured hole in it.
 */
const TRAVEL: readonly ScreenPatternId[] = ["chase", "wipe", "gradient", "split", "drain"];
const GRAIN: readonly ScreenPatternId[] = ["noise", "sparkle", "strobe", "bars"];

export function patternMask(pattern: ScreenPatternId): ScreenMaskId {
  if (TRAVEL.includes(pattern)) return "chevron";
  if (GRAIN.includes(pattern)) return "halftone";
  return "grille";
}
