/**
 * The contest log's client — the same cowardly contract as the all-time board.
 *
 * THE ONE RULE, INHERITED VERBATIM: with the store off, unreachable, unpaid or
 * renamed, the island behaves EXACTLY as it does with no store at all. Nothing
 * here is awaited by the game, every promise ends in a catch that swallows, and
 * after a handful of consecutive failures this session stops asking. Read the
 * header of `punch-board-store.ts` for why each of those is load-bearing.
 *
 * What is different from the board, and why:
 *
 *   IT WRITES ROWS THAT ARE NOT MINE TO RANK. The board writes one number about
 *   me. This writes my ROUND (which nobody else can inflate on my behalf) and
 *   my SUPPORT of somebody else's round (which likewise only I can claim). The
 *   trust level is unchanged: a client can still only ever lie about itself.
 *
 *   IT WRITES DURING PLAY, NOT AFTER IT. A round row is upserted as the round
 *   grows, so a competitor who crashes on punch six is still in the record with
 *   six punches — the whole reason this exists is that a result which never got
 *   written is a competitor who never played. `complete` is what separates the
 *   two, and the throttle is what stops eight punches becoming eight requests
 *   per second.
 */
import {
  punchBoardEnabled,
  punchBoardHeaders,
  type PunchBoardStoreConfig
} from '@shared/punch-board-store'
import {
  parsePunchSupportTotals,
  punchRoundRow,
  punchRoundWriteUrl,
  punchSupportRow,
  punchSupportTotalsUrl,
  punchSupportWriteUrl,
  type PunchRoundResult,
  type PunchSupportResult,
  type PunchSupportTotal
} from '@shared/punch-results-store'

/** The shortest gap between two writes of the same in-progress round. */
const ROUND_WRITE_THROTTLE_MS = 4_000
/** How often the support totals are re-read. Slower than the board: it is a sum. */
const TOTALS_INTERVAL_MS = 90_000
const BACKOFF_BASE_MS = 20_000
const BACKOFF_CAP_MS = 300_000
const GIVE_UP_AFTER = 5

export interface PunchResultsLog {
  config: PunchBoardStoreConfig
  /** Permanent support ranking for this venue. EMPTY IS A VALID FOREVER STATE. */
  supportTotals: PunchSupportTotal[]
  totalsLive: boolean
  totalsSize: number
  nextTotalsAt: number
  readingTotals: boolean
  writing: number
  failures: number
  stopped: boolean
  /**
   * The last round row this client sent, and when. Keyed by the round's stamp
   * so a SUSPENDED round resuming three turns later is recognised as the same
   * round rather than written twice.
   */
  roundKey: string
  roundSentAt: number
  roundSentScore: number
  roundSentComplete: boolean
}

export function createPunchResultsLog(
  config: PunchBoardStoreConfig,
  totalsSize: number
): PunchResultsLog {
  return {
    config,
    supportTotals: [],
    totalsLive: false,
    totalsSize: Math.max(1, Math.min(10, Math.round(totalsSize))),
    nextTotalsAt: 0,
    readingTotals: false,
    writing: 0,
    failures: 0,
    stopped: false,
    roundKey: '',
    roundSentAt: 0,
    roundSentScore: -1,
    roundSentComplete: false
  }
}

function halt(log: PunchResultsLog, now: number): void {
  log.failures += 1
  if (log.failures >= GIVE_UP_AFTER) {
    log.stopped = true
    return
  }
  const step = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (log.failures - 1))
  log.nextTotalsAt = now + step
}

function ready(log: PunchResultsLog | null): log is PunchResultsLog {
  return !!log && !log.stopped && punchBoardEnabled(log.config)
}

/**
 * Upsert one row, fire and forget.
 *
 * `writing` is a COUNT rather than a flag, unlike the board's: a round row and a
 * support row can legitimately be in flight at the same moment, and a single
 * boolean would drop whichever one lost the race — silently, which is the one
 * failure mode this whole feature exists to remove.
 */
function send(
  log: PunchResultsLog,
  url: string,
  row: Record<string, unknown>,
  now: number,
  onSent: () => void
): void {
  log.writing += 1
  fetch(url, {
    method: 'POST',
    headers: {
      ...punchBoardHeaders(log.config),
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([row])
  })
    .then((response) => {
      // A 4xx from PostgREST resolves rather than rejects — an expired key, a
      // paused project and a missing table all arrive here, not in the catch.
      if (!response.ok) throw new Error(`results write ${response.status}`)
      log.failures = 0
      onSent()
    })
    .catch(() => {
      // Nothing is marked as sent, so the next tick tries the same row again.
      halt(log, now)
    })
    .then(() => {
      log.writing = Math.max(0, log.writing - 1)
    })
}

/**
 * Record MY round — provisionally while it is running, and finally when it ends.
 *
 * Deliberately writes on three conditions and no others: a round it has never
 * seen, a score that has moved after the throttle, and the moment the round
 * completes. Everything else is a no-op, which is what keeps eight punches from
 * becoming a request per frame.
 */
export function recordPunchRound(
  log: PunchResultsLog | null,
  result: PunchRoundResult | null,
  now: number
): void {
  if (!ready(log) || !result) return
  if (!result.userId || result.score <= 0) return
  const key = `${result.machineId}:${result.userId}:${result.startedAt}`
  const fresh = key !== log.roundKey
  if (fresh) {
    log.roundKey = key
    log.roundSentAt = 0
    log.roundSentScore = -1
    log.roundSentComplete = false
  }
  // ‼️A COMPLETED ROUND IS WRITTEN ONCE AND NEVER AGAIN. Without this the final
  // row would be re-sent every frame for the rest of the round card.
  if (log.roundSentComplete) return
  const moved = result.score !== log.roundSentScore
  const due = now - log.roundSentAt >= ROUND_WRITE_THROTTLE_MS
  // The completion write ignores the throttle: it is the row that matters, and
  // a player who walks off the parcel two seconds later must not lose it.
  if (!result.complete && !(moved && due)) return
  if (!moved && !result.complete) return
  const sentScore = result.score
  const sentComplete = result.complete
  log.roundSentAt = now
  send(log, punchRoundWriteUrl(log.config), punchRoundRow(log.config, result), now, () => {
    log.roundSentScore = sentScore
    log.roundSentComplete = sentComplete
  })
}

/**
 * Record MY support of somebody else's round.
 *
 * One row per supporter per round, upserted whole: the caller keeps the running
 * totals locally and hands over the current state of them, so a retry, a
 * reconnect or a coordinator handover can never double-count a boost.
 */
export function recordPunchSupport(
  log: PunchResultsLog | null,
  entry: PunchSupportResult | null,
  now: number
): void {
  if (!ready(log) || !entry) return
  if (!entry.userId || !entry.forUserId) return
  if (entry.points <= 0 && entry.saves <= 0) return
  send(log, punchSupportWriteUrl(log.config), punchSupportRow(log.config, entry), now, () => {})
}

/** The permanent support ranking. Called every frame; almost always a no-op. */
export function refreshPunchSupportTotals(log: PunchResultsLog | null, now: number): void {
  if (!ready(log) || log.readingTotals) return
  if (now < log.nextTotalsAt) return
  log.readingTotals = true
  fetch(punchSupportTotalsUrl(log.config, log.totalsSize), {
    method: 'GET',
    headers: punchBoardHeaders(log.config)
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`support totals ${response.status}`)
      return response.json()
    })
    .then((payload) => {
      log.supportTotals = parsePunchSupportTotals(payload, log.totalsSize)
      log.totalsLive = true
      log.failures = 0
      log.nextTotalsAt = now + TOTALS_INTERVAL_MS
    })
    .catch(() => {
      // NON-DESTRUCTIVE: a failed refresh keeps the rows already on the board.
      halt(log, now)
    })
    .then(() => {
      log.readingTotals = false
    })
}
