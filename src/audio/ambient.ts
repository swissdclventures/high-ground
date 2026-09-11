/**
 * THE AMBIENT BED — what you hear when nothing else has claimed the sound.
 *
 * Walking a district between its venues used to be silent, and silence reads as
 * a broken scene rather than a quiet one. This plays the owner's curated
 * background tracks everywhere EXCEPT inside a zone that owns its own audio —
 * see audio/channel.ts for the arbitration. Inside such a zone the bed ducks
 * (to `duckLevel`, 0 by default) so the authored experience is heard clean, and
 * it fades back in on the way out. A cut would announce the boundary; a fade
 * makes it feel like the world simply got quieter for a moment.
 *
 * TRACK CHOICE is shared without any traffic: the play order is a deterministic
 * permutation and the current track is derived from wall-clock time, so two
 * guests standing together hear the same thing. A guest who presses NEXT goes
 * LOCAL — their choice is theirs, and it never moves anyone else's music.
 *
 * VOLUME is written only when it actually changes. Re-writing AudioSource every
 * frame makes the explorer restart the clip (the "the song keeps starting over"
 * bug that cost a day in dance/music.ts) — so reads use getOrNull and writes are
 * guarded by a threshold.
 */
import { engine, AudioSource, Transform, type Entity } from '@dcl/sdk/ecs'
import type { AmbientAudioConfig } from '@shared/ambient-audio-contract'
import {
  ambientBoundaries,
  ambientOrder,
  ambientPositionAt,
} from '@shared/ambient-audio-contract'
import { activeAudioClaim } from './channel'
import { isMusicHeldByLocation, musicLocationHold } from './location-hold'
import { arrivalMusicGain, isArrivalMusicHeld } from './arrival-hold'
import { hostAudioArrivalGain } from './arrival-gain'
import { markLandingMusicReady } from '../plugins/landing'

let config: AmbientAudioConfig | null = null
let entity: Entity | null = null
let order: number[] = []
let cum: number[] = [0]

/** The guest's own play/pause. Starts from the owner's `autoplay`. */
let guestPlaying = true
/** Set by the widget's NEXT button — pins this client to one track. */
let manualTrackIndex = -1
/** What is loaded in the AudioSource right now (-1 = nothing). */
let loadedTrackIndex = -1
/** Smoothed level, so a zone boundary fades instead of cutting. */
let level = 0
/** The zone currently holding the channel — surfaced in the widget. */
let duckedBy: string | null = null

function targetLevel(): number {
  if (!config || !config.enabled || config.tracks.length === 0) return 0
  if (!guestPlaying) return 0
  if (isMusicHeldByLocation()) {
    duckedBy = musicLocationHold()?.label ?? 'this room'
    return 0
  }
  const claim = activeAudioClaim()
  duckedBy = claim ? claim.label : null
  return (claim ? config.volume * config.duckLevel : config.volume) * arrivalMusicGain() * hostAudioArrivalGain()
}

function loadTrack(trackIndex: number, offsetS: number): void {
  if (!config || !entity) return
  const track = config.tracks[trackIndex]
  if (!track) return
  const src = AudioSource.getMutable(entity)
  src.audioClipUrl = track.file
  // Seek into the shared timeline so a late arrival joins the bed mid-track like
  // everyone else. Sub-second offsets round to 0 so boundary flips start clean.
  src.currentTime = offsetS >= 1 ? Math.floor(offsetS) : 0
  // A hand-picked track loops: the guest chose it, so it stays until they
  // choose again. The shared timeline advances on its own.
  src.loop = manualTrackIndex >= 0
  src.playing = true
  src.volume = level
  loadedTrackIndex = trackIndex
}

function ambientSystem(dt: number): void {
  if (!config || !entity || config.tracks.length === 0) return
  const src = AudioSource.getOrNull(entity)
  if (!src) return

  // A held arrival should PRELOAD, not pause. Keeping the chosen clip playing
  // at volume 0 lets Explorer fetch/decode it behind the cover. The old zero-
  // gain branch stopped the source immediately, so Landing claimed to preload
  // music while actively preventing the request.
  if (isArrivalMusicHeld() && guestPlaying) {
    const wanted =
      manualTrackIndex >= 0
        ? manualTrackIndex
        : ambientPositionAt(Date.now(), order, cum).trackIndex
    if (wanted !== loadedTrackIndex) {
      const offsetS =
        manualTrackIndex >= 0 ? 0 : ambientPositionAt(Date.now(), order, cum).offsetS
      loadTrack(wanted, offsetS)
      markLandingMusicReady()
      return
    }
    if (!src.playing) AudioSource.getMutable(entity).playing = true
    if (Math.abs((src.volume ?? 0)) > 0.005) AudioSource.getMutable(entity).volume = 0
    markLandingMusicReady()
    return
  }

  const held = isMusicHeldByLocation()
  const target = targetLevel()
  if (held) {
    // Conversation rooms cut, they do not fade — a two-second duck on the way
    // into the Speakeasy would keep talking over the first words.
    level = 0
  } else if (level !== target) {
    const fade = config.fadeS > 0 ? Math.max(0, dt) / config.fadeS : 1
    const step = fade >= 1 ? Math.abs(target - level) : fade
    level = level < target ? Math.min(target, level + step) : Math.max(target, level - step)
    if (Math.abs(level - target) < 0.005) level = target
  }

  // Fully faded out: stop the clip so a paused or ducked bed pulls no data.
  if (level <= 0.0001) {
    if (src.playing) {
      AudioSource.getMutable(entity).playing = false
      // Forget what was loaded so coming back re-seeks to where the shared
      // timeline has moved on to, rather than resuming a stale position.
      loadedTrackIndex = -1
    }
    return
  }

  const wanted =
    manualTrackIndex >= 0
      ? manualTrackIndex
      : ambientPositionAt(Date.now(), order, cum).trackIndex
  if (wanted !== loadedTrackIndex) {
    const offsetS =
      manualTrackIndex >= 0 ? 0 : ambientPositionAt(Date.now(), order, cum).offsetS
    loadTrack(wanted, offsetS)
    return
  }

  // Resuming must NOT re-seek — the timeline already moved on and rewriting
  // currentTime here is what would audibly restart the track.
  if (!src.playing) AudioSource.getMutable(entity).playing = true
  if (Math.abs((src.volume ?? 0) - level) > 0.005) AudioSource.getMutable(entity).volume = level
}

export function initAmbientAudio(next: AmbientAudioConfig): void {
  config = next
  if (!config.enabled || config.tracks.length === 0) {
    console.log('[ambient] no bed (disabled or no tracks)')
    return
  }
  order = ambientOrder(config.tracks.length, config.mode)
  cum = ambientBoundaries(config.tracks, order)
  guestPlaying = config.autoplay
  manualTrackIndex = -1
  loadedTrackIndex = -1
  level = 0

  entity = engine.addEntity()
  // Parented to the CAMERA — the actual listener — so the bed is omnipresent at
  // a constant level. A positional bed would fade with distance, which is the
  // one thing a background layer must never do.
  Transform.create(entity, { parent: engine.CameraEntity })
  AudioSource.create(entity, { audioClipUrl: '', playing: false, loop: false, volume: 0 })
  engine.addSystem(ambientSystem)
  console.log(
    `[ambient] bed on · ${config.tracks.length} track(s) · ${config.mode} · ` +
      `vol ${config.volume} · ${config.autoplay ? 'autoplay' : 'paused'}`
  )
}

/* ── The guest widget's API ─────────────────────────────────────────────── */

/** True when this scene actually has a bed to control (drives widget visibility). */
export function hasAmbientBed(): boolean {
  return !!config && config.enabled && config.tracks.length > 0
}

export function isAmbientPlaying(): boolean {
  return guestPlaying
}

/** Non-null while a zone owns the channel — the widget says who. */
export function ambientDuckedBy(): string | null {
  return guestPlaying ? duckedBy : null
}

export function ambientTrackTitle(): string {
  if (!config) return ''
  const index = manualTrackIndex >= 0 ? manualTrackIndex : loadedTrackIndex
  return config.tracks[index]?.title ?? ''
}

export function ambientCanSwitch(): boolean {
  return !!config && config.guestSwitch && config.tracks.length > 1
}

export function setAmbientPlaying(next: boolean): void {
  guestPlaying = next
}

/** Play/pause. Returns the new playing state. */
export function toggleAmbient(): boolean {
  guestPlaying = !guestPlaying
  return guestPlaying
}

/**
 * Next track — LOCAL to this client. Stepping through the shared order (rather
 * than raw track index) keeps the owner's shuffle intent even when a guest is
 * driving, and un-pauses, because pressing NEXT means "play something else",
 * never "play nothing".
 */
export function ambientNextTrack(): void {
  if (!config || config.tracks.length === 0) return
  const current = manualTrackIndex >= 0 ? manualTrackIndex : loadedTrackIndex
  const slot = order.indexOf(current)
  const nextSlot = slot < 0 ? 0 : (slot + 1) % order.length
  manualTrackIndex = order[nextSlot]
  loadedTrackIndex = -1
  guestPlaying = true
}

/** Test seam — drops the bed so a suite can init a fresh one. */
export function resetAmbientAudio(): void {
  if (entity) {
    engine.removeSystem(ambientSystem)
    engine.removeEntity(entity)
  }
  config = null
  entity = null
  order = []
  cum = [0]
  guestPlaying = true
  manualTrackIndex = -1
  loadedTrackIndex = -1
  level = 0
  duckedBy = null
}
