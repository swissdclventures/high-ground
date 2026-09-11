import type { RuntimeFloorZone } from "./scene-runtime-config";

export interface DanceZoneReferences {
  danceFloorZoneId: string | null;
  supportZoneId: string | null;
}

export interface ResolvedDanceZones {
  floor: RuntimeFloorZone;
  support: RuntimeFloorZone;
}

/** Resolve the two generic zones the app is explicitly bound to. */
export function resolveDanceRuntimeZones(
  zones: readonly RuntimeFloorZone[],
  config: DanceZoneReferences
): ResolvedDanceZones | null {
  const authoredFloor = zones.find((zone) => zone.id === config.danceFloorZoneId) ?? null;
  const authoredSupport = zones.find((zone) => zone.id === config.supportZoneId) ?? null;
  return authoredFloor && authoredSupport
    ? { floor: authoredFloor, support: authoredSupport }
    : null;
}
