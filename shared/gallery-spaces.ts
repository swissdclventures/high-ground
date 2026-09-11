/**
 * Named galleries: a name mapped to one building + floor, then a slot count.
 *
 * The builder owns this map. The gallery site owns which NFT fills each slot.
 * Kept beside `gallery-contract.ts` so that file can keep doing artwork/live
 * document work without this layout concern growing into it.
 */
import {
  createGalleryPiece,
  defaultGalleryConfig as defaultGalleryConfigBase,
  normalizeGalleryConfig as normalizeGalleryConfigBase,
  type GalleryConfig,
  type GalleryPiece,
} from "./gallery-contract";

export type GallerySpaceLayout = "walls" | "manual";
export const DEFAULT_GALLERY_SLOT_COUNT = 4;
export const MAX_GALLERY_SLOT_COUNT = 24;

export interface GallerySpace {
  id: string;
  name: string;
  buildingId: string | null;
  scope?: "building" | "site";
  floorIndex: number;
  slotCount: number;
  layout: GallerySpaceLayout;
}

export interface GalleryWallSlot {
  name: string;
  centerX: number;
  centerZ: number;
  rotationY: number;
  width: number;
  height: number;
  heightAboveFloor: number;
}

declare module "./gallery-contract" {
  interface GalleryPiece {
    spaceId?: string | null;
  }
  interface GalleryConfig {
    spaces?: GallerySpace[];
  }
}

export function nextGallerySpaceId(spaces: readonly { id: string }[]): string {
  let n = spaces.length + 1;
  const taken = new Set(spaces.map((space) => space.id));
  while (taken.has(`gal_${n}`)) n++;
  return `gal_${n}`;
}

export function nextGalleryPieceId(pieces: readonly { id: string }[]): string {
  let n = pieces.length + 1;
  const taken = new Set(pieces.map((piece) => piece.id));
  while (taken.has(`art_${n}`)) n++;
  return `art_${n}`;
}

export function createGallerySpace(
  id: string,
  partial: Partial<Omit<GallerySpace, "id">> = {}
): GallerySpace {
  return {
    id,
    name: (partial.name ?? "Gallery").trim().slice(0, 80) || "Gallery",
    buildingId: partial.buildingId ?? null,
    scope: partial.scope === "site" ? "site" : "building",
    floorIndex: Math.max(0, Math.round(partial.floorIndex ?? 0)),
    slotCount: Math.max(
      0,
      Math.min(MAX_GALLERY_SLOT_COUNT, Math.round(partial.slotCount ?? DEFAULT_GALLERY_SLOT_COUNT))
    ),
    layout: partial.layout === "manual" ? "manual" : "walls",
  };
}

export function spaceKey(
  buildingId: string | null,
  floorIndex: number,
  scope: "building" | "site" = "building"
): string {
  return `${scope}::${buildingId ?? ""}::${Math.max(0, floorIndex)}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, max);
}

function finite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeGallerySpace(raw: unknown): GallerySpace | null {
  if (!record(raw)) return null;
  const id = text(raw.id, "", 64);
  if (!id) return null;
  return createGallerySpace(id, {
    name: text(raw.name, "Gallery", 80),
    buildingId: text(raw.buildingId, "", 64) || null,
    scope: raw.scope === "site" ? "site" : "building",
    floorIndex: finite(raw.floorIndex, 0),
    slotCount: finite(raw.slotCount, DEFAULT_GALLERY_SLOT_COUNT),
    layout: raw.layout === "manual" ? "manual" : "walls",
  });
}

function inferGallerySpaces(pieces: readonly GalleryPiece[]): GallerySpace[] {
  const groups = new Map<string, GalleryPiece[]>();
  for (const piece of pieces) {
    const key = spaceKey(
      piece.placement.buildingId,
      piece.placement.floorIndex,
      piece.placement.scope
    );
    const list = groups.get(key) ?? [];
    list.push(piece);
    groups.set(key, list);
  }
  const spaces: GallerySpace[] = [];
  let i = 1;
  for (const group of groups.values()) {
    const first = group[0]!;
    spaces.push(
      createGallerySpace(`gal_${i}`, {
        name: groups.size === 1 ? "Gallery 1" : `Gallery ${i}`,
        buildingId: first.placement.buildingId,
        scope: first.placement.scope,
        floorIndex: first.placement.floorIndex,
        slotCount: group.length,
        layout: "walls",
      })
    );
    i++;
  }
  return spaces;
}

function attachPiecesToSpaces(
  pieces: readonly GalleryPiece[],
  spaces: readonly GallerySpace[]
): GalleryPiece[] {
  if (!spaces.length) return pieces.map((piece) => ({ ...piece, spaceId: piece.spaceId ?? null }));
  const byId = new Map(spaces.map((space) => [space.id, space]));
  const byKey = new Map(
    spaces.map((space) => [spaceKey(space.buildingId, space.floorIndex, space.scope), space])
  );
  const fallback = spaces[0]!;
  return pieces.map((piece) => {
    const named = piece.spaceId ? byId.get(piece.spaceId) : undefined;
    const matched =
      named ??
      byKey.get(
        spaceKey(piece.placement.buildingId, piece.placement.floorIndex, piece.placement.scope)
      ) ??
      fallback;
    return {
      ...piece,
      spaceId: matched.id,
      placement: {
        ...piece.placement,
        buildingId: named ? piece.placement.buildingId : matched.buildingId,
        scope: named ? piece.placement.scope : matched.scope,
        floorIndex: named ? piece.placement.floorIndex : matched.floorIndex,
      },
    };
  });
}

export function piecesForSpace(
  pieces: readonly GalleryPiece[],
  spaceId: string
): GalleryPiece[] {
  return pieces.filter((piece) => piece.spaceId === spaceId);
}

export function applyWallSlotsToPieces(
  pieces: readonly GalleryPiece[],
  slots: readonly GalleryWallSlot[]
): GalleryPiece[] {
  return pieces.map((piece, index) => {
    const slot = slots[index];
    if (!slot) return piece;
    return {
      ...piece,
      name: slot.name || piece.name,
      placement: {
        ...piece.placement,
        centerX: slot.centerX,
        centerZ: slot.centerZ,
        rotationY: slot.rotationY,
        width: slot.width,
        height: slot.height,
        heightAboveFloor: slot.heightAboveFloor,
      },
    };
  });
}

export function resizeSpacePieces(
  pieces: readonly GalleryPiece[],
  space: GallerySpace,
  slots?: readonly GalleryWallSlot[]
): GalleryPiece[] {
  const mine = piecesForSpace(pieces, space.id);
  const others = pieces.filter((piece) => piece.spaceId !== space.id);
  const nextMine: GalleryPiece[] = mine.slice(0, space.slotCount);
  while (nextMine.length < space.slotCount) {
    const n = nextMine.length + 1;
    nextMine.push({
      ...createGalleryPiece(nextGalleryPieceId([...others, ...nextMine]), {
        name: `${space.name} · ${n}`,
        placement: {
          scope: space.scope,
          buildingId: space.buildingId,
          floorIndex: space.floorIndex,
        },
      }),
      spaceId: space.id,
    });
  }
  const placed =
    space.scope === "site"
      ? nextMine.map((piece, index) => ({
          ...piece,
          spaceId: space.id,
          placement: {
            ...piece.placement,
            scope: "site" as const,
            buildingId: null,
            floorIndex: 0,
            centerX: (index - (nextMine.length - 1) / 2) * 2.25,
            centerZ: 0,
            rotationY: 0,
          },
        }))
      : space.layout === "walls" && slots && slots.length
      ? applyWallSlotsToPieces(nextMine, slots)
      : nextMine.map((piece) => ({
          ...piece,
          spaceId: space.id,
          placement: {
            ...piece.placement,
            scope: space.scope,
            buildingId: space.buildingId,
            floorIndex: space.floorIndex,
          },
        }));
  return [...others, ...placed];
}

export function defaultGalleryConfig(): GalleryConfig {
  return { ...defaultGalleryConfigBase(), spaces: [] };
}

export function normalizeGalleryConfig(
  partial: Partial<GalleryConfig> | null | undefined
): GalleryConfig {
  const base = normalizeGalleryConfigBase(partial);
  const rawSpaces = record(partial) && Array.isArray(partial.spaces) ? partial.spaces : [];
  const seen = new Set<string>();
  let spaces: GallerySpace[] = [];
  for (const raw of rawSpaces) {
    const space = normalizeGallerySpace(raw);
    if (!space || seen.has(space.id)) continue;
    seen.add(space.id);
    spaces.push(space);
  }
  if (spaces.length === 0 && base.pieces.length > 0) spaces = inferGallerySpaces(base.pieces);
  const attached = attachPiecesToSpaces(base.pieces, spaces);
  return { ...base, spaces, pieces: attached };
}
