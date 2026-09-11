/**
 * Per-wall glass material overrides — same knobs as the global facades controls
 * (color, opacity, roughness/shine, emissive), scoped to one side+floor or polygon edge+floor.
 * Unset fields inherit the global glass settings. Mirror of `floor-sections.ts`.
 */

import type { BuildingConfig } from "./types";
import type { WallSideId } from "./wall-sections";

/** Partial glass look for one rect wall (side + floor). Omitted fields inherit global. */
export interface WallGlassOverride {
  side: WallSideId;
  floor: number;
  color?: string;
  opacity?: number;
  roughness?: number;
  emissive?: number;
}

/** Partial glass look for one polygon edge + floor. */
export interface PolygonWallGlassOverride {
  edge: number;
  floor: number;
  color?: string;
  opacity?: number;
  roughness?: number;
  emissive?: number;
}

export type WallGlassFields = Pick<
  WallGlassOverride,
  "color" | "opacity" | "roughness" | "emissive"
>;

export interface ResolvedWallGlass {
  color: string;
  opacity: number;
  roughness: number;
  metalness: number;
  emissive: number;
  /** True when at least one field was overridden for this wall. */
  hasOverride: boolean;
}

export interface GlobalWallGlassDefaults {
  color: string;
  opacity: number;
  roughness: number;
  metalness: number;
  emissive: number;
}

function mergeFields(
  override: WallGlassFields | undefined,
  global: GlobalWallGlassDefaults
): ResolvedWallGlass {
  if (!override) {
    return { ...global, hasOverride: false };
  }
  const hasOverride =
    override.color !== undefined ||
    override.opacity !== undefined ||
    override.roughness !== undefined ||
    override.emissive !== undefined;
  return {
    color: override.color ?? global.color,
    opacity: override.opacity ?? global.opacity,
    roughness: override.roughness ?? global.roughness,
    metalness: global.metalness,
    emissive: override.emissive ?? global.emissive,
    hasOverride,
  };
}

export function findWallGlassOverride(
  overrides: WallGlassOverride[] | undefined,
  side: WallSideId,
  floor: number
): WallGlassOverride | undefined {
  return overrides?.find((o) => o.side === side && o.floor === floor);
}

export function findPolygonWallGlassOverride(
  overrides: PolygonWallGlassOverride[] | undefined,
  edge: number,
  floor: number
): PolygonWallGlassOverride | undefined {
  return overrides?.find((o) => o.edge === edge && o.floor === floor);
}

export function resolveWallGlassSettings(
  config: BuildingConfig,
  side: WallSideId,
  floor: number,
  global: GlobalWallGlassDefaults
): ResolvedWallGlass {
  return mergeFields(findWallGlassOverride(config.wallGlassOverrides, side, floor), global);
}

export function resolvePolygonWallGlassSettings(
  config: BuildingConfig,
  edge: number,
  floor: number,
  global: GlobalWallGlassDefaults
): ResolvedWallGlass {
  return mergeFields(
    findPolygonWallGlassOverride(config.polygonWallGlassOverrides, edge, floor),
    global
  );
}

/** True when the override entry has any material field set. */
export function wallGlassOverrideIsActive(o: WallGlassFields | undefined): boolean {
  if (!o) return false;
  return (
    o.color !== undefined ||
    o.opacity !== undefined ||
    o.roughness !== undefined ||
    o.emissive !== undefined
  );
}

/** Immutably upsert a rect wall glass override (merges partial fields). */
export function setWallGlassOverride(
  overrides: WallGlassOverride[] | undefined,
  side: WallSideId,
  floor: number,
  fields: WallGlassFields
): WallGlassOverride[] {
  const prev = findWallGlassOverride(overrides, side, floor);
  const next: WallGlassOverride = {
    side,
    floor,
    color: fields.color !== undefined ? fields.color : prev?.color,
    opacity: fields.opacity !== undefined ? fields.opacity : prev?.opacity,
    roughness: fields.roughness !== undefined ? fields.roughness : prev?.roughness,
    emissive: fields.emissive !== undefined ? fields.emissive : prev?.emissive,
  };
  const rest = (overrides ?? []).filter((o) => !(o.side === side && o.floor === floor));
  if (!wallGlassOverrideIsActive(next)) return rest;
  return [...rest, next];
}

export function clearWallGlassOverride(
  overrides: WallGlassOverride[] | undefined,
  side: WallSideId,
  floor: number
): WallGlassOverride[] {
  return (overrides ?? []).filter((o) => !(o.side === side && o.floor === floor));
}

export function setPolygonWallGlassOverride(
  overrides: PolygonWallGlassOverride[] | undefined,
  edge: number,
  floor: number,
  fields: WallGlassFields
): PolygonWallGlassOverride[] {
  const prev = findPolygonWallGlassOverride(overrides, edge, floor);
  const next: PolygonWallGlassOverride = {
    edge,
    floor,
    color: fields.color !== undefined ? fields.color : prev?.color,
    opacity: fields.opacity !== undefined ? fields.opacity : prev?.opacity,
    roughness: fields.roughness !== undefined ? fields.roughness : prev?.roughness,
    emissive: fields.emissive !== undefined ? fields.emissive : prev?.emissive,
  };
  const rest = (overrides ?? []).filter((o) => !(o.edge === edge && o.floor === floor));
  if (!wallGlassOverrideIsActive(next)) return rest;
  return [...rest, next];
}

export function clearPolygonWallGlassOverride(
  overrides: PolygonWallGlassOverride[] | undefined,
  edge: number,
  floor: number
): PolygonWallGlassOverride[] {
  return (overrides ?? []).filter((o) => !(o.edge === edge && o.floor === floor));
}

/** Parse `wall_{side}_f{floor}_…` group names. */
export function parseRectWallGroupName(
  name: string | undefined
): { side: WallSideId; floor: number } | null {
  if (!name) return null;
  const m = name.match(/^wall_(north|south|east|west)_f(\d+)/);
  if (!m) return null;
  return { side: m[1] as WallSideId, floor: parseInt(m[2]!, 10) };
}

/** Parse `wall_poly_f{floor}_e{edge}` group names. */
export function parsePolygonWallGroupName(
  name: string | undefined
): { edge: number; floor: number } | null {
  if (!name) return null;
  const m = name.match(/^wall_poly_f(\d+)_e(\d+)/);
  if (!m) return null;
  return { floor: parseInt(m[1]!, 10), edge: parseInt(m[2]!, 10) };
}
