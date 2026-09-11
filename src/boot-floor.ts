/**
 * The boot floor's engine half. Every rule it obeys lives in
 * `@shared/boot-floor-contract` — read that file first; this one only wires it.
 *
 * ‼️THE WHOLE POINT IS THAT NOTHING HERE WAITS ON CONFIG. It is primed from
 * `main()` BEFORE `await loadDeployedConfig()`, so the pad is a primitive
 * collider in the scene's first frame. Do not give this module a config
 * argument, a fetch, or an import of anything that has one: the moment it needs
 * to be told where the ground is, it is too late to be the ground.
 */
import { ColliderLayer, engine, MeshCollider, Transform, type Entity } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  type BootFloorReading,
  BOOT_FLOOR_SPAN_M,
  BOOT_FLOOR_THICK_M,
  bootFloorCenterY,
  isUsableBootFloorReading,
  shouldAbandonBootFloor,
  shouldPlaceBootFloor,
  shouldReleaseBootFloor
} from '@shared/boot-floor-contract'

let pad: Entity | null = null
let systemOn = false
let primedAt = 0
let bootDoneAt = 0
/**
 * Where the scene says the visitor arrives, once `arrival.ts` has read it out of
 * the scene metadata. Null until then — and the pad placed before then is a
 * catch, not a place. See `placePad`.
 */
let spawn: BootFloorReading | null = null
/** Set by `arrival.ts` while the visitor is still being put back at the spawn. */
let arrivalPending = false

function stopSystem(): void {
  if (!systemOn) return
  engine.removeSystem(bootFloorSystem)
  systemOn = false
}

function dropPad(): void {
  if (pad === null) return
  engine.removeEntity(pad)
  pad = null
}

function bootFloorSystem(): void {
  const now = Date.now()
  const ageMs = now - primedAt
  const sinceBootDoneMs = bootDoneAt > 0 ? now - bootDoneAt : null

  if (shouldReleaseBootFloor({ placed: pad !== null, ageMs, sinceBootDoneMs, arrivalPending })) {
    dropPad()
    stopSystem()
    return
  }
  if (shouldAbandonBootFloor({ placed: pad !== null, ageMs })) {
    stopSystem()
    return
  }
  if (pad !== null) return

  const at = Transform.getOrNull(engine.PlayerEntity)?.position ?? null
  if (!shouldPlaceBootFloor({ placed: false, at, ageMs })) return

  placePad(at!, `${ageMs} ms after prime`)
}

/**
 * Stand (or re-stand) the pad on one point.
 *
 * ‼️THE SPAWN OUTRANKS THE PLAYER, ALWAYS. A pad under a visitor who is already
 * falling holds them in mid-air, tens of metres under the place they came for —
 * and the punch entry catch then teleports them up in full view, which is the
 * whole bug. Once `arrival.ts` knows where this scene says people arrive, the
 * pad belongs THERE and the arrival restore does the rest.
 */
function placePad(at: BootFloorReading, why: string): void {
  const on = spawn ?? at
  if (pad === null) pad = engine.addEntity()
  Transform.createOrReplace(pad, {
    position: Vector3.create(on.x, bootFloorCenterY(on.y), on.z),
    rotation: Quaternion.Identity(),
    scale: Vector3.create(BOOT_FLOOR_SPAN_M, BOOT_FLOOR_THICK_M, BOOT_FLOOR_SPAN_M)
  })
  // CL_PHYSICS only. A pointer layer here would put an invisible slab between
  // the visitor and every clickable thing in the scene for as long as it
  // exists, which is exactly the arrival we are trying to fix.
  MeshCollider.setBox(pad, ColliderLayer.CL_PHYSICS)
  console.log(
    `[boot-floor] pad at y=${on.y.toFixed(2)} (${spawn ? 'scene spawn' : 'player'}, ${why})`
  )
}

/**
 * The scene's declared arrival point, handed over by `arrival.ts` a few frames
 * in. Moves a pad that was already placed: by then it is standing wherever
 * gravity had dragged the visitor, which is not a floor anybody asked for.
 */
export function setBootFloorSpawn(at: BootFloorReading): void {
  if (!isUsableBootFloorReading(at)) return
  spawn = at
  if (systemOn || pad !== null) placePad(at, 'spawn known')
}

/** Called from `main()`, before anything is awaited. Safe to call twice. */
export function primeBootFloor(): void {
  if (systemOn) return
  primedAt = Date.now()
  bootDoneAt = 0
  engine.addSystem(bootFloorSystem)
  systemOn = true
}

/**
 * The scene's own boot has finished creating geometry. The pad does not go
 * immediately — see BOOT_FLOOR_SETTLE_MS — because a GLB-backed floor is still
 * arriving at this moment even though its entity exists.
 */
export function markBootFloorSceneReady(): void {
  if (bootDoneAt === 0) bootDoneAt = Date.now()
}

/**
 * The arrival restore is still working. Held here rather than imported, because
 * the pad must keep working in a scene that never primes an arrival at all.
 */
export function noteBootFloorArrivalPending(pending: boolean): void {
  arrivalPending = pending
}

/** Test/diagnostic read. True while a visitor may be standing on the pad. */
export function bootFloorActive(): boolean {
  return pad !== null
}
