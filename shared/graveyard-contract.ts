/**
 * Graveyard — inactive name-holders as placeable graves, plus a return ritual.
 *
 * PLACEMENT is the builder's. Grounds, plots, buildings, grass, and benches live
 * on the scene spec. Drag them in the Builder. Changing them needs a republish.
 *
 * CENSUS is live. Which wallet occupies a plot, offerings, and Rise Again do not
 * move geometry. A live document must never include positions.
 */

export const GRAVEYARD_VERSION = 1 as const;
export const GRAVEYARD_ABSENCE_DAYS_DEFAULT = 90;
export const GRAVEYARD_ABSENCE_DAYS_MIN = 1;
export const GRAVEYARD_ABSENCE_DAYS_MAX = 3650;

export const GRAVE_PLOT_WIDTH_M = 1.8;
export const GRAVE_PLOT_DEPTH_M = 2.6;
export const GRAVE_PLOT_PITCH_X_M = 5.5;
export const GRAVE_PLOT_PITCH_Z_M = 6.5;
export const GRAVEYARD_GROUNDS_DEFAULT_W_M = 40;
export const GRAVEYARD_GROUNDS_DEFAULT_D_M = 44;

export const GRAVEYARD_GROUNDS_SMART_ID = "graveyard_grounds_main";

export const GRAVE_MARKER_TYPES = ["slab", "obelisk", "mound"] as const;
export type GraveMarkerType = (typeof GRAVE_MARKER_TYPES)[number];

export const GRAVE_PLOT_STATUSES = [
  "empty",
  "resting",
  "stirring",
  "returned",
  "sealed",
] as const;
export type GravePlotStatus = (typeof GRAVE_PLOT_STATUSES)[number];

export function isGraveMarkerType(value: unknown): value is GraveMarkerType {
  return typeof value === "string" && (GRAVE_MARKER_TYPES as readonly string[]).includes(value);
}

export function isGravePlotStatus(value: unknown): value is GravePlotStatus {
  return typeof value === "string" && (GRAVE_PLOT_STATUSES as readonly string[]).includes(value);
}

export interface GraveRestRecord {
  departedAt: string;
  returnedAt: string | null;
  daysAway: number;
  ritualAt: string | null;
}

export interface GraveOccupant {
  wallet: string;
  name: string;
  faceUrl: string | null;
  hasClaimedName: boolean;
  firstSeen: string;
  lastSeen: string;
  status: GravePlotStatus;
  rests: GraveRestRecord[];
}

export interface GraveyardAppConfig {
  enabled: boolean;
  absenceDays: number;
  seedDemo: boolean;
  censusBaseUrl: string;
}

export function defaultGraveyardAppConfig(): GraveyardAppConfig {
  return {
    enabled: false,
    absenceDays: GRAVEYARD_ABSENCE_DAYS_DEFAULT,
    seedDemo: false,
    censusBaseUrl: "",
  };
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeGraveyardAppConfig(raw: unknown): GraveyardAppConfig {
  const base = defaultGraveyardAppConfig();
  if (!raw || typeof raw !== "object") return base;
  const partial = raw as Partial<GraveyardAppConfig>;
  const url = typeof partial.censusBaseUrl === "string" ? partial.censusBaseUrl.trim() : "";
  return {
    enabled: partial.enabled === true,
    absenceDays: Math.round(
      num(partial.absenceDays, base.absenceDays, GRAVEYARD_ABSENCE_DAYS_MIN, GRAVEYARD_ABSENCE_DAYS_MAX),
    ),
    seedDemo: partial.seedDemo === true,
    censusBaseUrl: url.replace(/\/+$/, ""),
  };
}

export interface GraveGridCell {
  index: number;
  localX: number;
  localZ: number;
  markerType: GraveMarkerType;
}

export function planGraveGrid(
  cols: number,
  rows: number,
  pitchX = GRAVE_PLOT_PITCH_X_M,
  pitchZ = GRAVE_PLOT_PITCH_Z_M,
): GraveGridCell[] {
  const c = Math.max(1, Math.min(24, Math.round(cols)));
  const r = Math.max(1, Math.min(24, Math.round(rows)));
  const cells: GraveGridCell[] = [];
  const originX = -((c - 1) * pitchX) / 2;
  const originZ = -((r - 1) * pitchZ) / 2;
  let index = 0;
  for (let row = 0; row < r; row += 1) {
    for (let col = 0; col < c; col += 1) {
      const markerType: GraveMarkerType =
        row === 0 && col === Math.floor(c / 2)
          ? "obelisk"
          : (row + col) % 5 === 0
            ? "mound"
            : "slab";
      cells.push({
        index,
        localX: originX + col * pitchX,
        localZ: originZ + row * pitchZ,
        markerType,
      });
      index += 1;
    }
  }
  return cells;
}

export function groundsSizeForGrid(
  cols: number,
  rows: number,
): { width: number; depth: number } {
  const c = Math.max(1, Math.round(cols));
  const r = Math.max(1, Math.round(rows));
  return {
    width: Math.max(GRAVEYARD_GROUNDS_DEFAULT_W_M, (c - 1) * GRAVE_PLOT_PITCH_X_M + 8),
    depth: Math.max(GRAVEYARD_GROUNDS_DEFAULT_D_M, (r - 1) * GRAVE_PLOT_PITCH_Z_M + 8),
  };
}

export function nextGravePlotId(existingIds: readonly string[]): string {
  const used = new Set(existingIds);
  for (let i = 1; i < 10_000; i += 1) {
    const id = `grave_plot_${i}`;
    if (!used.has(id)) return id;
  }
  return `grave_plot_${Date.now().toString(36)}`;
}

export function assignOccupantsToPlots(
  plotIds: readonly string[],
  occupants: readonly GraveOccupant[],
  pinned: Readonly<Record<string, string>>,
): Record<string, string> {
  const assigned: Record<string, string> = {};
  const taken = new Set<string>();
  for (const [plotId, wallet] of Object.entries(pinned)) {
    const key = wallet.trim().toLowerCase();
    if (!key || !plotIds.includes(plotId)) continue;
    assigned[plotId] = key;
    taken.add(key);
  }
  const freePlots = [...plotIds].filter((id) => !assigned[id]).sort();
  const freeOccupants = occupants
    .map((row) => row.wallet.trim().toLowerCase())
    .filter((wallet) => wallet && !taken.has(wallet));
  for (let i = 0; i < freePlots.length && i < freeOccupants.length; i += 1) {
    assigned[freePlots[i]!] = freeOccupants[i]!;
  }
  return assigned;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return Math.floor((to - from) / 86_400_000);
}

export function occupantStatus(
  lastSeenIso: string,
  nowMs: number,
  absenceDays: number,
  ritualPending: boolean,
): GravePlotStatus {
  if (ritualPending) return "stirring";
  const last = Date.parse(lastSeenIso);
  if (!Number.isFinite(last)) return "empty";
  const days = Math.floor((nowMs - last) / 86_400_000);
  if (days >= absenceDays) return "resting";
  return "returned";
}

export const GRAVEYARD_SEED_OCCUPANTS: readonly GraveOccupant[] = [
  seed("0x1111111111111111111111111111111111111111", "Moss", 184),
  seed("0x2222222222222222222222222222222222222222", "Lantern", 211),
  seed("0x3333333333333333333333333333333333333333", "Bellwether", 97),
  seed("0x4444444444444444444444444444444444444444", "Pebble", 312),
  seed("0x5555555555555555555555555555555555555555", "Thorn", 140),
  seed("0x6666666666666666666666666666666666666666", "Cinder", 90),
  seed("0x7777777777777777777777777777777777777777", "Vesper", 401),
  seed("0x8888888888888888888888888888888888888888", "Bracken", 156),
  seed("0x9999999999999999999999999999999999999999", "Hollow", 73, "stirring"),
  seed("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "Marigold", 220),
  seed("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "Quill", 118),
  seed("0xcccccccccccccccccccccccccccccccccccccccc", "Nettle", 265),
];

function seed(
  wallet: string,
  name: string,
  daysAway: number,
  status: GravePlotStatus = "resting",
): GraveOccupant {
  const now = Date.parse("2026-08-27T00:00:00.000Z");
  const departed = new Date(now - daysAway * 86_400_000).toISOString();
  const first = new Date(now - (daysAway + 400) * 86_400_000).toISOString();
  return {
    wallet,
    name,
    faceUrl: null,
    hasClaimedName: true,
    firstSeen: first,
    lastSeen: departed,
    status,
    rests: [{ departedAt: departed, returnedAt: null, daysAway, ritualAt: null }],
  };
}

export function plaqueLines(occupant: GraveOccupant, nowIso: string): string[] {
  const away = daysBetween(occupant.lastSeen, nowIso);
  if (occupant.status === "returned") {
    const last = occupant.rests[occupant.rests.length - 1];
    const risen = last?.ritualAt ?? last?.returnedAt ?? nowIso;
    return [
      "RETURNED",
      occupant.name,
      `Away for ${last?.daysAway ?? away} days`,
      `Resurrected ${risen.slice(0, 10)}`,
    ];
  }
  if (occupant.status === "stirring") {
    return [occupant.name, `Away for ${away} days`, "The stone is stirring"];
  }
  if (occupant.status === "sealed") {
    return ["Sealed", "The name has left this wallet"];
  }
  return [
    occupant.name,
    `First recorded ${occupant.firstSeen.slice(0, 10)}`,
    `Last seen ${occupant.lastSeen.slice(0, 10)}`,
    `Away ${away} days`,
  ];
}
