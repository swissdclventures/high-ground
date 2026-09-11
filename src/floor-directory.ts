/**
 * The in-world floor picker — a HUD control, not an object.
 *
 * Walk into any multi-storey building and its full floor directory opens in the corner.
 * Pick a level and one `movePlayerTo` puts you there — same spot in plan, different
 * height, straight through the slabs. Step back outside and the directory goes away.
 *
 * ★Why there is nothing to see in-world: a building contains no traversal objects
 * (see `resolveLaunchPads` in shared/traversal.ts). Three generations of interior
 * traversal — the elevator with its drilled shaft, the auto-fire hop stack, the picker
 * pad column — were all rejected because a shaft or a column of glowing pads is not
 * architecture, and because every one of them broke the moment the building changed
 * shape. This version has no geometry at all, so there is no shape it can break against.
 *
 * PADS ARE NOT THIS. A pad is a catapult: an authored object on the plot that throws you
 * across it or into the air, walk-on, one fixed target. It has nothing to do with picking
 * a floor, and this module places none.
 *
 * The data comes baked from publish (`floorDirectories`), because the runtime is handed
 * one building config and eighteen anonymous GLBs — see shared/floor-directory.ts.
 */
import { engine, Transform } from '@dcl/sdk/ecs'
import { movePlayerTo } from '~system/RestrictedActions'
import {
  buildingAtPosition,
  currentStopIndex,
  type BuildingFloorPlan,
  type FloorStop,
} from '@shared/floor-directory'
import type { SceneRuntimeConfig } from './assets/building-config'
import { canAccessFloor, floorGateDeniedMessage } from './social/zone-gates'
import { getConfiguredSocialConfig } from './social/config'

let plans: BuildingFloorPlan[] = []
let inside: BuildingFloorPlan | null = null
let currentIndex = -1
let panelOpen = false
/** Set while a floor change is in flight, so a double-click cannot fire two teleports. */
let moving = false
let denied: { message: string; secondsLeft: number } | null = null

/** Position is polled, not watched: 4 Hz is far below the rate a player can cross a wall. */
const POLL_S = 0.25
let sincePoll = POLL_S

export interface FloorDirectoryView {
  buildingId: string
  /** Directory code (A1, B3 …) — shown on the chip now that no plate is baked on the wall. */
  code?: string
  stops: FloorStop[]
  /** Index of the level the player is standing on, or -1 between levels (mid-fall). */
  currentIndex: number
  open: boolean
  denied: string | null
}

/** What the HUD should draw this frame, or null when the player is outside every building. */
export function activeFloorDirectory(): FloorDirectoryView | null {
  if (!inside) return null
  return {
    buildingId: inside.buildingId,
    code: inside.code,
    stops: inside.stops,
    currentIndex,
    open: panelOpen,
    denied: denied?.message ?? null,
  }
}

export function toggleFloorPanel(): void {
  panelOpen = !panelOpen
}

export function closeFloorPanel(): void {
  panelOpen = false
}

/**
 * Go to a level.
 *
 * You keep your X/Z: arriving where you already stood, one floor up, is the only landing
 * that never surprises. Teleporting to the building centre reads as being shoved, and on
 * an atrium plan the centre is a hole.
 *
 * `+0.1` clears the slab — `movePlayerTo` places feet exactly, and exactly is where the
 * Explorer's ground check can decide you are inside the floor and drop you through it.
 */
export function goToFloor(stop: FloorStop): void {
  if (!inside || moving) return
  const p = Transform.getOrNull(engine.PlayerEntity)
  if (!p) return
  const floorIndex = stop.level === 'roof' ? inside.stops.length - 1 : stop.level
  const social = getConfiguredSocialConfig()
  if (social && !canAccessFloor(floorIndex, social)) {
    // The gate is the same one the zone system enforces — a floor locked to a token
    // holder stays locked whether you walk, fly or pick it off a list.
    denied = { message: floorGateDeniedMessage(floorIndex), secondsLeft: 4 }
    return
  }
  denied = null
  moving = true
  // ★The directory STAYS OPEN through the ride (owner, 2026-08-24): arriving on floor 12
  // is not a reason to take the other nineteen floors away. A guest who wants the screen
  // back closes it with the ✕; nothing else ever collapses it.
  // `await` inside an async wrapper, never `.then()` on a ~system call: the RPC binding is not
  // guaranteed to be a native Promise in every Explorer build (see dance/scene-emotes.ts).
  void carryToFloor(p.position.x, stop.y + 0.1, p.position.z)
}

async function carryToFloor(x: number, y: number, z: number): Promise<void> {
  try {
    await movePlayerTo({ newRelativePosition: { x, y, z } })
  } catch {
    /* the ride is over either way */
  } finally {
    moving = false
  }
}

/**
 * Track which building the player is in.
 *
 * The panel closes on exit rather than following the player out: an open floor list for
 * a building you left is a control that lies about what it does.
 */
function floorDirectorySystem(dt: number): void {
  if (denied) {
    denied.secondsLeft -= dt
    if (denied.secondsLeft <= 0) denied = null
  }
  sincePoll += dt
  if (sincePoll < POLL_S) return
  sincePoll = 0
  if (!plans.length) return
  const p = Transform.getOrNull(engine.PlayerEntity)
  if (!p) return
  const next = buildingAtPosition(plans, p.position.x, p.position.y, p.position.z)
  if (next !== inside) {
    inside = next
    // Entering a building is the trigger: the directory must be useful before the guest
    // knows there is a separate control to click. A closed directory stays closed only
    // until they leave; walking into this or another building opens that building's list.
    panelOpen = next !== null
    denied = null
  }
  currentIndex = inside ? currentStopIndex(inside.stops, p.position.y) : -1
}

export function initFloorDirectory(config: SceneRuntimeConfig): void {
  plans = config.floorDirectories ?? []
  inside = null
  currentIndex = -1
  panelOpen = false
  moving = false
  if (!plans.length) return
  engine.addSystem(floorDirectorySystem)
}

/** Test seam — the system is position-driven and otherwise unobservable. */
export function __setFloorDirectoryPlansForTest(next: BuildingFloorPlan[]): void {
  plans = next
  inside = null
  currentIndex = -1
  panelOpen = false
}
