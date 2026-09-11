/**
 * Reusable DCL HUD pieces. Import these instead of drawing a new panel from scratch.
 * Tokens live in `hud-theme.ts` — change sizes/colors there, not in callers.
 */
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import {
  HUD_ACCENT,
  HUD_ACTION,
  HUD_ALIGN,
  HUD_BLACK,
  HUD_DISABLED,
  HUD_PANEL,
  HUD_PILL,
  HUD_PINK,
  HUD_SIZE,
  HUD_SPACE,
  HUD_SUB,
  HUD_TITLE,
  HUD_TYPE,
  HUD_WHITE,
  hudRoundedBg,
  type HudAccent
} from './hud-theme'

export function HudPanel(props: {
  width?: number
  height?: number
  place?: 'center' | 'dock-right'
  right?: number
  bottom?: number
  /** Shell colour + alpha — the ONE token a surface is allowed to swap (see hud-theme). */
  background?: Color4
  children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | null
}) {
  const w = props.width ?? HUD_SIZE.bagW
  const h = props.height ?? HUD_SIZE.bagH
  const shellBg = hudRoundedBg(props.background ?? HUD_PANEL)
  const place = props.place ?? 'center'
  const shell =
    place === 'dock-right' ? (
      <UiEntity
        uiTransform={{
          width: w,
          height: h,
          margin: { top: 0, right: props.right ?? 22, bottom: props.bottom ?? 22, left: 0 },
          padding: HUD_SPACE.panel,
          flexDirection: 'column',
          justifyContent: 'flex-start',
          pointerFilter: 'block'
        }}
        uiBackground={shellBg}
      >
        {props.children}
      </UiEntity>
    ) : (
      <UiEntity
        uiTransform={{
          width: w,
          height: h,
          positionType: 'absolute',
          position: { top: '50%', left: '50%' },
          margin: { top: -h / 2, left: -w / 2 },
          flexDirection: 'column',
          padding: HUD_SPACE.panel,
          pointerFilter: 'block'
        }}
        uiBackground={shellBg}
      >
        {props.children}
      </UiEntity>
    )

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        pointerFilter: 'none'
      }}
    >
      {shell}
    </UiEntity>
  )
}

export function HudChromeBtn(props: {
  label: string
  onClick: () => void
  width?: number
  height?: number
  fontSize?: number
  disabled?: boolean
}) {
  return (
    <UiEntity
      uiTransform={{
        width: props.width ?? HUD_SIZE.chromeW,
        height: props.height ?? HUD_SIZE.chromeH,
        justifyContent: 'center',
        alignItems: 'center',
        margin: { left: HUD_SPACE.chip },
        pointerFilter: 'block'
      }}
      uiBackground={hudRoundedBg(props.disabled ? HUD_DISABLED : HUD_PILL)}
      onMouseDown={() => {
        if (!props.disabled) props.onClick()
      }}
    >
      <Label
        value={props.label}
        fontSize={props.fontSize ?? HUD_TYPE.chrome}
        color={props.disabled ? HUD_SUB : HUD_WHITE}
        textAlign={HUD_ALIGN.button}
        textWrap="nowrap"
      />
    </UiEntity>
  )
}

export function HudHeader(props: {
  title: string
  icon?: string
  onBack?: () => void
  onClose?: () => void
  closeLabel?: string
}) {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: HUD_SIZE.headerH,
        flexDirection: 'row',
        alignItems: 'center',
        margin: { bottom: HUD_SPACE.headerGap }
      }}
    >
      {props.icon ? (
        <Label
          value={props.icon}
          fontSize={HUD_TYPE.title}
          color={HUD_TITLE}
          textAlign={HUD_ALIGN.button}
          textWrap="nowrap"
          uiTransform={{ width: 22, height: '100%', margin: { right: HUD_SPACE.chip } }}
        />
      ) : null}
      <Label
        value={props.title}
        fontSize={HUD_TYPE.title}
        color={HUD_TITLE}
        textAlign={HUD_ALIGN.title}
        textWrap="nowrap"
        uiTransform={{ flexGrow: 1, height: '100%' }}
      />
      {props.onBack ? <HudChromeBtn label="←" onClick={props.onBack} /> : null}
      {props.onClose ? <HudChromeBtn label={props.closeLabel ?? '✕'} onClick={props.onClose} /> : null}
    </UiEntity>
  )
}

export function HudPill(props: {
  key?: string
  label: string
  onClick: () => void
  width?: number
  height?: number
  primary?: boolean
  accent?: HudAccent
  disabled?: boolean
  fontSize?: number
}) {
  const fill = props.disabled
    ? HUD_DISABLED
    : props.primary
      ? HUD_ACCENT[props.accent ?? 'magenta']
      : HUD_PILL
  const ink = props.disabled ? HUD_SUB : props.primary ? HUD_BLACK : HUD_WHITE
  return (
    <UiEntity
      uiTransform={{
        width: props.width ?? HUD_SIZE.pillW,
        height: props.height ?? HUD_SIZE.pillH,
        justifyContent: 'center',
        alignItems: 'center',
        margin: { right: HUD_SPACE.chip, bottom: HUD_SPACE.chip },
        pointerFilter: 'block'
      }}
      uiBackground={hudRoundedBg(fill)}
      onMouseDown={() => {
        if (!props.disabled) props.onClick()
      }}
    >
      <Label
        value={props.label}
        fontSize={props.fontSize ?? HUD_TYPE.body}
        color={ink}
        textAlign={HUD_ALIGN.button}
        textWrap="nowrap"
      />
    </UiEntity>
  )
}

export function HudActionRow(props: {
  key?: string
  label: string
  meta?: string
  metaColor?: Color4
  onClick: () => void
  height?: number
}) {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: props.height ?? HUD_SIZE.actionH,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        margin: { bottom: HUD_SPACE.stack },
        padding: HUD_SPACE.actionPad,
        pointerFilter: 'block'
      }}
      uiBackground={hudRoundedBg(HUD_ACTION)}
      onMouseDown={props.onClick}
    >
      <Label
        value={props.label}
        fontSize={HUD_TYPE.action}
        color={HUD_WHITE}
        textAlign={HUD_ALIGN.button}
        textWrap="nowrap"
      />
      {props.meta ? (
        <Label
          value={props.meta}
          fontSize={HUD_TYPE.meta}
          color={props.metaColor ?? HUD_PINK}
          textAlign={HUD_ALIGN.meta}
          uiTransform={{ margin: { top: 4 } }}
        />
      ) : null}
    </UiEntity>
  )
}

export function HudListRow(props: {
  key?: string
  label: string
  meta?: string
  metaColor?: Color4
  onClick: () => void
}) {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: HUD_SIZE.listRowH,
        flexDirection: 'row',
        alignItems: 'center',
        padding: { left: HUD_SPACE.rowPad, right: HUD_SPACE.rowPad },
        margin: { bottom: HUD_SPACE.chromeGap },
        pointerFilter: 'block'
      }}
      uiBackground={hudRoundedBg(HUD_ACTION)}
      onMouseDown={props.onClick}
    >
      <Label value={props.label} fontSize={HUD_TYPE.body + 1} color={HUD_WHITE} uiTransform={{ flexGrow: 1 }} />
      {props.meta ? <Label value={props.meta} fontSize={HUD_TYPE.body} color={props.metaColor ?? HUD_PINK} /> : null}
    </UiEntity>
  )
}

// ---------------------------------------------------------------------------
// THE WORLD-UTILITY PANEL STANDARD
//
// ★ONE SHAPE FOR EVERY UTILITY SURFACE (owner, 2026-08-27). Host, Dance Admin and
// anything of that class share the same width (HUD_SIZE.utilW — the Dance Studio's),
// the same corner radius, the same header height, the same padding, the same button
// sizing and the same scroll behaviour. Only the VERTICAL extent varies with content.
//
// Before this, Host drew itself at 320px with its own rounded texture and its own
// button sizes, so two admin tools opening in the same corner looked like two
// different products. Build new utility panels from HudUtilityPanel + HudSection.
// Do not hand-roll a shell.
// ---------------------------------------------------------------------------

/** Title bar + scrolling body in the one standard shell, docked top-right. */
export function HudUtilityPanel(props: {
  title: string
  /** Thin line under the header — build stamp, counts, mode. Optional. */
  subtitle?: string
  /** Panel height. Defaults to the standard tall panel; content scrolls past it. */
  height?: number
  top?: number
  right?: number
  background?: Color4
  onBack?: () => void
  backLabel?: string
  onMinimize?: () => void
  onClose?: () => void
  children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | null
}) {
  return (
    <UiEntity
      uiTransform={{
        width: HUD_SIZE.utilW,
        height: props.height ?? HUD_SIZE.utilMaxH,
        margin: { top: props.top ?? 12, right: props.right ?? 22, bottom: 0, left: 0 },
        padding: HUD_SPACE.panel,
        flexDirection: 'column',
        justifyContent: 'flex-start',
        pointerFilter: 'block'
      }}
      uiBackground={hudRoundedBg(props.background ?? HUD_PANEL)}
    >
      <UiEntity
        uiTransform={{
          width: '100%',
          height: HUD_SIZE.headerH,
          flexDirection: 'row',
          alignItems: 'center',
          margin: { bottom: props.subtitle ? 4 : HUD_SPACE.headerGap }
        }}
      >
        <Label
          value={props.title}
          fontSize={HUD_TYPE.title}
          color={HUD_TITLE}
          textAlign={HUD_ALIGN.title}
          textWrap="nowrap"
          uiTransform={{ flexGrow: 1, height: '100%' }}
        />
        {props.onBack ? (
          <HudChromeBtn
            label={props.backLabel ?? '←'}
            width={props.backLabel ? 62 : undefined}
            fontSize={props.backLabel ? HUD_TYPE.meta : undefined}
            onClick={props.onBack}
          />
        ) : null}
        {props.onMinimize ? <HudChromeBtn label="–" onClick={props.onMinimize} /> : null}
        {props.onClose ? <HudChromeBtn label="✕" onClick={props.onClose} /> : null}
      </UiEntity>
      {props.subtitle ? (
        <Label
          value={props.subtitle}
          fontSize={HUD_TYPE.meta}
          color={HUD_SUB}
          textWrap="nowrap"
          uiTransform={{ width: '100%', margin: { bottom: HUD_SPACE.headerGap } }}
        />
      ) : null}
      {/* The body scrolls; the header never does. Content decides the height. */}
      <UiEntity
        uiTransform={{
          width: '100%',
          flexGrow: 1,
          flexDirection: 'column',
          overflow: 'scroll'
        }}
      >
        {props.children}
      </UiEntity>
    </UiEntity>
  )
}

/** One titled control group inside a utility panel. */
export function HudSection(props: {
  key?: string
  title: string
  status?: string
  statusColor?: Color4
  children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | null
}) {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        flexDirection: 'column',
        padding: HUD_SPACE.actionPad,
        margin: { bottom: HUD_SPACE.stack }
      }}
      uiBackground={hudRoundedBg(HUD_ACTION)}
    >
      <UiEntity
        uiTransform={{
          width: '100%',
          height: 18,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: { bottom: HUD_SPACE.chip }
        }}
      >
        <Label value={props.title} fontSize={HUD_TYPE.chip} color={HUD_SUB} textWrap="nowrap" />
        {props.status ? (
          <Label
            value={props.status}
            fontSize={HUD_TYPE.tiny}
            color={props.statusColor ?? HUD_SUB}
            textWrap="nowrap"
          />
        ) : null}
      </UiEntity>
      {props.children}
    </UiEntity>
  )
}

/** Sub-label inside a section ("NPC group", "Behaviour"). */
export function HudFieldLabel(props: { text: string }) {
  return (
    <Label
      value={props.text}
      fontSize={HUD_TYPE.tiny}
      color={HUD_SUB}
      textWrap="nowrap"
      uiTransform={{ width: '100%', margin: { top: 2, bottom: 2 } }}
    />
  )
}

/** Explanatory line at the foot of a section. */
export function HudHint(props: { text: string; color?: Color4 }) {
  return (
    <Label
      value={props.text}
      fontSize={HUD_TYPE.tiny}
      color={props.color ?? HUD_SUB}
      uiTransform={{ width: '100%', margin: { top: 2 } }}
    />
  )
}

/** A wrapping row of HudPill controls — the standard button block. */
export function HudPillRow(props: {
  children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | null
}) {
  return (
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap' }}>
      {props.children}
    </UiEntity>
  )
}
