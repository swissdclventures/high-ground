/**
 * AVATAR CONTROLS — how a scene changes the way a body moves through it.
 *
 * Everything here is a MULTIPLIER, never an absolute speed, and that is the
 * whole design. `AvatarLocomotionSettings` is undocumented: the SDK exports the
 * component and no page anywhere states what the explorer's own defaults are.
 * Writing "runSpeed: 6" would be guessing at a number that decides how an
 * entire venue feels, and guessing wrong makes people FASTER when the author
 * asked for heavier. A multiplier cannot make that mistake — the runtime reads
 * whatever the explorer published and scales it, so 0.85 is 15% slower than
 * this player's normal on this client, forever, whatever DCL changes next.
 *
 * The second rule is that OFF must be indistinguishable from absent. A scene
 * published before this existed, a scene with the panel untouched, and a client
 * whose explorer never publishes locomotion values all have to move exactly
 * alike. So `enabled` defaults false, every multiplier defaults to 1, and the
 * runtime writes nothing at all until it has read a baseline to scale.
 */

export interface AvatarControlsConfig {
  /** Off means the scene never touches locomotion. The default, and the floor. */
  enabled: boolean;
  /** Walking — the speed people queue, browse and read signs at. */
  walk: number;
  /** The default travel speed in most explorers. */
  jog: number;
  /** Sprint. The one most venues actually want to take away. */
  run: number;
  /** Jump height. Below 1 makes a room feel like it has a ceiling. */
  jump: number;
}

/** Nothing outside this band is a venue's business; it is a body, not a vehicle. */
export const AVATAR_CONTROL_MIN = 0.4;
export const AVATAR_CONTROL_MAX = 1.6;

export function defaultAvatarControls(): AvatarControlsConfig {
  return { enabled: false, walk: 1, jog: 1, run: 1, jump: 1 };
}

function factor(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(AVATAR_CONTROL_MIN, Math.min(AVATAR_CONTROL_MAX, n));
}

export function normalizeAvatarControls(value: unknown): AvatarControlsConfig {
  const base = defaultAvatarControls();
  const raw =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    enabled: raw.enabled === true,
    walk: factor(raw.walk, base.walk),
    jog: factor(raw.jog, base.jog),
    run: factor(raw.run, base.run),
    jump: factor(raw.jump, base.jump),
  };
}

/**
 * Is this configuration worth a single CRDT write?
 *
 * All-ones is a legitimate saved state — somebody dragged four sliders back to
 * the middle — and it means "leave the body alone". Treating it as active would
 * write the explorer's own values back to it for no reason.
 */
export function avatarControlsActive(config: AvatarControlsConfig): boolean {
  return (
    config.enabled &&
    (config.walk !== 1 || config.jog !== 1 || config.run !== 1 || config.jump !== 1)
  );
}

/** One-line summary for the Builder row and the MCP reply. */
export function describeAvatarControls(config: AvatarControlsConfig): string {
  if (!avatarControlsActive(config)) return "Default movement";
  const parts: string[] = [];
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  if (config.walk !== 1) parts.push(`walk ${pct(config.walk)}`);
  if (config.jog !== 1) parts.push(`jog ${pct(config.jog)}`);
  if (config.run !== 1) parts.push(`run ${pct(config.run)}`);
  if (config.jump !== 1) parts.push(`jump ${pct(config.jump)}`);
  return parts.join(" · ");
}
