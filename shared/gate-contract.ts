/**
 * Gate — full-screen arrival hold until the world is actually ready.
 *
 * Increment 1 is the hold + blend only. Login, first-time setup, and
 * matchmaking are reserved on this contract so later increments can fill them
 * without a new app id. Do not read those fields at runtime yet.
 *
 * Default ON. A missing key on an existing world is treated as enabled — this
 * is the opposite of the usual "new apps start off" rule, because Butler/Swiss
 * want arrivals covered immediately.
 */
import {
  SCRAP_BAR,
  scrapBarSegments,
  type ScrapBarFamily,
  type ScrapBarSegment,
} from "./scrap-bar";

export const GATE_APP_ID = "swissverse.gate" as const;

/**
 * NO FALLBACK NAME. EVER.
 *
 * This used to be the literal `"Swiss"`, and the boot cover wore it on every
 * single boot — because the cover goes up at frame 0, before the config that
 * carries the real name has been read. A visitor arriving at Punch Machine was
 * shown the word "Swiss" and a stalled bar: a name belonging to a different
 * world, for a place they had never asked for. On a slow config read that was
 * the whole arrival.
 *
 * An unknown name is drawn as NOTHING. The bar alone is honest; a borrowed
 * name is not. Do not reintroduce a default here, and do not "improve" it by
 * substituting a brand — the same bug wearing a nicer word is the same bug.
 */
export const GATE_HOLD_NAME_UNKNOWN = "";

/** Fade overlay alpha 1→0. Slow enough that the reveal is a blend, not a cut. */
export const GATE_FADE_S = 6.5;

/** Avoid a one-frame flash when GLTFs are already done on the first tick. */
export const GATE_MIN_HOLD_S = 0.45;

/** Safety: a stuck mesh must not trap the player behind the overlay forever. */
export const GATE_MAX_HOLD_S = 14;

/**
 * Progress track — same gradient family as the fight bars, larger, no frame.
 * The fight kit's nine-slice chrome stays in scrap-hud-kit; Gate paints slices
 * on a naked track.
 */
export const GATE_BAR = {
  width: 420,
  fillH: 28,
  frame: 0,
  family: "you" as ScrapBarFamily,
  segments: SCRAP_BAR.segments,
} as const;

export type GatePhase = "off" | "hold" | "blend" | "done";

export interface GateAppConfig {
  enabled: boolean;
  /**
   * LATER — accounts / identity. Increment 1 does not read this.
   * Reserved so a live document can grow a login step without a new plugin id.
   */
  login?: {
    enabled?: boolean;
  };
  /**
   * LATER — first-time setup. Increment 1 does not read this.
   */
  setup?: {
    enabled?: boolean;
  };
  /**
   * LATER — matchmaking lobby. Increment 1 does not read this.
   */
  matchmaking?: {
    enabled?: boolean;
  };
}

export function defaultGateAppConfig(): GateAppConfig {
  return { enabled: true };
}

/**
 * Missing key / missing object → enabled true. Explicit false stays false.
 * Reserved later fields are accepted and ignored.
 */
export function normalizeGateAppConfig(raw: unknown): GateAppConfig {
  if (!raw || typeof raw !== "object") return defaultGateAppConfig();
  const o = raw as Partial<GateAppConfig>;
  return { enabled: o.enabled !== false };
}

/**
 * World name for the hold copy: the baked World identity, then the
 * scene/building name, then the scene name. If none of them is known yet the
 * answer is the EMPTY STRING and the overlay draws no name at all — see
 * GATE_HOLD_NAME_UNKNOWN for why there is no default.
 */
export function resolveGateHoldName(input: {
  worldName?: string | null;
  buildingName?: string | null;
  sceneName?: string | null;
}): string {
  const strip = (value: string | null | undefined): string => {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) return "";
    return trimmed.replace(/\.dcl\.eth$/i, "").trim();
  };
  return (
    strip(input.worldName) ||
    strip(input.buildingName) ||
    strip(input.sceneName) ||
    GATE_HOLD_NAME_UNKNOWN
  );
}

/** Smoothstep — linger on the hold, then ease into the world. */
export function gateEase(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function gateOverlayAlpha(phase: GatePhase, blendT: number): number {
  if (phase === "off" || phase === "done") return 0;
  if (phase === "hold") return 1;
  return 1 - gateEase(blendT);
}

export function gateMusicGain(phase: GatePhase, blendT: number): number {
  if (phase === "off" || phase === "done") return 1;
  if (phase === "hold") return 0;
  return gateEase(blendT);
}

export function gateProgressSegments(fraction: number): ScrapBarSegment[] {
  return scrapBarSegments({
    fraction,
    family: GATE_BAR.family,
    segments: GATE_BAR.segments,
  });
}

/**
 * Real readiness, not a timer. The min hold only prevents a one-frame flash;
 * the max hold is a safety valve when a mesh never reports finished.
 */
export function worldReadyForArrival(input: {
  unreadyGltfs: number;
  elapsedS: number;
  minHoldS?: number;
  maxHoldS?: number;
  /**
   * The scene's own boot has not produced its geometry yet — the cover is up
   * ahead of `await loadDeployedConfig()`, so there is nothing to count.
   *
   * Without this the cover lifted itself on the FIRST HALF-SECOND of every
   * boot: zero GltfContainers exist that early, so "no unready meshes" reads as
   * "the world is ready" and the visitor is shown a scene that has not been
   * built. The max hold below still wins, so a boot that never finishes cannot
   * trap anyone behind the overlay.
   */
  bootPending?: boolean;
  /**
   * The visitor is still being put back where the scene says they arrive — see
   * `@shared/arrival-contract`. Meshes being ready is not an arrival: on a sky
   * island the avatar has been falling since before our first frame, so a cover
   * that lifts on mesh readiness alone lifts onto the ground, and the restore
   * that follows reads as being catapulted back up. The max hold above still
   * wins, so a restore that never takes cannot trap anyone.
   */
  arrivalPending?: boolean;
}): boolean {
  const min = input.minHoldS ?? GATE_MIN_HOLD_S;
  const max = input.maxHoldS ?? GATE_MAX_HOLD_S;
  if (input.elapsedS >= max) return true;
  if (input.bootPending) return false;
  if (input.arrivalPending) return false;
  if (input.elapsedS < min) return false;
  return input.unreadyGltfs <= 0;
}

export function isGateAppId(id: string): boolean {
  const n = id.trim().toLowerCase().replace(/_/g, "-");
  return n === GATE_APP_ID || n === "gate";
}
