/**
 * Ground cover — the plants that live BETWEEN the grass.
 *
 * The lawn is a grid of cells that grows and mows. This is the other half of a
 * garden: clover, dandelions, daisies, ferns and tall meadow grass, scattered over
 * a bed and standing still while the lawn changes around them.
 *
 * Fifteen models, five species × three variants, all sharing ONE atlas
 * (`garden_groundcover_atlas.png`, rendered by scripts/blender/build-groundcover-atlas.py
 * from the UV slots the models themselves declare). 885 visible triangles for the set.
 *
 * Laws carried from the lawn, each paid for once:
 *  - A model swap sets `GltfContainer.src` only when it CHANGES; re-setting the same
 *    value re-instantiates the GLB in the Explorer.
 *  - Placement is deterministic from a seed, so a bed looks the same to everyone and
 *    survives a reload without storing a single coordinate.
 *  - Variety comes from genuinely random yaw, not from more models. 576 identical
 *    lawn cells read as a grid until they were turned through the full circle.
 *
 * ★ COLLISION IS A RUNTIME FLAG, NOT A PROPERTY OF THE FILE. Every model ships a
 * 12-triangle `*_collider` node, and whether it stops a player is decided here per
 * species: you walk THROUGH clover and daisies, and AROUND a fern. One asset serves
 * both, so nothing has to be re-exported when the answer changes.
 */

export const GROUND_COVER_VERSION = 1 as const;

export type GroundCoverSpecies = "clover" | "dandelion" | "daisy" | "fern" | "meadow";

export const GROUND_COVER_SPECIES: readonly GroundCoverSpecies[] = [
  "clover",
  "dandelion",
  "daisy",
  "fern",
  "meadow",
];

/** Authored variants per species. */
export const GROUND_COVER_VARIANTS = 3;

/** Folder under scene/models, and the bundle path prefix. */
export const GROUND_COVER_MODEL_DIR = "models/garden";
export const GROUND_COVER_ATLAS_FILE = "garden_groundcover_atlas.png";

export interface GroundCoverSpec {
  id: GroundCoverSpecies;
  label: string;
  /** File stem; the variant suffix and extension are added by groundCoverModelFile. */
  stem: string;
  /** Tallest variant, metres — what the console shows and the planner spaces by. */
  heightM: number;
  /** Footprint radius, metres. The planner keeps this clear around each plant. */
  radiusM: number;
  /** Visible triangles per plant, measured from the delivered models. */
  triangles: number;
  /**
   * Does a player walk around it? You walk through a lawn and its flowers; a fern is
   * a shrub and stops you. Nothing here re-exports when this changes — it is a
   * collision mask on the entity.
   */
  collides: boolean;
}

export const GROUND_COVER: Record<GroundCoverSpecies, GroundCoverSpec> = {
  clover: {
    id: "clover",
    label: "Clover",
    stem: "clover_patch",
    heightM: 0.08,
    radiusM: 0.34,
    triangles: 40,
    collides: false,
  },
  dandelion: {
    id: "dandelion",
    label: "Dandelion",
    stem: "dandelion_clump",
    heightM: 0.24,
    radiusM: 0.24,
    triangles: 50,
    collides: false,
  },
  daisy: {
    id: "daisy",
    label: "Daisy",
    stem: "daisy_cluster",
    heightM: 0.18,
    radiusM: 0.24,
    triangles: 45,
    collides: false,
  },
  fern: {
    id: "fern",
    label: "Fern",
    stem: "fern",
    heightM: 0.41,
    radiusM: 0.38,
    triangles: 90,
    // The one that stops you. A fern reads as a shrub, and walking through it looks
    // like a bug in a way that walking through daisies never does.
    collides: true,
  },
  meadow: {
    id: "meadow",
    label: "Meadow grass",
    stem: "tall_meadow_grass",
    heightM: 0.84,
    radiusM: 0.30,
    triangles: 70,
    collides: false,
  },
};

/** How thickly a bed is planted. */
export type GroundCoverDensity = "none" | "sparse" | "normal" | "lush";

export const GROUND_COVER_DENSITIES: readonly GroundCoverDensity[] = ["none", "sparse", "normal", "lush"];

/**
 * Plants per square metre at each density.
 *
 * A 16 m bed is 256 m², so "normal" is about 92 plants on one bed and 828 across a
 * nine-bed plot. Measured against the budget: at ~59 visible triangles a plant that
 * is 49,000 triangles, which with the lawn's 38,016 would exceed a nine-parcel plot.
 * The planner therefore caps by budget as well as by density, and the cap is what
 * actually decides on a full plot — see planGroundCover.
 */
export const GROUND_COVER_PER_SQM: Record<GroundCoverDensity, number> = {
  none: 0,
  sparse: 0.12,
  normal: 0.36,
  lush: 0.8,
};

export const GROUND_COVER_DENSITY_LABELS: Record<GroundCoverDensity, string> = {
  none: "Bare",
  sparse: "Sparse",
  normal: "Planted",
  lush: "Lush",
};

export function isGroundCoverSpecies(value: unknown): value is GroundCoverSpecies {
  return typeof value === "string" && (GROUND_COVER_SPECIES as readonly string[]).includes(value);
}

export function isGroundCoverDensity(value: unknown): value is GroundCoverDensity {
  return typeof value === "string" && (GROUND_COVER_DENSITIES as readonly string[]).includes(value);
}

/** `clover_patch_v2.glb` — one species and variant. */
export function groundCoverModelFile(species: GroundCoverSpecies, variant: number): string {
  const v = ((Math.floor(variant) % GROUND_COVER_VARIANTS) + GROUND_COVER_VARIANTS) % GROUND_COVER_VARIANTS;
  return `${GROUND_COVER[species].stem}_v${v + 1}.glb`;
}

/** Runtime `GltfContainer.src`, bundle-relative. */
export function groundCoverModelSrc(species: GroundCoverSpecies, variant: number): string {
  return `${GROUND_COVER_MODEL_DIR}/${groundCoverModelFile(species, variant)}`;
}

/** Builder-viewport URL; `assets/garden` mirrors the models for the editor. */
export function groundCoverAssetUrl(species: GroundCoverSpecies, variant: number): string {
  return `/garden/${groundCoverModelFile(species, variant)}`;
}

/** Every file the bundle must carry: fifteen models and the one atlas they share. */
export const GROUND_COVER_MODEL_FILES: readonly string[] = GROUND_COVER_SPECIES.flatMap((species) =>
  Array.from({ length: GROUND_COVER_VARIANTS }, (_, v) => groundCoverModelFile(species, v))
);

export const GROUND_COVER_BUNDLE_FILES: readonly string[] = [
  ...GROUND_COVER_MODEL_FILES.map((file) => `${GROUND_COVER_MODEL_DIR}/${file}`),
  `${GROUND_COVER_MODEL_DIR}/${GROUND_COVER_ATLAS_FILE}`,
];

/**
 * A 32-bit integer mixer, the same one the lawn uses.
 *
 * ‼️ NOT `sin(x*a + z*b) * c`. That one-liner is fine per pixel and wrong on a
 * lattice: sampled across one bed it came out mirror-symmetric about the centre,
 * and every cell had a twin wearing the same angle. See shared/garden-wind.ts.
 */
function mixInt(value: number): number {
  let h = value | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) | 0;
}

function rand01(seed: number, index: number, salt: number): number {
  const h = mixInt(mixInt((seed | 0) + 0x7ed55d16) ^ ((index * 0x9e3779b9 + salt) | 0));
  return (h >>> 0) / 4294967296;
}

export interface GroundCoverPlant {
  species: GroundCoverSpecies;
  variant: number;
  /** Bed-local metres, origin at the bed's centre. */
  localX: number;
  localZ: number;
  yawDeg: number;
  scale: number;
}

export interface GroundCoverPlan {
  plants: GroundCoverPlant[];
  triangles: number;
  /** True when the triangle budget stopped the planner before the density did. */
  cappedByBudget: boolean;
}

/**
 * Plan one bed's ground cover: deterministic, budget-capped, never overlapping the
 * previous plant it happened to land beside.
 *
 * Nothing is stored. The same bed, seed and settings give the same garden on every
 * client and after every reload, which is what lets a plot carry hundreds of plants
 * without a row in a table for any of them.
 */
export function planGroundCover(
  widthM: number,
  depthM: number,
  density: GroundCoverDensity,
  species: readonly GroundCoverSpecies[],
  seed: number,
  triangleBudget: number
): GroundCoverPlan {
  const kinds = species.filter(isGroundCoverSpecies);
  const perSqm = GROUND_COVER_PER_SQM[density] ?? 0;
  if (!kinds.length || perSqm <= 0 || widthM <= 0 || depthM <= 0) {
    return { plants: [], triangles: 0, cappedByBudget: false };
  }

  const wanted = Math.max(0, Math.round(widthM * depthM * perSqm));
  const plants: GroundCoverPlant[] = [];
  let triangles = 0;
  let cappedByBudget = false;

  for (let i = 0; i < wanted; i += 1) {
    const kind = kinds[Math.floor(rand01(seed, i, 11) * kinds.length) % kinds.length];
    const spec = GROUND_COVER[kind];
    if (triangles + spec.triangles > triangleBudget) {
      cappedByBudget = true;
      break;
    }
    const scale = 0.82 + rand01(seed, i, 29) * 0.42;
    const x = (rand01(seed, i, 3) - 0.5) * widthM;
    const z = (rand01(seed, i, 7) - 0.5) * depthM;

    // Keep plants off each other. Checking every previous plant is O(n²) and a bed
    // holds a few hundred, so this stays cheap; the alternative is a grid, and a
    // grid is exactly what made the lawn read as a pattern.
    let clear = true;
    for (const other of plants) {
      const need = (spec.radiusM * scale + GROUND_COVER[other.species].radiusM * other.scale) * 0.55;
      const dx = other.localX - x;
      const dz = other.localZ - z;
      if (dx * dx + dz * dz < need * need) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;

    plants.push({
      species: kind,
      variant: Math.floor(rand01(seed, i, 17) * GROUND_COVER_VARIANTS),
      localX: x,
      localZ: z,
      // THE FULL CIRCLE. Fifteen models over hundreds of plants only escape being a
      // pattern if each one faces a genuinely different way.
      yawDeg: rand01(seed, i, 23) * 360,
      scale,
    });
    triangles += spec.triangles;
  }

  return { plants, triangles, cappedByBudget };
}

/** What a plan costs, for the console's budget line. */
export function groundCoverTriangles(plants: readonly GroundCoverPlant[]): number {
  return plants.reduce((n, p) => n + GROUND_COVER[p.species].triangles, 0);
}
