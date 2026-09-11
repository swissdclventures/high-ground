import { setNpcSelectEnabled } from "../dance/troupe";
/**
 * Scrap as a kernel plugin. Borrows interruptible host NPCs; does not clone them.
 * Bully intensity opens a first-person glove fight (scene/src/plugins/scrap-fight.ts).
 */
import { AvatarEmoteCommand, PlayerIdentityData, Transform, engine } from "@dcl/sdk/ecs";
import { getPlayer } from "@dcl/sdk/players";
import { MessageBus } from "@dcl/sdk/message-bus";
import { movePlayerTo, triggerSceneEmote } from "~system/RestrictedActions";
import { SCRAP_APP } from "@shared/venue-app-contract";
import { normalizeScrapConfig, type ScrapConfig } from "@shared/scrap-contract";
import {
  emptyScrapWorldState,
  planScrapTick,
  scrapGuestsOnFloor,
  scrapLeasedNpcIndexes,
  scrapSilencesCrowdClap,
  type ScrapActor,
  type ScrapGuest,
  type ScrapIntent,
  type ScrapOutcome,
  type ScrapSession,
  type ScrapWorldState,
} from "@shared/scrap-session";
import { SCRAP_STILL_SPEED } from "@shared/scrap-fight";
import {
  emptyScrapAnger,
  scrapAngerPress,
  scrapAngerTick,
  scrapPlayerProvokeRole,
  scrapProvocationStage,
  type ScrapAngerState,
  type ScrapProvocationStage,
} from "@shared/scrap-anger";
import { scrapEmoteBinding } from "@shared/scrap-emotes";
import { GRID } from "@shared/types";
import { aabbsFromBuildingOutlines } from "@shared/jump-pad-wander";
import { setScrapKoGround } from "@shared/scrap-ko-ground";
import type { ScenePluginContext } from "./types";
import {
  consumeScrapAcceptFight,
  consumeScrapFightProceed,
  consumeScrapFightResult,
  ensureScrapFightSystem,
  scrapFightOwnsInput,
  setScrapAngerValue,
} from "./scrap-fight";
import { clearScrapNpcPick } from "./scrap-pick";
import { isScrapHumanFightActive } from "../human-edition/fight";
import { isRidingGlider } from "../neon-glider-dock";
import { notifyScrapBout, scrapGuestLeaving, scrapGuestUnavailable } from "./scrap-guard";
import { claimAudioChannel } from "../audio/channel";

/**
 * Nobody gets hassled in their first minute. A guest who lands next to the
 * crowd used to be approached, shoved and challenged before the scene had
 * finished loading around them ("I log in and the whole thing is attacking
 * me"). The director sleeps through the arrival; the crowd's bump + wave is
 * host behaviour and still runs.
 */
export const SCRAP_BOOT_GRACE_MS = 45_000;
let bootAtMs = 0;

let scrapConfig: ScrapConfig = normalizeScrapConfig(undefined);
let scrapState: ScrapWorldState = emptyScrapWorldState();
let scrapIntents = new Map<number, ScrapIntent>();
let pendingPlayerChallenge: { npcIndex: number; playerId: string; explicit: boolean; untilMs: number } | null =
  null;

const scrapBus = new MessageBus();
let scrapBusWired = false;

function wireScrapBus(): void {
  if (scrapBusWired) return;
  scrapBusWired = true;
  scrapBus.on("scrap.challenge", (msg: { npcIndex?: number; playerId?: string }) => {
    if (typeof msg?.npcIndex !== "number" || typeof msg.playerId !== "string" || !msg.playerId) return;
    pendingPlayerChallenge = {
      npcIndex: msg.npcIndex,
      playerId: msg.playerId,
      explicit: true,
      untilMs: Date.now() + 8000,
    };
  });
}

export function startScrapPlugin(ctx: ScenePluginContext): void {
  // Selecting a regular means something here: it starts a fight.
  setNpcSelectEnabled(true);
  scrapConfig = normalizeScrapConfig(ctx.social.apps.scrap);
  executedShoveSeq = 0;
  shoveSessionId = null;
  const cols = ctx.config.scene?.cols ?? 3;
  const rows = ctx.config.scene?.rows ?? 3;
  sceneSpanM = Math.max(16, Math.min(cols, rows) * 16);
  setScrapKoGround({
    solids: aabbsFromBuildingOutlines(ctx.config.buildingOutlines, GRID.parcelSize),
    sceneMin: 0.5,
    sceneMax: Math.max(0.5, sceneSpanM - 0.5),
  });
  scrapState = emptyScrapWorldState();
  scrapIntents = new Map();
  pendingPlayerChallenge = null;
  clearScrapNpcPick();
  bootAtMs = Date.now();
  wireScrapBus();
  ensureScrapFightSystem();
  claimAudioChannel({
    id: "scrap-bout",
    label: "scrap fight",
    zone: null,
    active: () => scrapCrowdQuiet(),
  });
  console.log(
    `[plugin] ${SCRAP_APP.id} director ready — every ${scrapConfig.npcApproachEverySeconds}s, intensity ${scrapConfig.intensity}`
  );
}

export function isScrapActive(): boolean {
  return scrapConfig.enabled === true;
}

/**
 * Player signals, all measured from the world — never from raw keys, which this
 * Explorer does not reliably deliver outside a hovered collider.
 */
let lastGuestPos: { x: number; z: number } | null = null;
let lastGuestAtMs = 0;
let guestSpeed = 0;
let guestStillMs = 0;
let guestGapWas = 0;
let guestLeaving = false;
let lastEmoteStamp = 0;
let emotedAtMs = 0;
/** Our own E call-out must not count as a defuse emote. */
let provokeIgnoreUntilMs = 0;
let executedShoveSeq = 0;
let shoveSessionId: string | null = null;

/**
 * The argument. Every press of E while they are hassling you adds heat; stop
 * and it bleeds away. Fill it and the ring opens — so squaring up is something
 * you DO over a couple of seconds, not a switch that flips under you.
 */
let anger: ScrapAngerState = emptyScrapAnger();
let angerSessionId: string | null = null;
let angerTickedAtMs = 0;

function tickAnger(nowMs: number, session: ScrapSession | null, skill: number, pressed: boolean): boolean {
  if (!session || session.phase === "fight" || session.phase === "resolve" || session.phase === "cooldown") {
    if (angerSessionId !== null) {
      anger = emptyScrapAnger();
      angerSessionId = null;
      provokedStage = 0;
      setScrapAngerValue(0);
    }
    angerTickedAtMs = nowMs;
    return false;
  }
  if (angerSessionId !== session.id) {
    anger = emptyScrapAnger();
    angerSessionId = session.id;
    angerTickedAtMs = nowMs;
    provokedStage = 0;
  }
  const boiledBefore = anger.boiled;
  const stageBefore = scrapProvocationStage(anger.value);
  const dt = Math.max(0, nowMs - angerTickedAtMs);
  angerTickedAtMs = nowMs;
  anger = scrapAngerTick(anger, dt, nowMs);
  if (pressed) {
    const before = anger.lastPressAtMs;
    anger = scrapAngerPress(anger, nowMs, skill);
    if (anger.lastPressAtMs !== before) playPlayerProvokeEmote(scrapProvocationStage(anger.value));
  }
  setScrapAngerValue(anger.value);
  // Crossed a stage going UP: they react. The troupe consumes it as a line,
  // a gesture and (from stage 2) a shove. Pressing E is never silent.
  const stageNow = scrapProvocationStage(anger.value);
  if (stageNow > stageBefore && stageNow > provokedStage) {
    provokedStage = stageNow;
    provocationSeq += 1;
  }
  return anger.boiled && !boiledBefore;
}

/** The last provocation stage the crowd reacted to; reset per session. */
let provokedStage: ScrapProvocationStage = 0;
/** Bumps on every stage crossing so the troupe fires the beat exactly once. */
let provocationSeq = 0;

export function scrapProvocation(): { seq: number; stage: ScrapProvocationStage } {
  return { seq: provocationSeq, stage: provokedStage };
}

function trackGuest(nowMs: number, npcX: number, npcZ: number): void {
  const tf = Transform.getOrNull(engine.PlayerEntity) ?? Transform.getOrNull(engine.CameraEntity);
  const x = tf?.position.x ?? 0;
  const z = tf?.position.z ?? 0;
  const dt = lastGuestAtMs ? Math.min(400, nowMs - lastGuestAtMs) : 0;
  if (lastGuestPos && dt > 0) {
    guestSpeed = (Math.hypot(x - lastGuestPos.x, z - lastGuestPos.z) / dt) * 1000;
    guestStillMs = guestSpeed <= SCRAP_STILL_SPEED ? guestStillMs + dt : 0;
  }
  const gap = Math.hypot(x - npcX, z - npcZ);
  // Leaving = the gap is opening AND you are actually moving.
  guestLeaving = guestSpeed > SCRAP_STILL_SPEED && gap > guestGapWas + 0.02;
  guestGapWas = gap;
  lastGuestPos = { x, z };
  lastGuestAtMs = nowMs;
}

/** Any emote the guest plays while being hassled is an answer, not a fight. */
function trackGuestEmote(nowMs: number): void {
  // A grow-only value set: `get` throws when the component was never written,
  // and there is no getOrNull on this component kind.
  if (!AvatarEmoteCommand.has(engine.PlayerEntity)) return;
  let newest = lastEmoteStamp;
  try {
    for (const command of AvatarEmoteCommand.get(engine.PlayerEntity)) {
      if (command.timestamp > newest) newest = command.timestamp;
    }
  } catch {
    return;
  }
  if (newest === lastEmoteStamp) return;
  lastEmoteStamp = newest;
  // E's Chest Open is the provocation, not a joke they can laugh off.
  if (nowMs < provokeIgnoreUntilMs) return;
  emotedAtMs = nowMs;
}

function playPlayerProvokeEmote(stage: ScrapProvocationStage): void {
  const role = scrapPlayerProvokeRole(stage);
  provokeIgnoreUntilMs = Date.now() + 1600;
  void triggerSceneEmote({
    src: scrapEmoteBinding(role).ref,
    loop: false,
  });
}

/**
 * A shove: NPC avatars have no physics, so a push is `movePlayerTo` with a
 * short duration — a glide, which reads as a shove when the camera shakes with
 * it. The target MUST be clamped inside the scene or the call silently no-ops.
 */
/**
 * A provocation shove: the same movePlayerTo glide, fired by a stage crossing
 * in the argument rather than by the session planner. Same clamp, same push.
 */
export function executeScrapProvocationShove(npcIndex: number, npcX: number, npcZ: number): boolean {
  if (scrapConfig.shovePushM <= 0) return false;
  const tf = Transform.getOrNull(engine.PlayerEntity);
  const x = tf?.position.x ?? 0;
  const y = tf?.position.y ?? 0;
  const z = tf?.position.z ?? 0;
  let dx = x - npcX;
  let dz = z - npcZ;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  const push = scrapConfig.shovePushM * 0.8;
  void movePlayerTo({
    newRelativePosition: {
      x: clampToScene(x + dx * push),
      y,
      z: clampToScene(z + dz * push),
    },
    // NO cameraTarget. It snaps the view to the given point, and from close
    // range "look at their head" pitches the camera steeply UP - you end up
    // staring at the sky and lose sight of the fight. A shove moves your FEET.
  });
  console.log(`[scrap] provocation shove by npc ${npcIndex}`);
  return true;
}

export function executeScrapShove(session: ScrapSession, npcX: number, npcZ: number): boolean {
  if (scrapConfig.shovePushM <= 0) return false;
  if (session.shoveSeq <= 0) return false;
  if (shoveSessionId === session.id && session.shoveSeq <= executedShoveSeq) return false;
  shoveSessionId = session.id;
  executedShoveSeq = session.shoveSeq;
  const tf = Transform.getOrNull(engine.PlayerEntity);
  const x = tf?.position.x ?? 0;
  const y = tf?.position.y ?? 0;
  const z = tf?.position.z ?? 0;
  let dx = x - npcX;
  let dz = z - npcZ;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  const push = scrapConfig.shovePushM;
  void movePlayerTo({
    newRelativePosition: {
      x: clampToScene(x + dx * push),
      y,
      z: clampToScene(z + dz * push),
    },
    // NO cameraTarget. It snaps the view to the given point, and from close
    // range "look at their head" pitches the camera steeply UP - you end up
    // staring at the sky and lose sight of the fight. A shove moves your FEET.
  });
  console.log(`[scrap] shove ${session.shoveSeq} on ${session.id}`);
  return true;
}

/**
 * Scene-local metres. movePlayerTo rejects an out-of-bounds target outright, so
 * a shove that would leave the plot has to be clamped or it silently does
 * nothing (the same trap entry-geometry.ts documents for the access gate).
 */
function clampToScene(n: number): number {
  return Math.max(0.5, Math.min(sceneSpanM - 0.5, n));
}

/** Plot span in metres, from the layout. 16 m per parcel. */
let sceneSpanM = 48;

export function scrapPluginConfig(): ScrapConfig {
  return scrapConfig;
}

export function isScrapLeased(npcIndex: number): boolean {
  return scrapLeasedNpcIndexes(scrapState).has(npcIndex);
}

export function scrapIntentFor(npcIndex: number): ScrapIntent | undefined {
  return scrapIntents.get(npcIndex);
}

export function activeScrapSession(): ScrapSession | null {
  return scrapState.sessions.find((session) => session.phase !== "cooldown") ?? null;
}

/** Queue a guest-started scrap. The next director tick consumes it. */
export function localScrapPlayerId(): string | null {
  const fromPlayer = getPlayer()?.userId?.trim();
  if (fromPlayer) return fromPlayer.toLowerCase();
  const identity = PlayerIdentityData.getOrNull(engine.PlayerEntity);
  const addr = identity?.address?.trim();
  if (addr) return addr.toLowerCase();
  return liveScrapGuests()[0]?.id ?? null;
}

/**
 * While a bout is running (or just ended), every click is a punch, never a new
 * challenge. This is the isolation that stops a click storm from restarting
 * the fight the moment it resolves.
 */
export function scrapInputLocked(): boolean {
  return scrapFightOwnsInput() || activeScrapSession() !== null || isScrapHumanFightActive();
}

/** Crowd clap must die whenever gloves are up, even before the planner session exists. */
export function scrapCrowdQuiet(): boolean {
  return scrapFightOwnsInput() || scrapSilencesCrowdClap(activeScrapSession()?.phase);
}

export function queuePlayerScrap(npcIndex: number, playerId?: string | null): void {
  if (!scrapConfig.enabled || !scrapConfig.playerCanInitiate) return;
  if (scrapInputLocked()) return;
  const id = (playerId ?? localScrapPlayerId())?.trim().toLowerCase();
  if (!id) return;
  pendingPlayerChallenge = { npcIndex, playerId: id, explicit: true, untilMs: Date.now() + 8000 };
  wireScrapBus();
  try {
    scrapBus.emit("scrap.challenge", { npcIndex, playerId: id });
  } catch {
    // Local pending still starts the bout on the coordinator.
  }
}

export function liveScrapGuests(): ScrapGuest[] {
  const out: ScrapGuest[] = [];
  const seen = new Set<string>();
  const add = (rawId: string, x: number, z: number, y?: number): void => {
    const id = rawId.trim().toLowerCase();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, x, z, y });
  };
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const tf = Transform.getOrNull(entity);
    if (!tf) continue;
    add(identity.address?.trim() || String(entity), tf.position.x, tf.position.z, tf.position.y);
  }
  const me = getPlayer();
  if (me?.userId) {
    const tf = Transform.getOrNull(engine.PlayerEntity);
    const cam = Transform.getOrNull(engine.CameraEntity);
    let x = tf?.position.x ?? 0;
    let z = tf?.position.z ?? 0;
    let y = tf?.position.y;
    if (Math.hypot(x, z) < 0.5 && cam && Math.hypot(cam.position.x, cam.position.z) > 1) {
      x = cam.position.x;
      z = cam.position.z;
      y = cam.position.y;
    }
    add(me.userId, x, z, y);
  }
  return out;
}

export function tickScrapDirector(input: {
  nowMs: number;
  npcs: readonly ScrapActor[];
  guests?: readonly ScrapGuest[];
}): Map<number, ScrapIntent> {
  if (!scrapConfig.enabled) {
    scrapState = emptyScrapWorldState();
    scrapIntents = new Map();
    return scrapIntents;
  }
  if (
    bootAtMs &&
    input.nowMs - bootAtMs < SCRAP_BOOT_GRACE_MS &&
    scrapState.sessions.length === 0 &&
    !pendingPlayerChallenge?.explicit
  ) {
    // Arrival grace: no approach, no proximity challenge. A deliberate click
    // on "Fight" still starts a bout — that one is the guest's own choice.
    scrapIntents = new Map();
    return scrapIntents;
  }
  /**
   * ‼️A GUEST WHO IS NOT ON THIS FLOOR IS NOT IN THIS FIGHT.
   *
   * Owner, 2026-09-09: the boxing game switched itself on after landing on the
   * ground under the sky island, and the stance aimed UPWARD at the deck. Every
   * gap in the planner is `Math.hypot(dx, dz)` — correct for footwork, and
   * blind to a hundred metres of air — so a guest standing directly below a
   * deck full of regulars was zero metres from all of them.
   *
   * Filtered HERE rather than inside the planner: the planner reasons about one
   * bout on one floor and should keep doing exactly that. This is the door.
   */
  const guests = scrapGuestsOnFloor(input.npcs, input.guests ?? liveScrapGuests());
  let pending = pendingPlayerChallenge;
  pendingPlayerChallenge = null;
  if (pending && pending.untilMs > 0 && input.nowMs > pending.untilMs) pending = null;
  // A challenge that arrived (local or over the bus) while a bout owned the
  // input is stale by definition. Drop it; do not let it re-arm the ring.
  if (pending && scrapFightOwnsInput(input.nowMs)) pending = null;
  // Signals are measured against the NPC we are already dealing with.
  const live = scrapState.sessions.find((session) => session.phase !== "cooldown") ?? null;
  const focus = live ? input.npcs.find((npc) => npc.npcIndex === live.npcIndex) : undefined;
  if (focus) {
    trackGuest(input.nowMs, focus.x, focus.z);
    trackGuestEmote(input.nowMs);
  }
  const fightResult = consumeScrapFightResult() as Exclude<ScrapOutcome, "pending" | "defused"> | null;
  if (fightResult) notifyScrapBout(fightResult);
  const pressed = consumeScrapAcceptFight();
  // "Busy on a board" used to be read off the retired on-foot flight controller.
  // The hoverboard dock is the only thing that rides now, and it owns that state.
  // Unavailable on the glider, at the bag, or falling off the island — the
  // punch machine registers the last two through scrap-guard.
  const onNeonGlider = isRidingGlider() || scrapGuestUnavailable();
  const planned = planScrapTick({
    nowMs: input.nowMs,
    config: scrapConfig,
    state: scrapState,
    npcs: input.npcs,
    guests,
    playerChallengeNpcIndex: pending?.npcIndex ?? null,
    playerId: pending?.playerId ?? guests[0]?.id ?? null,
    playerChallengeExplicit: pending?.explicit === true,
    // One punch / E / click opens the ring. No three-press argument.
    playerAcceptFight: pressed,
    playerLeaving: guestLeaving || scrapGuestLeaving(),
    playerStill: guestStillMs > 900,
    playerEmoted: input.nowMs - emotedAtMs < 600,
    playerUnavailable: onNeonGlider,
    maxBackers: scrapConfig.maxBackers,
    fightResult,
    resultProceeded: consumeScrapFightProceed(),
  });
  scrapState = planned.state;
  if (
    pending?.explicit &&
    pending.untilMs > input.nowMs &&
    !scrapLeasedNpcIndexes(scrapState).has(pending.npcIndex)
  ) {
    pendingPlayerChallenge = pending;
  }
  scrapIntents = new Map(
    planned.intents
      .filter((intent): intent is Exclude<ScrapIntent, { kind: "none" }> => intent.kind !== "none")
      .map((intent) => [intent.npcIndex, intent]),
  );
  return scrapIntents;
}
