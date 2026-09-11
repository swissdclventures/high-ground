/**
 * Recipe v3 — the per-app state bucket. The file stops knowing what a building is.
 *
 * Phase 1 of the thin-container work (`shared/builder-app-contract.ts`). Until now
 * `building`, `buildings`, `materials`, `glass`, `emissive`, `floorTexture`,
 * `materialTokens`, `editMode` and `workflow` sat at the ROOT of `ComposerRecipe`,
 * beside `name`, `scene` and `deploy`. That is what made the container thick: every
 * save path, every migration and every reader of a project file knew the shape of a
 * building, so a second builder app had nowhere to put its own work.
 *
 * v3 keeps the CONTAINER's fields at the root and moves each app's under
 * `appState[<appId>] = { version, state }`, opaque to the host.
 *
 * ```
 * { version: "3.0", name, scene, deploy, social, smartObjects, components, …,
 *   appState: { "swissverse.building": { version: 1, state: { building, buildings, … } } } }
 * ```
 *
 * ## Renderer-free, and flat both ways
 *
 * `shared/` is imported by both `app/` (three) and `scene/` (SDK7), so this file
 * touches no editor type — it moves plain keys on plain records. `fromAppStateRecipe`
 * returns the FLAT shape the existing `normalizeRecipe` already understands, so the
 * in-memory `ComposerRecipe` is unchanged and none of the ~364 `currentConfig` readers
 * or the 40-odd `recipe.buildings` sites move in this phase.
 *
 * ## Forward compatibility is the whole point
 *
 * An app id this build has never heard of keeps its slice: `fromAppStateRecipe` parks
 * every NON-building slice on `appState`, `ComposerRecipe` carries it, and
 * `toAppStateRecipe` writes it back. A Water scene therefore survives a round-trip
 * through a Builder that has no water code — which is the first thing a modular
 * container has to be able to do.
 *
 * ## Migration is forward-only
 *
 * Same as 0.4 → 0.5 → 1.0 → 2.0 before it: readers accept every older shape, writers
 * emit the newest. A Builder rolled back past this commit cannot read a v3 file — it
 * throws "Unrecognized recipe format", which the draft loader already catches and
 * turns into a fallback to the cloud copy.
 */

export const RECIPE_FILE_VERSION = "3.0" as const;

/** The Building app's id, matching shared/builder-app-catalogue.ts. */
export const BUILDING_APP_ID = "swissverse.building";

/** Slice format version for the Building app's own future migrations. */
export const BUILDING_STATE_VERSION = 1;

/**
 * The recipe fields the Building app owns.
 *
 * ★ `components` is NOT here, on purpose. The root component list holds host types
 * (`floor_prop`, `floor_zone`, `text_sign`) alongside building ones, and the owner
 * already ruled on 2026-08-03 that props and zones are plot content because they must
 * be placeable BETWEEN buildings. Splitting that array by `componentTypeOwner` belongs
 * to phase 2, when the component-type union opens; moving it wholesale now would hand
 * the Building app things that outlive it.
 *
 * ★ `smartObjects` stays at the root for the same reason.
 */
export const BUILDING_STATE_FIELDS = [
  "building",
  "buildings",
  "materials",
  "glass",
  "emissive",
  "noEmissive",
  "floorTexture",
  "materialTokens",
  "editMode",
  "workflow",
] as const;

export type BuildingStateField = (typeof BUILDING_STATE_FIELDS)[number];

export interface AppStateSliceRecord {
  version: number;
  state: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** True for a file written in the v3 envelope. */
export function isAppStateRecipe(value: unknown): boolean {
  const root = asRecord(value);
  return !!root && root.version === RECIPE_FILE_VERSION && !!asRecord(root.appState);
}

function readSlice(value: unknown): AppStateSliceRecord | null {
  const slice = asRecord(value);
  if (!slice) return null;
  const state = asRecord(slice.state);
  if (!state) return null;
  const version = Number(slice.version);
  return { version: Number.isFinite(version) ? version : 0, state };
}

/**
 * v3 envelope → the flat shape every existing reader understands.
 *
 * Non-building slices are preserved on `appState` so this build can hand them back
 * unchanged on the next save. A slice whose `state` is missing or malformed is dropped
 * rather than thrown on: a half-written file must degrade to a loadable scene, never to
 * a crash on open.
 */
export function fromAppStateRecipe(value: unknown): Record<string, unknown> {
  const root = asRecord(value);
  if (!root) return {};
  const appState = asRecord(root.appState);
  if (!appState) return { ...root };

  const flat: Record<string, unknown> = { ...root };
  delete flat.appState;

  const building = readSlice(appState[BUILDING_APP_ID]);
  if (building) {
    for (const field of BUILDING_STATE_FIELDS) {
      if (field in building.state) flat[field] = building.state[field];
    }
  }

  const carried: Record<string, AppStateSliceRecord> = {};
  for (const [appId, slice] of Object.entries(appState)) {
    if (appId === BUILDING_APP_ID) continue;
    const parsed = readSlice(slice);
    if (parsed) carried[appId] = parsed;
  }
  if (Object.keys(carried).length) flat.appState = carried;

  return flat;
}

/**
 * The flat in-memory recipe → the v3 envelope that goes on disk.
 *
 * Undefined fields are omitted rather than written as `undefined`, so a v3 file stays
 * as small as the v2 one it replaces — the bucket moves keys, it does not duplicate
 * them. Nothing is mirrored back to the root: a v3 file that still carried `building`
 * at the top would be two sources of truth, which is the exact failure this phase
 * exists to end.
 */
export function toAppStateRecipe(value: unknown): Record<string, unknown> {
  const root = asRecord(value);
  if (!root) return { version: RECIPE_FILE_VERSION, appState: {} };

  const container: Record<string, unknown> = { ...root };
  const state: Record<string, unknown> = {};
  for (const field of BUILDING_STATE_FIELDS) {
    if (field in container && container[field] !== undefined) state[field] = container[field];
    delete container[field];
  }

  const carried = asRecord(container.appState);
  delete container.appState;

  const appState: Record<string, AppStateSliceRecord> = {};
  if (carried) {
    for (const [appId, slice] of Object.entries(carried)) {
      if (appId === BUILDING_APP_ID) continue;
      const parsed = readSlice(slice);
      if (parsed) appState[appId] = parsed;
    }
  }
  appState[BUILDING_APP_ID] = { version: BUILDING_STATE_VERSION, state };

  return { ...container, version: RECIPE_FILE_VERSION, appState };
}

/**
 * One flat record from a recipe of ANY version — for the raw readers that inspect a
 * project blob without parsing it (scene-life inventory, boot staleness, wipe guards).
 *
 * Those readers exist to answer "how much life is in this file" BEFORE anything is
 * trusted enough to parse, so they cannot import the editor's parser. Routing them
 * through here is what stops a v3 file from reading as an empty plot — the precise
 * shape of the clobber the life inventory was written to prevent.
 */
export function flattenRecipeSource(value: unknown): Record<string, unknown> | null {
  const root = asRecord(value);
  if (!root) return null;
  return isAppStateRecipe(root) ? fromAppStateRecipe(root) : root;
}
