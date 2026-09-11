import {
  BINDING_FROM_BEHAVIOR,
  PLUGIN_LOAD_CLASSES,
  type HostBindingId,
  type HostOverrideId,
  type PluginBootSlot,
  type PluginLoadClass,
  type PluginManifest,
  type PluginStartInput,
  type PluginStartPlan,
  type PluginStartResult,
} from "./plugin-contract";
import { BOOT_PACE } from "./boot-pace";

export function bindingsFromBehaviors(behaviors: readonly string[]): HostBindingId[] {
  const slots = new Set<HostBindingId>();
  for (const behavior of behaviors) {
    const slot = BINDING_FROM_BEHAVIOR[behavior];
    if (slot) slots.add(slot);
  }
  return [...slots];
}

function missingFrom(
  required: readonly string[],
  available: ReadonlySet<string>
): string[] {
  return required.filter((slot) => !available.has(slot));
}

function deniedOverrides(
  requested: readonly HostOverrideId[],
  granted: ReadonlySet<HostOverrideId>
): HostOverrideId[] {
  return requested.filter((flag) => !granted.has(flag));
}

/**
 * Decide which enabled plugins the host may start. Pure: no scene SDK.
 * Scene code starts ids from `schedule`, not from a plugin-id list.
 */
export function planPluginStart(input: PluginStartInput): PluginStartPlan {
  const enabled = new Set(input.enabledPluginIds);
  const available = new Set(input.availableBindings);
  const granted = new Set(input.grantedOverrides);
  const results: PluginStartResult[] = [];
  const toStart: string[] = [];

  for (const manifest of input.manifests) {
    if (!enabled.has(manifest.id)) {
      results.push({ pluginId: manifest.id, status: "skipped", reason: "disabled" });
      continue;
    }

    if (manifest.runtime === "legacy-boot") {
      results.push({
        pluginId: manifest.id,
        status: "legacy",
        reason: "still boots from scene/src/social/index.ts — not on the kernel yet",
      });
      continue;
    }

    const denied = deniedOverrides(manifest.requestedOverrides, granted);
    if (denied.length) {
      results.push({
        pluginId: manifest.id,
        status: "blocked",
        reason: "host did not grant requested overrides",
        deniedOverrides: denied,
      });
      continue;
    }

    const missing = missingFrom(manifest.requiredBindings, available);
    if (missing.length && manifest.strictBindings) {
      results.push({
        pluginId: manifest.id,
        status: "blocked",
        reason: "required host bindings are missing",
        missingBindings: missing,
      });
      continue;
    }

    toStart.push(manifest.id);
    const result: PluginStartResult = { pluginId: manifest.id, status: "started" };
    if (missing.length) {
      result.reason = "started with incomplete bindings";
      result.incompleteBindings = missing;
    }
    results.push(result);
  }

  return { results, toStart, schedule: schedulePluginStarts(toStart, input.manifests) };
}

export function assertManifest(manifest: PluginManifest): string[] {
  const issues: string[] = [];
  if (!manifest.id.trim()) issues.push("id is required");
  if (manifest.contractVersion !== 1) issues.push("unsupported contractVersion");
  if (manifest.strictBindings && manifest.requiredBindings.length === 0) {
    issues.push("strictBindings is true but requiredBindings is empty");
  }
  if (manifest.loadClass !== undefined && !isPluginLoadClass(manifest.loadClass)) {
    issues.push("loadClass must be immediate | early | deferred | idle");
  }
  return issues;
}

function isPluginLoadClass(value: unknown): value is PluginLoadClass {
  return (
    typeof value === "string" &&
    (PLUGIN_LOAD_CLASSES as readonly string[]).includes(value)
  );
}

/**
 * Unknown / omitted loadClass is deferred. A shooter that forgets the field
 * still waits — the host never treats a missing class as immediate.
 */
export function resolvePluginLoadClass(
  manifest: PluginManifest | undefined
): PluginLoadClass {
  return isPluginLoadClass(manifest?.loadClass) ? manifest.loadClass : "deferred";
}

/**
 * Turn `toStart` into a host-owned queue. Same-class plugins are staggered so
 * gallery + vehicles + a shooter do not dump on the same second.
 */
export function schedulePluginStarts(
  toStart: readonly string[],
  manifests: readonly PluginManifest[],
  pace: typeof BOOT_PACE = BOOT_PACE
): PluginBootSlot[] {
  const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
  const buckets: Record<PluginLoadClass, string[]> = {
    immediate: [],
    early: [],
    deferred: [],
    idle: [],
  };
  for (const id of toStart) {
    buckets[resolvePluginLoadClass(byId.get(id))].push(id);
  }
  const slots: PluginBootSlot[] = [];
  for (const id of buckets.immediate) {
    slots.push({ pluginId: id, loadClass: "immediate", delayS: 0 });
  }
  buckets.early.forEach((id, index) => {
    slots.push({
      pluginId: id,
      loadClass: "early",
      delayS: pace.earlyPluginsS + index * pace.pluginStartGapS,
    });
  });
  buckets.deferred.forEach((id, index) => {
    slots.push({
      pluginId: id,
      loadClass: "deferred",
      delayS: pace.deferredPluginsS + index * pace.pluginStartGapS,
    });
  });
  buckets.idle.forEach((id, index) => {
    slots.push({
      pluginId: id,
      loadClass: "idle",
      delayS: pace.idlePluginsS + index * pace.pluginStartGapS,
    });
  });
  return slots;
}
