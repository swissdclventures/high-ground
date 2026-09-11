/**
 * THE CANOPY — what a wood is made of above head height.
 *
 * The woody rungs drew the owner's seven-tree kit. It is contract-clean, and it is not
 * a wood: the kit has NO green species (cyan, orange, pink, purple, yellow, lilac),
 * and at rung 10 it is scaled ~1.9×, so autumn-fire's sparse leaf cards double in size
 * and float off thin branches, and columnar-purple becomes an 11 m purple spike. The
 * owner, standing under it: "these trees are embarrassing." Correct. I had verified the
 * kit against the file contract and never rendered a WOOD of it, and those are not the
 * same test.
 *
 * The reference jungle is deep green with a few ENORMOUS leaves — the exact recipe the
 * understorey already uses. A canopy tree is that recipe on a trunk: a tapered bark
 * cone and a crown of very large frond or broadleaf cards from the SAME atlas as the
 * ground layer, so the wood reads as one thing from floor to sky. 40-70 triangles a
 * tree against the kit's 216-384.
 *
 * The kit is not deleted. It stays in the landscaping library, where an owner places a
 * pink blossom tree on purpose. It just stops being what neglect grows.
 *
 * Deliberately a separate module from succession-contract.ts and understorey-contract.ts:
 * succession imports this, understorey imports succession, and a third direction would
 * close a cycle.
 */

export const CANOPY_VERSION = 1 as const;

export type CanopySpecies = "palm" | "broadcanopy";

export const CANOPY_SPECIES: readonly CanopySpecies[] = ["palm", "broadcanopy"];

export const CANOPY_VARIANTS = 3;

/** Same directory and same atlas as the understorey — that is the point. */
export const CANOPY_MODEL_DIR = "models/garden";

/**
 * The height each kind is MODELLED at, metres, measured from the build's own report.
 * The runtime scales against this so a rung lands on the height it states.
 */
export const CANOPY_NOMINAL_M: Record<CanopySpecies, number> = {
  palm: 7.5,
  broadcanopy: 6.2,
};

export function canopyModelFile(species: CanopySpecies, variant: number): string {
  const v = ((Math.floor(variant) % CANOPY_VARIANTS) + CANOPY_VARIANTS) % CANOPY_VARIANTS;
  return `jungle_${species}_v${v + 1}.glb`;
}

export function canopyModelSrc(species: CanopySpecies, variant: number): string {
  return `${CANOPY_MODEL_DIR}/${canopyModelFile(species, variant)}`;
}

/**
 * Which tree a woody cell grew, decided once by where it stands — the same rule the
 * stems, the understorey and the ground cover follow, with its own salt so the layers
 * never correlate.
 */
export function canopyPlantFor(localX: number, localZ: number): { species: CanopySpecies; variant: number } {
  const xi = (Math.round(localX * 100) | 0) + 0x6a09e667;
  const zi = (Math.round(localZ * 100) | 0) + 0xbb67ae85;
  let h = Math.imul(xi ^ (xi >>> 16), 0x7feb352d);
  h = Math.imul((h ^ zi) ^ ((h ^ zi) >>> 15), 0x846ca68b);
  h = (h ^ (h >>> 16)) >>> 0;
  const g = (Math.imul(h ^ 0x9e3779b9, 0x85ebca6b) ^ (h >>> 13)) >>> 0;
  return {
    species: CANOPY_SPECIES[g % CANOPY_SPECIES.length]!,
    variant: (g >>> 8) % CANOPY_VARIANTS,
  };
}

/** The model a woody cell draws, and the uniform scale that lands it on `heightM`. */
export function canopyModel(
  localX: number,
  localZ: number,
  heightM: number
): { src: string; scale: number; species: CanopySpecies } {
  const plant = canopyPlantFor(localX, localZ);
  const nominal = CANOPY_NOMINAL_M[plant.species] || 7;
  return { src: canopyModelSrc(plant.species, plant.variant), scale: heightM / nominal, species: plant.species };
}

export const CANOPY_MODEL_FILES: readonly string[] = CANOPY_SPECIES.flatMap((species) =>
  Array.from({ length: CANOPY_VARIANTS }, (_, v) => canopyModelFile(species, v))
);

/**
 * Every canopy file a published scene needs. The atlas is NOT listed here: it is the
 * understorey's sheet and UNDERSTOREY_BUNDLE_FILES already ships it.
 */
export const CANOPY_BUNDLE_FILES: readonly string[] = CANOPY_MODEL_FILES.map(
  (file) => `${CANOPY_MODEL_DIR}/${file}`
);
