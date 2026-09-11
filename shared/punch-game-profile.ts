/** Serializable Punch Machine rules. Builder, MCP and runtime share this contract. */
export const PUNCH_PROFILE_IDS = ['classic', 'streak-rush', 'crowd-party'] as const;
/**
 * Written by every Save. A saved profile BELOW this version is migrated on load:
 * its gates, cadences, music streak, voices and bubbles come from today's
 * defaults; the things a person chose stay. Bump it when a default changes in a
 * way that an old saved copy would silently undo.
 */
export const PUNCH_PROFILE_VERSION = 6;
/**
 * ‼️THERE IS NO RULES GENERATION ANY MORE, AND THAT IS THE POINT. A constant
 * that retires every saved board when it moves is a reset waiting to be typed
 * by accident, and this game had one for months (see `punchProfileBoardKey`).
 * The only way to empty a board is now to rename `boardStore.venue` in
 * Apps → Punch Machine, which nobody does by mistake.
 */
export type PunchProfileId = typeof PUNCH_PROFILE_IDS[number];
import {
  PUNCH_PUSH_ASK_MS,
  PUNCH_PUSH_BLEED_PER_SEC,
  PUNCH_PUSH_FULL,
  PUNCH_PUSH_MAX_PER_ROUND,
  PUNCH_PUSH_PER_SEC,
  PUNCH_PUSH_WINDOW_MS,
} from './punch-push';

export const PUNCH_RESCUE_FREQUENCIES = ['off', 'low', 'normal', 'high', 'maximum'] as const;
export type PunchRescueFrequency = typeof PUNCH_RESCUE_FREQUENCIES[number];
/**
 * ‼️THE RESCUE VOCABULARIES LIVE HERE AND NOT IN `punch-challenge.ts`, WHICH IS
 * WHERE THEY BELONG BY SUBJECT. `punch-challenge` imports this file for
 * `punchProfileSpeed` and `PunchGameProfile`, so declaring them there and
 * importing them back would close a cycle — the same reason `karmaRingBand01`'s
 * default is written out here rather than imported. Both modules read these; the
 * scoring functions that use them stay in `punch-challenge`.
 */
/**
 * ★★★ `push` IS THE SHIPPED ONE. The other three are kept selectable because a
 * Director may want them and because their tests still pin them -- but every one
 * of them failed the same way in the room: an abstract widget that had to teach
 * a brand-new rule inside a four-second window. `push` fights over HER SCORE,
 * a number the room has been reading all night. See `shared/punch-push.ts`.
 */
export const PUNCH_RESCUE_SKILLS = ['push', 'band-taps', 'closest-shot', 'hold'] as const;
export type PunchRescueSkill = typeof PUNCH_RESCUE_SKILLS[number];
export const PUNCH_RESCUE_FAILURE_TELLS = ['near-miss', 'silent', 'house-bot'] as const;
export type PunchRescueFailureTell = typeof PUNCH_RESCUE_FAILURE_TELLS[number];
/** How the game warns you a dangerous punch is coming. `physical` carries no text. */
export const PUNCH_FUMBLE_RISK_STYLES = ['physical', 'chip', 'both'] as const;
export type PunchFumbleRiskStyle = typeof PUNCH_FUMBLE_RISK_STYLES[number];
export const PUNCH_EFFECT_IDS = [
  'impactAudio', 'cabinetAudio', 'crowdVoice', 'crowdText', 'crowdBody',
  'particles', 'fire', 'cabinetMotion', 'islandMotion', 'screenMotion',
  'cameraMotion', 'screenFx', 'worldFx', 'celebration',
  'lightning', 'blizzard',
] as const;
/**
 * ‼️THE MUSIC IS A CELEBRATION, NOT A BACKGROUND BED. Owner, 2026-09-08:
 * *"music is an escalation level melody — if you're doing really good and you
 * reach a certain level of escalation the music should play once to celebrate
 * that moment, not as background music."*
 *
 * Two earlier cuts both failed that sentence from opposite ends. The bubble
 * loops were four seconds long and, repeated under a crowd at 0.35, were never
 * heard as music at all. The full Kevin MacLeod tracks that replaced them ran
 * two and two-and-a-half MINUTES on `loop: true`, restarted on every round key
 * and were cut off mid-phrase when the bed's gate closed — a bed that stutters.
 *
 * What ships is an EXCERPT of each, cut on a fade so the melody finishes by
 * itself, fired once by `punchEscalationTrack`. Kevin MacLeod, CC BY 4.0 —
 * credit and the exact ffmpeg cut in scene/sounds/punch/music/CREDITS.txt.
 */
export const PUNCH_MUSIC_TRACKS = {
  breaktime: 'sounds/punch/music/breaktime-sting.mp3',
  roulette: 'sounds/punch/music/deadly-roulette-sting.mp3',
} as const;
/**
 * How long each melody runs, in ms — the length of the file, not a guess.
 *
 * The runtime holds the melody's slot for exactly this long: nothing may
 * retrigger it, and nothing stops it early. A number that drifts from the file
 * is the bug the owner reported, so re-measure after any re-cut:
 *   ffprobe -v error -show_entries format=duration -of csv=p=0 <file>
 */
export const PUNCH_MUSIC_TRACK_MS: Record<keyof typeof PUNCH_MUSIC_TRACKS, number> = {
  breaktime: 14_000, roulette: 16_000,
};

/**
 * WHICH MELODY THIS RUNG IS OWED, or '' for a rung that gets none.
 *
 * The ladder is the escalation: `musicStartStreak` plays the first melody, the
 * rung above it the second, and a run past the end of the list keeps the last
 * one — a player deep in a streak is not told the game stopped watching. Rung
 * 0 never plays: a profile that still carries `musicStartStreak: 0` from the
 * bed era would otherwise fire on the first punch of every turn.
 */
export function punchEscalationTrack(
  streak: number,
  profile: Pick<PunchGameProfile, 'musicEnabled' | 'musicStartStreak' | 'musicTracks'>
): keyof typeof PUNCH_MUSIC_TRACKS | '' {
  if (!profile.musicEnabled || !profile.musicTracks.length) return '';
  const rung = Number.isFinite(streak) ? Math.floor(streak) : 0;
  const start = Math.max(1, Math.floor(profile.musicStartStreak));
  if (rung < start) return '';
  const step = Math.min(rung - start, profile.musicTracks.length - 1);
  return profile.musicTracks[step] ?? '';
}
/** Retired four-second loops that old saved profiles may still name as music. */
const PUNCH_RETIRED_SHORT_MUSIC_LOOPS: ReadonlySet<string> = new Set(['rush', 'hot', 'bounty', 'ball']);
export type PunchEffectId = typeof PUNCH_EFFECT_IDS[number];
export interface PunchEffectRule {
  enabled: boolean;
  intensity: number;
  minScore: number;
  /** Either the score OR this streak opens the effect. Zero disables this alternative. */
  minStreak: number;
  chance: number;
  cooldown: number;
}
export interface PunchGameProfile {
  id: PunchProfileId;
  title: string;
  multipliers: number[];
  maxAttempts: number;
  speedStep: number;
  speedMax: number;
  varianceStep: number;
  difficultyGain: number;
  difficultyMax: number;
  earlyBonus: number;
  musicEnabled: boolean;
  goldenBallEnabled: boolean;
  /**
   * THE GOLDEN BALL. Every Nth consecutive 900+ turns the NEXT ball gold; a
   * gold ball smashed over 900 pays the streak ladder times `goldenMultiplier`.
   * Under 900 the gold is lost with the streak. 0 switches the arming off.
   */
  goldenEveryStreak: number;
  goldenMultiplier: number;
  /**
   * THE RUNG THAT FIRES THE FIRST MELODY — not the moment a bed starts.
   *
   * A streak reaching this rung plays melody #1 once; every rung above it plays
   * the next melody in `musicTracks`, once, and the top melody repeats for
   * rungs beyond the list. 0 would fire on the first punch of every turn, which
   * is a background bed by another name — the default is the rung where the
   * ladder starts shouting (CRAZY STREAK x3).
   */
  musicStartStreak: number;
  musicVolume: number;
  musicTracks: Array<keyof typeof PUNCH_MUSIC_TRACKS>;
  /** Spectator Fumble Rescue. `maximum` is tonight's unmistakable tuning. */
  rescueFrequency: PunchRescueFrequency;
  rescueCooldownAttempts: number;
  rescuePreparationMs: number;
  rescueWindowMs: number;
  rescueTapsRequired: number;
  /**
   * ‼️THE SAVE IS A LAST CHANCE, NOT A SAFETY NET — and these three fields are
   * the whole of the repair to a mechanic that could not end.
   *
   * Owner, 2026-09-08: *"it's never ending… they should get one save and that's
   * it… this is really for people who are about to leave the game, no more hits,
   * they get one last chance."* Three separate things were keeping it alive:
   * `rescueFrequency: 'maximum'` made the opportunity roll always succeed,
   * `rescueCooldownAttempts: 0` made the cooldown always ready, and NOTHING
   * capped it per round. A win then raised `attemptsCeiling` as well as
   * `attemptsAllowed`, so even the queue's fairness cap could not close it, and
   * it restored the streak, which re-armed the `priorStreak > 0` gate for the
   * next fumble. A loop with no exit.
   *
   * `rescueLastChanceOnly` is the one that changes the meaning: the window opens
   * only when the fumbler has no punches left, so a save is the difference
   * between going home and one more swing — never a mulligan on punch two.
   */
  rescueLastChanceOnly: boolean;
  /** Saves a single round may spend. 1 is the owner's rule; 0 is off. */
  rescueMaxPerRound: number;
  /** What the room has to do to save them. See `PUNCH_RESCUE_SKILLS`. */
  rescueSkill: PunchRescueSkill;
  /** Net taps inside the band, for `band-taps`. Misses subtract. */
  rescueBandTapsRequired: number;
  /** Half-width of the gold band. A DUTY CYCLE — see `PUNCH_RESCUE_BAND_01`. */
  rescueBand01: number;
  /**
   * THE PUSH. What one perfect pulse is worth, and how hard the machine drags
   * back. Swept in `shared/punch-push.ts` -- a solo player who tracks the drift
   * lands a 300-point gap on the buzzer at 24. Lower it and solo becomes
   * impossible; that is the number that broke the promise in testing.
   */
  rescuePushFull: number;
  /** Points per second held in the green. THE scoring knob -- see punch-push.ts. */
  rescuePushPerSec: number;
  rescuePushBleedPerSec: number;
  /** How long the blanked screen asks the room whether they want to play. */
  rescuePushAskMs: number;
  /** What the loser sees when nobody saves them. */
  rescueFailureTell: PunchRescueFailureTell;
  /**
   * ‼️THE ADMIN'S OWN TEST BUTTON, because the Rescue is the one mechanic in
   * this game NOBODY CAN REACH ON PURPOSE.
   *
   * It opens on somebody ELSE'S last punch, under 900, on a live streak, with a
   * spectator watching and a save still left in the round — five conditions the
   * owner cannot line up at will, so the observer half of the game has only ever
   * been shipped on inspection rather than on play.
   *
   * ‼️`adminIds` IS AN EXTRA LIST, NOT THE ANSWER. The scene's own hosts
   * (`social.event.adminWallets`, the Scene ▸ Hosts list, which the Builder
   * fills with the publishing wallet on every save) are the admins. Whoever
   * published the world gets the chip by having published it — there is nothing
   * to fill in. This field only adds wallets that are NOT hosts, e.g. a
   * playtester you do not want running the rest of the place.
   *
   * It shipped the other way round on 2026-09-09 and the owner never saw the
   * button: *"I'm the admin by the definition of the builder tool, I don't need
   * to put in another wallet anywhere."* He was right.
   *
   * `adminToolsEnabled` hides every admin control at once, hosts included.
   *
   * Deliberately NOT in `punchProfileBoardKey`: a test button is not a rule of
   * the game, and putting it in the key would start a fresh leaderboard the
   * first time an address is typed in.
   */
  adminIds: string;
  /** Master switch for every in-world admin control. */
  adminToolsEnabled: boolean;
  /**
   * ‼️THE FOCUS GAME, ON A SWITCH.
   *
   * It was removed in `0f094b96` by hardwiring `const showFocusPill = false` and
   * deleting its sixteen tests, which is a deletion wearing a reversible face:
   * ~700 lines of runtime stayed in the tree with nothing calling them. Owner,
   * 2026-09-08: *"I want to bring it back but I want to put it behind the toggle
   * so we can switch it on and off at will and we should be able to manage it in
   * the director space."*
   *
   * OFF (the default) is exactly today's game: no meter, no coach, no balloons,
   * no waves, no channelling regulars, and the coordinator does not bank a
   * single point. The Focus key belongs entirely to Fumble Rescue.
   *
   * ON restores the whole waiting game — queued players bank Focus while
   * somebody else punches and spend it to rescue a short punch on a streak.
   * Rescue still wins the key while its window is open; see `punchFocusPress`.
   *
   * `saveEarnPoints`, `crowdGain` and `karmaRingBand01` below are its tuning and
   * are read only while this is on.
   */
  focusEnabled: boolean;
  /**
   * ‼️CROWD BOOST — THE ONLY DOOR TO FOUR DIGITS, AND IT WAS NAILED SHUT.
   *
   * `punchScoreForQuality01` clamps a punch at `maxScore` (999) and the crowd's
   * points are the only thing added on top, so this switch alone decides whether
   * `PUNCH_HIGH_GROUND_THRESHOLD` (1000) is a goal or a lie. It was neither for
   * the whole build: `scorePunch` passed `boosts: []` and `updateFocus` set
   * `member.points = 0`, two hardwired constants that turned the mechanic off
   * without leaving a switch — the exact deletion-wearing-a-reversible-face this
   * file already caught once in `focusEnabled`. Owner, 2026-09-08: *"It says
   * break the 1000 but I don't think it's possible."* It was not.
   *
   * OFF (the default) is the game of 2026-09-06 and the owner's line that made
   * it — *"they never help the current competitor"*: the meter pays FOCUS to the
   * tapper for their own next turn, the puncher's score is theirs alone, and the
   * HUD says `PERFECT IS 999` because that is the truth.
   *
   * ON restores the contract's designed loop: a spectator's held beat is banked
   * on the coordinator's committed ledger and ADDED to the punch, per person, by
   * name, on the result card. NPCs still cannot cross the line — see the clamp
   * in `punchAwardCrowdBoost`. Only people break High Ground.
   *
   * ‼️READ ONLY WHILE `focusEnabled`. There is no meter to hold without it, so
   * `punchBoostLive()` is the one place allowed to answer "is Boost paying?".
   */
  boostEnabled: boolean;
  /**
   * ‼️KARMA — "BOOST WELL, PUNCH HARDER", AND IT WAS DEAD CODE TOO.
   *
   * The trade the whole spectator game is built on: ring-time you hold while
   * SOMEBODY ELSE punches is banked under your name and comes back as a
   * multiplier on your own next turn. Every piece of it shipped — the ring on
   * the meter, the KARMA row on the pill, the reveal card's gain/spent/clipped
   * lines, `punchKarmaSelfMultiplier`, a client-side estimate that already
   * passes `hud.karmaBank` — and the coordinator passed `karma: 0` while
   * `bankKarma`, `spendKarma` and `karmaFor` were never called by anything. So
   * every bank was empty, every multiplier was ×1, and the KARMA row never drew.
   *
   * ‼️THIS IS NOT `boostEnabled` AND MUST NOT BE FOLDED INTO IT. Boost moves
   * points onto the punch you are watching, which is the thing the owner ruled
   * out on 2026-09-06 — *"they never help the current competitor"*. Karma never
   * touches the current puncher's score at all: it pays the HOLDER, later, on
   * their own swing. That is why it can be on while Boost is off, and it is the
   * version of the waiting game that rule actually asks for.
   *
   * It also cannot break High Ground on its own: `punchScoreForAttempt` applies
   * the multiplier to the SKILL score and re-clamps at `maxScore`, so a full
   * bank makes a scrappy punch perfect and a perfect punch nothing at all.
   *
   * ‼️READ ONLY WHILE `focusEnabled` — the ring lives on the Focus meter, and
   * with Focus off the coordinator never ticks `updateFocus` to measure it. Ask
   * `punchKarmaLive()`, never this field alone.
   */
  karmaEnabled: boolean;
  /** Focus points a spent rescue is worth. Read only while `focusEnabled`. */
  saveEarnPoints: number;
  /** @deprecated Compatibility alias. Rescue is enabled when rescueFrequency is not `off`. */
  savesEnabled: boolean;
  /** Human boost multiplier on the Focus meter. Read only while `focusEnabled`. */
  crowdGain: number;
  /**
   * Half-width of the karma ring on the Boost meter — the Game director's
   * difficulty knob for the spectator game. 0.02 is a hair (nobody reaches
   * it), 0.06 pays an attentive booster every turn, 0.075 is the whole solo
   * green. Mirrors `PUNCH_FOCUS_KARMA_BAND_01` in the contract; the contract
   * imports this file, so the default is written out here rather than imported.
   */
  /** Read only while `focusEnabled`. */
  karmaRingBand01: number;
  /**
   * ‼️FUMBLE RISK, SAID PHYSICALLY — no words anywhere.
   *
   * The needle already gets faster and wider every attempt
   * (`punchProfileSpeed`, `varianceStep`) and faster again if you overhold past
   * `PUNCH_OVERHOLD_PLATEAU` ideals, and NONE of that was visible before the
   * punch: `challengeLabel` printed `DIFFICULTY ×1.28` afterwards, on the rail's
   * lowest rank, as a receipt. Owner, 2026-09-08, choosing how to show it:
   * *"make it physical, not text."*
   *
   * So the track bleeds toward danger and the cabinet lights tighten and go cold
   * as the risk climbs — the arc carries no text and neither does this. Off
   * restores the flat track and the ordinary lights.
   */
  fumbleRiskTellEnabled: boolean;
  /** `physical` (default) carries no words at all; `chip` and `both` name it on the rail. */
  fumbleRiskTellStyle: PunchFumbleRiskStyle;
  fastRevealMs: number;
  voices: number;
  bubbles: number;
  celebrationEmote: 'handsair' | 'fistpump' | 'clap' | 'wave';
  /**
   * ‼️THE BODY BELOW 900 — the reaction ladder, not a second celebration.
   *
   * 2026-09-08 took `handsair` off every punch, which was right (a 300 and a 950
   * looked identical) but left the bands under 900 with NOTHING: the puncher
   * stood still and the machine did all the talking. Owner, 2026-09-08: *"you're
   * always celebrating raising the arms up… I'm missing a series of emotes that
   * represent something else — seeking approval or humble… turning around and
   * shrugging."*
   *
   * ON (the default) the puncher's body answers the number the whole way down:
   * deflate, shrug, shake it out. Every clip already ships — see
   * `PUNCH_REACTION_BANDS` in the runtime. OFF restores the 09-08 silence, and
   * the 900+ signature moves are untouched either way.
   */
  reactionMovesEnabled: boolean;
  impactStyle: 'auto' | 'bass';
  /**
   * THE AGGRESSION KNOB. The lowest heat any punch is allowed to read as, 0–0.95.
   *
   * Heat is the score on a 0–1 line and every show card has a window on it:
   * smoke opens at 0.5, the sky flash at 0.55, lightning at 0.66, the loud tier
   * at 0.77. With the floor at 0 a 400 is a puff and a sting; at the default
   * 0.35 that 400 already smokes and flashes the sky, the loud tier opens
   * around 700 instead of 800, the extreme tier around 850 instead of 900,
   * and a 999 is still a 999. The line above the floor stays LINEAR, so the
   * top stays the top — this raises the bottom, it does not bend the curve.
   *
   * Owner, 2026-09-07: "in the beginning, from the first hit you would smash it
   * and the updates would keep coming." That is what a floor is for.
   */
  heatFloor01: number;
  /** See PUNCH_PROFILE_VERSION. Absent or lower: the saved numbers predate today's defaults. */
  profileVersion: number;
  disabledCards: string[];
  disabledAudio: string[];
  /**
   * Optional wallet identity for the Fumble Rescue coach presentation.
   * Empty uses the shipped coach character art.
   */
  coachUserId: string;
  effects: Record<PunchEffectId, PunchEffectRule>;
}
const rule = (intensity: number, minScore = 0, minStreak = 0, chance = 100, cooldown = 0): PunchEffectRule =>
  ({ enabled: true, intensity, minScore, minStreak, chance, cooldown });

export function punchProfile(id: PunchProfileId = 'streak-rush'): PunchGameProfile {
  const profile: PunchGameProfile = {
    id, title: id === 'classic' ? 'Classic' : id === 'crowd-party' ? 'Crowd Party' : 'Streak Rush',
    multipliers: id === 'classic' ? [1, 1, 1, 2, 3, 4] : [1, 1, 2, 4, 8, 16, 32, 64],
    maxAttempts: id === 'classic' ? 6 : id === 'crowd-party' ? 8 : 12,
    speedStep: 0.04, speedMax: 1.3, varianceStep: 0.12,
    difficultyGain: 7, difficultyMax: 16, earlyBonus: 0,
    musicEnabled: true, musicStartStreak: 3, musicVolume: 0.75, musicTracks: ['breaktime', 'roulette'],
    goldenBallEnabled: true,
    goldenEveryStreak: 3, goldenMultiplier: 2,
    rescueFrequency: 'maximum', rescueCooldownAttempts: 0,
    // 7,000 ms was a window sized for twelve taps. A skill test wants a short,
    // loud one: four seconds is two full sweeps of the marker plus the beat it
    // takes to see it, and it is the difference between a save and a chore.
    rescuePreparationMs: 1_200, rescueWindowMs: PUNCH_PUSH_WINDOW_MS, rescueTapsRequired: 12,
    rescueLastChanceOnly: true, rescueMaxPerRound: PUNCH_PUSH_MAX_PER_ROUND,
    rescueSkill: 'push', rescueBandTapsRequired: 3, rescueBand01: 0.22,
    rescuePushFull: PUNCH_PUSH_FULL, rescuePushPerSec: PUNCH_PUSH_PER_SEC,
    rescuePushBleedPerSec: PUNCH_PUSH_BLEED_PER_SEC,
    rescuePushAskMs: PUNCH_PUSH_ASK_MS,
    rescueFailureTell: 'near-miss',
    adminIds: '', adminToolsEnabled: true,
    // OFF is today's shipped game. The toggle is the owner's, not a default.
    focusEnabled: false,
    // ‼️AND SO IS THIS ONE. `crowd-party` is the preset whose whole premise is
    // that the room plays too, so it is the one profile that ships with four
    // digits on the table — and even there it stays dark until `focusEnabled`
    // is on, because there is no beat to hold without the meter.
    boostEnabled: id === 'crowd-party',
    // Off with the rest of the waiting game. `crowd-party` is again the preset
    // whose premise is that the room is playing, so it is the one that ships
    // with the trade switched on.
    karmaEnabled: id === 'crowd-party',
    saveEarnPoints: 36, savesEnabled: true, crowdGain: id === 'crowd-party' ? 1.5 : 1,
    karmaRingBand01: 0.04,
    fumbleRiskTellEnabled: true, fumbleRiskTellStyle: 'physical',
    fastRevealMs: 900, voices: 2, bubbles: 2, celebrationEmote: 'handsair',
    reactionMovesEnabled: true,
    impactStyle: 'bass', disabledCards: [], disabledAudio: [], coachUserId: '',
    heatFloor01: 0.6,
    profileVersion: PUNCH_PROFILE_VERSION,
    // ‼️EVERY GATE IS OPEN. 2026-09-07, two days before the deadline, the owner:
    // "the game is boring as ****", "whenever we try it gets worse", "in the
    // beginning from the first hit you would smash it". He was right and the
    // numbers below say why: fire from 860, the island from 900, celebration
    // from 940, lightning 960, blizzard 985, music only after FOUR 900s in a
    // row. A round of 800s was quiet BY DESIGN, and nobody had asked for that.
    //
    // minScore is 0 everywhere now. Every effect fires on every punch, scaled by
    // the score through its own intensity math, and the director is an
    // AMPLIFIER — the owner turns things down or off from there, never earns
    // them. The minStreak ladder still stands as the promise
    // `punch-streak-escalation.test.ts` holds; it is simply no longer the only
    // door in.
    //
    // ‼️EVERY minScore HERE MUST STAY BELOW 999, AND THE minStreak LADDER
    // MUST NOT MOVE.
    //
    // `maxScore` is 999 and `PUNCH_HIGH_GROUND_THRESHOLD` is 1000, so a perfect
    // solo punch scores 999 and four digits are reachable ONLY with human boost
    // -- the NPC clamp in `punchAwardCrowdBoost` refuses to cross the line by
    // design, and its headroom is `floor((999 - base) * 0.35)`, which is ZERO
    // once the punch is good. A score gate at 1000 therefore does not read as
    // "a huge punch"; it reads as "never, unless humans are in the room". That
    // is how the island shake, the celebration and the entire weather tier went
    // unseen for the whole build, including on a 997 with 100/100/100.
    //
    // The score ladder below is expressed against the 999 ceiling so punching
    // better visibly does more. High Ground (1000+) stays the thing on top, and
    // the streak milestones -- screen@3, fire+camera+voice@4, island@5 -- are a
    // separate promise held by `punch-streak-escalation.test.ts`. Change a
    // minStreak or a cooldown and you move those milestones; only the minScore
    // column is safe to retune here.
    effects: {
      impactAudio: rule(100), cabinetAudio: rule(100), crowdVoice: rule(100, 0, 2, 100, 0),
      crowdText: rule(100, 0, 2, 100, 0), crowdBody: rule(100, 0, 2),
      particles: rule(100, 0, 2, 100), fire: rule(100, 0, 4, 100, 0),
      cabinetMotion: rule(100), islandMotion: rule(100, 0, 5, 100, 0),
      screenMotion: rule(100, 0, 3, 100, 0), cameraMotion: rule(100, 0, 4, 100, 0),
      screenFx: rule(100), worldFx: rule(100, 0, 3, 100, 0), celebration: rule(100, 0, 4, 100, 0),
      lightning: rule(100, 0, 5, 100, 0), blizzard: rule(100, 0, 8, 100, 0),
    },
  };
  if (id === 'classic') {
    profile.effects.cameraMotion.enabled = false;
    profile.effects.islandMotion.intensity = 35;
  }
  if (id === 'crowd-party') { profile.voices = 3; profile.effects.crowdVoice.chance = 100; }
  return profile;
}
function number(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export function normalizePunchProfile(input: unknown): PunchGameProfile {
  const raw = input && typeof input === 'object' ? input as Partial<PunchGameProfile> : {};
  const id = PUNCH_PROFILE_IDS.includes(raw.id as PunchProfileId) ? raw.id! : 'streak-rush';
  const base = punchProfile(id);
  // ‼️A PROFILE SAVED BEFORE THE GATES OPENED STILL CARRIES THE OLD GATES.
  //
  // The director panel serialises the WHOLE profile into the scene, defaults
  // included, so the owner's HIGHGROUND recipe held fire 860 / island 900 /
  // celebration 940 / music-after-four-900s as if he had typed them. He never
  // did; they were the old defaults, written back by Save. Changing the
  // defaults therefore changed nothing for the one scene that mattered, and
  // 2026-09-07 23:00 he played a whole round of it: "boring as before, almost
  // nothing has changed". He was right, and the fix from earlier that night
  // was a fix for new scenes only.
  //
  // ‼️TOLD APART BY `profileVersion`, NOT BY A FIELD THAT HAPPENS TO BE NEW. The
  // first cut keyed on the absence of `heatFloor01` and lost the same night: the
  // owner opened the panel on a Builder that already WROTE that field but did
  // not yet migrate, saved, and published a profile carrying heatFloor01 AND the
  // old gates -- a legacy profile in modern clothes, waved through. A version is
  // written only by code that knows the new defaults, so no intermediate build
  // can forge it. For a profile below it, the numbers that were never choices — score gates,
  // intensities, chances, cooldowns, the music streak, voices, bubbles — come
  // from today's defaults. What stays is what a person actually decided:
  // enabled switches, multipliers, golden ball, saves, tracks, the coach, the
  // disabled lists. The next Save writes heatFloor01 and the migration retires.
  const legacy = !(Number(raw.profileVersion) >= PUNCH_PROFILE_VERSION);
  const effects = { ...base.effects };
  for (const key of PUNCH_EFFECT_IDS) {
    const saved = raw.effects?.[key];
    const patch: Partial<PunchEffectRule> | undefined = legacy && saved ? { enabled: saved.enabled } : saved;
    const fallback = base.effects[key];
    effects[key] = {
      enabled: typeof patch?.enabled === 'boolean' ? patch.enabled : fallback.enabled,
      intensity: number(patch?.intensity, fallback.intensity, 0, 100),
      minScore: Math.round(number(patch?.minScore, fallback.minScore, 0, 10000)),
      minStreak: Math.round(number(patch?.minStreak, fallback.minStreak, 0, 99)),
      chance: number(patch?.chance, fallback.chance, 0, 100),
      cooldown: Math.round(number(patch?.cooldown, fallback.cooldown, 0, 20)),
    };
  }
  const requestedMusicTracks = Array.isArray(raw.musicTracks) ? raw.musicTracks : null;
  const usableMusicTracks = requestedMusicTracks
    ? [...new Set(requestedMusicTracks.filter(id => Object.prototype.hasOwnProperty.call(PUNCH_MUSIC_TRACKS, id)))].slice(0, 4)
    : base.musicTracks;
  // A saved list made exclusively from the retired four-second loops was once
  // valid. Migrate that exact legacy case to the real arena tracks; preserve an
  // intentionally empty list and reject arbitrary unknown ids as before.
  const retiredMusicOnly = !!requestedMusicTracks?.length
    && usableMusicTracks.length === 0
    && requestedMusicTracks.every(id => PUNCH_RETIRED_SHORT_MUSIC_LOOPS.has(String(id)));
  return {
    ...base, effects,
    multipliers: Array.isArray(raw.multipliers) && raw.multipliers.length
      ? raw.multipliers.slice(0, 16).map(v => number(v, 1, 1, 64)) : base.multipliers,
    maxAttempts: Math.round(number(raw.maxAttempts, base.maxAttempts, 3, 20)),
    speedStep: number(raw.speedStep, base.speedStep, 0, 0.1),
    speedMax: number(raw.speedMax, base.speedMax, 1, 1.6),
    varianceStep: number(raw.varianceStep, base.varianceStep, 0, 0.25),
    difficultyGain: number(raw.difficultyGain, base.difficultyGain, 0, 20),
    difficultyMax: number(raw.difficultyMax, base.difficultyMax, 1, 64),
    earlyBonus: number(raw.earlyBonus, base.earlyBonus, 0, 0.25),
    musicEnabled: typeof raw.musicEnabled === 'boolean' ? raw.musicEnabled : base.musicEnabled,
    goldenBallEnabled: typeof raw.goldenBallEnabled === 'boolean' ? raw.goldenBallEnabled : base.goldenBallEnabled,
    goldenEveryStreak: Math.round(number(raw.goldenEveryStreak, base.goldenEveryStreak, 0, 12)),
    goldenMultiplier: number(raw.goldenMultiplier, base.goldenMultiplier, 1.5, 10),
    musicStartStreak: legacy ? base.musicStartStreak : Math.round(number(raw.musicStartStreak, base.musicStartStreak, 0, 20)),
    musicVolume: number(raw.musicVolume, base.musicVolume, 0, 1),
    musicTracks: retiredMusicOnly ? base.musicTracks : usableMusicTracks,
    rescueFrequency: PUNCH_RESCUE_FREQUENCIES.includes(raw.rescueFrequency as PunchRescueFrequency)
      ? raw.rescueFrequency as PunchRescueFrequency
      : (raw.savesEnabled === false ? 'off' : base.rescueFrequency),
    // ‼️A RECIPE SAVED BEFORE THE TOGGLE EXISTED IS A RECIPE FROM THE ERA WHEN
    // Focus was hardwired off, so an absent flag means OFF — never `base`, which
    // would silently switch the meter back on for every scene in the library the
    // day the default changes.
    focusEnabled: raw.focusEnabled === true,
    // ‼️A RECIPE SAVED BEFORE THIS TOGGLE EXISTED MUST NOT SILENTLY INHERIT THE
    // PRESET'S DEFAULT. Every stored profile predates Boost, so an absent field
    // means "the game they were playing", which is off — `crowd-party`'s default
    // above is for a preset being created now, not for one being reloaded.
    boostEnabled: raw.boostEnabled === true,
    // Same reasoning: a recipe saved before the toggle existed is a recipe from
    // the era when karma did nothing, so absent means off.
    karmaEnabled: raw.karmaEnabled === true,
    fumbleRiskTellEnabled: typeof raw.fumbleRiskTellEnabled === 'boolean' ? raw.fumbleRiskTellEnabled : base.fumbleRiskTellEnabled,
    fumbleRiskTellStyle: PUNCH_FUMBLE_RISK_STYLES.includes(raw.fumbleRiskTellStyle as PunchFumbleRiskStyle)
      ? raw.fumbleRiskTellStyle as PunchFumbleRiskStyle : base.fumbleRiskTellStyle,
    // ‼️`legacy` IS THE WHOLE POINT HERE. A recipe saved before version 4 was
    // saved when the rescue could not end, so its silence about these fields is
    // not consent to the old behaviour — it predates the question. Those copies
    // take today's rules; a copy that has seen the panel keeps what was chosen.
    rescueLastChanceOnly: !legacy && typeof raw.rescueLastChanceOnly === 'boolean' ? raw.rescueLastChanceOnly : base.rescueLastChanceOnly,
    rescueMaxPerRound: legacy ? base.rescueMaxPerRound : Math.round(number(raw.rescueMaxPerRound, base.rescueMaxPerRound, 0, 5)),
    // ‼️VERSION 5 IS THE SAME LESSON AGAIN, AND IT COST A WHOLE SHIP.
    //
    // THE PUSH went out on 2026-09-09 as the new default. The world republished,
    // the bundle carried it, and the owner reported: "this rescue operation is
    // simply not part of the game, everything is the same like before the fix."
    // Read off the live world, `assets/editor-recipe.json` said
    // `rescueSkill: "band-taps"` — a value saved months earlier, when it was the
    // ONLY shape there was. A saved value that was never a choice was being
    // honoured as one, and a default nobody could reach is not a default.
    //
    // So `rescueSkill` joins the fields above: below version 5 it comes from
    // today's default; at or above it, it is what a person actually picked in
    // the Director. Same rule, same reason, same trap as `rescueLastChanceOnly`.
    rescueSkill: !legacy && PUNCH_RESCUE_SKILLS.includes(raw.rescueSkill as PunchRescueSkill)
      ? raw.rescueSkill as PunchRescueSkill : base.rescueSkill,
    rescueBandTapsRequired: Math.round(number(raw.rescueBandTapsRequired, base.rescueBandTapsRequired, 1, 10)),
    rescueBand01: number(raw.rescueBand01, base.rescueBand01, 0.05, 0.45),
    rescuePushFull: number(raw.rescuePushFull, base.rescuePushFull, 6, 60),
    // 52 was the shipped default before the black-tail was cut. The Director
    // steps this knob by 5, so 52 cannot be a choice a person made in the panel
    // — only the old constant, written back by Save. Honouring it would leave
    // HIGHGROUND on a solo hold that dies 8 points short of 900.
    rescuePushPerSec: number(
      raw.rescuePushPerSec === 52 ? PUNCH_PUSH_PER_SEC : raw.rescuePushPerSec,
      base.rescuePushPerSec,
      20,
      400,
    ),
    rescuePushBleedPerSec: number(raw.rescuePushBleedPerSec, base.rescuePushBleedPerSec, 0, 40),
    rescuePushAskMs: Math.round(number(raw.rescuePushAskMs, base.rescuePushAskMs, 1_500, 8_000)),
    rescueFailureTell: PUNCH_RESCUE_FAILURE_TELLS.includes(raw.rescueFailureTell as PunchRescueFailureTell)
      ? raw.rescueFailureTell as PunchRescueFailureTell : base.rescueFailureTell,
    rescueCooldownAttempts: Math.round(number(raw.rescueCooldownAttempts, base.rescueCooldownAttempts, 0, 20)),
    rescuePreparationMs: Math.round(number(raw.rescuePreparationMs, base.rescuePreparationMs, 500, 5_000)),
    rescueWindowMs: Math.round(number(raw.rescueWindowMs, base.rescueWindowMs, 2_500, 15_000)),
    rescueTapsRequired: Math.round(number(raw.rescueTapsRequired, base.rescueTapsRequired, 4, 40)),
    saveEarnPoints: Math.round(number(raw.saveEarnPoints, base.saveEarnPoints, 1, 400)),
    savesEnabled: typeof raw.savesEnabled === 'boolean' ? raw.savesEnabled : base.savesEnabled,
    crowdGain: number(raw.crowdGain, base.crowdGain, 0.25, 2),
    karmaRingBand01: number(raw.karmaRingBand01, base.karmaRingBand01, 0.015, 0.075),
    fastRevealMs: Math.round(number(raw.fastRevealMs, base.fastRevealMs, 600, 2600)),
    voices: legacy ? base.voices : Math.round(number(raw.voices, base.voices, 0, 3)),
    bubbles: legacy ? base.bubbles : Math.round(number(raw.bubbles, base.bubbles, 0, 2)),
    celebrationEmote: ['handsair', 'fistpump', 'clap', 'wave'].includes(raw.celebrationEmote!)
      ? raw.celebrationEmote! : base.celebrationEmote,
    reactionMovesEnabled: typeof raw.reactionMovesEnabled === 'boolean' ? raw.reactionMovesEnabled : base.reactionMovesEnabled,
    impactStyle: raw.impactStyle === 'auto' ? 'auto' : 'bass',
    heatFloor01: number(raw.heatFloor01, base.heatFloor01, 0, 0.95),
    profileVersion: PUNCH_PROFILE_VERSION,
    coachUserId: typeof raw.coachUserId === 'string' && /^0x[0-9a-f]{40}$/i.test(raw.coachUserId.trim())
      ? raw.coachUserId.trim().toLowerCase() : '',
    // Normalised here so every reader downstream compares like with like: the
    // panel accepts commas, spaces or newlines and any casing, the runtime only
    // ever sees a comma-joined list of lowercase 0x addresses.
    adminIds: punchAdminIds(raw.adminIds).join(','),
    adminToolsEnabled: typeof raw.adminToolsEnabled === 'boolean' ? raw.adminToolsEnabled : base.adminToolsEnabled,
    disabledAudio: Array.isArray(raw.disabledAudio) ? [...new Set(raw.disabledAudio.filter(v=>typeof v==='string' && /^sounds\/punch\/[a-z0-9/_-]+\.mp3$/.test(v)))].slice(0,300) : [],
    disabledCards: Array.isArray(raw.disabledCards)
      ? [...new Set(raw.disabledCards.filter(v => typeof v === 'string' && v.length < 80))].slice(0, 100) : [],
  };
}
export interface PunchEffectContext { score: number; streak: number; serial: number; seed: number }
export type PunchEffectDecision = { gain: number; reason: string };
export type PunchEffectPlan = Record<PunchEffectId, PunchEffectDecision>;
/** No local clocks or random bags: all spectators resolve the same attempt. */
export function planPunchEffects(profile: PunchGameProfile, beat: PunchEffectContext): PunchEffectPlan {
  return Object.fromEntries(PUNCH_EFFECT_IDS.map((id, index) => {
    const r = profile.effects[id];
    const streakQualified = r.minStreak > 0 && beat.streak >= r.minStreak;
    const cadenceIndex = streakQualified ? beat.streak - r.minStreak : beat.serial - 1;
    let reason = 'eligible';
    if (!r.enabled || r.intensity === 0) reason = 'disabled';
    else if (beat.score < r.minScore && !(r.minStreak > 0 && beat.streak >= r.minStreak)) reason = 'below threshold';
    // Stable per-attempt cadence also works for clients that arrive mid-round.
    else if (id !== 'celebration' && r.cooldown > 0 && cadenceIndex % (r.cooldown + 1) !== 0) reason = 'cooldown';
    else {
      let hash = (Math.imul(beat.seed | 0, 1664525) ^ Math.imul(index + 1, 1013904223)) >>> 0;
      hash ^= hash >>> 16;
      // A configured streak milestone is a promise, independent of earlier players' turns.
      // A zero chance and explicit switches still disable the effect.
      if (id !== 'celebration' && (!streakQualified || r.chance === 0) && (hash >>> 0) % 10000 >= r.chance * 100) reason = 'chance';
    }
    return [id, { gain: reason === 'eligible' ? r.intensity / 100 : 0, reason }];
  })) as PunchEffectPlan;
}
/**
 * Is the NEXT ball gold? Armed by the streak the puncher is carrying INTO the
 * punch: three 900s in a row (at the default) make the fourth ball gold. It
 * disarms itself — a 900+ moves the streak off the multiple, a miss resets it.
 */
export function punchGoldenArmed(previousStreak: number, profile: PunchGameProfile, momentumReady = false): boolean {
  const every = Math.max(0, Math.round(Number(profile.goldenEveryStreak) || 0));
  const streak = Math.max(0, Math.round(Number(previousStreak) || 0));
  if (!profile.goldenBallEnabled) return false;
  // MOMENTUM: prepared while waiting, it arms the gold after the FIRST 900+
  // of the turn instead of the Nth. Never a multiplier, never points — only
  // earlier entry into the bonus state that already exists.
  if (momentumReady && streak >= 1) return true;
  return every > 0 && streak > 0 && streak % every === 0;
}
export function punchRoundAward(score: number, previousStreak: number, hasSave: boolean, profile: PunchGameProfile, momentumReady = false) {
  const saved = score < 900 && previousStreak > 0 && hasSave && profile.savesEnabled;
  const streak = score >= 900 ? previousStreak + 1 : saved ? previousStreak : 0;
  const ladder = score >= 900 ? profile.multipliers[Math.min(streak, profile.multipliers.length - 1)]! : 1;
  // ‼️GOLD MULTIPLIES THE LADDER, NEVER THE 0..999. `punchScoreForQuality01`
  // clamps the punch at maxScore, so a multiplier on the score itself is
  // invisible (that is why karma's ×2 was never seen). The ladder is where the
  // headroom is, and "double the ladder" stays bigger than the ladder at every
  // streak, which a flat ×10 does not past streak 5.
  const golden = score >= 900 && punchGoldenArmed(previousStreak, profile, momentumReady);
  const multiplier = golden ? ladder * profile.goldenMultiplier : ladder;
  const points = Math.round(score * multiplier);
  return { streak, saved, multiplier, golden, points, bonus: points - score, extendsRound: score >= 900 || saved };
}
export function punchProfileSpeed(attempt: number, profile: PunchGameProfile) {
  return Math.min(profile.speedMax, 1 + profile.speedStep * Math.max(0, attempt - (profile.id === 'classic' ? 3 : 1)));
}
/** Physical reaction strength grows even when every punch has the same score. */
export function punchStreakEnergy(streak: number): number {
  return 1 + Math.min(7, Math.max(0, streak - 1)) * 0.12;
}

/**
 * ‼️IS BOOST PAYING? ONE FUNCTION, BECAUSE TWO SWITCHES DECIDE IT.
 *
 * Boost needs a meter to hold, and the meter is `focusEnabled`. Every surface
 * that asks `profile.boostEnabled` on its own will eventually ask it with Focus
 * off and promise a crowd that is not being simulated — the coordinator does not
 * even tick `updateFocus` in that state. Ask here instead.
 */
export function punchBoostLive(profile: PunchGameProfile): boolean {
  return profile.focusEnabled && profile.boostEnabled;
}

/**
 * ‼️IS KARMA PAYING? Same shape as `punchBoostLive` and for the same reason:
 * the ring is drawn on the Focus meter and measured by `updateFocus`, so there
 * is nothing to hold with Focus off. Separate from Boost on purpose — see
 * `karmaEnabled`.
 */
export function punchKarmaLive(profile: PunchGameProfile): boolean {
  return profile.focusEnabled && profile.karmaEnabled;
}

/**
 * The admin allowlist, parsed. Accepts what a person actually types — commas,
 * spaces, newlines, mixed case, a stray `0X` — and returns only well-formed
 * addresses, lowercased and de-duplicated. Anything unparseable is dropped
 * rather than kept as a near-miss string that would silently match nobody.
 */
export function punchAdminIds(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const seen = raw.split(/[^0-9a-zA-Z]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => /^0x[0-9a-f]{40}$/.test(part));
  return [...new Set(seen)].slice(0, 20);
}

/**
 * ‼️ONE PLACE ASKS "IS THIS PERSON AN ADMIN", and both halves of the answer
 * live in it: the master switch AND the list. A caller that checks only the
 * list would leave the chip on screen after the switch was turned off.
 */
export function punchIsAdmin(profile: PunchGameProfile, userId: string): boolean {
  if (!profile.adminToolsEnabled) return false;
  const id = (userId || '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(id)) return false;
  return punchAdminIds(profile.adminIds).includes(id);
}

/**
 * WHICH BOARD A SCORE IS FILED UNDER. THE MODE, AND NOTHING ELSE.
 *
 * ‼️THIS FUNCTION USED TO HASH EVERY SCORING RULE, AND THAT IS THE BUG THE OWNER
 * REPORTED FOUR TIMES. The venue a row is written to is
 * `boardStore.venue + ':' + punchProfileBoardKey`, so moving ONE slider in the
 * Game director filed the next punch under a venue nothing had ever been
 * written to. The panel then drew a correct, empty board — indistinguishable
 * from a wiped database. Owner, 2026-09-08 and again 2026-09-09: *"we said we
 * want to fix the rules and stop resetting the scores. The scores are again
 * reset."*
 *
 * Naming the edition (the 2026-09-08 attempt) explained the reset without
 * ending it, and an explanation is not what was asked for. So the split is
 * gone: THE ALL TIME BOARD OUTLIVES TUNING. A retune changes what the next
 * punch is worth, and the board keeps every punch thrown before it.
 *
 * What survives is the split that a room can actually feel: the three MODES
 * keep separate boards, because Classic and Crowd Party are different games and
 * a shared room already forces one mode on everybody (see the note at
 * `network.joinQueue` in punch-machine.ts).
 *
 * A DELIBERATE WIPE IS STILL POSSIBLE and needs no code: rename
 * `boardStore.venue` in Apps → Punch Machine. That is a decision somebody makes
 * on purpose, which is the only way a board should ever empty.
 *
 * Legacy rows written under the old hashed venues are NOT stranded — the read
 * is a prefix match over `<venue>:<mode>*`, so they merge back in. See
 * `punchBoardReadUrl` in shared/punch-board-store.ts.
 */
export function punchProfileBoardKey(profile: PunchGameProfile): string {
  return profile.id;
}

/** Stable frequency roll: every client/coordinator makes the same decision for a serial. */
export function punchRescueOpportunity(profile: PunchGameProfile, serial: number): boolean {
  const chance = ({ off: 0, low: 0.25, normal: 0.5, high: 0.8, maximum: 1 } as const)[profile.rescueFrequency];
  if (chance <= 0) return false;
  if (chance >= 1) return true;
  let hash = Math.imul((serial | 0) ^ 0x52e5c0e, 0x45d9f3b) >>> 0;
  hash ^= hash >>> 16;
  return (hash % 10_000) < chance * 10_000;
}
