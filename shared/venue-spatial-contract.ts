/** Spatial handoff from a scene builder to an independent Venue Console. */
import type { SceneRuntimeConfig, SmartRuntimeEntity } from "./scene-runtime-config";
import type { FloorZoneShape } from "./floor-zones";

export const VENUE_SPATIAL_SCHEMA_VERSION = 1 as const;
export type VenueSpatialKind = "screen" | "speaker" | "door" | "access-point" | "zone" | "stage" | "npc-spawn" | "npc-roam-area" | "performance-point" | "interaction-point";
export interface VenueSpatialPosition { x: number; z: number; floorIndex: number; rotationY?: number }
export interface VenueSpatialCapability {
  id: string;
  kind: VenueSpatialKind;
  name: string;
  position?: VenueSpatialPosition;
  shape?: FloorZoneShape;
  actions: string[];
}
export interface VenueSpatialDocument {
  schemaVersion: typeof VENUE_SPATIAL_SCHEMA_VERSION;
  venueId: string;
  generatedAt: string;
  coordinateSpace: "composer-local-meters";
  capabilities: VenueSpatialCapability[];
}

/** Smart-entity type → exported capability kind (same map for editor spec + runtime). */
export const VENUE_SMART_KIND: Partial<Record<SmartRuntimeEntity["type"], VenueSpatialKind>> = {
  sliding_door: "door", access_gate: "access-point", media_screen: "screen", audio_source: "speaker",
};
const SMART_KIND = VENUE_SMART_KIND;
export const VENUE_SPATIAL_ACTIONS: Record<VenueSpatialKind, string[]> = {
  screen: ["set-media", "play", "pause"], speaker: ["set-media", "play", "pause", "set-volume"],
  door: ["open", "close", "lock"], "access-point": ["allow", "deny"], zone: ["detect-presence"],
  stage: ["target-performance"], "npc-spawn": ["spawn"], "npc-roam-area": ["roam"],
  "performance-point": ["target-performance"], "interaction-point": ["interact"],
};
function finite(value: unknown, fallback = 0): number { return typeof value === "number" && Number.isFinite(value) ? value : fallback }
function fromSmart(entity: SmartRuntimeEntity): VenueSpatialCapability | null {
  const kind = SMART_KIND[entity.type];
  if (!kind) return null;
  return {
    id: entity.id, kind, name: typeof entity.spec.name === "string" ? entity.spec.name : entity.id,
    position: {
      x: finite(entity.spec.centerX), z: finite(entity.spec.centerZ),
      floorIndex: Math.max(0, Math.trunc(finite(entity.spec.floorIndex))),
      ...(typeof entity.spec.rotationY === "number" && Number.isFinite(entity.spec.rotationY) ? { rotationY: entity.spec.rotationY } : {}),
    }, actions: [...VENUE_SPATIAL_ACTIONS[kind]],
  };
}
export function buildVenueSpatialDocument(config: SceneRuntimeConfig): VenueSpatialDocument {
  const capabilities: VenueSpatialCapability[] = [];
  for (const entity of config.smartEntities ?? []) { const item = fromSmart(entity); if (item) capabilities.push(item) }
  for (const zone of config.floorZones ?? []) {
    capabilities.push({ id: zone.id, kind: "zone", name: zone.name,
      position: { x: zone.shape.centerX, z: zone.shape.centerZ, floorIndex: zone.floorIndex },
      shape: zone.shape, actions: [...VENUE_SPATIAL_ACTIONS.zone] });
  }
  capabilities.sort((a, b) => a.id.localeCompare(b.id));
  return { schemaVersion: VENUE_SPATIAL_SCHEMA_VERSION, venueId: config.buildingName,
    generatedAt: config.syncedAt, coordinateSpace: "composer-local-meters", capabilities };
}
export function venueSpatialDocumentIssues(document: VenueSpatialDocument): string[] {
  const issues: string[] = [];
  if (document.schemaVersion !== VENUE_SPATIAL_SCHEMA_VERSION) issues.push("Unsupported schema version");
  if (!document.venueId.trim()) issues.push("venueId is required");
  const ids = new Set<string>();
  for (const capability of document.capabilities) {
    if (!capability.id.trim()) issues.push("Capability ID is required");
    else if (ids.has(capability.id)) issues.push(`Duplicate capability ID: ${capability.id}`);
    ids.add(capability.id);
    const p = capability.position;
    if (p && (![p.x, p.z, p.floorIndex].every(Number.isFinite) || p.floorIndex < 0)) issues.push(`Invalid position: ${capability.id}`);
  }
  return issues;
}
