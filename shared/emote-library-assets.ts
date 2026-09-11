/**
 * Emotes as first-class Builder library assets.
 *
 * There are two shelves inside one Emotes view:
 *
 *   Sample — the public CC0 starter catalogue served by Motion Studio.
 *   Yours  — uploaded or generated GLBs stored in the owner's own database.
 *
 * A recipe stores only small `WorldEmoteSelection` references. At publish the
 * selected bytes are copied into the scene and `src` is filled with the local
 * deployed path. The scene therefore never depends on Motion Studio or the
 * owner's database while a visitor is dancing.
 */

export const MOTION_STUDIO_ORIGIN = "https://move.swissverse.org";
export const MOTION_STUDIO_STARTER_PATH = "/static/starter";
export const MOTION_STUDIO_BUILDER_PROXY = "/motion-studio";

export type EmoteLibraryAssetSource = "motion-studio" | "owner";

export interface MotionStudioStarterEmote {
  action: string;
  slug: string;
  category: string;
  pack: string;
  ok: boolean;
  problems: string[];
  frames: number;
  seconds: number;
  kb: number;
}

export interface MotionStudioStarterCatalogue {
  source: string;
  license: string;
  credit: string;
  emotes: MotionStudioStarterEmote[];
}

/** One emote selected for this scene's WORLD menu. `src` exists only after publish. */
export interface WorldEmoteSelection {
  /** `sample:<slug>` or `owner:<uuid>`. Stable across recipe saves. */
  id: string;
  source: EmoteLibraryAssetSource;
  name: string;
  durationMs: number;
  /** Cache-busted, scene-local GLB written during publish. */
  src?: string;
}

export const WORLD_EMOTE_CONSUMERS = ["danceBug", "breakdance", "npcs"] as const;
export type WorldEmoteConsumer = (typeof WORLD_EMOTE_CONSUMERS)[number];
export type WorldEmoteAssignments = Record<WorldEmoteConsumer, string[]>;

/** Keep assignment ids valid when the World pool is edited or an asset is deleted. */
export function normalizeWorldEmoteAssignments(
  raw: unknown,
  selections: readonly Pick<WorldEmoteSelection, "id">[],
  legacyDefault = true
): WorldEmoteAssignments {
  const available = new Set(selections.map((selection) => selection.id));
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const normalize = (consumer: WorldEmoteConsumer): string[] => {
    const values = source?.[consumer];
    if (!Array.isArray(values)) {
      // Before this layer existed, every World clip appeared in Dance Bug. Preserve
      // that behavior; Breakdance and NPC assignment are deliberately opt-in.
      return legacyDefault && consumer === "danceBug" ? [...available] : [];
    }
    const seen = new Set<string>();
    return values.flatMap((value) => {
      const id = typeof value === "string" ? value.trim() : "";
      if (!id || !available.has(id) || seen.has(id)) return [];
      seen.add(id);
      return [id];
    });
  };
  return {
    danceBug: normalize("danceBug"),
    breakdance: normalize("breakdance"),
    npcs: normalize("npcs"),
  };
}

export function emoteAssignedTo(
  assignments: WorldEmoteAssignments,
  consumer: WorldEmoteConsumer,
  id: string
): boolean {
  return assignments[consumer].includes(id);
}

/**
 * One known-good dance on first install / migration. An explicit empty array is
 * respected, so removing every World emote keeps the runtime empty state.
 */
export const DEFAULT_WORLD_EMOTE_SELECTION: WorldEmoteSelection = {
  id: "sample:dance_charleston",
  source: "motion-studio",
  name: "Dance Charleston",
  durationMs: 2330,
};

/** One uploaded/generated row in the owner's `emotes` table. */
export interface OwnerLibraryEmoteRecord {
  id: string;
  walletAddress: string;
  emoteHash: string;
  name: string;
  category: string;
  /** `upload`, `generated`, or `motion-studio`. Open for future generators. */
  source: string;
  sourceSlug: string | null;
  prompt: string;
  seed: number | null;
  durationS: number;
  byteLength: number;
  glbBase64: string;
  thumbnailBase64: string | null;
  createdAt: string;
  updatedAt: string;
}

export const OWNER_EMOTE_LIBRARY_TABLE = "emotes";

/**
 * Additive so it upgrades the existing Motion Studio table as well as creating
 * a fresh one. The generator can write this exact contract later.
 */
export const OWNER_EMOTE_LIBRARY_SQL = `-- Emote library — run once in YOUR Supabase SQL editor.
CREATE TABLE IF NOT EXISTS public.emotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  emote_hash text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  seed integer,
  duration_seconds numeric,
  glb_base64 text NOT NULL,
  thumbnail_base64 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wallet_address, emote_hash)
);
ALTER TABLE public.emotes ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Untitled emote';
ALTER TABLE public.emotes ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other';
ALTER TABLE public.emotes ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'generated';
ALTER TABLE public.emotes ADD COLUMN IF NOT EXISTS source_slug text;
ALTER TABLE public.emotes ADD COLUMN IF NOT EXISTS byte_length integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS emotes_wallet_idx
  ON public.emotes (wallet_address, created_at DESC);
ALTER TABLE public.emotes ENABLE ROW LEVEL SECURITY;
`;

export const MAX_EMOTE_GLB_BYTES = 5 * 1024 * 1024;

export function motionStudioSampleId(slug: string): string {
  return `sample:${normalizeStarterSlug(slug)}`;
}

export function ownerEmoteSelectionId(id: string): string {
  return `owner:${id.trim()}`;
}

export function selectionLibraryId(selection: Pick<WorldEmoteSelection, "id" | "source">): string {
  const prefix = selection.source === "motion-studio" ? "sample:" : "owner:";
  return selection.id.startsWith(prefix) ? selection.id.slice(prefix.length) : "";
}

export function normalizeStarterSlug(value: unknown): string {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z0-9][a-z0-9_-]{0,95}$/.test(slug) ? slug : "";
}

export function starterCatalogueUrl(browserProxy = true): string {
  const prefix = browserProxy ? MOTION_STUDIO_BUILDER_PROXY : MOTION_STUDIO_ORIGIN;
  return `${prefix}${MOTION_STUDIO_STARTER_PATH}/library.json`;
}

export function starterGlbUrl(slug: string, browserProxy = true): string {
  const safe = normalizeStarterSlug(slug);
  if (!safe) throw new Error("Invalid Motion Studio starter emote slug.");
  const prefix = browserProxy ? MOTION_STUDIO_BUILDER_PROXY : MOTION_STUDIO_ORIGIN;
  return `${prefix}${MOTION_STUDIO_STARTER_PATH}/${safe}.glb`;
}

export function normalizeStarterCatalogue(raw: unknown): MotionStudioStarterCatalogue {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rows = Array.isArray(obj.emotes) ? obj.emotes : [];
  const emotes: MotionStudioStarterEmote[] = [];
  const seen = new Set<string>();
  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const slug = normalizeStarterSlug(row.slug);
    if (!slug || seen.has(slug) || row.ok === false) continue;
    seen.add(slug);
    emotes.push({
      action: typeof row.action === "string" && row.action.trim() ? row.action.trim() : slug,
      slug,
      category: typeof row.category === "string" && row.category.trim() ? row.category.trim() : "other",
      pack: typeof row.pack === "string" ? row.pack.trim() : "",
      ok: true,
      problems: Array.isArray(row.problems)
        ? row.problems.filter((item): item is string => typeof item === "string")
        : [],
      frames: Math.max(0, Math.round(Number(row.frames) || 0)),
      seconds: Math.max(0.1, Number(row.seconds) || 4),
      kb: Math.max(0, Number(row.kb) || 0),
    });
  }
  return {
    source: typeof obj.source === "string" ? obj.source : "",
    license: typeof obj.license === "string" ? obj.license : "CC0-1.0",
    credit: typeof obj.credit === "string" ? obj.credit : "",
    emotes,
  };
}

export function selectionFromStarter(row: MotionStudioStarterEmote): WorldEmoteSelection {
  return {
    id: motionStudioSampleId(row.slug),
    source: "motion-studio",
    name: row.action,
    durationMs: Math.max(500, Math.round(row.seconds * 1000)),
  };
}

export function selectionFromOwner(row: OwnerLibraryEmoteRecord): WorldEmoteSelection {
  return {
    id: ownerEmoteSelectionId(row.id),
    source: "owner",
    name: row.name,
    durationMs: Math.max(500, Math.round((row.durationS || 4) * 1000)),
  };
}

export function normalizeWorldEmoteSelections(raw: unknown): WorldEmoteSelection[] {
  if (!Array.isArray(raw)) return [];
  const out: WorldEmoteSelection[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const source = row.source === "owner" ? "owner" : row.source === "motion-studio" ? "motion-studio" : null;
    if (!source) continue;
    const rawId = typeof row.id === "string" ? row.id.trim() : "";
    const prefix = source === "owner" ? "owner:" : "sample:";
    const libraryId = rawId.startsWith(prefix) ? rawId.slice(prefix.length) : "";
    if (!libraryId || (source === "motion-studio" && !normalizeStarterSlug(libraryId))) continue;
    const id = `${prefix}${libraryId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : libraryId;
    const durationMs = Math.max(500, Math.min(60_000, Math.round(Number(row.durationMs) || 4000)));
    const src = typeof row.src === "string" && row.src.trim() ? row.src.trim() : undefined;
    out.push({ id, source, name, durationMs, ...(src ? { src } : {}) });
  }
  return out;
}

export function emoteLibraryTotalBytes(rows: readonly { byteLength: number }[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.byteLength) || 0), 0);
}
