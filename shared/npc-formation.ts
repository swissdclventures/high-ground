/**
 * ONE sampler for where the members of an NPC group stand.
 *
 * The editor's map preview and the scene runtime used to compute crowd layouts
 * separately — a sunflower/grid in the preview, a golden-angle spiral in-world — so the
 * dots the author arranged were never the people they met. Both now call this, so the
 * preview is the world by construction.
 *
 * Returns a UNIT offset in [-1, 1] on each axis; the caller scales it by the zone's own
 * half-extents (circle radius or rectangle half-width/depth). Deterministic: the same
 * (formation, index, size, salt) always gives the same point.
 */
import type { NpcGroupFormation } from "./dance-venue-contract";

/** Keeps every formation clear of the zone boundary. */
const EDGE_MARGIN = 0.85;

function jitter(n: number): number {
  return (((n * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.18;
}

export function npcFormationUnitPoint(
  formation: NpcGroupFormation,
  index: number,
  size: number,
  salt = 0
): { x: number; z: number } {
  const total = Math.max(1, Math.round(size));
  let x: number;
  let z: number;

  if (formation === "circle") {
    // One even ring — the group reads as a deliberate circle.
    const angle = ((index % total) / total) * Math.PI * 2 + salt * 0.11;
    x = Math.cos(angle) * EDGE_MARGIN;
    z = Math.sin(angle) * EDGE_MARGIN;
  } else if (formation === "rows") {
    // Squarest grid for the count, plus a small deterministic jitter so it reads as a
    // crowd standing in rows rather than a spreadsheet.
    const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
    const rows = Math.max(1, Math.ceil(total / cols));
    const col = index % cols;
    const row = Math.floor(index / cols) % rows;
    x = (cols === 1 ? 0 : (col / (cols - 1)) * 2 - 1) * EDGE_MARGIN + jitter(index + salt);
    z = (rows === 1 ? 0 : (row / (rows - 1)) * 2 - 1) * EDGE_MARGIN + jitter(index * 7 + salt);
  } else if (formation === "grid") {
    // Military squad: twelve files, as many ranks as the count needs.
    const cols = Math.min(12, Math.max(1, total));
    const rows = Math.max(1, Math.ceil(total / cols));
    const col = index % cols;
    const row = Math.floor(index / cols) % rows;
    x = (cols === 1 ? 0 : (col / (cols - 1)) * 2 - 1) * EDGE_MARGIN;
    z = (rows === 1 ? 0 : (row / (rows - 1)) * 2 - 1) * EDGE_MARGIN;
  } else if (formation === "gathering") {
    // Same golden angle as scatter, but a continuous radius so the seven spokes
    // dissolve into a blob — "a bit random" without leaving the zone.
    const angle = (index + salt * 0.37) * Math.PI * (3 - Math.sqrt(5));
    const radius = (0.22 + Math.sqrt((index % total) / total) * 0.62) * EDGE_MARGIN;
    x = Math.cos(angle) * radius + jitter(index + salt);
    z = Math.sin(angle) * radius + jitter(index * 7 + salt);
  } else {
    // scatter — the long-standing golden-angle sampler, unchanged so existing scenes
    // keep the exact layout they already have. Its seven radial bands are what make the
    // spokes people notice from above; Circle and Rows exist so that is a choice.
    const angle = (index + salt * 0.37) * Math.PI * (3 - Math.sqrt(5));
    const band = 0.2 + ((((index + salt * 11) % 7) + 7) % 7) * 0.1;
    x = Math.cos(angle) * band;
    z = Math.sin(angle) * band;
  }

  const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  return { x: clamp(x), z: clamp(z) };
}
