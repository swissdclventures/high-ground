/**
 * WHO OWNS A PUNCH ROUND — the toggle, and the whole of it.
 *
 * Two authority models ship side by side on this branch:
 *
 *   - `'coordinator'` — the serverless model that shipped. The oldest live
 *     session elects itself over `MessageBus` and runs the clock on a player's
 *     own device. Correct, tested, and the thing running in production.
 *   - `'server'` — DCL's headless Multiplayer Server owns the round. Clients
 *     never elect themselves; they mirror.
 *
 * ‼️THIS IS NOT A RUNTIME SWITCH AND CANNOT BE ONE. Server authority needs the
 * `@dcl/sdk@auth-server` branch and `authoritativeMultiplayer: true` in
 * `scene.json`, both of which are decided when the scene is BUILT and
 * DEPLOYED. A published bundle is one or the other for its whole life. What
 * this constant buys is that both models live in one codebase reading one
 * reducer, so the weaker one can be deleted in a single commit once the
 * stronger one has earned it — rather than the two drifting apart on branches
 * until neither can be trusted.
 *
 * The build that ships to Genesis today must read `'coordinator'`.
 */
export type PunchAuthorityMode = 'coordinator' | 'server'

/**
 * What `startPunchCompetitionNetwork` assumes when nobody says.
 *
 * ‼️`'coordinator'` ON PURPOSE, even on the branch whose entire reason for
 * existing is the server. A default of `'server'` would mean any caller that
 * forgot the argument — a test, a preview fixture, a second machine in a scene
 * nobody migrated — silently waits for a host that may not exist. The server
 * path is opted INTO, at the two places that know the scene was deployed for
 * it, and everything else keeps the behaviour it already had.
 */
export const PUNCH_AUTHORITY_DEFAULT: PunchAuthorityMode = 'coordinator'

/**
 * The room channel every punch message rides in server mode.
 *
 * One channel, not six. `registerMessages()` schemas are declared once at module
 * load and the payloads here are already discriminated by their own `action`
 * field, so six near-identical schemas would buy nothing but six more chances
 * for a client and a server to disagree about a field name.
 */
export const PUNCH_ROOM_CHANNEL = 'punch.wire'

/**
 * ‼️THE 13 KB WALL. The room transport SILENTLY DROPS anything larger — no
 * throw, no log, the message simply never arrives — so a snapshot that grows
 * past it does not fail loudly, it makes the game stop responding for everyone
 * at once.
 *
 * The state heartbeat is the only payload here that can plausibly approach it:
 * it carries the leaderboard, the profile boards, the circle roster, the ring
 * and the queue. Budgeted well under the wall so a long night's leaderboard has
 * somewhere to grow before anyone has to think about chunking.
 */
export const PUNCH_ROOM_MAX_BYTES = 10_000

/**
 * ‼️HOW LONG SILENCE MEANS "NO SERVER".
 *
 * Three missed state heartbeats (STATE_HEARTBEAT_MS is 800 ms). A dropped frame
 * or a slow tick never reads as a dead server; a genuine cold start — ~15 s in
 * production, and instant in local preview, which is why this is never the bug
 * you catch at home — is called within four seconds.
 *
 * Lives HERE, not beside the server boot, because the client is the half that
 * asks the question and the client cannot import anything that reaches for
 * `@dcl/sdk/server`.
 */
export const PUNCH_SERVER_SILENCE_MS = 4_000

/**
 * How long a production cold start is allowed to take before this device
 * hosts so the cabinet is not a dead 000. Comfortably past DCL's ~15 s figure.
 *
 * After this window the island plays on this device. A late house snapshot
 * still wins and drops that local game.
 */
export const PUNCH_SERVER_ADOPT_MS = 25_000

/**
 * When the Explorer is in a scene room that will never transmit.
 *
 * HIGHGROUND 2026-09-10: `ROOM connected yes · ready NO · synced NO · frames 0
 * · via fixed-adapter`. That is not a slow house boot — it is a dead wire.
 * Waiting the full adopt window leaves the gold chip on WAKING and the cabinet
 * at 000. A late house snapshot still wins if the wire later comes up.
 */
export const PUNCH_ROOM_DEAD_MS = PUNCH_SERVER_SILENCE_MS
