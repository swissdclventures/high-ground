/**
 * Per-building component-id namespacing (multi-building phase 2).
 *
 * Component ids like `floor_slab_f3` are minted per building and PARSED all over the
 * pipeline (floor indexes are extracted from them, neighbors are referenced by
 * constructing sibling ids). With several buildings in one scene those ids would
 * collide, so every building except the primary gets a namespace prefix:
 *
 *   primary  (b1):  floor_slab_f3            — unprefixed, byte-identical to every
 *                                              existing save, mesh name, and test
 *   building bN:    bN::floor_slab_f3
 *
 * The asymmetry is deliberate: the primary building keeps the legacy ids so no saved
 * component registry, lock, or override ever needs a migration. Port ids extend the
 * component id (`b2::floor_opening_f1.port.south`), so scoping the component id scopes
 * the whole port graph for free.
 *
 * Rules for code that touches ids:
 *  - COMPARE or PARSE an id → go through componentBaseId() first.
 *  - CONSTRUCT a reference to a sibling component (same building) → siblingComponentId()
 *    with the id of the component you already hold, never a bare literal.
 *  - MINT ids for a building → scopedComponentId(buildingId, baseId).
 */

import { PRIMARY_BUILDING_ID } from "./types";

export const COMPONENT_NS_SEPARATOR = "::";

/** Mint an id for a building: primary stays unprefixed, others get `id::base`. */
export function scopedComponentId(buildingId: string, baseId: string): string {
  return buildingId === PRIMARY_BUILDING_ID || !buildingId
    ? baseId
    : `${buildingId}${COMPONENT_NS_SEPARATOR}${baseId}`;
}

/** Which building an id belongs to; unprefixed ids are the primary building's. */
export function componentBuildingId(id: string): string {
  const sep = id.indexOf(COMPONENT_NS_SEPARATOR);
  return sep > 0 ? id.slice(0, sep) : PRIMARY_BUILDING_ID;
}

/** The id without its namespace prefix — what legacy string-matches expect. */
export function componentBaseId(id: string): string {
  const sep = id.indexOf(COMPONENT_NS_SEPARATOR);
  return sep > 0 ? id.slice(sep + COMPONENT_NS_SEPARATOR.length) : id;
}

/**
 * Construct a reference to a sibling component in the SAME building as `siblingId`.
 * This is how compile-time neighbor references (opening below, roof slab above) stay
 * inside one building's namespace without the call site knowing about buildings.
 */
export function siblingComponentId(siblingId: string, baseId: string): string {
  return scopedComponentId(componentBuildingId(siblingId), baseId);
}

/**
 * Building ids are persisted, used as component namespaces, object names, and rendered
 * in editor diagnostics. Keep them a short inert slug so a hand-edited recipe cannot
 * inject separators, markup, selectors, or unbounded labels into those consumers.
 */
export function sanitizeBuildingId(id: string): string {
  return id
    .trim()
    .split(COMPONENT_NS_SEPARATOR)
    .join("_")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "building";
}
