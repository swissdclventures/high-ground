import { AudioSource, Billboard, Entity, Material, MaterialTransparencyMode, MeshRenderer, engine, InputModifier, Transform } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { copyToClipboard, movePlayerTo, triggerEmote, triggerSceneEmote } from '~system/RestrictedActions'
import { canMovePlayer } from './config'
import { postDanceEvent } from './bridge'
import { getSocialConfig } from '../social/config'
import { worldEmoteMovesFromConfig } from '@shared/land-emote-library'
import { silenceClappingAudioEmote } from '@shared/world-audio-policy'

// A move is either an emote referenced by URN (the new model — owned/marketplace/base),
// or one of our bundled custom dances (scene .glb). durationMs = how long to hold the
// step before advancing (we don't know arbitrary emote lengths, so it's a default).
// nativeMs = the move's original/default length (captured once, when added to a
// sequence) — the trim bar uses it to mark how far you can raise durationMs back
// up before you run past real motion into a frozen hold on the last frame.
// category = which of the three filterable buckets a palette entry belongs to:
// 'studio' (our converted Dance Studio moves), 'base' (generic DCL default
// emotes), 'owned' (the player's own equipped/marketplace emotes).
// thumbnailUrl = a resolved (hash-based) content-server image URL, populated
// only for owned emotes (see loadOwnedEmotes) — shown in place of the generic
// coin note glyph so an owned item is visually recognizable at a glance.
// repeat = how many times this SEQUENCE STEP plays in place before the sequencer
// advances (default 1, i.e. once). Only meaningful on a step inside `sequence` —
// palette entries don't carry a repeat count. Replaces the old "Duplicate" button:
// duplicating a move to fill several slots just to see it dance a few times was
// clutter for something that's really "play this N times," so Repeat does that in
// one slot instead (see incrementRepeat/resetRepeat below).
export type MoveCategory = 'studio' | 'base' | 'owned'
export type Move =
  | { kind: 'urn'; name: string; urn: string; durationMs: number; category?: MoveCategory; nativeMs?: number; thumbnailUrl?: string; repeat?: number }
  | { kind: 'scene'; name: string; src: string; durationMs: number; category?: MoveCategory; nativeMs?: number; thumbnailUrl?: string; repeat?: number }
  // a travel step — repositions the avatar relative to where it's facing (gliding,
  // not a teleport, thanks to movePlayerTo's duration). A move in its own right.
  | { kind: 'move'; name: string; dir: 'fwd' | 'back' | 'left' | 'right'; steps: number; durationMs: number; category?: MoveCategory; nativeMs?: number; thumbnailUrl?: string; repeat?: number }

type MoveStep = Extract<Move, { kind: 'move' }>
const STEP_DIST = 0.9 // metres per "step"

// Transition steps — universal, fixed, available to everyone. Kept OUT of the
// scrollable palette and pinned as their own always-visible strip in the UI.
const MOVEMENTS: Move[] = [
  { kind: 'move', name: '↑ Forward', dir: 'fwd', steps: 2, durationMs: 700 },
  { kind: 'move', name: '↓ Back', dir: 'back', steps: 2, durationMs: 700 },
  { kind: 'move', name: '← Left', dir: 'left', steps: 2, durationMs: 700 },
  { kind: 'move', name: '→ Right', dir: 'right', steps: 2, durationMs: 700 },
]
// Travel steps are only offered when the venue capability is on (see config.ts).
// In the base wear-anywhere product movePlayerTo() is rejected by DCL, so we hide
// these rather than ship a button that silently does nothing.
export const getMovements = () => (canMovePlayer() ? MOVEMENTS : [])

const DEFAULT_DURATION = 4000

// Per-move trim ("hold time") bounds. The trim bar is a row of tappable cells,
// each HOLD_STEP long; tap a cell to set how long this step plays before the
// sequencer cuts to the next move. No native slider exists in DCL UI.
export const MIN_HOLD = 500
export const MAX_HOLD = 8000
export const HOLD_STEP = 500
export const HOLD_SEGMENTS = MAX_HOLD / HOLD_STEP // 16 cells

// Clamp an arbitrary ms value onto the trim grid.
function snapHold(ms: number): number {
  const stepped = Math.round(ms / HOLD_STEP) * HOLD_STEP
  return Math.max(MIN_HOLD, Math.min(MAX_HOLD, stepped))
}

// HOUSE CHANNEL — a pluggable placeholder. The architecture supports a curated/
// licensed "house" set we can fill at publish time; for now it holds placeholder
// content (our bundled customs + a couple of free base emotes by URN). Swap/expand
// this array later without touching anything else.
function baseEmote(name: string, slug: string): Move {
  return { kind: 'urn', name, urn: `urn:decentraland:off-chain:base-emotes:${slug}`, durationMs: 3000, category: 'base' }
}

// LAUNCH CANDIDATE LIST (2026-07-02) — replaces the earlier "P:"/"X:" staging
// dump. Everything below is either CONFIRMED (plain name, explicit go-ahead
// given) or genuinely STILL PENDING (kept "P:" prefix — proposed, no verdict
// yet). Cut items (salsa — "breakdance only" call; the 2 broken VFX-pose
// experiments; ~55 never-reviewed archive clips) are removed from the palette
// entirely, not just relabeled — nothing shows here that isn't an active
// candidate. Full archive remains on disk in assets-parked/ and
// src/emotes.full-backup.ts.txt if anything needs to be pulled back in.
// durationMs = measured native clip length / 0.85 (sequencer blend factor),
// rounded up to the nearest 500ms.
const HOUSE: Move[] = [
  // --- CONFIRMED (12) ---
  { kind: 'scene', name: 'BD Ready Bounce', src: 'emotes/bd_ready_3_x2_emote.glb', durationMs: 4500, category: 'studio' },
  // BD Street Storm (brooklyn_uprock) removed 2026-07-04 — broken in conversion,
  // confirmed still broken after a clean server restart (not a cache artifact).
  // Renamed from "Mic Drop" 2026-07-02 — measured spine movement across the
  // clip: only 16deg of swing over a held 8s duration. Reads as a mellow settle,
  // not a climactic finish, so the name shouldn't oversell it as one.
  { kind: 'scene', name: 'BD Wind Down', src: 'emotes/bd_ending_new_2_emote.glb', durationMs: 8000, category: 'studio' },
  // Reverted 2026-07-02 — the amplify attempt ("legs barely spread, needs
  // aggression") technically hit its target numbers but "lost its breakdance
  // essence": scaling joint angles by a raw multiplier doesn't preserve a move's
  // actual style, it just distorts it. Back to the original ("brilliant move").
  // A genuinely more aggressive take needs fresh Mixamo source, not synthetic
  // amplification of this one.
  // Renamed 2026-07-04 — folded into the BD Steps numbered convention (was Pulse
  // Step; renumbered to 3 after Steps 2/3/5 were cut for being broken/boring).
  { kind: 'scene', name: 'BD Steps 3', src: 'emotes/bboy_uprock_emote.glb', durationMs: 2500, category: 'studio' },
  // Renamed to "BD Headspin Start" 2026-07-04 — this clip is the ENTRY into a
  // headspin (the go-down + a bit of spin), not a sustained spin like the BD Roundy
  // Headspin loops. Built from headspin_start (the real entry) + the main spin x2,
  // anchor-blended at the seam. "Start" makes clear it's the intro, not the loop.
  { kind: 'scene', name: 'BD Headspin Start', src: 'emotes/headspin_combo_emote.glb', durationMs: 4600, category: 'studio' },
  { kind: 'scene', name: 'BD Skyfall Combo', src: 'emotes/bd_freezes_emote.glb', durationMs: 6500, category: 'studio' },
  // Renamed from "Windmill" 2026-07-04 — checked against real bboy terminology
  // (Wikipedia/BBoy Dojo/The Breaks): a real windmill rotates on the upper
  // back/shoulders with hands never bearing weight. This clip is built from
  // bd_uprock_to_ground + bd_1990_4 x3 — pivot-height data confirms one hand
  // stays planted low/steady while legs go up, which is the "1990" family (a
  // single hand-planted rotation, name coined by Ken Swift ~1980), not a windmill.
  // Kept the move (it plays great), fixed the label so we never misuse real
  // terminology for the wrong move. Distinct from the plain "1990" entry above.
  { kind: 'scene', name: 'BD 1990 Roll', src: 'emotes/windmill_combo_emote.glb', durationMs: 2800, category: 'studio' },
  // BD The Finish (bd_ending_1) removed 2026-07-04 — "completely destroyed" /
  // broken in conversion. Alternate ending takes exist (bd_ending_2/3) if we want
  // to try recovering an ending move later.
  // Re-trimmed AGAIN 2026-07-02 — the first trim (frame 95) started right at a
  // local PEAK of the hip bounce (mid-upward-pop, hip_z rising to 0.978), not a
  // clean drop into the crouch — that stray "pop with no context" at the very
  // start is what read as the embarrassing bit. Measured the actual bounce curve
  // frame-by-frame and re-cut to start at the confirmed bottom (frame 104,
  // hip_z=0.804) through the end of the stable crouch zone (frame 335) — no
  // standing-height frames included at either edge. Could not visually confirm
  // this one (render pipeline still broken) — if it's still off, cut it.
  { kind: 'scene', name: 'Twerk', src: 'emotes/twerk_trimmed_emote.glb', durationMs: 8000, category: 'studio' },
  // Soul Spin (northernsoul) removed 2026-07-04 — broken in conversion.
  // Twist cut 2026-07-02 — "doesn't fit at all."
  // Pumping Hands (hiphop_6) removed 2026-07-04 per request.
  // --- TESTING (9), picked 2026-07-04 by the user from the full unfiltered library
  // batch via a pasted routine code. Everything else from that batch (the original
  // 3 pending + curated 5 + rest-of-library 32 = 40 candidates) is now REMOVED from
  // the palette, not just relabeled — full archive remains in assets-parked/. One
  // pasted entry (bboy_hiphop_move_new_emote.glb, "Hip Hop Move") was already a
  // CONFIRMED move, not a new pick — correctly left alone above, not duplicated here.
  // "T:" = ready to test in-world before getting a final plain name.
  // Naming convention pass 2026-07-04 — footwork and freeze families simplified to
  // plain numbered names per explicit request ("keep it simple").
  // BD Footwork 1 (bd_footwork_3) removed 2026-07-04 — broken; remaining two
  // footworks renumbered down to 1 and 2 to keep the sequence gap-free.
  { kind: 'scene', name: 'BD Footwork 1', src: 'emotes/bd_footwork_to_freeze_emote.glb', durationMs: 4500, category: 'studio' },
  { kind: 'scene', name: 'BD Footwork 2', src: 'emotes/bd_footwork_to_idle_2_fixed_emote.glb', durationMs: 6000, category: 'studio' },
  { kind: 'scene', name: 'BD Freeze 1', src: 'emotes/bd_freeze_var_3_emote.glb', durationMs: 7500, category: 'studio' },
  // BD Swipes (bd_swipes) removed 2026-07-04 — "completely broken."
  // BD Rock to Ground 2 (bd_uprock_to_ground_2) removed 2026-07-04 — user judged it
  // the same move as BD Rock to Ground.
  // "BD Steps" family — the plain standing-uprock variations. Final surviving set is
  // Steps 1 (bd_uprock_new), Steps 2 (bboy_hiphop_move_new), Steps 3 (bboy_uprock,
  // ex-Pulse Step). Cut 2026-07-04: old Steps 2 (bd_uprock_var_1, "horrible"/broken),
  // old Steps 3 (bd_uprock_var_2, broken), Steps 5 (hiphop_dancing_7, "too boring").
  // "Uprock To Ground" stays separate — it's an entry INTO a floor move, not a step.
  // --- FINALIZED from the fresh Mixamo batch (2026-07-02/04 review round) ---
  // 1990 and Uprock: confirmed keepers, prefix dropped.
  // Renamed 2026-07-04 — "1990" wasn't descriptive enough on its own; renamed to
  // what it actually shows (spinning on one hand). NOTE: very close in spelling to
  // "BD Headspin" (headspin_combo_emote.glb) elsewhere in this list — flagging in
  // case that reads as confusing in the palette, since they're genuinely different
  // moves (hand-pivot vs. head-spin) and this is intentional, not a typo.
  { kind: 'scene', name: 'BD Handspin', src: 'emotes/bd_1990_new_x4_emote.glb', durationMs: 1341, category: 'studio' },
  { kind: 'scene', name: 'BD Steps 1', src: 'emotes/bd_uprock_new_emote.glb', durationMs: 2500, category: 'studio' },
  // Roundy Headspin 1-3: pure spin-loop "modules" (no ground-entry choreography of
  // their own — that's what BD Headspin above already covers, going down TO the
  // ground). Each is a single BAKED 6-rep clip (extend_loop_clip.py, anchor-blended
  // seams, verified 0.0deg seam gap first) so it reads as one continuous spin, not a
  // blink-and-done rotation. Numbered in original test order, not by length.
  // "BD" prefix added 2026-07-04 per explicit request, alongside "all of the steps".
  { kind: 'scene', name: 'BD Roundy Headspin 1', src: 'emotes/headspin_new_2_x6_emote.glb', durationMs: 5812, category: 'studio' },
  { kind: 'scene', name: 'BD Roundy Headspin 2', src: 'emotes/headspin_new_4_x6_emote.glb', durationMs: 5365, category: 'studio' },
  { kind: 'scene', name: 'BD Roundy Headspin 3', src: 'emotes/headspin_new_5_x6_emote.glb', durationMs: 3576, category: 'studio' },
  // Renamed 2026-07-04 — folded into the BD Steps convention (was Hip Hop Move;
  // renumbered to 2 after the broken Steps were cut).
  { kind: 'scene', name: 'BD Steps 2', src: 'emotes/bboy_hiphop_move_new_emote.glb', durationMs: 3000, category: 'studio' },
  // Renamed 2026-07-04 per request.
  { kind: 'scene', name: 'BD Rock to Ground', src: 'emotes/bd_uprock_to_ground_new_emote.glb', durationMs: 5500, category: 'studio' },
  // Renamed 2026-07-04 — "Snake Hip Hop" didn't read as snake-like; then shortened
  // "Smooth Hip Hop" -> "Smooth Hip" per request.
  { kind: 'scene', name: 'Smooth Hip', src: 'emotes/snake_hiphop_new_emote.glb', durationMs: 8000, category: 'studio' },
  // Salsa dropped 2026-07-04 — was a size-optimization side quest (channel-pruning)
  // that broke every move's skin/animation; reverted entirely, back to the original
  // 27 breakdance/hip-hop moves. GLBs still sit in assets-parked/ if reconsidered.
  baseEmote('Disco', 'disco'),
  baseEmote('Dab', 'dab'),
  baseEmote('Robot', 'robot'),
  baseEmote('Tik Tok', 'tik'),
  baseEmote('Hammer', 'hammer'),
  baseEmote('Tektonik', 'tektonik'),
  baseEmote('Hands in Air', 'handsair'),
  baseEmote('Wave', 'wave'),
  baseEmote('Kiss', 'kiss'),
  baseEmote('Money', 'money'),
  baseEmote('Raise Hand', 'raiseHand'),
  baseEmote('Shrug', 'shrug'),
  baseEmote('Head Explode', 'headexplode'),
  baseEmote("Don't See", 'dontsee'),
]

// The palette = house moves + the player's OWN equipped emotes (read at runtime).
let palette: Move[] = [...HOUSE]

// A-Z / Z-A for YOUR MOVES — tap the active direction again to drop back to the
// curated default order. (Duration is the other real sortable field we have, but
// it's not something you can shape per-asset the way a naming convention is.)
let moveSort: 'none' | 'az' | 'za' = 'az'
export const getMoveSort = () => moveSort
export const toggleSortAZ = () => { moveSort = moveSort === 'az' ? 'none' : 'az' }
export const toggleSortZA = () => { moveSort = moveSort === 'za' ? 'none' : 'za' }

// Category filters — three independent show/hide toggles. Generic DCL default
// emotes stay hidden (they're not dance moves). Studio defaults ON now that the
// library is a real curated set (18-19 moves, not the earlier 6-move demo) — a
// player opening this for the first time should see the actual product, not an
// empty-looking Wallet-only view. Owned/wallet emotes also show by default.
const catVisible: Record<MoveCategory, boolean> = { studio: true, base: false, owned: true }
export const isCatVisible = (c: MoveCategory) => catVisible[c]
export const toggleCat = (c: MoveCategory) => { catVisible[c] = !catVisible[c] }

export const getPalette = () => {
  const includeHouse = getSocialConfig()?.apps.emoteLibrary.includeHouse !== false
  const filtered = palette.filter((m) =>
    catVisible[m.category ?? 'studio'] && (includeHouse || m.category !== 'studio')
  )
  if (moveSort === 'none') return filtered
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return moveSort === 'za' ? sorted.reverse() : sorted
}

/** Scene-packaged picks — what the replacement HUD's WORLD button opens. */
export const getLandLibrary = () => {
  return worldEmoteMovesFromConfig(getSocialConfig()) as Move[]
}

function shortName(urn: string, i: number): string {
  // base emote slug, else "Emote N"
  const base = urn.match(/base-emotes:([a-zA-Z]+)/)
  if (base) return base[1][0].toUpperCase() + base[1].slice(1)
  return `Emote ${i + 1}`
}

// ─── Wallet / owned-emote loading ────────────────────────────────────────────
// ROOT CAUSE of the earlier "Wallet empty / getPlayer() = null" mystery:
// getPlayer() (from @dcl/sdk/players) is a SCENE-PRESENCE tracker — it only knows
// about players who have "entered the scene" via bounds-based enter/leave events.
// A smart wearable / portable experience has no normal parcel bounds the local
// player crosses into, so that registration is racy: sometimes it fires (Wallet
// worked once), often it never does (null all session). getUserData() from
// ~system/UserIdentity is a DIRECT identity request/response with no scene-
// presence dependency, so it's the reliable way to get the local wallet address.
// We then hit the Catalyst Lambdas inventory endpoint with that address to load
// the player's FULL owned emote collection (equipped or not).

let ownedStarted = false
// Diagnostic (kept lightweight, can stay in prod — it's one tiny status string).
let ownedFetchStatus = 'not started'
export const getOwnedFetchStatus = () => ownedFetchStatus

async function loadOwnedEmotes(): Promise<void> {
  if (ownedStarted) return
  ownedStarted = true
  // 1) Direct identity lookup (scene-presence independent).
  let wallet = ''
  let web3 = false
  try {
    const { getUserData } = await import('~system/UserIdentity')
    const res = await getUserData({})
    const d = res.data
    if (!d) { ownedFetchStatus = 'identity: no data — will retry'; ownedStarted = false; return }
    wallet = d.userId || d.publicKey || ''
    web3 = d.hasConnectedWeb3
  } catch (e) {
    ownedFetchStatus = `identity threw: ${e instanceof Error ? e.message : String(e)}`
    ownedStarted = false
    return
  }
  if (!web3 || !wallet) { ownedFetchStatus = 'guest / no wallet — no owned emotes to show'; return }
  // 2) Full owned-inventory fetch via Catalyst Lambdas. One-time, non-blocking.
  // includeEntities=true adds a heavier payload (per-token ownership records +
  // full entity metadata) but is the only way to get a thumbnail — worth it so
  // Wallet items are visually recognizable, not just generic coin icons.
  ownedFetchStatus = `fetching for ${wallet.slice(0, 8)}...`
  try {
    const PAGE_SIZE = 100
    const MAX_PAGES = 5 // 500 emotes is far beyond any real collection
    type ApiElement = { urn: string; name?: string; entity?: { content?: { file: string; hash: string }[] } }
    const byUrn = new Map<string, { name: string; thumbnailUrl?: string }>()
    let pageNum = 1
    let totalAmount = Infinity
    while (pageNum <= MAX_PAGES && byUrn.size < totalAmount) {
      const res = await fetch(`https://peer.decentraland.org/lambdas/users/${wallet}/emotes?pageSize=${PAGE_SIZE}&pageNum=${pageNum}&includeEntities=true`)
      if (!res.ok) { ownedFetchStatus = `HTTP ${res.status} on page ${pageNum}`; return }
      const data = (await res.json()) as { elements?: ApiElement[]; totalAmount?: number }
      for (const el of data.elements ?? []) {
        const thumb = el.entity?.content?.find((c) => c.file === 'thumbnail.png')
        byUrn.set(el.urn, { name: el.name || '', thumbnailUrl: thumb ? `https://peer.decentraland.org/content/contents/${thumb.hash}` : undefined })
      }
      totalAmount = data.totalAmount ?? byUrn.size
      if (!data.elements || data.elements.length < PAGE_SIZE) break
      pageNum++
    }
    if (byUrn.size === 0) { ownedFetchStatus = 'ok, but 0 owned emotes returned'; return }
    const owned: Move[] = [...byUrn.entries()].map(([urn, info], i) => ({ kind: 'urn' as const, name: info.name || shortName(urn, i), urn, durationMs: DEFAULT_DURATION, category: 'owned' as const, thumbnailUrl: info.thumbnailUrl }))
    palette = [...HOUSE, ...owned]
    ownedFetchStatus = `ok, ${byUrn.size} owned emotes loaded`
  } catch (e) {
    ownedFetchStatus = `fetch threw: ${e instanceof Error ? e.message : String(e)}`
  }
}

export function playerEmoteLoadSystem() {
  void loadOwnedEmotes() // guarded to run once (retries only if identity wasn't ready)
}

// --- the sequence the player builds ---
let sequence: Move[] = []
let playing = false
let loopOn = false
let stepIndex = 0
let timer = 0
let interjecting = false // a tapped move is overriding the base loop; resume base after

export const getSequence = () => sequence
export const isPlaying = () => playing
export const isLoop = () => loopOn
export const playingIndex = () => (playing ? stepIndex : -1)

// "Landing" burst — a bigger, one-shot explosive flourish (not the small tap-pop
// on the button itself) fired on the step that just landed at the END of the
// sequence, since addMove always appends there. Purely cosmetic: a stale index
// after a rapid reorder/remove just means the burst plays over the wrong (or no)
// row for its last fraction of a second — never a functional problem.
const LAND_FX_DUR = 0.7
let landIndex = -1
let landTimer = 0
export const getLandFx = () => (landTimer > 0 ? landTimer / LAND_FX_DUR : 0)
export const getLandIndex = () => landIndex

// Clone on add so each step owns its own durationMs — trimming one step must
// not mutate the shared palette object or other steps using the same move.
// Addable at any time, including mid-playback — it only ever appends to the END
// of the sequence, so it can never disturb the currently-dancing step's index.
export const addMove = (m: Move) => {
  sequence.push({ ...m, durationMs: snapHold(m.durationMs), nativeMs: m.durationMs })
  landIndex = sequence.length - 1
  landTimer = LAND_FX_DUR
  playUiSfx('sounds/add_move.mp3')
}
// Editable at any time, including mid-playback. If this is the step currently
// dancing, restart it from the beginning with the new length so you can hear/see
// the change immediately — the sequencer then carries on to the next move as
// normal once that (new) length elapses, unless you trim again.
export const setDuration = (i: number, ms: number) => {
  if (i < 0 || i >= sequence.length) return
  const snapped = snapHold(ms)
  sequence[i].durationMs = snapped
  // Repeat + trim can't coexist: DCL plays a scene emote to its NATURAL end and
  // re-triggering the SAME emote doesn't cut it, so a shortened move that repeats
  // just plays full length instead of looping short (the trim only cuts a clip when
  // a DIFFERENT move fires next). So the moment a step is trimmed below native, drop
  // any repeat back to 1 — the UI also disables the ×N button while trimmed.
  const native = sequence[i].nativeMs ?? snapped
  if (snapped < native) sequence[i].repeat = 1
  if (playing && i === stepIndex) startStep(i)
}
export const removeLast = () => { if (!playing) sequence.pop() }
export const clearSequence = () => { if (!playing) sequence = [] }
// Removable at any time, including mid-playback. If the removed move sits BEFORE
// the one currently dancing, shift stepIndex back so it keeps pointing at the
// same (still-playing) step instead of skipping ahead after the array shrinks.
export const removeAt = (i: number) => {
  if (i < 0 || i >= sequence.length) return
  sequence.splice(i, 1)
  if (playing && i < stepIndex) stepIndex--
}
// Repeat count for a sequence step (1 = plays once, the default). Uncapped by
// design — tap it as many times as the move needs to feel complete (a single
// mocap take of one spin might want ×3 to read as a real rotation combo).
export const getRepeat = (i: number): number => sequence[i]?.repeat ?? 1
export const incrementRepeat = (i: number) => {
  if (i < 0 || i >= sequence.length) return
  sequence[i].repeat = (sequence[i].repeat ?? 1) + 1
}
export const resetRepeat = (i: number) => {
  if (i < 0 || i >= sequence.length) return
  sequence[i].repeat = 1
}
export const moveUp = (i: number) => { if (!playing && i > 0) { [sequence[i - 1], sequence[i]] = [sequence[i], sequence[i - 1]] } }
export const moveDown = (i: number) => { if (!playing && i < sequence.length - 1) { [sequence[i + 1], sequence[i]] = [sequence[i], sequence[i + 1]] } }
export const toggleLoop = () => { loopOn = !loopOn }

// --- collapse / display state ---
let movesOpen = true
let seqOpen = true
let minimized = false
export const isMovesOpen = () => movesOpen
export const isSeqOpen = () => seqOpen
export const isMinimized = () => minimized
// Closing the section that's currently focused-big would leave the OTHER section
// stuck small for no reason (nothing to focus on anymore) — drop back to balance.
export const toggleMoves = () => {
  movesOpen = !movesOpen
  if (!movesOpen && focusPanel === 'moves') focusPanel = 'balance'
}
export const toggleSeq = () => {
  seqOpen = !seqOpen
  if (!seqOpen && focusPanel === 'seq') focusPanel = 'balance'
}
export const toggleMinimized = () => { minimized = !minimized }
// Set the minimized state directly. Used by the venue frame (venue.ts) to open the
// tool COLLAPSED (bottom-right bar) when the wearer enters an eligible venue, so
// the venue never force-expands the full panel on an NFT holder. Inert today —
// venue detection returns false until a remote config is hosted (see venue.ts).
export const setMinimized = (v: boolean) => { minimized = v }

// Which list is expanded to fill most of the panel — the other stays visible as a
// small strip. No native resizable divider in DCL UI, so this is a size toggle.
let focusPanel: 'balance' | 'moves' | 'seq' = 'balance'
export const getFocusPanel = () => focusPanel
// Focusing a section only matters if it's actually visible — auto-uncollapse it
// so the ⤢ button always has a visible effect, even from a fully-closed state.
export const toggleMovesFocus = () => {
  focusPanel = focusPanel === 'moves' ? 'balance' : 'moves'
  if (focusPanel === 'moves') movesOpen = true
}
export const toggleSeqFocus = () => {
  focusPanel = focusPanel === 'seq' ? 'balance' : 'seq'
  if (focusPanel === 'seq') seqOpen = true
}

// One-at-a-time browsing for YOUR MOVES when it's compact (collapsed, or the
// other section is focused-big) — paged with arrows instead of a cramped
// scrollbar. Never shows zero moves; the palette always has content.
let moveBrowseIndex = 0
// Bounds come from getPalette() (the FILTERED+sorted view), not the raw palette —
// otherwise hiding a category could leave the index pointing past the visible end.
export const getMoveBrowseIndex = () => { const n = getPalette().length; return n ? Math.min(moveBrowseIndex, n - 1) : 0 }
export const moveBrowsePrev = () => { const n = getPalette().length; if (n) moveBrowseIndex = (moveBrowseIndex - 1 + n) % n }
export const moveBrowseNext = () => { const n = getPalette().length; if (n) moveBrowseIndex = (moveBrowseIndex + 1) % n }

// Same idea for YOUR SEQUENCE — compact view still shows exactly one step
// (never zero, if the sequence has any), paged with up/down arrows.
let seqBrowseIndex = 0
export const getSeqBrowseIndex = () => Math.min(seqBrowseIndex, Math.max(0, sequence.length - 1))
export const seqBrowsePrev = () => { if (sequence.length) seqBrowseIndex = (seqBrowseIndex - 1 + sequence.length) % sequence.length }
export const seqBrowseNext = () => { if (sequence.length) seqBrowseIndex = (seqBrowseIndex + 1) % sequence.length }

// --- SFX: fire a bundled one-shot sound when a signature move plays (global, so
// it isn't positional). Empty for now — the 4 VFX moves this mapped to (Power
// Aura/Confetti/Vibe Pulse/Power Surge) are parked (see DOCUMENTATION.md), and
// their sound files were removed from the package to stay under the size cap.
// Re-populate this when the VFX moves ship as a DLC drop.
const SFX: Record<string, string> = {}
let sfxEntity: Entity | undefined
function playSfx(name: string) {
  const url = SFX[name]
  if (!url) return
  if (sfxEntity === undefined) {
    sfxEntity = engine.addEntity()
    Transform.create(sfxEntity)
  }
  AudioSource.createOrReplace(sfxEntity, { audioClipUrl: url, playing: true, volume: 1.0, loop: false, global: true })
}

// UI click SFX — a separate entity from the move-playback SFX above so an add-move
// tap can never fight a currently-dancing move's own sound for the same AudioSource.
let uiSfxEntity: Entity | undefined
function playUiSfx(url: string) {
  if (uiSfxEntity === undefined) {
    uiSfxEntity = engine.addEntity()
    Transform.create(uiSfxEntity)
  }
  AudioSource.createOrReplace(uiSfxEntity, { audioClipUrl: url, playing: true, volume: 1.0, loop: false, global: true })
}

// --- transition cover VFX: a quick puff at every move change to mask the
// pose-snap between emotes. A billboard plane parented to the player. Two
// styles — a small always-visible toggle picks between them (no settings page).
export type FxStyle = 'wipe' | 'subtle'
// Default = 'subtle' (personal-polish flash). The bolder 'wipe' is a showcase
// style gated behind hasShowcaseVfx() — kept off in the base product so the
// wearer isn't given the impression a big showy effect is what others see (it
// isn't; the wearable's flash is wearer-only). See config.ts.
let fxStyle: FxStyle = 'subtle'
export const getFxStyle = () => fxStyle
export const toggleFxStyle = () => { fxStyle = fxStyle === 'wipe' ? 'subtle' : 'wipe' }

const FX_PRESET: Record<FxStyle, { dur: number; maxScale: number; minScale: number; intensity: number; alpha: number }> = {
  wipe: { dur: 0.45, minScale: 0.4, maxScale: 2.8, intensity: 10, alpha: 1.0 },
  subtle: { dur: 0.28, minScale: 0.2, maxScale: 1.1, intensity: 3.5, alpha: 0.45 },
}

let vfxEntity: Entity | undefined
let vfxTimer = 0
let vfxStyleActive: FxStyle = fxStyle // the style in effect for the burst currently animating
function transitionBurst() {
  if (vfxEntity === undefined) {
    vfxEntity = engine.addEntity()
    Transform.create(vfxEntity, { parent: engine.PlayerEntity, position: Vector3.create(0, 1.1, 0), scale: Vector3.Zero() })
    MeshRenderer.setPlane(vfxEntity)
    Billboard.create(vfxEntity)
  }
  vfxStyleActive = fxStyle
  vfxTimer = FX_PRESET[fxStyle].dur
}
let pulseT = 0
export const getPulse = () => (Math.sin(pulseT * 3) + 1) / 2 // 0..1, slow breathing rhythm

// How far through the currently-playing step we are, 0..1 — drives the beat sweep
// across the active row's trim cells so you can SEE the move progressing, not just
// the pose change. stepTotal is the timer's value at step start (already blend-
// adjusted), so progress reaches 1 exactly when the sequencer cuts to the next
// move. Returns 0 whenever nothing is actively dancing (idle or paused).
let stepTotal = 0
export const getPlayProgress = () => {
  if (!playing || paused || stepTotal <= 0) return 0
  return Math.max(0, Math.min(1, 1 - Math.max(timer, 0) / stepTotal))
}

// Tap "pop": a short-lived per-button burst so tapping +/▶ in the palette gives an
// explosive flash of feedback. Keyed by an arbitrary string so only the tapped
// button animates; getTapFx returns 1→0 over TAP_FX_DUR (0 when not firing). The
// timer ticks down in transitionVfxSystem, which runs every frame regardless of
// playback state.
const TAP_FX_DUR = 0.36
let tapFxKey = ''
let tapFxTimer = 0
export const triggerTapFx = (key: string) => { tapFxKey = key; tapFxTimer = TAP_FX_DUR }
export const getTapFx = (key: string) => (tapFxKey === key ? Math.max(0, tapFxTimer) / TAP_FX_DUR : 0)

export function transitionVfxSystem(dt: number) {
  pulseT += dt
  if (tapFxTimer > 0) tapFxTimer -= dt
  if (landTimer > 0) landTimer -= dt
  if (copyMsgTimer > 0) copyMsgTimer -= dt
  if (vfxEntity === undefined) return
  const tr = Transform.getMutable(vfxEntity)
  const p = FX_PRESET[vfxStyleActive]
  if (vfxTimer <= 0) {
    if (tr.scale.x !== 0) tr.scale = Vector3.Zero()
    return
  }
  vfxTimer -= dt
  const k = 1 - Math.max(vfxTimer, 0) / p.dur // 0..1 progress
  const s = p.minScale + (p.maxScale - p.minScale) * k
  tr.scale = Vector3.create(s, s, s)
  Material.setPbrMaterial(vfxEntity, {
    texture: Material.Texture.Common({ src: 'images/glow.png' }),
    alphaTexture: Material.Texture.Common({ src: 'images/glow.png' }),
    emissiveTexture: Material.Texture.Common({ src: 'images/glow.png' }),
    emissiveColor: Color4.create(0.6, 0.85, 1.0),
    emissiveIntensity: p.intensity * (1 - k),
    albedoColor: Color4.create(0.6, 0.85, 1.0, p.alpha * (1 - k)),
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
  })
}

// Transition blend: advance to the next move slightly early so emotes blend
// motion-into-motion instead of settling then snapping. Toggle 0.85 <-> 1.0.
let blendOn = true
export const isBlend = () => blendOn
export const toggleBlend = () => { blendOn = !blendOn }

// --- save / share: encode the built sequence into a portable, self-contained code
// (embeds URNs + durations + steps). Copy puts it on your clipboard; paste a code
// to rebuild it. No server needed. ---
type Wire =
  | { k: 'u'; u: string; n: string; d: number; rp?: number }
  | { k: 's'; s: string; n: string; d: number; rp?: number }
  | { k: 'm'; r: 'fwd' | 'back' | 'left' | 'right'; st: number; d: number; n: string; rp?: number }
export function encodeSequence(): string {
  const w: Wire[] = sequence.map((m) =>
    m.kind === 'urn' ? { k: 'u', u: m.urn, n: m.name, d: m.durationMs, rp: m.repeat }
      : m.kind === 'scene' ? { k: 's', s: m.src, n: m.name, d: m.durationMs, rp: m.repeat }
        : { k: 'm', r: m.dir, st: m.steps, d: m.durationMs, n: m.name, rp: m.repeat })
  return 'DS1:' + JSON.stringify(w)
}
function decodeSequence(code: string): Move[] | null {
  try {
    const t = code.trim()
    const body = t.indexOf('DS1:') === 0 ? t.slice(4) : t
    const w = JSON.parse(body) as Wire[]
    if (!Array.isArray(w)) return null
    const out: Move[] = []
    for (const x of w) {
      if (x.k === 'u') out.push({ kind: 'urn', urn: x.u, name: x.n, durationMs: x.d, repeat: x.rp })
      else if (x.k === 's') out.push({ kind: 'scene', src: x.s.includes('/') ? x.s : `emotes/${x.s}`, name: x.n, durationMs: x.d, repeat: x.rp })
      else if (x.k === 'm') out.push({ kind: 'move', dir: x.r, steps: x.st, name: x.n, durationMs: x.d, repeat: x.rp })
      else return null
    }
    return out
  } catch {
    return null
  }
}
let copyMsg = ''
let copyMsgTimer = 0
let copyMsgOk = true // drives the feedback message's color (success vs failure)
let pasteBuf = ''
export const getCopyMsg = () => (copyMsgTimer > 0 ? copyMsg : '')
export const isCopyMsgOk = () => copyMsgOk
export const setPaste = (v: string) => { pasteBuf = v }
export function copyRoutine() {
  if (sequence.length === 0) { copyMsg = 'Nothing to copy yet — add a move first.'; copyMsgOk = false; copyMsgTimer = 2.5; return }
  void copyToClipboard({ text: encodeSequence() })
  copyMsg = '✓ Copied to clipboard'
  copyMsgOk = true
  copyMsgTimer = 2.5
}
export function loadRoutine() {
  if (playing) return
  const dec = decodeSequence(pasteBuf)
  if (dec && dec.length) {
    sequence = dec
    copyMsg = `✓ Loaded ${dec.length} move${dec.length === 1 ? '' : 's'}`
    copyMsgOk = true
  } else {
    copyMsg = '✕ Invalid code — nothing loaded'
    copyMsgOk = false
  }
  copyMsgTimer = 2.5
}

// Preview a single move (play it once) without adding it to the sequence.
export function previewMove(m: Move) {
  playSfx(m.name)
  transitionBurst()
  if (m.kind === 'move') doStep(m)
  else if (m.kind === 'urn') triggerEmote({ predefinedEmote: silenceClappingAudioEmote(m.urn) })
  else triggerSceneEmote({ src: m.src, loop: false })
  void postDanceEvent(m.name)
  // JAM: if a base loop is running, a preview tap is an interject — hold for this
  // move's length, then resume the base step (instead of the base re-firing over it).
  if (playing) {
    interjecting = true
    timer = (m.durationMs / 1000) * (blendOn ? 0.85 : 1.0)
  }
}

// Glide the avatar a few steps in the direction it's facing, then return to its
// place in the sequence. Forward/right are derived from the avatar's rotation.
function doStep(m: MoveStep) {
  // Defensive: movePlayerTo() is bounds-restricted and rejected for a global
  // wearable. Outside venue mode this is a no-op so a stray travel step can
  // never throw or stall the sequencer.
  if (!canMovePlayer()) return
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (!t) return
  const basis = m.dir === 'left' || m.dir === 'right' ? Vector3.Right() : Vector3.Forward()
  const facing = Vector3.rotate(basis, t.rotation)
  const dist = m.steps * STEP_DIST * (m.dir === 'back' || m.dir === 'left' ? -1 : 1)
  const dest = Vector3.add(t.position, Vector3.scale(facing, dist))
  dest.y = t.position.y // stay on the ground
  movePlayerTo({ newRelativePosition: dest, duration: m.durationMs / 1000 })
}

// Walk-to-interrupt (replaces the old hard input lock). While a routine plays we do
// NOT freeze movement — the player must always be able to just walk away to bail out.
// The old InputModifier lock felt like being trapped (only Stop released it), and on
// some clients an active InputModifier can also interfere with emote playback (a
// likely cause of moves not rendering in-world). Instead we remember where the player
// stood when playback began (playAnchor) and stop the routine the moment they walk
// off that spot — see the check at the top of sequencerSystem.
let playAnchor: Vector3 | undefined
const WALK_INTERRUPT_DIST = 0.6 // metres from the start spot that counts as "walked away"

function playerPos(): Vector3 | undefined {
  const t = Transform.getOrNull(engine.PlayerEntity)
  return t ? Vector3.create(t.position.x, t.position.y, t.position.z) : undefined
}

// We never apply a movement lock anymore; this just clears any stale InputModifier a
// previous build may have left on the player, guaranteeing an always-walkable state.
function releaseMovement() {
  if (InputModifier.has(engine.PlayerEntity)) InputModifier.deleteFrom(engine.PlayerEntity)
}

// DCL has no "cancel the current emote" call — only triggering something new
// cancels it, OR the player physically moving (walking always cuts an emote).
// This reuses that second, real mechanism: an imperceptibly small, near-instant
// movePlayerTo nudge — the same call our travel-steps already use while movement
// is locked — to force an immediate cut instead of letting the move finish itself.
function forceEmoteCancel() {
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (!t) return
  const nudge = Vector3.add(t.position, Vector3.create(0, 0, 0.02))
  movePlayerTo({ newRelativePosition: nudge, duration: 0.05 })
}

function startStep(i: number) {
  const m = sequence[i]
  if (!m) { stopSequence(); return } // sequence shrank out from under a running/looping playback
  playSfx(m.name)
  transitionBurst()
  if (m.kind === 'move') doStep(m)
  else if (m.kind === 'urn') triggerEmote({ predefinedEmote: silenceClappingAudioEmote(m.urn) })
  else triggerSceneEmote({ src: m.src, loop: false })
  void postDanceEvent(m.name)
  // blend: hold 85% of the step so the next move triggers while this one's still
  // moving (motion-into-motion reads smoother). Toggle off = full 100% play-out.
  timer = (m.durationMs / 1000) * (blendOn ? 0.85 : 1.0)
  stepTotal = timer // captured so getPlayProgress can sweep the beat bar 0→1
}

// How many more times (including this one) step i should re-trigger in place
// before the sequencer is allowed to advance. Reset whenever we arrive at a
// step FRESH (Play, seek, advancing forward, looping back to 0, or resuming
// after an interject) — NOT on every repeat-retrigger, or the count would
// never count down and Repeat would loop forever instead of ×N times.
let repsRemaining = 1
// Live countdown for the currently-playing step's repeat button (5x -> 4x -> 3x...
// -> 1x while it plays), so the UI reflects real progress instead of a static
// number. Only meaningful while that step is actually the active one; ui.tsx
// falls back to the step's stored (set) repeat count for every other row.
export const getRepsRemaining = () => repsRemaining
function beginStepFresh(i: number) {
  repsRemaining = sequence[i]?.repeat ?? 1
  startStep(i)
}

export function playSequence() {
  if (playing || sequence.length === 0) return
  playing = true
  interjecting = false
  stepIndex = 0
  releaseMovement()
  playAnchor = playerPos()
  beginStepFresh(0)
}

// Jump straight to step i and keep playing forward from there — for testing a
// specific move and how it flows into the next one, without restarting from 0.
export function seekPlay(i: number) {
  if (i < 0 || i >= sequence.length) return
  playing = true
  interjecting = false
  stepIndex = i
  releaseMovement()
  playAnchor = playerPos()
  beginStepFresh(i)
}
export function stopSequence() {
  playing = false // stop the routine from advancing to the next move
  paused = false
  interjecting = false
  timer = 0
  playAnchor = undefined
  forceEmoteCancel() // cut the currently-dancing move immediately, don't let it finish
  releaseMovement() // ensure the player can always walk (clears any stale lock)
}
// Stop always means: Play starts the WHOLE sequence over from step 0 (unchanged,
// existing behavior of playSequence()) — Stop itself doesn't remember a position.

// Pause/resume: pausing cuts the currently-dancing move immediately (via
// forceEmoteCancel) and freezes the sequencer's clock. Resuming restarts THAT
// SAME move from ITS OWN beginning (not mid-motion — DCL has no way to resume an
// emote from an arbitrary point), then the sequence continues normally from there.
let paused = false
export const isPaused = () => paused
export function togglePause() {
  if (!playing) return
  if (paused) {
    paused = false
    startStep(stepIndex) // resume = replay the current step from its own start
  } else {
    paused = true
    forceEmoteCancel() // cut the current move immediately, don't let it finish
  }
}

export function sequencerSystem(dt: number) {
  if (!playing || paused) return
  // Walk-to-interrupt: avatar emotes play in place, so if the player's position has
  // drifted from where they hit Play, they physically walked — bail out of the whole
  // routine and hand movement straight back (natural escape, no Stop button needed).
  if (playAnchor) {
    const p = playerPos()
    if (p) {
      const dx = p.x - playAnchor.x
      const dz = p.z - playAnchor.z
      if (dx * dx + dz * dz > WALK_INTERRUPT_DIST * WALK_INTERRUPT_DIST) { stopSequence(); return }
    }
  }
  timer -= dt
  if (timer > 0) return
  if (interjecting) { // a tapped interject just finished -> resume the base loop step
    interjecting = false
    beginStepFresh(stepIndex)
    return
  }
  // Repeat: if this step has reps left, re-trigger the SAME step in place
  // instead of advancing — this is the whole mechanism behind the Repeat button.
  if (repsRemaining > 1) {
    repsRemaining--
    startStep(stepIndex)
    return
  }
  stepIndex++
  if (stepIndex < sequence.length) beginStepFresh(stepIndex)
  else if (loopOn) { stepIndex = 0; beginStepFresh(0) }
  else stopSequence()
}
