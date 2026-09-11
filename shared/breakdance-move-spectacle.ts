/**
 * Breakdance move → crowd intensity bump.
 *
 * Ordinary scored moves only cheer. Power moves (freeze, headspin, 1990, windmill)
 * and a long success streak raise crowd energy (hands / audio / speech).
 * World FX (shake, fire, weather) is Host Frenzy or FX Lab — never automatic.
 */
import type { CrowdReactionIntensity, CrowdReactionMood } from "./crowd-reaction-contract";
import { crowdReactionIntensity } from "./crowd-reaction-contract";

export type MoveSpectacleKind = "none" | "flash" | "shake" | "climax";

export interface MoveSpectacle {
  /** Added on top of the success-streak intensity, then capped at 4. */
  intensityBump: 0 | 1 | 2;
  kind: MoveSpectacleKind;
  crowdMood: CrowdReactionMood;
}

const QUIET: MoveSpectacle = { intensityBump: 0, kind: "none", crowdMood: "positive" };

/** First matching substring in the emote URN / bundled path wins. */
export const BREAKDANCE_MOVE_SPECTACLE: ReadonlyArray<{ match: string; spec: MoveSpectacle }> = [
  { match: "bd_freezes", spec: { intensityBump: 2, kind: "climax", crowdMood: "aggressive" } },
  { match: "bd_freeze", spec: { intensityBump: 2, kind: "climax", crowdMood: "aggressive" } },
  { match: "footwork_to_freeze", spec: { intensityBump: 1, kind: "shake", crowdMood: "aggressive" } },
  { match: "headspin", spec: { intensityBump: 2, kind: "climax", crowdMood: "aggressive" } },
  { match: "windmill", spec: { intensityBump: 2, kind: "shake", crowdMood: "aggressive" } },
  { match: "bd_1990", spec: { intensityBump: 2, kind: "climax", crowdMood: "aggressive" } },
  { match: "uprock_to_ground", spec: { intensityBump: 1, kind: "flash", crowdMood: "positive" } },
  { match: "bd_ending", spec: { intensityBump: 1, kind: "flash", crowdMood: "positive" } },
];

/** Streak of successful moves: 1 mild → 2–3 building → 4+ loud. */
export function streakIntensity(moveCount: number): CrowdReactionIntensity {
  if (moveCount >= 6) return 4;
  if (moveCount >= 4) return 3;
  if (moveCount >= 2) return 2;
  return 1;
}

export function resolveMoveSpectacle(urn: string | null | undefined): MoveSpectacle {
  if (!urn) return QUIET;
  const hay = urn.toLowerCase();
  for (const row of BREAKDANCE_MOVE_SPECTACLE) {
    if (hay.includes(row.match)) return row.spec;
  }
  return QUIET;
}

/** Pinnacle streak (6+) earns a climax even on an ordinary move. */
export function spectacleForMove(
  urn: string | null | undefined,
  moveCount: number
): MoveSpectacle {
  const base = resolveMoveSpectacle(urn);
  if (base.kind === "climax") return base;
  if (moveCount >= 6) {
    return { ...base, intensityBump: Math.max(base.intensityBump, 2) as 0 | 1 | 2, kind: "climax" };
  }
  return base;
}

export function combinedMoveIntensity(
  moveCount: number,
  urn: string | null | undefined,
  cap: CrowdReactionIntensity
): CrowdReactionIntensity {
  const spec = resolveMoveSpectacle(urn);
  return crowdReactionIntensity(Math.min(cap, streakIntensity(moveCount) + spec.intensityBump));
}
