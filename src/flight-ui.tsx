/**
 * Ride HUD — controls for whatever you are sitting in or standing on.
 * On-foot Superman flight (Fly / Land / F) was removed: Explorer cannot hold a
 * horizontal pose on a moving player without a second ghost avatar.
 */
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { UI, panelBg, screenLayer } from './ui-kit'
import { activeRideHint } from './ride-hint'

export function FlightRoot() {
  const hint = activeRideHint()
  if (!hint) return null

  return (
    <UiEntity uiTransform={{ ...screenLayer('top-centre'), zIndex: 400 }}>
      <UiEntity
        uiTransform={{
          flexDirection: 'row',
          height: 36,
          margin: { top: 14 },
          alignItems: 'center',
        }}
      >
        <UiEntity
          uiTransform={{
            height: 36,
            padding: { left: 10, right: 10 },
            justifyContent: 'center',
            alignItems: 'center',
            pointerFilter: 'none',
          }}
          uiBackground={panelBg(UI.panel)}
        >
          <Label value={hint} fontSize={12} color={UI.text} />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
