/**
 * Weather app — rain, snow, and (later) timed cycles.
 *
 * THE LAW: weather is its own catalogue app. It is not FX Lab. FX Lab keeps
 * one-shot spectacle (bursts, overlays). Hosts open WEATHER from the bottom bar.
 *
 * Cycles are reserved here so the Apps tab and skill can grow without another
 * migration. Today only `manual` does anything — the host picks Off / rain /
 * snow. `clear` forces weather off. Timed auto cycles are not wired yet.
 */

export const WEATHER_VERSION = 1 as const;

export type WeatherCycleMode = "manual" | "clear";

export interface WeatherAppConfig {
  enabled: boolean;
  /** Host-driven rain/snow vs force-clear. Auto cycles land later. */
  cycle: WeatherCycleMode;
}

export function defaultWeatherAppConfig(): WeatherAppConfig {
  return { enabled: false, cycle: "manual" };
}

export function normalizeWeatherAppConfig(raw: unknown): WeatherAppConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const cycle = o.cycle === "clear" ? "clear" : "manual";
  return {
    enabled: o.enabled === true,
    cycle,
  };
}
