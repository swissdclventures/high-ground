/**
 * Breakdance playlist player — plays the owner's uploaded MP3s (embedded at
 * publish) as ONE continuous, SHARED timeline.
 *
 * How the "first song" is picked / why it doesn't restart per person:
 * the playlist is a fixed loop (a seeded order for shuffle) whose total length is
 * the sum of the track durations. The current track is derived from WALL-CLOCK
 * time (Date.now() % totalLength), so every client — whenever they arrive —
 * computes the SAME track at the SAME moment. Walk in mid-way and you hear
 * whatever is currently playing, not track 1 from the top. No server needed.
 * A late joiner SEEKS into the current track (AudioSource.currentTime), so the
 * party audibly continues mid-song — and a new arrival never restarts anyone
 * else's audio (playback is per-client; only track choice is shared).
 *
 * When the LAST player leaves, the DCL scene unloads and the audio stops; when
 * someone returns, the scene reloads and the wall-clock timeline resumes exactly
 * where it "would be" — so it feels like the music never stopped.
 */
import { engine, AudioSource, Transform, type Entity } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import type { DanceMusicConfig, DanceVenueConfig } from '@shared/dance-venue-contract'
import { danceFloorZone, zoneCenterScene } from './zones'
import { isClubAtmosphereActive, isParticipating } from './runtime'
import { emitDance, onDance } from './bus'
import { claimAudioChannel } from '../audio/channel'
import { isMusicHeldByLocation } from '../audio/location-hold'
import { arrivalMusicGain } from '../audio/arrival-hold'
import { hostAudioArrivalGain } from '../audio/arrival-gain'
import { markLandingMusicReady } from '../plugins/landing'

// Data-cost guard: streaming audio consumes the venue's bandwidth quota. When the
// scene is EMPTY, DCL unloads it and streaming stops on its own (zero cost). The
// remaining case is one person lingering, not dancing — after this long with no
// participation and no control press, we stop THIS client's stream so it isn't
// pulling data for nobody. Joining the dance or touching any music control
// resumes it instantly.
const IDLE_STOP_MS = 15 * 60 * 1000

/** How far a floor-spread set silences the ambient bed. See the claim below. */
const FLOOR_CLAIM_RADIUS_M = 24
let lastActiveAt = 0

let music: DanceMusicConfig | null = null
let entity: Entity | null = null
let musicOn = false
let hostOverride = false // once the host presses Play/Stop, stop auto-following the show
// "Play on arrival" venues keep music on even in social mode — the club-atmosphere
// auto-follow alone silenced them: 'social' is not an atmosphere mode, so the
// system reset musicOn to false on the first frame and arrival music never played.
let arrivalAutoplay = false
let localMuted = true // guests arrive muted; unmute locally for sound
let musicVolume = 1.0
let duckUntil = 0
let duckFactor = 1
let skipOffsetMs = 0 // shared: a host "Skip" shifts everyone's timeline together
let playingTrackIndex = -1

// The fixed play ORDER + cumulative ms, built once — this IS the shared timeline.
let order: number[] = []
let cum: number[] = [0]
let dTotal = 0

function liveVolume(): number {
  if (isMusicHeldByLocation()) return 0
  const duck = Date.now() < duckUntil ? duckFactor : 1
  return localMuted ? 0 : musicVolume * duck * arrivalMusicGain() * hostAudioArrivalGain()
}

/** Briefly clear sonic space for a crowd hit, then recover automatically. */
export function duckMusicFor(durationMs: number, factor = 0.5): void {
  if (Date.now() >= duckUntil) duckFactor = 1
  duckUntil = Math.max(duckUntil, Date.now() + Math.max(0, durationMs))
  duckFactor = Math.min(duckFactor, Math.min(1, Math.max(0, factor)))
}

/** Deterministic order: sequence, or a seed-shuffled permutation (same on all clients). */
function buildOrder(n: number, mode: 'shuffle' | 'sequence'): number[] {
  const o = Array.from({ length: n }, (_, i) => i)
  if (mode === 'sequence' || n <= 1) return o
  let s = 2654435761 >>> 0
  const rand = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    return s / 4294967296
  }
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = o[i]
    o[i] = o[j]
    o[j] = tmp
  }
  return o
}

/** Which track index is "now" on the shared timeline, the current boundary, and
 *  how far INTO the current track the timeline is (seconds). */
function positionNow(): { trackIndex: number; boundaryMs: number; offsetS: number } {
  if (dTotal <= 0) return { trackIndex: order[0] ?? 0, boundaryMs: 0, offsetS: 0 }
  const within = (((Date.now() + skipOffsetMs) % dTotal) + dTotal) % dTotal
  let i = 0
  while (i < order.length - 1 && cum[i + 1] <= within) i++
  return { trackIndex: order[i], boundaryMs: cum[i + 1], offsetS: (within - cum[i]) / 1000 }
}

function playTrack(trackIndex: number, offsetS = 0): void {
  if (!music || !entity) return
  const track = music.tracks[trackIndex]
  const src = AudioSource.getMutableOrNull(entity)
  if (!src || !track) return
  src.audioClipUrl = track.file
  // Seek to the shared timeline position, so a late joiner hears the song
  // mid-way like everyone else — not from the top. (Setting currentTime seeks;
  // later volume-only mutations don't re-trigger it, per the AudioSource proto.)
  // Sub-second offsets round to 0 so boundary flips start tracks cleanly.
  src.currentTime = offsetS >= 1 ? Math.floor(offsetS) : 0
  src.playing = true
  src.volume = liveVolume()
  playingTrackIndex = trackIndex
  markLandingMusicReady()
}

/**
 * Read with getOrNull, never getMutable. `getMutableOrNull` marks the component
 * dirty on every call, so the old per-frame read re-sent AudioSource to the
 * renderer 30× a second — and the explorer restarts the clip when the component
 * changes. That is the whole "the song keeps starting over" bug: nothing was
 * seeking, the component was simply being republished forever. Writes now only
 * happen when a value actually changes.
 */
function musicSystem(): void {
  if (!music || !entity || !music.tracks.length) return
  if (!hostOverride) musicOn = isClubAtmosphereActive() || arrivalAutoplay
  const src = AudioSource.getOrNull(entity)
  if (!src) return
  // Dancing counts as activity — keep the stream alive while the local player is
  // in the party.
  if (isParticipating()) lastActiveAt = Date.now()
  const idle = Date.now() - lastActiveAt > IDLE_STOP_MS
  if (!musicOn || idle) {
    if (src.playing) AudioSource.getMutable(entity).playing = false
    return
  }
  const pos = positionNow()
  if (pos.trackIndex !== playingTrackIndex) {
    playTrack(pos.trackIndex, pos.offsetS)
    return
  }
  // Resuming after a stop must not re-seek: the shared timeline already moved on,
  // and re-writing currentTime here is what would audibly restart the track.
  if (!src.playing) AudioSource.getMutable(entity).playing = true
  const volume = liveVolume()
  if (Math.abs((src.volume ?? 0) - volume) > 0.005) AudioSource.getMutable(entity).volume = volume
}

export function initDanceMusic(config: DanceVenueConfig, autoplayUnmuted = false): void {
  music = config.music
  if (!music || music.tracks.length === 0) return
  order = buildOrder(music.tracks.length, music.mode)
  cum = [0]
  for (const idx of order) cum.push(cum[cum.length - 1] + Math.max(1, music.tracks[idx].durationS) * 1000)
  dTotal = cum[cum.length - 1]

  if (autoplayUnmuted) {
    localMuted = false
    musicOn = true
    arrivalAutoplay = true
  }
  lastActiveAt = Date.now() // arriving is activity — full idle window starts now
  entity = engine.addEntity()
  // 'venue' = omnipresent: parent to the CAMERA (the actual listener) → constant
  // volume everywhere. 'floor' = positional at the dance-floor centre.
  if (config.musicSpread === 'floor') {
    const zone = danceFloorZone()
    const c = zone ? zoneCenterScene(zone) : { x: 8, y: 0, z: 8 }
    Transform.create(entity, { position: Vector3.create(c.x, c.y + 1.2, c.z) })
    // A floor-spread set owns the sound AROUND THE FLOOR only. The radius is
    // generous (well past the crowd ring) because DCL's own falloff means you
    // hear the set before you reach it — the background bed has to be gone by
    // then, not fading out on top of it.
    claimAudioChannel({
      id: 'venue-playlist',
      label: 'venue music',
      zone: { x: c.x, y: c.y + 1.2, z: c.z, radius: FLOOR_CLAIM_RADIUS_M },
      active: () => musicOn && !localMuted,
    })
  } else {
    Transform.create(entity, { parent: engine.CameraEntity })
    // 'venue' spread is omnipresent by definition, so it claims everywhere.
    claimAudioChannel({
      id: 'venue-playlist',
      label: 'venue music',
      zone: null,
      active: () => musicOn && !localMuted,
    })
  }
  AudioSource.create(entity, { audioClipUrl: '', playing: false, loop: false, volume: 0 })

  onDance('dance.music', (m) => {
    hostOverride = true
    musicOn = m.playing
    // `step` carries the shared skip offset (ms) so a Skip moves everyone together.
    skipOffsetMs = m.step
    playingTrackIndex = -1 // force a re-evaluate against the new offset
  })

  engine.addSystem(musicSystem)
}

function broadcast(playing: boolean): void {
  emitDance({ type: 'dance.music', playing, seed: 0, step: skipOffsetMs, startedAt: Date.now() })
}

export function hasMusic(): boolean {
  return !!music && music.tracks.length > 0
}
export function isMusicPlaying(): boolean {
  return musicOn
}
export function currentTrackTitle(): string {
  if (!music || playingTrackIndex < 0) return ''
  return music.tracks[playingTrackIndex]?.title ?? ''
}
export function hostMusicPlay(): void {
  hostOverride = true
  musicOn = true
  lastActiveAt = Date.now()
  broadcast(true)
}
export function hostMusicStop(): void {
  hostOverride = true
  musicOn = false
  broadcast(false)
}
export function hostMusicSkip(): void {
  lastActiveAt = Date.now()
  // Jump the whole room to the next track: add the time left in the current one.
  if (dTotal > 0) {
    const within = (((Date.now() + skipOffsetMs) % dTotal) + dTotal) % dTotal
    const pos = positionNow()
    skipOffsetMs += Math.max(1, pos.boundaryMs - within) + 1
  }
  playingTrackIndex = -1
  broadcast(true)
}
/** Guest PLAY/PAUSE on the launcher. Pause mutes this client; play unmutes and keeps the shared timeline running. */
export function setLocalMusicPaused(paused: boolean): void {
  lastActiveAt = Date.now()
  if (paused) {
    localMuted = true
    return
  }
  localMuted = false
  musicOn = true
  arrivalAutoplay = true
}
export function toggleLocalMusicMute(): boolean {
  localMuted = !localMuted
  lastActiveAt = Date.now()
  return localMuted
}
export function isLocalMusicMuted(): boolean {
  return localMuted
}
export function nudgeMusicVolume(delta: number): void {
  musicVolume = Math.max(0, Math.min(1, musicVolume + delta))
  lastActiveAt = Date.now()
  if (delta > 0) localMuted = false
  const src = entity ? AudioSource.getMutableOrNull(entity) : null
  if (src) src.volume = liveVolume()
}
export function musicVolumePct(): number {
  return Math.round((localMuted ? 0 : musicVolume) * 100)
}
