/**
 * Sibling scenes in this World — the way out of a locked door that is not
 * Genesis City.
 */
import { changeRealm, teleportTo } from '~system/RestrictedActions'
import type { MapDataHostApi } from '@shared/map-data-contract'
import type { SceneRuntimeConfig } from '@shared/scene-runtime-config'
import {
  destinationsForClosedScene,
  truncateDestTitle,
  worldSceneRealmUrl,
  type WorldSceneDest
} from '@shared/world-transit-contract'
import { mapDataHost } from './map-data-host'
import { currentRealmUrl, markWorldHop } from './world-session'

export type WorldDestStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

let status: WorldDestStatus = 'idle'
let destinations: WorldSceneDest[] = []
let inWorld = true
let loading: Promise<void> | null = null

export function worldDestSnapshot(): {
  status: WorldDestStatus
  destinations: WorldSceneDest[]
  inWorld: boolean
} {
  return { status, destinations, inWorld }
}

export function ensureWorldDestinations(): void {
  if (status === 'ready' || status === 'unavailable') return
  if (loading) return
  const api = mapDataHost()
  if (!api) {
    status = 'unavailable'
    return
  }
  status = 'loading'
  loading = api
    .load()
    .then((snap) => {
      inWorld = Boolean(snap.world?.worldName)
      const scenes = (snap.world?.scenes ?? []).map((scene) => ({
        id: scene.id,
        title: scene.title,
        base: scene.base,
        parcels: scene.parcels,
        access: scene.access ?? 'open',
        isCurrent: scene.isCurrent
      }))
      destinations = destinationsForClosedScene(scenes)
      status = snap.world ? 'ready' : 'unavailable'
    })
    .catch(() => {
      status = 'unavailable'
      destinations = []
    })
    .finally(() => {
      loading = null
    })
}

export function destButtonLabel(scene: WorldSceneDest): string {
  return `GO TO ${truncateDestTitle(scene.title).toUpperCase()}`
}

export function travelToWorldDest(scene: WorldSceneDest): void {
  markWorldHop(scene.base)
  const realm = currentRealmUrl()
  if (inWorld && realm) {
    void changeRealm({
      realm: worldSceneRealmUrl(realm, scene.base)
    })
    return
  }
  // Genesis City: teleportTo is the real coordinate space.
  void teleportTo({ worldCoordinates: { x: scene.base.x, y: scene.base.y } })
}

/** Last resort when this World has no other open scene. Honest about the destination. */
export function leaveToGenesisCity(): void {
  void teleportTo({ worldCoordinates: { x: 0, y: 0 } })
}

export function startWorldDestinations(_mapData: MapDataHostApi, config: SceneRuntimeConfig): void {
  inWorld = config.destination !== 'genesis' && Boolean(config.worldName)
  ensureWorldDestinations()
}
