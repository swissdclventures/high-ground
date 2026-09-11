/**
 * Venue playlist — camera-parented, ducked when a zone owns the channel.
 * Independent of the scene ambient bed and of the breakdance floor set.
 */
import { engine, AudioSource, Transform, type Entity } from '@dcl/sdk/ecs'
import type { DanceMusicConfig } from '@shared/dance-venue-contract'
import { activeAudioClaim } from './channel'
import { isMusicHeldByLocation } from './location-hold'
import { arrivalMusicGain } from './arrival-hold'
import { hostAudioArrivalGain } from './arrival-gain'
import { markLandingMusicReady } from '../plugins/landing'

let config: DanceMusicConfig | null = null
let entity: Entity | null = null
let order: number[] = []
let index = 0
let playing = false

function clipUrl(trackIndex: number): string {
  return config?.tracks[trackIndex]?.file ?? ''
}

function applyClip(): void {
  if (!entity || !config || config.tracks.length === 0) return
  const src = AudioSource.getMutable(entity)
  src.audioClipUrl = clipUrl(index)
  src.playing = playing
  src.loop = config.tracks.length === 1
  src.volume = playing && !isMusicHeldByLocation() ? arrivalMusicGain() * hostAudioArrivalGain() : 0
}

function playlistSystem(): void {
  if (!entity || !config) return
  const src = AudioSource.getOrNull(entity)
  if (!src) return
  const claim = activeAudioClaim()
  const target = playing && !claim && !isMusicHeldByLocation() ? arrivalMusicGain() * hostAudioArrivalGain() : 0
  if (Math.abs((src.volume ?? 0) - target) > 0.005) {
    AudioSource.getMutable(entity).volume = target
  }
}

export function initPlaylistAudio(next: DanceMusicConfig, autoplay: boolean): void {
  config = next
  if (!config.tracks.length) return
  order = config.tracks.map((_, i) => i)
  index = order[0] ?? 0
  playing = autoplay
  entity = engine.addEntity()
  Transform.create(entity, { parent: engine.CameraEntity })
  AudioSource.create(entity, {
    audioClipUrl: clipUrl(index),
    playing,
    loop: false,
    volume: playing ? arrivalMusicGain() * hostAudioArrivalGain() : 0,
  })
  if (playing) markLandingMusicReady()
  engine.addSystem(playlistSystem)
}

export function hasPlaylist(): boolean {
  return !!config && config.tracks.length > 0
}

export function isPlaylistPlaying(): boolean {
  return playing
}

export function setPlaylistPlaying(next: boolean): void {
  playing = next
  if (entity) AudioSource.getMutable(entity).playing = next
}

export function playlistNext(): void {
  if (!config || order.length === 0) return
  const slot = Math.max(0, order.indexOf(index))
  index = order[(slot + 1) % order.length]
  playing = true
  applyClip()
}

export function playlistPrev(): void {
  if (!config || order.length === 0) return
  const slot = Math.max(0, order.indexOf(index))
  index = order[(slot - 1 + order.length) % order.length]
  playing = true
  applyClip()
}
