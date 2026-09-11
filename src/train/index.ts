/**
 * World highway runtime — a night-road strip across the map.
 *
 * The train-era cars and station pads are retired. The strip renders as a
 * dark deck, emissive edge lines, centre dashes, and light gates. On-foot
 * Superman flight used to boost along this axis; that controller is gone, so
 * the strip is walkable ground, not a flyway.
 *
 * Config compatibility: this still reads `social.apps.train` — saved corridor
 * drafts keep working; the runtime just interprets them as a highway.
 */

import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  TextShape,
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import type { SceneRuntimeConfig } from '@shared/scene-runtime-config'
import {
  HIGHWAY_DASH_LENGTH_M,
  HIGHWAY_DASH_SPACING_M,
  HIGHWAY_GATE_SPACING_M,
  HIGHWAY_LANE_WIDTH_M,
  normalizeTrainCorridorConfig,
  trainCorridorMetrics,
} from '@shared/train-corridor-contract'

/** Entity budget guards for very long strips (301 parcels ≈ 4.8 km). */
const MAX_DASHES = 220
const MAX_GATES = 60

function box(
  parent: Entity | null,
  position: Vector3,
  scale: Vector3,
  color: Color4,
  emissive?: { color: Color3; intensity: number },
  collider = false
): Entity {
  const e = engine.addEntity()
  Transform.create(e, {
    parent: parent ?? undefined,
    position,
    scale,
    rotation: Quaternion.Identity(),
  })
  MeshRenderer.setBox(e)
  if (collider) MeshCollider.setBox(e)
  Material.setPbrMaterial(e, {
    albedoColor: color,
    roughness: emissive ? 0.3 : 0.6,
    metallic: 0.1,
    ...(emissive
      ? { emissiveColor: emissive.color, emissiveIntensity: emissive.intensity }
      : {}),
  })
  return e
}

function labelAt(position: Vector3, text: string, yawDeg: number): void {
  const e = engine.addEntity()
  Transform.create(e, {
    position,
    scale: Vector3.create(1.6, 1.6, 1.6),
    rotation: Quaternion.fromEulerDegrees(0, yawDeg, 0),
  })
  TextShape.create(e, {
    text,
    fontSize: 3,
    textColor: Color4.create(0.55, 0.95, 1, 1),
  })
}

export function initFlightHighway(config: SceneRuntimeConfig): void {
  const train = normalizeTrainCorridorConfig(config.social?.apps?.train)
  if (!train.enabled) return

  const layout = { cols: config.scene.cols, rows: config.scene.rows }
  const m = trainCorridorMetrics(layout, train)
  const alongX = m.axis === 'x'

  const asphalt = Color4.create(0.07, 0.075, 0.095, 1)
  const edgeGlow = Color4.create(0.1, 0.85, 1, 1)
  const edgeEmissive = { color: Color3.create(0.1, 0.85, 1), intensity: 4 }
  const dashGlow = Color4.create(1, 0.8, 0.25, 1)
  const dashEmissive = { color: Color3.create(1, 0.8, 0.25), intensity: 3 }
  const gateGlow = Color4.create(0.85, 0.3, 1, 1)
  const gateEmissive = { color: Color3.create(0.85, 0.3, 1), intensity: 4 }
  const pylonColor = Color4.create(0.13, 0.14, 0.18, 1)

  const root = engine.addEntity()
  Transform.create(root, { position: Vector3.Zero() })

  const midX = m.width / 2
  const midZ = m.depth / 2
  const span = alongX ? m.width : m.depth
  const half = HIGHWAY_LANE_WIDTH_M / 2
  const runScale = (thickness: number, height: number, length = span): Vector3 =>
    alongX
      ? Vector3.create(length, height, thickness)
      : Vector3.create(thickness, height, length)
  // A point `d` metres along the strip, `offset` metres across it.
  const at = (d: number, offset: number, y: number): Vector3 =>
    alongX
      ? Vector3.create(d, y, midZ + offset)
      : Vector3.create(midX + offset, y, d)

  // Road deck, full span, with a collider so the strip is solid ground.
  const deck = box(root, at(span / 2, 0, m.y - 0.06), runScale(HIGHWAY_LANE_WIDTH_M, 0.12), asphalt, undefined, true)

  // Emissive edge lines — continuous, full length.
  for (const side of [-1, 1]) {
    box(root, at(span / 2, side * (half - 0.3), m.y + 0.04), runScale(0.4, 0.08), edgeGlow, edgeEmissive)
  }

  // Centre dashes between the strip ends.
  const dashCount = Math.min(MAX_DASHES, Math.floor(m.length / HIGHWAY_DASH_SPACING_M))
  const dashStep = dashCount > 0 ? m.length / dashCount : 0
  const startD = alongX ? m.start.x : m.start.z
  for (let i = 0; i < dashCount; i += 1) {
    const d = startD + dashStep * (i + 0.5)
    box(root, at(d, 0, m.y + 0.04), runScale(0.5, 0.06, HIGHWAY_DASH_LENGTH_M), dashGlow, dashEmissive)
  }

  // Light gates: pylon pair + glowing overhead beam. Their regular spacing is what
  // makes 45–80 m/s READ as fast; without them the deck is a featureless blur.
  const gateCount = Math.min(MAX_GATES, Math.floor(m.length / HIGHWAY_GATE_SPACING_M))
  const gateStep = gateCount > 0 ? m.length / (gateCount + 1) : 0
  const gateHeight = 7
  for (let i = 1; i <= gateCount; i += 1) {
    const d = startD + gateStep * i
    for (const side of [-1, 1]) {
      box(root, at(d, side * (half + 0.6), gateHeight / 2), Vector3.create(0.45, gateHeight, 0.45), pylonColor)
    }
    box(root, at(d, 0, gateHeight + 0.2), runScale(HIGHWAY_LANE_WIDTH_M + 2.1, 0.4, 0.4), gateGlow, gateEmissive)
  }

  // End boards face the person walking onto the strip (default TextShape faces -Z).
  const boardText = 'HIGHWAY'
  const endD = alongX ? m.end.x : m.end.z
  const inwardYaw = alongX ? 90 : 0
  labelAt(at(startD + 2, 0, m.y + 3.4), boardText, inwardYaw)
  labelAt(at(endD - 2, 0, m.y + 3.4), boardText, inwardYaw + 180)

  console.log(
    `[highway] ${layout.cols}x${layout.rows} axis=${m.axis} length=${Math.round(m.length)}m ` +
      `gates=${gateCount} dashes=${dashCount}`
  )
}
