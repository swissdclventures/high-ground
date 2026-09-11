/**
 * Speakeasy room state — the config, and whether you are standing in the room.
 *
 * Read by the systems in `index.ts` and the HUD in `ui.tsx`; neither owns the other.
 *
 * This used to also carry occupancy, capacity and "turned away", feeding a door
 * sign and a seat counter. The room has no limit any more, so counting guests has
 * gone with it — the only thing a visitor needs to know is whether their entry
 * ticket opens the exit, and that comes from `dance-bug-access`.
 */

import type { SpeakeasyRoomConfig } from '@shared/speakeasy-room-contract'

export interface SpeakeasyState {
  config: SpeakeasyRoomConfig | null
  /** True while the LOCAL player is inside the lounge. */
  inside: boolean
}

const state: SpeakeasyState = {
  config: null,
  inside: false,
}

let tick = 0
let refresh: (() => void) | null = null

export function setSpeakeasyRefresh(fn: () => void): void {
  refresh = fn
}

export function getSpeakeasyState(): SpeakeasyState {
  return state
}

export function getSpeakeasyTick(): number {
  return tick
}

export function setSpeakeasyConfig(config: SpeakeasyRoomConfig | null): void {
  state.config = config
  bump()
}

/** Only nudges the HUD when the answer actually changed. */
export function setSpeakeasyInside(inside: boolean): void {
  if (state.inside === inside) return
  state.inside = inside
  bump()
}

function bump(): void {
  tick += 1
  refresh?.()
}
