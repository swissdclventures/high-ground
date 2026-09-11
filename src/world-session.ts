/**
 * Per-visit memory of "I am already travelling in this World".
 *
 * localStorage survives a scene hop inside the same Explorer process. A live
 * session is how a fly-in to the MIDDLE of a plot still counts as a crossing
 * rather than a login. A hopTo parcel is how a closed-door pick-up still
 * restores to that scene's spawn.
 */
import { engine, Transform } from '@dcl/sdk/ecs'
import { getRealm } from '~system/Runtime'
import {
  classifyArrival,
  parseScenePlotSize,
  parseWorldSession,
  serializeWorldSession,
  visitorIsTransiting,
  visitorNearPlotEdge,
  worldSessionLive,
  hopTargetsThisScene,
  arrivalNearSpawnXZ,
  shouldSnapshotFlyPose,
  WORLD_SESSION_KEY,
  type ArrivalKind,
  type WorldSession
} from '@shared/world-transit-contract'
import { type ArrivalPoint } from '@shared/arrival-contract'

let systemOn = false
let realmName = ''
let realmUrl = ''
let kind: ArrivalKind | null = null
let plot: { spawnX: number; spawnZ: number; sizeX: number; sizeZ: number } | null = null
let spawn: ArrivalPoint | null = null
let parcels: Array<{ x: number; y: number }> = []
let sceneBase: string | null = null
let lastProbe: { x: number; y: number; z: number } | null = null
let heartbeatAt = 0
let session: WorldSession | null = null
let flySnapshot: ArrivalPoint | null = null
let capturedToSpawn = false
let spawnOptOut = false
let sessionAtBoot: WorldSession | null = null
let sessionAtBootLatched = false

function storage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } | null {
  return (globalThis as { localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } })
    .localStorage ?? null
}

function readSession(): WorldSession | null {
  try {
    return parseWorldSession(storage()?.getItem(WORLD_SESSION_KEY))
  } catch {
    return null
  }
}

function writeSession(next: WorldSession): void {
  session = next
  try {
    storage()?.setItem(WORLD_SESSION_KEY, serializeWorldSession(next))
  } catch {
    // Unity builds without localStorage still classify from pose.
  }
}

function latchSessionAtBoot(found: WorldSession | null, allowEmpty: boolean): void {
  if (sessionAtBootLatched) return
  if (!found && !allowEmpty) return
  sessionAtBoot = found
  sessionAtBootLatched = true
}

function reclassify(dt: number): void {
  const pos = Transform.getOrNull(engine.PlayerEntity)?.position
  const prev = lastProbe
  if (pos) {
    lastProbe = { x: pos.x, y: pos.y, z: pos.z }
    noteFlySnapshotIfAway(pos, spawn)
  }

  const sessionLive = realmName ? worldSessionLive(session, realmName, Date.now()) : false
  const hopToHere = hopTargetsThisScene(session?.hopTo, sceneBase, parcels)
  const nearSpawnXZ =
    Boolean(pos) &&
    Boolean(spawn) &&
    arrivalNearSpawnXZ({
      playerX: pos!.x,
      playerZ: pos!.z,
      spawnX: spawn!.x,
      spawnZ: spawn!.z
    })
  const nearEdge =
    Boolean(pos) &&
    Boolean(plot) &&
    visitorNearPlotEdge({
      playerX: pos!.x,
      playerZ: pos!.z,
      spawnX: plot!.spawnX,
      spawnZ: plot!.spawnZ,
      sizeX: plot!.sizeX,
      sizeZ: plot!.sizeZ
    })
  const transiting =
    Boolean(pos) &&
    Boolean(prev) &&
    dt > 0 &&
    visitorIsTransiting({
      speedX: (pos!.x - prev!.x) / dt,
      speedZ: (pos!.z - prev!.z) / dt,
      speedY: (pos!.y - prev!.y) / dt,
      nearSpawnXZ,
      playerY: pos!.y,
      spawnY: spawn?.y
    })

  const next = classifyArrival({
    sessionLive,
    hopToHere,
    nearEdge,
    transiting,
    spawnKnown: spawn !== null,
    playerKnown: Boolean(pos),
    nearSpawnXZ
  })
  // Latch a crossing: later stillness must not rewrite a fly-in into a join.
  // A hop-to-here may still win so a closed-door pick-up restores to spawn.
  if (kind !== 'crossing' || hopToHere) kind = next
}

function pulseSession(now: number): void {
  if (!realmName) return
  heartbeatAt = now
  writeSession({
    realm: realmName,
    t: now,
    ...(session?.hopTo ? { hopTo: session.hopTo } : {})
  })
}

function worldSessionSystem(dt: number): void {
  reclassify(dt)
  const now = Date.now()
  if (now - heartbeatAt < 2_000) return
  pulseSession(now)
}

async function adoptRealm(): Promise<void> {
  try {
    const realm = await getRealm({})
    const info = realm.realmInfo
    const name = (info?.realmName ?? '').trim()
    const base = (info?.baseUrl ?? '').replace(/\/contents\/?$/i, '').replace(/\/$/, '')
    realmName = name
    realmUrl =
      name.includes('://')
        ? name
        : base && name
          ? `${base}/world/${name}`
          : name
    session = readSession()
    latchSessionAtBoot(session, true)
    reclassify(1 / 30)
    pulseSession(Date.now())
  } catch (error) {
    console.log(`[world-session] getRealm failed — ${String(error)}`)
  }
}

/** Called from `main()`, before anything is awaited. Safe to call twice. */
export function primeWorldSession(): void {
  session = readSession()
  latchSessionAtBoot(session, false)
  if (!systemOn) {
    engine.addSystem(worldSessionSystem)
    systemOn = true
  }
  void adoptRealm()
}

/** Scene.json plot + spawn, once arrival has them. */
export function noteWorldTransitPlot(input: {
  metadataJson: string | null
  spawn: ArrivalPoint | null
  sceneBase?: string | null
}): void {
  spawn = input.spawn
  const plotSize = parseScenePlotSize(input.metadataJson)
  if (plotSize) {
    parcels = plotSize.parcels
    sceneBase = input.sceneBase ?? (plotSize.base ? `${plotSize.base.x},${plotSize.base.y}` : sceneBase)
    plot = {
      spawnX: input.spawn?.x ?? plotSize.sizeX / 2,
      spawnZ: input.spawn?.z ?? plotSize.sizeZ / 2,
      sizeX: plotSize.sizeX,
      sizeZ: plotSize.sizeZ
    }
  } else if (input.sceneBase) {
    sceneBase = input.sceneBase
    if (plot && input.spawn) {
      plot = { ...plot, spawnX: input.spawn.x, spawnZ: input.spawn.z }
    }
  }
  reclassify(1 / 30)
}

export function markWorldHop(parcel: { x: number; y: number }): void {
  if (!realmName) return
  writeSession({ realm: realmName, t: Date.now(), hopTo: `${parcel.x},${parcel.y}` })
}

export function currentRealmUrl(): string {
  return realmUrl
}

export function currentRealmName(): string {
  return realmName
}

export function worldArrivalKind(): ArrivalKind | null {
  return kind
}

export function isWorldCrossing(): boolean {
  return kind === 'crossing'
}

export function worldTransitSpawn(): ArrivalPoint | null {
  return spawn
}

export function noteFlySnapshotIfAway(
  player: { x: number; y: number; z: number },
  at: ArrivalPoint | null
): void {
  if (flySnapshot || spawnOptOut) return
  // A hop they asked for lands at spawn on purpose — do not offer KEEP FLYING.
  if (worldHopPending()) return
  if (!shouldSnapshotFlyPose({ player, spawn: at })) return
  flySnapshot = { x: player.x, y: player.y, z: player.z }
}

export function markCapturedToSpawn(): void {
  if (flySnapshot && !spawnOptOut) capturedToSpawn = true
}

export function optOutOfSpawnCapture(): void {
  spawnOptOut = true
  capturedToSpawn = false
}

export function flySnapshotPose(): ArrivalPoint | null {
  return flySnapshot
}

export function hasFlySnapshot(): boolean {
  return flySnapshot !== null
}

export function wasCapturedToSpawn(): boolean {
  return capturedToSpawn
}

export function spawnCaptureOptedOut(): boolean {
  return spawnOptOut
}

/** True when this scene loaded with a leftover World session — a hop, not a cold login. */
export function arrivedWithLiveSession(): boolean {
  if (!sessionAtBoot || !realmName) return false
  return worldSessionLive(sessionAtBoot, realmName, Date.now())
}

export function worldHopPending(): boolean {
  return Boolean(session?.hopTo)
}
