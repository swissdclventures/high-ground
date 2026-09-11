/**
 * Exact spawn override. `col`/`row` name the parcel the publish map pin sits on.
 * Optional `x`/`z` are DCL scene metres from the SW corner — when set they win over
 * parcel-centre, so a drag can land visitors inside a booth instead of at the 16 m
 * cell middle.
 *
 * Lives in its own file so `types.ts` can import it without a cycle through
 * `dcl-placement.ts`.
 */
import metadata from "../data/asset-metadata.json";

const PARCEL_SIZE = metadata.grid.parcelSize;

export type CustomSpawn = {
  col: number;
  row: number;
  level: "ground" | "roof";
  x?: number;
  z?: number;
  /** Explicit world height for elevated standalone scenes. */
  y?: number;
};

type SceneSize = { cols: number; rows: number };

/** Keep an authored spawn on the plot. Exact metres stay exact; cell-only stays a cell. */
export function clampCustomSpawn(
  cs: CustomSpawn,
  layout: SceneSize,
): CustomSpawn {
  const width = layout.cols * PARCEL_SIZE;
  const depth = layout.rows * PARCEL_SIZE;
  const level: CustomSpawn["level"] = cs.level === "roof" ? "roof" : "ground";
  const xExact = cs.x;
  const zExact = cs.z;
  const exact =
    typeof xExact === "number" &&
    Number.isFinite(xExact) &&
    typeof zExact === "number" &&
    Number.isFinite(zExact);
  if (exact) {
    const x = Math.max(0.5, Math.min(width - 0.5, xExact));
    const z = Math.max(0.5, Math.min(depth - 0.5, zExact));
    return {
      col: Math.max(0, Math.min(layout.cols - 1, Math.floor(x / PARCEL_SIZE))),
      row: Math.max(0, Math.min(layout.rows - 1, Math.floor(z / PARCEL_SIZE))),
      level,
      x,
      z,
      ...(typeof cs.y === "number" && Number.isFinite(cs.y) ? { y: cs.y } : {}),
    };
  }
  return {
    col: Math.max(0, Math.min(layout.cols - 1, Math.round(cs.col))),
    row: Math.max(0, Math.min(layout.rows - 1, Math.round(cs.row))),
    level,
  };
}

/**
 * Author a spawn at exact DCL scene metres (SW-corner origin). Stores the containing
 * parcel for the publish-map pin and the metres so a drag can land inside a booth.
 */
export function customSpawnFromDcl(
  x: number,
  z: number,
  level: CustomSpawn["level"],
  layout: SceneSize,
  y?: number,
): CustomSpawn {
  return clampCustomSpawn({ col: 0, row: 0, level, x, z, y }, layout);
}

/**
 * The district recipe's default pin: plot-centre cell, no exact metres.
 * Dragging spawn into a booth writes x/z (or a different cell). Cloud/deployed
 * copies that still carry this default must not wipe that authored pin.
 */
export function isPlazaDefaultSpawn(
  spawn: CustomSpawn | null | undefined,
  layout: SceneSize,
): boolean {
  if (!spawn) return true;
  const plazaCol = Math.floor(layout.cols / 2);
  const plazaRow = Math.floor(layout.rows / 2);
  const hasMetres =
    typeof spawn.x === "number" &&
    Number.isFinite(spawn.x) &&
    typeof spawn.z === "number" &&
    Number.isFinite(spawn.z);
  if (hasMetres) return false;
  return (
    Math.round(spawn.col) === plazaCol && Math.round(spawn.row) === plazaRow
  );
}

/** Prefer a dragged / booth spawn over a plaza-centre default coming back from cloud. */
export function keepAuthoredSpawn(
  local: CustomSpawn | null | undefined,
  incoming: CustomSpawn | null | undefined,
  layout: SceneSize,
): CustomSpawn | null | undefined {
  if (
    local &&
    !isPlazaDefaultSpawn(local, layout) &&
    isPlazaDefaultSpawn(incoming, layout)
  ) {
    return local;
  }
  return incoming;
}
