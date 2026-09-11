/**
 * Standalone zone gate — venue-off enforcement of per-zone access rules.
 *
 * Sibling of index.ts (the building access gate): it enforces the Zones tab's
 * per-zone rules whether or not the Social venue is enabled. When the venue IS on,
 * scene/src/social/zone-gates.ts owns zone gating (and this stays out of the way).
 *
 * Zone rules live on spec.social (zoneRoles binding → GateRule), which is present
 * even on venue-off builds because the Zones tab materialises social config without
 * flipping `enabled`. Floor geometry + heights come from the runtime context
 * (setRuntimeContext runs unconditionally at scene load), so this reuses the exact
 * hit-test + push-out math the venue-on path uses.
 */

import { engine, Transform, TextShape } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import type { RuntimeFloorZone, SceneRuntimeConfig } from '@shared/scene-runtime-config'
import { pointInFloorZone } from '@shared/floor-zone-hit'
import { glbLocalToScene, sceneToGlbLocal } from '@shared/dcl-placement'
import { initNftChecker } from '../social/nft-check'
import { gateRuleById, passesGateRule } from '../social/player'

export function initStandaloneZoneGate(config: SceneRuntimeConfig): void {
  const social = config.social
  // The full venue enforces zones itself (zone-gates.ts) — only run standalone.
  if (!social || social.enabled) return

  const gatedZoneIds = new Set(
    social.zoneRoles.filter((b) => b.gateRuleId).map((b) => b.zoneComponentId)
  )
  if (!gatedZoneIds.size) return
  const gatedZones = (config.floorZones ?? []).filter((z) => gatedZoneIds.has(z.id))
  if (!gatedZones.length) return

  initNftChecker()

  const origin = config.modelOrigin ?? { x: 8, y: 0, z: 8 }
  const floors = config.floors ?? []
  const floorY = (idx: number): number => floors.find((f) => f.floor === idx)?.y ?? origin.y
  const playerFloor = (y: number): number => {
    if (!floors.length) return 0
    let best = floors[0].floor
    let bestDist = Infinity
    for (const f of floors) {
      const d = Math.abs(y - f.y)
      if (d < bestDist) {
        bestDist = d
        best = f.floor
      }
    }
    return best
  }

  const banner = engine.addEntity()
  Transform.create(banner, { position: Vector3.create(origin.x, 2.4, origin.z) })
  TextShape.create(banner, { text: '', fontSize: 2, textColor: Color4.create(1, 0.35, 0.35, 1) })

  function pushOut(zone: RuntimeFloorZone): void {
    const p = Transform.getOrNull(engine.PlayerEntity)
    if (!p) return
    const local = sceneToGlbLocal(origin, p.position.x, p.position.z)
    const dx = local.x - zone.shape.centerX
    const dz = local.z - zone.shape.centerZ
    const len = Math.hypot(dx, dz) || 1
    const margin = zone.shape.kind === 'circle' ? zone.shape.radius + 0.8 : 1.4
    const target = glbLocalToScene(
      origin,
      zone.shape.centerX + (dx / len) * margin,
      zone.shape.centerZ + (dz / len) * margin
    )
    const y = Number.isFinite(zone.floorY) ? Number(zone.floorY) : floorY(zone.floorIndex)
    void movePlayerTo({
      newRelativePosition: { x: target.x, y, z: target.z },
      cameraTarget: { x: target.x, y: y + 1.5, z: target.z }
    })
  }

  let bannerTimer = 0
  let cooldown = 0
  let tick = 0
  engine.addSystem((dt) => {
    if (bannerTimer > 0) {
      bannerTimer -= dt
      if (bannerTimer <= 0) TextShape.getMutable(banner).text = ''
    }
    if (cooldown > 0) cooldown -= dt

    tick += 1
    if (tick % 10 !== 0) return // ~6 checks/sec, matches the building gate

    const p = Transform.getOrNull(engine.PlayerEntity)
    if (!p) return
    const local = sceneToGlbLocal(origin, p.position.x, p.position.z)
    const floor = playerFloor(p.position.y)

    for (const zone of gatedZones) {
      if (
        Number.isFinite(zone.floorY)
          ? Math.abs(p.position.y - Number(zone.floorY)) > 1.25
          : zone.floorIndex !== floor
      ) continue
      if (!pointInFloorZone(local.x, local.z, zone.shape)) continue

      const binding = social.zoneRoles.find((b) => b.zoneComponentId === zone.id)
      const rule = gateRuleById(social, binding?.gateRuleId)
      if (passesGateRule(rule, social)) continue // pass (or pending NFT read) → allow
      if (cooldown > 0) return

      cooldown = 1.2 // avoid re-eject spam on a single crossing
      TextShape.getMutable(banner).text = rule?.deniedMessage || 'Access denied'
      bannerTimer = 4
      pushOut(zone)
      return
    }
  })
}
