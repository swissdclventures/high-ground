/**
 * Buying a Decentraland collection item with MANA — pure ABI encoding.
 *
 * This is the PRIMARY sale path: the buyer pays MANA to Decentraland's CollectionStore,
 * which mints a fresh item from the collection straight to their wallet. It is what the
 * item's Marketplace page does, and it is why the Dance Bug can be sold from inside the
 * scene instead of linking out to a browser tab.
 *
 * FLOW (see scene/src/speakeasy/buy-collection-item.ts for the transactions):
 *   1. read the item's price + beneficiary from the collection  (getItemBuyData, view)
 *   2. ERC-20 approve MANA to the store, if the allowance is short
 *   3. CollectionStore.buy([{ collection, ids, prices, beneficiaries }])
 *
 * THE PRICE IS NOT OURS TO CHOOSE. `buy` reverts with ITEM_PRICE_MISMATCH unless the
 * price passed equals the item's on-chain price, so the author's `priceMana` is a
 * DISPLAY value only — every transaction quotes the chain. That is deliberate: it makes
 * a stale or mistyped price in the editor impossible to overcharge with.
 *
 * Contract: CollectionStore, Polygon 0x214ffC0f0103735728dc66b61A22e4F163e275ae.
 * Source: decentraland/wearables-contracts contracts/markets/v2/CollectionStore.sol —
 *   struct ItemToBuy { IERC721CollectionV2 collection; uint256[] ids; uint256[] prices;
 *                      address[] beneficiaries; }
 * Selectors below are keccak256 of the signature in the comment, verified in
 * tests/shared/dcl-collection-store.test.ts against four known ERC-20/721 selectors.
 */

/** Decentraland CollectionStore (Polygon mainnet). */
export const POLYGON_COLLECTION_STORE = "0x214ffc0f0103735728dc66b61a22e4f163e275ae";

/** buy((address,uint256[],uint256[],address[])[]) */
const SELECTOR_BUY = "a4fdc78a";
/** getItemBuyData(address,uint256) */
const SELECTOR_GET_ITEM_BUY_DATA = "e0f307c2";
/** approve(address,uint256) */
const SELECTOR_APPROVE = "095ea7b3";
/** transfer(address,uint256) */
const SELECTOR_TRANSFER = "a9059cbb";
/** allowance(address,address) */
const SELECTOR_ALLOWANCE = "dd62ed3e";
/** balanceOf(address) */
const SELECTOR_BALANCE_OF = "70a08231";

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function addressWord(address: string): string {
  const normalized = address.trim().toLowerCase();
  if (!HEX_ADDRESS.test(normalized)) throw new Error(`Invalid Ethereum address: ${address}`);
  return normalized.slice(2).padStart(64, "0");
}

function uintWord(value: bigint | number | string): string {
  const n = typeof value === "bigint" ? value : BigInt(value);
  if (n < 0n) throw new Error("Negative value cannot be ABI-encoded as uint256");
  const hex = n.toString(16);
  if (hex.length > 64) throw new Error("Value exceeds uint256");
  return hex.padStart(64, "0");
}

/** Parse a URN like urn:decentraland:matic:collections-v2:0xabc…:3 into its parts. */
export function parseCollectionItemUrn(
  urn: string
): { contract: string; itemId: string } | null {
  const parts = urn.trim().split(":");
  const itemId = parts[parts.length - 1] ?? "";
  const contract = parts[parts.length - 2] ?? "";
  if (!HEX_ADDRESS.test(contract) || !/^\d+$/.test(itemId)) return null;
  return { contract: contract.toLowerCase(), itemId };
}

/** eth_call data: the item's (price, beneficiary) straight from the collection. */
export function encodeGetItemBuyData(collection: string, itemId: bigint | number | string): string {
  return `0x${SELECTOR_GET_ITEM_BUY_DATA}${addressWord(collection)}${uintWord(itemId)}`;
}

/** Decode getItemBuyData's (uint256 price, address beneficiary) return data. */
export function decodeItemBuyData(
  returnData: string
): { priceWei: bigint; beneficiary: string } | null {
  const body = returnData.trim().replace(/^0x/, "");
  if (body.length < 128) return null;
  try {
    return {
      priceWei: BigInt(`0x${body.slice(0, 64)}`),
      beneficiary: `0x${body.slice(64, 128).slice(24)}`.toLowerCase(),
    };
  } catch {
    return null;
  }
}

/** eth_call data: ERC-20 allowance(owner, spender). */
export function encodeErc20Allowance(owner: string, spender: string): string {
  return `0x${SELECTOR_ALLOWANCE}${addressWord(owner)}${addressWord(spender)}`;
}

/** eth_call data: ERC-20 balanceOf(owner). */
export function encodeErc20BalanceOf(owner: string): string {
  return `0x${SELECTOR_BALANCE_OF}${addressWord(owner)}`;
}

/** Transaction data: ERC-20 approve(spender, amount). */
export function encodeErc20Approve(spender: string, amountWei: bigint): string {
  return `0x${SELECTOR_APPROVE}${addressWord(spender)}${uintWord(amountWei)}`;
}

/** Transaction data: ERC-20 transfer(to, amount). */
export function encodeErc20Transfer(to: string, amountWei: bigint): string {
  return `0x${SELECTOR_TRANSFER}${addressWord(to)}${uintWord(amountWei)}`;
}

/** Decode a bare uint256 return (allowance / balanceOf), 0n when unreadable. */
export function decodeUint256(returnData: string): bigint {
  const body = returnData.trim().replace(/^0x/, "");
  if (!body) return 0n;
  try {
    return BigInt(`0x${body.slice(0, 64)}`);
  } catch {
    return 0n;
  }
}

/**
 * Transaction data: CollectionStore.buy for ONE item of ONE collection.
 *
 * Layout (14 words after the selector). The nested offsets are what make this worth
 * encoding by hand once, with a test, rather than inline at the call site:
 *
 *   0  0x20    offset to the ItemToBuy[] data
 *   1  1       array length
 *   2  0x20    offset to element 0, relative to the end of the length word
 *   3  collection                       ┐ struct head (4 words)
 *   4  0x80    offset to ids            │
 *   5  0xc0    offset to prices         │
 *   6  0x100   offset to beneficiaries  ┘
 *   7  1       ids.length
 *   8  itemId
 *   9  1       prices.length
 *  10  priceWei
 *  11  1       beneficiaries.length
 *  12  beneficiary (the buyer — who receives the minted NFT)
 */
export function encodeCollectionStoreBuy(args: {
  collection: string;
  itemId: bigint | number | string;
  priceWei: bigint;
  beneficiary: string;
}): string {
  const words = [
    uintWord(0x20),
    uintWord(1),
    uintWord(0x20),
    addressWord(args.collection),
    uintWord(0x80),
    uintWord(0xc0),
    uintWord(0x100),
    uintWord(1),
    uintWord(args.itemId),
    uintWord(1),
    uintWord(args.priceWei),
    uintWord(1),
    addressWord(args.beneficiary),
  ];
  return `0x${SELECTOR_BUY}${words.join("")}`;
}
