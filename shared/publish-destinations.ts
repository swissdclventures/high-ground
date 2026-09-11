/**
 * Publishing DESTINATIONS as separate, explicitly configured routes.
 *
 * Before this module there was one setting — `WorldsServerMode` ("dcl" |
 * "custom") plus a URL and a kind — and a hardcoded pair rule
 * (`worldMirrorPair`) that said "whichever server you did not upload to gets a
 * copy automatically". Three consequences the owner lived with:
 *
 *   1. The three real destinations (Decentraland, the self-hosted
 *      worlds-content-server, the self-hosted catalyrst node) could never all be
 *      configured at once: picking one self-hosted option OVERWROTE the stored
 *      URL of the other, so the other silently left the pair.
 *   2. Publishing to one destination always published to a second one, with no
 *      way to say otherwise.
 *   3. There was no "default" — the active upload target was the default by
 *      accident, and switching it retargeted every future publish.
 *
 * A destination here is a route with its own identity, its own server, its own
 * ENTRY ROUTE (how a visitor reaches content on it), and therefore its own
 * status. Nothing in this file touches the network, the DOM, or storage.
 */

/* -------------------------------------------------------------------------- */
/* Destinations                                                                */
/* -------------------------------------------------------------------------- */

export type DestinationKind = "decentraland" | "worlds-server" | "catalyst" | "custom";

/**
 * HOW a visitor reaches content on this destination. This is the field that
 * decides what "live" means, so it must never be inferred from the URL.
 *
 * - `name`  — the visitor enters by World NAME (`/goto`, a jump link, the world
 *   explorer, anything shared publicly). Decentraland's client re-resolves
 *   content against its own content server, and paints the last COMPLETE
 *   Windows asset-bundle conversion. So a `name` destination is not finished
 *   when it lists the entity; it is finished when Decentraland has converted it.
 * - `realm` — the visitor enters through a `decentraland:///?realm=<url>` deep
 *   link straight into this server. No name resolution, no Decentraland asset
 *   bundle registry, no conversion queue. The destination is live the moment it
 *   lists the entity, which is why waiting on conversion here is an invented
 *   delay rather than a real one.
 */
export type EntryRoute = "name" | "realm";

export interface PublishDestination {
  id: string;
  label: string;
  kind: DestinationKind;
  /** Worlds API root that receives `POST /entities`. */
  url: string;
  entryRoute: EntryRoute;
  /** One line for the picker — what this route is for. */
  note: string;
}

export const DECENTRALAND_DESTINATION_ID = "dcl";
export const DECENTRALAND_SERVER = "https://worlds-content-server.decentraland.org";

/** True when this destination's visitors wait on Decentraland's asset-bundle
 * conversion. The single question behind "is the green light honest?". */
export function conversionApplies(destination: PublishDestination): boolean {
  return destination.entryRoute === "name";
}

/** What a visitor of this destination actually does, in one sentence. */
export function entryRouteNote(destination: PublishDestination): string {
  return destination.entryRoute === "name"
    ? "Visitors enter by World name — Decentraland serves the content, after its conversion queue."
    : "Visitors enter by realm deep link — this server serves the content directly, with no conversion queue.";
}

/* -------------------------------------------------------------------------- */
/* Routing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Which destinations this project publishes to.
 *
 * `defaultId` receives the upload. `alsoPublishTo` is the EXPLICIT fan-out list:
 * empty means one publish reaches exactly one destination. Nothing is implied by
 * the shape of the configuration — that implication is the behaviour this
 * replaces.
 */
export interface PublishRouting {
  version: 1;
  defaultId: string;
  alsoPublishTo: string[];
}

export function defaultRouting(defaultId = DECENTRALAND_DESTINATION_ID): PublishRouting {
  return { version: 1, defaultId, alsoPublishTo: [] };
}

export function isPublishRouting(raw: unknown): raw is PublishRouting {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as PublishRouting;
  return r.version === 1 && typeof r.defaultId === "string" && Array.isArray(r.alsoPublishTo);
}

/**
 * Drop ids that no longer exist, de-duplicate, and keep the default out of the
 * fan-out list (it is already the first delivery — listing it twice would show a
 * destination twice and publish to it twice).
 */
export function normalizeRouting(raw: unknown, knownIds: readonly string[]): PublishRouting {
  const known = new Set(knownIds);
  const fallback = known.has(DECENTRALAND_DESTINATION_ID)
    ? DECENTRALAND_DESTINATION_ID
    : (knownIds[0] ?? DECENTRALAND_DESTINATION_ID);
  if (!isPublishRouting(raw)) return defaultRouting(fallback);

  const defaultId = known.has(raw.defaultId) ? raw.defaultId : fallback;
  const also: string[] = [];
  for (const id of raw.alsoPublishTo) {
    if (typeof id !== "string" || id === defaultId || !known.has(id) || also.includes(id)) continue;
    also.push(id);
  }
  return { version: 1, defaultId, alsoPublishTo: also };
}

/** Every destination one Publish reaches, default first. */
export function routingTargets(routing: PublishRouting): string[] {
  return [routing.defaultId, ...routing.alsoPublishTo];
}

export function setDefaultDestination(routing: PublishRouting, id: string): PublishRouting {
  if (id === routing.defaultId) return routing;
  return {
    version: 1,
    defaultId: id,
    // The new default may have been a fan-out target; it is not one any more.
    // The OLD default is deliberately NOT added here — changing where a publish
    // goes must not quietly keep publishing to where it used to go.
    alsoPublishTo: routing.alsoPublishTo.filter((other) => other !== id),
  };
}

export function toggleAlsoPublish(routing: PublishRouting, id: string, on: boolean): PublishRouting {
  if (id === routing.defaultId) return routing;
  const has = routing.alsoPublishTo.includes(id);
  if (on === has) return routing;
  return {
    version: 1,
    defaultId: routing.defaultId,
    alsoPublishTo: on
      ? [...routing.alsoPublishTo, id]
      : routing.alsoPublishTo.filter((other) => other !== id),
  };
}

/* -------------------------------------------------------------------------- */
/* Migration from the single-server setting                                    */
/* -------------------------------------------------------------------------- */

export interface LegacyServerSetting {
  /** `dcl` uploaded to Decentraland; `custom` uploaded to the stored URL. */
  mode: "dcl" | "custom";
  /** The self-hosted server the browser knows about, whichever mode is active. */
  selfHostedUrl: string | null;
}

/**
 * Turn the old implicit pair into an explicit routing, preserving what the
 * Builder actually did.
 *
 * The old rule mirrored EVERY world publish to the other half of the pair, so a
 * migration that produced an empty `alsoPublishTo` would silently stop
 * delivering to a destination the owner's public links depend on. The fan-out is
 * therefore seeded with the partner — the behaviour is unchanged, but it is now
 * a visible checkbox that can be turned off.
 */
export function routingFromLegacySetting(
  legacy: LegacyServerSetting,
  catalog: readonly PublishDestination[]
): PublishRouting {
  const ids = catalog.map((d) => d.id);
  const selfHosted = legacy.selfHostedUrl
    ? catalog.find((d) => d.id !== DECENTRALAND_DESTINATION_ID && sameServer(d.url, legacy.selfHostedUrl))
    : undefined;

  if (legacy.mode === "custom" && selfHosted) {
    return normalizeRouting(
      { version: 1, defaultId: selfHosted.id, alsoPublishTo: [DECENTRALAND_DESTINATION_ID] },
      ids
    );
  }
  return normalizeRouting(
    {
      version: 1,
      defaultId: DECENTRALAND_DESTINATION_ID,
      alsoPublishTo: selfHosted ? [selfHosted.id] : [],
    },
    ids
  );
}

/** URL comparison that ignores trailing slashes and case in the host. */
export function sameServer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().replace(/\/+$/, "").toLowerCase() === b.trim().replace(/\/+$/, "").toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Description                                                                 */
/* -------------------------------------------------------------------------- */

export interface RoutingSummary {
  /** "Swissverse Worlds server" — where Publish uploads. */
  defaultLabel: string;
  /** "and 1 more" style tail, empty when a publish reaches one destination. */
  alsoLabels: string[];
  /** One sentence, for the button title and the publish progress line. */
  sentence: string;
  /** True when this publish reaches a destination whose visitors wait on
   * Decentraland's conversion queue. Decides whether the publish flow waits. */
  waitsForConversion: boolean;
}

export function describeRouting(
  routing: PublishRouting,
  catalog: readonly PublishDestination[]
): RoutingSummary {
  const byId = new Map(catalog.map((d) => [d.id, d]));
  const def = byId.get(routing.defaultId);
  const also = routing.alsoPublishTo.map((id) => byId.get(id)).filter(Boolean) as PublishDestination[];
  const defaultLabel = def?.label ?? routing.defaultId;
  const alsoLabels = also.map((d) => d.label);

  const sentence = alsoLabels.length
    ? `Publishes to ${defaultLabel}, then delivers the same signed build to ${alsoLabels.join(" and ")}.`
    : `Publishes to ${defaultLabel} only.`;

  // ★ ANY configured name-entry destination decides this, not just the default.
  //
  // The first version asked only the default, reasoning that a fan-out copy
  // "has no stake" in the primary publish. That was wrong in the one setup that
  // matters: the owner publishes to their Catalyst (realm, instant) AND to
  // Decentraland, then enters by NAME. Publish declared "Live" the moment the
  // Catalyst listed the entity while Decentraland was still converting, so
  // visitors — including the owner — saw the previous build with no signal that
  // anything was outstanding. Three publishes went out that way on 2026-08-27,
  // each one queueing a fresh entity behind the last and restarting the wait.
  //
  // A destination is only reachable through its own entry route, so if ANY
  // configured destination is entered by name, this release is not finished
  // until that conversion is. A pure-realm routing still never waits.
  const reachedByName = [def, ...also].some((d) => d && conversionApplies(d));

  return {
    defaultLabel,
    alsoLabels,
    sentence,
    waitsForConversion: def ? reachedByName : true,
  };
}
