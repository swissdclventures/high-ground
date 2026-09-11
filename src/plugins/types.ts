import type { SocialSurfaceConfig } from "@shared/social-surface-contract";
import type { SceneRuntimeConfig } from "@shared/scene-runtime-config";
import type { MapDataHostApi } from "@shared/map-data-contract";
import type { SmartEntityHandle } from "../smart-entities";

export interface ScenePluginContext {
  social: SocialSurfaceConfig;
  handles: SmartEntityHandle[];
  config: SceneRuntimeConfig;
  /** Read-only host resource. Map plugins render it; they do not own its fetches. */
  mapData: MapDataHostApi;
}

