/** Lightweight proximity actions: edge-triggered once per zone crossing. */

import { engine, Transform } from '@dcl/sdk/ecs'
import { pointInFloorZone } from '@shared/floor-zone-hit'
import { SITE_FLOOR_INDEX } from '@shared/floor-props'
import { sceneToGlbLocal } from '@shared/dcl-placement'
import { proximityTriggerCrossings } from '@shared/proximity-trigger'
import type { RuntimeFloorZone } from '@shared/scene-runtime-config'
import { playProximityMedia } from './media'
import { getRuntimeContext, getRuntimeFloorZones } from './runtime-context'

let inside = new Set<string>()
let initialized = false

function nearestFloor(y: number): number {
  const floors = getRuntimeContext()?.floors ?? []
  if (!floors.length) return 0
  return floors.reduce(
    (best, floor) =>
      Math.abs(y - floor.y) < Math.abs(y - best.y) ? floor : best,
    floors[0]!
  ).floor
}

function coversFloor(zone: RuntimeFloorZone, floor: number): boolean {
  return zone.floorIndex === SITE_FLOOR_INDEX ? floor === 0 : zone.floorIndex === floor
}

function zoneTriggerSystem(): void {
  const player = Transform.getOrNull(engine.PlayerEntity)
  const context = getRuntimeContext()
  if (!player || !context) return
  const origin = context.modelOrigin ?? { x: 8, y: 0, z: 8 }
  const local = sceneToGlbLocal(origin, player.position.x, player.position.z)
  const floor = nearestFloor(player.position.y)
  const current = new Set<string>()
  const byId = new Map<string, RuntimeFloorZone>()
  for (const zone of getRuntimeFloorZones()) {
    if (!zone.trigger?.enabled || !coversFloor(zone, floor)) continue
    byId.set(zone.id, zone)
    if (pointInFloorZone(local.x, local.z, zone.shape)) current.add(zone.id)
  }
  const crossing = proximityTriggerCrossings(inside, current)
  inside = crossing.inside
  for (const id of crossing.entered) {
    const trigger = byId.get(id)?.trigger
    if (trigger) playProximityMedia(trigger.action, trigger.targetId)
  }
}

export function initZoneTriggers(): void {
  if (initialized) return
  initialized = true
  engine.addSystem(zoneTriggerSystem)
}
