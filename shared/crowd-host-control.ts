/**
 * Live Host crowd director — formation, mood, and sync for the whole NPC
 * hangout, not the 9-person choreography picker.
 *
 * Empty overlay fields mean "use the published group settings".
 */

export const CROWD_HOST_FORMATIONS = ["scatter", "circle", "gathering", "grid"] as const;
export type CrowdHostFormation = (typeof CROWD_HOST_FORMATIONS)[number];

export const CROWD_HOST_MOODS = ["welcome", "battle"] as const;
export type CrowdHostMood = (typeof CROWD_HOST_MOODS)[number];

export const CROWD_HOST_SYNCS = ["tight", "loose", "mixed"] as const;
export type CrowdHostSync = (typeof CROWD_HOST_SYNCS)[number];

export const CROWD_FORMATION_LABELS: Record<CrowdHostFormation, string> = {
  scatter: "Triangle",
  circle: "Circle",
  gathering: "Gathering",
  grid: "Squad",
};

export const CROWD_MOOD_LABELS: Record<CrowdHostMood, string> = {
  welcome: "Welcome",
  battle: "Battle",
};

export const CROWD_SYNC_LABELS: Record<CrowdHostSync, string> = {
  tight: "Together",
  loose: "Loose",
  mixed: "Mixed hands",
};

const WELCOME_LINES = ["Hi!", "Hey!", "Hello!", "Hola!", "Ciao!", "Welcome!", "Heyyy!"];
const BATTLE_LINES = [
  "RAAH!",
  "HYYAH!",
  "CHARGE!",
  "COME ON!",
  "AGGGHH!",
  "FIGHT!",
  "GET THEM!",
  "WOOO!",
  "HNNNG!",
  "AAAAH!",
  "SMASH!",
  "YAAARGH!",
  "HIT THEM!",
  "HURR!",
];

const WELCOME_HANDS = ["wave", "clap", "raiseHand", "handsair"];
const BATTLE_HANDS = ["fistpump", "handsair", "raiseHand", "dab", "robot", "hammer"];

export interface CrowdHostOverlay {
  formation: CrowdHostFormation | "";
  mood: CrowdHostMood | "";
  sync: CrowdHostSync | "";
  changedAt: number;
}

export const EMPTY_CROWD_HOST_OVERLAY: CrowdHostOverlay = {
  formation: "",
  mood: "",
  sync: "",
  changedAt: 0,
};

export function isCrowdHostFormation(value: unknown): value is CrowdHostFormation {
  return typeof value === "string" && (CROWD_HOST_FORMATIONS as readonly string[]).includes(value);
}

export function isCrowdHostMood(value: unknown): value is CrowdHostMood {
  return typeof value === "string" && (CROWD_HOST_MOODS as readonly string[]).includes(value);
}

export function isCrowdHostSync(value: unknown): value is CrowdHostSync {
  return typeof value === "string" && (CROWD_HOST_SYNCS as readonly string[]).includes(value);
}

export function normalizeCrowdHostOverlay(raw: Partial<CrowdHostOverlay> | null | undefined): CrowdHostOverlay {
  return {
    formation: isCrowdHostFormation(raw?.formation) ? raw.formation : "",
    mood: isCrowdHostMood(raw?.mood) ? raw.mood : "",
    sync: isCrowdHostSync(raw?.sync) ? raw.sync : "",
    changedAt: Number.isFinite(Number(raw?.changedAt)) ? Math.max(0, Number(raw?.changedAt)) : 0,
  };
}

/** Host pick wins; otherwise the published group formation. */
export function effectiveCrowdFormation(
  overlay: CrowdHostOverlay | null | undefined,
  authored: string | undefined
): CrowdHostFormation | "rows" | "scatter" {
  if (overlay?.formation) return overlay.formation;
  if (authored === "circle" || authored === "rows" || authored === "gathering" || authored === "grid") {
    return authored;
  }
  return "scatter";
}

export function crowdHostEmote(
  mood: CrowdHostMood | "",
  sync: CrowdHostSync | "",
  index: number,
  epoch: number
): string {
  const pool = mood === "battle" ? BATTLE_HANDS : WELCOME_HANDS;
  if (sync === "mixed") return pool[index % pool.length]!;
  if (sync === "loose") return pool[(epoch + index) % pool.length]!;
  return pool[epoch % pool.length]!;
}

export function crowdHostSpeechLine(
  mood: CrowdHostMood | "",
  index: number,
  epoch: number
): string | null {
  if (!mood) return null;
  const pool = mood === "battle" ? BATTLE_LINES : WELCOME_LINES;
  // About one in three speak each beat so it is a crowd, not a choir.
  if ((index * 17 + epoch * 13) % 3 !== 0) return null;
  return pool[(index + epoch) % pool.length]!;
}

/** Tight = same beat. Loose = up to ~0.7 s of stagger. Mixed stays on the beat. */
export function crowdHostBeatOffsetMs(sync: CrowdHostSync | "", index: number): number {
  if (sync !== "loose") return 0;
  return (index % 8) * 90;
}

/** Squad (and only squad) plants in rank — no ambient wander, no fidget-walk. */
export function crowdFormationHoldsStill(formation: string | undefined): boolean {
  return formation === "grid";
}
