/**
 * Zone outlines — the ADMIN-ONLY ground hint that replaces the old filled zone discs.
 *
 * A zone is an authoring concept: a named region the editor uses to place a crew, run
 * a show, or gate a door. It belongs on the plan view, not in the world. A visitor
 * standing in a venue should see architecture, not the support geometry that positions
 * it — so the runtime draws nothing for a zone unless the local player is an admin
 * wallet, and even then only a faint dotted ring: an insinuation of the boundary,
 * never a lit surface.
 *
 * The pips are axis-aligned squares on purpose. A tangent-rotated segment ring needs
 * the yaw convention to be exactly right, and a mirrored ring is a silent defect that
 * only shows up as a subtly wrong shape in-world (see shared/dcl-placement.ts for what
 * that class of bug has already cost here). Square pips read the same from every angle
 * and cannot be mirrored.
 */

export type ZoneOutlineShape =
  | { kind: "circle"; radius: number }
  | { kind: "rect"; width: number; depth: number };

/** Target gap between pips along the boundary. */
export const ZONE_OUTLINE_SPACING_M = 0.75;
/** A tiny zone still has to read as a ring… */
export const ZONE_OUTLINE_MIN_DOTS = 16;
/** …and a 24 m one must not cost hundreds of entities. */
export const ZONE_OUTLINE_MAX_DOTS = 64;
/** Edge length of one pip. */
export const ZONE_OUTLINE_DOT_M = 0.16;
/** Pip thickness. Flush with the floor flickers in the explorer; 5 mm is the house rule. */
export const ZONE_OUTLINE_DOT_THICK_M = 0.012;
/** Lift above the slab, same reason. */
/** Lift above the walk surface so indoor rings are not buried in the slab. */
export const ZONE_OUTLINE_LIFT_M = 0.18;

function dotCount(perimeter: number): number {
  const wanted = Math.round(perimeter / ZONE_OUTLINE_SPACING_M);
  return Math.max(ZONE_OUTLINE_MIN_DOTS, Math.min(ZONE_OUTLINE_MAX_DOTS, wanted));
}

/** Perimeter length of the zone boundary, in metres. */
export function zoneOutlinePerimeter(shape: ZoneOutlineShape): number {
  if (shape.kind === "circle") return 2 * Math.PI * Math.max(0, shape.radius);
  return 2 * (Math.max(0, shape.width) + Math.max(0, shape.depth));
}

/**
 * Pip positions as offsets from the zone centre, evenly spaced around the boundary.
 * Callers add the zone's scene-space centre — this stays pure so it can be tested
 * without an engine.
 */
export function zoneOutlineDots(shape: ZoneOutlineShape): { x: number; z: number }[] {
  const perimeter = zoneOutlinePerimeter(shape);
  if (!(perimeter > 0)) return [];
  const n = dotCount(perimeter);

  if (shape.kind === "circle") {
    const r = shape.radius;
    const out: { x: number; z: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
    return out;
  }

  const halfW = shape.width / 2;
  const halfD = shape.depth / 2;
  // Walk the rectangle clockwise from the -X/-Z corner at even arc length, so the
  // spacing is uniform along the whole boundary instead of per-edge.
  const edges: { fromX: number; fromZ: number; toX: number; toZ: number; len: number }[] = [
    { fromX: -halfW, fromZ: -halfD, toX: halfW, toZ: -halfD, len: shape.width },
    { fromX: halfW, fromZ: -halfD, toX: halfW, toZ: halfD, len: shape.depth },
    { fromX: halfW, fromZ: halfD, toX: -halfW, toZ: halfD, len: shape.width },
    { fromX: -halfW, fromZ: halfD, toX: -halfW, toZ: -halfD, len: shape.depth },
  ];
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    let travelled = (i / n) * perimeter;
    for (const edge of edges) {
      if (travelled > edge.len && edge !== edges[edges.length - 1]) {
        travelled -= edge.len;
        continue;
      }
      const k = edge.len > 0 ? Math.min(1, travelled / edge.len) : 0;
      out.push({
        x: edge.fromX + (edge.toX - edge.fromX) * k,
        z: edge.fromZ + (edge.toZ - edge.fromZ) * k,
      });
      break;
    }
  }
  return out;
}
