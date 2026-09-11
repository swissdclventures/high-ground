/**
 * Keep a Scrap knockout on the plaza.
 *
 * `movePlayerTo` during a KO used to aim only at the plot edge (0.5–255).
 * Next to a tower that lands the capsule *inside* the building collider;
 * Explorer then unsticks the guest out the far side — they miss the fall
 * and wake up alone. Clamp the hop to open ground, or crumple in place.
 */

export interface ScrapKoAabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ScrapKoKnockbackInput {
  originX: number;
  originY: number;
  originZ: number;
  foeX: number;
  foeZ: number;
  backM: number;
  upM: number;
  solids: readonly ScrapKoAabb[];
  sceneMin?: number;
  sceneMax?: number;
  /** Extra standoff from a facade, metres. */
  marginM?: number;
  /** Mid-fight shoves can be shorter than a KO hop. */
  minTravelM?: number;
}

export interface ScrapKoKnockbackPlan {
  destX: number;
  destY: number;
  destZ: number;
  apexX: number;
  apexY: number;
  apexZ: number;
  appliedBackM: number;
  appliedLiftM: number;
  /** True when the hop would enter a solid — fold here, do not teleport. */
  stayPut: boolean;
  blocked: boolean;
}

/** Stand off a wall far enough that the capsule cannot kiss the collider. */
export const SCRAP_KO_SOLID_MARGIN_M = 1.25;
/** Shorter than this reads as a twitch, not a fall — crumple instead. */
export const SCRAP_KO_MIN_TRAVEL_M = 0.45;
/**
 * When building outlines are missing we cannot see facades. Cap the hop
 * so a 2.8 m slam cannot punch through a tower we failed to load.
 */
export const SCRAP_KO_BLIND_CAP_M = 1.0;
/** Hard ceiling so a bad caller cannot launch the guest across the plot. */
export const SCRAP_KO_MAX_TRAVEL_M = 3.2;

const SAMPLE_STEP_M = 0.15;

let cachedSolids: ScrapKoAabb[] = [];
let cachedSceneMin = 0.5;
let cachedSceneMax = 255;

export function setScrapKoGround(input: {
  solids: readonly ScrapKoAabb[];
  sceneMin?: number;
  sceneMax?: number;
}): void {
  cachedSolids = input.solids.map((box) => ({ ...box }));
  if (input.sceneMin != null) cachedSceneMin = input.sceneMin;
  if (input.sceneMax != null) cachedSceneMax = input.sceneMax;
}

export function scrapKoGround(): {
  solids: readonly ScrapKoAabb[];
  sceneMin: number;
  sceneMax: number;
} {
  return { solids: cachedSolids, sceneMin: cachedSceneMin, sceneMax: cachedSceneMax };
}


export function scrapKoPointBlocked(
  x: number,
  z: number,
  solids: readonly ScrapKoAabb[],
  margin = SCRAP_KO_SOLID_MARGIN_M
): boolean {
  for (const box of solids) {
    if (
      x >= box.minX - margin &&
      x <= box.maxX + margin &&
      z >= box.minZ - margin &&
      z <= box.maxZ + margin
    ) {
      return true;
    }
  }
  return false;
}

function stayPutPlan(input: ScrapKoKnockbackInput, blocked: boolean): ScrapKoKnockbackPlan {
  return {
    destX: input.originX,
    destY: input.originY,
    destZ: input.originZ,
    apexX: input.originX,
    apexY: input.originY,
    apexZ: input.originZ,
    appliedBackM: 0,
    appliedLiftM: 0,
    stayPut: true,
    blocked,
  };
}

/**
 * Walk the knock-back ray. Stop before the first blocked sample. If that
 * leaves almost no travel, stay put — never aim `movePlayerTo` into a solid.
 */
export function scrapKoKnockbackPlan(input: ScrapKoKnockbackInput): ScrapKoKnockbackPlan {
  const sceneMin = input.sceneMin ?? cachedSceneMin;
  const sceneMax = input.sceneMax ?? cachedSceneMax;
  const margin = input.marginM ?? SCRAP_KO_SOLID_MARGIN_M;
  const solids = input.solids;
  const clamp = (n: number) => Math.max(sceneMin, Math.min(sceneMax, n));

  if (scrapKoPointBlocked(input.originX, input.originZ, solids, margin)) {
    return stayPutPlan(input, true);
  }

  let wantBack = Math.min(SCRAP_KO_MAX_TRAVEL_M, Math.max(0, input.backM));
  let wantLift = Math.max(0, input.upM);
  if (solids.length === 0) {
    wantBack = Math.min(wantBack, SCRAP_KO_BLIND_CAP_M);
    wantLift = 0;
  }

  const dx = input.originX - input.foeX;
  const dz = input.originZ - input.foeZ;
  const len = Math.hypot(dx, dz) || 1;
  const nx = dx / len;
  const nz = dz / len;

  let allowed = 0;
  let blocked = false;
  if (wantBack > 0) {
    const samples = Math.max(1, Math.ceil(wantBack / SAMPLE_STEP_M));
    for (let i = 1; i <= samples; i++) {
      const dist = Math.min(wantBack, i * SAMPLE_STEP_M);
      const rawX = input.originX + nx * dist;
      const rawZ = input.originZ + nz * dist;
      const x = clamp(rawX);
      const z = clamp(rawZ);
      if (Math.abs(x - rawX) > 0.02 || Math.abs(z - rawZ) > 0.02) {
        blocked = true;
        break;
      }
      if (scrapKoPointBlocked(x, z, solids, margin)) {
        blocked = true;
        break;
      }
      allowed = dist;
    }
  }

  const minTravel = input.minTravelM ?? SCRAP_KO_MIN_TRAVEL_M;
  if (allowed < minTravel) {
    return stayPutPlan(input, blocked || wantBack > 0);
  }

  const lift = blocked ? 0 : wantLift;
  const destX = clamp(input.originX + nx * allowed);
  const destZ = clamp(input.originZ + nz * allowed);
  const destY = input.originY;
  const apexX = clamp(input.originX + nx * allowed * 0.5);
  const apexZ = clamp(input.originZ + nz * allowed * 0.5);
  return {
    destX,
    destY,
    destZ,
    apexX,
    apexY: destY + lift,
    apexZ,
    appliedBackM: allowed,
    appliedLiftM: lift,
    stayPut: false,
    blocked,
  };
}

/**
 * Sky-island walk disc. Plaza Scrap leaves this null so a KO still lands on
 * the floor. On a cloud deck, NPC avatars have no physics — a hop past the
 * rope at deck Y is the floating body beside the rail.
 */
export interface ScrapKoDeck {
  centerX: number;
  centerZ: number;
  /** Past this radius there is no floor (the modelled rope). */
  radiusM: number;
  deckY: number;
}

let cachedDeck: ScrapKoDeck | null = null;

export function setScrapKoDeck(deck: ScrapKoDeck | null): void {
  cachedDeck = deck
    ? {
        centerX: deck.centerX,
        centerZ: deck.centerZ,
        radiusM: deck.radiusM,
        deckY: deck.deckY,
      }
    : null;
}

export function scrapKoDeck(): ScrapKoDeck | null {
  return cachedDeck;
}

/** How far past the rope a KO must travel before the drop starts. */
export const SCRAP_KO_RIM_CLEAR_M = 1.35;
/** m/s² — NPC Transform gravity. Snappy enough to read as a fall, not a float. */
export const SCRAP_KO_GRAVITY = 24;
/** Stop the drop once they are this far under the deck; they return later. */
export const SCRAP_KO_DROP_MAX_M = 28;
/**
 * How far below the stone counts as "under the island" for a still-walking NPC.
 *
 * Owner, 2026-09-11: Nico fell through and kept pacing, so his nametag slid
 * left and right under the surface. A KO drop is allowed to go much deeper
 * (`SCRAP_KO_DROP_MAX_M`); this threshold is only for the rescue that puts a
 * WALKING body back on the deck.
 */
export const SCRAP_UNDER_DECK_Y_M = 0.6;
/** Catch someone under the plaza, not a city roamer a block away. */
export const SCRAP_UNDER_DECK_XZ_M = 8;

export function scrapKoPointOffDeck(
  x: number,
  z: number,
  deck: ScrapKoDeck | null = cachedDeck
): boolean {
  if (!deck || deck.radiusM <= 0) return false;
  return Math.hypot(x - deck.centerX, z - deck.centerZ) > deck.radiusM + 0.04;
}

export function scrapKoDropY(deckY: number, airborneS: number): number {
  const s = Math.max(0, airborneS);
  const drop = Math.min(SCRAP_KO_DROP_MAX_M, 0.5 * SCRAP_KO_GRAVITY * s * s);
  return deckY - drop;
}

/** A point back on the stone, same azimuth, inside the rope. */
export function scrapKoReturnPoint(
  x: number,
  z: number,
  deck: ScrapKoDeck | null = cachedDeck
): { x: number; z: number } | null {
  if (!deck || deck.radiusM <= 0) return null;
  const dx = x - deck.centerX;
  const dz = z - deck.centerZ;
  const len = Math.hypot(dx, dz);
  const r = Math.max(0.8, deck.radiusM - 1.35);
  if (len < 0.05) return { x: deck.centerX, z: deck.centerZ + Math.min(1.6, r) };
  const scale = Math.min(1, r / len);
  return { x: deck.centerX + dx * scale, z: deck.centerZ + dz * scale };
}

/**
 * True when an NPC's feet are under the sky island, close enough in x/z that
 * the nametag reads as sliding around on the plaza they are no longer on.
 */
export function scrapNpcIsUnderDeck(args: {
  x: number;
  z: number;
  y: number;
  deck?: ScrapKoDeck | null;
}): boolean {
  const deck = args.deck === undefined ? cachedDeck : args.deck;
  if (!deck || deck.radiusM <= 0) return false;
  if (args.y >= deck.deckY - SCRAP_UNDER_DECK_Y_M) return false;
  return (
    Math.hypot(args.x - deck.centerX, args.z - deck.centerZ) <=
    deck.radiusM + SCRAP_UNDER_DECK_XZ_M
  );
}

/** Snap a walking body back onto the stone. KO drops stay down until they rise. */
export function scrapNpcNeedsDeckRescue(args: {
  x: number;
  z: number;
  y: number;
  dropping: boolean;
  deck?: ScrapKoDeck | null;
}): boolean {
  if (args.dropping) return false;
  return scrapNpcIsUnderDeck(args);
}

export function scrapKoClampToDeck(
  x: number,
  z: number,
  deck: ScrapKoDeck | null = cachedDeck
): { x: number; z: number } {
  if (!deck || deck.radiusM <= 0) return { x, z };
  const dx = x - deck.centerX;
  const dz = z - deck.centerZ;
  const len = Math.hypot(dx, dz);
  const max = Math.max(0.4, deck.radiusM - 0.35);
  if (len <= max) return { x, z };
  return { x: deck.centerX + (dx / len) * max, z: deck.centerZ + (dz / len) * max };
}

export interface ScrapKoFallPlan extends ScrapKoKnockbackPlan {
  overRim: boolean;
}

function rayExitT(
  originX: number,
  originZ: number,
  nx: number,
  nz: number,
  centerX: number,
  centerZ: number,
  exitR: number
): number | null {
  const ox = originX - centerX;
  const oz = originZ - centerZ;
  const b = 2 * (ox * nx + oz * nz);
  const c = ox * ox + oz * oz - exitR * exitR;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sqrt = Math.sqrt(disc);
  const t1 = (-b - sqrt) / 2;
  const t2 = (-b + sqrt) / 2;
  let best: number | null = null;
  for (const t of [t1, t2]) {
    if (t > 0.08 && (best == null || t < best)) best = t;
  }
  return best;
}

function islandEjectPlan(input: ScrapKoKnockbackInput, deck: ScrapKoDeck): ScrapKoFallPlan {
  const awayX = input.originX - input.foeX;
  const awayZ = input.originZ - input.foeZ;
  const fromX = input.originX - deck.centerX;
  const fromZ = input.originZ - deck.centerZ;
  const outward = fromX * awayX + fromZ * awayZ > 0.05;
  let nx: number;
  let nz: number;
  if (outward) {
    const len = Math.hypot(awayX, awayZ) || 1;
    nx = awayX / len;
    nz = awayZ / len;
  } else {
    const olen = Math.hypot(fromX, fromZ);
    if (olen < 0.25) {
      const len = Math.hypot(awayX, awayZ) || 1;
      nx = awayX / len;
      nz = awayZ / len;
    } else {
      nx = fromX / olen;
      nz = fromZ / olen;
    }
  }
  const exitR = deck.radiusM + SCRAP_KO_RIM_CLEAR_M;
  let t = rayExitT(input.originX, input.originZ, nx, nz, deck.centerX, deck.centerZ, exitR);
  if (t == null) t = SCRAP_KO_RIM_CLEAR_M;
  t = Math.min(12, Math.max(t, SCRAP_KO_RIM_CLEAR_M));
  const destX = input.originX + nx * t;
  const destZ = input.originZ + nz * t;
  const destY = input.originY;
  const lift = Math.max(0.45, input.upM);
  return {
    destX,
    destY,
    destZ,
    apexX: input.originX + nx * t * 0.45,
    apexY: destY + lift,
    apexZ: input.originZ + nz * t * 0.45,
    appliedBackM: t,
    appliedLiftM: lift,
    stayPut: false,
    blocked: false,
    overRim: scrapKoPointOffDeck(destX, destZ, deck),
  };
}

/**
 * Plaza: same as `scrapKoKnockbackPlan` (stay on the floor).
 * Sky island: send them past the rope so the next act can drop Y.
 */
export function scrapKoFallPlan(input: ScrapKoKnockbackInput): ScrapKoFallPlan {
  if (!cachedDeck) {
    return { ...scrapKoKnockbackPlan(input), overRim: false };
  }
  return islandEjectPlan(input, cachedDeck);
}
