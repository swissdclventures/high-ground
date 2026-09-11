import {
  engine,
  Entity,
  GltfContainer,
  Transform,
  ColliderLayer,
  MeshRenderer,
  Material,
  MeshCollider
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

/**
 * Local-only Blender MCP church walk test.
 * Placed near the default scene spawn so Web Explorer shows it immediately.
 */
export function loadChurchMcpPreview(): Entity {
  const origin = Vector3.create(12, 0, 12)

  // Visible ground with physics (Web Explorer often has no terrain)
  const ground = engine.addEntity()
  Transform.create(ground, {
    position: Vector3.create(24, -0.05, 24),
    scale: Vector3.create(48, 0.1, 48)
  })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground, ColliderLayer.CL_PHYSICS)
  Material.setPbrMaterial(ground, {
    albedoColor: Color4.create(0.2, 0.35, 0.22, 1)
  })

  // Bright marker so we know the scene code is running even if GLB fails
  const marker = engine.addEntity()
  Transform.create(marker, {
    position: Vector3.create(origin.x, 2, origin.z - 10),
    scale: Vector3.create(1.5, 4, 1.5)
  })
  MeshRenderer.setBox(marker)
  MeshCollider.setBox(marker, ColliderLayer.CL_PHYSICS)
  Material.setPbrMaterial(marker, {
    albedoColor: Color4.create(1, 0.2, 0.1, 1),
    emissiveColor: Color4.create(1, 0.2, 0.1, 1),
    emissiveIntensity: 2
  })

  const church = engine.addEntity()
  Transform.create(church, {
    position: origin,
    scale: Vector3.One()
  })

  GltfContainer.create(church, {
    src: 'models/church_mcp.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })

  console.log('[church-preview] church at', origin.x, origin.y, origin.z)
  return church
}
