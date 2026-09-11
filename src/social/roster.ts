import type { GateRule, GuestGateStatus, SocialSurfaceConfig } from '@shared/social-surface-contract'
import { getPlayer } from '@dcl/sdk/players'
import { engine, Entity, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { getSocialConfig } from './config'
import { gateRuleById } from './player'
import { isLockedOut } from './lockout'
import { passesNftGateRule, requestNftGateCheck, subscribeNftCacheRefresh } from './nft-check'

export interface GuestRecord {
  userId: string
  name: string
  wallet: string | null
  isGuest: boolean
  wearables: string[]
  gateStatus: GuestGateStatus
  /** True when a wearable gate is configured and this guest matches. */
  wearableMatch: boolean | null
  initials: string
  /** No movement for ~10 minutes. */
  afk: boolean
}

const AFK_STILL_MS = 600_000
const AFK_MOVE_EPSILON = 0.05
const motionByUser = new Map<string, { x: number; z: number; stillSince: number }>()

let guests: GuestRecord[] = []
let uiTick = 0
const listeners = new Set<() => void>()

function initialsFor(name: string, wallet: string | null): string {
  const trimmed = name.trim()
  if (trimmed.length >= 2) return trimmed.slice(0, 2).toUpperCase()
  if (wallet && wallet.length >= 4) return wallet.slice(2, 4).toUpperCase()
  return '??'
}

function shortWallet(wallet: string | null): string {
  if (!wallet) return 'guest'
  if (wallet.length < 10) return wallet
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
}

export function formatGuestWallet(wallet: string | null): string {
  return shortWallet(wallet)
}

function primaryGateRule(config: SocialSurfaceConfig): GateRule | undefined {
  if (config.buildingGateRuleId) return gateRuleById(config, config.buildingGateRuleId)
  return config.gates[0]
}

function wearableMatches(rule: GateRule | undefined, wearables: string[]): boolean | null {
  if (!rule || rule.mode !== 'wearable_equipped') return null
  const needed = rule.wearableUrns ?? []
  if (!needed.length) return false
  if (rule.match === 'all') return needed.every((u) => wearables.includes(u))
  return needed.some((u) => wearables.includes(u))
}

function evaluateGuestPass(
  wallet: string,
  wearables: string[],
  config: SocialSurfaceConfig,
  rule: GateRule
): boolean {
  if (config.event.adminWallets.includes(wallet)) return true
  switch (rule.mode) {
    case 'open':
      return true
    case 'allowlist':
      return (rule.allowedAddresses ?? []).map((a) => a.toLowerCase()).includes(wallet)
    case 'wearable_equipped': {
      const needed = rule.wearableUrns ?? []
      if (!needed.length) return false
      if (rule.match === 'all') return needed.every((u) => wearables.includes(u))
      return needed.some((u) => wearables.includes(u))
    }
    case 'nft_collection':
    case 'nft_token':
      requestNftGateCheck(wallet, rule)
      return passesNftGateRule(wallet, rule)
    default:
      return false
  }
}

export function guestGateStatusFor(
  wallet: string | null,
  isGuest: boolean,
  wearables: string[],
  config: SocialSurfaceConfig
): { status: GuestGateStatus; wearableMatch: boolean | null } {
  if (isGuest || !wallet) {
    return { status: 'guest', wearableMatch: null }
  }
  const addr = wallet.toLowerCase()
  if (isLockedOut(addr)) {
    return { status: 'locked', wearableMatch: null }
  }
  if (config.event.adminWallets.includes(addr)) {
    return { status: 'pass', wearableMatch: wearableMatches(primaryGateRule(config), wearables) }
  }
  const rule = primaryGateRule(config)
  const wearableMatch = wearableMatches(rule, wearables)
  if (!rule || rule.mode === 'open') {
    return { status: 'pass', wearableMatch }
  }
  const guestPass = evaluateGuestPass(addr, wearables, config, rule)
  return { status: guestPass ? 'pass' : 'fail', wearableMatch }
}

let lastSignature = ''

function sampleAfk(entity: Entity, userId: string, now: number): boolean {
  const tf = Transform.getOrNull(entity)
  if (!tf) return false
  const x = tf.position.x
  const z = tf.position.z
  const prev = motionByUser.get(userId)
  if (!prev) {
    motionByUser.set(userId, { x, z, stillSince: now })
    return false
  }
  const moved =
    Math.abs(x - prev.x) > AFK_MOVE_EPSILON || Math.abs(z - prev.z) > AFK_MOVE_EPSILON
  if (moved) {
    motionByUser.set(userId, { x, z, stillSince: now })
    return false
  }
  return now - prev.stillSince >= AFK_STILL_MS
}

function rebuildGuests(): void {
  const config = getSocialConfig()
  if (!config) {
    guests = []
    return
  }

  const next: GuestRecord[] = []
  const now = Date.now()
  const seen = new Set<string>()
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    seen.add(identity.address)
    const player = getPlayer({ userId: identity.address })
    const wallet = identity.isGuest ? null : identity.address.toLowerCase()
    const name = player?.name?.trim() || (wallet ? shortWallet(wallet) : 'Guest')
    const wearables = player?.wearables ?? []
    const { status, wearableMatch } = guestGateStatusFor(wallet, identity.isGuest, wearables, config)
    const afk = sampleAfk(entity, identity.address, now)
    next.push({
      userId: identity.address,
      name,
      wallet,
      isGuest: identity.isGuest,
      wearables,
      gateStatus: status,
      wearableMatch,
      initials: initialsFor(name, wallet),
      afk
    })
  }
  for (const key of motionByUser.keys()) {
    if (!seen.has(key)) motionByUser.delete(key)
  }

  next.sort((a, b) => a.name.localeCompare(b.name))
  const signature = next
    .map((g) => `${g.userId}:${g.gateStatus}:${g.name}:${g.wearableMatch}:${g.afk}`)
    .join('|')
  if (signature === lastSignature) return
  lastSignature = signature
  guests = next
  uiTick += 1
  for (const fn of listeners) fn()
}

export function getGuests(): GuestRecord[] {
  return guests
}

export function getRosterUiTick(): number {
  return uiTick
}

export function subscribeRoster(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let rosterInited = false

export function initRoster(): void {
  if (rosterInited) return
  rosterInited = true
  subscribeNftCacheRefresh(() => {
    lastSignature = ''
    rebuildGuests()
  })
  engine.addSystem(() => {
    rebuildGuests()
  })
}
