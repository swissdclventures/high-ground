/**
 * Temporary World-wide audio quarantine.
 *
 * DCL's base clap and fist-pump emotes contain baked-in applause, so removing
 * local WAV files is not sufficient. Keep these switches at the shared seam so
 * every scene/plugin runtime applies the same policy.
 */
export const WORLD_CLAPPING_AUDIO_DISABLED = true;
export const WORLD_CROWD_REACTION_AUDIO_DISABLED = true;

/** True for platform emotes known to contain baked clapping/applause audio. */
export function isClappingAudioEmote(emote: string): boolean {
  const id = emote.trim().toLowerCase();
  if (!id) return false;
  if (id === "clap" || id === "fistpump") return true;
  if (/(?:^|\/|:)(?:clap|clapping|applause)(?:-|$)/.test(id)) return true;
  if (/(?:^|\/|:)fistpump(?:-|$)/.test(id)) return true;
  const file = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  const stem = file.replace(/\.(glb|gltf)$/i, "");
  return stem === "clap" || stem === "fistpump";
}

/** Replace an applause-bearing platform emote with an audio-safe interrupt. */
export function silenceClappingAudioEmote(emote: string): string {
  return WORLD_CLAPPING_AUDIO_DISABLED && isClappingAudioEmote(emote) ? "shrug" : emote;
}

/** Crowd reaction beds are quarantined regardless of activity or combat state. */
export function worldCrowdReactionAudioEnabled(): boolean {
  return !WORLD_CROWD_REACTION_AUDIO_DISABLED;
}
