/** Lightweight edge-triggered zone actions. One fire per crossing, never per frame. */

export type ProximityTriggerAction = "play_video" | "play_audio";

export interface ProximityTriggerSpec {
  enabled: boolean;
  action: ProximityTriggerAction;
  targetId: string;
}

export function normalizeProximityTrigger(
  raw: Partial<ProximityTriggerSpec> | null | undefined
): ProximityTriggerSpec | undefined {
  if (!raw) return undefined;
  const targetId = String(raw.targetId ?? "").trim();
  return {
    enabled: raw.enabled === true && targetId.length > 0,
    action: raw.action === "play_audio" ? "play_audio" : "play_video",
    targetId,
  };
}

/** Pure crossing reducer used by runtime and tests. */
export function proximityTriggerCrossings(
  previousInside: ReadonlySet<string>,
  currentlyInside: ReadonlySet<string>
): { entered: string[]; exited: string[]; inside: Set<string> } {
  return {
    entered: [...currentlyInside].filter((id) => !previousInside.has(id)),
    exited: [...previousInside].filter((id) => !currentlyInside.has(id)),
    inside: new Set(currentlyInside),
  };
}
