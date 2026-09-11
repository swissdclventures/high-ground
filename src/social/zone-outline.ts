/**
 * Draws a zone boundary as a faint dotted ring that ONLY an admin wallet can see.
 *
 * This replaced the filled discs that used to sit under every support zone. Those
 * discs were authoring aids leaking into the world: a visitor arriving at the venue
 * saw a glowing circle painted on the plaza with no way to know what it meant, and
 * no way to turn it off. Zones are drawn on the editor's plan view; in-world they are
 * a hint for whoever is running the place, and nothing at all for everybody else.
 *
 * Two details worth keeping:
 *   - Entities are created HIDDEN and only revealed once the local wallet resolves as
 *     an admin. Player identity is not available on frame 1, so gating at creation
 *     time would flash the ring at guests (or hide it from the owner forever).
 *   - Visibility is re-checked on a slow tick rather than latched, for the same reason.
 */
import {
  engine,
  MeshRenderer,
  Material,
  Transform,
  VisibilityComponent,
  type Entity
} from '@dcl/sdk/ecs'
import { Vector3, Color3, Color4 } from '@dcl/sdk/math'
import {
  ZONE_OUTLINE_DOT_M,
  ZONE_OUTLINE_DOT_THICK_M,
  ZONE_OUTLINE_LIFT_M,
  zoneOutlineDots,
  type ZoneOutlineShape
} from '@shared/zone-outline'
import type { RuntimeFloorZone } from '@shared/scene-runtime-config'
// zoneCenterScene is generic zone math that happens to live in dance/ for historical
// reasons (the dance floor was the first zone). Importing it beats duplicating the
// origin + floor-Y resolution, which is exactly where zone placement bugs come from.
import { zoneCenterScene } from '../dance/zones'
import { isAdmin } from './player'
import { getRuntimeContext, getRuntimeFloorZones } from './runtime-context'

const dots: Entity[] = []
let systemRegistered = false
let shown: boolean | null = null
let sinceCheck = 0

/** ~1 s is plenty: nobody's admin status changes mid-session, we're only waiting
 *  for the identity to arrive. */
const CHECK_EVERY_S = 1

function localPlayerIsAdmin(): boolean {
  const social = getRuntimeContext()?.social
  if (!social) return false
  try {
    return isAdmin(social)
  } catch {
    return false
  }
}

function visibilitySystem(dt: number): void {
  sinceCheck += dt
  if (sinceCheck < CHECK_EVERY_S) return
  sinceCheck = 0
  const visible = localPlayerIsAdmin()
  if (visible === shown) return
  shown = visible
  for (const dot of dots) VisibilityComponent.createOrReplace(dot, { visible })
}

/**
 * Add an admin-only outline for one zone. `center` is scene-space (use
 * dance/zones.ts zoneCenterScene for an authored zone); `shape` is its size.
 */
export function addZoneOutline(
  center: { x: number; y: number; z: number },
  shape: ZoneOutlineShape
): void {
  for (const offset of zoneOutlineDots(shape)) {
    const dot = engine.addEntity()
    Transform.create(dot, {
      position: Vector3.create(
        center.x + offset.x,
        center.y + ZONE_OUTLINE_LIFT_M,
        center.z + offset.z
      ),
      scale: Vector3.create(ZONE_OUTLINE_DOT_M, ZONE_OUTLINE_DOT_THICK_M, ZONE_OUTLINE_DOT_M)
    })
    MeshRenderer.setBox(dot)
    Material.setPbrMaterial(dot, {
      albedoColor: Color4.create(0.62, 0.86, 1, 0.55),
      emissiveColor: Color3.create(0.3, 0.6, 0.85),
      emissiveIntensity: 0.8,
      metallic: 0,
      roughness: 1
    })
    // Hidden until proven admin — a guest must never see this, not even for a frame.
    VisibilityComponent.create(dot, { visible: false })
    dots.push(dot)
  }
  if (!systemRegistered) {
    systemRegistered = true
    engine.addSystem(visibilitySystem)
  }
}

/** Size-only view of a zone — the outline needs the extent, not the position. */
export function zoneOutlineShape(zone: RuntimeFloorZone): ZoneOutlineShape {
  return zone.shape.kind === 'circle'
    ? { kind: 'circle', radius: zone.shape.radius }
    : { kind: 'rect', width: zone.shape.width, depth: zone.shape.depth }
}

/**
 * Outline EVERY authored zone for admins.
 *
 * One pass over the published zones, so a plain zone (an entry area, a VIP region) gets
 * the same hint as the dance set — previously only the dance floor and the Speakeasy
 * circle drew anything, which meant the rest of the owner's zones were invisible to
 * them in-world with no way to check placement.
 */
export function initZoneOutlines(): void {
  for (const zone of getRuntimeFloorZones()) {
    addZoneOutline(zoneCenterScene(zone), zoneOutlineShape(zone))
  }
}
