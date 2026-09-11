/**
 * Pure tuning and vector maths for the scene-owned keyboard flight controller.
 *
 * The explorer never applied SDK `PhysicsCombinedForce` to the local avatar, so the
 * runtime carries the player with `movePlayerTo` — the same verb jump pads already
 * use. These helpers turn WASD + look direction into metres-per-second and the next
 * commanded position. `computeFlightForce` stays as the old physics mapping; nothing
 * in the live controller reads it.
 */

export interface FlightVector {
  x: number
  y: number
  z: number
}

export interface FlightInputState {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  up: boolean
  down: boolean
  boost: boolean
}

export interface FlightBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

/** Comfortable sightseeing pace. */
export const FLIGHT_SPEED_MPS = 12
/** Hold Shift for a fast Superman dash. */
export const FLIGHT_BOOST_SPEED_MPS = 28
export const FLIGHT_VERTICAL_SPEED_MPS = 8
/** Slow enough that each `movePlayerTo({ duration })` can finish. Instant 20 Hz teleports freeze the avatar. */
export const FLIGHT_STEP_HZ = 4
/** One carry interval. The write itself lasts longer so gravity never gets a gap. */
export const FLIGHT_STEP_DURATION_S = 1 / FLIGHT_STEP_HZ
/** Overlap the next carry so Explorer cannot apply a gravity frame between writes. */
export const FLIGHT_CARRY_DURATION_S = FLIGHT_STEP_DURATION_S * 1.6
/** On-foot floor. 0.5 m is inside the parcel slab — `movePlayerTo` there falls through. */
export const FLIGHT_HOVER_FLOOR_M = 3
/** Lift off the walk surface so takeoff is visibly airborne. */
export const FLIGHT_TAKEOFF_LIFT_M = 2.2
export const FLIGHT_TAKEOFF_DURATION_S = 0.4

/**
 * A scene-set speed override — the flight superhighway raises cruise/boost far above
 * the defaults. With `axis` set, only travel ALONG that axis gets the raised speed:
 * a highway strip is one parcel wide, so lateral and vertical motion keep the default
 * pace to stop a strafe or climb from flinging the player straight out of bounds.
 */
export interface FlightSpeedProfile {
  cruiseMps: number
  boostMps: number
  axis?: 'x' | 'z'
  /** Personal craft can opt into profile speed vertically as well as horizontally. */
  omniVertical?: boolean
  /**
   * Metres above the flight floor this craft may climb. A ground-hugging board sets it so it
   * cannot inherit the scene's full traversal ceiling and turn into an aircraft.
   */
  maxAltitudeM?: number
}

/** Current Explorer character-controller values; kept here so tuning is explicit. */
export const FLIGHT_GRAVITY_COMPENSATION = 10
export const FLIGHT_EXTERNAL_DRAG = 1.5

const BOUNDS_MARGIN_M = 1.5
const BOUNDS_RECOVERY_FORCE = 18

function flatUnit(v: FlightVector): FlightVector {
  const length = Math.hypot(v.x, v.z)
  if (length < 0.0001) return { x: 0, y: 0, z: 1 }
  return { x: v.x / length, y: 0, z: v.z / length }
}

function guardAxis(
  force: number,
  position: number,
  min: number,
  max: number
): number {
  const low = min + BOUNDS_MARGIN_M
  const high = max - BOUNDS_MARGIN_M
  if (position < low) {
    return Math.max(force, (low - position) * BOUNDS_RECOVERY_FORCE)
  }
  if (position > high) {
    return Math.min(force, -(position - high) * BOUNDS_RECOVERY_FORCE)
  }
  return force
}

/** Length-1 vector, or null when it is too short to carry a direction. */
function unit(v: FlightVector): FlightVector | null {
  const length = Math.hypot(v.x, v.y, v.z)
  if (length < 0.0001) return null
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

/**
 * The direction the player is TRYING to travel, or null when no move key is held.
 *
 * Shared with the force below so the visible flying body and the physics can never
 * disagree — pointing the body at the camera instead of at this is what produced the
 * "I'm flying backwards" report: pressing S moved you back while the body faced front.
 */
export function flightMoveDirection(
  input: FlightInputState,
  cameraForward: FlightVector
): FlightVector | null {
  const aim = unit(cameraForward) ?? { x: 0, y: 0, z: 1 }
  const flat = flatUnit(cameraForward)
  const right = { x: flat.z, y: 0, z: -flat.x }
  const forwardAxis = Number(input.forward) - Number(input.backward)
  const rightAxis = Number(input.right) - Number(input.left)
  const verticalAxis = Number(input.up) - Number(input.down)
  const steered = unit({
    x: aim.x * forwardAxis + right.x * rightAxis,
    y: aim.y * forwardAxis + verticalAxis,
    z: aim.z * forwardAxis + right.z * rightAxis,
  })
  if (steered) return steered
  // Shift with no WASD is still a dash — fly where you look, do not hover in place.
  return input.boost ? aim : null
}

/**
 * Convert keyboard intent into one continuous world-space force.
 *
 * YOU FLY WHERE YOU LOOK. W follows the camera's full aim including PITCH, so looking up
 * and holding W climbs. That is the load-bearing part of this design, not a flourish:
 * the dedicated climb/descend keys ride on input actions the explorer does not reliably
 * deliver to a scene while the avatar is airborne (Space is the jump action, and a jump
 * does not fire in mid-air), which is why "Space does nothing" was the standing report.
 * Aim costs nothing to deliver — it is the camera transform, read every frame — so
 * altitude no longer depends on a key press arriving at all.
 *
 * Space/Ctrl remain wired as a direct vertical axis on top. When the explorer does send
 * them they add lift or descent; when it does not, flight is still fully controllable.
 * A/D strafing stays level — banking sideways into the ground is nobody's intent.
 */
export function computeFlightForce(
  input: FlightInputState,
  cameraForward: FlightVector,
  position: FlightVector,
  bounds: FlightBounds,
  profile?: FlightSpeedProfile | null
): FlightVector {
  const aim = unit(cameraForward) ?? { x: 0, y: 0, z: 1 }
  const flat = flatUnit(cameraForward)
  const right = { x: flat.z, y: 0, z: -flat.x }

  const forwardAxis = Number(input.forward) - Number(input.backward)
  const rightAxis = Number(input.right) - Number(input.left)

  const move = unit({
    x: aim.x * forwardAxis + right.x * rightAxis,
    y: aim.y * forwardAxis,
    z: aim.z * forwardAxis + right.z * rightAxis,
  }) ?? { x: 0, y: 0, z: 0 }

  const baseSpeed = input.boost ? FLIGHT_BOOST_SPEED_MPS : FLIGHT_SPEED_MPS
  const fastSpeed = profile ? (input.boost ? profile.boostMps : profile.cruiseMps) : baseSpeed
  const baseForce = baseSpeed * FLIGHT_EXTERNAL_DRAG
  const fastForce = fastSpeed * FLIGHT_EXTERNAL_DRAG
  const verticalForce = profile?.omniVertical ? fastForce : baseForce
  let x = move.x * (profile?.axis === 'z' ? baseForce : fastForce)
  let z = move.z * (profile?.axis === 'x' ? baseForce : fastForce)

  // Axis-bound highways keep safe vertical pace; personal craft can explicitly opt in.
  const verticalAxis = Number(input.up) - Number(input.down)
  let y =
    FLIGHT_GRAVITY_COMPENSATION +
    move.y * verticalForce +
    verticalAxis * FLIGHT_VERTICAL_SPEED_MPS * FLIGHT_EXTERNAL_DRAG

  x = guardAxis(x, position.x, bounds.minX, bounds.maxX)
  z = guardAxis(z, position.z, bounds.minZ, bounds.maxZ)
  y = guardAxis(y, position.y, bounds.minY, bounds.maxY)

  return { x, y, z }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Yaw-only facing: the Superman clip is already a prone body, so takeoff must not
 * add camera pitch or the avatar reads as diving into the floor.
 */
export function horizontalFacing(direction: FlightVector): FlightVector {
  return flatUnit(direction)
}

/**
 * Metres per second the keyboard is asking for. Zero when hovering — altitude is
 * held by repeating the last commanded position, not by a gravity-compensation force.
 */
export function flightVelocity(
  input: FlightInputState,
  cameraForward: FlightVector,
  profile?: FlightSpeedProfile | null
): FlightVector {
  const direction = flightMoveDirection(input, cameraForward)
  if (!direction) return { x: 0, y: 0, z: 0 }

  const defaultSpeed = input.boost ? FLIGHT_BOOST_SPEED_MPS : FLIGHT_SPEED_MPS
  const fastSpeed = profile ? (input.boost ? profile.boostMps : profile.cruiseMps) : defaultSpeed
  const xSpeed = profile?.axis === 'z' ? defaultSpeed : fastSpeed
  const zSpeed = profile?.axis === 'x' ? defaultSpeed : fastSpeed
  const ySpeed = profile?.omniVertical ? fastSpeed : defaultSpeed
  return {
    x: direction.x * xSpeed,
    y: direction.y * ySpeed,
    z: direction.z * zSpeed,
  }
}

/** Next commanded point. The runtime writes this with `movePlayerTo`; it never reads the fallen avatar. */
export function nextFlightPosition(
  position: FlightVector,
  velocity: FlightVector,
  dt: number,
  bounds: FlightBounds
): FlightVector {
  return {
    x: clamp(position.x + velocity.x * dt, bounds.minX, bounds.maxX),
    y: clamp(position.y + velocity.y * dt, bounds.minY, bounds.maxY),
    z: clamp(position.z + velocity.z * dt, bounds.minZ, bounds.maxZ),
  }
}

/**
 * Re-seat dead reckoning on the real capsule when a wall ate the carry.
 *
 * Do NOT follow a gravity fall. Explorer keeps pulling the body down between
 * `movePlayerTo` writes; if the command snaps onto that fallen Y, the next
 * write aims further down and the guest ends under the plot.
 */
export function recoverFlightAnchor(
  target: FlightVector,
  body: FlightVector,
  velocity: FlightVector,
  bounds: FlightBounds,
  slackM: number,
  stepDurationS: number
): FlightVector {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z)
  const allowed = speed * 2 * stepDurationS + slackM
  const gap = Math.hypot(target.x - body.x, target.y - body.y, target.z - body.z)
  if (gap <= allowed) return target
  return {
    x: clamp(body.x, bounds.minX, bounds.maxX),
    y: clamp(Math.max(target.y, body.y), bounds.minY, bounds.maxY),
    z: clamp(body.z, bounds.minZ, bounds.maxZ),
  }
}
