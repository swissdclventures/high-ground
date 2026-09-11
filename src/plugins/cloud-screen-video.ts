/**
 * Video on the curved island screen — used by the Cloud Dance Floor, NOT by
 * the Punch Machine Championship.
 *
 * punch-arena-screen.ts is under an owner's law: no VideoPlayer on that file,
 * because attract footage outlasted the game and froze stale. This module is
 * the other venue: there is no punch to paint, so the same GLB plays the
 * bundled placeholder (or whatever URL the recipe stored).
 *
 * Placement MUST match createArenaScreen — same turn, scale, lift and push —
 * or the editor and the world disagree about where the arc stands.
 */
import {
  ColliderLayer,
  Entity,
  GltfContainer,
  GltfNodeModifiers,
  Material,
  Transform,
  VideoPlayer,
  engine
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  PUNCH_BIG_SCREEN_FACE_DEG,
  PUNCH_BIG_SCREEN_LIFT_M,
  PUNCH_BIG_SCREEN_NODE_PATHS,
  PUNCH_BIG_SCREEN_PUSH_M,
  PUNCH_BIG_SCREEN_SCALE,
  PUNCH_MODELS
} from '@shared/punch-machine-layout'

export function attachCloudScreenVideo(
  parent: Entity,
  src: string,
  volume: number
): Entity | null {
  const url = src.trim()
  if (!url) return null

  const root = engine.addEntity()
  Transform.create(root, {
    parent,
    position: Vector3.create(0, PUNCH_BIG_SCREEN_LIFT_M, -PUNCH_BIG_SCREEN_PUSH_M),
    rotation: Quaternion.fromEulerDegrees(0, PUNCH_BIG_SCREEN_FACE_DEG, 0),
    scale: Vector3.create(PUNCH_BIG_SCREEN_SCALE, PUNCH_BIG_SCREEN_SCALE, PUNCH_BIG_SCREEN_SCALE)
  })
  GltfContainer.create(root, {
    src: PUNCH_MODELS.bigScreen,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })
  VideoPlayer.create(root, {
    src: url,
    playing: true,
    loop: true,
    volume: Math.max(0, Math.min(1, volume)),
    spatial: true,
    spatialMinDistance: 8,
    spatialMaxDistance: 28
  })
  const videoTexture = Material.Texture.Video({ videoPlayerEntity: root })
  GltfNodeModifiers.createOrReplace(root, {
    modifiers: PUNCH_BIG_SCREEN_NODE_PATHS.map((path) => ({
      path,
      material: {
        material: {
          $case: 'unlit' as const,
          unlit: { texture: videoTexture }
        }
      }
    }))
  })
  return root
}
