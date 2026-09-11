/**
 * Per-floor massing — each floor can shrink its footprint on the 4 m grid, nested inside
 * the floor below, producing setbacks/towers with guarded terraces. Since the anchored-
 * massing upgrade a floor may also be PLACED within the floor below (anchor: sw…ne,
 * default center), unlocking podium+offset-tower, stepped asymmetric masses, and L-ish
 * silhouettes. Full design + invariants: docs/massing-design.md.
 *
 * Pure resolver only. Key rules: floor 0 is always full; dimensions snap to 4 m with an
 * 8 m minimum; per-axis nesting (a floor never exceeds — nor pokes outside — the floor
 * below); atrium voids are clamped per floor by floor-void-policy.
 */

import {
  GRID,
  buildingFootprintM,
  type BuildingConfig,
  type SceneLayout,
  type SiteAnchor,
} from "./types";

const { cellSize, parcelSize } = GRID;
export const MIN_FLOOR_DIM_M = 8;

export interface FloorFootprintOverride {
  floor: number;
  width: number;
  depth: number;
  /** Placement within the floor below (default "center" — the legacy behavior). */
  anchor?: SiteAnchor;
}

export interface FloorRect {
  width: number;
  depth: number;
  wallBaysX: number;
  wallBaysZ: number;
  /** Rect center in building coords (0,0 for full/centered floors — legacy shape). */
  offsetX: number;
  offsetZ: number;
}

/** Fraction of the parent's free space placed WEST/SOUTH of this floor's rect. */
const FLOOR_ANCHOR_FRACTION: Record<SiteAnchor, { ax: number; az: number }> = {
  sw: { ax: 0, az: 0 },
  s: { ax: 0.5, az: 0 },
  se: { ax: 1, az: 0 },
  w: { ax: 0, az: 0.5 },
  center: { ax: 0.5, az: 0.5 },
  e: { ax: 1, az: 0.5 },
  nw: { ax: 0, az: 1 },
  n: { ax: 0.5, az: 1 },
  ne: { ax: 1, az: 1 },
};

function toRect(width: number, depth: number, offsetX = 0, offsetZ = 0): FloorRect {
  return {
    width,
    depth,
    wallBaysX: Math.max(1, Math.round(width / cellSize)),
    wallBaysZ: Math.max(1, Math.round(depth / cellSize)),
    offsetX,
    offsetZ,
  };
}

function snapDim(value: number, fullAxis: number): number {
  const snapped = Math.round(value / cellSize) * cellSize;
  return Math.min(fullAxis, Math.max(MIN_FLOOR_DIM_M, snapped));
}

/** Anchored offsets land on the 2 m half-cell grid (free space is a multiple of 4 m,
 * so sw/center/… produce 0 or 2 m multiples — walls keep clean seams). */
function snapOffset(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Allowed dimension options for one axis (8 m … full, stepped by 4 m) — for the UI. */
export function footprintDimOptions(fullAxis: number): number[] {
  const out: number[] = [];
  for (let d = MIN_FLOOR_DIM_M; d <= fullAxis; d += cellSize) out.push(d);
  return out;
}

/**
 * WHOLE-PARCEL options for one axis (16, 32, 48 …). Owner decision 2026-07-17: the BUILDING
 * size picker offers full parcels only — no quarters/halves — because owners think in
 * parcels and the fraction labels made the row too wide for the "Fit to land" button.
 *
 * Deliberately separate from footprintDimOptions: the 4 m grid stays the rule for per-floor
 * massing setbacks (a floor may legitimately step back by a quarter parcel) and for AI ops.
 */
export function footprintParcelOptions(fullAxis: number): number[] {
  const out: number[] = [];
  for (let d = parcelSize; d <= fullAxis + 0.01; d += parcelSize) out.push(d);
  return out.length ? out : [Math.min(parcelSize, fullAxis)];
}

/** Snap a building dimension onto the whole-parcel grid within [1 parcel, maxM]. */
export function snapFootprintToParcelM(value: number, maxM: number): number {
  const snapped = Math.round(value / parcelSize) * parcelSize;
  return Math.min(Math.max(parcelSize, snapped), Math.max(parcelSize, maxM));
}

/** Place a child rect inside a parent rect per anchor (fully inside by construction). */
function placeWithin(
  parent: FloorRect,
  width: number,
  depth: number,
  anchor: SiteAnchor
): FloorRect {
  const f = FLOOR_ANCHOR_FRACTION[anchor] ?? FLOOR_ANCHOR_FRACTION.center;
  const freeX = parent.width - width;
  const freeZ = parent.depth - depth;
  const offsetX = snapOffset(parent.offsetX - freeX / 2 + f.ax * freeX);
  const offsetZ = snapOffset(parent.offsetZ - freeZ / 2 + f.az * freeZ);
  return toRect(width, depth, offsetX, offsetZ);
}

/**
 * Effective (clamped, nested, placed) footprint of one floor. Floor 0 (and anything
 * below) is always the full footprint at the building origin; overrides on upper floors
 * snap to the grid, clamp per axis to the floor below, and sit at their anchor within it.
 */
export function footprintRectForFloor(
  config: BuildingConfig,
  layout: SceneLayout,
  floor: number
): FloorRect {
  const full = buildingFootprintM(config, layout);
  // The atrium (a central void) and footprint setbacks are INDEPENDENT now — a pyramid
  // keeps its setbacks with a light-well through it; the void is clamped per floor.
  if (floor < 0 || !config.floorFootprints?.length) {
    return toRect(full.width, full.depth);
  }

  const envelope = toRect(full.width, full.depth);
  let rect = envelope;
  for (let f = 0; f <= floor; f++) {
    const override = config.floorFootprints.find((o) => o.floor === f);
    if (override) {
      const width = snapDim(override.width, full.width);
      const depth = snapDim(override.depth, full.depth);
      rect = placeWithin(envelope, width, depth, override.anchor ?? "center");
    }
    // No override → inherits the running (nested, placed) rect — same as the floor below.
  }
  return rect;
}

function unionRects(a: FloorRect, b: FloorRect): FloorRect {
  const minX = Math.min(a.offsetX - a.width / 2, b.offsetX - b.width / 2);
  const maxX = Math.max(a.offsetX + a.width / 2, b.offsetX + b.width / 2);
  const minZ = Math.min(a.offsetZ - a.depth / 2, b.offsetZ - b.depth / 2);
  const maxZ = Math.max(a.offsetZ + a.depth / 2, b.offsetZ + b.depth / 2);
  return toRect(maxX - minX, maxZ - minZ, (minX + maxX) / 2, (minZ + maxZ) / 2);
}

/**
 * The slab at level L is the walking surface of floor L AND the roof of floor L−1, so it
 * spans footprint(L−1) — the exposed ring outside footprint(L) is the terrace. Level 0 =
 * footprint(0). The roof slab is level `floors`.
 *
 * Sloped envelope: the skin of story L−1 runs footprint(L−1) → footprint(L), so the
 * ceiling it meets spans footprint(L) — there is no exposed ring (the skin covers it).
 */
export function slabRectForLevel(
  config: BuildingConfig,
  layout: SceneLayout,
  level: number
): FloorRect {
  if (config.envelope?.style === "sloped") {
    return footprintRectForFloor(config, layout, Math.min(level, Math.max(0, config.floors - 1)));
  }
  if (level <= 0) return footprintRectForFloor(config, layout, 0);
  const below = footprintRectForFloor(config, layout, Math.min(level - 1, config.floors - 1));
  const above = footprintRectForFloor(config, layout, Math.min(level, config.floors - 1));
  return unionRects(below, above);
}

/** True when any floor's effective footprint differs from the full rect (size OR position). */
export function massingActive(config: BuildingConfig, layout: SceneLayout): boolean {
  if (!config.floorFootprints?.length) return false;
  const full = buildingFootprintM(config, layout);
  for (let f = 0; f < Math.max(1, config.floors); f++) {
    const r = footprintRectForFloor(config, layout, f);
    if (r.width < full.width || r.depth < full.depth) return true;
    if (Math.abs(r.offsetX) > 0.01 || Math.abs(r.offsetZ) > 0.01) return true;
  }
  return false;
}

/** Immutably upsert a footprint override for one floor (floor 0 is ignored by the resolver). */
export function setFloorFootprintOverride(
  overrides: FloorFootprintOverride[] | undefined,
  floor: number,
  width: number,
  depth: number,
  anchor?: SiteAnchor
): FloorFootprintOverride[] {
  const rest = (overrides ?? []).filter((o) => o.floor !== floor);
  return [...rest, { floor, width, depth, ...(anchor ? { anchor } : {}) }];
}

/** Remove a floor's override, reverting it to the floor below's footprint. */
export function clearFloorFootprintOverride(
  overrides: FloorFootprintOverride[] | undefined,
  floor: number
): FloorFootprintOverride[] {
  return (overrides ?? []).filter((o) => o.floor !== floor);
}
