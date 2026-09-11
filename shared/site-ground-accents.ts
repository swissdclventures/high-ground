/**
 * Site-ground artifacts — five deliberate, animated installations on the plot paving.
 *
 * These are not texture noise. Every family is a territory-scale installation (about
 * 10x the original jewellery-sized footprint), with a readable silhouette, an emissive inner layer, and a deterministic animation phase.
 * Positions are seeded from plot size + family id; changing the ground colour recolours
 * the same installation instead of shuffling it.
 *
 * Visual only — no colliders. Composer-frame XZ (plot centre = 0,0); the DCL runtime
 * shifts with `composerToDcl`. Compact families (crystals, sigils) keep their whole
 * disc clear of buildings. Linear families (runways, fractures) plant a clear core and
 * clip arms that would run under architecture, so they can actually span the plot.
 */

import { clampAlbedo } from "./surface-finish";
import {
  circleHitsBox,
  makeGroundRng,
  scatterPoints,
  type GroundScatterExclusion,
  type Point,
} from "./ground-scatter";

export const SITE_GROUND_ACCENT_IDS = ["minerals", "inlay", "vines", "rings", "circuit"] as const;

/** Horizontal multiplier vs the original authored metres. */
export const GROUND_ACCENT_SPREAD = 10;

export type SiteGroundAccentId = (typeof SITE_GROUND_ACCENT_IDS)[number];

export const SITE_GROUND_ACCENT_LABELS: Record<SiteGroundAccentId, string> = {
  minerals: "Living crystal cores",
  inlay: "Liquid-light runways",
  vines: "Lightning fractures",
  rings: "Orbital sigils",
  circuit: "Circuit-board traces",
};

/** Old eight-choice recipes collapse onto the four authored families instead of losing data. */
const LEGACY_ACCENT_FAMILY: Record<string, SiteGroundAccentId> = {
  minerals: "minerals",
  lodestones: "minerals",
  inlay: "inlay",
  slits: "inlay",
  vines: "vines",
  pockmarks: "vines",
  rings: "rings",
  pins: "rings",
  circuit: "circuit",
};

export function isSiteGroundAccentId(v: unknown): v is SiteGroundAccentId {
  return typeof v === "string" && (SITE_GROUND_ACCENT_IDS as readonly string[]).includes(v);
}

/** Unique, canonical order. Legacy ids migrate to their replacement family. */
export function normalizeSiteGroundAccents(raw: unknown): SiteGroundAccentId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<SiteGroundAccentId>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const family = LEGACY_ACCENT_FAMILY[item];
    if (family) seen.add(family);
  }
  return SITE_GROUND_ACCENT_IDS.filter((id) => seen.has(id));
}

export type AccentMeshKind = "box" | "cylinder";
export type GroundAccentAnimationKind = "pulse" | "flow" | "hover";

export interface GroundAccentAnimation {
  kind: GroundAccentAnimationKind;
  /** Normalized position in the loop. Adjacent pieces use staggered phases. */
  phase: number;
  /** Cycles per second. Intentionally slow so the ground feels alive, not frantic. */
  speed: number;
  minIntensity: number;
  maxIntensity: number;
  /** Hover-only vertical travel in metres. */
  bobM?: number;
  /** Hover-only yaw speed in radians per second. */
  spinRps?: number;
  /**
   * Optional player-presence response. Inside `radiusM` the emissive band is
   * multiplied up to `boost`, so a crystal wakes as somebody walks into it and
   * settles again once they leave. Preview renderers ignore this (no player).
   */
  proximity?: GroundAccentProximity;
}

export interface GroundAccentProximity {
  /** Distance at which the response starts, in metres. */
  radiusM: number;
  /** Emissive multiplier at zero distance. 1 = no response. */
  boost: number;
}

/**
 * A real light the runtime may hang on this piece. The Explorer keeps only the
 * nearest handful of lights in the WHOLE scene, so these are ANCHORS, not lights:
 * the runtime pools a couple of `LightSource` entities and re-points them at the
 * beacons nearest the player. See [[interior-lights-two-layers]].
 */
export interface GroundAccentBeacon {
  colorHex: string;
  /** Light range in metres. */
  rangeM: number;
  /** Peak candela, reached when the player stands at the beacon. Interior lamps cap at 3200. */
  intensityCd: number;
  /** Player distance at which the beacon starts to come up. */
  wakeM: number;
  /** Metres above the piece origin to hang the light. */
  heightM: number;
}

/** One primitive, composer-centred. Box sizes are full metres; cylinder scale multiplies its radii/height. */
export interface SiteGroundAccentPiece {
  id: string;
  kind: SiteGroundAccentId;
  mesh: AccentMeshKind;
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  sx: number;
  sy: number;
  sz: number;
  color: string;
  roughness: number;
  metalness: number;
  opacity?: number;
  emissiveColor?: string;
  emissiveIntensity?: number;
  /** Cylinder primitive profile. Defaults retain the old disc geometry. */
  radiusTop?: number;
  radiusBottom?: number;
  radialSegments?: number;
  animation?: GroundAccentAnimation;
  /** Anchor for one pooled real light. Only a handful of pieces per plot carry one. */
  beacon?: GroundAccentBeacon;
}

/** Composer-centred building/structure keep-out rectangle. Shared with every scatter layer. */
export type SiteGroundAccentExclusion = GroundScatterExclusion;

export interface GroundAccentPalette {
  glow: string;
  mineral: string;
  crystalShell: string;
  crystalCore: string;
  inlay: string;
  scar: string;
  metal: string;
  ring: string;
  trace: string;
}

export function relativeGroundAccentPalette(groundHex: string): GroundAccentPalette {
  const hex = /^#[0-9a-fA-F]{6}$/.test(groundHex) ? groundHex : "#9a978f";
  const { h, s, l } = hexToHsl(clampAlbedo(hex));
  const satFloor = s < 0.12 ? 0.5 : 0;
  return {
    glow: hslToHex(h + 18, Math.max(satFloor, s + 0.42), contrastL(l, 0.42)),
    mineral: hslToHex(h - 14, Math.max(satFloor, s + 0.3), contrastL(l, 0.28)),
    crystalShell: hslToHex(h - 26, Math.max(0.58, s + 0.34), contrastL(l, 0.36)),
    crystalCore: hslToHex(h + 44, Math.max(0.72, s + 0.5), contrastL(l, 0.52)),
    inlay: hslToHex(h + 38, Math.max(satFloor, s + 0.48), contrastL(l, 0.42)),
    scar: hslToHex(h + 4, Math.max(0.28, s + 0.12), contrastL(l, 0.2)),
    metal: hslToHex(h, Math.max(0.12, s * 0.45), contrastL(l, 0.34)),
    ring: hslToHex(h + 26, Math.max(satFloor, s + 0.36), contrastL(l, 0.36)),
    trace: hslToHex(h + 52, Math.max(satFloor, s + 0.46), contrastL(l, 0.4)),
  };
}

function accentScales(plotScale: number): { xz: number; bulk: number; rise: number } {
  return {
    xz: plotScale * GROUND_ACCENT_SPREAD,
    bulk: plotScale * 2.8,
    rise: plotScale * 2.2,
  };
}

export function planSiteGroundAccents(args: {
  width: number;
  depth: number;
  groundHex: string;
  accents: readonly string[];
  exclusions?: readonly SiteGroundAccentExclusion[];
}): SiteGroundAccentPiece[] {
  const selected = normalizeSiteGroundAccents(args.accents);
  if (selected.length === 0) return [];
  const width = Math.max(16, args.width);
  const depth = Math.max(16, args.depth);
  const halfW = width / 2;
  const halfD = depth / 2;
  const exclusions = args.exclusions ?? [];
  const palette = relativeGroundAccentPalette(args.groundHex);
  const scale = clamp(Math.min(width, depth) / 96, 0.55, 1.35);
  const { xz, bulk, rise } = accentScales(scale);
  const density = clamp(Math.sqrt((width * depth) / (256 * 256)), 0.75, 2.4);
  const on = (id: SiteGroundAccentId) => selected.includes(id);

  const pieces: SiteGroundAccentPiece[] = [];
  let seq = 0;
  const add = (piece: Omit<SiteGroundAccentPiece, "id">) => {
    const rad = Math.max(piece.sx, piece.sz) * 0.55;
    if (Math.abs(piece.x) + rad > halfW - 0.25 || Math.abs(piece.z) + rad > halfD - 0.25) return;
    if (exclusions.some((box) => circleHitsBox({ x: piece.x, z: piece.z }, rad, box))) return;
    pieces.push({ ...piece, id: `sga_${piece.kind}_${seq++}` });
  };

  if (on("minerals")) {
    const centres = scatter(
      rngFor("minerals", width, depth),
      Math.max(1, Math.round(2.5 * density)),
      halfW,
      halfD,
      4.8 * xz,
      22 * xz,
      exclusions
    );
    centres.forEach((centre, clusterIndex) =>
      emitCrystalCore(add, centre, clusterIndex, width, depth, xz, bulk, rise, palette)
    );
  }

  if (on("inlay")) {
    const centres = scatter(
      rngFor("inlay", width, depth),
      Math.max(1, Math.round(1.5 * density)),
      halfW,
      halfD,
      3.2 * xz,
      18 * xz,
      exclusions
    );
    centres.forEach((centre, runwayIndex) =>
      emitLiquidRunway(add, centre, runwayIndex, width, depth, xz, bulk, palette)
    );
  }

  if (on("vines")) {
    const centres = scatter(
      rngFor("vines", width, depth),
      Math.max(1, Math.round(2 * density)),
      halfW,
      halfD,
      4.0 * xz,
      20 * xz,
      exclusions
    );
    centres.forEach((centre, fractureIndex) =>
      emitLightningFracture(add, centre, fractureIndex, width, depth, xz, bulk, palette)
    );
  }

  if (on("rings")) {
    const centres = scatter(
      rngFor("rings", width, depth),
      Math.max(1, Math.round(1.4 * density)),
      halfW,
      halfD,
      5.8 * xz,
      26 * xz,
      exclusions
    );
    centres.forEach((centre, sigilIndex) =>
      emitOrbitalSigil(add, centre, sigilIndex, width, depth, xz, bulk, palette)
    );
  }

  if (on("circuit")) {
    const centres = scatter(
      rngFor("circuit", width, depth),
      Math.max(1, Math.round(1.2 * density)),
      halfW,
      halfD,
      4.2 * xz,
      20 * xz,
      exclusions
    );
    centres.forEach((centre, boardIndex) =>
      emitCircuitBoard(add, centre, boardIndex, width, depth, xz, bulk, palette)
    );
  }

  return pieces;
}

type AddPiece = (piece: Omit<SiteGroundAccentPiece, "id">) => void;

/**
 * A crystal cluster, upgraded 2026-09-07 from a symmetric ring of smooth carrot
 * spikes to a seeded RIDGE of faceted shards.
 *
 * Four things carry the look, and all four are geometry, not colour:
 * - Bodies are TRUNCATED prisms (a wide blunt top) with a separate point capping
 *   the tall ones. A single cone tapering to nothing reads as a traffic cone; a
 *   blunt body plus a cap reads as a crystal.
 * - The cluster grows along a ridge line with lateral jitter, so it looks pushed
 *   up out of the ground rather than planted in a circle.
 * - A skirt of low, hard-tilted chunks leans out of the ridge at its foot.
 * - The inner core is fat and hot, seen THROUGH the shell — the shell is glass,
 *   the core is the light.
 *
 * Every piece also answers the player: `proximity` lifts the emissive as somebody
 * walks in, and the tallest spire of each cluster carries a `beacon` the runtime
 * pools into a real LightSource. Neither costs anything when nobody is near.
 */
function emitCrystalCore(
  add: AddPiece,
  centre: Point,
  clusterIndex: number,
  width: number,
  depth: number,
  xz: number,
  bulk: number,
  rise: number,
  palette: GroundAccentPalette
): void {
  const rng = rngFor(`crystal:${clusterIndex}:${roundKey(centre.x)}:${roundKey(centre.z)}`, width, depth);
  const yaw0 = rng() * Math.PI * 2;
  const ridge = { x: Math.cos(yaw0), z: Math.sin(yaw0) };
  const cross = { x: -ridge.z, z: ridge.x };
  const spires = 5 + Math.floor(rng() * 3);
  const wakeM = 26 * xz;

  /** Emissive response to a nearby player, scaled so small pieces wake less. */
  const nearby = (boost: number): GroundAccentProximity => ({ radiusM: wakeM, boost });

  /**
   * Where the top of a tilted body actually ends up. A cap that misses its body by a
   * few degrees reads as debris floating beside a slab, so this uses the EXACT local
   * up vector rather than a small-angle guess — see `localUpZxy`.
   */
  const topOf = (rotX: number, rotY: number, rotZ: number, reach: number) => {
    const up = localUpZxy(rotX, rotY, rotZ);
    return { dx: up.x * reach, dy: up.y * reach, dz: up.z * reach };
  };

  for (let i = 0; i < spires; i++) {
    const centreSpire = i === 0;
    const angle = yaw0 + (i / Math.max(1, spires - 1)) * Math.PI * 2 + (rng() - 0.5) * 0.4;
    const orbit = centreSpire ? 0 : (0.75 + rng() * 1.3) * xz;
    // Along the ridge the cluster runs long; across it, tight. A circle of spires
    // reads as a fence, a ridge reads as an outcrop.
    const along = Math.cos(angle) * orbit * 1.55;
    const across = Math.sin(angle) * orbit * 0.6;
    const h = (centreSpire ? 3.5 + rng() * 1.5 : 1.7 + rng() * 2.2) * rise;
    const diameter = (centreSpire ? 1.15 + rng() * 0.35 : 0.55 + rng() * 0.65) * bulk;
    const x = centre.x + ridge.x * along + cross.x * across;
    const z = centre.z + ridge.z * along + cross.z * across;
    // Blunt bodies, hard leans. The old 0.05–0.32 rad range kept everything upright
    // and identical; a crystal field is interesting because the shards disagree.
    const tilt = centreSpire ? 0.06 + rng() * 0.06 : 0.18 + rng() * 0.42;
    const blunt = 0.2 + rng() * 0.16;
    const facets = rng() < 0.45 ? 5 : rng() < 0.7 ? 6 : 7;
    const phase = (clusterIndex * 0.21 + i / spires) % 1;
    const tall = h >= 2.6 * rise;

    add({
      kind: "minerals",
      mesh: "cylinder",
      x,
      y: h / 2 + 0.05,
      z,
      rotX: Math.cos(angle) * tilt,
      rotY: angle,
      rotZ: -Math.sin(angle) * tilt,
      sx: diameter,
      sy: h,
      sz: diameter,
      color: palette.crystalShell,
      roughness: 0.06,
      metalness: 0.12,
      opacity: 0.48,
      emissiveColor: palette.mineral,
      emissiveIntensity: 0.38,
      radiusTop: blunt,
      radiusBottom: 0.5,
      radialSegments: facets,
      animation: {
        kind: "pulse",
        phase,
        speed: 0.07,
        minIntensity: 0.24,
        maxIntensity: 0.72,
        proximity: nearby(3.4),
      },
      ...(centreSpire
        ? {
            beacon: {
              colorHex: palette.crystalCore,
              rangeM: Math.max(9, 12 * xz),
              intensityCd: 1400,
              wakeM,
              heightM: h * 0.6,
            },
          }
        : {}),
    });

    // The point. A short inverted cone sitting on the blunt top: this is the whole
    // difference between "a crystal" and "a lamp post".
    const capH = h * (0.24 + rng() * 0.16);
    const capTilt = { x: Math.cos(angle) * tilt, y: angle, z: -Math.sin(angle) * tilt };
    const cap = topOf(capTilt.x, capTilt.y, capTilt.z, h / 2 + capH / 2);
    add({
      kind: "minerals",
      mesh: "cylinder",
      x: x + cap.dx,
      y: h / 2 + 0.05 + cap.dy,
      z: z + cap.dz,
      rotX: Math.cos(angle) * tilt,
      rotY: angle,
      rotZ: -Math.sin(angle) * tilt,
      sx: diameter * blunt * 2,
      sy: capH,
      sz: diameter * blunt * 2,
      color: palette.crystalShell,
      roughness: 0.05,
      metalness: 0.12,
      opacity: 0.44,
      emissiveColor: palette.crystalCore,
      emissiveIntensity: 0.55,
      radiusTop: 0.02,
      radiusBottom: 0.5,
      radialSegments: facets,
      animation: {
        kind: "pulse",
        phase: (phase + 0.12) % 1,
        speed: 0.07,
        minIntensity: 0.4,
        maxIntensity: 1.4,
        proximity: nearby(3.8),
      },
    });

    add({
      kind: "minerals",
      mesh: "cylinder",
      x,
      y: h * 0.4 + 0.08,
      z,
      rotX: Math.cos(angle) * tilt,
      rotY: angle + Math.PI / 6,
      rotZ: -Math.sin(angle) * tilt,
      // Fatter than the old 0.24: the core is what you see through the shell, and a
      // thread was invisible past a few metres.
      sx: diameter * 0.38,
      sy: h * 0.72,
      sz: diameter * 0.38,
      color: palette.crystalCore,
      roughness: 0.12,
      metalness: 0,
      opacity: 0.92,
      emissiveColor: palette.crystalCore,
      emissiveIntensity: 2.6,
      radiusTop: 0.12,
      radiusBottom: 0.42,
      radialSegments: 5,
      animation: {
        kind: "flow",
        phase,
        speed: 0.12,
        minIntensity: 0.65,
        maxIntensity: 4.2,
        proximity: nearby(2.2),
      },
    });

    if (!tall) continue;
    // A splinter leaning off the flank of the big ones, so no spire is a lone stick.
    const splinterAngle = angle + (rng() < 0.5 ? 1 : -1) * (0.8 + rng() * 0.7);
    const splinterH = h * (0.3 + rng() * 0.25);
    const splinterTilt = 0.55 + rng() * 0.5;
    add({
      kind: "minerals",
      mesh: "cylinder",
      x: x + Math.cos(splinterAngle) * diameter * 0.75,
      y: splinterH * 0.42 + 0.05,
      z: z + Math.sin(splinterAngle) * diameter * 0.75,
      rotX: Math.cos(splinterAngle) * splinterTilt,
      rotY: splinterAngle,
      rotZ: -Math.sin(splinterAngle) * splinterTilt,
      sx: diameter * 0.5,
      sy: splinterH,
      sz: diameter * 0.5,
      color: palette.crystalShell,
      roughness: 0.06,
      metalness: 0.12,
      opacity: 0.5,
      emissiveColor: palette.crystalCore,
      emissiveIntensity: 0.6,
      radiusTop: 0.14,
      radiusBottom: 0.5,
      radialSegments: 6,
      animation: {
        kind: "pulse",
        phase: (phase + 0.31) % 1,
        speed: 0.06,
        minIntensity: 0.3,
        maxIntensity: 1.1,
        proximity: nearby(3.2),
      },
    });
  }

  // The skirt: low, wide, hard-leaning chunks along the ridge at ground level. These
  // are the ones a player actually walks past, so they carry the strongest response.
  const skirt = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < skirt; i++) {
    const t = (i + 0.5) / skirt;
    const along = (t - 0.5) * 5.4 * xz;
    const across = (rng() - 0.5) * 1.9 * xz;
    const angle = yaw0 + Math.PI / 2 + (rng() - 0.5) * 1.5;
    const h = (0.5 + rng() * 0.95) * rise;
    const diameter = (0.5 + rng() * 0.55) * bulk;
    const tilt = 0.45 + rng() * 0.55;
    const x = centre.x + ridge.x * along + cross.x * across;
    const z = centre.z + ridge.z * along + cross.z * across;
    const phase = (clusterIndex * 0.17 + t) % 1;

    add({
      kind: "minerals",
      mesh: "cylinder",
      x,
      y: h * 0.4 + 0.04,
      z,
      rotX: Math.cos(angle) * tilt,
      rotY: angle,
      rotZ: -Math.sin(angle) * tilt,
      sx: diameter,
      sy: h,
      sz: diameter,
      color: palette.crystalShell,
      roughness: 0.05,
      metalness: 0.14,
      opacity: 0.46,
      emissiveColor: palette.crystalCore,
      emissiveIntensity: 0.5,
      radiusTop: 0.22 + rng() * 0.14,
      radiusBottom: 0.5,
      radialSegments: rng() < 0.5 ? 5 : 6,
      animation: {
        kind: "pulse",
        phase,
        speed: 0.065,
        minIntensity: 0.26,
        maxIntensity: 0.95,
        proximity: nearby(4.6),
      },
    });

    if (i % 2 !== 0) continue;
    add({
      kind: "minerals",
      mesh: "cylinder",
      x,
      y: h * 0.34 + 0.06,
      z,
      rotX: Math.cos(angle) * tilt,
      rotY: angle + Math.PI / 7,
      rotZ: -Math.sin(angle) * tilt,
      sx: diameter * 0.34,
      sy: h * 0.66,
      sz: diameter * 0.34,
      color: palette.crystalCore,
      roughness: 0.1,
      metalness: 0,
      opacity: 0.9,
      emissiveColor: palette.crystalCore,
      emissiveIntensity: 2.4,
      radiusTop: 0.14,
      radiusBottom: 0.4,
      radialSegments: 5,
      animation: {
        kind: "flow",
        phase: (phase + 0.4) % 1,
        speed: 0.11,
        minIntensity: 0.55,
        maxIntensity: 3.6,
        proximity: nearby(2.6),
      },
    });
  }

  const coronaRadius = 3.4 * xz;
  for (let i = 0; i < 12; i++) {
    const angle = yaw0 + (i / 12) * Math.PI * 2;
    add({
      kind: "minerals",
      mesh: "box",
      x: centre.x + Math.cos(angle) * coronaRadius,
      y: 0.075,
      z: centre.z + Math.sin(angle) * coronaRadius,
      rotX: 0,
      rotY: angle,
      rotZ: 0,
      sx: 0.1 * bulk,
      sy: 0.045,
      sz: 0.72 * xz,
      color: palette.crystalCore,
      roughness: 0.18,
      metalness: 0.18,
      emissiveColor: palette.crystalCore,
      emissiveIntensity: 1.2,
      animation: {
        kind: "flow",
        phase: i / 12,
        speed: 0.085,
        minIntensity: 0.08,
        maxIntensity: 3.4,
        proximity: nearby(2.8),
      },
    });
  }

  for (let i = 0; i < 2; i++) {
    const angle = yaw0 + (i + 0.4) * Math.PI;
    const h = (0.65 + rng() * 0.45) * rise;
    add({
      kind: "minerals",
      mesh: "cylinder",
      x: centre.x + Math.cos(angle) * 2.6 * xz,
      y: (2.1 + i * 0.6) * rise,
      z: centre.z + Math.sin(angle) * 2.6 * xz,
      rotX: 0.35,
      rotY: angle,
      rotZ: 0.22,
      sx: 0.34 * bulk,
      sy: h,
      sz: 0.34 * bulk,
      color: palette.crystalShell,
      roughness: 0.08,
      metalness: 0.16,
      opacity: 0.7,
      emissiveColor: palette.crystalCore,
      emissiveIntensity: 1.1,
      radiusTop: 0.16,
      radiusBottom: 0.5,
      radialSegments: 6,
      animation: {
        kind: "hover",
        phase: (clusterIndex * 0.33 + i * 0.5) % 1,
        speed: 0.075,
        minIntensity: 0.45,
        maxIntensity: 2.1,
        bobM: 0.3 * rise,
        spinRps: i === 0 ? 0.22 : -0.18,
        proximity: nearby(2.4),
      },
    });
  }
}

function emitLiquidRunway(
  add: AddPiece,
  centre: Point,
  runwayIndex: number,
  width: number,
  depth: number,
  xz: number,
  bulk: number,
  palette: GroundAccentPalette
): void {
  const rng = rngFor(`runway:${runwayIndex}:${roundKey(centre.x)}:${roundKey(centre.z)}`, width, depth);
  const heading = Math.round(rng() * 11) * (Math.PI / 6);
  const dir = { x: Math.sin(heading), z: Math.cos(heading) };
  const side = { x: Math.cos(heading), z: -Math.sin(heading) };
  const length = (13 + rng() * 7) * xz;
  const modules = 28;
  const step = length / modules;
  const laneOffset = 1.1 * xz;

  for (let i = 0; i < modules; i++) {
    const along = -length / 2 + (i + 0.5) * step;
    const phase = (i / modules + runwayIndex * 0.17) % 1;
    for (const lane of [-1, 0, 1]) {
      const isCore = lane === 0;
      add({
        kind: "inlay",
        mesh: "box",
        x: centre.x + dir.x * along + side.x * laneOffset * lane,
        y: isCore ? 0.072 : 0.06,
        z: centre.z + dir.z * along + side.z * laneOffset * lane,
        rotX: 0,
        rotY: heading,
        rotZ: 0,
        sx: (isCore ? 0.18 : 0.075) * bulk,
        sy: 0.035,
        sz: step * (isCore ? 0.7 : 0.84),
        color: isCore ? palette.inlay : palette.glow,
        roughness: 0.16,
        metalness: 0.32,
        emissiveColor: isCore ? palette.inlay : palette.glow,
        emissiveIntensity: isCore ? 1.4 : 0.65,
        animation: {
          kind: "flow",
          phase: (phase + (lane + 1) * 0.035) % 1,
          speed: 0.095,
          minIntensity: isCore ? 0.08 : 0.18,
          maxIntensity: isCore ? 4.4 : 2.1,
        },
      });
    }
  }

  for (const end of [-1, 1]) {
    const p = {
      x: centre.x + dir.x * (length / 2 + 1.2 * xz) * end,
      z: centre.z + dir.z * (length / 2 + 1.2 * xz) * end,
    };
    emitStar(add, p, "inlay", heading, 0.95 * xz, palette.crystalCore, {
      kind: "pulse",
      phase: end < 0 ? 0 : 0.5,
      speed: 0.095,
      minIntensity: 0.4,
      maxIntensity: 3.8,
    });
  }
}

function emitLightningFracture(
  add: AddPiece,
  centre: Point,
  fractureIndex: number,
  width: number,
  depth: number,
  xz: number,
  bulk: number,
  palette: GroundAccentPalette
): void {
  const rng = rngFor(`fracture:${fractureIndex}:${roundKey(centre.x)}:${roundKey(centre.z)}`, width, depth);
  const heading = rng() * Math.PI * 2;
  const main = jaggedPath(centre, heading, 12, 1.0 * xz, 1.6 * xz, 0.8, rng);
  emitEnergyPath(add, main, "vines", palette.glow, fractureIndex * 0.19, 0.13 * bulk, 0.11);

  for (const branchAt of [3, 8]) {
    const root = main[Math.min(branchAt, main.length - 1)]!;
    const direction = heading + (branchAt === 3 ? -1 : 1) * (0.75 + rng() * 0.45);
    const branch = jaggedPath(root, direction, 5, 0.7 * xz, 1.2 * xz, 0.9, rng);
    emitEnergyPath(add, branch, "vines", palette.crystalCore, (fractureIndex * 0.19 + branchAt * 0.08) % 1, 0.085 * bulk, 0.14);
  }

  for (let i = 0; i < main.length; i += 2) {
    const p = main[i]!;
    add({
      kind: "vines",
      mesh: "cylinder",
      x: p.x,
      y: 0.085,
      z: p.z,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      sx: 0.22 * bulk,
      sy: 0.04,
      sz: 0.22 * bulk,
      color: palette.crystalCore,
      roughness: 0.14,
      metalness: 0.18,
      emissiveColor: palette.crystalCore,
      emissiveIntensity: 1.8,
      radiusTop: 0.28,
      radiusBottom: 0.5,
      radialSegments: 6,
      animation: { kind: "pulse", phase: (fractureIndex * 0.17 + i / main.length) % 1, speed: 0.14, minIntensity: 0.18, maxIntensity: 4.6 },
    });
  }
}

function emitOrbitalSigil(
  add: AddPiece,
  centre: Point,
  sigilIndex: number,
  width: number,
  depth: number,
  xz: number,
  bulk: number,
  palette: GroundAccentPalette
): void {
  const rng = rngFor(`sigil:${sigilIndex}:${roundKey(centre.x)}:${roundKey(centre.z)}`, width, depth);
  const yaw = rng() * Math.PI * 2;
  const radii = [2.15, 3.35].map((r) => r * xz);
  for (let ringIndex = 0; ringIndex < radii.length; ringIndex++) {
    const radius = radii[ringIndex]!;
    const segs = ringIndex === 0 ? 14 : 20;
    const gapStart = Math.floor(rng() * segs);
    for (let i = 0; i < segs; i++) {
      if (i === gapStart || i === (gapStart + 1) % segs) continue;
      const angle = yaw + (i / segs) * Math.PI * 2;
      add({
        kind: "rings",
        mesh: "box",
        x: centre.x + Math.cos(angle) * radius,
        y: 0.062 + ringIndex * 0.006,
        z: centre.z + Math.sin(angle) * radius,
        rotX: 0,
        rotY: angle + Math.PI / 2,
        rotZ: 0,
        sx: ((Math.PI * 2 * radius) / segs) * 0.73,
        sy: 0.036,
        sz: (ringIndex === 0 ? 0.12 : 0.075) * bulk,
        color: ringIndex === 0 ? palette.ring : palette.glow,
        roughness: 0.17,
        metalness: 0.38,
        emissiveColor: ringIndex === 0 ? palette.ring : palette.glow,
        emissiveIntensity: 0.9,
        animation: {
          kind: "flow",
          phase: (i / segs + ringIndex * 0.16 + sigilIndex * 0.11) % 1,
          speed: ringIndex === 0 ? 0.07 : -0.055,
          minIntensity: 0.08,
          maxIntensity: ringIndex === 0 ? 3.8 : 2.6,
        },
      });
    }
  }

  emitStar(add, centre, "rings", yaw, 1.45 * xz, palette.crystalCore, {
    kind: "pulse",
    phase: sigilIndex * 0.27,
    speed: 0.08,
    minIntensity: 0.35,
    maxIntensity: 3.6,
  });

  for (let i = 0; i < 4; i++) {
    const angle = yaw + i * (Math.PI / 2);
    const a = { x: centre.x + Math.cos(angle) * 1.3 * xz, z: centre.z + Math.sin(angle) * 1.3 * xz };
    const b = { x: centre.x + Math.cos(angle) * 2.0 * xz, z: centre.z + Math.sin(angle) * 2.0 * xz };
    emitSegment(add, a, b, {
      kind: "rings",
      y: 0.067,
      width: 0.075 * bulk,
      height: 0.035,
      color: palette.inlay,
      roughness: 0.16,
      metalness: 0.3,
      emissiveColor: palette.inlay,
      emissiveIntensity: 1.2,
      animation: { kind: "flow", phase: i / 4, speed: 0.08, minIntensity: 0.12, maxIntensity: 3.1 },
    });
  }
}

function emitCircuitBoard(
  add: AddPiece,
  centre: Point,
  boardIndex: number,
  width: number,
  depth: number,
  xz: number,
  bulk: number,
  palette: GroundAccentPalette
): void {
  const rng = rngFor(`circuit:${boardIndex}:${roundKey(centre.x)}:${roundKey(centre.z)}`, width, depth);
  const heading = Math.round(rng() * 3) * (Math.PI / 2);
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const world = (lx: number, lz: number): Point => ({
    x: centre.x + lx * cos - lz * sin,
    z: centre.z + lx * sin + lz * cos,
  });

  const cols = 4;
  const rows = 3;
  const pitchX = (2.35 + rng() * 0.55) * xz;
  const pitchZ = (1.9 + rng() * 0.45) * xz;
  const chips: { lx: number; lz: number; w: number; d: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (chips.length >= 4 && rng() < 0.22) continue;
      chips.push({
        lx: (c - (cols - 1) / 2) * pitchX + (rng() - 0.5) * 0.32 * xz,
        lz: (r - (rows - 1) / 2) * pitchZ + (rng() - 0.5) * 0.28 * xz,
        w: (0.5 + rng() * 0.65) * xz,
        d: (0.32 + rng() * 0.4) * xz,
      });
    }
  }

  const traceW = 0.11 * bulk;
  const emitTrace = (a: Point, b: Point, phase: number, color: string) => {
    emitSegment(add, a, b, {
      kind: "circuit",
      y: 0.066,
      width: traceW,
      height: 0.034,
      color,
      roughness: 0.18,
      metalness: 0.55,
      emissiveColor: color,
      emissiveIntensity: 1.35,
      animation: { kind: "flow", phase, speed: 0.09, minIntensity: 0.1, maxIntensity: 4.2 },
    });
  };
  const emitVia = (p: Point, phase: number) => {
    add({
      kind: "circuit",
      mesh: "cylinder",
      x: p.x,
      y: 0.09,
      z: p.z,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      sx: 0.2 * bulk,
      sy: 0.05,
      sz: 0.2 * bulk,
      color: palette.crystalCore,
      roughness: 0.16,
      metalness: 0.4,
      emissiveColor: palette.crystalCore,
      emissiveIntensity: 1.9,
      radiusTop: 0.45,
      radiusBottom: 0.45,
      radialSegments: 8,
      animation: { kind: "pulse", phase, speed: 0.11, minIntensity: 0.2, maxIntensity: 4.4 },
    });
  };

  for (let i = 0; i < chips.length; i++) {
    const chip = chips[i]!;
    const p = world(chip.lx, chip.lz);
    add({
      kind: "circuit",
      mesh: "box",
      x: p.x,
      y: 0.09,
      z: p.z,
      rotX: 0,
      rotY: heading,
      rotZ: 0,
      sx: chip.w,
      sy: 0.07,
      sz: chip.d,
      color: palette.metal,
      roughness: 0.28,
      metalness: 0.62,
      emissiveColor: palette.trace,
      emissiveIntensity: 0.55,
      animation: {
        kind: "pulse",
        phase: (boardIndex * 0.17 + i * 0.13) % 1,
        speed: 0.065,
        minIntensity: 0.18,
        maxIntensity: 1.6,
      },
    });
    const pinCount = 4;
    for (let k = 0; k < pinCount; k++) {
      const t = (k + 0.5) / pinCount - 0.5;
      const pin = world(chip.lx + t * chip.w * 0.72, chip.lz + chip.d * 0.58);
      add({
        kind: "circuit",
        mesh: "box",
        x: pin.x,
        y: 0.07,
        z: pin.z,
        rotX: 0,
        rotY: heading,
        rotZ: 0,
        sx: 0.08 * bulk,
        sy: 0.03,
        sz: 0.12 * bulk,
        color: palette.trace,
        roughness: 0.2,
        metalness: 0.7,
        emissiveColor: palette.glow,
        emissiveIntensity: 0.9,
        animation: { kind: "pulse", phase: (i * 0.11 + k * 0.07) % 1, speed: 0.1, minIntensity: 0.12, maxIntensity: 2.8 },
      });
    }
  }

  for (let i = 1; i < chips.length; i++) {
    const from = chips[i - 1]!;
    const to = chips[i]!;
    const start = world(from.lx, from.lz);
    const end = world(to.lx, to.lz);
    const elbowLocal = rng() < 0.5 ? { lx: to.lx, lz: from.lz } : { lx: from.lx, lz: to.lz };
    const elbow = world(elbowLocal.lx, elbowLocal.lz);
    const phase = (boardIndex * 0.19 + i * 0.08) % 1;
    emitTrace(start, elbow, phase, i % 2 === 0 ? palette.trace : palette.glow);
    emitTrace(elbow, end, (phase + 0.12) % 1, i % 2 === 0 ? palette.glow : palette.trace);
    emitVia(elbow, phase);
  }

  for (const lane of [-1, 0, 1]) {
    const lz = lane * pitchZ * 0.42;
    const a = world(-pitchX * 1.55, lz);
    const b = world(pitchX * 1.55, lz);
    emitTrace(a, b, (boardIndex * 0.23 + (lane + 1) * 0.14) % 1, lane === 0 ? palette.trace : palette.glow);
    emitVia(a, 0.2 + lane * 0.1);
    emitVia(b, 0.7 + lane * 0.1);
  }
}

function emitStar(
  add: AddPiece,
  point: Point,
  kind: SiteGroundAccentId,
  yaw: number,
  radius: number,
  color: string,
  animation: GroundAccentAnimation
): void {
  for (let i = 0; i < 4; i++) {
    const angle = yaw + i * (Math.PI / 4);
    add({
      kind,
      mesh: "box",
      x: point.x,
      y: 0.083,
      z: point.z,
      rotX: 0,
      rotY: angle,
      rotZ: 0,
      sx: Math.max(0.14, radius * 0.07),
      sy: 0.04,
      sz: radius * (i % 2 === 0 ? 2 : 1.2),
      color,
      roughness: 0.14,
      metalness: 0.22,
      emissiveColor: color,
      emissiveIntensity: 1.5,
      animation: { ...animation, phase: (animation.phase + i * 0.06) % 1 },
    });
  }
}

function emitEnergyPath(
  add: AddPiece,
  poly: Point[],
  kind: SiteGroundAccentId,
  color: string,
  phaseStart: number,
  lineWidth: number,
  speed: number
): void {
  for (let i = 1; i < poly.length; i++) {
    emitSegment(add, poly[i - 1]!, poly[i]!, {
      kind,
      y: 0.068,
      width: lineWidth,
      height: 0.038,
      color,
      roughness: 0.15,
      metalness: 0.25,
      emissiveColor: color,
      emissiveIntensity: 1.2,
      animation: { kind: "flow", phase: (phaseStart + (i - 1) / Math.max(1, poly.length - 1)) % 1, speed, minIntensity: 0.06, maxIntensity: 4.8 },
    });
  }
}

function emitSegment(
  add: AddPiece,
  a: Point,
  b: Point,
  spec: {
    kind: SiteGroundAccentId;
    y: number;
    width: number;
    height: number;
    color: string;
    roughness: number;
    metalness: number;
    emissiveColor: string;
    emissiveIntensity: number;
    animation: GroundAccentAnimation;
  }
): void {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.12) return;
  add({
    kind: spec.kind,
    mesh: "box",
    x: (a.x + b.x) / 2,
    y: spec.y,
    z: (a.z + b.z) / 2,
    rotX: 0,
    rotY: Math.atan2(dx, dz),
    rotZ: 0,
    sx: spec.width,
    sy: spec.height,
    sz: len,
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    emissiveColor: spec.emissiveColor,
    emissiveIntensity: spec.emissiveIntensity,
    animation: spec.animation,
  });
}

function jaggedPath(
  start: Point,
  heading: number,
  segments: number,
  stepMin: number,
  stepMax: number,
  turn: number,
  rng: () => number
): Point[] {
  const points: Point[] = [{ ...start }];
  let x = start.x;
  let z = start.z;
  let angle = heading;
  for (let i = 0; i < segments; i++) {
    angle += (rng() - 0.5) * turn;
    const step = stepMin + rng() * (stepMax - stepMin);
    x += Math.sin(angle) * step;
    z += Math.cos(angle) * step;
    points.push({ x, z });
  }
  return points;
}

/**
 * The five families and every library scatter layer share ONE solver — see
 * shared/ground-scatter.ts. These wrappers keep the authored call sites unchanged; the
 * algorithm and the seeds are identical, so existing plots re-plan pixel-for-pixel.
 */
function scatter(
  rng: () => number,
  count: number,
  halfW: number,
  halfD: number,
  radius: number,
  minDist: number,
  exclusions: readonly SiteGroundAccentExclusion[]
): Point[] {
  return scatterPoints({ rng, count, halfW, halfD, radius, minDist, exclusions });
}

function rngFor(kind: string, width: number, depth: number): () => number {
  return makeGroundRng(kind, width, depth);
}

function roundKey(v: number): number {
  return Math.round(v * 10);
}

function contrastL(l: number, delta: number): number {
  return l < 0.5 ? clamp01(l + delta) : clamp01(l - delta);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = (b - r) / d / 6 + 1 / 3;
  else h = (r - g) / d / 6 + 2 / 3;
  return { h: h * 360, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp01(s);
  const ll = clamp01(l);
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to2 = (v: number) =>
    Math.round(clamp01(v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/**
 * The local +Y axis of a piece under Decentraland's euler convention.
 *
 * ‼️ DCL's `Quaternion.fromEulerDegrees` is Unity's ZXY (`Ry·Rx·Rz`), NOT three.js's
 * default XYZ. Anything that has to sit ON a tilted piece — a crystal's point on its
 * body — must use this, and the Builder preview sets its euler order to "YXZ" so the
 * two renderers finally agree.
 */
export function localUpZxy(rotX: number, rotY: number, rotZ: number): { x: number; y: number; z: number } {
  const sa = Math.sin(rotX);
  const ca = Math.cos(rotX);
  const sb = Math.sin(rotY);
  const cb = Math.cos(rotY);
  const sc = Math.sin(rotZ);
  const cc = Math.cos(rotZ);
  return {
    x: -sc * cb + cc * sa * sb,
    y: cc * ca,
    z: sc * sb + cc * sa * cb,
  };
}
