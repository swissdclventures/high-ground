/**
 * NPC speech bubbles — short billboarded one-liners above an NPC's head.
 *
 * One bubble per NPC at a time: a new line replaces the old one. Entities are
 * created per beat and removed when the line expires; at greeting cadence
 * (~one per NPC per 15 s minimum, see npc-ground-rules cooldown) churn is
 * negligible. Screen-space UI is wrong here on purpose: the bubble must sit on
 * the speaker so a guest surrounded by NPCs knows WHO said it.
 */
import {
  Billboard,
  engine,
  Entity,
  Material,
  MeshRenderer,
  TextAlignMode,
  TextShape,
  Transform
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

/** Above the avatar name tag (~2.2 m) so the two never overlap. */
const BUBBLE_HEIGHT_M = 2.82
const DEFAULT_SHOW_MS = 2600

interface ActiveBubble {
  entity: Entity
  plate: Entity | null
  expiresAt: number
  /** Last distance scale written. See bubbleDistanceScale. */
  scale: number
}

const bubbles = new Map<Entity, ActiveBubble>()
let systemRegistered = false

function dropBubble(bubble: ActiveBubble): void {
  if (bubble.plate) engine.removeEntity(bubble.plate)
  engine.removeEntity(bubble.entity)
}

function speechSystem(_dt: number): void {
  if (!bubbles.size) return
  const now = Date.now()
  for (const [speaker, bubble] of bubbles) {
    if (now < bubble.expiresAt) {
      // Hold the apparent size as the viewer walks away. Written only when the
      // step actually changes — a scale write is a CRDT message, and a balloon
      // rewritten every frame for every NPC is the cheapest way to spend a
      // frame budget on nothing.
      const wanted = bubbleDistanceScale(worldPositionOf(bubble.entity))
      if (Math.abs(wanted - bubble.scale) > 0.05) {
        bubble.scale = wanted
        const tf = Transform.getMutableOrNull(bubble.entity)
        if (tf) tf.scale = Vector3.create(wanted, wanted, wanted)
      }
      continue
    }
    dropBubble(bubble)
    bubbles.delete(speaker)
  }
}

/** Show `text` above `speaker` for a beat, replacing any current line. */
export function showNpcSpeech(
  speaker: Entity,
  rawText: string,
  showMs: number = DEFAULT_SHOW_MS
): void {
  if (!systemRegistered) {
    systemRegistered = true
    engine.addSystem(speechSystem)
  }
  let text = rawText
  const existing = bubbles.get(speaker)
  if (existing) {
    dropBubble(existing)
    bubbles.delete(speaker)
  }
  // Decorative chatter, not subtitles: at most three bubbles at once — a wall
  // of twelve identical balloons reads as fake.
  if (bubbles.size >= 3) return
  const entity = engine.addEntity()
  Transform.create(entity, {
    parent: speaker,
    position: Vector3.create(0, BUBBLE_HEIGHT_M, 0)
  })
  Billboard.create(entity)
  const plate = engine.addEntity()
  // ONE size for every bubble, and the text has to FILL it: the balloon in the
  // art occupies the upper ~3/4 of the image (the tail eats the rest), so the
  // plate hangs 7 cm low to bring the balloon body's centre onto the text.
  // These are decoration, so long lines get trimmed to fit.
  const width = 1.2
  // Two bounded lines preserve complete short reactions without shrinking type.
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if ((line + ' ' + word).trim().length > 18 && line) { lines.push(line); line = word }
    else line = (line + ' ' + word).trim()
  }
  if (line) lines.push(line)
  text = lines.slice(0, 2).map(value => value.slice(0, 18)).join('\n')
  Transform.create(plate, {
    parent: entity,
    position: Vector3.create(0, -0.07, 0.05),
    scale: Vector3.create(width, width * 0.75, 0.02)
  })
  // The authored comic bubble, not a flat dark box; the tail points down at the
  // speaker. Cutout instead of alpha blend: the art is hard-edged, and a cutout
  // writes depth, so the text can never lose the transparency sort against it.
  MeshRenderer.setPlane(plate)
  Material.setPbrMaterial(plate, {
    texture: Material.Texture.Common({ src: 'images/punch/speech-bubble.png' }),
    alphaTexture: Material.Texture.Common({ src: 'images/punch/speech-bubble.png' }),
    transparencyMode: 1,
    emissiveColor: Color4.create(1, 1, 1, 1),
    emissiveIntensity: 0.55,
    emissiveTexture: Material.Texture.Common({ src: 'images/punch/speech-bubble.png' }),
    roughness: 1,
    metallic: 0
  })
  TextShape.create(entity, {
    text,
    fontSize: 0.9,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
    textColor: Color4.Black(),
    outlineColor: Color4.create(1, 1, 1, 0.6),
    outlineWidth: 0.02
  })
  bubbles.set(speaker, { entity, plate, expiresAt: Date.now() + showMs, scale: 1 })
}

/** Drop every live bubble (scene teardown / crew rebuild). */
export function clearNpcSpeech(): void {
  for (const bubble of bubbles.values()) dropBubble(bubble)
  bubbles.clear()
}

/**
 * Is a line up over `speaker` right now?
 *
 * The punch machine's BOOST balloon hangs on the same NPC at the same height,
 * and both up at once printed two strings into one rectangle. That balloon
 * asks here every frame and steps aside while the answer is yes — see
 * updateFocusBubbles in plugins/punch-focus-signals.ts.
 */
export function isNpcSpeaking(speaker: Entity, now: number = Date.now()): boolean {
  const bubble = bubbles.get(speaker)
  return !!bubble && now < bubble.expiresAt
}

/**
 * ‼️A BALLOON MUST STAY READABLE FROM THE FENCE.
 *
 * Owner, 2026-09-04: *"these [balloons] become fairly small in the distance...
 * the quality becomes worse when you compress them too far."* They are not
 * compressed — they are 0.8 m of world geometry, so their size on screen falls
 * off with distance like everything else, and at the back of the deck a line of
 * text is a few pixels tall.
 *
 * Past `BUBBLE_FULL_M` the balloon grows in step with its distance, which holds
 * its APPARENT size still: twice as far away, twice as big, same pixels. Inside
 * that radius nothing changes, so a balloon over the person beside you is
 * exactly the size it always was. The cap stops a balloon across the island
 * from becoming a billboard.
 *
 * Returned rather than applied so both balloon layers share one curve — this
 * one, and the Boost balloons in plugins/punch-focus-signals.ts.
 */
const BUBBLE_FULL_M = 8
const BUBBLE_MAX_SCALE = 3

export function bubbleDistanceScale(at: Vector3 | null | undefined): number {
  if (!at) return 1
  const camera = Transform.getOrNull(engine.CameraEntity)
  if (!camera) return 1
  const dx = at.x - camera.position.x
  const dy = at.y - camera.position.y
  const dz = at.z - camera.position.z
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (distance <= BUBBLE_FULL_M) return 1
  return Math.min(BUBBLE_MAX_SCALE, distance / BUBBLE_FULL_M)
}

/**
 * Where a speaker actually is, following the parent chain.
 *
 * A balloon's own Transform is LOCAL to the body it rides, so its `position` is
 * the lift, not a place in the world. Walking up to the root is the only way to
 * get a distance that means anything.
 */
export function worldPositionOf(entity: Entity): Vector3 | null {
  let current: Entity | undefined = entity
  let x = 0
  let y = 0
  let z = 0
  for (let guard = 0; guard < 8 && current !== undefined; guard += 1) {
    const tf = Transform.getOrNull(current)
    if (!tf) return guard === 0 ? null : Vector3.create(x, y, z)
    x += tf.position.x
    y += tf.position.y
    z += tf.position.z
    current = tf.parent
  }
  return Vector3.create(x, y, z)
}
