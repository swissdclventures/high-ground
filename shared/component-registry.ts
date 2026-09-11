/**
 * Component type registry — schemas and metadata for scene component types.
 * Spec: rules/scene-editing-architecture.md (component registry)
 *
 * ## The union below is the BUILT-IN vocabulary, not the whole vocabulary
 *
 * These 28 names are the host's six plot nouns plus the Building app's 22
 * structural ones, and they are UNPREFIXED forever. Every other builder app
 * declares `<appId>:<type>` — `swissverse.water:water_body` — and registers it
 * at mount through `registerAppComponentTypes`.
 *
 * That asymmetry is deliberate and is the same trick component-id namespacing
 * already uses, where the primary building `b1` keeps bare ids and `b2::` and
 * up carry a prefix: the incumbent pays no migration, and only new entrants
 * carry a namespace. ~95 type literals across 21 files stay untouched, and the
 * exhaustive `REGISTRY` below keeps compile-time checking for the names that
 * actually have schemas.
 *
 * ## What an unregistered type does
 *
 * Exactly what it did before this file opened: nothing resolves, so the scene
 * spec carries it as data and the composer renders `unsupported_component`.
 * A type is not an error — it is a type belonging to an app that is not
 * installed, which is the normal state of a plot whose author uninstalled
 * something. Never throw on an unknown type; that would make uninstalling an
 * app corrupt every file that mentions it.
 *
 * Related: shared/builder-app-contract.ts (BuilderComponentTypeDef),
 * shared/component-id.ts (the id half of the same namespacing scheme).
 */

import type { MaterialToken } from "./material-tokens";
import { defaultTokenForType } from "./material-tokens";

export type ComponentType =
  | "parcel"
  | "floor_slab"
  | "floor_opening"
  | "platform"
  | "column_grid"
  | "column"
  | "facade_zone"
  | "glass_panel"
  | "mullion"
  | "ramp_run"
  | "l_ramp"
  | "circulation_core"
  | "landing"
  | "elevator_shaft"
  | "elevator_platform"
  | "stair_run"
  | "guardrail"
  | "opening_guardrail"
  | "wall"
  | "door"
  | "window"
  | "roof_slab"
  | "parapet"
  | "text_sign"
  | "floor_prop"
  | "floor_zone"
  | "collider_group"
  | "unsupported_component";

export const ALL_COMPONENT_TYPES: ComponentType[] = [
  "parcel",
  "floor_slab",
  "floor_opening",
  "platform",
  "column_grid",
  "column",
  "facade_zone",
  "glass_panel",
  "mullion",
  "ramp_run",
  "l_ramp",
  "circulation_core",
  "landing",
  "elevator_shaft",
  "elevator_platform",
  "stair_run",
  "guardrail",
  "opening_guardrail",
  "wall",
  "door",
  "window",
  "roof_slab",
  "parapet",
  "text_sign",
  "floor_prop",
  "floor_zone",
  "collider_group",
  "unsupported_component",
];

/**
 * Any component type id: a built-in name, or an app's `<appId>:<type>`.
 *
 * `string & {}` rather than plain `string` so a built-in name still
 * autocompletes and a typo in one is still caught — widening to `string`
 * outright would quietly delete the checking that 21 files rely on.
 */
export type ComponentTypeId = ComponentType | (string & {});

export interface ComponentTypeDef {
  type: ComponentTypeId;
  requiredInputs: string[];
  optionalInputs: string[];
  defaults: Record<string, unknown>;
  allowedChildren: ComponentTypeId[];
  defaultMaterialToken: MaterialToken;
  validationRules: string[];
  hasGenerator: boolean;
}

const REGISTRY: Record<ComponentType, ComponentTypeDef> = {
  parcel: {
    type: "parcel",
    requiredInputs: ["width", "depth"],
    optionalInputs: [],
    defaults: { width: 16, depth: 16 },
    allowedChildren: ["floor_slab", "column_grid", "facade_zone"],
    defaultMaterialToken: "concrete_light",
    validationRules: [],
    hasGenerator: false,
  },
  floor_slab: {
    type: "floor_slab",
    requiredInputs: ["width", "depth", "thickness", "floorIndex"],
    optionalInputs: ["openingId"],
    defaults: { thickness: 0.2 },
    allowedChildren: ["floor_opening"],
    defaultMaterialToken: "concrete_light",
    validationRules: ["walkable_floor_coverage"],
    hasGenerator: true,
  },
  floor_opening: {
    type: "floor_opening",
    requiredInputs: ["parentSlabId", "edges"],
    optionalInputs: [],
    defaults: {},
    allowedChildren: ["opening_guardrail"],
    defaultMaterialToken: "concrete_light",
    validationRules: ["opening_void_no_collider", "fall_protection_guarded"],
    hasGenerator: true,
  },
  platform: {
    type: "platform",
    requiredInputs: ["width", "depth", "thickness", "floorY"],
    optionalInputs: ["exposedEdges"],
    defaults: { thickness: 0.12 },
    allowedChildren: ["guardrail"],
    defaultMaterialToken: "concrete_light",
    validationRules: ["platform_fall_protection"],
    hasGenerator: true,
  },
  column_grid: {
    type: "column_grid",
    requiredInputs: ["cornerColumns", "intermediateColumnsPerSide"],
    optionalInputs: ["columnProfile", "columnWidth", "columnDepth", "columnHeightMode"],
    defaults: {
      cornerColumns: true,
      intermediateColumnsPerSide: { front: 0, back: 0, left: 0, right: 0 },
      columnProfile: "rectangular",
      columnWidth: 0.3,
      columnDepth: 0.3,
      columnHeightMode: "per_floor",
      dedupeCornerColumns: true,
    },
    allowedChildren: ["column"],
    defaultMaterialToken: "concrete_light",
    validationRules: ["columns_match_layout"],
    hasGenerator: true,
  },
  column: {
    type: "column",
    requiredInputs: ["x", "z", "height", "baseY"],
    optionalInputs: ["side", "role", "index"],
    defaults: {},
    allowedChildren: [],
    defaultMaterialToken: "concrete_light",
    validationRules: [],
    hasGenerator: true,
  },
  facade_zone: {
    type: "facade_zone",
    requiredInputs: ["side", "floorIndex", "start", "end", "bottomY", "topY"],
    optionalInputs: ["mode", "panelGap", "edgeMargin", "panelsPerBay", "facadeColliderMode"],
    defaults: {
      mode: "fill_bays",
      panelGap: 0.05,
      edgeMargin: 0.02,
      panelsPerBay: 1,
      facadeColliderMode: "continuous_barrier",
      alignToStructuralGrid: true,
    },
    allowedChildren: ["glass_panel", "mullion", "window", "door", "text_sign"],
    defaultMaterialToken: "glass_dark",
    validationRules: ["facade_gaps_match_mode", "minimum_panel_width"],
    hasGenerator: false,
  },
  glass_panel: {
    type: "glass_panel",
    requiredInputs: ["width", "height", "center", "rotationY"],
    optionalInputs: ["bayIndex", "omitMullionStart", "omitMullionEnd"],
    defaults: {},
    allowedChildren: ["mullion"],
    defaultMaterialToken: "glass_dark",
    validationRules: ["glass_within_zone"],
    hasGenerator: true,
  },
  mullion: {
    type: "mullion",
    requiredInputs: ["parentPanelId"],
    optionalInputs: [],
    defaults: {},
    allowedChildren: [],
    defaultMaterialToken: "frame_black",
    validationRules: [],
    hasGenerator: true,
  },
  ramp_run: {
    type: "ramp_run",
    requiredInputs: ["from", "to", "width", "thickness"],
    optionalInputs: ["toeMode", "toeLength", "guardrails", "groundY"],
    defaults: { toeMode: "short_transition", toeLength: 0.45, guardrails: true, thickness: 0.12 },
    allowedChildren: ["guardrail"],
    defaultMaterialToken: "concrete_light",
    validationRules: [
      "must_slope_when_y_differs",
      "no_float",
      "end_connects_to_platform_edge",
      "start_connects_to_slab_or_landing",
    ],
    hasGenerator: true,
  },
  l_ramp: {
    type: "l_ramp",
    requiredInputs: ["floorIndex", "floorBaseY", "storyHeight"],
    optionalInputs: ["walkWidth", "isRoof", "roofBaseY"],
    defaults: { walkWidth: 2.0, guardrails: true },
    allowedChildren: ["ramp_run", "landing", "guardrail"],
    defaultMaterialToken: "concrete_light",
    validationRules: ["must_slope_when_y_differs", "no_float"],
    hasGenerator: true,
  },
  circulation_core: {
    type: "circulation_core",
    requiredInputs: ["version", "footprint", "shaftSize", "floors", "boardingEdge"],
    optionalInputs: ["roofTerrace", "storyHeights"],
    defaults: { version: 2, footprint: 8, shaftSize: 4, boardingEdge: "south" },
    allowedChildren: [],
    defaultMaterialToken: "concrete_light",
    validationRules: ["core_contract", "shaft_fits_opening", "door_walkable"],
    hasGenerator: true,
  },
  landing: {
    type: "landing",
    requiredInputs: ["cornerA", "cornerB", "thickness", "floorY"],
    optionalInputs: [],
    defaults: { thickness: 0.12 },
    allowedChildren: ["guardrail"],
    defaultMaterialToken: "concrete_light",
    validationRules: ["platform_fall_protection"],
    hasGenerator: true,
  },
  elevator_shaft: {
    type: "elevator_shaft",
    requiredInputs: ["floorIndex", "floorBaseY", "storyHeight"],
    optionalInputs: ["entryEdge", "portMatings"],
    defaults: { shaftWidth: 3.6 },
    allowedChildren: [],
    defaultMaterialToken: "frame_black",
    validationRules: ["ports_mated", "shaft_fits_opening", "door_walkable"],
    hasGenerator: true,
  },
  elevator_platform: {
    type: "elevator_platform",
    requiredInputs: ["centerX", "centerZ", "width", "depth", "thickness"],
    optionalInputs: ["smartObject"],
    defaults: { width: 2.0, depth: 2.0, thickness: 0.12 },
    allowedChildren: [],
    defaultMaterialToken: "concrete_light",
    validationRules: ["platform_fall_protection"],
    hasGenerator: true,
  },
  stair_run: {
    type: "stair_run",
    requiredInputs: [],
    optionalInputs: [],
    defaults: {},
    allowedChildren: [],
    defaultMaterialToken: "concrete_light",
    validationRules: [],
    hasGenerator: false,
  },
  guardrail: {
    type: "guardrail",
    requiredInputs: ["targetComponentId", "targetEdgeId"],
    optionalInputs: ["postHeight", "postSpacing", "levelHandrail", "trimStart", "trimEnd"],
    defaults: { postHeight: 0.75, postSpacing: 0.85, materialToken: "frame_black" },
    allowedChildren: [],
    defaultMaterialToken: "frame_black",
    validationRules: ["attached_to_target_edges", "exits_and_connections_open", "frame_black_default"],
    hasGenerator: true,
  },
  opening_guardrail: {
    type: "opening_guardrail",
    requiredInputs: ["openingId", "floorY"],
    optionalInputs: ["glass"],
    defaults: { glass: false },
    allowedChildren: [],
    defaultMaterialToken: "frame_black",
    validationRules: ["opening_fall_protection", "exits_and_connections_open"],
    hasGenerator: true,
  },
  wall: {
    type: "wall",
    requiredInputs: ["side", "floorIndex"],
    optionalInputs: ["wallType"],
    defaults: { wallType: "glass" },
    allowedChildren: ["glass_panel", "door", "window"],
    defaultMaterialToken: "glass_dark",
    validationRules: [],
    hasGenerator: true,
  },
  door: {
    type: "door",
    requiredInputs: ["parentWallId", "width", "height"],
    optionalInputs: [],
    defaults: {},
    allowedChildren: [],
    defaultMaterialToken: "frame_black",
    validationRules: [],
    hasGenerator: false,
  },
  window: {
    type: "window",
    requiredInputs: ["parentWallId", "width", "height"],
    optionalInputs: [],
    defaults: {},
    allowedChildren: [],
    defaultMaterialToken: "glass_dark",
    validationRules: [],
    hasGenerator: false,
  },
  roof_slab: {
    type: "roof_slab",
    requiredInputs: ["width", "depth", "thickness", "baseY"],
    optionalInputs: ["openingId"],
    defaults: { thickness: 0.2 },
    allowedChildren: ["floor_opening", "parapet"],
    defaultMaterialToken: "concrete_light",
    validationRules: ["walkable_floor_coverage"],
    hasGenerator: true,
  },
  parapet: {
    type: "parapet",
    requiredInputs: ["perimeter"],
    optionalInputs: ["glass"],
    defaults: { glass: true },
    allowedChildren: [],
    defaultMaterialToken: "frame_black",
    validationRules: [],
    hasGenerator: true,
  },
  text_sign: {
    type: "text_sign",
    requiredInputs: ["text", "attachMode"],
    optionalInputs: [
      "mode",
      "facadeZoneId",
      "fontId",
      "heightM",
      "offsetFromWallM",
      "alongZone",
      "verticalAlign",
      "writingMode",
      "orientation",
      "textColor",
      "emissiveIntensity",
      "anchor",
      "rotationY",
      "scope",
    ],
    defaults: {
      mode: "flat_billboard",
      attachMode: "facade_zone",
      fontId: "system_bold",
      heightM: 1.0,
      offsetFromWallM: 0.04,
      alongZone: 0.5,
      emissiveIntensity: 0,
    },
    allowedChildren: [],
    defaultMaterialToken: "frame_black",
    validationRules: [
      "decorative_no_collider",
      "text_sign_budget",
      "flat_billboard_default",
    ],
    hasGenerator: true,
  },
  floor_prop: {
    type: "floor_prop",
    requiredInputs: ["floorIndex", "moduleId", "x", "z"],
    optionalInputs: ["rotationY"],
    defaults: { rotationY: 0 },
    allowedChildren: [],
    defaultMaterialToken: "concrete_light",
    validationRules: ["floor_prop_within_bounds"],
    hasGenerator: true,
  },
  floor_zone: {
    type: "floor_zone",
    requiredInputs: ["floorIndex", "shape"],
    optionalInputs: [],
    defaults: {},
    allowedChildren: [],
    defaultMaterialToken: "concrete_light",
    validationRules: ["decorative_no_collider", "floor_zone_within_bounds"],
    hasGenerator: true,
  },
  collider_group: {
    type: "collider_group",
    requiredInputs: ["parentComponentId"],
    optionalInputs: ["colliderType", "colliderRole"],
    defaults: { enabled: true },
    allowedChildren: [],
    defaultMaterialToken: "collider_debug",
    validationRules: ["no_collider_over_opening", "no_block_ramp_exit"],
    hasGenerator: true,
  },
  unsupported_component: {
    type: "unsupported_component",
    requiredInputs: ["requestedType", "status"],
    optionalInputs: ["description"],
    defaults: { status: "needs_generator" },
    allowedChildren: [],
    defaultMaterialToken: "transparent_debug",
    validationRules: [],
    hasGenerator: false,
  },
};

/* ------------------------------------------------------------------ *
 * App-declared types
 *
 * Mutable, and deliberately so — the same shape as `registerGenerator` in
 * app/src/scene-engine/registry.ts, which has dispatched component type →
 * mesh builder by table since long before any of this. What is new is that
 * the TYPE no longer has to be one of ours for that dispatch to be legal.
 * ------------------------------------------------------------------ */

const APP_TYPES = new Map<string, ComponentTypeDef>();

/** The minimum an app states about a type. Structurally `BuilderComponentTypeDef`
 *  from the builder contract, restated here so `shared/component-registry.ts`
 *  does not depend on the authoring contract to describe its own registry. */
export interface AppComponentTypeInput {
  type: string;
  label: string;
  hasGenerator: boolean;
}

/** Namespaced `<appId>:<type>`, and not one of ours. */
export function isNamespacedComponentType(type: string, appId?: string): boolean {
  const at = type.indexOf(":");
  if (at <= 0) return false;
  return appId === undefined || type.slice(0, at) === appId;
}

/**
 * Register the component types a builder app mints. Called when the app is
 * registered with the host, not when it is installed on a scene: a type must
 * resolve for any scene the app COULD open, or loading a file written by an
 * app you have but have not switched on would show unsupported components.
 *
 * ★ An app may only register its own namespace. Bare names belong to the host
 * and the Building app, and an app that could claim `floor_slab` could redefine
 * what a floor is for everyone — the one thing this whole change must not make
 * possible. Rejected names are dropped and reported, never thrown: a bad
 * manifest must not take the editor down on boot.
 *
 * The synthesised def is deliberately permissive — no required inputs, no
 * validation rules, no allowed children. The host does not know what an app's
 * components need, and pretending otherwise is how a host starts owning the
 * vocabulary again. An app validates its own work through `BuilderApp.validate`.
 */
export function registerAppComponentTypes(
  appId: string,
  defs: readonly AppComponentTypeInput[]
): { registered: string[]; rejected: string[] } {
  const registered: string[] = [];
  const rejected: string[] = [];

  for (const def of defs) {
    if (!isNamespacedComponentType(def.type, appId)) {
      rejected.push(def.type);
      continue;
    }
    APP_TYPES.set(def.type, {
      type: def.type,
      requiredInputs: [],
      optionalInputs: [],
      defaults: {},
      allowedChildren: [],
      defaultMaterialToken: defaultTokenForType(def.type),
      validationRules: [],
      hasGenerator: def.hasGenerator,
    });
    registered.push(def.type);
  }

  return { registered, rejected };
}

/** Drop every app-declared type. For tests, and for a host tearing down. */
export function clearAppComponentTypes(): void {
  APP_TYPES.clear();
}

/** Built-in names plus every type a registered app declared. */
export function knownComponentTypeIds(): ComponentTypeId[] {
  return [...ALL_COMPONENT_TYPES, ...APP_TYPES.keys()];
}

/**
 * The schema for a type, or `undefined` when nothing has claimed it.
 *
 * Undefined is a normal answer, not a failure: it is what a plot written by an
 * app you do not have installed looks like, and the composer already renders
 * that as `unsupported_component`.
 */
export function getComponentTypeDef(type: ComponentTypeId): ComponentTypeDef | undefined {
  return REGISTRY[type as ComponentType] ?? APP_TYPES.get(type);
}

/** One of the 28 built-ins. Use `isKnownComponentType` unless you specifically
 *  mean "the host and Building vocabulary". */
export function isComponentType(type: string): type is ComponentType {
  return ALL_COMPONENT_TYPES.includes(type as ComponentType);
}

/** Built-in, or declared by a registered app. */
export function isKnownComponentType(type: string): boolean {
  return isComponentType(type) || APP_TYPES.has(type);
}

export function defaultMaterialForComponentType(type: ComponentTypeId): MaterialToken {
  return getComponentTypeDef(type)?.defaultMaterialToken ?? defaultTokenForType(type);
}

export function allowedChildrenOf(type: ComponentTypeId): ComponentTypeId[] {
  return getComponentTypeDef(type)?.allowedChildren ?? [];
}
