/**
 * WHICH PLUGINS ARE ACTUALLY RUNNING IN THIS SCENE.
 *
 * The UI has to answer "is the Break Dancing plugin here?" before it draws an admin
 * control for it — a Host panel full of controls for modules a World does not have is
 * worse than a short one. `enabledPluginIdsFromApps` (shared) answers that from CONFIG;
 * this registry answers it from what actually STARTED, which is the honest question: a
 * plugin whose bindings were missing is blocked, and its controls would be dead buttons.
 *
 * Two ways in:
 *  - `startScenePlugins` marks every plugin the kernel scheduled.
 *  - Legacy-boot features the kernel does not start (the dance venue) mark themselves at
 *    the point they really come up.
 *
 * Read it with `isPluginActive(APP.id)`. Never infer a plugin from a side effect —
 * `getDanceConfig() !== null` is true for a plain NPC crowd as well as for the
 * breakdance show, and that ambiguity is exactly what this registry removes.
 */

const active = new Set<string>();

export function markPluginActive(id: string): void {
  active.add(id);
}

export function isPluginActive(id: string): boolean {
  return active.has(id);
}

export function activePluginIds(): string[] {
  return [...active];
}

/** Test seam — the runtime never clears the set. */
export function resetActivePlugins(): void {
  active.clear();
}
