/**
 * Gallery app — framed artwork hung on the building's walls.
 *
 * TWO OWNERS, ONE PIECE. Every gallery piece is authored twice, by two different
 * people at two different times, and the split is the whole point of this file:
 *
 *   PLACEMENT is the builder's. Where the frame hangs, how big it is, which floor
 *   and how high above it — spatial decisions that need a 3D view and that change
 *   the published scene. Baked into building-config.json at publish.
 *
 *   ARTWORK is the gallery site's. Which NFT is in the frame right now. Swapped
 *   from a web page months after publish, by someone who may never open the
 *   builder, and it must appear in-world WITHOUT a republish.
 *
 * So the runtime holds the published pieces as the base and folds a live document
 * (`GalleryLiveDocument`) over the top — see `mergeGalleryLiveDocument`. A live
 * document can only reach the fields the site owns; it can never move a frame.
 * That is deliberate: a public endpoint that could move geometry is a public
 * endpoint that can wreck a scene.
 *
 * TWO RENDER MODES, AND WHY THE SECOND ONE EXISTS. `NftShape` takes a URN and
 * renders the token WITH one of 23 built-in picture frames — no mesh, no texture
 * fetch, no frame geometry of our own. It is the nicer mode and stays the
 * default. But it hands the picture to Decentraland's own NFT resolver, and that
 * resolver is not ours to fix:
 *
 *   - it wants a RASTER image. CryptoKitties' metadata `image` is an `.svg`
 *     (OpenSea shows those fine — a browser rasterises SVG and OpenSea also
 *     serves its own PNG copy — so "it works on OpenSea" proves nothing here);
 *   - historically it batched ~20 tokens per request, so ONE token it cannot
 *     read blanks every other frame in the scene;
 *   - the endpoints behind it keep moving (the OpenSea v1 API it was built on
 *     now answers 410 Gone).
 *
 * So a frame may also carry a direct image URL, rendered as a textured plane
 * with a moulding of our own. That mode owes nothing to any NFT service: if the
 * URL loads in a browser it hangs on the wall. The NFT link is kept alongside it
 * for the plaque and for provenance — the image is how it DRAWS, not what it IS.
 */

import { walkSurfaceY } from "./kit-geometry";

export const GALLERY_VERSION = 1 as const;

/* -------------------------------------------------------------------------- */
/* Frame styles                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Frame styles, named rather than numbered.
 *
 * These are Decentraland's own `NftFrameType` values. We keep our own string ids
 * because this file is imported by the browser composer, which has no @dcl/sdk —
 * and because a saved config that reads "gold_carved" survives an SDK renumbering
 * that a saved `7` would not. `nftFrameType` is the wire value; nothing outside
 * the scene runtime should care about it.
 */
export type GalleryFrameStyle =
  | "classic"
  | "baroque_ornament"
  | "diamond_ornament"
  | "minimal_wide"
  | "minimal_grey"
  | "blocky"
  | "gold_edges"
  | "gold_carved"
  | "gold_wide"
  | "gold_rounded"
  | "metal_medium"
  | "metal_wide"
  | "metal_slim"
  | "metal_rounded"
  | "pins"
  | "minimal_black"
  | "minimal_white"
  | "tape"
  | "wood_slim"
  | "wood_wide"
  | "wood_twigs"
  | "canvas"
  | "none";

export interface GalleryFrameStyleOption {
  id: GalleryFrameStyle;
  label: string;
  /** Grouping for the style picker, not a runtime concern. */
  family: "plain" | "gold" | "metal" | "wood" | "ornate" | "bare";
  /** Decentraland NftFrameType enum value. */
  nftFrameType: number;
}

export const GALLERY_FRAME_STYLES: readonly GalleryFrameStyleOption[] = [
  { id: "classic", label: "Classic", family: "plain", nftFrameType: 0 },
  { id: "baroque_ornament", label: "Baroque Ornament", family: "ornate", nftFrameType: 1 },
  { id: "diamond_ornament", label: "Diamond Ornament", family: "ornate", nftFrameType: 2 },
  { id: "minimal_wide", label: "Minimal Wide", family: "plain", nftFrameType: 3 },
  { id: "minimal_grey", label: "Minimal Grey", family: "plain", nftFrameType: 4 },
  { id: "blocky", label: "Blocky", family: "plain", nftFrameType: 5 },
  { id: "gold_edges", label: "Gold Edges", family: "gold", nftFrameType: 6 },
  { id: "gold_carved", label: "Gold Carved", family: "gold", nftFrameType: 7 },
  { id: "gold_wide", label: "Gold Wide", family: "gold", nftFrameType: 8 },
  { id: "gold_rounded", label: "Gold Rounded", family: "gold", nftFrameType: 9 },
  { id: "metal_medium", label: "Metal Medium", family: "metal", nftFrameType: 10 },
  { id: "metal_wide", label: "Metal Wide", family: "metal", nftFrameType: 11 },
  { id: "metal_slim", label: "Metal Slim", family: "metal", nftFrameType: 12 },
  { id: "metal_rounded", label: "Metal Rounded", family: "metal", nftFrameType: 13 },
  { id: "pins", label: "Pins", family: "bare", nftFrameType: 14 },
  { id: "minimal_black", label: "Minimal Black", family: "plain", nftFrameType: 15 },
  { id: "minimal_white", label: "Minimal White", family: "plain", nftFrameType: 16 },
  { id: "tape", label: "Tape", family: "bare", nftFrameType: 17 },
  { id: "wood_slim", label: "Wood Slim", family: "wood", nftFrameType: 18 },
  { id: "wood_wide", label: "Wood Wide", family: "wood", nftFrameType: 19 },
  { id: "wood_twigs", label: "Wood Twigs", family: "wood", nftFrameType: 20 },
  { id: "canvas", label: "Canvas", family: "bare", nftFrameType: 21 },
  { id: "none", label: "No Frame", family: "bare", nftFrameType: 22 },
] as const;

const FRAME_STYLE_IDS = new Set<string>(GALLERY_FRAME_STYLES.map((s) => s.id));

export const DEFAULT_GALLERY_FRAME_STYLE: GalleryFrameStyle = "classic";

export function normalizeFrameStyle(
  value: unknown,
  fallback: GalleryFrameStyle = DEFAULT_GALLERY_FRAME_STYLE
): GalleryFrameStyle {
  return typeof value === "string" && FRAME_STYLE_IDS.has(value)
    ? (value as GalleryFrameStyle)
    : fallback;
}

/** Wire value for the scene's NftShape component. */
export function nftFrameTypeFor(style: GalleryFrameStyle): number {
  return GALLERY_FRAME_STYLES.find((s) => s.id === style)?.nftFrameType ?? 0;
}

/* -------------------------------------------------------------------------- */
/* NFT URNs                                                                    */
/* -------------------------------------------------------------------------- */

/** Chains this gallery can index and hand to Decentraland's `NftShape`. */
export type GalleryNftChain =
  | "ethereum"
  | "polygon"
  | "matic"
  | "arbitrum"
  | "optimism"
  | "base"
  | "goerli"
  | "sepolia";

const NFT_CHAINS = new Set<string>([
  "ethereum",
  "polygon",
  "matic",
  "arbitrum",
  "optimism",
  "base",
  "goerli",
  "sepolia",
]);

export interface ParsedNftUrn {
  chain: GalleryNftChain;
  /**
   * `erc721` / `erc1155` are marketplace tokens. `collections-v1` / `collections-v2`
   * are Decentraland wearables — NftShape renders those too, which is what an
   * owner's wallet actually holds.
   */
  standard: "erc721" | "erc1155" | "collections-v1" | "collections-v2";
  contract: string;
  tokenId: string;
}

/** `urn:decentraland:<chain>:<standard>:<contract>:<tokenId>` */
export function buildNftUrn(
  contract: string,
  tokenId: string,
  chain: GalleryNftChain = "ethereum",
  standard: ParsedNftUrn["standard"] = "erc721"
): string {
  return `urn:decentraland:${chain}:${standard}:${contract.trim().toLowerCase()}:${tokenId.trim()}`;
}

export function parseNftUrn(urn: unknown): ParsedNftUrn | null {
  if (typeof urn !== "string") return null;
  const parts = urn.trim().split(":");
  if (parts.length !== 6) return null;
  const [scheme, namespace, chain, standard, contract, tokenId] = parts;
  if (scheme !== "urn" || namespace !== "decentraland") return null;
  if (!NFT_CHAINS.has(chain)) return null;
  if (!tokenId) return null;

  if (standard === "erc721" || standard === "erc1155") {
    if (!/^0x[0-9a-fA-F]{40}$/.test(contract)) return null;
    if (!/^[0-9a-zA-Z]+$/.test(tokenId)) return null;
    return {
      chain: chain as GalleryNftChain,
      standard,
      contract: contract.toLowerCase(),
      tokenId,
    };
  }

  // Wearable item URNs. NftShape draws the collection thumbnail — these are
  // what an admin wallet actually owns, unlike CryptoPunks the explorer cannot fetch.
  if (standard === "collections-v2") {
    if (!/^0x[0-9a-fA-F]{40}$/.test(contract)) return null;
    if (!/^[0-9]+$/.test(tokenId)) return null;
    return {
      chain: chain as GalleryNftChain,
      standard,
      contract: contract.toLowerCase(),
      tokenId,
    };
  }
  if (standard === "collections-v1") {
    if (!/^[a-z0-9_]+$/i.test(contract) || !/^[a-z0-9_]+$/i.test(tokenId)) return null;
    return {
      chain: chain as GalleryNftChain,
      standard,
      contract: contract.toLowerCase(),
      tokenId,
    };
  }

  return null;
}

export function isValidNftUrn(urn: unknown): boolean {
  return parseNftUrn(urn) !== null;
}

/** Marketplace chain slugs → the chain a urn names. */
function chainFromSlug(slug: string): GalleryNftChain {
  const s = slug.toLowerCase();
  if (s === "matic" || s === "polygon") return "polygon";
  if (s === "arbitrum" || s === "optimism" || s === "base") return s;
  if (s === "sepolia") return "sepolia";
  if (s === "goerli") return "goerli";
  return "ethereum";
}

/**
 * Accept what a person actually pastes.
 *
 * Nobody has a URN on their clipboard; they have a marketplace tab open. Every
 * marketplace worth supporting puts the contract and token id in the path, so
 * lift them from there rather than making the user hand-assemble a urn.
 *
 * The last rule is deliberately generic — `…/0x<40 hex>/<token>` anywhere in the
 * string. Marketplaces rename their paths (OpenSea moved `/assets/` → `/item/`
 * and silently broke every paste, because an unrecognised link was erased rather
 * than reported). Matching the shape rather than the host means the next rename
 * costs nothing. A wrong guess here is cheap: `validateGalleryConfig` reports a
 * urn the explorer cannot resolve, and the frame hangs empty rather than broken.
 */
export function coerceNftUrn(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (isValidNftUrn(raw)) return parseNftUrn(raw) ? raw.toLowerCase().replace(/^URN/i, "urn") : null;

  // Bare "0xabc...:123", "0xabc... 123", "0xabc.../123"
  const bare = raw.match(/^(0x[0-9a-fA-F]{40})[\s:/]+([0-9a-zA-Z]+)$/);
  if (bare) return buildNftUrn(bare[1], bare[2], "ethereum");

  // marketplace.decentraland.org/contracts/0xabc.../tokens/123 — chain-less, always L1.
  const market = raw.match(/contracts\/(0x[0-9a-fA-F]{40})\/tokens\/([0-9a-zA-Z]+)/i);
  if (market) return buildNftUrn(market[1], market[2], "ethereum");

  // Any host that names the chain in the path segment before the contract:
  // opensea.io/assets/ethereum/0x…/1, opensea.io/item/matic/0x…/1, rarible /polygon/0x…:1
  const chained = raw.match(
    /\/(ethereum|matic|polygon|arbitrum|optimism|base|goerli|sepolia)\/(0x[0-9a-fA-F]{40})[/:]([0-9a-zA-Z]+)/i
  );
  if (chained) return buildNftUrn(chained[2], chained[3], chainFromSlug(chained[1]));

  // Last resort: a contract and token adjacent anywhere in the string. Assumes L1,
  // which is the common case and is visible/correctable in the library row.
  const loose = raw.match(/(0x[0-9a-fA-F]{40})[/:]([0-9a-zA-Z]+)/);
  if (loose) return buildNftUrn(loose[1], loose[2], "ethereum");

  return null;
}

/** IPFS has no browser transport; the explorer needs an https gateway URL. */
const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

/**
 * A pasted image reference → a URL the explorer can actually load as a texture.
 *
 * Deliberately narrow. This is the mode that exists BECAUSE the clever path
 * failed, so it does no cleverness of its own: no metadata lookup, no chain
 * call, no host allowlist. If the URL opens as a picture in a browser tab it
 * will hang on the wall, and that is a rule an owner can check in two seconds.
 *
 * Three rewrites earn their place. `ipfs://` and `ar://` are common NFT
 * metadata transports that a browser cannot fetch directly, and `http://` is
 * refused by the explorer as mixed content — all would otherwise read as "my
 * link is fine but the wall is empty", the exact failure this mode exists to end.
 */
export function coerceImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > 400) return null;
  if (/^ipfs:\/\//i.test(text)) {
    const path = text.replace(/^ipfs:\/\/(ipfs\/)?/i, "");
    return path ? `${IPFS_GATEWAY}${path}` : null;
  }
  if (/^ar:\/\//i.test(text)) {
    const path = text.replace(/^ar:\/\//i, "");
    return path ? `https://arweave.net/${path}` : null;
  }
  if (/^http:\/\//i.test(text)) return `https://${text.slice("http://".length)}`;
  return /^https:\/\//i.test(text) ? text : null;
}

/* -------------------------------------------------------------------------- */
/* Artwork — the part the gallery site owns                                    */
/* -------------------------------------------------------------------------- */

/** "image" draws a direct URL; "nft" hands the URN to Decentraland's NftShape. */
export type GalleryArtworkKind = "empty" | "nft" | "image";

export interface GalleryArtwork {
  kind: GalleryArtworkKind;
  /** NFT URN. Kept even in "image" mode — it is the plaque's provenance. */
  urn: string | null;
  /** Direct raster image. Set = this is what the wall draws, NftShape unused. */
  imageUrl: string | null;
  /** Plaque text. Free-form — the token's own name is not always the show's. */
  title: string;
  artist: string;
}

export function emptyArtwork(): GalleryArtwork {
  return { kind: "empty", urn: null, imageUrl: null, title: "", artist: "" };
}

/* -------------------------------------------------------------------------- */
/* The library — artwork entered once, hung many times                         */
/* -------------------------------------------------------------------------- */

/**
 * One work in the project's collection.
 *
 * Artwork used to be typed into the frame that showed it, which made the frame
 * the only place a work existed: hanging the same piece twice meant pasting the
 * same link twice, and moving a show between frames meant retyping it. The
 * library inverts that — a work is entered once here and a frame points at it.
 *
 * `sourceText` is the load-bearing field, and it is why this type exists rather
 * than reusing GalleryArtwork. It holds the raw text the person pasted, ALWAYS,
 * parseable or not. The old panel ran the paste through `coerceNftUrn` on blur
 * and stored the result — so an unrecognised link became `null`, the re-render
 * drew an empty box, and the work the owner had just pasted was gone with no
 * message (owner, 2026-08-10: "it disappears after a few seconds"). Keeping the
 * text means a bad paste is a visible, fixable row instead of a silent deletion.
 */
export interface GalleryArtworkEntry {
  id: string;
  /** Exactly what was pasted. Never discarded, even when it does not parse. */
  sourceText: string;
  /** Parsed from `sourceText`. Null when it is not a reference we recognise. */
  urn: string | null;
  /** Exactly what was pasted in the image box. Kept for the same reason. */
  imageSourceText: string;
  /** Parsed from `imageSourceText`. Set = this work hangs as a plain image. */
  imageUrl: string | null;
  /** Plaque text. Free-form — the token's own name is not always the show's. */
  title: string;
  artist: string;
}

export function createArtworkEntry(
  id: string,
  partial: Partial<Omit<GalleryArtworkEntry, "id">> = {}
): GalleryArtworkEntry {
  const sourceText = (partial.sourceText ?? "").trim();
  const imageSourceText = (partial.imageSourceText ?? "").trim();
  return {
    id,
    sourceText,
    urn: partial.urn !== undefined ? partial.urn : sourceText ? coerceNftUrn(sourceText) : null,
    imageSourceText,
    imageUrl:
      partial.imageUrl !== undefined ? partial.imageUrl : coerceImageUrl(imageSourceText),
    title: partial.title ?? "",
    artist: partial.artist ?? "",
  };
}

export function normalizeArtworkEntry(raw: unknown): GalleryArtworkEntry | null {
  if (!isRecord(raw)) return null;
  const id = text(raw.id, "", 64);
  if (!id) return null;
  const sourceText = text(raw.sourceText, "", 400);
  // The urn is re-derived rather than trusted: a saved entry from before a
  // parser fix should start resolving the moment the parser learns its format.
  const urn = sourceText ? coerceNftUrn(sourceText) : null;
  const imageSourceText = text(raw.imageSourceText, "", 400);
  return {
    id,
    sourceText,
    urn: urn && isValidNftUrn(urn) ? urn : null,
    imageSourceText,
    imageUrl: coerceImageUrl(imageSourceText),
    title: text(raw.title, "", 120),
    artist: text(raw.artist, "", 120),
  };
}

/**
 * The artwork a library entry hangs as. An unparseable entry hangs nothing.
 *
 * An image URL OUTRANKS the NFT link when both are filled. Nobody pastes an
 * image by accident — it is typed only after a frame came up empty — so the
 * later, deliberate answer wins over the one that already failed to draw.
 */
export function artworkFromEntry(entry: GalleryArtworkEntry): GalleryArtwork {
  return {
    kind: entry.imageUrl ? "image" : entry.urn ? "nft" : "empty",
    urn: entry.urn,
    imageUrl: entry.imageUrl,
    title: entry.title,
    artist: entry.artist,
  };
}

export function nextArtworkEntryId(entries: readonly GalleryArtworkEntry[]): string {
  const taken = new Set(entries.map((e) => e.id));
  let n = entries.length + 1;
  while (taken.has(`work_${n}`)) n++;
  return `work_${n}`;
}

export function normalizeArtwork(partial: unknown): GalleryArtwork {
  if (!isRecord(partial)) return emptyArtwork();
  const urn = typeof partial.urn === "string" ? partial.urn.trim() : "";
  // The kind follows the CONTENT rather than the declared field: a piece
  // claiming kind "nft" with a URN the explorer cannot resolve renders as a
  // broken frame, which reads as a bug in the gallery rather than a bad paste
  // upstream. Same for an "image" that carries no loadable URL.
  const valid = isValidNftUrn(urn);
  const imageUrl = coerceImageUrl(partial.imageUrl);
  return {
    kind: imageUrl ? "image" : valid ? "nft" : "empty",
    urn: valid ? urn.toLowerCase() : null,
    imageUrl,
    title: text(partial.title, "", 120),
    artist: text(partial.artist, "", 120),
  };
}

/* -------------------------------------------------------------------------- */
/* Placement — the part the builder owns                                       */
/* -------------------------------------------------------------------------- */

export interface GalleryPiecePlacement {
  /** Building wall/floor coordinates, or free scene-centred coordinates. */
  scope?: "building" | "site";
  /**
   * Which building the frame hangs in. Null = the primary building.
   *
   * Without this the gallery was scene-level config carrying building-local
   * coordinates, and the runtime resolved every frame against `modelOrigin` —
   * the primary building's origin. A scene with two buildings therefore hung
   * every frame in the first one, and the Floor dropdown listed the first
   * building's floors, which is why a floor could be picked for a building that
   * was never named (owner, 2026-08-10). Same failure shape as the site-zone
   * two-frames bug: a coordinate is meaningless without the frame it is in.
   */
  buildingId: string | null;
  /** 0 = ground. Height is measured from THIS floor's walk surface. */
  floorIndex: number;
  /** Building-local metres, matching SmartPlacementSpec's convention. */
  centerX: number;
  centerZ: number;
  /**
   * Centre of the artwork above the floor's walk surface, metres.
   *
   * Museum hang height is 1.45–1.55 m to the centre of the work regardless of
   * its size, so that every piece in a room shares one horizon line. We default
   * to 1.5 and measure to the centre for the same reason.
   */
  heightAboveFloor: number;
  /** Yaw in radians. 0 faces +Z, matching SmartPlacementSpec.rotationY. */
  rotationY: number;
  /** Artwork size in metres. The explorer draws its frame around this. */
  width: number;
  height: number;
}

export interface GalleryPiece {
  id: string;
  /** Shown in the builder list and on the gallery site. */
  name: string;
  placement: GalleryPiecePlacement;
  frameStyle: GalleryFrameStyle;
  /** Shows through an artwork's transparent pixels. Hex. */
  backgroundColor: string;
  /**
   * The library entry this frame shows, or null for a bare frame.
   *
   * `normalizeGalleryConfig` copies the entry into `artwork` below, so nothing
   * downstream — runtime, live document, publish — has to know the library
   * exists. An id naming an entry that was deleted resolves to an empty frame
   * rather than to stale artwork.
   */
  artworkId: string | null;
  /**
   * What is published in the frame — resolved from `artworkId` when one is set.
   * A live document may replace this. Still authoritative for pieces authored
   * before the library existed, which carry artwork and no id.
   */
  artwork: GalleryArtwork;
  /**
   * Pin the published artwork. The gallery site can still see the piece but
   * cannot swap it — for a permanent installation the owner does not want a
   * co-curator to overwrite by accident.
   */
  contentLocked: boolean;
}

export const DEFAULT_HANG_HEIGHT_M = 1.5;
export const DEFAULT_PIECE_WIDTH_M = 1.2;
export const DEFAULT_PIECE_HEIGHT_M = 1.2;
export const DEFAULT_GALLERY_BACKGROUND = "#a39cdb";

export function defaultPiecePlacement(
  partial: Partial<GalleryPiecePlacement> = {}
): GalleryPiecePlacement {
  return {
    scope: partial.scope === "site" ? "site" : "building",
    buildingId: null,
    floorIndex: 0,
    centerX: 0,
    centerZ: 0,
    heightAboveFloor: DEFAULT_HANG_HEIGHT_M,
    rotationY: 0,
    width: DEFAULT_PIECE_WIDTH_M,
    height: DEFAULT_PIECE_HEIGHT_M,
    ...partial,
  };
}

export function createGalleryPiece(
  id: string,
  partial: Partial<Omit<GalleryPiece, "id" | "placement">> & {
    placement?: Partial<GalleryPiecePlacement>;
  } = {}
): GalleryPiece {
  return {
    id,
    name: partial.name ?? "Artwork",
    placement: defaultPiecePlacement(partial.placement),
    frameStyle: normalizeFrameStyle(partial.frameStyle),
    backgroundColor: partial.backgroundColor ?? DEFAULT_GALLERY_BACKGROUND,
    artworkId: partial.artworkId ?? null,
    artwork: normalizeArtwork(partial.artwork),
    contentLocked: partial.contentLocked === true,
  };
}

/* -------------------------------------------------------------------------- */
/* Live source                                                                 */
/* -------------------------------------------------------------------------- */

export interface GalleryLiveSource {
  /**
   * Public https document the scene polls. Baked at publish so the scene knows
   * where to look without being told by anyone in-world.
   */
  url: string;
  /**
   * Seconds between polls. A gallery is not a ticker — a curator swapping a
   * piece can wait half a minute, and every poll is a fetch from every visitor's
   * client, so the floor is deliberately high.
   */
  pollSeconds: number;
  /**
   * Where an in-world curator writes a swap back to. Null on a scene published
   * before in-world curation existed, and on any scene whose publish could not
   * register a gallery — the picker then stays shut rather than offering an
   * edit that would evaporate on reload.
   *
   * Separate from `url` because the two have opposite trust models: `url` is a
   * public document any visitor's client reads, this one accepts writes and is
   * authorized per-wallet on the server. Deriving one from the other would make
   * the read endpoint look like it grants write access.
   */
  curateUrl: string | null;
}

export const MIN_GALLERY_POLL_SECONDS = 15;
export const DEFAULT_GALLERY_POLL_SECONDS = 30;

/* -------------------------------------------------------------------------- */
/* Config                                                                      */
/* -------------------------------------------------------------------------- */

export interface GalleryConfig {
  version: typeof GALLERY_VERSION;
  enabled: boolean;
  /**
   * The row the gallery site edits and the scene reads. Null until the build is
   * first saved to the gallery backend — an unclaimed gallery still renders its
   * published artwork, it just has no site to be curated from.
   */
  galleryId: string | null;
  /** Shown on the gallery site and on the in-world plaques. */
  title: string;
  /** Null = published artwork only, no runtime fetch. */
  live: GalleryLiveSource | null;
  /**
   * The collection. Entered once, hung by any number of frames, and kept whole
   * even when nothing currently shows a given work — a library that dropped
   * unhung works would delete the collection every time a frame was removed.
   */
  library: GalleryArtworkEntry[];
  pieces: GalleryPiece[];
}

export function defaultGalleryConfig(): GalleryConfig {
  return {
    version: GALLERY_VERSION,
    enabled: false,
    galleryId: null,
    title: "Gallery",
    live: null,
    library: [],
    pieces: [],
  };
}

/** Named-gallery layout is WIP; identity resize so the Social panel can import this. */
export function resizeSpacePieces(
  pieces: readonly GalleryPiece[],
  _space: { id: string }
): GalleryPiece[] {
  return [...pieces];
}

export function normalizeGalleryConfig(
  partial: Partial<GalleryConfig> | null | undefined
): GalleryConfig {
  const base = defaultGalleryConfig();
  if (!isRecord(partial)) return base;

  const rawLibrary = Array.isArray(partial.library) ? partial.library : [];
  const libraryIds = new Set<string>();
  const library: GalleryArtworkEntry[] = [];
  for (const raw of rawLibrary) {
    const entry = normalizeArtworkEntry(raw);
    if (!entry || libraryIds.has(entry.id)) continue;
    libraryIds.add(entry.id);
    library.push(entry);
  }
  const byArtworkId = new Map(library.map((e) => [e.id, e]));

  const rawPieces = Array.isArray(partial.pieces) ? partial.pieces : [];
  const seen = new Set<string>();
  const pieces: GalleryPiece[] = [];
  for (const raw of rawPieces) {
    if (!isRecord(raw)) continue;
    const id = text(raw.id, "", 64);
    // A duplicate id would make the live document ambiguous about which frame it
    // is filling, so the later one is dropped rather than silently shadowing.
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const placement: Record<string, unknown> = isRecord(raw.placement) ? raw.placement : {};
    // A frame pointing at a work that was deleted from the library hangs empty.
    // Falling back to its own stale `artwork` would resurrect the work the owner
    // just removed from the collection.
    const artworkId = text(raw.artworkId, "", 64) || null;
    const linked = artworkId ? byArtworkId.get(artworkId) : undefined;
    pieces.push({
      id,
      name: text(raw.name, "Artwork", 80) || "Artwork",
      placement: {
        scope: placement.scope === "site" ? "site" : "building",
        buildingId: text(placement.buildingId, "", 64) || null,
        floorIndex: Math.max(0, Math.round(finite(placement.floorIndex, 0))),
        centerX: finite(placement.centerX, 0),
        centerZ: finite(placement.centerZ, 0),
        heightAboveFloor: clamp(placement.heightAboveFloor, 0, 60, DEFAULT_HANG_HEIGHT_M),
        rotationY: finite(placement.rotationY, 0),
        width: clamp(placement.width, 0.1, 32, DEFAULT_PIECE_WIDTH_M),
        height: clamp(placement.height, 0.1, 32, DEFAULT_PIECE_HEIGHT_M),
      },
      frameStyle: normalizeFrameStyle(raw.frameStyle),
      backgroundColor: hexColor(raw.backgroundColor, DEFAULT_GALLERY_BACKGROUND),
      artworkId,
      artwork: artworkId
        ? linked
          ? artworkFromEntry(linked)
          : emptyArtwork()
        : normalizeArtwork(raw.artwork),
      contentLocked: raw.contentLocked === true,
    });
  }

  const live = isRecord(partial.live) ? partial.live : null;
  const liveUrl = live ? text(live.url, "", 400) : "";

  return {
    version: GALLERY_VERSION,
    enabled: partial.enabled === true,
    galleryId: text(partial.galleryId, "", 64) || null,
    title: text(partial.title, base.title, 80) || base.title,
    live:
      liveUrl && /^https:\/\//i.test(liveUrl)
        ? {
            url: liveUrl,
            pollSeconds: Math.round(
              clamp(
                live?.pollSeconds,
                MIN_GALLERY_POLL_SECONDS,
                3600,
                DEFAULT_GALLERY_POLL_SECONDS
              )
            ),
            // https only, same as the read url: an in-world write carries an
            // auth chain, and the explorer will not send one over plain http.
            curateUrl: (() => {
              const raw = live ? text(live.curateUrl, "", 400) : "";
              return raw && /^https:\/\//i.test(raw) ? raw : null;
            })(),
          }
        : null,
    library,
    pieces,
  };
}

/* -------------------------------------------------------------------------- */
/* Live document                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One frame's worth of curation. Null means "leave what was published alone",
 * which is not the same as an empty artwork — that is a deliberate bare frame.
 */
export interface GallerySlotUpdate {
  artwork: GalleryArtwork | null;
  frameStyle: GalleryFrameStyle | null;
  backgroundColor: string | null;
}

/**
 * What the public endpoint serves and the scene polls.
 *
 * Note what is NOT here: no positions, no sizes, no floors, no piece list. The
 * document can only speak about frames the published scene already hung, and
 * only about their contents. An attacker who forged this document could hang the
 * wrong painting; they could not move a wall or spawn geometry.
 */
export interface GalleryLiveDocument {
  version: typeof GALLERY_VERSION;
  galleryId: string;
  updatedAt: string;
  slots: Record<string, GallerySlotUpdate>;
}

export function normalizeLiveDocument(raw: unknown): GalleryLiveDocument | null {
  if (!isRecord(raw)) return null;
  const galleryId = text(raw.galleryId, "", 64);
  if (!galleryId) return null;

  const slots: Record<string, GallerySlotUpdate> = {};
  if (isRecord(raw.slots)) {
    for (const [pieceId, value] of Object.entries(raw.slots)) {
      if (!pieceId || !isRecord(value)) continue;
      slots[pieceId] = {
        artwork: "artwork" in value && value.artwork != null ? normalizeArtwork(value.artwork) : null,
        frameStyle: value.frameStyle == null ? null : normalizeFrameStyle(value.frameStyle),
        backgroundColor:
          typeof value.backgroundColor === "string"
            ? hexColor(value.backgroundColor, DEFAULT_GALLERY_BACKGROUND)
            : null,
      };
    }
  }

  return {
    version: GALLERY_VERSION,
    galleryId,
    updatedAt: text(raw.updatedAt, "", 40) || new Date(0).toISOString(),
    slots,
  };
}

/**
 * Fold live curation over the published pieces.
 *
 * Placement never moves. `contentLocked` pieces ignore the document entirely,
 * and slots naming a piece this scene does not have are dropped — a gallery
 * whose frames were removed in a later publish must not resurrect them.
 */
export function mergeGalleryLiveDocument(
  pieces: readonly GalleryPiece[],
  doc: GalleryLiveDocument | null
): GalleryPiece[] {
  if (!doc) return pieces.map((p) => ({ ...p }));
  return pieces.map((piece) => {
    const update = doc.slots[piece.id];
    if (!update || piece.contentLocked) return { ...piece };
    return {
      ...piece,
      artwork: update.artwork ?? piece.artwork,
      frameStyle: update.frameStyle ?? piece.frameStyle,
      backgroundColor: update.backgroundColor ?? piece.backgroundColor,
    };
  });
}

/** The document a freshly published gallery implies, before any curation. */
export function liveDocumentFromConfig(config: GalleryConfig): GalleryLiveDocument {
  const slots: Record<string, GallerySlotUpdate> = {};
  for (const piece of config.pieces) {
    slots[piece.id] = {
      artwork: piece.artwork,
      frameStyle: piece.frameStyle,
      backgroundColor: piece.backgroundColor,
    };
  }
  return {
    version: GALLERY_VERSION,
    galleryId: config.galleryId ?? "",
    updatedAt: new Date().toISOString(),
    slots,
  };
}

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Yaw offset applied to an image-mode artwork plane, in degrees.
 *
 * Zero on purpose, and load-bearing. An SDK7 plane is two-sided: the explorer
 * maps its front face straight and its back face mirrored. Turning the plane
 * 180° to chase NftShape's local -Z convention therefore shows the *back*, and
 * every word on the artwork reads right-to-left (the Bitcoin sweater
 * regression). Hand-authored UVs cannot rescue that -- the explorer owns the
 * plane's vertex order, so guessing at it rotated the picture 90° instead.
 * A centred plane occupies the same space either way, so the fix is simply to
 * present the front face and let the explorer's own mapping stand.
 */
export const GALLERY_IMAGE_PLANE_YAW_OFFSET_DEG = 0;

/**
 * Emissive intensity for gallery frame moulding.
 *
 * The buildings this ships into are lit by emissive surfaces only — there is no
 * real light in a tower interior (see the interior-lights two-layer split), so a
 * PBR material with no emissive term renders BLACK there. The artwork plane and
 * its backdrop dodge this by being unlit; the moulding cannot, because "gold"
 * and "brushed metal" are exactly the material response an unlit shader throws
 * away. Emissive at the frame's own colour is the floor instead: the frame is
 * never darker than its swatch, and still catches real light where there is any.
 */
export const GALLERY_UNLIT_INTERIOR_EMISSIVE = 1;

/**
 * Building-local Y of the artwork's centre, in composer/DCL metres.
 *
 * Mirrors `smartEntityFloorBaseY`: floor base is `floorIndex * storyHeight`, and
 * the walk surface sits one slab thickness above that — which is the surface a
 * hang height is measured from, because it is the floor people stand on.
 *
 * Callers placing a scene entity must still add the building GLB's origin Y, the
 * same as smart entities do.
 */
export function galleryPieceCenterY(piece: GalleryPiece, storyHeight: number): number {
  if (piece.placement.scope === "site") return piece.placement.heightAboveFloor;
  const floorBaseY = piece.placement.floorIndex * Math.max(0.5, storyHeight);
  return walkSurfaceY(floorBaseY) + piece.placement.heightAboveFloor;
}

/**
 * Transform +Z after yaw. That is NOT the picture. NftShape's artwork is local
 * −Z (same as furniture). For an interior hang, +Z should be the wall outward.
 */
export function galleryPieceFacing(piece: GalleryPiece): { x: number; z: number } {
  const yaw = piece.placement.rotationY;
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/** Direction the artwork looks — local −Z. Into the room on a correct interior hang. */
export function galleryPiecePictureFacing(piece: GalleryPiece): { x: number; z: number } {
  const forward = galleryPieceFacing(piece);
  return { x: -forward.x, z: -forward.z };
}

/**
 * The building a frame's coordinates are measured in.
 *
 * Every building ships as its own GLB, centred on itself with its rotation
 * baked in and placed at `origin` by the runtime (see `placedBuildingOriginDcl`).
 * A frame's `centerX`/`centerZ` are local to that unrotated model, so reaching
 * scene space means rotating by the same angle the geometry was baked with and
 * then offsetting — which is why this carries the rotation and the story height
 * rather than just a point.
 */
export interface GalleryBuildingFrame {
  origin: { x: number; y: number; z: number };
  /** Yaw baked into this building's GLB, degrees. 0 for the primary building. */
  rotationDeg: number;
  storyHeight: number;
}

/**
 * Frame placement in scene metres.
 *
 * THE reason this lives in shared/ rather than in either caller: the composer
 * preview and the scene runtime must agree by construction. Placement bugs in
 * this codebase have almost always been two call sites doing the same maths
 * slightly differently, so preview and in-world disagreed and nobody could tell
 * which was lying. One function, both callers, no second opinion.
 */
export function galleryPieceSceneTransform(
  piece: GalleryPiece,
  frame: GalleryBuildingFrame
): { x: number; y: number; z: number; yawDeg: number } {
  const theta = (frame.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const lx = piece.placement.centerX;
  const lz = piece.placement.centerZ;
  return {
    x: frame.origin.x + lx * cos + lz * sin,
    y: frame.origin.y + galleryPieceCenterY(piece, frame.storyHeight),
    z: frame.origin.z - lx * sin + lz * cos,
    yawDeg: (piece.placement.rotationY * 180) / Math.PI + frame.rotationDeg,
  };
}

/**
 * Picture lamp — one SDK7 Point light per hung NFT, owned by the gallery app.
 *
 * Emissive ceilings do not illuminate a room. A lamp in front of each work does:
 * it lights the canvas and spills onto the floor. Explorer only keeps the
 * nearest 4–10 lights, so one per piece (not a ceiling grid) is the budget:
 * walk into a four-wall gallery and those four stay on.
 *
 * Stand-off is along the picture face (local −Z / into the room), matching the
 * plaque offset. Do not parent the lamp to the NftShape — that entity is scaled
 * to the artwork size, which would stretch the offset.
 */
export const GALLERY_PICTURE_LIGHT_STAND_OFF_M = 1.4;
export const GALLERY_PICTURE_LIGHT_LIFT_M = 0.35;
/** Candela. Half the first hang — 12 k blew the canvas out white. */
export const GALLERY_PICTURE_LIGHT_INTENSITY = 6000;
export const GALLERY_PICTURE_LIGHT_RANGE_M = 11;
/** Warm gallery tungsten, RGB 0–1. */
export const GALLERY_PICTURE_LIGHT_COLOR = {
  r: 1,
  g: 0.93,
  b: 0.82,
} as const;

export function galleryPiecePictureLightTransform(
  piece: GalleryPiece,
  frame: GalleryBuildingFrame
): { x: number; y: number; z: number } {
  const at = galleryPieceSceneTransform(piece, frame);
  const yaw = (at.yawDeg * Math.PI) / 180;
  return {
    x: at.x - Math.sin(yaw) * GALLERY_PICTURE_LIGHT_STAND_OFF_M,
    y: at.y + GALLERY_PICTURE_LIGHT_LIFT_M,
    z: at.z - Math.cos(yaw) * GALLERY_PICTURE_LIGHT_STAND_OFF_M,
  };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export interface GalleryValidationIssue {
  level: "warn" | "error";
  code: string;
  message: string;
  pieceId?: string;
}

export function validateGalleryConfig(
  config: GalleryConfig,
  opts?: { floors?: number; buildingIds?: readonly string[] }
): GalleryValidationIssue[] {
  const issues: GalleryValidationIssue[] = [];
  if (!config.enabled) return issues;

  if (config.pieces.length === 0) {
    issues.push({
      level: "warn",
      code: "gallery.no_pieces",
      message: "Gallery app is on but no frames have been hung",
    });
  }

  // `library` is read defensively because this validator is handed hand-built
  // configs (tests, and any caller spreading defaultGalleryConfig from before
  // the library existed) as well as normalized ones.
  const library = config.library ?? [];

  // A link that did not parse is reported, never discarded. This is the whole
  // point of keeping `sourceText`: the owner sees the row they pasted and can
  // fix it, instead of finding the field mysteriously blank.
  for (const entry of library) {
    if (entry.sourceText && !entry.urn) {
      issues.push({
        level: "warn",
        code: "gallery.unreadable_link",
        message: `"${entry.title || entry.id}" — "${entry.sourceText.slice(
          0,
          60
        )}" is not an NFT link we recognise, so it will hang as an empty frame`,
      });
    }
  }

  const known = opts?.buildingIds ? new Set(opts.buildingIds) : null;
  const libraryIds = new Set(library.map((e) => e.id));
  const topFloor = typeof opts?.floors === "number" ? Math.max(0, opts.floors - 1) : null;
  for (const piece of config.pieces) {
    if (
      piece.placement.scope !== "site" &&
      known &&
      piece.placement.buildingId &&
      !known.has(piece.placement.buildingId)
    ) {
      issues.push({
        level: "error",
        code: "gallery.building_missing",
        pieceId: piece.id,
        message: `"${piece.name}" hangs in a building that is no longer in this scene`,
      });
    }
    if (piece.artworkId && !libraryIds.has(piece.artworkId)) {
      issues.push({
        level: "warn",
        code: "gallery.missing_artwork",
        pieceId: piece.id,
        message: `"${piece.name}" points at a work that is no longer in the library — it will hang empty`,
      });
    }
    // Floors are per building, so the primary building's floor count says
    // nothing about a frame hanging in a different one.
    if (
      piece.placement.scope !== "site" &&
      topFloor !== null &&
      !piece.placement.buildingId &&
      piece.placement.floorIndex > topFloor
    ) {
      issues.push({
        level: "error",
        code: "gallery.floor_out_of_range",
        pieceId: piece.id,
        message: `"${piece.name}" is on floor ${piece.placement.floorIndex}, above the top floor (${topFloor})`,
      });
    }
    if (piece.artwork.kind === "nft" && !isValidNftUrn(piece.artwork.urn)) {
      issues.push({
        level: "error",
        code: "gallery.bad_urn",
        pieceId: piece.id,
        message: `"${piece.name}" has an NFT reference the explorer cannot resolve`,
      });
    }
  }

  if (config.live && config.galleryId === null) {
    issues.push({
      level: "error",
      code: "gallery.live_without_id",
      message: "Live curation is configured but this gallery has no id — save it to the gallery site first",
    });
  }

  return issues;
}

/* -------------------------------------------------------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function finite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function text(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, max);
}

function hexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}
