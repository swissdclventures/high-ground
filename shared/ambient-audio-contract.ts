/**
 * AMBIENT BACKGROUND AUDIO — the bed you hear when no zone owns the sound.
 *
 * A scene has two kinds of audio and they must never fight:
 *
 *   ZONE AUDIO   an app owns it — the breakdance floor's playlist, a video
 *                screen, a placed spatial emitter, a gallery bed. It is
 *                authored, it belongs to a place, and inside that place it
 *                WINS: the ambient bed steps aside so the venue reads clean.
 *
 *   AMBIENT      this file. One venue-wide bed the owner curates, heard while
 *                you stroll anywhere that no zone has claimed. Without it a
 *                district between its venues is dead silent, which reads as a
 *                broken scene rather than a quiet one.
 *
 * The bed is deliberately NOT the Audio & Music app's venue playlist. That
 * playlist is what the breakdance show consumes when both apps are on — it is
 * zone material. Mixing the two would mean the dance floor's set also plays on
 * the far side of the plot, which is exactly the thing this contract prevents.
 *
 * Timeline: like the venue playlist, ambient advances from WALL-CLOCK time, so
 * every client independently computes the same track at the same moment with no
 * coordinator traffic. A guest who switches track with the widget goes local —
 * their choice never moves anyone else's music.
 */

/** One ambient track, embedded in the deploy at publish time. */
export interface AmbientTrack {
  /** Scene-relative path, e.g. assets/ambient/track_0.<token>.mp3 (set at publish). */
  file: string;
  title: string;
  /** Captured at upload — the SDK has no "track ended" event, so the timeline
   *  is derived from durations. */
  durationS: number;
}

/**
 * Free try-me beds shipped with the Builder (not a Swissverse music host).
 *
 * All four are synthesized by `scripts/generate-ambient-beds.ts` — edit a bed
 * there and re-run it, never hand-edit a .wav. Two rules the recipes exist to
 * hold, both learned the hard way (2026-08-26):
 *
 *   A BED MUST LIVE ABOVE 100 Hz. The first cut of the three tone beds put all
 *   of its energy between 30 and 80 Hz, which no laptop, phone or earbud can
 *   reproduce — so the default bed read as a broken track rather than a quiet
 *   one. Sub-bass is the floor under a bed, never the bed.
 *
 *   A BED IS NOT AN EVENT. Night Park used to be a whole wet-night insect
 *   chorus; dense enough to be the thing you listened to, so it fought whatever
 *   the scene placed on top. Ambient is what you stop noticing.
 */
export interface AmbientSample {
  id: string;
  title: string;
  /** Path under the composer static host (`assets/` publicDir). */
  publicPath: string;
  durationS: number;
  blurb: string;
}

export const AMBIENT_SAMPLES: readonly AmbientSample[] = [
  {
    id: "glass-hum",
    title: "Glass Hum",
    publicPath: "/sample-ambient/glass-hum.wav",
    durationS: 10,
    blurb: "Warm low drone — the default try-me bed.",
  },
  {
    id: "slow-drift",
    title: "Slow Drift",
    publicPath: "/sample-ambient/slow-drift.wav",
    durationS: 10,
    blurb: "Darker, slower undercurrent.",
  },
  {
    id: "room-tone",
    title: "Room Tone",
    publicPath: "/sample-ambient/room-tone.wav",
    durationS: 10,
    blurb: "Quiet air between venues.",
  },
  {
    // One cricket across a park, not a chorus: four short pulses, then two and
    // a half seconds of night air. The gap is the feature.
    id: "night-park",
    title: "Night Park",
    publicPath: "/sample-ambient/night-park.wav",
    durationS: 30,
    blurb: "One distant cricket over quiet night air.",
  },
  {
    // The owner's own hum track, not a synthesized recipe — a real song from the
    // Desktop drone library ("Drone Ambient Music I like", 2026-08-26). The owner
    // asked for this over any generated bed.
    id: "quiet-hum-field",
    title: "Quiet Hum Field",
    publicPath: "/sample-ambient/quiet-hum-field.mp3",
    durationS: 183.6,
    blurb: "The owner's hum song — warm drone field.",
  },
] as const;

export const DEFAULT_AMBIENT_SAMPLE_ID = "quiet-hum-field";

const SAMPLE_BY_ID = new Map(AMBIENT_SAMPLES.map((sample) => [sample.id, sample]));

export function ambientSampleById(id: string): AmbientSample | null {
  return SAMPLE_BY_ID.get(id) ?? null;
}

/**
 * Ids from the owner's Music shelf, in the order they were ticked.
 *
 * No membership check here: the shelf lives in the owner's database and this
 * contract is also read headless, where the shelf is unreachable. Publish drops
 * ids the mirror no longer holds — the same rule the venue playlist uses.
 */
export function normalizeAmbientLibraryTrackIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function normalizeAmbientSampleIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!SAMPLE_BY_ID.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  // Two beds at once used to be an ACCIDENT worth guarding against: the panel
  // showed free beds and shelf songs as two separate tick lists, so ticking a
  // second one was a slip, and the runtime alternated drone/cricket. The panel
  // is now a single explicit picker with a removable chip per choice, so more
  // than one is a deliberate playlist (`mode` says shuffle or in order) and the
  // cap would only be a control the owner cannot see or undo.
  return out;
}

export interface AmbientAudioConfig {
  /** Off by default: silence is a legitimate choice and no scene gets a bed it
   *  did not ask for. */
  enabled: boolean;
  tracks: AmbientTrack[];
  /**
   * Free sample beds from AMBIENT_SAMPLES. Resolved at publish — not a
   * Swissverse-hosted stream.
   */
  sampleIds: string[];
  /**
   * Songs picked from the owner's Music shelf (Library ▸ Music), by id.
   *
   * THE BED NEVER UPLOADS (owner, 2026-08-26). It used to keep a private
   * IndexedDB library with its own Upload button, so an MP3 dropped on the
   * Background sound panel existed nowhere the owner could find it — a second
   * file system beside the one the whole product points at. Now the panel only
   * ticks what the shelf already holds, exactly as the Audio app's playlist
   * does. See shared/music-library-contract.ts for the law.
   *
   * A sample and a library pick are two answers to one question, so choosing
   * either clears the other.
   */
  libraryTrackIds: string[];
  mode: "shuffle" | "sequence";
  /** Bed level, 0..1. Low by design — this plays under everything else. */
  volume: number;
  /** Guests arrive hearing it (the answer to a silent world). The widget's
   *  pause still wins for that visit. */
  autoplay: boolean;
  /** Show the next-track button in the guest widget. Off = play/pause only. */
  guestSwitch: boolean;
  /**
   * Level the bed drops to while a zone owns the channel, 0..1 of `volume`.
   * 0 = full stop (the default, and what "the zone dominates" means). A small
   * value keeps a whisper of the bed under a quiet zone.
   */
  duckLevel: number;
  /** Seconds to fade in/out when the channel changes hands. Keeps a zone
   *  boundary from sounding like a cut. */
  fadeS: number;
}

export function defaultAmbientAudioConfig(): AmbientAudioConfig {
  return {
    enabled: false,
    tracks: [],
    sampleIds: [],
    libraryTrackIds: [],
    mode: "shuffle",
    volume: 0.35,
    autoplay: true,
    guestSwitch: true,
    duckLevel: 0,
    fadeS: 1.2,
  };
}

function clamp01(value: unknown, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(1, n));
}

export function normalizeAmbientAudioConfig(
  partial?: Partial<AmbientAudioConfig> | null
): AmbientAudioConfig {
  const base = defaultAmbientAudioConfig();
  if (!partial) return base;
  const tracks = Array.isArray(partial.tracks)
    ? partial.tracks
        .filter((track): track is AmbientTrack => !!track && typeof track.file === "string")
        .map((track) => ({
          file: track.file,
          title: typeof track.title === "string" && track.title ? track.title : track.file,
          durationS:
            typeof track.durationS === "number" && Number.isFinite(track.durationS)
              ? Math.max(1, track.durationS)
              : 1,
        }))
    : base.tracks;
  // A free bed and a shelf song are entries in ONE list now, so neither clears
  // the other. Both resolve to plain tracks at publish and the runtime consumes
  // a single `tracks` array either way — there was never a technical reason the
  // two sources could not sit in the same bed, only a two-list UI that made
  // holding both look like a mistake.
  const sampleIds = normalizeAmbientSampleIds(partial.sampleIds);
  const libraryTrackIds = normalizeAmbientLibraryTrackIds(partial.libraryTrackIds);
  return {
    // Picking a free sample or a song off the shelf is the intent.
    enabled:
      partial.enabled ?? (tracks.length > 0 || sampleIds.length > 0 || libraryTrackIds.length > 0),
    tracks,
    sampleIds,
    libraryTrackIds,
    mode: partial.mode === "sequence" ? "sequence" : base.mode,
    volume: clamp01(partial.volume, base.volume),
    autoplay: partial.autoplay ?? base.autoplay,
    guestSwitch: partial.guestSwitch ?? base.guestSwitch,
    duckLevel: clamp01(partial.duckLevel, base.duckLevel),
    fadeS: Math.max(0, Math.min(8, typeof partial.fadeS === "number" ? partial.fadeS : base.fadeS)),
  };
}

/**
 * Deterministic play ORDER — sequence, or a seed-shuffled permutation that is
 * identical on every client (no Math.random: two guests must not diverge).
 */
export function ambientOrder(count: number, mode: "shuffle" | "sequence"): number[] {
  const order = Array.from({ length: Math.max(0, count) }, (_, i) => i);
  if (mode === "sequence" || order.length <= 1) return order;
  let s = 2654435761 >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return order;
}

/** Cumulative ms boundaries for an order — index k starts at cum[k]. */
export function ambientBoundaries(tracks: AmbientTrack[], order: number[]): number[] {
  const cum = [0];
  for (const index of order) {
    cum.push(cum[cum.length - 1] + Math.max(1, tracks[index]?.durationS ?? 1) * 1000);
  }
  return cum;
}

/** Where the shared wall-clock timeline stands right now. */
export function ambientPositionAt(
  nowMs: number,
  order: number[],
  cum: number[]
): { trackIndex: number; offsetS: number } {
  const total = cum[cum.length - 1] ?? 0;
  if (total <= 0 || order.length === 0) return { trackIndex: order[0] ?? 0, offsetS: 0 };
  const within = ((nowMs % total) + total) % total;
  let i = 0;
  while (i < order.length - 1 && cum[i + 1] <= within) i += 1;
  return { trackIndex: order[i], offsetS: (within - cum[i]) / 1000 };
}

/* ── Channel arbitration (pure half) ────────────────────────────────────────
 *
 * Which audio source owns the sound at a point. Lives here, not in the scene,
 * so the rule that decides whether the bed plays is testable without an SDK —
 * scene/src/audio/channel.ts is only the ECS plumbing around it.
 */

/** A sphere of ownership around a placed source. */
export interface AudioZoneShape {
  x: number;
  y: number;
  z: number;
  /** Metres. */
  radius: number;
}

/** One resolved claim: `zone` null means venue-wide. */
export interface ResolvedAudioClaim<T> {
  value: T;
  zone: AudioZoneShape | null;
}

export function pointInAudioZone(
  zone: AudioZoneShape,
  x: number,
  y: number,
  z: number
): boolean {
  const dx = x - zone.x;
  const dy = y - zone.y;
  const dz = z - zone.z;
  // Vertical distance counts: a floor-30 lounge must not be silenced by the
  // dance floor sitting directly below it on the ground.
  return dx * dx + dy * dy + dz * dz <= zone.radius * zone.radius;
}

/**
 * The winner at a point, or null when nothing claims it.
 *
 * VENUE-WIDE BEATS SPATIAL: a source that declares itself omnipresent has made
 * the strongest possible statement about the scene, and honouring a small local
 * bubble over it would let one decorative emitter override the club's set.
 */
export function pickAudioClaim<T>(
  claims: ResolvedAudioClaim<T>[],
  x: number,
  y: number,
  z: number
): T | null {
  let spatial: T | null = null;
  for (const claim of claims) {
    if (!claim.zone) return claim.value;
    if (spatial === null && pointInAudioZone(claim.zone, x, y, z)) spatial = claim.value;
  }
  return spatial;
}
