export const LIVE_EVENTS_BOARD_VERSION = 1 as const;

export interface LiveEventsBoardConfig {
  version: typeof LIVE_EVENTS_BOARD_VERSION;
  enabled: boolean;
  /** Scene-local DCL coordinates. */
  placement: {
    x: number;
    y: number;
    z: number;
    yawDeg: number;
  };
  onlyLive: boolean;
  limit: number;
  refreshSeconds: number;
}

export function defaultLiveEventsBoardConfig(): LiveEventsBoardConfig {
  return {
    version: LIVE_EVENTS_BOARD_VERSION,
    enabled: false,
    placement: { x: 8, y: 2.2, z: 14.5, yawDeg: 180 },
    onlyLive: true,
    limit: 5,
    refreshSeconds: 120,
  };
}

function finite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

export function normalizeLiveEventsBoardConfig(
  partial: Partial<LiveEventsBoardConfig> | null | undefined
): LiveEventsBoardConfig {
  const base = defaultLiveEventsBoardConfig();
  const placement = partial?.placement ?? base.placement;
  return {
    version: LIVE_EVENTS_BOARD_VERSION,
    enabled: Boolean(partial?.enabled),
    placement: {
      x: clamp(placement.x, 0.5, 15.5, base.placement.x),
      y: clamp(placement.y, 0.8, 12, base.placement.y),
      z: clamp(placement.z, 0.5, 15.5, base.placement.z),
      yawDeg: clamp(placement.yawDeg, -360, 360, base.placement.yawDeg),
    },
    onlyLive: partial?.onlyLive !== false,
    limit: Math.round(clamp(partial?.limit, 1, 10, base.limit)),
    refreshSeconds: Math.round(
      clamp(partial?.refreshSeconds, 30, 900, base.refreshSeconds)
    ),
  };
}
