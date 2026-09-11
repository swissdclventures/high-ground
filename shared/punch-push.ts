import {
  PUNCH_FOCUS_BAND_01,
  PUNCH_FOCUS_CEILING,
  PUNCH_FOCUS_EDGE_QUALITY_01,
  PUNCH_FOCUS_FLOOR_01,
  PUNCH_FOCUS_ZONE_MARGIN_01,
  punchFocusDecay,
  punchFocusGustAt,
  punchFocusTap,
  punchFocusTargetAt,
} from './punch-machine-contract';

/**
 * THE PUSH — the room shoves a failing score over the line.
 *
 * Owner, 2026-09-09, after four rescue mini-games in a row failed to teach
 * anybody anything: *"The big issue in this game is that when your score is not
 * enough the game stops. So essentially what we are trying to influence — we
 * want to take that last score that is about to make you fail and we want to
 * push it up above the threshold of 900. I guess that's the game that we are
 * playing, we're just trying to represent this differently."*
 *
 * ★★★ THAT SENTENCE IS THE WHOLE DESIGN, AND IT IS WHY THIS ONE READS.
 *
 * Every previous rescue was an abstract widget bolted onto the side of the
 * game: a meter, a circle with three dots, a sweeping lane with a standing gold
 * block. Each one had to teach a brand-new rule inside a four-second window,
 * and each one failed, because a bar that means nothing can only ever teach
 * "press more". The object here is THEIR SCORE — a number the whole room has
 * reading all night, with a line at 900 they already understand. Nothing needs
 * explaining. That is the entire fix.
 *
 * ‼️THE CONTROL IS THE FOCUS METER, UNCHANGED. Not a new one, not a variant —
 * the same `punchFocusTap` / `punchFocusDecay` / `punchFocusQuality01` the room
 * already plays between punches. Owner: *"the pulse is strongest if you hit it
 * exactly in the sweet spot and we can reuse our UI from the focus."* Right,
 * and it buys three things we would otherwise have had to invent and tune:
 *
 * 1. ★★★ **THE MULTIPLAYER SCALING IS INVERTED ON PURPOSE.**
 *    Focus still widens with a crowd. The push does the opposite: each extra
 *    helper shrinks the green and splits the same pot, and each later last-chance
 *    of the round shrinks it again. Owner, 2026-09-10: *"the more people are
 *    participating the more difficult it should become… otherwise you just
 *    endlessly postpone the game."* One person can still do it. A crowd of
 *    three cannot waltz it in. A third save of the same round is the last door.
 * 2. **MASHING ALREADY LOSES, for a reason that is on screen.** Every tap is
 *    the same flat `PUNCH_FOCUS_TAP_IMPULSE`, and `punchFocusTap`'s own comment
 *    says it: *"nothing here helps you stop overshooting."* Hammer it and the
 *    level sails past the band into spill, where the grade — and so the pulse —
 *    is zero. An earlier draft of this design added a red "surge" window where
 *    pushing cost double, purely to punish hammering. It was deleted before it
 *    was written: the meter already does that, and the surge would have been a
 *    third thing to read in a ten-second window.
 * 3. **The drift.** `punchFocusTargetAt` wanders ±0.09 around 0.68 on two
 *    out-of-phase sines, so the sweet spot cannot be memorised or parked on.
 *
 * ‼️THE WIRE CARRIES TAP TIMES, NOT A SCORE — same law as the rescue it
 * replaces. A gain is a number a client asserts and the coordinator can only
 * believe; a list of elapsed times is a claim it REPLAYS with the pure function
 * below and can disagree with. `punchPushReplay` sorts before replaying, which
 * is a security step and not tidiness: the level is path-dependent (decay
 * between taps, impulse at each), so an unordered forgery integrates to a
 * different, higher number than the same taps in the order a thumb could
 * actually have produced them.
 *
 * The phase is shared, never a wall clock — see `punchFocusTargetAt`. Two
 * explorers' clocks are skewed by more than a green band is wide.
 */

const unit = (n: number | undefined) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n as number)) : 0);
const finite = (n: number | undefined, fallback = 0) => (Number.isFinite(n) ? (n as number) : fallback);

/**
 * The score a punch has to reach. Said here as well as in the rules because the
 * push is the one place a NEAR miss is the whole event, and a gap computed
 * against a different threshold than the one the room is shown is a lie.
 */
export const PUNCH_PUSH_THRESHOLD = 900;
/** How long the room has, once somebody says yes. */
export const PUNCH_PUSH_WINDOW_MS = 10_000;
/**
 * ‼️THE ASK IS THE FEATURE, NOT THE PREAMBLE. Owner: *"they don't know that
 * they are part of the game, so we need to really blank everything out and ask
 * them — are you, do we want to play — and it's like three, two, one."*
 *
 * Every spectator mechanic this game has shipped was invisible to the people it
 * was for: they were standing on the deck with no idea a window had opened on
 * them. Three seconds of blanked screen and one question is the difference
 * between a mechanic that exists and a mechanic that gets played.
 */
export const PUNCH_PUSH_ASK_MS = 3_000;
/**
 * ★★★ HOW LONG THE RESULT STAYS ON SCREEN AFTER THE WINDOW SHUTS.
 *
 * Owner: *"I don't see when I win. I'm clicking E, I'm standing in the zone,
 * I'm quickly getting over 900, then it just switches off and nothing happens.
 * I don't get any info, I don't get any celebration, I don't get any sound,
 * there is no summary for me, there is no scoreboard for me, nothing."*
 *
 * The summary existed. It was drawn behind a visibility gate that read
 * `now <= rescue.endsAt` — i.e. the panel was torn down at the exact instant
 * the reconciliation became true, so the only frame it could ever have appeared
 * in was the frame it was removed. A result that renders for zero milliseconds
 * is indistinguishable from a result nobody wrote.
 *
 * 3.5 s is long enough to read three lines and short enough to give the world
 * back. The old 5 s card was a full story board; this one is a glance.
 */
export const PUNCH_PUSH_REVIEW_MS = 3_500;
/**
 * One perfect pulse, in points — and the ONE constant that decides whether the
 * ★★★ promise in the header is true.
 *
 * Swept against a simulated optimal player (`tests/scene/punch-push.test.ts`
 * carries the shape of it) over a 600→900 gap:
 *
 * | value | solo, played well | solo, one tap in seven missed | three people |
 * |-------|-------------------|-------------------------------|--------------|
 * | 18    | **864 — fails**   | 793                           | 2.4 s        |
 * | 21    | 900 at 9.9 s      | 837                           | 2.2 s        |
 * | 24    | 900 at 9.4 s      | 894 — misses by six           | 2.0 s        |
 *
 * 18 broke the promise outright: nobody alone could ever get there. 24 is the
 * chosen value because the simulated player is OPTIMAL and a person is not —
 * tuning so that a flawless machine only just scrapes it means no human ever
 * does. At 24 a good solo player lands it on the buzzer, a scrappy one loses by
 * six points, and a crowd of three is home in two seconds. All three of those
 * are the right story for their headcount.
 */
/**
 * ‼️POINTS PER SECOND HELD IN THE GREEN. The scoring is DWELL, not presses.
 *
 * Owner, having played it: *"I was thinking that you have to get into the zone
 * and spend as much time there as possible and stay in the zone and this is
 * what's getting you the most points, but you're saying just as quickly as
 * possible get into the zone and then your game finishes -- but most of the
 * time you don't make enough of an impact for them to get back above 900, so
 * what's the point."*
 *
 * He was right twice. Paying per PRESS made the objective "arrive", which is
 * not a game and is over in two seconds; and a handful of presses cannot move
 * 300 points, so the honest outcome of playing well was still losing. Paying
 * per SECOND makes the objective "stay", which is the thing the meter is
 * actually good at, and it scales with the whole window instead of with how
 * many times a thumb moved.
 *
 * The press is now the CONTROL, not the score: the level decays, so holding the
 * green means tapping at about the cadence the decay sets (~350 ms). Too fast
 * and you leave the green out the top, and the points stop until you fall back.
 *
 * 58, not 52: quality is now 0 outside yellow, which took ~8 points off a solo
 * hold on a 600→900 gap. The extra 6/s puts a tracked hold back over the line
 * without paying anyone parked in the black.
 */
export const PUNCH_PUSH_PER_SEC = 58;
/**
 * How finely the dwell is integrated. FIXED, and shared by the client's
 * prediction and the coordinator's replay -- a step either side could disagree
 * on is a step that pays two different scores for the same thumb.
 */
export const PUNCH_PUSH_STEP_MS = 20;
/**
 * ★★★ THE WINDOW OPENS WITH THE METER ALREADY IN THE GREEN.
 *
 * Owner, twice, the second time with justified impatience: *"it's all going too
 * fast and I have to work too hard to get into the center. The game is really
 * not about staying in the center, the game is about GETTING there, and by the
 * time I get there the game is finished."*
 *
 * He was describing arithmetic, not a feeling. The level starts at 0, the target
 * is 0.68, one press is +0.10 and presses are debounced at 220 ms — so the climb
 * costs EIGHT presses and a second and a half at the theoretical floor, more in
 * a real hand, while the target drifts underneath it. Dwell scoring (the fix
 * before this one) changed how the remaining seconds were counted and left the
 * toll exactly where it was. The climb was never the game; it was a queue.
 *
 * So the meter opens ON the target. The first thing on screen is the marker
 * inside the green with the number already climbing, and the game from frame
 * one is the one the owner described: hold it there. Nothing has to be taught,
 * because nothing has to be reached.
 */
export const PUNCH_PUSH_START_AT_TARGET = true;
/**
 * ‼️HOLDING IS THE GAME, AND STOPPING MUST DROP YOU OUT.
 *
 * Owner, 2026-09-10: *"I just click it a couple of times and then I just stop
 * clicking it and it slowly moves to the left together with the ideal zone…
 * I'm at the perfect middle all the time automatically and it's still not
 * enough."* Slow decay plus slow drift made the needle ride the gold after
 * two taps. The window still opens ON the target (the climb is not the game);
 * after that the Focus bleed and the Focus wander run at full rate, so you
 * have to keep tapping to stay, and a hold that actually stays can still
 * close a last-chance gap.
 */
export const PUNCH_PUSH_DECAY_SCALE = 1;
export const PUNCH_PUSH_DRIFT_SCALE = 1;
/**
 * ‼️SUPERSEDED BY THE RATE ABOVE, kept because the Director still exposes it and
 * the old sweep is worth not repeating. It no longer decides anything: paying
 * per press was the mistake, not the size of the payment.
 */
export const PUNCH_PUSH_FULL = 24;
/**
 * Points per second the machine drags back, at the bottom of the gap.
 *
 * 12 with per-press scoring, 8 since the scoring became dwell. The rate above
 * moved with it: once the meter OPENS in the green there is no climb to pay for,
 * so the same 125/sec made every tier of play win and the mechanic stopped
 * discriminating at all. Swept across four grades of attention over a 300-point
 * gap, at rate 52 / bleed 8:
 *
 * | player (jitter, missed presses) | lands it alone |
 * |---|---|
 * | attentive (±60 ms, 5%)   | 22 / 24 |
 * | ordinary (±110 ms, 20%)  | 15 / 24 |
 * | distracted (±170 ms, 40%)|  6 / 24 |
 * | barely playing (±220 ms, 62%) | 4 / 24 |
 *
 * That spread IS the game: watching it wins, ignoring it does not. A rate that
 * makes every row win is not generous, it is a cutscene.
 */
export const PUNCH_PUSH_BLEED_PER_SEC = 8;
/** Added to the bleed once they are this far up — the last stretch is the fight. */
export const PUNCH_PUSH_BLEED_HIGH_ADD = 10;
export const PUNCH_PUSH_BLEED_HIGH_AT_01 = 0.68;
/**
 * Latches, as fractions of the gap. Passing one locks it: the room can lose
 * ground but never all of it, and gets three things to cheer instead of one.
 * Two latches on a 600→900 gap is 700 and 800, which is what the owner reads.
 */
export const PUNCH_PUSH_LATCHES_01 = [1 / 3, 2 / 3] as const;
/**
 * ‼️220 ms, NOT THE RESCUE'S 70 — AND THE TESTS FOUND OUT WHY.
 *
 * The old rescue debounced at 70 ms because there a tap WAS the score, so the
 * only thing to stop was an auto-clicker. Here a tap places a LEVEL, and 70 ms
 * let a hammerer walk the meter up through the green band in ten-centimetre
 * steps, bank a full grade on the way past, park in spill, wait for the decay,
 * and sweep it again. Measured, that beat a player holding the band 147 to 103
 * — the exact strategy this design claims to punish, winning.
 *
 * At 220 ms the sweep is gone: the equilibrium a continuous masher settles at
 * is ~1.19, well above the band, where the grade is zero. Holding near 0.75 —
 * which needs about one press every 350 ms — sits inside it. A press faster
 * than this is not a distinguishable aim, it is a stream.
 */
export const PUNCH_PUSH_TAP_COOLDOWN_MS = 220;
/**
 * ‼️MORE HANDS MAKE IT HARDER. Focus still widens with a crowd; the push does
 * not. Each extra person shrinks the green AND splits the dwell rate, so two
 * perfect helpers are not twice as strong as one. Owner: *"if you have more
 * one pusher you just gonna endlessly postpone the game."*
 */
export const PUNCH_PUSH_BAND_MIN = 0.028;
export const PUNCH_PUSH_CROWD_HARD = 0.55;
/** Each later last-chance of the same round. 0 is the first door. */
export const PUNCH_PUSH_ROUND_HARD = 0.7;
/** After this many spent saves, the round cannot be rescued again. */
export const PUNCH_PUSH_MAX_PER_ROUND = 3;
/** Late arrivals still count for this long — a pulse thrown on the buzzer. */
export const PUNCH_PUSH_GRACE_MS = 250;

/**
 * The gap this window is fighting over. `from` is the punch as scored, `to` is
 * the threshold it fell short of.
 */
export interface PunchPushGap {
  from: number;
  to: number;
}

/**
 * Where the green is, at this elapsed time. The ONE answer — the panel, the
 * client's prediction and the coordinator's replay all call this, so a slowed
 * drift can never be slowed in two of the three.
 */
export function punchPushTargetAt(elapsedMs: number): number {
  return punchFocusTargetAt(finite(elapsedMs) * PUNCH_PUSH_DRIFT_SCALE);
}

/**
 * THE PUSH'S OWN BAND — not the Focus one.
 *
 * Solo is the shipped 0.075. Each extra helper shrinks it. Each later last-chance
 * of the round shrinks it again. Never below `PUNCH_PUSH_BAND_MIN`.
 */
export function punchPushBandHalfWidth(people: number, rescueIndex = 0): number {
  const crowd = Math.max(1, Math.floor(finite(people, 1)));
  const round = Math.max(0, Math.floor(finite(rescueIndex)));
  const crowdScale = 1 / (1 + PUNCH_PUSH_CROWD_HARD * (crowd - 1));
  const roundScale = 1 / (1 + PUNCH_PUSH_ROUND_HARD * round);
  return Math.max(PUNCH_PUSH_BAND_MIN, PUNCH_FOCUS_BAND_01 * crowdScale * roundScale);
}

/**
 * Grade of one sample against the moving target.
 *
 * ‼️THE GREEN AND THE YELLOW ARE THE ONLY THING THAT PAY. A falloff tail used
 * to keep scoring in the black — at up to half rate, across a band wider than
 * the green itself — so letting the needle descend banked about as much as
 * holding the zone. Owner, 2026-09-10: "when I am outside of the zone the green
 * and the yellow zone just letting it descend it allows you to accumulate just
 * as many points as in the zone that's not supposed to happen."
 *
 * Same lesson as `punchFocusEarned`: hold nothing and you bank nothing.
 */
export function punchPushQuality01(
  level01: number,
  people: number,
  target01: number,
  rescueIndex = 0,
): number {
  const level = Math.max(0, finite(level01));
  const target = finite(target01, punchPushTargetAt(0));
  const green = punchPushBandHalfWidth(people, rescueIndex);
  const yellow = green + PUNCH_FOCUS_ZONE_MARGIN_01;
  const distance = Math.abs(level - target);
  if (distance <= green) return 1;
  if (distance <= yellow) {
    const across = (distance - green) / Math.max(1e-6, yellow - green);
    return 1 - (1 - PUNCH_FOCUS_EDGE_QUALITY_01) * across;
  }
  return 0;
}

/** Where the latches sit, in points. Sorted, de-duplicated, inside the gap. */
export function punchPushLatches(gap: PunchPushGap): number[] {
  const from = finite(gap?.from);
  const to = finite(gap?.to);
  if (!(to > from)) return [];
  const span = to - from;
  const out: number[] = [];
  for (const share of PUNCH_PUSH_LATCHES_01) {
    const at = Math.round(from + span * unit(share));
    if (at > from && at < to && !out.includes(at)) out.push(at);
  }
  return out.sort((a, b) => a - b);
}

/**
 * The highest latch this score has passed, or the starting score. Progress
 * below this cannot be bled away.
 */
export function punchPushFloor(score: number, gap: PunchPushGap): number {
  const from = finite(gap?.from);
  const to = finite(gap?.to);
  const at = finite(score, from);
  let floor = from;
  for (const latch of punchPushLatches(gap)) if (at >= latch) floor = latch;
  // ‼️ONCE THEY ARE OVER THE LINE THEY STAY THERE. The window keeps running so
  // helpers can keep scoring, but bleed cannot drag a save back under 900.
  if (to > from && at >= to) return to;
  return floor;
}

/** Points per second the machine is dragging back at this height. */
export function punchPushBleedPerSec(score: number, gap: PunchPushGap, base = PUNCH_PUSH_BLEED_PER_SEC): number {
  const from = finite(gap?.from);
  const to = finite(gap?.to);
  if (!(to > from)) return PUNCH_PUSH_BLEED_PER_SEC;
  const climbed = unit((finite(score, from) - from) / (to - from));
  return (
    Math.max(0, finite(base, PUNCH_PUSH_BLEED_PER_SEC)) +
    (climbed >= PUNCH_PUSH_BLEED_HIGH_AT_01 ? PUNCH_PUSH_BLEED_HIGH_ADD : 0)
  );
}

/**
 * One frame of the machine pulling back, clamped to the latch the room has
 * already banked. Pure, so the coordinator and every client agree on it.
 */
export function punchPushBleed(score: number, gap: PunchPushGap, dtMs: number, base = PUNCH_PUSH_BLEED_PER_SEC): number {
  const from = finite(gap?.from);
  const at = finite(score, from);
  const dt = Math.max(0, finite(dtMs)) / 1000;
  const floor = punchPushFloor(at, gap);
  return Math.max(floor, at - punchPushBleedPerSec(at, gap, base) * dt);
}

/** What one pulse is worth at this grade. Zero outside the ring pays nothing. */
export function punchPushGain(quality01: number, full = PUNCH_PUSH_FULL): number {
  return Math.max(0, finite(full, PUNCH_PUSH_FULL)) * unit(quality01);
}

/**
 * How hard this person is working, as a three-colour read. Gold is locked in
 * the green; live is the yellow fight; dead is outside and paying nothing.
 */
export type PunchPushBarTone = 'gold' | 'live' | 'dead'

export function punchPushBarTone(quality01: number): PunchPushBarTone {
  if (quality01 >= 0.999) return 'gold'
  if (quality01 > 0) return 'live'
  return 'dead'
}

/** What sits on top of the nametag column. */
export function punchPushBarLabel(gain: number, done = false, saved = false): string {
  const n = Math.max(0, Math.round(gain))
  if (done) {
    if (n <= 0) return saved ? 'IN' : '-'
    return saved ? `KEPT +${n}` : `+${n}`
  }
  return n > 0 ? `+${n}` : 'IN'
}

/**
 * The meter this pusher is holding at `elapsedMs`, reconstructed from taps.
 * The snapshot carries this so a body across the ring can wear the struggle
 * without cloning the HUD.
 */
export function punchPushLiveGrade(
  taps: readonly number[] | undefined,
  options: PunchPushReplayOptions & { elapsedMs: number },
): { quality01: number; level01: number } {
  const elapsed = Math.max(0, finite(options?.elapsedMs))
  const people = Math.max(1, Math.floor(finite(options?.people, 1)))
  const rescueIndex = Math.max(0, Math.floor(finite(options?.rescueIndex)))
  const phase0 = finite(options?.phase0)
  const replay = punchPushReplay(taps, { ...options, windowMs: elapsed, people, rescueIndex })
  return {
    quality01: punchPushQuality01(
      replay.level,
      people,
      punchPushTargetAt(phase0 + elapsed),
      rescueIndex,
    ),
    level01: replay.level,
  }
}

export interface PunchPushReplayOptions {
  /** The drift phase at the instant the window opened. Shared, never a clock. */
  phase0: number;
  /** How many spectators accepted. Sets the band's width — see the header. */
  people: number;
  windowMs?: number;
  full?: number;
  /** Points per second at full grade. Director-tunable. */
  perSec?: number;
  /** Points per second the machine drags back. Director-tunable. */
  bleedPerSec?: number;
  /** 0 = first last-chance of this round. Each later door is a harder one. */
  rescueIndex?: number;
}

export interface PunchPushReplayResult {
  /** Points this pusher is owed. */
  gain: number;
  /** Presses that counted, after the debounce and the window bounds. */
  pulses: number;
  /** Milliseconds held at full grade -- the number the card reports. */
  heldMs: number;
  /** Their best single grade, 0..1 — the failure tell, and the card row. */
  best01: number;
  /** Where their meter is at the end of the replayed span. Live bars read this. */
  level: number;
  /** Each counted pulse and what it was worth, so the settle can integrate the drag between them. */
  pulseAt: Array<{ at: number; gain: number }>;
}

/**
 * ‼️REPLAY A PUSHER'S WINDOW FROM THEIR TAP TIMES ALONE.
 *
 * The level is not on the wire and never needs to be: it is fully determined by
 * the tap times, because `punchFocusDecay` between presses and `punchFocusTap`
 * at each press are both pure. So the coordinator reconstructs exactly the
 * meter the client drew, grades every pulse against the drift target it can
 * derive from the shared phase, and arrives at a number it computed rather than
 * one it was handed.
 *
 * SORTS FIRST — see the header. The debounce compares each press to the one
 * before it, so an unordered list walks it backwards, and the level integrates
 * differently for the same multiset of times.
 */
export function punchPushReplay(
  tapElapsedsMs: readonly number[] | undefined,
  options: PunchPushReplayOptions,
): PunchPushReplayResult {
  const windowMs = Math.max(0, finite(options?.windowMs, PUNCH_PUSH_WINDOW_MS));
  const full = Math.max(0, finite(options?.full, PUNCH_PUSH_FULL));
  const phase0 = finite(options?.phase0);
  const people = Math.max(1, Math.floor(finite(options?.people, 1)));
  const rescueIndex = Math.max(0, Math.floor(finite(options?.rescueIndex)));
  const crowdTax = people;
  const roundTax = 1 + PUNCH_PUSH_ROUND_HARD * rescueIndex;

  const taps = (tapElapsedsMs ?? [])
    .filter((at) => Number.isFinite(at))
    .slice()
    .sort((a, b) => a - b);

  // Only the presses a thumb could actually have made, in the order it made them.
  const presses: number[] = [];
  let previous = -Infinity;
  for (const at of taps) {
    if (at < 0 || at > windowMs + PUNCH_PUSH_GRACE_MS) continue;
    if (at - previous < PUNCH_PUSH_TAP_COOLDOWN_MS) continue;
    previous = at;
    presses.push(at);
  }

  /**
   * ‼️WALK THE WHOLE WINDOW, NOT THE PRESSES. The score is the area under the
   * grade curve: every step in the green pays full, yellow pays a grade, and
   * the black pays nothing. The presses only move the level.
   *
   * The step is fixed (`PUNCH_PUSH_STEP_MS`) so the client's live meter and the
   * coordinator's replay integrate the identical curve. Nothing here reads a
   * frame time, a clock, or a message arrival.
   */
  // ★★★ OPEN IN THE GREEN. See PUNCH_PUSH_START_AT_TARGET.
  let level = PUNCH_PUSH_START_AT_TARGET ? punchFocusTargetAt(phase0 * PUNCH_PUSH_DRIFT_SCALE) : 0;
  let gain = 0;
  let best01 = 0;
  let heldMs = 0;
  let next = 0;
  const pulseAt: Array<{ at: number; gain: number }> = [];
  const rate = Math.max(0, finite(options?.perSec, PUNCH_PUSH_PER_SEC)) / crowdTax / roundTax;

  for (let t = 0; t < windowMs; t += PUNCH_PUSH_STEP_MS) {
    const step = Math.min(PUNCH_PUSH_STEP_MS, windowMs - t);
    level = punchFocusDecay(level, step, PUNCH_PUSH_DECAY_SCALE * punchFocusGustAt(phase0 + t));
    if (level <= PUNCH_FOCUS_FLOOR_01) level = 0;
    // Any presses that land inside this step lift the level before it is graded.
    while (next < presses.length && presses[next]! <= t + step) {
      level = Math.min(PUNCH_FOCUS_CEILING, punchFocusTap(level));
      next += 1;
    }
    const quality = punchPushQuality01(level, people, punchPushTargetAt(phase0 + t + step), rescueIndex);
    if (quality <= 0) continue;
    const worth = rate * quality * (step / 1000);
    gain += worth;
    best01 = Math.max(best01, quality);
    if (quality >= 0.999) heldMs += step;
    // Banked at the END of the step, so the settle's bleed integration sees the
    // points arriving across the window rather than all at the first press.
    pulseAt.push({ at: t + step, gain: worth });
  }

  return { gain, pulses: presses.length, best01, level, heldMs, pulseAt };
}

/**
 * The whole window settled: every pusher replayed, the bleed integrated between
 * their pulses, latches honoured. The coordinator's answer to "did the room get
 * them there".
 *
 * ‼️THE BLEED IS WALKED OVER THE PULSE TIMES, NOT APPROXIMATED OVER THE WINDOW.
 * The first draft applied one lump of drag computed at `from + pushed / 2`,
 * to keep the result independent of frame timing. It was independent and it was
 * wrong in a way that inverted the design: a bigger push implied a higher
 * average height, which selected the heavy near-the-top bleed rate, which taxed
 * the good players hardest. A solo player who tracked the drift perfectly
 * finished on 800 of a 900 target — the ★★★ promise that one person can always
 * get there, broken by an approximation.
 *
 * Walking the events is exact AND frame-independent, because the steps are the
 * tap times themselves — data every machine has, in an order every machine
 * sorts the same way. There was never a reason to approximate.
 */
export interface PunchPushSettleEntry {
  userId: string;
  name?: string;
  taps?: readonly number[];
}

export interface PunchPushSettlement {
  /** Where the puncher's score ended up. */
  score: number;
  /** True when the room got them over the line. */
  saved: boolean;
  /** When they crossed, in elapsed ms, or undefined if they never did. */
  savedAt?: number;
  /** Highest latch banked, or `gap.from`. */
  floor: number;
  /** Per-pusher credit, biggest first — the cabinet names these people. */
  pushers: Array<{
    userId: string
    name?: string
    gain: number
    pulses: number
    best01: number
    heldMs: number
    /** Where their meter is RIGHT NOW, 0…1. Head bars and the ledger read this. */
    quality01: number
    level01: number
  }>;
}

export function punchPushSettle(
  entries: readonly PunchPushSettleEntry[] | undefined,
  gap: PunchPushGap,
  options: PunchPushReplayOptions & { elapsedMs?: number },
): PunchPushSettlement {
  const from = finite(gap?.from);
  const to = finite(gap?.to);
  const windowMs = Math.max(0, finite(options?.windowMs, PUNCH_PUSH_WINDOW_MS));
  const elapsed = Math.max(0, Math.min(windowMs, finite(options?.elapsedMs, windowMs)));
  const list = entries ?? [];
  const people = Math.max(1, Math.floor(finite(options?.people, list.length || 1)));
  const rescueIndex = Math.max(0, Math.floor(finite(options?.rescueIndex)));
  const phase0 = finite(options?.phase0);
  const bleedBase =
    Math.max(0, finite(options?.bleedPerSec, PUNCH_PUSH_BLEED_PER_SEC)) *
    (1 + 0.4 * (people - 1)) *
    (1 + PUNCH_PUSH_ROUND_HARD * rescueIndex);

  // Every pusher's window replayed, and their pulses collected as timed events
  // so the drag between them can be integrated rather than guessed at.
  //
  // ‼️REPLAY TO `elapsed`, NOT THE WHOLE WINDOW. Walking the remaining seconds
  // would put each body at the meter they would hold if they never tapped
  // again — which is dead — so a live head-bar would never show the struggle.
  const events: Array<{ at: number; gain: number; userId: string }> = [];
  const draft = list
    .map((entry) => {
      const userId = String(entry?.userId ?? '');
      const replay = punchPushReplay(entry?.taps, { ...options, people, windowMs: elapsed });
      if (userId.length > 0) {
        for (const pulse of replay.pulseAt) events.push({ ...pulse, userId });
      }
      return {
        userId,
        name: entry?.name,
        // Raw dwell kept only long enough to cut at the save — see below.
        gain: replay.gain,
        pulses: replay.pulses,
        best01: replay.best01,
        heldMs: replay.heldMs,
        quality01: punchPushQuality01(
          replay.level,
          people,
          punchPushTargetAt(phase0 + elapsed),
          rescueIndex,
        ),
        level01: replay.level,
      };
    })
    .filter((pusher) => pusher.userId.length > 0);

  events.sort((a, b) => a.at - b.at);

  let score = from;
  let last = 0;
  let savedAt: number | undefined;
  for (const event of events) {
    if (event.at > elapsed) break;
    score = punchPushBleed(score, gap, event.at - last, bleedBase);
    last = event.at;
    score = score + event.gain;
    // ‼️THE WINDOW KEEPS RUNNING AFTER THE SAVE. Owner: *"it stops you out
    // before your time runs out… you wanna get as many points as you can."*
    // Crossing 900 is the save, not the buzzer. Helpers keep holding until the
    // clock says so, and the extra climb is their score.
    if (savedAt === undefined && to > from && score >= to) savedAt = event.at;
  }
  if (savedAt === undefined) score = punchPushBleed(score, gap, elapsed - last, bleedBase);
  else score = Math.max(to, punchPushBleed(score, gap, elapsed - last, bleedBase));

  /**
   * ‼️CREDIT RUNS TO THE BUZZER, NOT TO THE SAVE.
   *
   * Crossing 900 used to cut the dwell and clamp the punch. Helpers then watched
   * the clock die with time still on it. The room net is now the whole climb —
   * including anything past 900 — and each pusher's share is of that net.
   */
  const cutAt = elapsed;
  const rawByUser = new Map<string, number>();
  for (const event of events) {
    if (event.at > cutAt) continue;
    rawByUser.set(event.userId, (rawByUser.get(event.userId) ?? 0) + event.gain);
  }
  const roomNet = Math.max(0, Math.round(score - from));
  const rawTotal = [...rawByUser.values()].reduce((sum, n) => sum + n, 0);
  const attributed = new Map<string, number>();
  if (rawTotal <= 0 || roomNet <= 0) {
    for (const [id] of rawByUser) attributed.set(id, 0);
  } else {
    // Largest-remainder so integer credits sum exactly to the room net.
    const rows = [...rawByUser.entries()].map(([userId, raw]) => {
      const exact = (roomNet * raw) / rawTotal;
      const floor = Math.floor(exact);
      return { userId, floor, frac: exact - floor };
    });
    let left = roomNet - rows.reduce((sum, row) => sum + row.floor, 0);
    rows.sort((a, b) => b.frac - a.frac || a.userId.localeCompare(b.userId));
    for (const row of rows) {
      const extra = left > 0 ? 1 : 0;
      if (extra) left -= 1;
      attributed.set(row.userId, row.floor + extra);
    }
  }

  const pushers = draft
    .map((pusher) => ({
      ...pusher,
      gain: attributed.get(pusher.userId) ?? 0,
    }))
    .sort((a, b) => b.gain - a.gain || a.userId.localeCompare(b.userId));

  return {
    score,
    saved: savedAt !== undefined,
    savedAt,
    floor: punchPushFloor(score, gap),
    pushers,
  };
}

/**
 * The line the room is shown while it plays. At most four words, at the size of
 * the countdown — the lesson of the rescue that came before this one, where the
 * only instruction was fifteen pixels of cyan under a lane nobody could read.
 *
 * ‼️THE VERB IS THE ONE THIS DEVICE HAS. A phone has no E. `touch` is the
 * renderer's own `isCompact()`, not a guess.
 */
export type PunchPushPhase = 'ask' | 'live' | 'high' | 'perfect' | 'out' | 'won' | 'lost' | 'watching';

/** Crowd shouts while the needle is in the green. Four words or fewer, no pronouns. */
export const PUNCH_PUSH_SHOUTS = ['GO GO GO', 'HOLD IT', 'YEAH YEAH', 'STAY STAY'] as const;
const PUNCH_PUSH_SHOUT_MS = 700;

export function punchPushShout(nowMs: number): string {
  const i = Math.floor(Math.max(0, finite(nowMs)) / PUNCH_PUSH_SHOUT_MS) % PUNCH_PUSH_SHOUTS.length;
  return PUNCH_PUSH_SHOUTS[i]!;
}

export function punchPushOrder(phase: PunchPushPhase, touch: boolean): string {
  switch (phase) {
    // ‼️NEVER GENDER THE PLAYER. A punch is dealt to whoever walks up, and these
    // are NPCs today and people tomorrow. Second person and singular "they"
    // carry the same energy at the same length -- see the crowd's voice pool,
    // which had to be cleaned of exactly this twice.
    case 'ask':
      return 'HELP THEM?';
    // Not "TOO HIGH — LET IT FALL": the diagnosis costs two words the size of a
    // countdown can't afford, and the player can SEE they are too high. Only
    // the instruction is worth the space.
    case 'high':
      return 'LET IT FALL';
    case 'perfect':
      return 'HOLD IT';
    case 'out':
      return 'GET BACK IN';
    case 'won':
      return 'OVER THE LINE';
    case 'lost':
      return 'CAME UP SHORT';
    // ‼️A PHASE THAT CANNOT ACT STILL GETS A LINE. The puncher watches their own
    // score being pushed by strangers and has nothing to press; an empty screen
    // is exactly what read as "no instructions" the last three times.
    case 'watching':
      return 'THE ROOM IS PUSHING';
    case 'live':
    default:
      // A phone has no E. The disc in the punch-button slot is the control;
      // desktop E is a shortcut the copy does not have to advertise.
      return 'TAP HELP';
  }
}

/** How far the room still has to climb. The rescue meter is this gap, not 0–900. */
export function punchHelpGap(from: number, to: number, score = from): {
  needed: number
  raised: number
  short: number
  start: number
  goal: number
  now: number
} {
  const start = Math.max(0, Math.round(finite(from)))
  const goal = Math.max(start, Math.round(finite(to, PUNCH_PUSH_THRESHOLD)))
  const now = Math.max(start, Math.round(finite(score, start)))
  const needed = Math.max(0, goal - start)
  const raised = Math.max(0, Math.min(needed, now - start))
  const short = Math.max(0, goal - now)
  return { needed, raised, short, start, goal, now }
}

function punchHelpFirstName(raw: string): string {
  const token = String(raw ?? '').replace(/^THE\s+/i, '').trim().split(/\s+/)[0] || 'PLAYER'
  return token.slice(0, 12)
}

/** Pre-rescue prompt: who, the score they have, and the missing amount. */
export function punchHelpAskCopy(input: {
  name: string
  from: number
  to: number
}): { title: string; score: string; needed: string; missing: number } {
  const gap = punchHelpGap(input.from, input.to, input.from)
  const who = punchHelpFirstName(input.name).toUpperCase()
  return {
    title: `${who} NEEDS HELP`,
    score: `${gap.start} / ${gap.goal}`,
    needed: `${gap.needed} NEEDED`,
    missing: gap.needed,
  }
}

/**
 * Compact live chips for people actually pushing. YOU is pinned into the visible
 * set so a helper never has to hunt for their own number; extra names collapse.
 */
export function punchHelpChipSet(
  rows: Array<{ name: string; gain: number; mine?: boolean }>,
  limit = 3,
): { chips: Array<{ label: string; gain: number; mine: boolean }>; more: number } {
  const cap = Math.max(1, Math.round(finite(limit, 3)))
  const cleaned = (rows ?? []).map((row) => ({
    name: String(row.name || 'PLAYER'),
    gain: Math.max(0, Math.round(finite(row.gain))),
    mine: row.mine === true,
  }))
  const sorted = [...cleaned].sort((a, b) => b.gain - a.gain)
  const mine = cleaned.find((row) => row.mine)
  let shown = sorted.slice(0, cap)
  if (mine && !shown.some((row) => row.mine)) {
    shown = [...shown.slice(0, Math.max(0, cap - 1)), mine]
  }
  const more = Math.max(0, cleaned.length - shown.length)
  return {
    chips: shown.map((row) => ({
      label: row.mine ? 'You' : punchHelpFirstName(row.name),
      gain: row.gain,
      mine: row.mine,
    })),
    more,
  }
}

/**
 * One glance at the end. The missing amount is the only number on a miss;
 * a save is the word SAVED, with the filled gap as optional small type.
 */
export function punchHelpResultCopy(input: {
  saved: boolean
  score: number
  from: number
  to: number
  keptName: string
}): { badge: string; total: string; qualifier: string; stats: string } {
  const gap = punchHelpGap(input.from, input.to, input.score)
  if (input.saved) {
    return {
      badge: 'MISSION SUCCESS',
      total: 'SAVED',
      qualifier: 'THANKS FOR HELPING',
      stats: `${gap.needed} / ${gap.needed}`,
    }
  }
  return {
    badge: 'MISSION FAILED',
    total: `${gap.short} SHORT`,
    qualifier: 'THANKS FOR TRYING',
    stats: '',
  }
}
