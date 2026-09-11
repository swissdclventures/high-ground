/**
 * Read-only spatial data supplied by the World host to map plugins.
 *
 * The host owns occupancy, current-scene identity, player position and Atlas /
 * Federation discovery. A map plugin only renders this resource. Keeping the
 * data contract outside swissverse.world-map lets another plugin replace our
 * renderer without copying fetch URLs or parcel anchoring rules.
 */

export const MAP_DATA_HOST_API_ID = "map-data" as const;
export const DEFAULT_MAP_DATA_API_BASE = "https://builder.swissverse.org";

export const MAP_LEVELS = ["scene", "world", "federation"] as const;
export type MapLevel = (typeof MAP_LEVELS)[number];
export const DEFAULT_MAP_LEVEL: MapLevel = "world";

export interface MapParcel {
  x: number;
  y: number;
}

/** x1/y1 are exclusive edges. Values may be fractional for building outlines. */
export interface MapRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface MapSceneRecord {
  id: string;
  base: MapParcel;
  parcels: MapParcel[];
  land: MapRect[];
  buildings: MapRect[];
  title: string;
  isCurrent: boolean;
  /**
   * Access rule on this scene, read from its published building-config.
   * Missing config → `open` (offer it; a locked door will raise its own curtain).
   */
  access: "open" | "gated" | "closed";
}

export interface MapWorldSnapshot {
  worldName: string | null;
  scenes: MapSceneRecord[];
  currentSceneId: string | null;
}

export interface MapFederationWorld {
  id: string;
  worldName: string;
  title: string;
  x: number;
  y: number;
  sceneCount: number;
  parcelCount: number;
  isCurrent: boolean;
}

export interface MapFederationSnapshot {
  id: string;
  name: string;
  worlds: MapFederationWorld[];
}

export type MapDataStatus = "idle" | "loading" | "ready" | "partial" | "unavailable";

export interface MapDataSnapshot {
  status: MapDataStatus;
  scene: MapSceneRecord | null;
  world: MapWorldSnapshot | null;
  federation: MapFederationSnapshot | null;
  errors: string[];
}

/**
 * Runtime resource passed to every scene plugin through ScenePluginContext.
 * `load` is lazy and idempotent; uninstalling all map plugins causes no fetches.
 */
export interface MapDataHostApi {
  readonly id: typeof MAP_DATA_HOST_API_ID;
  load(): Promise<MapDataSnapshot>;
  snapshot(): MapDataSnapshot;
  playerWorldParcel(): MapParcel | null;
  version(): number;
}

export function mapLevelUp(level: MapLevel): MapLevel | null {
  const index = MAP_LEVELS.indexOf(level);
  return index >= 0 && index < MAP_LEVELS.length - 1 ? MAP_LEVELS[index + 1]! : null;
}

export function mapLevelDown(level: MapLevel): MapLevel | null {
  const index = MAP_LEVELS.indexOf(level);
  return index > 0 ? MAP_LEVELS[index - 1]! : null;
}

export function isMapLevel(value: unknown): value is MapLevel {
  return typeof value === "string" && (MAP_LEVELS as readonly string[]).includes(value);
}
