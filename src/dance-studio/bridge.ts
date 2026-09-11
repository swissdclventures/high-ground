/**
 * Scene-side stand-in for the wearable's analytics bridge
 * (DCL Dance Smart Wearable → wearable/src/bridge.ts).
 * In-scene, every played move already lands in AvatarEmoteCommand and is scored
 * by the dance loop (scene/src/dance/) — no external bridge needed.
 */
export async function postDanceEvent(_moveName: string): Promise<void> {
  // no-op in the scene runtime
}
