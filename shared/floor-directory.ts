/**
 * The FLOOR DIRECTORY — "take me to floor 22", with nothing built to carry you.
 *
 * A building contains no traversal objects (★LAW, see `resolveLaunchPads` in
 * traversal.ts): no lift, no shaft, no pad column climbing the facade. But a
 * twenty-storey tower whose only way up is a catapult from the plot is a tower you
 * cannot actually use — you can reach a floor, never CHOOSE one, and never come back
 * down without jumping out of a window.
 *
 * So the floor selector stops being an object and becomes a HUD control: walk inside a
 * building, a Floors chip appears, pick a level, and one `movePlayerTo` puts you there.
 * It cuts no holes and drills no openings — the flight passes through the solid slabs,
 * which is precisely why the shape of the building may change freely without breaking
 * anything. Zero geometry means zero geometry to maintain.
 *
 * WHY THIS IS BAKED AT PUBLISH and not derived at runtime: the scene runtime is handed
 * ONE building config (the active one) plus a list of placed GLBs with no config at all.
 * A nineteen-tower district would therefore offer floor buttons in exactly one of its
 * towers. Everything needed — floor count, per-floor storey heights, roof terrace,
 * footprint, origin, baked yaw — is known here and nowhere else. Same reasoning, same
 * seam, and the same placement helpers as `interior-lamp-plan.ts`.
 */

import type { BuildingConfig, PlacedBuilding, SceneLayout } from "./types";
import { buildingFootprintM, floorBaseY, resolveStoryHeightForFloor } from "./types";
import { footprintRectForFloor } from "./floor-massing";
import { footprintPerimeter } from "./perimeter";
import { placedBuildingOriginDcl } from "./dcl-placement";
import { walkSurfaceY } from "./kit-geometry";
import { launchStopLabel } from "./traversal";
import { assignBuildingDirectoryCodes, buildingDirectoryBaseCode } from "./building-directory";

/** One level the picker can send you to. `y` is a walk surface in DCL scene metres. */
export interface FloorStop {
  level: number | "roof";
  label: string;
  y: number;
}

/**
 * One building's floor list plus the footprint that decides whether you are standing
 * in it. Both are in DCL scene metres — the runtime does no conversion, because a
 * conversion is a place for a mirror to creep in.
 */
export interface BuildingFloorPlan {
  buildingId: string;
  /**
   * The building's directory code (A1, B3 …). It used to be readable only from a plate
   * baked onto the facade, which meant the district wore its numbering on every wall. The
   * HUD carries it now, so the code travels with the guest instead of the architecture.
   */
  code?: string;
  /** Ground-plan outline in DCL scene metres, closed implicitly (last→first). */
  outline: Array<{ x: number; z: number }>;
  /** Scene-metre Y of the ground slab and of the roof — the vertical half of "inside". */
  baseY: number;
  topY: number;
  stops: FloorStop[];
}

/**
 * How far outside the outline still counts as "inside this building".
 *
 * The walls are ~0.3 m thick and stand INSIDE the outline (perimeter clearance), so a
 * player pressed against a window is a few centimetres in. A small skirt keeps the chip
 * from flickering off at the glass. Kept well under the 4 m lattice so it can never
 * reach into the neighbouring tower.
 */
export const FLOOR_DIRECTORY_SKIRT_M = 0.75;

/**
 * Headroom above the roof slab that still counts as inside.
 *
 * You stand ON the roof terrace, i.e. above `topY`, and the roof is a level the picker
 * offers — so arriving there must not close the panel that sent you.
 */
export const FLOOR_DIRECTORY_ROOF_HEADROOM_M = 4;

/** Building-local (x, z) → DCL scene metres, applying the yaw baked into that GLB. */
function localToScene(
  origin: { x: number; z: number },
  rotationDeg: number,
  lx: number,
  lz: number
): { x: number; z: number } {
  const theta = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    x: origin.x + lx * cos + lz * sin,
    z: origin.z - lx * sin + lz * cos,
  };
}

/**
 * The ground-floor silhouette in scene metres.
 *
 * Uses the real perimeter (hexagon, octagon, rect) rather than a bounding box: towers in
 * a district stand a few metres apart, and a box around a chamfered plan reaches into the
 * gap between them. Floor 0 is the reference even for a setback tower — you enter at the
 * bottom, and the widest plate is the honest "am I in this building" test.
 */
function outlineForBuilding(
  placed: PlacedBuilding,
  layout: SceneLayout
): Array<{ x: number; z: number }> {
  const config = placed.config;
  const origin = placedBuildingOriginDcl(placed, layout);
  const rotationDeg = placed.rotationDeg ?? 0;
  const rect = footprintRectForFloor(config, layout, 0);
  const full = buildingFootprintM(config, layout);
  const perimeter = footprintPerimeter(
    rect.width || full.width,
    rect.depth || full.depth,
    config.footprintSides
  );
  return perimeter.vertices.map((v) =>
    localToScene(origin, rotationDeg, v.x + (rect.offsetX ?? 0), v.z + (rect.offsetZ ?? 0))
  );
}

/** Every level of one building, ground → roof, in the picker's own vocabulary. */
export function floorStopsForBuilding(
  config: BuildingConfig,
  originY: number
): FloorStop[] {
  const floors = Math.max(1, Math.round(config.floors ?? 1));
  const stops: FloorStop[] = [];
  for (let floor = 0; floor < floors; floor++) {
    stops.push({
      level: floor,
      label: launchStopLabel(floor),
      y: originY + walkSurfaceY(floorBaseY(config, floor)),
    });
  }
  if (config.roofTerrace) {
    // The roof is a LEVEL, not a floor: its walk surface is the top slab, which is why
    // `floors × storyHeight` would put it one storey low on any per-floor-heights tower.
    stops.push({
      level: "roof",
      label: launchStopLabel("roof"),
      y: originY + walkSurfaceY(floorBaseY(config, floors)),
    });
  }
  return stops;
}

/**
 * Every placed building's floor directory, flattened.
 *
 * A single-storey building gets no entry: there is nowhere to go, and a chip offering
 * one button is worse than no chip. Returns undefined rather than an empty array so a
 * scene of bungalows writes no key at all.
 */
export function planFloorDirectories(
  buildings: readonly PlacedBuilding[],
  layout: SceneLayout
): BuildingFloorPlan[] | undefined {
  const out: BuildingFloorPlan[] = [];
  const codes = assignBuildingDirectoryCodes(buildings, layout);
  for (const placed of buildings) {
    const config = placed.config;
    // An emptyLot entry is the plot-data CARRIER, not a building: it composes no
    // shell, so it has no floors to name and no lift to ride. Publishing a
    // directory for it put a "G / 2 / R" floor picker in front of players
    // standing on a bare sky island (owner 2026-08-31).
    if (config.emptyLot === true) continue;
    const originY = placedBuildingOriginDcl(placed, layout).y;
    const stops = floorStopsForBuilding(config, originY);
    if (stops.length < 2) continue;
    const outline = outlineForBuilding(placed, layout);
    if (outline.length < 3) continue;
    const floors = Math.max(1, Math.round(config.floors ?? 1));
    out.push({
      buildingId: placed.id,
      code: codes.get(placed.id) ?? buildingDirectoryBaseCode(placed, layout),
      outline,
      baseY: originY,
      topY: originY + walkSurfaceY(floorBaseY(config, floors)) + resolveStoryHeightForFloor(config, 0),
      stops,
    });
  }
  return out.length ? out : undefined;
}

/** Ray-cast point-in-polygon, plus the skirt. Duplicated from `perimeter.ts` on purpose:
 *  this one runs in the scene runtime, where the polygon is already in scene metres and
 *  the skirt is part of the answer rather than a caller's afterthought. */
export function insideFloorPlanXZ(
  x: number,
  z: number,
  outline: ReadonlyArray<{ x: number; z: number }>,
  skirtM = FLOOR_DIRECTORY_SKIRT_M
): boolean {
  if (outline.length < 3) return false;
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  if (inside || skirtM <= 0) return inside;
  // Outside the polygon but within the skirt of an edge still counts — a player leaning
  // on the glass is in the building as far as anyone standing there is concerned.
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    if (distanceToSegment(x, z, outline[j], outline[i]) <= skirtM) return true;
  }
  return false;
}

function distanceToSegment(
  x: number,
  z: number,
  a: { x: number; z: number },
  b: { x: number; z: number }
): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq <= 1e-9) return Math.hypot(x - a.x, z - a.z);
  let t = ((x - a.x) * dx + (z - a.z) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz));
}

/**
 * Which building the player is standing in, or null out on the plot.
 *
 * Vertical bounds matter as much as the footprint: fly over a tower and you are above
 * its plan, not in it. `topY` already carries a storey of slack for the roof terrace.
 */
export function buildingAtPosition(
  plans: readonly BuildingFloorPlan[],
  x: number,
  y: number,
  z: number
): BuildingFloorPlan | null {
  for (const plan of plans) {
    if (y < plan.baseY - 1 || y > plan.topY + FLOOR_DIRECTORY_ROOF_HEADROOM_M) continue;
    if (insideFloorPlanXZ(x, z, plan.outline)) return plan;
  }
  return null;
}

/** The level whose walk surface you are standing on — highlighted so "you are here" reads. */
export function currentStopIndex(stops: readonly FloorStop[], y: number): number {
  let best = -1;
  let bestGap = Infinity;
  for (let i = 0; i < stops.length; i++) {
    const gap = Math.abs(stops[i].y - y);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return bestGap <= 2.5 ? best : -1;
}
