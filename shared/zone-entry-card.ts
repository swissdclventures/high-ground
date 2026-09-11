/**
 * Visitor-facing title card shown once when a player crosses into a named zone.
 *
 * The selected logo is embedded in the recipe as a data URL. That is deliberate:
 * the browser-wide logo library makes assets reusable, while embedding the selected
 * bytes keeps cloud saves, downloaded recipes and headless publishes portable.
 */

export const ZONE_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ZoneLogoMimeType = (typeof ZONE_LOGO_MIME_TYPES)[number];

/** Keep a scene's UI textures cheap and localStorage drafts comfortably below quota. */
export const MAX_ZONE_LOGO_BYTES = 512 * 1024;

export interface ZoneLogoAsset {
  id: string;
  name: string;
  mimeType: ZoneLogoMimeType;
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

export type ZoneEntryCardMode = "text" | "logo" | "logo_text";

export interface ZoneEntryCardSpec {
  enabled: boolean;
  mode: ZoneEntryCardMode;
  title: string;
  subtitle?: string;
  logo?: ZoneLogoAsset;
  fadeInMs: number;
  holdMs: number;
  fadeOutMs: number;
}

/** Publish/runtime form. `logoDataUrl` is removed after it becomes a scene file. */
export interface RuntimeZoneEntryCard {
  mode: ZoneEntryCardMode;
  title: string;
  subtitle?: string;
  logoId?: string;
  logoName?: string;
  logoMimeType?: ZoneLogoMimeType;
  logoDataUrl?: string;
  logoFile?: string;
  logoWidth?: number;
  logoHeight?: number;
  fadeInMs: number;
  holdMs: number;
  fadeOutMs: number;
}

export const DEFAULT_ZONE_ENTRY_CARD: ZoneEntryCardSpec = {
  enabled: false,
  mode: "text",
  title: "",
  fadeInMs: 700,
  holdMs: 2500,
  fadeOutMs: 900,
};

function finiteMs(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : fallback;
}

export function isZoneLogoMimeType(value: unknown): value is ZoneLogoMimeType {
  return ZONE_LOGO_MIME_TYPES.includes(value as ZoneLogoMimeType);
}

export function zoneEntryCardUsesLogo(mode: ZoneEntryCardMode): boolean {
  return mode === "logo" || mode === "logo_text";
}

export function normalizeZoneLogoAsset(value: unknown): ZoneLogoAsset | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<ZoneLogoAsset>;
  const mimeType = isZoneLogoMimeType(raw.mimeType) ? raw.mimeType : undefined;
  const dataUrl = typeof raw.dataUrl === "string" ? raw.dataUrl : "";
  if (!mimeType || !dataUrl.startsWith(`data:${mimeType};base64,`)) return undefined;
  const bytes = Math.max(0, Number(raw.bytes) || 0);
  if (!bytes || bytes > MAX_ZONE_LOGO_BYTES) return undefined;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "zone-logo",
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Zone logo",
    mimeType,
    dataUrl,
    width: Math.max(1, Math.round(Number(raw.width) || 1)),
    height: Math.max(1, Math.round(Number(raw.height) || 1)),
    bytes,
  };
}

export function normalizeZoneEntryCard(
  value: unknown,
  fallbackTitle = "Zone"
): ZoneEntryCardSpec {
  const raw = value && typeof value === "object" ? (value as Partial<ZoneEntryCardSpec>) : {};
  const mode: ZoneEntryCardMode =
    raw.mode === "logo" || raw.mode === "logo_text" ? raw.mode : "text";
  return {
    enabled: raw.enabled === true,
    mode,
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title.trim().slice(0, 80)
        : fallbackTitle.slice(0, 80),
    subtitle:
      typeof raw.subtitle === "string" && raw.subtitle.trim()
        ? raw.subtitle.trim().slice(0, 140)
        : undefined,
    logo: normalizeZoneLogoAsset(raw.logo),
    fadeInMs: finiteMs(raw.fadeInMs, DEFAULT_ZONE_ENTRY_CARD.fadeInMs, 150, 3000),
    holdMs: finiteMs(raw.holdMs, DEFAULT_ZONE_ENTRY_CARD.holdMs, 500, 10000),
    fadeOutMs: finiteMs(raw.fadeOutMs, DEFAULT_ZONE_ENTRY_CARD.fadeOutMs, 150, 3000),
  };
}

/** Omit disabled cards entirely so legacy scenes pay no runtime/UI cost. */
export function runtimeZoneEntryCard(
  value: unknown,
  fallbackTitle: string
): RuntimeZoneEntryCard | undefined {
  const card = normalizeZoneEntryCard(value, fallbackTitle);
  if (!card.enabled) return undefined;
  return {
    mode: card.mode,
    title: card.title,
    subtitle: card.subtitle,
    logoId: card.logo?.id,
    logoName: card.logo?.name,
    logoMimeType: card.logo?.mimeType,
    logoDataUrl: card.logo?.dataUrl,
    logoWidth: card.logo?.width,
    logoHeight: card.logo?.height,
    fadeInMs: card.fadeInMs,
    holdMs: card.holdMs,
    fadeOutMs: card.fadeOutMs,
  };
}

export function zoneEntryCardAlpha(card: RuntimeZoneEntryCard, elapsedMs: number): number {
  if (elapsedMs < 0) return 0;
  if (elapsedMs < card.fadeInMs) return elapsedMs / Math.max(1, card.fadeInMs);
  const holdEnd = card.fadeInMs + card.holdMs;
  if (elapsedMs < holdEnd) return 1;
  const end = holdEnd + card.fadeOutMs;
  if (elapsedMs >= end) return 0;
  return 1 - (elapsedMs - holdEnd) / Math.max(1, card.fadeOutMs);
}

export function zoneEntryCardDurationMs(card: RuntimeZoneEntryCard): number {
  return card.fadeInMs + card.holdMs + card.fadeOutMs;
}
