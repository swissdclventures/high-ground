/**
 * One line of controls for whatever the guest is currently riding, shown as a small chip
 * at the top of the HUD.
 *
 * It used to live on the craft itself as a world-space TextShape, which meant a sentence of
 * instructions floating across the middle of the screen, over the scenery, in front of the car
 * you were trying to look at. Controls are HUD furniture; the world label is now just the
 * craft's name and state.
 */
let hint: string | null = null

export function setRideHint(text: string | null): void {
  hint = text
}

export function activeRideHint(): string | null {
  return hint
}
