import { engine } from '@dcl/sdk/ecs'
import { createExplorerWalletProvider } from '../explorer-wallet-rpc'
import type { GateRule, SocialChain } from '@shared/social-surface-contract'
import { gateContracts } from '@shared/social-surface-contract'
import {
  addressFromOwnerOfResult,
  encodeBalanceOfCalldata,
  encodeOwnerOfCalldata,
  nftGateCacheKey,
  parseUint256Result
} from '@shared/nft-gate-encoding'
import {
  evaluateNftCollectionPass,
  evaluateNftTokenPass,
  resolveGateReads
} from '@shared/nft-gate-logic'

/** How long a REAL answer (yes or no) is trusted before it is read again. */
const CACHE_TTL_MS = 45_000
/**
 * How long an UNREADABLE answer is left alone before trying again: 1s, 2s, 4s,
 * 8s, then 15s. A network blip must cost the visitor a second at the arrival
 * cover, not the 45s a real verdict is cached for — that wait is what made a
 * denial look permanent until it mysteriously wasn't.
 */
const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 15_000

function retryDelayMs(misses: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, Math.max(0, misses - 1)))
}

const provider = createExplorerWalletProvider()

/**
 * Read-only JSON-RPC endpoints, one per chain a GateRule can name.
 *
 * THIS IS WHY GATES USED TO NEVER OPEN. Every `eth_call` went through the
 * explorer's injected wallet provider, which is connected to Ethereum mainnet.
 * Decentraland wearable collections (collections-v2, including Dance Bug) live on
 * Polygon, so `balanceOf` for a Polygon contract was asked of Ethereum, came back
 * empty, parsed as 0, and the holder was told they owned nothing — permanently,
 * because the negative answer was then cached. `rule.chain` existed the whole time
 * and was simply never read.
 *
 * These are Decentraland's own public RPC proxies, so they need no key and are
 * already reachable from a published scene (USE_FETCH).
 */
const RPC_URL: Record<SocialChain, string> = {
  ethereum: 'https://rpc.decentraland.org/mainnet',
  polygon: 'https://rpc.decentraland.org/polygon',
}

type CacheEntry = {
  /** `true` pass, `false` fail, `null` NOT YET KNOWN — never "assume no". */
  value: boolean | null
  expiresAt: number
  pending: boolean
  /** Consecutive unreadable answers; drives the retry backoff. */
  misses: number
  /** The rule this entry was checked with — the background sweep re-checks with
   *  it directly instead of reconstructing a rule from the cache-key string
   *  (which can't carry the full contracts list or match reliably). */
  rule: GateRule
}

const cache = new Map<string, CacheEntry>()
const refreshListeners = new Set<() => void>()

function notifyRefresh(): void {
  for (const fn of refreshListeners) fn()
}

export function subscribeNftCacheRefresh(listener: () => void): () => void {
  refreshListeners.add(listener)
  return () => refreshListeners.delete(listener)
}

function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    provider.sendAsync(
      {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      },
      (err, result) => {
        if (err) reject(err)
        else resolve(result)
      }
    )
  })
}

/** `eth_call` against the chain the rule names, over Decentraland's public RPC. */
async function httpEthCall(
  chain: SocialChain,
  contract: string,
  data: string
): Promise<string | null> {
  const response = await fetch(RPC_URL[chain], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: contract, data }, 'latest'],
    }),
  })
  if (!response.ok) return null
  const body = (await response.json()) as { result?: string; error?: unknown } | null
  if (!body || body.error) return null
  return body.result ?? null
}

/** Wallet-provider `eth_call` — only valid for the chain the explorer is on. */
async function providerEthCall(contract: string, data: string): Promise<string | null> {
  const response = (await rpcCall('eth_call', [{ to: contract, data }, 'latest'])) as
    | { result?: string }
    | string
    | null
  if (!response) return null
  if (typeof response === 'string') return response
  return response.result ?? null
}

async function ethCall(
  chain: SocialChain,
  contract: string,
  data: string
): Promise<string | null> {
  try {
    return await httpEthCall(chain, contract, data)
  } catch {
    // Only Ethereum can fall back to the injected wallet: asking it about a Polygon
    // contract is what produced the phantom "you own nothing" in the first place.
    if (chain !== 'ethereum') return null
    try {
      return await providerEthCall(contract, data)
    } catch {
      return null
    }
  }
}

/**
 * The on-chain read. `null` means WE COULD NOT TELL, and it is never flattened
 * into `false` — see `resolveGateReads` for what that cost a holder.
 */
async function checkNftGateAsync(wallet: string, rule: GateRule): Promise<boolean | null> {
  if (rule.mode === 'nft_collection') {
    // Hold an item from ANY listed collection (match "any", default) or ALL
    // (match "all"). Checks run in parallel; "any" short-circuits on the client.
    const contracts = gateContracts(rule)
    if (!contracts.length) return false
    const reads = await Promise.all(
      contracts.map(async (c) => {
        const hex = await ethCall(rule.chain, c, encodeBalanceOfCalldata(wallet))
        if (hex === null) return null
        return evaluateNftCollectionPass(parseUint256Result(hex))
      })
    )
    return resolveGateReads(reads, rule.match)
  }

  if (!rule.contract) return false
  const contract = rule.contract.toLowerCase()

  if (rule.mode === 'nft_token') {
    const tokenIds = rule.tokenIds ?? []
    // Contract but no mint numbers = the whole collection. An empty owners list
    // used to evaluate to "nobody passes", so an author who picked a collection
    // by name (the picker carries no token IDs) built a gate nobody could open.
    // balanceOf is the same read nft_collection does.
    if (!tokenIds.length) {
      const hex = await ethCall(rule.chain, contract, encodeBalanceOfCalldata(wallet))
      if (hex === null) return null
      return evaluateNftCollectionPass(parseUint256Result(hex))
    }
    const reads: (boolean | null)[] = []
    for (const id of tokenIds) {
      const hex = await ethCall(rule.chain, contract, encodeOwnerOfCalldata(id))
      // A failed call and "owned by someone else" are different answers, so the
      // owner list is folded per read rather than through one all-or-nothing
      // pass over a list that quietly lost its failures.
      reads.push(hex === null ? null : evaluateNftTokenPass(wallet, 'all', [addressFromOwnerOfResult(hex)]))
    }
    return resolveGateReads(reads, rule.match)
  }

  return false
}

function cacheKey(wallet: string, rule: GateRule): string {
  return nftGateCacheKey(
    wallet,
    rule.id,
    rule.mode,
    rule.chain,
    rule.contract,
    rule.tokenIds,
    rule.contracts
  )
}

function scheduleRefresh(wallet: string, rule: GateRule): void {
  const key = cacheKey(wallet, rule)
  const existing = cache.get(key)
  if (existing?.pending) return
  const misses = existing?.misses ?? 0

  cache.set(key, {
    value: existing?.value ?? null,
    expiresAt: Date.now() + CACHE_TTL_MS,
    pending: true,
    misses,
    rule
  })

  // An unreadable chain leaves the entry UNKNOWN and comes back sooner. Writing
  // `false` here — which both branches used to do — is the bug that told the
  // collection's own creator they were not a member.
  const unreadable = () => {
    const next = misses + 1
    cache.set(key, {
      value: null,
      expiresAt: Date.now() + retryDelayMs(next),
      pending: false,
      misses: next,
      rule
    })
    notifyRefresh()
  }

  void checkNftGateAsync(wallet, rule)
    .then((value) => {
      if (value === null) {
        unreadable()
        return
      }
      cache.set(key, {
        value,
        expiresAt: Date.now() + CACHE_TTL_MS,
        pending: false,
        misses: 0,
        rule
      })
      notifyRefresh()
    })
    .catch(unreadable)
}

export function requestNftGateCheck(wallet: string, rule: GateRule): void {
  if (rule.mode !== 'nft_collection' && rule.mode !== 'nft_token') return
  const key = cacheKey(wallet, rule)
  const entry = cache.get(key)
  if (!entry || Date.now() > entry.expiresAt) {
    scheduleRefresh(wallet, rule)
  }
}

/**
 * How many times in a row the chain refused to answer for this wallet+rule.
 * The curtain uses it to stop saying "one moment" and start saying "we can't
 * reach the chain" — a visitor deserves to know which of the two is happening.
 */
export function nftGateReadFailures(wallet: string, rule: GateRule): number {
  return cache.get(cacheKey(wallet, rule))?.misses ?? 0
}

export function getNftGateCached(wallet: string, rule: GateRule): boolean | null {
  const key = cacheKey(wallet, rule)
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt && !entry.pending) {
    scheduleRefresh(wallet, rule)
  }
  return entry.value
}

/** Sync gate check — returns false while cache is pending. */
export function passesNftGateRule(wallet: string, rule: GateRule): boolean {
  if (!rule.contract) return false
  const cached = getNftGateCached(wallet, rule)
  if (cached === null) {
    requestNftGateCheck(wallet, rule)
    return false
  }
  return cached
}

let nftCheckerStarted = false
export function initNftChecker(): void {
  // Idempotent: the building access gate AND the standalone zone gate both need
  // it, and a build can have both — don't add the cleanup system twice.
  if (nftCheckerStarted) return
  nftCheckerStarted = true
  let tick = 0
  engine.addSystem(() => {
    tick += 1
    // ~1s. The old 3s sweep was fine for a 45s TTL and far too slow for the
    // 1s retry an unreadable chain now gets.
    if (tick % 60 !== 0) return
    for (const [key, entry] of cache) {
      if (Date.now() > entry.expiresAt && !entry.pending) {
        const wallet = key.split(':')[0]
        if (!wallet) continue
        scheduleRefresh(wallet, entry.rule)
      }
    }
  })
}
