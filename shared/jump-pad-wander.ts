/**
 * Slow street-wander for jump pads.
 *
 * Decentraland has no entity-vs-mesh bounce. Pads drift in 2D against published
 * building AABBs (the filled footprints) and the plot edge, then reflect. Motion
 * is a function of elapsed time from the published stamp so every client sees
 * the same path. Speed corridors and floor-picker pads stay put.
 */

export const JUMP_PAD_WANDER_MPS = 0.2;
/** Extra air between the disc edge and a wall — the disc itself is already carved out. */
export const JUMP_PAD_WANDER_GAP_M = 0.5;
export const JUMP_PAD_WANDER_MAX_BOUNCES = 8000;

export interface WanderAabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WanderBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface JumpPadWanderWorld {
  bounds: WanderBounds;
  obstacles: WanderAabb[];
}

export interface JumpPadWanderState {
  id: string;
  homeX: number;
  homeZ: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  elapsedS: number;
}

const HIT_EPS = 1e-4;
const NUDGE_M = 0.002;

export function headingForPadId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967295) * Math.PI * 2;
}

export function wanderMarginM(radius: number): number {
  return Math.max(0.4, radius) + JUMP_PAD_WANDER_GAP_M;
}

export function aabbsFromBuildingOutlines(
  outlines: ReadonlyArray<{ points?: ReadonlyArray<{ x: number; y: number }> }> | undefined,
  parcelSize: number
): WanderAabb[] {
  if (!outlines?.length || !(parcelSize > 0)) return [];
  const out: WanderAabb[] = [];
  for (const outline of outlines) {
    const points = outline.points;
    if (!points || points.length < 3) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const point of points) {
      const x = Number(point?.x) * parcelSize;
      const z = Number(point?.y) * parcelSize;
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    if (maxX - minX >= 0.5 && maxZ - minZ >= 0.5) {
      out.push({ minX, maxX, minZ, maxZ });
    }
  }
  return out;
}

export function jumpPadWanderWorldFromOutlines(input: {
  cols: number;
  rows: number;
  parcelSize: number;
  outlines?: ReadonlyArray<{ points?: ReadonlyArray<{ x: number; y: number }> }>;
}): JumpPadWanderWorld | null {
  const width = input.cols * input.parcelSize;
  const depth = input.rows * input.parcelSize;
  if (!(width > 4) || !(depth > 4)) return null;
  const obstacles = aabbsFromBuildingOutlines(input.outlines, input.parcelSize);
  if (!obstacles.length) return null;
  return {
    bounds: { minX: 0, maxX: width, minZ: 0, maxZ: depth },
    obstacles,
  };
}

export function circleHitsAabb(
  x: number,
  z: number,
  radius: number,
  box: WanderAabb
): boolean {
  const m = wanderMarginM(radius);
  return x >= box.minX - m && x <= box.maxX + m && z >= box.minZ - m && z <= box.maxZ + m;
}

export function jumpPadClearOfObstacles(
  x: number,
  z: number,
  radius: number,
  world: JumpPadWanderWorld
): boolean {
  const m = wanderMarginM(radius);
  const b = world.bounds;
  if (x < b.minX + m || x > b.maxX - m || z < b.minZ + m || z > b.maxZ - m) return false;
  return !world.obstacles.some((box) => circleHitsAabb(x, z, radius, box));
}

export function projectJumpPadClear(
  x: number,
  z: number,
  radius: number,
  world: JumpPadWanderWorld
): { x: number; z: number } {
  const m = wanderMarginM(radius);
  let px = x;
  let pz = z;
  for (let i = 0; i < 16; i++) {
    const box = world.obstacles.find((o) => circleHitsAabb(px, pz, radius, o));
    if (!box) break;
    const left = px - (box.minX - m);
    const right = box.maxX + m - px;
    const south = pz - (box.minZ - m);
    const north = box.maxZ + m - pz;
    const nearest = Math.min(left, right, south, north);
    if (nearest === left) px = box.minX - m - NUDGE_M;
    else if (nearest === right) px = box.maxX + m + NUDGE_M;
    else if (nearest === south) pz = box.minZ - m - NUDGE_M;
    else pz = box.maxZ + m + NUDGE_M;
  }
  px = Math.min(world.bounds.maxX - m, Math.max(world.bounds.minX + m, px));
  pz = Math.min(world.bounds.maxZ - m, Math.max(world.bounds.minZ + m, pz));
  return { x: px, z: pz };
}

export function startJumpPadWander(
  id: string,
  x: number,
  z: number,
  radius: number,
  world: JumpPadWanderWorld
): JumpPadWanderState {
  const heading = headingForPadId(id);
  const home = projectJumpPadClear(x, z, radius, world);
  return {
    id,
    homeX: x,
    homeZ: z,
    x: home.x,
    z: home.z,
    vx: Math.cos(heading) * JUMP_PAD_WANDER_MPS,
    vz: Math.sin(heading) * JUMP_PAD_WANDER_MPS,
    elapsedS: 0,
  };
}

export function createJumpPadWanderState(
  input: Omit<JumpPadWanderState, "elapsedS"> & { elapsedS?: number }
): JumpPadWanderState {
  return { ...input, elapsedS: input.elapsedS ?? 0 };
}

interface RayHit {
  t: number;
  nx: number;
  nz: number;
}

function axisSlab(
  p: number,
  v: number,
  min: number,
  max: number
): { tmin: number; tmax: number } | null {
  if (v === 0) {
    if (p < min || p > max) return null;
    return { tmin: Number.NEGATIVE_INFINITY, tmax: Number.POSITIVE_INFINITY };
  }
  const t1 = (min - p) / v;
  const t2 = (max - p) / v;
  return { tmin: Math.min(t1, t2), tmax: Math.max(t1, t2) };
}

function rayHitExpandedAabb(
  x: number,
  z: number,
  vx: number,
  vz: number,
  box: WanderAabb,
  margin: number,
  maxT: number
): RayHit | null {
  const minX = box.minX - margin;
  const maxX = box.maxX + margin;
  const minZ = box.minZ - margin;
  const maxZ = box.maxZ + margin;
  const slabX = axisSlab(x, vx, minX, maxX);
  const slabZ = axisSlab(z, vz, minZ, maxZ);
  if (!slabX || !slabZ) return null;
  const tEnter = Math.max(slabX.tmin, slabZ.tmin);
  const tExit = Math.min(slabX.tmax, slabZ.tmax);
  if (!(tEnter < tExit) || tEnter < 0 || tEnter > maxT) return null;
  const fromX = slabX.tmin >= slabZ.tmin;
  const nx = fromX ? (vx > 0 ? -1 : vx < 0 ? 1 : 0) : 0;
  const nz = fromX ? 0 : vz > 0 ? -1 : vz < 0 ? 1 : 0;
  if (nx === 0 && nz === 0) return null;
  return { t: tEnter, nx, nz };
}

function rayHitBounds(
  x: number,
  z: number,
  vx: number,
  vz: number,
  bounds: WanderBounds,
  margin: number,
  maxT: number
): RayHit | null {
  const minX = bounds.minX + margin;
  const maxX = bounds.maxX - margin;
  const minZ = bounds.minZ + margin;
  const maxZ = bounds.maxZ - margin;
  let best: RayHit | null = null;
  const consider = (t: number, nx: number, nz: number) => {
    if (t < HIT_EPS || t > maxT) return;
    if (!best || t < best.t) best = { t, nx, nz };
  };
  if (vx > 0) consider((maxX - x) / vx, -1, 0);
  else if (vx < 0) consider((minX - x) / vx, 1, 0);
  if (vz > 0) consider((maxZ - z) / vz, 0, -1);
  else if (vz < 0) consider((minZ - z) / vz, 0, 1);
  return best;
}

function firstHit(
  x: number,
  z: number,
  vx: number,
  vz: number,
  radius: number,
  world: JumpPadWanderWorld,
  maxT: number
): RayHit | null {
  const margin = wanderMarginM(radius);
  let best = rayHitBounds(x, z, vx, vz, world.bounds, margin, maxT);
  for (const box of world.obstacles) {
    const hit = rayHitExpandedAabb(x, z, vx, vz, box, margin, maxT);
    if (hit && (!best || hit.t < best.t)) best = hit;
  }
  return best;
}

function integrateWander(
  state: JumpPadWanderState,
  deltaS: number,
  radius: number,
  world: JumpPadWanderWorld
): JumpPadWanderState {
  if (!(deltaS > 0) || (state.vx === 0 && state.vz === 0)) {
    return { ...state, elapsedS: state.elapsedS + Math.max(0, deltaS) };
  }
  let { x, z, vx, vz } = state;
  const cleared = projectJumpPadClear(x, z, radius, world);
  x = cleared.x;
  z = cleared.z;
  let remaining = deltaS;
  let bounces = 0;
  while (remaining > HIT_EPS && bounces < JUMP_PAD_WANDER_MAX_BOUNCES) {
    const hit = firstHit(x, z, vx, vz, radius, world, remaining);
    if (!hit) {
      x += vx * remaining;
      z += vz * remaining;
      remaining = 0;
      break;
    }
    const travel = Math.max(0, hit.t - HIT_EPS);
    x += vx * travel;
    z += vz * travel;
    if (hit.nx !== 0) vx = -vx;
    if (hit.nz !== 0) vz = -vz;
    x += vx * NUDGE_M;
    z += vz * NUDGE_M;
    remaining -= hit.t;
    bounces += 1;
  }
  const posed = projectJumpPadClear(x, z, radius, world);
  return {
    ...state,
    x: posed.x,
    z: posed.z,
    vx,
    vz,
    elapsedS: state.elapsedS + deltaS,
  };
}

export function advanceJumpPadWander(
  state: JumpPadWanderState,
  elapsedS: number,
  radius: number,
  world: JumpPadWanderWorld
): JumpPadWanderState {
  const target = Math.max(0, elapsedS);
  if (target + HIT_EPS < state.elapsedS) {
    const restarted = startJumpPadWander(state.id, state.homeX, state.homeZ, radius, world);
    return integrateWander(restarted, target, radius, world);
  }
  return integrateWander(state, target - state.elapsedS, radius, world);
}
