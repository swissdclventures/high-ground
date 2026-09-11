/**
 * Shared E / F catcher.
 *
 * Explorer only delivers IA_PRIMARY (E) and IA_SECONDARY (F) while the pointer
 * hovers a 3D collider. Camera-parented colliders do not raycast, and a box on
 * the avatar sits behind the look ray — so Fight and vehicle E both looked wired while
 * the keys did nothing. This plane sits in WORLD space in front of the camera.
 */
import {
  ColliderLayer,
  engine,
  Entity,
  InputAction,
  MeshCollider,
  PointerEventType,
  PointerEvents,
  Transform,
  inputSystem,
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

// Sit behind nearby interactables (Cadillac, pads, NPCs). A wall at 1.4 m
// with an 8×5 m face ate every mouse-over — Board, pads, the lot.
const AHEAD_M = 8
const MAX_DISTANCE = 16

export type ActionKey = 'primary' | 'secondary'

const listeners: Record<ActionKey, Set<() => void>> = {
  primary: new Set(),
  secondary: new Set(),
}

let initialized = false
let primaryHeld = false
let secondaryHeld = false
let catcherEntity: Entity | null = null

export function onActionKey(key: ActionKey, fn: () => void): () => void {
  listeners[key].add(fn)
  return () => listeners[key].delete(fn)
}

function emit(key: ActionKey): void {
  console.log(`[keys] ${key === 'primary' ? 'E' : 'F'} pressed`)
  for (const fn of listeners[key]) fn()
}

function rising(action: InputAction, held: boolean): { down: boolean; nextHeld: boolean } {
  const down = inputSystem.isPressed(action)
  const edge = down && !held
  const triggered = inputSystem.isTriggered(action, PointerEventType.PET_DOWN)
  return { down: triggered || edge, nextHeld: down }
}

function actionKeySystem(): void {
  const camera = Transform.getOrNull(engine.CameraEntity)
  const catcher = catcherEntity ? Transform.getMutableOrNull(catcherEntity) : null
  if (camera && catcher) {
    const ahead = Vector3.scale(Vector3.rotate(Vector3.Forward(), camera.rotation), AHEAD_M)
    catcher.position = Vector3.add(camera.position, ahead)
    catcher.rotation = camera.rotation
  }

  const primary = rising(InputAction.IA_PRIMARY, primaryHeld)
  primaryHeld = primary.nextHeld
  if (primary.down) emit('primary')

  const secondary = rising(InputAction.IA_SECONDARY, secondaryHeld)
  secondaryHeld = secondary.nextHeld
  if (secondary.down) emit('secondary')
}

export function initActionKeys(): void {
  if (initialized) return
  initialized = true

  catcherEntity = engine.addEntity()
  Transform.create(catcherEntity, {
    position: Vector3.create(0, 1.4, AHEAD_M),
    scale: Vector3.create(2.6, 1.8, 0.12),
  })
  MeshCollider.setBox(catcherEntity, ColliderLayer.CL_POINTER)
  PointerEvents.create(catcherEntity, {
    pointerEvents: [
      {
        eventType: PointerEventType.PET_DOWN,
        eventInfo: {
          button: InputAction.IA_PRIMARY,
          hoverText: '',
          maxDistance: MAX_DISTANCE,
          showFeedback: false,
        },
      },
      {
        eventType: PointerEventType.PET_DOWN,
        eventInfo: {
          button: InputAction.IA_SECONDARY,
          hoverText: '',
          maxDistance: MAX_DISTANCE,
          showFeedback: false,
        },
      },
    ],
  })
  engine.addSystem(actionKeySystem)
}
