/**
 * Motion runtime — drives movers (decorative custom pieces) with Tween + TweenSequence.
 *
 * The Builder exports a mover's piece as its own GLB at the origin. `loadSmartEntities`
 * places the entity like any other smart object (mirror, floor height, yaw) and then
 * calls `attachMotion`, which turns the stored MotionSpec into platform tweens through
 * the pure planner in shared/motion-contract.ts. Nothing here reads the mesh.
 *
 * Laws (shared/motion-contract.ts): no collider on a mover; above MOTION_ALWAYS_CAP the
 * extra `always` movers only run while a player is within their `near` radius; `click`
 * toggles. Orbit reparents the piece under a pivot that spins.
 */
import {
  EasingFunction,
  engine,
  Entity,
  InputAction,
  PointerEvents,
  PointerEventType,
  pointerEventsSystem,
  Transform,
  Tween,
  TweenLoop,
  TweenSequence,
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  effectiveTriggers,
  planMotion,
  type MotionEasing,
  type MotionPlan,
  type MotionSpec,
  type MotionStep,
} from '@shared/motion-contract'

interface Mover {
  entity: Entity
  /** The entity the tween lives on: the piece itself, or the orbit pivot. */
  tweened: Entity
  base: { x: number; y: number; z: number }
  plan: MotionPlan
  trigger: MotionSpec['trigger']
  nearRadiusM: number
  playing: boolean
}

const movers: Mover[] = []
let systemArmed = false
let nearClock = 0
const NEAR_POLL_S = 0.5

export function resetMotion(): void {
  movers.length = 0
}

export function motionCount(): number {
  return movers.length
}

function easing(kind: MotionEasing): EasingFunction {
  switch (kind) {
    case 'linear':
      return EasingFunction.EF_LINEAR
    case 'ease_in':
      return EasingFunction.EF_EASEINQUAD
    case 'ease_out':
      return EasingFunction.EF_EASEOUTQUAD
    case 'ease_in_out':
      return EasingFunction.EF_EASEQUAD
    case 'bounce':
      return EasingFunction.EF_EASEOUTBOUNCE
  }
}

function tweenMode(step: MotionStep) {
  switch (step.mode) {
    case 'rotate':
      return Tween.Mode.Rotate({
        start: Quaternion.fromEulerDegrees(step.fromDeg.x, step.fromDeg.y, step.fromDeg.z),
        end: Quaternion.fromEulerDegrees(step.toDeg.x, step.toDeg.y, step.toDeg.z),
      })
    case 'move':
      return Tween.Mode.Move({
        start: Vector3.create(step.from.x, step.from.y, step.from.z),
        end: Vector3.create(step.to.x, step.to.y, step.to.z),
      })
    case 'scale':
      return Tween.Mode.Scale({
        start: Vector3.create(step.from, step.from, step.from),
        end: Vector3.create(step.to, step.to, step.to),
      })
  }
}

function setPlaying(m: Mover, playing: boolean): void {
  if (m.playing === playing) return
  m.playing = playing
  const tween = Tween.getMutableOrNull(m.tweened)
  if (tween) tween.playing = playing
}

/**
 * Attach the stored motion to a placed mover. `specs` is every mover spec in the scene
 * in authored order, so the always-cap demotion is stable across loads; `index` is this
 * mover's place in it. `base` is the entity's rest position in scene metres and
 * `rotationYDeg` its rest yaw, both already mirrored.
 */
export function attachMotion(
  entity: Entity,
  spec: MotionSpec,
  base: { x: number; y: number; z: number; rotationYDeg: number },
  specs: readonly MotionSpec[],
  index: number
): void {
  const plan = planMotion(spec, { position: base, rotationYDeg: base.rotationYDeg }, true)
  if (plan.steps.length === 0) return

  let tweened = entity
  if (plan.orbitOffset) {
    // The pivot stands where the piece was authored and turns; the piece rides at the
    // orbit radius. The piece keeps its own yaw so it faces the same way all the way round.
    const pivot = engine.addEntity()
    Transform.create(pivot, {
      position: Vector3.create(base.x, base.y, base.z),
      scale: Vector3.One(),
    })
    const t = Transform.getMutable(entity)
    t.parent = pivot
    t.position = Vector3.create(plan.orbitOffset.x, plan.orbitOffset.y, plan.orbitOffset.z)
    tweened = pivot
  }

  const [first, ...rest] = plan.steps
  const ease = easing(plan.easing)
  const trigger = effectiveTriggers(specs)[index] ?? plan.trigger
  const playing = trigger === 'always'

  Tween.create(tweened, {
    mode: tweenMode(first),
    duration: first.durationMs,
    easingFunction: ease,
    playing,
    currentTime: plan.phase,
  })
  if (plan.loop !== 'once' || rest.length > 0) {
    TweenSequence.create(tweened, {
      sequence: rest.map((step) => ({
        mode: tweenMode(step),
        duration: step.durationMs,
        easingFunction: ease,
      })),
      ...(plan.loop === 'once'
        ? {}
        : { loop: plan.loop === 'yoyo' ? TweenLoop.TL_YOYO : TweenLoop.TL_RESTART }),
    })
  }

  const mover: Mover = {
    entity,
    tweened,
    base: { x: base.x, y: base.y, z: base.z },
    plan,
    trigger,
    nearRadiusM: plan.nearRadiusM,
    playing,
  }
  movers.push(mover)

  if (trigger === 'click') {
    PointerEvents.create(entity, {
      pointerEvents: [
        {
          eventType: PointerEventType.PET_DOWN,
          eventInfo: { button: InputAction.IA_POINTER, hoverText: 'Toggle', maxDistance: 12 },
        },
      ],
    })
    pointerEventsSystem.onPointerDown(
      { entity, opts: { button: InputAction.IA_POINTER, hoverText: 'Toggle', maxDistance: 12 } },
      () => setPlaying(mover, !mover.playing)
    )
  }

  if (!systemArmed) {
    systemArmed = true
    engine.addSystem(motionSystem)
  }
}

function motionSystem(dt: number): void {
  nearClock += dt
  if (nearClock < NEAR_POLL_S) return
  nearClock = 0
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (!player) return
  const p = player.position
  for (const m of movers) {
    if (m.trigger !== 'near') continue
    const dx = p.x - m.base.x
    const dz = p.z - m.base.z
    const near = dx * dx + dz * dz <= m.nearRadiusM * m.nearRadiusM
    setPlaying(m, near)
  }
}
