/**
 * Vendor app — stationed NPC shopfront beside the Dance Bug machine.
 *
 * THE LAW: an NPC is a costume. They cannot sign, hold MANA, or own NFTs.
 * Every transfer uses the Swissverse treasury wallet (same as donations,
 * credits, and the claw shop). The avatar is the shopfront; the visitor
 * signs every tx.
 *
 * Three jobs, configured per NPC:
 *   sell[]   — listings the vendor sells (CollectionStore mint today)
 *   buy[]    — collections the vendor will take (Dance Bug at buybackBps)
 *   accept[] — gifts they will take (official Decentraland assets + MANA + ETH)
 *
 * Buyback payout (MANA back to the visitor) is configured here as buybackBps
 * and paid by the Builder buyback API after the NFT transfer confirms.
 */

import {
  DCL_ESTATE_REGISTRY,
  DCL_LAND_REGISTRY,
  isEvmAddress,
  isOfficialDclLandContract,
} from "./dcl-exchange";

export { DCL_ESTATE_REGISTRY, DCL_LAND_REGISTRY, isOfficialDclLandContract };

export const VENDOR_VERSION = 1 as const;

/** Same address the claw shop, credits payee, and Speakeasy admin already use. */
export const SWISSVERSE_TREASURY_WALLET =
  "0x23be90335e79d3245615985d91f69814f98a0fab";

/** Swissverse Dance Bug collection (Polygon). Same as shared/speakeasy-world-gate.ts. */
export const VENDOR_DANCE_BUG_COLLECTION =
  "0x33824a49caaccc4f3bfcb1a53497f386e4ad7522";
export const VENDOR_DANCE_BUG_URN =
  `urn:decentraland:matic:collections-v2:${VENDOR_DANCE_BUG_COLLECTION}:0`;

export type VendorAcceptKind = "wearable" | "emote" | "mana" | "eth" | "land";

export const VENDOR_ACCEPT_KINDS: readonly VendorAcceptKind[] = [
  "wearable",
  "emote",
  "mana",
  "eth",
  "land",
];

export type VendorStation = "vending";

export interface VendorSellListing {
  id: string;
  name: string;
  /** Primary mint through Decentraland CollectionStore. */
  kind: "collection_mint";
  urn: string;
}

export interface VendorBuyRule {
  id: string;
  name: string;
  /** Polygon collections-v2 contract the vendor will take. */
  contract: string;
  /** Basis points of the live mint price shown as the offer. 5000 = half. */
  buybackBps: number;
}

export const VENDOR_BASE_AVATAR_URN = "urn:decentraland:off-chain:base-avatars:";
export const DEFAULT_VENDOR_NAME = "Vendor";
export const DEFAULT_VENDOR_ZONE_ID = "vendor_stall";
export const DEFAULT_VENDOR_BODY_SHAPE = `${VENDOR_BASE_AVATAR_URN}BaseMale`;

/** Shopkeeper look — not the plaza casual jacket. Override from Apps ▸ Vendor. */
export const DEFAULT_VENDOR_WEARABLES: readonly string[] = [
  `${VENDOR_BASE_AVATAR_URN}eyes_00`,
  `${VENDOR_BASE_AVATAR_URN}eyebrows_00`,
  `${VENDOR_BASE_AVATAR_URN}mouth_00`,
  `${VENDOR_BASE_AVATAR_URN}casual_hair_01`,
  `${VENDOR_BASE_AVATAR_URN}green_hoodie`,
  `${VENDOR_BASE_AVATAR_URN}brown_pants`,
  `${VENDOR_BASE_AVATAR_URN}sport_black_shoes`,
];

/** Old Exchange default sweater — remap a lone leftover to the shopkeeper hoodie. */
const LEGACY_DEFAULT_SWEATER = `${VENDOR_BASE_AVATAR_URN}blue_star_sweater`;

export interface VendorNpcConfig {
  enabled: boolean;
  name: string;
  wallet: string;
  station: VendorStation;
  /** Host floor_zone id — vendor acts only inside this disc. Default vendor_stall. */
  zoneId: string | null;
  bodyShape: string;
  wearables: string[];
  sell: VendorSellListing[];
  buy: VendorBuyRule[];
  accept: VendorAcceptKind[];
}

/** @deprecated Prefer VendorNpcConfig — kept for call sites mid-migration. */
export type VendorConfig = VendorNpcConfig;

export interface VendorAppConfig {
  enabled: boolean;
  npc: VendorNpcConfig;
}

export const DEFAULT_MANA_GIFT_AMOUNTS = [10, 50, 100, 250] as const;
export const DEFAULT_ETH_GIFT_AMOUNTS = [0.01, 0.05, 0.1] as const;

export function isVendorAcceptKind(value: unknown): value is VendorAcceptKind {
  return typeof value === "string" && VENDOR_ACCEPT_KINDS.includes(value as VendorAcceptKind);
}

export function defaultDanceBugSellListing(): VendorSellListing {
  return {
    id: "dance-bug",
    name: "Dance Bug",
    kind: "collection_mint",
    urn: VENDOR_DANCE_BUG_URN,
  };
}

export function defaultDanceBugBuyRule(): VendorBuyRule {
  return {
    id: "dance-bug",
    name: "Dance Bug",
    contract: VENDOR_DANCE_BUG_COLLECTION,
    buybackBps: 5000,
  };
}

export function defaultVendorNpcConfig(): VendorNpcConfig {
  return {
    enabled: true,
    name: DEFAULT_VENDOR_NAME,
    wallet: SWISSVERSE_TREASURY_WALLET,
    station: "vending",
    zoneId: DEFAULT_VENDOR_ZONE_ID,
    bodyShape: DEFAULT_VENDOR_BODY_SHAPE,
    wearables: [...DEFAULT_VENDOR_WEARABLES],
    sell: [defaultDanceBugSellListing()],
    buy: [defaultDanceBugBuyRule()],
    accept: [...VENDOR_ACCEPT_KINDS],
  };
}

/** @deprecated Prefer defaultVendorNpcConfig. */
export function defaultVendorConfig(): VendorNpcConfig {
  return defaultVendorNpcConfig();
}

export function defaultVendorAppConfig(): VendorAppConfig {
  return {
    enabled: false,
    npc: defaultVendorNpcConfig(),
  };
}

/** Bag / panel title from the pickable vendor name. */
export function vendorBagTitle(name: string): string {
  const raw = name.trim() || DEFAULT_VENDOR_NAME;
  return raw.toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(raw: unknown, fallback: string, max: number): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim().slice(0, max);
  return trimmed || fallback;
}

/**
 * Empty / "Swissverse" / short "Ve" (old Exchange default) → Vendor.
 * Custom stall names are kept.
 */
function vendorDisplayName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim().slice(0, 32);
  if (!trimmed || /^swissverse$/i.test(trimmed) || /^ve$/i.test(trimmed)) return fallback;
  return trimmed;
}

function normalizeBodyShape(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const lower = trimmed.toLowerCase();
  if (lower === "female" || lower.endsWith(":basefemale")) {
    return `${VENDOR_BASE_AVATAR_URN}BaseFemale`;
  }
  if (lower === "male" || lower.endsWith(":basemale")) {
    return `${VENDOR_BASE_AVATAR_URN}BaseMale`;
  }
  return /^urn:decentraland:/i.test(trimmed) ? trimmed : fallback;
}

function normalizeOutfitUrns(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const urn = item.trim();
    if (!/^urn:decentraland:[a-z0-9-]+:/i.test(urn)) continue;
    const key = urn.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(urn);
  }
  // Lone leftover from the old Exchange default sweater → full shopkeeper look.
  if (out.length === 1 && out[0]!.toLowerCase() === LEGACY_DEFAULT_SWEATER.toLowerCase()) {
    return fallback;
  }
  return out.length ? out : fallback;
}

function clampBps(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10000, Math.round(n)));
}

function normalizeSellListing(raw: unknown, fallbackId: string): VendorSellListing | null {
  if (!isRecord(raw)) return null;
  const urn = typeof raw.urn === "string" ? raw.urn.trim() : "";
  if (!urn.toLowerCase().includes("collections-v2:")) return null;
  return {
    id: text(raw.id, fallbackId, 48),
    name: text(raw.name, "Collectible", 48),
    kind: "collection_mint",
    urn,
  };
}

function normalizeBuyRule(raw: unknown, fallbackId: string): VendorBuyRule | null {
  if (!isRecord(raw)) return null;
  const contract = typeof raw.contract === "string" ? raw.contract.trim().toLowerCase() : "";
  if (!isEvmAddress(contract)) return null;
  return {
    id: text(raw.id, fallbackId, 48),
    name: text(raw.name, "Collectible", 48),
    contract,
    buybackBps: clampBps(raw.buybackBps, 5000),
  };
}

export function normalizeVendorNpcConfig(raw: unknown): VendorNpcConfig {
  const base = defaultVendorNpcConfig();
  if (!isRecord(raw)) return base;
  const wallet = typeof raw.wallet === "string" && isEvmAddress(raw.wallet.trim())
    ? raw.wallet.trim().toLowerCase()
    : base.wallet;
  const sell = Array.isArray(raw.sell)
    ? raw.sell
        .map((row, i) => normalizeSellListing(row, `sell_${i + 1}`))
        .filter((row): row is VendorSellListing => row !== null)
    : base.sell;
  const buy = Array.isArray(raw.buy)
    ? raw.buy
        .map((row, i) => normalizeBuyRule(row, `buy_${i + 1}`))
        .filter((row): row is VendorBuyRule => row !== null)
    : base.buy;
  const accept = Array.isArray(raw.accept)
    ? [...new Set(raw.accept.filter(isVendorAcceptKind))]
    : base.accept;
  return {
    enabled: raw.enabled !== false,
    name: vendorDisplayName(raw.name, base.name),
    wallet,
    station: raw.station === "vending" ? "vending" : base.station,
    zoneId:
      typeof raw.zoneId === "string" && raw.zoneId.trim()
        ? raw.zoneId.trim().slice(0, 64)
        : base.zoneId,
    bodyShape: normalizeBodyShape(raw.bodyShape, base.bodyShape),
    wearables: normalizeOutfitUrns(raw.wearables, base.wearables),
    sell: sell.length ? sell : base.sell,
    buy,
    accept: accept.length ? accept : base.accept,
  };
}

/** @deprecated Prefer normalizeVendorNpcConfig. */
export function normalizeVendorConfig(raw: unknown): VendorNpcConfig {
  return normalizeVendorNpcConfig(raw);
}

/**
 * Normalize the Vendor app row. Also accepts a legacy Exchange `vendor` object
 * so migration can copy stock without a second code path.
 */
export function normalizeVendorAppConfig(raw: unknown): VendorAppConfig {
  const base = defaultVendorAppConfig();
  if (!isRecord(raw)) return base;
  const npcRaw = isRecord(raw.npc) ? raw.npc : raw.vendor ?? raw;
  return {
    enabled: raw.enabled === true,
    npc: normalizeVendorNpcConfig(npcRaw),
  };
}

export function vendorAccepts(npc: VendorNpcConfig, kind: VendorAcceptKind): boolean {
  return npc.enabled && npc.accept.includes(kind);
}

export function vendorBuyRuleForContract(
  npc: VendorNpcConfig,
  contract: string
): VendorBuyRule | null {
  const want = contract.trim().toLowerCase();
  return npc.buy.find((rule) => rule.contract === want) ?? null;
}

export function buybackMana(mintPriceMana: number, buybackBps: number): number {
  if (!Number.isFinite(mintPriceMana) || mintPriceMana < 0) return 0;
  return Math.round(mintPriceMana * buybackBps) / 10000;
}
