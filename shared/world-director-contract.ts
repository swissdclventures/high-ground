import type {
  DanceCrowdConfig,
  DanceNpcConfig,
  DanceVenueConfig,
} from "./dance-venue-contract";
import { normalizeDanceVenueConfig } from "./dance-venue-contract";
import type { EncounterMood } from "./npc-encounters";

export const WORLD_DIRECTOR_VERSION = 1 as const;
export const WORLD_DIRECTOR_DEFAULT_POLL_SECONDS = 15;
export const WORLD_DIRECTOR_MIN_POLL_SECONDS = 5;

/** Live-safe NPC fields. Count/enabled remain deployment decisions because they
 * require creating or deleting ECS entities and must be benchmarked first. */
export type WorldDirectorNpcSettings = Omit<DanceNpcConfig, "enabled" | "count">;

export interface WorldDirectorSettings {
  npc: WorldDirectorNpcSettings;
  crowd: DanceCrowdConfig;
  crowdNavigation: DanceVenueConfig["crowdNavigation"];
  reactions: DanceVenueConfig["reactions"];
  encounterMood: EncounterMood;
}

export interface WorldDirectorLiveDocument {
  version: typeof WORLD_DIRECTOR_VERSION;
  directorId: string;
  revision: number;
  updatedAt: string;
  settings: WorldDirectorSettings;
}

export interface WorldDirectorBinding {
  directorId: string;
  url: string;
  pollSeconds: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function settingsFromDanceConfig(config: DanceVenueConfig): WorldDirectorSettings {
  const { enabled: _enabled, count: _count, ...npc } = config.npc;
  return {
    npc: JSON.parse(JSON.stringify(npc)) as WorldDirectorNpcSettings,
    crowd: JSON.parse(JSON.stringify(config.crowd)) as DanceCrowdConfig,
    crowdNavigation: JSON.parse(JSON.stringify(config.crowdNavigation)) as DanceVenueConfig["crowdNavigation"],
    reactions: JSON.parse(JSON.stringify(config.reactions)) as DanceVenueConfig["reactions"],
    encounterMood: config.encounterMood,
  };
}

export function normalizeWorldDirectorSettings(
  raw: unknown,
  fallback: DanceVenueConfig
): WorldDirectorSettings {
  const input = record(raw);
  const npc = record(input.npc);
  const crowd = record(input.crowd);
  const crowdNavigation = record(input.crowdNavigation);
  const reactions = record(input.reactions);
  const normalized = normalizeDanceVenueConfig({
    ...fallback,
    npc: {
      ...fallback.npc,
      ...npc,
      // These are construction/runtime-capacity decisions, never live edits.
      enabled: fallback.npc.enabled,
      count: fallback.npc.count,
    },
    crowd: { ...fallback.crowd, ...crowd },
    crowdNavigation: { ...fallback.crowdNavigation, ...crowdNavigation },
    reactions: { ...fallback.reactions, ...reactions },
    encounterMood:
      typeof input.encounterMood === "string"
        ? (input.encounterMood as EncounterMood)
        : fallback.encounterMood,
  }) ?? fallback;
  return settingsFromDanceConfig(normalized);
}

export function normalizeWorldDirectorDocument(
  raw: unknown,
  fallback: DanceVenueConfig,
  expectedDirectorId?: string
): WorldDirectorLiveDocument | null {
  const input = record(raw);
  if (input.version !== WORLD_DIRECTOR_VERSION) return null;
  const directorId = typeof input.directorId === "string" ? input.directorId.trim() : "";
  if (!directorId || (expectedDirectorId && directorId !== expectedDirectorId)) return null;
  const revision = Math.max(1, Math.round(Number(input.revision) || 1));
  const updatedAt =
    typeof input.updatedAt === "string" && !Number.isNaN(Date.parse(input.updatedAt))
      ? input.updatedAt
      : new Date(0).toISOString();
  return {
    version: WORLD_DIRECTOR_VERSION,
    directorId,
    revision,
    updatedAt,
    settings: normalizeWorldDirectorSettings(input.settings, fallback),
  };
}
