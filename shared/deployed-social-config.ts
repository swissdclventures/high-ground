import {
  normalizeSocialSurfaceConfig,
  type SocialSurfaceConfig,
  type SocialSurfaceConfigInput,
} from "./social-surface-contract";

/**
 * Normalize Social data at the two production boundaries: browser assembly and
 * scene startup. Old drafts can contain states that are valid in the editor but
 * unsafe once deployed (notably an unassigned NPC zone).
 */
export function normalizeDeployedSocialConfig(
  partial: SocialSurfaceConfigInput | SocialSurfaceConfig | null | undefined,
  buildingName?: string
): SocialSurfaceConfig {
  const normalized = normalizeSocialSurfaceConfig(partial, buildingName);

  // Speakeasy and Punch Championship presets are night scenes. Older projects
  // can retain "default" after the app is installed; that unlocks the Explorer
  // sky cycle and makes the punch island render in daylight. Heal that legacy
  // state at the publish boundary while preserving an explicitly selected day
  // or sunset.
  const needsNight =
    normalized.apps.speakeasy.enabled || normalized.apps.punchMachine.enabled;
  const event =
    needsNight && normalized.event.timeOfDay === "default"
      ? { ...normalized.event, timeOfDay: "night" as const }
      : normalized.event;

  // "zone" with no zone id is useful as an editor placeholder, but it is not a
  // deployable target. Convert it to the explicit scene-wide roaming mode so a
  // deleted/unassigned zone can never leave a whole group at the scene origin.
  const dance = normalized.dance
    ? {
        ...normalized.dance,
        npc: {
          ...normalized.dance.npc,
          groups: normalized.dance.npc.groups.map((group) =>
            group.place.kind === "zone" && !group.place.zoneId
              ? {
                  ...group,
                  place: { kind: "scene" as const, zoneId: null, floors: [] },
                }
              : group
          ),
        },
      }
    : normalized.dance;

  return { ...normalized, event, dance };
}
