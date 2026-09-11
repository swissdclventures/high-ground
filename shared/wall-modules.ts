/**
 * Bay-constrained wall modules — AI / library pieces that always fit a structural bay.
 * Slots are derived from column inner faces and clear story height; overrides place a
 * moduleId on one bay (rect) or one polygon edge per floor.
 */

import type { CustomPiece, CustomPiecePart } from "./custom-pieces";
import { customPieceIssue } from "./custom-pieces";
import { findStockWallModule } from "./stock-wall-modules";
import { footprintRectForFloor, type FloorRect } from "./floor-massing";
import {
  isNonRectPlan,
  planShapePerimeter,
  resolvePlanShapeForFloor,
} from "./plan-shape";
import { GRID, resolveStoryHeight, type BuildingConfig, type SceneLayout } from "./types";
import type { WallSideId } from "./wall-sections";

const { cellSize, floorThickness } = GRID;

/** Composer wall placement constants — shared so slot resolver matches mesh build. */
export const WALL_BAY_COLUMN_WIDTH = 0.3;
export const WALL_BAY_COLUMN_FROM_EXTERIOR = 0.15;
export const WALL_BAY_DEPTH = 0.15;
export const WALL_BAY_FACE_EPSILON = 0.004;

/** Wall module piece — same primitive assembly as furniture, separate storage. */
export type WallModule = CustomPiece;

export type WallModuleOverride =
  | { kind: "rect"; side: WallSideId; floor: number; bayIndex: number; moduleId: string }
  | { kind: "polygon"; edge: number; floor: number; moduleId: string };

export interface WallBaySlot {
  kind: "rect" | "polygon";
  side?: WallSideId;
  edge?: number;
  floor: number;
  bayIndex: number;
  width: number;
  height: number;
  centerX: number;
  centerZ: number;
  rotationY: number;
  /** Rect grid indices — for mesh naming / placement. */
  col?: number;
  row?: number;
}

export function clearStoryWallHeightM(config: BuildingConfig): number {
  return resolveStoryHeight(config) - floorThickness;
}

function columnInnerFaceX(colIndex: number, halfW: number, sign: 1 | -1): number {
  const gridX = -halfW + colIndex * cellSize;
  let centerX = gridX;
  if (Math.abs(gridX + halfW) < 1e-4) centerX = gridX + WALL_BAY_COLUMN_FROM_EXTERIOR;
  else if (Math.abs(gridX - halfW) < 1e-4) centerX = gridX - WALL_BAY_COLUMN_FROM_EXTERIOR;
  return centerX + sign * (WALL_BAY_COLUMN_WIDTH / 2);
}

function columnInnerFaceZ(rowIndex: number, halfD: number, sign: 1 | -1): number {
  const gridZ = -halfD + rowIndex * cellSize;
  let centerZ = gridZ;
  if (Math.abs(gridZ + halfD) < 1e-4) centerZ = gridZ + WALL_BAY_COLUMN_FROM_EXTERIOR;
  else if (Math.abs(gridZ - halfD) < 1e-4) centerZ = gridZ - WALL_BAY_COLUMN_FROM_EXTERIOR;
  return centerZ + sign * (WALL_BAY_COLUMN_WIDTH / 2);
}

/** Bay count along a rect side. */
export function wallBayCount(rect: FloorRect, side: WallSideId): number {
  return side === "north" || side === "south" ? rect.wallBaysX : rect.wallBaysZ;
}

/** Map grid col/row on a perimeter side to a stable bay index. */
export function bayIndexForCell(side: WallSideId, col: number, row: number): number {
  return side === "north" || side === "south" ? col : row;
}

/** Inverse of bayIndexForCell for one side. */
export function cellForBayIndex(
  side: WallSideId,
  bayIndex: number,
  rect: FloorRect
): { col: number; row: number } {
  const { wallBaysX, wallBaysZ } = rect;
  switch (side) {
    case "south":
      return { col: bayIndex, row: 0 };
    case "north":
      return { col: bayIndex, row: wallBaysZ - 1 };
    case "west":
      return { col: 0, row: bayIndex };
    case "east":
      return { col: wallBaysX - 1, row: bayIndex };
  }
}

/** Resolve one rectangular bay's world slot on a floor. */
export function resolveRectWallBaySlot(
  config: BuildingConfig,
  layout: SceneLayout,
  floor: number,
  side: WallSideId,
  bayIndex: number
): WallBaySlot | null {
  const rect = footprintRectForFloor(config, layout, floor);
  const count = wallBayCount(rect, side);
  if (bayIndex < 0 || bayIndex >= count) return null;

  const { col, row } = cellForBayIndex(side, bayIndex, rect);
  const wallH = clearStoryWallHeightM(config);
  const halfW = rect.width / 2;
  const halfD = rect.depth / 2;

  let bayW = cellSize;
  let centerX = 0;
  let centerZ = 0;
  let rotationY = 0;

  if (side === "south" || side === "north") {
    const x0 = columnInnerFaceX(col, halfW, +1);
    const x1 = columnInnerFaceX(col + 1, halfW, -1);
    bayW = x1 - x0;
    centerX = (x0 + x1) / 2;
    centerZ =
      side === "south"
        ? -halfD + WALL_BAY_COLUMN_FROM_EXTERIOR + WALL_BAY_COLUMN_WIDTH / 2 + WALL_BAY_DEPTH / 2 + WALL_BAY_FACE_EPSILON
        : halfD - WALL_BAY_COLUMN_FROM_EXTERIOR - WALL_BAY_COLUMN_WIDTH / 2 - WALL_BAY_DEPTH / 2 - WALL_BAY_FACE_EPSILON;
    rotationY = side === "north" ? Math.PI : 0;
  } else {
    const z0 = columnInnerFaceZ(row, halfD, +1);
    const z1 = columnInnerFaceZ(row + 1, halfD, -1);
    bayW = z1 - z0;
    centerZ = (z0 + z1) / 2;
    centerX =
      side === "west"
        ? -halfW + WALL_BAY_COLUMN_FROM_EXTERIOR + WALL_BAY_COLUMN_WIDTH / 2 + WALL_BAY_DEPTH / 2 + WALL_BAY_FACE_EPSILON
        : halfW - WALL_BAY_COLUMN_FROM_EXTERIOR - WALL_BAY_COLUMN_WIDTH / 2 - WALL_BAY_DEPTH / 2 - WALL_BAY_FACE_EPSILON;
    rotationY = side === "west" ? Math.PI / 2 : -Math.PI / 2;
  }

  // Anchored massing: the floor rect may sit off-center within the building.
  centerX += rect.offsetX ?? 0;
  centerZ += rect.offsetZ ?? 0;

  return {
    kind: "rect",
    side,
    floor,
    bayIndex,
    width: bayW,
    height: wallH,
    centerX,
    centerZ,
    rotationY,
    col,
    row,
  };
}

/** Polygon buildings: one module slot per edge (bayIndex always 0). */
export function resolvePolygonWallBaySlot(
  config: BuildingConfig,
  layout: SceneLayout,
  floor: number,
  edge: number
): WallBaySlot | null {
  if (!isNonRectPlan(config)) return null;
  const rect = footprintRectForFloor(config, layout, floor);
  // Read the PLAN, not a regular n-gon rebuilt from footprintSides — otherwise a facade
  // dropped on an L-plan would be positioned against a hexagon that isn't there.
  const perimeter = planShapePerimeter(
    resolvePlanShapeForFloor(config, floor),
    rect.width,
    rect.depth
  );
  const e = perimeter.edges[edge];
  if (!e) return null;
  const wallH = clearStoryWallHeightM(config);
  return {
    kind: "polygon",
    edge,
    floor,
    bayIndex: 0,
    width: e.length,
    height: wallH,
    centerX: e.mid.x,
    centerZ: e.mid.z,
    rotationY: e.panelRotationY,
  };
}

export function resolveWallBaySlot(
  config: BuildingConfig,
  layout: SceneLayout,
  floor: number,
  pick:
    | { kind: "rect"; side: WallSideId; bayIndex: number }
    | { kind: "polygon"; edge: number }
): WallBaySlot | null {
  return pick.kind === "rect"
    ? resolveRectWallBaySlot(config, layout, floor, pick.side, pick.bayIndex)
    : resolvePolygonWallBaySlot(config, layout, floor, pick.edge);
}

export function findWallModuleOverride(
  overrides: WallModuleOverride[] | undefined,
  pick:
    | { kind: "rect"; side: WallSideId; floor: number; bayIndex: number }
    | { kind: "polygon"; edge: number; floor: number }
): WallModuleOverride | undefined {
  return (overrides ?? []).find((o) => {
    if (pick.kind === "rect" && o.kind === "rect") {
      return o.side === pick.side && o.floor === pick.floor && o.bayIndex === pick.bayIndex;
    }
    if (pick.kind === "polygon" && o.kind === "polygon") {
      return o.edge === pick.edge && o.floor === pick.floor;
    }
    return false;
  });
}

/**
 * Per-bay sentinel meaning "plain wall here" — the escape hatch that lets one bay opt
 * OUT of a building-wide facade. Clearing an override means "inherit", so without this
 * a building with `facadeStyle` set would have no way to leave a single bay bare.
 */
export const NO_WALL_MODULE = "none";

export function resolveWallModuleId(
  config: BuildingConfig,
  pick:
    | { kind: "rect"; side: WallSideId; floor: number; bayIndex: number }
    | { kind: "polygon"; edge: number; floor: number }
): string | null {
  // Precedence: explicit per-bay override → ground-floor facade → building facade → plain.
  const explicit = findWallModuleOverride(config.wallModuleOverrides, pick)?.moduleId;
  if (explicit) return explicit === NO_WALL_MODULE ? null : explicit;
  const style = pick.floor === 0 ? (config.facadeGroundStyle ?? config.facadeStyle) : config.facadeStyle;
  return style && style !== NO_WALL_MODULE ? style : null;
}

/**
 * The editor renders every wall-module part as its own mesh, so a building-wide facade
 * costs perimeterBays × floors × parts meshes. On a 44-parcel, 20-story tower the
 * 10-part Industrial Sash Bay is ~140,000 meshes — the browser locks up composing it
 * ("it almost crashes the whole browser", owner 2026-07-28). Cap the estimate and let
 * the rebuild path refuse/strip facades that exceed it.
 */
export const FACADE_PARTS_CAP = 20_000;

/** Number of facade module instances the composer actually creates on one floor. */
export function facadeSlotsOnFloor(
  config: BuildingConfig,
  layout: SceneLayout,
  floor: number
): number {
  const rect = footprintRectForFloor(config, layout, floor);
  if (isNonRectPlan(config)) {
    return planShapePerimeter(
      resolvePlanShapeForFloor(config, floor),
      rect.width,
      rect.depth
    ).edges.length;
  }
  return Math.max(1, 2 * (rect.wallBaysX + rect.wallBaysZ));
}

/**
 * Exact editor mesh estimate for the building-wide facade fields.
 *
 * Non-rect plans have ONE module per plan edge, not one module every four metres around
 * their rectangular extent. The old rectangle approximation exaggerated a 16-sided
 * 45-parcel round tower by roughly 45x and disabled perfectly safe facades. Count the
 * same slots the composer loops, floor by floor, and account for a distinct ground style.
 */
export function estimateFacadeParts(
  config: BuildingConfig,
  layout: SceneLayout,
  modulePartCount: (moduleId: string) => number | undefined
): number {
  if (!config.facadeStyle && !config.facadeGroundStyle) return 0;
  const floors = Math.max(1, config.floors ?? 1);
  let parts = 0;
  for (let floor = 0; floor < floors; floor++) {
    const styleId =
      floor === 0 ? (config.facadeGroundStyle ?? config.facadeStyle) : config.facadeStyle;
    if (!styleId || styleId === NO_WALL_MODULE) continue;
    parts += facadeSlotsOnFloor(config, layout, floor) * Math.max(1, modulePartCount(styleId) ?? 8);
  }
  return parts;
}

export function setWallModuleOverride(
  overrides: WallModuleOverride[] | undefined,
  pick:
    | { kind: "rect"; side: WallSideId; floor: number; bayIndex: number; moduleId: string }
    | { kind: "polygon"; edge: number; floor: number; moduleId: string }
): WallModuleOverride[] {
  const rest = (overrides ?? []).filter((o) => {
    if (pick.kind === "rect" && o.kind === "rect") {
      return !(o.side === pick.side && o.floor === pick.floor && o.bayIndex === pick.bayIndex);
    }
    if (pick.kind === "polygon" && o.kind === "polygon") {
      return !(o.edge === pick.edge && o.floor === pick.floor);
    }
    return true;
  });
  if (pick.kind === "rect") {
    return [...rest, { kind: "rect", side: pick.side, floor: pick.floor, bayIndex: pick.bayIndex, moduleId: pick.moduleId }];
  }
  return [...rest, { kind: "polygon", edge: pick.edge, floor: pick.floor, moduleId: pick.moduleId }];
}

export function clearWallModuleOverride(
  overrides: WallModuleOverride[] | undefined,
  pick:
    | { kind: "rect"; side: WallSideId; floor: number; bayIndex: number }
    | { kind: "polygon"; edge: number; floor: number }
): WallModuleOverride[] {
  return (overrides ?? []).filter((o) => {
    if (pick.kind === "rect" && o.kind === "rect") {
      return !(o.side === pick.side && o.floor === pick.floor && o.bayIndex === pick.bayIndex);
    }
    if (pick.kind === "polygon" && o.kind === "polygon") {
      return !(o.edge === pick.edge && o.floor === pick.floor);
    }
    return true;
  });
}

export function findWallModule(
  config: BuildingConfig,
  moduleId: string
): WallModule | undefined {
  // Config modules win (a user can shadow a stock id); stock modules are the
  // kit-shipped fallback so every building has facade variety out of the box.
  return (
    (config.wallModules ?? []).find((m) => m.id === moduleId) ??
    findStockWallModule(moduleId)
  );
}

/** Axis-aligned bounds of a piece in its local space (floor = y 0). */
export function wallModulePartBounds(parts: CustomPiecePart[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  width: number;
  height: number;
  depth: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const p of parts) {
    let hw = p.w / 2;
    let hh = p.h / 2;
    let hd = p.d / 2;
    if (p.shape === "cylinder") {
      const r = p.w / 2;
      if (p.axis === "x") {
        hw = p.h / 2;
        hh = r;
        hd = r;
      } else if (p.axis === "z") {
        hw = r;
        hh = r;
        hd = p.h / 2;
      } else {
        hw = r;
        hh = p.h / 2;
        hd = r;
      }
    } else if (p.shape === "sphere") {
      const r = p.w / 2;
      hw = hh = hd = r;
    } else if (p.shape === "plane") {
      hd = 0.02;
    }
    minX = Math.min(minX, p.x - hw);
    maxX = Math.max(maxX, p.x + hw);
    minY = Math.min(minY, p.y - hh);
    maxY = Math.max(maxY, p.y + hh);
    minZ = Math.min(minZ, p.z - hd);
    maxZ = Math.max(maxZ, p.z + hd);
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, width: 0, height: 0, depth: 0 };
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    width: maxX - minX,
    height: maxY - minY,
    depth: maxZ - minZ,
  };
}

/**
 * Horizontal tiling for wide slots (polygon edges span many metres): repeat the
 * authored bay instead of stretching one copy across the whole wall, so relief
 * detail keeps its authored proportions.
 */
export function wallModuleTileLayout(
  piece: Pick<WallModule, "parts">,
  slot: Pick<WallBaySlot, "width">
): { tiles: number; tileWidth: number } {
  const b = wallModulePartBounds(piece.parts);
  if (b.width <= 1e-6) return { tiles: 1, tileWidth: slot.width };
  const tiles = Math.max(1, Math.round(slot.width / b.width));
  return { tiles, tileWidth: slot.width / tiles };
}

/** Non-uniform scale factors to fit a piece into a wall bay slot. */
export function wallModuleFitScale(
  piece: Pick<WallModule, "parts">,
  slot: Pick<WallBaySlot, "width" | "height">
): { scaleX: number; scaleY: number; offsetY: number } {
  const b = wallModulePartBounds(piece.parts);
  const scaleX = b.width > 1e-6 ? slot.width / b.width : 1;
  const scaleY = b.height > 1e-6 ? slot.height / b.height : 1;
  const offsetY = -b.minY * scaleY;
  return { scaleX, scaleY, offsetY };
}

/** Validate piece + slot fit. Null = OK. */
export function wallModuleFitIssue(
  piece: WallModule,
  slot: Pick<WallBaySlot, "width" | "height">
): string | null {
  const base = customPieceIssue(piece);
  if (base) return base;
  const b = wallModulePartBounds(piece.parts);
  if (b.width <= 0 || b.height <= 0) return "Wall module has no measurable size";
  if (b.minY < -0.05) return "Wall module parts must sit on or above the bay floor (y ≥ 0)";
  // Width is judged per tile — wide slots repeat the module rather than stretch it.
  const sx = wallModuleTileLayout(piece, slot).tileWidth / b.width;
  const sy = slot.height / b.height;
  if (sx < 0.25 || sy < 0.25) return `Module is too large for this bay (${b.width.toFixed(1)}×${b.height.toFixed(1)} m vs ${slot.width.toFixed(1)}×${slot.height.toFixed(1)} m slot)`;
  if (sx > 4 || sy > 4) return "Module is too small or sparse for this bay — add more structure";
  return null;
}

export function wallModuleIdFromName(name: string, taken: Set<string>): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "wall";
  let id = `wallmod_${slug}`;
  let n = 2;
  while (taken.has(id)) id = `wallmod_${slug}_${n++}`;
  return id;
}
