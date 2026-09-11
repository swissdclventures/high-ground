/**
 * THE SHOW DIRECTOR — what a punch LOOKS like, decided once, the same way, on
 * every client.
 *
 * The problem this replaces: presentation used to hang off `punchReactionIntensity`,
 * a single 1-4 tier read by the emote, the impact sound, the cabinet shake, the
 * crowd and the arc alike. Five channels reading one three-valued switch can only
 * ever produce three shows, which is why an 899 and a 999 arrived looking like
 * the same punch with a different number on it.
 *
 * The model here is a THEATRE, not a switch:
 *
 *   HEAT      one 0..1 number, cubed, so the top tenth of the range owns most of
 *             the spectacle instead of sharing it evenly with the middle.
 *   CHANNELS  ten independent tracks (the swing, the bag, the cabinet, the world,
 *             the arc, the crowd's bodies/voices/words, the announcer, the HUD).
 *             AT MOST ONE CARD PER CHANNEL PER PUNCH. This is the whole anti-salad
 *             law: a mess happens when two effects fight INSIDE a channel, never
 *             when ten channels each do one clean thing.
 *   BUDGET    spectacle points, `1 + round(heat * 12)`. A tap can afford one cheap
 *             card; a monster can afford thirteen points of them. Escalation is
 *             therefore automatic — the NUMBER of channels that light up grows
 *             with the score, with nothing hand-tuned per rung.
 *   BAGS      cards are drawn WITHOUT REPLACEMENT per channel. It is arithmetically
 *             impossible to see the same flash twice until the pool is exhausted,
 *             which is the answer to "always the same flash, the same comments".
 *
 * ‼️EVERYTHING HERE IS PURE AND SEEDED. Not one `Math.random()`, not one `Date.now()`.
 * Spectators and puncher must compose the SAME show or the multiplayer read falls
 * apart — one person seeing confetti while their neighbour sees a blackout is
 * worse than no effect at all. The seed rides in on the beat (the same discipline
 * `punchSweepNoise01` already uses for the marker), and every draw happens in a
 * fixed order, so the plan is a pure function of (beat, ledger).
 *
 * The catalog is DATA and lives next door in punch-show-catalog.ts; the effects
 * themselves live in the scene (punch-show-runner.ts) behind card ids. That split
 * is deliberate: it keeps composition testable in vitest with no explorer runtime,
 * and it means ADDING AN EFFECT IS ONE ENTRY IN ONE ARRAY plus one `case` in the
 * runner. Nothing else in the game has to know.
 */
import type { PunchMachineAppConfig } from "./punch-machine-contract";

/**
 * The ten tracks. One card each per punch, drawn in THIS order — the tracks a
 * punch cannot do without come first, so a tight budget is never spent on the
 * scenery while the bag itself goes unlit.
 */
export const SHOW_CHANNELS = [
  "impact",
  "swing",
  "cabinet",
  "screen",
  "crowdVoice",
  "crowdBody",
  "world",
  "crowdText",
  "announcer",
  "hud",
] as const;

export type ShowChannel = (typeof SHOW_CHANNELS)[number];

/**
 * How long a card occupies its channel. The ladder matters for one rule only:
 * AT MOST ONE `scene` CARD PER PUNCH. Long effects that stack are how a good
 * idea turns into an unreadable mess, and how a monster punch ends up still
 * shaking the island while the next player is trying to time their release.
 */
export type ShowDuration = "flash" | "beat" | "scene";

/** Upper bound on a `scene` card, enforced by the catalog test. */
export const SHOW_SCENE_MAX_MS = 5_000;

export interface ShowBeat {
  /**
   * The punch counter — the ledger's clock, and NOT wall time. Shared through
   * the coordinator so every client ages its cooldowns identically; a client
   * that joined late simply starts with an empty ledger, which costs it nothing
   * but a little early repetition.
   */
  index: number;
  /** Deterministic per-attempt seed. Same seed in, same show out, everywhere. */
  seed: number;
  score: number;
  /** 0..1, cubed. See `punchHeat`. */
  heat: number;
  /** Consecutive 900+ hits BEFORE this one, for the streak cards. */
  streak900: number;
  /** This punch beat the machine's standing best. */
  isRecord: boolean;
  /** This punch beat the puncher's own best. */
  isPersonalBest: boolean;
  /** True only on the client that threw it — for HUD and first-person cards. */
  isMine: boolean;
  /** A secret (seam / knock / twist) paid out on this punch. */
  isSecret: boolean;
}

export interface ShowCard {
  id: string;
  channel: ShowChannel;
  /**
   * The heat window, and it bounds the card at BOTH ends on purpose. A cheap
   * puff of smoke with `maxHeat: 0.7` is not merely unlikely on a monster, it is
   * INELIGIBLE — which is what stops a 999 from spending its budget on tap-sized
   * effects and is why the top of the range feels like a different game rather
   * than the same one turned up.
   */
  minHeat: number;
  maxHeat?: number;
  /** Spectacle points. Ignored when `essential`. */
  cost: number;
  duration: ShowDuration;
  /** Beats that must pass before this id may be drawn again. */
  cooldown?: number;
  /**
   * 1 (default) = eligible whenever its window is open. `n` = a 1-in-n roll on
   * top of that. `"session"` = once, ever, for this visit.
   *
   * Rarity is NOT tier: two 999s back to back must not look alike, and gating by
   * score alone cannot deliver that. This is the dial that makes something worth
   * telling somebody else about.
   */
  rarity?: number | "session";
  weight?: number;
  /** Tags this card publishes. */
  tags?: readonly string[];
  /** Never drawn alongside a card publishing any of these tags. */
  conflicts?: readonly string[];
  /**
   * Free, exempt from the budget, and drawn before anything else. Reserve it for
   * the things a punch is not a punch without — the bag has to make a noise.
   */
  essential?: boolean;
  /** An extra gate on the beat itself. Must stay pure. */
  when?: (beat: ShowBeat) => boolean;
}

export interface ShowPlan {
  beat: ShowBeat;
  cards: readonly ShowCard[];
  /** Points spent, for the debug harness. */
  spent: number;
  budget: number;
}

/**
 * HEAT — plain linear position in the score range, and it was CUBED here for a
 * day, which is the mistake this comment exists to stop anyone repeating.
 *
 * The cube did what it was asked: it pulled 899 and 999 apart (0.70 against
 * 1.00) so the top of the range could draw its own cards. What it also did, and
 * what nobody checked, was flatten everything BELOW that into nothing — a 700
 * scored 0.29 and a 500 scored 0.03, so two thirds of every session bought
 * almost no cards at all. The owner's verdict after one sitting: *"you need to
 * be over 900 and much more to actually see some major developments, otherwise
 * you just don't see it, it's super calm."* A punch machine whose reaction only
 * begins at 900 is a punch machine that does nothing for most of its punches.
 *
 * So heat is LINEAR and reads in score terms, which is also the only form
 * anybody can tune windows in without a calculator:
 *
 *   400 -> 0.32   500 -> 0.43   700 -> 0.66   820 -> 0.80
 *   900 -> 0.89   950 -> 0.94   985 -> 0.98   999 -> 1.00
 *
 * ‼️The top of the range is kept exclusive by CARD WINDOWS (`minHeat: 0.94+`)
 * and by rarity, never by bending this curve. Bending the curve to make a
 * monster special is the same lever as making everything else dull, and they
 * cannot be pulled separately.
 *
 * The bonus is allowed to carry a punch past `maxScore`, so this clamps.
 */
export function punchHeat(score: number, config: PunchMachineAppConfig): number {
  const span = Math.max(1, config.maxScore - config.minScore);
  const linear = Math.max(0, Math.min(1, (score - config.minScore) / span));
  // THE DIRECTOR'S FLOOR, not a curve: heat above it is the same line, moved
  // up. A floor of 0.6 puts a 500 where a 700 used to sit and leaves 999 at
  // 1.0, so the card windows at the top keep their meaning while the bottom
  // of a round stops being silence. See `heatFloor01` in punch-game-profile.
  const floor = Math.max(0, Math.min(0.95, Number(config.gameProfile?.heatFloor01) || 0));
  return floor + linear * (1 - floor);
}

/**
 * Spectacle points for one punch: 1 at the floor, 23 at a perfect hit.
 *
 * SQUARED, not linear and not cubed — the one place a curve belongs. Heat has
 * to stay linear so windows can be reasoned about in scores, but the number of
 * things happening AT ONCE should still climb faster than the score does:
 *
 *   500 -> 5    700 -> 11    820 -> 15    900 -> 18    950 -> 20    999 -> 23
 *
 * A 500 still buys four or five cards, which is the whole point — the middle of
 * the range has to be alive. The top pulls ahead on breadth as well as on the
 * exclusive cards its windows unlock.
 *
 * ‼️THE BUDGET IS NOT THE REWARD. Everything a punch is guaranteed — the flash,
 * the shake, the bag burst, the sting, the roar, the fireball, the quake — is
 * paid for by `fireSlamFloor` and is never rationed, never on cooldown and never
 * subject to a draw. Cards are what is ADDED on top. Getting that backwards is
 * what turned an addictive machine into a lottery for one release.
 */
export function punchShowBudget(heat: number): number {
  const h = Math.max(0, Math.min(1, heat));
  return 1 + Math.round(h * h * 22);
}

/**
 * A seeded stream. Integer-only LCG — `Math.imul` is exact, so two explorers on
 * different hardware cannot drift apart mid-draw the way accumulated float
 * multiplication lets them.
 */
export class ShowRng {
  private state: number;

  constructor(seed: number) {
    const base = Math.floor(Math.abs(Number.isFinite(seed) ? seed : 0));
    // Hash once before use: raw attempt seeds are near-consecutive integers, and
    // an LCG fed those returns near-consecutive first draws — which would make
    // every punch in a round pick the same card off the top of its bag.
    this.state = (Math.imul(base ^ 0x9e3779b9, 2246822519) >>> 0) || 1;
  }

  /** Next value in 0..1. */
  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  /** Fisher-Yates, seeded. Returns a new array; never touches the input. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      const swap = out[i]!;
      out[i] = out[j]!;
      out[j] = swap;
    }
    return out;
  }
}

/**
 * DEAL A POOL LIKE A DECK. DO NOT INDEX IT.
 *
 * ‼️The crowd's spoken lines used to be picked as
 * `pool[(seed + i) % pool.length]`, with `seed = serial * 7919 + roundStartedAt`
 * and the two voices of one punch taken at i and i+1. 7919 % 6 === 5, so the
 * index walked back by exactly one per attempt while the pair stayed adjacent:
 * every punch replayed one of the PREVIOUS punch's two lines, every time,
 * forever. Six clips in the pool, and the island still sounded like three.
 *
 * A deck fixes it by construction — shuffle the pool, hand out `count` cards per
 * attempt, reshuffle only when it runs out. Nothing repeats until everything
 * else has been heard, and two consecutive attempts cannot share a card.
 *
 * Seeded from the ROUND, not the attempt, so every explorer in the room deals
 * the same cards in the same order: a crowd saying different things to different
 * people is not one crowd.
 */
export function dealShowClips<T>(
  pool: readonly T[],
  serial: number,
  roundSeed: number,
  count: number,
): T[] {
  if (!pool.length || count <= 0) return [];
  const hand = Math.min(Math.floor(count), pool.length);
  if (hand <= 0) return [];
  const hands = Math.max(1, Math.floor(pool.length / hand));
  const attempt = Math.abs(Math.floor(Number.isFinite(serial) ? serial : 0));
  const deck = new ShowRng(roundSeed + Math.floor(attempt / hands) * 40503).shuffle(pool);
  const at = (attempt % hands) * hand;
  return deck.slice(at, at + hand);
}

/**
 * WHAT HAS BEEN SEEN LATELY — the memory that stops the show repeating itself.
 *
 * `bags` is the no-repeat guarantee: a shuffled queue of card ids per channel,
 * popped as cards are drawn and refilled only once empty. Not a random pick with
 * a cooldown bolted on — an actual draw without replacement, so a player cannot
 * see the same screen pattern twice until they have seen all of them.
 */
export interface ShowLedger {
  /** Beat index a card was last drawn on, for explicit cooldowns. */
  lastUsed: Map<string, number>;
  /** `rarity: "session"` cards already spent. */
  sessionUsed: Set<string>;
  /** Per-channel draw queues. */
  bags: Map<ShowChannel, string[]>;
}

export function createShowLedger(): ShowLedger {
  return { lastUsed: new Map(), sessionUsed: new Set(), bags: new Map() };
}

function inWindow(card: ShowCard, heat: number): boolean {
  return heat >= card.minHeat && heat <= (card.maxHeat ?? 1);
}

/**
 * Everything except cost and conflicts — the checks that do not depend on what
 * else has already been picked, so they can be run once per card per beat.
 */
function isEligible(card: ShowCard, beat: ShowBeat, ledger: ShowLedger, rng: ShowRng): boolean {
  if (!inWindow(card, beat.heat)) return false;
  if (card.when && !card.when(beat)) return false;
  if (card.rarity === "session") {
    if (ledger.sessionUsed.has(card.id)) return false;
  } else if (typeof card.rarity === "number" && card.rarity > 1) {
    if (rng.next() >= 1 / card.rarity) return false;
  }
  const cooldown = card.cooldown ?? 0;
  if (cooldown > 0) {
    const last = ledger.lastUsed.get(card.id);
    if (last !== undefined && beat.index - last < cooldown) return false;
  }
  return true;
}

function conflicts(card: ShowCard, published: Set<string>): boolean {
  for (const tag of card.conflicts ?? []) if (published.has(tag)) return true;
  return false;
}

function record(card: ShowCard, beat: ShowBeat, ledger: ShowLedger, published: Set<string>): void {
  ledger.lastUsed.set(card.id, beat.index);
  if (card.rarity === "session") ledger.sessionUsed.add(card.id);
  for (const tag of card.tags ?? []) published.add(tag);
}

/**
 * COMPOSE ONE PUNCH'S SHOW.
 *
 * Pure but for the ledger it advances, and the ledger is itself a pure function
 * of the beats that have gone before — so two clients that have watched the same
 * punches produce identical plans. A client that joined mid-round starts from an
 * empty ledger and merely repeats itself a little sooner, which is the right
 * failure: a spectator seeing a slightly staler show is nothing, a spectator
 * seeing a DIFFERENT show is a bug people report as "it lagged".
 */
export function composeShow(
  beat: ShowBeat,
  ledger: ShowLedger,
  catalog: readonly ShowCard[],
): ShowPlan {
  const rng = new ShowRng(beat.seed);
  const budget = punchShowBudget(beat.heat);
  const picks: ShowCard[] = [];
  const published = new Set<string>();
  const usedChannels = new Set<ShowChannel>();
  let spent = 0;
  let sceneUsed = false;

  // Essentials first and for free. A punch that makes no noise is not a punch,
  // and it must not be possible for the scenery to price the bag out of its own
  // impact — which is exactly what a single shared budget would allow.
  for (const card of catalog) {
    if (!card.essential) continue;
    if (usedChannels.has(card.channel)) continue;
    if (conflicts(card, published)) continue;
    if (card.duration === "scene" && sceneUsed) continue;
    if (!isEligible(card, beat, ledger, rng)) continue;
    picks.push(card);
    usedChannels.add(card.channel);
    if (card.duration === "scene") sceneUsed = true;
    record(card, beat, ledger, published);
  }

  // Then one card per remaining channel, in priority order, until the points
  // run out. The loop stops asking once it cannot afford anything at all.
  for (const channel of SHOW_CHANNELS) {
    if (usedChannels.has(channel)) continue;
    if (spent >= budget) break;
    const pool = catalog.filter((card) => card.channel === channel && !card.essential);
    if (!pool.length) continue;

    const bag = takeBag(ledger, channel, pool, rng);
    // Walk the bag, not the pool: the queue IS the no-repeat promise. A card
    // that is ineligible right now stays where it is and gets its turn on a
    // later punch, rather than being burned by a beat it could not play on.
    let chosen: ShowCard | null = null;
    for (let attempt = 0; attempt < 2 && !chosen; attempt += 1) {
      for (let i = 0; i < bag.length; i += 1) {
        const card = pool.find((entry) => entry.id === bag[i]);
        if (!card) {
          bag.splice(i, 1);
          i -= 1;
          continue;
        }
        if (card.cost > budget - spent) continue;
        if (card.duration === "scene" && sceneUsed) continue;
        if (conflicts(card, published)) continue;
        if (!isEligible(card, beat, ledger, rng)) continue;
        bag.splice(i, 1);
        chosen = card;
        break;
      }
      // Exhausted without a match: refill once and try again, so a channel whose
      // whole queue happened to be on cooldown still gets a shot this punch.
      if (!chosen && attempt === 0) {
        const refill = rng.shuffle(pool.map((card) => card.id));
        ledger.bags.set(channel, refill);
        bag.length = 0;
        for (const id of refill) bag.push(id);
      }
    }
    if (!chosen) continue;

    picks.push(chosen);
    usedChannels.add(channel);
    spent += chosen.cost;
    if (chosen.duration === "scene") sceneUsed = true;
    record(chosen, beat, ledger, published);
  }

  return { beat, cards: picks, spent, budget };
}

function takeBag(
  ledger: ShowLedger,
  channel: ShowChannel,
  pool: readonly ShowCard[],
  rng: ShowRng,
): string[] {
  let bag = ledger.bags.get(channel);
  if (!bag || !bag.length) {
    bag = rng.shuffle(pool.map((card) => card.id));
    ledger.bags.set(channel, bag);
  }
  return bag;
}
