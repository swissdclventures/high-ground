/**
 * Train corridor — World transit infrastructure, not a toy inside a venue plot.
 *
 * The product is a long strip scene across the World map. Venues sit on parcels
 * *adjacent* to that strip (north/south of the E–W corridor). The cart stays
 * inside the corridor scene; stations hand riders into those neighboring scenes
 * via teleport (or they walk across the shared parcel edge).
 *
 * `axis` defaults to "auto" so a config saved on the 301×3 strip still runs the
 * long way if the same build is ever opened on a different plot shape.
 */

import type { SceneLayout } from "./types";
import { GRID } from "./types";

/** Full-width E–W strip (Genesis Worlds span ±150). */
export const TRAIN_CORRIDOR_COLS = 301;
export const TRAIN_CORRIDOR_ROWS = 3;
/** SW base: X −150…150, parcel Y −1,0,1. */
export const TRAIN_CORRIDOR_BASE = "-150,-1";

export const TRAIN_MIN_PERIOD_SEC = 10;
export const TRAIN_MAX_PERIOD_SEC = 3600;
export const TRAIN_MAX_CARS = 6;

/**
 * The corridor runtime is a FLIGHT SUPERHIGHWAY (the train-era cars/stations are
 * retired; their config fields remain for saved-draft compatibility). Speeds are
 * what the strip exists for: ~4× normal flight, ~4× boost, along the strip only.
 */
export const HIGHWAY_FLIGHT_SPEED_MPS = 45;
export const HIGHWAY_FLIGHT_BOOST_MPS = 80;
/** Painted road width — the strip parcel is 16 m; the deck leaves walk margins. */
export const HIGHWAY_LANE_WIDTH_M = 10;
/** Emissive gate spacing; gates are the speed cue that makes velocity legible. */
export const HIGHWAY_GATE_SPACING_M = 96;
export const HIGHWAY_DASH_SPACING_M = 24;
export const HIGHWAY_DASH_LENGTH_M = 6;

const CAR_LENGTH_M = 6.4;
const CAR_GAP_M = 0.8;
export const TRAIN_CAR_SPACING_M = CAR_LENGTH_M + CAR_GAP_M;
/** Low, broad chassis: large enough to read as transit and easy to jump onto. */
export const TRAIN_CAR_SIZE_M = { length: CAR_LENGTH_M, width: 3.4, height: 0.9 };
/** Hard safety cap even when an older saved project requests an unusably short period. */
export const TRAIN_MAX_CRUISE_MPS = 6;
/** Closest approach speed while somebody is waiting on the track / riding the car. */
export const TRAIN_BOARDING_SPEED_MULTIPLIER = 0.2;
export const TRAIN_BOARDING_APPROACH_M = 24;
export const TRAIN_BOARDING_TRACK_HALF_WIDTH_M = 3.2;

export type TrainAxisSetting = "auto" | "x" | "z";
export type TrainAxis = "x" | "z";

/** World-map parcel a station exit teleports into (an adjacent venue scene). */
export interface TrainStationExit {
  x: number;
  y: number;
}

export interface TrainCorridorConfig {
  enabled: boolean;
  /**
   * True only for the dedicated scene created from the World map. Older corridor
   * projects predate this marker and are recognized from their thin plot shape.
   * Ordinary venue scenes must never set it.
   */
  worldScene: boolean;
  axis: TrainAxisSetting;
  /** Full round trip (out and back) in seconds. */
  periodSec: number;
  cars: number;
  stations: boolean;
  stationAName: string;
  stationBName: string;
  /**
   * World parcel for "Exit" at station A (west / start). Null = marker only;
   * riders walk off the strip into whatever scene shares that edge.
   */
  stationAExit: TrainStationExit | null;
  /** World parcel for "Exit" at station B (east / far end). */
  stationBExit: TrainStationExit | null;
  track: boolean;
}

/** Parcel Y of the corridor strip rows: −1, 0, 1 → venues belong on ±2. */
export function trainCorridorStripYRange(base = TRAIN_CORRIDOR_BASE): {
  minY: number;
  maxY: number;
} {
  const xy = parseParcelPair(base);
  if (!xy) return { minY: -1, maxY: 1 };
  return { minY: xy.y, maxY: xy.y + TRAIN_CORRIDOR_ROWS - 1 };
}

/**
 * Default exits: one parcel north of the west end and north of the east end.
 * Place venue scenes on those parcels (or retarget the exits in Apps ▸ Train).
 */
export function defaultTrainCorridorStationExits(
  base = TRAIN_CORRIDOR_BASE
): { a: TrainStationExit; b: TrainStationExit } {
  const xy = parseParcelPair(base) ?? { x: -150, y: -1 };
  const northY = xy.y + TRAIN_CORRIDOR_ROWS; // first free row north of the strip
  return {
    a: { x: xy.x, y: northY },
    b: { x: xy.x + TRAIN_CORRIDOR_COLS - 1, y: northY },
  };
}

/** Every parcel immediately north or south of the canonical corridor — venue land. */
export function trainCorridorAdjacentParcels(
  side: "north" | "south",
  base = TRAIN_CORRIDOR_BASE
): string[] {
  const xy = parseParcelPair(base);
  if (!xy) return [];
  const y = side === "north" ? xy.y + TRAIN_CORRIDOR_ROWS : xy.y - 1;
  const out: string[] = [];
  for (let i = 0; i < TRAIN_CORRIDOR_COLS; i += 1) {
    out.push(`${xy.x + i},${y}`);
  }
  return out;
}

export function formatTrainStationExit(exit: TrainStationExit | null | undefined): string {
  if (!exit) return "";
  return `${exit.x},${exit.y}`;
}

export function parseTrainStationExit(raw: unknown): TrainStationExit | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const x = Number(o.x);
    const y = Number(o.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.round(x), y: Math.round(y) };
  }
  if (typeof raw !== "string") return null;
  return parseParcelPair(raw);
}

function parseParcelPair(raw: string): TrainStationExit | null {
  const m = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(raw.trim());
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]) };
}

export function defaultTrainCorridorConfig(): TrainCorridorConfig {
  return {
    enabled: false,
    worldScene: false,
    axis: "auto",
    periodSec: 240,
    cars: 2,
    stations: true,
    stationAName: "West",
    stationBName: "East",
    stationAExit: null,
    stationBExit: null,
    track: true,
  };
}

/** Corridor seed: train on, exits pointed at the natural north-side end parcels. */
export function defaultTrainCorridorTransitConfig(): TrainCorridorConfig {
  const exits = defaultTrainCorridorStationExits();
  return {
    ...defaultTrainCorridorConfig(),
    enabled: true,
    cars: 3,
    periodSec: 1800,
    stationAExit: exits.a,
    stationBExit: exits.b,
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function trimName(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 32) : fallback;
}

export function normalizeTrainCorridorConfig(
  partial: Partial<TrainCorridorConfig> | null | undefined
): TrainCorridorConfig {
  const base = defaultTrainCorridorConfig();
  if (!partial || typeof partial !== "object") return base;
  return {
    enabled: partial.enabled === true,
    worldScene: partial.worldScene === true,
    axis: partial.axis === "x" || partial.axis === "z" ? partial.axis : "auto",
    periodSec: Math.round(
      clampNumber(partial.periodSec, TRAIN_MIN_PERIOD_SEC, TRAIN_MAX_PERIOD_SEC, base.periodSec)
    ),
    cars: Math.round(clampNumber(partial.cars, 1, TRAIN_MAX_CARS, base.cars)),
    stations: partial.stations !== false,
    stationAName: trimName(partial.stationAName, base.stationAName),
    stationBName: trimName(partial.stationBName, base.stationBName),
    stationAExit:
      partial.stationAExit === undefined
        ? base.stationAExit
        : parseTrainStationExit(partial.stationAExit),
    stationBExit:
      partial.stationBExit === undefined
        ? base.stationBExit
        : parseTrainStationExit(partial.stationBExit),
    track: partial.track !== false,
  };
}

/**
 * A train may run only in its own World-map corridor scene. The shape fallback
 * keeps already-saved one/three-parcel-wide routes working after this marker was
 * introduced, while rejecting legacy train settings embedded in square venues.
 */
export function isDedicatedTrainCorridorScene(
  layout: SceneLayout,
  partial: Partial<TrainCorridorConfig> | null | undefined
): boolean {
  const train = normalizeTrainCorridorConfig(partial);
  if (!train.enabled) return false;
  if (train.worldScene) return true;
  const shortSide = Math.min(layout.cols, layout.rows);
  const longSide = Math.max(layout.cols, layout.rows);
  return shortSide <= 3 && longSide > shortSide;
}

export function resolveTrainAxis(train: TrainCorridorConfig, layout: SceneLayout): TrainAxis {
  if (train.axis === "x" || train.axis === "z") return train.axis;
  return layout.cols >= layout.rows ? "x" : "z";
}

export interface TrainCorridorMetrics {
  axis: TrainAxis;
  width: number;
  depth: number;
  y: number;
  start: { x: number; z: number };
  end: { x: number; z: number };
  railHalf: number;
  length: number;
}

export function trainCorridorMetrics(
  layout: SceneLayout,
  train: TrainCorridorConfig
): TrainCorridorMetrics {
  const width = Math.max(GRID.parcelSize, layout.cols * GRID.parcelSize);
  const depth = Math.max(GRID.parcelSize, layout.rows * GRID.parcelSize);
  const axis = resolveTrainAxis(train, layout);
  const y = 0.35;
  const span = axis === "x" ? width : depth;
  const margin = Math.min(24, Math.max(2, span * 0.04));
  const start = axis === "x" ? { x: margin, z: depth / 2 } : { x: width / 2, z: margin };
  const end =
    axis === "x" ? { x: width - margin, z: depth / 2 } : { x: width / 2, z: depth - margin };
  return {
    axis,
    width,
    depth,
    y,
    start,
    end,
    railHalf: 1.25,
    length: Math.max(0, span - margin * 2),
  };
}

export interface TrainCarPlacement {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export function trainCarPlacement(
  layout: SceneLayout,
  train: TrainCorridorConfig,
  phase01: number,
  carIndex = 0
): TrainCarPlacement {
  const m = trainCorridorMetrics(layout, train);
  const t = ((phase01 % 1) + 1) % 1;
  const forward = t <= 0.5;
  const ping = forward ? t * 2 : (1 - t) * 2;
  const trail = carIndex * TRAIN_CAR_SPACING_M;
  const lead = m.length * ping;
  const distance = Math.min(m.length, Math.max(0, forward ? lead - trail : lead + trail));
  const u = m.length > 0 ? distance / m.length : 0;
  const yaw = m.axis === "x" ? (forward ? 0 : Math.PI) : forward ? Math.PI / 2 : -Math.PI / 2;
  return {
    x: m.start.x + (m.end.x - m.start.x) * u,
    y: m.y + 0.55,
    z: m.start.z + (m.end.z - m.start.z) * u,
    yaw,
  };
}

/**
 * The saved period remains an author preference, but safety wins over an old value
 * that would send a train across a large estate at highway speed.
 */
export function effectiveTrainPeriodSec(
  layout: SceneLayout,
  train: TrainCorridorConfig
): number {
  const route = trainCorridorMetrics(layout, train);
  const safeRoundTrip = route.length > 0 ? (route.length * 2) / TRAIN_MAX_CRUISE_MPS : 0;
  return Math.max(train.periodSec, safeRoundTrip);
}

/**
 * Per-client boarding assist. A visitor must be close to the track and close to a
 * carriage; merely standing elsewhere on a kilometre-long corridor does not stop it.
 * The multiplier blends continuously so the car approaches instead of braking hard.
 */
export function trainProximitySpeedMultiplier(
  layout: SceneLayout,
  train: TrainCorridorConfig,
  phase01: number,
  player: { x: number; y?: number; z: number }
): number {
  const route = trainCorridorMetrics(layout, train);
  if ((player.y ?? 0) > route.y + 5) return 1;
  const perpendicular =
    route.axis === "x"
      ? Math.abs(player.z - route.start.z)
      : Math.abs(player.x - route.start.x);
  if (perpendicular > TRAIN_BOARDING_TRACK_HALF_WIDTH_M) return 1;

  const along = route.axis === "x" ? player.x : player.z;
  const start = route.axis === "x" ? route.start.x : route.start.z;
  const end = route.axis === "x" ? route.end.x : route.end.z;
  if (along < start - TRAIN_BOARDING_APPROACH_M || along > end + TRAIN_BOARDING_APPROACH_M) {
    return 1;
  }

  let nearest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < train.cars; i += 1) {
    const car = trainCarPlacement(layout, train, phase01, i);
    nearest = Math.min(nearest, Math.hypot(player.x - car.x, player.z - car.z));
  }
  if (nearest >= TRAIN_BOARDING_APPROACH_M) return 1;
  const approach = nearest / TRAIN_BOARDING_APPROACH_M;
  return TRAIN_BOARDING_SPEED_MULTIPLIER + (1 - TRAIN_BOARDING_SPEED_MULTIPLIER) * approach;
}
