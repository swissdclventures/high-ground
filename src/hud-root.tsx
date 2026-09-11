/**
 * High Ground HUD mount.
 *
 * Unused Swissverse app roots (Scrap, Bubble, Gallery, claw, …) are not imported
 * here. Those features are off on this scene; mounting them only pulled private
 * implementations into the standalone build.
 */
import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { HostHudRoot, FxOverlayRoot, initHostUi } from './social/host-ui'
import { FreshnessLineRoot } from './social/freshness-line'
import { WorldMapRoot } from './plugins/world-map'
import { AnnouncementBannerRoot } from './social/announcement-banner'
import { FlightRoot } from './flight-ui'
import { ZoneEntryCardRoot } from './social/zone-entry-card'
import { LandingRoot } from './plugins/landing-ui'
import { isLandingCoverBlocking, isLandingCoverVisible } from './plugins/landing'
import { AccessCurtainRoot, isAccessCurtainUp } from './access-gate/curtain'
import { SceneOfferRoot } from './scene-offer-ui'
import { startSceneOffer } from './scene-offer'
import { GateRoot } from './plugins/gate-ui'
import { PunchMachineRoot } from './plugins/punch-machine-ui'
import { isPunchMachineActive } from './plugins/punch-machine'

const UI_RENDERER_OPTIONS = { screenInset: 'none' as const }

export function initHudRoot(): void {
  initHostUi()
  startSceneOffer()
  ReactEcsRenderer.setUiRenderer(() => {
    const shutOut = isAccessCurtainUp()
    const hideChrome = shutOut || isLandingCoverBlocking() || isPunchMachineActive()
    const hideBanner = shutOut || isLandingCoverBlocking()
    return (
      <UiEntity uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}>
        {hideChrome ? null : <HostHudRoot />}
        {hideChrome ? null : <FreshnessLineRoot />}
        {hideChrome ? null : <WorldMapRoot />}
        {hideBanner ? null : <AnnouncementBannerRoot />}
        {hideChrome ? null : <ZoneEntryCardRoot />}
        {shutOut ? null : <FxOverlayRoot />}
        {shutOut ? null : <PunchMachineRoot />}
        {hideChrome ? null : <FlightRoot />}
        {shutOut && !isLandingCoverVisible() ? null : <LandingRoot />}
        {shutOut ? null : <GateRoot />}
        {shutOut || isLandingCoverBlocking() ? null : <SceneOfferRoot />}
        <AccessCurtainRoot />
      </UiEntity>
    )
  }, UI_RENDERER_OPTIONS)
}
