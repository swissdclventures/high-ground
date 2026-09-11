/**
 * Host boot budget — NPCs, map, video playback, and plugin starters.
 *
 * Geometry (the district GLB) is still Explorer-owned. Everything the scene
 * script starts after that mesh is incoming goes through these numbers.
 *
 * Plugin *ids* do not belong here. Each app declares `loadClass` on its
 * PluginManifest; `schedulePluginStarts` turns that into delays. A shooter
 * that omits the field is still `deferred`.
 */
/** Plaza crowd on the first spawn tick so arrivals still land among people. */
export const NPC_LANDING_WAVE = 20;

/**
 * AvatarShapes created on each later troupe tick (0.4 s). Four-plus in one
 * tick is what made the client look like it was crashing.
 */
export const NPC_SPAWN_PER_TICK = 3;

/** Seconds after `main()` before deferred host work and plugin classes run. */
export const BOOT_PACE = {
  /** Video decoder + autoplay. Screens exist immediately; picture waits. */
  videoPlayS: 6,
  /** World `/scenes` inventory + per-entity fetches. */
  minimapFetchS: 5,
  /** Expand the collapsed map once the first avatar wave has landed. */
  minimapOpenS: 8,
  /** `early` plugin class. */
  earlyPluginsS: 3,
  /** First `deferred` plugin. Further deferred apps add `pluginStartGapS`. */
  deferredPluginsS: 7,
  /** First `idle` plugin (heavy games). */
  idlePluginsS: 12,
  /** Gap between two plugins in the same class so they do not dump together. */
  pluginStartGapS: 1.5,
} as const;

/** How many NPCs to create on this tick. Index 0..N-1 is plaza-first in the recipe. */
export function nextNpcSpawnCount(alreadySpawned: number, total: number): number {
  if (total <= 0 || alreadySpawned >= total) return 0;
  if (alreadySpawned === 0) return Math.min(NPC_LANDING_WAVE, total);
  return Math.min(NPC_SPAWN_PER_TICK, total - alreadySpawned);
}
