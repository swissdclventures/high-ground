/** Pure Border V2 sector and counter-sector geometry. */

import {
  BORDER_SIDES,
  DEFAULT_BORDER_LANDING_INSET_M,
  DEFAULT_BORDER_STRIP_WIDTH_M,
  OPPOSITE_BORDER,
  type BorderBox,
  type BorderSide,
} from "./border-contract";
import { normalizeDclWorldName } from "./universe-overlay-contract";

export const BORDER_ROUTE_VERSION = 2 as const;
export const BORDER_SECTOR_SIZE_M = 16;

export interface BorderGatewayPlot {
  worldName: string;
  sceneBase: string;
  widthM: number;
  depthM: number;
  /** Clear sector indexes by side. Omit a side to treat all its sectors as clear. */
  clearSectors?: Partial<Record<BorderSide, number[]>>;
}

export interface BorderRouteEndpoint {
  worldName: string;
  sceneBase: string;
  side: BorderSide;
  sectorIndex: number;
  sectorCount: number;
  alongT: number;
  strip: BorderBox;
  landing: { x: number; y: number; z: number };
}

export interface BorderRoutePair {
  version: typeof BORDER_ROUTE_VERSION;
  routeId: string;
  connectionId: string;
  a: BorderRouteEndpoint;
  b: BorderRouteEndpoint;
}

export interface BorderRuntimeRoute {
  routeId: string;
  connectionId: string;
  federationName?: string;
  confirmedAt?: string | null;
  source: BorderRouteEndpoint;
  destination: BorderRouteEndpoint;
}

export interface BorderRuntimeDocument {
  version: typeof BORDER_ROUTE_VERSION;
  worldName: string;
  routes: BorderRuntimeRoute[];
  generatedAt: string;
}

export interface ParcelOutline {
  points: Array<{ x: number; y: number }>;
}

export interface BorderObstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Conservative gateway reservation. A whole edge parcel is unavailable when a
 * building silhouette reaches it; this leaves an unambiguous 16 m counter-sector.
 */
export function clearBorderSectorsFromOutlines(
  cols: number,
  rows: number,
  outlines: readonly ParcelOutline[],
  obstacles: readonly BorderObstacle[] = []
): Record<BorderSide, number[]> {
  if (!Number.isInteger(cols) || cols < 1 || !Number.isInteger(rows) || rows < 1) {
    throw new Error("Gateway plot dimensions must be positive parcel counts.");
  }
  const blocked: Record<BorderSide, Set<number>> = {
    north: new Set(), east: new Set(), south: new Set(), west: new Set(),
  };
  for (const outline of outlines) {
    if (!outline.points.length) continue;
    const minX = Math.min(...outline.points.map((point) => point.x));
    const maxX = Math.max(...outline.points.map((point) => point.x));
    const minY = Math.min(...outline.points.map((point) => point.y));
    const maxY = Math.max(...outline.points.map((point) => point.y));
    const x0 = Math.max(0, Math.floor(minX));
    const x1 = Math.min(cols - 1, Math.ceil(maxX) - 1);
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(rows - 1, Math.ceil(maxY) - 1);
    if (minY < 1) for (let x = x0; x <= x1; x += 1) blocked.south.add(x);
    if (maxY > rows - 1) for (let x = x0; x <= x1; x += 1) blocked.north.add(x);
    if (minX < 1) for (let y = y0; y <= y1; y += 1) blocked.west.add(y);
    if (maxX > cols - 1) for (let y = y0; y <= y1; y += 1) blocked.east.add(y);
  }
  const widthM = cols * BORDER_SECTOR_SIZE_M;
  const depthM = rows * BORDER_SECTOR_SIZE_M;
  for (const obstacle of obstacles) {
    if (
      ![obstacle.minX, obstacle.maxX, obstacle.minZ, obstacle.maxZ].every(Number.isFinite) ||
      obstacle.maxX <= obstacle.minX || obstacle.maxZ <= obstacle.minZ
    ) continue;
    const x0 = Math.max(0, Math.floor(obstacle.minX / BORDER_SECTOR_SIZE_M));
    const x1 = Math.min(cols - 1, Math.ceil(obstacle.maxX / BORDER_SECTOR_SIZE_M) - 1);
    const z0 = Math.max(0, Math.floor(obstacle.minZ / BORDER_SECTOR_SIZE_M));
    const z1 = Math.min(rows - 1, Math.ceil(obstacle.maxZ / BORDER_SECTOR_SIZE_M) - 1);
    if (obstacle.minZ < BORDER_SECTOR_SIZE_M) {
      for (let x = x0; x <= x1; x += 1) blocked.south.add(x);
    }
    if (obstacle.maxZ > depthM - BORDER_SECTOR_SIZE_M) {
      for (let x = x0; x <= x1; x += 1) blocked.north.add(x);
    }
    if (obstacle.minX < BORDER_SECTOR_SIZE_M) {
      for (let z = z0; z <= z1; z += 1) blocked.west.add(z);
    }
    if (obstacle.maxX > widthM - BORDER_SECTOR_SIZE_M) {
      for (let z = z0; z <= z1; z += 1) blocked.east.add(z);
    }
  }
  const clear = (count: number, side: BorderSide) =>
    Array.from({ length: count }, (_, index) => index).filter((index) => !blocked[side].has(index));
  return {
    north: clear(cols, "north"),
    east: clear(rows, "east"),
    south: clear(cols, "south"),
    west: clear(rows, "west"),
  };
}

export function hasClearBorderOuterParcel(
  cols: number,
  rows: number,
  outlines: readonly ParcelOutline[],
  obstacles: readonly BorderObstacle[] = []
): boolean {
  const clear = clearBorderSectorsFromOutlines(cols, rows, outlines, obstacles);
  return BORDER_SIDES.some((side) => clear[side].length > 0);
}

/** Null when Border can place a gateway. Otherwise the exact recovery sentence. */
export function borderClearParcelMessage(
  cols: number,
  rows: number,
  outlines: readonly ParcelOutline[],
  obstacles: readonly BorderObstacle[] = []
): string | null {
  if (hasClearBorderOuterParcel(cols, rows, outlines, obstacles)) return null;
  return (
    "Border needs at least one clear outer parcel. Every edge currently has a building on it. " +
    "Move a building inward from an outer edge, then publish."
  );
}

export function borderSideLength(plot: Pick<BorderGatewayPlot, "widthM" | "depthM">, side: BorderSide): number {
  return side === "north" || side === "south" ? plot.widthM : plot.depthM;
}

export function borderSectorCount(
  plot: Pick<BorderGatewayPlot, "widthM" | "depthM">,
  side: BorderSide,
  sectorSizeM = BORDER_SECTOR_SIZE_M
): number {
  if (!(plot.widthM > 0) || !(plot.depthM > 0) || !(sectorSizeM > 0)) return 0;
  return Math.floor(borderSideLength(plot, side) / sectorSizeM);
}

function validateSectorIndex(index: number, count: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new Error(`Border sector ${index} is outside 0..${Math.max(0, count - 1)}.`);
  }
}

/** Sector order is canonical DCL-axis order: W→E for N/S, S→N for E/W. */
export function borderSectorBox(
  side: BorderSide,
  sectorIndex: number,
  plot: Pick<BorderGatewayPlot, "widthM" | "depthM">,
  stripWidthM = DEFAULT_BORDER_STRIP_WIDTH_M,
  sectorSizeM = BORDER_SECTOR_SIZE_M
): BorderBox {
  const count = borderSectorCount(plot, side, sectorSizeM);
  validateSectorIndex(sectorIndex, count);
  const along = sectorIndex * sectorSizeM + sectorSizeM / 2;
  const strip = Math.max(1.5, Math.min(8, stripWidthM));
  if (side === "north") return { x: along, y: 0.16, z: plot.depthM - strip / 2, sx: sectorSizeM, sy: 0.32, sz: strip };
  if (side === "south") return { x: along, y: 0.16, z: strip / 2, sx: sectorSizeM, sy: 0.32, sz: strip };
  if (side === "east") return { x: plot.widthM - strip / 2, y: 0.16, z: along, sx: strip, sy: 0.32, sz: sectorSizeM };
  return { x: strip / 2, y: 0.16, z: along, sx: strip, sy: 0.32, sz: sectorSizeM };
}

export function borderSectorLanding(
  side: BorderSide,
  sectorIndex: number,
  plot: Pick<BorderGatewayPlot, "widthM" | "depthM">,
  insetM = DEFAULT_BORDER_LANDING_INSET_M,
  sectorSizeM = BORDER_SECTOR_SIZE_M
): { x: number; y: number; z: number } {
  const count = borderSectorCount(plot, side, sectorSizeM);
  validateSectorIndex(sectorIndex, count);
  const along = sectorIndex * sectorSizeM + sectorSizeM / 2;
  const inset = Math.max(3, Math.min(32, insetM));
  if (side === "north") return { x: along, y: 0.2, z: plot.depthM - inset };
  if (side === "south") return { x: along, y: 0.2, z: inset };
  if (side === "east") return { x: plot.widthM - inset, y: 0.2, z: along };
  return { x: inset, y: 0.2, z: along };
}

export function borderSectorAtPosition(
  side: BorderSide,
  pos: { x: number; z: number },
  plot: Pick<BorderGatewayPlot, "widthM" | "depthM">,
  sectorSizeM = BORDER_SECTOR_SIZE_M
): number | null {
  const count = borderSectorCount(plot, side, sectorSizeM);
  if (!count) return null;
  const along = side === "north" || side === "south" ? pos.x : pos.z;
  const index = Math.floor(along / sectorSizeM);
  return index >= 0 && index < count ? index : null;
}

function normalizedClearSectors(plot: BorderGatewayPlot, side: BorderSide): number[] {
  const count = borderSectorCount(plot, side);
  const supplied = plot.clearSectors?.[side];
  const indexes = supplied ?? Array.from({ length: count }, (_, index) => index);
  return [...new Set(indexes)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < count)
    .sort((a, b) => a - b);
}

function centered<T>(values: T[], count: number): T[] {
  const start = Math.floor((values.length - count) / 2);
  return values.slice(start, start + count);
}

function endpoint(plot: BorderGatewayPlot, side: BorderSide, sectorIndex: number): BorderRouteEndpoint {
  const worldName = normalizeDclWorldName(plot.worldName);
  if (!worldName) throw new Error(`Invalid gateway World: ${plot.worldName}`);
  const sectorCount = borderSectorCount(plot, side);
  return {
    worldName,
    sceneBase: plot.sceneBase,
    side,
    sectorIndex,
    sectorCount,
    alongT: (sectorIndex + 0.5) / sectorCount,
    strip: borderSectorBox(side, sectorIndex, plot),
    landing: borderSectorLanding(side, sectorIndex, plot),
  };
}

export interface GenerateBorderRoutesInput {
  connectionId: string;
  a: BorderGatewayPlot;
  b: BorderGatewayPlot;
  aSide: BorderSide;
  bSide: BorderSide;
}

/**
 * Pairs centered clear sectors monotonically. Different edge lengths never
 * create a many-to-one ambiguity; surplus sectors remain inactive.
 */
export function generateBorderRoutePairs(input: GenerateBorderRoutesInput): BorderRoutePair[] {
  if (!input.connectionId.trim()) throw new Error("Border routes require a connection id.");
  if (!BORDER_SIDES.includes(input.aSide) || !BORDER_SIDES.includes(input.bSide)) {
    throw new Error("Border routes require cardinal sides.");
  }
  if (OPPOSITE_BORDER[input.aSide] !== input.bSide) {
    throw new Error(`Border sides must be opposite: ${input.aSide} cannot connect to ${input.bSide}.`);
  }
  const clearA = normalizedClearSectors(input.a, input.aSide);
  const clearB = normalizedClearSectors(input.b, input.bSide);
  const pairCount = Math.min(clearA.length, clearB.length);
  if (!pairCount) return [];
  const pickedA = centered(clearA, pairCount);
  const pickedB = centered(clearB, pairCount);
  return pickedA.map((aIndex, routeIndex) => ({
    version: BORDER_ROUTE_VERSION,
    routeId: `${input.connectionId}:${routeIndex}`,
    connectionId: input.connectionId,
    a: endpoint(input.a, input.aSide, aIndex),
    b: endpoint(input.b, input.bSide, pickedB[routeIndex]!),
  }));
}
