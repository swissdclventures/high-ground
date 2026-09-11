/**
 * ONE ARBITER FOR "WHAT IS PLAYING" — shared by the bottom transport and Host → AUDIO.
 *
 * WHAT WAS ACTUALLY TANGLED (investigated 2026-08-27, before anything moved):
 *
 *   1. Host → AUDIO·MUSIC (first box)  drove dance/music.ts — the uploaded venue
 *      playlist that ships with the Breakdance/venue config.
 *   2. Host → AUDIO·MUSIC (second box) drove social/media.ts `adminPlayAudio` — the
 *      URL-audio smart object (Venue → Media "music on arrival"). Two boxes, the same
 *      title, mutually exclusive by a `!hasMusic()` guard.
 *   3. The bottom widget (host-ui MusicTransport) drove a THIRD thing first: the venue
 *      playlist app (audio/playlist.ts), then the ambient bed (audio/ambient.ts), and
 *      only then fell back to muting dance/music.ts.
 *
 * So they overlap but are NOT the same object: four playback implementations, three
 * entities, no shared state. The bottom widget's priority order is the one that matches
 * what a guest actually hears, so it becomes the contract — this module — and BOTH
 * surfaces now read and write through it. Nothing was disconnected or rewritten: each
 * call still lands on the same function it always did.
 *
 * That makes Host → AUDIO a lightweight DJ control over whatever source is live, and
 * guarantees the two controls can never disagree about what is playing.
 */
import {
  ambientCanSwitch,
  ambientNextTrack,
  ambientTrackTitle,
  hasAmbientBed,
  isAmbientPlaying,
  setAmbientPlaying
} from './ambient'
import { musicLocationHold } from './location-hold'
import { hostAudioArrivalGain, setHostAudioArrivalGain } from './arrival-gain'
import { hasPlaylist, isPlaylistPlaying, playlistNext, playlistPrev, setPlaylistPlaying } from './playlist'
import {
  currentTrackTitle,
  hasMusic,
  hostMusicPlay,
  hostMusicSkip,
  hostMusicStop,
  isLocalMusicMuted,
  isMusicPlaying,
  musicVolumePct,
  nudgeMusicVolume,
  setLocalMusicPaused,
  toggleLocalMusicMute
} from '../dance/music'

/**
 * `playlist` — Audio app's uploaded venue playlist (audio/playlist.ts).
 * `bed`      — the scene's ambient background bed (audio/ambient.ts).
 * `venue`    — the dance venue's own music set (dance/music.ts).
 */
export type HostAudioSource = 'playlist' | 'bed' | 'venue' | 'none'

/**
 * WHO is pressing the button, and therefore how far the change reaches.
 *
 * `local` — a guest on the bottom transport. Their choice is theirs and never moves
 *           anyone else's music.
 * `room`  — the host in Host → AUDIO. Play/stop and skip go out to every client.
 *
 * Only the venue music set (dance/music.ts) actually has both paths: `hostMusicStop`
 * broadcasts, `setLocalMusicPaused` mutes this client. The playlist and the ambient bed
 * are per-client implementations, so the scope makes no difference to them. Getting
 * this wrong is not cosmetic — it would let any visitor kill the venue's music for
 * everybody in the room.
 */
export type HostAudioScope = 'local' | 'room'

/** Priority order = what the guest is actually hearing. Do not reorder casually. */
export function hostAudioSource(): HostAudioSource {
  if (hasPlaylist()) return 'playlist'
  if (hasAmbientBed()) return 'bed'
  if (hasMusic()) return 'venue'
  return 'none'
}

export function hasHostAudio(): boolean {
  return hostAudioSource() !== 'none'
}

/** Human name of the live source, for the panel's status line. */
export function hostAudioSourceLabel(): string {
  const hold = musicLocationHold()
  if (hold) return `held by ${hold.label}`
  switch (hostAudioSource()) {
    case 'playlist':
      return 'venue playlist'
    case 'bed':
      return 'background bed'
    case 'venue':
      return 'venue music'
    default:
      return 'no audio'
  }
}

export function hostAudioTrackTitle(): string {
  switch (hostAudioSource()) {
    case 'bed':
      return ambientTrackTitle()
    case 'venue':
      return currentTrackTitle()
    // The Audio app's playlist derives its track from wall-clock order and exposes
    // no title. Say so rather than inventing one.
    default:
      return ''
  }
}

/**
 * A place can silence the channel without owning a source — the Speakeasy lounge
 * holds it so proximity voice is what you hear (audio/location-hold.ts). While a
 * hold is on, nothing is audible and the transports say so instead of lying.
 */
export function hostAudioHoldLabel(): string | null {
  return musicLocationHold()?.label ?? null
}

export function hostAudioPlaying(): boolean {
  if (musicLocationHold()) return false
  switch (hostAudioSource()) {
    case 'playlist':
      return isPlaylistPlaying()
    case 'bed':
      return isAmbientPlaying()
    case 'venue':
      return isMusicPlaying() && !isLocalMusicMuted()
    default:
      return false
  }
}

export function hostAudioSetPlaying(on: boolean, scope: HostAudioScope = 'local'): void {
  // Pause still works under a hold (it is a preference, and it survives the walk
  // out); PLAY would promise sound the hold is already suppressing.
  if (on && musicLocationHold()) return
  switch (hostAudioSource()) {
    case 'playlist':
      setPlaylistPlaying(on)
      return
    case 'bed':
      setAmbientPlaying(on)
      return
    case 'venue':
      if (scope === 'local') setLocalMusicPaused(!on)
      else if (on) hostMusicPlay()
      else hostMusicStop()
      return
    default:
  }
}

export function hostAudioNext(scope: HostAudioScope = 'local'): void {
  if (musicLocationHold()) return
  switch (hostAudioSource()) {
    case 'playlist':
      playlistNext()
      return
    case 'bed':
      ambientNextTrack()
      return
    case 'venue':
      // The venue set runs on ONE shared timeline; skipping moves the whole room,
      // so it is a host action only.
      if (scope === 'room') hostMusicSkip()
      return
    default:
  }
}

/**
 * The bed has no previous — its order is a wall-clock permutation, so stepping back
 * would land on a track nobody else is hearing. NEXT twice is the honest control.
 */
export function hostAudioPrev(scope: HostAudioScope = 'local'): void {
  if (musicLocationHold()) return
  switch (hostAudioSource()) {
    case 'playlist':
      playlistPrev()
      return
    case 'bed':
      ambientNextTrack()
      return
    case 'venue':
      if (scope === 'room') hostMusicSkip()
      return
    default:
  }
}

/** False when the live source has only one track to offer. */
export function hostAudioCanSkip(scope: HostAudioScope = 'local'): boolean {
  if (musicLocationHold()) return false
  const source = hostAudioSource()
  if (source === 'bed') return ambientCanSwitch()
  if (source === 'venue') return scope === 'room'
  return source !== 'none'
}

/** Percent, or null when the live source exposes no level control. */
export function hostAudioVolumePct(): number | null {
  return hostAudioSource() === 'venue' ? musicVolumePct() : null
}

export function hostAudioNudgeVolume(delta: number): void {
  if (hostAudioSource() === 'venue') nudgeMusicVolume(delta)
}

/** Null when the live source has no separate mute (play/pause is its mute). */
export function hostAudioMuted(): boolean | null {
  return hostAudioSource() === 'venue' ? isLocalMusicMuted() : null
}

export function hostAudioToggleMute(): void {
  if (hostAudioSource() === 'venue') toggleLocalMusicMute()
}

/** Arrival hold gain. 0 during Gate hold, rises to 1 as the overlay blends out. */
export { hostAudioArrivalGain, setHostAudioArrivalGain }
