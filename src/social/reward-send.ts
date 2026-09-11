import { createExplorerWalletProvider } from '../explorer-wallet-rpc'
import type { RewardNftConfig, SocialChain } from '@shared/social-surface-contract'
import {
  chainIdHexForSocialChain,
  encodeSafeTransferFromCalldata
} from '@shared/nft-gate-encoding'
import { playerWallet } from './player'

const provider = createExplorerWalletProvider()

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

function unwrapResult(response: unknown): string | null {
  if (!response) return null
  if (typeof response === 'string') return response
  if (typeof response === 'object' && response !== null && 'result' in response) {
    const r = (response as { result?: unknown }).result
    return typeof r === 'string' ? r : null
  }
  return null
}

async function ensureChain(chain: SocialChain): Promise<void> {
  const wanted = chainIdHexForSocialChain(chain)
  try {
    const current = unwrapResult(await rpcCall('eth_chainId', []))
    if (current?.toLowerCase() === wanted.toLowerCase()) return
    await rpcCall('wallet_switchEthereumChain', [{ chainId: wanted }])
  } catch {
    // Host may cancel or wallet may not support switch — transfer will fail clearly.
  }
}

export type RewardSendResult =
  | { ok: true; txHash: string }
  | { ok: false; reason: string }

/**
 * Host wallet sends one ERC-721 to the guest via safeTransferFrom.
 * Guest does not sign. Host pays gas and must own the token.
 */
export async function sendRewardNftToGuest(
  guestWallet: string,
  reward: RewardNftConfig
): Promise<RewardSendResult> {
  const from = playerWallet()
  if (!from) return { ok: false, reason: 'Connect your host wallet first' }
  if (!guestWallet) return { ok: false, reason: 'Guest has no wallet' }
  if (!reward.contract || !reward.tokenId) {
    return { ok: false, reason: 'Reward NFT is not configured' }
  }

  const to = guestWallet.toLowerCase()
  if (to === from) return { ok: false, reason: 'Cannot send reward to yourself' }

  await ensureChain(reward.chain)

  const data = encodeSafeTransferFromCalldata(from, to, reward.tokenId)
  try {
    const raw = await rpcCall('eth_sendTransaction', [
      {
        from,
        to: reward.contract.toLowerCase(),
        data,
        value: '0x0'
      }
    ])
    const txHash = unwrapResult(raw)
    if (!txHash) return { ok: false, reason: 'Wallet did not return a transaction' }
    return { ok: true, txHash }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Transfer cancelled or failed'
    return { ok: false, reason: msg }
  }
}
