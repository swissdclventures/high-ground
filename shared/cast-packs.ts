/**
 * Cast Packs — precompiled crowds of DISTINCT characters.
 *
 * THE PROBLEM THIS SOLVES. There were only two ways to dress a crew: pull the
 * owner's DCL Backpack (three saved slots → three clones of the owner) or fall
 * back to [[dress-code]], whose looks are four base-avatar variations that read
 * as "default Decentraland". A district dressed either way looks cloned.
 *
 * A pack is a CAST — 8 to 12 authored characters with their own silhouette,
 * palette and props — picked with one token per zone. Ten packs, 104 characters.
 *
 * WHY THIS IS FREE. An NPC AvatarShape renders any item URN with no ownership
 * check (see app/src/scene-spec/wearable-url.ts), and the Explorer downloads the
 * GLB itself. So a pack costs ~40 bytes per wearable of scene payload and zero
 * hosted assets — the same trick the L1 Museum runs on 438 items.
 *
 * TWO SOURCES. Base (off-chain) wearables every Explorer already ships, and
 * collections-v1 (Ethereum, closed since 2021, so these slugs cannot rot).
 * Every slug is verified against the generated catalogs by
 * tests/shared/cast-packs.test.ts — a typo renders as bare skin with no error,
 * so nothing here is trusted, it is checked.
 *
 * AUTHORED, NOT MIXED. Costume pieces do not survive random recombination (a
 * witch hat over a hazmat suit is not a character), so looks are hand-composed.
 * Variety across a crowd comes from `castLooksFor()`: it picks WHICH looks a
 * group wears from a seed, and rotates skin tone and hair colour so even a
 * repeat is not a twin. Reshuffling a crowd is therefore one number in the
 * scene file, not 80 URNs.
 *
 * The runtime never reads a pack. Applying one writes concrete `outfits` onto a
 * crew or group, exactly as `dressCode` does — same publish path, no runtime risk.
 */

import type { DanceOutfit } from "./dance-venue-contract";
import { l1WearableUrn } from "./l1-museum-contract";

const BASE = "urn:decentraland:off-chain:base-avatars:";

export const CAST_MALE = `${BASE}BaseMale`;
export const CAST_FEMALE = `${BASE}BaseFemale`;

/** Base (off-chain) wearable URN from its slug. */
const b = (slug: string) => `${BASE}${slug}`;
/** collections-v1 wearable URN from collection + item slug. */
const l1 = (collection: string, slug: string) => l1WearableUrn(collection, slug);

export interface CastRgb {
  r: number;
  g: number;
  b: number;
}

/** One authored character. */
export interface CastLook {
  /** Stable id, `<pack>-<nn>` — survives a reshuffle so a lock keeps meaning. */
  id: string;
  /** Human label for the picker ("Bouncer", "Night Nurse"). */
  label: string;
  body: "male" | "female";
  /** Complete item list: hair/top/bottom/shoes plus whatever the look needs. */
  wearables: string[];
  /** Authored hair colour. Omitted when the look wears a helmet or costume hair. */
  hairColor?: CastRgb;
}

export const CAST_PACK_IDS = [
  "street",
  "club",
  "formal",
  "sport",
  "hiphop",
  "cyber",
  "retro",
  "fantasy",
  "horror",
  "work",
] as const;

export type CastPackId = (typeof CAST_PACK_IDS)[number];

export interface CastPack {
  id: CastPackId;
  label: string;
  summary: string;
  /** Where the clothing comes from — shown in the picker so the owner knows a
   *  pack is costume-flavoured before dressing a lobby in it. */
  source: "base" | "collections-v1" | "mixed";
  looks: CastLook[];
}

// Hair palettes reused across the realistic packs.
const BLACK: CastRgb = { r: 0.05, g: 0.045, b: 0.04 };
const DARK_BROWN: CastRgb = { r: 0.14, g: 0.09, b: 0.06 };
const BROWN: CastRgb = { r: 0.3, g: 0.18, b: 0.09 };
const SANDY: CastRgb = { r: 0.55, g: 0.42, b: 0.2 };
const BLONDE: CastRgb = { r: 0.75, g: 0.62, b: 0.32 };
const AUBURN: CastRgb = { r: 0.42, g: 0.15, b: 0.08 };
const GREY: CastRgb = { r: 0.62, g: 0.62, b: 0.64 };
const PINK: CastRgb = { r: 0.85, g: 0.25, b: 0.5 };
const TEAL: CastRgb = { r: 0.15, g: 0.6, b: 0.62 };
const VIOLET: CastRgb = { r: 0.45, g: 0.2, b: 0.7 };

/**
 * Skin tones rotated across a crowd. A cast of one skin tone still reads as
 * clones however varied the clothing is, and DCL's base bodies take a skin
 * colour directly, so this is the cheapest de-cloning lever there is.
 */
export const CAST_SKIN_TONES: readonly CastRgb[] = [
  { r: 0.95, g: 0.81, b: 0.71 },
  { r: 0.88, g: 0.71, b: 0.58 },
  { r: 0.76, g: 0.57, b: 0.43 },
  { r: 0.6, g: 0.42, b: 0.31 },
  { r: 0.45, g: 0.3, b: 0.22 },
  { r: 0.32, g: 0.2, b: 0.14 },
];

const look = (
  id: string,
  label: string,
  body: "male" | "female",
  wearables: string[],
  hairColor?: CastRgb
): CastLook => ({ id, label, body, wearables, hairColor });

// ---------------------------------------------------------------------------
// 1. Street Crew — ordinary people, base wearables only.
// ---------------------------------------------------------------------------

const STREET: CastPack = {
  id: "street",
  label: "Street Crew",
  summary: "Everyday people — hoodies, jeans, sneakers. The safe default crowd.",
  source: "base",
  looks: [
    look("street-01", "Hoodie Kid", "male", [b("casual_hair_01"), b("green_hoodie"), b("trash_jean"), b("sneakers")], DARK_BROWN),
    look("street-02", "Denim Girl", "female", [b("pony_tail"), b("f_red_simple_tshirt"), b("f_jeans"), b("citycomfortableshoes")], AUBURN),
    look("street-03", "Skater", "male", [b("moptop"), b("skatertriangleslongsleeve"), b("cargo_shorts"), b("crocsocks")], SANDY),
    look("street-04", "Corduroy", "male", [b("hair_coolshortstyle"), b("colored_sweater"), b("corduroygreenpants"), b("classic_shoes")], BLACK),
    look("street-05", "Puffer", "female", [b("shoulder_bob_hair"), b("puffer_jacket"), b("f_short_blue_jeans"), b("sneakers")], BLONDE),
    look("street-06", "Dungarees", "female", [b("double_bun"), b("denimdungareesblue"), b("f_capris"), b("Espadrilles")], BROWN),
    look("street-07", "Polo", "male", [b("short_hair"), b("polobluetshirt"), b("oxford_pants"), b("moccasin"), b("goatee_beard")], DARK_BROWN),
    look("street-08", "Afro Tee", "female", [b("semi_afro"), b("f_simple_yellow_tshirt"), b("f_stripe_white_pants"), b("sport_colored_shoes")], BLACK),
    look("street-09", "Turtleneck", "male", [b("keanu_hair"), b("turtle_neck_sweater"), b("distressed_black_Jeans"), b("citycomfortableshoes")], BLACK),
    look("street-10", "Old Timer", "male", [b("hair_oldie"), b("safari_shirt"), b("brown_pants_02"), b("comfy_sport_sandals"), b("granpa_beard")], GREY),
    look("street-11", "Skirt & Sweater", "female", [b("curly_hair"), b("f_sweater"), b("f_brown_skirt"), b("ruby_red_loafer")], AUBURN),
    look("street-12", "Cargo", "male", [b("semi_bold"), b("baggy_pullover"), b("comfortablepants"), b("m_mountainshoes.glb")], BROWN),
  ],
};

// ---------------------------------------------------------------------------
// 2. Night Floor — club crowd. Base tailoring + a little Decentral Games gloss.
// ---------------------------------------------------------------------------

const CLUB: CastPack = {
  id: "club",
  label: "Night Floor",
  summary: "Club crowd — jackets, dark tailoring, shades. For dance floors and bars.",
  source: "mixed",
  looks: [
    look("club-01", "Bouncer", "male", [b("semi_bold"), b("black_jacket"), b("distressed_black_Jeans"), b("sport_black_shoes"), b("black_sun_glasses"), b("full_beard")], BLACK),
    look("club-02", "Red Coat", "female", [b("hair_stylish_hair"), b("f_red_elegant_jacket"), b("f_stripe_long_skirt"), b("ruby_red_loafer")], BLACK),
    look("club-03", "Money Shades", "male", [b("slicked_hair"), l1("dg_fall_2020", "dg_suit_top_upper_body"), l1("dg_fall_2020", "dg_suit_bottom_lower_body"), l1("dg_fall_2020", "dg_dress_shoes_feet"), l1("dg_fall_2020", "dg_money_shades_eyewear")], BLACK),
    look("club-04", "Fur Coat", "female", [b("two_tails"), l1("dg_summer_2020", "dg_mink_fur_coat_upper_body"), b("f_diamond_leggings"), l1("dg_summer_2020", "dg_slides_feet")], PINK),
    look("club-05", "Black Top", "female", [b("shoulder_hair"), b("black_top"), b("f_red_modern_pants"), b("bun_shoes"), b("pearls_earring")], AUBURN),
    look("club-06", "Matrix", "male", [b("cool_hair"), b("Red_topcoat"), b("elegant_blue_trousers"), b("classic_shoes"), b("matrix_sunglasses")], BLACK),
    look("club-07", "Neon Jacket", "male", [b("hair_punk"), l1("community_contest", "cw_neon_jacket_upper_body"), b("hip_hop_joggers"), b("sport_blue_shoes")], TEAL),
    look("club-08", "Glitter", "female", [l1("sugarclub_yumi", "yumi_neon_hair"), l1("sugarclub_yumi", "yumi_glitter_jacket_upper_body"), l1("sugarclub_yumi", "yumi_glitter_leggings_lower_body"), l1("sugarclub_yumi", "yumi_neon_boots_feet")]),
    look("club-09", "Sleeveless", "male", [b("rasta"), b("sleeveless_punk_shirt"), b("grey_joggers"), b("sport_black_shoes"), b("triple_ring")], BLACK),
    look("club-10", "Striped Top", "female", [b("hair_bun"), b("striped_top"), b("f_short_colored_leggins"), b("sport_colored_shoes"), b("f_glasses_fashion")], VIOLET),
    look("club-11", "Croupier", "male", [b("curtained_hair"), b("croupier_shirt"), b("oxford_pants"), b("ruby_blue_loafer"), b("handlebar")], DARK_BROWN),
    look("club-12", "Raver", "female", [l1("community_contest", "cw_raver_upper_body"), l1("community_contest", "cw_raver_lower_body"), l1("community_contest", "cw_raver_feet"), l1("community_contest", "cw_raver_eyewear")]),
  ],
};

// ---------------------------------------------------------------------------
// 3. Gala — formal. Suits, gowns, top hats.
// ---------------------------------------------------------------------------

const FORMAL: CastPack = {
  id: "formal",
  label: "Gala",
  summary: "Black-tie — suits, gowns, top hats. Lobbies, galleries, openings.",
  source: "mixed",
  looks: [
    look("formal-01", "Tuxedo", "male", [b("slicked_hair"), l1("dg_fall_2020", "dg_suit_top_upper_body"), l1("dg_fall_2020", "dg_suit_bottom_lower_body"), l1("dg_fall_2020", "dg_dress_shoes_feet")], BLACK),
    look("formal-02", "Evening Gown", "female", [b("hair_stylish_hair"), b("brown_sleveless_dress"), b("f_stripe_long_skirt"), b("bun_shoes"), b("pearls_earring")], AUBURN),
    look("formal-03", "Top Hat", "male", [l1("halloween_2019", "classic_top_hat"), b("elegant_striped_shirt"), b("elegant_blue_trousers"), b("classic_shoes"), b("Mustache_Short_Beard")], GREY),
    look("formal-04", "White Shirt", "female", [b("shoulder_bob_hair"), b("f_white_shirt"), b("f_brown_trousers"), b("ruby_blue_loafer"), b("f_glasses_city")], BLACK),
    look("formal-05", "Elegant Sweater", "male", [b("hair_coolshortstyle"), b("elegant_sweater"), b("oxford_pants"), b("moccasin")], DARK_BROWN),
    look("formal-06", "Blue Elegance", "female", [b("pony_tail"), b("f_blue_elegant_shirt"), b("f_stripe_white_pants"), b("ruby_red_loafer"), b("golden_earring")], BLONDE),
    look("formal-07", "Bell Attendant", "male", [l1("community_contest", "cw_bell_attendant_hat"), l1("community_contest", "cw_bell_attendant_upper_body"), l1("community_contest", "cw_bell_attendant_lower_body"), b("classic_shoes")], BLACK),
    look("formal-08", "Monocle", "male", [b("hair_f_oldie"), b("Red_topcoat"), b("elegant_blue_trousers"), b("ruby_red_loafer"), l1("community_contest", "cw_monocle_eyewear"), b("granpa_beard")], GREY),
    look("formal-09", "Blue Jacket", "female", [b("curly_hair"), b("f_blue_jacket"), b("f_brown_skirt"), b("classic_shoes"), b("diamond_colored_tiara")], BROWN),
    look("formal-10", "Dreamverse", "male", [l1("pm_dreamverse_eminence", "pm_dreamverse_eminence_hat_visor"), l1("pm_dreamverse_eminence", "pm_dreamverse_eminence_jacket"), l1("pm_dreamverse_eminence", "pm_dreamverse_eminence_pants"), l1("pm_dreamverse_eminence", "pm_dreamverse_eminence_boots")]),
  ],
};

// ---------------------------------------------------------------------------
// 4. Athletic — sport and gym.
// ---------------------------------------------------------------------------

const SPORT: CastPack = {
  id: "sport",
  label: "Athletic",
  summary: "Tracksuits, kit and trainers — courts, gyms, roof decks.",
  source: "mixed",
  looks: [
    look("sport-01", "Soccer", "male", [b("short_hair"), b("soccer_shirt"), b("soccer_pants"), b("m_feet_soccershoes")], SANDY),
    look("sport-02", "Yoga", "female", [b("hair_bun"), b("f_sport_purple_tshirt"), b("f_yoga_trousers"), b("sport_colored_shoes")], BLACK),
    look("sport-03", "Tracksuit", "male", [b("cornrows"), l1("dg_summer_2020", "dg_tracksuit_top_upper_body"), l1("dg_summer_2020", "dg_tracksuit_bottom_lower_body"), l1("dg_summer_2020", "dg_deezys_feet")], BLACK),
    look("sport-04", "Runner", "female", [b("pony_tail"), b("f_pink_simple_tshirt"), b("f_sport_shorts"), b("sport_blue_shoes")], BLONDE),
    look("sport-05", "Baller", "male", [b("semi_afro"), b("sport_jacket"), b("basketball_shorts"), b("sport_black_shoes")], BLACK),
    look("sport-06", "Trendy Sport", "female", [b("two_tails"), l1("community_contest", "f_cw_trendy_jacket_upper_body"), l1("community_contest", "f_cw_trendy_pants_lower_body"), l1("community_contest", "f_cw_trendy_sport_shoes_feet")], TEAL),
    look("sport-07", "Trendy Sport", "male", [l1("community_contest", "cw_trendy_sport_hat"), l1("community_contest", "m_cw_trendy_jacket_upper_body"), l1("community_contest", "m_cw_trendy_pants_lower_body"), l1("community_contest", "m_cw_trendy_sport_shoes_feet")]),
    look("sport-08", "Leggings", "female", [b("shoulder_hair"), b("striped_top"), b("f_african_leggins"), b("sport_colored_shoes")], AUBURN),
    look("sport-09", "Rollers", "male", [b("moptop"), b("roller_outfit"), b("f_roller_leggings"), l1("community_contest", "cw_rollers_feet")], BROWN),
    look("sport-10", "Swim", "female", [b("hair_undere"), b("f_body_swimsuit"), b("striped_swim_suit"), b("m_greenflipflops")], BLACK),
  ],
};

// ---------------------------------------------------------------------------
// 5. Hip-Hop — the scrap-yard / block crowd.
// ---------------------------------------------------------------------------

const HIPHOP: CastPack = {
  id: "hiphop",
  label: "Hip-Hop",
  summary: "Joggers, fur, kicks and gold — block corners and scrap yards.",
  source: "mixed",
  looks: [
    look("hiphop-01", "Cornrows", "male", [b("cornrows"), b("green_hoodie"), b("hip_hop_joggers"), l1("dg_fall_2020", "dg_kicks_feet")], BLACK),
    look("hiphop-02", "Bandana", "female", [b("red_bandana"), b("f_red_simple_tshirt"), b("hip_hop_joggers"), b("sport_black_shoes")], BLACK),
    look("hiphop-03", "Thug Life", "male", [b("semi_bold"), b("poloblacktshirt"), b("trash_jean"), b("sport_black_shoes"), b("thug_life"), b("chin_beard")], BLACK),
    look("hiphop-04", "Mink", "female", [b("two_tails"), l1("dg_summer_2020", "dg_mink_fur_coat_upper_body"), b("f_short_colored_leggins"), l1("dg_summer_2020", "dg_slides_feet"), b("golden_earring")], AUBURN),
    look("hiphop-05", "Rasta", "male", [b("rasta"), b("baggy_pullover"), b("grey_joggers"), b("sneakers")], DARK_BROWN),
    look("hiphop-06", "Dungarees", "male", [b("hair_punk"), b("denimdungareesred"), b("cargo_shorts"), b("sport_colored_shoes"), b("punk_piercing")], AUBURN),
    look("hiphop-07", "Blue Bandana", "male", [b("blue_bandana"), b("skaterquadlongsleeve"), b("hip_hop_joggers"), b("crocsocks"), b("Thunder_earring")], BLACK),
    look("hiphop-08", "Afro", "female", [b("semi_afro"), b("f_pride_t_shirt"), b("f_short_blue_jeans"), l1("dg_fall_2020", "dg_kicks_feet"), b("pink_gem_earring")], BLACK),
    look("hiphop-09", "Tuxedo Tee", "male", [b("moptop"), l1("community_contest", "cw_tuxedo_tshirt_upper_body"), b("distressed_black_Jeans"), b("sport_blue_shoes"), b("dcl_watch")], DARK_BROWN),
    look("hiphop-10", "Skater Girl", "female", [b("shoulder_bob_hair"), b("skatercoloredlongsleeve"), b("jean_shorts"), b("crocs")], PINK),
  ],
};

// ---------------------------------------------------------------------------
// 6. Cyber — neon, armour, visors. All collections-v1.
// ---------------------------------------------------------------------------

const CYBER: CastPack = {
  id: "cyber",
  label: "Cyber",
  summary: "Neon suits, visors and soldier armour — nightlife with an edge.",
  source: "collections-v1",
  looks: [
    look("cyber-01", "Cyber Soldier", "male", [l1("cybermike_cybersoldier_set", "cybersoldier_helmet"), l1("cybermike_cybersoldier_set", "cybersoldier_torso_upper_body"), l1("cybermike_cybersoldier_set", "cybersoldier_leggings_lower_body"), l1("cybermike_cybersoldier_set", "cybersoldier_boots_feet")]),
    look("cyber-02", "Gas Mask", "female", [l1("cybermike_cybersoldier_set", "cybersoldier_gas_mask"), l1("cybermike_cybersoldier_set", "cybersoldier_torso_upper_body"), l1("cybermike_cybersoldier_set", "cybersoldier_leggings_lower_body"), l1("cybermike_cybersoldier_set", "cybersoldier_boots_feet")]),
    look("cyber-03", "LED Suit", "male", [l1("xmas_2019", "m_led_suit_upper_body"), l1("xmas_2019", "m_led_suit_lower_body"), l1("xmas_2019", "xmas_cyberpunk_eyewear"), b("sport_black_shoes"), b("hair_punk")], TEAL),
    look("cyber-04", "LED Suit", "female", [l1("xmas_2019", "f_led_suit_upper_body"), l1("xmas_2019", "f_led_suit_lower_body"), l1("xmas_2019", "cyber_xmas_eyewear"), b("sport_blue_shoes"), b("hair_anime_01")], VIOLET),
    look("cyber-05", "Cyber Helm", "male", [l1("xmas_2019", "m_cyber_xmas_helmet"), l1("xmas_2019", "m_cyber_suit_upper_body"), l1("xmas_2019", "m_cyber_suit_lower_body"), b("sport_black_shoes")]),
    look("cyber-06", "Cyber Helm", "female", [l1("xmas_2019", "f_cyber_xmas_helmet"), l1("xmas_2019", "f_cyber_suit_upper_body"), l1("xmas_2019", "f_cyber_suit_lower_body"), b("sport_blue_shoes")]),
    look("cyber-07", "Cyberpunk Coat", "male", [l1("community_contest", "cw_cyberpunk_coat_upper_body"), b("distressed_black_Jeans"), b("sport_black_shoes"), l1("community_contest", "cw_cyborg_monocle_eyewearraver"), b("cool_hair")], BLACK),
    look("cyber-08", "Blocksmith", "male", [l1("dc_niftyblocksmith", "blocksmith_helmet"), l1("dc_niftyblocksmith", "blocksmith_upper_body"), l1("dc_niftyblocksmith", "blocksmith_lower_body"), l1("dc_niftyblocksmith", "blocksmith_feet")]),
    look("cyber-09", "Meta", "female", [l1("dc_meta", "meta_hair"), l1("dc_meta", "meta_upper_body"), l1("dc_meta", "meta_lower_body"), l1("dc_meta", "meta_feet")]),
    look("cyber-10", "Wonderbot", "male", [l1("wz_wonderbot", "wz_wonderbot_head"), l1("wz_wonderbot", "wz_wonderbot_torso"), l1("wz_wonderbot", "wz_wonderbot_legs"), l1("wz_wonderbot", "wz_wonderbot_feet")]),
  ],
};

// ---------------------------------------------------------------------------
// 7. Retro Arcade — pixels, cabinets, 8-bit knitwear.
// ---------------------------------------------------------------------------

const RETRO: CastPack = {
  id: "retro",
  label: "Retro Arcade",
  summary: "Pixel knits, cabinet caps and skate longsleeves — arcades and game rooms.",
  source: "mixed",
  looks: [
    look("retro-01", "Atari Red", "male", [l1("atari_launch", "atari_red_hat"), l1("atari_launch", "atari_red_upper_body"), b("trash_jean"), b("sneakers")], BROWN),
    look("retro-02", "Atari Blue", "female", [l1("atari_launch", "atari_blue_hat"), l1("atari_launch", "atari_blue_upper_body"), b("f_short_blue_jeans"), b("sport_colored_shoes")], BLONDE),
    look("retro-03", "8-Bit", "male", [b("moptop"), l1("xmas_2019", "8bit_sweater_upper_body"), b("corduroypurplepants"), b("classic_shoes"), b("retro_sunglasses")], SANDY),
    look("retro-04", "Pixel Knit", "female", [b("double_bun"), l1("xmas_2019", "pixel_sweater_upper_body"), b("f_capris"), b("crocs"), b("heart_glasses")], PINK),
    look("retro-05", "Arcade Visor", "male", [l1("community_contest", "cw_casinovisor_hat"), b("skaterquadlongsleeve"), b("cargo_shorts"), b("crocsocks")], DARK_BROWN),
    look("retro-06", "Green Garment", "female", [l1("community_contest", "cw_greengarment_hat"), l1("community_contest", "cw_greengarment_upper_body"), l1("community_contest", "cw_greengarment_lower_body"), b("bun_shoes")], AUBURN),
    look("retro-07", "Orange Garment", "male", [l1("community_contest", "cw_orangegarment_hat"), l1("community_contest", "cw_orangegarment_upper_body"), l1("community_contest", "cw_orangegarment_lower_body"), b("citycomfortableshoes")], BLACK),
    look("retro-08", "MANA Tee", "male", [l1("dcl_launch", "mana_hat"), l1("dcl_launch", "mana_tshirt_upper_body"), b("grey_joggers"), b("sneakers"), l1("dcl_launch", "mana_eyewear")], DARK_BROWN),
    look("retro-09", "Ice Cream", "female", [l1("community_contest", "cw_icecream_top_head"), b("f_simple_yellow_tshirt"), b("f_stripe_white_pants"), b("Espadrilles")], PINK),
    look("retro-10", "Razor Blade", "male", [l1("dcl_launch", "razor_blade_upper_body"), l1("dcl_launch", "razor_blade_lower_body"), l1("dcl_launch", "razor_blade_feet"), l1("dcl_launch", "razor_blade_eyewear"), b("hair_punk")], TEAL),
  ],
};

// ---------------------------------------------------------------------------
// 8. Fantasy — myth, opera, steampunk.
// ---------------------------------------------------------------------------

const FANTASY: CastPack = {
  id: "fantasy",
  label: "Fantasy",
  summary: "Barbarians, opera masks, steampunk and shamans — themed worlds.",
  source: "collections-v1",
  looks: [
    look("fantasy-01", "Barbarian", "male", [l1("dcl_launch", "m_barbarian_helmet_hat"), l1("dcl_launch", "m_barbarian_upper_body"), l1("dcl_launch", "m_barbarian_lower_body"), l1("dcl_launch", "m_barbarian_feet")]),
    look("fantasy-02", "Flying Robe", "female", [l1("china_flying", "china_flying_hair_female"), l1("china_flying", "china_flying_clothes_female"), l1("china_flying", "china_flying_skirt"), b("bun_shoes")]),
    look("fantasy-03", "Flying Robe", "male", [l1("china_flying", "china_flying_hair_male"), l1("china_flying", "china_flying_clothes_male"), l1("china_flying", "china_flying_pants"), b("moccasin")]),
    look("fantasy-04", "Peking Opera", "male", [l1("ml_pekingopera", "jing_hat"), l1("ml_pekingopera", "jing_upper_body"), l1("ml_pekingopera", "jing_lower_body"), l1("ml_pekingopera", "jing_feet")]),
    look("fantasy-05", "Opera Mask", "female", [l1("ml_pekingopera", "jing_xiangyu_mask"), l1("ml_pekingopera", "jing_upper_body"), l1("ml_pekingopera", "jing_lower_body"), l1("ml_pekingopera", "jing_feet")]),
    look("fantasy-06", "Steampunk", "male", [l1("wonderzone_steampunk", "steampunk_hat"), l1("wonderzone_steampunk", "steampunk_jacket"), l1("wonderzone_steampunk", "steampunk_trousers"), l1("wonderzone_steampunk", "steampunk_boots"), l1("wonderzone_steampunk", "steampunk_goggles")]),
    look("fantasy-07", "Tech Shaman", "female", [l1("tech_tribal_marc0matic", "techtribal_bird_mask"), l1("tech_tribal_marc0matic", "techtribal_shaman_garb"), l1("tech_tribal_marc0matic", "tech_tribal_trousers"), l1("tech_tribal_marc0matic", "techtribal_shoes")]),
    look("fantasy-08", "Solar Beast", "male", [l1("tech_tribal_marc0matic", "techtribal_beast_mask"), l1("tech_tribal_marc0matic", "techtribal_solar_garb"), l1("tech_tribal_marc0matic", "tech_tribal_trousers"), l1("tech_tribal_marc0matic", "techtribal_shoes")]),
    look("fantasy-09", "Lion Dance", "male", [l1("ml_liondance", "lion_dance_hat"), l1("ml_liondance", "lion_dance_upper_body"), l1("ml_liondance", "lion_dance_lower_body"), l1("ml_liondance", "lion_dance_feet")]),
    look("fantasy-10", "Alchemist", "female", [l1("digital_alchemy", "da_iridescent_hair"), l1("digital_alchemy", "da_coat_upper_body"), l1("digital_alchemy", "da_baggy_pants_lower_body"), l1("digital_alchemy", "da_rock_boots_feet"), l1("digital_alchemy", "da_dichroic_eyewear")]),
  ],
};

// ---------------------------------------------------------------------------
// 9. Horror — Halloween 2019/2020. Note the gendered sets: half of these ship a
// representation for ONE body shape only, which is why `body` is authored per
// look and the test enforces it.
// ---------------------------------------------------------------------------

const HORROR: CastPack = {
  id: "horror",
  label: "Horror",
  summary: "Vampires, zombies, witches and cultists — haunted nights.",
  source: "collections-v1",
  looks: [
    look("horror-01", "Vampire", "male", [l1("halloween_2019", "vampire_hair"), l1("halloween_2019", "vampire_upper_body"), l1("halloween_2019", "vampire_lower_body"), l1("halloween_2019", "vampire_feet")]),
    look("horror-02", "Witch", "female", [l1("halloween_2019", "witch_hat"), l1("halloween_2019", "witch_upper_body"), l1("halloween_2019", "witch_lower_body"), l1("halloween_2019", "witch_feet")]),
    look("horror-03", "Zombie", "male", [l1("halloween_2019", "zombie_suit_mask"), l1("halloween_2019", "zombie_suit_upper_body"), l1("halloween_2019", "zombie_suit_lower_body"), l1("halloween_2019", "zombie_suit_feet")]),
    look("horror-04", "Skeleton", "male", [l1("halloween_2019", "skeleton_suit_hat"), l1("halloween_2019", "skeleton_suit_upper_body"), l1("halloween_2019", "skeleton_suit_lower_body"), l1("halloween_2019", "skeleton_suit_feet")]),
    look("horror-05", "Night Nurse", "female", [l1("halloween_2019", "creepy_nurse_hat"), l1("halloween_2019", "creepy_nurse_upper_body"), l1("halloween_2019", "creepy_nurse_lower_body"), l1("halloween_2019", "creepy_nurse_feet")]),
    look("horror-06", "Jester", "female", [l1("halloween_2019", "jester_hair"), l1("halloween_2019", "jester_upper_body"), l1("halloween_2019", "jester_lower_body"), l1("halloween_2019", "jester_feet")]),
    look("horror-07", "Bride", "female", [l1("halloween_2019", "bride_of_frankie_hair"), l1("halloween_2019", "bride_of_frankie_upper_body"), l1("halloween_2019", "bride_of_frankie_lower_body"), l1("halloween_2019", "bride_of_frankie_feet")]),
    look("horror-08", "Undead Pirate", "male", [l1("halloween_2019", "undead_pirate_helmet"), l1("halloween_2019", "undead_pirate_upper_body"), l1("halloween_2019", "undead_pirate_lower_body"), l1("halloween_2019", "frankie_feet")]),
    look("horror-09", "Cult Servant", "male", [l1("halloween_2020", "hwn_2020_cult_servant_helmet"), l1("halloween_2020", "hwn_2020_cult_servant_upper_body"), l1("halloween_2020", "hwn_2020_cult_servant_lower_body"), l1("halloween_2020", "hwn_2020_cult_servant_feet")]),
    look("horror-10", "Cult Supreme", "female", [l1("halloween_2020", "hwn_2020_cult_supreme_helmet"), l1("halloween_2020", "hwn_2020_cult_supreme_upper_body"), l1("halloween_2020", "hwn_2020_cult_supreme_lower_body"), l1("halloween_2020", "hwn_2020_cult_supreme_feet")]),
  ],
};

// ---------------------------------------------------------------------------
// 10. Work Crew — hazmat, miners, aviators. The "this place has staff" pack.
// ---------------------------------------------------------------------------

const WORK: CastPack = {
  id: "work",
  label: "Work Crew",
  summary: "Hazmat, miners, aviators and hard hats — sites, labs, back-of-house.",
  source: "mixed",
  looks: [
    look("work-01", "Hazmat", "male", [l1("community_contest", "cw_hazmat_suit_upper_body"), b("grey_joggers"), l1("community_contest", "cw_hazmat_shoes_feet")]),
    look("work-02", "Moon Miner", "male", [l1("dappcraft_moonminer", "moonminer_helmet"), l1("dappcraft_moonminer", "moonminer_jacket_upper_body"), l1("dappcraft_moonminer", "moonminer_pants_lower_body"), l1("dappcraft_moonminer", "moonminer_boots_feet")]),
    look("work-03", "Meteor Chaser", "female", [l1("wonderzone_meteorchaser", "meteorite_protective_hardhat_hat"), l1("wonderzone_meteorchaser", "meteorchaser_vest_upper_body"), l1("wonderzone_meteorchaser", "meteorchaser_trousers_lower_body"), l1("wonderzone_meteorchaser", "meteorchaser_shoes_feet")]),
    look("work-04", "Dust Mask", "male", [l1("wonderzone_meteorchaser", "meteorite_dustmask_mask"), l1("wonderzone_meteorchaser", "meteorchaser_vest_upper_body"), b("safari_pants"), l1("wonderzone_meteorchaser", "meteorchaser_shoes_feet")]),
    look("work-05", "Aviator", "male", [l1("community_contest", "cw_aviator_helmet_hat"), l1("community_contest", "cw_aviator_coat_upper_body"), l1("community_contest", "cw_aviator_trousers_lower_body"), b("m_mountainshoes.glb"), l1("community_contest", "cw_aviator_googles_eyewear")]),
    look("work-06", "Astronaut", "female", [l1("community_contest", "f_cw_astronaut_helmet_helmet"), l1("community_contest", "f_cw_astronaut_suit_upper_body"), l1("community_contest", "f_cw_astronaut_pants_lower_body"), l1("community_contest", "f_cw_astronaut_shoes_feet")]),
    look("work-07", "Blue Garment", "male", [l1("community_contest", "cw_bluegarment_hat"), l1("community_contest", "cw_bluegarment_upper_body"), l1("community_contest", "cw_bluegarment_lower_body"), b("m_mountainshoes.glb")]),
    look("work-08", "Yellow Garment", "female", [l1("community_contest", "cw_yellowgarment_hat"), l1("community_contest", "cw_yellowgarment_upper_body"), l1("community_contest", "cw_yellowgarment_lower_body"), b("citycomfortableshoes")]),
    look("work-09", "Safari Guide", "male", [l1("community_contest", "cw_western_hat"), b("safari_shirt"), b("safari_pants"), b("m_mountainshoes.glb"), b("short_boxed_beard")], SANDY),
    look("work-10", "Acorn Cap", "female", [l1("community_contest", "cw_acornknitcap_hat"), b("puffer_jacket_hoodie"), b("f_country_pants"), b("m_mountainshoes.glb")], BROWN),
  ],
};

export const CAST_PACKS: readonly CastPack[] = [
  STREET,
  CLUB,
  FORMAL,
  SPORT,
  HIPHOP,
  CYBER,
  RETRO,
  FANTASY,
  HORROR,
  WORK,
];

const BY_ID = new Map<string, CastPack>(CAST_PACKS.map((p) => [p.id, p]));

/**
 * Tokens an owner or an agent might say. Deliberately overlaps the dress-code
 * vocabulary: a brief that already asks for `club` should land on the Night
 * Floor cast rather than four base avatars.
 */
const ALIASES: Record<string, CastPackId> = {
  street: "street",
  streetwear: "street",
  casual: "street",
  crew: "street",
  default: "street",
  urban: "street",
  club: "club",
  nightlife: "club",
  night: "club",
  dance: "club",
  formal: "formal",
  gala: "formal",
  smart: "formal",
  black_tie: "formal",
  "black-tie": "formal",
  sport: "sport",
  athletic: "sport",
  gym: "sport",
  hiphop: "hiphop",
  hip_hop: "hiphop",
  "hip-hop": "hiphop",
  bboy: "hiphop",
  "b-boy": "hiphop",
  cyber: "cyber",
  cyberpunk: "cyber",
  scifi: "cyber",
  "sci-fi": "cyber",
  neon: "cyber",
  retro: "retro",
  arcade: "retro",
  pixel: "retro",
  fantasy: "fantasy",
  myth: "fantasy",
  steampunk: "fantasy",
  horror: "horror",
  halloween: "horror",
  spooky: "horror",
  undead: "horror",
  work: "work",
  worker: "work",
  staff: "work",
  industrial: "work",
  crew_work: "work",
};

/** Resolve a spoken token to a pack id, or null when it is not one. */
export function resolveCastPackId(token: string): CastPackId | null {
  const key = token.trim().toLowerCase().replace(/\s+/g, "_");
  return ALIASES[key] ?? (BY_ID.has(key) ? (key as CastPackId) : null);
}

export function castPack(id: string): CastPack | null {
  const resolved = resolveCastPackId(id);
  return resolved ? BY_ID.get(resolved) ?? null : null;
}

/** Menu payload for the builder picker and for MCP/agent briefs. */
export function castPackCards(): {
  id: CastPackId;
  label: string;
  summary: string;
  source: CastPack["source"];
  characters: number;
}[] {
  return CAST_PACKS.map((p) => ({
    id: p.id,
    label: p.label,
    summary: p.summary,
    source: p.source,
    characters: p.looks.length,
  }));
}

// ---------------------------------------------------------------------------
// Seeded casting
// ---------------------------------------------------------------------------

/** Small deterministic hash → [0, 1). Same seed = same crowd on every machine. */
function rand01(seed: number, salt: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2545f491);
  x ^= x >>> 13;
  return ((x >>> 0) % 100000) / 100000;
}

/** Fisher-Yates driven by the seed — a stable permutation, not a sort hack. */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand01(seed, i) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Nudge a hair colour so a repeated look is not a literal twin. */
function tintHair(color: CastRgb, seed: number, salt: number): CastRgb {
  const d = (rand01(seed, salt) - 0.5) * 0.22;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return { r: clamp(color.r + d), g: clamp(color.g + d * 0.8), b: clamp(color.b + d * 0.6) };
}

/**
 * Cast `count` characters from a pack.
 *
 * Deterministic in (pack, count, seed) so the builder preview, the publish and
 * the agent all agree, and so a reshuffle stores ONE number instead of a wall of
 * URNs. When a group is bigger than the pack, looks repeat — but each repeat
 * lands on a different skin tone and a nudged hair colour, so a crowd of 40 out
 * of 12 characters still does not read as ranks of twins.
 */
export function castLooksFor(packId: string, count: number, seed = 0): DanceOutfit[] {
  const pack = castPack(packId);
  if (!pack || count <= 0) return [];
  const order = shuffled(pack.looks, seed);
  const out: DanceOutfit[] = [];
  for (let i = 0; i < Math.min(count, 64); i++) {
    const look = order[i % order.length];
    const cycle = Math.floor(i / order.length);
    const outfit: DanceOutfit = {
      bodyShape: look.body === "female" ? CAST_FEMALE : CAST_MALE,
      wearables: look.wearables.slice(),
      skinColor: CAST_SKIN_TONES[Math.floor(rand01(seed, i * 7 + 3) * CAST_SKIN_TONES.length)],
    };
    if (look.hairColor) {
      outfit.hairColor = cycle === 0 ? look.hairColor : tintHair(look.hairColor, seed, i);
    }
    out.push(outfit);
  }
  return out;
}

/**
 * The everyday packs, blended. A scene nobody has dressed on purpose should
 * still look like a CROWD rather than a uniform, and the built-in fallback used
 * to be four hardcoded outfits cycled across the whole cast — which is why ten
 * NPCs standing together read as two or three people repeated.
 *
 * The themed packs (fantasy, horror, cyber, formal) are deliberately left out:
 * they are a deliberate choice, not a sensible default for a generic crowd.
 */
export const CAST_DEFAULT_MIX: readonly string[] = [
  "street",
  "sport",
  "hiphop",
  "club",
  "work",
  "retro",
];

/**
 * The built-in crowd, drawn across the default mix so neighbours rarely share a
 * pack, let alone an outfit. Same shape as `castLooksFor`, so the runtime path
 * for "dressed by a pack" and "not dressed at all" is identical.
 */
export function castDefaultLooks(count: number, seed = 0): DanceOutfit[] {
  const pool: CastLook[] = [];
  for (const id of CAST_DEFAULT_MIX) {
    const pack = castPack(id);
    if (pack) pool.push(...pack.looks);
  }
  if (!pool.length || count <= 0) return [];
  const order = shuffled(pool, seed);
  const out: DanceOutfit[] = [];
  for (let i = 0; i < Math.min(count, 64); i++) {
    const look = order[i % order.length]!;
    const cycle = Math.floor(i / order.length);
    const outfit: DanceOutfit = {
      bodyShape: look.body === "female" ? CAST_FEMALE : CAST_MALE,
      wearables: look.wearables.slice(),
      skinColor: CAST_SKIN_TONES[Math.floor(rand01(seed, i * 7 + 3) * CAST_SKIN_TONES.length)],
    };
    if (look.hairColor) {
      outfit.hairColor = cycle === 0 ? look.hairColor : tintHair(look.hairColor, seed, i);
    }
    out.push(outfit);
  }
  return out;
}

/** Every character in a pack, unshuffled — for the picker's contact sheet. */
export function castPackLooks(packId: string): CastLook[] {
  return castPack(packId)?.looks.slice() ?? [];
}

export const CAST_PACK_COUNT = CAST_PACKS.length;
export const CAST_CHARACTER_COUNT = CAST_PACKS.reduce((n, p) => n + p.looks.length, 0);
