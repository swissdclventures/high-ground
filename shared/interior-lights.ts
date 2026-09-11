/**
 * Interior lights — the per-floor "switch the lights on" attribute.
 *
 * Why this exists: a district ships with `noEmissive: true` (owner, 2026-08-12), so
 * NOTHING in it emits. The only light in nineteen towers came from the gallery app's
 * picture lamps, which is why one lobby glowed and the rest of the city read as a power
 * cut. Lighting a floor should not require hanging artwork in it.
 *
 * TWO LAYERS, because DCL gives you two and they solve different halves of the problem:
 *
 *  1. SOFFIT — emissive geometry. A thin warm band inset behind the glass just under the
 *     ceiling. Emission costs nothing from the light budget and renders at ANY distance,
 *     so this is the layer that makes a tower read as inhabited from across the plot.
 *     It does not illuminate anything; it is a light you SEE, not a light that LIGHTS.
 *  2. LAMPS — real SDK7 `LightSource` points, a few per lit floor. These actually light
 *     the room you walk into. They cannot do layer 1's job: the Explorer keeps only the
 *     nearest 4–10 lights in the entire scene, so past a few metres they are simply gone.
 *
 * THE EYE-PAIN RULE. Emission is safe on small surfaces set back from the eye and lethal
 * on the ceiling plane above the player's head — a 0.18 ceiling read as a lamp in-world,
 * and thirteen jump pads at 2.1 lit the whole plot. So the soffit is a BAND, not a plane;
 * it is INSET behind the glass; it faces inward and down; and its intensity is hard-capped
 * at a fraction of the ceiling value that already failed. `INTERIOR_LIGHT_MAX_EMISSIVE`
 * is the ceiling on the whole feature and nothing may raise it — a test pins it.
 *
 * Pure data + arithmetic, no three.js, so the composer, the publish path and the tests
 * can all import it without init-order races.
 */

/** Per-floor entry. Absent floor = unlit, which is the default for every building. */
export interface InteriorLightSpec {
  /** Floor index this lights, 0 = ground. */
  floor: number;
  /** 0..1. 0 is off; the district ground-floor default is 0.55. */
  level: number;
  /**
   * 0..1 on the cool→warm axis. 0 is a pale office white, 1 is deep amber.
   * Default `INTERIOR_LIGHT_DEFAULT_WARMTH` — dusk tungsten, which is what reads as
   * "somebody is in there" against a night sky.
   */
  warmth?: number;
  /**
   * How many real lamps stand on this floor. Absent = `INTERIOR_LAMP_PER_FLOOR`.
   *
   * A knob and not a constant because a floor is not one size: a lobby plate wants the
   * four corners, a narrow mezzanine reads better on two, and a hall can carry six. It
   * is clamped rather than trusted — the Explorer keeps only the nearest handful of
   * lights in the WHOLE scene, so authoring twenty on one floor does not buy twenty
   * lamps, it buys twenty entities fighting over the same few slots.
   */
  count?: number;
  /**
   * Explicit hex, e.g. `#ffb45e`. Absent = derived from `warmth` on the cool→warm ramp.
   *
   * Warmth stays the default vocabulary because it is the axis a night city actually
   * needs. This is the escape hatch for a room that is not on that axis at all — a green
   * server floor, a blue pool deck — and it drives BOTH the band and the lamps, so the
   * glow through the glass never disagrees with the light on the floor.
   */
  color?: string;
}

/**
 * Hard ceiling on soffit emission. The ceiling that burned the owner's eyes measured
 * 0.18 across a whole storey-wide plane; this is a band roughly a fiftieth of that area,
 * so 0.55 at the top of the range lands far below it in total emitted light. Raising
 * this is how the feature becomes the bug it was written to avoid.
 */
export const INTERIOR_LIGHT_MAX_EMISSIVE = 0.55;
/** Height of the emissive band. Deliberately small — this is a reveal, not a panel. */
export const INTERIOR_LIGHT_SOFFIT_HEIGHT_M = 0.18;
/** How far the band sits INWARD of the facade. Never crosses the footprint outline. */
export const INTERIOR_LIGHT_SOFFIT_INSET_M = 0.5;
/** How far the band hangs below the ceiling slab. */
export const INTERIOR_LIGHT_SOFFIT_DROP_M = 0.3;

/**
 * Candela for one lamp at level 1. The gallery's picture lamp is 6000 because it is
 * aimed point-blank at a canvas; a room lamp at that value blows the floor out white.
 */
export const INTERIOR_LAMP_MAX_CANDELA = 3200;
export const INTERIOR_LAMP_RANGE_M = 12;
/** Lamps authored per lit floor. Four corners of the usable floor plate. */
export const INTERIOR_LAMP_PER_FLOOR = 4;
/** One lamp still lights a small room; zero is spelled "switch the floor off". */
export const INTERIOR_LAMP_MIN_PER_FLOOR = 1;
/**
 * Ceiling on lamps per floor. Past this the extra entities cannot win a slot in the
 * Explorer's nearest-few window, so they cost triangles and config bytes and light
 * nothing. Raising it does not make a floor brighter — raise `level` instead.
 */
export const INTERIOR_LAMP_MAX_PER_FLOOR = 8;
/** Lamp height as a fraction of the storey — just under the ceiling. */
export const INTERIOR_LAMP_LIFT_FRACTION = 0.78;
/** Lamps sit this fraction of the way from the floor centre to its edge. */
export const INTERIOR_LAMP_INSET_FRACTION = 0.42;

export const INTERIOR_LIGHT_DEFAULT_WARMTH = 0.75;
export const INTERIOR_LIGHT_DEFAULT_LEVEL = 0.55;

/** Cool end of the warmth axis — pale office white. */
const COOL_RGB = { r: 0xe8, g: 0xf0, b: 0xff };
/** Warm end — dusk tungsten. Not orange-red: that reads as fire, not as occupancy. */
const WARM_RGB = { r: 0xff, g: 0xb4, b: 0x5e };

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function hex2(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
}

/** Warmth 0..1 → hex on the cool→warm ramp. Shared by the soffit and the lamps so a
 *  floor's glow through the glass matches the light spilling onto its floor. */
export function interiorLightColorHex(warmth: number): string {
  const t = clamp01(warmth);
  const r = COOL_RGB.r + (WARM_RGB.r - COOL_RGB.r) * t;
  const g = COOL_RGB.g + (WARM_RGB.g - COOL_RGB.g) * t;
  const b = COOL_RGB.b + (WARM_RGB.b - COOL_RGB.b) * t;
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/** Hex → 0..1 RGB, the form SDK7 `LightSource` wants. */
export function interiorLightColorRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const n = parseInt(clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean, 16);
  if (!Number.isFinite(n)) return { r: 1, g: 1, b: 1 };
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
  };
}

export interface ResolvedInteriorLight {
  floor: number;
  level: number;
  warmth: number;
  /** Shared hex for the band and the lamps. Explicit `color` wins over the ramp. */
  color: string;
  /** Soffit emissive intensity. Already capped — never re-scale this downstream. */
  emissive: number;
  /** One lamp's candela. */
  candela: number;
  rangeM: number;
  /** Lamps to stand on this floor. Already clamped — never re-clamp downstream. */
  count: number;
}

/** 1..`INTERIOR_LAMP_MAX_PER_FLOOR`, defaulting when absent or malformed. */
export function clampInteriorLampCount(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return INTERIOR_LAMP_PER_FLOOR;
  return Math.max(INTERIOR_LAMP_MIN_PER_FLOOR, Math.min(INTERIOR_LAMP_MAX_PER_FLOOR, n));
}

/** `#rgb` / `#rrggbb`, normalized to lower-case `#rrggbb`. Anything else → null. */
export function normalizeInteriorLightColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$/.test(clean) && !/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  return `#${full.toLowerCase()}`;
}

export function findInteriorLight(
  lights: InteriorLightSpec[] | undefined,
  floor: number
): InteriorLightSpec | undefined {
  return lights?.find((l) => l.floor === floor);
}

/**
 * The one resolver. Returns null for an unlit floor — callers branch on null rather than
 * building a zero-intensity band, because a mesh that emits nothing is still a mesh in
 * the triangle budget.
 */
export function resolveInteriorLight(
  lights: InteriorLightSpec[] | undefined,
  floor: number
): ResolvedInteriorLight | null {
  const spec = findInteriorLight(lights, floor);
  if (!spec) return null;
  const level = clamp01(spec.level);
  if (level <= 0) return null;
  const warmth = spec.warmth === undefined ? INTERIOR_LIGHT_DEFAULT_WARMTH : clamp01(spec.warmth);
  return {
    floor,
    level,
    warmth,
    // An explicit colour is a deliberate override; warmth is the default vocabulary.
    color: normalizeInteriorLightColor(spec.color) ?? interiorLightColorHex(warmth),
    emissive: level * INTERIOR_LIGHT_MAX_EMISSIVE,
    candela: level * INTERIOR_LAMP_MAX_CANDELA,
    rangeM: INTERIOR_LAMP_RANGE_M,
    count: clampInteriorLampCount(spec.count),
  };
}

/** Upsert one floor's entry. Mirrors `setWallGlassOverride` so the two read alike. */
export function setInteriorLight(
  lights: InteriorLightSpec[] | undefined,
  floor: number,
  fields: { level: number; warmth?: number; count?: number; color?: string | null }
): InteriorLightSpec[] {
  const rest = (lights ?? []).filter((l) => l.floor !== floor);
  // `color: null` is how a caller says "back to the warmth ramp" — distinct from
  // omitting the field, which leaves whatever the row already carried.
  const color =
    fields.color === undefined
      ? normalizeInteriorLightColor((lights ?? []).find((l) => l.floor === floor)?.color)
      : normalizeInteriorLightColor(fields.color);
  const next: InteriorLightSpec = {
    floor,
    level: clamp01(fields.level),
    ...(fields.warmth === undefined ? {} : { warmth: clamp01(fields.warmth) }),
    ...(fields.count === undefined ? {} : { count: clampInteriorLampCount(fields.count) }),
    ...(color === null ? {} : { color }),
  };
  return [...rest, next].sort((a, b) => a.floor - b.floor);
}

export function clearInteriorLight(
  lights: InteriorLightSpec[] | undefined,
  floor: number
): InteriorLightSpec[] | undefined {
  const next = (lights ?? []).filter((l) => l.floor !== floor);
  return next.length ? next : undefined;
}

/** Drop malformed rows and floors that no longer exist. Called at the publish boundary. */
export function normalizeInteriorLights(
  lights: unknown,
  floorCount: number
): InteriorLightSpec[] | undefined {
  if (!Array.isArray(lights)) return undefined;
  const seen = new Set<number>();
  const out: InteriorLightSpec[] = [];
  for (const raw of lights) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Partial<InteriorLightSpec>;
    const floor = Math.floor(Number(row.floor));
    if (!Number.isFinite(floor) || floor < 0 || floor >= floorCount) continue;
    if (seen.has(floor)) continue;
    const level = clamp01(Number(row.level));
    if (level <= 0) continue;
    seen.add(floor);
    const color = normalizeInteriorLightColor(row.color);
    out.push({
      floor,
      level,
      ...(row.warmth === undefined ? {} : { warmth: clamp01(Number(row.warmth)) }),
      ...(row.count === undefined ? {} : { count: clampInteriorLampCount(row.count) }),
      ...(color === null ? {} : { color }),
    });
  }
  return out.length ? out.sort((a, b) => a.floor - b.floor) : undefined;
}

/** A lamp anchor in whatever frame the caller passed its footprint in. */
export interface InteriorLampPoint {
  x: number;
  z: number;
}

/**
 * Where the real lamps stand on a lit floor.
 *
 * Four points inset from the floor plate's own corners — NOT a centre light, which
 * throws one hard pool and leaves the perimeter (the bit visible through the glass)
 * black. The inset keeps every lamp inside the footprint on any plan shape, because it
 * is a fraction of the plate rather than a fixed metre offset that a small tower would
 * push through its own wall.
 */
export function planInteriorLampPoints(
  footprint: { width: number; depth: number },
  count = INTERIOR_LAMP_PER_FLOOR
): InteriorLampPoint[] {
  const n = Math.max(1, Math.floor(count));
  const hx = (footprint.width / 2) * INTERIOR_LAMP_INSET_FRACTION;
  const hz = (footprint.depth / 2) * INTERIOR_LAMP_INSET_FRACTION;
  if (n === 1) return [{ x: 0, z: 0 }];
  const corners: InteriorLampPoint[] = [
    { x: -hx, z: -hz },
    { x: hx, z: -hz },
    { x: hx, z: hz },
    { x: -hx, z: hz },
  ];
  if (n <= 4) return corners.slice(0, n);
  // Beyond four, walk a ring so a large plate stays evenly lit instead of stacking
  // extra lamps on the same four corners.
  const out: InteriorLampPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 4;
    out.push({ x: Math.cos(a) * hx, z: Math.sin(a) * hz });
  }
  return out;
}

/** Lamp height above the floor's own base Y. */
export function interiorLampLiftM(storyHeightM: number): number {
  return storyHeightM * INTERIOR_LAMP_LIFT_FRACTION;
}

/** A lamp ready for the runtime, in DCL scene metres. */
export interface InteriorLampAnchor {
  x: number;
  y: number;
  z: number;
  /** 0..1 RGB. */
  color: { r: number; g: number; b: number };
  candela: number;
  rangeM: number;
}
