import { GRID, ROOF_GUARD_HEIGHT_M, type BuildingSpan } from "./types";

const { cellSize, parcelSize, floorThickness } = GRID;

export type ShaftCorner = "sw" | "se" | "nw" | "ne";
export type ShaftEdge = "south" | "north" | "east" | "west";
export type RampType = "straight" | "l" | "spiral";

export interface ShaftBounds {
  centerX: number;
  centerZ: number;
  size: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WalkAnchor {
  x: number;
  y: number;
  z: number;
}

export interface RampLeg {
  from: WalkAnchor;
  to: WalkAnchor;
}

export interface RampPathPlan {
  legs: RampLeg[];
  entryCorner: ShaftCorner;
  exitCorner: ShaftCorner;
  rampType: RampType;
}

export interface RampRunSpec {
  from: WalkAnchor;
  to: WalkAnchor;
  walkWidth: number;
  tread: number;
  guardHeight: number;
  guardThickness: number;
}

/** Anchor plan for parametric L-shaped ramp (centerline + landing corners). */
export interface LShapedRampAnchorPlan {
  groundAttach: WalkAnchor;
  /** Run A end — centerline on landing entry edge. */
  landingEntry: WalkAnchor;
  /** Run B start — centerline on landing exit edge. */
  landingExit: WalkAnchor;
  upperAttach: WalkAnchor;
  /** Landing slab opposite corners (axis-aligned rectangle at landing Y). */
  landingCornerA: WalkAnchor;
  landingCornerB: WalkAnchor;
  groundY: number;
  width: number;
  thickness: number;
  toeLength: number;
  toeMode: "ground_blend" | "none";
  toeMinVisibleThickness: number;
}

export const RAMP_WALK_WIDTH = 2.0;
/** Narrower deck for the helical core so the spiral fits the 4×4 m slot. */
export const SPIRAL_WALK_WIDTH = 1.2;
/**
 * Clearance between the spiral walk inner edge and the elevator glass tube / cab.
 * Keeps the tube inside the spiral eye without clipping the ramp deck.
 */
export const SPIRAL_EYE_CLEARANCE_M = 0.12;

/**
 * Open radius at the center of a spiral cartridge (inside the walk deck).
 * Centerline half-size is `half - walkWidth/2`; inner walk edge is another `walkWidth/2` in.
 */
export function spiralEyeInnerRadius(
  cellSizeM = cellSize,
  walkWidth = SPIRAL_WALK_WIDTH
): number {
  const half = cellSizeM / 2;
  return Math.max(0.35, half - walkWidth);
}

/** Max glass-tube / cab radius that still fits inside the spiral eye. */
export function spiralEyeTubeRadius(
  cellSizeM = cellSize,
  walkWidth = SPIRAL_WALK_WIDTH,
  clearance = SPIRAL_EYE_CLEARANCE_M
): number {
  return Math.max(0.3, spiralEyeInnerRadius(cellSizeM, walkWidth) - clearance);
}
export const RAMP_TREAD = 0.12;
export const RAMP_TOE_LENGTH = 0.45;
export const RAMP_TOE_MIN_VISIBLE = 0.06;
export const RAMP_TOE_MODE = "ground_blend" as const;
/**
 * DCL human-scale standard: avatars are ~1.75 m with a high third-person camera, so
 * guards must read as waist-height (like real-world code, 1.0–1.1 m). 0.75 m reads
 * as knee-height in-world. ALL fall protection (ramp, roof, terrace, opening) uses
 * this one constant; the balcony wall section (createBalconyRail) matches at 1.1 m.
 */
export const DCL_GUARD_HEIGHT_M = ROOF_GUARD_HEIGHT_M;
export const RAMP_GUARD_H = DCL_GUARD_HEIGHT_M;
export const RAMP_GUARD_T = 0.06;
/** Decentraland docs: avatars can walk up slopes up to ~45° without jumping. */
export const MAX_WALKABLE_SLOPE_DEG = 45;
export const MAX_RAMP_GRADE = Math.tan((MAX_WALKABLE_SLOPE_DEG * Math.PI) / 180);

/**
 * THE SITE DATUM — the Y everything standing on the plot rests at.
 *
 * Decentraland's own terrain is at y=0. A face at exactly y=0 is coplanar with it and
 * flickers in-world even though the composer preview (which has far more depth precision)
 * looks perfect — the same rule every seat and contact surface in this kit follows. The
 * ground slab, the shaft posts and site-placed props all sat at exactly 0, and the site
 * paving already had to move up to 0.04 to stop the explorer's ground winning the depth
 * fight. Two different answers to the same question is how the building ended up BELOW
 * its own paving.
 *
 * One datum, used by the paving, the building base and everything site-scoped. 4 cm is
 * inside what an avatar visually sinks into the floor anyway, so it does not read.
 */
export const SITE_DATUM_Y = 0.04;

/**
 * How far the site paving sits BELOW the building datum.
 *
 * The paving must stay under every ground-floor slab (those sit on the datum) and
 * still stay proud of Decentraland's y=0 terrain. 5 mm is the coplanar margin;
 * the in-world depth fight against that terrain is settled by the runtime overlay
 * (`scene/src/site-ground.ts`), not by nudging this number again.
 */
export const SITE_GROUND_SINK_M = 0.005;

/** World Y of the site paving: proud of DCL y=0, under the building datum. */
export function siteGroundWorldY(): number {
  return SITE_DATUM_Y - SITE_GROUND_SINK_M;
}

/**
 * Plot-centred overlay the scene runtime draws. Independent of GLB placement, so a
 * primary tower standing off-centre cannot slide the paving off the plot.
 */
export function siteGroundOverlayTransform(layout: { cols: number; rows: number }): {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
} {
  const width = layout.cols * parcelSize;
  const depth = layout.rows * parcelSize;
  return {
    x: width / 2,
    y: siteGroundWorldY(),
    z: depth / 2,
    width,
    depth,
  };
}

export function walkSurfaceY(floorBaseY: number, ft = floorThickness): number {
  return floorBaseY + ft;
}

export function upperWalkSurfaceY(floorBaseY: number, storyHeight: number, ft = floorThickness): number {
  return floorBaseY + storyHeight + ft;
}

export function shaftBounds(centerX: number, centerZ: number, size = cellSize): ShaftBounds {
  const h = size / 2;
  return {
    centerX,
    centerZ,
    size,
    minX: centerX - h,
    maxX: centerX + h,
    minZ: centerZ - h,
    maxZ: centerZ + h,
  };
}

const OPPOSITE: Record<ShaftCorner, ShaftCorner> = {
  sw: "ne",
  ne: "sw",
  se: "nw",
  nw: "se",
};

export function shaftCornerXZ(bounds: ShaftBounds, corner: ShaftCorner): { x: number; z: number } {
  switch (corner) {
    case "sw":
      return { x: bounds.minX, z: bounds.minZ };
    case "se":
      return { x: bounds.maxX, z: bounds.minZ };
    case "nw":
      return { x: bounds.minX, z: bounds.maxZ };
    case "ne":
      return { x: bounds.maxX, z: bounds.maxZ };
  }
}

export function lowCornerForFloor(floor: number): ShaftCorner {
  return floor % 2 === 0 ? "sw" : "se";
}

function anchor(
  x: number,
  y: number,
  z: number
): WalkAnchor {
  return { x, y, z };
}

/** Straight diagonal — one corner to opposite (compact shaft). */
function planStraightPath(
  bounds: ShaftBounds,
  floorIndex: number,
  floorBaseY: number,
  storyHeight: number
): RampPathPlan {
  const low = lowCornerForFloor(floorIndex);
  const high = OPPOSITE[low];
  const y0 = walkSurfaceY(floorBaseY);
  const y1 = upperWalkSurfaceY(floorBaseY, storyHeight);
  const a = shaftCornerXZ(bounds, low);
  const b = shaftCornerXZ(bounds, high);
  return {
    rampType: "straight",
    entryCorner: low,
    exitCorner: high,
    legs: [{ from: anchor(a.x, y0, a.z), to: anchor(b.x, y1, b.z) }],
  };
}

/**
 * L-shaped — two legs along shaft edges (uses full 4×4 m hole).
 * Even: south then east. Odd: south (westward) then west (northward).
 */
function planLPath(
  bounds: ShaftBounds,
  floorIndex: number,
  floorBaseY: number,
  storyHeight: number
): RampPathPlan {
  const y0 = walkSurfaceY(floorBaseY);
  const yMid = y0 + storyHeight / 2;
  const y1 = upperWalkSurfaceY(floorBaseY, storyHeight);
  const even = floorIndex % 2 === 0;

  if (even) {
    const sw = shaftCornerXZ(bounds, "sw");
    const se = shaftCornerXZ(bounds, "se");
    const ne = shaftCornerXZ(bounds, "ne");
    return {
      rampType: "l",
      entryCorner: "sw",
      exitCorner: "ne",
      legs: [
        { from: anchor(sw.x, y0, sw.z), to: anchor(se.x, yMid, se.z) },
        { from: anchor(se.x, yMid, se.z), to: anchor(ne.x, y1, ne.z) },
      ],
    };
  }

  const se = shaftCornerXZ(bounds, "se");
  const sw = shaftCornerXZ(bounds, "sw");
  const nw = shaftCornerXZ(bounds, "nw");
  return {
    rampType: "l",
    entryCorner: "se",
    exitCorner: "nw",
    legs: [
      { from: anchor(se.x, y0, se.z), to: anchor(sw.x, yMid, sw.z) },
      { from: anchor(sw.x, yMid, sw.z), to: anchor(nw.x, y1, nw.z) },
    ],
  };
}

export interface CellLocalSpiralPlan {
  legs: RampLeg[];
  entryCorner: ShaftCorner;
  exitCorner: ShaftCorner;
  spiralRadius: number;
  segments: number;
  /** Helix start = boarding walk port (slot-local; default mid-south). */
  portStart: { x: number; y: number; z: number };
  /** Helix end = exit walk port stacked above entry (same edge after rotation). */
  portEnd: { x: number; y: number; z: number };
  turns: number;
  slopeDeg: number;
}

/** Comfortable target slope for the spiral core — kept well under the 45° limit. */
export const SPIRAL_TARGET_SLOPE_DEG = 30;

/** Level landing length (m) reserved at each module's entry and exit. */
export const SPIRAL_LANDING_LEN = 0.9;

type LocalAnchor = { x: number; y: number; z: number };

/** Rotate slot-local XZ by 90° steps CCW about +Y (matches entryEdgeToQuarterTurns). */
function rotateLocalXZ(a: LocalAnchor, quarterTurns: number): LocalAnchor {
  let { x, z } = a;
  const t = ((quarterTurns % 4) + 4) % 4;
  for (let i = 0; i < t; i++) {
    // (x, z) → (−z, x): south → east → north → west
    const nx = -z;
    const nz = x;
    x = nx;
    z = nz;
  }
  return { x, y: a.y, z };
}

function rotateXZPoint(
  p: { x: number; z: number },
  quarterTurns: number
): { x: number; z: number } {
  const r = rotateLocalXZ({ x: p.x, y: 0, z: p.z }, quarterTurns);
  return { x: r.x, z: r.z };
}

/** Sample one clockwise rounded-square loop (centerline) starting at mid-south. */
function roundedSquareLoop(
  s: number,
  rc: number,
  step: number
): { x: number; z: number }[] {
  const a = s - rc; // straight half-extent before the corner fillet
  const pts: { x: number; z: number }[] = [];
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t });
    }
  };
  const arc = (cx: number, cz: number, a0: number, a1: number) => {
    const len = Math.abs(a1 - a0) * rc;
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 0; i < n; i++) {
      const ang = a0 + (a1 - a0) * (i / n);
      pts.push({ x: cx + Math.cos(ang) * rc, z: cz + Math.sin(ang) * rc });
    }
  };

  line(0, -s, a, -s); // south edge, east half
  arc(a, -a, -Math.PI / 2, 0); // SE corner
  line(s, -a, s, a); // east edge
  arc(a, a, 0, Math.PI / 2); // NE corner
  line(a, s, -a, s); // north edge
  arc(-a, a, Math.PI / 2, Math.PI); // NW corner
  line(-s, a, -s, -a); // west edge
  arc(-a, -a, Math.PI, 1.5 * Math.PI); // SW corner
  line(-a, -s, 0, -s); // south edge, west half (back toward start)
  return pts;
}

/**
 * Continuous square-helix core in slot-local coords (Y=0 lower walk, Y=storyHeight
 * upper walk, XZ centered at 0,0). The deck hugs the four shaft walls (outer edge
 * flush at ±half → full contact, clean 90° corners) and climbs continuously, so the
 * exit sits directly above the entry — you run floor-to-floor without getting off.
 * Default boarding is mid-south; `entryQuarterTurns` rotates the whole helix CCW
 * (0=south, 1=east, 2=north, 3=west). Loops grow with rise so slope stays
 * at/under SPIRAL_TARGET_SLOPE_DEG.
 */
export function planCellLocalSpiral(
  storyHeight: number,
  _floorIndex: number,
  walkWidth = SPIRAL_WALK_WIDTH,
  cellSizeM = cellSize,
  entryQuarterTurns = 0
): CellLocalSpiralPlan {
  const half = cellSizeM / 2;
  const s = Math.max(0.5, half - walkWidth / 2); // centerline half-size; outer edge at the walls
  const rc = Math.min(walkWidth / 2 + 0.15, s * 0.5); // corner fillet radius
  const targetGrade = Math.tan((SPIRAL_TARGET_SLOPE_DEG * Math.PI) / 180);
  const perim = 8 * (s - rc) + 2 * Math.PI * rc;
  // Flat, level landing reserved at the bottom entry and top exit of every module so
  // the deck meets the floor flush (and each floor's exit landing meets the next
  // floor's entry landing) instead of still climbing through the connection.
  const landing = Math.min(SPIRAL_LANDING_LEN, perim * 0.18);
  // Pick loop count so the *climbing* portion (path minus the two landings) stays at
  // or under the comfortable target slope.
  const loops = Math.max(
    1,
    Math.ceil((storyHeight / Math.max(targetGrade, 1e-6) + 2 * landing) / perim)
  );

  const loopPts = roundedSquareLoop(s, rc, 0.2);
  const pts: { x: number; z: number }[] = [];
  for (let l = 0; l < loops; l++) pts.push(...loopPts);
  pts.push({ x: 0, z: -s }); // close on the south side, directly above the start

  const rot = ((entryQuarterTurns % 4) + 4) % 4;
  const rotatedPts = rot === 0 ? pts : pts.map((p) => rotateXZPoint(p, rot));

  const cum: number[] = [0];
  for (let i = 1; i < rotatedPts.length; i++) {
    cum.push(
      cum[i - 1] +
        Math.hypot(
          rotatedPts[i].x - rotatedPts[i - 1].x,
          rotatedPts[i].z - rotatedPts[i - 1].z
        )
    );
  }
  const total = cum[cum.length - 1] || 1;
  const climbRun = Math.max(1e-6, total - 2 * landing);
  const heightAt = (d: number): number => {
    if (d <= landing) return 0; // flat entry landing
    if (d >= total - landing) return storyHeight; // flat exit landing
    return (storyHeight * (d - landing)) / climbRun;
  };

  const legs: RampLeg[] = [];
  for (let i = 1; i < rotatedPts.length; i++) {
    legs.push({
      from: anchor(rotatedPts[i - 1].x, heightAt(cum[i - 1]), rotatedPts[i - 1].z),
      to: anchor(rotatedPts[i].x, heightAt(cum[i]), rotatedPts[i].z),
    });
  }

  const portXZ = rotateXZPoint({ x: 0, z: -s }, rot);
  const portStart = anchor(portXZ.x, 0, portXZ.z);
  const portEnd = anchor(portXZ.x, storyHeight, portXZ.z);
  const slopeDeg = (Math.atan2(storyHeight, climbRun) * 180) / Math.PI;

  return {
    legs,
    entryCorner: "sw",
    exitCorner: "sw",
    spiralRadius: s,
    segments: legs.length,
    portStart,
    portEnd,
    turns: loops,
    slopeDeg,
  };
}

/** Spiral helix constrained to walkable slope (<= MAX_WALKABLE_SLOPE_DEG). */
export function planSpiralPath(
  bounds: ShaftBounds,
  floorIndex: number,
  floorBaseY: number,
  storyHeight: number,
  entryQuarterTurns = 0
): RampPathPlan & { spiralRadius: number; segments: number } {
  const local = planCellLocalSpiral(
    storyHeight,
    floorIndex,
    SPIRAL_WALK_WIDTH,
    bounds.size,
    entryQuarterTurns
  );
  const y0 = walkSurfaceY(floorBaseY);
  const legs: RampLeg[] = local.legs.map((leg) => ({
    from: anchor(bounds.centerX + leg.from.x, y0 + leg.from.y, bounds.centerZ + leg.from.z),
    to: anchor(bounds.centerX + leg.to.x, y0 + leg.to.y, bounds.centerZ + leg.to.z),
  }));

  return {
    rampType: "spiral",
    entryCorner: local.entryCorner,
    exitCorner: local.exitCorner,
    legs,
    spiralRadius: local.spiralRadius,
    segments: local.segments,
  };
}

function cornerAngle(c: ShaftCorner): number {
  switch (c) {
    case "sw":
      return (-3 * Math.PI) / 4;
    case "se":
      return -Math.PI / 4;
    case "ne":
      return Math.PI / 4;
    case "nw":
      return (3 * Math.PI) / 4;
  }
}

export function planRampPath(
  bounds: ShaftBounds,
  floorIndex: number,
  floorBaseY: number,
  storyHeight: number,
  rampType: RampType
): RampPathPlan {
  switch (rampType) {
    case "straight":
      return planStraightPath(bounds, floorIndex, floorBaseY, storyHeight);
    case "l":
      return planLPath(bounds, floorIndex, floorBaseY, storyHeight);
    case "spiral":
      return planSpiralPath(bounds, floorIndex, floorBaseY, storyHeight);
  }
}

function landingCornersForTurn(
  turn: WalkAnchor,
  bounds: ShaftBounds,
  walkWidth: number
): { landingCornerA: WalkAnchor; landingCornerB: WalkAnchor } {
  const w = walkWidth;
  const y = turn.y;
  const eps = 0.05;
  if (Math.abs(turn.x - bounds.maxX) < eps && Math.abs(turn.z - bounds.minZ) < eps) {
    return {
      landingCornerA: anchor(bounds.maxX - w, y, bounds.minZ),
      landingCornerB: anchor(bounds.maxX, y, bounds.minZ + w),
    };
  }
  if (Math.abs(turn.x - bounds.minX) < eps && Math.abs(turn.z - bounds.minZ) < eps) {
    return {
      landingCornerA: anchor(bounds.minX, y, bounds.minZ),
      landingCornerB: anchor(bounds.minX + w, y, bounds.minZ + w),
    };
  }
  if (Math.abs(turn.x - bounds.maxX) < eps && Math.abs(turn.z - bounds.maxZ) < eps) {
    return {
      landingCornerA: anchor(bounds.maxX - w, y, bounds.maxZ - w),
      landingCornerB: anchor(bounds.maxX, y, bounds.maxZ),
    };
  }
  return {
    landingCornerA: anchor(bounds.minX, y, bounds.maxZ - w),
    landingCornerB: anchor(bounds.minX + w, y, bounds.maxZ),
  };
}

function localPlanToWorld(
  local: {
    groundAttach: LocalAnchor;
    landingEntry: LocalAnchor;
    landingExit: LocalAnchor;
    upperAttach: LocalAnchor;
    landingCornerA: LocalAnchor;
    landingCornerB: LocalAnchor;
    groundY: number;
  },
  bounds: ShaftBounds,
  floorBaseY: number
): Pick<
  LShapedRampAnchorPlan,
  | "groundAttach"
  | "landingEntry"
  | "landingExit"
  | "upperAttach"
  | "landingCornerA"
  | "landingCornerB"
  | "groundY"
> {
  const cx = bounds.centerX;
  const cz = bounds.centerZ;
  const oy = walkSurfaceY(floorBaseY);
  const toWorld = (a: LocalAnchor): WalkAnchor => ({
    x: cx + a.x,
    y: oy + a.y,
    z: cz + a.z,
  });
  return {
    groundAttach: toWorld(local.groundAttach),
    landingEntry: toWorld(local.landingEntry),
    landingExit: toWorld(local.landingExit),
    upperAttach: toWorld(local.upperAttach),
    landingCornerA: toWorld(local.landingCornerA),
    landingCornerB: toWorld(local.landingCornerB),
    groundY: oy + local.groundY,
  };
}

/**
 * L-ramp inside 4×4 cell — south entry, exit north, leg along east (even) or west (odd).
 * Y=0 at lower walk surface; Y=storyHeight at upper walk. Parametric in storyHeight.
 */
export function planCellLocalLShapedRamp(
  storyHeight: number,
  floorIndex: number,
  walkWidth = RAMP_WALK_WIDTH,
  cellSizeM = cellSize
): {
  groundAttach: LocalAnchor;
  landingEntry: LocalAnchor;
  landingExit: LocalAnchor;
  upperAttach: LocalAnchor;
  landingCornerA: LocalAnchor;
  landingCornerB: LocalAnchor;
  groundY: number;
} {
  const half = cellSizeM / 2;
  const halfW = walkWidth / 2;
  const yMid = storyHeight / 2;
  const southZ = -half + halfW;
  const northZ = half - halfW;
  const eastX = half - halfW;
  const westX = -half + halfW;
  const even = floorIndex % 2 === 0;

  if (even) {
    return {
      groundAttach: { x: 0, y: 0, z: southZ },
      landingEntry: { x: eastX, y: yMid, z: southZ },
      landingExit: { x: eastX, y: yMid, z: northZ },
      upperAttach: { x: 0, y: storyHeight, z: northZ },
      landingCornerA: { x: 0, y: yMid, z: southZ },
      landingCornerB: { x: eastX, y: yMid, z: northZ },
      groundY: 0,
    };
  }

  return {
    groundAttach: { x: 0, y: 0, z: southZ },
    landingEntry: { x: westX, y: yMid, z: southZ },
    landingExit: { x: westX, y: yMid, z: northZ },
    upperAttach: { x: 0, y: storyHeight, z: northZ },
    landingCornerA: { x: 0, y: yMid, z: southZ },
    landingCornerB: { x: westX, y: yMid, z: northZ },
    groundY: 0,
  };
}

/** Roof cartridge — north arrival to south terrace within cell. */
export function planCellLocalRoofLShapedRamp(
  storyHeight: number,
  floorIndex: number,
  walkWidth = RAMP_WALK_WIDTH,
  cellSizeM = cellSize
): ReturnType<typeof planCellLocalLShapedRamp> {
  const half = cellSizeM / 2;
  const halfW = walkWidth / 2;
  const yMid = storyHeight / 2;
  const southZ = -half + halfW;
  const northZ = half - halfW;
  const eastX = half - halfW;
  const westX = -half + halfW;
  const even = floorIndex % 2 === 0;

  if (even) {
    return {
      groundAttach: { x: 0, y: 0, z: northZ },
      landingEntry: { x: eastX, y: yMid, z: northZ },
      landingExit: { x: eastX, y: yMid, z: southZ },
      upperAttach: { x: 0, y: storyHeight, z: southZ },
      landingCornerA: { x: 0, y: yMid, z: northZ },
      landingCornerB: { x: eastX, y: yMid, z: southZ },
      groundY: 0,
    };
  }

  return {
    groundAttach: { x: 0, y: 0, z: northZ },
    landingEntry: { x: westX, y: yMid, z: northZ },
    landingExit: { x: westX, y: yMid, z: southZ },
    upperAttach: { x: 0, y: storyHeight, z: southZ },
    landingCornerA: { x: 0, y: yMid, z: northZ },
    landingCornerB: { x: westX, y: yMid, z: southZ },
    groundY: 0,
  };
}

export function planLShapedRampSpec(
  bounds: ShaftBounds,
  floorIndex: number,
  floorBaseY: number,
  storyHeight: number,
  walkWidth = RAMP_WALK_WIDTH,
  tread = RAMP_TREAD,
  entryQuarterTurns = 0
): LShapedRampAnchorPlan {
  const localBase = planCellLocalLShapedRamp(storyHeight, floorIndex, walkWidth);
  const rotated = {
    groundAttach: rotateLocalXZ(localBase.groundAttach, entryQuarterTurns),
    landingEntry: rotateLocalXZ(localBase.landingEntry, entryQuarterTurns),
    landingExit: rotateLocalXZ(localBase.landingExit, entryQuarterTurns),
    upperAttach: rotateLocalXZ(localBase.upperAttach, entryQuarterTurns),
    landingCornerA: rotateLocalXZ(localBase.landingCornerA, entryQuarterTurns),
    landingCornerB: rotateLocalXZ(localBase.landingCornerB, entryQuarterTurns),
    groundY: localBase.groundY,
  };
  const world = localPlanToWorld(rotated, bounds, floorBaseY);

  return {
    ...world,
    width: walkWidth,
    thickness: tread,
    toeLength: RAMP_TOE_LENGTH,
    toeMode: RAMP_TOE_MODE,
    toeMinVisibleThickness: RAMP_TOE_MIN_VISIBLE,
  };
}

/** Roof L-ramp: climbs from top-floor walk to roof terrace within the same 4×4 slot. */
export function planRoofLShapedRampSpec(
  bounds: ShaftBounds,
  topFloorIndex: number,
  topFloorBaseY: number,
  storyHeight: number,
  roofBaseY: number,
  walkWidth = RAMP_WALK_WIDTH,
  tread = RAMP_TREAD,
  entryQuarterTurns = 0
): LShapedRampAnchorPlan {
  void roofBaseY;
  const arrivalFloor = Math.max(0, topFloorIndex - 1);
  const localBase = planCellLocalRoofLShapedRamp(storyHeight, arrivalFloor, walkWidth);
  const rotated = {
    groundAttach: rotateLocalXZ(localBase.groundAttach, entryQuarterTurns),
    landingEntry: rotateLocalXZ(localBase.landingEntry, entryQuarterTurns),
    landingExit: rotateLocalXZ(localBase.landingExit, entryQuarterTurns),
    upperAttach: rotateLocalXZ(localBase.upperAttach, entryQuarterTurns),
    landingCornerA: rotateLocalXZ(localBase.landingCornerA, entryQuarterTurns),
    landingCornerB: rotateLocalXZ(localBase.landingCornerB, entryQuarterTurns),
    groundY: localBase.groundY,
  };
  const world = localPlanToWorld(rotated, bounds, topFloorBaseY);

  return {
    ...world,
    width: walkWidth,
    thickness: tread,
    toeLength: RAMP_TOE_LENGTH,
    toeMode: RAMP_TOE_MODE,
    toeMinVisibleThickness: RAMP_TOE_MIN_VISIBLE,
  };
}

export function legToRunSpec(leg: RampLeg, walkWidth = RAMP_WALK_WIDTH): RampRunSpec {
  return {
    from: leg.from,
    to: leg.to,
    walkWidth,
    tread: RAMP_TREAD,
    guardHeight: RAMP_GUARD_H,
    guardThickness: RAMP_GUARD_T,
  };
}

/** Open intervals (meters from edge start) where shaft guard is omitted for ramp access. */
export function shaftGuardOpenIntervals(
  bounds: ShaftBounds,
  path: RampPathPlan,
  walkWidth = RAMP_WALK_WIDTH
): Record<ShaftEdge, [number, number][]> {
  const len = bounds.size;
  const gap = walkWidth + 0.08;
  const empty: Record<ShaftEdge, [number, number][]> = {
    south: [],
    north: [],
    east: [],
    west: [],
  };

  if (path.rampType === "l") {
    if (path.entryCorner === "sw") {
      empty.south = [[0, len]];
      empty.east = [[0, len]];
      empty.west = [[0, gap]];
      empty.north = [[len - gap, len]];
    } else {
      empty.south = [[0, len]];
      empty.west = [[0, len]];
      empty.east = [[len - gap, len]];
      empty.north = [[0, gap]];
    }
    return empty;
  }

  if (path.rampType === "spiral") {
    return cornerGapIntervals(path.entryCorner, path.exitCorner, len, gap);
  }

  return cornerGapIntervals(path.entryCorner, path.exitCorner, len, gap);
}

function cornerGapIntervals(
  entry: ShaftCorner,
  exit: ShaftCorner,
  len: number,
  gap: number
): Record<ShaftEdge, [number, number][]> {
  const g: Record<ShaftEdge, [number, number][]> = {
    south: [],
    north: [],
    east: [],
    west: [],
  };

  const addEntry = (c: ShaftCorner) => {
    switch (c) {
      case "sw":
        g.south.push([0, gap]);
        g.west.push([0, gap]);
        break;
      case "se":
        g.south.push([len - gap, len]);
        g.east.push([0, gap]);
        break;
      case "ne":
        g.north.push([len - gap, len]);
        g.east.push([len - gap, len]);
        break;
      case "nw":
        g.north.push([0, gap]);
        g.west.push([len - gap, len]);
        break;
    }
  };

  addEntry(entry);
  if (exit !== entry) addEntry(exit);
  return g;
}

export interface ShaftGuardPiece {
  edge: ShaftEdge;
  startAlong: number;
  length: number;
  miterStart: boolean;
  miterEnd: boolean;
  name: string;
}

/** Guard rails around shaft opening — miters at corners, gaps where ramp connects. */
export function planShaftGuardPieces(
  bounds: ShaftBounds,
  openIntervals: Record<ShaftEdge, [number, number][]>
): ShaftGuardPiece[] {
  const len = bounds.size;
  const pieces: ShaftGuardPiece[] = [];

  const addEdge = (edge: ShaftEdge) => {
    const guarded = invertIntervals(len, openIntervals[edge]);
    guarded.forEach(([start, end], i) => {
      const length = end - start;
      if (length < 0.15) return;
      pieces.push({
        edge,
        startAlong: start,
        length,
        miterStart: start < 1e-4,
        miterEnd: end > len - 1e-4,
        name: `shaft_guard_${edge}_${i}`,
      });
    });
  };

  addEdge("south");
  addEdge("north");
  addEdge("east");
  addEdge("west");
  return pieces;
}

function invertIntervals(total: number, gaps: [number, number][]): [number, number][] {
  if (gaps.length === 0) return [[0, total]];
  const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let cursor = 0;
  for (const [a, b] of sorted) {
    if (a > cursor) out.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < total) out.push([cursor, total]);
  return out;
}

/** Roof leg: continues from top-floor exit corner to opposite corner on the terrace. */
export function planRoofRampPath(
  bounds: ShaftBounds,
  topFloorIndex: number,
  topFloorBaseY: number,
  storyHeight: number,
  roofBaseY: number,
  rampType: RampType
): RampPathPlan {
  const arrivalFloor = Math.max(0, topFloorIndex - 1);
  const even = arrivalFloor % 2 === 0;
  const entryCorner = (even ? "ne" : "nw") as ShaftCorner;
  const exitCorner = (even ? "sw" : "se") as ShaftCorner;
  const fromXZ = shaftCornerXZ(bounds, entryCorner);
  const toXZ = shaftCornerXZ(bounds, exitCorner);
  const fromY = walkSurfaceY(topFloorBaseY);
  const toY = walkSurfaceY(roofBaseY);

  if (rampType === "l") {
    const midY = (fromY + toY) / 2;
    const via = lViaCorner(entryCorner, exitCorner);
    const viaXZ = shaftCornerXZ(bounds, via);
    return {
      rampType: "l",
      entryCorner,
      exitCorner,
      legs: [
        { from: anchor(fromXZ.x, fromY, fromXZ.z), to: anchor(viaXZ.x, midY, viaXZ.z) },
        { from: anchor(viaXZ.x, midY, viaXZ.z), to: anchor(toXZ.x, toY, toXZ.z) },
      ],
    };
  }

  return {
    rampType: rampType === "spiral" ? "spiral" : "straight",
    entryCorner,
    exitCorner,
    legs: [{ from: anchor(fromXZ.x, fromY, fromXZ.z), to: anchor(toXZ.x, toY, toXZ.z) }],
  };
}

/** Bend corner for an L-shaped run between diagonal shaft corners. */
function lViaCorner(entry: ShaftCorner, exit: ShaftCorner): ShaftCorner {
  const key = `${entry}-${exit}`;
  const map: Record<string, ShaftCorner> = {
    "nw-se": "ne",
    "se-nw": "sw",
    "sw-ne": "se",
    "ne-sw": "nw",
  };
  return map[key] ?? "se";
}

/** @deprecated use planRampPath */
export function rampRunSpec(
  bounds: ShaftBounds,
  floorIndex: number,
  floorBaseY: number,
  storyHeight: number,
  walkWidth = RAMP_WALK_WIDTH
): RampRunSpec {
  const path = planStraightPath(bounds, floorIndex, floorBaseY, storyHeight);
  return legToRunSpec(path.legs[0], walkWidth);
}

export { resolveShaftCenter } from "./circulation-anchor";
