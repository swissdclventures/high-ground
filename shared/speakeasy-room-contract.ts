/**
 * Speakeasy room — the private-conversation layer.
 *
 * WHAT THIS IS NOT: voice. A Decentraland scene cannot touch voice at all. The
 * whole SDK7 component set (see @dcl/protocol .../sdk/components) has no voice
 * component; voice lives in the kernel's comms layer (rfc4), which scene code
 * cannot reach — no microphone, no WebRTC, no per-listener routing. The only
 * lever a scene has is scene.json's `featureToggles.voiceChat`, an on/off switch
 * for Decentraland's own proximity voice.
 *
 * So privacy here is a COMMS-ISOLATION and ACCESS problem, not an audio one:
 *   1. Deploy the room to its own World — one World is one comms island, so only
 *      people who enter that realm are in earshot. That is the real mechanism.
 *   2. Gate who may enter (the Access rule / zones already do this).
 *   3. This contract: the room's own etiquette layer — where the group gathers,
 *      what arrivals are told, and what the exit asks for.
 *
 * There is NO head-count here any more. The room used to carry `capacity`,
 * `enforceCapacity`, a `doorSign` reading OPEN n/N and a `fullNote`, and because
 * `enforceCapacity` defaulted to ON, a published lounge quietly limited itself to
 * six people and teleported the newest arrival back outside. A conversation room
 * does not need a bouncer, and the one it had was wrong. Old published JSON may
 * still contain those keys; they are simply ignored.
 *
 * `circleRadius` is a GATHERING marker, not a claim about Decentraland's voice
 * falloff. The client's attenuation curve is not published and we do not model
 * it; the ring says "stand here to be in the conversation", which is advice a
 * host would give anyway.
 */

export const SPEAKEASY_ROOM_VERSION = 1 as const;

/**
 * Storey height of the lounge building the app places on the spawn parcel.
 *
 * Shared so the editor's building config and the runtime's exit barrier agree on
 * one number. They used to be independent, which is how a 6.3 m barrier ended up
 * standing in front of a differently sized room.
 */
export const SPEAKEASY_BOOTH_STORY_HEIGHT_M = 6.4;

export interface SpeakeasyVendingPrototypeConfig {
  /** Physical one-item machine placed inside the lounge. */
  enabled: boolean;
  /** Display name only until Marketplace purchase wiring is enabled. */
  itemName: string;
  /** Optional display price. Null means the prototype charges no MANA. */
  priceMana: number | null;
}

export interface SpeakeasyRoomConfig {
  version: typeof SPEAKEASY_ROOM_VERSION;
  /** Off for every ordinary building — only the Speakeasy template turns it on. */
  enabled: boolean;
  /** Ring on the floor marking where the group gathers. */
  showCircle: boolean;
  /** Radius of that ring, metres. */
  circleRadius: number;
  /** Shown once, to each visitor, a moment after they arrive. Empty = silent. */
  arrivalNote: string;
  /**
   * Shared GateRule id that unlocks the booth exit into the world.
   * Points at a library rule on `social.gates` (nft_collection, hold ANY).
   * Never set as `buildingGateRuleId` — that would eject buyers from the booth.
   * Null = no exit gate (open world).
   */
  worldGateRuleId: string | null;
  /** One-item vending-machine prototype inside the lounge. */
  vending: SpeakeasyVendingPrototypeConfig;
}

export function defaultSpeakeasyRoomConfig(): SpeakeasyRoomConfig {
  return {
    version: SPEAKEASY_ROOM_VERSION,
    enabled: false,
    showCircle: true,
    circleRadius: 4,
    arrivalNote:
      "Voice here is proximity-based — stand close to be heard, step outside to leave the conversation.",
    worldGateRuleId: null,
    vending: {
      enabled: false,
      itemName: "Dance Bug",
      priceMana: null,
    },
  };
}

function finite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function text(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  // "" is a deliberate silence, not a missing value — keep it rather than
  // resurrecting the default the author just cleared.
  return trimmed.slice(0, max);
}

export function normalizeSpeakeasyRoomConfig(
  partial: Partial<SpeakeasyRoomConfig> | null | undefined
): SpeakeasyRoomConfig {
  const base = defaultSpeakeasyRoomConfig();
  const vending = partial?.vending;
  const priceMana =
    typeof vending?.priceMana === "number" && Number.isFinite(vending.priceMana)
      ? clamp(vending.priceMana, 0, 1_000_000, 0)
      : null;
  return {
    version: SPEAKEASY_ROOM_VERSION,
    enabled: Boolean(partial?.enabled),
    showCircle: partial?.showCircle !== false,
    circleRadius: clamp(partial?.circleRadius, 1, 24, base.circleRadius),
    arrivalNote: text(partial?.arrivalNote, base.arrivalNote, 220),
    worldGateRuleId:
      typeof partial?.worldGateRuleId === "string" && partial.worldGateRuleId.trim()
        ? partial.worldGateRuleId.trim()
        : null,
    vending: {
      enabled: vending?.enabled === true,
      itemName: text(vending?.itemName, base.vending.itemName, 48) || base.vending.itemName,
      priceMana,
    },
  };
}
