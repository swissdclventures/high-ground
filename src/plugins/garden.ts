/**
 * Garden runtime — grass that grew while you were away, mown by walking.
 *
 * Placement is already on the plot (`garden_bed` smart objects; the soil plate
 * is baked into the smart GLB). This plugin never moves a bed. It grows one
 * grass cell per grid square from the live document, and when mowing mode is on
 * the cells the player walks through are cut — locally at once, then batched to
 * the garden API with a signed request so they stay cut after everyone leaves.
 *
 * Nothing simulates. A cell is `lastCutAt`; the stage is elapsed time.
 */
import {
  ColliderLayer,
  engine,
  Entity,
  GltfContainer,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  TextShape,
  Transform,
  pointerEventsSystem,
} from "@dcl/sdk/ecs";
import { Color4, Quaternion, Vector3 } from "@dcl/sdk/math";
import { getPlayer } from "@dcl/sdk/players";
import {
  GARDEN_STAGES,
  GARDEN_WIND_DEFAULT,
  GARDEN_WIND_MAX,
  GARDEN_WIND_MIN,
  clampGardenBedSize,
  clampGardenCellsPerSide,
  gardenCellAt,
  gardenRoleCanMow,
  gardenRoleCanProtect,
  gardenRoleFor,
  gardenStage,
  gardenGrowthPercent,
  clampGardenStage,
  gardenSummaryLine,
  gardenPlantedAtForStage,
  normalizeGardenAppConfig,
  planGardenCells,
  worldToGardenLocal,
  type GardenBedState,
  type GardenPolicy,
  type GardenRole,
  type GardenStage,
} from "@shared/garden-contract";
import {
  GARDEN_WIND_HZ,
  GARDEN_WIND_MIN_TILT_RAD,
  gardenCellCharacter,
  gardenCellHash,
  gardenWindSample,
  gardenWindStrength01,
} from "@shared/garden-wind";
import { GARDEN_APP } from "@shared/venue-app-contract";
import {
  GROUND_COVER,
  GROUND_COVER_SPECIES,
  groundCoverModelSrc,
  planGroundCover,
  type GroundCoverDensity,
  type GroundCoverSpecies,
} from "@shared/ground-cover-contract";
import {
  SUCCESSION_MAX,
  successionGrassStage,
  successionHasStem,
  successionIsMowable,
  successionModel,
  successionProgress01,
  successionRungFor,
  successionStep,
  type SuccessionRung,
} from "@shared/succession-contract";
import { vegetationSeasonForDate } from "@shared/vegetation-contract";
import {
  UNDERSTOREY_COLLIDES,
  understoreyModel,
} from "@shared/understorey-contract";
import { markPluginActive } from "./active";
import type { ScenePluginContext } from "./types";

const DEFAULT_API = "https://builder.swissverse.org";

/**
 * One grass model per growth stage, built by scripts/blender/build-garden-grass.py.
 *
 * A cell used to be a coloured box scaled in Y, which is not what grass does: a
 * mown lawn is short BLADES, not a squashed tall one, and at a default 1.84 m cell
 * that box was a car-sized green slab. These are blade clusters — the bed's own
 * baked turf supplies the ground under them, which is why they carry none of their
 * own and why the wind may lean them without lifting a floor.
 *
 * Indexed by GardenStage, so the array order IS the stage order in GARDEN_STAGES.
 */
const GRASS_MODELS: readonly string[] = [
  "models/garden/grass-fresh.glb",
  "models/garden/grass-short.glb",
  "models/garden/grass-healthy.glb",
  "models/garden/grass-long.glb",
  "models/garden/grass-overgrown.glb",
  "models/garden/grass-wild.glb",
];

/**
 * The same six, straw-tinted, for patches somebody chose to keep wild.
 *
 * Protect mode used to show up as a tint over the cell's box. Colour now lives
 * inside the model where the runtime cannot reach it, so the variant IS the tint —
 * without these files, protecting a patch would do nothing anyone could see.
 */
const GRASS_MODELS_PROTECTED: readonly string[] = GRASS_MODELS.map((path) =>
  path.replace(/\.glb$/, "-protected.glb"),
);
/** The baked turf skin tops out here; grass stands on it. */
// Top of the bed's turf, and therefore the ground the blades stand on. Must match
// the turf plate in buildGardenBedEntity (app/src/scene-engine/build-smart-entities.ts):
// the plates were sunk on 2026-09-06 so a bed stops standing proud of the terrain, and
// a cell placed at the old 0.1 would now hover 9 cm over its own lawn.
const TURF_TOP_Y = 0.01;

/** How far a cell's patch overruns its own cell, so neighbours interlock. */
const GARDEN_CELL_OVERLAP = 1.08;

/**
 * Triangles one bed may spend on ground cover.
 *
 * A parcel is 10,000 and this repo fixes decoration's share at 25 %, which is 2,500.
 * The lawn deliberately spends more than that because in a Garden the lawn IS the
 * thing; ground cover is decoration and keeps to the share. On a nine-bed plot that
 * is 22,500 triangles of plants on top of the lawn's 38,016 — about two thirds of
 * the plot, with the rest for whatever the owner builds on it.
 */
const GROUND_COVER_BUDGET_TRIS = 2500;
const POLL_S = 30;
const WALK_SAMPLE_S = 0.15;
const GROW_TICK_S = 2;
const FLUSH_S = 1.5;

export type GardenMode = "off" | "mow" | "protect";

interface CellRuntime {
  entity: Entity;
  localX: number;
  localZ: number;
  cellW: number;
  cellD: number;
  cutAtMs: number | null;
  protectedCell: boolean;
  stage: GardenStage;
  /**
   * How far up the succession ladder this cell has come, 0-10.
   *
   * `stage` stays the GRASS length and never exceeds 5, so every existing path that
   * reads it keeps working. Above 5 the ground stops being grass and this is what
   * says so.
   */
  rung: SuccessionRung;
  /** True while the cell is leaning, so a lull writes the upright pose exactly once. */
  swaying: boolean;
  /** The tree or jungle plant this cell is drawing, or null while it is grass. */
  woodySrc: string | null;
  /** Which of the flowering-stage models this cell draws, 0-2. */
  flowerVariant: number;
  /**
   * True only for a TRUNK. Understorey leaves set woodySrc too but must still move in
   * the wind, so "is it grass" is no longer the same question as "does it sway".
   */
  rigidPlant: boolean;
  /** Fixed per cell: the yaw and height nudge that keep the lawn from tiling. */
  yawDeg: number;
  heightScale: number;
}

interface BedRuntime {
  id: string;
  root: Entity;
  worldX: number;
  worldZ: number;
  rotationDeg: number;
  width: number;
  depth: number;
  cellsPerSide: number;
  cells: CellRuntime[];
  plantedAtMs: number;
  /** Admin preview: a stage the console is holding the whole bed at, or null for live. */
  previewStage: SuccessionRung | null;
  /** Ground-cover entities, held so a re-plant can remove exactly what it replaces. */
  cover: Entity[];
  coverTriangles: number;
  coverCapped: boolean;
  mode: GardenMode;
  lastCellIndex: number;
  pendingMow: Set<number>;
  pendingProtect: Map<number, boolean>;
  contributors: string[];
}

function apiOrigin(configUrl: string): string {
  const trimmed = configUrl.trim().replace(/\/+$/, "");
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return DEFAULT_API;
}

function meWallet(): string {
  return (getPlayer()?.userId ?? "").trim().toLowerCase();
}

function signedPost(url: string, body: Record<string, unknown>): Promise<boolean> {
  return import("~system/SignedFetch")
    .then(({ signedFetch }) =>
      signedFetch({
        url,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      }),
    )
    .then((response) => response.ok !== false)
    .catch((error) => {
      console.log(`[garden] signed post failed — ${String(error)}`);
      return false;
    });
}

/**
 * Which lawn this is, as far as the garden service is concerned.
 *
 * This used to know Worlds and nothing else, so a scene published to Genesis City
 * — which has a base parcel but no World NAME — fell all the way through to
 * `local-preview`. Every Genesis City garden then shared one bucket with every
 * local preview: growth, protected patches and the helper policy all read back
 * from somebody else's lawn, which is the "settings are not following through"
 * the owner hit on 2026-09-05. Genesis City is its own space, so it gets its own
 * id from the coordinates that ARE its address.
 */
function sceneIdentity(ctx: ScenePluginContext): string {
  const venue = typeof ctx.social.venueId === "string" ? ctx.social.venueId.trim() : "";
  if (venue) return venue;
  const stamped = ctx.config.destinationId?.trim();
  if (stamped) return stamped;
  // Pre-`destinationId` bundles: rebuild the same id from what they do carry.
  const world = ctx.config.worldName?.trim();
  const base = ctx.config.sceneBase?.trim();
  if (world) return base ? `${world}:${base}` : world;
  if (base) return `genesis:${base}`;
  return "local-preview";
}

/**
 * What the Garden console can see and do.
 *
 * The plugin owns the beds; this is the only door into them, so the panel never
 * reaches into a BedRuntime and the plugin never imports the UI. `previewStage`
 * is deliberately LOCAL and never written to the API: it is a way to look at the
 * six stages without waiting six days for them, not a way to edit a lawn other
 * people are tending.
 */
export interface GardenConsoleBed {
  id: string;
  cells: number;
  /** The live stage mix, as a sentence. */
  summary: string;
  /** Growth of the least-recently-cut cell, 0 to 100. */
  growthPercent: number;
  /** Rung the console is holding this bed at, or null when it shows the truth. */
  previewStage: SuccessionRung | null;
  /** What the bed would be showing right now if nothing were held — so the panel
   *  can say when a stage button would change nothing at all. */
  liveStage: SuccessionRung;
  /** How far this bed is toward its next rung, 0-100. */
  nextRungPercent: number;
  mode: GardenMode;
  /** Plants standing on this bed, and what they cost. */
  coverPlants: number;
  coverTriangles: number;
  /** The triangle budget stopped the planting before the density did. */
  coverCapped: boolean;
}

let liveBeds: BedRuntime[] = [];
let liveStageHours = 24;
let liveDensity: GroundCoverDensity = "normal";
let liveWind = GARDEN_WIND_DEFAULT;
let liveSpecies: GroundCoverSpecies[] = [...GROUND_COVER_SPECIES];

export function gardenConsoleBeds(): GardenConsoleBed[] {
  const now = Date.now();
  return liveBeds.map((bed) => ({
    id: bed.id,
    cells: bed.cells.length,
    summary: gardenSummaryLine(bed.cells.map((cell) => cell.stage)),
    growthPercent: bed.cells.reduce(
      (worst, cell) =>
        Math.max(worst, gardenGrowthPercent(cell.cutAtMs, bed.plantedAtMs, now, liveStageHours)),
      0,
    ),
    previewStage: bed.previewStage,
    coverPlants: bed.cover.length,
    coverTriangles: bed.coverTriangles,
    coverCapped: bed.coverCapped,
    liveStage: bed.cells.reduce<SuccessionRung>(
      (worst, cell) =>
        Math.max(worst, successionRungFor(cell.cutAtMs, bed.plantedAtMs, now, liveStageHours)) as SuccessionRung,
      0 as SuccessionRung,
    ),
    nextRungPercent: Math.round(
      100 *
        bed.cells.reduce(
          (worst, cell) =>
            Math.max(worst, successionProgress01(cell.cutAtMs, bed.plantedAtMs, now, liveStageHours)),
          0,
        ),
    ),
    mode: bed.mode,
  }));
}

export function gardenConsoleIsRunning(): boolean {
  return liveBeds.length > 0;
}

/** Hold every cell of a bed at one stage, or pass null to show the real lawn again. */
export function gardenConsolePreview(bedId: string, rung: SuccessionRung | null): void {
  const bed = liveBeds.find((candidate) => candidate.id === bedId);
  if (!bed) return;
  bed.previewStage = rung;
  const now = Date.now();
  for (const cell of bed.cells) {
    cell.rung = rung ?? successionRungFor(cell.cutAtMs, bed.plantedAtMs, now, liveStageHours);
    // `stage` is only the GRASS still showing between the plants — it stops at wild,
    // and above the woody line it comes back DOWN as the canopy shades the meadow out.
    cell.stage = successionGrassStage(cell.rung) as GardenStage;
    paintCell(cell);
  }
  bumpGardenConsole();
}

/** Hold EVERY bed at one stage, or pass null to put them all back on the truth. */
export function gardenConsolePreviewAll(rung: SuccessionRung | null): void {
  for (const bed of liveBeds) gardenConsolePreview(bed.id, rung);
}

/** What the console is currently planting, across every bed. */
export function gardenConsoleCover(): { density: GroundCoverDensity; species: GroundCoverSpecies[] } {
  return { density: liveDensity, species: [...liveSpecies] };
}

/**
 * Re-plant every bed at a new density or species mix.
 *
 * LOCAL, like the stage preview: nothing is written and a reload comes back to the
 * scene's saved setting. It is a way to see what a mix looks like and what it costs
 * before committing to it in the Builder, not a way to edit someone's garden.
 */
export function gardenConsoleSetCover(
  density: GroundCoverDensity,
  species: readonly GroundCoverSpecies[],
): void {
  liveDensity = density;
  liveSpecies = [...species];
  for (const bed of liveBeds) plantGroundCover(bed, liveDensity, liveSpecies);
  bumpGardenConsole();
}

/** Wind strength the console is holding, 0-100. */
export function gardenConsoleWind(): number {
  return liveWind;
}

/**
 * Set the wind live, across every bed.
 *
 * Local like the rest of this panel — the scene's saved value returns on a reload.
 * The dial has a low ceiling by design: what rotates is a whole 1.84 m patch, and
 * past a few degrees that mat moves further than the grass is tall and reads as
 * heaving ground rather than bending grass. See shared/garden-wind.ts.
 */
export function gardenConsoleSetWind(percent: number): void {
  liveWind = Math.max(GARDEN_WIND_MIN, Math.min(GARDEN_WIND_MAX, Math.round(percent)));
  // Stand every blade back up; the next tick leans them again from the new strength.
  for (const bed of liveBeds) {
    for (const cell of bed.cells) {
      const tf = Transform.getMutableOrNull(cell.entity);
      if (tf) tf.rotation = Quaternion.fromEulerDegrees(0, cell.yawDeg, 0);
      cell.swaying = false;
    }
  }
  bumpGardenConsole();
}

export function gardenConsoleSetMode(bedId: string, mode: GardenMode): void {
  const bed = liveBeds.find((candidate) => candidate.id === bedId);
  if (!bed) return;
  bed.mode = mode;
  bed.lastCellIndex = -1;
  bumpGardenConsole();
}

export function startGardenPlugin(ctx: ScenePluginContext): void {
  const config = normalizeGardenAppConfig(ctx.social.apps.garden);
  if (!config.enabled) return;
  // The console gates on this and nothing else sets it. Shipped once without it:
  // the GARDEN door never appeared in Host, on any deploy, and I had told the owner
  // it would be there. Mark it before the bed scan so a scene with the app on and
  // no bed still gets the panel, which is where the "place a bed" hint lives.
  markPluginActive(GARDEN_APP.id);

  const origin = apiOrigin(config.apiBaseUrl);
  const sceneId = sceneIdentity(ctx);
  const policy: GardenPolicy = {
    admins: (ctx.social.event?.adminWallets ?? []).map((wallet: string) => wallet.trim().toLowerCase()),
    helpers: config.helpers,
    helperWallets: config.helperWallets,
  };

  const beds: BedRuntime[] = [];
  for (const handle of ctx.handles) {
    if (handle.spec.type !== "garden_bed" && handle.spec.behavior !== "garden_bed") continue;
    beds.push(
      buildBed(
        handle.entity,
        handle.spec.id,
        handle.worldX,
        handle.worldZ,
        handle.spec.spec,
        config.stageHours,
        config.startStage,
      ),
    );
  }
  liveBeds = beds;
  liveStageHours = config.stageHours;
  liveWind = config.wind;
  liveDensity = config.groundCoverDensity;
  liveSpecies = [...config.groundCoverSpecies];
  for (const bed of beds) plantGroundCover(bed, liveDensity, liveSpecies);
  if (!beds.length) {
    console.log(`[plugin] ${GARDEN_APP.id} no garden_bed placed`);
    return;
  }

  for (const bed of beds) {
    void loadState(origin, sceneId, bed, config.stageHours);
    bumpGardenConsole();
  }

  let pollLeft = POLL_S;
  let walkLeft = 0;
  let growLeft = GROW_TICK_S;
  let flushLeft = FLUSH_S;
  // The wind runs on scene-lifetime seconds, never a wall clock: two visitors
  // watching the same lawn have to see the same gust cross it.
  // Read every tick rather than captured once: the console dials this live.
  let windStrength = gardenWindStrength01(liveWind);
  let windLeft = 0;
  let windTimeS = 0;
  engine.addSystem((dt) => {
    pollLeft -= dt;
    walkLeft -= dt;
    growLeft -= dt;
    flushLeft -= dt;
    const role = roleNow(policy);

    windStrength = gardenWindStrength01(liveWind);
    if (windStrength > 0) {
      windTimeS += dt;
      windLeft -= dt;
      if (windLeft <= 0) {
        windLeft = 1 / GARDEN_WIND_HZ;
        for (const bed of beds) swayBed(bed, windTimeS, windStrength);
      }
    }

    if (walkLeft <= 0) {
      walkLeft = WALK_SAMPLE_S;
      const player = Transform.getOrNull(engine.PlayerEntity);
      if (player) {
        for (const bed of beds) {
          if (bed.mode === "off") continue;
          // Walking a bed that is being previewed would cut a stage the admin only
          // asked to LOOK at, and the cut would be real and saved.
          if (bed.previewStage !== null) continue;
          walkBed(bed, player.position.x, player.position.z, role);
        }
      }
    }

    if (growLeft <= 0) {
      growLeft = GROW_TICK_S;
      const now = Date.now();
      for (const bed of beds) {
        // A bed held in the console's preview keeps the stage the admin chose. The
        // clock still runs underneath — cutAtMs and plantedAtMs are untouched — so
        // leaving preview shows the lawn as it really is, not as it was when the
        // preview started.
        if (bed.previewStage !== null) continue;
        let changed = false;
        for (const cell of bed.cells) {
          const rung = successionRungFor(cell.cutAtMs, bed.plantedAtMs, now, config.stageHours);
          // `stage` is only the GRASS still showing between the plants; `rung` carries on
          // past it, and past the woody line the grass gets shorter and greener, not taller.
          const stage = successionGrassStage(rung) as GardenStage;
          if (rung !== cell.rung || stage !== cell.stage) {
            cell.rung = rung;
            cell.stage = stage;
            paintCell(cell);
            changed = true;
          }
        }
        if (changed) bumpGardenConsole();
      }
    }

    if (flushLeft <= 0) {
      flushLeft = FLUSH_S;
      for (const bed of beds) void flushBed(origin, sceneId, bed, policy);
    }

    if (pollLeft <= 0) {
      pollLeft = POLL_S;
      for (const bed of beds) void loadState(origin, sceneId, bed, config.stageHours);
    }
  });

  console.log(`[plugin] ${GARDEN_APP.id} ${beds.length} bed(s), ${beds.reduce((n, b) => n + b.cells.length, 0)} cells`);
}

function roleNow(policy: GardenPolicy): GardenRole {
  return gardenRoleFor(meWallet(), policy);
}

function buildBed(
  root: Entity,
  id: string,
  worldX: number,
  worldZ: number,
  spec: Record<string, unknown>,
  stageHours: number,
  appStartStage: GardenStage,
): BedRuntime {
  const width = clampGardenBedSize(spec.width);
  const depth = clampGardenBedSize(spec.depth);
  const cellsPerSide = clampGardenCellsPerSide(spec.cellsPerSide);
  const rotationRad = typeof spec.rotationY === "number" && Number.isFinite(spec.rotationY) ? spec.rotationY : 0;
  const rotationDeg = (rotationRad * 180) / Math.PI;
  // How grown this bed opens. The bed's own setting wins; without one it follows
  // the app default. Only ever seen on a patch the service has never saved — a
  // tended lawn keeps its real cut times, so changing this resets nobody's work.
  const nowMs = Date.now();
  const startStage =
    spec.startStage === undefined ? appStartStage : clampGardenStage(spec.startStage);
  const plantedAtMs = gardenPlantedAtForStage(nowMs, stageHours, startStage);

  const cells: CellRuntime[] = [];
  for (const pose of planGardenCells(width, depth, cellsPerSide)) {
    const entity = engine.addEntity();
    const character = gardenCellCharacter(pose.localX, pose.localZ);
    const startStage = gardenStage(null, plantedAtMs, nowMs, stageHours);
    Transform.create(entity, {
      parent: root,
      position: Vector3.create(pose.localX, TURF_TOP_Y, pose.localZ),
      // X/Z stretch the 1 m patch to the cell. Y carries ONLY this cell's height
      // nudge — the blade length itself is baked per stage, not scaled into being.
      // CELLS OVERLAP. At 0.92 every patch sat inside its cell with a bare 31 cm
      // gutter around it, and 576 of those gutters are a grid: measured straight
      // down, the lawn's brightness correlated +0.86 at exactly one cell and
      // -0.88 at half a cell — a clean square wave, 33 grey levels deep. That is
      // the "pattern" the owner photographed. Grass has no gutters; neighbouring
      // patches have to grow into each other.
      scale: Vector3.create(pose.cellW * GARDEN_CELL_OVERLAP, character.heightScale, pose.cellD * GARDEN_CELL_OVERLAP),
      rotation: Quaternion.fromEulerDegrees(0, character.yawDeg, 0),
    });
    GltfContainer.createOrReplace(entity, { src: grassModel(startStage) });
    const cell: CellRuntime = {
      entity,
      localX: pose.localX,
      localZ: pose.localZ,
      cellW: pose.cellW,
      cellD: pose.cellD,
      cutAtMs: null,
      protectedCell: false,
      stage: gardenStage(null, plantedAtMs, nowMs, stageHours),
      rung: successionRungFor(null, plantedAtMs, nowMs, stageHours),
      swaying: false,
      yawDeg: character.yawDeg,
      heightScale: character.heightScale,
      woodySrc: null,
      rigidPlant: false,
      // Decided once from the cell's own position, like the stems and the ground
      // cover: the same bed comes up the same for everyone, with nothing stored.
      flowerVariant: Math.floor(gardenCellHash(pose.localX, pose.localZ).b * GRASS_FLOWER_VARIANTS),
    };
    paintCell(cell);
    cells.push(cell);
  }

  // NO POST. Every bed used to grow a wooden stake with a floating GARDEN sign at
  // its south edge, and a plot of four beds grew four of them — "I don't want them
  // there" (owner, 2026-09-06). A lawn should look like a lawn. Everything the post
  // carried moved into the Garden console, which is a panel and costs the world
  // nothing.
  return {
    id,
    root,
    worldX,
    worldZ,
    rotationDeg,
    width,
    depth,
    cellsPerSide,
    cells,
    plantedAtMs,
    // WALKING DOES NOT MOW. Removing the sign posts, I defaulted this to "mow" so
    // that mowing stayed reachable at all — and the owner then walked out to judge
    // the vegetation and cut a trail straight through it, saved, on every bed they
    // crossed. A lawn must not be destroyed by the act of looking at it. Mowing is
    // deliberate now: an admin turns it on per bed in the Garden console.
    //
    // ⚠️ This leaves non-admin helpers with no way to start mowing, because the post
    // is gone and the console is admin-only. That is a real gap and it is parked on
    // purpose — the owner's instruction was to get the vegetation right before the
    // mowing interaction.
    mode: "off",
    previewStage: null,
    cover: [],
    coverTriangles: 0,
    coverCapped: false,
    lastCellIndex: -1,
    pendingMow: new Set(),
    pendingProtect: new Map(),
    contributors: [],
  };
}

function cellHeight(cell: CellRuntime): number {
  const stage = GARDEN_STAGES[cell.stage] ?? GARDEN_STAGES[0];
  return stage.heightM * cell.heightScale;
}

/** Model path for a stage, clamped — an out-of-range stage must still draw grass. */
/** Flowering stages are built three times over, each with different heads. */
const GRASS_FLOWER_VARIANTS = 3;

/** First stage that carries flowers. Below it there is one model and no variants. */
const GRASS_FIRST_FLOWERING_STAGE = 3;

/**
 * The model a cell draws.
 *
 * ‼️ WHY `variant` EXISTS. There is one GLB per stage and a bed instances it 64 times,
 * so the two flowers baked into it repeated on every cell and only two of the sheet's
 * six species could appear in a whole garden. That is what "the flowers all have the
 * same kind of design" was: not the art, the instancing.
 *
 * A variant costs no triangles and no entities — the same cell draws a different file.
 * Only the flowering stages have them built, so anything below just gets the base name.
 */
function grassModel(stage: GardenStage, protectedCell = false, variant = 0): string {
  const table = protectedCell ? GRASS_MODELS_PROTECTED : GRASS_MODELS;
  const base = table[stage] ?? table[0]!;
  if (stage < GRASS_FIRST_FLOWERING_STAGE) return base;
  const v = ((Math.floor(variant) % GRASS_FLOWER_VARIANTS) + GRASS_FLOWER_VARIANTS) % GRASS_FLOWER_VARIANTS;
  if (v === 0) return base;
  return base.replace(/\.glb$/, `-v${v + 1}.glb`);
}

/**
 * Plant one bed's ground cover, replacing whatever it had.
 *
 * The plan is computed, never stored: the same bed and seed give the same garden on
 * every client and after every reload, which is what lets a plot carry hundreds of
 * plants without a row in a table for any of them. The seed is the bed's own world
 * position, so nine beds on a plot are nine different gardens rather than one garden
 * nine times.
 *
 * ★ COLLISION IS DECIDED HERE, not in the file. Every model ships a 12-triangle
 * `*_collider`, and the mask below is what makes a fern stop you and a daisy not.
 * The same GLB serves both answers, so nothing is ever re-exported for it.
 */
function plantGroundCover(
  bed: BedRuntime,
  density: GroundCoverDensity,
  species: readonly GroundCoverSpecies[],
): void {
  for (const entity of bed.cover) engine.removeEntity(entity);
  bed.cover = [];

  const seed = Math.round(bed.worldX * 7 + bed.worldZ * 13) | 0;
  const plan = planGroundCover(bed.width, bed.depth, density, species, seed, GROUND_COVER_BUDGET_TRIS);
  bed.coverTriangles = plan.triangles;
  bed.coverCapped = plan.cappedByBudget;

  for (const plant of plan.plants) {
    const entity = engine.addEntity();
    Transform.create(entity, {
      parent: bed.root,
      position: Vector3.create(plant.localX, TURF_TOP_Y, plant.localZ),
      rotation: Quaternion.fromEulerDegrees(0, plant.yawDeg, 0),
      scale: Vector3.create(plant.scale, plant.scale, plant.scale),
    });
    GltfContainer.create(entity, {
      src: groundCoverModelSrc(plant.species, plant.variant),
      // You walk THROUGH a lawn and its flowers, and AROUND a fern.
      invisibleMeshesCollisionMask: GROUND_COVER[plant.species].collides
        ? ColliderLayer.CL_PHYSICS
        : ColliderLayer.CL_NONE,
      visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    });
    bed.cover.push(entity);
  }
}

function paintCell(cell: CellRuntime): void {
  // ABOVE THE WOODY LINE THE CELL STOPS BEING GRASS.
  //
  // Not every cell grows a trunk — a wood is a handful of stems with rank grass
  // between them, not a lawn of trees — so a woody rung asks the ladder whether THIS
  // cell is one of the ones that carries a stem. The ones that do not keep drawing
  // grass at its ceiling, which is exactly what the floor of a wood looks like.
  const stem =
    successionHasStem(cell.rung, cell.localX, cell.localZ)
      ? successionModel(cell.rung, cell.localX, cell.localZ, vegetationSeasonForDate(new Date()))
      : null;
  // ★ AND THE GROUND BETWEEN THE TRUNKS. Without this a wood is trees standing on a
  // lawn, which is what it was. Understorey only ever lands on a cell that did NOT
  // get a stem, so it costs no entity and no tree loses its place to a leaf.
  const woody = stem ?? understoreyModel(cell.rung, cell.localX, cell.localZ);
  cell.woodySrc = woody ? woody.src : null;
  cell.rigidPlant = stem !== null;

  const tf = Transform.getMutableOrNull(cell.entity);
  if (tf && woody) {
    // A tree — and a two-metre leaf — is scaled UNIFORMLY from its own foot. Stretching
    // either to the cell the way a grass patch is stretched would squash a trunk into
    // an oval and a leaf into a fan.
    const size = woody.scale * cell.heightScale;
    tf.scale = Vector3.create(size, size, size);
    tf.position = Vector3.create(cell.localX, TURF_TOP_Y, cell.localZ);
    tf.rotation = Quaternion.fromEulerDegrees(0, cell.yawDeg, 0);
    cell.swaying = false;
  } else if (tf) {
    // The patch stands ON the turf. Height lives in the model, so the only Y
    // scale is this cell's own nudge; stretching it would squash the blades.
    tf.scale = Vector3.create(cell.cellW * GARDEN_CELL_OVERLAP, cell.heightScale, cell.cellD * GARDEN_CELL_OVERLAP);
    tf.position = Vector3.create(cell.localX, TURF_TOP_Y, cell.localZ);
    // A repaint stands the blades back up on their own yaw; the wind leans them
    // again on its next tick.
    tf.rotation = Quaternion.fromEulerDegrees(0, cell.yawDeg, 0);
    cell.swaying = false;
  }
  // Stage colour is baked into each model, so the swap IS the repaint. Only touch
  // the component when the stage really moved: re-setting `src` to the value it
  // already holds makes the Explorer re-instantiate the GLB, and a mow that
  // re-cuts an already-cut cell would flicker the whole patch.
  const src = cell.woodySrc ?? grassModel(cell.stage, cell.protectedCell, cell.flowerVariant);
  // TRUNKS STOP YOU, LEAVES DO NOT. A GLB's collider meshes are physical by default,
  // and at the understorey's densities that would make a mature bed a wall the player
  // walks into and cannot get out of. The mask is set explicitly on every cell rather
  // than only on the jungle ones, so grass cannot quietly acquire a collider either.
  //   a trunk  -> solid, always
  //   a leaf    -> whatever UNDERSTOREY_COLLIDES says, which is "walk through it"
  //   grass     -> never
  const physical = cell.rigidPlant || (cell.woodySrc !== null && UNDERSTOREY_COLLIDES);
  const current = GltfContainer.getOrNull(cell.entity);
  if (current?.src !== src) {
    GltfContainer.createOrReplace(cell.entity, {
      src,
      invisibleMeshesCollisionMask: physical ? ColliderLayer.CL_PHYSICS : ColliderLayer.CL_NONE,
      visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    });
  }
}

/**
 * Lean every blade of one bed into the wind.
 *
 * One rotation about the axis across the wind, so the blade's own +Y ends up
 * pointing exactly along the gust — that is what lets gardenWindCellPose keep the
 * base planted with a single offset instead of an euler-order guess.
 *
 * Freshly cut grass is 4 cm tall and would move under a millimetre: those cells
 * are put back upright once and then skipped, which is most of the bed most of
 * the time and is where the frame budget is won.
 */
function swayBed(bed: BedRuntime, timeS: number, strength01: number): void {
  for (const cell of bed.cells) {
    // Trees sit the wind out. Rotating an 11 m trunk by the same 5° that bends a
    // blade would sweep its crown through a metre, which is the ground-heaving
    // mistake all over again one storey up.
    //
    // Understorey leaves are NOT exempt: a three-metre frond that never moves while
    // the grass beside it does is the deadest thing in the scene, and 5° on a leaf is
    // a hand's width, not a crown sweeping through a metre.
    if (cell.rigidPlant) continue;
    const heightM = cellHeight(cell);
    const sample = gardenWindSample(timeS, cell.localX, cell.localZ, strength01, heightM);
    const tf = Transform.getMutableOrNull(cell.entity);
    if (!tf) continue;
    const upright = Quaternion.fromEulerDegrees(0, cell.yawDeg, 0);
    if (sample.tiltRad < GARDEN_WIND_MIN_TILT_RAD) {
      if (!cell.swaying) continue;
      tf.rotation = upright;
      cell.swaying = false;
      continue;
    }
    // POSITION NEVER MOVES. gardenWindCellPose exists to fake a base pivot for a
    // box, whose origin sits at its centre — lift it by half its height, shove it
    // sideways by the other half, and the bottom edge appears to stay planted. A
    // grass patch is already modelled from its base up, so rotating it in place is
    // the whole effect; applying that offset as well would tear the blades out of
    // the ground on every gust.
    // Lean AFTER the yaw: the blade keeps its own facing and still falls with the gust.
    tf.rotation = Quaternion.multiply(
      Quaternion.fromAngleAxis(
        (sample.tiltRad * 180) / Math.PI,
        Vector3.create(-sample.dirZ, 0, sample.dirX),
      ),
      upright,
    );
    cell.swaying = true;
  }
}

function cycleMode(bed: BedRuntime, role: GardenRole): void {
  if (role === "visitor") {
    bed.mode = "off";
  } else if (bed.mode === "off") {
    bed.mode = "mow";
  } else if (bed.mode === "mow" && gardenRoleCanProtect(role)) {
    bed.mode = "protect";
  } else {
    bed.mode = "off";
  }
  bed.lastCellIndex = -1;
  bumpGardenConsole();
}

function walkBed(bed: BedRuntime, worldX: number, worldZ: number, role: GardenRole): void {
  const local = worldToGardenLocal(worldX, worldZ, bed.worldX, bed.worldZ, bed.rotationDeg);
  const index = gardenCellAt(local.x, local.z, bed.width, bed.depth, bed.cellsPerSide);
  if (index === bed.lastCellIndex) return;
  bed.lastCellIndex = index;
  if (index < 0) return;
  const cell = bed.cells[index];
  if (!cell) return;

  if (bed.mode === "mow") {
    // ★ THE WOODY LINE. Below it a walk clears the ground; at it and above the ground
    // has gone woody and a walk does nothing at all. This is the whole game: neglect
    // stops being a chore you can undo with your feet and becomes a decision you have
    // already made. Taking a wood back down needs a deliberate act with its own tool,
    // and that tool does not exist yet.
    if (!successionIsMowable(cell.rung)) return;
    if (!gardenRoleCanMow(role, cell.protectedCell)) return;
    if (cell.stage === 0 && cell.cutAtMs !== null) return;
    cell.cutAtMs = Date.now();
    cell.stage = 0;
    paintCell(cell);
    bed.pendingMow.add(index);
    return;
  }
  if (bed.mode === "protect" && gardenRoleCanProtect(role)) {
    cell.protectedCell = !cell.protectedCell;
    paintCell(cell);
    bed.pendingProtect.set(index, cell.protectedCell);
  }
}

/**
 * Tell the Garden console something changed.
 *
 * This was refreshSign, and it wrote the post's TextShape and rewired its pointer
 * handler on every stage tick. With the post gone the same information — what the
 * bed is doing, who has been gardening — belongs on a panel, so all this has to do
 * is ask that panel to redraw.
 */
let consoleRefresh: (() => void) | null = null;

export function setGardenConsoleRefresh(fn: (() => void) | null): void {
  consoleRefresh = fn;
}

function bumpGardenConsole(): void {
  consoleRefresh?.();
}

async function loadState(origin: string, sceneId: string, bed: BedRuntime, stageHours: number): Promise<void> {
  try {
    const url = `${origin}/api/garden/state?scene=${encodeURIComponent(sceneId)}&bed=${encodeURIComponent(bed.id)}&cells=${bed.cells.length}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const body = (await response.json()) as Partial<GardenBedState>;
    const planted = Date.parse(body.plantedAt ?? "");
    // The EARLIER of the two dates, never a straight overwrite. The local date is
    // back-dated to honour `startStage` ("a new bed opens overgrown"); the server's
    // is stamped `now` the first time a bed is ever loaded (garden-server.ts,
    // ensureBedRow). Overwriting with the server's meant the start stage held for
    // one page-load and then the lawn was fresh for two days — "I set it to maximum
    // overgrown and in world it's at the lowest stage". min() keeps whichever says
    // the bed is older: the start stage is a floor on how grown a bed opens, and a
    // bed the server has known for a week is at least a week grown.
    if (Number.isFinite(planted)) bed.plantedAtMs = Math.min(bed.plantedAtMs, planted);
    const now = Date.now();
    for (const row of body.cells ?? []) {
      const cell = bed.cells[row.i];
      if (!cell) continue;
      // A cut queued locally but not yet flushed wins over the server's older view.
      if (bed.pendingMow.has(row.i)) continue;
      const cut = row.cutAt ? Date.parse(row.cutAt) : null;
      cell.cutAtMs = cut !== null && Number.isFinite(cut) ? cut : null;
      if (!bed.pendingProtect.has(row.i)) cell.protectedCell = row.protected === true;
      const stage = gardenStage(cell.cutAtMs, bed.plantedAtMs, now, stageHours);
      if (stage !== cell.stage || row.protected !== undefined) {
        cell.stage = stage;
        paintCell(cell);
      }
    }
    bed.contributors = (body.contributors ?? [])
      .map((row) => shortWallet(row.wallet))
      .filter(Boolean);
  } catch (error) {
    console.log(`[garden] state fetch failed — ${String(error)}`);
  }
}

async function flushBed(origin: string, sceneId: string, bed: BedRuntime, policy: GardenPolicy): Promise<void> {
  if (!meWallet()) return;
  if (bed.pendingMow.size) {
    const cells = [...bed.pendingMow];
    bed.pendingMow.clear();
    const ok = await signedPost(`${origin}/api/garden/mow`, { sceneId, bedId: bed.id, cells, policy });
    if (!ok) for (const index of cells) bed.pendingMow.add(index);
  }
  if (bed.pendingProtect.size) {
    const entries = [...bed.pendingProtect.entries()];
    bed.pendingProtect.clear();
    const keep = entries.filter(([, on]) => on).map(([i]) => i);
    const release = entries.filter(([, on]) => !on).map(([i]) => i);
    const results = await Promise.all([
      keep.length ? signedPost(`${origin}/api/garden/protect`, { sceneId, bedId: bed.id, cells: keep, protected: true, policy }) : true,
      release.length ? signedPost(`${origin}/api/garden/protect`, { sceneId, bedId: bed.id, cells: release, protected: false, policy }) : true,
    ]);
    if (!results[0]) for (const i of keep) bed.pendingProtect.set(i, true);
    if (!results[1]) for (const i of release) bed.pendingProtect.set(i, false);
  }
}

function shortWallet(wallet: string): string {
  const key = (wallet ?? "").trim();
  if (key.length < 10) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
