/**
 * Pure ERC-721 calldata helpers for Surface 4 NFT gating (testable without DCL SDK).
 */

export function padAddress(address: string): string {
  return address.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
}

/** ERC-721 balanceOf(address). */
export function encodeBalanceOfCalldata(wallet: string): string {
  return `0x70a08231${padAddress(wallet)}`;
}

/** ERC-721 ownerOf(uint256). */
export function encodeOwnerOfCalldata(tokenId: string): string {
  const id = BigInt(tokenId).toString(16).padStart(64, "0");
  return `0x6352211e${id}`;
}

export function parseUint256Result(hex: string | undefined | null): bigint {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex);
}

export function addressFromOwnerOfResult(hex: string | undefined | null): string | null {
  if (!hex || hex === "0x" || hex.length < 42) return null;
  return `0x${hex.slice(-40).toLowerCase()}`;
}

/** ERC-721 safeTransferFrom(address,address,uint256) — host → guest. */
export function encodeSafeTransferFromCalldata(
  from: string,
  to: string,
  tokenId: string
): string {
  const id = BigInt(tokenId).toString(16).padStart(64, "0");
  return `0x42842e0e${padAddress(from)}${padAddress(to)}${id}`;
}

/** Polygon mainnet chain id as hex. */
export const POLYGON_CHAIN_ID_HEX = "0x89";
export const ETHEREUM_CHAIN_ID_HEX = "0x1";

export function chainIdHexForSocialChain(chain: "ethereum" | "polygon"): string {
  return chain === "ethereum" ? ETHEREUM_CHAIN_ID_HEX : POLYGON_CHAIN_ID_HEX;
}

export function nftGateCacheKey(
  wallet: string,
  ruleId: string,
  mode: string,
  chain: string,
  contract: string | null,
  tokenIds: string[] | null,
  contracts?: string[] | null
): string {
  const tokens = (tokenIds ?? []).join(",");
  // The full collection list — a gate keyed only on the primary contract would
  // reuse a stale verdict after the owner adds/removes collections.
  const cts = (contracts ?? (contract ? [contract] : [])).map((c) => c.toLowerCase()).join(",");
  return `${wallet.toLowerCase()}:${ruleId}:${mode}:${chain}:${contract ?? ""}:${tokens}:${cts}`;
}
