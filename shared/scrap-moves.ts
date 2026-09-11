/**
 * Scrap move catalogue — pure data shared by the rules engine and the view.
 *
 * A move is one contract from input to spectator presentation. Keeping range,
 * timing, stamina, damage and contact frames together prevents the first-person
 * glove, the NPC/player emote and the actual hit from drifting apart.
 */

export type ScrapMoveKind = "jab" | "cross" | "uppercut" | "combo" | "front_kick";

export type ScrapMoveBand = "high" | "mid" | "low";

export interface ScrapMoveContact {
  /** 0..1 through the move animation. */
  at: number;
  /** Share of the move's total damage delivered by this contact. */
  share: number;
  side: "left" | "right";
}

export interface ScrapMoveSpec {
  id: ScrapMoveKind;
  label: string;
  hudLabel: string;
  band: ScrapMoveBand;
  minRangeM: number;
  maxRangeM: number;
  durationMs: number;
  recoveryMs: number;
  staminaCost: number;
  damageMultiplier: number;
  /** Extra pressure dealt to a sustained guard. */
  guardPressure: number;
  contacts: readonly ScrapMoveContact[];
}

export const SCRAP_MOVES: Readonly<Record<ScrapMoveKind, ScrapMoveSpec>> = {
  jab: {
    id: "jab",
    label: "Jab",
    hudLabel: "JAB",
    band: "high",
    minRangeM: 0,
    maxRangeM: 3.05,
    durationMs: 380,
    recoveryMs: 260,
    staminaCost: 7,
    damageMultiplier: 0.72,
    guardPressure: 4,
    contacts: [{ at: 0.52, share: 1, side: "left" }],
  },
  cross: {
    id: "cross",
    label: "Cross",
    hudLabel: "CROSS",
    band: "high",
    minRangeM: 0,
    maxRangeM: 3,
    durationMs: 420,
    recoveryMs: 340,
    staminaCost: 10,
    damageMultiplier: 1,
    guardPressure: 7,
    contacts: [{ at: 0.54, share: 1, side: "right" }],
  },
  uppercut: {
    id: "uppercut",
    label: "Uppercut",
    hudLabel: "UPPER",
    band: "high",
    minRangeM: 0,
    maxRangeM: 2.35,
    durationMs: 480,
    recoveryMs: 620,
    staminaCost: 17,
    damageMultiplier: 1.18,
    guardPressure: 14,
    contacts: [{ at: 0.58, share: 1, side: "right" }],
  },
  combo: {
    id: "combo",
    label: "One-two",
    hudLabel: "1–2",
    band: "high",
    minRangeM: 0,
    maxRangeM: 2.9,
    durationMs: 620,
    recoveryMs: 720,
    staminaCost: 21,
    damageMultiplier: 1.14,
    guardPressure: 16,
    contacts: [
      { at: 0.31, share: 0.38, side: "left" },
      { at: 0.68, share: 0.62, side: "right" },
    ],
  },
  front_kick: {
    id: "front_kick",
    label: "Front kick",
    hudLabel: "KICK",
    band: "mid",
    minRangeM: 1.35,
    maxRangeM: 3.45,
    durationMs: 760,
    recoveryMs: 900,
    staminaCost: 24,
    damageMultiplier: 1.2,
    guardPressure: 24,
    contacts: [{ at: 0.57, share: 1, side: "right" }],
  },
};

export function scrapMove(kind: ScrapMoveKind): ScrapMoveSpec {
  return SCRAP_MOVES[kind];
}

export function scrapMoveInRange(kind: ScrapMoveKind, distanceM: number): boolean {
  if (!Number.isFinite(distanceM)) return false;
  const move = scrapMove(kind);
  return distanceM >= move.minRangeM && distanceM <= move.maxRangeM;
}

export function scrapMoveContactDamage(totalDamage: number, kind: ScrapMoveKind): number[] {
  const total = Math.max(0, totalDamage);
  const contacts = scrapMove(kind).contacts;
  if (!contacts.length) return [];
  let assigned = 0;
  return contacts.map((contact, index) => {
    if (index === contacts.length - 1) return Math.max(0, total - assigned);
    const value = total * Math.max(0, contact.share);
    assigned += value;
    return value;
  });
}
