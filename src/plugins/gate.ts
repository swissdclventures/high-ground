/**
 * Gate — full-screen arrival hold until the world is ready, then a slow blend.
 *
 * loadClass is immediate so this covers the camera before deferred plugins draw.
 * Readiness is GltfContainer loading state (plus a short min hold). Music is
 * silenced through hostAudioArrivalGain, not a second player.
 */
import { engine, GltfContainer, GltfContainerLoadingState, InputModifier, Transform } from '@dcl/sdk/ecs'
import {
  GATE_APP_ID,
  GATE_FADE_S,
  GATE_HOLD_NAME_UNKNOWN,
  GATE_MAX_HOLD_S,
  GATE_MIN_HOLD_S,
  gateMusicGain,
  gateOverlayAlpha,
  normalizeGateAppConfig,
  resolveGateHoldName,
  worldReadyForArrival,
  type GatePhase
} from '@shared/gate-contract'
import { isLandingTransit, isLandingWalkIn } from '@shared/landing-contract'
import { arrivalPending } from '../arrival'
import { setHostAudioArrivalGain } from '../audio/arrival-gain'
import type { SceneRuntimeConfig } from '@shared/scene-runtime-config'
import type { ScenePluginContext } from './types'

interface GateState {
  phase: GatePhase
  holdName: string
  /** 0..1 load fraction painted on the scrap-bar track. */
  progress: number
  overlayAlpha: number
  blendT: number
  elapsedS: number
  gltfSeen: number
}

const state: GateState = {
  phase: 'off',
  // Unknown until the config lands. Never a placeholder name — see
  // GATE_HOLD_NAME_UNKNOWN in the contract.
  holdName: GATE_HOLD_NAME_UNKNOWN,
  progress: 0,
  overlayAlpha: 0,
  blendT: 0,
  elapsedS: 0,
  gltfSeen: 0
}

let systemOn = false
let locomotionLocked = false
/**
 * True between `primeBootCover()` and the config landing. See
 * `worldReadyForArrival`: while it is set, mesh readiness is meaningless
 * because no mesh has been created yet.
 */
let bootPending = false
/** Last player XZ for the transit probe — walking/flying in must not sit in hold. */
let lastPlayer: { x: number; z: number } | null = null
/** Once this boot skipped the cover, later plugin starts must not raise it again. */
let skippedThisBoot = false

function playerIsInTransit(dt: number): boolean {
  const pos = Transform.getOrNull(engine.PlayerEntity)?.position
  if (!pos) return false
  const prev = lastPlayer
  lastPlayer = { x: pos.x, z: pos.z }
  if (!prev || dt <= 0) return false
  return isLandingTransit({ speedX: (pos.x - prev.x) / dt, speedZ: (pos.z - prev.z) / dt })
}

export function gateHoldActive(): boolean {
  return state.phase === 'hold' || state.phase === 'blend'
}

export function gateHudState(): {
  active: boolean
  holdName: string
  progress: number
  overlayAlpha: number
} {
  return {
    active: state.overlayAlpha > 0.004,
    holdName: state.holdName,
    progress: state.progress,
    overlayAlpha: state.overlayAlpha
  }
}

function applyGain(): void {
  setHostAudioArrivalGain(gateMusicGain(state.phase, state.blendT))
}

function lockWalk(lock: boolean): void {
  if (lock === locomotionLocked) return
  locomotionLocked = lock
  try {
    if (lock) {
      InputModifier.createOrReplace(engine.PlayerEntity, {
        mode: {
          $case: 'standard',
          standard: {
            disableWalk: true,
            disableRun: true,
            disableJog: true,
            disableJump: true
          }
        }
      })
    } else {
      InputModifier.deleteFrom(engine.PlayerEntity)
    }
  } catch (error) {
    console.log(`[plugin] ${GATE_APP_ID} locomotion lock skipped — ${String(error)}`)
  }
}

function countGltfs(): { total: number; unready: number } {
  let total = 0
  let unready = 0
  for (const [entity] of engine.getEntitiesWith(GltfContainer)) {
    total += 1
    const loading = GltfContainerLoadingState.getOrNull(entity)
    const current = loading?.currentState
    // Protocol: UNKNOWN=0 LOADING=1. Anything else is finished / error / missing.
    if (current === undefined || current === 0 || current === 1) unready += 1
  }
  return { total, unready }
}

function enterHold(holdName: string): void {
  state.phase = 'hold'
  state.holdName = holdName
  state.progress = 0
  state.overlayAlpha = 1
  state.blendT = 0
  state.elapsedS = 0
  state.gltfSeen = 0
  applyGain()
  lockWalk(true)
}

function finishGate(): void {
  state.phase = 'done'
  state.progress = 1
  state.overlayAlpha = 0
  state.blendT = 1
  applyGain()
  lockWalk(false)
}

function gateSystem(dt: number): void {
  if (state.phase === 'off' || state.phase === 'done') return
  state.elapsedS += Math.max(0, dt)

  if (state.phase === 'hold') {
    // A visitor already travelling — walking or flying across a scene border —
    // must not be frozen behind the boot cover. Login/spawn is still or falling,
    // so it stays in hold. Probe only while the hold is young so a guest who
    // starts walking AFTER they arrived cannot dismiss it.
    // Config can take longer than half a second. Keep probing while boot is
    // still pending so a flyer is not frozen behind the cover waiting on JSON.
    if ((bootPending || state.elapsedS < 0.5) && playerIsInTransit(dt)) {
      skipGateArrival()
      return
    }
    const { total, unready } = countGltfs()
    state.gltfSeen = Math.max(state.gltfSeen, total)
    const loaded = Math.max(0, state.gltfSeen - unready)
    const fromMeshes = state.gltfSeen > 0 ? loaded / state.gltfSeen : 0
    const fromTime = Math.min(1, state.elapsedS / Math.max(GATE_MIN_HOLD_S, 0.001))
    state.progress = Math.max(fromMeshes, fromTime * 0.15)
    state.overlayAlpha = 1
    applyGain()
    if (
      worldReadyForArrival({
        unreadyGltfs: unready,
        elapsedS: state.elapsedS,
        minHoldS: GATE_MIN_HOLD_S,
        maxHoldS: GATE_MAX_HOLD_S,
        bootPending,
        arrivalPending: arrivalPending()
      })
    ) {
      state.phase = 'blend'
      state.blendT = 0
      state.progress = 1
    }
    return
  }

  state.blendT = Math.min(1, state.blendT + dt / GATE_FADE_S)
  state.progress = 1
  state.overlayAlpha = gateOverlayAlpha('blend', state.blendT)
  applyGain()
  if (state.blendT >= 1) finishGate()
}

function ensureSystem(): void {
  if (systemOn) return
  engine.addSystem(gateSystem)
  systemOn = true
}

export function skipGateArrival(): void {
  skippedThisBoot = true
  bootPending = false
  lastPlayer = null
  state.phase = 'off'
  state.progress = 0
  state.overlayAlpha = 0
  state.blendT = 0
  applyGain()
  lockWalk(false)
}

/**
 * THE BOOT COVER — the hold, raised before the config has been read.
 *
 * Called from `main()` ahead of `await loadDeployedConfig()`, which is the
 * only place it can do any good: the gate used to be primed one boot step in,
 * so the window it exists to cover — a network round-trip with an unbuilt scene
 * on screen — was the exact window it was absent for. The Explorer's own
 * loading screen is no help there and cannot be held; it lifts on the
 * renderer's judgement, not on ours.
 *
 * It goes up NAMELESS — bar only. `primeGateArrival` fills the name in place
 * once the world is known, or takes the cover down if the venue runs no gate.
 */
export function primeBootCover(): void {
  skippedThisBoot = false
  bootPending = true
  if (state.phase === 'off' || state.phase === 'done') enterHold(GATE_HOLD_NAME_UNKNOWN)
  ensureSystem()
}

/**
 * Boot is over (finished, failed, or an early-return preview path). Releases the
 * hold-forever rule above WITHOUT touching the phase, so the normal readiness
 * test takes it from here.
 */
export function endGateBootPending(): void {
  bootPending = false
}

export function primeGateArrival(config: SceneRuntimeConfig): void {
  if (skippedThisBoot) return
  bootPending = false
  const enabled = normalizeGateAppConfig(config.social?.apps?.gate).enabled
  if (!enabled) {
    // A cut, not a blend, and deliberately: the boot cover on a gate-off venue
    // has only been up for the config read, and the blend is 6.5 s of held
    // locomotion that nobody asked this scene for.
    skipGateArrival()
    return
  }
  const pos = Transform.getOrNull(engine.PlayerEntity)?.position
  const cols = Math.max(1, config.scene?.cols ?? 1)
  const rows = Math.max(1, config.scene?.rows ?? 1)
  if (
    pos &&
    isLandingWalkIn({
      playerX: pos.x,
      playerZ: pos.z,
      spawnX: config.spawn.x,
      spawnZ: config.spawn.z,
      sizeX: cols * 16,
      sizeZ: rows * 16
    })
  ) {
    skipGateArrival()
    return
  }
  const holdName = resolveGateHoldName({
    worldName: config.worldName,
    buildingName: config.buildingName
  })
  if (state.phase === 'off' || state.phase === 'done') {
    enterHold(holdName)
  } else {
    // Already covered by the boot cover. Rename in place — re-entering the hold
    // would restart elapsedS and hand the visitor a second full wait.
    state.holdName = holdName
  }
  ensureSystem()
}

export function startGatePlugin(ctx: ScenePluginContext): void {
  const config = normalizeGateAppConfig(ctx.social.apps.gate)
  if (!config.enabled) {
    skipGateArrival()
    console.log(`[plugin] ${GATE_APP_ID} off — current boot`)
    return
  }
  primeGateArrival(ctx.config)
  console.log(`[plugin] ${GATE_APP_ID} hold "${state.holdName}"`)
}
