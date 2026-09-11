import {
  engine,
  Entity,
  VideoPlayer,
  AudioStream,
  MeshRenderer,
  Transform,
  Material
} from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import type { SocialSurfaceConfig } from '@shared/social-surface-contract'
import { mediaScreenVideoUvs, type MediaScreenFit } from '@shared/media-screen-fit'
import { getSocialConfig } from './config'
import { onSocial, emitSocial } from './sync'
import { audibleZone, claimAudioChannel } from '../audio/channel'
import { isMusicHeldByLocation, onMusicLocationHoldChange } from '../audio/location-hold'
import { arrivalMusicGain } from '../audio/arrival-hold'
import { hostAudioArrivalGain, onHostAudioArrivalGainChange } from '../audio/arrival-gain'
import { markLandingMusicReady } from '../plugins/landing'

/** Off / waiting panel — unlit so night skies do not swallow a near-black PBR box. */
function paintDarkScreen(entity: Entity): void {
  Material.setBasicMaterial(entity, {
    diffuseColor: Color4.create(0.1, 0.1, 0.12, 1)
  })
}

/**
 * Live picture — many screen meshes may share one decoded VideoPlayer texture.
 *
 * `uvs` is the crop window (shared/media-screen-fit.ts). A screen the owner
 * dragged out of the source's shape gets the middle of the picture at the right
 * proportions instead of a skewed one; null means the shapes already agree (or
 * the owner chose stretch) and the explorer's own mapping stands.
 */
function paintVideoTexture(
  entity: Entity,
  videoPlayerEntity: Entity,
  uvs: number[] | null
): void {
  MeshRenderer.setBox(entity, uvs ?? undefined)
  Material.setBasicMaterial(entity, {
    texture: Material.Texture.Video({ videoPlayerEntity })
  })
}

/**
 * How far a media source silences the ambient background bed.
 *
 * Both are wider than the point where DCL's own falloff makes the source
 * audible, on purpose: the bed has to be gone BEFORE you can hear the screen,
 * or the two overlap in the approach and the venue sounds muddled. A screen
 * gets the larger radius because a video is usually the reason the room exists.
 */
const SCREEN_CLAIM_RADIUS_M = 22
const EMITTER_CLAIM_RADIUS_M = 14

interface ScreenHandle {
  id: string
  entity: Entity
  playerKey: string | null
  volume: number
  playing: boolean
  /** Crop window for this panel's shape, or null to keep the default mapping. */
  uvs: number[] | null
}

/** Geometry + picture policy for one screen, from its placed smart entity. */
export interface ScreenFitOptions {
  widthM?: number
  heightM?: number
  fit?: MediaScreenFit
  sourceAspect?: number
}

interface SharedVideoPlayer {
  entity: Entity
  src: string
  screenIds: Set<string>
}

interface AudioHandle {
  id: string
  entity: Entity
  volume: number
  playing: boolean
}

const screens = new Map<string, ScreenHandle>()
/** One decoder per distinct source, regardless of how many meshes display it. */
const sharedVideoPlayers = new Map<string, SharedVideoPlayer>()
const audios = new Map<string, AudioHandle>()

/** Runtime overrides set from the Host HUD (synced via messageBus). */
let runtimeVideoUrl: string | null = null
let runtimeAudioUrl: string | null = null
// Video ships MUTED by default (videoMuted=true → effective volume 0), but the
// underlying level must be audible so "Unmute" actually produces sound. Starting
// this at 0 was the bug: mute and unmute both resolved to 0, so the button did
// nothing audible.
let runtimeVideoVolume = 0.8
let runtimeAudioVolume = 0.75
let videoMuted = true
let audioMuted = false

/** Old sample → new hip-hop loop (published scenes may still bake the old name). */
function migrateVideoUrl(url: string): string {
  if (!url) return url
  return url.includes('top-of-the-world.mp4')
    ? url.replace(/top-of-the-world\.mp4/g, 'hiphop-bg-loop.mp4')
    : url
}

function effectiveVideoUrl(config: SocialSurfaceConfig): string {
  return migrateVideoUrl(runtimeVideoUrl ?? config.media.defaultVideoUrl ?? '')
}

function effectiveAudioUrl(config: SocialSurfaceConfig): string {
  return runtimeAudioUrl ?? config.media.defaultAudioUrl ?? ''
}

export function getRuntimeMediaState(): {
  videoUrl: string
  audioUrl: string
  videoVolume: number
  audioVolume: number
  videoMuted: boolean
  audioMuted: boolean
} {
  const config = getSocialConfig()
  return {
    videoUrl: config ? effectiveVideoUrl(config) : runtimeVideoUrl ?? '',
    audioUrl: config ? effectiveAudioUrl(config) : runtimeAudioUrl ?? '',
    videoVolume: runtimeVideoVolume,
    audioVolume: runtimeAudioVolume,
    videoMuted,
    audioMuted
  }
}

export function registerScreen(entity: Entity, id: string, fit?: ScreenFitOptions): void {
  // Do not create a decoder per mesh. applyVideo creates (or reuses) one controller
  // entity per distinct URL and points every matching screen at its shared texture.
  // Until a real source starts, retain the dark panel rather than an empty texture.
  paintDarkScreen(entity)
  // The panel's shape never changes after it is spawned, so the crop window is a
  // one-time computation kept on the handle rather than redone on every play/stop.
  const uvs = mediaScreenVideoUvs({
    widthM: fit?.widthM ?? 3,
    heightM: fit?.heightM ?? 1.7,
    fit: fit?.fit ?? 'crop',
    sourceAspect: fit?.sourceAspect ?? 16 / 9
  })
  const handle: ScreenHandle = { id, entity, playerKey: null, volume: 0, playing: false, uvs }
  screens.set(id, handle)
  // A playing screen owns the sound around it — the ambient bed steps aside.
  // Muted screens claim nothing: a silent picture is not an audio zone.
  claimAudioChannel({
    id: `screen:${id}`,
    label: 'video',
    zone: () => audibleZone(entity, SCREEN_CLAIM_RADIUS_M),
    active: () => handle.playing && handle.volume > 0.01 && !videoMuted,
  })
}

function getOrCreateSharedVideoPlayer(src: string): SharedVideoPlayer {
  const existing = sharedVideoPlayers.get(src)
  if (existing) return existing

  const entity = engine.addEntity()
  VideoPlayer.create(entity, {
    src,
    playing: false,
    loop: true,
    volume: 0
  })
  const player: SharedVideoPlayer = { entity, src, screenIds: new Set<string>() }
  sharedVideoPlayers.set(src, player)
  return player
}

function syncSharedVideoPlayer(player: SharedVideoPlayer): void {
  let playing = false
  let volume = 0
  for (const id of player.screenIds) {
    const screen = screens.get(id)
    if (!screen?.playing) continue
    playing = true
    volume = Math.max(volume, screen.volume)
  }
  const component = VideoPlayer.getMutable(player.entity)
  component.src = player.src
  component.playing = playing
  component.volume = volume
}

function detachScreenFromVideoPlayer(handle: ScreenHandle): void {
  if (!handle.playerKey) return
  const previous = sharedVideoPlayers.get(handle.playerKey)
  handle.playerKey = null
  if (!previous) return
  previous.screenIds.delete(handle.id)
  syncSharedVideoPlayer(previous)
}

export function registerAudio(
  entity: Entity,
  id: string,
  defaultUrl?: string | null,
  spatial = true
): void {
  const url = defaultUrl ?? ''
  AudioStream.create(entity, {
    url,
    playing: false,
    volume: 0.7,
    spatial
  })
  const handle: AudioHandle = { id, entity, volume: 0.7, playing: false }
  audios.set(id, handle)
  // Spatial emitters own a bubble; a non-spatial one is venue-wide by
  // definition and therefore claims the whole plot while it plays.
  claimAudioChannel({
    id: `emitter:${id}`,
    label: 'venue audio',
    zone: spatial ? () => audibleZone(entity, EMITTER_CLAIM_RADIUS_M) : null,
    active: () => handle.playing && handle.volume > 0.01 && !audioMuted,
  })
}


function applyVideo(id: string, src: string, playing: boolean, volume: number): void {
  const handle = screens.get(id)
  if (!handle) return
  const migrated = migrateVideoUrl(src)
  const shouldPlay = playing && Boolean(migrated)

  if (!shouldPlay) {
    detachScreenFromVideoPlayer(handle)
    handle.playing = false
    handle.volume = volume
    paintDarkScreen(handle.entity)
    return
  }

  if (handle.playerKey !== migrated) detachScreenFromVideoPlayer(handle)
  const player = getOrCreateSharedVideoPlayer(migrated)
  player.screenIds.add(id)
  handle.playerKey = migrated
  handle.playing = true
  handle.volume = volume
  paintVideoTexture(handle.entity, player.entity, handle.uvs)
  syncSharedVideoPlayer(player)
}

function applyAudio(id: string, src: string, playing: boolean, volume: number): void {
  const handle = audios.get(id)
  if (!handle) return
  const stream = AudioStream.getMutable(handle.entity)
  stream.url = src
  stream.playing = playing
  stream.volume = isMusicHeldByLocation() ? 0 : volume * arrivalMusicGain() * hostAudioArrivalGain()
  handle.playing = playing
  handle.volume = volume
  if (playing && src) markLandingMusicReady()
}

function refreshLocationHeldAudio(): void {
  for (const handle of audios.values()) {
    const stream = AudioStream.getMutableOrNull(handle.entity)
    if (!stream) continue
    const volume = isMusicHeldByLocation() ? 0 : handle.volume * arrivalMusicGain() * hostAudioArrivalGain()
    if (Math.abs((stream.volume ?? 0) - volume) > 0.005) stream.volume = volume
  }
}

export function applyMediaDefaults(config: SocialSurfaceConfig): void {
  const media = config.media
  // arrivalMedia is the single, mutually-exclusive default for what SOUND plays
  // on entry (falls back to the legacy videoPlayingOnLoad flag for old configs).
  const arrival = media.arrivalMedia ?? (media.videoPlayingOnLoad ? 'video' : 'none')
  // Every screen starts on its configured source, but screens with the same URL
  // share one decoder/texture. Only the primary binding contributes sound.
  const screens = config.apps?.video?.screens ?? []
  for (const screen of screens) {
    if (screen.source === 'none' || !screen.url) continue
    const isPrimary = screen.screenId === media.screenSmartObjectId
    applyVideo(
      screen.screenId,
      migrateVideoUrl(screen.url),
      true,
      isPrimary && arrival === 'video' ? 0.8 : 0
    )
  }
  if (!screens.length && media.screenSmartObjectId && media.defaultVideoUrl) {
    // Published before per-screen sources existed: one screen, one URL.
    applyVideo(media.screenSmartObjectId, migrateVideoUrl(media.defaultVideoUrl), true, arrival === 'video' ? 0.8 : 0)
  }
  for (const emitter of config.apps?.audio?.emitters ?? []) {
    if (emitter.source === 'none' || !emitter.url) continue
    if (emitter.emitterId === media.audioSmartObjectId) continue // handled below, with the playlist rule
    applyAudio(emitter.emitterId, emitter.url, false, 0.7)
  }
  if (media.audioSmartObjectId && media.defaultAudioUrl) {
    // URL music autoplays on arrival=music ONLY when there's no uploaded dance
    // playlist — otherwise BOTH would play at once (double music). The playlist
    // (dance/music.ts) is the primary music when present.
    const hasPlaylist = (config.dance?.music?.tracks?.length ?? 0) > 0
    applyAudio(media.audioSmartObjectId, media.defaultAudioUrl, arrival === 'music' && !hasPlaylist, 0.7)
  }
}

let mediaInited = false

/** Host media API. Idempotent — Video and Audio both consume it. */
export function initMedia(): void {
  if (mediaInited) return
  mediaInited = true
  onSocial('media.video', (msg) => {
    applyVideo(msg.id, msg.src, msg.playing, msg.volume)
  })
  onSocial('media.audio', (msg) => {
    applyAudio(msg.id, msg.src, msg.playing, msg.volume)
  })
  onMusicLocationHoldChange(refreshLocationHeldAudio)
  onHostAudioArrivalGainChange(refreshLocationHeldAudio)
}

/**
 * MULTI-SCREEN HOST CONTROL
 *
 * A World has as many screens as it has walls worth filling, and the host has to say
 * WHICH one they are driving. Every screen already carries a stable identifier — the
 * smart-object id the builder bound it to (`MediaScreenBinding.screenId`), the same id
 * `registerScreen` keys this module's map by — so identity comes from the placement,
 * never from a screen's position in the scene or its order on screen.
 *
 * Per-screen play state, mute and volume live here. A screen with no entry falls back
 * to the venue-wide defaults, so a scene that never touches these behaves exactly as it
 * did when there was only one screen.
 */

/** Screens the host panel will offer. Beyond this it stops being a control strip. */
export const MAX_HOST_SCREENS = 9

const screenVolumes = new Map<string, number>()
const screenMuted = new Map<string, boolean>()
const screenUrls = new Map<string, string>()

export interface HostScreenState {
  screenId: string
  /** The builder's label, else a readable fallback derived from the id. */
  label: string
  url: string
  playing: boolean
  muted: boolean
  volume: number
  /** False when the binding exists in config but no entity was placed for it. */
  registered: boolean
  primary: boolean
}

function screenVolumeFor(id: string): number {
  return screenVolumes.get(id) ?? runtimeVideoVolume
}

function screenMutedFor(id: string): boolean {
  return screenMuted.get(id) ?? videoMuted
}

function screenUrlFor(id: string): string {
  const override = screenUrls.get(id)
  if (override) return migrateVideoUrl(override)
  const config = getSocialConfig()
  if (!config) return ''
  const binding = config.apps?.video?.screens?.find((entry) => entry.screenId === id)
  if (binding?.source !== 'none' && binding?.url) return migrateVideoUrl(binding.url)
  // Published before per-screen sources existed: the primary screen carries the
  // venue's one URL, and the host's runtime override applies to it.
  if (id === config.media.screenSmartObjectId) return effectiveVideoUrl(config)
  return ''
}

function emitScreen(id: string, playing: boolean): void {
  const src = screenUrlFor(id)
  if (!src) return
  emitSocial({
    type: 'media.video',
    id,
    src,
    playing,
    volume: playing && !screenMutedFor(id) ? screenVolumeFor(id) : 0
  })
}

/** Runtime edge-trigger target. Returns false when the authored target/source is unavailable. */
export function playProximityMedia(action: 'play_video' | 'play_audio', targetId: string): boolean {
  const id = targetId.trim()
  if (!id) return false
  if (action === 'play_video') {
    if (!screens.has(id) || !screenUrlFor(id)) return false
    emitScreen(id, true)
    return true
  }
  const config = getSocialConfig()
  const binding = config?.apps?.audio?.emitters?.find((entry) => entry.emitterId === id)
  const url =
    binding?.source !== 'none' && binding?.url
      ? binding.url
      : id === config?.media.audioSmartObjectId
        ? effectiveAudioUrl(config)
        : ''
  if (!audios.has(id) || !url) return false
  emitSocial({
    type: 'media.audio',
    id,
    src: url,
    playing: true,
    volume: audioMuted ? 0 : runtimeAudioVolume,
  })
  return true
}

/**
 * Every screen the host can drive, primary first.
 *
 * Built from the CONFIG bindings (so a screen keeps its slot even before its entity
 * finished spawning) plus any screen that registered without a binding, capped at
 * MAX_HOST_SCREENS.
 */
export function listHostScreens(): HostScreenState[] {
  const config = getSocialConfig()
  const primaryId = config?.media.screenSmartObjectId ?? null
  const ids: string[] = []
  const push = (id: string) => {
    if (id && !ids.includes(id)) ids.push(id)
  }
  if (primaryId) push(primaryId)
  for (const binding of config?.apps?.video?.screens ?? []) push(binding.screenId)
  for (const id of screens.keys()) push(id)

  return ids.slice(0, MAX_HOST_SCREENS).map((id, index) => {
    const binding = config?.apps?.video?.screens?.find((entry) => entry.screenId === id)
    const handle = screens.get(id)
    return {
      screenId: id,
      label: binding?.label?.trim() || `Screen ${index + 1}`,
      url: screenUrlFor(id),
      playing: handle?.playing ?? false,
      muted: screenMutedFor(id),
      volume: screenVolumeFor(id),
      registered: !!handle,
      primary: id === primaryId
    }
  })
}

/** One screen's live state, or null when the id is not one of this World's screens. */
export function hostScreenState(id: string): HostScreenState | null {
  return listHostScreens().find((screen) => screen.screenId === id) ?? null
}

export function adminPlayScreen(id: string): void {
  emitScreen(id, true)
}

export function adminStopScreen(id: string): void {
  const src = screenUrlFor(id)
  emitSocial({ type: 'media.video', id, src, playing: false, volume: 0 })
}

export function adminToggleScreenMute(id: string): void {
  const next = !screenMutedFor(id)
  screenMuted.set(id, next)
  // Unmuting with the level at 0 would still be silent — restore an audible level.
  if (!next && screenVolumeFor(id) <= 0) screenVolumes.set(id, 0.8)
  const handle = screens.get(id)
  if (!handle) return
  emitScreen(id, handle.playing)
}

export function adminSetScreenVolume(id: string, volume: number): void {
  const next = Math.max(0, Math.min(1, volume))
  screenVolumes.set(id, next)
  // Raising the volume un-mutes — otherwise "+" would be silent while muted.
  if (next > 0) screenMuted.set(id, false)
  const handle = screens.get(id)
  if (!handle?.playing) return
  emitScreen(id, true)
}

/** Point one screen at a different source. Keeps whatever play state it had. */
export function adminSetScreenUrl(id: string, url: string): void {
  const trimmed = url.trim()
  if (trimmed) screenUrls.set(id, migrateVideoUrl(trimmed))
  else screenUrls.delete(id)
  const handle = screens.get(id)
  emitScreen(id, handle?.playing ?? false)
}

export function adminPlayVideo(): void {
  const config = getSocialConfig()
  if (!config?.media.screenSmartObjectId) return
  const src = effectiveVideoUrl(config)
  if (!src) return
  emitSocial({
    type: 'media.video',
    id: config.media.screenSmartObjectId,
    src,
    playing: true,
    volume: videoMuted ? 0 : runtimeVideoVolume
  })
}

export function adminStopVideo(): void {
  const config = getSocialConfig()
  if (!config?.media.screenSmartObjectId) return
  emitSocial({
    type: 'media.video',
    id: config.media.screenSmartObjectId,
    src: effectiveVideoUrl(config),
    playing: false,
    volume: 0
  })
}

export function adminPlayAudio(): void {
  const config = getSocialConfig()
  if (!config?.media.audioSmartObjectId) return
  const src = effectiveAudioUrl(config)
  if (!src) return
  emitSocial({
    type: 'media.audio',
    id: config.media.audioSmartObjectId,
    src,
    playing: true,
    volume: audioMuted ? 0 : runtimeAudioVolume
  })
}

export function adminStopAudio(): void {
  const config = getSocialConfig()
  if (!config?.media.audioSmartObjectId) return
  emitSocial({
    type: 'media.audio',
    id: config.media.audioSmartObjectId,
    src: effectiveAudioUrl(config),
    playing: false,
    volume: 0
  })
}

export function adminSetVideoUrl(url: string): void {
  runtimeVideoUrl = migrateVideoUrl(url.trim()) || null
  const config = getSocialConfig()
  if (!config?.media.screenSmartObjectId) return
  const src = effectiveVideoUrl(config)
  if (!src) return
  const handle = screens.get(config.media.screenSmartObjectId)
  emitSocial({
    type: 'media.video',
    id: config.media.screenSmartObjectId,
    src,
    playing: handle?.playing ?? false,
    volume: videoMuted ? 0 : runtimeVideoVolume
  })
}

export function adminSetAudioUrl(url: string): void {
  runtimeAudioUrl = url.trim() || null
  const config = getSocialConfig()
  if (!config?.media.audioSmartObjectId) return
  const src = effectiveAudioUrl(config)
  if (!src) return
  const handle = audios.get(config.media.audioSmartObjectId)
  emitSocial({
    type: 'media.audio',
    id: config.media.audioSmartObjectId,
    src,
    playing: handle?.playing ?? false,
    volume: audioMuted ? 0 : runtimeAudioVolume
  })
}

export function adminSetVideoVolume(volume: number): void {
  runtimeVideoVolume = Math.max(0, Math.min(1, volume))
  // Raising the volume un-mutes — otherwise "+" would be silent while muted.
  if (runtimeVideoVolume > 0) videoMuted = false
  const config = getSocialConfig()
  if (!config?.media.screenSmartObjectId) return
  const handle = screens.get(config.media.screenSmartObjectId)
  if (!handle?.playing) return
  emitSocial({
    type: 'media.video',
    id: config.media.screenSmartObjectId,
    src: effectiveVideoUrl(config),
    playing: true,
    volume: videoMuted ? 0 : runtimeVideoVolume
  })
}

export function adminSetAudioVolume(volume: number): void {
  runtimeAudioVolume = Math.max(0, Math.min(1, volume))
  const config = getSocialConfig()
  if (!config?.media.audioSmartObjectId) return
  const handle = audios.get(config.media.audioSmartObjectId)
  if (!handle?.playing) return
  emitSocial({
    type: 'media.audio',
    id: config.media.audioSmartObjectId,
    src: effectiveAudioUrl(config),
    playing: true,
    volume: audioMuted ? 0 : runtimeAudioVolume
  })
}

export function adminToggleVideoMute(): void {
  videoMuted = !videoMuted
  // Unmuting with the level at 0 would still be silent — restore an audible level.
  if (!videoMuted && runtimeVideoVolume <= 0) runtimeVideoVolume = 0.8
  const config = getSocialConfig()
  if (!config?.media.screenSmartObjectId) return
  const handle = screens.get(config.media.screenSmartObjectId)
  if (!handle) return
  emitSocial({
    type: 'media.video',
    id: config.media.screenSmartObjectId,
    src: effectiveVideoUrl(config),
    playing: handle.playing,
    volume: videoMuted ? 0 : runtimeVideoVolume
  })
}

export function adminToggleAudioMute(): void {
  audioMuted = !audioMuted
  const config = getSocialConfig()
  if (!config?.media.audioSmartObjectId) return
  const handle = audios.get(config.media.audioSmartObjectId)
  if (!handle) return
  emitSocial({
    type: 'media.audio',
    id: config.media.audioSmartObjectId,
    src: effectiveAudioUrl(config),
    playing: handle.playing,
    volume: audioMuted ? 0 : runtimeAudioVolume
  })
}

/** True when the scene has a URL-audio smart object with a configured stream. */
export function hasUrlAudio(): boolean {
  const config = getSocialConfig()
  if (!config?.media.audioSmartObjectId) return false
  return !!effectiveAudioUrl(config)
}

/** Local play state of the URL-audio stream (what THIS client hears). */
export function isUrlAudioPlaying(): boolean {
  const config = getSocialConfig()
  if (!config?.media.audioSmartObjectId) return false
  return audios.get(config.media.audioSmartObjectId)?.playing ?? false
}

export function getScreenEntity(id: string): Entity | undefined {
  return screens.get(id)?.entity
}

export function getAudioEntity(id: string): Entity | undefined {
  return audios.get(id)?.entity
}

/** Door slide — offset whole assembly on X when open. */
const doors = new Map<string, { entity: Entity; baseX: number; slide: number; open: boolean }>()

export function registerDoor(entity: Entity, id: string, slideDistance = 1): void {
  const baseX = Transform.get(entity).position.x
  doors.set(id, { entity, baseX, slide: slideDistance, open: false })
}

export function initDoorSync(): void {
  onSocial('door.set', (msg) => {
    const door = doors.get(msg.id)
    if (!door) return
    door.open = msg.open
    const mutable = Transform.getMutable(door.entity)
    mutable.position.x = door.baseX + (msg.open ? door.slide : 0)
  })
}

export function adminToggleDoor(id: string): void {
  const door = doors.get(id)
  if (!door) return
  emitSocial({ type: 'door.set', id, open: !door.open })
}
