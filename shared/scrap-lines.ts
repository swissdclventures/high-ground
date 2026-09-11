/**
 * What they SAY when you push them — pure, no SDK.
 *
 * Three presses of E, three reactions, and they have to sound like the person
 * standing there. A lowlife in a leather jacket says "you lost?"; a woman in
 * heels on a night out says "excuse me?"; the bouncer says "move along". The
 * persona is READ from the same wardrobe/attitude words that set the skill
 * (shared/scrap-skill.ts) so the owner never fills in a fourth thing.
 *
 * Lines are picked by seed so one NPC keeps saying the same kind of thing,
 * and a second NPC of the same persona says something else.
 */

export type ScrapPersona = "lowlife" | "bouncer" | "socialite" | "tourist" | "default";
export const SCRAP_PERSONAS: readonly ScrapPersona[] = ["lowlife", "bouncer", "socialite", "tourist", "default"];

/** Stage 1 = they noticed you. 2 = they are getting angry. 3 = here it comes. */
export type ScrapLineStage = 1 | 2 | 3;

const PERSONA_WORDS: Record<Exclude<ScrapPersona, "default">, readonly string[]> = {
  bouncer: ["bouncer", "guard", "security", "doorman", "staff"],
  lowlife: ["leather", "jacket", "biker", "punk", "boots", "brawler", "boxer", "muscle", "thug", "gang", "hood", "street"],
  socialite: ["skirt", "dress", "heels", "gown", "silk", "pastel", "glam", "cocktail", "club", "party", "lady", "girl"],
  tourist: ["tourist", "guest", "kid", "flower", "visitor", "backpack", "camera", "shorts", "sandals"],
};

export const SCRAP_LINES: Record<ScrapPersona, Record<ScrapLineStage, readonly string[]>> = {
  lowlife: {
    1: ["Yo.", "You lost?", "Problem?", "Keep walking.", "The hell you looking at?"],
    2: ["Where you at, huh?", "Say it to my face.", "You want this?", "Keep pushing. Go on.", "Nah. Nah nah nah."],
    3: ["That's it.", "Gloves. Now.", "Let's go.", "Your funeral.", "Hold this for me."],
  },
  bouncer: {
    1: ["Move along.", "Not tonight.", "Step back, please.", "You're in the way.", "Can I help you?"],
    2: ["Last warning.", "Don't make me.", "I've thrown out bigger.", "Hands off.", "I said step BACK."],
    3: ["Okay. Outside.", "You're done.", "Right then.", "Nobody warned you?", "Clocking off early."],
  },
  socialite: {
    1: ["Excuse me?", "Um... hi?", "Do I know you?", "Sorry - what?", "Can I... help you?"],
    2: ["Wow. Rude.", "Back off. Seriously.", "Seriously? HERE?", "You do NOT want this.", "Touch me again."],
    3: ["Oh, it's ON.", "Fine. FINE.", "You asked for it, darling.", "Hold my bag.", "Heels off. Let's go."],
  },
  tourist: {
    1: ["Oh! Hello?", "Sorry, what?", "Are you... talking to me?", "Is this a tour thing?", "Hi! Um."],
    2: ["Okay, stop that.", "Why are you like this?", "Not cool. Not cool.", "I WILL call someone.", "Please don't."],
    3: ["Okay! Okay! Fists!", "I did karate once!", "Here goes nothing!", "Mom said never back down.", "FINE."],
  },
  default: {
    1: ["What?", "Yeah?", "Hm?", "Need something?", "You talking to me?"],
    2: ["Back off.", "I'm warning you.", "Last chance.", "Don't.", "Say that again."],
    3: ["That's it.", "You asked for it.", "Square up.", "Come on then.", "Right."],
  },
};

function mix(a: number, b: number): number {
  return Math.imul((a ^ 0x9e3779b9) + b, 2654435761) >>> 0;
}

/**
 * Read the persona off the look. First hit wins in this order — a bouncer in
 * a jacket is still a bouncer, a punk with a camera is still a punk.
 */
export function scrapPersonaFor(input: {
  attitude?: "friendly" | "aloof" | "cocky" | null;
  looks?: readonly string[];
}): ScrapPersona {
  const blob = (input.looks ?? []).join(" ").toLowerCase();
  for (const persona of ["bouncer", "lowlife", "socialite", "tourist"] as const) {
    if (PERSONA_WORDS[persona].some((word) => blob.includes(word))) return persona;
  }
  if (input.attitude === "cocky") return "lowlife";
  return "default";
}

export function scrapLine(persona: ScrapPersona, stage: ScrapLineStage, seed: number): string {
  const pool = SCRAP_LINES[persona][stage];
  return pool[mix(seed, stage * 0x1f3) % pool.length]!;
}

/**
 * After they smash you they take the time to talk smack. Three beats, three
 * lines, three looks: chest-open (point), reject (dismiss), then they kneel
 * over you. Seed-picked so one NPC keeps its mouth.
 */
export const SCRAP_GLOAT_BEATS = 3;
export const SCRAP_GLOAT_BEAT_MS = 2200;

export type ScrapGloatEmote = "taunt1" | "taunt2" | "koKnees";

const GLOAT_EMOTES: readonly ScrapGloatEmote[] = ["taunt1", "taunt2", "koKnees"];

export const SCRAP_GLOAT_LINES: Record<ScrapPersona, readonly [string, string, string]> = {
  lowlife: ["Look at you.", "That's all you got?", "Stay down."],
  bouncer: ["You're done.", "Night's over. Go home.", "Walk it off."],
  socialite: ["Aw. Poor thing.", "That was embarrassing.", "Don't ever try me."],
  tourist: ["I WON?!", "Did you SEE that?!", "Stay down, okay?"],
  default: ["Too easy.", "Get up. No?", "Don't come back."],
};

export function scrapGloatBeatIndex(elapsedMs: number): 0 | 1 | 2 {
  if (elapsedMs < SCRAP_GLOAT_BEAT_MS) return 0;
  if (elapsedMs < SCRAP_GLOAT_BEAT_MS * 2) return 1;
  return 2;
}

export function scrapGloatBeat(
  persona: ScrapPersona,
  seed: number,
  beat: 0 | 1 | 2
): { line: string; emote: ScrapGloatEmote } {
  const lines = SCRAP_GLOAT_LINES[persona];
  const rotated = mix(seed, 0x51) % 3;
  const line = lines[(beat + rotated) % 3]!;
  return { line, emote: GLOAT_EMOTES[beat]! };
}

export function isScrapPersona(value: unknown): value is ScrapPersona {
  return typeof value === "string" && (SCRAP_PERSONAS as readonly string[]).includes(value);
}
