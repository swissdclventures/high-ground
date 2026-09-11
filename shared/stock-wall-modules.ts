/**
 * Stock wall modules — curated facade bays shipped with the kit, giving every shell
 * genuine facade variety without user-authored modules. Same WallModule (CustomPiece)
 * grammar; findWallModule falls back to this list, so they render, validate, and
 * export exactly like config modules (a config module with the same id wins).
 *
 * Authored for the standard ~3.55 × 3.05 m bay slot (scale ≈ 1) with parts on y ≥ 0
 * and thickness along Z. Grammar has no X/Z tilts — keep every part axis-aligned.
 * Tint discipline matches the stock piece library: wood texture only in ONE tint.
 *
 * Backing panels and glazing are linked to the BUILDING's materials
 * (`buildingMaterial: "wall" | "glass"`) instead of hard-coded hexes, so modules
 * follow the Look controls and never read as alien black slabs in a night world;
 * only accents (stone, wood, metal, glow) carry their own tint.
 */

import type { CustomPiecePart } from "./custom-pieces";
import type { WallModule } from "./wall-modules";

const WOOD = "#8a6a4a";
const WOOD_DARK = "#5f4632";
const METAL_DARK = "#3a3f46";
const BRASS = "#b08d57";
const STONE = "#9a958c";
const PANEL_DARK = "#2a2d33";
const GLASS_TINT = "#7d97a8";
const GLOW_WARM = "#ffd9a0";
const GLOW_COOL = "#7fd4ff";

const box = (
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: string,
  extra: Partial<CustomPiecePart> = {}
): CustomPiecePart => ({ shape: "box", w, h, d, x, y, z, color, ...extra });

// Slot reference: 3.55 wide × 3.05 tall. Author to 3.5 × 3.0.
const W = 3.5;
const H = 3.0;

export const STOCK_WALL_MODULES: WallModule[] = [
  {
    id: "wallmod_stock_arched_window",
    name: "Arched Window Bay",
    parts: [
      // Solid stone surround with an open arch and glass set behind it.
      box(W, H, 0.14, 0, H / 2, 0, STONE),
      box(2.0, 1.6, 0.2, 0, 1.0, 0, GLASS_TINT, { buildingMaterial: "glass" }),
      { shape: "arch", w: 2.2, h: 1.0, d: 0.24, x: 0, y: 2.6, z: 0, color: STONE, sides: 6 },
      box(2.4, 0.12, 0.3, 0, 0.14, 0.05, STONE),
    ],
  },
  {
    id: "wallmod_stock_shopfront",
    name: "Shopfront Bay",
    parts: [
      box(W, 0.6, 0.14, 0, 0.3, 0, WOOD_DARK),
      box(W - 0.3, 1.9, 0.06, 0, 1.55, 0, GLASS_TINT, { buildingMaterial: "glass" }),
      box(0.1, 1.9, 0.12, 0, 1.55, 0, WOOD_DARK),
      box(W, 0.5, 0.18, 0, 2.75, 0, WOOD, { surface: "wood" }),
      box(W - 0.4, 0.16, 0.06, 0, 2.75, 0.08, BRASS, { emissive: GLOW_WARM }),
    ],
  },
  {
    id: "wallmod_stock_industrial",
    name: "Industrial Sash Bay",
    parts: [
      box(W, 3.0, 0.05, 0, 1.5, -0.04, GLASS_TINT, { buildingMaterial: "glass" }),
      box(W, 0.14, 0.12, 0, 0.07, 0, METAL_DARK, { finish: "metal" }),
      box(W, 0.14, 0.12, 0, 2.93, 0, METAL_DARK, { finish: "metal" }),
      box(0.14, 3.0, 0.12, -(W / 2) + 0.07, 1.5, 0, METAL_DARK, { finish: "metal" }),
      box(0.14, 3.0, 0.12, W / 2 - 0.07, 1.5, 0, METAL_DARK, { finish: "metal" }),
      box(0.08, 3.0, 0.1, -0.85, 1.5, 0, METAL_DARK, { finish: "metal" }),
      box(0.08, 3.0, 0.1, 0, 1.5, 0, METAL_DARK, { finish: "metal" }),
      box(0.08, 3.0, 0.1, 0.85, 1.5, 0, METAL_DARK, { finish: "metal" }),
      box(W, 0.08, 0.1, 0, 1.0, 0, METAL_DARK, { finish: "metal" }),
      box(W, 0.08, 0.1, 0, 2.0, 0, METAL_DARK, { finish: "metal" }),
    ],
  },
  {
    id: "wallmod_stock_deco_panel",
    name: "Deco Relief Panel",
    parts: [
      box(W, H, 0.12, 0, H / 2, 0, PANEL_DARK, { buildingMaterial: "wall" }),
      box(0.22, 2.5, 0.08, -1.2, 1.35, 0.08, STONE),
      box(0.22, 2.7, 0.08, -0.6, 1.45, 0.08, STONE),
      box(0.22, 2.9, 0.08, 0, 1.55, 0.08, STONE),
      box(0.22, 2.7, 0.08, 0.6, 1.45, 0.08, STONE),
      box(0.22, 2.5, 0.08, 1.2, 1.35, 0.08, STONE),
      box(W, 0.18, 0.1, 0, 0.2, 0.06, BRASS, { finish: "metal" }),
      box(W, 0.12, 0.1, 0, 2.94, 0.06, BRASS, { finish: "metal" }),
    ],
  },
  {
    id: "wallmod_stock_neon_band",
    name: "Neon Band Panel",
    parts: [
      box(W, H, 0.12, 0, H / 2, 0, PANEL_DARK, { buildingMaterial: "wall" }),
      box(W - 0.4, 0.14, 0.06, 0, 2.1, 0.08, GLOW_COOL, { emissive: GLOW_COOL, finish: "glass" }),
      box(0.14, 1.2, 0.06, -1.4, 1.0, 0.08, GLOW_COOL, { emissive: GLOW_COOL, finish: "glass" }),
      box(0.14, 1.2, 0.06, 1.4, 1.0, 0.08, GLOW_COOL, { emissive: GLOW_COOL, finish: "glass" }),
    ],
  },
  {
    id: "wallmod_stock_timber_screen",
    name: "Timber Screen Bay",
    parts: [
      box(W, 0.16, 0.16, 0, 0.08, 0, WOOD_DARK),
      box(W, 0.16, 0.16, 0, 2.92, 0, WOOD_DARK),
      box(0.14, 3.0, 0.14, -1.5, 1.5, 0, WOOD, { surface: "wood" }),
      box(0.14, 3.0, 0.14, -0.9, 1.5, 0, WOOD, { surface: "wood" }),
      box(0.14, 3.0, 0.14, -0.3, 1.5, 0, WOOD, { surface: "wood" }),
      box(0.14, 3.0, 0.14, 0.3, 1.5, 0, WOOD, { surface: "wood" }),
      box(0.14, 3.0, 0.14, 0.9, 1.5, 0, WOOD, { surface: "wood" }),
      box(0.14, 3.0, 0.14, 1.5, 1.5, 0, WOOD, { surface: "wood" }),
    ],
  },
  {
    id: "wallmod_stock_stage_backdrop",
    name: "Stage Backdrop Panel",
    parts: [
      box(W, H, 0.14, 0, H / 2, 0, PANEL_DARK, { buildingMaterial: "wall" }),
      box(W - 0.3, 0.08, 0.06, 0, 2.8, 0.08, GLOW_WARM, { emissive: GLOW_WARM }),
      box(0.08, 2.4, 0.06, -(W / 2) + 0.25, 1.5, 0.08, GLOW_WARM, { emissive: GLOW_WARM }),
      box(0.08, 2.4, 0.06, W / 2 - 0.25, 1.5, 0.08, GLOW_WARM, { emissive: GLOW_WARM }),
    ],
  },
];

export function findStockWallModule(id: string): WallModule | undefined {
  return STOCK_WALL_MODULES.find((m) => m.id === id);
}
