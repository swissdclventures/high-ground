/**
 * Reusable crowd-reaction primitives.
 *
 * Apps publish one semantic cue. Every client expands it into the same imperfect
 * per-actor wave locally, avoiding one network message per NPC. The contract is
 * deliberately unaware of Breakdance, audio engines, AvatarShape, or lighting.
 */

export type CrowdReactionMood = "neutral" | "positive" | "negative" | "aggressive";
export type CrowdReactionIntensity = 0 | 1 | 2 | 3 | 4;

export type CrowdReactionTarget =
  | { kind: "all" }
  | { kind: "group"; groupId: string }
  | { kind: "npcs"; npcIds: string[] }
  | { kind: "zone"; zoneId: string };

export interface CrowdReactionFocus {
  userId?: string;
  x?: number;
  y?: number;
  z?: number;
}

export interface CrowdReactionCue {
  /** Unique within the current scene session. Repeated delivery is idempotent. */
  id: string;
  target: CrowdReactionTarget;
  mood: CrowdReactionMood;
  intensity: CrowdReactionIntensity;
  startedAt: number;
  durationMs: number;
  /** Shared seed makes all clients derive the same wave. */
  seed: number;
  focus?: CrowdReactionFocus;
}

export interface CrowdReactionPreset {
  id: string;
  mood: CrowdReactionMood;
  intensity: CrowdReactionIntensity;
  participation: number;
  delayMinMs: number;
  delayMaxMs: number;
  waveCount: number;
  repeatCount: number;
  repeatEveryMs: number;
  emotes: string[];
  audioKey: string | null;
  fxKey: string | null;
}

export interface CrowdReactionActor {
  id: string;
  index: number;
  groupId?: string | null;
  zoneId?: string | null;
}

export interface CrowdReactionActorSchedule {
  participates: boolean;
  wave: number;
  startsAt: number;
  emote: string | null;
  repeatCount: number;
  repeatEveryMs: number;
}

export const ALL_CROWD_REACTION_TARGET: CrowdReactionTarget = { kind: "all" };

export function crowdReactionIntensity(value: unknown): CrowdReactionIntensity {
  const rounded = Math.round(Number(value));
  return Math.min(4, Math.max(0, Number.isFinite(rounded) ? rounded : 0)) as CrowdReactionIntensity;
}

/** Small integer hash with stable output across browser and scene runtimes. */
export function crowdReactionHash(seed: number, salt: number): number {
  let x = (Math.trunc(seed) ^ Math.imul(Math.trunc(salt) + 1, 0x9e3779b1)) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

export function crowdReactionUnit(seed: number, salt: number): number {
  return crowdReactionHash(seed, salt) / 0x100000000;
}

export function crowdReactionTargetsActor(
  target: CrowdReactionTarget,
  actor: CrowdReactionActor
): boolean {
  switch (target.kind) {
    case "all":
      return true;
    case "group":
      return actor.groupId === target.groupId;
    case "npcs":
      return target.npcIds.includes(actor.id);
    case "zone":
      return actor.zoneId === target.zoneId;
  }
}

/**
 * Expand one cue into one actor's deterministic assignment. Wave membership,
 * participation, delay, emote and repeats are stable for the same cue + actor.
 */
export function scheduleCrowdReactionActor(
  cue: CrowdReactionCue,
  preset: CrowdReactionPreset,
  actor: CrowdReactionActor
): CrowdReactionActorSchedule {
  const targeted = crowdReactionTargetsActor(cue.target, actor);
  const participation = Math.min(1, Math.max(0, preset.participation));
  const participates = targeted && crowdReactionUnit(cue.seed, actor.index * 11 + 1) < participation;
  const waveCount = Math.max(1, Math.round(preset.waveCount));
  const wave = crowdReactionHash(cue.seed, actor.index * 11 + 2) % waveCount;
  const lo = Math.max(0, Math.min(preset.delayMinMs, preset.delayMaxMs));
  const hi = Math.max(lo, Math.max(preset.delayMinMs, preset.delayMaxMs));
  const jitter = lo + crowdReactionUnit(cue.seed, actor.index * 11 + 3) * (hi - lo);
  const waveSpacing = waveCount <= 1 ? 0 : (hi - lo) / waveCount;
  const emote = preset.emotes.length
    ? preset.emotes[crowdReactionHash(cue.seed, actor.index * 11 + 4) % preset.emotes.length] ?? null
    : null;
  return {
    participates,
    wave,
    startsAt: cue.startedAt + Math.round(jitter + wave * waveSpacing),
    emote,
    repeatCount: Math.max(1, Math.round(preset.repeatCount)),
    repeatEveryMs: Math.max(250, Math.round(preset.repeatEveryMs)),
  };
}

export function normalizeCrowdReactionCue(raw: unknown): CrowdReactionCue | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<CrowdReactionCue>;
  if (!value.id || typeof value.id !== "string") return null;
  if (!value.target || typeof value.target !== "object") return null;
  const target = value.target as CrowdReactionTarget;
  if (!["all", "group", "npcs", "zone"].includes(target.kind)) return null;
  if (!Number.isFinite(Number(value.startedAt)) || !Number.isFinite(Number(value.seed))) return null;
  const mood: CrowdReactionMood = ["neutral", "positive", "negative", "aggressive"].includes(
    String(value.mood)
  )
    ? (value.mood as CrowdReactionMood)
    : "neutral";
  return {
    id: value.id,
    target,
    mood,
    intensity: crowdReactionIntensity(value.intensity),
    startedAt: Number(value.startedAt),
    durationMs: Math.min(30_000, Math.max(500, Number(value.durationMs) || 4000)),
    seed: Math.trunc(Number(value.seed)),
    focus: value.focus,
  };
}
