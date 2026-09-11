/**
 * Boxing hit knockback — Bubble Bash geometry, fight-scale travel.
 *
 * Humans have no physics body. Bubble Bash already solved that with a planned
 * hop (`planBubbleKnock` + `movePlayerTo`). Scrap was only shaking the camera,
 * so a MAX punch looked like a slap. This file is the shared hop: charge and
 * whether the hit was heavy decide metres, not the 5–22 m bubble ring-out.
 *
 * NPCs still have no physics — the runtime writes Transform along this plan.
 * Clamp the hop with `scrapKoKnockbackPlan` so a punch cannot throw anyone
 * through a tower.
 */

export interface ScrapHitKnockSpec {
  backM: number;
  liftM: number;
  durationMs: number;
}

export const SCRAP_HIT_KNOCK_LIGHT_M = 0.7;
export const SCRAP_HIT_KNOCK_HEAVY_M = 1.35;
export const SCRAP_HIT_KNOCK_MAX_M = 2.1;
export const SCRAP_HIT_KNOCK_MIN_CHARGE = 0.52;

export function scrapHitKnockSpec(input: {
  side: "landed" | "received";
  charge: number;
  turbo: boolean;
  heavy: boolean;
  score: number;
}): ScrapHitKnockSpec | null {
  const charge = Math.max(0, Math.min(1, input.charge));
  if (input.side === "received") {
    // Exposed crosses and uppercuts pass `turbo`: this is the maximum received
    // reaction, still tiny beside Bubble Bash's 5–22 m ring-out launch.
    if (input.turbo) {
      return {
        backM: SCRAP_HIT_KNOCK_MAX_M,
        liftM: 0.26,
        durationMs: 440,
      };
    }
    if (input.heavy) {
      return {
        backM: SCRAP_HIT_KNOCK_HEAVY_M,
        liftM: 0.18,
        durationMs: 380,
      };
    }
    return {
      backM: SCRAP_HIT_KNOCK_LIGHT_M,
      liftM: 0,
      durationMs: 280,
    };
  }
  if (!input.turbo && charge < SCRAP_HIT_KNOCK_MIN_CHARGE) return null;
  if (input.score >= 100 || (input.turbo && charge >= 0.92)) {
    return {
      backM: 1.55 + 0.55 * charge,
      liftM: 0.22 + 0.12 * charge,
      durationMs: 420,
    };
  }
  if (input.turbo) {
    return {
      backM: 0.95 + 0.85 * charge,
      liftM: 0.1 + 0.16 * charge,
      durationMs: 360,
    };
  }
  return {
    backM: 0.55 + 0.55 * charge,
    liftM: 0,
    durationMs: 280,
  };
}
