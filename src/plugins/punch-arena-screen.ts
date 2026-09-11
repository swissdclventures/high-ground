import { punchRevealCountMs } from '@shared/punch-machine-contract'
import type { PunchArenaSpotlight } from '@shared/punch-arena-spotlight'
import { normalizePunchProfile, planPunchEffects } from '@shared/punch-game-profile'
/**
 * The arena screen's director — what the 16.4 m arc behind the machine shows.
 *
 * The division of labour is the whole design: THE CABINET COUNTS, THE ARC FEELS.
 * Every number and word in this game already has a home on the machine's own
 * marquee, and Decentraland floats each player's name above their head, so the
 * arc deliberately carries no text at all. Its entire vocabulary is a face, a
 * colour and motion.
 *
 * ‼️★★★NO VIDEO ON THIS SCREEN. Owner's law, and it replaces the design this
 * file was built around. The arc used to spend its whole idle life playing
 * attract footage, and the verdict was blunt: "the video is just still
 * overwhelming, occupying most of the time on the screen — game-related
 * activity on the screen only from now on, no more video." Two separate
 * failures behind that. The footage OUTLASTED THE GAME: a turn is fifteen
 * seconds and a mood is twenty, so for most of any session the biggest surface
 * on the island was showing something that had nothing to do with what anyone
 * was doing. And it went STALE: when an explorer declines to restart on a
 * source swap the player freezes on a frame and the arc sits there dead, which
 * is indistinguishable from a screen that simply never reacts.
 *
 * So the arc is now driven ENTIRELY by the game. Every frame it is showing one
 * of: the challenger's power filling outward as they charge, the colour their
 * punch just earned, the verdict card, or — when nothing at all is happening —
 * an ambient movement whose speed and brightness come from the crowd and whose
 * palette is the last punch's tier. It is never idle-because-nothing-is-loaded;
 * there is no source to load. See `ambientPaint`.
 *
 * Two surfaces, and they do different jobs:
 *
 *   the ARC       twenty individually-addressed WASH panels wrapped round the
 *                 inside of the display. They are the picture now, not an
 *                 overlay on one, so they are always up. The GLB's own
 *                 Screen_Surface behind them is painted once, near-black, and
 *                 never touched again.
 *   the PORTRAIT  whoever is holding the bag, cut into COLUMNS that sit ON the
 *                 curve — see PORTRAIT_COLUMNS below.
 *
 * The face used to be one flat square hanging in front of the arc, and before
 * that it was painted across the arc's own 4:1 UV. Both are gone: a plate
 * floats and a full-arc `AvatarTexture` stretches. Slicing it into panels that
 * follow the cylinder is the only shape that is neither.
 *
 * ‼️AND NEITHER DOES A RANKED LIST. The board shipped here as three big
 * TextShape rows and had to come straight off again: this surface is a HALF
 * CYLINDER, so a row of text bends with it and both ends of every line turn
 * away from whoever is standing in front — and at the size needed to read it
 * from the fence, the list ran off both edges of the screen at once. It lives
 * on the HUD now, flat, behind a SCORES button (`ScoreboardPanel` in
 * punch-machine-ui.tsx), which is where a table can be a table. Do not bring
 * it back here.
 *
 * Unlit and emissive throughout, for the same reason everything on this island
 * is: a lit material hands the picture to whatever the time of day is doing,
 * and a surface at 100 m under a night sky comes back a grey panel.
 */
import {
  ColliderLayer,
  Entity,
  GltfContainer,
  GltfNodeModifiers,
  Material,
  MaterialTransparencyMode,
  MeshRenderer,
  ParticleSystem,
  TextShape,
  Transform,
  VisibilityComponent,
  engine
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { isMobile } from '@dcl/sdk/platform'
import type {
  PunchMachineAppConfig
} from '@shared/punch-machine-contract'
import {
  punchReactionIntensity,
  punchRevealLanded,
  punchRevealShownScore,
  punchPerfectCutMs,
  PUNCH_SCORE_COUNT_MS,
  PUNCH_SCORE_HOLD_MS,
  PUNCH_SCORE_LINGER_MS
} from '@shared/punch-machine-contract'
import {
  punchArcQuake,
  punchArcQuakeSpec, punchArcFallSpec, PUNCH_ARC_QUAKE_SCORE, PUNCH_ARC_FALL_SCORE,
  type PunchArcQuakeSpec
} from '@shared/punch-arc-quake'
import {
  PUNCH_WASH_ROWS,
  PUNCH_WASH_ROW_GAIN,
  punchWashGlyphGain,
  PUNCH_WASH_SEGMENTS,
  punchWashIndex,
  punchWashSegment,
  PUNCH_BIG_SCREEN_FACE_DEG,
  PUNCH_BIG_SCREEN_LIFT_M,
  PUNCH_BIG_SCREEN_PUSH_M,
  PUNCH_BIG_SCREEN_NODE_PATHS,
  PUNCH_BIG_SCREEN_SCALE,
  PUNCH_PORTRAIT_COLUMNS,
  punchPortraitColumn,
  PUNCH_MODELS
} from '@shared/punch-machine-layout'
import {
  screenPaletteById,
  screenSegmentColour,
  type ScreenPaint,
  type ScreenPatternId
} from '@shared/punch-show-patterns'
import {
  patternMask,
  screenMask,
  type ScreenMaskId
} from '@shared/punch-show-masks'
import {
  screenIconField,
  screenIconForTier,
  screenTextField,
  type ScreenIconId
} from '@shared/punch-show-glyphs'

export interface ArenaScreen {
  revealCountMs?: number
  /**
   * The 1.2 s of silence a 999 buys (see `PUNCH_PERFECT_CUT_MS`), or 0. The arc
   * has to know: its verdict word waits for the cabinet's count to land, and
   * without this the sixteen-metre screen would announce the result in the
   * middle of the one moment the island is supposed to be dark and empty —
   * which is the same law the count-up itself was moved into the contract for.
   */
  perfectCutMs?: number
  root: Entity
  /** The face, left to right as the crowd sees it. One slice of it each. */
  portraitColumns: Entity[]
  /** Whose face is up, so the avatar fetch is only re-issued on a change. */
  portraitUserId: string
  /** Flash window — set on contact, read every frame. */
  flashUntil: number
  flashScore: number
  /**
   * THE ARC'S MEMORY OF THE LAST PUNCH — what keeps the ambient show about the
   * game rather than about nothing.
   *
   * Once the tier hold expires the punch is over as far as every branch below is
   * concerned, and without this the arc would drop straight back to a house
   * colour as if nobody had hit anything. Instead the ambient movement keeps
   * that tier's palette for `AMBIENT_ECHO_MS`, so a monster leaves the screen
   * gold for half a minute and a tap leaves it steel.
   */
  echoTier: number
  echoUntil: number
  /**
   * The picture. Twenty panels, always up — there is nothing behind them worth
   * revealing now that the video is gone, and a hidden arc is exactly the dead
   * screen this rewrite exists to abolish.
   */
  washRoot: Entity
  washPanels: Entity[]
  /**
   * THE PATTERN, when one is running — the arc used as the twenty-segment
   * display it physically is rather than as one pixel. Null between punches.
   *
   * `patternFrom`/`patternUntil` are the window, and progress through it is what
   * the pattern function is handed; it never sees a wall clock, so the same
   * shape can be a 150 ms flash or a four-second scene without knowing.
   */
  pattern: ScreenPaint | null
  patternFrom: number
  patternUntil: number
  /**
   * WHAT IS ACTUALLY ON EACH PANEL, and when the surface last stepped.
   *
   * Every writer goes through this — the flat wash, the director's patterns and
   * the ambient show alike — because repainting twenty materials every frame
   * would be 1,200 CRDT writes a second on the one surface in the scene that is
   * twenty entities wide. So the surface steps at PATTERN_STEP_MS and each panel
   * is compared before it is written; a chase band touches two or three panels
   * per step, not twenty.
   *
   * ‼️It has to be ONE record rather than one per writer. When the wash tracked
   * its colour separately from the patterns, handing the arc from one to the
   * other left each of them believing a panel held something the other had
   * painted over.
   */
  patternPainted: (Color4 | null)[]
  patternSteppedAt: number
  /**
   * WHICH MASK IS ON THE ARC — see shared/punch-show-masks.ts.
   *
   * State rather than an argument, because every writer on this surface paints
   * ONE panel at a time through paintPanel and the mask belongs to the whole
   * screen. It is set in paintFrame and wash, so no branch of
   * updateArenaScreen has to remember to.
   */
  mask: ScreenMaskId
  /** The verdict card: who hit it, how hard, and what the arc calls that. */
  verdictRoot: Entity
  verdictName: Entity
  verdictWord: Entity
  /** The spark shower that goes off with it. */
  verdictBurst: Entity
  /**
   * ‼️THE SCREEN'S OWN SPARKS — four emitters standing ON the arc, not on the card.
   *
   * Owner, 2026-09-04: *"you also mentioned that there is some kind of particle
   * system that we can use on the screen. I want to know more about this and I
   * want to see it."* There was exactly one emitter and it was bolted to the
   * verdict card, off to one side, aimed into a 3.4 m plate — a shower nobody
   * standing on the deck could tell apart from the card's own glow.
   *
   * These stand on the cylinder itself, spaced across the face, and throw
   * upward and outward toward the crowd. A big punch therefore makes the SCREEN
   * do something rather than making a widget on the screen do something, which
   * is the difference between a graphic and a stadium.
   *
   * Tier 3 and up only. A shower that fires for every tap is wallpaper.
   */
  arcSparks: Entity[]
  /**
   * THE ENGINES. Two jets under the pillar feet — the screen floats, and a
   * thing that floats with nothing under it reads as parked in the sky rather
   * than held there (owner, 2026-09-06: "engine exhaust… blue flames… as if
   * it's being boosted like rocket engines"). Idle they breathe; through a
   * quake they roar, and through the fall they are what saves it.
   */
  exhaust: Entity[]
  exhaustHot: boolean
  /** When the arc sparks stop. 0 = not firing. */
  arcSparksUntil: number
  /**
   * ‼️THE ARC'S OWN QUAKE NODE — the whole reason the screen can move at all.
   *
   * Owner, 2026-09-05: *"the screen used to shake very hard when you hit the
   * ball really hard... right now it's mostly the island and the machine and the
   * avatars, but our screen always stays steady"*. See shared/punch-arc-quake.ts
   * for the two deletions that took the ride away, and why putting them back on
   * the island is not an option.
   *
   * (!) BOTH ROOTS HANG OFF THIS, AND THEY HAVE TO. The GLB root carries the
   * 180 turn and the derived scale; the wash root carries neither because
   * `punchWashSegment` bakes both. Shaking one and not the other tears the
   * picture off the screen — so nothing writes to `root` or `washRoot`
   * directly and everything writes here, one node above them both.
   *
   * It sits at IDENTITY at rest, which is what keeps this change invisible to
   * the Builder viewport and to every measurement in punch-machine-layout: the
   * arc's authored place in the island frame is completely unchanged.
   */
  quakeRoot: Entity
  /** When the quake started. 0 = at rest, and nothing is written to the node. */
  quakeAt: number
  /** How hard and how long, by tier. Null between quakes. */
  quakeSpec: PunchArcQuakeSpec | null
  /** When the card comes down. 0 = not showing. */
  verdictUntil: number
  /**
   * THE COUNT, mirrored from the cabinet — see `arenaScreenSlam`.
   *
   * `verdictPhaseAt` is when the SCORING PHASE started (the release), which is
   * the clock the marquee counts off; `verdictTarget` is where it is going.
   * The card owns neither number, it just draws the same curve.
   */
  verdictPhaseAt: number
  verdictTarget: number
  verdictTier: number
  /** Last strings written, so a held card writes nothing per frame. */
  verdictText: { name: string; word: string }
  verdictShown: boolean
  /**
   * WHEN THE NUMBER COMES DOWN — and it is its OWN clock, not the wash's.
   *
   * ‼️This field exists because the reveal on the arc had never once been
   * readable. The glyph branch used to live inside `flashUntil + TIER_HOLD_MS`,
   * a window sized for a COLOUR — 1,050 ms for a tap — while the count it was
   * drawing does not move for its first PUNCH_SCORE_HOLD_MS and does not land
   * until 3,680 ms after the release. The digits were therefore evicted, every
   * time, by a clock that knew nothing about them. Derived in `arenaScreenSlam`
   * from the count itself, so the number can only come down after it has landed.
   */
  glyphUntil: number
  /**
   * THE GLYPH LAYER'S ONE PIECE OF STATE — the field currently on the arc, and
   * the key it was built from.
   *
   * Rebuilding a 160-cell field is cheap but not free, and the number it draws
   * holds still for most of the frames it is up (a count-up changes a digit a
   * few times a second, not sixty). Keyed by the string so a held numeral is a
   * single comparison, exactly like `verdictText`.
   */
  glyphKey: string
  glyphField: boolean[]
}

/**
 * The house palette, SEPARATED BY HUE AND NOT BY BRIGHTNESS — which is a
 * correction, and the reason the reaction had never been seen working.
 *
 * The ladder read ash → light grey → WHITE → gold-against-ember, and the
 * contact flash was GOLD at (1, 0.94, 0.72). Three of those four are bright
 * neutrals. Since the wash became an opaque panel held for most of a second,
 * that meant an ordinary tier-3 punch put up 1.5 SECONDS OF SOLID WHITE, a
 * tier 2 put up light grey, and the flash that opened both was near-white too.
 * Four grades of punch, one visible result: the owner played this island for
 * weeks and reported, correctly, that the only thing the arc had ever done was
 * turn white.
 *
 * Brightness is the wrong axis on a surface that also has to be READABLE
 * against a night sky. Hue is free, and hue is what the eye sorts fastest.
 */
const WHITE = Color4.create(1, 1, 1, 1)
/** Reserved for the monster punch. Nothing below tier 4 is allowed to be white. */
const WHITE_HOT = Color4.create(1, 0.99, 0.94, 1)
const ASH = Color4.create(0.34, 0.37, 0.42, 1)
const CRIMSON = Color4.create(0.9, 0.15, 0.12, 1)
const ORANGE = Color4.create(1, 0.5, 0.1, 1)
const GOLD = Color4.create(1, 0.82, 0.34, 1)
const EMBER = Color4.create(1, 0.42, 0.34, 1)

/**
 * THE LADDER, in one table.
 *
 * A table rather than a nested ternary, because the property that matters is one
 * a reader has to be able to CHECK AT A GLANCE — that no two rows are the same
 * colour. Buried in a conditional chain, `ASH / mix(ASH, WHITE, 0.6) / WHITE`
 * reads like three distinct answers; laid out in a row it is obviously two
 * greys and a white.
 *
 * Grey, red, orange, gold: a heat ramp, so it needs no key. The nearest pair
 * here sits 0.36 apart in RGB against 0.13 for the ember/blood pairing this
 * replaced, which the tier test in tests/scene rejected outright.
 */
const TIER_COLOUR: Record<number, Color4> = { 1: ASH, 2: CRIMSON, 3: ORANGE, 4: GOLD }

/**
 * Long enough to register across sixteen metres.
 *
 * Two frames is right for a muzzle flash a metre wide. On a screen this size,
 * at the distance the crowd stands, 90 ms went past before anyone's eye had
 * moved to it — the flash was technically firing and nobody ever saw one.
 */
const FLASH_MS = 150
/**
 * How long the arc holds the tier colour, before the ambient show takes it back.
 *
 * A reaction has to take the whole surface — sixteen metres going solid is the
 * only thing that reads from across the deck. Tier 1 barely bothers; a monster
 * holds and strobes.
 */
const TIER_HOLD_MS = [900, 1_100, 1_500, 2_400] as const
/**
 * How long each half of the celebration beat holds — number, mark, number.
 *
 * Fast enough that a 1.5 s tier-3 hold gets three changes out of it, slow enough
 * that a four-digit number is readable in its half. Below about 250 ms the two
 * images smear into one another and the arc reads as broken rather than excited.
 */
const GLYPH_CELEBRATE_MS = 320
/**
 * HOW LONG THE FINISHED NUMBER STANDS ON THE ARC once the count lands.
 *
 * Owner, 2026-09-05: *"you show score in very large numbers directly on the LCD
 * but they're shown just for like a fraction of a second and disappear often
 * before they're fully rendered — it's a pity, I think it's a nice feature and
 * I think for a moment this will stay on the screen."*
 *
 * This is that moment, and it is deliberately measured from the LANDING rather
 * than from the impact: the whole value of a count-up is the number it arrives
 * at, and a reveal that clears on the frame it finishes has thrown away the
 * only frame anyone was waiting for. Per tier, because a monster has earned
 * longer on the surface than a tap has.
 */
const GLYPH_LAND_HOLD_MS = [1_200, 1_500, 2_000, 2_600] as const
/**
 * The tail of that hold where the celebration beat stops and the number simply
 * STANDS.
 *
 * Without it the reveal ends on whichever half of the beat the clock happened
 * to be in — half the time a big punch's last image is the tier MARK, not the
 * score. A reveal has to finish on the thing it revealed.
 */
const GLYPH_SETTLE_MS = 700
/**
 * What an UNLIT cell is during a glyph — near-black, never black.
 *
 * A true black cell on an emissive wall reads as a dead panel, and twenty of
 * them in a row reads as the screen having failed. A trace of the room's own
 * violet keeps the surface alive behind the numeral and is what makes the digits
 * look printed ON something rather than punched out of nothing.
 */
const GLYPH_UNLIT = Color4.create(0.05, 0.035, 0.09, 1)

/**
 * THE AMBIENT SHOW — what the arc does when the game is doing nothing.
 *
 * This is the replacement for the attract video, and the requirement it has to
 * meet is not "look nice": it is that a player glancing up between turns can
 * tell the screen belongs to THIS MACHINE. So none of the three dials is
 * decorative. `energy` is the crowd (`focus01`), `palette` is the last punch's
 * tier, and the movement changes on a clock every player shares.
 *
 * One movement per AMBIENT_CYCLE_MS, and the arc is never still inside one.
 * Nine seconds is short enough that nothing outstays its welcome and long
 * enough that the surface is not flicking between looks like a broken sign.
 */
const AMBIENT_CYCLE_MS = 9_000
/**
 * Only patterns that LOOP SEAMLESSLY belong here.
 *
 * The ambient show runs a repeating window, so `t01` snaps from 1 back to 0
 * every cycle. A pattern that fades on `t` (solid, ripple, drain) or detonates
 * at a fixed point in the window (collapse) shows that snap as a jolt. These
 * five are driven purely by `phase`, which — at the integer speeds below —
 * wraps to exactly where it started.
 */
const AMBIENT_PATTERNS: readonly ScreenPatternId[] = [
  'gradient',
  'chase',
  'heartbeat',
  'bars',
  'sparkle'
]
/** Integer, so `phase % 1` lands back on 0 at the end of the window. */
const AMBIENT_SPEED: readonly number[] = [1, 2, 1, 1, 2]
/**
 * How long the arc goes on wearing the last punch's colours.
 *
 * Long enough to still be up when the next challenger walks over — that is the
 * whole job. Short enough that an island nobody has touched in a while is back
 * to the house rotation rather than stuck advertising a punch from last night.
 */
const AMBIENT_ECHO_MS = 30_000
/**
 * ‼️★★★HOW OFTEN THE CABINET'S OWN BULBS FALL IN WITH THIS SCREEN.
 *
 * Owner, 2026-09-05: *"you have three lights on the machine left and right just
 * above the score… and then there is a light in the back of the machine that
 * shows up as the score creeps up, but those lights are completely disconnected
 * from the screen behind it… every now and again those three need to be in
 * sync and fairly frequently — not all the time."*
 *
 * Correct on both counts. The bulbs were never idle — they chase, they flash on
 * a slam, the meter climbs with the count — they were simply doing all of it in
 * a DIFFERENT LANGUAGE: gold-and-cyan on free-running 150 ms and 220 ms clocks,
 * next to a screen speaking in tier colours on the audio envelope. Two busy
 * surfaces with nothing in common read as two machines.
 *
 * So the bond is a MODE rather than a rewire, and `arenaScreenLampCue` is the
 * one wire it runs down. It is forced on for the whole of a punch — that is the
 * moment the owner is describing, and a reaction the two surfaces disagree about
 * is the worst possible time to be individuals. Between punches it comes and
 * goes: one ambient cycle in every LAMP_BOND_EVERY, off the same wall clock the
 * ambient show picks its movement from, so every explorer on the island sees the
 * machine and the screen breathe together on the same nine seconds without a
 * message being sent about it. Three is "fairly frequently, not all the time" —
 * nine seconds locked in every twenty-seven.
 */
const LAMP_BOND_EVERY = 3
/**
 * One wash segment of the ambient chase, in milliseconds — the step a bonded
 * bulb takes. AMBIENT_CYCLE_MS over twenty segments at the rotation's average
 * speed of two; the pods' own free clock is 220, so the bond is a lock rather
 * than a lurch.
 */
const LAMP_AMBIENT_BEAT_MS = Math.round(AMBIENT_CYCLE_MS / PUNCH_WASH_SEGMENTS / 2)
/** What an unbonded bulb steps on — the pods' own clock, unchanged. */
const LAMP_FREE_BEAT_MS = 220
/**
 * Tier to `SCREEN_PALETTES` index: steel, blood, ember, gold.
 *
 * Deliberately the same heat ramp as TIER_COLOUR without being the same
 * colours. The wash IS the verdict and has to stay legible as one; the ambient
 * is only remembering it, so it borrows the hue and drops the certainty.
 */
/**
 * ‼️BY ID, NOT BY INDEX. These were numbers into an eight-entry palette list.
 * The list is five now, and `screenPalette` wraps modulo its length, so
 * { 1: 6, 2: 5, 3: 0, 4: 4 } silently resolved to ember, CYAN, CYAN, hot — two
 * of the four tiers rendering as the same colour, for months, with no error
 * anywhere. A name cannot wrap onto the wrong entry.
 */
const TIER_PALETTE: Record<number, string> = {
  1: 'electric',
  2: 'violet',
  3: 'magenta',
  4: 'hot'
}
/** The house rotation, for an island that has not been punched recently. */
const HOUSE_PALETTES: readonly string[] = ['violet', 'magenta', 'electric', 'sodium']
/** Near-black, never pure: what the GLB's own surface is painted, once. */
const SCREEN_BACKING = Color4.create(0.02, 0.02, 0.03, 1)

/**
 * THE PORTRAIT — ON the screen, not in front of it.
 *
 * ‼Two shapes have already failed here and the geometry is why, so read this
 * before proposing a third.
 *
 *   PAINTED ON THE ARC. Screen_Surface carries ONE UV set running 0..1 across
 *   the whole 4:1 arc, and `AvatarTexture` — unlike the plain `Texture`
 *   message — has no `offset` or `tiling` fields, so a square snapshot cannot
 *   be letterboxed inside it. Every challenger came out four times too wide.
 *
 *   A FLAT PLATE IN FRONT. A square cannot lie on a cylinder, so it had to
 *   stand off far enough for its own CORNERS to clear — 2.6 units wide at
 *   radius 4.35 inside a picture at 4.80. The owner reported that repeatedly,
 *   and correctly: it read as an object hanging in the arena, complete with a
 *   visible border, rather than as something the screen was showing.
 *
 * The shape that works is the one the wash already uses. The face is cut into
 * `PUNCH_PORTRAIT_COLUMNS` panels standing in consecutive wash slots, each
 * carrying its own slice of the texture through the PLANE'S OWN UVs —
 * `MeshRenderer.setPlane(entity, uvs)`. The UVs live on the geometry, so the
 * avatar texture is never asked for an offset it does not have. There is no
 * plate, no border, and nothing stands more than a centimetre off the wash.
 *
 * The placement, the slot span and the slicing all live in
 * `punchPortraitColumn` — machine-root metres, the same frame as the wash, and
 * NOT the arc root's authored units the old plate was written in.
 */
const PORTRAIT_COLUMNS = PUNCH_PORTRAIT_COLUMNS

/**
 * THE VERDICT CARD — and it exists because the rule at the top of this file
 * was wrong.
 *
 * ‼️That rule reads "the arc deliberately carries no text at all. Its entire
 * vocabulary is a face, a colour and motion." Held to, it means a punch lands
 * and sixteen metres of screen turn ONE FLAT COLOUR — and the owner reported,
 * four separate times, that the arc "never celebrates anything, no stars, no
 * explosions, no wow, just boring flashing of a unique colour between clips".
 *
 * That is not a misreading of the design, it is the only reading available. A
 * full-bleed solid colour sitting between two video sections is visually
 * IDENTICAL to a video transition, so "connecting tissue" is exactly what it
 * looks like. And a colour cannot say a number: the score is the one thing this
 * whole machine produces, and it was reaching a 30 cm cabinet panel and never
 * the big screen behind it.
 *
 * So the wash stops being the whole message and becomes the BACKDROP. The card
 * puts the name, the score and the word for it in front of that colour, and a
 * spark shower goes off with them.
 *
 * ★Placed off-centre, mirroring the portrait, because the CABINET stands between
 * the deck and the middle of the arc — four metres of machine covering the
 * centre of the picture. Dead centre is the one place on this screen a player
 * cannot see. Face on one side, verdict on the other, both clear of it.
 */
/**
 * The card's own numbers, in the ARC ROOT's authored units.
 *
 * They used to be derived from the old flat portrait's angle and radius,
 * which stopped being possible when the face moved onto the curve and out of
 * this frame entirely. The values are unchanged — 42 degrees the other way,
 * at the same 4.35 — because the card is still a flat plate, and a flat
 * plate still has to hold its corners off a 4.80 cylinder.
 */
const VERDICT_ANGLE_DEG = 42
const VERDICT_RADIUS = 4.35
const VERDICT_Y = 2.45
/** A hair toward the deck, off the wash panel the card sits in front of. */
const VERDICT_TEXT_Z = -0.06
/** The text box. There is no plate any more; this is the width the lines wrap in. */
const VERDICT_PLATE_W = 3.4
/**
 * The outline that replaced the plate. Near-black, not black — a true-black rim
 * on an emissive wall reads as a hole, the same reason an unlit wash cell is
 * violet rather than black. Wide enough on the small lines to survive a gold
 * wash; the score is big enough to need less.
 */
const VERDICT_OUTLINE = Color4.create(0.04, 0.03, 0.08, 1)
const VERDICT_LINE_OUTLINE = 0.14
/**
 * ‼️THE NUMBER IS OFF THIS CARD. Owner, 2026-09-05: *"there is still a number
 * showing in front of the screen… I think we should remove the number, there's
 * just too many places showing the score already."*
 *
 * There were four: the cabinet's marquee, the HUD's 120 px counter, the arc's own
 * twenty-panel glyph field, and this 4.6-unit TextShape on top of all of it. The
 * marquee is the machine's own voice and the glyph field is the arc being a
 * stadium display; a third copy of the same digits, printed in text on a curve,
 * was the one with the least claim on the surface. What the card keeps is what
 * the numbers cannot say: WHO just swung, and what the machine thought of it.
 *
 * The two survivors close up around the middle the score used to hold, so the
 * card still reads as one block rather than as a gap with a label above and
 * below it.
 */
const VERDICT_NAME_DY = 0.44
const VERDICT_WORD_DY = -0.5
const VERDICT_NAME_FONT = 1.5
const VERDICT_WORD_FONT = 1.85
/** What the arc calls each grade out loud. Index by reaction intensity 1..4. */
const TIER_WORD: Record<number, string> = { 1: 'TAP', 2: 'SOLID', 3: 'BIG HIT', 4: 'MONSTER' }
/** Sparks per tier. A tap gets a few; a monster gets a shower. */
const BURST_RATE: Record<number, number> = { 1: 14, 2: 40, 3: 90, 4: 170 }

/**
 * The arc's own emitters — where they stand on the cylinder, and for how long.
 *
 * Four, spread across the face and clear of the middle, because the CABINET
 * stands in front of the centre of this screen and four metres of machine is
 * exactly what a centred shower would go off behind.
 */
const ARC_SPARK_ANGLES_DEG = [-62, -26, 26, 62]
/**
 * ‼️UNDER THE FEET, NOT BESIDE THEM. Measured off curved-screen.glb: the posts
 * are straight, on the model's own X axis at z = 0 — Frame_Right_Foot spans
 * x 4.50..5.18, y 0..0.16 — not on the arc's polar sweep. The first cut put the
 * jets at ±74° on a 4.62 radius, 1.3 m in FRONT of the posts (owner,
 * 2026-09-06: "slightly off, they're supposed to sit under the sockets").
 */
/**
 * ‼️THE FALL IS OFF (2026-09-06). The island froze three times tonight, every
 * time on a 980+, and this 1.7 m drop of the whole screen is the one path all
 * three had in common — the fence around the punch frame loop did not catch
 * the third, so it is not a thrown exception, which leaves the renderer. Until
 * a log names the cause, a 980+ gets tier four's struck-bell quake instead.
 */
const ARC_FALL_ENABLED = false
const ARC_EXHAUST_SIDES = [-1, 1]
const ARC_FOOT_X = 4.84
const ARC_EXHAUST_Y = -0.1
const ARC_EXHAUST_RATE_IDLE = 70
const ARC_EXHAUST_RATE_HOT = 260
const EXHAUST_CORE = Color4.create(0.85, 0.95, 1, 0.9)
const EXHAUST_FLAME = Color4.create(0.25, 0.55, 1, 0.55)
const ARC_SPARK_RADIUS = 4.5
const ARC_SPARK_Y = 1.1
const ARC_SPARK_RATE = 60
/** Tier 3 gets a beat of it, tier 4 gets a run. */
const ARC_SPARK_MS: Record<number, number> = { 3: 900, 4: 1_900 }

/**
 * Paint the GLB's own display surface, ONCE, at build.
 *
 * It used to carry the video and be repainted on every state change, which was
 * always the weakest wire in this file — the explorer applies a
 * GltfNodeModifiers material when the model loads and does not reliably re-read
 * it, which is why the arc's reactions had to move onto their own geometry in
 * the first place. Now that the panels ARE the picture, this surface only has
 * to stop being white behind them, and a single write at load is a thing
 * GltfNodeModifiers does do.
 */
function paintBacking(screen: ArenaScreen): void {
  GltfNodeModifiers.createOrReplace(screen.root, {
    modifiers: PUNCH_BIG_SCREEN_NODE_PATHS.map((path) => ({
      path,
      material: {
        material: {
          $case: 'unlit' as const,
          unlit: { diffuseColor: SCREEN_BACKING }
        }
      }
    }))
  })
}

/**
 * Build the arc. Render-only: it stands OUTSIDE the barrier ring, so a collider
 * here would only fight the invisible boxes that decide where a player stands.
 *
 * Takes no config any more, and that absence is the point: the only two settings
 * it ever read were the video source and the video's volume.
 */
export function createArenaScreen(parent: Entity): ArenaScreen {
  // THE QUAKE NODE, between the island and both of the screen's roots. Identity
  // at rest, so the arc stands exactly where it always stood; see `quakeRoot` on
  // ArenaScreen for why the shake cannot go on either root by itself, and
  // shared/punch-arc-quake.ts for why it cannot go back on the island.
  const quakeRoot = engine.addEntity()
  Transform.create(quakeRoot, {
    parent,
    position: Vector3.Zero(),
    rotation: Quaternion.Identity(),
    scale: Vector3.One()
  })

  const root = engine.addEntity()
  Transform.create(root, {
    parent: quakeRoot,
    // Lifted and pushed back off the deck. Both roots below take the SAME
    // offset in the island's frame — see PUNCH_BIG_SCREEN_PUSH_M for why this
    // is a translation and not a bigger clearance, and why moving one root
    // without the other tears the picture off the screen.
    position: Vector3.create(0, PUNCH_BIG_SCREEN_LIFT_M, -PUNCH_BIG_SCREEN_PUSH_M),
    rotation: Quaternion.fromEulerDegrees(0, PUNCH_BIG_SCREEN_FACE_DEG, 0),
    scale: Vector3.create(PUNCH_BIG_SCREEN_SCALE, PUNCH_BIG_SCREEN_SCALE, PUNCH_BIG_SCREEN_SCALE)
  })
  GltfContainer.create(root, {
    src: PUNCH_MODELS.bigScreen,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })

  // The picture. Up from the first frame and never taken down again: with the
  // video gone there is nothing behind these worth revealing, and the one thing
  // this screen is not allowed to be is blank.
  const washRoot = engine.addEntity()
  Transform.create(washRoot, {
    parent: quakeRoot,
    // The same offset as the GLB root. This root carries no rotation and no
    // scale (punchWashSegment bakes both), so the offset is written raw.
    position: Vector3.create(0, PUNCH_BIG_SCREEN_LIFT_M, -PUNCH_BIG_SCREEN_PUSH_M),
    scale: Vector3.One()
  })
  // COLUMNS x ROWS, in punchWashIndex order. The arc was one row deep, which is
  // why it could never show a band, a horizon or a header — see PUNCH_WASH_ROWS.
  const washPanels: Entity[] = []
  for (let col = 0; col < PUNCH_WASH_SEGMENTS; col += 1) {
    for (let row = 0; row < PUNCH_WASH_ROWS; row += 1) {
      const seg = punchWashSegment(col, row)
      const panel = engine.addEntity()
      Transform.create(panel, {
        parent: washRoot,
        position: Vector3.create(seg.x, seg.y, seg.z),
        rotation: Quaternion.fromEulerDegrees(0, seg.yawDeg, 0),
        scale: Vector3.create(seg.width, seg.height, 0.04)
      })
      MeshRenderer.setBox(panel)
      washPanels[punchWashIndex(col, row)] = panel
    }
  }

  // THE FACE, on the curve. One panel per wash slot, each showing its own
  // slice, and nothing behind them: the wash IS the backdrop, so the snapshot's
  // transparent margin shows the screen's own colour instead of a black plate.
  const portraitColumns: Entity[] = []
  for (let i = 0; i < PORTRAIT_COLUMNS; i += 1) {
    const col = punchPortraitColumn(i)
    const panel = engine.addEntity()
    Transform.create(panel, {
      parent: washRoot,
      position: Vector3.create(col.x, col.y, col.z),
      rotation: Quaternion.fromEulerDegrees(0, col.yawDeg, 0),
      scale: Vector3.create(col.width, col.height, 1)
    })
    // The slice, written ONCE at build time — the window into the texture is a
    // property of this panel's place in the row and never changes. Both faces of
    // the plane get the same window, which is what the SDK's own example does;
    // only the near one is ever looked at from the deck.
    // ‼️THE CORNER ORDER IS THE SDK'S, NOT A NATURAL-LOOKING ONE.
    //
    // Owner, 2026-09-04: "it is badly positioned, 90 degree angle wrong". It
    // was, and this list is why. A plane's default UVs run
    // `0,0  0,1  1,1  1,0` — UP the left edge, across the top, DOWN the right.
    // This was written as `u0,0  u1,0  u1,1  u0,1`, which walks the corners the
    // other way round the quad and lands the picture a quarter turn out. The
    // fix is to keep the SDK's own winding and substitute only the u window.
    MeshRenderer.setPlane(panel, [
      col.u0, col.v0, col.u0, col.v1, col.u1, col.v1, col.u1, col.v0,
      col.u0, col.v0, col.u0, col.v1, col.u1, col.v1, col.u1, col.v0
    ])
    VisibilityComponent.create(panel, { visible: false })
    portraitColumns.push(panel)
  }

  // THE VERDICT CARD, mirroring the portrait across the arc. Parented to `root`
  // so it rides the model's frame exactly like the face does.
  const verdictRoot = engine.addEntity()
  Transform.create(verdictRoot, {
    parent: root,
    position: Vector3.create(
      Math.sin((VERDICT_ANGLE_DEG * Math.PI) / 180) * VERDICT_RADIUS,
      VERDICT_Y,
      Math.cos((VERDICT_ANGLE_DEG * Math.PI) / 180) * VERDICT_RADIUS
    ),
    rotation: Quaternion.fromEulerDegrees(0, VERDICT_ANGLE_DEG, 0),
    // Down until a punch lands. One transform write shows the whole card.
    scale: Vector3.create(0.0001, 0.0001, 0.0001)
  })
  // ‼️NO PLATE. The card used to stand its three lines on a 3.4 x 2.6 m plane
  // painted 86% black, "so the numbers survive a gold wash behind them". What
  // that drew, from the deck, was a black rectangle on a near-black screen —
  // owner, 2026-09-04: "on the right side it still shows a black screen on a
  // black square... the black card on the right is bad, we should remove it".
  // The face on the other side of the arc already floats straight on the wash
  // with nothing behind it, and it works; the card now does exactly the same.
  // Legibility over a gold wash comes from the OUTLINE on each string instead —
  // the same trick the deck's balloons use to stay readable at ten metres.
  const verdictName = engine.addEntity()
  Transform.create(verdictName, {
    parent: verdictRoot,
    position: Vector3.create(0, VERDICT_NAME_DY, VERDICT_TEXT_Z)
  })
  TextShape.create(verdictName, {
    text: '',
    textColor: GOLD,
    fontSize: VERDICT_NAME_FONT,
    width: VERDICT_PLATE_W,
    height: 0.7,
    outlineColor: VERDICT_OUTLINE,
    outlineWidth: VERDICT_LINE_OUTLINE
  })
  const verdictWord = engine.addEntity()
  Transform.create(verdictWord, {
    parent: verdictRoot,
    position: Vector3.create(0, VERDICT_WORD_DY, VERDICT_TEXT_Z)
  })
  TextShape.create(verdictWord, {
    text: '',
    textColor: WHITE,
    fontSize: VERDICT_WORD_FONT,
    width: VERDICT_PLATE_W,
    height: 0.8,
    outlineColor: VERDICT_OUTLINE,
    outlineWidth: VERDICT_LINE_OUTLINE
  })

  // The shower. LOCAL simulation space, like every other burst in this scene:
  // world space detaches a particle from its parent's frame the instant it is
  // emitted, and on an island at 100 m that puts the sparks somewhere else.
  const verdictBurst = engine.addEntity()
  Transform.create(verdictBurst, { parent: verdictRoot, position: Vector3.create(0, -0.3, -0.35) })
  ParticleSystem.create(verdictBurst, {
    active: false,
    rate: BURST_RATE[1],
    maxParticles: 220,
    lifetime: 1.5,
    gravity: -1.4,
    initialSize: { start: 0.06, end: 0.16 },
    sizeOverTime: { start: 1, end: 0.2 },
    initialVelocitySpeed: { start: 2.4, end: 6.4 },
    initialColor: { start: GOLD, end: WHITE_HOT },
    colorOverTime: { start: WHITE_HOT, end: Color4.create(1, 0.8, 0.3, 0) },
    billboard: true,
    loop: true,
    simulationSpace: 0,
    texture: { src: 'images/fx-particle-dot.png' },
    shape: ParticleSystem.Shape.Cone({ angle: 62, radius: 0.5 })
  })

  // THE ARC'S OWN SPARKS. Placed on the cylinder the same way the card and the
  // face are — an angle and a radius in the arc root's authored units — so they
  // sit ON the screen's face rather than floating in front of it. LOCAL space
  // like every other emitter in this scene: world space cuts a particle loose
  // from its parent the instant it is emitted, and at 100 m that puts the
  // shower somewhere else on the island.
  const exhaust: Entity[] = []
  for (const side of ARC_EXHAUST_SIDES) {
    const jet = engine.addEntity()
    Transform.create(jet, {
      parent: root,
      position: Vector3.create(side * ARC_FOOT_X, ARC_EXHAUST_Y, 0),
      // Nozzle down: the cone's axis points at the cloud below the foot.
      rotation: Quaternion.fromEulerDegrees(180, 0, 0)
    })
    ParticleSystem.create(jet, {
      active: true,
      rate: ARC_EXHAUST_RATE_IDLE,
      maxParticles: 260,
      lifetime: 0.55,
      gravity: 0,
      // Pushed DOWN whichever way the engine signs gravity: a jet is a force.
      additionalForce: Vector3.create(0, -3.2, 0),
      initialSize: { start: 0.16, end: 0.05 },
      sizeOverTime: { start: 1, end: 0.35 },
      initialVelocitySpeed: { start: 1.1, end: 2.2 },
      initialColor: { start: EXHAUST_CORE, end: EXHAUST_FLAME },
      colorOverTime: { start: EXHAUST_CORE, end: Color4.create(0.2, 0.5, 1, 0) },
      billboard: true,
      loop: true,
      simulationSpace: 0,
      texture: { src: 'images/fx-particle-dot.png' },
      shape: ParticleSystem.Shape.Cone({ angle: 11, radius: 0.16 })
    })
    exhaust.push(jet)
  }

  const arcSparks: Entity[] = []
  for (const deg of ARC_SPARK_ANGLES_DEG) {
    const emitter = engine.addEntity()
    Transform.create(emitter, {
      parent: root,
      position: Vector3.create(
        Math.sin((deg * Math.PI) / 180) * ARC_SPARK_RADIUS,
        ARC_SPARK_Y,
        Math.cos((deg * Math.PI) / 180) * ARC_SPARK_RADIUS
      ),
      // Tipped off the wall toward the deck, so the shower comes at the crowd
      // instead of climbing the screen's own face.
      rotation: Quaternion.fromEulerDegrees(-28, deg, 0)
    })
    ParticleSystem.create(emitter, {
      active: false,
      rate: ARC_SPARK_RATE,
      maxParticles: 90,
      lifetime: 1.8,
      gravity: -0.9,
      additionalForce: Vector3.create(0, 1.4, 0),
      initialSize: { start: 0.08, end: 0.2 },
      sizeOverTime: { start: 1, end: 0.3 },
      initialVelocitySpeed: { start: 3.2, end: 7.5 },
      initialColor: { start: GOLD, end: WHITE_HOT },
      colorOverTime: { start: WHITE_HOT, end: Color4.create(1, 0.86, 0.4, 0) },
      billboard: true,
      loop: true,
      simulationSpace: 0,
      texture: { src: 'images/fx-particle-dot.png' },
      shape: ParticleSystem.Shape.Cone({ angle: 34, radius: 0.35 })
    })
    arcSparks.push(emitter)
  }

  const screen: ArenaScreen = {
    root,
    portraitColumns,
    portraitUserId: '',
    washRoot,
    washPanels,
    pattern: null,
    patternFrom: 0,
    patternUntil: 0,
    patternPainted: washPanels.map(() => null),
    patternSteppedAt: 0,
    mask: 'grille',
    flashUntil: 0,
    flashScore: 0,
    echoTier: 0,
    echoUntil: 0,
    verdictRoot,
    verdictName,
    verdictWord,
    verdictBurst,
    arcSparks,
    arcSparksUntil: 0,
    exhaust,
    exhaustHot: false,
    quakeRoot,
    quakeAt: 0,
    quakeSpec: null,
    verdictUntil: 0,
    verdictPhaseAt: 0,
    verdictTarget: 0,
    verdictTier: 1,
    verdictText: { name: '', word: '' },
    verdictShown: false,
    glyphUntil: 0,
    glyphKey: '',
    glyphField: []
  }
  paintBacking(screen)
  return screen
}

/** Contact. Called from the slam so the flash lands on the frame the fist does. */
/**
 * Contact. Called from the slam so the flash lands on the frame the fist does.
 *
 * `name` and `config` are what turn a colour into a celebration: the arc says
 * WHOSE punch it was and, EVENTUALLY, what it scored. Both optional, so a
 * caller that has neither still gets the flash it always got.
 *
 * ‼️THE CARD DOES NOT KNOW THE NUMBER YET, and that is the entire point of
 * `phaseStartedAt`. This shipped writing the final score on the frame of
 * impact — three seconds before the cabinet's counter finished crawling to it —
 * so the biggest surface on the island gave the answer away while everyone was
 * still watching the small one climb. The card now counts off the SAME clock
 * and the SAME curve as the marquee (`punchRevealShownScore`), and the tier
 * word is withheld until the counter tops out, because "MONSTER" on the screen
 * behind is as much of a spoiler as the digits are.
 *
 * `phaseStartedAt` is the scoring phase's first frame — the release, not this
 * slam. Omitted, the count starts here, which lands the arc a slam-delay behind
 * the cabinet rather than ahead of it: late is a wobble, early is a spoiler.
 */
export function arenaScreenSlam(
  screen: ArenaScreen | null,
  score: number,
  now: number,
  name = '',
  config?: PunchMachineAppConfig,
  phaseStartedAt = now,
  motionGain = 1,
  particlesGain = 1
): void {
  if (!screen) return
  screen.flashScore = score
  screen.flashUntil = now + FLASH_MS
  const tier = config ? punchReactionIntensity(score, config) : 1
  // What the arc goes on wearing once the verdict is over. Set here rather than
  // where the hold expires, because the hold expires inside a branch that a
  // director pattern is entitled to pre-empt — and a monster punch that happened
  // to draw a screen card would otherwise leave no trace at all.
  screen.echoTier = tier
  screen.echoUntil = now + AMBIENT_ECHO_MS
  screen.verdictPhaseAt = phaseStartedAt
  screen.verdictTarget = score
  screen.revealCountMs = punchRevealCountMs(score, config?.gameProfile)
  screen.perfectCutMs = punchPerfectCutMs(score, config)
  screen.verdictTier = tier
  // The card outlives the wash now: the wash is the punch's reaction and is
  // done in a beat, while the card has a whole count-up to get through. Held
  // to the end of the count plus the linger, so the finished number is on the
  // screen for a moment before it goes — a card that vanished ON the last digit
  // would be a reveal nobody got to see.
  // The cut is inside this window too, or on a 999 the card would come down in
  // the dark and the payoff would arrive on an empty screen.
  const countEndsAt = phaseStartedAt + PUNCH_SCORE_HOLD_MS + screen.revealCountMs + screen.perfectCutMs
  // ‼️THE NUMBER'S CLOCK COMES OFF THE COUNT, NOT OFF THE WASH. The tier hold is
  // kept only as a FLOOR, for a punch that somehow arrives with no scoring phase
  // behind it; every real one is held until the digits have landed and rested.
  screen.glyphUntil = Math.max(
    now + FLASH_MS + (TIER_HOLD_MS[tier - 1] ?? 900),
    countEndsAt + (GLYPH_LAND_HOLD_MS[tier - 1] ?? GLYPH_LAND_HOLD_MS[0])
  )
  // The card comes down WITH the number. It names who swung and what the machine
  // thought of it, so a card that outlived the score it is captioning — or died
  // before it — reads as two unrelated graphics sharing a screen.
  screen.verdictUntil = Math.max(screen.glyphUntil, countEndsAt + PUNCH_SCORE_LINGER_MS)
  paintVerdict(screen, name, tier, false)
  setBurst(screen, particlesGain > 0, Math.round((BURST_RATE[tier] ?? BURST_RATE[1]!) * particlesGain))
  // THE SCREEN THROWS SPARKS AT THE CROWD — tier 3 and up only, so the shower
  // still means something when it happens. Switched off again by the tick.
  const sparkMs = ARC_SPARK_MS[tier] ?? 0
  if (sparkMs > 0 && particlesGain > 0) {
    screen.arcSparksUntil = now + sparkMs
    setArcSparks(screen, true)
  }
  // AND THE SCREEN ITSELF TAKES THE HIT — tier 3 and up, same gate as the
  // sparks, for the same reason the owner gave: *"doesn't have to be all the
  // time, but from time to time this will add some drama"*. The curve is a pure
  // function of elapsed time, so every client that ran this slam rocks the arc
  // identically without a byte on the wire.
  // ‼️FLOOR: every 900+ rocks the arc, at tier three's spec at least, and a
  // 980+ nearly drops it off the cloud — see `punchArcFallSpec`. The tier
  // table still decides the two lower rungs; the cadence never does.
  const quake =
    ARC_FALL_ENABLED && score >= PUNCH_ARC_FALL_SCORE
      ? punchArcFallSpec()
      : punchArcQuakeSpec(score >= PUNCH_ARC_QUAKE_SCORE ? Math.max(tier, 3) : tier)
  if (quake && motionGain > 0) {
    screen.quakeAt = now
    screen.quakeSpec = { ...quake, throwM: quake.throwM * motionGain, rollDeg: quake.rollDeg * motionGain, pitchDeg: quake.pitchDeg * motionGain }
  }
}

/**
 * One frame of the quake.
 *
 * ‼️CALLED BEFORE EVERY EARLY RETURN IN `updateArenaScreen`, AND THAT IS LOAD-
 * BEARING. What the arc is PAINTING and whether it is MOVING are independent —
 * a director pattern is entitled to pre-empt the wash and does so by returning,
 * so a quake ticked further down would be frozen mid-throw by exactly the
 * monster punches that earn one, and left there until the next big hit.
 *
 * Writes nothing at all while `quakeAt` is 0, which is almost always: this is
 * one transform on one entity for at most 1.5 s after a tier-3 punch.
 */
function setExhaustHot(screen: ArenaScreen, hot: boolean): void {
  if (screen.exhaustHot === hot) return
  screen.exhaustHot = hot
  for (const jet of screen.exhaust) {
    ParticleSystem.getMutable(jet).rate = hot ? ARC_EXHAUST_RATE_HOT : ARC_EXHAUST_RATE_IDLE
  }
}

function tickQuake(screen: ArenaScreen, now: number): void {
  const spec = screen.quakeSpec
  setExhaustHot(screen, screen.quakeAt !== 0 && !!spec)
  if (screen.quakeAt === 0 || !spec) return
  const tf = Transform.getMutableOrNull(screen.quakeRoot)
  if (!tf) return
  const elapsed = now - screen.quakeAt
  if (elapsed < 0) return
  if (elapsed >= spec.ms) {
    screen.quakeAt = 0
    screen.quakeSpec = null
    // Home, exactly. The node is identity at rest and every other frame of this
    // scene assumes it, so it is put back rather than left wherever it stopped.
    tf.position = Vector3.Zero()
    tf.rotation = Quaternion.Identity()
    return
  }
  const q = punchArcQuake(elapsed, spec)
  tf.position = Vector3.create(q.x, q.y, q.z)
  tf.rotation = Quaternion.fromEulerDegrees(q.pitchDeg, 0, q.rollDeg)
}

/**
 * One frame of the card. There is no number on it any more, so the only thing
 * this clock still decides is WHEN the verdict word is allowed to appear — the
 * punchline waits for the count on the cabinet to land, exactly as before.
 * Cheap by construction: `paintVerdict` compares every string before it writes
 * one, so a held word costs two comparisons.
 */
function tickVerdict(screen: ArenaScreen, now: number): void {
  if (!screen.verdictShown || screen.verdictPhaseAt <= 0) return
  const since = now - screen.verdictPhaseAt
  // Shifting `since` back by the cut delays the landing by exactly the cut and
  // leaves the count's own default intact — see `perfectCutMs`.
  paintVerdict(screen, screen.verdictText.name, screen.verdictTier, punchRevealLanded(since - (screen.perfectCutMs ?? 0), screen.revealCountMs))
}

/** Rate and switch in one place: two callers must not disagree about the shape. */
function setBurst(screen: ArenaScreen, active: boolean, rate?: number): void {
  const current = ParticleSystem.getMutable(screen.verdictBurst)
  current.active = active
  if (rate !== undefined) current.rate = rate
}

/** All four arc emitters together — they are one effect, not four. */
function setArcSparks(screen: ArenaScreen, active: boolean): void {
  for (const emitter of screen.arcSparks) {
    ParticleSystem.getMutable(emitter).active = active
  }
}

/**
 * Write the card. Compared before written, like every other paint here: a card
 * held for two seconds is 120 frames, and a TextShape write is a CRDT message
 * whether or not the string differs.
 */
function paintVerdict(
  screen: ArenaScreen,
  name: string,
  tier: number,
  landed: boolean
): void {
  // The HUD owns the name and verdict; keep floating text off the moving arc.
  const nameText = ''
  // The verdict is the PUNCHLINE. Naming the tier while the counter is still
  // climbing tells the ring the answer before the machine does.
  const wordText = ''
  if (screen.verdictText.name !== nameText) {
    screen.verdictText.name = nameText
    TextShape.getMutable(screen.verdictName).text = nameText
  }
  if (screen.verdictText.word !== wordText) {
    screen.verdictText.word = wordText
    const shape = TextShape.getMutable(screen.verdictWord)
    shape.text = wordText
    // The word takes the tier's own colour, so the card agrees with the wash
    // behind it instead of being a white label sitting on top of one.
    shape.textColor = TIER_COLOUR[tier] ?? WHITE
  }
}

/** Raise or drop the card. One transform write, and the emitter with it. */
function showVerdict(screen: ArenaScreen, show: boolean): void {
  if (show === screen.verdictShown) return
  screen.verdictShown = show
  Transform.getMutable(screen.verdictRoot).scale = show
    ? Vector3.One()
    : Vector3.create(0.0001, 0.0001, 0.0001)
  setBurst(screen, show)
}

/**
 * Hang a face on the panel, or take it down.
 *
 * Rewritten only on a CHANGE OF HOLDER. An avatar texture is a network fetch,
 * so re-issuing the same material every frame asks the explorer for the same
 * snapshot sixty times a second.
 */
function setPortrait(screen: ArenaScreen, userId: string): void {
  if (userId === screen.portraitUserId) return
  screen.portraitUserId = userId
  for (const panel of screen.portraitColumns) {
    VisibilityComponent.createOrReplace(panel, { visible: Boolean(userId) })
    if (!userId) continue
    // The SAME texture on every column. They differ only in the UV window the
    // mesh already carries, so this is one snapshot shown in three places
    // rather than three fetches — and `basic` keeps it unlit, like every
    // other surface here, so an island at 100 m under a night sky still
    // shows a face rather than a grey panel.
    // ‼️THE BACKGROUND IS CUT OUT, NOT PAINTED BLACK.
    //
    // Owner, 2026-09-04: "ideally it should just be transparent background but I
    // guess this is not going to work anymore". It does work. A Catalyst avatar
    // snapshot is a PNG with a real alpha channel; `setBasicMaterial` simply
    // never asked for it, so the transparent margin composited to the unlit
    // material's own black and the face arrived inside a black rectangle sitting
    // on a lit screen.
    //
    // PBR with an ALPHA_TEST cutout and a full-strength emissive is the same
    // recipe the focus balloons already use on this island — cut out, unaffected
    // by the time of day, and with the wash showing through the margin so the
    // face reads as something the screen is DISPLAYING rather than a plate hung
    // in front of it.
    const face = Material.Texture.Avatar({ userId })
    Material.setPbrMaterial(panel, {
      texture: face,
      alphaTexture: face,
      transparencyMode: MaterialTransparencyMode.MTM_ALPHA_TEST,
      alphaTest: 0.35,
      emissiveTexture: face,
      emissiveColor: Color3.create(1, 1, 1),
      emissiveIntensity: 1.35,
      roughness: 1,
      metallic: 0
    })
  }
}

/**
 * Is this id a face the explorer can actually fetch?
 *
 * The machine can be "held" by things that are not people — the attract show
 * runs a house bot through the same turn machinery so an empty island still
 * looks alive. Asking for an avatar texture for one of those gets a blank
 * silhouette on a sixteen-metre screen, which reads as the feature being
 * broken. A wallet address is the one thing every real visitor has and no
 * synthetic holder does, so that is the test — deliberately not a comparison
 * against a specific bot id, which would need updating every time another kind
 * of stand-in is added.
 */
function showableFace(userId: string): boolean {
  return /^0x[0-9a-fA-F]{6,}$/.test(userId)
}

export interface ArenaScreenInput {
  /** A single numeric card; the full ranked list remains in ScoreboardPanel. */
  spotlight?: PunchArenaSpotlight | null
  config: PunchMachineAppConfig
  /** Whoever the machine thinks is up. May be a bot; the director filters. */
  activeUserId: string
  phase: string
  /** 0..1 charge, for the ramp. */
  power01: number
  /** Last completed punch, for the tier wash. */
  lastScore: number
  /** How hard the crowd is meditating together, 0..1. */
  focus01: number
  /**
   * ‼️HOW LOUD THE CABINET IS, RIGHT NOW, 0..1 — the missing link.
   *
   * Owner, 2026-09-04: *"there is too little connection between the machine and
   * the screen... the audio that we get from the machine is probably what
   * should drive the screen, and that would make it work."*
   *
   * The arc was already busy and still felt unrelated to the machine, because
   * everything it drew was on ITS own clock: a flash of a fixed length, a hold
   * of a fixed length, a pattern stepping at a fixed rate. Nothing on the
   * surface was tied to the thing the ear was actually receiving, so the two
   * ran side by side rather than together.
   *
   * This is that tie. It is a baked envelope read forward from the moment the
   * clip started (punchAudioLevel01 in punch-machine.ts) — the runtime offers
   * no way to measure a playing sound — and every branch below that draws a
   * brightness now multiplies by it. The surface therefore pumps ON the
   * impact, breathes with the machine's answer, and ticks with the score
   * tally, because those are the clips whose shape it is following.
   */
  audio01: number
}

/**
 * How often the surface advances. 25 Hz, not per-frame.
 *
 * The eye cannot tell 25 from 60 on a colour field this size, and the difference
 * is 500 material writes a second against 1,200 on the one surface in the scene
 * that is twenty entities wide.
 */
const PATTERN_STEP_MS = 40
/**
 * How far a full-volume moment may lift the surface toward white.
 *
 * Deliberately short of 1: at 1 the loudest frame of every clip whites the arc
 * out completely, and a screen that keeps flashing to white is the "boring
 * flashing" this whole rewrite was started to get away from. A third is enough
 * to be plainly following the sound and not enough to become the sound.
 */
const AUDIO_LIFT = 0.34
/**
 * How long the hard contact flash keeps the arc to itself before a pattern may
 * begin. The flash and the impact are ONE EVENT; see `arenaScreenPattern`.
 */
const PATTERN_AFTER_FLASH_MS = 150
/** Below this, two colours are the same colour as far as the panel is concerned. */
const PATTERN_EPSILON = 0.02
/**
 * How hard a panel glows before its mask's gain is applied.
 *
 * Emissive, because the arc is on a sky island at a hundred metres and a lit
 * material there is at the mercy of the time of day.
 *
 * ‼️MOBILE IS A DIFFERENT RENDERER. Desktop Explorer bloom at 2.2 reads as an
 * LED wall. Decentraland Mobile's post-process treats the same intensity as a
 * floodlight, and GOLD — the score digits, the sodium graphics, anything
 * yellow — is the worst of it: those cells are already near-white in
 * luminance, so the bloom whites them out and hurts. `isMobile()` is the same
 * call the HUD uses: the renderer telling us which virtual screen it picked,
 * not a pixel guess that would send phones down the desktop path. Desktop
 * stays at 2.2. Do not "fix" the phone by turning the monitor down.
 */
const PANEL_EMISSIVE = 2.2
/** Phone bloom of the desktop intensity. Still an LED wall; no longer a lamp. */
const PANEL_EMISSIVE_MOBILE = 1.0

function panelEmissive(): number {
  return isMobile() ? PANEL_EMISSIVE_MOBILE : PANEL_EMISSIVE
}

/**
 * ONE PANEL. Every writer on this surface goes through here.
 *
 * Emissive, because the arc is on a sky island at a hundred metres and a lit
 * material there is at the mercy of the time of day. And compared against
 * `patternPainted` before it writes, because this is called twenty times a step
 * by three different callers and most of those calls are a no-op.
 */
function paintPanel(screen: ArenaScreen, index: number, r: number, g: number, b: number): void {
  const previous = screen.patternPainted[index]
  if (
    previous &&
    Math.abs(previous.r - r) < PATTERN_EPSILON &&
    Math.abs(previous.g - g) < PATTERN_EPSILON &&
    Math.abs(previous.b - b) < PATTERN_EPSILON
  ) {
    return
  }
  screen.patternPainted[index] = Color4.create(r, g, b, 1)
  const mask = screenMask(screen.mask)
  // The mask rides in BOTH slots. Putting it only in `texture` shapes the lit
  // component alone, which next to panelEmissive() is a rounding error — the
  // arc would come back exactly as flat as it went in. The gain is what
  // stops the structure from also making the screen darker; see ScreenMask.
  const shaped = mask.src
    ? {
        texture: Material.Texture.Common({ src: mask.src }),
        emissiveTexture: Material.Texture.Common({ src: mask.src })
      }
    : {}
  Material.setPbrMaterial(screen.washPanels[index]!, {
    albedoColor: Color4.create(r, g, b, 1),
    emissiveColor: Color3.create(r, g, b),
    emissiveIntensity: panelEmissive() * mask.gain,
    roughness: 1,
    metallic: 0,
    ...shaped
  })
}

/**
 * SWAP THE MASK, and forget what every panel was showing.
 *
 * ‼️The clear is not an optimisation, it is the correctness of the swap. Every
 * write goes through paintPanel's epsilon check against `patternPainted`, which
 * records a COLOUR — so on a mask change any panel whose colour happens not to
 * have moved is skipped, and it keeps the old texture while its neighbours take
 * the new one. That reads as half the arc failing to load.
 */
function setMask(screen: ArenaScreen, id: ScreenMaskId): void {
  if (screen.mask === id) return
  screen.mask = id
  screen.patternPainted.fill(null)
}

/**
 * Paint one COLUMN, spreading the colour across its rows by band role.
 *
 * Every caller still thinks in columns — the patterns are functions of
 * (segment, t01) and have no Y term — so the rows are applied here, once, as
 * PUNCH_WASH_ROW_GAIN. That is what turns a flat wall of light into a display
 * with a plinth, a body and a header, without asking fifteen pattern cases to
 * learn about height.
 */
function paintColumn(
  screen: ArenaScreen,
  col: number,
  r: number,
  g: number,
  b: number
): void {
  for (let row = 0; row < PUNCH_WASH_ROWS; row += 1) {
    const gain = PUNCH_WASH_ROW_GAIN[row] ?? 1
    paintPanel(screen, punchWashIndex(col, row), r * gain, g * gain, b * gain)
  }
}

/**
 * The whole arc, one colour. What a verdict looks like.
 *
 * ‼️AND IT IS THE ONE THING THAT WEARS NO MASK. The contact flash is 150 ms of
 * hard solid colour on the frame the fist arrives and it is the snap of the
 * whole punch; cutting that frame into cells spends it on texture instead of on
 * impact. The arc goes clean for the hit and resolves into a masked pattern for
 * the second after it, which also puts a visible edge between the two halves of
 * every reaction.
 */
function wash(screen: ArenaScreen, colour: Color4): void {
  setMask(screen, 'none')
  for (let col = 0; col < PUNCH_WASH_SEGMENTS; col += 1) {
    paintColumn(screen, col, colour.r, colour.g, colour.b)
  }
}

/**
 * DRAW A GLYPH FIELD — the arc as a 20x8 matrix rather than as 20 columns.
 *
 * ‼️THIS IS THE ONE PAINTER THAT DOES NOT GO THROUGH `paintColumn`, and it must
 * not. Every other writer on this surface thinks in columns and lets the row
 * gain spread the colour into bands; a numeral drawn through that gain comes out
 * striped and stops being a numeral. Cells are addressed directly and take
 * `punchWashGlyphGain`, which is nearly flat on purpose.
 *
 * ‼️AND IT WEARS NO MASK, for the same reason the contact flash does not: a
 * grille over a 4x7 numeral removes about a third of every stroke, and the
 * strokes are one cell wide. Structure and legibility want opposite things here,
 * and legibility wins — the mask is what the arc does when it has nothing to
 * say.
 */
function paintGlyphField(
  screen: ArenaScreen,
  field: readonly boolean[],
  lit: Color4,
  dark: Color4
): void {
  setMask(screen, 'none')
  for (let col = 0; col < PUNCH_WASH_SEGMENTS; col += 1) {
    for (let row = 0; row < PUNCH_WASH_ROWS; row += 1) {
      const index = punchWashIndex(col, row)
      const on = field[index] === true
      const colour = on ? lit : dark
      const gain = on ? punchWashGlyphGain(row) : 1
      paintPanel(screen, index, colour.r * gain, colour.g * gain, colour.b * gain)
    }
  }
}

/**
 * The field for a key, built once and held. See `glyphKey` on the state.
 *
 * A key of `#<icon>` is a mark; anything else is drawn as characters. One
 * namespace, so the caller picks between a number and a star by handing over a
 * different string rather than by calling a different function — which is what
 * keeps the alternation in `updateArenaScreen` down to one expression.
 */
function glyphFieldFor(screen: ArenaScreen, key: string): readonly boolean[] {
  if (key === screen.glyphKey) return screen.glyphField
  screen.glyphKey = key
  screen.glyphField = key.startsWith('#')
    ? screenIconField(key.slice(1) as ScreenIconId)
    : screenTextField(key)
  return screen.glyphField
}

/**
 * START A PATTERN on the arc — the entry point the Show Director's runner calls.
 *
 * `durationMs` is the whole window, and the pattern is handed its progress
 * through it rather than a clock, so the same shape serves as a 150 ms flash or
 * a four-second scene. A new pattern replaces any running one outright: the arc
 * is one surface and two patterns on it is the salad this whole system exists
 * to prevent.
 */
export function arenaScreenPattern(
  screen: ArenaScreen | null,
  paint: ScreenPaint,
  durationMs: number,
  now: number
): void {
  if (!screen) return
  screen.pattern = paint
  // ‼️THE PATTERN STARTS AFTER THE CONTACT FLASH, NEVER INSTEAD OF IT.
  //
  // The flash IS the hit: 150 ms of hard solid colour on the frame the fist
  // arrives. Patterns that ramp up out of nothing — drain, gradient, meter —
  // pre-empted it and took the snap off every punch, which is a large part of
  // why a good hit stopped reading as one. The arc flashes first; the pattern
  // is what it does with the second that follows.
  screen.patternFrom = now + PATTERN_AFTER_FLASH_MS
  screen.patternUntil = screen.patternFrom + Math.max(80, durationMs)
  screen.patternSteppedAt = 0
}

/** Draw one frame of a paint spec across all twenty panels. */
function paintFrame(screen: ArenaScreen, paint: ScreenPaint, t01: number): void {
  // The mask travels with the pattern, so the charge meter, the director's
  // cards and the ambient show all pick one up without a single caller needing
  // to know this file has masks at all.
  setMask(screen, patternMask(paint.pattern))
  // Columns, not panels. Passing the panel COUNT as the segment count is what
  // it used to do, and with rows that would compress the whole pattern into the
  // first third of the arc.
  for (let col = 0; col < PUNCH_WASH_SEGMENTS; col += 1) {
    const [r, g, b] = screenSegmentColour(paint, col, PUNCH_WASH_SEGMENTS, t01)
    paintColumn(screen, col, r, g, b)
  }
}

/**
 * Paint one step of the running pattern. Returns false when it has finished, so
 * the caller can fall through to the colour ladder underneath.
 */
function tickPattern(screen: ArenaScreen, now: number): boolean {
  const paint = screen.pattern
  if (!paint || now >= screen.patternUntil) {
    // Leave the panels where they are; the branch below decides what replaces
    // them. Clearing to black here would put a frame of blackout on the arc
    // between the pattern ending and the wash taking over.
    if (screen.pattern) screen.pattern = null
    return false
  }
  // Hold off while the flash owns the surface: returning false lets the branch
  // below paint it, exactly as it did before patterns existed.
  if (now < screen.patternFrom) return false
  if (now - screen.patternSteppedAt < PATTERN_STEP_MS) return true
  screen.patternSteppedAt = now

  const span = Math.max(1, screen.patternUntil - screen.patternFrom)
  paintFrame(screen, paint, Math.max(0, Math.min(1, (now - screen.patternFrom) / span)))
  return true
}

/**
 * One frame of weather.
 *
 * Reads the machine's own state and paints; owns no game logic of its own, so it
 * can never disagree with the cabinet about what just happened.
 */
export function updateArenaScreen(
  screen: ArenaScreen | null,
  input: ArenaScreenInput,
  now: number
): string | undefined {
  if (!screen) return

  // THE QUAKE, before anything else can return early. What the arc is painting
  // and whether it is still moving are two different questions — see `tickQuake`.
  tickQuake(screen, now)

  // The face, before any branch below can return early. Who is holding the bag
  // is independent of what the arc is doing about it, and hanging this off one
  // of the reaction branches is how it would come to be missing during exactly
  // the moments it matters.
  setPortrait(screen, showableFace(input.activeUserId) ? input.activeUserId : '')

  // The card, before any branch below can return early. The wash is a backdrop
  // now, not the message, so the score has to survive every branch that paints
  // one — and come down the moment the hold expires, so it never outlives the
  // punch that earned it.
  showVerdict(screen, now < screen.verdictUntil)
  // The shower runs on its OWN clock, shorter than the card's: the card has a
  // whole count-up to get through and sparks for all of it would be a fog.
  if (screen.arcSparksUntil > 0 && now >= screen.arcSparksUntil) {
    screen.arcSparksUntil = 0
    setArcSparks(screen, false)
  }
  // ...and the WORD on it waits for the cabinet's counter to land, every frame
  // the card is up. See `arenaScreenSlam` for why the verdict must not simply be
  // printed at impact.
  tickVerdict(screen, now)

  // 0. THE PATTERN, when the director dealt one — the arc as twenty segments
  //    rather than one. It outranks every branch below, which are kept as the
  //    fallback for a punch that drew no screen card at all (and for anything
  //    that reaches this screen without going through the director).
  if (tickPattern(screen, now)) return

  // 1. Contact — the arc goes flat in the colour THIS punch earned. It used to
  //    open every reaction with the same near-white gold no matter what landed,
  //    which spent the loudest moment the screen has on a tap.
  if (now < screen.flashUntil) {
    const tier = punchReactionIntensity(screen.flashScore, input.config)
    // White-hot is the flash a monster earns and the ONLY white on the ladder.
    // The IMPACT clip is sounding on exactly these frames, so the flash rides
    // its envelope: the surface peaks when the hit does rather than a fixed
    // 150 ms after it.
    wash(screen, audioLift(tier === 4 ? WHITE_HOT : (TIER_COLOUR[tier] ?? ASH), input.audio01))
    return
  }

  // 2. ‼️THE NUMBER, SIXTEEN METRES WIDE, COUNTING WITH THE CABINET.
  //
  //    This branch used to hold ONE FLAT COLOUR for up to 2.4 seconds and that
  //    was the whole of the arc's reaction to a punch. Owner, 2026-09-04: "there
  //    is the score and the lights on the machine, when they go up this is not
  //    being mirrored on the screen in the background... it's just too slow most
  //    of the time as if it's waiting for something to happen and then when it
  //    happens it doesn't deliver."
  //
  //    It was waiting: a solid colour between two other solid colours has no
  //    event in it. The count is the event, it was already running on the
  //    cabinet and on the verdict card, and the arc is the only surface big
  //    enough to make it a spectacle. `punchRevealShownScore` off
  //    `verdictPhaseAt` is the SAME curve the marquee reads, so the three
  //    surfaces climb on the same frame rather than three near-misses of it.
  //
  //    ★AND THEN IT CELEBRATES. Once the count lands, a tier 3 or 4 punch
  //    alternates the number with a full-width mark on a fast beat — a stadium
  //    puts a graphic up when a goal goes in, it does not change the colour of
  //    the lights. Below tier 3 the number simply holds, because a mark that
  //    fires for an ordinary punch stops meaning anything.
  //    ‼️★★★AND IT STAYS UP LONG ENOUGH TO BE READ, which it never did.
  //
  //    Owner, 2026-09-05: *"sometimes you show score in very large numbers
  //    directly on the LCD, but they're shown just for like a fraction of a
  //    second and disappear often before they're fully rendered."*
  //
  //    Exactly so, and the arithmetic is blunt about why. This branch ran for
  //    `FLASH_MS + TIER_HOLD_MS` — 1,050 ms for a tap, 2,550 for a monster —
  //    while `punchRevealShownScore` sits at ZERO for the first 1,080 ms and does
  //    not top out until 3,680 ms after the release. So an ordinary punch put a
  //    sixteen-metre `0` on the arc, held it for a second, and took it down
  //    BEFORE THE FIRST DIGIT EVER MOVED. Nothing was rendering half-way; the
  //    digits were being evicted by a window that had been sized for a COLOUR
  //    WASH and knew nothing about the count it had been handed.
  //
  //    Three beats now, all off `glyphUntil`, which `arenaScreenSlam` derives
  //    from the count-up rather than from the wash:
  //
  //      PRE-COUNT  NO DIGITS. The cabinet is still sitting at 000 and a
  //                 sixteen-metre zero reads as a fault, not as suspense. The
  //                 arc holds the tier colour instead, so the impact reaction
  //                 simply runs on until there is a number worth printing.
  //      COUNT      the digits climb, on the cabinet's own curve, as before.
  //      LAND       the finished number STANDS for GLYPH_LAND_HOLD_MS — and the
  //                 last GLYPH_SETTLE_MS of that is the number ALONE, with the
  //                 celebration beat stopped, so the reveal ends on the score
  //                 rather than on whichever half of the beat the clock was in.
  if (screen.flashScore > 0) {
    // ‼️AND THE NEXT CHARGE OUTRANKS IT, which is the price of a longer hold.
    //
    // The reveal now runs to ~6.3 s past the release on a monster, and the round
    // does not wait that long — the reload ends and somebody can be back on the
    // bag with the last punch's number still up. Branch 3 (the power meter) sits
    // BELOW this one, so without this line a challenger would charge against a
    // stale score instead of watching their own wind-up. The number is the
    // PREVIOUS punch's; the moment there is a new one being wound up, it loses.
    if (now < screen.glyphUntil && input.phase !== 'charging') {
      const tier = punchReactionIntensity(screen.flashScore, input.config)
      const counting = screen.verdictPhaseAt > 0
      const since = now - screen.verdictPhaseAt
      // PRE-COUNT. The wash, not a zero.
      if (counting && since < PUNCH_SCORE_HOLD_MS) {
        wash(screen, audioLift(TIER_COLOUR[tier] ?? ASH, input.audio01))
        return
      }
      const shown = counting ? punchRevealShownScore(screen.verdictTarget, since, screen.revealCountMs) : screen.flashScore
      const landed = counting ? punchRevealLanded(since - (screen.perfectCutMs ?? 0), screen.revealCountMs) : true
      // THE SETTLE. Inside the last stretch the arc stops alternating: no mark,
      // no white-hot off-beat, just the number the whole island was waiting for.
      const settling = landed && now >= screen.glyphUntil - GLYPH_SETTLE_MS
      const icon = landed && !settling ? screenIconForTier(tier) : null
      // The beat. Number, mark, number, mark — fast enough to read as one
      // celebration rather than as the screen changing its mind.
      const beat = Math.floor(now / GLYPH_CELEBRATE_MS)
      const key = icon && beat % 2 === 1 ? `#${icon}` : String(shown)
      // Tier 4's own flourish: the lit cells go white-hot on the off-beat, so a
      // monster is the only punch on the island that ever whites out the arc
      // twice. Everything else burns in its own tier colour.
      const lit =
        tier === 4 && !settling && beat % 2 === 1 ? WHITE_HOT : (TIER_COLOUR[tier] ?? ASH)
      // The tally is CLICKING while these digits climb. Riding its envelope is
      // what makes the number on the arc and the number in the speaker read as
      // one event instead of two things that happen to overlap.
      paintGlyphField(screen, glyphFieldFor(screen, key), audioLift(lit, input.audio01), GLYPH_UNLIT)
      return
    }
    screen.flashScore = 0
  }

  // 3. THE ARC IS THE POWER METER while the bag is being charged.
  //
  //    It used to be a flat ember glow that deepened toward the release, and a
  //    flat colour cannot say HOW FAR ALONG the wind-up is — the one number the
  //    crowd wants while it is watching somebody hold the bag. `meter` fills
  //    outward from the apex, so a big charge visibly reaches the posts and a
  //    weak one never leaves the middle. `t01` is pinned past the pattern's own
  //    0.34 ramp-in so the reach is `power01` and nothing else; the beat only
  //    breathes the brightness.
  //
  //    Stepped at PATTERN_STEP_MS with the ambient show below it, and for the
  //    same reason: both are CONTINUOUS, so without a gate they would offer the
  //    surface twenty colours on every one of sixty frames. The two branches
  //    above are not gated and must not be — a 150 ms flash and a 120 ms strobe
  //    have too few frames to spend one waiting, and they write only on a change
  //    in any case.
  // Cached glyph paints write only changed cells. Return the caption on every
  // frame, including frames where continuous background motion is throttled.
  if (input.spotlight && (input.phase === 'ready' || input.phase === 'waiting')) {
    if (now - screen.patternSteppedAt >= PATTERN_STEP_MS || screen.glyphKey !== input.spotlight.glyph) {
      screen.patternSteppedAt = now
      paintGlyphField(screen, glyphFieldFor(screen, input.spotlight.glyph),
        audioLift(GOLD, input.audio01), GLYPH_UNLIT)
    }
    return input.spotlight.label
  }
  if (now - screen.patternSteppedAt < PATTERN_STEP_MS) return
  screen.patternSteppedAt = now

  if (input.phase === 'charging') {
    const beat = 0.5 + 0.5 * Math.sin((now / (260 - input.power01 * 150)) % (Math.PI * 2))
    paintFrame(
      screen,
      {
        pattern: 'meter',
        palette: screenPaletteById(TIER_PALETTE[input.power01 > 0.72 ? 4 : 3]!),
        energy: Math.min(1, input.power01 * (0.86 + beat * 0.14)),
        speed: 1,
        direction: 1,
        seed: 0
      },
      1
    )
    return
  }

  // 4. Nothing happening — and this is the branch the whole rewrite is about.
  //    It used to hide the wash and hand sixteen metres back to a video loop.
  const ambient = ambientPaint(screen, input, now)
  paintFrame(screen, ambient.paint, ambient.t01)
}

/**
 * ‼️★★★THE LAMP CUE — the one wire between this screen and the cabinet's bulbs.
 *
 * The three light families on the machine (the marquee arc, the six side pods
 * above the score, the meter climbing the cavity at the back) all animate, and
 * before this they all animated ALONE: free-running chases on 150 ms and 220 ms,
 * a fixed gold-and-cyan pair, and a heat ramp of the meter's own invention. None
 * of it was wrong on its own, and none of it had anything to do with the sixteen
 * metres of screen directly behind them — which is precisely how a machine and
 * its own display come to read as two separate machines standing next to each
 * other.
 *
 * This function is the arc answering the question "what are you doing right
 * now", in the only three terms a bulb can act on: a COLOUR, a BEAT, and whether
 * the bond is on at all. `updateShowLights` in punch-machine.ts reads it once a
 * frame and hands it to all three families, so a bonded moment is the cabinet
 * and the screen saying the same thing rather than two things that rhyme.
 *
 * PURE, and reading only state this screen already stores — no side effects, no
 * ordering requirement. It may be called before or after `updateArenaScreen` in
 * a frame; the worst case is a bulb one frame behind the panel above it, which
 * is 16 ms on a surface whose slowest beat is 320.
 */
export interface ArenaLampCue {
  /** What a bonded bulb wears. The arc's own colour this instant. */
  colour: Color4
  /** The floor a bonded bulb glows at before the machine's voice lifts it. */
  energy01: number
  /** The step a bonded chase takes, in ms — the arc's beat, not the bulb's. */
  beatMs: number
  /** Is the bond on this instant? */
  bonded: boolean
  /** Is the arc mid-punch? `bonded` is always true when this is. */
  reacting: boolean
}

/** What the bulbs do with no screen in the scene: exactly what they always did. */
const LAMP_CUE_FREE: ArenaLampCue = {
  colour: GOLD,
  energy01: 0.6,
  beatMs: LAMP_FREE_BEAT_MS,
  bonded: false,
  reacting: false
}

export function arenaScreenLampCue(screen: ArenaScreen | null, now: number): ArenaLampCue {
  if (!screen) return LAMP_CUE_FREE

  // 1. A PUNCH IS ON THE SURFACE, and the bond is not optional here. This is the
  //    moment the whole feature exists for: the arc goes to the tier's colour and
  //    the cabinet has to go with it, or the loudest event on the island is two
  //    surfaces disagreeing about what just happened.
  const reacting =
    now < screen.flashUntil || (screen.flashScore > 0 && now < screen.glyphUntil)
  if (reacting) {
    const tier = screen.verdictTier || 1
    return {
      colour: tier === 4 ? WHITE_HOT : (TIER_COLOUR[tier] ?? ASH),
      // Full, because a bulb during a reaction is already being flashed by the
      // slam floor; the cue is only telling it WHAT COLOUR to be while it does.
      energy01: 1,
      beatMs: GLYPH_CELEBRATE_MS,
      bonded: true,
      reacting: true
    }
  }

  // 2. AMBIENT — and the bond comes and goes, which is the owner's own brief:
  //    "fairly frequently, not all the time". One cycle in LAMP_BOND_EVERY, off
  //    the same wall clock `ambientPaint` picks its movement from, so the lock
  //    lands on the same nine seconds for every explorer in the room and no
  //    message has to be sent about it.
  const cycle = Math.floor(now / AMBIENT_CYCLE_MS)
  const bonded = ((cycle % LAMP_BOND_EVERY) + LAMP_BOND_EVERY) % LAMP_BOND_EVERY === 0
  // The same palette choice the ambient show is making this cycle — read from
  // the identical inputs rather than passed across, so the two cannot drift.
  const echoing = screen.echoTier > 0 && now < screen.echoUntil
  const palette = echoing
    ? screenPaletteById(TIER_PALETTE[screen.echoTier] ?? 'magenta')
    : screenPaletteById(HOUSE_PALETTES[cycle % HOUSE_PALETTES.length]!)
  // The MID, not the peak: peak is near-white on every house palette and a bulb
  // sitting at white is the bond doing nothing visible. Mid is the hue itself.
  const mid = palette.mid
  return {
    colour: Color4.create(mid[0]!, mid[1]!, mid[2]!, 1),
    energy01: 0.6,
    beatMs: LAMP_AMBIENT_BEAT_MS,
    bonded,
    reacting: false
  }
}

/**
 * Lift a colour toward white by how loud the cabinet is.
 *
 * A MULTIPLY would be wrong: it makes silence black, and an arc that goes dark
 * between clips reads as a screen that keeps switching off. The floor is what
 * the surface already drew, and the sound can only ever add to it — so quiet is
 * the picture as it was, and loud is that picture leaning forward.
 */
function audioLift(colour: Color4, audio01: number): Color4 {
  const lift = Math.max(0, Math.min(1, audio01)) * AUDIO_LIFT
  if (lift <= 0.01) return colour
  return Color4.create(
    colour.r + (1 - colour.r) * lift,
    colour.g + (1 - colour.g) * lift,
    colour.b + (1 - colour.b) * lift,
    colour.a
  )
}

/**
 * THE AMBIENT SHOW — the arc with no punch to report.
 *
 * Every dial is wired to something a player can affect, which is the whole
 * difference between this and the attract video it replaces:
 *
 *   ENERGY   the crowd. `focus01` is how hard the people on the deck are
 *            meditating together, so the arc brightens as the island fills and
 *            dims when it empties. Floored well above nothing — a screen that
 *            goes dark when the crowd thins reads as broken, not as calm.
 *   PALETTE  the last punch. For AMBIENT_ECHO_MS the arc wears that tier's
 *            colours, so somebody arriving late can see the island has been
 *            busy and roughly how hard. After that it falls back to the house
 *            rotation.
 *   SPEED    who is up. A challenger holding the bag doubles it: the surface
 *            leans forward the moment somebody steps on, before they have
 *            thrown anything.
 *
 * The movement itself is picked from the WALL CLOCK, not from a counter, so
 * every explorer in the room is on the same cycle without a message being sent
 * about it — the same discipline the Show Director works under.
 */
function ambientPaint(
  screen: ArenaScreen,
  input: ArenaScreenInput,
  now: number
): { paint: ScreenPaint; t01: number } {
  const cycle = Math.floor(now / AMBIENT_CYCLE_MS)
  const index = ((cycle % AMBIENT_PATTERNS.length) + AMBIENT_PATTERNS.length) % AMBIENT_PATTERNS.length
  const echoing = screen.echoTier > 0 && now < screen.echoUntil
  const palette = echoing
    ? screenPaletteById(TIER_PALETTE[screen.echoTier] ?? 'magenta')
    : screenPaletteById(HOUSE_PALETTES[cycle % HOUSE_PALETTES.length]!)
  // Somebody is standing at the bag. Not a punch yet, but not nothing either.
  const engaged = showableFace(input.activeUserId)
  return {
    paint: {
      pattern: AMBIENT_PATTERNS[index]!,
      palette,
      // ‼️THE FLOOR SITS ABOVE THE RAMP KNEE (0.3), and that is the whole fix
      // for the brown. Patterns multiply this down — `gradient` alone spends
      // its range at 0.2..1.0 of it — so a 0.34 floor put twenty panels at
      // 0.068..0.326, i.e. almost entirely BELOW the knee, in the base->mid
      // blend where a near-black mixed halfway to a colour is mud. At 0.55 the
      // same patterns live in the mid->peak half, where the hue is real.
      energy: Math.min(1, 0.55 + input.focus01 * 0.35 + (engaged ? 0.1 : 0)),
      // ‼️THE CROWD DRIVES THE TEMPO, not just the brightness. `focus01` already
      // lit the arc up as the deck filled, but a brighter still picture is not
      // a REACTION — the room could Boost as hard as it liked and the movement
      // on the screen never changed. It leans forward with the people now: a
      // full circle runs the ambient at double, on top of the double a
      // challenger stepping on already buys.
      speed: AMBIENT_SPEED[index]! * (engaged ? 2 : 1) * (1 + input.focus01),
      direction: cycle % 2 ? 1 : -1,
      seed: cycle
    },
    // The window repeats, which is why AMBIENT_PATTERNS holds only shapes that
    // wrap: at these integer speeds `phase` lands back where it started.
    t01: (now % AMBIENT_CYCLE_MS) / AMBIENT_CYCLE_MS
  }
}
