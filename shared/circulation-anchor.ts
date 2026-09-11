/**
 * Circulation anchor — where the 4×4 m vertical circulation slot lives.
 * Must be resolved before floor openings, ramps, and opening guard gaps.
 */

import type { ShaftEdgeId } from "./connection-ports";
import type { ShaftBounds, RampType } from "./kit-geometry";
import type { BuildingConfig, BuildingSpan, SceneLayout } from "./types";
import { GRID, buildingFootprintM, footprintSizeM } from "./types";
import {
  footprintPerimeter,
  pointInPolygon,
  polygonFlatSouthOffsetRad,
  regularPolygonVertices,
} from "./perimeter";
import { isNonRectPlan, planPerimeterForConfig } from "./plan-shape";
import { footprintRectForFloor } from "./floor-massing";

export type CirculationKind = RampType | "elevator" | "none";

/** Explicit circulation placement — supersedes implicit rampCell → opening coupling. */
export interface CirculationConfig {
  /**
   * `core_v2` is the sealed 8x8 m circulation prefab (4x4 m elevator shaft plus
   * a fixed stair/walk ring and its own thresholds). Missing/`legacy` preserves
   * the original parametric 4x4 m ramp cartridge for saved projects.
   */
  system?: "legacy" | "core_v2";
  /** Parcel within the building footprint that hosts the slot (multi-parcel layouts). */
  parcel?: { col: number; row: number };
  /**
   * 4 m structural bay on the full footprint grid (any span).
   * When set, overrides parcel-center placement so the Shape bay map moves the shaft.
   */
  bay?: { col: number; row: number };
  /** Slot footprint in meters (default GRID.cellSize = 4). */
  slotSize?: number;
  /** Shaft edge where ramp/stairs attach (default per-floor switchback). */
  entryEdge?: ShaftEdgeId;
  /**
   * Total elevator cars for this building, including the cab inside the main
   * stair/elevator core. Core v2 supports 1..4; extra elevator-only shafts are
   * distributed automatically into bays that fit every served floor.
   */
  elevatorCount?: number;
  kind?: CirculationKind;
}

/** Fixed geometry contract for the sealed circulation core. */
export const CIRCULATION_CORE_V2_SIZE_M = 8;
export const CIRCULATION_CORE_V2_SHAFT_SIZE_M = 4;

export function usesCirculationCoreV2(building: BuildingConfig): boolean {
  // A launch-pad building has no shaft for a core to occupy. Leaving core_v2 true here
  // would rebuild the stairs, landings and cab the author chose to retire — and a saved
  // build carries `circulation.system` forward even after the mode changes.
  if (building.circulationMode === "launch") return false;
  return building.circulation?.system === "core_v2";
}

/** A vertical core is only needed when another storey or the roof deck must be reached. */
export function verticalCirculationRequired(building: BuildingConfig): boolean {
  // A building whose way up is TRAVERSAL needs no built core. The pads are the vertical
  // link, and asking for a ramp on top of them is what kept launch buildings from
  // publishing honestly — the retirement of the lift was never finished until this.
  if (building.circulationMode === "launch") return false;
  return (building.floors ?? 1) > 1 || building.roofTerrace === true;
}

/** Upgrade a design while preserving its chosen position and boarding edge. */
export function withCirculationCoreV2(building: BuildingConfig): BuildingConfig {
  const { rampCell: _legacyRampCell, ...withoutLegacyRampCell } = building;
  return {
    ...withoutLegacyRampCell,
    rampType: "spiral",
    circulationMode: "elevator",
    circulationStairs: true,
    circulationOverrides: undefined,
    circulation: {
      ...(building.circulation ?? {}),
      system: "core_v2",
      slotSize: CIRCULATION_CORE_V2_SIZE_M,
      entryEdge: building.circulation?.entryEdge ?? "south",
    },
  };
}

/** Per-floor circulation bay override — disables elevator building-wide when any exist. */
export interface CirculationFloorOverride {
  floor: number;
  bay: { col: number; row: number };
}

export interface CirculationAnchor {
  centerX: number;
  centerZ: number;
  slotSize: number;
  parcelCol: number;
  parcelRow: number;
  bayCol?: number;
  bayRow?: number;
}

export interface CirculationAnchorInput {
  span: BuildingSpan;
  layout: SceneLayout;
  /** Explicit footprint meters — wins over span-derived size (config-aware callers). */
  footprint?: { width: number; depth: number };
  parcel?: { col: number; row: number };
  bay?: { col: number; row: number };
  slotSize?: number;
}

function clampIndex(value: number, maxInclusive: number): number {
  return Math.min(Math.max(0, value), maxInclusive);
}

/** Center of a 4 m bay cell within a footprint (building-local XZ). */
export function bayCellCenter(
  col: number,
  row: number,
  footprintW: number,
  footprintD: number,
  cellSize: number
): { x: number; z: number } {
  return {
    x: col * cellSize - footprintW / 2 + cellSize / 2,
    z: row * cellSize - footprintD / 2 + cellSize / 2,
  };
}

/** Center of a parcel cell within the building footprint (building-local XZ). */
export function parcelCellCenter(
  col: number,
  row: number,
  footprintW: number,
  footprintD: number,
  parcelSize = GRID.parcelSize
): { x: number; z: number } {
  return {
    x: -footprintW / 2 + col * parcelSize + parcelSize / 2,
    z: -footprintD / 2 + row * parcelSize + parcelSize / 2,
  };
}

/**
 * Resolve circulation slot center from layout inputs.
 * - `circulation.bay` (4 m grid over the full footprint) wins on any size — this is what
 *   the Shape-stage bay map writes. Without this, 2×2 / 3×3 buildings ignored bay clicks
 *   and the shaft stayed at parcel center while the sidebar highlight moved.
 * - Else multi-parcel: parcel cell (rampCell / circulation.parcel).
 * - Else single-parcel: footprint center (0, 0).
 */
export function resolveCirculationAnchorInput(input: CirculationAnchorInput): CirculationAnchor {
  const { span, layout } = input;
  const slotSize = input.slotSize ?? GRID.cellSize;
  const { width, depth } = input.footprint ?? footprintSizeM(span, layout);

  const parcelCols = Math.max(1, Math.round(width / GRID.parcelSize));
  const parcelRows = Math.max(1, Math.round(depth / GRID.parcelSize));
  const parcelSource = input.parcel ?? { col: 0, row: 0 };
  const parcelCol = clampIndex(parcelSource.col, parcelCols - 1);
  const parcelRow = clampIndex(parcelSource.row, parcelRows - 1);

  if (input.bay) {
    const maxCol = maxBayIndex(width, GRID.cellSize);
    const maxRow = maxBayIndex(depth, GRID.cellSize);
    const bayCol = clampIndex(input.bay.col, maxCol);
    const bayRow = clampIndex(input.bay.row, maxRow);
    const center = bayCellCenter(bayCol, bayRow, width, depth, GRID.cellSize);
    return {
      centerX: center.x,
      centerZ: center.z,
      slotSize,
      parcelCol,
      parcelRow,
      bayCol,
      bayRow,
    };
  }

  // Explicit per-parcel placement (circulation.parcel / rampCell) on a multi-parcel
  // footprint → the centre of THAT parcel. Preserved for callers that deliberately
  // pin the shaft to a parcel.
  if (input.parcel && !(parcelCols === 1 && parcelRows === 1)) {
    const center = parcelCellCenter(parcelCol, parcelRow, width, depth);
    return { centerX: center.x, centerZ: center.z, slotSize, parcelCol, parcelRow };
  }

  // No bay and no explicit parcel → the FOOTPRINT CENTRE (0,0) for every size, so a 4 m
  // slot straddles cell boundaries dead-centre exactly as the single-parcel path always
  // did. The old default dropped a multi-parcel shaft into a corner parcel — off to one
  // side, and on a shallow 1-parcel-deep building the elevator visibly sat off centre and
  // caught the narrow floor.
  return {
    centerX: 0,
    centerZ: 0,
    slotSize,
    parcelCol,
    parcelRow,
  };
}

/** Resolve circulation anchor from building config (canonical entry point). */
export function resolveCirculationAnchor(
  building: BuildingConfig,
  layout: SceneLayout
): CirculationAnchor {
  const circulation = building.circulation;
  return resolveCirculationAnchorInput({
    span: building.buildingSpan ?? "single",
    layout,
    footprint: buildingFootprintM(building, layout),
    parcel: circulation?.parcel ?? building.rampCell,
    bay: circulation?.bay,
    slotSize: circulation?.slotSize,
  });
}

function shaftBoundsFromAnchor(anchor: CirculationAnchor): ShaftBounds {
  const h = anchor.slotSize / 2;
  return {
    centerX: anchor.centerX,
    centerZ: anchor.centerZ,
    size: anchor.slotSize,
    minX: anchor.centerX - h,
    maxX: anchor.centerX + h,
    minZ: anchor.centerZ - h,
    maxZ: anchor.centerZ + h,
  };
}

export function resolveCirculationBounds(
  building: BuildingConfig,
  layout: SceneLayout
): ShaftBounds {
  return shaftBoundsFromAnchor(resolveCirculationAnchor(building, layout));
}

/** Central cab shaft. In v2 the 8 m host opening wraps a fixed 4 m elevator shaft. */
export function resolveElevatorShaftBounds(
  building: BuildingConfig,
  layout: SceneLayout
): ShaftBounds {
  const outer = resolveCirculationBounds(building, layout);
  if (!usesCirculationCoreV2(building)) return outer;
  const half = CIRCULATION_CORE_V2_SHAFT_SIZE_M / 2;
  return {
    centerX: outer.centerX,
    centerZ: outer.centerZ,
    size: CIRCULATION_CORE_V2_SHAFT_SIZE_M,
    minX: outer.centerX - half,
    maxX: outer.centerX + half,
    minZ: outer.centerZ - half,
    maxZ: outer.centerZ + half,
  };
}

/**
 * @deprecated Prefer `resolveCirculationAnchor` / `resolveCirculationBounds`.
 * Kept for call sites that pass raw parcel indices.
 */
export function resolveShaftCenter(
  footprintW: number,
  footprintD: number,
  span: BuildingSpan,
  rampCol: number,
  rampRow: number,
  layoutCols: number,
  layoutRows: number
): { x: number; z: number } {
  void footprintW;
  void footprintD;
  const anchor = resolveCirculationAnchorInput({
    span,
    layout: { cols: layoutCols, rows: layoutRows },
    parcel: { col: rampCol, row: rampRow },
  });
  return { x: anchor.centerX, z: anchor.centerZ };
}

/** Effective circulation kind — ramp type or explicit override. */
export function resolveCirculationKind(building: BuildingConfig): CirculationKind {
  const kind = building.circulation?.kind;
  if (kind) return kind;
  return building.rampType ?? "spiral";
}

// "Centered enough" for the elevator = at the center-MOST 4 m cell, not exactly x/z=0.
// Every whole-parcel footprint is an even number of 4 m cells (a parcel = 4 cells), so the
// true center falls BETWEEN cells and no cell sits at 0 — the closest is half a cell (2 m)
// away. Demanding exactly 0 made the elevator impossible on ANY multi-parcel building
// (owner's 8×1: "can't select Elevator only"). Half a cell + epsilon accepts the
// center-most cell (and only it — the next cell out is a full 4 m away).
const CENTER_EPS = GRID.cellSize / 2 + 0.05;

/** True when the shaft sits at (or as near as the 4 m grid allows to) the footprint center. */
export function isCirculationCentered(
  building: BuildingConfig,
  layout: SceneLayout,
  floorIndex = 0
): boolean {
  const anchor = resolveCirculationAnchorForFloor(building, layout, floorIndex);
  return Math.abs(anchor.centerX) <= CENTER_EPS && Math.abs(anchor.centerZ) <= CENTER_EPS;
}

/**
 * True when this building should be built with NO ramp/stairs — the elevator is the sole
 * vertical access. Gated on the viability the elevator platform needs: a BUILDING-WIDE
 * shaft. Per-floor overrides genuinely can't host one cab, so those fall back to a ramp
 * and the building is never left with no way up. The composer's ramp skip and the
 * elevator-platform builder MUST agree on this predicate.
 *
 * NOT gated on being centred. That requirement was inherited from the ramp+elevator combo,
 * where the cab rides the spiral's eye — but every piece of elevator geometry (shaft
 * bounds, glass enclosure, deck, guard ring) already resolves from the chosen bay, so an
 * off-centre elevator builds correctly. Requiring the centre made the elevator unusable
 * with an atrium, where the centre is the void: the cab would open onto a hole with no
 * floor to step out onto (2026-07-22).
 */
export function isElevatorOnlyActive(building: BuildingConfig, layout: SceneLayout): boolean {
  return (
    building.circulationMode === "elevator_only" &&
    !hasPerFloorCirculationOverride(building)
  );
}

export function hasPerFloorCirculationOverride(building: BuildingConfig): boolean {
  return (building.circulationOverrides?.length ?? 0) > 0;
}

export function circulationOverrideForFloor(
  building: BuildingConfig,
  floorIndex: number
): CirculationFloorOverride | undefined {
  return building.circulationOverrides?.find((o) => o.floor === floorIndex);
}

/** Building-wide bay or per-floor override for the given story. */
export function resolveCirculationAnchorForFloor(
  building: BuildingConfig,
  layout: SceneLayout,
  floorIndex: number
): CirculationAnchor {
  const override = circulationOverrideForFloor(building, floorIndex);
  const circulation = building.circulation;
  return resolveCirculationAnchorInput({
    span: building.buildingSpan ?? "single",
    layout,
    footprint: buildingFootprintM(building, layout),
    parcel: circulation?.parcel ?? building.rampCell,
    bay: override?.bay ?? circulation?.bay,
    slotSize: circulation?.slotSize,
  });
}

export function resolveCirculationBoundsForFloor(
  building: BuildingConfig,
  layout: SceneLayout,
  floorIndex: number
): ShaftBounds {
  return shaftBoundsFromAnchor(resolveCirculationAnchorForFloor(building, layout, floorIndex));
}

/** Max bay index for a 4 m grid on a footprint (inclusive). */
export function maxBayIndex(footprintM: number, cellSize = GRID.cellSize): number {
  return Math.max(0, Math.floor(footprintM / cellSize) - 1);
}

/**
 * Does the slab HOLE cut around a shaft at this centre stay inside the polygon outline?
 *
 * The slot fitting is not enough. The hole is a same-shape polygon of circumradius
 * ~slot/2 * sqrt(2) — about 1.5x the slot — so near a facet it escapes the outline even
 * though all four slot corners are inside. THREE.Shape cannot cut a hole that is not
 * fully contained, so the floor's walk collider comes out SOLID across the void, and the
 * publish gate dead-ends on "walkable surfaces are missing collision data" with nothing
 * the owner can click to fix (2026-07-22: a 21-floor hexagon had 2 of the hole's 6
 * vertices outside the outline, blocking every publish).
 *
 * Mirrors `circulationPolygonHole()` in floor-void-policy.ts — same radius, same ring.
 */
export function polygonShaftHoleFits(
  building: BuildingConfig,
  layout: SceneLayout,
  centerX: number,
  centerZ: number,
  slotSize: number
): boolean {
  if (!isNonRectPlan(building)) return true;
  const { width, depth } = buildingFootprintM(building, layout);
  // Containment must be tested against the REAL plan: a regular n-gon rebuilt from the
  // facet count would happily place a shaft in an L-plan's missing corner.
  const poly = planPerimeterForConfig(building, width, depth);
  if (usesCirculationCoreV2(building)) {
    const half = slotSize / 2 + 0.05;
    return [
      { x: centerX - half, z: centerZ - half },
      { x: centerX + half, z: centerZ - half },
      { x: centerX + half, z: centerZ + half },
      { x: centerX - half, z: centerZ + half },
    ].every((v) => pointInPolygon(v.x, v.z, poly.vertices));
  }
  const holeRadius = (slotSize / 2) * Math.SQRT2 + 0.15;
  const sides = poly.edges.length;
  const ring = regularPolygonVertices(sides, holeRadius, polygonFlatSouthOffsetRad(sides));
  return ring.every((v) => pointInPolygon(v.x + centerX, v.z + centerZ, poly.vertices));
}

/**
 * Validate a circulation bay keeps the full slot inside the footprint (and polygon skin),
 * AND inside every massed (shrunk/anchored) floor the shaft spans — a bay under open sky
 * beside a stepped tower otherwise builds that floor's opening/guards floating in mid-air.
 * `opts.floor` scopes the massing check to one run (per-floor overrides): floor f → f+1.
 */
export function validateCirculationBay(
  building: BuildingConfig,
  layout: SceneLayout,
  bay: { col: number; row: number },
  opts?: { floor?: number }
): string | null {
  // A one-storey building with no accessible roof has no vertical run. Retaining a
  // dormant bay in a saved plan is harmless and lets it become active if floors are
  // added later, but it must not reject floor content or reserve usable space now.
  if (!verticalCirculationRequired(building)) return null;
  const { width, depth } = buildingFootprintM(building, layout);
  const slotSize = building.circulation?.slotSize ?? GRID.cellSize;
  const maxCol = maxBayIndex(width, GRID.cellSize);
  const maxRow = maxBayIndex(depth, GRID.cellSize);
  if (bay.col < 0 || bay.row < 0 || bay.col > maxCol || bay.row > maxRow) {
    return "That spot is outside the building — pick one of the highlighted bays.";
  }
  const center = bayCellCenter(bay.col, bay.row, width, depth, GRID.cellSize);
  const half = slotSize / 2;
  const corners = [
    { x: center.x - half, z: center.z - half },
    { x: center.x + half, z: center.z - half },
    { x: center.x + half, z: center.z + half },
    { x: center.x - half, z: center.z + half },
  ];
  if (isNonRectPlan(building)) {
    const poly = planPerimeterForConfig(building, width, depth);
    for (const c of corners) {
      if (!pointInPolygon(c.x, c.z, poly.vertices)) {
        return "Circulation slot must stay inside the building outline";
      }
    }
    if (!polygonShaftHoleFits(building, layout, center.x, center.z, slotSize)) {
      return "Too close to the wall — the shaft opening would fall outside the building outline. Move the core inward.";
    }
    return null;
  }
  const halfW = width / 2;
  const halfD = depth / 2;
  for (const c of corners) {
    if (c.x < -halfW || c.x > halfW || c.z < -halfD || c.z > halfD) {
      return "Circulation slot must stay inside the footprint";
    }
  }

  // Per-floor massing containment. The shaft is ONE vertical run: with a building-wide
  // bay (no opts.floor) every floor from 1 up must contain the slot; a per-floor
  // override's run only spans its own floor → the next slab.
  if (building.floorFootprints?.length) {
    const EPS = 0.01;
    const topFloor = Math.max(0, (building.floors ?? 1) - 1);
    const floorsToCheck =
      opts?.floor !== undefined
        ? [Math.min(opts.floor, topFloor), Math.min(opts.floor + 1, topFloor)]
        : Array.from({ length: topFloor }, (_, i) => i + 1);
    for (const f of floorsToCheck) {
      if (f <= 0) continue;
      const rect = footprintRectForFloor(building, layout, f);
      const minX = rect.offsetX - rect.width / 2 - EPS;
      const maxX = rect.offsetX + rect.width / 2 + EPS;
      const minZ = rect.offsetZ - rect.depth / 2 - EPS;
      const maxZ = rect.offsetZ + rect.depth / 2 + EPS;
      for (const c of corners) {
        if (c.x < minX || c.x > maxX || c.z < minZ || c.z > maxZ) {
          return (
            `That spot is open sky at level ${f + 1} — the smaller upper floor doesn't cover it. ` +
            `Pick a bay under every floor, or enlarge level ${f + 1} in Floor footprint.`
          );
        }
      }
    }
  }
  return null;
}

/** Nearest valid bay to a (possibly stale) pick, or null when no bay fits at all. */
export function nearestValidBay(
  building: BuildingConfig,
  layout: SceneLayout,
  bay: { col: number; row: number },
  opts?: { floor?: number }
): { col: number; row: number } | null {
  const { width, depth } = buildingFootprintM(building, layout);
  const maxCol = maxBayIndex(width, GRID.cellSize);
  const maxRow = maxBayIndex(depth, GRID.cellSize);
  let best: { col: number; row: number } | null = null;
  let bestD = Infinity;
  for (let col = 0; col <= maxCol; col++) {
    for (let row = 0; row <= maxRow; row++) {
      if (validateCirculationBay(building, layout, { col, row }, opts) !== null) continue;
      const d = (col - bay.col) ** 2 + (row - bay.row) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { col, row };
      }
    }
  }
  return best;
}

/**
 * Auto-correct stale circulation picks after the geometry changed under them
 * (footprint shrink, shape switch): a saved bay or per-floor override that no longer
 * fits snaps to the nearest valid bay instead of surfacing a coordinate error the
 * user never caused. Returns the input object unchanged when everything still fits.
 */
export function clampCirculationBays(
  building: BuildingConfig,
  layout: SceneLayout
): BuildingConfig {
  let changed = false;

  let circulation = building.circulation;
  if (circulation?.bay && validateCirculationBay(building, layout, circulation.bay) !== null) {
    const snapped = nearestValidBay(building, layout, circulation.bay);
    circulation = { ...circulation };
    if (snapped) circulation.bay = snapped;
    else delete circulation.bay; // no bay fits — fall back to the default center
    changed = true;
  }

  // DEFAULT placement (no explicit bay — e.g. after "Reset to center") must respect
  // massing too: a stepped tower whose upper floors don't cover the building center
  // otherwise builds the shaft's openings/guards floating in open sky at those levels.
  // Validate the ACTUAL anchor slot rect (not a bay quantization — the true default can
  // straddle a bay boundary) and materialize the nearest valid bay so the widget shows
  // where the shaft went.
  // Also covers POLYGON footprints with no explicit bay. A legacy `rampCell`/`parcel`
  // (or the plain default) can park the shaft near a facet where the slab's HOLE escapes
  // the outline — THREE.Shape then refuses to cut it, the floor's walk collider comes out
  // solid over the void, and publish dead-ends on "walkable surfaces are missing collision
  // data" with nothing the owner can click to fix it (2026-07-22). Snapping the resolved
  // anchor to the nearest valid bay repairs those configs on load instead.
  const polygonFootprint =
    typeof building.footprintSides === "number" && building.footprintSides >= 5;
  if (!circulation?.bay && (building.floorFootprints?.length || polygonFootprint)) {
    const anchor = resolveCirculationAnchorInput({
      span: building.buildingSpan ?? "single",
      layout,
      footprint: buildingFootprintM(building, layout),
      parcel: circulation?.parcel ?? building.rampCell,
      slotSize: circulation?.slotSize,
    });
    const half = anchor.slotSize / 2;
    const EPS = 0.01;
    const topFloor = Math.max(0, (building.floors ?? 1) - 1);
    let defaultInvalid = false;
    if (polygonFootprint) {
      // Test the ACTUAL anchor centre. A parcel-derived default does not sit on the 4 m
      // bay lattice (a legacy rampCell landed the shaft at -40 where the nearest bay
      // centre is -38), so quantizing first would validate a different spot than the one
      // that actually gets built.
      defaultInvalid = !polygonShaftHoleFits(
        building,
        layout,
        anchor.centerX,
        anchor.centerZ,
        anchor.slotSize
      );
    }
    for (let f = 1; f <= topFloor && !defaultInvalid; f++) {
      const rect = footprintRectForFloor(building, layout, f);
      defaultInvalid =
        anchor.centerX - half < rect.offsetX - rect.width / 2 - EPS ||
        anchor.centerX + half > rect.offsetX + rect.width / 2 + EPS ||
        anchor.centerZ - half < rect.offsetZ - rect.depth / 2 - EPS ||
        anchor.centerZ + half > rect.offsetZ + rect.depth / 2 + EPS;
    }
    if (defaultInvalid) {
      const { width, depth } = buildingFootprintM(building, layout);
      const approx = {
        col: clampIndex(
          Math.round((anchor.centerX + width / 2 - GRID.cellSize / 2) / GRID.cellSize),
          maxBayIndex(width, GRID.cellSize)
        ),
        row: clampIndex(
          Math.round((anchor.centerZ + depth / 2 - GRID.cellSize / 2) / GRID.cellSize),
          maxBayIndex(depth, GRID.cellSize)
        ),
      };
      const snapped = nearestValidBay(building, layout, approx);
      if (snapped) {
        circulation = { ...(circulation ?? {}), bay: snapped };
        changed = true;
      }
    }
  }

  let overrides = building.circulationOverrides;
  if (overrides?.length) {
    const next = overrides
      .map((o) => {
        // Floor-scoped: an override's run only spans its own floor → the next slab, so
        // don't demand containment in every massed floor the way the building-wide bay must.
        if (validateCirculationBay(building, layout, o.bay, { floor: o.floor }) === null) return o;
        const snapped = nearestValidBay(building, layout, o.bay, { floor: o.floor });
        return snapped ? { ...o, bay: snapped } : null;
      })
      .filter((o): o is NonNullable<typeof o> => o !== null);
    if (
      next.length !== overrides.length ||
      next.some((o, i) => o !== overrides![i])
    ) {
      overrides = next.length ? next : undefined;
      changed = true;
    }
  }

  if (!changed) return building;
  return { ...building, circulation, circulationOverrides: overrides };
}
