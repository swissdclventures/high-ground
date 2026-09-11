/**
 * Per-scene admin wearable inventory for NPC dressing.
 *
 * Live fetch from Catalyst (Ethereum L1 + Polygon) for the wallets on
 * `social.event.adminWallets`. The MCP does not own a global wardrobe —
 * each scene's admins have different backpacks. The scene stores only a
 * shortlist (`social.wardrobe`) so later picks do not publish 200 URNs.
 */

export const DCL_CATALYST_LAMBDAS = "https://peer.decentraland.org/lambdas";

export const WARDROBE_ITEM_CAP = 48;
export const WARDROBE_LOOK_CAP = 12;

export interface WardrobeItem {
  urn: string;
  name: string;
  category: string;
  description: string;
  rarity: string;
}

export interface WardrobeLook {
  id: string;
  label: string;
  urns: string[];
}

export interface WalletWardrobe {
  wallet: string;
  items: WardrobeItem[];
  looks: WardrobeLook[];
}

export function emptyWalletWardrobe(wallet = ""): WalletWardrobe {
  return { wallet: wallet.trim().toLowerCase(), items: [], looks: [] };
}

/** Item URN an NPC AvatarShape can wear (strip issued-token suffix). */
export function wearableItemUrn(urn: string): string {
  const parts = urn.trim().split(":");
  if (parts.length > 6 && (parts[3] === "collections-v2" || parts[3] === "collections-v1")) {
    return parts.slice(0, 6).join(":");
  }
  return urn.trim();
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseCatalystWearables(payload: unknown): WardrobeItem[] {
  const root = objectValue(payload);
  const elements = root && Array.isArray(root.elements) ? root.elements : [];
  const out: WardrobeItem[] = [];
  const seen = new Set<string>();
  for (const raw of elements) {
    const element = objectValue(raw);
    if (!element) continue;
    const urn = wearableItemUrn(stringValue(element.urn));
    if (!urn || seen.has(urn)) continue;
    const definition = objectValue(element.definition);
    const wearable = definition ? objectValue(definition.data) : null;
    const wearableData = wearable ? objectValue(wearable.wearable) : null;
    const name =
      stringValue(element.name)
      || (definition ? stringValue(definition.name) : "")
      || urn.split(":").pop()
      || "Wearable";
    const category =
      stringValue(element.category)
      || (wearableData ? stringValue(wearableData.category) : "")
      || "other";
    const description =
      (definition ? stringValue(definition.description) : "")
      || (wearableData ? stringValue(wearableData.description) : "");
    const rarity =
      stringValue(element.rarity)
      || (definition ? stringValue(definition.rarity) : "")
      || "unknown";
    seen.add(urn);
    out.push({ urn, name, category, description, rarity });
  }
  return out;
}

export function searchWardrobe(items: readonly WardrobeItem[], query: string): WardrobeItem[] {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  if (!tokens.length) return [...items];
  const scored = items.map((item) => {
    const hay = `${item.name} ${item.description} ${item.category} ${item.urn}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (hay.includes(token)) score += token === "leather" || token === "jacket" || token === "pants" ? 3 : 1;
    }
    if (item.category === "upper_body" && tokens.includes("jacket")) score += 2;
    if (item.category === "lower_body" && (tokens.includes("pants") || tokens.includes("trousers"))) score += 2;
    return { item, score };
  });
  return scored.filter((row) => row.score > 0).sort((a, b) => b.score - a.score).map((row) => row.item);
}

const LOUD = /clown|zombie|halloween|lion dance|glow|elephant|heart puffer|greatest showman|cult|ghostblaster|vampire|razor blade/i;
const STREET_PANTS = /straight|cargo|chino|jean/i;
const SIMPLE_PANTS = /tailored|straight|trouser|chino|cargo|simple|jean/i;
const FORMAL_PANTS = /tuxedo|garment of gratitude/i;

function haystack(item: WardrobeItem): string {
  return `${item.name} ${item.description} ${item.urn}`;
}

function isLoud(item: WardrobeItem): boolean {
  return LOUD.test(haystack(item));
}

export function recommendOutfit(
  items: readonly WardrobeItem[],
  brief = "leather jacket, simple pants",
): { items: WardrobeItem[]; reason: string } {
  const upper = items.filter((item) => item.category === "upper_body");
  const lower = items.filter((item) => item.category === "lower_body");
  const feet = items.filter((item) => item.category === "feet");
  const jacketHits = searchWardrobe(upper, /leather/.test(brief) ? "leather jacket" : "jacket");
  const jacket =
    jacketHits.find((item) => /leather/i.test(haystack(item)) && !isLoud(item))
    ?? jacketHits.find((item) => !isLoud(item))
    ?? jacketHits[0]
    ?? searchWardrobe(upper, "jacket").find((item) => !isLoud(item))
    ?? null;
  const pantsPool = searchWardrobe(lower, "pants trousers");
  const pants =
    pantsPool.find((item) => STREET_PANTS.test(haystack(item)) && !isLoud(item))
    ?? pantsPool.find((item) => SIMPLE_PANTS.test(haystack(item)) && !FORMAL_PANTS.test(haystack(item)) && !isLoud(item))
    ?? pantsPool.find((item) => !isLoud(item) && !FORMAL_PANTS.test(haystack(item)))
    ?? pantsPool.find((item) => !isLoud(item))
    ?? pantsPool[0]
    ?? null;
  const wantShoes = /boot|shoe|sneaker|feet/i.test(brief);
  const shoes = wantShoes
    ? searchWardrobe(feet, "boot sneaker").find((item) => /black|boot|sneaker/i.test(item.name) && !isLoud(item))
      ?? feet.find((item) => !isLoud(item))
      ?? null
    : null;
  const picks = [jacket, pants, shoes].filter((item): item is WardrobeItem => Boolean(item));
  const reason = picks.length
    ? `Picked ${picks.map((item) => item.name).join(" + ")} from the admin wallet.`
    : "No jacket/pants match in this inventory.";
  return { items: picks, reason };
}

export function normalizeWalletWardrobe(raw: unknown): WalletWardrobe {
  const src = objectValue(raw);
  const wallet = stringValue(src?.wallet).toLowerCase();
  const items = Array.isArray(src?.items)
    ? src.items
      .map((row) => {
        const item = objectValue(row);
        if (!item) return null;
        const urn = wearableItemUrn(stringValue(item.urn));
        if (!urn) return null;
        return {
          urn,
          name: stringValue(item.name) || urn.split(":").pop() || "Wearable",
          category: stringValue(item.category) || "other",
          description: stringValue(item.description),
          rarity: stringValue(item.rarity) || "unknown",
        } satisfies WardrobeItem;
      })
      .filter((item): item is WardrobeItem => item !== null)
      .slice(0, WARDROBE_ITEM_CAP)
    : [];
  const looks = Array.isArray(src?.looks)
    ? src.looks
      .map((row, index) => {
        const look = objectValue(row);
        if (!look) return null;
        const urns = Array.isArray(look.urns)
          ? look.urns.map((u) => wearableItemUrn(String(u))).filter(Boolean)
          : [];
        if (!urns.length) return null;
        const id = stringValue(look.id) || `look_${index + 1}`;
        return { id, label: stringValue(look.label) || id, urns } satisfies WardrobeLook;
      })
      .filter((look): look is WardrobeLook => look !== null)
      .slice(0, WARDROBE_LOOK_CAP)
    : [];
  return { wallet, items, looks };
}

export async function fetchWalletWearables(
  wallet: string,
  lambdasBase = DCL_CATALYST_LAMBDAS,
): Promise<WardrobeItem[]> {
  const addr = wallet.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(addr)) {
    throw new Error(`Need a 0x wallet, got "${wallet}".`);
  }
  const collected: WardrobeItem[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 4; page++) {
    const url =
      `${lambdasBase.replace(/\/$/, "")}/users/${encodeURIComponent(addr)}/wearables`
      + `?includeDefinitions=true&pageNum=${page}&pageSize=100`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Catalyst wearables failed (${response.status}) for ${addr}.`);
    }
    const batch = parseCatalystWearables(await response.json());
    for (const item of batch) {
      if (seen.has(item.urn)) continue;
      seen.add(item.urn);
      collected.push(item);
    }
    if (batch.length < 100) break;
  }
  return collected;
}
