/**
 * Garden — a persistent lawn that grows while the owner is away.
 *
 * PLACEMENT is the builder's. A `garden_bed` smart object is a square of ground
 * the owner drags onto the plot (one bed ≈ one parcel). Changing beds needs a
 * republish.
 *
 * GROWTH is live. Every bed is a grid of cells; each cell remembers only WHEN it
 * was last cut and by whom. Nothing simulates: the stage is derived from elapsed
 * real time whenever someone looks. The live document never includes positions.
 *
 * TRUST (V0): the scene sends the published admin/helper policy along with every
 * signed write. The server enforces it, but the policy is self-attested by the
 * published scene, not verified against LAND or World ownership. Good enough for
 * a lawn; not good enough for money.
 */

export const GARDEN_VERSION = 1 as const;

/** One bed is a parcel by default. */
export const GARDEN_BED_DEFAULT_SIZE_M = 16;
export const GARDEN_BED_MIN_SIZE_M = 4;
export const GARDEN_BED_MAX_SIZE_M = 32;

/** 8 × 8 = 64 cells; 10 × 10 = 100. Under the 200-entity parcel budget either way. */
export const GARDEN_CELLS_PER_SIDE_DEFAULT = 8;
export const GARDEN_CELLS_PER_SIDE_MIN = 4;
export const GARDEN_CELLS_PER_SIDE_MAX = 10;

/** Hours between growth stages. 24 → a lawn is wild after five days away. */
export const GARDEN_STAGE_HOURS_DEFAULT = 24;
export const GARDEN_STAGE_HOURS_MIN = 0.05;
export const GARDEN_STAGE_HOURS_MAX = 24 * 30;

export const GARDEN_BED_SMART_TYPE = "garden_bed" as const;
export const GARDEN_BED_BINDING = "garden-bed" as const;

/** Growth stages, freshly cut → wild. Index is the stage number. */
import {
  GROUND_COVER_SPECIES,
  isGroundCoverDensity,
  isGroundCoverSpecies,
  type GroundCoverDensity,
  type GroundCoverSpecies,
} from "./ground-cover-contract";

export const GARDEN_STAGES = [
  { id: "fresh", label: "Freshly cut", heightM: 0.04, color: "#79c853" },
  { id: "short", label: "Short", heightM: 0.08, color: "#67b445" },
  { id: "healthy", label: "Healthy", heightM: 0.14, color: "#549e3a" },
  { id: "long", label: "Long", heightM: 0.26, color: "#5f9a33" },
  { id: "overgrown", label: "Overgrown", heightM: 0.42, color: "#7f8f33" },
  { id: "wild", label: "Wild", heightM: 0.6, color: "#8d8a2c" },
] as const;
export type GardenStage = 0 | 1 | 2 | 3 | 4 | 5;
export const GARDEN_STAGE_MAX: GardenStage = 5;

/** Wind strength is a percentage; 55 is a breeze you notice without watching for it. */
export const GARDEN_WIND_DEFAULT = 55;
export const GARDEN_WIND_MIN = 0;
export const GARDEN_WIND_MAX = 100;

export const GARDEN_HELPER_POLICIES = ["owner", "approved", "everyone"] as const;
export type GardenHelperPolicy = (typeof GARDEN_HELPER_POLICIES)[number];

export function isGardenHelperPolicy(value: unknown): value is GardenHelperPolicy {
  return typeof value === "string" && (GARDEN_HELPER_POLICIES as readonly string[]).includes(value);
}

export interface GardenAppConfig {
  enabled: boolean;
  /** Real hours per growth stage. */
  stageHours: number;
  /** Who may mow besides the scene admins. */
  helpers: GardenHelperPolicy;
  /** Wallets allowed when `helpers` is "approved". Lower-cased on normalize. */
  helperWallets: string[];
  /** Garden API origin. Empty → the Swissverse Builder host. */
  apiBaseUrl: string;
  /** Wind strength, 0-100. 0 stands the lawn still; see garden-wind.ts. */
  wind: number;
  /**
   * How thickly the bed is planted with ground cover — the clover, dandelions,
   * daisies, ferns and meadow grass that live BETWEEN the blades.
   *
   * Placement is not stored. The plan is recomputed from the bed's own seed, so a
   * plot can carry hundreds of plants without a row in a table for any of them —
   * see shared/ground-cover-contract.ts.
   */
  groundCoverDensity: GroundCoverDensity;
  /** Which species may appear. An empty list plants nothing, whatever the density. */
  groundCoverSpecies: GroundCoverSpecies[];
  /**
   * How grown a NEW bed is the first time anyone sees it.
   *
   * A bed placed at stage 0 is bare turf, which reads as "the app is broken"
   * rather than "the lawn is mown" — you cannot mow what is not there, so there
   * is nothing to do and nothing to see. Beds therefore open partway up the
   * ladder, and this is the dial: 0 fresh … 5 wild.
   *
   * A bed may override it (`spec.startStage`); this is the default for beds that
   * do not. Never applies to a patch the garden service has already saved.
   */
  startStage: GardenStage;
}

export function defaultGardenAppConfig(): GardenAppConfig {
  return {
    enabled: false,
    stageHours: GARDEN_STAGE_HOURS_DEFAULT,
    helpers: "owner",
    helperWallets: [],
    apiBaseUrl: "",
    wind: GARDEN_WIND_DEFAULT,
    startStage: GARDEN_UNTENDED_STAGES as GardenStage,
    groundCoverDensity: "normal",
    groundCoverSpecies: [...GROUND_COVER_SPECIES],
  };
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeWalletList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const row of raw) {
    if (typeof row !== "string") continue;
    const wallet = row.trim().toLowerCase();
    if (/^0x[a-f0-9]{40}$/.test(wallet) && !out.includes(wallet)) out.push(wallet);
  }
  return out;
}

export function normalizeGardenAppConfig(raw: unknown): GardenAppConfig {
  const base = defaultGardenAppConfig();
  if (!raw || typeof raw !== "object") return base;
  const partial = raw as Partial<GardenAppConfig>;
  const url = typeof partial.apiBaseUrl === "string" ? partial.apiBaseUrl.trim() : "";
  return {
    enabled: partial.enabled === true,
    stageHours: num(partial.stageHours, base.stageHours, GARDEN_STAGE_HOURS_MIN, GARDEN_STAGE_HOURS_MAX),
    helpers: isGardenHelperPolicy(partial.helpers) ? partial.helpers : base.helpers,
    helperWallets: normalizeWalletList(partial.helperWallets),
    apiBaseUrl: url.replace(/\/+$/, ""),
    wind: num(partial.wind, base.wind, GARDEN_WIND_MIN, GARDEN_WIND_MAX),
    startStage:
      partial.startStage === undefined ? base.startStage : clampGardenStage(partial.startStage),
    groundCoverDensity: isGroundCoverDensity(partial.groundCoverDensity)
      ? partial.groundCoverDensity
      : base.groundCoverDensity,
    // An unknown species is dropped rather than defaulting the whole list: a scene
    // saved by a newer Builder must not silently replant itself on an older one.
    groundCoverSpecies: Array.isArray(partial.groundCoverSpecies)
      ? partial.groundCoverSpecies.filter(isGroundCoverSpecies)
      : [...base.groundCoverSpecies],
  };
}

// ---------------------------------------------------------------------------
// Bed geometry
// ---------------------------------------------------------------------------

/**
 * PARCEL SNAP. A bed is exactly one 16 m parcel, so it belongs ON the parcel grid —
 * an arbitrary metre offset reads as a lawn laid crooked over four plots. Both the
 * placement button and the viewport drag run every bed centre through here.
 *
 * Frame: the plot-centred scene frame — x spans [-cols*8, +cols*8]. That is the frame
 * a free-on-plot smart wrapper is positioned in, and the one findOpenPlotObjectPoint
 * returns, so no conversion happens here.
 */
export const PARCEL_M = 16;

export function gardenParcelCenter(
  layout: { cols: number; rows: number },
  col: number,
  row: number,
): { x: number; z: number } {
  const cols = Math.max(1, Math.round(layout.cols));
  const rows = Math.max(1, Math.round(layout.rows));
  const c = Math.max(0, Math.min(cols - 1, Math.round(col)));
  const r = Math.max(0, Math.min(rows - 1, Math.round(row)));
  return {
    x: -(cols * PARCEL_M) / 2 + (c + 0.5) * PARCEL_M,
    z: -(rows * PARCEL_M) / 2 + (r + 0.5) * PARCEL_M,
  };
}

/** Nearest parcel centre to a loose point, clamped inside the plot. */
export function snapToGardenParcel(
  layout: { cols: number; rows: number },
  x: number,
  z: number,
): { x: number; z: number; col: number; row: number } {
  const cols = Math.max(1, Math.round(layout.cols));
  const rows = Math.max(1, Math.round(layout.rows));
  const col = Math.max(
    0,
    Math.min(cols - 1, Math.floor((x + (cols * PARCEL_M) / 2) / PARCEL_M)),
  );
  const row = Math.max(
    0,
    Math.min(rows - 1, Math.floor((z + (rows * PARCEL_M) / 2) / PARCEL_M)),
  );
  return { ...gardenParcelCenter(layout, col, row), col, row };
}

/** Every parcel centre on the plot, nearest `preferred` first. */
export function gardenParcelCentersByDistance(
  layout: { cols: number; rows: number },
  preferred: { x: number; z: number },
): { x: number; z: number; col: number; row: number }[] {
  const cols = Math.max(1, Math.round(layout.cols));
  const rows = Math.max(1, Math.round(layout.rows));
  const out: { x: number; z: number; col: number; row: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      out.push({ ...gardenParcelCenter(layout, col, row), col, row });
    }
  }
  out.sort(
    (a, b) =>
      Math.hypot(a.x - preferred.x, a.z - preferred.z) -
      Math.hypot(b.x - preferred.x, b.z - preferred.z),
  );
  return out;
}

export function clampGardenBedSize(value: unknown): number {
  return num(value, GARDEN_BED_DEFAULT_SIZE_M, GARDEN_BED_MIN_SIZE_M, GARDEN_BED_MAX_SIZE_M);
}

export function clampGardenCellsPerSide(value: unknown): number {
  return Math.round(
    num(value, GARDEN_CELLS_PER_SIDE_DEFAULT, GARDEN_CELLS_PER_SIDE_MIN, GARDEN_CELLS_PER_SIDE_MAX),
  );
}

export interface GardenCellPose {
  index: number;
  col: number;
  row: number;
  /** Bed-local metres, bed centre at 0,0. */
  localX: number;
  localZ: number;
  cellW: number;
  cellD: number;
}

/** Cell centres in bed-local metres, row-major from the −x/−z corner. */
export function planGardenCells(widthM: number, depthM: number, cellsPerSide: number): GardenCellPose[] {
  const n = clampGardenCellsPerSide(cellsPerSide);
  const w = clampGardenBedSize(widthM);
  const d = clampGardenBedSize(depthM);
  const cellW = w / n;
  const cellD = d / n;
  const cells: GardenCellPose[] = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      cells.push({
        index: row * n + col,
        col,
        row,
        localX: -w / 2 + (col + 0.5) * cellW,
        localZ: -d / 2 + (row + 0.5) * cellD,
        cellW,
        cellD,
      });
    }
  }
  return cells;
}

/** Which cell a bed-local point is in, or -1 when off the bed. */
export function gardenCellAt(
  localX: number,
  localZ: number,
  widthM: number,
  depthM: number,
  cellsPerSide: number,
): number {
  const n = clampGardenCellsPerSide(cellsPerSide);
  const w = clampGardenBedSize(widthM);
  const d = clampGardenBedSize(depthM);
  if (localX < -w / 2 || localX >= w / 2 || localZ < -d / 2 || localZ >= d / 2) return -1;
  const col = Math.floor(((localX + w / 2) / w) * n);
  const row = Math.floor(((localZ + d / 2) / d) * n);
  return Math.min(n - 1, Math.max(0, row)) * n + Math.min(n - 1, Math.max(0, col));
}

/** World → bed-local for a bed yawed by `rotationDeg` about +y. */
export function worldToGardenLocal(
  worldX: number,
  worldZ: number,
  bedX: number,
  bedZ: number,
  rotationDeg: number,
): { x: number; z: number } {
  const dx = worldX - bedX;
  const dz = worldZ - bedZ;
  const rad = (-(rotationDeg || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

/**
 * Stage from elapsed time. `cutAtMs` null = never cut since planting, so growth
 * counts from `plantedAtMs`. Time running backwards (clock skew) reads as fresh.
 */
/**
 * How grown a bed is the first time anyone sees it.
 *
 * A bed with no saved state used to be planted at "freshly cut" — 4 cm of grass,
 * which in world is a painted green floor, and the reason the first published
 * garden read as no garden at all. An untended lawn is not a mown one: a new bed
 * opens two stages up, with grass you can see and mow back down.
 */
export const GARDEN_UNTENDED_STAGES = 2;

/** Clamp anything into a real stage index. */
export function clampGardenStage(value: unknown): GardenStage {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return GARDEN_UNTENDED_STAGES as GardenStage;
  return Math.max(0, Math.min(GARDEN_STAGE_MAX, n)) as GardenStage;
}

/**
 * The plant time that makes a bed OPEN at `stage`.
 *
 * Growth is derived from elapsed time and nothing else — a cell stores only when
 * it was last cut — so "start already grown" is not new state to carry, it is a
 * plant date far enough in the past that the stage falls out of the arithmetic.
 * Back-date by half a step past the boundary so a bed does not tick over to the
 * next stage seconds after it loads.
 *
 * Only ever applies to a cell the garden service has never saved. Once a lawn has
 * been mown, the saved cut time is the truth and this is not consulted again —
 * which is why changing the setting does not reset anybody's tended garden.
 */
export function gardenPlantedAtForStage(
  nowMs: number,
  stageHours: number,
  stage: GardenStage,
): number {
  const step = Math.max(GARDEN_STAGE_HOURS_MIN, stageHours || GARDEN_STAGE_HOURS_DEFAULT);
  const wanted = clampGardenStage(stage);
  if (wanted <= 0) return nowMs;
  // The last stage has no upper boundary to sit inside, so land squarely on it.
  const offset = wanted >= GARDEN_STAGE_MAX ? wanted : wanted + 0.5;
  return nowMs - offset * step * 3_600_000;
}

/** The plant time a never-saved bed should use, so it opens already grown. */
export function gardenUntendedPlantedAt(nowMs: number, stageHours: number): number {
  return gardenPlantedAtForStage(nowMs, stageHours, GARDEN_UNTENDED_STAGES as GardenStage);
}

export function gardenStage(
  cutAtMs: number | null,
  plantedAtMs: number,
  nowMs: number,
  stageHours: number,
): GardenStage {
  const since = cutAtMs ?? plantedAtMs;
  if (!Number.isFinite(since)) return 0;
  const hours = Math.max(0, nowMs - since) / 3_600_000;
  const step = Math.max(GARDEN_STAGE_HOURS_MIN, stageHours || GARDEN_STAGE_HOURS_DEFAULT);
  const stage = Math.floor(hours / step);
  return Math.max(0, Math.min(GARDEN_STAGE_MAX, stage)) as GardenStage;
}

/**
 * How far a cell is through the WHOLE run, 0 to 1 — fresh at 0, wild at 1.
 *
 * `gardenStage` answers which of the six models to draw and is a floor(), so it
 * says nothing about progress inside a stage: a lawn one minute from turning
 * "long" and one that turned "healthy" an hour ago report the same number. A
 * gardener watching a bed wants the continuous figure, which is what this is.
 * It saturates at 1 rather than running on, because "wild" is the end of growth,
 * not a stage like the others.
 */
export function gardenGrowth01(
  cutAtMs: number | null,
  plantedAtMs: number,
  nowMs: number,
  stageHours: number,
): number {
  const since = cutAtMs ?? plantedAtMs;
  if (!Number.isFinite(since)) return 0;
  const hours = Math.max(0, nowMs - since) / 3_600_000;
  const step = Math.max(GARDEN_STAGE_HOURS_MIN, stageHours || GARDEN_STAGE_HOURS_DEFAULT);
  const full = GARDEN_STAGE_MAX * step;
  if (!(full > 0)) return 0;
  return Math.max(0, Math.min(1, hours / full));
}

/** The same figure as a whole number, which is what a panel shows. */
export function gardenGrowthPercent(
  cutAtMs: number | null,
  plantedAtMs: number,
  nowMs: number,
  stageHours: number,
): number {
  return Math.round(gardenGrowth01(cutAtMs, plantedAtMs, nowMs, stageHours) * 100);
}

export function gardenStageLabel(stage: GardenStage): string {
  return GARDEN_STAGES[stage]?.label ?? GARDEN_STAGES[0].label;
}

/** "3 of 64 cells wild — needs mowing", the sign line a visitor reads. */
export function gardenSummaryLine(stages: readonly GardenStage[]): string {
  const total = stages.length;
  if (!total) return "No lawn yet";
  const wild = stages.filter((s) => s >= 4).length;
  const long = stages.filter((s) => s === 3).length;
  const kept = stages.filter((s) => s <= 1).length;
  if (wild === total) return "Completely overgrown";
  if (wild > 0) return `${wild} of ${total} patches overgrown`;
  if (long > 0) return `${long} of ${total} patches need mowing`;
  if (kept === total) return "Freshly mown";
  return "Well kept";
}

// ---------------------------------------------------------------------------
// Live document + permissions
// ---------------------------------------------------------------------------

export interface GardenCellState {
  /** Cell index, row-major. */
  i: number;
  /** ISO — last cut. Null = never cut since planting. */
  cutAt: string | null;
  /** Wallet that cut it last. */
  by: string;
  /** Keep-wild — helpers cannot cut it. */
  protected: boolean;
}

export interface GardenContributor {
  wallet: string;
  cellsCut: number;
  lastAt: string;
}

export interface GardenBedState {
  sceneId: string;
  bedId: string;
  plantedAt: string;
  cells: GardenCellState[];
  contributors: GardenContributor[];
}

/** The published policy a scene sends with every write. Self-attested (see header). */
export interface GardenPolicy {
  admins: string[];
  helpers: GardenHelperPolicy;
  helperWallets: string[];
}

export function normalizeGardenPolicy(raw: unknown): GardenPolicy {
  const partial = (raw && typeof raw === "object" ? raw : {}) as Partial<GardenPolicy>;
  return {
    admins: normalizeWalletList(partial.admins),
    helpers: isGardenHelperPolicy(partial.helpers) ? partial.helpers : "owner",
    helperWallets: normalizeWalletList(partial.helperWallets),
  };
}

export type GardenRole = "admin" | "helper" | "visitor";

export function gardenRoleFor(wallet: string, policy: GardenPolicy): GardenRole {
  const key = wallet.trim().toLowerCase();
  if (!key) return "visitor";
  if (policy.admins.includes(key)) return "admin";
  if (policy.helpers === "everyone") return "helper";
  if (policy.helpers === "approved" && policy.helperWallets.includes(key)) return "helper";
  return "visitor";
}

export function gardenRoleCanMow(role: GardenRole, cellProtected: boolean): boolean {
  if (role === "admin") return true;
  if (role === "helper") return !cellProtected;
  return false;
}

export function gardenRoleCanProtect(role: GardenRole): boolean {
  return role === "admin";
}

export const GARDEN_MOW_BATCH_MAX = 200;

/** Distinct, in-range cell indices, at most GARDEN_MOW_BATCH_MAX. */
export function normalizeGardenCellIndices(raw: unknown, cellCount: number): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  for (const row of raw) {
    const n = typeof row === "number" ? Math.floor(row) : Number.NaN;
    if (!Number.isFinite(n) || n < 0 || n >= cellCount) continue;
    seen.add(n);
    if (seen.size >= GARDEN_MOW_BATCH_MAX) break;
  }
  return [...seen].sort((a, b) => a - b);
}

export function nextGardenBedId(existingIds: readonly string[]): string {
  const used = new Set(existingIds);
  for (let i = 1; i < 10_000; i += 1) {
    const id = `garden_bed_${i}`;
    if (!used.has(id)) return id;
  }
  return `garden_bed_${Date.now().toString(36)}`;
}
