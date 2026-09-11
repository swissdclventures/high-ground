/**
 * Emote library — the single catalog of every move an NPC can perform.
 *
 * This is the resource layer the composer, the scene runtime, and (later) the
 * marketplace all draw from. An entry's `ref` is either a scene-bundled GLB
 * path ("emotes/x.glb", resolved to a scene-emote URN at runtime by
 * scene/src/dance/scene-emotes.ts) or a DCL base-emote id ("clap") that an
 * AvatarShape can fire directly. Bundled entries MUST have their file present
 * in scene/emotes/ — bundledEmotePaths() is what the runtime resolves, so a
 * missing file simply never resolves and callers fall back to base emotes.
 *
 * Motion Studio entries carry their generation prompt as provenance — that is
 * what a future gallery/purchase card shows ("this prompt → this move").
 */

export type EmoteTag =
  | "dance"
  | "breakdance"
  | "ballet"
  | "gesture"
  | "reaction"
  | "idle";

export type EmoteSource = "dcl-base" | "bundled" | "motion-studio";

export interface EmoteLibraryEntry {
  /** Stable id — what configs and assignments reference. Never rename. */
  id: string;
  /** Display name for pickers. */
  name: string;
  /** Bundled GLB path ("emotes/x.glb") or DCL base-emote id ("clap"). */
  ref: string;
  tags: EmoteTag[];
  source: EmoteSource;
  /** Motion Studio provenance: the exact generation prompt. */
  prompt?: string;
}

export const EMOTE_LIBRARY: EmoteLibraryEntry[] = [
  // --- Motion Studio generations (move.swissverse.org) -----------------------
  {
    id: "ballet-turn-loop",
    name: "Ballet turn",
    ref: "emotes/ballet_turn_loop_emote.glb",
    tags: ["dance", "ballet"],
    source: "motion-studio",
    prompt: "A ballet dancer performs a forward, turn joining feet, in a repeating loop",
  },

  // --- Bundled breakdance set ------------------------------------------------
  { id: "bd-windmill-combo", name: "Windmill combo", ref: "emotes/windmill_combo_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-headspin-combo", name: "Headspin combo", ref: "emotes/headspin_combo_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-headspin-2", name: "Headspin II", ref: "emotes/headspin_new_2_x6_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-headspin-4", name: "Headspin IV", ref: "emotes/headspin_new_4_x6_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-headspin-5", name: "Headspin V", ref: "emotes/headspin_new_5_x6_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-1990-spin", name: "1990 spin", ref: "emotes/bd_1990_new_x4_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-uprock-bboy", name: "B-boy uprock", ref: "emotes/bboy_uprock_emote.glb", tags: ["dance", "breakdance", "gesture"], source: "bundled" },
  { id: "bd-uprock", name: "Uprock", ref: "emotes/bd_uprock_new_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-uprock-to-ground", name: "Uprock to ground", ref: "emotes/bd_uprock_to_ground_new_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-hiphop-move", name: "Hip-hop move", ref: "emotes/bboy_hiphop_move_new_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-hiphop-snake", name: "Snake hip-hop", ref: "emotes/snake_hiphop_new_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-footwork-freeze", name: "Footwork to freeze", ref: "emotes/bd_footwork_to_freeze_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-footwork-idle", name: "Footwork to idle", ref: "emotes/bd_footwork_to_idle_2_fixed_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-freezes", name: "Freezes", ref: "emotes/bd_freezes_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-freeze-3", name: "Freeze III", ref: "emotes/bd_freeze_var_3_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-ending", name: "Ending pose", ref: "emotes/bd_ending_new_2_emote.glb", tags: ["dance", "breakdance"], source: "bundled" },
  { id: "bd-ready-bounce", name: "Ready bounce", ref: "emotes/bd_ready_3_x2_emote.glb", tags: ["gesture", "idle"], source: "bundled" },
  { id: "hammer", name: "Hammer", ref: "hammer", tags: ["gesture", "reaction"], source: "dcl-base" },
  { id: "dab", name: "Dab", ref: "dab", tags: ["gesture", "reaction"], source: "dcl-base" },
  { id: "raise-hand", name: "Raise hand", ref: "raiseHand", tags: ["gesture"], source: "dcl-base" },
  { id: "twerk", name: "Twerk", ref: "emotes/twerk_trimmed_emote.glb", tags: ["dance"], source: "bundled" },

  // --- DCL base emotes (always available, no file) ---------------------------
  { id: "hands-air", name: "Hands in the air", ref: "handsair", tags: ["gesture", "reaction"], source: "dcl-base" },
  { id: "wave", name: "Wave", ref: "wave", tags: ["gesture"], source: "dcl-base" },
  { id: "shrug", name: "Shrug", ref: "shrug", tags: ["gesture", "reaction"], source: "dcl-base" },
  { id: "dont-see", name: "Can't watch", ref: "dontsee", tags: ["gesture", "reaction"], source: "dcl-base" },
  { id: "robot", name: "Robot", ref: "robot", tags: ["dance"], source: "dcl-base" },

  // --- Scrap fight reactions (move.swissverse.org/starter, CC0-1.0) ---------
  {
    id: "scrap-fighting-idle",
    name: "Fighting idle",
    ref: "emotes/fighting_idle_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },

  {
    id: "scrap-state-guard-neutral",
    name: "Fighting stance",
    ref: "emotes/state_guard_neutral_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-state-footwork-bounce",
    name: "Footwork bounce",
    ref: "emotes/state_footwork_bounce_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-weave-left",
    name: "Weave left",
    ref: "emotes/defense_evade_weave_left_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-weave-right",
    name: "Weave right",
    ref: "emotes/defense_evade_weave_right_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-step-forward",
    name: "Step forward",
    ref: "emotes/move_combat_step_forward_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-punch-jab",
    name: "Punch jab",
    ref: "emotes/punch_jab_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-punch-cross",
    name: "Punch cross",
    ref: "emotes/punch_cross_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-uppercut",
    name: "Scrap uppercut",
    ref: "emotes/scrap_uppercut_emote.glb",
    tags: ["reaction"],
    source: "bundled",
  },
  {
    id: "scrap-front-kick",
    name: "Scrap front kick",
    ref: "emotes/scrap_front_kick_emote.glb",
    tags: ["reaction"],
    source: "bundled",
  },
  {
    id: "scrap-hit-knockback",
    name: "Hit knockback",
    ref: "emotes/hit_knockback_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-idle-hurt",
    name: "Idle hurt",
    ref: "emotes/idle_hurt_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-dizzy",
    name: "Dizzy",
    ref: "emotes/dizzy_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-death-c",
    name: "Knocked out",
    ref: "emotes/death_c_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-lay-to-idle",
    name: "Getting up",
    ref: "emotes/laytoidle_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-idle-shakeoff",
    name: "Shake it off",
    ref: "emotes/idle_shakeoff_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-victory",
    name: "Victory",
    ref: "emotes/victory_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-angry",
    name: "Angry",
    ref: "emotes/angry_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-chest-open",
    name: "What's up",
    ref: "emotes/chest_open_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-reject",
    name: "Reject",
    ref: "emotes/reject_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-defend",
    name: "Defend",
    ref: "emotes/defend_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-push",
    name: "Push",
    ref: "emotes/push_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-death-a",
    name: "Face down",
    ref: "emotes/death_a_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-death-b",
    name: "Knocked flat",
    ref: "emotes/death_b_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-death-d",
    name: "Spun out",
    ref: "emotes/death_d_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-kneeling-tired",
    name: "On the knees",
    ref: "emotes/kneeling_tired_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-tired-hunched",
    name: "Tired hunched",
    ref: "emotes/tired_hunched_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-sleeping",
    name: "Out cold",
    ref: "emotes/sleeping_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-victory-fist-pump",
    name: "Victory fist pump",
    ref: "emotes/victory_fist_pump_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-roll",
    name: "Knockout roll",
    ref: "emotes/roll_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-land-three-point",
    name: "Three-point land",
    ref: "emotes/land_three_point_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-crouch-idle",
    name: "Crouch idle",
    ref: "emotes/crouch_idle_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-zombie-crouch",
    name: "Heap crouch",
    ref: "emotes/zombie_idle_crouch_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-confused",
    name: "Confused",
    ref: "emotes/confused_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },
  {
    id: "scrap-fixing-kneeling",
    name: "Fixing kneeling",
    ref: "emotes/fixing_kneeling_emote.glb",
    tags: ["reaction"],
    source: "motion-studio",
  },

  // --- Authored in this repo (scripts/emotes/) -------------------------------
  //
  // ★ THE LISTING IS THE SWITCH, not just the catalogue. `bundledEmotePaths()` is
  // what the bundler ships and what the runtime resolves to a scene-emote URN, so a
  // GLB that sits in scene/emotes/ without an entry here is invisible to both.
  // punch-machine.ts reads exactly that: `FOCUS_EMOTE_BUNDLED =
  // bundledEmotePaths().includes(FOCUS_EMOTE_SRC)`, and falls back to the base
  // `raiseHand` when it is false.
  {
    id: "punch-focus-telepathy",
    name: "Focus (telepathy)",
    ref: "emotes/meditate_focus_emote.glb",
    tags: ["gesture", "idle"],
    source: "bundled",
  },
];

const byId = new Map(EMOTE_LIBRARY.map((e) => [e.id, e]));
const byRef = new Map(EMOTE_LIBRARY.map((e) => [e.ref, e]));

export function emoteById(id: string): EmoteLibraryEntry | undefined {
  return byId.get(id);
}

export function emoteByRef(ref: string): EmoteLibraryEntry | undefined {
  return byRef.get(ref);
}

export function emotesByTag(tag: EmoteTag): EmoteLibraryEntry[] {
  return EMOTE_LIBRARY.filter((e) => e.tags.includes(tag));
}

/** Every scene-bundled GLB path — the set the runtime resolves to URNs. */
export function bundledEmotePaths(): string[] {
  return EMOTE_LIBRARY.filter((e) => e.ref.startsWith("emotes/")).map((e) => e.ref);
}

/**
 * The flight pose worn by the flight puppet (scene/src/flight-avatar.ts).
 *
 * Deliberately NOT in EMOTE_LIBRARY: it is not something an admin picks for a dancer or
 * an NPC, it is worn by one system. It lives under emotes/ only because that is where the
 * bundler ships GLB animations from — which is exactly the trap it has to be named for.
 * Flight is available in every scene, so this file must survive the dance-asset prune
 * that drops everything else under emotes/ from a build with no Social/Venue.
 */
export const FLIGHT_EMOTE_PATH = "emotes/superman_flight_emote.glb";

/**
 * The seated driving pose. Like flight, a vehicle can be enabled in ANY scene, so this file
 * must survive the dance-asset prune too — pruning it leaves the driver puppet with no pose to
 * wear and the only symptom is a rider who stands up in the car.
 */
export const SIT_EMOTE_PATH = "emotes/sit_drive_emote.glb";

/** Length of `sit_drive_emote.glb` (scripts/emotes/build-sit-emote.ts). Re-fire on this seam. */
export const SIT_EMOTE_DURATION_S = 1;
