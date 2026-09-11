/**
 * ONE owner for "which big right-side panel is open" — HOST console or the
 * Dance Studio. SDK7 UI has no drag events, so panels can't be moved by the
 * user; instead they are mutually exclusive: opening one closes the other.
 * This is what stops the HOST panel and the Dance Studio from stacking on top
 * of each other (both used to anchor bottom/top-right independently — the
 * "two instances / overlap" mess).
 */
export type ActivePanel =
  | 'none'
  | 'host'
  | 'dance'
  /** Break Dancing plugin's ADMIN surface — crowd, choreography, reactions.
   *  Separate from 'dance', which is the end user's own Dance Studio. */
  | 'dance-admin'
  /** Bubble Bash plugin's ADMIN surface — the capability probe. */
  | 'bubble-lab'
  /** Garden plugin's ADMIN surface — hold a bed at any stage, read its real growth. */
  | 'garden-console'
  | 'guests'
  | 'weather'
  | 'exchange'
  | 'vendor'
  | 'retail-shop'

let activePanel: ActivePanel = 'none'
let refresh: (() => void) | null = null

export function setPanelRefresh(fn: () => void): void {
  refresh = fn
}

export function getActivePanel(): ActivePanel {
  return activePanel
}

export function setActivePanel(panel: ActivePanel): void {
  activePanel = panel
  refresh?.()
}
