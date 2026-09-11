/**
 * Smart entity contract — interactive objects separate from the structural build.
 * Spec is persisted for composer preview, export, and SDK7 runtime systems.
 */

import type {
  SceneAnchor,
  ColliderSettings,
  RenderSettings,
  SceneComponent,
  SceneSpec,
} from "./scene-spec-contract";
import type { MaterialToken } from "./material-tokens";
import { isSiteScoped, SITE_FLOOR_INDEX } from "./floor-props";
import { walkSurfaceY } from "./kit-geometry";
import {
  CLAW_CABINET_HEIGHT,
  CLAW_DEFAULT_SCALE,
  CLAW_SHELL,
} from "./claw-machine-geometry";
import { SCRAP_RING_PLATE_M } from "./scrap-duel";
import type { CustomPiece } from "./custom-pieces";
import { normalizeMotionSpec, type MotionSpec } from "./motion-contract";
import {
  PUNCH_MACHINE_DEPTH_M,
  PUNCH_MACHINE_HEIGHT_M,
  PUNCH_MACHINE_WIDTH_M,
} from "./punch-machine-contract";
import {
  GRAVE_PLOT_DEPTH_M,
  GRAVE_PLOT_WIDTH_M,
  GRAVEYARD_GROUNDS_DEFAULT_D_M,
  GRAVEYARD_GROUNDS_DEFAULT_W_M,
  GRAVEYARD_GROUNDS_SMART_ID,
  isGraveMarkerType,
  type GraveMarkerType,
} from "./graveyard-contract";
import {
  GARDEN_BED_DEFAULT_SIZE_M,
  GARDEN_CELLS_PER_SIDE_DEFAULT,
  clampGardenBedSize,
  clampGardenCellsPerSide,
  clampGardenStage,
} from "./garden-contract";
import {
  WATER_PARCEL_M,
  WATER_KIND_LABELS,
  WATER_KIND_PROFILES,
  normalizeWaterTileSpec,
  type WaterKind,
} from "./water-contract";

export type SmartBehaviorKind =
  | "vertical_elevator"
  | "synced_door"
  | "gate_barrier"
  | "video_surface"
  | "audio_stream"
  | "claw_vending"
  /** Two-pad Human Edition pit. Plugin draws the live pads at this pose. */
  | "scrap_ring"
  /** Bubble Bash pitch. Plugin bubbles players inside this footprint only. */
  | "bubble_arena"
  /** Placeable arcade strength game. Plugin owns model, hit target, and score loop. */
  | "punch_machine"
  /** One resting plot. Census fill never moves this stone. */
  | "grave_plot"
  /** Fence and lawn the plots sit inside. */
  | "graveyard_grounds"
  /** One parcel of lawn. Plugin grows grass cells on this soil from the live document. */
  | "garden_bed"
  /** One parcel of water. Plugin draws surface, bed and banks. See shared/water-contract.ts. */
  | "water_tile"
  /** Stand on it, get thrown to the floor above. See shared/traversal.ts. */
  | "launch_pad"
  /** A decorative custom piece driven by a tween. See shared/motion-contract.ts. */
  | "motion";

export type SmartMovementMode = "static" | "floor_stops";

export type SmartEntityType =
  | "elevator_platform"
  | "sliding_door"
  | "access_gate"
  | "media_screen"
  | "audio_source"
  | "claw_machine"
  | "scrap_ring"
  | "bubble_arena"
  | "punch_machine"
  | "grave_plot"
  | "graveyard_grounds"
  | "garden_bed"
  | "water_tile"
  | "launch_pad"
  | "mover";

export interface SmartMovementSpec {
  mode: SmartMovementMode;
  /** Inclusive start floor index (0 = ground). */
  startFloor: number;
  /** Inclusive end floor, or "roof" when roof terrace is enabled. */
  endFloor: number | "roof";
  /** Current resting floor — drives platform Y in preview until runtime moves the entity. */
  currentFloor: number;
  /** Vertical travel speed in m/s (SDK runtime). */
  speedMps: number;
  /** Pause at each stop in seconds (SDK runtime). */
  dwellSeconds: number;
}

export interface SmartPlacementSpec {
  centerX: number;
  centerZ: number;
  floorIndex?: number;
  width?: number;
  depth?: number;
  height?: number;
  thickness?: number;
  /** Yaw in radians (composer + export). */
  rotationY?: number;
  /** Sliding door travel along local X (meters). */
  slideDistance?: number;
  /** Gate rule id from social.gates (runtime). */
  gateRuleId?: string;
  /** Default https media URL (runtime). */
  mediaUrl?: string;
}

/** Separate from structural components — own GLB + runtime entity per id. */
export interface SmartEntity {
  id: string;
  type: SmartEntityType;
  name: string;
  materialToken: MaterialToken;
  locked: boolean;
  approved: boolean;
  anchors: SceneAnchor[];
  render: RenderSettings;
  collider: ColliderSettings;
  /** Geometry placement — see SmartPlacementSpec. */
  spec: Record<string, unknown>;
  behavior: SmartBehaviorKind;
  /** Elevator only — omitted for static social infra. */
  movement?: SmartMovementSpec;
}

const DEFAULT_PLACEMENT: SmartPlacementSpec = {
  centerX: 0,
  centerZ: 0,
  floorIndex: 0,
};

function baseSmartEntity(
  id: string,
  type: SmartEntityType,
  behavior: SmartBehaviorKind,
  name: string,
  spec: SmartPlacementSpec,
  materialToken: MaterialToken = "concrete_light"
): SmartEntity {
  return {
    id,
    type,
    name,
    materialToken,
    locked: false,
    approved: false,
    anchors: [],
    render: { visible: true },
    collider: { enabled: true, type: "box" },
    spec: { ...spec },
    behavior,
  };
}

export function defaultElevatorMovement(
  _floors: number,
  _roofTerrace: boolean
): SmartMovementSpec {
  return {
    mode: "floor_stops",
    startFloor: 0,
    endFloor: "roof",
    currentFloor: 0,
    speedMps: 1.5,
    dwellSeconds: 1.5,
  };
}

export function defaultStaticMovement(floorIndex = 0): SmartMovementSpec {
  return {
    mode: "static",
    startFloor: floorIndex,
    endFloor: floorIndex,
    currentFloor: floorIndex,
    speedMps: 0,
    dwellSeconds: 0,
  };
}

export function createElevatorPlatformEntity(
  id: string,
  spec: Partial<SmartPlacementSpec> = {}
): SmartEntity {
  return {
    ...baseSmartEntity(
      id,
      "elevator_platform",
      "vertical_elevator",
      "Elevator Platform",
      { ...DEFAULT_PLACEMENT, width: 0.9, depth: 0.9, thickness: 0.12, ...spec },
      "concrete_light"
    ),
    movement: defaultElevatorMovement(2, true),
  };
}

export function createSlidingDoorEntity(
  id: string,
  spec: Partial<SmartPlacementSpec> = {}
): SmartEntity {
  return {
    ...baseSmartEntity(
      id,
      "sliding_door",
      "synced_door",
      "Sliding Door",
      {
        ...DEFAULT_PLACEMENT,
        width: 2,
        height: 2.4,
        thickness: 0.08,
        slideDistance: 1,
        ...spec,
      },
      "frame_black"
    ),
    movement: defaultStaticMovement(spec.floorIndex ?? 0),
  };
}

export function createAccessGateEntity(
  id: string,
  spec: Partial<SmartPlacementSpec> & { gateRuleId?: string } = {}
): SmartEntity {
  return {
    ...baseSmartEntity(
      id,
      "access_gate",
      "gate_barrier",
      "Access Gate",
      {
        ...DEFAULT_PLACEMENT,
        width: 2,
        height: 2.5,
        depth: 0.15,
        ...spec,
      },
      "collider_debug"
    ),
    movement: defaultStaticMovement(spec.floorIndex ?? 0),
  };
}

export function createMediaScreenEntity(
  id: string,
  spec: Partial<SmartPlacementSpec> & { mediaUrl?: string } = {}
): SmartEntity {
  return {
    ...baseSmartEntity(
      id,
      "media_screen",
      "video_surface",
      "Media Screen",
      {
        ...DEFAULT_PLACEMENT,
        width: 3,
        height: 1.7,
        thickness: 0.05,
        mediaUrl: spec.mediaUrl,
        ...spec,
      },
      "frame_black"
    ),
    movement: defaultStaticMovement(spec.floorIndex ?? 0),
  };
}

export function createAudioSourceEntity(
  id: string,
  spec: Partial<SmartPlacementSpec> & { mediaUrl?: string } = {}
): SmartEntity {
  return {
    ...baseSmartEntity(
      id,
      "audio_source",
      "audio_stream",
      "Audio Source",
      {
        ...DEFAULT_PLACEMENT,
        width: 0.4,
        depth: 0.4,
        height: 0.6,
        mediaUrl: spec.mediaUrl,
        ...spec,
      },
      "safety_rail_black"
    ),
    movement: defaultStaticMovement(spec.floorIndex ?? 0),
  };
}

/** Placeable Dance Bug vending/claw cabinet. The first interactive instance is
 * driven by the Speakeasy runtime; additional copies remain authored smart items
 * with independent transforms, ready for multi-instance runtime expansion. */
export function createClawMachineEntity(
  id: string,
  spec: Partial<SmartPlacementSpec> & {
    scale?: number;
    itemName?: string;
    interactive?: boolean;
  } = {}
): SmartEntity {
  return {
    ...baseSmartEntity(
      id,
      "claw_machine",
      "claw_vending",
      "Dance Bug vending machine",
      {
        ...DEFAULT_PLACEMENT,
        width: CLAW_SHELL.width,
        depth: CLAW_SHELL.depth,
        height: CLAW_CABINET_HEIGHT,
        rotationY: 0,
        ...spec,
      },
      "frame_black"
    ),
    spec: {
      ...DEFAULT_PLACEMENT,
      width: CLAW_SHELL.width,
      depth: CLAW_SHELL.depth,
      height: CLAW_CABINET_HEIGHT,
      rotationY: 0,
      scale: CLAW_DEFAULT_SCALE,
      itemName: "Dance Bug",
      interactive: true,
      ...spec,
    },
    movement: defaultStaticMovement(spec.floorIndex ?? 0),
  };
}

/** One placeable Human Edition pit. Drag it; the plugin builds pads only here. */
export const SCRAP_RING_SMART_ID = "scrap_ring_main";

export function createScrapRingEntity(
  id: string = SCRAP_RING_SMART_ID,
  spec: Partial<SmartPlacementSpec> & { scope?: "building" | "site"; centerY?: number } = {}
): SmartEntity {
  return {
    ...baseSmartEntity(
      id,
      "scrap_ring",
      "scrap_ring",
      "Scrapped Human Edition ring",
      {
        ...DEFAULT_PLACEMENT,
        width: SCRAP_RING_PLATE_M,
        depth: SCRAP_RING_PLATE_M,
        height: 0.04,
        floorIndex: SITE_FLOOR_INDEX,
        rotationY: 0,
        ...spec,
      },
      "frame_black"
    ),
    spec: {
      ...DEFAULT_PLACEMENT,
      width: SCRAP_RING_PLATE_M,
      depth: SCRAP_RING_PLATE_M,
      height: 0.04,
      floorIndex: SITE_FLOOR_INDEX,
      scope: "site",
      rotationY: 0,
      ...spec,
    },
    movement: defaultStaticMovement(0),
  };
}

/**
 * The Bubble Bash pitch — one placeable square of ground.
 *
 * The plot decides where the game is; this footprint decides how big it is.
 * The plugin bubbles players INSIDE this square and nowhere else, so a World
 * can carry an arena on one plot without turning every scene into a bubble pit.
 * Like the Scrap ring, the entity is the pose: the plugin draws the live
 * boundary and goals at runtime.
 */
export const BUBBLE_ARENA_SMART_ID = "bubble_arena_main";

/** 2×2 parcels. Room for 3v3 plus knockback without leaving the pitch. */
export const BUBBLE_ARENA_SIZE_M = 32;

export function createBubbleArenaEntity(
  id: string = BUBBLE_ARENA_SMART_ID,
  spec: Partial<SmartPlacementSpec> & { scope?: "building" | "site"; centerY?: number } = {}
): SmartEntity {
  const placement = {
    ...DEFAULT_PLACEMENT,
    width: BUBBLE_ARENA_SIZE_M,
    depth: BUBBLE_ARENA_SIZE_M,
    height: 0.12,
    floorIndex: SITE_FLOOR_INDEX,
    rotationY: 0,
    ...spec,
  };
  return {
    ...baseSmartEntity(id, "bubble_arena", "bubble_arena", "Bubble Bash arena", placement, "frame_black"),
    spec: { ...placement, scope: "site" },
    movement: defaultStaticMovement(0),
  };
}

/** One repeatable arcade machine. The smart object owns only pose and dimensions. */
export function createPunchMachineEntity(
  id: string,
  spec: Partial<SmartPlacementSpec> & { scope?: "building" | "site"; centerY?: number } = {}
): SmartEntity {
  const scope = spec.scope ?? "building";
  const placement = {
    ...DEFAULT_PLACEMENT,
    width: PUNCH_MACHINE_WIDTH_M,
    depth: PUNCH_MACHINE_DEPTH_M,
    height: PUNCH_MACHINE_HEIGHT_M,
    floorIndex: scope === "site" ? SITE_FLOOR_INDEX : (spec.floorIndex ?? 0),
    rotationY: 0,
    ...spec,
  };
  return {
    ...baseSmartEntity(id, "punch_machine", "punch_machine", "Arcade punch machine", placement, "frame_black"),
    spec: { ...placement, scope },
    movement: defaultStaticMovement(scope === "site" ? 0 : (spec.floorIndex ?? 0)),
  };
}


export { GRAVEYARD_GROUNDS_SMART_ID };

export function createGraveyardGroundsEntity(
  id: string = GRAVEYARD_GROUNDS_SMART_ID,
  spec: Partial<SmartPlacementSpec> & { scope?: "building" | "site" } = {}
): SmartEntity {
  const placement = {
    ...DEFAULT_PLACEMENT,
    width: GRAVEYARD_GROUNDS_DEFAULT_W_M,
    depth: GRAVEYARD_GROUNDS_DEFAULT_D_M,
    height: 1.6,
    floorIndex: SITE_FLOOR_INDEX,
    rotationY: 0,
    ...spec,
  };
  return {
    ...baseSmartEntity(id, "graveyard_grounds", "graveyard_grounds", "Graveyard grounds", placement, "concrete_light"),
    spec: { ...placement, scope: spec.scope ?? "site" },
    movement: defaultStaticMovement(0),
  };
}

export function createGravePlotEntity(
  id: string,
  spec: Partial<SmartPlacementSpec> & {
    scope?: "building" | "site";
    centerY?: number;
    markerType?: GraveMarkerType;
    boundWallet?: string;
  } = {}
): SmartEntity {
  const markerType: GraveMarkerType = isGraveMarkerType(spec.markerType) ? spec.markerType : "slab";
  const boundWallet = typeof spec.boundWallet === "string" ? spec.boundWallet.trim() : "";
  const rest = { ...spec };
  delete rest.markerType;
  delete rest.boundWallet;
  const placement = {
    ...DEFAULT_PLACEMENT,
    width: GRAVE_PLOT_WIDTH_M,
    depth: GRAVE_PLOT_DEPTH_M,
    height: 1.2,
    floorIndex: SITE_FLOOR_INDEX,
    rotationY: 0,
    ...rest,
  };
  return {
    ...baseSmartEntity(id, "grave_plot", "grave_plot", "Grave plot", placement, "concrete_light"),
    spec: {
      ...placement,
      scope: spec.scope ?? "site",
      markerType,
      ...(boundWallet ? { boundWallet } : {}),
    },
    movement: defaultStaticMovement(0),
  };
}

/**
 * A square of lawn, one parcel by default. The Builder bakes the soil plate into
 * the smart GLB; the runtime grows grass cells on top from the live document.
 */
export function createGardenBedEntity(
  id: string,
  spec: Partial<SmartPlacementSpec> & {
    scope?: "building" | "site";
    cellsPerSide?: number;
    startStage?: number;
  } = {}
): SmartEntity {
  const cellsPerSide = clampGardenCellsPerSide(spec.cellsPerSide ?? GARDEN_CELLS_PER_SIDE_DEFAULT);
  // How grown THIS bed opens. Undefined means "follow the app setting" — stamping
  // the app's value in at placement time would freeze it, so a later change to the
  // default would skip every bed already on the plot.
  const startStage =
    spec.startStage === undefined ? undefined : clampGardenStage(spec.startStage);
  const rest = { ...spec };
  delete rest.cellsPerSide;
  delete rest.startStage;
  const placement = {
    ...DEFAULT_PLACEMENT,
    width: GARDEN_BED_DEFAULT_SIZE_M,
    depth: GARDEN_BED_DEFAULT_SIZE_M,
    height: 0.7,
    floorIndex: SITE_FLOOR_INDEX,
    rotationY: 0,
    ...rest,
  };
  placement.width = clampGardenBedSize(placement.width);
  placement.depth = clampGardenBedSize(placement.depth);
  return {
    ...baseSmartEntity(id, "garden_bed", "garden_bed", "Garden bed", placement, "concrete_light"),
    spec: {
      ...placement,
      scope: spec.scope ?? "site",
      cellsPerSide,
      ...(startStage === undefined ? {} : { startStage }),
    },
    movement: defaultStaticMovement(0),
  };
}

/**
 * One parcel of water.
 *
 * The Builder places an empty 16 m square and stores only WHICH parcel and WHAT
 * KIND. Surface, bed and banks are all drawn at runtime, because a bank depends
 * on the tile's neighbours and a neighbour can appear after this tile is placed —
 * baking the geometry here would mean re-baking every tile whenever one moved.
 *
 * Height is the wet depth, so the drag handle in the viewport has something to
 * grab; the runtime reads `spec.water.depthM` and ignores it.
 */
export function createWaterTileEntity(
  id: string,
  spec: Partial<SmartPlacementSpec> & {
    scope?: "building" | "site";
    kind?: WaterKind;
    depthM?: number;
    flowDeg?: number;
  } = {}
): SmartEntity {
  const water = normalizeWaterTileSpec(
    { kind: spec.kind, depthM: spec.depthM, flowDeg: spec.flowDeg },
    spec.kind ?? "lake"
  );
  const rest = { ...spec };
  delete rest.kind;
  delete rest.depthM;
  delete rest.flowDeg;
  const placement = {
    ...DEFAULT_PLACEMENT,
    width: WATER_PARCEL_M,
    depth: WATER_PARCEL_M,
    height: WATER_KIND_PROFILES[water.kind].depthM,
    floorIndex: SITE_FLOOR_INDEX,
    rotationY: 0,
    ...rest,
  };
  placement.width = WATER_PARCEL_M;
  placement.depth = WATER_PARCEL_M;
  return {
    ...baseSmartEntity(
      id,
      "water_tile",
      "water_tile",
      `${WATER_KIND_LABELS[water.kind]} tile`,
      placement,
      "concrete_light"
    ),
    spec: {
      ...placement,
      scope: spec.scope ?? "site",
      water,
    },
    movement: defaultStaticMovement(0),
  };
}

export function isElevatorEntity(entity: SmartEntity): boolean {
  return entity.type === "elevator_platform" || entity.behavior === "vertical_elevator";
}

export function normalizeSmartEntity(partial: Partial<SmartEntity>): SmartEntity {
  const type = partial.type ?? "elevator_platform";
  const behavior = partial.behavior ?? behaviorForType(type);
  const movement =
    partial.movement ??
    (isElevatorEntity({ ...partial, type, behavior } as SmartEntity)
      ? defaultElevatorMovement(2, true)
      : defaultStaticMovement(
          typeof partial.spec?.floorIndex === "number" ? partial.spec.floorIndex : 0
        ));

  return {
    id: partial.id!,
    type,
    name: partial.name ?? partial.id!,
    materialToken: partial.materialToken ?? "concrete_light",
    locked: partial.locked ?? false,
    approved: partial.approved ?? false,
    anchors: partial.anchors ?? [],
    render: partial.render ?? { visible: true },
    collider: partial.collider ?? { enabled: true, type: "box" },
    spec: partial.spec ?? {},
    behavior,
    movement: isElevatorEntity({ type, behavior } as SmartEntity) ? movement : movement,
  };
}

function behaviorForType(type: SmartEntityType): SmartBehaviorKind {
  switch (type) {
    case "sliding_door":
      return "synced_door";
    case "access_gate":
      return "gate_barrier";
    case "media_screen":
      return "video_surface";
    case "audio_source":
      return "audio_stream";
    case "claw_machine":
      return "claw_vending";
    case "scrap_ring":
      return "scrap_ring";
    case "bubble_arena":
      return "bubble_arena";
    case "punch_machine":
      return "punch_machine";
    case "grave_plot":
      return "grave_plot";
    case "graveyard_grounds":
      return "graveyard_grounds";
    case "mover":
      return "motion";
    default:
      return "vertical_elevator";
  }
}

/**
 * A mover: a custom piece that moves. Decorative by law — no collider, no anchors —
 * so the runtime never has to keep physics in step with a tween. The piece travels
 * inline on the entity so export needs no lookup; `motion` is normalised here so a
 * stored mover always carries a complete spec. See shared/motion-contract.ts.
 */
export function createMoverEntity(
  id: string,
  placement: SmartPlacementSpec & { scope?: "site" | "building" },
  piece: CustomPiece,
  motion: Partial<MotionSpec> | MotionSpec,
  name = piece.name
): SmartEntity {
  const entity = baseSmartEntity(id, "mover", "motion", name, placement, "frame_black");
  entity.collider = { enabled: false, type: "none" } as SmartEntity["collider"];
  entity.approved = true;
  entity.spec = {
    ...entity.spec,
    ...(placement.scope ? { scope: placement.scope } : {}),
    pieceId: piece.id,
    piece,
    motion: normalizeMotionSpec(motion),
  };
  entity.movement = defaultStaticMovement(
    typeof placement.floorIndex === "number" ? placement.floorIndex : 0
  );
  return entity;
}

/** The motion spec stored on a mover, normalised; null for any other entity. */
export function moverMotion(entity: { behavior?: string; spec: Record<string, unknown> }): MotionSpec | null {
  if (entity.behavior !== "motion") return null;
  return normalizeMotionSpec(entity.spec.motion);
}

export function listSmartEntities(spec: SceneSpec | null | undefined): SmartEntity[] {
  return spec?.smartObjects ?? [];
}

export function resolveEndFloorIndex(
  movement: SmartMovementSpec,
  floors: number,
  roofTerrace: boolean
): number {
  if (movement.endFloor === "roof") {
    return roofTerrace ? floors : Math.max(0, floors - 1);
  }
  // Never allow a stale mid-building stop: clamp to the live top of this building.
  const top = roofTerrace ? floors : Math.max(0, floors - 1);
  return Math.min(Math.max(0, movement.endFloor), top);
}

/**
 * Absolute walk-surface Y for elevator travel (composer / DCL meters).
 *
 * **Enforcement rule:** the cab always rides to the live building top
 * (`floors` + optional roof terrace), using the live `storyHeight`.
 * Numeric `endFloor` values are ignored for the high stop — they go stale when
 * floors are added and were the main cause of mid-building stalls. Start floor
 * still comes from the movement spec (default ground).
 */
export function resolveElevatorTravelYs(
  floors: number,
  storyHeight: number,
  roofTerrace: boolean,
  movement?: Pick<SmartMovementSpec, "startFloor" | "endFloor"> | null,
  floorBaseYs?: readonly number[] | null
): { lowY: number; highY: number; startFloor: number; endFloor: number } {
  const sh = Math.max(0.5, storyHeight);
  const endFloor = roofTerrace ? Math.max(0, floors) : Math.max(0, floors - 1);
  const startFloor = Math.min(Math.max(0, movement?.startFloor ?? 0), endFloor);
  const baseY = (floor: number): number => {
    const exact = floorBaseYs?.[floor];
    return typeof exact === "number" && Number.isFinite(exact) ? exact : floor * sh;
  };
  return {
    // The bottom stop parks the deck over SOLID slab, so a deck top exactly at the walk
    // surface is coplanar with the tiled slab top — sustained z-fighting while the cab
    // dwells at the bottom (2026-07-27 in-world). Park it slightly PROUD instead: flush
    // faces fight, a 2 cm step doesn't (DCL steps up 30 cm). Upper stops stay flush —
    // there the deck spans the shaft HOLE, no slab underneath to fight.
    lowY: walkSurfaceY(baseY(startFloor)) + ELEVATOR_PARK_PROUD_M,
    highY: walkSurfaceY(baseY(endFloor)),
    startFloor,
    endFloor,
  };
}

/** Bottom-stop lift above the walk surface — see resolveElevatorTravelYs. */
export const ELEVATOR_PARK_PROUD_M = 0.02;

/** Max drift (m) before baked publish travel is treated as stale vs live building math. */
export const ELEVATOR_TRAVEL_BAKE_EPSILON_M = 0.15;

export interface ElevatorBakedTravelSpec {
  travelLowY?: number;
  travelHighY?: number;
}

/**
 * Authoritative elevator travel for runtime + composer preview.
 *
 * Live `floors` / `storyHeight` / `roofTerrace` always win. Baked `travelLowY` /
 * `travelHighY` from an older publish are used only when they match the live range
 * within {@link ELEVATOR_TRAVEL_BAKE_EPSILON_M}. A baked high stop below the live
 * top (classic stale bake after floors grew) is ignored.
 */
export function resolveElevatorTravelForRuntime(
  floors: number,
  storyHeight: number,
  roofTerrace: boolean,
  movement?: Pick<SmartMovementSpec, "startFloor" | "endFloor"> | null,
  baked?: ElevatorBakedTravelSpec | null,
  floorBaseYs?: readonly number[] | null
): { lowY: number; highY: number; startFloor: number; endFloor: number } {
  const live = resolveElevatorTravelYs(
    floors,
    storyHeight,
    roofTerrace,
    movement,
    floorBaseYs
  );

  const bakedLow = typeof baked?.travelLowY === "number" ? baked.travelLowY : null;
  const bakedHigh = typeof baked?.travelHighY === "number" ? baked.travelHighY : null;
  if (bakedLow == null || bakedHigh == null || bakedHigh - bakedLow <= 0.05) {
    return live;
  }

  if (bakedHigh < live.highY - ELEVATOR_TRAVEL_BAKE_EPSILON_M) {
    return live;
  }

  const lowOk = Math.abs(bakedLow - live.lowY) <= ELEVATOR_TRAVEL_BAKE_EPSILON_M;
  const highOk = Math.abs(bakedHigh - live.highY) <= ELEVATOR_TRAVEL_BAKE_EPSILON_M;
  if (lowOk && highOk) {
    return { ...live, lowY: bakedLow, highY: bakedHigh };
  }

  return live;
}

/** Floor base Y for a smart entity resting at movement.currentFloor. */
export function smartEntityFloorBaseY(
  entity: SmartEntity,
  storyHeight: number
): number {
  const floor =
    typeof entity.spec.floorIndex === "number"
      ? entity.spec.floorIndex
      : (entity.movement?.currentFloor ?? 0);
  const scope = typeof entity.spec.scope === "string" ? entity.spec.scope : undefined;
  if (isSiteScoped({ floorIndex: floor, scope }) || floor === SITE_FLOOR_INDEX) return 0;
  return floor * storyHeight;
}

/**
 * Where the smart-entity wrapper sits (walk surface / group origin).
 * `spec.centerY` wins so a free object can leave its floor.
 */
export function smartEntityPlacedY(entity: SmartEntity, storyHeight: number): number {
  const y = Number(entity.spec.centerY);
  if (Number.isFinite(y)) return y;
  return walkSurfaceY(smartEntityFloorBaseY(entity, storyHeight));
}

export function smartEntityWorldY(entity: SmartEntity, storyHeight: number): number {
  const height = (entity.spec.height as number) ?? 0;
  return smartEntityPlacedY(entity, storyHeight) + height / 2;
}

/* ── What a Smart-objects shelf card stands for ─────────────────────────────
 *
 * ★★ A CARD ID IS A KIND, NOT ALWAYS AN OBJECT ID, and getting that wrong is what
 * made the shelf lie twice over (owner, 2026-08-25):
 *   - the Vending machine is REPEATABLE, so every copy carries a minted id of its
 *     own and only `type` matches the card. Testing the id found nothing, forever;
 *   - the Text sign is a scene COMPONENT, not a smart entity. It sits on this shelf
 *     because that is where an author looks for it, not because it shares a bucket.
 *
 * `entities` must be every entity on the plot, INCLUDING the ones parked inside
 * buildings — reading a scene's own `smartObjects` alone was the third way to
 * undercount.
 */
export type SmartCardTarget =
  | { kind: "smart"; id: string }
  | { kind: "component"; id: string };

export function smartObjectsForCatalogCard(
  cardId: string,
  multi: boolean | undefined,
  entities: readonly SmartEntity[],
  components: readonly SceneComponent[]
): SmartCardTarget[] {
  if (cardId === "text_sign") {
    return components
      .filter((component) => component.type === "text_sign")
      .map((component) => ({ kind: "component", id: component.id }));
  }
  if (multi) {
    return entities
      .filter((entity) => entity.type === cardId)
      .map((entity) => ({ kind: "smart", id: entity.id }));
  }
  return entities
    .filter((entity) => entity.id === cardId)
    .map((entity) => ({ kind: "smart", id: entity.id }));
}
