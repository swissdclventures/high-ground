/**
 * Dance Bug cabinet local metres. The live claw machine and the Builder
 * preview are both built from these numbers, then scaled by CLAW_DEFAULT_SCALE.
 *
 * Local front is −Z (console / glass the guest walks up to). Yaw 0 keeps that
 * facing the south entry.
 */

export const CLAW_BIN = { width: 3.4, depth: 2.4 };

export const CLAW_FRAME = 0.12;
export const CLAW_FLOOR_Y = 0.85;
export const CLAW_GLASS_HEIGHT = 2.3;
export const CLAW_CROWN_HEIGHT = 0.55;
export const CLAW_DECK_DEPTH = 0.4;
export const CLAW_DEFAULT_SCALE = 1.15;

export const CLAW_SHELL = {
  width: CLAW_BIN.width + CLAW_FRAME * 2,
  depth: CLAW_BIN.depth + CLAW_FRAME * 2,
};

export const CLAW_CABINET_HEIGHT = CLAW_FLOOR_Y + CLAW_GLASS_HEIGHT + CLAW_CROWN_HEIGHT;

export const CLAW_FRONT_Z = -CLAW_SHELL.depth / 2;
