/**
 * Arrival music hold — landing cover owns the first seconds of sound.
 *
 * Playlist and ambient both multiply their target by `arrivalMusicGain()`.
 * While the cover is up the gain is 0. After release the landing plugin ramps
 * it 0 → 1 so music fades in instead of slamming on.
 */
let hold = false
let fade = 1

export function setArrivalMusicHold(on: boolean): void {
  hold = on
  if (on) fade = 0
}

export function setArrivalMusicFade(fraction: number): void {
  fade = Math.min(1, Math.max(0, fraction))
}

export function isArrivalMusicHeld(): boolean {
  return hold
}

export function arrivalMusicGain(): number {
  if (hold) return 0
  return fade
}
