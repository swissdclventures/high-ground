import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { PUNCH_FOCUS_KEY_LABEL, PUNCH_PLAYERS_MAX, punchRingLine, punchScoreboardCaption } from '@shared/punch-machine-contract'
import type { PositionUnit } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { PUNCH_UI, punchAlpha } from './punch-visual-theme'
import { PUNCH_METER_PAINT } from '@shared/punch-visual-theme'
import {
  joinPunchQueue,
  leavePunchQueue,
  rejoinPunchWorld,
  minimizePunchFallPanel,
  punchRescuePress,
  punchAdminVisible,
  punchAdminRescueArmed,
  punchAdminToggleRescue,
  punchGlovePress,
  punchGloveRelease,
  punchGloveVisible,
  punchMachineHud,
  punchReturnFailed,
  setPunchScoreboardPage,
  togglePunchScoreboard,
  punchSfxAllMuted,
  punchSfxAnyAudible,
  punchVoicesMuted,
  setPunchVoicesMuted,
  punchGameSoundsMuted,
  setPunchGameSoundsMuted,
  punchRescuePromptsMuted,
  setPunchRescuePromptsMuted,
  restorePunchFallPanel,
  returnToPunchIsland
} from './punch-machine'
import {
  PUNCH_FOCUS_BAR_SPILL_AT,
  PUNCH_FOCUS_GUST_01,
  PUNCH_FOCUS_STREAK_STEP_MS,
  PUNCH_TIMING_SWEET_WIDTH_01,
  PUNCH_RETICLE_TRAVEL_PX,
  PUNCH_ASSIST_BAND_GAIN,
  PUNCH_PREP_FOCUS_PER_SEC,
  PUNCH_PREP_ZONE_SHARE,
  PUNCH_ROUND_SUMMARY_MS,
  punchFocusBarX01,
  punchFocusEarned,
  PUNCH_FOCUS_TARGET_01,
  PUNCH_FOCUS_ZONE_MARGIN_01
} from '@shared/punch-machine-contract'
import {
  PUNCH_TURN_COUNTDOWN_S,
  PUNCH_TURN_URGENT_S
} from '@shared/punch-machine-layout'
import { punchRescueOrder, type PunchRescueOrderPhase } from '@shared/punch-challenge'
import {
  PUNCH_PUSH_EXTRA_SHOUT,
  punchHelpAskCopy,
  punchHelpChipSet,
  punchHelpGap,
  punchHelpResultCopy,
  punchPushOrder,
  punchPushShout
} from '@shared/punch-push'
import { punchSaviorLine, punchSaviorScore, punchSaveRunLine } from '@shared/punch-results-store'
import { punchHudPlan, type PunchHudLayerInput } from '@shared/punch-hud-layers'
import { HUD, HUD_DANCE_MINI_HEIGHT, HUD_ROW_GAP } from '../social/hud-layout'
import {
  canvasSize,
  chromeInsets,
  cornerRadius,
  isCompact,
  px,
  SafeScreen,
  safeInsets,
  SvButton,
  SvChip,
  textPx,
  UI as BASE_UI,
  uiScale,
  type Skin
} from '../ui/kit'

// Keep the shared layout rules while giving this game's chips the same inks.
const UI = {
  ...BASE_UI,
  ink: PUNCH_UI.panel, inkSolid: PUNCH_UI.ink, track: PUNCH_UI.panelRaised,
  white: PUNCH_UI.ivory, muted: PUNCH_UI.muted, gold: PUNCH_UI.gold,
  goldHot: PUNCH_UI.goldHot, cyan: PUNCH_UI.channel, green: PUNCH_UI.focus,
  red: PUNCH_UI.danger,
}

const INK = PUNCH_UI.panel
const WHITE = PUNCH_UI.ivory
const MUTED = PUNCH_UI.muted
const GOLD = PUNCH_UI.gold
const GOLD_HOT = PUNCH_UI.goldHot
const CYAN = PUNCH_UI.channel
const CYAN_HOT = PUNCH_UI.channelHot
const TRACK = PUNCH_UI.panelRaised
/** Near-opaque, because the thing behind a prompt is the sky, and the sky is bright. */
const PROMPT_INK = PUNCH_UI.panel

/**
 * The game is three variables — AIM locked at the click, TIMING read off the big
 * reticle, POWER off the bar — and the screen is laid out in that order of
 * importance. The reticle is the hero: front and centre, pulsing, and it flashes
 * when the rings overlap, because "release now" is the whole skill. The power bar
 * sits in the lower third where it cannot cover the machine. The running SCORE
 * sits in a plate at the top with one status row under it. Attempt maths occupy
 * that slot only while the attempt is resolving. Bonuses slam in as arcade
 * events, then leave. The cabinet marquee still carries the diegetic number.
 */
const BAR_W = 640
const BAR_H = 44
const FRAME = 6

/**
 * ‼️THE AUTHORED CLOUD AND THE BLANK BUTTON — restored, and not to be re-skinned.
 *
 * Owner, 2026-09-04: "the float back widget [is] broken after it was replaced by
 * a new asset that I never wanted, I never gave the OK... I want the one we had
 * previously." The re-skin pass (4be441d0) swapped three files:
 *
 *   cloud-panel.png       a modelled cloud with gold stars, 1024x614
 *                         → a flat blue-rimmed rectangle, 1024x341
 *   float-button.png      a BLANK red-and-gold capsule
 *                         → a blue capsule with FLOAT BACK UP PAINTED INTO IT
 *   float-button-hover    deleted
 *
 * The second one is also the bug in the screenshot. This panel draws its own
 * `<Label value="FLOAT BACK UP">` over the button — correct against a blank
 * plate, and against a plate that already says it, exactly the doubled text the
 * owner photographed. All three files are back at their c21947c8 bytes, so the
 * label has a blank capsule to sit on again.
 *
 * The height follows the ART's aspect, and the art is 1024x614. It was
 * `CLOUD_W / 3` for the 3:1 replacement; left at /3 over a 5:3 cloud, the panel
 * squashes the cloud to a third of its height and every line inside it lands in
 * the wrong lobe.
 */
const CLOUD_TEX = 'images/punch/cloud-panel.png'
const BUTTON_TEX = 'images/punch/float-button.png'
const CLOUD_W = 620
const CLOUD_H = Math.round((CLOUD_W * 614) / 1024)
/**
 * The cloud's clear BODY, as a fraction of the art — the white middle, inside
 * the puffs. Text placed against the panel box instead runs out over the lobes
 * and the corner stars, which is where `MIN` ended up sitting on top of
 * `YOU FELL THROUGH THE CLOUDS`.
 */
const CLOUD_BODY_T = 0.3
const CLOUD_BODY_B = 0.86

/** Result cabinet uses the same enamel, petrol and brass as the machine. */
const SCORE_CLOUD_W = 700
const BUTTON_W = 300
const BUTTON_H = 100
const CLOUD_INK = PUNCH_UI.ink
const BUTTON_INK = PUNCH_UI.ivory

/**
 * ONE FRAME, and every edge-anchored control on this HUD is placed inside it.
 *
 * A phone does not hand its whole screen to the scene: the Explorer draws a
 * joystick, a jump cluster, chat and a menu over the top of us, and where they
 * are NOT is reported in `interactableArea`. Anchoring to the raw canvas edge
 * puts our controls under theirs; anchoring each control to its own hand-picked
 * inset is how they end up floating at different distances from the edges,
 * reading as pieces drifting toward the middle of the screen.
 *
 * Both areas are reported against the WHOLE screen, and these offsets are
 * measured inside `SafeScreen`, which has already moved the origin in by the
 * device inset — so the device inset has to come back out of the chrome one or
 * it is paid twice, which is a control sitting a notch's width in from where it
 * was asked to be.
 */
function hudFrame(): {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
  compact: boolean
} {
  const canvas = canvasSize()
  const chrome = chromeInsets()
  const safe = safeInsets()
  const margin = Math.max(12, px(20))
  const inward = (chromeSide: number, safeSide: number) => Math.round(Math.max(0, chromeSide - safeSide) + margin)
  return {
    left: inward(chrome.left, safe.left),
    right: inward(chrome.right, safe.right),
    top: inward(chrome.top, safe.top),
    bottom: inward(chrome.bottom, safe.bottom),
    width: Math.round(canvas.width - safe.left - safe.right),
    height: Math.round(canvas.height - safe.top - safe.bottom),
    compact: isCompact()
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Triangle wave from the runtime sawtooth, so pulses ease in and out. */
function breathe(pulse01: number): number {
  return pulse01 < 0.5 ? pulse01 * 2 : (1 - pulse01) * 2
}

function mix(a: Color4, b: Color4, t: number): Color4 {
  return Color4.create(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t)
}

/**
 * The timing game: a gold hoop and a cyan ball. Overlap = release.
 *
 * TWO circles, never more. ○ and ● draw one circle each; the flash is colour
 * and size. The hoop is the 250 px playable target — sizing it to the scoring
 * band made a ~76 px speck ("tiny little circle that's impossible to hit").
 * The ball still walks the whole 0→1 pendulum at `PUNCH_RETICLE_TRAVEL_PX`
 * so the 590 ms leg does not slam. The hoop going hot is the in-window tell.
 */
const RING = 250
const RING_HOT = 276
const BALL = 96
const BALL_HOT = 110
const RETICLE_TRAVEL = PUNCH_RETICLE_TRAVEL_PX

/**
 * A glyph's drawn centre sits a little BELOW its line box's centre, by a fixed
 * fraction of the font size — so two circles of different sizes stacked on the
 * same box centre do not share a centre. Nudging each box up by that fraction
 * lands both on one point, at any size, at any canvas scale.
 */
const GLYPH_DROP = 0.045

/**
 * The prompt under the reticle, on a ground of its own.
 *
 * It was gold text printed straight onto the world: a pale sky behind it, the
 * machine's own gold trim behind that, and at the one moment it has a job to do
 * — the frame you are meant to release on — it could not be read. Text over a
 * live 3D scene has no reliable background, so it has to bring one.
 *
 * The pulse is carried by COLOUR only. Pulsing the font size inside a
 * shrink-to-fit box makes the box itself breathe, and a prompt that changes
 * width every frame is a second thing to look at while aiming.
 */
function PromptChip(props: { top: number; height: number; fontSize: number; label: string; color: Color4 }) {
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: 0, top: props.top },
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      <UiEntity
        uiTransform={{
          height: props.height,
          padding: {
            top: 0,
            bottom: 0,
            left: Math.round(props.height * 0.5),
            right: Math.round(props.height * 0.5)
          },
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: cornerRadius(UI.radius.pill, props.height)
        }}
        uiBackground={{ color: PROMPT_INK }}
      >
        <Label value={props.label} fontSize={props.fontSize} color={props.color} textAlign="middle-center" />
      </UiEntity>
    </UiEntity>
  )
}

function AimReticle(props: {
  marker01: number
  target01: number
  sweetWidth01: number
  accuracy01: number
  charging: boolean
  pulse01: number
  /** How much of this window the crowd's ring-holders bought, 0..1. */
  assist01: number
  /** Fumble risk 0..1 and what it would cost 0..1. Both zero = the tell is off. */
  risk01: number
  stake01: number
}) {
  const k = uiScale()
  const offset = Math.round((props.marker01 - props.target01) * RETICLE_TRAVEL * k)
  const onTarget = props.charging && Math.abs(props.marker01 - props.target01) <= props.sweetWidth01
  const beat = breathe(props.pulse01)
  /**
   * ‼️THE WARNING IS THE RING GOING COLD, AND IT CARRIES NO TEXT.
   *
   * Owner, 2026-09-08, choosing how to show an elevated fumble risk: *"make it
   * physical, not text."* The reticle is the one thing a player is already
   * staring at while deciding when to let go, so it is the only place a warning
   * can arrive in time to change the decision — a rail chip is read after the
   * punch, if at all.
   *
   * RISK sets how far the ring bleeds from gold toward danger. STAKE sets how
   * much of that bleed is allowed through, so a wild needle on punch one is a
   * tint and the same needle on a ×32 run is unmistakable. They are two numbers
   * for exactly this reason — see `punchFumbleRisk01`.
   *
   * ‼️`onTarget` STILL WINS. The gold "you are in the window" signal is the
   * control's primary job and a warning must never sit on top of it, or the tell
   * would be teaching the player to distrust the only cue that pays.
   */
  const bleed = Math.max(0, Math.min(1, props.risk01)) * (0.4 + 0.6 * Math.max(0, Math.min(1, props.stake01)))
  // Above this the ring also breathes, so a dangerous punch is visible in
  // peripheral vision without being looked at directly.
  const alarmed = bleed > 0.55 && !onTarget
  const calm = bleed > 0.02 ? mix(GOLD, PUNCH_UI.danger, bleed * 0.8) : GOLD
  const ringColor = onTarget ? mix(GOLD, GOLD_HOT, beat) : alarmed ? mix(calm, PUNCH_UI.danger, beat) : calm
  const dotColor = onTarget ? mix(CYAN, GOLD_HOT, beat) : CYAN
  // Assist still swells the hoop when the crowd buys a wider window. The hoop
  // itself stays the 250 px glyph — shrinking it to the band was the speck.
  const widen = props.sweetWidth01 / PUNCH_TIMING_SWEET_WIDTH_01
  const ring = Math.round((onTarget ? RING + beat * (RING_HOT - RING) : RING) * widen * k)
  const ball = Math.round((onTarget ? BALL + beat * (BALL_HOT - BALL) : BALL) * k)
  // One centre for both circles, derived rather than hand-tuned per label:
  // separate offsets are how they drifted apart in the first place.
  const cx = 300 * k
  const cy = 146 * k
  const circle = (size: number, dx: number) => {
    const half = Math.round(size * 0.72)
    return {
      positionType: 'absolute' as const,
      position: {
        left: Math.round(cx - half + dx),
        top: Math.round(cy - half - size * GLYPH_DROP)
      },
      width: half * 2,
      height: half * 2
    }
  }
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '34%', left: '50%' },
        margin: { left: -300 * k, top: -140 * k },
        width: 600 * k,
        height: 280 * k,
        pointerFilter: 'none'
      }}
    >
      <Label
        value="○"
        fontSize={ring}
        color={ringColor}
        textAlign="middle-center"
        uiTransform={circle(ring, 0)}
      />
      <Label
        value="●"
        fontSize={ball}
        color={dotColor}
        textAlign="middle-center"
        uiTransform={circle(ball, offset)}
      />
      {onTarget ? (
        <PromptChip
          top={232 * k}
          height={Math.round(64 * k)}
          fontSize={Math.round(42 * k)}
          label="RELEASE NOW!"
          color={mix(GOLD, GOLD_HOT, beat)}
        />
      ) : props.assist01 > 0.005 ? (
        /* The crowd said it in the geometry a line above; this says it in
           words, once, for the swing where somebody wonders why the ring got
           easier. It replaces the standing instruction rather than crowding
           it — a player being helped does not also need to be taught. */
        <PromptChip
          top={240 * k}
          height={Math.round(44 * k)}
          fontSize={Math.round(26 * k)}
          label={`CROWD WIDENED YOUR WINDOW +${Math.round(props.assist01 * PUNCH_ASSIST_BAND_GAIN * 100)}%`}
          color={GOLD}
        />
      ) : (
        <PromptChip
          top={240 * k}
          height={Math.round(44 * k)}
          fontSize={Math.round(26 * k)}
          label={props.charging ? 'LOCK CYAN ON GOLD' : 'HOLD THE BAG TO CHARGE'}
          color={WHITE}
        />
      )}
    </UiEntity>
  )
}

/**
 * A full-width row that centres whatever it holds. Chips were being centred by
 * hand with a negative margin equal to half a GUESSED width, which only ever
 * lands for one particular name — "NAOMI IS UP" and "ALEXANDER IS UP" cannot
 * share an offset. Flexbox knows the real width; let it do the work.
 */
/**
 * THE ONE SENTENCE THE ROOM SAYS ABOUT PARTICIPATION.
 *
 * Every surface that names the circle — the balloons, the HUD list, the pill's
 * readout — funnels through here, so the wording is edited in one place rather
 * than re-invented in five by whoever touches them next.
 *
 * Named while there is one participant, counted once there are several, which
 * is the owner's own wording: "Swissverse is boosting", then "3 players are
 * boosting". It is a RECRUITING line — it exists to tell a deck of people that
 * the thing is joinable, so it says the verb rather than the arithmetic.
 */
function focusingLine(count: number, soleName?: string): string {
  if (count <= 0) return ''
  // "YOU IS STORING FOCUS" — owner, 2026-09-07, twice: "that's not English".
  if (count === 1 && soleName && soleName.trim().toUpperCase() === 'YOU') return 'YOU ARE STORING FOCUS'
  if (count === 1 && soleName) return `${soleName.toUpperCase()} IS STORING FOCUS`
  if (count === 1) return 'ONE PLAYER IS STORING FOCUS'
  return `${count} PLAYERS ARE STORING FOCUS`
}

function CenterRow(props: { top: PositionUnit; children?: ReactEcs.JSX.ReactNode }) {
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: props.top, left: 0 },
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      {props.children}
    </UiEntity>
  )
}

/** Enamel action disc. Its label changes on hold; input keeps the kit's release guards. */
const GLOVE_SKIN: Skin = {
  color: PUNCH_UI.red,
  pressedColor: PUNCH_UI.redHot,
  radius: UI.radius.pill
}

/**
 * Design size, and the real-pixel floor it may never shrink below.
 *
 * Raised 200 → 260 on the owner's report (2026-09-03): on a phone this is the
 * ONLY way to throw a punch that does not involve chasing a swinging bag with a
 * finger, and at 200 it read as one more piece of chrome rather than THE
 * control. The floor moves with it — a 156 px disc on a small canvas was under
 * the thumb of anyone holding the phone one-handed.
 */
const GLOVE_SIZE = 260
const GLOVE_MIN_PX = 196
/**
 * HOW MUCH BIGGER THE DISC SWELLS — TWO BEATS, NOT ONE.
 *
 * It shipped with a single gain gated on `turnCountdownVisible`, and the
 * countdown only exists in the last few seconds of a turn. So by construction
 * the button could ONLY pulse once you were running out of time: for the whole
 * first half of your turn the one control that matters sat perfectly still and
 * read as chrome (owner report, 2026-09-03 — "it's not pulsating").
 *
 *   READY   a slow, shallow breath from the moment the turn opens, off the
 *           cabinet's own idle pulse. It says "this is the thing to press",
 *           and it is deliberately small enough not to nag.
 *   URGENT  the original swell, on the shot clock's own second, so the button,
 *           the tick and the countdown's swell all land on one heartbeat.
 *
 * Both stop dead the instant you take hold of it. That rule was always right —
 * a control that keeps throbbing under a finger reads as the press not having
 * registered — and it is the one thing here that has not changed.
 */
const GLOVE_PULSE_GAIN = 0.16
const GLOVE_READY_PULSE_GAIN = 0.07

/**
 * Clearance for the button under the thumb.
 *
 * The Explorer draws its OWN controls in the bottom corners — on a phone that is
 * the jump/action cluster bottom-right, exactly where this button sat, so the
 * two were stacked on each other and a tap could land on either. We cannot move
 * the client's UI, but `UiCanvasInformation.interactableArea` tells us where it
 * is NOT, and the whole button is pushed inside that. The extra compact lift is
 * on top: touching down on a control whose edge merely abuts the jump button is
 * still a miss waiting to happen, so on a phone it clears it outright.
 */
const GLOVE_TOUCH_LIFT = 118

/**
 * A secondary control's width, scaled to the canvas but never below the ~48 px
 * every mobile guideline treats as the smallest thing a thumb can reliably hit.
 * A function, not a constant: `px()` reads the live canvas, which does not exist
 * at module load.
 */
function minButtonPx(): number {
  return Math.max(48, px(60))
}

/**
 * HOW FAR OFF THE BOTTOM EDGE BOTH THUMB CONTROLS START.
 *
 * On a phone that is the Explorer's own jump cluster, which is what
 * `GLOVE_TOUCH_LIFT` has always cleared. On a desktop it is OUR OWN NEIGHBOURS:
 * the Dance Bug transport (play / stop / loop) docks bottom-right at
 * `HUD.panel.miniBottom` with the scene launcher below it, per the venue layout
 * contract in `social/hud-layout.ts`. Punch chrome usually suppresses those
 * surfaces, but "usually" is not a layout — one venue that keeps its dock and
 * the glove is sitting on somebody else's stop button. The number is DERIVED
 * from the contract rather than copied out of it, so moving the dock moves this.
 *
 * One function for both sides, because the two thumbs must land on one line.
 */
function thumbRowLift(compact: boolean): number {
  if (compact) return px(GLOVE_TOUCH_LIFT)
  return px(HUD.panel.miniBottom + HUD_DANCE_MINI_HEIGHT + HUD_ROW_GAP)
}

/**
 * The glove's outer box, so anything sharing the bottom edge can dodge it.
 *
 * ‼️MEASURED AT REST, ALWAYS. The pulse below grows the disc about its resting
 * size, and everything that dodges the glove (the focus pill, the queue button)
 * reads this box. If the swell were in here, half the bottom rail would jitter
 * once a second — so the beat is applied to the DRAWN size only, and the layout
 * keeps the one number it can rely on.
 */
/**
 * HOW FAR IN FROM THE RIGHT EDGE THE GLOVE SITS — DESKTOP ONLY.
 *
 * Hard against the frame margin the button reads as chrome parked in a corner
 * rather than as the control (owner, 2026-09-03: "I wanted it more towards the
 * center"). Pulling it inboard puts it where the eye already is.
 *
 * ‼️DESKTOP ONLY, and that is not a style choice. On a phone the button's
 * position is load-bearing: `GLOVE_TOUCH_LIFT` and the frame margin exist to
 * clear the Explorer's own jump/action cluster, which we cannot move and which
 * sits exactly where this disc would otherwise land. Compact keeps its edge.
 *
 * Not centred either. The bag is what you are aiming at and it is dead ahead —
 * a control in the middle of the screen covers the thing it operates.
 */
const GLOVE_DESK_INSET = 160

/**
 * HOW FAR IN FROM THE RIGHT EDGE THE GLOVE SITS ON A PHONE.
 *
 * ‼️NOT ZERO ANY MORE. The disc used to sit hard against the frame margin on a
 * handset, on the theory that `GLOVE_TOUCH_LIFT` alone cleared the Explorer's
 * own jump/action cluster. That holds only while the renderer reports its
 * `interactableArea`; where it reports nothing, the frame collapses to the bare
 * 20 px margin and our disc is drawn straight onto the client's buttons — which
 * is what the owner hit (2026-09-08: "the punch button is overlapping with the
 * button"). Stepping inboard clears that cluster sideways, which no missing
 * inset can undo, and it costs a phone nothing: 1600 design pixels of width
 * means the disc is still under the right thumb.
 */
const GLOVE_PHONE_INSET = 150

function gloveBox(): { size: number; right: number; bottom: number } {
  const size = Math.max(GLOVE_MIN_PX, px(GLOVE_SIZE))
  const frame = hudFrame()
  const lifted = frame.bottom + thumbRowLift(frame.compact)
  // ‼️THE DISC MAY NOT CLIMB INTO THE RIGHT RAIL. The lift is measured off the
  // client's chrome, which grows when the Explorer shows more of its own; on a
  // 720 px canvas a tall enough lift walks the disc up through SCORES. The rail
  // ends at SCORES_BOTTOM, so that is the ceiling, and the disc stops there.
  const ceiling = px(SCORES_BOTTOM + 16)
  const headroom = Math.max(0, canvasSize().height - ceiling - size)
  return {
    size,
    right: frame.right + px(frame.compact ? GLOVE_PHONE_INSET : GLOVE_DESK_INSET),
    bottom: Math.min(lifted, headroom)
  }
}

function GloveButton(props: { charging: boolean; state: ReturnType<typeof punchMachineHud> }) {
  const box = gloveBox()
  const state = props.state
  // The disc beats WITH the shot clock, on the same instant as the tick and the
  // countdown's own swell — one heartbeat across sound, number and button,
  // instead of three things breathing at three different rates. It beats only
  // while a turn is actually live and untouched; charging stops it dead.
  // MY TURN AND NOT YET HOLDING IT is the whole gate now. Which of the two
  // beats plays is decided AFTER that, by whether the shot clock has surfaced —
  // the old code folded the two questions into one and lost the ready state.
  const live = state.isMyTurn && !props.charging
  const urgent = live && turnCountdownVisible(state)
  // The urgent beat is read off the CLOCK so it lands on the same instant as
  // the cabinet's tick. The ready breath is read off the machine's own idle
  // pulse, which is slower and has no second to land on.
  const intoSecond = urgent ? 1 - (state.turnMsLeft % 1000) / 1000 : 1
  const beat = urgent && intoSecond < 0.32 ? 1 - intoSecond / 0.32 : 0
  const ready = live && !urgent ? breathe(state.pulse01) : 0
  const grow = 1 + beat * GLOVE_PULSE_GAIN + ready * GLOVE_READY_PULSE_GAIN
  // Grown about the CENTRE, not the corner: half the extra width is given back
  // as offset, so the disc swells in place instead of creeping toward the edge.
  const spill = Math.round((box.size * (grow - 1)) / 2)
  return (
    <SvButton
      id="punch-glove"
      width={Math.round(GLOVE_SIZE * grow)}
      height={Math.round(GLOVE_SIZE * grow)}
      minPx={Math.round(GLOVE_MIN_PX * grow)}
      skin={GLOVE_SKIN}
      label={props.charging ? 'RELEASE' : 'PUNCH'}
      fontSize={36}
      color={PUNCH_UI.ivory}
      onDown={punchGlovePress}
      onUp={punchGloveRelease}
      releaseOnLeave={false}
      position={{
        positionType: 'absolute',
        position: { right: box.right - spill, bottom: box.bottom - spill },
        borderWidth: Math.max(3, px(6)),
        borderColor: PUNCH_UI.brass,
        // The plate has no pressed variant, so the press reads as the disc
        // coming fully up to full strength from a hair under it.
        opacity: props.charging ? 1 : 0.9 + Math.max(beat, ready) * 0.1
      }}
    />
  )
}

/**
 * THE ONE INSTRUCTION, ON THE CONTROL IT INSTRUCTS.
 *
 * This is `HOLD THE BAG TO CHARGE`, which used to float unattached at 62% of
 * the screen. It confused the owner on first read for exactly that reason —
 * a verb with no subject anywhere near it. Sitting directly above the disc it
 * needs no subject: the thing you hold is the thing under the words.
 *
 * ABOVE the glove and never below. Below is the thumb lift, and on a phone the
 * space under this button belongs to the Explorer's own jump cluster.
 */
function GloveCaption(props: { show: boolean }) {
  if (!props.show) return null
  const box = gloveBox()
  const h = Math.max(16, px(22))
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { right: box.right, bottom: box.bottom + box.size + Math.round(h * 0.3) },
        width: box.size,
        height: h,
        pointerFilter: 'none'
      }}
    >
      <Label
        value="HOLD TO CHARGE"
        fontSize={Math.round(h * 0.72)}
        color={WHITE}
        textAlign="middle-center"
        uiTransform={{ width: box.size, height: h }}
      />
    </UiEntity>
  )
}

const HELP_SKIN: Skin = {
  color: PUNCH_UI.gold,
  pressedColor: PUNCH_UI.goldHot,
  radius: UI.radius.pill
}

/**
 * ‼️THE HELP DISC SITS IN THE PUNCH SLOT. A phone has no E. Owner, 2026-09-10:
 * the save game has to read as mobile-first, and the control that answers
 * "help them" is the same thumb target as PUNCH — empty while you watch,
 * labelled HELP when the room can act.
 */
function punchHelpVisible(state: ReturnType<typeof punchMachineHud>): boolean {
  if (state.isMyTurn) return false
  if (!state.rescueLabel) return false
  if (state.rescuePushDone) return false
  if (state.rescueSkill !== 'push' && state.rescueWinnerName) return false
  return true
}

function HelpButton(props: { state: ReturnType<typeof punchMachineHud> }) {
  const state = props.state
  if (!punchHelpVisible(state)) return null
  const box = gloveBox()
  const asking = !!state.rescuePushAsking
  const hot = !asking && (state.rescuePushQuality01 ?? 0) >= 0.999
  const alive = asking || (state.rescuePushQuality01 ?? 0) > 0
  const ready = alive ? breathe(state.pulse01) : 0
  const grow = 1 + ready * GLOVE_READY_PULSE_GAIN * (hot ? 2.4 : 1)
  const spill = Math.round((box.size * (grow - 1)) / 2)
  return (
    <SvButton
      id="punch-help"
      width={Math.round(GLOVE_SIZE * grow)}
      height={Math.round(GLOVE_SIZE * grow)}
      minPx={Math.round(GLOVE_MIN_PX * grow)}
      skin={HELP_SKIN}
      label="HELP"
      fontSize={36}
      color={PUNCH_UI.ink}
      onDown={punchRescuePress}
      position={{
        positionType: 'absolute',
        position: { right: box.right - spill, bottom: box.bottom - spill },
        borderWidth: Math.max(3, px(hot ? 10 : 6)),
        borderColor: hot ? GOLD_HOT : alive ? PUNCH_UI.brass : punchAlpha(PUNCH_UI.brass, 0.45),
        opacity: hot ? 1 : alive ? 0.92 : 0.48
      }}
    />
  )
}

const RELOAD_GREEN = PUNCH_UI.focus
const RELOAD_SEGMENTS = 18

/**
 * The reload column: a thin vertical bar that fills bottom-to-top while the
 * machine is out of action, yellow at the base easing to green at the top. It
 * exists because a dead button reads as a broken game — this says "wait" and
 * shows exactly how long. Built from thin segments because DCL UI has no
 * gradients; unlit segments stay as a dim track so the full height is legible.
 */
/**
 * THE RELOAD METER ON A PHONE: A BAR ACROSS THE TOP OF THE BUTTON IT EXPLAINS.
 *
 * The desktop column runs 198 px down the right edge from under SCORES. On a
 * 720 px phone canvas that column is drawn straight through the PUNCH disc,
 * which is parked in the same corner — the "wait" instrument printed over the
 * control it is telling you to wait for. Compact draws it as a thin horizontal
 * bar sitting directly on top of the disc, the same width as the disc, so it
 * reads as that button's own state instead of as chrome that happens to overlap
 * it. Same segments, same yellow-to-green walk; only the axis changes.
 */
function ReloadBarThumb(props: { fill: number }) {
  const box = gloveBox()
  const gap = Math.max(1, px(3))
  const segW = Math.floor((box.size - gap * (RELOAD_SEGMENTS - 1)) / RELOAD_SEGMENTS)
  const segH = px(16)
  const width = segW * RELOAD_SEGMENTS + gap * (RELOAD_SEGMENTS - 1)
  const labelH = px(22)
  const bottom = box.bottom + box.size + px(16)
  const segments = []
  for (let i = 0; i < RELOAD_SEGMENTS; i += 1) {
    const t = i / (RELOAD_SEGMENTS - 1)
    const lit = props.fill >= (i + 1) / RELOAD_SEGMENTS
    segments.push(
      <UiEntity
        key={`reload-thumb-${i}`}
        uiTransform={{
          positionType: 'absolute',
          position: { left: i * (segW + gap), top: 0 },
          width: segW,
          height: segH
        }}
        uiBackground={{ color: lit ? mix(GOLD, RELOAD_GREEN, t) : TRACK }}
      />
    )
  }
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { right: box.right + Math.round((box.size - width) / 2), bottom },
        width,
        height: segH,
        pointerFilter: 'none'
      }}
    >
      {segments}
      <Label
        value="RELOADING"
        fontSize={textPx(16)}
        color={MUTED}
        textAlign="middle-center"
        uiTransform={{
          positionType: 'absolute',
          position: { left: 0, top: -(labelH + px(2)) },
          width,
          height: labelH
        }}
      />
    </UiEntity>
  )
}

function ReloadBar(props: { reload01: number }) {
  const fill = clamp01(props.reload01)
  if (hudFrame().compact) return <ReloadBarThumb fill={fill} />
  const k = uiScale()
  const segH = Math.round(9 * k)
  const gap = Math.max(1, Math.round(2 * k))
  const width = Math.round(14 * k)
  const height = RELOAD_SEGMENTS * (segH + gap)
  const segments = []
  for (let i = 0; i < RELOAD_SEGMENTS; i += 1) {
    // Index 0 is the BOTTOM segment; colour walks yellow -> green going up.
    const t = i / (RELOAD_SEGMENTS - 1)
    const lit = fill >= (i + 1) / RELOAD_SEGMENTS
    segments.push(
      <UiEntity
        key={`reload-${i}`}
        uiTransform={{
          positionType: 'absolute',
          position: { left: 0, top: (RELOAD_SEGMENTS - 1 - i) * (segH + gap) },
          width,
          height: segH
        }}
        uiBackground={{ color: lit ? mix(GOLD, RELOAD_GREEN, t) : TRACK }}
      />
    )
  }
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        // Under the scores button, not at a percentage of the viewport: see the
        // right-rail block. `32%` put an 18-segment column straight through
        // whatever the rail was holding on a short screen.
        position: { right: Math.round(56 * k), top: Math.round(RELOAD_TOP * k) },
        width,
        height
      }}
    >
      {segments}
      <Label
        value="RELOADING"
        fontSize={Math.round(16 * k)}
        color={MUTED}
        textAlign="middle-center"
        uiTransform={{
          positionType: 'absolute',
          position: { left: Math.round(-63 * k), top: height + Math.round(6 * k) },
          width: Math.round(140 * k),
          height: Math.round(22 * k)
        }}
      />
    </UiEntity>
  )
}

/** Power in the lower third, wide and thick, with the aim lock beside it. */
function PowerBar(props: { power01: number; accuracy01: number }) {
  const power = clamp01(props.power01)
  const k = uiScale()
  const barW = Math.round(BAR_W * k)
  const barH = Math.round(BAR_H * k)
  return (
    <UiEntity
      uiTransform={{
        width: barW + FRAME * 2,
        height: barH + FRAME * 2 + 26,
        positionType: 'absolute',
        position: { top: '74%', left: '50%' },
        margin: { left: -(barW + FRAME * 2) / 2 },
        flexDirection: 'column',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      <UiEntity
        uiTransform={{ width: barW + FRAME * 2, height: barH + FRAME * 2 }}
        uiBackground={{ color: INK }}
      >
        <UiEntity
          uiTransform={{
            width: barW,
            height: barH,
            positionType: 'absolute',
            position: { left: FRAME, top: FRAME }
          }}
          uiBackground={{ color: TRACK }}
        >
          <UiEntity
            uiTransform={{ width: Math.round(barW * power), height: barH, positionType: 'absolute', position: { left: 0, top: 0 } }}
            uiBackground={{ color: mix(CYAN, GOLD, power) }}
          />
        </UiEntity>
      </UiEntity>
      <Label
        value={`POWER ${Math.round(power * 100)}%   ·   AIM ${Math.round(clamp01(props.accuracy01) * 100)}%`}
        fontSize={18}
        color={WHITE}
        textAlign="middle-center"
        uiTransform={{ width: barW, height: 26 }}
      />
    </UiEntity>
  )
}

/**
 * THE WAY IN. Arriving on the island makes you a spectator; this is the one
 * step that makes you a competitor.
 *
 * Standing near the machine used to enter you on its own, so someone who came
 * to watch was in the rotation before they had read a word of it, and the bag
 * was handed to people who were not looking at it. Entering is a decision now,
 * and leaving is the same button — a queue you cannot get out of is a trap.
 */
function QueueControl(props: { state: ReturnType<typeof punchMachineHud> }) {
  const { state } = props
  if (!state.queued && !state.canJoinQueue && !state.joiningQueue && !state.ghostLive) return null
  const waiting = state.queued && !state.isMyTurn && state.queuePlace > 0
  // In the ring is still IN — the entry decision was made and the way out is
  // the same button. Only the number it prints changes, because a place in the
  // ring and a place in the queue are not the same distance from the bag.
  const ringed = state.queued && state.ringPlace > 0
  // ‼️THE WAY IN PULSES. Owner, 2026-09-06: *"it needs to pulsate when you are
  // not in — users know what they need to click to start, because it's a bit
  // hidden in the top right corner if you don't know where to look."* Colour
  // and a few per cent of size, on the beat every other prompt breathes to;
  // once you are in, it holds still — the pulse means "press me", and a
  // button you have already pressed has nothing left to ask.
  const beat = (state.queued || state.joiningQueue) && !state.ghostLive ? 0 : breathe(state.pulse01)
  const grow = 1 + 0.05 * beat
  // ‼️ONE BUTTON, NOT TWO. Being in the queue used to add a second chip
  // ("IN THE QUEUE · #3") above LEAVE QUEUE — two surfaces for one fact
  // (owner, 2026-09-06: "there is no need to create extra surface"). Your place
  // and your way out are the same control now.
  const label = state.ghostLive
    ? 'REJOIN TO PLAY'
    : state.joiningQueue
      ? 'JOINING…'
      : state.queued
        ? ringed
          ? `#${state.ringPlace} IN RING  ·  LEAVE`
          : waiting
            ? `#${state.queuePlace} IN QUEUE  ·  LEAVE`
            : 'LEAVE QUEUE'
        : 'JOIN THE QUEUE'
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        // TOP-RIGHT CORNER. It sat mid-LEFT (over the Explorer's chat), then
        // third down the right rail, which still read as floating inside the
        // picture rather than filed at its edge. The corner is chrome, and
        // during play nothing else is in it (see the right-rail block).
        position: {
          right: Math.max(16, Math.round(FALL_CHIP_RIGHT * uiScale())),
          top: Math.round(QUEUE_TOP * uiScale())
        },
        width: px(260),
        flexDirection: 'column',
        // Hug the screen edge: the panel is wider than the button so a
        // left-aligned column would float it into the middle of the rail.
        alignItems: 'flex-end',
        pointerFilter: 'none'
      }}
    >
      {/* ‼️THE ROOM'S GAME, STATED — NOT OFFERED. This was a button that cycled
          Classic / Streak Rush / Crowd Party, sitting unlabelled directly above
          JOIN THE QUEUE. Owner, 2026-09-06: "who gets to select those? does
          everybody have a selection? we can't all decide, and I don't have any
          privilege to decide." Both halves of that were true at once, which is
          why it could not be read: the button WAS a real per-player override
          (it rode the queue entry and beat the venue's authored profile in
          `profile()`), and a shared bag with one queue and one crowd is not a
          thing three people can play under three rule sets. Worse, the boards
          are keyed by the scoring rules, so cycling split the room's scoreboard.

          One venue, one game, chosen by the owner in Apps -> Punch Machine ->
          Game director. This says which one that is and offers nobody a choice
          the room cannot honour. */}
      {/* The preset chip ("STREAK RUSH") is gone: nobody in the room can change
          it, so it was a label for a control that does not exist (owner,
          2026-09-08: "we don't need to show it because nobody can change it"). */}
      <SvButton
        id="punch-queue"
        label={label}
        width={Math.round(QUEUE_BTN_W * grow)}
        height={Math.round(QUEUE_BTN_H * grow)}
        minPx={54}
        fontSize={20}
        color={state.ghostLive ? PUNCH_UI.ink : PUNCH_UI.ivory}
        // Red invites play; petrol confirms membership; gold reconnects a ghost.
        skin={{
          color: state.ghostLive ? UI.gold : state.queued ? PUNCH_UI.panelRaised : PUNCH_UI.red,
          pressedColor: state.ghostLive ? UI.goldHot : state.queued ? PUNCH_UI.petrol : PUNCH_UI.redHot,
          radius: UI.radius.md
        }}
        position={{ borderWidth: Math.max(1, px(2)), borderColor: PUNCH_UI.brass }}
        onDown={
          state.ghostLive
            ? rejoinPunchWorld
            : state.queued || state.joiningQueue
              ? leavePunchQueue
              : joinPunchQueue
        }
      />
    </UiEntity>
  )
}


/**
 * THE TOP-RIGHT CORNER IS SPOKEN FOR.
 *
 * The collapsed fall chip lives here, and it has first claim: it is the way
 * back onto the island, so it may never be pushed under anything. Everything
 * else on this edge starts below it — hence FALL_CHIP_BOTTOM, which is what
 * the sound mixer measures itself from rather than repeating these numbers.
 */
const FALL_CHIP_TOP = 24
const FALL_CHIP_RIGHT = 24
const FALL_CHIP_H = 62
const FALL_CHIP_BOTTOM = FALL_CHIP_TOP + FALL_CHIP_H

/**
 * THE RIGHT RAIL, TOP TO BOTTOM, MEASURED ONCE.
 *
 * queue button → scores → reload meter, each starting where the one above it
 * ends. The sound control is NOT in this chain any more: it is an icon parked
 * beside the queue button on the corner row (owner, 2026-09-08, on a phone:
 * "we can move sound out of the way into the corner, just an icon, and then
 * move scores all the way up to the queue button"). A phone's canvas is 720
 * design pixels tall and the PUNCH disc claims the bottom right of it, so every
 * row this rail spends pushes SCORES and the reload meter down onto the disc.
 * A word-and-checkbox mixer is not worth a row of that. The QUEUE BUTTON HAS THE CORNER now. It used to be third down, which
 * on a phone put the one control that makes you a competitor a third of the way
 * into the picture — floating over the deck rather than filed at the edge. The
 * corner reads as chrome, and the corner is free: the fall chip that claims it
 * is drawn on the FALL branch of the root, which returns before any of this, so
 * the two can never be on screen together. Every instrument on this edge used to carry its own
 * number or its own percentage, and that is exactly how the pieces ended up on
 * top of each other: the queue button was parked on the LEFT edge (over the
 * Explorer's chat) because the right edge had no shape anyone could read, and
 * the reload meter's `32%` sat at whatever pixel the viewport happened to make
 * it. Derived numbers mean adding a sound switch moves the two things below it
 * by construction rather than by somebody remembering to.
 *
 * The left edge is NOT ours: the Explorer parks its own menu rail and the chat
 * there. Nothing this HUD owns may be anchored to it.
 */
const QUEUE_TOP = FALL_CHIP_TOP
/** The bright end of the JOIN pulse: gold lifted toward white, never a second hue. */
const QUEUE_GOLD_PULSE = Color4.create(1, 0.93, 0.7, 1)
const QUEUE_BTN_H = 64
const QUEUE_BTN_W = 240
/**
 * The pulse grows the button about 5% about its right edge, so anything sharing
 * the corner row has to clear the GROWN width or it gets breathed on once a
 * second.
 */
const QUEUE_BTN_GROWN_W = Math.round(QUEUE_BTN_W * 1.06)
/**
 * ‼️NO RESERVED CHIP ROW. 54 px were held here for an "IN THE QUEUE · #n" chip
 * that was folded into the button's own label ("#3 IN QUEUE · LEAVE") and has
 * not been drawn since. The reservation outlived it, pushing every control
 * below down by a row that nothing was ever in.
 */
const QUEUE_BOTTOM = QUEUE_TOP + QUEUE_BTN_H
/**
 * SOUND IS ONE ICON, ON THE CORNER ROW — not a row of the rail.
 *
 * It sits to the LEFT of the queue button on the same line, so it costs the
 * vertical rail nothing. The left edge is not ours (the Explorer's chat and
 * menu live there), which is why "the corner" means this one.
 */
const MUTE_ICON = 44
const MUTE_ICON_GAP = 14
const MUTE_ICON_RIGHT = FALL_CHIP_RIGHT + QUEUE_BTN_GROWN_W + MUTE_ICON_GAP
const MUTE_ICON_TOP = QUEUE_TOP + Math.round((QUEUE_BTN_H - MUTE_ICON) / 2)
/**
 * THE HEADCOUNT IS CHROME, AND IT COSTS THE RAIL NOTHING.
 *
 * Owner, 2026-09-09: *"the current player count sits at the top of the mobile
 * screen and pushes important gameplay content downward. Relocate it to a
 * compact secondary location. Display it simply as 0/4, 1/4, 2/4. It is useful
 * information but does not deserve primary screen space."*
 *
 * It was `PLAYERS 1 OF 4`, a full 28 px row of the top rail — and a rail row is
 * the most expensive real estate in this HUD on a 720 px canvas: everything
 * below it moves down, including the round header that carries the pips, the
 * shot clock and the streak rung. So it joins the sound icon on the corner row,
 * left of it, on the same line as the queue button: third in a chain that is
 * measured, never re-typed.
 *
 * ‼️SAME PLACE ON BOTH DEVICES. Forking it — corner on a phone, rail on a
 * monitor — is how the phone loses content one change later (see
 * [[mobile-canvas-is-720-tall-and-1600-wide]], Law 3). A monitor has the room
 * to spare, not a reason to say it louder.
 */
const SEATS_CHIP_W = 72
const SEATS_CHIP_H = MUTE_ICON
const SEATS_CHIP_RIGHT = MUTE_ICON_RIGHT + MUTE_ICON + MUTE_ICON_GAP
const SEATS_CHIP_TOP = MUTE_ICON_TOP
/** The scores button, directly under the queue button, above the reload column. */
const SCORES_TOP = QUEUE_BOTTOM + 18
const SCORES_BTN_W = 190
const SCORES_BTN_H = 54
const SCORES_BOTTOM = SCORES_TOP + SCORES_BTN_H
const RELOAD_TOP = SCORES_BOTTOM + 24

/** Collapsed way home: small, top-right, never gone. */
function FallChip() {
  return (
    <UiEntity
      uiTransform={{
        width: 210,
        height: 62,
        positionType: 'absolute',
        position: { top: FALL_CHIP_TOP, right: FALL_CHIP_RIGHT },
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'block'
      }}
      uiBackground={{ texture: { src: BUTTON_TEX }, textureMode: 'stretch' }}
      onMouseDown={returnToPunchIsland}
    >
      <Label
        value="⤴ BACK TO ISLAND"
        fontSize={14}
        color={BUTTON_INK}
        textAlign="middle-center"
        uiTransform={{ width: 190, height: 24 }}
        onMouseDown={returnToPunchIsland}
      />
    </UiEntity>
  )
}

function FallPanel() {
  const failed = punchReturnFailed()
  const k = uiScale()
  const cw = Math.round(CLOUD_W * k)
  const ch = Math.round(CLOUD_H * k)
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      <UiEntity
        uiTransform={{
          width: cw,
          height: ch,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          pointerFilter: 'block'
        }}
        uiBackground={{ texture: { src: CLOUD_TEX }, textureMode: 'stretch' }}
      >
        {/* THE CLEAR BODY. Every line is centred in the cloud's white middle
            rather than in the panel box, so nothing runs out over a lobe. */}
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: Math.round(ch * CLOUD_BODY_T), left: 0 },
            width: cw,
            height: Math.round(ch * (CLOUD_BODY_B - CLOUD_BODY_T)),
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            pointerFilter: 'none'
          }}
        >
        <Label
          value="WHOOPS!"
          fontSize={textPx(40)}
          color={CLOUD_INK}
          textAlign="middle-center"
          uiTransform={{ width: cw - 220 * k, height: textPx(48) }}
        />
        <Label
          value="YOU FELL THROUGH THE CLOUDS!"
          fontSize={textPx(18)}
          color={CLOUD_INK}
          textAlign="middle-center"
          uiTransform={{ width: cw - 220 * k, height: textPx(24) }}
        />
        {/* "press E" is a keyboard instruction. On a phone there is no E to
            press, and this panel is the ONLY way back onto the island — so the
            touch reading points at the button sitting right below it. */}
        <Label
          value={
            isCompact()
              ? failed
                ? 'Walk back under the island, then tap FLOAT BACK UP'
                : 'Tap FLOAT BACK UP  ·  or hop the clouds'
              : failed
                ? 'Walk back under the island, then press E'
                : 'Float back up  ·  or press E  ·  or hop the clouds'
          }
          fontSize={textPx(13)}
          color={CLOUD_INK}
          textAlign="middle-center"
          uiTransform={{ width: cw - 200 * k, height: textPx(20), margin: { top: 4 } }}
        />
        <UiEntity
          uiTransform={{
            width: Math.round(BUTTON_W * k),
            height: Math.round(BUTTON_H * k),
            margin: { top: 6 },
            justifyContent: 'center',
            alignItems: 'center',
            pointerFilter: 'block'
          }}
          uiBackground={{ texture: { src: BUTTON_TEX }, textureMode: 'stretch' }}
          onMouseDown={returnToPunchIsland}
        >
          <Label
            value="FLOAT BACK UP"
            fontSize={textPx(19)}
            color={BUTTON_INK}
            textAlign="middle-center"
            uiTransform={{ width: Math.round((BUTTON_W - 120) * k), height: textPx(28) }}
            onMouseDown={returnToPunchIsland}
          />
        </UiEntity>
        </UiEntity>
        {/* MINIMISE, in the cloud's bottom-right puff and nowhere near a line of
            text. It was pinned to the panel's top-right, which on the restored
            art is the middle of `YOU FELL THROUGH THE CLOUDS`. Small on purpose:
            this panel is the only way back onto the island, so collapsing it is
            a deliberate act, not something a thumb does by accident. */}
        <UiEntity
          uiTransform={{
            width: Math.max(38, Math.round(minButtonPx() * 0.62)),
            height: Math.max(26, Math.round(minButtonPx() * 0.42)),
            positionType: 'absolute',
            position: { bottom: Math.round(ch * 0.1), right: Math.round(cw * 0.12) },
            justifyContent: 'center',
            alignItems: 'center',
            pointerFilter: 'block'
          }}
          uiBackground={{ color: Color4.create(0.04, 0.29, 0.42, 0.55) }}
          onMouseDown={minimizePunchFallPanel}
        >
          <Label
            value="MIN"
            fontSize={textPx(11)}
            color={BUTTON_INK}
            textAlign="middle-center"
            uiTransform={{ width: '100%', height: '100%' }}
            onMouseDown={minimizePunchFallPanel}
          />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

/**
 * ‼️THREE LAYERS, ONE SLOT.
 *
 * Persistent state lives under the score and never flies around. Attempt maths
 * exist only while that attempt is resolving. Bonuses, multipliers, saves and
 * exceptional outcomes are short arcade events — one line, then gone.
 *
 * Achievements still reach both devices. They are no longer nine chips that a
 * 720-px phone has to wrap. The phone gets the same events; they occupy this
 * slot instead of a second standing row. There is no compact early-return here
 * — that was how a handset lost the flashes entirely.
 *
 * The slot is a FIXED height so a slam cannot shove the score. Spectacle grows
 * inside the box (type, gold, flash), not by claiming more rail.
 */
const HUD_SLOT_H = { compact: 96, desktop: 120 }

function punchHudInput(state: ReturnType<typeof punchMachineHud>, compact: boolean): PunchHudLayerInput {
  return {
    phase: state.phase,
    compact,
    nowMs: Date.now(),
    revealAgeMs: revealSince(state),
    revealLanded: !!(state.revealLanded || state.cardHeld),
    isMyTurn: state.isMyTurn,
    roundTotal: state.roundTotal,
    scoreCommitted: !!state.scoreCommitted,
    shownScore: state.score || 0,
    lastPunch: state.lastPunch,
    streakBonus: state.streakBonus,
    challengeBonus: state.challengeBonus || 0,
    challengeSpeed: state.challengeSpeed || 1,
    challengeHitMult: state.challengeHitMult || 1,
    attempt: state.attempt,
    attemptsMax: state.attemptsMax,
    attemptsCeiling: state.attemptsCeiling,
    streak: state.streak,
    streakMultiplier: state.streakMultiplier || 1,
    streakSaved: !!state.streakSaved,
    extraPunchAt: state.extraPunchAt,
    nextMultiplier: state.nextMultiplier || 1,
    supportScore: state.supportScore || 0,
    myBoostAward: state.myBoostAward || 0,
    prepFocus: state.prepFocus || 0,
    prepMomentum: !!state.prepMomentum,
    goldenArmed: !!state.goldenArmed,
    goldenPayout: state.goldenPayout || 1,
    focusHighGround: !!state.focusHighGround,
    focusAwardedFocusUsed: state.focusAwardedFocusUsed || 0,
    focusAwardedPower01: state.focusAwardedPower01,
    focusAwardedTiming01: state.focusAwardedTiming01,
    focusAwardedAccuracy01: state.focusAwardedAccuracy01,
    focusAwardedMissedTiming: state.focusAwardedMissedTiming,
    focusAwardedScore: state.focusAwardedScore,
    rescueLastChance: !!state.rescueLastChance,
    helpGoal: state.helpGoal || '',
    mustStepAside: !!state.mustStepAside,
    mustStandOnMark: !!state.mustStandOnMark,
    missedTurn: !!state.missedTurn,
    turnChip:
      state.isMyTurn && !turnCountdownVisible(state) && state.turnMsLeft > 0
        ? `${Math.ceil(state.turnMsLeft / 1000)}s`
        : '',
    activeName: state.activeName || '',
    recordAllTime: !!state.recordAllTime,
    recordTonight: !!state.recordTonight,
    recordPersonal: !!state.recordPersonal,
  }
}

function punchHudSlotHeight(): number {
  return isCompact() ? HUD_SLOT_H.compact : HUD_SLOT_H.desktop
}

function AttemptPips(props: { state: ReturnType<typeof punchMachineHud> }) {
  const { state } = props
  const beat = breathe(state.pulse01)
  const onNow = Math.min(state.attempt, Math.max(0, state.attemptsMax - 1))
  const pips = []
  for (let i = Math.max(0, state.attempt - 1); i < Math.min(state.attemptsMax, state.attempt + 3); i += 1) {
    const earned = i >= 3
    const spent = i < state.attempt
    const current = i === onNow && state.attempt < state.attemptsMax
    const base = earned ? UI.green : UI.gold
    pips.push(
      <UiEntity
        key={`pip-${i}`}
        uiTransform={{
          width: px(current ? 18 : 14),
          height: px(current ? 18 : 14),
          margin: { left: px(4), right: px(4) },
          borderRadius: cornerRadius(UI.radius.pill, px(current ? 18 : 14)),
          borderWidth: px(2),
          borderColor: base
        }}
        uiBackground={{
          color: spent
            ? base
            : current
              ? mix(UI.clear, base, 0.35 + beat * 0.45)
              : UI.clear
        }}
      />
    )
  }
  return (
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', pointerFilter: 'none' }}>
      {pips}
    </UiEntity>
  )
}

function PunchHudStatusRow(props: { state: ReturnType<typeof punchMachineHud>; line: string }) {
  const compact = isCompact()
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        flexWrap: 'nowrap',
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      <AttemptPips state={props.state} />
      <SvChip
        label={props.line}
        color={GOLD}
        fontSize={textPx(compact ? 18 : 22)}
        position={{ margin: { left: px(10) }, pointerFilter: 'none' }}
      />
    </UiEntity>
  )
}

function PunchHudAlert(props: { line: string }) {
  const compact = isCompact()
  return (
    <SvChip
      label={props.line}
      color={PUNCH_UI.ink}
      skin={{ color: UI.gold, radius: UI.radius.pill }}
      fontSize={textPx(compact ? 18 : 22)}
    />
  )
}

function PunchHudSpectacle(props: { line: string; sub?: string; heat: 1 | 2 | 3 | 4; pulse01: number }) {
  const compact = isCompact()
  const beat = breathe(props.pulse01)
  const heat = props.heat
  const base = compact
    ? heat >= 4 ? 36 : heat >= 3 ? 30 : heat >= 2 ? 26 : 22
    : heat >= 4 ? 52 : heat >= 3 ? 42 : heat >= 2 ? 34 : 28
  const flash = heat >= 3 && beat > 0.55
  const color = heat >= 3 ? (flash ? WHITE : GOLD_HOT) : GOLD
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      <ShadowLabel
        value={props.line}
        fontSize={textPx(base + Math.round(beat * (heat >= 3 ? 8 : 4)))}
        color={color}
        height={px(compact ? 48 : 64)}
      />
      {props.sub ? (
        <Label
          value={props.sub}
          fontSize={textPx(compact ? 18 : 24)}
          color={flash ? WHITE : GOLD}
          textAlign="middle-center"
          uiTransform={{ width: '92%', height: px(compact ? 26 : 32), pointerFilter: 'none' }}
        />
      ) : null}
    </UiEntity>
  )
}

function PunchHudEvaluation(props: {
  delta: number
  powerPct: number
  aimPct: number
  timingPct: number
  timingMiss: number
}) {
  const compact = isCompact()
  const signed = `TIMING ${props.timingPct}%`
  const detail = compact
    ? `AIM ${props.aimPct}%`
    : `POWER ${props.powerPct}%   ·   AIM ${props.aimPct}%   ·   ${signed}`
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      <ShadowLabel
        value={`+${props.delta}`}
        fontSize={textPx(compact ? 40 : 56)}
        color={GOLD}
        height={px(compact ? 52 : 68)}
      />
      <Label
        value={detail}
        fontSize={textPx(compact ? 18 : 22)}
        color={WHITE}
        textAlign="middle-center"
        uiTransform={{ width: '92%', height: px(compact ? 26 : 32), pointerFilter: 'none' }}
      />
    </UiEntity>
  )
}

function PunchHudSlot(props: { state: ReturnType<typeof punchMachineHud> }) {
  const compact = isCompact()
  const plan = punchHudPlan(punchHudInput(props.state, compact))
  if (plan.kind === 'alert') return <PunchHudAlert line={plan.alert} />
  if (plan.kind === 'spectacle' && plan.spectacle) {
    return (
      <PunchHudSpectacle
        line={plan.spectacle.line}
        sub={plan.spectacle.sub}
        heat={plan.spectacle.heat}
        pulse01={props.state.pulse01}
      />
    )
  }
  if (plan.kind === 'evaluation' && plan.evaluation) {
    return <PunchHudEvaluation {...plan.evaluation} />
  }
  return <PunchHudStatusRow state={props.state} line={plan.status.line} />
}

/**
 * ‼️THE SHOT CLOCK, WHERE THE PLAYER IS ACTUALLY LOOKING.
 *
 * The report was "you need to see that it's your turn so you don't time out
 * easily", and it was exact: a turn announced itself as a 22 px chip in the top
 * rail, and a player mid-approach — walking to the bag, on a phone, in a crowd —
 * never saw it. Losing a punch to a clock you cannot find is indistinguishable
 * from the game breaking.
 *
 * So inside `PUNCH_TURN_COUNTDOWN_S` the clock stops being chrome and becomes
 * the thing on the screen: one huge number, centre, with YOUR TURN over it, red
 * and larger again inside the urgent band, beating in step with the tick the
 * cabinet is playing.
 *
 * Two rules it must not break:
 *  - `pointerFilter: 'none'` on every part. It sits over the middle of the
 *    screen, which is where the bag is; it may never eat a press.
 *  - MINE ONLY (gated at the call site on `state.isMyTurn`). Every punch HUD
 *    instrument keys off a SHARED phase, and a house NPC taking its turn must
 *    not put a 150 px countdown over a spectator's view.
 */
function turnCountdownVisible(state: ReturnType<typeof punchMachineHud>): boolean {
  return state.turnMsLeft > 0 && state.turnMsLeft <= PUNCH_TURN_COUNTDOWN_S * 1000
}

const COUNTDOWN_RED = PUNCH_UI.danger
/**
 * THE DIAL. The clock stands on its own plate instead of over the world.
 *
 * Owner, 2026-09-08: "it's just a regular number trying to fight the
 * background". It was — three white glyphs and a drop shadow, laid over a lit
 * bag, a bright sky and a crowd, all of which move. A shadow buys separation
 * from a DARK background and nothing at all from a bright one, so the number
 * was legible in some frames of the same second and not others.
 *
 * A disc fixes it for every frame, and it costs no art: SDK7 UI gives us
 * `borderRadius`, and a SQUARE box with a radius of half its side renders a
 * true circle — the same trick the rescue pips already use. Ink fill for the
 * contrast, a signature gold ring for the identity, and the ring is what BEATS
 * (its width swells on the tick) so the digit itself can hold a steady weight.
 */
const DIAL_FILL = punchAlpha(PUNCH_UI.ink, 0.86)
/** The hint's plate. Darker still, because it sits under the brightest thing. */
const DIAL_HINT_FILL = punchAlpha(PUNCH_UI.ink, 0.82)

function TurnCountdown(props: { state: ReturnType<typeof punchMachineHud> }) {
  const state = props.state
  const msLeft = state.turnMsLeft
  const seconds = Math.max(1, Math.ceil(msLeft / 1000))
  const urgent = seconds <= PUNCH_TURN_URGENT_S
  // The beat is read off the CLOCK, not off `state.pulse01`. Pulsing on the
  // machine's own idle breath would drift against the tick the cabinet plays
  // once a second; taken from the remaining milliseconds, the swell lands on
  // the same instant as the sound, every second, for free.
  const intoSecond = 1 - (msLeft % 1000) / 1000
  const beat = intoSecond < 0.32 ? 1 - intoSecond / 0.32 : 0
  const k = uiScale()
  // A phone's canvas is 720 design pixels tall, not 1080 (see `isCompact`), so
  // the desktop 168 is a QUARTER of the screen taken by one digit — over the
  // bag, which is the thing the player is trying to look at. The compact pair
  // holds the same proportion of the screen the desktop pair does.
  const compact = isCompact()
  const left = Math.max(0, (state.attemptsMax || 0) - (state.attempt || 0))
  const lastPunch = left <= 1 && (state.attemptsMax || 0) > 0
  const base = compact ? (urgent ? 116 : 92) : urgent ? 168 : 132
  const restSize = Math.round(base * k)
  const size = Math.round((base + beat * (urgent ? 34 : 18) * (compact ? 0.7 : 1)) * k)
  /**
   * ‼️THE DISC NEVER CHANGES SIZE, INCLUDING AT THE URGENT BOUNDARY.
   *
   * The digit already gears up at `PUNCH_TURN_URGENT_S`, and a plate that
   * jumped with it would read as the HUD glitching rather than as the game
   * getting louder. The plate is the still thing the swelling number is
   * measured against; it is sized once, to hold the LARGER of the two digits.
   */
  const dial = px(compact ? 168 : 250)
  const ring = Math.round(px(compact ? 6 : 8) + beat * px(compact ? 4 : 5))
  const edge = urgent ? COUNTDOWN_RED : GOLD
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: compact ? '19%' : '22%', left: 0 },
        width: '100%',
        height: px(compact ? 250 : 350),
        flexDirection: 'column',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      {/* One chip, not two stacked on the same gold pill. The rail's
          "3 LEFT" sat on YOUR TURN and read as YOUR 3 LEFT (owner, 2026-09-11). */}
      <SvChip
        label={lastPunch ? 'YOUR TURN · LAST PUNCH' : left > 0 ? `YOUR TURN · ${left} LEFT` : 'YOUR TURN'}
        color={PUNCH_UI.ink}
        skin={{ color: GOLD, radius: UI.radius.pill }}
        fontSize={compact ? 18 : 22}
        position={{ margin: { bottom: px(compact ? 8 : 10) }, pointerFilter: 'none' }}
      />
      <UiEntity
        uiTransform={{
          width: dial,
          height: dial,
          borderRadius: cornerRadius(UI.radius.pill, dial),
          borderWidth: ring,
          borderColor: edge,
          justifyContent: 'center',
          alignItems: 'center',
          pointerFilter: 'none'
        }}
        uiBackground={{ color: DIAL_FILL }}
      >
        {/* A FIXED box, not one that grows with the font: the number swells
            inside its own row, so the badge above and the hint below hold
            still instead of jumping a pixel every second. The shadow stays —
            it is now separating the digit from its own plate rather than from
            the sky, which is a job it can actually do. */}
        <ShadowLabel value={String(seconds)} fontSize={size} color={urgent ? COUNTDOWN_RED : WHITE} height={dial} yOffset={compactDigitLift(restSize)} />
      </UiEntity>
      {/* WHAT TO DO, on its own plate for the same reason the number got one. */}
      <SvChip
        label={urgent ? 'PUNCH NOW' : compact ? 'PUNCH BEFORE THE CLOCK' : 'HIT THE BAG BEFORE THE CLOCK'}
        color={urgent ? COUNTDOWN_RED : WHITE}
        skin={{ color: DIAL_HINT_FILL, radius: UI.radius.pill }}
        fontSize={compact ? 17 : 22}
        position={{ margin: { top: px(compact ? 8 : 10) }, pointerFilter: 'none' }}
      />
    </UiEntity>
  )
}

const GREEN = PUNCH_UI.focus
/** A green wash with solid walls marks the target. Window and fill opacity
 * are bounded together so the large value remains legible at their overlap.
 */
const ZONE = punchAlpha(PUNCH_UI.focus, PUNCH_METER_PAINT.window)
const ZONE_HOT = punchAlpha(PUNCH_UI.focus, PUNCH_METER_PAINT.windowHot)
const ZONE_EDGE = Color4.create(0.58, 1, 0.74, 0.95)
/** The outer ring. Amber, and dimmer than the core: worth something, not the aim. */
const ZONE_RING = Color4.create(1, 0.78, 0.29, 0.28)
const RING_HOT_FILL = Color4.create(1, 0.83, 0.4, 0.42)
const RING_EDGE = Color4.create(1, 0.86, 0.5, 0.85)
/** The shared channel accent; the legacy variable name is retained. */
const VIOLET = PUNCH_UI.channel
/** The still point itself — one hairline, because "the middle" is a place. */
const CENTRE_MARK = PUNCH_UI.ivory
/**
 * THE SPILL — the compressed overshoot runway at the far right of the bar.
 *
 * Red, and the only red on the control, because it is the only region that can
 * never be worth anything. It used to be half the widget drawn in the same
 * neutral track colour as the empty left end, so a mashing player watched a bar
 * fill steadily toward what looked like completion while their payout went to
 * zero. The strip says "you have gone past it" in the one colour that needs no
 * legend.
 */
const SPILL = Color4.fromHexString('#FF5A4EFF')
const SPILL_TRACK = Color4.create(0.62, 0.16, 0.13, 0.5)
/**
 * THE WIND, washed over the slot behind the fill. Warm when the bleed is pulling
 * hard and the tempo has to come up, cool when it has gone slack and a steady
 * tempo is about to overshoot. A TINT now rather than a track colour: the slot
 * is authored art, so the weather can only be something laid over it, and it
 * stays faint enough that the fill is still the brightest thing on the control.
 */
const WEATHER_GUST = Color4.create(1, 0.3, 0.2, 1)
const WEATHER_LULL = Color4.create(0.35, 0.72, 1, 1)

/**
 * THE CLOUD METER — one control, bottom centre. Never the left edge: chat lives there.
 *
 * It was a bare capsule assembled from flat rectangles, sitting directly under
 * two fully rendered cartoon plates. One control in the cluster was a wireframe
 * and the other two were the game, and that is exactly how the three read.
 *
 * The shelf is authored art now — a cloud with a lit slot pressed into it, the
 * same hand that drew BOOST and JINX — and THE BOX IS MEASURED OFF THE EXPORT
 * rather than chosen. The fractions below are where the dark interior actually
 * sits in `meter-cloud.png`; re-export the art and they move with it.
 *
 * What stays code-drawn is everything that cannot be baked, and that is most of
 * the instrument: the target widens with the crowd, the still point drifts, the
 * caret tracks a live mean, the runway compresses. Only the two things whose
 * SHAPE never changes — the shelf, and the fill's gloss — are textures.
 */
const METER_TEX_SHELF = 'images/punch/meter-cloud.png'
const METER_TEX_FILL_BOOST = 'images/punch/meter-fill-boost.png'
const METER_TEX_FILL_JINX = 'images/punch/meter-fill-jinx.png'
/**
 * The groove the fill runs in, and it is ART now rather than a flat colour.
 *
 * The slot in the shelf is a transparent hole — the 2026-09-04 pill is a rim,
 * not a panel — so without a track behind it the fill floated over whatever
 * happened to be on screen. This is the dark blue channel from the same pack,
 * drawn first so the spill strip and the fill both run over it.
 */
const METER_TEX_GROOVE = 'images/punch/meter-groove.png'
/** The export is 1080x360. Every fraction below is of THAT, so the art rules the layout. */
const METER_ASPECT = 3
/**
 * The slot's interior, read off the PNG's own pixels — re-measured for the
 * 2026-09-04 art, where the shelf is a plain neon pill and the slot is the
 * transparent hole through it rather than a dark panel inset in a cloud. The
 * hole is found by flooding the transparent border inward and taking what is
 * left enclosed, so these are the art's numbers and not anybody's estimate.
 */
const SLOT_L = 0.0833
const SLOT_R = 0.9167
const SLOT_T = 0.3556
const SLOT_B = 0.6583
/** How far the fill sits inside the slot, so the lit rim survives all the way round. */
const SLOT_INSET = 0.06 * (SLOT_B - SLOT_T)
const FILL_L = SLOT_L + SLOT_INSET / METER_ASPECT
const FILL_R = SLOT_R - SLOT_INSET / METER_ASPECT
const FILL_T = SLOT_T + SLOT_INSET
const FILL_B = SLOT_B - SLOT_INSET
/** The two clear bands of cloud, above the slot and below it, where the type goes. */
// Measured the same way: the shelf's opaque body runs 0.1944..0.8111, so the
// clear band above the slot is 0.194..0.356 and the one below is 0.658..0.811.
// Both are tighter than the old cloud's, and type sized for the old bands
// would have hung off the pill entirely.
const READOUT_MID = 0.275
const READOUT_H01 = 0.13
const VERB_MID = 0.735
const VERB_H01 = 0.12
/**
 * HOW WIDE THE TYPE MAY RUN, and it is not the shelf.
 *
 * The corners of the cloud are where the art keeps its gold, and a readout
 * handed the full width printed `CHANNELING` straight through the left star.
 * These two spans are the gaps between the gold in each band, measured off the
 * export's own pixels — the upper band is pinched by a pair of small sparkles
 * and is barely two fifths of the shelf, the lower one is nearly three
 * quarters. That difference is why the readout is the SHORT line and the verb
 * is the long one, which happens to be the right way round anyway.
 */
const READ_L = 0.29
const READ_R = 0.69
const VERB_L = 0.14
const VERB_R = 0.87

/**
 * INK, NOT WHITE — and this is the one change the art forces on the copy.
 *
 * Every caption here used to be `WHITE` over a near-black track. The track is a
 * white cloud now, so those exact colours are invisible on it. The readout is
 * dark and takes its hue from the state instead: navy while nothing is
 * happening, green when it pays, violet on the hostile side, red once spilled.
 */
const METER_INK = Color4.fromHexString('#1B2A47FF')
const METER_INK_GREEN = Color4.fromHexString('#0C7A44FF')
const METER_INK_VIOLET = Color4.fromHexString('#4A2078FF')
const METER_INK_SPILL = Color4.fromHexString('#B22F24FF')
const METER_INK_MUTED = Color4.fromHexString('#5A6884FF')

/**
 * The shelf is 700 wide when there is room, which puts the SLOT at about 460 —
 * the width the bare capsule used to be. Nothing about reading a position on it
 * changed; the cloud is the part that is new.
 */
const PILL_W = 700
const PILL_MIN_W = 320

/**
 * The shelf's box: hard on the bottom edge, and NARROWED until it clears the glove.
 *
 * Centre and bottom-right are only different places while there is room between
 * them. On a phone there is not: a control centred on a 1600 px design canvas
 * still runs under the punch button once the Explorer's own chrome has taken its
 * share, and a tap near its right end went to whichever of the two the renderer
 * picked. The width is capped by the room actually left over, symmetrically, so
 * the shelf stays centred AND clear — and the HEIGHT follows the width, because
 * the art has one aspect and stretching it would show.
 */
/**
 * ON A DESKTOP THE SHELF LIVES ON THE TOP RAIL, NOT THE THUMB ROW.
 *
 * ‼️Owner, 2026-09-04: "the big progress bar let's move it up all the way to two
 * players are boosting so they're out of the way and we can normally view the
 * rest of the screen". They are right, and the reason is that the shelf and the
 * plate are not the same KIND of thing. The plate is a control you hit on a
 * beat; the shelf is a READOUT you glance at. Sharing a baseline made the pair
 * read as one cluster, which was the old goal — but the cluster then sat across
 * the middle-bottom of the screen, directly over the machine and the player's
 * own avatar, which is the one place a readout must never be.
 *
 * So it goes where the other readouts already are: stacked under
 * `N PLAYERS ARE BOOSTING` on the top rail, printed by `TopRail` as a row of the
 * same column, so the headcount and the level it produced are one block.
 *
 * ‼️COMPACT IS UNCHANGED, and that is not laziness. On a phone this control is
 * TAPPED — the slot keeps the rhythm when a thumb cannot find the plate — and a
 * tap target at the top of a phone screen is not reachable. The lift there also
 * clears the Explorer's own jump cluster, which we do not control. Phones keep
 * the thumb row; desktops get their middle back.
 */
function focusPillOnRail(): boolean {
  return false
}

function focusPillBox(): { w: number; h: number; bottom: number } {
  const frame = hudFrame()
  // ‼️THE HEIGHT IS THE CONTENT'S, NOT A TEXTURE'S. It was `w / METER_ASPECT` —
  // the shelf art's 3:1 — so a 700 px control stood 233 px tall and had to be
  // shoved around the screen to stop it covering the machine. Three drawn rows
  // are about a third of that. See the FocusPill note.
  if (focusPillOnRail()) {
    // Nothing to dodge up here: the rail owns its own column and the glove and
    // the plate are both a screen away.
    const w = Math.max(px(PILL_MIN_W), Math.min(px(PILL_W), Math.round(frame.width * 0.52)))
    return { w, h: px(PILL_H), bottom: 0 }
  }
  const glove = punchGloveVisible() ? gloveBox() : null
  const pads = channelPadsBox()
  // Whichever side reaches furthest in decides both, so the shelf stays centred.
  const claim = Math.max(glove ? glove.right + glove.size : 0, pads.left + pads.w)
  const reserved = (claim + px(12)) * 2
  const room = frame.width - reserved
  const w = Math.max(px(PILL_MIN_W), Math.min(px(PILL_W), room))
  return {
    w,
    h: px(PILL_H),
    // ONE BASELINE WITH THE PLATES on a phone — you press a plate to join and
    // then work this bar, and sharing the thumb row is what makes the pair read
    // as one control rather than two unrelated widgets at two heights. On a
    // desktop the pair has broken up and this reports the floor, because a box
    // that says one thing while the pill draws itself somewhere else is how a
    // surface that dodges it ends up dodging nothing.
    bottom: frame.bottom + focusPillLift(frame.compact)
  }
}

/**
 * ‼️THE SHELF IS DRAWN, NOT SKINNED — and this is a deletion, not a restyle.
 *
 * Owner, 2026-09-04: *"the boost button on the left, I don't know what to say
 * about it, I just don't like the way it looks... and I don't like the boosting
 * progress bar, the way it looks, it's all design at this point, I've had it,
 * and it's mostly causing problems."*
 *
 * The problems were real and they were structural. The control was a painted
 * cloud PNG with a transparent slot cut through it, and every number in the
 * layout was a fraction measured off that export — so the art dictated the type
 * size (the readout band is two fifths of the shelf), the art dictated the
 * height (3:1, which is why a 700 px control was 233 px tall and had to be
 * moved off the middle of the screen), and re-exporting the art silently moved
 * the instrument. Three separate rounds of feedback were spent re-measuring
 * fractions rather than fixing the reading.
 *
 * So the art is gone and the control is geometry:
 *
 *   ONE TRACK      a thin white line. Not a groove, not a cloud, not a bevel.
 *   ONE WINDOW     the paying band, in green — the ONLY colour left on the
 *                  control, because the whole instruction is "follow the green"
 *                  and a colour that means one thing is worth keeping.
 *   ONE FILL       white. Bright while it pays, dim once it has spilled past
 *                  the useful end — brightness carries the state, not hue.
 *   ONE MARK       a hairline at the still point, which is where the payout
 *                  grades toward.
 *
 * Everything else — the shelf, the groove, the gloss, the spill strip, the
 * amber outer ring, the weather wash, the two ring edges and the four band
 * edges — is deleted rather than re-coloured. `meter-cloud.png`,
 * `meter-groove.png` and the two fills are no longer referenced by this file.
 *
 * The height is now the CONTENT's, not a texture's aspect: a line of readout, a
 * bar, a line of verb. That is what takes it off the middle of the screen.
 */
/**
 * ‼️THE TRACK GOT TALLER — owner's reference sketch, 2026-09-07.
 *
 * 14 px is a hairline on a phone, and the green window inside it was three
 * pixels of colour. The whole instruction this control gives is *be in the
 * green*, and a window nobody can see is not an instruction. 22 px is the
 * height at which the band, the gold sliver and the fill all still read at
 * arm's length — and it is still a third of what the old 3:1 painted shelf cost.
 */
const PILL_BAR_H = 22
const PILL_ROW_H = 26
/**
 * The KARMA line — the fourth row, and the only one that is ever absent.
 *
 * It appears only once this player has a bank, because until then it is a
 * promise about a mechanic they have not touched. Once they have one it is the
 * most important line on the pill: it is the answer to *why am I doing this for
 * somebody else's score.*
 */
const PILL_KARMA_ROW_H = 20
const PILL_H = PILL_ROW_H * 2 + PILL_BAR_H + 14
const PILL_H_KARMA = PILL_H + PILL_KARMA_ROW_H

/** The track and the fill. One hue, four weights. */
const TRACK_INK = PUNCH_UI.ink
const FILL_INK = punchAlpha(PUNCH_UI.ivory, 0.8)
const FILL_INK_HOT = PUNCH_UI.ivory
/** Spilled: past the useful end, so the fill dims instead of turning red. */
const FILL_INK_SPILLED = punchAlpha(PUNCH_UI.ivory, 0.4)
/**
 * ‼️THE RING IS THE ONE GOLD THING ON THE PILL, and that is deliberate.
 *
 * Everything else on this control is one hue in four weights (see the note
 * above) precisely so that a single second colour can mean exactly one thing.
 * Gold already means *the top of the board* everywhere else on this machine —
 * the score, the marquee, the timing band — so a gold sliver at the still point
 * says "this is the part that is worth something" without a word of copy.
 */
const RING_INK = punchAlpha(PUNCH_UI.gold, 0.45)
const RING_INK_HOT = PUNCH_UI.goldHot
/**
 * ‼️NO GRADIENT — the one thing the reference sketch asked for that is refused.
 *
 * The sketch paints the track red → orange → yellow → green → orange → red, which
 * is a LEGEND: it says *the ends are bad, the middle is good*. The control
 * already says that, once, with a single green window — and the ramp would cost
 * us the only thing a second colour is spent on here, the gold sliver, which
 * sits invisible on a yellow-to-green blend. Hue stays a two-word vocabulary
 * (green pays, gold pays double) and everything else is white at four weights.
 * See the note above RING_INK.
 */
/** The lamps under the bar: five of them, twenty stored Focus each. */
const PILL_DOTS = 5
const PILL_DOT_ROW_H = 16
/**
 * A lamp that is not lit yet. ‼️At 0.16 it did not read as an empty socket, it
 * read as nothing at all — so a player at zero Focus saw no row, and the lamps
 * only appeared to exist once they were already filling. An empty five has to be
 * visible for a filling five to mean anything.
 */
const DOT_DIM = Color4.create(1, 1, 1, 0.26)
/** The window's walls. A band with edges reads as a PLACE; a wash reads as a tint. */
const ZONE_WALL = ZONE_EDGE

/**
 * THERE IS NO COACH IN THIS HUD, AND THIS NOTE IS THE DECISION.
 *
 * Two characters used to stand here: `FocusCoach`, the card that explained the
 * meter, unmounted since `0f094b96`; and `RescueCoach`, a portrait and a speech
 * cloud that announced the fumble save to spectators for eight seconds. Both are
 * deleted.
 *
 * ‼️THE PANEL ALREADY TEACHES IT, AT THE MOMENT IT CAN BE OBEYED. When a save
 * opens, `RescuePanel` says `SAVE {NAME}!` with the countdown and prints
 * `punchRescueOrder(...)` — "PRESS E ON GOLD" on a cursor, "TAP THE GOLD" on a
 * thumb — at about four times the size the coach spoke at, with "GET READY" as
 * the heads-up while the lane is preparing. The coach was a pre-announcement of
 * that same sentence, aimed at people who were not yet able to act on it, and it
 * cost a corner of the screen and three rounds of layout repair to say it.
 *
 * Owner, 2026-09-09, choosing: cut him.
 *
 * IF A CHARACTER EVER COMES BACK: he is signage, so he owns a CORNER — never the
 * middle, where the player's own avatar stands — his copy is authored as one
 * phrase per line and drawn `textWrap: "nowrap"` (a row that re-wraps inside a
 * one-row box prints over the row beneath it), and the box he sits in is
 * measured off the art rather than typed. All three of those were shipped as
 * bugs first.
 */

/**
 * THE METER — THE FRAME, THE BAR, AND ONE NUMBER. NOTHING ELSE.
 *
 * Owner, 2026-09-07: "you still have that widget at the bottom on a black
 * background. I don't want a background and I don't want all these content
 * pieces — FOCUS PRESS E, FOCUS 100, EASE OFF, FOLLOW, JOIN THE QUEUE TO STORE
 * FOCUS. I just want maybe one number inside, and you need to be able to
 * understand when you're doing good and when you're doing bad."
 *
 * ‼️SO THE PANEL IS GONE. What is left is the owner's own cloud frame with the
 * track laid in its groove and the stored total drawn inside the track. Six
 * labels became one, and the one that survived is the only number a player
 * carries out of the wind-up.
 *
 * ‼️GOOD OR BAD IS SAID IN COLOUR, NOT IN WORDS. The number is GREEN while the
 * coordinator is actually banking, GOLD at a hundred, and a dim white when the
 * bar is paying nothing — which is also the whole of what "JOIN THE QUEUE TO
 * STORE FOCUS" used to say, since outside the queue nothing is ever banked. The
 * green window on the track says where to be; the fill says where you are.
 */
const METER_TEX_FRAME = 'images/punch/meter-cloud.png'
/** meter-cloud.png is 1080×360. */
const METER_FRAME_ASPECT = 3
const METER_MAX_W = 760
const METER_MAX_W_COMPACT = 520
/** The groove inside the frame art, as shares of its box — the track lives here. */
const METER_GROOVE_LEFT = 0.085
const METER_GROOVE_W = 0.83
const METER_GROOVE_TOP = 0.35
const METER_GROOVE_H = 0.3
/** The bare track on a phone, which has no height for a 3:1 frame. */
const METER_BAR_H_COMPACT = 46
/** Air the frame must leave for everything else on a short canvas. */
const METER_RESERVE_H = 260
/**
 * ‼️THE FILL IS TRANSLUCENT SO THE NUMBER SURVIVES IT. The number sits inside
 * the track, and the fill sweeps under it; at the old 0.55 a white fill washed
 * out anything drawn on top.
 */
const METER_FILL = punchAlpha(PUNCH_UI.ivory, PUNCH_METER_PAINT.fill)
const METER_FILL_HOT = punchAlpha(PUNCH_UI.ivory, PUNCH_METER_PAINT.fillHot)
const METER_FILL_SPILLED = punchAlpha(PUNCH_UI.danger, PUNCH_METER_PAINT.spill)

function focusMeterBox(): { w: number; h: number; left: number; bottom: number; art: boolean } {
  const frame = hudFrame()
  if (frame.compact) {
    const w = Math.min(px(METER_MAX_W_COMPACT), frame.width - frame.left - frame.right)
    const h = px(METER_BAR_H_COMPACT)
    return { w, h, left: Math.round((frame.width - w) / 2), bottom: frame.bottom + focusPillLift(true), art: false }
  }
  // Between the plates and the glove, and never so tall that the frame crowds
  // the machine: the art is 3:1, so its height is a third of its width.
  const room = focusPillBox().w
  const byHeight = Math.max(px(PILL_MIN_W), (frame.height - frame.top - frame.bottom - px(METER_RESERVE_H)) * METER_FRAME_ASPECT)
  const w = Math.max(px(PILL_MIN_W), Math.min(px(METER_MAX_W), room, byHeight))
  return { w, h: Math.round(w / METER_FRAME_ASPECT), left: Math.round((frame.width - w) / 2), bottom: frame.bottom + focusPillLift(false), art: true }
}

function FocusPill(props: { state: ReturnType<typeof punchMachineHud> }) {
  const { state } = props
  // THE PUSH has its own panel (or a watch chip). Do not steal this pill for it —
  // that used to draw the veil twice when Focus was also on.
  if (state.rescueLabel && state.rescueSkill !== 'push') return <RescuePanel state={state} />
  const readOnly = state.focusReadOnly
  const box = focusMeterBox()
  // The track: inside the frame's groove on a desktop, the whole box on a phone.
  const trackW = box.art ? Math.round(box.w * METER_GROOVE_W) : box.w
  const trackLeft = box.art ? Math.round(box.w * METER_GROOVE_LEFT) : 0
  const trackTop = box.art ? Math.round(box.h * METER_GROOVE_TOP) : 0
  const barH = box.art ? Math.round(box.h * METER_GROOVE_H) : box.h
  // WHERE A LEVEL IS DRAWN — the playable range is stretched across the first
  // 82% and the overshoot runway is compressed into the tail. See
  // `punchFocusBarX01`; the maths is unchanged, only the drawing is new.
  const at = (level: number) => punchFocusBarX01(level, state.focusZone01)
  const target = state.focusTarget01
  const bandLeft = Math.round(trackW * at(target - state.focusBand01))
  const bandRight = Math.round(trackW * at(target + state.focusBand01))
  const centre = Math.round(trackW * at(target))
  // THE RING, drawn on the same scale as everything else on this track so a
  // player can SEE that it is a fraction of the green rather than a synonym for
  // it. The venue's ring, not the constant: the Game director can narrow or
  // widen it, and the meter must draw the ring the coordinator actually pays.
  const ringLeft = Math.round(trackW * at(target - state.focusKarmaBand01))
  const ringRight = Math.round(trackW * at(target + state.focusKarmaBand01))
  const inRing = !readOnly && state.focusSelfKarma01 > 0
  const mine01 = readOnly ? state.focusQuality01 : state.focusSelfQuality01
  const paying = mine01 >= 0.999
  const level = readOnly ? state.focusCrowd01 : state.focusLevel01
  const fillW = Math.min(trackW, Math.round(trackW * at(level)))
  const spilled = at(level) > PUNCH_FOCUS_BAR_SPILL_AT + 1e-6
  const hair = Math.max(1, Math.round(px(2)))
  /**
   * ‼️IS THIS WORKING? — asked and answered in the colour of the one number.
   * `punchFocusEarned` for a second with this player's own quality and ring
   * depth: the same call, with the same arguments, the coordinator banks with,
   * and gated on the queue exactly as the coordinator gates it.
   */
  const inZone = Math.abs(level - target) <= state.focusZone01
  const earning = !readOnly && state.prepQueued && punchFocusEarned(1000, mine01, state.focusSelfKarma01, inZone) > 0.05
  const full = state.prepFocus >= 99.5
  const total = Math.round(state.prepFocus)
  const numberInk = full ? GOLD : earning ? GREEN : FILL_INK
  const onRail = focusPillOnRail()

  const track = (
    <UiEntity
      uiTransform={{
        positionType: box.art ? 'absolute' : 'relative',
        ...(box.art ? { position: { left: trackLeft, top: trackTop } } : {}),
        width: trackW,
        height: barH,
        // Capsule ends: a level that breathes, not a bar with somewhere to get to.
        borderRadius: cornerRadius(UI.radius.pill, barH),
        pointerFilter: 'none'
      }}
      uiBackground={{ color: TRACK_INK }}
    >
      {/* THE WINDOW, under the fill so the fill reads as reaching INTO it. */}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { left: bandLeft, top: 0 }, width: Math.max(hair * 2, bandRight - bandLeft), height: barH }}
        uiBackground={{ color: paying ? ZONE_HOT : ZONE }}
      />
      {/* THE WALLS. A wash of colour is a tint; a wash with two hard edges is a
          PLACE, and "get inside it" is the only thing this control ever asks. */}
      {[bandLeft, bandRight - hair].map((x, i) => (
        <UiEntity
          key={`zone-wall-${i}`}
          uiTransform={{ positionType: 'absolute', position: { left: Math.max(0, Math.min(trackW - hair, x)), top: 0 }, width: hair, height: barH }}
          uiBackground={{ color: ZONE_WALL }}
        />
      ))}
      {/* THE RING, over the window and under the fill. Lit only while this
          player is actually inside it. */}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { left: ringLeft, top: 0 }, width: Math.max(hair * 2, ringRight - ringLeft), height: barH }}
        uiBackground={{ color: inRing ? RING_INK_HOT : RING_INK }}
      />
      {fillW > 0 ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width: fillW, height: barH, borderRadius: cornerRadius(UI.radius.pill, barH) }}
          uiBackground={{ color: spilled ? METER_FILL_SPILLED : paying ? METER_FILL_HOT : METER_FILL }}
        />
      ) : null}
      {/* The still point. "Get to the middle" is the whole instruction. */}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { left: Math.max(0, centre - Math.round(hair / 2)), top: 0 }, width: hair, height: barH }}
        uiBackground={{ color: CENTRE_MARK }}
      />
      {/* ‼️THE ONE NUMBER, INSIDE THE BAR. Everything else this control used to
          say has gone; what a player is doing here is filling this, and its
          colour is whether the filling is working. */}
      <Label
        value={`${total}`}
        fontSize={textPx(Math.max(16, Math.round(barH * 0.72)))}
        color={numberInk}
        textAlign="middle-center"
        uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width: trackW, height: barH }}
      />
    </UiEntity>
  )

  return (
    <UiEntity
      uiTransform={{
        positionType: onRail ? 'relative' : 'absolute',
        ...(onRail ? {} : { position: { left: box.left, bottom: box.bottom } }),
        width: box.w,
        height: box.h,
        // The meter and its frame are one thumb target, matching the keyboard action.
        pointerFilter: readOnly ? 'none' : 'block'
      }}
      // ‼️NO PANEL. The frame art is the whole of the chrome on a desktop, and a
      // phone gets the bare capsule — "I don't want to have a background".
      uiBackground={box.art ? { texture: { src: METER_TEX_FRAME }, textureMode: 'stretch' } : undefined}
      onMouseDown={readOnly ? undefined : () => punchRescuePress()}
    >
      {track}
    </UiEntity>
  )
}

/** How many contributors the card will name before it starts summarising. */
const BOOST_ROWS_MAX = 5

/**
 * ONE LINE OF THE BREAKDOWN. A caption on the left, a number hard against the
 * right, so every row in the stack lines its digits up whatever the label says.
 */
/**
 * A NUMBER WITH A SHADOW. SDK7 UI text has no outline (only 3D TextShape does),
 * so the arcade weight comes from two labels: the same string in ink, two
 * pixels down and right, under the lit one. Owner, 2026-09-08: "the numbers
 * need to be decorated and beautiful, not just plain text, especially the
 * countdown and the scores."
 */
const SHADOW_INK = punchAlpha(PUNCH_UI.ink, 0.92)
/**
 * ‼️PHONE DIGITS SIT LOW. SDK7 `middle-*` aligns to the font's em box. On a
 * handset that box has empty space above the caps, and digits have no
 * descenders, so the same alignment that looks centred on a monitor reads as
 * sitting on the floor of the plate. Owner, 2026-09-10, twice: the live score
 * in its box, the countdown disc ("touching the bottom outer circle"), and
 * the end scorecard. 0.12 still sat low; the lift was then stripped before it
 * shipped. Taken from font size, not box height — the countdown disc is much
 * taller than its digit, and a height-based lift would overshoot into YOUR TURN.
 */
function compactDigitLift(fontSize: number): number {
  return isCompact() ? -Math.round(fontSize * 0.16) : 0
}
function ShadowLabel(props: {
  value: string
  fontSize: number
  color: Color4
  height: number
  width?: number | `${number}%`
  textAlign?: 'middle-center' | 'middle-left' | 'middle-right'
  margin?: { top?: number; bottom?: number; left?: number; right?: number }
  yOffset?: number
}) {
  const off = Math.max(2, Math.round(props.fontSize * 0.045))
  const align = props.textAlign ?? 'middle-center'
  const lift = props.yOffset ?? compactDigitLift(props.fontSize)
  return (
    <UiEntity uiTransform={{ width: props.width ?? '100%', height: props.height, margin: props.margin, pointerFilter: 'none' }}>
      <Label
        value={props.value}
        fontSize={props.fontSize}
        color={SHADOW_INK}
        textAlign={align}
        textWrap="nowrap"
        uiTransform={{ positionType: 'absolute', position: { top: off + lift, left: off }, width: '100%', height: props.height, pointerFilter: 'none' }}
      />
      <Label
        value={props.value}
        fontSize={props.fontSize}
        color={props.color}
        textAlign={align}
        textWrap="nowrap"
        uiTransform={{ positionType: 'absolute', position: { top: lift, left: 0 }, width: '100%', height: props.height, pointerFilter: 'none' }}
      />
    </UiEntity>
  )
}

/**
 * THE LADDER. Owner, 2026-09-08: "those numbers should flash into the screen
 * one after the other, they should make sounds, they should flip like a
 * casino machine, boom boom boom boom." So the breakdown's rows do not appear
 * together: the first lands when the count lands, and every row after it
 * slams in REVEAL_STAGGER_MS later, sliding in from the left with a white
 * flash, while the runtime plays a tick per row at a rising pitch
 * (`playRevealTicks`) and the FINAL row rings the bell.
 *
 * The clock is the HUD's own: the moment `revealLanded` flips is remembered
 * here, rows count themselves in render order, and they report how many are
 * up through the shared HUD state so the runtime can voice each one once.
 */
const REVEAL_STAGGER_MS = 150
const REVEAL_SLAM_MS = 170
let revealLandedSeen = false
let revealLandedAtMs = 0
let revealRowCursor = 0
let revealRowFrame = -1
function revealSince(state: ReturnType<typeof punchMachineHud>): number {
  const nowMs = Date.now()
  if (state.revealLanded !== revealLandedSeen) {
    revealLandedSeen = state.revealLanded
    if (state.revealLanded) {
      revealLandedAtMs = nowMs
      const hud = punchMachineHud()
      hud.revealRowsShown = 0
      hud.revealRowsTotal = 0
    }
  }
  return state.revealLanded ? nowMs - revealLandedAtMs : -1
}
/** Rows number themselves per frame, in the order they render. */
function nextRevealRowIndex(): number {
  const frame = Math.floor(Date.now() / 8)
  if (frame !== revealRowFrame) { revealRowFrame = frame; revealRowCursor = 0 }
  return revealRowCursor++
}

function RevealRow(props: {
  key?: string
  label: string
  value: string
  color: Color4
  size: number
  dim?: boolean
  /** The FINAL row: shadowed digits and the bell. */
  strong?: boolean
}) {
  const hud = punchMachineHud()
  const index = nextRevealRowIndex()
  const since = revealSince(hud) - index * REVEAL_STAGGER_MS
  hud.revealRowsTotal = Math.max(hud.revealRowsTotal, index + 1)
  const up = since >= 0
  if (up) hud.revealRowsShown = Math.max(hud.revealRowsShown, index + 1)
  // The slam: in from the left, a white flash, settled in REVEAL_SLAM_MS.
  const t = up ? Math.min(1, since / REVEAL_SLAM_MS) : 0
  const slide = Math.round((1 - t) * (1 - t) * 48)
  const flash = up && t < 0.55
  const height = Math.round(props.size * 1.45)
  // See `REVEAL_LABEL_W_COMPACT`: the split is the card's, not the row's.
  const compact = hudFrame().compact
  const labelW = compact ? REVEAL_LABEL_W_COMPACT : REVEAL_LABEL_W
  const valueW = compact ? REVEAL_VALUE_W_COMPACT : REVEAL_VALUE_W
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height,
        display: up ? 'flex' : 'none',
        flexDirection: 'row',
        alignItems: 'center',
        position: { left: -slide },
        pointerFilter: 'none'
      }}
    >
      <Label
        value={props.label}
        fontSize={props.size}
        color={flash ? WHITE : props.dim ? REVEAL_SOFT : props.color}
        textAlign="middle-left"
        uiTransform={{ width: labelW, height: '100%' }}
      />
      {props.strong ? (
        <ShadowLabel value={props.value} fontSize={props.size} color={flash ? WHITE : props.color} height={height} width={valueW} textAlign="middle-right" />
      ) : (
        <Label
          value={props.value}
          fontSize={props.size}
          color={flash ? WHITE : props.color}
          textAlign="middle-right"
          uiTransform={{ width: valueW, height: '100%' }}
        />
      )}
    </UiEntity>
  )
}

/**
 * ‼️THE RESULT CARD — and the reason the crowd is a LIST everywhere upstream.
 *
 * It used to be one number and, under it, `+6% FROM THE CROWD`: a net that
 * named nobody. Somebody who had spent a whole wind-up holding the beat could
 * not tell whether any of that six per cent was theirs, so the most social
 * thing in the game paid out anonymously and nobody could feel they had done
 * it. The owner's requirement is the fix, and it is a sentence a person has to
 * be able to think looking at this card: *I added 48 points to that punch.*
 *
 * So the hierarchy is fixed and is not decoration:
 *
 *   1. BASE PUNCH   what the puncher achieved on their own
 *   2. CROWD BOOST  what the room added, then WHO added what
 *   3. FINAL        the number that goes on the board
 *   4. HIGH GROUND  whether the room broke the ceiling together
 *
 * ‼️Never fold the crowd back into the final number to save a row. The whole
 * mechanic is legible here or it is legible nowhere.
 */
/**
 * ‼️THE BREAKDOWN IS A CARD ON THE SIDE, NOT A SHADOW UNDER THE NUMBER.
 *
 * Owner, 2026-09-04: "the summary with the boost and with what the total
 * calculation was appeared and disappeared too fast and it's too small on black
 * background on top of the machine, you can barely see it".
 *
 * Three separate faults, all fixed here rather than by making it linger:
 *
 *   TOO SMALL     360 px wide at 19 px type, on a canvas where the score above
 *                 it is 120 px. It reads as a footnote to the number when it is
 *                 the only place the crowd mechanic is ever explained.
 *   BLACK ON THE  it was `INK` (#090B10EE) with no edge, laid over the cabinet's
 *   MACHINE       own near-black screen. Two dark rectangles at the centre of
 *                 the frame: the card had nothing to stand against. It gets a
 *                 lit violet edge and moves OFF the cabinet, to the side, where
 *                 the backdrop is the arc wash.
 *   TOO FAST      the number counts for `PUNCH_SCORE_COUNT_MS` of the window it
 *                 shares, so the card was legible only for the tail. It is
 *                 readable from the first frame now because it no longer waits
 *                 for the eye to finish with the number — it is somewhere else
 *                 on screen, being read in parallel.
 *
 * ★COMPACT KEEPS THE STACK. There is no side to move to on a phone, so it stays
 * under the number and only gets the size and the edge.
 */
/**
 * ‼️ONE INK, THREE WEIGHTS. Owner, 2026-09-04: *"I don't like the style of that
 * box, it looks cheap with the green font, the yellow and the white fonts and
 * the border."* Four colours and a lit violet frame were each solving a
 * legibility problem separately — the violet edge was added because the card
 * had nothing to stand against on the cabinet, the green because the crowd rows
 * needed to group, the gold because FINAL had to win. Stacked, they read as a
 * cheap prize screen.
 *
 * Hierarchy comes from WEIGHT and SIZE instead, which is what it should have
 * come from: the total is the brightest and the largest, the crowd sits mid,
 * the contributors sit soft, and the card is separated from the arc behind it
 * by a hairline rather than a lit frame. The big gold score above the card is
 * untouched — that is the machine's own number, not part of this box.
 */
const REVEAL_CARD_W = 560
/**
 * ‼️THE PHONE'S LEDGER IS TALL AND LOUD, NOT WIDE AND SMALL.
 *
 * Owner, 2026-09-09: *"the stats in the black box on the left are too small,
 * you can barely read them… it's relatively wide, occupying almost a fourth of
 * the screen on the left… it should rather be higher with larger fonts, but
 * only on mobile — on desktop it works perfect."*
 *
 * The card was spending the ONE axis a handset has plenty of and starving the
 * one it has none of. A phone reports ~1600 design pixels of width against 720
 * of height (see `isCompact`), so a third of the width is 528 px — an enormous
 * plate — while the type inside it was set at 17 px, two thirds of the desktop
 * card's 26. Narrow the plate, spend the saving on the type, and let the rows
 * stack downward into the height nothing else is using.
 *
 * These three numbers move together and must stay in proportion: the label
 * column is a fixed share of the card, so growing the type without shrinking
 * the box is what wraps a row into the row below it.
 */
const REVEAL_CARD_W_COMPACT = 430
const REVEAL_CARD_FRACTION_COMPACT = 0.27
const REVEAL_SIZE_COMPACT = 23
/**
 * How much of the row the LABEL gets. A phone's card is narrower and its type
 * is bigger, so the value column — which only ever carries `+120`, `-30` or a
 * four-digit total on a phone — gives four points back to the words.
 */
const REVEAL_LABEL_W = '62%'
const REVEAL_VALUE_W = '38%'
const REVEAL_LABEL_W_COMPACT = '66%'
const REVEAL_VALUE_W_COMPACT = '34%'
const REVEAL_CARD_EDGE = punchAlpha(PUNCH_UI.brass, 0.7)
const REVEAL_CARD_INK = PUNCH_UI.panel
const REVEAL_STRONG = PUNCH_UI.ivory
const REVEAL_MID = punchAlpha(PUNCH_UI.ivory, 0.8)
const REVEAL_SOFT = PUNCH_UI.muted
/**
 * The one coloured ink on an otherwise white card, and it is the SAME gold the
 * ring is drawn in on the pill. A player who spent the turn chasing a gold
 * sliver has to be able to find its consequence on this card without reading a
 * word — one colour, two surfaces, one mechanic.
 */
const REVEAL_KARMA = Color4.create(1, 0.86, 0.4, 0.95)

/**
 * A display name cut to what one line of the phone's ledger can hold, with an
 * ellipsis so a clipped name reads as clipped rather than as a different
 * person. Never applied on a desktop, where the card is 560 px wide.
 */
const REVEAL_NAME_MAX_COMPACT = 12
function shortName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length <= REVEAL_NAME_MAX_COMPACT) return trimmed
  return trimmed.slice(0, REVEAL_NAME_MAX_COMPACT - 1) + '…'
}

/**
 * ‼️THE SCORE IS A ROW OF THE RAIL, NOT A THING FLOATING OVER IT.
 *
 * Owner, 2026-09-09: *"that score right now is showing up on top of all of the
 * info flowing in from the top so it becomes extremely noisy and it overlaps -
 * but nothing can overlap with that score, it needs to have its own background,
 * it's its own presence."*
 *
 * It was two absolutely-positioned, full-width, centre-aligned things drawn into
 * the same band and hoping to miss each other: this number at `top: 13%`, and
 * `TopRail` starting at `RAIL_TOP` and flowing DOWN through 62% of the canvas
 * (44% compact). On a 1080 canvas that is a 130 px number laid across nine
 * chips — and because the number is drawn AFTER the rail in the root, it landed
 * on top of them. Noise over noise, with the loudest number in the game the
 * hardest thing on screen to read.
 *
 * TWO FIXES, AND THEY ONLY WORK TOGETHER:
 *
 *   THE PLATE   the number gets exactly what the turn countdown got — ink fill,
 *               gold ring, a size that never changes (see `TurnCountdown`). A
 *               bare digit in front of a lit bag, a bright sky and a moving
 *               crowd is legible in some frames of a second and not others.
 *   THE COLUMN  and that plate is declared as a ROW OF THE RAIL, first and at
 *               `RAIL_MUST`. That is the half that actually ends the overlap: a
 *               flex column cannot draw two of its own rows through each other,
 *               so there is no z-order left to get right and no budget to
 *               hand-tune. Everything else on the rail flows UNDER it, and a
 *               rail too full to afford the score is not a thing that can
 *               happen — `RAIL_MUST` is spent before anything else asks.
 *
 * ‼️THE PLATE ALONE WOULD HAVE BEEN A HALF-FIX, AND A WORSE ONE. An opaque plate
 * laid over the chips destroys the information underneath instead of displacing
 * it — the score becomes readable by making the rail unreadable, which is the
 * same complaint pointing the other way. The row is what makes the plate honest.
 *
 * ‼️IT IS DECLARED FIRST, so the rows below it shift down for the ~2 s of a
 * reveal. That is deliberate: the shift lands on the frame of impact, which is
 * when the eye is being pulled to the number anyway. If it ever reads as a
 * glitch rather than as a reveal, move the `add('score', ...)` call below
 * `add('round', ...)` and the round header becomes the thing that never moves.
 */
const SCORE_PLATE_FILL = punchAlpha(PUNCH_UI.ink, 0.9)

/**
 * DESIGN pixels, and sized ONCE for the widest thing it will ever hold — four
 * digits, which is what a High Ground punch produces. Same law the dial holds
 * to: the plate is the still thing the number is measured against, so a 97 sits
 * in exactly the box a 1043 does and the row under it never learns the
 * difference.
 */
function scorePlateBox(): { w: number; h: number; font: number; digit: number; ring: number } {
  // A phone's canvas is 720 design pixels tall, not 1080 (see `isCompact`), so
  // the desktop plate would be a fifth of the whole screen before the rail has
  // drawn a single chip under it.
  return isCompact()
    ? { w: 264, h: 108, font: 76, digit: 84, ring: 5 }
    : { w: 396, h: 162, font: 120, digit: 130, ring: 7 }
}

/**
 * The record is announced under the plate, not inside it — and only once the
 * count has actually stopped. `revealLanded` is the same gate the arc's verdict
 * word and the ledger card wait on: printing "HIGH GROUND BROKEN" beside a
 * number still crawling up to it spoils the one moment this HUD exists for.
 */
function scorePlateBroken(state: ReturnType<typeof punchMachineHud>): boolean {
  return state.focusHighGround && (state.revealLanded || state.cardHeld)
}

/** The rail row's full height: the plate, plus the one line allowed under it. */
function scorePlateRowHeight(state: ReturnType<typeof punchMachineHud>): number {
  const box = scorePlateBox()
  const caption = Math.max(px(24), Math.round(textPx(isCompact() ? 20 : 26) * 1.73))
  return box.h + (scorePlateBroken(state) ? caption + RAIL_GAP : 0)
}

function ScorePlate(props: { state: ReturnType<typeof punchMachineHud> }) {
  const { state } = props
  const box = scorePlateBox()
  const broken = scorePlateBroken(state)
  const plateScore = punchHudPlan(punchHudInput(state, isCompact())).plateScore
  const shown = plateScore >= 1000 ? String(plateScore) : String(plateScore).padStart(3, '0')
  return (
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center', pointerFilter: 'none' }}>
      <UiEntity
        uiTransform={{
          width: px(box.w),
          height: px(box.h),
          // A stadium, by the same trick the dial draws its circle with: a
          // `pill` radius resolves to half the SHORT side, so a wide box gets
          // round ends and stays in one visual family with the countdown.
          borderRadius: cornerRadius(UI.radius.pill, px(box.h)),
          borderWidth: px(box.ring),
          borderColor: state.focusHighGround ? GOLD_HOT : GOLD,
          justifyContent: 'center',
          alignItems: 'center',
          // ‼️THE 999 PULSE, and it hides the PLATE while the ROW keeps its
          // height — `scorePlateRowHeight` is deliberately not told about the
          // cut. Blink a row's height and every chip under it strobes up and
          // down the screen with it, which is the overlap complaint again in a
          // new costume. The plate vanishes; nothing else moves.
          display: state.perfectCutSince >= 0 && !state.perfectCutLit ? 'none' : 'flex',
          pointerFilter: 'none'
        }}
        uiBackground={{ color: SCORE_PLATE_FILL }}
      >
        {/* Not padded to three digits: a High Ground punch has four, and padding
            a 1043 was about to print it as `1043` beside a `0917`. The shadow
            stays — it now separates the digits from their own plate rather than
            from the sky, which is a job it can actually do. */}
        <ShadowLabel
          value={shown}
          fontSize={px(box.font)}
          color={state.focusHighGround ? GOLD_HOT : GOLD}
          height={px(box.digit)}
        />
      </UiEntity>
      {/* On its own plate for the same reason the number got one — see the
          dial's hint line. */}
      {broken ? (
        <SvChip
          label="HIGH GROUND BROKEN"
          color={GOLD_HOT}
          skin={{ color: DIAL_HINT_FILL, radius: UI.radius.pill }}
          fontSize={textPx(isCompact() ? 20 : 26)}
          position={{ margin: { top: px(RAIL_GAP) }, pointerFilter: 'none' }}
        />
      ) : null}
    </UiEntity>
  )
}

function ScoreReveal(props: { state: ReturnType<typeof punchMachineHud> }) {
  const { state } = props
  const compact = hudFrame().compact
  // ‼️A PHONE HAS 720 DESIGN PIXELS OF HEIGHT, NOT 1080 — see `isCompact`.
  // Thirteen rows at 20 px are 380 px of card under a 130 px number: on a
  // monitor that is a third of the screen, on a handset it IS the screen, which
  // is the "black box in the middle of the screen overlaying everything".
  // ‼️BIGGER TYPE IN A NARROWER CARD — see `REVEAL_SIZE_COMPACT`. The phone
  // used to get the smallest type in the widest box on the screen.
  const size = textPx(compact ? REVEAL_SIZE_COMPACT : 26)
  const boosts = state.focusAwardedBoosts
  // A held card is a landed card by definition: it was copied at the moment
  // the count finished. Without this the rows would blank the instant the
  // round moved on to the next player's `ready`.
  const landed = state.revealLanded || state.cardHeld
  /**
   * ‼️THE CARD ADDRESSES WHOEVER THREW THE PUNCH — and since 2026-09-09 that is
   * not always the reader. The ledger reaches spectators now (see `counting` in
   * the root render), and every possessive on it was written for an audience of
   * one: `YOUR KARMA` and `STANCE COST YOU` printed at somebody watching are a
   * card claiming their stance cost them points they never had on the table.
   *
   * Second person while it is yours, plain nouns while it is not. The puncher is
   * named ONCE, in the card's own heading, rather than repeated down the column
   * — which is the only way a display name fits a phone's narrow card at all.
   */
  const mine = state.isMyTurn
  // ‼️IT USED TO SAY: "a card with no crowd on it is the common case and must
  // stay CLEAN: one big number, exactly as before." That was right while the
  // card was ONLY the crowd's receipt. It is the ledger now — owner, 2026-09-05:
  // *"when we get minus percentages it needs to show in the final calculation
  // where the score went and where it came from"* — and the empty room is
  // exactly where an unexplained number does the most damage, because there is
  // nobody else in it to blame or thank. So the card is drawn on every landed
  // punch and the "clean" case is the SHORT one, not the absent one: three
  // channel readings, the punch, and FINAL.
  //
  // ‼️AND NEVER BEFORE THE COUNTER STOPS. Owner, 2026-09-05: *"it's showing the
  // numbers before they are determined on the screen… we need to keep the
  // suspense and let the numbers run without showing them and spoiling it on the
  // left."* Every field on this card is the FINAL attempt, known at impact, so
  // the card was printing the answer beside a number still crawling up to it.
  // `revealLanded` is the same gate the arc's verdict word waits on — see
  // `punchRevealLanded`. The card is then the pay-off of the count rather than a
  // spoiler running alongside it.
  const boosted = landed && state.focusAwardedBoost > 0 && boosts.length > 0
  /**
   * ‼️THE CARD IS NO LONGER ONLY THE CROWD'S. A punch lifted by the puncher's
   * OWN banked karma has a story to tell even in an empty room — and that is
   * exactly the room where it most needs telling, because a lone player who has
   * been Boosting all night would otherwise watch an unexplained number.
   */
  const karmaUsed = landed && state.focusAwardedKarmaGain > 0
  const widened = landed && state.focusAwardedAssist01 > 0.005 && !compact
  /**
   * ‼️THE PHONE GETS A RECEIPT, THE MONITOR GETS THE LEDGER — AND THE
   * ARITHMETIC IS THE LINE BETWEEN THEM.
   *
   * Thirteen rows is a spreadsheet on a 720 px canvas, and the owner read the
   * result of that as *"the summary in the black box… looks really cheap."* So
   * `terse` drops the four COACHING rows — what a channel cost you, how much
   * the crowd widened the window, what the cap refused, what the bank spent —
   * every one of which the card itself says is NOT subtracted from anything
   * above it.
   *
   * ‼️IT MAY NEVER DROP AN ARITHMETIC ROW. `STANCE COST YOU` and
   * `CEILING TOOK BACK` are real deductions: without them FINAL stops equalling
   * the lines above it, which is the one failure this card exists to end. They
   * are drawn on a phone exactly as they are on a monitor. Trimming the named
   * boosters is safe for the same reason — whoever is trimmed rolls into
   * `+N MORE` WITH THEIR POINTS, so the column still adds up.
   */
  const terse = compact
  const nameRows = terse ? 2 : BOOST_ROWS_MAX
  const named = boosts.slice(0, nameRows)
  const rest = boosts.slice(nameRows)
  const restPoints = rest.reduce((sum, entry) => sum + entry.points, 0)
  const karmaClipped = landed && state.focusAwardedKarmaClipped > 0
  const stanceLost = landed && state.focusAwardedStanceLost > 0
  // Only when a PERSON was capped: the regulars' clamp produced a "-100" on
  // every good punch that nobody could read ("what does cap took mean?").
  const crowdTrimmed = landed && state.focusAwardedCrowdTrimmed > 0 && boosts.some((entry) => !entry.npc) && !compact
  const karmaSpent = landed && state.focusAwardedKarmaSpent > 0 && !compact
  const ledgerMath =
    karmaUsed ||
    boosted ||
    stanceLost ||
    karmaClipped ||
    (landed && (state.focusAwardedFocusUsed || 0) > 0)
  // The left card is arithmetic. BASE 368 / TIMING COST −444 / FINAL 368 is not
  // a calculation — it is the same punch printed twice with a fake minus.
  const ledger = landed && state.focusAwardedScore > 0 && ledgerMath
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: '13%', left: 0 },
        width: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      {/* ‼️THE NUMBER AND THE RECORD LINE ARE NOT DRAWN HERE ANY MORE. Both moved
          into `ScorePlate`, which the rail declares as its FIRST row — see the
          comment there for why a plate on its own would not have fixed this.
          What is left of this wrapper is the ledger card's anchor: the card is
          positioned absolutely off it, out to the side, and never wanted to sit
          under the number in the first place. */}
      {ledger ? (
        <UiEntity
          uiTransform={{
            // ‼️BRASS FRAME, SAME FAMILY AS THE WINNER. Owner, 2026-09-10:
            // the left ledger looked square and borderless beside the gold
            // winner card. One radius, one brass trim.
            positionType: 'absolute' as const,
            position: compact
              ? { left: px(14), top: px(62) }
              : { left: px(36), top: px(96) },
            width: compact
              ? Math.round(Math.min(canvasSize().width * REVEAL_CARD_FRACTION_COMPACT, px(REVEAL_CARD_W_COMPACT)))
              : Math.round(Math.min(canvasSize().width * 0.86, px(REVEAL_CARD_W))),
            flexDirection: 'column',
            alignItems: 'center',
            padding: 0,
            // ‼️THE HOUSE CORNER, NOT A HAND-PICKED ONE. `px(18)` was a literal,
            // and beside a scoreboard drawn at `UI.radius.lg` it read as the
            // square box the owner saw. One token, one family.
            // Same family as the winner / help card: brass trim, house radius.
            borderWidth: Math.max(2, px(3)),
            borderColor: PUNCH_UI.brass,
            borderRadius: cornerRadius(UI.radius.md),
            pointerFilter: 'none'
          }}
          uiBackground={{ color: REVEAL_CARD_INK }}
        >
        <UiEntity
          uiTransform={{
            width: '100%',
            flexDirection: 'column',
            alignItems: 'center',
            // Bigger type needs its own air, or a narrower card reads as cramped
            // rather than as bold.
            padding: compact
              ? { top: px(14), bottom: px(14), left: px(16), right: px(16) }
              : { top: px(16), bottom: px(16), left: px(22), right: px(22) },
            borderRadius: cornerRadius(UI.radius.md),
            pointerFilter: 'none'
          }}
          uiBackground={{ color: REVEAL_CARD_INK }}
        >
          {/* WITH KARMA the punch shows its own two halves — what the swing
              earned, and what the nights of Boosting multiplied it by. Without
              it the card reads exactly as it always did, one line. */}
          <RevealRow
            label={karmaUsed ? 'PUNCH' : 'BASE PUNCH'}
            value={String(karmaUsed ? state.focusAwardedSkill : state.focusAwardedBase)}
            color={REVEAL_MID}
            size={size}
          />
          {/* THE RESCUE. Stored Focus lifted a short punch to the streak line —
              exactly the gap, in gold, so 872 · FOCUS +28 · 900 reads as one sum. */}
          {landed && state.focusAwardedFocusUsed > 0 ? (
            <RevealRow
              label="FOCUS"
              value={`+${state.focusAwardedFocusUsed}`}
              color={REVEAL_KARMA}
              size={size}
            />
          ) : null}
          {karmaUsed ? (
            <RevealRow
              label={`${mine ? 'YOUR KARMA' : 'KARMA'}  x${state.focusAwardedKarmaMult.toFixed(2)}`}
              value={`+${state.focusAwardedKarmaGain}`}
              color={REVEAL_KARMA}
              size={size}
            />
          ) : null}
          {/* ‼️THE CEILING'S BITE. The multiplier was on the card and the points
              it actually delivered were not, so `x1.35` sat beside a punch that
              never received x1.35 and the arithmetic visibly failed. */}
          {karmaClipped ? (
            <RevealRow
              label="  CEILING TOOK BACK"
              value={`-${state.focusAwardedKarmaClipped}`}
              color={REVEAL_SOFT}
              size={Math.round(size * 0.86)}
              dim
            />
          ) : null}
          {/* ‼️THE ONLY REAL DEDUCTION IN THE WHOLE PIPELINE. A poor stance is
              taken off the punch upstream, so without this row FINAL simply did
              not equal the lines above it — the failure this card exists to end. */}
          {stanceLost ? (
            <RevealRow
              label={mine ? '  STANCE COST YOU' : '  STANCE COST'}
              value={`-${state.focusAwardedStanceLost}`}
              color={REVEAL_SOFT}
              size={Math.round(size * 0.86)}
              dim
            />
          ) : null}
          {/* ‼️THE ROOM'S HAND ON THE AIM, NAMED. Without this row the crowd's
              ring silently made the punch easier and the puncher credited
              themselves — which is the opposite of the point. */}
          {widened ? (
            <RevealRow
              label="  CROWD WIDENED THE WINDOW"
              value={`+${Math.round(state.focusAwardedAssist01 * 100)}%`}
              color={REVEAL_KARMA}
              size={Math.round(size * 0.86)}
              dim
            />
          ) : null}
          {boosted ? (
            <RevealRow
              /* ‼️THE ONE ROW THAT SETS THE CARD'S WIDTH, so the phone gets the
                 short form of it. `TOGETHER · HIGH GROUND!` is 23 characters and
                 was single-handedly holding the compact card at a third of the
                 screen: every other label fits inside two thirds of that. The
                 word that matters survives; the celebration is already being
                 shouted in 26 px gold directly above this card. */
              label={
                state.focusHighGround
                  ? compact
                    ? 'HIGH GROUND!'
                    : 'TOGETHER · HIGH GROUND!'
                  : mine ? 'YOUR CREW ADDED' : 'THE CREW ADDED'
              }
              value={`+${state.focusAwardedBoost}`}
              color={REVEAL_STRONG}
              size={size}
            />
          ) : null}
          {/* ‼️WHO, AND HOW MUCH EACH. The public display name only — never a
              wallet address, which is the one identifier this card must not
              teach the room to read. */}
          {named.map((entry) => (
            <RevealRow
              key={entry.userId}
              label={
                // name · circle score · personal multiplier, each only when it says something
                //
                // ‼️AND THE NAME IS CLIPPED ON A PHONE. A DCL display name has no
                // length limit worth trusting, the row is one fixed line tall, and
                // the compact card is narrower now — so an unbounded name wraps
                // into a row that has no second line and disappears behind the one
                // below it. The points are the part that has to survive.
                `  ${compact ? shortName(entry.name) : entry.name}` +
                (entry.multiplier > 1.005 ? `  x${entry.multiplier.toFixed(1)}` : '')
              }
              value={`+${entry.points}`}
              color={REVEAL_SOFT}
              size={Math.round(size * 0.88)}
              dim
            />
          ))}
          {/* A deck of thirty cannot fit and must not scroll past the punch.
              The overflow keeps its POINTS, so the lines still add up to the
              total above them — a card whose arithmetic fails is worse than a
              card that names fewer people. */}
          {rest.length > 0 ? (
            <RevealRow
              label={`  +${rest.length} MORE`}
              value={`+${restPoints}`}
              color={REVEAL_SOFT}
              size={Math.round(size * 0.86)}
              dim
            />
          ) : null}
          {/* ‼️WHAT THE ROOM OFFERED AND THE CAPS REFUSED. Until this line, a
              spectator whose Boost was cut by `PUNCH_BOOST_TOTAL_MAX` or by the
              NPC clamp simply DISAPPEARED from the card — the one surface where
              the crowd mechanic is ever explained telling them they did
              nothing. The names above still add up to CROWD BOOST; this says
              what the room had over and above it. */}
          {crowdTrimmed ? (
            <RevealRow
              label="  OVER THE CROWD CAP"
              value={`${state.focusAwardedCrowdTrimmed} NOT COUNTED`}
              color={REVEAL_SOFT}
              size={Math.round(size * 0.86)}
              dim
            />
          ) : null}
          <RevealRow
            label="FINAL"
            value={String(state.focusAwardedScore || state.score)}
            color={REVEAL_STRONG}
            size={Math.round(size * 1.34)}
            strong
          />
          {/* ‼️BELOW THE LINE, BECAUSE IT IS NOT SCORE. Half the bank is
              consumed by every punch (`PUNCH_KARMA_SPEND_01`) and the card never
              said so, so a player who had banked all night watched the number
              on the pill halve itself with no explanation anywhere in the game.
              It is drawn under FINAL, dim, so nobody reads it as a deduction
              from the punch. */}
          {karmaSpent ? (
            <RevealRow
              label="KARMA BANK SPENT"
              value={`-${state.focusAwardedKarmaSpent}`}
              color={REVEAL_SOFT}
              size={Math.round(size * 0.82)}
              dim
            />
          ) : null}
        </UiEntity>
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

/**
 * THE BOOST PAD — the crowd's ONE control, under the left thumb.
 *
 * ‼️There were two. BOOST lifted the punch and JINX dragged it down, and the
 * pair has been removed in favour of a single positive action: the whole point
 * of the crowd is now that a person who is not punching, not queued and not
 * staying can still help make something extraordinary happen. A second plate
 * that spoils somebody's punch is not that, and it also halved the room — every
 * jinxer was a booster who was not boosting.
 *
 * It started life as a 22 px strip glued under the focus bar, which is the
 * wrong shape twice over — too small to hit under pressure on a phone, and
 * buried inside a readout rather than presented as the thing you DO.
 *
 * They are a mirror of the glove. PUNCH is the right thumb at the bottom-right;
 * these are the left thumb at the bottom-left, at the same height, the same
 * distance in. Nobody has to be told which hand does what.
 *
 * SPECTATORS ONLY, and that is the mechanic, not a tidy-up: you cannot channel
 * for yourself. `focusReadOnly` is the runtime saying "you are the one being
 * meditated for", so the pads vanish the moment the bag is yours and return
 * when your turn ends. On the left edge we sit inside `interactableArea`, which
 * is where the Explorer's own chat and menu rail are NOT — the edge is not ours
 * by default, and this is the one control allowed to borrow it.
 */
/**
 * The plates are authored art, so the BOX is measured off the export rather
 * than chosen — re-export the art and this number moves with it.
 *
 * 512x384: the second pass sits a character (the angel, the imp) ON TOP of the
 * label, so the plate is nearly square where the first pass was a long banner.
 * That makes each one roughly twice as tall for the same width, which is why the
 * widths below came DOWN when the art changed: two plates stacked on a landscape
 * phone were about to own half the screen. One plate could afford to grow again
 * — left deliberately as it is, because the thumb has learned where it lives.
 *
 * ‼️`btn-jinx.png` is still shipped and is no longer drawn. It is kept with the
 * dormant Jinx code, not orphaned by accident.
 */
/**
 * ‼️THE PLATE IS DRAWN NOW — same deletion as the shelf above it.
 *
 * Owner, 2026-09-04: *"the boost button on the left, I don't know what to say
 * about it, I just don't like the way it looks."* `btn-boost.png` is a 512x384
 * painted plate with an angel character standing on the word, which is why the
 * control was nearly square and why it took up the corner it did — the art's
 * aspect was the button's aspect. It also meant the word BOOST could only ever
 * be changed by re-exporting a PNG.
 *
 * A control the thumb hits on a beat needs to be a shape, a word and a key cap.
 * That is all this is: one flat plate, a hairline, and two pieces of type. The
 * PNG is still shipped for the dormant Jinx pair and is no longer drawn.
 */
const PAD_W = 220
const PAD_W_COMPACT = 168
const PAD_MIN_W = 148
const PAD_H_RATIO = 0.42
const PAD_GAP = 10
/** The plate: one ink, a hairline, and the pressed state a shade up. */
const PAD_FACE = PUNCH_UI.panelRaised
const PAD_FACE_HOT = PUNCH_UI.red
const PAD_EDGE = PUNCH_UI.brass

/**
 * HOW FAR OFF THE FLOOR THE PLATE SITS.
 *
 * ‼️Owner, 2026-09-04: "I want the boost button out of the way a little bit, can
 * we move it down to the bottom. At least on desktop it doesn't need to sit that
 * high." It does not: `thumbRowLift` on a desktop is clearing the Dance Bug
 * transport, which docks bottom-RIGHT. Nothing of ours is in the bottom-LEFT
 * corner, so the plate was floating a couple of hundred pixels up the screen for
 * a neighbour that is not on its side.
 *
 * It keeps the frame's own safe margin and no more. Compact is untouched: on a
 * phone that lift is clearing the Explorer's jump cluster, which IS on this side
 * and which we cannot move.
 */
function channelPadsLift(compact: boolean): number {
  return compact ? thumbRowLift(true) : px(HUD_ROW_GAP)
}

/**
 * HOW FAR OFF THE FLOOR THE BOOST PILL SITS.
 *
 * ‼️Owner, 2026-09-06: "position it lower, more to the left, don't overlap it
 * with the chat, but don't let it sit in the middle of the screen -- it can be
 * significantly low." This is the same complaint `channelPadsLift` already
 * answered on 2026-09-04, and for the same reason: `thumbRowLift` clears the
 * Dance Bug transport, which docks bottom-RIGHT. The pill is bottom-LEFT, so it
 * was floating two hundred pixels up the screen dodging a neighbour that is not
 * on its side -- which is exactly what made it read as chrome parked mid-screen.
 *
 * It does have a real neighbour down there, and it is not ours: the Explorer's
 * chat. So this clears `DCL_CHAT_BLOCK` and nothing else. Compact is untouched,
 * where the lift is dodging the jump cluster we cannot move.
 */
/**
 * ‼️2026-09-06, SAME DAY, ONE MORE STEP DOWN. Clearing `DCL_CHAT_BLOCK` still
 * left the control 150 design px up the screen, and the owner's reading of
 * that was "badly located on desktop, too high, it needs to move lower to the
 * edge of the screen, out of the way". So on a desktop it sits on the same
 * floor margin the Boost plate uses. The Explorer's chat input does dock in
 * that corner; the pill is a readout that steps aside for nothing, and the
 * owner asked for the edge in so many words.
 */
function focusPillLift(compact: boolean): number {
  return compact ? thumbRowLift(true) : px(HUD_ROW_GAP)
}

function channelPadsBox(): { w: number; left: number; bottom: number; h: number } {
  const frame = hudFrame()
  const w = Math.max(PAD_MIN_W, px(frame.compact ? PAD_W_COMPACT : PAD_W))
  return {
    w,
    h: Math.round(w * PAD_H_RATIO),
    left: frame.left,
    bottom: frame.bottom + channelPadsLift(frame.compact)
  }
}

/**
 * One plate: a face, a hairline edge, the word, and the key that does the same
 * thing. Out of RANGE is the one state it still has to show, and it shows it by
 * going flat — which is what replaced `STEP CLOSER TO FOCUS`, a sentence in the
 * middle of the screen saying what a greyed control says by being greyed.
 */
function ChannelPad(props: {
  label: string
  cap: string
  onPress: () => void
  w: number
  h: number
  /** Out of range: drawn, unpressable, and visibly not available yet. */
  reachable?: boolean
}) {
  const reachable = props.reachable !== false
  const capH = Math.round(props.h * 0.34)
  return (
    <UiEntity
      uiTransform={{
        width: props.w,
        height: props.h,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        opacity: reachable ? 1 : 0.3,
        borderWidth: Math.max(1, Math.round(px(2))),
        borderColor: PAD_EDGE,
        borderRadius: Math.round(props.h * 0.22),
        pointerFilter: reachable ? 'block' : 'none'
      }}
      uiBackground={{ color: reachable ? PAD_FACE_HOT : PAD_FACE }}
      onMouseDown={reachable ? props.onPress : undefined}
    >
      <Label
        value={props.label}
        fontSize={textPx(22)}
        color={WHITE}
        textAlign="middle-center"
        uiTransform={{ width: props.w, height: Math.round(props.h * 0.46) }}
      />
      <Label
        value={props.cap}
        fontSize={textPx(13)}
        color={MUTED}
        textAlign="middle-center"
        uiTransform={{ width: props.w, height: capH }}
      />
    </UiEntity>
  )
}

function ChannelPads(props: { state: ReturnType<typeof punchMachineHud> }) {
  const { state } = props
  // The bag is YOURS: you do not get to boost your own punch, so the pads are
  // not drawn at all. Out of RANGE is different — the pads stay on screen,
  // dimmed, because they are the only thing that teaches the mechanic exists.
  if (state.focusReadOnly) return null
  if (!state.focusVisible && !state.focusOutOfRange) return null
  const reachable = state.focusVisible
  const box = channelPadsBox()
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: box.left, bottom: box.bottom },
        width: box.w,
        flexDirection: 'column',
        alignItems: 'flex-start',
        pointerFilter: 'none'
      }}
    >
      {/* ONE PLATE, ALWAYS LIT. There is no other side to be on, so the pad
          never dims to say "you picked the other one" — only to say "you are
          too far away", which is the one thing left for it to say. */}
      <ChannelPad
        label="BOOST"
        cap={isCompact() ? 'TAP TO HOLD THE BEAT' : 'PRESS E'}
        onPress={() => punchRescuePress()}
        w={box.w}
        h={box.h}
        reachable={reachable}
      />
    </UiEntity>
  )
}

/**
 * THE FOCUS CHIP — what replaced the roster, and why there is no list any more.
 *
 * The roster named every participant and printed `DISRUPTING -3%` beside the
 * hostile ones. It was built to recruit ("naming the circle is what turns it
 * from a private meter into a thing you can watch other people doing"), and the
 * recruiting worked — but it also published, live, exactly who was sabotaging
 * whom, which is the one thing the turn now has to keep secret.
 *
 * So it becomes a single neutral line. It still says the room is busy, which is
 * the half that recruits; it no longer says who or which way, which is the half
 * that spoiled the suspense. It also stops being a six-row list stacked on the
 * punch button — see the top rail, where it now lives with the other status.
 */
function focusChipLabel(state: ReturnType<typeof punchMachineHud>): string {
  // The person holding the bag is not waiting. "While I am hitting it's telling
  // me I can charge by pressing E" (owner, 2026-09-07) — the recruiting line
  // is for the deck, never for the puncher.
  if (state.isMyTurn) return ''
  const humans = state.focusCircle.filter(entry => !entry.npc)
  const count = humans.length
  // The sole participant is named only when there IS exactly one, which cannot
  // disclose a side: with one channeller the room learns a name, never a choice.
  // ‼️AN EMPTY ROOM MUST NAME THE BUTTON, NOT THE BOTS. This line used to read
  // "NPC CROWD IS CHEERING · JOIN IN", which told the reader what some avatars
  // were doing and nothing about what they themselves could do -- owner,
  // 2026-09-06: "what is this?". Join in HOW, and to what end? The state it is
  // describing is "no human has boosted this punch yet", and the only useful
  // thing to say in it is which key adds you to the punch that is in the air.
  if (count) return focusingLine(count, count === 1 ? humans[0]?.name : undefined)
  if (!state.focusCircle.length) return ''
  // The regulars ARE boosting, visibly, so "nobody" over two channelling
  // bodies read as a lie (owner, 2026-09-06). Name them; the ask stays.
  // ‼️SAY IT THE WAY A PERSON WOULD. "STORE FOCUS" is jargon for a thing the
  // player has not met yet -- owner, 2026-09-07: "what is 'store focus', do you
  // speak English." The line has one job: tell someone waiting that pressing the
  // key now makes their turn better.
  return isCompact() ? 'TAP FOCUS TO CHARGE UP' : 'WAITING? PRESS E TO CHARGE UP FOR YOUR TURN'
}

/**
 * THE TOP RAIL — one column, four slots, measured once.
 *
 * The right edge has had a derived rail for a while (QUEUE_TOP → SCORES_TOP →
 * RELOAD_TOP, each starting where the one above ends). The CENTRE never did.
 * Its pieces were anchored independently and by eye — the round pips at
 * `top: 22`, the active player's name at `top: 84`, "STEP ASIDE" at `70%`,
 * "YOU MISSED YOUR TURN" also at `70%`, the charge hint at `62%` — so which of
 * them a player saw, and whether two of them printed through each other,
 * depended on which happened to be true at that moment. That is the "elements
 * appear wherever there happens to be space" the feedback names.
 *
 * One flex column now owns the centre-top, and every row is a slot in a fixed
 * order. Rows collapse when empty, so the rail is short when little is
 * happening, but a row can never take another row's place: what is on screen
 * moves up and down by whole rows, never sideways into something else.
 *
 * ROW ORDER IS BY LIFESPAN, longest-lived first, so the things that persist
 * hold still and the transient ones append below rather than shoving the rest:
 *
 *   1  the round — pips, total, shot clock          (yours, whole round)
 *   2  who is up                                    (whole turn)
 *   3  the room — how many are focusing             (whole turn)
 *   4  one transient status                         (seconds)
 *
 * It starts BELOW the queue button's corner rather than level with it, so the
 * rail and the right edge cannot collide on a narrow canvas.
 */
const RAIL_TOP = 22
const RAIL_GAP = 6

function TopRailRow(props: { key?: string; children?: ReactEcs.JSX.ReactNode; height: number }) {
  // The floor is a MINIMUM TOUCHABLE ROW on a desktop and a minimum LEGIBLE row
  // on a phone — nothing here is pressed, and 38 px of the 720 a handset has is
  // over five per cent of the screen spent on one chip's padding.
  const floor = isCompact() ? 26 : 38
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: px(Math.max(floor, props.height)),
        margin: { bottom: px(RAIL_GAP) },
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      {props.children}
    </UiEntity>
  )
}

/**
 * THE RING — the save as a loop, not a reflex.
 *
 * Owner, 2026-09-07, on the sweeping line: "I don't know what it is and I have
 * no idea how to play it… this needs to be a little game loop." And, choosing
 * from four options: the ball in the ring. Every spectator off the queue plays
 * their own ring at once; the first to hold the ball inside for three seconds
 * saves the streak.
 *
 * WHAT IS DRAWN: the rim (red for a beat when the ball gets out), the calm
 * circle in the middle (a shove inside it is wasted, which is what makes
 * hammering lose), a wind mark on the rim showing where the ball is being
 * blown, the ball itself (gold once the hold is nearly in), the hold bar under
 * the ring, and three shove pips — the budget. Physics in punch-challenge.
 */
const RESCUE_RING_PX = 200
const RESCUE_RING_PX_COMPACT = 136
const RESCUE_BALL_PX = 18
const RESCUE_RIM = Color4.create(1, 1, 1, 0.3)
const RESCUE_RIM_OUT = Color4.create(1, 0.3, 0.25, 0.95)
const RESCUE_DISC = PUNCH_UI.ink
const RESCUE_CALM = Color4.create(0.23, 0.88, 0.48, 0.18)
const RESCUE_PIP_DIM = Color4.create(1, 1, 1, 0.22)

/**
 * ‼️THE SAVE, DRAWN AS THE GAME IT IS. One lane, one gold zone, one runner.
 *
 * Owner, 2026-09-08: *"a weird circle and three dots and you don't know what to
 * do"*, and then of what replaced it: *"it's visually unattractive and it's way
 * too easy."* Both faults had the same cause — the panel drew a PROGRESS BAR,
 * and a progress bar can only say how full it is. It cannot say when to press,
 * so the only strategy it can ever teach is "press more".
 *
 * A lane can. The marker runs, the gold zone stands still, and the whole rule is
 * legible in one glance without a word of instruction: hit it while it is there.
 * The pips underneath are the score, and they go DOWN on a miss, which is the
 * one thing the old meter could never show and the exact thing a hammering
 * player needs to see.
 *
 * The lane is the same shape as the punch machine's own timing track on purpose:
 * the room already knows how to read it.
 */

/**
 * THE PUSH -- their score, and the room dragging it over the line.
 *
 * Owner, 2026-09-09: *"The big issue in this game is that when your score is not
 * enough the game stops... we want to take that last score that is about to make
 * you fail and we want to push it up above the threshold of 900."*
 *
 * WHY THIS PANEL IS NOT LIKE THE FOUR BEFORE IT: every one of those drew a
 * widget -- a meter, a circle with three dots, a lane with a gold block -- and
 * had to teach a brand-new rule inside a four-second window. This one draws THE
 * SCORE, a number the room has been reading all night, climbing towards a line
 * they already understand. There is nothing to teach.
 *
 * Three parts, in reading order:
 *  1. THE ASK. Three seconds of blanked screen and one question, because the
 *     people this is for do not know they are in the game. A press is the yes.
 *  2. THE COLUMN. Her score, the latches she has banked, the line at the top.
 *  3. THE METER. The focus widget the room already plays, unchanged: a pulse
 *     fired from inside the green is worth full, and the green drifts.
 *
 * NOTE: ON A WIN THE VEIL TEARS OFF. This is the bug the owner reported as *"the
 * celebration is very minimal, he just does an emote and then that's it"* -- the
 * runtime has always fired champion audio, particles, a 999-crowd roar and a
 * cloud quake on a save, and the full-screen rescue veil sat on top of all of
 * it. The fireworks were playing behind the curtain. A won push draws a banner
 * and nothing else, so the room can see what it just did.
 */
/**
 * Who is pushing and what each of them has added. Drawn LIVE during the window
 * and again in the reconciliation, because the owner's complaint was one
 * complaint in two halves: he could not see his own effect, and nobody outside
 * could see that he was playing for her at all.
 *
 * Own row is gold and says YOU; everyone else is cyan. Sorted by the
 * coordinator (biggest first), so the order is the same on every screen.
 */
function PushHelperChips(props: {
  state: ReturnType<typeof punchMachineHud>
  compact: boolean
  left: number
  bottom: number
  width: number
}) {
  const rows = (props.state.rescuePushers ?? []).filter((row) => row.mine || row.gain >= 0)
  const { chips, more } = punchHelpChipSet(rows, 3)
  if (chips.length === 0) return null
  const h = px(props.compact ? 28 : 32)
  const chipW = Math.max(px(props.compact ? 92 : 110), Math.round(props.width / Math.min(4, chips.length + (more > 0 ? 1 : 0))))
  return (
    <UiEntity uiTransform={{
      positionType: 'absolute',
      position: { left: props.left, bottom: props.bottom },
      width: props.width,
      height: h,
      flexDirection: 'row',
      justifyContent: 'flex-start',
      alignItems: 'center',
      pointerFilter: 'none'
    }}>
      {chips.map((chip, index) => (
        <UiEntity key={`help-chip-${index}`} uiTransform={{
          width: chipW,
          height: h,
          margin: { right: px(6) },
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: cornerRadius(UI.radius.pill, h),
          pointerFilter: 'none'
        }} uiBackground={{ color: punchAlpha(chip.mine ? GOLD : PUNCH_UI.ink, chip.mine ? 0.22 : 0.72) }}>
          <Label
            value={`${chip.label} +${chip.gain}`}
            fontSize={textPx(props.compact ? 13 : 15)}
            color={chip.mine ? GOLD_HOT : CYAN}
            textAlign="middle-center"
            uiTransform={{ width: '100%', height: h, pointerFilter: 'none' }}
          />
        </UiEntity>
      ))}
      {more > 0 ? (
        <Label
          value={`+${more} MORE`}
          fontSize={textPx(props.compact ? 13 : 15)}
          color={MUTED}
          textAlign="middle-left"
          uiTransform={{ width: px(90), height: h, pointerFilter: 'none' }}
        />
      ) : null}
    </UiEntity>
  )
}

const PUSH_COL_W = 72
const PUSH_COL_W_COMPACT = 56
const PUSH_MET_H = 30
const PUSH_MET_H_COMPACT = 20
/** Phone: keep the timing bar off the HELP disc. */
const PUSH_PHONE_BAR_ABOVE = 28
const PUSH_PHONE_COL_INSET = 18
const PUSH_GREEN = Color4.fromHexString('#58DB91FF')
const PUSH_GREEN_SOFT = Color4.create(0.345, 0.859, 0.569, 0.30)
const PUSH_AMBER = Color4.create(1, 0.82, 0.35, 0.16)
const PUSH_COL_SEGS = 28
const PUSH_COL_CYAN = Color4.fromHexString('#3EC8E8FF')
const PUSH_COL_GOLD = Color4.fromHexString('#F2C14EFF')
const PUSH_COL_ORANGE = Color4.fromHexString('#FF8A3DFF')
const PUSH_COL_HOT = Color4.fromHexString('#FF4D3DFF')

/**
 * Colour of a column band by HEIGHT, not by fill. A short climb stays cool;
 * the top of the meter is always hot, whether or not the room has reached it.
 * SDK7 has no CSS gradient, so the walk is stacked segments.
 */
function pushColumnColor(t01: number): Color4 {
  const t = Math.max(0, Math.min(1, t01))
  if (t < 0.28) return mix(PUSH_COL_CYAN, PUSH_GREEN, t / 0.28)
  if (t < 0.52) return mix(PUSH_GREEN, PUSH_COL_GOLD, (t - 0.28) / 0.24)
  if (t < 0.78) return mix(PUSH_COL_GOLD, PUSH_COL_ORANGE, (t - 0.52) / 0.26)
  return mix(PUSH_COL_ORANGE, PUSH_COL_HOT, (t - 0.78) / 0.22)
}

function pushNeededColumnBox(compact: boolean, frame: ReturnType<typeof hudFrame>) {
  const colW = px(compact ? PUSH_COL_W_COMPACT : PUSH_COL_W)
  // ‼️LOWER-LEFT ON EVERY SCREEN. Never 50% — that is the emote. Never 18%
  // from the top — that is the puncher's head. Compact used to follow the
  // HELP disc; desktop used `frame.height * 0.18`. Both read as a neon slab
  // on the body. Owner, 2026-09-11: still above the head, so the compact-only
  // move never ran (or a handset took the desktop branch). The empty gap is
  // between the avatar and the bottom-left control. `frame.left/bottom`
  // already clear Explorer chrome; a 118 px disc-lift on top of that walked
  // the column back up onto the torso.
  const colH = Math.round(frame.height * (compact ? 0.26 : 0.28))
  const aboveFloor = frame.bottom + px(compact ? 48 : 20)
  return {
    colW,
    colH,
    left: frame.left + px(compact ? PUSH_PHONE_COL_INSET : 20),
    top: Math.max(px(16), frame.height - aboveFloor - colH)
  }
}

function pushTouchBarBox(compact: boolean, frame: ReturnType<typeof hudFrame>) {
  const glove = gloveBox()
  const barH = px(compact ? PUSH_MET_H_COMPACT + 20 : PUSH_MET_H + 6)
  if (compact) {
    const col = pushNeededColumnBox(true, frame)
    const left = col.left + col.colW + px(16)
    const width = Math.max(px(280), frame.width - left - glove.right - glove.size - px(12))
    return {
      width,
      height: barH,
      left,
      // Above the disc, not through it. Same idea as the reload meter: the
      // instrument that explains the button sits on top of that button's box,
      // never inside it.
      bottom: glove.bottom + glove.size + px(PUSH_PHONE_BAR_ABOVE)
    }
  }
  const width = Math.min(px(700), frame.width - frame.left - frame.right - px(80))
  return {
    width,
    height: barH,
    left: Math.round((frame.width - width) / 2),
    bottom: frame.bottom + px(18)
  }
}

function PushNeededColumn(props: {
  state: ReturnType<typeof punchMachineHud>
  compact: boolean
  climbed: number
  needed: number
  raised: number
  extra: number
}) {
  const frame = hudFrame()
  const box = pushNeededColumnBox(props.compact, frame)
  const helping = (props.state.rescuePushers ?? []).length
  const heat = Math.min(1, helping / 4)
  const topped = props.needed > 0 && (props.extra > 0 || props.raised >= props.needed)
  const fill = Math.max(0, Math.min(1, props.climbed))
  const segH = Math.max(2, Math.floor(box.colH / PUSH_COL_SEGS))
  const bands = []
  for (let i = 0; i < PUSH_COL_SEGS; i += 1) {
    const t = i / (PUSH_COL_SEGS - 1)
    const lit = fill >= (i + 0.5) / PUSH_COL_SEGS
    const cap = topped && t > 0.82
    bands.push(
      <UiEntity
        key={`push-col-${i}`}
        uiTransform={{
          positionType: 'absolute',
          position: { left: 0, bottom: i * segH },
          width: '100%',
          height: segH,
          pointerFilter: 'none'
        }}
        uiBackground={{
          color: lit
            ? punchAlpha(cap ? GOLD_HOT : pushColumnColor(t), topped ? 0.86 : 0.70)
            : punchAlpha(PUNCH_UI.ink, 0.18)
        }}
      />
    )
  }
  // Figures sit to the RIGHT of a left-side meter — never on the avatar, never
  // on HELP. Compact used to stack them on the column because the column was
  // parked on the puncher's head.
  const labelLeft = box.left + box.colW + px(10)
  const labelW = px(props.compact ? 150 : 170)
  return (
    <UiEntity uiTransform={{
      positionType: 'absolute',
      position: { left: 0, top: 0 },
      width: frame.width,
      height: frame.height,
      pointerFilter: 'none'
    }}>
      <UiEntity uiTransform={{
        positionType: 'absolute',
        position: { left: box.left, top: box.top },
        width: box.colW,
        height: box.colH,
        borderRadius: px(8),
        borderWidth: px(topped ? 3 : 2),
        borderColor: punchAlpha(topped ? GOLD_HOT : WHITE, topped ? 0.72 : 0.22 + heat * 0.28),
        pointerFilter: 'none'
      }} uiBackground={{ color: punchAlpha(PUNCH_UI.ink, 0.48) }}>
        {bands}
      </UiEntity>
      <Label
        value={topped && props.extra > 0 ? `+${props.extra}` : `${props.raised} / ${props.needed}`}
        fontSize={textPx(props.compact ? 18 : 26)}
        color={GOLD_HOT}
        textAlign="middle-left"
        uiTransform={{
          positionType: 'absolute',
          position: { left: labelLeft, top: box.top + Math.round(box.colH * (1 - fill)) - px(props.compact ? 14 : 20) },
          width: labelW,
          height: px(props.compact ? 28 : 36),
          pointerFilter: 'none'
        }}
      />
      <Label
        value={topped ? PUNCH_PUSH_EXTRA_SHOUT : `${props.needed} NEEDED`}
        fontSize={textPx(props.compact ? 13 : 16)}
        color={topped ? GOLD_HOT : GOLD}
        textAlign="middle-left"
        uiTransform={{
          positionType: 'absolute',
          position: { left: labelLeft, top: box.top - px(28) },
          width: labelW,
          height: px(props.compact ? 20 : 26),
          pointerFilter: 'none'
        }}
      />
      {helping > 0 ? (
        <Label
          value={`${helping} HELPING`}
          fontSize={textPx(props.compact ? 13 : 16)}
          color={CYAN}
          textAlign="middle-left"
          uiTransform={{
            positionType: 'absolute',
            position: { left: labelLeft, top: box.top + box.colH + px(6) },
            width: labelW,
            height: px(props.compact ? 20 : 26),
            pointerFilter: 'none'
          }}
        />
      ) : null}
    </UiEntity>
  )
}

function PushFocusBar(props: {
  state: ReturnType<typeof punchMachineHud>
  compact: boolean
  hot: boolean
  dead: boolean
  playable: boolean
}) {
  const frame = hudFrame()
  const box = pushTouchBarBox(props.compact, frame)
  const zoneHalf = (props.state.rescuePushBandHalf01 ?? 0.075) + PUNCH_FOCUS_ZONE_MARGIN_01
  const barX = (v: number) => Math.max(0, Math.min(1, punchFocusBarX01(Math.max(0, v), zoneHalf)))
  const target = props.state.rescuePushTarget01 ?? PUNCH_FOCUS_TARGET_01
  const band = props.state.rescuePushBandHalf01 ?? 0.075
  const gx0 = barX(target - band), gx1 = barX(target + band)
  const yx0 = barX(target - zoneHalf), yx1 = barX(target + zoneHalf)
  const lx = barX(props.state.rescuePushLevel01 ?? 0)
  return (
    <UiEntity uiTransform={{
      positionType: 'absolute',
      position: { left: box.left, bottom: box.bottom },
      width: box.width,
      height: box.height,
      borderRadius: px(props.compact ? 12 : 15),
      borderWidth: px(2),
      borderColor: punchAlpha(WHITE, 0.34),
      pointerFilter: props.playable ? 'block' : 'none'
    }} uiBackground={{ color: punchAlpha(PUNCH_UI.ink, 0.82) }}
      onMouseDown={props.playable ? () => punchRescuePress() : undefined}
    >
      <UiEntity uiTransform={{ positionType: 'absolute', position: { left: `${Math.round(yx0 * 100)}%`, top: 0 },
        width: `${Math.round((yx1 - yx0) * 100)}%`, height: '100%', pointerFilter: 'none' }}
        uiBackground={{ color: PUSH_AMBER }} />
      <UiEntity uiTransform={{ positionType: 'absolute', position: { left: `${Math.round(gx0 * 100)}%`, top: 0 },
        width: `${Math.round((gx1 - gx0) * 100)}%`, height: '100%', pointerFilter: 'none' }}
        uiBackground={{ color: props.hot ? PUSH_GREEN : PUSH_GREEN_SOFT }} />
      <UiEntity uiTransform={{ positionType: 'absolute', position: { left: `${Math.round(lx * 100)}%`, top: '-16%' },
        width: px(props.compact ? 6 : 9), height: '132%', pointerFilter: 'none' }}
        uiBackground={{ color: props.hot ? GOLD_HOT : props.dead ? punchAlpha(WHITE, 0.35) : WHITE }} />
    </UiEntity>
  )
}

function PushPanel(props: { state: ReturnType<typeof punchMachineHud> }) {
  const state = props.state, frame = hudFrame()
  const compact = frame.compact
  const done = !!state.rescuePushDone
  const saved = !!state.rescuePushSaved
  const asking = !!state.rescuePushAsking
  const joined = !!state.rescuePushJoined
  const from = state.rescuePushFrom ?? 0
  const to = state.rescuePushTo ?? 900
  const score = Math.max(from, state.rescuePushScore ?? from)
  const gap = punchHelpGap(from, to, score)
  const climbed = gap.needed > 0 ? gap.raised / gap.needed : 0
  const topped = gap.needed > 0 && gap.now >= gap.goal
  const fumbler = (state.rescueRescuedName || 'THE PUNCHER').toUpperCase()

  if (done) {
    const keptName = fumbler
    const copy = punchHelpResultCopy({ saved, score, from, to, keptName, spectator: !joined })
    const w = px(compact ? 300 : 380)
    const h = px(compact ? 148 : 176)
    return (
      <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width: frame.width, height: frame.height,
        flexDirection: 'column', justifyContent: 'center', alignItems: 'center', pointerFilter: 'none' }}>
        <UiEntity uiTransform={{
          width: w,
          height: h,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          borderWidth: px(2),
          borderColor: saved ? GOLD : PUNCH_UI.brass,
          borderRadius: cornerRadius(UI.radius.md),
          pointerFilter: 'none'
        }} uiBackground={{ color: punchAlpha(PUNCH_UI.ink, 0.96) }}>
          <Label value={copy.badge} fontSize={textPx(compact ? 16 : 20)} color={saved ? GOLD : WHITE}
            textAlign="middle-center"
            uiTransform={{ width: '92%', height: px(compact ? 24 : 30), pointerFilter: 'none' }} />
          <ShadowLabel value={copy.total} fontSize={textPx(compact ? 36 : 48)}
            color={saved ? GOLD_HOT : PUNCH_UI.danger} height={px(compact ? 48 : 62)} />
          <Label value={copy.qualifier} fontSize={textPx(compact ? 14 : 16)} color={MUTED}
            textAlign="middle-center"
            uiTransform={{ width: '92%', height: px(compact ? 22 : 28), pointerFilter: 'none' }} />
          {copy.stats ? (
            <Label value={copy.stats} fontSize={textPx(compact ? 13 : 15)} color={saved ? GOLD : MUTED}
              textAlign="middle-center"
              uiTransform={{ width: '92%', height: px(compact ? 20 : 24), pointerFilter: 'none' }} />
          ) : null}
        </UiEntity>
      </UiEntity>
    )
  }

  // The puncher watches. They must not play the save — that is the room's job.
  const playable = !state.isMyTurn
  const quality = state.rescuePushQuality01 ?? 0
  const inGreen = !asking && !done && quality >= 0.999
  const dead = !asking && !done && quality <= 0
  const tooHigh = (state.rescuePushLevel01 ?? 0) > (state.rescuePushTarget01 ?? 0.68) + (state.rescuePushBandHalf01 ?? 0.075) + 0.15
  const order = playable
    ? punchPushOrder(
      asking ? 'ask' : tooHigh ? 'high' : inGreen ? 'perfect' : dead ? 'out' : 'live',
      compact,
    )
    : punchRescueOrder('fumbler')
  const shout = topped
    ? PUNCH_PUSH_EXTRA_SHOUT
    : playable && inGreen ? punchPushShout(Date.now()) : order
  const hot = inGreen
  const bar = pushTouchBarBox(compact, frame)
  const people = (state.rescuePushers ?? []).length
  const ask = punchHelpAskCopy({ name: fumbler, from, to })

  if (asking) {
    const w = px(compact ? 340 : 420)
    const h = px(compact ? 168 : 196)
    return (
      <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 },
        width: frame.width, height: frame.height, pointerFilter: 'none' }}>
        <UiEntity uiTransform={{
          positionType: 'absolute',
          position: { left: Math.round((frame.width - w) / 2), top: frame.top + scorePlateBox().h + px(compact ? 12 : 20) },
          width: w,
          height: h,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          borderWidth: px(2),
          borderColor: PUNCH_UI.brass,
          borderRadius: cornerRadius(UI.radius.md),
          pointerFilter: 'block'
        }} uiBackground={{ color: punchAlpha(PUNCH_UI.ink, 0.96) }}>
          <Label value={ask.title} fontSize={textPx(compact ? 18 : 22)} color={WHITE}
            textAlign="middle-center"
            uiTransform={{ width: '94%', height: px(compact ? 28 : 34), pointerFilter: 'none' }} />
          <Label value={ask.score} fontSize={textPx(compact ? 16 : 20)} color={MUTED}
            textAlign="middle-center"
            uiTransform={{ width: '94%', height: px(compact ? 24 : 28), pointerFilter: 'none' }} />
          <ShadowLabel value={ask.needed} fontSize={textPx(compact ? 28 : 36)}
            color={GOLD_HOT} height={px(compact ? 40 : 50)} />
          {joined ? (
            <Label value={people > 0 ? `${people} HELPING` : "YOU'RE IN"}
              fontSize={textPx(compact ? 13 : 16)} color={CYAN} textAlign="middle-center"
              uiTransform={{ width: '92%', height: px(compact ? 22 : 26), pointerFilter: 'none' }} />
          ) : null}
          <UiEntity
            uiTransform={{
              width: px(compact ? 200 : 220),
              height: px(compact ? 28 : 32),
              margin: { top: px(8) },
              justifyContent: 'center',
              alignItems: 'center',
              pointerFilter: 'block'
            }}
            onMouseDown={() => setPunchRescuePromptsMuted(true)}
          >
            <Label value="DON'T SHOW AGAIN" fontSize={textPx(compact ? 12 : 13)} color={MUTED}
              textAlign="middle-center"
              uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }} />
          </UiEntity>
        </UiEntity>
      </UiEntity>
    )
  }

  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width: frame.width, height: frame.height,
        pointerFilter: 'none' }}
    >
      <PushNeededColumn state={state} compact={compact} climbed={climbed} needed={gap.needed} raised={gap.raised} extra={gap.extra} />
      <Label value={shout} fontSize={textPx(compact ? 16 : 20)}
        color={hot ? GOLD_HOT : dead ? punchAlpha(WHITE, 0.4) : WHITE} textAlign="middle-center"
        uiTransform={{
          positionType: 'absolute',
          position: { left: bar.left, bottom: bar.bottom + bar.height + px(6) },
          width: bar.width,
          height: px(compact ? 24 : 28),
          pointerFilter: 'none'
        }} />
      <PushFocusBar state={state} compact={compact} hot={hot} dead={dead} playable={playable} />
      <PushHelperChips
        state={state}
        compact={compact}
        left={bar.left}
        bottom={bar.bottom + bar.height + px(compact ? 34 : 40)}
        width={bar.width}
      />
      <Label value={`${state.rescueSecondsLeft ?? 0}`} fontSize={textPx(compact ? 22 : 28)}
        color={(state.rescueSecondsLeft ?? 0) <= 3 ? PUNCH_UI.danger : GOLD} textAlign="middle-center"
        uiTransform={{
          positionType: 'absolute',
          position: { right: frame.right + px(compact ? 16 : 24), top: frame.top + px(compact ? 8 : 12) },
          width: px(compact ? 48 : 56),
          height: px(compact ? 32 : 40),
          pointerFilter: 'none'
        }} />
    </UiEntity>
  )
}

const RESCUE_LANE_H = 34
function PushWatchChip(props: { state: ReturnType<typeof punchMachineHud> }) {
  const state = props.state, frame = hudFrame()
  const compact = frame.compact
  const from = state.rescuePushFrom ?? 0
  const to = state.rescuePushTo ?? 900
  const score = Math.max(from, state.rescuePushScore ?? from)
  const gap = punchHelpGap(from, to, score)
  const people = (state.rescuePushers ?? []).length
  const fumbler = (state.rescueRescuedName || 'THE PUNCHER').toUpperCase()
  const ask = punchHelpAskCopy({ name: fumbler, from, to })
  const w = px(compact ? 260 : 340)
  const h = px(compact ? 72 : 88)
  return (
    <UiEntity uiTransform={{
      positionType: 'absolute',
      position: { left: Math.round((frame.width - w) / 2), top: frame.top + scorePlateBox().h + px(compact ? 12 : 16) },
      width: w, height: h,
      flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      borderWidth: px(2), borderColor: PUNCH_UI.brass, borderRadius: cornerRadius(UI.radius.md),
      pointerFilter: 'none'
    }} uiBackground={{ color: punchAlpha(PUNCH_UI.ink, 0.96) }}>
      <Label value={ask.title} fontSize={textPx(compact ? 13 : 16)} color={GOLD}
        textAlign="middle-center"
        uiTransform={{ width: '94%', height: px(compact ? 18 : 22), pointerFilter: 'none' }} />
      <ShadowLabel value={`${gap.raised} / ${gap.needed}`} fontSize={textPx(compact ? 20 : 28)}
        color={GOLD_HOT} height={px(compact ? 28 : 36)} />
      <Label value={people > 0 ? `${people} HELPING` : ask.needed}
        fontSize={textPx(compact ? 12 : 15)} color={CYAN} textAlign="middle-center"
        uiTransform={{ width: '94%', height: px(compact ? 16 : 20), pointerFilter: 'none' }} />
    </UiEntity>
  )
}

function RescuePanel(props: { state: ReturnType<typeof punchMachineHud> }) {
  const state = props.state, frame = hudFrame()
  // THE PUSH IS ITS OWN PANEL. Everything below draws the lane, which the push
  // replaced -- branching inside it would have meant two games sharing one set
  // of local geometry, which is how the last rescue grew a lane it no longer used.
  if (state.rescuePushOn || state.rescueSkill === 'push') {
    const mode = state.rescuePushHud
      ?? (state.rescuePushDone ? 'result' : state.rescuePushAsking ? 'ask' : 'play')
    if (mode === 'watch') return <PushWatchChip state={state} />
    if (mode === 'off') return null
    return <PushPanel state={state} />
  }
  const compact = frame.compact
  const active = !!state.rescueCanTap
  const showLane = !!state.rescueRingVisible
  const marker01 = Math.max(0, Math.min(1, state.rescueMarker01 ?? 0.5))
  const band01 = Math.max(0, Math.min(0.5, state.rescueBand01 ?? 0))
  const inBand = !!state.rescueInBand
  const need = Math.max(1, state.rescueTapsRequired ?? 3)
  const got = Math.max(0, Math.min(need, state.rescueTaps ?? 0))
  const won = !!state.rescueWinnerName
  // A hit flashes white and a miss flashes red, and nothing else on the panel
  // moves — so the flash IS the feedback rather than decoration on top of it.
  const flash = state.rescueHitFlash ? WHITE : state.rescueOutFlash ? PUNCH_UI.danger : null
  /* ‼️THE ORDER. Four words at the size of the countdown, directly above the
     lane, because the lane can teach WHEN and only a sentence can teach WHAT.
     The phases are the four states this panel can be in for the person looking
     at it — and `fumbler` (no lane, nothing to press) is a phase rather than a
     blank, since an empty veil is exactly what read as "no instructions". */
  const phase: PunchRescueOrderPhase = won ? 'won'
    : state.rescuePreparing ? 'preparing'
    : !showLane ? 'fumbler'
    : !active ? 'claimed'
    : 'live'
  const order = punchRescueOrder(phase, state.rescueSkill ?? 'band-taps', compact)
  const laneW = Math.min(px(compact ? 320 : 620), frame.width - frame.left - frame.right - px(32))
  const laneH = px(compact ? 26 : RESCUE_LANE_H)
  const bandW = Math.max(px(6), Math.round(laneW * band01 * 2))
  const bandLeft = Math.round((laneW - bandW) / 2)
  const runnerW = Math.max(px(4), px(compact ? 5 : 7))
  const runnerLeft = Math.round(Math.max(0, Math.min(laneW - runnerW, marker01 * laneW - runnerW / 2)))
  const edge = state.rescuePreparing ? GOLD : won ? GOLD : flash ?? (inBand ? GOLD : punchAlpha(PUNCH_UI.danger, 0.85))
  const pip = px(compact ? 16 : 22)
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width: frame.width, height: frame.height,
        flexDirection: 'column', justifyContent: 'center', alignItems: 'center', pointerFilter: active ? 'block' : 'none',
        borderWidth: px(compact ? 6 : 10), borderColor: edge }}
      // ‼️THE VEIL DOES THE DISCONNECTING. "It needs to disconnect you from what's
      // going on" — for four seconds this is the only game on screen.
      uiBackground={{ color: punchAlpha(PUNCH_UI.ink, showLane ? 0.72 : 0.46) }}
      onMouseDown={() => { if (active) punchRescuePress() }}
    >
      <Label value={state.rescueLabel || ''} fontSize={textPx(compact ? 22 : 36)} color={won ? GOLD : WHITE} textAlign="middle-center"
        uiTransform={{ width: '92%', height: px(compact ? 56 : 74), pointerFilter: 'none' }} />
      {/* ‼️THE ORDER GOES GOLD WITH THE BAND. On a phone the lane is 320 px of a
          1600 px canvas and these words are the largest thing on screen, so the
          words carry the "now" as well as the "what" — otherwise the one element
          big enough to read at a glance is the one element that never moves. */}
      <Label value={order} fontSize={textPx(compact ? 42 : 66)}
        color={won || phase === 'preparing' ? GOLD : flash ?? (inBand ? GOLD : WHITE)} textAlign="middle-center"
        uiTransform={{ width: '94%', height: px(compact ? 66 : 96), pointerFilter: 'none' }} />
      {!state.rescuePreparing && showLane && !won ? (
        <UiEntity uiTransform={{ width: laneW, height: laneH, margin: { top: px(10), bottom: px(12) },
          borderRadius: px(compact ? 13 : 17), borderWidth: px(2), borderColor: punchAlpha(WHITE, 0.35), pointerFilter: 'none' }}
          uiBackground={{ color: punchAlpha(PUNCH_UI.ink, 0.72) }}>
          {/* THE GOLD ZONE. Its width IS the difficulty — `rescueBand01` — so a
              director loosening the band widens exactly what the player sees. */}
          <UiEntity uiTransform={{ positionType: 'absolute', position: { left: bandLeft, top: 0 }, width: bandW, height: laneH,
            borderRadius: px(compact ? 13 : 17), pointerFilter: 'none' }}
            uiBackground={{ color: punchAlpha(GOLD, inBand ? 0.92 : 0.5) }} />
          {/* THE RUNNER, drawn last so it is never behind the zone it has to hit. */}
          <UiEntity uiTransform={{ positionType: 'absolute', position: { left: runnerLeft, top: 0 }, width: runnerW, height: laneH,
            pointerFilter: 'none' }} uiBackground={{ color: flash ?? WHITE }} />
        </UiEntity>
      ) : null}
      {/* THE SCORE, AS PIPS THAT GO BACKWARDS. A number would have said the same
          thing; a row of lamps losing one is the thing you feel. */}
      {showLane && !won && (state.rescueSkill ?? 'band-taps') === 'band-taps' ? (
        <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
          width: laneW, height: px(compact ? 24 : 30), pointerFilter: 'none' }}>
          {Array.from({ length: need }, (_, i) => (
            <UiEntity key={`pip-${i}`} uiTransform={{ width: pip, height: pip, borderRadius: Math.round(pip / 2),
              margin: { left: px(5), right: px(5) }, pointerFilter: 'none' }}
              uiBackground={{ color: i < got ? GOLD : punchAlpha(WHITE, 0.2) }} />
          ))}
        </UiEntity>
      ) : null}
      {!state.rescuePreparing && !won && showLane ? (
        <Label value={`${state.rescueSecondsLeft ?? 0}`} fontSize={textPx(compact ? 36 : 58)} color={edge} textAlign="middle-center"
          uiTransform={{ width: '100%', height: px(compact ? 54 : 76), pointerFilter: 'none' }} />
      ) : null}
      <Label value={state.rescueHint || ''} fontSize={textPx(compact ? 15 : 21)} color={CYAN} textAlign="middle-center"
        uiTransform={{ width: '90%', height: px(compact ? 54 : 62), pointerFilter: 'none' }} />
    </UiEntity>
  )
}

/** Brief active-player-only impact fracture. Procedural lines avoid another texture load. */
function ScreenCrack(props: { strength: number }) {
  if (props.strength <= 0) return null
  const alpha = Math.min(0.92, 0.25 + props.strength * 0.7)
  const line = Color4.create(1, 1, 1, alpha)
  const segments: Array<{ left: PositionUnit; top: PositionUnit; width: number; height: number }> = [
    { left: '50%', top: '34%', width: px(3), height: px(92) },
    { left: '43%', top: '43%', width: px(86), height: px(3) },
    { left: '37%', top: '38%', width: px(54), height: px(3) },
    { left: '55%', top: '50%', width: px(72), height: px(3) },
    { left: '47%', top: '54%', width: px(3), height: px(68) },
    { left: '61%', top: '39%', width: px(3), height: px(52) }
  ]
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}>
      {segments.map((segment, index) => (
        <UiEntity key={`crack-${index}`} uiTransform={{ positionType: 'absolute', position: { left: segment.left, top: segment.top }, width: segment.width, height: segment.height, pointerFilter: 'none' }} uiBackground={{ color: line }} />
      ))}
    </UiEntity>
  )
}

/**
 * ONE transient message at a time, by priority.
 *
 * "STEP ASIDE" and "YOU MISSED YOUR TURN" were both pinned at 70% and were both
 * reachable in the same frame, which drew them on top of each other. Choosing
 * here means the rail has exactly one transient slot and the choice is written
 * down instead of being decided by render order.
 */
function transientStatus(state: ReturnType<typeof punchMachineHud>): string {
  if (state.mustStepAside) return `${state.activeName.toUpperCase() || 'A PLAYER'} IS UP — STEP ASIDE`
  if (state.mustStandOnMark) return 'STAND ON THE MARK'
  if (state.missedTurn) return 'MISSED YOUR TURN — PUNCH TO REJOIN'
  // Lowest priority on purpose: the ring line is TRUE for minutes at a time,
  // and a standing fact must never sit on top of a thing that just happened.
  if (state.ringPlace > 0) return punchRingLine(state.ringPlace, state.roundPaceMs)
  return ''
}

/**
 * ‼️THE RAIL IS A BUDGET, NOT A STACK — AND THAT IS WHY THE PHONE SAW NOTHING.
 *
 * Fourteen `TopRailRow`s could be true in the same frame, each 38 px plus a gap,
 * and they were simply emitted one after another from `top: 22`. On a monitor
 * that is 620 px of a 1080 px canvas: crowded, survivable. A phone's canvas is
 * 720 DESIGN pixels tall, not 1080 (see `isCompact`) — so the same stack ran
 * past the bottom of the screen, and the rows that fell off the end were the
 * ones declared last. Nothing warned and nothing clipped visibly; the
 * achievements were simply drawn where the screen is not.
 *
 * So rows are DECLARED with a rank and a height, the rail spends a pixel budget
 * on them in rank order, and whatever it cannot afford is not drawn at all.
 * Two consequences worth stating, because both are the point:
 *
 *   THE FLASH WINS. A streak rung, a rescue, a High Ground, "STEP ASIDE" — the
 *   things that happen ONCE and mean something — outrank the permanent
 *   readouts, so a full rail drops PLAYERS 3 OF 4 and keeps the achievement.
 *   It used to be the other way round, purely by source order.
 *
 *   ORDER ON SCREEN NEVER SHUFFLES. Selection is by rank; drawing is by
 *   declaration order. A row appearing cannot make the rows above it jump.
 */
type RailRow = { key: string; rank: number; height: number; node: ReactEcs.JSX.ReactNode }

/** Rank bands, named so a new row has an obvious home. */
const RAIL_MUST = 0
const RAIL_EVENT = 1
const RAIL_STATE = 2
const RAIL_WHO = 3
const RAIL_AMBIENT = 4

function TopRail(props: {
  state: ReturnType<typeof punchMachineHud>
  showRound: boolean
  showFocusPill: boolean
}) {
  const { state } = props
  const focus = focusChipLabel(state)
  const transient = transientStatus(state)
  const upNext = !state.isMyTurn && state.activeName && !transient
    ? `${state.activeName.toUpperCase()} IS UP`
    : ''
  const compact = isCompact()
  const clockUp = state.isMyTurn && turnCountdownVisible(state)
  /** One scale for the whole rail, so no chip in it can drift out of step. */
  const fs = (design: number) => Math.round(design * (compact ? 0.82 : 1))
  const rows: RailRow[] = []
  // `exact` skips the compact shrink for a row that has already resolved its own
  // device sizing — a declared height is otherwise a DESKTOP design height, and
  // shrinking an already-compact plate a second time is how a row ends up
  // claiming less of the budget than it actually draws.
  // ‼️THE CUT EMPTIES THE RAIL. A 999 turns the island off for 1.2 s (see
  // `startPerfectCut`) and a HUD that kept drawing nine chips through it would
  // be the one surface refusing to go quiet — the effect is that the plate is
  // the ONLY thing left on screen. Enforced here, at the one door every row
  // goes through, so a row added later cannot forget about it.
  const cutting = state.perfectCutSince >= 0
  const add = (key: string, rank: number, height: number, node: ReactEcs.JSX.ReactNode, exact = false) => {
    if (cutting && key !== 'score') return
    rows.push({ key, rank, height: Math.round(exact ? height : height * (compact ? 0.82 : 1)), node })
  }

  /* ‼️THE SCORE HEADS THE COLUMN, AND IT IS THE ONE ROW THAT CANNOT BE DROPPED.
     The plate is the running SCORE now — not this punch's crawl. The crawl
     lives in the slot as +N after the count lands. Spectators still get the
     theater: same plate, same slot events. */
  if (props.showRound) {
    add('score', RAIL_MUST, scorePlateRowHeight(state), <ScorePlate state={state} />, true)
    const pushBusy = !!state.rescuePushHud && state.rescuePushHud !== 'off'
    /* ‼️THE SHOT CLOCK OWNS THE MIDDLE. Owner, 2026-09-11: YOUR TURN sat on
       the rail's "3 LEFT" and read as YOUR 3 LEFT, with WIRE across the digit.
       Remaining punches live on that chip (`YOUR TURN · 3 LEFT`). The slot
       comes back the moment the clock is gone — scoring, cooldown, the rest. */
    if (!pushBusy && !clockUp) add('slot', RAIL_MUST, punchHudSlotHeight(), <PunchHudSlot state={state} />, true)
  }
  /* ‼️THE SAVE'S SECOND SCORE LEFT THE RAIL. Owner, 2026-09-11: Swiss Mob /
     Swissverse take sat in the centre column and covered the aiming hoop.
     The growing number still exists — `SaveRunChip`, left chrome, not here. */

  /* ‼️THE ONE FAULT THAT LOOKS LIKE NOTHING AT ALL. An island above the scene's
     roof is not drawn and carries no colliders, so the player falls through a
     sky with no island in it — and every other surface keeps working, which is
     what makes it read as a mystery. */
  /* Diagnostic chips and server status messages are ONLY visible to the main admin.
     Regular visitors, judges, and other players see a clean arcade presentation. */
  if (punchAdminVisible() && !clockUp) {
    if (state.serverWaking) {
      const wait = state.houseWaitLeftSec
      add('server-waking', RAIL_MUST, 36, <SvChip label={wait > 0 ? 'WAKING THE HOUSE UP  ·  ' + wait + 's' : 'WAKING THE HOUSE UP  ·  ONE MOMENT'} color={PUNCH_UI.ink} skin={{ color: UI.gold, radius: UI.radius.pill }} fontSize={fs(16)} />)
    }
    if (!state.serverWaking && state.houseMode === 'orphan') {
      add('house-orphan', RAIL_MUST, 36, <SvChip label="NO SERVER ANSWERED  ·  THIS DEVICE HOSTS ITS OWN GAME" color={PUNCH_UI.ink} skin={{ color: UI.gold, radius: UI.radius.pill }} fontSize={fs(14)} />)
    }
    if (!state.serverWaking && state.houseMode === 'server') {
      add('house-server', RAIL_STATE, 24, <SvChip label="HOUSE · SERVER" color={GOLD} fontSize={fs(13)} />)
    }
    if (state.houseMode !== 'coordinator') {
      const connected = state.roomConnected === null ? '—' : state.roomConnected ? 'yes' : 'NO'
      const from = state.roomLastFrom ? (state.roomLastFrom === 'authoritative-server' ? 'server' : state.roomLastFrom.slice(0, 6)) : '—'
      add('room-readout', RAIL_STATE, 22, <SvChip label={'ROOM  connected ' + connected + '  ·  ready ' + (state.roomReady ? 'yes' : 'NO') + '  ·  synced ' + (state.roomSynced ? 'yes' : 'NO') + '  ·  frames ' + state.roomFramesIn + '  ·  from ' + from} color={PUNCH_UI.ink} skin={{ color: UI.gold, radius: UI.radius.pill }} fontSize={fs(11)} />)
      const adapter = state.roomAdapter ? state.roomAdapter.split(':')[0] : '—'
      add('room-name', RAIL_STATE, 22, <SvChip label={'ROOM NAME  ' + (state.roomName || '—') + '  ·  via ' + adapter} color={PUNCH_UI.ink} skin={{ color: UI.gold, radius: UI.radius.pill }} fontSize={fs(11)} />)
    }
    if (state.httpWire) {
      add('http-wire', RAIL_STATE, 22, <SvChip label={'WIRE http  ·  frames ' + state.httpFramesIn + '  ·  seq ' + state.httpSeq + (state.httpError ? '  ·  ' + state.httpError : '')} color={PUNCH_UI.ink} skin={{ color: UI.gold, radius: UI.radius.pill }} fontSize={fs(11)} />)
    }
  }
  if (state.ghostLive) {
    add(
      'ghost-live',
      RAIL_MUST,
      36,
      <SvChip
        label="NOT IN THE LIVE GAME  ·  TAP REJOIN TO PLAY"
        color={PUNCH_UI.ink}
        skin={{ color: UI.gold, radius: UI.radius.pill }}
        fontSize={fs(14)}
      />,
    )
  }
  if (state.islandFitWarning) {
    add('island-fit', RAIL_MUST, 36, <SvChip label={state.islandFitWarning} color={PUNCH_UI.ink} skin={{ color: UI.gold, radius: UI.radius.pill }} fontSize={fs(16)} />)
  }
  /* ‼️THE HEADCOUNT IS NOT A RAIL ROW ANY MORE. `PLAYERS n OF 4` cost 28 px of
     the rail's budget and pushed the round header — the pips, the shot clock,
     the streak rung — a line further into the play on a 720 px canvas. It is
     `n/4` on the corner row now (see `SeatsChip`), which costs this stack
     nothing. Owner, 2026-09-09: "it is useful information but does not deserve
     primary screen space." Deleting the ROW as well as the chip is the point:
     a reservation that outlives what was in it is how this rail grew (see the
     dead IN THE QUEUE row in the right-rail chain). */
  /* ‼️THE STANDING BOARD IS NOT A RAIL ROW — IT IS THE ROW THE RAIL PAID FOR.
     Two chips used to sit here, in the slot directly above the round line:
     the arc's cycling spotlight card (TONIGHT #1 · NAME · 1,234) and, for
     anyone not at the bag, a strip of tonight's top three. Both said the same
     thing — what tonight's record IS — and neither of them was ever something
     HAPPENING. On a 720 px canvas that permanent row pushed every live row of
     the game a line further down, into the middle of the play. Owner,
     2026-09-09: *"I don't think we need to show what tonight's record is at
     the very top, and this will allow us to move up everything."*

     So the rail carries what is happening and nothing that merely stands. The
     standing scores are not lost: the arc still cycles the same cards as
     digits (`punchArenaSpotlight` feeds `updateArenaScreen`, untouched), and
     the full list is one button away in the scoreboard panel.
     Achievements now occupy the slot under the score, not a second chip row. */
  if (upNext) {
    add('up-next', RAIL_WHO, 38, <SvChip label={upNext} color={UI.muted} fontSize={fs(20)} />)
  }
  /* ‼️THE FUMBLE WARNING IN WORDS — OFF BY DEFAULT, AND THAT IS THE POINT.
     The owner chose `physical` (the reticle bleeding and the rail tightening),
     so this chip only exists because he then asked that every option offered
     stay available in the director. `RAIL_MUST`, because a warning that a short
     canvas drops is a warning that fires for the people who need it least. */
  if (state.fumbleRiskStyle !== 'physical' && (state.fumbleRisk01 ?? 0) > 0.45 && state.isMyTurn) {
    const heavy = (state.fumbleRisk01 ?? 0) > 0.72
    const cost = state.streakMultiplier && state.streakMultiplier > 1 ? ` · ×${state.streakMultiplier} ON THE LINE` : ''
    add('fumble-risk', RAIL_MUST, 34, (
      <SvChip label={(heavy ? 'FUMBLE RISK' : 'RISKY NEEDLE') + cost} color={heavy ? PUNCH_UI.danger : GOLD} fontSize={fs(18)} />
    ))
  }
  /* The room, in the one wording allowed. Violet, because that is now the
     channel's colour everywhere — the buttons, the pulses and this chip are one
     vocabulary, and none of them says which way anyone pushed. */
  if (focus) {
    add('focus-chip', RAIL_WHO, 30, <SvChip label={focus} color={VIOLET} fontSize={fs(19)} />)
  }
  /* THE LEVEL, DIRECTLY UNDER THE HEADCOUNT THAT PRODUCED IT. See
     `focusPillBox` — on a desktop the shelf is a readout and belongs with the
     other readouts, not across the middle of the screen. It is not drawn at all
     while the bag is yours: see the root render. */
  if (props.showFocusPill) {
    add('focus-pill', RAIL_WHO, Math.round(focusPillBox().h + px(RAIL_GAP)), <FocusPill state={state} />)
  }
  /* STEP ASIDE / MISSED TURN occupy the slot under the score. The ring wait
     is standing information and stays a quiet row. */
  if (transient && !state.mustStepAside && !state.mustStandOnMark && !state.missedTurn) {
    add('transient', RAIL_WHO, 34, (
      <SvChip
        label={transient}
        color={PUNCH_UI.ink}
        skin={{ color: UI.gold, radius: UI.radius.pill }}
        fontSize={fs(20)}
      />
    ))
  }

  /**
   * The budget. A phone gets less of its screen than a monitor does BECAUSE it
   * has less screen: 44% of 720 is 317 px, about seven rows — plenty for
   * everything normally true at once, and a hard stop on the frames where
   * fourteen are.
   */
  const budget = Math.round(canvasSize().height * (compact ? 0.44 : 0.62))
  const ranked = rows.map((row, index) => ({ row, index })).sort((a, b) => (a.row.rank - b.row.rank) || (a.index - b.index))
  const kept: Record<string, boolean> = {}
  let spent = 0
  for (const entry of ranked) {
    const cost = entry.row.height + px(RAIL_GAP)
    // `continue`, not `break`: a tall row we cannot afford must not lock out the
    // short ones behind it. Refusing one row is not refusing the rest.
    if (spent + cost > budget) continue
    spent += cost
    kept[entry.row.key] = true
  }

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: px(RAIL_TOP), left: 0 },
        width: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      {rows.filter((row) => kept[row.key]).map((row) => (
        <TopRailRow key={row.key} height={row.height}>{row.node}</TopRailRow>
      ))}
    </UiEntity>
  )
}

/**
 * A round has to END, visibly. Without this the machine simply dealt a new one
 * and the player found themselves back at 1 of 3 with no idea what happened.
 */
/**
 * ‼️THE CARD IS CUT TWICE: FROM THE CANVAS, THEN DOWN TO WHAT IT SAYS.
 *
 * This returns the SCALE basis and nothing else now. It used to return the card
 * itself — one square `size` drove the width AND the height, so the panel
 * claimed the same ~28% of the screen whether it carried five lines or one, and
 * the difference was printed as empty ink. Owner, 2026-09-09: *"on mobile it's
 * overlapping half the screen and the information on it doesn't feel like it's
 * really important that it occupies this much empty background space."*
 *
 * The canvas cut stays, because it is what stops a 700 px card running off a
 * 720 px phone. It is a CAP and a type ratio now, not the layout;
 * `resultCardPlan` measures the copy and the card is the size of that.
 */
function resultCloudBox(): { size: number; k: number; top: number } {
  const canvas = canvasSize()
  const size = Math.round(Math.min(px(SCORE_CLOUD_W), canvas.height * 0.62, canvas.width * 0.46))
  return { size, k: size / SCORE_CLOUD_W, top: Math.round(canvas.height * 0.06) }
}

/**
 * SDK7 UI cannot measure text. 0.58 em was the ledger's estimate; it is too
 * tight for this card. A line that does not fit wraps inside a one-row box
 * and prints over the row beneath it — owner, 2026-09-11, the KEPT IN PLAY
 * card: the + sat on the badge and "THEIR RUN PAYS YOU" sat on "KEPT … IN".
 * 0.72 rounds UP on purpose. An over-estimate is padding; an under-estimate
 * is the overlap in the screenshot.
 */
function capsWidth(text: string, fontSize: number): number {
  return Math.ceil(text.length * 0.72 * fontSize)
}

/* The card's rows in DESIGN pixels at k = 1; every use below multiplies by k. */
const RESULT_PAD = 20
const RESULT_GAP = 16
const RESULT_WINNER_H = 32
const RESULT_WINNER_FONT = 18
/* Taller than the glyph so the phone lift (compactDigitLift) stays inside the
 * row. 72 left 2px of spare; a 0.16-em lift clipped under the card's overflow. */
const RESULT_SCORE_H = 96
const RESULT_SCORE_FONT = 70
const RESULT_QUALIFIER_H = 22
const RESULT_QUALIFIER_FONT = 16
const RESULT_STATS_H = 20
const RESULT_STATS_FONT = 16
const RESULT_FOOT_FONT = 13
const RESULT_FOOT_LABEL_H = 16
const RESULT_FOOT_GAP = 8
const RESULT_BAR_H = 10
const RESULT_FOOT_H = RESULT_FOOT_LABEL_H + RESULT_FOOT_GAP + RESULT_BAR_H
/** Floor so a 3-digit save ("+143") cannot shrink the house under its own sentence. */
const RESULT_BODY_MIN_W = 280

/**
 * ‼️THE ROUND'S STORY DROPS ITS ZEROS.
 *
 * The line read `BEST PUNCH 599 · 0 OVER 900 · LONGEST RUN 0` — the widest row
 * in the card, two thirds of it spent printing that nothing happened, which is
 * the round reading as a failure at the moment it is meant to read as an
 * ending. A stat with nothing in it is not said; when none of the three has
 * anything the row does not exist and the card is shorter by its height.
 *
 * The labels are short (`BEST`, `RUN`) because the longest LABEL sets the width
 * of the whole card. `ROUND TOTAL` moves BESIDE the number rather than above
 * it: it is a caption for the figure, and a caption on its own row is a row.
 */
type PunchStoryPlan = {
  k: number
  top: number
  w: number
  h: number
  tile: number
  winner: string
  qualifier: string
  told: boolean
  qualifierHot: boolean
  stats: string
  total: string
  foot: string
  winnerW: number
  totalW: number
  qualifierW: number
  drain01: number
}

/**
 * One geometry for winner and help. Full-height portrait flush left;
 * padding lives on the copy column only.
 */
function storyCardPlan(copy: {
  badge: string
  total: string
  qualifier: string
  stats: string
  foot?: string
  drain01?: number
  told?: boolean
  qualifierHot?: boolean
}): PunchStoryPlan {
  const box = resultCloudBox()
  const k = box.k
  const winnerW = capsWidth(copy.badge, RESULT_WINNER_FONT) + 28
  const totalW = capsWidth(copy.total, RESULT_SCORE_FONT)
  const qualifierW = capsWidth(copy.qualifier, RESULT_QUALIFIER_FONT)
  const statsW = copy.stats ? capsWidth(copy.stats, RESULT_STATS_FONT) : 0
  const bodyW = Math.max(RESULT_BODY_MIN_W, winnerW, totalW, qualifierW, statsW)
  const hasFoot = !!copy.foot
  const bodyH = RESULT_WINNER_H + 8 + RESULT_SCORE_H + 4 + RESULT_QUALIFIER_H
    + (copy.stats ? 4 + RESULT_STATS_H : 0)
    + (hasFoot ? 10 + RESULT_FOOT_H : 0)
  const portrait = bodyH + RESULT_PAD * 2
  const content = portrait + RESULT_GAP + bodyW + RESULT_PAD
  return {
    k,
    top: box.top,
    w: Math.min(box.size, Math.round(content * k)),
    h: Math.round(portrait * k),
    tile: Math.round(portrait * k),
    winner: copy.badge,
    qualifier: copy.qualifier,
    told: !!copy.told,
    qualifierHot: !!copy.qualifierHot,
    stats: copy.stats,
    total: copy.total,
    foot: copy.foot ?? '',
    winnerW: Math.round(winnerW * k),
    totalW: Math.round(totalW * k),
    qualifierW: Math.round(qualifierW * k),
    drain01: copy.drain01 ?? 0,
  }
}

function resultCardPlan(state: ReturnType<typeof punchMachineHud>) {
  const name = state.activeName ? state.activeName.slice(0, isCompact() ? 14 : 20).toUpperCase() : ''
  const winner = name ? 'WINNER' : 'ROUND COMPLETE'
  const qualifier = state.recordAllTime ? 'ALL-TIME RECORD'
    : state.recordDaily ? 'DAILY RECORD'
    : state.recordHourly ? 'HOURLY RECORD'
    : state.recordPersonal ? 'PERSONAL BEST'
    : state.recordTonight ? 'BEST OF TONIGHT'
    : state.streakTotal > 0 ? `STREAK +${state.streakTotal}`
    : 'ROUND TOTAL'
  const told = state.recordAllTime || state.recordDaily || state.recordHourly || state.recordPersonal || state.recordTonight || state.streakTotal > 0
  const bits: string[] = []
  if (state.roundBestPunch > 0) bits.push(`BEST ${state.roundBestPunch}`)
  if (state.roundStrong > 0) bits.push(`${state.roundStrong} OVER 900`)
  if (state.roundLongestStreak > 1) bits.push(`RUN ${state.roundLongestStreak}`)
  const stats = bits.join('  ·  ')
  const total = state.roundTotal.toLocaleString()
  const foot = state.isMyTurn ? 'NEW ROUND' : 'UP NEXT'
  return storyCardPlan({
    badge: winner,
    total,
    qualifier,
    stats,
    foot,
    told,
    drain01: Math.max(0, Math.min(1, state.summaryMsLeft / PUNCH_ROUND_SUMMARY_MS)),
  })
}

function PunchStoryCard(props: { userId?: string; name: string; plan: PunchStoryPlan }) {
  const { plan } = props
  const k = plan.k
  const pad = Math.round(RESULT_PAD * k)
  const gap = Math.round(RESULT_GAP * k)
  const barH = Math.max(4, Math.round(RESULT_BAR_H * k))
  const footLabelH = Math.round(RESULT_FOOT_LABEL_H * k)
  const footGap = Math.round(RESULT_FOOT_GAP * k)
  return (
    <UiEntity
      uiTransform={{
        width: plan.w,
        height: plan.h,
        padding: { top: 0, left: 0, bottom: 0, right: pad },
        borderWidth: Math.max(2, Math.round(3 * k)),
        borderColor: PUNCH_UI.brass,
        borderRadius: cornerRadius(UI.radius.md),
        flexDirection: 'row',
        alignItems: 'stretch',
        overflow: 'hidden',
        pointerFilter: 'none'
      }}
      uiBackground={{ color: PUNCH_UI.ink }}
    >
      <PlayerCard userId={props.userId} name={props.name} size={plan.tile} caption flush />
      <UiEntity
        uiTransform={{
          flexGrow: 1,
          height: '100%',
          margin: { left: gap },
          padding: { top: pad, bottom: pad },
          flexDirection: 'column',
          alignItems: 'flex-start',
          pointerFilter: 'none'
        }}
      >
        <UiEntity
          uiTransform={{
            width: plan.winnerW,
            height: Math.round(RESULT_WINNER_H * k),
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: cornerRadius(UI.radius.sm),
            pointerFilter: 'none'
          }}
          uiBackground={{ color: PUNCH_UI.red }}
        >
          <Label value={plan.winner} fontSize={Math.round(RESULT_WINNER_FONT * k)} color={WHITE} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: '100%' }} />
        </UiEntity>
        <ShadowLabel
          value={plan.total}
          fontSize={Math.round(RESULT_SCORE_FONT * k)}
          color={UI.gold}
          height={Math.round(RESULT_SCORE_H * k)}
          width={plan.totalW}
          textAlign="middle-left"
          margin={{ top: Math.round(8 * k) }}
        />
        <Label
          value={plan.qualifier}
          fontSize={Math.round(RESULT_QUALIFIER_FONT * k)}
          color={plan.qualifierHot ? PUNCH_UI.danger : plan.told ? UI.gold : UI.muted}
          textAlign="middle-left"
          textWrap="nowrap"
          uiTransform={{ width: '100%', height: Math.round(RESULT_QUALIFIER_H * k), margin: { top: Math.round(4 * k) }, pointerFilter: 'none' }}
        />
        {plan.stats ? (
          <Label
            value={plan.stats}
            fontSize={Math.round(RESULT_STATS_FONT * k)}
            color={UI.muted}
            textAlign="middle-left"
            textWrap="nowrap"
            uiTransform={{ width: '100%', height: Math.round(RESULT_STATS_H * k), margin: { top: Math.round(4 * k) }, pointerFilter: 'none' }}
          />
        ) : null}
        {plan.foot ? (
          <UiEntity uiTransform={{ flexGrow: 1, width: '100%', flexDirection: 'column', justifyContent: 'flex-end', pointerFilter: 'none' }}>
            <Label
              value={plan.foot}
              fontSize={Math.round(RESULT_FOOT_FONT * k)}
              color={UI.muted}
              textAlign="middle-left"
              textWrap="nowrap"
              uiTransform={{ width: '100%', height: footLabelH, pointerFilter: 'none' }}
            />
            <UiEntity uiTransform={{ width: '100%', height: footGap, pointerFilter: 'none' }} />
            <UiEntity uiTransform={{ width: '100%', height: barH, borderRadius: cornerRadius(UI.radius.pill, barH), pointerFilter: 'none' }} uiBackground={{ color: PUNCH_UI.inkSoft }}>
              <UiEntity uiTransform={{ width: `${Math.round(plan.drain01 * 100)}%`, height: '100%', borderRadius: cornerRadius(UI.radius.pill, barH), pointerFilter: 'none' }} uiBackground={{ color: UI.gold }} />
            </UiEntity>
          </UiEntity>
        ) : null}
      </UiEntity>
    </UiEntity>
  )
}

function RoundOverCard(props: { state: ReturnType<typeof punchMachineHud> }) {
  const plan = resultCardPlan(props.state)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: plan.top, left: '50%' },
        margin: { left: -Math.round(plan.w / 2) },
        width: plan.w,
        height: plan.h,
        pointerFilter: 'none'
      }}
    >
      <PunchStoryCard userId={props.state.activeUserId} name={props.state.activeName} plan={plan} />
    </UiEntity>
  )
}

/**
 * THE QUIET SWITCH. Two boxes under the fall chip, deliberately faint: the
 * ring and the cabinet. Filled means you hear that channel; empty means
 * silence — yours only, nobody else on the deck loses a sound. Drawn at 0.6
 * opacity because a comfort setting should be findable, not loud.
 *
 * Row runs REVERSED so the switches line up against the screen edge with their
 * labels reading inward. Box-then-label is a left-edge habit; on the right it
 * leaves the touch targets floating in the middle of the panel.
 */
/**
 * SOUND: ONE ICON, IN THE CORNER, NEXT TO THE QUEUE BUTTON.
 *
 * Three named channels — CROWD, MACHINE, CLOUDS — were how we found the sound
 * nobody could silence, and a poor thing to leave a visitor holding: three small
 * targets on a phone, asking them to care which of our subsystems is making the
 * noise. That became one SOUND ON / SOUND OFF switch, and the switch became this
 * icon: on a 720 px phone canvas a labelled row on the right edge cost SCORES and
 * the reload meter the height they needed to stay off the PUNCH disc (owner,
 * 2026-09-08: "the punch button is overlapping … on top with scores"). Muting is
 * chrome — it is pressed once, by the few people who want it — so it takes a
 * 44 px square on the corner row rather than a row of the rail.
 *
 * ‼️READABLE WITHOUT THE WORD. The plate is the state: gold ring and gold note
 * for sound, dim ring and a bar struck through the note for silence. SDK7 UI
 * cannot rotate, so the strike is horizontal — a drawn box, not a glyph nobody
 * can be sure the device's font carries.
 */
/**
 * ‼️THE ICON OPENS A MENU NOW — TWO ROWS, AND IT STAYS AN ICON.
 *
 * Owner, 2026-09-09: *"the spoken voices have become much more frequent. Add
 * separate controls for voices and other game audio. Keep the existing audio
 * icon and use it to open a small dropdown with simple controls such as Voices
 * and Game Sounds. Avoid creating a large settings menu for this."*
 *
 * So the tap target, the corner it sits in and the plate that reads as its state
 * are all unchanged; what the tap DOES is open two rows underneath it instead of
 * silencing everything. The rows are the two questions and nothing else — no
 * sliders, no channel names, no third row of chrome. Three named channels were
 * tried here once (CROWD / MACHINE / CLOUDS) and were the wrong ask: a visitor
 * does not know or care which of our subsystems is talking.
 *
 * ‼️IT CLOSES ON THE ICON, because SDK7 UI has no outside-click. A menu whose
 * only way out is a row you have to notice is the "large settings menu" the
 * owner asked us not to build; the icon you opened it with is where a thumb
 * already is.
 */
let mutePanelOpen = false
const MUTE_MENU_W = 250
const MUTE_MENU_ROW = 50
const MUTE_MENU_PAD = 8
const MUTE_MENU_GAP = 8

function MuteMenuRow(props: { label: string; on: boolean; top: number; onPress: () => void }) {
  const rowH = px(MUTE_MENU_ROW)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: px(MUTE_MENU_PAD), top: props.top },
        width: px(MUTE_MENU_W - MUTE_MENU_PAD * 2),
        height: rowH,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: cornerRadius(UI.radius.md),
        pointerFilter: 'block'
      }}
      uiBackground={{ color: punchAlpha(props.on ? PUNCH_UI.gold : PUNCH_UI.ink, props.on ? 0.16 : 0.42) }}
      onMouseDown={props.onPress}
    >
      <Label
        value={props.label}
        fontSize={textPx(16)}
        color={props.on ? GOLD : MUTED}
        textAlign="middle-left"
        uiTransform={{ width: '64%', height: '100%', margin: { left: px(10) }, pointerFilter: 'none' }}
      />
      {/* The state as a WORD, not a tick: a tick in a dim row is ambiguous about
          whether it means "on" or "selected for muting". */}
      <Label
        value={props.on ? 'ON' : 'OFF'}
        fontSize={textPx(16)}
        color={props.on ? GOLD : MUTED}
        textAlign="middle-right"
        uiTransform={{ width: '28%', height: '100%', margin: { right: px(10) }, pointerFilter: 'none' }}
      />
    </UiEntity>
  )
}

/**
 * `1/4` — the whole readout. See SEATS_CHIP_RIGHT for why it is here and not on
 * the rail. Gold once somebody is actually at the bag, muted while the island is
 * empty, so a glance says "there is a game on" without reading the digits.
 */
function SeatsChip(props: { playersIn: number }) {
  const anyone = props.playersIn > 0
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { right: px(SEATS_CHIP_RIGHT), top: px(SEATS_CHIP_TOP) },
        width: px(SEATS_CHIP_W),
        height: px(SEATS_CHIP_H),
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: Math.max(1, px(2)),
        borderColor: anyone ? GOLD : MUTED,
        borderRadius: cornerRadius(UI.radius.pill, px(SEATS_CHIP_H)),
        pointerFilter: 'none'
      }}
      uiBackground={{ color: punchAlpha(anyone ? PUNCH_UI.gold : PUNCH_UI.ink, anyone ? 0.18 : 0.55) }}
    >
      <Label
        value={`${Math.max(0, Math.min(PUNCH_PLAYERS_MAX, props.playersIn))}/${PUNCH_PLAYERS_MAX}`}
        fontSize={textPx(20)}
        color={anyone ? GOLD : MUTED}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}
      />
    </UiEntity>
  )
}

const HELP_OFF_W = 118
const HELP_OFF_RIGHT = SEATS_CHIP_RIGHT + SEATS_CHIP_W + MUTE_ICON_GAP

/** Re-enable after DON'T SHOW AGAIN. Only drawn while prompts are off. */
function RescueHelpOffChip() {
  if (!punchRescuePromptsMuted()) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { right: px(HELP_OFF_RIGHT), top: px(SEATS_CHIP_TOP) },
        width: px(HELP_OFF_W),
        height: px(SEATS_CHIP_H),
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: Math.max(1, px(2)),
        borderColor: MUTED,
        borderRadius: cornerRadius(UI.radius.pill, px(SEATS_CHIP_H)),
        pointerFilter: 'block'
      }}
      uiBackground={{ color: punchAlpha(PUNCH_UI.ink, 0.72) }}
      onMouseDown={() => setPunchRescuePromptsMuted(false)}
    >
      <Label
        value="HELP OFF"
        fontSize={textPx(13)}
        color={MUTED}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}
      />
    </UiEntity>
  )
}


/**
 * ‼️THE SAVE TAKE IS CHROME, NOT THE SIGHT PICTURE.
 *
 * Owner, 2026-09-11: after a save, "Swissverse point / Swiss Mob" sat in the
 * middle of the screen and fought the aiming hoop. The rail is a full-width
 * centred column (`alignItems: 'center'`), so a RAIL_MUST chip under the score
 * plate is drawn through the bag. The number still has to be visible while the
 * rescued player keeps scoring — it just has to live with SCORES, on the left
 * edge, never at `left: '50%'`.
 */
function SaveRunChip(props: { state: ReturnType<typeof punchMachineHud> }) {
  const state = props.state
  if (!state.saveRunVisible || (state.saveRunPoints ?? 0) <= 0) return null
  if (state.summaryMsLeft > 0) return null
  if (state.rescueLabel) return null
  if (state.scoreboardOpen) return null
  const compact = isCompact()
  const frame = hudFrame()
  const line = punchSaveRunLine({
    helperName: state.saveRunHelperName || '',
    keptName: state.saveRunKeptName || '',
    points: state.saveRunPoints ?? 0,
    people: state.saveRunPeople,
    mine: !!state.saveRunMine,
  })
  if (!line) return null
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: frame.left, top: px(SCORES_TOP) },
        width: px(compact ? 300 : 380),
        height: px(compact ? 32 : 38),
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        pointerFilter: 'none'
      }}
    >
      <SvChip
        label={line}
        color={PUNCH_UI.ink}
        skin={{ color: UI.gold, radius: UI.radius.pill }}
        fontSize={compact ? 14 : 16}
      />
    </UiEntity>
  )
}

const ADMIN_CHIP_W = 196
const ADMIN_CHIP_H = 34
/** Under the mute icon, on the same right edge, clear of the queue button. */
const ADMIN_CHIP_TOP = MUTE_ICON_TOP + MUTE_ICON + 10
const ADMIN_CHIP_BOTTOM = ADMIN_CHIP_TOP + ADMIN_CHIP_H

/**
 * ‼️THE SOUND POPOVER OPENS AWAY FROM THE RAIL, NOT DOWN IT.
 *
 * It used to be right-aligned with the icon, which reads as the obvious thing —
 * a menu hanging under the control that opens it — and put a 250 x 124 px panel
 * squarely on top of SCORES and the reload column (owner, 2026-09-09, from a
 * phone screenshot: the mixer sitting under the SCORES button, both drawn, one
 * on top of the other). The column below the corner row is NOT free space: it
 * is the whole vertical rail (SCORES → RELOAD → the disc's ceiling), measured
 * from `QUEUE_BOTTOM` down, and a transient panel cannot push a persistent one
 * out of its way.
 *
 * So the menu opens LEFT of the icon instead — its right edge sits against the
 * icon's left edge — into the one part of the top edge nothing else claims. It
 * is anchored to the same corner constants, so icon and menu still cannot
 * drift apart, and it now clears the rail by construction rather than by any
 * number staying small enough.
 *
 * ‼️AND IT DROPS BELOW THE ADMIN CHIP WHEN THAT CHIP EXISTS. The chip hangs off
 * the same corner on the same side; for the wallets that can see it, opening
 * the mixer would otherwise bury the one control this game ships for testing.
 * Nobody else pays for the row — `punchAdminVisible()` is false for them and
 * the menu sits straight under the icon.
 */
const MUTE_MENU_DROP = 8
const MUTE_MENU_RIGHT = MUTE_ICON_RIGHT + MUTE_ICON + MUTE_MENU_DROP
function muteMenuTop(): number {
  const under = punchAdminVisible() ? ADMIN_CHIP_BOTTOM : MUTE_ICON_TOP + MUTE_ICON
  return under + MUTE_MENU_DROP
}

/**
 * ‼️THE ONE CONTROL IN THIS GAME THAT MOST PEOPLE NEVER SEE.
 *
 * `punchAdminVisible()` is false for every wallet that is not on the director's
 * `adminIds` list, so this returns null before it draws anything — there is no
 * greyed-out state, no tooltip, nothing to find. An empty list, which is what a
 * scene ships with, means it does not exist for anyone in the room.
 *
 * What it is FOR: the Fumble Rescue opens on somebody else's last punch, under
 * 900, on a live streak, with a spectator watching and a save unspent. Nobody
 * can arrange that, which is why the observer half of the game kept shipping
 * untested. Armed, the next fumble opens the window regardless.
 *
 * ‼️READ THE ARM OFF THE SNAPSHOT, NEVER OFF A LOCAL BOOLEAN. The press has to
 * cross the wire and be accepted by the coordinator before it means anything;
 * a chip that lit on its own press would say ARMED for a press that was
 * dropped, which is the one lie a test button must not tell.
 */
function AdminChip() {
  if (!punchAdminVisible()) return null
  const armed = punchAdminRescueArmed()
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { right: px(MUTE_ICON_RIGHT), top: px(ADMIN_CHIP_TOP) },
        width: px(ADMIN_CHIP_W),
        height: px(ADMIN_CHIP_H),
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: Math.max(1, px(2)),
        borderColor: armed ? GOLD : MUTED,
        borderRadius: cornerRadius(UI.radius.pill, px(ADMIN_CHIP_H)),
        pointerFilter: 'block'
      }}
      uiBackground={{ color: armed ? punchAlpha(PUNCH_UI.gold, 0.22) : punchAlpha(PUNCH_UI.ink, 0.62) }}
      onMouseDown={() => { punchAdminToggleRescue() }}
    >
      <Label
        value={armed ? 'RESCUE ARMED · TAP TO CANCEL' : 'ADMIN · FORCE RESCUE'}
        fontSize={textPx(15)}
        color={armed ? GOLD : MUTED}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: '100%', pointerFilter: 'none' }}
      />
    </UiEntity>
  )
}

function MutePanel() {
  const silent = punchSfxAllMuted()
  // The plate reads the ROOM, not the last switch pressed: struck through only
  // when there is genuinely nothing left to hear.
  const audible = punchSfxAnyAudible()
  const size = px(MUTE_ICON)
  const strikeInset = px(9)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        // The corner row: same line as the queue button, clear of its pulse.
        position: { right: px(MUTE_ICON_RIGHT), top: px(MUTE_ICON_TOP) },
        width: size,
        height: size,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: Math.max(1, px(2)),
        borderColor: audible ? GOLD : MUTED,
        borderRadius: cornerRadius(UI.radius.pill, size),
        pointerFilter: 'block'
      }}
      uiBackground={{ color: audible ? punchAlpha(PUNCH_UI.gold, 0.18) : punchAlpha(PUNCH_UI.ink, 0.55) }}
      onMouseDown={() => { mutePanelOpen = !mutePanelOpen }}
    >
      <Label
        value="♪"
        fontSize={textPx(26)}
        color={audible ? GOLD : MUTED}
        textAlign="middle-center"
        uiTransform={{ width: size, height: size, pointerFilter: 'none' }}
      />
      {silent ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: strikeInset, top: Math.round(size / 2) - px(2) },
            width: size - strikeInset * 2,
            height: Math.max(2, px(3)),
            pointerFilter: 'none'
          }}
          uiBackground={{ color: MUTED }}
        />
      ) : null}
    </UiEntity>
  )
}

/**
 * The menu itself, drawn as a SIBLING of the icon rather than a child of it.
 *
 * ‼️A 44 px BOX CANNOT BE TRUSTED TO SHOW A 250 px PANEL HANGING OUT OF IT.
 * The obvious shape is to nest this inside `MutePanel` and position it under the
 * icon, and it may well render — but it depends entirely on the renderer not
 * clipping a child that is six times its parent's width and sits entirely
 * outside its parent's box. That is not a bet worth taking on the one control
 * the owner asked for by name. Anchored to the same corner constants instead, so
 * the icon and its menu still cannot drift apart.
 */
function MuteMenu() {
  if (!mutePanelOpen) return null
  const voicesOn = !punchVoicesMuted()
  const gameOn = !punchGameSoundsMuted()
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        // Opens INWARD off the icon's left edge and drops clear of the admin
        // chip - never over the SCORES / reload rail. See MUTE_MENU_RIGHT.
        position: {
          right: px(MUTE_MENU_RIGHT),
          top: px(muteMenuTop())
        },
        width: px(MUTE_MENU_W),
        height: px(MUTE_MENU_PAD * 2 + MUTE_MENU_ROW * 2 + MUTE_MENU_GAP),
        borderWidth: Math.max(1, px(2)),
        borderColor: punchAlpha(PUNCH_UI.gold, 0.5),
        borderRadius: cornerRadius(UI.radius.lg),
        pointerFilter: 'block'
      }}
      uiBackground={{ color: punchAlpha(PUNCH_UI.ink, 0.94) }}
    >
      <MuteMenuRow
        label="VOICES"
        on={voicesOn}
        top={px(MUTE_MENU_PAD)}
        onPress={() => setPunchVoicesMuted(voicesOn)}
      />
      <MuteMenuRow
        label="GAME SOUNDS"
        on={gameOn}
        top={px(MUTE_MENU_PAD + MUTE_MENU_ROW + MUTE_MENU_GAP)}
        onPress={() => setPunchGameSoundsMuted(gameOn)}
      />
    </UiEntity>
  )
}

/**
 * THE RANKED BOARD IS FLAT, AND THAT IS THE ENTIRE POINT OF THIS COMPONENT.
 *
 * The list used to be three TextShapes painted across the arena's arc - a 16 m
 * HALF CYLINDER. Text on a cylinder follows the cylinder: the middle of a row
 * faces the crowd and both ends curl away from it, so every line lost its name
 * at one edge and its score at the other, and at the size needed to read from
 * the fence it simply ran off the screen. The arc is good at a face, a colour
 * and motion; it was never going to be good at a table.
 *
 * So the board is a HUD panel behind a button. Reading a ranking is something
 * the player CHOOSES to do between rounds - it is not an announcement the arena
 * makes over somebody's wind-up - and a flat panel is the only surface in this
 * scene where a column of numbers stays a column.
 */
/**
 * ‼️THE FRAME IS CODE-DRAWN. THE PAINTED BOARD IS GONE, AND SO IS THE BLUE.
 *
 * Owner, 2026-09-05: *"the scoreboard still has a problem with TONIGHT and ALL
 * TIME and the SCOREBOARD title at the top — they don't fit this design at all.
 * And I'm starting to not like the design myself because it's difficult to
 * implement. Move over to something simpler without the PNG. We can still use
 * the white maybe, but I'm just not a big fan of the blue colour any more. It'd
 * be nice to have kept some clouds, or at least use some kind of procedurally
 * generated background that looks like cloud."*
 *
 * What was here: a 1536x1024 blue winter frame with a gold star crown, cut into
 * a top cap, one row pill and a bottom cap, with every inset stored as a
 * measured FRACTION of the export. It was a good trick and it was the wrong
 * shape of problem — a title and two tabs have to live in a well that was drawn
 * before either of them existed, so any change to the type meant re-exporting
 * art, and the controls never sat right inside it.
 *
 * What replaces it owes nothing to a file:
 *
 *   INK + HAIRLINE  the same near-black panel and 16% white edge as the result
 *                   card, so the board finally reads as part of THIS HUD rather
 *                   than as a picture pasted over it.
 *   WHITE AND GOLD  white type at three weights, gold for rank 1 only. No blue
 *                   anywhere, and no fourth colour to make it look cheap.
 *   CLOUDS, DRAWN   `CloudBand` is a row of overlapping circles — border-radius
 *                   pill on square boxes — along the top and bottom edges, so
 *                   the panel keeps its soft skyline with no texture to load,
 *                   no aspect ratio to respect, and nothing to re-export.
 *
 * Because nothing is a fixed image any more, the layout is free: rows, type and
 * padding are plain numbers, the header and the tabs are laid out like every
 * other control in this file, and changing the row count changes one constant.
 */
const SCOREBOARD_ROWS = 10
const SCOREBOARD_W = 720
const SCOREBOARD_ROW_H = 52
/** The avatar face beside a name — the Explorer's own portrait, via avatarTexture. */
const SCOREBOARD_FACE = 38
const SCOREBOARD_ROW_GAP = 6
/** Reserved up front: the tabs must not move under a finger as rows arrive. */
const SCOREBOARD_LIST_H = SCOREBOARD_ROWS * (SCOREBOARD_ROW_H + SCOREBOARD_ROW_GAP)
/**
 * ‼️THE PHONE GETS A SHORTER ROW, BECAUSE TEN OF THEM HAVE TO FIT ON ONE.
 *
 * The virtual screen a handset draws into is 1600x720 design pixels against a
 * desktop's 1920x1080 — the width is nearly the same and the HEIGHT is two
 * thirds. Ten 46 px rows plus a title, two tabs and a footer is ~690 px, which
 * is the whole of a phone screen and none of the game behind it. (The painted
 * board had exactly this problem and hid it: its height was its own aspect
 * ratio, so it simply overflowed.) One shorter row and a tighter gap bring the
 * same ten names back inside 560.
 */
const SCOREBOARD_ROW_H_COMPACT = 34
const SCOREBOARD_ROW_GAP_COMPACT = 4
const SCOREBOARD_PAD = 20
/** The frame's own hairline, on both sides of the panel it wraps. */
const SCOREBOARD_EDGE_PX = 2
/** The panel's own ground and its hairline — the result card's, deliberately. */
const BOARD_EDGE = PUNCH_UI.brass
/** Opaque instrument plates keep avatars and world nametags behind the board. */
const BOARD_ROW_BG = PUNCH_UI.panelRaised
const BOARD_ROW_LEAD_BG = PUNCH_UI.inkSoft
/** Type: one ink, three weights, exactly like the breakdown card. */
const BOARD_TEXT = PUNCH_UI.ivory
const BOARD_TEXT_SOFT = PUNCH_UI.muted
/**
 * The unselected tab and its pressed state. `UI.track` is near-transparent ink,
 * which over this panel's own ink is an invisible control — a lifted white
 * plate is the only thing that reads on a dark ground without adding a hue.
 */
const SLATE = PUNCH_UI.panelRaised
const SLATE_HOT = PUNCH_UI.petrol

/**
 * THE CLOUDS, WITHOUT A CLOUD. One row of circles, each an empty box with a
 * pill radius, overlapping their neighbours so the outline reads as a skyline
 * rather than as a row of dots. `flip` hangs them under the panel instead of
 * over it, which is the whole of the bottom band.
 *
 * They are drawn BEFORE the content in every parent that uses them: this kit
 * has no z-index, so paint order is sibling order, and a puff drawn afterwards
 * would sit on top of the type.
 */
const CLOUD_PUFFS = [0.34, 0.62, 0.46, 0.8, 0.44, 0.66, 0.36]

function CloudBand(props: { width: number; height: number; flip?: boolean; alpha: number }) {
  const step = props.width / (CLOUD_PUFFS.length - 1)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: props.flip
          ? { bottom: -Math.round(props.height * 0.42), left: 0 }
          : { top: -Math.round(props.height * 0.42), left: 0 },
        width: props.width,
        height: props.height,
        pointerFilter: 'none'
      }}
    >
      {CLOUD_PUFFS.map((scale, index) => {
        const size = Math.round(props.height * (0.9 + scale))
        return (
          <UiEntity
            key={`puff-${props.flip ? 'b' : 't'}-${index}`}
            uiTransform={{
              positionType: 'absolute',
              position: {
                left: Math.round(index * step - size / 2),
                top: Math.round(props.height - size * (props.flip ? 0.32 : 0.68))
              },
              width: size,
              height: size,
              borderRadius: cornerRadius(UI.radius.pill, size),
              pointerFilter: 'none'
            }}
            uiBackground={{ color: punchAlpha(PUNCH_UI.ivory, props.alpha) }}
          />
        )
      })}
    </UiEntity>
  )
}

/** A carved square portrait. `flush` fills a parent card's left edge —
 * same house radius, no pad, no second brass ring. */
function PlayerCard(props: { userId?: string; name: string; size: number; caption?: boolean; inset?: boolean; flush?: boolean }) {
  const hasFace = !!props.userId && props.userId.startsWith('0x')
  const ring = props.flush || props.inset ? 0 : Math.max(2, Math.round(props.size * 0.04))
  const radius = props.flush
    ? (cornerRadius(UI.radius.md) ?? Math.max(8, Math.round(props.size * 0.08)))
    : Math.max(8, Math.round(props.size * 0.1))
  const plateH = props.caption ? Math.max(22, Math.round(props.size * 0.2)) : 0
  const shown = (props.name || '?').replace(/^THE /, '').slice(0, 12).toUpperCase()
  const initial = (props.name || '?').slice(0, 1).toUpperCase()
  return (
    <UiEntity
      uiTransform={{
        width: props.size,
        height: props.flush ? '100%' : props.size,
        borderRadius: radius,
        borderWidth: ring,
        borderColor: ring ? PUNCH_UI.brass : Color4.create(0, 0, 0, 0),
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
      uiBackground={{ color: PUNCH_UI.petrol }}
    >
      <UiEntity
        uiTransform={{
          width: '100%',
          height: '100%',
          borderRadius: Math.max(4, radius - 2),
          justifyContent: 'center',
          alignItems: 'center',
          pointerFilter: 'none'
        }}
        uiBackground={hasFace
          ? { avatarTexture: { userId: props.userId! }, textureMode: 'stretch', color: WHITE }
          : { color: punchAlpha(WHITE, 0.12) }}
      >
        {hasFace ? null : (
          <Label
            value={initial}
            fontSize={Math.round(props.size * 0.42)}
            color={WHITE}
            textAlign="middle-center"
            uiTransform={{ width: '100%', height: '100%' }}
          />
        )}
      </UiEntity>
      {props.caption ? (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: 0, bottom: 0 },
            width: '100%',
            height: plateH,
            justifyContent: 'center',
            alignItems: 'center',
            pointerFilter: 'none'
          }}
          uiBackground={{ color: punchAlpha(PUNCH_UI.ink, 0.9) }}
        >
          <Label
            value={shown}
            fontSize={Math.max(11, Math.round(props.size * 0.12))}
            color={GOLD}
            textAlign="middle-center"
            textWrap="nowrap"
            uiTransform={{ width: '100%', height: '100%' }}
          />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

/** The 0x portrait, or an initial disc. Scoreboard rows stay a circle so a
 * list of ten still lines up; the result cards use `PlayerCard`. */
function PlayerMark(props: { userId?: string; name: string; size: number; fontSize: number }) {
  const hasFace = !!props.userId && props.userId.startsWith('0x')
  if (hasFace) {
    return (
      <UiEntity
        uiTransform={{ width: props.size, height: props.size, borderRadius: Math.round(props.size / 2), pointerFilter: 'none' }}
        uiBackground={{ avatarTexture: { userId: props.userId! }, textureMode: 'stretch', color: WHITE }}
      />
    )
  }
  return (
    <UiEntity
      uiTransform={{
        width: props.size,
        height: props.size,
        borderRadius: Math.round(props.size / 2),
        justifyContent: 'center',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
      uiBackground={{ color: Color4.create(1, 1, 1, 0.14) }}
    >
      <Label
        value={(props.name || '?').slice(0, 1).toUpperCase()}
        fontSize={props.fontSize}
        color={BOARD_TEXT}
        textAlign="middle-center"
        uiTransform={{ width: '100%', height: '100%' }}
      />
    </UiEntity>
  )
}

/** One ranked line: place, who, how much. Gold is rank, not decoration. */
// `key` is declared rather than inherited: this kit's JSX types put it on the
// props of a function component, not on a base element type.
function ScoreRow(props: {
  supporters?: Array<{userId?: string; name:string;points:number;saves:number;unlocked?:number;lastSavedName?:string;lastSavedUserId?: string}>
  /** A fixed subtitle — the SAVES board names who they last kept in. */
  detail?: string
  /** The rescued player's address, so SAVES can show both faces. */
  keptUserId?: string
  keptName?: string
  /** This row is the local player. Cyan, so it is findable in a list of ten. */
  mine?: boolean
  key?: string
  /** The player's address, so the row can wear their face. Bots have none. */
  userId?: string
  rank: number
  name: string
  score: number
  width: number
  rowH: number
  gap: number
  fontSize: number
}) {
  const leader = props.rank === 1
  // ‼️SAVES HAS ITS OWN TAB. A save story on ALL TIME is why the owner looked
  // for this under the puncher's row. Boosters still rotate here; saviors don't.
  const boosters = props.supporters?.filter((row) => !row.saves) ?? []
  const supporterIndex = boosters.length ? Math.floor(Date.now()/3000) % boosters.length : 0
  const supporter = boosters[supporterIndex]
  const detail = props.detail || (supporter
    ? `TEAM ${supporterIndex+1}/${boosters.length}: ${supporter.name.slice(0,14)} +${supporter.points}`
    : '')
  const empty = props.score < 0
  const pad = px(UI.space.md)
  const rankW = Math.round(props.width * 0.08)
  const scoreW = Math.round(props.width * 0.22)
  // ‼️A FACE, LIKE EVERYWHERE ELSE IN DECENTRALAND (owner, 2026-09-06: "why not
  // show it here as well"). `avatarTexture` is the Explorer's own portrait of
  // that address; a bot has no address and gets no circle rather than a blank.
  const hasFace = !empty && !!props.userId && props.userId.startsWith('0x')
  const face = px(SCOREBOARD_FACE)
  // A regular has no address and no portrait: it wears its initial on a dark
  // disc instead, so every filled row carries a mark and the column lines up.
  const hasMark = !empty && !hasFace
  const faceW = hasFace || hasMark ? face + px(10) : 0
  const teamFace = px(Math.round(SCOREBOARD_FACE * 0.55))
  const sideUserId = props.keptUserId || supporter?.userId
  const sideName = props.keptName || supporter?.name || '?'
  return (
    <UiEntity
      uiTransform={{
        width: props.width,
        height: px(props.rowH),
        margin: { bottom: px(props.gap) },
        flexDirection: 'row',
        alignItems: 'center',
        padding: { left: pad, right: pad },
        borderRadius: cornerRadius(UI.radius.md),
        pointerFilter: 'none'
      }}
      uiBackground={{ color: leader && !empty ? BOARD_ROW_LEAD_BG : BOARD_ROW_BG }}
    >
      <Label
        value={String(props.rank)}
        fontSize={px(props.fontSize)}
        color={leader && !empty ? GOLD : BOARD_TEXT_SOFT}
        textAlign="middle-left"
        uiTransform={{ width: rankW, height: '100%' }}
      />
      {hasFace || hasMark ? (
        <UiEntity uiTransform={{ width: face, height: face, margin: { right: px(10) }, pointerFilter: 'none' }}>
          <PlayerMark userId={props.userId} name={props.name} size={face} fontSize={px(props.fontSize)} />
        </UiEntity>
      ) : null}
      <UiEntity uiTransform={{width:props.width-rankW-scoreW-faceW-pad*2,height:'100%',flexDirection:'column',justifyContent:'center'}}>
        <Label value={props.name} fontSize={px(detail ? 15 : props.fontSize)} color={leader ? GOLD : props.mine ? CYAN : BOARD_TEXT} textAlign="middle-left" uiTransform={{width:'100%',height:detail ? '50%' : '100%'}} />
        {detail ? (
          <UiEntity uiTransform={{ width: '100%', height: '50%', flexDirection: 'row', alignItems: 'center', pointerFilter: 'none' }}>
            {props.keptName || supporter ? (
              <UiEntity uiTransform={{ width: teamFace, height: teamFace, margin: { right: px(6) }, pointerFilter: 'none' }}>
                <PlayerMark userId={sideUserId} name={sideName} size={teamFace} fontSize={px(11)} />
              </UiEntity>
            ) : null}
            <Label value={detail}
              fontSize={px(11)} color={props.detail ? GOLD : CYAN} textAlign="middle-left" uiTransform={{ width: '100%', height: '100%' }} />
          </UiEntity>
        ) : null}
      </UiEntity>
      <Label
        value={empty ? '—' : props.score.toLocaleString()}
        fontSize={px(props.fontSize + 2)}
        color={leader ? GOLD : BOARD_TEXT}
        textAlign="middle-right"
        uiTransform={{ width: scoreW, height: '100%' }}
      />
    </UiEntity>
  )
}

/** The button that opens it. Right rail, under the sound mixer. */
function ScoresButton(props: { open: boolean }) {
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: {
          right: Math.max(16, Math.round(FALL_CHIP_RIGHT * uiScale())),
          top: px(SCORES_TOP)
        },
        pointerFilter: 'none'
      }}
    >
      <SvButton
        id="punch-scores"
        label={props.open ? 'CLOSE SCORES' : 'SCORES'}
        width={SCORES_BTN_W}
        height={SCORES_BTN_H}
        minPx={46}
        fontSize={20}
        color={props.open ? PUNCH_UI.ink : UI.white}
        // Outlined when shut, filled when open - the same control in two
        // states, so nobody hunts for a second button to close the panel with.
        skin={
          props.open
            ? { color: UI.cyan, pressedColor: CYAN_HOT, radius: UI.radius.pill }
            : { color: SLATE, pressedColor: SLATE_HOT, radius: UI.radius.pill }
        }
        onDown={togglePunchScoreboard}
      />
    </UiEntity>
  )
}

/** One of the two tabs. Filled is the list you are looking at. */
function ScoreTab(props: { label: string; on: boolean; width: number; page: number }) {
  return (
    <SvButton
      id={`punch-scores-tab-${props.page}`}
      label={props.label}
      width={props.width}
      height={52}
      minPx={46}
      fontSize={16}
      color={WHITE}
      skin={
        props.on
          ? { color: PUNCH_UI.red, pressedColor: PUNCH_UI.redHot, radius: UI.radius.md }
          : { color: PUNCH_UI.panelRaised, pressedColor: PUNCH_UI.petrol, radius: UI.radius.md }
      }
      onDown={() => setPunchScoreboardPage(props.page)}
      position={{ margin: { right: px(UI.space.sm) } }}
    />
  )
}

function ScoreboardPanel(props: { state: ReturnType<typeof punchMachineHud> }) {
  const { state } = props
  const canvas = canvasSize()
  const compact = hudFrame().compact
  const width = Math.min(px(SCOREBOARD_W), Math.max(px(340), canvas.width - px(48)))
  const inner = width - px(SCOREBOARD_EDGE_PX) * 2 - px(SCOREBOARD_PAD) * 2
  const rowH = compact ? SCOREBOARD_ROW_H_COMPACT : SCOREBOARD_ROW_H
  const gap = compact ? SCOREBOARD_ROW_GAP_COMPACT : SCOREBOARD_ROW_GAP
  const listH = compact ? SCOREBOARD_ROWS * (rowH + gap) : SCOREBOARD_LIST_H
  const rowFont = compact ? 17 : 20
  const tonight = state.scoreboardPage === 0
  const saviors = state.scoreboardPage === 2
  const punchEntries = (tonight ? state.leaderboard : state.allTime).slice(0, SCOREBOARD_ROWS)
  const saviorEntries = saviors ? state.saviors.slice(0, SCOREBOARD_ROWS) : []
  const tabW = Math.round((inner - px(UI.space.sm) * 2) / 3)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        // The BACKDROP never blocks. A full-screen catcher here would eat the
        // look and the move the player is still making behind the panel.
        pointerFilter: 'none'
      }}
    >
      {/* THE HAIRLINE, as a frame entity with the panel padded inside it — the
          same construction as the result card, because a border on a dark panel
          over a dark scene is the difference between a card and a smudge. */}
      <UiEntity
        uiTransform={{
          width,
          flexDirection: 'column',
          alignItems: 'center',
          padding: px(SCOREBOARD_EDGE_PX),
          borderRadius: cornerRadius(UI.radius.lg),
          pointerFilter: 'block'
        }}
        uiBackground={{ color: BOARD_EDGE }}
      >
        <UiEntity
          uiTransform={{
            width: '100%',
            flexDirection: 'column',
            alignItems: 'center',
            padding: {
              top: px(SCOREBOARD_PAD),
              bottom: px(SCOREBOARD_PAD),
              left: px(SCOREBOARD_PAD),
              right: px(SCOREBOARD_PAD)
            },
            borderRadius: cornerRadius(UI.radius.lg),
            pointerFilter: 'none'
          }}
          uiBackground={{ color: INK }}
        >
          {/* TITLE AND THE WAY OUT. One row, laid out — not fitted into a well
              somebody painted before the words existed. */}
          <UiEntity
            uiTransform={{
              width: inner,
              height: px(46),
              flexDirection: 'row',
              alignItems: 'center',
              pointerFilter: 'none'
            }}
          >
            <Label
              value="SCOREBOARD"
              fontSize={px(26)}
              color={BOARD_TEXT}
              textAlign="middle-left"
              uiTransform={{ width: inner - px(52), height: '100%' }}
            />
            <SvButton
              id="punch-scores-close"
              label="X"
              width={44}
              height={44}
              minPx={40}
              fontSize={22}
              color={UI.white}
              skin={{ color: SLATE, pressedColor: SLATE_HOT, radius: UI.radius.pill }}
              onDown={togglePunchScoreboard}
            />
          </UiEntity>
          {/* Air under the title. The X is a 44px pill inside a 46px row, so
              the tabs below it were sitting two pixels off the close button —
              owner, 2026-09-09: "the X is almost touching the ALL TIME button".
              A spacer, not a taller row: the row's height is what centres the
              title against the pill. */}
          <UiEntity uiTransform={{ width: inner, height: px(compact ? 8 : 14), pointerFilter: 'none' }} />
          <UiEntity
            uiTransform={{
              width: inner,
              height: px(52),
              flexDirection: 'row',
              alignItems: 'center',
              pointerFilter: 'none'
            }}
          >
            <ScoreTab label="TONIGHT" on={tonight} width={tabW} page={0} />
            <ScoreTab label="ALL TIME" on={state.scoreboardPage === 1} width={tabW} page={1} />
            <ScoreTab label="SAVES" on={saviors} width={tabW} page={2} />
          </UiEntity>
          {/* Air under the tabs: they were touching rank 1 (owner, 2026-09-06). */}
          <UiEntity uiTransform={{ width: inner, height: px(14), pointerFilter: 'none' }} />

          {/* THE ROWS - one plate per rank, always SCOREBOARD_ROWS of them, in a
              box whose height is reserved up front. An unclaimed rank still
              draws its plate, so the board keeps its shape and the tabs above it
              never move as names arrive. */}
          <UiEntity
            uiTransform={{
              width: inner,
              height: px(listH),
              flexDirection: 'column',
              pointerFilter: 'none'
            }}
          >
            {Array.from({ length: SCOREBOARD_ROWS }, (_unused, index) => {
              if (saviors) {
                const entry = saviorEntries[index]
                return (
                  <ScoreRow
                    key={'sb-s-' + index}
                    rank={index + 1}
                    name={entry ? entry.name.slice(0, 16).toUpperCase() : index === saviorEntries.length ? 'YOUR NAME HERE' : ''}
                    userId={entry?.userId}
                    mine={!!entry && entry.userId === state.localUserId}
                    detail={entry ? punchSaviorLine(entry) : undefined}
                    keptUserId={entry?.lastSavedUserId}
                    keptName={entry?.lastSavedName}
                    score={entry ? punchSaviorScore(entry) : -1}
                    width={inner}
                    rowH={rowH}
                    gap={gap}
                    fontSize={rowFont}
                  />
                )
              }
              const entry = punchEntries[index]
              return (
                <ScoreRow
                  key={'sb-' + (tonight ? 'n' : 'a') + '-' + index}
                  rank={index + 1}
                  name={entry ? entry.name.slice(0, 16).toUpperCase() : index === punchEntries.length ? 'YOUR NAME HERE' : ''}
                  userId={entry?.userId}
                  mine={!!entry && entry.userId === state.localUserId}
                  supporters={entry?.supporters}
                  score={entry ? entry.score : -1}
                  width={inner}
                  rowH={rowH}
                  gap={gap}
                  fontSize={rowFont}
                />
              )
            })}
          </UiEntity>

          {/* What the column actually means, under the rows it describes. */}
          <Label
            // The two empties mean different things and say so: nobody has
            // swung yet, versus this venue keeps no history at all. ALL TIME
            // now folds tonight in (see mergePunchBoards), so it is only ever
            // empty on a quiet night — and a venue with no store says so under
            // the rows it CAN show, rather than pretending they are saved.
            value={punchScoreboardCaption({
              tonight,
              rows: saviors ? saviorEntries.length : punchEntries.length,
              saved: state.allTimeSaved,
              saviors
            })}
            fontSize={px(16)}
            color={BOARD_TEXT_SOFT}
            textAlign="middle-center"
            uiTransform={{ width: inner, height: px(30) }}
          />
          {/* THE BOOSTERS' OWN BOARD: tonight's circle, by summed circle score. */}
          {false && tonight && state.circleBoard.length > 0 ? (
            <Label
              value={'BEST BOOSTERS · ' + state.circleBoard.map((row, i) => `${i + 1}. ${row.name.slice(0, 10).toUpperCase()} ${row.circle}`).join('   ')}
              fontSize={px(15)}
              color={GOLD}
              textAlign="middle-center"
              uiTransform={{ width: inner, height: px(26) }}
            />
          ) : null}
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

export function PunchMachineRoot() {
  const state = punchMachineHud()
  if (!state.visible) return null
  // The way back up is the one thing that must never sit under a notch.
  if (state.fallPrompt) {
    // Airborne, it is ALWAYS the chip: the full cloud covers the middle of the
    // screen, which is exactly what a falling player is steering by. Landing is
    // what earns the panel, and minimising it stays their own choice after that.
    //
    // Both halves of that are LATCHED on the plugin side — the landing sticks
    // for the rest of the drop, and `fallMinimized` sticks until the player is
    // back up top — so this line can never oscillate frame to frame.
    const chip = state.fallMinimized || state.fallAirborne
    return <SafeScreen>{chip ? <FallChip /> : <FallPanel />}</SafeScreen>
  }

  // `phase` is the ROUND's phase, shared by everyone on the deck — so a charge
  // is 'charging' on every screen in the world, not just the puncher's. The aim
  // instruments belong to whoever is actually holding the bag: a spectator gets
  // the outcome, the score and the crowd, and none of the controls. Drawing the
  // reticle over everybody put two big circles across the middle of the screen
  // for someone who could not act on them.
  const charging = state.phase === 'charging' && state.isMyTurn
  // Standing at the machine is NOT playing. The rings are the aiming instrument
  // and they belong to the punch itself — floating them over the deck on
  // approach announced a mechanic nobody had asked for yet. One line of text
  // teaches it; the circles arrive when the fist is actually charging.
  // Only the player whose turn it is gets taught the control. Everyone else on
  // the deck is an audience, and "HOLD THE BAG TO CHARGE" read to them as an
  // invitation they could not accept.
  const approaching = state.phase === 'ready' && state.facingMachine && state.isMyTurn
  const aiming = false
  /**
   * ‼️THE PUNCH IS A SHOW, AND THE AUDIENCE GETS THE SHOW.
   *
   * Owner, 2026-09-09, from a phone: *"when another player punches, spectators
   * see the physical hit and some outcomes but miss most of the player's game
   * sequence. Spectators should at minimum see the same score progression,
   * counting, announcements, effects and major game events that the active
   * player sees. Watching should include the full theater of the punch rather
   * than only the final result."*
   *
   * This read `&& state.isMyTurn`, written when the reveal was a 120 px number
   * counted up over the MIDDLE of the screen — a fair objection to a layout
   * that no longer exists. The count is a rail row at the top of the column
   * now, and the ledger is a narrow card hard against the left edge (see
   * `ScoreReveal`); neither is over the machine a spectator is watching, on
   * either canvas.
   *
   * ‼️WHAT STAYS MINE. The shot clock is still gated below, and deliberately:
   * it is a full-screen DIAL centred on the thing a spectator came to look at,
   * and it counts down an input only the puncher has. Same for the reticle, the
   * glove and the screen crack — those are controls and body, not readouts.
   * The line is READOUT versus INSTRUMENT, not mine versus theirs.
   */
  const counting = state.phase === 'scoring' || state.phase === 'cooldown'
  // ...and it stays while the machine is HOLDING the puncher's card past its
  // phase — see `PUNCH_CARD_HOLD_MS`. The number is the live count's; the
  // held card carries its own FINAL and draws without one.
  const scoring = counting || state.cardHeld
  /**
   * ‼️THE SHELF GOES AWAY WHILE THE BAG IS YOURS.
   *
   * Owner, 2026-09-04: "when I'm hitting I don't want to see the widget for
   * boosting, right now it's sitting on top of my character, the worst possible
   * spot". `focusReadOnly` is the runtime saying exactly that — you are the one
   * being boosted, so this control is not yours to work. `ChannelPads` has
   * always self-gated on it; the shelf did not, so a spectator control stayed
   * pinned over the puncher's own avatar for the whole of their turn.
   *
   * Nothing is lost: `N PLAYERS ARE BOOSTING` is still on the rail while you
   * punch, and `ScoreReveal` prints who gave what the moment the punch lands.
   */
  /* ‼️AND THE PILL FOLLOWS THE SAME SWITCH. This was the literal `false` that
     stood for the whole removal. It is now the runtime's own answer: the HUD
     only ever sees a non-zero `focusVisible` when `focusEnabled` is on, because
     `updateSpectatorFocus` returns before writing it otherwise. One flag, read
     in one place, rather than a second copy of the decision here. */
  const showFocusPill = state.focusVisible && !state.focusReadOnly
  return (
    <SafeScreen>
      <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', pointerFilter: 'none' }}>
      {/* `HOLD THE BAG TO CHARGE` used to float here, at 62% of the screen,
          with nothing around it to connect it to anything. It is an instruction
          for ONE control, so it now rides that control — see `GloveCaption`,
          drawn under the disc itself. Owner, 2026-09-03: "in the beginning I
          didn't understand why it says hold". It reads as an instruction now
          because it is attached to the thing it instructs. */}
      {state.isMyTurn && state.reload01 < 1 ? <ReloadBar reload01={state.reload01} /> : null}
      {/* YOUR round only. The card is a full-screen cloud panel, and it was
          firing for every round on the island — an NPC's total taking over the
          middle of a spectator's view while they were trying to watch the
          machine. What somebody else scored is already on the cabinet; it does
          not need to be in your face as well. */}
      {state.summaryMsLeft > 0 && !!state.activeName ? <RoundOverCard state={state} /> : null}
      {/* The shot clock takes the middle of the screen once it matters. MINE
          only, and suppressed while the round-over card is up — that card is
          already the whole screen and the turn it belongs to is over. */}
      {state.isMyTurn && state.summaryMsLeft <= 0 && turnCountdownVisible(state) ? (
        <TurnCountdown state={state} />
      ) : null}
      {/* THE CENTRE-TOP, IN ONE PLACE. Round pips, who is up, how many are
          focusing and one transient status used to be four components pinning
          themselves to four hand-picked offsets — two of them to the same 70%.
          The rail owns the column and stacks whatever is true. */}
      {/* ‼️THE CARD IS THE SCREEN WHILE IT IS UP — ON A PHONE.
          The result cloud is centred and the rail is centred, so on a handset's
          720 px canvas they are drawn through each other: chips over the puffs,
          the round total behind a caption. A monitor has the height to carry
          both, and the comment here used to claim the suppression was gated on
          compact for exactly that reason. IT IS NOT AND HAS NOT BEEN: the line
          below drops the rail on every device. Leaving the claim in place is
          how the next reader concludes there is a rail/card overlap to fix on
          a monitor and goes looking for a bug that was closed. The card lasts
          a few seconds and it is YOUR round ending; there is nothing on the
          rail that cannot wait for it.

          Worth revisiting now that the card is sized to its copy rather than
          to a fixed slice of the canvas (see `resultCardPlan`): it stands 21%
          of a phone's height instead of 27%, so a monitor could plausibly
          carry both again. That is a behaviour change, not a layout one. */}
      {((state.summaryMsLeft > 0 && !!state.activeName) || !!state.rescuePushDone) ? null : (
      <TopRail
        state={state}
        // YOUR TURN IS ENOUGH. It used to also demand `approaching`, which
        // requires FACING the machine — so a player who had just been handed
        // the bag, or who was lining up from the side, could not see how many
        // punches the round had given them. Owner, 2026-09-03: "you don't even
        // know at the beginning how many you have". The pip row and the
        // earned-punch flash were both already built; they were just hidden.
        // ‼️THE ROUND IS EVERYBODY'S TO WATCH. Gated on isMyTurn, a spectator saw
        // no score, no round total, no streak, no comeback — only a meter and a
        // sentence about themselves. Owner, 2026-09-07: "watching somebody else
        // play and not seeing their scores is a total loss". The stance line
        // below stays the puncher's; the numbers belong to the room.
        showRound={state.summaryMsLeft <= 0 && (state.isMyTurn || !!state.activeName)}
        // NOT UNDER THE SCOREBOARD. The rail and the board open in the same
        // column, and the shelf was drawing straight across the board's crown
        // (owner, 2026-09-04: "overlapping with the boosting progress bar very
        // badly"). On a desktop the shelf is a readout, not a control — the
        // keys still work — so while the list is open the readout steps aside
        // and the `N PLAYERS ARE BOOSTING` chip above it carries the fact.
        showFocusPill={showFocusPill && focusPillOnRail() && !state.scoreboardOpen}
      />
      )}
      {scoring && (state.score > 0 || state.cardHeld) && !(state.rescuePushHud && state.rescuePushHud !== 'off') ? <ScoreReveal state={state} /> : null}
      {(aiming || charging) ? (
        <AimReticle
          marker01={state.timingMarker01}
          target01={state.timingTarget01}
          sweetWidth01={state.timingSweetWidth01}
          assist01={state.crowdAssist01}
          /* Zero unless the director's fumble-risk tell is on AND set to a
             style that includes the physical one — see `fumbleRiskTellStyle`. */
          risk01={state.fumbleRiskStyle === 'chip' ? 0 : (state.fumbleRisk01 ?? 0)}
          stake01={state.fumbleStake01 ?? 0}
          accuracy01={state.accuracy01}
          charging={charging}
          pulse01={state.pulse01}
        />
      ) : null}
      {charging ? <PowerBar power01={state.power01} accuracy01={state.accuracy01} /> : null}
        {punchGloveVisible() ? <GloveButton charging={charging} state={state} /> : null}
        {/* NOT WHILE THE METER IS THERE. On a phone the reload bar is drawn
            across the top of the disc, which is where this caption lives — and
            "HOLD TO CHARGE" is an instruction for a button that is dead until
            the meter fills anyway. */}
        {punchGloveVisible() ? <GloveCaption show={approaching && !charging && state.reload01 >= 1} /> : null}
        <QueueControl state={state} />
        {state.rescueLabel ? <RescuePanel state={state} /> : null}
        <HelpButton state={state} />
        {state.isMyTurn ? <ScreenCrack strength={state.screenCrack01 ?? 0} /> : null}
        <MutePanel />
        <MuteMenu />
        <SeatsChip playersIn={state.playersIn} />
        <RescueHelpOffChip />
        <SaveRunChip state={state} />
        <AdminChip />
        {/* The list, and the one control that opens it. Never during your own
            wind-up: the plugin shuts the panel while you are charging, so the
            middle of the screen is yours when it matters.

            ‼️NO TEXTURE PREWARM ANY MORE. There were three one-pixel entities
            here holding `board-cap-top`, `board-row` and `board-cap-bottom` in
            the explorer's cache, because the first press of SCORES used to draw
            bare rows while three PNGs arrived. The board is drawn in code now —
            there is nothing left to fetch, so the first press is the same as the
            hundredth. */}
        <ScoresButton open={state.scoreboardOpen} />
        {state.scoreboardOpen ? <ScoreboardPanel state={state} /> : null}
      </UiEntity>
    </SafeScreen>
  )
}
