/**
 * Authored crowd navigation — waypoint graph + A* routing with collider blockers.
 * Pure math (no SDK) for unit tests and scene runtime.
 */
import type { DanceObstruction } from "./dance-venue-contract";
import type { SteerDisc } from "./dance-crowd-steering";
import { insideAnyDisc, projectOutOfDiscs } from "./dance-crowd-steering";

export interface CrowdWaypoint {
  id: string;
  floorIndex: number;
  x: number;
  z: number;
  /** Optional walk-surface Y in building-local metres. */
  y?: number;
}

export interface CrowdWaypointLink {
  from: string;
  to: string;
  kind?: "walk" | "ramp" | "stairs" | "portal";
}

export interface CrowdRoamZone {
  floorIndex: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CrowdNavigationConfig {
  waypoints: CrowdWaypoint[];
  links: CrowdWaypointLink[];
  roamZones: CrowdRoamZone[];
  dwellMinS: number;
  dwellMaxS: number;
}

export function defaultCrowdNavigationConfig(): CrowdNavigationConfig {
  return {
    waypoints: [],
    links: [],
    roamZones: [],
    dwellMinS: 8,
    dwellMaxS: 22,
  };
}

export function normalizeCrowdNavigationConfig(
  partial: Partial<CrowdNavigationConfig> | null | undefined
): CrowdNavigationConfig {
  const base = defaultCrowdNavigationConfig();
  if (!partial) return base;
  const num = (v: unknown, fallback: number, min: number, max: number): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  const waypoints: CrowdWaypoint[] = Array.isArray(partial.waypoints)
    ? partial.waypoints
        .map((w) => ({
          id: String(w?.id ?? "").trim(),
          floorIndex: Math.round(num(w?.floorIndex, 0, 0, 50)),
          x: num(w?.x, 0, -200, 200),
          z: num(w?.z, 0, -200, 200),
          y: w?.y !== undefined && Number.isFinite(Number(w.y)) ? Number(w.y) : undefined,
        }))
        .filter((w) => w.id.length > 0)
    : [];
  const links: CrowdWaypointLink[] = Array.isArray(partial.links)
    ? partial.links
        .map((l) => ({
          from: String(l?.from ?? "").trim(),
          to: String(l?.to ?? "").trim(),
          kind:
            l?.kind === "ramp" || l?.kind === "stairs" || l?.kind === "portal"
              ? l.kind
              : ("walk" as const),
        }))
        .filter((l) => l.from && l.to)
    : [];
  const roamZones: CrowdRoamZone[] = Array.isArray(partial.roamZones)
    ? partial.roamZones
        .map((z) => ({
          floorIndex: Math.round(num(z?.floorIndex, 0, 0, 50)),
          minX: num(z?.minX, -20, -200, 200),
          maxX: num(z?.maxX, 20, -200, 200),
          minZ: num(z?.minZ, -20, -200, 200),
          maxZ: num(z?.maxZ, 20, -200, 200),
        }))
        .filter((z) => z.maxX > z.minX && z.maxZ > z.minZ)
    : [];
  return {
    waypoints,
    links,
    roamZones,
    dwellMinS: num(partial.dwellMinS, base.dwellMinS, 3, 120),
    dwellMaxS: Math.max(
      num(partial.dwellMinS, base.dwellMinS, 3, 120),
      num(partial.dwellMaxS, base.dwellMaxS, 5, 180)
    ),
  };
}

function obstructionDiscs(
  obstructions: readonly DanceObstruction[] | undefined,
  floorIndex?: number
): SteerDisc[] {
  if (!obstructions?.length) return [];
  return obstructions
    .filter((o) => floorIndex === undefined || o.floorIndex === undefined || o.floorIndex === floorIndex)
    .map((o) => ({ x: o.x, z: o.z, r: o.r, hx: o.hx, hz: o.hz, x2: o.x2, z2: o.z2 }));
}

/** True when a straight segment crosses inside any blocker disc. */
export function segmentCrossesBlocker(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  discs: readonly SteerDisc[]
): boolean {
  if (!discs.length) return false;
  const steps = Math.max(4, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const z = z1 + (z2 - z1) * t;
    if (insideAnyDisc(x, z, discs)) return true;
  }
  return false;
}

function waypointById(waypoints: readonly CrowdWaypoint[], id: string): CrowdWaypoint | null {
  return waypoints.find((w) => w.id === id) ?? null;
}

function neighbors(
  graph: CrowdNavigationConfig,
  id: string
): { id: string; kind: CrowdWaypointLink["kind"] }[] {
  const out: { id: string; kind: CrowdWaypointLink["kind"] }[] = [];
  for (const link of graph.links) {
    if (link.from === id) out.push({ id: link.to, kind: link.kind ?? "walk" });
    if (link.to === id) out.push({ id: link.from, kind: link.kind ?? "walk" });
  }
  return out;
}

function edgeCost(
  a: CrowdWaypoint,
  b: CrowdWaypoint,
  kind: CrowdWaypointLink["kind"] | undefined
): number {
  const horiz = Math.hypot(b.x - a.x, b.z - a.z);
  const vert = Math.abs((b.y ?? 0) - (a.y ?? 0));
  const floorPenalty = a.floorIndex !== b.floorIndex ? 4 : 0;
  const linkPenalty = kind === "portal" ? 0.5 : kind === "stairs" || kind === "ramp" ? 1.5 : 0;
  return horiz + vert * 2 + floorPenalty + linkPenalty;
}

/**
 * Deterministic A* over the authored waypoint graph. Returns waypoint ids from
 * `fromId` to `toId`, or null when unreachable or blocked.
 */
export function findCrowdRoute(
  graph: CrowdNavigationConfig,
  fromId: string,
  toId: string,
  obstructions?: readonly DanceObstruction[]
): string[] | null {
  if (fromId === toId) return [fromId];
  const from = waypointById(graph.waypoints, fromId);
  const to = waypointById(graph.waypoints, toId);
  if (!from || !to) return null;

  const open = new Set<string>([fromId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[fromId, 0]]);
  const fScore = new Map<string, number>([[fromId, Math.hypot(to.x - from.x, to.z - from.z)]]);

  while (open.size) {
    let current: string | null = null;
    let bestF = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        current = id;
      }
    }
    if (!current) break;
    if (current === toId) {
      const path: string[] = [current];
      while (cameFrom.has(path[0]!)) {
        path.unshift(cameFrom.get(path[0]!)!);
      }
      return path;
    }
    open.delete(current);
    const curWp = waypointById(graph.waypoints, current);
    if (!curWp) continue;
    const curG = gScore.get(current) ?? Infinity;

    for (const { id: nextId, kind } of neighbors(graph, current)) {
      const nextWp = waypointById(graph.waypoints, nextId);
      if (!nextWp) continue;
      const discs = obstructionDiscs(obstructions, curWp.floorIndex);
      if (segmentCrossesBlocker(curWp.x, curWp.z, nextWp.x, nextWp.z, discs)) continue;
      const tentative = curG + edgeCost(curWp, nextWp, kind);
      if (tentative >= (gScore.get(nextId) ?? Infinity)) continue;
      cameFrom.set(nextId, current);
      gScore.set(nextId, tentative);
      fScore.set(nextId, tentative + Math.hypot(to.x - nextWp.x, to.z - nextWp.z));
      open.add(nextId);
    }
  }
  return null;
}

/** Push a point out of blockers on the given floor. */
export function clearPoint(
  x: number,
  z: number,
  obstructions: readonly DanceObstruction[] | undefined,
  floorIndex: number
): { x: number; z: number } {
  const discs = obstructionDiscs(obstructions, floorIndex);
  return discs.length ? projectOutOfDiscs(x, z, discs) : { x, z };
}

function hash01(n: number): number {
  let x = (n + 1) * 2654435761;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  x = ((x >>> 16) ^ x) >>> 0;
  return (x % 1000) / 1000;
}

/** Deterministic roam target for a bot index inside roam zones or near plot centre. */
export function sampleRoamWaypoint(
  graph: CrowdNavigationConfig,
  botIndex: number,
  tick: number,
  plotBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null,
  obstructions?: readonly DanceObstruction[],
  reserved: readonly { floorIndex: number; x: number; z: number }[] = []
): CrowdWaypoint | null {
  const zones =
    graph.roamZones.length > 0
      ? graph.roamZones
      : plotBounds
        ? [
            {
              floorIndex: 0,
              minX: plotBounds.minX + 2,
              maxX: plotBounds.maxX - 2,
              minZ: plotBounds.minZ + 2,
              maxZ: plotBounds.maxZ - 2,
            },
          ]
        : [];

  if (!zones.length) return null;
  // Never project blocked random points to an obstruction rim: with a large
  // crowd that collapses dozens of destinations onto the same boundary. Probe
  // a low-discrepancy sequence until a point is naturally clear.
  for (let attempt = 0; attempt < 128; attempt++) {
    const seed = botIndex * 131 + tick * 977 + attempt * 37;
    const zone = zones[Math.floor(hash01(seed) * zones.length)]!;
    const rx = hash01(seed * 31 + 11);
    const rz = hash01(seed * 47 + 23);
    const x = zone.minX + rx * (zone.maxX - zone.minX);
    const z = zone.minZ + rz * (zone.maxZ - zone.minZ);
    const discs = obstructionDiscs(obstructions, zone.floorIndex);
    if (insideAnyDisc(x, z, discs)) continue;
    if (
      reserved.some(
        (point) =>
          point.floorIndex === zone.floorIndex &&
          Math.hypot(x - point.x, z - point.z) < 0.85
      )
    ) {
      continue;
    }
    return {
      id: `roam_${botIndex}_${tick}_${attempt}`,
      floorIndex: zone.floorIndex,
      x,
      z,
    };
  }
  return null;
}

/** Pick a linked next hop from current waypoint id, or null. */
export function nextRouteHop(
  graph: CrowdNavigationConfig,
  route: readonly string[],
  cursor: number
): CrowdWaypoint | null {
  if (cursor < 0 || cursor >= route.length) return null;
  const id = route[cursor]!;
  return waypointById(graph.waypoints, id);
}
