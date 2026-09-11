import {
  engine,
  Entity,
  GltfContainer,
  Transform,
  ColliderLayer,
  TextShape,
  MeshCollider
} from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import type { SceneRuntimeConfig } from '@shared/scene-runtime-config'
import type { SocialSurfaceConfig } from '@shared/social-surface-contract'
import { getSocialConfig } from './config'
import { gateRuleById, passesGateRule, playerWallet } from './player'
import { onSocial, emitSocial } from './sync'
import { isLockedOut } from './lockout'

export interface GateHandle {
  id: string
  entity: Entity
  ruleId: string | null
  deniedMessage: string
  enabled: boolean
}

const gates: GateHandle[] = []
const disabledRules = new Set<string>()

export function registerGate(
  entity: Entity,
  specId: string,
  ruleId: string | null,
  deniedMessage: string
): void {
  gates.push({
    id: specId,
    entity,
    ruleId,
    deniedMessage,
    enabled: true
  })
}

function gateRulePasses(ruleId: string | null, config: SocialSurfaceConfig): boolean {
  if (!ruleId) return true
  if (disabledRules.has(ruleId)) return true
  const wallet = playerWallet()
  if (wallet && isLockedOut(wallet)) return false
  const rule = gateRuleById(config, ruleId)
  return passesGateRule(rule, config)
}

function applyGateCollider(handle: GateHandle, block: boolean): void {
  const container = GltfContainer.getOrNull(handle.entity)
  if (container) {
    const mutable = GltfContainer.getMutable(handle.entity)
    if (block) {
      mutable.invisibleMeshesCollisionMask = ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER
      mutable.visibleMeshesCollisionMask = ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER
    } else {
      mutable.invisibleMeshesCollisionMask = ColliderLayer.CL_NONE
      mutable.visibleMeshesCollisionMask = ColliderLayer.CL_NONE
    }
    return
  }
  const mutable = MeshCollider.getMutable(handle.entity)
  if (block) {
    mutable.collisionMask = ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER
  } else {
    mutable.collisionMask = ColliderLayer.CL_NONE
  }
}

function refreshGates(): void {
  const config = getSocialConfig()
  if (!config) return
  for (const gate of gates) {
    if (!gate.enabled) {
      applyGateCollider(gate, false)
      continue
    }
    const block = !gateRulePasses(gate.ruleId, config)
    applyGateCollider(gate, block)
  }
}

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

export function initGating(_config: SceneRuntimeConfig): void {
  onSocial('gate.setEnabled', (msg) => {
    if (msg.enabled) disabledRules.delete(msg.ruleId)
    else disabledRules.add(msg.ruleId)
    refreshGates()
  })

  engine.addSystem((dt) => {
    refreshGates()
    if (denyTimer > 0) {
      denyTimer -= dt
      if (denyTimer <= 0 && denyEntity) {
        TextShape.getMutable(denyEntity).text = ''
      }
    }
  })

  engine.addSystem(() => {
    const config = getSocialConfig()
    if (!config) return
    const player = Transform.getOrNull(engine.PlayerEntity)
    if (!player) return
    for (const gate of gates) {
      if (!gate.enabled || !gate.ruleId) continue
      if (gateRulePasses(gate.ruleId, config)) continue
      const gt = Transform.getOrNull(gate.entity)
      if (!gt) continue
      const dx = Math.abs(player.position.x - gt.position.x)
      const dz = Math.abs(player.position.z - gt.position.z)
      if (dx < 1.5 && dz < 1.5) {
        showDenied(gate.deniedMessage)
      }
    }
  })
}

export function listGates(): GateHandle[] {
  return gates
}

export function togglePreviewGate(ruleId: string, enabled: boolean): void {
  emitSocial({ type: 'gate.setEnabled', ruleId, enabled })
}
