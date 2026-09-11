import { punchProfileSpeed, type PunchGameProfile, type PunchRescueSkill } from './punch-game-profile';
export { PUNCH_RESCUE_SKILLS, PUNCH_RESCUE_FAILURE_TELLS } from './punch-game-profile';
export type { PunchRescueSkill, PunchRescueFailureTell } from './punch-game-profile';

const unit = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;

export function punchRescueMarker(elapsedMs: number): number {
  return 0.5 + 0.5 * Math.sin(elapsedMs / 1000 * Math.PI * 2);
}
/**
 * ‼️SIX SECONDS, and the save is a LOOP now, not a reflex.
 *
 * Owner, 2026-09-07, on the sweeping line: "I don't know what it is and I have
 * no idea how to play it… this needs to be a little game loop, not just the
 * same progress bar." And, choosing from four options: the ball in the ring.
 *
 * THE RING. Every spectator off the queue gets their own ring with a ball in
 * it. A wind that every client computes identically from the elapsed time
 * blows the ball outward, turning as it goes and strengthening through the
 * window; each tap shoves the ball straight back toward the centre. Keep it
 * inside for PUNCH_RESCUE_HOLD_MS and you have held it — the first held ring to
 * reach the coordinator saves the streak. A ball that touches the rim gets out:
 * it is put back just inside, standing still, and the hold starts over.
 *
 * The old sweep (`punchRescueMarker`/`punchRescueHit`) stays exported for the
 * latency tests that document why a 41 ms band could never be judged on
 * arrival; the game no longer uses it.
 */
/** Default values; authored profiles may tune these in the Director. */
export const PUNCH_RESCUE_PREPARATION_MS = 1200;
export const PUNCH_RESCUE_WINDOW_MS = 7000;
export const PUNCH_RESCUE_TAPS_REQUIRED = 12;
/** Inputs faster than this are treated as one physical press, not an auto-click stream. */
export const PUNCH_RESCUE_TAP_COOLDOWN_MS = 70;
export const PUNCH_RESCUE_HOLD_MS = 3000;
/** One shove: an impulse toward the centre, in ring radii per second. */
export const PUNCH_RESCUE_SHOVE = 1.1;
/** Taps inside this are dropped: a debounce, not a strategy. */
export const PUNCH_RESCUE_SHOVE_COOLDOWN_MS = 120;
/**
 * ‼️SHOVES ARE A BUDGET. Three stored, one back every 850 ms. Without this,
 * hammering the key held the ball every time in the tuning sweep, because a
 * shove toward the centre is never wrong — only wasted. With it, a shove spent
 * while the ball is safe is a shove missing when it is not.
 */
export const PUNCH_RESCUE_SHOVES_MAX = 3;
export const PUNCH_RESCUE_SHOVE_REGEN_MS = 850;
/**
 * ‼️THE CALM CIRCLE. Inside this radius a shove costs its stamina and moves
 * nothing: the ball is safe, and pushing a safe ball is what hammering does.
 * The panel draws it, so "shove when it leaves the green" is the whole lesson.
 */
export const PUNCH_RESCUE_CALM_R = 0.4;
/** The wind: this much at the start, this much more per second, in radii/s². */
export const PUNCH_RESCUE_WIND_BASE = 1.3;
export const PUNCH_RESCUE_WIND_RAMP = 0.25;
/** Velocity decays at this rate, so a shove is a nudge and not a launch. */
export const PUNCH_RESCUE_DAMPING = 1.3;
/** The ball starts here, already off-centre, already in the wind. */
export const PUNCH_RESCUE_START_R = 0.5;
/** Where the ball is put back after it gets out: just inside the rim, still. */
export const PUNCH_RESCUE_RESET_R = 0.9;

export interface PunchRescueRing {
  /** The ball, in ring radii from the centre: inside while |p| < 1. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** How long the ball has been inside without getting out. */
  insideMs: number;
  /** Times it got out — the panel flashes on each. */
  escapes: number;
  /** Shoves spent inside the calm circle, which moved nothing. */
  wasted: number;
  /** Shoves in hand, 0..PUNCH_RESCUE_SHOVES_MAX, fractional while one is coming back. */
  shoves: number;
  /** When the last shove landed, in elapsed ms, for the debounce. */
  shovedAt: number;
}

export function punchRescueRing(): PunchRescueRing {
  return {
    x: PUNCH_RESCUE_START_R * Math.cos(0.7),
    y: PUNCH_RESCUE_START_R * Math.sin(0.7),
    vx: 0, vy: 0, insideMs: 0, escapes: 0, wasted: 0,
    shoves: PUNCH_RESCUE_SHOVES_MAX, shovedAt: -Infinity,
  };
}

/**
 * The wind at this moment of the window: the same on every client, because it
 * is a function of the elapsed time alone. It turns as it goes so the ball
 * wanders rather than sliding out along one line, and it strengthens so the
 * last second asks more than the first.
 */
export function punchRescueWind(elapsedMs: number): { x: number; y: number } {
  const t = Math.max(0, elapsedMs) / 1000;
  const angle = 0.7 + 1.3 * Math.sin(t * 0.9) + t * 0.6;
  const strength = PUNCH_RESCUE_WIND_BASE + PUNCH_RESCUE_WIND_RAMP * t;
  return { x: Math.cos(angle) * strength, y: Math.sin(angle) * strength };
}

export function punchRescueRingStep(ring: PunchRescueRing, dtMs: number, elapsedMs: number): PunchRescueRing {
  const dt = Math.min(0.1, Math.max(0, dtMs) / 1000);
  if (dt <= 0) return ring;
  const wind = punchRescueWind(elapsedMs);
  const damp = Math.exp(-PUNCH_RESCUE_DAMPING * dt);
  const vx = (ring.vx + wind.x * dt) * damp;
  const vy = (ring.vy + wind.y * dt) * damp;
  const x = ring.x + vx * dt;
  const y = ring.y + vy * dt;
  const r = Math.hypot(x, y);
  const shoves = Math.min(PUNCH_RESCUE_SHOVES_MAX, ring.shoves + (dt * 1000) / PUNCH_RESCUE_SHOVE_REGEN_MS);
  if (r >= 1) {
    // Out. Back just inside the rim, still, and the hold starts over.
    return { ...ring, x: (x / r) * PUNCH_RESCUE_RESET_R, y: (y / r) * PUNCH_RESCUE_RESET_R, vx: 0, vy: 0, insideMs: 0, escapes: ring.escapes + 1, shoves };
  }
  return { ...ring, x, y, vx, vy, insideMs: ring.insideMs + dt * 1000, shoves };
}

/**
 * A tap: shove the ball straight back toward the centre. Inside the debounce
 * it is dropped; with no shove in hand it is dropped; inside the calm circle
 * it is SPENT and moves nothing.
 */
export function punchRescueRingShove(ring: PunchRescueRing, elapsedMs: number): PunchRescueRing {
  if (elapsedMs - ring.shovedAt < PUNCH_RESCUE_SHOVE_COOLDOWN_MS) return ring;
  if (ring.shoves < 1) return ring;
  const r = Math.hypot(ring.x, ring.y);
  if (r < PUNCH_RESCUE_CALM_R) return { ...ring, shoves: ring.shoves - 1, shovedAt: elapsedMs, wasted: ring.wasted + 1 };
  const dx = -ring.x / r;
  const dy = -ring.y / r;
  return { ...ring, vx: ring.vx + dx * PUNCH_RESCUE_SHOVE, vy: ring.vy + dy * PUNCH_RESCUE_SHOVE, shoves: ring.shoves - 1, shovedAt: elapsedMs };
}

export function punchRescueHeld(ring: PunchRescueRing): boolean {
  return ring.insideMs >= PUNCH_RESCUE_HOLD_MS;
}

/**
 * The coordinator's side of a claim. A client reports how long it held the
 * ball (the same trust the punch's own timing marker has always had); the
 * coordinator only insists that the claim is a hold, that it ARRIVED inside
 * the window plus the grace, and that it did not arrive before a hold that long
 * was possible — a "three seconds" claim at second one is a replay or a lie.
 */
export const PUNCH_RESCUE_CLAIM_SLACK_MS = 400;
export function punchRescueClaimOk(
  taps: number | undefined,
  arrivalElapsedMs: number,
  tapsRequired = PUNCH_RESCUE_TAPS_REQUIRED,
  windowMs = PUNCH_RESCUE_WINDOW_MS
): boolean {
  return typeof taps === 'number' && Number.isFinite(taps)
    && Math.round(taps) >= Math.max(1, Math.round(tapsRequired))
    && punchRescueArrivalOk(arrivalElapsedMs, windowMs);
}

/**
 * ‼️THE SAVE IS A SKILL TEST NOW, AND THE SHAPE IS THE DIRECTOR'S CHOICE.
 *
 * Owner, 2026-09-08: *"it's never ending, it's too easy to save and the person
 * keeps on hitting… saving them needs to have some skill, right now it's
 * visually unattractive and it's way too easy."* He was right, and the reason
 * was arithmetic, not feel: the shipped test was 12 taps in a 7,000 ms window
 * behind a 70 ms cooldown, so the ceiling was ~14 taps/s against a requirement
 * of 1.7 — hammering finished it in under a second, and because every spectator
 * ran their own meter the winner was whoever's reflex fired first. There was no
 * skill anywhere in it.
 *
 * Three shapes, all judged on CLIENT-REPORTED elapsed for the latency reason
 * documented above `punchRescueHit`, and all pure functions so the coordinator
 * re-scores exactly what the player saw:
 *
 *   band-taps    (default) the marker sweeps; a tap inside the band is +1 and a
 *                tap OUTSIDE it is -1. Hammering is not merely useless, it is
 *                self-defeating — which is the whole repair.
 *   closest-shot ONE press each, and the closest to the centre wins at the end
 *                of the window rather than the first to finish. A contest, not
 *                a race: a room of ten is harder than a room of one.
 *   hold         hold the key and keep the circle full. Kept because it is the
 *                most legible of the three and reads well on a phone.
 */
/**
 * Half-width of the gold band around the centre, in marker units.
 *
 * ‼️THIS NUMBER IS A DUTY CYCLE, NOT A DISTANCE, and reading it as a distance is
 * how a save becomes impossible. The marker is `0.5 + 0.5·sin(2πt)`, so a band
 * of half-width `w` is open while `|sin θ| <= 2w` — 0.22 leaves it open about
 * 145 ms per crossing and twice a second, roughly 29% of the time. A player
 * watching the sweep lands it; a player hammering at the 70 ms floor puts ~71%
 * of their taps outside and goes backwards. Drop this to 0.065 and you have the
 * old `punchRescueHit` band: 51 ms, 10%, and a rhythm nobody learns in one turn.
 */
export const PUNCH_RESCUE_BAND_01 = 0.22;
/** Net taps inside the band that save the run. Misses subtract; the floor is 0. */
export const PUNCH_RESCUE_BAND_TAPS = 3;

/** Is the marker inside the gold band at this instant? A pure read of the sweep. */
export function punchRescueInBand(elapsedMs: number, band01 = PUNCH_RESCUE_BAND_01): boolean {
  return Math.abs(punchRescueMarker(elapsedMs) - 0.5) <= Math.max(0.01, band01);
}

/**
 * Score a whole run of taps the way the player experienced it: in order, each
 * one +1 inside the band and -1 outside, never below zero, and taps closer
 * together than the debounce dropped as one physical press.
 *
 * ‼️THE CLIENT SENDS THE TAP TIMES, NOT A COUNT. A count is a number a client
 * asserts; a list of elapsed times is a claim the coordinator can re-score with
 * this same function and disagree with. `best` is kept alongside `net` because
 * the failure tell names how close the room came, and the closest anybody got
 * is the peak they reached, not wherever they happened to finish.
 */
export function punchRescueBandScore(
  tapElapsedsMs: readonly number[] | undefined,
  band01 = PUNCH_RESCUE_BAND_01,
  windowMs = PUNCH_RESCUE_WINDOW_MS,
): { net: number; best: number; hits: number; misses: number } {
  let net = 0, best = 0, hits = 0, misses = 0, last = -Infinity;
  // ‼️SORTED FIRST, AND THAT IS A SECURITY STEP RATHER THAN TIDINESS. The
  // debounce below compares each press to the previous one, so an UNORDERED
  // list walks it backwards — `at - last` goes negative, every gap looks
  // smaller than the cooldown, and a forged shuffle could either drop presses
  // it wanted dropped or slip a burst through. A real client sends these in
  // time order and loses nothing by being sorted; a hostile one loses the
  // trick. Copied rather than sorted in place: the caller's array is theirs.
  for (const raw of [...(tapElapsedsMs ?? [])].sort((a, b) => a - b)) {
    if (!Number.isFinite(raw)) continue;
    const at = Number(raw);
    if (at < 0 || at > windowMs + PUNCH_RESCUE_GRACE_MS) continue;
    if (at - last < PUNCH_RESCUE_TAP_COOLDOWN_MS) continue;
    last = at;
    if (punchRescueInBand(at, band01)) { net += 1; hits += 1; best = Math.max(best, net); }
    else { net = Math.max(0, net - 1); misses += 1; }
  }
  return { net, best, hits, misses };
}

/** How far off centre the best single press was, 0 (perfect) … 0.5 (worst). */
export function punchRescueClosest01(tapElapsedsMs: readonly number[] | undefined, windowMs = PUNCH_RESCUE_WINDOW_MS): number {
  let closest = 0.5;
  for (const raw of tapElapsedsMs ?? []) {
    if (!Number.isFinite(raw)) continue;
    const at = Number(raw);
    if (at < 0 || at > windowMs + PUNCH_RESCUE_GRACE_MS) continue;
    closest = Math.min(closest, Math.abs(punchRescueMarker(at) - 0.5));
  }
  return closest;
}

export function punchRescueHit(elapsedMs: number): boolean {
  return elapsedMs >= 0 && elapsedMs <= PUNCH_RESCUE_WINDOW_MS
    && Math.abs(punchRescueMarker(elapsedMs) - 0.5) <= 0.065;
}

/**
 * ‼️LATENCY TOLERANCE, AND WHY A 41 MS WINDOW CANNOT BE JUDGED ON ARRIVAL.
 *
 * The marker sweeps at 1 Hz and the hit band is +-0.065 around the middle, so
 * it is open for about 41 ms at a time. A reach judged on the moment the
 * message REACHED the coordinator is therefore judged against a marker that has
 * moved on by the sender's whole one-way delay -- a 50 ms link misses by more
 * than the window is wide, and a phone on mobile data can never hit it at all.
 * Not "harder for them": impossible, systematically, for the whole event.
 *
 * The marker is a pure function of `startsAt`, which every client has, so every
 * client can render it exactly. The reach therefore carries the elapsed the
 * player ACTUALLY SAW, and the coordinator scores that. Two consequences, both
 * deliberate:
 *
 *   - A client whose clock disagrees with the coordinator's draws a marker that
 *     is out of phase and is scored on that same out-of-phase reading. It is
 *     judged on what it showed the person, which is the only fair thing to
 *     judge anybody on.
 *   - The number is CLIENT-REPORTED, exactly like `timingMarker01` on a punch,
 *     and carries the same trust: a client can lie about its own input and has
 *     always been able to. This adds no new authority -- it moves the rescue to
 *     the trust level the punch itself has always had.
 *
 * The one thing the coordinator still owns is WHEN: a reach has to ARRIVE
 * inside the window plus a grace, or a claimed perfect elapsed delivered a
 * minute later would be a replay rather than a slow packet.
 */
export const PUNCH_RESCUE_GRACE_MS = 1500;

export function punchRescueArrivalOk(arrivalElapsedMs: number, windowMs = PUNCH_RESCUE_WINDOW_MS): boolean {
  return arrivalElapsedMs >= 0
    && arrivalElapsedMs <= windowMs + PUNCH_RESCUE_GRACE_MS;
}

/**
 * ONE DOOR FOR ALL THREE SHAPES. The coordinator asks this and nothing else, so
 * a new skill is a case here rather than a branch spread across the network
 * module, the HUD and the tests.
 *
 * `progress01` is what the failure tell reports — how close this attempt came,
 * 0 … 1 — and it is defined for a MISS as well as a save, because "closest 2 of
 * 3" is the entire point of naming a near miss.
 *
 * ‼️`closest-shot` NEVER SAVES HERE. It is decided at the end of the window by
 * comparing every attempt, which is a thing only the coordinator holding all of
 * them can do; this function scores one claim in isolation. Returning `saved:
 * false` for it is correct rather than a gap — see `settleRescue`.
 */
export function punchRescueClaim(input: {
  skill: PunchRescueSkill;
  taps?: readonly number[];
  heldMs?: number;
  arrivalElapsedMs: number;
  bandTapsRequired?: number;
  band01?: number;
  holdMs?: number;
  windowMs?: number;
}): { saved: boolean; progress01: number; detail: string } {
  const windowMs = input.windowMs ?? PUNCH_RESCUE_WINDOW_MS;
  if (!punchRescueArrivalOk(input.arrivalElapsedMs, windowMs)) return { saved: false, progress01: 0, detail: '' };
  if (input.skill === 'hold') {
    const need = Math.max(1, input.holdMs ?? PUNCH_RESCUE_HOLD_MS);
    const held = Math.max(0, Math.min(Number(input.heldMs) || 0, input.arrivalElapsedMs));
    return { saved: held >= need, progress01: unit(held / need), detail: `${(held / 1000).toFixed(1)}S` };
  }
  if (input.skill === 'closest-shot') {
    const closest = punchRescueClosest01(input.taps, windowMs);
    // 0 is dead centre and 0.5 is the far edge, so nearness is the complement.
    return { saved: false, progress01: unit(1 - closest / 0.5), detail: closest.toFixed(2) };
  }
  const need = Math.max(1, Math.round(input.bandTapsRequired ?? PUNCH_RESCUE_BAND_TAPS));
  const score = punchRescueBandScore(input.taps, input.band01, windowMs);
  return { saved: score.net >= need, progress01: unit(score.best / need), detail: `${Math.min(score.best, need)} OF ${need}` };
}

/**
 * ‼️THE ORDER — FOUR WORDS, THE BIGGEST THING ON THE SCREEN.
 *
 * Owner, 2026-09-09, having played a save through: *"I have no idea how it
 * works… there was never no instructions for [it]. There was no clear thing
 * what I needed to do"*, and then: *"explain to the user with 3 or 4 words in
 * large capital letters what they need to do."*
 *
 * Everything the panel needed to say was already on it, and none of it was said
 * LOUDLY. The rule lived in a 15 px cyan line UNDER the lane, under the pips and
 * under the countdown — dead last in reading order, on the one screen nobody has
 * time to read. And on a phone it said `PRESS E`, which is not a key a handset
 * has: the panel was giving a four-second window an instruction the device could
 * not obey.
 *
 * So the rule comes back as an ORDER: at most four words, one verb, and the verb
 * is the one THIS device can carry out. `touch` is the caller's `isCompact()`,
 * which is the renderer's own answer about which virtual screen it picked.
 *
 * ‼️A PHASE THAT CANNOT ACT STILL GETS A LINE. The fumbler is shown the same
 * veil and can do nothing about it; "THE ROOM DECIDES" is the only true sentence
 * available at that size, and silence there is what read as "no instructions".
 */
export type PunchRescueOrderPhase = 'preparing' | 'live' | 'claimed' | 'won' | 'fumbler';

export function punchRescueOrder(
  phase: PunchRescueOrderPhase,
  skill: PunchRescueSkill = 'band-taps',
  touch = false,
): string {
  if (phase === 'preparing') return 'GET READY';
  if (phase === 'won') return 'STREAK SAVED';
  if (phase === 'claimed') return 'STAND BY';
  if (phase === 'fumbler') return 'THE ROOM DECIDES';
  if (skill === 'hold') return touch ? 'HOLD TO FILL' : 'HOLD E TO FILL';
  if (skill === 'closest-shot') return touch ? 'TAP THE MIDDLE' : 'PRESS E IN MIDDLE';
  return touch ? 'TAP THE GOLD' : 'PRESS E ON GOLD';
}

/**
 * The elapsed to score a reach on: what the player saw, when it is offered and
 * plausible, and the coordinator's own reading when it is not.
 *
 * `claimed` is bounded to the window rather than merely believed, so a garbled
 * or hostile value degrades to a miss instead of to an exception.
 */
export function punchRescueElapsedMs(claimed: number | undefined, arrivalElapsedMs: number): number {
  return typeof claimed === 'number' && Number.isFinite(claimed)
    && claimed >= 0 && claimed <= PUNCH_RESCUE_WINDOW_MS
    ? claimed
    : arrivalElapsedMs;
}

/** A forgiving preparation area: 35 cm and 25 degrees are still perfect. */
export function punchStance(offsetM: number, facingDot: number, inZone: boolean) {
  const position = unit((offsetM - 0.35) / 0.85);
  const facing = unit((Math.cos(25 * Math.PI / 180) - facingDot) / Math.cos(25 * Math.PI / 180));
  const penalty = inZone ? 0.2 * Math.max(position, facing) : 0.2;
  return { power: 1 - penalty, penaltyPercent: Math.round(penalty * 100),
    cue: !inZone ? 'STEP INTO THE STRIKE ZONE' : position > facing && position > 0 ? 'CENTER YOUR STANCE'
      : facing > 0 ? 'FACE THE BAG' : 'PERFECT STANCE' };
}

/** Actual release speed, not the hardest speed previously reached in the round. */
export function punchChallenge(attempt: number, heldMs: number, idealMs: number, profile: PunchGameProfile) {
  const over = Math.max(0, heldMs / Math.max(1, idealMs) - 2);
  const speed = punchProfileSpeed(attempt, profile) * Math.min(2, 1 + over * 0.24);
  const multiplier = Math.min(profile.difficultyMax, 1 + profile.difficultyGain * (speed - 1) ** 2);
  return { speed, multiplier };
}

/**
 * ‼️HOW DANGEROUS THIS PUNCH IS, BEFORE IT IS THROWN — 0 safe … 1 treacherous.
 *
 * Owner, 2026-09-08: *"we should find a way to show an elevated fumble risk so
 * that you pay attention when it's important."* Everything needed already
 * existed and none of it was visible in time: `challengeLabel` printed
 * `DIFFICULTY ×1.28` AFTER the punch, on the rail's lowest rank, as a receipt.
 *
 * Three independent reasons a punch is about to be hard, each normalised
 * against its own ceiling so no term can quietly dominate by having a bigger
 * unit:
 *
 *   SPEED     `punchProfileSpeed` ramps 1.00 → `speedMax` over the round.
 *   VARIANCE  the needle's reversal spread, `(attempt-1) · varianceStep · 0.5`
 *             capped at 0.65 — and it climbs about SIX TIMES faster than speed
 *             does, which is why late punches feel wild rather than merely
 *             quick. This is the term that matters and the one nothing showed.
 *   OVERHOLD  holding past `PUNCH_OVERHOLD_PLATEAU` ideals accelerates the
 *             needle up to `PUNCH_OVERHOLD_SPEED_MAX`. Self-inflicted, live,
 *             and completely silent before this.
 *
 * Combined as `1 - Π(1 - term)`: monotone in each, saturating rather than
 * summing past 1, and reading naturally as "the chance something here gets you".
 */
export function punchFumbleRisk01(
  attempt: number,
  heldMs: number,
  idealMs: number,
  profile: PunchGameProfile,
): number {
  const speedHead = Math.max(0.01, profile.speedMax - 1);
  const speedRisk = unit((punchProfileSpeed(attempt, profile) - 1) / speedHead);
  const variance = Math.min(0.65, Math.max(0, attempt - 1) * profile.varianceStep * 0.5);
  const varianceRisk = unit(variance / 0.65);
  const over = Math.max(0, heldMs / Math.max(1, idealMs) - 2);
  const overholdRisk = unit(Math.min(1, over * 0.24));
  return unit(1 - (1 - speedRisk) * (1 - varianceRisk) * (1 - overholdRisk));
}

/**
 * What a fumble would COST, 0 … 1 — how far up the multiplier ladder the run is.
 *
 * Risk and stake are deliberately two numbers. A wild needle on punch one is a
 * shrug; the same needle on a ×32 run is the moment the whole table leans in,
 * and a single blended figure could not tell those apart. The physical tell
 * reads risk for its COLOUR and stake for its VOLUME.
 */
export function punchFumbleStake01(streak: number, profile: PunchGameProfile): number {
  const rungs = Math.max(1, profile.multipliers.length - 1);
  return unit(Math.max(0, streak) / rungs);
}

export function punchChallengeAward(input: {
  attempt: number; heldMs: number; idealMs: number; timing01: number;
  points: number; remaining01: number;
}, profile: PunchGameProfile) {
  const challenge = punchChallenge(input.attempt, input.heldMs, input.idealMs, profile);
  // Waiting only pays when the difficult release is accurate. Crowd points cannot buy this precision.
  const difficultyMultiplier = input.timing01 >= 0.9 ? challenge.multiplier : 1;
  const timeMultiplier = 1 + unit(input.remaining01) * profile.earlyBonus;
  const difficultyBonus = Math.round(input.points * (difficultyMultiplier - 1));
  const timeBonus = Math.round(input.points * (timeMultiplier - 1));
  return { difficultyMultiplier, difficultyBonus, timeBonus, speed: challenge.speed,
    points: input.points + difficultyBonus + timeBonus };
}
