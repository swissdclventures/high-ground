/**
 * THE SCREEN TAKES THE PUNCH TOO.
 *
 * Owner, 2026-09-05: *"before yesterday the screen used to shake very hard when
 * you hit the ball really hard. Right now things are shaking like crazy but it's
 * mostly the island and the machine and the avatars — our screen always stays
 * steady, but we used to have this effect and it was very impressive. Doesn't
 * have to be all the time, but from time to time this will add some drama."*
 *
 * ‼️THIS IS A REGRESSION WITH A DATE ON IT, NOT A MISSING FEATURE. The arc never
 * had a quake of its own. What it had was a free ride on two things that were
 * deliberately deleted on 2026-09-05, both in `updateShake`:
 *
 *   THE HEAVE  the island root used to jitter +-`shakeMag`/2 in Y, up to 17 cm.
 *              The arc hangs off that root, so 17 cm of island heave was 17 cm
 *              of screen heave. It was removed because 17 cm is most of a boot
 *              and it buried the feet of everyone standing on the deck.
 *   THE LURCH  the jackpot tip used to rotate the island root, which swung a
 *              16.4 m arc standing on it through a real arc of travel. It moved
 *              to the render-only island mesh — and the screen is not parented
 *              to that mesh, so the swing simply stopped reaching it.
 *
 * What survives is `SHAKE_LATERAL_MAX`, a 14 cm sideways slide. On a 16.4 m
 * screen 5 m away that is invisible, which is exactly the report: everything
 * shakes, the screen does not.
 *
 * ‼️THE FIX IS NOT TO PUT THE HEAVE BACK. The deck's height is fixed for a good
 * reason and this must not reopen it. The quake below goes on the arc's OWN node
 * instead — the same move `updateCabinetRock` made for the cabinet — because
 * NOBODY STANDS ON THE SCREEN. It carries no collider, no player, no crowd and
 * no camera, so it is free to do everything the deck is forbidden to do: heave,
 * surge, roll and pitch, all at once and hard.
 *
 * DETERMINISTIC, with no random term anywhere. Every client runs
 * `arenaScreenSlam` for the same slam off the same clock, so a pure function of
 * elapsed time means two people standing side by side watch the same screen move
 * the same way. A `Math.random()` here would desync the one object in the venue
 * that everybody is looking at.
 */

export interface PunchArcQuakeSpec {
  /** How long the whole event lasts. The curve lands exactly on zero at the end. */
  ms: number;
  /** Peak throw, in ISLAND metres — see `punchArcQuake` for why the frame matters. */
  throwM: number;
  /** Peak roll, degrees. The edges of the arc are ~5.2 m out, so a degree is ~9 cm. */
  rollDeg: number;
  /** Peak pitch, degrees. Half the roll: the screen tips back, it does not nod. */
  pitchDeg: number;
  /**
   * THE FALL. How far the whole screen drops before it catches itself — the
   * owner's 2026-09-06 escalation for a monster punch: "make it almost fall
   * down from the cloud and then save itself at the last moment and float
   * back". Zero (the default) is the ordinary struck-bell quake.
   */
  dropM?: number;
}

export interface PunchArcQuakeOffset {
  x: number;
  y: number;
  z: number;
  pitchDeg: number;
  rollDeg: number;
}

/**
 * ‼️TIER 3 AND UP ONLY, AND THAT IS THE *"doesn't have to be all the time"*.
 *
 * The same gate the arc's spark showers already use (`ARC_SPARK_MS`), for the
 * same reason: an effect that fires on every punch is scenery, and the owner
 * asked for drama. With the shipped config (min 120, max 999, celebration 900)
 * `punchReactionIntensity` puts tier 3 at ~753 and tier 4 at 900, so a good hit
 * rocks the screen and a monster nearly throws it off its feet.
 *
 * Tiers 1 and 2 are ABSENT rather than zeroed — `punchArcQuakeSpec` returns null
 * for them, so the runtime never starts a clock it would only tick to no effect.
 */
export const PUNCH_ARC_QUAKE: Record<number, PunchArcQuakeSpec> = {
  3: { ms: 850, throwM: 0.24, rollDeg: 1.1, pitchDeg: 0.55 },
  4: { ms: 1_500, throwM: 0.5, rollDeg: 2.2, pitchDeg: 1.1 },
};

/** The quake this tier earns, or null for the two tiers that earn none. */
export function punchArcQuakeSpec(tier: number): PunchArcQuakeSpec | null {
  return PUNCH_ARC_QUAKE[tier] ?? null;
}

/** Every 900+ rocks the arc (floor, no cadence); 980+ nearly drops it. */
export const PUNCH_ARC_QUAKE_SCORE = 900;
export const PUNCH_ARC_FALL_SCORE = 980;
export const PUNCH_ARC_FALL: PunchArcQuakeSpec = {
  ms: 2_800,
  throwM: 0.36,
  rollDeg: 4,
  pitchDeg: 2,
  dropM: 1.7,
};
export function punchArcFallSpec(): PunchArcQuakeSpec {
  return { ...PUNCH_ARC_FALL };
}

/**
 * The fall's own curve, 0..1 of the drop: accelerates down for the first
 * third, hangs at the bottom for a beat (the catch), then climbs back with a
 * wobble that lands on exactly zero — the same "settle, never snap" rule the
 * envelope below keeps.
 */
export function punchArcDrop01(u: number): number {
  if (!(u > 0) || u >= 1) return 0;
  if (u < 0.32) {
    const k = u / 0.32;
    return k * k;
  }
  if (u < 0.42) return 1;
  const k = (u - 0.42) / 0.58;
  return (1 - k) * (1 + 0.15 * Math.sin(k * Math.PI * 2.5));
}

/**
 * Struck bell, not a wobble: full energy on the first frame, exponential settle.
 *
 * The `(1 - u)` tail is not decoration. `Math.exp(-3.2)` is still 0.04, and a
 * screen this size stopping from 4% of a 0.5 m throw is a visible snap on the
 * last frame. Multiplying the decay by a linear ramp lands the curve on exactly
 * zero, so the arc settles instead of being switched off.
 */
export function punchArcQuakeEnvelope(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs < 0 || elapsedMs >= durationMs) return 0;
  const u = elapsedMs / durationMs;
  return Math.exp(-3.2 * u) * (1 - u);
}

/**
 * One frame of the quake, as an offset to apply to the arc's own node.
 *
 * ‼️THE FRAME IS THE ISLAND'S, AND THAT IS DELIBERATE. The screen is two roots
 * in two frames — the GLB root carries the 180 turn and the derived scale, the
 * wash root carries neither because `punchWashSegment` bakes both. An offset
 * applied to one and not the other tears the picture off the screen. So this
 * offset is written to ONE node standing above both of them, at identity, in
 * plain island metres; the two roots keep their authored offsets underneath it
 * and can never drift apart. See PUNCH_BIG_SCREEN_PUSH_M for the long version.
 *
 * EVERY TERM STARTS AT ZERO. Phases are all zero on purpose: the arc leaves rest
 * from rest and slams, rather than teleporting to a mid-oscillation value on the
 * impact frame. Three frequencies per axis (~11 Hz carrier, plus 18 and 27) so
 * it rattles like struck hardware instead of swaying like a curtain.
 *
 * THE UPWARD BIAS is the one asymmetry. The screen floats 1.2 m off the deck and
 * the fence rope stands 1.03 m, so a symmetric 0.5 m throw would dip the frame
 * rails into the ring on a monster punch. Biasing the oscillation up by a third
 * of the throw caps the dip at about 20 cm and reads better anyway: a screen
 * that LEAPS when it is hit, then comes back down.
 */
export function punchArcQuake(elapsedMs: number, spec: PunchArcQuakeSpec): PunchArcQuakeOffset {
  const env = punchArcQuakeEnvelope(elapsedMs, spec.ms);
  if (env <= 0) return { x: 0, y: 0, z: 0, pitchDeg: 0, rollDeg: 0 };
  const t = Math.max(0, elapsedMs) / 1000;
  const throwM = spec.throwM * env;
  const drop = (spec.dropM ?? 0) * punchArcDrop01(Math.max(0, elapsedMs) / spec.ms);
  const heave = Math.sin(t * 69) * 0.62 + Math.sin(t * 112) * 0.26 + Math.sin(t * 173) * 0.12;
  const sway = Math.sin(t * 54) * 0.72 + Math.sin(t * 131) * 0.28;
  const surge = Math.sin(t * 61) * 0.6;
  return {
    x: sway * throwM * 0.55,
    // The bias rides the envelope with everything else, so the screen is back at
    // its authored height the moment the quake ends rather than a hair above it.
    y: heave * throwM + 0.34 * spec.throwM * env - drop,
    z: surge * throwM * 0.35,
    // Nose down while it falls, so the drop reads as losing lift, not as an elevator.
    pitchDeg: Math.sin(t * 58) * spec.pitchDeg * env + (spec.dropM ? 5 * (drop / spec.dropM) : 0),
    rollDeg: (Math.sin(t * 47) * 0.78 + Math.sin(t * 103) * 0.22) * spec.rollDeg * env,
  };
}
