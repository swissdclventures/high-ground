/**
 * The scene-wide access gate — the Step 1 "Access" control's runtime.
 *
 * WHAT CHANGED, AND WHY IT MATTERS: this used to run ONLY when the full Social
 * venue was off, and it enforced by teleporting non-passing visitors out of the
 * building's footprint. Both halves were wrong for anything that is not a
 * building. A venue scene — every island, arena and plot the Builder now
 * publishes — took the early return and was enforced by nothing at all: the
 * Access rule saved, survived reload, and let the whole world walk in. And a
 * scene with no building has no footprint to be ejected from.
 *
 * So the gate is now about the SCENE, and it enforces with a curtain
 * (`./curtain.tsx`) rather than a shove: the visitor is held at a screen that
 * says why, offers the fix where one exists, and always offers the way out. See
 * that file for why the reject is a screen.
 *
 * PENDING IS NOT PASS. An on-chain read takes a second or two, and the honest
 * default while it is outstanding is "not yet" — the curtain goes up with a
 * checking message and lifts the moment the answer is yes. The reverse (open
 * until proven closed) shows the unfinished scene to exactly the person the rule
 * was written to keep out.
 */

import { engine } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/src/players'
import type { SceneRuntimeConfig } from '@shared/scene-runtime-config'
import type { GateRule } from '@shared/social-surface-contract'
import {
  activeBuildingGateRule,
  gateContracts,
  normalizeSocialWallet
} from '@shared/social-surface-contract'
import {
  getNftGateCached,
  initNftChecker,
  nftGateReadFailures,
  requestNftGateCheck
} from '../social/nft-check'
import { playerWallet } from '../social/player'
import {
  buyLabel,
  collectionBrowseUrl,
  getBuyableItem,
  marketplaceItemUrl,
  requestBuyableItem
} from '../social/marketplace-link'
import { reportLandingAccessResolved } from '../plugins/landing'
import { armAccessCurtain, liftAccessCurtain, type AccessCurtainCopy } from './curtain'

type Verdict = 'pass' | 'pending' | 'no-wallet' | 'fail'

/**
 * The fix, one tap from the reject — an ITEM, not a shop front.
 *
 * A collection gate names a contract, and a contract is not something you can
 * buy. So this asks the catalog for the cheapest thing currently on sale in it
 * and points at that item's own page, price on the button. Until the answer
 * lands (and if nothing in the collection is for sale at all) it falls back to
 * the collection filtered to what IS buyable.
 *
 * What it must never be again is `…/contracts/<contract>/items`, which is not
 * a Marketplace route: it silently renders the Marketplace home page, so the
 * visitor was told "pick up an item" and handed a shop directory.
 */
function collectionAction(rule: GateRule): { label: string; url: string } | null {
  const contracts = gateContracts(rule)
  if (!contracts.length) return null
  requestBuyableItem(contracts)
  const item = getBuyableItem(contracts)
  if (item) return { label: buyLabel(item), url: item.url }
  const browse = collectionBrowseUrl(contracts)
  return browse ? { label: 'VIEW COLLECTION', url: browse } : null
}

/**
 * A wearable rule names the exact item, so this needs no lookup — the URN
 * already carries the contract and the item id.
 *
 * An unparseable URN now yields NO button rather than a link to the Marketplace
 * front page: a button that lands somewhere useless is worse than the absence
 * of one, because the visitor spends their one action on it.
 */
function wearableUrl(rule: GateRule): string | null {
  const urn = (rule.wearableUrns ?? [])[0]
  if (!urn) return null
  const parts = urn.split(':')
  const item = parts[parts.length - 1]
  const contract = parts[parts.length - 2]
  if (contract?.startsWith('0x') && item) return marketplaceItemUrl(contract, item)
  return null
}

/**
 * The reject, per reason.
 *
 * The owner's own `deniedMessage` always wins the body when they wrote one —
 * they know what this scene is and when it opens, and a generic line in its
 * place is the scene refusing to explain itself. The defaults below are what a
 * rule that was never given a message says instead, and each one is written to
 * answer the visitor's actual question rather than to state the rule.
 */
/**
 * The contract fills an unset `deniedMessage` with the literal "Access denied",
 * so an owner who never wrote one still arrived here with a truthy string — and
 * it beat every explanation below. The reject then read, in full: MEMBERS ONLY
 * / Access denied. Which is the headline again, with no reason and no fix.
 */
const PLACEHOLDER_DENIED = 'access denied'

function rejectCopy(rule: GateRule, verdict: Verdict, wallet: string | null): AccessCurtainCopy {
  const authored = rule.deniedMessage.trim()
  const owner = authored.toLowerCase() === PLACEHOLDER_DENIED ? '' : authored
  const shortWallet = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : null

  if (verdict === 'pending') {
    // Two very different waits wear the same word otherwise: a read in flight,
    // and a chain that has refused three times running. The second one is not
    // the visitor's fault and should not look like a verdict about them.
    const failures = wallet ? nftGateReadFailures(wallet, rule) : 0
    if (failures >= 3) {
      return {
        headline: 'CHECKING…',
        body:
          'We cannot reach the chain to confirm what you hold. This is on our side, not yours — still trying.',
        hint: 'Nobody is being turned away while this line is up.',
        pending: true
      }
    }
    return {
      headline: 'ONE MOMENT',
      body: 'Checking your wallet for the item this scene asks for.',
      pending: true
    }
  }

  if (verdict === 'no-wallet') {
    return {
      headline: 'SIGN IN TO ENTER',
      body:
        owner ||
        'This scene checks your wallet before letting you in. Sign in with the wallet that holds the item and come back.',
      hint: 'Guests and unsigned sessions cannot be checked.'
    }
  }

  switch (rule.mode) {
    case 'allowlist': {
      // Empty list is the contract's "admins and nobody else" — the same shape
      // the Builder saves for both "Admins only" and a named guest list.
      const named = (rule.allowedAddresses ?? []).length > 0
      return {
        headline: named ? 'PRIVATE SCENE' : 'NOT OPEN YET',
        body:
          owner ||
          (named
            ? 'This scene is open to a specific guest list. Your wallet is not on it yet.'
            : 'This scene is still being built. It is closed to everyone but its team while the work is going on — come back soon.'),
        hint: shortWallet ? `Signed in as ${shortWallet}` : undefined
      }
    }
    case 'wearable_equipped': {
      const url = wearableUrl(rule)
      return {
        headline: 'WEARABLE REQUIRED',
        body:
          owner ||
          'This scene is open to visitors wearing a particular item. Put it on in your backpack and walk back in.',
        action: url ? { label: 'GET IT', url } : null,
        hint: 'Already own it? Equip it in your backpack, then re-enter.'
      }
    }
    case 'nft_collection':
    case 'nft_token': {
      return {
        headline: 'MEMBERS ONLY',
        body:
          owner ||
          'This scene is open to holders of its collection. Pick up an item and the door opens for you.',
        action: collectionAction(rule),
        hint: shortWallet ? `Checked ${shortWallet}` : undefined
      }
    }
    default:
      return {
        headline: 'NOT OPEN YET',
        body: owner || 'This scene is closed right now.',
        hint: shortWallet ? `Signed in as ${shortWallet}` : undefined
      }
  }
}

export function initBuildingAccessGate(config: SceneRuntimeConfig): void {
  const social = config.social
  if (!social) return
  const rule = activeBuildingGateRule(social)
  if (!rule) return

  const admins = new Set(
    (social.event?.adminWallets ?? [])
      .map((a) => normalizeSocialWallet(a))
      .filter((a): a is string => Boolean(a))
  )

  const readsChain = rule.mode === 'nft_collection' || rule.mode === 'nft_token'
  if (readsChain) initNftChecker()

  const verdict = (): Verdict => {
    const wallet = playerWallet()
    if (!wallet) {
      // Player data can be a frame or two behind the first tick; only call it a
      // guest once the Explorer has actually handed us a profile.
      return getPlayer() ? 'no-wallet' : 'pending'
    }
    if (admins.has(wallet)) return 'pass'

    switch (rule.mode) {
      case 'allowlist':
        return (rule.allowedAddresses ?? []).map((a) => a.toLowerCase()).includes(wallet)
          ? 'pass'
          : 'fail'
      case 'wearable_equipped': {
        const player = getPlayer()
        if (!player) return 'pending'
        const worn = player.wearables ?? []
        const needed = rule.wearableUrns ?? []
        if (!needed.length) return 'fail'
        // A worn URN carries a token id the rule's base URN does not, so compare
        // on the prefix — an exact match never fires for a minted item.
        const has = (urn: string) => worn.some((w) => w === urn || w.startsWith(`${urn}:`))
        return (rule.match === 'all' ? needed.every(has) : needed.some(has)) ? 'pass' : 'fail'
      }
      case 'nft_collection':
      case 'nft_token': {
        const cached = getNftGateCached(wallet, rule)
        if (cached === null) {
          requestNftGateCheck(wallet, rule)
          return 'pending'
        }
        return cached ? 'pass' : 'fail'
      }
      default:
        return 'fail'
    }
  }

  // The verdict is polled EVERY frame until it is decided, then ~6 times a
  // second. The old flat 1-in-10 throttle spent its first frames unarmed, which
  // is a tenth of a second of an ungated scene on screen for a visitor who is
  // not allowed to see it.
  let tick = 0
  let decided = false
  engine.addSystem(() => {
    tick += 1
    if (decided && tick % 10 !== 0) return
    const answer = verdict()
    decided = answer !== 'pending'
    // The arrival cover holds itself up until this says yes-or-no, so the door
    // is decided BEHIND the cover rather than over a scene already on screen.
    reportLandingAccessResolved(decided)
    if (answer === 'pass') {
      liftAccessCurtain()
      return
    }
    armAccessCurtain(rejectCopy(rule, answer, playerWallet()))
  })
}
