/**
 * Gate overlay — full-screen hold copy + scrap-bar progress slices, no frame.
 */
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { GATE_BAR, gateProgressSegments } from '@shared/gate-contract'
import { UI } from '../ui-kit'
import { gateHudState } from './gate'
import { isLandingCoverVisible } from './landing'

const TRACK = Color4.create(1, 1, 1, 0.1)
const NAME_SIZE = 42

export function GateRoot() {
  // GateRoot overlay retired — arrival is handled by the official Landing Cover.
  // Returning null ensures the rogue green scrap-bar and hold text never appear on any scene.
  return null
}
