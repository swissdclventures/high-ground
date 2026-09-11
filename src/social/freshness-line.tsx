/** A barely-visible bottom line containing only the exact publish date/time. */
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { getRuntimeContext } from './runtime-context'
import { HUD } from './hud-layout'
import { formatPublishStamp } from '@shared/live-receipt'
import { screenLayer } from '../ui-kit'

let freshTick = 0
let acc = 0
let previewMode = false

/** index.ts calls this when the preview fixture is applied (local dev / a
 *  fixture-config deploy). The stamp is then meaningless, so we say PREVIEW. */
export function markPreviewScene(): void {
  previewMode = true
}

/** Re-render tick so a stamp change after hot-reload is visible. */
export function freshnessSystem(dt: number): void {
  acc += dt
  if (acc >= 20) {
    acc = 0
    freshTick += 1
  }
}

function publishDateTime(): string {
  // Preview/fixture scene: the syncedAt is the frozen local config timestamp, and
  // the screen/venue are the generic fixture — NOT the owner's real publish. Say so.
  if (previewMode) return 'PREVIEW — generic fixture, not your published venue'
  const ctx = getRuntimeContext()
  const stamp = ctx?.syncedAt
  if (!stamp || Number.isNaN(Date.parse(stamp))) return ''
  return formatPublishStamp(stamp)
}

export function FreshnessLineRoot() {
  void freshTick
  const color = previewMode
    ? Color4.create(1, 0.75, 0.2, 0.95) // amber warning in preview
    : Color4.create(0.75, 0.77, 0.82, 0.32)
  return (
    <UiEntity uiTransform={screenLayer('bottom-centre')}>
      <UiEntity
        uiTransform={{
          margin: { bottom: HUD.freshness.bottom },
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          pointerFilter: 'none',
        }}
      >
        <Label value={publishDateTime()} fontSize={previewMode ? 12 : 9} color={color} />
      </UiEntity>
    </UiEntity>
  )
}
