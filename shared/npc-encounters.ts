/**
 * NPC encounters — data-defined engagement beats between NPCs and guests.
 *
 * Stage 1 (this file): GREETING cards. The always-on guest-acknowledge ground
 * rule (shared/npc-ground-rules.ts) keeps deciding WHEN an NPC acknowledges a
 * guest; cards decide WHAT that beat looks like — which emote, whether the NPC
 * says something in a speech bubble, and in what tone. Approach / tease /
 * escalate / fight lives in the Scrap app (`swissverse.scrap`,
 * shared/scrap-session.ts) — not in this host file. Keep this module pure.
 *
 * Authoring model: cards live in the repo and ship inside the bundle. The
 * admin panel only ever selects a MOOD; it never edits cards. Emotes here are
 * base DCL avatar expressions — zero bundle weight, no retarget pipeline.
 */

/** Per-group tone. null on a group = crew default (friendly). */
export type NpcAttitude = "friendly" | "aloof" | "cocky";

export const NPC_ATTITUDES: readonly NpcAttitude[] = ["friendly", "aloof", "cocky"];

/**
 * Scene-wide encounter mood, picked by the admin.
 *
 * - off:      ground rule only — the classic single wave, no bubbles.
 * - friendly: greeting variety, welcoming card pool.
 * - lively:   everything in friendly plus the louder cards.
 * - rough:    reserved for the tease/escalation cards (stage 2+). Until those
 *             ship it behaves exactly like lively — kept in the type NOW so
 *             saved configs never need migrating.
 */
export type EncounterMood = "off" | "friendly" | "lively" | "rough";

export const ENCOUNTER_MOODS: readonly EncounterMood[] = [
  "off",
  "friendly",
  "lively",
  "rough",
];

export function normalizeEncounterMood(raw: unknown): EncounterMood {
  return ENCOUNTER_MOODS.includes(raw as EncounterMood)
    ? (raw as EncounterMood)
    : "friendly";
}

export interface GreetingCard {
  id: string;
  /** Group attitudes this card belongs to. */
  attitudes: readonly NpcAttitude[];
  /** Moods that include this card. "off" never appears here. */
  moods: readonly Exclude<EncounterMood, "off">[];
  /** Base DCL avatar expression id (wave/clap/shrug/… — never a .glb path). */
  emote: string;
  /** Speech-bubble one-liners; the picker rotates through them. Short — the
   *  bubble is small. Mixed languages on purpose: the crowd is international. */
  lines: readonly string[];
  /** How long the NPC holds the beat before resuming its job. */
  holdMs: number;
}

const EVERY: readonly Exclude<EncounterMood, "off">[] = ["friendly", "lively", "rough"];
const LOUD: readonly Exclude<EncounterMood, "off">[] = ["lively", "rough"];

/**
 * The stage-1 card set. Curation rules: nothing that reads as mockery of the
 * GUEST in the friendly pool; aloof/cocky stay mild attitude, never insults —
 * hostility is the rough-mood escalation cards' job (stage 2+), where it is
 * zone-gated and opt-in.
 */
export const GREETING_CARDS: readonly GreetingCard[] = [
  {
    id: "hi_wave",
    attitudes: ["friendly"],
    moods: EVERY,
    emote: "wave",
    lines: ["Hi!", "Hey!", "Hello!", "Hola!", "Ciao!"],
    holdMs: 1400,
  },
  {
    id: "hi_hand",
    attitudes: ["friendly"],
    moods: EVERY,
    emote: "raiseHand",
    lines: ["Yo!", "Hey hey", "What's up?", "Salut!"],
    holdMs: 1400,
  },
  {
    id: "hi_clap",
    attitudes: ["friendly"],
    moods: EVERY,
    emote: "clap",
    lines: ["Nice to see you!", "Welcome!", "You made it!"],
    holdMs: 1600,
  },
  {
    id: "hi_fist",
    attitudes: ["friendly", "cocky"],
    moods: EVERY,
    emote: "fistpump",
    lines: ["Let's go!", "Yes!", "Vamos!"],
    holdMs: 1400,
  },
  {
    id: "hi_hands_air",
    attitudes: ["friendly"],
    moods: LOUD,
    emote: "handsair",
    lines: ["Heyyy!", "Party's here!", "Wooo!"],
    holdMs: 1700,
  },
  {
    id: "hi_shrug",
    attitudes: ["aloof"],
    moods: EVERY,
    emote: "shrug",
    lines: ["...sup.", "oh. hi.", "hm."],
    holdMs: 1400,
  },
  {
    id: "hi_dontsee",
    attitudes: ["aloof"],
    moods: EVERY,
    emote: "dontsee",
    lines: ["Didn't see you there.", "You again?", "..."],
    holdMs: 1500,
  },
  {
    id: "hi_dab",
    attitudes: ["cocky"],
    moods: LOUD,
    emote: "dab",
    lines: ["What's good?", "You know it.", "Easy."],
    holdMs: 1400,
  },
  {
    // WAS "money". An encounter happens face to face, half a metre away, which
    // is the very worst place for an emote that rains banknotes down around the
    // feet: from the player's camera the shower lands on THEM. See
    // AVATAR_VFX_EMOTES in npc-ambient-emotes.ts.
    id: "hi_money",
    attitudes: ["cocky"],
    moods: LOUD,
    emote: "tektonik",
    lines: ["Nice fit. Mine's nicer.", "Big league here.", "Fresh, right?"],
    holdMs: 1600,
  },
  {
    id: "hi_robot",
    attitudes: ["cocky", "aloof"],
    moods: LOUD,
    emote: "robot",
    lines: ["Beep. Hi.", "Watch this."],
    holdMs: 1800,
  },
] as const;

export interface GreetingPick {
  emote: string;
  /** null = this beat stays silent (about 1 in 3 do — a crowd where EVERY
   *  greeting speaks reads as a chatbot farm). */
  line: string | null;
  holdMs: number;
}

/** Classic ground-rule beat — what "off" and empty pools fall back to. */
export const PLAIN_GREETING: GreetingPick = { emote: "wave", line: null, holdMs: 1400 };

/** Cheap deterministic integer mix (same family as the troupe bot seed). */
function mix(a: number, b: number): number {
  return (Math.imul((a ^ 0x9e3779b9) + b, 2654435761) >>> 0);
}

export function greetingPool(
  attitude: NpcAttitude,
  mood: EncounterMood
): readonly GreetingCard[] {
  if (mood === "off") return [];
  return GREETING_CARDS.filter(
    (card) => card.attitudes.includes(attitude) && card.moods.includes(mood)
  );
}

/**
 * Pick the next greeting beat for one NPC.
 *
 * Deterministic in (seed, sequence): the same NPC cycles through its pool in a
 * seed-shuffled order instead of coin-flipping, so back-to-back greetings from
 * one bot never repeat until the pool is exhausted. `sequence` = how many
 * greetings this bot has performed (caller increments it per beat).
 */
export function planGreeting(input: {
  attitude: NpcAttitude | null;
  mood: EncounterMood;
  seed: number;
  sequence: number;
}): GreetingPick {
  const pool = greetingPool(input.attitude ?? "friendly", input.mood);
  if (!pool.length) return PLAIN_GREETING;
  const h = mix(input.seed, input.sequence);
  // Seed-offset rotation through the pool, not h % length: rotation guarantees
  // no repeats inside one full cycle.
  const card = pool[(input.seed + input.sequence) % pool.length]!;
  const line = h % 3 === 0 ? null : card.lines[h % card.lines.length]!;
  return { emote: card.emote, line, holdMs: card.holdMs };
}
