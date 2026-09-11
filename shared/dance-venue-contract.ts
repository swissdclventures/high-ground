import { SITE_FLOOR_INDEX } from "./floor-props";
import { parseDressCodeId } from "./dress-code";
import { resolveCastPackId } from "./cast-packs";
import type { BreakdanceReactionConfig } from "./breakdance-reactions";
import {
  defaultBreakdanceReactionConfig,
  normalizeBreakdanceReactionConfig,
} from "./breakdance-reactions";
import type { CrowdReactionCue } from "./crowd-reaction-contract";
import {
  isCrowdHostFormation,
  isCrowdHostMood,
  isCrowdHostSync,
  type CrowdHostFormation,
  type CrowdHostMood,
  type CrowdHostSync,
} from "./crowd-host-control";
import type { EncounterMood, NpcAttitude } from "./npc-encounters";
import { NPC_ATTITUDES, normalizeEncounterMood } from "./npc-encounters";
import type { ChoreographyFormationKind } from "./choreography-routines";
import {
  DEFAULT_CHOREOGRAPHY_ROUTINE_ID,
  choreographyBeatAt,
  choreographyEmoteAt,
  choreographyFormationSlot as formationSlotFromCatalogue,
  choreographyRoutineById,
  defaultChoreographyRoutine,
  longestChoreographyTrack,
  resolveChoreographyRoutine,
} from "./choreography-routines";

export {
  CHOREOGRAPHY_ROUTINES,
  DEFAULT_CHOREOGRAPHY_ROUTINE_ID,
  choreographyBeatAt,
  choreographyEmoteAt,
  choreographyRoleForIndex,
  choreographyRoutineById,
  choreographyTrackForRole,
  defaultChoreographyRoutine,
  longestChoreographyTrack,
  resolveChoreographyRoutine,
} from "./choreography-routines";
export type {
  ChoreographyBeat,
  ChoreographyFormationKind,
  ChoreographyRoleKind,
  ChoreographyRoutine,
  ChoreographySlot,
  ChoreographyTracks,
} from "./choreography-routines";

/**
 * Dance Venue contract — the automated social dance loop (dance floor + support
 * circle + queue + survival rules). Spec: docs/dance-venue-todo.md.
 *
 * Lives inside SocialSurfaceConfig as `dance` so it rides the existing
 * app → building-config.json → scene plumbing (bake, reconcile, validate).
 *
 * Runtime authority model (MessageBus, no auth-server yet): every client elects
 * the same coordinator deterministically (lowest userId among present players).
 * Only the coordinator runs the reducer below and broadcasts state snapshots;
 * all other clients apply snapshots and execute their own side effects
 * (teleport self, emote self, HUD). The reducer is PURE so it is unit-testable
 * and so a coordinator handover just resumes from the last snapshot.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface DanceNpcConfig {
  enabled: boolean;
  name: string;
  /** Predefined DCL emote ids the NPCs dance with. */
  emotes: string[];
  /** Seconds between NPC emote retriggers. */
  routineSeconds: number;
  /** Troupe size — named bots standing in a ring around the circle. */
  count: number;
  /** Scripted NPC turn length in seconds (varied ±25% deterministically). */
  turnS: number;
  /** Every Nth NPC turn ends in a playful fail instead of running full length. */
  failEvery: number;
  /** Display names, index-mapped to npc:<i>. Falls back to the default list. */
  names: string[];
  /** Optional wearable URNs to dress the WHOLE crew (one outfit for all). Any
   *  URN renders on an NPC AvatarShape — base wearables, marketplace items, or
   *  the owner's own inventory NFTs (no ownership check for NPCs). Empty = the
   *  built-in varied dance-crew outfits. */
  wearables: string[];
  /** Per-dancer outfits, cycled across the crew — pulled from the owner's saved
   *  DCL Backpack outfits (or current look). Takes precedence over `wearables`
   *  and the built-in outfits when non-empty. */
  outfits: DanceOutfit[];
  /** The raw Marketplace links/URNs the owner last pasted to build `outfits`, kept
   *  so the builder can pre-fill the box and they never have to re-enter them.
   *  Builder-side metadata; the runtime ignores it. */
  outfitLinks: string[];
  /** Cast Pack token behind `outfits` plus the seed that chose the characters.
   *  Same authoring-metadata contract as NpcGroup.castPack — see there. */
  castPack?: string | null;
  castSeed?: number;
  /** Behavior groups claiming ordered slices of the crew pool (see npcGroupSlices).
   *  Empty = no grouping, the whole crew is the ambient crowd. */
  groups: NpcGroup[];
  /** Per-NPC exceptions. Absent/empty = every NPC takes its group's answer. */
  overrides: NpcOverride[];
}

/**
 * One NPC differing from its group.
 *
 * Attributes resolve down a three-step chain — crew default, then the group's answer,
 * then this. Each field is independent: overriding a name says nothing about emotes. An
 * absent field is not "empty", it is "inherit", which is why every field here is optional
 * and `energetic` distinguishes null (inherit) from false (calm).
 */
export interface NpcOverride {
  /** Stable identity: `npc:<index>` — the same id the runtime addresses NPCs by. */
  id: string;
  name?: string;
  emotes?: string[];
  outfits?: DanceOutfit[];
  energetic?: boolean | null;
}

/** One complete avatar look (body shape + items + palette). Mirrors the fields a
 *  DCL profile/outfit carries, so the owner's own saved outfits map straight in. */
export interface DanceOutfit {
  bodyShape: string;
  wearables: string[];
  hairColor?: { r: number; g: number; b: number };
  skinColor?: { r: number; g: number; b: number };
  eyeColor?: { r: number; g: number; b: number };
}

// ---------------------------------------------------------------------------
// NPC groups — the crew pool split into behavior groups
//
// npc.count stays the MASTER number. Groups never add NPCs; they claim ordered
// slices of the pool (group 0 takes indices 0..count-1, group 1 the next, …).
// NPCs left unclaimed form the ambient remainder and keep today's default
// behavior. groups = [] means "no grouping" — the whole crew is ambient.
// ---------------------------------------------------------------------------

export type NpcGroupRole = "dance_together" | "dance_solo" | "hangout" | "roam";

export const NPC_GROUP_ROLES: readonly NpcGroupRole[] = [
  "dance_together",
  "dance_solo",
  "hangout",
  "roam",
];

/**
 * Roles whose members perform a routine rather than mill about.
 *
 * Shared so the builder and the runtime agree on what "Movement" means: for these two it
 * is the TEMPO of the routine, for the others it is how restlessly they wander.
 */
export function isNpcDanceRole(role: NpcGroupRole): boolean {
  return role === "dance_together" || role === "dance_solo";
}

/**
 * Default role mix for a generated district crowd.
 *
 * Plaza (index 0) hangs out where visitors spawn. The next gathering dances in
 * place. Everyone else roams their own zone. `dance.enabled` stays false — these
 * roles ride `initVenueNpcs`, not the breakdance venue path.
 */
export function districtCrowdRole(index: number): NpcGroupRole {
  if (index === 0) return "hangout";
  if (index === 1) return "dance_together";
  return "roam";
}

/**
 * Movement → time multiplier for a dancing group. Below 1 = act sooner.
 *
 * Read from the GROUP, never a single dancer: `dance_together` is a unison routine and a
 * per-dancer interval would break the very thing that role promises.
 */
export function npcDanceTempoScale(energetic: boolean | null): number {
  return energetic === true ? 0.6 : energetic === false ? 1.6 : 1;
}

/**
 * "anywhere" is anywhere the crowd already is — it wanders within about ten metres of the
 * dance floor. "scene" is the whole plot: no anchor, the entire deployed area including
 * the ground between buildings. On a 45×45 plot those are completely different answers,
 * and only the second one makes a big scene feel inhabited.
 */
export type NpcGroupPlaceKind = "dance_floor" | "zone" | "floors" | "anywhere" | "scene";

export const NPC_GROUP_PLACE_KINDS: readonly NpcGroupPlaceKind[] = [
  "dance_floor",
  "zone",
  "floors",
  "anywhere",
  "scene",
];

export interface NpcGroupPlace {
  kind: NpcGroupPlaceKind;
  /** floor_zone component id when kind = "zone". */
  zoneId: string | null;
  /** Allowed floor indices (0 = ground) when kind = "floors". */
  floors: number[];
}

/**
 * How a group arranges itself inside its zone.
 *
 * `scatter` is the long-standing golden-angle sampler. It is deterministic, not random,
 * and at close range it reads as an organic crowd — but from above its seven radial
 * bands line up into visible spokes (the "golden triangle"). It stays the default
 * because it is what every existing scene already looks like.
 * `circle` = one ring. `gathering` = same angle, continuous radius (a blob).
 * `grid` = 12-file military squad. `rows` = squarest packed grid with jitter.
 */
export type NpcGroupFormation = "scatter" | "circle" | "rows" | "gathering" | "grid";

export const NPC_GROUP_FORMATIONS: readonly NpcGroupFormation[] = [
  "scatter",
  "circle",
  "rows",
  "gathering",
  "grid",
];

export interface NpcGroup {
  id: string;
  name: string;
  /** NPCs claimed from the crew pool, clamped by npcGroupSlices() so the total
   *  never exceeds npc.count. */
  count: number;
  role: NpcGroupRole;
  place: NpcGroupPlace;
  /** Emote rotation for this group. Empty = inherit crew-level npc.emotes. */
  emotes: string[];
  /** Group outfit cycle. Empty = inherit the crew-level outfits. */
  outfits: DanceOutfit[];
  /** Raw pasted links behind `outfits` — builder metadata, runtime ignores it. */
  outfitLinks: string[];
  /**
   * Named dress-code token that produced `outfits` (`casual`, `club`, …).
   * Authoring metadata — the runtime renders `outfits`, not this string.
   * Absent/empty = custom URNs or the built-in crew fallback.
   */
  dressCode?: string | null;
  /**
   * Cast Pack token that produced `outfits` (`street`, `cyber`, …) plus the
   * seed that chose WHICH characters from it. Authoring metadata like
   * `dressCode` — the runtime renders `outfits` and never reads these — but
   * keeping the pair means a reshuffle is one number, not a rewritten wall of
   * URNs, and the panel can still say which cast a group is wearing.
   */
  castPack?: string | null;
  castSeed?: number;
  /** Movement override: false = calm, true = energetic, null = crew default
   *  (crowd.aggressive). */
  energetic: boolean | null;
  /** How the group stands inside its zone. See NpcGroupFormation. */
  formation: NpcGroupFormation;
  /** Greeting tone for encounter beats (shared/npc-encounters.ts).
   *  null/absent = crew default (friendly). Optional so group literals written
   *  before encounters existed keep compiling; normalizeNpcGroup always fills it. */
  attitude?: NpcAttitude | null;
  /** false = encounter beats never borrow this group (e.g. a show troupe).
   *  The always-on guest-acknowledge ground rule still applies — this only
   *  gates the personality layer and future director-driven encounters.
   *  Optional for the same reason as `attitude`; absent means true. */
  interruptible?: boolean;
}

export interface NpcGroupSlice {
  /** null = the ungrouped remainder (ambient crowd, default behavior). */
  group: NpcGroup | null;
  /** First crew index (npc:<start>) in this slice. */
  start: number;
  size: number;
}

/**
 * Deterministic pool allocation: groups claim crew indices in array order,
 * each clamped to what's left, so the total never exceeds the pool. Leftover
 * NPCs become a final null-group slice. Pure and shared — the builder's
 * "N of M assigned" counter and the scene runtime both derive from this, so
 * they can never disagree.
 */
export function npcGroupSlices(
  count: number,
  groups: readonly NpcGroup[]
): NpcGroupSlice[] {
  const pool = Math.max(0, Math.round(count));
  const slices: NpcGroupSlice[] = [];
  let next = 0;
  for (const group of groups) {
    if (next >= pool) break;
    const size = Math.min(Math.max(0, Math.round(group.count)), pool - next);
    if (size <= 0) continue;
    slices.push({ group, start: next, size });
    next += size;
  }
  if (next < pool) slices.push({ group: null, start: next, size: pool - next });
  return slices;
}

/** The group owning crew index `index`, or null for the ambient remainder. */
export function npcGroupForIndex(
  count: number,
  groups: readonly NpcGroup[],
  index: number
): NpcGroup | null {
  for (const slice of npcGroupSlices(count, groups)) {
    if (index >= slice.start && index < slice.start + slice.size) return slice.group;
  }
  return null;
}

/**
 * Crew index for a scripted NPC turn. Always someone on the support ring —
 * never an outskirts roamer who cannot reach the floor before countdown.
 */
export function npcPerformerIndex(config: DanceVenueConfig, turnCounter: number): number {
  const pool = Math.max(1, config.npc.count);
  const slices = npcGroupSlices(config.npc.count, config.npc.groups);
  const supportId = config.supportZoneId?.trim() || null;
  const ring =
    slices.find(
      (slice) =>
        !!supportId && slice.group?.place.kind === "zone" && slice.group.place.zoneId === supportId
    ) ??
    slices.find((slice) => slice.group?.formation === "circle") ??
    slices.find((slice) => slice.group?.role === "hangout") ??
    slices[0];
  const start = ring?.start ?? 0;
  const size = Math.max(1, ring?.size ?? pool);
  return start + (Math.max(0, turnCounter) % size);
}

/** After a human turn, at most this many NPC fillers while that human waits to go again. */
export const NPC_FILLERS_BETWEEN_HUMANS = 2;

export function normalizeNpcGroup(raw: unknown, fallbackId: string): NpcGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Partial<NpcGroup> & { place?: Partial<NpcGroupPlace> };
  const role = NPC_GROUP_ROLES.includes(g.role as NpcGroupRole)
    ? (g.role as NpcGroupRole)
    : "roam";
  const kind = NPC_GROUP_PLACE_KINDS.includes(g.place?.kind as NpcGroupPlaceKind)
    ? (g.place!.kind as NpcGroupPlaceKind)
    : "anywhere";
  const countRaw = Number(g.count);
  return {
    id: typeof g.id === "string" && g.id.trim() ? g.id.trim() : fallbackId,
    name: typeof g.name === "string" && g.name.trim() ? g.name.trim() : "Group",
    count: Number.isFinite(countRaw) ? Math.min(100, Math.max(0, Math.round(countRaw))) : 0,
    role,
    place: {
      kind,
      zoneId:
        kind === "zone" && typeof g.place?.zoneId === "string" && g.place.zoneId.trim()
          ? g.place.zoneId.trim()
          : null,
      floors:
        kind === "floors" && Array.isArray(g.place?.floors)
          ? g.place!.floors!
              .map((f) => Math.round(Number(f)))
              .filter((f) => Number.isFinite(f) && f >= 0 && f <= 50)
          : [],
    },
    emotes: Array.isArray(g.emotes)
      ? g.emotes.map((e) => String(e).trim()).filter(Boolean)
      : [],
    outfits: Array.isArray(g.outfits)
      ? g.outfits.map(normalizeDanceOutfit).filter((o): o is DanceOutfit => o !== null)
      : [],
    outfitLinks: Array.isArray(g.outfitLinks)
      ? g.outfitLinks.map((s) => String(s).trim()).filter(Boolean)
      : [],
    dressCode: parseDressCodeId(typeof g.dressCode === "string" ? g.dressCode : "") ?? null,
    castPack: resolveCastPackId(typeof g.castPack === "string" ? g.castPack : "") ?? null,
    castSeed: Number.isFinite(Number(g.castSeed)) ? Math.abs(Math.round(Number(g.castSeed))) % 100000 : 0,
    energetic: typeof g.energetic === "boolean" ? g.energetic : null,
    // Every group saved before formations existed keeps the layout it already has.
    formation: NPC_GROUP_FORMATIONS.includes(g.formation as NpcGroupFormation)
      ? (g.formation as NpcGroupFormation)
      : "scatter",
    attitude: NPC_ATTITUDES.includes(g.attitude as NpcAttitude)
      ? (g.attitude as NpcAttitude)
      : null,
    interruptible: g.interruptible !== false,
  };
}

export function normalizeNpcGroups(raw: unknown): NpcGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g, i) => normalizeNpcGroup(g, `group_${i + 1}`))
    .filter((g): g is NpcGroup => g !== null);
}

/**
 * Unique, single-word crew names. The NPC limit is 100, so the default pool is
 * large enough that a full scene never needs a visible numeric suffix.
 */
export const DEFAULT_NPC_NAMES = [
  "Nina", "Noah", "Nadia", "Nico", "Nora", "Nate", "Naomi", "Nils", "Maya", "Leo",
  "Zara", "Kai", "Luna", "Milo", "Iris", "Ezra", "Aria", "Theo", "Cleo", "Jude",
  "Ayla", "Finn", "Nova", "Remy", "Mina", "Owen", "Kira", "Hugo", "Esme", "Liam",
  "Talia", "Enzo", "Freya", "Luca", "Amara", "Otis", "Siena", "Ravi", "Layla", "Axel",
  "Nia", "Eli", "Zoe", "Cole", "Rhea", "Levi", "Mira", "Beau", "Thea", "Ivan",
  "Cora", "Jace", "Lila", "Max", "Anya", "Reid", "Eden", "Sage", "Tara", "Dean",
  "Faye", "Zane", "Isla", "Rhys", "Gia", "Knox", "Hope", "Toby", "Opal", "Ari",
  "Skye", "Joel", "Vera", "Cruz", "Wren", "Lane", "Ruby", "Drew", "Juno", "Abel",
  "Lyra", "Kian", "Maeve", "Rory", "Dahlia", "Nash", "Elara", "Dante", "Priya", "Orion",
  "Selah", "Marco", "Asha", "Jonah", "Indie", "Felix", "Zuri", "Samir", "Evie", "Bodhi",
];

/** Keep only the first word of a crew label. Per-NPC overrides stay free-form. */
function npcFirstName(value: unknown): string {
  return String(value ?? "").trim().split(/\s+/, 1)[0] ?? "";
}

/**
 * Explorer nametags treat `AvatarShape.id`.right(4) like a player discriminator.
 * A stored label such as `Zoee-42` or `Zoe#e-42` is that leak, not a real name.
 */
function npcNameLooksNumbered(value: string): boolean {
  return /#|\d/.test(value);
}

/** Resolve legacy, partial, or duplicated lists into unique first names. */
function uniqueNpcFirstNames(raw: readonly unknown[], count: number): string[] {
  const total = Math.max(0, Math.min(100, Math.round(count)));
  const used = new Set<string>();
  const result: string[] = [];
  for (let index = 0; index < total; index++) {
    const requestedRaw = npcFirstName(raw[index]);
    const requested = npcNameLooksNumbered(requestedRaw) ? "" : requestedRaw;
    const fallback = npcFirstName(DEFAULT_NPC_NAMES[index]);
    let name = requested || fallback;
    if (!name || used.has(name.toLocaleLowerCase()) || npcNameLooksNumbered(name)) {
      name = DEFAULT_NPC_NAMES.find((candidate) => !used.has(candidate.toLocaleLowerCase())) ?? `Dancer${index + 1}`;
    }
    used.add(name.toLocaleLowerCase());
    result.push(name);
  }
  return result;
}

// ---------------------------------------------------------------------------
// NPC participants — synthetic queue members driven by the coordinator
// ---------------------------------------------------------------------------

export const NPC_USER_PREFIX = "npc:" as const;

export function isNpcUserId(userId: string | null | undefined): boolean {
  return !!userId && userId.startsWith(NPC_USER_PREFIX);
}

export function npcUserId(index: number): string {
  return `${NPC_USER_PREFIX}${index}`;
}

export function npcIndexFromUserId(userId: string): number {
  const n = Number(userId.slice(NPC_USER_PREFIX.length));
  return Number.isFinite(n) ? n : 0;
}

/**
 * The crew-list name for this index, BEFORE any per-NPC override.
 *
 * Kept separate from npcDisplayName on purpose: anything that writes back into
 * `npc.names` must use this one. Using the resolved name there copies an override into
 * the crew list, where it outlives the override and can never be reset.
 */
export function npcCrewName(config: DanceVenueConfig, index: number): string {
  if (index < 0) return "Dancer";
  const names = uniqueNpcFirstNames(config.npc.names, index + 1);
  return names[index] ?? `Dancer${index + 1}`;
}

/** What this NPC is CALLED — crew list, unless it has a name of its own. */
export function npcDisplayName(config: DanceVenueConfig, index: number): string {
  return resolveNpcAttributes(config, index).name;
}

/** Occupies Explorer's `id.slice(-4)` discriminator so it paints as nothing. */
const NPC_AVATAR_ID_PAD = "\u200b\u200b\u200b\u200b";

/** 0 → a, 25 → z, 26 → aa. Letter-only, so a leaked suffix cannot be `e-42`. */
function npcIndexLetters(index: number): string {
  let n = Math.max(0, Math.round(index)) + 1;
  let out = "";
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out || "a";
}

/**
 * Internal AvatarShape id. Must NOT be the display name: Explorer paints
 * `name` in colour and `id.slice(-4)` in white, so `id: "Levi"` became `LeviLevi`
 * and `id: "Nadia"` became `Nadiaadia`. `dance-troupe-42` leaked as `e-42`.
 *
 * Unique, letter-only body + four zero-width spaces as the discriminator.
 */
export function npcAvatarShapeId(_config: DanceVenueConfig, index: number): string {
  return `bot${npcIndexLetters(index)}${NPC_AVATAR_ID_PAD}`;
}

/** What Explorer shows on the nametag: coloured name + last four of the avatar id. */
export function npcExplorerNametag(name: string, avatarId: string): string {
  return `${name}${avatarId.slice(-4)}`.replace(/\u200b/g, "");
}

/** Where a resolved attribute came from — the builder shows inherited values differently. */
export type NpcAttributeSource = "crew" | "group" | "npc";

export interface ResolvedNpcAttributes {
  id: string;
  name: string;
  emotes: string[];
  outfits: DanceOutfit[];
  /** Resolved to a concrete answer; null anywhere in the chain means "keep looking". */
  energetic: boolean | null;
  group: NpcGroup | null;
  source: Record<"name" | "emotes" | "outfits" | "energetic", NpcAttributeSource>;
}

export function npcOverrideFor(
  config: DanceVenueConfig,
  index: number
): NpcOverride | undefined {
  const id = npcUserId(index);
  return (config.npc.overrides ?? []).find((o) => o.id === id);
}

/**
 * THE inheritance chain: crew default → the NPC's group → that one NPC.
 *
 * One function, shared by the builder and the runtime, so what the panel promises and
 * what dances in-world cannot disagree. Each attribute walks the chain independently:
 * naming one dancer must not silently pin its emotes to the crew default too.
 */
export function resolveNpcAttributes(
  config: DanceVenueConfig,
  index: number
): ResolvedNpcAttributes {
  const npc = config.npc;
  const group = npcGroupForIndex(npc.count, npc.groups, index);
  const override = npcOverrideFor(config, index);

  const crewName = npcCrewName(config, index);

  const nameFromNpc = override?.name?.trim();
  const emotesFromNpc = override?.emotes?.length ? override.emotes : undefined;
  const outfitsFromNpc = override?.outfits?.length ? override.outfits : undefined;
  const energeticFromNpc = override?.energetic ?? null;

  const emotesFromGroup = group?.emotes.length ? group.emotes : undefined;
  const outfitsFromGroup = group?.outfits.length ? group.outfits : undefined;
  const energeticFromGroup = group?.energetic ?? null;

  return {
    id: npcUserId(index),
    name: nameFromNpc || crewName,
    emotes: emotesFromNpc ?? emotesFromGroup ?? npc.emotes,
    outfits: outfitsFromNpc ?? outfitsFromGroup ?? npc.outfits,
    energetic: energeticFromNpc ?? energeticFromGroup,
    group,
    source: {
      name: nameFromNpc ? "npc" : "crew",
      emotes: emotesFromNpc ? "npc" : emotesFromGroup ? "group" : "crew",
      outfits: outfitsFromNpc ? "npc" : outfitsFromGroup ? "group" : "crew",
      energetic: energeticFromNpc !== null ? "npc" : energeticFromGroup !== null ? "group" : "crew",
    },
  };
}

/** Drop overrides for NPCs the pool no longer has, and dedupe by id. */
export function normalizeNpcOverrides(raw: unknown, count: number): NpcOverride[] {
  if (!Array.isArray(raw)) return [];
  const pool = Math.max(0, Math.round(count));
  const seen = new Set<string>();
  const out: NpcOverride[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Partial<NpcOverride>;
    const id = typeof o.id === "string" ? o.id : "";
    if (!id.startsWith(NPC_USER_PREFIX) || seen.has(id)) continue;
    const index = npcIndexFromUserId(id);
    // An override for a dancer beyond the pool would silently re-apply if the crew
    // grew back — but it would also mean the panel lists people who do not exist.
    if (index < 0 || index >= pool) continue;
    seen.add(id);
    const next: NpcOverride = { id };
    if (typeof o.name === "string" && o.name.trim()) next.name = o.name.trim();
    if (Array.isArray(o.emotes) && o.emotes.length) {
      next.emotes = o.emotes.filter((e): e is string => typeof e === "string");
    }
    if (Array.isArray(o.outfits) && o.outfits.length) next.outfits = o.outfits as DanceOutfit[];
    if (typeof o.energetic === "boolean") next.energetic = o.energetic;
    out.push(next);
  }
  return out;
}

/** Small deterministic hash → [0, 1). Same turn number = same show everywhere. */
function hash01(n: number): number {
  let x = (n + 1) * 2654435761;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  x = ((x >>> 16) ^ x) >>> 0;
  return (x % 1000) / 1000;
}

/**
 * The scripted plan for an NPC turn — pure of wall-clock and randomness so every
 * client (and any future coordinator takeover) computes the identical show.
 * willFail turns are cut short: the coordinator simply stops feeding emotes and
 * the normal idle rule ejects the bot, exactly like a hesitating human.
 */
export function npcTurnPlan(
  config: DanceVenueConfig,
  turnCounter: number
): { durationS: number; willFail: boolean } {
  const willFail = config.npc.failEvery > 0 && turnCounter % config.npc.failEvery === config.npc.failEvery - 1;
  const base = config.npc.turnS;
  const varied = base * (0.75 + 0.5 * hash01(turnCounter));
  return {
    durationS: willFail ? Math.max(4, varied * 0.45) : varied,
    willFail,
  };
}

/** Deterministic emote pick for an NPC dancer's Kth move of turn T. */
export function npcNextEmote(config: DanceVenueConfig, turnCounter: number, moveIndex: number): string {
  const list = config.npc.emotes.length ? config.npc.emotes : ["robot"];
  const start = Math.floor(hash01(turnCounter) * list.length);
  return list[(start + moveIndex) % list.length] ?? list[0]!;
}

export interface DanceCrowdConfig {
  /** Predefined DCL emote ids for automatic support-circle reactions. */
  emotes: string[];
  /** Seconds between automatic crowd reactions while idle in the circle. */
  periodS: number;
  /** Crowd choreography (scene reads these; empty = built-in defaults):
   *  the two MAINS alternate — hands-up ↔ ready-bounce — with peer + step-in as
   *  accents. Owner-swappable so the crowd's vibe is tunable from the builder. */
  handsUpEmote?: string;
  readyEmote?: string;
  peerEmote?: string;
  stepInEmote?: string;
  /** When true (default), the crowd periodically does the aggressive step-in
   *  (uprock) as if trying to break onto the floor. */
  aggressive?: boolean;
}

/** One uploaded music track, deployed with the scene. */
export interface DanceMusicTrack {
  /** Scene-relative path, e.g. assets/music/track_3.mp3 (set at publish). */
  file: string;
  title: string;
  /** Captured at upload (needed to advance the playlist — no end event in SDK). */
  durationS: number;
}

/** The owner's breakdance playlist. Advance is DETERMINISTIC from (startedAt,
 *  seed, durations) so every client computes the same next track locally with
 *  no coordinator traffic — only start/skip/stop travel the bus. */
export interface DanceMusicConfig {
  mode: "shuffle" | "sequence";
  tracks: DanceMusicTrack[];
  /**
   * Which Music-library tracks this venue plays, by library id.
   *
   * `null` = the whole shelf, and stays the default: uploading two songs must
   * play two songs without anyone discovering a checkbox first. A list is a
   * SUBSET. Only the builder reads this — publish resolves it into `tracks`,
   * so the runtime never sees an id it cannot open.
   * See shared/music-library-contract.ts.
   */
  selectedTrackIds: string[] | null;
}

/** A stored selection, cleaned: strings only, de-duplicated, empty → null. */
export function normalizeSelectedTrackIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = [...new Set(raw.map((id) => String(id ?? "").trim()).filter(Boolean))];
  return ids.length ? ids : null;
}

export function defaultDanceMusicConfig(): DanceMusicConfig {
  return { mode: "shuffle", tracks: [], selectedTrackIds: null };
}

/** Deterministic playlist order: step k → track index. Same on every client. */
export function musicTrackIndex(music: DanceMusicConfig, seed: number, step: number): number {
  const n = music.tracks.length;
  if (n === 0) return 0;
  if (music.mode === "sequence") return (seed + step) % n;
  return Math.floor(hash01(seed * 7919 + step) * n) % n;
}

/**
 * A DANCE SET — the fixed circle-in-circle layout, relocatable as one unit.
 * Dancing happens inside the inner `floorRadius`; the crowd gathers in the ring
 * out to `gatherRadius`. Authored in composer-local metres (centre-relative),
 * so it moves with the building and the owner repositions it with one X/Z.
 * This REPLACES picking two arbitrary floor zones (the confusing part).
 */
export interface DanceSetPlacement {
  floorIndex: number;
  centerX: number;
  centerZ: number;
  /** Inner circle radius — the dancer-only floor. */
  floorRadius: number;
  /** Outer ring radius — where the crowd stands / the queue registers. */
  gatherRadius: number;
}

export function defaultDanceSetPlacement(): DanceSetPlacement {
  // Tight crowd ring on the PLOT, not inside a building. Gather sits just outside
  // the floor so supporters pack in close around the dancer.
  return { floorIndex: SITE_FLOOR_INDEX, centerX: 0, centerZ: 0, floorRadius: 2.4, gatherRadius: 5 };
}

/** A no-go disc or wall capsule (building-local metres) — columns, benches,
 *  statues, arches, and ground-floor glass/solid walls.
 *  Baked into the config at PUBLISH time so the runtime can keep NPCs out of
 *  geometry (they must not clip through walls or glass; open sides and interiors
 *  stay walkable).
 *  When `x2`/`z2` are set the blocker is a capsule along that segment.
 *  When `hx`/`hz` are set the blocker is a filled rectangle (legacy). */
export interface DanceObstruction {
  x: number;
  z: number;
  r: number;
  /** Capsule endpoint. When set with `z2`, this is a wall/glass segment. */
  x2?: number;
  z2?: number;
  /** Half-width of an AABB blocker. When set with `hz`, this is a rectangle. */
  hx?: number;
  /** Half-depth of an AABB blocker. */
  hz?: number;
  /** When set, disc applies only on this floor index. */
  floorIndex?: number;
}

// ---------------------------------------------------------------------------
// Venue activity modes (host-driven crowd director)
// ---------------------------------------------------------------------------

/** Host-selectable crowd activity — orthogonal to the breakdance turn reducer. */
export type VenueActivityMode = "social" | "show" | "free_roam" | "choreography" | "paused";

export const VENUE_ACTIVITY_MODES: VenueActivityMode[] = [
  "social",
  "show",
  "free_roam",
  "choreography",
  "paused",
];

export type ResumableActivityMode = Exclude<VenueActivityMode, "paused">;

export function activityModeFromLegacyActivated(activated: boolean): ResumableActivityMode {
  return activated ? "show" : "social";
}

export function isCompetitiveShowMode(mode: VenueActivityMode): boolean {
  return mode === "show";
}

/** Club lights/smoke/music auto-follow when the room should feel "on". */
export function isClubAtmosphereMode(mode: VenueActivityMode): boolean {
  return mode === "show" || mode === "free_roam" || mode === "choreography";
}

/** Effective mode for NPC logic — paused resumes the stored prior mode. */
export function effectiveActivityMode(
  mode: VenueActivityMode,
  resumeMode: ResumableActivityMode
): ResumableActivityMode {
  return mode === "paused" ? resumeMode : mode;
}

export interface DanceChoreographyConfig {
  /** Catalogue id the Host picker starts on. Live picks travel on the dance bus. */
  activeRoutineId: string;
  formation: ChoreographyFormationKind;
  /** NPC performers on the floor (default nine). */
  performerCount: number;
  leadCount: number;
  backupCount: number;
  /** Lead / default track — scene-emote paths or base emote ids. */
  moves: string[];
  backupMoves: string[];
  idleMoves: string[];
  /** Per-move hold duration in ms (cycles if shorter than moves). */
  moveDurationMs: number;
  /** Repeat the routine after the last move. */
  loop: boolean;
  /** Metres between formation slots on the dance floor. */
  formationSpacing: number;
  /** Direction performers face, in scene yaw degrees. 180 = venue front/south. */
  audienceYawDeg: number;
}

export function defaultDanceChoreographyConfig(): DanceChoreographyConfig {
  const routine = defaultChoreographyRoutine();
  return {
    activeRoutineId: routine.id,
    formation: routine.formation,
    performerCount: routine.performerCount,
    leadCount: routine.leadCount,
    backupCount: routine.backupCount,
    moves: [...routine.tracks.lead],
    backupMoves: [...routine.tracks.backup],
    idleMoves: [...routine.tracks.idle],
    moveDurationMs: routine.moveDurationMs,
    loop: routine.loop,
    formationSpacing: routine.formationSpacing,
    audienceYawDeg: routine.audienceYawDeg,
  };
}

/** Deterministic formation slot — chevron by default (1–2–3–3). */
export function choreographyFormationSlot(
  performerIndex: number,
  centerX: number,
  centerZ: number,
  spacing: number,
  formation: ChoreographyFormationKind = "chevron",
  performerCount = 9
): { x: number; z: number; row: number; col: number } {
  return formationSlotFromCatalogue(
    performerIndex,
    centerX,
    centerZ,
    spacing,
    formation,
    performerCount
  );
}

export interface ChoreographyScheduleTick {
  moveIndex: number;
  emote: string;
  moveElapsedMs: number;
  routineElapsedMs: number;
  loopComplete: boolean;
}

/** Wall-clock choreography position — identical on every client. */
export function choreographyScheduleAt(
  config: DanceChoreographyConfig,
  startedAt: number,
  now: number
): ChoreographyScheduleTick | null {
  const routine = resolveChoreographyRoutine(config, config.activeRoutineId);
  const moves = routine.tracks.lead.length ? routine.tracks.lead : ["robot"];
  const dur = Math.max(800, routine.moveDurationMs);
  const beat = choreographyBeatAt(
    routine.moveDurationMs,
    routine.loop,
    startedAt,
    now,
    longestChoreographyTrack(routine)
  );
  if (!beat) return null;
  const cycle = beat.elapsedMs % Math.max(dur, moves.length * dur);
  return {
    moveIndex: beat.beat,
    emote: choreographyEmoteAt(moves, beat.beat),
    moveElapsedMs: cycle - Math.floor(cycle / dur) * dur,
    routineElapsedMs: beat.elapsedMs,
    loopComplete: beat.loopComplete,
  };
}

import type { CrowdNavigationConfig } from "./crowd-navigation";
import { defaultCrowdNavigationConfig, normalizeCrowdNavigationConfig } from "./crowd-navigation";

export interface DanceVenueConfig {
  enabled: boolean;
  /** Show runs from scene load. Admin can still stop/start via the host console. */
  autoStart: boolean;
  /** The fixed dance-set layout (circle-in-circle). When set, the runtime builds
   *  both circles from this and zone binding is not needed. */
  placement: DanceSetPlacement;
  /** LEGACY floor_zone component ids — only used when `placement` is absent
   *  (older configs). New publishes always carry `placement`. */
  danceFloorZoneId: string | null;
  /** floor_zone component id of the support circle (queue registration). */
  supportZoneId: string | null;
  /** Generic zone that owns the app's lights and smoke. */
  clubFxZoneId: string | null;
  /** 3-2-1-GO length. */
  countdownSeconds: number;
  /** Stage-1 allowed gap between emotes before ejection (never below a long move). */
  maxIdleGapS: number;
  /** Survive this many seconds to earn a REFRESH — your repeat/variety history
   *  clears so you can reuse your whole move set and keep going. Turns the game
   *  into endurance+rhythm skill instead of a dead-end once you run out of moves. */
  refreshIntervalS: number;
  /** Nth consecutive use of the same emote ejects (5 = fifth use fails). */
  maxRepeatCount: number;
  /** Unique emotes required once stage 2 starts. */
  minUniqueEmotes: number;
  /** Seconds per difficulty stage. */
  stageIntervalS: number;
  /** Grace period to satisfy the unique-emotes rule after stage 2 begins. */
  varietyGraceS: number;
  /** Hard cap on a turn. Legacy null values normalize to the safe default. */
  maxTurnS: number | null;
  /** Neutral prep emotes played during the countdown (random pick). */
  prepEmotes: string[];
  /**
   * The ONE waiting bounce for the outer support circle (scene emote path).
   * Looped while queued/waiting. Forbidden as a "real move" on the dance floor —
   * using it there fails the turn (`wait_move`).
   */
  waitEmoteSrc: string;
  /** Length of `waitEmoteSrc` — drives the outer-circle auto-loop period. */
  waitEmoteDurationMs: number;
  /**
   * Light floor step used during countdown on the dance floor (scene emote path).
   * Not the wait bounce — a real light breakdance step.
   */
  floorPrepEmoteSrc: string;
  npc: DanceNpcConfig;
  crowd: DanceCrowdConfig;
  /** Breakdance-owned presets backed by the reusable crowd-reaction contract. */
  reactions: BreakdanceReactionConfig;
  /** Seconds the failure result stays on screen. */
  failureDisplayS: number;
  /** Seconds between turns. */
  transitionS: number;
  /** Seconds a selected dancer has to reach the floor before the countdown. */
  selectGraceS: number;
  /** Presence heartbeats older than this drop a member from the queue. */
  memberTimeoutS: number;
  /** Scene-wide NPC encounter mood (shared/npc-encounters.ts). Admin picks a
   *  mood; the cards themselves are authored in the repo. */
  encounterMood: EncounterMood;
  /** Publish-computed no-go discs (columns + placed pieces) — NOT user-authored.
   *  The runtime nudges NPC/dancer positions out of these. */
  obstructions?: DanceObstruction[];
  /** The owner's uploaded breakdance playlist (files embedded at publish). */
  music: DanceMusicConfig;
  /** How music fills the venue: 'venue' = omnipresent (follows the listener,
   *  same volume everywhere), 'floor' = positional (loudest at the dance floor,
   *  fades with distance). */
  musicSpread: "venue" | "floor";
  /** Club lighting + smoke over the dance floor. */
  clubFx: DanceClubFxConfig;
  /** Authored multi-floor roam graph for free-roam club mode. */
  crowdNavigation: CrowdNavigationConfig;
  /** Synchronized floor choreography (nine performers by default). */
  choreography: DanceChoreographyConfig;
}

export interface DanceClubFxConfig {
  enabled: boolean;
  /** Lights flash to the (simulated) beat while music plays. */
  beatFlash: boolean;
  /** 0..2 smoke output multiplier. */
  smokeStrength: number;
  /** Yaw (deg) the smoke blows toward; 0 = toward the stage/screen wall (+Z). */
  smokeAngleDeg: number;
  /** Metres the spotlights hang above the floor. */
  lightHeight: number;
}

export function defaultDanceClubFxConfig(): DanceClubFxConfig {
  return { enabled: true, beatFlash: true, smokeStrength: 1, smokeAngleDeg: 0, lightHeight: 7 };
}

export function defaultDanceVenueConfig(): DanceVenueConfig {
  return {
    enabled: false,
    autoStart: true,
    placement: defaultDanceSetPlacement(),
    danceFloorZoneId: null,
    supportZoneId: null,
    clubFxZoneId: null,
    countdownSeconds: 3,
    maxIdleGapS: 10,
    refreshIntervalS: 30,
    maxRepeatCount: 5,
    minUniqueEmotes: 3,
    stageIntervalS: 30,
    varietyGraceS: 15,
    // The historical unlimited setting allowed runs past five minutes and could
    // strand the queue. Three minutes keeps endurance meaningful while ensuring
    // every waiting player gets a bounded turn.
    maxTurnS: 180,
    prepEmotes: ["fistpump", "tik", "robot"],
    // BD Ready Bounce — the slow outer-circle waiting sway (also on the Dance Bug wearable).
    waitEmoteSrc: "emotes/bd_ready_3_x2_emote.glb",
    waitEmoteDurationMs: 4500,
    // Light uprock step for the floor during 3-2-1 — never the wait bounce.
    floorPrepEmoteSrc: "emotes/bd_uprock_new_emote.glb",
    npc: {
      enabled: true,
      name: "Dance Bot",
      // Default show rotation from the emote library (shared/emote-library.ts).
      // Paths resolve to scene-emote URNs at runtime (scene/src/dance/scene-emotes.ts).
      emotes: [
        "emotes/ballet_turn_loop_emote.glb",
        "emotes/windmill_combo_emote.glb",
        "emotes/headspin_combo_emote.glb",
        "emotes/bd_1990_new_x4_emote.glb",
        "emotes/bboy_uprock_emote.glb",
        "emotes/snake_hiphop_new_emote.glb",
        "emotes/bd_footwork_to_freeze_emote.glb",
        "emotes/bd_uprock_to_ground_new_emote.glb",
        "emotes/bboy_hiphop_move_new_emote.glb",
      ],
      routineSeconds: 8,
      count: 12,
      turnS: 20,
      failEvery: 3,
      names: [...DEFAULT_NPC_NAMES],
      wearables: [],
      outfits: [],
      outfitLinks: [],
      castPack: null,
      castSeed: 0,
      groups: [],
      overrides: [],
    },
    crowd: {
      emotes: ["clap", "handsair", "dontsee", "handsair"],
      periodS: 9,
      handsUpEmote: "handsair",
      readyEmote: "emotes/bd_ready_3_x2_emote.glb",
      peerEmote: "dontsee",
      stepInEmote: "emotes/bd_uprock_new_emote.glb",
      // Calm is the launch default: relaxed crowd that keeps its distance.
      // "Energetic" in the builder opts back into the aggressive uprock.
      aggressive: false,
    },
    reactions: defaultBreakdanceReactionConfig(),
    failureDisplayS: 4,
    transitionS: 2,
    selectGraceS: 4,
    memberTimeoutS: 12,
    encounterMood: "friendly",
    music: defaultDanceMusicConfig(),
    musicSpread: "venue",
    clubFx: defaultDanceClubFxConfig(),
    crowdNavigation: defaultCrowdNavigationConfig(),
    choreography: defaultDanceChoreographyConfig(),
  };
}

export function normalizeDanceVenueConfig(
  partial: Partial<DanceVenueConfig> | null | undefined
): DanceVenueConfig | null {
  if (!partial) return null;
  const base = defaultDanceVenueConfig();
  const num = (v: unknown, fallback: number, min: number, max: number): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  const p = partial.placement;
  const dp = base.placement;
  const rawFloor = Number(p?.floorIndex);
  const floorIndex = Number.isFinite(rawFloor)
    ? Math.round(rawFloor) === SITE_FLOOR_INDEX
      ? SITE_FLOOR_INDEX
      : Math.round(num(rawFloor, dp.floorIndex, 0, 50))
    : dp.floorIndex;
  const placement: DanceSetPlacement = {
    floorIndex,
    centerX: num(p?.centerX, dp.centerX, -200, 200),
    centerZ: num(p?.centerZ, dp.centerZ, -200, 200),
    floorRadius: num(p?.floorRadius, dp.floorRadius, 1, 40),
    // gather ring must sit outside the dance floor.
    gatherRadius: Math.max(
      num(p?.floorRadius, dp.floorRadius, 1, 40) + 1,
      num(p?.gatherRadius, dp.gatherRadius, 2, 60)
    ),
  };
  const danceFloorZoneId = partial.danceFloorZoneId?.trim() || null;
  const supportZoneId = partial.supportZoneId?.trim() || null;
  const clubFxZoneId = partial.clubFxZoneId?.trim() || danceFloorZoneId;
  const npcCount = Math.round(num(partial.npc?.count, base.npc.count, 0, 100));
  const normalizedGroups = Array.isArray(partial.npc?.groups)
    ? normalizeNpcGroups(partial.npc!.groups).map((group): NpcGroup => ({
        ...group,
        // NPC placement now has one authored model: a named generic zone. Preserve
        // old dance-floor assignments by pointing them at the Breakdance app's zone;
        // ambiguous floor/crowd/scene choices become visibly unassigned for the owner
        // to resolve instead of silently guessing which building or crowd they meant.
        place: {
          kind: "zone",
          zoneId:
            group.place.kind === "zone"
              ? group.place.zoneId
              : group.place.kind === "dance_floor"
                ? danceFloorZoneId
                : null,
          floors: [],
        },
      }))
    : [...base.npc.groups];
  return {
    enabled: partial.enabled === true,
    autoStart: partial.autoStart ?? base.autoStart,
    placement,
    danceFloorZoneId,
    supportZoneId,
    clubFxZoneId,
    countdownSeconds: num(partial.countdownSeconds, base.countdownSeconds, 1, 10),
    maxIdleGapS: num(partial.maxIdleGapS, base.maxIdleGapS, LONGEST_MOVE_S, 60),
    refreshIntervalS: num(partial.refreshIntervalS, base.refreshIntervalS, 10, 180),
    maxRepeatCount: Math.round(num(partial.maxRepeatCount, base.maxRepeatCount, 2, 20)),
    minUniqueEmotes: Math.round(num(partial.minUniqueEmotes, base.minUniqueEmotes, 1, 20)),
    stageIntervalS: num(partial.stageIntervalS, base.stageIntervalS, 10, 600),
    varietyGraceS: num(partial.varietyGraceS, base.varietyGraceS, 5, 120),
    maxTurnS:
      partial.maxTurnS === null || partial.maxTurnS === undefined
        ? base.maxTurnS
        : num(partial.maxTurnS, 120, 15, 3600),
    prepEmotes: sanitizeEmoteList(partial.prepEmotes, base.prepEmotes),
    waitEmoteSrc:
      typeof partial.waitEmoteSrc === "string" && partial.waitEmoteSrc.trim()
        ? partial.waitEmoteSrc.trim()
        : base.waitEmoteSrc,
    waitEmoteDurationMs: Math.round(
      num(partial.waitEmoteDurationMs, base.waitEmoteDurationMs, 1500, 20000)
    ),
    floorPrepEmoteSrc:
      typeof partial.floorPrepEmoteSrc === "string" && partial.floorPrepEmoteSrc.trim()
        ? partial.floorPrepEmoteSrc.trim()
        : base.floorPrepEmoteSrc,
    npc: {
      enabled: partial.npc?.enabled ?? base.npc.enabled,
      name: partial.npc?.name?.trim() || base.npc.name,
      emotes: sanitizeEmoteList(partial.npc?.emotes, base.npc.emotes),
      routineSeconds: num(partial.npc?.routineSeconds, base.npc.routineSeconds, 3, 60),
      count: npcCount,
      turnS: num(partial.npc?.turnS, base.npc.turnS, 8, 120),
      failEvery: Math.round(num(partial.npc?.failEvery, base.npc.failEvery, 0, 10)),
      names: uniqueNpcFirstNames(
        Array.isArray(partial.npc?.names) && partial.npc.names.length
          ? partial.npc.names
          : base.npc.names,
        npcCount
      ),
      wearables: Array.isArray(partial.npc?.wearables)
        ? partial.npc!.wearables!.map((w) => String(w).trim()).filter(Boolean)
        : [...base.npc.wearables],
      outfits: Array.isArray(partial.npc?.outfits)
        ? partial.npc!.outfits!.map(normalizeDanceOutfit).filter((o): o is DanceOutfit => o !== null)
        : [...base.npc.outfits],
      outfitLinks: Array.isArray(partial.npc?.outfitLinks)
        ? partial.npc!.outfitLinks!.map((s) => String(s).trim()).filter(Boolean)
        : [...base.npc.outfitLinks],
      castPack:
        resolveCastPackId(typeof partial.npc?.castPack === "string" ? partial.npc.castPack : "")
        ?? base.npc.castPack
        ?? null,
      castSeed: Number.isFinite(Number(partial.npc?.castSeed))
        ? Math.abs(Math.round(Number(partial.npc?.castSeed))) % 100000
        : (base.npc.castSeed ?? 0),
      groups: normalizedGroups,
      // Normalized against the SAME count this config ends up with, so shrinking the
      // crew cannot leave overrides addressed to dancers who no longer exist.
      overrides: normalizeNpcOverrides(
        partial.npc?.overrides ?? base.npc.overrides,
        Math.round(num(partial.npc?.count, base.npc.count, 0, 100))
      ),
    },
    crowd: {
      emotes: sanitizeEmoteList(partial.crowd?.emotes, base.crowd.emotes),
      periodS: num(partial.crowd?.periodS, base.crowd.periodS, 3, 60),
      handsUpEmote: partial.crowd?.handsUpEmote?.trim() || base.crowd.handsUpEmote,
      readyEmote: partial.crowd?.readyEmote?.trim() || base.crowd.readyEmote,
      peerEmote: partial.crowd?.peerEmote?.trim() || base.crowd.peerEmote,
      stepInEmote: partial.crowd?.stepInEmote?.trim() || base.crowd.stepInEmote,
      aggressive: partial.crowd?.aggressive ?? base.crowd.aggressive,
    },
    reactions: normalizeBreakdanceReactionConfig(partial.reactions),
    failureDisplayS: num(partial.failureDisplayS, base.failureDisplayS, 1, 15),
    transitionS: num(partial.transitionS, base.transitionS, 1, 15),
    selectGraceS: num(partial.selectGraceS, base.selectGraceS, 2, 30),
    memberTimeoutS: num(partial.memberTimeoutS, base.memberTimeoutS, 5, 60),
    encounterMood: normalizeEncounterMood(partial.encounterMood),
    obstructions: Array.isArray(partial.obstructions)
      ? partial.obstructions
          .map((o) => {
            const hx = Number(o?.hx);
            const hz = Number(o?.hz);
            const x2 = Number(o?.x2);
            const z2 = Number(o?.z2);
            const floorIndex = Number(o?.floorIndex);
            return {
              x: Number(o?.x),
              z: Number(o?.z),
              r: Number(o?.r),
              ...(Number.isFinite(x2) && Number.isFinite(z2) ? { x2, z2 } : {}),
              ...(Number.isFinite(hx) && hx > 0 ? { hx } : {}),
              ...(Number.isFinite(hz) && hz > 0 ? { hz } : {}),
              ...(Number.isFinite(floorIndex) ? { floorIndex: Math.round(floorIndex) } : {}),
            };
          })
          .filter((o) => Number.isFinite(o.x) && Number.isFinite(o.z) && Number.isFinite(o.r) && o.r > 0)
      : undefined,
    music: {
      mode: partial.music?.mode === "sequence" ? "sequence" : "shuffle",
      tracks: Array.isArray(partial.music?.tracks)
        ? partial.music!.tracks!
            .map((t) => ({
              file: String(t?.file ?? "").trim(),
              title: String(t?.title ?? "").trim() || "Track",
              durationS: Number(t?.durationS),
            }))
            .filter((t) => t.file && Number.isFinite(t.durationS) && t.durationS > 1)
        : [],
      selectedTrackIds: normalizeSelectedTrackIds(partial.music?.selectedTrackIds),
    },
    musicSpread: partial.musicSpread === "floor" ? "floor" : "venue",
    clubFx: {
      enabled: partial.clubFx?.enabled ?? base.clubFx.enabled,
      beatFlash: partial.clubFx?.beatFlash ?? base.clubFx.beatFlash,
      smokeStrength: num(partial.clubFx?.smokeStrength, base.clubFx.smokeStrength, 0, 2),
      smokeAngleDeg: num(partial.clubFx?.smokeAngleDeg, base.clubFx.smokeAngleDeg, -180, 180),
      lightHeight: num(partial.clubFx?.lightHeight, base.clubFx.lightHeight, 3, 20),
    },
    crowdNavigation: normalizeCrowdNavigationConfig(partial.crowdNavigation),
    choreography: normalizeDanceChoreographyConfig(partial.choreography, base.choreography, num),
  };
}

function normalizeColor(
  c: unknown
): { r: number; g: number; b: number } | undefined {
  if (!c || typeof c !== "object") return undefined;
  const o = c as { r?: unknown; g?: unknown; b?: unknown };
  const ch = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
  };
  const r = ch(o.r), g = ch(o.g), b = ch(o.b);
  return r === null || g === null || b === null ? undefined : { r, g, b };
}

function normalizeDanceOutfit(o: unknown): DanceOutfit | null {
  if (!o || typeof o !== "object") return null;
  const src = o as Partial<DanceOutfit>;
  const wearables = Array.isArray(src.wearables)
    ? src.wearables.map((w) => String(w).trim()).filter(Boolean)
    : [];
  if (!wearables.length) return null;
  const bodyShape =
    typeof src.bodyShape === "string" && src.bodyShape.trim()
      ? src.bodyShape.trim()
      : "urn:decentraland:off-chain:base-avatars:BaseMale";
  return {
    bodyShape,
    wearables,
    hairColor: normalizeColor(src.hairColor),
    skinColor: normalizeColor(src.skinColor),
    eyeColor: normalizeColor(src.eyeColor),
  };
}

function isLegacyPrototypeMoves(moves: string[]): boolean {
  if (!moves.length || moves.length > 3) return false;
  return moves.every((move) => {
    const id = move.toLowerCase();
    return id === "handsair" || id === "clap" || id === "robot";
  });
}

function normalizeDanceChoreographyConfig(
  partial: Partial<DanceChoreographyConfig> | null | undefined,
  base: DanceChoreographyConfig,
  num: (v: unknown, fallback: number, min: number, max: number) => number
): DanceChoreographyConfig {
  const requestedId =
    typeof partial?.activeRoutineId === "string" ? partial.activeRoutineId.trim() : "";
  const activeRoutineId = choreographyRoutineById(requestedId)?.id
    ?? (requestedId ? DEFAULT_CHOREOGRAPHY_ROUTINE_ID : base.activeRoutineId || DEFAULT_CHOREOGRAPHY_ROUTINE_ID);
  const rawMoves = sanitizeEmoteList(partial?.moves, []);
  const overlayMoves = rawMoves.length && !isLegacyPrototypeMoves(rawMoves) ? rawMoves : undefined;
  const resolved = resolveChoreographyRoutine(
    {
      activeRoutineId,
      formation: partial?.formation,
      performerCount: partial?.performerCount,
      leadCount: partial?.leadCount,
      backupCount: partial?.backupCount,
      moves: overlayMoves,
      backupMoves: Array.isArray(partial?.backupMoves) ? sanitizeEmoteList(partial.backupMoves, []) : undefined,
      idleMoves: Array.isArray(partial?.idleMoves) ? sanitizeEmoteList(partial.idleMoves, []) : undefined,
      moveDurationMs: partial?.moveDurationMs,
      loop: partial?.loop,
      formationSpacing: partial?.formationSpacing,
      audienceYawDeg: partial?.audienceYawDeg,
    },
    activeRoutineId
  );
  return {
    activeRoutineId: resolved.id,
    formation: resolved.formation,
    performerCount: Math.round(num(resolved.performerCount, resolved.performerCount, 1, 24)),
    leadCount: Math.round(num(resolved.leadCount, resolved.leadCount, 0, 24)),
    backupCount: Math.round(num(resolved.backupCount, resolved.backupCount, 0, 24)),
    moves: [...resolved.tracks.lead],
    backupMoves: [...resolved.tracks.backup],
    idleMoves: [...resolved.tracks.idle],
    moveDurationMs: Math.round(num(resolved.moveDurationMs, resolved.moveDurationMs, 800, 30000)),
    loop: resolved.loop,
    formationSpacing: num(resolved.formationSpacing, resolved.formationSpacing, 0.5, 3),
    audienceYawDeg: num(resolved.audienceYawDeg, resolved.audienceYawDeg, -180, 180),
  };
}

function sanitizeEmoteList(list: unknown, fallback: string[]): string[] {
  if (!Array.isArray(list)) return [...fallback];
  const clean = list
    .filter((e): e is string => typeof e === "string")
    .map((e) => e.trim())
    .filter(Boolean);
  return clean.length ? clean : [...fallback];
}

export interface DanceVenueValidationIssue {
  level: "error" | "warn";
  code: string;
  message: string;
}

export function validateDanceVenueConfig(
  config: DanceVenueConfig | null | undefined,
  zoneComponentIds?: Set<string> | string[]
): DanceVenueValidationIssue[] {
  if (!config?.enabled) return [];
  const issues: DanceVenueValidationIssue[] = [];
  const zoneIds = zoneComponentIds
    ? zoneComponentIds instanceof Set
      ? zoneComponentIds
      : new Set(zoneComponentIds)
    : null;

  /**
   * A WIRED APP MINTS ITS OWN CIRCLES — a missing zone is work to do, not a blocker.
   *
   * `placement` (floor index, centre, two radii) IS the dance set; the three floor_zone
   * components are only its editable form, and `syncDanceSetZones` re-creates whichever
   * of them the plot is missing on every compose while the app is on. Reporting them
   * here anyway printed three red lines naming ids the owner cannot pick from any menu
   * ("Dance floor zone \"skyline_activity_zone\" not found"), under whichever app view
   * happened to be open, for a repair that already runs by itself. The owner's rule:
   * if the app is wired, populate it; if they don't want the circles, they leave the
   * app off.
   *
   * Only a LEGACY, placement-less config has nothing to rebuild from — that one still
   * blocks, because there its zone bindings were the only record of the layout.
   */
  const selfHealing = Boolean(config.placement);
  if (selfHealing) return issues;

  if (!config.danceFloorZoneId) {
    issues.push({
      level: "error",
      code: "dance.missing_floor_zone",
      message: "Dance venue requires a dance floor zone",
    });
  }
  if (!config.supportZoneId) {
    issues.push({
      level: "error",
      code: "dance.missing_support_zone",
      message: "Dance venue requires a support circle zone",
    });
  }
  if (config.clubFx.enabled && !config.clubFxZoneId) {
    issues.push({
      level: "error",
      code: "dance.missing_fx_zone",
      message: "Club lights and smoke require a zone",
    });
  }
  if (
    config.danceFloorZoneId &&
    config.supportZoneId &&
    config.danceFloorZoneId === config.supportZoneId
  ) {
    issues.push({
      level: "error",
      code: "dance.same_zone",
      message: "Dance floor and support circle must be different zones",
    });
  }
  if (zoneIds) {
    for (const [id, label] of [
      [config.danceFloorZoneId, "Dance floor"],
      [config.supportZoneId, "Support circle"],
      [config.clubFx.enabled ? config.clubFxZoneId : null, "Lighting and smoke"],
    ] as const) {
      if (id && !zoneIds.has(id)) {
        issues.push({
          level: "error",
          code: "dance.unknown_zone",
          message: `${label} zone "${id}" not found`,
        });
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Scene.json handshake block (read by the Dance Bug smart wearable)
// ---------------------------------------------------------------------------

export const DANCE_VENUE_SCENE_JSON_KEY = "danceVenue" as const;

export interface DanceVenueSceneJsonBlock {
  version: 1;
  capabilities: string[];
  instanceId: string;
  /** Optional manifest of scene-hosted emotes (emotes/manifest.json). */
  emoteLibraryUrl: string | null;
}

export function buildDanceVenueSceneJsonBlock(instanceId: string): DanceVenueSceneJsonBlock {
  return {
    version: 1,
    capabilities: ["queue", "scoring", "sceneEmotes", "movePlayer"],
    instanceId,
    emoteLibraryUrl: null,
  };
}

// ---------------------------------------------------------------------------
// Runtime state machine (pure — coordinator runs it, snapshots broadcast it)
// ---------------------------------------------------------------------------

export type DancePhase =
  | "empty" // no dancer, NPC performs, queue may fill
  | "selected" // dancer chosen, being moved onto the floor
  | "countdown" // 3-2-1-GO
  | "active" // performance monitored
  | "failure" // result shown, crowd reacts
  | "transition"; // floor resets, next dancer selected

export type DanceFailReason =
  | "idle"
  | "repeat"
  | "variety"
  | "left_floor"
  | "left"
  | "time_up"
  | "wait_move";

export interface DanceTurnResult {
  userId: string;
  name: string | null;
  survivalS: number;
  moves: number;
  unique: number;
  score: number;
  bestCombo: number;
  discoveries: number;
  reason: DanceFailReason;
}

export type DanceDiscoveryKind = "move" | "sequence";

export interface DanceModel {
  phase: DancePhase;
  /** Monotonic revision — clients accept snapshots with higher rev. */
  rev: number;
  /** Breakdance mode on/off — the show only runs while true. */
  activated: boolean;
  /** Host crowd-activity mode (social / show / free_roam / choreography / paused). */
  activityMode: VenueActivityMode;
  /** Mode to resume after pause. */
  resumeMode: ResumableActivityMode;
  /** Epoch-ms when activityMode last changed (coordinator wall clock). */
  activityChangedAt: number;
  /** Epoch-ms when the current choreography routine started (0 = none). */
  choreographyStartedAt: number;
  /** Catalogue id the floor is performing. Empty = published default. */
  choreographyRoutineId: string;
  /** Live Host overlay for the whole hangout crowd. Empty = published groups. */
  crowdFormation: CrowdHostFormation | "";
  crowdMood: CrowdHostMood | "";
  crowdSync: CrowdHostSync | "";
  crowdControlAt: number;
  /** Alternation memory: was the previous dancer an NPC? */
  lastDancerWasNpc: boolean;
  /**
   * NPC turns since the last human. Starts at the filler cap so a joining
   * human cuts in immediately instead of waiting out an NPC-only rotation.
   */
  npcTurnsSinceHuman: number;
  /** Total turns started — drives deterministic NPC scripting + round-robin. */
  turnCounter: number;
  /** Support-circle members (userId → last heartbeat ms). Queue order lives in `queue`. */
  members: Record<string, number>;
  /** Display names (userId → name) for HUD/results. */
  names: Record<string, string>;
  /** HUMAN queue only — NPC turns are synthesized at selection time. */
  queue: string[];
  dancer: string | null;
  /** Epoch-ms deadline of the current timed phase. */
  phaseEndsAt: number;
  // -- active-turn tracking --
  startedAt: number;
  lastEmoteAt: number;
  lastEmoteUrn: string | null;
  repeatCount: number;
  uniqueUrns: string[];
  moveCount: number;
  /** Competitive score for this turn: variety, clean sequences, complexity and discoveries. */
  score: number;
  /** Consecutive non-repeated moves. Repeating breaks the combo before the hard repeat rule ejects. */
  combo: number;
  bestCombo: number;
  /** Four-move window used to recognize an original sequence within this runtime session. */
  recentUrns: string[];
  /** Session catalogue. Unlike turn variety, these survive the 30 s refresh and dancer rotation. */
  discoveredUrns: string[];
  discoveredSequences: string[];
  discoveryCount: number;
  /** Recognition attached to the most recent scored move; null on an ordinary move. */
  lastDiscovery: DanceDiscoveryKind | null;
  stage: number;
  varietyDeadline: number | null;
  /** Refresh milestones already granted this turn (survival / refreshIntervalS). */
  refreshCount: number;
  /** Epoch-ms of the last refresh — drives the "MOVES REFRESHED" celebration. */
  lastRefreshAt: number;
  lastResult: DanceTurnResult | null;
}

export function initialDanceModel(activated = true): DanceModel {
  const mode = activityModeFromLegacyActivated(activated);
  return {
    phase: "empty",
    rev: 0,
    activated,
    activityMode: mode,
    resumeMode: mode,
    activityChangedAt: 0,
    choreographyStartedAt: 0,
    choreographyRoutineId: "",
    crowdFormation: "",
    crowdMood: "",
    crowdSync: "",
    crowdControlAt: 0,
    // Seeded true so the FIRST pick with humans present always goes to a human
    // ("as soon as there is one real player, they're immediately put up").
    lastDancerWasNpc: true,
    npcTurnsSinceHuman: NPC_FILLERS_BETWEEN_HUMANS,
    turnCounter: 0,
    members: {},
    names: {},
    queue: [],
    dancer: null,
    phaseEndsAt: 0,
    startedAt: 0,
    lastEmoteAt: 0,
    lastEmoteUrn: null,
    repeatCount: 0,
    uniqueUrns: [],
    moveCount: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    recentUrns: [],
    discoveredUrns: [],
    discoveredSequences: [],
    discoveryCount: 0,
    lastDiscovery: null,
    stage: 1,
    varietyDeadline: null,
    refreshCount: 0,
    lastRefreshAt: 0,
    lastResult: null,
  };
}

export type DanceReducerEvent =
  | { kind: "tick"; now: number }
  | { kind: "join"; userId: string; name?: string; now: number }
  | { kind: "leave"; userId: string; now: number }
  | { kind: "emote"; userId: string; urn: string; now: number }
  | { kind: "floorExit"; userId: string; now: number }
  | { kind: "setActive"; on: boolean; now: number }
  | { kind: "setActivity"; mode: VenueActivityMode; now: number }
  | { kind: "setChoreography"; routineId: string; now: number }
  | {
      kind: "setCrowd";
      formation?: CrowdHostFormation | "";
      mood?: CrowdHostMood | "";
      sync?: CrowdHostSync | "";
      now: number;
    };

/** The longest bundled breakdance emote runs ~8 s. The idle gap must NEVER drop
 *  below this or a dancer is ejected mid-move through no fault of their own — the
 *  exact bug the owner hit. This is the hard floor for the difficulty ramp. */
export const LONGEST_MOVE_S = 8.5;

/** Effective idle gap shrinks with stage but never below one long move. */
export function effectiveIdleGapS(config: DanceVenueConfig, stage: number): number {
  const gap = config.maxIdleGapS * Math.pow(0.85, Math.max(0, stage - 1));
  return Math.max(LONGEST_MOVE_S, gap);
}

export function stageForElapsed(config: DanceVenueConfig, elapsedS: number): number {
  return 1 + Math.floor(Math.max(0, elapsedS) / config.stageIntervalS);
}

/** Live danger read for the ACTIVE dancer — one source of truth for the HUD and
 *  the in-world floor light, so "green = good, red = about to fail" is coherent
 *  everywhere and every spectator can see how the dancer is doing. */
export interface DancerStatus {
  /** 'safe' green · 'warn' amber · 'danger' red-flash */
  level: "safe" | "warn" | "danger";
  /** Seconds until the idle-gap ejection (0 = out now). */
  idleLeftS: number;
  /** Fraction 0..1 of the idle window remaining (for a bar/ring). */
  idleFrac: number;
  /** One more of the same move = out. */
  repeatDanger: boolean;
  /** Just hit a refresh milestone (celebrate for ~2 s). */
  refreshing: boolean;
}

export function dancerStatus(
  snap: DanceStateSnapshot,
  config: DanceVenueConfig,
  now: number
): DancerStatus {
  const gap = effectiveIdleGapS(config, snap.stage);
  const sinceEmote = (now - snap.lastEmoteAt) / 1000;
  const idleLeftS = Math.max(0, gap - sinceEmote);
  const idleFrac = Math.max(0, Math.min(1, idleLeftS / gap));
  const repeatDanger = snap.repeatCount >= config.maxRepeatCount - 1;
  const refreshing = snap.lastRefreshAt > 0 && now - snap.lastRefreshAt < 2000;
  let level: DancerStatus["level"] = "safe";
  if (idleFrac < 0.25 || repeatDanger) level = "danger";
  else if (idleFrac < 0.5) level = "warn";
  return { level, idleLeftS, idleFrac, repeatDanger, refreshing };
}

function bump(model: DanceModel): DanceModel {
  return { ...model, rev: model.rev + 1 };
}

function suspendCompetitiveTurn(model: DanceModel): DanceModel {
  if (model.phase === "empty" && !model.dancer) return model;
  return {
    ...model,
    phase: "empty",
    dancer: null,
    phaseEndsAt: 0,
  };
}

function applyActivityMode(model: DanceModel, mode: VenueActivityMode, now: number): DanceModel {
  if (mode === model.activityMode) return model;
  let next: DanceModel = {
    ...model,
    activityMode: mode,
    activityChangedAt: now,
  };
  if (mode === "paused") {
    if (model.activityMode !== "paused") {
      next.resumeMode = model.activityMode as ResumableActivityMode;
    }
    next.activated = isCompetitiveShowMode(next.resumeMode);
    next = suspendCompetitiveTurn(next);
    return bump(next);
  }

  next.resumeMode = mode as ResumableActivityMode;
  next.activated = mode === "show";
  const resumingFromPause = model.activityMode === "paused" && mode === model.resumeMode;
  if (mode === "choreography") {
    if (!resumingFromPause) next.choreographyStartedAt = now;
    next = suspendCompetitiveTurn(next);
  } else {
    next.choreographyStartedAt = 0;
    if (mode !== "show") next = suspendCompetitiveTurn(next);
  }
  return bump(next);
}

function applyChoreography(model: DanceModel, routineId: string, now: number): DanceModel {
  const id = routineId.trim();
  const known = choreographyRoutineById(id)?.id ?? DEFAULT_CHOREOGRAPHY_ROUTINE_ID;
  if (model.activityMode !== "choreography") {
    const next = applyActivityMode(
      { ...model, choreographyRoutineId: known },
      "choreography",
      now
    );
    return { ...next, choreographyRoutineId: known };
  }
  return bump({
    ...model,
    choreographyRoutineId: known,
    choreographyStartedAt: now,
  });
}

function applyCrowdControl(
  model: DanceModel,
  event: Extract<DanceReducerEvent, { kind: "setCrowd" }>
): DanceModel {
  const next: DanceModel = {
    ...model,
    crowdControlAt: event.now,
  };
  if (event.formation !== undefined) {
    next.crowdFormation = event.formation === "" || isCrowdHostFormation(event.formation) ? event.formation : model.crowdFormation;
  }
  if (event.mood !== undefined) {
    next.crowdMood = event.mood === "" || isCrowdHostMood(event.mood) ? event.mood : model.crowdMood;
  }
  if (event.sync !== undefined) {
    next.crowdSync = event.sync === "" || isCrowdHostSync(event.sync) ? event.sync : model.crowdSync;
  }
  return bump(next);
}


function pruneMembers(model: DanceModel, config: DanceVenueConfig, now: number): DanceModel {
  const cutoff = now - config.memberTimeoutS * 1000;
  let changed = false;
  const members: Record<string, number> = {};
  for (const [id, seen] of Object.entries(model.members)) {
    if (seen >= cutoff) members[id] = seen;
    else changed = true;
  }
  if (!changed) return model;
  const queue = model.queue.filter((id) => members[id] !== undefined);
  return { ...model, members, queue };
}

/**
 * Pick the next dancer.
 *  - 0 humans queued → NPC ring rotation (atmosphere)
 *  - human waiting   → they cut in unless we still owe 1–2 NPC fillers after
 *    their own last turn. Joining mid NPC-only rotation always goes next.
 * NPC performers come from the support ring, never outskirts roamers.
 */
function selectNext(model: DanceModel, config: DanceVenueConfig, now: number): DanceModel {
  if (!model.activated || !isCompetitiveShowMode(model.activityMode)) {
    return { ...model, phase: "empty", dancer: null, phaseEndsAt: 0 };
  }
  const humans = model.queue;
  const npcOk = config.npc.enabled && config.npc.count > 0;
  const fillersLeft = model.npcTurnsSinceHuman < NPC_FILLERS_BETWEEN_HUMANS;
  // One waiting human: up to 2 NPC fillers after their turn. Two+ humans: no filler.
  const useNpc = npcOk && (humans.length === 0 || (humans.length === 1 && fillersLeft));

  if (useNpc) {
    const idx = npcPerformerIndex(config, model.turnCounter);
    return {
      ...model,
      phase: "selected",
      dancer: npcUserId(idx),
      lastDancerWasNpc: true,
      npcTurnsSinceHuman: model.npcTurnsSinceHuman + 1,
      turnCounter: model.turnCounter + 1,
      phaseEndsAt: now + config.selectGraceS * 1000,
    };
  }
  const [next, ...rest] = humans;
  if (!next) {
    return { ...model, phase: "empty", dancer: null, phaseEndsAt: 0 };
  }
  return {
    ...model,
    phase: "selected",
    dancer: next,
    queue: rest,
    lastDancerWasNpc: false,
    npcTurnsSinceHuman: 0,
    turnCounter: model.turnCounter + 1,
    phaseEndsAt: now + config.selectGraceS * 1000,
  };
}

function startTurnTracking(model: DanceModel, now: number): DanceModel {
  return {
    ...model,
    phase: "active",
    startedAt: now,
    lastEmoteAt: now, // first-emote grace = one idle gap after GO
    lastEmoteUrn: null,
    repeatCount: 0,
    uniqueUrns: [],
    moveCount: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    recentUrns: [],
    discoveryCount: 0,
    lastDiscovery: null,
    stage: 1,
    varietyDeadline: null,
    refreshCount: 0,
    lastRefreshAt: 0,
    phaseEndsAt: 0,
  };
}

function failTurn(
  model: DanceModel,
  config: DanceVenueConfig,
  now: number,
  reason: DanceFailReason
): DanceModel {
  const dancer = model.dancer;
  const result: DanceTurnResult | null = dancer
    ? {
        userId: dancer,
        name: model.names[dancer] ?? null,
        survivalS:
          model.phase === "active" ? Math.max(0, (now - model.startedAt) / 1000) : 0,
        moves: model.moveCount,
        unique: model.uniqueUrns.length,
        score: model.score,
        bestCombo: model.bestCombo,
        discoveries: model.discoveryCount,
        reason,
      }
    : null;
  return {
    ...model,
    phase: "failure",
    lastResult: result ?? model.lastResult,
    phaseEndsAt: now + config.failureDisplayS * 1000,
  };
}

/**
 * The dance loop reducer. Coordinator feeds every event through here; identical
 * input always yields identical output (no Date.now / randomness inside).
 */
export function danceReducer(
  model: DanceModel,
  event: DanceReducerEvent,
  config: DanceVenueConfig
): DanceModel {
  switch (event.kind) {
    case "setActive": {
      return applyActivityMode(model, event.on ? "show" : "social", event.now);
    }

    case "setActivity": {
      return applyActivityMode(model, event.mode, event.now);
    }

    case "setChoreography": {
      return applyChoreography(model, event.routineId, event.now);
    }

    case "setCrowd": {
      return applyCrowdControl(model, event);
    }

    case "join": {
      const next: DanceModel = {
        ...model,
        members: { ...model.members, [event.userId]: event.now },
        names: event.name ? { ...model.names, [event.userId]: event.name } : model.names,
      };
      const alreadyQueued = next.queue.includes(event.userId);
      const isDancer = next.dancer === event.userId;
      if (!alreadyQueued && !isDancer) {
        next.queue = [...next.queue, event.userId];
      }
      // A heartbeat alone isn't a state change worth broadcasting; a queue change is.
      if (!alreadyQueued && !isDancer) return bump(next);
      return { ...next, rev: model.rev };
    }

    case "leave": {
      const members = { ...model.members };
      delete members[event.userId];
      const queue = model.queue.filter((id) => id !== event.userId);
      let next: DanceModel = { ...model, members, queue };
      if (
        model.dancer === event.userId &&
        (model.phase === "selected" || model.phase === "countdown" || model.phase === "active")
      ) {
        next = failTurn(next, config, event.now, "left");
      }
      return bump(next);
    }

    case "emote": {
      if (model.phase !== "active" || event.userId !== model.dancer) return model;
      // Outer-circle wait bounce does NOT count as dancing on the floor.
      if (isWaitEmoteUrn(event.urn, config)) {
        return bump(failTurn(model, config, event.now, "wait_move"));
      }
      const repeat = event.urn === model.lastEmoteUrn ? model.repeatCount + 1 : 1;
      const unique = model.uniqueUrns.includes(event.urn)
        ? model.uniqueUrns
        : [...model.uniqueUrns, event.urn];
      const repeated = event.urn === model.lastEmoteUrn;
      const combo = repeated ? 0 : model.combo + 1;
      const recentUrns = repeated
        ? [event.urn]
        : [...model.recentUrns, event.urn].slice(-4);
      const moveDiscovery = !model.discoveredUrns.includes(event.urn);
      const sequenceSignature =
        recentUrns.length === 4 && new Set(recentUrns).size === 4
          ? recentUrns.join(" -> ")
          : null;
      const sequenceDiscovery =
        sequenceSignature !== null && !model.discoveredSequences.includes(sequenceSignature);
      const lastDiscovery: DanceDiscoveryKind | null = sequenceDiscovery
        ? "sequence"
        : moveDiscovery
          ? "move"
          : null;
      const complexityBonus = /headspin|windmill|1990|freeze|airflare|power/i.test(event.urn)
        ? 100
        : 0;
      const varietyBonus = unique !== model.uniqueUrns ? 75 : 0;
      const comboBonus = repeated ? 0 : Math.min(250, combo * 25);
      const discoveryBonus = sequenceDiscovery ? 500 : moveDiscovery ? 200 : 0;
      // A repeated move still earns a token 10 points until the hard repeat limit,
      // but it can never outperform a clean transition or discovery.
      const moveScore = repeated
        ? 10
        : 100 + varietyBonus + comboBonus + complexityBonus + discoveryBonus;
      let next: DanceModel = {
        ...model,
        lastEmoteAt: event.now,
        lastEmoteUrn: event.urn,
        repeatCount: repeat,
        uniqueUrns: unique,
        moveCount: model.moveCount + 1,
        score: model.score + moveScore,
        combo,
        bestCombo: Math.max(model.bestCombo, combo),
        recentUrns,
        discoveredUrns: moveDiscovery
          ? [...model.discoveredUrns, event.urn]
          : model.discoveredUrns,
        discoveredSequences:
          sequenceDiscovery && sequenceSignature
            ? [...model.discoveredSequences, sequenceSignature].slice(-128)
            : model.discoveredSequences,
        discoveryCount: model.discoveryCount + (lastDiscovery ? 1 : 0),
        lastDiscovery,
      };
      if (repeat >= config.maxRepeatCount) {
        next = failTurn(next, config, event.now, "repeat");
      } else if (next.varietyDeadline !== null && unique.length >= config.minUniqueEmotes) {
        next = { ...next, varietyDeadline: null };
      }
      return bump(next);
    }

    case "floorExit": {
      if (model.phase !== "active" || event.userId !== model.dancer) return model;
      return bump(failTurn(model, config, event.now, "left_floor"));
    }

    case "tick": {
      const now = event.now;
      let next = pruneMembers(model, config, now);
      const pruned = next !== model;

      // Dancer vanished entirely (disconnect) — heartbeats stopped. NPCs never
      // heartbeat and never vanish; the check is human-only.
      if (
        next.dancer &&
        !isNpcUserId(next.dancer) &&
        (next.phase === "selected" || next.phase === "countdown" || next.phase === "active") &&
        next.members[next.dancer] === undefined
      ) {
        return bump(failTurn(next, config, now, "left"));
      }

      switch (next.phase) {
        case "empty": {
          if (next.activated) {
            const selected = selectNext(next, config, now);
            if (selected.phase !== "empty") return bump(selected);
          }
          return pruned ? bump(next) : model;
        }
        case "selected": {
          if (now >= next.phaseEndsAt) {
            return bump({
              ...next,
              phase: "countdown",
              phaseEndsAt: now + config.countdownSeconds * 1000,
            });
          }
          return pruned ? bump(next) : model;
        }
        case "countdown": {
          if (now >= next.phaseEndsAt) {
            return bump(startTurnTracking(next, now));
          }
          return pruned ? bump(next) : model;
        }
        case "active": {
          const elapsedS = (now - next.startedAt) / 1000;
          const stage = stageForElapsed(config, elapsedS);
          let changed = pruned;

          // REFRESH milestone: every refreshIntervalS survived, wipe the repeat +
          // variety history so the dancer can reuse their whole move set and keep
          // going. This is the "go long as a skill" mechanic — endurance + rhythm
          // instead of a dead end once you run out of distinct moves.
          const earned = Math.floor(elapsedS / config.refreshIntervalS);
          if (earned > next.refreshCount) {
            next = {
              ...next,
              refreshCount: earned,
              lastRefreshAt: now,
              repeatCount: 0,
              uniqueUrns: [],
              lastEmoteUrn: null,
              varietyDeadline: null,
            };
            changed = true;
          }

          if (stage !== next.stage) {
            next = { ...next, stage };
            changed = true;
            // Entering stage 2+ arms the variety requirement once.
            if (
              stage >= 2 &&
              next.varietyDeadline === null &&
              next.uniqueUrns.length < config.minUniqueEmotes
            ) {
              next = { ...next, varietyDeadline: now + config.varietyGraceS * 1000 };
            }
          }

          if (config.maxTurnS !== null && elapsedS >= config.maxTurnS) {
            return bump(failTurn(next, config, now, "time_up"));
          }
          const idleGapMs = effectiveIdleGapS(config, next.stage) * 1000;
          if (now - next.lastEmoteAt > idleGapMs) {
            return bump(failTurn(next, config, now, "idle"));
          }
          if (
            next.varietyDeadline !== null &&
            now >= next.varietyDeadline &&
            next.uniqueUrns.length < config.minUniqueEmotes
          ) {
            return bump(failTurn(next, config, now, "variety"));
          }
          return changed ? bump(next) : model;
        }
        case "failure": {
          if (now >= next.phaseEndsAt) {
            // Ex-dancer rejoins the back of the queue only if still present.
            // NPC turns are synthesized at selection — bots never enter the queue.
            let queue = next.queue;
            const ex = next.dancer;
            if (ex && !isNpcUserId(ex) && next.members[ex] !== undefined && !queue.includes(ex)) {
              queue = [...queue, ex];
            }
            return bump({
              ...next,
              phase: "transition",
              dancer: null,
              queue,
              phaseEndsAt: now + config.transitionS * 1000,
            });
          }
          return pruned ? bump(next) : model;
        }
        case "transition": {
          if (now >= next.phaseEndsAt) {
            const selected = selectNext(next, config, now);
            // Selecting nobody is still a phase change (transition → empty).
            return bump(selected);
          }
          return pruned ? bump(next) : model;
        }
      }
      return model;
    }
  }
}

// ---------------------------------------------------------------------------
// Snapshot + bus messages (coordinator ↔ clients over MessageBus)
// ---------------------------------------------------------------------------

/** What the coordinator broadcasts — the model minus the heartbeat map. */
export interface DanceStateSnapshot {
  phase: DancePhase;
  rev: number;
  activated: boolean;
  activityMode: VenueActivityMode;
  resumeMode: ResumableActivityMode;
  activityChangedAt: number;
  choreographyStartedAt: number;
  choreographyRoutineId: string;
  crowdFormation?: CrowdHostFormation | "";
  crowdMood?: CrowdHostMood | "";
  crowdSync?: CrowdHostSync | "";
  crowdControlAt?: number;
  coordinatorId: string;
  dancer: string | null;
  dancerName: string | null;
  queue: string[];
  turnCounter: number;
  lastDancerWasNpc: boolean;
  npcTurnsSinceHuman?: number;
  phaseEndsAt: number;
  startedAt: number;
  stage: number;
  moveCount: number;
  uniqueCount: number;
  repeatCount: number;
  score: number;
  combo: number;
  bestCombo: number;
  discoveryCount: number;
  lastDiscovery: DanceDiscoveryKind | null;
  refreshCount: number;
  lastRefreshAt: number;
  lastEmoteUrn: string | null;
  lastEmoteAt: number;
  lastResult: DanceTurnResult | null;
}

export function danceDisplayName(
  config: DanceVenueConfig,
  userId: string | null,
  humanName: string | null
): string | null {
  if (!userId) return null;
  if (isNpcUserId(userId)) return npcDisplayName(config, npcIndexFromUserId(userId));
  return humanName;
}

export function snapshotFromModel(
  model: DanceModel,
  coordinatorId: string,
  config?: DanceVenueConfig
): DanceStateSnapshot {
  const humanName = model.dancer ? model.names[model.dancer] ?? null : null;
  return {
    phase: model.phase,
    rev: model.rev,
    activated: model.activated,
    activityMode: model.activityMode,
    resumeMode: model.resumeMode,
    activityChangedAt: model.activityChangedAt,
    choreographyStartedAt: model.choreographyStartedAt,
    choreographyRoutineId: model.choreographyRoutineId,
    crowdFormation: model.crowdFormation,
    crowdMood: model.crowdMood,
    crowdSync: model.crowdSync,
    crowdControlAt: model.crowdControlAt,
    coordinatorId,
    dancer: model.dancer,
    dancerName: config ? danceDisplayName(config, model.dancer, humanName) : humanName,
    queue: [...model.queue],
    turnCounter: model.turnCounter,
    lastDancerWasNpc: model.lastDancerWasNpc,
    npcTurnsSinceHuman: model.npcTurnsSinceHuman,
    phaseEndsAt: model.phaseEndsAt,
    startedAt: model.startedAt,
    stage: model.stage,
    moveCount: model.moveCount,
    uniqueCount: model.uniqueUrns.length,
    repeatCount: model.repeatCount,
    score: model.score,
    combo: model.combo,
    bestCombo: model.bestCombo,
    discoveryCount: model.discoveryCount,
    lastDiscovery: model.lastDiscovery,
    refreshCount: model.refreshCount,
    lastRefreshAt: model.lastRefreshAt,
    lastEmoteUrn: model.lastEmoteUrn,
    lastEmoteAt: model.lastEmoteAt,
    lastResult: model.lastResult,
  };
}

/**
 * Rebuild a workable model from a received snapshot — used when the coordinator
 * leaves and the next client takes over. Heartbeats restart empty and refill
 * within one heartbeat period; uniqueUrns are lost beyond the count (accepted:
 * takeover mid-turn keeps the count for HUD but restarts variety tracking).
 */
export function modelFromSnapshot(snap: DanceStateSnapshot, now: number): DanceModel {
  const activated = snap.activated;
  const activityMode = snap.activityMode ?? activityModeFromLegacyActivated(activated);
  const resumeMode = snap.resumeMode ?? activityModeFromLegacyActivated(activated);
  const model = initialDanceModel(activated);
  return {
    ...model,
    phase: snap.phase,
    rev: snap.rev,
    activated,
    activityMode,
    resumeMode,
    activityChangedAt: snap.activityChangedAt ?? 0,
    choreographyStartedAt: snap.choreographyStartedAt ?? 0,
    choreographyRoutineId: snap.choreographyRoutineId ?? "",
    crowdFormation: isCrowdHostFormation(snap.crowdFormation) ? snap.crowdFormation : "",
    crowdMood: isCrowdHostMood(snap.crowdMood) ? snap.crowdMood : "",
    crowdSync: isCrowdHostSync(snap.crowdSync) ? snap.crowdSync : "",
    crowdControlAt: Number(snap.crowdControlAt) || 0,
    turnCounter: snap.turnCounter,
    lastDancerWasNpc: snap.lastDancerWasNpc,
    npcTurnsSinceHuman:
      snap.npcTurnsSinceHuman ??
      (snap.lastDancerWasNpc ? NPC_FILLERS_BETWEEN_HUMANS : 0),
    queue: [...snap.queue],
    dancer: snap.dancer,
    names:
      snap.dancer && !isNpcUserId(snap.dancer) && snap.dancerName
        ? { [snap.dancer]: snap.dancerName }
        : {},
    phaseEndsAt: snap.phaseEndsAt,
    startedAt: snap.startedAt,
    stage: snap.stage,
    moveCount: snap.moveCount,
    repeatCount: snap.repeatCount,
    score: snap.score ?? 0,
    combo: snap.combo ?? 0,
    bestCombo: snap.bestCombo ?? 0,
    discoveryCount: snap.discoveryCount ?? 0,
    lastDiscovery:
      snap.lastDiscovery === "move" || snap.lastDiscovery === "sequence"
        ? snap.lastDiscovery
        : null,
    refreshCount: snap.refreshCount,
    lastRefreshAt: snap.lastRefreshAt,
    lastEmoteUrn: snap.lastEmoteUrn,
    lastEmoteAt: snap.lastEmoteAt || now,
    uniqueUrns: [], // count preserved via snapshot for HUD; tracking restarts
    lastResult: snap.lastResult,
    // Seed a human dancer as freshly seen so a takeover doesn't instantly fail them.
    members: snap.dancer && !isNpcUserId(snap.dancer) ? { [snap.dancer]: now } : {},
  };
}

/** messageBus catalog for the dance loop — separate wire from SocialBusMessage. */
export type DanceBusMessage =
  | { type: "dance.state"; snap: DanceStateSnapshot }
  | { type: "dance.join"; userId: string; name: string }
  | { type: "dance.leave"; userId: string }
  | { type: "dance.emote"; userId: string; urn: string; ts: number }
  | { type: "dance.crowdCue"; cue: CrowdReactionCue }
  | { type: "dance.floorExit"; userId: string }
  | { type: "dance.setActive"; on: boolean; byUserId: string }
  | { type: "dance.setActivity"; mode: VenueActivityMode; byUserId: string }
  | { type: "dance.setChoreography"; routineId: string; byUserId: string }
  | {
      type: "dance.setCrowd";
      formation?: CrowdHostFormation | "";
      mood?: CrowdHostMood | "";
      sync?: CrowdHostSync | "";
      byUserId: string;
    }
  | {
      type: "dance.npcCommand";
      command:
        | { kind: "walk"; index: number; x: number; y: number; z: number; holdMs: number }
        | { kind: "dismiss"; index: number };
      byUserId: string;
    }
  /** Playlist transport: seed anchors the deterministic order; step advances
   *  locally on every client from durations — only start/skip/stop broadcast. */
  | { type: "dance.music"; playing: boolean; seed: number; step: number; startedAt: number };

export const DANCE_BUS_TYPES: DanceBusMessage["type"][] = [
  "dance.state",
  "dance.join",
  "dance.leave",
  "dance.emote",
  "dance.crowdCue",
  "dance.floorExit",
  "dance.setActive",
  "dance.setActivity",
  "dance.setChoreography",
  "dance.setCrowd",
  "dance.npcCommand",
  "dance.music",
];

/** True if this emote URN/path is the outer-circle waiting bounce (not a floor move). */
export function isWaitEmoteUrn(urn: string, config: DanceVenueConfig): boolean {
  const u = urn.toLowerCase().replace(/\\/g, "/");
  const src = (config.waitEmoteSrc || "").toLowerCase().replace(/\\/g, "/");
  if (src) {
    const base = src.split("/").pop() || src;
    const stem = base.replace(/_emote\.glb$/i, "").replace(/\.glb$/i, "");
    if (u.includes(base) || (stem && u.includes(stem)) || u.includes(src)) return true;
  }
  // Any bd_ready* family member is the waiting bounce — never counts on the floor.
  return u.includes("bd_ready");
}

export function danceFailReasonLabel(reason: DanceFailReason): string {
  switch (reason) {
    case "idle":
      return "Stopped moving";
    case "repeat":
      return "Same move too many times";
    case "variety":
      return "Not enough different moves";
    case "left_floor":
      return "Left the dance floor";
    case "left":
      return "Left the party";
    case "time_up":
      return "Time! What a run";
    case "wait_move":
      return "Wait bounce is for the outer circle — dance for real!";
  }
}
