/**
 * Named dress codes for NPC groups and wearable entry tickets.
 *
 * Agents and owners speak tokens (`club`, `streetwear`), not URN lists.
 * Each code resolves to complete AvatarShape outfits from DCL base wearables
 * (always available, no ownership). Custom looks still accept pasted URNs.
 *
 * Runtime ignores `dressCode` on a group and renders `outfits`. The token is
 * authoring metadata so MCP snapshots and later edits stay named.
 */

import type { DanceOutfit } from "./dance-venue-contract";

export const BASE_AVATAR_URN = "urn:decentraland:off-chain:base-avatars:";

const M = `${BASE_AVATAR_URN}BaseMale`;
const F = `${BASE_AVATAR_URN}BaseFemale`;
const b = (id: string) => `${BASE_AVATAR_URN}${id}`;

function look(
  bodyShape: string,
  hair: string,
  top: string,
  bottom: string,
  feet: string,
  hairColor: { r: number; g: number; b: number },
): DanceOutfit {
  return {
    bodyShape,
    wearables: [b(hair), b(top), b(bottom), b(feet)],
    hairColor,
  };
}

export const DRESS_CODE_IDS = [
  "casual",
  "streetwear",
  "club",
  "sport",
  "formal",
  "hiphop",
] as const;

export type DressCodeId = (typeof DRESS_CODE_IDS)[number];

const ALIASES: Record<string, DressCodeId> = {
  casual: "casual",
  crew: "casual",
  default: "casual",
  streetwear: "streetwear",
  street: "streetwear",
  urban: "streetwear",
  club: "club",
  nightlife: "club",
  dance: "club",
  sport: "sport",
  athletic: "sport",
  gym: "sport",
  formal: "formal",
  smart: "formal",
  black_tie: "formal",
  "black-tie": "formal",
  hiphop: "hiphop",
  hip_hop: "hiphop",
  "hip-hop": "hiphop",
  bboy: "hiphop",
  "b-boy": "hiphop",
};

export interface DressCode {
  id: DressCodeId;
  label: string;
  summary: string;
  /** Complete looks cycled across the group. */
  outfits: DanceOutfit[];
  /** Distinctive pieces a visitor can wear to pass a wearable ticket (match any). */
  ticketWearables: string[];
}

const CASUAL: DressCode = {
  id: "casual",
  label: "Casual",
  summary: "Everyday hoodies, tees, and sneakers — the default street crowd.",
  outfits: [
    look(M, "casual_hair_01", "green_hoodie", "brown_pants", "sneakers", { r: 0.1, g: 0.08, b: 0.06 }),
    look(F, "pony_tail", "blue_tshirt", "f_jeans", "sneakers", { r: 0.9, g: 0.3, b: 0.55 }),
    look(M, "cornrows", "sport_jacket", "basketball_shorts", "sport_black_shoes", { r: 0.05, g: 0.05, b: 0.05 }),
    look(F, "shoulder_hair", "red_tshirt", "hip_hop_joggers", "sneakers", { r: 0.35, g: 0.2, b: 0.08 }),
  ],
  ticketWearables: [b("green_hoodie"), b("blue_tshirt"), b("red_tshirt")],
};

const STREETWEAR: DressCode = {
  id: "streetwear",
  label: "Streetwear",
  summary: "Hoodies and joggers — plaza / scrap-yard crowd.",
  outfits: [
    look(M, "casual_hair_01", "green_hoodie", "hip_hop_joggers", "sneakers", { r: 0.12, g: 0.1, b: 0.08 }),
    look(F, "pony_tail", "red_tshirt", "hip_hop_joggers", "sneakers", { r: 0.7, g: 0.25, b: 0.2 }),
    look(M, "cornrows", "green_hoodie", "brown_pants", "sneakers", { r: 0.08, g: 0.08, b: 0.08 }),
    look(F, "shoulder_hair", "blue_tshirt", "f_jeans", "sneakers", { r: 0.25, g: 0.15, b: 0.1 }),
  ],
  ticketWearables: [b("green_hoodie"), b("hip_hop_joggers")],
};

const CLUB: DressCode = {
  id: "club",
  label: "Club",
  summary: "Jackets and dark sport looks for a night floor.",
  outfits: [
    look(M, "casual_hair_01", "sport_jacket", "hip_hop_joggers", "sport_black_shoes", { r: 0.04, g: 0.04, b: 0.05 }),
    look(F, "pony_tail", "sport_jacket", "f_jeans", "sneakers", { r: 0.85, g: 0.2, b: 0.45 }),
    look(M, "cornrows", "sport_jacket", "basketball_shorts", "sport_black_shoes", { r: 0.02, g: 0.02, b: 0.02 }),
    look(F, "shoulder_hair", "red_tshirt", "hip_hop_joggers", "sport_black_shoes", { r: 0.15, g: 0.08, b: 0.12 }),
  ],
  ticketWearables: [b("sport_jacket")],
};

const SPORT: DressCode = {
  id: "sport",
  label: "Sport",
  summary: "Jackets, shorts, and court shoes.",
  outfits: [
    look(M, "cornrows", "sport_jacket", "basketball_shorts", "sport_black_shoes", { r: 0.05, g: 0.05, b: 0.05 }),
    look(F, "pony_tail", "sport_jacket", "hip_hop_joggers", "sneakers", { r: 0.4, g: 0.15, b: 0.1 }),
    look(M, "casual_hair_01", "blue_tshirt", "basketball_shorts", "sport_black_shoes", { r: 0.2, g: 0.12, b: 0.08 }),
    look(F, "shoulder_hair", "red_tshirt", "basketball_shorts", "sneakers", { r: 0.55, g: 0.2, b: 0.15 }),
  ],
  ticketWearables: [b("sport_jacket"), b("basketball_shorts"), b("sport_black_shoes")],
};

const FORMAL: DressCode = {
  id: "formal",
  label: "Formal",
  summary: "Jackets and dark trousers — the smartest look from base wearables.",
  outfits: [
    look(M, "casual_hair_01", "sport_jacket", "brown_pants", "sport_black_shoes", { r: 0.08, g: 0.06, b: 0.05 }),
    look(F, "pony_tail", "sport_jacket", "f_jeans", "sneakers", { r: 0.15, g: 0.1, b: 0.08 }),
    look(M, "casual_hair_01", "sport_jacket", "brown_pants", "sneakers", { r: 0.12, g: 0.1, b: 0.09 }),
    look(F, "shoulder_hair", "blue_tshirt", "f_jeans", "sport_black_shoes", { r: 0.3, g: 0.18, b: 0.12 }),
  ],
  ticketWearables: [b("sport_jacket")],
};

const HIPHOP: DressCode = {
  id: "hiphop",
  label: "Hip-hop",
  summary: "Joggers, tees, and court shoes — b-boy / cypher crowd.",
  outfits: [
    look(M, "cornrows", "red_tshirt", "hip_hop_joggers", "sneakers", { r: 0.06, g: 0.05, b: 0.04 }),
    look(F, "pony_tail", "blue_tshirt", "hip_hop_joggers", "sneakers", { r: 0.8, g: 0.35, b: 0.2 }),
    look(M, "casual_hair_01", "green_hoodie", "basketball_shorts", "sport_black_shoes", { r: 0.1, g: 0.08, b: 0.06 }),
    look(F, "shoulder_hair", "sport_jacket", "hip_hop_joggers", "sneakers", { r: 0.25, g: 0.12, b: 0.08 }),
  ],
  ticketWearables: [b("hip_hop_joggers"), b("red_tshirt")],
};

export const DRESS_CODES: readonly DressCode[] = [
  CASUAL,
  STREETWEAR,
  CLUB,
  SPORT,
  FORMAL,
  HIPHOP,
];

const BY_ID = new Map<DressCodeId, DressCode>(DRESS_CODES.map((code) => [code.id, code]));

export function isDressCodeId(value: string | null | undefined): value is DressCodeId {
  return Boolean(value && DRESS_CODE_IDS.includes(value as DressCodeId));
}

export function parseDressCodeId(raw: string | null | undefined): DressCodeId | null {
  if (!raw?.trim()) return null;
  return ALIASES[raw.trim().toLowerCase().replace(/\s+/g, "_")] ?? null;
}

export function resolveDressCode(raw: string): DressCode {
  const id = parseDressCodeId(raw);
  if (!id) {
    throw new Error(
      `Unknown dress code "${raw}". Use ${DRESS_CODE_IDS.join(", ")}, or pass wearable URNs as a custom look.`,
    );
  }
  return BY_ID.get(id)!;
}

export function outfitsFromWearableUrns(urns: string[]): DanceOutfit[] {
  const wearables = urns.map((urn) => urn.trim()).filter(Boolean);
  if (!wearables.length) return [];
  return [
    { bodyShape: M, wearables: [...wearables] },
    { bodyShape: F, wearables: [...wearables] },
  ];
}

export function dressCodeCards(): Array<{
  id: DressCodeId;
  label: string;
  summary: string;
  aliases: string[];
  ticketWearables: string[];
}> {
  return DRESS_CODES.map((code) => ({
    id: code.id,
    label: code.label,
    summary: code.summary,
    aliases: Object.entries(ALIASES)
      .filter(([alias, id]) => id === code.id && alias !== code.id)
      .map(([alias]) => alias),
    ticketWearables: [...code.ticketWearables],
  }));
}
