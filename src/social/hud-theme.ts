/**
 * In-world HUD design tokens — ONE source of truth.
 *
 * Foundation: Dance Bug smart wearable (`DCL Dance Smart Wearable/wearable/src/ui.tsx`),
 * ported as Dance Studio, then locked here so every panel shares the same gaps,
 * type, chrome, and layers. Change a number here → it changes everywhere that
 * imports these tokens / `hud-kit.tsx`.
 *
 * Canon: `rules/hud-ui-theme.md`
 */
import { Color4 } from '@dcl/sdk/math'

// ---------------------------------------------------------------------------
// Layers (opacity is the contract)
// ---------------------------------------------------------------------------

/** Outer window shell. Dense enough that nametags do not dominate. */
export const HUD_PANEL = Color4.create(0.14, 0.055, 0.27, 0.9)

/**
 * Alternate shell for a surface that must not tint the world purple — the vending
 * booth sits inside an already-magenta room, and the purple shell there read as fog.
 * Background COLOUR and ALPHA are the only tokens a surface may swap; type, chrome,
 * sizes and gaps stay fixed.
 */
export const HUD_PANEL_INK = Color4.create(0.016, 0.012, 0.035, 0.95)

/** Nested scroll / list well. */
export const HUD_LISTBG = Color4.create(0, 0, 0, 0.78)

/** Primary tap row (Buy / Sell / listing cards). Always fully opaque. */
export const HUD_ACTION = Color4.create(0.086, 0.04, 0.18, 1)

/** Chip / icon / close fill. Always fully opaque. */
export const HUD_PILL = Color4.create(0.086, 0.04, 0.18, 1)

/** Disabled control fill. */
export const HUD_DISABLED = Color4.create(1, 1, 1, 0.06)

export const HUD_MAGENTA = Color4.fromHexString('#D63A93FF')
export const HUD_ORANGE = Color4.fromHexString('#EF9320FF')
export const HUD_PURPLE = Color4.fromHexString('#7A3FD0FF')
export const HUD_SUB = Color4.fromHexString('#D6C8F5FF')
export const HUD_PINK = Color4.fromHexString('#FF7AB0FF')
export const HUD_OK = Color4.fromHexString('#7ED97AFF')
export const HUD_ERR = Color4.fromHexString('#FF6B6BFF')
export const HUD_WARN = Color4.fromHexString('#FFD699FF')
export const HUD_WHITE = Color4.White()
export const HUD_BLACK = Color4.Black()

/** Panel title ink — always white (Dance Studio "DANCE STUDIO"). Never pink. */
export const HUD_TITLE = HUD_WHITE

export const HUD_ACCENT = {
  magenta: HUD_MAGENTA,
  orange: HUD_ORANGE,
  purple: HUD_PURPLE
} as const
export type HudAccent = keyof typeof HUD_ACCENT

// ---------------------------------------------------------------------------
// Spacing (px) — Dance Bug panel padding 16, chrome gap 8, section gap 10
// ---------------------------------------------------------------------------

export const HUD_SPACE = {
  /** Inner padding of every panel shell. */
  panel: 16,
  /** Gap between header and body. */
  headerGap: 10,
  /** Gap between stacked action rows. */
  stack: 10,
  /** Gap between chrome buttons in the header. */
  chromeGap: 8,
  /** Tight chip / sort control gap. */
  chip: 6,
  /** List-well inner padding (extra right for SDK7 scrollbar wheel). */
  listPad: { top: 6, right: 16, bottom: 6, left: 6 },
  /** Action-row inner padding. */
  actionPad: 10,
  /** Listing-row horizontal padding. */
  rowPad: 12
} as const

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export const HUD_TYPE = {
  title: 18,
  action: 16,
  body: 13,
  meta: 12,
  chrome: 16,
  chip: 11,
  tiny: 9
} as const

export const HUD_ALIGN = {
  title: 'middle-left' as const,
  button: 'middle-center' as const,
  meta: 'middle-center' as const
}

// ---------------------------------------------------------------------------
// Sizes (px) — Dance Bug header 32, chrome ~32×28, transport 44
// ---------------------------------------------------------------------------

export const HUD_SIZE = {
  headerH: 32,
  chromeW: 32,
  chromeH: 28,
  iconBtnW: 26,
  iconBtnH: 24,
  pillW: 88,
  pillH: 40,
  actionH: 72,
  listRowH: 56,
  transportH: 44,
  chipH: 20,
  bagW: 420,
  bagH: 480,
  /** Single-product booth: one big item render over one buy row. */
  vendW: 460,
  vendH: 512,
  /** The item render itself — square, because a catalyst thumbnail is square. */
  vendHeroImg: 296,
  /**
   * ★THE World-utility panel width. Dance Studio set it; every other utility
   * surface (Host, Dance Admin, …) now measures from the SAME number.
   *
   * Width is a constant, height is not: a panel may be as tall as its content
   * needs and scroll past `utilMaxH`, but two panels of this class must never be
   * two different widths — that is what made the HUD read as several unrelated
   * tools instead of one system.
   */
  utilW: 452,
  /** Tallest a utility panel grows before its body scrolls. */
  utilMaxH: 748,
  studioW: 452,
  studioH: 748
} as const

/** @deprecated use HUD_SIZE.chromeW — kept so existing imports keep compiling. */
export const HUD_CHROME_W = HUD_SIZE.chromeW
/** @deprecated use HUD_SIZE.chromeH */
export const HUD_CHROME_H = HUD_SIZE.chromeH
/** @deprecated use HUD_TYPE.chrome */
export const HUD_CHROME_FONT = HUD_TYPE.chrome

// ---------------------------------------------------------------------------
// Corners
// ---------------------------------------------------------------------------

const ROUNDED = { src: 'images/rounded.png' }
const SLICE = { top: 0.06, bottom: 0.06, left: 0.06, right: 0.06 }

export function hudRoundedBg(color: Color4) {
  return {
    texture: ROUNDED,
    textureMode: 'nine-slices' as const,
    textureSlices: SLICE,
    color
  }
}
