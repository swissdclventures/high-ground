/**
 * Host-owned implementation of the read-only map-data API.
 *
 * This module knows content-server and Atlas endpoints. Map plugins do not.
 * It performs no work until a plugin calls `load()`.
 */
import { engine, Transform } from '@dcl/sdk/ecs'
import { getRealm, getSceneInformation } from '~system/Runtime'
import type { PublicAtlasSnapshot } from '@shared/atlas-contract'
import {
  DEFAULT_MAP_DATA_API_BASE,
  MAP_DATA_HOST_API_ID,
  type MapDataHostApi,
  type MapDataSnapshot,
  type MapFederationSnapshot,
  type MapParcel,
  type MapRect,
  type MapSceneRecord,
  type MapWorldSnapshot,
} from '@shared/map-data-contract'
import type { SceneRuntimeConfig } from '@shared/scene-runtime-config'
import { sceneAccessKindFromBuildingConfig } from '@shared/world-transit-contract'
import { footprintRects, mergeRows, parseParcel } from './social/minimap-geometry'

const PARCEL_M = 16

function emptySnapshot(): MapDataSnapshot {
  return { status: 'idle', scene: null, world: null, federation: null, errors: [] }
}

function parcelKey(parcels: readonly MapParcel[]): string {
  return parcels.map((p) => `${p.x},${p.y}`).sort().join('|')
}

function normalizedWorldName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\.dcl\.eth$/i, '')
}

/** Bounded concurrency so entering a World does not stampede its content server. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++
      out[index] = await fn(items[index]!)
    }
  }
  if (!items.length) return out
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}

async function fetchBuildingPayload(
  root: string,
  content: Array<{ file?: unknown; hash?: unknown }> | undefined,
  anchorX: number,
  anchorY: number,
): Promise<{ buildings: MapRect[]; access: MapSceneRecord['access'] }> {
  try {
    const entry = (content ?? []).find((row) => row?.file === 'assets/building-config.json')
    const hash = typeof entry?.hash === 'string' ? entry.hash : ''
    if (!hash) return { buildings: [], access: 'open' }
    const response = await fetch(`${root}/contents/${hash}`)
    if (!response.ok) return { buildings: [], access: 'open' }
    const json = await response.json()
    return {
      buildings: footprintRects(json, anchorX, anchorY),
      access: sceneAccessKindFromBuildingConfig(json)
    }
  } catch {
    return { buildings: [], access: 'open' }
  }
}

function federationFromAtlas(
  atlas: PublicAtlasSnapshot,
  currentWorldName: string | null,
): MapFederationSnapshot | null {
  const current = atlas.worlds.find(
    (world) => normalizedWorldName(world.worldName) === normalizedWorldName(currentWorldName),
  )
  if (!current) return null
  const membership = atlas.memberships.find(
    (row) => row.worldId === current.id && row.status === 'ACTIVE',
  )
  if (!membership) return null
  const federation = atlas.federations.find((row) => row.id === membership.federationId)
  if (!federation) return null
  const worldsById = new Map(atlas.worlds.map((world) => [world.id, world]))
  const worlds = atlas.memberships
    .filter((row) => row.federationId === federation.id && row.status === 'ACTIVE')
    .flatMap((row) => {
      const world = worldsById.get(row.worldId)
      if (!world) return []
      return [{
        id: world.id,
        worldName: world.worldName,
        title: world.title?.trim() || world.worldName,
        x: row.x,
        y: row.y,
        sceneCount: world.sceneCount,
        parcelCount: world.parcelCount,
        isCurrent: world.id === current.id,
      }]
    })
  return { id: federation.id, name: federation.name, worlds }
}

async function readSceneParcels(): Promise<{ base: MapParcel | null; parcels: MapParcel[] }> {
  try {
    const info = await getSceneInformation({})
    const meta = JSON.parse(info.metadataJson ?? '{}') as {
      scene?: { base?: unknown; parcels?: unknown }
    }
    const base = parseParcel(meta.scene?.base)
    const parcels = Array.isArray(meta.scene?.parcels)
      ? meta.scene.parcels.map(parseParcel).filter((p): p is MapParcel => p !== null)
      : []
    return { base, parcels }
  } catch (error) {
    throw new Error(`scene identity unavailable: ${error instanceof Error ? error.message : String(error)}`)
  }
}

let registered: MapDataHostApi | null = null

export function mapDataHost(): MapDataHostApi | null {
  return registered
}

export function createMapDataHostApi(config: SceneRuntimeConfig): MapDataHostApi {
  let current = emptySnapshot()
  let revision = 0
  let currentBase: MapParcel | null = null
  let request: Promise<MapDataSnapshot> | null = null

  const api: MapDataHostApi = {
    id: MAP_DATA_HOST_API_ID,
    snapshot: () => current,
    version: () => revision,
    playerWorldParcel: () => {
      const transform = Transform.getOrNull(engine.PlayerEntity)
      if (!transform || !currentBase) return null
      return {
        x: currentBase.x + transform.position.x / PARCEL_M,
        y: currentBase.y + transform.position.z / PARCEL_M,
      }
    },
    load: () => {
      if (request) return request
      current = { ...current, status: 'loading' }
      revision += 1
      request = (async () => {
        const errors: string[] = []
        let ownParcels: MapParcel[] = []
        try {
          const own = await readSceneParcels()
          currentBase = own.base
          ownParcels = own.parcels
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error))
          currentBase = parseParcel(config.sceneBase)
        }

        let worldName = config.worldName ?? null
        let root: string | null = null
        try {
          const realm = await getRealm({})
          worldName = worldName ?? realm.realmInfo?.realmName ?? null
          const baseUrl = realm.realmInfo?.baseUrl
          if (baseUrl) root = baseUrl.replace(/\/contents\/?$/, '').replace(/\/$/, '')
        } catch (error) {
          errors.push(`realm unavailable: ${error instanceof Error ? error.message : String(error)}`)
        }

        let world: MapWorldSnapshot | null = null
        if (root && worldName) {
          try {
            const response = await fetch(`${root}/world/${encodeURIComponent(worldName)}/scenes`)
            if (!response.ok) throw new Error(`/scenes returned ${response.status}`)
            const listing = (await response.json()) as {
              scenes?: Array<{ entityId?: unknown; status?: unknown }>
            }
            const ids = (listing.scenes ?? []).flatMap((row) =>
              (typeof row.status !== 'string' || row.status === 'DEPLOYED') &&
              typeof row.entityId === 'string' && row.entityId
                ? [row.entityId]
                : [],
            )
            const mineKey = parcelKey(ownParcels)
            const fetched = await mapPool(ids, 2, async (id): Promise<MapSceneRecord | null> => {
              try {
                const entityResponse = await fetch(`${root}/contents/${id}`)
                if (!entityResponse.ok) return null
                const entity = (await entityResponse.json()) as {
                  pointers?: unknown
                  content?: Array<{ file?: unknown; hash?: unknown }>
                  metadata?: { scene?: { parcels?: unknown }; display?: { title?: unknown } }
                }
                const raw = Array.isArray(entity.pointers) && entity.pointers.length
                  ? entity.pointers
                  : Array.isArray(entity.metadata?.scene?.parcels)
                    ? entity.metadata!.scene!.parcels as unknown[]
                    : []
                const parcels = raw.map(parseParcel).filter((p): p is MapParcel => p !== null)
                if (!parcels.length) return null
                const anchorX = Math.min(...parcels.map((p) => p.x))
                const anchorY = Math.min(...parcels.map((p) => p.y))
                const title = entity.metadata?.display?.title
                const payload = await fetchBuildingPayload(root, entity.content, anchorX, anchorY)
                return {
                  id,
                  base: parcels[0]!,
                  parcels,
                  land: mergeRows(parcels),
                  buildings: payload.buildings,
                  title: typeof title === 'string' && title.trim() ? title.trim() : 'Untitled scene',
                  isCurrent: parcelKey(parcels) === mineKey,
                  access: payload.access,
                }
              } catch {
                return null
              }
            })
            const scenes = fetched.filter((scene): scene is MapSceneRecord => scene !== null)
            world = {
              worldName,
              scenes,
              currentSceneId: scenes.find((scene) => scene.isCurrent)?.id ?? null,
            }
          } catch (error) {
            errors.push(`world inventory unavailable: ${error instanceof Error ? error.message : String(error)}`)
          }
        }

        if (!world && ownParcels.length) {
          const anchorX = Math.min(...ownParcels.map((p) => p.x))
          const anchorY = Math.min(...ownParcels.map((p) => p.y))
          const fallback: MapSceneRecord = {
            id: 'current-scene',
            base: ownParcels[0]!,
            parcels: ownParcels,
            land: mergeRows(ownParcels),
            buildings: footprintRects(
              { builtFootprint: config.builtFootprint, buildingOutlines: config.buildingOutlines },
              anchorX,
              anchorY,
            ),
            title: config.buildingName || 'This scene',
            isCurrent: true,
            access: sceneAccessKindFromBuildingConfig(config),
          }
          world = { worldName, scenes: [fallback], currentSceneId: fallback.id }
        }

        let federation: MapFederationSnapshot | null = null
        if (worldName) {
          try {
            const response = await fetch(`${DEFAULT_MAP_DATA_API_BASE}/api/atlas/snapshot`)
            if (!response.ok) throw new Error(`Atlas returned ${response.status}`)
            federation = federationFromAtlas(await response.json() as PublicAtlasSnapshot, worldName)
          } catch (error) {
            errors.push(`federation unavailable: ${error instanceof Error ? error.message : String(error)}`)
          }
        }

        const scene = world?.scenes.find((row) => row.isCurrent) ?? world?.scenes[0] ?? null
        current = {
          status: world ? (errors.length ? 'partial' : 'ready') : 'unavailable',
          scene,
          world,
          federation,
          errors,
        }
        revision += 1
        return current
      })()
      return request
    },
  }
  registered = api
  return api
}
