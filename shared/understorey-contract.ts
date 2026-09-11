/**
 * THE UNDERSTOREY — what makes a wood a jungle instead of trees on a lawn.
 *
 * The succession ladder grows trees above rung 7, but the cells between the trunks
 * kept drawing grass at its ceiling. Stand in it and you get a lawn with trees on it,
 * which is not what "real jungles if you don't touch something for years" means.
 *
 * The owner sent a reference of another team's Decentraland vegetation and the whole
 * lesson is one line: A JUNGLE IS A FEW ENORMOUS LEAVES, DENSELY OVERLAPPING, AT EYE
 * LEVEL AND ABOVE. Not many small plants — a handful of very big flat shapes you have
 * to push through. That is what this layer is.
 *
 * ★ IT IS FREE, WHICH IS WHY IT CAN BE DENSE.
 *
 * A garden's wall is entities, not triangles — the lawn already spends 576 of the
 * plot's 1,800. An understorey plant does NOT add an entity: it replaces what a cell
 * that already exists is drawing. And it replaces it with something CHEAPER, because
 * a leaf two metres across is one quad whatever its size — 18 triangles at worst
 * against a grass patch's several hundred. Painting two-thirds of a wood's cells with
 * jungle costs no entities and gives triangles back.
 *
 * That is the only reason the densities below can be what they are. If this layer
 * spawned its own entities the honest number would be nearer 0.05 and it would look
 * like a few pot plants in a field.
 *
 * ★ IT DOES NOT COLLIDE, deliberately. See `UNDERSTOREY_COLLIDES`.
 *
 * The models are built by scripts/blender/build-jungle-understorey.py and share one
 * 512px atlas. Three species, three variants each, nine files.
 */

import { SUCCESSION_MAX, SUCCESSION_WOODY_RUNG, clampSuccessionRung } from "./succession-contract";

export const UNDERSTOREY_VERSION = 1 as const;

export type UnderstoreySpecies = "broadleaf" | "reed" | "frond";

export const UNDERSTOREY_SPECIES: readonly UnderstoreySpecies[] = ["broadleaf", "reed", "frond"];

export const UNDERSTOREY_VARIANTS = 3;

export const UNDERSTOREY_MODEL_DIR = "models/garden";
export const UNDERSTOREY_ATLAS_FILE = "garden_jungle_atlas.png";

/**
 * The height each species is MODELLED at, metres — the mid of its authored range.
 *
 * Scale is applied uniformly across the whole layer rather than per species, so reeds
 * stay taller than broad leaves at every rung. A jungle read at one height is a hedge.
 */
export const UNDERSTOREY_NOMINAL_M: Record<UnderstoreySpecies, number> = {
  broadleaf: 2.2,
  reed: 3.55,
  frond: 2.7,
};

/** The height the layer is scaled against. At this target every model is drawn 1:1. */
export const UNDERSTOREY_REFERENCE_M = 2.6;

/**
 * ★ THE UNDERSTOREY DOES NOT COLLIDE.
 *
 * The models carry a collider mesh — 12 triangles each, so the choice stays available
 * without a rebuild — but the runtime paints them with CL_NONE, for two reasons.
 *
 * At these densities colliders would make a mature bed genuinely impassable: two out
 * of three cells solid, on a 16 m bed, is a wall a player walks into and cannot get
 * out of. And the game does not need it, because the mechanic already lives in the
 * woody line — neglect costs you the ability to MOW the ground, not the ability to
 * cross it. Making a jungle physically block the player would be a second, worse
 * version of a rule that already works.
 *
 * Tree stems keep their own colliders. You can walk through the leaves and not
 * through the trunks, which is also how a real thicket behaves.
 */
export const UNDERSTOREY_COLLIDES: boolean = false;

/**
 * What fraction of a wood's NON-STEM cells grow understorey at each rung.
 *
 * Rising with the ladder, and high — this is the layer you actually stand in. Below
 * the woody line it is zero: scrub is the ground-cover layer's business and a bed you
 * can still mow should not be full of two-metre leaves.
 *
 * These are fractions of the cells that did NOT get a stem, so the two layers never
 * compete for the same cell and the stem densities in succession-contract.ts stay
 * exactly as they were.
 */
export function understoreyDensity(rung: number): number {
  const r = clampSuccessionRung(rung);
  if (r < SUCCESSION_WOODY_RUNG) return 0;
  return [0.4, 0.55, 0.62, 0.68][r - SUCCESSION_WOODY_RUNG] ?? 0;
}

/**
 * How tall the understorey stands at a rung, metres — NOT how tall the rung is.
 *
 * It tops out around three metres while the trees climb to eleven, because the point
 * of this layer is the thing at EYE LEVEL. Leaf cards scaled with the canopy would be
 * eight metres across and read as scenery in the distance rather than as jungle you
 * are standing inside.
 */
export function understoreyHeightM(rung: number): number {
  const r = clampSuccessionRung(rung);
  if (r < SUCCESSION_WOODY_RUNG) return 0;
  return [1.5, 2.3, 2.7, 3.0][r - SUCCESSION_WOODY_RUNG] ?? 0;
}

export function understoreyModelFile(species: UnderstoreySpecies, variant: number): string {
  const v = ((Math.floor(variant) % UNDERSTOREY_VARIANTS) + UNDERSTOREY_VARIANTS) % UNDERSTOREY_VARIANTS;
  return `jungle_${species}_v${v + 1}.glb`;
}

export function understoreyModelSrc(species: UnderstoreySpecies, variant: number): string {
  return `${UNDERSTOREY_MODEL_DIR}/${understoreyModelFile(species, variant)}`;
}

/**
 * Does THIS cell grow understorey, and what?
 *
 * Hashed from the cell's own position like the stems and the ground cover, so a
 * jungle is the same jungle for everyone, survives a reload with nothing stored, and
 * does not rearrange itself every time a rung ticks over.
 *
 * ‼️ The salt differs from `successionHasStem`'s. Sharing it would correlate the two
 * layers — every cell that just missed being a tree would be a leaf, and the wood
 * would come out in stripes.
 */
export function understoreyPlantFor(
  rung: number,
  localX: number,
  localZ: number
): { species: UnderstoreySpecies; variant: number } | null {
  const density = understoreyDensity(rung);
  if (density <= 0) return null;
  const xi = (Math.round(localX * 100) | 0) + 0x51ed270b;
  const zi = (Math.round(localZ * 100) | 0) + 0x1b873593;
  let h = Math.imul(xi ^ (xi >>> 16), 0x7feb352d);
  h = Math.imul((h ^ zi) ^ ((h ^ zi) >>> 15), 0x846ca68b);
  h = (h ^ (h >>> 16)) >>> 0;
  if (h / 4294967296 >= density) return null;
  // A second mixing for the species, so which plant grows is independent of whether
  // one grows at all — otherwise the rarest species would only ever appear in the
  // cells that most nearly failed the density test.
  const g = (Math.imul(h ^ 0x9e3779b9, 0x85ebca6b) ^ (h >>> 13)) >>> 0;
  return {
    species: UNDERSTOREY_SPECIES[g % UNDERSTOREY_SPECIES.length],
    variant: (g >>> 8) % UNDERSTOREY_VARIANTS,
  };
}

/**
 * The model an understorey cell draws, and the uniform scale to draw it at.
 *
 * `null` means this cell is not understorey — it is a stem, or grass, or below the
 * woody line — and the runtime keeps drawing whatever it drew before.
 */
export function understoreyModel(
  rung: number,
  localX: number,
  localZ: number
): { src: string; scale: number } | null {
  const plant = understoreyPlantFor(rung, localX, localZ);
  if (!plant) return null;
  return {
    src: understoreyModelSrc(plant.species, plant.variant),
    scale: understoreyHeightM(rung) / UNDERSTOREY_REFERENCE_M,
  };
}

/** Every understorey file a published scene needs. Miss the atlas and it is all blank. */
export const UNDERSTOREY_MODEL_FILES: readonly string[] = UNDERSTOREY_SPECIES.flatMap((species) =>
  Array.from({ length: UNDERSTOREY_VARIANTS }, (_, v) => understoreyModelFile(species, v))
);

export const UNDERSTOREY_BUNDLE_FILES: readonly string[] = [
  ...UNDERSTOREY_MODEL_FILES.map((file) => `${UNDERSTOREY_MODEL_DIR}/${file}`),
  `${UNDERSTOREY_MODEL_DIR}/${UNDERSTOREY_ATLAS_FILE}`,
];

/** Highest rung that draws understorey, for the console's copy. */
export const UNDERSTOREY_TOP_RUNG = SUCCESSION_MAX;
