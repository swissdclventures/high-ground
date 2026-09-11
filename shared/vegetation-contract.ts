/**
 * Vegetation — the one species library the landscaping kit and the Garden share.
 *
 * The kit owns species, variants, seasons, placement and budget. The Garden owns growth
 * and tending. Both read THIS file, so neither invents a tree of its own again (the
 * Central Park South run planted 464 copies of one improvised piece). Canon:
 * docs/city-kit-phase-2-2026-09.md, shelf 1, item 6.
 *
 * Models are Blender-built, seeded and deterministic, like the Garden's grass:
 *   scripts/blender/build-vegetation.py  →  scene/models/vegetation/<file>.glb
 * and every file is on the bundle allowlist by way of `VEGETATION_MODEL_FILES`.
 *
 * Laws:
 *  - Colour is baked into the model. A season is a FILE, never a runtime tint.
 *    Leaf cards share one pale atlas (`vegetation_atlas.png`); the season file only
 *    changes `baseColorFactor`. Winter deciduous trees drop the cards and keep wood.
 *  - Growth is SCALE, so a sapling costs no model of its own. A bush is its own
 *    species — never a tree scaled down (that was the thicket that read as a tiny tree).
 *  - A model swap sets `GltfContainer.src` only when it changes; re-setting the same
 *    value re-instantiates the model (learned on the Garden).
 *  - Every model stays under VEGETATION_MAX_TRIANGLES; the manifest the build writes is
 *    what the tests and the budget meter read.
 *  - Every model is exactly TWO nodes: one merged visible mesh and one `<name>_collider`.
 *    Measured against Decentraland's own Genesis City nature pack on 2026-09-06 — theirs
 *    are built that way, ours were three to eleven nodes, which costs more draw calls
 *    than our lower triangle count saves.
 *  - Height is a SCALE CLASS, not a second set of models. Ours are authored at city
 *    scale, roughly twice the height of Decentraland's own trees; a scene that stands
 *    beside theirs places at `stock` instead.
 */

export const VEGETATION_VERSION = 1 as const;

export type VegetationTreeSpecies = "broad" | "columnar" | "conifer" | "palm" | "bare";
export type VegetationShrubSpecies = "shrub" | "flowering";
export type VegetationSpecies = VegetationTreeSpecies | VegetationShrubSpecies;
export type VegetationSeason = "spring" | "summer" | "autumn" | "winter";
/** Growth stage of a planted tree; the Garden advances it by elapsed time. */
export type VegetationStage = "sapling" | "young" | "mature";

export const VEGETATION_TREE_SPECIES: readonly VegetationTreeSpecies[] = [
  "broad",
  "columnar",
  "conifer",
  "palm",
  "bare",
];
export const VEGETATION_SHRUB_SPECIES: readonly VegetationShrubSpecies[] = ["shrub", "flowering"];
export const VEGETATION_SPECIES: readonly VegetationSpecies[] = [
  ...VEGETATION_TREE_SPECIES,
  ...VEGETATION_SHRUB_SPECIES,
];
export const VEGETATION_SEASONS: readonly VegetationSeason[] = ["spring", "summer", "autumn", "winter"];
export const VEGETATION_STAGES: readonly VegetationStage[] = ["sapling", "young", "mature"];
/** Authored variants per species, so a grove never repeats a silhouette three times in a row. */
export const VEGETATION_VARIANTS = 3;
/** Hard cap per model. The build refuses anything above it; the test pins it. */
export const VEGETATION_MAX_TRIANGLES = 250;
/** Folder under scene/models, and the bundle path prefix. */
export const VEGETATION_MODEL_DIR = "models/vegetation";
export const VEGETATION_MANIFEST_FILE = "manifest.json";
/** Shared leaf-card sheet. Referenced by URI, never embedded — miss it and every canopy is a blank cutout. */
export const VEGETATION_ATLAS_FILE = "vegetation_atlas.png";

export const VEGETATION_SPECIES_LABELS: Record<VegetationSpecies, string> = {
  broad: "Broad round tree",
  columnar: "Columnar tree",
  conifer: "Conifer",
  palm: "Palm",
  bare: "Bare tree",
  shrub: "Rounded bush",
  flowering: "Flowering shrub",
};

/** Mature height per species, metres; variants sit within ±15 %. */
export const VEGETATION_HEIGHT_M: Record<VegetationSpecies, number> = {
  broad: 9,
  columnar: 12,
  conifer: 11,
  palm: 8,
  bare: 8,
  shrub: 1.5,
  flowering: 1.3,
};

/** Footprint radius at scale 1, metres — what the scatter planner keeps clear around a copy. */
export const VEGETATION_RADIUS_M: Record<VegetationSpecies, number> = {
  broad: 3.2,
  columnar: 1.6,
  conifer: 2.4,
  palm: 2.6,
  bare: 2.4,
  shrub: 0.85,
  flowering: 0.75,
};

/** Growth is scale: a sapling is the mature model at a third of its size. */
export const VEGETATION_STAGE_SCALE: Record<VegetationStage, number> = {
  sapling: 0.35,
  young: 0.7,
  mature: 1,
};

/**
 * How tall a copy stands. `city` is the authored height in VEGETATION_HEIGHT_M — these
 * are street and plaza trees for a city block. `stock` matches Decentraland's own trees
 * so ours can stand next to theirs without towering over them.
 */
export type VegetationScaleClass = "city" | "stock";
export const VEGETATION_SCALE_CLASSES: readonly VegetationScaleClass[] = ["city", "stock"];

/**
 * Mature height in metres at `stock` scale — measured from Decentraland's own Genesis
 * City nature pack on 2026-09-06 (TreeSycamore 5.75, TreeTall 6.18, TreePine 5.72,
 * PalmTree 6.73). `bare` has no counterpart in their pack, so it takes the mid of theirs.
 */
export const VEGETATION_STOCK_HEIGHT_M: Record<VegetationSpecies, number> = {
  broad: 5.75,
  columnar: 6.18,
  conifer: 5.7,
  palm: 6.73,
  bare: 5.5,
  /** Genesis City bush-small / bush-green sit around 1.1–1.4 m. */
  shrub: 1.2,
  flowering: 1.1,
};

/** Species whose winter model is bare wood rather than a leaf palette. */
export const VEGETATION_DROPS_LEAVES: Record<VegetationSpecies, boolean> = {
  broad: true,
  columnar: true,
  conifer: false,
  palm: false,
  bare: false,
  shrub: false,
  flowering: false,
};

export function isVegetationSpecies(value: unknown): value is VegetationSpecies {
  return typeof value === "string" && (VEGETATION_SPECIES as readonly string[]).includes(value);
}

export function isVegetationTreeSpecies(value: unknown): value is VegetationTreeSpecies {
  return typeof value === "string" && (VEGETATION_TREE_SPECIES as readonly string[]).includes(value);
}

export function isVegetationShrubSpecies(value: unknown): value is VegetationShrubSpecies {
  return typeof value === "string" && (VEGETATION_SHRUB_SPECIES as readonly string[]).includes(value);
}

export function isVegetationSeason(value: unknown): value is VegetationSeason {
  return typeof value === "string" && (VEGETATION_SEASONS as readonly string[]).includes(value);
}

export function isVegetationStage(value: unknown): value is VegetationStage {
  return typeof value === "string" && (VEGETATION_STAGES as readonly string[]).includes(value);
}

export function isVegetationScaleClass(value: unknown): value is VegetationScaleClass {
  return typeof value === "string" && (VEGETATION_SCALE_CLASSES as readonly string[]).includes(value);
}

/** Scale that takes a species from its authored city height to the requested class. */
export function vegetationScaleFactor(species: VegetationSpecies, scaleClass: VegetationScaleClass = "city"): number {
  if (scaleClass !== "stock") return 1;
  return VEGETATION_STOCK_HEIGHT_M[species] / VEGETATION_HEIGHT_M[species];
}

/**
 * The one number a placed copy gets: growth stage times scale class. Growth is scale and
 * height is scale, so they multiply — never two sets of models.
 */
export function vegetationScale(
  species: VegetationSpecies,
  stage: VegetationStage = "mature",
  scaleClass: VegetationScaleClass = "city"
): number {
  return VEGETATION_STAGE_SCALE[stage] * vegetationScaleFactor(species, scaleClass);
}

/** Variant index 0 … VEGETATION_VARIANTS-1, clamped and wrapped. */
export function clampVegetationVariant(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  return ((n % VEGETATION_VARIANTS) + VEGETATION_VARIANTS) % VEGETATION_VARIANTS;
}

/** `broad-v0-summer.glb` — the file for one species, variant and season. */
export function vegetationModelFile(species: VegetationSpecies, variant: number, season: VegetationSeason): string {
  return `${species}-v${clampVegetationVariant(variant)}-${season}.glb`;
}

/**
 * Builder-viewport URL. The Blender build writes every model TWICE — to
 * `scene/models/vegetation/` for the deploy and to `assets/vegetation/` for the editor,
 * the same two-home pattern the Eclipse Cruiser uses, because Vite serves `assets/` as
 * its public directory and the scene folder is not on any served path.
 */
export function vegetationAssetUrl(species: VegetationSpecies, variant: number, season: VegetationSeason): string {
  return `/vegetation/${vegetationModelFile(species, variant, season)}`;
}

/** Runtime `GltfContainer.src`: bundle-relative, like the Garden's grass. */
export function vegetationModelSrc(species: VegetationSpecies, variant: number, season: VegetationSeason): string {
  return `${VEGETATION_MODEL_DIR}/${vegetationModelFile(species, variant, season)}`;
}

/** Every file the build writes and the bundle must carry — species × 3 variants × 4 seasons. */
export const VEGETATION_MODEL_FILES: readonly string[] = VEGETATION_SPECIES.flatMap((species) =>
  Array.from({ length: VEGETATION_VARIANTS }, (_, variant) =>
    VEGETATION_SEASONS.map((season) => vegetationModelFile(species, variant, season))
  ).flat()
);

/** Bundle-relative paths for the allowlist. */
export const VEGETATION_BUNDLE_FILES: readonly string[] = [
  `${VEGETATION_MODEL_DIR}/${VEGETATION_MANIFEST_FILE}`,
  `${VEGETATION_MODEL_DIR}/${VEGETATION_ATLAS_FILE}`,
  ...VEGETATION_MODEL_FILES.map((file) => `${VEGETATION_MODEL_DIR}/${file}`),
];

/** Parse a file name back into its parts; null for anything that is not a vegetation model. */
export function parseVegetationModelFile(
  file: string
): { species: VegetationSpecies; variant: number; season: VegetationSeason } | null {
  const m = /^([a-z]+)-v(\d+)-([a-z]+)\.glb$/.exec(file.split("/").pop() ?? "");
  if (!m) return null;
  const [, species, variant, season] = m;
  if (!isVegetationSpecies(species) || !isVegetationSeason(season)) return null;
  const v = Number(variant);
  if (!Number.isInteger(v) || v < 0 || v >= VEGETATION_VARIANTS) return null;
  return { species, variant: v, season };
}

/**
 * Season for a date — the one clock the kit and the Garden share. Northern hemisphere
 * meteorological seasons; an owner override on the scene wins over the calendar.
 */
export function vegetationSeasonForDate(date: Date, override?: VegetationSeason | null): VegetationSeason {
  if (override && isVegetationSeason(override)) return override;
  const month = date.getUTCMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

/**
 * One plant standing where somebody put it, as opposed to where the ground-cover
 * planner spread it.
 *
 * ★ It stores a SPECIES, never a file. The season comes from the plot's clock and the
 * growth stage from the plant, so the same row renders as a summer sapling or a winter
 * mature tree without being rewritten — and replacing the model library (a better
 * Blender recipe, a bought asset pack, anything that writes the same file names) changes
 * every placed plant in every scene with no edit to any recipe.
 *
 * Coordinates are the composer frame in metres, plot centre 0,0 — the same frame the
 * scatter planner and the site props use.
 */
export interface PlacedPlant {
  id: string;
  species: VegetationSpecies;
  /** Which authored variant. Absent mixes by id, so two plants of a species differ. */
  variant?: number;
  x: number;
  z: number;
  /** Yaw in degrees. */
  rotationDeg?: number;
  /** Growth stage — scale, not a different model. */
  stage?: VegetationStage;
  /** Extra size multiplier on top of the stage, for one unusually big specimen. */
  scale?: number;
}

/**
 * Sanity bound on one plot's hand-placed plants — NOT the budget.
 *
 * ★★ It was 200, which is a plot-sized number, and a plot is not the only thing that gets
 * planted. Swissverse Capital is 45×45 parcels with 318 trees in its park, so the first
 * attempt to move that park onto this library would have silently dropped 118 of them
 * (`normalizePlacedPlants` slices). The real guard is the triangle budget, which already
 * counts plants at `VEGETATION_MAX_TRIANGLES` each: 2,000 plants is 500 k triangles, 2.5 %
 * of a 2,025-parcel scene's allowance and far past what a small plot could ever afford.
 * So the budget refuses a plot that overplants long before this does, and this only stops
 * a runaway array from being walked.
 */
export const PLACED_PLANT_MAX = 2000;

function plantVariantFor(id: string, variant: number | undefined): number {
  if (typeof variant === "number" && Number.isFinite(variant)) return clampVegetationVariant(variant);
  // Hashed from the id so a row without a variant is stable across loads and two
  // plants placed side by side are not the same silhouette twice.
  let a = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) a = Math.imul(a ^ id.charCodeAt(i), 16777619) >>> 0;
  return (a >>> 8) % VEGETATION_VARIANTS;
}

/** Fill in every optional field. Returns null for a row that names no known species. */
export function normalizePlacedPlant(raw: unknown): PlacedPlant | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isVegetationSpecies(r.species)) return null;
  const id = typeof r.id === "string" && r.id.trim() ? r.id.trim().slice(0, 64) : "plant";
  const num = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  return {
    id,
    species: r.species,
    variant: plantVariantFor(id, typeof r.variant === "number" ? r.variant : undefined),
    x: num(r.x, 0),
    z: num(r.z, 0),
    rotationDeg: num(r.rotationDeg, 0),
    stage: isVegetationStage(r.stage) ? r.stage : "mature",
    scale: Math.min(4, Math.max(0.1, num(r.scale, 1))),
  };
}

export function normalizePlacedPlants(raw: unknown): PlacedPlant[] {
  if (!Array.isArray(raw)) return [];
  const out: PlacedPlant[] = [];
  const seen = new Set<string>();
  for (const row of raw.slice(0, PLACED_PLANT_MAX)) {
    const plant = normalizePlacedPlant(row);
    if (!plant || seen.has(plant.id)) continue;
    seen.add(plant.id);
    out.push(plant);
  }
  return out;
}

/** Everything a renderer needs for one placed plant, in either frame. */
export function placedPlantPose(
  plant: PlacedPlant,
  season: VegetationSeason,
  scaleClass?: unknown,
): { src: string; file: string; scale: number; yawDeg: number } {
  const variant = plantVariantFor(plant.id, plant.variant);
  const stage = plant.stage ?? "mature";
  const growth = VEGETATION_STAGE_SCALE[stage] ?? 1;
  return {
    src: vegetationModelSrc(plant.species, variant, season),
    file: vegetationModelFile(plant.species, variant, season),
    scale: growth * (plant.scale ?? 1),
    yawDeg: plant.rotationDeg ?? 0,
  };
}

/** One row of the manifest the Blender build writes next to the models. */
export interface VegetationManifestRow {
  file: string;
  species: VegetationSpecies;
  variant: number;
  season: VegetationSeason;
  /** Visible triangles. The collider's are counted separately and are not drawn. */
  triangles: number;
  colliderTriangles?: number;
  /** Always 2: the merged visible mesh and its collider. */
  nodes?: number;
  heightM: number;
}

export interface VegetationManifest {
  version: number;
  models: VegetationManifestRow[];
}

/** Manifest sanity: every expected file present, nothing over the cap, nothing extra. */
export function vegetationManifestIssues(manifest: VegetationManifest | null | undefined): string[] {
  const issues: string[] = [];
  if (!manifest || !Array.isArray(manifest.models)) return ["manifest missing or malformed"];
  const seen = new Map(manifest.models.map((row) => [row.file, row] as const));
  for (const file of VEGETATION_MODEL_FILES) {
    const row = seen.get(file);
    if (!row) {
      issues.push(`${file}: missing from the manifest`);
      continue;
    }
    if (!(row.triangles > 0)) issues.push(`${file}: no triangles`);
    if (row.triangles > VEGETATION_MAX_TRIANGLES) {
      issues.push(`${file}: ${row.triangles} triangles, cap is ${VEGETATION_MAX_TRIANGLES}`);
    }
    if (row.nodes !== undefined && row.nodes !== 2) {
      issues.push(`${file}: ${row.nodes} nodes, every model is one mesh plus one collider`);
    }
    if (row.colliderTriangles !== undefined && !(row.colliderTriangles > 0)) {
      issues.push(`${file}: no collider`);
    }
    const parsed = parseVegetationModelFile(file);
    if (parsed && (parsed.species !== row.species || parsed.variant !== row.variant || parsed.season !== row.season)) {
      issues.push(`${file}: manifest row disagrees with the file name`);
    }
  }
  for (const row of manifest.models) {
    if (!VEGETATION_MODEL_FILES.includes(row.file)) issues.push(`${row.file}: not a file the contract knows`);
  }
  return issues;
}

/** Triangles for N copies of a model, the number the scatter governor multiplies. */
export function vegetationTriangles(manifest: VegetationManifest, file: string, copies: number): number {
  const row = manifest.models.find((r) => r.file === file);
  return (row?.triangles ?? VEGETATION_MAX_TRIANGLES) * Math.max(0, Math.floor(copies));
}
