/**
 * Per-floor surface override. Each floor can override the app's global active floor
 * texture (tile | concrete | wood | flat) with its own kind — the per-floor sibling
 * of `wall-sections.ts`, and the first field of the floor-as-document model
 * (see docs/building-workflow-scaffold-and-detail.md).
 */

export type FloorSurfaceKind = "tile" | "concrete" | "wood" | "flat";

export const FLOOR_SURFACE_KINDS: FloorSurfaceKind[] = ["tile", "concrete", "wood", "flat"];

import type { BuildingConfig } from "./types";

/** A per-floor surface override. */
export interface FloorSurfaceOverride {
  floor: number;
  kind: FloorSurfaceKind;
  /** Per-floor tint (#rrggbb). Multiplies on textured kinds; solid fill for "flat". */
  color?: string;
}

/** The whole-floor flat color for one floor, if set. */
export function resolveFloorSurfaceColor(
  config: BuildingConfig,
  floor: number
): string | undefined {
  return config.floorSurfaces?.find((s) => s.floor === floor)?.color;
}

/**
 * Resolve the surface kind for one floor: an explicit override wins; otherwise falls
 * back to the caller-supplied global default (the app's active floor texture).
 */
export function resolveFloorSurfaceKind(
  config: BuildingConfig,
  floor: number,
  globalDefault: FloorSurfaceKind
): FloorSurfaceKind {
  return config.floorSurfaces?.find((s) => s.floor === floor)?.kind ?? globalDefault;
}

/** Immutably upsert a surface override for one floor. */
export function setFloorSurfaceOverride(
  overrides: FloorSurfaceOverride[] | undefined,
  floor: number,
  kind: FloorSurfaceKind,
  color?: string
): FloorSurfaceOverride[] {
  const rest = (overrides ?? []).filter((s) => s.floor !== floor);
  return [...rest, color ? { floor, kind, color } : { floor, kind }];
}

/** Remove a surface override, reverting the floor to the global default. */
export function clearFloorSurfaceOverride(
  overrides: FloorSurfaceOverride[] | undefined,
  floor: number
): FloorSurfaceOverride[] {
  return (overrides ?? []).filter((s) => s.floor !== floor);
}
