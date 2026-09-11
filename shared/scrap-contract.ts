/**
 * Scrap (`swissverse.scrap`) — NPC/guest hassle + first-person boxing.
 *
 * Host owns the NPCs (count, zones, groups, the always-on guest-acknowledge
 * ground rule). This app borrows interruptible NPCs, runs a session, then
 * returns them. It does not clone the crowd.
 *
 * Bully intensity reaches a first-person glove fight (`shared/scrap-fight.ts`).
 * Tease intensity still talks and walks away. `playerWinBias` is the KO-chance
 * cap once the guest is actually punching.
 *
 * Enabling the app is the owner grant for `npc.asTarget` when
 * `grantNpcAsTarget` is true (default). The kernel still checks the grant list.
 */

import type { HostOverrideId } from "./plugin-contract";
import { SCRAP_GUARD_MARKER } from "./scrap-emotes";
import type { ScrapMechanic } from "./scrap-fight";
import { normalizeZoneLogoAsset, type ZoneLogoAsset } from "./zone-entry-card";

export const SCRAP_VERSION = 1 as const;

export type ScrapIntensity = "tease" | "bully";

export const SCRAP_INTENSITIES: readonly ScrapIntensity[] = ["tease", "bully"];

export interface ScrapConfig {
  enabled: boolean;
  /**
   * Stored grant. Enabling Scrap with this true puts `npc.asTarget` on the
   * host grant list. False = plugin stays blocked even when the card is On.
   */
  grantNpcAsTarget: boolean;
  npcCanInitiate: boolean;
  playerCanInitiate: boolean;
  /** Minimum seconds between NPC-started sessions in this scene. */
  npcApproachEverySeconds: number;
  maxConcurrent: number;
  guestCooldownSeconds: number;
  npcCooldownSeconds: number;
  /** How far an NPC will walk to start a hassle. */
  approachRadiusM: number;
  /** How close a guest must be to pick a fight. */
  playerInitiateRadiusM: number;
  /**
   * tease = approach + talk, then walk away.
   * bully = escalate into the first-person glove fight.
   */
  intensity: ScrapIntensity;
  /** 0.5–0.95. Widens the opening the guest has to punch into. */
  playerWinBias: number;
  /**
   * "aim" = the full mechanic: weave to aim, plant to place a shot, hit the
   * opening. "cue" = the punch is auto-placed on the opening for you (kept for
   * an in-world A/B; only timing matters).
   */
  mechanic: ScrapMechanic;
  /**
   * Onlookers a hassle may borrow. Kept for config compatibility; the bout is
   * ONE ON ONE and the planner borrows nobody else (shared/scrap-skill.ts).
   */
  maxBackers: number;
  /**
   * Music under the bout: a bundled path ("sounds/scrap/bed.wav") or a URL.
   * Empty or "off" = silence. The old default bed read as crowd applause under
   * the gloves — opt in explicitly if you want a tension loop.
   */
  fightMusic: string;
  /** Metres a shove moves the guest. 0 = shoves off. */
  shovePushM: number;
  /**
   * Per-group skill override, 0..1. Absent groups derive skill from attitude +
   * wardrobe (shared/scrap-skill.ts). Keys are NpcGroup ids.
   */
  skillByGroup: Record<string, number>;
  /**
   * Scrapped Human Edition ring (pads + dolls + CPU fill). Off by default so
   * plaza Scrap does not grow a pit until the host turns this on.
   */
  humanEdition: boolean;
}

/** Apps-tab plugin `swissverse.scrap-human`. Separate from plaza Scrap hassle. */
export interface ScrapHumanAppConfig {
  enabled: boolean;
  /** Street stain graphic, embedded until publish packages it. */
  groundLogo?: ZoneLogoAsset;
  /** Scene-relative image after packaging (`images/scrap-human/...`). */
  groundLogoFile?: string;
}

export const DEFAULT_SCRAP_HUMAN_APP_CONFIG: ScrapHumanAppConfig = { enabled: false };

export function defaultScrapHumanAppConfig(): ScrapHumanAppConfig {
  return { ...DEFAULT_SCRAP_HUMAN_APP_CONFIG };
}

export function normalizeScrapHumanAppConfig(raw: unknown): ScrapHumanAppConfig {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const logo = normalizeZoneLogoAsset(input.groundLogo);
  const file = typeof input.groundLogoFile === "string" ? input.groundLogoFile.trim() : "";
  return {
    enabled: input.enabled === true,
    ...(logo ? { groundLogo: logo } : {}),
    ...(file ? { groundLogoFile: file } : {}),
  };
}

export const DEFAULT_SCRAP_CONFIG: ScrapConfig = {
  enabled: false,
  grantNpcAsTarget: true,
  npcCanInitiate: true,
  playerCanInitiate: true,
  npcApproachEverySeconds: 90,
  maxConcurrent: 1,
  guestCooldownSeconds: 180,
  npcCooldownSeconds: 120,
  approachRadiusM: 8,
  playerInitiateRadiusM: 3,
  intensity: "bully",
  playerWinBias: 0.85,
  mechanic: "aim",
  maxBackers: 0,
  fightMusic: "",
  shovePushM: 0.7,
  skillByGroup: {},
  humanEdition: false,
};

function normalizeSkillByGroup(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = key.trim();
    if (!id) continue;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) continue;
    out[id] = Math.min(1, Math.max(0, n));
  }
  return out;
}

/**
 * The original Scrap default shipped a bundled tension bed which reads as applause.
 * Old Builder projects persisted that default explicitly, so merely changing the new
 * default to an empty string did not silence any of those scenes. Treat both legacy
 * spellings as a migration to OFF. A different path/URL remains an intentional custom
 * fight track and is preserved.
 */
function normalizeFightMusic(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim().slice(0, 400);
  const legacy = value.toLowerCase().replace(/\\/g, "/");
  return legacy === "bed" || legacy === "sounds/scrap/bed.wav" ? "" : value;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function num(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

export function normalizeScrapConfig(raw: unknown): ScrapConfig {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const intensity = SCRAP_INTENSITIES.includes(input.intensity as ScrapIntensity)
    ? (input.intensity as ScrapIntensity)
    : DEFAULT_SCRAP_CONFIG.intensity;
  return {
    enabled: input.enabled === true,
    grantNpcAsTarget: input.grantNpcAsTarget !== false,
    npcCanInitiate: input.npcCanInitiate !== false,
    playerCanInitiate: input.playerCanInitiate !== false,
    npcApproachEverySeconds: num(
      input.npcApproachEverySeconds,
      DEFAULT_SCRAP_CONFIG.npcApproachEverySeconds,
      15,
      600
    ),
    maxConcurrent: Math.round(num(input.maxConcurrent, DEFAULT_SCRAP_CONFIG.maxConcurrent, 1, 4)),
    guestCooldownSeconds: num(
      input.guestCooldownSeconds,
      DEFAULT_SCRAP_CONFIG.guestCooldownSeconds,
      30,
      900
    ),
    npcCooldownSeconds: num(
      input.npcCooldownSeconds,
      DEFAULT_SCRAP_CONFIG.npcCooldownSeconds,
      20,
      600
    ),
    approachRadiusM: num(input.approachRadiusM, DEFAULT_SCRAP_CONFIG.approachRadiusM, 3, 20),
    playerInitiateRadiusM: num(
      input.playerInitiateRadiusM,
      DEFAULT_SCRAP_CONFIG.playerInitiateRadiusM,
      1.5,
      8
    ),
    intensity,
    playerWinBias: num(input.playerWinBias, DEFAULT_SCRAP_CONFIG.playerWinBias, 0.5, 0.95),
    mechanic: input.mechanic === "cue" ? "cue" : "aim",
    maxBackers: Math.round(num(input.maxBackers, DEFAULT_SCRAP_CONFIG.maxBackers, 0, 4)),
    fightMusic: normalizeFightMusic(input.fightMusic),
    shovePushM: num(input.shovePushM, DEFAULT_SCRAP_CONFIG.shovePushM, 0, 2),
    skillByGroup: normalizeSkillByGroup(input.skillByGroup),
    humanEdition: input.humanEdition === true,
  };
}

export function defaultScrapConfig(): ScrapConfig {
  return { ...DEFAULT_SCRAP_CONFIG };
}

/** Host grant list derived from enabled plugins. Scrap is the first consumer. */
export function grantedOverridesFromApps(apps: {
  scrap?: { enabled?: boolean; grantNpcAsTarget?: boolean };
}): HostOverrideId[] {
  if (apps.scrap?.enabled === true && apps.scrap.grantNpcAsTarget !== false) {
    return ["npc.asTarget"];
  }
  return [];
}

export interface ScrapBeatCard {
  id: string;
  emote: string;
  lines: readonly string[];
  holdMs: number;
}

export const SCRAP_APPROACH_CARDS: readonly ScrapBeatCard[] = [
  {
    id: "hey_you",
    emote: SCRAP_GUARD_MARKER,
    lines: ["Hey — you. Press E.", "Hold up. Scrap.", "You. Yeah you."],
    holdMs: 1600,
  },
  {
    id: "come_here",
    emote: SCRAP_GUARD_MARKER,
    lines: ["Come here. Press E.", "Don't walk off.", "Gloves. Now."],
    holdMs: 1600,
  },
];

export const SCRAP_TEASE_CARDS: readonly ScrapBeatCard[] = [
  {
    id: "look",
    emote: SCRAP_GUARD_MARKER,
    lines: ["Put 'em up. Press E.", "Scrap. Right now.", "Don't freeze. Fight."],
    holdMs: 1800,
  },
  {
    id: "crowd",
    emote: SCRAP_GUARD_MARKER,
    lines: ["We run this block.", "Cute outfit.", "You just gonna stand there?"],
    holdMs: 1800,
  },
];

export const SCRAP_ESCALATE_CARDS: readonly ScrapBeatCard[] = [
  {
    id: "push",
    emote: SCRAP_GUARD_MARKER,
    lines: ["Say something.", "Don't freeze up.", "You hearing me?"],
    holdMs: 1800,
  },
  {
    id: "circle",
    emote: SCRAP_GUARD_MARKER,
    lines: ["Friends, look.", "This one's shy.", "Back up — give them room."],
    holdMs: 1900,
  },
];

export const SCRAP_CHALLENGE_CARDS: readonly ScrapBeatCard[] = [
  {
    id: "gloves",
    emote: SCRAP_GUARD_MARKER,
    lines: ["Put these on.", "Scrap. Right here.", "Don't make me wait."],
    holdMs: 1600,
  },
];

export const SCRAP_FIGHT_CARDS: readonly ScrapBeatCard[] = [
  {
    id: "guard",
    emote: SCRAP_GUARD_MARKER,
    lines: ["Come on.", "Hands up.", "Hit me."],
    holdMs: 2000,
  },
];

export const SCRAP_PLAYER_WIN_CARDS: readonly ScrapBeatCard[] = [
  {
    id: "down",
    emote: "shrug",
    lines: ["Alright, alright.", "Okay — you got it.", "We're good. We're good."],
    holdMs: 2000,
  },
];

export const SCRAP_NPC_WIN_CARDS: readonly ScrapBeatCard[] = [
  {
    id: "easy",
    emote: "dab",
    lines: ["That's it?", "Next time bring friends.", "Walk it off."],
    holdMs: 2000,
  },
];

export const SCRAP_WALK_AWAY_CARDS: readonly ScrapBeatCard[] = [
  {
    id: "whatever",
    emote: "shrug",
    lines: ["Whatever.", "Not worth it.", "Go on then."],
    holdMs: 1400,
  },
];

/**
 * What a click on this NPC will actually do. The hover must not promise a
 * fight the click then refuses (owner, 2026-09-08, twice: "it says fight and
 * I cannot start the fight"). Same three answers, same order, as the click
 * handler in troupe: the regular pinned at the bag is not a target, and the
 * guest holding the bag is not free.
 */
export function scrapEngageHoverText(input: {
  scrapOn: boolean;
  pinned: boolean;
  guestBusy: boolean;
  label: string;
}): string {
  if (!input.scrapOn) return `Select ${input.label}`;
  if (input.pinned) return "At the bag";
  if (input.guestBusy) return "Finish your turn";
  return "Fight";
}
