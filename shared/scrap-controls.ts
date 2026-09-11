/**
 * THE FIGHT CONTROL SCHEME — five verbs, learned in one sentence.
 *
 *   Arrows move me. E punches. F kicks. Space hits hard. Shift protects me.
 *
 * The old scheme spread eight on-screen buttons across the bottom third of the
 * frame (A, D, E, 1, 2, 3, Space, plus a combo key) and still needed a legend.
 * Everything below exists so that never happens again: the keys are declared
 * once, the HUD renders that declaration, and combos are DISCOVERED by chaining
 * attacks instead of occupying their own button.
 *
 * ONE HARD CONSTRAINT: Decentraland does not expose arbitrary keys. The whole
 * vocabulary an SDK7 scene can read is IA_POINTER / IA_PRIMARY (E) /
 * IA_SECONDARY (F) / IA_JUMP (Space) / IA_MODIFIER (Shift) / IA_ACTION_3..6
 * (number row) / the movement axes. So X and C are not addressable; E and F —
 * adjacent under the same two fingers — stand in for them, and Space and Shift
 * are exactly as specified.
 *
 * Pure module: no SDK import.
 */

import type { ScrapMoveKind } from "./scrap-moves";

/** What the player pressed, before range and combo linking pick the actual move. */
export type ScrapAttackVerb = "punch" | "uppercut" | "kick";

export interface ScrapControlHint {
  /** Keycaps drawn left to right for this entry. */
  caps: readonly string[];
  label: string;
  /** A wide cap (SPACE, SHIFT) gets more room than a letter. */
  wide?: boolean;
}

/**
 * The whole legend, in reading order. The HUD draws this array and nothing
 * else, so a rebinding here cannot drift from what the screen claims.
 */
export const SCRAP_CONTROL_HINTS: readonly ScrapControlHint[] = [
  { caps: ["←", "↑", "↓", "→"], label: "MOVE" },
  { caps: ["E"], label: "PUNCH" },
  { caps: ["F"], label: "KICK" },
  { caps: ["SPACE"], label: "UPPERCUT", wide: true },
  { caps: ["SHIFT"], label: "GUARD", wide: true },
];

/** The arrow cluster drawn in the corner: top row, then bottom row. */
export const SCRAP_ARROW_CLUSTER = {
  top: "↑",
  bottom: ["←", "↓", "→"] as const,
} as const;

/** Key that walks out of a bout. Off the combat fingers on purpose. */
export const SCRAP_LEAVE_KEY = "4";

/**
 * How long after an attack a follow-up still counts as the same string.
 * Long enough to chain deliberately, short enough that mashing does not
 * accidentally read as a combo forever.
 */
export const SCRAP_COMBO_LINK_MS = 420;
/** How long a combo name stays on screen. */
export const SCRAP_COMBO_NAME_MS = 900;

export interface ScrapComboLink {
  /** The move the linked attack actually throws. */
  kind: ScrapMoveKind;
  /** Short, game-like, shown for SCRAP_COMBO_NAME_MS. */
  name: string;
}

function isPunch(kind: ScrapMoveKind): boolean {
  return kind === "jab" || kind === "cross" || kind === "combo";
}

/**
 * Combos EMERGE. There is no combo key: throw a punch, then follow it inside
 * the link window and the second attack upgrades and names itself.
 *
 *   E → E      the 1–2
 *   E → SPACE  punch into the uppercut
 *   E → F      punch into the kick
 *
 * Anything else returns null and the attack is thrown plainly.
 */
export function scrapComboLink(
  previous: ScrapMoveKind | null,
  verb: ScrapAttackVerb,
  gapMs: number
): ScrapComboLink | null {
  if (!previous) return null;
  if (!(gapMs >= 0) || gapMs > SCRAP_COMBO_LINK_MS) return null;
  if (!isPunch(previous)) return null;
  if (verb === "punch") return { kind: "combo", name: "1–2" };
  if (verb === "uppercut") return { kind: "uppercut", name: "UPPERCUT COMBO" };
  return { kind: "front_kick", name: "PUNCH + KICK" };
}

/**
 * The legend is a reminder, not furniture. Full strength while a newcomer is
 * finding the keys, then it drops back so the opponent owns the frame.
 */
export const SCRAP_LEGEND_FULL_MS = 8000;
export const SCRAP_LEGEND_FADE_MS = 1600;
export const SCRAP_LEGEND_RESTING_ALPHA = 0.3;

export function scrapLegendAlpha(fightMs: number): number {
  if (!(fightMs > 0)) return 1;
  if (fightMs <= SCRAP_LEGEND_FULL_MS) return 1;
  const t = Math.min(1, (fightMs - SCRAP_LEGEND_FULL_MS) / SCRAP_LEGEND_FADE_MS);
  return 1 + (SCRAP_LEGEND_RESTING_ALPHA - 1) * t;
}
