/**
 * THE ARC CAN SPELL NOW — a 4x7 numeral set laid out on the 20x8 wash.
 *
 * ‼️READ THIS BEFORE ADDING A WORD TO IT.
 *
 * There is a law in this codebase that the arc carries no text, and it is a
 * GOOD law. It was written after a sixteen-metre screen spent its life showing
 * three lines of key-binding instructions that nobody standing inside a 9.7 m
 * ring could read, and everything about that failure is still true of SENTENCES.
 * This file does not overturn it. It carves out the one exception the law was
 * never really about:
 *
 *   A NUMBER IS NOT TEXT. It is the single thing this machine produces, it is
 *   already on the cabinet, on the HUD and on the result card, and the owner's
 *   report (2026-09-04) is that the biggest surface on the island was the one
 *   place it never appeared: "there is the score and the lights on the machine,
 *   when they go up this is not being mirrored on the screen in the background".
 *
 * So: DIGITS AND A HANDFUL OF ICONS, nothing else. No names, no instructions, no
 * status lines, no words. A glyph here must be legible at four cells wide from
 * ten metres, which is a test a numeral passes and a phrase never will.
 *
 * WHY 4x7. The wash is 20 columns by 8 rows (`PUNCH_WASH_ROWS`). Seven rows is
 * the smallest a numeral reads at; four columns plus one of air is five per
 * character, so FOUR digits span 19 of the 20 columns and three span 14. A High
 * Ground punch has four digits, so four had to fit — that is what set the width.
 *
 * The field is a flat boolean per (col, row), built once per string. Callers
 * cache it; nothing in here is meant to run every frame.
 */
import { PUNCH_WASH_ROWS, PUNCH_WASH_SEGMENTS } from "./punch-machine-layout";

/** Glyph cell size. See the note above for why these two numbers and no others. */
export const GLYPH_W = 4;
export const GLYPH_H = 7;
/** Blank columns between characters. */
export const GLYPH_GAP = 1;
/** The most characters the arc holds at a legible size. */
export const GLYPH_MAX_CHARS = 4;

/**
 * The font, as art rather than as data.
 *
 * Rows are written TOP DOWN because that is how a person draws; the builder
 * flips them, because row 0 of the wash is the bottom. `#` is lit. Keeping them
 * literal means a future change is made by looking at the shape, which is the
 * only way a bitmap font stays right.
 */
const FONT: Record<string, readonly string[]> = {
  "0": ["####", "#..#", "#..#", "#..#", "#..#", "#..#", "####"],
  "1": ["..#.", ".##.", "..#.", "..#.", "..#.", "..#.", ".###"],
  "2": ["####", "...#", "...#", "####", "#...", "#...", "####"],
  "3": ["####", "...#", "...#", "####", "...#", "...#", "####"],
  "4": ["#..#", "#..#", "#..#", "####", "...#", "...#", "...#"],
  "5": ["####", "#...", "#...", "####", "...#", "...#", "####"],
  "6": ["####", "#...", "#...", "####", "#..#", "#..#", "####"],
  "7": ["####", "...#", "...#", "..#.", "..#.", ".#..", ".#.."],
  "8": ["####", "#..#", "#..#", "####", "#..#", "#..#", "####"],
  "9": ["####", "#..#", "#..#", "####", "...#", "...#", "####"],
  "-": ["....", "....", "....", "####", "....", "....", "...."],
  " ": ["....", "....", "....", "....", "....", "....", "...."],
};

/**
 * THE ICONS — full-width marks, not characters, so they get the whole field.
 *
 * ★These are the other half of the owner's report: "we don't see any crazy
 * celebrations that you would see when you would make a goal in a stadium". A
 * stadium screen does not celebrate with a colour, it celebrates with a MARK.
 * Each of these is 20x8 — the entire arc — so a monster punch puts a star
 * sixteen metres wide behind the person who threw it.
 */
export const SCREEN_ICONS = ["star", "crown", "flame", "skull", "arrows"] as const;
export type ScreenIconId = (typeof SCREEN_ICONS)[number];

const ICONS: Record<ScreenIconId, readonly string[]> = {
  star: [
    ".........##.........",
    "........####........",
    "########.##.########",
    "####################",
    "...################.",
    "....####......####..",
    "...###..........###.",
    "..##..............##",
  ],
  crown: [
    "##................##",
    "###..............###",
    "####....####....####",
    "#####..######..#####",
    "####################",
    "####################",
    "##..##..####..##..##",
    "####################",
  ],
  flame: [
    ".........##.........",
    "........####........",
    ".......######.......",
    "..##..########..##..",
    ".####.########.####.",
    "####..########..####",
    ".####.########.####.",
    "..##...######...##..",
  ],
  skull: [
    "....############....",
    "...##############...",
    "..################..",
    "..###..######..###..",
    "..###..######..###..",
    "..################..",
    "....##.##..##.##....",
    "....############....",
  ],
  arrows: [
    "..##....##....##....",
    ".####..####..####...",
    "####################",
    "..##....##....##....",
    "..##....##....##....",
    "####################",
    ".####..####..####...",
    "..##....##....##....",
  ],
};

/** Every cell dark. Callers mutate their own copy. */
function blankField(): boolean[] {
  return new Array<boolean>(PUNCH_WASH_SEGMENTS * PUNCH_WASH_ROWS).fill(false);
}

/** Field index for a (column, row). Row 0 is the BOTTOM, matching the wash. */
export function glyphFieldIndex(col: number, row: number): number {
  return col * PUNCH_WASH_ROWS + row;
}

/**
 * Stamp a top-down bitmap into a bottom-up field at (left, bottom).
 *
 * The flip lives HERE and nowhere else: the art above is written the way a
 * person draws, the wash is indexed the way a wall is built, and exactly one
 * function knows both.
 */
function stamp(
  field: boolean[],
  art: readonly string[],
  left: number,
  bottom: number,
): void {
  for (let line = 0; line < art.length; line += 1) {
    const row = bottom + (art.length - 1 - line);
    if (row < 0 || row >= PUNCH_WASH_ROWS) continue;
    const text = art[line]!;
    for (let i = 0; i < text.length; i += 1) {
      const col = left + i;
      if (col < 0 || col >= PUNCH_WASH_SEGMENTS) continue;
      if (text[i] === "#") field[glyphFieldIndex(col, row)] = true;
    }
  }
}

/**
 * A number (or short code) as a lit field, centred on the arc.
 *
 * ‼️OVERLONG INPUT IS TRUNCATED, NOT SHRUNK. Four characters is what the wash
 * physically holds at a legible size; a fifth would have to come out of the cell
 * size, and a 3x5 numeral on this surface is a smudge. The machine's own ceiling
 * is four digits, so this only ever fires on a caller bug — and a readable wrong
 * number beats an unreadable right one.
 */
export function screenTextField(text: string): boolean[] {
  const field = blankField();
  const chars = [...text.toUpperCase()]
    .filter((c) => c in FONT)
    .slice(0, GLYPH_MAX_CHARS);
  if (chars.length === 0) return field;
  const width = chars.length * GLYPH_W + (chars.length - 1) * GLYPH_GAP;
  const left = Math.round((PUNCH_WASH_SEGMENTS - width) / 2);
  // A seven-row glyph in eight rows leaves one spare. It sits ABOVE the
  // numeral so the count has a clean dark row under the bezel, not a kiss
  // against the frame with the plinth empty underneath.
  const bottom = 0;
  chars.forEach((char, i) => {
    stamp(field, FONT[char]!, left + i * (GLYPH_W + GLYPH_GAP), bottom);
  });
  return field;
}

/** One of the full-width celebration marks as a lit field. */
export function screenIconField(icon: ScreenIconId): boolean[] {
  const field = blankField();
  stamp(field, ICONS[icon], 0, 0);
  return field;
}

/**
 * WHICH MARK A SCORE EARNS. Loudest first, so the ladder reads as a ladder and
 * a change to one rung cannot silently reorder the others.
 *
 * Deliberately NOT a new set of thresholds: it reads the reaction tier the whole
 * machine already grades punches by, so the icon, the wash colour, the emote and
 * the sound cannot tell four different stories about the same punch.
 */
export function screenIconForTier(tier: number): ScreenIconId | null {
  if (tier >= 4) return "star";
  if (tier === 3) return "flame";
  return null;
}
