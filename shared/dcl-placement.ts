import {
  GRID,
  type BuildingConfig,
  type PlacedBuilding,
  type SceneLayout,
  type SpawnPreset,
  buildingFootprintCells,
  buildingFootprintM,
  buildingPlacementOffset,
  resolveColumnLayout,
  resolveStoryHeight,
  sceneSizeM,
} from "./types";
import { clampCustomSpawn } from "./custom-spawn";
export { customSpawnFromDcl } from "./custom-spawn";
import {
  buildingElevationM,
  resolveBuildingPlacement,
} from "./building-placement";
import { SITE_DATUM_Y } from "./kit-geometry";
import { resolveCirculationAnchor } from "./circulation-anchor";
import { planColumnLayout } from "./column-layout";
import { slabRectForLevel } from "./floor-massing";

const { cellSize } = GRID;

/** DCL avatar footprint radius — a spawn must clear this much around any obstruction. */
export const AVATAR_SPAWN_RADIUS_M = 0.5;
/** How far inside the entry facade to place the entrance spawn (off the column line). */
export const ENTRY_SPAWN_INSET_M = 3;

/** A no-go disc in BUILDING-LOCAL composer coords (centered on the footprint). */
export interface SpawnObstruction {
  x: number;
  z: number;
  /** Obstruction radius (avatar radius is added on top when testing). */
  r: number;
}

/** Structural columns as obstruction discs — always derivable from config alone. */
export function columnSpawnObstructions(
  building: BuildingConfig,
  layout: SceneLayout,
): SpawnObstruction[] {
  const { width, depth } = buildingFootprintM(building, layout);
  const resolved = resolveColumnLayout(building, width, depth);
  const half = Math.max(0.15, (resolved.columnWidth ?? 0.3) / 2);
  return planColumnLayout(width, depth, resolved).map((c) => ({
    x: c.x,
    z: c.z,
    r: half,
  }));
}

/** Building-local composer XZ nudged clear of every obstruction, staying on the walkable
 * footprint. Spirals outward from the candidate until it finds air — so an avatar never
 * spawns inside a column, a wall, an arch jamb, or a statue. */
export function clearSpawnComposerXZ(
  x: number,
  z: number,
  obstructions: SpawnObstruction[],
  footprint: {
    width: number;
    depth: number;
    offsetX?: number;
    offsetZ?: number;
  },
): { x: number; z: number } {
  const fCx = footprint.offsetX ?? 0;
  const fCz = footprint.offsetZ ?? 0;
  const halfW = Math.max(0.5, footprint.width / 2 - 0.6);
  const halfD = Math.max(0.5, footprint.depth / 2 - 0.6);
  const clamp = (v: number, center: number, half: number) =>
    Math.max(center - half, Math.min(center + half, v));
  const blocked = (px: number, pz: number) =>
    obstructions.some(
      (o) => Math.hypot(px - o.x, pz - o.z) < o.r + AVATAR_SPAWN_RADIUS_M,
    );

  const cx = clamp(x, fCx, halfW);
  const cz = clamp(z, fCz, halfD);
  if (!blocked(cx, cz)) return { x: cx, z: cz };

  const maxR = Math.max(footprint.width, footprint.depth);
  for (let r = 0.5; r <= maxR; r += 0.5) {
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2;
      const px = clamp(x + Math.cos(ang) * r, fCx, halfW);
      const pz = clamp(z + Math.sin(ang) * r, fCz, halfD);
      if (!blocked(px, pz)) return { x: px, z: pz };
    }
  }
  return { x: cx, z: cz };
}

/** Unit inward direction (composer XZ) from the entry side toward the building interior. */
function entryInwardDir(entrySide: BuildingConfig["entrySide"]): {
  x: number;
  z: number;
} {
  switch (entrySide) {
    case "north":
      return { x: 0, z: -1 };
    case "east":
      return { x: -1, z: 0 };
    case "west":
      return { x: 1, z: 0 };
    case "south":
    default:
      return { x: 0, z: 1 };
  }
}

/**
 * COMPOSER → SCENE MAPPING — read before touching any placement math.
 *
 * The DCL explorer renders our exported GLB **exactly as authored** — composer
 * +z is scene +z relative to the model origin. There is NO z-mirror.
 *
 * HISTORY (why this doc block exists): on 2026-07-10 a "coordinate mirror"
 * (z-flip) was added here, believed to be an explorer GLB-handedness quirk.
 * Every observation behind that belief was made while the runtime was secretly
 * running the INLINED PREVIEW FIXTURE config (postmortem root cause #14) — the
 * gates/screens being watched were at fixture coordinates, not the deployed
 * ones, so the "mirror" was mis-calibrated from ghost data. Verified against a
 * REAL config on 2026-07-11 (first day the runtime read the deployed config):
 *   - spawn "entrance" (flipped z=43) landed the avatar ON the Orchestra circle
 *     (composer z=+10 → unmirrored 34±r), not in the Entry Forecourt (−18.5);
 *   - the screen (composer +16.78, flipped to 7.2) rendered NEXT TO the
 *     forecourt/bench plaza (unmirrored at 5.5) instead of at the stage;
 *   - the facade (composer ~+20) rendered NEAR the flipped spawn (~44).
 * All three said the same thing: the building is unmirrored and OUR flip was
 * the mirror. Identity mapping restored; preview is truth.
 *
 * Rule: composer local → scene = (origin.x + x, origin.z + z), yaw passes
 * through. `composerToDcl` (below) does the same for absolute composer coords.
 * ALWAYS go through these functions — never hand-roll the offset — so any
 * future correction is one edit.
 */
export function glbLocalToScene(
  origin: { x: number; z: number },
  localX: number,
  localZ: number,
): { x: number; z: number } {
  return { x: origin.x + localX, z: origin.z + localZ };
}

/** Inverse of glbLocalToScene — scene meters → composer/building-local. */
export function sceneToGlbLocal(
  origin: { x: number; z: number },
  sceneX: number,
  sceneZ: number,
): { x: number; z: number } {
  return { x: sceneX - origin.x, z: sceneZ - origin.z };
}

/** Composer yaw → scene yaw. Identity (no mirror — see doc block above). */
export function glbYawToScene(rotationY: number): number {
  return rotationY;
}

/** Composer (Three.js) XZ → Decentraland scene meters. Scene origin is SW corner
 * of the parcel grid. Pure offset — no mirror (see doc block above). */
export function composerToDcl(
  x: number,
  z: number,
  layout: SceneLayout,
): { x: number; z: number } {
  const { width, depth } = sceneSizeM(layout);
  return { x: x + width / 2, z: z + depth / 2 };
}

/**
 * Where to place the exported GLB root in DCL scene meters.
 * Export geometry is centered on composer origin; DCL scene origin is the SW corner of the parcel grid.
 */
export function buildingGlbOriginDcl(
  building: BuildingConfig,
  layout: SceneLayout,
): { x: number; y: number; z: number } {
  const off = buildingPlacementOffset(building, layout);
  const dcl = composerToDcl(off.x, off.z, layout);
  // y is the SITE DATUM, not zero. At zero the ground slab's underside, the shaft posts
  // and anything resting on the plot are coplanar with Decentraland's terrain — which
  // flickers in-world — and sit UNDER the site paving, which had already been lifted to
  // clear that same fight. Every consumer of this origin (the building GLB and each
  // smart-object GLB) is lifted together, so nothing can drift onto a different ground.
  return { x: dcl.x, y: SITE_DATUM_Y, z: dcl.z };
}

/**
 * DCL scene origin for ANY placed building's own GLB — the runtime `Transform` position
 * of a model that is centered on itself with no baked placement.
 *
 * This is the load-bearing half of "no building is special": since 2026-08-10 every
 * building exports as its OWN GLB (geometry about its own center, rotation baked,
 * position zero) and the runtime places it here — the same path as every smart-object
 * GLB, the one surface that never once rendered on the wrong side of the world. A
 * building's position inside another building's GLB, by contrast, crosses the
 * Explorer's glTF import untraceably (nine "other side of the map" reports).
 *
 * `resolveBuildingPlacement().center` is already SW-origin scene meters — the DCL frame.
 * The y is the shared site datum, identical to `buildingGlbOriginDcl`, so all buildings
 * and all smart objects ride one ground.
 */
export function placedBuildingOriginDcl(
  placed: PlacedBuilding,
  layout: SceneLayout,
): { x: number; y: number; z: number } {
  const placement = resolveBuildingPlacement(placed, layout);
  return {
    x: placement.center.x,
    y: SITE_DATUM_Y + buildingElevationM(placed),
    z: placement.center.z,
  };
}

/** Grid cell center in composer space (matches BuildingComposer.wallBayOrigin). */
export function cellCenterComposer(
  col: number,
  row: number,
  footprint: { width: number; depth: number } = {
    width: GRID.parcelSize,
    depth: GRID.parcelSize,
  },
): { x: number; z: number } {
  return {
    x: col * cellSize - footprint.width / 2 + cellSize / 2,
    z: row * cellSize - footprint.depth / 2 + cellSize / 2,
  };
}

export function entrySpawnDcl(
  building: BuildingConfig,
  layout: SceneLayout,
  extraObstructions: SpawnObstruction[] = [],
): { x: number; y: number; z: number } {
  const off = buildingPlacementOffset(building, layout);
  const footprint = buildingFootprintM(building, layout);
  const cell = cellCenterComposer(
    building.entryCell.col,
    building.entryCell.row,
    footprint,
  );
  // Start a few metres INSIDE the entry facade — the entry cell sits on the perimeter
  // column line and right where the AI drops entry arches, so spawning at the cell
  // itself lands the avatar inside a column/arch jamb.
  const inward = entryInwardDir(building.entrySide);
  const startX = cell.x + inward.x * ENTRY_SPAWN_INSET_M;
  const startZ = cell.z + inward.z * ENTRY_SPAWN_INSET_M;
  const obstructions = [
    ...columnSpawnObstructions(building, layout),
    ...extraObstructions,
  ];
  const clear = clearSpawnComposerXZ(startX, startZ, obstructions, footprint);
  const dcl = composerToDcl(off.x + clear.x, off.z + clear.z, layout);
  return { x: dcl.x, y: 0.2, z: dcl.z };
}

/** Ground-floor walk surface at the shaft / spiral ramp center. */
export function insideSpawnDcl(
  building: BuildingConfig,
  layout: SceneLayout,
): { x: number; y: number; z: number } {
  const { x, z } = rampCenterDcl(building, layout);
  return { x, y: 0.2, z };
}

/**
 * Top walk surface — roof terrace when enabled, otherwise highest floor.
 * Placed in the roof corner farthest from the shaft (not over its 4×4 opening),
 * so the avatar lands on solid deck instead of falling down the shaft.
 */
export function roofSpawnDcl(
  building: BuildingConfig,
  layout: SceneLayout,
  extraObstructions: SpawnObstruction[] = [],
): { x: number; y: number; z: number } {
  const story = resolveStoryHeight(building);
  const topFloor = building.roofTerrace
    ? building.floors
    : Math.max(0, building.floors - 1);
  const y = topFloor * story + 0.2;

  // The top walk surface follows the top floor's (possibly massed/shrunk) footprint,
  // not the full plot rect — spawning off a shrunk roof would drop the avatar.
  const footprint = slabRectForLevel(building, layout, topFloor);
  const anchor = resolveCirculationAnchor(building, layout);
  const off = buildingPlacementOffset(building, layout);

  // Pick the corner opposite the shaft so we maximise clearance from the opening,
  // inset by a margin to stay off the parapet edge.
  const margin = 1.2;
  const fCx = footprint.offsetX ?? 0;
  const fCz = footprint.offsetZ ?? 0;
  const cornerX =
    anchor.centerX >= fCx
      ? fCx - (footprint.width / 2 - margin)
      : fCx + (footprint.width / 2 - margin);
  const cornerZ =
    anchor.centerZ >= fCz
      ? fCz - (footprint.depth / 2 - margin)
      : fCz + (footprint.depth / 2 - margin);

  // Corner columns land right at this inset corner — nudge off them (and any roof piece).
  const obstructions = [
    ...columnSpawnObstructions(building, layout),
    ...extraObstructions,
  ];
  const clear = clearSpawnComposerXZ(cornerX, cornerZ, obstructions, footprint);
  const dcl = composerToDcl(off.x + clear.x, off.z + clear.z, layout);
  return { x: dcl.x, y, z: dcl.z };
}

export interface SpawnPointDcl {
  /** "custom" whenever an exact override supplied the coordinates — see `customSpawnDrift`. */
  preset: SpawnPreset | "custom";
  x: number;
  y: number;
  z: number;
  cameraTarget: { x: number; y: number; z: number };
}

export function resolveSpawnPreset(building: BuildingConfig): SpawnPreset {
  return building.spawnPreset ?? "entrance";
}

/**
 * A PRESET SPAWN MUST STILL LAND ON THE PLOT.
 *
 * Presets are resolved relative to the building ("just inside the entry door", "the far
 * roof corner"), and the building carries its own placement offset. Nothing then checked
 * the result against the scene bounds, so a building parked near an edge — or one whose
 * offset had drifted — produced an arrival marker sitting OUTSIDE the red plot outline
 * (owner, 2026-08-24: "the spawn point always starts in that corner over there").
 * Decentraland forbids spawning outside a scene's parcels, so that is not a preference,
 * it is an invalid scene.json.
 *
 * An authored `customSpawn` is already clamped by `clampCustomSpawn`; this is the same
 * guarantee for the derived ones. Half a metre of inset keeps the avatar off the seam.
 */
function clampSpawnToPlot<T extends { x: number; z: number }>(
  point: T,
  layout: SceneLayout,
): T {
  const width = layout.cols * GRID.parcelSize;
  const depth = layout.rows * GRID.parcelSize;
  const x = Math.max(0.5, Math.min(width - 0.5, point.x));
  const z = Math.max(0.5, Math.min(depth - 0.5, point.z));
  return x === point.x && z === point.z ? point : { ...point, x, z };
}

export function resolveSpawnDcl(
  building: BuildingConfig,
  layout: SceneLayout,
  preset: SpawnPreset = resolveSpawnPreset(building),
  extraObstructions: SpawnObstruction[] = [],
): SpawnPointDcl {
  return clampSpawnToPlot(
    resolveSpawnDclRaw(building, layout, preset, extraObstructions),
    layout,
  );
}

function resolveSpawnDclRaw(
  building: BuildingConfig,
  layout: SceneLayout,
  preset: SpawnPreset,
  extraObstructions: SpawnObstruction[],
): SpawnPointDcl {
  switch (preset) {
    case "inside": {
      const position = insideSpawnDcl(building, layout);
      const entry = entrySpawnDcl(building, layout, extraObstructions);
      return {
        preset,
        ...position,
        cameraTarget: {
          x: entry.x,
          y: position.y + 1.2,
          z: entry.z + 1.5,
        },
      };
    }
    case "roof": {
      const position = roofSpawnDcl(building, layout, extraObstructions);
      const { x: cx, z: cz } = rampCenterDcl(building, layout);
      return {
        preset,
        ...position,
        cameraTarget: {
          x: cx,
          y: Math.max(0.5, position.y - 1),
          z: cz + 3,
        },
      };
    }
    case "entrance":
    default: {
      const position = entrySpawnDcl(building, layout, extraObstructions);
      // Face INTO the venue on arrival — toward the building centre (and thus the
      // stage/screen on the far wall), not a fixed +x/+z offset that could point
      // the avatar straight back out the entrance (which read as "the screen is
      // behind me / at the back"). Aim in world space so it's independent of the
      // GLB z-mirror.
      const centre = buildingGlbOriginDcl(building, layout);
      const dx = centre.x - position.x;
      const dz = centre.z - position.z;
      const len = Math.hypot(dx, dz) || 1;
      return {
        preset: "entrance",
        ...position,
        cameraTarget: {
          x: position.x + (dx / len) * 4,
          y: position.y + 1.5,
          z: position.z + (dz / len) * 4,
        },
      };
    }
  }
}

/**
 * DCL scene position for an exact spawn override. Coordinates are relative to the base
 * parcel's SW corner — the frame scene.json spawnPoints use. Metre-precise `x`/`z` win
 * over parcel-centre so a viewport drag is what visitors actually land on. Null when
 * no override is set.
 */
export function customSpawnDcl(
  building: BuildingConfig,
  layout: SceneLayout,
): { x: number; y: number; z: number } | null {
  const cs = building.customSpawn;
  if (!cs) return null;
  const clamped = clampCustomSpawn(cs, layout);
  const x =
    typeof clamped.x === "number" && Number.isFinite(clamped.x)
      ? clamped.x
      : clamped.col * GRID.parcelSize + GRID.parcelSize / 2;
  const z =
    typeof clamped.z === "number" && Number.isFinite(clamped.z)
      ? clamped.z
      : clamped.row * GRID.parcelSize + GRID.parcelSize / 2;
  let y = 0.2;
  if (typeof clamped.y === "number" && Number.isFinite(clamped.y))
    y = clamped.y;
  else if (clamped.level === "roof") {
    const story = resolveStoryHeight(building);
    const topFloor = building.roofTerrace
      ? building.floors
      : Math.max(0, building.floors - 1);
    y = topFloor * story + 0.2;
  }
  return { x, y, z };
}

/**
 * How far outside the built footprint an exact spawn may still sit and count as authored.
 * One ring of parcels covers "just outside the entry door"; anything further is drift.
 */
export const CUSTOM_SPAWN_FOOTPRINT_MARGIN_CELLS = 1;

/**
 * Report a custom spawn that stands on no building — ADVISORY ONLY, never a correction.
 *
 * `customSpawn` is stored as an ABSOLUTE scene cell while the publish map offers it as a
 * spot on your build, so moving a building afterwards can strand the cell. But the check
 * is only ever as good as the footprints it is handed, and the obvious source —
 * `buildingFootprintCells` — describes the PRIMARY building alone. On 2026-08-10 that cost
 * an hour: the authored spawn at cell (1,1) sat squarely inside the `speakeasy_entry`
 * secondary building, this function could not see that building, called it drift, and the
 * spawn was relocated into the tower. An author's spawn is intent; a footprint check that
 * cannot enumerate every building has no standing to overrule it.
 *
 * So: callers pass `occupiedCells` covering EVERY placed building (see
 * `placedBuildingOutlineParcels`), the result is surfaced as a warning, and the spawn ships
 * exactly as authored either way. Pinned by `tests/shared/custom-spawn-drift.test.ts`.
 */
export function customSpawnDrift(
  building: BuildingConfig,
  layout: SceneLayout,
  occupiedCells?: ReadonlyArray<{ col: number; row: number }>,
): {
  col: number;
  row: number;
  distanceCells: number;
  nearest: { col: number; row: number };
} | null {
  const cs = building.customSpawn;
  if (!cs) return null;
  const col = Math.max(0, Math.min(layout.cols - 1, Math.round(cs.col)));
  const row = Math.max(0, Math.min(layout.rows - 1, Math.round(cs.row)));

  const cells = occupiedCells?.length
    ? occupiedCells
    : buildingFootprintCells(building, layout);
  if (!cells.length) return null;

  let distanceCells = Infinity;
  let nearest = { col, row };
  for (const cell of cells) {
    // Chebyshev distance: 0 on a footprint, 1 for the ring of parcels touching one.
    const d = Math.max(Math.abs(cell.col - col), Math.abs(cell.row - row));
    if (d < distanceCells) {
      distanceCells = d;
      nearest = { col: cell.col, row: cell.row };
    }
  }
  if (distanceCells <= CUSTOM_SPAWN_FOOTPRINT_MARGIN_CELLS) return null;
  return { col, row, distanceCells, nearest };
}

/** The spawn actually used on entry — the custom override if set, else the active preset. */
export function resolveActiveSpawnDcl(
  building: BuildingConfig,
  layout: SceneLayout,
  extraObstructions: SpawnObstruction[] = [],
): SpawnPointDcl {
  const custom = customSpawnDcl(building, layout);
  if (custom) {
    // Face into the venue on arrival, toward the building centre.
    const centre = buildingGlbOriginDcl(building, layout);
    const dx = centre.x - custom.x;
    const dz = centre.z - custom.z;
    const len = Math.hypot(dx, dz) || 1;
    return {
      // NOT the preset name. Reporting "entrance" here while emitting custom coordinates
      // is what let a 384 m spawn drift ship as a mirror bug eight times over.
      preset: "custom",
      ...custom,
      cameraTarget: {
        x: custom.x + (dx / len) * 4,
        y: custom.y + 1.5,
        z: custom.z + (dz / len) * 4,
      },
    };
  }
  return resolveSpawnDcl(
    building,
    layout,
    resolveSpawnPreset(building),
    extraObstructions,
  );
}

/** All preset spawn locations — active preset marked via scene.json `default`. */
export function allSpawnPointsDcl(
  building: BuildingConfig,
  layout: SceneLayout,
  extraObstructions: SpawnObstruction[] = [],
): SpawnPointDcl[] {
  const presets: SpawnPreset[] = ["entrance", "inside", "roof"];
  return presets.map((preset) =>
    resolveSpawnDcl(building, layout, preset, extraObstructions),
  );
}

/** The part of a spawn point `spawnPositionRanges` actually reads. */
export interface SpawnPointDclLike {
  x: number;
  y: number;
  z: number;
  cameraTarget: { x: number; y: number; z: number };
}

function spawnPositionRanges(point: SpawnPointDclLike): {
  x: [number, number];
  y: [number, number];
  z: [number, number];
} {
  return {
    x: [point.x - 0.5, point.x + 0.5],
    y: [point.y, point.y + 0.5],
    z: [point.z - 0.5, point.z + 0.5],
  };
}

/** scene.json spawnPoints entries for Decentraland deploy. */
export function sceneJsonSpawnPoints(
  building: BuildingConfig,
  layout: SceneLayout,
  extraObstructions: SpawnObstruction[] = [],
  /**
   * An arrival measured off geometry the visitor has to land on (see
   * `shared/visitor-arrival.ts`). It outranks the presets AND a stored custom
   * spawn, because those are remembered numbers and this one is measured.
   *
   * Nothing authored is deleted: every other point still ships, named, as an
   * alternative. Only which one is `default` changes.
   */
  appSpawn: SpawnPointDclLike | null = null,
  /** scene.json `name` for `appSpawn`. Defaults to "sky-island" for older callers. */
  appSpawnName = "sky-island",
): {
  name: string;
  default: boolean;
  position: { x: [number, number]; y: [number, number]; z: [number, number] };
  cameraTarget: { x: number; y: number; z: number };
}[] {
  const active = resolveSpawnPreset(building);
  const custom = customSpawnDcl(building, layout);
  const points = allSpawnPointsDcl(building, layout, extraObstructions).map(
    (point) => ({
      name: point.preset as string,
      // A custom override wins: the presets stay as named alternatives but none is default.
      default: appSpawn ? false : custom ? false : point.preset === active,
      position: spawnPositionRanges(point),
      cameraTarget: point.cameraTarget,
    }),
  );
  if (custom) {
    const activeSpawn = resolveActiveSpawnDcl(
      building,
      layout,
      extraObstructions,
    );
    points.push({
      name: "custom",
      default: !appSpawn,
      position: spawnPositionRanges(activeSpawn),
      cameraTarget: activeSpawn.cameraTarget,
    });
  }
  if (appSpawn) {
    points.push({
      name: appSpawnName,
      default: true,
      position: spawnPositionRanges(appSpawn),
      cameraTarget: appSpawn.cameraTarget,
    });
  }
  return points;
}

export function rampCenterDcl(
  building: BuildingConfig,
  layout: SceneLayout,
): { x: number; z: number } {
  const anchor = resolveCirculationAnchor(building, layout);
  const off = buildingPlacementOffset(building, layout);
  return composerToDcl(off.x + anchor.centerX, off.z + anchor.centerZ, layout);
}

export function floorTeleporterTargets(
  building: BuildingConfig,
  layout: SceneLayout,
): { floor: number; y: number; x: number; z: number }[] {
  const story = resolveStoryHeight(building);
  const { x, z } = rampCenterDcl(building, layout);
  const targets: { floor: number; y: number; x: number; z: number }[] = [];

  for (let floor = 0; floor < building.floors; floor++) {
    targets.push({ floor, y: floor * story + 0.2, x, z });
  }
  if (building.roofTerrace) {
    targets.push({
      floor: building.floors,
      y: building.floors * story + 0.2,
      x,
      z,
    });
  }
  return targets;
}
