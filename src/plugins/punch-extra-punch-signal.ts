import { punchAlpha, PUNCH_UI } from './punch-visual-theme'
/**
 * THE EXTRA PUNCH, ON THE PLAYER — so the room sees the swing was granted.
 *
 * A save used to flash `+1 PUNCH` only on each person's HUD. Spectators looking
 * at the bag never saw it on the person who just got another go. This sits on
 * the Explorer nametag of whoever is up, billboarded, gold, on every client.
 */
import {
  AvatarAnchorPointType,
  AvatarAttach,
  Billboard,
  Entity,
  TextAlignMode,
  TextShape,
  Transform,
  engine,
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

/** Long enough that someone watching the bag can look up and still catch it. */
export const PUNCH_EXTRA_PUNCH_WORLD_MS = 4_200
const LIFT_M = 0.62
const LABEL = '+1 PUNCH'

interface Badge {
  root: Entity
  face: Entity
  userId: string
  mine: boolean
  until: number
}

let badge: Badge | null = null

function drop(): void {
  if (!badge) return
  engine.removeEntityWithChildren(badge.root)
  badge = null
}

export function showExtraPunchOverHead(input: { userId: string; mine: boolean; now: number }): void {
  const userId = (input.userId || '').trim()
  if (!userId) return
  const until = input.now + PUNCH_EXTRA_PUNCH_WORLD_MS
  if (badge && badge.userId === userId && badge.mine === input.mine) {
    badge.until = until
    return
  }
  drop()
  const root = engine.addEntity()
  Transform.create(root, { position: Vector3.Zero() })
  AvatarAttach.create(
    root,
    input.mine
      ? { anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG }
      : { avatarId: userId, anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG },
  )
  const face = engine.addEntity()
  Transform.create(face, { parent: root, position: Vector3.create(0, LIFT_M, 0) })
  Billboard.create(face)
  TextShape.create(face, {
    text: LABEL,
    fontSize: 2.15,
    textAlign: TextAlignMode.TAM_BOTTOM_CENTER,
    textColor: PUNCH_UI.goldHot,
    outlineColor: punchAlpha(PUNCH_UI.ink, 0.95),
    outlineWidth: 0.18,
  })
  badge = { root, face, userId, mine: input.mine, until }
}

export function updateExtraPunchOverHead(now: number): void {
  if (badge && now >= badge.until) drop()
}

export function clearExtraPunchOverHead(): void {
  drop()
}
