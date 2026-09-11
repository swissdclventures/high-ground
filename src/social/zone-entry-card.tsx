/** Smooth screen-space neighborhood title shown once per zone crossing. */
import { engine, Transform } from '@dcl/sdk/ecs'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { pointInFloorZone } from '@shared/floor-zone-hit'
import { SITE_FLOOR_INDEX } from '@shared/floor-props'
import { sceneToGlbLocal } from '@shared/dcl-placement'
import type { RuntimeFloorZone } from '@shared/scene-runtime-config'
import {
  zoneEntryCardAlpha,
  zoneEntryCardDurationMs,
  zoneEntryCardUsesLogo,
  type RuntimeZoneEntryCard,
} from '@shared/zone-entry-card'
import { getRuntimeContext, getRuntimeFloorZones } from './runtime-context'

let active: { zoneId: string; card: RuntimeZoneEntryCard; elapsedMs: number } | null = null
let inside = new Set<string>()
let uiTick = 0
let initialized = false

function playerFloorIndex(y: number): number {
  const floors = getRuntimeContext()?.floors ?? []
  if (!floors.length) return 0
  let best = floors[0]!.floor
  let bestDist = Infinity
  for (const floor of floors) {
    const distance = Math.abs(y - floor.y)
    if (distance < bestDist) {
      best = floor.floor
      bestDist = distance
    }
  }
  return best
}

function zoneCoversFloor(zone: RuntimeFloorZone, floor: number): boolean {
  return zone.floorIndex === SITE_FLOOR_INDEX ? floor === 0 : zone.floorIndex === floor
}

function zoneArea(zone: RuntimeFloorZone): number {
  return zone.shape.kind === 'circle'
    ? Math.PI * zone.shape.radius * zone.shape.radius
    : zone.shape.width * zone.shape.depth
}

function show(zone: RuntimeFloorZone): void {
  if (!zone.entryCard) return
  active = { zoneId: zone.id, card: zone.entryCard, elapsedMs: 0 }
  uiTick += 1
}

function zoneEntrySystem(dt: number): void {
  if (active) {
    active.elapsedMs += Math.max(0, dt) * 1000
    if (active.elapsedMs >= zoneEntryCardDurationMs(active.card)) active = null
    uiTick += 1
  }

  const player = Transform.getOrNull(engine.PlayerEntity)
  const context = getRuntimeContext()
  if (!player || !context) return
  const origin = context.modelOrigin ?? { x: 8, y: 0, z: 8 }
  const local = sceneToGlbLocal(origin, player.position.x, player.position.z)
  const floor = playerFloorIndex(player.position.y)
  const nowInside = new Set<string>()
  const entered: RuntimeFloorZone[] = []

  for (const zone of getRuntimeFloorZones()) {
    if (!zone.entryCard || !zoneCoversFloor(zone, floor)) continue
    if (!pointInFloorZone(local.x, local.z, zone.shape)) continue
    nowInside.add(zone.id)
    if (!inside.has(zone.id)) entered.push(zone)
  }
  inside = nowInside

  // Nested named areas are common. The most specific (smallest) newly-entered zone wins.
  entered.sort((a, b) => zoneArea(a) - zoneArea(b))
  if (entered[0]) show(entered[0])
}

export function initZoneEntryCards(): void {
  if (initialized) return
  initialized = true
  engine.addSystem(zoneEntrySystem)
}

function logoSize(card: RuntimeZoneEntryCard): { width: number; height: number } {
  const sourceW = Math.max(1, card.logoWidth ?? 2)
  const sourceH = Math.max(1, card.logoHeight ?? 1)
  const scale = Math.min(520 / sourceW, 210 / sourceH)
  return {
    width: Math.max(80, Math.round(sourceW * scale)),
    height: Math.max(40, Math.round(sourceH * scale)),
  }
}

export function ZoneEntryCardRoot() {
  void uiTick
  if (!active) return null
  const { card, elapsedMs } = active
  const alpha = zoneEntryCardAlpha(card, elapsedMs)
  if (alpha <= 0) return null
  const usesLogo = zoneEntryCardUsesLogo(card.mode) && !!card.logoFile
  const showsText = card.mode !== 'logo'
  const size = logoSize(card)

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        position: { top: 0, left: 0, right: 0, bottom: 0 },
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none',
        zIndex: 230,
      }}
    >
      <UiEntity
        uiTransform={{
          width: 560,
          minHeight: usesLogo ? 220 : 110,
          padding: { left: 20, right: 20, top: 14, bottom: 14 },
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {usesLogo ? (
          <UiEntity
            uiTransform={{ width: size.width, height: size.height, margin: { bottom: showsText ? 10 : 0 } }}
            uiBackground={{
              texture: { src: card.logoFile! },
              textureMode: 'stretch',
              color: Color4.create(1, 1, 1, alpha),
            }}
          />
        ) : null}
        {showsText ? (
          <Label
            value={card.title}
            fontSize={30}
            color={Color4.create(1, 1, 1, alpha)}
            textAlign="middle-center"
            textWrap="wrap"
            uiTransform={{ width: 540, height: 42 }}
          />
        ) : null}
        {showsText && card.subtitle ? (
          <Label
            value={card.subtitle}
            fontSize={15}
            color={Color4.create(0.82, 0.9, 0.98, alpha)}
            textAlign="middle-center"
            textWrap="wrap"
            uiTransform={{ width: 520, height: 30, margin: { top: 4 } }}
          />
        ) : null}
      </UiEntity>
    </UiEntity>
  )
}
