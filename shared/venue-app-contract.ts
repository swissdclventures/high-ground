/** Sellable Venue app catalogue. Programme instances bind apps to venue capabilities.
 *
 * These cards are plugins on the world host — see shared/plugin-catalogue.ts and
 * rules/plugin-system.md. Do not add a catalogue app without a matching PluginManifest.
 */

/**
 * Where an app is owned.
 * - scene: lives inside the open project (Speakeasy, Gallery, …)
 * - world: World infrastructure — place on the map; may create/open a scene project
 */
export type VenueAppScope = "scene" | "world";

/**
 * How the app sits on a World (install is World-wide; Explorer still boots per scene).
 * - overlay: stamped into every ordinary scene (HUD / guest tools). Never a map destination.
 * - plot: owned by the World; enabled and placed on a plot. May occupy its own scene.
 * - map: placing it creates/opens a scene on the World map (Highway).
 */
export type VenueAppPlacement = "overlay" | "plot" | "map";

export interface VenueAppDescriptor {
  id: string;
  version: number;
  name: string;
  summary: string;
  category: "performance" | "experience" | "utility";
  /** Defaults to "scene" when omitted (legacy catalogue entries). */
  scope: VenueAppScope;
  /** Defaults to plot for scene apps, map for world apps. */
  placement: VenueAppPlacement;
  /**
   * Seeded into `worldInstalledAppIds` when a World is created, then stamped
   * onto every new scene. Overlay apps only. Skybox stays false (opt-in).
   */
  defaultOnNewWorld: boolean;
  requiredBindings: readonly string[];
  entitlementId: string;
  /**
   * CORE functionality wearing an app's clothes. Owner ruling 2026-09-05: the gate
   * "is core functionality, it's got nothing to do with content or project".
   *
   * `core` means exactly one thing: it CANNOT BE UNINSTALLED. It is not something
   * the owner chose to add, so it is not something they can remove.
   *
   * It deliberately does NOT mean "always on". A core app's switch still works —
   * the gate's arrival hold is an owner setting with its own copy ("Untick
   * Apps ▸ Gate to skip the hold"), and the APP law protects the owner's intent in
   * both directions, not just the on direction. It also stays listed in the App
   * library, because that card is the only documentation of what it does.
   *
   * It stays in this catalogue so its id remains known — `normalizeInstalledAppIds`
   * drops ids it does not recognise, so removing it here would quietly strip the
   * gate out of every saved `installedAppIds`.
   *
   * See docs/settings-ownership-inventory.md.
   */
  core?: boolean;
}

function sceneApp(
  partial: Omit<VenueAppDescriptor, "scope" | "placement" | "defaultOnNewWorld"> & {
    defaultOnNewWorld?: boolean;
  },
  placement: VenueAppPlacement = "plot"
): VenueAppDescriptor {
  return { defaultOnNewWorld: false, ...partial, scope: "scene", placement };
}

function overlayApp(
  partial: Omit<VenueAppDescriptor, "scope" | "placement" | "defaultOnNewWorld"> & {
    defaultOnNewWorld?: boolean;
  }
): VenueAppDescriptor {
  return sceneApp(partial, "overlay");
}

/**
 * Arrival hold. Overlay on purpose: every ordinary scene covers spawn until the
 * world is ready. Default ON (see shared/gate-contract.ts) — missing key is enabled.
 */
export const GATE_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.gate", version: 1, name: "Gate",
  summary: "Full-screen arrival hold until the world is ready, then a slow blend into the scene.",
  category: "experience", requiredBindings: [], entitlementId: "system.gate.v1",
  defaultOnNewWorld: true, core: true,
});

/**
 * Default in-world map renderer. The host owns map-data; this app only draws it,
 * so owners can uninstall it or replace it with another compatible renderer.
 */
export const WORLD_MAP_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.world-map", version: 2, name: "World Map",
  summary: "Scene, World, and Federation navigation map powered by the host map-data API.",
  category: "utility", requiredBindings: [], entitlementId: "system.world-map.v2",
  defaultOnNewWorld: true,
});

export const HOST_CONSOLE_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.host-console", version: 1, name: "Host Console",
  summary: "Choose the live controls available to authorized scene hosts.",
  category: "utility", requiredBindings: [], entitlementId: "system.host-console.v1",
});

/**
 * Full-screen arrival cover. Paints on the first scene frame, preloads behind
 * a fight-style meter, then fades out while music fades in. Later the same
 * card grows a lobby / settings page — v1 is cover-only.
 */
export const LANDING_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.landing", version: 1, name: "Landing",
  summary:
    "Hold a full-screen cover while the world, sky, crowd, and music preload, then fade in. Later: lobby / presets.",
  category: "utility", requiredBindings: [], entitlementId: "system.landing.v1",
});

export const VIDEO_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.video", version: 1, name: "Video",
  summary: "Play an external video or Decentraland Cast on a movable screen.",
  category: "experience", requiredBindings: ["media-screen"], entitlementId: "system.video.v1",
});

export const AUDIO_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.audio-music", version: 1, name: "Audio",
  summary: "Venue playlist with prev / pause / play / next on the bottom bar.",
  category: "experience", requiredBindings: [], entitlementId: "system.audio-music.v1",
});

export const AUDIO_STREAM_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.audio-stream", version: 1, name: "Audio Stream",
  summary: "Play an external stream or hosted MP3 URL.",
  category: "experience", requiredBindings: [], entitlementId: "system.audio-stream.v1",
});

export const EMOTE_LIBRARY_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.emote-library", version: 1, name: "Emote Library",
  summary: "Give eligible visitors a scene-local palette of emotes and routines.",
  category: "experience", requiredBindings: [], entitlementId: "system.emote-library.v1",
});

/**
 * Peer-to-peer gifting, in-world.
 *
 * Listed here because of a rule this catalogue now enforces: EVERY button a
 * visitor can see in-world traces to exactly one card on the Apps page. Exchange
 * used to be drawn unconditionally by the launcher bar with no switch anywhere in
 * the builder, so an owner reading "all apps Off" still had a pink EXCHANGE chip
 * in their world and no way to explain or remove it.
 */
export const EXCHANGE_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.exchange", version: 1, name: "Exchange",
  summary: "Gift official Decentraland wearables and emotes to nearby players.",
  category: "utility", requiredBindings: [], entitlementId: "system.exchange.v1",
});

/**
 * Stationed Dance Bug trader — buy / sell / gift to the Swissverse treasury.
 * Stands next to the Speakeasy vending machine when both are on.
 */
export const VENDOR_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.vendor", version: 1, name: "Vendor",
  summary: "Station a vendor who sells and buys Dance Bug and accepts official DCL gifts.",
  category: "utility", requiredBindings: [], entitlementId: "system.vendor.v1",
});

/**
 * Retired. One-shot spectacle lives on Host Frenzy / Stop FX.
 * Kept as a named id so old World lists and MCP aliases still resolve,
 * but it is not in VENUE_APP_CATALOGUE — no Apps card, no in-world chip.
 */
export const FX_LAB_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.fx-lab", version: 1, name: "FX Lab",
  summary: "Retired. Host Frenzy and Stop FX cover one-shot spectacle; rain lives on Weather.",
  category: "utility", requiredBindings: [], entitlementId: "system.fx-lab.v1",
});

/**
 * Host climate controls. Split from FX Lab so rain/snow/cycles can grow without
 * mixing into one-shot spectacle. Admin-only chip on the bottom bar.
 */
export const WEATHER_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.weather", version: 1, name: "Weather",
  summary: "Admin rain, storm, snow, and blizzard — and later timed weather cycles.",
  category: "utility", requiredBindings: [], entitlementId: "system.weather.v1",
});

/**
 * Custom sky for the World.
 *
 * Overlay on purpose: DCL has no world-level custom-sky setting an Explorer
 * actually renders (see shared/skybox-contract.ts), so "world" scope is spelled
 * "every ordinary scene on this World gets the same preset" — which is exactly
 * what an overlay app already means here.
 */
export const SKYBOX_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.skybox", version: 1, name: "Skybox",
  summary: "Replace the sky over this World — five built-in presets, or your own images from the Sky library.",
  category: "experience", requiredBindings: [], entitlementId: "system.skybox.v1",
});

export const BORDER_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.border", version: 2, name: "Border",
  summary: "Atlas-confirmed sector gateways that walk safely between federated Worlds.",
  category: "utility", requiredBindings: [], entitlementId: "system.border.v2",
});

export const OBJECT_STUDIO_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.object-studio",
  version: 1,
  name: "Object Studio",
  summary:
    "Generate 3D objects with your own API keys (Tripo first) and save them to your Object library.",
  category: "utility",
  requiredBindings: [],
  entitlementId: "system.object-studio.v1",
  defaultOnNewWorld: true,
});

/**
 * Avatar-bubble knockback game on a placed pitch.
 *
 * A PLOT app, deliberately not an overlay: an overlay would bubble every scene
 * on the World at its next publish, which is wrong for a game that belongs to
 * one arena. The arena is a `bubble_arena` smart object the owner drags onto
 * open ground, and the bubbles exist only inside its footprint.
 */
export const BUBBLE_BASH_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.bubble-bash", version: 1, name: "Bubble Bash",
  summary: "A bubble arena on your plot — step in, get a giant bubble, smash friends flying.",
  category: "experience", requiredBindings: ["bubble-arena"], entitlementId: "system.bubble-bash.v1",
});

/** Classic one-punch strength game bound to one or more placeable cabinets. */
export const PUNCH_MACHINE_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.punch-machine",
  version: 1,
  name: "Punch Machine",
  summary: "Place a low-poly arcade punch machine with charge, swing, score, and reset gameplay.",
  category: "experience",
  requiredBindings: ["punch-machine"],
  entitlementId: "system.punch-machine.v1",
});

export const GRAVEYARD_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.graveyard",
  version: 1,
  name: "Graveyard",
  summary: "Resting plots for quiet claimed-name holders — flowers, a sit, Rise Again.",
  category: "experience",
  requiredBindings: ["grave-plot"],
  entitlementId: "system.graveyard.v1",
});

export const GARDEN_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.garden",
  version: 1,
  name: "Garden",
  summary: "A lawn that grows while you are away. Walk to mow it, keep patches wild, let friends help.",
  category: "experience",
  requiredBindings: ["garden-bed"],
  entitlementId: "system.garden.v1",
});

/**
 * Rivers, lakes and seas on the parcel grid.
 *
 * A SCENE app, not an overlay, for the reason spelled out in water-contract.ts:
 * a boat cannot cross a scene boundary, so a waterway a boat can sail is one
 * scene the whole way along. Overlaying every scene on the World would give each
 * of them its own disconnected pond.
 */
export const WATER_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.water",
  version: 1,
  name: "Water",
  summary: "Rivers, lakes and seas on the parcel grid — with banks, depth, flow, and room for a boat.",
  category: "experience",
  requiredBindings: ["water-body"],
  entitlementId: "system.water.v1",
});

export const BREAKDANCE_SHOW_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.breakdance-show",
  version: 1,
  name: "Breakdance Show",
  summary: "A repeatable NPC dance battle using named dance and social zones, music, crowd roles, and effects.",
  category: "performance",
  requiredBindings: ["performance-zone", "audience-zone", "effects-zone", "npc-role"],
  entitlementId: "venue-app.breakdance-show.v1",
});

/**
 * The private conversation room.
 *
 * Read shared/speakeasy-room-contract.ts before assuming this app does voice:
 * it cannot, and neither can any other. A Decentraland scene has no voice API —
 * voice is the platform's, proximity-based, and a scene's only lever is the
 * on/off toggle in scene.json. What this app installs is the room AROUND the
 * conversation: a capacity, a door that says whether there is space, a place to
 * gather, and a word to arrivals. The privacy comes from the deployment being a
 * World of its own, which is one earshot.
 */
export const SPEAKEASY_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.speakeasy",
  version: 1,
  name: "Speakeasy",
  summary:
    "Glass entry booth at the world spawn — buy-in / collection gate, then out into the rest of the scene.",
  category: "experience",
  requiredBindings: [],
  entitlementId: "system.speakeasy.v1",
});

/**
 * Artwork on the walls.
 *
 * The builder owns where a frame hangs; the gallery site owns what is inside it.
 * That split is why the scene can swap a piece without a republish — see
 * shared/gallery-contract.ts.
 */
export const GALLERY_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.gallery",
  version: 1,
  name: "Gallery",
  summary:
    "Hang NFT artwork on the walls with a choice of picture frame, curated live from the gallery site.",
  category: "experience",
  requiredBindings: [],
  entitlementId: "system.gallery.v1",
});

/**
 * Every real light in the scene.
 *
 * Cut out of the Gallery, which used to be the only thing in nineteen towers that
 * emitted a photon: hanging artwork was the only way to get a lit room, and a lit room
 * was therefore inexplicable from the Apps page. Now lighting is a card, floors are lit
 * with or without a frame on the wall, and the Gallery consumes this app for its picture
 * lamps rather than owning a private copy of them.
 */
export const LIGHTS_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.lights",
  version: 1,
  name: "Lights",
  summary:
    "Real lamps in your buildings — per floor, with the number, strength and colour you choose. The Gallery's picture lights come from here.",
  category: "utility",
  requiredBindings: [],
  entitlementId: "system.lights.v1",
});

/**
 * Wearables on cylinder pedestals. The builder owns where a plinth sits; the
 * library owns which wearable is on it. Click buys: collection mint or Marketplace.
 * Off by default — never inferred onto an old venue.
 */
export const RETAIL_SHOP_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.retail-shop",
  version: 1,
  name: "Retail Shop",
  summary:
    "Put wearables from the admin wallet on spinning mannequin pedestals, for sale in a chosen building.",
  category: "experience",
  requiredBindings: [],
  entitlementId: "system.retail-shop.v1",
});

/**
 * The whole Decentraland L1 wearable set, one collection per floor.
 *
 * The card carries a building, not a floor plan. Where Retail Shop asks the
 * owner to place each plinth, this app derives every position from the chosen
 * building's own plan — 438 exhibits is not a thing anyone places by hand. The
 * building becomes the museum; that is the unit of the decision.
 *
 * Off by default, and it dedicates a whole building when on.
 */
export const L1_MUSEUM_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.l1-museum",
  version: 1,
  name: "L1 Museum",
  summary:
    "Fill a building with the whole Decentraland L1 wearable set — one collection per floor, placed automatically.",
  category: "experience",
  requiredBindings: [],
  entitlementId: "system.l1-museum.v1",
});

/**
 * NPC/guest hassle. Host owns the crowd; this app borrows interruptible NPCs,
 * approaches guests, escalates, and opens a first-person boxing scrap. Frequency
 * is an app setting. Off by default — never inferred onto an old venue.
 */
export const SCRAP_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.scrap",
  version: 1,
  name: "Scrap",
  summary:
    "NPCs approach guests, escalate, and offer a first-person boxing scrap. You set how often.",
  category: "experience",
  requiredBindings: [],
  entitlementId: "system.scrap.v1",
});

/**
 * Two-player glove ring with a computer fill. Separate from plaza Scrap so a
 * competition pit does not require NPC hassle. Off by default.
 */
export const SCRAP_HUMAN_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.scrap-human",
  version: 1,
  name: "Scrapped Human Edition",
  summary:
    "Street PVP stain you place: fight the computer now, or wait for a guest. Locked in until LEAVE or KO. Empty pad fills with a CPU after 4 seconds.",
  category: "experience",
  requiredBindings: ["scrap-ring"],
  entitlementId: "system.scrap-human.v1",
});

/**
 * Personal Neon Glider (HOVERBOARD). World infrastructure — seeded on every
 * new World with World Map. Sit-in cars are retired. One plugin; do not add
 * a second catalogue card for the glider.
 */
export const VEHICLES_APP: VenueAppDescriptor = overlayApp({
  id: "swissverse.vehicles",
  version: 1,
  name: "Vehicles",
  summary:
    "Neon Glider personal board (HOVERBOARD). World infrastructure — on for every new World and new scene.",
  category: "experience",
  requiredBindings: [],
  entitlementId: "system.vehicles.v1",
  defaultOnNewWorld: true,
});

/** Optional plot movement toys. Elevators remain the building circulation system. */
export const TRAVERSAL_APP: VenueAppDescriptor = sceneApp({
  id: "swissverse.traversal",
  version: 1,
  name: "Traversal",
  summary: "Add optional jump pads and directional speed corridors to this scene.",
  category: "experience",
  requiredBindings: [],
  entitlementId: "system.traversal.v1",
});

/**
 * World transit — placed on the World map as its own corridor scene.
 *
 * Not a scene app you toggle onto a venue plot. Apps ▸ World ▸ Place highway
 * drops the strip; venues sit on parcels adjacent to it. The id/entitlement keep
 * the train-era names — they are stable identifiers baked into saved drafts.
 */
export const TRAIN_APP: VenueAppDescriptor = {
  id: "swissverse.train",
  version: 1,
  name: "Highway",
  summary:
    "Cross-map flight superhighway. Place it on the World map; fly it extremely fast; park venue scenes beside the strip.",
  category: "experience",
  scope: "world",
  placement: "map",
  defaultOnNewWorld: false,
  requiredBindings: [],
  entitlementId: "system.train.v1",
};

export const VENUE_APP_CATALOGUE = [
  GATE_APP, WORLD_MAP_APP, HOST_CONSOLE_APP, LANDING_APP, VIDEO_APP, AUDIO_APP, AUDIO_STREAM_APP, EMOTE_LIBRARY_APP, SPEAKEASY_APP, BREAKDANCE_SHOW_APP,
  GALLERY_APP, LIGHTS_APP, RETAIL_SHOP_APP, L1_MUSEUM_APP, SCRAP_APP, SCRAP_HUMAN_APP, VEHICLES_APP, EXCHANGE_APP, VENDOR_APP,
  WEATHER_APP, SKYBOX_APP, BORDER_APP, OBJECT_STUDIO_APP, TRAVERSAL_APP,
  BUBBLE_BASH_APP,
  PUNCH_MACHINE_APP,
  GRAVEYARD_APP,
  GARDEN_APP,
  WATER_APP,
  TRAIN_APP,
] as const;

const CORE_APP_IDS: ReadonlySet<string> = new Set(
  VENUE_APP_CATALOGUE.filter((app) => app.core).map((app) => app.id)
);

/**
 * Core functionality that merely lives in the app catalogue: always installed,
 * always on, never offered in the library. Today that is the gate alone.
 */
export function isCoreAppId(id: string): boolean {
  return CORE_APP_IDS.has(id);
}

export const SCENE_APP_CATALOGUE = VENUE_APP_CATALOGUE.filter((app) => app.scope === "scene");
export const WORLD_APP_CATALOGUE = VENUE_APP_CATALOGUE.filter((app) => app.scope === "world");
export const OVERLAY_APP_CATALOGUE = VENUE_APP_CATALOGUE.filter((app) => app.placement === "overlay");
export const PLOT_APP_CATALOGUE = VENUE_APP_CATALOGUE.filter((app) => app.placement === "plot");
export const MAP_APP_CATALOGUE = VENUE_APP_CATALOGUE.filter((app) => app.placement === "map");

export function venueAppById(id: string): VenueAppDescriptor | undefined {
  return VENUE_APP_CATALOGUE.find((app) => app.id === id);
}

export function venueAppPlacement(id: string): VenueAppPlacement {
  return venueAppById(id)?.placement ?? "plot";
}

/** Catalogue ids with `defaultOnNewWorld: true` — Gate, World Map, Vehicles, and Object Studio. */
export function defaultWorldOverlayAppIds(): string[] {
  return VENUE_APP_CATALOGUE.filter((app) => app.defaultOnNewWorld).map((app) => app.id);
}
