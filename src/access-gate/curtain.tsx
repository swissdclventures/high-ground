/**
 * THE CURTAIN — what a visitor sees when the scene is not open to them.
 *
 * A gate that works is not the same thing as a gate that is kind. The first cut
 * of this teleported non-passing visitors back outside with a floating red line
 * of 3D text: no reason, no way to fix it, and on a phone the text was behind
 * them before they read it. Turning somebody away is a moment where a scene owes
 * them the most explanation it will ever owe them — what this place is, why the
 * door is shut, and what would open it.
 *
 * So the reject is a screen, not a shove:
 *   - it COVERS, edge to edge, because a half-covered work-in-progress is still
 *     a work-in-progress somebody saw;
 *   - it SAYS WHY, in the scene owner's own words when they wrote them;
 *   - it OFFERS THE FIX when there is one — the wearable's own Marketplace page
 *     is one tap away, so "you need X" and "here is X" are the same screen;
 *   - it ALWAYS OFFERS A WAY OUT that stays in this World when it can. Walking
 *     is locked while the curtain is up, so a locked player with no exit is a
 *     trap. Other OPEN scenes in the same World are the way out; Genesis City
 *     is a last resort only when this World has nowhere else to stand.
 *
 * It is deliberately NOT the arrival cover: that one is a bright sky you fall
 * into, and reading "come back later" off a welcome mat is a mixed message.
 */
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { engine, InputModifier } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { openExternalUrl } from '~system/RestrictedActions'
import { canvasSize, cornerRadius, px, SafeScreen, SvButton, textPx, UI } from '../ui/kit'
import { isLandingCoverBlocking } from '../plugins/landing'
import {
  destButtonLabel,
  ensureWorldDestinations,
  leaveToGenesisCity,
  travelToWorldDest,
  worldDestSnapshot
} from '../world-destinations'

export interface AccessCurtainCopy {
  /** Two or three words. The verdict, not the explanation. */
  headline: string
  /** The explanation, in the owner's words when they wrote one. */
  body: string
  /** One quiet line under the buttons — which wallet we saw, what to try. */
  hint?: string
  /** The fix, when there is one: a Marketplace page, a collection, a mint. */
  action?: { label: string; url: string } | null
  /** A verdict still being read on-chain draws the same screen without buttons. */
  pending?: boolean
}

let copy: AccessCurtainCopy | null = null
let walkLocked = false

export function isAccessCurtainUp(): boolean {
  return copy !== null
}

function lockWalk(): void {
  if (walkLocked) return
  try {
    InputModifier.createOrReplace(engine.PlayerEntity, {
      mode: {
        $case: 'standard',
        standard: {
          disableWalk: true,
          disableJog: true,
          disableRun: true,
          disableJump: true,
          disableDoubleJump: true,
          disableGliding: true
        }
      }
    })
    walkLocked = true
  } catch {
    // The Explorer refuses this before the player entity exists; the next tick retries.
  }
}

function releaseWalk(): void {
  if (!walkLocked) return
  walkLocked = false
  // The arrival cover holds the same lock, on its own latch. Deleting the
  // component out from under it hands a passing visitor their legs back while
  // they are still looking at the cover — and the cover, believing it is still
  // locked, never re-applies it.
  if (isLandingCoverBlocking()) return
  try {
    if (InputModifier.has(engine.PlayerEntity)) InputModifier.deleteFrom(engine.PlayerEntity)
  } catch {
    // ignore
  }
}

/**
 * Raise (or update) the curtain. Called every tick by the gate, so `lockWalk`
 * latches on its own flag rather than rewriting the component each frame — a
 * flickering InputModifier reads to the player as broken controls.
 */
export function armAccessCurtain(next: AccessCurtainCopy): void {
  copy = next
  lockWalk()
  ensureWorldDestinations()
}

/** Drop it — the visitor passed, or the rule was turned off under them. */
export function liftAccessCurtain(): void {
  if (copy === null) return
  copy = null
  releaseWalk()
}

/**
 * Height for a paragraph the renderer will wrap for us.
 *
 * DCL gives no text measurement, so the line count is estimated from the box
 * width and the average glyph advance (~0.52 em for this face at these sizes).
 * It is rounded UP and floored at two lines: a paragraph given too little height
 * is clipped, and clipping the one sentence explaining the rejection is the
 * single worst thing this screen could do.
 */
function paragraphHeight(text: string, fontPx: number, boxW: number): number {
  const perLine = Math.max(12, Math.floor(boxW / (fontPx * 0.52)))
  const lines = Math.max(2, Math.ceil(text.length / perLine))
  return Math.round(lines * fontPx * 1.45)
}

/**
 * FULLY opaque, deliberately. At 0.96 the scene still bled through as a legible
 * ghost — which for a gate whose whole job is "you do not get to see this yet"
 * is the same as failing. There is nothing behind this screen the visitor is
 * entitled to a glimpse of.
 */
const SCRIM = Color4.create(0.02, 0.03, 0.05, 1)
const CARD = Color4.create(0.05, 0.07, 0.1, 1)

export function AccessCurtainRoot() {
  const shown = copy
  if (!shown) return null

  // While the arrival cover is still up it IS the waiting screen — it says
  // ACCESS on its own progress line — and swapping that authored cloudscape for
  // a bare ONE MOMENT card mid-arrival is a worse screen, not an extra one. A
  // decided REJECT still draws over the cover: that hand-off is the point.
  if (shown.pending && isLandingCoverBlocking()) return null

  const canvas = canvasSize()
  const headFont = textPx(40, 24)
  const bodyFont = textPx(20, 16)
  const hintFont = textPx(15, 13)
  const pad = Math.max(16, px(28))
  const cardW = Math.max(260, Math.min(px(620), canvas.width - Math.max(32, px(80))))
  const innerW = cardW - pad * 2
  const bodyH = paragraphHeight(shown.body, bodyFont, innerW)
  const btnH = Math.max(52, px(64))
  const world = worldDestSnapshot()
  const dests = world.destinations.slice(0, 5)

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: 0, left: 0 },
        width: '100%',
        height: '100%',
        // Blocks every pointer beneath it. The scene behind this is not open to
        // this visitor, and that includes anything of ours they could click.
        pointerFilter: 'block',
        zIndex: 980
      }}
      uiBackground={{ color: SCRIM }}
    >
      <SafeScreen>
        <UiEntity
          uiTransform={{
            width: '100%',
            height: '100%',
            justifyContent: 'center',
            alignItems: 'center',
            pointerFilter: 'none'
          }}
        >
          <UiEntity
            uiTransform={{
              width: cardW,
              flexDirection: 'column',
              alignItems: 'center',
              padding: { top: pad, right: pad, bottom: pad, left: pad },
              borderRadius: cornerRadius(UI.radius.lg),
              pointerFilter: 'none'
            }}
            uiBackground={{ color: CARD }}
          >
            <Label
              value={shown.headline}
              fontSize={headFont}
              color={UI.gold}
              textAlign="middle-center"
              uiTransform={{ width: innerW, height: Math.round(headFont * 1.5) }}
            />
            <Label
              value={shown.body}
              fontSize={bodyFont}
              color={UI.white}
              textAlign="middle-center"
              uiTransform={{ width: innerW, height: bodyH, margin: { top: Math.max(8, px(14)) } }}
            />
            {shown.pending ? null : (
              <UiEntity
                uiTransform={{
                  width: innerW,
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  margin: { top: Math.max(12, px(22)) },
                  pointerFilter: 'none'
                }}
              >
                {shown.action ? (
                  <SvButton
                    id="access-curtain-action"
                    label={shown.action.label}
                    width={260}
                    height={64}
                    minPx={btnH}
                    fontPx={textPx(20, 16)}
                    color={UI.inkSolid}
                    position={{ margin: { bottom: Math.max(8, px(12)) } }}
                    onUp={() => {
                      const url = shown.action?.url
                      if (url) void openExternalUrl({ url })
                    }}
                  />
                ) : null}
                {dests.length > 0 ? (
                  <Label
                    value="Open scenes in this World"
                    fontSize={hintFont}
                    color={UI.muted}
                    textAlign="middle-center"
                    uiTransform={{
                      width: innerW,
                      height: Math.round(hintFont * 1.6),
                      margin: { bottom: Math.max(4, px(6)) }
                    }}
                  />
                ) : null}
                {dests.map((scene, i) => (
                  <SvButton
                    id={`access-curtain-dest-${scene.id}`}
                    label={destButtonLabel(scene)}
                    width={280}
                    height={64}
                    minPx={btnH}
                    fontPx={textPx(18, 15)}
                    color={UI.inkSolid}
                    position={{ margin: { top: i === 0 && !shown.action ? 0 : Math.max(6, px(8)) } }}
                    onUp={() => travelToWorldDest(scene)}
                  />
                ))}
                {world.status === 'loading' || world.status === 'idle' ? (
                  <Label
                    value="Finding other places in this World…"
                    fontSize={hintFont}
                    color={UI.muted}
                    textAlign="middle-center"
                    uiTransform={{
                      width: innerW,
                      height: Math.round(hintFont * 2.2),
                      margin: { top: Math.max(8, px(12)) }
                    }}
                  />
                ) : null}
                {world.status === 'ready' && dests.length === 0 ? (
                  <SvButton
                    id="access-curtain-leave-world"
                    label={world.inWorld ? 'LEAVE THIS WORLD' : 'LEAVE'}
                    width={260}
                    height={64}
                    minPx={btnH}
                    fontPx={textPx(18, 15)}
                    color={UI.white}
                    skin={{ color: UI.track, radius: UI.radius.md }}
                    position={{ margin: { top: Math.max(8, px(12)) } }}
                    onUp={() => leaveToGenesisCity()}
                  />
                ) : null}
                {world.status === 'unavailable' && dests.length === 0 ? (
                  <SvButton
                    id="access-curtain-leave-fallback"
                    label={world.inWorld ? 'LEAVE THIS WORLD' : 'LEAVE'}
                    width={260}
                    height={64}
                    minPx={btnH}
                    fontPx={textPx(18, 15)}
                    color={UI.white}
                    skin={{ color: UI.track, radius: UI.radius.md }}
                    position={{ margin: { top: Math.max(8, px(12)) } }}
                    onUp={() => leaveToGenesisCity()}
                  />
                ) : null}
              </UiEntity>
            )}
            {shown.hint ? (
              <Label
                value={shown.hint}
                fontSize={hintFont}
                color={UI.muted}
                textAlign="middle-center"
                uiTransform={{
                  width: innerW,
                  height: paragraphHeight(shown.hint, hintFont, innerW),
                  margin: { top: Math.max(8, px(16)) }
                }}
              />
            ) : null}
          </UiEntity>
        </UiEntity>
      </SafeScreen>
    </UiEntity>
  )
}
