/**
 * Count the life on a plot — NPCs, jump pads, zones — from a recipe or cloud JSON.
 *
 * Silent loss of this inventory is the bug class that opened NPCs at count 0 after a
 * refresh and shipped empty Builder tabs over a good district. Every writer (boot adopt,
 * Save, Publish, headless) should count before it overwrites.
 */

import { flattenRecipeSource } from "./recipe-app-state";

export interface SceneLifeInventory {
  npcs: number;
  pads: number;
  zones: number;
  /** Floors with interior lighting on. 2026-08-18: a Builder publish shipped 0 over 20. */
  lit: number;
  /** Enabled app ids, sorted. Same day: l1Museum and video shipped OFF over ON. */
  apps: string[];
  /**
   * Visible buildings on the plot. The emptyLot config carrier does not count —
   * a failed district restore that mints a bare plot must read as 0, not 1.
   */
  buildings: number;
}

export const EMPTY_LIFE: SceneLifeInventory = {
  npcs: 0,
  pads: 0,
  zones: 0,
  lit: 0,
  apps: [],
  buildings: 0,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isHidden(entry: Record<string, unknown>): boolean {
  const render = asRecord(entry.render);
  return render?.visible === false;
}

function isEmptyLot(entry: Record<string, unknown> | null): boolean {
  if (!entry) return false;
  if (entry.emptyLot === true) return true;
  return asRecord(entry.config)?.emptyLot === true;
}

/** Visible buildings. The emptyLot carrier is plot data, not a building. */
export function buildingCountFrom(value: unknown): number {
  // A recipe v3 file keeps the buildings under appState, so an un-flattened read here
  // would answer 0 — and 0 is exactly the answer that lets a save clobber a good scene.
  const root = flattenRecipeSource(value);
  if (!root) return 0;
  const buildings = asArray(root.buildings);
  if (buildings.length === 0) {
    const carrier = asRecord(root.building);
    if (!carrier) return 0;
    return isEmptyLot(carrier) ? 0 : 1;
  }
  return buildings.reduce((count: number, item) => count + (isEmptyLot(asRecord(item)) ? 0 : 1), 0);
}

function buildingsOf(life: SceneLifeInventory): number {
  const n = life.buildings;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function isJumpPad(entry: Record<string, unknown>): boolean {
  if (entry.type === "launch_pad" || entry.behavior === "launch_pad") return true;
  const spec = asRecord(entry.spec);
  return spec?.preset === "jump_pad";
}

function isFloorZone(entry: Record<string, unknown>): boolean {
  return entry.type === "floor_zone" && !isHidden(entry);
}

function collectById(
  items: unknown[],
  predicate: (entry: Record<string, unknown>) => boolean
): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const entry = asRecord(item);
    if (!entry || !predicate(entry)) continue;
    const id = typeof entry.id === "string" && entry.id ? entry.id : `anon-${out.size}`;
    if (!out.has(id)) out.set(id, entry);
  }
  return out;
}

function npcCountFromSocial(social: unknown): number {
  const root = asRecord(social);
  const dance = asRecord(root?.dance);
  const npc = asRecord(dance?.npc);
  if (!npc || npc.enabled === false) return 0;
  const declared = Number(npc.count);
  if (Number.isFinite(declared) && declared > 0) return Math.floor(declared);
  const grouped = asArray(npc.groups).reduce<number>((sum, group) => {
    const count = Number(asRecord(group)?.count);
    return sum + (Number.isFinite(count) && count > 0 ? Math.floor(count) : 0);
  }, 0);
  return grouped;
}

function smartObjectsFrom(value: Record<string, unknown>): unknown[] {
  const top = asArray(value.smartObjects);
  const runtime = asArray(value.smartEntities);
  const fromBuildings = asArray(value.buildings).flatMap((building) =>
    asArray(asRecord(building)?.smartObjects)
  );
  return [...top, ...runtime, ...fromBuildings];
}

function componentsFrom(value: Record<string, unknown>): unknown[] {
  const top = asArray(value.components);
  const fromBuildings = asArray(value.buildings).flatMap((building) =>
    asArray(asRecord(building)?.components)
  );
  return [...top, ...fromBuildings];
}

/** Count NPCs, jump pads and floor zones on a recipe, owner-DB blob, or live runtime config. */
export function lifeFromRecipe(value: unknown): SceneLifeInventory {
  const root = flattenRecipeSource(value);
  if (!root) return { ...EMPTY_LIFE };
  const zones = collectById(componentsFrom(root), isFloorZone);
  for (const zone of asArray(root.floorZones)) {
    const entry = asRecord(zone);
    if (!entry) continue;
    const id = typeof entry.id === "string" && entry.id ? entry.id : `floor-zone-${zones.size}`;
    if (!zones.has(id)) zones.set(id, entry);
  }
  return {
    npcs: npcCountFromSocial(root.social),
    pads: collectById(smartObjectsFrom(root), isJumpPad).size,
    zones: zones.size,
    lit: litFloorsFrom(root),
    apps: enabledAppsFrom(root.social),
    buildings: buildingCountFrom(root),
  };
}

function litFloorsFrom(root: Record<string, unknown>): number {
  // Recipe shape: building.interiorLights[]; runtime-config shape: the same.
  const building = asRecord(root.building);
  const lights = asArray(building?.interiorLights);
  return lights.filter((l) => ((asRecord(l)?.level as number | undefined) ?? 0) > 0).length;
}

function enabledAppsFrom(social: unknown): string[] {
  const apps = asRecord(asRecord(social)?.apps);
  if (!apps) return [];
  const out: string[] = [];
  for (const [id, value] of Object.entries(apps)) {
    const on = value === true || asRecord(value)?.enabled === true;
    if (on) out.push(id);
  }
  return out.sort();
}

export function formatLife(life: SceneLifeInventory): string {
  const apps = life.apps.length ? life.apps.join(",") : "none";
  return `${buildingsOf(life)} buildings, ${life.npcs} NPCs, ${life.pads} pads, ${life.zones} zones, ${life.lit} lit, apps: ${apps}`;
}

export type SceneLifeSource = Record<string, unknown> | null | undefined;

export function lifeWipeIssues(draft: SceneLifeInventory, cloud: SceneLifeInventory): string[] {
  const issues: string[] = [];
  const draftBuildings = buildingsOf(draft);
  const cloudBuildings = buildingsOf(cloud);
  if (draftBuildings < cloudBuildings) {
    issues.push(`buildings ${cloudBuildings} → ${draftBuildings}`);
  }
  if (draft.npcs < cloud.npcs) issues.push(`NPCs ${cloud.npcs} → ${draft.npcs}`);
  if (draft.pads < cloud.pads) issues.push(`pads ${cloud.pads} → ${draft.pads}`);
  if (draft.zones < cloud.zones) issues.push(`zones ${cloud.zones} → ${draft.zones}`);
  if (draft.lit < cloud.lit) issues.push(`lit floors ${cloud.lit} → ${draft.lit}`);
  const lost = cloud.apps.filter((id) => !draft.apps.includes(id));
  if (lost.length) issues.push(`apps switched off: ${lost.join(", ")}`);
  return issues;
}

export function isMultiBuildingRecipe(value: unknown): boolean {
  return asArray(flattenRecipeSource(value)?.buildings).length >= 2;
}

/**
 * REMOVED 2026-08-26: `glassDistrictLifeIssues` / `looksLikeGlassDistrict`.
 *
 * They asserted a CONSTANT — "a scene called Glass Skyscraper District must carry 100
 * NPCs and 13 pads" — copied from the product brief after the 2026-08-13 clobber. A
 * constant is not a guard: it fired on every single save of that scene whether or not
 * anything was at risk, including when the cloud copy was equally thin, and Cancel
 * silently abandoned the save. The district has legitimately shipped without jump pads
 * for weeks, so the prompt was pure noise that trained the owner to click through the
 * one dialog that also carries the REAL warnings.
 *
 * What actually protects the district is the comparison right below — `lifeWipeIssues`
 * against the cloud copy. That still fires, and only when something would be lost.
 */

/**
 * True when writing `draft` over `cloud` would drop buildings, NPCs, pads or zones
 * that the cloud copy still has. Equal or richer drafts are not a wipe.
 */
export function wouldWipeLife(draft: SceneLifeInventory, cloud: SceneLifeInventory): boolean {
  const cloudBuildings = buildingsOf(cloud);
  const cloudHasLife =
    cloud.npcs > 0 || cloud.pads > 0 || cloud.zones > 0 || cloudBuildings > 0;
  if (!cloudHasLife) return false;
  return (
    draft.npcs < cloud.npcs ||
    draft.pads < cloud.pads ||
    draft.zones < cloud.zones ||
    buildingsOf(draft) < cloudBuildings
  );
}

/** Explorer jump URL. Realm is the World name; position is a parcel (`x,y`). */
export function worldJumpLink(worldName: string, spawn?: string | null): string {
  const given = (spawn ?? "").replace(/\s+/g, "");
  const position = /^-?\d+,-?\d+$/.test(given) ? given : "0,0";
  return (
    `https://decentraland.org/jump?realm=${encodeURIComponent(worldName)}` +
    `&position=${encodeURIComponent(position)}`
  );
}
