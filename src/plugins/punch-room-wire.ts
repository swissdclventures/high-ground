/**
 * THE PUNCH WIRE, over DCL's Multiplayer Server room.
 *
 * A drop-in `PunchCompetitionBus` — the seam `punch-machine-network.ts` already
 * declared for exactly this — carrying the same six events over `room`. The
 * reducer above it does not know which transport it is talking to.
 *
 * Official rules this file follows (docs.decentraland.org Multiplayer Server):
 *   - `registerMessages` + `room.send` / `room.onMessage` only
 *   - clients wait for `isStateSyncronized()` before sending
 *   - pending frames flush once the room is ready (room-not-synced is ~1 s)
 *   - no `MessageBus` (client-to-client; the server cannot hear it)
 *   - no `REQ_CRDT_STATE` kicker (the SDK already retries; extra kicks can
 *     wedge desktop at ready=NO)
 *   - no `CUSTOM_EVENT` bypass of the ready gate
 *
 * ‼️THIS MODULE MUST BE REACHED BY A STATIC IMPORT. `registerMessages()` defines
 * a component internally, and component definition has to happen during initial
 * module load, before the engine seals.
 *
 * ‼️AND IT MUST NOT IMPORT `@dcl/sdk/server`. This file loads on the client too.
 */
import { engine, Schemas } from '@dcl/sdk/ecs'
import { isStateSyncronized, registerMessages } from '@dcl/sdk/network'
import { PUNCH_ROOM_CHANNEL, PUNCH_ROOM_MAX_BYTES } from '@shared/punch-authority'
import type { PunchCompetitionBus } from './punch-machine-network'

/**
 * ONE CHANNEL CARRYING JSON, and the reasoning is worth keeping.
 *
 * The obvious version declares a `Schemas.Map` per event. It cannot be done
 * here without inventing a second definition of the game: the state heartbeat
 * carries `PunchCompetitionSnapshot` — nested arrays of leaderboard rows,
 * profile boards keyed by profile, the circle roster, the ring, the rescue and
 * its `tried` list — and `Schemas` has no shape for a keyed map of arrays. A
 * hand-written mirror of that type would be a second source of truth for every
 * field, drifting from the first the day somebody adds a column.
 *
 * So the payload is a string, the snapshot is JSON, and the schema stays two
 * fields wide forever. The cost is bytes, which is what `PUNCH_ROOM_MAX_BYTES`
 * is for; the saving is that `cloneSnapshot` remains the only place that knows
 * the shape of a snapshot.
 */
export const PunchRoomMessages = {
  // ‼️A LITERAL KEY, not `[PUNCH_ROOM_CHANNEL]`. A computed key widens the
  // object's type to a string index, and `room.send`/`room.onMessage` are typed
  // on `keyof` the registered set — so the computed form compiles here and then
  // refuses every call site. The constant stays the single source of the NAME;
  // this line is the one place it is spelled out, and the assertion below keeps
  // the two from drifting.
  'punch.wire': Schemas.Map({
    /** Which of the six punch events this is — the discriminator. */
    event: Schemas.String,
    /** The event's own payload, JSON. */
    body: Schemas.String
  })
}

export const punchRoom = registerMessages(PunchRoomMessages)

/**
 * Compile-time proof that the literal above and the shared constant agree. If
 * somebody renames the channel in `@shared/punch-authority` and not here, this
 * line stops the build instead of the scene going quiet in production.
 */
const _channelNameMatches: keyof typeof PunchRoomMessages = PUNCH_ROOM_CHANNEL
void _channelNameMatches

/** Reported once per event name, not once per drop: a wedged wire is a flood. */
const oversizeReported = new Set<string>()

/** Every room frame this client has decoded, whoever sent it. See the diagnostics. */
let framesIn = 0
/** The transport-verified sender of the last frame, lower-cased. '' until one lands. */
let lastFrom = ''

function roomWillTransmit(): boolean {
  return punchRoom.isReady() && isStateSyncronized()
}

/**
 * ‼️THE FACTS THAT SPLIT "WAITING" INTO A LAYER.
 *
 * The SDK's Room QUEUES every outbound message until it is "ready", and ready
 * needs the Explorer to report `RealmInfo.isConnectedSceneRoom` AND a CRDT
 * state reply from the server peer. Official docs: do not send until
 * `isStateSyncronized()` (SDK spelling). A client that never gets there sends
 * nothing — its hellos sit pending — while still LOOKING connected: avatars
 * sync at the Explorer level.
 *
 *   `ready`    — the Room will actually transmit (false = everything queued)
 *   `synced`   — `isStateSyncronized()`; transport connected, not server-alive
 *   `framesIn` — how many room frames have arrived from ANYONE
 *   `lastFrom` — who the last one came from ('authoritative-server' = the
 *                server is reaching this client)
 */
export function punchRoomDiagnostics(): {
  ready: boolean
  synced: boolean
  framesIn: number
  lastFrom: string
} {
  return {
    ready: punchRoom.isReady(),
    synced: isStateSyncronized(),
    framesIn,
    lastFrom
  }
}

export interface PunchRoomBusOptions {
  /** True on the headless server, false in every player's client. */
  isServer: boolean
  /**
   * ‼️THE ANTI-CHEAT, and it is one line.
   *
   * On the server every inbound message has its `userId` REPLACED by
   * `context.from` — the wallet the transport verified — before the reducer
   * sees it. A client can still put anybody's id in the body; it simply stops
   * meaning anything. This is the thing the serverless build cannot do at all,
   * because there a peer's claim about who it is IS the only evidence there is.
   */
  trustSenderOverBody?: boolean
}

export function createPunchRoomBus(options: PunchRoomBusOptions): PunchCompetitionBus {
  const trustSender = options.trustSenderOverBody ?? options.isServer
  const handlers = new Map<string, Array<(message: never) => void>>()
  const pending: Array<{ event: string; body: string }> = []
  let flushedOnce = false

  if (!options.isServer) {
    engine.addSystem(() => {
      if (!roomWillTransmit() || pending.length === 0) return
      const batch = pending.splice(0, pending.length)
      if (!flushedOnce) {
        flushedOnce = true
        console.log(`[CLIENT] punch room ready, flushing ${batch.length} frame(s)`)
      }
      for (const frame of batch) punchRoom.send(PUNCH_ROOM_CHANNEL, frame)
    })
  }

  punchRoom.onMessage(PUNCH_ROOM_CHANNEL, (data: { event: string; body: string }, context?: { from?: string }) => {
    framesIn += 1
    if (context?.from) lastFrom = context.from.toLowerCase()
    const list = handlers.get(data?.event ?? '')
    if (!list || list.length === 0) return
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(data.body ?? '{}') as Record<string, unknown>
    } catch {
      // A body that will not parse is a forged or truncated frame. Dropping it
      // is the whole response: there is no partial punch worth reconstructing,
      // and throwing here would take the server's message loop down with it.
      return
    }
    if (trustSender && context?.from) parsed.userId = context.from.toLowerCase()
    for (const handler of list) handler(parsed as never)
  })

  return {
    on(event: string, handler: (message: never) => void): unknown {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
      return handler
    },
    emit(event: string, message: never): void {
      const body = JSON.stringify(message)
      if (body.length > PUNCH_ROOM_MAX_BYTES) {
        // ‼️SAY IT OUT LOUD. The transport drops an oversize frame in SILENCE,
        // which is how a scene stops responding with nothing in the logs. If
        // this ever fires, the snapshot has outgrown the wire and the fix is to
        // trim what rides the heartbeat — not to raise the cap toward 13 KB,
        // which is the point at which it starts failing invisibly again.
        if (!oversizeReported.has(event)) {
          oversizeReported.add(event)
          console.error(`[punch] room frame too large, dropped: ${event} ${body.length}b > ${PUNCH_ROOM_MAX_BYTES}b`)
        }
        return
      }
      const frame = { event, body }
      // Always hand the frame to the SDK Room. It queues until ready; holding
      // it here until BOTH isReady and isStateSyncronized froze HIGHGROUND
      // on WAKING with score 000 (2026-09-10). Pending is a second flush for
      // the moment the room actually comes up.
      punchRoom.send(PUNCH_ROOM_CHANNEL, frame)
      if (!options.isServer && !roomWillTransmit()) {
        if (pending.length >= 32) pending.shift()
        pending.push(frame)
      }
    }
  }
}
