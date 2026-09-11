/**
 * L1 Museum — the whole Decentraland L1 wearable set, one collection per floor.
 *
 * WHAT MAKES THIS DIFFERENT FROM RETAIL SHOP. Retail Shop is a floor plan the
 * owner draws: every plinth is placed by hand and stores its own X/Z. A museum
 * of 438 items cannot be drawn by hand, so nothing here is placed by a human.
 * The owner picks a building; this file derives the floors, the collection on
 * each floor, and the position of every plinth from the building's own plan.
 * That is the "drop it on any building" behaviour — a 31-floor tower and a
 * 12-floor block both fill, the short one just packs each floor denser.
 *
 * THE MUSEUM STORES STATIC WEARABLE ASSETS, NOT AVATARS. The build pipeline
 * resolves each L1 representation once, freezes it in its authored neutral pose,
 * removes skins/joints/animations, and embeds its textures into one GLB per
 * exhibit. A reusable scene-primitive ghost supplies body context without skin,
 * face, hair, underwear or fallback clothing. The Builder includes this optional
 * pack only when the museum app is enabled.
 *
 * THREE THINGS THAT LOOK LIKE POLISH AND ARE NOT:
 *
 *   1. BODY SHAPE IS PER ITEM. 89 of the 438 L1 items ship a representation for
 *      only one body shape. A museum that hardcodes BaseMale renders the 44
 *      female-only items as a bare avatar wearing nothing — the exhibit is
 *      simply missing, with no error anywhere. `l1MannequinBodyShape` reads the
 *      mask the catalog snapshot carries.
 *
 *   2. ONE MANNEQUIN IS ONE OUTFIT, NOT ONE ITEM. The L1 slugs encode sets:
 *      `bee_suit_upper_body`, `bee_suit_lower_body`, `bee_suit_feet`... are one
 *      costume split across five tokens. Standing each on its own plinth was the
 *      museum showing an owner a shoe, then the matching trousers, then the
 *      matching jacket, three plinths apart. `l1BuildSets` regroups them by slug
 *      stem: 438 items become 335 exhibits, 45 of which wear 2-6 pieces.
 *      NOTHING ELSE IS WORN. An exhibit with one `hat` in it is a bare figure in
 *      a hat, deliberately — a filler outfit underneath cost 7 extra wearable
 *      fetches per mannequin and diluted the piece it was there to show.
 *
 *   3. NO MINT PATH. collections-v1 is Ethereum mainnet and closed since 2021 —
 *      there is no CollectionStore item to mint, so `l1MarketplaceUrl` opens the
 *      secondary listing. Do not reach for buyCollectionItemWithMana here; it
 *      parses a collections-v2 URN and will not recognise these.
 *
 * FLOOR STREAMING IS THE RUNTIME'S JOB, NOT THIS FILE'S. This file plans all
 * 438 wearables as data; scene/src/l1-museum builds only the floors near the
 * player even though the static assets are far lighter than AvatarShape rigs.
 */

import {
  L1_CATALOG_ITEM_COUNT,
  L1_CATALOG_RAW,
  type L1BodyMask,
} from "./l1-museum-catalog";

export type { L1BodyMask } from "./l1-museum-catalog";
import type { PerimeterEdge, PerimeterFootprint } from "./perimeter";
import { walkSurfaceY } from "./kit-geometry";

export const L1_MUSEUM_VERSION = 1 as const;

/* -------------------------------------------------------------------------- */
/* Catalog                                                                     */
/* -------------------------------------------------------------------------- */

export interface L1MuseumItem {
  /** Full wearable URN — source identity for the static exhibit asset. */
  urn: string;
  /** Catalog slug. The set key is this with its category token removed. */
  slug: string;
  /** Museum plaque text. */
  name: string;
  category: string;
  rarity: string;
  body: L1BodyMask;
  collectionSlug: string;
  collectionTitle: string;
}

export interface L1MuseumCollection {
  slug: string;
  title: string;
  /** Ethereum contract — used for the marketplace link and nothing else. */
  contract: string;
  items: L1MuseumItem[];
  /** The items regrouped into outfits. ONE SET IS ONE MANNEQUIN. */
  sets: L1MuseumSet[];
}

/**
 * One mannequin's worth of L1: a costume, or a single accessory.
 *
 * `pieces` is what the static build merges and nothing is added underneath, so
 * a one-piece set really is one hat over the ghost context. A base outfit under
 * it would read as an outfit the museum was showing.
 */
export interface L1MuseumSet {
  /** Stable across republishes: `<collectionSlug>:<stem>`. */
  id: string;
  /** What the plaque and the nametag say. "Bee Suit", not "Bee Suit Leggings". */
  name: string;
  /** Everything worn, catalog order. Length 1 for a standalone accessory. */
  pieces: L1MuseumItem[];
  /** Rarest piece — a set is only as exclusive as its best part. */
  rarity: string;
  /** The one body shape every piece in this set has geometry for. */
  body: L1BodyMask;
  collectionSlug: string;
  collectionTitle: string;
}

export function l1WearableUrn(collectionSlug: string, itemSlug: string): string {
  return `urn:decentraland:ethereum:collections-v1:${collectionSlug}:${itemSlug}`;
}

/* -------------------------------------------------------------------------- */
/* Outfits — regrouping 438 items into 335 mannequins                          */
/* -------------------------------------------------------------------------- */

/**
 * Rarest wins when a set mixes tiers. Ordered low to high; anything unknown
 * sorts below `epic` rather than throwing, because the plaque is cosmetic and a
 * catalog refresh must never be able to break the packer.
 */
const L1_RARITY_ORDER: readonly string[] = [
  "uncommon", "rare", "swanky", "epic", "legendary", "mythic", "unique",
];

/**
 * Slug tokens that name the DROP, not the costume: gender variants, the
 * contest/collection prefix, the year. `hwn_2020_cult_servant` is the Cult
 * Servant; `f_led_suit` and `m_led_suit` are the same Led Suit cut twice.
 */
const L1_STEM_NOISE = new Set([
  "f", "m", "cw", "hwn", "wz", "xmas", "2019", "2020", "2021",
]);

/** Words that stay lowercase inside a title unless they lead it. */
const L1_MINOR_WORDS = new Set(["of", "the", "and", "a", "an", "in", "on", "de"]);

/**
 * The set key: the item slug with its own category token removed.
 *
 * Deliberately uses the item's DECLARED category rather than sniffing a suffix
 * list — `spy_suit` is an `upper_body` whose slug does not end in its category,
 * and a sniffing rule would have to guess whether `classic_top_hat` is a `hat`
 * or a `top_head`. The declared category cannot be wrong.
 */
function l1SetStem(itemSlug: string, category: string): string {
  const suffix = `_${category}`;
  return itemSlug.endsWith(suffix) ? itemSlug.slice(0, -suffix.length) : itemSlug;
}

/**
 * "Evil Cult Servant Boots - Halloween 2020" → "Evil Cult Servant Boots".
 *
 * Only a dash FOLLOWED BY WHITESPACE is a tail: "Soccer T-Shirt" has to survive,
 * and an earlier cut on any dash turned 26 shirts into "... Soccer T".
 */
function l1CleanItemName(name: string): string {
  const cut = name.replace(/\s*[-–—]\s+.*$/, "").trim();
  return cut || name.trim();
}

function l1TitleFromStem(stem: string): string {
  const words = stem.split("_").filter((w) => w && !L1_STEM_NOISE.has(w));
  return words
    .map((w, i) =>
      i > 0 && L1_MINOR_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
}

/** Words every member name opens with, comparing case-insensitively. */
function l1CommonWordPrefix(names: readonly string[]): string {
  if (!names.length) return "";
  const split = names.map((n) => n.split(/\s+/).filter(Boolean));
  const out: string[] = [];
  for (let i = 0; i < split[0]!.length; i++) {
    const word = split[0]![i]!;
    if (!split.every((parts) => parts[i]?.toLowerCase() === word.toLowerCase())) break;
    out.push(word);
  }
  return out.join(" ");
}

/**
 * Name the outfit.
 *
 * Two sources, and each one alone gets it wrong: the shared name prefix loses
 * the set whose pieces are named apart ("Pony Tail Hair" + "Spy Suit"), and the
 * slug stem loses casing and acronyms ("binance_us" → "Binance Us", "jing" →
 * "Jing" for what everyone calls Peking Opera Jing). So: take the shared prefix
 * when it is a real phrase, fall back to the stem, and take the prefix again
 * when the stem is a bare token.
 */
function l1SetName(stem: string, names: readonly string[]): string {
  const shared = l1CommonWordPrefix(names);
  if (shared.split(/\s+/).filter(Boolean).length >= 2) return shared;
  const fromStem = l1TitleFromStem(stem);
  if (fromStem.split(/\s+/).filter(Boolean).length >= 2) return fromStem;
  return shared || fromStem || names[0] || stem;
}

/**
 * 438 items → 335 sets.
 *
 * Two splits are not optional. A set holding both a male-only and a female-only
 * piece cannot be worn by one dummy — whichever body it gets, the other piece
 * renders as nothing at all, with no error anywhere. And two pieces in the SAME
 * category fight for one slot, so the loser is invisible for the same silent
 * reason. Both cases fall out into their own mannequin instead.
 */
export function l1BuildSets(items: readonly L1MuseumItem[]): L1MuseumSet[] {
  const byStem = new Map<string, L1MuseumItem[]>();
  for (const item of items) {
    const stem = l1SetStem(item.slug, item.category);
    const bucket = byStem.get(stem);
    if (bucket) bucket.push(item);
    else byStem.set(stem, [item]);
  }

  const out: L1MuseumSet[] = [];
  for (const [stem, members] of byStem) {
    const hasMale = members.some((i) => i.body === 1);
    const hasFemale = members.some((i) => i.body === 2);
    const variants: { items: L1MuseumItem[]; tag: string }[] =
      hasMale && hasFemale
        ? [
            { items: members.filter((i) => i.body !== 2), tag: ":m" },
            { items: members.filter((i) => i.body !== 1), tag: ":f" },
          ]
        : [{ items: members, tag: "" }];

    for (const variant of variants) {
      // One mannequin per category-conflict-free bucket, first fit.
      const buckets: L1MuseumItem[][] = [];
      for (const item of variant.items) {
        const room = buckets.find((b) => !b.some((x) => x.category === item.category));
        if (room) room.push(item);
        else buckets.push([item]);
      }
      for (let b = 0; b < buckets.length; b++) {
        const pieces = buckets[b]!;
        if (!pieces.length) continue;
        const body: L1BodyMask = pieces.some((i) => i.body === 2)
          ? 2
          : pieces.some((i) => i.body === 1)
            ? 1
            : 0;
        const rarity = pieces.reduce((best, i) =>
          L1_RARITY_ORDER.indexOf(i.rarity) > L1_RARITY_ORDER.indexOf(best.rarity) ? i : best
        ).rarity;
        const names = pieces.map((i) => l1CleanItemName(i.name));
        out.push({
          id: `${pieces[0]!.collectionSlug}:${stem}${variant.tag}${b ? `#${b + 1}` : ""}`,
          name: pieces.length === 1 ? names[0]! : l1SetName(stem, names),
          pieces: [...pieces],
          rarity,
          body,
          collectionSlug: pieces[0]!.collectionSlug,
          collectionTitle: pieces[0]!.collectionTitle,
        });
      }
    }
  }
  return out;
}

function decodeCatalog(): L1MuseumCollection[] {
  return L1_CATALOG_RAW.map(([slug, title, contract, items]) => {
    const decoded: L1MuseumItem[] = items.map(
      ([itemSlug, name, category, rarity, body]) => ({
        urn: l1WearableUrn(slug, itemSlug),
        slug: itemSlug,
        name,
        category,
        rarity,
        body,
        collectionSlug: slug,
        collectionTitle: title,
      })
    );
    return { slug, title, contract, items: decoded, sets: l1BuildSets(decoded) };
  });
}

/** Decoded once. Ordered largest collection first. */
export const L1_MUSEUM_COLLECTIONS: readonly L1MuseumCollection[] = decodeCatalog();

export const L1_MUSEUM_TOTAL_ITEMS = L1_CATALOG_ITEM_COUNT;

/** Mannequins the whole set needs once the items are grouped into outfits. */
export const L1_MUSEUM_TOTAL_SETS = L1_MUSEUM_COLLECTIONS.reduce(
  (n, c) => n + c.sets.length,
  0
);

export function l1CollectionBySlug(slug: string): L1MuseumCollection | undefined {
  return L1_MUSEUM_COLLECTIONS.find((c) => c.slug === slug);
}

/**
 * Secondary-market listing for an L1 item.
 *
 * L1 wearables are per-token NFTs, not v2 collection ITEMS, so there is no
 * `/contracts/<addr>/items/<id>` page to deep-link. The browse view filtered to
 * the collection contract and the item name is the closest stable target.
 */
export function l1MarketplaceUrl(item: {
  name: string;
  collectionSlug: string;
}): string {
  const collection = l1CollectionBySlug(item.collectionSlug);
  const params = [
    "section=wearables",
    "assetType=nft",
    "vendor=decentraland",
    `search=${encodeURIComponent(item.name)}`,
  ];
  if (collection?.contract) params.push(`contracts=${collection.contract}`);
  return `https://decentraland.org/marketplace/browse?${params.join("&")}`;
}

/* -------------------------------------------------------------------------- */
/* Dressing the mannequin                                                      */
/* -------------------------------------------------------------------------- */

export const L1_BASE_MALE = "urn:decentraland:off-chain:base-avatars:BaseMale";
export const L1_BASE_FEMALE = "urn:decentraland:off-chain:base-avatars:BaseFemale";

/** BaseMale/BaseFemale URN this set actually has geometry for. */
export function l1MannequinBodyShape(body: L1BodyMask): string {
  return body === 2 ? L1_BASE_FEMALE : L1_BASE_MALE;
}

/**
 * What the mannequin wears: the set, and nothing else.
 *
 * There used to be a neutral base outfit filling every category the exhibit did
 * not occupy. It went, for two reasons that turned out to be the same reason.
 * A Bee Suit jacket shown over brown pants and classic shoes is not the Bee
 * Suit — the filler competed with the piece on show. And it cost EIGHT wearable
 * resolutions per plinth where the item itself needs one; on a floor of forty
 * exhibits that is 320 avatar-pipeline fetches for clothes nobody came to see.
 *
 * A one-piece set is therefore a bare figure wearing one hat, on purpose, unless
 * that exhibit has a baked standing mannequin (real body + face + clothes,
 * static). Unbaked exhibits still use the shop-dummy / leftover-body path.
 */
export function l1MannequinWearables(set: { pieces: readonly { urn: string }[] }): string[] {
  return set.pieces.map((piece) => piece.urn);
}

/* -------------------------------------------------------------------------- */
/* Showing the item WITHOUT an avatar                                          */
/* -------------------------------------------------------------------------- */

/**
 * The catalyst's per-URN thumbnail, addressed by URN and nothing else.
 *
 * WHY THIS ENDPOINT AND NOT THE ONE IN THE WEARABLE RECORD. `wearable.thumbnail`
 * is a CONTENT-HASH url, so pinning it would mean carrying 438 hashes in the
 * snapshot and regenerating them whenever a catalyst re-pins. This path is
 * derived from the URN, which is immutable for a collection closed since 2021 —
 * so image mode adds not one byte to the catalog and not one file to the deploy.
 *
 * It is a REMOTE texture, which SDK7 allows for `Material.Texture.Common` — the
 * Gallery has shipped exactly this since 6fb149d. That is the whole reason image
 * mode is free where a floating GLB is not: `GltfContainer` can only read a file
 * INSIDE the deployed scene, so 3D exhibits would mean shipping every wearable
 * (measured 2026-08-19: 39.4 MB over 1045 files for one body shape each).
 */
export const L1_THUMBNAIL_BASE = "https://peer.decentraland.org/lambdas/collections/contents";

export function l1ThumbnailUrl(urn: string): string {
  return `${L1_THUMBNAIL_BASE}/${urn}/thumbnail`;
}

/**
 * WHERE THE ITEM HANGS — metres above the avatar's feet, by category.
 *
 * The point of showing a wearable without a wearer is that it still occupies the
 * place it would occupy on a body: shoes at the ankle, a mask at face height, a
 * hat above the crown. A single float height for all of them is the version that
 * looks like a shop rail, and it is what the first cut shipped — 29 pairs of
 * shoes hovering at chest height, which is exactly as wrong as it sounds.
 *
 * Measured against the DCL base avatar (1.911 m to the crown, see
 * L1_SILHOUETTE_PARTS for where that number comes from). Anything unlisted lands at
 * chest height, which is the safe read for a torso-ish item.
 */
export const L1_BODY_HEIGHT_M: Readonly<Record<string, number>> = {
  feet: 0.12,
  lower_body: 0.62,
  upper_body: 1.28,
  body_shape: 1.0,
  mouth: 1.55,
  facial_hair: 1.52,
  mask: 1.58,
  earring: 1.6,
  eyes: 1.62,
  eyewear: 1.63,
  eyebrows: 1.65,
  helmet: 1.68,
  hair: 1.7,
  hat: 1.74,
  tiara: 1.76,
  top_head: 1.8,
};

/** Fallback height — chest, the safe read for anything torso-ish. */
export const L1_BODY_HEIGHT_DEFAULT_M = 1.28;

export function l1BodyHeightM(category: string): number {
  return L1_BODY_HEIGHT_M[category] ?? L1_BODY_HEIGHT_DEFAULT_M;
}

/**
 * HOW BIG the floating thumbnail is, by category.
 *
 * A thumbnail is a square render of the item, so one size for all of them draws
 * an earring as large as a trench coat and destroys any sense of what the thing
 * actually is. These are roughly the item's real width on a body.
 */
export const L1_ARTWORK_SIZE_BY_CATEGORY: Readonly<Record<string, number>> = {
  upper_body: 1.15,
  lower_body: 1.05,
  body_shape: 1.2,
  feet: 0.62,
  hat: 0.72,
  helmet: 0.74,
  mask: 0.7,
  hair: 0.72,
  tiara: 0.66,
  top_head: 0.72,
  eyewear: 0.55,
  earring: 0.42,
  eyes: 0.46,
  eyebrows: 0.44,
  mouth: 0.42,
  facial_hair: 0.5,
};

/** Metres across for a floating exhibit whose category is not listed. */
export const L1_ARTWORK_SIZE_M = 0.9;

export function l1ArtworkSizeM(category: string): number {
  return L1_ARTWORK_SIZE_BY_CATEGORY[category] ?? L1_ARTWORK_SIZE_M;
}

/**
 * Degrees per second the floating item turns in image mode.
 *
 * Slower than the mannequin's 14: a flat plane sweeping past edge-on reads as a
 * flicker where a solid figure reads as a turn, so it spends longer facing the
 * room. See `L1_ARTWORK_EDGE_FADE` for why it never fully disappears.
 */
export const L1_ARTWORK_YAW_DEG_PER_SEC = 9;

/**
 * One exhibit per ITEM rather than per outfit.
 *
 * The set grouping lets the static build merge a whole costume into one exhibit
 * instead of showing the Bee Suit as four plinths, each carrying a quarter of
 * it. In forced image mode the exhibit IS the wearable, exactly as a museum
 * case holds one object. So image
 * mode plans 438 exhibits, not 335, and every item in the collection gets its
 * own plinth and its own name instead of being folded into a set title.
 *
 * Returned as one-piece `L1MuseumSet`s so every downstream consumer — the
 * packer, the ring layout, the omission report — is untouched by the mode.
 */
export function l1ItemExhibitUnits(items: readonly L1MuseumItem[]): L1MuseumSet[] {
  return items.map((item) => ({
    id: `${item.collectionSlug}:${item.slug}`,
    name: l1CleanItemName(item.name),
    pieces: [item],
    rarity: item.rarity,
    body: item.body,
    collectionSlug: item.collectionSlug,
    collectionTitle: item.collectionTitle,
  }));
}

/**
 * How an exhibit is drawn.
 *
 *   `auto`      — the default. A pre-baked, skeleton-free wearable GLB over a
 *                 reusable opaque dummy mannequin.
 *   `image`     — force every exhibit to float, splitting outfits into their
 *                 pieces. 438 cards in the air.
 *   `mannequin` — same static draw as `auto`. Kept as a saved-config alias.
 */
export type L1MuseumDisplay = "auto" | "image" | "mannequin";

/**
 * How the runtime draws this exhibit.
 *
 *   `float`      — one billboarded thumbnail. Forced `image` mode only.
 *   `silhouette` — primitive ghost plus thumbnail cards. Retained as a safe
 *                  fallback, but not selected by a saved display mode.
 *   `static`     — the actual wearable meshes, pre-baked with no avatar rig,
 *                  over a lightweight ghost mannequin.
 */
export type L1ExhibitDraw = "float" | "silhouette" | "static";

export function l1ExhibitDraw(
  set: { pieces: readonly unknown[] },
  display: L1MuseumDisplay
): L1ExhibitDraw {
  if (display === "image") return "float";
  return "static";
}

/**
 * Lone wearable on its own, vs standing on a figure (silhouette or avatar).
 *
 * Kept because the packer and tests already speak this way. Prefer `l1ExhibitDraw`
 * when the cost of the figure matters.
 */
export function l1ExhibitIsFloating(
  set: { pieces: readonly unknown[] },
  display: L1MuseumDisplay
): boolean {
  return l1ExhibitDraw(set, display) === "float";
}

/**
 * Cheap ethereal dummy — the DCL base avatar's OWN proportions, primitives only.
 *
 * Not guessed. Every number below was measured off the shipped base-body meshes
 * (`BaseMale.glb` / `BaseFemale.glb` from the catalyst) by skinning each vertex
 * into its rest pose and taking the bounding box of the vertices each bone owns.
 * Both bodies are 1.911 m tall to the crown, hips at y 1.0, neck at 1.492,
 * shoulder joints at x ±0.177, knee at 0.489, ankle at 0.082.
 *
 * Why it has to be the real body: a garment is modelled to sit ON that surface,
 * so anything wider than the body pokes through the clothes. The old table was
 * a hand-guessed seven-box dummy — arms at x ±0.28 against a real shoulder of
 * ±0.177, and a 0.42 m-wide spherical torso against a real chest of 0.32 m —
 * which is exactly why the ghost showed outside jackets and sleeves.
 *
 * Every cross-section here is the NARROWER of the two body shapes, then inset a
 * further ~6%: the ghost must stay inside both a male and a female garment, and
 * one dummy serves both. Heights are NOT inset — the silhouette has to read at
 * the right size next to a guest.
 *
 * Y is the centre of the part above the avatar's feet (plinth top). Segments
 * overlap on purpose; a gap between two translucent parts reads as a seam.
 *
 * Arms stay in the authored T-pose because the static wearable GLBs are frozen
 * in that same bind pose. There is no idle animation to pull either mesh away
 * from the other after the first frame.
 *
 * Not an AvatarShape. Not a GLB. Fifteen low-poly primitives, still almost free
 * at the 16-mannequin live ceiling.
 */
export interface L1SilhouettePart {
  id: string;
  /** `sphere` for the rounded masses, `cylinder` for torso and limbs, `box` for feet. */
  shape: "sphere" | "cylinder" | "box";
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /**
   * Cylinders only. Cap width as a fraction of the cross-section, so one part
   * can be a real tapered limb — a thigh is 0.175 m at the hip and 0.116 m at
   * the knee, and a straight tube at either number is wrong at the other end.
   */
  topScale?: number;
  bottomScale?: number;
  /** Optional local Z rotation, used to turn the arm cylinders horizontal. */
  rotationZDeg?: number;
}

export const L1_SILHOUETTE_PARTS: readonly L1SilhouettePart[] = [
  // Crown 1.905 (real 1.911). Sphere, so it sits inside the head box on every axis.
  { id: "head", shape: "sphere", x: 0, y: 1.735, z: 0.01, sx: 0.29, sy: 0.34, sz: 0.3 },
  { id: "neck", shape: "cylinder", x: 0, y: 1.52, z: 0, sx: 0.12, sy: 0.15, sz: 0.12 },
  // Spine2 — narrows into the collar so a hood or a collar never sits on air.
  { id: "chest", shape: "cylinder", x: 0, y: 1.395, z: 0.01, sx: 0.29, sy: 0.195, sz: 0.25, topScale: 0.86 },
  // Spine/Spine1 — the widest the ribcage gets is 0.315 m on the female body.
  { id: "torso", shape: "cylinder", x: 0, y: 1.245, z: 0.01, sx: 0.31, sy: 0.29, sz: 0.26, topScale: 0.94 },
  { id: "pelvis", shape: "cylinder", x: 0, y: 0.985, z: 0, sx: 0.34, sy: 0.29, sz: 0.27, bottomScale: 0.9 },
  // Thigh bones sit at x ±0.089; the leg reaches the centre line at the crotch.
  { id: "thigh_l", shape: "cylinder", x: -0.093, y: 0.685, z: 0, sx: 0.175, sy: 0.41, sz: 0.215, bottomScale: 0.66 },
  { id: "thigh_r", shape: "cylinder", x: 0.093, y: 0.685, z: 0, sx: 0.175, sy: 0.41, sz: 0.215, bottomScale: 0.66 },
  { id: "calf_l", shape: "cylinder", x: -0.091, y: 0.278, z: -0.005, sx: 0.112, sy: 0.415, sz: 0.142, bottomScale: 0.62 },
  { id: "calf_r", shape: "cylinder", x: 0.091, y: 0.278, z: -0.005, sx: 0.112, sy: 0.415, sz: 0.142, bottomScale: 0.62 },
  // Feet point forward — the only part with real Z offset, and the reason a shoe
  // thumbnail at ankle height reads as a shoe and not a puck.
  { id: "foot_l", shape: "box", x: -0.089, y: 0.037, z: 0.022, sx: 0.094, sy: 0.074, sz: 0.18 },
  { id: "foot_r", shape: "box", x: 0.089, y: 0.037, z: 0.022, sx: 0.094, sy: 0.074, sz: 0.18 },
  // Bind-pose arms: shoulder ±0.177 → wrist ±0.747, tapering toward the hand.
  { id: "arm_l", shape: "cylinder", x: -0.455, y: 1.466, z: 0, sx: 0.094, sy: 0.58, sz: 0.09, bottomScale: 0.7, rotationZDeg: 90 },
  { id: "arm_r", shape: "cylinder", x: 0.455, y: 1.466, z: 0, sx: 0.094, sy: 0.58, sz: 0.09, bottomScale: 0.7, rotationZDeg: -90 },
  { id: "hand_l", shape: "sphere", x: -0.782, y: 1.466, z: 0.005, sx: 0.118, sy: 0.086, sz: 0.086 },
  { id: "hand_r", shape: "sphere", x: 0.782, y: 1.466, z: 0.005, sx: 0.118, sy: 0.086, sz: 0.086 },
];

/** Crown of the measured base avatar, feet on the plinth top. */
export const L1_SILHOUETTE_HEIGHT_M = 1.911;

/** Sit the thumbnail just in front of the dummy so it is not buried in a box. */
export const L1_SILHOUETTE_ARTWORK_Z_M = 0.16;

/** The collections a plan should pack, with their exhibits in the chosen unit. */
export function l1ExhibitCollections(
  collections: readonly L1MuseumCollection[],
  display: L1MuseumDisplay
): L1MuseumCollection[] {
  // `auto` and `mannequin` both plan in SETS — that is what keeps a costume on
  // one plinth. Only forced image mode breaks them apart.
  if (display !== "image") return [...collections];
  return collections.map((c) => ({ ...c, sets: l1ItemExhibitUnits(c.items) }));
}

/* -------------------------------------------------------------------------- */
/* Floor geometry — where the plinths stand                                    */
/* -------------------------------------------------------------------------- */

/** Plinth centre distance from the interior wall face. */
export const L1_WALL_INSET_M = 1.4;
/** Gap between concentric plinth rings. */
export const L1_RING_GAP_M = 2.6;
/** Minimum distance between two plinth centres on the same ring. */
export const L1_MIN_SPACING_M = 2.0;
/** Keep plinths off the corners — a mannequin in a corner is half in the wall. */
export const L1_CORNER_MARGIN_M = 1.1;
/** An edge shorter than this holds nothing worth walking to. */
export const L1_MIN_EDGE_M = 3.0;
/** Rings the auto-fit is allowed to add before it admits the floor is full. */
export const L1_MAX_RINGS = 3;

export const L1_PLINTH_HEIGHT_M = 0.3;
export const L1_PLINTH_RADIUS_M = 0.45;
export const L1_MANNEQUIN_YAW_DEG_PER_SEC = 14;
/**
 * Label height above the plinth top.
 *
 * The exhibit's name used to be the AvatarShape's own nametag, which the
 * Explorer renders as `name` plus the last four characters of the avatar id —
 * so `l1-halloween_2019:jester` came out as "Jesterster", and `...:funny_skull`
 * as "Funny Skullkull". There is no flag to suppress that suffix; the only way
 * to own the text is to leave the nametag empty and draw the label ourselves,
 * which is what `flight-avatar.ts` already does for the same reason.
 *
 * Set just above a standing figure's head so it reads like the tag it replaces.
 */
export const L1_PLAQUE_HEIGHT_M = 2.16;

export interface L1KeepOut {
  x: number;
  z: number;
  radius: number;
}

export interface L1RingSlot {
  /** Building-local metres. */
  centerX: number;
  centerZ: number;
  /** Yaw (radians) that turns the mannequin's front toward the walkway. */
  rotationY: number;
  /** Unit vector from the plinth toward the viewer. The plaque sits this way. */
  facingX: number;
  facingZ: number;
  ring: number;
  edgeId: string;
}

function usableEdges(perimeter: PerimeterFootprint): PerimeterEdge[] {
  const open = perimeter.edges.filter((e) => !e.isEntryEdge && e.length >= L1_MIN_EDGE_M);
  // A single-edge plan (or one where every edge is the entry) still has to hold
  // something; fall back to every long-enough edge rather than returning none.
  return open.length ? open : perimeter.edges.filter((e) => e.length >= L1_MIN_EDGE_M);
}

/** Usable run of an edge on ring `r`, after corners and the inward step. */
function ringEdgeLength(edge: PerimeterEdge, ring: number): number {
  const shrink = 2 * (L1_CORNER_MARGIN_M + ring * L1_RING_GAP_M);
  return edge.length - shrink;
}

function blocked(x: number, z: number, keepOut: readonly L1KeepOut[]): boolean {
  for (const k of keepOut) {
    const dx = x - k.x;
    const dz = z - k.z;
    if (dx * dx + dz * dz < k.radius * k.radius) return true;
  }
  return false;
}

/**
 * Every position this floor could hold, densest first ring outward.
 *
 * WHY THIS FILTERS INSTEAD OF TRUSTING THE ARITHMETIC. Slots are laid out along
 * each edge independently and then stepped inward along that edge's normal. At
 * a convex corner the two adjacent edges' end slots converge as they step in —
 * on a 24 m square they landed 0.42 m apart, which in-world is two mannequins
 * inside each other. No per-edge margin fixes this for every plan shape (an
 * L-plan has interior corners that behave the opposite way), so the honest
 * guard is a distance check against what has already been accepted.
 */
function candidateSlots(opts: {
  perimeter: PerimeterFootprint;
  spacing: number;
  maxRings: number;
  keepOut: readonly L1KeepOut[];
}): L1RingSlot[][] {
  const edges = usableEdges(opts.perimeter);
  const minGap = opts.spacing * 0.85;
  const accepted: L1RingSlot[] = [];
  const rings: L1RingSlot[][] = [];

  for (let ring = 0; ring < opts.maxRings; ring++) {
    const inset = L1_WALL_INSET_M + ring * L1_RING_GAP_M;
    const here: L1RingSlot[] = [];
    for (const edge of edges) {
      const run = ringEdgeLength(edge, ring);
      if (run < 0) continue;
      const n = Math.floor(run / opts.spacing) + 1;
      const margin = (edge.length - run) / 2;
      const dx = (edge.end.x - edge.start.x) / edge.length;
      const dz = (edge.end.z - edge.start.z) / edge.length;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? margin + run / 2 : margin + (run * i) / (n - 1);
        const x = edge.start.x + dx * t - edge.outward.x * inset;
        const z = edge.start.z + dz * t - edge.outward.z * inset;
        if (blocked(x, z, opts.keepOut)) continue;
        let clash = false;
        for (const other of accepted) {
          if (Math.hypot(other.centerX - x, other.centerZ - z) < minGap) {
            clash = true;
            break;
          }
        }
        if (clash) continue;
        const facingX = -edge.outward.x;
        const facingZ = -edge.outward.z;
        const slot: L1RingSlot = {
          centerX: x,
          centerZ: z,
          // yaw 0 faces +Z; point the mannequin's front down the inward normal.
          rotationY: Math.atan2(facingX, facingZ),
          facingX,
          facingZ,
          ring,
          edgeId: edge.id,
        };
        accepted.push(slot);
        here.push(slot);
      }
    }
    if (here.length) rings.push(here);
  }
  return rings;
}

/**
 * How many exhibits this floor can hold.
 *
 * A property of the building's plan, so a narrow tower honestly reports a small
 * floor instead of silently stacking mannequins inside each other. Derived from
 * the real slot list, never from an arithmetic estimate the collision filter
 * would then contradict.
 */
export function l1FloorCapacity(
  perimeter: PerimeterFootprint,
  opts?: { spacingM?: number; maxRings?: number; keepOut?: readonly L1KeepOut[] }
): number {
  const rings = candidateSlots({
    perimeter,
    spacing: Math.max(L1_MIN_SPACING_M, opts?.spacingM ?? L1_MIN_SPACING_M),
    maxRings: Math.max(1, opts?.maxRings ?? L1_MAX_RINGS),
    keepOut: opts?.keepOut ?? [],
  });
  return rings.reduce((n, ring) => n + ring.length, 0);
}

/** Even sample of `take` entries from `ring`, keeping the spread around the wall. */
function spreadPick(ring: readonly L1RingSlot[], take: number): L1RingSlot[] {
  if (take >= ring.length) return [...ring];
  const out: L1RingSlot[] = [];
  for (let i = 0; i < take; i++) {
    out.push(ring[Math.round((i * (ring.length - 1)) / Math.max(1, take - 1))]!);
  }
  // Rounding can land on the same index twice on very small takes.
  const seen = new Set<L1RingSlot>();
  const unique = out.filter((s) => (seen.has(s) ? false : (seen.add(s), true)));
  if (unique.length === take) return unique;
  for (const slot of ring) {
    if (unique.length >= take) break;
    if (!seen.has(slot)) {
      seen.add(slot);
      unique.push(slot);
    }
  }
  return unique;
}

/**
 * Lay `count` plinths around the inside of a floor.
 *
 * Ring 0 hugs the walls and fills first; each further ring steps in by
 * L1_RING_GAP_M. A part-full floor spreads its exhibits around the whole ring
 * rather than crowding one wall, so twelve items in a forty-slot floor still
 * read as an arrangement.
 *
 * Plinths face the walkway (the inward normal), which is also where the plaque
 * goes — a plaque placed on a fixed world axis, as Retail Shop does, ends up
 * inside the wall on three sides of a ring.
 */
export function l1FloorRingSlots(opts: {
  perimeter: PerimeterFootprint;
  count: number;
  spacingM?: number;
  maxRings?: number;
  keepOut?: readonly L1KeepOut[];
}): L1RingSlot[] {
  const wanted = Math.max(0, Math.floor(opts.count));
  if (wanted === 0) return [];
  const rings = candidateSlots({
    perimeter: opts.perimeter,
    spacing: Math.max(L1_MIN_SPACING_M, opts.spacingM ?? L1_MIN_SPACING_M),
    maxRings: Math.max(1, opts.maxRings ?? L1_MAX_RINGS),
    keepOut: opts.keepOut ?? [],
  });

  const out: L1RingSlot[] = [];
  for (const ring of rings) {
    if (out.length >= wanted) break;
    const remaining = wanted - out.length;
    out.push(...spreadPick(ring, Math.min(remaining, ring.length)));
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Packing collections onto floors                                             */
/* -------------------------------------------------------------------------- */

export interface L1FloorCollectionShare {
  slug: string;
  title: string;
  /** 1-based part number when a big collection spans several floors. */
  part: number;
  parts: number;
  /** Mannequins from this collection on this floor. */
  count: number;
}

export interface L1PlacedExhibit extends L1MuseumSet {
  floorIndex: number;
  centerX: number;
  centerZ: number;
  rotationY: number;
  facingX: number;
  facingZ: number;
}

export interface L1MuseumFloorPlan {
  floorIndex: number;
  /** One entry per collection on this floor — two when a floor is shared. */
  collections: L1FloorCollectionShare[];
  /** Floor label for the directory sign. */
  label: string;
  exhibits: L1PlacedExhibit[];
}

export interface L1MuseumPlan {
  floors: L1MuseumFloorPlan[];
  /** Mannequins placed — one per outfit, NOT one per wearable. */
  placed: number;
  /** Wearables those mannequins are between them showing. */
  piecesPlaced: number;
  /** Wearables that did not fit in this building, by collection. */
  omitted: { slug: string; title: string; count: number }[];
  /** Exhibits per floor the plan settled on. */
  capacityPerFloor: number;
  /**
   * Collections a floor is allowed to name. 1-2 is the intended museum; a
   * higher number means the building is too short to give each collection its
   * own floor and the owner is looking at the constraint, not at a preference.
   */
  collectionsPerFloor: number;
  /** What the building's plan can physically hold per floor. */
  geometricCapacity: number;
  /** Floors the museum actually occupies. */
  floorsUsed: number;
}

interface PackedFloor {
  collections: L1FloorCollectionShare[];
  /** Mannequins, not wearables — one entry is one plinth. */
  sets: L1MuseumSet[];
}

/**
 * Assign collections to floors.
 *
 * ONE FLOOR IS ONE COLLECTION — that is the point of the building, and every
 * other rule here exists to protect it for as long as the building allows:
 *
 *   - A collection bigger than a floor takes consecutive WHOLE floors and shares
 *     with nothing. Halloween 2019 is 70 items; splitting it three ways and then
 *     wedging someone else into the remainder would read as a mistake.
 *   - A collection that would leave more than half a floor empty is paired with
 *     another small one. That is the "two sharing a floor 50/50" case.
 *   - Only when the building is too SHORT for even that does `maxPerFloor` rise
 *     above two. 42 collections cannot occupy a 12-storey block one-per-floor no
 *     matter how big each floor is, so the choice is three-up floors or leaving
 *     collections out of the museum entirely. Three-up wins; the caller is told
 *     the number so the owner can see the building is the constraint.
 */
function packCollections(
  collections: readonly L1MuseumCollection[],
  capacity: number,
  pairSmall: boolean,
  maxPerFloor: number
): PackedFloor[] {
  const cap = Math.max(1, Math.floor(capacity));
  const half = Math.max(1, Math.floor(cap / 2));
  const perFloor = Math.max(1, Math.floor(maxPerFloor));
  const solo: PackedFloor[] = [];
  const small: L1MuseumCollection[] = [];

  const share = (c: L1MuseumCollection, count: number, part = 1, parts = 1) => ({
    slug: c.slug,
    title: c.title,
    part,
    parts,
    count,
  });

  for (const collection of collections) {
    const n = collection.sets.length;
    if (n === 0) continue;
    if (n > cap) {
      // Split EVENLY, not greedily. Filling each floor to `cap` leaves the last
      // one with the remainder — 70 items at 22 a floor gives 22/22/22/4, and a
      // museum floor holding four exhibits reads as a mistake. Balancing gives
      // 18/18/17/17 and every floor of the collection looks deliberate.
      const parts = Math.ceil(n / cap);
      const per = Math.ceil(n / parts);
      for (let p = 0; p < parts; p++) {
        const sets = collection.sets.slice(p * per, (p + 1) * per);
        if (!sets.length) continue;
        solo.push({ collections: [share(collection, sets.length, p + 1, parts)], sets });
      }
      continue;
    }
    if (!pairSmall || perFloor < 2 || n > half) {
      solo.push({ collections: [share(collection, n)], sets: [...collection.sets] });
      continue;
    }
    small.push(collection);
  }

  // First-fit-decreasing over the leftovers, bounded by BOTH the plinth capacity
  // and how many collections a floor is allowed to name.
  const pool = [...small].sort((a, b) => b.sets.length - a.sets.length);
  const shared: PackedFloor[] = [];
  for (const collection of pool) {
    const n = collection.sets.length;
    const bin = shared.find(
      (floor) => floor.sets.length + n <= cap && floor.collections.length < perFloor
    );
    if (bin) {
      bin.collections.push(share(collection, n));
      bin.sets.push(...collection.sets);
    } else {
      shared.push({ collections: [share(collection, n)], sets: [...collection.sets] });
    }
  }

  return [...solo, ...shared];
}

/**
 * Smallest floor that actually fits this collection set in this building.
 *
 * The naive `ceil(totalItems / floors)` is wrong and was the first bug the tests
 * caught: floor count is driven by how many COLLECTIONS there are, not how many
 * items. 42 collections at one-or-two per floor need ~21 floors however roomy
 * each floor is, so a 12-storey building silently dropped a third of the museum.
 * Search instead — raise the exhibits-per-floor and, only when that stops
 * helping, the collections-per-floor, until the packing fits or the floor plan
 * runs out of room.
 */
function fitPacking(opts: {
  collections: readonly L1MuseumCollection[];
  available: number;
  geometricCapacity: number;
  pairSmall: boolean;
  requested: number | null;
}): { floors: PackedFloor[]; capacity: number; perFloor: number } {
  const geo = Math.max(1, opts.geometricCapacity);
  const totalSets = opts.collections.reduce((n, c) => n + c.sets.length, 0);
  const count = opts.collections.filter((c) => c.sets.length > 0).length;

  if (opts.requested && opts.requested > 0) {
    const capacity = Math.min(Math.floor(opts.requested), geo);
    const perFloor = Math.max(2, Math.ceil(count / Math.max(1, opts.available)));
    return {
      floors: packCollections(opts.collections, capacity, opts.pairSmall, perFloor),
      capacity,
      perFloor,
    };
  }

  const available = Math.max(1, opts.available);
  let capacity = Math.max(1, Math.min(geo, Math.ceil(totalSets / available)));
  let perFloor = Math.max(2, Math.ceil(count / available));
  let floors = packCollections(opts.collections, capacity, opts.pairSmall, perFloor);

  // Bounded: capacity only ever rises and stops at the plan's own limit.
  for (let guard = 0; floors.length > available && guard < 64; guard++) {
    if (capacity < geo) {
      capacity = Math.min(geo, Math.max(capacity + 1, Math.ceil(capacity * 1.25)));
    } else if (perFloor < count) {
      perFloor++;
    } else {
      break;
    }
    floors = packCollections(opts.collections, capacity, opts.pairSmall, perFloor);
  }
  return { floors, capacity, perFloor };
}

function floorLabel(shares: readonly L1FloorCollectionShare[]): string {
  return shares
    .map((s) => (s.parts > 1 ? `${s.title} (${s.part}/${s.parts})` : s.title))
    .join("  ·  ");
}

/**
 * The whole museum, as data.
 *
 * `capacityPerFloor: "auto"` is the case that makes this app droppable on any
 * building: it asks for however many exhibits per floor it takes to fit the
 * collection in the floors that exist, then clamps that to what the floor plan
 * can physically hold. A 31-floor tower ends up near 15 a floor; a 12-floor
 * block packs ~37 and needs the extra rings.
 */
export function planL1Museum(opts: {
  perimeter: PerimeterFootprint;
  /** Total floors in the building. */
  floors: number;
  /** First floor the museum uses. Ground is 0. */
  startFloor?: number;
  /** Empty = the whole L1 set. */
  includeCollections?: readonly string[];
  capacityPerFloor?: number | "auto";
  pairSmallCollections?: boolean;
  spacingM?: number;
  maxRings?: number;
  keepOut?: readonly L1KeepOut[];
  /** `image` plans one exhibit per item; `auto`/`mannequin` one per outfit. */
  display?: L1MuseumDisplay;
}): L1MuseumPlan {
  const start = Math.max(0, Math.floor(opts.startFloor ?? 0));
  const totalFloors = Math.max(1, Math.floor(opts.floors));
  const available = Math.max(0, totalFloors - start);

  const wanted = new Set((opts.includeCollections ?? []).filter(Boolean));
  const selected = wanted.size
    ? L1_MUSEUM_COLLECTIONS.filter((c) => wanted.has(c.slug))
    : L1_MUSEUM_COLLECTIONS;
  // One exhibit per item in image mode, per outfit on a mannequin. Everything
  // below this line is unit-agnostic, which is why the mode stops here.
  const collections = l1ExhibitCollections(selected, opts.display ?? "auto");

  const geometricCapacity = l1FloorCapacity(opts.perimeter, {
    spacingM: opts.spacingM,
    maxRings: opts.maxRings,
    keepOut: opts.keepOut,
  });

  const fit = fitPacking({
    collections,
    available,
    geometricCapacity,
    pairSmall: opts.pairSmallCollections !== false,
    requested:
      typeof opts.capacityPerFloor === "number" && opts.capacityPerFloor > 0
        ? opts.capacityPerFloor
        : null,
  });
  const capacity = fit.capacity;
  const used = fit.floors.slice(0, available);
  const dropped = fit.floors.slice(available);

  const floors: L1MuseumFloorPlan[] = used.map((floor, i) => {
    const floorIndex = start + i;
    const slots = l1FloorRingSlots({
      perimeter: opts.perimeter,
      count: floor.sets.length,
      spacingM: opts.spacingM,
      maxRings: opts.maxRings,
      keepOut: opts.keepOut,
    });
    const exhibits: L1PlacedExhibit[] = [];
    for (let s = 0; s < Math.min(slots.length, floor.sets.length); s++) {
      const slot = slots[s]!;
      exhibits.push({
        ...floor.sets[s]!,
        floorIndex,
        centerX: slot.centerX,
        centerZ: slot.centerZ,
        rotationY: slot.rotationY,
        facingX: slot.facingX,
        facingZ: slot.facingZ,
      });
    }
    return {
      floorIndex,
      collections: floor.collections,
      label: floorLabel(floor.collections),
      exhibits,
    };
  });

  // Anything the building could not take, reported per collection rather than as
  // a single number — "12 items did not fit" is not something an owner can act
  // on, "Halloween 2019 lost its last 22" is.
  const omittedBySlug = new Map<string, { slug: string; title: string; count: number }>();
  const note = (set: L1MuseumSet) => {
    const prior = omittedBySlug.get(set.collectionSlug);
    // Counted in WEARABLES, not mannequins: "Halloween 2019 lost 22" has to mean
    // 22 items an owner can find in the catalog, and a dropped set takes all its
    // pieces with it.
    if (prior) prior.count += set.pieces.length;
    else
      omittedBySlug.set(set.collectionSlug, {
        slug: set.collectionSlug,
        title: set.collectionTitle,
        count: set.pieces.length,
      });
  };
  for (const floor of dropped) for (const set of floor.sets) note(set);
  for (let i = 0; i < used.length; i++) {
    const short = used[i]!.sets.slice(floors[i]!.exhibits.length);
    for (const set of short) note(set);
  }

  const placed = floors.reduce((n, f) => n + f.exhibits.length, 0);
  const piecesPlaced = floors.reduce(
    (n, f) => n + f.exhibits.reduce((m, e) => m + e.pieces.length, 0),
    0
  );
  return {
    floors,
    placed,
    piecesPlaced,
    omitted: [...omittedBySlug.values()].sort((a, b) => b.count - a.count),
    capacityPerFloor: capacity,
    collectionsPerFloor: fit.perFloor,
    geometricCapacity,
    floorsUsed: floors.length,
  };
}

/** Walk-surface Y of a museum floor, building-local. */
export function l1FloorWalkY(floorIndex: number, storyHeight: number): number {
  return walkSurfaceY(Math.max(0, floorIndex) * Math.max(0.5, storyHeight));
}

/* -------------------------------------------------------------------------- */
/* Config                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Everything the scene runtime needs about a building that is NOT the active
 * one, baked at publish.
 *
 * The runtime receives other buildings as placed GLBs and a config for the
 * active building only — their floor count and footprint are not knowable in
 * the scene. Without this bake, a museum pointed at building 3 would be planned
 * against building 1's plan and drawn at building 3's origin: exhibits in the
 * wall, or floating past the roof, with nothing in any log to say so. See
 * `interiorLamps` in scene-runtime-config.ts, which is baked for the same
 * reason.
 */
export interface L1MuseumFrame {
  buildingId: string;
  origin: { x: number; y: number; z: number };
  rotationDeg: number;
  floors: number;
  storyHeight: number;
  footprintM: { width: number; depth: number };
}

export interface L1MuseumConfig {
  version: typeof L1_MUSEUM_VERSION;
  enabled: boolean;
  title: string;
  /** Null = the primary building. Same rule as Gallery and Retail Shop. */
  buildingId: string | null;
  /** Baked at publish when `buildingId` is not the active building. */
  frame?: L1MuseumFrame;
  /** First floor the museum occupies. Ground is 0. */
  startFloor: number;
  /** 0 = auto-fit to the building's floor count and plan. */
  capacityPerFloor: number;
  /** Let two small collections share a floor. */
  pairSmallCollections: boolean;
  /** Empty = the whole L1 set. */
  includeCollections: string[];
  /**
   * Floors either side of the player that are built. Static GLBs are lightweight
   * but still carry real textures and geometry, so this remains a memory cap.
   */
  streamRadiusFloors: number;
  /** Show a floor sign naming the collection. */
  floorSigns: boolean;
  /** Hex tint for the cheap opaque dummy body. */
  ghostColor: string;
  /**
   * How an exhibit is drawn. `auto` (default) is a static wearable GLB over an
   * opaque dummy body, with no AvatarShape or skeleton. See L1MuseumDisplay.
   */
  display: L1MuseumDisplay;
  /** Publish-only exhibit id → deployed GLB path. Never authored by the owner. */
  assetFiles?: Record<string, string>;
  /** Full-figure standing bakes. Runtime skips the dummy for these ids. */
  mannequinFiles?: Record<string, string>;
}

export const L1_MUSEUM_MAX_STREAM_RADIUS = 2;
export const L1_MUSEUM_DEFAULT_GHOST_COLOR = "#3dc7ff";

export function defaultL1MuseumConfig(): L1MuseumConfig {
  return {
    version: L1_MUSEUM_VERSION,
    enabled: false,
    title: "L1 Tower",
    buildingId: null,
    startFloor: 0,
    capacityPerFloor: 0,
    pairSmallCollections: true,
    includeCollections: [],
    streamRadiusFloors: 0,
    floorSigns: true,
    ghostColor: L1_MUSEUM_DEFAULT_GHOST_COLOR,
    display: "auto",
  };
}

export function normalizeL1MuseumConfig(
  partial: Partial<L1MuseumConfig> | null | undefined
): L1MuseumConfig {
  const b = defaultL1MuseumConfig();
  if (!isRecord(partial)) return b;
  const known = new Set(L1_MUSEUM_COLLECTIONS.map((c) => c.slug));
  const include = Array.isArray(partial.includeCollections)
    ? [...new Set(partial.includeCollections.filter((s) => typeof s === "string" && known.has(s)))]
    : b.includeCollections;
  const frame = normalizeFrame(partial.frame);
  const assetFiles = normalizeAssetFiles(partial.assetFiles);
  const mannequinFiles = normalizeMannequinFiles(partial.mannequinFiles);
  return {
    ...(frame ? { frame } : {}),
    ...(assetFiles ? { assetFiles } : {}),
    ...(mannequinFiles ? { mannequinFiles } : {}),
    version: L1_MUSEUM_VERSION,
    enabled: partial.enabled === true,
    title: text(partial.title, b.title, 80) || b.title,
    buildingId: text(partial.buildingId, "", 64) || null,
    startFloor: Math.max(0, Math.round(finite(partial.startFloor, b.startFloor))),
    capacityPerFloor: Math.max(0, Math.round(finite(partial.capacityPerFloor, b.capacityPerFloor))),
    pairSmallCollections: partial.pairSmallCollections !== false,
    includeCollections: include,
    streamRadiusFloors: Math.min(
      L1_MUSEUM_MAX_STREAM_RADIUS,
      Math.max(0, Math.round(finite(partial.streamRadiusFloors, b.streamRadiusFloors)))
    ),
    floorSigns: partial.floorSigns !== false,
    ghostColor: hexColor(partial.ghostColor, b.ghostColor),
    // Saved `image` was hanging cards. `mannequin` and `auto` are the same
    // wearable-only ghost now — keep the token so old rows retain their layout.
    display: partial.display === "mannequin" ? "mannequin" : "auto",
  };
}

/**
 * Reserved asset ids for the tinted, skeleton-stripped REAL base-avatar bodies every
 * exhibit stands on. Baked by `npm run build:l1-static-wearables -- --ghost-only`.
 */
export const L1_GHOST_BODY_REGIONS = ["head", "hands", "ubody", "lbody", "feet"] as const;
export type L1GhostBodyRegion = (typeof L1_GHOST_BODY_REGIONS)[number];

export const L1_GHOST_BODY_ASSET_IDS = [
  "ghost-body-male",
  "ghost-body-female",
  ...L1_GHOST_BODY_REGIONS.flatMap((region) => [
    `ghost-body-male-${region}`,
    `ghost-body-female-${region}`,
  ]),
] as const;

/** Exhibit ids whose static GLBs must be present in this publish. */
export function l1MuseumAssetIds(config: Pick<L1MuseumConfig, "includeCollections">): string[] {
  const wanted = new Set(config.includeCollections);
  const collections = wanted.size
    ? L1_MUSEUM_COLLECTIONS.filter((collection) => wanted.has(collection.slug))
    : L1_MUSEUM_COLLECTIONS;
  return [
    ...collections.flatMap((collection) => collection.sets.map((set) => set.id)),
    // The shared context bodies ship with every museum, whatever the collection filter.
    ...L1_GHOST_BODY_ASSET_IDS,
  ];
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export interface L1MuseumValidationIssue {
  level: "warn" | "error";
  code: string;
  message: string;
}

export function validateL1MuseumConfig(
  config: L1MuseumConfig,
  opts?: { floors?: number; buildingIds?: readonly string[]; plan?: L1MuseumPlan }
): L1MuseumValidationIssue[] {
  const issues: L1MuseumValidationIssue[] = [];
  if (!config.enabled) return issues;

  if (opts?.buildingIds && config.buildingId && !opts.buildingIds.includes(config.buildingId)) {
    issues.push({
      level: "error",
      code: "l1.building_missing",
      message: "The L1 Museum points at a building that is no longer in this scene",
    });
  }

  const floors = typeof opts?.floors === "number" ? opts.floors : null;
  if (floors !== null && config.startFloor >= floors) {
    issues.push({
      level: "error",
      code: "l1.start_above_top",
      message: `The museum starts on floor ${config.startFloor}, above the top floor (${floors - 1})`,
    });
  }

  const plan = opts?.plan;
  if (plan) {
    if (plan.placed === 0) {
      issues.push({
        level: "error",
        code: "l1.nothing_placed",
        message: "No exhibit fits — the building's floor plan has no wall long enough to stand on",
      });
    }
    if (plan.omitted.length) {
      const lost = plan.omitted.reduce((n, o) => n + o.count, 0);
      const worst = plan.omitted
        .slice(0, 3)
        .map((o) => `${o.title} (${o.count})`)
        .join(", ");
      issues.push({
        level: "warn",
        code: "l1.items_omitted",
        message: `${lost} L1 wearable${lost === 1 ? "" : "s"} did not fit — ${worst}. Add floors, or raise exhibits per floor.`,
      });
    }
    if (plan.capacityPerFloor >= plan.geometricCapacity && plan.omitted.length) {
      issues.push({
        level: "warn",
        code: "l1.floor_full",
        message: `Each floor is already holding all ${plan.geometricCapacity} plinths its plan allows — only more floors or a wider building will take the rest`,
      });
    }
  }

  if (config.streamRadiusFloors >= 2) {
    issues.push({
      level: "warn",
      code: "l1.stream_radius_high",
      message:
        "Building 5 floors of static exhibits at once raises many GLBs — drop to 1 if the tower stutters",
    });
  }

  return issues;
}

/* -------------------------------------------------------------------------- */

function hexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}

function normalizeAssetFiles(raw: unknown): Record<string, string> | undefined {
  if (!isRecord(raw)) return undefined;
  // Exhibits AND the shared ghost bodies. Forgetting the ghosts here is exactly
  // the silent-drop bug class: publish shipped the GLBs and the mapping, and the
  // runtime's own normalize erased the two non-exhibit ids on load — so every
  // figure fell back to the primitive doll while the real bodies sat unused in
  // the deploy (owner, 2026-08-26).
  const known = new Set<string>([
    ...L1_MUSEUM_COLLECTIONS.flatMap((collection) => collection.sets.map((set) => set.id)),
    ...L1_GHOST_BODY_ASSET_IDS,
  ]);
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!known.has(id) || typeof value !== "string") continue;
    const file = value.trim().replace(/\\/g, "/");
    if (!/^models\/l1\/[a-z0-9._-]+\.glb$/i.test(file)) continue;
    out[id] = file;
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeMannequinFiles(raw: unknown): Record<string, string> | undefined {
  if (!isRecord(raw)) return undefined;
  const known = new Set(
    L1_MUSEUM_COLLECTIONS.flatMap((collection) => collection.sets.map((set) => set.id))
  );
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!known.has(id) || typeof value !== "string") continue;
    const file = value.trim().replace(/\\/g, "/");
    if (!/^models\/l1\/[a-z0-9._-]+\.glb$/i.test(file)) continue;
    out[id] = file;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * A frame is all-or-nothing: a half-read one would place the museum somewhere
 * plausible and wrong, which is worse than falling back to the active building.
 */
function normalizeFrame(raw: unknown): L1MuseumFrame | undefined {
  if (!isRecord(raw)) return undefined;
  const buildingId = text(raw.buildingId, "", 64);
  const origin = isRecord(raw.origin) ? raw.origin : null;
  const footprint = isRecord(raw.footprintM) ? raw.footprintM : null;
  if (!buildingId || !origin || !footprint) return undefined;
  const width = finite(footprint.width, 0);
  const depth = finite(footprint.depth, 0);
  const floors = Math.round(finite(raw.floors, 0));
  if (width <= 0 || depth <= 0 || floors <= 0) return undefined;
  return {
    buildingId,
    origin: {
      x: finite(origin.x, 0),
      y: finite(origin.y, 0),
      z: finite(origin.z, 0),
    },
    rotationDeg: finite(raw.rotationDeg, 0),
    floors,
    storyHeight: Math.max(0.5, finite(raw.storyHeight, 3.2)),
    footprintM: { width, depth },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function finite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function text(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, max);
}
