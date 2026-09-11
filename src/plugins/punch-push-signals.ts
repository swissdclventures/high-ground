import { punchAlpha, PUNCH_UI } from './punch-visual-theme'
/**
 * THE PUSH, ON THE BODY — so the room can see the struggle without a HUD.
 *
 * The save used to live only on a full-screen veil. Everyone in range stared
 * at their own overlay and never at the person working. These bars sit above
 * the Explorer nametag: a short vertical column whose fill is that helper's
 * live grade, and a number on top that becomes the result when the window ends.
 *
 * Same attach as the Focus balloons (`AAPT_NAME_TAG`). Different shape, on
 * purpose — Focus is off on this island, and a speech bubble that said
 * FOCUSING would teach the wrong verb.
 */
import {
  AvatarAnchorPointType,
  AvatarAttach,
  Billboard,
  Entity,
  Material,
  MeshRenderer,
  TextAlignMode,
  TextShape,
  Transform,
  VisibilityComponent,
  engine
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { punchPushBarLabel, punchPushBarTone } from '@shared/punch-push'

export interface PushSignalMember {
  userId: string
  name: string
  /** How well they are holding the meter, 0…1 — the struggle. */
  quality01: number
  /** What they have added so far. */
  gain: number
  mine: boolean
  done?: boolean
  saved?: boolean
}

const BAR_H = 0.42
const BAR_W = 0.08
const BAR_D = 0.04
const LIFT_M = 0.38
const WRITE_EVERY_MS = 180
const LANES = 5
const LANE_RISE_M = 0.22
const LANE_SHIFT_M = 0.14

const GOLD = PUNCH_UI.goldHot
const LIVE = Color4.fromHexString('#58DB91FF')
const DEAD = punchAlpha(PUNCH_UI.muted, 0.7)
const INK = PUNCH_UI.ink

interface Bar {
  root: Entity
  face: Entity
  fill: Entity
  label: Entity
  text: string
  fill01: number
  tone: ReturnType<typeof punchPushBarTone>
  writtenAt: number
}

const bars = new Map<string, Bar>()

function barKey(member: PushSignalMember): string {
  return member.mine ? 'me' : member.userId
}

function laneOffset(key: string): { x: number; y: number } {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  const lane = hash % LANES
  const side = lane % 2 === 1 ? 1 : -1
  return {
    x: Math.ceil(lane / 2) * side * LANE_SHIFT_M,
    y: lane * LANE_RISE_M
  }
}

function toneColor(tone: ReturnType<typeof punchPushBarTone>): Color4 {
  if (tone === 'gold') return GOLD
  if (tone === 'live') return LIVE
  return DEAD
}

function paintBox(entity: Entity, color: Color4, emissive = 3.2): void {
  Material.setPbrMaterial(entity, {
    albedoColor: color,
    emissiveColor: color,
    emissiveIntensity: emissive,
    roughness: 1,
    metallic: 0,
    transparencyMode: 2
  })
}

function placeFill(fill: Entity, face: Entity, fill01: number): void {
  const h = Math.max(0.0001, BAR_H * Math.max(0, Math.min(1, fill01)))
  Transform.createOrReplace(fill, {
    parent: face,
    position: Vector3.create(0, -BAR_H / 2 + h / 2, -0.002),
    scale: Vector3.create(BAR_W * 0.72, h, BAR_D * 0.7)
  })
}

function createBar(member: PushSignalMember): Bar {
  const root = engine.addEntity()
  Transform.create(root, { position: Vector3.Zero() })
  AvatarAttach.create(
    root,
    member.mine
      ? { anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG }
      : { avatarId: member.userId, anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG }
  )
  const lane = laneOffset(barKey(member))
  const face = engine.addEntity()
  Transform.create(face, {
    parent: root,
    position: Vector3.create(lane.x, LIFT_M + lane.y, 0)
  })
  Billboard.create(face)

  const track = engine.addEntity()
  Transform.create(track, {
    parent: face,
    position: Vector3.Zero(),
    scale: Vector3.create(BAR_W, BAR_H, BAR_D)
  })
  MeshRenderer.setBox(track)
  paintBox(track, punchAlpha(INK, 0.82), 0.4)

  const fill = engine.addEntity()
  MeshRenderer.setBox(fill)
  VisibilityComponent.create(fill, { visible: false })
  placeFill(fill, face, 0)
  paintBox(fill, DEAD, 2)

  const label = engine.addEntity()
  Transform.create(label, {
    parent: face,
    position: Vector3.create(0, BAR_H / 2 + 0.11, 0)
  })
  TextShape.create(label, {
    text: 'IN',
    fontSize: 1.15,
    textAlign: TextAlignMode.TAM_BOTTOM_CENTER,
    textColor: INK,
    outlineColor: DEAD,
    outlineWidth: 0.14
  })

  return { root, face, fill, label, text: '', fill01: 0, tone: 'dead', writtenAt: 0 }
}

function dropBar(bar: Bar): void {
  engine.removeEntityWithChildren(bar.root)
}

/**
 * One column per helper. The roster is the truth: somebody who stops, walks
 * off or never said yes disappears, and the bar goes with them.
 */
export function updatePushBars(members: PushSignalMember[], now: number): void {
  const seen = new Set<string>()
  for (const member of members) {
    const key = barKey(member)
    if (!key) continue
    seen.add(key)
    let bar = bars.get(key)
    if (!bar) {
      bar = createBar(member)
      bars.set(key, bar)
    }
    const tone = punchPushBarTone(member.quality01)
    const fill01 = member.done && member.gain > 0 ? Math.max(member.quality01, 0.55) : member.quality01
    if (Math.abs(fill01 - bar.fill01) > 0.03 || tone !== bar.tone) {
      bar.fill01 = fill01
      bar.tone = tone
      placeFill(bar.fill, bar.face, fill01)
      paintBox(bar.fill, toneColor(tone), tone === 'gold' ? 6 : tone === 'live' ? 4 : 1.4)
      VisibilityComponent.createOrReplace(bar.fill, { visible: fill01 > 0.02 })
    }
    const wanted = punchPushBarLabel(member.gain, member.done, member.saved)
    if (wanted === bar.text || now - bar.writtenAt < WRITE_EVERY_MS) continue
    bar.text = wanted
    bar.writtenAt = now
    const shape = TextShape.getMutable(bar.label)
    shape.text = wanted
    shape.outlineColor = toneColor(tone)
  }
  for (const [key, bar] of bars) {
    if (seen.has(key)) continue
    dropBar(bar)
    bars.delete(key)
  }
}

export function clearPushBars(): void {
  for (const bar of bars.values()) dropBar(bar)
  bars.clear()
}
