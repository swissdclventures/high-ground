/**
 * World emote library — the extra scene-packaged collection this venue adds on
 * top of the portable Studio/DCL/Wallet remix HUD.
 *
 * The replacement HUD (scene/src/dance-studio/ui.tsx) shows one WORLD button
 * when swissverse.emote-library is on. That button opens this list. The
 * host-ui DANCE chip only opens the replacement HUD; it is not this button.
 */

export type LandLibraryCategory = "studio" | "base" | "owned";

export interface RuntimeWorldEmoteMove {
  kind: "scene";
  name: string;
  src: string;
  durationMs: number;
}

export function isLandLibraryButtonVisible(emoteLibraryEnabled: boolean): boolean {
  return emoteLibraryEnabled === true;
}

/** Reads apps.emoteLibrary.enabled on the social config. */
export function isEmoteLibraryAppEnabled(
  config: { apps?: { emoteLibrary?: { enabled?: boolean } } } | null | undefined,
): boolean {
  return config?.apps?.emoteLibrary?.enabled === true;
}

export function filterLandLibraryMoves<T extends { category?: LandLibraryCategory }>(
  moves: readonly T[],
  flags: { includeHouse: boolean; includeOwned: boolean },
): T[] {
  return moves.filter((move) => {
    const category = move.category ?? "studio";
    if (category === "studio") return flags.includeHouse;
    if (category === "owned") return flags.includeOwned;
    return false;
  });
}

/**
 * The scene's WORLD shelf after publish. Authoring-only selections have no
 * `src` and are ignored; a published selection always points at an embedded GLB.
 */
export function worldEmoteMovesFromConfig(
  config: {
    apps?: {
      emoteLibrary?: {
        enabled?: boolean;
        worldEmotes?: Array<{ id?: unknown; name?: unknown; src?: unknown; durationMs?: unknown }>;
        assignments?: { danceBug?: unknown };
      };
    };
  } | null | undefined,
): RuntimeWorldEmoteMove[] {
  const app = config?.apps?.emoteLibrary;
  if (app?.enabled !== true || !Array.isArray(app.worldEmotes)) return [];
  const assigned = Array.isArray(app.assignments?.danceBug)
    ? new Set(app.assignments.danceBug.filter((id): id is string => typeof id === "string"))
    : null;
  return app.worldEmotes.flatMap((row) => {
    const id = typeof row?.id === "string" ? row.id.trim() : "";
    if (assigned && (!id || !assigned.has(id))) return [];
    const src = typeof row?.src === "string" ? row.src.trim() : "";
    if (!src) return [];
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : "World emote";
    const durationMs = Math.max(500, Math.min(60_000, Math.round(Number(row.durationMs) || 4000)));
    return [{ kind: "scene" as const, name, src, durationMs }];
  });
}
