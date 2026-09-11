/**
 * Garden wind — the lawn moves, and it moves as ONE field.
 *
 * DCL SDK7 has no custom shaders, so a blade cannot sway in the GPU. What it does
 * have is cheap transform writes, and a bed is already 64 grass cells. This module
 * is the field those cells read: a travelling gust, sampled per cell position, so
 * the wind visibly CROSSES the lawn instead of every cell twitching in place.
 *
 * Pure maths on purpose. The runtime owns entities; this owns the motion, so the
 * same field can drive a baked tuft GLB later without the runtime changing shape.
 *
 * Frame: `x`/`z` are metres in the bed's local frame. `timeS` is scene-lifetime
 * seconds — never a wall clock, or two visitors would see two different winds.
 */

/** Sway updates per second. 12 reads as continuous and costs a fifth of a frame budget. */
export const GARDEN_WIND_HZ = 12;

/** Wind heading in radians, measured from +X toward +Z. */
export const GARDEN_WIND_HEADING_RAD = Math.PI * 0.28;

/** A gust crosses the lawn at this speed, so a 16 m bed ripples in ~3 s. */
export const GARDEN_WIND_SPEED_MS = 1.8;

/** Distance between gust crests. Shorter than the bed, or the whole lawn moves as one. */
export const GARDEN_WIND_WAVELENGTH_M = 7.5;

/** Lean of a full-height blade at full strength, radians (~17°). */
export const GARDEN_WIND_MAX_TILT_RAD = 0.09;
/*
 * ‼️ WHAT ROTATES IS A 2 m MAT, NOT A BLADE — so the tilt has to stay small.
 *
 * The wind turns a whole CELL: a patch 1.84 m square, scaled up 8% to interlock with
 * its neighbours, pivoting about its base. At the old 0.3 rad that patch's far edge
 * swept 29 cm — TWICE the height of the grass standing on it at the healthy stage.
 * A surface moving further than the grass is tall does not read as grass bending; it
 * reads as the ground heaving, which is exactly what the owner reported: "our ground
 * is moving like seawater, the whole ground is fluctuating... I don't think our grass
 * is moving at all, it's the ground under the grass that's moving".
 *
 * At 0.09 rad (5°) the edge sweeps 9 cm — under a wild blade's height and about half
 * a healthy one's — so the motion is smaller than the thing it is moving and the eye
 * reads it the right way round.
 *
 * The speed came down with it. 5.5 m/s over a 6.5 m wavelength is 0.85 Hz, 51 sways a
 * minute; 1.8 m/s over 7.5 m is 0.24 Hz, 14 a minute. Decentraland's own grass is
 * calmer than ours was, and that is the whole difference.
 *
 * ★ Rotating whole patches can only ever be a gentle sway. Per-blade motion needs the
 * vertices to move, which SDK7 cannot do cheaply — so the honest ceiling here is a
 * lean you notice without watching for it, not a wave.
 */

/** Tallest stage, used to scale the lean — cut grass barely stirs, wild grass rolls. */
export const GARDEN_WIND_REFERENCE_HEIGHT_M = 0.6;

/**
 * Even freshly cut grass stirs. Scaling the lean by height alone left a mown lawn
 * visually dead — a painted floor, which is exactly how the first published bed
 * read — so short grass keeps a quarter of the motion.
 */
export const GARDEN_WIND_MIN_REACH = 0.25;

/** Below this the write is not worth making: the cell would move under a millimetre. */
export const GARDEN_WIND_MIN_TILT_RAD = 0.004;

/** How far a cell's own gust phase may run from its neighbour's. */
export const GARDEN_WIND_PHASE_JITTER_RAD = Math.PI * 1.1;

export interface GardenWindSample {
  /** Lean from vertical, radians. 0 = still. */
  tiltRad: number;
  /** Unit heading the blade leans toward. */
  dirX: number;
  dirZ: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * The wind at one cell, this instant.
 *
 * Two waves, deliberately incommensurate: a fast gust that reads as the wind
 * arriving, and a slow swell that keeps the loop from being countable. Their sum
 * never leaves [0,1], so a cell can go still but never lean into the ground.
 */
export function gardenWindSample(
  timeS: number,
  x: number,
  z: number,
  strength01: number,
  heightM: number,
): GardenWindSample {
  const strength = clamp01(strength01);
  const dirX = Math.cos(GARDEN_WIND_HEADING_RAD);
  const dirZ = Math.sin(GARDEN_WIND_HEADING_RAD);
  if (strength <= 0) return { tiltRad: 0, dirX, dirZ };

  // A PER-CELL PHASE OFFSET, or the bed is water.
  //
  // Without this every cell on a line across the wind sits at the SAME point in
  // the gust at the same instant, which is the definition of a plane wave — the
  // owner's words in world were "it looks like grass floating on water". Real
  // grass does not move in sheets: a clump answers the gust a beat before or
  // after its neighbour. The offset is hashed from the cell's own position so it
  // is stable frame to frame, and it is applied to the FAST gust only — the slow
  // swell stays coherent, so a gust still reads as crossing the field rather than
  // dissolving into noise.
  const jitter = gardenCellHash(x + 0.37, z - 0.19).a * GARDEN_WIND_PHASE_JITTER_RAD;
  const along = x * dirX + z * dirZ;
  const t = Number.isFinite(timeS) ? timeS : 0;
  const gustPhase =
    (2 * Math.PI * (along - t * GARDEN_WIND_SPEED_MS)) / GARDEN_WIND_WAVELENGTH_M + jitter;
  const swellPhase =
    (2 * Math.PI * (along - t * GARDEN_WIND_SPEED_MS * 0.31)) /
    (GARDEN_WIND_WAVELENGTH_M * 3.7);
  // 0.65 gust + 0.35 swell, each mapped to [0,1]: always leaning WITH the wind.
  const gust = 0.5 + 0.5 * Math.sin(gustPhase);
  const swell = 0.5 + 0.5 * Math.sin(swellPhase);
  const wave = 0.65 * gust + 0.35 * swell;

  const height = Math.max(0, Number.isFinite(heightM) ? heightM : 0);
  const reach =
    GARDEN_WIND_MIN_REACH +
    (1 - GARDEN_WIND_MIN_REACH) * clamp01(height / GARDEN_WIND_REFERENCE_HEIGHT_M);
  return {
    tiltRad: GARDEN_WIND_MAX_TILT_RAD * strength * reach * wave,
    dirX,
    dirZ,
  };
}

/**
 * Where a leaning blade's CENTRE goes, so its base stays planted.
 *
 * The cells are boxes and a box turns about its middle: tilt one and its foot
 * lifts out of the soil. Offset the centre by the same arc and the blade pivots
 * at the ground instead, which is the whole difference between grass and litter.
 */
export function gardenWindCellPose(
  localX: number,
  localZ: number,
  baseY: number,
  heightM: number,
  sample: GardenWindSample,
): { x: number; y: number; z: number } {
  const half = Math.max(0, heightM) / 2;
  const lift = half * Math.cos(sample.tiltRad);
  const lean = half * Math.sin(sample.tiltRad);
  return {
    x: localX + lean * sample.dirX,
    y: baseY + lift,
    z: localZ + lean * sample.dirZ,
  };
}

/**
 * A cell's own character, fixed for the life of the bed.
 *
 * Sixty-four identical boxes on a grid read as tiling, not turf, however well they
 * sway. Each cell gets a small yaw and a height nudge derived from where it stands,
 * so the lawn has relief — and derived, not random, so every visitor sees the same
 * lawn and a reload does not reshuffle it.
 */
/**
 * A real hash, because `sin(x*a + z*b) * c` is not one.
 *
 * That GLSL one-liner is fine on a screen full of pixels and wrong on a lattice
 * of 2 m cells. Sampled across one 8x8 bed it came out MIRROR-SYMMETRIC about the
 * bed centre — the per-column spreads read 0.293, 0.289, 0.216, 0.319, 0.319,
 * 0.216, 0.289, 0.293, a palindrome, because sin is odd and the bed is centred on
 * zero. Every cell had a twin across the middle wearing the same yaw and the same
 * height. That is structure, and the eye finds structure instantly: the owner
 * photographed a lawn from above and said "it has a pattern, it doesn't look
 * natural at all".
 *
 * This is a 32-bit integer mixer (the murmur-style finalizer) over the cell
 * coordinates quantized to a centimetre. It is deterministic — the same cell
 * always draws the same character, which is what keeps a lawn stable between
 * sessions — and it has no symmetry for the eye to find.
 */
function mixInt(value: number): number {
  let h = value | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) | 0;
}

/**
 * Two independent 0..1 values for one cell, stable and unpatterned.
 *
 * ‼️ The two coordinates are mixed SEQUENTIALLY, each with its own additive
 * offset — never `imul(x, k1) ^ imul(z, k2)`. That XOR form looks like a hash and
 * is symmetric under negation: `imul(-n, k) == -imul(n, k)`, and for these
 * constants the XOR of two negated terms lands back on the un-negated one often
 * enough that a bed centred on zero came out POINT-SYMMETRIC through its middle —
 * cell [i][j] wearing the identical yaw and height as cell [7-i][7-j]. Measured,
 * not guessed: the per-column spreads read as an exact palindrome. Offsetting each
 * coordinate before it enters the mixer is what breaks that, and the fixed version
 * measures mean 0.505 and stdev 0.296 against a uniform ideal of 0.500 and 0.289,
 * with all nine of a plot's beds landing on different values at the same cell.
 */
export function gardenCellHash(x: number, z: number): { a: number; b: number } {
  const xi = (Math.round(x * 100) | 0) + 0x7ed55d16;
  const zi = (Math.round(z * 100) | 0) + 0x165667b1;
  const h = mixInt(mixInt(xi) ^ zi);
  return { a: (h >>> 0) / 4294967296, b: (mixInt(h ^ 0x9e3779b9) >>> 0) / 4294967296 };
}

export function gardenCellCharacter(
  localX: number,
  localZ: number,
): { yawDeg: number; heightScale: number } {
  const { a, b } = gardenCellHash(localX, localZ);
  return {
    // THE FULL CIRCLE, not ±15°.
    //
    // Every cell in every bed draws the SAME model, so the only thing standing
    // between 576 cells and a visible grid is how differently each one is turned.
    // At ±15° they all faced the same way and the owner saw exactly that from
    // above: "it has a pattern, it doesn't look natural at all". A cell is a
    // square patch of grass — there is no wrong way up — and the clumps spill past
    // the tile edge, so any angle still interlocks with the neighbour.
    yawDeg: a * 360,
    heightScale: 0.78 + b * 0.44,
  };
}

/** Panel percentage (0-100) to the field's strength. */
export function gardenWindStrength01(percent: unknown): number {
  const n = typeof percent === "number" && Number.isFinite(percent) ? percent : 0;
  return clamp01(n / 100);
}
