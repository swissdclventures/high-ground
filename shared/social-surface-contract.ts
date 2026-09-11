/**
 * Surface 4 — Social contract.
 * Event profile, gating, media defaults, zone role bindings for published venues.
 * Canonical spec: rules/surface-4-social.md
 */

import type { MediaScreenFit } from "./media-screen-fit";
import {
  DEFAULT_WORLD_EMOTE_SELECTION,
  normalizeWorldEmoteAssignments,
  normalizeWorldEmoteSelections,
  type WorldEmoteAssignments,
  type WorldEmoteSelection,
} from "./emote-library-assets";
import {
  normalizeMediaScreenSourceAspect,
  parseMediaScreenFit,
} from "./media-screen-fit";
import type { SpeakeasyRoomConfig } from "./speakeasy-room-contract";
import {
  defaultSpeakeasyRoomConfig,
  normalizeSpeakeasyRoomConfig,
} from "./speakeasy-room-contract";
import type { GalleryConfig } from "./gallery-contract";
import { validateGalleryConfig } from "./gallery-contract";
import {
  defaultGalleryConfig,
  normalizeGalleryConfig,
} from "./gallery-spaces";
import type { RetailShopConfig } from "./retail-shop-contract";
import {
  defaultRetailShopConfig,
  normalizeRetailShopConfig,
  validateRetailShopConfig,
} from "./retail-shop-contract";
import type { L1MuseumConfig } from "./l1-museum-contract";
import {
  defaultL1MuseumConfig,
  normalizeL1MuseumConfig,
  validateL1MuseumConfig,
} from "./l1-museum-contract";
import type { TrainCorridorConfig } from "./train-corridor-contract";
import {
  defaultTrainCorridorConfig,
  normalizeTrainCorridorConfig,
} from "./train-corridor-contract";
import type { ScrapConfig, ScrapHumanAppConfig } from "./scrap-contract";
import {
  defaultScrapConfig,
  defaultScrapHumanAppConfig,
  normalizeScrapConfig,
  normalizeScrapHumanAppConfig,
} from "./scrap-contract";
import type { AmbientAudioConfig } from "./ambient-audio-contract";
import {
  defaultAmbientAudioConfig,
  normalizeAmbientAudioConfig,
} from "./ambient-audio-contract";
import type { AudioStreamAppConfig } from "./audio-stream-contract";
import {
  defaultAudioStreamAppConfig,
  normalizeAudioStreamAppConfig,
} from "./audio-stream-contract";
import type { VehiclesAppConfig } from "./vehicle-contract";
import { defaultVehiclesAppConfig, normalizeVehiclesAppConfig } from "./vehicle-contract";
import type { ExchangeConfig } from "./exchange-contract";
import { defaultExchangeConfig, normalizeExchangeConfig } from "./exchange-contract";
import type { VendorAppConfig } from "./vendor-contract";
import {
  defaultVendorAppConfig,
  normalizeVendorAppConfig,
  normalizeVendorNpcConfig,
  defaultVendorNpcConfig,
} from "./vendor-contract";
import type { WeatherAppConfig } from "./weather-contract";
import { defaultWeatherAppConfig, normalizeWeatherAppConfig } from "./weather-contract";
import type { SkyboxAppConfig } from "./skybox-contract";
import { defaultSkyboxAppConfig, normalizeSkyboxAppConfig } from "./skybox-contract";
import type { BorderAppConfig } from "./border-contract";
import { defaultBorderAppConfig, normalizeBorderAppConfig } from "./border-contract";
import type { ObjectStudioAppConfig } from "./object-studio-contract";
import {
  defaultObjectStudioAppConfig,
  normalizeObjectStudioAppConfig,
} from "./object-studio-contract";
import type { LightsAppConfig } from "./lights-app-contract";
import {
  defaultLightsAppConfig,
  normalizeLightsAppConfig,
} from "./lights-app-contract";
import type { TraversalAppConfig } from "./traversal-app-contract";
import {
  defaultTraversalAppConfig,
  normalizeTraversalAppConfig,
} from "./traversal-app-contract";
import type { BubbleBashAppConfig } from "./bubble-bash-contract";
import {
  defaultBubbleBashAppConfig,
  normalizeBubbleBashAppConfig,
} from "./bubble-bash-contract";
import type { PunchMachineAppConfig } from "./punch-machine-contract";
import {
  defaultPunchMachineAppConfig,
  normalizePunchMachineAppConfig,
} from "./punch-machine-contract";
import type { GraveyardAppConfig } from "./graveyard-contract";
import type { GardenAppConfig } from "./garden-contract";
import { defaultGardenAppConfig, normalizeGardenAppConfig } from "./garden-contract";
import type { WaterAppConfig } from "./water-contract";
import { defaultWaterAppConfig, normalizeWaterAppConfig } from "./water-contract";
import {
  defaultGraveyardAppConfig,
  normalizeGraveyardAppConfig,
} from "./graveyard-contract";
import type { LandingAppConfig } from "./landing-contract";
import {
  defaultLandingAppConfig,
  normalizeLandingAppConfig,
} from "./landing-contract";
import type { GateAppConfig } from "./gate-contract";
import {
  GATE_APP_ID,
  defaultGateAppConfig,
  normalizeGateAppConfig,
} from "./gate-contract";
import type { WorldMapAppConfig } from "./world-map-contract";
import { VEHICLES_APP } from "./venue-app-contract";
import {
  WORLD_MAP_APP_ID,
  defaultWorldMapAppConfig,
  normalizeWorldMapAppConfig,
} from "./world-map-contract";
import type {
  DanceMusicConfig,
  DanceVenueConfig,
  NpcGroupRole,
} from "./dance-venue-contract";
import {
  defaultDanceMusicConfig,
  normalizeDanceVenueConfig,
  normalizeSelectedTrackIds,
  validateDanceVenueConfig,
} from "./dance-venue-contract";
import type { VenueProgramme } from "./venue-programme-contract";
import { VENUE_PROGRAMME_SCHEMA_VERSION } from "./venue-programme-contract";
import {
  emptyWalletWardrobe,
  normalizeWalletWardrobe,
  type WalletWardrobe,
} from "./wallet-wardrobe";
import { normalizeInstalledAppIds } from "./app-install";

export const SOCIAL_SURFACE_VERSION = 1 as const;

export type SocialGateMode =
  | "open"
  | "nft_collection"
  | "nft_token"
  | "wearable_equipped"
  | "allowlist";

export type SocialChain = "ethereum" | "polygon";

export type GateMatch = "any" | "all";

export type ZoneRole =
  | "public"
  | "gated"
  | "vip"
  | "stage"
  | "dancefloor"
  | "entry";

export interface GateRule {
  id: string;
  mode: SocialGateMode;
  chain: SocialChain;
  /** Primary collection contract. Kept as `contracts[0]` for back-compat. */
  contract: string | null;
  /**
   * Full collection list for nft_collection. A visitor passes when they hold an
   * item from ANY listed collection (match "any", the default) or ALL of them
   * (match "all"). Mirrors `contract` as its first element. Optional so older
   * single-contract rule literals stay valid; normalizeGateRule always fills it.
   */
  contracts?: string[] | null;
  tokenIds: string[] | null;
  wearableUrns: string[] | null;
  allowedAddresses: string[] | null;
  match: GateMatch;
  deniedMessage: string;
}

/** Unified, deduped, lowercased collection list for a rule (contract + contracts). */
export function gateContracts(rule: {
  contract?: string | null;
  contracts?: string[] | null;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...(rule.contracts ?? []), ...(rule.contract ? [rule.contract] : [])]) {
    const lc = c?.trim().toLowerCase();
    if (lc && !seen.has(lc)) {
      seen.add(lc);
      out.push(lc);
    }
  }
  return out;
}

export interface EventProfile {
  name: string;
  /** Lowercase 0x admin wallets that see the in-scene host console. */
  adminWallets: string[];
  announceOnEnter: string | null;
  /** Predefined emote names allowed for host crowd cues. */
  crowdEmotes: string[];
  /**
   * Legacy optional claim-page URL. Prefer `rewardNft` (host wallet transfer).
   * Placeholders: `{wallet}`, `{userId}`.
   */
  rewardClaimUrlTemplate: string | null;
  /**
   * Prize NFT the host sends from their connected wallet (one click in Host HUD).
   * Host must own the token and be on the configured chain.
   */
  rewardNft: RewardNftConfig | null;
  /** Scene atmosphere — written into scene.json skyboxConfig.fixedTime at
   *  publish so the venue is frozen at night / sunset regardless of DCL time.
   *  `club` = deepest midnight (for dance clubs). Does not change other projects. */
  timeOfDay: "default" | "night" | "sunset" | "club";
  /**
   * When true, THIS publish dims ceiling glow + neon emissives in the exported GLB.
   * Opt-in per event — default false so normal / non-club builds are unaffected.
   */
  dimVenueLights: boolean;
}

/** ERC-721 prize sent via host wallet `safeTransferFrom`. */
export interface RewardNftConfig {
  chain: SocialChain;
  contract: string | null;
  tokenId: string | null;
}

export interface ZoneRoleBinding {
  /** Must reference an existing floor-zone SceneComponent id. */
  zoneComponentId: string;
  role: ZoneRole;
  /** Required when role is gated or vip. */
  gateRuleId: string | null;
}

export interface FloorGateBinding {
  floorIndex: number;
  gateRuleId: string | null;
}

export interface MediaDefaults {
  screenSmartObjectId: string | null;
  audioSmartObjectId: string | null;
  /** https URL, or the cast sentinel (`livekit-video://…`). Null when off. */
  defaultVideoUrl: string | null;
  /** https only */
  defaultAudioUrl: string | null;
  audioSpatial: boolean;
  videoPlayingOnLoad: boolean;
  /** What plays automatically when a guest ARRIVES — mutually exclusive so the
   *  screen's video sound and the dance music never fight. The host can switch
   *  live from the console; this is only the default on entry. */
  arrivalMedia: "none" | "music" | "video";
}

export interface SocialPermissionFlags {
  useWeb3Api: boolean;
  allowTriggerAvatarEmote: boolean;
  allowMovePlayerInsideScene: boolean;
  useFetch: boolean;
}

export type HostConsoleModuleId =
  | "announcements" | "guests" | "access" | "video" | "audio"
  | "breakdance" | "rewards";

export interface AppEntitlement {
  mode: SocialGateMode;
  chain: SocialChain;
  contract: string | null;
  contracts: string[] | null;
  tokenIds: string[] | null;
  wearableUrns: string[] | null;
  allowedAddresses: string[] | null;
  match: GateMatch;
}

/**
 * One screen and what plays on it.
 *
 * A venue has as many screens as it has walls worth filling, and they do not all
 * show the same thing. The single `media.screenSmartObjectId` + one
 * `defaultVideoUrl` that came before this could only ever describe ONE, so the
 * second screen an owner placed was decoration: no way to give it a source.
 *
 * `media.screenSmartObjectId` / `media.defaultVideoUrl` still exist and still
 * mean "the primary screen" — they are kept in step with `screens[0]` by
 * normalize so the publish fail-closed check, the Host Console's play/stop, and
 * every already-published scene keep working unchanged.
 */
export interface MediaScreenBinding {
  /** Smart-object id of the screen entity this source is bound to. */
  screenId: string;
  source: "none" | "url" | "cast";
  /** https URL, or the cast sentinel (`livekit-video://…`). Null when source is "none". */
  url: string | null;
  /** Human label for the builder's screen list. Falls back to the id. */
  label?: string | null;
  /**
   * What happens when the screen's shape is not the video's shape. "crop" fills
   * the panel with the middle of the picture; "stretch" is the old skew. See
   * shared/media-screen-fit.ts.
   */
  fit?: MediaScreenFit;
  /** The source's own aspect — it cannot be measured at runtime, only declared. */
  sourceAspect?: number;
  /**
   * Let a visitor click the 3D panel to enter the square-on Focus View.
   * Optional so scenes published before Focus View keep their old interaction.
   */
  focusView?: boolean;
}

/** One audio emitter and its stream. The venue-wide playlist is separate — it
 *  needs no emitter at all; these are the placed, spatial sources. */
export interface MediaEmitterBinding {
  /** Smart-object id of the audio_source entity. */
  emitterId: string;
  source: "none" | "stream";
  /** https only. Null when source is "none". */
  url: string | null;
  spatial: boolean;
  label?: string | null;
}

/** Installed first-party apps. Their execution is independent of NPC activity. */
export interface VenueAppsConfig {
  /**
   * Arrival hold. Default ON. A missing key on an existing world is enabled —
   * not the usual "new apps start off" rule.
   */
  gate: GateAppConfig;
  /** Default-installed top-right renderer. Data comes from the host map-data API. */
  worldMap: WorldMapAppConfig;
  hostConsole: { enabled: boolean; modules: HostConsoleModuleId[] };
  /**
   * Full-screen arrival cover. Off by default; never inferred onto an old venue.
   * Later the same card grows a lobby / settings page — v1 is cover-only.
   */
  landing: LandingAppConfig;
  video: {
    enabled: boolean;
    /** The PRIMARY screen's source — mirrors `screens[0].source`. */
    source: "none" | "url" | "cast";
    /** Every screen in the scene with its own source. Ordered; [0] is primary. */
    screens: MediaScreenBinding[];
  };
  audio: {
    enabled: boolean;
    source: "none" | "playlist";
    playlist: DanceMusicConfig;
    /** Placed spatial emitters. Stream URLs on these belong to Audio Stream. */
    emitters: MediaEmitterBinding[];
  };
  /** External stream URL. Independent of Audio — uninstalling Audio keeps this. */
  audioStream: AudioStreamAppConfig;
  emoteLibrary: {
    enabled: boolean;
    entitlement: AppEntitlement;
    includeHouse: boolean;
    includeOwned: boolean;
    allowSequences: boolean;
    /** Builder Library picks packaged into this scene's WORLD shelf at publish. */
    worldEmotes: WorldEmoteSelection[];
    assignments: WorldEmoteAssignments;
  };
  /**
   * The private conversation room. NOT a voice app — no scene can have one; see
   * shared/speakeasy-room-contract.ts. It installs the room around the talking:
   * a capacity, a door sign, a gathering circle, a word to arrivals.
   */
  speakeasy: SpeakeasyRoomConfig;
  /**
   * Framed artwork on the walls. The builder owns the placement baked in here;
   * the gallery site owns what hangs in each frame, fetched live at runtime
   * (shared/gallery-contract.ts).
   */
  gallery: GalleryConfig;
  /**
   * Every real lamp in the scene — per-floor room lights and the Gallery's picture
   * lights. The per-FLOOR rows live on each building's `interiorLights`, because a
   * light belongs to a floor of one building and a plot carries many; this is the
   * switch and the settings the lamps share. See shared/lights-app-contract.ts.
   */
  lights: LightsAppConfig;
  /**
   * Wearables on cylinder pedestals. Off by default; never inferred onto an old venue.
   */
  retailShop: RetailShopConfig;
  /**
   * The whole L1 wearable set, one collection per floor of a chosen building.
   * Off by default — it dedicates a building, which is never something to infer.
   */
  l1Museum: L1MuseumConfig;
  /**
   * NPC/guest hassle. Off by default; never inferred onto an old venue.
   * Host still owns the crowd — this app borrows interruptible NPCs.
   */
  scrap: ScrapConfig;
  /**
   * Scrapped Human Edition ring. Off by default; never inferred onto an old venue.
   */
  scrapHuman: ScrapHumanAppConfig;
  /**
   * Parked sit-in craft + Neon Glider. Off by default; never inferred onto an old venue.
   */
  vehicles: VehiclesAppConfig;
  /**
   * Peer-to-peer gifting. Before this switch existed the EXCHANGE chip was drawn
   * unconditionally by the launcher bar. The stationed Dance Bug trader is Vendor.
   */
  exchange: ExchangeConfig;
  /**
   * Stationed vendor NPC beside the Dance Bug machine — buy / sell / gift to treasury.
   * Off by default on a brand-new venue; migrated on when an old Exchange stall was on.
   */
  vendor: VendorAppConfig;
  /**
   * Admin climate controls (rain / snow / cycles). Split from FX Lab.
   * Admin-gated at runtime; this switch decides whether the WEATHER chip exists.
   */
  weather: WeatherAppConfig;
  /**
   * Custom sky. Off by default. `scope: "world"` means the Builder stamps the same
   * preset into every ordinary scene it publishes on this World — DCL has no
   * world-level custom-sky setting an Explorer honours (shared/skybox-contract.ts).
   */
  skybox: SkyboxAppConfig;
  /**
   * Federation-edge teleporter strips. Off by default; never migrated on.
   * Destinations live on the scene so a published World does not need Builder overlay storage.
   */
  border: BorderAppConfig;
  /**
   * Builder Object library generation (Tripo first). Off by default.
   * API keys are never stored here — only the on/off switch.
   */
  objectStudio: ObjectStudioAppConfig;
  /** Optional jump pads and speed corridors. Elevators do not depend on this app. */
  traversal: TraversalAppConfig;
  /**
   * Avatar-bubble knockback game (proof of concept). Off by default; never
   * inferred onto an old venue.
   */
  bubbleBash: BubbleBashAppConfig;
  /** Placeable one-punch arcade cabinet. Missing on old scenes means off. */
  punchMachine: PunchMachineAppConfig;
  /**
   * Resting plots for quiet claimed-name holders. Off by default; never inferred
   * onto an old venue. Placement is smart objects; census is live after publish.
   */
  graveyard: GraveyardAppConfig;
  /**
   * A lawn that grows while the owner is away. Off by default; never inferred
   * onto an old venue. Beds are smart objects; growth is live after publish.
   */
  garden: GardenAppConfig;
  /**
   * Rivers, lakes and seas on the parcel grid. Off by default and never inferred
   * onto an old venue — flooding a published plot is not a migration. Tiles are
   * smart objects; the water is drawn from them at runtime.
   */
  water: WaterAppConfig;
  /**
   * Retired one-shot spectacle switch. Config key kept so old saves round-trip
   * and weather can still migrate from a missing `weather` key. No Apps card,
   * no in-world chip — Host Frenzy / Stop FX cover spectacle.
   */
  fxLab: { enabled: boolean };
  /**
   * Shuttle along the plot's long axis. Its travel axis is NOT stored resolved —
   * see shared/train-corridor-contract.ts; the same config must behave on a
   * corridor strip and on a square parcel.
   */
  train: TrainCorridorConfig;
}

export interface SocialSurfaceConfig {
  version: typeof SOCIAL_SURFACE_VERSION;
  /** Stable identity for capability-bound programmes. This must never be derived
   *  from the editable build name: renaming a project must not invalidate its
   *  saved programmes. Legacy configs may omit it until their next save. */
  venueId?: string | null;
  enabled: boolean;
  event: EventProfile;
  gates: GateRule[];
  /** Optional parcel / primary-entry gate. */
  buildingGateRuleId: string | null;
  floorGates: FloorGateBinding[];
  zoneRoles: ZoneRoleBinding[];
  media: MediaDefaults;
  /**
   * Scene background bed. Not an app — uninstalling Audio must not remove it.
   */
  ambient: AmbientAudioConfig;
  permissions: SocialPermissionFlags;
  apps: VenueAppsConfig;
  /**
   * Catalogue ids installed on this scene from the App library (`/apps`).
   * The Apps tab lists these. `enabled` on each app is a separate switch
   * (runs in the published world). Missing on old saves: currently-enabled
   * apps are treated as installed so they stay on the tab.
   */
  installedAppIds: string[];
  /** Dance venue activity module (shared/dance-venue-contract.ts). Null = off. */
  dance?: DanceVenueConfig | null;
  /** Saved Venue Console programmes (shared/venue-programme-contract.ts) — named,
   *  reusable app configurations. Stored here so they travel with the Console's
   *  config surface; they are operational data, not construction data. */
  programmes?: VenueProgramme[];
  /**
   * Shortlist copied from a scene admin's live DCL backpack (L1 + Polygon).
   * Not a global MCP wardrobe — each scene's adminWallets own different items.
   * Fetch live with list_wallet_wearables, then save a subset here.
   */
  wardrobe?: WalletWardrobe;
}

/** Extended smart entity types for Surface 4 (elevator remains in smart-object-contract). */
export type SocialSmartEntityType =
  | "sliding_door"
  | "access_gate"
  | "media_screen"
  | "audio_source"
  | "claw_machine"
  | "scrap_ring"
  | "bubble_arena"
  | "grave_plot"
  | "graveyard_grounds"
  | "garden_bed"
  | "water_tile";

export type SocialSmartBehaviorKind =
  | "synced_door"
  | "gate_barrier"
  | "video_surface"
  | "audio_stream"
  | "claw_vending";

/** Per-guest gate badge shown in the host HUD. */
export type GuestGateStatus = "pass" | "fail" | "guest" | "locked";

/** Development-only spectacle controls exposed to venue admins in the FX Lab. */
export type AdminFxSkyPreset = "off" | "aurora" | "portal" | "red_storm";
export type AdminFxRainLevel = "off" | "light" | "storm";
export type AdminFxSnowLevel = "off" | "light" | "blizzard";
export type AdminFxFogLevel = "off" | "haze" | "dense";
export type AdminFxDayNight = "default" | "day" | "sunset" | "night";
export type AdminFxBurstKind = "confetti" | "sparks" | "ash" | "fire";
export type AdminFxOverlayMode = "off" | "vignette";
export type AdminFxCommand =
  | { kind: "ground_shake"; intensity: "light" | "heavy" }
  | { kind: "rain"; level: AdminFxRainLevel }
  | { kind: "sky"; preset: AdminFxSkyPreset }
  | { kind: "snow"; level: AdminFxSnowLevel }
  | { kind: "fog"; level: AdminFxFogLevel }
  | { kind: "day_night"; preset: AdminFxDayNight }
  | { kind: "lightning" }
  | { kind: "blackout"; active: boolean }
  | { kind: "burst"; style: AdminFxBurstKind }
  | { kind: "overlay"; mode: AdminFxOverlayMode }
  | { kind: "flash" }
  | { kind: "reset" };

/** messageBus catalog v1 — keep in sync with scene runtime. */
export type SocialBusMessage =
  | { type: "door.set"; id: string; open: boolean }
  | { type: "media.video"; id: string; src: string; playing: boolean; volume: number }
  | { type: "media.audio"; id: string; src: string; playing: boolean; volume: number }
  | { type: "host.announce"; text: string }
  | { type: "host.emote"; emote: string }
  | { type: "host.toast"; text: string; targetUserId: string }
  | { type: "host.boot"; targetUserId: string; wallet: string | null }
  | { type: "host.lockout"; wallet: string; locked: boolean }
  | { type: "host.sendToZone"; targetUserId: string; zoneId: string }
  | { type: "host.fx"; command: AdminFxCommand }
  /**
   * Host retargets ONE NPC group's behaviour while the World is running.
   *
   * `groupId` is NpcGroup.id, or `"*"` for every group plus the ungrouped
   * remainder. `role: ""` clears the override and returns the group to the
   * behaviour it was published with — an override is a live instruction, never
   * a publish.
   *
   * Broadcast, not replayed: a guest arriving after the command keeps the
   * published behaviour until the host sends the next one, the same contract
   * every other host.* message here has.
   */
  | { type: "host.npcActivity"; groupId: string; role: NpcGroupRole | "" }
  | { type: "gate.setEnabled"; ruleId: string; enabled: boolean };

export function defaultSocialPermissions(): SocialPermissionFlags {
  return {
    useWeb3Api: false,
    allowTriggerAvatarEmote: false,
    allowMovePlayerInsideScene: false,
    useFetch: false,
  };
}

export function defaultMediaDefaults(): MediaDefaults {
  return {
    screenSmartObjectId: null,
    audioSmartObjectId: null,
    defaultVideoUrl: null,
    defaultAudioUrl: null,
    audioSpatial: true,
    videoPlayingOnLoad: false,
    // A live venue should feel live on arrival — default to the dance MUSIC
    // playing (owner: "walking into an event and music isn't playing is wrong").
    // Video and music are mutually exclusive here; host switches live in-console.
    arrivalMedia: "music",
  };
}

export const ALL_HOST_CONSOLE_MODULES: readonly HostConsoleModuleId[] = [
  "announcements", "guests", "access", "video", "audio", "breakdance", "rewards",
] as const;

export function defaultAppEntitlement(): AppEntitlement {
  return {
    mode: "open", chain: "polygon", contract: null, contracts: null,
    tokenIds: null, wearableUrns: null, allowedAddresses: null, match: "any",
  };
}

export function defaultVenueAppsConfig(): VenueAppsConfig {
  return {
    gate: defaultGateAppConfig(),
    worldMap: defaultWorldMapAppConfig(),
    hostConsole: { enabled: false, modules: [...ALL_HOST_CONSOLE_MODULES] },
    landing: defaultLandingAppConfig(),
    video: { enabled: false, source: "none", screens: [] },
    audio: {
      enabled: false, source: "none", playlist: defaultDanceMusicConfig(), emitters: [],
    },
    audioStream: defaultAudioStreamAppConfig(),
    emoteLibrary: {
      enabled: false,
      entitlement: defaultAppEntitlement(),
      includeHouse: true,
      includeOwned: true,
      allowSequences: true,
      worldEmotes: [],
      assignments: { danceBug: [], breakdance: [], npcs: [] },
    },
    speakeasy: defaultSpeakeasyRoomConfig(),
    gallery: defaultGalleryConfig(),
    lights: defaultLightsAppConfig(),
    retailShop: defaultRetailShopConfig(),
    l1Museum: defaultL1MuseumConfig(),
    scrap: defaultScrapConfig(),
    scrapHuman: defaultScrapHumanAppConfig(),
    vehicles: defaultVehiclesAppConfig(),
    // A brand-new venue ships neither of these. They are on in EXISTING projects
    // only, via the migration in normalizeSocialSurfaceConfig — see the comment
    // there. Nothing should appear in someone's world because we shipped it.
    exchange: defaultExchangeConfig(),
    vendor: defaultVendorAppConfig(),
    weather: defaultWeatherAppConfig(),
    skybox: defaultSkyboxAppConfig(),
    border: defaultBorderAppConfig(),
    objectStudio: defaultObjectStudioAppConfig(),
    traversal: defaultTraversalAppConfig(),
    bubbleBash: defaultBubbleBashAppConfig(),
    punchMachine: defaultPunchMachineAppConfig(),
    graveyard: defaultGraveyardAppConfig(),
    garden: defaultGardenAppConfig(),
    water: defaultWaterAppConfig(),
    fxLab: { enabled: false },
    train: defaultTrainCorridorConfig(),
  };
}

/**
 * The URL a Decentraland Cast screen carries. Not a real address — the runtime
 * recognises the scheme and attaches the live cast stream. Stored rather than
 * derived so a cast screen and a URL screen are the same shape everywhere.
 */
export const DCL_CAST_VIDEO_URL = "livekit-video://current-stream";

/** True for https streams and the Decentraland Cast sentinel stored on cast screens. */
export function isAllowedVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (/^https:\/\//i.test(url)) return true;
  return url === DCL_CAST_VIDEO_URL || /^livekit-video:\/\//i.test(url);
}

/**
 * Normalize one screen's binding. A screen with no usable URL is not an error —
 * it is a screen waiting to be given one, and it must survive the round trip so
 * the builder can still list it.
 */
function normalizeMediaScreen(raw: Partial<MediaScreenBinding> | undefined, screenId: string): MediaScreenBinding {
  const url = typeof raw?.url === "string" && raw.url.trim() ? raw.url.trim() : null;
  const source: MediaScreenBinding["source"] =
    raw?.source === "cast" ? "cast" : raw?.source === "url" ? "url" : url ? "url" : "none";
  return {
    screenId,
    source,
    url: source === "cast" ? DCL_CAST_VIDEO_URL : source === "url" ? url : null,
    label: typeof raw?.label === "string" && raw.label.trim() ? raw.label.trim() : null,
    // Crop is the default, including for screens published before this field
    // existed: a stretched picture was never the intent, it was just what a
    // resized panel did to whatever was playing on it.
    fit: parseMediaScreenFit(raw?.fit),
    sourceAspect: normalizeMediaScreenSourceAspect(raw?.sourceAspect),
    // Absence is meaningful for backwards compatibility: an older screen does
    // not suddenly take over the camera after the Builder adopts this schema.
    ...(raw?.focusView === true ? { focusView: true } : {}),
  };
}

function normalizeMediaEmitter(
  raw: Partial<MediaEmitterBinding> | undefined,
  emitterId: string,
  fallbackSpatial: boolean
): MediaEmitterBinding {
  const url = typeof raw?.url === "string" && raw.url.trim() ? raw.url.trim() : null;
  const source: MediaEmitterBinding["source"] = raw?.source === "stream" ? "stream" : url ? "stream" : "none";
  return {
    emitterId,
    source,
    url: source === "stream" ? url : null,
    spatial: typeof raw?.spatial === "boolean" ? raw.spatial : fallbackSpatial,
    label: typeof raw?.label === "string" && raw.label.trim() ? raw.label.trim() : null,
  };
}

export function defaultEventProfile(buildingName?: string): EventProfile {
  return {
    name: buildingName?.trim() ? `${buildingName.trim()} Event` : "Building Event",
    adminWallets: [],
    announceOnEnter: null,
    crowdEmotes: ["robot", "clap", "dance"],
    rewardClaimUrlTemplate: null,
    rewardNft: null,
    timeOfDay: "default",
    dimVenueLights: false,
  };
}

export function normalizeRewardNft(
  partial: Partial<RewardNftConfig> | null | undefined
): RewardNftConfig | null {
  if (!partial) return null;
  const contract = partial.contract?.trim() || null;
  const tokenId = partial.tokenId?.trim() || null;
  if (!contract && !tokenId) return null;
  return {
    chain: partial.chain ?? "polygon",
    contract,
    tokenId,
  };
}

export function hasConfiguredRewardNft(config: SocialSurfaceConfig): boolean {
  const nft = config.event.rewardNft;
  return Boolean(nft?.contract && nft?.tokenId);
}

/** Lowercase trimmed wallet, or null. */
export function normalizeSocialWallet(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const w = addr.trim().toLowerCase();
  return w || null;
}

/**
 * Who may open the in-world Host console.
 * Empty admin list → any signed-in wallet (so enabling Social never locks the owner out).
 */
export function isSocialAdminWallet(
  wallet: string | null | undefined,
  adminWallets: string[] | null | undefined
): boolean {
  const w = normalizeSocialWallet(wallet);
  if (!w) return false;
  const admins = (adminWallets ?? [])
    .map((a) => normalizeSocialWallet(a))
    .filter((a): a is string => Boolean(a));
  if (admins.length === 0) return true;
  return admins.includes(w);
}

export function defaultSocialSurfaceConfig(buildingName?: string): SocialSurfaceConfig {
  return {
    version: SOCIAL_SURFACE_VERSION,
    venueId: null,
    enabled: false,
    event: defaultEventProfile(buildingName),
    gates: [],
    buildingGateRuleId: null,
    floorGates: [],
    zoneRoles: [],
    media: defaultMediaDefaults(),
    ambient: defaultAmbientAudioConfig(),
    permissions: defaultSocialPermissions(),
    apps: defaultVenueAppsConfig(),
    installedAppIds: [GATE_APP_ID, WORLD_MAP_APP_ID, VEHICLES_APP.id],
    dance: null,
    wardrobe: emptyWalletWardrobe(),
  };
}

export function normalizeGateRule(partial: Partial<GateRule> & { id: string }): GateRule {
  const list = gateContracts(partial);
  return {
    id: partial.id,
    mode: partial.mode ?? "open",
    chain: partial.chain ?? "polygon",
    contract: list[0] ?? null,
    contracts: list.length ? list : null,
    tokenIds: partial.tokenIds ?? null,
    wearableUrns: partial.wearableUrns ?? null,
    allowedAddresses: partial.allowedAddresses?.map((a) => a.toLowerCase()) ?? null,
    match: partial.match ?? "any",
    deniedMessage: partial.deniedMessage ?? "Access denied",
  };
}

/**
 * The building-wide gate rule currently in force, or null when the building is
 * open. Used by BOTH the app (publish permissions) and the scene runtime
 * (standalone access gate) so the "is this building gated?" test is defined once.
 * `enabled` is intentionally ignored here — callers decide whether the full venue
 * or the standalone Step-1 gate applies.
 */
export function activeBuildingGateRule(
  social: SocialSurfaceConfig | null | undefined
): GateRule | null {
  if (!social) return null;
  const id = social.buildingGateRuleId;
  if (!id) return null;
  const rule = social.gates.find((g) => g.id === id);
  if (!rule || rule.mode === "open") return null;
  return rule;
}

/** Shallow Partial leaves nested `event` required-complete; accept partial event fields. */
export type SocialSurfaceConfigInput = Omit<
  Partial<SocialSurfaceConfig>,
  "event" | "media" | "permissions" | "dance" | "apps"
> & {
  event?: Partial<EventProfile>;
  media?: Partial<SocialSurfaceConfig["media"]>;
  permissions?: Partial<SocialSurfaceConfig["permissions"]>;
  apps?: {
    worldMap?: Partial<WorldMapAppConfig>;
    hostConsole?: Partial<VenueAppsConfig["hostConsole"]>;
    landing?: Partial<LandingAppConfig>;
    video?: Partial<VenueAppsConfig["video"]>;
    audio?: Omit<Partial<VenueAppsConfig["audio"]>, "source"> & {
      ambient?: Partial<import("./ambient-audio-contract").AmbientAudioConfig>;
      source?: "none" | "playlist" | "stream";
    };
    audioStream?: Partial<VenueAppsConfig["audioStream"]>;
    emoteLibrary?: Omit<Partial<VenueAppsConfig["emoteLibrary"]>, "entitlement"> & {
      entitlement?: Partial<AppEntitlement>;
    };
    speakeasy?: Partial<SpeakeasyRoomConfig>;
    gallery?: Partial<GalleryConfig>;
    lights?: Partial<LightsAppConfig>;
    retailShop?: Partial<RetailShopConfig>;
    l1Museum?: Partial<L1MuseumConfig>;
    scrap?: Partial<ScrapConfig>;
    scrapHuman?: Partial<ScrapHumanAppConfig>;
    vehicles?: Partial<VehiclesAppConfig>;
    exchange?: Partial<VenueAppsConfig["exchange"]>;
    vendor?: Partial<VenueAppsConfig["vendor"]>;
    weather?: Partial<VenueAppsConfig["weather"]>;
    skybox?: Partial<VenueAppsConfig["skybox"]>;
    border?: Partial<VenueAppsConfig["border"]>;
    objectStudio?: Partial<VenueAppsConfig["objectStudio"]>;
    traversal?: Partial<TraversalAppConfig>;
    bubbleBash?: Partial<BubbleBashAppConfig>;
    punchMachine?: Partial<PunchMachineAppConfig>;
    graveyard?: Partial<GraveyardAppConfig>;
    garden?: Partial<GardenAppConfig>;
    water?: Partial<WaterAppConfig>;
    fxLab?: Partial<VenueAppsConfig["fxLab"]>;
    train?: Partial<TrainCorridorConfig>;
  };
  dance?: Partial<DanceVenueConfig> | null;
};

export function normalizeSocialSurfaceConfig(
  partial: SocialSurfaceConfigInput | null | undefined,
  buildingName?: string
): SocialSurfaceConfig {
  const base = defaultSocialSurfaceConfig(buildingName);
  if (!partial) return base;

  const event: EventProfile = partial.event
    ? {
        ...base.event,
        ...partial.event,
        adminWallets: (partial.event.adminWallets ?? base.event.adminWallets)
          .map((a) => a.trim().toLowerCase())
          .filter(Boolean),
        crowdEmotes: partial.event.crowdEmotes ?? base.event.crowdEmotes,
        rewardClaimUrlTemplate:
          partial.event.rewardClaimUrlTemplate ?? base.event.rewardClaimUrlTemplate,
        rewardNft:
          partial.event.rewardNft !== undefined
            ? normalizeRewardNft(partial.event.rewardNft)
            : base.event.rewardNft,
        timeOfDay:
          partial.event.timeOfDay === "night" ||
          partial.event.timeOfDay === "sunset" ||
          partial.event.timeOfDay === "club"
            ? partial.event.timeOfDay
            : "default",
        dimVenueLights: partial.event.dimVenueLights === true,
      }
    : base.event;

  // Before apps were explicit, enabling Social implicitly enabled the console,
  // media, and Dance Studio. Migrate that legacy shape once; newly-authored
  // configs always persist explicit app switches.
  const legacyApps = partial.apps === undefined;
  const media = { ...base.media, ...partial.media };
  media.arrivalMedia =
    media.arrivalMedia === "video" || media.arrivalMedia === "none" ? media.arrivalMedia : "music";
  const entitlement: AppEntitlement = {
    ...base.apps.emoteLibrary.entitlement,
    ...partial.apps?.emoteLibrary?.entitlement,
  };
  const entitlementContracts = gateContracts(entitlement);
  entitlement.contracts = entitlementContracts.length ? entitlementContracts : null;
  entitlement.contract = entitlementContracts[0] ?? null;
  entitlement.allowedAddresses = entitlement.allowedAddresses
    ?.map((address) => address.trim().toLowerCase()).filter(Boolean) ?? null;
  const modules = (partial.apps?.hostConsole?.modules ?? base.apps.hostConsole.modules)
    .filter((id): id is HostConsoleModuleId => ALL_HOST_CONSOLE_MODULES.includes(id as HostConsoleModuleId));
  let normalizedDance = normalizeDanceVenueConfig(partial.dance);
  const rawAudio = partial.apps?.audio;
  let playlistTracks = rawAudio?.playlist?.tracks ?? [];
  const playlistMode =
    rawAudio?.playlist?.mode ?? normalizedDance?.music.mode ?? base.apps.audio.playlist.mode;
  // Which Music-library tracks play. Kept beside the mode so the legacy hand-off
  // below carries the selection with the songs it belongs to.
  let playlistSelection = normalizeSelectedTrackIds(
    rawAudio?.playlist?.selectedTrackIds ?? normalizedDance?.music.selectedTrackIds
  );
  if (
    normalizedDance?.enabled &&
    (normalizedDance.music.tracks?.length ?? 0) === 0 &&
    playlistTracks.length > 0
  ) {
    normalizedDance = {
      ...normalizedDance,
      music: { mode: playlistMode, tracks: playlistTracks, selectedTrackIds: playlistSelection },
    };
    playlistTracks = [];
    playlistSelection = null;
  }
  const hasPlaylist = playlistTracks.length > 0;
  const ambient = normalizeAmbientAudioConfig(partial.ambient ?? rawAudio?.ambient);
  const legacyStream = rawAudio?.source === "stream";
  const audioStream = normalizeAudioStreamAppConfig({
    ...((partial.apps as { audioStream?: object } | undefined)?.audioStream ?? {}),
    enabled:
      (partial.apps as { audioStream?: { enabled?: boolean } } | undefined)?.audioStream?.enabled ===
        true || (legacyStream && rawAudio?.enabled === true),
    url:
      (partial.apps as { audioStream?: { url?: string } } | undefined)?.audioStream?.url ||
      (legacyStream ? media.defaultAudioUrl : "") ||
      "",
  });
  if (audioStream.enabled && audioStream.url && !media.defaultAudioUrl) {
    media.defaultAudioUrl = audioStream.url;
  }

  /**
   * Screens, from either shape. A config written before per-screen sources
   * existed describes exactly one screen across `media.screenSmartObjectId`,
   * `media.defaultVideoUrl` and `apps.video.source`; fold that into a one-entry
   * list so there is a single shape to read from here on. Below, `screens[0]` is
   * written back to those same three fields, which is what keeps published
   * scenes, the publish fail-closed check, and the Host Console working.
   */
  const rawScreens = Array.isArray(partial.apps?.video?.screens) ? partial.apps.video.screens : null;
  const screens: MediaScreenBinding[] = [];
  const seenScreens = new Set<string>();
  for (const raw of rawScreens ?? []) {
    const id = typeof raw?.screenId === "string" ? raw.screenId.trim() : "";
    if (!id || seenScreens.has(id)) continue;
    seenScreens.add(id);
    screens.push(normalizeMediaScreen(raw, id));
  }
  // Also covers an EMPTY list beside a bound primary — the state right after the
  // Video app is switched on and mints its first screen. Without this the primary
  // would be the one screen in the venue with no row of its own.
  if (!screens.length && media.screenSmartObjectId) {
    screens.push(
      normalizeMediaScreen(
        {
          source: partial.apps?.video?.source,
          url: media.defaultVideoUrl,
        },
        media.screenSmartObjectId
      )
    );
  }

  const rawEmitters = Array.isArray(partial.apps?.audio?.emitters) ? partial.apps.audio.emitters : null;
  const emitters: MediaEmitterBinding[] = [];
  const seenEmitters = new Set<string>();
  for (const raw of rawEmitters ?? []) {
    const id = typeof raw?.emitterId === "string" ? raw.emitterId.trim() : "";
    if (!id || seenEmitters.has(id)) continue;
    seenEmitters.add(id);
    emitters.push(normalizeMediaEmitter(raw, id, media.audioSpatial));
  }
  if (!emitters.length && media.audioSmartObjectId) {
    emitters.push(
      normalizeMediaEmitter(
        { source: media.defaultAudioUrl ? "stream" : "none", url: media.defaultAudioUrl },
        media.audioSmartObjectId,
        media.audioSpatial
      )
    );
  }

  // The primary screen/emitter and the legacy single-instance fields are ONE
  // value with two names. Keep them identical here — the moment they can drift,
  // "the screen plays the wrong thing after publish" becomes possible again.
  const primaryScreen = screens[0] ?? null;
  const primaryEmitter = emitters[0] ?? null;
  if (primaryScreen) {
    media.screenSmartObjectId = primaryScreen.screenId;
    media.defaultVideoUrl = primaryScreen.source === "none" ? null : primaryScreen.url;
  }
  if (primaryEmitter) {
    media.audioSmartObjectId = primaryEmitter.emitterId;
    media.defaultAudioUrl = primaryEmitter.source === "stream" ? primaryEmitter.url : null;
  }

  /**
   * Exchange and FX Lab were drawn by the scene with no switch behind them, so
   * every project that already exists is running them. Turning them off in those
   * projects on the next save would be us removing a feature the owner watched
   * working. So: a config that carries an `apps` block WITHOUT the key predates
   * the switch and keeps what it has; everything else, including every new
   * build, obeys `defaultVenueAppsConfig()` and starts off.
   */
  const wasActive =
    partial.enabled === true ||
    partial.dance?.enabled === true ||
    partial.apps?.hostConsole?.enabled === true ||
    partial.apps?.video?.enabled === true ||
    partial.apps?.audio?.enabled === true ||
    partial.apps?.emoteLibrary?.enabled === true ||
    partial.apps?.speakeasy?.enabled === true ||
    partial.apps?.gallery?.enabled === true ||
    partial.apps?.train?.enabled === true;
  // `wasActive` matters: with every app off, the scene builds no HUD at all, so
  // there was no chip to preserve. Migrating one on there would ADD a button to a
  // venue that had none — the opposite of the point.
  const predatesAppSwitch = (key: "exchange" | "fxLab"): boolean =>
    !legacyApps && partial.apps !== undefined && !(key in partial.apps) && wasActive;

  const apps: VenueAppsConfig = {
    // Default ON. Missing key → enabled. Explicit false stays false.
    gate: normalizeGateAppConfig(
      (partial.apps as { gate?: unknown } | undefined)?.gate,
    ),
    // The old map was unconditional. Missing key preserves that visible feature;
    // an explicit false is the new uninstall/off decision and always wins.
    worldMap: normalizeWorldMapAppConfig(partial.apps?.worldMap),
    hostConsole: {
      enabled: partial.apps?.hostConsole?.enabled ?? (legacyApps && partial.enabled === true),
      modules: [...new Set(modules)],
    },
    // Landing is new. A missing key stays off — never infer a cover onto old venues.
    landing: normalizeLandingAppConfig(
      (partial.apps as { landing?: unknown } | undefined)?.landing,
    ),
    video: {
      enabled: partial.apps?.video?.enabled ?? (legacyApps && partial.enabled === true),
      // Mirrors the primary screen. Falls back to the old derivation when there
      // is no screen at all, so an app switched on before its screen exists
      // still remembers which kind of source was chosen.
      source: primaryScreen
        ? primaryScreen.source
        : partial.apps?.video?.source === "cast" || partial.apps?.video?.source === "url"
          ? partial.apps.video.source
          : media.defaultVideoUrl ? "url" : "none",
      screens,
    },
    audio: {
      enabled: partial.apps?.audio?.enabled ?? (legacyApps && partial.enabled === true),
      source: hasPlaylist || rawAudio?.source === "playlist" ? "playlist" : "none",
      playlist: {
        mode: playlistMode,
        tracks: playlistTracks,
        selectedTrackIds: playlistSelection,
      },
      emitters,
    },
    audioStream,
    emoteLibrary: (() => {
      // Projects that already had the app before World selections existed gain
      // one verified free dance. `[]` is deliberate and stays empty.
      const worldEmotes =
        partial.apps?.emoteLibrary?.worldEmotes === undefined &&
        (partial.apps?.emoteLibrary?.enabled ?? (legacyApps && partial.enabled === true))
          ? [{ ...DEFAULT_WORLD_EMOTE_SELECTION }]
          : normalizeWorldEmoteSelections(partial.apps?.emoteLibrary?.worldEmotes);
      return {
        ...base.apps.emoteLibrary,
        ...partial.apps?.emoteLibrary,
        enabled: partial.apps?.emoteLibrary?.enabled ?? (legacyApps && partial.enabled === true),
        entitlement,
        worldEmotes,
        assignments: normalizeWorldEmoteAssignments(
          (partial.apps?.emoteLibrary as { assignments?: unknown } | undefined)?.assignments,
          worldEmotes
        ),
      };
    })(),
    // Deliberately NOT part of `legacyApps` (which turns the original four on for
    // any pre-apps config that had Social enabled). A room that silently starts
    // ejecting people at six is not a reasonable thing to infer from an old file —
    // this app is only ever on because someone switched it on.
    speakeasy: normalizeSpeakeasyRoomConfig(partial.apps?.speakeasy),
    // Same reasoning as the Speakeasy: never inferred from a pre-apps config.
    gallery: normalizeGalleryConfig(partial.apps?.gallery),
    /**
     * The one app that IS inferred onto an existing project, and for the opposite
     * reason to Exchange: this switch does not ADD anything, it only decides whether
     * lights that are ALREADY burning keep burning. Per-floor lighting and the
     * gallery's picture lamps shipped years before this card, so any config that
     * carries an `apps` block with no `lights` key describes a world whose lamps are
     * on. Defaulting it off would darken every lit lobby on the next save — a feature
     * removed by a refactor, which is exactly what the Exchange migration exists to
     * prevent. A brand-new build goes through defaultLightsAppConfig() and starts off.
     */
    lights: normalizeLightsAppConfig({
      ...(partial.apps?.lights ?? {}),
      enabled:
        partial.apps?.lights?.enabled ??
        (partial.apps !== undefined && !("lights" in partial.apps)),
    }),
    // Same as Gallery: never inferred from a pre-apps config.
    retailShop: normalizeRetailShopConfig(partial.apps?.retailShop),
    // Same as Gallery: never inferred from a pre-apps config.
    l1Museum: normalizeL1MuseumConfig(partial.apps?.l1Museum),
    // Same as Gallery: never inferred from a pre-apps config. Hassling guests
    // is opt-in, even in a venue that already had a crowd.
    scrap: normalizeScrapConfig(partial.apps?.scrap),
    scrapHuman: (() => {
      const raw = (partial.apps as { scrapHuman?: unknown } | undefined)?.scrapHuman;
      if (raw != null) return normalizeScrapHumanAppConfig(raw);
      return {
        ...defaultScrapHumanAppConfig(),
        enabled: partial.apps?.scrap?.humanEdition === true,
      };
    })(),
    vehicles: normalizeVehiclesAppConfig(partial.apps?.vehicles),
    exchange: normalizeExchangeConfig({
      ...partial.apps?.exchange,
      enabled: partial.apps?.exchange?.enabled ?? predatesAppSwitch("exchange"),
    }),
    // Vendor was nested under Exchange. If a save has exchange.vendor.enabled and
    // no apps.vendor row yet, lift the stall so the live NPC does not vanish.
    vendor: (() => {
      const rawVendor = (partial.apps as { vendor?: unknown } | undefined)?.vendor;
      if (rawVendor != null) return normalizeVendorAppConfig(rawVendor);
      const legacy = (partial.apps?.exchange as { vendor?: unknown } | undefined)?.vendor;
      if (legacy != null) {
        const npc = normalizeVendorNpcConfig(legacy);
        return {
          enabled: npc.enabled && (partial.apps?.exchange?.enabled === true || predatesAppSwitch("exchange")),
          npc,
        };
      }
      // Pre-switch venues had the Exchange stall on screen with the chip.
      if (predatesAppSwitch("exchange")) {
        return { enabled: true, npc: defaultVendorNpcConfig() };
      }
      return defaultVendorAppConfig();
    })(),
    fxLab: { enabled: partial.apps?.fxLab?.enabled ?? predatesAppSwitch("fxLab") },
    // Weather used to live inside FX Lab. Missing key → follow fxLab so hosts
    // do not lose rain after the split. Explicit weather: false still wins.
    weather: (() => {
      const raw = (partial.apps as { weather?: unknown } | undefined)?.weather;
      if (raw != null) return normalizeWeatherAppConfig(raw);
      const fxOn = partial.apps?.fxLab?.enabled ?? predatesAppSwitch("fxLab");
      return { ...defaultWeatherAppConfig(), enabled: fxOn === true };
    })(),
    // Skybox is new. A missing key stays off — never replace the sky over a World
    // whose owner has not asked for it.
    skybox: normalizeSkyboxAppConfig(
      (partial.apps as { skybox?: unknown } | undefined)?.skybox,
    ),
    // Border is new. A missing key stays off — never infer strips onto old venues.
    border: normalizeBorderAppConfig(
      (partial.apps as { border?: unknown } | undefined)?.border,
    ),
    objectStudio: normalizeObjectStudioAppConfig(
      (partial.apps as { objectStudio?: unknown } | undefined)?.objectStudio,
    ),
    traversal: normalizeTraversalAppConfig(partial.apps?.traversal),
    // Bubble Bash is new. A missing key stays off — never bubble an old venue.
    bubbleBash: normalizeBubbleBashAppConfig(
      (partial.apps as { bubbleBash?: unknown } | undefined)?.bubbleBash,
    ),
    // Punch Machine is new. A missing key stays off and never places a cabinet.
    punchMachine: normalizePunchMachineAppConfig(
      (partial.apps as { punchMachine?: unknown } | undefined)?.punchMachine,
    ),
    graveyard: normalizeGraveyardAppConfig(
      (partial.apps as { graveyard?: unknown } | undefined)?.graveyard,
    ),
    garden: normalizeGardenAppConfig(
      (partial.apps as { garden?: unknown } | undefined)?.garden,
    ),
    water: normalizeWaterAppConfig(
      (partial.apps as { water?: unknown } | undefined)?.water,
    ),
    // Same reasoning again: a train appearing in an old build because Social was
    // once on would be a surprise the size of the plot.
    train: normalizeTrainCorridorConfig(partial.apps?.train),
  };

  return {
    version: SOCIAL_SURFACE_VERSION,
    venueId:
      typeof partial.venueId === "string" && partial.venueId.trim()
        ? partial.venueId.trim()
        : (base.venueId ?? null),
    enabled: partial.enabled ?? base.enabled,
    event,
    gates: (partial.gates ?? []).map((g) => normalizeGateRule(g)),
    buildingGateRuleId: partial.buildingGateRuleId ?? null,
    floorGates: partial.floorGates ?? [],
    zoneRoles: partial.zoneRoles ?? [],
    media,
    ambient,
    permissions: { ...base.permissions, ...partial.permissions },
    apps,
    installedAppIds: normalizeInstalledAppIds(
      partial.installedAppIds,
      apps,
      normalizedDance?.enabled === true
    ),
    dance: normalizedDance,
    programmes: normalizeVenueProgrammes(partial.programmes),
    wardrobe: normalizeWalletWardrobe(partial.wardrobe ?? base.wardrobe),
  };
}

/** Keep only structurally sound programmes; never invent or repair content. */
function normalizeVenueProgrammes(raw: unknown): VenueProgramme[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const kept: VenueProgramme[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const programme = item as VenueProgramme;
    if (programme.schemaVersion !== VENUE_PROGRAMME_SCHEMA_VERSION) continue;
    if (typeof programme.id !== "string" || !programme.id.trim() || seen.has(programme.id)) continue;
    if (typeof programme.name !== "string" || typeof programme.venueId !== "string") continue;
    if (![programme.media, programme.npcRoles, programme.schedule].every(Array.isArray)) continue;
    seen.add(programme.id);
    kept.push(programme);
  }
  return kept;
}

export function deriveSocialPermissions(config: SocialSurfaceConfig): SocialPermissionFlags {
  const needsWeb3 =
    config.gates.some((g) =>
      g.mode === "nft_collection" ||
      g.mode === "nft_token" ||
      g.mode === "allowlist" ||
      g.mode === "wearable_equipped"
    ) ||
    Boolean(config.buildingGateRuleId) ||
    hasConfiguredRewardNft(config);

  /**
   * The Speakeasy exit gate reads collection ownership on the chain its rule names,
   * over Decentraland's public RPC. Without USE_FETCH the read is denied, the check
   * can only ever answer "no", and a genuine holder is locked in the lounge.
   */
  const speakeasyGateOn =
    config.apps.speakeasy.enabled && Boolean(config.apps.speakeasy.worldGateRuleId);

  /**
   * A live gallery polls its curation document over https. Without USE_FETCH the
   * poll is denied and every frame is frozen at whatever was published, which is
   * exactly the republish-free swap the app exists to provide.
   */
  const galleryLiveOn = config.apps.gallery.enabled && config.apps.gallery.live !== null;

  /**
   * The scene-wide access gate reads collection ownership over Decentraland's
   * public RPC with a plain `fetch` (scene/src/social/nft-check.ts), not a
   * provider call — so USE_WEB3_API alone is not enough. Denied, every read
   * answers "you hold nothing" and the gate shuts the door on the genuine
   * holders it was written to let in. The venue-OFF branch of
   * `app/src/deploy/scene-bundle.ts` learned this already; the gate now runs for
   * venue scenes too, so this side has to know it as well. Scoped to the two
   * token modes: the wallet-comparison modes need no network at all.
   */
  const sceneGate = activeBuildingGateRule(config);
  const sceneGateReadsChain =
    sceneGate?.mode === "nft_collection" || sceneGate?.mode === "nft_token";
  /**
   * A closed door lists the other open scenes in this World over the content
   * server. Without USE_FETCH that list is empty and LEAVE still dumps people
   * in Genesis City — the trap this permission exists to close.
   */
  const sceneGateNeedsWorldList = sceneGate !== null;

  const danceOn = config.dance?.enabled === true;
  const emoteAppOn = config.apps.emoteLibrary.enabled;
  const needsEmote = (config.event.crowdEmotes.length > 0 && config.enabled) || danceOn || emoteAppOn;
  const appEntitlementNeedsWeb3 = emoteAppOn && config.apps.emoteLibrary.entitlement.mode !== "open";

  return {
    // Permanent scene/floor access is independent of the Venue Console toggle.
    useWeb3Api: needsWeb3 || appEntitlementNeedsWeb3 || speakeasyGateOn,
    allowTriggerAvatarEmote: needsEmote,
    // The dance loop teleports dancers onto/off the floor and enforces the
    // dancer-only zone — it always needs movePlayer.
    allowMovePlayerInsideScene:
      config.permissions.allowMovePlayerInsideScene ||
      (config.apps.hostConsole.enabled && config.event.adminWallets.length > 0) ||
      danceOn,
    // The Dance Studio panel (ships with every social venue) loads the player's
    // owned emotes from the Catalyst lambdas — needs fetch.
    useFetch:
      config.permissions.useFetch ||
      (emoteAppOn && config.apps.emoteLibrary.includeOwned) ||
      speakeasyGateOn ||
      sceneGateReadsChain ||
      sceneGateNeedsWorldList ||
      galleryLiveOn,
  };
}

export interface SocialValidationIssue {
  level: "error" | "warn";
  code: string;
  message: string;
}

/**
 * Drop social bindings whose geometry no longer exists — media screen/audio smart
 * objects and zone role bindings. A whole-building rebuild (Build with AI, example
 * loaders) wipes smart objects and floor zones; a social config still pointing at them
 * would hard-fail publish validation with no way forward ("Media screen smart object
 * 'social_screen_main' not found"). Venue-level settings (event, admins, gates,
 * allowlists) are geometry-independent and always survive.
 */
export function reconcileSocialWithGeometry(
  config: SocialSurfaceConfig,
  opts: {
    zoneComponentIds?: Set<string> | string[];
    smartObjectIds?: Set<string> | string[];
  }
): { config: SocialSurfaceConfig; removed: string[] } {
  const zoneIds = toSet(opts.zoneComponentIds) ?? new Set<string>();
  const smartIds = toSet(opts.smartObjectIds) ?? new Set<string>();
  const removed: string[] = [];

  let media = config.media;
  if (media.screenSmartObjectId && !smartIds.has(media.screenSmartObjectId)) {
    removed.push(`media screen binding "${media.screenSmartObjectId}"`);
    media = { ...media, screenSmartObjectId: null };
  }
  if (media.audioSmartObjectId && !smartIds.has(media.audioSmartObjectId)) {
    removed.push(`audio binding "${media.audioSmartObjectId}"`);
    media = { ...media, audioSmartObjectId: null };
  }

  // Per-screen sources outlive nothing: delete the screen and its source goes with
  // it. A dangling binding would keep a deleted screen in the builder's list and,
  // worse, could be promoted back to primary and publish a screen that isn't there.
  const screens = config.apps.video.screens.filter((binding) => {
    if (smartIds.has(binding.screenId)) return true;
    removed.push(`screen source "${binding.screenId}"`);
    return false;
  });
  const emitters = config.apps.audio.emitters.filter((binding) => {
    if (smartIds.has(binding.emitterId)) return true;
    removed.push(`audio emitter "${binding.emitterId}"`);
    return false;
  });
  // PROMOTE A SURVIVOR, DO NOT ORPHAN THE REST.
  //
  // Nulling the primary above and stopping there left a venue holding perfectly good
  // screens with nothing marked primary. Because the Builder's Video card and the
  // publish both read the primary, deleting the building that happened to hold
  // `social_screen_main` made every OTHER screen look deleted too:
  //
  //   "now that I deleted the other building with the screen and the audio, the screen
  //    that I actually wanted to work on also got deleted" (owner, 2026-08-24)
  //
  // Losing one screen must cost exactly one screen.
  if (!media.screenSmartObjectId && screens[0]) {
    media = {
      ...media,
      screenSmartObjectId: screens[0].screenId,
      defaultVideoUrl: screens[0].source === "none" ? null : screens[0].url,
    };
  }
  if (!media.audioSmartObjectId && emitters[0]) {
    media = {
      ...media,
      audioSmartObjectId: emitters[0].emitterId,
      defaultAudioUrl: emitters[0].source === "none" ? null : emitters[0].url,
    };
  }

  const apps: VenueAppsConfig = {
    ...config.apps,
    video: { ...config.apps.video, screens },
    audio: { ...config.apps.audio, emitters },
  };

  const zoneRoles = config.zoneRoles.filter((binding) => {
    if (zoneIds.has(binding.zoneComponentId)) return true;
    removed.push(`zone binding "${binding.zoneComponentId}"`);
    return false;
  });

  // THE BREAKDANCE APP OWNS ITS CIRCLES — missing geometry is not a broken binding.
  //
  // Dance carries its own fixed placement (the dance set): a floor index, a centre and
  // two radii. The two floor_zone components are only its editable form, and the builder
  // re-creates them from that placement (app/src/scene-spec/dance-zones-sync.ts). So a
  // whole-building rebuild no longer strands the show — it moves with the building
  // centre. Releasing it here instead told the owner to "pick a new one" for a zone that
  // no longer exists anywhere, then left the app off however many times they ticked it.
  //
  // Only a LEGACY config with NO placement has nothing to rebuild from; that one still
  // gets disabled, because there its zone bindings were the only record of the layout.
  let dance = config.dance;
  if (dance?.enabled && !dance.placement) {
    const floorGone = !dance.danceFloorZoneId || !zoneIds.has(dance.danceFloorZoneId);
    const supportGone = !dance.supportZoneId || !zoneIds.has(dance.supportZoneId);
    const fxGone =
      dance.clubFx.enabled && (!dance.clubFxZoneId || !zoneIds.has(dance.clubFxZoneId));
    if (floorGone || supportGone || fxGone) {
      removed.push(`dance venue (zone geometry missing)`);
      dance = { ...dance, enabled: false };
    }
  }

  if (removed.length === 0) return { config, removed };
  return { config: { ...config, media, apps, zoneRoles, dance }, removed };
}

/** Hard errors that must be fixed in Apps/Scene before a publish can start. */
export function socialPublishBlockers(
  config: SocialSurfaceConfig | null | undefined,
  opts?: Parameters<typeof validateSocialSurfaceConfig>[1]
): ReturnType<typeof validateSocialSurfaceConfig> {
  if (!config) return [];
  return validateSocialSurfaceConfig(config, opts).filter((i) => i.level === "error");
}

export function validateSocialSurfaceConfig(
  config: SocialSurfaceConfig,
  opts?: {
    zoneComponentIds?: Set<string> | string[];
    smartObjectIds?: Set<string> | string[];
    /** Floor count of the building, so a frame hung above the top floor is caught. */
    floors?: number;
  }
): SocialValidationIssue[] {
  const issues: SocialValidationIssue[] = [];
  const zoneIds = toSet(opts?.zoneComponentIds);
  const smartIds = toSet(opts?.smartObjectIds);
  const gateIds = new Set(config.gates.map((g) => g.id));

  if (config.apps.hostConsole.enabled && config.event.adminWallets.length === 0) {
    issues.push({
      level: "warn",
      code: "social.no_admins",
      message: "Host Console has no assigned hosts — any signed-in wallet can open it",
    });
  }

  const rewardNft = config.event.rewardNft;
  if (rewardNft) {
    if (!rewardNft.contract) {
      issues.push({
        level: "error",
        code: "social.reward_missing_contract",
        message: "Reward NFT requires a contract address",
      });
    }
    if (!rewardNft.tokenId) {
      issues.push({
        level: "error",
        code: "social.reward_missing_token_id",
        message: "Reward NFT requires a token ID",
      });
    }
  }

  if (config.apps.hostConsole.enabled && config.apps.hostConsole.modules.length === 0) {
    issues.push({
      level: "warn",
      code: "apps.host_console_empty",
      message: "Host Console is enabled but has no visible modules",
    });
  }
  if (config.apps.hostConsole.enabled && config.apps.hostConsole.modules.includes("video") && !config.apps.video.enabled) {
    issues.push({
      level: "warn",
      code: "apps.host_video_unavailable",
      message: "Host Console includes Video controls but the Video app is off",
    });
  }
  if (config.apps.hostConsole.enabled && config.apps.hostConsole.modules.includes("audio") && !config.apps.audio.enabled) {
    issues.push({
      level: "warn",
      code: "apps.host_audio_unavailable",
      message: "Host Console includes Audio controls but the Audio & Music app is off",
    });
  }
  if (config.apps.emoteLibrary.enabled) {
    const entitlement = config.apps.emoteLibrary.entitlement;
    if ((entitlement.mode === "nft_collection" || entitlement.mode === "nft_token") && !entitlement.contract) {
      issues.push({
        level: "error",
        code: "apps.emotes_missing_contract",
        message:
          "Emote Library visitor access needs a collection — open Apps → Emote Library and pick one, or set access to Everyone",
      });
    }
    // No token-ID rule here on purpose. A contract with no mint numbers under it
    // is a COLLECTION gate — "anyone holding one of these" — and that is what an
    // author who picked a collection by name meant. Demanding a token ID they
    // could not supply (the by-name picker carries none) made this mode a dead
    // end. Token IDs stay optional and only narrow the gate. See nft-check.ts.
    if (entitlement.mode === "wearable_equipped" && !entitlement.wearableUrns?.length) {
      issues.push({
        level: "error",
        code: "apps.emotes_missing_wearable",
        message:
          "Emote Library visitor access needs a wearable URN — open Apps → Emote Library to finish setup",
      });
    }
    if (entitlement.mode === "allowlist" && !entitlement.allowedAddresses?.length) {
      issues.push({
        level: "error",
        code: "apps.emotes_empty_allowlist",
        message:
          "Emote Library visitor access needs at least one wallet — open Apps → Emote Library to finish setup",
      });
    }
  }

  for (const gate of config.gates) {
    if (
      (gate.mode === "nft_collection" || gate.mode === "nft_token") &&
      !gate.contract
    ) {
      issues.push({
        level: "error",
        code: "social.gate_missing_contract",
        message: `Gate "${gate.id}" requires a contract address`,
      });
    }
    // nft_token without tokenIds is a collection gate, not an error — same rule
    // as the Emote Library entitlement above.
    if (
      gate.mode === "wearable_equipped" &&
      (!gate.wearableUrns || gate.wearableUrns.length === 0)
    ) {
      issues.push({
        level: "error",
        code: "social.gate_missing_wearables",
        message: `Gate "${gate.id}" requires wearableUrns`,
      });
    }
    // An empty allowlist on the BUILDING gate is the "Admins only" access mode,
    // not a mistake: every enforcement path passes admin wallets before it reads
    // the rule, so a zero-length list means "admins and nobody else". Library
    // gates keep the error — an empty one there is always an unfinished rule.
    if (
      gate.mode === "allowlist" &&
      gate.id !== config.buildingGateRuleId &&
      (!gate.allowedAddresses || gate.allowedAddresses.length === 0)
    ) {
      issues.push({
        level: "error",
        code: "social.gate_empty_allowlist",
        message: `Gate "${gate.id}" allowlist is empty`,
      });
    }
  }

  const checkRuleRef = (ruleId: string | null, context: string) => {
    if (!ruleId) return;
    if (!gateIds.has(ruleId)) {
      issues.push({
        level: "error",
        code: "social.unknown_gate_rule",
        message: `${context} references unknown gate rule "${ruleId}"`,
      });
    }
  };

  checkRuleRef(config.buildingGateRuleId, "Building gate");
  for (const fg of config.floorGates) {
    checkRuleRef(fg.gateRuleId, `Floor ${fg.floorIndex} gate`);
  }

  for (const binding of config.zoneRoles) {
    if (zoneIds && !zoneIds.has(binding.zoneComponentId)) {
      issues.push({
        level: "error",
        code: "social.unknown_zone",
        message: `Zone binding references unknown zone "${binding.zoneComponentId}"`,
      });
    }
    if (
      (binding.role === "gated" || binding.role === "vip") &&
      !binding.gateRuleId
    ) {
      issues.push({
        level: "error",
        code: "social.zone_missing_gate",
        message: `Zone "${binding.zoneComponentId}" role ${binding.role} requires gateRuleId`,
      });
    }
    checkRuleRef(
      binding.gateRuleId,
      `Zone "${binding.zoneComponentId}"`
    );
  }

  const httpsOrNull = (url: string | null, label: string) => {
    if (!url) return;
    if (!/^https:\/\//i.test(url)) {
      issues.push({
        level: "error",
        code: "social.media_url_not_https",
        message: `${label} must be an https URL`,
      });
    }
  };
  // Cast screens store `livekit-video://…`, not https — that is the runtime's cast
  // scheme. Reject only real non-https http/relative URLs here.
  if (config.media.defaultVideoUrl && !isAllowedVideoUrl(config.media.defaultVideoUrl)) {
    issues.push({
      level: "error",
      code: "social.media_url_not_https",
      message: "Default video URL must be an https URL",
    });
  }
  httpsOrNull(config.media.defaultAudioUrl, "Default audio URL");

  // A dangling media binding is a WARNING, never an error: it is self-healing
  // (reconcileSocialWithGeometry drops it) and a venue with no screen or speaker is a
  // perfectly good venue. Blocking a publish on it only ever stopped legitimate scenes.
  if (smartIds) {
    if (
      config.media.screenSmartObjectId &&
      !smartIds.has(config.media.screenSmartObjectId)
    ) {
      issues.push({
        level: "warn",
        code: "social.unknown_screen",
        message: `Media screen smart object "${config.media.screenSmartObjectId}" not found — the binding is cleared and Video stays off`,
      });
    }
    if (
      config.media.audioSmartObjectId &&
      !smartIds.has(config.media.audioSmartObjectId)
    ) {
      issues.push({
        level: "warn",
        code: "social.unknown_audio",
        message: `Audio smart object "${config.media.audioSmartObjectId}" not found — the binding is cleared`,
      });
    }
  }

  if (config.enabled && config.dance?.enabled) {
    for (const issue of validateDanceVenueConfig(config.dance, opts?.zoneComponentIds)) {
      issues.push(issue);
    }
  }

  if (
    config.enabled &&
    config.event.crowdEmotes.length > 0 &&
    !config.permissions.allowTriggerAvatarEmote &&
    !deriveSocialPermissions(config).allowTriggerAvatarEmote
  ) {
    issues.push({
      level: "warn",
      code: "social.emote_permission",
      message: "Crowd emotes are configured — publish should request ALLOW_TO_TRIGGER_AVATAR_EMOTE",
    });
  }

  for (const issue of validateGalleryConfig(config.apps.gallery, { floors: opts?.floors })) {
    issues.push({ level: issue.level, code: issue.code, message: issue.message });
  }

  for (const issue of validateRetailShopConfig(config.apps.retailShop, { floors: opts?.floors })) {
    issues.push({ level: issue.level, code: issue.code, message: issue.message });
  }

  for (const issue of validateL1MuseumConfig(config.apps.l1Museum, { floors: opts?.floors })) {
    issues.push({ level: issue.level, code: issue.code, message: issue.message });
  }

  return issues;
}

function toSet(ids?: Set<string> | string[]): Set<string> | null {
  if (!ids) return null;
  return ids instanceof Set ? ids : new Set(ids);
}
