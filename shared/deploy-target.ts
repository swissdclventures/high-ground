import type { PublishRouting } from "./publish-destinations";
import { defaultWorldOverlayAppIds } from "./venue-app-contract";

export type DeployTargetKind = "world" | "land";

/** Saved deploy destination — used by composer, sync script, and scene.json patch. */
export interface DeployTargetConfig {
  target: DeployTargetKind;
  worldName?: string;
  parcels?: string[];
  base?: string;
  /**
   * World only. True when the user deliberately placed the building on the World
   * map (moved it off the auto-seeded spawn). publishScene then honours `base`
   * as-is instead of force-anchoring to the World's live spawnCoordinates.
   * Absent/false = the safe default: the scene lands on the World spawn.
   */
  worldBaseExplicit?: boolean;
  title?: string;
  description?: string;
  /** Last connected wallet (display / re-fetch only; not used for signing). */
  walletAddress?: string;
  /** Stable id from wallet asset list, e.g. land:-1,-5, estate:123, or world:myname.dcl.eth */
  selectedAssetId?: string;
  /** Genesis City asset subtype when target is land (parcel vs multi-parcel estate). */
  landKind?: "parcel" | "estate";
  /** Wallet-facing name for the selected parcel/estate (header + review). */
  destinationLabel?: string;
  /**
   * How this wallet may publish here.
   * `owner` = holds the LAND/estate NFT; `operator` = updateOperator / build rights only.
   */
  accessRole?: DeployAccessRole;
  /**
   * World-owned catalogue ids. Install once for the destination World; stamp onto
   * each scene at create/publish. Overlay apps turn on; plot apps stay off until
   * placed. Missing on old saves — keep the existing World profile list.
   */
  worldInstalledAppIds?: string[];
  /**
   * Which destinations THIS project publishes to, and which one is the default.
   *
   * Per project rather than per browser: "publish to my catalyst" is a property
   * of a scene, not of the machine it was last opened on. Absent on old saves —
   * the browser-level routing then applies, which is what the Builder did before
   * destinations were separable at all.
   *
   * Excluded from the project revision (VOLATILE_REVISION_KEYS): picking a
   * destination changes where a build goes, not what the build IS.
   */
  publishRouting?: PublishRouting;
}

/** How the connected wallet is authorized to deploy to a Genesis City destination. */
export type DeployAccessRole = "owner" | "operator";

export interface DeployAssetOption {
  id: string;
  kind: DeployTargetKind;
  label: string;
  detail?: string;
  worldName?: string;
  parcels?: string[];
  base?: string;
  /** Set for Genesis City assets — estates are multi-parcel LAND collections. */
  landKind?: "parcel" | "estate";
  /** Owner NFT vs operator/build rights (LAND only). Worlds are always owner of the NAME. */
  accessRole?: DeployAccessRole;
  /** Parcel owner address when this option came from operator permissions. */
  ownerAddress?: string;
}

export const DEPLOY_STORAGE_KEY = "dcl-frame-kit-deploy-v1";

/** v2 storage — World and LAND profiles are independent; publishing one must not erase the other. */
export interface DeployProfilesStorage {
  version: 2;
  activeTarget: DeployTargetKind;
  profiles: {
    world: DeployTargetConfig;
    land: DeployTargetConfig;
  };
}

export function defaultWorldProfile(title = "DCL Frame Kit"): DeployTargetConfig {
  return {
    target: "world",
    title,
    description: "Modular building from the Frame Kit composer.",
    worldInstalledAppIds: defaultWorldOverlayAppIds(),
  };
}

export function defaultLandProfile(title = "DCL Frame Kit"): DeployTargetConfig {
  return {
    target: "land",
    title,
    description: "Modular building on Genesis City LAND.",
    parcels: [],
  };
}

export function defaultDeployProfiles(title = "DCL Frame Kit"): DeployProfilesStorage {
  return {
    version: 2,
    activeTarget: "world",
    profiles: {
      world: defaultWorldProfile(title),
      land: defaultLandProfile(title),
    },
  };
}

export function isDeployProfilesStorage(raw: unknown): raw is DeployProfilesStorage {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as DeployProfilesStorage;
  return r.version === 2 && !!r.profiles?.world && !!r.profiles?.land;
}

/** Upgrade legacy single-target JSON or merge partial writes into v2 profiles. */
export function migrateToDeployProfiles(raw: unknown, title = "DCL Frame Kit"): DeployProfilesStorage {
  if (isDeployProfilesStorage(raw)) return raw;

  const storage = defaultDeployProfiles(title);
  if (!raw || typeof raw !== "object") return storage;

  const legacy = raw as DeployTargetConfig;
  const kind: DeployTargetKind = legacy.target === "land" ? "land" : "world";
  storage.activeTarget = kind;
  storage.profiles[kind] = {
    ...storage.profiles[kind],
    ...legacy,
    target: kind,
  };

  // If a legacy file mixed world name with land parcels, split by target — never copy both ways.
  if (kind === "world" && legacy.worldName) {
    storage.profiles.world.worldName = legacy.worldName;
  }
  if (kind === "land" && legacy.parcels?.length) {
    storage.profiles.land.parcels = legacy.parcels;
    storage.profiles.land.base = legacy.base ?? legacy.parcels[0];
  }

  return storage;
}

export function activeDeployConfig(storage: DeployProfilesStorage): DeployTargetConfig {
  return { ...storage.profiles[storage.activeTarget] };
}

export function updateDeployProfile(
  storage: DeployProfilesStorage,
  kind: DeployTargetKind,
  config: DeployTargetConfig
): DeployProfilesStorage {
  const previous = storage.profiles[kind];
  let next: DeployTargetConfig = { ...config, target: kind };
  if (kind === "world") {
    const sameWorld = Boolean(previous.worldName) && previous.worldName === next.worldName;
    if (next.worldInstalledAppIds === undefined && sameWorld) {
      next = { ...next, worldInstalledAppIds: previous.worldInstalledAppIds };
    } else if (next.worldInstalledAppIds === undefined) {
      next = { ...next, worldInstalledAppIds: defaultWorldOverlayAppIds() };
    }
  }
  return {
    ...storage,
    profiles: {
      ...storage.profiles,
      [kind]: next,
    },
  };
}

export function setActiveDeployTarget(
  storage: DeployProfilesStorage,
  kind: DeployTargetKind
): DeployProfilesStorage {
  return { ...storage, activeTarget: kind };
}

/** Merge a single-target write (e.g. publish POST) into stored profiles without touching the other slot. */
export function mergeSingleDeployWrite(
  storage: DeployProfilesStorage,
  config: DeployTargetConfig
): DeployProfilesStorage {
  const kind = config.target === "land" ? "land" : "world";
  return setActiveDeployTarget(updateDeployProfile(storage, kind, config), kind);
}

/**
 * Strip the DESTINATION out of both profiles, keeping the operator and the World's
 * installed apps.
 *
 * A project that names no destination must not inherit the previous one's.
 * `applyDeployConfig` used to early-return when a recipe carried no `deploy` block,
 * so opening a scene without one — an import, a template, a pre-`deploy` recipe —
 * left the last project's World and base fully in place and the next publish landed
 * there. Our own saves always carry a deploy block (`currentRecipe` feeds
 * `getDeployTarget()` into `buildRecipe`), so this only fires for scenes that
 * genuinely have no destination yet.
 *
 * Deliberately KEPT, each for a reason already paid for once:
 * - `walletAddress` — a recipe names the destination, not the operator. Writing its
 *   absence through wiped the signed-in wallet and every list keyed off it
 *   (owner 2026-08-31).
 * - `worldInstalledAppIds` — clearing it would silently uninstall that World's apps,
 *   which is precisely the "a sync pass revoked the owner's intent" bug the APP law
 *   forbids (see docs/settings-ownership-inventory.md).
 * - `title` / `description` — listing copy, re-derived from the build name anyway.
 */
export function clearDeployDestinations(storage: DeployProfilesStorage): DeployProfilesStorage {
  const strip = (config: DeployTargetConfig, kind: DeployTargetKind): DeployTargetConfig => ({
    target: kind,
    ...(config.title === undefined ? {} : { title: config.title }),
    ...(config.description === undefined ? {} : { description: config.description }),
    ...(config.walletAddress === undefined ? {} : { walletAddress: config.walletAddress }),
    ...(kind === "world" && config.worldInstalledAppIds
      ? { worldInstalledAppIds: config.worldInstalledAppIds }
      : {}),
    ...(kind === "land" ? { parcels: [] } : {}),
  });
  return {
    ...storage,
    profiles: {
      world: strip(storage.profiles.world, "world"),
      land: strip(storage.profiles.land, "land"),
    },
  };
}

export function defaultDeployTarget(title = "DCL Frame Kit"): DeployTargetConfig {
  return defaultWorldProfile(title);
}

/** True when the destination is enough to publish. Worlds need a NAME only —
 * scene footprint is derived at publish time (live spawn, else 0,0). */
export function isDeployConfigValid(config: DeployTargetConfig): boolean {
  if (config.target === "world") return Boolean(config.worldName?.trim());
  if (config.target === "land") return Boolean(config.parcels?.length);
  return Boolean(config.worldName?.trim() || config.parcels?.length);
}

export function deployTargetFromOption(
  option: DeployAssetOption,
  walletAddress?: string
): DeployTargetConfig {
  if (option.kind === "world" && option.worldName) {
    return {
      target: "world",
      worldName: option.worldName,
      walletAddress,
      selectedAssetId: option.id,
      title: "DCL Frame Kit",
      description: `Published to ${option.worldName}`,
      landKind: undefined,
      destinationLabel: option.worldName,
      accessRole: undefined,
      // Footprint is filled at publish (spawn / 0,0) — do not force a second form.
      parcels: undefined,
      base: undefined,
    };
  }
  const landKind = option.landKind ?? (option.id.startsWith("estate:") ? "estate" : "parcel");
  const parcels = option.parcels ?? [];
  const accessRole = option.accessRole ?? "owner";
  return {
    target: "land",
    parcels,
    base: option.base ?? parcels[0],
    walletAddress,
    selectedAssetId: option.id,
    title: "DCL Frame Kit",
    description: option.label,
    landKind,
    destinationLabel: option.label,
    accessRole,
  };
}

/** True when the destination is publishable via operator/build rights (not NFT ownership). */
export function isOperatorDestination(config: DeployTargetConfig): boolean {
  return config.target === "land" && config.accessRole === "operator";
}

/** Infer estate vs single parcel when landKind was not persisted. */
export function resolveLandKind(config: DeployTargetConfig): "parcel" | "estate" | undefined {
  if (config.target !== "land") return undefined;
  if (config.landKind) return config.landKind;
  if (config.selectedAssetId?.startsWith("estate:")) return "estate";
  if ((config.parcels?.length ?? 0) > 1) return "estate";
  return config.parcels?.length ? "parcel" : undefined;
}

/** Drop generic on-chain names that read like UI junk ("Parcel", "Estate"). */
export function meaningfulEstateName(raw: string | null | undefined): string | undefined {
  const name = raw?.trim();
  if (!name) return undefined;
  if (/^(parcel|estate|land|unnamed)$/i.test(name)) return undefined;
  return name;
}

export function formatParcel(x: string | number, y: string | number): string {
  return `${x},${y}`;
}

/** Short coord summary for portfolio cards — enough to tell estates apart. */
export function formatParcelSummary(parcels: string[], maxShow = 4): string {
  if (!parcels.length) return "";
  if (parcels.length <= maxShow) return parcels.join(" · ");
  return `${parcels.slice(0, maxShow).join(" · ")} +${parcels.length - maxShow} more`;
}

export function parseParcelList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return (raw.match(/-?\d+\s*,\s*-?\d+/g) ?? []).map((parcel) =>
    parcel.replace(/\s+/g, "")
  );
}

/** Normalize a single "x,y" coordinate; "" if it isn't a valid parcel coordinate. */
export function normalizeCoord(raw: string | undefined): string {
  const m = (raw ?? "").match(/-?\d+\s*,\s*-?\d+/);
  return m ? m[0].replace(/\s+/g, "") : "";
}

/**
 * The level ABOVE a scene, named the way that level actually exists.
 *
 * A World is a named space, so its context is its NAME. Genesis City is not a
 * World and never had one — its context is Genesis City itself. Reading the last
 * World while the destination was an estate is how a Genesis City publish ended
 * up carrying a World's identity (owner 2026-09-05: "the world is Genesis City
 * and not some kind of world … otherwise we're going to have issues because we
 * are mixing world with Genesis").
 */
export const GENESIS_CITY_LABEL = "Genesis City";

export function destinationContextLabel(config: DeployTargetConfig): string {
  if (config.target === "world") return config.worldName?.trim() ?? "";
  return GENESIS_CITY_LABEL;
}

/**
 * Stable identity of the space a scene was published INTO — what a live service
 * (Garden growth, boards, any per-scene document) keys its rows on.
 *
 * `<worldname>:<base>` for a World, `genesis:<base>` for Genesis City LAND.
 * "" when neither is known, which only happens in local preview.
 *
 * ⚠️ The World form is FROZEN. It is what already sits in the garden service's
 * rows, so prefixing or re-casing it would orphan every lawn published so far.
 * The Genesis form is new because Genesis City never had an id at all — it fell
 * through to a shared `local-preview` bucket.
 */
export function destinationSceneIdentity(config: DeployTargetConfig): string {
  if (config.target === "world") {
    const name = config.worldName?.trim().toLowerCase();
    if (!name) return "";
    const base = config.base?.trim();
    return base ? `${name}:${base}` : name;
  }
  const base = config.base?.trim() || config.parcels?.[0]?.trim();
  return base ? `genesis:${base}` : "";
}

export interface DeployDestinationInfo {
  kind: DeployTargetKind | "unset";
  /** Visual accent for badges (estates share land deploy target but get their own chip). */
  accent: "world" | "land" | "estate" | "operator" | "unset";
  badge: string;
  headline: string;
  /** The level above the scene — a World NAME, or "Genesis City". Never both. */
  context: string;
  subline: string;
  visitHint: string;
  /** Shown in sidebar only — internal deploy metadata, not a second destination. */
  technicalNote?: string;
  valid: boolean;
  missing: string[];
}

/** Human-readable publish destination for toolbar + sidebar. */
export function describeDeployDestination(config: DeployTargetConfig): DeployDestinationInfo {
  const missing: string[] = [];
  const parcels = config.parcels ?? [];
  const parcelText = parcels.length ? parcels.join(", ") : "";
  const title = config.title ?? "untitled";

  if (config.target === "world") {
    if (!config.worldName?.trim()) missing.push("World NAME");

    const name = config.worldName?.trim() || "(set World NAME)";
    return {
      kind: "world",
      accent: "world",
      badge: "WORLD",
      headline: name,
      context: config.worldName?.trim() ?? "",
      subline: `Private World · scene “${title}”`,
      visitHint: config.worldName?.trim()
        ? `Players visit here: /goto ${config.worldName.trim()} — not via the Genesis City map.`
        : "Set your DCL NAME (e.g. your-name.dcl.eth).",
      technicalNote: parcelText
        ? `Internal scene footprint ${parcelText} (players still visit by /goto).`
        : "Scene footprint is set automatically at publish (world spawn, or 0,0 for new Worlds).",
      valid: missing.length === 0,
      missing,
    };
  }

  if (!parcels.length) missing.push("LAND parcel or estate");

  const landKind = resolveLandKind(config);
  const isEstate = landKind === "estate";
  const isOperator = isOperatorDestination(config);
  const estateName =
    config.destinationLabel
      ?.replace(/^Estate\s*[—–-]\s*/i, "")
      .replace(/^Operator\s*[—–-]\s*/i, "")
      .trim() ||
    (config.description?.startsWith("Estate")
      ? config.description.replace(/^Estate\s*[—–-]\s*/i, "").trim()
      : "");
  const headline = !parcels.length
    ? "Click to pick estate, parcel, or operator LAND…"
    : isEstate
      ? estateName
        ? `${estateName} · ${parcels.length} parcels`
        : `Estate · ${parcels.length} parcels`
      : isOperator
        ? `Operator · ${parcelText}`
        : parcelText;

  const accent = isOperator ? "operator" : isEstate ? "estate" : "land";
  const badge = isOperator ? "OPERATOR" : isEstate ? "ESTATE" : "LAND";

  return {
    kind: "land",
    accent,
    badge,
    headline,
    // Not a World, and not the last World either — Genesis City is its own level.
    context: GENESIS_CITY_LABEL,
    subline: isOperator
      ? `Build rights (operator) · scene “${title}”`
      : isEstate
        ? `Genesis City estate · scene “${title}”`
        : `Genesis City map · scene “${title}”`,
    visitHint: parcelText
      ? isEstate
        ? `Players visit here: Decentraland map → base parcel ${parcels[0]} (${parcels.length} parcels).`
        : `Players visit here: Decentraland map → parcel ${parcels[0]}.`
      : "Pick an estate, owned parcel, or operator LAND from your wallet — or enter coordinates.",
    technicalNote: isOperator
      ? parcels.length
        ? `Publishing with operator/build rights on ${parcels.length === 1 ? parcels[0] : `${parcels.length} parcels`} (you do not own the NFT).`
        : "Publishing with operator/build rights (you do not own the NFT)."
      : isEstate && parcels.length
        ? `Deploys across ${parcels.length} parcels (base ${parcels[0]}).`
        : undefined,
    valid: missing.length === 0,
    missing,
  };
}
