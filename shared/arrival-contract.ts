/**
 * THE ARRIVAL — putting the visitor where the scene said they arrive, and
 * keeping the curtain down until they are actually standing there.
 *
 * ‼️WE CANNOT WIN THE RACE AGAINST GRAVITY, AND THAT IS THE WHOLE POINT.
 * Nothing of ours runs until the scene bundle has downloaded and evaluated —
 * ~1.8 MB. The Explorer placed the avatar at the spawn point and started
 * gravity long before `main()` existed, and on a sky island the spawn is 80 m
 * up with nothing under it yet. By the time our first frame runs the visitor
 * may already be most of the way to the ground.
 *
 * The boot floor (`boot-floor-contract`) answers the half of this that is a
 * FALL: a pad under the feet, in frame one. It cannot answer the half that is a
 * PLACE. A pad pinned wherever gravity has dragged someone holds them in mid
 * air, forty metres under the island they came for; the punch entry catch then
 * teleports them up seconds later, in full view, which is exactly the
 * "I land on the ground and then get catapulted back" the owner reports.
 *
 * So: restore, then reveal.
 *
 *   1. Read the scene's OWN default spawn point from `getSceneInformation()` —
 *      the Explorer already holds the scene.json, so this is a local RPC and
 *      not a content-server round trip. It is the one piece of "where do I
 *      belong" available before any config is fetched.
 *   2. If the visitor is below it, put them back — repeatedly, because
 *      `movePlayerTo` is routinely declined while the world is still booting —
 *      and stand the boot pad at the spawn so the restore is not undone by the
 *      next tick of gravity.
 *   3. Do not let the arrival cover lift until they have SETTLED there. That is
 *      the "wait long enough" half; without it every fix above just happens
 *      behind a curtain that has already gone up.
 *
 * Every rule is pure and lives here. The engine wiring is `scene/src/arrival.ts`.
 */

/**
 * How far below the spawn point counts as "you fell".
 *
 * Generous on purpose: the Explorer's own spawn ranges are a metre tall and an
 * avatar settling onto a collider dips a few centimetres. Nothing inside this
 * band is worth a teleport.
 */
export const ARRIVAL_FALL_TOLERANCE_M = 1.5;

/** Vertical speed under which the visitor counts as standing, not descending. */
export const ARRIVAL_SETTLE_SPEED_MPS = 0.6;

/** How long they must hold that before the arrival is called landed. */
export const ARRIVAL_SETTLE_MS = 350;

/**
 * Cadence of the restore.
 *
 * ‼️`movePlayerTo` RESOLVES WITH `{ success: false }` WHEN IT IS REFUSED — it
 * does not throw. The first version of this module awaited it inside a
 * try/catch and treated every resolution as a move that happened, so a boot's
 * worth of refusals looked like twenty successful teleports and the budget ran
 * out with the visitor still on the ground. The Explorer refuses the call until
 * the scene is the current one, which on a cold World is seconds, so refusal is
 * the NORMAL early answer and the only correct response is to ask again.
 */
export const ARRIVAL_RESTORE_EVERY_MS = 400;

/**
 * How long the covers may wait on the restore.
 *
 * Short, and separate from the retry window below: a visitor is owed a world
 * eventually even if the Explorer never accepts a move. The gate's own 14 s max
 * hold is still the harder stop.
 */
export const ARRIVAL_HOLD_MS = 20_000;

/**
 * How long we keep ASKING. Far longer than the hold, because the ask is free
 * once the covers are gone and the visitor is in the wrong place until it takes
 * — the punch entry catch has retried for three minutes for exactly this reason
 * and that is the thing that has always eventually worked.
 */
export const ARRIVAL_WINDOW_MS = 180_000;

/** Ceiling on restores, so a scene that can never accept one stops asking. */
export const ARRIVAL_MAX_RESTORES = 240;

export interface ArrivalPoint {
  x: number;
  y: number;
  z: number;
}

function midpoint(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    const nums = value.filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );
    if (nums.length === 0) return null;
    let lo = nums[0];
    let hi = nums[0];
    for (const n of nums) {
      if (n < lo) lo = n;
      if (n > hi) hi = n;
    }
    return (lo + hi) / 2;
  }
  return null;
}

/**
 * The scene's default arrival point, in the same scene-local metres that
 * `Transform.get(engine.PlayerEntity)` reports and `movePlayerTo` accepts.
 *
 * scene.json writes each axis as either a number or a `[min, max]` range; the
 * Explorer picks somewhere inside the box, so the centre is the honest reading.
 * `default: true` wins, then the first point — matching the Explorer's own
 * choice. No spawn points at all returns null, which the runtime reads as
 * "there is nothing to restore", NOT as "hold the curtain".
 */
export function parseArrivalSpawn(
  metadataJson: string | null | undefined,
): ArrivalPoint | null {
  if (!metadataJson) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataJson);
  } catch {
    return null;
  }
  const points = (parsed as { spawnPoints?: unknown })?.spawnPoints;
  if (!Array.isArray(points) || points.length === 0) return null;
  const chosen =
    points.find((p) => (p as { default?: unknown })?.default === true) ?? points[0];
  const position = (chosen as { position?: Record<string, unknown> })?.position;
  if (!position) return null;
  const x = midpoint(position.x);
  const y = midpoint(position.y);
  const z = midpoint(position.z);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

/** Has gravity taken the visitor meaningfully below where they arrived? */
export function hasFallenFromArrival(playerY: number, spawnY: number): boolean {
  if (!Number.isFinite(playerY) || !Number.isFinite(spawnY)) return false;
  return playerY < spawnY - ARRIVAL_FALL_TOLERANCE_M;
}

export function shouldRestoreArrival(input: {
  landed: boolean;
  spawn: ArrivalPoint | null;
  playerY: number | null;
  restores: number;
  ageMs: number;
  sinceRestoreMs: number;
  /**
   * KEEP FLYING was pressed. The island restore is the default for a fly-in;
   * this is the opt-out, and it must latch so a later tick does not recapture.
   */
  optedOut?: boolean;
}): boolean {
  if (input.landed) return false;
  if (input.optedOut) return false;
  if (!input.spawn) return false;
  if (input.playerY === null) return false;
  if (input.ageMs > ARRIVAL_WINDOW_MS) return false;
  if (input.restores >= ARRIVAL_MAX_RESTORES) return false;
  if (input.sinceRestoreMs < ARRIVAL_RESTORE_EVERY_MS) return false;
  return hasFallenFromArrival(input.playerY, input.spawn.y);
}

/**
 * Standing still at the arrival point — the only thing that ends the hold.
 *
 * Height alone is not enough: a visitor passing through the spawn on the way
 * down reads as "at the spawn" for one frame, and calling that an arrival is
 * how a curtain lifts onto a fall already in progress.
 */
export function arrivalIsSettled(input: {
  spawn: ArrivalPoint | null;
  playerY: number | null;
  speedMps: number;
  settledMs: number;
}): boolean {
  if (!input.spawn) return true;
  if (input.playerY === null) return false;
  if (hasFallenFromArrival(input.playerY, input.spawn.y)) return false;
  if (Math.abs(input.speedMps) > ARRIVAL_SETTLE_SPEED_MPS) return false;
  return input.settledMs >= ARRIVAL_SETTLE_MS;
}

/** We have stopped asking — the retry window is spent. */
export function arrivalWindowClosed(ageMs: number): boolean {
  return ageMs > ARRIVAL_WINDOW_MS;
}

/**
 * The covers have waited long enough, whatever happened.
 *
 * Split from the window above on purpose: holding a curtain for three minutes
 * to hide a teleport the Explorer will not accept is a worse arrival than the
 * one we are fixing. The ask continues underneath.
 */
export function arrivalHoldExpired(ageMs: number): boolean {
  return ageMs > ARRIVAL_HOLD_MS;
}
