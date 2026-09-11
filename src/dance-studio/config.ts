/**
 * Scene-side stand-in for the wearable's capability config
 * (DCL Dance Smart Wearable → wearable/src/config.ts).
 *
 * Here the Dance Studio runs INSIDE a real scene the player is standing in, so
 * movePlayerTo() is allowed — travel steps light up (they're rejected for the
 * global wearable, which is why the original gates them).
 * Showcase VFX stays off: the transition flash is local-client only either way,
 * and the toggle would oversell what spectators see.
 */
export const canMovePlayer = (): boolean => true
export const hasShowcaseVfx = (): boolean => false
