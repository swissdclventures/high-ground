/**
 * Punch bus over HTTPS. Same rows on desktop and mobile, whether or not DCL
 * ever puts them in one scene room.
 *
 * ‼️A BUS DOES NOT LOOP BACK. The reducer handles locally and then emit()s —
 * echoing here would double every join and punch.
 */
import { engine } from '@dcl/sdk/ecs'
import type { PunchBoardStoreConfig } from '@shared/punch-board-store'
import {
  punchLiveActionReadUrl,
  punchLiveActionWriteUrl,
  punchLiveEnabled,
  punchLiveHeaders,
  punchLiveStateReadUrl,
  punchLiveStateWriteUrl,
  punchLiveVenue,
  parsePunchLiveActionRows,
  parsePunchLiveStateRows
} from '@shared/punch-live-store'
import type { PunchCompetitionBus } from './punch-machine-network'

const STATE_EVENT = 'punch.state'
const POLL_INTERVAL_S = 0.35

export type PunchHttpFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export interface PunchHttpBus extends PunchCompetitionBus {
  bindUser(userId: string, sessionId?: string): void
  /** One read of state + new actions. Tests call this; the scene polls it. */
  pull(): void
  diagnostics(): {
    enabled: boolean
    framesIn: number
    /** Own posts that came back. A live host with no other punch clients still hears these. */
    echoes: number
    lastActionId: number
    lastError: string
  }
}

export interface PunchHttpBusOptions {
  config: PunchBoardStoreConfig
  fetch?: PunchHttpFetch
  now?: () => number
}

export function createPunchHttpBus(options: PunchHttpBusOptions): PunchHttpBus {
  const config = options.config
  const doFetch = options.fetch ?? (fetch as PunchHttpFetch)
  const clock = options.now ?? Date.now
  const handlers = new Map<string, Array<(message: never) => void>>()
  let me = ''
  /** This Explorer session, not the wallet. Same wallet on two devices is two sessions. */
  let sessionId = ''
  let lastActionId = 0
  let pulling = false
  let framesIn = 0
  let echoes = 0
  let lastError = ''
  const seenState = new Map<string, number>()

  function sessionOf(message: unknown): string {
    if (!message || typeof message !== 'object') return ''
    const value = (message as { sessionId?: unknown }).sessionId
    return typeof value === 'string' ? value : ''
  }

  /**
   * Skip THIS device's own echo. Do not skip another Explorer signed in as the
   * same wallet — that is a second client, and swallowing it is how a phone
   * plays a private game while the desktop is the body everybody else can see.
   */
  function isOwnEcho(message: unknown, sender: string): boolean {
    const sid = sessionOf(message)
    if (sessionId && sid) return sid === sessionId
    return Boolean(me && sender && sender === me)
  }

  function deliver(event: string, message: unknown, sender: string): void {
    if (isOwnEcho(message, sender)) {
      echoes += 1
      return
    }
    const list = handlers.get(event)
    if (!list || list.length === 0) return
    framesIn += 1
    for (const handler of list) handler(message as never)
  }

  function post(url: string, body: unknown, extra?: Record<string, string>): void {
    if (!punchLiveEnabled(config)) return
    doFetch(url, {
      method: 'POST',
      headers: { ...punchLiveHeaders(config), ...extra },
      body: JSON.stringify(body)
    }).then((response) => {
      if (!response.ok) lastError = `post ${response.status}`
    }).catch((error: unknown) => {
      lastError = `post ${String(error)}`
    })
  }

  function emit(event: string, message: never): void {
    if (!punchLiveEnabled(config) || !event) return
    const payload = (message && typeof message === 'object' ? message : {}) as Record<string, unknown>
    if (sessionId && typeof payload.sessionId !== 'string') payload.sessionId = sessionId
    const machineId = typeof payload.machineId === 'string' ? payload.machineId : ''
    const sender = (
      typeof payload.userId === 'string' ? payload.userId : typeof payload.coordinatorId === 'string' ? payload.coordinatorId : me
    ).trim().toLowerCase()
    const sentAt = Number(payload.sentAt) || clock()
    if (event === STATE_EVENT) {
      const snapshot = payload.snapshot && typeof payload.snapshot === 'object'
        ? { ...(payload.snapshot as Record<string, unknown>) }
        : { ...payload }
      const revision = Number((snapshot as { revision?: unknown }).revision) || 0
      snapshot.wireSessionId = payload.sessionId ?? sessionId
      snapshot.wireStartedAt = Number(payload.startedAt) || sentAt
      post(
        punchLiveStateWriteUrl(config),
        [{
          venue: punchLiveVenue(config),
          machine_id: machineId,
          coordinator_id: sender,
          sent_at: sentAt,
          revision,
          body: snapshot
        }],
        { Prefer: 'resolution=merge-duplicates,return=minimal' }
      )
      return
    }
    post(punchLiveActionWriteUrl(config), [{
      venue: punchLiveVenue(config),
      machine_id: machineId,
      sender,
      event,
      sent_at: sentAt,
      body: payload
    }])
  }

  function ingestState(payload: unknown): void {
    for (const row of parsePunchLiveStateRows(payload)) {
      const prev = seenState.get(row.machine_id) ?? -1
      if (row.revision <= prev) continue
      seenState.set(row.machine_id, row.revision)
      const raw = row.body && typeof row.body === 'object' ? { ...(row.body as Record<string, unknown>) } : {}
      const sessionIdOnWire = typeof raw.wireSessionId === 'string' ? raw.wireSessionId : ''
      const startedAt = Number(raw.wireStartedAt) || Number(raw.roundStartedAt) || row.sent_at
      delete raw.wireSessionId
      delete raw.wireStartedAt
      deliver(STATE_EVENT, {
        machineId: row.machine_id,
        coordinatorId: row.coordinator_id,
        sentAt: row.sent_at,
        startedAt,
        sessionId: sessionIdOnWire,
        snapshot: raw
      }, row.coordinator_id)
    }
  }

  function ingestActions(payload: unknown): void {
    for (const row of parsePunchLiveActionRows(payload)) {
      if (row.id > lastActionId) lastActionId = row.id
      if (row.event === STATE_EVENT) continue
      deliver(row.event, row.body, row.sender)
    }
  }

  function pull(): void {
    if (!punchLiveEnabled(config) || pulling) return
    pulling = true
    Promise.all([
      doFetch(punchLiveStateReadUrl(config), { method: 'GET', headers: punchLiveHeaders(config) }).then((response) => {
        if (!response.ok) throw new Error(`state ${response.status}`)
        return response.json()
      }),
      doFetch(punchLiveActionReadUrl(config, lastActionId), { method: 'GET', headers: punchLiveHeaders(config) }).then((response) => {
        if (!response.ok) throw new Error(`action ${response.status}`)
        return response.json()
      })
    ])
      .then(([statePayload, actionPayload]) => {
        // Hellos first so a late joiner elects the same host before the snapshot.
        ingestActions(actionPayload)
        ingestState(statePayload)
        lastError = ''
      })
      .catch((error: unknown) => {
        lastError = String(error)
      })
      .then(() => {
        pulling = false
      })
  }

  return {
    on(event: string, handler: (message: never) => void): unknown {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
      return handler
    },
    emit,
    bindUser(userId: string, sid?: string): void {
      me = userId.trim().toLowerCase()
      if (sid) sessionId = sid.trim()
    },
    pull,
    diagnostics: () => ({
      enabled: punchLiveEnabled(config),
      framesIn,
      echoes,
      lastActionId,
      lastError
    })
  }
}

let polling: PunchHttpBus | null = null

/** Scene-only. Tests never call this — they `pull()` by hand. */
export function startPunchHttpPolling(bus: PunchHttpBus): void {
  if (polling === bus) return
  polling = bus
  bus.pull()
  let acc = 0
  engine.addSystem((dt: number) => {
    acc += dt
    if (acc < POLL_INTERVAL_S) return
    acc = 0
    bus.pull()
  })
}

export function punchHttpDiagnostics(): {
  enabled: boolean
  framesIn: number
  echoes: number
  lastActionId: number
  lastError: string
} {
  return polling?.diagnostics() ?? { enabled: false, framesIn: 0, echoes: 0, lastActionId: 0, lastError: '' }
}

export function punchHttpBindUser(userId: string, sid?: string): void {
  polling?.bindUser(userId, sid)
}
