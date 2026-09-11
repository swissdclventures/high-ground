/**
 * Interior lights — the REAL half of the per-floor "lights on" attribute.
 *
 * The emissive soffit baked into the GLB makes a floor LOOK lit from any distance. It
 * does not illuminate anything. This module hangs actual `LightSource` points on the
 * anchors the publish path baked into `interiorLamps`, so walking into a lit lobby is
 * lit rather than merely decorated.
 *
 * THE BUDGET IS THE WHOLE DESIGN. The Explorer keeps only the nearest 4–10 lights in a
 * scene; the gallery learned this the expensive way and gave each picture its own lamp
 * so a four-wall room keeps four. A district bakes ~76 anchors across nineteen towers,
 * and creating 76 live LightSource entities would hand the renderer a queue it silently
 * truncates — with no guarantee the survivors are the ones near the player.
 *
 * So we do the picking ourselves: keep a small pool of entities and re-point them at the
 * nearest anchors as the player moves. The pool is fixed, the choice is explicit, and
 * the lights you can actually see are always the ones nearest you.
 */
import { engine, Entity, LightSource, Transform } from '@dcl/sdk/ecs'
import { Color3, Vector3 } from '@dcl/sdk/math'
import type { SceneRuntimeConfig } from '@shared/scene-runtime-config'
import type { InteriorLampAnchor } from '@shared/interior-lights'

/**
 * Live lamps. Deliberately under the Explorer's own 4–10 window: at the top of that
 * range the renderer is already dropping lights, and a lobby reads as lit on four.
 */
const LIVE_LAMPS = 6
/** Beyond this the lamp contributes nothing visible — leave the slot for a nearer one. */
const CULL_DISTANCE_M = 42
/** Re-pick cadence. Lamps do not need to track a walking player every frame. */
const REPICK_SECONDS = 0.75

interface LampSlot {
  entity: Entity
  anchorIndex: number
}

let anchors: InteriorLampAnchor[] = []
let slots: LampSlot[] = []
let sinceRepick = 0

function playerPosition(): Vector3.ReadonlyVector3 | null {
  const t = Transform.getOrNull(engine.PlayerEntity)
  return t ? t.position : null
}

function distanceSq(anchor: InteriorLampAnchor, at: Vector3.ReadonlyVector3): number {
  const dx = anchor.x - at.x
  const dy = anchor.y - at.y
  const dz = anchor.z - at.z
  return dx * dx + dy * dy + dz * dz
}

/** Indices of the nearest `LIVE_LAMPS` anchors, nearest first, culled by distance. */
function nearestAnchorIndices(at: Vector3.ReadonlyVector3): number[] {
  const cull = CULL_DISTANCE_M * CULL_DISTANCE_M
  const scored: Array<{ index: number; d: number }> = []
  for (let i = 0; i < anchors.length; i++) {
    const d = distanceSq(anchors[i]!, at)
    if (d > cull) continue
    scored.push({ index: i, d })
  }
  scored.sort((a, b) => a.d - b.d)
  return scored.slice(0, LIVE_LAMPS).map((s) => s.index)
}

function applySlot(slot: LampSlot, anchorIndex: number): void {
  if (slot.anchorIndex === anchorIndex) return
  slot.anchorIndex = anchorIndex
  if (anchorIndex < 0) {
    // Deactivate rather than delete: churning entities every re-pick is how a smooth
    // walk turns into a stutter.
    const light = LightSource.getMutableOrNull(slot.entity)
    if (light) light.active = false
    return
  }
  const anchor = anchors[anchorIndex]!
  Transform.createOrReplace(slot.entity, {
    position: Vector3.create(anchor.x, anchor.y, anchor.z)
  })
  LightSource.createOrReplace(slot.entity, {
    active: true,
    color: Color3.create(anchor.color.r, anchor.color.g, anchor.color.b),
    intensity: anchor.candela,
    range: anchor.rangeM,
    shadow: false,
    type: LightSource.Type.Point({})
  })
}

function repick(): void {
  const at = playerPosition()
  if (!at) return
  const chosen = nearestAnchorIndices(at)
  for (let i = 0; i < slots.length; i++) {
    applySlot(slots[i]!, chosen[i] ?? -1)
  }
}

function interiorLightSystem(dt: number): void {
  if (!anchors.length) return
  sinceRepick += dt
  if (sinceRepick < REPICK_SECONDS) return
  sinceRepick = 0
  repick()
}

/**
 * Hang the lamp pool. Safe to call on a scene with no lit floors — it returns having
 * created nothing, which is the common case for a single building.
 */
export function initInteriorLights(config: SceneRuntimeConfig): void {
  anchors = config.interiorLamps ?? []
  if (!anchors.length) return
  const pool = Math.min(LIVE_LAMPS, anchors.length)
  slots = []
  for (let i = 0; i < pool; i++) {
    slots.push({ entity: engine.addEntity(), anchorIndex: -1 })
  }
  // Place once immediately so the spawn point is lit on arrival rather than three
  // quarters of a second later — the landing spot is exactly where a dark frame is
  // most noticeable.
  repick()
  engine.addSystem(interiorLightSystem)
  console.log(`[interior-lights] ${anchors.length} anchors, ${pool} live lamps`)
}
