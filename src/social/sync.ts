import { MessageBus } from '@dcl/sdk/message-bus'
import type { SocialBusMessage } from '@shared/social-surface-contract'

export const socialBus = new MessageBus()

type Handler = (msg: SocialBusMessage) => void

const localHandlers = new Map<string, Set<Handler>>()
let wired = false

function wireBus(): void {
  if (wired) return
  wired = true
  const types: SocialBusMessage['type'][] = [
    'door.set',
    'media.video',
    'media.audio',
    'host.announce',
    'host.emote',
    'host.toast',
    'host.boot',
    'host.lockout',
    'host.sendToZone',
    'host.fx',
    'host.npcActivity',
    'gate.setEnabled'
  ]
  for (const type of types) {
    socialBus.on(type, (payload: SocialBusMessage) => {
      if (!payload || typeof payload !== 'object') return
      dispatchLocal(payload)
    })
  }
}

function dispatchLocal(msg: SocialBusMessage): void {
  const set = localHandlers.get(msg.type)
  if (!set) return
  for (const fn of set) fn(msg)
}

export function emitSocial(msg: SocialBusMessage): void {
  wireBus()
  socialBus.emit(msg.type, msg)
  dispatchLocal(msg)
}

export function onSocial<T extends SocialBusMessage['type']>(
  type: T,
  handler: (msg: Extract<SocialBusMessage, { type: T }>) => void
): void {
  wireBus()
  if (!localHandlers.has(type)) localHandlers.set(type, new Set())
  localHandlers.get(type)!.add(handler as Handler)
}

export function initSocialSync(): void {
  wireBus()
}
