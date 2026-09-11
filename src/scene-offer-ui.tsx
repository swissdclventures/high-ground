/**
 * Crossing offer — a small card, not a cover.
 *
 * Default for a fly-in is the island. This card is KEEP FLYING (undo) after
 * that restore, or TAKE ME THERE if they are still out in the plot. Punch's
 * own fall cloud wins when it is up. The landing cover owns KEEP FLYING while
 * it is on screen.
 */
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { acceptSceneOffer, dismissSceneOffer, keepFlying, sceneOfferHud } from './scene-offer'
import { cornerRadius, px, SafeScreen, SvButton, textPx, UI } from './ui/kit'

const CARD = Color4.create(0.05, 0.07, 0.1, 0.92)

export function SceneOfferRoot() {
  const hud = sceneOfferHud()
  if (!hud) return null

  const pad = Math.max(12, px(16))
  const cardW = Math.max(240, px(360))

  return (
    <SafeScreen avoidChrome>
      <UiEntity
        uiTransform={{
          width: '100%',
          height: '100%',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: { bottom: Math.max(24, px(36)) },
          pointerFilter: 'none'
        }}
      >
        <UiEntity
          uiTransform={{
            width: cardW,
            flexDirection: 'column',
            alignItems: 'center',
            padding: { top: pad, right: pad, bottom: pad, left: pad },
            borderRadius: cornerRadius(UI.radius.lg),
            pointerFilter: 'none'
          }}
          uiBackground={{ color: CARD }}
        >
          <Label
            value={hud.keepFlying ? 'KEEP FLYING?' : 'GO TO ENTRANCE?'}
            fontSize={textPx(18, 14)}
            color={UI.gold}
            textAlign="middle-center"
            uiTransform={{ width: cardW - pad * 2, height: Math.round(textPx(18, 14) * 1.4) }}
          />
          <Label
            value={hud.title}
            fontSize={textPx(15, 13)}
            color={UI.white}
            textAlign="middle-center"
            uiTransform={{
              width: cardW - pad * 2,
              height: Math.round(textPx(15, 13) * 1.35),
              margin: { top: 4 }
            }}
          />
          <UiEntity
            uiTransform={{
              width: cardW - pad * 2,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              margin: { top: Math.max(10, px(14)) },
              pointerFilter: 'none'
            }}
          >
            <SvButton
              id="scene-offer-go"
              label={hud.keepFlying ? 'KEEP FLYING' : 'TAKE ME THERE'}
              width={200}
              height={52}
              minPx={48}
              fontPx={textPx(16, 14)}
              color={UI.inkSolid}
              position={{ margin: { right: Math.max(8, px(12)) } }}
              onUp={() => (hud.keepFlying ? keepFlying() : acceptSceneOffer())}
            />
            <SvButton
              id="scene-offer-min"
              label={hud.keepFlying ? 'STAY HERE' : 'STAY'}
              width={120}
              height={52}
              minPx={48}
              fontPx={textPx(16, 14)}
              color={UI.white}
              skin={{ color: UI.track, radius: UI.radius.md }}
              onUp={() => dismissSceneOffer()}
            />
          </UiEntity>
        </UiEntity>
      </UiEntity>
    </SafeScreen>
  )
}
