/**
 * Scrap session planner — pure, no SDK.
 *
 * Host NPCs stay host NPCs. This module decides who is borrowed, which phase
 * they are in, and what the scene should do this tick. Troupe walks and emotes.
 */

import {
  SCRAP_APPROACH_CARDS,
  SCRAP_CHALLENGE_CARDS,
  SCRAP_ESCALATE_CARDS,
  SCRAP_FIGHT_CARDS,
  SCRAP_NPC_WIN_CARDS,
  SCRAP_PLAYER_WIN_CARDS,
  SCRAP_TEASE_CARDS,
  SCRAP_WALK_AWAY_CARDS,
  type ScrapBeatCard,
  type ScrapConfig,
} from "./scrap-contract";
import { SCRAP_GLOAT_MARKER, SCRAP_GUARD_MARKER } from "./scrap-emotes";
import { SCRAP_FIGHT_MAX_MS } from "./scrap-fight";
import { scrapBackerCount } from "./scrap-skill";
import { isClappingAudioEmote, silenceClappingAudioEmote } from "./world-audio-policy";

export const SCRAP_PHASES = [
  "approach",
  "tease",
  "escalate",
  "challenge",
  "fight",
  "resolve",
  "cooldown",
] as const;

export type ScrapPhase = (typeof SCRAP_PHASES)[number];
export type ScrapInitiator = "npc" | "player";
export type ScrapOutcome = "player_win" | "npc_win" | "walk_away" | "defused" | "pending";

/**
 * DCL's base `clap` (and `fistpump`) bake clap audio into the clip. Any live
 * Scrap session (approach through KO resolve) must stay silent — hangout clap
 * resumes only on cooldown / no session. Fight-only was not enough: the plaza
 * kept clapping through the walk-in and the ring.
 */
export function scrapSilencesCrowdClap(phase: ScrapPhase | null | undefined): boolean {
  return (
    phase === "approach" ||
    phase === "tease" ||
    phase === "escalate" ||
    phase === "challenge" ||
    phase === "fight" ||
    phase === "resolve"
  );
}

/** True for the DCL base clap/fistpump ids that carry clap audio. */
export function isScrapCrowdClapEmote(emote: string): boolean {
  return isClappingAudioEmote(emote);
}

/**
 * Swap a clap-audio emote for a silent shrug while a bout is on.
 * handsair was the old stand-in — it still reads as a cheer and does not
 * interrupt a clip that is already baking clap audio.
 */
export function scrapCrowdEmoteDuringBout(
  emote: string,
  _phase: ScrapPhase | null | undefined,
  _forceSilent = false,
): string {
  // The World-wide quarantine supersedes phase-specific Scrap behavior.
  return silenceClappingAudioEmote(emote);
}

/**
 * THE ESCALATION LADDER. Not every hassle is a fight — three of the five exits
 * are not. What YOU do decides which rung is next:
 *   walk off        → they jeer and go back to work (walk_away)
 *   emote at them   → friendly/aloof laugh it off (defused); cocky reads it as
 *                     mockery and skips a rung
 *   stand and take it → they SHOVE you. Two shoves and it is a challenge
 *   click them      → the ring, now
 *   ignore the challenge → they swing first and you start a hit down
 */
export const SCRAP_MAX_SHOVES = 2;
export const SCRAP_SHOVE_COOLDOWN_MS = 1200;
export const SCRAP_COCKY_SKILL = 0.65;
export const SCRAP_BACKER_RADIUS_M = 6;
export const SCRAP_BACKER_ARC_M = 0.9;
export const SCRAP_LEAVING_MULT = 1.6;
/** How often the boxing guard is re-triggered on an AvatarShape. */
export const SCRAP_GUARD_BEAT_MS = 1700;
/** How long one side-to-side orbit step takes while they hold the guard. */
export const SCRAP_RING_ORBIT_MS = 2200;
/** Arc (radians) they sweep left/right around you per orbit beat. */
export const SCRAP_RING_ORBIT_ARC = 0.55;

export const SCRAP_APPROACH_ARRIVE_M = 1.6;
/**
 * THE RING. They hold this distance and do NOT chase — at 1.15 m they stood
 * inside your face, filling the screen, and there was nothing left to aim at.
 * A boxing measure is arm's length plus a step.
 */
export const SCRAP_FIGHT_PRESS_M = 2.3;
/** Closer than this and they give ground rather than climb into the camera. */
export const SCRAP_FIGHT_MIN_M = 1.9;
/**
 * Past this gap the ring is over: you actually ran away. 7 m was one short
 * jog from ringside, so a stamina step-back ended the bout. ~3.5× that
 * (~24 m) is a real exit; inside it you can still recover and come back.
 */
export const SCRAP_FIGHT_ESCAPE_M = 24;
/** After the bell, both of you leave. Standing shoulder to shoulder is worse
 *  than either outcome. */
export const SCRAP_SPLIT_MS = 3000;
export const SCRAP_SPLIT_M = 6;
export const SCRAP_APPROACH_TIMEOUT_MS = 8000;
export const SCRAP_TEASE_MS = 2500;
/** Beats of needling before they lose interest and walk. */
export const SCRAP_TEASE_MAX_BEATS = 6;
export const SCRAP_ESCALATE_MS = 2500;
export const SCRAP_CHALLENGE_MS = 1600;
export const SCRAP_RESOLVE_MS = 4200;
/**
 * A KO is a SHOW: fall onto the ground, stay down while you watch, then get up.
 * AFK cap — the view also auto-proceeds at SCRAP_RESULT_PROCEED_MS (~6.2 s).
 */
export const SCRAP_KO_RESOLVE_MS = 9200;
/** They beat you — hold while they talk smack, then you get up. */
export const SCRAP_NPC_WIN_RESOLVE_MS = SCRAP_KO_RESOLVE_MS;
export const SCRAP_KO_HOLD_MS = SCRAP_KO_RESOLVE_MS;

export interface ScrapSession {
  id: string;
  phase: ScrapPhase;
  initiator: ScrapInitiator;
  npcIndex: number;
  groupId: string;
  guestId: string;
  startedAtMs: number;
  phaseUntilMs: number;
  outcome: ScrapOutcome;
  seed: number;
  beatSequence: number;
  /** 0..1 — from the group's attitude + wardrobe (see shared/scrap-skill.ts). */
  skill: number;
  /**
   * Shove counter, capped at SCRAP_MAX_SHOVES. The scene compares it against
   * the last shove it executed — a counter cannot be missed by frame ordering
   * the way a one-frame boolean can.
   */
  shoveSeq: number;
  shovedAtMs: number;
  /** Hit points the guest starts the fight down, for ignoring a challenge. */
  fightPenalty: number;
  /** Onlookers who peel off to watch. They never fight. */
  backerIndexes: number[];
}

export interface ScrapWorldState {
  sessions: ScrapSession[];
  lastNpcStartAtMs: number;
  npcCooldownUntil: Record<number, number>;
  guestCooldownUntil: Record<string, number>;
  nextId: number;
}

export interface ScrapActor {
  npcIndex: number;
  groupId: string;
  interruptible: boolean;
  x: number;
  z: number;
  /**
   * Standing height. OPTIONAL because every gap in this module is
   * `Math.hypot(dx, dz)` and stays that way -- a bout happens on one floor, and
   * making the whole planner 3D would buy nothing. It exists so the DIRECTOR
   * can refuse a guest who is not on any regular's floor at all; see
   * `SCRAP_SAME_FLOOR_M`.
   */
  y?: number;
  /** 0..1 from shared/scrap-skill.ts. Absent = 0.5. */
  skill?: number;
}

export interface ScrapGuest {
  id: string;
  x: number;
  z: number;
  /** See `ScrapActor.y`. Absent means "wherever the NPCs are", as before. */
  y?: number;
}

/**
 * ‼️HOW FAR APART IN HEIGHT TWO PEOPLE MAY BE AND STILL BE IN THE SAME FIGHT.
 *
 * Owner, 2026-09-09: *"after jumping off the island and landing on the ground,
 * the boxing game unexpectedly activated -- the player entered a fighting
 * position and pointed upward toward the distant island."*
 *
 * Everything in this module measures on the FLAT, which is right for footwork
 * and wrong for the one question asked before a bout exists: is this guest even
 * near that regular? A sky island puts a deck full of NPCs directly above a
 * plaza, so a guest on the ground was zero metres from all of them.
 *
 * Four metres covers a step, a kerb and the ramp onto the deck; it does not
 * cover a storey, and it certainly does not cover an island.
 */
export const SCRAP_SAME_FLOOR_M = 4;

/**
 * Guests standing on the same floor as at least one of these regulars.
 *
 * Absent heights mean "as before": a scene that never reports one behaves
 * exactly the way it did, which is what keeps this safe to add underneath every
 * existing caller.
 */
export function scrapGuestsOnFloor(
  npcs: readonly ScrapActor[],
  guests: readonly ScrapGuest[]
): ScrapGuest[] {
  const floors = npcs
    .map((npc) => npc.y)
    .filter((y): y is number => typeof y === "number" && Number.isFinite(y));
  if (floors.length === 0) return [...guests];
  return guests.filter((guest) => {
    if (typeof guest.y !== "number" || !Number.isFinite(guest.y)) return true;
    return floors.some((floor) => Math.abs(guest.y! - floor) <= SCRAP_SAME_FLOOR_M);
  });
}

export type ScrapIntent =
  | { kind: "none" }
  | { kind: "walk_to_guest"; npcIndex: number; guestX: number; guestZ: number; standX: number; standZ: number }
  | {
      kind: "face_guest";
      npcIndex: number;
      guestX: number;
      guestZ: number;
      line: string | null;
      emote: string;
      holdMs: number;
    }
  | { kind: "knockout"; npcIndex: number; guestX: number; guestZ: number }
  | {
      kind: "guard_up";
      npcIndex: number;
      guestX: number;
      guestZ: number;
      /** Ring position they hold — they never close in past SCRAP_FIGHT_MIN_M. */
      standX: number;
      standZ: number;
      /** Slow counter — an AvatarShape expression plays once, so it is re-fired. */
      beat: number;
      /** Down to their last hit: hold a hurt idle instead of a clean guard. */
      hurt: boolean;
    }
  | {
      kind: "back_crowd";
      npcIndex: number;
      guestX: number;
      guestZ: number;
      standX: number;
      standZ: number;
      emote: string;
      /** Solid from the challenge on: the ring closes, with one gap. */
      solid: boolean;
    }
  | { kind: "flee"; npcIndex: number; awayX: number; awayZ: number }
  | { kind: "retreat"; npcIndex: number; awayX: number; awayZ: number }
  | { kind: "return_to_job"; npcIndex: number };

export function emptyScrapWorldState(): ScrapWorldState {
  return {
    sessions: [],
    lastNpcStartAtMs: 0,
    npcCooldownUntil: {},
    guestCooldownUntil: {},
    nextId: 1,
  };
}

/**
 * Everyone this app is currently holding — including the short cooldown, which
 * is the SPLIT: both fighters walking out of each other's space. Release them
 * to the crowd director mid-split and they simply stand there together.
 */
export function scrapLeasedNpcIndexes(state: ScrapWorldState): Set<number> {
  const out = new Set<number>();
  for (const session of state.sessions) {
    out.add(session.npcIndex);
    for (const backer of session.backerIndexes) out.add(backer);
  }
  return out;
}

function mix(a: number, b: number): number {
  return (Math.imul((a ^ 0x9e3779b9) + b, 2654435761) >>> 0);
}

function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** Stand just short of the guest so we never orbit their personal-space disc. */
export function scrapStandOff(
  fromX: number,
  fromZ: number,
  guestX: number,
  guestZ: number,
  distance: number = SCRAP_APPROACH_ARRIVE_M
): { x: number; z: number } {
  const dx = guestX - fromX;
  const dz = guestZ - fromZ;
  const gap = Math.hypot(dx, dz);
  if (gap < 0.05) return { x: guestX, z: guestZ + distance };
  const scale = distance / gap;
  return { x: guestX - dx * scale, z: guestZ - dz * scale };
}

/**
 * Ring footwork: hold fight distance while stepping left/right around the guest.
 * Seed picks the side; the beat picks WHICH of two ring stations they stand on.
 *
 * THE TARGET MUST BE A FIXED POINT. This used to sweep a triangle wave measured
 * from the NPC's OWN current angle, so the target stayed ~0.55 rad (1.3 m) ahead
 * of them no matter where they walked, and demanded ~2.3 m/s against a 1.33 m/s
 * chase. They could never arrive: the bot walked every single frame of the bout,
 * and a walking AvatarShape is in its locomotion state — which cancels
 * `expressionTriggerId`. That is why the opponent paced back and forth and never
 * threw the guard, jab, cross, uppercut or kick clips.
 *
 * So the sway is now measured from a COARSE anchor instead of from themselves.
 * The anchor snaps to 90 degree lanes; the beat adds a sway of -1 / 0 / +1 half
 * arcs on top. Because the largest sway (0.55 rad) is comfortably inside half a
 * lane (0.785 rad), standing on the target does not move the anchor — the target
 * is a FIXED POINT, so they arrive and stop. Each beat is one ~1.27 m step
 * (~0.95 s of walking) followed by ~1.25 s of stillness for the clip to play.
 * The bout still sways left and right; it just breathes between steps.
 */
export function scrapRingOrbit(
  guestX: number,
  guestZ: number,
  fromX: number,
  fromZ: number,
  nowMs: number,
  seed: number,
  distance: number = SCRAP_FIGHT_PRESS_M
): { x: number; z: number } {
  const dx = fromX - guestX;
  const dz = fromZ - guestZ;
  const gap = Math.hypot(dx, dz);
  const baseAngle = gap < 0.05 ? Math.atan2(1, 0) : Math.atan2(dx, dz);
  const beat = Math.floor(nowMs / SCRAP_RING_ORBIT_MS);
  const side = seed & 1 ? 1 : -1;
  // Anchor lane. Coarse on purpose: it must not move when they step onto the
  // sway offset, or the target runs away from them again.
  const lane = Math.PI / 2;
  const anchor = Math.round(baseAngle / lane) * lane;
  // -1, 0, +1, 0 — one half-arc per beat, so every step is reachable inside it.
  const wave = [-1, 0, 1, 0][beat % 4] ?? 0;
  const angle = anchor + side * SCRAP_RING_ORBIT_ARC * wave;
  return {
    x: guestX + Math.sin(angle) * distance,
    z: guestZ + Math.cos(angle) * distance,
  };
}

export function scrapFleePoint(
  npcX: number,
  npcZ: number,
  guestX: number,
  guestZ: number,
  distance = 8
): { x: number; z: number } {
  const dx = npcX - guestX;
  const dz = npcZ - guestZ;
  const gap = Math.hypot(dx, dz);
  if (gap < 0.05) return { x: npcX + distance, z: npcZ };
  const scale = distance / gap;
  return { x: npcX + dx * scale, z: npcZ + dz * scale };
}

function pickCard(cards: readonly ScrapBeatCard[], seed: number, sequence: number): ScrapBeatCard {
  return cards[(seed + sequence) % cards.length]!;
}

function pickLine(card: ScrapBeatCard, seed: number, sequence: number): string | null {
  const h = mix(seed, sequence);
  if (h % 5 === 0) return null;
  return card.lines[h % card.lines.length]!;
}

export function rollScrapOutcome(playerWinBias: number, seed: number): Exclude<ScrapOutcome, "pending" | "walk_away"> {
  const r = (mix(seed, 0x51eed) % 1000) / 1000;
  return r < playerWinBias ? "player_win" : "npc_win";
}

function activeCount(state: ScrapWorldState): number {
  return state.sessions.filter((session) => session.phase !== "cooldown").length;
}

function guestOf(guests: readonly ScrapGuest[], id: string): ScrapGuest | undefined {
  const key = id.trim().toLowerCase();
  return guests.find((guest) => guest.id.trim().toLowerCase() === key);
}

function npcOf(npcs: readonly ScrapActor[], index: number): ScrapActor | undefined {
  return npcs.find((npc) => npc.npcIndex === index);
}

function onCooldown(
  map: Record<string | number, number>,
  key: string | number,
  nowMs: number
): boolean {
  return (map[key] ?? 0) > nowMs;
}

function canBorrowNpc(
  npc: ScrapActor,
  state: ScrapWorldState,
  nowMs: number
): boolean {
  if (!npc.interruptible) return false;
  if (scrapLeasedNpcIndexes(state).has(npc.npcIndex)) return false;
  return !onCooldown(state.npcCooldownUntil, npc.npcIndex, nowMs);
}

function canHassleGuest(state: ScrapWorldState, guestId: string, nowMs: number): boolean {
  if (state.sessions.some((session) => session.guestId === guestId && session.phase !== "cooldown")) {
    return false;
  }
  return !onCooldown(state.guestCooldownUntil, guestId, nowMs);
}

function startArrivedOrApproach(
  state: ScrapWorldState,
  nowMs: number,
  initiator: ScrapInitiator,
  npc: ScrapActor,
  guest: ScrapGuest,
  npcs: readonly ScrapActor[] = [],
  maxBackers = 0
): ScrapWorldState {
  const want = scrapBackerCount(typeof npc.skill === "number" ? npc.skill : 0.5, maxBackers);
  const backerIndexes = scrapPickBackers(npcs, state, npc, want);
  const next = startSession(state, { nowMs, initiator, npc, guest, backerIndexes });
  if (dist(npc.x, npc.z, guest.x, guest.z) > SCRAP_APPROACH_ARRIVE_M) return next;
  const created = next.sessions[next.sessions.length - 1];
  if (!created) return next;
  return {
    ...next,
    sessions: next.sessions.map((item) =>
      item.id === created.id ? enterPhase(created, "tease", nowMs + SCRAP_TEASE_MS) : item
    ),
  };
}

/** Onlookers: the nearest free NPCs, arranged later on an arc behind the boss. */
export function scrapPickBackers(
  npcs: readonly ScrapActor[],
  state: ScrapWorldState,
  boss: ScrapActor,
  want: number
): number[] {
  if (want <= 0) return [];
  const leased = scrapLeasedNpcIndexes(state);
  return npcs
    .filter(
      (npc) =>
        npc.npcIndex !== boss.npcIndex &&
        npc.interruptible &&
        !leased.has(npc.npcIndex) &&
        dist(npc.x, npc.z, boss.x, boss.z) <= SCRAP_BACKER_RADIUS_M
    )
    .map((npc) => ({ npc, gap: dist(npc.x, npc.z, boss.x, boss.z) }))
    .sort((a, b) => a.gap - b.gap)
    .slice(0, want)
    .map((row) => row.npc.npcIndex);
}

/** Arc slot behind the ringleader, facing the guest. */
export function scrapBackerSlot(
  boss: { x: number; z: number },
  guest: { x: number; z: number },
  slot: number,
  total: number
): { x: number; z: number } {
  const dx = boss.x - guest.x;
  const dz = boss.z - guest.z;
  const len = Math.hypot(dx, dz) || 1;
  const nx = dx / len;
  const nz = dz / len;
  // Perpendicular spread, one step behind the boss.
  const spread = total <= 1 ? 0 : (slot / (total - 1) - 0.5) * 2;
  return {
    x: boss.x + nx * 0.75 - nz * spread * SCRAP_BACKER_ARC_M,
    z: boss.z + nz * 0.75 + nx * spread * SCRAP_BACKER_ARC_M,
  };
}

function startSession(
  state: ScrapWorldState,
  input: {
    nowMs: number;
    initiator: ScrapInitiator;
    npc: ScrapActor;
    guest: ScrapGuest;
    backerIndexes?: number[];
  }
): ScrapWorldState {
  const session: ScrapSession = {
    id: `scrap_${state.nextId}`,
    phase: "approach",
    initiator: input.initiator,
    npcIndex: input.npc.npcIndex,
    groupId: input.npc.groupId,
    guestId: input.guest.id,
    startedAtMs: input.nowMs,
    phaseUntilMs: input.nowMs + SCRAP_APPROACH_TIMEOUT_MS,
    outcome: "pending",
    seed: mix(input.npc.npcIndex, input.nowMs),
    beatSequence: 0,
    skill: typeof input.npc.skill === "number" ? input.npc.skill : 0.5,
    shoveSeq: 0,
    shovedAtMs: 0,
    fightPenalty: 0,
    backerIndexes: input.backerIndexes ?? [],
  };
  return {
    ...state,
    nextId: state.nextId + 1,
    lastNpcStartAtMs: input.initiator === "npc" ? input.nowMs : state.lastNpcStartAtMs,
    sessions: [...state.sessions, session],
  };
}

function enterPhase(session: ScrapSession, phase: ScrapPhase, untilMs: number, outcome = session.outcome): ScrapSession {
  return {
    ...session,
    phase,
    phaseUntilMs: untilMs,
    outcome,
    beatSequence: session.beatSequence + 1,
  };
}

function finishSession(
  state: ScrapWorldState,
  session: ScrapSession,
  nowMs: number,
  config: ScrapConfig,
  outcome: Exclude<ScrapOutcome, "pending">
): ScrapWorldState {
  const hold =
    outcome === "player_win"
      ? SCRAP_KO_RESOLVE_MS
      : outcome === "npc_win"
        ? SCRAP_NPC_WIN_RESOLVE_MS
        : SCRAP_RESOLVE_MS;
  const resolved = enterPhase(session, "resolve", nowMs + hold, outcome);
  return {
    ...state,
    sessions: state.sessions.map((item) => (item.id === session.id ? resolved : item)),
    npcCooldownUntil: {
      ...state.npcCooldownUntil,
      [session.npcIndex]: nowMs + config.npcCooldownSeconds * 1000,
    },
    guestCooldownUntil: {
      ...state.guestCooldownUntil,
      [session.guestId]: nowMs + config.guestCooldownSeconds * 1000,
    },
  };
}

function jumpToFight(
  state: ScrapWorldState,
  session: ScrapSession,
  nowMs: number
): ScrapWorldState {
  return {
    ...state,
    sessions: state.sessions.map((item) =>
      item.id === session.id ? enterPhase(session, "fight", nowMs + SCRAP_FIGHT_MAX_MS) : item
    ),
  };
}

function replace(state: ScrapWorldState, session: ScrapSession): ScrapWorldState {
  return {
    ...state,
    sessions: state.sessions.map((item) => (item.id === session.id ? session : item)),
  };
}

function jumpToPhase(
  state: ScrapWorldState,
  session: ScrapSession,
  phase: ScrapPhase,
  untilMs: number
): ScrapWorldState {
  return replace(state, enterPhase(session, phase, untilMs));
}

export interface ScrapPlayerSignals {
  /** Click/E — take the fight. */
  acceptFight: boolean;
  /** Moving away from them. */
  leaving: boolean;
  /** Standing there taking it. */
  still: boolean;
  /** Played an emote at them — a defuse attempt. */
  emoted: boolean;
  /** CONTINUE on the result stamp — get up and leave the ring. */
  resultProceeded: boolean;
  /** Riding the Neon Glider: combat cannot own or chase this player. */
  unavailable: boolean;
}

const NO_SIGNALS: ScrapPlayerSignals = {
  acceptFight: false,
  leaving: false,
  still: false,
  emoted: false,
  resultProceeded: false,
  unavailable: false,
};

function isCocky(session: ScrapSession): boolean {
  return session.skill >= SCRAP_COCKY_SKILL;
}

function advanceSession(
  state: ScrapWorldState,
  session: ScrapSession,
  nowMs: number,
  config: ScrapConfig,
  npc: ScrapActor | undefined,
  guest: ScrapGuest | undefined,
  fightResult: Exclude<ScrapOutcome, "pending" | "defused"> | null,
  signals: ScrapPlayerSignals
): ScrapWorldState {
  if (!npc || !guest) {
    return finishSession(state, session, nowMs, config, "walk_away");
  }

  let current = session;
  const gap = dist(npc.x, npc.z, guest.x, guest.z);

  // A mounted guest has left the encounter. Likewise, a fighter who opens a
  // real ~24 m gap has escaped; do not chase them across the scene.
  if (signals.unavailable || (current.phase === "fight" && gap > SCRAP_FIGHT_ESCAPE_M)) {
    return finishSession(state, current, nowMs, config, "walk_away");
  }

  if (current.phase === "approach") {
    if (signals.acceptFight) return jumpToFight(state, current, nowMs);
    if (gap > config.approachRadiusM * 2.5) {
      return finishSession(state, current, nowMs, config, "walk_away");
    }
    if (gap <= SCRAP_APPROACH_ARRIVE_M || nowMs >= current.phaseUntilMs) {
      return jumpToPhase(state, current, "tease", nowMs + SCRAP_TEASE_MS);
    }
    return state;
  }

  const talking =
    current.phase === "tease" || current.phase === "escalate" || current.phase === "challenge";

  if (signals.acceptFight && talking) {
    return jumpToFight(state, current, nowMs);
  }

  // An emote is an answer. Softer NPCs take the joke and go; a cocky one just
  // keeps needling (it no longer skips you into a fight you did not start).
  if (signals.emoted && talking && !isCocky(current)) {
    return finishSession(state, current, nowMs, config, "defused");
  }

  // Walking off works — except a cocky one follows you up one rung first.
  if (signals.leaving && talking) {
    const escaped = gap > SCRAP_APPROACH_ARRIVE_M * SCRAP_LEAVING_MULT;
    if (escaped && (!isCocky(current) || current.phase === "challenge")) {
      return finishSession(state, current, nowMs, config, "walk_away");
    }
  }

  if (current.phase === "fight") {
    if (fightResult) return finishSession(state, current, nowMs, config, fightResult);
    if (nowMs >= current.phaseUntilMs) return finishSession(state, current, nowMs, config, "npc_win");
    return state;
  }

  if (current.phase === "resolve") {
    const fightKo = current.outcome === "player_win" || current.outcome === "npc_win";
    // Stay down for the full KO show, or until the view says the fall is done.
    if (fightKo && !signals.resultProceeded && nowMs < current.phaseUntilMs) return state;
    if (!fightKo && nowMs < current.phaseUntilMs) return state;
    return replace(state, { ...current, phase: "cooldown", phaseUntilMs: nowMs + SCRAP_SPLIT_MS });
  }

  if (nowMs < current.phaseUntilMs) return state;

  if (current.phase === "tease" || current.phase === "escalate" || current.phase === "challenge") {
    if (config.intensity === "tease") {
      return finishSession(state, current, nowMs, config, "walk_away");
    }
    // They needle you. Punch (or E) opens the ring. Ignore them long enough
    // and they get bored and go.
    if (current.beatSequence >= SCRAP_TEASE_MAX_BEATS) {
      return finishSession(state, current, nowMs, config, "walk_away");
    }
    return jumpToPhase(state, current, "tease", nowMs + SCRAP_TEASE_MS);
  }

  return {
    ...state,
    sessions: state.sessions.filter((item) => item.id !== current.id),
  };
}

function nearestPair(
  npcs: readonly ScrapActor[],
  guests: readonly ScrapGuest[],
  radius: number,
  state: ScrapWorldState,
  nowMs: number
): { npc: ScrapActor; guest: ScrapGuest; gap: number } | null {
  let best: { npc: ScrapActor; guest: ScrapGuest; gap: number } | null = null;
  for (const npc of npcs) {
    if (!canBorrowNpc(npc, state, nowMs)) continue;
    for (const guest of guests) {
      if (!canHassleGuest(state, guest.id, nowMs)) continue;
      const gap = dist(npc.x, npc.z, guest.x, guest.z);
      if (gap > radius) continue;
      if (!best || gap < best.gap) best = { npc, guest, gap };
    }
  }
  return best;
}

function cardsFor(session: ScrapSession): readonly ScrapBeatCard[] {
  if (session.phase === "approach") return SCRAP_APPROACH_CARDS;
  if (session.phase === "tease") return SCRAP_TEASE_CARDS;
  if (session.phase === "escalate") return SCRAP_ESCALATE_CARDS;
  if (session.phase === "challenge" || session.phase === "fight") {
    return session.phase === "fight" ? SCRAP_FIGHT_CARDS : SCRAP_CHALLENGE_CARDS;
  }
  if (session.outcome === "player_win") return SCRAP_PLAYER_WIN_CARDS;
  if (session.outcome === "npc_win") return SCRAP_NPC_WIN_CARDS;
  return SCRAP_WALK_AWAY_CARDS;
}

export function intentForSession(
  session: ScrapSession,
  npc: ScrapActor | undefined,
  guest: ScrapGuest | undefined,
  nowMs = 0
): ScrapIntent {
  if (session.phase === "cooldown") {
    // The bell has gone. Get out of each other's personal space before going
    // back to the job — two fighters standing shoulder to shoulder afterwards
    // reads worse than either outcome.
    if (npc && guest) {
      const away = scrapFleePoint(npc.x, npc.z, guest.x, guest.z, SCRAP_SPLIT_M);
      return { kind: "retreat", npcIndex: session.npcIndex, awayX: away.x, awayZ: away.z };
    }
    return { kind: "return_to_job", npcIndex: session.npcIndex };
  }
  if (!npc || !guest) return { kind: "return_to_job", npcIndex: session.npcIndex };
  if (session.phase === "approach") {
    const stand = scrapStandOff(npc.x, npc.z, guest.x, guest.z);
    return {
      kind: "walk_to_guest",
      npcIndex: session.npcIndex,
      guestX: guest.x,
      guestZ: guest.z,
      standX: stand.x,
      standZ: stand.z,
    };
  }
  if (session.phase === "fight") {
    const gap = dist(npc.x, npc.z, guest.x, guest.z);
    const stand =
      gap > SCRAP_FIGHT_PRESS_M + 0.35 || gap < SCRAP_FIGHT_MIN_M
        ? scrapStandOff(npc.x, npc.z, guest.x, guest.z, SCRAP_FIGHT_PRESS_M)
        : scrapRingOrbit(guest.x, guest.z, npc.x, npc.z, nowMs, session.seed, SCRAP_FIGHT_PRESS_M);
    if (gap > SCRAP_FIGHT_PRESS_M + 0.55 || gap < SCRAP_FIGHT_MIN_M - 0.15) {
      return {
        kind: "walk_to_guest",
        npcIndex: session.npcIndex,
        guestX: guest.x,
        guestZ: guest.z,
        standX: stand.x,
        standZ: stand.z,
      };
    }
    // A boxing guard at ring distance, re-fired on a slow beat. This used to be
    // a face_guest beat carrying the "hammer" card emote — the MC Hammer dance.
    return {
      kind: "guard_up",
      npcIndex: session.npcIndex,
      guestX: guest.x,
      guestZ: guest.z,
      standX: stand.x,
      standZ: stand.z,
      beat: Math.floor((nowMs - session.startedAtMs) / SCRAP_GUARD_BEAT_MS),
      hurt: false,
    };
  }
  if (session.phase === "resolve" && session.outcome === "player_win") {
    // Down is DOWN. A knocked NPC that pops up and sprints off reads as
    // "nothing happened" — the win has to be visible for the whole resolve.
    return { kind: "knockout", npcIndex: session.npcIndex, guestX: guest.x, guestZ: guest.z };
  }
  if (session.phase === "resolve" && session.outcome === "npc_win") {
    return {
      kind: "face_guest",
      npcIndex: session.npcIndex,
      guestX: guest.x,
      guestZ: guest.z,
      line: null,
      emote: SCRAP_GLOAT_MARKER,
      holdMs: 2200,
    };
  }
  const card = pickCard(cardsFor(session), session.seed, session.beatSequence);
  // Square up as soon as they are on you — tease, escalate, or challenge.
  // One-on-one still reads as a fight: fists up, not a shrug. Approach walks
  // in with the guard clip in the troupe.
  const squaring =
    session.phase === "tease" || session.phase === "challenge" || session.phase === "escalate";
  return {
    kind: "face_guest",
    npcIndex: session.npcIndex,
    guestX: guest.x,
    guestZ: guest.z,
    line: pickLine(card, session.seed, session.beatSequence),
    emote: squaring ? SCRAP_GUARD_MARKER : card.emote,
    holdMs: card.holdMs,
  };
}

export function planScrapTick(input: {
  nowMs: number;
  config: ScrapConfig;
  state: ScrapWorldState;
  npcs: readonly ScrapActor[];
  guests: readonly ScrapGuest[];
  /** Guest asked to scrap this host NPC this tick. */
  playerChallengeNpcIndex: number | null;
  playerId: string | null;
  /** Click/E on an NPC — honor even outside the auto-initiate radius / cooldown. */
  playerChallengeExplicit?: boolean;
  /** E/click during tease–challenge jumps into the glove fight. */
  playerAcceptFight?: boolean;
  /** Walking off, standing still, emoting — the non-violent exits. */
  playerLeaving?: boolean;
  playerStill?: boolean;
  playerEmoted?: boolean;
  /** How many onlookers a session may borrow. 0 = no crowd. */
  maxBackers?: number;
  /** Result from the first-person minigame. */
  fightResult?: Exclude<ScrapOutcome, "pending" | "defused"> | null;
  /** Mounted/otherwise unavailable players cannot start or remain in Scrap. */
  playerUnavailable?: boolean;
  /** CONTINUE on the result stamp. */
  resultProceeded?: boolean;
}): { state: ScrapWorldState; intents: ScrapIntent[] } {
  if (!input.config.enabled) {
    return { state: emptyScrapWorldState(), intents: [] };
  }

  let state = {
    ...input.state,
    sessions: [...input.state.sessions],
    npcCooldownUntil: { ...input.state.npcCooldownUntil },
    guestCooldownUntil: { ...input.state.guestCooldownUntil },
  };

  for (const session of [...state.sessions]) {
    state = advanceSession(
      state,
      session,
      input.nowMs,
      input.config,
      npcOf(input.npcs, session.npcIndex),
      guestOf(input.guests, session.guestId),
      input.fightResult ?? null,
      {
        acceptFight: input.playerAcceptFight === true,
        leaving: input.playerLeaving === true,
        still: input.playerStill === true,
        emoted: input.playerEmoted === true,
        resultProceeded: input.resultProceeded === true,
        unavailable: input.playerUnavailable === true,
      }
    );
  }

  if (
    input.playerUnavailable !== true &&
    input.config.playerCanInitiate &&
    input.playerChallengeNpcIndex != null &&
    input.playerId &&
    activeCount(state) < input.config.maxConcurrent
  ) {
    const npc = npcOf(input.npcs, input.playerChallengeNpcIndex);
    const explicit = input.playerChallengeExplicit === true;
    let guest = input.playerId ? guestOf(input.guests, input.playerId) : undefined;
    // Hover/E already picked this NPC. Don't drop the bout because the local
    // player transform hasn't appeared yet, or they're 10 m away, or the group
    // is marked non-interruptible.
    if (explicit && npc && !guest && input.playerId) {
      guest = { id: input.playerId.trim().toLowerCase(), x: npc.x, z: npc.z };
    }
    const inRange =
      npc &&
      guest &&
      (explicit || dist(npc.x, npc.z, guest.x, guest.z) <= input.config.playerInitiateRadiusM);
    if (
      npc &&
      guest &&
      inRange &&
      (explicit || npc.interruptible) &&
      !scrapLeasedNpcIndexes(state).has(npc.npcIndex) &&
      (explicit || (canBorrowNpc(npc, state, input.nowMs) && canHassleGuest(state, guest.id, input.nowMs)))
    ) {
      state = startArrivedOrApproach(
        state,
        input.nowMs,
        "player",
        npc,
        guest,
        input.npcs,
        input.maxBackers ?? 0
      );
      const newest = state.sessions[state.sessions.length - 1];
      if (
        newest &&
        newest.initiator === "player" &&
        newest.startedAtMs === input.nowMs &&
        newest.phase !== "fight" &&
        newest.phase !== "resolve" &&
        newest.phase !== "cooldown"
      ) {
        const close = dist(npc.x, npc.z, guest.x, guest.z) <= input.config.playerInitiateRadiusM;
        if (input.playerAcceptFight === true || (explicit && close)) {
          state = jumpToFight(state, newest, input.nowMs);
        }
      }
    }
  }

  const npcReady =
    input.playerUnavailable !== true &&
    input.config.npcCanInitiate &&
    activeCount(state) < input.config.maxConcurrent &&
    (state.lastNpcStartAtMs === 0 ||
      input.nowMs - state.lastNpcStartAtMs >= input.config.npcApproachEverySeconds * 1000);

  if (npcReady) {
    const pair = nearestPair(input.npcs, input.guests, input.config.approachRadiusM, state, input.nowMs);
    if (pair) {
      state = startArrivedOrApproach(
        state,
        input.nowMs,
        "npc",
        pair.npc,
        pair.guest,
        input.npcs,
        input.maxBackers ?? 0
      );
    }
  }

  const intents: ScrapIntent[] = [];
  for (const session of state.sessions) {
    const boss = npcOf(input.npcs, session.npcIndex);
    const guest = guestOf(input.guests, session.guestId);
    intents.push(intentForSession(session, boss, guest, input.nowMs));
    if (!boss || !guest) continue;
    // Onlookers form an arc behind the boss and go solid once it is a challenge:
    // the ring closes, and it always keeps one gap to walk out through.
    const solid = session.phase === "challenge" || session.phase === "fight";
    session.backerIndexes.forEach((backerIndex, slot) => {
      if (session.phase === "cooldown") {
        intents.push({ kind: "return_to_job", npcIndex: backerIndex });
        return;
      }
      const stand = scrapBackerSlot(boss, guest, slot, session.backerIndexes.length);
      intents.push({
        kind: "back_crowd",
        npcIndex: backerIndex,
        guestX: guest.x,
        guestZ: guest.z,
        standX: stand.x,
        standZ: stand.z,
        emote: solid ? "handsair" : "",
        solid,
      });
    });
  }
  return { state, intents };
}
