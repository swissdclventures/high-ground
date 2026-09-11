/**
 * Weather-style no-op. Object Studio runs in the Builder (Object library).
 * Placed GLBs are already baked into the published building mesh.
 */
import { OBJECT_STUDIO_APP } from "@shared/venue-app-contract";
import type { ScenePluginContext } from "./types";

export function startObjectStudioPlugin(_ctx: ScenePluginContext): void {
  console.log(`[plugin] ${OBJECT_STUDIO_APP.id} builder object generation`);
}
