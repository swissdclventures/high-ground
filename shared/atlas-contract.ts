/**
 * Federated Worlds / Metaverse Atlas V1 — shared domain contract.
 *
 * This file owns pure vocabulary, spatial rules, action-message canonicalization,
 * membership transitions and Builder entitlement. Persistence and HTTP stay in
 * `app/atlas-server`; rendering stays in `app/src/universe-map`.
 */

import { normalizeDclWorldName } from "./universe-overlay-contract";

export const ATLAS_PROTOCOL_VERSION = 1 as const;

/** Postgres `integer` range. The map is product-unbounded, not array-bounded. */
export const ATLAS_COORD_MIN = -2_147_483_648;
export const ATLAS_COORD_MAX = 2_147_483_647;

/**
 * V1 product grids. A cell coordinate is the permanent identity of a spot —
 * a future on-chain lock-in references exactly these integers — so the bounds
 * below only cap where V1 allows NEW placement; growing them later never
 * renumbers an existing cell.
 *
 * Federation grid: 3×3 Worlds, founder fixed at 0,0 in the centre, so it grows
 * outward symmetrically. Atlas grid: 10×10 federation/World anchors with the
 * origin corner at 0,0 (x grows east, y grows south), so it grows toward
 * 300×300 without moving anyone.
 */
export const FEDERATION_GRID_HALF = 1;
export const ATLAS_GRID_MIN = 0;
export const ATLAS_GRID_MAX = 9;

export function isWithinFederationGrid(point: AtlasGridPoint): boolean {
  return (
    Number.isInteger(point.x) &&
    Number.isInteger(point.y) &&
    Math.abs(point.x) <= FEDERATION_GRID_HALF &&
    Math.abs(point.y) <= FEDERATION_GRID_HALF
  );
}

export function isWithinAtlasGrid(point: AtlasGridPoint): boolean {
  return (
    Number.isInteger(point.x) &&
    Number.isInteger(point.y) &&
    point.x >= ATLAS_GRID_MIN &&
    point.x <= ATLAS_GRID_MAX &&
    point.y >= ATLAS_GRID_MIN &&
    point.y <= ATLAS_GRID_MAX
  );
}

export const ATLAS_SIDES = ["north", "east", "south", "west"] as const;
export type AtlasSide = (typeof ATLAS_SIDES)[number];

export const OPPOSITE_ATLAS_SIDE: Record<AtlasSide, AtlasSide> = {
  north: "south",
  east: "west",
  south: "north",
  west: "east",
};

/** Federation-map convention: x grows east; y grows south (north is y - 1). */
export const ATLAS_SIDE_OFFSET: Record<AtlasSide, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  east: { dx: 1, dy: 0 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 },
};

export interface AtlasGridPoint {
  x: number;
  y: number;
}

export type WorldVerificationStatus = "UNVERIFIED" | "VERIFIED" | "REVOKED" | "EXPIRED";
export type FederationStatus = "DRAFT" | "ACTIVE" | "SUSPENDED";
export type MembershipStatus = "PENDING_CONNECTION" | "ACTIVE" | "DISCONNECTED" | "REMOVED";
export type WorldFederationState =
  | "UNREGISTERED"
  | "REGISTERED"
  | MembershipStatus;
export type ConnectionStatus =
  | "PROPOSED"
  | "PARTIALLY_SIGNED"
  | "CONFIRMED"
  | "ENDED"
  | "REVOKED";
export type AtlasPlacementKind = "SOFT" | "FEDERATION";
export type AtlasOperatorRole = "ADMIN" | "ATLAS_OPERATOR";
export type WorldCollaboratorRole = "OWNER" | "BUILDER" | "PUBLISHER" | "VIEWER";
export type BuilderCapability =
  | "view"
  | "edit"
  | "save"
  | "publish"
  | "manage_collaborators"
  | "manage_federation";

/**
 * The World row as published on the PUBLIC snapshot.
 *
 * It deliberately carries no owner wallet. Ownership is proven per request
 * against Decentraland, so no reader needs our copy of it, and publishing one
 * would hand out a bulk World-to-wallet index that nobody opted into.
 * `AtlasWorldRecord` below is the server-internal row that still has it.
 */
export interface PublicAtlasWorld {
  id: string;
  worldName: string;
  verificationStatus: WorldVerificationStatus;
  verifiedAt: string | null;
  title: string | null;
  description: string | null;
  worldAccessState: string | null;
  spawnParcel: string | null;
  lastDeploymentAt: string | null;
  sceneCount: number;
  parcelCount: number;
  worldBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  thumbnail: string | null;
  metadataFetchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Server-internal World row. The owner wallet is an authorization input
 * (`AtlasService.ownedWorld`) and must never reach a public response.
 */
export interface AtlasWorldRecord extends PublicAtlasWorld {
  ownerWallet: string;
}

export interface AtlasPositionRecord extends AtlasGridPoint {
  id: string;
  worldId: string;
  kind: AtlasPlacementKind;
  placedAt: string;
  movedAt: string | null;
}

export interface AtlasFederationRecord {
  id: string;
  name: string;
  slug: string;
  founderWorldId: string;
  status: FederationStatus;
  isPrimary: boolean;
  atlasAnchor: AtlasGridPoint;
  createdAt: string;
}

export interface AtlasMembershipRecord extends AtlasGridPoint {
  id: string;
  worldId: string;
  federationId: string;
  status: MembershipStatus;
  requestedAt: string;
  activatedAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
}

export interface AtlasMembershipPeriodRecord {
  id: string;
  membershipId: string;
  federationId: string;
  worldId: string;
  joinedAt: string;
  leftAt: string | null;
}

/**
 * The border row as published on the PUBLIC snapshot. The proposal digest is
 * omitted: it is the signing payload, only ever compared server-side, and
 * publishing it exposes the exact bytes of an in-flight negotiation.
 */
export interface PublicAtlasConnection {
  id: string;
  federationId: string;
  worldAId: string;
  worldBId: string;
  worldASide: AtlasSide;
  worldBSide: AtlasSide;
  status: ConnectionStatus;
  proposedAt: string;
  confirmedAt: string | null;
  endedAt: string | null;
}

/** Server-internal border row, carrying the digest every signature binds. */
export interface AtlasConnectionRecord extends PublicAtlasConnection {
  proposalDigest: string;
}

export interface AtlasCollaboratorRecord {
  id: string;
  worldId: string;
  walletAddress: string;
  role: Exclude<WorldCollaboratorRole, "OWNER">;
  source: "atlas" | "decentraland";
  grantedByWallet: string;
  grantedAt: string;
}

/**
 * What `/api/atlas/snapshot` serves to anyone. Every member is a public
 * projection: no wallets, no signing payloads, no cached permission documents.
 *
 * Row sets are still unfiltered here. Filtering pending proposals out of the
 * public surface waits on `/api/atlas/worlds/mine`, because the Builder and the
 * `/federation` page currently read their own in-flight state from this
 * response and have nowhere else to get it yet.
 */
export interface PublicAtlasSnapshot {
  worlds: PublicAtlasWorld[];
  positions: AtlasPositionRecord[];
  federations: AtlasFederationRecord[];
  memberships: AtlasMembershipRecord[];
  connections: PublicAtlasConnection[];
  generatedAt: string;
}

export function isAtlasCoordinate(value: number): boolean {
  return Number.isInteger(value) && value >= ATLAS_COORD_MIN && value <= ATLAS_COORD_MAX;
}

export function assertAtlasPoint(point: AtlasGridPoint, label = "Atlas point"): void {
  if (!isAtlasCoordinate(point.x) || !isAtlasCoordinate(point.y)) {
    throw new Error(`${label} must use signed 32-bit integer coordinates.`);
  }
}

export function atlasCellKey(point: AtlasGridPoint): string {
  assertAtlasPoint(point);
  return `${point.x},${point.y}`;
}

export function atlasNeighbor(point: AtlasGridPoint, side: AtlasSide): AtlasGridPoint {
  assertAtlasPoint(point);
  const { dx, dy } = ATLAS_SIDE_OFFSET[side];
  const next = { x: point.x + dx, y: point.y + dy };
  assertAtlasPoint(next, "Atlas neighbor");
  return next;
}

/** The side of A that touches B. Cells must share exactly one edge. */
export function atlasSideBetween(a: AtlasGridPoint, b: AtlasGridPoint): AtlasSide {
  assertAtlasPoint(a, "Cell A");
  assertAtlasPoint(b, "Cell B");
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 1 && dy === 0) return "east";
  if (dx === -1 && dy === 0) return "west";
  if (dx === 0 && dy === -1) return "north";
  if (dx === 0 && dy === 1) return "south";
  throw new Error(`Federation cells ${atlasCellKey(a)} and ${atlasCellKey(b)} do not share one side.`);
}

export function connectionSidesForCells(
  a: AtlasGridPoint,
  b: AtlasGridPoint
): { worldASide: AtlasSide; worldBSide: AtlasSide } {
  const worldASide = atlasSideBetween(a, b);
  return { worldASide, worldBSide: OPPOSITE_ATLAS_SIDE[worldASide] };
}

/**
 * Free federation-grid cells sharing one edge with any occupied cell, in a
 * stable north-to-south then west-to-east order. Cells outside the V1
 * federation grid are never offered.
 */
export function availableFederationCells(occupied: Iterable<AtlasGridPoint>): AtlasGridPoint[] {
  const occupiedKeys = new Set<string>();
  const points: AtlasGridPoint[] = [];
  for (const point of occupied) {
    assertAtlasPoint(point, "Federation cell");
    const key = atlasCellKey(point);
    if (occupiedKeys.has(key)) continue;
    occupiedKeys.add(key);
    points.push(point);
  }
  const candidates = new Map<string, AtlasGridPoint>();
  for (const point of points) {
    for (const side of ATLAS_SIDES) {
      const candidate = atlasNeighbor(point, side);
      if (!isWithinFederationGrid(candidate)) continue;
      const key = atlasCellKey(candidate);
      if (!occupiedKeys.has(key)) candidates.set(key, candidate);
    }
  }
  return [...candidates.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * A coordinate the database does not hold is not a placement.
 *
 * `foldNameToAtlasCell` and `withAtlasGridPlacements` used to live here. They
 * hashed a World's name onto the 10 x 10 board whenever its stored position sat
 * outside it, so the map drew a cell that no row, signature or constraint knew
 * about. Consumers read `dcl_atlas_positions` as written; a World with no
 * stored position is listed rather than plotted.
 */

const MEMBERSHIP_TRANSITIONS: Record<MembershipStatus, readonly MembershipStatus[]> = {
  PENDING_CONNECTION: ["ACTIVE", "DISCONNECTED", "REMOVED"],
  ACTIVE: ["DISCONNECTED", "REMOVED"],
  DISCONNECTED: [],
  REMOVED: [],
};

export function canTransitionMembership(from: MembershipStatus, to: MembershipStatus): boolean {
  return MEMBERSHIP_TRANSITIONS[from].includes(to);
}

export function assertMembershipTransition(from: MembershipStatus, to: MembershipStatus): void {
  if (!canTransitionMembership(from, to)) {
    throw new Error(`Illegal federation membership transition: ${from} -> ${to}.`);
  }
}

export function deriveWorldFederationState(
  verificationStatus: WorldVerificationStatus | null,
  membershipStatus: MembershipStatus | null
): WorldFederationState {
  if (verificationStatus !== "VERIFIED") return "UNREGISTERED";
  return membershipStatus ?? "REGISTERED";
}

export function atlasWorldByName(
  snapshot: PublicAtlasSnapshot,
  worldName: string
): PublicAtlasWorld | null {
  const name = normalizeDclWorldName(worldName) ?? worldName.trim().toLowerCase();
  if (!name) return null;
  return snapshot.worlds.find((world) => world.worldName.trim().toLowerCase() === name) ?? null;
}

/** Atlas row exists and verificationStatus is VERIFIED. Wallet NAME ownership is a separate fact. */
export function isAtlasWorldVerified(snapshot: PublicAtlasSnapshot, worldName: string): boolean {
  return atlasWorldByName(snapshot, worldName)?.verificationStatus === "VERIFIED";
}

export function membershipAgeMs(joinedAt: string | number | Date, now: string | number | Date = Date.now()): number {
  const start = new Date(joinedAt).getTime();
  const end = new Date(now).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Membership age needs valid timestamps.");
  return Math.max(0, end - start);
}

const ROLE_CAPABILITIES: Record<WorldCollaboratorRole, readonly BuilderCapability[]> = {
  OWNER: ["view", "edit", "save", "publish", "manage_collaborators", "manage_federation"],
  BUILDER: ["view", "edit", "save"],
  PUBLISHER: ["view", "publish"],
  VIEWER: ["view"],
};

export interface BuilderEntitlementInput {
  membershipStatus: MembershipStatus | null;
  worldAuthority: boolean;
  collaboratorRole: WorldCollaboratorRole | null;
  capability: BuilderCapability;
}

export interface BuilderEntitlementDecision {
  allowed: boolean;
  effectiveRole: WorldCollaboratorRole | null;
  reason: "active_owner" | "active_collaborator" | "membership_inactive" | "role_missing" | "capability_denied";
}

export function resolveBuilderEntitlement(input: BuilderEntitlementInput): BuilderEntitlementDecision {
  if (input.membershipStatus !== "ACTIVE") {
    return { allowed: false, effectiveRole: null, reason: "membership_inactive" };
  }
  const role: WorldCollaboratorRole | null = input.worldAuthority ? "OWNER" : input.collaboratorRole;
  if (!role) return { allowed: false, effectiveRole: null, reason: "role_missing" };
  if (!ROLE_CAPABILITIES[role].includes(input.capability)) {
    return { allowed: false, effectiveRole: role, reason: "capability_denied" };
  }
  return {
    allowed: true,
    effectiveRole: role,
    reason: role === "OWNER" ? "active_owner" : "active_collaborator",
  };
}

/**
 * How long a border proposal stays signable.
 *
 * A proposal that nobody answers used to sit PARTIALLY_SIGNED for ever, holding
 * the pair's slot in `dcl_atlas_connections_live_pair_idx` and the joining
 * World's one live membership, so its author could never ask again.
 */
export const BORDER_PROPOSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Whether a proposal is past its signing window, given when it was made. */
export function isProposalExpired(proposedAt: string, now: number = Date.now()): boolean {
  const started = Date.parse(proposedAt);
  return Number.isFinite(started) && now - started > BORDER_PROPOSAL_TTL_MS;
}

export function proposalExpiresAt(proposedAt: string): string | null {
  const started = Date.parse(proposedAt);
  return Number.isFinite(started) ? new Date(started + BORDER_PROPOSAL_TTL_MS).toISOString() : null;
}

export const ATLAS_ACTIONS = [
  "VERIFY_WORLD",
  "CREATE_FEDERATION",
  "JOIN_FEDERATION",
  "CONFIRM_BORDER",
  // A proposal had exactly one way out: being confirmed. These two give the
  // recipient and the author each a way to end one, so a pending row is not a
  // dead end for both wallets.
  "DECLINE_BORDER",
  "WITHDRAW_BORDER_REQUEST",
  "LEAVE_FEDERATION",
  "END_BORDER",
] as const;
export type AtlasAction = (typeof ATLAS_ACTIONS)[number];

export interface AtlasActionMessageInput {
  action: AtlasAction;
  worldName: string;
  federationId?: string | null;
  counterpartyWorld?: string | null;
  proposalDigest?: string | null;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  chainId: number;
  domain: string;
}

export interface ParsedAtlasActionMessage extends AtlasActionMessageInput {
  worldName: string;
  federationId: string | null;
  counterpartyWorld: string | null;
  proposalDigest: string | null;
}

const ACTION_MESSAGE_HEADER = "Federated Worlds / Atlas V1";

function actionValue(value: string | null | undefined): string {
  return value?.trim() || "-";
}

/** Byte-stable EIP-191/personal_sign message for durable Atlas actions. */
export function buildAtlasActionMessage(input: AtlasActionMessageInput): string {
  const worldName = normalizeDclWorldName(input.worldName);
  if (!worldName) throw new Error("Atlas actions require a canonical Decentraland World name.");
  const counterparty = input.counterpartyWorld
    ? normalizeDclWorldName(input.counterpartyWorld)
    : null;
  if (input.counterpartyWorld && !counterparty) throw new Error("Invalid counterparty World name.");
  if (!ATLAS_ACTIONS.includes(input.action)) throw new Error("Unknown Atlas action.");
  if (!input.nonce.trim() || /[\r\n]/.test(input.nonce)) throw new Error("Atlas action nonce is invalid.");
  if (!Number.isSafeInteger(input.issuedAt) || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= input.issuedAt) {
    throw new Error("Atlas action timestamps are invalid.");
  }
  if (!Number.isSafeInteger(input.chainId) || input.chainId < 1) throw new Error("Atlas action chainId is invalid.");
  const domain = input.domain.trim().toLowerCase();
  if (!domain || /[\s\r\n]/.test(domain)) throw new Error("Atlas action domain is invalid.");
  return [
    ACTION_MESSAGE_HEADER,
    `action:${input.action}`,
    `world:${worldName}`,
    `federation:${actionValue(input.federationId)}`,
    `counterparty:${actionValue(counterparty)}`,
    `proposal:${actionValue(input.proposalDigest)}`,
    `nonce:${input.nonce.trim()}`,
    `issuedAt:${input.issuedAt}`,
    `expiresAt:${input.expiresAt}`,
    `chainId:${input.chainId}`,
    `domain:${domain}`,
  ].join("\n");
}

export function parseAtlasActionMessage(message: string): ParsedAtlasActionMessage | null {
  const lines = message.split("\n");
  if (lines.length !== 11 || lines[0] !== ACTION_MESSAGE_HEADER) return null;
  const values = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const split = line.indexOf(":");
    if (split <= 0) return null;
    const key = line.slice(0, split);
    const value = line.slice(split + 1);
    if (values.has(key)) return null;
    values.set(key, value);
  }
  const action = values.get("action") as AtlasAction | undefined;
  const worldName = normalizeDclWorldName(values.get("world") ?? "");
  const counterpartyRaw = values.get("counterparty") ?? "-";
  const counterpartyWorld = counterpartyRaw === "-" ? null : normalizeDclWorldName(counterpartyRaw);
  const issuedAt = Number(values.get("issuedAt"));
  const expiresAt = Number(values.get("expiresAt"));
  const chainId = Number(values.get("chainId"));
  const nonce = values.get("nonce") ?? "";
  const domain = values.get("domain") ?? "";
  if (!action || !ATLAS_ACTIONS.includes(action) || !worldName || (counterpartyRaw !== "-" && !counterpartyWorld)) return null;
  const parsed: ParsedAtlasActionMessage = {
    action,
    worldName,
    federationId: values.get("federation") === "-" ? null : values.get("federation") ?? null,
    counterpartyWorld,
    proposalDigest: values.get("proposal") === "-" ? null : values.get("proposal") ?? null,
    nonce,
    issuedAt,
    expiresAt,
    chainId,
    domain,
  };
  try {
    if (buildAtlasActionMessage(parsed) !== message) return null;
  } catch {
    return null;
  }
  return parsed;
}
