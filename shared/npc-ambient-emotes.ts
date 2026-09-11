/**
 * What a standing NPC does with itself.
 *
 * The old answer was three gestures — shrug, wave, dontsee — chosen by
 * `(botIndex + window) % 3` on a seven-second clock, with three of every five
 * windows firing. Two consequences, both of which the owner reported: a crowd
 * repeats itself within seconds, and neighbours march in lockstep because a
 * deterministic index walk means bot 4 is always one step behind bot 3.
 *
 * This replaces both. Idle is the default and gestures are the exception; the
 * catalogue is wide enough that a watcher is unlikely to see a repeat; and the
 * choice is hashed per bot so no two people in a group ever sync up.
 *
 * Everything here is a DCL BASE emote, triggered by name. Base emotes cost no
 * emote slot and download nothing — which matters, because an NPC only carries
 * ten slots and overfilling that list is what produced the mesh-explosion bug
 * (see shared/npc-emote-slots.ts). Widening the crowd's vocabulary this way is
 * free; widening it with bundled GLB clips would not be.
 */

/** Low-key things a bystander does while watching something else. */
export const AMBIENT_COMMON: readonly string[] = [
  "shrug",
  "dontsee",
  "wave",
  "clap",
  "raiseHand",
  "tik",
];

/**
 * Characterful, occasionally silly. These are the ones that should make a
 * player look twice precisely BECAUSE they are rare — a crowd that dabs every
 * ten seconds is wallpaper, a crowd that dabs once an hour is a moment.
 */
export const AMBIENT_RARE: readonly string[] = [
  "fistpump",
  "robot",
  "hammer",
  "tektonik",
  "dab",
  "handsair",
];

/**
 * ‼️EMOTES THAT PAINT PARTICLES ONTO A BODY ARE BANNED FROM EVERY CROWD SHELF.
 *
 * `headexplode` was banned first, as the only base emote that detonates the
 * avatar it plays on: a bystander standing near the NPC that fires it reads the
 * blast as happening to their OWN body — reported from the punch island as
 * "it's always exploding on my avatar" when the player had not touched the
 * machine. Twice.
 *
 * The ban did not go far enough. `money` rains banknotes DOWN AROUND THE FEET,
 * `kiss` throws pink hearts out of the chest, and `disco` hangs a mirror ball
 * overhead — and a punch crowd stands shoulder to shoulder, which means all
 * three land in the same place from your camera: on you. It was reported a
 * third time as "the fireball always lands at my feet", from a player who was
 * standing in a ring of NPCs and had thrown nothing.
 *
 * The rule is not about which effect is tasteful. It is that a spectator must
 * always be able to trust that what is happening ON their avatar was caused BY
 * their avatar. Effects belong to props and to the machine, where they have an
 * owner you can see. Motion — arms, hips, hands — belongs to people.
 */
export const AVATAR_VFX_EMOTES: readonly string[] = [
  "headexplode",
  "money",
  "kiss",
  "disco",
];

/** True if this base emote sprays something into the air around the avatar. */
export function isAvatarVfxEmote(emote: string): boolean {
  return AVATAR_VFX_EMOTES.includes((emote || "").trim());
}

/** How long one decision window lasts. Longer window, calmer crowd. */
export const AMBIENT_WINDOW_MS = 9_000;
/** Chance a given window produces a gesture at all. The rest is standing still. */
export const AMBIENT_EMOTE_CHANCE = 0.18;
/** Of the gestures that do happen, how many come from the rare shelf. */
export const AMBIENT_RARE_SHARE = 0.22;
/** How many of a bot's own recent gestures it refuses to repeat. */
export const AMBIENT_RECENT_MEMORY = 4;

/**
 * Deterministic hash to a unit interval. Deterministic matters: every client
 * runs this independently for the same bot, and a crowd that gestures out of
 * sync between viewers would look like lag rather than life.
 */
function hash01(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The window index a timestamp falls in. */
export function ambientWindow(nowMs: number): number {
  return Math.floor(nowMs / AMBIENT_WINDOW_MS);
}

/**
 * What this bot should do in this window: a base-emote name, or null to simply
 * stand there — which is most of the time, by design.
 *
 * `recent` is that bot's own last few gestures; anything in it is skipped so a
 * player watching one NPC does not catch it repeating.
 */
export function ambientEmoteFor(
  botIndex: number,
  windowIndex: number,
  recent: readonly string[] = [],
): string | null {
  if (hash01(botIndex + 1, windowIndex) >= AMBIENT_EMOTE_CHANCE) return null;
  const rare = hash01(botIndex + 101, windowIndex + 211) < AMBIENT_RARE_SHARE;
  const shelf = rare ? AMBIENT_RARE : AMBIENT_COMMON;
  const start = Math.floor(hash01(botIndex * 31 + 7, windowIndex * 17 + 3) * shelf.length);
  // Walk forward past anything this bot has done lately. If the whole shelf is
  // recent (only possible with a tiny shelf) the first pick stands.
  for (let step = 0; step < shelf.length; step += 1) {
    const candidate = shelf[(start + step) % shelf.length]!;
    if (!recent.includes(candidate)) return candidate;
  }
  return shelf[start % shelf.length] ?? null;
}

/** Push onto a bot's recent list, keeping it at the memory length. */
export function rememberAmbientEmote(recent: string[], emote: string): void {
  recent.push(emote);
  while (recent.length > AMBIENT_RECENT_MEMORY) recent.shift();
}
