/**
 * THE CONTEST'S RECORD — every round, and every person who helped one.
 *
 * The all-time board next door (`punch-board-store.ts`) answers ONE question:
 * who has the highest single round at this venue. That is the right question
 * for an arc on a wall and the wrong question for a competition, and the
 * difference is what this module exists to close:
 *
 *   THE BOARD IS A RANKING. It holds one row per player, replaced whenever they
 *   beat themselves, and it is READ CAPPED — the scene asks for ten rows. A
 *   competitor who finishes eleventh has no row anywhere and no evidence they
 *   ever played, which is fine for a leaderboard and useless for judging a
 *   contest.
 *
 *   THIS IS A LOG. One row per ROUND, whoever threw it and wherever it ranked,
 *   plus one row per SUPPORTER per round they carried. Nobody is ranked out of
 *   it, and the whole night can be added up afterwards however the organisers
 *   want to add it up.
 *
 * ‼️IT INHERITS EVERY RULE THE BOARD OBEYS, and for the same reasons: the key
 * is public, writes are fire-and-forget, a failure is silent, and the island
 * behaves identically with the store switched off. See the header of
 * `punch-board-store.ts` — that note is this module's note too.
 *
 * ‼️EVERY WRITE IS AN UPSERT ON A DETERMINISTIC KEY. Not an optimisation — the
 * correctness rule the rest of the design leans on. A round grows punch by
 * punch and can be SUSPENDED and resumed several turns later (see
 * `PunchRoundCarry`); an append-only log would leave eight rows describing the
 * same round and a retry after a timeout would leave nine. Keying on
 * `venue:machine:user:roundStartedAt` means the same round is the same row for
 * its whole life, retries are free, and a split run adds up to one score.
 */
import type { PunchBoardStoreConfig } from "./punch-board-store";

/** One completed — or in-progress — round, as the log records it. */
export const PUNCH_ROUND_TABLE = "punch_round";
/** One supporter's contribution to one round. */
export const PUNCH_SUPPORT_TABLE = "punch_support";
/**
 * The view that adds a supporter's whole history up. A SUM belongs in the
 * database rather than in a scene that would have to download every row of
 * every night to compute it.
 */
export const PUNCH_SUPPORT_TOTALS_VIEW = "punch_support_totals";

export interface PunchRoundResult {
  machineId: string;
  userId: string;
  name: string;
  /** The round total — punches plus the streak ladder. What actually scores. */
  score: number;
  /** Punches thrown, across every visit this round took to the bag. */
  attempts: number;
  /** The highest rung the streak reached, not the rung it ended on. */
  streak: number;
  /** Points the ladder paid into `score`. */
  streakBonus: number;
  /** Points the crowd added, so a round can be read with and without help. */
  boostPoints: number;
  /** ‼️THE ROUND'S IDENTITY. Same stamp across a suspend-and-resume. */
  startedAt: number;
  finishedAt: number;
  /** True once the round is over — a row written mid-round is still provisional. */
  complete: boolean;
}

export interface PunchSupportResult {
  machineId: string;
  userId: string;
  name: string;
  /** Whose round this was. A supporter's row is always ABOUT somebody. */
  forUserId: string;
  forName: string;
  /** The round's stamp, so one supporter's help is one row per round. */
  roundStartedAt: number;
  /** Score points this person handed over across the whole round. */
  points: number;
  /** Punches they were on the card for. */
  boosts: number;
  /** Streaks they personally saved. See the rescue window in the contract. */
  saves: number;
}

/**
 * The key a row is upserted on, and the reason this file has no `insert`.
 *
 * Lowercased and colon-joined rather than hashed: a human debugging a contest
 * result at midnight should be able to read the id and know whose round it is.
 */
export function punchRoundId(
  config: PunchBoardStoreConfig,
  machineId: string,
  userId: string,
  startedAt: number,
): string {
  return [
    config.venue || "default",
    machineId || "punch_machine_1",
    String(userId ?? "")
      .trim()
      .toLowerCase(),
    String(Math.round(startedAt) || 0),
  ].join(":");
}

export function punchSupportId(
  config: PunchBoardStoreConfig,
  entry: PunchSupportResult,
): string {
  return [
    punchRoundId(config, entry.machineId, entry.forUserId, entry.roundStartedAt),
    String(entry.userId ?? "")
      .trim()
      .toLowerCase(),
  ].join(":");
}

function label(value: string): string {
  return String(value ?? "")
    .trim()
    .slice(0, 32) || "Player";
}

function id(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function punchRoundRow(
  config: PunchBoardStoreConfig,
  entry: PunchRoundResult,
): Record<string, unknown> {
  return {
    round_id: punchRoundId(config, entry.machineId, entry.userId, entry.startedAt),
    venue: config.venue || "default",
    machine_id: entry.machineId || "punch_machine_1",
    user_id: id(entry.userId),
    name: label(entry.name),
    score: count(entry.score),
    attempts: count(entry.attempts),
    streak: count(entry.streak),
    streak_bonus: count(entry.streakBonus),
    boost_points: count(entry.boostPoints),
    started_at: count(entry.startedAt),
    finished_at: count(entry.finishedAt),
    complete: entry.complete === true,
  };
}

export function punchSupportRow(
  config: PunchBoardStoreConfig,
  entry: PunchSupportResult,
): Record<string, unknown> {
  return {
    support_id: punchSupportId(config, entry),
    venue: config.venue || "default",
    machine_id: entry.machineId || "punch_machine_1",
    user_id: id(entry.userId),
    name: label(entry.name),
    for_user_id: id(entry.forUserId),
    for_name: label(entry.forName),
    round_started_at: count(entry.roundStartedAt),
    points: count(entry.points),
    boosts: count(entry.boosts),
    saves: count(entry.saves),
  };
}

/** Upsert endpoints. Both tables key on their own deterministic id. */
export function punchRoundWriteUrl(config: PunchBoardStoreConfig): string {
  return `${config.url}/rest/v1/${PUNCH_ROUND_TABLE}?on_conflict=round_id`;
}

export function punchSupportWriteUrl(config: PunchBoardStoreConfig): string {
  return `${config.url}/rest/v1/${PUNCH_SUPPORT_TABLE}?on_conflict=support_id`;
}

/** One supporter's whole history at a venue, as the totals view reports it. */
export interface PunchSupportTotal {
  userId: string;
  name: string;
  points: number;
  boosts: number;
  saves: number;
  rounds: number;
}

/**
 * One person on the SAVES board — a spectator who kept a streak alive.
 *
 * Distinct from the punch ranking: that board answers "who hit hardest".
 * This one answers "who showed up for somebody else", which is the whole
 * social benefit the push exists to pay, and which used to live only as a
 * rotating subtitle under the puncher's own row.
 */
export interface PunchSaviorEntry {
  userId: string;
  name: string;
  saves: number;
  points: number;
  /**
   * Points the rescued player scored AFTER this save — the extra turns the
   * room unlocked. A save that dies on the next swing stays small; ten more
   * punches is a different number.
   */
  unlocked?: number;
  lastSavedName?: string;
  lastSavedUserId?: string;
}

/** What the SAVES board prints — unlocked play first, push/boost points if none yet. */
export function punchSaviorScore(entry: {
  unlocked?: number;
  points?: number;
}): number {
  const unlocked = Number.isFinite(entry.unlocked)
    ? Math.max(0, Math.round(entry.unlocked as number))
    : 0;
  if (unlocked > 0) return unlocked;
  return Number.isFinite(entry.points) ? Math.max(0, Math.round(entry.points as number)) : 0;
}

/**
 * The SAVES subtitle — who they kept in, and how many times.
 * The right-hand number is punchSaviorScore; do not print it twice here.
 */
export function punchSaviorLine(entry: {
  lastSavedName?: string;
  saves?: number;
}): string {
  const kept = String(entry.lastSavedName ?? "").trim();
  const saves = Number.isFinite(entry.saves) ? Math.max(0, Math.round(entry.saves as number)) : 0;
  const who = kept ? `KEPT ${kept.slice(0, 12).toUpperCase()} IN` : "";
  const count = saves > 1 ? `${saves} SAVES` : "";
  if (who && count) return `${who} · ${count}`;
  if (who) return who;
  if (count) return count;
  return saves === 1 ? "1 SAVE" : "";
}

/**
 * The live chip after a save: who is banking this run, and how much.
 * One line, because the growing number is the explanation.
 */
export function punchSaveRunLine(input: {
  helperName: string;
  keptName: string;
  points: number;
  people?: number;
  mine?: boolean;
}): string {
  const points = Number.isFinite(input.points) ? Math.max(0, Math.round(input.points)) : 0;
  if (points <= 0) return "";
  const helper = String(input.helperName ?? "")
    .replace(/^THE /, "")
    .trim()
    .slice(0, 12)
    .toUpperCase();
  const kept = String(input.keptName ?? "")
    .replace(/^THE /, "")
    .trim()
    .slice(0, 12)
    .toUpperCase();
  const people = Number.isFinite(input.people) ? Math.max(1, Math.round(input.people as number)) : 1;
  const who = input.mine ? "YOU" : people > 1 ? "THE ROOM" : helper || "HELPER";
  return kept ? `${who} +${points.toLocaleString()} FROM ${kept}` : `${who} +${points.toLocaleString()}`;
}

/**
 * How many NEW points the continued round has produced since we last paid the
 * saviors. `roundTotalAtSave` is the total at the moment the window closed, so
 * the rescued punch itself is not counted twice.
 */
export function punchSaveUnlockedDelta(
  roundTotalNow: number,
  roundTotalAtSave: number,
  alreadyCredited: number,
): number {
  const unlocked = Math.max(0, Math.round(roundTotalNow) - Math.round(roundTotalAtSave));
  return Math.max(0, unlocked - Math.max(0, Math.round(alreadyCredited)));
}

export function punchSaveShares(
  rows: ReadonlyArray<{ userId?: string; name?: string; gain?: number }>,
): Array<{ userId: string; name: string; share01: number }> {
  const live = rows.filter(
    (row) => (row.gain ?? 0) > 0 && String(row.userId ?? "").trim(),
  );
  const total = live.reduce((sum, row) => sum + Math.max(0, row.gain ?? 0), 0);
  if (live.length === 0) return [];
  if (total <= 0) {
    return live.map((row) => ({
      userId: String(row.userId).trim().toLowerCase(),
      name: (row.name ?? "Player").trim() || "Player",
      share01: 1 / live.length,
    }));
  }
  return live.map((row) => ({
    userId: String(row.userId).trim().toLowerCase(),
    name: (row.name ?? "Player").trim() || "Player",
    share01: Math.max(0, row.gain ?? 0) / total,
  }));
}

/** Split an integer pot by share without losing the remainder. */
export function punchSaveSplit(
  total: number,
  shares: ReadonlyArray<{ userId: string; name: string; share01: number }>,
): Array<{ userId: string; name: string; points: number }> {
  const pot = Math.max(0, Math.round(total));
  if (pot <= 0 || shares.length === 0) return [];
  const exact = shares.map((row) => ({
    userId: row.userId,
    name: row.name,
    exact: pot * Math.max(0, row.share01),
  }));
  const out = exact.map((row) => ({
    userId: row.userId,
    name: row.name,
    points: Math.floor(row.exact),
  }));
  let left = pot - out.reduce((sum, row) => sum + row.points, 0);
  const order = exact
    .map((row, index) => ({ index, frac: row.exact - Math.floor(row.exact) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (let n = 0; n < left; n += 1) {
    const slot = order[n % order.length];
    if (!slot) break;
    out[slot.index]!.points += 1;
  }
  return out.filter((row) => row.points > 0);
}

/**
 * Rank the people who saved a streak, biggest first.
 *
 * The number is what they kept in play after the save. A booster who never
 * kept a run alive stays off this list — they already have a place on the
 * puncher's card.
 */
export function rankPunchSaviors(
  rows: ReadonlyArray<{
    userId?: string;
    name?: string;
    saves?: number;
    points?: number;
    unlocked?: number;
    lastSavedName?: string;
    lastSavedUserId?: string;
  }>,
  limit = 10,
): PunchSaviorEntry[] {
  const best = new Map<string, PunchSaviorEntry>();
  for (const row of rows) {
    const userId = String(row?.userId ?? "")
      .trim()
      .toLowerCase();
    const saves = Number.isFinite(row?.saves) ? Math.max(0, Math.round(row!.saves as number)) : 0;
    const points = Number.isFinite(row?.points) ? Math.max(0, Math.round(row!.points as number)) : 0;
    const unlocked = Number.isFinite(row?.unlocked)
      ? Math.max(0, Math.round(row!.unlocked as number))
      : 0;
    if (!userId || saves <= 0) continue;
    const name =
      typeof row?.name === "string" && row.name.trim() ? row.name.trim().slice(0, 32) : "Player";
    const lastSavedName =
      typeof row?.lastSavedName === "string" && row.lastSavedName.trim()
        ? row.lastSavedName.trim().slice(0, 32)
        : undefined;
    const lastSavedUserId =
      typeof row?.lastSavedUserId === "string" && row.lastSavedUserId.trim()
        ? row.lastSavedUserId.trim().toLowerCase()
        : undefined;
    const prev = best.get(userId);
    const value = punchSaviorScore({ unlocked, points });
    const prevValue = prev ? punchSaviorScore(prev) : -1;
    if (!prev || value > prevValue || (value === prevValue && saves > prev.saves)) {
      best.set(userId, {
        userId,
        name,
        saves,
        points,
        unlocked,
        lastSavedName: lastSavedName ?? prev?.lastSavedName,
        lastSavedUserId: lastSavedUserId ?? prev?.lastSavedUserId,
      });
    }
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        punchSaviorScore(b) - punchSaviorScore(a) ||
        b.saves - a.saves ||
        a.userId.localeCompare(b.userId),
    )
    .slice(0, Math.max(0, Math.round(limit)));
}

export function punchSupportTotalsUrl(
  config: PunchBoardStoreConfig,
  limit: number,
): string {
  const size = Math.max(1, Math.min(50, Math.round(limit)));
  const venue = encodeURIComponent(config.venue || "default");
  return `${config.url}/rest/v1/${PUNCH_SUPPORT_TOTALS_VIEW}?select=user_id,name,points,boosts,saves,rounds&venue=eq.${venue}&order=saves.desc,points.desc&limit=${size}`;
}

/**
 * Anything unrecognised becomes an empty list — the same rule the board's
 * parser obeys, and for the same reason: a support board that shows nothing is
 * correct on the first night, and a support board that shows garbage never is.
 */
export function parsePunchSupportTotals(
  payload: unknown,
  limit: number,
): PunchSupportTotal[] {
  if (!Array.isArray(payload)) return [];
  const rows: PunchSupportTotal[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const userId = typeof row.user_id === "string" ? row.user_id.trim().toLowerCase() : "";
    const points = Number.isFinite(Number(row.points)) ? Number(row.points) : 0;
    const saves = Number.isFinite(Number(row.saves)) ? Math.round(Number(row.saves)) : 0;
    if (!userId) continue;
    if (points <= 0 && saves <= 0) continue;
    rows.push({
      userId,
      name: typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 32) : "Player",
      points: Math.max(0, Math.round(points)),
      boosts: Number.isFinite(Number(row.boosts)) ? Math.round(Number(row.boosts)) : 0,
      saves,
      rounds: Number.isFinite(Number(row.rounds)) ? Math.round(Number(row.rounds)) : 0,
    });
  }
  rows.sort((a, b) => b.saves - a.saves || b.points - a.points || a.userId.localeCompare(b.userId));
  return rows.slice(0, Math.max(0, Math.round(limit)));
}
