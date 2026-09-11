/**
 * Lights — the app that owns every real light in a scene.
 *
 * Before this existed, lighting had two owners and neither of them was a card the owner
 * could see. The Gallery hung a point lamp in front of each work (the look this app is
 * built out of), and a separate per-floor "lights on" attribute lit rooms — so the only
 * way to get a lit lobby was to hang artwork in it, and the only way to explain a lit
 * world was to know both hiding places.
 *
 * So: ONE card. The Gallery becomes a CONSUMER of it — its picture lamps take their
 * strength and colour from here, and the Gallery card says so when this app is off.
 * Floors are lit per floor whether or not a single frame hangs anywhere.
 *
 * WHERE THE DATA LIVES. This config is the switch and the shared lamp settings. The
 * per-floor rows stay on `BuildingConfig.interiorLights` (shared/interior-lights.ts),
 * because a plot carries many buildings and a light belongs to a FLOOR of ONE of them —
 * hoisting those rows onto the scene would light the wrong tower the moment a district
 * has more than one.
 *
 * WHAT THE SWITCH GATES. Real `LightSource` lamps: the per-floor room lamps and the
 * Gallery's picture lamps. It deliberately does NOT gate the emissive soffit band, which
 * is geometry baked into the building's own GLB and is part of how a floor LOOKS from
 * outside, not a light that lights anything (see shared/interior-lights.ts).
 */

import {
  INTERIOR_LAMP_MAX_CANDELA,
  normalizeInteriorLightColor,
} from "./interior-lights";

/** Gallery picture lamps, owned here rather than by the Gallery. */
export interface PictureLightConfig {
  /** Off leaves the frames hung and unlit — the art still renders. */
  enabled: boolean;
  /** 0..1 of the gallery's own tuned candela. 1 is the look this app was cut from. */
  level: number;
  /** Explicit hex, or null for the gallery's warm tungsten. */
  color: string | null;
}

export interface LightsAppConfig {
  enabled: boolean;
  pictureLights: PictureLightConfig;
}

export const PICTURE_LIGHT_DEFAULT_LEVEL = 1;

/**
 * Off by default, like every app. An existing project that was already lit is migrated
 * on in normalizeSocialSurfaceConfig — nothing that was working goes dark because we
 * shipped a card for it.
 */
export function defaultLightsAppConfig(): LightsAppConfig {
  return {
    enabled: false,
    pictureLights: { enabled: true, level: PICTURE_LIGHT_DEFAULT_LEVEL, color: null },
  };
}

function clamp01(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export function normalizeLightsAppConfig(
  raw: Partial<LightsAppConfig> | null | undefined
): LightsAppConfig {
  const base = defaultLightsAppConfig();
  const picture = raw?.pictureLights;
  return {
    enabled: raw?.enabled === true,
    pictureLights: {
      // Absent means "as shipped" (on), not "off" — a saved config that predates this
      // block came from a world whose gallery lamps were burning.
      enabled: picture?.enabled !== false,
      level: clamp01(picture?.level, base.pictureLights.level),
      color: normalizeInteriorLightColor(picture?.color),
    },
  };
}

/**
 * What the runtime should actually hang in front of a picture, or null for no lamp.
 *
 * One resolver so the scene, the tests and any preview agree. `baseCandela` is the
 * gallery's own tuned constant — passed in rather than imported so this module stays
 * free of the gallery contract (which imports plenty).
 */
export function resolvePictureLight(
  lights: LightsAppConfig | null | undefined,
  baseCandela: number
): { candela: number; color: string | null } | null {
  if (!lights?.enabled) return null;
  if (!lights.pictureLights.enabled) return null;
  const level = clamp01(lights.pictureLights.level, PICTURE_LIGHT_DEFAULT_LEVEL);
  if (level <= 0) return null;
  return {
    candela: level * baseCandela,
    color: normalizeInteriorLightColor(lights.pictureLights.color),
  };
}

/** Room-lamp candela at full strength — re-exported so the app view can label the knob. */
export const LIGHTS_APP_MAX_ROOM_CANDELA = INTERIOR_LAMP_MAX_CANDELA;
