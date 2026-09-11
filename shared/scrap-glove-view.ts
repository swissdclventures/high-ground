/**
 * First-person Scrap glove rest + punch. Camera-local metres, +Z toward the
 * opponent. Rest stays low and wide. Moves:
 *   jab / cross — wide hook into high / mid / low
 *   uppercut    — chamber under the frame, then a vertical rise through the chin
 *   combo       — left then right in one go
 *
 * Defense: hold A / D (or ◀ ▶) to raise that glove. Matching side blocks their
 * swing (jab→your right, cross→your left). Shift / RMB is ALIGN (shape match),
 * not a guard modifier.
 *
 * Guard lean: raising a glove also tucks that cheek cover; the idle hand drops.
 */

import { scrapMove, type ScrapMoveKind } from "./scrap-moves";
import { SCRAP_HYPE_CLAP_MS } from "./scrap-fight";

export const SCRAP_GLOVE_PUNCH_MS = 380;
export const SCRAP_GLOVE_UPPERCUT_MS = 480;
export const SCRAP_GLOVE_COMBO_MS = 620;

export type ScrapHitBand = "high" | "mid" | "low";
/** What the player threw. Jab = left, cross = right. */
export type ScrapPunchKind = ScrapMoveKind;

/**
 * Big, low, close to the chest: the gloves sit at the bottom edge of the frame
 * with the wrists cut off by the screen. Only the fists show.
 */
export const SCRAP_GLOVE_SCALE = 1.7;
/**
 * Left glove on the LEFT of the frame, thumb inward, knuckles toward them.
 * The previous rotation turned each glove to face its own side of the screen,
 * which reads as hands crossed over - the "inverted, opposite place" note.
 */
export const SCRAP_GLOVE_LEFT_REST = { x: -0.3, y: -0.5, z: 0.5 };
export const SCRAP_GLOVE_RIGHT_REST = { x: 0.3, y: -0.5, z: 0.5 };
export const SCRAP_GLOVE_LEFT_REST_ROT = { x: -40, y: 22, z: 12 };
export const SCRAP_GLOVE_RIGHT_REST_ROT = { x: -40, y: -22, z: -12 };

export function scrapFightBand(faceY: number): ScrapHitBand {
  if (faceY >= 0.16) return "high";
  if (faceY <= -0.16) return "low";
  return "mid";
}

export function scrapGlovePunchDuration(kind: ScrapPunchKind): number {
  if (kind === "combo") return Math.max(SCRAP_GLOVE_COMBO_MS, scrapMove(kind).durationMs);
  if (kind === "uppercut") return Math.max(SCRAP_GLOVE_UPPERCUT_MS, scrapMove(kind).durationMs);
  return scrapMove(kind).durationMs;
}

/** Which fist is active at this moment of the move (combo fires both). */
export function scrapGlovePunchHand(
  kind: ScrapPunchKind,
  elapsedMs: number
): "left" | "right" | "both" | null {
  if (elapsedMs <= 0) return null;
  const dur = scrapGlovePunchDuration(kind);
  if (elapsedMs >= dur) return null;
  if (kind === "jab") return "left";
  if (kind === "cross") return "right";
  if (kind === "uppercut") return "right";
  if (kind === "front_kick") return null;
  // Combo: left first, then right — slight overlap so it reads as a 1-2.
  if (elapsedMs < 300) return "left";
  if (elapsedMs < 340) return "both";
  return "right";
}

/**
 * Elapsed time fed into the single-fist punch curve for this hand.
 * Combo remaps so each fist gets a full 0→impact→rest arc.
 */
export function scrapGloveHandElapsed(
  kind: ScrapPunchKind,
  isRight: boolean,
  elapsedMs: number
): number {
  if (kind === "jab") return isRight ? 0 : elapsedMs;
  if (kind === "cross" || kind === "uppercut") return isRight ? elapsedMs : 0;
  if (kind === "front_kick") return 0;
  // Combo: left 0..280 → punch curve; right starts at 260.
  if (!isRight) {
    if (elapsedMs <= 0 || elapsedMs >= 300) return 0;
    return (elapsedMs / 300) * SCRAP_GLOVE_PUNCH_MS;
  }
  if (elapsedMs < 260) return 0;
  const local = elapsedMs - 260;
  if (local >= 300) return 0;
  return (local / 300) * SCRAP_GLOVE_PUNCH_MS;
}

export interface ScrapGlovePose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

/** -0.4 windup … 1 impact … 0 rest. */
export function scrapGlovePunchWeight(elapsedMs: number, durationMs = SCRAP_GLOVE_PUNCH_MS): number {
  if (elapsedMs <= 0 || elapsedMs >= durationMs) return 0;
  if (elapsedMs < 60) return -0.45 * (elapsedMs / 60);
  const driveEnd = Math.min(200, durationMs * 0.52);
  if (elapsedMs < driveEnd) {
    const u = (elapsedMs - 60) / (driveEnd - 60);
    const ease = 1 - (1 - u) ** 3;
    return -0.45 + 1.45 * ease;
  }
  const holdEnd = Math.min(driveEnd + 50, durationMs * 0.66);
  if (elapsedMs < holdEnd) return 1;
  const u = (elapsedMs - holdEnd) / (durationMs - holdEnd);
  return Math.max(0, 1 - u * u);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPose(a: ScrapGlovePose, b: ScrapGlovePose, t: number): ScrapGlovePose {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
    rx: lerp(a.rx, b.rx, t),
    ry: lerp(a.ry, b.ry, t),
    rz: lerp(a.rz, b.rz, t),
  };
}

function smoothstep(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

function hitY(band: ScrapHitBand): number {
  if (band === "high") return 0.06;
  if (band === "low") return -0.3;
  return -0.1;
}

/**
 * Idle guard: a boxer's bob. Both gloves rise and fall together on a slow
 * beat, drift in opposite directions on a faster one, and the whole guard
 * dips when you eat a hit. Additive, so the punch arc is untouched. Static
 * gloves read as a screenshot; these read as hands.
 */
export function scrapGuardBob(
  isRight: boolean,
  nowMs: number,
  hurtElapsedMs = Infinity
): { x: number; y: number; z: number; rx: number; rz: number } {
  const t = nowMs / 1000;
  const side = isRight ? 1 : -1;
  const bob = Math.sin(t * 2.4) * 0.018;
  const sway = Math.sin(t * 1.3 + (isRight ? 0 : Math.PI)) * 0.012;
  const breathe = Math.sin(t * 0.9) * 0.008;
  let hurtY = 0;
  let hurtRx = 0;
  let hurtZ = 0;
  if (hurtElapsedMs >= 0 && hurtElapsedMs < 420) {
    // Snap back and down, then ease home.
    const u = hurtElapsedMs / 420;
    const k = u < 0.18 ? u / 0.18 : 1 - (u - 0.18) / 0.82;
    hurtY = -0.09 * k;
    hurtZ = -0.12 * k;
    hurtRx = 26 * k;
  }
  return {
    x: sway * side,
    y: bob + breathe + hurtY,
    z: hurtZ,
    rx: Math.sin(t * 2.4) * 3 + hurtRx,
    rz: side * Math.sin(t * 1.3) * 2.5,
  };
}

/** Which gloves are raised for a hold-to-block. */
export type ScrapDefendHands = "both" | "left" | "right" | null;

/**
 * Hold-to-block pose. Raised gloves tuck in high over the cheek; the idle
 * hand drops so a one-handed guard reads clearly.
 */
export function scrapDefendGuard(isRight: boolean, hands: ScrapDefendHands): ScrapGlovePose {
  if (!hands) return { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  const up =
    hands === "both" || (hands === "right" && isRight) || (hands === "left" && !isRight);
  if (up) {
    return {
      x: (isRight ? -1 : 1) * 0.06,
      y: 0.34,
      z: 0.14,
      rx: -28,
      ry: (isRight ? -1 : 1) * 10,
      rz: (isRight ? -1 : 1) * 8,
    };
  }
  return {
    x: (isRight ? 1 : -1) * 0.05,
    y: -0.08,
    z: -0.05,
    rx: 10,
    ry: 0,
    rz: 0,
  };
}

/**
 * Dodge guard: raise the hand OPPOSITE the lean so it covers the open cheek.
 * Dodge left → right glove up. Dodge right → left glove up. The covering hand
 * also tucks in; the other drops a touch so the pose reads clearly.
 */
export function scrapDodgeGuard(
  isRight: boolean,
  dodgeDir: "left" | "right" | null,
  lean: number
): ScrapGlovePose {
  if (!dodgeDir || lean <= 0) return { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  const covering = dodgeDir === "left" ? isRight : !isRight;
  const k = lean;
  if (covering) {
    return {
      x: (isRight ? -1 : 1) * 0.05 * k,
      y: 0.28 * k,
      z: 0.08 * k,
      rx: -18 * k,
      ry: (isRight ? -1 : 1) * 8 * k,
      rz: (isRight ? -1 : 1) * 6 * k,
    };
  }
  return {
    x: (isRight ? 1 : -1) * 0.04 * k,
    y: -0.06 * k,
    z: -0.04 * k,
    rx: 8 * k,
    ry: 0,
    rz: 0,
  };
}

function hookPose(
  isRight: boolean,
  elapsedMs: number,
  band: ScrapHitBand
): ScrapGlovePose {
  const rest = isRight ? SCRAP_GLOVE_RIGHT_REST : SCRAP_GLOVE_LEFT_REST;
  const restRot = isRight ? SCRAP_GLOVE_RIGHT_REST_ROT : SCRAP_GLOVE_LEFT_REST_ROT;
  const side = isRight ? 1 : -1;
  const w = scrapGlovePunchWeight(elapsedMs, SCRAP_GLOVE_PUNCH_MS);
  if (w <= 0) {
    const pull = -w;
    return {
      x: rest.x + side * 0.06 * pull,
      y: rest.y - 0.04 * pull,
      z: rest.z - 0.16 * pull,
      rx: restRot.x - 10 * pull,
      ry: restRot.y + side * 8 * pull,
      rz: restRot.z,
    };
  }
  const arc = {
    x: side * 0.7,
    y: -0.16,
    z: 0.72,
    rx: -14,
    ry: side * 34,
    rz: side * 14,
  };
  const hit = { x: side * 0.03, y: hitY(band), z: 1.15 };
  const hitRot = { x: -2, y: side * -8, z: side * 6 };
  const t = w;
  if (t < 0.48) {
    const u = t / 0.48;
    return {
      x: lerp(rest.x, arc.x, u),
      y: lerp(rest.y, arc.y, u),
      z: lerp(rest.z, arc.z, u),
      rx: lerp(restRot.x, arc.rx, u),
      ry: lerp(restRot.y, arc.ry, u),
      rz: lerp(restRot.z, arc.rz, u),
    };
  }
  const u = (t - 0.48) / 0.52;
  return {
    x: lerp(arc.x, hit.x, u),
    y: lerp(arc.y, hit.y, u),
    z: lerp(arc.z, hit.z, u),
    rx: lerp(arc.rx, hitRot.x, u),
    ry: lerp(arc.ry, hitRot.y, u),
    rz: lerp(arc.rz, hitRot.z, u),
  };
}

/**
 * Vertical uppercut — not a low hook. Chamber the fist at the bottom of the
 * frame (knuckles down, pulled in) so you see it sit under the chin, then
 * drive almost straight +Y through the face. Forward travel stays short;
 * the tell is the lift and the knuckle flip.
 */
function uppercutPose(elapsedMs: number): ScrapGlovePose {
  const rest: ScrapGlovePose = {
    ...SCRAP_GLOVE_RIGHT_REST,
    rx: SCRAP_GLOVE_RIGHT_REST_ROT.x,
    ry: SCRAP_GLOVE_RIGHT_REST_ROT.y,
    rz: SCRAP_GLOVE_RIGHT_REST_ROT.z,
  };
  const dur = SCRAP_GLOVE_UPPERCUT_MS;
  if (elapsedMs <= 0 || elapsedMs >= dur) return rest;

  const chamber: ScrapGlovePose = {
    x: 0.04,
    y: -0.88,
    z: 0.34,
    rx: 62,
    ry: -10,
    rz: -28,
  };
  const hit: ScrapGlovePose = {
    x: 0.0,
    y: 0.55,
    z: 0.72,
    rx: -58,
    ry: 4,
    rz: 10,
  };

  const t = elapsedMs / dur;
  if (t < 0.22) {
    return lerpPose(rest, chamber, (t / 0.22) ** 0.7);
  }
  if (t < 0.64) {
    return lerpPose(chamber, hit, smoothstep((t - 0.22) / 0.42));
  }
  if (t < 0.76) return hit;
  const u = (t - 0.76) / 0.24;
  return lerpPose(hit, rest, u * u);
}

export function scrapGloveViewPose(
  isRight: boolean,
  elapsedMs: number,
  band: ScrapHitBand = "mid",
  kind: ScrapPunchKind = isRight ? "cross" : "jab"
): ScrapGlovePose {
  const handMs = scrapGloveHandElapsed(kind, isRight, elapsedMs);
  if (handMs <= 0) {
    const rest = isRight ? SCRAP_GLOVE_RIGHT_REST : SCRAP_GLOVE_LEFT_REST;
    const restRot = isRight ? SCRAP_GLOVE_RIGHT_REST_ROT : SCRAP_GLOVE_LEFT_REST_ROT;
    return { ...rest, ...{ rx: restRot.x, ry: restRot.y, rz: restRot.z } };
  }
  if (kind === "uppercut") return uppercutPose(handMs);
  return hookPose(isRight, handMs, band);
}

/**
 * Front kick owns the frame — tuck both gloves down so they do not float in the
 * way. UNLESS a guard is being held: kicking out of a guard is legal, and the
 * hands vanishing mid-kick is what made it feel like the guard had been
 * dropped. Holding the guard keeps the gloves posed and keeps them blocking.
 */
export function scrapKickHidesGloves(
  kind: ScrapPunchKind,
  elapsedMs: number,
  guardHands: ScrapDefendHands = null
): boolean {
  if (kind !== "front_kick") return false;
  if (guardHands) return false;
  return elapsedMs > 0 && elapsedMs < scrapGlovePunchDuration(kind);
}

export function scrapGloveTuckPose(isRight: boolean): ScrapGlovePose {
  const rest = isRight ? SCRAP_GLOVE_RIGHT_REST : SCRAP_GLOVE_LEFT_REST;
  const restRot = isRight ? SCRAP_GLOVE_RIGHT_REST_ROT : SCRAP_GLOVE_LEFT_REST_ROT;
  const side = isRight ? 1 : -1;
  return {
    x: rest.x + side * 0.04,
    y: rest.y - 0.38,
    z: rest.z - 0.16,
    rx: restRot.x + 18,
    ry: restRot.y,
    rz: restRot.z,
  };
}

/**
 * Space is a visible wind-up and bump, not an upward guard. Both arms first
 * spread outside the normal stance and turn the glove faces outward, then
 * sweep inward with the wrists mirrored toward each other. They meet in front
 * of the face, hold long enough to read, then return to the ordinary guard.
 */
export function scrapHypeClapPose(isRight: boolean, elapsedMs: number): ScrapGlovePose {
  const rest = isRight ? SCRAP_GLOVE_RIGHT_REST : SCRAP_GLOVE_LEFT_REST;
  const restRot = isRight ? SCRAP_GLOVE_RIGHT_REST_ROT : SCRAP_GLOVE_LEFT_REST_ROT;
  const restPose: ScrapGlovePose = { ...rest, rx: restRot.x, ry: restRot.y, rz: restRot.z };
  if (elapsedMs <= 0 || elapsedMs >= SCRAP_HYPE_CLAP_MS) return restPose;
  const side = isRight ? 1 : -1;
  const cock: ScrapGlovePose = {
    x: side * 0.58,
    y: -0.46,
    z: 0.4,
    rx: -28,
    ry: side * 32,
    rz: side * -26,
  };
  const hit: ScrapGlovePose = {
    x: side * 0.055,
    y: -0.34,
    z: 0.62,
    rx: -30,
    ry: side * -28,
    rz: side * 22,
  };
  const t = elapsedMs / SCRAP_HYPE_CLAP_MS;
  if (t < 0.22) return lerpPose(restPose, cock, smoothstep(t / 0.22));
  if (t < 0.48) return lerpPose(cock, hit, ((t - 0.22) / 0.26) ** 1.7);
  if (t < 0.72) return hit;
  return lerpPose(hit, restPose, smoothstep((t - 0.72) / 0.28));
}
