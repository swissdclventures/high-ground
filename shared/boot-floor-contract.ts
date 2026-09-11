/**
 * THE BOOT FLOOR — ground under the visitor's feet in the scene's FIRST frame.
 *
 * A DCL scene's own geometry does not exist at the moment the avatar is placed.
 * On LAND that costs a heartbeat standing on Genesis terrain. In a World there
 * IS no terrain: the visitor is dropped over nothing, and gravity starts before
 * a single collider of ours has been created.
 *
 * Our own boot made that far worse than the platform requires. Every step in
 * `scene/src/index.ts` runs behind `await loadDeployedConfig()` — a `readFile`
 * with a `getSceneInformation` + `fetch` fallback — so the fall lasted a network
 * round-trip rather than a frame, and the punch island's arrival catch then had
 * to teleport the visitor up afterwards. That teleport is what reads as "I start
 * on the ground and get relocated".
 *
 * The pad is the answer to the half of that which is ours: one invisible box,
 * created with no config at all, directly under wherever the platform actually
 * put the player. It is a primitive collider, so it ships in the scene's first
 * CRDT frame instead of waiting on a download.
 *
 * Three rules keep a rescue from becoming scenery:
 *
 *   1. It is placed ONCE, from the first believable player transform, and only
 *      inside the capture window. A pad placed late is a pad at the wrong
 *      height, which is worse than no pad.
 *   2. It is released a settle beat after the scene's own boot finishes — by
 *      then the real colliders exist, and anyone standing on the pad steps
 *      straight onto them.
 *   3. It has a hard life cap, so a boot that never completes cannot leave an
 *      invisible platform across the middle of a published scene.
 *
 * Pure by design: the ECS wiring lives in `scene/src/boot-floor.ts`, and every
 * decision above is testable without an engine.
 */

/**
 * Wide enough to hold the visitor, and no wider.
 *
 * It was 24 m, sized to "catch a spawn ring" — but the ring is +/-0.5 m, and the
 * boot cover locks locomotion while the pad exists, so nobody can walk off their
 * own footprint anyway. On a sky island the difference matters: a 24 m slab at
 * deck height is five times the deck's own 4.85 m radius, so for the settle beat
 * the island would be walkable well past its rail.
 */
export const BOOT_FLOOR_SPAN_M = 6;

/** Thick enough that a fast fall cannot tunnel through it in one physics step. */
export const BOOT_FLOOR_THICK_M = 0.6;

/**
 * How far the pad's TOP sits below the reported player position. DCL reports the
 * avatar's feet, so this is a hair, not a step: any more and the visitor lands
 * visibly lower than the platform placed them.
 */
export const BOOT_FLOOR_TOP_GAP_M = 0.05;

/**
 * How long we keep looking for a player transform. `Transform.getOrNull` on the
 * PlayerEntity is empty for the first frames; past this window the reading has
 * drifted too far from the spawn to be worth standing on.
 */
export const BOOT_FLOOR_CAPTURE_MS = 8_000;

/** Beat between "boot finished" and dropping the pad, so real colliders land first. */
export const BOOT_FLOOR_SETTLE_MS = 1_500;

/** Absolute ceiling. A boot that never finishes must not publish a floating slab. */
export const BOOT_FLOOR_MAX_LIFE_MS = 60_000;

export interface BootFloorReading {
  x: number;
  y: number;
  z: number;
}

/**
 * Is this player transform worth standing a pad on?
 *
 * The origin is rejected on purpose. Before the renderer has sent a real player
 * transform some builds report an all-zero one rather than nothing at all, and
 * a pad built from that sits at y=0 under a scene whose spawn is somewhere else
 * entirely — the one failure mode that would make arrival worse, not better.
 */
export function isUsableBootFloorReading(
  at: BootFloorReading | null | undefined,
): at is BootFloorReading {
  if (!at) return false;
  if (!Number.isFinite(at.x) || !Number.isFinite(at.y) || !Number.isFinite(at.z)) {
    return false;
  }
  if (at.x === 0 && at.y === 0 && at.z === 0) return false;
  return true;
}

/** Centre height for a pad whose top face lands just under the given feet. */
export function bootFloorCenterY(playerY: number): number {
  return playerY - BOOT_FLOOR_TOP_GAP_M - BOOT_FLOOR_THICK_M / 2;
}

export function shouldPlaceBootFloor(input: {
  placed: boolean;
  at: BootFloorReading | null;
  ageMs: number;
}): boolean {
  if (input.placed) return false;
  if (input.ageMs > BOOT_FLOOR_CAPTURE_MS) return false;
  return isUsableBootFloorReading(input.at);
}

/**
 * Nothing was ever caught and the window has closed — stop spending a frame on
 * it. Distinct from a release: there is no pad to remove.
 */
export function shouldAbandonBootFloor(input: {
  placed: boolean;
  ageMs: number;
}): boolean {
  return !input.placed && input.ageMs > BOOT_FLOOR_CAPTURE_MS;
}

export function shouldReleaseBootFloor(input: {
  placed: boolean;
  ageMs: number;
  /** ms since the scene's boot finished, or null while it is still running. */
  sinceBootDoneMs: number | null;
  /**
   * The visitor is still being put back where they arrived — see
   * `@shared/arrival-contract`. A boot that finishes FAST (a cached config, a
   * small scene) reaches the settle beat while `movePlayerTo` is still being
   * declined, and dropping the pad there hands the fall straight back. The
   * arrival latches itself landed at ARRIVAL_WINDOW_MS whatever happens, and
   * BOOT_FLOOR_MAX_LIFE_MS still outranks everything, so this cannot strand a
   * slab in a published scene.
   */
  arrivalPending?: boolean;
}): boolean {
  if (!input.placed) return false;
  if (input.ageMs >= BOOT_FLOOR_MAX_LIFE_MS) return true;
  if (input.arrivalPending) return false;
  if (input.sinceBootDoneMs === null) return false;
  return input.sinceBootDoneMs >= BOOT_FLOOR_SETTLE_MS;
}
