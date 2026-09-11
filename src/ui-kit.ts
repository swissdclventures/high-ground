/**
 * THE HUD LOOK — one vocabulary so every surface reads as part of Decentraland.
 *
 * Decentraland's own chrome is a soft-cornered, mostly-black, slightly translucent panel.
 * Anything we draw with square corners and a flat saturated fill (the old flight banner
 * was solid teal) reads as a foreign object pasted over the world. The fix is not per
 * component taste — it is one shared set of tokens, here.
 *
 * The 9-slice trick is what gives real rounded corners: `images/rounded-panel.png` is a
 * white rounded rectangle stretched by its middle slices, and `color` TINTS it. So
 * `panelBg()` is a rounded panel of any colour and alpha. This pattern already existed in
 * three private copies (social/host-ui, exchange/ui, dance-studio/ui); new surfaces must
 * use this module instead of adding a fourth.
 *
 * Docking rules live in social/hud-layout.ts — this file is only about how a surface
 * LOOKS. `screenLayer()` is here because getting the anchoring wrong is what put the
 * toolbar and the minimap in the middle of the screen (see its own doc block).
 */
import { Color4 } from '@dcl/sdk/math'

const ROUNDED_TEX = 'images/rounded-panel.png'
const ROUNDED_SLICES = { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 }

/** A rounded, tinted panel background. Alpha < 1 keeps the world readable behind it. */
export function panelBg(color: Color4) {
  return {
    texture: { src: ROUNDED_TEX },
    textureMode: 'nine-slices' as const,
    textureSlices: ROUNDED_SLICES,
    color,
  }
}

/** The tokens. Near-black, cool, translucent — Decentraland's own register. */
export const UI = {
  /** Standard surface: menus, cards, the minimap. */
  panel: Color4.create(0.04, 0.05, 0.07, 0.86),
  /** A raised element on top of a panel (a chip, a tile). */
  raised: Color4.create(1, 1, 1, 0.07),
  /** The same, hovered/active. */
  raisedStrong: Color4.create(1, 1, 1, 0.13),
  /** An engaged control — restrained, never a saturated block of colour. */
  active: Color4.create(0.3, 0.62, 0.95, 0.22),
  /** Hairline separator. */
  hairline: Color4.create(1, 1, 1, 0.1),

  text: Color4.create(0.95, 0.97, 1, 1),
  textDim: Color4.create(0.68, 0.74, 0.82, 1),
  accent: Color4.create(0.45, 0.78, 1, 1),
  warn: Color4.create(1, 0.78, 0.35, 1),
}

export type ScreenCorner = 'top-right' | 'bottom-right' | 'top-centre' | 'bottom-centre'

/**
 * THE ANCHOR THAT ACTUALLY WORKS — use this for every persistent surface.
 *
 * `hud-root.tsx` mounts every surface as a sibling inside one container whose
 * flexDirection defaults to ROW. A surface whose own wrapper is RELATIVE therefore
 * becomes a flex item competing for that row: it gets a slice of the width, and its
 * "right-docked" child anchors to the right edge of that SLICE — which is somewhere in
 * the middle of the screen. That is why the launcher chips and the minimap drifted to
 * the centre-left even though both read their inset from HUD.right.
 *
 * A full-screen ABSOLUTE wrapper is outside that row entirely, so its alignment is
 * measured against the screen. Give the docked child an explicit width and it lands
 * exactly where hud-layout says.
 */
export function screenLayer(corner: ScreenCorner) {
  const vertical = corner.startsWith('top') ? 'flex-start' : 'flex-end'
  const horizontal = corner.endsWith('right') ? 'flex-end' : 'center'
  return {
    positionType: 'absolute' as const,
    position: { top: 0, right: 0, bottom: 0, left: 0 },
    width: '100%' as const,
    height: '100%' as const,
    flexDirection: 'column' as const,
    justifyContent: vertical as 'flex-start' | 'flex-end',
    alignItems: horizontal as 'flex-end' | 'center',
    // Full-screen docks must not steal hover. F/E only reach the scene while the
    // pointer is over a 3D entity; a blocking overlay made "F to fly" dead in
    // every MCP-published scene (owner, 2026-08-13).
    pointerFilter: 'none' as const,
  }
}
