/**
 * Placed floor content — a catalog module dropped at an explicit position on one floor,
 * baked directly into the single building.glb (unlike smart objects, which export separately).
 *
 * `floorPropBounds`/`floorPropPositionIssue` are the minimal shell↔floor contract: a prop
 * must stay inside the floor's footprint (inset by an edge margin) and clear of the
 * circulation core (ramp/elevator), so free-form placement can never violate the shell.
 */

import { buildingFootprintM, type BuildingConfig, type SceneLayout } from "./types";
import { resolveCirculationBounds, verticalCirculationRequired } from "./circulation-anchor";
import { slabRectForLevel } from "./floor-massing";

export type FloorPropAssetClass = "furniture" | "structure";

/**
 * Site-scoped content is placed on the PLOT, not inside a building — a bench between two
 * towers, a stage in the courtyard. Its floorIndex is this sentinel and its x/z are scene
 * coordinates (measured from the scene centre), so it stays where it was put no matter
 * which building is being edited or where that building is moved to.
 */
export const SITE_FLOOR_INDEX = -1;

export function isSiteScoped(spec: { floorIndex?: number; scope?: string }): boolean {
  return spec.scope === "site" || spec.floorIndex === SITE_FLOOR_INDEX;
}

export interface FloorPropSpec {
  /** Floor the piece stands on, or SITE_FLOOR_INDEX for open ground on the plot. */
  floorIndex: number;
  /**
   * "building" (default) = x/z are building-local and the piece belongs to that building.
   * "site" = x/z are SCENE coordinates and the piece belongs to the plot, so it can sit
   * between buildings. Buildings own their interiors; the ground between them is shared.
   */
  scope?: "building" | "site";
  moduleId: string;
  x: number;
  z: number;
  rotationY?: number;
  /** Extra height above the floor walk surface (m). 0 = sitting on the floor. */
  yOffsetM?: number;
  /** Uniform size multiplier (1 = catalog size). For fitting pieces to the avatar. */
  scale?: number;
  /**
   * Asset class wall: structure modules must NEVER be placed as furniture.
   * Default / omitted = furniture (decor, stock, custom furnish pieces).
   */
  assetClass?: FloorPropAssetClass;
  /**
   * ★★★ The version of the library asset this placement holds.
   *
   * THE RULE (owner, 2026-08-27): a placement is pinned to the version it was placed
   * at. Editing an asset never reaches into a scene; updating is a button. Without this
   * field a published world could silently change under its visitors the moment its
   * author redesigned a prop.
   *
   * ‼️ ABSENT IS NOT STALE. Every placement made before this existed carries nothing,
   * and reads as "pinned to whatever the library holds now" — treating those as
   * outdated would light up every scene in the product on the day it shipped.
   */
  assetVersion?: number;
}

/** Detach a floor prop from a building slab. Pose stays; only scope/floor change. */
export function floorPropSpecAsFreeOnPlot(
  spec: FloorPropSpec,
  pose: { x: number; z: number; yOffsetM: number; rotationY: number }
): FloorPropSpec {
  return {
    ...spec,
    x: pose.x,
    z: pose.z,
    yOffsetM: pose.yOffsetM,
    rotationY: pose.rotationY,
    scope: "site",
    floorIndex: SITE_FLOOR_INDEX,
  };
}

export interface FloorPropBounds {
  halfW: number;
  halfD: number;
  /** Slab center in building coords — non-zero when anchored massing offsets a floor. */
  centerX?: number;
  centerZ?: number;
  core: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Inset from the footprint edge (keeps props clear of exterior walls). */
export const FLOOR_PROP_EDGE_MARGIN_M = 0.5;
/** Buffer around the circulation core (keeps props clear of the ramp/elevator). */
export const FLOOR_PROP_CORE_BUFFER_M = 0.3;

export function floorPropBounds(
  config: BuildingConfig,
  layout: SceneLayout,
  floor?: number
): FloorPropBounds {
  // With a floor given, bound to that level's walkable slab (per-floor massing may
  // shrink AND offset it); without, fall back to the full footprint (legacy callers).
  const rect =
    floor === undefined
      ? { ...buildingFootprintM(config, layout), offsetX: 0, offsetZ: 0 }
      : slabRectForLevel(config, layout, floor);
  // Launch traversal builds no core, so nothing has to be kept clear of one — reserving
  // the old shaft bay there would fence off a patch of perfectly good floor.
  const needsCore = verticalCirculationRequired(config) && config.circulationMode !== "launch";
  const core = needsCore
    ? resolveCirculationBounds(config, layout)
    : { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  return {
    halfW: rect.width / 2,
    halfD: rect.depth / 2,
    centerX: rect.offsetX,
    centerZ: rect.offsetZ,
    core: { minX: core.minX, maxX: core.maxX, minZ: core.minZ, maxZ: core.maxZ },
  };
}

/**
 * Human-readable reason a position is invalid, for UI feedback — null when the position
 * is valid. Checked at placement time (add is blocked while invalid), not at export time.
 */
export function floorPropPositionIssue(
  bounds: FloorPropBounds,
  x: number,
  z: number,
  edgeMargin = FLOOR_PROP_EDGE_MARGIN_M,
  coreBuffer = FLOOR_PROP_CORE_BUFFER_M
): string | null {
  const cx = bounds.centerX ?? 0;
  const cz = bounds.centerZ ?? 0;
  const withinFootprint =
    x >= cx - bounds.halfW + edgeMargin &&
    x <= cx + bounds.halfW - edgeMargin &&
    z >= cz - bounds.halfD + edgeMargin &&
    z <= cz + bounds.halfD - edgeMargin;
  if (!withinFootprint) return "Outside the floor footprint";

  const clearOfCore = !(
    x >= bounds.core.minX - coreBuffer &&
    x <= bounds.core.maxX + coreBuffer &&
    z >= bounds.core.minZ - coreBuffer &&
    z <= bounds.core.maxZ + coreBuffer
  );
  if (!clearOfCore) return "Overlaps the circulation core (ramp/elevator)";

  return null;
}

/**
 * Bounds check for a SITE piece: the plot, minus the footprint of every building on it.
 * Coordinates are scene-space, measured from the scene centre — the frame the viewport
 * ground plane uses, so a raycast hit can be handed straight in.
 *
 * Overlapping a building is rejected rather than clamped: a bench half-inside a wall is
 * not a placement anyone meant, and silently sliding it somewhere else is worse.
 */
/**
 * Euclidean gap from a scene-centred point to the nearest building footprint AABB.
 * 0 means the centre is inside a footprint. Used to assert disc clearance
 * (`gap ≥ itemRadius`) rather than “the centre is not inside a wall”.
 */
export function sitePropDiscGapM(
  layout: SceneLayout,
  buildings: ReadonlyArray<{ corners: ReadonlyArray<{ x: number; z: number }> }>,
  x: number,
  z: number
): number {
  const width = layout.cols * 16;
  const depth = layout.rows * 16;
  const halfW = width / 2;
  const halfD = depth / 2;
  let gap = Number.POSITIVE_INFINITY;
  for (const building of buildings) {
    const xs = building.corners.map((c) => c.x - halfW);
    const zs = building.corners.map((c) => c.z - halfD);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return 0;
    const dx = Math.max(minX - x, 0, x - maxX);
    const dz = Math.max(minZ - z, 0, z - maxZ);
    gap = Math.min(gap, Math.hypot(dx, dz));
  }
  return gap;
}

export function sitePropPositionIssue(
  layout: SceneLayout,
  buildings: ReadonlyArray<{ corners: ReadonlyArray<{ x: number; z: number }> }>,
  x: number,
  z: number,
  edgeMargin = FLOOR_PROP_EDGE_MARGIN_M,
  /**
   * Radius of the thing being placed. A jump pad is a 3 m disc: clearing only the
   * centre still buried a metre of it inside the tower wall. 0 keeps the legacy
   * point test (plot furniture, plaza centre).
   */
  itemRadius = 0
): string | null {
  const width = layout.cols * 16;
  const depth = layout.rows * 16;
  // Scene coords run from -width/2..+width/2; building corners are measured from the SW
  // corner, so shift them into the same frame before comparing.
  const halfW = width / 2;
  const halfD = depth / 2;
  const plotInset = Math.max(edgeMargin, itemRadius);
  if (
    x < -halfW + plotInset ||
    x > halfW - plotInset ||
    z < -halfD + plotInset ||
    z > halfD - plotInset
  ) {
    return "Outside the plot";
  }
  if (itemRadius > 0) {
    const gap = sitePropDiscGapM(layout, buildings, x, z);
    if (gap < itemRadius) {
      return "Inside a building — place it on open ground, or put it on that building's floor";
    }
    return null;
  }
  for (const building of buildings) {
    const xs = building.corners.map((c) => c.x - halfW);
    const zs = building.corners.map((c) => c.z - halfD);
    if (
      x >= Math.min(...xs) &&
      x <= Math.max(...xs) &&
      z >= Math.min(...zs) &&
      z <= Math.max(...zs)
    ) {
      return "Inside a building — place it on open ground, or put it on that building's floor";
    }
  }
  return null;
}

export function isValidFloorPropPosition(
  bounds: FloorPropBounds,
  x: number,
  z: number,
  edgeMargin = FLOOR_PROP_EDGE_MARGIN_M,
  coreBuffer = FLOOR_PROP_CORE_BUFFER_M
): boolean {
  return floorPropPositionIssue(bounds, x, z, edgeMargin, coreBuffer) === null;
}
