/** Optional authoring surface for jump pads and directional speed corridors. */
export interface TraversalAppConfig {
  enabled: boolean;
}

export function defaultTraversalAppConfig(): TraversalAppConfig {
  return { enabled: false };
}

export function normalizeTraversalAppConfig(
  raw: Partial<TraversalAppConfig> | null | undefined
): TraversalAppConfig {
  return { enabled: raw?.enabled === true };
}

