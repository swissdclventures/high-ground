/**
 * Named stage performances for the Breakdance Host CHOREOGRAPHY picker.
 *
 * The engine stays tiny on purpose: a routine is a formation + role counts +
 * per-role emote tracks. Add a row to CHOREOGRAPHY_ROUTINES to ship a new show.
 *
 * Emote sources (NPCs trigger these directly; visitors do not need Emote Library):
 *   - house / studio clips — scene paths like `emotes/….glb`
 *   - free DCL base emotes — slugs like `raiseHand`, `disco`, `money`
 */

export type ChoreographyFormationKind =
  | "chevron"
  | "ranks"
  | "front_and_backup"
  | "line";

export type ChoreographyRoleKind = "lead" | "backup" | "idle";

export const CHOREOGRAPHY_FORMATIONS: readonly ChoreographyFormationKind[] = [
  "chevron",
  "ranks",
  "front_and_backup",
  "line",
] as const;

export interface ChoreographyTracks {
  lead: string[];
  backup: string[];
  idle: string[];
}

export interface ChoreographyRoutine {
  id: string;
  title: string;
  shortTitle: string;
  blurb: string;
  formation: ChoreographyFormationKind;
  performerCount: number;
  leadCount: number;
  backupCount: number;
  tracks: ChoreographyTracks;
  moveDurationMs: number;
  loop: boolean;
  formationSpacing: number;
  audienceYawDeg: number;
}

/** Venue overlay — published dance.choreography plus an optional live pick. */
export interface ChoreographyVenueOverlay {
  activeRoutineId?: string;
  formation?: ChoreographyFormationKind;
  performerCount?: number;
  leadCount?: number;
  backupCount?: number;
  moves?: string[];
  backupMoves?: string[];
  idleMoves?: string[];
  moveDurationMs?: number;
  loop?: boolean;
  formationSpacing?: number;
  audienceYawDeg?: number;
}

const HOUSE = {
  uprock: "emotes/bd_uprock_new_emote.glb",
  steps3: "emotes/bboy_uprock_emote.glb",
  steps2: "emotes/bboy_hiphop_move_new_emote.glb",
  footwork1: "emotes/bd_footwork_to_freeze_emote.glb",
  freeze1: "emotes/bd_freeze_var_3_emote.glb",
  footwork2: "emotes/bd_footwork_to_idle_2_fixed_emote.glb",
  rockToGround: "emotes/bd_uprock_to_ground_new_emote.glb",
  smoothHip: "emotes/snake_hiphop_new_emote.glb",
  windDown: "emotes/bd_ending_new_2_emote.glb",
  ready: "emotes/bd_ready_3_x2_emote.glb",
} as const;

const BASE = {
  disco: "disco",
  tektonik: "tektonik",
  tik: "tik",
  robot: "robot",
  raiseHand: "raiseHand",
  clap: "clap",
  wave: "wave",
  kiss: "kiss",
  handsair: "handsair",
  fistpump: "fistpump",
  money: "money",
  dab: "dab",
  shrug: "shrug",
  dontsee: "dontsee",
} as const;

export const DEFAULT_CHOREOGRAPHY_ROUTINE_ID = "break-crew";

/**
 * Starter pack. Keep ids stable — the Host picker and live snapshots key off them.
 * A later march / K-pop / lock-in routine is another object in this list.
 */
export const CHOREOGRAPHY_ROUTINES: readonly ChoreographyRoutine[] = [
  {
    id: "break-crew",
    title: "Break crew",
    shortTitle: "Break crew",
    blurb: "Nine dancers in a chevron, same house footwork together.",
    formation: "chevron",
    performerCount: 9,
    leadCount: 9,
    backupCount: 0,
    tracks: {
      lead: [
        HOUSE.uprock,
        HOUSE.steps3,
        HOUSE.steps2,
        HOUSE.footwork1,
        HOUSE.freeze1,
        HOUSE.footwork2,
        HOUSE.rockToGround,
        HOUSE.smoothHip,
        HOUSE.windDown,
      ],
      backup: [],
      idle: [],
    },
    moveDurationMs: 4500,
    loop: true,
    formationSpacing: 1.35,
    audienceYawDeg: 180,
  },
  {
    id: "military-ranks",
    title: "Military ranks",
    shortTitle: "Ranks",
    blurb: "Three ranks standing at attention. A march clip can replace the drill later.",
    formation: "ranks",
    performerCount: 9,
    leadCount: 9,
    backupCount: 0,
    tracks: {
      lead: [BASE.raiseHand, BASE.robot, BASE.clap, BASE.raiseHand],
      backup: [],
      idle: [],
    },
    moveDurationMs: 3500,
    loop: true,
    formationSpacing: 1.45,
    audienceYawDeg: 180,
  },
  {
    id: "boy-band",
    title: "Boy band",
    shortTitle: "Boy band",
    blurb: "One singer up front; backups groove; extras idle behind.",
    formation: "front_and_backup",
    performerCount: 9,
    leadCount: 1,
    backupCount: 4,
    tracks: {
      lead: [BASE.disco, BASE.tektonik, BASE.tik, BASE.disco],
      backup: [BASE.wave, BASE.kiss, BASE.handsair, BASE.wave],
      idle: [HOUSE.ready],
    },
    moveDurationMs: 4000,
    loop: true,
    formationSpacing: 1.4,
    audienceYawDeg: 180,
  },
  {
    id: "hip-hop",
    title: "Hip hop",
    shortTitle: "Hip hop",
    blurb: "One lead at the front; backups throw money / dab / pump behind.",
    formation: "front_and_backup",
    performerCount: 9,
    leadCount: 1,
    backupCount: 5,
    tracks: {
      lead: [HOUSE.smoothHip, HOUSE.steps2, HOUSE.uprock],
      backup: [BASE.money, BASE.dab, BASE.fistpump, BASE.robot, BASE.dontsee],
      idle: [HOUSE.ready],
    },
    moveDurationMs: 4500,
    loop: true,
    formationSpacing: 1.4,
    audienceYawDeg: 180,
  },
  {
    id: "attention",
    title: "Stand at attention",
    shortTitle: "Attention",
    blurb: "Silent ranks. Salute, hold, salute.",
    formation: "ranks",
    performerCount: 9,
    leadCount: 9,
    backupCount: 0,
    tracks: {
      lead: [BASE.raiseHand, BASE.shrug, BASE.raiseHand],
      backup: [],
      idle: [],
    },
    moveDurationMs: 5000,
    loop: true,
    formationSpacing: 1.5,
    audienceYawDeg: 180,
  },
];

export function choreographyRoutineById(id: string | null | undefined): ChoreographyRoutine | undefined {
  if (!id) return undefined;
  return CHOREOGRAPHY_ROUTINES.find((routine) => routine.id === id);
}

export function defaultChoreographyRoutine(): ChoreographyRoutine {
  return CHOREOGRAPHY_ROUTINES.find((routine) => routine.id === DEFAULT_CHOREOGRAPHY_ROUTINE_ID)
    ?? CHOREOGRAPHY_ROUTINES[0]!;
}

export function isChoreographyFormationKind(value: unknown): value is ChoreographyFormationKind {
  return typeof value === "string" && (CHOREOGRAPHY_FORMATIONS as readonly string[]).includes(value);
}

function cloneTracks(tracks: ChoreographyTracks): ChoreographyTracks {
  return {
    lead: [...tracks.lead],
    backup: [...tracks.backup],
    idle: [...tracks.idle],
  };
}

function cloneRoutine(routine: ChoreographyRoutine): ChoreographyRoutine {
  return { ...routine, tracks: cloneTracks(routine.tracks) };
}

/**
 * Live pick wins, then the published activeRoutineId, then the starter break crew.
 *
 * Catalogue rows own formation, roles, and tracks so a Host pick cannot inherit
 * the previous show. Venue overlay only applies stage facing / spacing, plus
 * break-crew lead-move customisation for already-published recipes.
 */
export function resolveChoreographyRoutine(
  overlay?: ChoreographyVenueOverlay | null,
  liveRoutineId?: string | null
): ChoreographyRoutine {
  const id = (liveRoutineId || overlay?.activeRoutineId || "").trim() || DEFAULT_CHOREOGRAPHY_ROUTINE_ID;
  const found = choreographyRoutineById(id) ?? defaultChoreographyRoutine();
  const resolved = cloneRoutine(found);

  if (typeof overlay?.formationSpacing === "number" && overlay.formationSpacing > 0) {
    resolved.formationSpacing = overlay.formationSpacing;
  }
  if (typeof overlay?.audienceYawDeg === "number") {
    resolved.audienceYawDeg = overlay.audienceYawDeg;
  }

  if (resolved.id !== DEFAULT_CHOREOGRAPHY_ROUTINE_ID) return resolved;

  if (typeof overlay?.performerCount === "number" && overlay.performerCount >= 1) {
    resolved.performerCount = Math.min(24, Math.max(1, Math.round(overlay.performerCount)));
    resolved.leadCount = resolved.performerCount;
  }
  if (typeof overlay?.moveDurationMs === "number" && overlay.moveDurationMs >= 800) {
    resolved.moveDurationMs = Math.min(30000, Math.round(overlay.moveDurationMs));
  }
  if (typeof overlay?.loop === "boolean") resolved.loop = overlay.loop;
  if (overlay?.moves?.length) resolved.tracks.lead = [...overlay.moves];
  return resolved;
}

export function choreographyRoleForIndex(
  routine: Pick<ChoreographyRoutine, "leadCount" | "backupCount">,
  performerIndex: number
): ChoreographyRoleKind {
  if (performerIndex < Math.max(0, routine.leadCount)) return "lead";
  if (performerIndex < Math.max(0, routine.leadCount) + Math.max(0, routine.backupCount)) return "backup";
  return "idle";
}

export function choreographyTrackForRole(
  routine: Pick<ChoreographyRoutine, "tracks">,
  role: ChoreographyRoleKind
): string[] {
  const track = routine.tracks[role];
  if (track.length) return track;
  if (routine.tracks.lead.length) return routine.tracks.lead;
  return ["robot"];
}

export interface ChoreographyBeat {
  beat: number;
  elapsedMs: number;
  loopComplete: boolean;
}

/** Shared wall-clock beat for every role. Tracks may be different lengths. */
export function choreographyBeatAt(
  moveDurationMs: number,
  loop: boolean,
  startedAt: number,
  now: number,
  totalBeats = 1
): ChoreographyBeat | null {
  const dur = Math.max(800, moveDurationMs);
  const beats = Math.max(1, totalBeats);
  const elapsed = Math.max(0, now - startedAt);
  const total = beats * dur;
  if (!loop && elapsed >= total) {
    return { beat: beats - 1, elapsedMs: elapsed, loopComplete: true };
  }
  const cycle = loop ? elapsed % total : elapsed;
  return {
    beat: Math.min(beats - 1, Math.floor(cycle / dur)),
    elapsedMs: elapsed,
    loopComplete: !loop && elapsed >= total,
  };
}

export function choreographyEmoteAt(moves: readonly string[], beat: number): string {
  if (!moves.length) return "robot";
  const index = ((beat % moves.length) + moves.length) % moves.length;
  return moves[index] ?? "robot";
}

export function longestChoreographyTrack(routine: Pick<ChoreographyRoutine, "tracks">): number {
  return Math.max(
    1,
    routine.tracks.lead.length,
    routine.tracks.backup.length,
    routine.tracks.idle.length
  );
}

export interface ChoreographySlot {
  x: number;
  z: number;
  row: number;
  col: number;
}

/**
 * Formation slots in a local frame: −Z is toward the audience before yaw is applied.
 * Chevron stays the original 1–2–3–3 dance-group layout.
 */
export function choreographyFormationSlot(
  performerIndex: number,
  centerX: number,
  centerZ: number,
  spacing: number,
  formation: ChoreographyFormationKind = "chevron",
  performerCount = 9
): ChoreographySlot {
  const gap = Math.max(0.5, spacing);
  const count = Math.max(1, performerCount);
  const index = Math.max(0, performerIndex);

  if (formation === "ranks") {
    const cols = Math.min(3, count);
    const row = Math.floor(index / cols);
    const col = index % cols;
    const rows = Math.max(1, Math.ceil(count / cols));
    const rowSize = Math.min(cols, count - row * cols);
    const xOffset = (col - (rowSize - 1) / 2) * gap;
    const zOffset = (row - (rows - 1) / 2) * gap;
    return { row, col, x: centerX + xOffset, z: centerZ + zOffset };
  }

  if (formation === "line") {
    const xOffset = (index - (count - 1) / 2) * gap;
    return { row: 0, col: index, x: centerX + xOffset, z: centerZ };
  }

  if (formation === "front_and_backup") {
    if (index === 0) {
      return { row: 0, col: 0, x: centerX, z: centerZ - gap * 1.35 };
    }
    const behind = index - 1;
    const backCount = Math.max(1, count - 1);
    const frontRow = Math.min(4, backCount);
    if (behind < frontRow) {
      const xOffset = (behind - (frontRow - 1) / 2) * gap;
      return { row: 1, col: behind, x: centerX + xOffset, z: centerZ + gap * 0.15 };
    }
    const rearIndex = behind - frontRow;
    const rearCount = Math.max(1, backCount - frontRow);
    const xOffset = (rearIndex - (rearCount - 1) / 2) * gap;
    return { row: 2, col: rearIndex, x: centerX + xOffset, z: centerZ + gap * 1.2 };
  }

  const rowSizes = [1, 2, 3, 3];
  let row = 0;
  let firstInRow = 0;
  while (row < rowSizes.length - 1 && index >= firstInRow + rowSizes[row]!) {
    firstInRow += rowSizes[row]!;
    row += 1;
  }
  const rowSize = rowSizes[row]!;
  const col = index - firstInRow;
  const xOffset = (col - (rowSize - 1) / 2) * gap;
  const zOffset = (row - 1.5) * gap * 0.78;
  return {
    row,
    col,
    x: centerX + xOffset,
    z: centerZ + zOffset,
  };
}
