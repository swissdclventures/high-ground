export type { ScenePluginContext } from "./types";

import type { PluginStartResult } from "@shared/plugin-contract";
import { bindingsFromBehaviors, planPluginStart } from "@shared/plugin-kernel";
import {
  FIRST_PARTY_PLUGIN_MANIFESTS,
  enabledPluginIdsFromApps,
} from "@shared/plugin-catalogue";
import {
  GATE_APP,
  LANDING_APP,
  OBJECT_STUDIO_APP,
  PUNCH_MACHINE_APP,
  WORLD_MAP_APP,
} from "@shared/venue-app-contract";
import type { ScenePluginContext } from "./types";
import { startPunchMachinePlugin } from "./punch-machine";
import { startGatePlugin } from "./gate";
import { startLandingPlugin } from "./landing";
import { startObjectStudioPlugin } from "./object-studio";
import { initAdminFx } from "../effects/admin-fx";
import { afterBoot } from "../boot-pace";
import { reportBootHealth } from "../boot-health";
import { startWorldMapPlugin } from "./world-map";
import { markPluginActive } from "./active";

type ScenePluginStarter = (ctx: ScenePluginContext) => void;

function shortPluginName(id: string): string {
  return id.replace(/^swissverse\./, "");
}

/** High Ground's live plugin set — not the full Swissverse catalogue. */
const STARTERS: Record<string, ScenePluginStarter> = {
  [GATE_APP.id]: startGatePlugin,
  [LANDING_APP.id]: startLandingPlugin,
  [WORLD_MAP_APP.id]: startWorldMapPlugin,
  [OBJECT_STUDIO_APP.id]: startObjectStudioPlugin,
  [PUNCH_MACHINE_APP.id]: startPunchMachinePlugin,
};

export function startScenePlugins(ctx: ScenePluginContext): PluginStartResult[] {
  initAdminFx();
  const plan = planPluginStart({
    manifests: FIRST_PARTY_PLUGIN_MANIFESTS,
    enabledPluginIds: enabledPluginIdsFromApps(ctx.social.apps),
    availableBindings: bindingsFromBehaviors(ctx.handles.map((handle) => handle.spec.behavior)),
    grantedOverrides: [],
  });

  for (const result of plan.results) {
    const extra = result.reason ? ` — ${result.reason}` : "";
    console.log(`[plugin] ${result.pluginId} ${result.status}${extra}`);
    if (result.status === "blocked") {
      reportBootHealth(shortPluginName(result.pluginId), "failed", result.reason);
    }
  }

  for (const slot of plan.schedule) markPluginActive(slot.pluginId);

  for (const slot of plan.schedule) {
    const starter = STARTERS[slot.pluginId];
    if (!starter) {
      console.log(`[plugin] ${slot.pluginId} started — missing scene starter`);
      continue;
    }
    const run = () => starter(ctx);
    if (slot.delayS <= 0) {
      try {
        run();
        reportBootHealth(shortPluginName(slot.pluginId), "ok");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`[plugin] ${slot.pluginId} FAILED — ${message}`);
        reportBootHealth(shortPluginName(slot.pluginId), "failed", message);
      }
      continue;
    }
    afterBoot(slot.delayS, shortPluginName(slot.pluginId), run);
    console.log(`[plugin] ${slot.pluginId} ${slot.loadClass} +${slot.delayS}s`);
  }

  return plan.results;
}
