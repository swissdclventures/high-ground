/**
 * Ground scatter — the plot-wide placement solver shared by every ground decoration.
 *
 * ONE planner, two renderers. A layer names a *source* and a set of metrics; the planner
 * turns them into deterministic transforms in the composer frame (plot centre = 0,0):
 *
 *   - source.kind "family"  → the five authored procedural installations
 *                             (see shared/site-ground-accents.ts, which emits primitives)
 *   - source.kind "library" → a GLB from the owner's library, cloned per instance
 *
 * ★ THE MODEL SHIPS ONCE. Unlike a hand-placed library object (which bakes into building.glb,
 * see app/src/object-studio/registry.ts), a scattered model is written to the bundle as ONE
 * file and every copy is a GltfContainer entity pointing at it. Baking 200 copies would
 * multiply the largest file in the deploy, and that file is what makes publishing fragile.
 *
 * ★ The cost that IS multiplied is triangles: SDK7 has no instancing, so the Explorer draws
 * every copy in full. `estimateScatterTriangles` is the governor — check it before you plan,
 * show the number in the UI, and keep it under `groundScatterTriangleBudget`.
 *
 * ★ Visual only. Scattered decoration carries NO collider by default — a plot-wide field of
 * invisible walls is how you trip every guest on the site.
 *
 * ★ Composer frame. The runtime shifts by `composerToDcl` and the export subtracts
 * `buildingRoot.position`; see site-ground.ts. Plan in plot-centred metres, always.
 */

import {
  VEGETATION_RADIUS_M,
  VEGETATION_VARIANTS,
  clampVegetationVariant,
  isVegetationSpecies,
  type VegetationSpecies,
} from "./vegetation-contract";

export interface GroundScatterExclusion {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Lengths of lawn a tuft layer can wear. These are the Garden's own blade clusters
 * (scripts/blender/build-garden-grass.py), reused as ground cover: the models already
 * ship with the scene template, and a lawn that grows is the same art standing taller.
 * The Garden owns growth; a scatter layer just picks a length and leaves it there.
 */
export type GrassLength = "short" | "healthy" | "long";

export const GRASS_LENGTHS: readonly GrassLength[] = ["short", "healthy", "long"];

/** Bundle-relative model for one length; `assets/garden` mirrors it for the Builder. */
export function grassModelFile(length: GrassLength): string {
  return `grass-${length}.glb`;
}

export function grassModelSrc(length: GrassLength): string {
  return `models/garden/${grassModelFile(length)}`;
}

export function grassAssetUrl(length: GrassLength): string {
  return `/garden/${grassModelFile(length)}`;
}

/** One cluster is a handful of blades; the Garden measured the worst at 66 triangles. */
export const GRASS_TRIANGLES_PER_TUFT = 66;

export type GroundScatterSource =
  | { kind: "family"; id: string }
  | { kind: "library"; objectId: string }
  /**
   * A species from the shared vegetation library (shared/vegetation-contract.ts). Unlike a
   * library object, these models already travel with the scene template, so a vegetation
   * layer costs the deploy NOTHING to ship — no export entry, no upload, just entities.
   * `variant` absent mixes all three authored variants across the field, which is what stops
   * a row of trees reading as one tree stamped forty times.
   */
  | { kind: "vegetation"; species: VegetationSpecies; variant?: number }
  /**
   * A tuft of the Garden's grass, spread as ground cover. Like vegetation it ships
   * nothing: the blade clusters are already in the scene template.
   */
  | { kind: "grass"; length: GrassLength };

export type GroundScatterRotation = "random" | "fixed";

/**
 * How the field is laid out. `meadow` is the original uniform scatter and stays the
 * default, so every layer authored before this existed plans byte-identically.
 *
 *  - `meadow` — blue-noise over the whole plot. Parks, wild ground, rubble.
 *  - `avenue` — a line (or a pair of lines) across the plot: street trees, a drive.
 *  - `grove`  — clumps of a few, with open ground between: orchards, copses.
 *  - `hedge`  — a tight continuous line, spacing from the item's own width: borders.
 */
export type GroundScatterMode = "meadow" | "avenue" | "grove" | "hedge";

export const GROUND_SCATTER_MODES: readonly GroundScatterMode[] = ["meadow", "avenue", "grove", "hedge"];

/** One decoration spread over the plot. Persisted on `SiteGroundConfig.scatter`. */
export interface GroundScatterLayer {
  id: string;
  source: GroundScatterSource;
  enabled: boolean;
  /** Items per 100 m² of plot. The count scales with the plot so one setting fits every size. */
  density: number;
  /** Per-item random scale multiplier applied to the source's authored size. */
  scaleMin: number;
  scaleMax: number;
  rotation: GroundScatterRotation;
  /** Used when rotation is "fixed". */
  yawDeg: number;
  /** Keep this far clear of the plot edge (metres). */
  edgeMarginM: number;
  /** Extra keep-out padding added around every building/structure box (metres). */
  clearanceM: number;
  /** Minimum centre-to-centre distance between two items of this layer (metres). */
  spacingM: number;
  /**
   * The version of the library object this layer spreads. Same rule as a floor prop
   * (`FloorPropSpec.assetVersion`): pinned at placement, updated on request, and
   * ABSENT means "whatever the library holds now" — never stale.
   *
   * ‼️ DECLARED, NOT YET CARRIED. `normalizeGroundScatterLayer` deliberately does not
   * copy it: this normalizer runs INSIDE the published scene (scene/src/ground-scatter.ts
   * calls it), so a line here changes the deployed runtime bundle. Ground-cover versioning
   * is not wired end to end yet — nothing writes this field — so adding the passthrough
   * would have been dead code paid for with a scene rebundle. Add it in the same change
   * that starts writing it, and rebundle then.
   */
  assetVersion?: number;
  /**
   * Footprint radius of ONE un-scaled copy, measured from the library record when the layer
   * is created. ★ It is stored, not re-measured: the radius decides which candidates the
   * solver rejects, so a runtime that guessed a different value would lay out a different
   * field from the preview. Same input, same field, both frames.
   */
  itemRadiusM: number;
  /** Changing this reshuffles the layout without touching any other setting. */
  seed: number;
  /** Hard ceiling regardless of density — the last line of defence for the tri budget. */
  maxInstances: number;
  /** Layout. Absent or "meadow" = the original uniform scatter. */
  mode?: GroundScatterMode;
  /** avenue/hedge: direction of the line, degrees clockwise from north (0 = runs north-south). */
  lineAngleDeg?: number;
  /** avenue/hedge: perpendicular offset of the line from the plot centre, metres. */
  lineOffsetM?: number;
  /** avenue only: 1 = one row, 2 = a row each side of the street. */
  rows?: number;
  /** avenue only: distance between the two rows, metres — the street's width. */
  rowGapM?: number;
  /** grove only: how many stand in one clump. */
  clumpSize?: number;
}

/** One placed copy, composer-centred. y is always 0: decoration sits on the paving. */
export interface GroundScatterInstance {
  index: number;
  x: number;
  z: number;
  scale: number;
  yawRad: number;
  /**
   * Which authored variant this copy wears. Derived from the layer seed and the index
   * rather than drawn from the rng, so adding it could not shift the scale/yaw stream of
   * any field authored before variants existed.
   */
  variant: number;
}

export const GROUND_SCATTER_LAYER_ID_PREFIX = "gsl_";

/** Whole-plot ceiling across every scatter layer. Beyond this the scene stops loading well. */
export const GROUND_SCATTER_MAX_TRIANGLES = 240_000;

/** Per-item ceiling for a library GLB used as ground cover. High-poly props do not scatter. */
export const GROUND_SCATTER_MAX_FACES_PER_ITEM = 2_000;

export const GROUND_SCATTER_MAX_INSTANCES = 400;

/**
 * Share of the scene's triangle allowance that ground cover may spend. DCL gives a scene
 * 10k triangles per parcel; decoration must not eat the architecture's budget, so it gets a
 * quarter and the absolute ceiling above still applies on very large plots.
 */
export const GROUND_SCATTER_BUDGET_SHARE = 0.25;

/** Triangle budget for ALL scatter layers on a plot, from the scene's own DCL limit. */
export function groundScatterTriangleBudget(sceneTriangleLimit: number): number {
  const share = Math.max(0, Math.floor(sceneTriangleLimit * GROUND_SCATTER_BUDGET_SHARE));
  return Math.min(share, GROUND_SCATTER_MAX_TRIANGLES);
}

export function defaultGroundScatterLayer(
  source: GroundScatterSource,
  id: string,
): GroundScatterLayer {
  // A tree is not a pebble: it is metres across, so it wants its own radius, wider
  // spacing and a lower density, or the first preview is a solid wall of canopy.
  const tree = source.kind === "vegetation" ? VEGETATION_RADIUS_M[source.species] : null;
  // A lawn is the opposite: small clusters, packed, and many of them. The instance
  // ceiling is what actually decides how lush it gets, not the density.
  if (source.kind === "grass") {
    return {
      id,
      source,
      enabled: true,
      density: 12,
      scaleMin: 0.85,
      scaleMax: 1.25,
      rotation: "random",
      yawDeg: 0,
      edgeMarginM: 0,
      clearanceM: 0.5,
      spacingM: 1.4,
      itemRadiusM: 0.9,
      seed: 1,
      maxInstances: GROUND_SCATTER_MAX_INSTANCES,
      mode: "meadow",
    };
  }
  return {
    id,
    source,
    enabled: true,
    density: tree ? 0.35 : 1.5,
    scaleMin: tree ? 0.85 : 0.8,
    scaleMax: tree ? 1.15 : 1.3,
    rotation: "random",
    yawDeg: 0,
    edgeMarginM: 2,
    clearanceM: tree ? 2.5 : 1.5,
    spacingM: tree ? tree * 2.2 : 3,
    itemRadiusM: tree ?? 0.5,
    seed: 1,
    maxInstances: 120,
    mode: "meadow",
  };
}

export function newGroundScatterLayerId(seq: number): string {
  return `${GROUND_SCATTER_LAYER_ID_PREFIX}${Math.max(0, Math.floor(seq))}`;
}

function num(raw: unknown, fallback: number, lo: number, hi: number): number {
  const v = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
  return clamp(v, lo, hi);
}

function normalizeSource(raw: unknown): GroundScatterSource | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === "family" && typeof o.id === "string" && o.id) return { kind: "family", id: o.id };
  if (o.kind === "library" && typeof o.objectId === "string" && o.objectId) {
    return { kind: "library", objectId: o.objectId };
  }
  if (o.kind === "grass") {
    const length = (GRASS_LENGTHS as readonly string[]).includes(o.length as string)
      ? (o.length as GrassLength)
      : "healthy";
    return { kind: "grass", length };
  }
  if (o.kind === "vegetation" && isVegetationSpecies(o.species)) {
    // An out-of-range variant is a mix, not an error: the field still plants.
    const variant = o.variant;
    return typeof variant === "number" && Number.isFinite(variant)
      ? { kind: "vegetation", species: o.species, variant: clampVegetationVariant(variant) }
      : { kind: "vegetation", species: o.species };
  }
  return null;
}

/** Layout, defaulting to the original uniform scatter for anything older. */
function normalizeMode(raw: unknown): GroundScatterMode {
  return typeof raw === "string" && (GROUND_SCATTER_MODES as readonly string[]).includes(raw)
    ? (raw as GroundScatterMode)
    : "meadow";
}

/** Unknown/old shapes drop out rather than throwing — a bad layer must never brick a recipe. */
export function normalizeGroundScatterLayer(raw: unknown, seq: number): GroundScatterLayer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const source = normalizeSource(o.source);
  if (!source) return null;
  const id = typeof o.id === "string" && o.id ? o.id : newGroundScatterLayerId(seq);
  const base = defaultGroundScatterLayer(source, id);
  const scaleMin = num(o.scaleMin, base.scaleMin, 0.05, 20);
  const scaleMax = num(o.scaleMax, base.scaleMax, 0.05, 20);
  return {
    id,
    source,
    enabled: o.enabled !== false,
    density: num(o.density, base.density, 0, 40),
    scaleMin: Math.min(scaleMin, scaleMax),
    scaleMax: Math.max(scaleMin, scaleMax),
    rotation: o.rotation === "fixed" ? "fixed" : "random",
    yawDeg: num(o.yawDeg, base.yawDeg, -360, 360),
    edgeMarginM: num(o.edgeMarginM, base.edgeMarginM, 0, 200),
    clearanceM: num(o.clearanceM, base.clearanceM, 0, 100),
    spacingM: num(o.spacingM, base.spacingM, 0, 200),
    itemRadiusM: num(o.itemRadiusM, base.itemRadiusM, 0.05, 100),
    seed: Math.round(num(o.seed, base.seed, 0, 1_000_000)),
    maxInstances: Math.round(num(o.maxInstances, base.maxInstances, 0, GROUND_SCATTER_MAX_INSTANCES)),
    mode: normalizeMode(o.mode),
    lineAngleDeg: num(o.lineAngleDeg, 0, -360, 360),
    lineOffsetM: num(o.lineOffsetM, 0, -500, 500),
    rows: Math.round(num(o.rows, 1, 1, 2)),
    rowGapM: num(o.rowGapM, 12, 0, 200),
    clumpSize: Math.round(num(o.clumpSize, 6, 2, 24)),
  };
}

export function normalizeGroundScatterLayers(raw: unknown): GroundScatterLayer[] {
  if (!Array.isArray(raw)) return [];
  const out: GroundScatterLayer[] = [];
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const layer = normalizeGroundScatterLayer(item, i);
    if (!layer || seen.has(layer.id)) return;
    seen.add(layer.id);
    out.push(layer);
  });
  return out;
}

/**
 * How many copies this layer wants before spacing, exclusions and the hard cap trim it.
 * Density is per 100 m² so the same slider reads the same on a 1-parcel plot and a district.
 */
export function plannedGroundScatterCount(
  layer: GroundScatterLayer,
  width: number,
  depth: number,
): number {
  if (!layer.enabled || layer.density <= 0 || layer.maxInstances <= 0) return 0;
  const area = Math.max(0, width) * Math.max(0, depth);
  const wanted = Math.round((layer.density * area) / 100);
  return clamp(wanted, 0, Math.min(layer.maxInstances, GROUND_SCATTER_MAX_INSTANCES));
}

/**
 * ★ The governor. `facesPerItem` comes from the library record's `face_count`; a GLB with an
 * unknown count is assumed to be at the per-item ceiling so an unmeasured prop cannot sneak
 * a million triangles into the bake.
 */
export function estimateScatterTriangles(
  instanceCount: number,
  facesPerItem: number | null | undefined,
): number {
  const faces =
    typeof facesPerItem === "number" && Number.isFinite(facesPerItem) && facesPerItem > 0
      ? facesPerItem
      : GROUND_SCATTER_MAX_FACES_PER_ITEM;
  return Math.max(0, Math.round(instanceCount * faces));
}

/**
 * Largest instance count that still fits a triangle budget. The UI uses this to clamp the
 * density slider instead of letting the owner author a scene that cannot publish.
 */
export function maxInstancesForTriangleBudget(
  facesPerItem: number | null | undefined,
  budget: number = GROUND_SCATTER_MAX_TRIANGLES,
): number {
  const faces =
    typeof facesPerItem === "number" && Number.isFinite(facesPerItem) && facesPerItem > 0
      ? facesPerItem
      : GROUND_SCATTER_MAX_FACES_PER_ITEM;
  return clamp(Math.floor(Math.max(0, budget) / faces), 0, GROUND_SCATTER_MAX_INSTANCES);
}

/** Grow every keep-out box by `pad` on all four sides. */
export function padExclusions(
  exclusions: readonly GroundScatterExclusion[],
  pad: number,
): GroundScatterExclusion[] {
  const p = Math.max(0, pad);
  return exclusions.map((box) => ({
    minX: box.minX - p,
    maxX: box.maxX + p,
    minZ: box.minZ - p,
    maxZ: box.maxZ + p,
  }));
}

/**
 * Plan one layer. Deterministic: same layer + same plot ⇒ byte-identical transforms, so a
 * republish never reshuffles the ground under a returning guest.
 */
export function planGroundScatter(args: {
  width: number;
  depth: number;
  layer: GroundScatterLayer;
  exclusions?: readonly GroundScatterExclusion[];
}): GroundScatterInstance[] {
  const layer = args.layer;
  const width = Math.max(0, args.width);
  const depth = Math.max(0, args.depth);
  if (!layer.enabled || layer.maxInstances <= 0) return [];

  const rng = makeGroundRng(`${layer.id}:${layer.seed}`, width, depth);
  const radius = Math.max(0.05, layer.itemRadiusM) * layer.scaleMax;
  const halfW = width / 2 - layer.edgeMarginM;
  const halfD = depth / 2 - layer.edgeMarginM;
  const exclusions = padExclusions(args.exclusions ?? [], layer.clearanceM);
  const mode = layer.mode ?? "meadow";

  let points: Point[];
  if (mode === "avenue" || mode === "hedge") {
    // A line fills itself: how many trees stand along a street is the street's length
    // divided by their spacing, never a density per 100 m². `maxInstances` still caps it.
    points = linePoints({
      rng,
      layer,
      mode,
      halfW,
      halfD,
      radius,
      exclusions,
    });
  } else {
    const count = plannedGroundScatterCount(layer, width, depth);
    if (count <= 0) return [];
    points =
      mode === "grove"
        ? grovePoints({ rng, layer, count, halfW, halfD, radius, exclusions })
        : scatterPoints({
            rng,
            count,
            halfW,
            halfD,
            radius,
            minDist: layer.spacingM,
            exclusions,
          });
  }

  const spread = layer.scaleMax - layer.scaleMin;
  const fixedYaw = (layer.yawDeg * Math.PI) / 180;
  return points.map((p, index) => ({
    index,
    x: p.x,
    z: p.z,
    scale: layer.scaleMin + rng() * spread,
    yawRad: layer.rotation === "fixed" ? fixedYaw : rng() * Math.PI * 2,
    variant: scatterVariant(layer, index),
  }));
}

/**
 * Which authored variant copy `index` wears. Hashed from the layer seed and the index
 * rather than drawn from the rng, so a field authored before variants existed keeps the
 * exact scale and yaw it always had. A layer that names one variant gets only that one.
 */
export function scatterVariant(layer: GroundScatterLayer, index: number): number {
  const source = layer.source;
  if (source.kind !== "vegetation") return 0;
  if (typeof source.variant === "number") return clampVegetationVariant(source.variant);
  let a = (Math.round(layer.seed) * 2654435761 + index * 40503) >>> 0;
  a = Math.imul(a ^ (a >>> 15), 2246822507) >>> 0;
  return (a >>> 8) % VEGETATION_VARIANTS;
}

/**
 * Points along a line across the plot — one row for a hedge, one or two for an avenue.
 *
 * `lineAngleDeg` 0 runs north-south; the line is pushed `lineOffsetM` along its own
 * perpendicular, so an avenue sits beside a street rather than down the middle of it.
 * A hedge stands shoulder to shoulder (spacing from the item's own width) and does not
 * jitter; an avenue keeps its authored spacing and wanders a few centimetres so a row of
 * forty does not read as a fence.
 */
export function linePoints(args: {
  rng: () => number;
  layer: GroundScatterLayer;
  mode: GroundScatterMode;
  halfW: number;
  halfD: number;
  radius: number;
  exclusions: readonly GroundScatterExclusion[];
}): Point[] {
  const { rng, layer, mode, halfW, halfD, radius, exclusions } = args;
  const innerW = Math.max(0, halfW - radius);
  const innerD = Math.max(0, halfD - radius);
  if (innerW < 0.25 || innerD < 0.25) return [];

  const theta = ((layer.lineAngleDeg ?? 0) * Math.PI) / 180;
  const dir = { x: Math.sin(theta), z: Math.cos(theta) };
  const perp = { x: Math.cos(theta), z: -Math.sin(theta) };
  const step = Math.max(
    0.25,
    mode === "hedge" ? Math.max(0.25, radius * 1.6) : Math.max(layer.spacingM, radius * 1.2),
  );
  const rows = mode === "avenue" ? Math.max(1, Math.min(2, Math.round(layer.rows ?? 1))) : 1;
  const gap = Math.max(0, layer.rowGapM ?? 12);
  const offset = layer.lineOffsetM ?? 0;
  // Long enough to cross any plot at any angle; the inner-rect test trims the ends.
  const reach = Math.hypot(innerW, innerD);
  const jitter = mode === "hedge" ? 0 : Math.min(0.6, step * 0.15);

  const out: Point[] = [];
  const cap = Math.min(layer.maxInstances, GROUND_SCATTER_MAX_INSTANCES);
  for (let row = 0; row < rows && out.length < cap; row++) {
    // Two rows straddle the offset line, one each side of the street.
    const push = offset + (rows === 2 ? (row === 0 ? -gap / 2 : gap / 2) : 0);
    for (let t = -reach; t <= reach && out.length < cap; t += step) {
      const wobble = jitter > 0 ? (rng() * 2 - 1) * jitter : 0;
      const p = {
        x: dir.x * t + perp.x * (push + wobble),
        z: dir.z * t + perp.z * (push + wobble),
      };
      if (Math.abs(p.x) > innerW || Math.abs(p.z) > innerD) continue;
      if (exclusions.some((box) => circleHitsBox(p, radius, box))) continue;
      out.push(p);
    }
  }
  return out;
}

/**
 * Clumps with open ground between them: pick clump centres with the same blue-noise the
 * meadow uses, then ring each with its members. A grove of thirty in clumps of six is
 * five stands, not thirty lonely trees — which is what a copse actually looks like.
 */
export function grovePoints(args: {
  rng: () => number;
  layer: GroundScatterLayer;
  count: number;
  halfW: number;
  halfD: number;
  radius: number;
  exclusions: readonly GroundScatterExclusion[];
}): Point[] {
  const { rng, layer, count, halfW, halfD, radius, exclusions } = args;
  const clump = Math.max(2, Math.min(24, Math.round(layer.clumpSize ?? 6)));
  const clumps = Math.max(1, Math.ceil(count / clump));
  // ★ Trees in a copse stand CLOSER than scattered parkland trees — that contrast is the
  // whole point of the mode. Members use a tightened spacing (canopies may overlap, trunks
  // never do) and the clump is the smallest disc that can hold them at it. Sizing the disc
  // from the layer's own spacing instead made a grove SPARSER than a meadow of the same
  // count, which is the opposite of a copse.
  const memberSpacing = Math.max(radius * 1.35, layer.spacingM * 0.65);
  const clumpRadius = (memberSpacing / 2) * Math.sqrt(clump / 0.6);
  const centres = scatterPoints({
    rng,
    count: clumps,
    halfW,
    halfD,
    radius,
    // Stands keep a whole clump's width apart, or the copses merge into a meadow.
    minDist: clumpRadius * 2,
    exclusions,
  });

  const out: Point[] = [];
  const minSq = memberSpacing * memberSpacing;
  for (const centre of centres) {
    for (let i = 0; i < clump && out.length < count; i++) {
      let placed = false;
      for (let tries = 0; tries < 24 && !placed; tries++) {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * clumpRadius;
        const p = { x: centre.x + Math.cos(a) * r, z: centre.z + Math.sin(a) * r };
        if (Math.abs(p.x) > halfW - radius || Math.abs(p.z) > halfD - radius) continue;
        if (out.some((o) => (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < minSq)) continue;
        if (exclusions.some((box) => circleHitsBox(p, radius, box))) continue;
        out.push(p);
        placed = true;
      }
    }
  }
  return out;
}

export interface Point {
  x: number;
  z: number;
}

/**
 * Blue-noise-ish rejection sampling: uniform in the inner rectangle, rejecting anything too
 * close to an earlier point or overlapping a keep-out box. Capped at 80 tries per wanted item
 * so a crowded plot returns fewer items instead of spinning.
 */
export function scatterPoints(args: {
  rng: () => number;
  count: number;
  halfW: number;
  halfD: number;
  radius: number;
  minDist: number;
  exclusions: readonly GroundScatterExclusion[];
}): Point[] {
  const { rng, count, halfW, halfD, radius, minDist, exclusions } = args;
  const out: Point[] = [];
  const innerW = Math.max(0, halfW - radius - 1);
  const innerD = Math.max(0, halfD - radius - 1);
  if (innerW < 0.25 || innerD < 0.25) return out;
  const minSq = minDist * minDist;
  for (let t = 0; t < count * 80 && out.length < count; t++) {
    const p = { x: (rng() * 2 - 1) * innerW, z: (rng() * 2 - 1) * innerD };
    if (out.some((o) => (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < minSq)) continue;
    if (exclusions.some((box) => circleHitsBox(p, radius, box))) continue;
    out.push(p);
  }
  return out;
}

export function circleHitsBox(p: Point, radius: number, box: GroundScatterExclusion): boolean {
  const nearestX = clamp(p.x, box.minX, box.maxX);
  const nearestZ = clamp(p.z, box.minZ, box.maxZ);
  return (nearestX - p.x) ** 2 + (nearestZ - p.z) ** 2 < radius * radius;
}

/** Seeded from key + plot size: resizing the plot re-lays the field, re-publishing does not. */
export function makeGroundRng(key: string, width: number, depth: number): () => number {
  let a = (Math.round(width) * 374761393 + Math.round(depth) * 668265263) >>> 0;
  for (let i = 0; i < key.length; i++) a = Math.imul(a ^ key.charCodeAt(i), 1597334677) >>> 0;
  a = (a || 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
