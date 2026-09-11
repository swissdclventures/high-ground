/**
 * Minimap expanded / collapsed — owned here so the HUD can toggle it without
 * importing the SDK-heavy minimap renderer, and so tests can pin the default
 * without booting a scene.
 *
 * Starts collapsed. Boot reveal expands it after the first avatar wave so the
 * map is still there, just not fighting 100 AvatarShapes on frame one.
 *
 * The on-screen control is the chevron on the map itself. SDK7 does not
 * forward digit keys, so there is no keyboard binding.
 */
let open = false
let version = 0
let userToggled = false

export function isMinimapOpen(): boolean {
  return open
}

export function minimapVisibilityVersion(): number {
  return version
}

export function toggleMinimap(): void {
  userToggled = true
  open = !open
  version += 1
}

export function setMinimapOpen(value: boolean): void {
  if (open === value) return
  open = value
  version += 1
}

/** Expand after boot unless the visitor already clicked the chevron. */
export function revealMinimapAfterBoot(): void {
  if (userToggled) return
  setMinimapOpen(true)
}

/** Vitest shares this module; reset so cases do not leak toggle state. */
export function resetMinimapVisibility(): void {
  open = false
  version = 0
  userToggled = false
}
