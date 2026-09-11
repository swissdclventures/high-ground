import {Color4} from '@dcl/sdk/math'
import {PUNCH_VISUAL_THEME} from '@shared/punch-visual-theme'

export function punchColor(hex: string, alpha=1): Color4 {
  const c=Color4.fromHexString(hex+'FF')
  return Color4.create(c.r,c.g,c.b,alpha)
}

/** Shared by the HUD, arrival cover and focus effects. */
export const PUNCH_UI = {
  ink: punchColor(PUNCH_VISUAL_THEME.ink),
  panel: punchColor(PUNCH_VISUAL_THEME.panel,.97),
  panelRaised: punchColor(PUNCH_VISUAL_THEME.panelRaised),
  ivory: punchColor(PUNCH_VISUAL_THEME.ivory),
  muted: punchColor(PUNCH_VISUAL_THEME.muted),
  inkSoft: punchColor(PUNCH_VISUAL_THEME.inkSoft),
  red: punchColor(PUNCH_VISUAL_THEME.red),
  redHot: punchColor(PUNCH_VISUAL_THEME.redHot),
  brass: punchColor(PUNCH_VISUAL_THEME.brass),
  metal: punchColor(PUNCH_VISUAL_THEME.metal),
  petrol: punchColor(PUNCH_VISUAL_THEME.petrol),
  channel: punchColor(PUNCH_VISUAL_THEME.channel),
  channelHot: punchColor(PUNCH_VISUAL_THEME.channelHot),
  focus: punchColor(PUNCH_VISUAL_THEME.focus),
  gold: punchColor(PUNCH_VISUAL_THEME.gold),
  goldHot: punchColor(PUNCH_VISUAL_THEME.goldHot),
  danger: punchColor(PUNCH_VISUAL_THEME.danger),
}

export function punchAlpha(color: Color4, alpha: number): Color4 {
  return Color4.create(color.r,color.g,color.b,alpha)
}
