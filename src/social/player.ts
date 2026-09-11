import { engine, PlayerIdentityData } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/src/players'
import type { GateRule, SocialSurfaceConfig } from '@shared/social-surface-contract'
import {
  isSocialAdminWallet,
  normalizeSocialWallet
} from '@shared/social-surface-contract'
import { isLockedOut } from './lockout'
import { passesNftGateRule, requestNftGateCheck } from './nft-check'

export { normalizeSocialWallet as normalizeWallet, isSocialAdminWallet }

/**
 * Local player's wallet for host / gate checks.
 * Prefer PlayerIdentityData on engine.PlayerEntity (canonical 0x address in Explorer).
 * getPlayer().userId alone can diverge from the address stored in adminWallets.
 */
export function playerWallet(): string | null {
  const player = getPlayer()
  if (player?.isGuest) return null

  const identity = PlayerIdentityData.getOrNull(engine.PlayerEntity)
  if (identity && !identity.isGuest) {
    const fromEcs = normalizeSocialWallet(identity.address)
    if (fromEcs) return fromEcs
  }

  const userId = normalizeSocialWallet(player?.userId)
  for (const [, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (id.isGuest) continue
    const addr = normalizeSocialWallet(id.address)
    if (!addr) continue
    if (!userId || addr === userId) return addr
  }

  if (userId?.startsWith('0x')) return userId
  return userId
}

export function isAdmin(config: SocialSurfaceConfig): boolean {
  return isSocialAdminWallet(playerWallet(), config.event.adminWallets)
}

export function passesGateRule(rule: GateRule | undefined, config: SocialSurfaceConfig): boolean {
  if (!rule) return true
  if (isAdmin(config)) return true
  if (rule.mode === 'open') return true

  const wallet = playerWallet()
  if (!wallet) return false
  if (isLockedOut(wallet)) return false

  switch (rule.mode) {
    case 'allowlist':
      return (rule.allowedAddresses ?? []).map((a) => a.toLowerCase()).includes(wallet)
    case 'wearable_equipped': {
      const p = getPlayer()
      const worn = p?.wearables ?? []
      const needed = rule.wearableUrns ?? []
      if (!needed.length) return false
      if (rule.match === 'all') return needed.every((u) => worn.includes(u))
      return needed.some((u) => worn.includes(u))
    }
    case 'nft_collection':
    case 'nft_token':
      requestNftGateCheck(wallet, rule)
      return passesNftGateRule(wallet, rule)
    default:
      return false
  }
}

export function gateRuleById(config: SocialSurfaceConfig, ruleId: string | null | undefined): GateRule | undefined {
  if (!ruleId) return undefined
  return config.gates.find((g) => g.id === ruleId)
}
