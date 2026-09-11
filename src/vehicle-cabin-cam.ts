/**
 * Driving camera — NOT the player capsule.
 *
 * Explorer interpolates `movePlayerTo`, so the live body always trails a moving hull.
 * That trail is the runner behind the car. Scrap already solved this for fights: a
 * VirtualCamera created once, never destroyed, bound with MainCamera. Parent that
 * camera to the cabin so the view rides the hull.
 */
import { engine, Entity, MainCamera, Transform, VirtualCamera } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { isScrapFightActive } from './plugins/scrap-fight'
import { isScrapHumanFightActive } from './human-edition/fight'

let cabinCam: Entity | null = null
let camBound = false

function ensureCabinCam(): Entity {
  if (cabinCam !== null) return cabinCam
  const cam = engine.addEntity()
  Transform.create(cam, { position: Vector3.Zero() })
  VirtualCamera.create(cam, {
    defaultTransition: { transitionMode: VirtualCamera.Transition.Time(0.12) },
  })
  cabinCam = cam
  return cam
}

export function bindVehicleCabinCam(parent: Entity, seat: { x: number; y: number; z: number }): void {
  if (isScrapFightActive() || isScrapHumanFightActive()) return
  const cam = ensureCabinCam()
  Transform.createOrReplace(cam, {
    parent,
    position: Vector3.create(seat.x, seat.y + 1.28, seat.z + 0.2),
    rotation: Quaternion.fromEulerDegrees(-8, 0, 0),
  })
  if (camBound) return
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: cam })
  camBound = true
}

export function releaseVehicleCabinCam(): void {
  if (!camBound) return
  camBound = false
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: undefined })
}

export function vehicleCabinCamBound(): boolean {
  return camBound
}
