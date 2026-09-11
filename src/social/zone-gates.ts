import { engine, Entity, TextShape, Transform } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { pointInFloorZone } from '@shared/floor-zone-hit'
import { glbLocalToScene, sceneToGlbLocal } from '@shared/dcl-placement'
import { SITE_FLOOR_INDEX } from '@shared/floor-props'
import type { RuntimeFloorZone } from '@shared/scene-runtime-config'
import type { SocialSurfaceConfig } from '@shared/social-surface-contract'
import { getConfiguredSocialConfig, getSocialConfig } from './config'
import { gateRuleById, passesGateRule, playerWallet } from './player'
import { getRuntimeContext, getRuntimeFloorZones } from './runtime-context'
import { onSocial } from './sync'
import { clearOfMeshLocal } from '../dance/zones'

const GATED_ROLES = new Set(['gated', 'vip'])

let denyEntity: Entity | null = null
let denyTimer = 0

function showDenied(message: string): void {
  if (!denyEntity) {
    denyEntity = engine.addEntity()
    Transform.create(denyEntity, {
      position: Vector3.create(16, 2.2, 16),
      scale: Vector3.One()
    })
    TextShape.create(denyEntity, {
      text: '',
      fontSize: 2.5,
      textColor: Color4.Red()
    })
  }
  TextShape.getMutable(denyEntity).text = message
  denyTimer = 4
}

function playerFloorIndex(y: number): number {
  const ctx = getRuntimeContext()
  if (!ctx?.floors?.length) return 0
  let best = ctx.floors[0].floor
  let bestDist = Infinity
  for (const f of ctx.floors) {
    const dist = Math.abs(y - f.y)
    if (dist < bestDist) {
      bestDist = dist
      best = f.floor
    }
  }
  return best
}

/**
 * Does this zone apply where the player is standing?
 *
 * A zone on the PLOT (floorIndex SITE_FLOOR_INDEX) has no floor of its own — it is
 * ground you walk on between the buildings, so it answers for ground level. Comparing
 * its index to the player's floor is how an access rule on a courtyard zone did
 * nothing at all: −1 never equals 0.
 */
function zoneCoversFloor(zone: RuntimeFloorZone, floor: number, playerY?: number): boolean {
  if (Number.isFinite(zone.floorY) && Number.isFinite(playerY)) {
    return Math.abs(Number(playerY) - Number(zone.floorY)) <= 1.25
  }
  if (zone.floorIndex === SITE_FLOOR_INDEX) return floor === 0
  return zone.floorIndex === floor
}

function buildingLocalXZ(sceneX: number, sceneZ: number): { x: number; z: number } {
  const origin = getRuntimeContext()?.modelOrigin ?? { x: 8, y: 0, z: 8 }
  // Scene → composer-local through the z-mirror (shared/dcl-placement.ts) so
  // zone shapes (authored in composer coords) hit-test where they render.
  return sceneToGlbLocal(origin, sceneX, sceneZ)
}

function zoneCenterDcl(zone: RuntimeFloorZone): { x: number; y: number; z: number } {
  const ctx = getRuntimeContext()
  const origin = ctx?.modelOrigin ?? { x: 8, y: 0, z: 8 }
  const floorY =
    Number.isFinite(zone.floorY)
      ? Number(zone.floorY)
      : ctx?.floors.find((f) => f.floor === zone.floorIndex)?.y ?? origin.y
  const pos = glbLocalToScene(origin, zone.shape.centerX, zone.shape.centerZ)
  return { x: pos.x, y: floorY, z: pos.z }
}

/** Zone centre NUDGED OUT of the publish-baked no-go discs — a send-to-zone must
 *  never plant someone inside the screen, a bench, or a column (the "stuck in
 *  the mesh" bug was teleporting to the RAW centre). */
function zoneSafePointDcl(zone: RuntimeFloorZone): { x: number; y: number; z: number } {
  const ctx = getRuntimeContext()
  const origin = ctx?.modelOrigin ?? { x: 8, y: 0, z: 8 }
  const floorY =
    Number.isFinite(zone.floorY)
      ? Number(zone.floorY)
      : ctx?.floors.find((f) => f.floor === zone.floorIndex)?.y ?? origin.y
  const clear = clearOfMeshLocal(zone.shape.centerX, zone.shape.centerZ)
  const pos = glbLocalToScene(origin, clear.x, clear.z)
  return { x: pos.x, y: floorY, z: pos.z }
}

function bindingForZone(config: SocialSurfaceConfig, zoneId: string) {
  return config.zoneRoles.find((b) => b.zoneComponentId === zoneId)
}

function zoneRequiresGate(config: SocialSurfaceConfig, zone: RuntimeFloorZone): string | null {
  const binding = bindingForZone(config, zone.id)
  if (!binding) return null
  if (GATED_ROLES.has(binding.role)) return binding.gateRuleId
  if (binding.gateRuleId) return binding.gateRuleId
  return null
}

function pushPlayerOut(zone: RuntimeFloorZone, localX: number, localZ: number): void {
  const center = zoneCenterDcl(zone)
  const dx = localX - zone.shape.centerX
  const dz = localZ - zone.shape.centerZ
  const len = Math.hypot(dx, dz) || 1
  const margin = zone.shape.kind === 'circle' ? zone.shape.radius + 0.6 : 1.2
  const origin = getRuntimeContext()?.modelOrigin ?? { x: 8, y: 0, z: 8 }
  // Compute the push target in composer-local space, then map through the
  // mirror — mixing spaces here is exactly how the phantom offsets happened.
  const target = glbLocalToScene(
    origin,
    zone.shape.centerX + (dx / len) * margin,
    zone.shape.centerZ + (dz / len) * margin
  )
  void movePlayerTo({
    newRelativePosition: { x: target.x, y: center.y, z: target.z },
    cameraTarget: { x: center.x, y: center.y + 1.5, z: center.z }
  })
}

export function canAccessFloor(floorIndex: number, config?: SocialSurfaceConfig | null): boolean {
  const social = config ?? getConfiguredSocialConfig()
  if (!social) return true
  const binding = social.floorGates.find((fg) => fg.floorIndex === floorIndex)
  if (!binding?.gateRuleId) return true
  const rule = gateRuleById(social, binding.gateRuleId)
  return passesGateRule(rule, social)
}

export function floorGateDeniedMessage(floorIndex: number): string {
  const social = getConfiguredSocialConfig()
  if (!social) return 'Access denied'
  const binding = social.floorGates.find((fg) => fg.floorIndex === floorIndex)
  if (!binding?.gateRuleId) return 'Access denied'
  const rule = gateRuleById(social, binding.gateRuleId)
  return rule?.deniedMessage ?? 'Access denied'
}

export function initZoneGates(): void {
  onSocial('host.sendToZone', (msg) => {
    const localId = playerWallet()
    if (!localId || localId !== msg.targetUserId.toLowerCase()) return
    const zones = getRuntimeFloorZones()
    const zone = zones.find((z) => z.id === msg.zoneId)
    if (!zone) return
    const safe = zoneSafePointDcl(zone)
    void movePlayerTo({
      newRelativePosition: { x: safe.x, y: safe.y, z: safe.z },
      cameraTarget: { x: safe.x + 1, y: safe.y + 1.5, z: safe.z + 1 }
    })
  })

  engine.addSystem((dt) => {
    const config = getSocialConfig()
    if (!config) return
    const zones = getRuntimeFloorZones()
    if (!zones.length) return

    const playerTf = Transform.getOrNull(engine.PlayerEntity)
    if (!playerTf) return

    const sceneX = playerTf.position.x
    const sceneZ = playerTf.position.z
    const sceneY = playerTf.position.y
    const local = buildingLocalXZ(sceneX, sceneZ)
    const floor = playerFloorIndex(sceneY)

    let insideGated = false

    for (const zone of zones) {
      if (!zoneCoversFloor(zone, floor, sceneY)) continue
      if (!pointInFloorZone(local.x, local.z, zone.shape)) continue

      const ruleId = zoneRequiresGate(config, zone)
      if (!ruleId) continue

      const rule = gateRuleById(config, ruleId)
      if (passesGateRule(rule, config)) continue

      insideGated = true
      showDenied(rule?.deniedMessage ?? 'Access denied')
      pushPlayerOut(zone, local.x, local.z)
      break
    }

    void insideGated

    if (denyTimer > 0) {
      denyTimer -= dt
      if (denyTimer <= 0 && denyEntity) {
        TextShape.getMutable(denyEntity).text = ''
      }
    }
  })
}

export function listRuntimeZones(): RuntimeFloorZone[] {
  return getRuntimeFloorZones()
}

export function zoneCenterForHost(zoneId: string): { x: number; y: number; z: number } | null {
  const zone = getRuntimeFloorZones().find((z) => z.id === zoneId)
  if (!zone) return null
  return zoneSafePointDcl(zone)
}
