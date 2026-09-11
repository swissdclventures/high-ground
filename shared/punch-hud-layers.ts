/**
 * Three HUD layers for High Ground.
 *
 * Some copy exists to explain the game. Some exists to make the machine feel
 * alive. Mixing those two jobs is how the rail became a spreadsheet.
 *
 *   1. Persistent — the SCORE, plus one status row under it.
 *      While a punch is resolving, the plate is THIS HIT (the crawl, then
 *      the landed punch). The round total is what you came in with and what
 *      you leave with; it is not the number you watch climb. Once the next
 *      punch is ready, the plate is the round total again.
 *   2. Evaluation — this attempt's maths, only while that attempt is resolving
 *      AND the count has landed (never spoil the crawl).
 *   3. Spectacle — bonuses, multipliers, saves, streak events. One arcade line,
 *      then gone. Higher value = hotter presentation.
 *
 * The slot under the score shows exactly one of: alert, spectacle, evaluation,
 * status. Mobile is the same hierarchy with a shorter status line.
 */

export type PunchHudHeat = 1 | 2 | 3 | 4;
export type PunchHudSlotKind = 'alert' | 'spectacle' | 'evaluation' | 'status';

export const PUNCH_HUD_SPECTACLE_MS: Record<PunchHudHeat, number> = {
  1: 900,
  2: 1300,
  3: 1700,
  4: 2200,
};

export const PUNCH_HUD_ATTRACT_CYCLE_MS = 14_000;
export const PUNCH_HUD_ATTRACT_ON_MS = 2_400;

export interface PunchHudLayerInput {
  phase: string;
  compact: boolean;
  nowMs: number;
  /** Milliseconds since the count landed. -1 while it is still crawling. */
  revealAgeMs: number;
  revealLanded: boolean;
  isMyTurn: boolean;
  roundTotal: number;
  /** True once this punch has already been added into `roundTotal`. */
  scoreCommitted: boolean;
  /**
   * The crawl on this punch (`hud.score`). 0 between punches. Do not use
   * `lastPunch` for the run-up — that is already the final number.
   */
  shownScore: number;
  lastPunch: number;
  streakBonus: number;
  challengeBonus: number;
  challengeSpeed: number;
  challengeHitMult: number;
  attempt: number;
  attemptsMax: number;
  attemptsCeiling: number;
  streak: number;
  streakMultiplier: number;
  streakSaved: boolean;
  extraPunchAt: number;
  nextMultiplier: number;
  supportScore: number;
  myBoostAward: number;
  prepFocus: number;
  prepMomentum: boolean;
  goldenArmed: boolean;
  goldenPayout: number;
  focusHighGround: boolean;
  focusAwardedFocusUsed: number;
  focusAwardedPower01: number;
  focusAwardedTiming01: number;
  focusAwardedAccuracy01: number;
  focusAwardedMissedTiming: number;
  focusAwardedScore: number;
  rescueLastChance: boolean;
  helpGoal: string;
  mustStepAside: boolean;
  /** Your turn, not yet on the mark — the system is inviting you onto it. */
  mustStandOnMark?: boolean;
  missedTurn: boolean;
  /** Calm shot-clock chip. Empty once the centred dial has taken over. */
  turnChip: string;
  activeName: string;
  recordAllTime: boolean;
  recordTonight: boolean;
  recordPersonal: boolean;
}

export interface PunchHudStatus {
  line: string;
  attemptsLeft: number;
  lastPunchOfRound: boolean;
}

export interface PunchHudSpectacle {
  line: string;
  sub?: string;
  heat: PunchHudHeat;
  /** Names the outcome (900 / streak / jackpot). Must wait for the count. */
  spoils: boolean;
}

export interface PunchHudEvaluation {
  delta: number;
  powerPct: number;
  aimPct: number;
  timingPct: number;
  timingMiss: number;
}

export interface PunchHudPlan {
  kind: PunchHudSlotKind;
  plateScore: number;
  status: PunchHudStatus;
  alert: string;
  spectacle: PunchHudSpectacle | null;
  evaluation: PunchHudEvaluation | null;
}

const pct = (value01: number) => Math.round(Math.max(0, Math.min(1, value01)) * 100);

export function punchHudResolving(phase: string): boolean {
  return phase === 'scoring' || phase === 'cooldown';
}

export function punchHudAttractOpen(nowMs: number): boolean {
  const n = Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0;
  return n % PUNCH_HUD_ATTRACT_CYCLE_MS < PUNCH_HUD_ATTRACT_ON_MS;
}

export function punchHudPlateScore(input: PunchHudLayerInput): number {
  const total = Math.max(0, Math.round(input.roundTotal || 0));
  if (!punchHudResolving(input.phase)) return total;

  const crawl = Math.max(0, Math.round(input.shownScore || 0));
  const punch = Math.max(crawl, Math.round(input.lastPunch || 0));

  // Owner, 2026-09-11: the plate was running this punch onto the round total,
  // so a 527 looked like 1142. The number they are watching is THIS HIT.
  if (!input.revealLanded) return crawl;
  return punch;
}

export function punchHudStatus(input: PunchHudLayerInput): PunchHudStatus {
  const attemptsLeft = Math.max(0, (input.attemptsMax || 0) - (input.attempt || 0));
  const lastPunchOfRound = input.isMyTurn && attemptsLeft <= 1 && (input.attemptsMax || 0) > 0;
  const capped =
    input.isMyTurn &&
    (input.attemptsMax || 0) >= (input.attemptsCeiling || 0) &&
    attemptsLeft > 0;

  if (input.rescueLastChance) {
    return { line: 'LAST CHANCE', attemptsLeft, lastPunchOfRound };
  }
  if (lastPunchOfRound) {
    return {
      line: input.streak > 0 ? 'LAST PUNCH · STREAK TRAVELS' : 'LAST PUNCH',
      attemptsLeft,
      lastPunchOfRound,
    };
  }

  const bits: string[] = [];
  if (input.goldenArmed && (input.phase === 'ready' || input.phase === 'charging')) {
    bits.push(input.compact ? 'GOLDEN' : `GOLDEN ×${input.goldenPayout || 1}`);
  }
  bits.push(`${attemptsLeft} LEFT`);
  if (capped) bits.push(input.compact ? 'CAPPED' : 'CAPPED · A 900 NO LONGER ADDS A PUNCH');
  if (input.isMyTurn && input.prepMomentum && (input.phase === 'ready' || input.phase === 'charging')) {
    bits.push(input.compact ? 'MOMENTUM' : 'MOMENTUM READY');
  }
  if (input.streak > 0) {
    bits.push(input.compact ? `×${input.streakMultiplier || 1} STREAK` : `STREAK ×${input.streakMultiplier || 1}`);
  } else if ((input.nextMultiplier || 1) > 1) {
    bits.push(`COMEBACK ×${input.nextMultiplier}`);
  }
  if (input.turnChip) bits.push(input.turnChip);
  if (!input.compact && !input.isMyTurn && (input.supportScore || 0) > 0) {
    bits.push(`SUPPORT ${input.supportScore}`);
  }
  if (!input.compact && input.isMyTurn && (input.prepFocus || 0) > 0) {
    bits.push(`FOCUS ${Math.round(input.prepFocus)}`);
  }

  return { line: bits.join('  ·  '), attemptsLeft, lastPunchOfRound };
}

export function punchHudEvaluation(input: PunchHudLayerInput): PunchHudEvaluation {
  const delta = Math.max(
    0,
    Math.round(input.focusAwardedScore || input.lastPunch || 0),
  );
  return {
    delta,
    powerPct: pct(input.focusAwardedPower01),
    aimPct: pct(input.focusAwardedAccuracy01),
    timingPct: pct(input.focusAwardedTiming01),
    timingMiss: Math.max(0, Math.round(input.focusAwardedMissedTiming || 0)),
  };
}

interface PunchHudEvent {
  line: string;
  sub?: string;
  heat: PunchHudHeat;
  spoils: boolean;
}

function spectacleEvents(input: PunchHudLayerInput): PunchHudEvent[] {
  const events: PunchHudEvent[] = [];
  const punch = Math.max(0, Math.round(input.lastPunch || 0));

  if (input.focusHighGround) {
    events.push({ line: 'HIGH GROUND', sub: 'TOGETHER!', heat: 4, spoils: true });
  } else if (punch >= 999) {
    events.push({ line: 'JACKPOT', heat: 4, spoils: true });
  } else if (punch >= 900) {
    events.push({ line: 'HUGE HIT', heat: 3, spoils: true });
  }

  if (input.recordAllTime) {
    events.push({ line: 'NEW BEST', sub: 'ALL TIME', heat: 4, spoils: true });
  } else if (input.recordTonight) {
    events.push({ line: 'NEW BEST', sub: 'TONIGHT', heat: 3, spoils: true });
  } else if (input.recordPersonal) {
    events.push({ line: 'NEW BEST', heat: 2, spoils: true });
  }

  if (input.streakSaved) {
    events.push({ line: 'STREAK SAVED', heat: 3, spoils: true });
  } else if (input.streak >= 2 && (input.streakMultiplier || 1) > 1) {
    events.push({ line: `STREAK ×${input.streakMultiplier}`, heat: 2, spoils: true });
  }

  if (input.extraPunchAt > 0 && input.nowMs - input.extraPunchAt < 3_000) {
    events.push({ line: '+1 PUNCH', heat: 2, spoils: true });
  }

  if ((input.challengeHitMult || 1) >= 1.02) {
    events.push({
      line: 'PRECISE HIT',
      sub: `×${input.challengeHitMult.toFixed(2)}`,
      heat: 1,
      spoils: false,
    });
  }
  if ((input.challengeSpeed || 1) >= 1.05) {
    events.push({
      line: 'SPEED BONUS',
      sub: `×${input.challengeSpeed.toFixed(2)}`,
      heat: 1,
      spoils: false,
    });
  }

  if (!input.isMyTurn && (input.myBoostAward || 0) > 0) {
    events.push({ line: `+${Math.round(input.myBoostAward)} SUPPORT`, heat: 2, spoils: false });
  }

  if ((input.focusAwardedFocusUsed || 0) > 0) {
    events.push({ line: 'FOCUS RESCUE', sub: 'STREAK LIVES', heat: 2, spoils: true });
  }

  if (input.goldenArmed && punch >= 900) {
    events.push({ line: `GOLDEN ×${input.goldenPayout || 1}`, heat: 3, spoils: true });
  }

  return events;
}

export function punchHudCombo(input: PunchHudLayerInput, opts?: { allowSpoilers?: boolean }): PunchHudSpectacle | null {
  const allowSpoilers = opts?.allowSpoilers !== false;
  const events = spectacleEvents(input).filter((event) => allowSpoilers || !event.spoils);
  if (events.length === 0) return null;
  events.sort((a, b) => b.heat - a.heat || a.line.localeCompare(b.line));
  const top = events[0]!;
  const second = events[1];
  const sub = top.sub || (second && second.line !== top.line ? second.line : undefined);
  return {
    line: top.line,
    sub,
    heat: top.heat,
    spoils: events.some((event) => event.spoils),
  };
}

function alertLine(input: PunchHudLayerInput): string {
  if (input.mustStepAside) {
    return `${(input.activeName || 'A PLAYER').toUpperCase()} IS UP — STEP ASIDE`;
  }
  if (input.mustStandOnMark) return 'STAND ON THE MARK';
  if (input.missedTurn) return 'MISSED YOUR TURN — PUNCH TO REJOIN';
  return '';
}

export function punchHudPlan(input: PunchHudLayerInput): PunchHudPlan {
  const plateScore = punchHudPlateScore(input);
  const status = punchHudStatus(input);
  const evaluation = punchHudEvaluation(input);
  const empty = {
    plateScore,
    status,
    alert: '',
    spectacle: null as PunchHudSpectacle | null,
    evaluation: null as PunchHudEvaluation | null,
  };

  const alert = alertLine(input);
  if (alert) return { ...empty, kind: 'alert', alert };

  const resolving = punchHudResolving(input.phase);
  const counting = resolving && !input.revealLanded && (input.lastPunch || 0) > 0;
  const landed = resolving && input.revealLanded && ((input.lastPunch || 0) > 0 || (input.focusAwardedScore || 0) > 0);

  if (counting) {
    const spectacle = punchHudCombo(input, { allowSpoilers: false });
    if (spectacle) return { ...empty, kind: 'spectacle', spectacle };
    return { ...empty, kind: 'status' };
  }

  if (landed) {
    const spectacle = punchHudCombo(input, { allowSpoilers: true });
    const hold = spectacle ? PUNCH_HUD_SPECTACLE_MS[spectacle.heat] : 0;
    const age = input.revealAgeMs < 0 ? 0 : input.revealAgeMs;
    if (spectacle && age < hold) return { ...empty, kind: 'spectacle', spectacle };
    return { ...empty, kind: 'evaluation', evaluation };
  }

  if (input.rescueLastChance) {
    return { ...empty, kind: 'alert', alert: 'LAST CHANCE' };
  }

  const wantAttract =
    !input.isMyTurn &&
    (input.helpGoal || '').includes('LAST CHANCE') &&
    punchHudAttractOpen(input.nowMs);
  if (wantAttract) {
    return {
      ...empty,
      kind: 'spectacle',
      spectacle: { line: 'WATCH FOR A LAST CHANCE', sub: 'EARN THE SAVE', heat: 1, spoils: false },
    };
  }

  return { ...empty, kind: 'status' };
}
