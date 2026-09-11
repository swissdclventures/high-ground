import { onSocial, emitSocial } from './sync'

const lockedWallets = new Set<string>()
let lockoutSyncInited = false

export function isLockedOut(wallet: string | null | undefined): boolean {
  if (!wallet) return false
  return lockedWallets.has(wallet.toLowerCase())
}

export function addLockout(wallet: string): void {
  const addr = wallet.toLowerCase()
  if (lockedWallets.has(addr)) return
  lockedWallets.add(addr)
  emitSocial({ type: 'host.lockout', wallet: addr, locked: true })
}

export function removeLockout(wallet: string): void {
  const addr = wallet.toLowerCase()
  if (!lockedWallets.has(addr)) return
  lockedWallets.delete(addr)
  emitSocial({ type: 'host.lockout', wallet: addr, locked: false })
}

export function listLockedWallets(): string[] {
  return [...lockedWallets]
}

export function initLockoutSync(): void {
  if (lockoutSyncInited) return
  lockoutSyncInited = true
  onSocial('host.lockout', (msg) => {
    const addr = msg.wallet.toLowerCase()
    if (msg.locked) lockedWallets.add(addr)
    else lockedWallets.delete(addr)
  })
}
