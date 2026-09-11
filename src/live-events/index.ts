import {
  engine,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  pointerEventsSystem,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { changeRealm, teleportTo } from '~system/RestrictedActions'
import type { LiveEventsBoardConfig } from '@shared/live-events-board-contract'

const EVENTS_API = 'https://events.decentraland.org/api/events'

interface DclEvent {
  id: string
  name: string
  live?: boolean
  world?: boolean
  server?: string | null
  coordinates?: number[]
  position?: number[]
  x?: number
  y?: number
}

interface EventsResponse {
  ok?: boolean
  data?: DclEvent[]
}

function compactTitle(value: string): string {
  const oneLine = value.replace(/\s+/g, ' ').trim()
  return oneLine.length > 62 ? `${oneLine.slice(0, 59)}…` : oneLine
}

function destination(event: DclEvent): { world?: string; x?: number; y?: number } {
  const coords = event.coordinates ?? event.position
  if (event.world && event.server) return { world: event.server }
  return {
    x: Number(coords?.[0] ?? event.x),
    y: Number(coords?.[1] ?? event.y)
  }
}

export function initLiveEventsBoard(config: LiveEventsBoardConfig): void {
  if (!config.enabled) return

  const rotation = Quaternion.fromEulerDegrees(0, config.placement.yawDeg, 0)
  const board = engine.addEntity()
  Transform.create(board, {
    position: Vector3.create(config.placement.x, config.placement.y, config.placement.z),
    rotation,
    scale: Vector3.create(5.2, 3.1, 0.16)
  })
  MeshRenderer.setBox(board)
  MeshCollider.setBox(board)
  Material.setPbrMaterial(board, {
    albedoColor: Color4.create(0.025, 0.035, 0.055, 1),
    metallic: 0.35,
    roughness: 0.5,
    emissiveColor: Color4.create(0.05, 0.15, 0.3, 1),
    emissiveIntensity: 0.6
  })

  const angle = (config.placement.yawDeg * Math.PI) / 180
  const label = engine.addEntity()
  Transform.create(label, {
    position: Vector3.create(
      config.placement.x + Math.sin(angle) * 0.1,
      config.placement.y,
      config.placement.z + Math.cos(angle) * 0.1
    ),
    rotation,
    scale: Vector3.create(0.28, 0.28, 0.28)
  })
  TextShape.create(label, {
    text: 'LIVE EVENTS\n\nLoading Decentraland events…',
    fontSize: 3,
    textColor: Color4.White(),
    outlineColor: Color4.create(0.02, 0.05, 0.12, 1),
    outlineWidth: 0.12
  })

  let events: DclEvent[] = []
  let active = 0
  let cycleElapsed = 0
  let refreshElapsed = 0
  let fetching = false

  const updateLabel = (): void => {
    const current = events[active]
    TextShape.getMutable(label).text = current
      ? `${current.live ? 'LIVE NOW' : 'UPCOMING'}  ·  ${active + 1}/${events.length}\n\n${compactTitle(current.name)}\n\nClick board to travel`
      : 'LIVE EVENTS\n\nNo events available right now.\nThe board will refresh automatically.'
  }

  const refresh = async (): Promise<void> => {
    if (fetching) return
    fetching = true
    try {
      const response = await fetch(`${EVENTS_API}?limit=${Math.max(10, config.limit * 3)}`)
      if (!response.ok) throw new Error(`Events API ${response.status}`)
      const payload = (await response.json()) as EventsResponse
      const available = (payload.data ?? []).filter((event) => Boolean(event.name))
      const live = available.filter((event) => event.live === true)
      events = (config.onlyLive && live.length > 0 ? live : available).slice(0, config.limit)
      active = 0
      updateLabel()
    } catch (error) {
      console.log('[live-events] fetch failed', error)
      TextShape.getMutable(label).text = 'LIVE EVENTS\n\nEvents service unavailable.\nTrying again shortly.'
    } finally {
      fetching = false
    }
  }

  pointerEventsSystem.onPointerDown(
    {
      entity: board,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: 'Travel to displayed event',
        maxDistance: 10
      }
    },
    () => {
      const event = events[active]
      if (!event) return
      const target = destination(event)
      if (target.world) {
        void changeRealm({ realm: target.world })
      } else if (Number.isFinite(target.x) && Number.isFinite(target.y)) {
        void teleportTo({ worldCoordinates: { x: target.x!, y: target.y! } })
      }
    }
  )

  engine.addSystem((dt) => {
    cycleElapsed += dt
    refreshElapsed += dt
    if (events.length > 1 && cycleElapsed >= 8) {
      cycleElapsed = 0
      active = (active + 1) % events.length
      updateLabel()
    }
    if (refreshElapsed >= config.refreshSeconds) {
      refreshElapsed = 0
      void refresh()
    }
  })

  void refresh()
}
