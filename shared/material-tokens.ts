/**
 * Material token registry — semantic tokens decouple meaning from preset colors.
 * Spec: rules/scene-spec-and-patches.md
 */

export type MaterialToken =
  | "frame_black"
  | "glass_dark"
  | "concrete_light"
  | "concrete_dark"
  | "floor_light"
  | "collider_debug"
  | "transparent_debug"
  | "safety_rail_black";

export const ALL_MATERIAL_TOKENS: MaterialToken[] = [
  "frame_black",
  "glass_dark",
  "concrete_light",
  "concrete_dark",
  "floor_light",
  "collider_debug",
  "transparent_debug",
  "safety_rail_black",
];

/** Map token → Three.js preset material name. */
export const MATERIAL_TOKEN_PRESETS: Record<MaterialToken, string> = {
  frame_black: "metal_dark",
  glass_dark: "glass_main",
  concrete_light: "concrete_main",
  concrete_dark: "concrete_main",
  floor_light: "concrete_main",
  collider_debug: "collider_debug",
  transparent_debug: "collider_debug",
  safety_rail_black: "metal_dark",
};

export const DEFAULT_MATERIAL_TOKEN_BY_TYPE: Record<string, MaterialToken> = {
  guardrail: "frame_black",
  opening_guardrail: "frame_black",
  railing: "frame_black",
  mullion: "frame_black",
  window: "frame_black",
  door: "frame_black",
  glass_panel: "glass_dark",
  facade_zone: "glass_dark",
  floor_slab: "concrete_light",
  roof_slab: "concrete_light",
  platform: "concrete_light",
  column: "concrete_light",
  column_grid: "concrete_light",
  ramp_run: "concrete_light",
  l_ramp: "concrete_light",
  landing: "concrete_light",
  elevator_platform: "concrete_light",
  text_sign: "frame_black",
  collider_group: "collider_debug",
};

export function defaultTokenForType(type: string): MaterialToken {
  return DEFAULT_MATERIAL_TOKEN_BY_TYPE[type] ?? "concrete_light";
}

export function isKnownMaterialToken(token: string): token is MaterialToken {
  return ALL_MATERIAL_TOKENS.includes(token as MaterialToken);
}

export function defaultMaterialTokenColors(): Record<MaterialToken, string> {
  const out = {} as Record<MaterialToken, string>;
  for (const t of ALL_MATERIAL_TOKENS) {
    out[t] = MATERIAL_TOKEN_PRESETS[t];
  }
  return out;
}
