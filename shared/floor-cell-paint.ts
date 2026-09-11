/**
 * Per-cell floor paint — a 2 m paint grid over each floor's slab. Each painted cell carries a
 * surface pattern (tile | concrete | wood | flat) and an optional color tint, so one floor can
 * mix finishes (e.g. a black dance floor inset into light tiles). This is the first refinement
 * level of the nested lattice: plot → floors → 4 m cells → 2 m paint cells.
 *
 * Pure data + grid math only (renderer lives in app/src/modules/floor-paint.ts). Paint rides in
 * BuildingConfig (attribute override on existing geometry — closed enum + fixed grid, no
 * positional freedom), following the floorSurfaces/wallSections pattern.
 */

import { buildingFootprintM, type BuildingConfig, type SceneLayout } from "./types";
import type { FloorSurfaceKind } from "./floor-sections";

export const PAINT_CELL_M = 2;
export const DEFAULT_PAINT_COLOR = "#ffffff";

export interface FloorCellPaint {
  floor: number;
  col: number;
  row: number;
  kind: FloorSurfaceKind;
  /** Hex tint multiplied over the pattern texture; omitted = pattern as-is (white). */
  color?: string;
}

export interface PaintGridDims {
  cols: number;
  rows: number;
  halfW: number;
  halfD: number;
}

export interface PaintCellRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** One row-run of horizontally adjacent same-paint cells, merged for rendering. */
export interface PaintRun {
  row: number;
  colStart: number;
  colEnd: number;
  kind: FloorSurfaceKind;
  color?: string;
}

export function paintGridDims(config: BuildingConfig, layout: SceneLayout): PaintGridDims {
  const { width, depth } = buildingFootprintM(config, layout);
  return {
    cols: Math.max(1, Math.round(width / PAINT_CELL_M)),
    rows: Math.max(1, Math.round(depth / PAINT_CELL_M)),
    halfW: width / 2,
    halfD: depth / 2,
  };
}

/** Building-local (x, z) → paint cell, or null when outside the footprint grid. */
export function pointToPaintCell(
  dims: PaintGridDims,
  x: number,
  z: number
): { col: number; row: number } | null {
  const col = Math.floor((x + dims.halfW) / PAINT_CELL_M);
  const row = Math.floor((z + dims.halfD) / PAINT_CELL_M);
  if (col < 0 || col >= dims.cols || row < 0 || row >= dims.rows) return null;
  return { col, row };
}

/** Building-local rect covered by one paint cell. */
export function paintCellRect(dims: PaintGridDims, col: number, row: number): PaintCellRect {
  const minX = -dims.halfW + col * PAINT_CELL_M;
  const minZ = -dims.halfD + row * PAINT_CELL_M;
  return { minX, maxX: minX + PAINT_CELL_M, minZ, maxZ: minZ + PAINT_CELL_M };
}

export function cellIntersectsHole(
  rect: PaintCellRect,
  hole: { minX: number; maxX: number; minZ: number; maxZ: number }
): boolean {
  return (
    rect.minX < hole.maxX && rect.maxX > hole.minX && rect.minZ < hole.maxZ && rect.maxZ > hole.minZ
  );
}

/** Material identity — one distinct (kind, color) pair = one material in the DCL budget. */
export function paintKey(kind: FloorSurfaceKind, color?: string): string {
  return `${kind}|${(color ?? DEFAULT_PAINT_COLOR).toLowerCase()}`;
}

export function paintEntriesForFloor(
  list: FloorCellPaint[] | undefined,
  floor: number
): FloorCellPaint[] {
  return (list ?? []).filter((e) => e.floor === floor);
}

export function getFloorCellPaint(
  list: FloorCellPaint[] | undefined,
  floor: number,
  col: number,
  row: number
): FloorCellPaint | undefined {
  return (list ?? []).find((e) => e.floor === floor && e.col === col && e.row === row);
}

/** Immutably upsert one cell's paint. */
export function setFloorCellPaint(
  list: FloorCellPaint[] | undefined,
  floor: number,
  col: number,
  row: number,
  kind: FloorSurfaceKind,
  color?: string
): FloorCellPaint[] {
  const rest = (list ?? []).filter((e) => !(e.floor === floor && e.col === col && e.row === row));
  return [...rest, { floor, col, row, kind, ...(color ? { color } : {}) }];
}

/** Immutably erase one cell's paint. */
export function clearFloorCellPaint(
  list: FloorCellPaint[] | undefined,
  floor: number,
  col: number,
  row: number
): FloorCellPaint[] {
  return (list ?? []).filter((e) => !(e.floor === floor && e.col === col && e.row === row));
}

/** Immutably erase all paint on one floor (other floors untouched). */
export function clearFloorPaint(
  list: FloorCellPaint[] | undefined,
  floor: number
): FloorCellPaint[] {
  return (list ?? []).filter((e) => e.floor !== floor);
}

/**
 * Merge horizontally adjacent same-paint cells into row-runs so a solid stripe renders as one
 * quad instead of N. Duplicate cells (same floor/col/row) are tolerated — last one wins via the
 * map — though setFloorCellPaint's upsert prevents them in normal use.
 */
export function mergePaintRuns(entries: FloorCellPaint[]): PaintRun[] {
  const byRow = new Map<number, Map<number, FloorCellPaint>>();
  for (const e of entries) {
    if (!byRow.has(e.row)) byRow.set(e.row, new Map());
    byRow.get(e.row)!.set(e.col, e);
  }

  const runs: PaintRun[] = [];
  for (const [row, cells] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    const cols = [...cells.keys()].sort((a, b) => a - b);
    let run: PaintRun | null = null;
    for (const col of cols) {
      const cell = cells.get(col)!;
      if (
        run &&
        col === run.colEnd + 1 &&
        paintKey(cell.kind, cell.color) === paintKey(run.kind, run.color)
      ) {
        run.colEnd = col;
        continue;
      }
      if (run) runs.push(run);
      run = { row, colStart: col, colEnd: col, kind: cell.kind, color: cell.color };
    }
    if (run) runs.push(run);
  }
  return runs;
}
