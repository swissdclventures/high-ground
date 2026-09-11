/**
 * WORLD TRANSIT — how a visitor moves between scenes of the same World.
 *
 * Two failures this file exists to prevent, both reported on a multi-scene World:
 *
 *   1. A closed door dumped people into Genesis City. LEAVE called `teleportTo`
 *      at 0,0 — Genesis Plaza — because that is the one coordinate every client
 *      knows. Inside a World that is the wrong country. The way out of a locked
 *      scene is another OPEN scene in the same World, at that scene's own spawn.
 *
 *   2. Crossing a plot line used to silently hijack the visitor to spawn with
 *      no way back into the air. The island landing is a good default — KEEP
 *      FLYING is the opt-out, from the cover (while it still says LOADING) or
 *      from a chip if the cover was skipped.
 *
 * `teleportTo({ worldCoordinates })` is Genesis City. `movePlayerTo` cannot leave
 * this scene. The hop to a sibling scene is `changeRealm` on the CURRENT realm
 * URL with `?position=x,y` — the same pair a jump-in link carries.
 */

import {
  isLandingTransit,
  isLandingWalkIn,
  LANDING_WALK_IN_EDGE_M,
} from "./landing-contract";

export const WORLD_SESSION_KEY = "sv.world.session";
export const WORLD_SESSION_STALE_MS = 60_000;

/** Horizontal distance from spawn that still counts as "I arrived here". */
export const WORLD_SPAWN_NEAR_M = 8;
/** Further than this (or this much above/below spawn) earns the entrance offer. */
export const SCENE_OFFER_HORIZ_M = 12;
export const SCENE_OFFER_VERT_M = 4;

export type SceneAccessKind = "open" | "gated" | "closed";
export type ArrivalKind = "join" | "crossing";

export interface WorldSession {
  realm: string;
  t: number;
  /**
   * Parcel we asked Explorer to land on. The destination scene treats a matching
   * hop as a JOIN (restore to spawn) so a closed-door pick-up is not classified
   * as a crossing and left to fall.
   */
  hopTo?: string;
}

export interface WorldSceneDest {
  id: string;
  title: string;
  base: { x: number; y: number };
  parcels: Array<{ x: number; y: number }>;
  access: SceneAccessKind;
  isCurrent: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parcelKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseParcelKey(raw: string | null | undefined): { x: number; y: number } | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(-?\d+)\s*,\s*(-?\d+)$/);
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]) };
}

/**
 * Is this scene open to a visitor who holds nothing special?
 *
 * `open` — no Access rule, or the rule is mode `open`.
 * `closed` — allowlist (Admins only / named wallets / "not open yet").
 * `gated` — wearable or collection. Some visitors pass; most do not.
 */
export function sceneAccessKind(social: unknown): SceneAccessKind {
  if (!isRecord(social)) return "open";
  const id = typeof social.buildingGateRuleId === "string" ? social.buildingGateRuleId.trim() : "";
  if (!id) return "open";
  const gates = Array.isArray(social.gates) ? social.gates : [];
  const rule = gates.find((row) => isRecord(row) && row.id === id);
  if (!isRecord(rule)) return "open";
  const mode = typeof rule.mode === "string" ? rule.mode : "";
  if (!mode || mode === "open") return "open";
  if (mode === "allowlist") return "closed";
  return "gated";
}

export function sceneAccessKindFromBuildingConfig(raw: unknown): SceneAccessKind {
  if (!isRecord(raw)) return "open";
  return sceneAccessKind(raw.social);
}

/**
 * Sibling scenes a locked door may offer.
 *
 * Open scenes win. If this World has none, gated scenes are still a way to stay
 * inside it (the destination will raise its own curtain if they do not pass).
 * Another closed allowlist is not a way out.
 */
export function destinationsForClosedScene(scenes: readonly WorldSceneDest[]): WorldSceneDest[] {
  const others = scenes.filter((scene) => !scene.isCurrent);
  const open = others.filter((scene) => scene.access === "open");
  if (open.length) return open;
  return others.filter((scene) => scene.access === "gated");
}

export function truncateDestTitle(title: string, max = 28): string {
  const t = title.trim() || "Untitled scene";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Stick `?position=x,y` on the realm URL Explorer is already using.
 *
 * A bare world NAME lands at the World's sticky spawn — which may itself be
 * locked. The position is the scene selector in a multi-scene World.
 */
export function worldSceneRealmUrl(realmUrl: string, parcel: { x: number; y: number }): string {
  const pos = parcelKey(parcel.x, parcel.y);
  const trimmed = realmUrl.trim();
  if (!trimmed) return `?position=${pos}`;
  let stripped = trimmed.replace(/([?&])position=-?\d+,-?\d+(?=&|$)/gi, "$1");
  stripped = stripped.replace(/[?&]$/, "").replace(/\?&/, "?");
  return stripped.includes("?") ? `${stripped}&position=${pos}` : `${stripped}?position=${pos}`;
}

export function parseWorldSession(raw: string | null | undefined): WorldSession | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { realm?: unknown; t?: unknown; hopTo?: unknown };
    const realm = typeof o.realm === "string" ? o.realm.trim() : "";
    const t = typeof o.t === "number" && Number.isFinite(o.t) ? o.t : 0;
    if (!realm || t <= 0) return null;
    const hopTo =
      typeof o.hopTo === "string" && parseParcelKey(o.hopTo) ? o.hopTo.trim() : undefined;
    return hopTo ? { realm, t, hopTo } : { realm, t };
  } catch {
    return null;
  }
}

export function serializeWorldSession(session: WorldSession): string {
  return JSON.stringify({
    realm: session.realm.trim().toLowerCase(),
    t: session.t,
    ...(session.hopTo ? { hopTo: session.hopTo.trim() } : {}),
  });
}

export function worldSessionLive(
  session: WorldSession | null,
  realm: string,
  now: number,
  staleMs = WORLD_SESSION_STALE_MS,
): boolean {
  if (!session) return false;
  const here = realm.trim().toLowerCase();
  if (!here || session.realm.trim().toLowerCase() !== here) return false;
  return now - session.t >= 0 && now - session.t < staleMs;
}

export function hopTargetsThisScene(
  hopTo: string | undefined,
  sceneBase: string | null | undefined,
  parcels: ReadonlyArray<{ x: number; y: number }>,
): boolean {
  const hop = parseParcelKey(hopTo);
  if (!hop) return false;
  const base = parseParcelKey(sceneBase ?? "");
  if (base && base.x === hop.x && base.y === hop.y) return true;
  return parcels.some((p) => p.x === hop.x && p.y === hop.y);
}

/**
 * Join = first load of this World (login, hop-to-spawn, cold start).
 * Crossing = already travelling inside it.
 *
 * A live hopTo that names THIS scene is a JOIN even if the session is otherwise
 * live — that is the closed-door "take me to the open scene" path.
 */
export function classifyArrival(input: {
  sessionLive: boolean;
  hopToHere: boolean;
  nearEdge: boolean;
  transiting: boolean;
  /** False until this scene's spawn is known — do not guess a fly-in. */
  spawnKnown: boolean;
  /** False until the avatar transform exists. */
  playerKnown: boolean;
  nearSpawnXZ: boolean;
}): ArrivalKind {
  if (input.hopToHere) return "join";
  if (input.nearEdge || input.transiting) return "crossing";
  // A leftover heartbeat from this World is not itself a crossing: quitting
  // Explorer and rejoining within a minute still has a live session, and they
  // belong on the spawn. Far from that spawn with a live session is a hop.
  if (input.sessionLive && input.spawnKnown && input.playerKnown && !input.nearSpawnXZ) {
    return "crossing";
  }
  return "join";
}

export function arrivalNearSpawnXZ(input: {
  playerX: number;
  playerZ: number;
  spawnX: number;
  spawnZ: number;
  nearM?: number;
}): boolean {
  return Math.hypot(input.playerX - input.spawnX, input.playerZ - input.spawnZ) <= (input.nearM ?? WORLD_SPAWN_NEAR_M);
}

export function shouldOfferSceneSpawn(input: {
  kind: ArrivalKind;
  spawn: { x: number; y: number; z: number } | null;
  player: { x: number; y: number; z: number } | null;
  dismissed: boolean;
  accessCurtain: boolean;
  punchFallPrompt: boolean;
}): boolean {
  if (input.accessCurtain || input.punchFallPrompt || input.dismissed) return false;
  if (input.kind !== "crossing") return false;
  if (!input.spawn || !input.player) return false;
  const horiz = Math.hypot(input.player.x - input.spawn.x, input.player.z - input.spawn.z);
  const vert = Math.abs(input.player.y - input.spawn.y);
  return horiz > SCENE_OFFER_HORIZ_M || vert > SCENE_OFFER_VERT_M;
}

/** Pose helpers the runtime already uses for the landing cover. */
export function visitorNearPlotEdge(input: {
  playerX: number;
  playerZ: number;
  spawnX: number;
  spawnZ: number;
  sizeX: number;
  sizeZ: number;
}): boolean {
  return isLandingWalkIn({ ...input, edgeM: LANDING_WALK_IN_EDGE_M });
}

export function visitorIsTransiting(input: {
  speedX: number;
  speedZ: number;
  speedY?: number;
  nearSpawnXZ?: boolean;
  playerY?: number;
  spawnY?: number;
}): boolean {
  const airborne =
    input.nearSpawnXZ === false ||
    (typeof input.playerY === "number" &&
      typeof input.spawnY === "number" &&
      input.playerY > input.spawnY + SCENE_OFFER_VERT_M);
  return isLandingTransit({
    speedX: input.speedX,
    speedZ: input.speedZ,
    speedY: input.speedY,
    airborne,
  });
}

/**
 * A pose we can put them back into if they KEEP FLYING.
 *
 * Join at spawn is a gravity fall, not a fly-in. Walking the plot is on the
 * deck. Only an airborne pose — above the island, or well below it and away
 * from the spawn column — is a fly we can undo.
 */
export function shouldSnapshotFlyPose(input: {
  player: { x: number; y: number; z: number } | null;
  spawn: { x: number; y: number; z: number } | null;
}): boolean {
  if (!input.player || !input.spawn) return false;
  const horiz = Math.hypot(input.player.x - input.spawn.x, input.player.z - input.spawn.z);
  const vert = input.player.y - input.spawn.y;
  if (vert > SCENE_OFFER_VERT_M) return true;
  if (horiz <= SCENE_OFFER_HORIZ_M) return false;
  return vert < -SCENE_OFFER_VERT_M;
}

/**
 * After a fly-in was restored onto the island, offer the way back into the air.
 * Hidden while the landing cover itself owns KEEP FLYING, or while punch's fall
 * cloud already has the same question.
 */
export function shouldOfferKeepFlying(input: {
  kind: ArrivalKind;
  captured: boolean;
  dismissed: boolean;
  accessCurtain: boolean;
  punchFallPrompt: boolean;
  landingCover: boolean;
}): boolean {
  if (input.kind !== "crossing") return false;
  if (!input.captured) return false;
  if (input.dismissed || input.accessCurtain || input.punchFallPrompt || input.landingCover) {
    return false;
  }
  return true;
}

/**
 * KEEP FLYING on the cover — only a fly-in that we can actually undo.
 * A join at spawn is not flying, even if gravity is already pulling them down.
 */
export function canOfferKeepFlyingOnCover(input: {
  crossing: boolean;
  snapshot: boolean;
  optedOut: boolean;
}): boolean {
  if (input.optedOut) return false;
  return input.crossing && input.snapshot;
}

export function parseScenePlotSize(metadataJson: string | null | undefined): {
  sizeX: number;
  sizeZ: number;
  base: { x: number; y: number } | null;
  parcels: Array<{ x: number; y: number }>;
} | null {
  if (!metadataJson) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataJson);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const scene = isRecord(parsed.scene) ? parsed.scene : {};
  const rawParcels = Array.isArray(scene.parcels) ? scene.parcels : [];
  const parcels = rawParcels
    .map((p) => (typeof p === "string" ? parseParcelKey(p) : null))
    .filter((p): p is { x: number; y: number } => p !== null);
  if (!parcels.length) return null;
  const xs = parcels.map((p) => p.x);
  const ys = parcels.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    sizeX: (maxX - minX + 1) * 16,
    sizeZ: (maxY - minY + 1) * 16,
    base: parseParcelKey(typeof scene.base === "string" ? scene.base : "") ?? parcels[0]!,
    parcels,
  };
}
