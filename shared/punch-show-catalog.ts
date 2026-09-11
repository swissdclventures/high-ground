/**
 * THE CATALOG. Every effect a punch can ADD, as data.
 *
 * ‼️READ THIS FIRST: CARDS ARE THE TOPPING, NEVER THE MEAL.
 *
 * For one release the cards WERE the reaction — the guaranteed stack that used
 * to fire on every punch (hard flash, shake, sting, crowd roar, fireball, sky
 * quake, celebration) was deleted and replaced by one card per channel drawn
 * from a bag. Variety went up and intensity collapsed, because the reward
 * stopped being a certainty and became a draw: a 940 could come back as a puff
 * of smoke and a slow screen fade. The owner played it once — *"I've never been
 * this bored... before I was addicted."*
 *
 * So the guaranteed reaction lives in `fireSlamFloor` (punch-machine.ts), is
 * never rationed, never on cooldown, and scales continuously with the score.
 * EVERY CARD IN THIS FILE IS ADDED ON TOP OF THAT. A card may never be the only
 * thing a punch does, and removing every card in here must still leave a machine
 * that feels good to hit.
 *
 * THE THREE BANDS, in the owner's words: *"quite a lot of visual and audio
 * feedback already above 800, then extremes above 900, and crazy earth
 * shattering stuff about 1000 if you can make it there."*
 *
 *   heat 0.77 = score 800   LOUD
 *   heat 0.89 = score 900   EXTREME
 *   heat 0.99 = score 990   EARTH-SHATTERING
 *
 * Heat is LINEAR (see punchHeat), so a window reads directly as a score band and
 * can be tuned without a calculator. Below 800 is deliberately still alive —
 * most punches land there and a machine that does nothing for them is a machine
 * nobody plays twice.
 *
 * ADDING AN EFFECT: one entry here, one `case` in `runShowPlan`. A card added
 * and never wired fails `tests/scene/punch-show-wiring.test.ts` rather than
 * silently doing nothing in world.
 *
 * ‼️COST IS A PROMISE ABOUT PERFORMANCE, not a drama rating. A DCL scene has a
 * hard particle ceiling and the budget is what stops the top band from being
 * able to run everything at once.
 */
import type { ShowCard } from "./punch-show";
import { SCREEN_PATTERNS } from "./punch-show-patterns";

/** score 800 — the owner's first step up. */
export const HEAT_LOUD = 0.7736;
/** score 900 — extremes. */
export const HEAT_EXTREME = 0.887;
/** score ~990 — earth-shattering, and the only place the island itself moves. */
export const HEAT_APOCALYPSE = 0.99;

/**
 * THE ARC — one card per pattern, laddered so the SHAPE of the screen changes
 * with the punch and not merely its colour.
 *
 * ‼️The pattern always starts AFTER the contact flash, never instead of it. A
 * pattern that ramps up softly (drain, gradient, meter) on the impact frame
 * takes the snap out of the hit; the flash is part of the guaranteed floor and
 * the pattern is what the arc does with the second that follows.
 *
 * Windows overlap so three to six shapes are live at any score, and the bag
 * draws between them without replacement — the shelf must empty before anything
 * repeats.
 */
const SCREEN_CARDS: readonly ShowCard[] = [
  { id: "screen-solid", channel: "screen", minHeat: 0, maxHeat: 0.35, cost: 0, duration: "flash" },
  { id: "screen-gradient", channel: "screen", minHeat: 0.18, maxHeat: 0.56, cost: 1, duration: "beat" },
  { id: "screen-bars", channel: "screen", minHeat: 0.24, maxHeat: 0.6, cost: 1, duration: "beat" },
  { id: "screen-wipe", channel: "screen", minHeat: 0.3, maxHeat: 0.66, cost: 1, duration: "beat" },
  { id: "screen-meter", channel: "screen", minHeat: 0.34, maxHeat: 0.76, cost: 2, duration: "beat" },
  { id: "screen-chase", channel: "screen", minHeat: 0.4, maxHeat: 0.8, cost: 2, duration: "beat" },
  { id: "screen-ripple", channel: "screen", minHeat: 0.45, maxHeat: 0.84, cost: 2, duration: "beat" },
  { id: "screen-drain", channel: "screen", minHeat: 0.5, maxHeat: 0.8, cost: 2, duration: "beat" },
  { id: "screen-heartbeat", channel: "screen", minHeat: 0.55, maxHeat: 0.88, cost: 2, duration: "beat" },
  // From LOUD up the arc stops being decorative. Everything above this line is
  // hard-edged on purpose — soft shapes at the top were half the reason a great
  // punch stopped reading as a great punch.
  { id: "screen-split", channel: "screen", minHeat: 0.62, cooldown: 2, cost: 3, duration: "beat" },
  { id: "screen-noise", channel: "screen", minHeat: HEAT_LOUD, cooldown: 2, cost: 3, duration: "beat" },
  { id: "screen-sparkle", channel: "screen", minHeat: HEAT_LOUD, cooldown: 2, cost: 3, duration: "beat" },
  { id: "screen-shockwave", channel: "screen", minHeat: 0.82, cooldown: 2, cost: 3, duration: "beat" },
  { id: "screen-strobe", channel: "screen", minHeat: HEAT_EXTREME, cooldown: 2, cost: 3, duration: "beat", tags: ["strobe"] },
  // Darkness as material. Only ever at the very top, and only sometimes — the
  // arc going black is shocking exactly as long as it stays surprising.
  {
    id: "screen-collapse",
    cooldown: 4,
    channel: "screen",
    minHeat: 0.95,
    cost: 4,
    duration: "scene",
    rarity: 3,
    tags: ["dark"],
  },
];

/**
 * THE SWING — and ‼️EVERY CARD HERE MUST BE A COMMITTED STRIKE.
 *
 * ★★★ The first version of this shelf had six clips and only two of them threw a
 * punch, which is exactly how it was reported: "he's hesitating, or he suddenly
 * hits with the left hand — none of it is smashing." Run
 * `scripts/emotes/measure-punch-swings.ts` and the reason is not a matter of
 * taste. Peak forward travel of the striking hand, measured off the GLBs:
 *
 *   angry (haymaker)   right hand 1.126 m, contact 417 ms  ← the biggest we own
 *   scrap_uppercut     right hand 0.734 m, contact 322 ms
 *   punch_cross        right hand 0.528 m, contact 369 ms
 *   punch_jab          LEFT  hand 0.371 m, contact 303 ms  ← the "left hand" one
 *   move_combat_step_forward  hand 0.128 m, peaks at 1234 ms — a SHUFFLE, no strike
 *   push               hand 0.005 m — bent at the waist, both arms already out,
 *                      3.4 s of leaning. Never retracts, never throws.
 *
 * The last two were dealt as swings. They are gone. `docs/punch-swings/*.svg`
 * has the stick-figure filmstrips if that ever wants re-arguing.
 *
 * ★★★ AND THE JAB'S WINDOW WAS THE OTHER HALF OF IT. `punchHeat` is linear in
 * score, so these windows read directly as points (see the table in
 * punch-show.ts). `swing-jab` used to run 0 … 0.5, which is EVERY PUNCH UP TO
 * 559 — and alone below 419, because the cross did not open until then. So a
 * 500-point punch, a perfectly respectable hit, could only ever be the flicky
 * left-handed jab, and a 700 still drew it half the time. Tune these in points:
 *
 *   score  200   350   400   500   600   700   800   900   999
 *   heat  0.09  0.26  0.32  0.43  0.55  0.66  0.77  0.89  1.00
 *
 * ‼️Cost 0 throughout: the swing is not spectacle, it is the punch. It must never
 * be priced out by the scenery.
 *
 * ‼️Every clip must survive BOTH allowlists (the bundler's and the compact punch
 * prune) or the avatar silently does nothing in world.
 *
 * ‼️And every clip must land its contact near `EMOTE_CONTACT_MS` (380 ms in
 * punch-machine.ts), because that is when the bag is released. The three strikes
 * below sit at 322–417 ms. The front kick was cut for this as much as for being
 * a kick: its foot arrives at 760 ms, 130 ms AFTER the ball has already slammed
 * into the housing. Bring it back only with a per-card contact offset.
 */
export const PUNCH_SWING_CARDS: readonly ShowCard[] = [
  // A feeble punch gets a feeble punch. Capped at 350 points, so the flicky
  // left-hand jab is a verdict on the effort and never the reward for a good hit.
  { id: "swing-jab", channel: "swing", minHeat: 0, maxHeat: 0.26, cost: 0, duration: "beat" },
  // The workhorse straight right, open from 200 points. Closed at 820 so the top
  // of the range draws from a different shelf than an ordinary punch.
  { id: "swing-cross", channel: "swing", minHeat: 0.09, maxHeat: 0.8, cost: 0, duration: "beat" },
  // Cocked behind the hip, full torso turn, arm driven out to full extension.
  // This is what the owner meant by smashing it. From 384 points up.
  { id: "swing-haymaker", channel: "swing", minHeat: 0.3, cost: 0, duration: "beat" },
  // The rising right, from 603 points up.
  { id: "swing-uppercut", channel: "swing", minHeat: 0.55, cost: 0, duration: "beat" },
];

/**
 * THE BAG — EXTRA bursts layered over the guaranteed one.
 *
 * The fireball is NOT here: it is part of the floor above 0.86 and fires every
 * single time. Having it in a bag is what let a monster punch arrive without
 * fire on it.
 */
const IMPACT_CARDS: readonly ShowCard[] = [
  { id: "impact-puff", channel: "impact", minHeat: 0, maxHeat: 0.45, cost: 0, duration: "flash" },
  { id: "impact-dust", channel: "impact", minHeat: 0.28, maxHeat: 0.64, cost: 1, duration: "flash" },
  { id: "impact-sparks", channel: "impact", minHeat: 0.48, maxHeat: 0.82, cost: 1, duration: "beat" },
  { id: "impact-ring", channel: "impact", minHeat: 0.6, maxHeat: 0.92, cost: 2, duration: "beat" },
  { id: "impact-shards", channel: "impact", minHeat: HEAT_LOUD, cooldown: 2, cost: 2, duration: "beat" },
  { id: "impact-plasma", channel: "impact", minHeat: HEAT_EXTREME, cooldown: 2, cost: 4, duration: "beat", tags: ["fire"] },
];

/**
 * THE CABINET — extras. The nudge, the shake, the hard shake, the lurch and the
 * light flash all moved into the floor, because "how hard did the machine rock"
 * is the single most direct read of how hard you hit it and must not be a draw.
 *
 * ‼️That includes the cabinet's own RECOIL — the tip back onto its rear edge and
 * the sideways stagger (`updateCabinetRock`). It is floor, monotonic in score,
 * on every punch. The two cards below only ever RAISE it; they can never be the
 * only reason the machine moved. The bug they were added alongside is worth not
 * repeating: the guaranteed shake moved `machine.root`, which carries the island
 * and the crowd as well, so the whole scene slid as one rigid group and the
 * machine never once looked hit — *"everything moves, even the island almost
 * collapses, but the machine itself never moves"*.
 */
const CABINET_CARDS: readonly ShowCard[] = [
  { id: "cabinet-smoke", channel: "cabinet", minHeat: 0.5, maxHeat: 0.9, cooldown: 2, cost: 2, duration: "beat" },
  { id: "cabinet-glitch", channel: "cabinet", minHeat: 0.7, maxHeat: 0.96, cooldown: 2, cost: 2, duration: "beat" },
  {
    // The old OVERLOAD rung, now a card with its own gate rather than a
    // hardcoded `streak900 >= 3` branch buried in `escalate`.
    id: "cabinet-overload",
    channel: "cabinet",
    minHeat: 0.7,
    cost: 3,
    duration: "scene",
    when: (beat) => beat.streak900 >= 2,
    tags: ["overload"],
  },
  { id: "cabinet-blowout", channel: "cabinet", minHeat: 0.95, cooldown: 2, cost: 5, duration: "scene", rarity: 2 },
  // Sideways instead of backwards: the cabinet comes off one bottom corner and
  // rights itself. Opens well below the tip-back, because a middling punch can
  // knock a machine off balance without ever threatening to put it on its back.
  { id: "cabinet-stagger", channel: "cabinet", minHeat: 0.6, maxHeat: 0.95, cooldown: 2, cost: 1, duration: "beat" },
  // THE ONE THAT NEARLY GOES OVER: the floor's tip, but deeper and held at the
  // top long enough for the deck to believe the machine is going down.
  { id: "cabinet-tipback", channel: "cabinet", minHeat: HEAT_EXTREME, cooldown: 2, cost: 2, duration: "scene" },
];

/**
 * THE WORLD — the sky, the clouds, the island. The most expensive channel, and
 * mostly silent below LOUD on purpose: the island reacting has to mean the
 * island had a reason to.
 *
 * The sky quake is NOT here — it is floor above 950, guaranteed.
 *
 * ‼️A world card must be OVER before the next turn starts. Something that
 * outlives its punch is not a bigger celebration, it is a difficulty change
 * applied to whoever is up next.
 */
const WORLD_CARDS: readonly ShowCard[] = [
  { id: "world-sky-flash", channel: "world", minHeat: 0.55, maxHeat: 0.85, cost: 2, duration: "flash" },
  { id: "world-lightning", channel: "world", minHeat: 0.66, cooldown: 3, cost: 2, duration: "beat" },
  { id: "world-blizzard", channel: "world", minHeat: 0.97, cooldown: 4, cost: 4, duration: "scene" },
  { id: "world-aurora", channel: "world", minHeat: 0.62, maxHeat: 0.9, cost: 2, duration: "scene", rarity: 3 },
  { id: "world-confetti", channel: "world", minHeat: HEAT_LOUD, cooldown: 3, cost: 3, duration: "scene", conflicts: ["dark"] },
  { id: "world-shockring", channel: "world", minHeat: HEAT_EXTREME, cooldown: 3, cost: 4, duration: "scene" },
  { id: "world-meteor", channel: "world", minHeat: 0.93, cooldown: 2, cost: 5, duration: "scene", rarity: 3 },
  // Everything goes dark and silent for a beat BEFORE the blast. Contrast is the
  // loudest tool there is, and it only works while it is still a surprise.
  { id: "world-blackout", channel: "world", minHeat: 0.94, cooldown: 2, cost: 4, duration: "scene", rarity: 3, tags: ["dark"] },
  // ‼️THE ISLAND ROLL IS NOT IN HERE — it is FLOOR, at HEAT_APOCALYPSE. As a card
  // it was one of eight in the world bag, so a 999 rolled the island about one
  // time in eight and the biggest punch in the game usually paid out nothing
  // special. The owner asked for the opposite: *"this has to be at 999, not at
  // 939. This is like the maximum."* A maximum that only sometimes happens is
  // not a maximum. See `fireSlamFloor`.
];

/**
 * THE CROWD'S BODIES — DELIBERATELY EMPTY, and this note is why.
 *
 * `triggerAudience` already deals the audience a per-tier emote from a pool of a
 * dozen and already excludes the performer so a clap cannot overwrite the swing.
 * A second source of NPC emotes would put two systems on one body: an NPC has
 * ten emote slots and a clip written into one at trigger time evicts whatever
 * was there — the "standing dummy" failure the troupe's own notes describe.
 *
 * ‼️Fill this by MOVING the existing crowd reaction here, never by adding a
 * second caller.
 */
const CROWD_BODY_CARDS: readonly ShowCard[] = [];

/**
 * THE CROWD'S WORDS — mood pools, not lines. The runner builds each line from a
 * grammar, so what the regulars can say grows by multiplication rather than by
 * somebody typing another sentence.
 */
const CROWD_TEXT_CARDS: readonly ShowCard[] = [
  // ‼️THE CROWD DOES NOT COMMENT ON EVERY PUNCH.
  //
  // These five had no cooldown at all, so the bag drew a fresh bubble on very
  // nearly every hit while the AUDIBLE voice next door was already rationed to
  // one line per three silent hits. Two populations, one of them throttled, and
  // the owner heard the unthrottled one: "tone down what the speech bubbles
  // emit... every second or third time somebody makes an actual comment".
  //
  // A cooldown is measured in BEATS (punches), so 3 is literally "not before
  // the third punch from now" — the rationing he asked for, expressed in the
  // unit the director already counts in. `text-riot` and the two event cards
  // below stay ungated on purpose: a 999, a record and a streak are rare enough
  // to be their own throttle, and silence on those would read as a bug.
  { id: "text-dry", channel: "crowdText", minHeat: 0, maxHeat: 0.42, cost: 0, duration: "beat", rarity: 3, cooldown: 3 },
  { id: "text-mild", channel: "crowdText", minHeat: 0.36, maxHeat: 0.64, cost: 0, duration: "beat", rarity: 2, cooldown: 3 },
  { id: "text-warm", channel: "crowdText", minHeat: 0.6, maxHeat: 0.85, cost: 0, duration: "beat", cooldown: 3 },
  { id: "text-loud", channel: "crowdText", minHeat: HEAT_LOUD, maxHeat: 0.96, cost: 0, duration: "beat", cooldown: 2 },
  { id: "text-riot", channel: "crowdText", minHeat: 0.93, cost: 1, duration: "beat" },
  {
    id: "text-record",
    channel: "crowdText",
    minHeat: 0.45,
    cost: 0,
    duration: "beat",
    when: (beat) => beat.isRecord,
  },
  {
    id: "text-streak",
    channel: "crowdText",
    minHeat: 0.6,
    cost: 0,
    duration: "beat",
    when: (beat) => beat.streak900 >= 2,
  },
];

export const PUNCH_SHOW_CATALOG: readonly ShowCard[] = [
  ...IMPACT_CARDS,
  ...PUNCH_SWING_CARDS,
  ...CABINET_CARDS,
  ...SCREEN_CARDS,
  ...CROWD_BODY_CARDS,
  ...WORLD_CARDS,
  ...CROWD_TEXT_CARDS,
];

/**
 * The screen cards are named `screen-<pattern>` and the runner resolves them by
 * stripping the prefix, so a pattern with no card is dead code and a card with
 * no pattern is a runtime miss. Exported so the test can hold the two together.
 */
export function screenPatternForCard(id: string): string | null {
  if (!id.startsWith("screen-")) return null;
  const name = id.slice("screen-".length);
  return (SCREEN_PATTERNS as readonly string[]).includes(name) ? name : null;
}
