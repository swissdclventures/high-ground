/**
 * Terrain — artificial land, so a scene can have a ground that is not y = 0.
 *
 * WHY THIS EXISTS. Decentraland puts a solid walkable floor at y = 0 that no scene
 * can dig through (`app/src/scene/site-ground.ts`: the site ground is "VISUAL ONLY
 * — no collider. Decentraland gives every scene an implicit walkable floor at
 * y=0."). So you cannot excavate. Every hollow — a canyon, a basin you can wade
 * into, a room under a city — has to be made by RAISING the land around it and
 * leaving the floor where it already is.
 *
 * That single move pays for three things at once, which is why terrain is its own
 * layer and not a corner of the Water app:
 *
 *   canyon      parcels left at 0 while the plot around them stands at +24; the
 *               wall between them is derived, not built
 *   undercity   the volume beneath a raised parcel — the same volume as a canyon,
 *               with a plate over your head instead of the sky
 *   water       a basin cut into raised land has a bottom WE own, above y = 0, so
 *               for the first time you can walk into it
 *
 * ‼️REGIONS, NOT PARCELS. The heights are stored as a plot-wide ground level plus
 * a short list of RECTANGLES that override it. A canyon is ONE region: move it by
 * changing two numbers, widen it by changing one, delete it with one call. The
 * per-parcel alternative would have meant ~230 entries to carve one canyon out of
 * a 16 x 16 plot, and every edit would have been a rewrite. Parcel heights are
 * DERIVED here and never stored, so nothing needs migrating when the shape
 * changes.
 *
 * ‼️LAST ONE WINS. Regions are resolved in array order, so a later region cuts
 * through an earlier one. That is what makes editing cheap: to put a shaft in the
 * middle of a mesa you append a region, you do not recompute the mesa.
 *
 * HEIGHT IS LAND (the scale law): DCL caps a scene at `log2(parcels + 1) x 20`
 * metres measured FROM y = 0 UP. Raising the ground spends that budget before a
 * single building starts, so `terrainBudget()` reports what is left and the
 * Builder refuses a datum that leaves no room to build.
 */

export const TERRAIN_VERSION = 1 as const;

/** A parcel is 16 m here as everywhere else. */
export const TERRAIN_PARCEL_M = 16;

/**
 * Ground levels the Builder will accept.
 *
 * The floor is 0 — the natural ground, and the value every existing scene has by
 * omission. The ceiling is deliberately generous: an undercity wants ~24 m of
 * headroom and a canyon reads as a canyon at about the same, but the real limit is
 * the scene's own height budget, which `terrainBudget()` enforces per plot.
 */
export const TERRAIN_GROUND_MIN_M = 0;
export const TERRAIN_GROUND_MAX_M = 60;

/**
 * Headroom a level needs to be worth standing in.
 *
 * Below this a "canyon" is a ditch and an "undercity" is a crawlspace. Used to
 * warn, never to block — a 1.5 m ledge is a legitimate thing to build.
 */
export const TERRAIN_LIVABLE_HEADROOM_M = 3;

export const TERRAIN_REGION_KINDS = ["carve", "raise"] as const;
export type TerrainRegionKind = (typeof TERRAIN_REGION_KINDS)[number];

export interface TerrainRegion {
  /** Stable handle. This is what an edit addresses, so it must survive a move. */
  id: string;
  /** Owner-facing name: "canyon", "harbour", "east bluff". */
  name: string;
  /**
   * `carve` drops the parcels to `heightM` (a canyon, a harbour, a light well);
   * `raise` lifts them (a mesa, a bluff, a plinth). The two behave identically —
   * the kind is kept because it says INTENT, and a tool that reads back "carve
   * canyon to 0" is legible in a way that "set canyon to 0" is not.
   */
  kind: TerrainRegionKind;
  /** Inclusive parcel bounds, plot grid, SW origin. */
  minCol: number;
  minRow: number;
  maxCol: number;
  maxRow: number;
  /** Absolute walkable height for these parcels, metres above y = 0. */
  heightM: number;
}

export interface TerrainConfig {
  enabled: boolean;
  /**
   * The plot's ground level. 0 is Decentraland's own floor and the default, so a
   * scene that never touches terrain behaves exactly as it always has.
   */
  groundHeightM: number;
  /** Overrides, resolved in order. Later wins. */
  regions: TerrainRegion[];
}

export function defaultTerrainConfig(): TerrainConfig {
  return { enabled: false, groundHeightM: 0, regions: [] };
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

function int(value: unknown, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return n;
}

export function isTerrainRegionKind(value: unknown): value is TerrainRegionKind {
  return typeof value === "string" && (TERRAIN_REGION_KINDS as readonly string[]).includes(value);
}

export function normalizeTerrainRegion(raw: unknown, index = 0): TerrainRegion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<TerrainRegion>;
  const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : `region_${index + 1}`;
  // Bounds are normalised so min is always <= max: a tool that names two opposite
  // corners in any order still gets the rectangle it meant.
  const c1 = int(r.minCol, 0);
  const c2 = int(r.maxCol, c1);
  const r1 = int(r.minRow, 0);
  const r2 = int(r.maxRow, r1);
  return {
    id,
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : id,
    kind: isTerrainRegionKind(r.kind) ? r.kind : "carve",
    minCol: Math.min(c1, c2),
    maxCol: Math.max(c1, c2),
    minRow: Math.min(r1, r2),
    maxRow: Math.max(r1, r2),
    heightM: num(r.heightM, 0, TERRAIN_GROUND_MIN_M, TERRAIN_GROUND_MAX_M),
  };
}

export function normalizeTerrainConfig(raw: unknown): TerrainConfig {
  const base = defaultTerrainConfig();
  if (!raw || typeof raw !== "object") return base;
  const partial = raw as Partial<TerrainConfig>;
  const regions: TerrainRegion[] = [];
  const seen = new Set<string>();
  if (Array.isArray(partial.regions)) {
    for (const [i, row] of partial.regions.entries()) {
      const region = normalizeTerrainRegion(row, i);
      if (!region) continue;
      // A duplicate id would make `update_region` ambiguous, and the whole edit
      // story rests on an id addressing exactly one rectangle.
      if (seen.has(region.id)) continue;
      seen.add(region.id);
      regions.push(region);
    }
  }
  return {
    enabled: partial.enabled === true,
    groundHeightM: num(partial.groundHeightM, base.groundHeightM, TERRAIN_GROUND_MIN_M, TERRAIN_GROUND_MAX_M),
    regions,
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface TerrainLayout {
  cols: number;
  rows: number;
}

function inRegion(region: TerrainRegion, col: number, row: number): boolean {
  return col >= region.minCol && col <= region.maxCol && row >= region.minRow && row <= region.maxRow;
}

/**
 * The walkable height of one parcel: the ground level, then every region that
 * covers it in order, last one winning.
 *
 * Deliberately a plain scan rather than a cached grid. A plot has at most a few
 * regions, and a derived value that can go stale is the exact failure this model
 * exists to avoid.
 */
export function terrainHeightAt(config: TerrainConfig, col: number, row: number): number {
  if (!config.enabled) return 0;
  let height = config.groundHeightM;
  for (const region of config.regions) {
    if (inRegion(region, col, row)) height = region.heightM;
  }
  return height;
}

/** Every distinct height in play, lowest first. The legend a viewport or a tool prints. */
export function terrainLevels(config: TerrainConfig, layout: TerrainLayout): number[] {
  const out = new Set<number>();
  const cols = Math.max(1, Math.round(layout.cols));
  const rows = Math.max(1, Math.round(layout.rows));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) out.add(terrainHeightAt(config, col, row));
  }
  return [...out].sort((a, b) => a - b);
}

export const TERRAIN_EDGES = ["-x", "+x", "-z", "+z"] as const;
export type TerrainEdge = (typeof TERRAIN_EDGES)[number];

const EDGE_STEP: Record<TerrainEdge, { col: number; row: number }> = {
  "-x": { col: -1, row: 0 },
  "+x": { col: 1, row: 0 },
  "-z": { col: 0, row: -1 },
  "+z": { col: 0, row: 1 },
};

export interface TerrainWall {
  col: number;
  row: number;
  edge: TerrainEdge;
  /** Height of this parcel. */
  topM: number;
  /** Height on the other side — the plot's own ground beyond the edge of the plot. */
  bottomM: number;
  /** Always positive. `topM - bottomM`. */
  dropM: number;
}

/**
 * Every face where the ground steps down.
 *
 * THIS IS THE CANYON. Nobody models a canyon wall: a wall is what a height
 * difference between two neighbouring parcels IS, so carving a band to 0 through
 * a plot standing at 24 produces two 24 m faces the moment the region exists. The
 * same function gives a mesa its cliff, a terrace its retaining wall, and the plot
 * its coastline, because off-plot counts as ground level.
 *
 * Only DOWNWARD faces are returned, each owned by the higher parcel — otherwise
 * every wall would be reported twice, once from each side.
 */
export function terrainWalls(config: TerrainConfig, layout: TerrainLayout): TerrainWall[] {
  if (!config.enabled) return [];
  const cols = Math.max(1, Math.round(layout.cols));
  const rows = Math.max(1, Math.round(layout.rows));
  const walls: TerrainWall[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const topM = terrainHeightAt(config, col, row);
      for (const edge of TERRAIN_EDGES) {
        const step = EDGE_STEP[edge];
        const nc = col + step.col;
        const nr = row + step.row;
        const offPlot = nc < 0 || nc >= cols || nr < 0 || nr >= rows;
        // Beyond the plot there is no artificial land, only Decentraland's floor.
        // That is what turns a raised plot into an island with a coast.
        const bottomM = offPlot ? 0 : terrainHeightAt(config, nc, nr);
        if (topM - bottomM <= 0.001) continue;
        walls.push({ col, row, edge, topM, bottomM, dropM: topM - bottomM });
      }
    }
  }
  return walls;
}

// ---------------------------------------------------------------------------
// Solids — the boxes that get drawn, as data
// ---------------------------------------------------------------------------

/**
 * Plate thickness: thin enough that a 24 m datum still leaves 24 m of headroom
 * under it, thick enough to read as ground rather than paper from the canyon
 * floor, and two orders of magnitude clear of the 5 mm coplanar floor.
 */
export const TERRAIN_PLATE_THICKNESS_M = 0.5;
/**
 * Walls stand PROUD of the parcel line by this much. Flush with the plate own
 * edge face they would share a plane with it, and the explorer depth buffer picks
 * per fragment — the coplanar flicker, at canyon scale, on the most visible
 * surface in the scene.
 */
export const TERRAIN_WALL_PROUD_M = 0.02;
export const TERRAIN_WALL_THICKNESS_M = 0.4;

export interface TerrainSolid {
  kind: "plate" | "wall";
  /** Centre, DCL scene metres, SW origin — the frame the runtime uses. */
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  col: number;
  row: number;
}

/**
 * Every box the world needs, as plain data.
 *
 * The runtime turns these into entities and nothing else; keeping the arithmetic
 * here is what lets a test assert that a plate top lands exactly on its parcel
 * height and that a wall reaches the ground beside it without a gap or an
 * overlap. Getting either wrong is a hole you fall through.
 */
export function terrainSolids(config: TerrainConfig, layout: TerrainLayout): TerrainSolid[] {
  if (!config.enabled) return [];
  const cols = Math.max(1, Math.round(layout.cols));
  const rows = Math.max(1, Math.round(layout.rows));
  const half = TERRAIN_PARCEL_M / 2;
  const out: TerrainSolid[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const height = terrainHeightAt(config, col, row);
      // A parcel at ground level IS the canyon floor. Decentraland already puts a
      // walkable surface there, so a plate would only fight it for the same plane.
      if (height <= 0) continue;
      out.push({
        kind: "plate",
        x: (col + 0.5) * TERRAIN_PARCEL_M,
        y: height - TERRAIN_PLATE_THICKNESS_M / 2,
        z: (row + 0.5) * TERRAIN_PARCEL_M,
        width: TERRAIN_PARCEL_M,
        height: TERRAIN_PLATE_THICKNESS_M,
        depth: TERRAIN_PARCEL_M,
        col,
        row,
      });
    }
  }

  for (const wall of terrainWalls(config, layout)) {
    const cx = (wall.col + 0.5) * TERRAIN_PARCEL_M;
    const cz = (wall.row + 0.5) * TERRAIN_PARCEL_M;
    // The face runs from the lower ground up to the UNDERSIDE of the plate; the
    // plate itself closes the last half metre. Overlapping them instead would put
    // two surfaces on one plane at the top of every cliff.
    const top = wall.topM - TERRAIN_PLATE_THICKNESS_M;
    const height = top - wall.bottomM;
    if (height <= 0.01) continue;
    const y = wall.bottomM + height / 2;
    const out_ = half + TERRAIN_WALL_PROUD_M - TERRAIN_WALL_THICKNESS_M / 2;
    const horizontal = wall.edge === "-x" || wall.edge === "+x";
    const sign = wall.edge === "+x" || wall.edge === "+z" ? 1 : -1;
    out.push({
      kind: "wall",
      x: horizontal ? cx + sign * out_ : cx,
      y,
      z: horizontal ? cz : cz + sign * out_,
      width: horizontal ? TERRAIN_WALL_THICKNESS_M : TERRAIN_PARCEL_M,
      height,
      depth: horizontal ? TERRAIN_PARCEL_M : TERRAIN_WALL_THICKNESS_M,
      col: wall.col,
      row: wall.row,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Budget — height is land
// ---------------------------------------------------------------------------

/** Decentraland's scene ceiling: log2(parcels + 1) x 20 m, measured from y = 0 up. */
export function terrainSceneCeilingM(layout: TerrainLayout): number {
  const parcels = Math.max(1, Math.round(layout.cols)) * Math.max(1, Math.round(layout.rows));
  return Math.log2(parcels + 1) * 20;
}

export interface TerrainBudget {
  ceilingM: number;
  /** The highest walkable surface anywhere on the plot. */
  highestGroundM: number;
  /** What is left above it to actually build in. */
  buildableM: number;
  /** The deepest step down anywhere — the tallest canyon or cliff face. */
  deepestDropM: number;
  /** True when the datum has eaten so much of the ceiling that nothing fits on it. */
  overspent: boolean;
}

/**
 * What raising the ground costs.
 *
 * The ceiling is measured from y = 0, not from the new ground, so a 24 m datum on
 * an 8 x 8 plot leaves 96 m of the 120 m envelope. This is the number that decides
 * how deep a canyon can be, and it is why canyon depth and plot size have to be
 * chosen together.
 */
export function terrainBudget(config: TerrainConfig, layout: TerrainLayout): TerrainBudget {
  const ceilingM = terrainSceneCeilingM(layout);
  const levels = config.enabled ? terrainLevels(config, layout) : [0];
  const highestGroundM = levels.length ? levels[levels.length - 1] : 0;
  const walls = terrainWalls(config, layout);
  const deepestDropM = walls.reduce((m, w) => Math.max(m, w.dropM), 0);
  const buildableM = ceilingM - highestGroundM;
  return {
    ceilingM,
    highestGroundM,
    buildableM,
    deepestDropM,
    // One storey is the honest floor: a datum that leaves less than that has
    // spent the whole scene on its own plinth.
    overspent: buildableM < 3,
  };
}

// ---------------------------------------------------------------------------
// Region editing — the operations the MCP tools and the panel both call
// ---------------------------------------------------------------------------

export function nextTerrainRegionId(existing: readonly TerrainRegion[], hint = "region"): string {
  const slug = hint.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "region";
  const used = new Set(existing.map((r) => r.id));
  if (!used.has(slug)) return slug;
  for (let i = 2; i < 10_000; i += 1) {
    const id = `${slug}_${i}`;
    if (!used.has(id)) return id;
  }
  return `${slug}_${Date.now().toString(36)}`;
}

/** Clamp a rectangle to the plot. Returns null when it lands entirely off it. */
export function clampTerrainRegion(region: TerrainRegion, layout: TerrainLayout): TerrainRegion | null {
  const cols = Math.max(1, Math.round(layout.cols));
  const rows = Math.max(1, Math.round(layout.rows));
  const minCol = Math.max(0, Math.min(cols - 1, region.minCol));
  const maxCol = Math.max(0, Math.min(cols - 1, region.maxCol));
  const minRow = Math.max(0, Math.min(rows - 1, region.minRow));
  const maxRow = Math.max(0, Math.min(rows - 1, region.maxRow));
  if (region.maxCol < 0 || region.minCol > cols - 1) return null;
  if (region.maxRow < 0 || region.minRow > rows - 1) return null;
  return { ...region, minCol, maxCol, minRow, maxRow };
}

export function addTerrainRegion(config: TerrainConfig, region: TerrainRegion): TerrainConfig {
  return { ...config, enabled: true, regions: [...config.regions, region] };
}

/**
 * Change one region in place, by id.
 *
 * THE EDIT PATH. Order is preserved deliberately: a region that was cutting
 * through another must keep doing so after it is moved, and re-appending it would
 * silently change what wins where it overlaps.
 */
export function updateTerrainRegion(
  config: TerrainConfig,
  id: string,
  patch: Partial<Omit<TerrainRegion, "id">>
): TerrainConfig {
  return {
    ...config,
    regions: config.regions.map((region) =>
      region.id === id ? normalizeTerrainRegion({ ...region, ...patch }) ?? region : region
    ),
  };
}

export function removeTerrainRegion(config: TerrainConfig, id: string): TerrainConfig {
  return { ...config, regions: config.regions.filter((region) => region.id !== id) };
}

export function terrainRegionById(config: TerrainConfig, id: string): TerrainRegion | undefined {
  return config.regions.find((region) => region.id === id);
}

/**
 * A band straight across the plot — the canyon shorthand.
 *
 * The owner's own scenario was "split the world in half with a canyon across the
 * centre", and asking for four parcel indices to say that is the kind of friction
 * that stops a tool being used. Width is in PARCELS because the grid is, and an
 * even width straddles the middle rather than sitting one parcel off it.
 */
export function terrainBandRegion(
  layout: TerrainLayout,
  options: {
    id: string;
    name?: string;
    axis: "ew" | "ns";
    widthParcels?: number;
    heightM?: number;
    /** 0..1 across the plot; 0.5 is the centre. */
    at?: number;
  }
): TerrainRegion {
  const cols = Math.max(1, Math.round(layout.cols));
  const rows = Math.max(1, Math.round(layout.rows));
  const width = Math.max(1, Math.round(options.widthParcels ?? 2));
  const at = Math.max(0, Math.min(1, options.at ?? 0.5));
  const heightM = num(options.heightM ?? 0, 0, TERRAIN_GROUND_MIN_M, TERRAIN_GROUND_MAX_M);
  const name = options.name ?? options.id;

  if (options.axis === "ew") {
    // Runs east-west, so it spans every column and occupies a band of rows.
    const centre = Math.round(at * (rows - 1));
    const minRow = Math.max(0, centre - Math.floor((width - 1) / 2));
    return {
      id: options.id,
      name,
      kind: "carve",
      minCol: 0,
      maxCol: cols - 1,
      minRow,
      maxRow: Math.min(rows - 1, minRow + width - 1),
      heightM,
    };
  }
  const centre = Math.round(at * (cols - 1));
  const minCol = Math.max(0, centre - Math.floor((width - 1) / 2));
  return {
    id: options.id,
    name,
    kind: "carve",
    minCol,
    maxCol: Math.min(cols - 1, minCol + width - 1),
    minRow: 0,
    maxRow: rows - 1,
    heightM,
  };
}

// ---------------------------------------------------------------------------
// Readback
// ---------------------------------------------------------------------------

export function terrainSummaryLine(config: TerrainConfig, layout: TerrainLayout): string {
  if (!config.enabled) return "Terrain off — the ground is Decentraland's own floor at 0 m.";
  const budget = terrainBudget(config, layout);
  const parts = [`ground ${config.groundHeightM} m`];
  if (config.regions.length) {
    parts.push(
      config.regions
        .map((r) => `${r.name} ${r.kind === "carve" ? "down to" : "up to"} ${r.heightM} m`)
        .join(", ")
    );
  }
  parts.push(`${budget.buildableM.toFixed(0)} m left of the ${budget.ceilingM.toFixed(0)} m ceiling`);
  if (budget.deepestDropM > 0) parts.push(`tallest face ${budget.deepestDropM.toFixed(0)} m`);
  return parts.join(" · ");
}

export interface TerrainWarning {
  code: "overspent" | "shallow_level" | "off_plot" | "no_regions";
  message: string;
}

/**
 * What a tool should say back before the owner publishes.
 *
 * Warnings, never refusals. A 1.5 m step is a legitimate ledge and a terrain with
 * no regions is a legitimate plinth; only the height budget is a real wall, and
 * even that is the Builder's to enforce rather than this file's.
 */
export function terrainWarnings(config: TerrainConfig, layout: TerrainLayout): TerrainWarning[] {
  if (!config.enabled) return [];
  const out: TerrainWarning[] = [];
  const budget = terrainBudget(config, layout);
  if (budget.overspent) {
    out.push({
      code: "overspent",
      message:
        `The ground stands at ${budget.highestGroundM} m and this plot's ceiling is ` +
        `${budget.ceilingM.toFixed(0)} m, so there is only ${budget.buildableM.toFixed(1)} m ` +
        `left to build in. Lower the ground or take more parcels.`,
    });
  }
  const cols = Math.max(1, Math.round(layout.cols));
  const rows = Math.max(1, Math.round(layout.rows));
  for (const region of config.regions) {
    if (region.maxCol < 0 || region.minCol > cols - 1 || region.maxRow < 0 || region.minRow > rows - 1) {
      out.push({ code: "off_plot", message: `"${region.name}" lies entirely off the plot and does nothing.` });
    }
  }
  const walls = terrainWalls(config, layout);
  const drops = walls.filter((w) => w.dropM > 0.001 && w.dropM < TERRAIN_LIVABLE_HEADROOM_M);
  if (drops.length && config.regions.length) {
    out.push({
      code: "shallow_level",
      message:
        `The shallowest step is under ${TERRAIN_LIVABLE_HEADROOM_M} m. That reads as a ledge ` +
        `rather than somewhere you can stand — raise the ground or deepen the region if it was meant to be walkable.`,
    });
  }
  if (config.groundHeightM > 0 && !config.regions.length) {
    out.push({
      code: "no_regions",
      message:
        `The whole plot is raised to ${config.groundHeightM} m with nothing carved into it, ` +
        `so it is a plinth. Carve a region to make a canyon, a harbour or a way down.`,
    });
  }
  return out;
}
