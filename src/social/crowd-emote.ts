import { triggerEmote } from '~system/RestrictedActions'
import { getSocialConfig } from './config'
import { onSocial } from './sync'
import { playerWallet } from './player'
import { showEnterWelcome, showHostMessage, showScreenAnnouncement } from './announcement-banner'
import { silenceClappingAudioEmote } from '@shared/world-audio-policy'

function showAnnounce(text: string): void {
  showScreenAnnouncement(text)
}

function showPrivateToast(text: string): void {
  // Screen-space lower-third banner only THIS player sees. The old version was a
  // 3D TextShape at a fixed world position — invisible unless you happened to be
  // standing next to it ("nothing is printed").
  showHostMessage(`Host: ${text}`)
}

export function initCrowdEmote(): void {
  onSocial('host.emote', (msg) => {
    if (!msg.emote) return
    void triggerEmote({ predefinedEmote: silenceClappingAudioEmote(msg.emote) })
  })

  onSocial('host.announce', (msg) => {
    if (msg.text) showAnnounce(msg.text)
  })

  onSocial('host.toast', (msg) => {
    const local = playerWallet()
    if (!local || local !== msg.targetUserId.toLowerCase()) return
    if (msg.text) showPrivateToast(msg.text)
  })
}

/** Kept as a registered no-op — the private toast is screen-space UI now, so
 *  there is no world entity to tick. */
export function crowdEmoteSystem(_dt: number): void {}

/**
 * `venueName` is the deployed world/building name. It must be passed in: the
 * lockup used to hardcode "SWISSVERSE" and there is no name on the social
 * config that identifies the place itself.
 */
export function playEnterAnnouncement(venueName: string): void {
  const config = getSocialConfig()
  const text = config?.event.announceOnEnter
  if (text) showEnterWelcome(text, venueName)
}

export function triggerLocalEmote(emote: string): void {
  void triggerEmote({ predefinedEmote: silenceClappingAudioEmote(emote) })
}
