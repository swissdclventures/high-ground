/**
 * THE HEADLESS HALF — what runs when DCL boots a Multiplayer Server for this
 * scene, and nothing else.
 *
 * ‼️THIS FILE IS NOT REACHED ON A CLIENT and must never become reachable. It is
 * loaded through a dynamic `import()` INSIDE the `isServer()` branch of
 * `index.ts` — the one place a dynamic import is correct here, because this
 * module defines no components at module scope. The room wire and the server
 * pulse DO define components, so both are imported statically from `index.ts`
 * on both sides; see the sealing note there.
 *
 * ‼️AND IT STARTS NO PLUGINS. `startScenePlugins` builds avatars, audio, HUD and
 * a dozen `MessageBus` instances, and a MessageBus on the server throws
 * `RemoteError: not implemented` on every construction. The server runs exactly
 * one thing: the punch reducer, over the room wire, on a wall clock.
 */
import { engine } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { normalizePunchMachineAppConfig } from '@shared/punch-machine-contract'
import { normalizeSocialSurfaceConfig, isSocialAdminWallet } from '@shared/social-surface-contract'
import { PUNCH_MAIN_ADMIN_WALLET } from '@shared/punch-game-profile'
import type { SceneRuntimeConfig } from '@shared/scene-runtime-config'
import { setPunchAuthority } from './punch-authority-runtime'
import { startPunchServerPulse } from './punch-server-pulse'
import { createPunchRoomBus } from './punch-room-wire'
import { startPunchCompetitionNetwork, type PunchCompetitionNetwork } from './punch-machine-network'

/** Every machine the server is hosting a round for, by smart-entity id. */
const hosted = new Map<string, PunchCompetitionNetwork>()

export interface PunchServerBootArgs {
  config: SceneRuntimeConfig
}

/**
 * Boot server authority for every punch machine in the deployed scene.
 *
 * Returns the number of machines hosted — 0 is a legitimate answer (a scene
 * with no cabinet), and the caller logs it rather than treating it as failure.
 */
export function startPunchServer(args: PunchServerBootArgs): number {
  const serverId = AUTH_SERVER_PEER_ID.toLowerCase()
  const bus = createPunchRoomBus({ isServer: true, trustSenderOverBody: true })

  // ‼️BEFORE ANY MACHINE IS BUILT. `startPunchCompetitionNetwork` captures the
  // mode in a closure and never asks again — see the note on the setter.
  setPunchAuthority({ authority: 'server', serverId, bus })
  // Official liveness: a synced Int64 pulse, first tick now so the first
  // visitor does not wait a full interval for the house to look alive.
  try {
    startPunchServerPulse()
  } catch (error) {
    console.error('[SERVER] punch pulse failed; hosting continues', error)
  }

  const social = normalizeSocialSurfaceConfig(args.config.social)
  // The SAME normalization the client runs, from the SAME deployed file. If
  // these two ever diverge the server and the clients are playing different
  // games while agreeing about the score, which is the worst failure this
  // design can have — hence one shared pure function, called twice.
  const punchConfig = normalizePunchMachineAppConfig(social.apps.punchMachine)
  // ‼️NO `fitIslandToScene` HERE, deliberately. That correction lowers a sky
  // deck that would sit above the scene's roof, and it belongs to the client
  // for two reasons: it writes a HUD warning, and it changes exactly one field
  // — `islandHeightM` — that the reducer never reads. Calling it here would
  // drag the whole of `punch-machine.ts` (audio, avatars, GLTF, HUD) into the
  // server bundle to change a number nothing on this side looks at.

  // The ids come from the parsed config, NOT from `loadSmartEntities`: that
  // spawns GLTF bodies, colliders and movers, none of which exist on a headless
  // server and all of which cost a cold start. A behaviour and an id is the
  // whole of what the reducer needs to know a cabinet is there.
  const machineIds = (args.config.smartEntities ?? [])
    .filter((entity) => entity.behavior === 'punch_machine')
    .map((entity) => entity.id)

  for (const machineId of machineIds) {
    if (hosted.has(machineId)) continue
    hosted.set(
      machineId,
      startPunchCompetitionNetwork({
        machineId,
        // The server IS the coordinator, and its identity is the server peer
        // id. `electCoordinator` returns that id in server mode, so this line
        // is what makes `coordinatorId === me` true here and false everywhere
        // else, without a branch anywhere in the reducer.
        userId: serverId,
        name: 'HOUSE',
        config: punchConfig,
        authority: 'server',
        serverId,
        bus,
        isSceneHost: (userId) => {
          const id = userId.trim().toLowerCase()
          if (id === PUNCH_MAIN_ADMIN_WALLET) return true
          return isSocialAdminWallet(userId, social.event.adminWallets)
        },
        // ‼️NO `houseBot`, NO `focusBots`, AND THIS IS A REAL BEHAVIOUR CHANGE.
        //
        // Both claim a scene-side NPC body by id, and there are no bodies on a
        // headless server. The reducer treats an absent claimer as "no NPC
        // available yet" and simply asks again — which here is the correct
        // forever answer, so the house bot that keeps an EMPTY island's
        // rotation turning does not exist under server authority.
        //
        // Decide before the toggle flips: either an empty island stops
        // rotating (fine — nobody is watching), or the server needs a bot that
        // needs no body. Do not paper over it by letting a client claim one:
        // two clients would claim two, and the queue would grow a bot per
        // visitor.
      })
    )
  }

  if (hosted.size === 0) return 0

  // ONE SYSTEM, ONE TICK, WALL CLOCK. The server has no frame to ride and no
  // reason to want one: `tick` is written against a monotonic wall clock and
  // rate-limits its own broadcast through STATE_HEARTBEAT_MS.
  engine.addSystem(() => {
    const now = Date.now()
    for (const network of hosted.values()) network.tick(now)
  })

  return hosted.size
}
