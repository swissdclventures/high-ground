/**
 * Swissverse's installable in-world map implementation.
 *
 * The Builder World/Federation editor remains host tooling in `app/src/world-map`
 * and `app/src/universe-map`. The top-right Explorer HUD is this overlay plugin.
 * It consumes the host-owned `map-data` resource rather than owning occupancy or
 * Atlas fetches, so other map renderers can replace it.
 */
import {
  DEFAULT_MAP_LEVEL,
  isMapLevel,
  type MapLevel,
} from "./map-data-contract";

export const WORLD_MAP_APP_ID = "swissverse.world-map" as const;
/** Backward-compatible name used by older host tooling and tests. */
export const WORLD_MAP_MODULE_ID = WORLD_MAP_APP_ID;

export interface WorldMapAppConfig {
  enabled: boolean;
  /** Initial scale. Scene ↓ World (default) ↑ Federation. */
  defaultLevel: MapLevel;
}

export function defaultWorldMapAppConfig(): WorldMapAppConfig {
  return { enabled: true, defaultLevel: DEFAULT_MAP_LEVEL };
}

export function normalizeWorldMapAppConfig(value: unknown): WorldMapAppConfig {
  const base = defaultWorldMapAppConfig();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<WorldMapAppConfig>;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : base.enabled,
    defaultLevel: isMapLevel(raw.defaultLevel) ? raw.defaultLevel : base.defaultLevel,
  };
}

export const WORLD_MAP_HOST_COMMANDS = [
  "occupancy",
  "spawn",
  "create_project",
  "open_project",
  "unpublish_scene",
  "place_plot",
  "draw_highway",
  "queue_publish",
] as const;

export type WorldMapHostCommand = (typeof WORLD_MAP_HOST_COMMANDS)[number];

export function isWorldMapAppId(id: string): boolean {
  const n = id.trim().toLowerCase().replace(/_/g, "-");
  return n === WORLD_MAP_APP_ID || n === "world-map" || n === "worldmap";
}

/** @deprecated The map is now an app; use isWorldMapAppId. */
export const isWorldMapHostModuleId = isWorldMapAppId;
