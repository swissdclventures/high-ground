/**
 * PER-GROUP NPC ACTIVITY — the host retargets one crowd, not the whole World.
 *
 * A World has several NPC groups (plaza crowd, dance-floor crowd, entrance, market),
 * each published with an authored role. Host → ACTIVITY used to change the venue-wide
 * mode, so telling the market NPCs to dance also moved the plaza. This holds a live
 * override per group id, keyed by `NpcGroup.id`, with `"*"` meaning "every group plus
 * the NPCs no group claimed".
 *
 * An override is a LIVE instruction, never a publish: clearing it returns the group to
 * exactly the role it was published with. Nothing here writes config.
 *
 * Syncing rides the social bus (`host.npcActivity`) so every client's troupe computes
 * the same behaviour — the bots are local entities on each client, so a local-only
 * override would show different guests different crowds.
 */
import type { NpcGroup, NpcGroupRole } from '@shared/dance-venue-contract'
import { emitSocial, onSocial } from '../social/sync'

/** Targets every group plus the NPCs no group claimed. */
export const ALL_NPC_GROUPS = '*'

const overrides = new Map<string, NpcGroupRole>()
let wired = false
let onChange: (() => void) | null = null

/** Host-panel labels. The runtime roles themselves never get renamed. */
export const NPC_ACTIVITY_LABELS: Record<NpcGroupRole, string> = {
  hangout: 'Idle',
  roam: 'Wander',
  dance_together: 'Dance',
  dance_solo: 'Solo dance'
}

/** The order the panel offers them in — calmest first. */
export const NPC_ACTIVITY_ORDER: readonly NpcGroupRole[] = [
  'hangout',
  'roam',
  'dance_together',
  'dance_solo'
]

export function initNpcActivity(): void {
  if (wired) return
  wired = true
  onSocial('host.npcActivity', (msg) => {
    if (!msg.role) overrides.delete(msg.groupId)
    else overrides.set(msg.groupId, msg.role)
    // "*" is a reset as much as a command: a blanket instruction must not leave an
    // older per-group override standing underneath it, or the group the host just
    // told to dance would keep wandering with no visible reason why.
    if (msg.groupId === ALL_NPC_GROUPS) {
      for (const key of [...overrides.keys()]) {
        if (key !== ALL_NPC_GROUPS) overrides.delete(key)
      }
    }
    onChange?.()
  })
}

/** UI refresh hook — the host panel re-reads which button is lit. */
export function setNpcActivityRefresh(fn: () => void): void {
  onChange = fn
}

/** Host command. `role = null` clears the override. */
export function setNpcActivity(groupId: string, role: NpcGroupRole | null): void {
  initNpcActivity()
  emitSocial({ type: 'host.npcActivity', groupId, role: role ?? '' })
}

/** The live override for a group id (or for the ungrouped remainder when null). */
export function npcActivityOverride(groupId: string | null): NpcGroupRole | null {
  return (groupId ? overrides.get(groupId) : null) ?? overrides.get(ALL_NPC_GROUPS) ?? null
}

/** What this group is doing right now — override first, published role second. */
export function effectiveNpcRole(group: NpcGroup | null): NpcGroupRole | null {
  return npcActivityOverride(group?.id ?? null) ?? group?.role ?? null
}

/** Test seam. */
export function resetNpcActivity(): void {
  overrides.clear()
}
