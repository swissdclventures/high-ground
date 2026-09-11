import ReactEcs, { UiEntity, Label, Button, Input } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import type { GuestGateStatus } from '@shared/social-surface-contract'
import { getSocialConfig } from './config'
import { isAdmin } from './player'
import {
  formatGuestWallet,
  getGuests,
  getRosterUiTick,
  type GuestRecord
} from './roster'
import { emitSocial } from './sync'
import {
  adminPlayScreen,
  adminSetScreenVolume,
  adminStopScreen,
  adminToggleDoor,
  adminToggleScreenMute,
  listHostScreens,
  type HostScreenState
} from './media'
import { togglePreviewGate } from './gating'
import { hostBootGuest, hostLockoutGuest, hostSendRewardNft, hostSendToZone, hostToastGuest, hostUnlockGuest } from './host-actions'
import { listRuntimeZones, zoneCenterForHost } from './zone-gates'
import { hasConfiguredRewardNft } from '@shared/social-surface-contract'
import { getRuntimeContext } from './runtime-context'
import { formatPublishStamp } from '@shared/live-receipt'
import { isDanceStudioEnabled } from '../dance-studio'
import {
  getDanceConfig,
  isDanceActivated,
  isParticipating,
  toggleParticipating
} from '../dance/runtime'
import {
  ALL_NPC_GROUPS,
  NPC_ACTIVITY_LABELS,
  NPC_ACTIVITY_ORDER,
  npcActivityOverride,
  setNpcActivity,
  setNpcActivityRefresh
} from '../dance/npc-activity'
import { DanceAdminRoot, isBreakDanceAdminAvailable, setDanceAdminRefresh } from '../dance/admin-ui'
import {
  GardenConsoleRoot,
  isGardenConsoleAvailable,
  setGardenConsoleRefreshHook
} from '../garden/console-ui'
import { npcDisplayName, npcGroupSlices, npcIndexFromUserId } from '@shared/dance-venue-contract'
import { crowdDirectorDiag } from '../dance/crowd-director'
import { hostDismissBot, hostWalkBotTo, troupeDiag } from '../dance/troupe'
import { danceInitReport } from '../dance'
import { hasAmbientBed } from '../audio/ambient'
// ONE arbiter for what is playing — the bottom transport and Host → AUDIO both
// read and write through it, so they can never disagree. See the module header
// for what the two used to control separately.
import {
  hasHostAudio,
  hostAudioCanSkip,
  hostAudioMuted,
  hostAudioNext,
  hostAudioNudgeVolume,
  hostAudioPlaying,
  hostAudioPrev,
  hostAudioSetPlaying,
  hostAudioSource,
  hostAudioSourceLabel,
  hostAudioToggleMute,
  hostAudioTrackTitle,
  hostAudioVolumePct
} from '../audio/host-transport'
import { musicLocationHold } from '../audio/location-hold'
import { getSpeakeasyTick } from '../speakeasy/state'
import { setAnnouncementRefresh, showHostMessage } from './announcement-banner'
import { setDanceBugChipRefresh } from '../dance/dance-bug-gate'
import { getActivePanel, setActivePanel, setPanelRefresh } from './panel-state'
import { HUD } from './hud-layout'
import {
  HudFieldLabel,
  HudHint,
  HudPill,
  HudPillRow,
  HudSection,
  HudUtilityPanel
} from './hud-kit'
import { HUD_OK, HUD_SIZE, HUD_SPACE, HUD_SUB } from './hud-theme'
import { screenLayer } from '../ui-kit'
import { openExchange } from '../exchange/state'
import {
  adminSetRain,
  adminSetSnow,
  getAdminFxState,
  setAdminFxUiRefresh
} from '../effects/admin-fx'

// Readable input styling — the Inputs shipped with no color/background, so they
// rendered white-on-white and were unreadable.
const INPUT_TEXT = Color4.create(0.95, 0.96, 0.98, 1)
const INPUT_PLACEHOLDER = Color4.create(0.6, 0.63, 0.7, 1)
const INPUT_BG = { color: Color4.create(0.16, 0.17, 0.22, 1) }

// Which big panel is open lives in social/panel-state.ts (shared with the
// Dance Studio so the two can never stack). hudMinimized is host-panel-local.
let hudMinimized = false
let selectedUserId: string | null = null
/** Practice mode: fold the NPC troupe into the guest list so a host can rehearse
 *  people-management (message / boot / send-to-zone) before real guests arrive. */
let showNpcsInList = false
/** NPCs the host "booted" in practice — removed from the roster (and walked far
 *  away), so booting visibly WORKS instead of the count never changing. */
const bootedNpcIds = new Set<string>()

/** Real guests, plus the NPC troupe as flagged pseudo-guests when practice is on. */
function rosterForPanel(): GuestRecord[] {
  const real = getGuests()
  if (!showNpcsInList) return real
  const dance = getDanceConfig()
  if (!dance?.npc.enabled) return real
  const npcs: GuestRecord[] = []
  for (let i = 0; i < dance.npc.count; i++) {
    if (bootedNpcIds.has(`npc:${i}`)) continue
    const name = npcDisplayName(dance, i)
    npcs.push({
      userId: `npc:${i}`,
      name: `${name} (NPC)`,
      wallet: null,
      isGuest: true,
      wearables: [],
      gateStatus: 'guest',
      wearableMatch: null,
      initials: name.slice(0, 2).toUpperCase(),
      afk: false
    })
  }
  return [...real, ...npcs]
}

function isNpcUser(userId: string | null): boolean {
  return !!userId && userId.startsWith('npc:')
}

/** Message a guest with sender-side feedback. Real guest → synced private toast
 *  (their screen only) + local confirmation; NPC → practice preview of exactly
 *  what a guest would see. Before this, messaging showed NOTHING to the host, so
 *  it read as broken. */
function sendHostMessageTo(guest: GuestRecord, raw: string): void {
  const text = raw.trim()
  if (!text) return
  if (isNpcUser(guest.userId)) {
    showHostMessage(`(practice) ${guest.name} would see: "${text}"`)
    return
  }
  hostToastGuest(guest.userId, text)
  showHostMessage(`Sent to ${guest.name}: "${text}"`)
}

// Layered translucency + rounded corners (chat-box language). SDK7 has no
// border-radius, so rounding comes from a white 9-slice texture tinted per use.
const ROUNDED_TEX = 'images/rounded-panel.png'
const ROUNDED_SLICES = { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 }
function roundedBg(r: number, g: number, b: number, a: number) {
  return {
    texture: { src: ROUNDED_TEX },
    textureMode: 'nine-slices' as const,
    textureSlices: ROUNDED_SLICES,
    color: Color4.create(r, g, b, a),
  }
}
const PANEL_BASE = roundedBg(0.06, 0.07, 0.1, 0.88)
const CARD_BG = roundedBg(1, 1, 1, 0.06)
const HEADER_BG = roundedBg(1, 1, 1, 0.1)

/** Unified host button — rounded, translucent, readable. Replaces the ad-hoc
 *  primary/secondary Buttons so the panel reads as one system. */
function HostButton(props: {
  label: string
  onClick: () => void
  tone?: 'primary' | 'ghost'
  fontSize?: number
  key?: string
}) {
  const bg = props.tone === 'primary' ? roundedBg(0.85, 0.22, 0.36, 0.92) : roundedBg(1, 1, 1, 0.1)
  return (
    <Button
      value={props.label}
      fontSize={props.fontSize ?? 12}
      color={Color4.White()}
      uiTransform={{
        height: 30,
        padding: { left: 11, right: 11 },
        margin: { right: 5, bottom: 5 },
        pointerFilter: 'block'
      }}
      uiBackground={bg}
      onMouseDown={props.onClick}
    />
  )
}

/** Compact horizontal volume: − then + on one row so it never sits under inputs. */
function VolBox(props: { onUp: () => void; onDown: () => void }) {
  const cell = (label: string, onClick: () => void, last?: boolean) => (
    <UiEntity
      uiTransform={{
        width: 26,
        height: 26,
        justifyContent: 'center',
        alignItems: 'center',
        margin: last ? {} : { right: 3 },
        zIndex: 130,
      }}
      uiBackground={roundedBg(1, 1, 1, 0.2)}
      onMouseDown={onClick}
    >
      <Label value={label} fontSize={13} color={Color4.White()} />
    </UiEntity>
  )
  return (
    <UiEntity
      uiTransform={{
        display: 'flex',
        flexDirection: 'row',
        flexShrink: 0,
        alignItems: 'center',
        padding: 2,
        margin: { left: 4 },
        zIndex: 130,
      }}
    >
      {cell('−', props.onDown)}
      {cell('+', props.onUp, true)}
    </UiEntity>
  )
}
/** A clearly delineated, titled box — one self-contained control group (VIDEO,
 *  MUSIC, SHOW). The tinted background + title bar make each section read as its
 *  own panel so controls never blur together. */
function SectionBox(props: {
  title: string
  status?: string
  statusColor?: Color4
  tint?: { r: number; g: number; b: number }
  children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[]
}) {
  const t = props.tint ?? { r: 1, g: 1, b: 1 }
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: 8,
        margin: { bottom: 8 },
      }}
      uiBackground={roundedBg(t.r, t.g, t.b, 0.08)}
    >
      <UiEntity
        uiTransform={{
          width: '100%',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: { bottom: 6 },
        }}
      >
        <Label value={props.title} fontSize={11} color={Color4.create(0.82, 0.85, 0.9, 1)} />
        {props.status ? (
          <Label value={props.status} fontSize={10} color={props.statusColor ?? Color4.create(0.65, 0.68, 0.74, 1)} />
        ) : null}
      </UiEntity>
      {props.children}
    </UiEntity>
  )
}

let messageDraft = ''
let announceDraft = ''
let renderVersion = 0
let rewardStatusLine = ''
/** Which screen the VIDEO section's transport buttons reach. A smart-object id. */
let selectedScreenId: string | null = null
/** Which NPC group the ACTIVITY section targets. ALL_NPC_GROUPS = every crowd. */
let activityGroupId: string = ALL_NPC_GROUPS

export function bumpHostUi(): void {
  renderVersion += 1
}

function gateBadgeLabel(status: GuestGateStatus): string {
  switch (status) {
    case 'pass':
      return 'Pass'
    case 'fail':
      return 'Fail'
    case 'guest':
      return 'Guest'
    case 'locked':
      return 'Locked'
    default:
      return status
  }
}

function gateBadgeColor(status: GuestGateStatus) {
  switch (status) {
    case 'pass':
      return Color4.create(0.2, 0.65, 0.35, 0.95)
    case 'fail':
      return Color4.create(0.75, 0.2, 0.2, 0.95)
    case 'locked':
      return Color4.create(0.55, 0.15, 0.15, 0.95)
    default:
      return Color4.create(0.35, 0.38, 0.45, 0.95)
  }
}

function GuestRow(props: { guest: GuestRecord; selected: boolean; onSelect: () => void; key?: string }) {
  const { guest, selected, onSelect } = props
  const wearableHint =
    guest.wearableMatch === null ? '' : guest.wearableMatch ? ' · wearable ✓' : ' · wearable ✗'
  const afkHint = guest.afk ? ' · AFK' : ''

  const wallet = formatGuestWallet(guest.wallet)
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: 30,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: { left: 6, right: 6 },
        margin: { bottom: 2 },
      }}
      uiBackground={{
        color: selected ? Color4.create(0.22, 0.28, 0.42, 0.95) : Color4.create(0.12, 0.12, 0.16, 0.7)
      }}
      onMouseDown={onSelect}
    >
      <UiEntity
        uiTransform={{ width: 20, height: 20, margin: { right: 8 } }}
        uiBackground={
          guest.wallet
            ? { avatarTexture: { userId: guest.userId } }
            : { color: Color4.create(0.3, 0.32, 0.38, 1) }
        }
      >
        {!guest.wallet ? (
          <Label
            value={guest.initials}
            fontSize={9}
            textAlign="middle-center"
            uiTransform={{ width: '100%', height: '100%' }}
          />
        ) : null}
      </UiEntity>
      {/* Name + wallet on a SINGLE line so one guest never wastes two rows. */}
      <Label
        value={`${guest.name}  ${wallet}${wearableHint}${afkHint}`}
        fontSize={12}
        color={Color4.White()}
        uiTransform={{ flexGrow: 1 }}
      />
      <UiEntity
        uiTransform={{ width: 48, height: 18, justifyContent: 'center', alignItems: 'center' }}
        uiBackground={{ color: gateBadgeColor(guest.gateStatus) }}
      >
        <Label value={gateBadgeLabel(guest.gateStatus)} fontSize={10} color={Color4.White()} />
      </UiEntity>
    </UiEntity>
  )
}

/**
 * THE GENERIC HOST PANEL — World administration, and nothing that belongs to a plugin.
 *
 * Two rules decide what is allowed on this surface:
 *
 *  1. ADMIN ONLY. Everything reachable through the HOST chip is admin functionality.
 *     A regular visitor never sees any of it (HostHudRoot gates on isAdmin).
 *  2. GENERIC ONLY. A control belongs here when it operates the World; a control that
 *     operates one plugin's experience belongs to that plugin's own admin panel. Crowd,
 *     Choreography and Reactions moved out to DANCE ADMIN (dance/admin-ui.tsx) for
 *     exactly this reason — their implementations were kept, only their home changed.
 *
 * CONDITIONAL, NEVER DISABLED. Every section below asks whether its module actually
 * exists in THIS World and renders nothing when it does not. No NPC crew → no ACTIVITY.
 * No registered screens → no VIDEO. No audio source → no AUDIO. The panel gets shorter
 * on a smaller World instead of filling with controls that do nothing, which is what
 * makes one implementation work across many Worlds.
 *
 * The shell, its width, header, spacing and scroll come from the shared utility-panel
 * standard in social/hud-kit.tsx — the same one the Dance Studio uses. Never hand-roll
 * a panel shape here.
 */
function HostHudPanel() {
  const config = getSocialConfig()
  if (!config) return null
  const moduleOn = (id: import('@shared/social-surface-contract').HostConsoleModuleId) =>
    config.apps.hostConsole.modules.includes(id)

  const guests = getGuests()

  // ── What exists in this World right now. Each answer gates one section.
  // Only surface the gate controls when the owner ACTUALLY bound an entry gate
  // (access mode ≠ Open). A latent fallback rule used to make "Open/Close gate"
  // appear on an open venue — the gate the owner "didn't remember activating".
  const ruleId = config.buildingGateRuleId ?? null
  const hasDoor = (getRuntimeContext()?.smartEntities ?? []).some(
    (e) => e.behavior === 'synced_door'
  )
  const dance = getDanceConfig()
  const hasNpcs = !!dance?.npc.enabled && dance.npc.count > 0
  const screens = moduleOn('video') && config.apps.video.enabled ? listHostScreens() : []
  const audioLive = hostAudioSource() !== 'none'

  const showAnnounce = moduleOn('announcements')
  const showAccess = moduleOn('access') && (!!ruleId || hasDoor)
  const showDanceAdmin = isBreakDanceAdminAvailable()
  const showGardenConsole = isGardenConsoleAvailable()

  return (
    <HudUtilityPanel
      title="HOST"
      subtitle={`${config.event.name} · ${guests.length} in scene · build ${formatPublishStamp(getRuntimeContext()?.syncedAt)}`}
      top={HUD.panelTop.top}
      right={HUD.right}
      onMinimize={() => {
        hudMinimized = true
        bumpHostUi()
      }}
      onClose={() => {
        setActivePanel('none')
        bumpHostUi()
      }}
    >
      {/* Guest roster + people-management have their own panel so this console
          stays focused on operating the World. */}
      {moduleOn('guests') ? (
        <HudPill
          label={`Manage guests (${guests.length}) →`}
          width={HUD_SIZE.utilW - HUD_SPACE.panel * 2}
          height={36}
          primary
          accent="purple"
          onClick={() => {
            setActivePanel('guests')
            bumpHostUi()
          }}
        />
      ) : null}

      {/* ── ANNOUNCEMENT: the host talking to everyone in the World. A genuine
          host function, and the reason this panel exists at all. */}
      {showAnnounce ? (
        <HudSection title="ANNOUNCEMENT">
          <Input
            uiTransform={{ width: '100%', height: 38, margin: { bottom: 6 } }}
            placeholder="Announce to everyone…"
            color={INPUT_TEXT}
            placeholderColor={INPUT_PLACEHOLDER}
            uiBackground={INPUT_BG}
            onChange={(v) => {
              announceDraft = v
            }}
            onSubmit={(v) => {
              const text = (v || announceDraft).trim()
              if (text) emitSocial({ type: 'host.announce', text })
              announceDraft = ''
              bumpHostUi()
            }}
          />
          <HudPillRow>
            <HudPill
              label="ANNOUNCE"
              width={120}
              height={32}
              primary
              onClick={() => {
                const text = announceDraft.trim()
                if (!text) return
                emitSocial({ type: 'host.announce', text })
                announceDraft = ''
                bumpHostUi()
              }}
            />
          </HudPillRow>
        </HudSection>
      ) : null}

      {/* ── ACCESS: only when this World actually has a gate or a door to work. */}
      {showAccess ? (
        <HudSection title="ACCESS">
          <HudPillRow>
            {ruleId ? (
              <HudPill label="Open gate" width={96} height={32} onClick={() => togglePreviewGate(ruleId, false)} />
            ) : null}
            {ruleId ? (
              <HudPill label="Close gate" width={96} height={32} onClick={() => togglePreviewGate(ruleId, true)} />
            ) : null}
            {hasDoor ? (
              <HudPill label="Toggle door" width={106} height={32} onClick={() => adminToggleDoor('social_door_main')} />
            ) : null}
          </HudPillRow>
        </HudSection>
      ) : null}

      {/* ── ACTIVITY: what the NPCs in this World are doing, per group.
          Generic host functionality — an admin changes crowd behaviour while the
          World is running. The competition's own modes live in DANCE ADMIN. */}
      {hasNpcs ? <ActivitySection /> : null}

      {/* ── VIDEO: a World has as many screens as it has walls worth filling, so
          the admin picks WHICH one before any transport button means anything. */}
      {screens.length > 0 ? <VideoSection screens={screens} /> : null}

      {/* ── AUDIO: a lightweight DJ control over whatever source is live. It and
          the bottom transport read the same arbiter (audio/host-transport.ts), so
          the two can never disagree about what is playing. */}
      {audioLive ? <AudioSection /> : null}

      {/* ── Plugin admin modules. Each plugin that needs one gets its own panel;
          Host stays the generic layer and only shows the door. */}
      {showDanceAdmin ? (
        <HudPill
          label="DANCE ADMIN →"
          width={HUD_SIZE.utilW - HUD_SPACE.panel * 2}
          height={36}
          primary
          accent="orange"
          onClick={() => {
            setActivePanel('dance-admin')
            bumpHostUi()
          }}
        />
      ) : null}
      {showGardenConsole ? (
        <HudPill
          label="GARDEN →"
          width={HUD_SIZE.utilW - HUD_SPACE.panel * 2}
          height={36}
          primary
          accent="purple"
          onClick={() => {
            setActivePanel('garden-console')
            bumpHostUi()
          }}
        />
      ) : null}
    </HudUtilityPanel>
  )
}

/**
 * ACTIVITY — NPC behaviour, targeted at ONE group.
 *
 * A World may hold several crowds (plaza, dance floor, entrance, market). Applying an
 * activity change to all of them because the panel had no selector was the bug this
 * fixes. Groups already carry a stable `id` and a readable `name` in the published
 * config, so the selector needs no new identity scheme — it shows the name and sends
 * the id. `All` targets every group plus the NPCs no group claimed.
 *
 * The buttons set a LIVE override; `Published` clears it and returns the group to the
 * behaviour it was published with. Nothing here writes config.
 */
function ActivitySection() {
  const dance = getDanceConfig()
  if (!dance) return null
  const slices = npcGroupSlices(dance.npc.count, dance.npc.groups)
  const groups = slices
    .filter((slice) => !!slice.group)
    .map((slice) => ({ id: slice.group!.id, name: slice.group!.name || slice.group!.id, size: slice.size }))
  const ungrouped = slices.find((slice) => !slice.group)?.size ?? 0

  // A group that vanished between publishes must not leave the panel pointing at
  // nothing — fall back to All rather than showing a dead selection.
  if (activityGroupId !== ALL_NPC_GROUPS && !groups.some((g) => g.id === activityGroupId)) {
    activityGroupId = ALL_NPC_GROUPS
  }
  const selected = groups.find((g) => g.id === activityGroupId) ?? null
  const acting = npcActivityOverride(activityGroupId === ALL_NPC_GROUPS ? null : activityGroupId)
  const published = selected
    ? dance.npc.groups.find((g) => g.id === selected.id)?.role ?? null
    : null

  const targetName = selected ? selected.name : `All crew (${dance.npc.count})`
  const status = acting
    ? `${NPC_ACTIVITY_LABELS[acting]} · live`
    : published
      ? `${NPC_ACTIVITY_LABELS[published]} · published`
      : 'published'

  return (
    <HudSection title="ACTIVITY" status={status} statusColor={acting ? HUD_OK : HUD_SUB}>
      {groups.length > 0 ? (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
          <HudFieldLabel text="NPC group" />
          <HudPillRow>
            <HudPill
              label={`All (${dance.npc.count})`}
              width={104}
              height={30}
              fontSize={12}
              primary={activityGroupId === ALL_NPC_GROUPS}
              onClick={() => {
                activityGroupId = ALL_NPC_GROUPS
                bumpHostUi()
              }}
            />
            {groups.map((group) => (
              <HudPill
                key={`g-${group.id}`}
                label={`${group.name.slice(0, 12)} (${group.size})`}
                width={132}
                height={30}
                fontSize={12}
                primary={activityGroupId === group.id}
                onClick={() => {
                  activityGroupId = group.id
                  bumpHostUi()
                }}
              />
            ))}
          </HudPillRow>
        </UiEntity>
      ) : null}

      <HudFieldLabel text={`Behaviour · ${targetName}`} />
      <HudPillRow>
        {NPC_ACTIVITY_ORDER.map((role) => (
          <HudPill
            key={`a-${role}`}
            label={NPC_ACTIVITY_LABELS[role]}
            width={104}
            height={32}
            primary={acting === role}
            onClick={() => {
              setNpcActivity(activityGroupId, role)
              bumpHostUi()
            }}
          />
        ))}
        <HudPill
          label="Published"
          width={104}
          height={32}
          disabled={!acting}
          onClick={() => {
            setNpcActivity(activityGroupId, null)
            bumpHostUi()
          }}
        />
      </HudPillRow>
      <HudHint
        text={
          groups.length > 0
            ? `Targets ${targetName}${ungrouped > 0 && activityGroupId === ALL_NPC_GROUPS ? ` including ${ungrouped} ungrouped` : ''}. Published clears the override.`
            : 'This World has no NPC groups yet, so every command targets the whole crew.'
        }
      />
    </HudSection>
  )
}

/**
 * VIDEO — pick the screen, then drive it.
 *
 * Identity comes from the screen's smart-object id (`MediaScreenBinding.screenId`),
 * which is what the builder bound and what the runtime registers by — never from where
 * a screen happens to sit in the scene. Numbering in the strip is display only; the
 * label under it names the screen the buttons will actually reach.
 */
function VideoSection(props: { screens: HostScreenState[] }) {
  const { screens } = props
  if (!screens.length) return null
  // The selection survives between opens; if that screen went away, fall back to
  // the primary rather than sending commands into a dead id.
  const selected = screens.find((s) => s.screenId === selectedScreenId) ?? screens[0]!
  selectedScreenId = selected.screenId

  return (
    <HudSection
      title="VIDEO"
      status={`${selected.playing ? 'playing' : 'stopped'} · sound ${selected.muted ? 'off' : 'on'}`}
      statusColor={selected.playing ? HUD_OK : HUD_SUB}
    >
      {screens.length > 1 ? (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
          <HudFieldLabel text="Screen" />
          <HudPillRow>
            {screens.map((screen, index) => (
              <HudPill
                key={`sc-${screen.screenId}`}
                label={`${index + 1}`}
                width={34}
                height={30}
                primary={screen.screenId === selected.screenId}
                accent="purple"
                onClick={() => {
                  selectedScreenId = screen.screenId
                  bumpHostUi()
                }}
              />
            ))}
          </HudPillRow>
        </UiEntity>
      ) : null}
      <HudFieldLabel
        text={`Selected: ${selected.label}${selected.registered ? '' : ' · not placed in scene'}`}
      />
      <HudPillRow>
        <HudPill
          label="Play"
          width={80}
          height={32}
          primary
          disabled={!selected.url}
          onClick={() => {
            adminPlayScreen(selected.screenId)
            bumpHostUi()
          }}
        />
        <HudPill
          label="Stop"
          width={80}
          height={32}
          onClick={() => {
            adminStopScreen(selected.screenId)
            bumpHostUi()
          }}
        />
        <HudPill
          label={selected.muted ? 'Unmute' : 'Mute'}
          width={86}
          height={32}
          onClick={() => {
            adminToggleScreenMute(selected.screenId)
            bumpHostUi()
          }}
        />
        <VolBox
          onUp={() => {
            adminSetScreenVolume(selected.screenId, selected.volume + 0.1)
            bumpHostUi()
          }}
          onDown={() => {
            adminSetScreenVolume(selected.screenId, selected.volume - 0.1)
            bumpHostUi()
          }}
        />
      </HudPillRow>
      {!selected.url ? (
        <HudHint text="This screen has no source bound. Give it a URL or a Cast in Builder → Apps → Video." />
      ) : null}
    </HudSection>
  )
}

/**
 * AUDIO — a compact DJ transport over whatever source this World is actually playing.
 *
 * It shares one arbiter with the bottom background-music widget, so pressing pause here
 * pauses exactly what that widget pauses. See audio/host-transport.ts for what the two
 * used to control separately and why the priority order is what it is.
 */
function AudioSection() {
  const playing = hostAudioPlaying()
  const title = hostAudioTrackTitle()
  const volume = hostAudioVolumePct()
  const muted = hostAudioMuted()
  return (
    <HudSection
      title="AUDIO"
      status={`${hostAudioSourceLabel()} · ${playing ? 'playing' : 'paused'}${volume === null ? '' : ` · ${volume}%`}`}
      statusColor={playing ? HUD_OK : HUD_SUB}
    >
      <HudFieldLabel text={title ? `Track · ${title}` : 'Track · (this source does not name its tracks)'} />
      <HudPillRow>
        <HudPill
          label="‹ Prev"
          width={80}
          height={32}
          disabled={!hostAudioCanSkip('room')}
          onClick={() => {
            hostAudioPrev('room')
            bumpHostUi()
          }}
        />
        <HudPill
          label={playing ? 'Pause' : 'Play'}
          width={80}
          height={32}
          primary
          onClick={() => {
            hostAudioSetPlaying(!playing, 'room')
            bumpHostUi()
          }}
        />
        <HudPill
          label="Next ›"
          width={80}
          height={32}
          disabled={!hostAudioCanSkip('room')}
          onClick={() => {
            hostAudioNext('room')
            bumpHostUi()
          }}
        />
        {muted === null ? null : (
          <HudPill
            label={muted ? 'Unmute' : 'Mute'}
            width={86}
            height={32}
            onClick={() => {
              hostAudioToggleMute()
              bumpHostUi()
            }}
          />
        )}
        {volume === null ? null : (
          <VolBox
            onUp={() => {
              hostAudioNudgeVolume(0.1)
              bumpHostUi()
            }}
            onDown={() => {
              hostAudioNudgeVolume(-0.1)
              bumpHostUi()
            }}
          />
        )}
      </HudPillRow>
      <HudHint text="Same source as the transport on the bottom bar — one of them pausing pauses both." />
    </HudSection>
  )
}


/** Admin climate controls — rain / snow now. Timed cycles land later. */
function WeatherPanel() {
  const fx = getAdminFxState()
  const rainStatus = fx.rain === 'off' && fx.snow === 'off' ? 'clear' : fx.rain !== 'off' ? fx.rain : fx.snow
  return (
    <HudUtilityPanel
      title="WEATHER"
      subtitle={`Now: ${rainStatus}. Guests see the sky. Timed auto cycles come later — pick by hand today.`}
      height={460}
      top={HUD.panelTop.top}
      right={HUD.right}
      onBack={() => { setActivePanel('host'); bumpHostUi() }}
      backLabel="Host"
      onClose={() => { setActivePanel('none'); bumpHostUi() }}
    >
        <SectionBox
          title="RAIN"
          status={fx.rain}
          statusColor={fx.rain === 'off' ? Color4.create(0.65, 0.68, 0.74, 1) : Color4.create(0.5, 0.78, 1, 1)}
          tint={{ r: 0.35, g: 0.65, b: 1 }}
        >
          <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
            <HostButton label="Off" tone={fx.rain === 'off' ? 'primary' : 'ghost'} onClick={() => { adminSetRain('off'); bumpHostUi() }} />
            <HostButton label="Light rain" tone={fx.rain === 'light' ? 'primary' : 'ghost'} onClick={() => { adminSetRain('light'); bumpHostUi() }} />
            <HostButton label="Storm" tone={fx.rain === 'storm' ? 'primary' : 'ghost'} onClick={() => { adminSetRain('storm'); bumpHostUi() }} />
          </UiEntity>
        </SectionBox>

        <SectionBox
          title="SNOW / BLIZZARD"
          status={fx.snow}
          statusColor={fx.snow === 'off' ? Color4.create(0.65, 0.68, 0.74, 1) : Color4.create(0.85, 0.92, 1, 1)}
          tint={{ r: 0.75, g: 0.85, b: 1 }}
        >
          <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
            <HostButton label="Off" tone={fx.snow === 'off' ? 'primary' : 'ghost'} onClick={() => { adminSetSnow('off'); bumpHostUi() }} />
            <HostButton label="Snow" tone={fx.snow === 'light' ? 'primary' : 'ghost'} onClick={() => { adminSetSnow('light'); bumpHostUi() }} />
            <HostButton label="Blizzard" tone={fx.snow === 'blizzard' ? 'primary' : 'ghost'} onClick={() => { adminSetSnow('blizzard'); bumpHostUi() }} />
          </UiEntity>
        </SectionBox>

        <SectionBox
          title="CYCLES"
          status="manual"
          statusColor={Color4.create(0.65, 0.68, 0.74, 1)}
          tint={{ r: 0.45, g: 0.55, b: 0.75 }}
        >
          <Label
            value="Manual only for now. Auto day/night weather cycles will land on this panel."
            fontSize={9}
            color={Color4.create(0.6, 0.64, 0.72, 1)}
          />
        </SectionBox>

      <HudPill
        label="CLEAR SKY"
        width={HUD_SIZE.utilW - HUD_SPACE.panel * 2}
        height={36}
        primary
        accent="purple"
        onClick={() => { adminSetRain('off'); adminSetSnow('off'); bumpHostUi() }}
      />
    </HudUtilityPanel>
  )
}

/** One darkening frame: four edge bands leaving the centre clear. Stacking a few
 *  of these at shrinking insets fakes the soft falloff DCL's flat UI can't draw. */
function VignetteFrame(props: { vPct: number; hPct: number; alpha: number }) {
  const shade = { color: Color4.create(0, 0, 0, props.alpha) }
  const pct = (n: number) => `${n}%` as `${number}%`
  const band = (
    position: Record<string, number>,
    width: `${number}%`,
    height: `${number}%`
  ) => (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position, width, height, pointerFilter: 'none' }}
      uiBackground={shade}
    />
  )
  const v = pct(props.vPct)
  const h = pct(props.hPct)
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}>
      {band({ top: 0, left: 0 }, pct(100), v)}
      {band({ bottom: 0, left: 0 }, pct(100), v)}
      {band({ top: 0, left: 0 }, h, pct(100))}
      {band({ top: 0, right: 0 }, h, pct(100))}
    </UiEntity>
  )
}

/** Full-screen flash / vignette visible to every client when Host Frenzy fires overlays.
 *  Every layer is absolutely positioned — as plain flex children they shared a row
 *  and the flash only ever painted the left edge of the screen. */
export function FxOverlayRoot() {
  const fx = getAdminFxState()
  const flash = fx.flashAlpha
  const vignette = fx.overlay === 'vignette'
  if (flash <= 0.02 && !vignette) return null
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'absolute', position: { top: 0, left: 0 }, zIndex: 5, pointerFilter: 'none' }}>
      {vignette ? (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}>
          <VignetteFrame vPct={30} hPct={22} alpha={0.3} />
          <VignetteFrame vPct={20} hPct={14} alpha={0.3} />
          <VignetteFrame vPct={11} hPct={7} alpha={0.3} />
          <VignetteFrame vPct={5} hPct={3} alpha={0.35} />
        </UiEntity>
      ) : null}
      {flash > 0.02 ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}
          uiBackground={{ color: Color4.create(1, 1, 1, Math.min(0.9, flash)) }}
        />
      ) : null}
    </UiEntity>
  )
}

/** Dedicated GUESTS panel — the roster + all people-management, on its own
 *  surface so the HOST console isn't cramped. "Show NPCs" folds the troupe in as
 *  flagged pseudo-guests so a host can rehearse before real guests arrive. */
function GuestHudPanel() {
  const config = getSocialConfig()
  if (!config) return null
  const roster = rosterForPanel()
  const selected = roster.find((g) => g.userId === selectedUserId) ?? null
  const selectedIsNpc = isNpcUser(selected?.userId ?? null)
  const zones = listRuntimeZones()
  const canSendReward = config.apps.hostConsole.modules.includes('rewards') && hasConfiguredRewardNft(config)
  const SLOTS = 8

  return (
    // Same shell as HOST: opening one from the other must not resize the corner.
    // Back to HOST is chrome, not a body button — closing everything just to
    // reopen HOST was a dead end ("it should just have a back button").
    <HudUtilityPanel
      title={`Guests · ${roster.length}`}
      height={600}
      top={HUD.panelTop.top}
      right={HUD.right}
      onBack={() => {
        setActivePanel('host')
        bumpHostUi()
      }}
      backLabel="Host"
      onClose={() => {
        setActivePanel('none')
        bumpHostUi()
      }}
    >

      {/* Practice toggle — fold the NPC troupe into the list. */}
      <UiEntity
        uiTransform={{
          width: '100%',
          height: 28,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: { left: 8, right: 8 },
          margin: { bottom: 8 }
        }}
        uiBackground={showNpcsInList ? roundedBg(0.2, 0.55, 0.4, 0.5) : CARD_BG}
        onMouseDown={() => {
          showNpcsInList = !showNpcsInList
          bumpHostUi()
        }}
      >
        <Label
          value={`${showNpcsInList ? '☑' : '☐'}  Show NPCs (practice)`}
          fontSize={12}
          color={Color4.White()}
        />
      </UiEntity>

      <UiEntity
        uiTransform={{
          width: '100%',
          height: SLOTS * 32,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'scroll',
          margin: { bottom: 8 }
        }}
      >
        {roster.map((guest) => (
          <GuestRow
            key={guest.userId}
            guest={guest}
            selected={guest.userId === selectedUserId}
            onSelect={() => {
              selectedUserId = guest.userId
              bumpHostUi()
            }}
          />
        ))}
        {Array.from({ length: Math.max(0, SLOTS - roster.length) }).map((_u, i) => (
          <UiEntity
            key={`empty-${i}`}
            uiTransform={{ width: '100%', height: 30, margin: { bottom: 2 } }}
            uiBackground={{ color: Color4.create(1, 1, 1, 0.03) }}
          />
        ))}
      </UiEntity>

      {selected ? (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
          <Label
            value={selectedIsNpc ? `${selected.name} · practice only` : `Selected: ${selected.name}`}
            fontSize={12}
            color={selectedIsNpc ? Color4.create(0.7, 0.85, 1, 1) : Color4.create(0.85, 0.88, 0.92, 1)}
            uiTransform={{ margin: { bottom: 6 } }}
          />
          <Input
            uiTransform={{ width: '100%', height: 40, margin: { bottom: 6 } }}
            placeholder="Private message…"
            color={INPUT_TEXT}
            placeholderColor={INPUT_PLACEHOLDER}
            uiBackground={INPUT_BG}
            onChange={(v) => {
              messageDraft = v
            }}
            onSubmit={(v) => {
              sendHostMessageTo(selected, v || messageDraft)
              messageDraft = ''
              bumpHostUi()
            }}
          />
          <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
            <HostButton
              label="Message"
              tone="primary"
              onClick={() => {
                sendHostMessageTo(selected, messageDraft)
                messageDraft = ''
                bumpHostUi()
              }}
            />
            <HostButton
              label="Boot"
              onClick={() => {
                if (selectedIsNpc) {
                  // Practice: the bot walks off far past the crowd and leaves
                  // the roster — booting must be VISIBLE, not a silent no-op.
                  bootedNpcIds.add(selected.userId)
                  hostDismissBot(npcIndexFromUserId(selected.userId))
                  showHostMessage(`${selected.name} booted (practice)`)
                } else {
                  hostBootGuest(selected.userId, selected.wallet)
                }
                selectedUserId = null
                bumpHostUi()
              }}
            />
            <HostButton
              label="Lock out"
              onClick={() => {
                if (!selectedIsNpc && selected.wallet) hostLockoutGuest(selected.wallet)
                bumpHostUi()
              }}
            />
            {selected.gateStatus === 'locked' && selected.wallet ? (
              <HostButton
                label="Unlock"
                onClick={() => {
                  hostUnlockGuest(selected.wallet!)
                  bumpHostUi()
                }}
              />
            ) : null}
            {canSendReward && !selectedIsNpc ? (
              <HostButton
                label="Send NFT"
                onClick={() => {
                  if (!selected.wallet) {
                    rewardStatusLine = 'Guest has no wallet'
                    bumpHostUi()
                    return
                  }
                  rewardStatusLine = 'Confirm in wallet…'
                  bumpHostUi()
                  void hostSendRewardNft(selected.wallet).then((result) => {
                    rewardStatusLine = result.ok
                      ? `Sent · ${result.txHash.slice(0, 10)}…`
                      : result.reason
                    bumpHostUi()
                  })
                }}
              />
            ) : null}
          </UiEntity>
          {rewardStatusLine && !selectedIsNpc ? (
            <Label
              value={rewardStatusLine}
              fontSize={11}
              color={Color4.create(0.85, 0.88, 0.92, 1)}
              uiTransform={{ margin: { top: 6 } }}
            />
          ) : null}
          {zones.length > 0 ? (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', margin: { top: 6 } }}>
              <Label
                value="Send to zone"
                fontSize={11}
                color={Color4.create(0.75, 0.78, 0.82, 1)}
                uiTransform={{ margin: { bottom: 4 } }}
              />
              <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
                {zones.map((zone) => (
                  <HostButton
                    key={zone.id}
                    label={zone.name.slice(0, 14)}
                    fontSize={10}
                    onClick={() => {
                      if (selectedIsNpc) {
                        // Practice: the NPC visibly WALKS to the zone so the host
                        // can learn which button is which zone.
                        const c = zoneCenterForHost(zone.id)
                        if (c) {
                          hostWalkBotTo(npcIndexFromUserId(selected.userId), c)
                          showHostMessage(`${selected.name} → ${zone.name} (practice)`)
                        }
                      } else {
                        hostSendToZone(selected.userId, zone.id)
                      }
                      bumpHostUi()
                    }}
                  />
                ))}
              </UiEntity>
            </UiEntity>
          ) : null}
        </UiEntity>
      ) : (
        <Label
          value="Select someone to message / boot / lock out / send to a zone."
          fontSize={11}
          color={Color4.Gray()}
          uiTransform={{ margin: { bottom: 10 } }}
        />
      )}
    </HudUtilityPanel>
  )
}

/**
 * Pins its child to the top-right (or bottom-right) corner of the SCREEN.
 *
 * It used to be an absolute node with `right: 0` but no size, which left its width to be
 * resolved against a parent that is itself one flex item in `hud-root`'s ROW container —
 * so the "right edge" it anchored to was somewhere mid-screen, and the launcher chips
 * drifted to the bottom-left of centre. Stretching this layer across the whole screen and
 * aligning the child within it measures the corner against the screen instead. Same
 * pattern as `screenLayer` in ui-kit and the dance-studio panel, which have always docked
 * correctly.
 */
function CornerLayer(props: {
  vertical: 'top' | 'bottom'
  children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[]
}) {
  return (
    <UiEntity
      uiTransform={{
        ...screenLayer(props.vertical === 'top' ? 'top-right' : 'bottom-right'),
        zIndex: 400,
      }}
    >
      {props.children}
    </UiEntity>
  )
}

/** A single launcher chip — identical shape/size for every button so the row
 *  reads as one ecosystem (no mismatched corners or offsets). */
function TransportChip(props: { label?: string; glyph?: 'pause'; on: boolean; onClick: () => void }) {
  return (
    <UiEntity
      uiTransform={{ height: 40, width: 40, justifyContent: 'center', alignItems: 'center', pointerFilter: 'block' }}
      uiBackground={roundedBg(props.on ? 0.18 : 0.1, props.on ? 0.72 : 0.35, props.on ? 0.5 : 0.32, props.on ? 1 : 0.28)}
      onMouseDown={props.onClick}
    >
      {props.glyph === 'pause' ? (
        <UiEntity uiTransform={{ width: 14, height: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <UiEntity uiTransform={{ width: 4, height: 17 }} uiBackground={{ color: Color4.White() }} />
          <UiEntity uiTransform={{ width: 4, height: 17 }} uiBackground={{ color: Color4.White() }} />
        </UiEntity>
      ) : (
        <Label value={props.label ?? ''} fontSize={16} color={Color4.White()} />
      )}
    </UiEntity>
  )
}

/**
 * The guest's background-music transport, bottom bar. Existing, working control —
 * kept exactly as it behaves, but it now goes through audio/host-transport.ts, the
 * same arbiter Host → AUDIO uses, so the two surfaces can never disagree about what
 * is playing. Its priority order (playlist → ambient bed → venue music) became that
 * arbiter's contract because it is the order that matches what a guest hears.
 */
function MusicTransport() {
  const hold = musicLocationHold()
  const playing = hostAudioPlaying()
  return (
    <UiEntity
      uiTransform={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        height: 40,
        margin: { right: HUD.toolbar.chipGap }
      }}
      uiBackground={roundedBg(0.12, 0.5, 0.44, 0.92)}
    >
      {hold ? (
        <UiEntity
          uiTransform={{
            height: 40,
            justifyContent: 'center',
            alignItems: 'center',
            padding: { left: 10, right: 10 },
            pointerFilter: 'none'
          }}
          uiBackground={roundedBg(0.08, 0.07, 0.05, 0.95)}
        >
          <Label
            value={`Muted · ${hold.label}`}
            fontSize={12}
            color={Color4.create(0.95, 0.85, 0.55, 1)}
            textAlign="middle-center"
            textWrap="nowrap"
          />
        </UiEntity>
      ) : null}
      <TransportChip
        label="«"
        on={false}
        onClick={() => {
          hostAudioPrev()
          bumpHostUi()
        }}
      />
      <TransportChip
        glyph="pause"
        on={!playing}
        onClick={() => {
          hostAudioSetPlaying(false)
          bumpHostUi()
        }}
      />
      <TransportChip
        label="▶"
        on={playing}
        onClick={() => {
          hostAudioSetPlaying(true)
          bumpHostUi()
        }}
      />
      <TransportChip
        label="»"
        on={false}
        onClick={() => {
          hostAudioNext()
          bumpHostUi()
        }}
      />
    </UiEntity>
  )
}

function LauncherChip(props: { label: string; r: number; g: number; b: number; onClick: () => void; last?: boolean }) {
  return (
    <UiEntity
      uiTransform={{
        width: 96,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        margin: props.last ? {} : { right: HUD.toolbar.chipGap },
        pointerFilter: 'block',
      }}
      uiBackground={roundedBg(props.r, props.g, props.b, 0.92)}
      onMouseDown={props.onClick}
    >
      <Label value={props.label} fontSize={15} color={Color4.White()} />
    </UiEntity>
  )
}

/** One launcher bar, bottom-right: DANCE[+play check] for everyone, HOST for admins.
 *  The purple check next to DANCE opts into the dance GAME (HUD/queue). DANCE itself
 *  only opens the studio/instructions panel — a separate second step.
 *
 *  The Dance Bug play/stop bar sits ABOVE this row (HUD.panel.miniBottom). Do not
 *  raise this dock without moving that slot too — they overlapped when both used
 *  flex-end + margin.
 *
 *  EVERY chip here is owned by an app the builder can switch off (see
 *  shared/venue-app-contract.ts). Exchange used to be drawn unconditionally,
 *  which meant a venue could show buttons its owner had no card for and no way
 *  to remove. Do not add an ungated chip. */
function LauncherBar(props: {
  showHost: boolean
  /** The Garden console. Its OWN chip, not a door inside HOST — see HostHudRoot. */
  showGarden: boolean
  showGuests: boolean
  showDance: boolean
  showWeather: boolean
  showExchange: boolean
  showMusic: boolean
}) {
  const inGame = props.showDance && isParticipating()
  return (
    <CornerLayer vertical="bottom">
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { right: HUD.right, bottom: HUD.toolbar.bottom },
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        {props.showExchange ? (
          <LauncherChip
            label="EXCHANGE"
            r={0.86}
            g={0.12}
            b={0.4}
            onClick={openExchange}
          />
        ) : null}
        {props.showMusic ? (
          <MusicTransport />
        ) : null}
        {props.showDance ? (
          // One connected control: [ DANCE | ☐ Join ]. Left half opens the studio;
          // the right half is a real checkbox that joins/leaves the dance game.
          <UiEntity
            uiTransform={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              height: 40,
              margin: { right: HUD.toolbar.chipGap }
            }}
            uiBackground={roundedBg(0.4, 0.2, 0.75, 0.92)}
          >
            <UiEntity
              uiTransform={{ height: 40, justifyContent: 'center', alignItems: 'center', padding: { left: 12, right: 10 }, pointerFilter: 'block' }}
              onMouseDown={() => { setActivePanel('dance'); bumpHostUi() }}
            >
              <Label value="DANCE" fontSize={15} color={Color4.White()} />
            </UiEntity>
            <UiEntity
              uiTransform={{ height: 40, flexDirection: 'row', alignItems: 'center', padding: { left: 2, right: 12 }, pointerFilter: 'block' }}
              onMouseDown={() => { toggleParticipating(); bumpHostUi() }}
            >
              {/* An actual box: filled green with ✓ when joined, empty outline when not. */}
              <UiEntity
                uiTransform={{ width: 22, height: 22, justifyContent: 'center', alignItems: 'center', margin: { right: 6 } }}
                uiBackground={roundedBg(inGame ? 0.3 : 1, inGame ? 0.85 : 1, inGame ? 0.45 : 1, inGame ? 1 : 0.22)}
              >
                {inGame ? <Label value="✓" fontSize={16} color={Color4.create(0.05, 0.15, 0.05, 1)} textAlign="middle-center" /> : null}
              </UiEntity>
              <Label value={inGame ? 'In' : 'Join'} fontSize={12} color={Color4.White()} textAlign="middle-center" />
            </UiEntity>
          </UiEntity>
        ) : null}
        {props.showGuests ? (
          <LauncherChip label="GUESTS" r={0.15} g={0.55} b={0.5} onClick={() => { setActivePanel('guests'); bumpHostUi() }} />
        ) : null}
        {props.showWeather ? (
          <LauncherChip label="WEATHER" r={0.28} g={0.55} b={0.92} onClick={() => { setActivePanel('weather'); bumpHostUi() }} />
        ) : null}
        {props.showGarden ? (
          <LauncherChip label="GARDEN" r={0.35} g={0.7} b={0.28} onClick={() => { setActivePanel('garden-console'); bumpHostUi() }} />
        ) : null}
        {props.showHost ? (
          <LauncherChip label="HOST" r={0.85} g={0.2} b={0.35} last onClick={() => { setActivePanel('host'); bumpHostUi() }} />
        ) : null}
      </UiEntity>
    </CornerLayer>
  )
}

export function HostHudRoot() {
  const config = getSocialConfig()
  const _tick = getRosterUiTick() + renderVersion + getSpeakeasyTick()
  void _tick

  const admin = !!config && config.apps.hostConsole.enabled && isAdmin(config)
  const showDance = isDanceStudioEnabled()
  const active = getActivePanel()

  // Launcher shows only when no big panel is open (the open panel owns the
  // bottom-right corner). DANCE for everyone; GUESTS + HOST for admins.
  // The map lives top-right (9 to toggle) and is not a launcher chip.
  if (active === 'none')
    return (
      <LauncherBar
        showHost={admin}
        // GATED ON THE GARDEN PLUGIN ALONE, never on hostConsole.
        //
        // The console shipped as a pill inside the HOST panel, and on the owner's
        // own LAND hostConsole.enabled was false — so the door to it did not exist,
        // on a scene with nine beds and the Garden app switched on. "I don't have
        // controls, all of that is not here." A plugin's admin surface must never
        // depend on a DIFFERENT app being on: it self-gates on its own plugin plus
        // admin, and it needs its own way in.
        showGarden={isGardenConsoleAvailable()}
        showGuests={admin && config.apps.hostConsole.modules.includes('guests')}
        showDance={showDance}
        showWeather={admin && config.apps.weather?.enabled === true}
        showExchange={config?.apps.exchange.enabled === true}
        showMusic={hasHostAudio() || !!musicLocationHold()}
      />
    )
  if (active === 'weather') {
    return admin && config.apps.weather?.enabled === true ? (
      <CornerLayer vertical="top">
        <WeatherPanel />
      </CornerLayer>
    ) : null
  }
  if (active === 'dance-admin') {
    // Self-gates on plugin + admin; Host is just the door to it.
    return <DanceAdminRoot />
  }
  if (active === 'garden-console') {
    // Self-gates on plugin + admin; Host is just the door to it.
    return <GardenConsoleRoot />
  }
  if (active === 'guests') {
    return admin && config.apps.hostConsole.modules.includes('guests') ? (
      <CornerLayer vertical="top">
        <GuestHudPanel />
      </CornerLayer>
    ) : null
  }
  if (active !== 'host') return null
  if (!admin) return null

  if (hudMinimized) {
    // Compact top-right pill — doesn't cover the scene. Click "HOST" to expand
    // (no separate restore icon — the broken box glyph read as a tofu square).
    return (
      <CornerLayer vertical="top">
        <UiEntity
          uiTransform={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            padding: { left: 4, right: 6, top: 6, bottom: 6 },
            margin: { top: HUD.panelTop.top, right: HUD.right },
          }}
          uiBackground={PANEL_BASE}
        >
          <UiEntity
            uiTransform={{
              height: 26,
              justifyContent: 'center',
              alignItems: 'center',
              padding: { left: 10, right: 10 },
              margin: { right: 6 },
            }}
            uiBackground={roundedBg(0.85, 0.22, 0.36, 0.92)}
            onMouseDown={() => {
              hudMinimized = false
              bumpHostUi()
            }}
          >
            <Label value="HOST" fontSize={13} color={Color4.White()} />
          </UiEntity>
          <Button
            value="×"
            fontSize={13}
            uiTransform={{ width: 26, height: 26 }}
            uiBackground={CARD_BG}
            onMouseDown={() => {
              setActivePanel('none')
              hudMinimized = false
              bumpHostUi()
            }}
          />
        </UiEntity>
      </CornerLayer>
    )
  }

  return (
    <CornerLayer vertical="top">
      <HostHudPanel />
    </CornerLayer>
  )
}

/** Admin-only diagnostic line (bottom of screen): prints the REAL dance runtime
 *  state so an empty-looking floor can be read at a glance — "dance loaded? npc
 *  on? how many bots spawned? show running? floor resolved?". Hidden by default
 *  now that the UI is being cleaned up; flip SHOW_DANCE_DIAG to bring it back for
 *  troubleshooting. */
const SHOW_DANCE_DIAG = false
export function DanceDiagRoot() {
  if (!SHOW_DANCE_DIAG) return null
  void (getRosterUiTick() + renderVersion)
  const config = getSocialConfig()
  if (!config || !isAdmin(config)) return null
  const dance = getDanceConfig()
  const line = !dance
    ? 'DIAG dance: NOT LOADED — social.dance.enabled is false in the published config'
    : (() => {
        const d = troupeDiag()
        const where = d.sample ? ` @${d.sample.x},${d.sample.z}` : ''
        // When no bots exist, show spawn attempts + captured errors so an empty
        // floor explains itself (runs:0 = spawner never ran → an init step threw,
        // named in init:...).
        const init = danceInitReport()
        const why = d.bots === 0 ? ` runs:${d.runs} err:${d.error || 'none'}${init ? ` init:${init}` : ''}` : ''
        // Outfit visibility: out = owner's saved DCL outfits, wear = shared
        // wearable list (Marketplace links). Both 0 → the crew is on built-in
        // looks because no custom clothing reached the published config.
        const fit = ` out:${dance.npc.outfits.length} wear:${dance.npc.wearables.length}`
        const net = ` net:${d.sync.role}/${d.sync.attached ? 'attached' : 'WAIT'}/${d.sync.roomStateReady ? 'ready' : 'syncing'} r${d.sync.revision}`
        return `DIAG dance:on npc:${dance.npc.enabled ? 'on' : 'OFF'} count:${dance.npc.count} bots:${d.bots}${net} ${crowdDirectorDiag()} show:${isDanceActivated() ? 'RUNNING' : 'stopped'} floor:${d.floorOk ? 'ok' : 'MISSING'}${fit}${where}${why}`
      })()
  const bad =
    !dance ||
    !dance.npc.enabled ||
    dance.npc.count === 0 ||
    troupeDiag().bots === 0 ||
    !troupeDiag().floorOk
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%' }}>
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { bottom: 22 },
          width: '100%',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Label
          value={line}
          fontSize={12}
          color={bad ? Color4.create(1, 0.4, 0.4, 0.95) : Color4.create(0.5, 1, 0.6, 0.95)}
        />
      </UiEntity>
    </UiEntity>
  )
}

/**
 * Wire the host console's own refresh hook. The UI TREE itself is mounted by
 * scene/src/hud-root.tsx, which runs for every scene — this module only owns the
 * host surfaces inside it.
 */
export function initHostUi(): void {
  setAdminFxUiRefresh(bumpHostUi)
  // Both live-updating admin surfaces share this one render counter.
  setDanceAdminRefresh(bumpHostUi)
  setGardenConsoleRefreshHook(bumpHostUi)
  setNpcActivityRefresh(bumpHostUi)
  setAnnouncementRefresh(bumpHostUi)
  setDanceBugChipRefresh(bumpHostUi)
  setPanelRefresh(bumpHostUi)
}

export function refreshHostUi(): void {
  bumpHostUi()
}
