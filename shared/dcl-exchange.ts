/**
 * Pure Decentraland exchange helpers shared by the SDK7 scene and tests.
 *
 * Release 1 deliberately supports only Polygon collections-v2 assets. Those
 * are Decentraland's current on-chain wearable/emote collections and expose
 * ERC-721 safeTransferFrom. Third-party linked wearables are representations of
 * external NFTs and must not be treated as transferable DCL collection tokens.
 */

export type DclExchangeAssetKind = 'wearable' | 'emote'

export interface DclExchangeAsset {
  id: string
  kind: DclExchangeAssetKind
  urn: string
  contractAddress: string
  tokenId: string
  itemIndex: string
  name: string
  category: string
  rarity: string
  thumbnailUrl: string | null
  ownedCount: number
}

interface ParsedCollectionUrn {
  contractAddress: string
  itemIndex: string
}

const EVM_ADDRESS = /^0x[a-f0-9]{40}$/i
const UINT_DECIMAL = /^(0|[1-9][0-9]*)$/
const MATIC_COLLECTION_V2 =
  /^urn:decentraland:matic:collections-v2:(0x[a-f0-9]{40}):([0-9]+)$/i

export function isEvmAddress(value: string): boolean {
  return EVM_ADDRESS.test(value.trim())
}

export function shortExchangeAddress(value: string): string {
  const address = value.trim()
  if (address.length < 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function parseMaticCollectionV2Urn(urn: string): ParsedCollectionUrn | null {
  const match = MATIC_COLLECTION_V2.exec(urn.trim())
  if (!match) return null
  return { contractAddress: match[1].toLowerCase(), itemIndex: match[2] }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numericCount(value: unknown, fallback: number): number {
  const count = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : fallback
}

/**
 * Convert a Catalyst owned-assets response into one row per collectible design.
 * When a wallet owns multiple copies, the oldest indexed token is selected for
 * the next gift and the quantity is kept for the UI badge.
 */
export function parseOwnedDclAssets(
  kind: DclExchangeAssetKind,
  payload: unknown
): DclExchangeAsset[] {
  const root = objectValue(payload)
  const elements = root && Array.isArray(root.elements) ? root.elements : []
  const assets: DclExchangeAsset[] = []

  for (const rawElement of elements) {
    const element = objectValue(rawElement)
    if (!element) continue

    const urn = stringValue(element.urn)
    if (!urn) continue
    const collection = parseMaticCollectionV2Urn(urn)
    if (!collection) continue

    const individuals = Array.isArray(element.individualData) ? element.individualData : []
    const firstOwned = individuals
      .map(objectValue)
      .find((entry) => entry && stringValue(entry.tokenId))
    const tokenId = firstOwned ? stringValue(firstOwned.tokenId) : null
    if (!tokenId || !UINT_DECIMAL.test(tokenId)) continue

    const definition = objectValue(element.definition)
    const definitionAddress = definition ? stringValue(definition.collectionAddress) : null
    const contractAddress =
      definitionAddress && isEvmAddress(definitionAddress)
        ? definitionAddress.toLowerCase()
        : collection.contractAddress

    const name =
      stringValue(element.name) ??
      (definition ? stringValue(definition.name) : null) ??
      `${kind === 'wearable' ? 'Wearable' : 'Emote'} #${collection.itemIndex}`
    const category = stringValue(element.category) ?? 'collectible'
    const rarity =
      stringValue(element.rarity) ??
      (definition ? stringValue(definition.rarity) : null) ??
      'collectible'
    const thumbnailUrl = definition ? stringValue(definition.thumbnail) : null
    const ownedCount = Math.max(individuals.length, numericCount(element.amount, 1))

    assets.push({
      id: `${contractAddress}:${tokenId}`,
      kind,
      urn,
      contractAddress,
      tokenId,
      itemIndex: collection.itemIndex,
      name,
      category,
      rarity,
      thumbnailUrl,
      ownedCount
    })
  }

  return assets
}

function addressWord(address: string): string {
  const normalized = address.trim().toLowerCase()
  if (!isEvmAddress(normalized)) throw new Error('Invalid Ethereum address')
  return normalized.slice(2).padStart(64, '0')
}

function uint256Word(value: string): string {
  const normalized = value.trim()
  if (!UINT_DECIMAL.test(normalized)) throw new Error('Invalid ERC-721 token id')
  const hex = BigInt(normalized).toString(16)
  if (hex.length > 64) throw new Error('ERC-721 token id exceeds uint256')
  return hex.padStart(64, '0')
}

/** ABI calldata for safeTransferFrom(address,address,uint256). */
export function encodeErc721SafeTransferFrom(
  from: string,
  to: string,
  tokenId: string
): string {
  return `0x42842e0e${addressWord(from)}${addressWord(to)}${uint256Word(tokenId)}`
}

/** Official Decentraland LAND registry (Ethereum). */
export const DCL_LAND_REGISTRY = '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d'
/** Official Decentraland Estate registry (Ethereum). */
export const DCL_ESTATE_REGISTRY = '0x959e04e3e80e8674778c9c7438f1cea4181481a0'

export type DclLandKind = 'parcel' | 'estate'

export interface DclLandAsset {
  id: string
  kind: DclLandKind
  name: string
  contractAddress: string
  tokenId: string
  thumbnailUrl: string | null
}

export function isOfficialDclLandContract(address: string): boolean {
  const normalized = address.trim().toLowerCase()
  return normalized === DCL_LAND_REGISTRY || normalized === DCL_ESTATE_REGISTRY
}

function officialLandKind(address: string): DclLandKind | null {
  const normalized = address.trim().toLowerCase()
  if (normalized === DCL_LAND_REGISTRY) return 'parcel'
  if (normalized === DCL_ESTATE_REGISTRY) return 'estate'
  return null
}

function pushLand(
  assets: DclLandAsset[],
  seen: Set<string>,
  raw: Record<string, unknown>
): void {
  const contract =
    stringValue(raw.contractAddress) ??
    stringValue(raw.contract) ??
    stringValue(raw.collectionAddress)
  const tokenId =
    stringValue(raw.tokenId) ??
    stringValue(raw.id) ??
    (typeof raw.estateId === 'number' ? String(raw.estateId) : null)
  if (!contract || !tokenId || !UINT_DECIMAL.test(tokenId)) return
  const kind = officialLandKind(contract)
  if (!kind) return
  const id = `${contract.toLowerCase()}:${tokenId}`
  if (seen.has(id)) return
  seen.add(id)
  const x = typeof raw.x === 'number' ? raw.x : Number(raw.x)
  const y = typeof raw.y === 'number' ? raw.y : Number(raw.y)
  const name =
    stringValue(raw.name) ??
    (kind === 'estate'
      ? `Estate #${tokenId}`
      : Number.isFinite(x) && Number.isFinite(y)
        ? `Parcel ${x},${y}`
        : `LAND #${tokenId}`)
  assets.push({
    id,
    kind,
    name,
    contractAddress: contract.toLowerCase(),
    tokenId,
    thumbnailUrl: stringValue(raw.image) ?? stringValue(raw.thumbnail) ?? null
  })
}

/** Catalyst `/lands` (and similar) → official DCL parcels and estates only. */
export function parseOwnedDclLands(payload: unknown): DclLandAsset[] {
  const assets: DclLandAsset[] = []
  const seen = new Set<string>()
  const root = objectValue(payload)
  const buckets: unknown[] = []
  if (Array.isArray(payload)) buckets.push(payload)
  if (root) {
    if (Array.isArray(root.elements)) buckets.push(root.elements)
    if (Array.isArray(root.parcels)) buckets.push(root.parcels)
    if (Array.isArray(root.estates)) buckets.push(root.estates)
    const data = objectValue(root.data)
    if (data) {
      if (Array.isArray(data.parcels)) buckets.push(data.parcels)
      if (Array.isArray(data.estates)) buckets.push(data.estates)
    }
  }
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue
    for (const row of bucket) {
      const record = objectValue(row)
      if (record) pushLand(assets, seen, record)
      const nft = record ? objectValue(record.nft) : null
      if (nft) pushLand(assets, seen, nft)
    }
  }
  return assets
}

/** ETH amount → wei. Six decimal places of input precision, no float dust. */
export function ethToWei(eth: number): bigint {
  const scaled = Math.round(eth * 1e6)
  if (!Number.isFinite(scaled) || scaled <= 0) return 0n
  return (BigInt(scaled) * 10n ** 18n) / 1_000_000n
}
