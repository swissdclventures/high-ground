/**
 * Named regions on a floor (e.g. "the dance circle") — the spatial vocabulary that future
 * behaviors (zone entry/exit, triggered emotes, timers) will attach to. A zone is a semantic
 * marker, not solid geometry: unlike floor props, it doesn't need to clear the circulation
 * core — it can't physically clip the elevator/ramp, it's just a labeled area — so the only
 * shell↔floor contract check here is "stays inside the floor's footprint".
 */

import {
  buildingFootprintM,
  type BuildingConfig,
  type SceneLayout,
} from "./types";
import { slabRectForLevel } from "./floor-massing";

export type FloorZoneShape =
  | { kind: "circle"; centerX: number; centerZ: number; radius: number }
  | {
      kind: "rect";
      centerX: number;
      centerZ: number;
      width: number;
      depth: number;
    };

export interface FloorZoneSpec {
  /** Floor the zone covers, or SITE_FLOOR_INDEX for open ground on the plot. */
  floorIndex: number;
  /** Explicit walk height for elevated site zones such as a floating island. */
  floorY?: number;
  /**
   * "building" (default) = shape coordinates are building-local. "site" = they are SCENE
   * coordinates, so the zone can cover the ground between buildings and stays put when a
   * building moves. See shared/floor-props.ts for the shared sentinel.
   */
  scope?: "building" | "site";
  shape: FloorZoneShape;
  /**
   * Site zones are authored in scene-centred composer metres. Generated districts used
   * to write GLB-local numbers here; `"composer"` means a later load must not heal them.
   */
  coordFrame?: "composer";
  /** Optional visitor-facing title/logo card shown once when crossing into the zone. */
  entryCard?: import("./zone-entry-card").ZoneEntryCardSpec;
  /** Optional simple action fired once when the player crosses into the zone. */
  trigger?: import("./proximity-trigger").ProximityTriggerSpec;
}

/** Size-only part of a shape (no center) — what's known before a click supplies the position. */
export type FloorZoneSizeSpec = Omit<FloorZoneShape, "centerX" | "centerZ">;

export interface FloorZoneBounds {
  halfW: number;
  halfD: number;
  /** Slab center in building coords — non-zero when anchored massing offsets a floor. */
  centerX?: number;
  centerZ?: number;
}

/** Inset from the footprint edge (keeps a zone's marker clear of exterior walls). */
export const FLOOR_ZONE_EDGE_MARGIN_M = 0.5;

export function floorZoneBounds(
  config: BuildingConfig,
  layout: SceneLayout,
  floor?: number,
): FloorZoneBounds {
  // With a floor given, bound to that level's walkable slab (per-floor massing may
  // shrink AND offset it).
  const rect =
    floor === undefined
      ? { ...buildingFootprintM(config, layout), offsetX: 0, offsetZ: 0 }
      : slabRectForLevel(config, layout, floor);
  return {
    halfW: rect.width / 2,
    halfD: rect.depth / 2,
    centerX: rect.offsetX,
    centerZ: rect.offsetZ,
  };
}

/** Human-readable reason a shape is invalid, for UI feedback — null when valid. */
export function floorZoneShapeIssue(
  bounds: FloorZoneBounds,
  shape: FloorZoneShape,
  edgeMargin = FLOOR_ZONE_EDGE_MARGIN_M,
): string | null {
  const bCx = bounds.centerX ?? 0;
  const bCz = bounds.centerZ ?? 0;
  if (shape.kind === "circle") {
    if (!(shape.radius > 0)) return "Radius must be positive";
    const withinFootprint =
      shape.centerX - shape.radius >= bCx - bounds.halfW + edgeMargin &&
      shape.centerX + shape.radius <= bCx + bounds.halfW - edgeMargin &&
      shape.centerZ - shape.radius >= bCz - bounds.halfD + edgeMargin &&
      shape.centerZ + shape.radius <= bCz + bounds.halfD - edgeMargin;
    return withinFootprint ? null : "Outside the floor footprint";
  }

  if (!(shape.width > 0) || !(shape.depth > 0))
    return "Width and depth must be positive";
  const halfW = shape.width / 2;
  const halfD = shape.depth / 2;
  const withinFootprint =
    shape.centerX - halfW >= bCx - bounds.halfW + edgeMargin &&
    shape.centerX + halfW <= bCx + bounds.halfW - edgeMargin &&
    shape.centerZ - halfD >= bCz - bounds.halfD + edgeMargin &&
    shape.centerZ + halfD <= bCz + bounds.halfD - edgeMargin;
  return withinFootprint ? null : "Outside the floor footprint";
}

/**
 * A SITE zone covers open ground, so the PLOT bounds it — not a floor slab. Asking
 * floorZoneBounds for SITE_FLOOR_INDEX (-1) silently answers with floor 0's footprint,
 * which rejects every courtyard zone for sitting outside a building it was never in.
 * Shape coordinates are scene-space here, and the scene is centred on the origin.
 */
export function siteZoneShapeIssue(
  layout: SceneLayout,
  shape: FloorZoneShape,
  edgeMargin = FLOOR_ZONE_EDGE_MARGIN_M,
): string | null {
  const bounds: FloorZoneBounds = {
    halfW: (layout.cols * 16) / 2,
    halfD: (layout.rows * 16) / 2,
    centerX: 0,
    centerZ: 0,
  };
  const issue = floorZoneShapeIssue(bounds, shape, edgeMargin);
  return issue === "Outside the floor footprint" ? "Outside the plot" : issue;
}

export function isValidFloorZoneShape(
  bounds: FloorZoneBounds,
  shape: FloorZoneShape,
  edgeMargin = FLOOR_ZONE_EDGE_MARGIN_M,
): boolean {
  return floorZoneShapeIssue(bounds, shape, edgeMargin) === null;
}
