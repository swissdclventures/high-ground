/**
 * Plan shapes — the building's footprint as an OUTLINE rather than two numbers.
 *
 * `Footprint { width, depth }` made every new silhouette a new `if` branch across walls,
 * columns, slab, atrium, terrace guards, ramp, massing, annexes and colliders — and each
 * branch disabled the features it couldn't handle. A plan shape instead produces a closed
 * ring of points; `perimeterFromVertices` turns that into the same `PerimeterEdge[]` the
 * kit already consumes, so shape stops being a branch and becomes data.
 *
 * The walkable contract is untouched: floors stay flat horizontal slabs, walls stay thin
 * vertical panels standing on edges, colliders stay one box per edge. Only the silhouette
 * is freed.
 *
 * Every shape is generated to FILL the width × depth extent and is centred on the origin.
 * (`polygonPerimeter` inscribes a regular n-gon in the smaller axis instead, which is why
 * a hexagon on a 16 × 48 plot comes out tiny — `ngon` here keeps that behaviour so the
 * existing hex/oct buildings are unchanged.)
 *
 * A courtyard is deliberately NOT a shape here: it is a rect plus an interior hole, and
 * holes already exist as the atrium/void system. A plan ring must stay a simple polygon.
 */

import {
  perimeterFromVertices,
  polygonSignedArea,
  regularPolygonVertices,
  type PerimeterFootprint,
  type Point2,
} from "./perimeter";
import type { BuildingConfig } from "./types";

/** Facet budget: one wall panel + one collider per edge, per floor. */
export const MAX_PLAN_VERTICES = 48;
/** Below this a facet is not worth a panel — and tiny edges break wall-module fitting. */
export const MIN_PLAN_EDGE_M = 0.6;

export type PlanShape =
  /** The classic building. 4 corners, fills the extent. */
  | { kind: "rect" }
  /** Regular N-gon inscribed in the smaller axis — 6 hex, 8 oct, 16/24 ≈ circular. */
  | { kind: "ngon"; sides: number }
  /** Rectangle with one corner notched away. `arm` = fraction of the extent the legs keep. */
  | { kind: "l"; arm?: number }
  /** Rectangle with a slot cut into the north edge. */
  | { kind: "u"; arm?: number; depth?: number }
  /** Four arms from a centre — cruciform / church plan. */
  | { kind: "cross"; arm?: number }
  /** Ship hull: pointed bow at +Z, straight midship, rounded stern at −Z. */
  | { kind: "hull"; bow?: number; stern?: number }
  /** Rectangle with rounded ends — stadium / drum / terminal. */
  | { kind: "stadium"; round?: number; segments?: number }
  /**
   * Rectangle with the four corners filleted away — the soft toy block.
   *
   * `radius` is the fillet as a fraction of the SHORTER extent, so a slab and a cube
   * round by the same visible amount. `segments` is the facets per corner: 3 already
   * reads as soft, 5 is smooth, and the cost is `4 + 4 × segments` wall panels per
   * floor against a rect's 4 — an order cheaper than the 16-gon it imitates.
   */
  | { kind: "rounded_rect"; radius?: number; segments?: number }
  /**
   * Superellipse — |x/a|^n + |z/b|^n = 1. The continuous cousin of `rounded_rect`:
   * no straight run anywhere, the curvature just slackens at the flats.
   *
   * `exponent` 2 is a pure ellipse, 4 the classic squircle, 8 nearly a rect. Unlike
   * `ngon` this fills the full width × depth extent rather than inscribing in the
   * smaller axis, so it stays a pill on an oblong plot instead of shrinking to a disc.
   */
  | { kind: "squircle"; exponent?: number; segments?: number }
  /** Arbitrary ring, in metres, centred on the origin. The AI's escape hatch. */
  | { kind: "custom"; vertices: Point2[] };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function rectVertices(w: number, d: number): Point2[] {
  const hw = w / 2;
  const hd = d / 2;
  return [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    { x: -hw, z: hd },
  ];
}

/** Notch the NE corner away, leaving two legs of thickness `arm`. */
function lVertices(w: number, d: number, arm: number): Point2[] {
  const hw = w / 2;
  const hd = d / 2;
  const a = clamp(arm, 0.15, 0.85);
  const legW = w * a;
  const legD = d * a;
  return [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: -hd + legD },
    { x: -hw + legW, z: -hd + legD },
    { x: -hw + legW, z: hd },
    { x: -hw, z: hd },
  ];
}

/** Slot cut into the north edge — a forecourt between two wings. */
function uVertices(w: number, d: number, arm: number, slotDepth: number): Point2[] {
  const hw = w / 2;
  const hd = d / 2;
  const a = clamp(arm, 0.12, 0.45);
  const sd = clamp(slotDepth, 0.15, 0.85);
  const wingW = w * a;
  const baseZ = -hd + d * (1 - sd);
  return [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    { x: hw - wingW, z: hd },
    { x: hw - wingW, z: baseZ },
    { x: -hw + wingW, z: baseZ },
    { x: -hw + wingW, z: hd },
    { x: -hw, z: hd },
  ];
}

/** Cruciform — the nave/transept plan, and the only easy way to a church silhouette. */
function crossVertices(w: number, d: number, arm: number): Point2[] {
  const hw = w / 2;
  const hd = d / 2;
  const a = clamp(arm, 0.15, 0.8);
  const ax = (w * a) / 2;
  const az = (d * a) / 2;
  return [
    { x: -ax, z: -hd },
    { x: ax, z: -hd },
    { x: ax, z: -az },
    { x: hw, z: -az },
    { x: hw, z: az },
    { x: ax, z: az },
    { x: ax, z: hd },
    { x: -ax, z: hd },
    { x: -ax, z: az },
    { x: -hw, z: az },
    { x: -hw, z: -az },
    { x: -ax, z: -az },
  ];
}

/**
 * Ship hull. Bow tapers to a point at +Z; stern is a half-ellipse at −Z. Faceted, not
 * smooth — every facet costs a wall panel, and DCL is a triangle budget before it is a
 * render target.
 */
function hullVertices(w: number, d: number, bow: number, stern: number): Point2[] {
  const hw = w / 2;
  const hd = d / 2;
  const bowLen = clamp(bow, 0.1, 0.5) * d;
  const sternLen = clamp(stern, 0.05, 0.35) * d;
  const out: Point2[] = [];

  // Stern half-ellipse, PORT → STARBOARD (−X → +X) along the −Z end. The direction is not
  // cosmetic: the ring continues up the starboard side, so a stern that ended at −X would
  // jump the full beam and close as a self-crossing figure-eight.
  const STERN_SEGMENTS = 4;
  for (let i = 0; i <= STERN_SEGMENTS; i++) {
    const angle = Math.PI * (1 - i / STERN_SEGMENTS); // π → 0
    out.push({ x: hw * Math.cos(angle), z: -hd + sternLen - sternLen * Math.sin(angle) });
  }
  // Starboard side up to where the bow taper begins.
  out.push({ x: hw, z: hd - bowLen });
  // Bow shoulder then the stem point.
  out.push({ x: hw * 0.55, z: hd - bowLen * 0.45 });
  out.push({ x: 0, z: hd });
  out.push({ x: -hw * 0.55, z: hd - bowLen * 0.45 });
  // Port side back down to the stern arc.
  out.push({ x: -hw, z: hd - bowLen });
  return out;
}

/** Rectangle with semicircular ends — terminals, drums, arenas. */
function stadiumVertices(w: number, d: number, round: number, segments: number): Point2[] {
  const hw = w / 2;
  const hd = d / 2;
  const r = clamp(round, 0.05, 0.5) * d;
  const seg = clamp(Math.round(segments), 2, 8);
  const straightZ = hd - r;
  const out: Point2[] = [];
  // Both caps must traverse in OPPOSITE x directions, or the ring jumps across the middle
  // and closes as a bowtie (zero area, self-crossing) instead of a stadium.
  // South cap: −X → +X.
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI * (1 - i / seg);
    out.push({ x: hw * Math.cos(a), z: -straightZ - r * Math.sin(a) });
  }
  // North cap: +X → −X.
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI * (i / seg);
    out.push({ x: hw * Math.cos(a), z: straightZ + r * Math.sin(a) });
  }
  return out;
}

/**
 * Rectangle with filleted corners. Each corner is a quarter-arc of `segments` facets
 * swept between the two straight runs, so the ring stays convex and self-intersection
 * free for every radius the clamp allows.
 *
 * Both ends of the radius range are clamped against `MIN_PLAN_EDGE_M`, not against a bare
 * fraction, because a fillet fails at BOTH extremes and for different reasons. Too deep and
 * opposite fillets eat the straight runs between them; too shallow and the arc's own facets
 * are shorter than a wall panel can be. A fraction-only clamp produced plans that looked
 * reasonable and then failed `planShapeIssue` with "edge shorter than 0.6 m".
 *
 * Under-shooting degrades rather than throws: too small to bevel comes back a plain rect,
 * and too coarse for the requested facet count drops segments until the arc can carry them.
 * A pastel city generates hundreds of these at assorted sizes; a throw there is a dead build.
 */
function roundedRectVertices(w: number, d: number, radius: number, segments: number): Point2[] {
  const hw = w / 2;
  const hd = d / 2;
  const shorter = Math.min(w, d);
  // Leave one legal panel of straight run on the shorter axis, where the runs meet first.
  const maxR = (shorter - MIN_PLAN_EDGE_M) / 2;
  const r = Math.min(clamp(radius, 0.02, 0.5) * shorter, maxR);
  // A single-facet quarter arc spans a chord of r x sqrt(2); below that there is no bevel
  // to draw, only a sliver edge the walkable contract rejects.
  if (r < MIN_PLAN_EDGE_M / Math.SQRT2) return rectVertices(w, d);
  let seg = clamp(Math.round(segments), 1, 8);
  while (seg > 1 && 2 * r * Math.sin(Math.PI / (4 * seg)) < MIN_PLAN_EDGE_M) seg--;
  const out: Point2[] = [];
  // Corner centres, walked in the same winding order rectVertices uses (SW → SE → NE → NW),
  // each paired with the angle its quarter-arc starts at.
  const corners: Array<{ cx: number; cz: number; start: number }> = [
    { cx: hw - r, cz: -hd + r, start: -Math.PI / 2 }, // SE
    { cx: hw - r, cz: hd - r, start: 0 }, // NE
    { cx: -hw + r, cz: hd - r, start: Math.PI / 2 }, // NW
    { cx: -hw + r, cz: -hd + r, start: Math.PI }, // SW
  ];
  for (const { cx, cz, start } of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = start + (Math.PI / 2) * (i / seg);
      out.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) });
    }
  }
  return out;
}

/**
 * Superellipse ring filling the full extent. Sampled by ANGLE rather than by arc length,
 * which concentrates facets at the corners — exactly where a squircle needs them and the
 * flats do not.
 *
 * Facet count is then reduced until no edge falls under `MIN_PLAN_EDGE_M`, so asking for a
 * smooth pill on a 10 m pavilion quietly yields a coarser one instead of an invalid plan.
 */
function squircleVertices(w: number, d: number, exponent: number, segments: number): Point2[] {
  const hw = w / 2;
  const hd = d / 2;
  const n = clamp(exponent, 2, 12);
  const ring = (seg: number): Point2[] => {
    const out: Point2[] = [];
    for (let i = 0; i < seg; i++) {
      const a = (2 * Math.PI * i) / seg;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // |cos|^(2/n) with the sign carried back, the standard superellipse parameterisation.
      out.push({
        x: hw * Math.sign(ca) * Math.abs(ca) ** (2 / n),
        z: hd * Math.sign(sa) * Math.abs(sa) ** (2 / n),
      });
    }
    return out;
  };
  const shortestEdge = (v: Point2[]): number =>
    Math.min(...v.map((p, i) => Math.hypot(v[(i + 1) % v.length].x - p.x, v[(i + 1) % v.length].z - p.z)));
  // Multiples of 4 only, so the four extreme points land exactly on the axes; an off-axis
  // apex reads as a lopsided blob at low facet counts.
  let seg = clamp(Math.round(segments / 4) * 4, 8, MAX_PLAN_VERTICES - (MAX_PLAN_VERTICES % 4));
  let out = ring(seg);
  while (seg > 8 && shortestEdge(out) < MIN_PLAN_EDGE_M) {
    seg -= 4;
    out = ring(seg);
  }
  return out;
}

/** The closed ring for a plan shape, filling `width` × `depth` and centred on the origin. */
export function planShapeVertices(shape: PlanShape, width: number, depth: number): Point2[] {
  const w = Math.max(0.5, width);
  const d = Math.max(0.5, depth);
  switch (shape.kind) {
    case "rect":
      return rectVertices(w, d);
    case "ngon":
      // Matches `polygonPerimeter`: inscribed in the SMALLER axis, flat edge facing south.
      return regularPolygonVertices(Math.max(5, Math.floor(shape.sides)), Math.min(w, d) / 2);
    case "l":
      return lVertices(w, d, shape.arm ?? 0.5);
    case "u":
      return uVertices(w, d, shape.arm ?? 0.3, shape.depth ?? 0.5);
    case "cross":
      return crossVertices(w, d, shape.arm ?? 0.4);
    case "hull":
      return hullVertices(w, d, shape.bow ?? 0.3, shape.stern ?? 0.15);
    case "stadium":
      return stadiumVertices(w, d, shape.round ?? 0.3, shape.segments ?? 4);
    case "rounded_rect":
      return roundedRectVertices(w, d, shape.radius ?? 0.18, shape.segments ?? 3);
    case "squircle":
      return squircleVertices(w, d, shape.exponent ?? 4, shape.segments ?? 20);
    case "custom": {
      if (!shape.vertices.length) return [];
      const minX = Math.min(...shape.vertices.map((v) => v.x));
      const maxX = Math.max(...shape.vertices.map((v) => v.x));
      const minZ = Math.min(...shape.vertices.map((v) => v.z));
      const maxZ = Math.max(...shape.vertices.map((v) => v.z));
      const sourceW = maxX - minX;
      const sourceD = maxZ - minZ;
      const centerX = (minX + maxX) / 2;
      const centerZ = (minZ + maxZ) / 2;
      // Custom vertices describe the outline's proportions; width/depth remain the
      // authoritative extent. This matters on a tapered upper floor: copying the raw
      // ground ring made its walls hang outside the smaller slab and its colliders.
      return shape.vertices.map((v) => ({
        x: sourceW > 1e-6 ? ((v.x - centerX) * w) / sourceW : v.x - centerX,
        z: sourceD > 1e-6 ? ((v.z - centerZ) * d) / sourceD : v.z - centerZ,
      }));
    }
  }
}

/** Build the walkable perimeter for a plan shape. */
export function planShapePerimeter(
  shape: PlanShape,
  width: number,
  depth: number
): PerimeterFootprint {
  const verts = planShapeVertices(shape, width, depth);
  // Rects keep their cardinal edge ids so every existing front/back/left/right consumer
  // (wall sections, entry side, glass overrides) keeps resolving.
  if (shape.kind === "rect") {
    const ids = ["front", "right", "back", "left"] as const;
    return perimeterFromVertices(verts, { kind: "rect", idForIndex: (i) => ids[i] ?? `e${i}` });
  }
  return perimeterFromVertices(verts, { kind: "polygon" });
}

function segmentsProperlyIntersect(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const cross = (p: Point2, q: Point2, r: Point2) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  // Strictly opposite signs on BOTH segments. A `(d1 > 0) !== (d2 > 0)` form counts a zero
  // — an endpoint lying exactly on the other segment — as a crossing, which flags every
  // legitimate touching vertex: the stadium's cap seams, and any plan whose corner meets a
  // collinear neighbour. Touching is not folding.
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Reject rings the kit cannot build a walkable floor from. Null = OK.
 *
 * Self-intersection is the one that matters: the slab triangulator would produce a folded
 * floor and the per-edge colliders would cross, which is precisely the "invisible wall"
 * class of bug. Cheap O(n²) — n is capped at 48.
 */
export function planShapeIssue(shape: PlanShape, width: number, depth: number): string | null {
  const v = planShapeVertices(shape, width, depth);
  if (v.length < 3) return "A plan needs at least 3 corners";
  if (v.length > MAX_PLAN_VERTICES) {
    return `A plan is capped at ${MAX_PLAN_VERTICES} corners (one wall panel each) — this has ${v.length}`;
  }
  // Self-intersection is checked BEFORE area: a symmetric bowtie has zero signed area, so
  // an area-first order would report the vague "no floor area" for the one defect that has
  // a precise, actionable name.
  const n = v.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the closing edge
      if (segmentsProperlyIntersect(v[i], v[(i + 1) % n], v[j], v[(j + 1) % n])) {
        return "Plan outline crosses itself — walls would fold through each other";
      }
    }
  }
  if (Math.abs(polygonSignedArea(v)) < 1) return "Plan encloses no usable floor area";
  for (let i = 0; i < n; i++) {
    const a = v[i];
    const b = v[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.z - a.z) < MIN_PLAN_EDGE_M) {
      return `Plan has an edge shorter than ${MIN_PLAN_EDGE_M} m — merge those corners`;
    }
  }
  return null;
}

/**
 * The plan a config actually builds. `planShape` wins; otherwise the legacy
 * `footprintSides` is read as a regular n-gon, so every stored build keeps rendering
 * exactly as before without a data migration.
 */
export function resolvePlanShape(config: BuildingConfig): PlanShape {
  if (config.planShape) return config.planShape;
  const sides = config.footprintSides;
  if (typeof sides === "number" && sides >= 5) return { kind: "ngon", sides: Math.floor(sides) };
  return { kind: "rect" };
}

/** Per-floor plan override — the floor wears a different outline from the building. */
export interface FloorPlanShapeOverride {
  floor: number;
  shape: PlanShape;
}

/**
 * The plan for ONE floor. This plus the existing per-floor extent (`floorFootprints`) is
 * what makes a silhouette: a hull that tapers deck by deck, a podium carrying a smaller
 * tower, a bridge block sitting on a ship's top deck.
 *
 * Shape and extent are deliberately separate axes — narrowing every deck of a hull is an
 * extent change that should NOT have to restate "still a hull", while dropping a rectangular
 * bridge block on top is a shape change that should not disturb the decks below.
 */
export function resolvePlanShapeForFloor(config: BuildingConfig, floor: number): PlanShape {
  const override = (config.floorPlanShapes ?? []).find((o) => o.floor === floor);
  return override?.shape ?? resolvePlanShape(config);
}

/**
 * True when the plan is anything other than the plain rectangle — i.e. when the composer
 * should take its edge-driven path. Replaces the `polygonSidesForConfig(config) !== null`
 * test, which could only ever recognise a regular n-gon.
 *
 * Any floor being non-rect puts the WHOLE building on the edge-driven path: the two paths
 * build walls from different primitives (grid bays vs plan edges), so a building must not
 * straddle them.
 */
export function isNonRectPlan(config: BuildingConfig): boolean {
  if (resolvePlanShape(config).kind !== "rect") return true;
  return (config.floorPlanShapes ?? []).some((o) => o.shape.kind !== "rect");
}

/**
 * THE replacement for `footprintPerimeter(width, depth, config.footprintSides)`.
 *
 * That call rebuilds a REGULAR n-gon from a facet count, which was harmless while the only
 * faceted plans were hexagons and octagons — the count and the shape agreed. They no longer
 * do: an L-plan has 6 facets, so `footprintPerimeter(w, d, 6)` returns a regular hexagon
 * that has nothing to do with the building. Anything reasoning about where the building's
 * edges ARE (fascia, atrium clamping, circulation anchoring, placement gates) must come
 * through here instead.
 */
export function planPerimeterForConfig(
  config: BuildingConfig,
  width: number,
  depth: number,
  floor?: number
): PerimeterFootprint {
  const shape =
    typeof floor === "number" ? resolvePlanShapeForFloor(config, floor) : resolvePlanShape(config);
  return planShapePerimeter(shape, width, depth);
}

/** Facet count of a config's plan — what the wall/column loops iterate. */
export function planEdgeCount(config: BuildingConfig, width: number, depth: number): number {
  return planShapeVertices(resolvePlanShape(config), width, depth).length;
}

export const PLAN_SHAPE_PRESETS: { id: string; label: string; shape: PlanShape }[] = [
  { id: "rect", label: "Rectangle", shape: { kind: "rect" } },
  { id: "hex", label: "Hexagon", shape: { kind: "ngon", sides: 6 } },
  { id: "oct", label: "Octagon", shape: { kind: "ngon", sides: 8 } },
  { id: "round12", label: "Rounded (12 sides)", shape: { kind: "ngon", sides: 12 } },
  { id: "round16", label: "Round (16 sides)", shape: { kind: "ngon", sides: 16 } },
  { id: "l", label: "L-plan", shape: { kind: "l", arm: 0.5 } },
  { id: "u", label: "U-plan (forecourt)", shape: { kind: "u", arm: 0.3, depth: 0.5 } },
  { id: "cross", label: "Cross / cruciform", shape: { kind: "cross", arm: 0.4 } },
  { id: "stadium", label: "Stadium (rounded ends)", shape: { kind: "stadium", round: 0.3 } },
  {
    id: "rounded_rect",
    label: "Soft block (rounded corners)",
    shape: { kind: "rounded_rect", radius: 0.18, segments: 3 },
  },
  {
    id: "rounded_rect_soft",
    label: "Soft block (deep bevel)",
    shape: { kind: "rounded_rect", radius: 0.35, segments: 4 },
  },
  { id: "squircle", label: "Squircle (pill)", shape: { kind: "squircle", exponent: 4 } },
  { id: "hull", label: "Ship hull", shape: { kind: "hull", bow: 0.3, stern: 0.15 } },
];
