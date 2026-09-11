/**
 * Vehicle hull — GLB craft (Eclipse coupe, Metaverse Cadillac, …) or primitive hover-pod.
 *
 * Local space: origin on the hover plane, front = +Z.
 */
import {
  MaterialTransparencyMode,
  ParticleSystem,
  engine,
  Entity,
  GltfContainer,
  Material,
  MeshCollider,
  MeshRenderer,
  Transform,
  ColliderLayer,
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { HOVER_POD, glbVehicleProfile, vehicleSeatLocals, type VehicleSeatId, type VehicleSpec } from '@shared/vehicle-contract'

const glowDiscs = new Map<string, { entity: Entity; base: number }>()
const plumes = new Map<Entity, Entity>()

const SHELL = Color4.create(0.12, 0.14, 0.18, 1)
const TRIM = Color4.create(0.62, 0.66, 0.72, 1)
const GLASS = Color4.create(0.35, 0.78, 0.95, 0.35)
const ENGINE = Color4.create(0.2, 0.95, 1, 1)

function paint(entity: Entity, color: Color4, metallic = 0.55, roughness = 0.28, emissive = 0): void {
  Material.setPbrMaterial(entity, {
    albedoColor: color,
    metallic,
    roughness,
    ...(emissive > 0
      ? {
          emissiveColor: Color3.create(color.r, color.g, color.b),
          emissiveIntensity: emissive,
        }
      : {}),
  })
}

function box(
  parent: Entity,
  position: Vector3,
  scale: Vector3,
  color: Color4,
  opts?: { metallic?: number; roughness?: number; emissive?: number }
): Entity {
  const e = engine.addEntity()
  Transform.create(e, {
    parent,
    position,
    scale,
    rotation: Quaternion.Identity(),
  })
  MeshRenderer.setBox(e)
  paint(e, color, opts?.metallic ?? 0.55, opts?.roughness ?? 0.28, opts?.emissive ?? 0)
  return e
}

/**
 * Invisible PHYSICS deck under one seat — same idea as the Neon Glider deck.
 */
function seatFloor(parent: Entity, seat: { x: number; y: number; z: number }): Entity {
  const floor = engine.addEntity()
  Transform.create(floor, {
    parent,
    position: Vector3.create(seat.x, seat.y - 0.06, seat.z),
    scale: Vector3.create(0.95, 0.12, 0.95),
  })
  MeshCollider.setBox(floor, ColliderLayer.CL_PHYSICS)
  return floor
}

/** Per-seat click volume, sized to poke out of the door line. */
function seatPad(parent: Entity, seat: { x: number; y: number; z: number }): Entity {
  const pad = engine.addEntity()
  Transform.create(pad, {
    parent,
    position: Vector3.create(seat.x, seat.y + 0.55, seat.z),
    scale: Vector3.create(1.35, 1.15, 1.05),
  })
  MeshCollider.setBox(pad, ColliderLayer.CL_POINTER)
  return pad
}

/**
 * Click-the-car volume wrapping the whole hull so a click on the bodywork
 * boards a seat instead of falling through physics into empty air.
 */
function cabinCatcher(parent: Entity, spec: VehicleSpec): Entity {
  const size = spec.hull.kind === 'glb' ? glbVehicleProfile(spec.hull.src) : HOVER_POD
  const catcher = engine.addEntity()
  Transform.create(catcher, {
    parent,
    position: Vector3.create(0, size.height * 0.55, 0),
    scale: Vector3.create(size.width + 0.25, size.height + 0.45, size.length + 0.25),
  })
  MeshCollider.setBox(catcher, ColliderLayer.CL_POINTER)
  return catcher
}

function hoverGlow(root: Entity, spec: VehicleSpec): void {
  const size = spec.hull.kind === 'glb' ? glbVehicleProfile(spec.hull.src) : HOVER_POD
  const cadillac = spec.hull.kind === 'glb' && spec.hull.src.includes('cadillac')
  const e = engine.addEntity()
  Transform.create(e, {
    parent: root,
    position: Vector3.create(0, -spec.hoverY + 0.03, 0),
    scale: Vector3.create(size.width * 2.2, size.length * 1.5, 1),
    rotation: Quaternion.fromEulerDegrees(90, 0, 0),
  })
  MeshRenderer.setPlane(e)
  // Cadillac: cyan hover wash (reference). Eclipse keeps the cooler blue wash.
  const glow = cadillac
    ? { r: 0, g: 0.9, b: 1, intensity: 2.2 }
    : { r: 0.55, g: 0.75, b: 1, intensity: 1.6 }
  Material.setPbrMaterial(e, {
    texture: Material.Texture.Common({ src: 'images/glow.png' }),
    alphaTexture: Material.Texture.Common({ src: 'images/glow.png' }),
    emissiveTexture: Material.Texture.Common({ src: 'images/glow.png' }),
    emissiveColor: Color3.create(glow.r, glow.g, glow.b),
    emissiveIntensity: glow.intensity,
    albedoColor: Color4.create(glow.r, glow.g, glow.b, 0.5),
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
    metallic: 0,
    roughness: 1,
  })
  glowDiscs.set(`${root}:0`, { entity: e, base: glow.intensity })

  const plume = engine.addEntity()
  Transform.create(plume, {
    parent: root,
    position: Vector3.create(0, 0.35, -size.length * 0.5),
  })
  // Never pink on the Cadillac — thrusters are cyan propulsion, not magenta wheels.
  const plumeStart = cadillac
    ? Color4.create(0, 0.9, 1, 0.65)
    : Color4.create(0.85, 0.7, 1, 0.55)
  const plumeEnd = cadillac ? Color4.create(0, 0.55, 0.85, 0) : Color4.create(0.5, 0.75, 1, 0)
  ParticleSystem.createOrReplace(plume, {
    active: false,
    rate: 120,
    maxParticles: 200,
    lifetime: 0.9,
    gravity: -0.15,
    additionalForce: Vector3.create(0, 0.6, -6),
    initialVelocitySpeed: { start: 0, end: 0 },
    initialSize: { start: 0.5, end: 1.9 },
    sizeOverTime: { start: 1, end: 1.7 },
    initialColor: {
      start: plumeStart,
      end: plumeEnd,
    },
    texture: { src: 'images/fx-particle-smoke.png' },
  })
  plumes.set(root, plume)
}

export function setBoostPlume(root: Entity, on: boolean): void {
  const plume = plumes.get(root)
  if (plume === undefined) return
  const ps = ParticleSystem.getMutableOrNull(plume)
  if (ps) ps.active = on
}

export function setHoverGlow(root: Entity, occupied: boolean): void {
  for (const key of [`${root}:0`]) {
    const disc = glowDiscs.get(key)
    if (disc) disc.base = occupied ? 3.4 : 1.6
  }
}

export function pulseHoverGlow(elapsed: number): void {
  const wave = 1 + Math.sin(elapsed * 1.9) * 0.14
  for (const disc of glowDiscs.values()) {
    const material = Material.getMutableOrNull(disc.entity)
    if (material?.material?.$case === 'pbr') material.material.pbr.emissiveIntensity = disc.base * wave
  }
}

export function buildVehicleHull(root: Entity, spec: VehicleSpec): { entity: Entity; seatId: VehicleSeatId }[] {
  if (spec.hull.kind === 'glb') {
    const hull = engine.addEntity()
    // Explorer faces these GLBs opposite drive (+Z). Yaw the mesh 180° so the grille leads.
    const yawMesh = spec.hull.src.includes('cadillac')
      ? Quaternion.fromEulerDegrees(0, 180, 0)
      : Quaternion.Identity()
    Transform.create(hull, { parent: root, position: Vector3.Zero(), rotation: yawMesh })
    GltfContainer.create(hull, {
      src: spec.hull.src,
      visibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
      invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    })
    hoverGlow(root, spec)
    return buildVehicleSeats(root, spec)
  }

  box(root, Vector3.create(0, 0.42, 0), Vector3.create(2.05, 0.55, 3.6), SHELL)
  box(root, Vector3.create(0, 0.48, 1.55), Vector3.create(1.45, 0.38, 1.35), SHELL, { metallic: 0.7 })
  box(root, Vector3.create(0, 0.95, 0.35), Vector3.create(1.35, 0.55, 1.55), GLASS, {
    metallic: 0.05,
    roughness: 0.04,
  })
  box(root, Vector3.create(0, 0.22, -1.85), Vector3.create(1.1, 0.35, 0.55), ENGINE, {
    metallic: 0.2,
    roughness: 0.25,
    emissive: 3.2,
  })
  for (const side of [-1, 1]) {
    box(
      root,
      Vector3.create(side * 1.15, 0.38, -0.15),
      Vector3.create(0.12, 0.28, 2.1),
      TRIM,
      { metallic: 0.85, roughness: 0.18 }
    )
  }
  box(root, Vector3.create(0, 0.08, 0), Vector3.create(2.35, 0.08, 3.9), TRIM, {
    metallic: 0.8,
    roughness: 0.22,
    emissive: 0.4,
  })
  box(root, Vector3.create(0, spec.seat.y - 0.12, spec.seat.z), Vector3.create(0.55, 0.12, 0.55), SHELL, {
    metallic: 0.2,
    roughness: 0.7,
  })
  hoverGlow(root, spec)
  return buildVehicleSeats(root, spec)
}

/** Hull-wide catcher first (click anywhere on the car), then per-seat pads. */
function buildVehicleSeats(
  root: Entity,
  spec: VehicleSpec
): { entity: Entity; seatId: VehicleSeatId }[] {
  const seats = vehicleSeatLocals(spec).map((seat) => {
    seatFloor(root, seat)
    return { entity: seatPad(root, seat), seatId: seat.id }
  })
  return [{ entity: cabinCatcher(root, spec), seatId: seats[0]?.seatId ?? 'driver_front_left' }, ...seats]
}
