/**
 * The arrival's engine half. Every rule it obeys lives in
 * `@shared/arrival-contract` — read that file first; this one only wires it.
 *
 * ‼️PRIMED FROM `main()` BEFORE ANYTHING IS AWAITED, for the same reason the
 * boot floor is: the visitor has been falling since before our first frame, and
 * a restore that waits behind `await loadDeployedConfig()` is a restore the
 * visitor watches happen. The one thing this module reads is
 * `getSceneInformation()` — the Explorer already holds the scene.json, so that
 * is a local RPC, not a content-server round trip. Do not give this module the
 * building config, a fetch, or anything that needs one.
 */
import { engine, Transform } from '@dcl/sdk/ecs'
import { getSceneInformation } from '~system/Runtime'
import { movePlayerTo } from '~system/RestrictedActions'
import {
  ARRIVAL_SETTLE_SPEED_MPS,
  arrivalHoldExpired,
  arrivalIsSettled,
  arrivalWindowClosed,
  parseArrivalSpawn,
  shouldRestoreArrival,
  type ArrivalPoint
} from '@shared/arrival-contract'
import { noteBootFloorArrivalPending, setBootFloorSpawn } from './boot-floor'
import {
  markCapturedToSpawn,
  noteFlySnapshotIfAway,
  noteWorldTransitPlot,
  spawnCaptureOptedOut
} from './world-session'

/** A local RPC that has not answered in this long is not answering. */
const SPAWN_READ_TIMEOUT_MS = 2_000
const SPAWN_READ_ATTEMPTS = 3

let systemOn = false
let primedAt = 0
let spawn: ArrivalPoint | null = null
/** Null until the scene metadata has answered; distinguishes "no spawn" from "not yet". */
let spawnKnown = false
let landed = false
let restores = 0
/** Restores the Explorer actually ACCEPTED, as opposed to merely answered. */
let accepted = 0
let lastRestoreAt = 0
let settledMs = 0
/** Has the pad been re-stood on the spawn? Only a real fall earns that. */
let padMoved = false
let lastY: number | null = null

function stopSystem(): void {
  if (!systemOn) return
  engine.removeSystem(arrivalSystem)
  systemOn = false
}

/**
 * The teleport, behind an async wrapper.
 *
 * `~system` bindings are RPC proxies, not native Promises — chaining `.then()`
 * onto one throws in the live Explorer and takes the caller down with it. On
 * the arrival path that would cost the whole boot. Await, never chain.
 *
 * ‼️AND THE VERDICT IS IN THE RESPONSE, NOT IN A THROW. `movePlayerTo` returns
 * `{ success: boolean }`: a refusal RESOLVES, with success false. The first
 * version of this module only caught throws, so every refusal counted as a
 * teleport that happened — the visitor stayed on the ground while the log said
 * the scene had moved them twenty times. Read the field.
 */
async function restoreTo(at: ArrivalPoint): Promise<boolean> {
  try {
    const res = await movePlayerTo({ newRelativePosition: { x: at.x, y: at.y, z: at.z } })
    const ok = res?.success === true
    if (!ok) console.log('[arrival] restore REFUSED by the explorer (success:false) — asking again')
    return ok
  } catch (error) {
    console.log(`[arrival] restore threw — ${String(error)}`)
    return false
  }
}

function arrivalSystem(dt: number): void {
  const now = Date.now()
  const ageMs = now - primedAt

  if (arrivalWindowClosed(ageMs)) {
    landed = true
    noteBootFloorArrivalPending(false)
    stopSystem()
    return
  }

  // No spawn point in this scene's metadata: there is nothing to restore and
  // nothing to wait for. Never a reason to hold a curtain.
  if (spawnKnown && spawn === null) {
    landed = true
    noteBootFloorArrivalPending(false)
    stopSystem()
    return
  }
  if (!spawnKnown) return

  const player = Transform.getOrNull(engine.PlayerEntity)?.position ?? null
  const y = player ? player.y : null
  const elapsed = Math.max(0.0001, dt)
  const speed = y !== null && lastY !== null ? (y - lastY) / elapsed : 0
  if (y !== null && lastY !== null && Math.abs(speed) <= ARRIVAL_SETTLE_SPEED_MPS)
    settledMs += elapsed * 1000
  else settledMs = 0
  lastY = y

  if (player && spawn) noteFlySnapshotIfAway(player, spawn)

  if (
    arrivalIsSettled({
      spawn,
      playerY: y,
      speedMps: speed,
      settledMs
    })
  ) {
    landed = true
    noteBootFloorArrivalPending(false)
    console.log(`[arrival] settled at y=${y?.toFixed(2)} (${ageMs} ms after prime)`)
    stopSystem()
    return
  }

  if (
    shouldRestoreArrival({
      landed,
      spawn,
      playerY: y,
      restores,
      ageMs,
      sinceRestoreMs: lastRestoreAt === 0 ? Number.MAX_SAFE_INTEGER : now - lastRestoreAt,
      optedOut: spawnCaptureOptedOut()
    })
  ) {
    markCapturedToSpawn()
    lastRestoreAt = now
    restores += 1
    // ‼️THE PAD MOVES TO THE SPAWN ONLY ONCE A FALL IS REAL, AND THAT MATTERS
    // ON ORDINARY SCENES. A ground scene declares `y: [0.2, 0.7]`, whose
    // midpoint is 45 cm above a floor at zero — standing the pad there on every
    // arrival would hold every visitor in the air on a scene that never had a
    // problem, and drop them the moment the pad is released. Nobody who has not
    // fallen ever reaches this branch.
    if (!padMoved) {
      padMoved = true
      setBootFloorSpawn(spawn!)
    }
    console.log(
      `[arrival] visitor at y=${y?.toFixed(2)} is below spawn y=${spawn!.y.toFixed(2)} — ` +
        `restoring (attempt ${restores}, ${ageMs} ms after prime)`
    )
    // An async IIFE, not `.then()` on the binding: `restoreTo` is our own async
    // function and returns a real Promise, but the law that killed a plugin
    // here is "never chain a ~system proxy", and the cheapest way to keep it
    // unmistakable is to await ours instead of chaining anything.
    void (async () => {
      if (await restoreTo(spawn!)) accepted += 1
    })()
  }
}

/**
 * `getSceneInformation` with a deadline.
 *
 * ‼️A RUNTIME READ WITH NO DEADLINE IS WHAT WELDED THE ARRIVAL COVER TO THE
 * SCREEN ONCE ALREADY — the config read could hang on a cold catalyst and
 * nothing after it ever ran. This read is local (the Explorer already holds the
 * scene.json) so it should answer in a frame, but "should" is exactly what the
 * config read had going for it too. If it does not answer, say so in the log
 * and try again rather than sitting silent behind a curtain.
 */
async function sceneMetadataOnce(): Promise<string | null> {
  // AWAITED, never chained: `getSceneInformation` is an RPC proxy and `.then()`
  // on one throws "is not a function" in the live Explorer.
  try {
    const info = await getSceneInformation({})
    return info.metadataJson ?? null
  } catch (error) {
    console.log(`[arrival] getSceneInformation threw — ${String(error)}`)
    return null
  }
}

function afterDeadline(): Promise<null> {
  return new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), SPAWN_READ_TIMEOUT_MS)
  })
}

async function readSceneMetadata(): Promise<string | null> {
  for (let attempt = 1; attempt <= SPAWN_READ_ATTEMPTS; attempt++) {
    const answer = await Promise.race([sceneMetadataOnce(), afterDeadline()])
    if (answer) return answer
    console.log(`[arrival] scene metadata unanswered (attempt ${attempt}) — retrying`)
  }
  return null
}

async function readSpawn(): Promise<void> {
  const metadata = await readSceneMetadata()
  spawn = parseArrivalSpawn(metadata)
  spawnKnown = true
  noteWorldTransitPlot({ metadataJson: metadata, spawn })
  if (!spawn) {
    console.log('[arrival] this scene declares no spawn point — nothing to restore')
  }
  if (spawn) {
    console.log(
      `[arrival] scene spawn ${spawn.x.toFixed(1)}, ${spawn.y.toFixed(1)}, ${spawn.z.toFixed(1)}`
    )
  }
}

/** Called from `main()`, before anything is awaited. Safe to call twice. */
export function primeArrival(): void {
  if (systemOn) return
  primedAt = Date.now()
  landed = false
  spawn = null
  spawnKnown = false
  restores = 0
  accepted = 0
  lastRestoreAt = 0
  settledMs = 0
  padMoved = false
  lastY = null
  noteBootFloorArrivalPending(true)
  engine.addSystem(arrivalSystem)
  systemOn = true
  void readSpawn()
}

/**
 * True while the visitor is still being put back where they arrived.
 *
 * The arrival cover reads this: a curtain that lifts now is a curtain that
 * lifts onto the fall. It is false the moment they settle, false if this scene
 * declares no spawn, and false unconditionally past ARRIVAL_WINDOW_MS.
 */
export function arrivalPending(): boolean {
  if (primedAt === 0) return false
  if (landed) return false
  // The ask outlives the hold: see ARRIVAL_HOLD_MS. A curtain kept up for the
  // whole retry window would be a worse arrival than the one being fixed.
  return !arrivalHoldExpired(Date.now() - primedAt)
}

/** KEEP FLYING — stop asking, leave the visitor where the opt-out put them. */
export function releaseArrival(): void {
  landed = true
  noteBootFloorArrivalPending(false)
  stopSystem()
}

/** Test/diagnostic read. */
export function arrivalDebug(): {
  spawn: ArrivalPoint | null
  landed: boolean
  restores: number
  accepted: number
} {
  return { spawn, landed, restores, accepted }
}
