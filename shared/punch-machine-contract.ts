import { normalizePunchProfile, punchProfileSpeed, type PunchGameProfile } from './punch-game-profile';
/** Portable contract for the placeable arcade punch-machine plugin. */

export const PUNCH_MACHINE_PLUGIN_ID = "swissverse.punch-machine" as const;
export const PUNCH_MACHINE_MODEL_SRC = "models/punch-machine.glb" as const;
export const PUNCH_MACHINE_WIDTH_M = 2.145;
export const PUNCH_MACHINE_DEPTH_M = 3.681;
export const PUNCH_MACHINE_HEIGHT_M = 4.067;
/** Aligned with the ideal charge beat so full power and the timing window can coincide. */
export const PUNCH_TIMING_TARGET_01 = 0.559322;
export const PUNCH_TIMING_SWEET_WIDTH_01 = 0.13;
export const PUNCH_TIMING_PERIOD_MS = 1_180;
/**
 * Explorer paints the reticle a beat after the engine sampled the hold, and
 * pointer-up lands on the next tick. Without this lead the cyan dot you
 * release on is already ~one sweet-band past the gold — which is why letting
 * go on the LEFT edge of the hoop paid like a bullseye.
 *
 * Equal to one sweet-band of travel at speed 1. The HUD reads this; scoring
 * still uses raw held milliseconds.
 */
export const PUNCH_TIMING_DISPLAY_LEAD_MS = Math.round(
  (PUNCH_TIMING_PERIOD_MS / 2) * PUNCH_TIMING_SWEET_WIDTH_01,
);

export function punchTimingDisplayElapsedMs(heldMs: number, live: boolean): number {
  const held = Math.max(0, Number.isFinite(heldMs) ? heldMs : 0);
  return live ? held + PUNCH_TIMING_DISPLAY_LEAD_MS : held;
}

import {
  defaultPunchBoardStoreConfig,
  normalizePunchBoardStoreConfig,
  type PunchBoardStoreConfig,
} from "./punch-board-store";

export type PunchMachineMode = "solo" | "competition";
export type PunchMachineBundleProfile = "standard" | "compact";

export interface PunchLeaderboardEntry {
  supporters?: Array<{
    userId: string;
    name: string;
    points: number;
    saves: number;
    /** Most recent player this spectator rescued, for contributor recognition. */
    lastSavedName?: string;
    lastSavedUserId?: string;
    /**
     * Points the rescued player scored after this spectator saved them.
     * Grows for as long as the extra turns last.
     */
    unlocked?: number;
    /** Circle score, summed over the punches this person boosted (see `punchCircleScore`). */
    circle?: number;
    /** Their best single-punch circle score. */
    bestCircle?: number;
  }>;
  userId: string;
  name: string;
  score: number;
  achievedAt: number;
}

/**
 * ONE SPECTATOR'S SHARE OF ONE PUNCH, in points, with their name on it.
 *
 * ‼️THE ATTRIBUTION IS THE FEATURE. The crowd used to collapse into a single
 * signed percentage — "+6% FROM THE CROWD" — and a person who had just spent a
 * whole wind-up holding the beat could not tell whether any of it was theirs.
 * A booster has to be able to read the result card and think *I added 48 points
 * to that punch*, so the payout is a LIST and the total is derived from it,
 * never the other way round.
 */
export interface PunchBoostContribution {
  userId: string;
  /** The public display name. Never an account identifier. */
  name: string;
  /** What this person actually added to the punch, in score points. */
  points: number;
  /** How well they were holding the beat when it landed, 0..1. */
  quality01: number;
  /**
   * Their personal multiplier. 1 for an ordinary Boost; the hook every future
   * extraordinary Boost hangs off — perfect timing, a hidden emote, standing on
   * an outer cloud. Carried per person and never assumed equal, so the day a
   * secret exists the ledger and the card already have somewhere to put it.
   */
  multiplier: number;
  /**
   * A decorative body, not a person. NPC points are capped so they can never be
   * the reason High Ground breaks — see `punchAwardCrowdBoost`.
   */
  npc: boolean;
  /**
   * THE CIRCLE — this person's own 0..999 for the wind-up (see
   * `punchCircleScore`). Optional on the wire so an older coordinator's ledger
   * still reads; absent means "not scored", never zero.
   */
  circleScore?: number;
}

/** Who boosted best on this punch, by circle score. Humans only. */
export interface PunchCircleBest {
  userId: string;
  name: string;
  score: number;
}

export interface PunchAttemptBreakdown {
  stancePower?: number;
  heldMs: number;
  power01: number;
  timingMarker01: number;
  timing01: number;
  accuracy01: number;
  /** What the three skill channels earned on their own, before the crowd. */
  baseScore: number;
  /**
   * THE PUNCHER'S OWN KARMA, spent on this punch — what they earned in somebody
   * else's circle, coming back. `karmaScore` is `skillScore` multiplied by it,
   * still clamped at `maxScore`; `baseScore` is that number, so every existing
   * reader keeps meaning "the punch before the crowd".
   */
  skillScore: number;
  karmaMultiplier: number;
  karmaSpent: number;
  /**
   * ‼️THE LEDGER — WHERE THE SCORE CAME FROM AND WHERE IT WENT.
   *
   * Owner, 2026-09-05: *"when we get minus percentages it needs to show in the
   * final calculation where the score went and where it came from."* Nothing in
   * this pipeline can go negative — every step is clamped at zero and karma
   * never falls below x1 — so the minus the owner is seeing is not a penalty.
   * It is score being SILENTLY TAKEN AWAY in three places that the result card
   * had no line for, plus a base punch that arrived as one opaque number with
   * no account of which channel cost it.
   *
   * The six fields below are that account. Three say what a perfect channel
   * would have been worth (`missed*`), three say what was actually removed
   * (`karmaClipped`, `crowdTrimmed`) or added (`karmaGain`) between the skill
   * score and the number on the cabinet.
   *
   * ‼️THE `missed*` TRIO DOES NOT SUM TO ANYTHING, and the card must never
   * present it as if it did. Quality is squared before it becomes points, so
   * the channels are not independent: each figure is the MARGINAL value of
   * fixing that one channel and leaving the other two exactly as they were —
   * which is the only question a player actually asks of this list ("what would
   * landing the timing have been worth?"). Add them together and you get a
   * number that means nothing.
   */
  missedPower: number;
  missedTiming: number;
  missedAim: number;
  /**
   * What karma ADDED (`baseScore - skillScore`), and what the `maxScore` ceiling
   * took straight back off it. The card printed `YOUR KARMA x1.35` beside a
   * punch that never received x1.35 because the clamp ate the top of it, so the
   * arithmetic on screen did not add up and the player was right not to trust it.
   */
  karmaGain: number;
  karmaClipped: number;
  /**
   * What a poor stance took off the karma punch — `baseScore` is already net of
   * it, so the card needs this to make FINAL add up. A real deduction, unlike
   * the `missed` trio above, and the only one in the whole pipeline.
   */
  stanceLost: number;
  /**
   * How much the crowd widened the timing window for this punch, 0..1. Derived
   * from the ledger below — see `punchCrowdAssist01`.
   */
  crowdAssist01: number;
  /** Every spectator who Boosted this punch, and what each one added. */
  boosts: PunchBoostContribution[];
  /** The sum of the list above. Kept beside it so no reader has to re-add it. */
  crowdBoost: number;
  /** The human half of that sum — the number the threshold is tested against. */
  humanBoost: number;
  /**
   * ‼️WHAT THE ROOM OFFERED AND THE CAPS REFUSED — `PUNCH_BOOST_TOTAL_MAX`
   * cutting a contributor short and dropping everyone behind them, plus the NPC
   * headroom clamp. Without this line a spectator who worked the whole wind-up
   * simply VANISHED from the card, which is the exact opposite of the mechanic.
   */
  crowdTrimmed: number;
  /** baseScore + crowdBoost. */
  score: number;
  /** Did this punch cross `PUNCH_HIGH_GROUND_THRESHOLD`? */
  highGround: boolean;
  /** Which band it landed in, and which event was drawn. Null below the line. */
  highGroundTier: string | null;
  highGroundEvent: string | null;
  /** The best booster of this punch by circle score, or null in an empty room. */
  circleBest: PunchCircleBest | null;
  /**
   * PREPARATION: the Focus this punch consumed to reach the streak threshold.
   * Zero when the raw punch made it on its own, or when the stored Focus was
   * not enough (Focus is never spent in part). See `punchFocusRescue`.
   */
  focusUsed?: number;
}

/* ------------------------------------------------------------------------ *
 * PREPARATION — what a QUEUED player builds for their OWN next turn.
 * ------------------------------------------------------------------------ *
 *
 * 2026-09-06, owner's final waiting-game design. Two mechanics, one state per
 * player, authoritative on the coordinator and replicated on the snapshot:
 *
 *   FOCUS     0..100, earned through the tap meter by players IN THE QUEUE
 *             (waiting or up), by skill — quality in the green, faster inside
 *             the gold ring. Spent automatically, and only by the minimum
 *             needed, to lift a punch that fell short of the streak threshold
 *             up to it. Never spent in part; never adds to a punch that made it.
 *   MOMENTUM  ready / inactive. Earned by beating a regular in the boxing
 *             interaction once Focus is full. Arms the golden ball after the
 *             player's FIRST 900+ of the turn instead of the third; consumed
 *             the punch it arms.
 *
 * Nothing here helps the current competitor. The meter's circles still fly to
 * the machine: the player is storing Focus in it for themselves.
 */
export interface PunchPrepEntry {
  userId: string;
  name: string;
  /** Stored Focus, 0..PUNCH_PREP_FOCUS_MAX. */
  focus: number;
  momentumReady: boolean;
  /** When this player last left the queue (0 = in it). Cleared after the grace. */
  leftQueueAt: number;
}
export const PUNCH_PREP_FOCUS_MAX = 100;
/**
 * ‼️RETUNED 2026-09-06 after the first night: "getting 23 percentage points while
 * focusing like crazy, you will never reach 100 — this needs to be much easier."
 * Full green fills it in ~17 s now, the ring in ~8; and time inside the yellow
 * zone pays 40% too, so a player who is on the meter but not centred still
 * climbs. Mashing (overshoot past the zone) still earns nothing.
 */
/**
 * ‼️TWENTY, AND EARNED THROUGH THE WHOLE TURN.
 *
 * Owner, 2026-09-07, twice. First: "getting like two out of a hundred while
 * focusing like crazy — it needs to be ten times as easy." Then, on twelve:
 * "you accumulate it relatively fast, so that before your next turn you have a
 * chance to get the hundred, so you can actually use it and save yourself a
 * couple of times and be more inspired to do it again."
 *
 * Two things had made it slow, and both are gone. The rate was six; and the
 * coordinator only banked while the puncher was winding up — a few seconds out
 * of every punch — so most of a spectator's work paid nothing at all. Now a
 * queued player banks for as long as they hold the green, through the whole of
 * somebody else's turn, at twenty a second (forty in the gold sliver, twelve in
 * the outer zone). A hundred is five seconds of perfect green, and perfect is
 * not what anybody holds — call it fifteen of ordinary play, inside one turn,
 * which is exactly the promise above.
 *
 * A hundred banked is two rescues of a fifty-point gap, which is the "save
 * yourself a couple of times" half of the same sentence.
 */
export const PUNCH_PREP_FOCUS_PER_SEC = 20;
export const PUNCH_PREP_ZONE_SHARE = 0.6;
/** How long Focus and Momentum survive outside the queue — a fall, a cloud, a knock-back. */
export const PUNCH_PREP_GRACE_MS = 60_000;

/**
 * Focus earned over one tick of the meter. Zero outside the green's grade.
 *
 * ‼️THE GREEN IS THE ONLY THING THAT PAYS. `inZone` used to raise a FLOOR here --
 * `Math.max(quality01, 0.6)` -- so anywhere inside the outer ring banked 60% of
 * the full rate flat, no matter what the bar was doing. The meter filled while
 * the bar fell, while it drifted, while the player did nothing at all, and the
 * one skill in the control paid for none of it. Owner, 2026-09-07: "the bar,
 * it's filling up not when you're hitting the center, it's filling up when
 * you're moving downwards or outside of the zone, it's broken completely."
 *
 * The outer ring is a BONUS on a grade that was earned, never a substitute for
 * one. Hold nothing and you bank nothing.
 */
export function punchFocusEarned(dtMs: number, quality01: number, karma01: number, inZone = false): number {
  const dt = Math.max(0, Number.isFinite(dtMs) ? dtMs : 0) / 1000;
  const q = unit(quality01);
  if (q <= 0) return 0;
  const ring = inZone ? 1 + PUNCH_PREP_ZONE_SHARE : 1;
  return dt * PUNCH_PREP_FOCUS_PER_SEC * q * ring * (1 + unit(karma01));
}

/**
 * How many people the island takes at once — the DOOR is what enforces it
 * ([[gate-checks-at-the-door]]); the game itself has no punch cap. Said here so
 * the HUD can print "PLAYERS 1 OF 4" without inventing a second number.
 */
export const PUNCH_PLAYERS_MAX = 4;
/** What one rescue costs. A full bank of 100 is two of them. */
export const PUNCH_FOCUS_RESCUE_COST = 50;
/** The weakest punch a rescue will still carry to the threshold. Under it, the streak was not lost — it was thrown. */
export const PUNCH_FOCUS_RESCUE_FLOOR = 500;
/**
 * The rescue: lift a short punch to the streak threshold with stored Focus.
 * Only when there IS a streak to protect.
 *
 * ‼️IT USED TO PAY THE GAP POINT FOR POINT, which meant a bank of 100 could
 * only ever save an 800-899 — and a 763, the punch that actually ends streaks,
 * was left to die with a full bank beside it. Owner, 2026-09-07, after a
 * 354,069 round ended on exactly that: "I had 100 percent focus, it never
 * rescued me." He was right, and the label had promised him otherwise.
 *
 * A rescue is a flat price now. Fifty covers any punch from 500 up; a hundred
 * is the two saves the earning doc promised. Under 500 nothing is spent: that
 * was not a short punch, it was a miss, and buying it would make the meter
 * the game instead of the bag.
 */
export function punchFocusRescue(
  score: number,
  focus: number,
  priorStreak: number,
  threshold: number,
): { score: number; used: number } {
  const raw = Math.max(0, Math.round(Number(score) || 0));
  const bank = Math.max(0, Number(focus) || 0);
  if (priorStreak <= 0 || raw >= threshold) return { score: raw, used: 0 };
  if (raw < PUNCH_FOCUS_RESCUE_FLOOR || bank < PUNCH_FOCUS_RESCUE_COST) return { score: raw, used: 0 };
  return { score: threshold, used: PUNCH_FOCUS_RESCUE_COST };
}

/**
 * THE CROWD'S SHARE — spectator focus.
 *
 * Watching is not participating, and a deck full of people with nothing to do
 * is a deck that empties. So every human on the island who is NOT holding the
 * bag can MEDITATE for whoever is: tap the focus key, hold a steady rhythm, and
 * the puncher's next result is worth up to ten per cent more.
 *
 * It is deliberately a BALANCE, not a mash. One tap adds a fixed impulse; the
 * level bleeds away on its own. The healthy band is narrower than a single
 * impulse, so one person alone cannot sit inside it — they oscillate through it
 * and average out somewhere near the edge. Two things fix that, and both of
 * them are other people:
 *
 *   1. The payout reads the crowd's MEAN. Independent oscillators cancel, so
 *      the average of four wobbles half as far as any one of them.
 *   2. The band itself widens per meditator, because a crowd breathing together
 *      deserves an easier target than a lone monk.
 *
 * That is the whole social design: alone it is a struggle worth a few per cent,
 * together it is comfortably the full ten. Every constant lives here so the
 * spectator's own predicted meter, the coordinator's authoritative one and the
 * tests all move identically.
 */
export const PUNCH_FOCUS_MAX_BONUS_01 = 0.1;
/** How far one tap pushes the meter. Wider than the solo band, on purpose. */
/**
 * ‼️HALVED 2026-09-06. Owner: *"the steps for each press are relatively large…
 * clicking twice takes you out of the range in one direction and clicking only
 * once doesn't take you far enough."* A tap is 0.1 now, the bleed is retuned so
 * ~2.5 taps a second still rests on the still point, and the ring shrank with
 * it (see PUNCH_FOCUS_KARMA_BAND_01) so a metronome cannot sit in it.
 */
export const PUNCH_FOCUS_TAP_IMPULSE = 0.1;
/**
 * The bleed, as an EXPONENTIAL rate per second — not a flat subtraction.
 *
 * This is the difference between a game and a broomstick. Under a flat bleed
 * the meter is a pure integrator: only one exact tap interval holds ANY level,
 * every other tempo walks off to zero or to the ceiling and stays there, and no
 * amount of averaging saves a crowd whose members have all drifted to a rail.
 * Under an exponential bleed each tempo has its OWN stable resting level and
 * the meter self-corrects toward it, so a tempo error costs you position rather
 * than the whole run — and independent wobbles genuinely cancel in the mean.
 *
 * It is also exactly frame-rate independent (two half-steps compose into one
 * whole step), which is what lets a client at 60 fps and a coordinator ticking
 * on its own schedule agree about the same meter.
 *
 * At this rate the resting place for a tap every ~0.5 s is the target below —
 * two taps a second, comfortably above the tap cooldown.
 */
export const PUNCH_FOCUS_DECAY_RATE = 0.4;
/** Below this the meter is simply off; exponentials never actually reach zero. */
export const PUNCH_FOCUS_FLOOR_01 = 0.02;
/** Mashing parks you up here, far outside any band — overshoot is a real loss. */
export const PUNCH_FOCUS_CEILING = 1.35;
/** The still point the crowd is trying to hold. */
export const PUNCH_FOCUS_TARGET_01 = 0.68;
/**
 * Half-width of the healthy band with exactly one meditator — deliberately
 * NARROWER than half a tap, so even a perfect metronome falls out of it on
 * every cycle and a lone spectator can never quite own the full ten per cent.
 */
export const PUNCH_FOCUS_BAND_01 = 0.075;
/** Every extra meditator loosens it by this much. */
export const PUNCH_FOCUS_BAND_PER_PERSON = 0.045;
export const PUNCH_FOCUS_BAND_MAX = 0.26;
/**
 * THE OUTER RING — the yellow half of the target, outside the green band.
 *
 * The first version of this control showed ONE band, and it was narrower than a
 * single tap: a spectator watched a bar shoot straight through a sliver and out
 * the far side, with no way to tell whether being near it was worth anything.
 * The reading was "I missed", every cycle, forever.
 *
 * So the target is two rings now. GREEN is the same band as before — the still
 * point, worth the full ten per cent. YELLOW surrounds it and pays a graded
 * consolation down to half, which is what makes "close" legible as close. The
 * margin is fixed rather than proportional, so at one meditator the two rings
 * together span 0.45 of the meter's 1.35 — a third of the bar, wide enough to
 * aim at, while the green core inside it stays the thing you have to hold.
 */
export const PUNCH_FOCUS_ZONE_MARGIN_01 = 0.15;
/** What the outer ring is worth at its outer edge. Inside, it grades up to 1. */
export const PUNCH_FOCUS_EDGE_QUALITY_01 = 0.5;
/**
 * How far outside the band the consolation slope runs. A CONSTANT, not a
 * multiple of the band: tying it to the band meant a big crowd got both a wider
 * target and a wider skirt, which quietly paid four per cent to eight people
 * mashing the key at the ceiling. The band grows with the crowd; the skirt does
 * not, so being badly wrong stays badly wrong at any headcount.
 */
export const PUNCH_FOCUS_FALLOFF_01 = 0.16;
/** Silence for this long and the coordinator drops you from the circle. */
export const PUNCH_FOCUS_IDLE_MS = 2_200;
/**
 * The floor on the tap rate, and the reason the local meter and the
 * coordinator's copy stay in step: a press inside the cooldown is dropped
 * OUTRIGHT — no local impulse, no message — rather than applied locally and
 * throttled on the wire, which would have let the two diverge on every mash.
 */
export const PUNCH_FOCUS_TAP_COOLDOWN_MS = 120;
/** How fast the broadcast crowd level chases the raw mean, per second. */
export const PUNCH_FOCUS_SMOOTHING_PER_S = 2.2;
/** How close to the cabinet a spectator has to stand to count. */
export const PUNCH_FOCUS_RANGE_M = 14;
/**
 * The key, spelled out. It lives here rather than in the runtime because three
 * separate surfaces now print it — the pill, the balloon copy and the board on
 * the arc — and the board cannot import the runtime without a cycle.
 */
export const PUNCH_FOCUS_KEY_LABEL = "E";
/** The other half of the control: the key that drags a rival's punch down. */
export const PUNCH_DISRUPT_KEY_LABEL = "F";

/**
 * THE TARGET MOVES — and this is the fix for the only real complaint the
 * control had, which is that it was solvable once and then never again.
 *
 * A fixed still point plus an exponential bleed has exactly ONE optimal play:
 * find the tap interval whose resting level is the target, and then keep that
 * interval forever. Nothing on screen ever has to be looked at again. A player
 * who found it described the mechanic honestly — "you just tap in the rhythm
 * and you always stay in the green, it doesn't make any sense."
 *
 * So the still point is not still. It wanders on a slow curve, and holding the
 * band now means noticing that it moved and changing tempo to follow it. The
 * skill stops being "find the rhythm" and becomes "keep reading the bar".
 *
 * TWO SINES, NOT ONE, and their periods are deliberately incommensurate. A
 * single sine is itself a rhythm: after two cycles a player is tapping along
 * with it and is back to not looking. Summing a slow carrier with a faster,
 * quieter one gives a curve that only repeats after ~180 s, which is longer
 * than any turn, so within a punch it never reads as a pattern.
 */
export const PUNCH_FOCUS_DRIFT_PERIOD_MS = 6_200;
/** The second hand, quick enough to break the first one's rhythm. */
export const PUNCH_FOCUS_DRIFT_PERIOD_B_MS = 2_900;
/** How much of the swing the fast hand owns. The rest belongs to the carrier. */
export const PUNCH_FOCUS_DRIFT_MIX_B = 0.28;
/**
 * PEAK EXCURSION EITHER SIDE OF THE STILL POINT — and its ceiling is not a
 * matter of taste. `punchFocusQuality01` must still return exactly zero for a
 * meditator parked at `PUNCH_FOCUS_CEILING`, or mashing the key becomes a
 * viable strategy at large headcounts. That budget is
 *
 *     CEILING - (TARGET + drift) >= ZONE_MARGIN + BAND_MAX + FALLOFF
 *     1.35    - (0.68   + drift) >= 0.15        + 0.26      + 0.16
 *
 * which caps the drift at 0.10. Held at 0.09 so the guarantee has a margin
 * rather than sitting exactly on the boundary; the test asserts it.
 */
export const PUNCH_FOCUS_DRIFT_01 = 0.09;
/**
 * When the two hands come back into phase. `lcm(6200, 2900)` — the window the
 * drift clock is kept modulo, so the number on the wire stays small and a
 * client that joins mid-round lands on the same curve as everybody else.
 */
export const PUNCH_FOCUS_DRIFT_CYCLE_MS = 179_800;

/**
 * THE GUST — and this, not the drifting target, is what actually ends the
 * metronome. The drift was necessary and it was not sufficient; the numbers
 * said so plainly, and they are worth writing down.
 *
 * Under a fixed bleed a fixed tap interval is a STABLE ATTRACTOR: every tempo
 * has its own resting level, the meter self-corrects toward it, and the
 * residual sawtooth is barely wider than the green band. Simulated over a
 * minute, a 460 ms metronome sat inside the green 75% of the time and collected
 * 96% of what perfect play collected. Moving the target only took that to 61%
 * and 93% — better, and still a control nobody has to look at, because WHERE
 * the still point sits has no bearing on whether a rhythm can hold a level.
 *
 * So the bleed itself breathes. With the rate wandering ±70% on its own slow
 * curve there is no longer any interval that holds any level: the resting point
 * moves out from under a fixed tempo, and the only way to stay in the band is
 * to watch the bar and change tempo. The same simulation puts a metronome at
 * 32% green and 77% of the payout.
 *
 * ‼️THE PART THAT MATTERS: attentive play is UNCHANGED. A player who taps
 * whenever the bar is under the line scores 0.979 with the gust and 0.982
 * without it, and holds the green 72% of the time either way. The gust does not
 * make the control harder to play well — it makes it impossible to play well
 * without looking, which is the entire difference between a skill and a chore.
 *
 * It rides the SAME broadcast phase as the drift, so it costs nothing on the
 * wire, every client feels the same weather at the same moment, and its period
 * is incommensurate with both drift hands so the three never line up into one
 * pattern a player could learn.
 */
export const PUNCH_FOCUS_GUST_PERIOD_MS = 4_300;
/** How far the bleed swings either side of its nominal rate. */
export const PUNCH_FOCUS_GUST_01 = 0.7;

/**
 * PRECISION BEATS PRESENCE — the streak.
 *
 * Grading down to half a payout across the yellow ring made "close" legible,
 * which it had to be, but it also made close nearly free: a metronome clipping
 * the ring's edge every cycle collected most of what a player centring the
 * needle collected. So time spent FULLY inside the green now compounds.
 *
 * It multiplies the crowd's SHARE rather than the bonus, which is what keeps
 * the ten per cent cap intact without a second clamp: `punchFocusCrowdShare`
 * already saturates at 1, so a big circle — which is at 1 anyway — gains
 * nothing, and the whole of the reward lands on the small circles that had the
 * least reason to aim carefully. A lone player holding the middle is worth
 * about half again what a lone player skimming the edge is.
 */
export const PUNCH_FOCUS_STREAK_STEP_MS = 2_000;
/** What one whole step in the green is worth, compounding to the cap. */
export const PUNCH_FOCUS_STREAK_GAIN = 0.25;
/** Ceiling on the multiplier. Precision is a bonus, never a second mechanic. */
export const PUNCH_FOCUS_STREAK_MAX = 1.5;
/**
 * Falling OUT of the green does not reset you — leaving the yellow ring does.
 * A solo sawtooth crosses the green edge on every single cycle by design, so a
 * green-only streak would be permanently zero for exactly the players it was
 * written for. Leaving the ring altogether is a real lapse and costs the lot.
 */

/**
 * WHERE THE RIGHT-HAND END OF THE DRAWN BAR STOPS BEING USEFUL.
 *
 * The meter used to draw `level / CEILING` straight, which put the still point
 * at 50% and handed the entire right half of the control to a region no player
 * ever wants to visit: everything above the outer ring is overshoot, worth
 * nothing, and reachable only by mashing. Half the widget was a punishment
 * runway drawn at full size.
 *
 * The runway has to EXIST — the zero-at-the-ceiling guarantee above is what
 * stops mashing from paying at eight meditators — but it does not have to be
 * half the bar. So the drawing is remapped, not the game: the playable range
 * from empty to just past the outer ring is stretched across the first
 * `PUNCH_FOCUS_BAR_SPILL_AT` of the width, and the whole overshoot runway is
 * compressed into the short strip after it, which the HUD paints red. Nothing
 * about the maths, the payout or the wire changes.
 */
export const PUNCH_FOCUS_BAR_SPILL_AT = 0.82;
/** How far past the outer ring counts as still playing rather than spilled. */
export const PUNCH_FOCUS_BAR_SPILL_HEAD_01 = 0.06;


/**
 * How hard the bleed is pulling right now, from the shared phase. 1 is the
 * nominal rate; above it the meter drains faster than any fixed tempo can feed
 * it, below it a tempo that was holding starts to overshoot.
 */
export function punchFocusGustAt(phaseMs: number): number {
  const phase = Number.isFinite(phaseMs) ? phaseMs : 0;
  return (
    1 +
    PUNCH_FOCUS_GUST_01 *
      Math.sin((2 * Math.PI * phase) / PUNCH_FOCUS_GUST_PERIOD_MS)
  );
}

/**
 * The bleed, applied over a frame. Exact under any step size — see the rate.
 *
 * `gust` defaults to 1, which is the still-air bleed every caller had before
 * the weather existed and the one the tests measure the rate against.
 */
export function punchFocusDecay(
  level01: number,
  dtMs: number,
  gust = 1,
): number {
  const dt = Math.max(0, Number.isFinite(dtMs) ? dtMs : 0) / 1000;
  const level = Math.max(0, Number.isFinite(level01) ? level01 : 0);
  const wind = Math.max(0, Number.isFinite(gust) ? gust : 1);
  const next = level * Math.exp(-PUNCH_FOCUS_DECAY_RATE * wind * dt);
  return next <= PUNCH_FOCUS_FLOOR_01 ? 0 : next;
}

/** One tap. Flat impulse — nothing here helps you stop overshooting. */
export function punchFocusTap(level01: number): number {
  const level = Math.max(0, Number.isFinite(level01) ? level01 : 0);
  return Math.min(PUNCH_FOCUS_CEILING, level + PUNCH_FOCUS_TAP_IMPULSE);
}

/** The band's half-width at this headcount. More people, easier target. */
export function punchFocusBandHalfWidth(meditators: number): number {
  const count = Math.max(0, Math.floor(Number(meditators) || 0));
  if (count <= 0) return PUNCH_FOCUS_BAND_01;
  return Math.min(
    PUNCH_FOCUS_BAND_MAX,
    PUNCH_FOCUS_BAND_01 + PUNCH_FOCUS_BAND_PER_PERSON * (count - 1),
  );
}

/** The outer ring's half-width: the green band plus a fixed yellow margin. */
export function punchFocusZoneHalfWidth(meditators: number): number {
  return punchFocusBandHalfWidth(meditators) + PUNCH_FOCUS_ZONE_MARGIN_01;
}

/**
 * WHERE THE STILL POINT IS RIGHT NOW, from a phase in milliseconds.
 *
 * Pure, total and frame-rate independent, because three separate machines have
 * to agree on it to the pixel: the coordinator that pays out, the spectator's
 * own predicted meter, and the HUD that draws the green band. They agree by
 * sharing the PHASE — one small number on the heartbeat — rather than a wall
 * clock, since two explorers' clocks are skewed by more than a green band is
 * wide and only elapsed durations are trustworthy across a network.
 *
 * The two sines are normalised by their weights, so the excursion peaks at
 * exactly `PUNCH_FOCUS_DRIFT_01` and the guarantee above is exact.
 */
export function punchFocusTargetAt(phaseMs: number): number {
  const phase = Number.isFinite(phaseMs) ? phaseMs : 0;
  const a = Math.sin((2 * Math.PI * phase) / PUNCH_FOCUS_DRIFT_PERIOD_MS);
  const b = Math.sin((2 * Math.PI * phase) / PUNCH_FOCUS_DRIFT_PERIOD_B_MS);
  const swing = (1 - PUNCH_FOCUS_DRIFT_MIX_B) * a + PUNCH_FOCUS_DRIFT_MIX_B * b;
  return PUNCH_FOCUS_TARGET_01 + PUNCH_FOCUS_DRIFT_01 * swing;
}

/** Advance a phase and keep it inside the repeat window. Skew-free: elapsed only. */
export function punchFocusDriftAdvance(phaseMs: number, dtMs: number): number {
  const phase = Number.isFinite(phaseMs) ? phaseMs : 0;
  const dt = Math.max(0, Number.isFinite(dtMs) ? dtMs : 0);
  const next = (phase + dt) % PUNCH_FOCUS_DRIFT_CYCLE_MS;
  return next < 0 ? next + PUNCH_FOCUS_DRIFT_CYCLE_MS : next;
}

/**
 * The streak multiplier for a run of time held inside the ring, compounding
 * one step at a time and capped. Partial steps count for nothing: the reward
 * is for having HELD it, and a fractional credit would pay a player who dips
 * in and out on every cycle the same as one who never leaves.
 */
export function punchFocusStreakMultiplier(heldMs: number): number {
  const held = Math.max(0, Number.isFinite(heldMs) ? heldMs : 0);
  const steps = Math.floor(held / PUNCH_FOCUS_STREAK_STEP_MS);
  if (steps <= 0) return 1;
  return Math.min(
    PUNCH_FOCUS_STREAK_MAX,
    1 + PUNCH_FOCUS_STREAK_GAIN * steps,
  );
}

/**
 * WHERE A LEVEL IS DRAWN, 0..1 across the widget. Display only — see the note
 * on `PUNCH_FOCUS_BAR_SPILL_AT`. Anchored to the LIVE outer ring rather than
 * the widest one any crowd could earn, so a solo player gets the whole bar for
 * the range they can actually use, and the bar visibly relaxes when somebody
 * joins them, which is the correct thing for it to say at that moment.
 */
export function punchFocusBarX01(level01: number, zoneHalf01: number): number {
  const level = Math.max(0, Number.isFinite(level01) ? level01 : 0);
  const zone = Math.max(0, Number.isFinite(zoneHalf01) ? zoneHalf01 : 0);
  const spill =
    PUNCH_FOCUS_TARGET_01 +
    PUNCH_FOCUS_DRIFT_01 +
    zone +
    PUNCH_FOCUS_BAR_SPILL_HEAD_01;
  if (level <= spill) {
    return unit((PUNCH_FOCUS_BAR_SPILL_AT * level) / Math.max(1e-6, spill));
  }
  const over = (level - spill) / Math.max(1e-6, PUNCH_FOCUS_CEILING - spill);
  return unit(
    PUNCH_FOCUS_BAR_SPILL_AT + (1 - PUNCH_FOCUS_BAR_SPILL_AT) * unit(over),
  );
}

/**
 * How well the crowd is holding it, as three regions the meter draws literally.
 *
 *   inside GREEN   the full ten per cent, flat. Flat and not peaked, because a
 *                  peak would mean a crowd whose average sits a hair off centre
 *                  never quite earns the number the control promises them.
 *   inside YELLOW  a straight grade from ten per cent at the green edge down to
 *                  five at the outer edge — "the closer to the middle, the
 *                  closer to ten", drawn rather than written.
 *   beyond         the same five per cent falling to nothing across the skirt,
 *                  so badly wrong is still worth nothing at any headcount.
 *
 * The still point it measures against is now an ARGUMENT rather than the
 * constant, because the target drifts. It defaults to the constant so every
 * caller that does not care about the drift — and every test written before it
 * existed — reads the same curve it always did.
 */
export function punchFocusQuality01(
  level01: number,
  meditators: number,
  target01 = PUNCH_FOCUS_TARGET_01,
): number {
  if (Math.max(0, Math.floor(Number(meditators) || 0)) <= 0) return 0;
  const level = Math.max(0, Number.isFinite(level01) ? level01 : 0);
  const target = Number.isFinite(target01) ? target01 : PUNCH_FOCUS_TARGET_01;
  const green = punchFocusBandHalfWidth(meditators);
  const yellow = punchFocusZoneHalfWidth(meditators);
  const distance = Math.abs(level - target);
  if (distance <= green) return 1;
  if (distance <= yellow) {
    const across = (distance - green) / Math.max(1e-6, yellow - green);
    return 1 - (1 - PUNCH_FOCUS_EDGE_QUALITY_01) * across;
  }
  return unit(
    PUNCH_FOCUS_EDGE_QUALITY_01 *
      (1 - (distance - yellow) / PUNCH_FOCUS_FALLOFF_01),
  );
}

/* ------------------------------------------------------------------------ *
 * THE KARMA RING — the hard target inside the easy one.
 * ------------------------------------------------------------------------ */

/**
 * ‼️THE RING IS THE BOOSTER'S OWN SKILL TEST, AND IT IS DELIBERATELY MEAN.
 *
 * Owner, 2026-09-05: *"maybe even like in a more narrow range... that is really
 * just around the exact spot. It was kinda tough to stay there and if you did a
 * good job it still needs to be possible if you put the effort you get some
 * crazy multiplier."*
 *
 * The GREEN band is the social mechanic and it is supposed to be forgiving — it
 * WIDENS with the headcount so a room can hold it together (see
 * `punchFocusBandHalfWidth`). That is exactly why it cannot also be the skill
 * ceiling: a crowd of six is holding a band nearly four times the width a lone
 * player is, and paying them the same would mean the best thing a booster can
 * do is recruit rather than play.
 *
 * So the ring sits INSIDE the green and does not move:
 *
 *   ‼️FIXED WIDTH AT EVERY HEADCOUNT. Six people in the room does not make the
 *     ring wider. Green is the crowd's; the ring is yours.
 *   ‼️NARROWER THAN A SINGLE TAP IMPULSE. `PUNCH_FOCUS_TAP_IMPULSE` is 0.2 and
 *     the ring is a tenth of that, so it can never be sat in by mashing — you
 *     have to feather the beat against the bleed and the gust to stay there.
 *   ‼️AND IT IS REACHABLE. Quality inside the green is already flat at 1, so the
 *     ring costs a booster nothing to attempt: worst case they are still paid
 *     the ordinary full share for the green they were holding anyway.
 *
 * ‼️2026-09-06 — THE RING WAS UNREACHABLE, AND THIS IS THE DEFAULT THAT FIXES IT.
 *
 * At 0.02 the ring paid a lone supporter ZERO at optimal play: a tap is 0.2,
 * ten times the band, so every tap is an overshoot and the best unbroken hold
 * across twenty seconds was ~750 ms against a 900 ms rung. The owner had never
 * once seen the multiplier, the gold sliver or the karma line — *"I've never
 * seen them... I need for this thing to appear every single time I am observing
 * and meditating."*
 *
 * Simulated against the real bleed, gust and drift (see
 * tests/scene/punch-karma-ring.test.ts, "is reachable"): at 0.06 an attentive
 * player (90 ms reaction) reaches the first rung in ~5 s and ×4 inside a full
 * turn; a 220 ms player still earns ×1.6; a 400 ms player earns nothing. That is
 * the shape the mechanic needs: visible every time you actually try, still a
 * skill. The Game director can narrow it back (`karmaRingBand01`).
 */
export const PUNCH_FOCUS_KARMA_BAND_01 = 0.04;
/** The Game director's range for the ring: a hair at 0.02, the whole solo green at 0.075. */
export const PUNCH_FOCUS_KARMA_BAND_MIN_01 = 0.015;
export const PUNCH_FOCUS_KARMA_BAND_MAX_01 = PUNCH_FOCUS_BAND_01;

/**
 * How deep inside the ring a level is, 0..1 — 1 dead on the still point, 0 at
 * the ring's edge and outside it.
 *
 * Graded rather than binary because the ring is small enough that a hard edge
 * would strobe: a level a hair outside would flicker the multiplier off and on
 * several times a second. The grade means feathering *toward* the middle pays
 * more every frame you get closer, which is the instruction the control gives.
 *
 * `band01` is the venue's ring width — the Game director's difficulty knob. It
 * defaults to the constant so every caller and test that predates the knob
 * reads the same curve.
 */
export function punchFocusKarma01(
  level01: number,
  target01 = PUNCH_FOCUS_TARGET_01,
  band01 = PUNCH_FOCUS_KARMA_BAND_01,
): number {
  const level = Math.max(0, Number.isFinite(level01) ? level01 : 0);
  const target = Number.isFinite(target01) ? target01 : PUNCH_FOCUS_TARGET_01;
  const band = punchKarmaBand01(band01);
  const distance = Math.abs(level - target);
  // `>= band` alone lets 0.68 + 0.06 - 0.68 land a hair INSIDE the ring by
  // floating point; a depth that small is noise, and noise here strobes.
  const depth = 1 - distance / band;
  return depth <= 1e-9 ? 0 : unit(depth);
}

/** A ring width clamped to the director's range; anything unreadable is the default. */
export function punchKarmaBand01(band01: unknown): number {
  const band = typeof band01 === 'number' && Number.isFinite(band01) ? band01 : PUNCH_FOCUS_KARMA_BAND_01;
  return Math.max(PUNCH_FOCUS_KARMA_BAND_MIN_01, Math.min(PUNCH_FOCUS_KARMA_BAND_MAX_01, band));
}

/**
 * ‼️ONE STEP OF A RUN — AND A TAP DOES NOT END IT.
 *
 * The run used to zero the instant the level left the ring ("a ×4 has to be
 * held, not accumulated in instalments"). Measured, that rule made the ring
 * unpayable: a lone level is a 0.2 sawtooth and the ring is a fraction of
 * that, so EVERY tap left the ring and the clock never got past one cycle.
 *
 * The rule is now the same one the crowd's streak already uses: falling out
 * of the ring PAUSES the clock, leaving the yellow zone altogether RESETS it.
 * Feathering the beat around the still point adds up; wandering off to the
 * rail costs the lot. `inZone` is the caller's reading of the yellow ring at
 * its own headcount, because the zone widens with the room and this function
 * does not know the room.
 */
export function punchKarmaRunMs(
  heldMs: number,
  dtMs: number,
  karma01: number,
  inZone: boolean,
): number {
  const held = Math.max(0, Number.isFinite(heldMs) ? heldMs : 0);
  if (unit(karma01) > 0) return punchKarmaAdvanceMs(held, dtMs, karma01);
  return inZone ? held : 0;
}

/* ------------------------------------------------------------------------ *
 * THE CIRCLE — the spectator's OWN score.
 * ------------------------------------------------------------------------ */

/**
 * ‼️A SCORE OF YOUR OWN, EVERY TURN. Owner, 2026-09-06: *"if you're already
 * clicking then you need to be playing some kind of game, you need to get some
 * kind of score right away, or maybe you even compete against the others who
 * are also meditating."* Until now a booster's whole output was points handed
 * to somebody else. This is the number that is theirs: 0..999, the same scale
 * as the punch, so the two can be read side by side without a legend.
 *
 * Two halves: the share of the wind-up spent fully in the green (presence,
 * generous, the crowd's band), and how much of a full ×4 ring run was held
 * (precision, the ring, yours). The ring half is the smaller share on purpose:
 * it is the harder skill, and a score that was mostly ring would read as
 * "nothing until you are perfect" — the exact complaint this replaces.
 *
 * A warm-up guards the first second: one tap on an empty meter is 100% green
 * for a few frames, and a 999 for that would be a lottery ticket, not a score.
 */
export const PUNCH_CIRCLE_MAX = 999;
export const PUNCH_CIRCLE_RING_SHARE = 0.45;
/** Four rungs of ring-time (= PUNCH_KARMA_STEP_MS * 4); written out because the step is declared below. */
export const PUNCH_CIRCLE_FULL_RING_MS = 3_600;
export const PUNCH_CIRCLE_WARMUP_MS = 1_500;

export function punchCircleScore(
  greenMs: number,
  liveMs: number,
  karmaMs: number,
): number {
  const green = Math.max(0, Number.isFinite(greenMs) ? greenMs : 0);
  const live = Math.max(0, Number.isFinite(liveMs) ? liveMs : 0);
  if (live <= 0) return 0;
  const warm = Math.min(1, live / PUNCH_CIRCLE_WARMUP_MS);
  const presence = unit(green / live);
  const ring = unit(Math.max(0, Number.isFinite(karmaMs) ? karmaMs : 0) / PUNCH_CIRCLE_FULL_RING_MS);
  const score01 = (1 - PUNCH_CIRCLE_RING_SHARE) * presence + PUNCH_CIRCLE_RING_SHARE * ring;
  return Math.round(PUNCH_CIRCLE_MAX * score01 * warm);
}

/** The best human circle score on a committed ledger; null when nobody scored. */
export function punchCircleBest(
  boosts: readonly PunchBoostContribution[] | undefined,
): PunchCircleBest | null {
  let best: PunchCircleBest | null = null;
  for (const entry of boosts ?? []) {
    if (!entry || entry.npc) continue;
    const score = Math.max(0, Math.round(Number(entry.circleScore) || 0));
    if (score <= 0) continue;
    if (!best || score > best.score) best = { userId: entry.userId, name: entry.name, score };
  }
  return best;
}

/**
 * ‼️KARMA TIME IS PER PERSON, AND IT IS NOT THE STREAK.
 *
 * `focusStreakMs` is the CROWD's unbroken time in the ring and multiplies
 * everybody equally — it is the reward for the room holding together. Karma is
 * the opposite number: your own time in your own ring, which nobody else can
 * hold for you and which recruiting does not help with. The two stack, and they
 * are meant to: a room that holds the green together while you personally hold
 * the ring is the best possible outcome for a punch.
 *
 * Advanced by `dtMs * karma01` rather than by `dtMs`, so half-holding the ring
 * banks half as fast. There is no cliff at the ring's edge — falling out simply
 * stops the clock.
 */
export function punchKarmaAdvanceMs(
  heldMs: number,
  dtMs: number,
  karma01: number,
): number {
  const held = Math.max(0, Number.isFinite(heldMs) ? heldMs : 0);
  const dt = Math.max(0, Number.isFinite(dtMs) ? dtMs : 0);
  const depth = unit(karma01);
  if (depth <= 0) return 0;
  return held + dt * depth;
}

/** One rung of ring-time. Just under a second: a rung has to feel earnable. */
export const PUNCH_KARMA_STEP_MS = 900;
/** What each rung adds to your personal multiplier. */
export const PUNCH_KARMA_STEP_GAIN = 0.6;
/**
 * ‼️THE CRAZY MULTIPLIER, AND IT IS ALLOWED TO BE ABSURD.
 *
 * Four rungs — about three and a half seconds of genuinely holding the ring —
 * quadruples what your Boost is worth. `PUNCH_BOOST_POINTS_PER_PERSON` is 48, so
 * one person who nails it is handing over ~190 points on their own, and two of
 * them will take an ordinary punch across `PUNCH_HIGH_GROUND_THRESHOLD` without
 * the puncher doing anything different. That is the point: the owner's ask was
 * that boosting well be *worth doing*, and a mechanic worth doing has to be able
 * to change the outcome, not decorate it.
 */
export const PUNCH_KARMA_MULT_MAX = 4;

/** The personal multiplier for a run of ring-time, in whole rungs. */
export function punchBoostKarmaMultiplier(karmaMs: number): number {
  const held = Math.max(0, Number.isFinite(karmaMs) ? karmaMs : 0);
  const rungs = Math.floor(held / PUNCH_KARMA_STEP_MS);
  if (rungs <= 0) return 1;
  return Math.min(
    PUNCH_KARMA_MULT_MAX,
    1 + PUNCH_KARMA_STEP_GAIN * rungs,
  );
}

/**
 * ‼️DORMANT — JINX IS NOT PART OF THE LIVE MECHANIC (owner decision 2026-09-04).
 *
 * The crowd used to be a duel: one circle lifting the punch, one dragging it
 * down, netted against each other. It is now a single positive action, BOOST,
 * and nothing in the running game may read the second side. The type survives
 * because Jinx is expected back one day as a rare mode, a cheat code or an NPC
 * condition — but it is kept the way a spare part is kept, unwired.
 *
 * ‼️If you find yourself branching on this in live code, you are rebuilding the
 * thing that was deliberately taken out. See `punchFocusNetBonus01` below.
 */
export type PunchFocusSide = "boost" | "drain";

/** Alone you are worth this much of the cap. Not nothing — a third of it. */
export const PUNCH_FOCUS_SOLO_SHARE = 0.35;
/** ...and every extra body MULTIPLIES that, rather than adding to it. */
export const PUNCH_FOCUS_SHARE_GROWTH = 1.6;

/**
 * WHAT A CIRCLE OF THIS SIZE CAN BE WORTH AT BEST, 0..1.
 *
 * The old rule was a flat cap and a widening band: one person could in theory
 * take the whole ten per cent, and in practice took one, because a lone
 * sawtooth cannot hold a smoothed mean anywhere near the middle. So the reward
 * for recruiting somebody was invisible, and meditating alone read as broken.
 *
 * Now the headcount is the multiplier and the band does the fine work. One
 * person is worth a real, small share the moment they hold it; two are worth
 * more than twice that; four saturate the cap. Growth is geometric on purpose —
 * "get one more person" has to be the loudest instruction in the mechanic.
 */
export function punchFocusCrowdShare(meditators: number): number {
  const count = Math.max(0, Math.floor(Number(meditators) || 0));
  if (count <= 0) return 0;
  return unit(
    PUNCH_FOCUS_SOLO_SHARE * Math.pow(PUNCH_FOCUS_SHARE_GROWTH, count - 1),
  );
}

/**
 * What that quality is worth to the puncher at this headcount, 0..0.10.
 *
 * The streak multiplies the SHARE and not the result, so the ten per cent cap
 * needs no second clamp: `unit` closes over the product, a saturated circle
 * gains nothing it did not already have, and the reward for holding the middle
 * lands entirely on the small crowds it was written for.
 */
export function punchFocusBonus01(
  quality01: number,
  meditators = Number.POSITIVE_INFINITY,
  streak = 1,
): number {
  const base = Number.isFinite(meditators)
    ? punchFocusCrowdShare(meditators)
    : 1;
  const boost = Math.max(1, Number.isFinite(streak) ? streak : 1);
  return PUNCH_FOCUS_MAX_BONUS_01 * unit(quality01) * unit(base * boost);
}

/**
 * ‼️DORMANT — the Boost-vs-Jinx netting. Nothing live may call either of these.
 *
 * They are what the crowd used to be: a percentage of the finished score, one
 * circle's lift cancelled one-for-one by another's drag. Two things were wrong
 * with it and both are why the mechanic was rewritten below.
 *
 *   1. ‼️A PERCENTAGE IS INVISIBLE. Ten per cent of a 900 is ninety points
 *      spread across a whole crowd, so one real person holding the beat moved
 *      the number by single digits and could not tell they had done anything.
 *   2. ‼️THE NPCS CANCELLED THE HUMANS. Two regulars channelled every turn, one
 *      on each side by design, so the pair netted to roughly zero and a lone
 *      human's contribution was arithmetic noise inside it.
 *
 * Kept, unwired, against the day Jinx returns as a rare mode or a cheat code.
 */
export function punchFocusNetBonus01(boost01: number, drain01: number): number {
  const net = (Number(boost01) || 0) - (Number(drain01) || 0);
  return Math.max(
    -PUNCH_FOCUS_MAX_BONUS_01,
    Math.min(PUNCH_FOCUS_MAX_BONUS_01, net),
  );
}

/** ‼️DORMANT with the above — the old percentage payout. */
export function punchApplyFocusBonus(score: number, bonus01: number): number {
  return Math.round(
    Math.max(0, score) *
      (1 +
        Math.max(
          -PUNCH_FOCUS_MAX_BONUS_01,
          Math.min(PUNCH_FOCUS_MAX_BONUS_01, bonus01 || 0),
        )),
  );
}

/* ------------------------------------------------------------------------ *
 * CROWD BOOST — the live mechanic.
 * ------------------------------------------------------------------------ */

/**
 * ‼️BOOST IS POINTS, NOT A PERCENTAGE, AND THAT IS THE WHOLE REDESIGN.
 *
 * The crowd's job is no longer to nudge a punch. It is to take a punch
 * somewhere the puncher cannot go alone. Ordinary play tops out at `maxScore`
 * (999); Boost is ADDED to the finished score, so the only way a four-digit
 * number ever appears on that cabinet is if people in the room put it there.
 *
 * That is why the number is absolute. A per-cent buys the crowd a share of
 * somebody else's punch, which is exactly the reading that made the old
 * mechanic feel like weather; a POINT is a thing you handed over, it is the
 * same size whoever you hand it to, and it can be written next to your name.
 *
 * Everything below is tuning and is MEANT to be tuned. What must not change is
 * the shape: per-person points, summed, added on top, threshold above.
 */

/** What one spectator holding a perfect beat is worth, before their streak. */
export const PUNCH_BOOST_POINTS_PER_PERSON = 48;

/**
 * The most one person can hand over however long they hold it. The streak
 * multiplier tops out at `PUNCH_FOCUS_STREAK_MAX` (1.5), so this is the natural
 * ceiling of an ordinary Boost — a SPECIAL Boost's multiplier is applied on top
 * and is deliberately allowed past it (see `PUNCH_BOOST_POINTS_MAX`).
 */
export const PUNCH_BOOST_PERSON_CAP = Math.round(
  PUNCH_BOOST_POINTS_PER_PERSON * PUNCH_FOCUS_STREAK_MAX,
);

/** The hard stop on any single contribution, multipliers included. */
export const PUNCH_BOOST_POINTS_MAX = 400;

/**
 * The hard stop on the whole crowd. Generous — a full deck holding a perfect
 * beat SHOULD be able to reach the top band — but finite, so a coordinating
 * group can never produce a score the board cannot render.
 */
export const PUNCH_BOOST_TOTAL_MAX = 900;

/**
 * ‼️WHAT AN NPC IS WORTH, AND THE LAW THAT GOES WITH IT.
 *
 * The regulars at the flanks exist so nobody punches to an empty room, and they
 * are allowed to add a little so the crowd meter is never a flat zero. They are
 * NOT allowed to be the reason anything happens. Two rules enforce that:
 *
 *   1. This share — a quarter of a person — keeps their points decorative.
 *   2. `punchAwardCrowdBoost` will not let NPC points carry a punch across
 *      `PUNCH_HIGH_GROUND_THRESHOLD`. High Ground is human-only, always.
 */
export const PUNCH_BOOST_NPC_SHARE = 0.25;

/**
 * WHAT ONE PERSON'S BEAT IS WORTH, IN POINTS.
 *
 * `quality01` is how well they were holding the rhythm — the same curve the
 * meter has always drawn, so the control a spectator learned still means what
 * it meant. `streak` rewards holding it rather than tapping once. `multiplier`
 * is the future: an ordinary Boost passes 1, and a perfect-timing Boost, a
 * secret emote or an outer-cloud Boost will pass more without this function
 * needing to know which.
 *
 * ‼️Never assume two contributors are worth the same. The result card prints
 * one line per person precisely because they are not.
 */
export function punchBoostPoints(
  quality01: number,
  streak = 1,
  multiplier = 1,
  npc = false,
): number {
  const held = unit(quality01);
  if (held <= 0) return 0;
  const run = Math.max(1, Number.isFinite(streak) ? streak : 1);
  const special = Math.max(0, Number.isFinite(multiplier) ? multiplier : 1);
  const share = npc ? PUNCH_BOOST_NPC_SHARE : 1;
  return Math.min(
    PUNCH_BOOST_POINTS_MAX,
    Math.round(PUNCH_BOOST_POINTS_PER_PERSON * held * run * special * share),
  );
}

/**
 * THE AWARD — a list of people turned into the numbers the punch is scored and
 * the result card is drawn with. One function, so the coordinator, the HUD and
 * the tests can never disagree about what the crowd did.
 *
 * ‼️The NPC clamp is the interesting part. Everything is added to the final
 * score — the puncher keeps every point the room gave them — but if the HUMAN
 * total is short of the threshold, decorative points are trimmed so they cannot
 * finish the job. One number on screen, one rule behind it: *NPCs cheer, only
 * people break High Ground.*
 */
export function punchAwardCrowdBoost(
  baseScore: number,
  contributions: readonly PunchBoostContribution[],
  threshold: number = PUNCH_HIGH_GROUND_THRESHOLD,
): {
  boosts: PunchBoostContribution[];
  crowdBoost: number;
  humanBoost: number;
  /**
   * ‼️WHAT THIS FUNCTION REFUSED. Both clamps below throw points away — the
   * total cap `break`s and abandons every remaining contributor, the NPC
   * headroom `continue`s past one — and until this was returned, that loss left
   * the building without a trace. The result card is the only place the crowd
   * mechanic is ever explained, so a silent trim there reads to the room as
   * "my Boost did nothing".
   */
  trimmed: number;
  score: number;
} {
  const base = Math.max(0, Math.round(Number(baseScore) || 0));
  // Biggest contribution first: the result card reads top-down and the person
  // who did the most should not have to look for themselves in the list.
  const ranked = contributions
    .map((entry) => ({
      ...entry,
      points: Math.max(0, Math.round(Number(entry.points) || 0)),
    }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  let humanBoost = 0;
  let npcBoost = 0;
  const boosts: PunchBoostContribution[] = [];
  for (const entry of ranked) {
    const running = humanBoost + npcBoost;
    if (running >= PUNCH_BOOST_TOTAL_MAX) break;
    let points = Math.min(entry.points, PUNCH_BOOST_TOTAL_MAX - running);
    if (entry.npc) {
      // The clamp: an NPC may fill the room, never cross the line.
      const npcCeiling = base + Math.floor(Math.max(0, threshold - 1 - base) * 0.35);
      const headroom = Math.max(0, npcCeiling - (base + npcBoost));
      if (base + humanBoost < threshold) points = Math.min(points, headroom);
      if (points <= 0) continue;
      npcBoost += points;
    } else {
      humanBoost += points;
    }
    boosts.push({ ...entry, points });
  }
  const crowdBoost = humanBoost + npcBoost;
  // Measured against what the room OFFERED, not against what survived — so a
  // contributor dropped whole by the cap `break` is counted here exactly like
  // one that was cut in half.
  const offered = ranked.reduce((sum, entry) => sum + entry.points, 0);
  return {
    boosts,
    crowdBoost,
    humanBoost,
    trimmed: Math.max(0, offered - crowdBoost),
    score: base + crowdBoost,
  };
}

/* ------------------------------------------------------------------------ *
 * THE CROWD'S HAND ON THE AIM — what a Boost does to the puncher's window.
 * ------------------------------------------------------------------------ */

/**
 * ‼️THE SECOND THING A BOOST BUYS, AND IT IS NOT POINTS.
 *
 * Owner, 2026-09-05: *"they need to be able to directly influence the
 * targeting."* Points arrive after the fact — you find out at the reveal what
 * the room was worth. Widening the gold band is felt DURING the swing, by the
 * person swinging, which is the whole difference between a crowd that pays and
 * a crowd that plays.
 *
 * ‼️IT WIDENS THE WINDOW, IT DOES NOT MOVE OR SLOW THE MARKER. That restraint
 * is deliberate and load-bearing: the marker is computed independently on every
 * client from `heldMs`, the seed and `punchHoldSpeed` (see
 * `punchTimingMarker01`), and anything the crowd did to its SPEED would have to
 * reach twenty clients at the same millisecond or the puncher, the coordinator
 * and every spectator would each draw a different needle. The band is only ever
 * read at contact and only ever drawn as scenery, so it can move freely.
 *
 * ‼️AND IT IS DERIVED FROM THE COMMITTED LEDGER, not from live state. The same
 * list that pays the points decides the width, so the number that scored the
 * punch and the number on the result card are the same number by construction.
 * A HUD drawing the live crowd during the charge is a PREDICTION, and is allowed
 * to be a frame behind.
 */
export const PUNCH_ASSIST_BAND_GAIN = 0.75;

/**
 * How much the crowd has earned toward the puncher's window, 0..1.
 *
 * ‼️KARMA IS WHAT BUYS IT — an ordinary Boost (multiplier 1) contributes
 * nothing here however many people throw one. The window is the reward for the
 * ring, so a room that merely shows up cannot hand somebody a bullseye; a room
 * with one person genuinely feathering the still point can.
 *
 * NPCs are excluded outright rather than discounted. The regulars hold a
 * respectable green all turn by construction, and a decorative body must never
 * be the reason a punch landed — the same law as `punchAwardCrowdBoost`.
 */
export function punchCrowdAssist01(
  boosts: readonly PunchBoostContribution[] | undefined,
): number {
  let earned = 0;
  for (const entry of boosts ?? []) {
    if (!entry || entry.npc) continue;
    const over = Math.max(0, (Number(entry.multiplier) || 1) - 1);
    if (over <= 0) continue;
    earned += (over / (PUNCH_KARMA_MULT_MAX - 1)) * unit(entry.quality01);
  }
  return unit(earned);
}

/** The gold band's half-width once the crowd's assist is applied. */
export function punchTimingSweetWidth01(assist01 = 0): number {
  return PUNCH_TIMING_SWEET_WIDTH_01 * (1 + PUNCH_ASSIST_BAND_GAIN * unit(assist01));
}

/* ------------------------------------------------------------------------ *
 * KARMA — what a booster keeps, and what it does to their own punch.
 * ------------------------------------------------------------------------ */

/**
 * ‼️THE LOOP THE WHOLE PASS EXISTS FOR: BOOST WELL, PUNCH HARDER.
 *
 * Owner, 2026-09-05: *"if they do really well and they play they get some karma
 * points and they just get a multiplier on any scores they do based on how well
 * they performed in the boosting... otherwise it's not worth doing it."*
 *
 * Boosting used to be entirely altruistic — you spent a wind-up holding a beat
 * so that somebody ELSE's number got bigger. Karma is the half of the trade that
 * was missing: ring-time is banked under your name, and it comes back as a
 * multiplier the next time YOU are at the bag.
 */
export interface PunchKarmaEntry {
  userId: string;
  name: string;
  /** Banked karma points. Earned by holding the ring, spent by punching. */
  karma: number;
}

/** Karma banked per rung of ring-time held. */
export const PUNCH_KARMA_POINTS_PER_STEP = 30;
/** Nobody hoards forever: the bank is capped at four punches' worth of edge. */
export const PUNCH_KARMA_BANK_MAX = 600;

/** What a stint of ring-time is worth in banked karma. NPCs bank nothing. */
export function punchKarmaEarned(karmaMs: number, npc = false): number {
  if (npc) return 0;
  const held = Math.max(0, Number.isFinite(karmaMs) ? karmaMs : 0);
  const rungs = Math.floor(held / PUNCH_KARMA_STEP_MS);
  if (rungs <= 0) return 0;
  return rungs * PUNCH_KARMA_POINTS_PER_STEP;
}

/** Karma needed for the full personal multiplier. */
export const PUNCH_KARMA_FULL_AT = 400;
/**
 * ‼️THE CEILING ON YOUR OWN PUNCH, AND WHY IT STOPS WHERE IT DOES.
 *
 * Doubling is enormous — a scrappy 500 becomes a 999 — and it is still not
 * enough to break High Ground alone, because the karma multiplier is applied to
 * the BASE score, which `punchScoreForQuality01` clamps at `maxScore`. That is
 * the point, and it is the law from `punchAwardCrowdBoost` restated: karma makes
 * a good punch perfect, and only the room in the moment makes it four digits.
 */
export const PUNCH_KARMA_MULT_SELF_MAX = 2;

/** The multiplier a bank of `karma` is currently worth on your own punch. */
export function punchKarmaSelfMultiplier(karma: number): number {
  const bank = Math.max(0, Number.isFinite(karma) ? karma : 0);
  if (bank <= 0) return 1;
  const across = Math.min(1, bank / PUNCH_KARMA_FULL_AT);
  return 1 + (PUNCH_KARMA_MULT_SELF_MAX - 1) * across;
}

/**
 * ‼️A PUNCH SPENDS THE BANK, AND THAT IS WHAT KEEPS PEOPLE IN THE CIRCLE.
 *
 * A bank that only ever grew would be a one-time grind: boost hard for one
 * evening, then punch with a permanent edge and never join a circle again.
 * Spending means the edge belongs to whoever is boosting THIS session, so the
 * ring stays worth holding for as long as somebody wants to punch well.
 */
export const PUNCH_KARMA_SPEND_01 = 0.5;

/** What a punch consumes from a bank of `karma`. */
export function punchKarmaSpend(karma: number): number {
  const bank = Math.max(0, Number.isFinite(karma) ? karma : 0);
  return Math.round(bank * PUNCH_KARMA_SPEND_01);
}

/** Add to a bank, clamped. One place, so no surface can invent headroom. */
export function punchKarmaBanked(karma: number, earned: number): number {
  const bank = Math.max(0, Number.isFinite(karma) ? karma : 0);
  const gain = Math.max(0, Number.isFinite(earned) ? earned : 0);
  return Math.min(PUNCH_KARMA_BANK_MAX, Math.round(bank + gain));
}

/* ------------------------------------------------------------------------ *
 * HIGH GROUND — the event layer above the normal ceiling.
 * ------------------------------------------------------------------------ */

/**
 * ‼️THE LINE. Above it the punch stops being a score and becomes an event.
 *
 * It sits one point above `maxScore` on purpose: a perfect solo punch is a 999
 * and is SUPPOSED to fall short. Four digits mean the room was in it. Keep this
 * number here, alone and named — the moment it is inlined into a punch
 * calculation it stops being tunable and starts being folklore.
 */
export const PUNCH_HIGH_GROUND_THRESHOLD = 1000;

/**
 * ‼️NOT ONE ANIMATION FOREVER. The bands are POOLS, and the pool a punch draws
 * from is the first thing to widen when the event catalogue grows.
 *
 * The philosophy the ladder encodes: the score is the trigger, the reaction to
 * the place and the people is the reward. Every event here has to happen TO the
 * island and the crowd, never merely on the scoreboard.
 *
 * ‼️This is a separate layer from the Show Director's cards, which still own
 * everything from 0 to 999 and are not a threshold ladder. Do not fold one into
 * the other: the cards are the continuous reaction to a punch, this is the
 * discrete consequence of the room having broken the ceiling together.
 */
export interface PunchHighGroundBand {
  id: string;
  /** Inclusive floor. The first band's floor is the threshold itself. */
  minScore: number;
  /** The pool. One is drawn per qualifying punch, seeded, never at random. */
  events: readonly string[];
}

export const PUNCH_HIGH_GROUND_BANDS: readonly PunchHighGroundBand[] = [
  // Placeholders, and labelled as such. Only `liftoff` is wired today — the
  // ladder exists so the next one is an entry here plus a case in the runner,
  // exactly like a show card.
  { id: "broken", minScore: PUNCH_HIGH_GROUND_THRESHOLD, events: ["liftoff"] },
  { id: "storm", minScore: 1_050, events: ["liftoff"] },
  { id: "rapture", minScore: 1_100, events: ["liftoff"] },
];

/** Which band a finished score lands in, or null if it never left the ground. */
export function punchHighGroundBandFor(
  score: number,
  threshold: number = PUNCH_HIGH_GROUND_THRESHOLD,
): PunchHighGroundBand | null {
  const value = Number(score) || 0;
  if (value < threshold) return null;
  let band: PunchHighGroundBand | null = null;
  for (const candidate of PUNCH_HIGH_GROUND_BANDS) {
    if (value >= candidate.minScore) band = candidate;
  }
  // A threshold tuned BELOW the first band still has to produce an event, or
  // lowering it for a playtest would silently turn the whole layer off.
  return band ?? PUNCH_HIGH_GROUND_BANDS[0] ?? null;
}

/**
 * The band, and which of its events this punch drew.
 *
 * ‼️SEEDED, NEVER `Math.random()`. Every client composes this independently
 * from the same authoritative snapshot, so two people standing next to each
 * other must draw the same event or one of them gets launched into the air
 * while the other watches nothing happen.
 */
export function punchHighGroundEventFor(
  score: number,
  seed: number,
  threshold: number = PUNCH_HIGH_GROUND_THRESHOLD,
): { band: string; event: string } | null {
  const band = punchHighGroundBandFor(score, threshold);
  if (!band || band.events.length === 0) return null;
  const roll = Math.abs(Math.floor(Number(seed) || 0));
  return { band: band.id, event: band.events[roll % band.events.length]! };
}

/**
 * ‼️WHAT A PUNCH CAN ACTUALLY REACH TONIGHT — and why this is a function and
 * not a number anybody is allowed to quote from memory.
 *
 * Owner, 2026-09-08, on a HUD that had been reading `BREAK 1,000` all build:
 * *"It says break the 1000 but I don't think it's possible to break the one
 * 1000 — I've never seen anything above it."* He was right, and it was not
 * close. `punchScoreForQuality01` clamps every punch at `maxScore` (999), the
 * crowd's points are the only thing added on top, and Boost was wired to an
 * empty array — so the ceiling was 999, the threshold was 1000, and the entire
 * High Ground layer had never fired for anybody.
 *
 * ‼️THE LESSON, AND IT IS THE SAME ONE AS THE EFFECT GATES: a goal the game
 * states out loud MUST be derived from what the game can currently pay, never
 * typed into a HUD string. When Boost is off, or nobody is in the room to give
 * it, the honest ceiling is `maxScore` and the line has to say so. Every
 * surface that wants to promise a number asks here.
 */
export function punchReachableCeiling(
  config: PunchMachineAppConfig = defaultPunchMachineAppConfig(),
  crowdLive = false,
): number {
  const solo = Math.max(0, Math.round(Number(config.maxScore) || 0));
  return crowdLive ? solo + PUNCH_BOOST_TOTAL_MAX : solo;
}

/** Whether four digits are on the table at all, for this config and this room. */
export function punchHighGroundReachable(
  config: PunchMachineAppConfig = defaultPunchMachineAppConfig(),
  crowdLive = false,
  threshold: number = PUNCH_HIGH_GROUND_THRESHOLD,
): boolean {
  return punchReachableCeiling(config, crowdLive) >= threshold;
}

export interface PunchMachineAppConfig {
  gameProfile?: PunchGameProfile;
  enabled: boolean;
  /** Solo keeps the reusable cabinet local. Competition synchronizes a queue and leaderboard. */
  mode: PunchMachineMode;
  /** Compact removes disabled game/media assets from a dedicated standalone deployment. */
  bundleProfile: PunchMachineBundleProfile;
  /** Charge time that earns the strongest result. */
  idealChargeMs: number;
  /** Score floor/ceiling for one completed punch. */
  minScore: number;
  maxScore: number;
  /** Time before the machine accepts another player. */
  roundCooldownMs: number;
  /** Authored site zones used by the standalone competition scene. */
  strikeZoneId: string | null;
  queueZoneId: string | null;
  audienceZoneId: string | null;
  audienceGroupId: string | null;
  /** A queued player who never punches cannot hold the machine forever. */
  turnTimeoutMs: number;
  leaderboardSize: number;
  /** Score at or above this value triggers the full spectator celebration. */
  celebrationScore: number;
  soundsEnabled: boolean;
  /** Standalone championship presentation: a walkable cloud island at this world height. */
  skyIslandEnabled: boolean;
  islandHeightM: number;
  fallPromptY: number;
  /**
   * The curved arena screen round the back of the island. Island-only: the GLB
   * is authored concentric with the plaza, so it means nothing without one.
   */
  bigScreenEnabled: boolean;
  /**
   * What the screen plays. Empty leaves the authored dark glass on and creates
   * no VideoPlayer at all — a screen with nothing to show is scenery, not a
   * decode. Empty also falls back to the venue's own default video when Social
   * has one, so the island inherits whatever the room is already playing.
   */
  bigScreenVideoUrl: string;
  /** Screen audio, 0..1. The picture is the point; sound is off by default. */
  bigScreenVolume: number;
  /**
   * Draw the arcade cabinet. Absent means on — every championship is a machine
   * on an island. An explicit false leaves the plaza, the screen and the clouds
   * and skips the hardware, which is how the Cloud Dance Floor reuses this
   * island without a bag in the middle of the cypher.
   */
  cabinetEnabled: boolean;
  /**
   * Which sky hangs off the island. `championship` is the punch trampoline ring.
   * `amphitheater` is two stepped seat-rows on the open mouth of the screen.
   */
  cloudLayout: "championship" | "amphitheater";
  /**
   * Where the ALL-TIME board is kept, if anywhere.
   *
   * Left empty — the default — the island runs exactly as it always has, on the
   * peer-synced board alone. Filling it in ADDS a second, slower board and can
   * never take the first one away. See shared/punch-board-store.ts for why
   * every failure mode of this store resolves to "no all-time rows".
   */
  boardStore: PunchBoardStoreConfig;
}
function finite(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

export function defaultPunchMachineAppConfig(): PunchMachineAppConfig {
  return {
    gameProfile: normalizePunchProfile(undefined),
    enabled: false,
    mode: "solo",
    bundleProfile: "standard",
    idealChargeMs: 850,
    minScore: 120,
    maxScore: 999,
    roundCooldownMs: 2600,
    strikeZoneId: null,
    queueZoneId: null,
    audienceZoneId: null,
    audienceGroupId: null,
    turnTimeoutMs: 20_000,
    leaderboardSize: 5,
    celebrationScore: 900,
    soundsEnabled: true,
    skyIslandEnabled: false,
    islandHeightM: 12,
    fallPromptY: 4,
    bigScreenEnabled: false,
    bigScreenVideoUrl: "",
    bigScreenVolume: 0,
    cabinetEnabled: true,
    cloudLayout: "championship",
    boardStore: defaultPunchBoardStoreConfig(),
  };
}

function optionalId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizePunchMachineAppConfig(
  value: unknown,
): PunchMachineAppConfig {
  const base = defaultPunchMachineAppConfig();
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const minScore = Math.round(finite(raw.minScore, base.minScore, 0, 900));
  const maxScore = Math.round(
    finite(raw.maxScore, base.maxScore, minScore + 1, 9999),
  );
  return {
    gameProfile: normalizePunchProfile(raw.gameProfile),
    enabled: raw.enabled === true,
    mode: raw.mode === "competition" ? "competition" : "solo",
    bundleProfile: raw.bundleProfile === "compact" ? "compact" : "standard",
    idealChargeMs: Math.round(
      finite(raw.idealChargeMs, base.idealChargeMs, 300, 1800),
    ),
    minScore,
    maxScore,
    roundCooldownMs: Math.round(
      finite(raw.roundCooldownMs, base.roundCooldownMs, 1200, 8000),
    ),
    strikeZoneId: optionalId(raw.strikeZoneId),
    queueZoneId: optionalId(raw.queueZoneId),
    audienceZoneId: optionalId(raw.audienceZoneId),
    audienceGroupId: optionalId(raw.audienceGroupId),
    turnTimeoutMs: Math.round(
      finite(raw.turnTimeoutMs, base.turnTimeoutMs, 8_000, 60_000),
    ),
    leaderboardSize: Math.round(
      finite(raw.leaderboardSize, base.leaderboardSize, 1, 10),
    ),
    celebrationScore: Math.round(
      finite(raw.celebrationScore, base.celebrationScore, minScore, maxScore),
    ),
    soundsEnabled: raw.soundsEnabled !== false,
    skyIslandEnabled: raw.skyIslandEnabled === true,
    islandHeightM: finite(raw.islandHeightM, base.islandHeightM, 6, 110),
    fallPromptY: finite(raw.fallPromptY, base.fallPromptY, -10, 95),
    // Island-only by construction: the screen is authored round THIS plaza, so
    // an inherited "on" from a scene with no island can never draw a stray arc.
    //
    // ABSENT means on, present-and-false means off. Every championship saved
    // before the screen existed carries no key at all, and defaulting those to
    // false left the owner regenerating the recipe to get a feature that is
    // simply part of what the island now is. An explicit false still wins, so
    // turning it off stays possible and stays sticky.
    bigScreenEnabled:
      raw.skyIslandEnabled === true && raw.bigScreenEnabled !== false,
    bigScreenVideoUrl:
      typeof raw.bigScreenVideoUrl === "string"
        ? raw.bigScreenVideoUrl.trim()
        : base.bigScreenVideoUrl,
    bigScreenVolume: finite(raw.bigScreenVolume, base.bigScreenVolume, 0, 1),
    // Absent means on, matching every championship saved before this flag
    // existed. An explicit false is the dance-floor island: same clouds, no bag.
    cabinetEnabled: raw.cabinetEnabled !== false,
    cloudLayout:
      raw.cloudLayout === "amphitheater" ? "amphitheater" : "championship",
    boardStore: normalizePunchBoardStoreConfig(raw.boardStore),
  };
}

/** Highest score per visitor, stable across clients and coordinator hand-offs. */
export function rankPunchScores(
  entries: readonly PunchLeaderboardEntry[],
  limit = 5,
): PunchLeaderboardEntry[] {
  const best = new Map<string, PunchLeaderboardEntry>();
  for (const entry of entries) {
    const userId = entry.userId.trim().toLowerCase();
    if (!userId) continue;
    const normalized = {
      supporters: entry.supporters?.map(row => ({ ...row })),
      userId,
      name: entry.name.trim() || "Player",
      score: Math.max(0, Math.round(entry.score)),
      achievedAt: Number.isFinite(entry.achievedAt) ? entry.achievedAt : 0,
    };
    const previous = best.get(userId);
    if (
      !previous ||
      normalized.score > previous.score ||
      (normalized.score === previous.score &&
        normalized.achievedAt < previous.achievedAt)
    ) {
      best.set(userId, normalized);
    }
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.achievedAt - b.achievedAt ||
        a.userId.localeCompare(b.userId),
    )
    .slice(0, Math.max(1, Math.min(10, Math.round(limit))));
}

export function punchReactionIntensity(
  score: number,
  config: PunchMachineAppConfig,
): 1 | 2 | 3 | 4 {
  const span = Math.max(1, config.maxScore - config.minScore);
  const ratio = Math.max(0, Math.min(1, (score - config.minScore) / span));
  if (score >= config.celebrationScore || ratio >= 0.94) return 4;
  if (ratio >= 0.72) return 3;
  if (ratio >= 0.4) return 2;
  return 1;
}

function unit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/**
 * THE SWEEP, AND WHY IT WANDERS.
 *
 * A pure triangle wave is honest for three punches and then becomes a metronome:
 * once you know the period you stop reading the marker and start counting beats,
 * and the only thing the speed ramp can do about that is outrun your hands. That
 * is how deep runs turned into a coin flip — not hard, just faster than a human
 * loop, with the skill removed rather than raised.
 *
 * So from the fourth punch on the marker keeps its readable pace but stops
 * turning around in the same places. Each reversal lands somewhere inside a
 * turn band, drawn from the attempt's seed, so a return trip may come back long
 * or come back short and there is no beat left to count. The floor on those
 * bands (`PUNCH_TURN_LOW_MAX_01` / `PUNCH_TURN_HIGH_MIN_01`) is the promise
 * that it can never flick: the shortest possible leg still runs 0.62 of the
 * meter, so the marker is always visible on approach long enough to release on.
 *
 * ‼️Legs run at CONSTANT marker speed, so a short leg takes proportionally less
 * time. The reaction window — how long the marker spends inside the sweet band
 * — is therefore identical on every leg, long or short. The variation moves the
 * RHYTHM, never the window; difficulty comes from not knowing when it returns,
 * which is a thing you can get better at.
 */
/** The nearest to the left edge a reversal may happen at full variance. */
export const PUNCH_TURN_LOW_MAX_01 = 0.2;
/** The nearest to the right edge a reversal may happen at full variance. */
export const PUNCH_TURN_HIGH_MIN_01 = 0.82;

/**
 * A deterministic 0..1 per reversal. Integer-only LCG — every product stays
 * under 2^53, so it is bit-identical on every client. ‼️Do not "simplify" this
 * to a `Math.sin` hash: the last bit of `sin` is engine-specific and the local
 * player, the coordinator and every spectator would draw different markers.
 */
function punchSweepNoise01(seed: number, index: number): number {
  const base = Math.floor(Math.abs(Number.isFinite(seed) ? seed : 0));
  // ‼️Hash the seed BEFORE the index is folded in, with a different constant.
  // Adding the index straight onto the seed aliases: attempt N's reversal k+1
  // and attempt N+1's reversal k land on the same number whenever the two
  // charge starts differ by that constant, and the wander develops a grain.
  let s = base % 2147483647;
  s = (s * 48271) % 2147483647;
  s = (s + index * 2654435761) % 2147483647;
  s = (s * 48271) % 2147483647;
  s = (s * 48271) % 2147483647;
  return s / 2147483647;
}

/**
 * Where reversal `index` happens. Even indices turn on the left, odd on the
 * right. Index 0 is pinned to the left edge so every charge OPENS the same way
 * — the first crossing is always readable, and the surprise starts on the way
 * back. At `variance` 0 this is exactly the old triangle's 0 and 1.
 */
export function punchSweepTurn01(
  index: number,
  seed: number,
  variance: number,
): number {
  if (index <= 0) return 0;
  const v = unit(variance);
  const r = punchSweepNoise01(seed, index);
  return index % 2 === 0
    ? PUNCH_TURN_LOW_MAX_01 * v * r
    : 1 - (1 - PUNCH_TURN_HIGH_MIN_01) * v * r;
}

/** A reversible 0→1→0 timing sweep. The visible HUD and coordinator use the same clock. */
export function punchTimingMarker01(
  elapsedMs: number,
  seed = 0,
  speed = 1,
  variance = 0,
): number {
  // `speed` is the difficulty ramp: it stretches the clock the marker reads, so
  // the sweep quickens while the charge itself is untouched. Power is still
  // measured from raw milliseconds — only the aim gets harder.
  const t = Math.max(0, elapsedMs) * Math.max(0.25, speed);
  const v = unit(variance);
  // Plain triangle for the opening three punches, and for legacy/unseeded callers.
  if (v <= 0 || !seed) {
    const phase = ((t % PUNCH_TIMING_PERIOD_MS) / PUNCH_TIMING_PERIOD_MS) * 2;
    return phase <= 1 ? phase : 2 - phase;
  }
  // A half period is one full-width leg, so a leg of span `d` takes `d * half`.
  const half = PUNCH_TIMING_PERIOD_MS / 2;
  let cursor = 0;
  let from = punchSweepTurn01(0, seed, v);
  // Bounded: a charge is capped at twice ideal, which is a handful of legs. The
  // guard exists so a caller passing a silly elapsed cannot spin the frame.
  for (let leg = 0; leg < 512; leg += 1) {
    const to = punchSweepTurn01(leg + 1, seed, v);
    const duration = Math.abs(to - from) * half;
    if (duration <= 0) return unit(to);
    if (t < cursor + duration) {
      return unit(from + (to - from) * ((t - cursor) / duration));
    }
    cursor += duration;
    from = to;
  }
  return unit(from);
}
/**
 * OVERHOLD — WHAT REPLACED THE GUILLOTINE.
 *
 * ‼️There used to be an auto-punch. The charge clock ran for `idealChargeMs * 2`
 * in competition and `* 4` in solo, and when it expired the coordinator threw
 * the punch FOR you at a held time you never chose. Owner, 2026-09-04: "if I
 * miss the first 3 back and forwards it automatically auto punches". That is
 * the single worst thing a timing game can do — it takes the decision away at
 * exactly the moment the player is exercising it, and the punch it throws is
 * not the punch anyone would have thrown.
 *
 * The fix is the one the design always wanted: THE PLAYER ALWAYS RELEASES.
 * Waiting is never forbidden, it is just never free.
 *
 *   PLATEAU   `PUNCH_OVERHOLD_PLATEAU` ideals at full power. This is the room
 *             the plateau was introduced for — charge to 100%, then read the
 *             marker at leisure. Nothing about a normal punch changes.
 *   BLEED     past it, power falls `PUNCH_OVERHOLD_BLEED_PER_IDEAL` per further
 *             ideal, down to `PUNCH_OVERHOLD_FLOOR`. A camper still lands a
 *             punch; it is a weak one, and the POWER BAR says so while they
 *             hold it, so the cost is visible before it is paid.
 *   ACCELERATE the marker speeds up with the same clock — see
 *             `punchHoldSpeed`. Waiting for the perfect pass makes every
 *             subsequent pass harder to read.
 *
 * The two together are the promised shape: hold as long as you like, and the
 * odds of a good result fall the whole time. There is no cliff and no seizure
 * of control, so the player who waits loses to the player who commits without
 * ever being told to stop waiting.
 */
export const PUNCH_OVERHOLD_PLATEAU = 2;
/** Power lost per extra ideal-charge held beyond the plateau. */
export const PUNCH_OVERHOLD_BLEED_PER_IDEAL = 0.3;
/** Power never falls below this: a held punch is weak, never a dead one. */
export const PUNCH_OVERHOLD_FLOOR = 0.3;
/** How much the marker quickens per extra ideal-charge past the plateau. */
export const PUNCH_OVERHOLD_SPEED_PER_IDEAL = 0.24;
/** The overhold ramp's own ceiling, applied on top of `PUNCH_SPEED_MAX`. */
export const PUNCH_OVERHOLD_SPEED_MAX = 2;

export function punchPowerQuality01(
  heldMs: number,
  idealChargeMs: number,
): number {
  // Fill to full and PLATEAU. The old curve peaked only at exactly ideal and
  // decayed after, which made full power and good timing mutually exclusive —
  // one release instant cannot satisfy two independent clocks. Now the player
  // charges to 100% first and then reads the marker at leisure.
  const ideal = Math.max(1, idealChargeMs);
  const t = Math.max(0, heldMs) / ideal;
  if (t >= 1) {
    // ...and then it BLEEDS. See the overhold note above: the plateau is real
    // room to aim in, not an invitation to stand there.
    if (t <= PUNCH_OVERHOLD_PLATEAU) return 1;
    return Math.max(
      PUNCH_OVERHOLD_FLOOR,
      1 - (t - PUNCH_OVERHOLD_PLATEAU) * PUNCH_OVERHOLD_BLEED_PER_IDEAL,
    );
  }
  // Ease-in ramp: slow start, satisfying surge into full.
  return unit(t * t * (3 - 2 * t));
}

/**
 * The overhold half of the difficulty, as a speed multiplier on the sweep.
 *
 * ‼️It is a function of `heldMs` ALONE (plus the config's ideal), which is what
 * keeps `punchTimingMarker01` deterministic: every client feeding the same held
 * time still computes the same marker, so the coordinator, the puncher and
 * twenty spectators cannot disagree about where the needle was. A speed that
 * read a wall clock, or a frame counter, would break that on the first dropped
 * frame.
 */
export function punchHoldSpeed(heldMs: number, idealChargeMs: number): number {
  const ideal = Math.max(1, idealChargeMs);
  const over = Math.max(0, heldMs) / ideal - PUNCH_OVERHOLD_PLATEAU;
  if (over <= 0) return 1;
  return Math.min(
    PUNCH_OVERHOLD_SPEED_MAX,
    1 + over * PUNCH_OVERHOLD_SPEED_PER_IDEAL,
  );
}

/**
 * `assist01` is the crowd's hand on the aim — see `punchCrowdAssist01`. It only
 * ever WIDENS the band, and it defaults to zero, so every caller written before
 * the crowd could touch the aim still reads the curve it always did.
 */
export function punchTimingQuality01(marker01: number, assist01 = 0): number {
  // Two-stage curve, no cliffs: anywhere INSIDE the gold band keeps 0.85..1.0
  // (a landed hit feels landed), and outside it falls smoothly across ~2.5
  // band-widths — the 500-to-900 gap spans readable distance, not millimetres.
  const distance = Math.abs(unit(marker01) - PUNCH_TIMING_TARGET_01);
  const band = punchTimingSweetWidth01(assist01);
  if (distance <= band) {
    // 0.70..1.0 across the band: landing it feels landed, but 900+ wants the
    // CENTRE — the first cut made the whole band pay like a bullseye.
    const inBand = distance / band;
    return unit(1 - 0.3 * inBand * inBand);
  }
  const outside = (distance - band) / (band * 2);
  return unit(0.7 * (1 - outside));
}

/**
 * THE CURVE FROM QUALITY TO A NUMBER — where the top of the board is earned.
 *
 * ‼️The three channels are ADDED (see `punchScoreForAttempt`), and that is right:
 * a `min()` gate was tried, dragged every attempt toward its weakest component
 * and capped real play near 550, so each channel has to pay on its own. But a
 * straight sum mapped straight onto the score compressed the whole board into
 * its top third. Measured against the shipped curve at the default config:
 *
 *     full charge, centred marker, 75% aim  ->  933 / 999
 *     full charge, marker well off,  50% aim ->  577 / 999
 *     short tap,   marker well off,  50% aim ->  395 / 999
 *
 * A punch that misses the timing band by two band-widths and half-misses the
 * bag still read as a 577, three hundred points clear of the floor — and 900,
 * which is `celebrationScore` AND `PUNCH_ROUND_EXTEND_SCORE` AND the first rung
 * of the escalation ladder, fell out of ordinary play. Everything the machine
 * has to say about a great punch was being spent on an average one.
 *
 * Squaring fixes that without touching what the channels mean. It is monotonic
 * in each of them, so improving any one thing still visibly pays; it leaves a
 * perfect punch at exactly `maxScore`; and it makes the last tenth of quality
 * worth far more than the first, which is what a leaderboard needs to separate
 * people at all. The same three punches become 872 / 358 / 206, and a casual
 * first-timer (sloppy timing, 60% aim) still scores 642 in reaction tier 2
 * rather than going quiet. Every number above is pinned by a test, so this
 * comment cannot quietly stop being true.
 *
 * An exponent, not a hand-drawn table, so the shape stays legible and the
 * runtime, the coordinator and the tests cannot drift from one another.
 */
export const PUNCH_QUALITY_CURVE = 2;

/** The finished 0..1 quality, on the machine's own scale. */
export function punchScoreForQuality01(
  quality01: number,
  config: PunchMachineAppConfig = defaultPunchMachineAppConfig(),
): number {
  const curved = Math.pow(unit(quality01), PUNCH_QUALITY_CURVE);
  return Math.round(
    config.minScore + (config.maxScore - config.minScore) * curved,
  );
}

/**
 * THE THREE CHANNELS, WEIGHTED, PLUS THE CHERRY FOR LANDING ALL THREE.
 *
 * Additive, so every factor pays out on its own — the old min() gate dragged
 * every attempt toward its weakest component and capped real play near 550. The
 * synergy term is the bonus for landing all three, not the gate.
 *
 * ‼️IT IS A FUNCTION NOW BECAUSE THE RESULT CARD ASKS IT COUNTERFACTUALS. The
 * ledger needs "what would this punch have scored with perfect timing", which
 * means running the same arithmetic with one input swapped. Inline, that meant
 * the weights would have had to be written out four times, and four copies of
 * 0.38 is how a scoreboard quietly stops agreeing with itself.
 *
 * `gameProfile` divides the raw figure by 1.04 instead of clamping it. The three
 * weights sum to 1 and the synergy term adds up to 0.04 on top, so a perfect
 * punch reaches 1.04 and the plain `unit()` throws that headroom away — every
 * attempt inside the top 4% scores identically. The profile scales instead, and
 * keeps the whole range distinct all the way to the ceiling.
 */
export function punchSkillQuality01(
  power01: number,
  timing01: number,
  aim01: number,
  gameProfile = false,
): number {
  const p = unit(power01);
  const t = unit(timing01);
  const a = unit(aim01);
  const raw = p * 0.38 + t * 0.36 + a * 0.26 + p * t * a * 0.04;
  return unit(gameProfile ? raw / 1.04 : raw);
}

/**
 * Three visible, skill-based criteria: charge power, timing-window overlap and
 * pointer accuracy on the leather bag. A perfect result requires all three.
 *
 * `boosts` is the fourth number on the card and the only one the puncher does
 * not control: it is what the spectators handed over, one entry per person. It
 * is ADDED to the finished score rather than mixed into the quality, so the
 * punch is still scored on its own merits, the crowd's gift stays legible as
 * its own line, and the sum is allowed to carry the result past `maxScore` —
 * which is the entire point of the mechanic. See `PUNCH_HIGH_GROUND_THRESHOLD`.
 */
export function punchScoreForAttempt(
  attempt: {
    heldMs: number;
    timingMarker01: number;
    accuracy01: number;
    stancePower?: number;
    /** Every spectator who Boosted, with their own points. Empty is normal. */
    boosts?: readonly PunchBoostContribution[];
    /** The puncher's banked karma at the instant of contact. */
    karma?: number;
    /** Seeds the High Ground draw. Same seed on every client, or they disagree. */
    eventSeed?: number;
  },
  config: PunchMachineAppConfig = defaultPunchMachineAppConfig(),
): PunchAttemptBreakdown {
  const power01 = punchPowerQuality01(config.gameProfile ? Math.min(attempt.heldMs, config.idealChargeMs * 2) : attempt.heldMs, config.idealChargeMs);
  const stancePower = Number.isFinite(attempt.stancePower) ? Math.max(0.8, Math.min(1, attempt.stancePower!)) : 1;
  const timingMarker01 = unit(attempt.timingMarker01);
  // ‼️THE WINDOW THE CROWD BOUGHT, read off the same ledger that pays the
  // points, so the band this punch was scored against and the band the result
  // card reports can never be two different bands.
  const crowdAssist01 = punchCrowdAssist01(attempt.boosts);
  const timing01 = punchTimingQuality01(timingMarker01, crowdAssist01);
  const accuracy01 = unit(attempt.accuracy01);
  // Additive, so every factor pays out on its own — the old min() gate dragged
  // every attempt toward its weakest component and capped real play near 550.
  // The synergy bonus is the cherry for landing all three, not the gate.
  const aim = Math.pow(accuracy01, 1.25);
  const profile = !!config.gameProfile;
  const quality = punchSkillQuality01(power01, timing01, aim, profile);
  const skillScore = punchScoreForQuality01(quality, config);
  // ‼️WHAT EACH CHANNEL LEFT ON THE TABLE. One channel raised to perfect, the
  // other two untouched, scored again — the marginal worth of the fix rather
  // than a share of a total, because the curve makes shares meaningless. See
  // `missedPower` on the breakdown for why these must never be added up.
  const scoreWith = (p: number, t: number, a: number) =>
    punchScoreForQuality01(punchSkillQuality01(p, t, a, profile), config);
  const missedPower = Math.max(0, scoreWith(1, timing01, aim) - skillScore);
  const missedTiming = Math.max(0, scoreWith(power01, 1, aim) - skillScore);
  const missedAim = Math.max(0, scoreWith(power01, timing01, 1) - skillScore);
  // ‼️KARMA IS SPENT ON THE PUNCH, NOT ON THE PUNCH PLUS THE CROWD. Applied to
  // the skill score and re-clamped at `maxScore`, so it can lift a scrappy punch
  // to a perfect one and can never, alone, put a fourth digit on the cabinet.
  const karmaMultiplier = punchKarmaSelfMultiplier(attempt.karma ?? 0);
  const karmaSpent = punchKarmaSpend(attempt.karma ?? 0);
  // The unclamped karma punch, kept so the ceiling's bite has a number. The
  // multiplier is never below 1, so both figures below are always >= 0.
  const karmaRaw = Math.round(skillScore * karmaMultiplier);
  const baseScore = Math.min(config.maxScore, karmaRaw);
  const karmaGain = baseScore - skillScore;
  const karmaClipped = karmaRaw - baseScore;
  // The crowd, resolved once: the list, its total, and what it did to the score.
  const gain = config.gameProfile?.crowdGain ?? 1;
  const contributions = (attempt.boosts ?? []).map(entry => ({ ...entry,
    points: entry.npc ? entry.points : Math.round(entry.points * gain),
  }));
  // ‼️THE STANCE PENALTY IS A DEDUCTION, so the ledger has to carry it or FINAL
  // stops adding up — which is the exact failure this card was built to end.
  // `stancePower` is clamped to [0.8, 1] upstream, so this is never negative.
  const stanceScore = Math.round(baseScore * stancePower);
  const stanceLost = baseScore - stanceScore;
  const award = punchAwardCrowdBoost(stanceScore, contributions);
  // ‼️THE HOOK. One place, off the finished score, so the event layer can never
  // drift from the number the cabinet is showing.
  const drawn = punchHighGroundEventFor(
    award.score,
    Number(attempt.eventSeed) || award.score,
  );
  return {
    heldMs: Math.max(0, Number.isFinite(attempt.heldMs) ? attempt.heldMs : 0),
    power01,
    timingMarker01,
    timing01,
    accuracy01,
    baseScore: stanceScore,
    stancePower,
    skillScore,
    karmaMultiplier,
    karmaSpent,
    missedPower,
    missedTiming,
    missedAim,
    karmaGain,
    karmaClipped,
    stanceLost,
    crowdAssist01,
    boosts: award.boosts,
    crowdBoost: award.crowdBoost,
    humanBoost: award.humanBoost,
    crowdTrimmed: award.trimmed,
    score: award.score,
    highGround: !!drawn,
    highGroundTier: drawn?.band ?? null,
    highGroundEvent: drawn?.event ?? null,
    circleBest: punchCircleBest(award.boosts),
    focusUsed: 0,
  };
}

/**
 * One classic strength-machine result. Holding near ideal wins; short taps and
 * over-holds fall away smoothly. `variation01` is deterministic input supplied
 * by runtime/tests, never hidden randomness inside the contract.
 */
export function punchScoreForCharge(
  heldMs: number,
  variation01: number,
  config: PunchMachineAppConfig = defaultPunchMachineAppConfig(),
): number {
  const timing = punchPowerQuality01(heldMs, config.idealChargeMs);
  const variation = (Math.max(0, Math.min(1, variation01)) - 0.5) * 0.08;
  const power = Math.max(0, Math.min(1, timing + variation));
  return Math.round(
    config.minScore + (config.maxScore - config.minScore) * power,
  );
}

/**
 * The score reveal is THEATRE, staged in three beats every client agrees on:
 * HOLD — the counter sits at 000 through the slam and one extra breath;
 * COUNT — a power-4 crawl where the last tens take the longest, so a 950
 * visibly slows through 900 and creeps the rest of the way;
 * LINGER — the full number rests before the round moves on.
 */
export const PUNCH_SCORE_HOLD_MS = 1_080;
export const PUNCH_SCORE_COUNT_MS = 2_600;
export const PUNCH_SCORE_LINGER_MS = 600;
/**
 * ‼️HOW LONG THE RESULT CARD IS HELD ON SCREEN, WHATEVER THE ROUND DOES.
 *
 * Owner, 2026-09-06, third report: *"it appears and disappears too fast. You
 * need to be able to look at it, read and understand how your score came
 * about."* The card had already been given a kept copy through `ready`, but
 * the HUD dropped it the moment cooldown ended, and after the last punch of a
 * turn the bag moves on within a second. So the card is held for this long
 * from the moment the count lands, across phases and across the handover,
 * and only starting your OWN next punch dismisses it early. The round's pace
 * is untouched — this is a reading beat laid over dead time, not added to it.
 */
export const PUNCH_CARD_HOLD_MS = 10_000;
export const PUNCH_SCORE_PHASE_MS =
  PUNCH_SCORE_HOLD_MS + PUNCH_SCORE_COUNT_MS + PUNCH_SCORE_LINGER_MS;

/**
 * The count-up itself, and it lives HERE — in the contract — because more than
 * one surface draws it and a second copy is how the suspense got spoiled.
 *
 * ‼️THE ARC MUST NEVER KNOW THE NUMBER BEFORE THE CABINET DOES. The big screen
 * shipped with its verdict card writing the FINAL score on the frame of impact
 * while the marquee was still crawling up from 000 — so the whole ring read the
 * answer off the sixteen-metre screen behind the machine and the three seconds
 * of theatre in front of it counted for nothing. Every surface that shows a
 * score during the scoring phase calls this, off the same phase start, so they
 * can only ever agree.
 *
 * `sincePhaseStartMs` is time since the RELEASE (the scoring phase's first
 * frame), not since the slam — the slam is an event inside this window.
 */
export function punchRevealShownScore(
  score: number,
  sincePhaseStartMs: number,
  countMs = PUNCH_SCORE_COUNT_MS,
): number {
  const t = Math.max(
    0,
    Math.min(
      1,
      (sincePhaseStartMs - PUNCH_SCORE_HOLD_MS) / countMs,
    ),
  );
  return Math.round(score * (1 - Math.pow(1 - t, 4)));
}

/** True once the counter has topped out — the moment a verdict may be named. */
export function punchRevealLanded(sincePhaseStartMs: number, countMs = PUNCH_SCORE_COUNT_MS): boolean {
  return sincePhaseStartMs >= PUNCH_SCORE_HOLD_MS + countMs;
}

/* ------------------------------------------------------------------------ *
 * THE CUT — what a 999 gets and nothing else does.
 * ------------------------------------------------------------------------ */

/**
 * ‼️THE ONE EFFECT THAT IS SUBTRACTION, AND WHY IT HAD TO BE.
 *
 * Owner, 2026-09-09: *"the 999 is never celebrated — it feels like any other
 * score."* He was right, and the reason is that by 990 every ADDITIVE channel
 * is already saturated: the island rolls, the cabinet blows out, meteors,
 * blizzard, blackout, the arc collapses, the choir may open the heavens. A
 * fifteenth simultaneous effect at 999 is invisible. There was nothing left to
 * turn up.
 *
 * So the ceiling punch is the one punch the machine answers by turning
 * EVERYTHING OFF. Silence, darkness, and one gold plate blinking the number.
 * Nothing else in this game has ever gone quiet, which is exactly why it reads
 * at any intensity and costs no particle budget to do.
 *
 * ‼️IT IS FLOOR, NOT A CARD. Do not move this into `PUNCH_SHOW_CATALOG`. Cards
 * have cooldowns and rarity rolls, and a 999 that *sometimes* goes quiet is
 * worse than one that never does — the whole effect is that it means one thing
 * every time. 999 is rare enough to be its own cooldown.
 *
 * ‼️AND IT MAY NOT DEPEND ON THE CHOIR. `punchClaimDivineMoment` is a witnessed
 * RECORD with a five-minute cooldown, not a score threshold, so the second 999
 * anybody sees gets no choir at all. The cut has to carry the moment alone.
 */
export const PUNCH_PERFECT_CUT_MS = 1_200;

/**
 * Four pulses across the cut. The plate starts LIT, so the number that just
 * landed is never snatched away on the frame it arrives — the blink is the
 * machine holding it up, not a flicker.
 */
export const PUNCH_PERFECT_CUT_PULSE_MS = 300;
/** How much of each pulse the plate is lit for. */
const PUNCH_PERFECT_CUT_LIT_MS = 180;

/**
 * ‼️EXACTLY THE CEILING, NEVER `>=`. Above `maxScore` is High Ground, which is
 * a different moment with a different verb — the cut STOPS the world, liftoff
 * THROWS it — and a 1043 must get its own event rather than this one.
 */
export function punchIsPerfectScore(
  score: number,
  config: PunchMachineAppConfig = defaultPunchMachineAppConfig(),
): boolean {
  const ceiling = Math.max(0, Math.round(Number(config.maxScore) || 0));
  return ceiling > 0 && Math.round(score) === ceiling;
}

/** How much the scoring phase is stretched by, for this score. Zero normally. */
export function punchPerfectCutMs(
  score: number,
  config: PunchMachineAppConfig = defaultPunchMachineAppConfig(),
): number {
  return punchIsPerfectScore(score, config) ? PUNCH_PERFECT_CUT_MS : 0;
}

/**
 * Where we are inside the cut: `-1` when there is no cut running, otherwise
 * milliseconds since it began.
 *
 * ‼️THE CUT STARTS WHERE THE COUNT ENDS — it never eats into the crawl. The
 * count length is fixed for every score on purpose (`punchRevealCountMs`, "equal
 * suspense"), so shortening it for a 999 would disclose the answer through the
 * timing. This is a beat laid AFTER the number has arrived, which discloses
 * nothing that is not already on the plate.
 */
export function punchPerfectCutSince(
  score: number,
  sincePhaseStartMs: number,
  countMs = PUNCH_SCORE_COUNT_MS,
  config: PunchMachineAppConfig = defaultPunchMachineAppConfig(),
): number {
  if (!punchIsPerfectScore(score, config)) return -1;
  const from = PUNCH_SCORE_HOLD_MS + countMs;
  const t = sincePhaseStartMs - from;
  return t >= 0 && t < PUNCH_PERFECT_CUT_MS ? t : -1;
}

/** Is the plate lit this frame? Starts lit; four pulses across the cut. */
export function punchPerfectCutLit(cutSinceMs: number): boolean {
  if (cutSinceMs < 0) return false;
  return cutSinceMs % PUNCH_PERFECT_CUT_PULSE_MS < PUNCH_PERFECT_CUT_LIT_MS;
}

/**
 * The verdict gate, cut included. Every surface that waits for the count to
 * stop waits for THIS instead, or the result card prints "HIGH GROUND" over a
 * screen that is supposed to be empty and silent.
 */
export function punchRevealSettled(
  score: number,
  sincePhaseStartMs: number,
  countMs = PUNCH_SCORE_COUNT_MS,
  config: PunchMachineAppConfig = defaultPunchMachineAppConfig(),
): boolean {
  return sincePhaseStartMs >= PUNCH_SCORE_HOLD_MS + countMs + punchPerfectCutMs(score, config);
}

/**
 * After the number lands the machine reloads: the bag is still on its way down
 * and the button is dead. That wait used to be silent and unexplained, which
 * read as a broken game — it is now short, shown as a filling bar, and matched
 * by the bag's descent.
 */
export const PUNCH_RELOAD_MS = 1_700;

/**
 * ‼️THE MACHINE GETS FASTER WHEN YOU DO — and this is the ONLY dial that moves.
 *
 * Owner, 2026-09-05: *"I want the game to be just much more fun than this.
 * There's too little action."* Measured, a punch costs `PUNCH_SCORE_HOLD_MS` +
 * `PUNCH_SCORE_COUNT_MS` + `PUNCH_SCORE_LINGER_MS` + `PUNCH_RELOAD_MS` = 5.98
 * seconds in which the player does nothing at all. That is the complaint.
 *
 * ‼️THE CRAWL IS NOT TOUCHED, AT ANY SCORE. The count-up is the suspense and
 * the biggest punch is exactly the one that has earned the full drumroll —
 * shortening it on a 999 would take the payoff away from the punch that paid
 * for it. What is cut is the RELOAD, which is not theatre: it is a dead button
 * and a bag on its way down, and its whole job is to end.
 *
 * So a hot round reads bang — drumroll — bang, and the streak finally FEELS
 * like a streak instead of three separate ceremonies with a wait between them.
 *
 * ‼️THE STEP AT `PUNCH_ROUND_EXTEND_SCORE` IS DELIBERATELY A CLIFF, NOT A RAMP.
 * 900 is already the line that grants an extra punch and opens the streak
 * ladder; giving it a third meaning costs nothing to learn and makes the whole
 * threshold louder. A smooth ramp from 800 would be unreadable — nobody can
 * feel 140 ms of reload against a number they cannot see.
 *
 * ‼️AND THE FLOOR IS NOT NEGOTIABLE. `ARM_RETURN_MS` in punch-machine.ts is
 * derived from this so the bag lands exactly as the button comes back; drop
 * this below the time the ball needs to visibly fall and the machine reloads
 * with its own bag still in the roof.
 */
export const PUNCH_RELOAD_HOT_MS = 1_000;
/** Each streak rung past the first shaves this much more off the reload. */
export const PUNCH_RELOAD_STREAK_STEP_MS = 120;
/** However deep the run goes, the bag still needs this long to come down. */
export const PUNCH_RELOAD_FLOOR_MS = 640;

/**
 * How long the machine is out of action after a punch of `score` on a run of
 * `streak`. ‼️THE ONE CALL SITE for every surface that waits: the coordinator's
 * cooldown clock, the solo loop, the HUD's filling bar and the bag's descent
 * all read this, because a reload the bar disagrees with is the same bug as a
 * bag left hanging.
 */
export function punchReloadMs(score: number, streak = 0): number {
  const value = Number.isFinite(score) ? score : 0;
  if (value < PUNCH_ROUND_EXTEND_SCORE) return PUNCH_RELOAD_MS;
  // The first 900 collects the flat hot reload; the ladder pays from the second,
  // exactly as `PUNCH_STREAK_BONUS` does, so one punch is never paid twice.
  const rung = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
  const rungs = Math.max(0, rung - 1);
  return Math.max(
    PUNCH_RELOAD_FLOOR_MS,
    PUNCH_RELOAD_HOT_MS - rungs * PUNCH_RELOAD_STREAK_STEP_MS,
  );
}

/**
 * A ROUND is the unit of play, in solo and in the queue alike: three punches
 * that add up to one total. Land a big one and the machine grants another
 * punch onto the same round, so a hot streak visibly extends itself instead of
 * ending on a fixed count — and because the total is what scores, a weak first
 * punch costs you but never ends your run.
 */
export const PUNCH_ROUND_ATTEMPTS = 3;
export const PUNCH_ROUND_EXTEND_SCORE = 900;
/**
 * Not a game rule — a runaway guard. A run ends when the player finally misses
 * the threshold, and the speed ramp below is what makes that inevitable; this
 * only stops a hypothetical perfect machine from counting forever.
 */
export const PUNCH_ROUND_ATTEMPTS_MAX = 99;

/* -------------------------------------------------------------------------- *
 * THE QUEUE'S CLAIM ON THE BAG — a cap on PEOPLE, never on punches.
 * -------------------------------------------------------------------------- */

/**
 * ‼️A ROUND MAY GROW FOREVER. THE PUNCHES ARE THE GAME.
 *
 * There was a fairness rule here once: eight punches a turn the moment anybody
 * human was waiting, and a token that carried the interrupted streak back to a
 * shelf. It solved a real problem — nine people in the line and one player
 * riding 900 after 900 — and it solved it in the one place the game cannot
 * afford to be touched. A player mid-streak handed a LAST PUNCH is being told
 * the machine, not their hands, decided where the run ended. Owner, 2026-09-09:
 * *"I was killing it, smashing every one, and at some point it still just ended
 * the session."* That is this rule being felt, and it is the wrong feeling.
 *
 * So the pressure comes off the round and goes onto the DOOR instead. The bag
 * belongs to whoever is holding it for as long as they keep beating the
 * threshold, and the ramp is what ends a run; what is limited is how many
 * people may be standing in the line waiting for that to happen — four of them,
 * counted at the door, house bot excluded.
 *
 * ‼️NEVER REINTRODUCE A PER-TURN PUNCH CEILING. If the rotation stalls, tighten
 * the shot clock or the seat count — never the punches.
 *
 * The door itself is `PUNCH_PLAYERS_MAX`, declared far above beside the HUD copy
 * that prints it. That comment has promised "the game itself has no punch cap"
 * since it was written; this is the change that makes the promise true.
 */
export function punchQueueHasRoom(humansInPlay: number): boolean {
  const inPlay = Number.isFinite(humansInPlay)
    ? Math.max(0, Math.floor(humansInPlay))
    : 0;
  return inPlay < PUNCH_PLAYERS_MAX;
}

/**
 * THE RING — WHERE THE FIFTH PERSON STANDS, AND NOBODY IS REFUSED.
 *
 * The door above is right and was only half a rule: a cap with nothing behind
 * it is a wall. The fifth person to press JOIN was dropped in silence on the
 * coordinator — no line, no place, no promise — while their own button went on
 * reading their local opt-in, because the refusal never travelled back to it.
 * Eight people on the island: four playing a game, four pressing a button that
 * did nothing.
 *
 * So everybody comes in. Four hold seats; everybody else stands in the ring, in
 * arrival order, and takes the next seat that frees. The cap limits how many
 * play AT ONCE — which is all it was ever for — instead of who is allowed to
 * want a turn.
 *
 * ‼️THE RING IS NOT A SECOND QUEUE. Nobody in it is waiting for a turn: they
 * are waiting for a SEAT, and the seat is what deals the turn. One promotion
 * rule, one order, and no way for two lines to disagree about who is next.
 *
 * ‼️AND THE RING IS WHERE THE OTHER GAME IS PLAYED. A person in it is a
 * spectator by every other rule in this file — they store Focus, they can win a
 * Fumble Rescue. Waiting is a seat in the crowd, not an empty screen.
 */
export const PUNCH_RING_MAX = 16;
export function punchRingHasRoom(ringSize: number): boolean {
  const size = Number.isFinite(ringSize) ? Math.max(0, Math.floor(ringSize)) : 0;
  return size < PUNCH_RING_MAX;
}

/**
 * HOW LONG UNTIL A SEAT, IN MILLISECONDS — MEASURED, NEVER GUESSED.
 *
 * `paceMs` is the mean of the last few COMPLETED rounds on this machine, so the
 * estimate is of the machine the reader is actually standing in front of: a
 * room of beginners turns over in twenty seconds, one player riding 900s does
 * not, and no constant typed in here could describe both.
 *
 * ‼️NO PACE, NO NUMBER. Nothing has finished yet on a machine that just woke
 * up, and an invented "~60 S" on the first join is a promise the room never
 * made. Zero here means the line prints a place and no time — the same rule
 * that stopped the goal line naming a target nobody could reach.
 *
 * Seats free one at a time and each one takes the person at the front, so place
 * N waits N rounds; the front of the ring waits exactly ONE.
 */
export function punchSeatWaitMs(place: number, paceMs: number): number {
  const n = Number.isFinite(place) ? Math.floor(place) : 0;
  const pace = Number.isFinite(paceMs) ? Math.max(0, Math.floor(paceMs)) : 0;
  if (n <= 0 || pace <= 0) return 0;
  return n * pace;
}

/**
 * The ONE line a person in the ring reads: their place always, a time only when
 * the machine has measured one. Rounded to five seconds under a minute and a
 * half and to whole minutes above it — a waiting estimate that reads "~47 S"
 * claims a precision the next round will not honour.
 */
export function punchRingLine(place: number, paceMs: number): string {
  const n = Number.isFinite(place) ? Math.floor(place) : 0;
  if (n <= 0) return '';
  const wait = punchSeatWaitMs(n, paceMs);
  if (wait <= 0) return `#${n} IN THE RING`;
  if (wait < 90_000) return `#${n} IN THE RING  ·  NEXT SEAT ~${Math.max(5, Math.round(wait / 5000) * 5)} S`;
  return `#${n} IN THE RING  ·  NEXT SEAT ~${Math.max(2, Math.round(wait / 60_000))} MIN`;
}


/**
 * THE RAMP — TWO DIALS, AND THE SECOND ONE IS THE REAL DIFFICULTY.
 *
 * The opening three punches are played at the honest speed with a plain
 * triangle sweep. From the fourth on, two things change together:
 *
 *   SPEED  (`punchRoundSpeed`)    the marker moves quicker — a little.
 *   VARIANCE (`punchRoundVariance`) the marker stops reversing in the same
 *                                  places, so the return trip may be long or
 *                                  short and the rhythm cannot be counted.
 *
 * ‼️THE SPEED STEP WAS CUT FROM 18% TO 8% AND CAPPED, AND THAT IS THE POINT.
 * The old ramp compounded to 2.08x by the ninth punch and 3.16x by the
 * fifteenth, which left 74ms and then 49ms of marker inside the sweet band —
 * under human reaction time, never mind the render-and-click loop on top of it.
 * Deep runs were not difficult, they were a coin flip, and the skill had been
 * removed rather than raised. The cap holds the window at 96ms or better
 * forever, so there is always room to react.
 *
 * What replaces the missing speed is unpredictability. That is the dial that
 * can climb without a ceiling problem, because it never shrinks the window —
 * legs run at constant marker speed, so the time spent crossing the band is the
 * same on a long leg and a short one. You just do not know which is coming.
 * Reading the marker is a skill; outrunning your own nervous system is not.
 *
 * The runaway guard is `PUNCH_ROUND_ATTEMPTS_MAX`, not the ramp — a run now
 * ends when the player finally misreads a reversal.
 */
export const PUNCH_SPEED_STEP = 0.08;
/** The marker never sweeps faster than this, at any depth. See the note above. */
export const PUNCH_SPEED_MAX = 1.6;
export function punchRoundSpeed(attemptNumber: number): number {
  return Math.min(
    PUNCH_SPEED_MAX,
    1 + PUNCH_SPEED_STEP * Math.max(0, attemptNumber - PUNCH_ROUND_ATTEMPTS),
  );
}
/**
 * How wide the reversal bands open, 0 (a plain triangle) to 1 (full wander).
 * Zero for the opening three punches, then a quarter per earned punch — the
 * fourth is barely irregular, the seventh is fully unpredictable.
 */
export const PUNCH_VARIANCE_STEP = 0.25;
export function punchRoundVariance(attemptNumber: number): number {
  return Math.min(
    1,
    PUNCH_VARIANCE_STEP * Math.max(0, attemptNumber - PUNCH_ROUND_ATTEMPTS),
  );
}

/**
 * THE ONE CALL SITE. Every screen that draws the marker and every path that
 * scores it goes through here, because the three inputs have to agree exactly
 * — the local player, the coordinator and every spectator draw the same sweep
 * only while they read the same attempt number and the same charge start.
 * Three loose arguments at six call sites is how they would drift apart.
 *
 * `chargeStartedAt` is the seed: shared through the snapshot in competition,
 * local in solo (nobody else is watching).
 */
export function punchAttemptMarker01(
  elapsedMs: number,
  attemptNumber: number,
  chargeStartedAt: number,
  idealChargeMs: number = defaultPunchMachineAppConfig().idealChargeMs,
  profile?: PunchGameProfile,
): number {
  return punchTimingMarker01(
    profile ? punchIntegratedHoldTime(elapsedMs, idealChargeMs) : elapsedMs,
    chargeStartedAt,
    // TWO RAMPS, ONE MARKER. The round ramp is how deep into a hot streak you
    // are; the overhold ramp is how long you have been standing on this one
    // punch. Multiplied, because they are independent reasons for the needle to
    // be moving faster and a player suffering both should feel both.
    profile ? punchProfileSpeed(attemptNumber, profile) : punchRoundSpeed(attemptNumber) * punchHoldSpeed(elapsedMs, idealChargeMs),
    profile ? Math.min(0.65, Math.max(0, attemptNumber - 1) * profile.varianceStep * 0.5) : punchRoundVariance(attemptNumber),
  );
}

/** Integrate acceleration instead of multiplying the entire elapsed clock by its latest speed. */
export function punchIntegratedHoldTime(elapsedMs: number, idealChargeMs: number): number {
  const elapsed = Math.max(0, elapsedMs);
  const ideal = Math.max(1, idealChargeMs);
  const extra = Math.max(0, elapsed - ideal * PUNCH_OVERHOLD_PLATEAU);
  const acceleration = PUNCH_OVERHOLD_SPEED_PER_IDEAL / ideal;
  const ramp = Math.min(extra, (PUNCH_OVERHOLD_SPEED_MAX - 1) / acceleration);
  return elapsed + 0.5 * acceleration * ramp * ramp + (extra - ramp) * (PUNCH_OVERHOLD_SPEED_MAX - 1);
}
/** The beat the machine holds on a finished round before it resets. */
export const PUNCH_ROUND_SUMMARY_MS = 4_500;

/**
 * THE HOUSE BOT'S ID, and it lives here rather than in the network module
 * because two separate things now have to agree about it: the coordinator that
 * seeds the bot into the queue, and the arc that has to know a bot's turn is
 * not a person's turn. A constant only one of them can see is how those two
 * came to disagree in the first place.
 */
export const PUNCH_HOUSE_BOT_ID = "house-bot";

/**
 * THE TWO REGULARS AT THE FLANKS — and why they are ids rather than a headcount.
 *
 * A live turn used to leave one person tapping on their own: the player at the
 * bag saw a circle of nobody, and a spectator channelling for them was the only
 * body in it. The mechanic reads as a crowd ritual and was being played solo.
 *
 * So two of the NPCs already standing beside the cabinet take part in every
 * turn — ONE LIFTING AND ONE DRAGGING, never both the same way, so the punch
 * they add up to is roughly the one it would have been while the room around it
 * is visibly working. They are coordinator-seeded circle members exactly like a
 * person: same meter, same bleed, same weather, same payout curve. Nothing
 * downstream branches on "is this a bot" except the one thing that has to — the
 * world layer, which anchors a balloon to an NPC's body instead of to an avatar
 * the explorer would never find.
 *
 * They are IDS and not a count because the roster is what every client draws
 * from. A count would tell a client two more people are channelling and give it
 * nothing to put a balloon on.
 */
export const PUNCH_FOCUS_BOT_IDS = ["focus-bot-a", "focus-bot-b"] as const;

/** Is this roster member one of the flanking regulars rather than a person? */
export function isPunchFocusBotId(userId: string): boolean {
  const id = String(userId ?? "").toLowerCase();
  return id === PUNCH_FOCUS_BOT_IDS[0] || id === PUNCH_FOCUS_BOT_IDS[1];
}

/** How far a regular's aim wanders either side of the ideal sawtooth centre. */
export const PUNCH_FOCUS_BOT_WOBBLE_01 = 0.045;
/**
 * The wobble's period, deliberately incommensurate with both drift hands and
 * the gust. A regular whose error lined up with the weather would either be
 * perfect forever or hopeless forever; this way it has good spells and bad ones
 * exactly as a person does, and the crowd meter never settles into a flat line.
 */
export const PUNCH_FOCUS_BOT_WOBBLE_PERIOD_MS = 5_300;

/**
 * WHERE A CHANNELLING REGULAR TAPS AGAIN, on the meter it is watching.
 *
 * Good play is a sawtooth centred on the still point: let the meter bleed to
 * half an impulse below the target, tap, and the peak lands half an impulse
 * above it. That is what a person who is actually looking at the bar does, so
 * it is what the regulars do — plus a slow wobble, because a metronome standing
 * next to you is worse company than a slightly sloppy neighbour.
 *
 * `seed` is the bot's own phase offset, so the two of them are never wrong in
 * the same direction at the same moment and their mean stays near the middle.
 */
export function punchFocusBotAim01(
  target01: number,
  phaseMs: number,
  seed: number,
): number {
  const target = Number.isFinite(target01) ? target01 : PUNCH_FOCUS_TARGET_01;
  const phase = Number.isFinite(phaseMs) ? phaseMs : 0;
  const wobble =
    Math.sin(
      (2 * Math.PI * phase) / PUNCH_FOCUS_BOT_WOBBLE_PERIOD_MS +
        (Number.isFinite(seed) ? seed : 0),
    ) * PUNCH_FOCUS_BOT_WOBBLE_01;
  return Math.max(0, target - PUNCH_FOCUS_TAP_IMPULSE / 2 + wobble);
}

/**
 * Attempts allowed after a punch of `score` lands in a round.
 *
 * `ceiling` is the runaway guard and nothing else: the queue never shortens a
 * round, it only limits how many people may be waiting for one. See
 * `PUNCH_MAX_PLAYERS`.
 */
export function punchRoundAttemptsAfter(
  allowed: number,
  score: number,
  ceiling: number = PUNCH_ROUND_ATTEMPTS_MAX,
): number {
  const cap = Number.isFinite(ceiling)
    ? Math.min(PUNCH_ROUND_ATTEMPTS_MAX, Math.max(0, Math.floor(ceiling)))
    : PUNCH_ROUND_ATTEMPTS_MAX;
  return score >= PUNCH_ROUND_EXTEND_SCORE
    ? Math.min(cap, allowed + 1)
    : allowed;
}


/* -------------------------------------------------------------------------- *
 * THE STREAK LADDER — what a REPEATED 900 is worth.
 * -------------------------------------------------------------------------- */

/**
 * ‼️A STREAK IS CONSECUTIVE 900s **INSIDE ONE ROUND**, COUNTED PER PLAYER.
 *
 * It is deliberately NOT `PunchMachineRuntime.streak900`, which looks like the
 * same thing and is not: that one is a per-CLIENT, per-MACHINE counter that ticks
 * on every slam whoever threw it, it is consumed and zeroed by the `cabinet-
 * overload` show card, and it exists only to gate spectacle. A number that pays
 * points has to be authoritative, has to belong to one person, and may never be
 * spent by a lighting effect. Two counters, two jobs — do not merge them.
 *
 * WHY IT EXISTS. 900 already bought an extra punch, and that was the whole
 * reward: the second 900 of a run and the first were worth exactly the same, so
 * a hot streak had no shape. It could only ever pay in ALLOWANCE, and allowance
 * is a promise of points rather than points — a player who then misread one
 * reversal walked away with nothing to show for three perfect punches.
 *
 * ‼️AND THE LADDER IS DELIBERATELY, LOUDLY GENEROUS. Owner, 2026-09-05: *"I
 * think we need to be fairly generous with those"* — read the numbers below
 * against a 999 and they look absurd, which is the intent. The ramp
 * (`punchRoundSpeed` / `punchRoundVariance`) is already making each punch past
 * the third harder to read than the last, so a streak of four is not four times
 * as hard as one, it is *dramatically* harder. The reward has to be shaped like
 * the difficulty or the top of the board never moves. A round is meant to be
 * won by a STREAK, not by three tidy punches — and everyone standing on the deck
 * should be able to see which one they just watched.
 *
 * The first 900 pays nothing here on purpose: it already collected the extra
 * punch, and paying twice for one punch would make the ladder start at the very
 * rung the ramp has not begun to defend yet.
 */
export const PUNCH_STREAK_BONUS: readonly number[] = [0, 0, 500, 1500, 3000, 5000];
/**
 * What the machine SHOUTS at each rung — the marquee, the HUD badge and the
 * round card all read this array, so the words can never disagree across the
 * three surfaces the player checks them on.
 */
export const PUNCH_STREAK_NAME: readonly string[] = [
  "",
  "",
  "STREAK x2",
  "CRAZY STREAK x3",
  "UNREAL STREAK x4",
  "GODLIKE STREAK",
];

/** The streak after a punch of `score`: one longer, or broken back to zero. */
export function punchStreakAfter(streak: number, score: number): number {
  if (score < PUNCH_ROUND_EXTEND_SCORE) return 0;
  const current = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
  return Math.min(PUNCH_ROUND_ATTEMPTS_MAX, current + 1);
}

/**
 * Points owed for reaching `streak`. Past the top rung it keeps paying the top
 * rung rather than stopping: a run that deep has beaten the ramp every time,
 * and a ladder that goes quiet at the summit tells the best player in the room
 * that the game stopped watching.
 */
export function punchStreakBonus(streak: number): number {
  const rung = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
  if (rung < 2) return 0;
  return PUNCH_STREAK_BONUS[Math.min(rung, PUNCH_STREAK_BONUS.length - 1)] ?? 0;
}

/** The banner for `streak`, or '' when this rung is not worth shouting about. */
export function punchStreakName(streak: number): string {
  const rung = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
  if (rung < 2) return "";
  return PUNCH_STREAK_NAME[Math.min(rung, PUNCH_STREAK_NAME.length - 1)] ?? "";
}

export function nextPunchMachineId(existingIds: readonly string[]): string {
  const used = new Set(existingIds);
  for (let i = 1; i < 10_000; i += 1) {
    const id = `punch_machine_${i}`;
    if (!used.has(id)) return id;
  }
  return `punch_machine_${Date.now().toString(36)}`;
}

/** Equal suspense: reveal length must not disclose the result before it appears. */
export function punchRevealCountMs(score: number, profile?: PunchGameProfile): number {
  return PUNCH_SCORE_COUNT_MS;
}
/**
 * ‼️THE CUT IS ADDED HERE, so the whole room's clocks agree about it. The
 * coordinator publishes this as `scorePhaseDurationMs` and every client derives
 * `sincePhaseStart` from it — put the extra 1.2 s anywhere else and half the
 * deck would still be in silence while the other half had moved on.
 *
 * It stretches the phase rather than eating `PUNCH_SCORE_LINGER_MS` (600 ms,
 * half what the cut needs), and it lands AFTER the count, so the phase getting
 * longer cannot disclose a result the plate is not already showing.
 */
export function punchScorePhaseMs(
  score: number,
  profile?: PunchGameProfile,
  config: PunchMachineAppConfig = defaultPunchMachineAppConfig(),
): number {
  return (
    PUNCH_SCORE_HOLD_MS +
    punchRevealCountMs(score, profile) +
    punchPerfectCutMs(score, config) +
    PUNCH_SCORE_LINGER_MS
  );
}

/**
 * The line under the scoreboard rows, for both pages.
 *
 * It carries the ALL TIME page's whole honesty burden, so it is a pure
 * function and not four nested ternaries inside a component: a store that has
 * never answered must not claim a history (see `allTimeSaved`, which is `live`,
 * not `configured`).
 *
 * ‼️THE RULES TAG IS GONE, ON PURPOSE. Between 2026-09-08 and 2026-09-09 this
 * line printed the board's rules edition, because the board really was scoped
 * to a hash of the scoring rules and a retune really did start an empty one.
 * `punchProfileBoardKey` no longer does that, so a tag naming an edition would
 * now be describing a scope that does not exist — and the owner asked for a
 * cleaner panel, not a longer footnote.
 *
 * Four states, and each says a different true thing:
 *   tonight            — this session; nothing here outlives it.
 *   all time, unsaved  — this venue keeps no history at all.
 *   all time, empty    — the board is real and nobody has swung on it yet.
 *   all time, rows     — every best punch this mode has ever seen.
 */
export function punchScoreboardCaption(input: {
  tonight: boolean;
  rows: number;
  saved: boolean;
  /** Third tab: the people who kept a streak alive, not the people who punched. */
  saviors?: boolean;
}): string {
  if (input.saviors) {
    return input.rows === 0 ? 'NOBODY HAS SAVED A STREAK YET' : 'WHAT THE SAVE UNLOCKED';
  }
  if (input.tonight) {
    return input.rows === 0 ? 'NOBODY HAS SWUNG YET' : 'BEST PUNCH PER PLAYER, THIS SESSION';
  }
  if (!input.saved) {
    return input.rows === 0 ? 'NO SAVED BOARD FOR THIS VENUE' : 'ALL TIME · NOT SAVED FOR THIS VENUE';
  }
  return input.rows === 0 ? 'NOBODY HAS SWUNG YET' : 'BEST PUNCH PER PLAYER, ALL TIME';
}
