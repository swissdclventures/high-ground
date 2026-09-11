import type { PlotBorderConfig } from "./plot-border";
import metadata from "../data/asset-metadata.json";
import {
  clampColumnLayoutSpec,
  defaultColumnLayoutSpec,
  getColumnFloorOverride,
  type ColumnLayoutSpec,
  type ColumnProfile,
  type ColumnFloorOverride,
} from "./column-layout";
export type { ColumnFloorOverride } from "./column-layout";
import { clampCustomSpawn, type CustomSpawn } from "./custom-spawn";
import { fitRoofCrownToHeadroom, roofCrownHeightM, type RoofCrownConfig } from "./roof-crown";
export type { RoofCrownConfig } from "./roof-crown";
export type { CustomSpawn } from "./custom-spawn";
export {
  clampCustomSpawn,
  customSpawnFromDcl,
  isPlazaDefaultSpawn,
  keepAuthoredSpawn,
} from "./custom-spawn";

export type AssetMetadata = typeof metadata;
export type ModuleDef = AssetMetadata["modules"][number];
export type GridConfig = AssetMetadata["grid"];
export type MaterialDef = AssetMetadata["materials"][keyof AssetMetadata["materials"]];

export const GRID = metadata.grid;
export const MODULES = metadata.modules;
export const PILOT_IDS = metadata.pilotModuleIds;
export const TEST_BUILDING = metadata.testBuilding;
export const SHARED_NEGATIVE = metadata.sharedNegativePrompt;

export function getModule(id: string): ModuleDef | undefined {
  return MODULES.find((m) => m.id === id);
}

export type WallType = "open" | "solid" | "glass" | "sliding_entry";

/**
 * Building footprint coverage within the scene.
 * - `single`: one parcel, SW corner.
 * - `fill`: whatever the scene is (all parcels).
 * - `${cols}x${rows}`: an explicit parcel block, SW-anchored, capped to the scene.
 */
export type CoverageId = `${number}x${number}`;
export type BuildingSpan = "single" | "fill" | CoverageId;

/** Footprint size in parcels for a span, clamped to the scene layout. */
export function coverageParcels(
  span: BuildingSpan,
  layout: SceneLayout
): { cols: number; rows: number } {
  if (span === "single") return { cols: 1, rows: 1 };
  if (span === "fill") return { cols: layout.cols, rows: layout.rows };
  const m = /^(\d+)x(\d+)$/.exec(span);
  if (!m) return { cols: 1, rows: 1 };
  return {
    cols: Math.min(layout.cols, Math.max(1, parseInt(m[1]!, 10))),
    rows: Math.min(layout.rows, Math.max(1, parseInt(m[2]!, 10))),
  };
}

/** Footprint size in meters for a span, clamped to the scene layout. */
export function footprintSizeM(
  span: BuildingSpan,
  layout: SceneLayout
): { width: number; depth: number } {
  const p = coverageParcels(span, layout);
  return { width: p.cols * GRID.parcelSize, depth: p.rows * GRID.parcelSize };
}

/**
 * Normalize a coverage span to the current scene: collapse to `single` for 1×1,
 * explicit `${cols}x${rows}` when it spans the whole scene, otherwise clamped N×M.
 * Legacy `fill` is mapped to the scene's full parcel block.
 */
export function normalizeBuildingSpan(
  span: BuildingSpan,
  layout: SceneLayout
): BuildingSpan {
  const raw: BuildingSpan =
    span === "fill" ? (`${layout.cols}x${layout.rows}` as CoverageId) : span;
  const p = coverageParcels(raw, layout);
  if (p.cols <= 1 && p.rows <= 1) return "single";
  if (p.cols >= layout.cols && p.rows >= layout.rows) {
    return layout.cols === 1 && layout.rows === 1
      ? "single"
      : (`${layout.cols}x${layout.rows}` as CoverageId);
  }
  return `${p.cols}x${p.rows}` as CoverageId;
}

/** Placement of the building footprint on the plot. */
export type SiteAnchor = "sw" | "s" | "se" | "w" | "center" | "e" | "nw" | "n" | "ne";

export const SITE_ANCHORS: SiteAnchor[] = [
  "sw",
  "s",
  "se",
  "w",
  "center",
  "e",
  "nw",
  "n",
  "ne",
];

export const SITE_ANCHOR_LABELS: Record<SiteAnchor, string> = {
  sw: "South-west corner",
  s: "South edge",
  se: "South-east corner",
  w: "West edge",
  center: "Center",
  e: "East edge",
  nw: "North-west corner",
  n: "North edge",
  ne: "North-east corner",
};

/** Fraction of the free space (scene − footprint) placed WEST/SOUTH of the building. */
const SITE_ANCHOR_FRACTION: Record<SiteAnchor, { ax: number; az: number }> = {
  sw: { ax: 0, az: 0 },
  s: { ax: 0.5, az: 0 },
  se: { ax: 1, az: 0 },
  w: { ax: 0, az: 0.5 },
  center: { ax: 0.5, az: 0.5 },
  e: { ax: 1, az: 0.5 },
  nw: { ax: 0, az: 1 },
  n: { ax: 0.5, az: 1 },
  ne: { ax: 1, az: 1 },
};

/** Minimum building footprint dimension (a centered 4×4 core + a 2 m walking ring). */
export const MIN_FOOTPRINT_M = 8;

/** Snap a footprint dimension onto the 4 m grid within [MIN_FOOTPRINT_M, maxM]. */
export function snapFootprintDimM(value: number, maxM: number): number {
  const snapped = Math.round(value / GRID.cellSize) * GRID.cellSize;
  return Math.min(Math.max(MIN_FOOTPRINT_M, snapped), Math.max(MIN_FOOTPRINT_M, maxM));
}

const QUARTER_FRACTION: Record<string, string> = {
  "0.25": "¼",
  "0.5": "½",
  "0.75": "¾",
};

/**
 * Format a footprint dimension in PARCELS — the unit owners actually buy land in —
 * instead of raw meters. The size grid is 4 m, exactly a QUARTER parcel (parcel =
 * 16 m), so quarter fractions are real and expected: 8 m = "½", 20 m = "1¼".
 */
export function parcelsForM(meters: number): number {
  return meters / GRID.parcelSize;
}

/** "½" / "1" / "1¼" / "2" — a dimension in parcels, using quarter glyphs. */
export function formatParcelDim(meters: number): string {
  const parcels = parcelsForM(meters);
  const whole = Math.floor(parcels);
  const frac = QUARTER_FRACTION[String(Number((parcels - whole).toFixed(2)))];
  if (!frac) return String(whole);
  return whole === 0 ? frac : `${whole}${frac}`;
}

/** "1 parcel" / "½ parcel" / "1¼ parcels" — a labelled dimension for the size dropdowns. */
export function parcelDimLabel(meters: number): string {
  // Singular through one parcel — "½ parcel" reads correctly, "½ parcels" does not.
  const parcels = parcelsForM(meters);
  return `${formatParcelDim(meters)} ${parcels <= 1 ? "parcel" : "parcels"}`;
}

/** Parcels of AREA a footprint covers (16×16 m building = 1). Trimmed to 2 decimals. */
export function parcelAreaCovered(widthM: number, depthM: number): number {
  return Number(((widthM * depthM) / (GRID.parcelSize * GRID.parcelSize)).toFixed(2));
}

/**
 * The building's effective ground footprint in meters. Explicit `footprintM` wins
 * (clamped/snapped to the scene); legacy configs fall back to span semantics.
 * EVERY consumer of the building's size must go through this — never read
 * footprintSizeM(span) directly for a config.
 */
export function buildingFootprintM(
  config: BuildingConfig,
  layout: SceneLayout
): { width: number; depth: number } {
  const fp = config.footprintM;
  if (fp && Number.isFinite(fp.width) && Number.isFinite(fp.depth)) {
    const scene = sceneSizeM(layout);
    return {
      width: snapFootprintDimM(fp.width, scene.width),
      depth: snapFootprintDimM(fp.depth, scene.depth),
    };
  }
  return footprintSizeM(config.buildingSpan ?? "single", layout);
}

/**
 * Building group offset within the scene (composer coords, scene-centered), honoring
 * the site anchor. "sw" reproduces the legacy SW-anchored buildingOffsetInScene.
 */
export function buildingPlacementOffset(
  config: BuildingConfig,
  layout: SceneLayout
): { x: number; z: number } {
  const scene = sceneSizeM(layout);
  const fp = buildingFootprintM(config, layout);
  const exact = config.siteOriginM;
  if (exact && Number.isFinite(exact.x) && Number.isFinite(exact.z)) {
    const originX = Math.min(Math.max(0, exact.x), Math.max(0, scene.width - fp.width));
    const originZ = Math.min(Math.max(0, exact.z), Math.max(0, scene.depth - fp.depth));
    return {
      x: -scene.width / 2 + originX + fp.width / 2,
      z: -scene.depth / 2 + originZ + fp.depth / 2,
    };
  }
  const f = SITE_ANCHOR_FRACTION[config.siteAnchor ?? "sw"] ?? SITE_ANCHOR_FRACTION.sw;
  return {
    x: -scene.width / 2 + fp.width / 2 + f.ax * (scene.width - fp.width),
    z: -scene.depth / 2 + fp.depth / 2 + f.az * (scene.depth - fp.depth),
  };
}

/**
 * The parcel cells (scene-local "col,row", SW origin) the BUILDING actually stands
 * on — as opposed to the scene's full land. Derived from the same footprint +
 * placement helpers the composer builds with, so it is truthful even when legacy
 * fields like buildingSpan are stale (the 2026-07-21 "3x3" lie on an 8-parcel
 * octagon). Powers the publish map's building overlay and roof-spawn validation.
 */
export function buildingFootprintCells(
  config: BuildingConfig,
  layout: SceneLayout
): Array<{ col: number; row: number }> {
  const scene = sceneSizeM(layout);
  const fp = buildingFootprintM(config, layout);
  const off = buildingPlacementOffset(config, layout);
  // off is the building CENTER in scene-centered coords → SW corner in SW-origin meters.
  const swX = off.x + scene.width / 2 - fp.width / 2;
  const swZ = off.z + scene.depth / 2 - fp.depth / 2;
  const eps = 0.01;
  const c0 = Math.max(0, Math.floor((swX + eps) / GRID.parcelSize));
  const r0 = Math.max(0, Math.floor((swZ + eps) / GRID.parcelSize));
  const c1 = Math.min(layout.cols - 1, Math.ceil((swX + fp.width - eps) / GRID.parcelSize) - 1);
  const r1 = Math.min(layout.rows - 1, Math.ceil((swZ + fp.depth - eps) / GRID.parcelSize) - 1);
  const cells: Array<{ col: number; row: number }> = [];
  for (let row = r0; row <= r1; row++)
    for (let col = c0; col <= c1; col++) cells.push({ col, row });
  return cells;
}

/** Vertical circulation inside the shaft. */
export type RampType = "straight" | "l" | "spiral";

/** Player spawn location preset — maps to scene.json spawnPoints on publish. */
export type SpawnPreset = "entrance" | "inside" | "roof";

export const SPAWN_PRESET_LABELS: Record<SpawnPreset, string> = {
  entrance: "Entrance (outside door)",
  inside: "Inside (ground floor, ramp area)",
  roof: "Roof terrace",
};

export interface ColumnLayoutConfig {
  cornerColumns: boolean;
  intermediateColumnsPerSide: {
    front: number;
    back: number;
    left: number;
    right: number;
  };
  columnProfile?: ColumnProfile;
  columnWidth?: number;
  columnDepth?: number;
  columnHeightMode?: "per_floor" | "full_building";
  dedupeCornerColumns?: boolean;
  debug?: boolean;
}

import type { CirculationConfig, CirculationKind, CirculationFloorOverride } from "./circulation-anchor";
export type { CirculationConfig, CirculationKind, CirculationFloorOverride } from "./circulation-anchor";
import type { VoidPolicyConfig, AtriumConfig } from "./floor-void-policy";
export type {
  VoidPolicyConfig,
  AtriumConfig,
  FloorVoidPolicy,
  VoidProfile,
  RectVoidProfile,
  RoofVoidMode,
} from "./floor-void-policy";
import type {
  WallSectionOverride,
  WallSectionKind,
  WallBaySectionOverride,
  WindowGridSpec,
} from "./wall-sections";
export type {
  WallSectionOverride,
  WallSectionKind,
  WallSideId,
  WallBaySectionOverride,
  WindowGridSpec,
} from "./wall-sections";
import type { WallGlassOverride, PolygonWallGlassOverride } from "./wall-glass-overrides";
export type { WallGlassOverride, PolygonWallGlassOverride } from "./wall-glass-overrides";
import type { InteriorLightSpec } from "./interior-lights";
export type { InteriorLightSpec } from "./interior-lights";
import type { FloorSurfaceOverride, FloorSurfaceKind } from "./floor-sections";
export type { FloorSurfaceOverride, FloorSurfaceKind } from "./floor-sections";
import type { SiteGroundAccentId } from "./site-ground-accents";
export type { SiteGroundAccentId } from "./site-ground-accents";
import type { GroundScatterLayer } from "./ground-scatter";
import type { PlacedPlant, VegetationSeason } from "./vegetation-contract";
export type { PlacedPlant } from "./vegetation-contract";
export type { GroundScatterLayer } from "./ground-scatter";
import type { SeatingConfig } from "./seating";
export type { SeatingConfig } from "./seating";
import type { SurfaceFinish } from "./surface-finish";
export type { SurfaceFinish } from "./surface-finish";
import type { FloorCellPaint } from "./floor-cell-paint";
export type { FloorCellPaint } from "./floor-cell-paint";
import type { FloorFootprintOverride } from "./floor-massing";
export type { FloorFootprintOverride } from "./floor-massing";
import type { CustomPiece } from "./custom-pieces";
import type { WallModule, WallModuleOverride } from "./wall-modules";
// Type-only both ways (plan-shape imports BuildingConfig for its resolver), so this is a
// compile-time cycle that erases at runtime — no import order hazard.
import type { FloorPlanShapeOverride, PlanShape } from "./plan-shape";
export type { FloorPlanShapeOverride, PlanShape } from "./plan-shape";

/** Per-floor story height override. See `resolveStoryHeightForFloor`. */
export interface FloorHeightOverride {
  floor: number;
  height: number;
}
export type { CustomPiece, CustomPiecePart } from "./custom-pieces";

/**
 * An annex volume — a REAL walkable secondary building attached to one side of the
 * main volume (volume composition v1: rectangular, ground-attached, abutting).
 * The law it encodes: every volume must be a usable room. `purpose` is required —
 * a shape with no use is ornament and belongs in the piece grammar, never here.
 * Geometry/validation helpers live in shared/annex-volumes.ts.
 */
export interface AnnexVolume {
  id: string;
  /** What the space is FOR ("gallery", "stair tower", "cafe wing") — never empty. */
  purpose: string;
  /** Which side of the MAIN building it abuts (shares that edge). */
  side: "north" | "south" | "east" | "west";
  /** Shift along the shared edge from centered, meters (4 m grid, may be negative). */
  offsetM?: number;
  widthM: number;
  depthM: number;
  floors: number;
  storyHeight?: number;
  roofTerrace?: boolean;
  /** Non-connection walls (the wall facing the main building is always open). */
  wallStyle?: "glass" | "solid";
}

export interface BuildingConfig {
  floors: number;
  roofTerrace: boolean;
  buildingSpan: BuildingSpan;
  /**
   * Explicit ground footprint in METERS (4 m grid, min 8 m, max the scene axis).
   * When present it overrides `buildingSpan`, and land changes never rescale it —
   * growing the plot keeps the building its designed size ("fit to land" is an
   * explicit action, never automatic). Written by the size controls, AI
   * set_footprint_size, and materialized from the span by clampBuildingConfig.
   */
  footprintM?: { width: number; depth: number };
  /** Where the footprint sits on the plot (default "sw" — the legacy span anchor). */
  siteAnchor?: SiteAnchor;
  /** Exact south-west footprint position in scene meters; overrides the nine-point anchor. */
  siteOriginM?: { x: number; z: number };
  /** Floor-to-floor height in meters (default from grid.levelHeight). */
  storyHeight?: number;
  /**
   * Legacy parcel cell hosting the circulation slot (multi-parcel footprints).
   * Prefer `circulation.parcel`/`circulation.bay` for new configs. OPTIONAL: when
   * absent (e.g. after "Reset to center"), the shaft resolves to the true footprint
   * centre (0,0) instead of a corner parcel — this is what lets the elevator sit dead
   * centre on wide/shallow spans. Only the deprecated non-spiral ramp path still reads it.
   */
  rampCell?: { col: number; row: number };
  /**
   * Explicit circulation placement — resolve before floor openings.
   * `circulation.bay` moves the shaft on any footprint size; parcel is the fallback.
   */
  circulation?: CirculationConfig;
  /**
   * Per-floor ramp shaft position overrides. Any entry forces ramp-only circulation
   * (elevator cannot stack through a moving shaft).
   */
  circulationOverrides?: CirculationFloorOverride[];
  /** Floor void profiles + which floors get openings (requires circulation anchor). */
  voidPolicy?: VoidPolicyConfig;
  /**
   * High-level open-atrium control. When enabled, opens an enlarged central void around
   * the circulation (stairs stay connected on their boarding edge) with a walkable corridor
   * on the other sides — driving `voidPolicy` under the hood. See `atriumVoidProfile`.
   */
  atrium?: AtriumConfig;
  /** straight = diagonal; l = two legs along shaft edges; spiral = helix (radius scales with story height). */
  rampType?: RampType;
  /**
   * The spiral ramp is always the structure. "elevator" (default) adds a small platform that
   * rides up the central eye of the spiral (they coexist); "ramp" turns the platform off so
   * it's spiral-only; "elevator_only" drops the ramp/stairs entirely — the elevator is the
   * sole vertical access and its platform is enlarged to fill the shaft opening. Elevator_only
   * requires a centered, building-wide shaft (see isElevatorOnlyActive) or it falls back to ramp.
   */
  /**
   * ...and "launch" drops both: no ramp, no elevator, no shaft. Vertical movement is by
   * launch pad — you stand on one and Decentraland teleports you to an apex above the
   * next floor, then its own gravity drops you onto it. See shared/traversal.ts for why
   * that is the only shape a "catapult" can take on this platform.
   */
  circulationMode?: "ramp" | "elevator" | "elevator_only" | "launch";
  /**
   * How "launch" moves you: catapult, jump pad, teleport, speed corridor, flying route.
   * They are one mechanism with different arc heights and chaining — see
   * TRAVERSAL_PRESETS in shared/traversal.ts. Absent = catapult.
   */
  traversalPreset?: string;
  /**
   * Render the circulation deck as STEPS instead of a smooth ramp. Purely a visual
   * variant — it reuses the ramp's auto-expanding centerline and the exact same
   * walkable collider, so stairs climb reliably between floors. Default false (ramp).
   */
  circulationStairs?: boolean;
  /** Structural column perimeter layout (facade grid is separate). */
  columnLayout?: ColumnLayoutConfig;
  /**
   * Per-floor column overrides (corner toggle, per-side counts, profile). An entry
   * wins over `columnLayout` for that floor. Presence of ANY override switches column
   * rendering to per-floor height so each floor's layout is honored independently —
   * this is what lets the ground floor clear its columns for a walk-through opening
   * while upper floors keep theirs.
   */
  columnFloorOverrides?: ColumnFloorOverride[];
  entrySide: "north" | "south" | "east" | "west";
  entryCell: { col: number; row: number };
  wallNorth: WallType;
  wallSouth: WallType;
  wallEast: WallType;
  wallWest: WallType;
  /**
   * Per-side / per-floor wall-section overrides (glass | solid | entrance | balcony | open).
   * Each entry overrides the legacy global per-side WallType for that one side+floor.
   * See `resolveWallSectionKind` in `shared/wall-sections.ts`.
   */
  wallSections?: WallSectionOverride[];
  /**
   * Shape of the openings on every `window` wall section of this building. Absent = the
   * builder derives a grid from each bay, which is what lets a facade be asked for by the
   * word "window" alone. See `shared/wall-sections.ts`.
   */
  windowGrid?: WindowGridSpec;
  /**
   * Per-bay wall section overrides on rectangular footprints — mix kinds within one side.
   * See `resolveWallBayKind` in `shared/wall-sections.ts`.
   */
  wallBaySections?: WallBaySectionOverride[];
  /**
   * Per-side / per-floor glass look overrides (color, opacity, roughness, emissive).
   * Same knobs as the global facades controls; unset fields inherit global glass.
   * See `resolveWallGlassSettings` in `shared/wall-glass-overrides.ts`.
   */
  wallGlassOverrides?: WallGlassOverride[];
  /**
   * Per-floor interior lighting — the "lights on" attribute. One entry per LIT floor;
   * absent = dark, which is every floor's default. Drives an emissive soffit band in the
   * GLB (visible at any distance) and real `LightSource` lamps at runtime (visible when
   * you are in the room). See `shared/interior-lights.ts` — including why the emissive
   * cap in there must not be raised.
   */
  interiorLights?: InteriorLightSpec[];
  /**
   * Per-polygon-edge / per-floor glass look overrides (faceted footprints).
   * See `resolvePolygonWallGlassSettings` in `shared/wall-glass-overrides.ts`.
   */
  polygonWallGlassOverrides?: PolygonWallGlassOverride[];
  /**
   * Per-floor surface overrides (tile | concrete | wood | flat). Each entry overrides
   * the app's global active floor texture for that one floor. See
   * `resolveFloorSurfaceKind` in `shared/floor-sections.ts`.
   */
  floorSurfaces?: FloorSurfaceOverride[];
  /**
   * Per-cell floor paint on a 2 m grid — pattern + optional color tint per cell, rendered as
   * thin finish quads over the slab. See `shared/floor-cell-paint.ts`.
   */
  floorCellPaint?: FloorCellPaint[];
  /**
   * Per-floor massing (concentric footprint rects, nested, 4 m grid) — setbacks/towers with
   * guarded terraces. Floor 0 is always full; ignored while the atrium is enabled.
   * See `shared/floor-massing.ts` + docs/massing-design.md.
   */
  floorFootprints?: FloorFootprintOverride[];
  /**
   * Sloped envelope (the "loft") — per-floor setbacks become a smooth battered skin
   * instead of stepped terraces: planar quads from each floor's outline to the next.
   * Optional apex cap converges the top outline to a ridge point (pyramids, spires) —
   * apex replaces the roof terrace. Rectangle plans only; while active, the envelope
   * replaces perimeter walls, so facade wall ops don't apply.
   * See app/src/modules/sloped-envelope.ts.
   */
  envelope?: {
    style: "sloped";
    material?: "solid" | "glass";
    apex?: boolean;
    apexHeightM?: number;
  };
  /**
   * Decorative cap on the structural roof — tiers, dome, spire, halo, penthouse,
   * antennas, clutter. No collider. Counts toward the scene ceiling: see
   * `buildingTopM` and the crown fit in `clampBuildingConfig`. shared/roof-crown.ts.
   */
  roofCrown?: RoofCrownConfig;
  roofGuard: "solid" | "glass";
  /**
   * Fall-protection style: "economy" (default) = one glass panel per guard run
   * (12 tris/edge); "rails" = detailed posts + handrail (~40× the triangles).
   */
  guardStyle?: "economy" | "rails";
  /**
   * Footprint facet count. Undefined or 4 = the classic rectangular building. 6 = hexagon,
   * 8 = octagon, higher ≈ circular — a regular polygon INSCRIBED in the parcel footprint,
   * with the corners of the plot left as open setback. The rectangular parcel stays the
   * logical framework (grid, circulation, budget, bounds). Geometry (slabs, walls, columns,
   * roof guards, walk colliders) follows the polygon via `shared/perimeter.ts`.
   * See `createPolygonSlab` / `addPolygonWalls` / `footprintPerimeter`.
   */
  footprintSides?: number;
  /**
   * Per-EDGE wall kind for a polygon skin (index 0…sides-1), uniform across floors.
   * An explicit entry wins; missing entries follow the matching cardinal wall
   * (`wallSouth` etc.). "open"/"entrance" leave a walk-through gap (waist-high
   * guard above ground). Used for any non-rect `planShape`, not only `footprintSides`.
   */
  polygonWalls?: WallSectionKind[];
  /**
   * Ceiling self-illumination, 0 (matte) … 1 (bright). Keeps interiors from going pitch
   * black in a baked GLB without turning the ceiling into a lightbox. Default ~0.12.
   * See `setCeilingLightLevel` in `app/src/modules/parcel-slab.ts`.
   */
  ceilingLight?: number;
  /** Ceiling color (#rrggbb). Default light grey. The emissive glow follows it. */
  ceilingColor?: string;
  /**
   * Procedural ceiling pattern — same kinds as floors (`tile` | `concrete` | `wood` | `flat`).
   * Default `flat` (color only). Color multiplies on top of the pattern.
   * See `setCeilingTexture` in `app/src/modules/parcel-slab.ts`.
   */
  ceilingTexture?: "tile" | "concrete" | "wood" | "flat";
  /**
   * Surface finish for the ceiling and flat-color floors — the matte↔polished axis
   * (maps to material roughness/metalness, see `shared/surface-finish.ts`). Default
   * "matte". Textured floors keep their preset's own roughness.
   * See `setCeilingFinish` / `tintSlabFloorColor`.
   */
  surfaceFinish?: SurfaceFinish;
  /**
   * Finish for the solid wall material (`concrete_main` — solid panels, sloped
   * envelopes). Unset = the preset's own roughness (the pre-finish look, so existing
   * builds don't change). Set, it lets dark wall colors read as polished stone instead
   * of a void. See `setWallFinish` in `app/src/materials/presets.ts`.
   */
  wallFinish?: SurfaceFinish;
  /**
   * Decorative glass shell around the elevator cab only (not the spiral ramp), with a
   * walk-in gap. No collider. Building-wide (Shape). See `addGlassTube` in composer/building.ts.
   */
  glassTube?: boolean;
  /** Where players spawn when entering the deployed scene (written to scene.json spawnPoints). */
  spawnPreset?: SpawnPreset;
  /**
   * Exact spawn override — viewport drag or the publish map. When set it defines where
   * visitors land and overrides `spawnPreset` (emitted as the default scene.json
   * spawnPoint). Must be within the scene footprint — DCL forbids spawning outside
   * the scene's parcels.
   */
  customSpawn?: CustomSpawn | null;
  /**
   * AI-designed furniture as validated primitive assemblies — placeable and reusable
   * like catalog modules (a floor_prop's moduleId may be a piece id). See
   * `shared/custom-pieces.ts`.
   */
  customPieces?: CustomPiece[];
  /**
   * AI / library wall bay modules — primitive assemblies sized to fit one structural bay.
   * Overrides in `wallModuleOverrides` reference ids here. See `shared/wall-modules.ts`.
   */
  wallModules?: WallModule[];
  /**
   * The building's PLAN — its footprint as an outline rather than a width/depth pair.
   * Supersedes `footprintSides`, which could only ever name a regular shape; a config
   * without `planShape` still resolves through `footprintSides` (see `resolvePlanShape`),
   * so no stored build needs migrating. See `shared/plan-shape.ts`.
   */
  planShape?: PlanShape;
  /**
   * Per-floor plan overrides — a floor wearing a different outline from the building.
   * Pairs with `floorFootprints` (per-floor EXTENT): extent tapers a hull deck by deck,
   * shape drops a rectangular bridge block on the top deck. See `resolvePlanShapeForFloor`.
   */
  floorPlanShapes?: FloorPlanShapeOverride[];
  /**
   * Per-floor story height. Unset floors use the building-wide `storyHeight`.
   * Read via `resolveStoryHeightForFloor`; never multiply — use `floorBaseY`.
   */
  floorHeights?: FloorHeightOverride[];
  /** Per-bay (rect) or per-edge (polygon) wall module placements. */
  wallModuleOverrides?: WallModuleOverride[];
  /**
   * Building-wide facade: one module id dresses EVERY bay on every floor. Without it a
   * facade costs one click per bay (~48 on a 3-floor building), which is why the seven
   * stock modules shipped unused and every building rendered as the plain default wall.
   * Declarative on purpose — it survives resizing and reshaping, where a pre-expanded
   * list of per-bay overrides would go stale the moment the bay count changes.
   * Per-bay `wallModuleOverrides` still win. See `resolveWallModuleId`.
   */
  facadeStyle?: string;
  /**
   * Ground-floor facade, overriding `facadeStyle` on floor 0 only. A different base
   * (shopfront / colonnade) under a repeating upper facade is what makes a building
   * read as designed rather than extruded.
   */
  facadeGroundStyle?: string;
  /**
   * Attached secondary volumes (volume composition v1) — each a real walkable
   * mini-building abutting one side of the main volume. See shared/annex-volumes.ts.
   */
  annexes?: AnnexVolume[];
  /**
   * Ground plane around the building, filling the whole plot. Default (undefined /
   * surface "none") leaves DCL's base ground untouched. See `SiteGroundConfig`.
   */
  siteGround?: SiteGroundConfig;
  /**
   * ★★ PLOT-level: this plot is a BARE LOT — no buildings at all, just ground, the
   * arrival point and whatever site content is placed on it.
   *
   * It lives on `BuildingConfig` for one reason: `b1` cannot go away. It is a NAMESPACE
   * the pipeline leans on (recipe slot 0, component ids with no `bN::` prefix, and a
   * `buildingId: null` app binding meaning "the primary"), and `normalizeRecipe` throws
   * "Recipe missing building config" without it. So an empty plot is not `buildings: []`
   * with nothing behind it — b1 survives as the plot's CONFIG CARRIER (it already carries
   * `siteGround` and the `customSpawn` mirror the same way) and this flag says the carrier
   * contributes no shell: it is never composed, never outlined, never exported, and
   * `placedBuildingsForEditor()` reports an empty plot.
   *
   * Set on building 1 only, mirrored there by `setPlotEmpty` exactly as `setPlotSiteGround`
   * mirrors the paving. Reading it off any other building is meaningless.
   *
   * "I want to be able to populate it anywhere I want, building independent" (owner,
   * 2026-08-25).
   */
  emptyLot?: boolean;
}

/**
 * Site ground — a single flat plane covering the whole plot, around the building.
 * `surface` "none" (default) leaves DCL's own base ground; the other kinds render a
 * plot-sized paving/tile/wood/flat plane (one mesh, one shared procedural texture,
 * `color` multiplied on top). Visual only — no collider; avatars walk on DCL's
 * implicit y=0 base. Optional `accents` add one or more of five artifact families;
 * any mix, including none. Artifact colors are derived from `color`, not hardcoded.
 * See app/src/scene/site-ground.ts and shared/site-ground-accents.ts.
 */
/**
 * Ground under the whole plot. The paving kinds come from the floor surfaces; "grass" is
 * the plot's own, and it is deliberately a FLAT COLOUR in both frames — the in-world
 * ground plane has never carried a texture, so a Builder texture would be a promise the
 * world could not keep. Blades come from a grass ground-cover layer (the Garden's own
 * clusters), which both the Builder and the runtime draw.
 */
export type SiteGroundSurface = FloorSurfaceKind | "grass" | "none";

/** The green a grass plot wears when the owner has not picked a colour. */
export const GRASS_GROUND_COLOR = "#5f7d4a";
export interface SiteGroundConfig {
  surface: SiteGroundSurface;
  /**
   * The soft edge where the plot stops — an apron of soil with a wandering inner line,
   * so the paving does not end on a ruler. Off by default: an existing plot keeps the
   * hard edge it was authored with until someone asks for the border.
   *
   * `sides` exists because a scene cannot see its neighbours. Within one scene the
   * outline is exact, but two of the owner's own plots side by side would each draw
   * their apron along the shared join and put a double band of mud down the middle —
   * so the side facing your own land gets switched off. See shared/plot-border.ts.
   */
  border?: PlotBorderConfig;
  /** #rrggbb tint multiplied on the ground texture (default neutral paving grey). */
  color?: string;
  /** Matte↔polished (default matte). Glossy/polished make dark ground colors read as
   * polished stone catching the sky instead of a pitch-black void. */
  finish?: SurfaceFinish;
  /**
   * Authored artifacts on the paving. Omit / [] = none. Any subset of the five families.
   * Legacy eight-choice ids normalize into these families. Colors follow `color` (relative
   * hue/lightness), so a cream ground and a black ground do not share a fixed accent hex.
   */
  accents?: SiteGroundAccentId[];
  /**
   * Ground cover — library models spread over the paving. Each layer names one library
   * object plus its metrics (density, scale band, spacing, keep-out); the transforms are
   * solved by `planGroundScatter` so the Builder preview and the in-world scene agree.
   *
   * The model ships ONCE as a scene asset and every copy is a GltfContainer entity — it is
   * never duplicated into building.glb, which would multiply the publish payload.
   */
  scatter?: GroundScatterLayer[];
  /**
   * Which season the vegetation wears. "auto" (or absent) follows the calendar through
   * `vegetationSeasonForDate`, so a whole city turns autumn on one clock; a named season
   * pins it, which is what a scene set in permanent winter wants. Colour is baked into the
   * models, so a season is a different FILE, never a tint.
   */
  season?: VegetationSeason | "auto";
  /**
   * Plants standing where somebody PUT them, as opposed to where the ground-cover
   * planner spread them. One row names a species, not a file, so the plot's season and
   * the plant's growth stage decide which model it wears — and swapping the model
   * library changes every placed plant everywhere without touching a recipe.
   *
   * They cost the deploy nothing: the species library already travels with the scene
   * template, so the runtime just points an entity at it.
   */
  plants?: PlacedPlant[];
  /**
   * Bench circles you can sit on. Same deal as `scatter`: the layout is SOLVED from this config
   * by `planSeating` in both the Builder preview and the scene runtime, never transported. The
   * benches are primitives, not a model, so nothing ships and nothing bakes into building.glb.
   */
  seating?: SeatingConfig;
}

/**
 * Stable id of the editor's active building — always buildings[0]. Its component ids
 * carry NO namespace prefix (see shared/component-id.ts), which is what keeps every
 * pre-multi-building save, mesh name, and override valid.
 */
export const PRIMARY_BUILDING_ID = "b1";

/**
 * Per-building look. Colors were one scene-wide palette until 2026-08; each building now
 * carries its own so two towers on one plot can differ. Absent = inherit the scene
 * defaults stored at the top of the recipe (which is exactly what every legacy file has).
 */
export interface BuildingAppearance {
  materials?: Record<string, string>;
  glass?: { color: string; opacity: number; roughness: number; metalness: number };
  emissive?: Record<string, number>;
  floorTexture?: string;
}

/**
 * One building placed in a scene. Recipe v2.0 persists `buildings: PlacedBuilding[]`.
 * `id` doubles as the component-id namespace prefix (see shared/component-id.ts).
 *
 * Each entry owns its ENTIRE state: geometry config, look, and the spec components /
 * smart objects authored inside it. The editor activates one at a time — activating a
 * building swaps its whole bundle into the live spec — so "select a building" changes
 * the full editor context instead of only the primary one being editable.
 */
export interface PlacedBuilding {
  id: string;
  /** SW-corner offset from the scene origin, meters. Omitted = legacy siteAnchor placement. */
  originM?: { x: number; z: number };
  /** Vertical lift above the plot datum, meters. Omitted = ground-mounted. */
  elevationM?: number;
  /** Yaw in degrees, clockwise from north. Omitted = 0. */
  rotationDeg?: number;
  config: BuildingConfig;
  /** This building's own palette. Absent = the scene-level defaults. */
  appearance?: BuildingAppearance;
  /**
   * Spec components authored inside this building (structure, props, zones, signs).
   * Absent means "never activated in the editor" — the composer mints them from
   * `config` on first activation, which is how every pre-2026-08 file loads.
   *
   * Typed via a type-only import: scene-spec-contract imports types FROM here, so a
   * value import would be circular. `import type` is erased, so this one is not.
   */
  components?: import("./scene-spec-contract").SceneComponent[];
  /**
   * Fields a person set DELIBERATELY, by name (`wallSections`, `roofCrown`, `shell`…).
   * A bulk city edit skips a field listed here unless it is told to override, so a rerun
   * of the rules can never quietly undo the one building somebody fixed by hand.
   * See `shared/city-edit.ts`.
   */
  hand?: string[];
  /**
   * Placement groups held against EVERY write, not just a bulk sweep: position, footprint,
   * rotation, floors. `hand` protects how a building looks from a rule rerun; `hold` protects
   * where it stands from any edit at all, which is what a permanent city needs.
   * Enforced at the commit choke point. See `shared/building-hold.ts`.
   */
  hold?: string[];
  /** Smart entities (lifts, launchers) owned by this building. */
  smartObjects?: import("./smart-object-contract").SmartEntity[];
}

/** Decentraland scene parcel layout (columns × rows). Each parcel = 16m × 16m. */
export interface SceneLayout {
  cols: number;
  rows: number;
}

/**
 * Max side length for a World plot (parcels). 301 = Genesis +/-150 inclusive span;
 * DCL's documented square max is 300x300 (90_000 parcels).
 */
export const MAX_SCENE_SIDE = 301;
/** DCL Worlds hard ceiling on total parcels in one scene. */
export const MAX_SCENE_PARCELS = 90_000;

/**
 * Selectable scene plots. The list runs well past 3x3 on purpose: DCL caps a WORLD at
 * 300x300 parcels and charges nothing for them — the old 3x3 ceiling was ours, not
 * Decentraland's, and it silently capped the height limit at 66 m (log2(9+1)x20). Extra
 * parcels are the ONLY way to build taller, so the picker has to expose them.
 *
 * LAND is different — you may only use parcels you actually own — but that path never
 * reads this list: `landInheritedLayout()` wins in readSceneLayout and the picker is
 * hidden entirely. So a big preset here can't produce an undeployable LAND scene.
 *
 * Elongated strips (e.g. 301x3) exist so a rail corridor can span the World map without
 * claiming a solid 300x300 square.
 */
export const SCENE_PRESETS: { id: string; label: string; cols: number; rows: number }[] = [
  { id: "1x1", label: "1x1 (1 parcel)", cols: 1, rows: 1 },
  { id: "2x1", label: "2x1 (2 parcels)", cols: 2, rows: 1 },
  { id: "2x2", label: "2x2 (4 parcels)", cols: 2, rows: 2 },
  { id: "2x3", label: "2x3 (6 parcels)", cols: 2, rows: 3 },
  { id: "3x3", label: "3x3 (9 parcels)", cols: 3, rows: 3 },
  { id: "4x4", label: "4x4 (16 parcels)", cols: 4, rows: 4 },
  { id: "5x5", label: "5x5 (25 parcels)", cols: 5, rows: 5 },
  { id: "6x6", label: "6x6 (36 parcels)", cols: 6, rows: 6 },
  { id: "8x8", label: "8x8 (64 parcels)", cols: 8, rows: 8 },
  { id: "10x10", label: "10x10 (100 parcels)", cols: 10, rows: 10 },
  { id: "12x12", label: "12x12 (144 parcels)", cols: 12, rows: 12 },
  { id: "16x16", label: "16x16 (256 parcels)", cols: 16, rows: 16 },
  // 304 m — the default world for a new scene (shared/world-size.ts). Listed here so
  // the World size control and the Scene size picker stay ONE list, not two.
  { id: "19x19", label: "19x19 (361 parcels)", cols: 19, rows: 19 },
  { id: "20x20", label: "20x20 (400 parcels)", cols: 20, rows: 20 },
  { id: "30x30", label: "30x30 (900 parcels)", cols: 30, rows: 30 },
  { id: "45x45", label: "45x45 (2025 parcels)", cols: 45, rows: 45 },
  { id: "60x60", label: "60x60 (3600 parcels)", cols: 60, rows: 60 },
  { id: "100x100", label: "100x100 (10000 parcels)", cols: 100, rows: 100 },
  { id: "150x150", label: "150x150 (22500 parcels)", cols: 150, rows: 150 },
  { id: "200x200", label: "200x200 (40000 parcels)", cols: 200, rows: 200 },
  { id: "300x300", label: "300x300 (90000 parcels)", cols: 300, rows: 300 },
  { id: "2x45", label: "2x45 strip (90 parcels)", cols: 2, rows: 45 },
  { id: "3x45", label: "3x45 strip (135 parcels)", cols: 3, rows: 45 },
  { id: "45x2", label: "45x2 strip (90 parcels)", cols: 45, rows: 2 },
  { id: "45x3", label: "45x3 strip (135 parcels)", cols: 45, rows: 3 },
  { id: "2x151", label: "2x151 strip (302 parcels)", cols: 2, rows: 151 },
  { id: "3x151", label: "3x151 strip (453 parcels)", cols: 3, rows: 151 },
  { id: "151x2", label: "151x2 strip (302 parcels)", cols: 151, rows: 2 },
  { id: "151x3", label: "151x3 strip (453 parcels)", cols: 151, rows: 3 },
  { id: "3x300", label: "3x300 strip (900 parcels)", cols: 3, rows: 300 },
  { id: "300x1", label: "300x1 strip (300 parcels)", cols: 300, rows: 1 },
  { id: "300x2", label: "300x2 strip (600 parcels)", cols: 300, rows: 2 },
  { id: "300x3", label: "300x3 strip (900 parcels)", cols: 300, rows: 3 },
  { id: "1x300", label: "1x300 strip (300 parcels)", cols: 1, rows: 300 },
  { id: "2x300", label: "2x300 strip (600 parcels)", cols: 2, rows: 300 },
  { id: "3x301", label: "3x301 train corridor (903 parcels)", cols: 3, rows: 301 },
  { id: "301x3", label: "301x3 train corridor (903 parcels)", cols: 301, rows: 3 },
];

export function parcelCount(layout: SceneLayout): number {
  return layout.cols * layout.rows;
}

export function sceneSizeM(layout: SceneLayout): { width: number; depth: number } {
  return { width: layout.cols * GRID.parcelSize, depth: layout.rows * GRID.parcelSize };
}

/**
 * Position the building group, SW-anchored. The footprint mesh is centered on
 * its own origin, so we shift it so its SW corner sits at the scene SW corner.
 * `fill` collapses to (0,0) because the footprint equals the scene.
 */
export function buildingOffsetInScene(
  layout: SceneLayout,
  span: BuildingSpan = "single"
): { x: number; z: number } {
  const scene = sceneSizeM(layout);
  const fp = footprintSizeM(span, layout);
  return {
    x: -scene.width / 2 + fp.width / 2,
    z: -scene.depth / 2 + fp.depth / 2,
  };
}

export interface DclLimits {
  triangles: number;
  fileSizeBytes: number;
  materials: number;
  textures: number;
  maxHeight: number;
  maxFileSize: number;
}

/** Per https://docs.decentraland.org/creator/scenes-sdk7/optimizing/scene-limitations */
export function dclLimitsForScene(layout: SceneLayout): DclLimits {
  const n = parcelCount(layout);
  return {
    triangles: n * 10_000,
    fileSizeBytes: Math.min(n * 15 * 1024 * 1024, 300 * 1024 * 1024),
    materials: Math.floor(Math.log2(n + 1) * 20),
    textures: Math.floor(Math.log2(n + 1) * 10),
    maxHeight: Math.log2(n + 1) * 20,
    maxFileSize: 50 * 1024 * 1024,
  };
}

/**
 * Reserve vertical space above the structural shell for roof furniture, guard
 * rails, props — and THROWS. Catapult apexes reach the DCL cap minus 2 m
 * (`traversalCeilingM`); buildings stop 6 m under the cap, so every roof always has
 * ≥4 m of legal arc above it. That margin is the guarantee that any roof on the plot
 * is landable from a pad standing anywhere — shrink it and the tallest tower becomes
 * unreachable from the air with no error anywhere.
 */
export const DCL_HEIGHT_HEADROOM_M = 6;

/**
 * Waist-high fall protection on a walkable roof. Defined HERE, not in kit-geometry,
 * because kit-geometry imports this module and the height accounting below needs the
 * number — importing it back would close a cycle. kit-geometry re-exports it as
 * `DCL_GUARD_HEIGHT_M`, which stays the name every geometry call site uses.
 */
export const ROOF_GUARD_HEIGHT_M = 1.1;

/**
 * The line DECENTRALAND draws. Nothing above it renders in-world, so this — and only
 * this — is what may refuse a publish.
 *
 * Do not confuse it with `dclEffectiveBuildHeightM`, which is 6 m lower and is an
 * AUTHORING target: it keeps a landable arc over every roof for the traversal kit and
 * gives roof furniture somewhere to go. Sliders, floor counts, crown fitting and the
 * generators all aim at that lower number, and should. But a build that already exists
 * between the two lines is legal in-world, and refusing to publish it was the builder
 * inventing a limit Decentraland does not have (owner, 2026-09-09).
 */
export function dclPublishCeilingM(layout: SceneLayout): number {
  return dclLimitsForScene(layout).maxHeight;
}

/** Max structural height the builder may DESIGN to (DCL cap minus roof headroom). */
export function dclEffectiveBuildHeightM(layout: SceneLayout): number {
  return Math.max(GRID.levelHeight, dclLimitsForScene(layout).maxHeight - DCL_HEIGHT_HEADROOM_M);
}

/** @deprecated use dclLimitsForScene */
export const DCL_LIMITS = dclLimitsForScene({ cols: 1, rows: 1 });

export const STORY_HEIGHT_MIN = 2.6;
/**
 * Absolute sanity ceiling, NOT the real limit. The real limit is per-scene and already
 * enforced downstream: `maxStoryHeightAtFloors()` divides the scene's DCL height envelope
 * (log2(parcels+1) x 20 m) by the floor count, `clampBuildingConfig()` applies it, and the
 * UI slider takes its `max` from the same function. The old 5.0 was an invented authoring
 * cap of the same family as the 3x3 span and 25-floor caps already lifted — it blocked a
 * legitimate 50 m ground-floor hall on a scene whose envelope allows ~120 m.
 */
export const STORY_HEIGHT_MAX = 100;

/** Clamp a raw story height into the allowed band. Single source of truth — every
 * read path must use this so spec anchors can't desync from mesh Y. */
export function clampStoryHeight(h: number): number {
  return Math.min(STORY_HEIGHT_MAX, Math.max(STORY_HEIGHT_MIN, h));
}

export function resolveStoryHeight(config: BuildingConfig): number {
  return clampStoryHeight(config.storyHeight ?? GRID.levelHeight);
}

/**
 * Height of ONE floor. A ship's car deck is not the height of its cabin decks, and a
 * lobby is not the height of the offices above it; without this every building is a
 * uniform stack no matter what its plan says.
 */
export function resolveStoryHeightForFloor(config: BuildingConfig, floor: number): number {
  const override = (config.floorHeights ?? []).find((o) => o.floor === floor);
  return override ? clampStoryHeight(override.height) : resolveStoryHeight(config);
}

/**
 * Y of a floor's base — the CUMULATIVE sum of the floors beneath it, not `floor * height`.
 * Passing `config.floors` yields the roof level. Every place that multiplied to find a
 * height must call this instead, or a building with mixed floor heights tears apart:
 * slabs at one set of heights, walls and ramps at another.
 */
export function floorBaseY(config: BuildingConfig, floor: number): number {
  let y = 0;
  for (let f = 0; f < floor; f++) y += resolveStoryHeightForFloor(config, f);
  return y;
}

export function buildingHeightM(config: BuildingConfig): number {
  let h = floorBaseY(config, config.floors);
  if (config.roofTerrace) h += GRID.floorThickness;
  return h;
}

/**
 * Height the roof guard adds above the structural top. Drawn only with a roof terrace
 * (see `addRoofGuards` in app/src/composer/building.ts), and drawn 1.1 m tall — height
 * that used to appear in the measured mesh and in NO declaration.
 */
export function roofGuardHeightM(config: BuildingConfig): number {
  return config.roofTerrace ? ROOF_GUARD_HEIGHT_M : 0;
}

/**
 * The building's true top: structure, plus the roof guard standing on it, plus the
 * crown. The placement gate and any ceiling check must read THIS — a guard rail and a
 * crown are height like any other height, and while they were missing here the config
 * said one number and the exported mesh measured 1.75 m more.
 */
export function buildingTopM(config: BuildingConfig): number {
  return buildingHeightM(config) + roofGuardHeightM(config) + roofCrownHeightM(config.roofCrown);
}

/**
 * NOTE — the floor math below deliberately does NOT reserve the 1.1 m roof guard.
 * It reserves only the terrace slab, as it always has.
 *
 * The guard is real height and `buildingTopM` counts it, but these two functions decide
 * how many floors an AUTHOR may stack, and they aim at `dclEffectiveBuildHeightM`, which
 * already sits 6 m under Decentraland's ceiling. A guard standing on that target still
 * clears the real cap by 4.9 m. Charging the guard here instead cost every shipped recipe
 * up to a floor on small plots and made three recipe suites reject builds that had been
 * legal for months — the reserve is what the reserve is FOR.
 */
export function maxFloorsAtStoryHeight(
  layout: SceneLayout,
  storyHeight: number,
  roofTerrace: boolean
): number {
  const limit = dclEffectiveBuildHeightM(layout);
  const terrace = roofTerrace ? GRID.floorThickness : 0;
  const floors = Math.floor((limit - terrace) / clampStoryHeight(storyHeight) + 1e-9);
  return Math.max(1, floors);
}

/** Highest story height allowed for a fixed floor count under the effective cap. */
export function maxStoryHeightAtFloors(
  layout: SceneLayout,
  floors: number,
  roofTerrace: boolean
): number {
  const limit = dclEffectiveBuildHeightM(layout);
  const terrace = roofTerrace ? GRID.floorThickness : 0;
  if (floors < 1) return STORY_HEIGHT_MAX;
  return Math.min(STORY_HEIGHT_MAX, Math.max(STORY_HEIGHT_MIN, (limit - terrace) / floors));
}

/**
 * Keep a mixed-height stack under DCL's build-height cap by scaling every override
 * proportionally. Returns undefined when there are no overrides (the uniform path already
 * handles that case). `base` must already carry the clamped floors + storyHeight.
 */
function clampFloorHeightsToBuildHeight(
  overrides: FloorHeightOverride[] | undefined,
  base: BuildingConfig,
  layout: SceneLayout
): FloorHeightOverride[] | undefined {
  if (!overrides?.length) return overrides;
  const inRange = overrides
    .filter((o) => o.floor >= 0 && o.floor < base.floors)
    .map((o) => ({ floor: o.floor, height: clampStoryHeight(o.height) }));
  if (!inRange.length) return undefined;

  const limit = dclEffectiveBuildHeightM(layout);
  const terrace = base.roofTerrace ? GRID.floorThickness : 0;
  const total = floorBaseY({ ...base, floorHeights: inRange }, base.floors);
  if (total + terrace <= limit) return inRange;

  const scale = (limit - terrace) / total;
  return inRange.map((o) => ({ floor: o.floor, height: clampStoryHeight(o.height * scale) }));
}

export function clampBuildingConfig(
  config: BuildingConfig,
  layout: SceneLayout
): BuildingConfig {
  const structural = clampBuildingConfigStructure(config, layout);
  if (!structural.roofCrown) return structural;
  // Height is land: the crown gets whatever headroom the structure leaves under the
  // cap, shortened rather than refused, and dropped only when under a metre is left.
  const headroomM =
    dclEffectiveBuildHeightM(layout) - buildingHeightM(structural) - roofGuardHeightM(structural);
  const fitted = fitRoofCrownToHeadroom(structural.roofCrown, headroomM);
  return fitted ? { ...structural, roofCrown: fitted } : { ...structural, roofCrown: undefined };
}

function clampBuildingConfigStructure(
  config: BuildingConfig,
  layout: SceneLayout
): BuildingConfig {
  const circulationCoreV2 = config.circulation?.system === "core_v2";
  let storyHeight = resolveStoryHeight(config);
  const maxFloors = maxFloorsAtStoryHeight(layout, storyHeight, config.roofTerrace);
  const floors = Math.min(Math.max(1, config.floors), maxFloors);
  storyHeight = Math.min(
    storyHeight,
    maxStoryHeightAtFloors(layout, floors, config.roofTerrace)
  );
  // Per-floor heights bypass the uniform storyHeight cap above, so the TOTAL has to be
  // re-checked: DCL enforces a height limit per parcel count, and a tall car deck plus
  // normal cabin decks can clear it while every individual floor looks legal. Scale the
  // whole stack down proportionally rather than truncating the top floor, which would
  // silently change the building's proportions.
  const floorHeights = clampFloorHeightsToBuildHeight(
    config.floorHeights,
    { ...config, floors, storyHeight },
    layout
  );
  // Materialize the explicit footprint (legacy span configs get their span-derived
  // meters ONCE; from then on land changes never rescale the building — only the
  // size controls / AI ops / "fit to land" do). Scene shrink still clamps.
  const { width, depth } = buildingFootprintM(config, layout);
  const scene = sceneSizeM(layout);
  const siteOriginM =
    config.siteOriginM &&
    Number.isFinite(config.siteOriginM.x) &&
    Number.isFinite(config.siteOriginM.z)
      ? {
          x: Math.min(
            Math.max(0, Math.round(config.siteOriginM.x / GRID.cellSize) * GRID.cellSize),
            Math.max(0, scene.width - width)
          ),
          z: Math.min(
            Math.max(0, Math.round(config.siteOriginM.z / GRID.cellSize) * GRID.cellSize),
            Math.max(0, scene.depth - depth)
          ),
        }
      : undefined;

  const columnLayout = clampColumnLayoutConfig(
    config.columnLayout ?? {
      cornerColumns: true,
      intermediateColumnsPerSide: { front: 0, back: 0, left: 0, right: 0 },
      dedupeCornerColumns: true,
    },
    width,
    depth
  );

  // Keep any exact spawn override inside the scene footprint (DCL requires it).
  // Cell-only overrides stay snapped to parcel centres; metre-precise drags keep x/z.
  const customSpawn = config.customSpawn
    ? clampCustomSpawn(config.customSpawn, layout)
    : config.customSpawn ?? undefined;

  // Launch pads remain the safe default and legacy ramps stay retired, but explicit
  // elevator modes are product features again. An elevator shaft must stack through
  // every floor, so incompatible per-floor bay overrides are discarded instead of
  // silently downgrading the requested lift to another circulation system.
  const requestedCirculationMode = config.circulationMode ?? "launch";
  const circulationMode =
    requestedCirculationMode === "ramp" ? "launch" : requestedCirculationMode;
  const elevatorActive =
    circulationMode === "elevator" || circulationMode === "elevator_only";

  return {
    ...config,
    storyHeight,
    floors,
    floorHeights,
    rampType: "spiral",
    circulationMode,
    // Named explicitly because this function REBUILDS the config from a field list rather
    // than spreading it — anything not listed here is silently dropped on every rebuild,
    // which reads as "I pick a movement style and it bounces back to catapult".
    traversalPreset: config.traversalPreset,
    circulationStairs: elevatorActive ? (config.circulationStairs ?? false) : false,
    circulationOverrides: undefined,
    // The tube exists to wrap a cab. With no cab it is a glass cylinder in mid-air.
    glassTube: elevatorActive ? (config.glassTube ?? false) : false,
    circulation: circulationCoreV2
      ? {
          ...config.circulation,
          system: "core_v2",
          slotSize: 8,
          entryEdge: config.circulation?.entryEdge ?? "south",
          elevatorCount: Math.max(
            1,
            Math.min(4, Math.round(config.circulation?.elevatorCount ?? 1))
          ),
        }
      : config.circulation,
    buildingSpan: normalizeBuildingSpan(config.buildingSpan ?? "single", layout),
    footprintM: { width, depth },
    siteAnchor: config.siteAnchor ?? "sw",
    siteOriginM,
    columnLayout,
    customSpawn,
  };
}

export function resolveColumnLayout(
  config: BuildingConfig,
  width: number,
  depth: number
): ColumnLayoutSpec {
  const base = defaultColumnLayoutSpec();
  const c = config.columnLayout;
  return clampColumnLayoutSpec(
    {
      cornerColumns: c?.cornerColumns ?? base.cornerColumns,
      intermediateColumnsPerSide: {
        ...base.intermediateColumnsPerSide,
        ...c?.intermediateColumnsPerSide,
      },
      columnProfile: c?.columnProfile ?? base.columnProfile,
      columnWidth: c?.columnWidth ?? base.columnWidth,
      columnDepth: c?.columnDepth ?? base.columnDepth,
      columnHeightMode: c?.columnHeightMode ?? base.columnHeightMode,
      dedupeCornerColumns: c?.dedupeCornerColumns ?? base.dedupeCornerColumns,
      debug: c?.debug ?? base.debug,
    },
    width,
    depth
  );
}

/**
 * Resolve the column spec for one floor: the building-wide spec with that floor's
 * override folded in (override wins). When ANY per-floor override exists on the
 * building, height mode is coerced to "per_floor" so each floor renders its own
 * columns — otherwise a "full_building" unified column stack (built once on floor 0)
 * would ignore every upper-floor override.
 */
export function resolveColumnLayoutForFloor(
  config: BuildingConfig,
  floor: number,
  width: number,
  depth: number
): ColumnLayoutSpec {
  const base = resolveColumnLayout(config, width, depth);
  const hasAnyOverride = (config.columnFloorOverrides?.length ?? 0) > 0;
  const heightMode = hasAnyOverride ? "per_floor" : base.columnHeightMode;
  const override = getColumnFloorOverride(config.columnFloorOverrides, floor);
  if (!override) {
    return heightMode === base.columnHeightMode
      ? base
      : { ...base, columnHeightMode: heightMode };
  }
  return clampColumnLayoutSpec(
    {
      ...base,
      columnHeightMode: heightMode,
      cornerColumns: override.cornerColumns ?? base.cornerColumns,
      columnProfile: override.columnProfile ?? base.columnProfile,
      intermediateColumnsPerSide: {
        ...base.intermediateColumnsPerSide,
        ...override.intermediateColumnsPerSide,
      },
    },
    width,
    depth
  );
}

function clampColumnLayoutConfig(
  layout: NonNullable<BuildingConfig["columnLayout"]>,
  width: number,
  depth: number
): ColumnLayoutConfig {
  const base = defaultColumnLayoutSpec();
  const spec = clampColumnLayoutSpec(
    {
      cornerColumns: layout.cornerColumns ?? base.cornerColumns,
      intermediateColumnsPerSide: {
        ...base.intermediateColumnsPerSide,
        ...layout.intermediateColumnsPerSide,
      },
      columnProfile: layout.columnProfile ?? base.columnProfile,
      columnWidth: layout.columnWidth ?? base.columnWidth,
      columnDepth: layout.columnDepth ?? base.columnDepth,
      columnHeightMode: layout.columnHeightMode ?? base.columnHeightMode,
      dedupeCornerColumns: layout.dedupeCornerColumns ?? base.dedupeCornerColumns,
      debug: layout.debug ?? base.debug,
    },
    width,
    depth
  );
  return {
    cornerColumns: spec.cornerColumns,
    intermediateColumnsPerSide: spec.intermediateColumnsPerSide,
    columnProfile: spec.columnProfile,
    columnWidth: spec.columnWidth,
    columnDepth: spec.columnDepth,
    columnHeightMode: spec.columnHeightMode,
    dedupeCornerColumns: spec.dedupeCornerColumns,
    debug: spec.debug,
  };
}
