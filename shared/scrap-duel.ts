/**
 * Scrapped Human Edition matchmaking. Pure TypeScript — no SDK.
 *
 * Two pads. One human can start immediately against a computer, or wait for
 * a second guest. If nobody else claims, a computer fills the empty doll.
 * Guest-vs-guest netcode is later; the CPU path is the playable bout.
 */

export const SCRAP_HUMAN_TITLE = "Scrapped Human Edition";
export const SCRAP_DUEL_CPU_WAIT_MS = 4000;
export const SCRAP_DUEL_COUNTDOWN_MS = 3000;
export const SCRAP_DUEL_CPU_SKILL = 0.55;

/** Pit size. The Builder ghost and in-world pads share these so they line up. */
export const SCRAP_RING_RADIUS_M = 4.2;
export const SCRAP_RING_PLATE_M = SCRAP_RING_RADIUS_M * 2.05;
export const SCRAP_RING_PAD_OFFSET_M = 3.1;
/** Paper-thin stain above the paving — not a raised carpet. */
export const SCRAP_RING_DECAL_Y = 0.018;
/** How far past the stain a finished bout dumps you. */
export const SCRAP_RING_KICK_OUT_M = 1.8;

export function scrapRingSurfaceY(groundY: number): number {
  return groundY + SCRAP_RING_DECAL_Y;
}

export function scrapDuelLocksPlayer(phase: ScrapDuelPhase): boolean {
  return phase === "waiting" || phase === "countdown" || phase === "live";
}

export function clampDuelPosition(
  x: number,
  z: number,
  cx: number,
  cz: number,
  radius: number
): { x: number; z: number } {
  const dx = x - cx;
  const dz = z - cz;
  const dist = Math.hypot(dx, dz);
  if (dist <= radius || dist < 0.001) return { x, z };
  const s = radius / dist;
  return { x: cx + dx * s, z: cz + dz * s };
}

export function scrapDuelKickOutPose(
  cx: number,
  cz: number,
  x: number,
  z: number,
  radius: number
): { x: number; z: number } {
  const dx = x - cx;
  const dz = z - cz;
  const dist = Math.hypot(dx, dz);
  const nx = dist > 0.001 ? dx / dist : 1;
  const nz = dist > 0.001 ? dz / dist : 0;
  const out = radius + SCRAP_RING_KICK_OUT_M;
  return { x: cx + nx * out, z: cz + nz * out };
}

export type ScrapDuelSide = "left" | "right";
export type ScrapDuelPhase = "idle" | "waiting" | "countdown" | "live";

export type ScrapDuelOccupant =
  | { kind: "empty" }
  | { kind: "human"; playerId: string }
  | { kind: "cpu" };

export interface ScrapDuelState {
  phase: ScrapDuelPhase;
  left: ScrapDuelOccupant;
  right: ScrapDuelOccupant;
  waitingSinceMs: number;
  countdownUntilMs: number;
  seed: number;
}

const EMPTY: ScrapDuelOccupant = { kind: "empty" };
const CPU: ScrapDuelOccupant = { kind: "cpu" };

export function emptyScrapDuelState(): ScrapDuelState {
  return {
    phase: "idle",
    left: EMPTY,
    right: EMPTY,
    waitingSinceMs: 0,
    countdownUntilMs: 0,
    seed: 1,
  };
}

function occupantId(occ: ScrapDuelOccupant): string | null {
  return occ.kind === "human" ? occ.playerId : null;
}

function mixSeed(a: string, b: string, nowMs: number): number {
  let h = nowMs >>> 0;
  for (const s of [a, b]) {
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  }
  return h || 1;
}

function beginCountdown(state: ScrapDuelState, nowMs: number): ScrapDuelState {
  const leftId = occupantId(state.left) ?? "cpu";
  const rightId = occupantId(state.right) ?? "cpu";
  return {
    ...state,
    phase: "countdown",
    countdownUntilMs: nowMs + SCRAP_DUEL_COUNTDOWN_MS,
    seed: mixSeed(leftId, rightId, nowMs),
  };
}

function bothFilled(state: ScrapDuelState): boolean {
  return state.left.kind !== "empty" && state.right.kind !== "empty";
}

export function duelIsCpuBout(state: ScrapDuelState): boolean {
  const kinds = [state.left.kind, state.right.kind];
  return kinds.includes("human") && kinds.includes("cpu");
}

export function duelIsHumanBout(state: ScrapDuelState): boolean {
  return state.left.kind === "human" && state.right.kind === "human";
}

export function cpuSkillOf(state: ScrapDuelState): number {
  return SCRAP_DUEL_CPU_SKILL;
}

export function claimDuelPad(
  state: ScrapDuelState,
  side: ScrapDuelSide,
  playerId: string,
  nowMs: number
): ScrapDuelState {
  const id = playerId.trim().toLowerCase();
  if (!id) return state;
  if (state.phase === "countdown" || state.phase === "live") return state;
  const pad = state[side];
  if (pad.kind === "human" && pad.playerId === id) return state;
  if (pad.kind !== "empty") return state;
  const already = occupantId(state.left) === id || occupantId(state.right) === id;
  if (already) return state;

  const next: ScrapDuelState = {
    ...state,
    [side]: { kind: "human", playerId: id },
    waitingSinceMs: state.phase === "idle" ? nowMs : state.waitingSinceMs,
  };
  if (bothFilled(next)) return beginCountdown(next, nowMs);
  return { ...next, phase: "waiting" };
}

export function assignDuelCpu(state: ScrapDuelState, nowMs: number): ScrapDuelState {
  if (state.phase === "live") return state;
  if (bothFilled(state)) return state.phase === "waiting" ? beginCountdown(state, nowMs) : state;
  const hasHuman = state.left.kind === "human" || state.right.kind === "human";
  if (!hasHuman) return state;
  const side: ScrapDuelSide = state.left.kind === "empty" ? "left" : "right";
  if (state[side].kind !== "empty") return state;
  return beginCountdown({ ...state, [side]: CPU }, nowMs);
}

export function tickDuelWaiting(state: ScrapDuelState, nowMs: number): ScrapDuelState {
  if (state.phase !== "waiting") return state;
  if (nowMs < state.waitingSinceMs + SCRAP_DUEL_CPU_WAIT_MS) return state;
  return assignDuelCpu(state, nowMs);
}

export function tickDuelCountdown(state: ScrapDuelState, nowMs: number): ScrapDuelState {
  if (state.phase !== "countdown") return state;
  if (nowMs < state.countdownUntilMs) return state;
  return { ...state, phase: "live" };
}

export function finishDuelBout(_state: ScrapDuelState): ScrapDuelState {
  return emptyScrapDuelState();
}

export function releaseDuelPad(state: ScrapDuelState, playerId: string): ScrapDuelState {
  const id = playerId.trim().toLowerCase();
  if (!id) return state;
  if (state.phase === "live") return state;
  const side: ScrapDuelSide | null =
    occupantId(state.left) === id ? "left" : occupantId(state.right) === id ? "right" : null;
  if (!side) return state;
  const next: ScrapDuelState = { ...state, [side]: EMPTY };
  const remainingHuman = occupantId(next.left) ?? occupantId(next.right);
  if (!remainingHuman) return emptyScrapDuelState();
  return {
    ...next,
    phase: "waiting",
    countdownUntilMs: 0,
    waitingSinceMs: Date.now(),
  };
}
