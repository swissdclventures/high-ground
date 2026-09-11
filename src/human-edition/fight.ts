/**
 * Scrapped Human Edition fight view — isolated copy of the plaza glove rig.
 * Plaza Scrap keeps scrap-fight.ts. Do not merge them.
 *
 * Camera sits on YOUR doll, looking at THEIR doll.
 *
 * THE LIFECYCLE LAW — the rig is built ONCE and never destroyed.
 * The bout used to create the gloves/marker and then `engine.removeEntity`
 * them at the end, including the VirtualCamera entity while the Explorer was
 * still blending away from it. Destroying a live camera rig is what threw the
 * renderer out of the scene; the Explorer answers that by restarting the whole
 * scene ("it logs me out and everything reloads"). So: create once, then only
 * show/hide (VisibilityComponent) and bind/unbind the camera.
 *
 * Hurt/low-HP feedback is HUD only. Camera wash/vignette quads fill the FOV
 * and Explorer often draws PBR alpha-0 as opaque black. Keep them hidden.
 *
 * THE FRAME IS PINNED, NOT FROZEN. Walk/jog/run stay on so you can keep
 * moving the world. Jump and glide are off so you cannot fly out of the
 * ring. VirtualCamera sits at your eyes, looking at their FACE. A / D raise
 * the glove whose outer edge glows; the big heavy/boss cross lights both.
 *
 * WHAT YOU READ — one square on their FACE. Its fill rises as attack power
 * and alignment build: dim wait · amber close · gold opening · green MAX.
 * During their attack the square yields and only the threatened glove edge
 * glows blue→red. Bars, verdicts and controls are 2-D UI.
 *
 * YOUR BODY IS HIDDEN IN FIRST PERSON. The jab/cross emote still plays so
 * everyone else sees the punches, but a VirtualCamera at your eyes would also
 * draw those arms on top of the gloves — a second pair that looks like someone
 * else's. AvatarModifierArea blanks YOUR avatar locally while the eye-cam is
 * bound. The knockout cut turns that off so the fall is a scene you watch.
 *
 * THE PAYOFF. A knockout holds first person for the impact, then cuts to a
 * wide side-on shot that orbits while they go down — six fatals, by seed. Only
 * losing shakes the camera; winning keeps the slam on their body and the world.
 *
 * E/F come from action-keys.ts. Space (IA_JUMP) bangs the gloves for a
 * limited MAX-power hype — jump is already disabled in the ring.
 * Do not parent a pointer collider to the camera.
 */
import {
  AudioSource,
  AvatarModifierArea,
  AvatarModifierType,
  AvatarShape,
  Billboard,
  ColliderLayer,
  engine,
  Entity,
  GltfContainer,
  InputAction,
  InputModifier,
  MainCamera,
  Material,
  MaterialTransparencyMode,
  MeshRenderer,
  PointerEventType,
  PointerLock,
  TextShape,
  Transform,
  VirtualCamera,
  VisibilityComponent,
  inputSystem,
} from "@dcl/sdk/ecs";
import { Color3, Color4, Quaternion, Vector3 } from "@dcl/sdk/math";
import {
  SCRAP_BREATHER_MS,
  SCRAP_FIGHT_PUNCH_COOLDOWN_MS,
  SCRAP_FIGHT_YOUR_HP,
  SCRAP_CHARGE_FULL_MS,
  SCRAP_HYPE_STAMINA,
  scrapBreatherCycle,
  scrapBeatAt,
  emptyScrapFight,
  scrapAlignStep,
  scrapChargeExhausted,
  scrapChargePower,
  scrapCueAt,
  scrapDefendHandsFromInput,
  scrapDodgeLean,
  scrapFightHypeBank,
  scrapFightHypeClap,
  scrapHypeBankReady,
  scrapHypeDecay,
  scrapHypeGain,
  scrapFightReleaseDodge,
  scrapFightPunch,
  scrapFightQuit,
  scrapFightTick,
  scrapHypeClapElapsed,
  scrapHypeClapping,
  scrapHypePowerLive,
  scrapLandedHitFeel,
  scrapReceivedHitFeel,
  scrapShakeMotion,
  scrapHitCallout,
  scrapKoCutPose,
  scrapKoPose,
  scrapOverlapQuality,
  SCRAP_KO_CAM_HOLD_MS,
  SCRAP_KO_CAM_ORBIT_MS,
  type ScrapShakeStage,
  scrapKoPreludeMs,
  scrapKoTravel,
  scrapTheirLock,
  type ScrapCue,
  type ScrapDefendHands,
  type ScrapDodgeDir,
  type ScrapFightState,
  type ScrapFightTiming,
  type ScrapKoStyle,
  type ScrapOverlapQuality,
  type ScrapSwingKind,
} from "@shared/scrap-fight";
import {
  scrapKoGround,
  scrapKoKnockbackPlan,
  type ScrapKoKnockbackPlan,
} from "@shared/scrap-ko-ground";
import { scrapMove, scrapMoveInRange, type ScrapMoveKind } from "@shared/scrap-moves";
import type { ScrapConfig } from "@shared/scrap-contract";
import type { ScrapSession } from "@shared/scrap-session";
import { scrapSkillTuning } from "@shared/scrap-skill";
import {
  scrapEmoteBinding,
  scrapKoClipMs,
  scrapKoRole,
  scrapSwingVisualRole,
  type ScrapEmoteRole,
} from "@shared/scrap-emotes";
import { SCRAP_RESULT_PROCEED_MS } from "@shared/scrap-result";
import {
  SCRAP_GLOVE_SCALE,
  scrapDefendGuard,
  scrapDodgeGuard,
  scrapGlovePunchDuration,
  scrapGloveTuckPose,
  scrapGloveViewPose,
  scrapGuardBob,
  scrapHypeClapPose,
  scrapKickHidesGloves,
  type ScrapHitBand,
  type ScrapPunchKind,
} from "@shared/scrap-glove-view";
import {
  SCRAP_KICK_SHOE_SCALE,
  scrapIncomingKickPose,
  scrapKickViewPose,
} from "@shared/scrap-kick-view";
import {
  SCRAP_GLOVE_GLOW_LINGER_MS,
  scrapAimSquareVisual,
  scrapBarDrain,
  scrapBlockCue,
  scrapChipDrain,
  scrapDamagePop,
  scrapFightHint,
  scrapGloveBlockGlow,
  scrapHealthFraction,
  scrapImpactBurst,
  scrapLowHealthPulse,
  type ScrapBlockCue,
} from "@shared/scrap-hud";
import {
  SCRAP_COMBO_NAME_MS,
  scrapComboLink,
  type ScrapAttackVerb,
} from "@shared/scrap-controls";
import { movePlayerTo, triggerSceneEmote } from "~system/RestrictedActions";
import { playWorldShockwave } from "../effects/admin-fx";
import { onActionKey } from "../action-keys";
import { scrapHitKnockSpec } from "@shared/scrap-hit-physics";
import { executeScrapHitKnock, tickScrapHitKnock } from "../plugins/scrap-knock";

const HEAD_Y = 1.62;
/** The marker sits on their face — punchable the moment you see it. */
const MARK_Y = HEAD_Y;
const LEFT_GLOVE_SRC = "models/scrap/boxing-glove-left.glb";
const RIGHT_GLOVE_SRC = "models/scrap/boxing-glove-right.glb";
const KICK_FOOT_SRC = "models/scrap/kick-trainer.glb";
// Camera-local icon like the gloves. Intentionally oversized for an unmistakable kick.
const EYE_HEIGHT = 1.68;
const EYE_FORWARD = 0.42;
/** Depth in front of the eye where the single attack square sits. */
const HUD_DEPTH = 1.1;
const HIDDEN = Vector3.create(0.0001, 0.0001, 0.0001);
/**
 * Local-only hide of YOUR avatar while the eye camera is on. Big enough to
 * cover a punching arm, small enough that they (at 1.9 m+) stay outside it.
 * NPCs are AvatarShape entities, not player avatars, so HIDE_AVATARS does not
 * blank the opponent even if the boxes kiss.
 */
const BODY_HIDE_AREA = Vector3.create(1.8, 2.6, 1.8);
/** How long a verdict stays up. Short: it must never queue or overlap. */
const VERDICT_MS = 900;
const WHITE = { r: 0.95, g: 0.95, b: 0.97 };
const RED = { r: 1, g: 0.14, b: 0.08 };

const SFX_PUNCH_LIGHT = "sounds/scrap/punch-light.wav";
const SFX_PUNCH_HEAVY = "sounds/scrap/punch-heavy.wav";
const SFX_PUNCH_COMBO = "sounds/scrap/punch-combo.wav";
const SFX_PUNCH_HOOK = "sounds/scrap/punch-hook.wav";
const SFX_WHOOSH = "sounds/scrap/whoosh.wav";
const SFX_KO = "sounds/scrap/ko-slam.wav";
const SFX_HURT_LIGHT = "sounds/scrap/hurt-light.wav";
const SFX_HURT_HEAVY = "sounds/scrap/hurt-heavy.wav";
const SFX_BELL = "sounds/scrap/bell.wav";
const SFX_VICTORY = "sounds/scrap/victory.wav";
const SFX_GAME_OVER = "sounds/scrap/game-over.wav";

export type ScrapFightFx =
  | { kind: "npc_swing"; swing: ScrapSwingKind; visual: ScrapEmoteRole }
  | { kind: "npc_breather"; ms: number }
  | { kind: "npc_guard" }
  | { kind: "stance" }
  | { kind: "tell" }
  | { kind: "landed"; tier: "turbo" | "close"; charge: number; score: number }
  | { kind: "miss" }
  | { kind: "hurt"; heavy: boolean }
  | { kind: "dodged" }
  | { kind: "ko"; style: ScrapKoStyle }
  | { kind: "lost"; style: ScrapKoStyle };

export interface ScrapFightActor {
  npcIndex: number;
  entity: Entity;
  x: number;
  y: number;
  z: number;
}

interface FightRig {
  cam: Entity;
  koCam: Entity;
  leftHud: Entity;
  rightHud: Entity;
  leftGlow: Entity;
  rightGlow: Entity;
  leftGlowParts: Entity[];
  rightGlowParts: Entity[];
  kickLeg: Entity;
  kickFoot: Entity;
  incomingKickLeg: Entity;
  incomingKickFoot: Entity;
  markRing: Entity;
  markCore: Entity;
  markLabel: Entity;
  worldAim: Entity;
  worldAimRing: Entity;
  wash: Entity;
  vignette: Entity;
  impact: Entity;
  impactParts: Entity[];
  hurtImpact: Entity;
  hurtImpactParts: Entity[];
  dmgText: Entity;
  promptText: Entity;
}

let rig: FightRig | null = null;
let rigVisible = false;
let promptVisible = false;
let glovesVisible = true;
/** Glove edge(s) whose warning is fading after their swing. */
let glowLingerSide: ScrapBlockCue = null;
let glowLingerUntil = 0;
/**
 * Hide-box for the local avatar. Created once with the rig, never destroyed —
 * same lifecycle law as the camera. Toggled by adding/removing the modifier.
 */
let bodyHide: Entity | null = null;
let bodyHidden = false;
/** Human Edition: locked in until LEAVE / KO continue, body stays hidden. */
let humanPossessed = false;
let pendingHumanLeave = false;
/** Pushed in by scrap.ts each director tick (one-way dependency on purpose). */
let angerValue = 0;
let fight: ScrapFightState | null = null;
let timing: ScrapFightTiming = scrapSkillTuning(0.5);
let fightNpcIndex: number | null = null;
/** Eyes sit on this doll, not the live player capsule. */
let humanPlayerDoll: Entity | null = null;
let punchUntil = 0;
let punchStartMs = 0;
let punchKind: ScrapPunchKind = "cross";
let punchBand: ScrapHitBand = "mid";
/** Next auto punch (click / E / HIT) alternates jab ↔ cross. */
let nextAutoPunch: ScrapPunchKind = "jab";
/** Their swings so far — indexes the seeded jab/cross/uppercut/kick visual. */
let npcSwingCount = 0;
/** Camera-projected version of the opponent doll's seeded front kick. */
let incomingKickStartMs = 0;
let incomingKickDurationMs = 0;
/** They are stepping out for air until this time; swing/taunt fx pause. */
let npcBreatherUntil = 0;
let pendingResult: "player_win" | "npc_win" | "walk_away" | null = null;
let pendingAccept = false;
let pendingPunch: { kind: ScrapPunchKind; charge: number } | null = null;
let pendingQuit = false;
let pendingDodge: ScrapDodgeDir | null = null;
/** Hold-to-charge: which input owns the current wind-up. */
type ScrapChargeSource =
  | "ui"
  | "pointer"
  | "primary"
  | "uppercut-key"
  | "kick-key"
  | null;
let chargeSource: ScrapChargeSource = null;
let chargeKind: ScrapPunchKind = "jab";
let chargeStartedAt = 0;
let pointerWasDown = false;
let primaryWasDown = false;
let uppercutKeyWasDown = false;
let kickKeyWasDown = false;
let leaveKeyWasDown = false;
/** The last attack actually thrown — the left half of a combo link. */
let lastAttackKind: ScrapPunchKind | null = null;
let lastAttackAt = 0;
/** Combo name to flash, and when it was named. */
let comboName = "";
let comboAt = 0;
/** HYPE 0..1. Earned by pressure; banks MAX power when it fills. */
let hypeMeter = 0;
/** Their turtle-punish uppercut lands at this time. 0 = none in the air. */
let upperTellUntil = 0;
let lastPunchTapAt = 0;
/** Shape-match pull from ALIGN (Shift). */
let alignValue = 0;
/** Second physical contact in the one-two, including spectator animation. */
let followupContactAt = 0;
let followupNpc: ScrapFightActor | null = null;
let systemOn = false;
let lastSessionId: string | null = null;
let shakeUntil = 0;
let shakeStrength = 0;
let shakeStartedAt = 0;
let shakeMs = 320;
let shakeStage: ScrapShakeStage = "medium";
let lungeUntil = 0;
let lungeStrength = 0;
let lastFrameMs = 0;
let theirShown = 1;
let theirChipShown = 1;
let theirDmgAt = 0;
let yourShown = SCRAP_FIGHT_YOUR_HP;
let yourChipShown = SCRAP_FIGHT_YOUR_HP;
let yourDmgAt = 0;
let impactAt = 0;
let dmgAt = 0;
let dmgLabel = "";
let hurtFlinchAt = 0;
let dmgTier: "turbo" | "close" | "miss" | "info" = "info";
let impactPos = Vector3.create(0, 0, 0);
/** Impact in camera space (for a hit ON YOU). Null = world space (a hit on them). */
let impactLocal: { x: number; y: number } | null = null;
let fxQueue: ScrapFightFx[] = [];
let sfxEntity: Entity | null = null;
let resultSfxEntity: Entity | null = null;
let bedEntity: Entity | null = null;
let bedOn = false;
let lastSfxAt = 0;
let resultJingleAt = 0;
let camBound = false;
let lastFightEndedAt = 0;
let faultLogged = false;
let resolveStartMs = 0;
let playerFellAt = 0;
/** Player is on the floor after a loss — stay there until CONTINUE, then rise. */
let playerOnFloor = false;
let playerDownIdleAt = 0;
let playerKoStyle: ScrapKoStyle = "crumple";
let playerKoBodyAt = 0;
let playerKoApexSent = false;
let playerKoLandSent = false;
let playerFallOx = 0;
let playerFallOy = 0;
let playerFallOz = 0;
/** Frozen bout origin for the wide KO cam — never chase a physics eject. */
let koCamOx = 0;
let koCamOy = 0;
let koCamOz = 0;
let koCamNpcX = 0;
let koCamNpcY = 0;
let koCamNpcZ = 0;
let koCamLocked = false;
let playerKoPlan: ScrapKoKnockbackPlan | null = null;
let pendingProceed = false;
let koCutAt = 0;
let lastCue: ScrapCue = "wait";
let cueChangedAt = 0;
/**
 * Heartbeat for the fight DRIVER (`syncScrapFight`). Zero means it has never run.
 *
 * The rig is torn down in exactly one place — `stopFight()` — and the only caller that
 * can reach it is `syncScrapFight`, which the NPC troupe tick skips wholesale when the
 * client is not the dance coordinator, when venue activity is paused, or when Scrap goes
 * inactive. Lose the driver mid-bout and `rigVisible` stays true for the rest of the
 * session: `isScrapFightActive()` answers yes forever, so jump stays locked. The
 * watchdog below is what makes that unrecoverable state impossible — see
 * `scrapFightWatchdog`.
 */
let lastSyncAt = 0;

/** The driver has stopped feeding us and the rig is still up. */
const FIGHT_DRIVER_STALE_MS = 2000;

function pushFx(fx: ScrapFightFx): void {
  fxQueue.push(fx);
}

export function consumeScrapFightFx(): ScrapFightFx[] {
  const out = fxQueue;
  fxQueue = [];
  return out;
}

// ---------------------------------------------------------------------------
// The 2-D HUD reads this. One snapshot per frame, no component traffic.
// ---------------------------------------------------------------------------

export type ScrapVerdictKind = "hit" | "close" | "miss" | "hurt" | "dodge" | "info";

export interface ScrapFightHudState {
  /** The bout is on (bars, marker legend, buttons). */
  fighting: boolean;
  /** The result card is up. */
  result: "won" | "lost" | null;
  resultDetail: string;
  /** ms since the resolve cut — drives the K.O. stamp. */
  resultAgeMs: number;
  /** Auto-proceed is armed. */
  resultCanProceed: boolean;
  theirHp: number;
  theirMax: number;
  yourHp: number;
  yourMax: number;
  /** Chip values trail the fill so a chunk just lost is visible. */
  theirChip: number;
  yourChip: number;
  cue: ScrapCue;
  /** The last verdict and how much of its life is left (1 → 0). */
  verdict: string;
  verdictKind: ScrapVerdictKind;
  verdictLife: number;
  /** One short instruction. */
  instruction: string;
  argument: { presses: number; of: number; label: string } | null;
  /** Their swing has committed; the glove edge turns urgent. */
  lockedOn: boolean;
  /** Low-health edge pulse, 0..1. */
  lowPulse: number;
  exposed: boolean;
  dodging: boolean;
  /** Their turtle-punish uppercut is in the air — no guard stops this one. */
  upperTell: boolean;
  /** Which rhythm they fight to, for the corner legend. */
  patternRead: string;
  /** Big side readout: your last punch power 0..100 and its tier. */
  scorePct: number;
  scoreTier: "max" | "hit" | "miss" | null;
  /** 1 → 0 life of the score readout. */
  scoreLife: number;
  /** Hold-to-charge fill 0..1 while winding up a punch. */
  charge: number;
  /** True while HIT / E / click is held charging. */
  charging: boolean;
  /** Shape-match fill 0..1, built automatically while an attack is held. */
  align: number;
  /** True while the attack is building its square fill. */
  aligning: boolean;
  /** Overlap quality from cue + align right now. */
  overlap: ScrapOverlapQuality;
  /** Uppercut / hook is in range — activator is live. */
  hookReady: boolean;
  kickReady: boolean;
  stamina: number;
  staminaMax: number;
  /** Which glove edge(s) to raise while they wind up. */
  blockSide: ScrapBlockCue;
  /** Threatened-glove edge intensity 0..1 (the other glove stays 0). */
  gloveGlowLeft: number;
  gloveGlowRight: number;
  /** Space clap is legal this frame. */
  hypeReady: boolean;
  /** Banked MAX from a clap is live. */
  hypePower: boolean;
  /** HYPE meter 0..1 — full means MAX power is banked for the next punch. */
  hype: number;
  /** ms since the opening bell. The control legend fades on this. */
  fightMs: number;
  /** A combo just fired, e.g. "1–2". Empty most of the time. */
  comboName: string;
  /** 1 → 0 life of the combo name. */
  comboLife: number;
}

let hud: ScrapFightHudState = emptyHud();

function emptyHud(): ScrapFightHudState {
  return {
    fighting: false,
    result: null,
    resultDetail: "",
    resultAgeMs: 0,
    resultCanProceed: false,
    theirHp: 0,
    theirMax: 1,
    yourHp: 0,
    yourMax: 1,
    theirChip: 0,
    yourChip: 0,
    cue: "wait",
    verdict: "",
    verdictKind: "info",
    verdictLife: 0,
    instruction: "",
    argument: null,
    lockedOn: false,
    lowPulse: 0,
    exposed: false,
    dodging: false,
    upperTell: false,
    patternRead: "",
    scorePct: 0,
    scoreTier: null,
    scoreLife: 0,
    charge: 0,
    charging: false,
    align: 0,
    aligning: false,
    overlap: "miss",
    hookReady: false,
    kickReady: false,
    stamina: 100,
    staminaMax: 100,
    blockSide: null,
    gloveGlowLeft: 0,
    gloveGlowRight: 0,
    hypeReady: false,
    hypePower: false,
    hype: 0,
    fightMs: 0,
    comboName: "",
    comboLife: 0,
  };
}

export function scrapFightHud(): ScrapFightHudState {
  return hud;
}

function offerResultProceed(): boolean {
  return hud.result != null && hud.resultCanProceed;
}

function requestResultProceed(): boolean {
  if (!offerResultProceed()) return false;
  pendingProceed = true;
  return true;
}

/** K.O. stamp finished — get up and leave the ring. */
export function scrapUiProceed(): void {
  requestResultProceed();
}

/** Press HIT / UPPERCUT / combo — starts the charge. Release to throw. */
export function scrapUiPunchStart(kind?: ScrapPunchKind): void {
  if (requestResultProceed()) return;
  if (!fight) {
    pendingAccept = true;
    return;
  }
  beginCharge(kind ?? nextAutoPunch, "ui", Date.now());
}

/** Release HIT — fire at current charge. */
export function scrapUiPunchRelease(): void {
  if (chargeSource === "ui") releaseCharge(Date.now());
}

/** Bare down still begins a charge (release via scrapUiPunchRelease). */
export function scrapUiPunch(kind?: ScrapPunchKind): void {
  scrapUiPunchStart(kind);
}

function beginCharge(
  kind: ScrapPunchKind,
  source: Exclude<ScrapChargeSource, null>,
  nowMs: number,
  verb?: ScrapAttackVerb
): void {
  if (!fight || fight.outcome !== "pending") return;
  if (chargeSource) return;
  let next = kind;
  if (verb) {
    // COMBOS EMERGE. Follow a punch with another attack inside the link window
    // and this one upgrades itself and says its own name — there is no combo
    // key to find, and nothing to memorize before the first bout.
    const link = scrapComboLink(lastAttackKind, verb, nowMs - lastAttackAt);
    if (link) {
      next = link.kind;
      comboName = link.name;
      comboAt = nowMs;
      hypeMeter = scrapHypeGain(hypeMeter, "combo");
    }
  }
  chargeSource = source;
  chargeKind = next;
  chargeStartedAt = scrapHypePowerLive(fight, nowMs) ? nowMs - SCRAP_CHARGE_FULL_MS : nowMs;
}

function cancelCharge(): void {
  chargeSource = null;
  chargeStartedAt = 0;
}

function currentCharge(nowMs: number): number {
  if (fight && scrapHypePowerLive(fight, nowMs)) return 1;
  if (!chargeSource) return 0;
  return scrapChargePower(nowMs - chargeStartedAt);
}

function releaseCharge(nowMs: number): void {
  if (!chargeSource) return;
  pendingPunch = { kind: chargeKind, charge: currentCharge(nowMs) };
  lastAttackKind = chargeKind;
  lastAttackAt = nowMs;
  cancelCharge();
}

function tryHypeClap(nowMs: number): boolean {
  if (!fight || fight.outcome !== "pending") return false;
  const next = scrapFightHypeClap(fight, nowMs);
  if (!next.ok) return false;
  fight = next.state;
  playSfx(SFX_WHOOSH, 0.85);
  showVerdict("info", "MAX POWER", nowMs);
  return true;
}

/**
 * Hold-to-block with A / D (or ◀ ▶). No modifier gate.
 */
function defendHandsThisFrame(): ScrapDefendHands {
  // SHIFT PROTECTS YOU. Held alone it is the full two-glove guard; add the
  // left or right arrow and you drop to that single hand, which is still the
  // only answer to the turtle-punish uppercut. An arrow on its own no longer
  // raises a glove — the arrow keys are movement and nothing else now.
  const guarding = inputSystem.isPressed(InputAction.IA_MODIFIER) || guardHoldTouch;
  if (!guarding) {
    return scrapDefendHandsFromInput({
      leftHand: dodgeHold === "left",
      rightHand: dodgeHold === "right",
    });
  }
  const leanLeft = inputSystem.isPressed(InputAction.IA_LEFT) || dodgeHold === "left";
  const leanRight = inputSystem.isPressed(InputAction.IA_RIGHT) || dodgeHold === "right";
  if (leanLeft === leanRight) return "both";
  return leanLeft ? "left" : "right";
}

function aligningThisFrame(): boolean {
  // Charging performs the target pull automatically. Shift used to double as a
  // hidden alias for it; Shift is GUARD now, so holding an attack is the pull.
  return !!chargeSource;
}

function notePunchTap(nowMs: number, source: "pointer" | "primary"): void {
  lastPunchTapAt = nowMs;
  if (chargeSource) return;
  beginCharge(nextAutoPunch, source, nowMs, "punch");
}

/**
 * THE WHOLE COMBAT KEYBOARD, in one function.
 *
 *   E / click  punch      F  kick      SPACE  uppercut      4  walk out
 *
 * Every attack is still hold-to-charge and fires on release; only the keys
 * moved. Decentraland cannot bind X or C — the addressable set is fixed by the
 * InputAction enum — so punch and kick sit on the adjacent E and F, and Space
 * and Shift land exactly where a fighting game expects them. Hype no longer
 * takes a key at all: it fills from pressure (see the meter in the tick).
 */
function tickChargeInput(nowMs: number): void {
  const pointerDown = inputSystem.isPressed(InputAction.IA_POINTER);
  const primaryDown = inputSystem.isPressed(InputAction.IA_PRIMARY);
  const kickDown = inputSystem.isPressed(InputAction.IA_SECONDARY);
  const uppercutDown = inputSystem.isPressed(InputAction.IA_JUMP);
  // Leaving sits away from the combat fingers on purpose: an accidental exit
  // costs the whole bout, and there is no way back into it.
  const leaveDown = inputSystem.isPressed(InputAction.IA_ACTION_6);

  if (!fight || fight.outcome !== "pending") {
    if (chargeSource) cancelCharge();
    pointerWasDown = pointerDown;
    primaryWasDown = primaryDown;
    uppercutKeyWasDown = uppercutDown;
    kickKeyWasDown = kickDown;
    leaveKeyWasDown = leaveDown;
    return;
  }

  if (leaveDown && !leaveKeyWasDown) pendingQuit = true;

  if (pointerDown && !pointerWasDown) notePunchTap(nowMs, "pointer");
  if (primaryDown && !primaryWasDown) notePunchTap(nowMs, "primary");
  if (uppercutDown && !uppercutKeyWasDown && !chargeSource) {
    beginCharge("uppercut", "uppercut-key", nowMs, "uppercut");
  }
  if (kickDown && !kickKeyWasDown && !chargeSource) {
    beginCharge("front_kick", "kick-key", nowMs, "kick");
  }

  if (chargeSource && scrapChargeExhausted(nowMs - chargeStartedAt) && !(fight && scrapHypePowerLive(fight, nowMs))) {
    pendingPunch = { kind: chargeKind, charge: currentCharge(nowMs) };
    lastAttackKind = chargeKind;
    lastAttackAt = nowMs;
    cancelCharge();
  } else {
    if (!pointerDown && pointerWasDown && chargeSource === "pointer") {
      releaseCharge(nowMs);
    }
    if (!primaryDown && primaryWasDown && chargeSource === "primary") {
      releaseCharge(nowMs);
    }
    if (!uppercutDown && uppercutKeyWasDown && chargeSource === "uppercut-key") {
      releaseCharge(nowMs);
    }
    if (!kickDown && kickKeyWasDown && chargeSource === "kick-key") {
      releaseCharge(nowMs);
    }
  }

  pointerWasDown = pointerDown;
  primaryWasDown = primaryDown;
  uppercutKeyWasDown = uppercutDown;
  kickKeyWasDown = kickDown;
  leaveKeyWasDown = leaveDown;
}

let dodgeHold: ScrapDodgeDir | null = null;
/** Touch GUARD button is held. Keyboards use Shift. */
let guardHoldTouch = false;

/** Touch stand-in for holding Shift. */
export function scrapUiGuard(on: boolean): void {
  guardHoldTouch = on;
  if (!on) dodgeHold = null;
}

export function scrapUiDodge(dir: ScrapDodgeDir): void {
  if (fight) {
    dodgeHold = dir;
    pendingDodge = dir;
  }
}

export function scrapUiDodgeRelease(): void {
  dodgeHold = null;
}

export function scrapUiQuit(): void {
  if (fight) pendingQuit = true;
  else if (humanPossessed) pendingHumanLeave = true;
}

/** HUD stand-in for Space — bang the gloves. */
export function scrapUiHype(): void {
  tryHypeClap(Date.now());
}

// ---------------------------------------------------------------------------

function colorMat(entity: Entity, color: Color4, emissive = 0): void {
  Material.setPbrMaterial(entity, {
    albedoColor: color,
    roughness: 0.62,
    metallic: 0.02,
    emissiveColor: Color3.create(color.r, color.g, color.b),
    emissiveIntensity: emissive,
  });
}

function glowMat(entity: Entity, r: number, g: number, b: number, alpha: number, emissive: number): void {
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(r, g, b, alpha),
    roughness: 1,
    metallic: 0,
    emissiveColor: Color3.create(r, g, b),
    emissiveIntensity: emissive,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
  });
}

function box(parent: Entity | undefined, pos: Vector3, scale: Vector3, color: Color4, emissive = 0): Entity {
  const e = engine.addEntity();
  Transform.create(e, parent === undefined ? { position: pos, scale } : { parent, position: pos, scale });
  MeshRenderer.setBox(e);
  colorMat(e, color, emissive);
  return e;
}

/**
 * A camera-facing marker: a thin box whose flat face is camera-Z; as a child
 * of the camera rig it always faces the eye by construction.
 */
function markerEntity(parent: Entity, tint: { r: number; g: number; b: number }, emissive: number): Entity {
  const e = engine.addEntity();
  Transform.create(e, { parent, position: Vector3.create(0, 0, 1), scale: HIDDEN });
  MeshRenderer.setBox(e);
  colorMat(e, Color4.create(tint.r, tint.g, tint.b, 1), emissive);
  return e;
}

const outlineKids = new Map<Entity, Entity[]>();

function tintOutline(root: Entity, tint: { r: number; g: number; b: number }, emissive: number): void {
  const kids = outlineKids.get(root);
  if (!kids) return;
  for (const kid of kids) colorMat(kid, Color4.create(tint.r, tint.g, tint.b, 1), emissive);
}

/** A hollow square outline: four thin boxes, so the middle stays SEE-THROUGH. */
function outlineEntity(parent: Entity, tint: { r: number; g: number; b: number }, emissive: number): Entity {
  const root = engine.addEntity();
  Transform.create(root, { parent, position: Vector3.create(0, 0, 1), scale: HIDDEN });
  const t = 0.09;
  const c = Color4.create(tint.r, tint.g, tint.b, 1);
  outlineKids.set(root, [
    box(root, Vector3.create(0, 0.5 - t / 2, 0), Vector3.create(1, t, 0.02), c, emissive),
    box(root, Vector3.create(0, -0.5 + t / 2, 0), Vector3.create(1, t, 0.02), c, emissive),
    box(root, Vector3.create(0.5 - t / 2, 0, 0), Vector3.create(t, 1, 0.02), c, emissive),
    box(root, Vector3.create(-0.5 + t / 2, 0, 0), Vector3.create(t, 1, 0.02), c, emissive),
  ]);
  return root;
}

function kickLimb(parent: Entity): { root: Entity; foot: Entity } {
  const rest = scrapKickViewPose(0);
  const root = engine.addEntity();
  Transform.create(root, {
    parent,
    position: Vector3.create(rest.x, rest.y, rest.z),
    rotation: Quaternion.fromEulerDegrees(rest.rx, rest.ry, rest.rz),
    scale: HIDDEN,
  });
  const foot = engine.addEntity();
  Transform.create(foot, {
    parent: root,
    scale: Vector3.create(SCRAP_KICK_SHOE_SCALE, SCRAP_KICK_SHOE_SCALE, SCRAP_KICK_SHOE_SCALE),
  });
  GltfContainer.create(foot, {
    src: KICK_FOOT_SRC,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
  });
  return { root, foot };
}

function boxingGlove(parent: Entity, isRight: boolean): Entity {
  const pose = scrapGloveViewPose(isRight, 0);
  const root = engine.addEntity();
  Transform.create(root, {
    parent,
    position: Vector3.create(pose.x, pose.y, pose.z),
    rotation: Quaternion.fromEulerDegrees(pose.rx, pose.ry, pose.rz),
    scale: Vector3.create(SCRAP_GLOVE_SCALE, SCRAP_GLOVE_SCALE, SCRAP_GLOVE_SCALE),
  });
  GltfContainer.create(root, {
    src: isRight ? RIGHT_GLOVE_SRC : LEFT_GLOVE_SRC,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
  });
  return root;
}

/** Camera-facing edge glow around a glove. Parent is the camera and tracks the fist. */
function gloveHalo(parent: Entity): { root: Entity; parts: Entity[] } {
  const root = engine.addEntity();
  Transform.create(root, { parent, position: Vector3.create(0, 0, 0), scale: HIDDEN });
  const parts: Entity[] = [];
  const n = 12;
  const radius = 0.16;
  const arc = (Math.PI * 2) / n;
  const len = radius * 2 * Math.tan(Math.PI / n) * 1.12;
  for (let i = 0; i < n; i++) {
    const a = i * arc;
    const e = engine.addEntity();
    Transform.create(e, {
      parent: root,
      position: Vector3.create(Math.cos(a) * radius, Math.sin(a) * radius, 0.02),
      rotation: Quaternion.fromEulerDegrees(0, 0, (a * 180) / Math.PI),
      scale: Vector3.create(len, 0.02, 0.02),
    });
    MeshRenderer.setBox(e);
    glowMat(e, 0.22, 0.7, 1, 0, 0);
    parts.push(e);
  }
  return { root, parts };
}

/** Thin bruise scratches at the side of the frame, never over the attack square. */
function hurtScratch(): { root: Entity; parts: Entity[] } {
  const root = engine.addEntity();
  Transform.create(root, { position: Vector3.create(0, HEAD_Y, 0), scale: HIDDEN });
  Billboard.create(root);
  const tint = Color4.create(0.68, 0.12, 0.5, 0.88);
  const parts = [
    box(root, Vector3.create(-0.08, 0.1, 0), Vector3.create(0.5, 0.035, 0.018), tint, 3),
    box(root, Vector3.create(0.02, 0, -0.004), Vector3.create(0.62, 0.028, 0.018), tint, 4),
    box(root, Vector3.create(0.1, -0.1, -0.008), Vector3.create(0.42, 0.032, 0.018), tint, 2),
  ];
  const rotations = [-22, -13, -27];
  parts.forEach((part, index) => {
    const tf = Transform.getMutableOrNull(part);
    if (tf) tf.rotation = Quaternion.fromEulerDegrees(0, 0, rotations[index]!);
  });
  return { root, parts };
}

function playSfx(clip: string, volume = 0.7): void {
  const now = Date.now();
  if (now - lastSfxAt < 40) return;
  lastSfxAt = now;
  if (!sfxEntity) {
    sfxEntity = engine.addEntity();
    Transform.create(sfxEntity, { position: Vector3.Zero() });
  }
  AudioSource.createOrReplace(sfxEntity, {
    audioClipUrl: clip,
    playing: true,
    loop: false,
    volume,
    global: true,
  });
}

function playResultSfx(clip: string): void {
  if (!resultSfxEntity) {
    resultSfxEntity = engine.addEntity();
    Transform.create(resultSfxEntity, { position: Vector3.Zero() });
  }
  AudioSource.createOrReplace(resultSfxEntity, {
    audioClipUrl: clip,
    playing: true,
    loop: false,
    volume: 1,
    global: true,
  });
}

/** Music under the bout. Off unless the owner names a clip (`fightMusic`). */
function setBed(on: boolean, config: ScrapConfig): void {
  if (!bedEntity) {
    bedEntity = engine.addEntity();
    Transform.create(bedEntity, { position: Vector3.Zero() });
  }
  const src = config.fightMusic.trim();
  // Defence in depth for runtime configs published before normalizeScrapConfig began
  // migrating the legacy bundled bed. That file reads as applause and must never start
  // merely because an old project persisted the former default.
  const normalizedSrc = src.toLowerCase().replace(/\\/g, "/");
  const legacyApplauseBed = normalizedSrc === "bed" || normalizedSrc === "sounds/scrap/bed.wav";
  const wantOn = on && !!src && normalizedSrc !== "off" && !legacyApplauseBed;
  if (wantOn === bedOn) return;
  bedOn = wantOn;
  // Empty used to fall through to the bundled bed, which sounded like people
  // clapping under the gloves. Silence unless the owner names a clip.
  if (!wantOn) {
    if (AudioSource.has(bedEntity)) {
      const a = AudioSource.getMutable(bedEntity);
      a.playing = false;
    }
    return;
  }
  AudioSource.createOrReplace(bedEntity, {
    audioClipUrl: src,
    playing: true,
    loop: true,
    volume: 0.32,
    global: true,
  });
}



function ensureRig(): FightRig {
  if (rig) return rig;
  const cam = engine.addEntity();
  Transform.create(cam, { position: Vector3.create(0, 1.6, 0) });
  VirtualCamera.create(cam, {
    defaultTransition: { transitionMode: VirtualCamera.Transition.Time(0.12) },
  });
  const koCam = engine.addEntity();
  Transform.create(koCam, { position: Vector3.create(0, 1.6, 0) });
  VirtualCamera.create(koCam, {
    defaultTransition: { transitionMode: VirtualCamera.Transition.Time(0.45) },
  });

  const leftHud = boxingGlove(cam, false);
  const rightHud = boxingGlove(cam, true);
  const leftHalo = gloveHalo(cam);
  const rightHalo = gloveHalo(cam);
  const kick = kickLimb(cam);
  const incomingKick = kickLimb(cam);

  const markRing = outlineEntity(cam, WHITE, 4);
  const markCore = markerEntity(cam, WHITE, 6);
  const markLabel = engine.addEntity();
  Transform.create(markLabel, {
    parent: cam,
    position: Vector3.create(0, 0, HUD_DEPTH - 0.025),
    scale: HIDDEN,
  });
  TextShape.create(markLabel, {
    text: "MAX",
    fontSize: 2,
    textColor: Color4.White(),
    outlineColor: Color4.create(0.02, 0.08, 0.03, 1),
    outlineWidth: 0.22,
  });

  const worldAim = engine.addEntity();
  Transform.create(worldAim, { position: Vector3.create(0, HEAD_Y, 0), scale: HIDDEN });
  Billboard.create(worldAim);
  const worldAimRing = outlineEntity(worldAim, WHITE, 6);
  Transform.getMutable(worldAimRing).position = Vector3.create(0, 0, 0);

  const wash = engine.addEntity();
  Transform.create(wash, { parent: cam, position: Vector3.create(0, 0, 0.3), scale: HIDDEN });
  MeshRenderer.setBox(wash);
  VisibilityComponent.createOrReplace(wash, { visible: false });

  const vignette = engine.addEntity();
  Transform.create(vignette, { parent: cam, position: Vector3.create(0, 0, 0.36), scale: HIDDEN });
  MeshRenderer.setBox(vignette);
  VisibilityComponent.createOrReplace(vignette, { visible: false });

  const impact = engine.addEntity();
  Transform.create(impact, { position: Vector3.create(0, HEAD_Y, 0), scale: HIDDEN });
  Billboard.create(impact);
  const impactParts = [
    box(impact, Vector3.create(0, 0, 0), Vector3.create(1, 0.12, 0.02), Color4.White(), 12),
    box(impact, Vector3.create(0, 0, -0.004), Vector3.create(0.12, 1, 0.02), Color4.White(), 12),
    box(impact, Vector3.create(0, 0, -0.008), Vector3.create(0.72, 0.72, 0.02), Color4.create(1, 0.9, 0.4, 1), 10),
  ];
  const diamond = Transform.getMutableOrNull(impactParts[2]!);
  if (diamond) diamond.rotation = Quaternion.fromEulerDegrees(0, 0, 45);
  const hurt = hurtScratch();

  const dmgText = engine.addEntity();
  Transform.create(dmgText, { position: Vector3.create(0, HEAD_Y, 0), scale: HIDDEN });
  TextShape.create(dmgText, {
    text: "",
    fontSize: 3,
    textColor: Color4.White(),
    outlineColor: Color4.Black(),
    outlineWidth: 0.28,
  });
  Billboard.create(dmgText);

  const promptText = engine.addEntity();
  Transform.create(promptText, { position: Vector3.create(0, 2.5, 0) });
  TextShape.create(promptText, {
    text: "",
    fontSize: 1.5,
    textColor: Color4.create(1, 0.86, 0.3, 1),
    outlineColor: Color4.Black(),
    outlineWidth: 0.22,
  });
  Billboard.create(promptText);

  rig = {
    cam,
    koCam,
    leftHud,
    rightHud,
    leftGlow: leftHalo.root,
    rightGlow: rightHalo.root,
    leftGlowParts: leftHalo.parts,
    rightGlowParts: rightHalo.parts,
    kickLeg: kick.root,
    kickFoot: kick.foot,
    incomingKickLeg: incomingKick.root,
    incomingKickFoot: incomingKick.foot,
    markRing,
    markCore,
    markLabel,
    worldAim,
    worldAimRing,
    wash,
    vignette,
    impact,
    impactParts,
    hurtImpact: hurt.root,
    hurtImpactParts: hurt.parts,
    dmgText,
    promptText,
  };
  rigVisible = true;
  showRig(false);
  return rig;
}

function rigEntities(r: FightRig): Entity[] {
  return [
    r.leftHud,
    r.rightHud,
    r.leftGlow,
    r.rightGlow,
    r.kickLeg,
    r.kickFoot,
    r.incomingKickLeg,
    r.incomingKickFoot,
    ...r.leftGlowParts,
    ...r.rightGlowParts,
    r.markRing,
    r.markCore,
    r.markLabel,
    r.wash,
    r.vignette,
    r.dmgText,
    ...r.impactParts,
    ...r.hurtImpactParts,
  ];
}

function hideCameraFlash(): void {
  if (!rig) return;
  for (const e of [rig.wash, rig.vignette]) {
    const tf = Transform.getMutableOrNull(e);
    if (tf) tf.scale = HIDDEN;
    VisibilityComponent.createOrReplace(e, { visible: false });
  }
}

function showRig(visible: boolean): void {
  if (!rig || visible === rigVisible) return;
  rigVisible = visible;
  for (const e of rigEntities(rig)) {
    if (e === rig.wash || e === rig.vignette) continue;
    VisibilityComponent.createOrReplace(e, { visible });
  }
  hideCameraFlash();
  if (!visible) {
    hideMarker();
    for (const e of [rig.impact, rig.hurtImpact, rig.dmgText]) {
      const tf = Transform.getMutableOrNull(e);
      if (tf) tf.scale = HIDDEN;
    }
  }
}

/** Show or hide both gloves. Idempotent - it is called every frame of a resolve. */
function setGlovesVisible(visible: boolean): void {
  if (!rig || glovesVisible === visible) return;
  glovesVisible = visible;
  VisibilityComponent.createOrReplace(rig.leftHud, { visible });
  VisibilityComponent.createOrReplace(rig.rightHud, { visible });
  VisibilityComponent.createOrReplace(rig.leftGlow, { visible });
  VisibilityComponent.createOrReplace(rig.rightGlow, { visible });
  VisibilityComponent.createOrReplace(rig.kickLeg, { visible });
  VisibilityComponent.createOrReplace(rig.kickFoot, { visible });
  VisibilityComponent.createOrReplace(rig.incomingKickLeg, { visible });
  VisibilityComponent.createOrReplace(rig.incomingKickFoot, { visible });
  for (const part of [...rig.leftGlowParts, ...rig.rightGlowParts]) {
    VisibilityComponent.createOrReplace(part, { visible });
  }
}

/**
 * Blank YOUR avatar on this client while first person is up.
 *
 * The gloves are camera props. The real body still throws jab/cross so the
 * bout reads from outside. A VirtualCamera at the eyes sees that body too,
 * and the arms sit next to the gloves — "someone else's arms". This box
 * travels with the player and hides that mesh locally. Other clients never
 * get this entity, so they still see you punch.
 *
 * Off for the knockout cut: gloves are already gone, and the wide shot is
 * supposed to be a scene, not a pair of floating fists.
 */
function setOwnBodyHidden(hidden: boolean): void {
  if (!hidden && humanPossessed) hidden = true;
  if (!hidden && !bodyHide) return;
  if (hidden === bodyHidden && bodyHide) return;
  if (!bodyHide) {
    bodyHide = engine.addEntity();
    Transform.create(bodyHide, {
      parent: engine.PlayerEntity,
      position: Vector3.create(0, 1.05, 0),
    });
  }
  bodyHidden = hidden;
  if (hidden) {
    Transform.createOrReplace(bodyHide, {
      parent: engine.PlayerEntity,
      position: Vector3.create(0, 1.05, 0),
    });
    AvatarModifierArea.createOrReplace(bodyHide, {
      area: BODY_HIDE_AREA,
      excludeIds: [],
      modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
    });
    return;
  }
  if (AvatarModifierArea.has(bodyHide)) AvatarModifierArea.deleteFrom(bodyHide);
}

function releaseFightCam(): void {
  if (!camBound) return;
  camBound = false;
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: undefined });
}

function shakeOffset(nowMs: number): { x: number; y: number; z: number; roll: number } {
  return scrapShakeMotion(nowMs - shakeStartedAt, shakeMs, shakeStrength, shakeStage);
}

function lungeOffset(nowMs: number): number {
  const left = lungeUntil - nowMs;
  if (left <= 0) return 0;
  return lungeStrength * (left / 220) ** 2;
}

/**
 * Your eyes. Pinned to your Transform every tick, looking at their face.
 * Walk stays on so you can still move; a dodge slides the eye sideways.
 */
function aimFightCam(npc: ScrapFightActor, nowMs: number): void {
  const cam = ensureRig().cam;
  const doll = humanPlayerDoll ? Transform.getOrNull(humanPlayerDoll) : null;
  const player = doll ?? Transform.getOrNull(engine.PlayerEntity);
  const px = player?.position.x ?? npc.x;
  const pz = player?.position.z ?? npc.z + 1.6;
  const py = player?.position.y ?? npc.y;
  let dx = npc.x - px;
  let dz = npc.z - pz;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  // Right-hand vector on the ground plane.
  const rx = dz;
  const rz = -dx;
  const shake = shakeOffset(nowMs);
  const push = lungeOffset(nowMs);
  const lean = fight ? scrapDodgeLean(fight, nowMs) : 0;
  const side = fight?.dodgeDir === "right" ? 1 : -1;
  const slide = lean * side * 0.28;
  const pos = Vector3.create(
    px + dx * (EYE_FORWARD + push) + rx * slide + shake.x,
    py + EYE_HEIGHT - lean * 0.08 + shake.y,
    pz + dz * (EYE_FORWARD + push) + rz * slide + shake.z
  );
  const faceY = npc.y + HEAD_Y;
  const flat = Math.max(0.6, Math.hypot(npc.x - pos.x, npc.z - pos.z));
  const pitchDeg = (Math.atan2(pos.y - faceY, flat) * 180) / Math.PI;
  const yawDeg = (Math.atan2(npc.x - pos.x, npc.z - pos.z) * 180) / Math.PI;
  const tf = Transform.getMutableOrNull(cam);
  if (tf) {
    tf.position = pos;
    tf.rotation = Quaternion.fromEulerDegrees(pitchDeg, yawDeg, shake.roll - lean * side * 9);
  }
  if (!camBound) {
    MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: cam });
    camBound = true;
  }
  setOwnBodyHidden(true);
}

/**
 * The knockout cut. A second VirtualCamera, side-on then turning around them
 * while they go down. Moving the eye-cam in place left Explorer in first
 * person, so the fall never showed.
 */
function koFightCam(npc: ScrapFightActor, nowMs: number, progress: number): void {
  const rigNow = ensureRig();
  const px = koCamLocked ? koCamOx : npc.x;
  const pz = koCamLocked ? koCamOz : npc.z + 1.6;
  const py = koCamLocked ? koCamOy : npc.y;
  const pose = scrapKoCutPose(progress, {
    playerX: px,
    playerY: py,
    playerZ: pz,
    npcX: npc.x,
    npcY: npc.y,
    npcZ: npc.z,
  });
  const shake = shakeOffset(nowMs);
  const tf = Transform.getMutableOrNull(rigNow.koCam);
  if (tf) {
    tf.position = Vector3.create(pose.x + shake.x, pose.y + shake.y, pose.z + shake.z);
    tf.rotation = Quaternion.fromEulerDegrees(pose.pitchDeg, pose.yawDeg, shake.roll * 0.25);
  }
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: rigNow.koCam });
  camBound = true;
  if (!humanPossessed) setOwnBodyHidden(false);
}

function shake(strength: number, ms: number, nowMs = Date.now(), stage: ScrapShakeStage = "medium"): void {
  shakeStartedAt = nowMs;
  shakeUntil = nowMs + ms;
  shakeStrength = strength;
  shakeMs = ms;
  shakeStage = stage;
}

function lunge(strength: number): void {
  lungeUntil = Date.now() + 220;
  lungeStrength = strength;
}

function flash(_hurt: boolean, _ms: number): void {
  // Camera wash used to live here. Explorer paints those quads as a black wall.
}

type ScrapLock = "none" | "bout" | "ko";

let inputLock: ScrapLock = "none";

/**
 * Human Edition freezes walk for the whole possession. Plaza Scrap lives in
 * scrap-fight.ts and still lets you step. Walking off this pit must not
 * return the second body — LEAVE / KO continue is the only way out.
 */
function setInputLock(lock: ScrapLock): void {
  const freeze = lock === "ko" || humanPossessed || lock === "bout";
  if (lock === "none" && !humanPossessed) {
    inputLock = lock;
    if (InputModifier.has(engine.PlayerEntity)) InputModifier.deleteFrom(engine.PlayerEntity);
    return;
  }
  inputLock = lock === "none" ? "bout" : lock;
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: {
      $case: "standard",
      standard: {
        disableWalk: freeze,
        disableJog: freeze,
        disableRun: freeze,
        disableJump: true,
        disableDoubleJump: true,
        disableGliding: true,
      },
    },
  });
}

function punchedThisFrame(): { kind: ScrapPunchKind; charge: number } | null {
  const keyed = pendingPunch;
  pendingPunch = null;
  return keyed;
}

function poseGlove(entity: Entity, isRight: boolean, nowMs: number, defendHands: ScrapDefendHands): void {
  const tf = Transform.getMutableOrNull(entity);
  if (!tf) return;
  const clapElapsed = fight ? scrapHypeClapElapsed(fight, nowMs) : -1;
  if (clapElapsed >= 0) {
    const clap = scrapHypeClapPose(isRight, clapElapsed);
    tf.position = Vector3.create(clap.x, clap.y, clap.z);
    tf.rotation = Quaternion.fromEulerDegrees(clap.rx, clap.ry, clap.rz);
    tf.scale = Vector3.create(SCRAP_GLOVE_SCALE, SCRAP_GLOVE_SCALE, SCRAP_GLOVE_SCALE);
    return;
  }
  const punching = nowMs < punchUntil;
  const punchElapsed = punching ? nowMs - punchStartMs : 0;
  // Kicking out of a held guard is legal: the leg goes, the hands stay up and
  // keep blocking. Only an unguarded kick tucks the gloves out of the frame.
  const kickingBehindGuard =
    punching && punchKind === "front_kick" && !!defendHands;
  if (scrapKickHidesGloves(punchKind, punchElapsed, defendHands)) {
    const tuck = scrapGloveTuckPose(isRight);
    tf.position = Vector3.create(tuck.x, tuck.y, tuck.z);
    tf.rotation = Quaternion.fromEulerDegrees(tuck.rx, tuck.ry, tuck.rz);
    tf.scale = HIDDEN;
    return;
  }
  tf.scale = Vector3.create(SCRAP_GLOVE_SCALE, SCRAP_GLOVE_SCALE, SCRAP_GLOVE_SCALE);
  const pose = scrapGloveViewPose(
    isRight,
    punching && !kickingBehindGuard ? nowMs - punchStartMs : 0,
    punchBand,
    punching && !kickingBehindGuard ? punchKind : isRight ? "cross" : "jab"
  );
  const bob = punching
    ? { x: 0, y: 0, z: 0, rx: 0, rz: 0 }
    : scrapGuardBob(isRight, nowMs, hurtFlinchAt ? nowMs - hurtFlinchAt : Infinity);
  // A dodge pulls the gloves with the lean, and raises the OPPOSITE hand as cover.
  const lean = fight ? scrapDodgeLean(fight, nowMs) : 0;
  const side = fight?.dodgeDir === "right" ? 1 : -1;
  // Hold-to-block raises the chosen glove(s); Shift remains dedicated to ALIGN.
  const guard =
    punching && !kickingBehindGuard
      ? { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }
      : defendHands
        ? scrapDefendGuard(isRight, defendHands)
        : scrapDodgeGuard(isRight, fight?.dodgeDir ?? null, lean);
  tf.position = Vector3.create(
    pose.x + bob.x + guard.x - lean * side * 0.12,
    pose.y + bob.y + guard.y - lean * 0.05,
    pose.z + bob.z + guard.z
  );
  tf.rotation = Quaternion.fromEulerDegrees(
    pose.rx + bob.rx + guard.rx,
    pose.ry + guard.ry,
    pose.rz + bob.rz + guard.rz + lean * side * 10
  );
}

function poseKick(nowMs: number): void {
  if (!rig) return;
  const outgoingTf = Transform.getMutableOrNull(rig.kickLeg);
  const outgoing = nowMs < punchUntil && punchKind === "front_kick";
  const outgoingPose = scrapKickViewPose(outgoing ? nowMs - punchStartMs : 0);
  if (outgoingTf) {
    outgoingTf.position = Vector3.create(outgoingPose.x, outgoingPose.y, outgoingPose.z);
    outgoingTf.rotation = Quaternion.fromEulerDegrees(outgoingPose.rx, outgoingPose.ry, outgoingPose.rz);
    outgoingTf.scale = outgoingPose.visible && glovesVisible ? Vector3.create(1, 1, 1) : HIDDEN;
  }

  const incomingTf = Transform.getMutableOrNull(rig.incomingKickLeg);
  const incomingPose = scrapIncomingKickPose(nowMs - incomingKickStartMs, incomingKickDurationMs);
  if (incomingTf) {
    incomingTf.position = Vector3.create(incomingPose.x, incomingPose.y, incomingPose.z);
    incomingTf.rotation = Quaternion.fromEulerDegrees(incomingPose.rx, incomingPose.ry, incomingPose.rz);
    incomingTf.scale = incomingPose.visible && glovesVisible ? Vector3.create(1, 1, 1) : HIDDEN;
  }
  if (incomingKickStartMs && nowMs >= incomingKickStartMs + incomingKickDurationMs) {
    incomingKickStartMs = 0;
    incomingKickDurationMs = 0;
  }
}

function poseGloves(nowMs: number, defendHands: ScrapDefendHands = null): void {
  if (!rig) return;
  poseGlove(rig.leftHud, false, nowMs, defendHands);
  poseGlove(rig.rightHud, true, nowMs, defendHands);
  poseKick(nowMs);
  paintGloveHalos(nowMs);
}

function paintHalo(root: Entity, parts: Entity[], glove: Entity, intensity: number, lockedLook: boolean): void {
  const gtf = Transform.getOrNull(glove);
  const rtf = Transform.getMutableOrNull(root);
  if (!gtf || !rtf) return;
  if (intensity <= 0.02 || !glovesVisible) {
    rtf.scale = HIDDEN;
    return;
  }
  rtf.position = Vector3.create(gtf.position.x, gtf.position.y, gtf.position.z);
  rtf.rotation = Quaternion.fromEulerDegrees(0, 0, 0);
  const grow = 0.88 + 0.4 * intensity;
  rtf.scale = Vector3.create(grow, grow, grow);
  const r = lockedLook ? 1 : 0.22;
  const g = lockedLook ? 0.16 : 0.72;
  const b = lockedLook ? 0.1 : 1;
  const alpha = 0.22 + 0.72 * intensity;
  const emissive = 4 + 16 * intensity;
  for (const part of parts) glowMat(part, r, g, b, alpha, emissive);
}

function paintGloveHalos(_nowMs: number): void {
  if (!rig) return;
  const leftThreat = hud.blockSide === "left" || hud.blockSide === "both";
  const rightThreat = hud.blockSide === "right" || hud.blockSide === "both";
  paintHalo(rig.leftGlow, rig.leftGlowParts, rig.leftHud, hud.gloveGlowLeft, hud.lockedOn && leftThreat);
  paintHalo(rig.rightGlow, rig.rightGlowParts, rig.rightHud, hud.gloveGlowRight, hud.lockedOn && rightThreat);
}

/** Project a world point into the camera rig's local space at HUD_DEPTH. */
function toHud(world: Vector3): { x: number; y: number } | null {
  if (!rig) return null;
  const camTf = Transform.getOrNull(rig.cam);
  if (!camTf) return null;
  const rel = Vector3.subtract(world, camTf.position);
  const inv = Quaternion.create(-camTf.rotation.x, -camTf.rotation.y, -camTf.rotation.z, camTf.rotation.w);
  const local = Vector3.rotate(rel, inv);
  if (local.z <= 0.05) return null;
  const k = HUD_DEPTH / local.z;
  return { x: local.x * k, y: local.y * k };
}

interface ScrapTargetGeometry {
  target: { x: number; y: number } | null;
  match: number;
}

/**
 * The square drifts around the projected face. Holding an attack pulls a
 * conceptual center match toward it; that value drives the visible fill.
 */
function targetGeometry(npc: ScrapFightActor, nowMs: number, seed: number, pull: number): ScrapTargetGeometry {
  const face = toHud(markPoint(npc));
  if (!face) return { target: null, match: 0 };
  const t = nowMs / 1000;
  const phase = (seed % 997) * 0.017;
  const target = {
    x: face.x + Math.sin(t * 2.15 + phase) * 0.105 + Math.sin(t * 4.7 + phase * 0.4) * 0.028,
    y: face.y + Math.cos(t * 1.72 + phase * 0.7) * 0.075 + Math.sin(t * 3.35 + phase) * 0.022,
  };
  const k = Math.max(0, Math.min(1, pull));
  const gap = Math.hypot(target.x * (1 - k), target.y * (1 - k));
  const match = Math.max(0, Math.min(1, 1 - gap / 0.16));
  return { target, match };
}

function placeMarker(
  entity: Entity,
  at: { x: number; y: number } | null,
  size: number,
  tint: { r: number; g: number; b: number },
  emissive: number,
  outline = false
): void {
  const tf = Transform.getMutableOrNull(entity);
  if (!tf) return;
  if (!at || size <= 0) {
    tf.scale = HIDDEN;
    return;
  }
  tf.position = Vector3.create(at.x, at.y, HUD_DEPTH);
  tf.scale = outline ? Vector3.create(size, size, 1) : Vector3.create(size, size, 0.02);
  if (!outline) colorMat(entity, Color4.create(tint.r, tint.g, tint.b, 1), emissive);
}

/** Fill the existing square from its bottom edge; never introduce another meter. */
function placeSquareFill(
  entity: Entity,
  at: { x: number; y: number } | null,
  squareSize: number,
  fraction: number,
  tint: { r: number; g: number; b: number },
  emissive: number
): void {
  const tf = Transform.getMutableOrNull(entity);
  const fill = Math.max(0, Math.min(1, fraction));
  if (!tf) return;
  if (!at || fill <= 0.005) {
    tf.scale = HIDDEN;
    return;
  }
  const inner = squareSize * 0.76;
  const height = inner * fill;
  tf.position = Vector3.create(at.x, at.y - inner / 2 + height / 2, HUD_DEPTH - 0.01);
  tf.scale = Vector3.create(inner, height, 0.018);
  colorMat(entity, Color4.create(tint.r, tint.g, tint.b, 0.9), emissive);
}

function paintMaxLabel(at: { x: number; y: number } | null, visible: boolean): void {
  if (!rig) return;
  const tf = Transform.getMutableOrNull(rig.markLabel);
  if (!tf || !at || !visible) {
    if (tf) tf.scale = HIDDEN;
    return;
  }
  tf.position = Vector3.create(at.x, at.y, HUD_DEPTH - 0.035);
  tf.scale = Vector3.create(0.1, 0.1, 0.1);
}

function hideAimSquares(): void {
  if (!rig) return;
  for (const e of [rig.markRing, rig.markCore, rig.markLabel]) {
    const tf = Transform.getMutableOrNull(e);
    if (tf) tf.scale = HIDDEN;
  }
}

function hideMarker(): void {
  hideAimSquares();
}

function hideWorldAim(): void {
  if (!rig) return;
  const tf = Transform.getMutableOrNull(rig.worldAim);
  if (tf) tf.scale = HIDDEN;
  const ring = Transform.getMutableOrNull(rig.worldAimRing);
  if (ring) ring.scale = HIDDEN;
}

function showWorldAim(npc: ScrapFightActor): void {
  const r = ensureRig();
  const tf = Transform.getMutableOrNull(r.worldAim);
  if (!tf) return;
  tf.position = Vector3.create(npc.x, npc.y + HEAD_Y, npc.z);
  tf.scale = Vector3.create(1, 1, 1);
  const ring = Transform.getMutableOrNull(r.worldAimRing);
  if (ring) {
    ring.position = Vector3.create(0, 0, 0);
    ring.scale = Vector3.create(0.28, 0.28, 0.28);
  }
  tintOutline(r.worldAimRing, RED, 10);
}

/** Where the marker sits on them: the face, world space. */
function markPoint(npc: ScrapFightActor): Vector3 {
  return Vector3.create(npc.x, npc.y + MARK_Y, npc.z);
}

/**
 * One square, only in punch range. Its existing solid square becomes the
 * bottom-anchored fill: dim wait, amber close, gold opening, green MAX.
 */
function paintMarker(
  cue: ScrapCue,
  nowMs: number,
  geometry: ScrapTargetGeometry,
  inRange: boolean,
  charge: number
): void {
  if (!rig) return;
  const visual = scrapAimSquareVisual({ cue, charge, align: geometry.match });
  if (!inRange || !visual.visible) {
    hideAimSquares();
    return;
  }
  const at = geometry.target;
  if (cue !== lastCue) {
    lastCue = cue;
    cueChangedAt = nowMs;
  }
  const pop = Math.max(0, 1 - (nowMs - cueChangedAt) / 160);
  const size = 0.22 + pop * 0.025;
  placeMarker(rig.markRing, at, size, visual.border, 0, true);
  tintOutline(rig.markRing, visual.border, visual.borderEmissive);
  placeSquareFill(rig.markCore, at, size, visual.fill, visual.fillTint, visual.fillEmissive);
  paintMaxLabel(at, visual.max);
}

function paintResultWash(_won: boolean, _heldMs: number): void {
  // No yellow / red full-screen wash — plain KO text is enough.
  hideCameraFlash();
}

function paintOverlays(_nowMs: number, _yourFraction: number): void {
  hideCameraFlash();
}

function paintImpact(nowMs: number): void {
  if (!rig) return;
  const burst = scrapImpactBurst(nowMs - impactAt);
  const impactTf = Transform.getMutableOrNull(rig.impact);
  const hurtTf = Transform.getMutableOrNull(rig.hurtImpact);
  if (burst.alpha <= 0) {
    if (impactTf) impactTf.scale = HIDDEN;
    if (hurtTf) hurtTf.scale = HIDDEN;
  } else if (impactLocal) {
    if (impactTf) impactTf.scale = HIDDEN;
    const camTf = Transform.getOrNull(rig.cam);
    if (camTf && hurtTf) {
      const local = Vector3.create(impactLocal.x, impactLocal.y, 0.82);
      hurtTf.position = Vector3.add(camTf.position, Vector3.rotate(local, camTf.rotation));
      const s = burst.scale * 0.42;
      hurtTf.scale = Vector3.create(s, s, s);
    }
    for (const part of rig.hurtImpactParts) {
      glowMat(part, 0.68, 0.12, 0.5, burst.alpha * 0.82, 4 * burst.alpha);
    }
  } else {
    if (hurtTf) hurtTf.scale = HIDDEN;
    if (impactTf) {
      impactTf.position = impactPos;
      impactTf.scale = Vector3.create(burst.scale, burst.scale, burst.scale);
    }
    glowMat(rig.impactParts[0]!, 1, 1, 1, burst.alpha, 14 * burst.alpha);
    glowMat(rig.impactParts[1]!, 1, 1, 1, burst.alpha, 14 * burst.alpha);
    glowMat(rig.impactParts[2]!, 1, 0.9, 0.4, burst.alpha * 0.8, 11 * burst.alpha);
  }
  const pop = scrapDamagePop(nowMs - dmgAt);
  const dmgTf = Transform.getMutableOrNull(rig.dmgText);
  if (dmgTf) {
    if (pop.alpha <= 0 || impactLocal) {
      dmgTf.scale = HIDDEN;
    } else {
      dmgTf.position = Vector3.create(impactPos.x, impactPos.y + 0.26 + pop.rise, impactPos.z);
      dmgTf.scale = Vector3.create(pop.scale, pop.scale, pop.scale);
      const shape = TextShape.getMutableOrNull(rig.dmgText);
      if (shape) {
        if (shape.text !== dmgLabel) shape.text = dmgLabel;
        const c =
          dmgTier === "turbo"
            ? Color4.create(1, 0.25, 0.15, pop.alpha)
            : dmgTier === "close"
              ? Color4.create(1, 0.62, 0.2, pop.alpha)
              : dmgTier === "miss"
                ? Color4.create(0.9, 0.9, 0.92, pop.alpha)
                : Color4.create(1, 1, 1, pop.alpha);
        shape.textColor = c;
        shape.outlineColor = Color4.create(0, 0, 0, pop.alpha);
      }
    }
  }
}

let verdictAt = 0;
let verdictKind: ScrapVerdictKind = "info";
let verdictLabel = "";
/** Big side readout: your last punch as one huge number, short-lived. */
const SCORE_MS = 1400;
let scoreAt = 0;
let scorePctVal = 0;
let scoreTierVal: "max" | "hit" | "miss" | null = null;

function showScore(tier: "max" | "hit" | "miss", pct: number, nowMs: number): void {
  scoreTierVal = tier;
  scorePctVal = Math.max(0, Math.min(100, Math.round(pct)));
  scoreAt = nowMs;
}

/** ONE short line. The newest replaces the last; two at once is noise. */
function showVerdict(kind: ScrapVerdictKind, label: string, nowMs: number): void {
  verdictKind = kind;
  verdictLabel = label;
  verdictAt = nowMs;
}

function externalRoleForMove(move: ScrapMoveKind): Parameters<typeof scrapEmoteBinding>[0] {
  if (move === "jab" || move === "combo") return "jab";
  if (move === "uppercut") return "uppercut";
  if (move === "front_kick") return "frontKick";
  return "cross";
}

function scheduleFollowupContact(move: ScrapMoveKind, npc: ScrapFightActor, nowMs: number): void {
  const contacts = scrapMove(move).contacts;
  if (contacts.length < 2) return;
  followupContactAt = nowMs + Math.round((contacts[1]!.at - contacts[0]!.at) * scrapMove(move).durationMs);
  followupNpc = npc;
}

function tickFollowupContact(nowMs: number): void {
  if (!followupContactAt || nowMs < followupContactAt || !followupNpc) return;
  const npc = followupNpc;
  followupContactAt = 0;
  followupNpc = null;
  impactLocal = null;
  impactPos = Vector3.create(npc.x, npc.y + HEAD_Y - 0.08, npc.z);
  impactAt = nowMs;
  // Outgoing contact never shakes the player's camera.
  lunge(0.24);
  playSfx(SFX_PUNCH_COMBO, 0.9);
  void triggerSceneEmote({ src: scrapEmoteBinding("cross").ref, loop: false });
}

function setText(entity: Entity, text: string): void {
  const shape = TextShape.getMutableOrNull(entity);
  if (shape && shape.text !== text) shape.text = text;
}

const PROMPT_RANGE_M = 9;

/** Closest NPC to the player, if one is near enough to be worth prompting. */
function nearestActor(actors: readonly ScrapFightActor[]): ScrapFightActor | null {
  const player = Transform.getOrNull(engine.PlayerEntity) ?? Transform.getOrNull(engine.CameraEntity);
  if (!player) return null;
  let best: ScrapFightActor | null = null;
  let bestGap = PROMPT_RANGE_M;
  for (const actor of actors) {
    const gap = Math.hypot(actor.x - player.position.x, actor.z - player.position.z);
    if (gap < bestGap) {
      bestGap = gap;
      best = actor;
    }
  }
  return best;
}

function showPrompt(npc: ScrapFightActor, text: string): void {
  const r = ensureRig();
  if (!promptVisible) {
    promptVisible = true;
    VisibilityComponent.createOrReplace(r.promptText, { visible: true });
  }
  const tf = Transform.getMutableOrNull(r.promptText);
  if (tf) tf.position = Vector3.create(npc.x, npc.y + 2.5, npc.z);
  setText(r.promptText, text);
}

function hidePrompt(): void {
  if (!rig || !promptVisible) return;
  promptVisible = false;
  VisibilityComponent.createOrReplace(rig.promptText, { visible: false });
}

function resetHud(state: ScrapFightState): void {
  theirShown = state.theirHp;
  theirChipShown = state.theirHp;
  yourShown = state.yourHp;
  yourChipShown = state.yourHp;
  theirDmgAt = 0;
  yourDmgAt = 0;
  impactAt = 0;
  dmgAt = 0;
  lungeUntil = 0;
  impactLocal = null;
  verdictAt = 0;
  lastCue = "wait";
  cueChangedAt = 0;
  scoreAt = 0;
  scoreTierVal = null;
  npcSwingCount = 0;
  npcBreatherUntil = 0;
  incomingKickStartMs = 0;
  incomingKickDurationMs = 0;
}

function tickBars(state: ScrapFightState, nowMs: number, dtMs: number): number {
  theirShown = scrapBarDrain(theirShown, state.theirHp, dtMs);
  theirChipShown = scrapChipDrain(theirChipShown, state.theirHp, nowMs, theirDmgAt, dtMs);
  yourShown = scrapBarDrain(yourShown, state.yourHp, dtMs);
  yourChipShown = scrapChipDrain(yourChipShown, state.yourHp, nowMs, yourDmgAt, dtMs);
  return scrapHealthFraction(yourShown, state.yourMaxHp);
}

function argumentLabel(presses: number): string {
  if (presses <= 0) return "press E to start something";
  if (presses === 1) return "they noticed you — E again";
  if (presses === 2) return "that got a reaction — one more E";
  return "here it comes";
}

function startFight(session: ScrapSession, nowMs: number, config: ScrapConfig, npc: ScrapFightActor): void {
  ensureRig();
  showRig(true);
  glovesVisible = true;
  setOwnBodyHidden(true);
  timing = scrapSkillTuning(session.skill, session.npcIndex);
  fight = emptyScrapFight(nowMs, session.seed, timing, session.fightPenalty);
  fightNpcIndex = session.npcIndex;
  lastSessionId = session.id;
  pendingResult = null;
  pendingPunch = null;
  pendingDodge = null;
  upperTellUntil = 0;
  cancelCharge();
  alignValue = 0;
  followupContactAt = 0;
  followupNpc = null;
  incomingKickStartMs = 0;
  incomingKickDurationMs = 0;
  punchUntil = 0;
  punchStartMs = 0;
  punchKind = "cross";
  nextAutoPunch = "jab";
  lastPunchTapAt = 0;
  shakeUntil = 0;
  lastFrameMs = nowMs;
  faultLogged = false;
  resolveStartMs = 0;
  playerFellAt = 0;
  playerOnFloor = false;
  playerDownIdleAt = 0;
  playerKoBodyAt = 0;
  playerKoApexSent = false;
  playerKoLandSent = false;
  pendingProceed = false;
  koCutAt = 0;
  koCamLocked = false;
  playerKoPlan = null;
  resultJingleAt = 0;
  resetHud(fight);
  hypeMeter = 0;
  comboName = "";
  comboAt = 0;
  lastAttackKind = null;
  lastAttackAt = 0;
  setInputLock("bout");
  setBed(true, config);
  playSfx(SFX_BELL, 0.6);
  pushFx({ kind: "stance" });
  showVerdict("info", "FIGHT", nowMs);
  console.log(
    `[scrap] fight ${session.id} vs npc ${session.npcIndex} — skill ${session.skill.toFixed(2)}, ` +
      `${timing.theirHp}hp, pattern ${timing.pattern.id} @${timing.speed.toFixed(2)}, ko ${fight.koStyle}` +
      (session.fightPenalty ? `, you start ${session.fightPenalty} down` : "")
  );
}

function stopFight(): void {
  if (playerOnFloor) {
    void triggerSceneEmote({
      src: scrapEmoteBinding("rise").ref,
      loop: false,
    });
  }
  if (fight || rigVisible) lastFightEndedAt = Date.now();
  fight = null;
  glowLingerSide = null;
  glowLingerUntil = 0;
  fightNpcIndex = null;
  bindScrapHumanPlayerDoll(null);
  lastSessionId = null;
  playerFellAt = 0;
  playerOnFloor = false;
  playerDownIdleAt = 0;
  playerKoBodyAt = 0;
  playerKoApexSent = false;
  playerKoLandSent = false;
  pendingProceed = false;
  koCamLocked = false;
  playerKoPlan = null;
  punchUntil = 0;
  punchStartMs = 0;
  pendingPunch = null;
  pendingQuit = false;
  pendingDodge = null;
  cancelCharge();
  alignValue = 0;
  followupContactAt = 0;
  followupNpc = null;
  showRig(false);
  if (!humanPossessed) setOwnBodyHidden(false);
  releaseFightCam();
  if (!humanPossessed) setInputLock("none");
  setBed(false, { fightMusic: "" } as ScrapConfig);
  hud = emptyHud();
}

export function consumeScrapFightResult(): "player_win" | "npc_win" | "walk_away" | null {
  const result = pendingResult;
  pendingResult = null;
  return result;
}

export function consumeScrapFightProceed(): boolean {
  const go = pendingProceed;
  pendingProceed = false;
  return go;
}

/** How hot the argument is, 0..1. Written by the director tick. */
export function setScrapAngerValue(value: number): void {
  angerValue = Math.max(0, Math.min(1, value));
}

export function consumeScrapAcceptFight(): boolean {
  const accept = pendingAccept;
  pendingAccept = false;
  return accept;
}

export function scrapFightNpcIndex(): number | null {
  return fightNpcIndex;
}

export function isScrapFightActive(): boolean {
  return fight !== null || rigVisible;
}

export function isScrapHumanFightActive(): boolean {
  return isScrapFightActive() || humanPossessed;
}

export function isScrapHumanPossessed(): boolean {
  return humanPossessed;
}

export function setScrapHumanPossessed(on: boolean): void {
  humanPossessed = on;
  if (on) {
    pendingHumanLeave = false;
    setOwnBodyHidden(true);
    setInputLock(fight ? "bout" : "bout");
    return;
  }
  pendingHumanLeave = false;
  if (!fight && !rigVisible) {
    setOwnBodyHidden(false);
    setInputLock("none");
  }
}

/** Proper end: unpossess, drop the rig, then the ring kicks you onto the street. */
export function endScrapHumanFight(): void {
  humanPossessed = false;
  pendingHumanLeave = false;
  stopFight();
  setOwnBodyHidden(false);
  setInputLock("none");
}

export function consumeScrapHumanLeave(): boolean {
  const leave = pendingHumanLeave;
  pendingHumanLeave = false;
  return leave;
}

/** @deprecated Walk-off must not end a possessed bout. Prefer consumeScrapHumanLeave. */
export function quitScrapHumanFight(): void {
  if (humanPossessed) pendingHumanLeave = true;
  else if (fight) pendingQuit = true;
}

export function bindScrapHumanPlayerDoll(entity: Entity | null): void {
  if (humanPlayerDoll && humanPlayerDoll !== entity) {
    VisibilityComponent.createOrReplace(humanPlayerDoll, { visible: true });
  }
  humanPlayerDoll = entity;
  if (entity) VisibilityComponent.createOrReplace(entity, { visible: false });
}

export function scrapFightOwnsInput(nowMs = Date.now()): boolean {
  return fight !== null || rigVisible || nowMs - lastFightEndedAt < 400;
}

export function ensureScrapFightSystem(): void {
  if (systemOn) return;
  systemOn = true;
  onActionKey("primary", () => {
    if (requestResultProceed()) return;
    if (fight) return; // hold-to-charge is polled while the bout is live
    pendingAccept = true;
  });
  // F is the KICK once the bell rings. Walking out of a live bout is [4] or
  // the on-screen LEAVE button — deliberately off the combat fingers, because
  // a mis-hit exit ends the bout and there is no way back into it.
  onActionKey("secondary", () => {
    // Outside a bout F still steps off the glove pad.
    if (!fight && humanPossessed) pendingHumanLeave = true;
  });
  engine.addSystem(scrapFightSystem);
}

export function syncScrapFight(input: {
  nowMs: number;
  config: ScrapConfig;
  session: ScrapSession | null;
  actors: readonly ScrapFightActor[];
  selectedNpcIndex?: number | null;
  hoveredNpcIndex?: number | null;
}): void {
  lastSyncAt = input.nowMs;
  try {
    syncScrapFightUnsafe(input);
  } catch (err) {
    if (!faultLogged) {
      faultLogged = true;
      console.log(`[scrap] fight view fault, ending bout: ${String(err)}`);
    }
    try {
      stopFight();
    } catch {
      fight = null;
      camBound = false;
      rigVisible = false;
      setInputLock("none");
      setOwnBodyHidden(false);
    }
  }
}

function syncScrapFightUnsafe(input: {
  nowMs: number;
  config: ScrapConfig;
  session: ScrapSession | null;
  actors: readonly ScrapFightActor[];
  selectedNpcIndex?: number | null;
  hoveredNpcIndex?: number | null;
}): void {
  ensureScrapFightSystem();
  const session = input.session;
  const talking =
    session &&
    (session.phase === "tease" || session.phase === "escalate" || session.phase === "challenge");
  const approaching = session?.phase === "approach";
  const inFight = session?.phase === "fight";
  const resolving = session?.phase === "resolve";
  const won = resolving === true && session!.outcome === "player_win";
  const lost = resolving === true && session!.outcome === "npc_win";

  const acceptClick = inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN);
  if (!inFight && !won && !lost) {
    if (chargeSource) cancelCharge();
    if ((talking || approaching) && acceptClick) pendingAccept = true;
    if (fight || rigVisible) stopFight();
    const pickIndex = input.selectedNpcIndex ?? input.hoveredNpcIndex ?? session?.npcIndex ?? null;
    const pick = pickIndex != null ? input.actors.find((row) => row.npcIndex === pickIndex) : undefined;
    const hassle = !!(talking || approaching);
    const punchable =
      !!pick &&
      (hassle || input.selectedNpcIndex === pick.npcIndex || input.hoveredNpcIndex === pick.npcIndex);
    if (punchable && pick) {
      showWorldAim(pick);
      showPrompt(pick, hassle ? "PUNCH — they're on you" : "PUNCH");
    } else {
      hideWorldAim();
      hidePrompt();
    }
    hud = emptyHud();
    return;
  }
  hidePrompt();
  hideWorldAim();

  const npc = input.actors.find((row) => row.npcIndex === session!.npcIndex);
  if (!npc) return;

  if (inFight && lastSessionId !== session!.id) {
    startFight(session!, input.nowMs, input.config, npc);
  }

  const dtMs = Math.max(0, Math.min(250, input.nowMs - lastFrameMs));
  lastFrameMs = input.nowMs;

  if (won || lost) {
    if (!rigVisible || !rig) return;
    if (!resolveStartMs) {
      resolveStartMs = input.nowMs;
      const me = Transform.getOrNull(engine.PlayerEntity);
      koCamOx = me?.position.x ?? npc.x;
      koCamOy = me?.position.y ?? npc.y;
      koCamOz = me?.position.z ?? npc.z;
      koCamNpcX = npc.x;
      koCamNpcY = npc.y;
      koCamNpcZ = npc.z;
      koCamLocked = true;
    }
    const held = input.nowMs - resolveStartMs;
    // Freeze feet for the whole resolve: the wide shot must show a body that
    // stays on the floor. Walk during a bout is fine; walk during a KO is not.
    setInputLock("ko");
    // Hold the impact in first person for a beat, THEN cut wide. The gloves
    // ride the camera rig, so they go for the wide shot.
    if (held < SCRAP_KO_CAM_HOLD_MS) {
      aimFightCam(npc, input.nowMs);
    } else {
      if (!koCutAt) koCutAt = input.nowMs;
      setGlovesVisible(false);
      koFightCam(npc, input.nowMs, Math.min(1, (input.nowMs - koCutAt) / SCRAP_KO_CAM_ORBIT_MS));
    }
    if (held >= SCRAP_KO_CAM_HOLD_MS && !resultJingleAt) {
      resultJingleAt = input.nowMs;
      setBed(false, input.config);
      playSfx(SFX_KO, 0.85);
    }
    if (!playerFellAt && held >= SCRAP_KO_CAM_HOLD_MS) {
      playerFellAt = input.nowMs;
      if (lost) {
        playerOnFloor = true;
        playerKoStyle = fight?.koStyle ?? "crumple";
        playerKoBodyAt = 0;
        playerKoApexSent = false;
        playerKoLandSent = false;
        const me = Transform.getOrNull(engine.PlayerEntity);
        playerFallOx = me?.position.x ?? npc.x;
        playerFallOy = me?.position.y ?? npc.y;
        playerFallOz = me?.position.z ?? npc.z;
        const ground = scrapKoGround();
        const travel0 = scrapKoTravel(playerKoStyle);
        playerKoPlan = scrapKoKnockbackPlan({
          originX: playerFallOx,
          originY: playerFallOy,
          originZ: playerFallOz,
          foeX: npc.x,
          foeZ: npc.z,
          backM: travel0.backM,
          upM: travel0.upM,
          solids: ground.solids,
          sceneMin: ground.sceneMin,
          sceneMax: ground.sceneMax,
        });
        if (playerKoPlan.stayPut) {
          playerKoApexSent = true;
          playerKoLandSent = true;
        }
        const preludeMs = scrapKoPreludeMs(playerKoStyle);
        if (preludeMs > 0) {
          void triggerSceneEmote({
            src: scrapEmoteBinding(playerKoStyle === "stagger" ? "hurt" : "dizzy").ref,
            loop: false,
          });
        } else {
          void triggerSceneEmote({
            src: scrapEmoteBinding(scrapKoRole(playerKoStyle)).ref,
            loop:
              playerKoStyle === "knees" ||
              playerKoStyle === "crouch" ||
              playerKoStyle === "heap",
          });
          playerKoBodyAt = input.nowMs;
        }
      }
    }
    if (playerOnFloor && playerFellAt) {
      const preludeMs = scrapKoPreludeMs(playerKoStyle);
      if (preludeMs > 0 && !playerKoBodyAt && input.nowMs - playerFellAt >= preludeMs) {
        playerKoBodyAt = input.nowMs;
        void triggerSceneEmote({
          src: scrapEmoteBinding(scrapKoRole(playerKoStyle)).ref,
          loop:
            playerKoStyle === "knees" ||
            playerKoStyle === "crouch" ||
            playerKoStyle === "heap",
        });
      }
      const originT = playerKoBodyAt || (preludeMs > 0 ? 0 : playerFellAt);
      const travel = scrapKoTravel(playerKoStyle);
      if (
        originT &&
        (playerKoStyle === "fly_back" ||
          playerKoStyle === "spin" ||
          playerKoStyle === "slam" ||
          playerKoStyle === "roll")
      ) {
        if (playerKoPlan?.stayPut) {
          playerKoApexSent = true;
          playerKoLandSent = true;
        } else if (!playerKoApexSent) {
          playerKoApexSent = true;
          const plan =
            playerKoPlan ??
            scrapKoKnockbackPlan({
              originX: playerFallOx,
              originY: playerFallOy,
              originZ: playerFallOz,
              foeX: npc.x,
              foeZ: npc.z,
              backM: travel.backM,
              upM: travel.upM,
              solids: scrapKoGround().solids,
              sceneMin: scrapKoGround().sceneMin,
              sceneMax: scrapKoGround().sceneMax,
            });
          playerKoPlan = plan;
          if (plan.stayPut) {
            playerKoLandSent = true;
          } else {
            void movePlayerTo({
              newRelativePosition: {
                x: plan.apexX,
                y: plan.apexY,
                z: plan.apexZ,
              },
              duration: travel.durationMs / 2000,
            });
          }
        } else if (!playerKoLandSent && input.nowMs - originT >= travel.durationMs / 2) {
          playerKoLandSent = true;
          const plan = playerKoPlan;
          if (plan && !plan.stayPut) {
            void movePlayerTo({
              newRelativePosition: {
                x: plan.destX,
                y: plan.destY,
                z: plan.destZ,
              },
              duration: travel.durationMs / 2000,
            });
          }
        }
      }
      if (
        !playerDownIdleAt &&
        originT &&
        playerKoStyle !== "knees" &&
        playerKoStyle !== "crouch" &&
        playerKoStyle !== "heap" &&
        input.nowMs - originT >= scrapKoClipMs(playerKoStyle)
      ) {
        playerDownIdleAt = input.nowMs;
        void triggerSceneEmote({
          src: scrapEmoteBinding("downIdle").ref,
          loop: true,
        });
      }
    }
    const yourFraction = fight ? tickBars(fight, input.nowMs, dtMs) : 1;
    paintResultWash(won, held);
    paintImpact(input.nowMs);
    poseGloves(Date.now());
    hideMarker();
    hud = {
      ...hud,
      fighting: false,
      result: won ? "won" : "lost",
      resultAgeMs: held,
      resultCanProceed: held >= SCRAP_RESULT_PROCEED_MS,
      resultDetail: "",
      theirHp: theirShown,
      yourHp: yourShown,
      theirChip: theirChipShown,
      yourChip: yourChipShown,
      verdict: "",
      verdictLife: 0,
      instruction: "",
      argument: null,
      lockedOn: false,
      lowPulse: 0,
      cue: "wait",
      gloveGlowLeft: 0,
      gloveGlowRight: 0,
    };
    if (held >= SCRAP_RESULT_PROCEED_MS) pendingProceed = true;
    void yourFraction;
    return;
  }

  if (!fight || !rig) return;

  aimFightCam(npc, input.nowMs);
  tickScrapHitKnock(input.nowMs);

  if (pendingQuit) {
    pendingQuit = false;
    fight = scrapFightQuit(fight);
    showVerdict("miss", "WALKED OUT", input.nowMs);
  }

  // 0. Charge automatically pulls the target match; Shift raises the gloves;
  // E / F / Space are punch, kick and uppercut.
  const defendHands = defendHandsThisFrame();
  tickChargeInput(input.nowMs);
  const aligning = aligningThisFrame();
  alignValue = scrapAlignStep(alignValue, aligning, dtMs);
  const punched = punchedThisFrame();
  if (fight.dodgeHeld) fight = scrapFightReleaseDodge(fight);

  // Range is measured from YOUR DOLL, exactly where the eye-camera sits. The
  // real (hidden) body used to be the yardstick, so a few invisible steps put
  // every swing — yours and theirs — permanently out of reach ("CLOSER"
  // forever, a CPU that never connects). Doll and camera now agree.
  const meDoll = humanPlayerDoll ? Transform.getOrNull(humanPlayerDoll) : null;
  const me =
    meDoll ?? Transform.getOrNull(engine.PlayerEntity) ?? Transform.getOrNull(engine.CameraEntity);
  const gapM = me
    ? Math.hypot(me.position.x - npc.x, me.position.z - npc.z)
    : 99;

  // 1. Their rhythm: beats, swings, and what lands. Range is sampled at the
  // contact frame, so retreating out of reach is a real defensive choice.
  const ticked = scrapFightTick(fight, input.nowMs, timing, defendHands, gapM);
  fight = ticked.state;
  for (const ev of ticked.events) {
    if (
      ev.kind === "beat" &&
      ev.index === 0 &&
      scrapBreatherCycle(ev.cycle) &&
      input.nowMs >= npcBreatherUntil
    ) {
      // Every few loops they step out of reach to breathe. Swing/taunt clips
      // pause for the window so the retreat reads as one deliberate move; the
      // range gates already make both sides whiff while they are out there.
      npcBreatherUntil = input.nowMs + SCRAP_BREATHER_MS;
      pushFx({ kind: "npc_breather", ms: SCRAP_BREATHER_MS });
    }
    const breathing = input.nowMs < npcBreatherUntil;
    if (ev.kind === "swing_start") {
      npcSwingCount += 1;
      if (!breathing) {
        const visual = scrapSwingVisualRole(ev.swing, npcSwingCount, fight.seed);
        if (visual === "frontKick") {
          const beat = scrapBeatAt(fight, input.nowMs, timing);
          incomingKickStartMs = input.nowMs;
          incomingKickDurationMs = Math.max(320, beat.lengthMs);
        }
        pushFx({
          kind: "npc_swing",
          swing: ev.swing,
          visual,
        });
      }
    } else if (ev.kind === "beat" && ev.beat === "tell") {
      if (!breathing) pushFx({ kind: "tell" });
    } else if (ev.kind === "beat" && ev.beat === "guard") {
      if (!breathing) pushFx({ kind: "npc_guard" });
    } else if (ev.kind === "swing_land") {
      const heavy = ev.swing === "cross" || ev.exposed;
      yourDmgAt = input.nowMs;
      hurtFlinchAt = Date.now();
      // Where it came from: a jab from their left (your right), a cross the other way.
      impactLocal = { x: ev.swing === "jab" ? 0.64 : -0.64, y: 0.03 };
      impactAt = input.nowMs;
      const hitFeel = scrapReceivedHitFeel({ swing: ev.swing, exposed: ev.exposed });
      flash(true, hitFeel.stage === "heavy" ? 420 : hitFeel.stage === "medium" ? 220 : 110);
      shake(hitFeel.shakeStrength, hitFeel.shakeMs, input.nowMs, hitFeel.stage);
      lunge(hitFeel.stage === "heavy" ? -0.55 : hitFeel.stage === "medium" ? -0.28 : -0.12);
      playSfx(hitFeel.stage === "light" ? SFX_HURT_LIGHT : SFX_HURT_HEAVY, hitFeel.stage === "heavy" ? 1 : 0.7);
      if (hitFeel.shockwave === "heavy") playWorldShockwave(true);
      else if (hitFeel.shockwave === "light") playWorldShockwave(false);
      const received = scrapHitKnockSpec({
        side: "received",
        charge: 0,
        turbo: ev.exposed,
        heavy,
        score: 0,
      });
      if (received) executeScrapHitKnock(npc.x, npc.z, received);
      pushFx({ kind: "hurt", heavy });
    } else if (ev.kind === "swing_blocked") {
      playSfx(SFX_WHOOSH, ev.perfect ? 0.72 : 0.5);
      if (ev.chip > 0) {
        yourDmgAt = input.nowMs;
        flash(true, 120);
        shake(0.03, 140, input.nowMs, "light");
      }
      hypeMeter = scrapHypeGain(hypeMeter, "block");
      pushFx({ kind: "dodged" });
    } else if (ev.kind === "swing_dodged") {
      hypeMeter = scrapHypeGain(hypeMeter, "dodge");
      pushFx({ kind: "dodged" });
    } else if (ev.kind === "swing_whiffed") {
      showVerdict("dodge", "SAFE", input.nowMs);
      playSfx(SFX_WHOOSH, 0.45);
    } else if (ev.kind === "upper_tell") {
      // The turtle punish is winding up. This is the ONLY warning, and no
      // amount of guard answers it — the HUD says so in words.
      upperTellUntil = input.nowMs + ev.inMs;
      showVerdict("miss", "DROP A HAND", input.nowMs);
      playSfx(SFX_WHOOSH, 0.9);
      pushFx({ kind: "tell" });
    } else if (ev.kind === "upper_avoided") {
      upperTellUntil = 0;
      showVerdict("dodge", "SAFE", input.nowMs);
      playSfx(SFX_WHOOSH, 0.5);
      pushFx({ kind: "dodged" });
    } else if (ev.kind === "upper_land") {
      upperTellUntil = 0;
      yourDmgAt = input.nowMs;
      hurtFlinchAt = Date.now();
      // It comes up the middle, so the impact reads from below centre.
      impactLocal = { x: 0, y: -0.42 };
      impactAt = input.nowMs;
      const upperFeel = scrapReceivedHitFeel({ swing: "upper", exposed: true });
      flash(true, 420);
      shake(upperFeel.shakeStrength, upperFeel.shakeMs, input.nowMs, upperFeel.stage);
      lunge(-0.5);
      playSfx(SFX_PUNCH_HOOK, 1);
      playWorldShockwave(true);
      showVerdict("miss", "UPPER", input.nowMs);
      const upperKnock = scrapHitKnockSpec({
        side: "received",
        charge: 1,
        turbo: true,
        heavy: true,
        score: 0,
      });
      if (upperKnock) executeScrapHitKnock(npc.x, npc.z, upperKnock);
      pushFx({ kind: "hurt", heavy: true });
    }
  }

  const hookReady = scrapMoveInRange("uppercut", gapM);
  const kickReady = scrapMoveInRange("front_kick", gapM);
  const geometry = targetGeometry(npc, input.nowMs, fight.seed, alignValue);
  const chargeNow = currentCharge(input.nowMs);

  // 2. Your smash: align + cue decide quality; charge scales damage.
  if (punched && fight.outcome === "pending") {
    const reachOk = scrapMoveInRange(punched.kind, gapM);
    const swung = scrapFightPunch({
      state: fight,
      nowMs: input.nowMs,
      timing,
      charge: punched.charge,
      align: geometry.match,
      reachOk,
      move: punched.kind,
    });
    if (swung.result === "ignored" && swung.reason === "tired") {
      showVerdict("info", "TIRED", input.nowMs);
    } else if (swung.result !== "ignored") {
      fight = swung.state;
      punchKind = punched.kind;
      if (punched.kind === "jab" || punched.kind === "cross") {
        nextAutoPunch = punched.kind === "jab" ? "cross" : "jab";
      }
      punchBand = scrapMove(punched.kind).band;
      punchStartMs = Date.now();
      punchUntil = punchStartMs + scrapGlovePunchDuration(punchKind);
      impactLocal = null;
      impactPos = Vector3.create(
        npc.x,
        npc.y + (swung.result === "turbo" || punched.kind === "uppercut" ? HEAD_Y - 0.05 : MARK_Y),
        npc.z
      );
      const emoteRole = externalRoleForMove(punched.kind);
      void triggerSceneEmote({ src: scrapEmoteBinding(emoteRole).ref, loop: false });
      const powerPct = Math.round(swung.charge * 100);
      if (swung.result === "miss") {
        dmgTier = "miss";
        dmgLabel = "";
        showVerdict(
          "miss",
          !reachOk
            ? punched.kind === "front_kick" && gapM < scrapMove("front_kick").minRangeM
              ? "TOO CLOSE"
              : "TOO FAR"
            : swung.cue === "now" || swung.cue === "incoming"
              ? "MISS"
              : "TOO EARLY",
          input.nowMs
        );
        showScore("miss", powerPct, input.nowMs);
        playSfx(SFX_WHOOSH, 0.6);
        lunge(0.1);
        pushFx({ kind: "miss" });
      } else {
        scheduleFollowupContact(punched.kind, npc, input.nowMs);
        const turbo = swung.result === "turbo";
        theirDmgAt = input.nowMs;
        impactAt = input.nowMs;
        dmgAt = input.nowMs;
        dmgTier = turbo ? "turbo" : "close";
        const callout = scrapHitCallout(swung.overlap);
        dmgLabel = callout === "max" ? "MAX" : "HIT";
        showVerdict(turbo ? "hit" : "close", callout === "max" ? "MAX" : "HIT", input.nowMs);
        showScore(callout === "max" ? "max" : "hit", powerPct, input.nowMs);
        const feel = scrapLandedHitFeel(turbo ? "turbo" : "close", swung.score);
        const power = Math.max(0.35, swung.charge);
        flash(false, turbo ? 200 : 110);
        lunge(
          (turbo ? (punched.kind === "combo" || punched.kind === "uppercut" ? 0.5 : 0.42) : 0.16) * power
        );
        const punchVol = (turbo ? 1 : 0.65) * (0.55 + 0.45 * power);
        // Combo = double thud; uppercut = rising hook slam; jab/cross stay light/heavy.
        const punchClip =
          punched.kind === "combo"
            ? SFX_PUNCH_LIGHT
            : punched.kind === "uppercut"
              ? SFX_PUNCH_HOOK
              : punched.kind === "front_kick"
                ? SFX_PUNCH_HEAVY
              : turbo
                ? SFX_PUNCH_HEAVY
                : SFX_PUNCH_LIGHT;
        playSfx(punchClip, punchVol);
        if (feel.shockwave === "heavy" && (swung.score >= 100 || swung.charge >= 0.85)) {
          playWorldShockwave(true);
        } else if (feel.shockwave === "light" || (feel.shockwave === "heavy" && swung.charge >= 0.55)) {
          playWorldShockwave(false);
        }
        hypeMeter = scrapHypeGain(hypeMeter, "landed");
        if (turbo) hypeMeter = scrapHypeGain(hypeMeter, "turbo");
        pushFx({ kind: "landed", tier: turbo ? "turbo" : "close", charge: swung.charge, score: swung.score });
      }
    }
  }

  // HYPE is earned, not pressed. It bleeds while nothing is happening and
  // banks MAX power for one punch the moment it fills — which is why Space is
  // free to be the uppercut.
  hypeMeter = scrapHypeDecay(hypeMeter, dtMs);
  if (scrapHypeBankReady(fight, hypeMeter, input.nowMs)) {
    fight = scrapFightHypeBank(fight, input.nowMs);
    hypeMeter = 0;
    showVerdict("info", "MAX POWER", input.nowMs);
    playSfx(SFX_WHOOSH, 0.85);
  }

  // 3. Paint.
  const cueNow = scrapCueAt(fight, input.nowMs, timing);
  const theirLock = scrapTheirLock(fight, input.nowMs, timing);
  const theirInRange = theirLock.swing ? scrapMoveInRange(theirLock.swing, gapM) : false;
  const outsideStrikeRange =
    !scrapMoveInRange("jab", gapM) && !scrapMoveInRange("cross", gapM);
  const safeDistance = theirLock.swing ? !theirInRange : outsideStrikeRange;
  const geometryNow = targetGeometry(npc, input.nowMs, fight.seed, alignValue);
  const overlapNow = scrapOverlapQuality(cueNow.cue, geometryNow.match);
  paintMarker(cueNow.cue, input.nowMs, geometryNow, !outsideStrikeRange, chargeNow);
  const yourFraction = tickBars(fight, input.nowMs, dtMs);
  paintOverlays(input.nowMs, yourFraction);
  paintImpact(input.nowMs);
  tickFollowupContact(input.nowMs);
  poseGloves(Date.now(), defendHands);

  const exposed = input.nowMs < fight.exposedUntilMs;
  const verdictLeft = verdictAt ? VERDICT_MS - (input.nowMs - verdictAt) : 0;
  const blockSide = scrapBlockCue(theirLock.swing, timing.pattern.id);
  const incoming = (theirLock.aiming || theirLock.locked) && theirInRange;
  if (incoming && blockSide) {
    glowLingerSide = blockSide;
    glowLingerUntil = input.nowMs + SCRAP_GLOVE_GLOW_LINGER_MS;
  }
  const linger =
    glowLingerSide && input.nowMs < glowLingerUntil
      ? (glowLingerUntil - input.nowMs) / SCRAP_GLOVE_GLOW_LINGER_MS
      : 0;
  if (!incoming && linger <= 0) glowLingerSide = null;
  const leftGlow = scrapGloveBlockGlow({
    threatened: incoming && (blockSide === "left" || blockSide === "both"),
    locked: theirLock.locked && theirInRange && (blockSide === "left" || blockSide === "both"),
    settle: blockSide === "left" || blockSide === "both" ? theirLock.settle : 0,
    linger: (glowLingerSide === "left" || glowLingerSide === "both") && !incoming ? linger : 0,
    nowMs: input.nowMs,
  });
  const rightGlow = scrapGloveBlockGlow({
    threatened: incoming && (blockSide === "right" || blockSide === "both"),
    locked: theirLock.locked && theirInRange && (blockSide === "right" || blockSide === "both"),
    settle: blockSide === "right" || blockSide === "both" ? theirLock.settle : 0,
    linger: (glowLingerSide === "right" || glowLingerSide === "both") && !incoming ? linger : 0,
    nowMs: input.nowMs,
  });
  hud = {
    fighting: true,
    result: null,
    resultDetail: "",
    resultAgeMs: 0,
    resultCanProceed: false,
    theirHp: theirShown,
    theirMax: fight.theirMaxHp,
    yourHp: yourShown,
    yourMax: fight.yourMaxHp,
    theirChip: theirChipShown,
    yourChip: yourChipShown,
    cue: cueNow.cue,
    verdict: verdictLeft > 0 ? verdictLabel : "",
    verdictKind,
    verdictLife: verdictLeft > 0 ? (verdictLeft > VERDICT_MS / 3 ? 1 : verdictLeft / (VERDICT_MS / 3)) : 0,
    instruction: scrapFightHint({
      safe: safeDistance,
      exposed,
      incoming,
      overlap: overlapNow,
      aligning,
      cue: cueNow.cue,
    }),
    argument: null,
    lockedOn: theirLock.locked && theirInRange,
    lowPulse: scrapLowHealthPulse(yourFraction, input.nowMs),
    exposed,
    dodging: !!defendHands,
    upperTell: input.nowMs < upperTellUntil,
    patternRead: timing.pattern.read,
    scorePct: scorePctVal,
    scoreTier: scoreTierVal,
    scoreLife: scoreAt ? Math.max(0, 1 - (input.nowMs - scoreAt) / SCORE_MS) : 0,
    charge: chargeNow,
    charging: !!chargeSource || scrapHypePowerLive(fight, input.nowMs),
    align: geometryNow.match,
    aligning,
    overlap: overlapNow,
    hookReady,
    kickReady,
    stamina: fight.yourStamina,
    staminaMax: fight.yourMaxStamina,
    blockSide,
    gloveGlowLeft: leftGlow.intensity,
    gloveGlowRight: rightGlow.intensity,
    hypeReady:
      input.nowMs >= fight.hypeReadyAtMs &&
      fight.yourStamina >= SCRAP_HYPE_STAMINA &&
      !scrapHypeClapping(fight, input.nowMs),
    hypePower: scrapHypePowerLive(fight, input.nowMs),
    hype: scrapHypePowerLive(fight, input.nowMs) ? 1 : hypeMeter,
    fightMs: Math.max(0, input.nowMs - fight.startedAtMs),
    comboName: input.nowMs - comboAt < SCRAP_COMBO_NAME_MS ? comboName : "",
    comboLife:
      input.nowMs - comboAt < SCRAP_COMBO_NAME_MS
        ? Math.max(0, 1 - (input.nowMs - comboAt) / SCRAP_COMBO_NAME_MS)
        : 0,
  };
  paintGloveHalos(input.nowMs);


  if (fight.outcome !== "pending" && !pendingResult) {
    if (fight.outcome === "player_win") {
      pendingResult = "player_win";
      lunge(0.55);
      flash(false, 380);
      playSfx(SFX_KO, 1);
      playWorldShockwave(true);
      pushFx({ kind: "ko", style: fight.koStyle });
    } else if (fight.outcome === "npc_win") {
      pendingResult = "npc_win";
      shake(0.42, 900, input.nowMs, "heavy");
      flash(true, 720);
      playSfx(SFX_HURT_HEAVY, 1);
      playWorldShockwave(true);
      pushFx({ kind: "lost", style: fight.koStyle });
    } else {
      pendingResult = "walk_away";
      stopFight();
    }
  }
}

/**
 * Tear the rig down when its driver stops ticking.
 *
 * This runs from `scrapFightSystem`, which is added once by `ensureScrapFightSystem` and
 * is never gated on coordinator status, venue pause or the Scrap flag — so it keeps
 * running in exactly the situations that strand the rig. Nothing else can release the
 * player: `stopFight()` also unbinds the fight camera and unlocks jump.
 */
function scrapFightWatchdog(nowMs: number): void {
  if (!rigVisible && !fight) return;
  if (lastSyncAt === 0) return;
  if (nowMs - lastSyncAt < FIGHT_DRIVER_STALE_MS) return;
  console.log(
    `[scrap] fight driver stalled ${nowMs - lastSyncAt}ms — releasing the rig, ` +
      `the camera and the player (flight/jump were blocked)`
  );
  stopFight();
}

function scrapFightSystem(_dt: number): void {
  scrapFightWatchdog(Date.now());
  tickScrapHitKnock();
  if (!rigVisible || !fight) return;
  try {
    poseGloves(Date.now(), defendHandsThisFrame());
    paintImpact(Date.now());
  } catch {
    // rig mid-write; the next sync repaints it
  }
}

/** Kept for the flight gate + tests: punch cooldown is the click-storm guard. */
export const SCRAP_FIGHT_CLICK_GUARD_MS = SCRAP_FIGHT_PUNCH_COOLDOWN_MS;
