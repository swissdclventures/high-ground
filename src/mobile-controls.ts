/**
 * The scene's mobile on-screen controls.
 *
 * On a phone the Explorer draws its own joystick, crosshair and gamepad cluster
 * over our HUD, and by default it draws EVERY button — including the ones this
 * scene never reads. That cluster is what forced the punch glove to sit 118 px
 * higher than it wants to (see `GLOVE_TOUCH_LIFT`): two stacked controls under
 * one thumb, where a tap could land on either.
 *
 * `TouchScreenControls` (SDK 7.27+) lets the scene say which of those buttons
 * exist. We hide what we do not read and keep what we do, so the bottom-right
 * corner holds only controls that actually do something here.
 *
 * What stays, and why:
 *   joystick    — the player has to walk to the machine.
 *   jump        — the clouds and the vent are jump content.
 *   E / POINTER — focus, and the "return to the island" escape hatch.
 *   F           — the Twist secret (held through a charge).
 *   1 and 3     — the Knock secret (1-3-1).
 *
 * What goes:
 *   crosshair   — the game already draws its own reticle, front and centre, and
 *                 it is the hero element. A second dot next to it reads as a bug.
 *   2 and 4     — nothing in this scene ever reads IA_ACTION_4 / IA_ACTION_6.
 *
 * All of it is a no-op on desktop, where there are no on-screen controls to
 * configure, so this is safe to call unconditionally.
 */
import { InputAction, TouchScreenControls } from '@dcl/sdk/ecs'

/** The gamepad buttons this scene never reads. */
const UNUSED_BUTTONS = [InputAction.IA_ACTION_4, InputAction.IA_ACTION_6]

let applied = false

/**
 * Trim the mobile control cluster down to the buttons the punch island uses.
 * Idempotent: the component is last-write-wins on the RootEntity, but repeating
 * the write every plugin start would churn the wire for no reason.
 */
export function applyPunchIslandTouchControls(): void {
  if (applied) return
  applied = true
  TouchScreenControls.hideCrosshair()
  TouchScreenControls.hide(UNUSED_BUTTONS)
}

/**
 * Hand the full default cluster back. Only needed if a scene ever tears the
 * punch machine down and keeps running — the buttons are the client's, not
 * ours, and leaving them hidden would strand a later app without controls.
 */
export function restoreDefaultTouchControls(): void {
  if (!applied) return
  applied = false
  TouchScreenControls.showAll()
  TouchScreenControls.showCrosshair()
}
