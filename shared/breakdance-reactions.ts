/** Breakdance Show's opinionated use of the reusable crowd-reaction system. */
import type {
  CrowdReactionIntensity,
  CrowdReactionMood,
  CrowdReactionPreset,
} from "./crowd-reaction-contract";
import { crowdReactionHash, crowdReactionIntensity, crowdReactionUnit } from "./crowd-reaction-contract";
import { silenceClappingAudioEmote } from "./world-audio-policy";

export interface BreakdanceReactionConfig {
  enabled: boolean;
  audioEnabled: boolean;
  audioVolume: number;
  spectacleEnabled: boolean;
  /** Caps automatic reactions without changing host-triggered test cues. */
  maxAutomaticIntensity: CrowdReactionIntensity;
  /** Billboard lines that pop with the crowd audio — denser as energy climbs. */
  speechEnabled: boolean;
  positiveEmotes: string[];
  negativeEmotes: string[];
  aggressiveEmotes: string[];
  positiveSpeech: string[];
  negativeSpeech: string[];
}

export function defaultBreakdanceReactionConfig(): BreakdanceReactionConfig {
  return {
    enabled: true,
    audioEnabled: false,
    audioVolume: 0.95,
    spectacleEnabled: true,
    maxAutomaticIntensity: 4,
    speechEnabled: true,
    positiveEmotes: [
      "handsair",
      "wave",
      "shrug",
      "handsair",
      "wave",
      "shrug",
    ],
    negativeEmotes: ["dontsee", "shrug", "wave"],
    aggressiveEmotes: [
      "wave",
      "handsair",
      "emotes/bd_uprock_new_emote.glb",
      "emotes/bboy_uprock_emote.glb",
    ],
    positiveSpeech: [
      "WOOO!",
      "YEEAH!",
      "AAAA!",
      "Go!",
      "Get it!",
      "Ayy!",
      "Fire!",
      "That's it!",
      "Let's go!",
      "Do it!",
      "Come on!",
      "YES!!",
      "WHOA!",
      "Go off!",
      "Ahhh!",
      "GET IT!",
    ],
    negativeSpeech: ["BOOO!", "Ohh…", "Nah", "What?", "Nooo", "Come on", "Wack", "Bruh"],
  };
}

export function normalizeBreakdanceReactionConfig(
  raw: Partial<BreakdanceReactionConfig> | null | undefined
): BreakdanceReactionConfig {
  const base = defaultBreakdanceReactionConfig();
  const emotes = (value: unknown, fallback: string[]) =>
    Array.isArray(value)
      ? value.map((item) => silenceClappingAudioEmote(String(item).trim())).filter(Boolean).slice(0, 40)
      : fallback;
  const volume = Number(raw?.audioVolume);
  return {
    enabled: raw?.enabled ?? base.enabled,
    // Persisted projects may still say true; the World quarantine wins.
    audioEnabled: false,
    audioVolume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : base.audioVolume,
    spectacleEnabled: raw?.spectacleEnabled ?? base.spectacleEnabled,
    maxAutomaticIntensity: crowdReactionIntensity(
      raw?.maxAutomaticIntensity ?? base.maxAutomaticIntensity
    ),
    speechEnabled: raw?.speechEnabled ?? base.speechEnabled,
    positiveEmotes: emotes(raw?.positiveEmotes, base.positiveEmotes),
    negativeEmotes: emotes(raw?.negativeEmotes, base.negativeEmotes),
    aggressiveEmotes: emotes(raw?.aggressiveEmotes, base.aggressiveEmotes),
    positiveSpeech: emotes(raw?.positiveSpeech, base.positiveSpeech),
    negativeSpeech: emotes(raw?.negativeSpeech, base.negativeSpeech),
  };
}

/** Most of the ring joins; delays stay a short chaotic burst, not a roll call. */
const PARTICIPATION = [0.12, 0.48, 0.82, 0.94, 1] as const;
const MAX_DELAY_MS = [700, 480, 360, 280, 220] as const;
const WAVES = [1, 2, 2, 3, 4] as const;
const REPEATS = [1, 1, 1, 2, 3] as const;

export function breakdanceReactionPreset(
  config: BreakdanceReactionConfig,
  mood: CrowdReactionMood,
  intensity: CrowdReactionIntensity
): CrowdReactionPreset {
  const emotes =
    mood === "negative"
      ? config.negativeEmotes
      : mood === "aggressive"
        ? config.aggressiveEmotes
        : mood === "neutral"
          ? ["shrug", "wave", "clap"]
          : config.positiveEmotes;
  return {
    id: `breakdance:${mood}:${intensity}`,
    mood,
    intensity,
    participation: PARTICIPATION[intensity],
    delayMinMs: intensity >= 2 ? 0 : 80,
    delayMaxMs: MAX_DELAY_MS[intensity],
    waveCount: WAVES[intensity],
    repeatCount: REPEATS[intensity],
    repeatEveryMs: intensity >= 4 ? 1450 : 1900,
    emotes,
    audioKey: intensity === 0 ? null : `${mood}-${intensity}`,
    fxKey: config.spectacleEnabled && intensity >= 2 ? `${mood}-${intensity}` : null,
  };
}

const SPEECH_RATE = [0, 0.42, 0.62, 0.78, 0.92] as const;
const SPEECH_SPREAD_MS = [0, 280, 220, 180, 140] as const;

/** Milliseconds after the cue (and the audio) before this actor's bubble pops. */
export function breakdanceSpeechAtMs(
  intensity: CrowdReactionIntensity,
  seed: number,
  actorIndex: number
): number {
  const spread = SPEECH_SPREAD_MS[intensity] ?? 180;
  return Math.round(crowdReactionUnit(seed, actorIndex * 11 + 9) * spread);
}

/** How long the bubble stays up. Shorter at frenzy so repeats can replace the line. */
export function breakdanceSpeechShowMs(intensity: CrowdReactionIntensity): number {
  return intensity >= 4 ? 2000 : intensity >= 3 ? 2300 : 2600;
}

/**
 * A shout for this actor this beat. Null means they stay silent.
 * `beat` 0 is the audio hit; later beats are emote repeats.
 */
export function breakdanceSpeechLine(
  config: BreakdanceReactionConfig,
  mood: CrowdReactionMood,
  intensity: CrowdReactionIntensity,
  seed: number,
  actorIndex: number,
  beat = 0
): string | null {
  if (!config.speechEnabled || intensity <= 0) return null;
  const lines = mood === "negative" ? config.negativeSpeech : config.positiveSpeech;
  if (!lines.length) return null;
  const rate = beat === 0 ? SPEECH_RATE[intensity] : SPEECH_RATE[intensity] * 0.7;
  if (crowdReactionUnit(seed, actorIndex * 11 + 7 + beat * 13) >= rate) return null;
  return lines[crowdReactionHash(seed, actorIndex * 11 + 8 + beat * 17) % lines.length] ?? null;
}
