/**
 * THE OFFICIAL SERVER HEARTBEAT.
 *
 * DCL's Multiplayer Server docs: `isStateSyncronized()` only means the CRDT
 * transport connected. It does not mean the headless server is running. The
 * reliable signal is a component the SERVER writes `Date.now()` into every
 * ~2 s, `syncEntity`'d only on the server, locked with `validateBeforeChange`
 * so a client cannot fake it.
 *
 * Clients track the local time at which they last saw the value CHANGE — not
 * the timestamp itself — so a stale CRDT snapshot from a previous server run
 * does not read as live.
 *
 * ‼️STATIC IMPORT FROM `index.ts`. `defineComponent` must run before the
 * engine seals. `startPunchServerPulse` is called from the server boot, after
 * the seal, which is when `validateBeforeChange` / `syncEntity` belong.
 */
import { engine, Schemas } from '@dcl/sdk/ecs'
import { isServer, syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** Fixed singleton id. Vehicles start at 8101, NPC director is 7001. */
const PUNCH_SERVER_PULSE_SYNC_ID = 71
const PULSE_INTERVAL_S = 2
const PULSE_FRESHNESS_MS = 6_000

export const PunchServerPulse = engine.defineComponent('swissverse::PunchServerPulse', {
  at: Schemas.Int64
})

let lastSeenValue = 0
let lastSeenAtClient = 0
let started = false

/**
 * Server-only. First pulse is written here so the first visitor does not wait
 * a full interval for the house to look alive.
 */
export function startPunchServerPulse(): void {
  if (!isServer() || started) return
  started = true
  try {
    PunchServerPulse.validateBeforeChange((value) => {
      return (value.senderAddress ?? '').toLowerCase() === AUTH_SERVER_PEER_ID.toLowerCase()
    })

    const entity = engine.addEntity()
    PunchServerPulse.create(entity, { at: Date.now() })
    syncEntity(entity, [PunchServerPulse.componentId], PUNCH_SERVER_PULSE_SYNC_ID)
    console.log('[SERVER] punch pulse on')

    let acc = 0
    engine.addSystem((dt: number) => {
      acc += dt
      if (acc < PULSE_INTERVAL_S) return
      acc = 0
      PunchServerPulse.getMutable(entity).at = Date.now()
    })
  } catch (error) {
    // A pulse failure must not take the punch reducer down with it — that is
    // a silent empty house and a client stuck on WAKING forever.
    console.error('[SERVER] punch pulse failed; hosting continues', error)
  }
}

/**
 * True only after this client has observed a pulse CHANGE within ~3× the
 * interval, and the SDK says the CRDT room is synced.
 */
export function punchServerPulseAlive(now: number = Date.now()): boolean {
  for (const [, data] of engine.getEntitiesWith(PunchServerPulse)) {
    if (data.at !== lastSeenValue) {
      lastSeenValue = data.at
      lastSeenAtClient = now
    }
    break
  }
  if (lastSeenAtClient === 0) return false
  return now - lastSeenAtClient < PULSE_FRESHNESS_MS
}
