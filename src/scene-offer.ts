/**
 * Optional entrance / KEEP FLYING — the systematic choice a crossing
 * visitor is owed instead of a silent teleport.
 *
 * Default for a fly-in is the island (arrival restore). KEEP FLYING puts them
 * back on the pose we snapped before that restore. Punch already has its own
 * cloud for a fall off the island; this is the same question on the way IN.
 */
import { engine, Transform } from '@dcl/sdk/ecs'
import { movePlayerTo } from '~system/RestrictedActions'
import {
  shouldOfferKeepFlying,
  shouldOfferSceneSpawn
} from '@shared/world-transit-contract'
import { isAccessCurtainUp } from './access-gate/curtain'
import { releaseArrival } from './arrival'
import { abortLandingCover, isLandingCoverVisible } from './plugins/landing'
import { isPunchMachineActive, punchMachineHud } from './plugins/punch-machine'
import { getRuntimeContext } from './social/runtime-context'
import {
  flySnapshotPose,
  optOutOfSpawnCapture,
  wasCapturedToSpawn,
  worldArrivalKind,
  worldTransitSpawn
} from './world-session'

let dismissed = false
let going = false
let systemOn = false
let title = ''

export function sceneOfferHud(): {
  title: string
  visible: boolean
  keepFlying: boolean
} | null {
  if (!shouldShowKeepFlying() && !shouldShowTakeMeThere()) return null
  return {
    title: title || 'this scene',
    visible: true,
    keepFlying: shouldShowKeepFlying()
  }
}

export function dismissSceneOffer(): void {
  dismissed = true
}

export function keepFlying(): void {
  if (going) return
  going = true
  dismissed = true
  optOutOfSpawnCapture()
  releaseArrival()
  abortLandingCover()
  const pose = flySnapshotPose()
  if (!pose) {
    going = false
    return
  }
  void (async () => {
    try {
      await movePlayerTo({
        newRelativePosition: { x: pose.x, y: pose.y, z: pose.z }
      })
    } catch {
      dismissed = false
    } finally {
      going = false
    }
  })()
}

export function acceptSceneOffer(): void {
  const spawn = offerSpawn()
  if (!spawn || going) return
  going = true
  dismissed = true
  void (async () => {
    try {
      await movePlayerTo({
        newRelativePosition: { x: spawn.x, y: spawn.y, z: spawn.z }
      })
    } catch {
      dismissed = false
    } finally {
      going = false
    }
  })()
}

function offerSpawn(): { x: number; y: number; z: number } | null {
  return worldTransitSpawn() ?? getRuntimeContext()?.spawn ?? null
}

function offerFlags() {
  return {
    dismissed,
    accessCurtain: isAccessCurtainUp(),
    punchFallPrompt: isPunchMachineActive() && punchMachineHud().fallPrompt,
    landingCover: isLandingCoverVisible()
  }
}

function shouldShowKeepFlying(): boolean {
  return shouldOfferKeepFlying({
    kind: worldArrivalKind() ?? 'join',
    captured: wasCapturedToSpawn(),
    ...offerFlags()
  })
}

function shouldShowTakeMeThere(): boolean {
  if (isLandingCoverVisible() || wasCapturedToSpawn()) return false
  const spawn = offerSpawn()
  const player = Transform.getOrNull(engine.PlayerEntity)?.position ?? null
  const flags = offerFlags()
  return shouldOfferSceneSpawn({
    kind: worldArrivalKind() ?? 'join',
    spawn,
    player,
    dismissed: flags.dismissed,
    accessCurtain: flags.accessCurtain,
    punchFallPrompt: flags.punchFallPrompt
  })
}

function sceneOfferSystem(): void {
  if (!title) {
    const name = getRuntimeContext()?.buildingName?.trim()
    if (name) title = name
  }
}

export function startSceneOffer(): void {
  if (systemOn) return
  engine.addSystem(sceneOfferSystem)
  systemOn = true
}

export function isSceneOfferActive(): boolean {
  return shouldShowKeepFlying() || shouldShowTakeMeThere()
}
