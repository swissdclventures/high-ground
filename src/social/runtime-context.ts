import type { SceneRuntimeConfig } from '@shared/scene-runtime-config'
import type { RuntimeFloorZone } from '@shared/scene-runtime-config'

let runtimeConfig: SceneRuntimeConfig | null = null

export function setRuntimeContext(config: SceneRuntimeConfig): void {
  runtimeConfig = config
}

export function getRuntimeContext(): SceneRuntimeConfig | null {
  return runtimeConfig
}

export function getRuntimeFloorZones(): RuntimeFloorZone[] {
  return runtimeConfig?.floorZones ?? []
}
