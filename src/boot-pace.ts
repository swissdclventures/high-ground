/**
 * Run a boot job after N seconds of scene time so the Explorer can finish the
 * district GLB and the first avatar wave before we pile on more.
 */
import { engine } from '@dcl/sdk/ecs'
import { reportBootHealth } from './boot-health'

interface BootJob {
  at: number
  label: string
  run: () => void
}

const jobs: BootJob[] = []
let elapsed = 0
let systemOn = false

function bootPaceSystem(dt: number): void {
  elapsed += dt
  for (let i = jobs.length - 1; i >= 0; i--) {
    const job = jobs[i]!
    if (elapsed < job.at) continue
    jobs.splice(i, 1)
    try {
      job.run()
      console.log(`[boot] deferred "${job.label}" ran at ${elapsed.toFixed(1)}s`)
      reportBootHealth(job.label, 'ok')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`[boot] deferred "${job.label}" FAILED — ${message}`)
      // The console is invisible in Explorer. Put the reason where the owner can read it.
      reportBootHealth(job.label, 'failed', message)
    }
  }
}

/** Schedule `run` for `seconds` after the first call. Failures are isolated. */
export function afterBoot(seconds: number, label: string, run: () => void): void {
  jobs.push({ at: elapsed + Math.max(0, seconds), label, run })
  if (systemOn) return
  systemOn = true
  engine.addSystem(bootPaceSystem)
}

export { BOOT_PACE } from '@shared/boot-pace'
