/**
 * Arrival volume multiplier — one number the MusicTransport sources poll.
 *
 * Gate holds this at 0 so playlist / ambient bed / venue set / URL emitters
 * start silent without a second playback path. During the blend it rises to 1
 * (the host/settings target). When Gate is off it stays 1, so today's boot is
 * unchanged.
 *
 * Same shape as location-hold.ts: sources multiply it on their existing volume
 * write. host-transport.ts re-exports the helper so MusicTransport is the
 * contract surface.
 */
let gain = 1
const listeners = new Set<() => void>()

export function hostAudioArrivalGain(): number {
  return gain
}

export function setHostAudioArrivalGain(next: number): void {
  const clamped = Math.max(0, Math.min(1, next))
  if (Math.abs(clamped - gain) < 0.0005) return
  gain = clamped
  for (const fn of listeners) fn()
}

export function onHostAudioArrivalGainChange(fn: () => void): void {
  listeners.add(fn)
}

/** Test seam + scene reload. */
export function resetHostAudioArrivalGain(): void {
  gain = 1
  listeners.clear()
}
