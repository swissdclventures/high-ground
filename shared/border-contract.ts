/**
 * Border — federation-edge teleporter strips.
 *
 * A World in a 3x3 federation can share up to four sides with neighbours.
 * Each side may place a strip on this scene's outer parcel edge. Walking onto
 * it asks Explorer to change realm to the adjacent World. Destinations are
 * stored on the scene so a published World does not depend on Builder overlay
 * storage. The Apps tab fills empty destinations from the federation map.
 */

import {
  inFederationBounds,
  normalizeDclWorldName,
  worldAtFederation,
  worldSlotInOverlay,
  type UniverseOverlay,
} from "./universe-overlay-contract";

export const BORDER_VERSION = 2 as const;
export const DEFAULT_ATLAS_API_BASE = "https://builder.swissverse.org";

export const BORDER_SIDES = ["north", "east", "south", "west"] as const;
export type BorderSide = (typeof BORDER_SIDES)[number];

export const BORDER_SIDE_LABEL: Record<BorderSide, string> = {
  north: "North",
  east: "East",
  south: "South",
  west: "West",
};

/** Federation grid: y=0 is the top row (north on the Atlas / Federation maps). */
export const BORDER_GRID_OFFSET: Record<BorderSide, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

export const OPPOSITE_BORDER: Record<BorderSide, BorderSide> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

export const DEFAULT_BORDER_STRIP_WIDTH_M = 3;
export const MIN_BORDER_STRIP_WIDTH_M = 1.5;
export const MAX_BORDER_STRIP_WIDTH_M = 8;
export const DEFAULT_BORDER_LANDING_INSET_M = 8;

export interface BorderEdgeConfig {
  /** Place a teleporter strip on this outer edge. */
  strip: boolean;
  /** Adjacent DCL World (`name.dcl.eth`). Empty = no hop even if strip is on. */
  destinationWorld: string;
}

export interface BorderAppConfig {
  version: typeof BORDER_VERSION;
  enabled: boolean;
  /**
   * Managed Border is an Atlas invariant, not an optional scene decoration.
   * A current runtime polls for confirmed routes even when the manual app
   * switch is off; without a confirmed route the plugin remains inert.
   */
  autoManaged: boolean;
  /** Atlas-managed confirmed routes replace manually typed whole-edge targets. */
  managed: boolean;
  atlasApiBase: string;
  /** Thickness of the walk-on strip, metres, along the parcel edge. */
  stripWidthM: number;
  /**
   * How far inside the destination plot arrivals should stand (opposite edge).
   * Explorer still lands at that World's spawn; this is the intended inbound pad.
   */
  landingInsetM: number;
  north: BorderEdgeConfig;
  east: BorderEdgeConfig;
  south: BorderEdgeConfig;
  west: BorderEdgeConfig;
}

export function defaultBorderEdge(): BorderEdgeConfig {
  return { strip: false, destinationWorld: "" };
}

export function defaultBorderAppConfig(): BorderAppConfig {
  return {
    version: BORDER_VERSION,
    enabled: false,
    autoManaged: true,
    managed: true,
    atlasApiBase: DEFAULT_ATLAS_API_BASE,
    stripWidthM: DEFAULT_BORDER_STRIP_WIDTH_M,
    landingInsetM: DEFAULT_BORDER_LANDING_INSET_M,
    north: defaultBorderEdge(),
    east: defaultBorderEdge(),
    south: defaultBorderEdge(),
    west: defaultBorderEdge(),
  };
}

function clampStripWidth(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_BORDER_STRIP_WIDTH_M, Math.max(MIN_BORDER_STRIP_WIDTH_M, n));
}

function clampLandingInset(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(32, Math.max(3, n));
}

function normalizeEdge(raw: unknown): BorderEdgeConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const world =
    typeof o.destinationWorld === "string" ? normalizeDclWorldName(o.destinationWorld) ?? "" : "";
  return {
    strip: o.strip === true,
    destinationWorld: world,
  };
}

export function normalizeBorderAppConfig(raw: unknown): BorderAppConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const base = defaultBorderAppConfig();
  return {
    version: BORDER_VERSION,
    enabled: o.enabled === true,
    autoManaged: o.autoManaged !== false,
    managed: o.managed !== false,
    atlasApiBase:
      typeof o.atlasApiBase === "string" && /^https?:\/\//i.test(o.atlasApiBase.trim())
        ? o.atlasApiBase.trim().replace(/\/+$/, "")
        : base.atlasApiBase,
    stripWidthM: clampStripWidth(o.stripWidthM, base.stripWidthM),
    landingInsetM: clampLandingInset(o.landingInsetM, base.landingInsetM),
    north: normalizeEdge(o.north),
    east: normalizeEdge(o.east),
    south: normalizeEdge(o.south),
    west: normalizeEdge(o.west),
  };
}

export type FederationNeighborMap = Record<BorderSide, string | null>;

export function emptyNeighborMap(): FederationNeighborMap {
  return { north: null, east: null, south: null, west: null };
}

/** Neighbour World names for this World's federation slot. Null = no assigned neighbour. */
export function federationNeighborsForWorld(
  overlay: UniverseOverlay,
  worldName: string
): { federationName: string; x: number; y: number; neighbors: FederationNeighborMap } | null {
  const slot = worldSlotInOverlay(overlay, worldName);
  if (!slot) return null;
  const neighbors = emptyNeighborMap();
  for (const side of BORDER_SIDES) {
    const { dx, dy } = BORDER_GRID_OFFSET[side];
    const x = slot.x + dx;
    const y = slot.y + dy;
    if (!inFederationBounds(x, y)) continue;
    neighbors[side] = worldAtFederation(slot.federation, x, y)?.worldName ?? null;
  }
  return {
    federationName: slot.federation.name,
    x: slot.x,
    y: slot.y,
    neighbors,
  };
}

/** Fill empty destination fields from the federation map. Never flips a strip on. */
export function applyFederationNeighbors(
  config: BorderAppConfig,
  neighbors: FederationNeighborMap
): BorderAppConfig {
  const next = { ...config };
  for (const side of BORDER_SIDES) {
    const suggested = neighbors[side];
    if (!suggested || next[side].destinationWorld) continue;
    next[side] = { ...next[side], destinationWorld: suggested };
  }
  return next;
}

export interface ActiveBorderStrip {
  side: BorderSide;
  destinationWorld: string;
  opposite: BorderSide;
}

export function activeBorderStrips(config: BorderAppConfig): ActiveBorderStrip[] {
  if (!config.enabled) return [];
  const out: ActiveBorderStrip[] = [];
  for (const side of BORDER_SIDES) {
    const edge = config[side];
    if (!edge.strip || !edge.destinationWorld) continue;
    out.push({ side, destinationWorld: edge.destinationWorld, opposite: OPPOSITE_BORDER[side] });
  }
  return out;
}

export interface BorderBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

/**
 * Walk-on volume on the outer parcel edge. Origin is scene SW (DCL: +X east, +Z north).
 * East/west strips stop short of the corners so they do not overlap north/south.
 */
export function borderStripBox(
  side: BorderSide,
  plot: { widthM: number; depthM: number },
  stripWidthM: number
): BorderBox {
  const strip = clampStripWidth(stripWidthM, DEFAULT_BORDER_STRIP_WIDTH_M);
  const y = 0.16;
  const sy = 0.32;
  const { widthM, depthM } = plot;
  switch (side) {
    case "north":
      return { x: widthM / 2, y, z: depthM - strip / 2, sx: widthM, sy, sz: strip };
    case "south":
      return { x: widthM / 2, y, z: strip / 2, sx: widthM, sy, sz: strip };
    case "east":
      return { x: widthM - strip / 2, y, z: depthM / 2, sx: strip, sy, sz: Math.max(strip, depthM - strip * 2) };
    case "west":
      return { x: strip / 2, y, z: depthM / 2, sx: strip, sy, sz: Math.max(strip, depthM - strip * 2) };
  }
}

/** Stand just inside the opposite edge so the return strip does not fire immediately. */
export function inboundLandingPosition(
  arrivalSide: BorderSide,
  plot: { widthM: number; depthM: number },
  insetM: number
): { x: number; y: number; z: number } {
  const inset = clampLandingInset(insetM, DEFAULT_BORDER_LANDING_INSET_M);
  const { widthM, depthM } = plot;
  const y = 0.2;
  switch (arrivalSide) {
    case "north":
      return { x: widthM / 2, y, z: depthM - inset };
    case "south":
      return { x: widthM / 2, y, z: inset };
    case "east":
      return { x: widthM - inset, y, z: depthM / 2 };
    case "west":
      return { x: inset, y, z: depthM / 2 };
  }
}

export function playerInsideBorderBox(
  pos: { x: number; y: number; z: number },
  box: BorderBox,
  heightSlackM = 3.5
): boolean {
  if (pos.y > box.y + box.sy / 2 + heightSlackM) return false;
  return Math.abs(pos.x - box.x) <= box.sx / 2 && Math.abs(pos.z - box.z) <= box.sz / 2;
}

export function worldsContentRealm(worldName: string): string {
  const name = normalizeDclWorldName(worldName) ?? worldName.trim().toLowerCase();
  if (name.includes("://")) return name;
  return `https://worlds-content-server.decentraland.org/world/${name}`;
}
