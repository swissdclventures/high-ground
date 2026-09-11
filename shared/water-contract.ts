/**
 * Water — rivers, lakes and seas laid on the parcel grid, inside ONE scene.
 *
 * WHY A TILE IS A PARCEL. A boat may only sail where the scene is. Decentraland
 * gives a moving entity no way to cross into the neighbouring scene: it stops at
 * the boundary or it disappears. So a waterway that a boat can actually travel
 * has to be one scene the whole way along, and the honest unit of "one scene" is
 * the parcel. A water tile is therefore exactly one 16 m parcel, parcel-snapped
 * and yaw-locked, the same law the Garden bed follows. The budget then needs no
 * arithmetic: a scene may hold at most one water tile per parcel it owns.
 *
 * That is also why the shape of a river here is a CHAIN of one- or two-parcel
 * tiles rather than a wide painted region. A one-parcel channel that runs for
 * forty parcels costs forty parcels and sails end to end; a lake three parcels
 * wide costs nine for every three of length and sails nowhere new.
 *
 * WHY WATER IS NEVER FLUSH WITH THE PARCEL EDGE. See SHORE below: every tile
 * edge that does not meet another water tile gets a dry bank. Water that runs
 * exactly to the parcel line meets the neighbouring ground at a hard seam, and
 * on the outer ring it meets the void. The bank is what makes a one-parcel canal
 * read as a canal instead of a blue square.
 *
 * WHAT THIS FILE OWNS: geometry, colour, depth, flow, shores, the outer ring
 * plan, and the navigation region a boat is allowed into. It owns no entities
 * and no rendering — `scene/src/plugins/water.ts` reads this and draws it, and
 * `app/src/scene-spec/water-app-panel.ts` reads this and edits it.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT OWN: boats. A boat is a Vehicle. Water
 * hands the Vehicles app a `VehicleBounds` + `VehicleObstacle[]` pair through
 * `waterNavigation()` — the exact shape `shared/vehicle-contract.ts` already
 * clamps a pose against — so a boat is a vehicle whose allowed region happens to
 * be wet. Nothing in the vehicle contract changes.
 *
 * LIMIT, STATED PLAINLY (v1): Decentraland has no swimming. Every tile is
 * walkable at wade depth — the collider plate sits `WATER_WADE_DEPTH_M` under
 * the surface however deep the tile looks. Deep water is deep to the EYE (the
 * bed is drawn at its real depth and the surface is tinted and opaque for it),
 * and shallow to the FOOT. Buoyancy via the player-physics API is the v2 answer;
 * until then a sea is a place you wade and sail, not a place you sink.
 */

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export const WATER_VERSION = 1 as const;

/** A tile IS a parcel. Not a default — a law. See the header. */
export const WATER_PARCEL_M = 16;

export const WATER_TILE_SMART_TYPE = "water_tile" as const;
export const WATER_TILE_BINDING = "water-body" as const;

/**
 * How far under the surface the walkable plate sits, whatever the tile's depth.
 * 0.9 m puts an average avatar in at the waist: visibly in the water, still able
 * to walk out. Raising it past ~1.2 m starts hiding the avatar's head.
 */
export const WATER_WADE_DEPTH_M = 0.9;

/**
 * Clearance between the two drifting surface layers.
 *
 * The moving look comes from two translucent planes scrolling at different
 * rates. Seat them on the same plane and the explorer's depth buffer picks one
 * per fragment — see the coplanar rule; a lawn published as a solid black
 * rectangle came from exactly this. 20 mm is four times the 5 mm floor and still
 * invisible at eye height.
 */
export const WATER_LAYER_GAP_M = 0.02;

/**
 * Surface height relative to the plot's walk surface.
 *
 * ‼️THE DEFAULT IS ABOVE THE GROUND, NOT BELOW IT, and that is not a typo. A
 * scene's site ground is a solid plate across the whole plot. Water sunk below
 * it is water you can never reach: the player walks on the ground at y = 0 and
 * the surface is somewhere under their feet. So water FLOATS 2 cm proud by
 * default and works on any plot without excavation — you wade in at the shore.
 *
 * DEPTH IS THEN A LOOK, NOT A HOLE. The bed plate is still drawn at the tile's
 * real depth, and the surface is still tinted and made opaque for it, but where
 * the site ground exists the ground hides the bed and depth is colour alone.
 * Where it does not — the outer ring, a plot with no site ground, a scene that
 * has excavated — the same tile shows its real bed and reads properly deep.
 *
 * Negative values are honest and supported for exactly that excavated case.
 */
export const WATER_LEVEL_DEFAULT_M = 0.02;
export const WATER_LEVEL_MIN_M = -4;
export const WATER_LEVEL_MAX_M = 1;

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

export const WATER_KINDS = ["sea", "lake", "river", "canal", "pool"] as const;
export type WaterKind = (typeof WATER_KINDS)[number];

export function isWaterKind(value: unknown): value is WaterKind {
  return typeof value === "string" && (WATER_KINDS as readonly string[]).includes(value);
}

export const WATER_KIND_LABELS: Record<WaterKind, string> = {
  sea: "Sea",
  lake: "Lake",
  river: "River",
  canal: "Canal",
  pool: "Pool",
};

export const WATER_KIND_HINTS: Record<WaterKind, string> = {
  sea: "Deep, dark, slow swell. The outer ring.",
  lake: "Still and mid-depth. Fills a basin.",
  river: "Shallow and flowing. Chain the tiles to make a course.",
  canal: "Shallow, straight, barely moving. Cuts through a district.",
  pool: "Shallowest and clearest. Sits inside a plot.",
};

export interface WaterKindProfile {
  /** Metres from surface to bed. */
  depthM: number;
  /** Surface drift, m/s. 0 still shimmers; it just does not travel. */
  flowMps: number;
  /** Vertical bob of the surface, metres peak. */
  waveAmpM: number;
  /** Seconds per bob cycle. */
  wavePeriodS: number;
  /** Dry bank on any edge that does not meet water, metres. */
  shoreM: number;
  /** Surface tint where the water is shallow. */
  shallow: string;
  /** Surface tint where the water is at full depth. */
  deep: string;
  /** The bed you see through it. */
  bed: string;
  /** The waterline strip against a bank. */
  foam: string;
}

/**
 * The five presets. Everything a tile shows is derived from one of these plus
 * the per-tile overrides, so "make it look like a canal" is one field, not nine.
 */
export const WATER_KIND_PROFILES: Record<WaterKind, WaterKindProfile> = {
  sea: {
    depthM: 6,
    flowMps: 0.35,
    waveAmpM: 0.09,
    wavePeriodS: 5.5,
    shoreM: 2.4,
    shallow: "#3f9fb5",
    deep: "#0d3550",
    bed: "#26333a",
    foam: "#d8ecf2",
  },
  lake: {
    depthM: 3,
    flowMps: 0.05,
    waveAmpM: 0.04,
    wavePeriodS: 7,
    shoreM: 1.8,
    shallow: "#5fbfae",
    deep: "#1b4f5e",
    bed: "#3a4033",
    foam: "#e2f1ec",
  },
  river: {
    depthM: 1.4,
    flowMps: 1.1,
    waveAmpM: 0.05,
    wavePeriodS: 3.2,
    shoreM: 2.2,
    shallow: "#6fc6b2",
    deep: "#256b6a",
    bed: "#4b4536",
    foam: "#eaf6f1",
  },
  canal: {
    depthM: 1.8,
    flowMps: 0.25,
    waveAmpM: 0.03,
    wavePeriodS: 4.5,
    shoreM: 1.2,
    shallow: "#57a89c",
    deep: "#1f4f4c",
    bed: "#3c3c3c",
    foam: "#e6f0ee",
  },
  pool: {
    depthM: 1.2,
    flowMps: 0.08,
    waveAmpM: 0.02,
    wavePeriodS: 4,
    shoreM: 0.6,
    shallow: "#7fd8e8",
    deep: "#2b8fb8",
    bed: "#bfe6f2",
    foam: "#ffffff",
  },
};

export const WATER_DEPTH_MIN_M = 0.3;
export const WATER_DEPTH_MAX_M = 12;
export const WATER_FLOW_MAX_MPS = 3;
export const WATER_SHORE_MAX_M = 6;

// ---------------------------------------------------------------------------
// App config
// ---------------------------------------------------------------------------

export interface WaterAppConfig {
  enabled: boolean;
  /**
   * Surface height relative to the plot's walk surface, metres. Negative sinks
   * the water below the ground so the bank has a fall; 0 makes it flush, which
   * is what a flooded plaza wants and nothing else does.
   */
  levelM: number;
  /** Kind a newly placed tile takes. */
  defaultKind: WaterKind;
  /** Multiplies every kind's `waveAmpM`. 0 stands the water still. */
  waves: number;
  /** Multiplies every kind's `flowMps`. 0 stops the drift. */
  flow: number;
  /** Overrides every kind's `shoreM` when > 0. Below zero means "use the kind's". */
  shoreM: number;
  /** Draw the pale strip where water meets a bank. */
  foam: boolean;
  /**
   * Reflect the sky in the surface. Cheap here (one material flag), but it makes
   * a shallow pool read as a mirror rather than as water, so it is off for pools
   * by default and on for everything else.
   */
  reflective: boolean;
  /**
   * Cap on tiles this scene will draw, as a percentage of the plot's parcels.
   * 100 means "the whole plot may be water". The runtime never exceeds the plot
   * parcel count regardless.
   */
  maxParcelPercent: number;
}

export const WATER_WAVES_DEFAULT = 60;
export const WATER_FLOW_DEFAULT = 70;
export const WATER_MAX_PARCEL_PERCENT_DEFAULT = 100;

export function defaultWaterAppConfig(): WaterAppConfig {
  return {
    enabled: false,
    levelM: WATER_LEVEL_DEFAULT_M,
    defaultKind: "lake",
    waves: WATER_WAVES_DEFAULT,
    flow: WATER_FLOW_DEFAULT,
    shoreM: -1,
    foam: true,
    reflective: true,
    maxParcelPercent: WATER_MAX_PARCEL_PERCENT_DEFAULT,
  };
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeWaterAppConfig(raw: unknown): WaterAppConfig {
  const base = defaultWaterAppConfig();
  if (!raw || typeof raw !== "object") return base;
  const partial = raw as Partial<WaterAppConfig>;
  return {
    enabled: partial.enabled === true,
    levelM: num(partial.levelM, base.levelM, WATER_LEVEL_MIN_M, WATER_LEVEL_MAX_M),
    defaultKind: isWaterKind(partial.defaultKind) ? partial.defaultKind : base.defaultKind,
    waves: num(partial.waves, base.waves, 0, 200),
    flow: num(partial.flow, base.flow, 0, 200),
    shoreM: num(partial.shoreM, base.shoreM, -1, WATER_SHORE_MAX_M),
    foam: partial.foam !== false,
    reflective: partial.reflective !== false,
    maxParcelPercent: num(partial.maxParcelPercent, base.maxParcelPercent, 0, 100),
  };
}

// ---------------------------------------------------------------------------
// Tile spec — what a `water_tile` smart object carries
// ---------------------------------------------------------------------------

export interface WaterTileSpec {
  kind: WaterKind;
  /** Overrides the kind's depth when set. */
  depthM?: number;
  /** Flow heading in degrees, 0 = +Z, clockwise. Ignored when the kind is still. */
  flowDeg?: number;
  /** Overrides the kind's flow speed when set. */
  flowMps?: number;
  /** Overrides both the kind's and the app's bank width when set. */
  shoreM?: number;
  /**
   * Force a bank on an edge that HAS a water neighbour — an island's own
   * shoreline, or a lock gate. Edges are "-x" | "+x" | "-z" | "+z".
   */
  bankEdges?: WaterEdge[];
}

export const WATER_EDGES = ["-x", "+x", "-z", "+z"] as const;
export type WaterEdge = (typeof WATER_EDGES)[number];

export function defaultWaterTileSpec(kind: WaterKind = "lake"): WaterTileSpec {
  return { kind };
}

export function normalizeWaterTileSpec(raw: unknown, fallbackKind: WaterKind = "lake"): WaterTileSpec {
  const kindFallback = isWaterKind(fallbackKind) ? fallbackKind : "lake";
  if (!raw || typeof raw !== "object") return defaultWaterTileSpec(kindFallback);
  const partial = raw as Partial<WaterTileSpec>;
  const spec: WaterTileSpec = {
    kind: isWaterKind(partial.kind) ? partial.kind : kindFallback,
  };
  if (typeof partial.depthM === "number" && Number.isFinite(partial.depthM)) {
    spec.depthM = num(partial.depthM, WATER_KIND_PROFILES[spec.kind].depthM, WATER_DEPTH_MIN_M, WATER_DEPTH_MAX_M);
  }
  if (typeof partial.flowDeg === "number" && Number.isFinite(partial.flowDeg)) {
    spec.flowDeg = ((partial.flowDeg % 360) + 360) % 360;
  }
  if (typeof partial.flowMps === "number" && Number.isFinite(partial.flowMps)) {
    spec.flowMps = num(partial.flowMps, 0, 0, WATER_FLOW_MAX_MPS);
  }
  if (typeof partial.shoreM === "number" && Number.isFinite(partial.shoreM)) {
    spec.shoreM = num(partial.shoreM, 0, 0, WATER_SHORE_MAX_M);
  }
  if (Array.isArray(partial.bankEdges)) {
    const edges = partial.bankEdges.filter((e): e is WaterEdge =>
      (WATER_EDGES as readonly string[]).includes(e as string)
    );
    if (edges.length) spec.bankEdges = Array.from(new Set(edges));
  }
  return spec;
}

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

export interface WaterCell {
  col: number;
  row: number;
}

export interface WaterTile extends WaterCell {
  id: string;
  spec: WaterTileSpec;
}

export interface PlotLayout {
  cols: number;
  rows: number;
}

/**
 * TWO FRAMES, NAMED. The Builder positions a free-on-plot smart wrapper in the
 * PLOT-CENTRED frame (x spans [-cols·8, +cols·8]); the scene runtime and the
 * vehicle contract both use DCL SCENE metres with the SW corner at the origin.
 * They are one `cols·8` apart and confusing them puts the sea half a plot off,
 * so every function below says in its name which frame it speaks.
 *
 *   plot-centred:  waterParcelCenter(layout, col, row)  — Builder, viewport
 *   SW origin:     waterParcelCenterScene(col, row)     — runtime, boats
 */
export function waterParcelCenter(layout: PlotLayout, col: number, row: number): { x: number; z: number } {
  const cols = Math.max(1, Math.round(layout.cols));
  const rows = Math.max(1, Math.round(layout.rows));
  const c = Math.max(0, Math.min(cols - 1, Math.round(col)));
  const r = Math.max(0, Math.min(rows - 1, Math.round(row)));
  return {
    x: -(cols * WATER_PARCEL_M) / 2 + (c + 0.5) * WATER_PARCEL_M,
    z: -(rows * WATER_PARCEL_M) / 2 + (r + 0.5) * WATER_PARCEL_M,
  };
}

/** Centre of a parcel in DCL scene metres, SW corner at the origin. Runtime and boats. */
export function waterParcelCenterScene(col: number, row: number): { x: number; z: number } {
  return {
    x: (Math.round(col) + 0.5) * WATER_PARCEL_M,
    z: (Math.round(row) + 0.5) * WATER_PARCEL_M,
  };
}

/** Which parcel an SW-origin scene point falls in. */
export function waterCellFromScene(x: number, z: number): WaterCell {
  return { col: Math.floor(x / WATER_PARCEL_M), row: Math.floor(z / WATER_PARCEL_M) };
}

/** Nearest parcel centre to a loose point, clamped inside the plot. */
export function snapToWaterParcel(
  layout: PlotLayout,
  x: number,
  z: number
): { x: number; z: number; col: number; row: number } {
  const cols = Math.max(1, Math.round(layout.cols));
  const rows = Math.max(1, Math.round(layout.rows));
  const col = Math.max(0, Math.min(cols - 1, Math.floor((x + (cols * WATER_PARCEL_M) / 2) / WATER_PARCEL_M)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor((z + (rows * WATER_PARCEL_M) / 2) / WATER_PARCEL_M)));
  return { ...waterParcelCenter(layout, col, row), col, row };
}

/** Every parcel centre on the plot, nearest `preferred` first. Plot-centred frame. */
export function waterParcelCentersByDistance(
  layout: PlotLayout,
  preferred: { x: number; z: number }
): { x: number; z: number; col: number; row: number }[] {
  const cols = Math.max(1, Math.round(layout.cols));
  const rows = Math.max(1, Math.round(layout.rows));
  const out: { x: number; z: number; col: number; row: number }[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      out.push({ ...waterParcelCenter(layout, col, row), col, row });
    }
  }
  out.sort(
    (a, b) =>
      Math.hypot(a.x - preferred.x, a.z - preferred.z) -
      Math.hypot(b.x - preferred.x, b.z - preferred.z)
  );
  return out;
}

export function nextWaterTileId(existingIds: readonly string[]): string {
  const used = new Set(existingIds);
  for (let i = 1; i < 10_000; i += 1) {
    const id = `water_tile_${i}`;
    if (!used.has(id)) return id;
  }
  return `water_tile_${Date.now().toString(36)}`;
}

/** Which parcel a world point falls in — no clamping, so off-plot returns off-grid indices. */
export function waterCellAt(layout: PlotLayout, x: number, z: number): WaterCell {
  const cols = Math.max(1, Math.round(layout.cols));
  const rows = Math.max(1, Math.round(layout.rows));
  return {
    col: Math.floor((x + (cols * WATER_PARCEL_M) / 2) / WATER_PARCEL_M),
    row: Math.floor((z + (rows * WATER_PARCEL_M) / 2) / WATER_PARCEL_M),
  };
}

export function waterCellKey(col: number, row: number): string {
  return `${Math.round(col)},${Math.round(row)}`;
}

/** Tiles keyed by cell, so neighbour lookups are O(1) instead of O(tiles). */
export function waterTileIndex(tiles: readonly WaterTile[]): Map<string, WaterTile> {
  const map = new Map<string, WaterTile>();
  for (const tile of tiles) map.set(waterCellKey(tile.col, tile.row), tile);
  return map;
}

const EDGE_STEP: Record<WaterEdge, WaterCell> = {
  "-x": { col: -1, row: 0 },
  "+x": { col: 1, row: 0 },
  "-z": { col: 0, row: -1 },
  "+z": { col: 0, row: 1 },
};

/**
 * SHORE. Which edges of a tile need a dry bank.
 *
 * This is the answer to "do we attach dry land, or lay water to the parcel line".
 * Both: the tile is parcel-snapped so the grid stays simple, and the WATER inside
 * it is inset on every edge that faces land. An edge with a water neighbour is
 * flush, so a chain of river tiles is one unbroken channel; an edge with no water
 * neighbour gets a bank, so the channel always ends in a shore and never in a cut.
 *
 * `bankEdges` on the tile forces a bank on an edge that would otherwise be flush —
 * that is how an island keeps its own shoreline inside a sea.
 */
export function waterBankEdges(tile: WaterTile, index: Map<string, WaterTile>): WaterEdge[] {
  const forced = new Set(tile.spec.bankEdges ?? []);
  return WATER_EDGES.filter((edge) => {
    if (forced.has(edge)) return true;
    const step = EDGE_STEP[edge];
    return !index.has(waterCellKey(tile.col + step.col, tile.row + step.row));
  });
}

/** Bank width for a tile, honouring tile → app → kind in that order. */
export function waterShoreWidth(tile: WaterTile, config: WaterAppConfig): number {
  if (typeof tile.spec.shoreM === "number") return tile.spec.shoreM;
  if (config.shoreM >= 0) return config.shoreM;
  return WATER_KIND_PROFILES[tile.spec.kind].shoreM;
}

export interface WaterTileGeometry {
  /** Parcel centre, plot-centred scene metres. */
  x: number;
  z: number;
  /** Wet rectangle after the banks are taken off, plot-centred scene metres. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Wet rectangle size. */
  width: number;
  depth: number;
  /** Edges carrying a bank. */
  banks: WaterEdge[];
  shoreM: number;
}

/**
 * The wet rectangle of one tile. A tile with banks on all four edges at the sea's
 * 2.4 m still leaves an 11.2 m pond inside a 16 m parcel — which is why a
 * one-parcel lake looks like a pond and a one-parcel channel looks like a canal.
 *
 * `center` is the tile's parcel centre in WHICHEVER frame the caller works in —
 * the returned rectangle comes back in that same frame. Pass
 * `waterParcelCenterScene` from the runtime, `waterParcelCenter` from the Builder.
 */
export function waterTileGeometry(
  tile: WaterTile,
  index: Map<string, WaterTile>,
  center: { x: number; z: number },
  config: WaterAppConfig
): WaterTileGeometry {
  const banks = waterBankEdges(tile, index);
  const shore = Math.min(waterShoreWidth(tile, config), WATER_PARCEL_M / 2 - 0.5);
  const half = WATER_PARCEL_M / 2;
  const minX = center.x - half + (banks.includes("-x") ? shore : 0);
  const maxX = center.x + half - (banks.includes("+x") ? shore : 0);
  const minZ = center.z - half + (banks.includes("-z") ? shore : 0);
  const maxZ = center.z + half - (banks.includes("+z") ? shore : 0);
  return {
    x: center.x,
    z: center.z,
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(0.5, maxX - minX),
    depth: Math.max(0.5, maxZ - minZ),
    banks,
    shoreM: shore,
  };
}

// ---------------------------------------------------------------------------
// Depth, colour, motion
// ---------------------------------------------------------------------------

export function waterTileDepth(tile: WaterTile): number {
  return tile.spec.depthM ?? WATER_KIND_PROFILES[tile.spec.kind].depthM;
}

export interface WaterSurfaceLook {
  /** Hex albedo for the surface plane. */
  color: string;
  /** 0..1. Shallow water shows its bed; deep water hides it. */
  alpha: number;
  /** Hex albedo for the bed plane under the surface. */
  bed: string;
  /** Hex for the waterline strip. */
  foam: string;
}

/**
 * Colour and opacity come from ONE number — how deep the tile is against the
 * deepest tile the kind admits. No second palette, no per-tile colour picker:
 * a scene where every pond is a different blue looks painted, not filled.
 */
export function waterSurfaceLook(tile: WaterTile): WaterSurfaceLook {
  const profile = WATER_KIND_PROFILES[tile.spec.kind];
  const depth = waterTileDepth(tile);
  const t = Math.max(0, Math.min(1, (depth - WATER_DEPTH_MIN_M) / Math.max(0.1, profile.depthM - WATER_DEPTH_MIN_M)));
  return {
    color: mixHex(profile.shallow, profile.deep, t),
    // 0.45 lets a pool's tiles read through; 0.92 hides a sea bed without going opaque.
    alpha: 0.45 + t * 0.47,
    bed: profile.bed,
    foam: profile.foam,
  };
}

/**
 * Opacity correction for water that FLOATS on the ground instead of sitting in a
 * hollow.
 *
 * Depth normally shows because you see the bed through the surface. At levelM >= 0
 * there is no hollow: DCL puts a solid floor at y = 0 that no scene can dig
 * through, so the bed is drawn under the terrain and nobody ever sees it. What a
 * translucent surface then shows is THE GROUND — and a 0.45-alpha navy film over
 * a red plot gives the muddy near-black the owner reported as looking like
 * asphalt.
 *
 * So when the water floats, it has to carry its own colour rather than borrow the
 * ground's. Shallow kinds still keep some translucency, because a pool you cannot
 * see into is a slab of paint.
 */
export function waterOpacityForLevel(alpha: number, levelM: number): number {
  if (levelM < 0) return alpha;
  return Math.max(0, Math.min(0.99, alpha + (1 - alpha) * 0.62));
}

export interface WaterMotion {
  /** UV metres per second along +x and +z. Feeds the surface texture offset. */
  driftX: number;
  driftZ: number;
  /** Vertical bob, metres peak. */
  waveAmpM: number;
  wavePeriodS: number;
}

export function waterMotion(tile: WaterTile, config: WaterAppConfig): WaterMotion {
  const profile = WATER_KIND_PROFILES[tile.spec.kind];
  const speed = (tile.spec.flowMps ?? profile.flowMps) * (config.flow / 100);
  const heading = ((tile.spec.flowDeg ?? 0) * Math.PI) / 180;
  return {
    driftX: Math.sin(heading) * speed,
    driftZ: Math.cos(heading) * speed,
    waveAmpM: profile.waveAmpM * (config.waves / 100),
    wavePeriodS: profile.wavePeriodS,
  };
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = Number.parseInt(full.slice(0, 6) || "000000", 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  const to = (v: number) => clamp255(v).toString(16).padStart(2, "0");
  return `#${to(ca.r + (cb.r - ca.r) * k)}${to(ca.g + (cb.g - ca.g) * k)}${to(ca.b + (cb.b - ca.b) * k)}`;
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export function waterParcelBudget(layout: PlotLayout, config: WaterAppConfig): number {
  const parcels = Math.max(1, Math.round(layout.cols)) * Math.max(1, Math.round(layout.rows));
  return Math.min(parcels, Math.floor((parcels * config.maxParcelPercent) / 100));
}

/** Tiles over the budget, in placement order — the panel lists these as "not drawn". */
export function waterTilesOverBudget(
  tiles: readonly WaterTile[],
  layout: PlotLayout,
  config: WaterAppConfig
): WaterTile[] {
  const budget = waterParcelBudget(layout, config);
  return tiles.length <= budget ? [] : tiles.slice(budget);
}

// ---------------------------------------------------------------------------
// The outer ring
// ---------------------------------------------------------------------------

export interface WaterRingPlan {
  /** Cells to fill with water. */
  water: WaterCell[];
  /** Cells deliberately left dry because a Border gateway sits on them. */
  gateways: WaterCell[];
  /** Cells left dry inside the ring as landfall for arrivals. */
  islands: WaterCell[];
}

export interface WaterRingOptions {
  /** Ring thickness in parcels. 1 is a moat; 2 is sailable both ways past an island. */
  thickness?: number;
  /**
   * Parcel cells on the outer edge that a Border gateway occupies. These stay
   * DRY. See the Border reconciliation note below.
   */
  gatewayCells?: readonly WaterCell[];
  /** Leave one dry parcel beside each gateway as a landing. */
  islandsAtGateways?: boolean;
}

/**
 * BORDER RECONCILIATION, in one paragraph.
 *
 * The Border app claims the scene's CLEAR outer parcels and pairs them with a
 * neighbouring World's counter-sectors: a visitor walks into a strip and comes
 * out standing on the other side. A strip you cannot stand on is not a crossing,
 * so a gateway parcel must stay dry — and both apps want the same ring.
 *
 * The rule this function encodes: **Border wins the parcel, Water wins the rest
 * of the ring.** Gateway cells are excluded from the water plan and reported
 * back in `gateways` so the panel can say why a gap exists. With
 * `islandsAtGateways`, the parcel immediately inboard of each gateway is left dry
 * too — that is the "small island where people come over and land" from the
 * brief: you arrive on land, walk to the shore, and take a boat inward.
 *
 * Water never removes a Border strip and Border never floods one. If Atlas
 * confirms a new crossing after the water is laid, the tile on that parcel is
 * dropped at the next publish rather than the crossing being blocked.
 */
export function planWaterRing(layout: PlotLayout, options: WaterRingOptions = {}): WaterRingPlan {
  const cols = Math.max(1, Math.round(layout.cols));
  const rows = Math.max(1, Math.round(layout.rows));
  const thickness = Math.max(1, Math.min(Math.floor(Math.min(cols, rows) / 2) || 1, Math.round(options.thickness ?? 1)));
  const blocked = new Set((options.gatewayCells ?? []).map((c) => waterCellKey(c.col, c.row)));

  const water: WaterCell[] = [];
  const gateways: WaterCell[] = [];
  const islands: WaterCell[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const depthIn = Math.min(col, row, cols - 1 - col, rows - 1 - row);
      if (depthIn >= thickness) continue;
      const key = waterCellKey(col, row);
      if (blocked.has(key)) {
        gateways.push({ col, row });
        continue;
      }
      water.push({ col, row });
    }
  }

  if (options.islandsAtGateways) {
    const waterKeys = new Set(water.map((c) => waterCellKey(c.col, c.row)));
    for (const gate of gateways) {
      const inward = inwardNeighbour(gate, cols, rows);
      const key = waterCellKey(inward.col, inward.row);
      if (!waterKeys.has(key)) continue;
      waterKeys.delete(key);
      islands.push(inward);
    }
    return {
      water: water.filter((c) => waterKeys.has(waterCellKey(c.col, c.row))),
      gateways,
      islands,
    };
  }

  return { water, gateways, islands };
}

/** The parcel one step toward the middle of the plot. */
function inwardNeighbour(cell: WaterCell, cols: number, rows: number): WaterCell {
  const left = cell.col;
  const right = cols - 1 - cell.col;
  const back = cell.row;
  const front = rows - 1 - cell.row;
  const nearest = Math.min(left, right, back, front);
  if (nearest === left) return { col: cell.col + 1, row: cell.row };
  if (nearest === right) return { col: cell.col - 1, row: cell.row };
  if (nearest === back) return { col: cell.col, row: cell.row + 1 };
  return { col: cell.col, row: cell.row - 1 };
}

// ---------------------------------------------------------------------------
// Navigation — the hand-off to the Vehicles app
// ---------------------------------------------------------------------------

export interface WaterRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WaterNavigation {
  /** Bounding box of every water tile — a boat's `VehicleBounds`. */
  bounds: WaterRect;
  /** Dry parcels inside that box — a boat's `VehicleObstacle[]`. */
  obstacles: WaterRect[];
  /** Surface height, plot-relative metres. A boat's `hoverY` rides this. */
  surfaceY: number;
  /** Nothing to sail on. */
  empty: boolean;
}

/**
 * A boat is a Vehicle whose allowed region is wet.
 *
 * `stepVehiclePose` already clamps to a bounds rectangle and refuses to enter
 * obstacle rectangles, which is exactly enough: the bounds is the water's
 * bounding box and the obstacles are the DRY parcels inside it. Because both
 * water and land are on the same parcel grid, that complement is exact — no
 * polygon clipping, no navmesh, and not one line changes in the vehicle
 * contract. A dry parcel is a rock; the boat bumps it and turns.
 *
 * The rects returned are in the same plot-centred scene metres the vehicle
 * contract uses for `x`/`z`.
 */
export function waterNavigation(
  tiles: readonly WaterTile[],
  config: WaterAppConfig,
  plotSurfaceY = 0
): WaterNavigation {
  const surfaceY = plotSurfaceY + config.levelM;
  if (!tiles.length) {
    return { bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, obstacles: [], surfaceY, empty: true };
  }
  const index = waterTileIndex(tiles);
  const half = WATER_PARCEL_M / 2;
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (const tile of tiles) {
    minCol = Math.min(minCol, tile.col);
    maxCol = Math.max(maxCol, tile.col);
    minRow = Math.min(minRow, tile.row);
    maxRow = Math.max(maxRow, tile.row);
  }
  const lo = waterParcelCenterScene(minCol, minRow);
  const hi = waterParcelCenterScene(maxCol, maxRow);
  const bounds: WaterRect = {
    minX: lo.x - half,
    maxX: hi.x + half,
    minZ: lo.z - half,
    maxZ: hi.z + half,
  };

  const obstacles: WaterRect[] = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      if (index.has(waterCellKey(col, row))) continue;
      const c = waterParcelCenterScene(col, row);
      obstacles.push({ minX: c.x - half, maxX: c.x + half, minZ: c.z - half, maxZ: c.z + half });
    }
  }

  // A bank is dry too. Shrink the outer bounds by the widest shore on the hull so
  // a boat cannot sit half-beached on the ring's outermost bank.
  const shore = tiles.reduce((m, tile) => {
    const geo = waterTileGeometry(tile, index, waterParcelCenterScene(tile.col, tile.row), config);
    return Math.max(m, geo.banks.length ? geo.shoreM : 0);
  }, 0);
  bounds.minX += shore;
  bounds.maxX -= shore;
  bounds.minZ += shore;
  bounds.maxZ -= shore;

  return { bounds, obstacles, surfaceY, empty: false };
}

/**
 * Is this SW-origin scene point over open water, banks excluded?
 *
 * Used for buoyancy, for deciding whether a boat may be launched here, and by
 * the runtime to tell "standing in the shallows" from "standing on the bank".
 */
export function isOverWater(
  x: number,
  z: number,
  tiles: readonly WaterTile[],
  config: WaterAppConfig
): boolean {
  const index = waterTileIndex(tiles);
  const cell = waterCellFromScene(x, z);
  const tile = index.get(waterCellKey(cell.col, cell.row));
  if (!tile) return false;
  const geo = waterTileGeometry(tile, index, waterParcelCenterScene(tile.col, tile.row), config);
  return x >= geo.minX && x <= geo.maxX && z >= geo.minZ && z <= geo.maxZ;
}

// ---------------------------------------------------------------------------
// Summary lines — the panel and the publish review both read these
// ---------------------------------------------------------------------------

export function waterSummaryLine(
  tiles: readonly WaterTile[],
  layout: PlotLayout,
  config: WaterAppConfig
): string {
  if (!tiles.length) return "No water placed yet.";
  const budget = waterParcelBudget(layout, config);
  const counts = new Map<WaterKind, number>();
  for (const tile of tiles) counts.set(tile.spec.kind, (counts.get(tile.spec.kind) ?? 0) + 1);
  const parts = WATER_KINDS.filter((k) => counts.has(k)).map(
    (k) => `${counts.get(k)} ${WATER_KIND_LABELS[k].toLowerCase()}`
  );
  const over = tiles.length > budget ? ` — ${tiles.length - budget} over budget, not drawn` : "";
  return `${tiles.length} of ${budget} parcels wet: ${parts.join(", ")}${over}`;
}
