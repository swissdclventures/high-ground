/**
 * Per-side / per-floor wall sections. Each side of each floor can be a named section,
 * overriding the legacy global per-side WallType. This is what the "lock a floor, then
 * swap its walls" workflow drives.
 *
 * ★ WHY `window` EXISTS (owner, 2026-09-06). For a long time the only kinds were a full
 * curtain wall and a blank plane, so every building was either all glass or a prison —
 * the Manhattan blocks came out windowless and the glass looked either absent or total.
 * `window` is the missing middle: the shell material with a punched grid of openings.
 * It is what makes prewar, classical and ordinary architecture possible at all, and it
 * is a different axis from facade relief, which decorates a wall rather than changing
 * what the wall IS.
 */

import type { BuildingConfig, WallType } from "./types";

export type WallSideId = "north" | "south" | "east" | "west";
export type WallSectionKind = "open" | "glass" | "solid" | "window" | "entrance" | "balcony";

export const WALL_SIDES: WallSideId[] = ["north", "south", "east", "west"];
export const WALL_SECTION_KINDS: WallSectionKind[] = [
  "glass",
  "window",
  "solid",
  "entrance",
  "balcony",
  "open",
];

/**
 * A punched window grid on a solid wall. Every field is optional: absent means the
 * builder derives it from the bay, which is what lets `window` be asked for by name
 * alone and still look right on a 4 m shopfront and a 12 m block face.
 */
export interface WindowGridSpec {
  /**
   * How much geometry the openings are worth.
   *
   * `recessed` (default) builds the wall as sill, header and piers with a translucent
   * pane set back behind the face, so an opening is a real gap with a shadow line —
   * about 12 boxes for a three-window bay. `flat` keeps one solid panel and lays an
   * opaque glazed rectangle on each face — about a quarter of the geometry, and flat
   * when you stand next to it.
   *
   * Both are meant to be MIXED: recessed on what the visitor walks past, flat on the
   * blocks that only ever fill the middle distance.
   */
  relief?: "recessed" | "flat";
  /** Openings across the bay. Absent = one per ~2.4 m of bay width. */
  columns?: number;
  /** Opening height as a fraction of the storey. Absent = 0.5. */
  heightRatio?: number;
  /** Sill height as a fraction of the storey. Absent = 0.3. */
  sillRatio?: number;
  /** Pier width between and beside openings, metres. Absent = 0.9. */
  pierM?: number;
}

/** A per-side, per-floor section override. */
export interface WallSectionOverride {
  side: WallSideId;
  floor: number;
  kind: WallSectionKind;
}

/** Per-bay wall kind on one side of one floor (finer than whole-side set_wall). */
export interface WallBaySectionOverride {
  side: WallSideId;
  floor: number;
  bayIndex: number;
  kind: WallSectionKind;
}

export function legacyWallTypeToKind(type: WallType): WallSectionKind {
  switch (type) {
    case "open":
      return "open";
    case "solid":
      return "solid";
    case "sliding_entry":
      // The legacy entry is resolved per side+floor below; elsewhere it's plain glass.
      return "glass";
    case "glass":
    default:
      return "glass";
  }
}

export function legacyWallTypeForSide(config: BuildingConfig, side: WallSideId): WallType {
  switch (side) {
    case "north":
      return config.wallNorth;
    case "south":
      return config.wallSouth;
    case "east":
      return config.wallEast;
    case "west":
      return config.wallWest;
  }
}

/**
 * Resolve the wall-section kind for one side of one floor. An explicit override wins;
 * otherwise it falls back to the legacy global per-side WallType, with the legacy
 * ground-floor entrance (sliding_entry on the entry side) mapped to "entrance".
 */
export function resolveWallSectionKind(
  config: BuildingConfig,
  side: WallSideId,
  floor: number
): WallSectionKind {
  const override = config.wallSections?.find((s) => s.side === side && s.floor === floor);
  if (override) return override.kind;

  const legacy = legacyWallTypeForSide(config, side);
  if (legacy === "sliding_entry" && side === config.entrySide && floor === 0) {
    return "entrance";
  }
  return legacyWallTypeToKind(legacy);
}

/**
 * Resolve wall kind for one structural bay. Bay override wins, then whole-side
 * set_wall, then legacy per-side WallType.
 */
export function resolveWallBayKind(
  config: BuildingConfig,
  side: WallSideId,
  floor: number,
  bayIndex: number
): WallSectionKind {
  const bay = config.wallBaySections?.find(
    (s) => s.side === side && s.floor === floor && s.bayIndex === bayIndex
  );
  if (bay) return bay.kind;
  return resolveWallSectionKind(config, side, floor);
}

/** Map an edge's outward normal onto a cardinal wall side. Ties prefer north/south. */
export function cardinalSideFromOutward(outward: { x: number; z: number }): WallSideId {
  if (Math.abs(outward.z) >= Math.abs(outward.x)) {
    return outward.z <= 0 ? "south" : "north";
  }
  return outward.x >= 0 ? "east" : "west";
}

export function isFlyInWallKind(kind: WallSectionKind): boolean {
  return kind === "open" || kind === "balcony" || kind === "entrance";
}

/**
 * Resolve one polygon-plan edge. An explicit `polygonWalls[i]` wins; otherwise the
 * matching cardinal wall (`wallSouth` etc. / per-floor sections) applies so an
 * octagon/L/hull honors the same fly-in opening as a rectangle. Ground-floor
 * south-most edge stays a doorway when that cardinal wall is still glass.
 */
export function resolvePolygonEdgeKind(
  config: BuildingConfig,
  edge: { index: number; outward: { x: number; z: number }; isEntryEdge: boolean },
  floor: number
): WallSectionKind {
  const explicit = config.polygonWalls?.[edge.index];
  if (explicit) return explicit;
  const kind = resolveWallSectionKind(config, cardinalSideFromOutward(edge.outward), floor);
  if (kind === "glass" && floor === 0 && edge.isEntryEdge) return "open";
  return kind;
}

/** Upsert one bay's section kind. */
export function setWallBaySectionOverride(
  overrides: WallBaySectionOverride[] | undefined,
  side: WallSideId,
  floor: number,
  bayIndex: number,
  kind: WallSectionKind
): WallBaySectionOverride[] {
  const rest = (overrides ?? []).filter(
    (s) => !(s.side === side && s.floor === floor && s.bayIndex === bayIndex)
  );
  return [...rest, { side, floor, bayIndex, kind }];
}

/** Apply the same kind to bays bayStart…bayEnd inclusive. */
export function setWallBaySectionRange(
  overrides: WallBaySectionOverride[] | undefined,
  side: WallSideId,
  floor: number,
  bayStart: number,
  bayEnd: number,
  kind: WallSectionKind
): WallBaySectionOverride[] {
  let next = overrides ?? [];
  const lo = Math.min(bayStart, bayEnd);
  const hi = Math.max(bayStart, bayEnd);
  for (let i = lo; i <= hi; i++) {
    next = setWallBaySectionOverride(next, side, floor, i, kind);
  }
  return next;
}

/** Remove bay overrides on a side/floor; optional bay range. */
export function clearWallBaySectionOverrides(
  overrides: WallBaySectionOverride[] | undefined,
  side: WallSideId,
  floor: number,
  bayStart?: number,
  bayEnd?: number
): WallBaySectionOverride[] {
  const list = overrides ?? [];
  if (bayStart === undefined) {
    return list.filter((s) => !(s.side === side && s.floor === floor));
  }
  const lo = Math.min(bayStart, bayEnd ?? bayStart);
  const hi = Math.max(bayStart, bayEnd ?? bayStart);
  return list.filter(
    (s) =>
      !(
        s.side === side &&
        s.floor === floor &&
        s.bayIndex >= lo &&
        s.bayIndex <= hi
      )
  );
}

/** Immutably upsert a section override for (side, floor). */
export function setWallSectionOverride(
  overrides: WallSectionOverride[] | undefined,
  side: WallSideId,
  floor: number,
  kind: WallSectionKind
): WallSectionOverride[] {
  const rest = (overrides ?? []).filter((s) => !(s.side === side && s.floor === floor));
  return [...rest, { side, floor, kind }];
}

/** Remove a section override, reverting (side, floor) to the legacy default. */
export function clearWallSectionOverride(
  overrides: WallSectionOverride[] | undefined,
  side: WallSideId,
  floor: number
): WallSectionOverride[] {
  return (overrides ?? []).filter((s) => !(s.side === side && s.floor === floor));
}
