/**
 * Roof crowns — the top of a building, which is where a skyline lives.
 *
 * Every building used to end in a flat slab. The Central Park South test (2026-09-05)
 * ranked that the most expensive gap in the photograph. A crown is a DECORATIVE cap
 * built by the composer on top of the structural roof: no collider, nothing walkable,
 * so it never touches the physics layer. It is baked into building.glb like the sloped
 * envelope. Canon: docs/city-kit-roadmap-2026-09.md, Phase 1 item 2.
 *
 * Height is land: a crown adds to the building's top, so it counts toward the scene
 * ceiling. `clampBuildingConfig` shortens a crown into the headroom that is left, and
 * the placement gate reads `buildingTopM`, never `buildingHeightM`, so a crown can never
 * push a building through the cap without a named refusal.
 *
 * Pure: no three.js. The geometry lives in app/src/modules/roof-crown.ts.
 */

export type RoofCrownKind =
  | "step" // tiered setbacks — Art Deco
  | "sawtooth" // a row of triangular prisms — industrial
  | "dome" // half sphere on a low drum
  | "spire" // a cone or needle, optional mast
  | "halo" // a ring floating above the roof
  | "penthouse" // a smaller box with its own slab — mechanical bulkhead
  | "antenna" // a cluster of thin masts
  | "clutter"; // water tank on legs, a bulkhead and a cornice band

export type RoofCrownMaterial = "solid" | "glass" | "metal";

export const ROOF_CROWN_KINDS: readonly RoofCrownKind[] = [
  "step",
  "sawtooth",
  "dome",
  "spire",
  "halo",
  "penthouse",
  "antenna",
  "clutter",
];
export const ROOF_CROWN_MATERIALS: readonly RoofCrownMaterial[] = ["solid", "glass", "metal"];

export interface RoofCrownConfig {
  kind: RoofCrownKind;
  /** Total height above the structural roof, metres. */
  heightM: number;
  material: RoofCrownMaterial;
  /** How far the crown steps in from the roof edge, metres. */
  insetM: number;
  /** Tiers for step, teeth for sawtooth, masts for antenna. Ignored by the rest. */
  count: number;
  /** A small emissive light at the very top — aviation beacon, spire tip. */
  beacon: boolean;
}

export const ROOF_CROWN_LIMITS = {
  heightM: { min: 1, max: 60 },
  insetM: { min: 0, max: 20 },
  count: { min: 1, max: 12 },
} as const;

/** Sensible starting values per kind, so `{ kind: "dome" }` already reads well. */
export function defaultRoofCrown(kind: RoofCrownKind = "step"): RoofCrownConfig {
  const base: RoofCrownConfig = {
    kind,
    heightM: 6,
    material: "solid",
    insetM: 2,
    count: 3,
    beacon: false,
  };
  switch (kind) {
    case "step":
      return base;
    case "sawtooth":
      return { ...base, heightM: 3, insetM: 0, count: 4 };
    case "dome":
      return { ...base, heightM: 8, insetM: 1 };
    case "spire":
      return { ...base, heightM: 18, material: "metal", insetM: 3, beacon: true };
    case "halo":
      return { ...base, heightM: 6, material: "metal", insetM: 0 };
    case "penthouse":
      return { ...base, heightM: 4, insetM: 4 };
    case "antenna":
      return { ...base, heightM: 12, material: "metal", insetM: 3, count: 3, beacon: true };
    case "clutter":
      return { ...base, heightM: 4, insetM: 2, count: 2 };
  }
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Fill every field from the kind's defaults and clamp into the limits. Never throws. */
export function normalizeRoofCrown(raw: unknown): RoofCrownConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = pick(r.kind, ROOF_CROWN_KINDS, "step");
  const d = defaultRoofCrown(kind);
  return {
    kind,
    heightM: clamp(num(r.heightM, d.heightM), ROOF_CROWN_LIMITS.heightM.min, ROOF_CROWN_LIMITS.heightM.max),
    material: pick(r.material, ROOF_CROWN_MATERIALS, d.material),
    insetM: clamp(num(r.insetM, d.insetM), ROOF_CROWN_LIMITS.insetM.min, ROOF_CROWN_LIMITS.insetM.max),
    count: Math.round(clamp(num(r.count, d.count), ROOF_CROWN_LIMITS.count.min, ROOF_CROWN_LIMITS.count.max)),
    beacon: typeof r.beacon === "boolean" ? r.beacon : d.beacon,
  };
}

/** A quotable reason the raw config was changed by normalisation, or null. */
export function roofCrownIssue(raw: unknown): string | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (r.kind !== undefined && !(ROOF_CROWN_KINDS as readonly unknown[]).includes(r.kind)) {
    return `kind must be one of ${ROOF_CROWN_KINDS.join(", ")}.`;
  }
  const c = normalizeRoofCrown(raw);
  if (r.heightM !== undefined && num(r.heightM, NaN) !== c.heightM) {
    return `heightM ${String(r.heightM)} is out of range; clamped to ${c.heightM} m.`;
  }
  if (r.insetM !== undefined && num(r.insetM, NaN) !== c.insetM) {
    return `insetM ${String(r.insetM)} is out of range; clamped to ${c.insetM} m.`;
  }
  if (r.count !== undefined && num(r.count, NaN) !== c.count) {
    return `count ${String(r.count)} is out of range; clamped to ${c.count}.`;
  }
  if (r.material !== undefined && r.material !== c.material) {
    return `material must be solid, glass or metal.`;
  }
  return null;
}

/**
 * Radius of the beacon sphere, and the reason it is a named constant.
 *
 * The beacon used to be drawn at `heightM + 0.3` with a 0.35 m radius, so the MESH
 * reached 0.65 m above the height the config declares — while `roofCrownHeightM`
 * reported the declared number. Every config-reading gate (placement, crown fitting)
 * therefore passed a tower whose real top was 0.65 m higher than anyone said, and the
 * geometry-measuring budget refused the publish over a light bulb ("just one tiny
 * little stick at the top of the tower", owner, 2026-09-09).
 *
 * The beacon now caps the crown from INSIDE its declared height: its top lands exactly
 * on `heightM`, so the declaration is the truth and the two checks agree.
 */
export const ROOF_CROWN_BEACON_R_M = 0.35;

/** Height a crown adds above the structural roof; 0 without one. */
export function roofCrownHeightM(crown: RoofCrownConfig | null | undefined): number {
  if (!crown) return 0;
  return normalizeRoofCrown(crown).heightM;
}

/**
 * Shorten a crown into the headroom that is left under the cap. Returns null when
 * less than the minimum height remains, so the composer builds nothing rather than a
 * stub that reads as a mistake.
 */
export function fitRoofCrownToHeadroom(
  crown: RoofCrownConfig | null | undefined,
  headroomM: number
): RoofCrownConfig | null {
  if (!crown) return null;
  const c = normalizeRoofCrown(crown);
  if (headroomM < ROOF_CROWN_LIMITS.heightM.min) return null;
  return c.heightM <= headroomM ? c : { ...c, heightM: Math.floor(headroomM * 10) / 10 };
}

/** One line a panel or an agent can read back. */
export function describeRoofCrown(crown: RoofCrownConfig | null | undefined): string {
  if (!crown) return "flat roof";
  const c = normalizeRoofCrown(crown);
  const counted =
    c.kind === "step" ? ` in ${c.count} tiers` : c.kind === "sawtooth" ? ` with ${c.count} teeth` : c.kind === "antenna" ? ` of ${c.count} masts` : "";
  return `${c.kind}${counted}, ${c.heightM} m, ${c.material}, inset ${c.insetM} m${c.beacon ? ", beacon" : ""}`;
}
