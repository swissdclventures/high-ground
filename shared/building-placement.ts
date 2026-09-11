/**
 * Authoritative geometry for placing several buildings on one scene.
 *
 * `originM` is the south-west corner of the ROTATED building's axis-aligned bounds,
 * measured from the scene's south-west corner. Keeping that contract here prevents the
 * viewport, free-space picker and publish gate from each inventing different rotation
 * math.
 */
import {
  GRID,
  MAX_SCENE_SIDE,
  buildingHeightM,
  buildingTopM,
  buildingFootprintM,
  buildingPlacementOffset,
  clampBuildingConfig,
  dclPublishCeilingM,
  sceneSizeM,
  type PlacedBuilding,
  type SceneLayout,
} from "./types";

export interface PlacementPoint {
  x: number;
  z: number;
}

export interface ResolvedBuildingPlacement {
  id: string;
  center: PlacementPoint;
  origin: PlacementPoint;
  span: { width: number; depth: number };
  corners: [PlacementPoint, PlacementPoint, PlacementPoint, PlacementPoint];
}

export type BuildingPlacementIssue =
  | { kind: "out_of_bounds"; buildingId: string; message: string }
  | { kind: "height_limit"; buildingId: string; message: string }
  | { kind: "edge_clearance"; buildingId: string; message: string }
  | {
      kind: "building_clearance";
      buildingId: string;
      otherBuildingId: string;
      message: string;
    }
  | { kind: "overlap"; buildingId: string; otherBuildingId: string; message: string };

/**
 * A building's authored footprint before a too-small scene gets a chance to clamp it.
 * This is intentionally narrower than `buildingFootprintM`: it exists for recovering a
 * multi-building project whose scene was incorrectly persisted as 1x1. Measuring through
 * the ordinary helper in that state turns every building into 16x16 m and loses the very
 * dimensions needed to recover the parcel footprint.
 */
function authoredBuildingFootprintM(
  building: PlacedBuilding,
  layout: SceneLayout
): { width: number; depth: number } {
  const fp = building.config.footprintM;
  if (
    fp &&
    Number.isFinite(fp.width) &&
    Number.isFinite(fp.depth) &&
    fp.width > 0 &&
    fp.depth > 0
  ) {
    return { width: fp.width, depth: fp.depth };
  }

  const span = building.config.buildingSpan ?? "single";
  if (span === "fill") return sceneSizeM(layout);
  if (span === "single") {
    return { width: GRID.parcelSize, depth: GRID.parcelSize };
  }
  const match = /^(\d+)x(\d+)$/.exec(span);
  return match
    ? {
        width: Math.max(1, Number(match[1])) * GRID.parcelSize,
        depth: Math.max(1, Number(match[2])) * GRID.parcelSize,
      }
    : { width: GRID.parcelSize, depth: GRID.parcelSize };
}

/**
 * Smallest rectangular scene that contains the buildings at their AUTHORED positions.
 * It only grows; it never repacks or shifts buildings, because changing the arrangement
 * would turn a parcel-recovery repair into a redesign.
 */
export function sceneLayoutContainingBuildings(
  buildings: readonly PlacedBuilding[],
  layout: SceneLayout
): SceneLayout {
  let maxX = layout.cols * GRID.parcelSize;
  let maxZ = layout.rows * GRID.parcelSize;

  for (const building of buildings) {
    const origin = building.originM ?? building.config.siteOriginM;
    if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) continue;
    // Negative origins need a coordinated translation of every site-level object, not
    // just a larger rectangle. Leave those to the placement gate instead of moving only
    // the buildings and breaking authored site content.
    if (origin.x < 0 || origin.z < 0) continue;

    const footprint = authoredBuildingFootprintM(building, layout);
    const angle = (normalizedBuildingRotation(building.rotationDeg) * Math.PI) / 180;
    const spanX = Math.abs(Math.cos(angle)) * footprint.width + Math.abs(Math.sin(angle)) * footprint.depth;
    const spanZ = Math.abs(Math.sin(angle)) * footprint.width + Math.abs(Math.cos(angle)) * footprint.depth;
    maxX = Math.max(maxX, origin.x + spanX);
    maxZ = Math.max(maxZ, origin.z + spanZ);
  }

  return {
    cols: Math.min(MAX_SCENE_SIDE, Math.max(layout.cols, Math.ceil((maxX - 0.001) / GRID.parcelSize))),
    rows: Math.min(MAX_SCENE_SIDE, Math.max(layout.rows, Math.ceil((maxZ - 0.001) / GRID.parcelSize))),
  };
}

/**
 * There is deliberately NO minimum clearance between a footprint and the plot edge.
 *
 * A 0.5 m rule used to live here, from the era when exterior walls were authored
 * CENTERED on the footprint line and a flush footprint shipped ~0.15 m of facade past
 * the boundary (2026-08-04 swissverse deploy: west+south facades culled in-world).
 * The composer has since been reworked so every perimeter assembly — walls, fascia,
 * trim, guards, colliders — stays strictly INSIDE the footprint outline (pinned by
 * tests/app/fill-coverage-plot-bounds.test.ts at 1 mm), which is also why fill-coverage
 * builds ship flush and render fine. With the geometry law in place, "the footprint is
 * on the plot" IS the whole rule; the 0.5 m gate only produced false reds on freshly
 * placed buildings (owner, 2026-08-10). Real overhanging geometry (annexes, roof
 * overhangs, custom pieces) is caught by the live measurement in scene/plot-bounds.ts.
 */

export function normalizedBuildingRotation(rotationDeg: number | undefined): number {
  if (!Number.isFinite(rotationDeg)) return 0;
  return ((Number(rotationDeg) % 360) + 360) % 360;
}

/** Persisted lift above the plot datum. Invalid/legacy values resolve safely to ground. */
export function buildingElevationM(placed: Pick<PlacedBuilding, "elevationM">): number {
  const value = Number(placed.elevationM);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Resolve a placed building into the same scene-SW coordinate system used by originM. */
export function resolveBuildingPlacement(
  building: PlacedBuilding,
  layout: SceneLayout
): ResolvedBuildingPlacement {
  const config = clampBuildingConfig(building.config, layout);
  const footprint = buildingFootprintM(config, layout);
  const rotation = normalizedBuildingRotation(building.rotationDeg);
  const angle = (rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfW = footprint.width / 2;
  const halfD = footprint.depth / 2;
  const span = {
    width: 2 * (Math.abs(cos) * halfW + Math.abs(sin) * halfD),
    depth: 2 * (Math.abs(sin) * halfW + Math.abs(cos) * halfD),
  };

  // ID-BLIND. There is no primary building (owner's law, 2026-08-10): any building
  // without an authored `originM` resolves through its OWN config — `siteOriginM` when
  // set, else the site anchor. The removed special case here ("b1 falls back to its
  // config, everyone else lands at (0,0)") was the last place in the placement maths
  // where one building was treated differently from the rest, and a silent (0,0) for a
  // renamed or re-slotted building is exactly the wrong-place-on-the-map bug class.
  let origin = building.originM;
  if (!origin) {
    const scene = sceneSizeM(layout);
    const offset = buildingPlacementOffset(config, layout);
    origin = {
      x: offset.x + scene.width / 2 - span.width / 2,
      z: offset.z + scene.depth / 2 - span.depth / 2,
    };
  }
  const center = { x: origin.x + span.width / 2, z: origin.z + span.depth / 2 };

  const rotate = (x: number, z: number): PlacementPoint => ({
    x: center.x + x * cos + z * sin,
    z: center.z - x * sin + z * cos,
  });
  const corners: ResolvedBuildingPlacement["corners"] = [
    rotate(-halfW, -halfD),
    rotate(halfW, -halfD),
    rotate(halfW, halfD),
    rotate(-halfW, halfD),
  ];

  return { id: building.id, center, origin: { ...origin }, span, corners };
}

function projection(points: readonly PlacementPoint[], axis: PlacementPoint): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    const value = p.x * axis.x + p.z * axis.z;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return [min, max];
}

/** Separating-axis test. Merely touching walls are allowed; positive-area overlap is not. */
export function buildingPlacementsOverlap(
  a: ResolvedBuildingPlacement,
  b: ResolvedBuildingPlacement,
  toleranceM = 0.01
): boolean {
  for (const polygon of [a.corners, b.corners]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!;
      const q = polygon[(i + 1) % polygon.length]!;
      const axis = { x: -(q.z - p.z), z: q.x - p.x };
      const [aMin, aMax] = projection(a.corners, axis);
      const [bMin, bMax] = projection(b.corners, axis);
      if (Math.min(aMax, bMax) - Math.max(aMin, bMin) <= toleranceM) return false;
    }
  }
  return true;
}

/** Validate plot containment and pairwise collision for every persisted building. */
export function validateBuildingPlacements(
  buildings: readonly PlacedBuilding[],
  layout: SceneLayout,
  toleranceM = 0.01
): BuildingPlacementIssue[] {
  const scene = sceneSizeM(layout);
  const resolved = buildings.map((b) => resolveBuildingPlacement(b, layout));
  const issues: BuildingPlacementIssue[] = [];

  for (let index = 0; index < resolved.length; index++) {
    const b = resolved[index]!;
    const placed = buildings[index]!;
    const outside = b.corners.some(
      (p) =>
        p.x < -toleranceM ||
        p.z < -toleranceM ||
        p.x > scene.width + toleranceM ||
        p.z > scene.depth + toleranceM
    );
    if (outside) {
      issues.push({
        kind: "out_of_bounds",
        buildingId: b.id,
        message: `Building ${b.id} extends outside the ${scene.width} × ${scene.depth} m scene`,
      });
      continue;
    }
    const topM =
      buildingElevationM(placed) + buildingTopM(clampBuildingConfig(placed.config, layout));
    // Decentraland's OWN ceiling, not the 6 m-lower authoring target. A build that
    // already stands between the two lines renders fine in-world, and refusing it here
    // was this builder inventing a limit the platform does not have.
    const heightLimitM = dclPublishCeilingM(layout);
    if (topM > heightLimitM + toleranceM) {
      issues.push({
        kind: "height_limit",
        buildingId: b.id,
        message:
          `Building ${b.id} reaches ${topM.toFixed(2)} m including elevation, roof guard and ` +
          `roof crown; Decentraland hides anything above ${heightLimitM.toFixed(2)} m on this scene`,
      });
    }
    // Flush against the edge is fine: perimeter geometry is authored strictly inside
    // the footprint outline (see the clearance note above), so containment of the
    // footprint rectangle is the complete rule.
  }

  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i]!;
      const b = resolved[j]!;
      if (!buildingPlacementsOverlap(a, b, toleranceM)) continue;
      issues.push({
        kind: "overlap",
        buildingId: a.id,
        otherBuildingId: b.id,
        message: `Buildings ${a.id} and ${b.id} overlap`,
      });
    }
  }
  return issues;
}

/**
 * Stricter placement gate for generated multi-building districts.
 *
 * Owner-authored fill buildings may intentionally sit flush with a plot edge, so the
 * ordinary validator must continue to allow them. A generator has no such excuse:
 * keeping two 4 m build cells clear prevents facades, roof furniture, selection helpers,
 * and later edits from visually touching or accidentally crossing the scene boundary.
 */
export function validateProgrammaticBuildingPlacements(
  buildings: readonly PlacedBuilding[],
  layout: SceneLayout,
  minimumEdgeClearanceM = GRID.cellSize * 2,
  minimumBuildingClearanceM = GRID.cellSize * 3
): BuildingPlacementIssue[] {
  const issues = validateBuildingPlacements(buildings, layout);
  const scene = sceneSizeM(layout);
  const resolved = buildings.map((building) => resolveBuildingPlacement(building, layout));
  for (const placement of resolved) {
    const xs = placement.corners.map((point) => point.x);
    const zs = placement.corners.map((point) => point.z);
    const clearance = Math.min(
      Math.min(...xs),
      scene.width - Math.max(...xs),
      Math.min(...zs),
      scene.depth - Math.max(...zs)
    );
    if (clearance + 0.001 >= minimumEdgeClearanceM) continue;
    issues.push({
      kind: "edge_clearance",
      buildingId: placement.id,
      message:
        `Building ${placement.id} has only ${Math.max(0, clearance).toFixed(2)} m of scene-edge ` +
        `clearance; generated buildings require ${minimumEdgeClearanceM.toFixed(2)} m`,
    });
  }

  const bounds = (placement: ResolvedBuildingPlacement) => ({
    minX: Math.min(...placement.corners.map((point) => point.x)),
    maxX: Math.max(...placement.corners.map((point) => point.x)),
    minZ: Math.min(...placement.corners.map((point) => point.z)),
    maxZ: Math.max(...placement.corners.map((point) => point.z)),
  });
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i]!;
      const b = resolved[j]!;
      const aa = bounds(a);
      const bb = bounds(b);
      const dx = Math.max(0, aa.minX - bb.maxX, bb.minX - aa.maxX);
      const dz = Math.max(0, aa.minZ - bb.maxZ, bb.minZ - aa.maxZ);
      const clearance = Math.hypot(dx, dz);
      if (clearance + 0.001 >= minimumBuildingClearanceM) continue;
      issues.push({
        kind: "building_clearance",
        buildingId: a.id,
        otherBuildingId: b.id,
        message:
          `Buildings ${a.id} and ${b.id} have only ${clearance.toFixed(2)} m between their ` +
          `envelopes; generated districts require ${minimumBuildingClearanceM.toFixed(2)} m`,
      });
    }
  }
  return issues;
}

/** Axis-aligned envelope of a resolved placement, in scene SW metres. */
export function occupancyBoxFromPlacement(placement: ResolvedBuildingPlacement): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const xs = placement.corners.map((corner) => corner.x);
  const zs = placement.corners.map((corner) => corner.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

/** Occupancy boxes for every placed building — jump pads, zones and booths all clear these. */
export function placedBuildingOccupancy(
  buildings: readonly PlacedBuilding[],
  layout: SceneLayout
): Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> {
  return buildings.map((building) =>
    occupancyBoxFromPlacement(resolveBuildingPlacement(building, layout))
  );
}
