/**
 * Scaffold → detail workflow: lock structural spec, then patch materials/visibility.
 * Spec: docs/building-workflow-scaffold-and-detail.md
 */

import type { SceneComponent, SceneSpec } from "./scene-spec-contract";
import { approveComponent } from "./scene-spec-contract";
import type { BuildingConfig, SceneLayout } from "./types";
import type { MaterialToken } from "./material-tokens";
import { componentBaseId } from "./component-id";
import { isSiteScoped } from "./floor-props";

export type WorkflowPhase = "scaffold" | "detail";

export type FloorDisplayMode = "normal" | "dim_others" | "hide_others";

export interface DetailViewState {
  focusedFloors: number[];
  displayMode: FloorDisplayMode;
  includeRoof?: boolean;
}

export interface ScaffoldSnapshot {
  lockedAt: string;
  building?: BuildingConfig;
  scene: SceneLayout;
  materialTokens: Record<MaterialToken, string>;
  components: SceneComponent[];
  smartObjects?: SceneSpec["smartObjects"];
}

export interface BuildingWorkflowState {
  phase: WorkflowPhase;
  scaffoldSnapshot?: ScaffoldSnapshot;
  detailView?: DetailViewState;
}

const STRUCTURAL_LOCK_TYPES = new Set([
  "floor_slab",
  "floor_opening",
  "roof_slab",
  "column",
  "column_grid",
  "l_ramp",
  "ramp_run",
  "landing",
  "elevator_shaft",
  "facade_zone",
  "glass_panel",
  "mullion",
  "parapet",
  "wall",
  "platform",
]);

export function workflowPhase(spec: SceneSpec | null | undefined): WorkflowPhase {
  return spec?.workflow?.phase ?? "scaffold";
}

export function isScaffoldPhase(spec: SceneSpec | null | undefined): boolean {
  return workflowPhase(spec) === "scaffold";
}

export function isDetailPhase(spec: SceneSpec | null | undefined): boolean {
  return workflowPhase(spec) === "detail";
}

export function isStructuralForScaffoldLock(type: string): boolean {
  return STRUCTURAL_LOCK_TYPES.has(type);
}

/** Infer story index from stable component id / spec. */
export function componentFloorIndex(
  comp: SceneComponent,
  roofFloorIndex?: number
): number | "roof" | null {
  // Roof-tagged components resolve to the "roof" sentinel even when they carry a
  // numeric floorIndex (the roof index). The focus system represents the roof as a
  // sentinel + includeRoof flag, not as a numbered floor, so this must win over the
  // numeric spec value or roof guards/terrace get hidden under roof-only focus.
  // Id parsing tolerates a `bN::` building prefix: the regexes below match on the base
  // part anyway, and the equality checks strip it via componentBaseId.
  const baseId = componentBaseId(comp.id);
  const roofMatch = comp.id.match(/(?:^|_)roof(?:_|$)/);
  if (roofMatch || baseId === "roof_slab_main" || baseId === "l_ramp_roof") {
    return "roof";
  }

  const fromSpec = comp.spec.floorIndex;
  if (typeof fromSpec === "number") return fromSpec;

  const levelMatch = comp.id.match(/level_(\d+)$/);
  if (levelMatch) return parseInt(levelMatch[1]!, 10);

  const m = comp.id.match(/_f(\d+)(?:_|$)/);
  if (m) return parseInt(m[1]!, 10);

  if (comp.type === "column_grid") return null;
  if (comp.type === "column" && comp.spec.columnHeightMode === "full_building") return null;

  void roofFloorIndex;
  return null;
}

export function listFloorIndices(spec: SceneSpec): number[] {
  const floors = spec.building?.floors ?? 0;
  return Array.from({ length: Math.max(0, floors) }, (_, i) => i);
}

export function componentsForFloor(
  spec: SceneSpec,
  floor: number | "roof"
): SceneComponent[] {
  const roofIndex = spec.building?.floors ?? 0;
  return spec.components.filter((c) => {
    const idx = componentFloorIndex(c, roofIndex);
    if (floor === "roof") return idx === "roof";
    if (idx === null) return floor === 0;
    return idx === floor;
  });
}

function cloneComponent(comp: SceneComponent): SceneComponent {
  return {
    ...comp,
    anchors: comp.anchors.map((a) => ({ ...a })),
    connectionTargets: comp.connectionTargets.map((t) => ({ ...t })),
    render: { ...comp.render },
    collider: { ...comp.collider },
    validationRules: [...comp.validationRules],
    spec: { ...comp.spec },
    debug: comp.debug ? { ...comp.debug } : undefined,
  };
}

export function createScaffoldSnapshot(spec: SceneSpec): ScaffoldSnapshot {
  return {
    lockedAt: new Date().toISOString(),
    building: spec.building ? { ...spec.building } : undefined,
    scene: { ...spec.scene },
    materialTokens: { ...spec.materialTokens },
    components: spec.components.map(cloneComponent),
    // Always capture (even empty) so unlock can remove smart objects added in detail.
    smartObjects: (spec.smartObjects ?? []).map((e) => ({ ...e })),
  };
}

/** Lock structural geometry; save snapshot; enter detail phase. */
export function lockScaffold(spec: SceneSpec): SceneSpec {
  const snapshot = spec.workflow?.scaffoldSnapshot ?? createScaffoldSnapshot(spec);
  const components = spec.components.map((c) =>
    isStructuralForScaffoldLock(c.type) ? approveComponent(cloneComponent(c)) : cloneComponent(c)
  );
  return {
    ...spec,
    components,
    workflow: {
      phase: "detail",
      scaffoldSnapshot: snapshot,
      detailView: spec.workflow?.detailView ?? {
        focusedFloors: [],
        displayMode: "normal",
      },
    },
  };
}

/**
 * Unlock WITHOUT reverting: keep everything as it currently stands (components,
 * building config, smart objects) and just reopen the structural components for
 * scaffold editing. The lock-time snapshot is dropped — "revert to the lock point"
 * is the separate, explicit `unlockScaffold` below, not the price of unlocking.
 * This is the default unlock: floor customizations must never be disposable just
 * because the user wants to change the floor count.
 */
export function unlockScaffoldKeep(spec: SceneSpec): SceneSpec {
  return {
    ...spec,
    components: spec.components.map((c) =>
      isStructuralForScaffoldLock(c.type)
        ? { ...cloneComponent(c), locked: false, approved: false }
        : cloneComponent(c)
    ),
    workflow: { phase: "scaffold" },
  };
}

/** Restore scaffold snapshot and discard detail-phase spec changes. */
export function unlockScaffold(spec: SceneSpec): SceneSpec {
  const snap = spec.workflow?.scaffoldSnapshot;
  if (!snap) {
    return { ...spec, workflow: { phase: "scaffold" } };
  }
  return {
    ...spec,
    building: snap.building ? { ...snap.building } : spec.building,
    scene: { ...snap.scene },
    materialTokens: { ...snap.materialTokens },
    components: snap.components.map(cloneComponent),
    // Restore smart objects too — detail-phase smart edits must not survive unlock.
    smartObjects: snap.smartObjects ? snap.smartObjects.map((e) => ({ ...e })) : spec.smartObjects,
    workflow: { phase: "scaffold" },
  };
}

/**
 * Floor focus is active when a non-normal display mode is paired with an actual
 * selection. The roof is selected via `includeRoof` with an EMPTY focusedFloors list,
 * so "no floors selected" alone does not mean "no focus" — it could be roof-only focus.
 */
export function isFocusActive(focus: DetailViewState): boolean {
  return focus.displayMode !== "normal" && (focus.focusedFloors.length > 0 || !!focus.includeRoof);
}

export function componentMatchesFocus(
  comp: SceneComponent,
  focus: DetailViewState,
  roofFloorIndex: number
): boolean {
  if (!isFocusActive(focus)) {
    return true;
  }
  // Site content stands on the PLOT, so no floor selection excludes it. This is not a
  // display nicety: applyDetailViewVisibility PERSISTS the answer as render.visible, and
  // componentFloorIndex hands back the raw −1 sentinel, which matches no focused floor.
  // Isolating a floor therefore stamped every site zone and site prop hidden in the saved
  // spec — and the attach pass skips render.visible === false, so they stopped rendering
  // and would have been dropped from the export too.
  if (isSiteScoped(comp.spec as unknown as { floorIndex?: number; scope?: string })) return true;
  const idx = componentFloorIndex(comp, roofFloorIndex);
  if (idx === null) return true;
  if (idx === "roof") {
    return focus.includeRoof ?? focus.focusedFloors.includes(roofFloorIndex);
  }
  return focus.focusedFloors.includes(idx);
}

/** Apply hide_others visibility in spec (persisted). dim_others is UI-only. */
export function applyDetailViewVisibility(spec: SceneSpec): SceneComponent[] {
  const detail = spec.workflow?.detailView;
  if (!detail || detail.displayMode !== "hide_others" || !isFocusActive(detail)) {
    return spec.components;
  }
  const roofFloorIndex = spec.building?.floors ?? 0;
  return spec.components.map((c) => {
    const show = componentMatchesFocus(c, detail, roofFloorIndex);
    return {
      ...c,
      render: { ...c.render, visible: show },
    };
  });
}

export function setDetailView(spec: SceneSpec, detailView: DetailViewState): SceneSpec {
  const prevMode = spec.workflow?.detailView?.displayMode;
  const next: SceneSpec = {
    ...spec,
    workflow: {
      phase: spec.workflow?.phase ?? "detail",
      scaffoldSnapshot: spec.workflow?.scaffoldSnapshot,
      detailView,
    },
  };
  if (detailView.displayMode === "hide_others" && isFocusActive(detailView)) {
    return { ...next, components: applyDetailViewVisibility(next) };
  }
  if (prevMode === "hide_others" && detailView.displayMode !== "hide_others") {
    return {
      ...next,
      components: next.components.map((c) => ({
        ...c,
        render: { ...c.render, visible: true },
      })),
    };
  }
  return next;
}
