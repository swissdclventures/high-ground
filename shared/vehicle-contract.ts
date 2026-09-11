/**
 * Plot vehicles — Vehicles app (swissverse.vehicles).
 *
 * Hull is a slot: `primitives` (starter hover-pod) or `glb` (Eclipse Cruiser,
 * Metaverse Cadillac, …). Drive math is pure so tests pin arcade motion without the SDK.
 * Live pose is published through the host CRDT (`syncEntity`), same channel as NPCs.
 */

export const VEHICLE_CONTRACT_VERSION = 1 as const;

/** Footprint disc used for plot clearance (must clear buildings, not just the centre). */
export const HOVER_POD_RADIUS_M = 3.2;

export const HOVER_POD = {
  length: 4.4,
  width: 2.2,
  height: 1.35,
  radius: HOVER_POD_RADIUS_M,
  hoverY: 0.55,
  seat: { x: 0, y: 1.08, z: 0.28 },
  cruiseMps: 14,
  reverseMps: 7.5,
  turnRateDeg: 95,
} as const;

export const ECLIPSE_CRUISER_SRC = "models/eclipse-cruiser.glb";
export const METAVERSE_CADILLAC_SRC = "models/metaverse-cadillac-cabrio.glb";

export const VEHICLE_SEAT_IDS = [
  "driver_front_left",
  "passenger_front_right",
  "passenger_rear_left",
  "passenger_rear_right",
] as const;

export type VehicleSeatId = (typeof VEHICLE_SEAT_IDS)[number];

export const DRIVER_SEAT_ID: VehicleSeatId = "driver_front_left";

export interface VehicleSeatLocal {
  id: VehicleSeatId;
  x: number;
  y: number;
  z: number;
}

export const ECLIPSE_CRUISER = {
  // Measured from the shipped GLB (assets/vehicles/eclipse-cruiser.asset.json). The pointer
  // catcher derives its volume from these, so an overstated width would capture clicks off
  // the hull and steal Board hover from a guest standing beside the car.
  length: 5.74,
  width: 2.56,
  height: 1.48,
  radius: HOVER_POD_RADIUS_M,
  // Hover-pod ground clearance. 0.55 floated the whole car chest-high; the pods now skim.
  hoverY: 0.3,
  // A hover car that crawls reads as broken. Raised after the first real drive in-world.
  cruiseMps: 26,
  reverseMps: 12,
  turnRateDeg: 80,
  /**
   * Cushion height in the GLB, measured at build (assets/vehicles/eclipse-cruiser.asset.json).
   */
  cushionY: 0.68,
  /**
   * Sit pads for the procedural coupe. y is the live-avatar teleport (and remote puppet
   * origin) — same as the cushion. Hide + cabin cam take over on sit for the closed roof.
   */
  seats: {
    driver_front_left: { x: -0.53, y: 0.68, z: 0.55 },
    passenger_front_right: { x: 0.53, y: 0.68, z: 0.55 },
    passenger_rear_left: { x: -0.53, y: 0.68, z: -0.45 },
    passenger_rear_right: { x: 0.53, y: 0.68, z: -0.45 },
  },
  /** Shift multiplies cruise. The label promises a boost, so there has to be one. */
  boostFactor: 2.4,
} as const;

/** Cherry-red / cyan cabrio extracted from the owner's metaverse scene GLB. */
export const METAVERSE_CADILLAC = {
  length: 5.73,
  width: 2.69,
  height: 3.0,
  radius: HOVER_POD_RADIUS_M,
  hoverY: 0.35,
  cruiseMps: 24,
  reverseMps: 10,
  turnRateDeg: 85,
  cushionY: 1.08,
  seats: {
    // Mirrored for the 180° hull yaw in eclipse-vehicle-hull (Explorer faces this GLB opposite the Eclipse).
    driver_front_left: { x: -0.42, y: 0.9, z: 0.45 },
    passenger_front_right: { x: 0.42, y: 0.9, z: 0.45 },
  },
  boostFactor: 2.2,
} as const;

export type VehicleHull = { kind: "primitives" } | { kind: "glb"; src: string };

export interface VehicleSpec {
  id: string;
  name: string;
  /**
   * DCL scene metres, SW origin — the same frame as `spawn`.
   * Do not store composer-centred coordinates here.
   */
  x: number;
  z: number;
  /** Yaw in degrees. 0 faces +Z. */
  yaw: number;
  hoverY: number;
  hull: VehicleHull;
  seat: { x: number; y: number; z: number };
  cruiseMps: number;
  reverseMps: number;
  turnRateDeg: number;
  /** Shift multiplier. Absent falls back to the Cruiser's. */
  boostFactor?: number;
}

export interface VehicleDriveInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  /** Shift. Multiplies cruise by `boostFactor` — the HUD promises this, so it must exist. */
  boost?: boolean;
}

export interface VehiclePose {
  x: number;
  z: number;
  yaw: number;
}

export interface VehicleBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface VehicleObstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface VehicleBlockers {
  radius: number;
  obstacles: readonly VehicleObstacle[];
}

const IDLE_DRIVE: VehicleDriveInput = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  boost: false,
};

/** True while any drive key is down. */
export function driveInputHeld(input: VehicleDriveInput): boolean {
  return input.forward || input.backward || input.left || input.right;
}

/**
 * Boarding inherits the walk key. Ignore WASD until the stick goes quiet once,
 * then accept fresh presses.
 */
export function gateHeldDriveInput(
  raw: VehicleDriveInput,
  armed: boolean
): { input: VehicleDriveInput; armed: boolean } {
  if (armed) return { input: raw, armed: true };
  if (driveInputHeld(raw)) return { input: IDLE_DRIVE, armed: false };
  return { input: IDLE_DRIVE, armed: true };
}

/**
 * Move a parked craft out of a building it was placed inside.
 *
 * A recipe stores where a craft was dropped, and nothing has ever checked that against the
 * towers the district solver later placed. The Eclipse shipped at (380, 360), which is inside
 * tower_12's footprint (x 376..404, z 332..360) -- the car was in the world the whole time,
 * standing in a lobby where nobody could see it. Same class of bug as a district validator with
 * no solver: the data was "valid", it just was not reachable.
 *
 * Searches outward on a ring so the craft ends up in the nearest open street rather than
 * teleported to some arbitrary corner, and gives up gracefully rather than moving it off-plot.
 */
export function freeParkingSpot(
  pose: VehiclePose,
  bounds: VehicleBounds,
  blockers: VehicleBlockers
): VehiclePose {
  const blocked = (x: number, z: number): boolean =>
    x < bounds.minX ||
    x > bounds.maxX ||
    z < bounds.minZ ||
    z > bounds.maxZ ||
    blockers.obstacles.some((box) => vehicleHitsObstacle(x, z, blockers.radius, box));
  if (!blocked(pose.x, pose.z)) return pose;
  const STEP_M = 2;
  const MAX_RINGS = 40;
  for (let ring = 1; ring <= MAX_RINGS; ring += 1) {
    const r = ring * STEP_M;
    // 16 headings per ring is dense enough that a 4 m street is never stepped over.
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      const x = pose.x + Math.cos(angle) * r;
      const z = pose.z + Math.sin(angle) * r;
      if (!blocked(x, z)) return { x, z, yaw: pose.yaw };
    }
  }
  return pose;
}

/**
 * Where a rider should be put down when they step out.
 *
 * Exit used to always step out to the car's LEFT. Park in a corner and that side is a wall, so
 * the guest was dropped inside a tower or off the plot -- the other half of "I can't get out".
 * Sides are tried in order of politeness (left, right, behind, in front) and the first CLEAR
 * one wins; if the car is genuinely boxed in on all four, the least-bad side is used rather
 * than refusing to let go of the guest.
 */
export function clearExitSpot(
  pose: VehiclePose,
  bounds: VehicleBounds,
  blockers: VehicleBlockers,
  offsetM = 2.6
): { x: number; z: number } {
  const fwd = vehicleForward(pose.yaw);
  const right = { x: fwd.z, z: -fwd.x };
  const sides = [
    { x: -right.x, z: -right.z },
    { x: right.x, z: right.z },
    { x: -fwd.x, z: -fwd.z },
    { x: fwd.x, z: fwd.z },
  ];
  let best: { x: number; z: number } | null = null;
  let bestDepth = Number.POSITIVE_INFINITY;
  for (const side of sides) {
    const x = pose.x + side.x * offsetM;
    const z = pose.z + side.z * offsetM;
    const offPlot = x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ;
    let depth = offPlot ? 1000 : 0;
    for (const box of blockers.obstacles) depth += obstaclePenetration(x, z, blockers.radius, box);
    if (depth <= 0) return { x, z };
    if (depth < bestDepth) {
      bestDepth = depth;
      best = { x, z };
    }
  }
  return best ?? { x: pose.x, z: pose.z };
}

/**
 * Metres by which a point sits inside an obstacle's clearance band, 0 when clear. The band is
 * the box grown by `radius` on every side; depth is the smallest distance to any of its four
 * edges, i.e. how far the car would have to move to get out.
 */
export function obstaclePenetration(
  x: number,
  z: number,
  radius: number,
  box: VehicleObstacle
): number {
  const m = Math.max(0.4, radius);
  const dx = Math.min(x - (box.minX - m), box.maxX + m - x);
  const dz = Math.min(z - (box.minZ - m), box.maxZ + m - z);
  if (dx <= 0 || dz <= 0) return 0;
  return Math.min(dx, dz);
}

export function vehicleHitsObstacle(
  x: number,
  z: number,
  radius: number,
  box: VehicleObstacle
): boolean {
  const m = Math.max(0.4, radius);
  return x >= box.minX - m && x <= box.maxX + m && z >= box.minZ - m && z <= box.maxZ + m;
}

export function defaultHoverPodSpec(
  partial: Partial<VehicleSpec> & Pick<VehicleSpec, "id" | "x" | "z">
): VehicleSpec {
  return {
    id: partial.id,
    name: partial.name ?? "Hover pod",
    x: partial.x,
    z: partial.z,
    yaw: partial.yaw ?? 0,
    hoverY: partial.hoverY ?? HOVER_POD.hoverY,
    hull: partial.hull ?? { kind: "primitives" },
    seat: partial.seat ?? { ...HOVER_POD.seat },
    cruiseMps: partial.cruiseMps ?? HOVER_POD.cruiseMps,
    reverseMps: partial.reverseMps ?? HOVER_POD.reverseMps,
    turnRateDeg: partial.turnRateDeg ?? HOVER_POD.turnRateDeg,
  };
}

export function defaultEclipseCruiserSpec(
  partial: Partial<VehicleSpec> & Pick<VehicleSpec, "id" | "x" | "z">
): VehicleSpec {
  return {
    id: partial.id,
    name: partial.name ?? "Eclipse Cruiser",
    x: partial.x,
    z: partial.z,
    yaw: partial.yaw ?? 0,
    hoverY: partial.hoverY ?? ECLIPSE_CRUISER.hoverY,
    hull: partial.hull ?? { kind: "glb", src: ECLIPSE_CRUISER_SRC },
    seat: partial.seat ?? { ...ECLIPSE_CRUISER.seats.driver_front_left },
    cruiseMps: partial.cruiseMps ?? ECLIPSE_CRUISER.cruiseMps,
    reverseMps: partial.reverseMps ?? ECLIPSE_CRUISER.reverseMps,
    turnRateDeg: partial.turnRateDeg ?? ECLIPSE_CRUISER.turnRateDeg,
  };
}

export function defaultMetaverseCadillacSpec(
  partial: Partial<VehicleSpec> & Pick<VehicleSpec, "id" | "x" | "z">
): VehicleSpec {
  return {
    id: partial.id,
    name: partial.name ?? "Metaverse Cadillac",
    x: partial.x,
    z: partial.z,
    yaw: partial.yaw ?? 0,
    hoverY: partial.hoverY ?? METAVERSE_CADILLAC.hoverY,
    hull: partial.hull ?? { kind: "glb", src: METAVERSE_CADILLAC_SRC },
    seat: partial.seat ?? { ...METAVERSE_CADILLAC.seats.driver_front_left },
    cruiseMps: partial.cruiseMps ?? METAVERSE_CADILLAC.cruiseMps,
    reverseMps: partial.reverseMps ?? METAVERSE_CADILLAC.reverseMps,
    turnRateDeg: partial.turnRateDeg ?? METAVERSE_CADILLAC.turnRateDeg,
  };
}

/** Dimensions + seats for a GLB hull src (Eclipse vs Cadillac). */
export function glbVehicleProfile(src: string): typeof ECLIPSE_CRUISER | typeof METAVERSE_CADILLAC {
  return src.includes("cadillac") ? METAVERSE_CADILLAC : ECLIPSE_CRUISER;
}

export function normalizeVehicleHull(raw: unknown): VehicleHull {
  if (!raw || typeof raw !== "object") return { kind: "primitives" };
  const rec = raw as Record<string, unknown>;
  if (rec.kind === "glb" && typeof rec.src === "string" && rec.src.trim()) {
    return { kind: "glb", src: rec.src.trim() };
  }
  return { kind: "primitives" };
}

export function normalizeVehicleSpec(raw: unknown): VehicleSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === "string" ? rec.id.trim() : "";
  if (!id) return null;
  const x = Number(rec.x);
  const z = Number(rec.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const seatRaw = rec.seat && typeof rec.seat === "object" ? (rec.seat as Record<string, unknown>) : {};
  const hull = normalizeVehicleHull(rec.hull);
  const glb = hull.kind === "glb";
  const profile = glb ? glbVehicleProfile(hull.src) : null;
  const driver = profile ? profile.seats.driver_front_left : HOVER_POD.seat;
  return {
    id,
    name:
      typeof rec.name === "string" && rec.name.trim()
        ? rec.name.trim()
        : glb
          ? hull.src.includes("cadillac")
            ? "Metaverse Cadillac"
            : "Eclipse Cruiser"
          : "Hover pod",
    x,
    z,
    yaw: Number.isFinite(Number(rec.yaw)) ? Number(rec.yaw) : 0,
    // Ground clearance and the rider anchor are facts about the MODEL, not about this parking
    // spot, so for a GLB hull the contract wins and any baked copy in the recipe is ignored.
    hoverY: profile
      ? profile.hoverY
      : Number.isFinite(Number(rec.hoverY))
        ? Number(rec.hoverY)
        : HOVER_POD.hoverY,
    hull,
    seat: profile
      ? { ...driver }
      : {
          x: Number.isFinite(Number(seatRaw.x)) ? Number(seatRaw.x) : driver.x,
          y: Number.isFinite(Number(seatRaw.y)) ? Number(seatRaw.y) : driver.y,
          z: Number.isFinite(Number(seatRaw.z)) ? Number(seatRaw.z) : driver.z,
        },
    cruiseMps: profile
      ? profile.cruiseMps
      : Number.isFinite(Number(rec.cruiseMps))
        ? Number(rec.cruiseMps)
        : HOVER_POD.cruiseMps,
    reverseMps: profile
      ? profile.reverseMps
      : Number.isFinite(Number(rec.reverseMps))
        ? Number(rec.reverseMps)
        : HOVER_POD.reverseMps,
    turnRateDeg: profile
      ? profile.turnRateDeg
      : Number.isFinite(Number(rec.turnRateDeg))
        ? Number(rec.turnRateDeg)
        : HOVER_POD.turnRateDeg,
    boostFactor: profile?.boostFactor ?? ECLIPSE_CRUISER.boostFactor,
  };
}

export function normalizeVehicleList(raw: unknown): VehicleSpec[] {
  if (!Array.isArray(raw)) return [];
  const out: VehicleSpec[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const spec = normalizeVehicleSpec(item);
    if (!spec || seen.has(spec.id)) continue;
    seen.add(spec.id);
    out.push(spec);
  }
  return out;
}

function wrapYaw(deg: number): number {
  let next = deg % 360;
  if (next < 0) next += 360;
  return next;
}

/** Heading at yaw 0 is +Z (DCL default). Positive yaw turns toward +X. */
export function vehicleForward(yawDeg: number): { x: number; z: number } {
  const rad = (yawDeg * Math.PI) / 180;
  return { x: Math.sin(rad), z: Math.cos(rad) };
}

/** Every sit pad this hull offers. Eclipse is four seats; Cadillac cabrio is two; hover-pod is one. */
export function vehicleSeatLocals(spec: Pick<VehicleSpec, "hull" | "seat">): VehicleSeatLocal[] {
  if (spec.hull.kind === "glb") {
    const profile = glbVehicleProfile(spec.hull.src);
    return (Object.keys(profile.seats) as VehicleSeatId[]).map((id) => ({
      id,
      ...profile.seats[id as keyof typeof profile.seats],
    }));
  }
  return [{ id: DRIVER_SEAT_ID, ...spec.seat }];
}

export function vehicleSeatWorldAt(
  spec: Pick<VehicleSpec, "hoverY">,
  pose: VehiclePose,
  seat: Pick<VehicleSeatLocal, "x" | "y" | "z">
): { x: number; y: number; z: number } {
  const fwd = vehicleForward(pose.yaw);
  const right = { x: fwd.z, z: -fwd.x };
  return {
    x: pose.x + fwd.x * seat.z + right.x * seat.x,
    y: spec.hoverY + seat.y,
    z: pose.z + fwd.z * seat.z + right.z * seat.x,
  };
}

export function vehicleSeatWorld(
  spec: Pick<VehicleSpec, "hoverY" | "seat">,
  pose: VehiclePose
): { x: number; y: number; z: number } {
  return vehicleSeatWorldAt(spec, pose, spec.seat);
}

export function nextVehiclePose(
  pose: VehiclePose,
  input: VehicleDriveInput,
  dt: number,
  spec: Pick<VehicleSpec, "cruiseMps" | "reverseMps" | "turnRateDeg"> & { boostFactor?: number },
  bounds: VehicleBounds,
  blockers?: VehicleBlockers
): VehiclePose {
  const step = Math.max(0, Math.min(0.1, dt));
  let yaw = pose.yaw;
  if (input.left) yaw -= spec.turnRateDeg * step;
  if (input.right) yaw += spec.turnRateDeg * step;
  yaw = wrapYaw(yaw);

  let speed = 0;
  const boost = input.boost ? (spec.boostFactor ?? ECLIPSE_CRUISER.boostFactor) : 1;
  if (input.forward) speed += spec.cruiseMps * boost;
  if (input.backward) speed -= spec.reverseMps;
  const fwd = vehicleForward(yaw);
  let x = pose.x + fwd.x * speed * step;
  let z = pose.z + fwd.z * speed * step;
  x = Math.max(bounds.minX, Math.min(bounds.maxX, x));
  z = Math.max(bounds.minZ, Math.min(bounds.maxZ, z));
  if (blockers?.obstacles.length) {
    const radius = blockers.radius;
    // How deep inside the clearance bands a point sits (0 = clear). Used instead of a plain
    // yes/no so a car that IS already inside a band can still drive OUT of it. With a boolean
    // test every candidate from a wedged position is "blocked" -- including the one that leads
    // to freedom -- and the owner reported exactly that: cornered, S does nothing, stuck.
    const depth = (nx: number, nz: number): number => {
      let total = 0;
      for (const box of blockers.obstacles) total += obstaclePenetration(nx, nz, radius, box);
      return total;
    };
    const here = depth(pose.x, pose.z);
    const clear = (nx: number, nz: number): boolean => depth(nx, nz) <= 0;
    // Already inside a band: any move that does not go DEEPER is allowed. Not just "shallower"
    // -- depth is the distance to the nearest edge, and the nearest edge may be the one the
    // plot boundary is pressed against, so a lawful slide along the band toward the open end
    // keeps the same depth for metres. Forbidding that is the wedge. Deeper is still refused,
    // and a clear car can still never enter a band at all.
    const notDeeper = (nx: number, nz: number): boolean => depth(nx, nz) <= here + 1e-6;
    const ok = (nx: number, nz: number): boolean => clear(nx, nz) || (here > 0 && notDeeper(nx, nz));
    if (!ok(x, z)) {
      if (ok(x, pose.z)) z = pose.z;
      else if (ok(pose.x, z)) x = pose.x;
      else {
        x = pose.x;
        z = pose.z;
      }
    }
  }
  return { x, z, yaw };
}

/** Composer-frame pose for the Builder 3D preview (plot centre = 0,0). */
export function vehiclePreviewPose(
  spec: VehicleSpec,
  layout: { cols: number; rows: number },
  parcelSize = 16
): { x: number; y: number; z: number; yawRad: number } {
  const width = layout.cols * parcelSize;
  const depth = layout.rows * parcelSize;
  return {
    x: spec.x - width / 2,
    y: spec.hoverY,
    z: spec.z - depth / 2,
    yawRad: -(spec.yaw * Math.PI) / 180,
  };
}

export interface VehiclesAppConfig {
  enabled: boolean;
  parked: boolean;
  neonGlider: boolean;
  /**
   * Access is granted by the current World. Kept explicit so a future federation
   * entitlement can be added without changing the personal-board runtime.
   */
  accessScope: "world";
}

export function defaultVehiclesAppConfig(): VehiclesAppConfig {
  // Sit-in cars (Eclipse / Cadillac) are retired. Vehicles app = Neon Glider only.
  return { enabled: true, parked: false, neonGlider: true, accessScope: "world" };
}

export function normalizeVehiclesAppConfig(raw?: Partial<VehiclesAppConfig> | null): VehiclesAppConfig {
  return {
    enabled: raw?.enabled === true,
    // Always off — parked hulls stay in the codebase for a later return, never ship live.
    parked: false,
    neonGlider: raw?.neonGlider !== false,
    // Federation access is intentionally not implemented yet. The active World grants access.
    accessScope: "world",
  };
}
