/**
 * Dance-loop message wire — same MessageBus transport as social/sync.ts but a
 * separate typed catalog (shared/dance-venue-contract.ts DanceBusMessage).
 * Mirrors emitSocial: emit ALSO dispatches locally, because MessageBus does not
 * deliver to the sender — the coordinator consumes its own join/emote events.
 */
import { MessageBus } from '@dcl/sdk/message-bus'
import type { DanceBusMessage } from '@shared/dance-venue-contract'
import { DANCE_BUS_TYPES } from '@shared/dance-venue-contract'

const danceBus = new MessageBus()

type Handler = (msg: DanceBusMessage) => void

const localHandlers = new Map<string, Set<Handler>>()
let wired = false

function wireBus(): void {
  if (wired) return
  wired = true
  for (const type of DANCE_BUS_TYPES) {
    danceBus.on(type, (payload: DanceBusMessage) => {
      if (!payload || typeof payload !== 'object') return
      dispatchLocal(payload)
    })
  }
}

function dispatchLocal(msg: DanceBusMessage): void {
  const set = localHandlers.get(msg.type)
  if (!set) return
  for (const fn of set) fn(msg)
}

export function emitDance(msg: DanceBusMessage): void {
  wireBus()
  // Apply the command on the sender first. The host controls must keep working
  // locally even when the realm MessageBus is reconnecting or rejects a send.
  // Consumers de-duplicate crowd cues by id, so a transport that echoes back to
  // the sender is still safe.
  dispatchLocal(msg)
  try {
    danceBus.emit(msg.type, msg)
  } catch (error) {
    console.log('[dance] message send failed — local action still applied', error)
  }
}

export function onDance<T extends DanceBusMessage['type']>(
  type: T,
  handler: (msg: Extract<DanceBusMessage, { type: T }>) => void
): void {
  wireBus()
  if (!localHandlers.has(type)) localHandlers.set(type, new Set())
  localHandlers.get(type)!.add(handler as Handler)
}
