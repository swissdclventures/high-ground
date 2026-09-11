/**
 * Arcade result banner — pure, no SDK.
 *
 * One short KO word. The stamp waits for the fall to start so it does not
 * cover the body going down. Auto-proceed only after the fall has played out
 * and they have lain on the floor long enough to watch — rushing this is what
 * made KOs look like flying or running away.
 */

export const SCRAP_RESULT_KO_MS = 1100;
export const SCRAP_RESULT_PUNCH_MS = 180;
/** Let the wide cut land before the stamp covers the frame. */
export const SCRAP_RESULT_STAMP_MS = 520;
/** Walk on after this — long enough for fall + orbit + ground beat. No button. */
export const SCRAP_RESULT_PROCEED_MS = 8000;

export interface ScrapResultBanner {
  headline: string;
  kicker: string;
  detail: string;
  punch: number;
  flash: number;
  won: boolean;
  canProceed: boolean;
}

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function scrapResultBanner(input: {
  won: boolean;
  ageMs: number;
  detail: string;
}): ScrapResultBanner {
  const age = Math.max(0, input.ageMs);
  const punch = clamp01(age / SCRAP_RESULT_PUNCH_MS);
  const flash = clamp01(1 - age / 420);
  const stamped = age >= SCRAP_RESULT_STAMP_MS;
  return {
    headline: stamped ? "KO" : "",
    kicker: stamped ? (input.won ? "YOU WON" : "YOU LOST") : "",
    detail: "",
    punch,
    flash,
    won: input.won,
    canProceed: age >= SCRAP_RESULT_PROCEED_MS,
  };
}
