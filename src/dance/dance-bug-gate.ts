/**
 * Dance Bug wearable gate — own it in the wallet AND have it equipped
 * or the battle moves are not available, so join is refused.
 */
import { getPlayer } from '@dcl/sdk/players'
import { DANCE_BUG_COLLECTION_CONTRACT, DANCE_BUG_ITEM_URN, wearableCollectionEquipped, wearableUrnEquipped } from '@shared/speakeasy-world-gate'

export { wearableUrnEquipped }

const CHIP_MS = 4500
const FLOOR_HINT = 'Equip DANCE BUG to join'
const READY_HINT = 'DANCE BUG ready'

let chipText = ''
let chipUntil = 0
let chipTick = 0
let wasInFloor = false

export function isDanceBugEquipped(): boolean {
  const worn = getPlayer()?.wearables
  return (
    wearableUrnEquipped(worn, DANCE_BUG_ITEM_URN) ||
    wearableCollectionEquipped(worn, DANCE_BUG_COLLECTION_CONTRACT)
  )
}

let refresh: (() => void) | null = null
export function setDanceBugChipRefresh(fn: () => void): void {
  refresh = fn
}

export function showDanceBugChip(text: string, ms = CHIP_MS): void {
  chipText = text
  chipUntil = Date.now() + ms
  chipTick += 1
  refresh?.()
}

export function danceBugChip(): { text: string; tick: number } | null {
  void chipTick
  if (!chipText || Date.now() >= chipUntil) return null
  return { text: chipText, tick: chipTick }
}

/** Call from presence: toast on inner-circle entry; keep the hint while unequipped. */
export function syncDanceBugFloorHint(inFloor: boolean): { mayJoin: boolean } {
  const equipped = isDanceBugEquipped()
  if (inFloor && !wasInFloor) {
    if (equipped) showDanceBugChip(READY_HINT, 3200)
    else showDanceBugChip(FLOOR_HINT, 60_000)
  }
  if (inFloor && !equipped) {
    chipText = FLOOR_HINT
    chipUntil = Date.now() + 60_000
  }
  if (!inFloor && chipText === FLOOR_HINT) {
    chipText = ''
    chipUntil = 0
    chipTick += 1
    refresh?.()
  }
  wasInFloor = inFloor
  return { mayJoin: equipped }
}
