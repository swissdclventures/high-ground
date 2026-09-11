/** Parcel perimeter edge names (building-local: front = south / entry side). */
export type ParcelSide = "front" | "back" | "left" | "right";

export type ColumnCorner = "front_left" | "front_right" | "back_left" | "back_right";

export type ColumnHeightMode = "per_floor" | "full_building";

/** Cross-section shape — hexagonal keeps triangle count low (6 sides + caps). */
export type ColumnProfile = "rectangular" | "hexagonal";

export type ColumnRole = "corner" | "intermediate";

export interface IntermediateColumnsPerSide {
  front: number;
  back: number;
  left: number;
  right: number;
}

export interface ColumnLayoutSpec {
  cornerColumns: boolean;
  intermediateColumnsPerSide: IntermediateColumnsPerSide;
  columnProfile: ColumnProfile;
  columnWidth: number;
  columnDepth: number;
  columnHeightMode: ColumnHeightMode;
  dedupeCornerColumns: boolean;
  debug?: boolean;
}

/**
 * Per-floor column override. Only the "look/layout" fields a builder edits per floor
 * live here (corner toggle, per-side intermediate counts, profile); structural fields
 * (width/depth/height mode) stay building-wide. Mirrors WallSectionOverride in
 * wall-sections.ts — an explicit override wins over the building-wide default.
 */
export interface ColumnFloorOverride {
  floor: number;
  cornerColumns?: boolean;
  intermediateColumnsPerSide?: Partial<IntermediateColumnsPerSide>;
  columnProfile?: ColumnProfile;
}

/** The editable per-floor payload (everything but the floor index). */
export type ColumnFloorOverridePatch = Omit<ColumnFloorOverride, "floor">;

export function getColumnFloorOverride(
  overrides: ColumnFloorOverride[] | undefined,
  floor: number
): ColumnFloorOverride | undefined {
  return (overrides ?? []).find((o) => o.floor === floor);
}

export function hasColumnFloorOverride(
  overrides: ColumnFloorOverride[] | undefined,
  floor: number
): boolean {
  return getColumnFloorOverride(overrides, floor) !== undefined;
}

/** Immutably upsert one floor's column override. */
export function setColumnFloorOverride(
  overrides: ColumnFloorOverride[] | undefined,
  floor: number,
  patch: ColumnFloorOverridePatch
): ColumnFloorOverride[] {
  const rest = (overrides ?? []).filter((o) => o.floor !== floor);
  return [...rest, { floor, ...patch }];
}

/** Remove a floor's override, reverting it to the building-wide default. */
export function clearColumnFloorOverride(
  overrides: ColumnFloorOverride[] | undefined,
  floor: number
): ColumnFloorOverride[] {
  return (overrides ?? []).filter((o) => o.floor !== floor);
}

export interface ColumnPlacement {
  id: string;
  side: ParcelSide | "corner" | "polygon";
  index: number;
  role: ColumnRole;
  corner?: ColumnCorner;
  /** Polygon edge id when side === "polygon". */
  edgeId?: string;
  x: number;
  z: number;
}

export interface ParcelEdges {
  front: { start: { x: number; z: number }; end: { x: number; z: number } };
  back: { start: { x: number; z: number }; end: { x: number; z: number } };
  left: { start: { x: number; z: number }; end: { x: number; z: number } };
  right: { start: { x: number; z: number }; end: { x: number; z: number } };
}

export interface ColumnLayoutValidationResult {
  ok: boolean;
  errors: string[];
}

export const DEFAULT_COLUMN_WIDTH = 0.3;
export const DEFAULT_COLUMN_DEPTH = 0.3;

const DEDUPE_TOL = 0.04;

export function defaultColumnLayoutSpec(): ColumnLayoutSpec {
  return {
    cornerColumns: true,
    intermediateColumnsPerSide: { front: 0, back: 0, left: 0, right: 0 },
    columnProfile: "rectangular",
    columnWidth: DEFAULT_COLUMN_WIDTH,
    columnDepth: DEFAULT_COLUMN_DEPTH,
    columnHeightMode: "per_floor",
    dedupeCornerColumns: true,
    debug: false,
  };
}

/** Plan footprint used for perimeter inset (hex uses flat-to-flat width on both axes). */
export function columnFootprintSize(spec: Pick<ColumnLayoutSpec, "columnProfile" | "columnWidth" | "columnDepth">): {
  width: number;
  depth: number;
} {
  if (spec.columnProfile === "hexagonal") {
    return { width: spec.columnWidth, depth: spec.columnWidth };
  }
  return { width: spec.columnWidth, depth: spec.columnDepth };
}

function inset(halfExtent: number, columnSize: number): number {
  return halfExtent - columnSize / 2;
}

/** Named perimeter edges for a rectangular parcel footprint (centered at origin). */
export function parcelPerimeterEdges(
  width: number,
  depth: number,
  columnWidth = DEFAULT_COLUMN_WIDTH,
  columnDepth = DEFAULT_COLUMN_DEPTH
): ParcelEdges {
  const halfW = width / 2;
  const halfD = depth / 2;
  const ix = inset(halfW, columnWidth);
  const iz = inset(halfD, columnDepth);

  const fl = { x: -ix, z: -iz };
  const fr = { x: ix, z: -iz };
  const bl = { x: -ix, z: iz };
  const br = { x: ix, z: iz };

  return {
    front: { start: fl, end: fr },
    back: { start: bl, end: br },
    left: { start: fl, end: bl },
    right: { start: fr, end: br },
  };
}

function lerp2(
  a: { x: number; z: number },
  b: { x: number; z: number },
  t: number
): { x: number; z: number } {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

function posKey(x: number, z: number): string {
  return `${x.toFixed(3)},${z.toFixed(3)}`;
}

function addPlacement(
  list: ColumnPlacement[],
  registry: Map<string, ColumnPlacement>,
  placement: ColumnPlacement,
  dedupe: boolean
): void {
  const key = posKey(placement.x, placement.z);
  if (dedupe && registry.has(key)) return;
  if (dedupe) {
    for (const p of registry.values()) {
      if (Math.hypot(p.x - placement.x, p.z - placement.z) < DEDUPE_TOL) return;
    }
  }
  registry.set(key, placement);
  list.push(placement);
}

function intermediateAlong(
  side: ParcelSide,
  count: number,
  edges: ParcelEdges,
  spec: ColumnLayoutSpec,
  list: ColumnPlacement[],
  registry: Map<string, ColumnPlacement>
): void {
  if (count < 1) return;
  const edge = edges[side];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const p = lerp2(edge.start, edge.end, t);
    addPlacement(
      list,
      registry,
      {
        id: `col_${side}_i${i}`,
        side,
        index: i,
        role: "intermediate",
        x: p.x,
        z: p.z,
      },
      spec.dedupeCornerColumns
    );
  }
}

/** Parametric structural column positions for one parcel footprint. */
export function planColumnLayout(
  width: number,
  depth: number,
  spec: ColumnLayoutSpec
): ColumnPlacement[] {
  const footprint = columnFootprintSize(spec);
  const edges = parcelPerimeterEdges(width, depth, footprint.width, footprint.depth);
  const list: ColumnPlacement[] = [];
  const registry = new Map<string, ColumnPlacement>();

  if (spec.cornerColumns) {
    const corners: { corner: ColumnCorner; x: number; z: number }[] = [
      { corner: "front_left", x: edges.front.start.x, z: edges.front.start.z },
      { corner: "front_right", x: edges.front.end.x, z: edges.front.end.z },
      { corner: "back_left", x: edges.back.start.x, z: edges.back.start.z },
      { corner: "back_right", x: edges.back.end.x, z: edges.back.end.z },
    ];
    corners.forEach((c, i) => {
      addPlacement(
        list,
        registry,
        {
          id: `col_corner_${c.corner}`,
          side: "corner",
          index: i,
          role: "corner",
          corner: c.corner,
          x: c.x,
          z: c.z,
        },
        spec.dedupeCornerColumns
      );
    });
  }

  const sides: ParcelSide[] = ["front", "back", "left", "right"];
  for (const side of sides) {
    intermediateAlong(
      side,
      Math.max(0, Math.floor(spec.intermediateColumnsPerSide[side])),
      edges,
      spec,
      list,
      registry
    );
  }

  return list;
}

export function maxIntermediateColumnsPerSide(width: number, depth: number): number {
  const minSpan = Math.min(width, depth);
  return Math.max(0, Math.floor(minSpan / 1.0) - 1);
}

export function clampColumnLayoutSpec(
  spec: ColumnLayoutSpec,
  width: number,
  depth: number
): ColumnLayoutSpec {
  const max = maxIntermediateColumnsPerSide(width, depth);
  const clamp = (n: number) => Math.min(max, Math.max(0, Math.floor(n)));
  return {
    ...spec,
    intermediateColumnsPerSide: {
      front: clamp(spec.intermediateColumnsPerSide.front),
      back: clamp(spec.intermediateColumnsPerSide.back),
      left: clamp(spec.intermediateColumnsPerSide.left),
      right: clamp(spec.intermediateColumnsPerSide.right),
    },
  };
}

export function validateColumnLayout(
  spec: ColumnLayoutSpec,
  placements: ColumnPlacement[],
  width: number,
  depth: number
): ColumnLayoutValidationResult {
  const errors: string[] = [];
  const polygonPlacements = placements.filter((p) => p.side === "polygon" || p.id.startsWith("col_poly_"));
  const isPolygon = polygonPlacements.length === placements.length && placements.length > 0;

  if (isPolygon) {
    const expectedCorners = spec.cornerColumns ? undefined : 0;
    if (expectedCorners === 0) {
      const corners = placements.filter((p) => p.role === "corner");
      if (corners.length !== 0) errors.push(`expected 0 corner columns, got ${corners.length}`);
    }
  } else {
    const expectedCorners = spec.cornerColumns ? 4 : 0;
    const corners = placements.filter((p) => p.role === "corner");
    if (corners.length !== expectedCorners) {
      errors.push(`expected ${expectedCorners} corner columns, got ${corners.length}`);
    }

    const sides: ParcelSide[] = ["front", "back", "left", "right"];
    for (const side of sides) {
      const want = Math.max(0, Math.floor(spec.intermediateColumnsPerSide[side]));
      const got = placements.filter((p) => p.role === "intermediate" && p.side === side).length;
      if (got !== want) {
        errors.push(`${side}: expected ${want} intermediate columns, got ${got}`);
      }
    }
  }

  const keys = new Set<string>();
  for (const p of placements) {
    const k = posKey(p.x, p.z);
    if (keys.has(k)) errors.push(`duplicate column position ${p.id}`);
    keys.add(k);
  }

  const halfW = width / 2;
  const halfD = depth / 2;
  for (const p of placements) {
    if (Math.abs(p.x) > halfW + 0.01 || Math.abs(p.z) > halfD + 0.01) {
      errors.push(`${p.id}: column outside parcel bounds`);
    }
  }

  return { ok: errors.length === 0, errors };
}
