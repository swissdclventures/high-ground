/**
 * Universe overlay — Federation (3x3 Worlds) inside Atlas (10x10 Federations).
 *
 * Swissverse map, not a Decentraland API. A slot stores a DCL World name
 * (`name.dcl.eth`). Claiming by wallet signature is later; v0 is admin assign.
 */

export const FEDERATION_SIZE = 3 as const;
export const ATLAS_SIZE = 10 as const;

export const UNIVERSE_OVERLAY_VERSION = 1 as const;
export const SWISSVERSE_FEDERATION_ID = "fed-4-4" as const;
export const SWISSVERSE_FEDERATION_NAME = "Swissverse" as const;
export const SWISSVERSE_ATLAS_X = 4 as const;
export const SWISSVERSE_ATLAS_Y = 4 as const;

export interface FederationWorldSlot {
  x: number;
  y: number;
  worldName: string;
  assignedAt: number;
}

export interface FederationRecord {
  id: string;
  name: string;
  atlasX: number;
  atlasY: number;
  worlds: FederationWorldSlot[];
}

export interface UniverseOverlay {
  version: typeof UNIVERSE_OVERLAY_VERSION;
  currentFederationId: string;
  federations: FederationRecord[];
}

export function inFederationBounds(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < FEDERATION_SIZE && y < FEDERATION_SIZE;
}

export function inAtlasBounds(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < ATLAS_SIZE && y < ATLAS_SIZE;
}

export function federationIdAt(atlasX: number, atlasY: number): string {
  return `fed-${atlasX}-${atlasY}`;
}

/** Accept swissverse or swissverse.dcl.eth, trim/case-fold. Reject empty junk. */
export function normalizeDclWorldName(raw: string): string | null {
  let n = raw.trim().toLowerCase();
  if (!n) return null;
  if (!n.includes(".")) n = `${n}.dcl.eth`;
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(n)) return null;
  return n;
}

export function emptyFederation(atlasX: number, atlasY: number, name: string): FederationRecord {
  return {
    id: federationIdAt(atlasX, atlasY),
    name: name.trim() || `Federation ${atlasX},${atlasY}`,
    atlasX,
    atlasY,
    worlds: [],
  };
}

export function defaultUniverseOverlay(): UniverseOverlay {
  return {
    version: UNIVERSE_OVERLAY_VERSION,
    currentFederationId: SWISSVERSE_FEDERATION_ID,
    federations: [
      emptyFederation(SWISSVERSE_ATLAS_X, SWISSVERSE_ATLAS_Y, SWISSVERSE_FEDERATION_NAME),
    ],
  };
}

export function federationById(overlay: UniverseOverlay, id: string): FederationRecord | undefined {
  return overlay.federations.find((row) => row.id === id);
}

export function federationAtAtlas(overlay: UniverseOverlay, x: number, y: number): FederationRecord | undefined {
  return overlay.federations.find((row) => row.atlasX === x && row.atlasY === y);
}

export function worldAtFederation(fed: FederationRecord, x: number, y: number): FederationWorldSlot | undefined {
  return fed.worlds.find((slot) => slot.x === x && slot.y === y);
}

/** Where a DCL World sits on the overlay, if assigned to any federation slot. */
export function worldSlotInOverlay(
  overlay: UniverseOverlay,
  worldName: string
): { federation: FederationRecord; x: number; y: number } | undefined {
  const name = normalizeDclWorldName(worldName);
  if (!name) return undefined;
  for (const federation of overlay.federations) {
    const slot = federation.worlds.find((row) => row.worldName === name);
    if (slot) return { federation, x: slot.x, y: slot.y };
  }
  return undefined;
}

export function assignWorldToFederation(
  overlay: UniverseOverlay,
  federationId: string,
  x: number,
  y: number,
  worldName: string | null,
  now = Date.now()
): UniverseOverlay {
  if (!inFederationBounds(x, y)) throw new Error(`World slot ${x},${y} is outside the 3x3 federation.`);
  const federations = overlay.federations.map((fed) => {
    if (fed.id !== federationId) return fed;
    const worlds = fed.worlds.filter((slot) => !(slot.x === x && slot.y === y));
    if (worldName) {
      const name = normalizeDclWorldName(worldName) ?? worldName.trim().toLowerCase();
      worlds.push({ x, y, worldName: name, assignedAt: now });
    }
    return { ...fed, worlds };
  });
  return { ...overlay, federations };
}

export function placeFederationOnAtlas(
  overlay: UniverseOverlay,
  atlasX: number,
  atlasY: number,
  name: string
): UniverseOverlay {
  if (!inAtlasBounds(atlasX, atlasY)) throw new Error(`Atlas slot ${atlasX},${atlasY} is outside the 10x10 map.`);
  const id = federationIdAt(atlasX, atlasY);
  const next = emptyFederation(atlasX, atlasY, name);
  const federations = overlay.federations.filter((fed) => !(fed.atlasX === atlasX && fed.atlasY === atlasY));
  federations.push(next);
  return { ...overlay, currentFederationId: id, federations };
}

export function clearFederationOnAtlas(overlay: UniverseOverlay, atlasX: number, atlasY: number): UniverseOverlay {
  const federations = overlay.federations.filter((fed) => !(fed.atlasX === atlasX && fed.atlasY === atlasY));
  const stillCurrent = federations.some((fed) => fed.id === overlay.currentFederationId);
  return {
    ...overlay,
    federations,
    currentFederationId: stillCurrent ? overlay.currentFederationId : SWISSVERSE_FEDERATION_ID,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function parseUniverseOverlay(raw: unknown): UniverseOverlay {
  const o = asRecord(raw);
  if (!o || o.version !== UNIVERSE_OVERLAY_VERSION || !Array.isArray(o.federations)) {
    return defaultUniverseOverlay();
  }
  const federations: FederationRecord[] = [];
  for (const row of o.federations) {
    const fed = asRecord(row);
    if (!fed) continue;
    const atlasX = Number(fed.atlasX);
    const atlasY = Number(fed.atlasY);
    if (!inAtlasBounds(atlasX, atlasY)) continue;
    const id = typeof fed.id === "string" && fed.id.trim() ? fed.id.trim() : federationIdAt(atlasX, atlasY);
    const name = typeof fed.name === "string" && fed.name.trim() ? fed.name.trim() : `Federation ${atlasX},${atlasY}`;
    const worlds: FederationWorldSlot[] = [];
    if (Array.isArray(fed.worlds)) {
      for (const slotRaw of fed.worlds) {
        const slot = asRecord(slotRaw);
        if (!slot) continue;
        const x = Number(slot.x);
        const y = Number(slot.y);
        if (!inFederationBounds(x, y)) continue;
        const worldName =
          typeof slot.worldName === "string" ? normalizeDclWorldName(slot.worldName) : null;
        if (!worldName) continue;
        worlds.push({
          x,
          y,
          worldName,
          assignedAt: typeof slot.assignedAt === "number" ? slot.assignedAt : 0,
        });
      }
    }
    federations.push({ id, name, atlasX, atlasY, worlds });
  }
  if (!federations.length) return defaultUniverseOverlay();
  const current =
    typeof o.currentFederationId === "string" && federations.some((fed) => fed.id === o.currentFederationId)
      ? o.currentFederationId
      : federations[0]!.id;
  return { version: UNIVERSE_OVERLAY_VERSION, currentFederationId: current, federations };
}
