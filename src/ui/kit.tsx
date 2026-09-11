/**
 * The shared UI kit: one place that decides how every scene menu looks, how it
 * scales on a phone, and where it is allowed to sit on screen.
 *
 * Three problems this solves, all of which we hit the hard way:
 *
 * SCALE — a HUD authored in raw pixels is fine on a monitor and unusable on a
 * handset. Everything here is expressed in design pixels against a 1280-wide
 * reference and multiplied through `px()`, so one layout serves both.
 *
 * SAFE AREA — phones eat the edges of the screen with notches, status bars and
 * home indicators, and the explorer eats more with its own chat and minimap.
 * The renderer reports both (`screenInsetArea` and `interactableArea`), and
 * `SafeScreen` is the container that respects them. Nothing else here did.
 *
 * SKIN — buttons and panels take a `Skin`, which is either flat colour with a
 * border radius (works today, no art needed) or a nine-sliced PNG (one image
 * stretched to any size with its corners intact). Reskinning the whole game
 * from code-drawn to authored art is then a change of constants, not a rewrite
 * of every screen.
 */
import ReactEcs, { Label, ScreenInsetArea, UiEntity } from '@dcl/sdk/react-ecs'
import type { EntityPropTypes, PositionUnit, UiBackgroundProps } from '@dcl/sdk/react-ecs'
import { UiCanvasInformation, engine } from '@dcl/sdk/ecs'
import { isMobile } from '@dcl/sdk/platform'
import { Color4 } from '@dcl/sdk/math'

/** Design tokens. Change a value here and the whole game follows. */
export const UI = {
  ink: Color4.fromHexString('#090B10EE'),
  inkSolid: Color4.fromHexString('#0B0F16FF'),
  track: Color4.fromHexString('#0A0E14CC'),
  white: Color4.fromHexString('#F6F1E5FF'),
  muted: Color4.fromHexString('#AEB9C7FF'),
  gold: Color4.fromHexString('#FFD15AFF'),
  goldHot: Color4.fromHexString('#FFF6D6FF'),
  cyan: Color4.fromHexString('#32E9F2FF'),
  green: Color4.fromHexString('#3BE07AFF'),
  red: Color4.fromHexString('#FF4D3DFF'),
  clear: Color4.create(0, 0, 0, 0),
  // `pill` is a sentinel, not a measurement: it becomes a 50% corner, which is
  // how the renderer is asked for a capsule or a circle. Feeding it through the
  // pixel scale instead produced radii many times the size of the control.
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  space: { xs: 4, sm: 8, md: 14, lg: 22, xl: 34 }
} as const

/** The canvas every fixed dimension in this codebase is authored against. */
const REFERENCE_W = 1280
const REFERENCE_H = 720

/**
 * SDK 7.27's own virtual-screen defaults, mirrored — NOT re-invented.
 *
 * The renderer scales every raw pixel and font size by a contain fit against
 * these, and it picks between them with the same `isMobile()` we read here. We
 * need the number for one job only: the canvas size and the two inset areas come
 * back in REAL pixels and get used next to design-space numbers, so they have to
 * be converted. Deriving it from the same two inputs is what keeps ours and the
 * renderer's from drifting apart.
 */
const VIRTUAL_MOBILE = { width: 1600, height: 720 }
const VIRTUAL_DESKTOP = { width: 1920, height: 1080 }

function designScale(): number {
  const info = UiCanvasInformation.getOrNull(engine.RootEntity)
  if (!info || info.width <= 0 || info.height <= 0) return 1
  const virtual = isMobile() ? VIRTUAL_MOBILE : VIRTUAL_DESKTOP
  const scale = Math.min(info.width / virtual.width, info.height / virtual.height)
  return scale > 0 ? scale : 1
}

/** Real renderer pixels to the design pixels every layout number here is in. */
export function toDesign(realPx: number): number {
  return Math.round(realPx / designScale())
}

/** Canvas size in DESIGN pixels, with the reference as the pre-boot fallback. */
export function canvasSize(): { width: number; height: number } {
  const info = UiCanvasInformation.getOrNull(engine.RootEntity)
  if (!info) return { width: REFERENCE_W, height: REFERENCE_H }
  return { width: toDesign(info.width), height: toDesign(info.height) }
}

/**
 * THE SCENE NO LONGER SCALES ITS OWN UI, AND THIS RETURNING 1 IS THE WHOLE FIX.
 *
 * Every layout number in this codebase — raw literals and `px()` calls alike —
 * is a DESIGN pixel now, and the renderer's virtual screen is the one thing that
 * turns those into device pixels. Kept as a function returning 1 rather than
 * deleted, because roughly a hundred call sites read `const k = uiScale()` and
 * multiply by it; they are all correct, and all no-ops.
 *
 * What it USED to do was multiply by canvas-width/1280 — on top of the
 * renderer's own multiplication. A phone therefore drew `px()` layouts at about
 * 0.35 while the raw-authored ones next to them sat at 0.53, so anything
 * measured against something in the other family missed it: the sound mixer
 * landed on the fall chip it was placed under, the "100%" landed on the loading
 * bar, and every `Math.max(realPxFloor, px(design))` floor was shrunk along with
 * the control it was there to protect.
 */
export function uiScale(): number {
  return 1
}

/** Design pixels. The renderer applies the scale; this only rounds. */
export function px(value: number): number {
  return Math.round(value)
}

/**
 * A design-space font size.
 *
 * The `minPx` floor is kept in the signature and ignored: it existed to stop a
 * caption disappearing when the scene shrank text on its own, and a floor in
 * design pixels protects nothing — worse, a floored font inside an unfloored box
 * is precisely how a caption grew out of its row and printed on the bar below.
 * Type and boxes scale together now, so the ratio the layout was drawn at holds
 * at every canvas size.
 */
export function textPx(design: number, _minPx = 15): number {
  return Math.round(design)
}

/**
 * The widest canvas still treated as a phone.
 *
 * 768 was too tight. A phone held sideways — which is the only way Decentraland
 * Mobile runs, portrait is unsupported — reports its LONG edge here: 844 on an
 * iPhone 14, 926 on a Plus. At a 768 cut-off every one of those devices took the
 * desktop branch, which is exactly the audience this scene is being judged on.
 */
const COMPACT_W = 940

/**
 * The tallest canvas still treated as a phone. A landscape handset is SHORT
 * before it is narrow — 390 px on an iPhone 14, 428 on a Plus — and a tablet or
 * a small desktop window that reports 560 px of height wants the thumb layout
 * for the same reason: there is no room for a desktop stack.
 */
const COMPACT_H = 560

/**
 * True when the canvas should be laid out for a thumb, not a cursor.
 *
 * Width alone is a guess, so the device's own answer wins where it exists: a
 * screen that reserves any edge for a notch, status bar or home indicator is a
 * phone at any width. Width is the fallback for a phone without insets, and it
 * doubles as the right call for a small desktop window.
 */
export function isCompact(): boolean {
  // ‼️THE DEVICE'S OWN ANSWER, FIRST — AND THE REASON THE PHONE LAYOUT NEVER RAN.
  //
  // Every check below this line is a guess about pixels, and on Decentraland
  // Mobile all of them said "desktop". The renderer contain-fits the scene to a
  // VIRTUAL 1600x720 on a phone and 1920x1080 on a monitor (see `designScale`),
  // so `canvasSize()` on a handset comes back around 1600 x 730 DESIGN pixels:
  // wider than `COMPACT_W`, taller than `COMPACT_H`, and compact only if the
  // device happened to report a notch. A phone with no reported insets — most
  // Android handsets — therefore took the DESKTOP branch of every layout in the
  // game, while having 720 design pixels of height to draw a 1080 px HUD in.
  //
  // That one wrong boolean is what the owner saw as "on mobile the majority of
  // the communication between the game and the user is not working": the
  // compact result card, the compact rail and the thumb row all existed, and
  // none of them ran. `isMobile()` is the renderer telling us which virtual
  // screen it picked, which is exactly the question this function is asking.
  if (isMobile()) return true
  const info = UiCanvasInformation.getOrNull(engine.RootEntity)
  if (!info) return false
  const inset = info.screenInsetArea
  if (inset && (inset.top > 0 || inset.bottom > 0 || inset.left > 0 || inset.right > 0)) return true
  return info.width < COMPACT_W || info.height < COMPACT_H
}

const NO_INSET = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * Device safe margins: notch, status bar, home indicator, rounded corners.
 * Zero on desktop. Critical UI must never sit inside these.
 */
export function safeInsets(): { top: number; right: number; bottom: number; left: number } {
  const area = UiCanvasInformation.getOrNull(engine.RootEntity)?.screenInsetArea
  if (!area) return NO_INSET
  // Reported in real pixels; everything that reads them is in design pixels.
  return {
    top: toDesign(area.top),
    right: toDesign(area.right),
    bottom: toDesign(area.bottom),
    left: toDesign(area.left)
  }
}

/**
 * Where the EXPLORER own chrome is not: its chat, minimap and mobile controls.
 * The renderer moves this at runtime (hiding chat grows it), so read it every
 * frame rather than caching. We cannot replace the client UI, but we can
 * refuse to hide behind it.
 */
export function chromeInsets(): { top: number; right: number; bottom: number; left: number } {
  const area = UiCanvasInformation.getOrNull(engine.RootEntity)?.interactableArea
  if (!area) return NO_INSET
  return {
    top: toDesign(area.top),
    right: toDesign(area.right),
    bottom: toDesign(area.bottom),
    left: toDesign(area.left)
  }
}

/**
 * Root container for any full-screen HUD. Children are constrained to the
 * device safe area; pass `avoidChrome` to additionally keep clear of the
 * explorer chat and minimap.
 */
export function SafeScreen(props: { children?: ReactEcs.JSX.ReactNode; avoidChrome?: boolean }) {
  const chrome = props.avoidChrome === true ? chromeInsets() : NO_INSET
  return (
    <ScreenInsetArea uiTransform={{ pointerFilter: 'none' }}>
      <UiEntity
        uiTransform={{
          width: '100%',
          height: '100%',
          padding: {
            top: chrome.top,
            right: chrome.right,
            bottom: chrome.bottom,
            left: chrome.left
          },
          pointerFilter: 'none'
        }}
      >
        {props.children}
      </UiEntity>
    </ScreenInsetArea>
  )
}

/**
 * A surface look. Give it a `color` (plus optional `radius`) and the renderer
 * draws it with no art at all; give it a `texture` with `slices` and it becomes
 * a nine-sliced PNG that keeps its corners crisp at any size. Slice values are
 * FRACTIONS of the image (0..1), not pixels.
 */
export interface Skin {
  color?: Color4
  radius?: number
  texture?: string
  /** Nine-slice borders as fractions of the texture. Omit for a plain stretch. */
  slices?: { top: number; right: number; bottom: number; left: number }
  /** Optional swap shown while the control is held. */
  pressedTexture?: string
  pressedColor?: Color4
}

/**
 * Corner radius for a control of this size. A `pill` radius becomes a true
 * capsule (half the short side); everything else scales like any other pixel.
 */
export function cornerRadius(radius: number | undefined, shortSidePx?: number): number | undefined {
  if (radius === undefined) return undefined
  if (radius >= UI.radius.pill) {
    return shortSidePx !== undefined ? Math.round(shortSidePx / 2) : undefined
  }
  return px(radius)
}

function skinBackground(skin: Skin, isHeld: boolean): UiBackgroundProps {
  const texture = isHeld && skin.pressedTexture ? skin.pressedTexture : skin.texture
  if (texture) {
    return skin.slices
      ? { texture: { src: texture }, textureMode: 'nine-slices', textureSlices: skin.slices }
      : { texture: { src: texture }, textureMode: 'stretch' }
  }
  const color = isHeld && skin.pressedColor ? skin.pressedColor : skin.color
  return { color: color ?? UI.ink }
}

/**
 * Press bookkeeping. DCL gives us down and up events but no "is this held"
 * state, and the UI tree is re-evaluated every frame, so a module-level
 * registry is both the simplest and the idiomatic answer here.
 */
const heldControls = new Map<string, number>()

/** Is this control currently held? */
export function uiPressed(id: string): boolean {
  return heldControls.has(id)
}

/** Force a control to let go — use when game state ends an interaction. */
export function releaseUiPress(id: string): void {
  heldControls.delete(id)
}

/**
 * Safety net for touch: if a finger slides off a button before lifting, the up
 * event can never arrive and the control would stay held forever. Call this
 * from a system tick; anything held longer than `maxHoldMs` is let go, and its
 * id is returned so the caller can finish whatever the press started.
 */
export function sweepUiPresses(now: number, maxHoldMs = 15_000): string[] {
  const released: string[] = []
  for (const [id, since] of heldControls) {
    if (now - since >= maxHoldMs) {
      heldControls.delete(id)
      released.push(id)
    }
  }
  return released
}

export interface SvButtonProps {
  /** Stable id — press state is tracked against it. */
  id: string
  label?: string
  /** Design-pixel size; defaults clear a comfortable touch target. */
  width?: number
  height?: number
  /**
   * Real-pixel floor. A control the player must hit under pressure should stop
   * shrinking at some point, however small the canvas gets.
   */
  minPx?: number
  fontSize?: number
  /** Real-pixel font size, overriding `fontSize`. Use to keep a label in
   *  proportion to a control that has its own size floor. */
  fontPx?: number
  color?: Color4
  skin?: Skin
  disabled?: boolean
  /** Fired on press. For hold-to-charge controls, start the charge here. */
  onDown?: () => void
  /** Fired on release, and on the pointer leaving the control. */
  onUp?: () => void
  /**
   * Leave-to-release. Default on, because a tap that slides off would otherwise
   * stick. The punch glove turns this off: a thumb that jiggles one pixel must
   * not throw the punch.
   */
  releaseOnLeave?: boolean
  position?: EntityPropTypes['uiTransform']
  children?: ReactEcs.JSX.ReactNode
}

/**
 * The one button. Press and release are separate callbacks on purpose: a
 * hold-to-charge control needs both, and a plain tap simply ignores `onDown`.
 * The default size clears the smallest comfortable touch target on a phone.
 */
export function SvButton(props: SvButtonProps) {
  const skin = props.skin ?? DEFAULT_BUTTON_SKIN
  const isHeld = uiPressed(props.id)
  const disabled = props.disabled === true
  const floor = props.minPx ?? 0
  const w = Math.max(floor, px(props.width ?? 220))
  const h = Math.max(floor, px(props.height ?? 76))
  const release = () => {
    if (!heldControls.has(props.id)) return
    heldControls.delete(props.id)
    props.onUp?.()
  }
  return (
    <UiEntity
      uiTransform={{
        width: w,
        height: h,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: skin.texture ? undefined : cornerRadius(skin.radius ?? UI.radius.md, Math.min(w, h)),
        opacity: disabled ? 0.4 : 1,
        pointerFilter: disabled ? 'none' : 'block',
        ...(props.position ?? {})
      }}
      uiBackground={skinBackground(skin, isHeld)}
      onMouseDown={
        disabled
          ? undefined
          : () => {
              heldControls.set(props.id, Date.now())
              props.onDown?.()
            }
      }
      onMouseUp={disabled ? undefined : release}
      onMouseLeave={disabled || props.releaseOnLeave === false ? undefined : release}
    >
      {props.label !== undefined ? (
        <Label
          value={props.label}
          fontSize={props.fontPx ?? px(props.fontSize ?? 28)}
          color={props.color ?? UI.white}
          textAlign="middle-center"
          uiTransform={{ width: '100%', height: '100%' }}
        />
      ) : null}
      {props.children}
    </UiEntity>
  )
}

/** A framed surface for menus and dialogs. */
export function SvPanel(props: {
  /** A number is design pixels and gets scaled; a unit string passes through. */
  width?: number | PositionUnit | 'auto'
  height?: number | PositionUnit | 'auto'
  skin?: Skin
  padding?: number
  position?: EntityPropTypes['uiTransform']
  children?: ReactEcs.JSX.ReactNode
}) {
  const skin = props.skin ?? DEFAULT_PANEL_SKIN
  const pad = px(props.padding ?? UI.space.lg)
  return (
    <UiEntity
      uiTransform={{
        width: typeof props.width === 'number' ? px(props.width) : (props.width ?? 'auto'),
        height: typeof props.height === 'number' ? px(props.height) : (props.height ?? 'auto'),
        flexDirection: 'column',
        padding: { top: pad, right: pad, bottom: pad, left: pad },
        borderRadius: skin.texture ? undefined : cornerRadius(skin.radius ?? UI.radius.lg),
        ...(props.position ?? {})
      }}
      uiBackground={skinBackground(skin, false)}
    >
      {props.children}
    </UiEntity>
  )
}

/** A small status pill — attempt counters, queue position, labels. */
export function SvChip(props: {
  label: string
  color?: Color4
  skin?: Skin
  fontSize?: number
  position?: EntityPropTypes['uiTransform']
}) {
  const skin = props.skin ?? DEFAULT_CHIP_SKIN
  /**
   * ‼️THE PLATE IS SIZED BY ITS TYPE, NOT PINNED AT 38.
   *
   * A fixed 38 px capsule is right for the 22 px default and wrong for every
   * other call: a 15 px caption got a plate 2.5x its own height, and a stack of
   * those on a phone — 720 design pixels of canvas, not 1080 — ran the top rail
   * off the bottom of the screen and took the achievements with it. The ratio
   * below reproduces 38 exactly at fontSize 22, so nothing already tuned moves.
   */
  const font = px(props.fontSize ?? 22)
  const height = Math.max(px(24), Math.round(font * 1.73))
  return (
    <UiEntity
      uiTransform={{
        height,
        padding: { top: 0, bottom: 0, left: px(UI.space.md), right: px(UI.space.md) },
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: cornerRadius(skin.radius ?? UI.radius.pill, height),
        ...(props.position ?? {})
      }}
      uiBackground={skinBackground(skin, false)}
    >
      <Label
        value={props.label}
        fontSize={font}
        color={props.color ?? UI.white}
        textAlign="middle-center"
      />
    </UiEntity>
  )
}

/**
 * Default skins — flat, code-drawn, no art required, so the kit works the
 * moment it is imported. Point these at PNGs (with `slices`) to reskin the
 * entire game at once.
 */
export const DEFAULT_BUTTON_SKIN: Skin = {
  color: UI.gold,
  pressedColor: UI.goldHot,
  radius: UI.radius.md
}
export const DEFAULT_PANEL_SKIN: Skin = { color: UI.ink, radius: UI.radius.lg }
export const DEFAULT_CHIP_SKIN: Skin = { color: UI.track, radius: UI.radius.pill }
