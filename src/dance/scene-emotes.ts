/**
 * Scene-emote resolver for NPCs.
 *
 * The local player plays the bundled .glb dance emotes via triggerSceneEmote({src}).
 * An AvatarShape (our NPCs) CANNOT do that — it plays an emote by URN from its
 * `emotes` list. For a scene-embedded emote the URN is:
 *     urn:decentraland:off-chain:scene-emote:<contentHash>-<loop>
 * where <contentHash> is the deployed file's hash (from the scene content map).
 *
 * So at runtime we read the content map once, map each 'emotes/x.glb' → its URN,
 * hand the whole set to every NPC's `emotes` list, and trigger by URN. If the
 * explorer build doesn't render scene emotes on AvatarShapes, sceneEmoteUrn()
 * returns null and callers fall back to a base emote.
 */
import { getSceneInformation } from '~system/Runtime'
import { bundledEmotePaths } from '@shared/emote-library'
import { dedupeNpcEmoteUrns as dedupeUrns, NPC_EMOTE_SLOTS, setNpcEmotesIfChanged } from '@shared/npc-emote-slots'
import { scrapLoopEmotePaths } from '@shared/scrap-emotes'

export { dedupeUrns, NPC_EMOTE_SLOTS, setNpcEmotesIfChanged }

const hashByPath = new Map<string, string>()
let resolved = false
const listeners = new Set<() => void>()

/**
 * Read the scene content map and record the content hash for each path.
 *
 * `await`, never `.then()`. The `~system/Runtime` binding is not guaranteed to hand back a
 * native Promise in every Explorer build — it is an RPC proxy, and in the live client
 * `getSceneInformation({}).then` threw "is not a function". Every other caller in this scene
 * already awaits inside an async function, which accepts a plain value or a thenable alike.
 * The `.then` form here was the ONLY one, and it took the whole vehicles plugin down with it
 * (the starter throws synchronously, the boot pacer catches it, and the car never appears).
 * An async wrapper cannot throw into its caller: any failure lands in the catch below.
 */
export function resolveSceneEmotes(paths: string[] = bundledEmotePaths()): void {
  void resolveSceneEmotesAsync(paths)
}

async function resolveSceneEmotesAsync(paths: string[]): Promise<void> {
  try {
    const info = await getSceneInformation({})
    const hashByFile = new Map<string, string>()
    for (const c of info.content) hashByFile.set(c.file.toLowerCase(), c.hash)
    for (const p of paths) {
      const h = hashByFile.get(p.toLowerCase())
      if (h) hashByPath.set(p, h)
    }
    resolved = true
    for (const fn of listeners) fn()
  } catch (e) {
    console.log('[scene-emotes] resolve failed, NPCs stay on base emotes:', e)
  }
}

/**
 * The scene-emote URN for a bundled path, or null if not resolved / not a path.
 *
 * The `-<loop>` suffix is part of the URN, so the SAME file has two URNs. NPCs want
 * `loop=false` (one play per trigger, re-triggered for idles); a held pose such as the
 * flight body wants `loop=true` or it plays once and drops back to the idle animation.
 */
export function sceneEmoteUrnFor(pathOrName: string, loop: boolean): string | null {
  const hash = hashByPath.get(pathOrName)
  return hash ? `urn:decentraland:off-chain:scene-emote:${hash}-${loop}` : null
}

/** The one-shot URN — what every NPC caller means. */
export function sceneEmoteUrn(pathOrName: string): string | null {
  return sceneEmoteUrnFor(pathOrName, false)
}

/** All resolved URNs — hand this to each NPC AvatarShape.emotes so it can play them. */
export function allSceneEmoteUrns(): string[] {
  const out: string[] = []
  for (const p of hashByPath.keys()) {
    const one = sceneEmoteUrnFor(p, false)
    const loop = sceneEmoteUrnFor(p, true)
    if (one) out.push(one)
    if (loop) out.push(loop)
  }
  return out
}

export function onSceneEmotesResolved(fn: () => void): void {
  if (resolved) fn()
  else listeners.add(fn)
}

/**
 * How many scene-emote clips one NPC carries.
 *
 * DCL gives a REAL player ten emote slots. The troupe used to hand every NPC the
 * whole bundled library — 54 GLBs, each in its `-false` and `-true` variant, so
 * 108 animation clips to bind against that avatar's armature — on up to 28 live
 * AvatarShapes at once, with the list rewritten on every fight beat.
 *
 * That is the mesh-explosion the owner keeps reporting: streaks connecting parts
 * of a body that are not connected, detached shards on the floor metres away,
 * one NPC going first and the rest of the crowd following. It is the avatar
 * animator writing garbage bone matrices, not a bad wearable — which is why
 * neighbours in the SAME outfit look fine right up until they break too.
 */
// The slot budget and idempotent writer live in shared/npc-emote-slots.ts so
// their renderer-sensitive behavior can be tested outside the Explorer RPC.

/** Looping fight holds. A held pose must stay triggerable, so these are pinned. */
export function npcHoldEmoteUrns(): string[] {
  return scrapLoopEmotePaths()
    .map((path) => sceneEmoteUrnFor(path, true))
    .filter((urn): urn is string => urn !== null)
}

/**
 * WHAT TO WRITE INTO `AvatarShape.expressionTriggerId` FOR AN NPC.
 *
 * The Unity Explorer decides how to play an NPC emote by the id's SHAPE:
 * an id ending in `.glb` is a SCENE emote — the client looks that path up in
 * the scene's own content map, loads the clip and plays it. Anything else is
 * treated as a marketplace emote URN and looked up in the catalog. It never
 * consults `emotes[]` for scene clips, and its own internal name for a loaded
 * scene emote embeds the scene id, so the `urn:decentraland:off-chain:scene-emote:
 * <hash>-<loop>` form this runtime used to send (the OLD web client's format)
 * matched nothing and every custom clip was silently dropped — while `clap`
 * and `wave` kept working because those are catalog ids. That asymmetry was
 * the whole "the NPC never does the punch" saga.
 *
 * So: a bundled path goes out AS THE PATH; a base emote name goes out as-is.
 * Looping scene emotes are not supported on NPCs by the client ("not supported
 * yet" in AvatarShapeHandlerSystem), so a held pose must be re-triggered.
 *
 * Source: decentraland/unity-explorer, Explorer/Assets/DCL/SDKComponents/
 * AvatarShape/Systems/AvatarShapeHandlerSystem.cs (`EndsWith(".glb")`).
 */
export function npcEmoteTrigger(ref: string): string {
  return ref
}

export function npcEmoteArmed(shape: { emotes: string[] }, urn: string): boolean {
  return !!urn && (shape.emotes ?? []).includes(urn)
}

/**
 * Guarantee `urn` is triggerable on this shape RIGHT NOW, within the slot
 * budget. If it is already in the list — any slot — do not reshuffle: moving
 * a bound clip to slot zero on the fire frame is what left the opponent as a
 * standing dummy (Explorer re-binds, the trigger lands on an unbound GLB).
 *
 * Slot zero is only used when the clip is NEW. Looping holds stay pinned
 * behind a newly added clip so a fallen NPC can still be held down.
 */
export function ensureNpcEmote(
  shape: { emotes: string[] },
  urn: string,
  reserved: readonly string[] = []
): void {
  if (!urn || !urn.startsWith('urn:')) return
  const have = shape.emotes ?? []
  if (npcEmoteArmed(shape, urn)) return
  const pinned = reserved.filter((item) => !!item)
  if (pinned.length) {
    // Combat clips are already bound. A taunt must not evict jab/kick — that
    // slot-on-fire reshuffle is the standing dummy.
    if (pinned.some((item) => item === urn)) {
      shape.emotes = dedupeUrns([...pinned, ...have]).slice(0, NPC_EMOTE_SLOTS)
      return
    }
    const rest = have.filter((item) => !pinned.includes(item))
    const next = dedupeUrns([...pinned, urn, ...rest]).slice(0, NPC_EMOTE_SLOTS)
    if (!next.includes(urn)) return
    if (pinned.some((item) => have.includes(item) && !next.includes(item))) return
    shape.emotes = next
    return
  }
  shape.emotes = dedupeUrns([urn, ...npcHoldEmoteUrns(), ...have]).slice(0, NPC_EMOTE_SLOTS)
}
