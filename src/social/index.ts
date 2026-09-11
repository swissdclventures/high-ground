import type { SceneRuntimeConfig } from '@shared/scene-runtime-config'
import type { SmartEntityHandle } from '../smart-entities'
import { engine } from '@dcl/sdk/ecs'
import { getConfiguredSocialConfig, loadSocialConfig } from './config'
import { initSocialSync } from './sync'
import { initGating, registerGate } from './gating'
import {
  registerDoor,
  applyMediaDefaults,
  initDoorSync
} from './media'
import { initCrowdEmote, crowdEmoteSystem, playEnterAnnouncement } from './crowd-emote'
import { initNftChecker } from './nft-check'
import { setRuntimeContext } from './runtime-context'
import { initZoneGates } from './zone-gates'
import { initZoneOutlines } from './zone-outline'
import { initZoneTriggers } from './zone-triggers'
import { gateRuleById } from './player'
import { initDanceVenue, initVenueNpcs } from '../dance'
import { initWorldDirector } from '../world-director'
import { startScenePlugins } from '../plugins'
import { initAmbientAudio } from '../audio/ambient'
import { normalizeAmbientAudioConfig } from '@shared/ambient-audio-contract'
import { afterBoot, BOOT_PACE } from '../boot-pace'
import { createMapDataHostApi } from '../map-data-host'
import { startWorldDestinations } from '../world-destinations'
import { noteWorldTransitPlot } from '../world-session'
import { defaultSocialSurfaceConfig } from '@shared/social-surface-contract'
import { clampPunchIslandCrowd } from '@shared/punch-machine-layout'
import { resolveGateHoldName } from '@shared/gate-contract'

export function loadSocialSystems(
  config: SceneRuntimeConfig,
  handles: SmartEntityHandle[]
): void {
  setRuntimeContext(config)
  // Admin-only zone hints. Unconditional: zones exist whether or not the venue layer is
  // on, and the outline stays hidden for anyone who isn't an admin wallet anyway.
  initZoneOutlines()
  const social = loadSocialConfig(config.social, config.buildingName)
  const configured = getConfiguredSocialConfig()
  if (configured?.floorGates.length) initNftChecker()
  const mapData = createMapDataHostApi(config)
  startWorldDestinations(mapData, config)
  noteWorldTransitPlot({
    metadataJson: null,
    spawn: config.spawn,
    sceneBase: config.sceneBase ?? null
  })
  if (!social) {
    // The old minimap ran even on pre-Social scenes. Start only the default map
    // plugin here; do not turn the rest of the Social runtime on as a side effect.
    startScenePlugins({
      social: defaultSocialSurfaceConfig(config.buildingName),
      handles,
      config,
      mapData,
    })
    return
  }

  initSocialSync()
  initNftChecker()
  if (social.enabled) {
    initGating(config)
    initZoneGates()
    initDoorSync()
    initCrowdEmote()
    engine.addSystem(crowdEmoteSystem)
  }
  // ‼️THE ISLAND'S CAST IS CUT HERE, NOT IN THE PUNCH PLUGIN.
  //
  // `PUNCH_ISLAND_CROWD_MAX` has existed since 2026-09-01 and the live island
  // still stood ten bots deep, because the clamp lived inside
  // `startPunchMachinePlugin` — and the punch machine's manifest is
  // `loadClass: "deferred"`, which the kernel schedules through `afterBoot`
  // SECONDS after this function returns. `initDanceVenue` at the bottom of this
  // same function spawns the troupe off `social.dance.npc.count` in the very
  // next statement. The cap was being applied to a number that had already been
  // read, so it corrected nothing and the deck stayed a mob.
  //
  // Config load is the only moment early enough to matter, so the clamp is a
  // pure shared function called synchronously, before ANY plugin starts.
  //
  // Still only a SKY ISLAND: a punch machine standing in a room has a whole
  // venue to hold its cast, and keeps whatever the author gave it.
  if (
    social.dance?.npc &&
    social.apps.punchMachine.enabled &&
    social.apps.punchMachine.skyIslandEnabled &&
    social.apps.punchMachine.cabinetEnabled !== false
  ) {
    if (clampPunchIslandCrowd(social.dance)) {
      console.log(`[punch] island cast clamped to ${social.dance.npc.count}`)
    }
  }
  startScenePlugins({ social, handles, config, mapData })
  initZoneTriggers()
  initAmbientAudio(normalizeAmbientAudioConfig(social.ambient ?? (social.apps.audio as { ambient?: unknown }).ambient))

  for (const handle of handles) {
    const spec = handle.spec
    const gateRuleId = (spec.spec.gateRuleId as string) ?? null
    const slideDistance = (spec.spec.slideDistance as number) ?? 1

    switch (spec.behavior) {
      case 'gate_barrier': {
        const rule = gateRuleById(social, gateRuleId)
        registerGate(
          handle.entity,
          spec.id,
          gateRuleId,
          rule?.deniedMessage ?? 'Access denied'
        )
        break
      }
      case 'video_surface':
        // Video binds screens through the plugin kernel (scene/src/plugins/video.ts).
        break
      case 'audio_stream':
        // Audio binds emitters through the plugin kernel (scene/src/plugins/audio.ts).
        break
      case 'synced_door':
        registerDoor(handle.entity, spec.id, slideDistance)
        break
      default:
        break
    }
  }

  if (social.apps.video.enabled || social.apps.audio.enabled) {
    afterBoot(BOOT_PACE.videoPlayS, 'media playback', () => applyMediaDefaults(social))
  }
  if (social.enabled) {
    playEnterAnnouncement(
      resolveGateHoldName({ worldName: config.worldName, buildingName: config.buildingName })
    )
  }

  // Dance venue activity module — dormant unless the publish enabled it.
  if (social.dance?.enabled) initDanceVenue(social.dance, social.media.arrivalMedia ?? 'none')
  else if (social.enabled && social.dance?.npc.enabled) initVenueNpcs(social.dance)
  if (social.dance?.npc.enabled) initWorldDirector(config.worldDirector, social.dance)
}
