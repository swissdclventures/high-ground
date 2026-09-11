import type { BuildingConfig, SceneLayout, SpawnPreset } from "./types";
import { TEST_BUILDING, clampBuildingConfig } from "./types";
import type { SocialSurfaceConfig } from "./social-surface-contract";
import type { FloorZoneShape } from "./floor-zones";
import type { ProductKind } from "./product-kind";
import { normalizeProductKind } from "./product-kind";
import type { LiveEventsBoardConfig } from "./live-events-board-contract";
import { normalizeLiveEventsBoardConfig } from "./live-events-board-contract";
import { normalizeVehicleList, type VehicleSpec } from "./vehicle-contract";
import type { InteriorLampAnchor } from "./interior-lights";
import type { BuildingFloorPlan } from "./floor-directory";
import type { AvatarControlsConfig } from "./avatar-controls";
import { normalizeAvatarControls } from "./avatar-controls";

function defaultRuntimeBuildingBase(): BuildingConfig {
  return {
    floors: TEST_BUILDING.floors,
    roofTerrace: TEST_BUILDING.roofTerrace,
    buildingSpan: "single",
    rampCell: TEST_BUILDING.rampCell,
    rampType: (TEST_BUILDING as { rampType?: BuildingConfig["rampType"] }).rampType ?? "spiral",
    entrySide: TEST_BUILDING.entrySide as BuildingConfig["entrySide"],
    entryCell: TEST_BUILDING.entryCell,
    wallNorth: "glass",
    wallSouth: "sliding_entry",
    wallEast: "glass",
    wallWest: "glass",
    roofGuard: "glass",
    spawnPreset: "entrance",
  };
}

export { defaultRuntimeBuildingBase };

/** Floor zone geometry exported for runtime Social enforcement. */
export interface RuntimeFloorZone {
  id: string;
  name: string;
  floorIndex: number;
  /** Exact scene-space walk surface; needed when buildings have different elevations. */
  floorY?: number;
  buildingId?: string;
  shape: FloorZoneShape;
  /** Omitted for ordinary invisible zones. */
  entryCard?: import("./zone-entry-card").RuntimeZoneEntryCard;
  trigger?: import("./proximity-trigger").ProximityTriggerSpec;
}

/** Written by scripts/publish/sync-from-export.ts — read by scene/src at runtime. */
export interface SmartRuntimeEntity {
  id: string;
  type: string;
  modelFile: string;
  behavior: string;
  movement?: import("./smart-object-contract").SmartMovementSpec;
  anchors: import("./scene-spec-contract").SceneAnchor[];
  spec: Record<string, unknown>;
}

export interface SceneRuntimeConfig {
  syncedAt: string;
  /** DCL World identity baked only for World deployments. Border V2 uses both
   * fields so just the gateway scene consumes an inbound travel intent. */
  worldName?: string;
  /** Base parcel of the published scene — stamped for BOTH destinations. It used
   * to be World-only, which left a Genesis City scene with no coordinates of its
   * own and any per-scene service falling back to a shared preview bucket. */
  sceneBase?: string;
  /**
   * Which space this scene was published into. A World is a named space; Genesis
   * City is the map — they are separate levels and must never be read as one
   * (owner 2026-09-05). Absent on scenes published before this was stamped;
   * treat a missing value as "world" only when `worldName` is set.
   */
  destination?: "world" | "genesis";
  /**
   * Stable id of the space above this scene — `world:<name>:<base>` or
   * `genesis:<base>`. Live per-scene services (Garden growth, boards) key their
   * rows on this instead of re-deriving an identity that only knew Worlds.
   */
  destinationId?: string;
  /** Last confirmed Border V2 document at publish time. Runtime refreshes it
   * live, but this keeps the gateway legible during a transient read outage. */
  borderRoutes?: import("./border-routing").BorderRuntimeDocument;
  productKind?: ProductKind;
  /**
   * Owner-DB project id of the build that published this scene. Builder↔map
   * linkage ONLY — the World tab uses it to offer "Open in editor" on a deployed
   * scene. The scene runtime never reads it; absent when the editor was never
   * linked to a project id.
   */
  projectId?: string;
  buildingName: string;
  scene: SceneLayout;
  building: BuildingConfig;
  /**
   * Scene-local parcel cells ("col,row", SW origin) the building actually stands on,
   * baked at export from the live placement helpers. The publish map draws these as
   * the in-scene building overlay; legacy fields (buildingSpan) can be stale and must
   * not be used for this (2026-07-21: config said 3x3 while the geometry was an
   * 8-parcel octagon).
   */
  builtFootprint?: { cells: string[]; source: "placement" };
  /**
   * Exact scene-local building silhouettes in parcel units (1 = 16 m). Unlike
   * `builtFootprint`, this preserves every placed building, its rotation, and
   * polygon facets for the World map.
   */
  buildingOutlines?: Array<{
    id: string;
    points: Array<{ x: number; y: number }>;
    /** This building's own roof height. Older deployments omit it. */
    heightM?: number;
  }>;
  spawn: {
    x: number;
    y: number;
    z: number;
    /** "custom" when an exact override supplied x/z — never a preset name it did not use. */
    preset: SpawnPreset | "custom";
    cameraTarget: { x: number; y: number; z: number };
  };
  ramp: { x: number; z: number };
  floors: { floor: number; y: number; x: number; z: number }[];
  modelFile: string;
  /** GLB root position in DCL scene meters (export is composer-centered). */
  modelOrigin: { x: number; y: number; z: number };
  /**
   * Every OTHER building's standalone model. One entry per non-active building: the GLB
   * is centered on itself (rotation baked, position zero) and the runtime places it at
   * `origin` with a plain Transform — the same mechanism as `smartEntities`, which is the
   * one placement path that never failed in-world. Buildings are never expressed as
   * offsets inside another building's GLB; that offset crosses the Explorer's glTF
   * import unobservably and produced nine "other side of the map" reports.
   */
  models?: Array<{
    buildingId: string;
    file: string;
    origin: { x: number; y: number; z: number };
    /**
     * Yaw baked into this GLB, degrees. The model itself needs no runtime
     * rotation — the geometry already carries it — but anything placed by
     * BUILDING-LOCAL coordinates (gallery frames) must rotate by the same angle
     * to land on the wall it was authored against. Absent on scenes published
     * before frames could hang outside the primary building.
     */
    rotationDeg?: number;
  }>;
  /** Separate interactive entities (elevator platform, …) — not in building.glb. */
  smartEntities?: SmartRuntimeEntity[];
  /**
   * Ground-cover models: library object id → the ONE scene file that holds it. Every
   * scattered copy is a GltfContainer entity pointing at this path, so a 200-copy field
   * ships one model instead of 200 duplicated meshes inside building.glb. The layout is
   * re-solved in-world from `building.siteGround.scatter` by the same shared planner the
   * Builder preview uses, so nothing about the arrangement travels in this config.
   */
  groundScatterModels?: Array<{ objectId: string; file: string }>;
  /** Surface 4 — Social config for host console, gating, media (rules/surface-4-social.md). */
  social?: SocialSurfaceConfig;
  /** Independently initialized live-events extension. */
  liveEventsBoard?: LiveEventsBoardConfig;
  /** Parked sit-in craft from the Vehicles app. */
  vehicles?: VehicleSpec[];
  /** Persistent live NPC appearance/behavior document. Geometry and NPC capacity
   * remain in this deployed config; only safe operational fields are polled. */
  worldDirector?: import("./world-director-contract").WorldDirectorBinding;
  /** Floor zone shapes from Furnish — used for zone role gating at runtime. */
  floorZones?: RuntimeFloorZone[];
  /**
   * Real lamps for every lit floor of EVERY building, already in DCL scene metres.
   *
   * Baked here rather than derived at runtime because only the publish path knows where
   * the other eighteen towers actually stand — the runtime receives them as placed GLBs
   * with no config of their own. The emissive soffit that pairs with these lamps rides
   * the GLB and needs no entry here. See `shared/interior-lights.ts`.
   */
  interiorLamps?: InteriorLampAnchor[];
  /**
   * Every multi-storey building's floor list plus the footprint that decides whether the
   * player is inside it — the HUD floor picker's entire data source.
   *
   * Baked for the same reason as `interiorLamps`: the runtime receives the other towers
   * as bare GLBs with no config, so a district would otherwise offer floor buttons in
   * exactly one of nineteen buildings. See `shared/floor-directory.ts`.
   */
  floorDirectories?: BuildingFloorPlan[];
  /** Builder-owned spatial handoff consumed by an independent Venue Console. */
  venueCapabilities?: import("./venue-spatial-contract").VenueSpatialDocument;
  /**
   * How bodies move in this scene, as multipliers of the explorer's own speeds.
   * Absent on every scene published before this existed, and absent must move
   * identically to present-but-off. See shared/avatar-controls.ts.
   */
  avatarControls?: AvatarControlsConfig;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Normalize building-config.json at runtime (and keep scene typecheck stable when the
 * synced export omits legacy fields). Merges defaults, then clamps.
 */
export function parseSceneRuntimeConfig(raw: unknown): SceneRuntimeConfig {
  if (!isRecord(raw)) {
    throw new Error("Invalid building-config.json — expected an object");
  }

  const scene = isRecord(raw.scene)
    ? { cols: Number(raw.scene.cols) || 1, rows: Number(raw.scene.rows) || 1 }
    : { cols: 1, rows: 1 };

  const buildingPartial = isRecord(raw.building) ? (raw.building as Partial<BuildingConfig>) : {};
  const building = clampBuildingConfig(
    {
      ...defaultRuntimeBuildingBase(),
      ...buildingPartial,
      floors: Math.max(1, Number(buildingPartial.floors ?? TEST_BUILDING.floors)),
      roofTerrace: Boolean(buildingPartial.roofTerrace ?? TEST_BUILDING.roofTerrace),
    },
    scene
  );

  const spawnRaw = isRecord(raw.spawn) ? raw.spawn : {};
  const cam = isRecord(spawnRaw.cameraTarget) ? spawnRaw.cameraTarget : {};
  const spawn = {
    x: Number(spawnRaw.x) || 0,
    y: Number(spawnRaw.y) || 0.2,
    z: Number(spawnRaw.z) || 0,
    preset: (spawnRaw.preset as SpawnPreset | "custom") ?? "entrance",
    cameraTarget: {
      x: Number(cam.x) || 0,
      y: Number(cam.y) || 1.7,
      z: Number(cam.z) || 8,
    },
  };

  const rampRaw = isRecord(raw.ramp) ? raw.ramp : {};
  const ramp = { x: Number(rampRaw.x) || 8, z: Number(rampRaw.z) || 8 };

  const floors = Array.isArray(raw.floors)
    ? raw.floors
        .filter(isRecord)
        .map((f) => ({
          floor: Number(f.floor) || 0,
          y: Number(f.y) || 0.2,
          x: Number(f.x) || 8,
          z: Number(f.z) || 8,
        }))
    : [];

  const originRaw = isRecord(raw.modelOrigin) ? raw.modelOrigin : {};
  const modelOrigin = {
    x: Number(originRaw.x) || 8,
    y: Number(originRaw.y) || 0,
    z: Number(originRaw.z) || 8,
  };

  return {
    syncedAt: typeof raw.syncedAt === "string" ? raw.syncedAt : new Date().toISOString(),
    worldName: typeof raw.worldName === "string" ? raw.worldName : undefined,
    sceneBase: typeof raw.sceneBase === "string" ? raw.sceneBase : undefined,
    destination:
      raw.destination === "genesis" || raw.destination === "world" ? raw.destination : undefined,
    destinationId: typeof raw.destinationId === "string" ? raw.destinationId : undefined,
    borderRoutes: isRecord(raw.borderRoutes)
      ? (raw.borderRoutes as unknown as import("./border-routing").BorderRuntimeDocument)
      : undefined,
    productKind: normalizeProductKind(raw.productKind),
    buildingName: typeof raw.buildingName === "string" ? raw.buildingName : "building",
    scene,
    building,
    buildingOutlines: Array.isArray(raw.buildingOutlines)
      ? (raw.buildingOutlines as SceneRuntimeConfig["buildingOutlines"])
      : undefined,
    spawn,
    ramp,
    floors,
    modelFile: typeof raw.modelFile === "string" ? raw.modelFile : "models/building.glb",
    modelOrigin,
    models: Array.isArray(raw.models)
      ? raw.models
          .filter(isRecord)
          .filter((m) => typeof m.file === "string" && isRecord(m.origin))
          .map((m) => {
            const o = m.origin as Record<string, unknown>;
            return {
              buildingId: typeof m.buildingId === "string" ? m.buildingId : "",
              file: m.file as string,
              origin: { x: Number(o.x) || 0, y: Number(o.y) || 0, z: Number(o.z) || 0 },
            };
          })
      : undefined,
    smartEntities: Array.isArray(raw.smartEntities)
      ? (raw.smartEntities as SmartRuntimeEntity[])
      : undefined,
    groundScatterModels: Array.isArray(raw.groundScatterModels)
      ? raw.groundScatterModels
          .filter(isRecord)
          .filter((m) => typeof m.objectId === "string" && typeof m.file === "string")
          .map((m) => ({ objectId: m.objectId as string, file: m.file as string }))
      : undefined,
    social: raw.social as SocialSurfaceConfig | undefined,
    liveEventsBoard: isRecord(raw.liveEventsBoard)
      ? normalizeLiveEventsBoardConfig(raw.liveEventsBoard as Partial<LiveEventsBoardConfig>)
      : undefined,
    vehicles: Array.isArray(raw.vehicles) ? normalizeVehicleList(raw.vehicles) : undefined,
    worldDirector: isRecord(raw.worldDirector)
      ? {
          directorId: typeof raw.worldDirector.directorId === "string" ? raw.worldDirector.directorId : "",
          url: typeof raw.worldDirector.url === "string" ? raw.worldDirector.url : "",
          pollSeconds: Math.max(
            5,
            Math.min(300, Number(raw.worldDirector.pollSeconds) || 15)
          ),
        }
      : undefined,
    floorZones: Array.isArray(raw.floorZones)
      ? (raw.floorZones as RuntimeFloorZone[])
      : undefined,
    interiorLamps: Array.isArray(raw.interiorLamps)
      ? (raw.interiorLamps as InteriorLampAnchor[])
      : undefined,
    floorDirectories: Array.isArray(raw.floorDirectories)
      ? (raw.floorDirectories as BuildingFloorPlan[])
      : undefined,
    venueCapabilities: isRecord(raw.venueCapabilities)
      ? (raw.venueCapabilities as unknown as import("./venue-spatial-contract").VenueSpatialDocument)
      : undefined,
    // Undefined stays undefined on purpose: normalizing an absent block into an
    // all-ones one would make "never configured" and "configured to do nothing"
    // two different values that behave the same, which is one more thing to
    // read wrong later.
    avatarControls: isRecord(raw.avatarControls)
      ? normalizeAvatarControls(raw.avatarControls)
      : undefined,
  };
}
