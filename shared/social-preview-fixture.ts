/**
 * Dev preview overlay for Surface 4 — OPT-IN ONLY for local `scene/ npm run start`.
 *
 * ⚠️ NEVER auto-apply this in scene/src/index.ts. It used to be, and because it
 * injects placeholder venue pieces for any smart-object id the config lacks, every
 * REAL publish shipped a phantom access gate: an invisible collider box floating
 * mid-scene plus the red "connect the preview admin wallet" denied text. To use it
 * during local dev, wrap the config manually in a scratch branch of main().
 * Spec: rules/surface-4-social.md
 */
import type { SceneRuntimeConfig } from "@shared/scene-runtime-config";
import type { SmartRuntimeEntity } from "@shared/scene-runtime-config";
import {
  createAccessGateEntity,
  createAudioSourceEntity,
  createMediaScreenEntity,
  createSlidingDoorEntity,
  defaultStaticMovement,
} from "@shared/smart-object-contract";
import {
  defaultSocialSurfaceConfig,
  normalizeGateRule,
  normalizeSocialSurfaceConfig,
} from "@shared/social-surface-contract";
import {
  defaultSocialSampleAudioUrl,
  defaultSocialSampleVideoUrl,
} from "@shared/social-samples";

/** Preview admin wallet — replace with your test wallet in local preview.
 *  In scene/ preview, set SOCIAL_PREVIEW_ADMIN to your wallet to open the Host HUD. */
export const SOCIAL_PREVIEW_ADMIN = "0x0000000000000000000000000000000000000001";

// In the DCL runtime readBrowserOrigin() is empty, so the fixture ALWAYS uses
// these fallbacks. They must be absolute, reachable, CORS-enabled, DCL-playable.
// The old video fallback (decentraland.org/images/videos/hero.mp4) 404'd → black
// screen while audio worked; use the real bundled sample (verified CORS).
const PREVIEW_FALLBACK_VIDEO = "https://builder.swissverse.org/social-samples/hiphop-bg-loop.mp4";
const PREVIEW_FALLBACK_AUDIO = "https://builder.swissverse.org/social-samples/june-26-sample.mp3";

const PREVIEW_GATE = normalizeGateRule({
  id: "preview_allowlist",
  mode: "allowlist",
  chain: "polygon",
  contract: null,
  tokenIds: null,
  wearableUrns: null,
  allowedAddresses: [SOCIAL_PREVIEW_ADMIN],
  match: "any",
  deniedMessage: "VIP allowlist only — connect the preview admin wallet",
});

function readBrowserOrigin(): string {
  if (typeof globalThis === "undefined") return "";
  const loc = (globalThis as { location?: { origin?: string } }).location;
  return loc?.origin ?? "";
}

function previewVideoUrl(): string {
  const origin = readBrowserOrigin();
  return origin ? defaultSocialSampleVideoUrl(origin) : PREVIEW_FALLBACK_VIDEO;
}

function previewAudioUrl(): string {
  const origin = readBrowserOrigin();
  return origin ? defaultSocialSampleAudioUrl(origin) : PREVIEW_FALLBACK_AUDIO;
}

function smartRuntimeFromEntity(
  entity: ReturnType<typeof createMediaScreenEntity>,
  modelFile: string
): SmartRuntimeEntity {
  return {
    id: entity.id,
    type: entity.type,
    modelFile,
    behavior: entity.behavior,
    movement: entity.movement ?? defaultStaticMovement(0),
    anchors: entity.anchors,
    spec: entity.spec,
  };
}

export function buildSocialPreviewSmartEntities(): SmartRuntimeEntity[] {
  const videoUrl = previewVideoUrl();
  const screen = createMediaScreenEntity("social_screen_main", {
    centerX: 4,
    centerZ: -6,
    floorIndex: 0,
    height: 1.5,
    width: 2.8,
    mediaUrl: videoUrl,
  });
  const gate = createAccessGateEntity("social_gate_main", {
    centerX: 0,
    centerZ: -8,
    floorIndex: 0,
    width: 2.5,
    height: 2.5,
    gateRuleId: PREVIEW_GATE.id,
  });
  const audio = createAudioSourceEntity("social_audio_main", {
    centerX: -3,
    centerZ: -5,
    floorIndex: 0,
    mediaUrl: previewAudioUrl(),
  });
  const door = createSlidingDoorEntity("social_door_main", {
    centerX: 2,
    centerZ: -7,
    floorIndex: 0,
    width: 2,
    slideDistance: 0.9,
  });

  return [
    smartRuntimeFromEntity(screen, "models/smart/social_screen_main.glb"),
    smartRuntimeFromEntity(gate, "models/smart/social_gate_main.glb"),
    smartRuntimeFromEntity(audio, "models/smart/social_audio_main.glb"),
    smartRuntimeFromEntity(door, "models/smart/social_door_main.glb"),
  ];
}

/** Preview dance zones — an INTIMATE breakdance circle (small floor, tight ring),
 *  pushed toward +Z so the center circulation core stays clear (the first live
 *  test had the bot standing inside the stairs at the old 0,2.5 placement). */
export const DANCE_PREVIEW_FLOOR_ZONE = "dance_floor_preview";
export const DANCE_PREVIEW_SUPPORT_ZONE = "dance_support_preview";

export function buildDancePreviewFloorZones() {
  return [
    {
      id: DANCE_PREVIEW_FLOOR_ZONE,
      name: "Dance floor (preview)",
      floorIndex: 0,
      shape: { kind: "circle" as const, centerX: 0, centerZ: 4, radius: 1.8 },
    },
    {
      id: DANCE_PREVIEW_SUPPORT_ZONE,
      name: "Support circle (preview)",
      floorIndex: 0,
      shape: { kind: "circle" as const, centerX: 0, centerZ: 4, radius: 3.4 },
    },
  ];
}

export function buildSocialPreviewConfig(buildingName?: string) {
  return normalizeSocialSurfaceConfig({
    enabled: true,
    dance: {
      enabled: true,
      danceFloorZoneId: DANCE_PREVIEW_FLOOR_ZONE,
      supportZoneId: DANCE_PREVIEW_SUPPORT_ZONE,
    },
    event: {
      name: "Preview Event",
      // Empty → ANY signed-in local player is admin, so the HOST panel opens in
      // preview without hardcoding a wallet. (This config is local-dev only — it
      // never reaches a real publish; see index.ts previewFixture gate.)
      adminWallets: [],
      announceOnEnter: "Welcome to the Surface 4 preview venue",
      crowdEmotes: ["robot", "clap", "dance"],
    },
    gates: [],
    buildingGateRuleId: null,
    media: {
      screenSmartObjectId: "social_screen_main",
      audioSmartObjectId: "social_audio_main",
      defaultVideoUrl: previewVideoUrl(),
      defaultAudioUrl: previewAudioUrl(),
      audioSpatial: true,
      // Autoplay the sample video so the screen is obviously working in preview.
      videoPlayingOnLoad: true,
    },
    permissions: {
      useWeb3Api: false,
      allowTriggerAvatarEmote: true,
      allowMovePlayerInsideScene: true,
      useFetch: false,
    },
  }, buildingName ?? "Preview");
}

/** Merge preview social + smart entities when config lacks them (local SDK preview). */
export function applySocialPreviewFixture(config: SceneRuntimeConfig): SceneRuntimeConfig {
  const hasSocial = config.social?.enabled === true;
  const previewEntities = buildSocialPreviewSmartEntities();
  const existingIds = new Set((config.smartEntities ?? []).map((e) => e.id));
  const mergedEntities = [
    ...(config.smartEntities ?? []),
    ...previewEntities.filter((e) => !existingIds.has(e.id)),
  ];

  // Dance preview zones ride along whenever the fixture supplies social config —
  // the loop needs floor_zone geometry to resolve against.
  const existingZoneIds = new Set((config.floorZones ?? []).map((z) => z.id));
  const mergedZones = [
    ...(config.floorZones ?? []),
    ...buildDancePreviewFloorZones().filter((z) => !existingZoneIds.has(z.id)),
  ];

  if (hasSocial) {
    return { ...config, smartEntities: mergedEntities };
  }

  return {
    ...config,
    social: buildSocialPreviewConfig(config.buildingName),
    smartEntities: mergedEntities,
    floorZones: mergedZones,
  };
}
