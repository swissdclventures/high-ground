import { PUNCH_UI } from './punch-visual-theme'
/**
 * MAKING PARTICIPATION LEGIBLE — AND THE CHOICE INVISIBLE.
 *
 * The mechanic shipped as a private one: a bar at the bottom of your own screen
 * and an emote nobody could read a reason for. So the state left the HUD and
 * went into the room. It then went too far the other way: a balloon over every
 * head reading `DISRUPTING -3%`, a roster on the arc naming each participant
 * and their side, and two colours of pulse leaving their bodies. Every surface
 * announced, live, who was helping and who was sabotaging.
 *
 * ‼️THAT IS NOW THE THING THIS FILE EXISTS TO PREVENT. Owner rule: while a turn
 * is running, nobody may learn who chose Boost and who chose Jinx. What the
 * room shows is that somebody is FOCUSING — one word, one colour, both sides
 * identical — and the count of how many. The consequence is revealed once, at
 * the score, as a single net number that names nobody.
 *
 * The earlier design was built on the opposite premise ("seeing who is working
 * against you is the entire reason to walk over and counter them"). That
 * counter-play is deliberately given up: suspense during the punch was judged
 * worth more than a public target.
 *
 * WHAT IS LEFT HERE IS ONE SURFACE:
 *
 *   the BUBBLE  one speech balloon over every participant's head — theirs and
 *               yours — carrying the neutral word. It is the same authored
 *               balloon the crowd's chatter uses, on purpose: the room already
 *               speaks in that shape.
 *
 * The arc BOARD that used to sit beside it is gone. It carried the disclosure
 * this rule forbids, it printed three lines of key-binding instructions across
 * a sixteen-metre screen, and its 4.7 x 2.9 backing plate stood five
 * centimetres in front of the challenger's portrait and covered it completely —
 * which is why the face "disappeared" from the arc. Its one legitimate job, the
 * live count, is now a chip on the 2D HUD.
 *
 * The roster is still DRAWN FROM THE COORDINATOR, never from local guesses, so
 * every client on the island counts the same circle.
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
  engine
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { PUNCH_BOOST_PERSON_CAP } from '@shared/punch-machine-contract'
import { bubbleDistanceScale, isNpcSpeaking, worldPositionOf } from '../dance/npc-speech'

/** One person in the circle, as the world needs to draw them. */
export interface FocusSignalMember {
  npc?: boolean
  /** Wallet address, lowercase. Empty for anyone the explorer cannot anchor to. */
  userId: string
  name: string
  /** How well they are holding it, 0..1 — the same curve that pays. */
  quality01: number
  /** What they are currently worth to the punch, in points. */
  points: number
  /** Their own circle score this wind-up, 0..999. Zero until they have one. */
  circleScore: number
  /** PREPARATION: stored Focus 0..100 and whether Momentum is ready. */
  focus: number
  momentum: boolean
  /** How many are in the circle — the headcount their band is measured against. */
  crowd: number
  /** This client's own player. Anchored without an id, which means "me". */
  mine: boolean
  /**
   * A BODY THAT IS NOT AN AVATAR — the NPC lending itself to this member.
   *
   * The circle is not all people any more: two of the regulars standing beside
   * the cabinet channel for and against every turn, so the player at the bag is
   * never the only one working. An NPC has no wallet address and the explorer
   * will never anchor to one, so its balloon is PARENTED to the entity instead.
   * Present only for those members; everybody else anchors by address as before.
   */
  body?: Entity
}

const BUBBLE_TEX = 'images/punch/speech-bubble.png'
/** Clear of the name tag, which the anchor point puts us level with. */
const BUBBLE_LIFT_M = 0.34
/**
 * The same height the NPC chatter balloons use, measured from an NPC's FEET —
 * there is no name-tag anchor to ride on a body the explorer does not own, so
 * this is the one number that has to be stated rather than derived.
 */
const NPC_BUBBLE_LIFT_M = 2.4
const BUBBLE_W = 0.9
/** A balloon per head is cheap; a balloon per head REWRITTEN every frame is not. */
const BUBBLE_WRITE_EVERY_MS = 220

/** Both sides wear one channel color. The shared teal ties the effects to
 * the instruments without revealing whether a participant chose Boost or Jinx.
 * Keep the exported name compatible with existing callers.
 */
export const CHANNEL_VIOLET = PUNCH_UI.channel
const SLATE = PUNCH_UI.muted
const INK = PUNCH_UI.ink

/**
 * The one reading every surface uses — and it no longer branches on the side.
 *
 * Green/amber/slate used to grade how well a participant was holding the beat,
 * and `drain` was given the wave's black so the two crowds "read as two colours
 * everywhere they appear". That IS the disclosure. Both sides now colour from
 * the single channel accent, dimming to slate only for someone who has stopped
 * — which says "you are out", not "you are helping" or "you are sabotaging".
 */
export function focusTierColor(quality01: number): Color4 {
  return quality01 > 0.02 ? CHANNEL_VIOLET : SLATE
}

/**
 * How full one person's contribution is, 0..1 — for bars and rings, never for
 * text. Measured against what an ordinary Boost can reach, so a special one
 * simply pins the gauge rather than rescaling everybody else's.
 */
export function focusFill01(points: number): number {
  const value = Math.max(0, Number(points) || 0)
  return Math.min(1, value / Math.max(1, PUNCH_BOOST_PERSON_CAP))
}

interface Bubble {
  /** The anchored entity. Its transform belongs to the explorer, not to us. */
  root: Entity
  /** The billboarded child that carries the words. */
  face: Entity
  text: string
  writtenAt: number
  /** Scaled away while the NPC under it is saying something. See the update. */
  hidden: boolean
  /**
   * The NPC body this balloon was parented to at creation, or undefined for an
   * avatar-anchored one. Compared every frame: see the re-anchor in the update.
   */
  body?: Entity
  /** Last scale written — the distance curve, or ~0 while hidden. */
  scale: number
}

/** Keyed by the anchor: a wallet address, or `me` for the local player. */
const bubbles = new Map<string, Bubble>()

function bubbleKey(member: FocusSignalMember): string {
  return member.mine ? 'me' : member.userId
}

/**
 * THE STAGGER — why every balloon does not float at the same height.
 *
 * ‼️Owner, 2026-09-04: "there is also an overlap on the speech bubbles, sometimes
 * you can't read what it says because there's multiple words on top of each
 * other... I think the NPC speech bubbles boost messages such as BOOST +18 with
 * whatever they have to say and that's the problem."
 *
 * Both readings are the same bug. Each balloon is billboarded, so it always
 * faces the camera and its text always renders at the camera's up-axis — which
 * means two members standing near each other, at the same head height, print two
 * strings into overlapping screen rectangles from every angle. There is no
 * camera position that separates them, because the thing that would separate
 * them (their different depths) is exactly what a billboard cancels.
 *
 * A collision solver was the obvious idea and is the wrong one: it needs screen
 * space, which a scene cannot read, and it would make the balloons jitter as
 * people walk. What actually works is to stop them ever being coplanar. Each
 * member gets a fixed lane off their own id — a lift and a small sideways step,
 * both deterministic, so a balloon never moves once it exists and two people
 * only share a lane if their ids collide in five lanes.
 *
 * `PUNCH_BUBBLE_LANES` is odd so that lane 0 is the centre one and the offsets
 * are symmetric around the body.
 */
const PUNCH_BUBBLE_LANES = 5
/** Vertical gap between lanes. About one line of text at this font size. */
const BUBBLE_LANE_RISE_M = 0.26
/** Sideways step per lane. Small: the balloon must still read as THIS person's. */
const BUBBLE_LANE_SHIFT_M = 0.17

function bubbleLane(key: string): number {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return hash % PUNCH_BUBBLE_LANES
}

/**
 * The lane's offset from the anchor, in metres. Lane 0 is (0, 0).
 *
 * ‼️THE LIFT IS ONLY EVER UPWARD. A downward lane would put a balloon at chest
 * height, on top of the Explorer's own name tag — trading one overlap for a
 * worse one it does not own and cannot move. The sideways step alternates
 * because it is free; the height is what actually separates two billboards, and
 * it always separates them by rising.
 */
function bubbleLaneOffset(key: string): { x: number; y: number } {
  const lane = bubbleLane(key)
  const side = lane % 2 === 1 ? 1 : -1
  return {
    x: Math.ceil(lane / 2) * side * BUBBLE_LANE_SHIFT_M,
    y: lane * BUBBLE_LANE_RISE_M
  }
}

function createBubble(member: FocusSignalMember): Bubble {
  const root = engine.addEntity()
  if (member.body) {
    // An NPC's body is a scene entity we own outright, so the balloon simply
    // rides it. No AvatarAttach: that component resolves an AVATAR, and asking
    // it for one that does not exist leaves the balloon parked at the origin.
    Transform.create(root, { parent: member.body, position: Vector3.Zero() })
  } else {
    Transform.create(root, { position: Vector3.Zero() })
    // NAME_TAG, not POSITION: the tag already tracks the head at whatever height
    // this avatar happens to be, so the balloon rides a crouch or a tall body
    // without a per-avatar offset the scene has no way to measure.
    AvatarAttach.create(
      root,
      member.mine
        ? { anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG }
        : { avatarId: member.userId, anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG }
    )
  }
  const bubble = engine.addEntity()
  // The lane, so two balloons in the same huddle cannot print into the same
  // screen rectangle. See `bubbleLaneOffset`.
  const lane = bubbleLaneOffset(bubbleKey(member))
  Transform.create(bubble, {
    parent: root,
    position: Vector3.create(
      lane.x,
      (member.body ? NPC_BUBBLE_LIFT_M : BUBBLE_LIFT_M) + lane.y,
      0
    )
  })
  Billboard.create(bubble)
  const plate = engine.addEntity()
  Transform.create(plate, {
    parent: bubble,
    // Behind the text from the camera's side: a billboard turns its -Z to the
    // viewer, which is also the face a TextShape reads from.
    position: Vector3.create(0, -0.07, 0.05),
    scale: Vector3.create(BUBBLE_W, BUBBLE_W * 0.75, 0.02)
  })
  MeshRenderer.setPlane(plate)
  Material.setPbrMaterial(plate, {
    texture: Material.Texture.Common({ src: BUBBLE_TEX }),
    alphaTexture: Material.Texture.Common({ src: BUBBLE_TEX }),
    transparencyMode: 1,
    emissiveColor: Color4.create(1, 1, 1, 1),
    emissiveIntensity: 0.55,
    emissiveTexture: Material.Texture.Common({ src: BUBBLE_TEX }),
    roughness: 1,
    metallic: 0
  })
  TextShape.create(bubble, {
    text: 'FOCUSING',
    fontSize: 1.4,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
    textColor: INK,
    outlineColor: Color4.create(1, 1, 1, 0.6),
    outlineWidth: 0.02
  })
  return { root, face: bubble, text: '', writtenAt: 0, hidden: false, scale: 1, body: member.body }
}

function dropBubble(bubble: Bubble): void {
  engine.removeEntityWithChildren(bubble.root)
}

/**
 * One balloon per meditator, created and retired as the circle changes.
 *
 * Called every frame with the whole roster rather than as events, because the
 * roster IS the truth: a spectator who walks out of range, takes the bag or
 * simply stops tapping disappears from it, and the balloon has to go with them
 * without anyone having to remember to send a goodbye.
 */
export function updateFocusBubbles(members: FocusSignalMember[], now: number): void {
  const seen = new Set<string>()
  for (const member of members) {
    const key = bubbleKey(member)
    // A member with no anchorable id is real on the board and impossible in the
    // world — a house bot, or a peer whose address never arrived.
    if (!key) continue
    seen.add(key)
    let bubble = bubbles.get(key)
    // ‼️ RE-ANCHOR WHEN THE BODY CHANGES, or the balloon rides the wrong person.
    //
    // A regular's balloon is keyed by its id and parented to an NPC body ONCE. The
    // arc re-deals which body wears the part whenever the arc changes - and it
    // changes exactly when the house bot steps up, because the performer leaves the
    // arc. So "focus-bot-a" moved to a new body, this balloon stayed on the old one,
    // and the old one was now standing at the bag throwing punches under a cloud
    // that said FOCUSING. The owner: "she can't be focusing when she's fighting the
    // machine, it's nonsense." Correct. A balloon follows its member, not its entity.
    if (bubble && bubble.body !== member.body) {
      dropBubble(bubble)
      bubbles.delete(key)
      bubble = undefined
    }
    if (!bubble) {
      bubble = createBubble(member)
      bubbles.set(key, bubble)
    }
    // ‼️THE COMMENT WINS THE HEAD. An NPC in the circle also TALKS — the crowd
    // lines in punch-machine.ts ride the same body at the same height — and the
    // owner (2026-09-04) was reading `BOOST +18` printed straight through
    // `Massive!`. The lane stagger above cannot help: it separates MEMBERS, and
    // this is one member wearing two balloons. So while a line is up, this one
    // is down, and it is back the frame the line expires. Scaled, not removed:
    // a balloon rebuilt every time an NPC speaks is an avatar-anchor churn.
    const muted = !!member.body && isNpcSpeaking(member.body, now)
    // ONE SCALE, TWO JOBS. Hidden wins; otherwise the balloon holds its apparent
    // size as the viewer backs off (bubbleDistanceScale). Both go through the
    // same write so they cannot fight over the component — a separate "hide"
    // write and a separate "distance" write would take turns undoing each other.
    // An avatar-anchored balloon has no readable world position of its own, so
    // the NPC's body stands in for it and the rest fall back to no scaling.
    const wantedScale = muted
      ? 0.0001
      : bubbleDistanceScale(member.body ? worldPositionOf(member.body) : null)
    if (muted !== bubble.hidden || Math.abs(wantedScale - bubble.scale) > 0.05) {
      bubble.hidden = muted
      bubble.scale = wantedScale
      Transform.getMutable(bubble.face).scale = Vector3.create(
        wantedScale,
        wantedScale,
        wantedScale
      )
    }
    // ‼️THE NUMBER IS BACK, AND IT IS BACK BECAUSE JINX IS GONE.
    //
    // This read a bare `FOCUSING` under the secrecy rule: with two opposing
    // sides, a share over somebody's head disclosed which one they had picked,
    // and the suspense of the turn was judged worth more than the credit. That
    // rule was ENTIRELY a consequence of there being two sides. There is one
    // now, everybody in the circle is helping, and there is nothing left to
    // keep secret — so the balloon can go back to doing the job it is best at,
    // which is showing a deck of people exactly what turning up is worth.
    //
    // It is the same number the result card will print beside this person's
    // name, in the same unit, so the promise over their head and the payout on
    // the card cannot tell different stories.
    // THE SCORE FIRST, THE GIFT SECOND: "412 · +48" — your own number, then
    // what you are handing over. A deck of balloons becomes a leaderboard.
    // ‼️THE TWO MARKS. FOCUS with its amount (FULL at 100) and MOMENTUM once it
    // is ready — the whole of a player's preparation, readable from across the
    // deck. While they are actively tapping without any stored yet, the balloon
    // says what they are doing.
    const focusMark = member.focus >= 99.5 ? 'FOCUS FULL' : member.focus > 0 ? `FOCUS ${Math.round(member.focus)}` : ''
    const marks = [focusMark, member.momentum ? 'MOMENTUM' : ''].filter(Boolean).join(' · ')
    const wanted = marks || (member.quality01 > 0 ? 'FOCUSING' : 'FOCUS')
    if (wanted === bubble.text || now - bubble.writtenAt < BUBBLE_WRITE_EVERY_MS) continue
    bubble.text = wanted
    bubble.writtenAt = now
    const shape = TextShape.getMutable(bubble.face)
    shape.text = wanted
    shape.textColor = INK
    // The tier rides the OUTLINE, not the fill: the balloon art is white, so a
    // pale accent word on it is unreadable at ten metres while a colored halo around
    // a black one is legible from across the deck.
    shape.outlineColor = focusTierColor(member.quality01)
    shape.outlineWidth = 0.15
  }
  for (const [key, bubble] of bubbles) {
    if (seen.has(key)) continue
    dropBubble(bubble)
    bubbles.delete(key)
  }
}

/** Take every balloon down — mode change, teardown, or the round simply ending. */
export function clearFocusBubbles(): void {
  for (const bubble of bubbles.values()) dropBubble(bubble)
  bubbles.clear()
}

/**
 * The arc board that used to live here is GONE, and this note is its headstone
 * so it is not rebuilt by someone reading the old call sites.
 *
 * It printed a named roster with each participant's side and share, which the
 * secrecy rule forbids outright. It printed three lines of key-binding
 * instructions ("PRESS <key> NEAR THE MACHINE TO LIFT THE PUNCH") across a
 * sixteen-metre screen, which is exactly the long floating text the arc was
 * told to stop carrying. And its backing plate — 4.7 x 2.9 m, 72% opaque, at
 * radius 4.40 against a portrait at 4.35, spanning y 1.05..3.95 against a
 * portrait spanning 1.15..3.75 — stood in front of the challenger's face and
 * covered it completely, with no visibility toggle to ever take it down. That
 * is the whole of "the active player's face disappeared from the screen".
 *
 * Its one job worth keeping, the live count of who is channelling, is a chip on
 * the 2D HUD now. Dynamic text cannot be made to conform to this arc anyway:
 * Screen_Surface carries a single 0..1 UV set across a 4:1 curve, and the SDK
 * offers no runtime canvas to draw a string into a texture with.
 */
