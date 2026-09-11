/**
 * Retail Shop app — wearables on cylinder pedestals (sales points) inside a
 * named building. Click opens the shared shop bag (same idea as Vendor).
 *
 * PLACEMENT is the builder's. Which building, which floor, where the plinth
 * sits. Baked at publish. Changing it needs a scene edit + republish.
 *
 * INVENTORY lives on a shop instance (`shops[]`). Stock rows are entered once
 * in the library; instances list which stock they sell. Sell is on by default;
 * buy-from-visitor is opt-in (`buyEnabled`).
 *
 * Fulfillment per listing kind:
 *   collection_mint  → CollectionStore mint with MANA
 *   treasury_owned   → Marketplace until in-world transfer ships
 *   marketplace_link → online Marketplace listing
 *
 * Display is an AvatarShape mannequin wearing `outfitUrns` (full suit + hair)
 * when set, otherwise that one `urn`. A single jacket on a naked body is a bug.
 *
 * WHY NOT GALLERY: NftShape hangs a 2D picture. A wearable URN from an admin
 * wallet usually shows as an empty “NFT /” placeholder. A shop needs the 3D
 * wearable on the floor. AvatarShape is the honest path — a raw wearable GLB is
 * skinned to an avatar and will not sit on a plinth.
 *
 * Never import from app/ into this file. coerceWearableUrn lives here.
 */

import { parseCollectionItemUrn } from "./dcl-collection-store";
import { walkSurfaceY } from "./kit-geometry";
import { SWISSVERSE_TREASURY_WALLET } from "./vendor-contract";
import { wearableItemUrn } from "./wallet-wardrobe";

export const RETAIL_SHOP_VERSION = 2 as const;
export const DEFAULT_SHOP_INSTANCE_ID = "shop_default";

export const DEFAULT_PLINTH_HEIGHT_M = 0.32;
export const DEFAULT_PLINTH_RADIUS_M = 0.42;
export const DEFAULT_PEDESTAL_SPACING_M = 2.2;
export const DEFAULT_PEDESTAL_COLS = 3;
/** Degrees per second. Scene runtime: yaw += dt * RETAIL_MANNEQUIN_YAW_DEG_PER_SEC. */
export const RETAIL_MANNEQUIN_YAW_DEG_PER_SEC = 18;

/* -------------------------------------------------------------------------- */
/* Wearable URNs                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Turn what the owner pastes — a Marketplace link OR a raw URN — into an item
 * URN an AvatarShape can wear.
 *
 * Marketplace links come in two shapes:
 *   .../contracts/0x<addr>/tokens/<bigTokenId>   (a specific minted NFT)
 *   .../contracts/0x<addr>/items/<itemId>        (the item template)
 *
 * A collections-v2 tokenId packs the item id in its top 40 bits, so
 * itemId = tokenId >> 216. Rendering uses the ITEM urn. Chain defaults to
 * `matic` (Polygon) — virtually every modern wearable.
 *
 * Inlined here so shared/ never imports app/wearable-url.
 */
export function coerceWearableUrn(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^urn:/i.test(raw)) {
    const urn = wearableItemUrn(raw.replace(/^URN/i, "urn"));
    return urn || null;
  }

  const m = raw.match(/contracts\/(0x[0-9a-fA-F]{40})\/(tokens|items)\/(\d+)/i);
  if (!m) return null;
  const contract = m[1].toLowerCase();
  const kind = m[2].toLowerCase();
  const id = m[3];

  let itemId: string;
  if (kind === "items") {
    itemId = id;
  } else {
    try {
      itemId = (BigInt(id) >> 216n).toString();
    } catch {
      return null;
    }
  }
  return wearableItemUrn(`urn:decentraland:matic:collections-v2:${contract}:${itemId}`);
}

export function isValidWearableUrn(urn: unknown): boolean {
  return typeof urn === "string" && coerceWearableUrn(urn) !== null && /^urn:/i.test(urn.trim());
}

/** Keep order, drop blanks and duplicates. */
export function uniqueWearableUrns(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const urn = coerceWearableUrn(item);
    if (!urn || seen.has(urn)) continue;
    seen.add(urn);
    out.push(urn);
  }
  return out;
}

export interface RetailRgb {
  r: number;
  g: number;
  b: number;
}

function rgbColor(raw: unknown): RetailRgb | undefined {
  if (!isRecord(raw)) return undefined;
  const r = Number(raw.r);
  const g = Number(raw.g);
  const b = Number(raw.b);
  if (![r, g, b].every(Number.isFinite)) return undefined;
  return {
    r: Math.min(1, Math.max(0, r)),
    g: Math.min(1, Math.max(0, g)),
    b: Math.min(1, Math.max(0, b)),
  };
}

/** Marketplace listing for a collection item. Fallback when mint is unavailable. */
export function retailMarketplaceUrl(urn: string): string {
  const parsed = parseCollectionItemUrn(urn);
  if (parsed) {
    return `https://decentraland.org/marketplace/contracts/${parsed.contract}/items/${parsed.itemId}`;
  }
  return "https://decentraland.org/marketplace";
}

/* -------------------------------------------------------------------------- */
/* Listing kind — how a stock row is fulfilled in the shop bag                 */
/* -------------------------------------------------------------------------- */

export type ShopListingKind = "collection_mint" | "marketplace_link" | "treasury_owned";

export const SHOP_LISTING_KINDS: readonly ShopListingKind[] = [
  "collection_mint",
  "marketplace_link",
  "treasury_owned",
] as const;

export function isShopListingKind(value: unknown): value is ShopListingKind {
  return typeof value === "string" && (SHOP_LISTING_KINDS as readonly string[]).includes(value);
}

/** Mintable collections-v2 items default to mint; everything else is a link. */
export function defaultShopListingKind(urn: string | null): ShopListingKind {
  if (urn && parseCollectionItemUrn(urn)) return "collection_mint";
  return "marketplace_link";
}

/* -------------------------------------------------------------------------- */
/* Library — stock entered once, shown on many pedestals                       */
/* -------------------------------------------------------------------------- */

export interface RetailStockEntry {
  id: string;
  /** Exactly what was pasted. Never discarded, even when it does not parse. */
  sourceText: string;
  /** Parsed from `sourceText`. Null when it is not a wearable we recognise. */
  urn: string | null;
  title: string;
  /**
   * Full mannequin loadout. Hair + jacket + trousers + shoes + face.
   * Empty means the runtime falls back to `[urn]` (half-naked — avoid that).
   */
  outfitUrns: string[];
  /** How the shop bag fulfills a purchase of this row. */
  kind: ShopListingKind;
}

export function createStockEntry(
  id: string,
  partial: Partial<Omit<RetailStockEntry, "id">> = {}
): RetailStockEntry {
  const sourceText = (partial.sourceText ?? "").trim();
  const urn = partial.urn !== undefined ? partial.urn : sourceText ? coerceWearableUrn(sourceText) : null;
  return {
    id,
    sourceText,
    urn,
    title: partial.title ?? "",
    outfitUrns: uniqueWearableUrns(partial.outfitUrns),
    kind: isShopListingKind(partial.kind) ? partial.kind : defaultShopListingKind(urn),
  };
}

export function normalizeStockEntry(raw: unknown): RetailStockEntry | null {
  if (!isRecord(raw)) return null;
  const id = text(raw.id, "", 64);
  if (!id) return null;
  const sourceText = text(raw.sourceText, "", 400);
  const urn = sourceText ? coerceWearableUrn(sourceText) : null;
  const resolvedUrn = urn && /^urn:/i.test(urn) ? urn : null;
  return {
    id,
    sourceText,
    urn: resolvedUrn,
    title: text(raw.title, "", 120),
    outfitUrns: uniqueWearableUrns(raw.outfitUrns),
    kind: isShopListingKind(raw.kind) ? raw.kind : defaultShopListingKind(resolvedUrn),
  };
}

/** What AvatarShape.wearables should be. Outfit first, else the single urn. */
export function retailDisplayWearables(entry: RetailStockEntry): string[] {
  if (entry.outfitUrns.length > 0) return entry.outfitUrns;
  return entry.urn ? [entry.urn] : [];
}

export function nextStockEntryId(entries: readonly RetailStockEntry[]): string {
  const taken = new Set(entries.map((e) => e.id));
  let n = entries.length + 1;
  while (taken.has(`stock_${n}`)) n++;
  return `stock_${n}`;
}

/* -------------------------------------------------------------------------- */
/* Placement — the part the builder owns                                       */
/* -------------------------------------------------------------------------- */

export interface RetailShopPedestalPlacement {
  /**
   * Which building the pedestal sits in. Null = the primary building.
   * Same failure as Gallery if omitted on a multi-tower plot: every plinth
   * lands in building 1.
   */
  buildingId: string | null;
  /** 0 = ground. Height is measured from THIS floor's walk surface. */
  floorIndex: number;
  /** Building-local metres. */
  centerX: number;
  centerZ: number;
  /** Yaw in radians. 0 faces +Z. The mannequin then spins on top of this. */
  rotationY: number;
}

export interface RetailShopPedestal {
  id: string;
  name: string;
  placement: RetailShopPedestalPlacement;
  /** Library entry this pedestal shows, or null for a bare plinth. */
  stockId: string | null;
  /**
   * Display MANA. The chain quotes the real price at click
   * (`quoteCollectionItem`); this is never sent as the buy amount.
   */
  priceMana: number | null;
  /**
   * Which shop instance this sales point opens. Null = the default / first shop.
   */
  shopId: string | null;
}

/** Alias — a pedestal is a sales point that opens the shop bag. */
export type RetailSalesPoint = RetailShopPedestal;

export function defaultPedestalPlacement(
  partial: Partial<RetailShopPedestalPlacement> = {}
): RetailShopPedestalPlacement {
  return {
    buildingId: null,
    floorIndex: 0,
    centerX: 0,
    centerZ: 0,
    rotationY: 0,
    ...partial,
  };
}

/**
 * Next floor slot in a 3-wide grid, building-local metres.
 *
 * Index 0 is the front-left of a small shop row, not the room centre — a
 * pedestal at 0,0 reads as "not placed yet" in Gallery; here the slot IS the
 * placement.
 */
export function autoPedestalSlot(
  index: number,
  spacing = DEFAULT_PEDESTAL_SPACING_M,
  cols = DEFAULT_PEDESTAL_COLS
): { centerX: number; centerZ: number } {
  const n = Math.max(0, Math.floor(index));
  const col = n % cols;
  const row = Math.floor(n / cols);
  const originX = -((cols - 1) * spacing) / 2;
  return {
    centerX: originX + col * spacing,
    centerZ: spacing + row * spacing,
  };
}

export function createRetailPedestal(
  id: string,
  partial: Partial<Omit<RetailShopPedestal, "id" | "placement">> & {
    placement?: Partial<RetailShopPedestalPlacement>;
  } = {}
): RetailShopPedestal {
  return {
    id,
    name: partial.name ?? "Pedestal",
    placement: defaultPedestalPlacement(partial.placement),
    stockId: partial.stockId ?? null,
    priceMana: finiteOrNull(partial.priceMana),
    shopId: partial.shopId ?? null,
  };
}

export function nextPedestalId(pedestals: readonly { id: string }[]): string {
  const taken = new Set(pedestals.map((p) => p.id));
  let n = pedestals.length + 1;
  while (taken.has(`pedestal_${n}`)) n++;
  return `pedestal_${n}`;
}

/* -------------------------------------------------------------------------- */
/* Shop instances — inventory + sell/buy flags for the bag                     */
/* -------------------------------------------------------------------------- */

export interface RetailShopInstance {
  id: string;
  title: string;
  /**
   * Which building this shop stands in. Null = the primary building.
   *
   * A shop is an INSTANCE on a floor, exactly like a gallery: the card owns the
   * address and its pedestals inherit it. Before this existed the only address
   * on the plot was per-pedestal, so ten shops were ten unrelated plinths and
   * nothing could answer "where is this one?".
   */
  buildingId: string | null;
  /** 0 = ground. Pedestals of this shop sit on this floor. */
  floorIndex: number;
  /** Visitor can buy listings from this shop (default on). */
  sellEnabled: boolean;
  /** Visitor can sell / gift into this shop (opt-in). */
  buyEnabled: boolean;
  /** Settlement wallet (treasury by default — same as Vendor). */
  wallet: string;
  /** Library stock ids this shop sells. Empty = none until filled. */
  inventoryStockIds: string[];
}

export function defaultShopInstance(
  partial: Partial<Omit<RetailShopInstance, "id">> & { id?: string } = {}
): RetailShopInstance {
  return {
    id: partial.id ?? DEFAULT_SHOP_INSTANCE_ID,
    title: partial.title ?? "Shop",
    buildingId: partial.buildingId ?? null,
    floorIndex: Math.max(0, Math.round(finite(partial.floorIndex, 0))),
    sellEnabled: partial.sellEnabled !== false,
    buyEnabled: partial.buyEnabled === true,
    wallet: text(partial.wallet, SWISSVERSE_TREASURY_WALLET, 64) || SWISSVERSE_TREASURY_WALLET,
    inventoryStockIds: Array.isArray(partial.inventoryStockIds)
      ? uniqueIds(partial.inventoryStockIds)
      : [],
  };
}

export function normalizeShopInstance(raw: unknown): RetailShopInstance | null {
  if (!isRecord(raw)) return null;
  const id = text(raw.id, "", 64);
  if (!id) return null;
  return {
    id,
    title: text(raw.title, "Shop", 80) || "Shop",
    buildingId: text(raw.buildingId, "", 64) || null,
    floorIndex: Math.max(0, Math.round(finite(raw.floorIndex, 0))),
    sellEnabled: raw.sellEnabled !== false,
    buyEnabled: raw.buyEnabled === true,
    wallet: text(raw.wallet, SWISSVERSE_TREASURY_WALLET, 64) || SWISSVERSE_TREASURY_WALLET,
    inventoryStockIds: uniqueIds(raw.inventoryStockIds),
  };
}

export function nextShopInstanceId(shops: readonly { id: string }[]): string {
  const taken = new Set(shops.map((s) => s.id));
  let n = shops.length + 1;
  while (taken.has(`shop_${n}`)) n++;
  return `shop_${n}`;
}

/* ---------------------------------------------- which shop owns a pedestal */

/**
 * A pedestal with no `shopId` belongs to the FIRST shop.
 *
 * Same rule the runtime already uses in `retailShopForSalesPoint`, hoisted so
 * the panel groups pedestals into cards the same way the shop bag resolves
 * them. Never rewrite a null shopId at normalize time — a scene published
 * before shop instances existed must keep round-tripping unchanged.
 */
export function shopIdOwning(
  pedestal: { shopId: string | null },
  firstShopId: string
): string {
  return pedestal.shopId ?? firstShopId;
}

export function pedestalsForShop(
  pedestals: readonly RetailShopPedestal[],
  shopId: string,
  firstShopId: string
): RetailShopPedestal[] {
  return pedestals.filter((pedestal) => shopIdOwning(pedestal, firstShopId) === shopId);
}

/** Ceiling on one shop's plinths — a floor is a shop, not a warehouse. */
export const MAX_SHOP_PEDESTALS = 24;

/**
 * Point this shop's pedestals at its building and floor.
 *
 * X/Z are LEFT ALONE: they are room-local metres someone may have tuned, and
 * moving a shop up a floor should not scramble its floor plan.
 */
export function restageShopPedestals(
  pedestals: readonly RetailShopPedestal[],
  shop: RetailShopInstance,
  firstShopId: string
): RetailShopPedestal[] {
  return pedestals.map((pedestal) => {
    if (shopIdOwning(pedestal, firstShopId) !== shop.id) return pedestal;
    return {
      ...pedestal,
      shopId: shop.id,
      placement: {
        ...pedestal.placement,
        buildingId: shop.buildingId,
        floorIndex: shop.floorIndex,
      },
    };
  });
}

/** A new plinth for a shop, dropped on the next free slot of its grid. */
export function createShopPedestal(
  pedestals: readonly RetailShopPedestal[],
  shop: RetailShopInstance,
  firstShopId: string
): RetailShopPedestal {
  const mine = pedestalsForShop(pedestals, shop.id, firstShopId);
  const slot = autoPedestalSlot(mine.length);
  return createRetailPedestal(nextPedestalId(pedestals), {
    name: `Pedestal ${mine.length + 1}`,
    shopId: shop.id,
    placement: {
      buildingId: shop.buildingId,
      floorIndex: shop.floorIndex,
      centerX: slot.centerX,
      centerZ: slot.centerZ,
    },
  });
}

/** Grow or shrink one shop's plinths to `count`. Other shops are untouched. */
export function resizeShopPedestals(
  pedestals: readonly RetailShopPedestal[],
  shop: RetailShopInstance,
  firstShopId: string,
  count: number
): RetailShopPedestal[] {
  const target = Math.max(0, Math.min(MAX_SHOP_PEDESTALS, Math.round(count)));
  const staged = restageShopPedestals(pedestals, shop, firstShopId);
  /* Keep counting against `firstShopId`, never against `shop.id`. A plinth with
     a null shopId belongs to the FIRST shop; treating it as this shop's would
     let a second card's count silently adopt and then delete another shop's
     legacy plinths. */
  const mine = pedestalsForShop(staged, shop.id, firstShopId);
  if (mine.length === target) return staged;
  if (mine.length > target) {
    const doomed = new Set(mine.slice(target).map((pedestal) => pedestal.id));
    return staged.filter((pedestal) => !doomed.has(pedestal.id));
  }
  const out = [...staged];
  while (pedestalsForShop(out, shop.id, firstShopId).length < target) {
    out.push(createShopPedestal(out, shop, firstShopId));
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Config                                                                      */
/* -------------------------------------------------------------------------- */

export interface RetailShopConfig {
  version: typeof RETAIL_SHOP_VERSION;
  enabled: boolean;
  title: string;
  library: RetailStockEntry[];
  pedestals: RetailShopPedestal[];
  shops: RetailShopInstance[];
  bodyShape: string;
  hairColor?: RetailRgb;
  skinColor?: RetailRgb;
  eyeColor?: RetailRgb;
}

export function defaultRetailShopConfig(): RetailShopConfig {
  return {
    version: RETAIL_SHOP_VERSION,
    enabled: false,
    title: "Shop",
    library: [],
    pedestals: [],
    shops: [defaultShopInstance()],
    bodyShape: "urn:decentraland:off-chain:base-avatars:BaseMale",
  };
}

export function normalizeRetailShopConfig(
  partial: Partial<RetailShopConfig> | null | undefined
): RetailShopConfig {
  const base = defaultRetailShopConfig();
  if (!isRecord(partial)) return base;

  const rawLibrary = Array.isArray(partial.library) ? partial.library : [];
  const libraryIds = new Set<string>();
  const library: RetailStockEntry[] = [];
  for (const raw of rawLibrary) {
    const entry = normalizeStockEntry(raw);
    if (!entry || libraryIds.has(entry.id)) continue;
    libraryIds.add(entry.id);
    library.push(entry);
  }
  const byStockId = new Set(library.map((e) => e.id));

  const title = text(partial.title, base.title, 80) || base.title;

  const rawShops = Array.isArray(partial.shops) ? partial.shops : [];
  const seenShop = new Set<string>();
  const shops: RetailShopInstance[] = [];
  for (const raw of rawShops) {
    const shop = normalizeShopInstance(raw);
    if (!shop || seenShop.has(shop.id)) continue;
    seenShop.add(shop.id);
    shops.push({
      ...shop,
      inventoryStockIds: shop.inventoryStockIds.filter((id) => byStockId.has(id)),
    });
  }
  if (shops.length === 0) {
    shops.push(
      defaultShopInstance({
        title,
        inventoryStockIds: library.map((e) => e.id),
      })
    );
  }

  const shopIds = new Set(shops.map((s) => s.id));

  const rawPedestals = Array.isArray(partial.pedestals) ? partial.pedestals : [];
  const seen = new Set<string>();
  const pedestals: RetailShopPedestal[] = [];
  for (const raw of rawPedestals) {
    if (!isRecord(raw)) continue;
    const id = text(raw.id, "", 64);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const placement: Record<string, unknown> = isRecord(raw.placement) ? raw.placement : {};
    const stockId = text(raw.stockId, "", 64) || null;
    const shopId = text(raw.shopId, "", 64) || null;
    pedestals.push({
      id,
      name: text(raw.name, "Pedestal", 80) || "Pedestal",
      placement: {
        buildingId: text(placement.buildingId, "", 64) || null,
        floorIndex: Math.max(0, Math.round(finite(placement.floorIndex, 0))),
        centerX: finite(placement.centerX, 0),
        centerZ: finite(placement.centerZ, 0),
        rotationY: finite(placement.rotationY, 0),
      },
      stockId: stockId && byStockId.has(stockId) ? stockId : stockId,
      priceMana: finiteOrNull(raw.priceMana),
      shopId: shopId && shopIds.has(shopId) ? shopId : shopId,
    });
  }

  /* A scene published before shops had an address keeps its placement on the
     plinths. Read it back onto the card so the panel can show where the shop
     is instead of "primary building, ground" for every legacy install. The
     pedestals themselves are never rewritten. */
  const firstShopId = shops[0]!.id;
  const placedShops = shops.map((shop) => {
    if (shop.buildingId !== null || shop.floorIndex !== 0) return shop;
    const anchor = pedestals.find(
      (pedestal) => shopIdOwning(pedestal, firstShopId) === shop.id
    );
    if (!anchor) return shop;
    return {
      ...shop,
      buildingId: anchor.placement.buildingId,
      floorIndex: anchor.placement.floorIndex,
    };
  });

  return {
    version: RETAIL_SHOP_VERSION,
    enabled: partial.enabled === true,
    title,
    library,
    pedestals,
    shops: placedShops,
    bodyShape: text(partial.bodyShape, base.bodyShape, 200) || base.bodyShape,
    hairColor: rgbColor(partial.hairColor) ?? base.hairColor,
    skinColor: rgbColor(partial.skinColor) ?? base.skinColor,
    eyeColor: rgbColor(partial.eyeColor) ?? base.eyeColor,
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers — sales point → shop → inventory                                    */
/* -------------------------------------------------------------------------- */

export function retailShopForSalesPoint(
  config: RetailShopConfig,
  pedestal: RetailShopPedestal | RetailSalesPoint
): RetailShopInstance {
  if (pedestal.shopId) {
    const found = config.shops.find((s) => s.id === pedestal.shopId);
    if (found) return found;
  }
  return config.shops[0] ?? defaultShopInstance({ title: config.title });
}

export function retailInventoryForShop(
  config: RetailShopConfig,
  shop: RetailShopInstance
): RetailStockEntry[] {
  const byId = new Map(config.library.map((e) => [e.id, e]));
  const ids =
    shop.inventoryStockIds.length > 0
      ? shop.inventoryStockIds
      : config.library.map((e) => e.id);
  const out: RetailStockEntry[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const entry = byId.get(id);
    if (!entry) continue;
    seen.add(id);
    out.push(entry);
  }
  return out;
}

export function retailInventoryForSalesPoint(
  config: RetailShopConfig,
  pedestal: RetailShopPedestal | RetailSalesPoint
): RetailStockEntry[] {
  return retailInventoryForShop(config, retailShopForSalesPoint(config, pedestal));
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

export interface RetailBuildingFrame {
  origin: { x: number; y: number; z: number };
  rotationDeg: number;
  storyHeight: number;
}

/** Walk-surface Y of this pedestal's floor, building-local. */
export function retailPedestalFloorY(pedestal: RetailShopPedestal, storyHeight: number): number {
  const floorBaseY = pedestal.placement.floorIndex * Math.max(0.5, storyHeight);
  return walkSurfaceY(floorBaseY);
}

/**
 * Pedestal transform in scene metres.
 *
 * Y is the walk surface (plinth base). The runtime stacks the cylinder and the
 * mannequin on top of this. Same function for composer preview and scene so
 * they cannot disagree.
 */
export function retailPedestalSceneTransform(
  pedestal: RetailShopPedestal,
  frame: RetailBuildingFrame
): { x: number; y: number; z: number; yawDeg: number } {
  const theta = (frame.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const lx = pedestal.placement.centerX;
  const lz = pedestal.placement.centerZ;
  return {
    x: frame.origin.x + lx * cos + lz * sin,
    y: frame.origin.y + retailPedestalFloorY(pedestal, frame.storyHeight),
    z: frame.origin.z - lx * sin + lz * cos,
    yawDeg: (pedestal.placement.rotationY * 180) / Math.PI + frame.rotationDeg,
  };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export interface RetailShopValidationIssue {
  level: "warn" | "error";
  code: string;
  message: string;
  pedestalId?: string;
  shopId?: string;
}

export function validateRetailShopConfig(
  config: RetailShopConfig,
  opts?: { floors?: number; buildingIds?: readonly string[] }
): RetailShopValidationIssue[] {
  const issues: RetailShopValidationIssue[] = [];
  if (!config.enabled) return issues;

  if (config.pedestals.length === 0) {
    issues.push({
      level: "warn",
      code: "retail.no_pedestals",
      message: "Retail Shop is on but no pedestals have been placed",
    });
  }

  if (config.shops.length === 0) {
    issues.push({
      level: "warn",
      code: "retail.no_shops",
      message: "Retail Shop is on but no shop instances are configured",
    });
  }

  const library = config.library ?? [];
  for (const entry of library) {
    if (entry.sourceText && !entry.urn) {
      issues.push({
        level: "warn",
        code: "retail.unreadable_link",
        message: `"${entry.title || entry.id}" — "${entry.sourceText.slice(
          0,
          60
        )}" is not a wearable link we recognise, so the mannequin will be empty`,
      });
    }
  }

  const shopIds = new Set(config.shops.map((s) => s.id));
  const libraryIds = new Set(library.map((e) => e.id));
  for (const shop of config.shops) {
    for (const stockId of shop.inventoryStockIds) {
      if (!libraryIds.has(stockId)) {
        issues.push({
          level: "warn",
          code: "retail.shop_missing_stock",
          shopId: shop.id,
          message: `Shop "${shop.title}" lists stock "${stockId}" that is no longer in the library`,
        });
      }
    }
  }

  const known = opts?.buildingIds ? new Set(opts.buildingIds) : null;
  const topFloor = typeof opts?.floors === "number" ? Math.max(0, opts.floors - 1) : null;

  for (const shop of config.shops) {
    if (known && shop.buildingId && !known.has(shop.buildingId)) {
      issues.push({
        level: "error",
        code: "retail.shop_building_missing",
        shopId: shop.id,
        message: `Shop "${shop.title}" is assigned to a building that is no longer in this scene`,
      });
    }
  }

  for (const pedestal of config.pedestals) {
    if (known && pedestal.placement.buildingId && !known.has(pedestal.placement.buildingId)) {
      issues.push({
        level: "error",
        code: "retail.building_missing",
        pedestalId: pedestal.id,
        message: `"${pedestal.name}" sits in a building that is no longer in this scene`,
      });
    }
    if (pedestal.shopId && !shopIds.has(pedestal.shopId)) {
      issues.push({
        level: "warn",
        code: "retail.missing_shop",
        pedestalId: pedestal.id,
        message: `"${pedestal.name}" points at a shop instance that is gone — it will open the default shop`,
      });
    }
    if (pedestal.stockId && !libraryIds.has(pedestal.stockId)) {
      issues.push({
        level: "warn",
        code: "retail.missing_stock",
        pedestalId: pedestal.id,
        message: `"${pedestal.name}" points at stock that is no longer in the library — it will stand empty`,
      });
    }
    if (topFloor !== null && !pedestal.placement.buildingId && pedestal.placement.floorIndex > topFloor) {
      issues.push({
        level: "error",
        code: "retail.floor_out_of_range",
        pedestalId: pedestal.id,
        message: `"${pedestal.name}" is on floor ${pedestal.placement.floorIndex}, above the top floor (${topFloor})`,
      });
    }
    const stock = pedestal.stockId ? library.find((e) => e.id === pedestal.stockId) : undefined;
    if (stock?.urn && !isValidWearableUrn(stock.urn)) {
      issues.push({
        level: "error",
        code: "retail.bad_urn",
        pedestalId: pedestal.id,
        message: `"${pedestal.name}" has a wearable reference the explorer cannot wear`,
      });
    }
  }

  return issues;
}

/* -------------------------------------------------------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function finite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function text(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, max);
}

function uniqueIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim().slice(0, 64);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
