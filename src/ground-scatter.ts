/**
 * In-world ground cover — library models spread over the site paving.
 *
 * ★ ONE model file, many entities. The GLB ships once (`groundScatterModels`) and every copy
 * is a GltfContainer pointing at that path, so the Explorer downloads it once and the publish
 * payload does not grow with the field. Baking the copies into building.glb would multiply
 * the single largest file in the deploy — the one that already makes publishing fragile.
 *
 * ★ The layout is NOT transported. It is re-solved here by `planGroundScatter`, the same
 * shared solver the Builder preview calls, from the same metrics and the same plot size —
 * so the field is identical in both frames and stable across republishes.
 *
 * ★ Visual only. No collider is set, matching the paving and the accents: a plot-wide field
 * of invisible walls would trip every guest crossing the site.
 */
import { engine, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { composerToDcl } from '@shared/dcl-placement'
import { siteGroundOverlayTransform } from '@shared/kit-geometry'
import { grassModelSrc, normalizeGroundScatterLayers, planGroundScatter } from '@shared/ground-scatter'
import {
  normalizePlacedPlants,
  placedPlantPose,
  vegetationModelSrc,
  vegetationSeasonForDate,
} from '@shared/vegetation-contract'
import { aabbsFromBuildingOutlines } from '@shared/jump-pad-wander'
import { GRID } from '@shared/types'
import type { SceneRuntimeConfig } from './assets/building-config'

/** Matches the Builder preview: clear of the paving plane so nothing z-fights the ground. */
const SCATTER_LIFT_M = 0.005
const BUILDING_GAP_M = 1.25

export function loadGroundScatter(config: SceneRuntimeConfig): void {
  const ground = config.building.siteGround
  if ((ground?.surface ?? 'none') === 'none') return

  const layers = normalizeGroundScatterLayers(ground?.scatter)
  const plants = normalizePlacedPlants(ground?.plants)
  if (layers.length === 0 && plants.length === 0) return

  const modelByObjectId = new Map<string, string>()
  for (const entry of config.groundScatterModels ?? []) modelByObjectId.set(entry.objectId, entry.file)
  // A vegetation layer needs no shipped model list: the species library travels with the
  // scene template, so a park made only of trees must NOT bail out here.
  const shipped = layers.some(
    (layer) => layer.enabled && (layer.source.kind === 'vegetation' || layer.source.kind === 'grass'),
  )
  if (modelByObjectId.size === 0 && !shipped) return

  // One clock for the whole plot. Colour is baked into each model, so a season picks a
  // different file — never a tint.
  const chosen = ground?.season
  const season = vegetationSeasonForDate(new Date(), chosen && chosen !== 'auto' ? chosen : null)

  const pose = siteGroundOverlayTransform(config.scene)
  const exclusions = aabbsFromBuildingOutlines(config.buildingOutlines, GRID.parcelSize).map((box) => ({
    minX: box.minX - pose.width / 2 - BUILDING_GAP_M,
    maxX: box.maxX - pose.width / 2 + BUILDING_GAP_M,
    minZ: box.minZ - pose.depth / 2 - BUILDING_GAP_M,
    maxZ: box.maxZ - pose.depth / 2 + BUILDING_GAP_M,
  }))

  let placed = 0
  for (const layer of layers) {
    if (!layer.enabled) continue
    const vegetation = layer.source.kind === 'vegetation' ? layer.source : null
    const grass = layer.source.kind === 'grass' ? layer.source : null
    if (!vegetation && !grass && layer.source.kind !== 'library') continue
    let src = grass ? grassModelSrc(grass.length) : ''
    if (!vegetation && !grass) {
      const objectId = (layer.source as { objectId: string }).objectId
      const found = modelByObjectId.get(objectId)
      if (!found) {
        console.log(`[ground-scatter] layer ${layer.id} skipped — no model shipped for ${objectId}`)
        continue
      }
      src = found
    }
    const instances = planGroundScatter({
      width: pose.width,
      depth: pose.depth,
      layer,
      exclusions,
    })
    for (const item of instances) {
      // Each copy wears the variant the solver dealt it, in this plot's season.
      const modelSrc = vegetation ? vegetationModelSrc(vegetation.species, item.variant, season) : src
      const dcl = composerToDcl(item.x, item.z, config.scene)
      const entity = engine.addEntity()
      Transform.create(entity, {
        position: Vector3.create(dcl.x, pose.y + SCATTER_LIFT_M, dcl.z),
        rotation: Quaternion.fromEulerDegrees(0, (item.yawRad * 180) / Math.PI, 0),
        scale: Vector3.create(item.scale, item.scale, item.scale),
      })
      GltfContainer.create(entity, { src: modelSrc })
      placed += 1
    }
  }

  // Plants somebody placed by hand. Same models, same lift, chosen positions instead of
  // solved ones — and, like the scattered copies, nothing was added to the deploy for them.
  for (const plant of plants) {
    // `pose` is the GROUND overlay above; the plant's own look is `look`. Shadowing the
    // two is what put a tree at height `undefined` on the first build.
    const look = placedPlantPose(plant, season)
    const dcl = composerToDcl(plant.x, plant.z, config.scene)
    const entity = engine.addEntity()
    Transform.create(entity, {
      position: Vector3.create(dcl.x, pose.y + SCATTER_LIFT_M, dcl.z),
      rotation: Quaternion.fromEulerDegrees(0, look.yawDeg, 0),
      scale: Vector3.create(look.scale, look.scale, look.scale),
    })
    GltfContainer.create(entity, { src: look.src })
    placed += 1
  }

  if (placed > 0) {
    console.log(`[ground-scatter] ${placed} copies over ${layers.length} layer(s) + ${plants.length} placed`)
  }
}
