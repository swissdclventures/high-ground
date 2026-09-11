/**
 * Pure NFT gate evaluation from on-chain read results (no async / SDK).
 */

export function evaluateNftCollectionPass(balance: bigint): boolean {
  return balance > 0n;
}

export function evaluateNftTokenPass(
  wallet: string,
  match: "any" | "all",
  owners: (string | null)[]
): boolean {
  if (!owners.length) return false;
  const w = wallet.toLowerCase();
  const owned = owners.map((o) => o?.toLowerCase() === w);
  if (match === "all") return owned.every(Boolean);
  return owned.some(Boolean);
}

/**
 * Fold per-contract / per-token reads into a verdict, with UNREADABLE kept
 * distinct from NO.
 *
 * THIS IS THE FALSE DENIAL. Every read used to be squeezed through
 * `parseUint256Result`, which turns a null (the RPC did not answer: a 5xx, a
 * rate limit, a dropped connection) into `0n` — indistinguishable from a real
 * zero balance. So a holder whose read simply failed was told they own nothing,
 * and the answer was then cached as a hard NO for the full TTL. "It let me in
 * after a while" is that cache expiring, not the chain changing its mind.
 *
 * `null` in, `null` out: the caller keeps the visitor at a CHECKING screen and
 * asks again shortly, rather than accusing them of not owning their own item.
 */
export function resolveGateReads(
  reads: (boolean | null)[],
  match: "any" | "all"
): boolean | null {
  if (!reads.length) return false;
  if (match === "all") {
    if (reads.some((r) => r === false)) return false;
    return reads.some((r) => r === null) ? null : true;
  }
  if (reads.some((r) => r === true)) return true;
  return reads.some((r) => r === null) ? null : false;
}
