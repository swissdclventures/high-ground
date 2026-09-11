/**
 * Fight animation roles → emote refs.
 *
 * The Motion Studio starter set (move.swissverse.org/starter) has the real
 * boxing reactions: Fighting Idle, Punch_Jab, Punch_Cross, Hit_Knockback,
 * Dizzy, Death_A/B/C/D, Roll, Land_Three_Point, Crouch_Idle, LayToIdle,
 * Idle_ShakeOff, Tired_Hunched, Kneeling_Tired, Sleeping.
 *
 * Each role names a bundled path and, where one exists that is not a DANCE, a
 * base-emote fallback. An empty fallback means "play nothing" — standing in the
 * idle pose beats breaking into the MC Hammer shuffle mid-punch. A bundled path
 * that is not in `scene/emotes/` never resolves to a scene-emote URN, so the
 * fallback plays instead — which means this file can ship before the GLBs do,
 * and the fight upgrades itself the moment they land. Never let a role have no
 * fallback: an NPC with an unresolvable emote just stands there.
 *
 * The clips ARE bundled (from move.swissverse.org/starter, CC0-1.0). Adding
 * another: put the GLB in `scene/emotes/` FIRST, then add its `EMOTE_LIBRARY`
 * entry — the bundler throws on a library entry whose file is missing.
 *
 * These play on the NPC (AvatarShape, by scene-emote URN) AND on the local
 * player (triggerSceneEmote, by path) — which is the only way to show YOUR own
 * knockout, since nothing can animate another client's avatar.
 */

/**
 * Beat-card emote that means "play the boxing guard clip by ROLE, not a base
 * emote". The confrontation beats used `hammer` (the MC Hammer dance) and two
 * BREAKDANCE clips - which is why an NPC squaring up to fight was doing
 * footwork. Any beat that is part of a confrontation names this instead.
 */
export const SCRAP_GUARD_MARKER = "__fight_guard__";
/** Resolve after they beat you: troupe plays the gloat beats, not a card emote. */
export const SCRAP_GLOAT_MARKER = "__fight_gloat__";

import type { ScrapKoStyle } from "./scrap-fight";
import type { ScrapProvocationEmote } from "./scrap-anger";

export type ScrapEmoteRole =
  | "guard"
  | "footwork"
  | "weaveLeft"
  | "weaveRight"
  | "stepForward"
  | "jab"
  | "cross"
  | "uppercut"
  | "frontKick"
  | "hurt"
  | "hurtIdle"
  | "dizzy"
  | "down"
  | "rise"
  | "shake"
  | "victory"
  // The argument: one press = attention, two = a taunt, three = the push.
  | "attention"
  | "taunt1"
  | "taunt2"
  | "taunt3"
  | "push"
  // The knockout — twelve ways. Picked by seed so every opponent falls differently.
  | "koFlyBack"
  | "koSlam"
  | "koCrumple"
  | "koFaceDown"
  | "koKnees"
  | "koSpin"
  | "koRoll"
  | "koThreePoint"
  | "koCrouch"
  | "koHeap"
  | "tired"
  | "fistPump"
  /** Lying still after the fall — a death clip LOOPS on an AvatarShape, so this holds the floor. */
  | "downIdle";

export interface ScrapEmoteBinding {
  role: ScrapEmoteRole;
  /** Bundled GLB path, once the file is in scene/emotes/. */
  ref: string;
  /** DCL base emote until then. EMPTY = play nothing (never a dance). */
  fallback: string;
  /** Motion Studio clip name, for the download list. */
  clip: string;
}

export const SCRAP_EMOTES: readonly ScrapEmoteBinding[] = [
  { role: "guard", ref: "emotes/fighting_idle_emote.glb", fallback: "", clip: "Fighting Idle" },
  { role: "footwork", ref: "emotes/state_footwork_bounce_emote.glb", fallback: "", clip: "state.footwork.bounce" },
  { role: "weaveLeft", ref: "emotes/defense_evade_weave_left_emote.glb", fallback: "", clip: "defense.evade.weave.left" },
  { role: "weaveRight", ref: "emotes/defense_evade_weave_right_emote.glb", fallback: "", clip: "defense.evade.weave.right" },
  { role: "stepForward", ref: "emotes/move_combat_step_forward_emote.glb", fallback: "", clip: "move.combat.step.forward" },
  { role: "jab", ref: "emotes/punch_jab_emote.glb", fallback: "", clip: "Punch_Jab" },
  { role: "cross", ref: "emotes/punch_cross_emote.glb", fallback: "", clip: "Punch_Cross" },
  { role: "uppercut", ref: "emotes/scrap_uppercut_emote.glb", fallback: "", clip: "scrap_uppercut" },
  { role: "frontKick", ref: "emotes/scrap_front_kick_emote.glb", fallback: "", clip: "scrap_front_kick" },
  { role: "hurt", ref: "emotes/hit_knockback_emote.glb", fallback: "dontsee", clip: "Hit_Knockback" },
  { role: "hurtIdle", ref: "emotes/idle_hurt_emote.glb", fallback: "", clip: "Idle Hurt" },
  { role: "dizzy", ref: "emotes/dizzy_emote.glb", fallback: "", clip: "Dizzy" },
  { role: "down", ref: "emotes/death_c_emote.glb", fallback: "dontsee", clip: "Death_C" },
  { role: "rise", ref: "emotes/laytoidle_emote.glb", fallback: "", clip: "LayToIdle" },
  { role: "shake", ref: "emotes/idle_shakeoff_emote.glb", fallback: "", clip: "Idle_ShakeOff" },
  { role: "victory", ref: "emotes/victory_emote.glb", fallback: "handsair", clip: "Victory" },
  { role: "attention", ref: "emotes/angry_emote.glb", fallback: "", clip: "Angry" },
  { role: "taunt1", ref: "emotes/chest_open_emote.glb", fallback: "shrug", clip: "Chest Open" },
  { role: "taunt2", ref: "emotes/reject_emote.glb", fallback: "shrug", clip: "Reject" },
  { role: "taunt3", ref: "emotes/defend_emote.glb", fallback: "", clip: "Defend" },
  { role: "push", ref: "emotes/push_emote.glb", fallback: "", clip: "Push" },
  { role: "koFlyBack", ref: "emotes/death_b_emote.glb", fallback: "dontsee", clip: "Death_B" },
  { role: "koSlam", ref: "emotes/death_b_emote.glb", fallback: "dontsee", clip: "Death_B" },
  { role: "koCrumple", ref: "emotes/death_c_emote.glb", fallback: "dontsee", clip: "Death_C" },
  { role: "koFaceDown", ref: "emotes/death_a_emote.glb", fallback: "dontsee", clip: "Death_A" },
  { role: "koKnees", ref: "emotes/kneeling_tired_emote.glb", fallback: "dontsee", clip: "Kneeling_Tired" },
  { role: "koSpin", ref: "emotes/death_d_emote.glb", fallback: "dontsee", clip: "Death_D" },
  { role: "koRoll", ref: "emotes/roll_emote.glb", fallback: "dontsee", clip: "Roll" },
  { role: "koThreePoint", ref: "emotes/land_three_point_emote.glb", fallback: "dontsee", clip: "Land_Three_Point" },
  { role: "koCrouch", ref: "emotes/crouch_idle_emote.glb", fallback: "dontsee", clip: "Crouch_Idle" },
  { role: "koHeap", ref: "emotes/zombie_idle_crouch_emote.glb", fallback: "dontsee", clip: "Zombie_Idle_Crouch" },
  { role: "tired", ref: "emotes/tired_hunched_emote.glb", fallback: "", clip: "Tired_Hunched" },
  { role: "fistPump", ref: "emotes/victory_fist_pump_emote.glb", fallback: "fistpump", clip: "Victory_Fist_Pump" },
  { role: "downIdle", ref: "emotes/sleeping_emote.glb", fallback: "dontsee", clip: "Sleeping" },
];

/** How long the knockout clip runs before the floor idle takes over (ms). */
export function scrapKoClipMs(style: ScrapKoStyle): number {
  switch (style) {
    case "fly_back":
    case "slam":
      return 1900;
    case "crumple":
    case "daze":
      return 2100;
    case "face_down":
      return 4400;
    case "knees":
    case "crouch":
    case "heap":
      return Infinity; // hold loops — they stay down on their own
    case "spin":
    case "roll":
      return 2000;
    case "stagger":
      return 2400;
    case "three_point":
      return 1800;
  }
}

/** The knockout clip for a style. */
export function scrapKoRole(style: ScrapKoStyle): ScrapEmoteRole {
  switch (style) {
    case "fly_back":
      return "koFlyBack";
    case "slam":
      return "koSlam";
    case "crumple":
    case "daze":
      return "koCrumple";
    case "face_down":
      return "koFaceDown";
    case "knees":
      return "koKnees";
    case "spin":
      return "koSpin";
    case "stagger":
      return "koFaceDown";
    case "roll":
      return "koRoll";
    case "three_point":
      return "koThreePoint";
    case "crouch":
      return "koCrouch";
    case "heap":
      return "koHeap";
  }
}

/** Floor holds that must loop on an AvatarShape or the body snaps back to idle. */
export function scrapKoLoopRole(role: ScrapEmoteRole): boolean {
  // Guard / hurt idle must loop or AvatarShape drops back to the walk idle
  // between beats — one-on-one looked like they never squared up.
  return (
    role === "downIdle" ||
    role === "koKnees" ||
    role === "koCrouch" ||
    role === "koHeap" ||
    role === "guard" ||
    role === "footwork" ||
    role === "hurtIdle"
  );
}

/** The three-press argument: which clip plays for a provocation beat. */
export function scrapProvocationRole(emote: ScrapProvocationEmote): ScrapEmoteRole {
  return emote;
}

const BY_ROLE = new Map<ScrapEmoteRole, ScrapEmoteBinding>(
  SCRAP_EMOTES.map((binding) => [binding.role, binding])
);

export function scrapEmoteBinding(role: ScrapEmoteRole): ScrapEmoteBinding {
  const binding = BY_ROLE.get(role);
  if (!binding) throw new Error(`unknown scrap emote role: ${role}`);
  return binding;
}

/** Bundled paths this app wants — for the emote library and the bundler. */
export function scrapEmotePaths(): string[] {
  return SCRAP_EMOTES.map((binding) => binding.ref);
}

/**
 * Clips the fight NPC must already have in AvatarShape.emotes when the bout
 * starts. Slotting any of these on the fire frame is the standing dummy:
 * Explorer has not bound the GLB yet, and a KO fallback of `dontsee` stands.
 */
export function scrapFightBoutRoles(koStyle: ScrapKoStyle): ScrapEmoteRole[] {
  // Eight combat clips — AvatarShape only has ten slots. Footwork / rise /
  // taunts fill the leftover two; they must never evict a punch.
  return [
    "jab",
    "cross",
    "uppercut",
    "frontKick",
    "hurt",
    scrapKoRole(koStyle),
    "downIdle",
    "guard",
  ];
}

/**
 * Looping fight holds — AvatarShape needs the `-true` scene-emote URN in its
 * `emotes` list or the body snaps back to idle after one play.
 */
export function scrapLoopEmotePaths(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const binding of SCRAP_EMOTES) {
    if (!scrapKoLoopRole(binding.role)) continue;
    if (seen.has(binding.ref)) continue;
    seen.add(binding.ref);
    out.push(binding.ref);
  }
  return out;
}

/**
 * The ref to play. `resolves` answers "is this bundled path actually deployed?"
 * — pass the runtime resolver, and the fallback covers everything else.
 */
export function scrapEmoteRef(role: ScrapEmoteRole, resolves: (ref: string) => boolean): string {
  const binding = scrapEmoteBinding(role);
  return resolves(binding.ref) ? binding.ref : binding.fallback;
}

/** Their swing alternates jab / cross so a rhythm reads as punches, not a loop. */
export function scrapSwingRole(swingIndex: number): ScrapEmoteRole {
  return swingIndex % 2 === 0 ? "jab" : "cross";
}

/**
 * The clip a swing PLAYS. The engine only speaks jab/cross (block sides and
 * damage stay exactly as tuned), but a rival who never varies the arm reads as
 * a loop — so every few crosses the VISUAL is an uppercut or a front kick.
 * Seeded + indexed: same bout, same swings, and both view copies agree.
 */
export function scrapSwingVisualRole(
  swing: "jab" | "cross",
  swingIndex: number,
  seed: number
): ScrapEmoteRole {
  if (swing === "jab") return "jab";
  const pick = (seed + swingIndex * 7) % 6;
  if (pick === 2) return "uppercut";
  if (pick === 5) return "frontKick";
  return "cross";
}
