/**
 * Skybox app — a custom sky for a World.
 *
 * ★★ WHY THIS IS GEOMETRY AND NOT A scene.json SETTING.
 * `worldConfiguration.skyboxConfig` accepts `{ fixedTime, textures }` in
 * @dcl/schemas, and `textures` is validated as 0 / 1 / 6 strings. It is NOT
 * documented and NO shipped Explorer renders it — the content server accepts the
 * field and the sky never changes. The only lever the Explorer honours world-wide
 * is `fixedTime` (time of day), which Scene ▸ Shape already owns.
 * Decentraland's own reference scene (decentraland-scenes/skybox-ai-sdk7) draws a
 * custom sky the only way that works today: an unlit box inside the scene.
 *
 * So: Skybox is a per-scene box. The World-wide half is the APP INSTALL — put
 * Skybox in the World's overlay set and every ordinary scene switches it on as it
 * publishes. The PRESET does not travel; each scene picks its own, and `scope`
 * only decides whether the World switch may touch this scene at all.
 *
 * ★★ WHY IT NEVER LOOKS UGLY FROM A NEIGHBOUR.
 * The box is sized to THIS scene's own parcels and inset half a metre, so it can
 * never hang over the plot line into the scene next door. The runtime also hides
 * it whenever the player is outside those parcels, which is the case that used to
 * bite: in a multi-scene World, scene A stays loaded while you stand in scene B.
 *
 * ★★ WHY EVERY SIDE SHARES ONE TEXTURE.
 * DCL's plane UV orientation is not something a scene can rely on — a face can
 * come out mirrored. Every preset is therefore painted mirror-symmetric about the
 * centre of each 90° sector, so a flipped face is pixel-identical and the four
 * corners never show a seam. One side image + one top image per preset.
 */

export const SKYBOX_VERSION = 1 as const;

export type SkyboxPresetId =
  | "city-night"
  | "city-dusk"
  | "clear-day"
  | "deep-space"
  | "neon-grid";

/**
 * What a World install is allowed to do to this scene.
 *
 * The preset itself never travels — there is no World-level settings store for a
 * sky, so every scene picks its own. What is World-wide is the app install.
 * - world: the World switch turns Skybox on here, like any other overlay app.
 * - scene: leave this scene exactly as its owner set it (shared/world-app-policy.ts).
 */
export type SkyboxScope = "world" | "scene";

/** Skyline silhouette drawn along the horizon band. */
export type SkyboxHorizon = "none" | "city" | "far";

export interface SkyboxPreset {
  id: SkyboxPresetId;
  name: string;
  summary: string;
  /** Straight up. */
  zenith: string;
  /** Sky just above the skyline. */
  horizon: string;
  /** Glow burnt into the horizon band (city sodium, sunset, nebula). */
  haze: string;
  /** Silhouette colour of the skyline buildings. */
  silhouette: string;
  /** 0 = no stars, 1 = dense. */
  stars: number;
  /** Lit windows in the skyline silhouette. 0 = dark blocks, 1 = a live city. */
  windows: number;
  skyline: SkyboxHorizon;
  /** Synthwave floor lines across the horizon band. */
  grid: boolean;
  /**
   * Time of day this sky was painted for, in seconds (scene.json fixedTime).
   * Applied only when the owner asks for it — Scene ▸ Shape stays the owner of
   * time of day, this is a suggestion the card can offer in one click.
   */
  suggestedFixedTime: number;
}

export const SKYBOX_PRESETS: readonly SkyboxPreset[] = [
  {
    id: "city-night",
    name: "City Night",
    summary: "Deep blue night over a lit skyline, sodium glow on the horizon.",
    zenith: "#05070f",
    horizon: "#1b2440",
    haze: "#ff8a3d",
    silhouette: "#080a14",
    stars: 0.85,
    windows: 1,
    skyline: "city",
    grid: false,
    suggestedFixedTime: 0,
  },
  {
    id: "city-dusk",
    name: "City Dusk",
    summary: "Last light — orange horizon under a violet sky, towers in silhouette.",
    zenith: "#1d2b5c",
    horizon: "#ff9a4a",
    haze: "#ff5f6d",
    silhouette: "#241634",
    stars: 0.12,
    windows: 0.22,
    skyline: "city",
    grid: false,
    suggestedFixedTime: 68400,
  },
  {
    id: "clear-day",
    name: "Clear Day",
    summary: "Plain blue daylight with a soft haze. The neutral choice.",
    zenith: "#2f7fd6",
    horizon: "#cfe6f7",
    haze: "#ffffff",
    silhouette: "#9db9cf",
    stars: 0,
    windows: 0,
    skyline: "far",
    grid: false,
    suggestedFixedTime: 43200,
  },
  {
    id: "deep-space",
    name: "Deep Space",
    summary: "No horizon at all — black, dense stars, a violet nebula band.",
    zenith: "#01010a",
    horizon: "#0a0620",
    haze: "#6a3cff",
    silhouette: "#01010a",
    stars: 1,
    windows: 0,
    skyline: "none",
    grid: false,
    suggestedFixedTime: 0,
  },
  {
    id: "neon-grid",
    name: "Neon Grid",
    summary: "Synthwave — magenta horizon, cyan grid lines, far towers.",
    zenith: "#170036",
    horizon: "#ff2fb9",
    haze: "#17e6ff",
    silhouette: "#2b0a52",
    stars: 0.35,
    windows: 0,
    skyline: "far",
    grid: true,
    suggestedFixedTime: 0,
  },
];

export const DEFAULT_SKYBOX_PRESET: SkyboxPresetId = "city-night";

export function skyboxPreset(id: SkyboxPresetId): SkyboxPreset {
  return SKYBOX_PRESETS.find((preset) => preset.id === id) ?? SKYBOX_PRESETS[0]!;
}

/** Box the runtime draws, in scene-local metres. Baked at publish. */
export interface SkyboxBox {
  centerX: number;
  centerZ: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
}

/** Scene-relative image paths baked at publish. */
export interface SkyboxFaces {
  /** Painted once, used on all four walls (see the mirror-symmetry note above). */
  side: string;
  /** Ceiling. */
  top: string;
}

export interface SkyboxAppConfig {
  enabled: boolean;
  preset: SkyboxPresetId;
  /** Whether a World install may switch this app on here. See SkyboxScope. */
  scope: SkyboxScope;
  /**
   * A sky from the owner's Sky library (`shared/sky-library-contract.ts`), or ""
   * to use `preset`.
   *
   * ★ THIS IS A PUBLISH-TIME SELECTOR, NOT A RUNTIME FIELD. The library lives in
   * the owner's own database, which a published scene cannot reach; publish
   * resolves the id into `faces` (embedded bytes, or the owner's hosted folder)
   * and the runtime only ever reads `faces`. An id the shelf no longer holds
   * falls back to the preset rather than shipping a scene with no sky.
   *
   * Wins over `customBaseUrl`: picking a library sky is the newer, explicit act.
   */
  libraryId: string;
  /**
   * Owner-hosted override, kept for scenes authored before the Sky library
   * existed. Point at a folder holding `side.png` and `top.png` and the preset
   * is ignored. Swissverse never hosts the images — same rule as every other
   * media field in the product.
   */
  customBaseUrl: string;
  /**
   * Ask DCL to drop the auto-generated grassland / sea around the World so the
   * custom sky is the only thing past the plot line. Ignored by Genesis City and
   * by Worlds holding more than one scene (`landscapeTerrain` in scene.json).
   */
  hideLandscape: boolean;
  /** Publish-time bake — never edited by hand. */
  faces?: SkyboxFaces;
  /** Publish-time bake — never edited by hand. */
  box?: SkyboxBox;
}

export function defaultSkyboxAppConfig(): SkyboxAppConfig {
  return {
    enabled: false,
    preset: DEFAULT_SKYBOX_PRESET,
    scope: "world",
    libraryId: "",
    customBaseUrl: "",
    hideLandscape: true,
  };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeBox(raw: unknown): SkyboxBox | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const box = raw as Record<string, unknown>;
  const sizeX = finite(box.sizeX, 0);
  const sizeY = finite(box.sizeY, 0);
  const sizeZ = finite(box.sizeZ, 0);
  if (sizeX <= 0 || sizeY <= 0 || sizeZ <= 0) return undefined;
  return {
    centerX: finite(box.centerX, sizeX / 2),
    centerZ: finite(box.centerZ, sizeZ / 2),
    sizeX,
    sizeY,
    sizeZ,
  };
}

function normalizeFaces(raw: unknown): SkyboxFaces | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const faces = raw as Record<string, unknown>;
  const side = typeof faces.side === "string" ? faces.side.trim() : "";
  const top = typeof faces.top === "string" ? faces.top.trim() : "";
  if (!side || !top) return undefined;
  return { side, top };
}

export function normalizeSkyboxAppConfig(raw: unknown): SkyboxAppConfig {
  const base = defaultSkyboxAppConfig();
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const presetId = SKYBOX_PRESETS.some((preset) => preset.id === o.preset)
    ? (o.preset as SkyboxPresetId)
    : base.preset;
  return {
    enabled: o.enabled === true,
    preset: presetId,
    scope: o.scope === "scene" ? "scene" : "world",
    libraryId: typeof o.libraryId === "string" ? o.libraryId.trim() : "",
    customBaseUrl: typeof o.customBaseUrl === "string" ? o.customBaseUrl.trim() : "",
    hideLandscape: o.hideLandscape !== false,
    faces: normalizeFaces(o.faces),
    box: normalizeBox(o.box),
  };
}

/** Resolve the two images the runtime should load. Custom folder wins. */
export function resolveSkyboxFaces(config: SkyboxAppConfig): SkyboxFaces | undefined {
  const custom = config.customBaseUrl.replace(/\/+$/, "");
  if (custom) return { side: `${custom}/side.png`, top: `${custom}/top.png` };
  return config.faces;
}

/**
 * DCL's height ceiling for a scene of `parcelCount` parcels: log2(n+1) × 20 m.
 * Mirrors dclLimitsForScene() in shared/types.ts; duplicated here so the scene
 * runtime can validate a baked box without pulling the whole builder type graph.
 */
export function skyboxHeightCeilingM(parcelCount: number): number {
  return Math.log2(Math.max(1, parcelCount) + 1) * 20;
}

/** Half a metre of inset on every side — the box must never cross the plot line. */
export const SKYBOX_PLOT_INSET_M = 0.5;
/** Stay clear of the height ceiling so the bounds checker never blanks the sky. */
export const SKYBOX_HEIGHT_HEADROOM_M = 1;

/**
 * Size the box from the scene's own parcel list ("col,row" strings) and its base
 * parcel. Returns scene-local metres — the same frame the runtime places entities in.
 */
export function skyboxBoxForParcels(parcels: readonly string[], base: string): SkyboxBox | undefined {
  const cells = parcels
    .map((cell) => cell.split(",").map((part) => Number(part.trim())))
    .filter((pair): pair is number[] => pair.length === 2 && pair.every(Number.isFinite));
  if (!cells.length) return undefined;
  const baseParts = base.split(",").map((part) => Number(part.trim()));
  const baseCol = Number.isFinite(baseParts[0]) ? baseParts[0]! : cells[0]![0]!;
  const baseRow = Number.isFinite(baseParts[1]) ? baseParts[1]! : cells[0]![1]!;

  const cols = cells.map((cell) => cell[0]!);
  const rows = cells.map((cell) => cell[1]!);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);

  const widthM = (maxCol - minCol + 1) * 16;
  const depthM = (maxRow - minRow + 1) * 16;
  const sizeX = Math.max(4, widthM - SKYBOX_PLOT_INSET_M);
  const sizeZ = Math.max(4, depthM - SKYBOX_PLOT_INSET_M);
  const sizeY = Math.max(
    12,
    skyboxHeightCeilingM(cells.length) - SKYBOX_HEIGHT_HEADROOM_M
  );

  return {
    centerX: (minCol - baseCol) * 16 + widthM / 2,
    centerZ: (minRow - baseRow) * 16 + depthM / 2,
    sizeX,
    sizeY,
    sizeZ,
  };
}

/** True when the player stands inside the box footprint (with a little slack). */
export function playerInsideSkyboxFootprint(
  position: { x: number; z: number },
  box: SkyboxBox
): boolean {
  const slack = 1;
  return (
    Math.abs(position.x - box.centerX) <= box.sizeX / 2 + slack &&
    Math.abs(position.z - box.centerZ) <= box.sizeZ / 2 + slack
  );
}
