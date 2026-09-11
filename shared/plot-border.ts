/**
 * PLOT BORDER — the soft edge where your land stops being yours.
 *
 * A plot's paving ends on a ruler line. Stand at the boundary and you get a hard
 * straight cut between your ground and whatever Decentraland draws next door, with a
 * visible seam and, at any elevation difference, a view under your own scene. The
 * owner: "we create a border around each property, each plot, that removes that sharp
 * grass edge and kind of blends it in with a bit of dirt, a bit of irregular unstraight
 * line that would blend in properly with the regular red/green environment around it."
 *
 * So: an APRON of earth around the outward edges. Its outer rim is bare soil, the
 * colour of the ground beyond the fence; its inner rim is the plot's own paving colour;
 * and the line between them wanders, with fingers of soil reaching into the plot and
 * bays of paving reaching out. Nothing about it is straight, so there is no straight
 * line left to notice.
 *
 * ★ IT IS A GRADIENT, NOT A STRIPE. The inner vertices are painted the ground's own
 * colour, so the band does not read as a border drawn ON the plot — it reads as the
 * plot running out. A stripe would add a second hard line one band-width in, which is
 * the very thing being removed.
 *
 * ★ ONLY THE SIDES THAT FACE OUT. A scene is a rectangle here (`SceneLayout` is cols x
 * rows), so within one scene every one of its four sides faces the outside world and
 * every seam BETWEEN its parcels is interior and gets nothing — the apron follows the
 * plot outline, never the parcel grid. What a scene cannot see is another SCENE: if the
 * owner deploys a neighbouring plot of their own, the two aprons would meet and draw a
 * double band of soil straight down the join. That is what `sides` is for — switch off
 * the side that faces your own land and the two plots run together.
 *
 * ★ THE SKIRT IS THE OTHER HALF. "It's not closed so you can see under the ground." A
 * band painted on the surface fixes the line and not the gap, so each outward side also
 * drops a short vertical curtain of the same soil. It is underground wherever the plot
 * sits at the datum, and it is the difference between a floating slab and ground the
 * moment anything raises the plot.
 *
 * Costs about 260 triangles for a whole perimeter and one material, because the colour
 * is in the vertices and there is no texture to load.
 */

export const PLOT_BORDER_VERSION = 1 as const;

export type PlotBorderSide = "north" | "east" | "south" | "west";

export const PLOT_BORDER_SIDES: readonly PlotBorderSide[] = ["north", "east", "south", "west"];

export interface PlotBorderSides {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
}

export interface PlotBorderConfig {
  enabled: boolean;
  /** How far the soil reaches in from the plot edge, metres, at its widest. */
  widthM: number;
  /** #rrggbb of the bare soil at the outer rim. */
  soilColor: string;
  /** How far the curtain drops below the paving, metres. */
  skirtM: number;
  /** Which sides face the outside world. Default: all four. */
  sides: PlotBorderSides;
}

export const PLOT_BORDER_WIDTH_MIN = 0.5;
export const PLOT_BORDER_WIDTH_MAX = 6;

/**
 * ★ THIS COLOUR IS THE WHOLE TRICK, AND IT MUST MATCH THE NEIGHBOUR.
 *
 * The apron's OUTER rim still lies on the plot's dead-straight boundary — nothing may
 * cross it, because the land beyond is not ours to paint. So the straight line does not
 * disappear; it becomes invisible, and only if the soil at the rim is close to whatever
 * Decentraland draws on the other side. Get that wrong and the feature moves the hard
 * line rather than removing it, which is exactly what a first attempt at #6b4a33 did:
 * a dark brown against Genesis red read as a black frame drawn around the plot.
 *
 * The default is Genesis City's own dusty red-brown. On a scene whose surroundings are
 * something else, this is the one field to change.
 */
export const PLOT_BORDER_SOIL_DEFAULT = "#7d5044";

export const PLOT_BORDER_DEFAULT: PlotBorderConfig = {
  enabled: true,
  // Wide enough that the gradient has room to be a gradient. At 2 m on a 48 m plot the
  // apron read as a pinstripe frame, which is a second hard line, not a blend.
  widthM: 4.5,
  soilColor: PLOT_BORDER_SOIL_DEFAULT,
  skirtM: 0.6,
  sides: { north: true, east: true, south: true, west: true },
};

function clampNum(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizePlotBorder(partial: unknown): PlotBorderConfig {
  const p = (partial ?? {}) as Partial<PlotBorderConfig> & { sides?: Partial<PlotBorderSides> };
  const sides = (p.sides ?? {}) as Partial<PlotBorderSides>;
  return {
    // ‼️ ON UNLESS SWITCHED OFF. This shipped as `=== true` — off by default — and no
    // Builder surface ever set it, so the apron existed and no plot had one. The owner,
    // three sessions later: "the gap at the bottom is completely not solved." A fix
    // that nothing can reach is not a fix. Every plot gets its edge now; an owner who
    // deploys a neighbouring plot switches off the side that faces it.
    enabled: p.enabled !== false,
    widthM: clampNum(p.widthM, PLOT_BORDER_DEFAULT.widthM, PLOT_BORDER_WIDTH_MIN, PLOT_BORDER_WIDTH_MAX),
    soilColor:
      typeof p.soilColor === "string" && /^#[0-9a-fA-F]{6}$/.test(p.soilColor)
        ? p.soilColor
        : PLOT_BORDER_SOIL_DEFAULT,
    skirtM: clampNum(p.skirtM, PLOT_BORDER_DEFAULT.skirtM, 0, 4),
    sides: {
      north: sides.north !== false,
      east: sides.east !== false,
      south: sides.south !== false,
      west: sides.west !== false,
    },
  };
}

/**
 * Smooth 1-D value noise on [0, 1].
 *
 * Two octaves: a slow wander that makes the edge wobble across metres, and a faster one
 * that puts fingers and bays into it. A single octave gives a lazy sine that still reads
 * as a designed curve; pure per-sample randomness gives a saw blade. The lattice is
 * hashed with the repo's sequential integer mixer rather than `sin(x * k)`, which is
 * mirror-symmetric on a lattice and lays a visible pattern down a long edge.
 */
export function plotBorderNoise01(seed: number, t: number): number {
  // PERIODIC. The apron is a closed loop, so the lattice wraps at integer frequencies
  // and noise(0) === noise(1). Without that the wobble meets itself at one corner with
  // a step in it — one hard edge left behind by the thing that removes hard edges.
  const octave = (freq: number, salt: number): number => {
    const x = ((t % 1) + 1) % 1 * freq;
    const i = Math.floor(x);
    const f = x - i;
    // Smoothstep, so the band has no corners where lattice cells meet.
    const u = f * f * (3 - 2 * f);
    const a = lattice(seed + salt, ((i % freq) + freq) % freq);
    const b = lattice(seed + salt, ((i + 1) % freq + freq) % freq);
    return a * (1 - u) + b * u;
  };
  return Math.max(0, Math.min(1, octave(5, 0) * 0.62 + octave(13, 0x9e37) * 0.38));
}

function lattice(seed: number, i: number): number {
  let h = (i | 0) + Math.imul(seed | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export interface PlotBorderVertex {
  x: number;
  z: number;
  /** 0 at the outer rim (bare soil), 1 at the inner rim (the plot's own colour). */
  blend: number;
}

export interface PlotBorderStrip {
  side: PlotBorderSide;
  /** Outer/inner pairs in order along the side; triangulate between consecutive pairs. */
  pairs: { outer: PlotBorderVertex; inner: PlotBorderVertex }[];
}

/** One sample of the closed ring: a point on the plot edge and its inward offset. */
export interface PlotBorderRingSample {
  side: PlotBorderSide;
  outer: PlotBorderVertex;
  inner: PlotBorderVertex;
}

export interface PlotBorderPlan {
  /**
   * The apron as ONE closed ring, corners shared.
   *
   * ‼️ It used to be four independent strips and they OVERLAPPED at every corner: two
   * coplanar layers of soil, which z-fought into a black square on each corner of the
   * plot. Four hard artefacts added by the feature whose entire job is removing one. A
   * shared ring cannot overlap itself.
   */
  ring: PlotBorderRingSample[];
  /** Index i means: draw the quad from ring[i] to ring[i+1]. Skips disabled sides. */
  quads: number[];
  strips: PlotBorderStrip[];
  /** Outward sides, as [x0, z0, x1, z1] runs, for the vertical curtain. */
  skirts: { side: PlotBorderSide; x0: number; z0: number; x1: number; z1: number }[];
  triangles: number;
}

/** One sample every ~1.2 m, so the wobble reads without the ring becoming expensive. */
const SAMPLE_SPACING_M = 1.2;

/** Corners reach further, or the soil pinches to a point exactly where two edges meet. */
export const PLOT_BORDER_CORNER_REACH = 1.35;

/**
 * A ceiling on samples per side, because a World may legally be 300 x 300 parcels.
 *
 * At a fixed 1.2 m spacing a 4,800 m side wants 4,000 samples and the apron alone costs
 * 32,000 triangles — more than three parcels' entire budget, spent on an edge nobody is
 * standing at. Past this the spacing simply stretches; a wobble measured in metres is
 * invisible from the distance you view a plot that size from anyway.
 */
const MAX_SAMPLES_PER_SIDE = 256;

/** Segments in a corner's round join. Four is enough for a 90° turn to read as a curve. */
const CORNER_STEPS = 4;

/**
 * Plan the apron for a plot of `width` x `depth` metres, centred on the origin.
 *
 * ONE CLOSED RING. Each corner point belongs to both of its sides and exists once, so
 * no two pieces of soil are ever stacked on the same square millimetre. Deterministic
 * from `seed`, so the Builder preview and the exported GLB agree and a republish does
 * not reshuffle the edge under a returning visitor.
 */
export function planPlotBorder(
  width: number,
  depth: number,
  config: PlotBorderConfig,
  seed = 1
): PlotBorderPlan {
  const plan: PlotBorderPlan = { ring: [], quads: [], strips: [], skirts: [], triangles: 0 };
  if (!config.enabled || config.widthM <= 0) return plan;
  const hw = width / 2;
  const hd = depth / 2;

  // Walk the perimeter once: north (W->E), east (N->S), south (E->W), west (S->N). Each
  // side contributes t in [0, 1) — its closing corner is the NEXT side's first sample,
  // which is what makes the ring share corners instead of doubling them.
  const legs: { side: PlotBorderSide; from: [number, number]; to: [number, number]; inward: [number, number] }[] = [
    { side: "north", from: [-hw, -hd], to: [hw, -hd], inward: [0, 1] },
    { side: "east", from: [hw, -hd], to: [hw, hd], inward: [-1, 0] },
    { side: "south", from: [hw, hd], to: [-hw, hd], inward: [0, -1] },
    { side: "west", from: [-hw, hd], to: [-hw, -hd], inward: [1, 0] },
  ];
  const perimeter = 2 * (width + depth);
  let travelled = 0;

  for (let l = 0; l < legs.length; l += 1) {
    const leg = legs[l]!;
    const prev = legs[(l + 3) % 4]!;
    const legLen = Math.hypot(leg.to[0] - leg.from[0], leg.to[1] - leg.from[1]);
    const steps = Math.max(2, Math.min(MAX_SAMPLES_PER_SIDE, Math.round(legLen / SAMPLE_SPACING_M)));

    // ‼️ A CORNER IS A ROUND JOIN, NOT A MITRE.
    //
    // Offsetting a 90° corner by a single mitred point puts that point further back
    // along the previous side than the previous sample's own inner point — so the quad
    // between them runs backwards on its inner edge and folds into a bowtie. Two per
    // corner, eight per plot, each rendering as a black notch. (Measured, not guessed:
    // the two triangles of those quads wound opposite ways.)
    //
    // A fan fixes it exactly. Every fan sample shares the corner as its OUTER point and
    // sweeps its inner point through the quarter turn, so the soil rounds the corner and
    // no quad can invert.
    const tCorner = travelled / perimeter;
    const rCorner = config.widthM * (0.34 + 0.66 * plotBorderNoise01(seed, tCorner)) * PLOT_BORDER_CORNER_REACH;
    const a0 = Math.atan2(prev.inward[1], prev.inward[0]);
    let sweep = Math.atan2(leg.inward[1], leg.inward[0]) - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    for (let j = 0; j <= CORNER_STEPS; j += 1) {
      const u = j / CORNER_STEPS;
      const ang = a0 + sweep * u;
      plan.ring.push({
        // The first half of the turn still belongs to the side arriving, the second to
        // the side leaving, so switching one side off leaves half the corner behind it.
        side: u < 0.5 ? prev.side : leg.side,
        outer: { x: leg.from[0], z: leg.from[1], blend: 0 },
        inner: {
          x: leg.from[0] + Math.cos(ang) * rCorner,
          z: leg.from[1] + Math.sin(ang) * rCorner,
          blend: 1,
        },
      });
    }

    // The straight run. k starts at 1 because k = 0 IS the corner the fan just covered.
    for (let k = 1; k < steps; k += 1) {
      const f = k / steps;
      const x = leg.from[0] + (leg.to[0] - leg.from[0]) * f;
      const z = leg.from[1] + (leg.to[1] - leg.from[1]) * f;
      // t runs 0..1 once round the whole plot, so the noise is continuous across every
      // corner and the wobble never restarts.
      const t = (travelled + legLen * f) / perimeter;
      // Never less than a third of the width, or the soil pinches out and the straight
      // paving edge shows through the gap — the defect, back again in miniature.
      const reach = config.widthM * (0.34 + 0.66 * plotBorderNoise01(seed, t));
      plan.ring.push({
        side: leg.side,
        outer: { x, z, blend: 0 },
        inner: { x: x + leg.inward[0] * reach, z: z + leg.inward[1] * reach, blend: 1 },
      });
    }
    travelled += legLen;
  }

  // A quad spans ring[i] -> ring[i+1]. It is drawn only when the side it belongs to
  // faces outward, which is how a plot joined to the owner's own land next door leaves
  // that join bare instead of painting a double band of mud down it.
  for (let i = 0; i < plan.ring.length; i += 1) {
    const a = plan.ring[i]!;
    const b = plan.ring[(i + 1) % plan.ring.length]!;
    // The segment belongs to the side it STARTS on; at a corner that is the new side.
    const side = a.side === b.side ? a.side : b.side;
    if (!config.sides[side]) continue;
    plan.quads.push(i);
    plan.triangles += 2;
  }

  // The curtain: what stops you seeing under your own land the moment anything lifts it.
  if (config.skirtM > 0) {
    for (const leg of legs) {
      if (!config.sides[leg.side]) continue;
      plan.skirts.push({ side: leg.side, x0: leg.from[0], z0: leg.from[1], x1: leg.to[0], z1: leg.to[1] });
      plan.triangles += 2;
    }
  }

  // `strips` is kept as a per-side view of the same ring for tests and tooling that ask
  // "what does the north edge look like" — it is never triangulated, so it cannot
  // reintroduce the overlap the ring exists to remove.
  for (const side of PLOT_BORDER_SIDES) {
    if (!config.sides[side]) continue;
    const pairs = plan.ring.filter((r) => r.side === side).map((r) => ({ outer: r.outer, inner: r.inner }));
    if (pairs.length > 1) plan.strips.push({ side, pairs });
  }
  return plan;
}
