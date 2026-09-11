/**
 * Persistent scene spec and patch-based edit contract (v1.0).
 * Spec: rules/scene-spec-and-patches.md
 */

import type { BuildingConfig, PlacedBuilding, SceneLayout } from "./types";
import type { DeployTargetConfig } from "./deploy-target";
import type { ColliderOutput } from "./collider-contract";
import type { MaterialToken } from "./material-tokens";
import type { ComponentType } from "./component-registry";
import type { SmartEntity } from "./smart-object-contract";
import type { SocialSurfaceConfig } from "./social-surface-contract";
import type { BuildingWorkflowState } from "./scaffold-workflow";
import type { ProductKind } from "./product-kind";
import type { LiveEventsBoardConfig } from "./live-events-board-contract";
import { defaultMaterialTokenColors } from "./material-tokens";
import { defaultSocialSurfaceConfig } from "./social-surface-contract";

export const SCENE_SPEC_VERSION = "1.0" as const;

export type { MaterialToken } from "./material-tokens";
export {
  ALL_MATERIAL_TOKENS,
  MATERIAL_TOKEN_PRESETS,
  DEFAULT_MATERIAL_TOKEN_BY_TYPE,
  defaultTokenForType,
  isKnownMaterialToken,
  defaultMaterialTokenColors,
} from "./material-tokens";

export type EditMode =
  | "repair_only"
  | "modify_selected"
  | "redesign_area"
  | "redesign_full";

export type { BuildingWorkflowState, WorkflowPhase, DetailViewState } from "./scaffold-workflow";

export interface SceneAnchor {
  id: string;
  x: number;
  y: number;
  z: number;
  role?: string;
}

export interface ConnectionTarget {
  targetId: string;
  anchorId?: string;
  edgeId?: string;
  kind: "edge" | "anchor" | "parent" | "platform" | "landing" | "slab";
}

export interface RenderSettings {
  visible?: boolean;
  debugLabel?: boolean;
  /** Per-component hex override (detail phase); does not change global material roles. */
  colorOverride?: string;
}

export interface ColliderSettings {
  enabled: boolean;
  type?: "box" | "ramp" | "split_boxes" | "simple_barrier" | "frame_only" | "none";
  role?: string;
  skipEdges?: string[];
  height?: number;
  thickness?: number;
}

export interface DebugMetadata {
  lastPatchedAt?: string;
  patchId?: string;
  notes?: string;
}

export interface SceneComponent {
  id: string;
  type: ComponentType | string;
  parentId: string | null;
  name: string;
  materialToken: MaterialToken;
  locked: boolean;
  approved: boolean;
  anchors: SceneAnchor[];
  connectionTargets: ConnectionTarget[];
  render: RenderSettings;
  collider: ColliderSettings;
  validationRules: string[];
  spec: Record<string, unknown>;
  debug?: DebugMetadata;
}

export type { SmartEntity, SmartMovementSpec, SmartBehaviorKind } from "./smart-object-contract";

export interface SceneSpec {
  version: typeof SCENE_SPEC_VERSION;
  /** Optional project archetype; absent legacy specs are ordinary builder projects. */
  productKind?: ProductKind;
  name: string;
  scene: SceneLayout;
  components: SceneComponent[];
  /** Interactive entities — separate GLBs / runtime systems, not part of the main build mesh. */
  smartObjects?: SmartEntity[];
  /**
   * Surface 4 — Social: event profile, gating, media, zone roles.
   * Spec: rules/surface-4-social.md
   */
  social?: SocialSurfaceConfig;
  /** Optional live-events board, independent from Social/Dance. */
  liveEventsBoard?: LiveEventsBoardConfig;
  /**
   * How bodies move in this scene, as multipliers of the explorer's own speeds.
   * Scene-level on purpose: AvatarLocomotionSettings is scoped to the running
   * scene by the SDK, so a world-level control would promise something the
   * runtime cannot keep. See shared/avatar-controls.ts.
   */
  avatarControls?: import("./avatar-controls").AvatarControlsConfig;
  /** Plot vehicles (Eclipse Cruiser). DCL scene metres, SW origin. */
  vehicles?: import("./vehicle-contract").VehicleSpec[];
  materialTokens: Record<MaterialToken, string>;
  /**
   * Bulk city edits as RULES, in the order a person applied them, replayed over whatever
   * base this scene is rebuilt from. Authoring-time only — the scene runtime never reads
   * it, so it costs the deploy nothing. See `shared/city-edit.ts` and
   * `docs/city-edit-layers-plan.md`.
   */
  edits?: import("./city-edit").CityEditLayer[];
  editMode: EditMode;
  glass?: {
    color: string;
    opacity: number;
    roughness: number;
    metalness: number;
  };
  deploy?: DeployTargetConfig;
  /** Transitional: high-level building config until full spec migration. */
  building?: BuildingConfig;
  /**
   * All placed buildings on the plot. `building` mirrors `buildings[0].config`.
   * Required to import a multi-tower recipe without dropping extras.
   */
  buildings?: PlacedBuilding[];
  /**
   * Building palette from ComposerRecipe (`floor_main`, `glass_main`, …).
   * Distinct from `materialTokens` (component-level tokens). Carried so a recipe
   * imported as a draft does not lose its finishes when saved via parseRecipe.
   */
  materials?: Record<string, string>;
  /** Hard scene-wide emission kill, carried from ComposerRecipe. */
  noEmissive?: boolean;
  /** Procedural floor texture kind, carried from ComposerRecipe. */
  floorTexture?: string;
  /** Scaffold → detail workflow (lock structure, then per-floor customization). */
  workflow?: BuildingWorkflowState;
  selectedComponentId?: string;
}

export interface ComponentBuildOutput {
  componentId: string;
  generatedRenderMesh: string;
  generatedColliderMesh: string | string[];
  colliders?: ColliderOutput[];
  validationErrors: string[];
  changedInLastPatch: boolean;
}

export type PatchOp = "set" | "add" | "remove";

export interface ScenePatchOperation {
  op: PatchOp;
  /** Structural component target (omit when smartObjectId is set). */
  componentId?: string;
  /** Smart entity target — separate from structural components[]. */
  smartObjectId?: string;
  path?: string;
  value?: unknown;
  component?: SceneComponent;
  smartObject?: SmartEntity;
}

export interface SceneEditPatch {
  patchId: string;
  summary: string;
  editMode?: EditMode;
  allowMaterialChange?: boolean;
  allowGeometryChange?: boolean;
  /** Repair patches may modify locked ramp/guard components. */
  repairOverride?: boolean;
  /** When set, patch is scoped to this component subtree only (modify_selected). */
  selectedComponentId?: string;
  /** Required for redesign_full or building.* ops. */
  confirmedFullRedesign?: boolean;
  ops: ScenePatchOperation[];
}

export interface PatchValidationResult {
  ok: boolean;
  affectedIds: string[];
  preservedIds: string[];
  lockedIds: string[];
  rejectedIds: string[];
  errors: string[];
  warnings: string[];
}

export interface PatchPreviewResult extends PatchValidationResult {
  wouldChange: string[];
}

export interface ChangeReport {
  patchId: string;
  summary: string;
  changed: string[];
  preserved: string[];
  locked: string[];
  validation: PatchValidationResult;
  materialTokensUsed: MaterialToken[];
}

/** Full inspector output shown before every selected-component edit. */
export interface PatchInspectorReport {
  originalRequest: string;
  selectedComponentId: string | null;
  selectedComponentType: string | null;
  aiInterpretation: string;
  allowedOperations: string[];
  allowedComponentIds: string[];
  proposedChangedIds: string[];
  preservedComponentIds: string[];
  validationChecks: Array<{ id: string; ok: boolean; detail: string }>;
  rejectedChanges: string[];
  proposedPatch: SceneEditPatch;
  validation: PatchValidationResult;
  canApply: boolean;
}

export const RAMP_VALIDATION_RULES = [
  "anchor_heights_preserved",
  "must_slope_when_y_differs",
  "end_connects_to_platform_edge",
  "start_connects_to_slab_or_landing",
  "no_flat_unless_y_equal",
  "no_float",
] as const;

export const GUARDRAIL_VALIDATION_RULES = [
  "platform_fall_protection",
  "opening_fall_protection",
  "exits_and_connections_open",
  "attached_to_target_edges",
  "preserve_approved_on_unrelated_edit",
  "frame_black_default",
] as const;

export const PATCH_VALIDATION_CHECKS = [
  "list_affected_ids",
  "no_unrelated_component_changes",
  "no_locked_component_changes",
  "material_token_permission",
  "ramp_connection_integrity",
  "required_guardrails_preserved",
] as const;

export function approveComponent(component: SceneComponent): SceneComponent {
  return { ...component, approved: true, locked: true };
}

export function createEmptySceneSpec(
  name: string,
  scene: SceneLayout,
  building?: BuildingConfig
): SceneSpec {
  return {
    version: SCENE_SPEC_VERSION,
    name,
    scene,
    components: [],
    smartObjects: [],
    social: defaultSocialSurfaceConfig(name),
    materialTokens: defaultMaterialTokenColors(),
    editMode: "modify_selected",
    building,
  };
}

export function collectAffectedComponentIds(
  spec: SceneSpec,
  patch: SceneEditPatch
): string[] {
  const ids = new Set<string>();
  for (const op of patch.ops) {
    if (op.smartObjectId) {
      ids.add(op.smartObjectId);
      continue;
    }
    if (op.componentId) ids.add(op.componentId);
    if (op.op === "add" && op.component?.parentId) {
      ids.add(op.component.parentId);
    }
    const parent = op.componentId
      ? spec.components.find((c) => c.id === op.componentId)
      : undefined;
    if (parent) {
      for (const child of spec.components) {
        if (child.parentId === parent.id) ids.add(child.id);
      }
    }
  }
  for (const c of spec.components) {
    if (c.locked) continue;
    for (const conn of c.connectionTargets) {
      if (ids.has(conn.targetId)) ids.add(c.id);
    }
  }
  return [...ids];
}

export function preservedComponentIds(spec: SceneSpec, affectedIds: string[]): string[] {
  const affected = new Set(affectedIds);
  return spec.components.filter((c) => !affected.has(c.id)).map((c) => c.id);
}

export function lockedComponentIds(spec: SceneSpec): string[] {
  return spec.components.filter((c) => c.locked).map((c) => c.id);
}

/**
 * Re-apply user edits (lock/approve/material/colorOverride/visibility) from a
 * previous component set onto freshly regenerated components, matched by id.
 * The safety net for paths that re-generate the spec from the building — without
 * it, a re-migrate (legacy/version-mismatch spec) silently drops every edit.
 */
export function mergeComponentState(
  next: SceneComponent[],
  previous: SceneComponent[] | undefined
): SceneComponent[] {
  if (!previous?.length) return next;
  const byId = new Map(previous.map((c) => [c.id, c]));
  return next.map((c) => {
    const old = byId.get(c.id);
    if (!old) return c;
    return {
      ...c,
      locked: old.locked,
      approved: old.approved,
      materialToken: old.locked ? old.materialToken : c.materialToken,
      render:
        old.locked || old.render?.colorOverride || old.render?.visible === false
          ? {
              ...c.render,
              colorOverride: old.render?.colorOverride,
              visible: old.render?.visible ?? c.render?.visible,
            }
          : c.render,
    };
  });
}
