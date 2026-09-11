/** Automatic, conservative placement for core-v2 auxiliary elevator shafts. */

import type { ShaftBounds } from "./kit-geometry";
import { pointInPolygon } from "./perimeter";
import { planPerimeterForConfig } from "./plan-shape";
import { footprintRectForFloor } from "./floor-massing";
import {
  CIRCULATION_CORE_V2_SHAFT_SIZE_M,
  resolveCirculationBounds,
  usesCirculationCoreV2,
  verticalCirculationRequired,
} from "./circulation-anchor";
import { GRID, buildingFootprintM, type BuildingConfig, type SceneLayout } from "./types";

export const MAX_ELEVATOR_COUNT = 4;
export const AUX_ELEVATOR_CLEARANCE_M = 1;

function sampledBayIndices(count: number): number[] {
  if (count <= 25) return Array.from({ length: count }, (_, index) => index);
  const indices = new Set<number>();
  for (let i = 0; i < 25; i++) indices.add(Math.round((i * (count - 1)) / 24));
  return [...indices];
}

export function requestedElevatorCount(building: BuildingConfig): number {
  if (!usesCirculationCoreV2(building) || !verticalCirculationRequired(building)) return 0;
  return Math.max(
    1,
    Math.min(MAX_ELEVATOR_COUNT, Math.round(building.circulation?.elevatorCount ?? 1))
  );
}

function cornersFitFloor(
  building: BuildingConfig,
  layout: SceneLayout,
  floor: number,
  centerX: number,
  centerZ: number
): boolean {
  const rect = footprintRectForFloor(building, layout, floor);
  const perimeter = planPerimeterForConfig(building, rect.width, rect.depth, floor);
  const half = CIRCULATION_CORE_V2_SHAFT_SIZE_M / 2;
  const inset = 0.04;
  return [
    { x: centerX - half + inset, z: centerZ - half + inset },
    { x: centerX + half - inset, z: centerZ - half + inset },
    { x: centerX + half - inset, z: centerZ + half - inset },
    { x: centerX - half + inset, z: centerZ + half - inset },
  ].every((p) =>
    pointInPolygon(p.x - rect.offsetX, p.z - rect.offsetZ, perimeter.vertices)
  );
}

function separatedFrom(bounds: ShaftBounds, other: ShaftBounds, clearance: number): boolean {
  return (
    bounds.maxX + clearance <= other.minX ||
    bounds.minX - clearance >= other.maxX ||
    bounds.maxZ + clearance <= other.minZ ||
    bounds.minZ - clearance >= other.maxZ
  );
}

function asBounds(centerX: number, centerZ: number): ShaftBounds {
  const half = CIRCULATION_CORE_V2_SHAFT_SIZE_M / 2;
  return {
    centerX,
    centerZ,
    size: CIRCULATION_CORE_V2_SHAFT_SIZE_M,
    minX: centerX - half,
    maxX: centerX + half,
    minZ: centerZ - half,
    maxZ: centerZ + half,
  };
}

/**
 * Resolve elevator-only shafts. Candidates are 4 m grid bays and must fit every
 * occupied storey. Selection maximises distance from the existing cores so large
 * buildings receive useful coverage without exposing fragile free placement.
 */
export function resolveAuxiliaryElevatorBounds(
  building: BuildingConfig,
  layout: SceneLayout
): ShaftBounds[] {
  const wanted = Math.max(0, requestedElevatorCount(building) - 1);
  if (!wanted) return [];

  const full = buildingFootprintM(building, layout);
  const cols = Math.max(1, Math.round(full.width / GRID.cellSize));
  const rows = Math.max(1, Math.round(full.depth / GRID.cellSize));
  const primary = resolveCirculationBounds(building, layout);
  const candidates: ShaftBounds[] = [];

  // A 45x45-parcel scene contains 32,400 quarter-parcel bays. Sampling each axis
  // evenly preserves corners, edges and the centre while bounding interactive work.
  for (const row of sampledBayIndices(rows)) {
    for (const col of sampledBayIndices(cols)) {
      const centerX = -full.width / 2 + GRID.cellSize / 2 + col * GRID.cellSize;
      const centerZ = -full.depth / 2 + GRID.cellSize / 2 + row * GRID.cellSize;
      const bounds = asBounds(centerX, centerZ);
      if (!separatedFrom(bounds, primary, AUX_ELEVATOR_CLEARANCE_M)) continue;
      let fits = true;
      for (let floor = 0; floor < building.floors; floor++) {
        if (!cornersFitFloor(building, layout, floor, centerX, centerZ)) {
          fits = false;
          break;
        }
      }
      if (fits) candidates.push(bounds);
    }
  }

  const chosen: ShaftBounds[] = [];
  while (chosen.length < wanted) {
    let best: ShaftBounds | null = null;
    let bestDistance = -Infinity;
    for (const candidate of candidates) {
      if (chosen.includes(candidate)) continue;
      if (!chosen.every((other) => separatedFrom(candidate, other, AUX_ELEVATOR_CLEARANCE_M))) {
        continue;
      }
      const nearest = Math.min(
        Math.hypot(candidate.centerX - primary.centerX, candidate.centerZ - primary.centerZ),
        ...chosen.map((other) =>
          Math.hypot(candidate.centerX - other.centerX, candidate.centerZ - other.centerZ)
        )
      );
      if (nearest > bestDistance) {
        best = candidate;
        bestDistance = nearest;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  return chosen;
}

export function effectiveElevatorCount(
  building: BuildingConfig,
  layout: SceneLayout
): number {
  const requested = requestedElevatorCount(building);
  return requested ? 1 + resolveAuxiliaryElevatorBounds(building, layout).length : 0;
}
