import { movePlayerTo, openExternalUrl } from '~system/RestrictedActions'
import { getPlayer } from '@dcl/sdk/players'
import { hasConfiguredRewardNft } from '@shared/social-surface-contract'
import { emitSocial } from './sync'
import { onSocial } from './sync'
import { addLockout, removeLockout } from './lockout'
import { playerWallet } from './player'
import { getSocialConfig } from './config'
import { sendRewardNftToGuest, type RewardSendResult } from './reward-send'

/** Soft boot — teleport outside parcel edge (venue lockout, not platform ban). */
const BOOT_POSITION = { x: -2, y: 0, z: 16 }

export function hostToastGuest(targetUserId: string, text: string): void {
  const trimmed = text.trim()
  if (!trimmed || !targetUserId) return
  emitSocial({ type: 'host.toast', text: trimmed, targetUserId })
}

export function hostBootGuest(targetUserId: string, wallet: string | null): void {
  if (!targetUserId) return
  emitSocial({ type: 'host.boot', targetUserId, wallet })
  if (wallet) addLockout(wallet)
}

export function hostLockoutGuest(wallet: string): void {
  if (!wallet) return
  addLockout(wallet)
}

export function hostUnlockGuest(wallet: string): void {
  if (!wallet) return
  removeLockout(wallet)
}

export function hostSendToZone(targetUserId: string, zoneId: string): void {
  if (!targetUserId || !zoneId) return
  emitSocial({ type: 'host.sendToZone', targetUserId, zoneId })
}

/** Primary path: host wallet transfers the configured prize NFT to the guest. */
export async function hostSendRewardNft(guestWallet: string | null): Promise<RewardSendResult> {
  const config = getSocialConfig()
  if (!config || !hasConfiguredRewardNft(config) || !config.event.rewardNft) {
    return { ok: false, reason: 'No reward NFT configured in Social' }
  }
  if (!guestWallet) return { ok: false, reason: 'Guest has no wallet' }
  return sendRewardNftToGuest(guestWallet, config.event.rewardNft)
}

/** Legacy fallback: open an external claim page (guest still has to act). */
export function hostRewardClaimLink(targetUserId: string, wallet: string | null): void {
  const config = getSocialConfig()
  const template = config?.event.rewardClaimUrlTemplate
  if (!template?.trim()) return
  const url = template
    .replace(/\{wallet\}/gi, wallet ?? '')
    .replace(/\{userId\}/gi, targetUserId)
  if (!url.startsWith('https://')) return
  void openExternalUrl({ url })
}

/** @deprecated Use hostSendRewardNft — kept for older call sites. */
export function hostRewardGuest(targetUserId: string, wallet: string | null): void {
  const config = getSocialConfig()
  if (config && hasConfiguredRewardNft(config)) {
    void hostSendRewardNft(wallet)
    return
  }
  hostRewardClaimLink(targetUserId, wallet)
}

let hostActionsInited = false

export function initHostActions(): void {
  if (hostActionsInited) return
  hostActionsInited = true
  onSocial('host.boot', (msg) => {
    const localId = playerWallet()
    if (!localId || localId !== msg.targetUserId.toLowerCase()) return
    void movePlayerTo({
      newRelativePosition: { ...BOOT_POSITION },
      cameraTarget: { x: 8, y: 1.5, z: 8 }
    })
  })
}

export function isLocalPlayer(userId: string): boolean {
  const local = getPlayer()
  if (!local) return false
  return local.userId.toLowerCase() === userId.toLowerCase()
}
