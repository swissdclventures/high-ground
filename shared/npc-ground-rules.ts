/**
 * NPC ground rules — always-on product promises for every venue crew.
 *
 * These are not host toggles. The Social & NPC Crew panel surfaces them as
 * locked rules; the scene runtime must honor them whenever NPCs are present.
 *
 * Guest acknowledge (v1):
 *   NPCs never walk through guests. On contact they pause, briefly acknowledge,
 *   steer around the guest's personal space, then resume their job.
 *
 * AvatarShape NPCs have no physics body — respect is entirely steering + a short
 * interrupt beat (face + emote). Pure helpers live here so vitest can cover the
 * state machine without the SDK.
 */

import type { SteerDisc } from "./dance-crowd-steering";

export interface NpcGroundRule {
  /** Stable id — also the venue-capability key suffix after `presence.`. */
  key: "npcGuestAcknowledge";
  title: string;
  /** Host-facing one-liner shown in the Crew panel. */
  summary: string;
  /** Always true — ground rules are never optional. */
  alwaysOn: true;
}

export const NPC_GROUND_RULES: readonly NpcGroundRule[] = [
  {
    key: "npcGuestAcknowledge",
    title: "Acknowledge guests",
    summary:
      "NPCs never walk through guests. They pause, briefly say hi, walk around you, then continue.",
    alwaysOn: true,
  },
] as const;

/** Personal-space radius around each live guest (meters). */
export const NPC_GUEST_PERSONAL_SPACE_M = 1.1;

/** How long an NPC holds still facing the guest after first contact. */
export const NPC_GUEST_ACKNOWLEDGE_HOLD_S = 1.2;

/** Minimum time before the same NPC will acknowledge again. */
export const NPC_GUEST_ACKNOWLEDGE_COOLDOWN_S = 14;

/** Emote used for the acknowledge beat (base DCL expression id). */
export const NPC_GUEST_ACKNOWLEDGE_EMOTE = "wave";

export interface GuestAckState {
  /** Wall-clock ms — bot holds still until this time. 0 = not holding. */
  holdingUntil: number;
  /** Wall-clock ms — ignore new contacts until this time. */
  cooldownUntil: number;
}

export type GuestAckAction = "none" | "start" | "hold" | "release";

export interface GuestAckPlan {
  state: GuestAckState;
  action: GuestAckAction;
  /** Guest position to face while acknowledging; null when clear. */
  faceGuest: { x: number; z: number } | null;
}

export function emptyGuestAckState(): GuestAckState {
  return { holdingUntil: 0, cooldownUntil: 0 };
}

/** Turn live guest positions into steering discs (same math as mesh no-gos). */
export function guestPersonalSpaceDiscs(
  guests: readonly { x: number; z: number }[],
  radius: number = NPC_GUEST_PERSONAL_SPACE_M
): SteerDisc[] {
  return guests.map((g) => ({ x: g.x, z: g.z, r: radius }));
}

/**
 * Plan one acknowledge beat for an NPC near guests.
 *
 * - `start` → begin hold + face + wave (caller plays the emote)
 * - `hold`  → keep standing still
 * - `release` → hold just ended; resume walk (still steers around guest discs)
 * - `none`  → no interrupt this frame
 */
export function planGuestAcknowledge(input: {
  nowMs: number;
  botX: number;
  botZ: number;
  state: GuestAckState;
  guests: readonly { x: number; z: number }[];
  /** When false, never interrupt (e.g. center-stage performer). */
  allowInterrupt: boolean;
  personalSpaceM?: number;
  holdS?: number;
  cooldownS?: number;
}): GuestAckPlan {
  const space = input.personalSpaceM ?? NPC_GUEST_PERSONAL_SPACE_M;
  const holdMs = (input.holdS ?? NPC_GUEST_ACKNOWLEDGE_HOLD_S) * 1000;
  const cooldownMs = (input.cooldownS ?? NPC_GUEST_ACKNOWLEDGE_COOLDOWN_S) * 1000;
  const prev = input.state;

  if (prev.holdingUntil > 0 && input.nowMs < prev.holdingUntil) {
    const face = nearestGuest(input.botX, input.botZ, input.guests);
    return {
      state: prev,
      action: "hold",
      faceGuest: face ? { x: face.x, z: face.z } : null,
    };
  }

  if (prev.holdingUntil > 0 && input.nowMs >= prev.holdingUntil) {
    return {
      state: { holdingUntil: 0, cooldownUntil: input.nowMs + cooldownMs },
      action: "release",
      faceGuest: null,
    };
  }

  if (!input.allowInterrupt || input.nowMs < prev.cooldownUntil) {
    return { state: prev, action: "none", faceGuest: null };
  }

  const near = nearestGuestInRange(input.botX, input.botZ, input.guests, space);
  if (!near) {
    return { state: prev, action: "none", faceGuest: null };
  }

  return {
    state: {
      holdingUntil: input.nowMs + holdMs,
      cooldownUntil: input.nowMs + holdMs + cooldownMs,
    },
    action: "start",
    faceGuest: { x: near.x, z: near.z },
  };
}

function nearestGuest(
  botX: number,
  botZ: number,
  guests: readonly { x: number; z: number }[]
): { x: number; z: number; dist: number } | null {
  let best: { x: number; z: number; dist: number } | null = null;
  for (const g of guests) {
    const dist = Math.hypot(g.x - botX, g.z - botZ);
    if (!best || dist < best.dist) best = { x: g.x, z: g.z, dist };
  }
  return best;
}

function nearestGuestInRange(
  botX: number,
  botZ: number,
  guests: readonly { x: number; z: number }[],
  radius: number
): { x: number; z: number; dist: number } | null {
  const best = nearestGuest(botX, botZ, guests);
  if (!best || best.dist > radius) return null;
  return best;
}
