/**
 * BREAK DANCE ADMIN — the Break Dancing plugin's own admin surface.
 *
 * Three interfaces, three audiences, and they do not mix:
 *
 *   Dance Studio (dance-studio/ui.tsx)  — END USER. Their own moves, their own body.
 *   Host        (social/host-ui.tsx)    — ADMIN. Generic World operation.
 *   Dance Admin (this file)             — ADMIN. Everything AROUND the player that
 *                                        belongs to the Break Dancing plugin.
 *
 * Crowd, Choreography and Reactions used to sit in the generic Host panel, which meant
 * a World with no cypher still showed controls for one. They live here now, behind two
 * gates: the plugin must actually be running (plugins/active.ts — not merely "there are
 * NPCs"), and the viewer must be an admin. The implementations are untouched; only
 * their home moved.
 *
 * Shell, width, header, spacing and scroll all come from the shared utility-panel
 * standard (social/hud-kit.tsx). Do not draw a bespoke panel here.
 */
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import {
  CROWD_FORMATION_LABELS,
  CROWD_HOST_FORMATIONS,
  CROWD_HOST_MOODS,
  CROWD_HOST_SYNCS,
  CROWD_MOOD_LABELS,
  CROWD_SYNC_LABELS,
  type CrowdHostFormation,
  type CrowdHostMood,
  type CrowdHostSync
} from '@shared/crowd-host-control'
import { CHOREOGRAPHY_ROUTINES, choreographyRoutineById } from '@shared/dance-venue-contract'
import type { CrowdReactionIntensity, CrowdReactionMood } from '@shared/crowd-reaction-contract'
import { BREAKDANCE_SHOW_APP } from '@shared/venue-app-contract'

import { getSocialConfig } from '../social/config'
import { isAdmin } from '../social/player'
import { getActivePanel, setActivePanel } from '../social/panel-state'
import { HUD } from '../social/hud-layout'
import { HudHint, HudFieldLabel, HudPill, HudPillRow, HudSection, HudUtilityPanel } from '../social/hud-kit'
import { HUD_OK, HUD_SUB, HUD_WARN } from '../social/hud-theme'
import { isPluginActive } from '../plugins/active'
import { screenLayer } from '../ui-kit'
import { adminResetFx } from '../effects/admin-fx'

import {
  getChoreographyRoutineId,
  getCrowdFormation,
  getCrowdMood,
  getCrowdSync,
  getEffectiveVenueActivityMode,
  getVenueActivityMode,
  isCompetitiveShowActive,
  isVenueActivityPaused,
  setChoreographyRoutine,
  setCrowdControl,
  setVenueActivity
} from './runtime'
import { triggerBreakdanceCrowdReaction } from './reactions'

/**
 * Show the Break Dance admin control?
 *
 *   Break Dancing plugin active + viewer is an admin = yes. Otherwise it does not
 *   exist — not disabled, not empty: absent. A regular visitor keeps only the Dance
 *   Studio functionality that is theirs.
 */
export function isBreakDanceAdminAvailable(): boolean {
  const config = getSocialConfig()
  if (!config) return false
  return isPluginActive(BREAKDANCE_SHOW_APP.id) && isAdmin(config)
}

let refresh: (() => void) | null = null
let reactionStatusLine = 'Ready · crowd audio disabled World-wide'

/** The host panel owns the one UI refresh counter; this borrows it. */
export function setDanceAdminRefresh(fn: () => void): void {
  refresh = fn
}

function bump(): void {
  refresh?.()
}

function fireReaction(
  label: string,
  mood: CrowdReactionMood,
  intensity: CrowdReactionIntensity
): void {
  triggerBreakdanceCrowdReaction(mood, intensity, { kind: 'all' })
  reactionStatusLine = `${label} sent · whole crowd · audio disabled`
  bump()
}

function applyCrowd(patch: {
  formation?: CrowdHostFormation | ''
  mood?: CrowdHostMood | ''
  sync?: CrowdHostSync | ''
}): void {
  setCrowdControl(patch)
  // The crowd overlay is a SOCIAL-mode instruction; in show mode the director owns
  // the bots and the formation would be overwritten the moment it was set.
  if (getVenueActivityMode() !== 'social') setVenueActivity('social')
  bump()
}

function showModeStatus(): string {
  if (isVenueActivityPaused()) return `PAUSED (${getEffectiveVenueActivityMode()})`
  return getVenueActivityMode().replace('_', ' ')
}

function CrowdSection() {
  const status = [
    getCrowdFormation() ? CROWD_FORMATION_LABELS[getCrowdFormation() as CrowdHostFormation] : 'published',
    getCrowdMood() ? CROWD_MOOD_LABELS[getCrowdMood() as CrowdHostMood] : '',
    getCrowdSync() ? CROWD_SYNC_LABELS[getCrowdSync() as CrowdHostSync] : ''
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <HudSection title="CROWD" status={status}>
      <HudFieldLabel text="Formation" />
      <HudPillRow>
        {CROWD_HOST_FORMATIONS.map((id) => (
          <HudPill
            key={`f-${id}`}
            label={CROWD_FORMATION_LABELS[id]}
            width={96}
            height={32}
            primary={getCrowdFormation() === id}
            onClick={() => applyCrowd({ formation: id })}
          />
        ))}
      </HudPillRow>
      <HudFieldLabel text="Mood" />
      <HudPillRow>
        {CROWD_HOST_MOODS.map((id) => (
          <HudPill
            key={`m-${id}`}
            label={CROWD_MOOD_LABELS[id]}
            width={96}
            height={32}
            primary={getCrowdMood() === id}
            accent="orange"
            onClick={() => applyCrowd({ mood: id })}
          />
        ))}
      </HudPillRow>
      <HudFieldLabel text="Hands" />
      <HudPillRow>
        {CROWD_HOST_SYNCS.map((id) => (
          <HudPill
            key={`s-${id}`}
            label={CROWD_SYNC_LABELS[id]}
            width={96}
            height={32}
            primary={getCrowdSync() === id}
            accent="purple"
            onClick={() => applyCrowd({ sync: id })}
          />
        ))}
      </HudPillRow>
      <HudPillRow>
        <HudPill
          label="Clear"
          width={96}
          height={32}
          onClick={() => applyCrowd({ formation: '', mood: '', sync: '' })}
        />
      </HudPillRow>
      <HudHint text="Squad plants in rank and holds still. Triangle is the golden-angle crowd. Mixed hands = same beat, different gestures. Clear returns the crowd to what was published." />
    </HudSection>
  )
}

function ShowSection() {
  const mode = getVenueActivityMode()
  return (
    <HudSection
      title="SHOW"
      status={showModeStatus()}
      statusColor={isCompetitiveShowActive() ? HUD_WARN : HUD_SUB}
    >
      <HudPillRow>
        <HudPill label="Social" width={96} height={32} primary={mode === 'social'} onClick={() => { setVenueActivity('social'); bump() }} />
        <HudPill label="Start show" width={96} height={32} primary={mode === 'show'} onClick={() => { setVenueActivity('show'); bump() }} />
        <HudPill label="Free roam" width={96} height={32} primary={mode === 'free_roam'} onClick={() => { setVenueActivity('free_roam'); bump() }} />
        <HudPill label="Choreography" width={110} height={32} primary={mode === 'choreography'} onClick={() => { setVenueActivity('choreography'); bump() }} />
        {isVenueActivityPaused() ? (
          <HudPill label="Resume" width={96} height={32} primary accent="orange" onClick={() => { setVenueActivity(getEffectiveVenueActivityMode()); bump() }} />
        ) : (
          <HudPill label="Pause crew" width={96} height={32} onClick={() => { setVenueActivity('paused'); bump() }} />
        )}
      </HudPillRow>
      <HudHint text="The competition's own modes. Generic NPC behaviour per group lives in Host → ACTIVITY." />
    </HudSection>
  )
}

function ChoreographySection() {
  const mode = getVenueActivityMode()
  const running = mode === 'choreography' || (isVenueActivityPaused() && getEffectiveVenueActivityMode() === 'choreography')
  return (
    <HudSection
      title="CHOREOGRAPHY"
      status={running ? (choreographyRoutineById(getChoreographyRoutineId())?.title ?? 'break crew') : 'pick a performance'}
      statusColor={running ? HUD_OK : HUD_SUB}
    >
      <HudPillRow>
        {CHOREOGRAPHY_ROUTINES.map((routine) => (
          <HudPill
            key={`r-${routine.id}`}
            label={routine.shortTitle}
            width={110}
            height={32}
            primary={mode === 'choreography' && getChoreographyRoutineId() === routine.id}
            accent="purple"
            onClick={() => { setChoreographyRoutine(routine.id); bump() }}
          />
        ))}
      </HudPillRow>
      <HudHint
        text={choreographyRoutineById(getChoreographyRoutineId())?.blurb ?? 'House dance clips + free DCL emotes. Add more routines in the catalogue.'}
      />
    </HudSection>
  )
}

function ReactionsSection() {
  return (
    <HudSection title="REACTIONS" status="whole crowd">
      <HudPillRow>
        <HudPill label="Support" width={96} height={32} onClick={() => fireReaction('Support', 'positive', 1)} />
        <HudPill label="Big cheer" width={96} height={32} onClick={() => fireReaction('Big cheer', 'positive', 3)} />
        <HudPill label="Frenzy" width={96} height={32} primary onClick={() => fireReaction('Frenzy', 'positive', 4)} />
        <HudPill label="Boo" width={96} height={32} onClick={() => fireReaction('Boo', 'negative', 3)} />
        <HudPill label="Surge" width={96} height={32} accent="orange" onClick={() => fireReaction('Aggressive surge', 'aggressive', 4)} />
        <HudPill label="Stop FX" width={96} height={32} onClick={() => { adminResetFx(); bump() }} />
      </HudPillRow>
      <Label
        value={reactionStatusLine}
        fontSize={9}
        color={HUD_OK}
        uiTransform={{ width: '100%', margin: { top: 1 } }}
      />
      <HudHint text="Frenzy = lights + shake + flash + fire. Stop FX kills shake, fire and weather. Crowd hands/audio stay with the dance." />
    </HudSection>
  )
}

/** Mounted unconditionally by hud-root; self-gates on plugin + admin + open panel. */
export function DanceAdminRoot() {
  if (getActivePanel() !== 'dance-admin') return null
  if (!isBreakDanceAdminAvailable()) return null
  return (
    // Docked through the SAME corner layer every other panel uses — a bare
    // absolute margin measures against the parent, not the screen.
    <UiEntity uiTransform={{ ...screenLayer('top-right'), zIndex: 400 }}>
      <HudUtilityPanel
        title="DANCE ADMIN"
        subtitle={`Break Dancing · ${showModeStatus()}`}
        top={HUD.panelTop.top}
        right={HUD.right}
        // Back goes to the LAUNCHER, not to 'host'. The host panel self-gates on
        // `config.apps.hostConsole.enabled`, which is false on plenty of lands — and
        // then 'host' renders null while the launcher stays hidden, stranding the admin
        // with no UI at all until they reload. Cost the owner a session on the garden
        // console; same trap, same fix here.
        onBack={() => { setActivePanel('none'); bump() }}
        backLabel="Host"
        onClose={() => { setActivePanel('none'); bump() }}
      >
        <ShowSection />
        <CrowdSection />
        <ChoreographySection />
        <ReactionsSection />
        <Label
          value="Dance Studio is the visitor's own panel — moves and movement. This one is everything around them."
          fontSize={9}
          color={Color4.create(0.6, 0.64, 0.72, 1)}
          uiTransform={{ width: '100%', margin: { top: 2, bottom: 8 } }}
        />
      </HudUtilityPanel>
    </UiEntity>
  )
}
