/**
 * A place can hold the music channel without being a sound source of its own.
 *
 * Speakeasy is the first: inside the lounge, venue music (playlist, ambient bed,
 * URL stream, breakdance set) goes to zero so proximity voice is the thing you
 * hear. The hold is LOCAL — each client keys off where they are standing — and
 * it never changes anyone else's play/pause preference. Walk out and the music
 * you had playing is still playing.
 *
 * Sources poll `isMusicHeldByLocation()` on their volume path. The guest widget
 * reads `musicLocationHold()` so the mute is explained, not mysterious.
 */
export interface MusicLocationHold {
  id: string
  label: string
}

let hold: MusicLocationHold | null = null
const listeners = new Set<() => void>()

export function setMusicLocationHold(next: MusicLocationHold | null): void {
  const same = hold?.id === next?.id && hold?.label === next?.label
  if (same) return
  hold = next
  for (const fn of listeners) fn()
}

export function musicLocationHold(): MusicLocationHold | null {
  return hold
}

export function isMusicHeldByLocation(): boolean {
  return hold !== null
}

/** Media streams are event-driven; they re-apply volume when the hold flips. */
export function onMusicLocationHoldChange(fn: () => void): void {
  listeners.add(fn)
}

/** Test seam + scene reload. */
export function resetMusicLocationHold(): void {
  hold = null
  listeners.clear()
}
