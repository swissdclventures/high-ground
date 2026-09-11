/**
 * GARDEN CONSOLE — the admin's test bench for a lawn that takes days to grow.
 *
 * A garden's whole subject is elapsed time: at the default 24 hours a stage, a bed
 * takes five days to reach "wild", and an owner deciding whether the vegetation is
 * good enough cannot wait five days per look. So this holds a bed at any stage on
 * demand and shows how far the real lawn has actually come.
 *
 * Two numbers, and they are not the same thing:
 *
 *   STAGE   which of the six models is drawn. A floor() of elapsed time, so it
 *           says nothing about progress inside a stage.
 *   GROWTH  0 to 100 across the whole run. This is what a bar can show and what
 *           tells you a bed is nearly at the next stage rather than just past the
 *           last one.
 *
 * ★ A PREVIEW IS LOCAL AND IS NEVER SAVED. It repaints the models in front of this
 * viewer and writes nothing to the API, so an admin can walk every stage of a lawn
 * other people are tending without touching what they have grown. Leaving preview
 * puts the bed straight back on the truth. Nothing here is a way to edit a garden.
 *
 * Shell, width, header and spacing come from the shared utility-panel standard
 * (social/hud-kit.tsx) like every other admin surface — do not draw a panel here.
 */
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'

import {
  SUCCESSION,
  SUCCESSION_MAX,
  SUCCESSION_WOODY_RUNG,
  successionHoursTo,
  successionStep,
  type SuccessionRung
} from '@shared/succession-contract'
import { GARDEN_APP } from '@shared/venue-app-contract'

import { getSocialConfig } from '../social/config'
import { isAdmin } from '../social/player'
import { getActivePanel, setActivePanel } from '../social/panel-state'
import { isPluginActive } from '../plugins/active'
import { screenLayer } from '../ui-kit'
import { HudHint, HudPill, HudPillRow, HudSection, HudUtilityPanel } from '../social/hud-kit'
import { HUD_ACCENT, HUD_PILL, HUD_SUB, HUD_TYPE, HUD_WHITE, hudRoundedBg } from '../social/hud-theme'
import { HUD } from '../social/hud-layout'
import {
  GROUND_COVER,
  GROUND_COVER_DENSITIES,
  GROUND_COVER_DENSITY_LABELS,
  GROUND_COVER_SPECIES,
  type GroundCoverSpecies
} from '@shared/ground-cover-contract'

import {
  gardenConsoleBeds,
  gardenConsoleCover,
  gardenConsoleSetCover,
  gardenConsoleSetWind,
  gardenConsoleWind,
  gardenConsolePreview,
  gardenConsolePreviewAll,
  gardenConsoleSetMode,
  setGardenConsoleRefresh,
  type GardenConsoleBed
} from '../plugins/garden'

export function isGardenConsoleAvailable(): boolean {
  const config = getSocialConfig()
  if (!config) return false
  return isPluginActive(GARDEN_APP.id) && isAdmin(config)
}

let refresh: (() => void) | null = null

/** The host panel owns the one UI refresh counter; this borrows it. */
export function setGardenConsoleRefreshHook(fn: () => void): void {
  refresh = fn
  setGardenConsoleRefresh(fn)
}

function bump(): void {
  refresh?.()
}

/**
 * A 0-100 bar. Two nested boxes: the track, and a fill whose width is the
 * percentage. Deliberately not a Label alone — the whole point of the figure is
 * that you can see at a glance how close the next stage is.
 */
function GrowthBar(props: { percent: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(props.percent)))
  return (
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center' }}>
      <UiEntity
        uiTransform={{ width: '72%', height: 10, margin: { right: 8 } }}
        uiBackground={hudRoundedBg(HUD_PILL)}
      >
        <UiEntity
          uiTransform={{ width: `${pct}%`, height: 10 }}
          uiBackground={hudRoundedBg(HUD_ACCENT.purple)}
        />
      </UiEntity>
      <Label value={`${pct}%`} fontSize={HUD_TYPE.chip} color={HUD_WHITE} textWrap="nowrap" />
    </UiEntity>
  )
}

function BedCard(props: { key?: string; bed: GardenConsoleBed }) {
  const bed = props.bed
  const previewing = bed.previewStage !== null
  return (
    <HudSection
      key={bed.id}
      title={bed.id}
      status={previewing ? `PREVIEW · ${successionStep(bed.previewStage as number).label}` : 'live'}
      statusColor={previewing ? HUD_ACCENT.magenta : HUD_SUB}
    >
      <Label
        value={bed.summary}
        fontSize={HUD_TYPE.body}
        color={HUD_WHITE}
        textWrap="wrap"
      />
      <UiEntity uiTransform={{ width: '100%', height: 6 }} />
      <Label
        value={
          previewing
            ? `Really ${successionStep(bed.liveStage).label} underneath — growth held`
            : `Really ${successionStep(bed.liveStage).label}`
        }
        fontSize={HUD_TYPE.chip}
        color={HUD_SUB}
        textWrap="nowrap"
      />
      {/* Progress toward the NEXT rung, not across the whole ladder: the ladder runs
          over a year and a bar filling by a thousandth a day says nothing. */}
      <GrowthBar percent={bed.nextRungPercent} />
      <Label
        value={successionStep(bed.liveStage).note}
        fontSize={HUD_TYPE.chip}
        color={HUD_SUB}
        textWrap="wrap"
      />
      <UiEntity uiTransform={{ width: '100%', height: 8 }} />
      <Label value="Hold this bed at" fontSize={HUD_TYPE.chip} color={HUD_SUB} textWrap="nowrap" />
      <HudPillRow>
        {SUCCESSION.map((step) => (
          <HudPill
            key={`${bed.id}-rung-${step.rung}`}
            label={step.label}
            width={106}
            primary={bed.previewStage === step.rung}
            // Woody rungs read in another colour: crossing that line is the one
            // change a walk cannot undo.
            accent={step.rung >= SUCCESSION_WOODY_RUNG ? 'orange' : 'magenta'}
            // A bed really at wild, shown at wild, changes nothing: paintCell will
            // not re-set a GltfContainer src it already holds. Greying the button
            // says so, instead of looking broken.
            disabled={bed.previewStage === null && bed.liveStage === step.rung}
            onClick={() => {
              gardenConsolePreview(bed.id, step.rung)
              bump()
            }}
          />
        ))}
        <HudPill
          key={`${bed.id}-live`}
          label="Live"
          width={96}
          primary={!previewing}
          accent="purple"
          onClick={() => {
            gardenConsolePreview(bed.id, null)
            bump()
          }}
        />
      </HudPillRow>
      <Label value="Walking the lawn" fontSize={HUD_TYPE.chip} color={HUD_SUB} textWrap="nowrap" />
      <HudPillRow>
        <HudPill
          key={`${bed.id}-mow`}
          label="Mows"
          width={96}
          primary={bed.mode === 'mow'}
          onClick={() => {
            gardenConsoleSetMode(bed.id, 'mow')
            bump()
          }}
        />
        <HudPill
          key={`${bed.id}-wild`}
          label="Keeps wild"
          width={110}
          primary={bed.mode === 'protect'}
          onClick={() => {
            gardenConsoleSetMode(bed.id, 'protect')
            bump()
          }}
        />
        <HudPill
          key={`${bed.id}-off`}
          label="Does nothing"
          width={122}
          primary={bed.mode === 'off'}
          onClick={() => {
            gardenConsoleSetMode(bed.id, 'off')
            bump()
          }}
        />
      </HudPillRow>
    </HudSection>
  )
}

/**
 * THE PLANTING CATALOG — what grows on the beds besides grass.
 *
 * Density and species re-plant live across every bed, so an owner can see a mix and
 * read what it costs before committing to it in the Builder. Like the stage preview
 * it saves nothing, and a reload returns to the scene's own setting.
 *
 * The triangle line matters as much as the plants: the whole species set is 885
 * triangles once, and a plot's worth of them is what actually decides whether a
 * garden fits inside a parcel.
 */
/**
 * The wind dial, in four steps rather than a hundred.
 *
 * The ceiling is low on purpose. What the wind rotates is a whole 1.84 m patch, not a
 * blade, so past a few degrees the mat sweeps further than the grass is tall and the
 * eye reads heaving ground instead of bending grass — which is exactly what it did at
 * the old default. "Gusty" is as far as that can honestly go.
 */
const WIND_STEPS: readonly (readonly [string, number])[] = [
  ['Still', 0],
  ['Calm', 30],
  ['Breeze', 55],
  ['Gusty', 85],
]

function PlantingCatalog(props: { beds: GardenConsoleBed[] }) {
  const cover = gardenConsoleCover()
  const plants = props.beds.reduce((n, b) => n + b.coverPlants, 0)
  const tris = props.beds.reduce((n, b) => n + b.coverTriangles, 0)
  const capped = props.beds.some((b) => b.coverCapped)
  return (
    <HudSection
      title="PLANTING"
      status={plants ? `${plants} plants · ${tris} tris` : 'nothing planted'}
      statusColor={capped ? HUD_ACCENT.magenta : HUD_SUB}
    >
      <Label value="How thickly" fontSize={HUD_TYPE.chip} color={HUD_SUB} textWrap="nowrap" />
      <HudPillRow>
        {GROUND_COVER_DENSITIES.map((density) => (
          <HudPill
            key={`density-${density}`}
            label={GROUND_COVER_DENSITY_LABELS[density]}
            width={96}
            primary={cover.density === density}
            accent="purple"
            onClick={() => {
              gardenConsoleSetCover(density, cover.species)
              bump()
            }}
          />
        ))}
      </HudPillRow>
      <Label value="Wind" fontSize={HUD_TYPE.chip} color={HUD_SUB} textWrap="nowrap" />
      <HudPillRow>
        {WIND_STEPS.map(([label, value]) => (
          <HudPill
            key={`wind-${label}`}
            label={label}
            width={92}
            primary={gardenConsoleWind() === value}
            accent="purple"
            onClick={() => {
              gardenConsoleSetWind(value)
              bump()
            }}
          />
        ))}
      </HudPillRow>
      <Label value="What grows" fontSize={HUD_TYPE.chip} color={HUD_SUB} textWrap="nowrap" />
      <HudPillRow>
        {GROUND_COVER_SPECIES.map((species) => {
          const on = cover.species.includes(species)
          return (
            <HudPill
              key={`species-${species}`}
              label={GROUND_COVER[species].label}
              width={124}
              primary={on}
              accent="magenta"
              onClick={() => {
                const next = on
                  ? cover.species.filter((s: GroundCoverSpecies) => s !== species)
                  : [...cover.species, species]
                gardenConsoleSetCover(cover.density, next)
                bump()
              }}
            />
          )
        })}
      </HudPillRow>
      <HudHint
        text={
          capped
            ? 'The triangle budget stopped the planting before the density did. A bed spends at most 2,500 triangles on plants, which is decoration\u2019s 25% share of a parcel.'
            : 'A fern is the only one you cannot walk through. Placement is computed from each bed\u2019s own position, so nothing is stored and no two beds are the same garden.'
        }
      />
    </HudSection>
  )
}

export function GardenConsoleRoot() {
  if (getActivePanel() !== 'garden-console') return null
  if (!isGardenConsoleAvailable()) return null
  const beds = gardenConsoleBeds()
  const held = beds.filter((bed) => bed.previewStage !== null).length
  return (
    // ‼️ THE CORNER LAYER IS WHAT PUTS THIS ON THE RIGHT — not the margins below.
    //
    // HudUtilityPanel positions itself with `margin`, and a margin-right pads a box, it
    // does not pin one to the screen edge. So `right={HUD.right}` alone did NOTHING and
    // the console opened on the LEFT, under the Genesis map with the chat across it,
    // exactly as the old comment here claimed it prevented. A bare margin measures
    // against the parent; only this wrapper measures against the screen. The dance
    // admin panel had already learned this and said so — copy it, do not re-derive it.
    <UiEntity uiTransform={{ ...screenLayer('top-right'), zIndex: 400 }}>
      <HudUtilityPanel
        title="GARDEN"
        subtitle={
          beds.length
            ? `${beds.length} bed${beds.length === 1 ? '' : 's'}${held ? ` · ${held} held in preview` : ''}`
            : 'No bed placed on this scene'
        }
        top={HUD.panelTop.top}
        right={HUD.right}
        // ‼️ BACK GOES TO THE LAUNCHER, NEVER TO 'host'.
        //
        // The HOST panel self-gates on `config.apps.hostConsole.enabled`, and on the
        // owner's own LAND that is FALSE — the very reason this console has its own
        // chip. Sending Back to 'host' therefore opened a panel that renders null while
        // the launcher stays hidden because a panel is nominally open: no console, no
        // chips, no way back short of reloading the scene. The owner hit exactly that.
        //
        // 'none' is the honest parent anyway: the launcher row is where GARDEN lives.
        onBack={() => {
          setActivePanel('none')
          bump()
        }}
        backLabel="Back"
        // BOTH of these must bump. The launcher only draws while no panel is open, so
        // closing without a redraw leaves no GARDEN chip and no way back in.
        onClose={() => {
          setActivePanel('none')
          bump()
        }}
      >
      <HudHint text="Nothing here needs saving. Everything below shows instantly and is yours alone — no republish, no reload." />
      <PlantingCatalog beds={beds} />
      {beds.length > 1 ? (
        <HudSection title="EVERY BED" status={`${beds.length} beds`} statusColor={HUD_SUB}>
          <Label
            value="A plot carries nine of these. Judging the grass one bed at a time means nine clicks per stage."
            fontSize={HUD_TYPE.chip}
            color={HUD_SUB}
            textWrap="wrap"
          />
          <HudPillRow>
            {SUCCESSION.map((step) => (
              <HudPill
                key={`all-rung-${step.rung}`}
                label={step.label}
                width={106}
                accent={step.rung >= SUCCESSION_WOODY_RUNG ? 'orange' : 'magenta'}
                onClick={() => {
                  gardenConsolePreviewAll(step.rung)
                  bump()
                }}
              />
            ))}
            <HudPill
              key="all-live"
              label="All live"
              width={96}
              accent="purple"
              onClick={() => {
                gardenConsolePreviewAll(null)
                bump()
              }}
            />
          </HudPillRow>
        </HudSection>
      ) : null}
      {beds.length ? (
        beds.map((bed) => <BedCard key={bed.id} bed={bed} />)
      ) : (
        <HudHint text="Place a Garden bed in the Builder, from Object library ▸ Smart objects, then republish." />
      )}
      <HudHint
        text={`Eleven rungs, and past ${SUCCESSION[SUCCESSION_WOODY_RUNG].label.toLowerCase()} the ground has gone woody — walking will not clear it, which takes about ${Math.round(successionHoursTo(SUCCESSION_WOODY_RUNG, 24) / 24)} days of neglect on the default clock. Old growth takes over a year. A preview is yours alone — it redraws the grass in front of you and saves nothing, so you can walk every stage of a lawn other people are tending. It also covers a mown trail: holding a bed at a stage ignores what has been cut.`}
      />
      </HudUtilityPanel>
    </UiEntity>
  )
}
