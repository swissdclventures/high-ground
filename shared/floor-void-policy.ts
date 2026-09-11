/**
 * Floor void policy — which floors get openings and which profile shapes the hole.
 * Depends on circulation anchor being resolved first.
 */

import type { ShaftBounds } from "./kit-geometry";
import type { BuildingConfig, SceneLayout } from "./types";
import { GRID, buildingFootprintM } from "./types";
import {
  resolveCirculationAnchorForFloor,
  resolveCirculationBoundsForFloor,
  usesCirculationCoreV2,
} from "./circulation-anchor";
import { footprintRectForFloor } from "./floor-massing";
import {
  footprintPerimeter,
  insetPolygonVertices,
  offsetPolygonPerEdge,
  pointInPolygon,
  polygonFlatSouthOffsetRad,
  regularPolygonVertices,
  type Point2,
} from "./perimeter";
import { isNonRectPlan, planPerimeterForConfig } from "./plan-shape";
import { resolveAuxiliaryElevatorBounds } from "./auxiliary-elevators";

/** Clamp a void hole to a floor's footprint (setback floors are smaller than the full
 * plate the atrium profile was sized from), leaving an edge margin, but always keeping it
 * enclosing the circulation shaft so the ramp still passes. Lets an atrium coexist with a
 * pyramid: the light-well follows the setbacks instead of erasing them. */
function clampHoleToFloor(
  hole: HoleAabb,
  circ: HoleAabb,
  rect: { width: number; depth: number; offsetX?: number; offsetZ?: number },
  margin = 1.0,
  mustContainCirculation = true
): HoleAabb {
  // Anchored massing: clamp the void to the floor rect's ACTUAL frame (may be offset).
  const cx = rect.offsetX ?? 0;
  const cz = rect.offsetZ ?? 0;
  const halfW = Math.max(0, rect.width / 2 - margin);
  const halfD = Math.max(0, rect.depth / 2 - margin);
  let minX = Math.max(hole.minX, cx - halfW);
  let maxX = Math.min(hole.maxX, cx + halfW);
  let minZ = Math.max(hole.minZ, cz - halfD);
  let maxZ = Math.min(hole.maxZ, cz + halfD);
  if (mustContainCirculation) {
    // Never shrink below the circulation shaft — the ramp must pass through.
    minX = Math.min(minX, circ.minX);
    maxX = Math.max(maxX, circ.maxX);
    minZ = Math.min(minZ, circ.minZ);
    maxZ = Math.max(maxZ, circ.maxZ);
  }
  return { minX, maxX, minZ, maxZ };
}

export type VoidProfileKind = "rect";

export type VoidRole = "circulation" | "atrium";

export type RoofVoidMode = "solid" | "open" | "terrace_with_opening";

export type FloorVoidApplyMode = "all_above_solid" | "explicit";

/** Axis-aligned opening footprint in building-local XZ. */
export interface HoleAabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RectVoidProfile {
  id: string;
  kind: "rect";
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

export type VoidProfile = RectVoidProfile;

export interface FloorVoidPolicy {
  /** Floors that stay solid (no cutout). Default [0]. */
  solidFloors?: number[];
  /** Shorthand for solidFloors [0..N-1]. Ignored when solidFloors is set. */
  firstSolidFloors?: number;
  /** Default `all_above_solid` — every floor above solidFloors up to top floor. */
  applyTo?: FloorVoidApplyMode | number[];
  /** Profile used for the slab hole on void floors. Default `circulation`. */
  primaryProfileId?: string;
  /** Circulation ports / ramp gaps use this profile. Default `circulation`. */
  circulationProfileId?: string;
  /** Optional larger decorative void (must contain circulation when both active). */
  atriumProfileId?: string;
  roof?: RoofVoidMode;
}

export interface VoidPolicyConfig {
  profiles?: VoidProfile[];
  policy?: FloorVoidPolicy;
}

/**
 * High-level open-atrium control. Translated into a `voidPolicy` (atrium profile + apply
 * floors) by the resolvers below — see `atriumVoidProfile` and `effectiveVoidPolicy`.
 */
export interface AtriumConfig {
  enabled: boolean;
  /**
   * Walkable corridor width (m) left around the void on the sides AWAY from the stair
   * boarding edge. Default = one structural bay. Clamped so it never eats into the stairs.
   */
  corridorWidth?: number;
  /**
   * Which floors open into the atrium. Default: every void floor (all upper floors + roof),
   * giving a continuous top-to-bottom void. Ground stays solid as the entry base.
   */
  floors?: number[];
}

export interface FloorVoidPlan {
  floorIndex: number;
  hasVoid: boolean;
  /** Slab cut + guard perimeter (AABB). On polygon atriums this is the hole's bounds. */
  holeAabb: HoleAabb | null;
  /**
   * When set, the slab cut follows this ring (concentric hex/octagon atrium) instead of
   * the rectangular AABB — avoids a square hole artifact on faceted footprints.
   */
  holePolygon?: Point2[] | null;
  /** Additional fixed 4x4 m elevator-only shaft cuts (core v2). */
  additionalHoleAabbs: HoleAabb[];
  /** Ramp/stair ports — subset of or equal to hole. */
  circulationBounds: ShaftBounds | null;
  primaryProfileId: string | null;
  voidRole: VoidRole;
}

/** Axis-aligned bounds of a closed polygon ring. */
export function holeAabbFromPolygon(vertices: Point2[]): HoleAabb {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minZ = Math.min(minZ, v.z);
    maxZ = Math.max(maxZ, v.z);
  }
  return { minX, maxX, minZ, maxZ };
}

/** The 4 corners of a shaft AABB, inset by `margin` so containment tests aren't edge-exact. */
function shaftCorners(circ: HoleAabb, margin = 0.02): Point2[] {
  return [
    { x: circ.minX + margin, z: circ.minZ + margin },
    { x: circ.maxX - margin, z: circ.minZ + margin },
    { x: circ.maxX - margin, z: circ.maxZ - margin },
    { x: circ.minX + margin, z: circ.maxZ - margin },
  ];
}

/** True when every corner of the shaft AABB lies inside the hole polygon. */
function polygonEnclosesShaft(hole: Point2[], circ: HoleAabb, margin = 0.02): boolean {
  const corners = shaftCorners(circ, margin);
  return corners.every((c) => pointInPolygon(c.x, c.z, hole));
}

/**
 * Atrium hole for faceted footprints — **same shape family as the building**.
 *
 * Rule (no shape switching, no rect fallback):
 * 1. Start from the footprint ring.
 * 2. Inset by corridor width (walkable ring).
 * 3. If circulation is not inside that hole, widen toward the footprint until the
 *    shaft corners are inside (still the same N-gon).
 * 4. If the shaft sits outside the footprint (e.g. corner bay on an octagon), keep
 *    the largest footprint-shaped hole — never invent a square void/guards.
 *
 * Guards and slab cuts consume `holePolygon` directly, so the glass border always
 * matches the void.
 */
export function atriumPolygonHole(
  building: BuildingConfig,
  layout: SceneLayout
): Point2[] | null {
  return atriumPolygonHoleAndCorridors(building, layout)?.hole ?? null;
}

/**
 * Effective per-edge corridor widths for the polygon atrium — entry i is how far
 * footprint edge i was inset to make the hole. Full requested width on open sides;
 * smaller (possibly 0) beside an off-center shaft. Null when no polygon atrium hole.
 * The clamp notice reads this so the UI reports the geometry that actually exists.
 */
export function atriumPolygonCorridors(
  building: BuildingConfig,
  layout: SceneLayout
): number[] | null {
  return atriumPolygonHoleAndCorridors(building, layout)?.corridors ?? null;
}

/**
 * Would a circulation shaft at `circ` still let the atrium keep its FULL requested
 * corridor on every edge?
 *
 * The atrium ring is the footprint inset by the corridor width, then forced outward on
 * any edge the shaft pokes past — because the void has to enclose the shaft or the ramp
 * cannot pass through the slab. So a shaft near a wall drags the void to that wall and
 * the corridor there collapses to zero, while the slider still reads the requested width.
 * That is the "atrium says 4 m, corridor is 0" report (2026-07-22): not an atrium bug,
 * but the ramp's position deciding the atrium's shape.
 *
 * Callers use this to REJECT such a bay up front rather than silently deform the void.
 * Returns true for non-polygon footprints and when no atrium is enabled (nothing to break).
 */
export function circulationFitsAtriumRing(
  building: BuildingConfig,
  layout: SceneLayout,
  circ?: HoleAabb
): boolean {
  const atrium = building.atrium;
  if (!atrium?.enabled) return true;
  // Launch-only buildings have no stair/ramp shaft for the atrium to wrap.
  if (building.circulationMode === "launch") return true;
  if (!isNonRectPlan(building)) return true;

  const { width: W, depth: D } = buildingFootprintM(building, layout);
  const cw = Math.max(0.5, atrium.corridorWidth ?? GRID.cellSize);
  // The real plan, not a regular n-gon rebuilt from the facet count.
  const footprint = planPerimeterForConfig(building, W, D).vertices;
  if (footprint.length < 3) return true;

  const inset = insetPolygonVertices(footprint, cw);
  if (inset.length < 3) return false;

  const bounds = circ ?? resolveCirculationBoundsForFloor(building, layout, 0);
  return polygonEnclosesShaft(inset, bounds);
}

function atriumPolygonHoleAndCorridors(
  building: BuildingConfig,
  layout: SceneLayout
): { hole: Point2[]; corridors: number[] } | null {
  const atrium = building.atrium;
  if (!atrium?.enabled) return null;
  if (!isNonRectPlan(building)) return null;

  const { width: W, depth: D } = buildingFootprintM(building, layout);
  const cw = Math.max(0.5, atrium.corridorWidth ?? GRID.cellSize);
  const poly = planPerimeterForConfig(building, W, D);
  const footprint = poly.vertices;
  if (footprint.length < 3) return null;

  const circBounds = resolveCirculationBoundsForFloor(building, layout, 0);
  const circ: HoleAabb = {
    minX: circBounds.minX,
    maxX: circBounds.maxX,
    minZ: circBounds.minZ,
    maxZ: circBounds.maxZ,
  };
  const zeros = poly.edges.map(() => 0);

  const inset = insetPolygonVertices(footprint, cw);
  if (inset.length < 3) {
    return { hole: footprint.map((v) => ({ ...v })), corridors: zeros };
  }

  // An architectural atrium in a launch-only building is simply the footprint inset by
  // the selected corridor. A saved legacy stair bay must not pull the light well sideways.
  if (building.circulationMode === "launch") {
    return { hole: inset, corridors: poly.edges.map(() => cw) };
  }

  if (polygonEnclosesShaft(inset, circ)) {
    return { hole: inset, corridors: poly.edges.map(() => cw) };
  }

  // Shaft outside even the full footprint → still return footprint-shaped max hole.
  if (!polygonEnclosesShaft(footprint, circ)) {
    return { hole: footprint.map((v) => ({ ...v })), corridors: zeros };
  }

  // An off-center shaft can poke past the uniform inset on just one or two edges. Pull
  // ONLY those edges back toward the footprint — clamped to the least offset that still
  // clears every shaft corner — and keep the full corridor on every other edge. (A prior
  // version blended the whole ring toward the footprint uniformly, so one tight corner
  // dragged every wall out and erased the corridor on all sides.)
  const corners = shaftCorners(circ);
  const offsets = poly.edges.map((e) => {
    const maxOffset = Math.min(
      ...corners.map((c) => (e.start.x - c.x) * e.outward.x + (e.start.z - c.z) * e.outward.z)
    );
    return Math.max(0, Math.min(cw, maxOffset));
  });
  return { hole: offsetPolygonPerEdge(poly, offsets), corridors: offsets };
}

/**
 * Faceted hole around the circulation shaft for polygon skins when there is no atrium
 * enlargement. Keeps roof/floor openings in the footprint shape family and centered on
 * the (possibly relocated) bay — never a parcel-centered square.
 */
export function circulationPolygonHole(
  building: BuildingConfig,
  layout: SceneLayout,
  floorIndex: number
): Point2[] | null {
  // Core v2 has one invariant opening on every plan shape: the exact 8x8 host rect.
  // Returning null selects the AABB cut path instead of inflating it into a polygon.
  if (usesCirculationCoreV2(building)) return null;
  const sides = building.footprintSides;
  if (typeof sides !== "number" || sides < 5) return null;

  const circ = resolveCirculationBoundsForFloor(building, layout, floorIndex);
  const halfW = (circ.maxX - circ.minX) / 2;
  const halfD = (circ.maxZ - circ.minZ) / 2;
  // Circumradius of the shaft AABB + small pad so the helix clears the slab edge.
  const radius = Math.max(halfW, halfD) * Math.SQRT2 + 0.15;
  if (radius < 0.5) return null;

  const cx = (circ.minX + circ.maxX) / 2;
  const cz = (circ.minZ + circ.maxZ) / 2;
  const verts = regularPolygonVertices(sides, radius, polygonFlatSouthOffsetRad(sides));
  return verts.map((v) => ({ x: v.x + cx, z: v.z + cz }));
}

export const DEFAULT_CIRCULATION_PROFILE_ID = "circulation";
export const DEFAULT_ATRIUM_PROFILE_ID = "atrium";

export function holeAabbFromProfile(profile: RectVoidProfile): HoleAabb {
  const halfW = profile.width / 2;
  const halfD = profile.depth / 2;
  return {
    minX: profile.centerX - halfW,
    maxX: profile.centerX + halfW,
    minZ: profile.centerZ - halfD,
    maxZ: profile.centerZ + halfD,
  };
}

export function holeAabbToShaftBounds(aabb: HoleAabb): ShaftBounds {
  const width = aabb.maxX - aabb.minX;
  const depth = aabb.maxZ - aabb.minZ;
  return {
    centerX: (aabb.minX + aabb.maxX) / 2,
    centerZ: (aabb.minZ + aabb.maxZ) / 2,
    size: Math.max(width, depth),
    minX: aabb.minX,
    maxX: aabb.maxX,
    minZ: aabb.minZ,
    maxZ: aabb.maxZ,
  };
}

export function circulationProfileFromAnchor(
  building: BuildingConfig,
  layout: SceneLayout,
  id = DEFAULT_CIRCULATION_PROFILE_ID,
  floorIndex = 0
): RectVoidProfile {
  const anchor = resolveCirculationAnchorForFloor(building, layout, floorIndex);
  return {
    id,
    kind: "rect",
    centerX: anchor.centerX,
    centerZ: anchor.centerZ,
    width: anchor.slotSize,
    depth: anchor.slotSize,
  };
}

function floorGetsAtriumEnlargement(building: BuildingConfig, floorIndex: number): boolean {
  if (!building.atrium?.enabled) return true;
  const floors = building.atrium.floors;
  if (!floors?.length) return true;
  return floors.includes(floorIndex);
}

export const DEFAULT_ATRIUM_CORRIDOR_M = GRID.cellSize;

/** Corridor slider domain — mirrors #inp-atrium-corridor in index.html. */
export const ATRIUM_CORRIDOR_MIN_M = 2;
export const ATRIUM_CORRIDOR_MAX_M = 6;
export const ATRIUM_CORRIDOR_STEP_M = 0.5;

/**
 * Does the atrium actually open anything BEYOND the stair shaft?
 *
 * The void is the interior inset by the corridor, then force-expanded to enclose the shaft
 * — so on a tight footprint a wide corridor collapses the "atrium" onto the shaft itself and
 * the toggle silently does nothing. That degenerate case is what this detects.
 */
function atriumExceedsShaft(building: BuildingConfig, layout: SceneLayout): boolean {
  if (building.circulationMode === "launch") {
    const sides = building.footprintSides;
    if (typeof sides === "number" && sides >= 5) {
      const hole = atriumPolygonHole(building, layout);
      return Boolean(hole && hole.length >= 3);
    }
    const profile = atriumVoidProfile(building, layout);
    return Boolean(profile && profile.width >= 0.5 && profile.depth >= 0.5);
  }
  const circ = resolveCirculationBoundsForFloor(building, layout, 0);
  const shaftW = circ.maxX - circ.minX;
  const shaftD = circ.maxZ - circ.minZ;
  const tol = 0.5;
  const sides = building.footprintSides;
  if (typeof sides === "number" && sides >= 5) {
    const hole = atriumPolygonHole(building, layout);
    if (!hole || hole.length < 3) return false;
    const a = holeAabbFromPolygon(hole);
    return a.maxX - a.minX > shaftW + tol || a.maxZ - a.minZ > shaftD + tol;
  }
  const profile = atriumVoidProfile(building, layout);
  if (!profile) return false;
  return profile.width > shaftW + tol || profile.depth > shaftD + tol;
}

/**
 * Largest corridor width that still leaves a void bigger than the shaft, or null when no
 * width in the slider's range can (footprint too small for any atrium).
 *
 * Void size shrinks monotonically as the corridor grows, so scanning down from the max and
 * taking the first hit is exact. Probing the real resolver (rather than re-deriving the
 * geometry) keeps this honest for off-centre shafts, boarding edges, and polygon skins.
 */
export function maxUsefulAtriumCorridorM(
  building: BuildingConfig,
  layout: SceneLayout
): number | null {
  const steps = Math.round((ATRIUM_CORRIDOR_MAX_M - ATRIUM_CORRIDOR_MIN_M) / ATRIUM_CORRIDOR_STEP_M);
  for (let i = steps; i >= 0; i--) {
    const cw = Number((ATRIUM_CORRIDOR_MIN_M + i * ATRIUM_CORRIDOR_STEP_M).toFixed(2));
    const probe: BuildingConfig = {
      ...building,
      atrium: { ...(building.atrium ?? {}), enabled: true, corridorWidth: cw },
    };
    if (atriumExceedsShaft(probe, layout)) return cw;
  }
  return null;
}

/**
 * Build the enlarged atrium void rectangle. It opens the interior around the circulation
 * but keeps the circulation's BOARDING edge backed by solid floor, so the stairs stay
 * reachable (a single rect hole can't bridge an islanded centre). The 3 non-boarding sides
 * are inset by the corridor width; the rect is always expanded to enclose the circulation
 * shaft so the ramp passes through and the corridor can never eat into the stair slot.
 * Returns null when the atrium is disabled or would collapse to nothing.
 *
 * Axes: south = −Z, north = +Z, west = −X, east = +X.
 */
export function atriumVoidProfile(
  building: BuildingConfig,
  layout: SceneLayout,
  id = DEFAULT_ATRIUM_PROFILE_ID
): RectVoidProfile | null {
  const atrium = building.atrium;
  if (!atrium?.enabled) return null;

  const { width: W, depth: D } = buildingFootprintM(building, layout);
  const cw = Math.max(0, atrium.corridorWidth ?? DEFAULT_ATRIUM_CORRIDOR_M);
  const circ = resolveCirculationBoundsForFloor(building, layout, 0);
  const boardingEdge = building.circulation?.entryEdge ?? "south";

  // Start from the full interior inset by the corridor on every side.
  let minX = -W / 2 + cw;
  let maxX = W / 2 - cw;
  let minZ = -D / 2 + cw;
  let maxZ = D / 2 - cw;

  // Buildings now use authored traversal outside the building. With no internal shaft,
  // the atrium is a centered light well and keeps the requested corridor on all sides.
  if (building.circulationMode === "launch") {
    if (maxX - minX < 0.5 || maxZ - minZ < 0.5) return null;
    return {
      id,
      kind: "rect",
      centerX: 0,
      centerZ: 0,
      width: maxX - minX,
      depth: maxZ - minZ,
    };
  }

  // The boarding side stays solid: pull that edge back to the stair-shaft edge so there is
  // continuous floor between the void and that wall to step onto the stairs.
  if (boardingEdge === "south") minZ = circ.minZ;
  else if (boardingEdge === "north") maxZ = circ.maxZ;
  else if (boardingEdge === "west") minX = circ.minX;
  else if (boardingEdge === "east") maxX = circ.maxX;

  // Guarantee the void encloses the stair shaft (ramp passes through; corridor clamps).
  minX = Math.min(minX, circ.minX);
  maxX = Math.max(maxX, circ.maxX);
  minZ = Math.min(minZ, circ.minZ);
  maxZ = Math.max(maxZ, circ.maxZ);

  if (maxX - minX < 0.5 || maxZ - minZ < 0.5) return null;

  return {
    id,
    kind: "rect",
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: maxX - minX,
    depth: maxZ - minZ,
  };
}

/**
 * Fold the high-level `atrium` config into a void policy: it selects the atrium profile as
 * primary and applies it to the chosen floors (default: all void floors). Falls back to the
 * explicit `voidPolicy.policy` when the atrium is off.
 */
export function effectiveVoidPolicy(building: BuildingConfig): FloorVoidPolicy | undefined {
  const base = building.voidPolicy?.policy;
  if (!building.atrium?.enabled) return base;
  const applyTo = building.atrium.floors?.length ? [...building.atrium.floors] : base?.applyTo;
  return {
    ...base,
    primaryProfileId: DEFAULT_ATRIUM_PROFILE_ID,
    atriumProfileId: DEFAULT_ATRIUM_PROFILE_ID,
    circulationProfileId: base?.circulationProfileId ?? DEFAULT_CIRCULATION_PROFILE_ID,
    ...(applyTo !== undefined ? { applyTo } : {}),
  };
}

export function resolveVoidProfiles(
  building: BuildingConfig,
  layout: SceneLayout
): Map<string, RectVoidProfile> {
  const map = new Map<string, RectVoidProfile>();
  const circulation = circulationProfileFromAnchor(building, layout);
  map.set(circulation.id, circulation);

  for (const profile of building.voidPolicy?.profiles ?? []) {
    if (profile.kind === "rect") {
      map.set(profile.id, profile);
    }
  }
  // Atrium config wins over any same-id custom profile.
  const atrium = atriumVoidProfile(building, layout);
  if (atrium) map.set(atrium.id, atrium);
  return map;
}

export function resolveSolidFloors(policy: FloorVoidPolicy | undefined): number[] {
  if (policy?.solidFloors?.length) {
    return [...policy.solidFloors].sort((a, b) => a - b);
  }
  const n = policy?.firstSolidFloors ?? 1;
  return Array.from({ length: Math.max(0, n) }, (_, i) => i);
}

function buildingNeedsVerticalVoid(building: BuildingConfig): boolean {
  // An atrium is architecture, not traversal. Launch mode correctly suppresses the old
  // ramp/lift SHAFT, but it must not override an explicitly selected open atrium. That
  // conflation left the toggle on while every upper slab remained solid.
  if (building.atrium?.enabled) return building.floors > 1 || building.roofTerrace;
  // Launch pads travel through the air, not through a shaft. Without an atrium every
  // slab stays solid; an unrequested circulation hole would only be a fall risk.
  if (building.circulationMode === "launch") return false;
  return building.floors > 1 || building.roofTerrace;
}

function floorMatchesApply(
  floorIndex: number,
  totalFloors: number,
  solidFloors: number[],
  applyTo: FloorVoidPolicy["applyTo"]
): boolean {
  if (solidFloors.includes(floorIndex)) return false;
  if (floorIndex <= 0 && solidFloors.length === 0) return false;

  const mode = applyTo ?? "all_above_solid";
  if (mode === "all_above_solid") {
    const topSolid = solidFloors.length ? Math.max(...solidFloors) : -1;
    return floorIndex > topSolid && floorIndex < totalFloors;
  }
  if (Array.isArray(mode)) {
    return mode.includes(floorIndex);
  }
  return floorIndex > 0 && floorIndex < totalFloors;
}

export function resolveRoofVoidMode(building: BuildingConfig): RoofVoidMode {
  const explicit = building.voidPolicy?.policy?.roof;
  if (explicit) return explicit;
  if (building.roofTerrace && buildingNeedsVerticalVoid(building)) {
    return "terrace_with_opening";
  }
  return building.roofTerrace ? "solid" : "solid";
}

export function roofHasVoid(building: BuildingConfig): boolean {
  const mode = resolveRoofVoidMode(building);
  return mode === "open" || mode === "terrace_with_opening";
}

/** Immutably set whether the roof terrace keeps a center opening (or is a solid deck). */
export function setRoofVoidMode(
  building: BuildingConfig,
  mode: RoofVoidMode
): BuildingConfig {
  return {
    ...building,
    voidPolicy: {
      ...building.voidPolicy,
      policy: {
        ...building.voidPolicy?.policy,
        roof: mode,
      },
    },
  };
}

export function floorHasVoid(building: BuildingConfig, floorIndex: number): boolean {
  if (!buildingNeedsVerticalVoid(building)) return false;
  const policy = effectiveVoidPolicy(building);
  const solidFloors = resolveSolidFloors(policy);
  return floorMatchesApply(floorIndex, building.floors, solidFloors, policy?.applyTo);
}

function selectPrimaryProfile(
  building: BuildingConfig,
  layout: SceneLayout,
  profiles: Map<string, RectVoidProfile>
): RectVoidProfile {
  const policy = effectiveVoidPolicy(building);
  const primaryId = policy?.primaryProfileId ?? policy?.atriumProfileId;
  if (primaryId && profiles.has(primaryId)) {
    return profiles.get(primaryId)!;
  }
  const circulationId = policy?.circulationProfileId ?? DEFAULT_CIRCULATION_PROFILE_ID;
  return profiles.get(circulationId) ?? circulationProfileFromAnchor(building, layout);
}

function containsAabb(outer: HoleAabb, inner: HoleAabb, tol = 0.01): boolean {
  return (
    inner.minX >= outer.minX - tol &&
    inner.maxX <= outer.maxX + tol &&
    inner.minZ >= outer.minZ - tol &&
    inner.maxZ <= outer.maxZ + tol
  );
}

export function resolveFloorVoidPlan(
  building: BuildingConfig,
  layout: SceneLayout,
  floorIndex: number
): FloorVoidPlan {
  const empty: FloorVoidPlan = {
    floorIndex,
    hasVoid: false,
    holeAabb: null,
    holePolygon: null,
    additionalHoleAabbs: [],
    circulationBounds: null,
    primaryProfileId: null,
    voidRole: "circulation",
  };

  if (!floorHasVoid(building, floorIndex)) {
    return empty;
  }

  const profiles = resolveVoidProfiles(building, layout);
  const policy = effectiveVoidPolicy(building);
  const circulationId = policy?.circulationProfileId ?? DEFAULT_CIRCULATION_PROFILE_ID;
  const circulationProfile =
    profiles.get(circulationId) ??
    circulationProfileFromAnchor(building, layout, DEFAULT_CIRCULATION_PROFILE_ID, floorIndex);
  const circulationAabb = holeAabbFromProfile(circulationProfile);
  const architecturalAtrium =
    building.circulationMode === "launch" && building.atrium?.enabled === true;
  const circulationBounds = architecturalAtrium
    ? null
    : resolveCirculationBoundsForFloor(building, layout, floorIndex);
  const additionalHoleAabbs = resolveAuxiliaryElevatorBounds(building, layout).map((b) => ({
    minX: b.minX,
    maxX: b.maxX,
    minZ: b.minZ,
    maxZ: b.maxZ,
  }));
  const primary = floorGetsAtriumEnlargement(building, floorIndex)
    ? selectPrimaryProfile(building, layout, profiles)
    : circulationProfile;

  // Polygon skins: atrium N-gon when enlarged, else shaft-centered N-gon (never a square).
  const wantsAtrium =
    floorGetsAtriumEnlargement(building, floorIndex) &&
    primary.id === (policy?.atriumProfileId ?? DEFAULT_ATRIUM_PROFILE_ID);
  const polyHole = wantsAtrium
    ? atriumPolygonHole(building, layout)
    : circulationPolygonHole(building, layout, floorIndex);
  if (polyHole) {
    return {
      floorIndex,
      hasVoid: true,
      holeAabb: holeAabbFromPolygon(polyHole),
      holePolygon: polyHole,
      additionalHoleAabbs,
      circulationBounds,
      primaryProfileId: wantsAtrium ? primary.id : circulationProfile.id,
      voidRole: wantsAtrium ? "atrium" : "circulation",
    };
  }

  // Clamp to this floor's footprint so a setback (pyramid) floor gets a fitting void.
  const holeAabb = clampHoleToFloor(
    holeAabbFromProfile(primary),
    circulationAabb,
    footprintRectForFloor(building, layout, floorIndex),
    1.0,
    !architecturalAtrium
  );

  if (
    policy?.atriumProfileId &&
    policy.atriumProfileId !== circulationId &&
    !architecturalAtrium &&
    !containsAabb(holeAabb, circulationAabb)
  ) {
    throw new Error(
      `void policy: atrium profile "${primary.id}" must contain circulation profile "${circulationProfile.id}"`
    );
  }

  const voidRole: VoidRole =
    policy?.atriumProfileId && primary.id === policy.atriumProfileId ? "atrium" : "circulation";

  return {
    floorIndex,
    hasVoid: true,
    holeAabb,
    holePolygon: null,
    additionalHoleAabbs,
    circulationBounds,
    primaryProfileId: primary.id,
    voidRole,
  };
}

export function resolveRoofVoidPlan(
  building: BuildingConfig,
  layout: SceneLayout
): FloorVoidPlan {
  const empty: FloorVoidPlan = {
    floorIndex: building.floors,
    hasVoid: false,
    holeAabb: null,
    holePolygon: null,
    additionalHoleAabbs: [],
    circulationBounds: null,
    primaryProfileId: null,
    voidRole: "circulation",
  };
  if (!roofHasVoid(building)) return empty;

  const profiles = resolveVoidProfiles(building, layout);
  const primary = selectPrimaryProfile(building, layout, profiles);
  const policy = effectiveVoidPolicy(building);
  const architecturalAtrium =
    building.circulationMode === "launch" && building.atrium?.enabled === true;
  const circulationBounds = architecturalAtrium
    ? null
    : resolveCirculationBoundsForFloor(building, layout, Math.max(0, building.floors - 1));
  const additionalHoleAabbs = resolveAuxiliaryElevatorBounds(building, layout).map((b) => ({
    minX: b.minX,
    maxX: b.maxX,
    minZ: b.minZ,
    maxZ: b.maxZ,
  }));

  const topFloor = Math.max(0, building.floors - 1);
  const wantsAtrium =
    primary.id === (policy?.atriumProfileId ?? DEFAULT_ATRIUM_PROFILE_ID);
  const polyHole = wantsAtrium
    ? atriumPolygonHole(building, layout)
    : circulationPolygonHole(building, layout, topFloor);
  if (polyHole) {
    return {
      floorIndex: building.floors,
      hasVoid: true,
      holeAabb: holeAabbFromPolygon(polyHole),
      holePolygon: polyHole,
      additionalHoleAabbs,
      circulationBounds,
      primaryProfileId: wantsAtrium ? primary.id : DEFAULT_CIRCULATION_PROFILE_ID,
      voidRole: wantsAtrium ? "atrium" : "circulation",
    };
  }

  // Rectangular roofs — clamp the void to the top floor footprint.
  const circProfile = circulationProfileFromAnchor(
    building,
    layout,
    DEFAULT_CIRCULATION_PROFILE_ID,
    topFloor
  );
  const roofHole = clampHoleToFloor(
    holeAabbFromProfile(wantsAtrium ? primary : circProfile),
    holeAabbFromProfile(circProfile),
    footprintRectForFloor(building, layout, topFloor),
    1.0,
    !architecturalAtrium
  );
  return {
    floorIndex: building.floors,
    hasVoid: true,
    holeAabb: roofHole,
    holePolygon: null,
    additionalHoleAabbs,
    circulationBounds,
    primaryProfileId: wantsAtrium ? primary.id : circProfile.id,
    voidRole: wantsAtrium ? "atrium" : "circulation",
  };
}

/** Warn when void policy blocks vertical circulation through a solid intermediate floor. */
export function validateVoidPolicyForCirculation(building: BuildingConfig): string[] {
  const warnings: string[] = [];
  if (!buildingNeedsVerticalVoid(building)) return warnings;

  const floors = building.floors;
  const policy = effectiveVoidPolicy(building);
  const applyTo = policy?.applyTo ?? "all_above_solid";

  for (let f = 1; f < floors; f++) {
    const hasVoid = floorHasVoid(building, f);
    const hasVoidAbove = f + 1 < floors ? floorHasVoid(building, f + 1) : roofHasVoid(building);
    if (!hasVoid && hasVoidAbove) {
      warnings.push(
        `Floor ${f} is solid but floor ${f + 1} has a shaft opening — L/spiral ramp cannot pass through floor ${f}`
      );
    }
  }

  if (applyTo === "all_above_solid" || applyTo === undefined) {
    for (let f = 1; f < floors - 1; f++) {
      const hasVoid = floorHasVoid(building, f);
      const above = floorHasVoid(building, f + 1);
      if (hasVoid !== above) {
        warnings.push(
          `Floors ${f}/${f + 1}: inconsistent shaft openings — vertical circulation needs a continuous void stack above solid floors`
        );
      }
    }
  }

  return warnings;
}
