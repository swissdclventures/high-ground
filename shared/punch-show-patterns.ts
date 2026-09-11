/**
 * THE ARC IS A TWENTY-PIXEL DISPLAY, and it has been painted as one pixel.
 *
 * `PUNCH_WASH_SEGMENTS` is 20: the reaction surface behind the machine is twenty
 * individually addressable panels wrapped round a half cylinder. Every one of
 * them has, until now, been written the SAME colour on the same frame — which is
 * why a punch reads on the big screen as a video transition rather than as
 * something the room did. One flat colour cannot be a reaction; it can only be a
 * cut.
 *
 * So: patterns. A pattern is a PURE FUNCTION of (segment, time, palette, energy)
 * and returns a colour. No assets, no video, no text — the arc-carries-no-text
 * law is untouched, because none of this is readable, all of it is felt. Fifteen
 * patterns against eight palettes, each running forward or backward at a speed
 * taken from the punch, is several hundred distinct looks out of one file that a
 * new entry extends by six lines.
 *
 * Pure and seeded for the same reason the director is: every spectator's arc has
 * to be doing the same thing at the same instant, and a `Math.random()` anywhere
 * in here would put twenty panels of disagreement on the biggest surface on the
 * island.
 *
 * Colours are plain RGB triples in 0..1 rather than `Color4`, so this file stays
 * free of the explorer runtime and can be exercised in vitest. The scene converts
 * once, at the point of paint.
 */

export type Rgb = readonly [number, number, number];

export interface ScreenPalette {
  id: string;
  /** The ground the pattern sits on — usually near-black, never pure black. */
  base: Rgb;
  /** The body colour. */
  mid: Rgb;
  /** The peak. What a segment goes when the pattern points at it. */
  peak: Rgb;
}

/**
 * THE SCREEN IS NOT THE ISLAND. ‼️This file used to say the opposite.
 *
 * The rule here was "the island's own colours, and nothing else — do not add a
 * hue that does not already appear on the island". That was written to kill an
 * invented acid-green/steel/sunrise set the owner rejected on sight, and it did
 * kill it. But it over-corrected: it made the biggest surface in the game a
 * restatement of the cabinet standing in front of it, and the owner's later
 * note is explicit that this is wrong — *"we cannot make the mistake of using
 * the same multiple colours of the environment inside the screen"*. The arc is
 * a DIGITAL LED WALL. Its job is to look like a different kind of object from
 * the candy-plastic clouds it hangs behind.
 *
 * So the register below is deliberately disjoint from the island: saturated
 * emissive primaries on true neutral black, the way an RGB LED panel actually
 * behaves, in the magenta/indigo/electric-blue range that reads as Decentraland
 * rather than as fairground. The island keeps its cyan, gold and cream; the
 * screen never borrows them.
 *
 * ‼️THE BROWN, and why it kept coming back. It was never a chosen colour. A
 * near-black WARM base blended toward a mid orange spends its low range in
 * muddy dark orange, which IS brown, and the ambient floor sat below the ramp
 * knee so most panels lived exactly there. Two rules keep it dead: every base
 * is NEUTRAL (r == g == b, no hue to mud toward), and the ambient energy floor
 * in punch-arena-screen.ts sits ABOVE the knee. Change either and the mud
 * returns.
 *
 * ‼️Index these BY ID (screenPaletteById), never by number. The first set had
 * eight entries and the consumers held hard-coded indices into it; when the
 * list became five, the modulo wrap quietly made tiers 2 and 3 the same colour
 * for months.
 */
export const SCREEN_PALETTES: readonly ScreenPalette[] = [
  // Decentraland's own magenta. The signature, and the screen's home colour.
  { id: "magenta", base: [0.02, 0.02, 0.02], mid: [1, 0.18, 0.42], peak: [1, 0.72, 0.85] },
  // Deep electric violet — the metaverse register, and nothing on the island
  // is this colour now that Boost reads blue and Jinx reads pink.
  { id: "violet", base: [0.02, 0.02, 0.03], mid: [0.55, 0.2, 1], peak: [0.85, 0.72, 1] },
  // Electric blue. Colder and far deeper than the cabinet's cyan, so the two
  // never read as the same light.
  { id: "electric", base: [0.02, 0.02, 0.03], mid: [0.13, 0.45, 1], peak: [0.7, 0.88, 1] },
  // Arena sodium: the floodlight over a ring, not the cabinet's gold.
  { id: "sodium", base: [0.025, 0.025, 0.025], mid: [1, 0.55, 0.08], peak: [1, 0.9, 0.6] },
  // White-hot. The top of the range, where an LED wall simply clips.
  { id: "hot", base: [0.03, 0.03, 0.03], mid: [0.9, 0.93, 1], peak: [1, 1, 1] },
];

/**
 * Look a palette up by NAME. The safe accessor, and the one every consumer
 * should use: an unknown id is a loud undefined rather than a silent wrap onto
 * whatever happens to sit at that index today.
 */
export function screenPaletteById(id: string): ScreenPalette {
  const found = SCREEN_PALETTES.find((palette) => palette.id === id);
  if (!found) throw new Error(`unknown screen palette: ${id}`);
  return found;
}

export const SCREEN_PATTERNS = [
  "solid",
  "meter",
  "chase",
  "ripple",
  "split",
  "strobe",
  "noise",
  "wipe",
  "collapse",
  "bars",
  "gradient",
  "shockwave",
  "heartbeat",
  "drain",
  "sparkle",
] as const;

export type ScreenPatternId = (typeof SCREEN_PATTERNS)[number];

export interface ScreenPaint {
  pattern: ScreenPatternId;
  palette: ScreenPalette;
  /** 0..1 — how hard the pattern is driven. Comes from the punch's heat. */
  energy: number;
  /** Cycles per second. */
  speed: number;
  /** -1 runs the pattern the other way round the arc. */
  direction: 1 | -1;
  /** Per-punch seed for the patterns that need one (noise, sparkle). */
  seed: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/**
 * Base -> mid -> peak in one 0..1 dial, so every pattern shares a ramp.
 *
 * ‼️The knee sits at 0.3, not halfway. An even split spends half of every
 * pattern's range part-way between near-black and the colour, and a half-lit
 * orange is brown — which is exactly what the arc was reported as showing. Low
 * levels now climb to the real hue quickly and the rest of the range is spent
 * going bright, so a panel reads as off or as a colour and never as mud.
 */
function ramp(palette: ScreenPalette, level: number): Rgb {
  const k = clamp01(level);
  return k < 0.3
    ? mix(palette.base, palette.mid, k / 0.3)
    : mix(palette.mid, palette.peak, (k - 0.3) / 0.7);
}

/**
 * A deterministic 0..1 from two integers. Integer-only, hashed on both inputs
 * with different constants before they are combined — adding them straight
 * together aliases, and an aliased noise field reads as diagonal stripes rather
 * than as noise.
 */
function hash01(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Distance from the arc's apex, 0 at centre, 1 at either post. */
function fromCentre(segment: number, segments: number): number {
  return Math.abs((segment + 0.5) / segments - 0.5) * 2;
}

/**
 * One segment's colour, this frame.
 *
 * `t01` is progress through the effect, 0..1 — NOT wall time. The caller owns
 * the clock, so the same pattern can run over 150 ms as a flash or 4 s as a
 * scene without the pattern knowing or caring.
 */
export function screenSegmentColour(
  paint: ScreenPaint,
  segment: number,
  segments: number,
  t01: number,
): Rgb {
  const p = paint.palette;
  const e = clamp01(paint.energy);
  const t = clamp01(t01);
  // Position round the arc, flipped for a reversed run.
  const x = paint.direction === 1 ? (segment + 0.5) / segments : 1 - (segment + 0.5) / segments;
  const phase = t * paint.speed;
  const centre = fromCentre(segment, segments);

  switch (paint.pattern) {
    case "solid":
      return ramp(p, e * (1 - t * 0.35));

    // The arc as a power meter: it fills outward from the apex, so a big punch
    // visibly reaches the posts and a small one never leaves the middle.
    case "meter": {
      const reach = e * (0.35 + 0.65 * Math.min(1, t * 3));
      return centre <= reach ? ramp(p, 0.5 + 0.5 * (1 - centre / Math.max(0.01, reach))) : ramp(p, 0.02);
    }

    // One bright band running round the arc and wrapping.
    case "chase": {
      const head = (phase % 1 + 1) % 1;
      const d = Math.min(Math.abs(x - head), 1 - Math.abs(x - head));
      return ramp(p, e * Math.max(0, 1 - d * 9));
    }

    // A wave leaving the apex and bouncing off the posts.
    case "ripple": {
      const wave = Math.sin((centre * 3 - phase) * Math.PI * 2);
      return ramp(p, e * clamp01(0.25 + wave * 0.75) * (1 - t * 0.5));
    }

    // Two fronts racing from the posts and meeting at the apex.
    case "split": {
      const front = clamp01(phase);
      return centre >= 1 - front ? ramp(p, e) : ramp(p, 0.03);
    }

    // Whole arc, hard on and hard off. The alarm — reserve it for real alarms.
    case "strobe":
      return Math.floor(phase * 2) % 2 ? ramp(p, e) : ramp(p, 0.01);

    // Every panel flickering on its own. Static, interference, a machine losing it.
    case "noise": {
      const step = Math.floor(phase * 12);
      return ramp(p, e * hash01(segment + paint.seed, step));
    }

    // A hard edge crossing the arc once.
    case "wipe": {
      const edge = clamp01(phase);
      return x <= edge ? ramp(p, e * (1 - (edge - x) * 1.5)) : ramp(p, 0.02);
    }

    // Everything drops to nothing, then the whole arc detonates. The one pattern
    // that uses SILENCE as its material.
    //
    // ‼️The fall is FAST and the darkness is SHORT — a fifth of the window, not
    // half of it. The first cut spent 45% of its run fading down and 10% black,
    // which on the biggest punch in the game reads as the screen switching off
    // rather than as a held breath. Contrast only works if the payoff arrives
    // while the eye is still waiting for it.
    case "collapse": {
      if (t < 0.16) return ramp(p, e * (1 - t / 0.16));
      if (t < 0.24) return ramp(p, 0);
      return ramp(p, e * Math.pow(1 - (t - 0.24) / 0.76, 0.35));
    }

    // Alternating panels, marching one step at a time.
    case "bars": {
      const step = Math.floor(phase * 4);
      return (segment + step) % 2 ? ramp(p, e) : ramp(p, 0.04);
    }

    // A colour ramp sliding round the arc — the calm one, for a decent hit.
    case "gradient":
      return ramp(p, e * (0.2 + 0.8 * ((x + phase) % 1)));

    // A narrow hard front leaving the apex, three times over. This is the one
    // that reads as an IMPACT rather than as lighting.
    case "shockwave": {
      const pulses = 3;
      const local = (phase * pulses) % 1;
      const d = Math.abs(centre - local);
      const decay = 1 - Math.floor(phase * pulses) / pulses;
      return ramp(p, e * decay * Math.max(0, 1 - d * 14));
    }

    // Two thumps and a rest. Every panel together — the arc breathing.
    case "heartbeat": {
      const beat = (phase % 1 + 1) % 1;
      const hit = beat < 0.12 ? 1 - beat / 0.12 : beat > 0.2 && beat < 0.32 ? 1 - (beat - 0.2) / 0.12 : 0;
      return ramp(p, e * hit);
    }

    // Fills solid, then empties toward the posts. The comedown.
    case "drain": {
      const level = t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7;
      return centre <= level ? ramp(p, e * level) : ramp(p, 0.02);
    }

    // Individual panels popping white at random. Camera flashes in a crowd.
    case "sparkle": {
      const step = Math.floor(phase * 10);
      const lit = hash01(segment * 31 + paint.seed, step) < 0.18 + e * 0.25;
      return lit ? p.peak : ramp(p, 0.03);
    }
  }
  return ramp(p, e);
}

/** Every segment at once — what the scene actually asks for each frame. */
export function screenFrame(paint: ScreenPaint, segments: number, t01: number): Rgb[] {
  const out: Rgb[] = [];
  for (let i = 0; i < segments; i += 1) out.push(screenSegmentColour(paint, i, segments, t01));
  return out;
}

/** Pick a palette by index, wrapping. Callers pass a seeded draw. */
export function screenPalette(index: number): ScreenPalette {
  const list = SCREEN_PALETTES;
  return list[((index % list.length) + list.length) % list.length]!;
}
