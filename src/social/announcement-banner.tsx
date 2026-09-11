/**
 * On-screen announcement — small lower-third, DCL chat chrome (not a giant takeover).
 */
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

const BANNER_MS = 4500
const MSG_MS = 7000

/**
 * The venue's OWN name, set by the arrival that raises the lockup.
 *
 * This was `const BRAND = 'SWISSVERSE'` and it was drawn unconditionally: every
 * visitor to every venue that set an entry message got a stranger's brand as
 * the headline above the owner's own welcome line, with no config path that
 * could ever change it. Empty means the lockup draws the body line alone.
 */
let brand = ''

const PANEL = {
  texture: { src: 'images/rounded-panel.png' },
  textureMode: 'nine-slices' as const,
  textureSlices: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 },
  color: Color4.create(0.08, 0.09, 0.12, 0.82)
}

let bannerText = ''
let bannerExpiresAt = 0
let bannerTick = 0
let enterWelcome = false
/** Optional UI-refresh nudge (set by initHostUi) so the banner clears promptly. */
let refresh: (() => void) | null = null
export function setAnnouncementRefresh(fn: () => void): void {
  refresh = fn
}

function show(text: string, ms: number, welcome: boolean): void {
  const t = text.trim()
  if (!t && !welcome) return
  bannerText = t
  enterWelcome = welcome
  bannerExpiresAt = Date.now() + ms
  bannerTick += 1
  refresh?.()
}

/** Host-wide announce — same small chrome as world entry, no giant center card. */
export function showScreenAnnouncement(text: string): void {
  show(text, BANNER_MS, false)
}

/**
 * World-entry lockup: this venue's name + a short line. `venueName` is the
 * world/building name resolved from the deployed config — pass '' when it is
 * not known and the headline is simply omitted.
 */
export function showEnterWelcome(body: string, venueName: string): void {
  brand = venueName.trim()
  show(body, BANNER_MS, true)
}

// --- Private host message: a smaller lower-third banner only THIS player sees.
let msgText = ''
let msgExpiresAt = 0

export function showHostMessage(text: string): void {
  const t = text.trim()
  if (!t) return
  msgText = t
  msgExpiresAt = Date.now() + MSG_MS
  bannerTick += 1
  refresh?.()
}

export function announcementSystem(_dt: number): void {
  if (bannerText && Date.now() >= bannerExpiresAt) {
    bannerText = ''
    enterWelcome = false
    bannerTick += 1
    refresh?.()
  }
  if (msgText && Date.now() >= msgExpiresAt) {
    msgText = ''
    bannerTick += 1
    refresh?.()
  }
}

function LowerThird(props: { children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | null }) {
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 118 },
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      <UiEntity
        uiTransform={{
          padding: { left: 16, right: 16, top: 10, bottom: 10 },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}
        uiBackground={PANEL}
      >
        {props.children}
      </UiEntity>
    </UiEntity>
  )
}

export function AnnouncementBannerRoot() {
  void bannerTick
  const showBig = (!!bannerText || enterWelcome) && Date.now() < bannerExpiresAt
  const showMsg = !!msgText && Date.now() < msgExpiresAt
  if (!showBig && !showMsg) return null

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        position: { top: 0, left: 0, right: 0, bottom: 0 },
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 250,
        pointerFilter: 'none',
      }}
    >
      {showBig ? (
        <LowerThird>
          {enterWelcome && brand ? (
            <Label
              value={brand}
              fontSize={18}
              color={Color4.White()}
              textAlign="middle-center"
              uiTransform={{ height: 22, margin: { bottom: 2 } }}
            />
          ) : null}
          {bannerText ? (
            <Label
              value={bannerText}
              fontSize={enterWelcome ? 13 : 16}
              color={Color4.create(0.82, 0.86, 0.92, 1)}
              textAlign="middle-center"
              textWrap="wrap"
              uiTransform={{ height: enterWelcome ? 18 : 24 }}
            />
          ) : null}
        </LowerThird>
      ) : null}
      {showMsg ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { bottom: 140 },
            width: '100%',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <UiEntity
            uiTransform={{
              padding: { left: 18, right: 18, top: 10, bottom: 10 },
              justifyContent: 'center',
              alignItems: 'center'
            }}
            uiBackground={PANEL}
          >
            <Label
              value={msgText}
              fontSize={16}
              color={Color4.create(0.8, 0.92, 1, 1)}
              textAlign="middle-center"
              textWrap="wrap"
            />
          </UiEntity>
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}
