/**
 * The all-time board's client — deliberately the most cowardly code in the scene.
 *
 * THE ONE RULE: if the store is switched off, unreachable, unpaid, renamed or
 * returning nonsense, the island behaves EXACTLY as it does with no store at
 * all. Not degraded — identical. Every path out of a failure here leads to "the
 * all-time board is empty", which is a state the arc already draws correctly
 * because it is also the state on the very first night.
 *
 * Three mechanisms enforce that, and each one exists because the obvious
 * version of this file would break the rule:
 *
 *   - NOTHING IS AWAITED BY THE GAME. Both calls return void immediately. The
 *     frame loop cannot be slowed, stalled or thrown into by a network that has
 *     gone quiet, because it never learns a request happened.
 *   - EVERY PROMISE ENDS IN A CATCH THAT SWALLOWS. A rejected fetch inside a
 *     DCL system is an unhandled rejection in the scene runtime, which is a far
 *     worse outcome than a missing leaderboard.
 *   - IT GIVES UP. After a handful of consecutive failures it stops for the
 *     session. A store that is down stays down for minutes at a time, and a
 *     client that keeps asking turns one outage into a retry storm from every
 *     visitor at once.
 */
import {
  parsePunchBoardRows,
  punchBoardEnabled,
  punchBoardHeaders,
  punchBoardReadUrl,
  punchBoardRow,
  punchBoardWriteUrl,
  type PunchBoardEntry,
  type PunchBoardStoreConfig
} from '@shared/punch-board-store'

/** How often a healthy store is re-read. The board is a slow thing by nature. */
const READ_INTERVAL_MS = 45_000
/** First backoff step; doubles per consecutive failure. */
const BACKOFF_BASE_MS = 20_000
const BACKOFF_CAP_MS = 300_000
/** Consecutive failures before this session stops asking altogether. */
const GIVE_UP_AFTER = 5

export interface PunchBoardStore {
  config: PunchBoardStoreConfig
  /** Rows from the store. EMPTY IS A VALID FOREVER STATE — never an error. */
  allTime: PunchBoardEntry[]
  /** True once a read has actually come back. Drives whether the arc pages. */
  live: boolean
  size: number
  nextReadAt: number
  reading: boolean
  writing: boolean
  failures: number
  stopped: boolean
  /** Highest score already written for me, so a quiet night writes nothing. */
  sentScore: number
}

export function createPunchBoardStore(
  config: PunchBoardStoreConfig,
  size: number
): PunchBoardStore {
  return {
    config,
    allTime: [],
    live: false,
    size: Math.max(1, Math.min(10, Math.round(size))),
    // Zero, not "now + interval": the first read should land while the visitor
    // is still walking in from the spawn, not forty-five seconds later.
    nextReadAt: 0,
    reading: false,
    writing: false,
    failures: 0,
    stopped: false,
    sentScore: 0
  }
}

/**
 * SILENT TO THE GAME, NOT SILENT TO THE CONSOLE.
 *
 * ‼️2026-09-05: `punch_board` was found to hold zero rows, on an island that had
 * been played for days and was printing BEST PUNCH PER PLAYER, ALL TIME the
 * whole time. Every failure path in this file swallowed its reason, the store
 * gave up after five of them, and NOTHING anywhere said so — not the HUD, not
 * the log. A feature cannot be this quiet about being dead.
 *
 * The swallowing itself stays: the rule that a broken store must not disturb
 * the island is the reason this file exists, and a line in the log disturbs
 * nothing. What changes is that the reason now leaves a trace someone can read
 * in Player.log, and that giving up announces itself as the decision it is.
 *
 * `console.error`, not `warn`: the scene runtime's console has `log` and
 * `error` and nothing else, and `warn` is a TS2339 against its own typings.
 */
function halt(store: PunchBoardStore, now: number, reason: string): void {
  store.failures += 1
  if (store.failures >= GIVE_UP_AFTER) {
    store.stopped = true
    console.error(
      `[punch-board] giving up for this session after ${store.failures} failures. ` +
        `Last: ${reason}. The ALL TIME page will show tonight only.`
    )
    return
  }
  const step = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (store.failures - 1))
  store.nextReadAt = now + step
  console.error(`[punch-board] ${reason} (failure ${store.failures}, retry in ${Math.round(step / 1000)}s)`)
}

/**
 * Called every frame. Almost every frame it does nothing, which is the point:
 * the guards are ordered cheapest first so the common case is three boolean
 * reads and a number compare.
 */
export function refreshPunchBoard(store: PunchBoardStore | null, now: number): void {
  // Null is "no store configured", which is the default. Taking it here rather
  // than at every call site is what keeps the game code free of the question.
  if (!store || store.stopped || store.reading) return
  if (!punchBoardEnabled(store.config)) return
  if (now < store.nextReadAt) return
  store.reading = true
  fetch(punchBoardReadUrl(store.config, store.size), {
    method: 'GET',
    headers: punchBoardHeaders(store.config)
  })
    .then(async (response) => {
      // A 4xx from PostgREST still resolves the promise. An expired key, a
      // paused project and a renamed table all arrive here, not in the catch.
      if (!response.ok) throw new Error(`board read ${response.status}`)
      return response.json()
    })
    .then((payload) => {
      store.allTime = parsePunchBoardRows(payload, store.size)
      store.live = true
      store.failures = 0
      store.nextReadAt = now + READ_INTERVAL_MS
    })
    .catch((error: unknown) => {
      // Silent TO THE GAME and deliberately NON-DESTRUCTIVE: a failed refresh
      // keeps whatever rows we already have on the arc rather than blanking a
      // board that was fine a minute ago. `halt` writes the reason to the log.
      halt(store, now, `read failed: ${String(error)}`)
    })
    .then(() => {
      store.reading = false
    })
}

/**
 * Write my own best, and only my own.
 *
 * Nobody signs anything here, so a client can only ever inflate ITSELF — which
 * is exactly the trust level this board advertises by calling itself ALL TIME
 * next to a TONIGHT board that is peer-witnessed. Submitting on behalf of
 * others would quietly turn one liar into a vandal.
 */
export function submitPunchBoardScore(
  store: PunchBoardStore | null,
  entry: PunchBoardEntry | undefined,
  now: number
): void {
  if (!store || store.stopped || store.writing || !entry) return
  if (!punchBoardEnabled(store.config)) return
  if (!entry.userId || entry.score <= store.sentScore) return
  // ‼️AND NEVER BELOW WHAT IS ALREADY UP THERE. The write is an upsert that
  // REPLACES the row, and `sentScore` only remembers this session — so a
  // player's second, worse night would have overwritten the best punch they
  // ever threw. The all-time board may only ever move upwards.
  //
  // Read off the last board we fetched rather than tracked separately: it is
  // the same row the store will merge into, so the two can never disagree. An
  // empty board (no read yet, or a store that is off) blocks nothing, which is
  // the correct answer on the first night.
  const standing = store.allTime.find((row) => row.userId === entry.userId)
  if (standing && entry.score <= standing.score) {
    // Nothing to send, but the high-water mark still moves: a score already on
    // the board is a score that does not need writing again.
    store.sentScore = Math.max(store.sentScore, standing.score)
    return
  }
  store.writing = true
  const score = entry.score
  fetch(punchBoardWriteUrl(store.config), {
    method: 'POST',
    headers: {
      ...punchBoardHeaders(store.config),
      // Upsert on (venue, user_id), and don't ask for the row back — the arc
      // reads the board on its own schedule and has no use for the echo.
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([punchBoardRow(store.config, entry)])
  })
    .then((response) => {
      if (!response.ok) throw new Error(`board write ${response.status}`)
      store.sentScore = score
      store.failures = 0
      // Pull the merged board in shortly, so the writer sees their own row
      // arrive rather than waiting out the full interval.
      store.nextReadAt = Math.min(store.nextReadAt, now + 4_000)
    })
    .catch((error: unknown) => {
      // sentScore is NOT advanced, so the next better punch tries again.
      halt(store, now, `write failed: ${String(error)}`)
    })
    .then(() => {
      store.writing = false
    })
}
