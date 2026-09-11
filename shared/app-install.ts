/**
 * Install vs enable.
 *
 * The library at /apps is where an owner picks apps. The Apps tab lists what is
 * already installed on THIS scene. `enabled` still means "runs in the published
 * world". Installing without enabling is allowed (set up, then switch on).
 *
 * Old saves have no `installedAppIds`. Anything already running is treated as
 * installed so it does not vanish from the Apps tab.
 */
import type { DanceVenueConfig } from "./dance-venue-contract";
import { defaultDanceVenueConfig } from "./dance-venue-contract";
import type { VenueAppsConfig } from "./social-surface-contract";
import { normalizeVendorAppConfig } from "./vendor-contract";
import {
  AUDIO_APP,
  AUDIO_STREAM_APP,
  BREAKDANCE_SHOW_APP,
  BUBBLE_BASH_APP,
  PUNCH_MACHINE_APP,
  GRAVEYARD_APP,
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
  isCoreAppId,
} from "./venue-app-contract";
import {
  defaultBubbleBashAppConfig,
  normalizeBubbleBashAppConfig,
} from "./bubble-bash-contract";
import {
  defaultPunchMachineAppConfig,
  normalizePunchMachineAppConfig,
} from "./punch-machine-contract";
import {
  defaultGraveyardAppConfig,
  normalizeGraveyardAppConfig,
} from "./graveyard-contract";
import { defaultScrapHumanAppConfig, normalizeScrapHumanAppConfig } from "./scrap-contract";
import { defaultWeatherAppConfig, normalizeWeatherAppConfig } from "./weather-contract";
import { defaultSkyboxAppConfig, normalizeSkyboxAppConfig } from "./skybox-contract";
import { defaultBorderAppConfig, normalizeBorderAppConfig } from "./border-contract";
import {
  defaultObjectStudioAppConfig,
  normalizeObjectStudioAppConfig,
} from "./object-studio-contract";
import { defaultLightsAppConfig, normalizeLightsAppConfig } from "./lights-app-contract";
import {
  defaultLandingAppConfig,
  normalizeLandingAppConfig,
} from "./landing-contract";
import { DEFAULT_WORLD_EMOTE_SELECTION } from "./emote-library-assets";

const KNOWN_APP_IDS = new Set(VENUE_APP_CATALOGUE.map((app) => app.id));

export function isKnownAppId(id: string): boolean {
  return KNOWN_APP_IDS.has(id);
}

/** Catalogue ids whose runtime switch is currently on. */
export function enabledCatalogueAppIds(
  apps: VenueAppsConfig,
  danceEnabled: boolean
): string[] {
  const ids: string[] = [];
  if (apps.gate.enabled) ids.push(GATE_APP.id);
  if (apps.worldMap.enabled) ids.push(WORLD_MAP_APP.id);
  if (apps.hostConsole.enabled) ids.push(HOST_CONSOLE_APP.id);
  if (apps.landing?.enabled) ids.push(LANDING_APP.id);
  if (apps.video.enabled) ids.push(VIDEO_APP.id);
  if (apps.audio.enabled) ids.push(AUDIO_APP.id);
  if (apps.audioStream?.enabled) ids.push(AUDIO_STREAM_APP.id);
  if (apps.emoteLibrary.enabled) ids.push(EMOTE_LIBRARY_APP.id);
  if (apps.speakeasy.enabled) ids.push(SPEAKEASY_APP.id);
  if (danceEnabled) ids.push(BREAKDANCE_SHOW_APP.id);
  if (apps.gallery.enabled) ids.push(GALLERY_APP.id);
  if (apps.lights?.enabled) ids.push(LIGHTS_APP.id);
  if (apps.retailShop.enabled) ids.push(RETAIL_SHOP_APP.id);
  if (apps.l1Museum.enabled) ids.push(L1_MUSEUM_APP.id);
  if (apps.scrap.enabled) ids.push(SCRAP_APP.id);
  if (apps.scrapHuman?.enabled) ids.push(SCRAP_HUMAN_APP.id);
  if (apps.vehicles.enabled) ids.push(VEHICLES_APP.id);
  if (apps.exchange.enabled) ids.push(EXCHANGE_APP.id);
  if (apps.vendor?.enabled) ids.push(VENDOR_APP.id);
  if (apps.weather?.enabled) ids.push(WEATHER_APP.id);
  if (apps.skybox?.enabled) ids.push(SKYBOX_APP.id);
  if (apps.border?.enabled) ids.push(BORDER_APP.id);
  if (apps.objectStudio?.enabled) ids.push(OBJECT_STUDIO_APP.id);
  if (apps.train.enabled) ids.push(TRAIN_APP.id);
  if (apps.traversal.enabled) ids.push(TRAVERSAL_APP.id);
  if (apps.bubbleBash?.enabled) ids.push(BUBBLE_BASH_APP.id);
  if (apps.punchMachine?.enabled) ids.push(PUNCH_MACHINE_APP.id);
  if (apps.graveyard?.enabled) ids.push(GRAVEYARD_APP.id);
  return ids;
}

/**
 * Persistable install list. Unknown ids dropped. Enabled apps are always kept
 * so turning a switch on can never hide the card.
 */
export function normalizeInstalledAppIds(
  raw: unknown,
  apps: VenueAppsConfig,
  danceEnabled: boolean
): string[] {
  const enabled = enabledCatalogueAppIds(apps, danceEnabled);
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (id: string) => {
    if (!KNOWN_APP_IDS.has(id) || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (typeof id === "string") push(id.trim());
    }
  } else {
    // Legacy: the Apps tab WAS the catalogue, so whatever is running was "installed".
    for (const id of enabled) push(id);
  }
  for (const id of enabled) push(id);
  return out;
}

export function isAppInstalled(installedAppIds: readonly string[] | undefined, id: string): boolean {
  return (installedAppIds ?? []).includes(id);
}

export interface CatalogueAppSwitches {
  apps: VenueAppsConfig;
  dance: DanceVenueConfig | null;
}

/** The three fields that together are "which apps does this scene run". */
export interface OwnerAppState extends CatalogueAppSwitches {
  installedAppIds: string[];
}

/**
 * A document landing on an open project may ADD apps. It may never take one away.
 *
 * `normalizeInstalledAppIds` is computed purely from the document being read, so a
 * recipe arriving over an open project — a cloud adopt, a deployed-scene adopt, a
 * restore from a published copy — replaced the owner's app state wholesale, and a
 * file carrying no `social` at all fell back to the three seed apps. That is the
 * general form of the Breakdance bug (2026-08-11): a sync pass revoking the
 * owner's intent. See docs/settings-ownership-inventory.md.
 *
 * The union is deliberately one-directional:
 * - Apps the incoming document enables stay enabled — it is the new content, and
 *   its own configuration for those apps is kept untouched.
 * - Apps the OPEN project had switched on are switched back on, because only the
 *   owner or an explicit delete may turn an app off.
 * - Installed-but-disabled survives as installed-but-disabled. "Set up, then
 *   switch on" is a legal state and this must not collapse it into "on".
 *
 * NOT for simply opening a project: its own saved app state is the truth there.
 */
export function keepOwnerAppState(incoming: OwnerAppState, local: OwnerAppState | null): OwnerAppState {
  if (!local) return incoming;
  let switches: CatalogueAppSwitches = { apps: incoming.apps, dance: incoming.dance };
  const localEnabled = enabledCatalogueAppIds(local.apps, local.dance?.enabled === true);
  for (const id of localEnabled) {
    switches = setCatalogueAppEnabled(switches, id, true);
  }
  // ‼️AND THE OWNER'S OFF WINS TOO. The ratchet above only ever switched apps ON,
  // so every cloud adopt — the 30 s poll included — re-enabled whatever the
  // owner had just turned off (2026-09-06: "switched off, and after a while
  // somehow switched on again"). An app the open project has INSTALLED but
  // disabled is a decision; an incoming copy that has it on loses to it. Apps
  // the open project never installed still arrive on, as new content.
  const localOn = new Set(localEnabled);
  for (const id of local.installedAppIds) {
    if (localOn.has(id) || !KNOWN_APP_IDS.has(id)) continue;
    switches = setCatalogueAppEnabled(switches, id, false);
  }
  return {
    apps: switches.apps,
    dance: switches.dance,
    installedAppIds: normalizeInstalledAppIds(
      [...local.installedAppIds, ...incoming.installedAppIds],
      switches.apps,
      switches.dance?.enabled === true
    ),
  };
}

/** Flip one catalogue id's runtime switch. Does not touch `installedAppIds`. */
export function setCatalogueAppEnabled(
  current: CatalogueAppSwitches,
  id: string,
  enabled: boolean
): CatalogueAppSwitches {
  const apps = current.apps;
  const dance = current.dance;
  const on = Boolean(enabled);
  // NOTE: a core app can still be switched OFF here, deliberately. "Core" means it
  // is not an install the owner chose and cannot be removed — not that its
  // behaviour is compulsory. The gate's arrival hold is an owner setting with its
  // own copy ("Untick Apps ▸ Gate to skip the hold"), and the APP law protects the
  // owner's intent in BOTH directions. Uninstall is the operation core forbids:
  // see `withAppUninstalled`.
  if (id === GATE_APP.id) {
    return { apps: { ...apps, gate: { ...apps.gate, enabled: on } }, dance };
  }
  if (id === WORLD_MAP_APP.id) {
    return { apps: { ...apps, worldMap: { ...apps.worldMap, enabled: on } }, dance };
  }
  if (id === HOST_CONSOLE_APP.id) {
    return { apps: { ...apps, hostConsole: { ...apps.hostConsole, enabled: on } }, dance };
  }
  if (id === LANDING_APP.id) {
    return {
      apps: {
        ...apps,
        landing: normalizeLandingAppConfig({
          ...(apps.landing ?? defaultLandingAppConfig()),
          enabled: on,
        }),
      },
      dance,
    };
  }
  if (id === VIDEO_APP.id) {
    return {
      apps: {
        ...apps,
        video: {
          ...apps.video,
          enabled: on,
          source: on && apps.video.source === "none" ? "url" : apps.video.source,
        },
      },
      dance,
    };
  }
  if (id === AUDIO_APP.id) {
    return {
      apps: {
        ...apps,
        audio: {
          ...apps.audio,
          enabled: on,
          source: on && apps.audio.source === "none" ? "playlist" : apps.audio.source,
        },
      },
      dance,
    };
  }
  if (id === AUDIO_STREAM_APP.id) {
    return {
      apps: {
        ...apps,
        audioStream: { ...apps.audioStream, enabled: on },
      },
      dance,
    };
  }
  if (id === EMOTE_LIBRARY_APP.id) {
    return { apps: { ...apps, emoteLibrary: { ...apps.emoteLibrary, enabled: on } }, dance };
  }
  if (id === SPEAKEASY_APP.id) {
    return { apps: { ...apps, speakeasy: { ...apps.speakeasy, enabled: on } }, dance };
  }
  if (id === GALLERY_APP.id) {
    return { apps: { ...apps, gallery: { ...apps.gallery, enabled: on } }, dance };
  }
  if (id === LIGHTS_APP.id) {
    return {
      apps: {
        ...apps,
        lights: normalizeLightsAppConfig({
          ...(apps.lights ?? defaultLightsAppConfig()),
          enabled: on,
        }),
      },
      dance,
    };
  }
  if (id === RETAIL_SHOP_APP.id) {
    return { apps: { ...apps, retailShop: { ...apps.retailShop, enabled: on } }, dance };
  }
  if (id === L1_MUSEUM_APP.id) {
    return { apps: { ...apps, l1Museum: { ...apps.l1Museum, enabled: on } }, dance };
  }
  if (id === SCRAP_APP.id) {
    return {
      apps: {
        ...apps,
        scrap: {
          ...apps.scrap,
          enabled: on,
          grantNpcAsTarget: on ? true : apps.scrap.grantNpcAsTarget,
        },
      },
      dance,
    };
  }
  if (id === SCRAP_HUMAN_APP.id) {
    return {
      apps: {
        ...apps,
        scrapHuman: normalizeScrapHumanAppConfig({
          ...(apps.scrapHuman ?? defaultScrapHumanAppConfig()),
          enabled: on,
        }),
        scrap: { ...apps.scrap, humanEdition: on },
      },
      dance,
    };
  }
  if (id === VEHICLES_APP.id) {
    return { apps: { ...apps, vehicles: { ...apps.vehicles, enabled: on } }, dance };
  }
  if (id === EXCHANGE_APP.id) {
    return { apps: { ...apps, exchange: { ...apps.exchange, enabled: on } }, dance };
  }
  if (id === VENDOR_APP.id) {
    return {
      apps: {
        ...apps,
        vendor: normalizeVendorAppConfig({
          ...apps.vendor,
          enabled: on,
          npc: {
            ...(apps.vendor?.npc ?? {}),
            enabled: on ? true : apps.vendor?.npc?.enabled !== false,
          },
        }),
      },
      dance,
    };
  }
  if (id === WEATHER_APP.id) {
    return {
      apps: {
        ...apps,
        weather: normalizeWeatherAppConfig({
          ...(apps.weather ?? defaultWeatherAppConfig()),
          enabled: on,
        }),
      },
      dance,
    };
  }
  if (id === SKYBOX_APP.id) {
    return {
      apps: {
        ...apps,
        skybox: normalizeSkyboxAppConfig({
          ...(apps.skybox ?? defaultSkyboxAppConfig()),
          enabled: on,
        }),
      },
      dance,
    };
  }
  if (id === BORDER_APP.id) {
    return {
      apps: {
        ...apps,
        border: normalizeBorderAppConfig({
          ...(apps.border ?? defaultBorderAppConfig()),
          enabled: on,
        }),
      },
      dance,
    };
  }
  if (id === OBJECT_STUDIO_APP.id) {
    return {
      apps: {
        ...apps,
        objectStudio: normalizeObjectStudioAppConfig({
          ...(apps.objectStudio ?? defaultObjectStudioAppConfig()),
          enabled: on,
        }),
      },
      dance,
    };
  }
  if (id === BUBBLE_BASH_APP.id) {
    return {
      apps: {
        ...apps,
        bubbleBash: normalizeBubbleBashAppConfig({
          ...(apps.bubbleBash ?? defaultBubbleBashAppConfig()),
          enabled: on,
        }),
      },
      dance,
    };
  }
  if (id === PUNCH_MACHINE_APP.id) {
    return {
      apps: {
        ...apps,
        punchMachine: normalizePunchMachineAppConfig({
          ...(apps.punchMachine ?? defaultPunchMachineAppConfig()),
          enabled: on,
        }),
      },
      dance,
    };
  }
  if (id === GRAVEYARD_APP.id) {
    return {
      apps: {
        ...apps,
        graveyard: normalizeGraveyardAppConfig({
          ...(apps.graveyard ?? defaultGraveyardAppConfig()),
          enabled: on,
        }),
      },
      dance,
    };
  }
  if (id === TRAIN_APP.id) {
    return { apps: { ...apps, train: { ...apps.train, enabled: on } }, dance };
  }
  if (id === TRAVERSAL_APP.id) {
    return { apps: { ...apps, traversal: { ...apps.traversal, enabled: on } }, dance };
  }
  if (id === BREAKDANCE_SHOW_APP.id) {
    const base = dance ?? defaultDanceVenueConfig();
    return { apps, dance: { ...base, enabled: on } };
  }
  return current;
}

export function withAppInstalled(
  current: CatalogueAppSwitches & { installedAppIds: readonly string[] },
  id: string,
  enable = true
): CatalogueAppSwitches & { installedAppIds: string[] } {
  let switched = enable ? setCatalogueAppEnabled(current, id, true) : current;
  if (id === EMOTE_LIBRARY_APP.id && switched.apps.emoteLibrary.worldEmotes.length === 0) {
    switched = {
      ...switched,
      apps: {
        ...switched.apps,
        emoteLibrary: {
          ...switched.apps.emoteLibrary,
          worldEmotes: [{ ...DEFAULT_WORLD_EMOTE_SELECTION }],
          assignments: {
            ...switched.apps.emoteLibrary.assignments,
            danceBug: [DEFAULT_WORLD_EMOTE_SELECTION.id],
          },
        },
      },
    };
  }
  const installedAppIds = normalizeInstalledAppIds(
    [...current.installedAppIds, id],
    switched.apps,
    switched.dance?.enabled === true
  );
  return { ...switched, installedAppIds };
}

export function withAppUninstalled(
  current: CatalogueAppSwitches & { installedAppIds: readonly string[] },
  id: string
): CatalogueAppSwitches & { installedAppIds: string[] } {
  // Core functionality is not an install, so it cannot be an uninstall either.
  if (isCoreAppId(id)) return { ...current, installedAppIds: [...current.installedAppIds] };
  const switched = setCatalogueAppEnabled(current, id, false);
  const installedAppIds = normalizeInstalledAppIds(
    current.installedAppIds.filter((item) => item !== id),
    switched.apps,
    switched.dance?.enabled === true
  );
  return { ...switched, installedAppIds };
}
