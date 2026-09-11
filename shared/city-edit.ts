/**
 * Edit a built city by SAYING WHICH — selectors, seeded bulk operations, and a dry run.
 *
 * Roadmap item 8. Everything before this could change one building or regenerate all of
 * them; nothing could say *every*. So re-tuning a forty-building city meant editing the
 * product module that generated it and rebuilding from scratch, which throws away every
 * hand adjustment made since. Twice on 2026-09-06 that is exactly what happened, to add
 * crowns and then windows.
 *
 * THE THREE PARTS, and the reason each exists:
 *
 * 1. A SELECTOR names a set instead of a building — every limestone tower over ten
 *    floors, every building fronting the park, every one without a crown. It matches on
 *    what a `PlacedBuilding` actually carries, never on a label somebody has to maintain.
 *
 * 2. `share` + `seed` take a deterministic FRACTION of that set. A city where every
 *    matching building changes is a city that looks generated; "lights in forty percent
 *    of them" is the difference between a rule and a rubber stamp. The same seed always
 *    picks the same buildings, so a dry run and the apply that follows agree.
 *
 * 3. `hand` records that a field was set deliberately, and a bulk op SKIPS a building
 *    whose field is marked. Without it every rerun of the rules quietly undoes the one
 *    building somebody fixed by hand — which is the bug that makes people stop trusting
 *    bulk edits at all.
 *
 * ★ PURE. Nothing here composes geometry or touches a draft; it reads and rewrites
 * `PlacedBuilding[]`. The caller decides whether to preview it (`planCityEdit`) or keep
 * it (`applyCityEdit`), and both answer from the same code so a preview cannot lie.
 */

import type { PlacedBuilding, BuildingConfig, SceneLayout } from "./types";
import { buildingHeightM, buildingFootprintM } from "./types";
import type { RoofCrownConfig } from "./roof-crown";
import type { WallSectionKind, WallSideId, WindowGridSpec } from "./wall-sections";
import { WALL_SIDES } from "./wall-sections";
import type { InteriorLightSpec } from "./interior-lights";

/* ------------------------------------------------------------------ selection */

/** A rectangle of the plot, in scene metres from the south-west corner. */
export interface CityEditRegion {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * Which buildings an edit is about. Every field is optional and they AND together, so an
 * empty selector means every building — which is deliberate: "all of them" is a common
 * and legitimate answer, and it should not need a special word.
 */
export interface CitySelector {
  /** Exact ids. */
  ids?: readonly string[];
  /** Id prefix, which is how generated districts group their towers (`b_`, `tower_`). */
  idPrefix?: string;
  floorsMin?: number;
  floorsMax?: number;
  /** Structural height, crown excluded. */
  heightMinM?: number;
  heightMaxM?: number;
  /** Shell colour, `#rrggbb`, matched case-insensitively against `concrete_main`. */
  shell?: string;
  /** The side the building's entrance is on. */
  entrySide?: WallSideId;
  /** Footprint area in square metres. */
  areaMinM2?: number;
  areaMaxM2?: number;
  /** The building's footprint centre must fall inside this rectangle. */
  within?: CityEditRegion;
  /** True = only buildings that already have a crown; false = only those without. */
  hasCrown?: boolean;
  /** True = only buildings with interior lights; false = only those without. */
  hasLights?: boolean;
  /**
   * Take this fraction of the matches, 0…1, chosen deterministically from `seed`.
   * Absent or 1 = all of them.
   */
  share?: number;
  /** Changing this reshuffles WHICH buildings the share picks, and nothing else. */
  seed?: number;
}

/* ------------------------------------------------------------------ operations */

export type CityEditOp =
  | {
      op: "set_wall";
      /** Absent = every side. */
      sides?: readonly WallSideId[];
      kind: WallSectionKind;
      /** Absent = every floor above the ground floor, which is the usual intent. */
      floors?: "all" | "above_ground" | readonly number[];
      /** Only meaningful for `window`. */
      windowGrid?: WindowGridSpec;
    }
  | { op: "set_window_relief"; relief: "recessed" | "flat" }
  | { op: "set_shell"; color: string }
  | { op: "set_crown"; crown: RoofCrownConfig | null }
  | {
      op: "set_lights";
      /** Fraction of a building's floors that are lit, 0…1. 0 turns them off. */
      floorShare: number;
      level?: number;
      warmth?: number;
    }
  | { op: "set_roof_guard"; kind: "solid" | "glass" };

/** Which field each op writes, so `hand` can protect exactly that much and no more. */
export const CITY_EDIT_FIELDS = {
  set_wall: "wallSections",
  set_window_relief: "windowGrid",
  set_shell: "shell",
  set_crown: "roofCrown",
  set_lights: "interiorLights",
  set_roof_guard: "roofGuard",
} as const satisfies Record<CityEditOp["op"], string>;

export type CityEditField = (typeof CITY_EDIT_FIELDS)[keyof typeof CITY_EDIT_FIELDS];

/* ------------------------------------------------------------------ the report */

export interface CityEditChange {
  buildingId: string;
  field: CityEditField;
  /** Short human-readable before and after. Never the whole object — this is a table. */
  from: string;
  to: string;
}

export interface CityEditSkip {
  buildingId: string;
  field: CityEditField;
  reason: "hand" | "unchanged";
}

export interface CityEditPlan {
  /** Ids the selector matched, before `share` was applied. */
  matched: readonly string[];
  /** Ids the edit would actually touch. */
  selected: readonly string[];
  changes: readonly CityEditChange[];
  skipped: readonly CityEditSkip[];
  /** Distinct shell colours after the edit — the material count's honest proxy. */
  shellColorsAfter: number;
  /** Buildings in the scene, unchanged by the edit. */
  totalBuildings: number;
}

/* ------------------------------------------------------------------ helpers */

/** Mulberry32 — the same generator the district and marzipan solvers use. No Math.random. */
function seededRandom(seed: number): () => number {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shellOf(b: PlacedBuilding): string {
  return (b.appearance?.materials?.concrete_main ?? "").toLowerCase();
}

/** Fields a person set deliberately. A bulk op leaves these alone unless forced. */
export function handFields(b: PlacedBuilding): readonly string[] {
  const raw: unknown = b.hand;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Refuse a SINGLE-building edit that would overwrite a field somebody set by hand.
 *
 * `planCityEdit` skips held fields silently, which is right for a sweep over forty towers —
 * the report says what it left alone. A tool aimed at one named building is a different act:
 * the person asked for that building by name, so silence would look like the edit worked.
 * This throws instead, and names the flag that would go through.
 */
export function assertHandFree(
  b: PlacedBuilding,
  field: CityEditField,
  overrideHand?: boolean,
): void {
  if (overrideHand || !handFields(b).includes(field)) return;
  throw new Error(
    `${b.id} has ${field} set by hand, so this edit would undo work somebody did deliberately. ` +
    "Pass overrideHand: true to change it anyway.",
  );
}

export function withHandField(b: PlacedBuilding, field: CityEditField): PlacedBuilding {
  const held = new Set(handFields(b));
  held.add(field);
  return { ...b, hand: [...held].sort() };
}

/* ------------------------------------------------------------------ matching */

export function selectBuildings(
  buildings: readonly PlacedBuilding[],
  selector: CitySelector,
  layout: SceneLayout
): { matched: PlacedBuilding[]; selected: PlacedBuilding[] } {
  const matched = buildings.filter((b) => {
    const c = b.config;
    if (selector.ids && !selector.ids.includes(b.id)) return false;
    if (selector.idPrefix && !b.id.startsWith(selector.idPrefix)) return false;
    if (selector.floorsMin !== undefined && c.floors < selector.floorsMin) return false;
    if (selector.floorsMax !== undefined && c.floors > selector.floorsMax) return false;
    const h = buildingHeightM(c);
    if (selector.heightMinM !== undefined && h < selector.heightMinM) return false;
    if (selector.heightMaxM !== undefined && h > selector.heightMaxM) return false;
    if (selector.shell && shellOf(b) !== selector.shell.toLowerCase()) return false;
    if (selector.entrySide && c.entrySide !== selector.entrySide) return false;
    const fp = buildingFootprintM(c, layout);
    const area = fp.width * fp.depth;
    if (selector.areaMinM2 !== undefined && area < selector.areaMinM2) return false;
    if (selector.areaMaxM2 !== undefined && area > selector.areaMaxM2) return false;
    if (selector.within) {
      const cx = (b.originM?.x ?? 0) + fp.width / 2;
      const cz = (b.originM?.z ?? 0) + fp.depth / 2;
      const r = selector.within;
      if (cx < r.x0 || cx > r.x1 || cz < r.z0 || cz > r.z1) return false;
    }
    if (selector.hasCrown !== undefined && Boolean(c.roofCrown) !== selector.hasCrown) return false;
    if (
      selector.hasLights !== undefined &&
      Boolean(c.interiorLights?.length) !== selector.hasLights
    ) {
      return false;
    }
    return true;
  });

  const share = selector.share ?? 1;
  if (share >= 1) return { matched, selected: [...matched] };
  if (share <= 0) return { matched, selected: [] };

  // Deterministic and STABLE: the roll is keyed to the building id, not to its position
  // in the list, so inserting a building never reshuffles which of its neighbours were
  // chosen. A dry run and the apply that follows must select the same set.
  const rolled = matched
    .map((b) => {
      let acc = selector.seed ?? 0;
      for (let i = 0; i < b.id.length; i++) acc = (acc * 31 + b.id.charCodeAt(i)) | 0;
      return { b, roll: seededRandom(acc)() };
    })
    .sort((p, q) => p.roll - q.roll);
  const take = Math.max(0, Math.min(matched.length, Math.round(matched.length * share)));
  const chosen = new Set(rolled.slice(0, take).map((r) => r.b.id));
  return { matched, selected: matched.filter((b) => chosen.has(b.id)) };
}

/* ------------------------------------------------------------------ applying */

function floorList(op: Extract<CityEditOp, { op: "set_wall" }>, floors: number): number[] {
  const which = op.floors ?? "above_ground";
  if (which === "all") return Array.from({ length: floors }, (_, i) => i);
  if (which === "above_ground") return Array.from({ length: Math.max(0, floors - 1) }, (_, i) => i + 1);
  return which.filter((f) => Number.isInteger(f) && f >= 0 && f < floors);
}

function describeWall(config: BuildingConfig): string {
  const n = config.wallSections?.length ?? 0;
  return n ? `${n} sections` : "default";
}

/** Apply one op to one building. Returns the next building and what visibly changed. */
function applyOp(
  b: PlacedBuilding,
  op: CityEditOp
): { next: PlacedBuilding; change: CityEditChange | null } {
  const c = b.config;
  const field = CITY_EDIT_FIELDS[op.op];
  const same = (from: string, to: string) => from === to;

  switch (op.op) {
    case "set_wall": {
      const sides = op.sides?.length ? op.sides : WALL_SIDES;
      const floors = floorList(op, c.floors);
      const kept = (c.wallSections ?? []).filter(
        (s) => !(sides.includes(s.side) && floors.includes(s.floor))
      );
      const added = floors.flatMap((floor) => sides.map((side) => ({ side, floor, kind: op.kind })));
      const from = describeWall(c);
      const nextConfig: BuildingConfig = {
        ...c,
        wallSections: [...kept, ...added],
        ...(op.windowGrid ? { windowGrid: { ...c.windowGrid, ...op.windowGrid } } : {}),
      };
      const to = `${describeWall(nextConfig)} (${op.kind} on ${sides.length}×${floors.length})`;
      return { next: { ...b, config: nextConfig }, change: { buildingId: b.id, field, from, to } };
    }
    case "set_window_relief": {
      const from = c.windowGrid?.relief ?? "recessed";
      if (same(from, op.relief)) return { next: b, change: null };
      return {
        next: { ...b, config: { ...c, windowGrid: { ...c.windowGrid, relief: op.relief } } },
        change: { buildingId: b.id, field, from, to: op.relief },
      };
    }
    case "set_shell": {
      const from = shellOf(b) || "inherited";
      if (same(from, op.color.toLowerCase())) return { next: b, change: null };
      return {
        next: {
          ...b,
          appearance: {
            ...b.appearance,
            materials: { ...b.appearance?.materials, concrete_main: op.color },
          },
        },
        change: { buildingId: b.id, field, from, to: op.color.toLowerCase() },
      };
    }
    case "set_crown": {
      const from = c.roofCrown?.kind ?? "none";
      const to = op.crown?.kind ?? "none";
      if (same(from, to)) return { next: b, change: null };
      const nextConfig = { ...c };
      if (op.crown) nextConfig.roofCrown = op.crown;
      else delete nextConfig.roofCrown;
      return { next: { ...b, config: nextConfig }, change: { buildingId: b.id, field, from, to } };
    }
    case "set_lights": {
      const from = `${c.interiorLights?.length ?? 0} floors`;
      const wanted = Math.max(0, Math.min(c.floors, Math.round(c.floors * op.floorShare)));
      // Spread the lit floors instead of stacking them at the bottom: a tower lit only on
      // its first six storeys reads as half-built, not as occupied.
      const lights: InteriorLightSpec[] = [];
      if (wanted > 0) {
        const stride = c.floors / wanted;
        for (let i = 0; i < wanted; i++) {
          const floor = Math.min(c.floors - 1, Math.floor(i * stride));
          lights.push({ floor, level: op.level ?? 0.5, warmth: op.warmth ?? 0.6 });
        }
      }
      const to = `${lights.length} floors`;
      if (same(from, to)) return { next: b, change: null };
      const nextConfig = { ...c };
      if (lights.length) nextConfig.interiorLights = lights;
      else delete nextConfig.interiorLights;
      return { next: { ...b, config: nextConfig }, change: { buildingId: b.id, field, from, to } };
    }
    case "set_roof_guard": {
      const from = c.roofGuard;
      if (same(from, op.kind)) return { next: b, change: null };
      return {
        next: { ...b, config: { ...c, roofGuard: op.kind } },
        change: { buildingId: b.id, field, from, to: op.kind },
      };
    }
  }
}

export interface CityEditRequest {
  selector: CitySelector;
  ops: readonly CityEditOp[];
  /** Change fields a person marked by hand. Off by default, on purpose. */
  overrideHand?: boolean;
  /** Mark every field this edit writes as hand-held, so later reruns leave it alone. */
  markHand?: boolean;
}

/**
 * Work out the edit without keeping it. `applyCityEdit` calls this and then takes the
 * buildings, so the table a person approves is produced by the code that does the work.
 */
export function planCityEdit(
  buildings: readonly PlacedBuilding[],
  layout: SceneLayout,
  request: CityEditRequest
): { plan: CityEditPlan; buildings: PlacedBuilding[] } {
  const { matched, selected } = selectBuildings(buildings, request.selector, layout);
  const chosen = new Set(selected.map((b) => b.id));
  const changes: CityEditChange[] = [];
  const skipped: CityEditSkip[] = [];

  const next = buildings.map((building) => {
    if (!chosen.has(building.id)) return building;
    let current = building;
    for (const op of request.ops) {
      const field = CITY_EDIT_FIELDS[op.op];
      if (!request.overrideHand && handFields(current).includes(field)) {
        skipped.push({ buildingId: current.id, field, reason: "hand" });
        continue;
      }
      const { next: updated, change } = applyOp(current, op);
      if (!change) {
        skipped.push({ buildingId: current.id, field, reason: "unchanged" });
        continue;
      }
      current = request.markHand ? withHandField(updated, field) : updated;
      changes.push(change);
    }
    return current;
  });

  const shellColorsAfter = new Set(next.map(shellOf).filter(Boolean)).size;
  return {
    plan: {
      matched: matched.map((b) => b.id),
      selected: selected.map((b) => b.id),
      changes,
      skipped,
      shellColorsAfter,
      totalBuildings: buildings.length,
    },
    buildings: next,
  };
}

/** The same edit, kept. */
export function applyCityEdit(
  buildings: readonly PlacedBuilding[],
  layout: SceneLayout,
  request: CityEditRequest
): { plan: CityEditPlan; buildings: PlacedBuilding[] } {
  return planCityEdit(buildings, layout, request);
}

/** The dry run as a table a person can read in a terminal. */
export function cityEditTable(plan: CityEditPlan): string {
  const lines: string[] = [];
  lines.push(
    `${plan.selected.length} of ${plan.matched.length} matched (${plan.totalBuildings} in the scene)`
  );
  if (!plan.changes.length) lines.push("no change");
  const byField = new Map<string, CityEditChange[]>();
  for (const c of plan.changes) {
    const list = byField.get(c.field) ?? [];
    list.push(c);
    byField.set(c.field, list);
  }
  for (const [field, list] of byField) {
    lines.push(`${field}: ${list.length}`);
    for (const c of list.slice(0, 6)) lines.push(`  ${c.buildingId}  ${c.from} → ${c.to}`);
    if (list.length > 6) lines.push(`  … ${list.length - 6} more`);
  }
  const held = plan.skipped.filter((s) => s.reason === "hand");
  if (held.length) lines.push(`kept by hand: ${held.length}`);
  lines.push(`shell colours after: ${plan.shellColorsAfter}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// EDIT LAYERS — a city you return to, instead of one you rebuild
//
// ★★★ The recipe used to record the RESULT of an edit and nothing about the intent, so
// re-running a generator threw every edit away. `hand` protects your work from a bulk op;
// nothing protected it from a regeneration, and taking a generator improvement therefore
// cost every hour of editing since. Plan: docs/city-edit-layers-plan.md.
//
// A layer is a RULE: a selector plus ops, re-evaluated against whatever city it is replayed
// over. The other kind of edit — a TOUCH, "this one tower keeps its blue" — is not a layer.
// It stays a hand-marked field on the building and is carried across a rebuild by id.
// Conflating the two is the mistake the plan exists to prevent.

export interface CityEditLayer {
  /** Stable across replays; minted once, at creation. */
  id: string;
  /** What a person calls it: "Warmer shells on the south blocks". */
  label: string;
  /** Epoch ms, so the stack can be shown in the order it was built. */
  at: number;
  /**
   * Off means "keep it, do not apply it". Deleting and disabling must be different
   * gestures — experimenting is only cheap if switching a layer off is reversible.
   */
  enabled: boolean;
  request: CityEditRequest;
}

/** How a layer behaved on one replay. `changes: 0` is the interesting case. */
export interface CityEditLayerResult {
  layerId: string;
  label: string;
  /** False when the layer is disabled — it was skipped, not inert. */
  applied: boolean;
  plan: CityEditPlan | null;
}

let layerSeq = 0;

/**
 * Mint a layer. The id is time plus a counter rather than a random uuid so a stack built in
 * one session sorts by creation even if two layers land in the same millisecond.
 */
export function newCityEditLayer(label: string, request: CityEditRequest): CityEditLayer {
  const at = Date.now();
  layerSeq = (layerSeq + 1) % 1000;
  return {
    id: `edit_${at.toString(36)}_${layerSeq.toString(36)}`,
    label: label.trim() || "Untitled edit",
    at,
    enabled: true,
    request,
  };
}

/**
 * Replay a stack over a base, in order.
 *
 * Each layer sees the output of the one before it, which is what makes the stack read the way
 * a person means it: "make them all grey, then make the south ones warm" must not commute.
 *
 * Every plan comes back — including a null for a disabled layer — so a caller can show what
 * each layer did THIS time. A layer that has silently stopped matching anything is the
 * failure that would make people stop trusting the stack, so it must be reportable.
 */
export function applyEditLayers(
  buildings: readonly PlacedBuilding[],
  layout: SceneLayout,
  layers: readonly CityEditLayer[] | undefined
): { buildings: PlacedBuilding[]; results: CityEditLayerResult[] } {
  let current: PlacedBuilding[] = [...buildings];
  const results: CityEditLayerResult[] = [];
  for (const layer of layers ?? []) {
    if (!layer.enabled) {
      results.push({ layerId: layer.id, label: layer.label, applied: false, plan: null });
      continue;
    }
    const { plan, buildings: next } = applyCityEdit(current, layout, layer.request);
    current = next;
    results.push({ layerId: layer.id, label: layer.label, applied: true, plan });
  }
  return { buildings: current, results };
}

/** Layers that ran and changed nothing — the rebuild review's most important line. */
export function inertLayers(results: readonly CityEditLayerResult[]): CityEditLayerResult[] {
  return results.filter((r) => r.applied && (r.plan?.changes.length ?? 0) === 0);
}

/** The replay as a table a person can read before committing to it. */
export function editLayersTable(results: readonly CityEditLayerResult[]): string {
  if (!results.length) return "no edit layers";
  const lines = results.map((r) => {
    if (!r.applied) return `  ○ ${r.label} — off`;
    const changed = r.plan?.changes.length ?? 0;
    const matched = r.plan?.selected.length ?? 0;
    return changed === 0
      ? `  ⚠ ${r.label} — matched ${matched}, changed nothing`
      : `  ● ${r.label} — ${changed} change${changed === 1 ? "" : "s"} on ${matched} building${matched === 1 ? "" : "s"}`;
  });
  const inert = inertLayers(results).length;
  if (inert) lines.push(`${inert} layer${inert === 1 ? "" : "s"} matched nothing — check the selector`);
  return lines.join("\n");
}

/**
 * Fill in every optional field and drop anything unreadable. A layer that names no op is
 * dropped rather than replayed as a no-op: a stack has to mean what it shows.
 */
export function normalizeCityEditLayers(raw: unknown): CityEditLayer[] {
  if (!Array.isArray(raw)) return [];
  const out: CityEditLayer[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const request = r.request as CityEditRequest | undefined;
    if (!request || typeof request !== "object") continue;
    if (!Array.isArray(request.ops) || request.ops.length === 0) continue;
    if (!request.selector || typeof request.selector !== "object") continue;
    const id = typeof r.id === "string" && r.id.trim() ? r.id.trim().slice(0, 64) : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: typeof r.label === "string" && r.label.trim() ? r.label.trim().slice(0, 120) : "Untitled edit",
      at: Number.isFinite(Number(r.at)) ? Number(r.at) : 0,
      enabled: r.enabled !== false,
      request,
    });
  }
  return out;
}
