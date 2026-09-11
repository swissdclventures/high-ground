import { engine, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { MessageBus } from '@dcl/sdk/message-bus'
import { getPlayer } from '@dcl/sdk/players'
import { sendAsync } from '../explorer-wallet-rpc'
import {
  encodeErc721SafeTransferFrom,
  isEvmAddress,
  parseOwnedDclAssets,
  type DclExchangeAsset
} from '@shared/dcl-exchange'
import { setActivePanel } from '../social/panel-state'

export type ExchangePhase = 'person' | 'item' | 'review' | 'sending' | 'success'

export interface ExchangeRecipient {
  userId: string
  wallet: string
  name: string
  distance: number
}

export interface IncomingGiftNotice {
  fromName: string
  itemName: string
  txHash: string
  expiresAt: number
}

const POLYGON_CHAIN_ID = '0x89'
const DCL_CATALYST = 'https://peer.decentraland.org'
const INVENTORY_PAGE_SIZE = 60
const RECIPIENT_SAMPLE_SECONDS = 0.75
const RECEIPT_ATTEMPTS = 20
const RECEIPT_WAIT_MS = 3000
const INCOMING_NOTICE_MS = 12000

let phase: ExchangePhase = 'person'
let recipients: ExchangeRecipient[] = []
let assets: DclExchangeAsset[] = []
let selectedRecipientWallet: string | null = null
let selectedAssetId: string | null = null
let inventoryLoading = false
let inventoryLoadedFor: string | null = null
let statusLine = ''
let errorLine = ''
let transactionHash: string | null = null
let transactionConfirmed = false
let uiTick = 0
let recipientSignature = ''
let recipientElapsed = RECIPIENT_SAMPLE_SECONDS
let initialized = false
let rpcId = 1
let incomingNotice: IncomingGiftNotice | null = null

const exchangeBus = new MessageBus()

function bump(): void {
  uiTick += 1
}

function localWallet(): string | null {
  const identity = PlayerIdentityData.getOrNull(engine.PlayerEntity)
  if (identity && !identity.isGuest && isEvmAddress(identity.address)) {
    return identity.address.toLowerCase()
  }
  const player = getPlayer()
  if (!player?.isGuest && isEvmAddress(player?.userId ?? '')) return player!.userId.toLowerCase()
  return null
}

function shortName(wallet: string): string {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
}

function sampleRecipients(): void {
  const me = localWallet()
  const meTransform = Transform.getOrNull(engine.PlayerEntity)
  const next: ExchangeRecipient[] = []

  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.isGuest || !isEvmAddress(identity.address)) continue
    const wallet = identity.address.toLowerCase()
    if (wallet === me) continue
    const player = getPlayer({ userId: identity.address })
    const otherTransform = Transform.getOrNull(entity)
    const distance =
      meTransform && otherTransform
        ? Math.sqrt(
            (meTransform.position.x - otherTransform.position.x) ** 2 +
              (meTransform.position.z - otherTransform.position.z) ** 2
          )
        : 0
    next.push({
      userId: identity.address,
      wallet,
      name: player?.name?.trim() || shortName(wallet),
      distance
    })
  }

  next.sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
  const trimmed = next.slice(0, 24)
  const signature = trimmed
    .map((recipient) => `${recipient.wallet}:${recipient.name}:${Math.round(recipient.distance)}`)
    .join('|')
  if (signature === recipientSignature) return

  recipientSignature = signature
  recipients = trimmed
  if (
    selectedRecipientWallet &&
    !recipients.some((recipient) => recipient.wallet === selectedRecipientWallet) &&
    phase !== 'sending' &&
    phase !== 'success'
  ) {
    selectedRecipientWallet = null
    selectedAssetId = null
    phase = 'person'
    errorLine = 'That player left the scene. Choose someone who is still nearby.'
  }
  bump()
}

function exchangeSystem(dt: number): void {
  recipientElapsed += dt
  if (recipientElapsed >= RECIPIENT_SAMPLE_SECONDS) {
    recipientElapsed = 0
    sampleRecipients()
  }
  if (incomingNotice && Date.now() >= incomingNotice.expiresAt) {
    incomingNotice = null
    bump()
  }
}

async function fetchOwnedKind(
  baseUrl: string,
  wallet: string,
  kind: 'wearable' | 'emote'
): Promise<DclExchangeAsset[]> {
  const route = kind === 'wearable' ? 'wearables' : 'emotes'
  const url = `${baseUrl}/lambdas/users/${encodeURIComponent(wallet)}/${route}?includeDefinitions=true&pageNum=1&pageSize=${INVENTORY_PAGE_SIZE}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${kind === 'wearable' ? 'Wearables' : 'Emotes'} request failed (${response.status})`)
  return parseOwnedDclAssets(kind, await response.json())
}

export async function loadExchangeInventory(force = false): Promise<void> {
  const wallet = localWallet()
  if (!wallet) {
    inventoryLoading = false
    inventoryLoadedFor = null
    assets = []
    errorLine = 'Connect a wallet-backed Decentraland account to exchange collectibles.'
    bump()
    return
  }
  if (inventoryLoading || (!force && inventoryLoadedFor === wallet)) return

  inventoryLoading = true
  statusLine = 'Loading your Decentraland collectibles...'
  errorLine = ''
  bump()

  const problems: string[] = []
  let wearables: DclExchangeAsset[] = []
  let emotes: DclExchangeAsset[] = []
  try {
    try {
      wearables = await fetchOwnedKind(DCL_CATALYST, wallet, 'wearable')
    } catch (error) {
      problems.push(error instanceof Error ? error.message : 'Wearables could not be loaded')
    }
    try {
      emotes = await fetchOwnedKind(DCL_CATALYST, wallet, 'emote')
    } catch (error) {
      problems.push(error instanceof Error ? error.message : 'Emotes could not be loaded')
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : 'The Decentraland inventory service is unavailable')
  }

  assets = [...wearables, ...emotes].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
  )
  inventoryLoading = false
  inventoryLoadedFor = wallet
  statusLine = assets.length
    ? `${assets.length} collectible design${assets.length === 1 ? '' : 's'} ready to gift`
    : 'No transferable Polygon wearables or emotes found.'
  errorLine = problems.length === 2 ? problems.join(' | ') : problems[0] ?? ''
  bump()
}

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await sendAsync({
    id: rpcId++,
    method,
    jsonParams: JSON.stringify(params)
  })
  let value: unknown
  try {
    value = JSON.parse(response.jsonAnyResponse)
  } catch {
    value = response.jsonAnyResponse
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (record.error) {
      const error = record.error as Record<string, unknown>
      throw new Error(String(error.message ?? 'Wallet request failed'))
    }
    if ('result' in record) return record.result
  }
  return value
}

function normalizeChainId(value: unknown): string {
  if (typeof value === 'number') return `0x${value.toString(16)}`
  if (typeof value !== 'string') return ''
  const normalized = value.toLowerCase()
  if (normalized.startsWith('0x')) return normalized
  const decimal = Number(normalized)
  return Number.isFinite(decimal) ? `0x${decimal.toString(16)}` : normalized
}

async function ensurePolygon(): Promise<void> {
  let chainId = ''
  try {
    chainId = normalizeChainId(await rpc('eth_chainId', []))
  } catch {
    // Some Explorer wallet bridges don't expose eth_chainId until the first
    // wallet request. The switch call below remains the safe path.
  }
  if (chainId === POLYGON_CHAIN_ID) return

  try {
    await rpc('wallet_switchEthereumChain', [{ chainId: POLYGON_CHAIN_ID }])
  } catch (error) {
    throw new Error(
      `Switch your wallet to Polygon and try again. ${error instanceof Error ? error.message : ''}`.trim()
    )
  }
}

function receiptStatus(receipt: unknown): 'pending' | 'success' | 'failed' {
  if (!receipt || typeof receipt !== 'object') return 'pending'
  const status = (receipt as Record<string, unknown>).status
  if (status === '0x1' || status === 1 || status === true) return 'success'
  if (status === '0x0' || status === 0 || status === false) return 'failed'
  return 'pending'
}

async function waitForReceipt(txHash: string): Promise<'success' | 'failed' | 'pending'> {
  for (let attempt = 0; attempt < RECEIPT_ATTEMPTS; attempt++) {
    try {
      const status = receiptStatus(await rpc('eth_getTransactionReceipt', [txHash]))
      if (status !== 'pending') return status
    } catch {
      // A submitted hash is still useful even if this wallet bridge does not
      // proxy receipt reads. Keep waiting, then finish as submitted/pending.
    }
    await new Promise<void>((resolve) => setTimeout(resolve, RECEIPT_WAIT_MS))
  }
  return 'pending'
}

function friendlyWalletError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const lower = raw.toLowerCase()
  if (lower.includes('user rejected') || lower.includes('denied') || lower.includes('cancel')) {
    return 'Transfer cancelled in your wallet. Nothing was sent.'
  }
  if (lower.includes('insufficient funds')) {
    return 'Your wallet needs a small amount of POL for Polygon gas.'
  }
  if (lower.includes('not owner') || lower.includes('transfer caller')) {
    return 'This NFT is no longer owned by your wallet. Refresh your items.'
  }
  return raw || 'The wallet could not submit this transfer.'
}

function emitGiftNotice(fromName: string, to: string, itemName: string, txHash: string): void {
  exchangeBus.emit('exchange.gift', { fromName, to, itemName, txHash })
}

export async function submitExchangeGift(): Promise<void> {
  if (phase === 'sending') return
  const from = localWallet()
  const recipient = getSelectedExchangeRecipient()
  const asset = getSelectedExchangeAsset()
  if (!from) {
    errorLine = 'Connect a wallet-backed Decentraland account first.'
    bump()
    return
  }
  if (!recipient || !recipients.some((candidate) => candidate.wallet === recipient.wallet)) {
    phase = 'person'
    selectedRecipientWallet = null
    errorLine = 'The recipient must still be present in this scene.'
    bump()
    return
  }
  if (!asset) {
    phase = 'item'
    errorLine = 'Choose a collectible to gift.'
    bump()
    return
  }

  phase = 'sending'
  transactionHash = null
  transactionConfirmed = false
  errorLine = ''
  statusLine = 'Open your wallet and approve the Polygon transfer.'
  bump()

  try {
    await ensurePolygon()
    const data = encodeErc721SafeTransferFrom(from, recipient.wallet, asset.tokenId)
    const response = await rpc('eth_sendTransaction', [
      { from, to: asset.contractAddress, data, value: '0x0' }
    ])
    const txHash = typeof response === 'string' ? response : ''
    if (!/^0x[a-f0-9]{64}$/i.test(txHash)) {
      throw new Error('The wallet did not return a valid transaction hash.')
    }

    transactionHash = txHash
    statusLine = 'Transfer submitted. Waiting for Polygon confirmation...'
    bump()

    const receipt = await waitForReceipt(txHash)
    if (receipt === 'failed') throw new Error('Polygon rejected the transfer transaction.')

    phase = 'success'
    transactionConfirmed = receipt === 'success'
    statusLine = transactionConfirmed
      ? `${asset.name} now belongs to ${recipient.name}.`
      : `Transfer submitted to Polygon. It may take another moment to confirm.`
    const senderName = getPlayer()?.name?.trim() || shortName(from)
    emitGiftNotice(senderName, recipient.wallet, asset.name, txHash)
    bump()
  } catch (error) {
    phase = 'review'
    transactionHash = null
    transactionConfirmed = false
    statusLine = ''
    errorLine = friendlyWalletError(error)
    bump()
  }
}

export function initExchange(): void {
  if (initialized) return
  initialized = true
  engine.addSystem(exchangeSystem)
  exchangeBus.on('exchange.gift', (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return
    const message = payload as Record<string, unknown>
    const me = localWallet()
    const to = typeof message.to === 'string' ? message.to.toLowerCase() : ''
    const txHash = typeof message.txHash === 'string' ? message.txHash : ''
    if (!me || to !== me || !/^0x[a-f0-9]{64}$/i.test(txHash)) return
    incomingNotice = {
      fromName: typeof message.fromName === 'string' ? message.fromName.slice(0, 50) : 'Someone nearby',
      itemName: typeof message.itemName === 'string' ? message.itemName.slice(0, 80) : 'a collectible',
      txHash,
      expiresAt: Date.now() + INCOMING_NOTICE_MS
    }
    bump()
  })
  sampleRecipients()
}

export function openExchange(): void {
  setActivePanel('exchange')
  if (phase === 'success') resetExchangeFlow()
  errorLine = ''
  bump()
  void loadExchangeInventory()
}

export function closeExchange(): void {
  if (phase === 'sending') return
  setActivePanel('none')
  errorLine = ''
  bump()
}

export function resetExchangeFlow(): void {
  phase = 'person'
  selectedRecipientWallet = null
  selectedAssetId = null
  transactionHash = null
  transactionConfirmed = false
  statusLine = assets.length ? `${assets.length} collectible designs ready to gift` : statusLine
  errorLine = ''
  bump()
}

export function chooseExchangeRecipient(wallet: string): void {
  const recipient = recipients.find((candidate) => candidate.wallet === wallet.toLowerCase())
  if (!recipient) return
  selectedRecipientWallet = recipient.wallet
  selectedAssetId = null
  phase = 'item'
  errorLine = ''
  bump()
}

export function chooseExchangeAsset(assetId: string): void {
  if (!assets.some((asset) => asset.id === assetId)) return
  selectedAssetId = assetId
  phase = 'review'
  errorLine = ''
  bump()
}

export function exchangeBack(): void {
  if (phase === 'item') {
    phase = 'person'
    selectedRecipientWallet = null
    selectedAssetId = null
  } else if (phase === 'review') {
    phase = 'item'
    selectedAssetId = null
  }
  errorLine = ''
  bump()
}

export function giftAnother(): void {
  resetExchangeFlow()
  void loadExchangeInventory(true)
}

export function dismissIncomingGiftNotice(): void {
  incomingNotice = null
  bump()
}

export function getExchangeUiTick(): number {
  return uiTick
}

export function getExchangeLocalWallet(): string | null {
  return localWallet()
}

export function getExchangePhase(): ExchangePhase {
  return phase
}

export function getExchangeRecipients(): ExchangeRecipient[] {
  return recipients
}

export function getExchangeAssets(): DclExchangeAsset[] {
  return assets
}

export function getSelectedExchangeRecipient(): ExchangeRecipient | null {
  return recipients.find((recipient) => recipient.wallet === selectedRecipientWallet) ?? null
}

export function getSelectedExchangeAsset(): DclExchangeAsset | null {
  return assets.find((asset) => asset.id === selectedAssetId) ?? null
}

export function isExchangeInventoryLoading(): boolean {
  return inventoryLoading
}

export function getExchangeStatusLine(): string {
  return statusLine
}

export function getExchangeErrorLine(): string {
  return errorLine
}

export function getExchangeTransaction(): { hash: string | null; confirmed: boolean } {
  return { hash: transactionHash, confirmed: transactionConfirmed }
}

export function getIncomingGiftNotice(): IncomingGiftNotice | null {
  return incomingNotice
}
