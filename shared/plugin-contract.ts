/**
 * Plugin kernel contract.
 *
 * The world runtime is the host. Apps (Host Console, Video, Audio, a later
 * shooter, …) are plugins that consume host APIs. They do not paste a second
 * scene into the world, and they do not own a private copy of NPCs, zones, or
 * screens — they bind to what the host already has.
 *
 * Canonical spec: rules/plugin-system.md
 * Authoring guide: docs/plugin-authoring.md
 */

export const PLUGIN_CONTRACT_VERSION = 1 as const;

/** Host services a plugin may call. Extend this list; do not invent ad-hoc APIs. */
export const HOST_API_IDS = [
  "media",
  "hud",
  "npcs",
  "zones",
  "entitlements",
  "gating",
  "sync",
  "storage",
  "fx",
  "map-data",
] as const;
export type HostApiId = (typeof HOST_API_IDS)[number];

/**
 * WHO supplies each host API — the authoring-side `BUILDER_SURFACES` table, one
 * ring down. Same two axes, same bootstrap test: could the plugin system load
 * this, or does it have to exist before anything can start?
 *
 * `npcs` is the interesting row. A cast is content and the crowd is an app's
 * worth of code (it lives in `scene/src/dance/`), so it is `core-plugin` — but
 * nothing declares `provides: ["npcs"]` yet, because the crowd is still host
 * code that Punch and Vendor import directly. That is the honest state: the
 * dependency is real, it is now named, and the row is what a future Cast app
 * claims when someone extracts it.
 */
export interface HostApiDef {
  provider: "base" | "core-plugin";
  /** False → survives swapping the target metaverse unchanged. */
  platformBound: boolean;
}

export const HOST_APIS: Readonly<Record<HostApiId, HostApiDef>> = {
  hud: { provider: "base", platformBound: false },
  zones: { provider: "base", platformBound: false },
  storage: { provider: "base", platformBound: false },
  sync: { provider: "base", platformBound: false },
  fx: { provider: "base", platformBound: false },
  media: { provider: "core-plugin", platformBound: false },
  npcs: { provider: "core-plugin", platformBound: true },
  "map-data": { provider: "core-plugin", platformBound: false },
  entitlements: { provider: "core-plugin", platformBound: true },
  gating: { provider: "core-plugin", platformBound: true },
};

/**
 * Privileges that change host behaviour (NPCs as targets, doors, HUD takeover).
 * The world owner must grant each one. Requesting is not receiving.
 */
export const HOST_OVERRIDE_IDS = [
  "npc.asTarget",
  "zone.asArena",
  "door.override",
  "hud.overlay",
] as const;
export type HostOverrideId = (typeof HOST_OVERRIDE_IDS)[number];

/**
 * Named slots the host must fill before a strict plugin may start.
 * Values match VenueAppDescriptor.requiredBindings.
 */
export type HostBindingId = string;

export type PluginSyncMode = "none" | "serverless" | "authoritative";

/**
 * HOW AN APP GOT HERE. Deliberately the same two words the builder-app contract
 * uses, because it is the same question asked of the same id.
 *
 * There is no `base` tier. Base core is the CONTAINER — the registry, the save
 * file, the plot and its frames, the viewport, identity — and it cannot be a
 * plugin because the plugin system needs it to exist before anything can be
 * resolved, mounted or started. Giving it a tier would only invite something to
 * be filed there for feeling important.
 *
 *   core-plugin — ships in the box, removable in principle. Not a law.
 *   community   — anyone's. First-party authorship earns nothing here; the
 *                 container owes a first-party app exactly what it owes a
 *                 stranger's, which is the only way the stranger's ever works.
 */
export const PLUGIN_TIERS = ["core-plugin", "community"] as const;
export type PluginTier = (typeof PLUGIN_TIERS)[number];

/**
 * How the scene boots this plugin today.
 * - kernel: started by planPluginStart + a scene starter
 * - legacy-boot: still an if-statement in scene/src/social/index.ts (migrate next)
 */
export type PluginRuntime = "kernel" | "legacy-boot";

/**
 * When the host may run this plugin's starter.
 *
 * The host owns the queue. Apps declare a class; they do not pick a timestamp,
 * and the scene must not special-case plugin ids. Omit the field → `deferred`,
 * so a third-party shooter that forgets to set it still waits.
 *
 * - immediate — spawn-critical and cheap (HUD chip, door, screen *register*).
 *   Never dump meshes, avatars, NFT fetches, or a video decoder here.
 * - early — soon after the landing crowd, still light.
 * - deferred — default. After the first avatar wave. Gallery, vehicles, scrap,
 *   a shooter, anything with assets.
 * - idle — last. Heavy games that can appear a few seconds after arrival.
 */
export const PLUGIN_LOAD_CLASSES = ["immediate", "early", "deferred", "idle"] as const;
export type PluginLoadClass = (typeof PLUGIN_LOAD_CLASSES)[number];

export interface PluginManifest {
  contractVersion: typeof PLUGIN_CONTRACT_VERSION;
  /** Same id as VenueAppDescriptor.id (e.g. swissverse.video). */
  id: string;
  version: number;
  name: string;
  summary: string;
  requiredBindings: readonly HostBindingId[];
  hostApis: readonly HostApiId[];
  requestedOverrides: readonly HostOverrideId[];
  /** Cross-world passport keys this plugin may read/write. Empty until storage ships. */
  passportKeys: readonly string[];
  syncMode: PluginSyncMode;
  runtime: PluginRuntime;
  /**
   * When true, missing requiredBindings blocks start.
   * First-party Video is false so existing venues without a screen still boot.
   * New plugins should be true.
   */
  strictBindings: boolean;
  /** Omit → deferred. The host scheduler reads this; do not hardcode plugin ids. */
  loadClass?: PluginLoadClass;

  /** Omit → `core-plugin`. See PLUGIN_TIERS. */
  tier?: PluginTier;

  /**
   * Host capabilities this plugin SUPPLIES to others — the inverse of
   * `hostApis`, and the field that makes "removable in principle" checkable
   * rather than aspirational.
   *
   * ★ It is `[]` on every first-party manifest today, and that is the honest
   * reading: the host still owns every capability in HOST_API_IDS. NPCs live in
   * `scene/src/dance/*`, media in `scene/src/social/media.ts`, the HUD in
   * `scene/src/social/hud-*`. Nothing is a plugin's to withdraw yet.
   *
   * The FIRST non-empty entry here is the decoupling milestone: the day Cast
   * declares `provides: ["npcs"]`, a scene without Cast has no NPCs, and every
   * app that declared `hostApis: ["npcs"]` is correctly blocked instead of
   * silently reaching into a module that happens to be linked in.
   */
  provides?: readonly HostApiId[];

  /**
   * Does the data this app writes into the SCENE FILE survive swapping
   * Decentraland out?
   *
   * ★★ This is a claim about the AUTHORED CONTRACT, not about the code. Every
   * scene plugin's implementation is SDK7 and would be rewritten per platform;
   * saying so would make this field a constant and worth nothing. What differs
   * is the data: a gallery's frames and artwork URLs, a water tile grid, a
   * skybox colour are all just facts about a place, and another engine could
   * render them from the same file. A wearable-token gate, a MANA price and an
   * L1 collection are Decentraland the noun, not Decentraland the renderer.
   *
   * Omit → `true`. Portability is a claim someone has to earn, not a default
   * everyone gets for free.
   */
  platformBound?: boolean;
}

/** Tier with the default applied. */
export function pluginTier(manifest: PluginManifest): PluginTier {
  return manifest.tier ?? "core-plugin";
}

/** Supplied capabilities with the default applied. */
export function pluginProvides(manifest: PluginManifest): readonly HostApiId[] {
  return manifest.provides ?? [];
}

/** Whether the authored data is tied to Decentraland, with the default applied. */
export function isPlatformBound(manifest: PluginManifest): boolean {
  return manifest.platformBound ?? true;
}

/**
 * Who supplies each host capability, given a set of manifests.
 *
 * `"base"` means the container/runtime still owns it. Reading this is how the
 * kernel will one day answer "this scene has no Cast, so nothing may ask for
 * NPCs" — and today it is the ledger that shows how much is still base.
 */
export function capabilityProviders(
  manifests: readonly PluginManifest[]
): Record<HostApiId, string[]> {
  const out = {} as Record<HostApiId, string[]>;
  for (const api of HOST_API_IDS) out[api] = [];
  for (const manifest of manifests) {
    for (const api of pluginProvides(manifest)) {
      if (!out[api].includes(manifest.id)) out[api].push(manifest.id);
    }
  }
  return out;
}

/** Capabilities nothing declares itself the provider of — still the host's. */
export function baseOwnedCapabilities(
  manifests: readonly PluginManifest[]
): HostApiId[] {
  const providers = capabilityProviders(manifests);
  return HOST_API_IDS.filter((api) => providers[api].length === 0);
}

export type PluginStartStatus = "started" | "skipped" | "blocked" | "legacy";

export interface PluginStartResult {
  pluginId: string;
  status: PluginStartStatus;
  reason?: string;
  missingBindings?: string[];
  incompleteBindings?: string[];
  deniedOverrides?: HostOverrideId[];
}

export interface PluginStartInput {
  manifests: readonly PluginManifest[];
  enabledPluginIds: readonly string[];
  availableBindings: readonly HostBindingId[];
  grantedOverrides: readonly HostOverrideId[];
}

export interface PluginBootSlot {
  pluginId: string;
  loadClass: PluginLoadClass;
  /** Seconds after scene `main()` before the host runs the starter. */
  delayS: number;
}

export interface PluginStartPlan {
  results: PluginStartResult[];
  toStart: string[];
  /** Host-owned start order. Scene code must follow this, not a plugin-id list. */
  schedule: PluginBootSlot[];
}

/** Smart-entity behavior → host binding slot. */
export const BINDING_FROM_BEHAVIOR: Readonly<Record<string, HostBindingId>> = {
  video_surface: "media-screen",
  audio_stream: "media-emitter",
  gate_barrier: "access-gate",
  synced_door: "door",
  scrap_ring: "scrap-ring",
  bubble_arena: "bubble-arena",
  punch_machine: "punch-machine",
  grave_plot: "grave-plot",
  graveyard_grounds: "grave-plot",
  garden_bed: "garden-bed",
};
