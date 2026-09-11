/**
 * Edge-centric perimeter model for rectangular and regular N-gon footprints.
 *
 * Rectangular buildings keep the classic 4 cardinal sides. Polygon skins
 * (hexagon, octagon, …) expose one PerimeterEdge per facet. Walls, columns,
 * roof guards, and walk-collider clipping all consume this list instead of
 * hard-coding front|back|left|right.
 */

export type Point2 = { x: number; z: number };

export interface PerimeterEdge {
  /** Stable id: `front`/`back`/`left`/`right` for rects, `e0`…`eN-1` for polygons. */
  id: string;
  index: number;
  start: Point2;
  end: Point2;
  /** Midpoint of the edge. */
  mid: Point2;
  /** Edge length in meters. */
  length: number;
  /** Outward horizontal normal (unit). */
  outward: Point2;
  /** World Y rotation that aligns a panel's local +X with the edge direction. */
  panelRotationY: number;
  /** True when this edge is the most-south (lowest mid.z) — default doorway. */
  isEntryEdge: boolean;
}

export interface PerimeterFootprint {
  kind: "rect" | "polygon";
  /** Facet count: 4 for rect, ≥5 for polygon skin. */
  sides: number;
  /** Circumradius for polygons; half-diagonal equivalent unused for rect. */
  radius: number;
  width: number;
  depth: number;
  /** Closed vertex ring (length === sides). */
  vertices: Point2[];
  edges: PerimeterEdge[];
  /** Index of the south-most edge (entry). */
  entryEdgeIndex: number;
}

/** Rotate a regular N-gon so a flat edge faces south (−Z). */
export function polygonFlatSouthOffsetRad(sides: number): number {
  return -Math.PI / 2 - Math.PI / sides;
}

/** Regular N-gon vertices inscribed at `radius`, flat-south by default. */
export function regularPolygonVertices(
  sides: number,
  radius: number,
  offsetRad = polygonFlatSouthOffsetRad(sides)
): Point2[] {
  const n = Math.max(3, Math.floor(sides));
  const verts: Point2[] = [];
  for (let i = 0; i < n; i++) {
    const a = offsetRad + (i * 2 * Math.PI) / n;
    verts.push({ x: radius * Math.cos(a), z: radius * Math.sin(a) });
  }
  return verts;
}

/**
 * Shoelace signed area. Positive = the winding this module treats as canonical
 * (the order `rectPerimeter` and `regularPolygonVertices` already emit).
 */
export function polygonSignedArea(vertices: Point2[]): number {
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

/** Force the canonical (positive-area) winding so outward normals are unambiguous. */
export function normalizeWinding(vertices: Point2[]): Point2[] {
  return polygonSignedArea(vertices) < 0 ? [...vertices].reverse() : vertices;
}

function edgeFromEndpoints(
  id: string,
  index: number,
  start: Point2,
  end: Point2,
  isEntryEdge: boolean
): PerimeterEdge {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const mid = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
  // Outward = tangent rotated 90° CW in XZ: (dx,dz) → (dz,-dx). Correct for EVERY edge
  // provided the ring carries the canonical winding, which `buildEdgesFromVertices`
  // guarantees. Do NOT reintroduce an "is it pointing away from the origin?" check —
  // it agrees for centered convex shapes but flips exactly the edges that make a plan
  // interesting: on an L / U / courtyard plan the reflex corner's outward normal
  // legitimately points back toward the centre, and flipping it turns the wall (and its
  // collider) inside out.
  const olen = Math.hypot(dz, dx) || 1;
  return {
    id,
    index,
    start,
    end,
    mid,
    length,
    outward: { x: dz / olen, z: -dx / olen },
    panelRotationY: -Math.atan2(dz, dx),
    isEntryEdge,
  };
}

function buildEdgesFromVertices(
  ring: Point2[],
  idForIndex: (i: number) => string
): { edges: PerimeterEdge[]; entryEdgeIndex: number; vertices: Point2[] } {
  const vertices = normalizeWinding(ring);
  const n = vertices.length;
  let entryEdgeIndex = 0;
  let minZ = Infinity;
  const mids: Point2[] = [];
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    mids.push(mid);
    if (mid.z < minZ) {
      minZ = mid.z;
      entryEdgeIndex = i;
    }
  }
  const edges = vertices.map((_, i) =>
    edgeFromEndpoints(
      idForIndex(i),
      i,
      vertices[i],
      vertices[(i + 1) % n],
      i === entryEdgeIndex
    )
  );
  return { edges, entryEdgeIndex, vertices };
}

/**
 * Build a perimeter from an ARBITRARY closed ring — the generalisation that lets a plan
 * be any outline (L, U, cross, courtyard, ship hull) instead of only a rectangle or a
 * regular N-gon. Winding is normalised, so callers may hand vertices in either order.
 */
export function perimeterFromVertices(
  ring: Point2[],
  opts: { kind?: "rect" | "polygon"; idForIndex?: (i: number) => string } = {}
): PerimeterFootprint {
  const idForIndex = opts.idForIndex ?? ((i: number) => `e${i}`);
  const { edges, entryEdgeIndex, vertices } = buildEdgesFromVertices(ring, idForIndex);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let radius = 0;
  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minZ = Math.min(minZ, v.z);
    maxZ = Math.max(maxZ, v.z);
    radius = Math.max(radius, Math.hypot(v.x, v.z));
  }
  return {
    kind: opts.kind ?? "polygon",
    sides: vertices.length,
    radius,
    // Bounding extent, not a shape claim — a plan's "width" is what it spans.
    width: Number.isFinite(minX) ? maxX - minX : 0,
    depth: Number.isFinite(minZ) ? maxZ - minZ : 0,
    vertices,
    edges,
    entryEdgeIndex,
  };
}

/** Axis-aligned rectangle centered at origin (CCW from SW corner). */
export function rectPerimeter(width: number, depth: number): PerimeterFootprint {
  const halfW = width / 2;
  const halfD = depth / 2;
  const vertices: Point2[] = [
    { x: -halfW, z: -halfD }, // SW
    { x: halfW, z: -halfD }, // SE
    { x: halfW, z: halfD }, // NE
    { x: -halfW, z: halfD }, // NW
  ];
  const ids = ["front", "right", "back", "left"] as const;
  const built = buildEdgesFromVertices(vertices, (i) => ids[i]);
  return {
    kind: "rect",
    sides: 4,
    radius: Math.hypot(halfW, halfD),
    width,
    depth,
    vertices: built.vertices,
    edges: built.edges,
    entryEdgeIndex: built.entryEdgeIndex,
  };
}

/**
 * Regular N-gon inscribed in the smaller axis of the parcel rect
 * (same convention as createPolygonSlab / addPolygonWalls).
 */
export function polygonPerimeter(
  sides: number,
  width: number,
  depth: number,
  offsetRad?: number
): PerimeterFootprint {
  const n = Math.max(5, Math.floor(sides));
  const radius = Math.min(width, depth) / 2;
  const vertices = regularPolygonVertices(n, radius, offsetRad);
  const built = buildEdgesFromVertices(vertices, (i) => `e${i}`);
  return {
    kind: "polygon",
    sides: n,
    radius,
    width,
    depth,
    vertices: built.vertices,
    edges: built.edges,
    entryEdgeIndex: built.entryEdgeIndex,
  };
}

/** Build the perimeter for a building config footprint. */
export function footprintPerimeter(
  width: number,
  depth: number,
  footprintSides?: number
): PerimeterFootprint {
  if (typeof footprintSides === "number" && footprintSides >= 5) {
    return polygonPerimeter(footprintSides, width, depth);
  }
  return rectPerimeter(width, depth);
}

/**
 * How far INSIDE the footprint outline the outermost perimeter geometry has to sit.
 *
 * Decentraland hides any mesh whose bounds cross the scene boundary — no tolerance. A
 * footprint that fills the plot ("fill" coverage) puts the outline exactly ON that
 * boundary, so a facade authored CENTERED on its edge ships half its thickness outside and
 * the explorer refuses to draw it: the building renders cut open in-world while every
 * preview looks perfect (measured on the 2026-08-04 swissverse deploy — GLB min x/z =
 * −0.15 m = half a 0.3 m wall). Any footprint may sit flush against the plot edge (the
 * placement validator only checks containment), so the skin has to come in instead.
 *
 * Applied to EVERY perimeter assembly, not just the ones that touch the plot edge: the
 * outline is the building's envelope, and geometry that leaks past it is wrong wherever it
 * stands (it is simply invisible rather than culled). One centimetre is enough — the
 * assemblies behind it are separated from each other by their own offsets.
 */
export const PERIMETER_SKIN_CLEARANCE_M = 0.01;

/**
 * Where to stand a panel that hugs `edge` from the inside.
 *
 * `outwardExtent` is how far the assembly reaches past its own origin toward the outside
 * (half its thickness for a centered panel — measure it, don't assume, since wall modules
 * carry their own depth). `extraInsetM` reserves depth for anything that must sit in FRONT
 * of this panel without going coplanar with it.
 *
 * Panels are rotated by `panelRotationY`, which maps local +X onto the edge direction and
 * therefore local +Z onto the INWARD normal — so insetting is a step along −outward.
 */
export function edgeSeatCenter(
  edge: PerimeterEdge,
  outwardExtent: number,
  extraInsetM = 0
): Point2 {
  const inset = Math.max(0, outwardExtent) + PERIMETER_SKIN_CLEARANCE_M + extraInsetM;
  return {
    x: edge.mid.x - edge.outward.x * inset,
    z: edge.mid.z - edge.outward.z * inset,
  };
}

/** Point-in-polygon (ray cast). Boundary counts as inside. */
export function pointInPolygon(x: number, z: number, vertices: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const zi = vertices[i].z;
    const xj = vertices[j].x;
    const zj = vertices[j].z;
    const onEdge =
      Math.abs((xj - xi) * (z - zi) - (zj - zi) * (x - xi)) < 1e-9 &&
      x >= Math.min(xi, xj) - 1e-9 &&
      x <= Math.max(xi, xj) + 1e-9 &&
      z >= Math.min(zi, zj) - 1e-9 &&
      z <= Math.max(zi, zj) + 1e-9;
    if (onEdge) return true;
    if (zi === zj) continue;
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Inset every vertex toward the centroid by `amount` (meters along the inward normal approx). */
export function insetPolygonVertices(vertices: Point2[], amount: number): Point2[] {
  if (amount <= 0 || vertices.length < 3) return vertices.map((v) => ({ ...v }));
  const n = vertices.length;
  const cx = vertices.reduce((s, v) => s + v.x, 0) / n;
  const cz = vertices.reduce((s, v) => s + v.z, 0) / n;
  return vertices.map((v) => {
    const dx = cx - v.x;
    const dz = cz - v.z;
    const d = Math.hypot(dx, dz) || 1;
    const t = Math.min(1, amount / d);
    return { x: v.x + dx * t, z: v.z + dz * t };
  });
}

/**
 * Inset a convex polygon by a DIFFERENT distance per edge, instead of one uniform amount.
 * Each edge's line is pushed inward along its own outward normal by `offsets[i]`, and the
 * new vertices are the intersections of consecutive offset edge lines. Lets an atrium hole
 * pull back only the wall(s) near an off-center shaft while the rest of the ring keeps the
 * full requested corridor — a uniform blend would otherwise inflate every wall to match the
 * single tightest edge, erasing the corridor on sides that never needed it.
 */
export function offsetPolygonPerEdge(perimeter: PerimeterFootprint, offsets: number[]): Point2[] {
  const n = perimeter.edges.length;
  const lines = perimeter.edges.map((e, i) => {
    const off = offsets[i] ?? 0;
    return {
      px: e.start.x - e.outward.x * off,
      pz: e.start.z - e.outward.z * off,
      dx: e.end.x - e.start.x,
      dz: e.end.z - e.start.z,
    };
  });
  const verts: Point2[] = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i - 1 + n) % n];
    const b = lines[i];
    const denom = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(denom) < 1e-9) {
      verts.push({ x: b.px, z: b.pz });
      continue;
    }
    const t = ((b.px - a.px) * b.dz - (b.pz - a.pz) * b.dx) / denom;
    verts.push({ x: a.px + a.dx * t, z: a.pz + a.dz * t });
  }
  return verts;
}

/**
 * Column placements at polygon vertices (corners) + optional intermediates per edge.
 *
 * `inset` is HALF THE COLUMN, and the ring is offset so a column of that size clears the
 * outline: each edge line moves inward along its OWN normal (not toward the centroid) by
 * the column box's half-extent across that normal, plus the skin clearance.
 *
 * The centroid inset this used to do only equals a perpendicular one when the vertex
 * happens to sit on the centroid's normal — true for the mid-edge of a centred regular
 * n-gon, false for every edge of an L / U / cross plan, whose columns therefore stood
 * partly outside the outline (0.044 m on an L filling its plot: enough for Decentraland to
 * drop the whole column). The extra `|nx| + |nz|` factor is exactly how far a SQUARE
 * axis-aligned column reaches across a rotated normal — 1 on an axis-aligned edge, √2 at
 * 45° — so nothing changes for the rect-ish plans and diagonal facets stop poking out.
 */
export function planPolygonColumnPlacements(
  perimeter: PerimeterFootprint,
  options: {
    cornerColumns?: boolean;
    intermediatesPerEdge?: number;
    /** Inset columns from the exterior edge toward center (m). */
    inset?: number;
  } = {}
): Array<{ id: string; edgeId: string; index: number; role: "corner" | "intermediate"; x: number; z: number }> {
  const cornerColumns = options.cornerColumns !== false;
  const intermediates = Math.max(0, Math.floor(options.intermediatesPerEdge ?? 0));
  const inset = options.inset ?? 0.15;
  const verts = offsetPolygonPerEdge(
    perimeter,
    perimeter.edges.map(
      (e) =>
        inset * (Math.abs(e.outward.x) + Math.abs(e.outward.z)) + PERIMETER_SKIN_CLEARANCE_M
    )
  );
  const out: Array<{
    id: string;
    edgeId: string;
    index: number;
    role: "corner" | "intermediate";
    x: number;
    z: number;
  }> = [];

  if (cornerColumns) {
    for (let i = 0; i < verts.length; i++) {
      out.push({
        id: `col_poly_v${i}`,
        edgeId: perimeter.edges[i]?.id ?? `e${i}`,
        index: i,
        role: "corner",
        x: verts[i].x,
        z: verts[i].z,
      });
    }
  }

  if (intermediates > 0) {
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const edgeId = perimeter.edges[i]?.id ?? `e${i}`;
      for (let k = 1; k <= intermediates; k++) {
        const t = k / (intermediates + 1);
        out.push({
          id: `col_poly_${edgeId}_i${k}`,
          edgeId,
          index: k,
          role: "intermediate",
          x: a.x + (b.x - a.x) * t,
          z: a.z + (b.z - a.z) * t,
        });
      }
    }
  }

  return out;
}
