/**
 * Spatial directory codes for buildings on a plot — the same string shown as a
 * gold plate above the entrance in-world and on the Builder tabs.
 *
 * Format is letter + number, like a real street grid: letter runs west → east
 * (A, B, … Z, AA), number runs south → north from 1. Derived from the building's
 * south-west parcel so dragging it updates the address, and so two towers never
 * share a code unless they actually sit on the same parcel (then C7, C7A, C7B).
 */

import { resolveBuildingPlacement } from "./building-placement";
import { GRID, type PlacedBuilding, type SceneLayout } from "./types";

/** Stable id of the generated entrance plate — never persisted on the recipe. */
export const DIRECTORY_SIGN_ID = "text_sign_directory";

/** Discreet gold, matching the Speakeasy ticket lettering. */
export const DIRECTORY_SIGN_GOLD = "#d4af37";

/** Spreadsheet-style column letters: 0 → A, 25 → Z, 26 → AA. */
export function directoryColumnLetters(index: number): string {
  let n = Math.max(0, Math.floor(index));
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export function directoryParcelCell(
  building: PlacedBuilding,
  layout: SceneLayout
): { col: number; row: number } {
  const origin = resolveBuildingPlacement(building, layout).origin;
  const col = Math.max(
    0,
    Math.min(Math.max(0, layout.cols - 1), Math.floor(origin.x / GRID.parcelSize + 1e-6))
  );
  const row = Math.max(
    0,
    Math.min(Math.max(0, layout.rows - 1), Math.floor(origin.z / GRID.parcelSize + 1e-6))
  );
  return { col, row };
}

/** Base code for one building before collision suffixes (e.g. C7). */
export function buildingDirectoryBaseCode(
  building: PlacedBuilding,
  layout: SceneLayout
): string {
  const { col, row } = directoryParcelCell(building, layout);
  return `${directoryColumnLetters(col)}${row + 1}`;
}

/**
 * Unique directory code per building on the plot. Same inputs always produce the
 * same map — regeneration must not reshuffle addresses.
 */
export function assignBuildingDirectoryCodes(
  buildings: readonly PlacedBuilding[],
  layout: SceneLayout
): Map<string, string> {
  const groups = new Map<string, PlacedBuilding[]>();
  for (const building of buildings) {
    const base = buildingDirectoryBaseCode(building, layout);
    const list = groups.get(base);
    if (list) list.push(building);
    else groups.set(base, [building]);
  }

  const out = new Map<string, string>();
  for (const [base, group] of groups) {
    if (group.length === 1) {
      out.set(group[0]!.id, base);
      continue;
    }
    const ordered = [...group].sort((a, b) => {
      const pa = resolveBuildingPlacement(a, layout);
      const pb = resolveBuildingPlacement(b, layout);
      return pa.origin.x - pb.origin.x || pa.origin.z - pb.origin.z || a.id.localeCompare(b.id);
    });
    ordered.forEach((building, index) => {
      out.set(building.id, index === 0 ? base : `${base}${directoryColumnLetters(index - 1)}`);
    });
  }
  return out;
}

export function buildingDirectoryCode(
  buildings: readonly PlacedBuilding[],
  layout: SceneLayout,
  id: string
): string {
  const codes = assignBuildingDirectoryCodes(buildings, layout);
  const hit = codes.get(id);
  if (hit) return hit;
  const building = buildings.find((b) => b.id === id);
  return building ? buildingDirectoryBaseCode(building, layout) : id;
}

/** Case-insensitive match for the Builder find box. Exact code wins, then prefix. */
export function findBuildingIdByDirectoryQuery(
  codes: ReadonlyMap<string, string>,
  query: string
): string | null {
  const needle = query.trim().toUpperCase().replace(/\s+/g, "");
  if (!needle) return null;
  for (const [id, code] of codes) {
    if (code.toUpperCase() === needle) return id;
  }
  for (const [id, code] of codes) {
    if (code.toUpperCase().startsWith(needle)) return id;
  }
  return null;
}
