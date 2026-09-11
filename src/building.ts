import {
  engine,
  Entity,
  GltfContainer,
  Transform,
  ColliderLayer,
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import {
  buildingGlbOriginDcl,
} from '@shared/dcl-placement'
import type { SceneRuntimeConfig } from './assets/building-config'

function mountBuildingModel(src: string, origin: { x: number; y: number; z: number }): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.create(origin.x, origin.y, origin.z),
    scale: Vector3.One()
  })
  GltfContainer.create(entity, {
    src,
    // GLB `_collider` meshes are invisible — they must use the invisible mask for walkable physics.
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
  })
  return entity
}

export function loadBuilding(config: SceneRuntimeConfig): Entity {
  const origin = config.modelOrigin ?? buildingGlbOriginDcl(config.building, config.scene)
  const building = mountBuildingModel(config.modelFile, origin)

  // Every OTHER building: its own GLB, centered on itself, placed here exactly like a
  // smart object — never as an offset inside another building's model (that offset
  // crosses the Explorer's glTF import unobservably; nine wrong-side-of-the-map reports).
  for (const model of config.models ?? []) {
    mountBuildingModel(model.file, model.origin)
  }

  return building
}
