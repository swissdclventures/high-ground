/**
 * Swissverse World Map — installable top-right HUD implementation.
 *
 * All inventory and Federation data comes from ctx.mapData. This plugin owns
 * presentation only, which is the seam third-party maps implement against.
 */
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine } from '@dcl/sdk/ecs'
import {
  DEFAULT_MAP_LEVEL,
  mapLevelDown,
  mapLevelUp,
  type MapDataHostApi,
  type MapFederationWorld,
  type MapLevel,
  type MapParcel,
  type MapRect,
  type MapSceneRecord,
} from '@shared/map-data-contract'
import { normalizeWorldMapAppConfig } from '@shared/world-map-contract'
import { HUD } from '../social/hud-layout'
import { UI, panelBg, screenLayer } from '../ui-kit'
import { getActivePanel } from '../social/panel-state'
import {
  isMinimapOpen,
  minimapVisibilityVersion,
  revealMinimapAfterBoot,
  toggleMinimap,
} from '../social/minimap-visibility'
import { getSpeakeasyState, getSpeakeasyTick } from '../speakeasy/state'
import { afterBoot, BOOT_PACE } from '../boot-pace'
import type { ScenePluginContext } from './types'

const PARCEL_M = 16
const MAP_PX = 150
const MAP_COLLAPSED_PX = 52
const CONTROL_SIZE = 16

const PLOT_BG = Color4.create(0.06, 0.07, 0.10, 0.84)
const OTHER_SCENE = Color4.create(1, 1, 1, 0.20)
const THIS_SCENE = Color4.create(0.42, 0.72, 0.95, 0.5)
const BUILDING_TILE = Color4.create(0.42, 0.72, 0.95, 0.85)
const OTHER_BUILDING = Color4.create(1, 1, 1, 0.62)
const FEDERATION_WORLD = Color4.create(0.55, 0.44, 0.92, 0.72)
const FEDERATION_CURRENT = Color4.create(0.42, 0.82, 0.95, 0.94)
const YOU = Color4.create(1, 0.83, 0.3, 1)

let tick = 0
let acc = 0
let installed = false
let systemInstalled = false
let mapData: MapDataHostApi | null = null
let level: MapLevel = DEFAULT_MAP_LEVEL

export function worldMapSystem(dt: number): void {
  acc += dt
  if (acc >= 0.16) {
    acc = 0
    tick += 1
  }
}

export function currentWorldMapLevel(): MapLevel {
  return level
}

export function setWorldMapLevel(next: MapLevel): void {
  if (level === next) return
  level = next
  tick += 1
}

export function worldMapPluginEnabled(): boolean {
  return installed
}

export function startWorldMapPlugin(ctx: ScenePluginContext): void {
  const config = normalizeWorldMapAppConfig(ctx.social.apps.worldMap)
  if (!config.enabled) return
  installed = true
  level = config.defaultLevel
  mapData = ctx.mapData
  if (!systemInstalled) {
    engine.addSystem(worldMapSystem)
    systemInstalled = true
  }
  afterBoot(BOOT_PACE.minimapFetchS, 'map-data inventory', () => {
    void mapData?.load()
  })
  afterBoot(BOOT_PACE.minimapOpenS, 'world-map reveal', revealMinimapAfterBoot)
}

function heading(dx: number, dy: number): string {
  const ns = dy > 0.5 ? 'N' : dy < -0.5 ? 'S' : ''
  const ew = dx > 0.5 ? 'E' : dx < -0.5 ? 'W' : ''
  return `${ns}${ew}` || 'here'
}

function worldHint(me: MapParcel | null, scenes: readonly MapSceneRecord[]): string {
  if (!me) return ''
  let best: { distance: number; x: number; y: number } | null = null
  for (const scene of scenes) {
    if (scene.isCurrent || !scene.parcels.length) continue
    const x = scene.parcels.reduce((sum, parcel) => sum + parcel.x, 0) / scene.parcels.length
    const y = scene.parcels.reduce((sum, parcel) => sum + parcel.y, 0) / scene.parcels.length
    const distance = Math.hypot(x - me.x, y - me.y)
    if (!best || distance < best.distance) best = { distance, x, y }
  }
  return best
    ? `nearest: ${heading(best.x - me.x, best.y - me.y)} ${Math.round(best.distance * PARCEL_M)}m`
    : ''
}

function federationInitials(world: MapFederationWorld): string {
  const words = world.title.replace(/\.dcl\.eth$/i, '').trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : words[0]?.slice(0, 2) || 'W').toUpperCase()
}

export function WorldMapRoot() {
  void tick
  void minimapVisibilityVersion()
  void mapData?.version()
  void getSpeakeasyTick()
  if (!installed || !mapData || getSpeakeasyState().inside) return null
  if (getActivePanel() !== 'none') return null

  const snapshot = mapData.snapshot()
  const mapOpen = isMinimapOpen()
  const me = mapData.playerWorldParcel()
  const scenes = level === 'scene'
    ? snapshot.scene ? [snapshot.scene] : []
    : level === 'world'
      ? snapshot.world?.scenes ?? []
      : []
  const federationWorlds: MapFederationWorld[] = level === 'federation'
    ? snapshot.federation?.worlds.length
      ? snapshot.federation.worlds
      : snapshot.world
        ? [{
            id: 'current-world',
            worldName: snapshot.world.worldName ?? 'This World',
            title: snapshot.world.worldName ?? 'This World',
            x: 0,
            y: 0,
            sceneCount: snapshot.world.scenes.length,
            parcelCount: snapshot.world.scenes.reduce((sum, scene) => sum + scene.parcels.length, 0),
            isCurrent: true,
          }]
        : []
    : []
  if (!scenes.length && !federationWorlds.length) return null

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  if (level === 'federation') {
    for (const world of federationWorlds) {
      minX = Math.min(minX, world.x)
      maxX = Math.max(maxX, world.x + 1)
      minY = Math.min(minY, world.y)
      maxY = Math.max(maxY, world.y + 1)
    }
  } else {
    for (const scene of scenes) {
      for (const parcel of scene.parcels) {
        minX = Math.min(minX, parcel.x)
        maxX = Math.max(maxX, parcel.x + 1)
        minY = Math.min(minY, parcel.y)
        maxY = Math.max(maxY, parcel.y + 1)
      }
    }
    if (me) {
      minX = Math.min(minX, me.x)
      maxX = Math.max(maxX, me.x)
      minY = Math.min(minY, me.y)
      maxY = Math.max(maxY, me.y)
    }
  }

  const mapPx = mapOpen ? MAP_PX : MAP_COLLAPSED_PX
  const scale = (mapPx - 8) / Math.max(1, maxX - minX, maxY - minY)
  const parcelPx = (parcel: MapParcel): { left: number; top: number } => ({
    left: 4 + (parcel.x - minX) * scale,
    top: 4 + (maxY - parcel.y) * scale,
  })
  const federationPx = (world: MapFederationWorld): { left: number; top: number } => ({
    left: 4 + (world.x - minX) * scale,
    top: 4 + (world.y - minY) * scale,
  })

  const tiles: ReactEcs.JSX.Element[] = []
  const block = (rect: MapRect, color: typeof YOU, key: string): void => {
    const at = parcelPx({ x: rect.x0, y: rect.y1 })
    tiles.push(
      <UiEntity
        key={key}
        uiTransform={{
          positionType: 'absolute',
          position: { left: at.left, top: at.top },
          width: Math.max(2, (rect.x1 - rect.x0) * scale),
          height: Math.max(2, (rect.y1 - rect.y0) * scale),
        }}
        uiBackground={{ color }}
      />,
    )
  }

  if (level === 'federation') {
    federationWorlds.forEach((world) => {
      const at = federationPx(world)
      const size = Math.max(8, scale * 0.86)
      tiles.push(
        <UiEntity
          key={`f_${world.id}`}
          uiTransform={{
            positionType: 'absolute',
            position: { left: at.left + (scale - size) / 2, top: at.top + (scale - size) / 2 },
            width: size,
            height: size,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          uiBackground={{ color: world.isCurrent ? FEDERATION_CURRENT : FEDERATION_WORLD }}
        >
          {mapOpen && size >= 18 ? (
            <Label value={federationInitials(world)} fontSize={Math.min(10, size * 0.35)} color={UI.text} />
          ) : null}
        </UiEntity>,
      )
    })
  } else {
    scenes.forEach((scene, sceneIndex) => {
      scene.land.forEach((rect, index) =>
        block(rect, scene.isCurrent ? THIS_SCENE : OTHER_SCENE, `l${sceneIndex}_${index}`),
      )
    })
    scenes.forEach((scene, sceneIndex) => {
      scene.buildings.forEach((rect, index) =>
        block(rect, scene.isCurrent ? BUILDING_TILE : OTHER_BUILDING, `b${sceneIndex}_${index}`),
      )
    })
    if (me) {
      const at = parcelPx(me)
      const size = mapOpen ? 7 : 5
      tiles.push(
        <UiEntity
          key="you"
          uiTransform={{
            positionType: 'absolute',
            position: { left: at.left - size / 2, top: at.top - size / 2 },
            width: size,
            height: size,
          }}
          uiBackground={{ color: YOU }}
        />,
      )
    }
  }

  const up = mapLevelUp(level)
  const down = mapLevelDown(level)
  const coords = me ? `${Math.round(me.x)},${Math.round(me.y)}` : '…'
  const detail = level === 'scene'
    ? `SCENE · ${coords}`
    : level === 'world'
      ? [`WORLD · ${coords}`, worldHint(me, scenes)].filter(Boolean).join(' · ')
      : `FEDERATION · ${snapshot.federation?.name ?? 'unavailable'}`
  const pad = mapOpen ? 8 : 6

  return (
    <UiEntity uiTransform={screenLayer('top-right')}>
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: HUD.minimap.top, right: HUD.right },
          flexDirection: 'column',
          alignItems: 'flex-end',
        }}
      >
        <UiEntity
          uiTransform={{
            width: mapPx + pad * 2,
            flexDirection: 'column',
            alignItems: 'center',
            padding: { top: pad, right: pad, bottom: mapOpen ? 6 : pad, left: pad },
            pointerFilter: 'block',
          }}
          uiBackground={panelBg(UI.panel)}
          onMouseDown={mapOpen ? undefined : toggleMinimap}
        >
          <UiEntity
            uiTransform={{ width: mapPx, height: mapPx, positionType: 'relative' }}
            uiBackground={panelBg(PLOT_BG)}
          >
            {tiles}
            {mapOpen ? (
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: 2, left: 2 },
                  width: CONTROL_SIZE,
                  flexDirection: 'column',
                }}
              >
                <UiEntity
                  uiTransform={{ width: CONTROL_SIZE, height: CONTROL_SIZE, justifyContent: 'center', alignItems: 'center', pointerFilter: up ? 'block' : 'none', margin: { bottom: 2 } }}
                  uiBackground={panelBg(up ? UI.raisedStrong : UI.raised)}
                  onMouseDown={up ? () => setWorldMapLevel(up) : undefined}
                >
                  <Label value="↑" fontSize={12} color={up ? UI.accent : UI.textDim} />
                </UiEntity>
                <UiEntity
                  uiTransform={{ width: CONTROL_SIZE, height: CONTROL_SIZE, justifyContent: 'center', alignItems: 'center', pointerFilter: down ? 'block' : 'none' }}
                  uiBackground={panelBg(down ? UI.raisedStrong : UI.raised)}
                  onMouseDown={down ? () => setWorldMapLevel(down) : undefined}
                >
                  <Label value="↓" fontSize={12} color={down ? UI.accent : UI.textDim} />
                </UiEntity>
              </UiEntity>
            ) : null}
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { top: 2, right: 2 },
                width: CONTROL_SIZE,
                height: CONTROL_SIZE,
                justifyContent: 'center',
                alignItems: 'center',
                pointerFilter: 'block',
              }}
              uiBackground={panelBg(mapOpen ? UI.raisedStrong : UI.raised)}
              onMouseDown={mapOpen ? toggleMinimap : undefined}
            >
              <Label value={mapOpen ? '▲' : '▼'} fontSize={11} color={UI.accent} />
            </UiEntity>
          </UiEntity>
          {mapOpen ? (
            <UiEntity uiTransform={{ width: '100%', height: 16, justifyContent: 'center' }}>
              <Label value={detail} fontSize={9} color={UI.textDim} />
            </UiEntity>
          ) : null}
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
