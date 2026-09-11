import type { Entity } from '@dcl/sdk/ecs'
const owned = new Set<Entity>()
export function claimPunchCrowd(entities: Entity[]): void { for (const entity of entities) owned.add(entity) }
export function releasePunchCrowd(): void { owned.clear() }
export function punchOwnsCrowd(entity: Entity): boolean { return owned.has(entity) }
