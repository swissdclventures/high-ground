/**
 * Launch pads — traversal that replaces the elevator.
 *
 * WHAT DECENTRALAND ACTUALLY ALLOWS. There is no way to push the player in SDK7;
 * avatar movement is client-side and no impulse API exists. The only sanctioned move is
 * `movePlayerTo({ newRelativePosition })` from `~system/RestrictedActions`, an instant
 * teleport that is rejected outside the scene bounds. So a launch pad teleports you to an
 * APEX above the target floor and lets Decentraland's own gravity drop you onto it. You
 * get the launch-and-fall feel and a precise landing; what you never get is real physics.
 * Do not "improve" this into a velocity — there is nothing to set.
 *
 * ★LAW: a building contains NO traversal objects — see resolveLaunchPads. Every pad is
 * AUTHORED: placed on the plot by hand, one fixed target, walk-on fire. Like furniture.
 */

import type { BuildingConfig, SceneLayout } from "./types";
import { dclLimitsForScene } from "./types";

export const LAUNCH_PAD_ID_PREFIX = "launch_pad_f";

/**
 * TWO instruments, and only two (owner, 2026-08-04: "keep jump pad and the speed
 * corridor and remove all of the others"). Five styles read as a zoo of unclear
 * machines; two say exactly what they do:
 *
 * - JUMP PAD — throws you to the maximum height the plot legally allows; you fall from
 *   there and steer in the air onto any roof or spot. The vertical instrument.
 * - SPEED CORRIDOR — low fast throws fired one after another, pad to pad. The
 *   horizontal instrument.
 *
 * The removed styles live on as ALIASES (see traversalPresetSpec): a draft that says
 * "catapult" or "teleport" gets a jump pad, "flying_route" gets a corridor. Data is
 * never rejected over a rename.
 */
export type TraversalPreset = "jump_pad" | "speed_corridor";

export interface TraversalPresetSpec {
  /** Apex above the destination. 0 = instant, no arc. */
  arcM: number;
  label: string;
  hint: string;
  /**
   * Half-extent across, in metres. These are STRUCTURES, not markers: on a 45×45 plot a
   * one-metre disc is invisible from anywhere you would actually be standing, and you
   * cannot step onto what you cannot see. Sized to be hard to miss and hard to miss
   * STEPPING ON.
   */
  radiusM: number;
  /** Length along the travel direction. Longer than it is wide reads as a corridor. */
  lengthScale: number;
  /** Its own colour, so five different things do not look like one thing. */
  color: number;
  /** Arrow drawn on the deck: up for a launch, forward for a corridor. */
  arrow: "up" | "forward" | "none";
}

/**
 * THE ARC NUMBERS ARE AMBITIONS, NOT FINAL HEIGHTS.
 *
 * They were 3.5 m and under, sized for the one job the derived stack does — hop to the
 * floor above. Stood on as a placed catapult that reads "thrown a meter or two and then
 * I fall back down" ("this needs to go like 300 meters", 2026-08-04), which is not a
 * catapult, it is a stumble. A PLACED pad is a different instrument: it answers "throw me
 * across the plot", and the only ceiling it should respect is the one Decentraland
 * enforces. So these are what the style WANTS, and two clamps decide what it gets:
 *
 * - a building picker pad ignores them entirely — its flight adds its own small hop
 *   (`PICKER_HOP_ARC_M`) at pick time, so the 300 m ambition cannot leak indoors;
 * - a placed pad clamps to the scene's legal ceiling (`clampApexY`), which on a big plot
 *   is around 200 m and is literally the maximum possible.
 */
export const TRAVERSAL_PRESETS: Record<TraversalPreset, TraversalPresetSpec> = {
  jump_pad: {
    // As high as the scene allows. Every plot clamps this down; none clamps it to a hop.
    // "Isn't this supposed to just throw you up to the maximum height, let you fall from
    // there so you can engage your flying mechanic — that's what we need."
    arcM: 300,
    label: "Jump pad",
    hint: "Thrown to the sky's legal limit — steer in the air and land anywhere.",
    radiusM: 3,
    lengthScale: 1,
    color: 0xff8a2b,
    arrow: "up",
  },
  speed_corridor: {
    arcM: 4,
    label: "Speed corridor",
    hint: "Low fast throws pad to pad — press E, Jump, or STOP anytime to bail mid-lane.",
    // Long and narrow: a corridor should read as a lane you run down, not a spot.
    radiusM: 2.4,
    lengthScale: 3,
    color: 0x4fd8ff,
    arrow: "forward",
  },
};

/**
 * Retired style names → their surviving instrument. A saved draft may carry any of
 * these; the pad keeps working, it just becomes the thing it always effectively was.
 */
const LEGACY_PRESET_ALIASES: Record<string, TraversalPreset> = {
  catapult: "jump_pad",
  teleport: "jump_pad",
  flying_route: "speed_corridor",
};

/** Any stored/legacy style name → a live preset key. Unknown → jump_pad. */
export function normalizeTraversalPreset(preset: string | undefined): TraversalPreset {
  if (preset && preset in TRAVERSAL_PRESETS) return preset as TraversalPreset;
  return (preset && LEGACY_PRESET_ALIASES[preset]) || "jump_pad";
}

/**
 * Headroom under Decentraland's hard height cap. The cap is what the SCENE may contain;
 * being thrown to the exact ceiling is asking for the one metre that gets rejected.
 */
export const TRAVERSAL_APEX_HEADROOM_M = 2;

/** The highest a thrown player may be sent on this plot. */
export function traversalCeilingM(layout: SceneLayout): number {
  return Math.max(8, dclLimitsForScene(layout).maxHeight - TRAVERSAL_APEX_HEADROOM_M);
}

/** Clamp a wanted apex to what the plot legally allows. */
export function clampApexY(desiredApexY: number, layout: SceneLayout): number {
  return Math.max(0, Math.min(desiredApexY, traversalCeilingM(layout)));
}

/**
 * Resolve an authored launch height into the safe height this plot can actually use.
 *
 * The preset is only the starting value. Authors may deliberately make either device
 * gentler, but the scene boundary remains the hard stop: `movePlayerTo` rejects a
 * position outside it and gives the visitor no useful failure feedback.
 */
export function authoredLaunchHeightM(
  preset: TraversalPreset | string | undefined,
  padY: number,
  layout: SceneLayout,
  requestedHeightM?: number,
): number {
  const requested = Number.isFinite(requestedHeightM)
    ? Math.max(0, Number(requestedHeightM))
    : traversalPresetSpec(preset).arcM;
  return Math.max(0, clampApexY(padY + requested, layout) - padY);
}

/**
 * The apex a PLACED pad of this style should use, given where it stands and where it
 * throws you — the preset's ambition, clamped to the plot.
 */
export function authoredApexY(
  preset: TraversalPreset | string | undefined,
  landingY: number,
  layout: SceneLayout,
  requestedHeightM?: number,
): number {
  return landingY + authoredLaunchHeightM(preset, landingY, layout, requestedHeightM);
}

/**
 * WHERE YOU ARE, PART WAY THROUGH THE THROW.
 *
 * One curve, three consumers: the runtime flies the player along it, the composer draws
 * it as the pad's projection line, and the in-world tracer bead runs it on a loop. They
 * have to be the same function or the line drawn on screen is a promise the throw breaks.
 *
 * Constant-gravity parabola through (0, padY), peaking at apexY, ending at (1, landingY).
 * The peak lands at t = √rise / (√rise + √drop), which is why an asymmetric throw — high
 * launch, low landing — spends most of its time coming down, exactly like a real one.
 */
export function arcPeakFraction(padY: number, apexY: number, landingY: number): number {
  const rise = Math.max(0, apexY - padY);
  const drop = Math.max(0, apexY - landingY);
  const a = Math.sqrt(rise);
  const b = Math.sqrt(drop);
  if (a + b <= 1e-6) return 0.5;
  return a / (a + b);
}

/** Height at fraction `t` (0 = leaving the pad, 1 = landing). */
export function arcHeightAt(t: number, padY: number, apexY: number, landingY: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const peak = arcPeakFraction(padY, apexY, landingY);
  if (apexY <= Math.max(padY, landingY) + 1e-6) {
    // No arc worth the name (a teleport): a straight line between the two ends.
    return padY + (landingY - padY) * clamped;
  }
  const rise = apexY - padY;
  const drop = apexY - landingY;
  // Two half-parabolas that meet at the peak — one k per side keeps both ends exact even
  // when the pad and the landing sit at different heights.
  const k = clamped <= peak
    ? rise / Math.max(1e-6, peak * peak)
    : drop / Math.max(1e-6, (1 - peak) * (1 - peak));
  const d = clamped - peak;
  return apexY - k * d * d;
}

/** Full point on the throw at fraction `t`. */
export function arcPointAt(
  t: number,
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  apexY: number
): { x: number; y: number; z: number } {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    x: from.x + (to.x - from.x) * clamped,
    y: arcHeightAt(clamped, from.y, apexY, to.y),
    z: from.z + (to.z - from.z) * clamped,
  };
}

/**
 * Compass heading of the throw, in radians, 0 = +Z. Everything that has to POINT at the
 * destination — the deck arrow, the chevron run, the launch beam — takes it from here so
 * the pad cannot say one direction while the throw takes another.
 */
export function throwHeadingRad(dx: number, dz: number): number {
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return 0;
  return Math.atan2(dx, dz);
}

/** Below this the pad is aimed at itself — a straight-up launch, not a throw. */
export const VERTICAL_THROW_M = 1.5;

/**
 * A new corridor must already go somewhere. Previously it was created with its target
 * on top of its centre: the mesh still pointed along +Z, while the runtime interpreted
 * the zero-length vector as a vertical launch. That made its sign and its behaviour
 * disagree before the author had even touched it.
 */
export const DEFAULT_CORRIDOR_THROW_M = 16;

export interface TraversalTargetBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Give a corridor a useful first target inside its scope.
 *
 * `preferredHeadingRad` normally comes from the editor camera, so a newly placed runway
 * carries the player in the direction the author is looking. If that direction runs out
 * of room, we pick the roomiest cardinal direction instead. The returned vector is the
 * same vector the mesh, trigger and runtime all consume.
 */
export function defaultCorridorTarget(
  centerX: number,
  centerZ: number,
  bounds: TraversalTargetBounds,
  preferredHeadingRad = 0,
  wantedDistanceM = DEFAULT_CORRIDOR_THROW_M
): { x: number; z: number } {
  const margin = 0.25;
  const safe = {
    minX: Math.min(bounds.maxX, bounds.minX + margin),
    maxX: Math.max(bounds.minX, bounds.maxX - margin),
    minZ: Math.min(bounds.maxZ, bounds.minZ + margin),
    maxZ: Math.max(bounds.minZ, bounds.maxZ - margin),
  };
  const distance = Math.max(VERTICAL_THROW_M + 0.25, wantedDistanceM);
  const roomAlong = (x: number, z: number): number => {
    const tx = Math.abs(x) < 1e-6 ? Infinity : x > 0 ? (safe.maxX - centerX) / x : (safe.minX - centerX) / x;
    const tz = Math.abs(z) < 1e-6 ? Infinity : z > 0 ? (safe.maxZ - centerZ) / z : (safe.minZ - centerZ) / z;
    return Math.max(0, Math.min(tx, tz));
  };

  const preferred = { x: Math.sin(preferredHeadingRad), z: Math.cos(preferredHeadingRad) };
  const candidates = [
    preferred,
    { x: -preferred.x, z: -preferred.z },
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ];
  const viable = candidates
    .map((direction) => ({ direction, room: roomAlong(direction.x, direction.z) }))
    .filter((candidate) => Number.isFinite(candidate.room) && candidate.room > VERTICAL_THROW_M)
    .sort((a, b) => b.room - a.room);
  const chosen = viable.find((candidate) => candidate.direction === preferred) ?? viable[0];
  if (!chosen) return { x: centerX, z: centerZ };
  const travel = Math.min(distance, chosen.room);
  return {
    x: centerX + chosen.direction.x * travel,
    z: centerZ + chosen.direction.z * travel,
  };
}

/**
 * A JUMP PAD HAS NO DESTINATION (issue #13). It launches straight up from its own
 * position to the plot's legal maximum and releases the player at the apex; anything
 * horizontal is a speed corridor's job. Every writer (placement, heal, panel) funnels
 * a jump pad's target through this so an aimed jump pad cannot exist in data.
 */
export function isVerticalOnlyPreset(preset: string | undefined): boolean {
  return normalizeTraversalPreset(preset) === "jump_pad";
}

/**
 * Is a scene point inside a corridor's RUNWAY, not just near its centre? The old
 * circular trigger meant running along the lane's edge fired nothing — "the player
 * should not have to step on a small center point" (issue #13). The lane is an
 * oriented box: `radius` across, `radius × lengthScale` along the heading.
 */
export function corridorLaneContains(
  padX: number,
  padZ: number,
  headingRad: number,
  radiusM: number,
  lengthScale: number,
  x: number,
  z: number
): boolean {
  const dx = x - padX;
  const dz = z - padZ;
  // Inverse-rotate the point into the lane's local frame (heading 0 = +Z).
  const cos = Math.cos(-headingRad);
  const sin = Math.sin(-headingRad);
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  return Math.abs(localX) <= radiusM && Math.abs(localZ) <= radiusM * lengthScale;
}

export function traversalPresetSpec(preset: string | undefined): TraversalPresetSpec {
  return TRAVERSAL_PRESETS[normalizeTraversalPreset(preset)];
}

/**
 * How far from a pad's centre another pad's centre must stay. Corridors are long lanes
 * (`radius × lengthScale`); treating them as discs of that half-length keeps stacked
 * "Add pad" clicks from landing on top of each other visually.
 */
export function padPlacementFootprintM(
  preset: string | undefined,
  radius?: number
): number {
  const style = traversalPresetSpec(preset);
  const r =
    Number.isFinite(radius) && (radius as number) > 0 ? (radius as number) : style.radiusM;
  return r * Math.max(1, style.lengthScale);
}

/** Gap kept between two pad footprints when auto-placing the next one. */
export const PAD_PLACEMENT_GAP_M = 2.5;

export type PadSpotOccupant = {
  centerX: number;
  centerZ: number;
  floorIndex: number;
  radius?: number;
  preset?: string;
};

/** True when `(x,z)` is far enough from every occupant on the same floor. */
export function padSpotClearOf(
  x: number,
  z: number,
  floorIndex: number,
  occupants: readonly PadSpotOccupant[],
  newPreset: TraversalPreset
): boolean {
  const newFoot = padPlacementFootprintM(newPreset);
  return occupants
    .filter((p) => p.floorIndex === floorIndex)
    .every((p) => {
      const need =
        padPlacementFootprintM(p.preset, p.radius) + newFoot + PAD_PLACEMENT_GAP_M;
      return Math.hypot(x - p.centerX, z - p.centerZ) > need;
    });
}

/**
 * Pick a legal + clear cell nearest `origin`, else the first legal cell, else null.
 * Pure — callers supply the grid and the illegal-spot predicate.
 */
export function pickPadSpot(
  originX: number,
  originZ: number,
  floorIndex: number,
  candidates: ReadonlyArray<{ x: number; z: number }>,
  isIllegal: (x: number, z: number) => unknown,
  occupants: readonly PadSpotOccupant[],
  newPreset: TraversalPreset
): { x: number; z: number } | null {
  const ordered = [...candidates].sort(
    (a, b) =>
      Math.hypot(a.x - originX, a.z - originZ) - Math.hypot(b.x - originX, b.z - originZ)
  );
  let firstLegal: { x: number; z: number } | null = null;
  for (const spot of ordered) {
    if (isIllegal(spot.x, spot.z)) continue;
    if (!firstLegal) firstLegal = spot;
    if (padSpotClearOf(spot.x, spot.z, floorIndex, occupants, newPreset)) return spot;
  }
  return firstLegal;
}

/** The preset a building's vertical traversal uses. Absent = catapult, the shipped default. */
export function buildingTraversalPreset(building: BuildingConfig): TraversalPreset {
  return normalizeTraversalPreset(building.traversalPreset);
}

/**
 * FLIGHT, not teleport.
 *
 * `movePlayerTo` is instant, so one call is a teleport and the throw itself is invisible:
 * "it's just teleporting you forward but you don't know where". Called repeatedly along
 * the arc it becomes a flight — the player carried through the same curve the pad draws
 * on the ground. The rate is throttled well under frame rate because every call is a
 * restricted-action round trip, and sixty a second is not a budget worth spending.
 */
export const PAD_FLIGHT_STEP_HZ = 20;
/** Seconds a throw takes, scaled by path length between these bounds. */
export const PAD_FLIGHT_MIN_S = 0.55;
export const PAD_FLIGHT_MAX_S = 2.4;
/** Metres of path per second of flight, before the bounds bite. */
export const PAD_FLIGHT_SPEED_MPS = 90;

/** How long a throw along a path this long should take. */
export function padFlightSeconds(pathLengthM: number): number {
  return Math.max(
    PAD_FLIGHT_MIN_S,
    Math.min(PAD_FLIGHT_MAX_S, pathLengthM / PAD_FLIGHT_SPEED_MPS)
  );
}

/** Pad radius. Big enough to step onto without aiming, small enough not to be a floor. */
export const LAUNCH_PAD_RADIUS_M = 1.1;

/**
 * Seconds a launched player is immune to being re-launched. Without it, landing on a pad
 * on the floor above fires that pad instantly and you ride to the roof you did not ask
 * for — and on the way down you would bounce off every pad in the stack.
 */
export const LAUNCH_COOLDOWN_S = 1.5;

/**
 * A pad the AUTHOR placed, as opposed to the derived one-per-floor stack.
 *
 * The derived pads answer "how do I get upstairs". These answer "get me across the plot",
 * which the derived ones structurally cannot: they sit on the circulation bay and fire
 * straight up. A placed pad carries its own destination, so a catapult can throw you
 * forward — and pointing each pad at the next one is what makes a path.
 *
 * Positions follow the same scope rule as furniture: a pad on a floor is building-local,
 * a pad on open ground is in scene coordinates. See SITE_FLOOR_INDEX in floor-props.ts.
 */
export interface AuthoredPadSpec {
  id: string;
  /** Floor it stands on, or SITE_FLOOR_INDEX for open ground. */
  floorIndex: number;
  scope: "building" | "site";
  centerX: number;
  centerZ: number;
  /** Where it throws you. Absent target = straight up, the old behaviour. */
  targetX: number;
  targetZ: number;
  targetFloorIndex: number;
  /** Apex above the destination — 0 is a straight teleport. */
  arcM: number;
  /** Pad this one hands off to on landing, making a path. */
  chainToId: string | null;
  radius: number;
  preset: TraversalPreset;
}

export const AUTHORED_PAD_ID_PREFIX = "traversal_pad_";

/** Distance beyond which a "short hop" is really a long throw — used for the hint only. */
export const LONG_THROW_M = 20;

export function isAuthoredPad(spec: Record<string, unknown> | undefined): boolean {
  return spec?.authored === true;
}

/**
 * One level a building pad can send you to. `y` is the walk-surface height of that
 * level in the same building-local frame as the pad's own `padY`, so the runtime
 * converts both through the identical origin offset.
 */
export interface LaunchStop {
  level: number | "roof";
  label: string;
  y: number;
}

/**
 * A building's traversal pad — a FLOOR PICKER, not a trigger.
 *
 * The first derived stack was one pad per floor, each auto-firing one floor up. In a
 * 20-storey tower that meant nineteen catapultings with no way to say where you were
 * going — an elevator wearing a costume, minus the floor buttons ("this is not what we
 * actually wanted", 2026-08-04). So the building pad keeps the one thing the elevator
 * did well: you stand on it, the levels are listed, you pick one, and a single arc
 * takes you straight there. Standing on it never fires by itself.
 *
 * Walk-on auto-fire remains the AUTHORED pad's behaviour — a placed catapult has one
 * fixed target, so stepping on IS the choice. See AuthoredPadSpec.
 */
export interface LaunchPadPlan {
  id: string;
  /** Level the pad stands on: floor index, or "roof" for the terrace. */
  level: number | "roof";
  /** Building-local pad centre. */
  centerX: number;
  centerZ: number;
  /** Walk-surface Y the pad sits on (building-local meters). */
  padY: number;
  radius: number;
  /** Every level this pad can send you to (all levels except its own). */
  stops: LaunchStop[];
  /** Flight feel — teleport is instant, everything else flies a small arc. */
  preset: TraversalPreset;
}

/** Building pad radius — a picker you stand on deliberately, so it must read as a place. */
export const BUILDING_PAD_RADIUS_M = 1.6;

/**
 * Metres of arc above the higher end of a picker flight. Purely for feel — the flight
 * teleports through slabs, so this never has to clear geometry, and buildings stop 6 m
 * under the DCL cap (DCL_HEIGHT_HEADROOM_M) so peak + hop stays legal on every plot.
 */
export const PICKER_HOP_ARC_M = 3;

/** True when this building uses launch pads instead of a ramp or an elevator. */
export function usesLaunchTraversal(building: BuildingConfig): boolean {
  return building.circulationMode === "launch";
}

/**
 * Retire the unsupported ramp mode on load while preserving working elevators.
 *
 * Launch remains the default and saved ramps migrate to it. Explicit elevator modes are
 * retained, but their shaft is constrained to one building-wide bay: a moving per-floor
 * shaft cannot carry a cab safely. The bay and glass tube remain authored elevator data.
 */
export function retireLegacyCirculation(building: BuildingConfig): BuildingConfig {
  if (usesLaunchTraversal(building)) return building;
  if (building.circulationMode === "elevator" || building.circulationMode === "elevator_only") {
    if (!building.circulationOverrides?.length) return building;
    return { ...building, circulationOverrides: undefined };
  }
  return { ...building, circulationMode: "launch", circulationStairs: false,
    circulationOverrides: undefined, glassTube: false };
}

/** "Ground" / "Floor N" / "Roof" — one vocabulary for the picker UI and the panel. */
export function launchStopLabel(level: number | "roof"): string {
  if (level === "roof") return "Roof";
  return level === 0 ? "Ground" : `Floor ${level + 1}`;
}

/**
 * The same level as a KEY — what fits on a lift button.
 *
 * The in-world directory shows every floor at once, which only works if a button is a
 * digit rather than the words "Floor" repeated forty times. "G" and "R" are the two
 * levels that have never had a number anywhere in this product.
 */
export function launchStopKey(level: number | "roof"): string {
  if (level === "roof") return "R";
  return level === 0 ? "G" : `${level + 1}`;
}

/**
 * ★LAW (owner, 2026-08-04, final): A BUILDING CONTAINS NO TRAVERSAL OBJECTS. EVER.
 *
 * No catapults, no jump pads, no pickers, nothing that moves a player — not derived,
 * not auto-placed, not "just one in the lobby". Three generations of interior traversal
 * (the auto-fire hop stack, then the picker column) were all rejected on sight in-world:
 * a column of glowing objects climbing every facade is not architecture. Traversal is
 * AUTHORED CONTENT, placed on the plot by hand (AuthoredPadSpec, the Traversal panel),
 * exactly like furniture.
 *
 * This resolver is the single source every consumer derives building pads from —
 * spec sync, buildings 2..N, the editor previews, the publish gate. It returns empty
 * BY DESIGN; do not "fix" it. If interior traversal ever comes back, it comes back as
 * a product decision through the owner, not through this function growing a body.
 */
export function resolveLaunchPads(
  _building: BuildingConfig,
  _layout: SceneLayout
): LaunchPadPlan[] {
  return [];
}

/**
 * The publish gate's question, answered honestly: a launch building demands no built
 * vertical link at all. Movement between floors is the owner's business — authored
 * catapults on the plot, or none. The gate must never block a publish over it.
 */
export function launchTraversalCoversEveryFloor(
  building: BuildingConfig,
  _layout: SceneLayout
): boolean {
  return usesLaunchTraversal(building);
}
