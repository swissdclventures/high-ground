/**
 * Compact wire document for the Decentraland-hosted NPC crowd channel.
 *
 * We deliberately synchronize one packed crowd snapshot instead of 100 Transform
 * components every render frame. The elected scene coordinator simulates the
 * crowd, publishes this document at a low fixed rate, and every other client
 * interpolates its local AvatarShapes toward the authoritative poses.
 */

export const NPC_NETWORK_VERSION = 1 as const;
export const NPC_NETWORK_MAX_COUNT = 100;
export const NPC_NETWORK_POSE_STRIDE = 7; // xyz + quaternion xyzw

export interface NpcNetworkPose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}
export interface NpcNetworkSource extends NpcNetworkPose {
  index: number;
  emote: string;
  emoteTick: number;
}

export interface NpcNetworkSnapshot {
  version: typeof NPC_NETWORK_VERSION;
  revision: number;
  authorityId: string;
  generatedAt: number;
  count: number;
  poses: number[];
  emotes: string[];
  emoteTicks: number[];
}

function finite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeText(value: unknown, max = 180): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function emptyNpcNetworkSnapshot(): NpcNetworkSnapshot {
  return {
    version: NPC_NETWORK_VERSION,
    revision: 0,
    authorityId: "",
    generatedAt: 0,
    count: 0,
    poses: [],
    emotes: [],
    emoteTicks: [],
  };
}

export function buildNpcNetworkSnapshot(input: {
  revision: number;
  authorityId: string;
  generatedAt: number;
  sources: readonly NpcNetworkSource[];
}): NpcNetworkSnapshot {
  const ordered = [...input.sources]
    .filter((source) => Number.isInteger(source.index) && source.index >= 0)
    .sort((a, b) => a.index - b.index)
    .slice(0, NPC_NETWORK_MAX_COUNT);
  const count = ordered.length ? Math.min(NPC_NETWORK_MAX_COUNT, ordered[ordered.length - 1]!.index + 1) : 0;
  const poses = new Array(count * NPC_NETWORK_POSE_STRIDE).fill(0);
  const emotes = new Array<string>(count).fill("");
  const emoteTicks = new Array<number>(count).fill(0);

  for (const source of ordered) {
    if (source.index >= count) continue;
    const offset = source.index * NPC_NETWORK_POSE_STRIDE;
    poses[offset] = finite(source.x);
    poses[offset + 1] = finite(source.y);
    poses[offset + 2] = finite(source.z);
    poses[offset + 3] = finite(source.qx);
    poses[offset + 4] = finite(source.qy);
    poses[offset + 5] = finite(source.qz);
    poses[offset + 6] = finite(source.qw, 1);
    emotes[source.index] = safeText(source.emote);
    emoteTicks[source.index] = Math.max(0, Math.round(finite(source.emoteTick)));
  }

  return {
    version: NPC_NETWORK_VERSION,
    revision: Math.max(0, Math.round(finite(input.revision))),
    authorityId: safeText(input.authorityId, 96).toLowerCase(),
    generatedAt: Math.max(0, Math.round(finite(input.generatedAt))),
    count,
    poses,
    emotes,
    emoteTicks,
  };
}

/** Treat malformed/untrusted comms payloads as absent, never as scene state. */
export function normalizeNpcNetworkSnapshot(raw: unknown): NpcNetworkSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<NpcNetworkSnapshot>;
  if (value.version !== NPC_NETWORK_VERSION) return null;
  const count = Math.max(0, Math.min(NPC_NETWORK_MAX_COUNT, Math.round(finite(value.count))));
  if (!Array.isArray(value.poses) || value.poses.length !== count * NPC_NETWORK_POSE_STRIDE) return null;
  if (!Array.isArray(value.emotes) || value.emotes.length !== count) return null;
  if (!Array.isArray(value.emoteTicks) || value.emoteTicks.length !== count) return null;

  return {
    version: NPC_NETWORK_VERSION,
    revision: Math.max(0, Math.round(finite(value.revision))),
    authorityId: safeText(value.authorityId, 96).toLowerCase(),
    generatedAt: Math.max(0, Math.round(finite(value.generatedAt))),
    count,
    poses: value.poses.map((entry) => finite(entry)),
    emotes: value.emotes.map((entry) => safeText(entry)),
    emoteTicks: value.emoteTicks.map((entry) => Math.max(0, Math.round(finite(entry)))),
  };
}

export function npcNetworkPoseAt(snapshot: NpcNetworkSnapshot, index: number): NpcNetworkPose | null {
  if (!Number.isInteger(index) || index < 0 || index >= snapshot.count) return null;
  const offset = index * NPC_NETWORK_POSE_STRIDE;
  return {
    x: snapshot.poses[offset]!,
    y: snapshot.poses[offset + 1]!,
    z: snapshot.poses[offset + 2]!,
    qx: snapshot.poses[offset + 3]!,
    qy: snapshot.poses[offset + 4]!,
    qz: snapshot.poses[offset + 5]!,
    qw: snapshot.poses[offset + 6]!,
  };
}
