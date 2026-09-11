/**
 * ‼️THE ONE DOOR BETWEEN THE PUNCH MACHINE AND SCRAP.
 *
 * Owner, 2026-09-06: *"I've activated the fighting plugin and suddenly I got
 * provoked to a fight with an NPC while I was playing the game… when it's my
 * turn nobody can pick a fight with me… if an NPC is playing with the machine
 * we should not be able to attack them… if you're flying down at some point it
 * should get you out of boxing mode."*
 *
 * Scrap and the punch machine must not import each other (punch → troupe →
 * scrap → punch would be a cycle), so the machine registers a reading here and
 * Scrap asks. The default answers keep every other scene exactly as it was.
 */
let guestBusy: () => boolean = () => false
let guestLeaving: () => boolean = () => false

/** The machine says whether the LOCAL guest is holding the bag or falling off the island. */
export function setScrapGuestGuard(guard: { busy: () => boolean; leaving: () => boolean }): void {
  guestBusy = guard.busy
  guestLeaving = guard.leaving
}

/** True while the local guest must not be hassled, provoked or matched. */
export function scrapGuestUnavailable(): boolean {
  try {
    return guestBusy()
  } catch {
    return false
  }
}

/** True while the local guest is airborne: a live bout lets go so they can fly. */
export function scrapGuestLeaving(): boolean {
  try {
    return guestLeaving()
  } catch {
    return false
  }
}

/** A bout the LOCAL guest was in has resolved. The punch machine turns a win into Momentum. */
export type ScrapBoutOutcome = 'player_win' | 'npc_win' | 'walk_away'
let boutListener: ((outcome: ScrapBoutOutcome) => void) | null = null
export function setScrapBoutListener(listener: ((outcome: ScrapBoutOutcome) => void) | null): void {
  boutListener = listener
}
export function notifyScrapBout(outcome: ScrapBoutOutcome): void {
  try {
    boutListener?.(outcome)
  } catch (error) {
    console.error('[scrap] bout listener failed: ' + String(error))
  }
}
