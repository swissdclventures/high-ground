/**
 * Boot health — what actually started, said ON SCREEN.
 *
 * Deferred plugins start through the boot pacer, which catches a throwing starter and writes
 * the reason to the console. In Explorer that console is invisible to the owner, so a plugin
 * that dies at +11 s simply never appears and there is nothing to read: the car "is not
 * showing", the museum "is not there", and diagnosing it means asking the owner for a browser
 * F12 dump they cannot easily produce. This module keeps a tiny ledger of every boot job's
 * outcome and the freshness line prints it, so the reason travels with the scene.
 *
 * Only outcomes, never spam: one line per job, the latest state wins.
 */

export type BootHealthState = 'ok' | 'failed' | 'skipped'

export interface BootHealthEntry {
  key: string
  state: BootHealthState
  detail?: string
}

const ledger = new Map<string, BootHealthEntry>()
let revision = 0

export function reportBootHealth(key: string, state: BootHealthState, detail?: string): void {
  ledger.set(key, { key, state, detail })
  revision += 1
}

export function bootHealthRevision(): number {
  return revision
}

export function bootHealthEntries(): BootHealthEntry[] {
  return [...ledger.values()]
}

/** Short shape for the HUD: failures spelled out, successes counted. */
export function formatBootHealth(entries: BootHealthEntry[] = bootHealthEntries()): string {
  const failed = entries.filter((e) => e.state === 'failed')
  const ok = entries.filter((e) => e.state === 'ok')
  const parts: string[] = []
  if (failed.length) {
    parts.push(
      failed
        .map((e) => `${e.key} FAILED${e.detail ? ` — ${e.detail}` : ''}`)
        .join('  ·  ')
    )
  }
  const named = ok.filter((e) => e.detail)
  for (const e of named) parts.push(`${e.key} ✓ ${e.detail}`)
  if (!parts.length && ok.length) parts.push(`boot ✓ ${ok.length} ok`)
  return parts.join('  ·  ')
}
