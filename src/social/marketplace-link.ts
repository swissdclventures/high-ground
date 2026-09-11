/**
 * "Where do I actually buy this?" — resolved to one item, not to a shop front.
 *
 * The reject screen used to send people to
 * `…/marketplace/contracts/<contract>/items`, which LOOKS like a collection
 * page and is not a route at all: the Marketplace's router does not match it
 * and drops the visitor on the Marketplace home page, under "Trending Items".
 * So the one button on a screen whose entire job is "here is how you get in"
 * spent it on a link to a storefront the visitor then had to search.
 *
 * What a rejected visitor needs is the thing they can buy RIGHT NOW, at the
 * price it costs, one tap away. That is a real item page —
 * `…/contracts/<contract>/items/<itemId>` — with BUY WITH MANA on it.
 *
 * Which item that is cannot be known from the gate rule: a collection gate
 * names a contract, and a contract holds many items with different stock,
 * different listings and different prices. So we ask.
 *
 * ★ The endpoint matters: `/v1/items` knows only the creator's store, so an
 * item with a hundred open resale asks still reports `isOnSale:false`. `/v1/catalog`
 * is the same row PLUS the secondary market — it is what the Marketplace UI
 * itself renders, and it is the only one that can answer "can I buy one?".
 */

const CATALOG = 'https://marketplace-api.decentraland.org/v1/catalog'
const MARKETPLACE = 'https://decentraland.org/marketplace'

/** A real answer is stable enough to hold for a while; a miss retries sooner. */
const HIT_TTL_MS = 10 * 60_000
const MISS_TTL_MS = 20_000

export interface BuyableItem {
  /** The item's own page — the one with a buy button on it. */
  url: string
  name: string
  /** Cheapest way in, in MANA. 0 is a real answer (a free mint); null is "no price". */
  mana: number | null
}

type Entry = {
  item: BuyableItem | null
  expiresAt: number
  pending: boolean
}

const cache = new Map<string, Entry>()

function key(contracts: string[]): string {
  return contracts.map((c) => c.toLowerCase()).sort().join(',')
}

/** Item detail — verified to land on the item, with BUY WITH MANA. */
export function marketplaceItemUrl(contract: string, itemId: string): string {
  return `${MARKETPLACE}/contracts/${contract}/items/${itemId}`
}

/**
 * The fallback when we cannot name a single item: browse, filtered to these
 * collections and to what is actually for sale. A real route, unlike the one
 * this file exists to replace.
 */
export function collectionBrowseUrl(contracts: string[]): string | null {
  if (!contracts.length) return null
  const filter = contracts.map((c) => `&contracts=${c}`).join('')
  return `${MARKETPLACE}/browse?assetType=item&isOnSale=true${filter}`
}

/** wei → MANA, rounded to 2dp and stripped of trailing zeros. */
function manaFromWei(wei: string | null | undefined): number | null {
  if (!wei) return null
  let raw: bigint
  try {
    raw = BigInt(wei)
  } catch {
    return null
  }
  // Two decimal places is as fine as any price on this screen needs to be, and
  // avoids handing Number a value big enough to lose precision.
  return Number((raw * 100n) / 10n ** 18n) / 100
}

/**
 * The cheapest door into this row.
 *
 * `minPrice` is the catalog's own answer and is usually right, but it reads 0
 * for an item whose creator store is closed — where the only way in is a resale
 * listing. So a zero falls through to the mint price and then to the cheapest
 * listing, and only a row with none of the three is genuinely priceless.
 */
function cheapestMana(row: Record<string, unknown>): number | null {
  const candidates = [row.minPrice, row.price, row.minListingPrice]
  for (const c of candidates) {
    const mana = manaFromWei(typeof c === 'string' ? c : null)
    if (mana !== null && mana > 0) return mana
  }
  // Every quoted price was zero — which for a mintable item is FREE, a real and
  // rather important answer, and for an unbuyable one is no answer at all.
  const buyable = row.isOnSale === true
  return buyable ? 0 : null
}

async function fetchBuyable(contracts: string[]): Promise<BuyableItem | null> {
  const filter = contracts.map((c) => `&contractAddress=${c}`).join('')
  const url = `${CATALOG}?isOnSale=true&sortBy=cheapest&first=1${filter}`
  const response = await fetch(url)
  if (!response.ok) return null
  const body = (await response.json()) as { data?: Record<string, unknown>[] } | null
  const row = body?.data?.[0]
  if (!row) return null
  const contract = typeof row.contractAddress === 'string' ? row.contractAddress : null
  const itemId = row.itemId === undefined || row.itemId === null ? null : String(row.itemId)
  if (!contract || itemId === null) return null
  return {
    url: marketplaceItemUrl(contract, itemId),
    name: typeof row.name === 'string' ? row.name : '',
    mana: cheapestMana(row)
  }
}

/**
 * Start (or refresh) the lookup. Safe to call every frame — it is a cache read
 * until something has actually expired.
 */
export function requestBuyableItem(contracts: string[]): void {
  if (!contracts.length) return
  const k = key(contracts)
  const entry = cache.get(k)
  if (entry?.pending) return
  if (entry && Date.now() <= entry.expiresAt) return

  cache.set(k, { item: entry?.item ?? null, expiresAt: Date.now() + HIT_TTL_MS, pending: true })
  const settle = (item: BuyableItem | null) => {
    cache.set(k, {
      item,
      expiresAt: Date.now() + (item ? HIT_TTL_MS : MISS_TTL_MS),
      pending: false
    })
  }
  void fetchBuyable(contracts)
    .then(settle)
    .catch(() => settle(null))
}

/** The item, once we know it. `null` means "not yet" or "nothing for sale". */
export function getBuyableItem(contracts: string[]): BuyableItem | null {
  if (!contracts.length) return null
  return cache.get(key(contracts))?.item ?? null
}

/** "BUY · 0.15 MANA" / "GET IT FREE" / "GET IT" — the price belongs on the button. */
export function buyLabel(item: BuyableItem): string {
  if (item.mana === null) return 'GET IT'
  if (item.mana === 0) return 'GET IT FREE'
  return `BUY · ${item.mana} MANA`
}
