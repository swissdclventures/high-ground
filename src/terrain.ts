/**
 * Artificial land, in world.
 *
 * You cannot dig in Decentraland: the engine puts a solid walkable floor at y = 0
 * that no scene can cut through. So a canyon, a harbour, or a room under a city is
 * made by standing the land UP and leaving that floor where it is — the volume
 * under a raised plate is the underground, and a parcel left at 0 is the canyon.
 *
 * ‼️THIS IS THE FIRST WALKABLE GROUND THIS REPO HAS EVER DRAWN. The site paving
 * (`site-ground.ts`) is explicitly visual with no collider, because Decentraland's
 * own y = 0 floor carried the player. Raised land cannot borrow that floor — it IS
 * the floor now — so every box here carries a physics collider, plate and wall
 * alike, or you would walk through a cliff and out of the world.
 *
 * The arithmetic is NOT here. `terrainSolids()` in shared/terrain-contract.ts
 * returns every box as data so a test can assert that a plate top lands exactly on
 * its parcel height and a wall meets the ground beside it with no gap; getting
 * either wrong is a hole you fall through, and that is not something to discover
 * by walking around in the Explorer. This file only turns boxes into entities.
 *
 * WHAT IS NOT DRAWN YET: ramps. You can walk off a plate and DCL's floor catches
 * you at the bottom; getting back up needs a slope, and that is the next piece.
 */
import { engine, Entity, Material, MeshCollider, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { normalizeTerrainConfig, terrainSolids, type TerrainSolid } from '@shared/terrain-contract'
import type { SceneRuntimeConfig } from './assets/building-config'

/** Plate top and cliff face read as different materials, because they are. */
const PLATE_COLOR = '#8d8577'
const WALL_COLOR = '#6f6558'

function hexToColor4(hex: string, alpha = 1): Color4 {
  const n = parseInt(hex.slice(1), 16)
  return Color4.create(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha)
}

function hexToColor3(hex: string): Color3 {
  const n = parseInt(hex.slice(1), 16)
  return Color3.create(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

function drawSolid(solid: TerrainSolid): Entity {
  const hex = solid.kind === 'plate' ? PLATE_COLOR : WALL_COLOR
  const entity = engine.addEntity()
  Transform.create(entity, {
    position: Vector3.create(solid.x, solid.y, solid.z),
    rotation: Quaternion.Identity(),
    scale: Vector3.create(solid.width, solid.height, solid.depth),
  })
  MeshRenderer.setBox(entity)
  // The whole point. Default layers give physics and pointer: physics is what
  // makes this ground, and pointer costs nothing and lets a later tool click a
  // parcel to re-height it.
  MeshCollider.setBox(entity)
  Material.setPbrMaterial(entity, {
    albedoColor: hexToColor4(hex),
    // A cliff face is in its own shadow most of the day and goes to near-black
    // without a little self-illumination; the ground reads flat without it.
    emissiveColor: hexToColor3(hex),
    emissiveIntensity: solid.kind === 'wall' ? 0.06 : 0.03,
    roughness: 0.95,
    metallic: 0,
    specularIntensity: 0.2,
  })
  return entity
}

export function loadTerrain(config: SceneRuntimeConfig): void {
  const terrain = normalizeTerrainConfig(
    (config.building as { terrain?: unknown } | undefined)?.terrain,
  )
  if (!terrain.enabled) return

  const layout = {
    cols: Math.max(1, Math.round(config.scene.cols)),
    rows: Math.max(1, Math.round(config.scene.rows)),
  }
  const solids = terrainSolids(terrain, layout)
  for (const solid of solids) drawSolid(solid)

  const plates = solids.filter((s) => s.kind === 'plate').length
  console.log(
    `[terrain] ground ${terrain.groundHeightM} m · ${plates} plate(s) · ` +
      `${solids.length - plates} face(s) · ${terrain.regions.length} region(s)`,
  )
}
