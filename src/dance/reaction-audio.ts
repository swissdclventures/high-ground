/**
 * World-wide crowd-reaction audio quarantine.
 *
 * This module intentionally creates no audio component and references no crowd WAV.
 * Keeping the public entry points lets Breakdance/Scrap callers remain stable
 * while guaranteeing that generic activity or combat events cannot reach an
 * applause-like bed.
 */
import type { BreakdanceReactionConfig } from '@shared/breakdance-reactions'
import { worldCrowdReactionAudioEnabled } from '@shared/world-audio-policy'

export function silenceBreakdanceCrowdAudioForScrap(): void {
  // No-op: the World-wide quarantine keeps this layer silent at all times.
}

export function initBreakdanceReactionAudio(_config: BreakdanceReactionConfig): void {
  if (worldCrowdReactionAudioEnabled()) {
    throw new Error('Crowd reaction audio assets are quarantined and not present in this build')
  }
}
