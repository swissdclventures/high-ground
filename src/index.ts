import { engine, GltfContainer } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
// STATIC on both sides: registerMessages and defineComponent must run
// before the engine seals. The server half is imported dynamically below.
import { PunchServerPulse } from './plugins/punch-server-pulse'
import { setPunchAuthority } from './plugins/punch-authority-runtime'
import { createPunchHttpBus, startPunchHttpPolling } from './plugins/punch-http-wire'
import { readFile, getSceneInformation } from '~system/Runtime'
import inlinedBuildingConfig from '../assets/building-config.json'
import { parseSceneRuntimeConfig } from '@shared/scene-runtime-config'
import { applySocialPreviewFixture } from '@shared/social-preview-fixture'
import { punchLiveEnabled } from '@shared/punch-live-store'
import { loadBuilding } from './building'
import { initFloorDirectory } from './floor-directory'
import { loadSmartEntities, type SmartEntityHandle } from './smart-entities'
import { initActionKeys } from './action-keys'
import { loadSocialSystems } from './social'
import { initBuildingAccessGate } from './access-gate'
import { initStandaloneZoneGate } from './access-gate/zone-gate'
import { initZoneEntryCards } from './social/zone-entry-card'
import { freshnessSystem, markPreviewScene } from './social/freshness-line'
import { announcementSystem } from './social/announcement-banner'
import { initLiveEventsBoard } from './live-events'
import { initFlightHighway } from './train'
import { initHudRoot } from './hud-root'
import { endGateBootPending, primeBootCover, primeGateArrival } from './plugins/gate'
import { primeArrival } from './arrival'
import { primeWorldSession } from './world-session'
import { markBootFloorSceneReady, primeBootFloor } from './boot-floor'
import { ensureLandingCover, markLandingWorldBootComplete } from './plugins/landing'
import { normalizeSocialSurfaceConfig } from '@shared/social-surface-contract'
import { setSpeakeasyRefresh } from './speakeasy/state'
import { refreshHostUi } from './social/host-ui'
import { loadChurchMcpPreview } from './church-preview'
import { loadSiteGround } from './site-ground'
import { loadTerrain } from './terrain'
import { loadGroundScatter } from './ground-scatter'
import { loadSeating } from './seating'
import { initInteriorLights } from './effects/interior-lights'

void PunchServerPulse

const CONFIG_FILE = 'assets/building-config.json'

/** Set true to preview the Blender MCP church locally instead of Frame Kit building. */
const CHURCH_MCP_PREVIEW = false

function decodeUtf8(bytes: Uint8Array): string {
  const g = globalThis as { TextDecoder?: new () => { decode(b: Uint8Array): string } }
  if (typeof g.TextDecoder !== 'undefined') return new g.TextDecoder().decode(bytes)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  try {
    return decodeURIComponent(escape(s))
  } catch {
    return s
  }
}

/**
 * Read the DEPLOYED building-config.json at runtime.
 *
 * CRITICAL: `import config from './building-config.json'` INLINES the committed
 * dev config into bin/index.js at bundle time — so the runtime ignored the fresh
 * config every browser publish deploys and always ran the frozen dev fixture
 * (small placeholder screen, stale stamp). That single bug caused the entire
 * "screen is small / preview / wrong place" saga. We read the actual deployed
 * file at runtime so per-publish config finally takes effect.
 *
 * Two runtime read paths, because `readFile` throws in some explorer builds even
 * when the file IS in the content mapping (that dropped us onto the inlined
 * preview fixture → phantom "PREVIEW / small screen"). If readFile fails we fall
 * back to fetching the file straight off the content server using the scene's own
 * baseUrl + content hash from getSceneInformation() (USE_FETCH is granted). The
 * inlined import is the LAST resort only — it carries previewFixture, so it must
 * never win in production.
 */
/**
 * Neither runtime read had a deadline, and that is what welded the arrival
 * cover to the screen. `readFile` and the content-server `fetch` can both hang
 * indefinitely on a cold or unhealthy catalyst; `await loadDeployedConfig()`
 * then never resolves, so NOTHING after it runs — no geometry, no name for the
 * cover, and not even the `finally` that releases the boot hold. The visitor
 * sits on a black screen with a bar stopped at its time-only floor.
 *
 * A read that has not answered in this long is not going to. Give up on it,
 * try the next path, and let the inlined config be the last resort it was
 * always designed to be. Slow-but-alive still wins: this is a deadline, not a
 * retry budget.
 */
const CONFIG_READ_TIMEOUT_MS = 6000

function withTimeout<T>(work: Promise<T>, label: string): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    let settled = false
    const done = (value: T | null): void => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => {
      console.log(`[config] ${label} timed out after ${CONFIG_READ_TIMEOUT_MS}ms — moving on`)
      done(null)
    }, CONFIG_READ_TIMEOUT_MS)
    work.then(
      (value) => {
        clearTimeout(timer)
        done(value)
      },
      (error) => {
        clearTimeout(timer)
        console.log(`[config] ${label} rejected:`, error)
        done(null)
      }
    )
  })
}

async function loadViaReadFile(): Promise<Record<string, unknown> | null> {
  try {
    const res = await readFile({ fileName: CONFIG_FILE })
    return JSON.parse(decodeUtf8(res.content)) as Record<string, unknown>
  } catch (e) {
    console.log(`[config] readFile("${CONFIG_FILE}") failed:`, e)
    return null
  }
}

async function loadViaSceneFetch(): Promise<Record<string, unknown> | null> {
  try {
    const info = await getSceneInformation({})
    const entry = info.content.find(
      (c) => c.file === CONFIG_FILE || c.file.toLowerCase() === CONFIG_FILE
    )
    if (!entry) {
      console.log(`[config] ${CONFIG_FILE} not in content mapping`)
      return null
    }
    const base = info.baseUrl.endsWith('/') ? info.baseUrl : info.baseUrl + '/'
    const r = await fetch(base + entry.hash)
    if (!r.ok) {
      console.log(`[config] fetch(${base + entry.hash}) → ${r.status}`)
      return null
    }
    return (await r.json()) as Record<string, unknown>
  } catch (e) {
    console.log('[config] getSceneInformation/fetch failed:', e)
    return null
  }
}

async function loadDeployedConfig(): Promise<{ raw: Record<string, unknown>; source: string }> {
  const viaReadFile = await withTimeout(loadViaReadFile(), 'readFile')
  if (viaReadFile) return { raw: viaReadFile, source: 'readFile' }

  const viaFetch = await withTimeout(loadViaSceneFetch(), 'scene-fetch')
  if (viaFetch) return { raw: viaFetch, source: 'scene-fetch' }

  console.log('[config] BOTH runtime reads failed — using inlined fallback (dev fixture)')
  return { raw: inlinedBuildingConfig as Record<string, unknown>, source: 'inlined-fallback' }
}


/** The server's whole life: read the deployed config, host the round. */
async function runPunchServer(): Promise<void> {
  try {
    const { raw, source } = await loadDeployedConfig()
    console.log(`[SERVER] config loaded from ${source}`)
    const config = parseSceneRuntimeConfig(raw)
    const { startPunchServer } = await import('./plugins/punch-server-boot')
    const hosted = startPunchServer({ config })
    console.log(hosted > 0 ? `[SERVER] hosting ${hosted} punch machine(s)` : '[SERVER] no punch_machine here')
  } catch (error) {
    console.error('[SERVER] punch server failed to boot: ' + String(error))
  }
}

export function main() {
  // THE FORK. Everything below is a CLIENT: the lines under this build UI and
  // talk to the Explorer, and startScenePlugins constructs MessageBus instances
  // that throw on the server.
  if (isServer()) {
    // A headless server never renders and must never wait on GLTF downloads.
    // Entities created by main.crdt or composites with GltfContainer stay in
    // LoadingState.LOADING in headless Babylon, which trips Hammurabi's 60s
    // async-turn watchdog on onStart and kills the isolate.
    for (const [entity] of engine.getEntitiesWith(GltfContainer)) {
      GltfContainer.deleteFrom(entity)
    }
    void runPunchServer()
    return
  }

  // ‼️FRAME 0, AND THAT IS THE WHOLE POINT OF THIS BLOCK.
  //
  // Everything in `run()` sits behind `await loadDeployedConfig()` — a
  // `readFile` with a `getSceneInformation` + `fetch` fallback. For the length
  // of that round-trip the scene had no colliders, no cover and no HUD, while
  // the Explorer had already put the visitor in the world and started gravity.
  // In a World, where there is no Genesis terrain underneath, that is a fall
  // into nothing; the punch island's arrival catch then teleported them back,
  // which is what reads as "I start on the ground and get relocated".
  //
  // These four lines take no config by design. Do not move them into `run()`,
  // and do not give any of them an argument that has to be fetched.
  //
  // primeArrival() is the one that decides WHERE the visitor belongs: it reads
  // this scene's own default spawn point out of the Explorer's copy of the
  // scene.json (a local RPC, not a content-server read) and puts them back on
  // it while both covers are still up. The pad below only stops the fall; on a
  // sky island, stopping a fall forty metres down is not an arrival.
  initHudRoot()
  primeBootCover()
  primeBootFloor()
  primeArrival()
  primeWorldSession()
  void (async () => {
    try {
      await run()
    } finally {
      // Runs for a failed boot and for the preview early-return too — neither
      // may leave the cover welded up or the pad standing.
      endGateBootPending()
      markBootFloorSceneReady()
    }
  })()
}

/**
 * Run one boot step so a failure in it cannot take down every step after it.
 *
 * Scene boot was a straight sequence: geometry, HUD, flight, smart entities, social,
 * gates, gallery, teleporters. One throw anywhere killed the entire remainder — and the
 * parts that had ALREADY run kept rendering, so the scene looked alive. That is how a
 * world showed its towers and HUD while having no jump pads, no NPCs, no gallery and a
 * permanent "published: unknown" (the freshness line reads the runtime context, which is
 * installed by `loadSocialSystems` — one step AFTER the smart-entity pass). The owner
 * republished dozens of times against a scene whose boot had stopped a third of the way
 * in, with nothing on screen to say so.
 *
 * Each step is isolated and named. A failure now costs exactly that feature and prints
 * which one, instead of silently amputating the rest of the scene.
 */
function bootStep(label: string, run: () => void): void {
  try {
    run()
  } catch (error) {
    console.log(
      `[boot] "${label}" FAILED — the rest of the scene still loads. ` +
        `${error instanceof Error ? error.message : String(error)}`
    )
  }
}

async function run() {
  if (CHURCH_MCP_PREVIEW) {
    loadChurchMcpPreview()
    return
  }

  const { raw, source } = await loadDeployedConfig()
  console.log(`[config] loaded from ${source}`)

  let config = parseSceneRuntimeConfig(raw)

  // previewFixture is a LOCAL-DEV flag: the committed dev config sets it so
  // `npm run start` gets a social sandbox. Real browser publishes generate their
  // own config WITHOUT it, so the fixture can't reach production. (And the guard
  // in scripts/publish blocks CLI-deploying a previewFixture config.)
  if (raw.previewFixture === true) {
    config = applySocialPreviewFixture(config)
    markPreviewScene()
    console.log('[preview] social fixture applied (previewFixture flag set)')
  }

  // HTTPS live wire BEFORE any machine is built. The setter is captured at
  // network start; late is the same as never. Empty board config keeps the
  // explorer MessageBus (solo play, or a scene with no store).
  bootStep('punch live wire', () => {
    const social = normalizeSocialSurfaceConfig(config.social)
    const board = social.apps.punchMachine.boardStore
    if (!social.apps.punchMachine.enabled || !punchLiveEnabled(board)) return
    const bus = createPunchHttpBus({ config: board })
    setPunchAuthority({ authority: 'coordinator', serverId: '', bus })
    startPunchHttpPolling(bus)
    console.log('[punch] live wire http')
  })

  // FIRST, ahead of every heavy step. The cover is on screen RIGHT NOW wearing
  // no name, and the config in hand is the only thing that knows one. This used
  // to sit seven steps down — after building geometry, terrain, site ground,
  // ground cover, seating and the landing cover — so the nameless window lasted
  // for the whole GLB pass instead of the network read. Naming the hold touches
  // no geometry; there is no reason for it to wait behind any of it.
  bootStep('gate', () => primeGateArrival(config))

  bootStep('building geometry', () => loadBuilding(config))
  // Plot-centred paving that wins against DCL's y=0 terrain. Must not live only in
  // the primary GLB: that mesh loses polygonOffset on export, and a tower off-centre
  // used to slide the plane off the plot.
  bootStep('terrain', () => loadTerrain(config))
  bootStep('site ground', () => loadSiteGround(config))
  // Ground cover sits ON the paving, so it boots straight after it. Each layer's model
  // ships once and every copy is a GltfContainer pointing at that one file.
  bootStep('ground cover', () => loadGroundScatter(config))
  bootStep('seating', () => loadSeating(config))
  bootStep('landing cover', () =>
    ensureLandingCover(normalizeSocialSurfaceConfig(config.social, config.buildingName), {
      spawnX: config.spawn.x,
      spawnZ: config.spawn.z,
      cols: config.scene.cols,
      rows: config.scene.rows,
    }),
  )
  bootStep('speakeasy refresh', () => setSpeakeasyRefresh(refreshHostUi))
  // World-space E/F catcher — must exist before scrap or vehicles bind listeners.
  bootStep('action keys', () => initActionKeys())
  let smartHandles: SmartEntityHandle[] = []
  bootStep('smart entities (jump pads, screens, doors)', () => {
    smartHandles = loadSmartEntities(config)
  })
  // MUST NOT depend on the step above surviving: this installs the runtime context that
  // the freshness line, zones and the whole NPC layer read.
  bootStep('social + NPCs', () => loadSocialSystems(config, smartHandles))
  bootStep('zone entry cards', () => initZoneEntryCards())
  // Step 1 "Access" gate (LAND-compatible, venue-off). No-op when the building is
  // open or when the full Social venue is enabled (it ships its own gate barriers).
  bootStep('building access gate', () => initBuildingAccessGate(config))
  // Per-zone rules (Zones tab) enforced venue-off, like the building gate above.
  bootStep('zone gate', () => initStandaloneZoneGate(config))
  bootStep('live events board', () => {
    if (config.liveEventsBoard?.enabled) initLiveEventsBoard(config.liveEventsBoard)
  })
  // Real lamps for every lit floor. Cheap when nothing is lit, and it must run before
  // the player can walk anywhere — an unlit landing spot is the first thing seen.
  bootStep('interior lights', () => initInteriorLights(config))
  bootStep('flight highway', () => initFlightHighway(config))
  // The floor picker is a HUD control, not an object: walk into any tower and a FLOORS
  // chip offers every level. It replaces the blue ramp pads that used to stand on each
  // landing — the last interior traversal objects left in a building.
  bootStep('floor directory', () => initFloorDirectory(config))
  engine.addSystem(freshnessSystem)
  engine.addSystem(announcementSystem)

  console.log(`Frame Kit scene loaded: ${config.buildingName}`)
  console.log(`Build stamp: ${config.syncedAt ?? 'unknown'}`)
  console.log(
    `Spawn (${config.spawn.preset}): ${config.spawn.x.toFixed(1)}, ${config.spawn.y.toFixed(1)}, ${config.spawn.z.toFixed(1)}`
  )
  if (config.social?.enabled) {
    const admins = config.social.event.adminWallets ?? []
    console.log(
      `Surface 4 Social: ${config.social.event.name} · admins=${admins.length ? admins.join(',') : '(none — any signed-in player can open HOST)'}`
    )
  } else {
    console.log('Surface 4 Social: disabled or missing from building-config — no HOST button')
  }

  // Snapshot the core arrival assets only after every synchronous boot step had
  // a chance to create its GLBs. Landing reads their renderer-owned loading
  // states and offers ENTER when a strong majority is terminal.
  markLandingWorldBootComplete()
}
