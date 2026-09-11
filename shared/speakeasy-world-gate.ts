/**
 * Speakeasy world-exit gate — reuses the shared GateRule library.
 *
 * Product shape:
 *   - Landing booth / Speakeasy room stays OPEN (anyone can enter to buy).
 *   - Leaving into the world requires holding ANY collection on this rule.
 *   - Dance Bug is the first seeded collection; owners add more contracts later.
 *
 * Do NOT set this rule as `buildingGateRuleId`. The Step-1 / standalone building
 * gate ejects non-holders from inside the footprint, which would bounce buyers
 * out of the booth before they can purchase. This rule is a library gate that
 * Speakeasy's one-way exit barrier (and any zone binding) evaluates directly.
 */

import {
  gateContracts,
  normalizeGateRule,
  type GateRule,
  type SocialSurfaceConfig,
} from "./social-surface-contract";

/** Stable id — zones can bind the same rule later without a second definition. */
export const SPEAKEASY_WORLD_GATE_ID = "gate_speakeasy_world";

/** Swissverse Dance Bug collection (Polygon). Hold any item = world access. */
export const DANCE_BUG_COLLECTION_CONTRACT =
  "0x33824a49caaccc4f3bfcb1a53497f386e4ad7522";

export const DANCE_BUG_ITEM_URN =
  `urn:decentraland:matic:collections-v2:${DANCE_BUG_COLLECTION_CONTRACT}:0`;

/** Equipped URNs often append `:version` after the item id — prefix-match, don't require exact. */
export function wearableUrnEquipped(worn: readonly string[] | undefined, needed: string): boolean {
  if (!worn?.length) return false;
  const n = needed.toLowerCase();
  return worn.some((item) => {
    const x = item.toLowerCase();
    return x === n || x.startsWith(`${n}:`);
  });
}

/** True if any equipped wearable belongs to this collection contract. */
export function wearableCollectionEquipped(
  worn: readonly string[] | undefined,
  contract: string
): boolean {
  if (!worn?.length) return false;
  const c = contract.toLowerCase();
  return worn.some((item) => item.toLowerCase().includes(c));
}

/**
 * The catalyst's square render of the item — a cutout PNG on transparency, so it
 * drops straight onto a dark panel with no card behind it. Same path the L1 museum
 * uses for its 438 exhibits; nothing is stored in the scene.
 */
export const DANCE_BUG_THUMBNAIL_URL =
  `https://peer.decentraland.org/lambdas/collections/contents/${DANCE_BUG_ITEM_URN}/thumbnail`;

export const DANCE_BUG_MARKETPLACE_URL =
  `https://decentraland.org/marketplace/contracts/${DANCE_BUG_COLLECTION_CONTRACT}/items/0`;

export const SPEAKEASY_WORLD_GATE_DENIED =
  "Own a required collection wearable to leave the Speakeasy into the world.";

export function defaultSpeakeasyWorldGateContracts(): string[] {
  return [DANCE_BUG_COLLECTION_CONTRACT];
}

export function speakeasyWorldGateRule(
  social: SocialSurfaceConfig | null | undefined,
  ruleId: string | null | undefined = SPEAKEASY_WORLD_GATE_ID
): GateRule | null {
  if (!social || !ruleId) return null;
  const rule = social.gates.find((g) => g.id === ruleId);
  if (!rule || rule.mode === "open") return null;
  return rule;
}

/**
 * Upsert the Speakeasy world-exit gate on a social config. Never touches
 * `buildingGateRuleId` or `enabled` — booth entry stays open.
 */
export function withSpeakeasyWorldGate(
  social: SocialSurfaceConfig,
  contracts: string[] = defaultSpeakeasyWorldGateContracts(),
  ruleId: string = SPEAKEASY_WORLD_GATE_ID
): SocialSurfaceConfig {
  const list = gateContracts({ contracts });
  const seeded = list.length ? list : defaultSpeakeasyWorldGateContracts();
  const rule = normalizeGateRule({
    id: ruleId,
    mode: "nft_collection",
    chain: "polygon",
    contracts: seeded,
    match: "any",
    deniedMessage: SPEAKEASY_WORLD_GATE_DENIED,
  });
  const others = social.gates.filter((g) => g.id !== ruleId);
  return { ...social, gates: [...others, rule] };
}
