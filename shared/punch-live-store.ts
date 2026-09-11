/**
 * THE LIVE PUNCH WIRE — REST against the same Supabase project as the board.
 *
 * DCL's Multiplayer Server room does not cross desktop `fixed-adapter` and
 * mobile `livekit` on a single-scene World. MessageBus rides that same split.
 * This store does not: both Explorers `fetch` the same rows.
 *
 * Trust is punch_board's: the anon key is in the published bundle. A client
 * can inflate the game; it cannot delete the tables (REVOKE DELETE).
 */
import {
  punchBoardEnabled,
  punchBoardHeaders,
  type PunchBoardStoreConfig,
} from "./punch-board-store";

export const PUNCH_LIVE_STATE_TABLE = "punch_live_state";
export const PUNCH_LIVE_ACTION_TABLE = "punch_live_action";

export function punchLiveEnabled(config: PunchBoardStoreConfig): boolean {
  return punchBoardEnabled(config);
}

export function punchLiveHeaders(
  config: PunchBoardStoreConfig,
): Record<string, string> {
  return punchBoardHeaders(config);
}

export function punchLiveVenue(config: PunchBoardStoreConfig): string {
  return config.venue.trim() || "default";
}

/** Newest snapshot for every cabinet at this venue. */
export function punchLiveStateReadUrl(config: PunchBoardStoreConfig): string {
  const venue = encodeURIComponent(punchLiveVenue(config));
  return `${config.url}/rest/v1/${PUNCH_LIVE_STATE_TABLE}?select=venue,machine_id,coordinator_id,sent_at,revision,body&venue=eq.${venue}`;
}

export function punchLiveStateWriteUrl(config: PunchBoardStoreConfig): string {
  return `${config.url}/rest/v1/${PUNCH_LIVE_STATE_TABLE}?on_conflict=venue,machine_id`;
}

/** Actions after `afterId`, oldest first. */
export function punchLiveActionReadUrl(
  config: PunchBoardStoreConfig,
  afterId: number,
): string {
  const venue = encodeURIComponent(punchLiveVenue(config));
  const after = Math.max(0, Math.floor(afterId));
  return `${config.url}/rest/v1/${PUNCH_LIVE_ACTION_TABLE}?select=id,venue,machine_id,sender,event,sent_at,body&venue=eq.${venue}&id=gt.${after}&order=id.asc&limit=80`;
}

export function punchLiveActionWriteUrl(config: PunchBoardStoreConfig): string {
  return `${config.url}/rest/v1/${PUNCH_LIVE_ACTION_TABLE}`;
}

export function punchLiveActionHeadUrl(config: PunchBoardStoreConfig): string {
  const venue = encodeURIComponent(punchLiveVenue(config));
  return `${config.url}/rest/v1/${PUNCH_LIVE_ACTION_TABLE}?select=id&venue=eq.${venue}&order=id.desc&limit=1`;
}

export interface PunchLiveStateRow {
  venue: string;
  machine_id: string;
  coordinator_id: string;
  sent_at: number;
  revision: number;
  body: unknown;
}

export interface PunchLiveActionRow {
  id: number;
  venue: string;
  machine_id: string;
  sender: string;
  event: string;
  sent_at: number;
  body: unknown;
}

export function parsePunchLiveStateRows(payload: unknown): PunchLiveStateRow[] {
  if (!Array.isArray(payload)) return [];
  const rows: PunchLiveStateRow[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const machineId =
      typeof row.machine_id === "string" ? row.machine_id.trim() : "";
    if (!machineId) continue;
    rows.push({
      venue: typeof row.venue === "string" ? row.venue : "",
      machine_id: machineId,
      coordinator_id:
        typeof row.coordinator_id === "string"
          ? row.coordinator_id.trim().toLowerCase()
          : "",
      sent_at: Number(row.sent_at) || 0,
      revision: Number(row.revision) || 0,
      body: row.body,
    });
  }
  return rows;
}

export function parsePunchLiveActionRows(payload: unknown): PunchLiveActionRow[] {
  if (!Array.isArray(payload)) return [];
  const rows: PunchLiveActionRow[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = Number(row.id);
    const event = typeof row.event === "string" ? row.event : "";
    if (!Number.isFinite(id) || id <= 0 || !event) continue;
    rows.push({
      id,
      venue: typeof row.venue === "string" ? row.venue : "",
      machine_id:
        typeof row.machine_id === "string" ? row.machine_id.trim() : "",
      sender:
        typeof row.sender === "string" ? row.sender.trim().toLowerCase() : "",
      event,
      sent_at: Number(row.sent_at) || 0,
      body: row.body && typeof row.body === "object" ? row.body : {},
    });
  }
  return rows;
}
