/**
 * First-person Scrap kick + incoming-fist tell. Camera-local metres, +Z toward
 * the opponent. The local avatar stays hidden in first person, so an oversized
 * trainer shoe is camera-parented here — the same projection approach as the
 * gloves. A second copy runs the opposite direction when the NPC's seeded
 * front kick comes at the player.
 *
 * THE LIMB IS NOT A GLOVE. A glove is a fist pushed forward on a straight line,
 * so posing the leg that way puts the whole shin broadside across the frame and
 * reads as swatting with the flat of the leg. A kick is a KNEE EXTENSION: the
 * shin pivots until it lies along the view axis, knee near the eye, foot far and
 * small, sole turned onto the opponent. The model contract is +Y from the ankle
 * to the knee and +Z out the toe, so that pose is a hard NEGATIVE X-rotation —
 * `rx = -78` swings the shin back to −Z (toward the camera, foreshortened) and
 * carries the toe up to +Y, which lands the sole flat on +Z. Interpolating the
 * ankle alone is what produced the glove read; the ankle track here is derived
 * from a knee that stays put, so the foot travels on an ARC, not a slide.
 *
 * Timeline matches `front_kick` (760 ms, contact at 0.57).
 */

import { scrapMove } from "./scrap-moves";

export const SCRAP_KICK_IMPACT_AT = 0.57;
/** Deliberately larger than a real foot: this is the kick's first-person icon. */
export const SCRAP_KICK_SHOE_SCALE = 3;
/** NPC swing contact is 70% through its beat. Keep the incoming shoe on that clock. */
export const SCRAP_INCOMING_KICK_CONTACT_AT = 0.7;

export interface ScrapKickViewPose {
  visible: boolean;
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function scrapKickViewDuration(): number {
  return scrapMove("front_kick").durationMs;
}

/**
 * Shin length from the ankle to the visible knee cut, in camera-local metres
 * after the runtime scale. The ankle keyframes below are derived from this so
 * the knee stays where a knee belongs instead of trailing the foot.
 */
export const SCRAP_KICK_SHIN_M = 0.42;

/** Where the knee sits, camera-local, at each stage of the extension. */
interface KneeKey {
  kneeX: number;
  kneeY: number;
  kneeZ: number;
  /** Shin pitch. 0 = shin straight up; negative lays it back toward the eye. */
  rx: number;
  ry: number;
  rz: number;
}

/** Ankle = knee + the shin vector implied by the rotation. */
function ankleFrom(key: KneeKey): ScrapKickViewPose {
  const rad = (key.rx * Math.PI) / 180;
  return {
    visible: true,
    x: key.kneeX,
    y: key.kneeY - Math.cos(rad) * SCRAP_KICK_SHIN_M,
    z: key.kneeZ - Math.sin(rad) * SCRAP_KICK_SHIN_M,
    rx: key.rx,
    ry: key.ry,
    rz: key.rz,
  };
}

/**
 * Right-foot front kick. Hidden at rest and after the clip.
 *
 * chamber → the knee drives up and the heel tucks under, so the shin is short
 * and near-vertical in the corner of the frame;
 * whip    → the knee snaps open, the shin rotates through horizontal and the
 *           foot arcs out ahead of it;
 * impact  → shin along the view axis, sole square on the opponent;
 * recover → folds back at the knee first, then drops out of frame.
 */
export function scrapKickViewPose(elapsedMs: number): ScrapKickViewPose {
  const durationMs = scrapKickViewDuration();
  const hidden: ScrapKickViewPose = {
    visible: false,
    x: 0.16,
    y: -1.15,
    z: 0.28,
    rx: 22,
    ry: 8,
    rz: 6,
  };
  if (elapsedMs <= 0 || elapsedMs >= durationMs) return hidden;

  const t = elapsedMs / durationMs;
  // Knee up and close, heel tucked: the shin barely enters the frame.
  const chamber = ankleFrom({ kneeX: 0.23, kneeY: -0.24, kneeZ: 0.4, rx: 14, ry: 12, rz: 10 });
  // Knee opens first — the shin is already past horizontal while the foot is
  // only half out. This is the frame that reads as a kick and not a shove.
  const whip = ankleFrom({ kneeX: 0.19, kneeY: -0.24, kneeZ: 0.52, rx: -46, ry: 8, rz: 7 });
  // Full extension: shin down the view axis, toes up, sole onto them.
  const impact = ankleFrom({ kneeX: 0.06, kneeY: -0.12, kneeZ: 0.74, rx: -82, ry: 2, rz: 2 });
  // Fold back at the knee before the limb leaves — never rewind the slide.
  const refold = ankleFrom({ kneeX: 0.21, kneeY: -0.3, kneeZ: 0.44, rx: -4, ry: 10, rz: 8 });

  let u: number;
  let from: ScrapKickViewPose;
  let to: ScrapKickViewPose;
  if (t < 0.3) {
    u = clamp01(t / 0.3);
    from = hidden;
    to = chamber;
  } else if (t < 0.45) {
    u = clamp01((t - 0.3) / 0.15);
    u = 1 - (1 - u) ** 2;
    from = chamber;
    to = whip;
  } else if (t < SCRAP_KICK_IMPACT_AT) {
    u = clamp01((t - 0.45) / (SCRAP_KICK_IMPACT_AT - 0.45));
    u = 1 - (1 - u) ** 3;
    from = whip;
    to = impact;
  } else if (t < 0.68) {
    u = 1;
    from = impact;
    to = impact;
  } else if (t < 0.85) {
    u = clamp01((t - 0.68) / 0.17);
    from = impact;
    to = refold;
  } else {
    u = clamp01((t - 0.85) / 0.15);
    u = u * u;
    from = refold;
    to = hidden;
  }

  return {
    visible: true,
    x: lerp(from.x, to.x, u),
    y: lerp(from.y, to.y, u),
    z: lerp(from.z, to.z, u),
    rx: lerp(from.rx, to.rx, u),
    ry: lerp(from.ry, to.ry, u),
    rz: lerp(from.rz, to.rz, u),
  };
}

/**
 * Their front kick, projected in first person like an incoming boxing glove.
 * It starts beside the opponent, accelerates toward the eye, holds through the
 * contact frame, then snaps away. Positive X rotation turns the sole back
 * toward the player; the outgoing kick uses the opposite rotation.
 */
export function scrapIncomingKickPose(
  elapsedMs: number,
  durationMs: number
): ScrapKickViewPose {
  const hidden: ScrapKickViewPose = {
    visible: false,
    x: 0.34,
    y: -0.34,
    z: 1.5,
    rx: 42,
    ry: -8,
    rz: -5,
  };
  if (durationMs <= 0 || elapsedMs <= 0 || elapsedMs >= durationMs) return hidden;

  const t = clamp01(elapsedMs / durationMs);
  const chamber: ScrapKickViewPose = {
    visible: true,
    x: 0.34,
    y: -0.28,
    z: 1.42,
    rx: 48,
    ry: -10,
    rz: -6,
  };
  const contact: ScrapKickViewPose = {
    visible: true,
    x: 0.03,
    y: -0.08,
    z: 0.54,
    rx: 84,
    ry: -2,
    rz: -1,
  };
  const recoil: ScrapKickViewPose = {
    visible: true,
    x: 0.24,
    y: -0.25,
    z: 1.15,
    rx: 58,
    ry: -7,
    rz: -4,
  };

  let from = chamber;
  let to = contact;
  let u = 0;
  if (t < 0.2) {
    from = hidden;
    to = chamber;
    u = 1 - (1 - t / 0.2) ** 2;
  } else if (t < SCRAP_INCOMING_KICK_CONTACT_AT) {
    from = chamber;
    to = contact;
    const travel = (t - 0.2) / (SCRAP_INCOMING_KICK_CONTACT_AT - 0.2);
    u = 1 - (1 - travel) ** 3;
  } else if (t < 0.78) {
    from = contact;
    to = contact;
    u = 1;
  } else {
    from = contact;
    to = recoil;
    u = ((t - 0.78) / 0.22) ** 2;
  }

  return {
    visible: true,
    x: lerp(from.x, to.x, u),
    y: lerp(from.y, to.y, u),
    z: lerp(from.z, to.z, u),
    rx: lerp(from.rx, to.rx, u),
    ry: lerp(from.ry, to.ry, u),
    rz: lerp(from.rz, to.rz, u),
  };
}

/**
 * Their incoming fist, camera-local. `side` is YOUR threatened cheek
 * (jab → right, cross → left). `settle` is 0 at wind-up and 1 at contact.
 */
export function scrapIncomingTellPose(
  side: "left" | "right",
  settle: number
): ScrapKickViewPose {
  const k = clamp01(settle);
  const dir = side === "right" ? 1 : -1;
  const chamber = { x: dir * 0.42, y: -0.08, z: 0.72, rx: -18, ry: dir * 22, rz: dir * 8 };
  const hit = { x: dir * 0.1, y: 0.04, z: 1.12, rx: -6, ry: dir * 8, rz: dir * 4 };
  const ease = 1 - (1 - k) ** 2;
  return {
    visible: true,
    x: lerp(chamber.x, hit.x, ease),
    y: lerp(chamber.y, hit.y, ease),
    z: lerp(chamber.z, hit.z, ease),
    rx: lerp(chamber.rx, hit.rx, ease),
    ry: lerp(chamber.ry, hit.ry, ease),
    rz: lerp(chamber.rz, hit.rz, ease),
  };
}
