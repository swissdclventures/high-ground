/**
 * Applies the scene's avatar controls — once, and only ever by scaling.
 *
 * The explorer owns the real numbers. This module never invents one: it waits
 * until `AvatarLocomotionSettings` exists on the player, which is the moment the
 * client has published its own baseline, and multiplies that. Until then it
 * does nothing and tries again next frame, forever if necessary.
 *
 * That "forever if necessary" is the point. On a client that never publishes
 * locomotion values — an older explorer, a mobile build, anything we have not
 * seen — this file is a permanent no-op and the venue moves exactly as it does
 * with the feature switched off. A movement change that can silently do nothing
 * is the only kind worth shipping into a scene we cannot test on every client.
 */
import { AvatarLocomotionSettings, engine } from '@dcl/sdk/ecs'
import { avatarControlsActive, type AvatarControlsConfig } from '@shared/avatar-controls'

let applied = false

function scaled(value: number | undefined, factor: number): number | undefined {
  // Absent fields stay absent. Writing a number where the explorer sent nothing
  // would be inventing a baseline, which is the one thing this file must not do.
  return typeof value === 'number' && value > 0 ? value * factor : value
}

/**
 * Call every frame. Returns immediately on all but one of them.
 *
 * @param config the scene's controls, or a caller's own default when a venue
 *        wants a feel of its own without waiting for an author to configure one.
 */
export function applyAvatarControls(config: AvatarControlsConfig | null | undefined): void {
  if (applied || !config || !avatarControlsActive(config)) return
  const current = AvatarLocomotionSettings.getOrNull(engine.PlayerEntity)
  if (!current) return
  applied = true
  AvatarLocomotionSettings.createOrReplace(engine.PlayerEntity, {
    ...current,
    walkSpeed: scaled(current.walkSpeed, config.walk),
    jogSpeed: scaled(current.jogSpeed, config.jog),
    runSpeed: scaled(current.runSpeed, config.run),
    jumpHeight: scaled(current.jumpHeight, config.jump),
    // The running jump rides the jump slider too: authoring them apart lets a
    // venue produce a body that hops higher standing still than at a sprint.
    runJumpHeight: scaled(current.runJumpHeight, config.jump)
  })
}

/** Test seam — the latch is module state, and scenes reload per session. */
export function resetAvatarControlsForTest(): void {
  applied = false
}
