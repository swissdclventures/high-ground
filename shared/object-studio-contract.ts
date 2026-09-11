/**
 * Object Studio — generate 3D library pieces with the owner's own API keys.
 *
 * THE LAW: Swissverse does not host a user database and does not hold Tripo keys.
 * Keys live in the owner's browser. Generated GLBs persist only in the owner's
 * connected database (Settings → Your database).
 *
 * Scene config stores only `enabled`. Never paste an API key into a recipe.
 */

export const OBJECT_STUDIO_VERSION = 1 as const;

/**
 * How a row in `library_objects` came to exist.
 *
 * ★ "upload" is not a generator. The table stopped being an Object Studio output log on
 * 2026-08-27 and became the OBJECT LIBRARY: a mesh you brought in yourself is a first-
 * class citizen beside one Tripo made. The column has no CHECK constraint, so this needed
 * no migration — but a row written before today has no way to say which it was, and
 * reads back as "tripo".
 */
export const OBJECT_STUDIO_PROVIDERS = ["tripo", "upload"] as const;
export type ObjectStudioProvider = (typeof OBJECT_STUDIO_PROVIDERS)[number];

export function normalizeObjectProvider(raw: unknown): ObjectStudioProvider {
  return raw === "upload" ? "upload" : "tripo";
}

export const GENERATED_OBJECT_ID_PREFIX = "genobj_";

export interface ObjectStudioAppConfig {
  enabled: boolean;
}

export function defaultObjectStudioAppConfig(): ObjectStudioAppConfig {
  return { enabled: false };
}

export function normalizeObjectStudioAppConfig(raw: unknown): ObjectStudioAppConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { enabled: o.enabled === true };
}

export function isGeneratedObjectId(id: string): boolean {
  return id.startsWith(GENERATED_OBJECT_ID_PREFIX);
}

export function newGeneratedObjectId(): string {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const rand = webCrypto?.randomUUID
    ? webCrypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${GENERATED_OBJECT_ID_PREFIX}${rand}`;
}

/* ── Bringing your own mesh in ────────────────────────────────────────────── */

/**
 * Upload is the FLOOR, not the road (owner, 2026-08-27). Most objects will be generated
 * or enhanced by AI; this route exists so an asset made outside the ecosystem — in
 * Blender, bought, hand-made — is never locked out. It has to be solid, which means it
 * must never quietly produce a broken world. It must NOT become a pipeline: no format
 * conversion, no mesh repair, no decimation, no batch import. Everything below is a
 * check with an answer, not a step that transforms anything.
 */

/** One file. Not a budget for a scene — a scene holds many of these. */
export const MAX_OBJECT_GLB_BYTES = 8 * 1024 * 1024;

/**
 * Above this, an upload is accepted but the card says the number out loud. It is a
 * warning and never a refusal: the owner's own triangle budget is a scene-level fact
 * (`dclLimitsForScene`), and a single heavy hero prop is a legitimate choice.
 */
export const OBJECT_UPLOAD_WARN_TRIS = 10_000;

/** "glTF" as a little-endian uint32 — the first four bytes of every binary glTF. */
export const GLB_MAGIC = 0x46546c67;

/**
 * ★ Checked as well as the extension, because an extension is a claim and these are the
 * file. Renaming `cat.fbx` to `cat.glb` is the exact mistake this catches, and catching
 * it here means the loader never sees it.
 */
export function isGlbMagic(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 12) return false;
  return new DataView(bytes).getUint32(0, true) === GLB_MAGIC;
}

/** `neon-stool_v2.glb` → `neon stool v2`. The owner renames it after; this just starts. */
export function objectNameFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.glb$/i, "").replace(/[_-]+/g, " ").trim();
  return stem.slice(0, 60) || "Uploaded object";
}

/**
 * Why this file cannot come in. Null = accept it.
 *
 * Every message names the limit rather than just refusing, so the reader knows what to
 * change — and the cap is stated in the drawer before anyone picks a file, so this is
 * the second line of defence, not the first.
 */
export function objectUploadIssue(file: { name: string; size: number }): string | null {
  if (!file.name.toLowerCase().endsWith(".glb")) {
    return "only .glb files — export your model as binary glTF";
  }
  if (file.size <= 0) return "the file is empty";
  if (file.size > MAX_OBJECT_GLB_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `${mb} MB is over the ${MAX_OBJECT_GLB_BYTES / (1024 * 1024)} MB limit`;
  }
  return null;
}

/** A sentence for a heavy mesh, or null when there is nothing to say. */
export function objectUploadWarning(faceCount: number | null): string | null {
  if (faceCount === null || faceCount <= OBJECT_UPLOAD_WARN_TRIS) return null;
  return `~${faceCount.toLocaleString("en-US")} triangles — heavy for a scene that holds many of these.`;
}

export interface OwnerLibraryObjectRecord {
  id: string;
  walletAddress: string;
  provider: ObjectStudioProvider;
  name: string;
  prompt: string;
  glbBase64: string;
  thumbnailBase64: string | null;
  widthM: number;
  depthM: number;
  heightM: number;
  faceCount: number | null;
  taskId: string | null;
  /**
   * 1-based, bumped when the MESH is replaced (never by a rename — a name is not the
   * asset). Absent reads as 1, so a row written before versioning keeps working.
   *
   * ‼️ Its column is added by an idempotent ALTER in OWNER_LIBRARY_OBJECTS_SQL. The
   * store writes it optimistically and retries without it when the column is missing,
   * so an owner who has not run the SQL yet keeps uploading instead of hitting a wall.
   */
  version?: number;
  createdAt: string;
  updatedAt: string;
}

export const OWNER_LIBRARY_OBJECTS_TABLE = "library_objects";

export const OWNER_LIBRARY_OBJECTS_SQL = `-- Object Studio library — run once in YOUR Supabase SQL editor.
CREATE TABLE IF NOT EXISTS public.library_objects (
  id text PRIMARY KEY,
  wallet_address text NOT NULL,
  provider text NOT NULL DEFAULT 'tripo',
  name text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  glb_base64 text NOT NULL,
  thumbnail_base64 text,
  width_m numeric NOT NULL DEFAULT 1,
  depth_m numeric NOT NULL DEFAULT 1,
  height_m numeric NOT NULL DEFAULT 1,
  face_count integer,
  task_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS library_objects_wallet_idx
  ON public.library_objects (wallet_address, created_at DESC);
-- Added 2026-08-27. Safe to re-run: an object you replace gets a new version, and the
-- scenes already holding the old one keep it until you choose to update them.
ALTER TABLE public.library_objects ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.library_objects ENABLE ROW LEVEL SECURITY;
`;

/**
 * PostgREST's code for "you sent a column this table does not have" (and the message
 * it uses when the schema cache has not caught up). Either means the same thing here:
 * the owner has not run the version ALTER yet.
 */
export function isMissingColumnError(text: string): boolean {
  return /PGRST204/.test(text) || /column .* does not exist/i.test(text);
}
