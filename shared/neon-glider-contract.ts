import type { FlightSpeedProfile } from './flight-control'

/** The personal glider deliberately matches the World Highway's extreme top speed. */
export const NEON_GLIDER = {
  modelSrc: 'models/neon-glider.glb',
  rider: { x: 0, y: 0.18, z: -0.08 },
  /** Height of the standing deck above the model's origin — the rider stands on this. */
  deckTopM: 0.18,
  /** Fast enough to cross a district, slow enough to carve between its towers. */
  cruiseMps: 24,
  boostMps: 48,
  /** Metres above the flight floor the board may climb. A skim, not a flight. */
  rideCeilingM: 2.6,
} as const

/** Legacy flight-mode profile. The shipped dock ride stays ground-skimming. */
export const NEON_GLIDER_SPEED_PROFILE: FlightSpeedProfile = {
  cruiseMps: NEON_GLIDER.cruiseMps,
  boostMps: NEON_GLIDER.boostMps,
  omniVertical: true,
  maxAltitudeM: NEON_GLIDER.rideCeilingM,
}
