/**
 * Audio Stream — one plugin whose only job is an external URL.
 *
 * Playlist MP3s live on Audio. Atmosphere lives on the scene (`social.ambient`).
 * Dance-floor tracks live on Breakdance. This file is the radio/URL slice.
 */

export interface AudioStreamAppConfig {
  enabled: boolean;
  /** Live stream or hosted MP3 URL. Empty = silent. */
  url: string;
  /** Owner-saved URLs kept on the scene spec. */
  savedUrls: string[];
}

export function defaultAudioStreamAppConfig(): AudioStreamAppConfig {
  return { enabled: false, url: "", savedUrls: [] };
}

function cleanUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 400);
}

export function normalizeAudioStreamAppConfig(raw: unknown): AudioStreamAppConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const url = cleanUrl(o.url);
  const seen = new Set<string>();
  const savedUrls: string[] = [];
  const rawSaved = Array.isArray(o.savedUrls) ? o.savedUrls : [];
  for (const entry of rawSaved) {
    const next = cleanUrl(entry);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    savedUrls.push(next);
    if (savedUrls.length >= 24) break;
  }
  if (url && !seen.has(url)) savedUrls.unshift(url);
  return {
    enabled: o.enabled === true,
    url,
    savedUrls: savedUrls.slice(0, 24),
  };
}
