/**
 * Surface finish — the matte↔polished axis every user-picked color rides on.
 *
 * Why this exists: a color picker alone can't make a dark surface work. Albedo is
 * multiplied by incoming light, so pure black (#000000) at full matte absorbs
 * everything and renders as a void in-world ("pitch black ground", owner 2026-07-28).
 * Two levers fix that:
 *
 *  1. `finishPbr` — roughness/metalness pairs behind a 4-word vocabulary. A glossy or
 *     polished dark surface catches the sky reflection and reads as polished stone
 *     instead of a hole. "polished" adds metalness so the reflection carries color.
 *  2. `clampAlbedo` — silently lifts near-black picks off the floor so even a matte
 *     surface keeps a hint of grazing light. Applied ONLY where a hex feeds a live
 *     material — the stored config keeps exactly what the user picked.
 *
 * Pure data + string math, no three.js and no module state — safe to import from hot
 * build paths (no cross-module init-order races).
 */

export type SurfaceFinish = "matte" | "satin" | "glossy" | "polished";

export const SURFACE_FINISHES: SurfaceFinish[] = ["matte", "satin", "glossy", "polished"];

export function isSurfaceFinish(v: unknown): v is SurfaceFinish {
  return v === "matte" || v === "satin" || v === "glossy" || v === "polished";
}

export interface FinishPbr {
  roughness: number;
  metalness: number;
}

/**
 * Finish → PBR. matte/satin/glossy keep the exact roughness values the ceiling and
 * flat floors have always used (so no existing build changes look); "polished" is the
 * new dark-color rescue: near-mirror roughness plus real metalness, which glTF carries
 * natively through export.
 */
export function finishPbr(finish: SurfaceFinish | undefined): FinishPbr {
  switch (finish) {
    case "polished":
      return { roughness: 0.05, metalness: 0.55 };
    case "glossy":
      return { roughness: 0.12, metalness: 0 };
    case "satin":
      return { roughness: 0.5, metalness: 0 };
    default:
      return { roughness: 0.9, metalness: 0 };
  }
}

/** Albedo floor per channel (0x16 ≈ 8.6%): the darkest a surface can go before it
 * stops responding to light at all and reads as a void. Low enough that "black" still
 * looks black, high enough that grazing light still models the surface. */
const ALBEDO_FLOOR = 0x16;

/**
 * Lift a #rrggbb hex so its brightest channel is at least ALBEDO_FLOOR, preserving the
 * hue by shifting all channels equally. Non-hex input passes through untouched.
 * #000000 → #161616; anything already above the floor is returned unchanged.
 */
export function clampAlbedo(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  if (max >= ALBEDO_FLOOR) return hex;
  const lift = ALBEDO_FLOOR - max;
  const to2 = (v: number) => Math.min(255, v + lift).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}
