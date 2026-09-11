/**
 * THE ALL-TIME BOARD'S CONTRACT — and the rule the whole thing is built to obey.
 *
 * THE STORE IS A NICE-TO-HAVE. IT IS NEVER A DEPENDENCY.
 *
 * Every score the game needs to run already lives in the live snapshot, synced
 * peer to peer over the message bus. This module adds a second, slower board
 * that outlives the room — and it is wired so that the store being unreachable,
 * unpaid, misconfigured or simply switched off produces EXACTLY the island we
 * have today. Not a degraded island: the same one. Nothing here is ever awaited
 * by game logic, nothing here can throw into a frame, and an empty result is a
 * permanently valid answer rather than an error to surface.
 *
 * That is why the parsing below refuses to be clever. Anything it does not
 * recognise becomes an empty list, because a board that silently shows nothing
 * is correct behaviour and a board that shows garbage is not.
 *
 * The key is PUBLIC. A deployed scene is a downloadable bundle, so the anon key
 * travels with it — that is inherent to any browser client, not a slip. Give
 * the table row-level security that assumes the whole world holds this key:
 * select, insert and UPDATE, and no delete anywhere.
 *
 * ‼️UPDATE, not "insert and select only" as this note used to say. Every write
 * here is `resolution=merge-duplicates`, which PostgREST issues as INSERT ...
 * ON CONFLICT DO UPDATE and which is refused outright without the update
 * privilege — a board granted insert alone accepts a player's first score and
 * silently rejects every improvement after it. The line that actually protects
 * the record is the missing DELETE: a public key may add to the board and may
 * better its own row, and may never remove anybody from it.
 *
 * The SQL is `supabase/migrations/20260905160000_punch_contest_log.sql`, which
 * also creates the round and support logs beside this table, and the triggers
 * that make every number in them monotonic.
 */
/**
 * Structurally identical to `PunchBoardEntry`, and declared here rather
 * than imported ON PURPOSE. The contract imports this module for its config
 * type; importing back would close a cycle between two shared modules, and TS
 * structural typing means the two are interchangeable at every call site
 * without one.
 */
export interface PunchBoardEntry {
  userId: string;
  name: string;
  score: number;
  achievedAt: number;
}

export interface PunchBoardStoreConfig {
  /** Supabase project REST root, e.g. `https://abc.supabase.co`. Empty = off. */
  url: string;
  /** Supabase anon key. Public once deployed; see the note above. */
  key: string;
  /** Table holding one row per visitor per venue. */
  table: string;
  /**
   * Which board these rows belong to. One Supabase project can back every
   * arena we ever publish, and without this they would all rank each other.
   */
  venue: string;
}

/** The table this feature expects, so the SQL and the code cannot drift. */
export const PUNCH_BOARD_TABLE = "punch_board";

export function defaultPunchBoardStoreConfig(): PunchBoardStoreConfig {
  return { url: "", key: "", table: PUNCH_BOARD_TABLE, venue: "" };
}

export function normalizePunchBoardStoreConfig(
  value: unknown,
): PunchBoardStoreConfig {
  const base = defaultPunchBoardStoreConfig();
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const text = (input: unknown, fallback: string): string =>
    typeof input === "string" && input.trim() ? input.trim() : fallback;
  return {
    // Trailing slashes are the single most common way a pasted project URL
    // arrives, and they turn every request into a 404 on a double slash.
    url: text(raw.url, base.url).replace(/\/+$/, ""),
    key: text(raw.key, base.key),
    table: text(raw.table, base.table),
    venue: text(raw.venue, base.venue),
  };
}

/**
 * Both halves are required. A URL without a key is not a half-working store,
 * it is a request that will be refused on every call for the life of the scene.
 */
export function punchBoardEnabled(config: PunchBoardStoreConfig): boolean {
  return Boolean(config.url && config.key && config.table);
}

export function punchBoardHeaders(
  config: PunchBoardStoreConfig,
): Record<string, string> {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
  };
}

/**
 * Top rows for this venue, best first — AND FOR EVERY VENUE THIS ONE EVER WAS.
 *
 * ‼️A PREFIX MATCH, NOT `eq`, AND THAT IS THE WHOLE SCORE-RESET FIX ON THE READ
 * SIDE. Until 2026-09-09 the venue carried a hash of the scoring rules
 * (`punchProfileBoardKey`), so every Game director tweak filed the next punch
 * under `highground:classic-1m4frc8`, then `-g6vamc`, then `-rf4mb6`. The rows
 * were never deleted; they were only unreachable, one dead venue per tweak.
 *
 * The write venue is now `<venue>:<mode>` and never moves again, and reading
 * `<venue>:<mode>*` sweeps that graveyard back onto the board: `classic`
 * matches `classic` and every `classic-<hash>` behind it. No migration, no
 * guessing which hashes existed, and a venue that never had the bug reads
 * exactly what it always did.
 *
 * The three mode ids ('classic', 'streak-rush', 'crowd-party') are not
 * prefixes of one another, so no board can bleed into another board.
 *
 * Because one player can now hold a row in several of those legacy venues, the
 * request asks for more rows than the board shows and `parsePunchBoardRows`
 * collapses them to a best-per-player list.
 */
export function punchBoardReadUrl(
  config: PunchBoardStoreConfig,
  limit: number,
): string {
  const size = Math.max(1, Math.min(50, Math.round(limit)));
  // Room for the same player appearing under several retired rules editions.
  const fetchSize = Math.max(size, Math.min(50, size * 5));
  // `*` is PostgREST's wildcard and is NOT touched by encodeURIComponent, so
  // the venue is escaped and the wildcard survives.
  const venue = encodeURIComponent(config.venue || "default") + "*";
  return `${config.url}/rest/v1/${config.table}?select=user_id,name,score,achieved_at&venue=like.${venue}&order=score.desc&limit=${fetchSize}`;
}

/**
 * Writes go through Postgres' own upsert so a visitor holds ONE row per venue
 * forever, however many nights they play. `resolution=merge-duplicates` needs a
 * unique index on (venue, user_id) — without it every punch appends a row and
 * the board slowly becomes a log.
 */
export function punchBoardWriteUrl(config: PunchBoardStoreConfig): string {
  return `${config.url}/rest/v1/${config.table}?on_conflict=venue,user_id`;
}

export function punchBoardRow(
  config: PunchBoardStoreConfig,
  entry: PunchBoardEntry,
): Record<string, unknown> {
  return {
    venue: config.venue || "default",
    user_id: entry.userId.trim().toLowerCase(),
    name: entry.name.trim().slice(0, 32) || "Player",
    score: Math.max(0, Math.round(entry.score)),
    achieved_at: Math.round(entry.achievedAt) || 0,
  };
}

/**
 * Anything unrecognised becomes an empty board.
 *
 * The payload here is the one part of this feature we do not control: an
 * expired key answers with an error object, a paused project answers with HTML,
 * and a renamed column answers with rows missing the field we rank on. All
 * three must land in the same place as "nobody has played yet".
 *
 * ‼️ONE ROW PER PLAYER, whatever the server sent. The table's unique index is on
 * (venue, user_id), and since the read became a PREFIX match over every retired
 * rules venue (see `punchBoardReadUrl`) one player legitimately owns several
 * rows. Ranking them straight would hand the same name ranks 1 and 3.
 */
export function parsePunchBoardRows(
  payload: unknown,
  limit: number,
): PunchBoardEntry[] {
  if (!Array.isArray(payload)) return [];
  const best = new Map<string, PunchBoardEntry>();
  for (const raw of payload) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const userId =
      typeof row.user_id === "string" ? row.user_id.trim().toLowerCase() : "";
    const score = Number(row.score);
    if (!userId || !Number.isFinite(score) || score <= 0) continue;
    const entry: PunchBoardEntry = {
      userId,
      name:
        typeof row.name === "string" && row.name.trim()
          ? row.name.trim().slice(0, 32)
          : "Player",
      score: Math.round(score),
      achievedAt: Number.isFinite(Number(row.achieved_at))
        ? Number(row.achieved_at)
        : 0,
    };
    const held = best.get(userId);
    // Keep the higher score, and on a tie the earlier one — the same order the
    // sort below uses, so "which row won" never depends on payload order.
    if (
      !held ||
      entry.score > held.score ||
      (entry.score === held.score && entry.achievedAt < held.achievedAt)
    ) {
      best.set(userId, entry);
    }
  }
  const rows = [...best.values()];
  // The server is asked for a sorted, limited set; it is not trusted to have
  // delivered one. A board is short enough that re-sorting costs nothing.
  rows.sort((a, b) => b.score - a.score || a.achievedAt - b.achievedAt);
  return rows.slice(0, Math.max(0, Math.round(limit)));
}

/**
 * ALL TIME IS NEVER EMPTIER THAN TONIGHT.
 *
 * Owner, 2026-09-04: "the all-time scores still don't work, they're blank,
 * although there should be by default populated if the first list is not
 * empty". The all-time page drew ONLY what the store had sent back, so a venue
 * with no store, a store that had not answered yet, or a store nobody had
 * written to tonight showed ten empty pills under a list sitting right there on
 * the other tab. Tonight's best punches ARE all-time punches — a board that
 * calls itself all time and omits the last hour is wrong, not incomplete.
 *
 * Best per player across both lists, ranked, capped. Ties break on `achievedAt`
 * (earlier first), the same order the parser uses, so the two pages agree.
 */
export function mergePunchBoards(
  saved: readonly PunchBoardEntry[],
  tonight: readonly PunchBoardEntry[],
  limit: number,
): PunchBoardEntry[] {
  const best = new Map<string, PunchBoardEntry>();
  for (const entry of [...saved, ...tonight]) {
    const userId = entry.userId.trim().toLowerCase();
    if (!userId || !(entry.score > 0)) continue;
    const held = best.get(userId);
    if (!held || entry.score > held.score) best.set(userId, { ...entry, userId });
  }
  const rows = [...best.values()];
  rows.sort((a, b) => b.score - a.score || a.achievedAt - b.achievedAt);
  return rows.slice(0, Math.max(0, Math.round(limit)));
}
