/** Operational file owned by Venue Console; references Builder capabilities by ID. */
import type { VenueSpatialDocument, VenueSpatialKind } from "./venue-spatial-contract";

export const VENUE_PROGRAMME_SCHEMA_VERSION = 1 as const;
export interface VenueMediaCue {
  id: string;
  targetId: string;
  mediaType: "audio" | "video";
  sourceUrl: string;
  autoplay?: boolean;
  loop?: boolean;
}
export interface VenueNpcRole {
  id: string;
  name: string;
  count: number;
  spawnId?: string;
  roamAreaId?: string;
  performancePointIds?: string[];
  interactionPointIds?: string[];
  outfitAssetIds?: string[];
  motionAssetIds?: string[];
}
export interface VenueScheduleItem {
  id: string;
  startsAt: string;
  mediaCueIds?: string[];
  activeNpcRoleIds?: string[];
}
export interface VenueProgramme {
  schemaVersion: typeof VENUE_PROGRAMME_SCHEMA_VERSION;
  /** Unique within the venue's saved-programme list. */
  id: string;
  venueId: string;
  name: string;
  /** The installed app this programme configures (VenueAppDescriptor.id).
   *  Absent on legacy documents = an app-less media/NPC programme. */
  appId?: string;
  /** App requiredBindings slot → capability ID (null = deliberately unbound). */
  bindings?: Record<string, string | null>;
  /** App-defined settings snapshot (e.g. show rules). Opaque to the platform. */
  settings?: Record<string, unknown>;
  media: VenueMediaCue[];
  npcRoles: VenueNpcRole[];
  schedule: VenueScheduleItem[];
}

function expectedKind(mediaType: VenueMediaCue["mediaType"]): VenueSpatialKind {
  return mediaType === "video" ? "screen" : "speaker";
}
function uniqueIdIssues(label: string, values: { id: string }[]): string[] {
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const value of values) {
    if (!value.id.trim()) issues.push(`${label} ID is required`);
    else if (seen.has(value.id)) issues.push(`Duplicate ${label} ID: ${value.id}`);
    seen.add(value.id);
  }
  return issues;
}

/** Validate a local programme against the exact venue it will operate. */
export function venueProgrammeIssues(
  programme: VenueProgramme,
  venue: VenueSpatialDocument
): string[] {
  const issues = [
    ...uniqueIdIssues("media cue", programme.media),
    ...uniqueIdIssues("NPC role", programme.npcRoles),
    ...uniqueIdIssues("schedule item", programme.schedule),
  ];
  if (programme.schemaVersion !== VENUE_PROGRAMME_SCHEMA_VERSION) issues.push("Unsupported programme schema version");
  if (!programme.id.trim()) issues.push("Programme ID is required");
  if (!programme.name.trim()) issues.push("Programme name is required");
  if (programme.venueId !== venue.venueId) issues.push("Programme venueId does not match the venue");
  const capabilities = new Map(venue.capabilities.map((capability) => [capability.id, capability]));
  for (const [slot, capabilityId] of Object.entries(programme.bindings ?? {})) {
    if (capabilityId !== null && !capabilities.has(capabilityId))
      issues.push(`Binding ${slot} references missing capability: ${capabilityId}`);
  }
  for (const cue of programme.media) {
    const target = capabilities.get(cue.targetId);
    if (!target) issues.push(`Media cue ${cue.id} references missing capability: ${cue.targetId}`);
    else if (target.kind !== expectedKind(cue.mediaType)) issues.push(`Media cue ${cue.id} requires a ${expectedKind(cue.mediaType)}`);
    if (!/^https:\/\//i.test(cue.sourceUrl)) issues.push(`Media cue ${cue.id} must use an https URL`);
  }
  const expectRefs = (role: VenueNpcRole, ids: string[] | undefined, kind: VenueSpatialKind) => {
    for (const id of ids ?? []) {
      const capability = capabilities.get(id);
      if (!capability) issues.push(`NPC role ${role.id} references missing capability: ${id}`);
      else if (capability.kind !== kind) issues.push(`NPC role ${role.id} requires ${kind}: ${id}`);
    }
  };
  for (const role of programme.npcRoles) {
    if (!Number.isInteger(role.count) || role.count < 0) issues.push(`NPC role ${role.id} has an invalid count`);
    expectRefs(role, role.spawnId ? [role.spawnId] : [], "npc-spawn");
    expectRefs(role, role.roamAreaId ? [role.roamAreaId] : [], "npc-roam-area");
    expectRefs(role, role.performancePointIds, "performance-point");
    expectRefs(role, role.interactionPointIds, "interaction-point");
  }
  const mediaIds = new Set(programme.media.map((cue) => cue.id));
  const roleIds = new Set(programme.npcRoles.map((role) => role.id));
  for (const item of programme.schedule) {
    for (const id of item.mediaCueIds ?? []) if (!mediaIds.has(id)) issues.push(`Schedule ${item.id} references missing media cue: ${id}`);
    for (const id of item.activeNpcRoleIds ?? []) if (!roleIds.has(id)) issues.push(`Schedule ${item.id} references missing NPC role: ${id}`);
    if (!Number.isFinite(Date.parse(item.startsAt))) issues.push(`Schedule ${item.id} has an invalid startsAt`);
  }
  return issues;
}

export function emptyVenueProgramme(venueId: string, id = "programme_1"): VenueProgramme {
  return { schemaVersion: VENUE_PROGRAMME_SCHEMA_VERSION, id, venueId, name: "Untitled programme", media: [], npcRoles: [], schedule: [] };
}

/** Lowest `programme_N` not already taken. */
export function nextProgrammeId(existing: readonly VenueProgramme[]): string {
  const taken = new Set(existing.map((programme) => programme.id));
  for (let n = 1; ; n += 1) if (!taken.has(`programme_${n}`)) return `programme_${n}`;
}

/** Deep copy with a fresh ID and a "(copy)"-suffixed unique name. */
export function duplicateVenueProgramme(
  source: VenueProgramme,
  existing: readonly VenueProgramme[]
): VenueProgramme {
  const names = new Set(existing.map((programme) => programme.name));
  let name = `${source.name} (copy)`;
  for (let n = 2; names.has(name); n += 1) name = `${source.name} (copy ${n})`;
  const copy = JSON.parse(JSON.stringify(source)) as VenueProgramme;
  return { ...copy, id: nextProgrammeId(existing), name };
}
