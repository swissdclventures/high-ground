/**
 * Bundled Social sample media — served from app publicDir at /social-samples/…
 * Stage 4 picks these; publish bakes full https URLs for in-world VideoPlayer/AudioStream.
 */

export const SOCIAL_SAMPLE_VIDEO_ID = "video_hiphop_bg" as const;
export const SOCIAL_SAMPLE_AUDIO_ID = "audio_june26" as const;

export const SOCIAL_SAMPLE_VIDEO_PATH = "/social-samples/hiphop-bg-loop.mp4";
export const SOCIAL_SAMPLE_AUDIO_PATH = "/social-samples/june-26-sample.mp3";

export type SocialSampleKind = "video" | "audio";

export interface SocialSampleEntry {
  id: string;
  label: string;
  kind: SocialSampleKind;
  /** Path under the composer static host (publicDir). */
  publicPath: string;
}

export const SOCIAL_SAMPLE_CATALOG: SocialSampleEntry[] = [
  {
    id: SOCIAL_SAMPLE_VIDEO_ID,
    label: "Hip-Hop BG Loop",
    kind: "video",
    publicPath: SOCIAL_SAMPLE_VIDEO_PATH,
  },
  {
    id: SOCIAL_SAMPLE_AUDIO_ID,
    label: "June 26 sample",
    kind: "audio",
    publicPath: SOCIAL_SAMPLE_AUDIO_PATH,
  },
];

/**
 * A stored `/social-samples/…` path that names a file the Builder does NOT ship
 * becomes, at publish, an https URL the Explorer fetches — and gets the Builder's
 * HTML page back. That is the black arena screen of 2026-09-01: a default of
 * `/social-samples/arena-wide-loop.mp4` was written into saved projects for two
 * hours, the file never existed, and every publish since carried it. Unknown
 * sample paths are dropped so the runtime falls back to what ships in the scene.
 */
export function shippedSocialSamplePath(url: string | null | undefined): string {
  const raw = (url ?? "").trim();
  if (!raw.startsWith("/social-samples/")) return raw;
  const path = raw.split("?")[0] ?? raw;
  return SOCIAL_SAMPLE_CATALOG.some((sample) => sample.publicPath === path) ? raw : "";
}

export function socialSampleById(id: string): SocialSampleEntry | undefined {
  return SOCIAL_SAMPLE_CATALOG.find((sample) => sample.id === id);
}

export function socialSamplesOfKind(kind: SocialSampleKind): SocialSampleEntry[] {
  return SOCIAL_SAMPLE_CATALOG.filter((sample) => sample.kind === kind);
}

/** Match a stored https (or relative) URL back to a bundled sample, ignoring cache-busters. */
export function matchSocialSampleByUrl(url: string | null | undefined): SocialSampleEntry | null {
  if (!url) return null;
  const path = url.split("?")[0] ?? url;
  return (
    SOCIAL_SAMPLE_CATALOG.find(
      (sample) => path === sample.publicPath || path.endsWith(sample.publicPath)
    ) ?? null
  );
}

export function resolveSocialSampleUrl(publicPath: string, origin?: string): string {
  if (/^https:\/\//i.test(publicPath)) return publicPath;
  const base = (origin ?? readBrowserOrigin()).replace(/\/$/, "");
  if (!base) return publicPath;
  return `${base}${publicPath.startsWith("/") ? publicPath : `/${publicPath}`}`;
}

export function defaultSocialSampleVideoUrl(origin?: string): string {
  return resolveSocialSampleUrl(SOCIAL_SAMPLE_VIDEO_PATH, origin);
}

export function defaultSocialSampleAudioUrl(origin?: string): string {
  return resolveSocialSampleUrl(SOCIAL_SAMPLE_AUDIO_PATH, origin);
}

/** Bake relative /social-samples paths to https for DCL runtime. */
export function bakeSocialMediaUrl(url: string | null, origin: string): string | null {
  if (!url) return null;
  if (/^https:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return resolveSocialSampleUrl(url, origin);
  return url;
}

/**
 * Append a per-publish cache-buster to OUR bundled sample URLs only.
 * The host serves them behind a CDN edge cache; a stale edge copy predating the
 * CORS header keeps the explorer's video texture black for hours after the fix.
 * A unique query gives the CDN a cache-key miss → origin copy with the header.
 * User-custom URLs are never touched (queries can break signed links).
 */
export function withSampleCacheBuster(url: string | null, stamp?: string): string | null {
  if (!url || !url.includes("/social-samples/")) return url;
  const v = stamp ?? String(Date.now());
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(v)}`;
}

function readBrowserOrigin(): string {
  if (typeof globalThis === "undefined") return "";
  const loc = (globalThis as { location?: { origin?: string } }).location;
  return loc?.origin ?? "";
}
