/**
 * First-party apps as plugin manifests.
 *
 * The Builder catalogue (venue-app-contract.ts) is the card the owner sees.
 * This file is the same apps described as kernel consumers. Host Console, Video,
 * World Map, Audio, Emote Library, Speakeasy, Gallery, Retail Shop, Scrap,
 * Vehicles, Exchange, and Vendor are runtime: "kernel"; the rest stay legacy-boot.
 *
 * ## tier / provides / platformBound
 *
 * `tier` is omitted everywhere here, which means `core-plugin` — every app in
 * this file ships in the box. The first `community` manifest will not live in
 * this file at all.
 *
 * `provides` is omitted everywhere, which means `[]`. That is not an oversight:
 * the host still owns every capability in HOST_API_IDS. NPCs are
 * `scene/src/dance/*`, media is `scene/src/social/media.ts`, the HUD is
 * `scene/src/social/hud-*` — nothing here is a plugin's to withdraw yet. The
 * first non-empty `provides` is the decoupling milestone.
 *
 * `platformBound` is stated only where it is FALSE, because portability is a
 * claim someone earns. The eleven below store facts about a place — a video URL,
 * a tile grid, a sky colour, frames on a wall — that another engine could render
 * from the same scene file. Everything else defaults to `true`: a wearable-token
 * gate, a MANA price, an L1 collection and an avatar-physics hoverboard are
 * Decentraland the noun, not Decentraland the renderer.
 */
import type { VenueAppsConfig } from "./social-surface-contract";
import {
  AUDIO_APP,
  AUDIO_STREAM_APP,
  BREAKDANCE_SHOW_APP,
  BUBBLE_BASH_APP,
  PUNCH_MACHINE_APP,
  GRAVEYARD_APP,
  GARDEN_APP,
  WATER_APP,
  EMOTE_LIBRARY_APP,
  EXCHANGE_APP,
  GALLERY_APP,
  GATE_APP,
  HOST_CONSOLE_APP,
  LANDING_APP,
  L1_MUSEUM_APP,
  LIGHTS_APP,
  RETAIL_SHOP_APP,
  SCRAP_APP,
  SCRAP_HUMAN_APP,
  SPEAKEASY_APP,
  TRAIN_APP,
  TRAVERSAL_APP,
  VEHICLES_APP,
  VENDOR_APP,
  WEATHER_APP,
  SKYBOX_APP,
  BORDER_APP,
  OBJECT_STUDIO_APP,
  VENUE_APP_CATALOGUE,
  VIDEO_APP,
  WORLD_MAP_APP,
  type VenueAppDescriptor,
} from "./venue-app-contract";
import { PLUGIN_CONTRACT_VERSION, type PluginManifest } from "./plugin-contract";

function manifest(
  app: VenueAppDescriptor,
  extra: Omit<PluginManifest, "contractVersion" | "id" | "version" | "name" | "summary" | "requiredBindings">
): PluginManifest {
  return {
    contractVersion: PLUGIN_CONTRACT_VERSION,
    id: app.id,
    version: app.version,
    name: app.name,
    summary: app.summary,
    requiredBindings: app.requiredBindings,
    ...extra,
  };
}

const LEGACY = {
  requestedOverrides: [] as const,
  passportKeys: [] as const,
  syncMode: "none" as const,
  runtime: "legacy-boot" as const,
  strictBindings: false,
  loadClass: "deferred" as const,
};

export const GATE_PLUGIN: PluginManifest = manifest(GATE_APP, {
  hostApis: ["hud"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "immediate",
});

export const HOST_CONSOLE_PLUGIN: PluginManifest = manifest(HOST_CONSOLE_APP, {
  hostApis: ["hud", "entitlements"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "immediate",
});

export const LANDING_PLUGIN: PluginManifest = manifest(LANDING_APP, {
  hostApis: ["hud"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  // Immediate: the cover must paint on the first HUD frame, before Host chips.
  loadClass: "immediate",
});

export const WORLD_MAP_PLUGIN: PluginManifest = manifest(WORLD_MAP_APP, {
  platformBound: false,
  hostApis: ["map-data", "hud"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "immediate",
});

export const VIDEO_PLUGIN: PluginManifest = manifest(VIDEO_APP, {
  platformBound: false,
  hostApis: ["media"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  // Existing venues can enable Video before a screen exists; do not block them.
  strictBindings: false,
  loadClass: "immediate",
});

export const AUDIO_PLUGIN: PluginManifest = manifest(AUDIO_APP, {
  platformBound: false,
  hostApis: ["media"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  // Playlist-only venues have no emitter entity; do not block them.
  strictBindings: false,
  loadClass: "immediate",
});

export const AUDIO_STREAM_PLUGIN: PluginManifest = manifest(AUDIO_STREAM_APP, {
  platformBound: false,
  hostApis: ["media"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "immediate",
});

export const EMOTE_LIBRARY_PLUGIN: PluginManifest = manifest(EMOTE_LIBRARY_APP, {
  hostApis: ["hud", "entitlements"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "deferred",
});

export const SPEAKEASY_PLUGIN: PluginManifest = manifest(SPEAKEASY_APP, {
  hostApis: ["gating"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "immediate",
});

export const BREAKDANCE_PLUGIN: PluginManifest = manifest(BREAKDANCE_SHOW_APP, {
  hostApis: ["zones", "npcs", "fx"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "legacy-boot",
  strictBindings: true,
  loadClass: "deferred",
});

export const GALLERY_PLUGIN: PluginManifest = manifest(GALLERY_APP, {
  platformBound: false,
  hostApis: [],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "deferred",
});

/**
 * Lamps only — no host API, no binding. The per-floor rows ride the building config and
 * are baked at publish, so the runtime needs nothing from the host but the switch.
 * Deferred: a lamp pool that appears a beat after arrival is invisible; a lamp pool that
 * competes with the first avatar wave is a stutter.
 */
export const LIGHTS_PLUGIN: PluginManifest = manifest(LIGHTS_APP, {
  platformBound: false,
  hostApis: [],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "deferred",
});

export const RETAIL_SHOP_PLUGIN: PluginManifest = manifest(RETAIL_SHOP_APP, {
  hostApis: [],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: true,
  loadClass: "deferred",
});

export const SCRAP_PLUGIN: PluginManifest = manifest(SCRAP_APP, {
  hostApis: ["npcs", "hud", "fx"],
  requestedOverrides: ["npc.asTarget"],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  // Binds to the host crowd that already exists — no extra smart-entity slot.
  strictBindings: false,
  loadClass: "deferred",
});

export const SCRAP_HUMAN_PLUGIN: PluginManifest = manifest(SCRAP_HUMAN_APP, {
  hostApis: ["hud"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  // App can be on before the ring is placed. Missing scrap-ring → no pit, not a boot fail.
  strictBindings: false,
  loadClass: "deferred",
});

export const VEHICLES_PLUGIN: PluginManifest = manifest(VEHICLES_APP, {
  hostApis: ["hud", "sync"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "deferred",
});

export const EXCHANGE_PLUGIN: PluginManifest = manifest(EXCHANGE_APP, {
  hostApis: ["hud"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "deferred",
});

export const VENDOR_PLUGIN: PluginManifest = manifest(VENDOR_APP, {
  // `scene/src/vendor/vendor-npc.ts` spawns the stallholder off the host troupe.
  hostApis: ["hud", "npcs"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "deferred",
});

export const WEATHER_PLUGIN: PluginManifest = manifest(WEATHER_APP, {
  platformBound: false,
  hostApis: ["fx", "hud"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "deferred",
});

export const SKYBOX_PLUGIN: PluginManifest = manifest(SKYBOX_APP, {
  platformBound: false,
  hostApis: [],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  // Deferred: five unlit planes are cheap, but they must not compete with the
  // building's own boot for the Explorer's texture pipeline.
  loadClass: "deferred",
});

export const BORDER_PLUGIN: PluginManifest = manifest(BORDER_APP, {
  platformBound: false,
  hostApis: [],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "deferred",
});

export const OBJECT_STUDIO_PLUGIN: PluginManifest = manifest(OBJECT_STUDIO_APP, {
  hostApis: [],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "deferred",
});

export const BUBBLE_BASH_PLUGIN: PluginManifest = manifest(BUBBLE_BASH_APP, {
  hostApis: ["hud", "fx"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  // The app can be switched on before the arena is dragged out. No arena → no
  // pitch, which is an empty plot, not a boot failure (same as the Scrap ring).
  strictBindings: false,
  // Deferred: bubbles matter once people meet, never during the arrival wave.
  loadClass: "deferred",
});

export const PUNCH_MACHINE_PLUGIN: PluginManifest = manifest(PUNCH_MACHINE_APP, {
  // The show drives host FX, crowd reactions and named floor zones.
  hostApis: ["fx", "npcs", "zones"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: true,
  loadClass: "immediate",
});

export const GRAVEYARD_PLUGIN: PluginManifest = manifest(GRAVEYARD_APP, {
  hostApis: ["fx"],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "deferred",
});

/** Grass cells are meshes; wait for the first avatar wave like every other lawn ornament. */
export const GARDEN_PLUGIN: PluginManifest = manifest(GARDEN_APP, {
  platformBound: false,
  hostApis: [],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "deferred",
});

/**
 * Water surfaces are planes with a scrolling material — cheap to draw, but there
 * is no point drawing a sea before the ground under it exists. Deferred like the
 * Garden, and for the same reason.
 */
export const WATER_PLUGIN: PluginManifest = manifest(WATER_APP, {
  platformBound: false,
  hostApis: [],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  loadClass: "deferred",
});

export const HIGHWAY_PLUGIN: PluginManifest = manifest(TRAIN_APP, {
  ...LEGACY,
  hostApis: [],
});

export const TRAVERSAL_PLUGIN: PluginManifest = manifest(TRAVERSAL_APP, {
  hostApis: [],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: true,
  loadClass: "deferred",
});

export const L1_MUSEUM_PLUGIN: PluginManifest = manifest(L1_MUSEUM_APP, {
  hostApis: [],
  requestedOverrides: [],
  passportKeys: [],
  syncMode: "none",
  runtime: "kernel",
  strictBindings: false,
  // Deferred: the museum streams hundreds of avatars and must not compete with
  // the building's own boot for the Explorer's asset pipeline.
  loadClass: "deferred",
});

export const FIRST_PARTY_PLUGIN_MANIFESTS: readonly PluginManifest[] = [
  GATE_PLUGIN,
  LANDING_PLUGIN,
  WORLD_MAP_PLUGIN,
  HOST_CONSOLE_PLUGIN,
  VIDEO_PLUGIN,
  AUDIO_PLUGIN,
  AUDIO_STREAM_PLUGIN,
  EMOTE_LIBRARY_PLUGIN,
  SPEAKEASY_PLUGIN,
  BREAKDANCE_PLUGIN,
  GALLERY_PLUGIN,
  LIGHTS_PLUGIN,
  RETAIL_SHOP_PLUGIN,
  L1_MUSEUM_PLUGIN,
  SCRAP_PLUGIN,
  SCRAP_HUMAN_PLUGIN,
  VEHICLES_PLUGIN,
  EXCHANGE_PLUGIN,
  VENDOR_PLUGIN,
  WEATHER_PLUGIN,
  SKYBOX_PLUGIN,
  BORDER_PLUGIN,
  OBJECT_STUDIO_PLUGIN,
  TRAVERSAL_PLUGIN,
  BUBBLE_BASH_PLUGIN,
  PUNCH_MACHINE_PLUGIN,
  GRAVEYARD_PLUGIN,
  GARDEN_PLUGIN,
  WATER_PLUGIN,
  HIGHWAY_PLUGIN,
];

const ENABLED_WHEN: Record<string, (apps: VenueAppsConfig) => boolean> = {
  [GATE_APP.id]: (apps) => apps.gate.enabled,
  [LANDING_APP.id]: (apps) => apps.landing?.enabled === true,
  [WORLD_MAP_APP.id]: (apps) => apps.worldMap.enabled,
  [HOST_CONSOLE_APP.id]: (apps) => apps.hostConsole.enabled,
  [VIDEO_APP.id]: (apps) => apps.video.enabled,
  [AUDIO_APP.id]: (apps) => apps.audio.enabled,
  [AUDIO_STREAM_APP.id]: (apps) => apps.audioStream?.enabled === true,
  [EMOTE_LIBRARY_APP.id]: (apps) => apps.emoteLibrary.enabled,
  [SPEAKEASY_APP.id]: (apps) => apps.speakeasy.enabled,
  [GALLERY_APP.id]: (apps) => apps.gallery.enabled,
  [LIGHTS_APP.id]: (apps) => apps.lights?.enabled === true,
  [RETAIL_SHOP_APP.id]: (apps) => apps.retailShop.enabled,
  [L1_MUSEUM_APP.id]: (apps) => apps.l1Museum.enabled,
  [SCRAP_APP.id]: (apps) => apps.scrap.enabled,
  [SCRAP_HUMAN_APP.id]: (apps) =>
    apps.scrapHuman?.enabled === true || apps.scrap.humanEdition === true,
  [VEHICLES_APP.id]: (apps) => apps.vehicles.enabled,
  [EXCHANGE_APP.id]: (apps) => apps.exchange.enabled,
  [VENDOR_APP.id]: (apps) => apps.vendor?.enabled === true,
  [WEATHER_APP.id]: (apps) => apps.weather?.enabled === true,
  [SKYBOX_APP.id]: (apps) => apps.skybox?.enabled === true,
  // Border is a Federation host invariant. The managed listener is scheduled
  // by default and remains inert until Atlas returns a confirmed firm route.
  [BORDER_APP.id]: (apps) =>
    apps.border?.enabled === true || apps.border?.autoManaged !== false,
  [OBJECT_STUDIO_APP.id]: (apps) => apps.objectStudio?.enabled === true,
  [TRAIN_APP.id]: (apps) => apps.train.enabled,
  [TRAVERSAL_APP.id]: (apps) => apps.traversal.enabled,
  [BUBBLE_BASH_APP.id]: (apps) => apps.bubbleBash?.enabled === true,
  [PUNCH_MACHINE_APP.id]: (apps) => apps.punchMachine?.enabled === true,
  [GRAVEYARD_APP.id]: (apps) => apps.graveyard?.enabled === true,
  [GARDEN_APP.id]: (apps) => apps.garden?.enabled === true,
  [WATER_APP.id]: (apps) => apps.water?.enabled === true,
};

export function enabledPluginIdsFromApps(apps: VenueAppsConfig): string[] {
  return FIRST_PARTY_PLUGIN_MANIFESTS
    .filter((plugin) => ENABLED_WHEN[plugin.id]?.(apps) === true)
    .map((plugin) => plugin.id);
}

export function pluginManifestById(id: string): PluginManifest | undefined {
  return FIRST_PARTY_PLUGIN_MANIFESTS.find((plugin) => plugin.id === id);
}

/** Catalogue cards and plugin manifests must stay 1:1 on id. */
export function cataloguePluginIdGap(): string[] {
  const pluginIds = new Set(FIRST_PARTY_PLUGIN_MANIFESTS.map((plugin) => plugin.id));
  return VENUE_APP_CATALOGUE.filter((app) => !pluginIds.has(app.id)).map((app) => app.id);
}
