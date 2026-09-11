/**
 * Collider generation contract — canonical types for the separate physics layer.
 * Spec: rules/collider-generation.md
 */

/** Low-poly physics primitive assigned at export. */
export type ColliderShapeType =
  | "box"
  | "plane"
  | "ramp"
  | "convex"
  | "split_boxes"
  | "frame_only";

/** Semantic role — drives validation and DCL layer grouping. */
export type ColliderRole =
  | "walkable_floor"
  | "walkable_ramp"
  | "walkable_landing"
  | "barrier_guardrail"
  | "barrier_wall"
  | "barrier_post"
  | "structural_column"
  | "door_frame";

/** Export / engine collision grouping (extend as DCL layers are wired). */
export type CollisionLayer = "walkable" | "barrier" | "structural";

/** Opening edge roles that must never receive guardrail colliders. */
export const COLLIDER_NO_GUARD_EDGE_ROLES = [
  "ramp_exit",
  "stair_exit",
  "access_gap",
  "doorway",
  "walking_connection",
] as const;

export type ColliderNoGuardEdgeRole = (typeof COLLIDER_NO_GUARD_EDGE_ROLES)[number];

export interface ColliderBoxSpec {
  type: "box";
  size: [number, number, number];
  offset?: [number, number, number];
}

export interface ColliderRampSpec {
  type: "ramp";
  footprint: [number, number];
  rise: number;
  mirror?: boolean;
}

export interface ColliderSplitFloorSpec {
  type: "split_boxes";
  /** Opening width × depth to subtract from slab (colliders placed around void). */
  openingSize: [number, number];
}

export interface ColliderFrameSpec {
  type: "frame_only";
  openingWidth: number;
  openingHeight: number;
}

export type ColliderShapeSpec =
  | ColliderBoxSpec
  | ColliderRampSpec
  | ColliderSplitFloorSpec
  | ColliderFrameSpec;

/** Metadata emitted by a component generator alongside render geometry. */
export interface ColliderOutput {
  id: string;
  componentId: string;
  colliderType: ColliderShapeType;
  colliderRole: ColliderRole;
  collisionLayer: CollisionLayer;
  shape: ColliderShapeSpec;
  /** Stable name suffix for export (`*_collider`). */
  name: string;
}

export interface ColliderValidationResult {
  ok: boolean;
  errors: string[];
}

/** Validation rules from rules/collider-generation.md */
export const COLLIDER_VALIDATION_CHECKS = [
  "no_collider_over_floor_opening",
  "no_collider_blocking_ramp_exit",
  "no_collider_blocking_doorway_or_access_gap",
  "walkable_floor_coverage",
  "ramp_surface_coverage",
  "guarded_edge_barrier_coverage",
  "collider_independent_of_render_tri_count",
] as const;
