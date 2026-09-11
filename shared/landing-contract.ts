/**
 * Landing — full-screen arrival cover.
 *
 * THE LAW: this is an in-scene overlay, not Explorer chrome. DCL does not
 * download the world while a guest sits on the Join page. The cover paints on
 * the first scene frame, holds HUD / music / walk, and waits until the staged
 * preload is ready. `maxWaitS` makes ENTER available if a signal stalls; the
 * visitor still enters explicitly so Explorer chrome cannot consume the cover
 * while it is sitting above the scene.
 *
 * Later this same card grows a lobby / settings page (`mode` is reserved).
 * v1 is cover-only.
 */

export const LANDING_VERSION = 1 as const;

export type LandingMode = "cover";

/**
 * What sits at the top of the cover.
 *
 * `title` (default) — the Title field as type. Dance floors, districts, anything
 * that is not the boxing venue.
 * `high_ground` — the High Ground glove badge + ENTER THE ARENA plate. Only the
 * Punch Machine Championship recipe opts in. Punch-enabled on a dance scene must
 * not steal this art: Cloud Dance Floor keeps the island plugin on, and for a
 * week that made its cover the boxing wordmark (owner 2026-09-10).
 */
export type LandingCoverArt = "title" | "high_ground";

/**
 * `access` is last in the list and first in importance: a scene with an Access
 * rule must know whether this visitor is allowed in BEFORE the cover lifts.
 * Deciding it after arrival — which is what happened while access was not a
 * stage at all — shows the whole scene to the one person the rule was written
 * to keep out, and then puts a card over the thing they have already seen.
 */
export const LANDING_STAGES = ["world", "sky", "crowd", "music", "access"] as const;
export type LandingStageId = (typeof LANDING_STAGES)[number];

export const LANDING_STAGE_CALL: Record<LandingStageId | "ready", string> = {
  world: "THE WORLD",
  sky: "SKY",
  crowd: "PEOPLE",
  music: "MUSIC",
  access: "ACCESS",
  ready: "READY",
};

export interface LandingAppConfig {
  enabled: boolean;
  /** Cover-only today. Lobby / presets land later on the same card. */
  mode: LandingMode;
  /** Empty → the scene uses the event name at runtime. */
  title: string;
  subtitle: string;
  coverArt: LandingCoverArt;
  /**
   * When false (the default), the cover is a join/login door. Walking or flying
   * in from a neighbouring scene must not raise it — that is how a World of
   * many plots stays one place. When true, every load of this scene covers,
   * including a border crossing.
   */
  showOnEveryEnter: boolean;
  /** Never dismiss faster than this, even if every stage is already ready. */
  minHoldS: number;
  /** Offer ENTER by this time even if a readiness signal never arrives. */
  maxWaitS: number;
  fadeOutS: number;
  musicFadeInS: number;
}

export const DEFAULT_LANDING_MIN_HOLD_S = 2.5;
export const DEFAULT_LANDING_MAX_WAIT_S = 20;
export const DEFAULT_LANDING_FADE_OUT_S = 0.9;
export const DEFAULT_LANDING_MUSIC_FADE_IN_S = 2.2;

const STAGE_WEIGHT: Record<LandingStageId, number> = {
  world: 0.46,
  sky: 0.11,
  crowd: 0.16,
  music: 0.09,
  access: 0.08,
};
const HOLD_WEIGHT = 0.1;

export function defaultLandingAppConfig(): LandingAppConfig {
  return {
    enabled: false,
    mode: "cover",
    title: "",
    subtitle: "LOADING",
    coverArt: "title",
    showOnEveryEnter: false,
    minHoldS: DEFAULT_LANDING_MIN_HOLD_S,
    maxWaitS: DEFAULT_LANDING_MAX_WAIT_S,
    fadeOutS: DEFAULT_LANDING_FADE_OUT_S,
    musicFadeInS: DEFAULT_LANDING_MUSIC_FADE_IN_S,
  };
}

function clampS(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
  return Math.min(max, Math.max(min, n));
}

function clampText(raw: unknown, max: number, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  return raw.trim().slice(0, max);
}

export function normalizeLandingAppConfig(raw: unknown): LandingAppConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const base = defaultLandingAppConfig();
  return {
    enabled: o.enabled === true,
    mode: "cover",
    title: clampText(o.title, 48, base.title),
    // An authored empty string is a CHOICE — no subtitle — and must survive.
    // `|| base.subtitle` used to bounce it straight back to "LOADING", so a
    // venue could never take the second line off its arrival cover.
    subtitle: clampText(o.subtitle, 24, base.subtitle),
    coverArt: o.coverArt === "high_ground" ? "high_ground" : "title",
    showOnEveryEnter: o.showOnEveryEnter === true,
    minHoldS: clampS(o.minHoldS, 1, 8, base.minHoldS),
    maxWaitS: clampS(o.maxWaitS, 4, 30, base.maxWaitS),
    fadeOutS: clampS(o.fadeOutS, 0.25, 3, base.fadeOutS),
    musicFadeInS: clampS(o.musicFadeInS, 0.4, 6, base.musicFadeInS),
  };
}

export type LandingStageReady = Record<LandingStageId, boolean>;
export type LandingStageProgress = Record<LandingStageId, number>;

/** Core GLBs are usable once a strong majority has reached a terminal state. */
export const LANDING_WORLD_READY_RATIO = 0.95;
/** Reveal a populated scene without waiting for every last NPC in a large crowd. */
export const LANDING_CROWD_READY_RATIO = 0.6;

function stageProgress(value: boolean | number): number {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 0..1 progress toward a majority threshold (for example, 60 of 100 NPCs). */
export function landingThresholdProgress(
  completed: number,
  total: number,
  readyRatio: number,
): number {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  if (safeTotal === 0) return 1;
  const ratio = Math.min(1, Math.max(0.01, readyRatio));
  const target = Math.max(1, Math.ceil(safeTotal * ratio));
  const safeCompleted = Math.max(0, Math.floor(Number.isFinite(completed) ? completed : 0));
  return Math.min(1, safeCompleted / target);
}

export function allLandingStagesReady(
  ready: LandingStageReady | LandingStageProgress,
): boolean {
  return LANDING_STAGES.every((id) => stageProgress(ready[id]) >= 1);
}

/** Fight-game call on the current incomplete stage, or READY. */
export function landingCall(ready: LandingStageReady | LandingStageProgress): string {
  for (const id of LANDING_STAGES) {
    if (stageProgress(ready[id]) < 1) return LANDING_STAGE_CALL[id];
  }
  return LANDING_STAGE_CALL.ready;
}

/**
 * 0..1 fill. Stages are chunks; the last sliver is the min-hold so the bar
 * never sits at 100% and then waits.
 */
export function landingFraction(
  ready: LandingStageReady | LandingStageProgress,
  elapsedS: number,
  minHoldS: number,
): number {
  let fill = 0;
  for (const id of LANDING_STAGES) {
    fill += STAGE_WEIGHT[id] * stageProgress(ready[id]);
  }
  const hold = minHoldS <= 0 ? 1 : Math.min(1, Math.max(0, elapsedS) / minHoldS);
  fill += HOLD_WEIGHT * hold;
  return Math.min(1, fill);
}

export function landingCanOfferEntry(
  ready: LandingStageReady | LandingStageProgress,
  elapsedS: number,
  cfg: Pick<LandingAppConfig, "minHoldS" | "maxWaitS">,
): boolean {
  if (elapsedS >= cfg.maxWaitS) return true;
  return allLandingStagesReady(ready) && elapsedS >= cfg.minHoldS;
}

/** @deprecated Runtime entry is now explicit; use landingCanOfferEntry. */
export const landingCanRelease = landingCanOfferEntry;

/** Smoothstep 0..1. */
export function landingEase(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** How close to a plot edge counts as walking in from a neighbour. */
export const LANDING_WALK_IN_EDGE_M = 8;
/** Horizontal speed that means the visitor is already travelling, not logging in. */
export const LANDING_TRANSIT_SPEED_MPS = 1.25;
export const LANDING_SESSION_KEY = "sv.landing.session";
/** A scene hop is well under this; quitting Explorer goes stale. Heartbeat keeps it live. */
export const LANDING_SESSION_STALE_MS = 60_000;

export function isLandingWalkIn(input: {
  playerX: number;
  playerZ: number;
  spawnX: number;
  spawnZ: number;
  sizeX: number;
  sizeZ: number;
  edgeM?: number;
}): boolean {
  const edge = input.edgeM ?? LANDING_WALK_IN_EDGE_M;
  const nearEdge =
    input.playerX <= edge ||
    input.playerZ <= edge ||
    input.playerX >= input.sizeX - edge ||
    input.playerZ >= input.sizeZ - edge;
  if (!nearEdge) return false;
  return Math.hypot(input.playerX - input.spawnX, input.playerZ - input.spawnZ) > edge + 2;
}

export function isLandingTransit(input: {
  speedX: number;
  speedZ: number;
  speedY?: number;
  /**
   * Vertical speed only counts in the air. A spawn-column gravity fall is a
   * login, and treating it as transit is how KEEP FLYING appeared on join.
   */
  airborne?: boolean;
}): boolean {
  if (Math.hypot(input.speedX, input.speedZ) >= LANDING_TRANSIT_SPEED_MPS) return true;
  if (!input.airborne) return false;
  return (
    typeof input.speedY === "number" && Math.abs(input.speedY) >= LANDING_TRANSIT_SPEED_MPS
  );
}

export function parseLandingSession(
  raw: string | null | undefined,
): { realm: string; t: number } | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { realm?: unknown; t?: unknown };
    const realm = typeof o.realm === "string" ? o.realm.trim() : "";
    const t = typeof o.t === "number" && Number.isFinite(o.t) ? o.t : 0;
    if (!realm || t <= 0) return null;
    return { realm, t };
  } catch {
    return null;
  }
}

export function landingSessionLive(
  session: { realm: string; t: number } | null,
  realm: string,
  now: number,
  staleMs = LANDING_SESSION_STALE_MS,
): boolean {
  if (!session) return false;
  const here = realm.trim().toLowerCase();
  if (!here || session.realm.trim().toLowerCase() !== here) return false;
  return now - session.t >= 0 && now - session.t < staleMs;
}

export function serializeLandingSession(realm: string, t: number): string {
  return JSON.stringify({ realm: realm.trim().toLowerCase(), t });
}

/**
 * ── THE CHAMPIONSHIP ARRIVAL STACK ─────────────────────────────────────────
 *
 * A punch championship's cover is three pieces of authored art stacked in a
 * column — the HIGH GROUND badge, the cloud shelf that loads, and the ENTER
 * THE ARENA banner — and the arithmetic that fits them lives here, out of the
 * renderer, because it is the part that can be WRONG WITHOUT ANYONE SEEING IT.
 *
 * The cover's width has always been chosen from the canvas width alone. That
 * was survivable while every row was a 56 px bar and a line of type; it is not
 * survivable now that two of the three rows are tall art. A handset gives the
 * scene 1600x720 and `coverWidth()` widens by a third for the thumb, so a
 * width-only stack runs 250 px past the top of the screen with the star cut off
 * the badge — and nothing in the scene would have said so.
 */

/** Aspect ratios measured off the shipped exports. Re-export the art, move these. */
export const LANDING_ARENA_ART = {
  /** images/punch/logo-high-ground.png — 900x739 */
  badge: 900 / 739,
  /** images/punch/meter-cloud.png — 1080x360 */
  shelf: 3,
  /** images/punch/btn-enter-arena.png — 1024x341 */
  plate: 1024 / 341,
} as const;

/**
 * Design-pixel boxes and the rhythm between them.
 *
 * The gaps are TIGHTER than the plain cover's 18–20 px because every piece
 * here carries its own transparent margin: the shelf's cloud fills about 62%
 * of its box, and the badge and the plate each have a soft rim. Spacing drawn
 * for bare rows lands on air that is already there and opens a hole in the
 * middle of the screen. These are the gaps between the INKED edges.
 */
export const LANDING_ARENA_BOX = {
  badgeW: 430,
  plateW: 500,
  /**
   * The plate is the one TAP TARGET on the cover, so it has a floor of its own
   * — and the floor is 380, not the 320 the first cut used. At 320 on a handset
   * the button came out narrower than the loading bar above it, which puts the
   * smallest element on a touch screen on the only thing anyone has to hit.
   */
  plateMinW: 380,
  badgeMinW: 120,
  shelfMinW: 200,
  gapBadge: 4,
  gapShelf: 2,
  gapStatus: 14,
  /** Air the stack must leave at the top and bottom of any canvas. */
  marginY: 40,
  /** How much wider the cover runs on a handset, so a thumb has something to hit. */
  compactWiden: 1.35,
} as const;

export type LandingArenaStack = {
  badgeW: number;
  badgeH: number;
  shelfW: number;
  shelfH: number;
  plateW: number;
  plateH: number;
  /** Everything the column occupies, gaps included, with the plate always counted. */
  totalH: number;
};

/**
 * Fit the badge, the shelf and the plate into the height that actually exists.
 *
 * ‼️THE PLATE'S HEIGHT IS RESERVED WHETHER OR NOT IT IS DRAWN YET. Sizing the
 * column against what is on screen right now would shrink the badge at the
 * exact moment the bar fills and ENTER appears — a pop on the one frame the
 * visitor is looking hardest at.
 */
export function landingArenaStack(input: {
  /** Canvas height in design pixels: 1080 on a monitor, 720 on a handset. */
  canvasH: number;
  /** What `coverWidth()` allows — already widened for a handset. */
  room: number;
  compact: boolean;
  /** The status line's box, derived from its font by the caller. */
  statusH: number;
}): LandingArenaStack {
  const B = LANDING_ARENA_BOX;
  const A = LANDING_ARENA_ART;
  const gaps = B.gapBadge + B.gapShelf + B.gapStatus;
  const budget = input.canvasH - B.marginY * 2 - input.statusH - gaps;
  const wantPlateW = Math.max(B.plateMinW, Math.min(B.plateW, input.room));
  const wantBadgeW = Math.min(
    Math.round(B.badgeW * (input.compact ? B.compactWiden : 1)),
    input.room,
  );
  const artH = (plate: number, badge: number, shelf: number) =>
    plate / A.plate + badge / A.badge + shelf / A.shelf;
  const k = Math.min(1, budget / Math.max(1, artH(wantPlateW, wantBadgeW, input.room)));
  // The plate is the one control, so its floor wins over the scale...
  const plateW = Math.max(B.plateMinW, Math.round(wantPlateW * k));
  const plateH = Math.round(plateW / A.plate);
  // ...and whatever that floor takes back comes off the badge and the shelf,
  // together, so the proportion they were drawn at survives it.
  const rest = budget - plateH;
  const k2 = Math.min(1, rest / Math.max(1, artH(0, wantBadgeW, input.room)));
  const badgeW = Math.max(B.badgeMinW, Math.round(wantBadgeW * k2));
  const shelfW = Math.max(B.shelfMinW, Math.round(input.room * k2));
  const badgeH = Math.round(badgeW / A.badge);
  const shelfH = Math.round(shelfW / A.shelf);
  return {
    badgeW,
    badgeH,
    shelfW,
    shelfH,
    plateW,
    plateH,
    totalH: badgeH + B.gapBadge + shelfH + B.gapShelf + input.statusH + B.gapStatus + plateH,
  };
}
