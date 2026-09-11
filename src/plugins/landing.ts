/**
 * Landing cover runtime — arm on the first boot tick, before HUD chrome.
 *
 * Explorer has already dismissed its own spinner. This overlay is the first
 * thing our scene can paint. It holds walk + HUD + music until the staged
 * preload says READY (or maxWaitS offers a safe fallback), then waits for the
 * visitor to enter. Explorer permission chrome can sit above scene UI while
 * engine systems keep ticking, so elapsed time must never dismiss this cover.
 */
import {
  engine,
  GltfContainer,
  GltfContainerLoadingState,
  InputModifier,
  LoadingState,
  Transform,
  type Entity,
} from "@dcl/sdk/ecs";
import {
  LANDING_CROWD_READY_RATIO,
  LANDING_WORLD_READY_RATIO,
  LANDING_STAGE_CALL,
  allLandingStagesReady,
  isLandingTransit,
  isLandingWalkIn,
  landingCanOfferEntry,
  landingEase,
  landingFraction,
  landingThresholdProgress,
  landingCall,
  normalizeLandingAppConfig,
  type LandingAppConfig,
  type LandingStageProgress,
} from "@shared/landing-contract";
import { LANDING_APP } from "@shared/venue-app-contract";
import {
  activeBuildingGateRule,
  type SocialSurfaceConfig,
} from "@shared/social-surface-contract";
import { arrivalPending } from "../arrival";
import { setArrivalMusicFade, setArrivalMusicHold } from "../audio/arrival-hold";
import { skipGateArrival } from "./gate";
import {
  hasFlySnapshot,
  isWorldCrossing,
  noteFlySnapshotIfAway,
  spawnCaptureOptedOut,
  worldTransitSpawn,
} from "../world-session";
import { canOfferKeepFlyingOnCover, SCENE_OFFER_VERT_M, WORLD_SPAWN_NEAR_M } from "@shared/world-transit-contract";
import type { ScenePluginContext } from "./types";

/**
 * How long the cloud veil outlives the cover it came from. The veil is the only
 * part of arrival the visitor sees WHILE they can already walk, so it is scenery
 * on its own clock, not another second of being held still.
 */
const VEIL_TAIL_S = 1.1;

/**
 * Where the meter stops while anything is still late. It is not a lie about
 * progress — the line under the bar names the stage that is holding things up —
 * it is the promise that a FULL bar means ready and nothing else.
 */
const READY_CEILING = 0.96;

/**
 * How long the GLB roster has to stop growing before the world stage may call
 * itself finished. The scene keeps creating entities after core boot, so the
 * first frame where "everything we know about is loaded" is routinely followed
 * by a batch of props that were not known yet. Calling READY inside that gap is
 * exactly what puts a visitor on the button a second before the ground exists.
 */
const GLTF_SETTLE_S = 0.75;
/** Stop adding late GLBs to the arrival roster. Endless spawn must not hold the bar. */
const GLTF_GROW_MAX_S = 4;

/**
 * Login covers probe for 0.4 s before they arm (`showOnEveryEnter` is off).
 * Synchronous world boot finishes during that probe, and used to call
 * `markLandingWorldBootComplete` while `armed` was still false — the snapshot
 * was thrown away, `armLandingCover` reset `worldBootComplete`, and every
 * World sat on STILL LOADING THE WORLD until maxWaitS offered ENTER ANYWAY.
 * The scene was already there; the meter never heard about it.
 */
let coreBootDone = false;

let armed = false
/** This boot already chose cover-or-not. A second ensureLandingCover must not override a skip. */
let decided = false
/** Login-only mode: wait a beat for player pose before covering. */
let probing = false
let probeS = 0
let lastProbe: { x: number; y: number; z: number } | null = null
let plot: { spawnX: number; spawnZ: number; sizeX: number; sizeZ: number } | null = null
let pendingSocial: SocialSurfaceConfig | null = null;
let cfg: LandingAppConfig = normalizeLandingAppConfig({ enabled: true });
/**
 * Nameless until `ensureLandingCover` is told what this venue is called. This
 * was `"SWISSVERSE"` and the cover could paint that word over someone else's
 * venue during the boot window, exactly like the gate's old "Swiss" default.
 * A cover with no name yet draws no title line at all.
 */
let title = "";
let elapsedS = 0;
let displayed = 0;
/** How long the meter has had nowhere to climb to. Drives the breathing cue. */
let stalledS = 0;
/** 0..1 breath, non-zero ONLY while the bar itself has stopped moving. */
let pulse = 0;
let fading = false;
let fadeElapsedS = 0;
let opacity = 1;
let veilOpacity = 1;
let call = LANDING_STAGE_CALL.world;
let awaitingEnter = false;
let enterFallback = false;
let worldBootComplete = false;
let coreGltfEntities: Entity[] = [];
/** Last GLB count seen, and how long it has held still. -1 = not measured yet. */
let gltfCount = -1;
let gltfSettledS = 0;
let skyExpected = false;
let skyReady = true;
let crowdExpected = false;
let crowdSpawned = 0;
let crowdTotal = 0;
let musicExpected = false;
let musicReady = true;
/** Does this scene have an Access rule that has to answer before the reveal? */
let accessExpected = false;
/** Has that rule produced a verdict (pass OR fail)? Pending is not an answer. */
let accessResolved = true;
/**
 * Is this arrival a Punch Championship? The cover is generic — every venue that
 * enables it gets the same cloudscape — so the authored ENTER THE ARENA plate
 * is asked for by the product rather than baked in, and a gallery or a dance
 * venue keeps the plain button it has always had.
 */
let arenaEntry = false;
let systemOn = false;
let walkLocked = false;
/** Once walking is handed back it is never taken again this arrival. */
let walkReleased = false;

export function isLandingCoverBlocking(): boolean {
  return armed && opacity > 0.08;
}

export function isLandingCoverVisible(): boolean {
  return armed && (opacity > 0.02 || veilOpacity > 0.02);
}

export function landingHud(): {
  title: string;
  subtitle: string;
  call: string;
  fraction: number;
  opacity: number;
  canEnter: boolean;
  fallbackEntry: boolean;
  arenaEntry: boolean;
  pulse: number;
  veil: number;
  canKeepFlying: boolean;
} | null {
  if (!isLandingCoverVisible()) return null;
  const spawn = worldTransitSpawn();
  const pos = Transform.getOrNull(engine.PlayerEntity)?.position ?? null;
  if (pos && spawn) noteFlySnapshotIfAway(pos, spawn);
  return {
    title,
    subtitle: cfg.subtitle,
    call,
    fraction: displayed,
    opacity,
    canEnter: awaitingEnter && !fading,
    fallbackEntry: enterFallback,
    arenaEntry,
    pulse,
    veil: veilOpacity,
    canKeepFlying:
      !fading &&
      canOfferKeepFlyingOnCover({
        crossing: isWorldCrossing(),
        snapshot: hasFlySnapshot(),
        optedOut: spawnCaptureOptedOut(),
      }),
  };
}

function arrivalMusicExpected(social: SocialSurfaceConfig): boolean {
  const arrivalIsMusic = social.media.arrivalMedia === "music";
  const ambient = social.ambient;
  const ambientAutoplay =
    ambient?.enabled === true && ambient.autoplay === true && ambient.tracks.length > 0;
  const playlistAutoplay =
    arrivalIsMusic &&
    social.apps.audio?.enabled === true &&
    social.apps.audio.playlist.tracks.length > 0;
  const streamAutoplay =
    arrivalIsMusic &&
    social.apps.audioStream?.enabled === true &&
    social.apps.audioStream.url.trim().length > 0;
  const danceAutoplay =
    social.dance?.enabled === true && (social.dance.music?.tracks.length ?? 0) > 0;
  return ambientAutoplay || playlistAutoplay || streamAutoplay || danceAutoplay;
}

function snapshotCoreGltfs(): void {
  coreGltfEntities = [];
  for (const [entity] of engine.getEntitiesWith(GltfContainer)) coreGltfEntities.push(entity);
}

function applyWorldBootIfReady(): void {
  if (!armed || !coreBootDone || worldBootComplete) return;
  snapshotCoreGltfs();
  worldBootComplete = true;
  gltfCount = coreGltfEntities.length;
  gltfSettledS = 0;
  console.log(`[landing] core boot complete · ${coreGltfEntities.length} GLB(s) tracked`);
}

function worldProgress(): number {
  if (!worldBootComplete) return 0;
  if (coreGltfEntities.length === 0) return 1;
  let terminal = 0;
  for (const entity of coreGltfEntities) {
    const state = GltfContainerLoadingState.getOrNull(entity)?.currentState;
    // A GLB the renderer never tagged is already in the scene — treating
    // "no loading component" as forever-loading is how a finished World
    // still reads STILL LOADING THE WORLD.
    if (
      state === LoadingState.FINISHED ||
      state === LoadingState.FINISHED_WITH_ERROR ||
      (state == null && gltfSettledS >= GLTF_SETTLE_S)
    ) {
      terminal += 1;
    }
  }
  const measured = landingThresholdProgress(
    terminal,
    coreGltfEntities.length,
    LANDING_WORLD_READY_RATIO,
  );
  // A roster that is still GROWING has not finished, however complete the
  // entities we happen to know about this frame look. Without this, the first
  // quiet moment during boot reads as done, and the bar reaches full seconds
  // before the props that make the place a place have even been created.
  if (measured >= 1 && gltfSettledS < GLTF_SETTLE_S) return 0.999;
  return measured;
}

function landingProgress(): LandingStageProgress {
  return {
    world: worldProgress(),
    sky: skyExpected ? (skyReady ? 1 : 0) : 1,
    crowd: crowdExpected
      ? landingThresholdProgress(crowdSpawned, crowdTotal, LANDING_CROWD_READY_RATIO)
      : 1,
    music: musicExpected ? (musicReady ? 1 : 0) : 1,
    access: accessExpected ? (accessResolved ? 1 : 0) : 1,
  };
}

/** Core boot is complete; snapshot the GLBs that define this arrival. */
export function markLandingWorldBootComplete(): void {
  coreBootDone = true;
  applyWorldBootIfReady();
}

/** A custom sky has been constructed and made visible at the visitor's spawn. */
export function markLandingSkyReady(): void {
  if (!armed) return;
  skyReady = true;
}

/** An arrival audio source has a real clip/stream bound and is preloading muted. */
export function markLandingMusicReady(): void {
  if (!armed) return;
  musicReady = true;
}

/**
 * The Access gate has an answer — pass or fail, not "still reading".
 *
 * Called every gate tick, so it is a plain assignment rather than a latch: a
 * verdict that goes back to unknown (the wallet arrived late, a cached read
 * expired) puts the cover back to CHECKING instead of pretending it never did.
 */
export function reportLandingAccessResolved(resolved: boolean): void {
  if (!armed) return;
  accessResolved = resolved;
}

/** Actual NPC entities created, not a timer pretending the crowd exists. */
export function reportLandingCrowdProgress(spawned: number, total: number): void {
  if (!armed) return;
  crowdSpawned = Math.max(crowdSpawned, Math.max(0, Math.floor(spawned)));
  if (Number.isFinite(total) && total > 0) crowdTotal = Math.max(1, Math.floor(total));
}

function tryLockWalk(): void {
  if (walkLocked) return;
  try {
    InputModifier.createOrReplace(engine.PlayerEntity, {
      mode: {
        $case: "standard",
        standard: {
          disableWalk: true,
          disableJog: true,
          disableRun: true,
          disableJump: true,
          disableDoubleJump: true,
          disableGliding: true,
        },
      },
    });
    walkLocked = true;
  } catch {
    // PlayerEntity is not always ready on the first tick.
  }
}

function unlockWalk(): void {
  walkReleased = true;
  if (!walkLocked) return;
  try {
    if (InputModifier.has(engine.PlayerEntity)) InputModifier.deleteFrom(engine.PlayerEntity);
  } catch {
    // ignore
  }
  walkLocked = false;
}

/** Visitor acknowledgement survives any Explorer permission overlay above us. */
export function enterLandingWorld(): void {
  if (!armed || !awaitingEnter || fading) return;
  awaitingEnter = false;
  enterFallback = false;
  fading = true;
  fadeElapsedS = 0;
  setArrivalMusicHold(false);
  setArrivalMusicFade(0);
}

function landingSystem(dt: number): void {
  if (probing && !armed) {
    probeS += dt;
    if (visitorIsCrossing(dt)) {
      skipLandingCover();
      return;
    }
    if (probeS >= 0.4 && pendingSocial) {
      probing = false;
      armLandingCover(pendingSocial);
      pendingSocial = null;
    }
    return;
  }
  if (!armed) return;
  elapsedS += dt;

  if (!fading) {
    applyWorldBootIfReady();
    if (worldBootComplete && gltfSettledS < GLTF_SETTLE_S && elapsedS < GLTF_GROW_MAX_S) {
      snapshotCoreGltfs();
      if (coreGltfEntities.length !== gltfCount) {
        gltfCount = coreGltfEntities.length;
        gltfSettledS = 0;
      } else {
        gltfSettledS += dt;
      }
    }
    const progress = landingProgress();
    call = landingCall(progress);
    let target = landingFraction(progress, elapsedS, cfg.minHoldS);
    // An arrival that is still being restored is not ready, however finished
    // the meshes look: READY on this cover hands walking back, and handing it
    // back mid-fall is the "I land on the ground first" the owner reports. The
    // maxWaitS fallback below is untouched, so nobody is ever trapped here.
    const naturallyReady =
      allLandingStagesReady(progress) && elapsedS >= cfg.minHoldS && !arrivalPending();
    if (landingCanOfferEntry(progress, elapsedS, cfg)) awaitingEnter = true;
    if (awaitingEnter) {
      // Recomputed EVERY tick, never latched on the frame that first opened the
      // door. The scene goes on creating GLBs, so an arrival that looked
      // finished can genuinely stop being finished — and a button still saying
      // READY at that moment is what drops a visitor into a sky with no ground
      // under it yet.
      enterFallback = !naturallyReady;
      if (naturallyReady) {
        call = "READY";
        target = 1;
      }
    }
    // THE METER IS A RATCHET. Stage progress is honest and it can FALL: the GLB
    // count is a moving denominator, so one late batch of props used to send a
    // full bar back into the fifties. What the visitor sees only ever climbs,
    // and it stops just short of full until the arrival really is ready. The
    // line under the bar is what says which stage is late.
    const goal = Math.min(target, naturallyReady ? 1 : READY_CEILING);
    if (goal > displayed + 0.0005) {
      displayed += (goal - displayed) * Math.min(1, dt * 2.4);
      stalledS = 0;
    } else {
      stalledS += dt;
    }
    // A bar with no number on it must never read as a hung client. It breathes
    // only while it is actually stopped, so movement means "still working" and
    // total stillness never happens.
    pulse = stalledS > 0.5 ? 0.5 - 0.5 * Math.cos(((elapsedS % 1.7) / 1.7) * Math.PI * 2) : 0;
  }

  if (fading) {
    fadeElapsedS += dt;
    const coverT = cfg.fadeOutS <= 0 ? 1 : fadeElapsedS / cfg.fadeOutS;
    const musicT = cfg.musicFadeInS <= 0 ? 1 : fadeElapsedS / cfg.musicFadeInS;
    // The veil holds at full while the cover dissolves under it, then clears on
    // its own tail — so the last thing arrival shows is cloud parting over a
    // world that is already there, rather than a rectangle switching off.
    const veilT = VEIL_TAIL_S <= 0 ? 1 : Math.max(0, (fadeElapsedS - cfg.fadeOutS) / VEIL_TAIL_S);
    opacity = 1 - landingEase(coverT);
    veilOpacity = 1 - landingEase(veilT);
    setArrivalMusicFade(landingEase(musicT));
    call = "READY";
    pulse = 0;
    displayed = Math.min(1, displayed + dt * 0.8);
    // Walking comes back the moment the COVER is gone. Gating it on the veil
    // instead would turn a piece of scenery into another second of paralysis.
    if (coverT >= 1) unlockWalk();
    if (coverT >= 1 && musicT >= 1 && veilT >= 1) {
      opacity = 0;
      veilOpacity = 0;
      armed = false;
      unlockWalk();
      return;
    }
  }

  if (!walkReleased) tryLockWalk();
}

function visitorIsCrossing(dt: number): boolean {
  const pos = Transform.getOrNull(engine.PlayerEntity)?.position;
  if (!pos) return false;
  const spawn = worldTransitSpawn();
  if (spawn) noteFlySnapshotIfAway(pos, spawn);
  const prev = lastProbe;
  lastProbe = { x: pos.x, y: pos.y, z: pos.z };
  if (
    plot &&
    isLandingWalkIn({
      playerX: pos.x,
      playerZ: pos.z,
      spawnX: plot.spawnX,
      spawnZ: plot.spawnZ,
      sizeX: plot.sizeX,
      sizeZ: plot.sizeZ,
    })
  ) {
    return true;
  }
  if (!prev || dt <= 0) return false;
  const nearSpawnXZ = Boolean(
    spawn && Math.hypot(pos.x - spawn.x, pos.z - spawn.z) <= WORLD_SPAWN_NEAR_M,
  );
  return isLandingTransit({
    speedX: (pos.x - prev.x) / dt,
    speedZ: (pos.z - prev.z) / dt,
    speedY: (pos.y - prev.y) / dt,
    airborne: Boolean(spawn && (!nearSpawnXZ || pos.y > spawn.y + SCENE_OFFER_VERT_M)),
  });
}

function skipLandingCover(): void {
  probing = false;
  decided = true;
  pendingSocial = null;
  skipGateArrival();
  console.log(`[plugin] ${LANDING_APP.id} skipped — already travelling`);
}

/** KEEP FLYING — drop the cover immediately, do not fade, hand walking back. */
export function abortLandingCover(): void {
  probing = false;
  pendingSocial = null;
  decided = true;
  fading = false;
  fadeElapsedS = 0;
  opacity = 0;
  veilOpacity = 0;
  armed = false;
  awaitingEnter = false;
  enterFallback = false;
  unlockWalk();
  setArrivalMusicHold(false);
  setArrivalMusicFade(1);
  skipGateArrival();
}

function armLandingCover(social: SocialSurfaceConfig): void {
  decided = true;
  probing = false;
  pendingSocial = null;
  // Authored title, then the event name (which is already derived from the
  // building name). No brand backstop: an unnamed venue shows no title, it does
  // not borrow "SWISSVERSE".
  title = cfg.title.trim() || social.event?.name?.trim() || "";
  // Authored cover art, never "punch is on". Cloud Dance Floor keeps the island
  // plugin enabled and still wants the scene title on the door.
  arenaEntry = cfg.coverArt === "high_ground";
  skyExpected = social.apps.skybox?.enabled === true;
  skyReady = !skyExpected;
  crowdExpected =
    social.dance?.npc.enabled === true &&
    social.dance.npc.count > 0 &&
    (social.enabled || social.dance.enabled);
  crowdSpawned = 0;
  crowdTotal = crowdExpected ? social.dance!.npc.count : 0;
  musicExpected = arrivalMusicExpected(social);
  musicReady = !musicExpected;
  // The gate reports in from scene/src/access-gate. If it never boots (its step
  // threw) the cover still lifts at maxWaitS — and the curtain, which arms on
  // anything that is not a pass, is what actually holds the door.
  accessExpected = activeBuildingGateRule(social) !== null;
  accessResolved = !accessExpected;
  worldBootComplete = false;
  coreGltfEntities = [];
  gltfCount = -1;
  gltfSettledS = 0;
  elapsedS = 0;
  displayed = 0;
  stalledS = 0;
  pulse = 0;
  fading = false;
  fadeElapsedS = 0;
  opacity = 1;
  veilOpacity = 1;
  call = LANDING_STAGE_CALL.world;
  awaitingEnter = false;
  enterFallback = false;
  armed = true;
  walkLocked = false;
  walkReleased = false;
  setArrivalMusicHold(true);
  setArrivalMusicFade(0);
  tryLockWalk();
  console.log(`[plugin] ${LANDING_APP.id} cover armed`);
  applyWorldBootIfReady();
}

export type LandingCoverLayout = {
  spawnX: number;
  spawnZ: number;
  cols: number;
  rows: number;
};

export function ensureLandingCover(
  social: SocialSurfaceConfig,
  layout?: LandingCoverLayout,
): void {
  const next = normalizeLandingAppConfig(social.apps.landing);
  if (!next.enabled) {
    decided = true;
    return;
  }
  if (decided || armed || probing) return;
  cfg = next;
  if (layout) {
    plot = {
      spawnX: layout.spawnX,
      spawnZ: layout.spawnZ,
      sizeX: Math.max(1, layout.cols) * 16,
      sizeZ: Math.max(1, layout.rows) * 16,
    };
  }
  if (!systemOn) {
    engine.addSystem(landingSystem);
    systemOn = true;
  }
  if (!next.showOnEveryEnter && (isWorldCrossing() || visitorIsCrossing(1 / 30))) {
    skipLandingCover();
    return;
  }
  if (!next.showOnEveryEnter) {
    pendingSocial = social;
    probing = true;
    probeS = 0;
    return;
  }
  armLandingCover(social);
}

export function startLandingPlugin(ctx: ScenePluginContext): void {
  ensureLandingCover(ctx.social, {
    spawnX: ctx.config.spawn.x,
    spawnZ: ctx.config.spawn.z,
    cols: ctx.config.scene.cols,
    rows: ctx.config.scene.rows,
  });
}
