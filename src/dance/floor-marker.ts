/**
 * The dance floor call-out.
 *
 * What is drawn, and for whom:
 *   - The SHOW light: one disc under the dance circle, lit ONLY while a dancer is
 *     performing. It is a CONTINUOUS health gradient — juicy light-green when
 *     thriving, through green / lime / yellow / orange, to an intense fast-flashing
 *     red when they're about to be booted — so everyone reads the exact intensity,
 *     not 3 buckets. When nobody is on the floor there is no light: an idle venue
 *     shows its architecture, not a glowing ring painted on the plaza.
 *   - The ZONE outlines are NOT drawn here — social/zone-outline.ts outlines every
 *     authored zone for admins, and the floor and gather circles are authored zones.
 *     Zones are an authoring concept; a visitor should never see one.
 *
 * The discs sit just above the ground (a light decal), NOT raised, so avatar shoes
 * don't sink into them and no collider is needed.
 */
import { engine, MeshRenderer, Material, Transform, VisibilityComponent, type Entity } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { dancerStatus } from '@shared/dance-venue-contract'
import type { RuntimeFloorZone } from '@shared/scene-runtime-config'
import { DCL_DISC_PRIMITIVE_RADIUS, dclDiscScale } from '@shared/dcl-disc'
import { danceFloorZone, danceSupportZone, zoneCenterScene } from './zones'
import { getDanceConfig, getDanceSnapshot } from './runtime'
import { isMusicPlaying } from './music'

let floorDisc: Entity | null = null
let floorLit: boolean | null = null
let t = 0

// SIMULATED bass beat. DCL can't read a track's actual waveform, so we flash on
// a steady club BPM while music plays — a punchy attack + quick decay each beat
// so the floor "breathes" and never goes stale. Not synced to the real song.
const BEAT_S = 60 / 124 // ~124 BPM house
function beatEnvelope(): number {
  if (!isMusicPlaying()) return 0
  const phase = (t % BEAT_S) / BEAT_S
  return Math.max(0, Math.pow(1 - phase * 2.2, 3)) // spike at the downbeat, decay
}

interface RGB { r: number; g: number; b: number }
const OPEN: RGB = { r: 1, g: 0.3, b: 0.62 }
const REFRESH: RGB = { r: 1, g: 0.85, b: 0.3 }

// Health ramp, thriving (frac 1) → dying (frac 0). Many stops so the change is
// smooth and legible: "juicy" green at the top, "intense" red at the bottom.
const RAMP: { at: number; c: RGB }[] = [
  { at: 1.0, c: { r: 0.45, g: 1.0, b: 0.55 } }, // juicy light green
  { at: 0.75, c: { r: 0.3, g: 0.92, b: 0.42 } }, // healthy green
  { at: 0.5, c: { r: 0.7, g: 0.95, b: 0.25 } }, // lime
  { at: 0.35, c: { r: 1.0, g: 0.85, b: 0.2 } }, // yellow
  { at: 0.2, c: { r: 1.0, g: 0.55, b: 0.15 } }, // orange
  { at: 0.08, c: { r: 1.0, g: 0.3, b: 0.12 } }, // red-orange
  { at: 0.0, c: { r: 1.0, g: 0.08, b: 0.08 } } // intense red
]

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k
}

/** Interpolate the ramp at a 0..1 health fraction. */
function rampColor(frac: number): RGB {
  const f = Math.max(0, Math.min(1, frac))
  for (let i = 0; i < RAMP.length - 1; i++) {
    const hi = RAMP[i]
    const lo = RAMP[i + 1]
    if (f <= hi.at && f >= lo.at) {
      const k = hi.at === lo.at ? 0 : (f - lo.at) / (hi.at - lo.at)
      return {
        r: lerp(lo.c.r, hi.c.r, k),
        g: lerp(lo.c.g, hi.c.g, k),
        b: lerp(lo.c.b, hi.c.b, k)
      }
    }
  }
  return RAMP[RAMP.length - 1].c
}

/** A flat disc = a unit cylinder scaled wide and paper-thin, sitting LOW so it
 *  reads as a floor light and avatar shoes don't sink into it. */
function makeZoneSurface(zone: RuntimeFloorZone, yOffset: number): Entity {
  const e = engine.addEntity()
  const center = zoneCenterScene(zone)
  Transform.create(e, {
    position: Vector3.create(center.x, center.y + yOffset, center.z),
    scale:
      zone.shape.kind === 'circle'
        ? (() => {
            const scale = dclDiscScale(zone.shape.radius, 0.012)
            return Vector3.create(scale.x, scale.y, scale.z)
          })()
        : Vector3.create(zone.shape.width, 0.012, zone.shape.depth)
  })
  if (zone.shape.kind === 'circle') {
    MeshRenderer.setCylinder(e, DCL_DISC_PRIMITIVE_RADIUS, DCL_DISC_PRIMITIVE_RADIUS)
  } else {
    MeshRenderer.setBox(e)
  }
  return e
}

function paint(e: Entity | null, c: RGB, intensity: number, alpha: number): void {
  if (!e) return
  Material.setPbrMaterial(e, {
    albedoColor: Color4.create(c.r, c.g, c.b, alpha),
    emissiveColor: Color4.create(c.r, c.g, c.b),
    emissiveIntensity: intensity,
    metallic: 0,
    roughness: 1
  })
}

/** The show light exists only while there is a show. Toggled, not re-created. */
function setFloorLit(lit: boolean): void {
  if (!floorDisc || floorLit === lit) return
  floorLit = lit
  VisibilityComponent.createOrReplace(floorDisc, { visible: lit })
}

function markerSystem(dt: number): void {
  if (!floorDisc) return
  t += dt

  const snap = getDanceSnapshot()
  const config = getDanceConfig()
  // Only an ACTIVE performance lights the floor. Every other phase (empty, a dancer
  // selected but not started) leaves the ground clean.
  const performing = !!snap && snap.phase === 'active'
  setFloorLit(performing)
  if (!performing || !snap) return

  const beat = beatEnvelope()
  const beatI = beat * 0.7 // brightness kick per beat
  const beatA = beat * 0.08
  const slow = 0.5 - 0.5 * Math.cos(t * 3.0)

  if (!config) {
    paint(floorDisc, OPEN, 0.4 + beatI, 0.12 + beatA)
    return
  }

  const st = dancerStatus(snap, config, Date.now())
  if (st.refreshing) {
    paint(floorDisc, REFRESH, 1.6 + 1.2 * slow + beatI, 0.45)
    return
  }
  // repeat-about-to-eject is a red emergency regardless of the idle clock.
  const frac = st.repeatDanger ? 0.03 : st.idleFrac
  const color = rampColor(frac)
  // Pulse faster + brighter the closer to failure; a gentle "juicy" boost at the
  // very healthy end so thriving reads as alive, not flat. The beat kick rides on
  // top so the health colour still shimmers to the music.
  const danger = 1 - frac
  const speed = 2 + danger * 7
  const pulse = 0.5 - 0.5 * Math.cos(t * speed)
  const juicy = Math.max(0, frac - 0.8) * 1.6
  const intensity = 0.55 + danger * 1.5 * pulse + danger * 0.5 + juicy + beatI
  const alpha = 0.16 + danger * 0.22 * pulse + juicy * 0.15 + beatA
  paint(floorDisc, color, intensity, alpha)
}

export function initDanceFloorMarker(): void {
  const zone = danceFloorZone()
  const support = danceSupportZone()
  if (!zone || !support) return

  // No outline drawing here: social/zone-outline.ts already outlines EVERY authored
  // zone for admins, and these two are authored zones. Drawing them again stacked two
  // rings of pips on the same circle.
  //
  // Sit the disc just above the floor (a light decal) — low enough that avatar
  // shoes rest on the real ground instead of clipping into a raised plane.
  floorDisc = makeZoneSurface(zone, 0.016)
  paint(floorDisc, OPEN, 0.35, 0.18)
  VisibilityComponent.create(floorDisc, { visible: false })
  floorLit = false
  engine.addSystem(markerSystem)
}
