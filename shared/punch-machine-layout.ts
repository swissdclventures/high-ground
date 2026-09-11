/**
 * ONE description of what a Punch Machine looks like, read by both renderers.
 *
 * The Builder viewport (Three.js, app/src/scene-engine) and the in-world scene
 * (DCL ECS, scene/src/plugins) cannot share rendering code — different engines,
 * different component systems. For a long time they each carried their own copy of
 * the geometry instead, and every change had to be made twice. It never was: the
 * editor drew a primitive island under an authored cabinet, kept a fence the scene
 * had dropped, and put the jump clouds somewhere else entirely. Chasing that parity
 * by hand is what this module exists to stop.
 *
 * The rule: neither renderer invents geometry. Both read the numbers here, and
 * anything visual that is not in an authored GLB is not drawn at all. Colliders
 * stay engine-side (the viewport has no physics), but their DIMENSIONS live here so
 * the editor can show the player exactly where they will be able to stand.
 *
 * Positions are authored metres in the machine's own frame, Y up.
 */

/** GLB paths as the scene bundle addresses them. */
export const PUNCH_MODELS = {
  plaza: "models/punch/cloud-plaza.glb",
  body: "models/punch/machine-body.glb",
  arm: "models/punch/machine-arm.glb",
  display: "models/punch/machine-display.glb",
  jumpLarge: "models/punch/jump-cloud-large.glb",
  jumpMedium: "models/punch/jump-cloud-medium.glb",
  jumpSmall: "models/punch/jump-cloud-small.glb",
  bigScreen: "models/punch/curved-screen.glb",
} as const;

/**
 * The Builder serves the same files from `assets/` (vite publicDir), so the editor
 * only ever differs from the scene by URL prefix — never by which file it loads.
 */
export function punchViewportUrl(modelPath: string): string {
  return `/punch-machine/${modelPath.split("/").pop()}`;
}

/** Authored cabinet width; the declared envelope its colliders were built for. */
export const PUNCH_AUTHORED_WIDTH_M = 1.62;

/**
 * How high the deck floats. A DIMENSION, so it lives here with the clouds and
 * the fans whose reach is measured against it — not in the product recipe,
 * where it sat while the tornado below was hand-tuned for its old value and
 * nothing checked either against the scene's roof.
 *
 * See `punchMaxIslandHeightM()` further down for what bounds this, and
 * `tests/shared/punch-cloud-sky.test.ts` for the guard. The product re-exports
 * it, so `PUNCH_ISLAND_HEIGHT_M` still resolves from its old home.
 */
export const PUNCH_ISLAND_HEIGHT_M = 80;

export interface PunchPart {
  readonly model: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Cabinet parts in cabinet-local metres.
 *
 * Facing comes from the mesh, not from the design notes: machine-body.glb carries
 * MachineBody_FrontConsole at Z -1.93 and MachineBody_RearRoofCap at Z -0.10, so the
 * FRONT is -Z and the cabinet is turned to face the spawn. The arm sits at the
 * modelled MachineBody_HingeCavity (Z -1.70..-1.83) and the plate just proud of
 * MachineBody_BottomDisplayFrame (Z -1.99, Y 0.19..0.41).
 */
export const PUNCH_CABINET_PARTS: readonly PunchPart[] = [
  { model: PUNCH_MODELS.body, x: 0, y: 0, z: 0 },
  { model: PUNCH_MODELS.arm, x: 0, y: 2.12, z: -1.75 },
  { model: PUNCH_MODELS.display, x: 0, y: 0.3, z: -2.02 },
];

/** Turn applied to the whole cabinet so its front faces +Z (the open mouth). */
export const PUNCH_CABINET_FACE_DEG = 180;
/** Hinge depth, repeated here because the cabinet offset is derived from it. */
export const PUNCH_HINGE_Z = -1.75;
/** Where the bag must end up: the centre of the punch hitbox. */
export const PUNCH_BAG_Z = 0.18;

/**
 * The big marquee panel. Measured from machine-body.glb: TopScoreDisplay spans
 * y 2.24..2.82 and z -2.020..-1.910, so its FRONT face is -2.020 and anything
 * drawn behind that is inside the housing. Sit 3 cm proud of the glass.
 */
export const PUNCH_SCREEN_TOP = { y: 2.53, z: -2.05 } as const;
/** Modelled MachineBody_BottomDisplayFrame (Z -1.99, Y 0.19..0.41). */
export const PUNCH_SCREEN_BOTTOM = { y: 0.3, z: -2.02 } as const;

export interface PunchJumpCloud extends PunchPart {
  /**
   * Collider half-width — and the same number sizes the updraught column above
   * the cloud, so a bigger cloud is a bigger target both to land on and to fly
   * over. One radius, two jobs: they can never disagree.
   */
  readonly radius: number;
  /**
   * `seat` clouds are amphitheater terraces: trampoline bounce and a light bob,
   * no updraught. Absent means `jump` — bounce AND ventilator.
   */
  readonly kind?: "jump" | "seat";
}

/** Which sky the island hangs. Championship is the punch machine; amphitheater is the dance floor. */
export type PunchCloudLayoutId = "championship" | "amphitheater";

/** The three cloud sizes, each with the collider its model was measured for. */
const CLOUD_SIZES = {
  large: { model: PUNCH_MODELS.jumpLarge, radius: 1.4 },
  medium: { model: PUNCH_MODELS.jumpMedium, radius: 1.15 },
  small: { model: PUNCH_MODELS.jumpSmall, radius: 0.9 },
} as const;

/**
 * A cloud placed by BEARING rather than by hand-written x/z.
 *
 * The sky is a ring, so authoring it as a ring is what keeps it readable and
 * keeps neighbours from landing on top of each other: `deg` is the island-local
 * bearing (0 = +X, turning toward +Z), `dist` the horizontal distance from the
 * island centre, `y` the height of the standable top face.
 */
function skyCloud(
  deg: number,
  dist: number,
  y: number,
  size: keyof typeof CLOUD_SIZES,
): PunchJumpCloud {
  const rad = (deg * Math.PI) / 180;
  const { model, radius } = CLOUD_SIZES[size];
  return { model, x: Math.cos(rad) * dist, y, z: Math.sin(rad) * dist, radius };
}

/**
 * The sky around the island. Every cloud here is BOTH a trampoline (land on it
 * and it throws you back up) and a ventilator (fly over it and its updraught
 * blows you higher) — see updateJumpClouds in scene/src/plugins/punch-machine.ts.
 *
 * The first three are the climb: a stepped arc off the deck edge, each one a
 * jump above the last, and the way back up when a prompt is dismissed. Their
 * coordinates are FIXED — move them and the island loses its staircase.
 *
 * The rest are the flight path, and their spread is the whole feature: a few
 * BELOW the rim so a fall is caught and blown back up rather than ending on the
 * ground, most AROUND at deck height so a lap of the island always has a cloud
 * ahead of you, and a handful ABOVE so the ring climbs instead of flattening
 * out. Nothing sits inside 8 m at deck height — the deck reaches 4.85 and the
 * curved screen 5.2, and a cloud parked in either is a cloud inside the arena.
 * The crown is the one exception, and it is allowed to come in to 5.4 because
 * it hangs twelve metres over the rim, where there is nothing to be inside of.
 *
 * ‼️THE SPACING RULE, which is what the bearings and distances are actually
 * for: no cloud's updraught column may contain another cloud's standing
 * surface. A column reaches radius + 1.6 m outward and 2.6..16 m upward, so a
 * cloud sitting in one would blow players off itself the moment they landed —
 * and the climb would stop working. Two neighbours need
 * `lower.radius + 1.6 + upper.radius` between them WHENEVER the upper one
 * stands 2.6..16 m above the lower. Move a cloud and check that, not the eye.
 */
/**
 * THE TORNADO: a corkscrew of clouds from just under the rim all the way down
 * to the ground.
 *
 * Falling off a hundred-metre island used to be an ending — you dropped past
 * empty air and the only way back was a rescue button. The spiral turns the
 * drop into the ride down and the ride back: whichever way you fall you meet a
 * cloud, and each one bounces and blows you toward the next one up.
 *
 * It is a funnel, wide at the top and tight at the ground, because that is what
 * a tornado looks like from outside and because the wide end has to stay clear
 * of the deck: a cloud under the rim still blows UPWARD past it, and one parked
 * too close in would push players off the plaza mid-match.
 *
 * ‼️The bottom cloud sits barely a metre up, because the first rung has to be
 * WALKED onto. At two metres it was already a coin-flip against a standing jump,
 * and a spiral you cannot get onto is scenery — the owner found exactly that:
 * "at the bottom next to the ground I cannot bootstrap myself up". Everything
 * above it is climbed with the pump (jump while standing on a cloud), never with
 * a plain jump. The scene drops any cloud this would put underground, so a lower
 * island simply gets a shorter tornado rather than clouds buried in the dirt.
 */
const TORNADO_TOP_M = -6;
/**
 * ‼️DERIVED FROM THE DECK, never typed in. This was -98.9 — the number that
 * lands 1.1 m over the ground for a 100 m island, and only for a 100 m island.
 * When the deck came down to fit under the scene's roof, that literal put the
 * bottom of the spiral eighteen metres UNDERGROUND, which the runtime would
 * have silently dropped: a tornado whose first rung cannot be walked onto is
 * scenery, and the way back up from the ground disappears without a word.
 */
const TORNADO_GROUND_GAP_M = 1.1;
const TORNADO_BOTTOM_M = -(PUNCH_ISLAND_HEIGHT_M - TORNADO_GROUND_GAP_M);
const TORNADO_COUNT = 14;
// ‼️Both angles are SOLVED, not chosen: the spiral has to descend without any
// of its clouds landing in the draught of the ring above it — the first bearing
// tried (20°) put the top of the tornado directly under the climb, which would
// have blown players off the staircase. 230/68 is the widest corkscrew that
// clears every column, including the deck's own airspace.
const TORNADO_START_DEG = 230;
const TORNADO_TURN_DEG = 68;
const TORNADO_TOP_DIST_M = 9.2;
const TORNADO_BOTTOM_DIST_M = 5.8;

function tornadoClouds(): PunchJumpCloud[] {
  const out: PunchJumpCloud[] = [];
  for (let i = 0; i < TORNADO_COUNT; i += 1) {
    const t = i / (TORNADO_COUNT - 1);
    const y = TORNADO_TOP_M + (TORNADO_BOTTOM_M - TORNADO_TOP_M) * t;
    const dist = TORNADO_TOP_DIST_M + (TORNADO_BOTTOM_DIST_M - TORNADO_TOP_DIST_M) * t;
    // Alternating sizes keep the spiral from reading as a stack of identical
    // beads, and the large ones are the wide targets a fast fall needs.
    out.push(skyCloud(TORNADO_START_DEG + i * TORNADO_TURN_DEG, dist, y, i % 2 === 0 ? "large" : "medium"));
  }
  return out;
}

export const PUNCH_JUMP_CLOUDS: readonly PunchJumpCloud[] = [
  // The climb — do not move.
  { model: PUNCH_MODELS.jumpLarge, x: 7.6, y: 1.4, z: -3.2, radius: 1.4 },
  { model: PUNCH_MODELS.jumpMedium, x: 9.4, y: 2.9, z: 0.4, radius: 1.15 },
  { model: PUNCH_MODELS.jumpSmall, x: 8.2, y: 4.4, z: 4.0, radius: 0.9 },
  // The lap: around, rising and dipping, all the way back to the climb.
  skyCloud(55, 9.4, 5.8, "small"),
  skyCloud(78, 12.2, 1.6, "medium"),
  skyCloud(105, 9.0, 8.6, "small"),
  skyCloud(132, 10.8, 3.4, "large"),
  skyCloud(158, 8.6, -2.8, "large"),
  skyCloud(180, 12.0, 6.4, "medium"),
  skyCloud(205, 9.6, 1.0, "small"),
  skyCloud(232, 11.4, 10.2, "small"),
  skyCloud(252, 8.4, -5.2, "medium"),
  skyCloud(278, 10.2, 4.6, "large"),
  skyCloud(300, 12.6, 8.0, "medium"),
  skyCloud(322, 9.2, 0.2, "small"),
  skyCloud(340, 13.0, -4.0, "large"),
  // The crown, straight over the deck edge: the top of the loop.
  skyCloud(90, 5.4, 12.0, "small"),
  ...tornadoClouds(),
];

/**
 * Cloud Dance Floor seats — a two-row amphitheater on the OPEN mouth of the
 * curved screen.
 *
 * The screen wraps the −Z half of the island (after PUNCH_BIG_SCREEN_FACE_DEG).
 * These rows wrap the +Z half, denser than the championship lap, stepped like
 * stairs: the front row is closer to the dance floor and lower, the back row
 * is further out and higher, and both sit ABOVE the plaza so a spectator looks
 * down into the cypher with the screen as the backdrop.
 *
 * They bounce like the championship trampolines, without the sky vent. The
 * tornado under the rim stays so a fall is still a climb back. Bearings are
 * nudged off the perfect arc so the ring reads as a crowd of clouds, not a
 * compass rose.
 */
function amphitheaterSeatClouds(): PunchJumpCloud[] {
  const seats: PunchJumpCloud[] = [];
  const rows = [
    { dist: 6.5, y: 1.2, from: 22, to: 158, count: 8 },
    { dist: 8.1, y: 2.55, from: 14, to: 166, count: 10 },
  ] as const;
  for (const row of rows) {
    for (let i = 0; i < row.count; i += 1) {
      const t = i / (row.count - 1);
      const deg = row.from + (row.to - row.from) * t;
      const wobbleDeg = Math.sin(i * 2.13 + row.dist) * 5.2;
      const wobbleDist = Math.cos(i * 1.67 + row.y) * 0.42;
      seats.push({
        ...skyCloud(deg + wobbleDeg, row.dist + wobbleDist, row.y, "small"),
        kind: "seat",
      });
    }
  }
  return seats;
}

export const CLOUD_DANCE_JUMP_CLOUDS: readonly PunchJumpCloud[] = [
  ...amphitheaterSeatClouds(),
  ...tornadoClouds(),
];

export function punchJumpCloudsFor(
  layout: PunchCloudLayoutId | string | undefined,
): readonly PunchJumpCloud[] {
  return layout === "amphitheater" ? CLOUD_DANCE_JUMP_CLOUDS : PUNCH_JUMP_CLOUDS;
}

export function isPunchSeatCloud(cloud: PunchJumpCloud): boolean {
  return cloud.kind === "seat";
}

/**
 * The updraught column, in the same module as the clouds it rises out of.
 *
 * The scene runs the fan (updateCloudVent), but the SHAPE of the column is a
 * dimension like every other one here — and the layout above is only legal
 * because of these three numbers, so they cannot live in the plugin where a
 * later tweak would silently invalidate the spacing.
 */
/** How far past the cloud's own edge the wind still catches you. */
export const PUNCH_VENT_MARGIN_M = 1.6;
/** Column floor above the top face — high enough that jumping on a cloud you
 *  are standing on never trips its own fan. */
export const PUNCH_VENT_FLOOR_M = 2.6;
/** Column ceiling above the top face; past this the cloud is out of breath. */
export const PUNCH_VENT_CEILING_M = 16;

/**
 * THE SCENE'S OWN ROOF — and the reason the three numbers above are a BUDGET
 * rather than a preference.
 *
 * Decentraland caps a scene at `log2(parcels + 1) x 20` metres, and simply
 * stops applying it past that line: geometry crossing the boundary gets the
 * explorer's out-of-bounds treatment, and a player above it is outside the
 * scene, so its colliders stop existing for them. Both at once is what the
 * owner reported on 2026-09-04 — the island "slashed and cut off in pieces",
 * and "when you go up, after some shaking you fall down through the floor".
 * One number, two symptoms that read as unrelated bugs.
 *
 * The championship is 7x7, so the roof is 112.88 m. The deck stood at 100 m,
 * and the fans above it — a cloud at +12 carrying a 16 m column — held players
 * up to 128 m. Fifteen metres outside the box. Nothing in the punch path had
 * ever read the limit: `maxHeight`, `heightLimit` and `log2` appeared nowhere
 * in the product, the plugin, this file or the contract, while the rest of the
 * repo has known the formula all along (shared/types.ts, skybox-contract.ts).
 *
 * ‼️THE BUDGET IS NOT THE DECK HEIGHT. It is deck + highest cloud + vent
 * ceiling: anything that LAUNCHES a player counts, not only what is drawn.
 * That is why this lives beside the column and not beside the island height —
 * raising the fan raises the island's minimum clearance too.
 */
export function punchSceneCeilingM(parcelCount: number): number {
  return Math.log2(Math.max(1, parcelCount) + 1) * 20;
}

/** Air left under the roof, so nothing ever stands exactly ON the boundary. */
export const PUNCH_CEILING_MARGIN_M = 4;

/** The highest standable cloud face above the deck: the top of the climb. */
export const PUNCH_HIGHEST_CLOUD_M = PUNCH_JUMP_CLOUDS.reduce(
  (highest, cloud) => Math.max(highest, cloud.y),
  0,
);

/**
 * Everything the island needs above its own deck — the crown cloud, plus the
 * full column standing on top of that cloud, plus the margin.
 */
export const PUNCH_ISLAND_HEADROOM_M =
  PUNCH_HIGHEST_CLOUD_M + PUNCH_VENT_CEILING_M + PUNCH_CEILING_MARGIN_M;

/**
 * The tallest deck this scene can legally carry. `punch-cloud-sky.test.ts`
 * holds the shipped island height to this, so a taller island (or a stronger
 * fan) fails in vitest rather than in the explorer.
 */
export function punchMaxIslandHeightM(parcelCount: number): number {
  return punchSceneCeilingM(parcelCount) - PUNCH_ISLAND_HEADROOM_M;
}

/**
 * The absolute world Y past which no fan may push a player.
 *
 * A function rather than a constant because the plugin only learns the parcel
 * count at runtime (`ctx.config.scene`), and because a machine dropped into
 * someone else's larger scene should get the taller roof it has paid for.
 */
export function punchFlightCeilingY(parcelCount: number): number {
  return punchSceneCeilingM(parcelCount) - PUNCH_CEILING_MARGIN_M;
}

/**
 * The trampoline curve, next to the column for the same reason: these numbers
 * only work as a SET, and the set has a trap in it.
 *
 * A bounce of `fall × restitution + floor` is a geometric series with an offset,
 * and an offset series does not converge to zero — it converges to
 * `floor / (1 - restitution)`. If that fixed point throws the player clear of
 * the contact band, the landing re-arms and the bounce runs for ever: the cloud
 * becomes a surface you cannot stand on. It shipped that way (floor 2.2, fixed
 * point 5.8 m/s, a 1.7 m hop) and the report was "you can never land".
 *
 * `punch-cloud-sky.test.ts` holds these to that rule, so raising the floor for a
 * bouncier feel fails loudly instead of quietly bobbing people.
 */
export const PUNCH_BOUNCE_RESTITUTION = 0.62;
export const PUNCH_BOUNCE_FLOOR_MPS = 1;
/** Arrive gentler than this and the cloud just holds you — a stair, not a throw. */
export const PUNCH_BOUNCE_SETTLE_MPS = 3.4;
/** How far above the top face still counts as contact. The bounce's resting hop
 *  has to stay INSIDE this or the landing re-arms itself. */
export const PUNCH_CONTACT_BAND_M = 0.55;
/** Explorer gravity, for turning a launch speed into the height it reaches. */
export const PUNCH_GRAVITY_MPS2 = 9.8;
/** The hardest a cloud may ever throw. An apex of ~5 m: high enough to reach
 *  the next rung's updraught, low enough not to fling anyone off the island. */
export const PUNCH_BOUNCE_MAX_MPS = 10;

/**
 * THE PUMP — the third thing a cloud does, and the only one you ASK for.
 *
 * The passive curve above is deliberately a dead end: it converges, so standing
 * on a cloud is possible and a stray landing never launches anybody. That is
 * right for arriving, and useless for climbing — every rung of the spiral above
 * the first is out of reach of a settled hop, and out of reach of a plain jump.
 *
 * So a cloud answers a RHYTHM. Press jump as you come down and the landing is
 * read as deliberate: the cloud gives back more than it took, and doing it again
 * gives more again, up to a ceiling. Stop, and the stored energy bleeds away and
 * the surface goes back to being a floor. Three states out of one contact test,
 * which is what the spec asked for: fly over it, land on it, or work it.
 *
 * ‼️The beat is an EDGE, never a hold. Holding jump would make the pump a button
 * you lean on, and the input the player is actually giving — "again, now" — is a
 * press. It is also why the window below opens BEFORE contact rather than after:
 * on a five-metre bounce the contact band is crossed in a few frames, so asking
 * for a press during those frames would be asking for a reflex nobody has. A
 * press on the way down is the same gesture a real trampoline wants.
 */
/** How much one timed jump adds. Four beats to a full pump, three to the cap. */
export const PUNCH_PUMP_STEP_01 = 0.28;
/** What a full pump is worth on top of the passive bounce, m/s. */
export const PUNCH_PUMP_GAIN_MPS = 5.4;
/** How early a press still counts as this landing's beat. */
export const PUNCH_PUMP_WINDOW_MS = 500;
/**
 * How long a beat holds the charge before it starts to bleed.
 *
 * Longer than the longest pumped flight (a capped 10 m/s launch is airborne for
 * 2.04 s), because the charge has to survive the hang time it just bought. Any
 * shorter and a perfect rhythm would decay between its own bounces — the pump
 * would fight the player instead of answering them.
 */
export const PUNCH_PUMP_HOLD_MS = 2_400;
/** Once it does bleed, exponentially, at this rate per second. */
export const PUNCH_PUMP_DECAY_RATE = 1.6;
/** Below this the pump is simply off, and the cloud is a floor again. */
export const PUNCH_PUMP_FLOOR_01 = 0.05;

function pumpUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/** One timed jump. Flat, so the ramp is countable rather than felt out. */
export function punchPumpBeat(charge01: number): number {
  return pumpUnit(pumpUnit(charge01) + PUNCH_PUMP_STEP_01);
}

/**
 * The pump, one frame on. Holds while the player is still working, then bleeds.
 *
 * Exponential rather than a flat subtraction, and exact under any step size, so
 * a client at 60 fps and one at 30 bleed identically — the same reason the
 * meditation meter is written this way.
 */
export function punchPumpDecay(
  charge01: number,
  sinceBeatMs: number,
  dtMs: number,
): number {
  const charge = pumpUnit(charge01);
  if (charge <= 0) return 0;
  if ((Number(sinceBeatMs) || 0) <= PUNCH_PUMP_HOLD_MS) return charge;
  const dt = Math.max(0, Number.isFinite(dtMs) ? dtMs : 0) / 1000;
  const next = charge * Math.exp(-PUNCH_PUMP_DECAY_RATE * dt);
  return next <= PUNCH_PUMP_FLOOR_01 ? 0 : next;
}

/**
 * What this landing is worth, in m/s upward. Zero means the cloud HOLDS you.
 *
 * The settle cut is the difference between a stair and a trampoline, and the
 * pump is what suspends it: arrive gently with nothing stored and the cloud
 * simply takes your weight, arrive gently mid-rhythm and it throws you, because
 * the second one is a thing you asked for and the first one is not.
 */
export function punchCloudLaunchMps(
  fallSpeedMps: number,
  charge01: number,
): number {
  const fall = Math.max(0, Number.isFinite(fallSpeedMps) ? fallSpeedMps : 0);
  const charge = pumpUnit(charge01);
  const pumping = charge > PUNCH_PUMP_FLOOR_01;
  if (!pumping && fall <= PUNCH_BOUNCE_SETTLE_MPS) return 0;
  const passive = fall * PUNCH_BOUNCE_RESTITUTION + PUNCH_BOUNCE_FLOOR_MPS;
  return Math.min(
    PUNCH_BOUNCE_MAX_MPS,
    passive + charge * PUNCH_PUMP_GAIN_MPS,
  );
}

/** Jump-cloud collider half-widths, in the same order as PUNCH_JUMP_CLOUDS. */
export const PUNCH_JUMP_CLOUD_RADII: readonly number[] = PUNCH_JUMP_CLOUDS.map(
  (cloud) => cloud.radius,
);

/**
 * How far below the deck the sky still belongs to the island.
 *
 * The "you fell" prompt used to fire six metres under the rim, which was right
 * when everything below the rim was empty air. It is not any more: dropping to
 * the low clouds on purpose is a move, and a rescue prompt in the middle of it
 * reads as a failure. The prompt now waits until the player is properly under
 * the LOWEST cloud, where there really is nothing left to catch them.
 */
export const PUNCH_SKY_FLOOR_M =
  Math.min(...PUNCH_JUMP_CLOUDS.map((cloud) => cloud.y)) - 3;

/**
 * The deck is a DISC, because cloud-plaza.glb is. A square left standable ground
 * 7.92 m out at the corners on a plaza that stops near 6.9, and axis tabs reaching
 * 6.95 m — a metre past the rope, which is how a player walked outside the barrier.
 */
export const PUNCH_DECK_RADIUS = 4.85;
/**
 * The barrier, ON the modelled rope. Measured from cloud-plaza.glb: the walkable
 * stone reaches 4.58, the rim 4.84, and the fence meshes (Combined_cream /
 * _cyan / _red) sit at 4.82-4.87 — everything past that is decorative cloud.
 * The old 6.0 ring stood more than a metre OUTSIDE the rope, so a player walked
 * through the visible fence and only stopped somewhere out on the puffs.
 */
export const PUNCH_RAIL_RADIUS = 4.8;
/**
 * Waist high. At 1.35 m centred on 0.72 the barrier spanned 0.045..1.395 and caught
 * an avatar's hands and face while walking the rim.
 */
export const PUNCH_RAIL_HEIGHT = 0.9;
/**
 * Segments in the barrier ring. The wall is an inscribed polygon, so few
 * segments sag inward between posts: at 8 the mid-span sat 0.37 m inside the
 * rope. 16 keeps the gap under 0.1 m all the way round.
 */
export const PUNCH_RAIL_SEGMENTS = 16;

/**
 * cloud-plaza.glb models its own posts and rope (Combined_cream / _cyan / _red), so
 * NEITHER renderer may draw a fence. Both did once, which is why the island wore two.
 */
export const PUNCH_PLAZA_MODELS_ITS_OWN_RAIL = true;

/**
 * Visitor arrival on a cabinet island, island-local metres from the plaza centre.
 *
 * Behind the cabinet (−Z), on a WING, looking at the picture. Three constraints,
 * all from the owner on 2026-09-11:
 *
 * 1. Not the open mouth (+Z). That is where the playing camera sits, so a crowd
 *    of arrivals fills the shot — "the bottom of my screen".
 * 2. Not a nearby cloud. On mobile that is a jump you have to already know.
 * 3. Not dead-centre behind the chassis looking at it. Third-person then sits
 *    through the curved screen onto the red back, and only first-person shows
 *    the picture.
 *
 * The +X wing stays hidden behind the cabinet from the strike spot, keeps the
 * arriver on the deck (walk around, no jump), and looking at the inner screen
 * pulls their camera out the SIDE — empty air — instead of through the wall.
 * +Z 4.4 sat ON the modelled rope; this radius stays inside it.
 *
 * Amphitheatres without a cabinet keep the open-mouth spawn in sky-island-spawn.ts.
 */
export const PUNCH_CABINET_SPAWN_X = 1.2;
export const PUNCH_CABINET_SPAWN_Z = -2.8;
/** Inner screen apex, island-local. The look-at, not a place you stand. */
export const PUNCH_CABINET_SPAWN_LOOK_X = 0;
export const PUNCH_CABINET_SPAWN_LOOK_Y = 2.5;
export const PUNCH_CABINET_SPAWN_LOOK_Z = -6.2;

/** Avatar 0.5 m + spawn box 0.5 m — standing ON the rope is how +Z 4.4 failed. */
const PUNCH_SPAWN_CLEAR_M = 1;

/**
 * True when the cabinet arrival sits on the deck, inside the rope, behind the
 * machine, on a wing so the camera is not shoved through the picture.
 */
export function punchCabinetSpawnClearsRail(): boolean {
  const r = Math.hypot(PUNCH_CABINET_SPAWN_X, PUNCH_CABINET_SPAWN_Z);
  return (
    PUNCH_CABINET_SPAWN_Z < -2 &&
    Math.abs(PUNCH_CABINET_SPAWN_X) >= 1 &&
    r < PUNCH_DECK_RADIUS &&
    r < PUNCH_RAIL_RADIUS - PUNCH_SPAWN_CLEAR_M
  );
}

/** Look-at for cabinet arrival: the inner screen, in scene metres. */
export function punchCabinetSpawnLook(
  centerX: number,
  deckY: number,
  centerZ: number,
): { x: number; y: number; z: number } {
  return {
    x: centerX + PUNCH_CABINET_SPAWN_LOOK_X,
    y: deckY + PUNCH_CABINET_SPAWN_LOOK_Y,
    z: centerZ + PUNCH_CABINET_SPAWN_LOOK_Z,
  };
}

/**
 * The arena screen: a 180° curved display standing round the BACK half of the
 * island, so the machine is played against a wall of picture.
 *
 * curved-screen.glb is authored concentric with this plaza — same origin (plaza
 * centre, floor level), and its arc fills the +Z half. Everything below is why
 * it is not simply dropped in at identity.
 */
/**
 * The arc has a BACK, and it is red.
 *
 * curved-screen.glb shipped with Screen_Surface and Screen_Back_Shell sharing one
 * index buffer wound inward at the plaza — correct for the picture, which is only
 * ever watched from inside the arc, and fatal for the shell: a single-sided face
 * pointing away from the camera is culled, so anyone flying round the island looked
 * straight through a sixteen-metre screen. The shell now carries its own reversed
 * winding and Screen_Back_MAT (house red, doubleSided).
 *
 * The model has no generator in this repo, so RE-IMPORTING IT REVERTS THAT: re-run
 * `python scripts/punch/repair-curved-screen-back.py` after any fresh copy lands.
 * tests/scene/arena-screen-back.test.ts is the tripwire.
 */
/** Turn the authored +Z arc onto the -Z half: the machine's front faces +Z. */
export const PUNCH_BIG_SCREEN_FACE_DEG = 180;
/**
 * Island-local +Z is the open mouth (amphitheater / spawn). −Z is the screen.
 *
 * Third-person camera sits behind the avatar. If a wait-teleport looks toward
 * +Z, the camera is shoved through the picture onto the red back — which is
 * what a queued dancer sees instead of the floor (owner 2026-09-10).
 */
export const PUNCH_ISLAND_AUDIENCE_Z = 1;
export const PUNCH_ISLAND_SCREEN_Z = -1;

/** Where a waiting guest stands: on the plaza, audience side of the floor. */
export function punchIslandQueueStandLocal(
  centerX: number,
  centerZ: number,
  floorRadius: number,
): { x: number; z: number } {
  return {
    x: centerX,
    z: centerZ + PUNCH_ISLAND_AUDIENCE_Z * Math.max(1, floorRadius + 0.8),
  };
}

/** Look-at on the SCREEN side of the floor, so the camera stays in the seats. */
export function punchIslandLookLocal(
  centerX: number,
  centerZ: number,
  alongM = 2,
): { x: number; z: number } {
  return { x: centerX, z: centerZ + PUNCH_ISLAND_SCREEN_Z * alongM };
}
/**
 * Authored radius of the display surface. Measured from the GLB: Screen_Surface
 * spans x ±4.80 / z 0..4.80, the back shell 4.88 and the frame rails 4.95.
 */
export const PUNCH_BIG_SCREEN_AUTHORED_RADIUS = 4.8;
/**
 * Clearance between the display surface and the modelled fence, which is the
 * only reason this asset is not placed at 1:1. cloud-plaza.glb's rope reaches
 * 4.87 (Combined_red) and stands 1.03 m tall, so an unscaled screen at 4.80
 * puts the rope THROUGH the bottom of the picture — coplanar at the back half
 * of the ring, which is the z-fight this project keeps re-learning. 0.3 m out
 * puts the rope cleanly in front of the screen instead of inside it.
 */
export const PUNCH_BIG_SCREEN_FENCE_CLEARANCE = 0.3;
/** Fence outer radius, read from cloud-plaza.glb. Repeated so the scale derives. */
export const PUNCH_BIG_SCREEN_FENCE_RADIUS = 4.87;
/**
 * Uniform scale — DERIVED, never hand-tuned. A non-uniform one would stretch the
 * UVs the video rides on, so the whole screen grows together: at 1.077 the
 * picture is 4.09 m tall over a 16.4 m arc, and the feet land on the cloud
 * shoulder just outside the rim rather than on top of the rope.
 */
/**
 * HOW FAR THE SCREEN STANDS OFF THE ISLAND — a TRANSLATION, deliberately not
 * the scale.
 *
 * The arc was placed at the island's own origin, flat on the deck, with 21 cm
 * between the wash panels and the modelled fence rope. The owner's word for
 * that is claustrophobic: the screen sits directly behind the machine, and the
 * two read as one object.
 *
 * ‼️THE TRAP, and it is why these are new constants rather than a bigger
 * clearance. The only dial that reads like a standoff is
 * PUNCH_BIG_SCREEN_FENCE_CLEARANCE, and it is an input to the uniform SCALE
 * above. Raising it 0.3 -> 1.3 takes the scale 1.077 -> 1.285: the picture
 * grows from 4.09 m to 4.88 m tall and the arc from 16.2 m to 19.4 m. Pushing
 * the screen back would make it bigger, and every fraction the wash, the
 * portrait and the verdict plate are laid out in would move with it.
 *
 * So the screen keeps its derived size and simply MOVES. Lift is +Y, push is
 * along the arc's own axis away from the deck; the GLB is turned
 * PUNCH_BIG_SCREEN_FACE_DEG onto the -Z half, so a positive push travels -Z in
 * the island frame.
 *
 * ‼️THE SECOND TRAP: there are TWO ROOTS IN TWO FRAMES. The GLB root carries
 * the 180 turn and the scale; the wash root carries neither, because both are
 * baked by hand into punchWashSegment. An offset applied to one and not the
 * other tears the picture off the screen. Anything that moves the arc must move
 * both, and the Builder viewport with them.
 */
export const PUNCH_BIG_SCREEN_LIFT_M = 1.2;
export const PUNCH_BIG_SCREEN_PUSH_M = 1.15;
export const PUNCH_BIG_SCREEN_SCALE =
  (PUNCH_BIG_SCREEN_FENCE_RADIUS + PUNCH_BIG_SCREEN_FENCE_CLEARANCE) /
  PUNCH_BIG_SCREEN_AUTHORED_RADIUS;
/**
 * The one mesh that carries TEXCOORD_0 for the video: U runs 0..1 across the
 * whole arc, V bottom to top. Both spellings are sent as GltfNodeModifiers —
 * the node is a child of the GLB's `world` root, and only the path that matches
 * is applied, so listing both survives either resolution rule.
 */
export const PUNCH_BIG_SCREEN_NODE_PATHS = [
  "Screen_Surface",
  "world/Screen_Surface",
] as const;
/**
 * Picture aspect by arc length (15.21 m over 3.80 m authored). Source video
 * wider or narrower than this gets stretched — 1024×256 is the native canvas.
 */
export const PUNCH_BIG_SCREEN_ASPECT = 4;

/**
 * The reaction wash — the arc's own geometry, sitting just inside the picture.
 *
 * The screen's video is painted onto the GLB through GltfNodeModifiers, and
 * that works exactly once: the explorer applies the modifier when the model
 * loads and does not appear to re-read it afterwards. Every reaction written
 * that way — the contact flash, the tier colours, the charge ramp — was
 * therefore addressed to something nobody reads a second time, which is why the
 * arc has never visibly responded to a punch no matter how the logic was fixed.
 *
 * So the reactions get their own surface instead: a ring of plain boxes hugging
 * the inside of the display, driven by an ordinary Material. That component is
 * updated at runtime all over this plugin already (the cabinet's meter repaints
 * on every punch), so it is the mechanism with evidence behind it rather than
 * assumption. Hidden, it costs a single transform write.
 *
 * Radius sits just INSIDE the display surface so the wash occludes the picture
 * from the deck rather than z-fighting with it.
 */
export const PUNCH_WASH_SEGMENTS = 20;
export const PUNCH_WASH_INSET_M = 0.07;
/** Authored display band, from the GLB: Screen_Surface spans y 0.55..4.35. */
export const PUNCH_WASH_BOTTOM_M = 0.55;
export const PUNCH_WASH_TOP_M = 4.35;

/** One wash panel: where it sits and how wide, in machine-root metres. */
/**
 * HOW MANY ROWS THE ARC HAS — and it had ONE, which is the whole reason the
 * screen could not have sections.
 *
 * Each wash panel was a single box spanning the entire 4.09 m band, painted one
 * colour top to bottom, and every pattern in punch-show-patterns.ts is a
 * function of (segment, t01) with no Y term in any of its fifteen cases. So the
 * arc was a 20x1 display: it could sweep sideways and it could change colour,
 * and it could not produce a horizontal band, a horizon, a header or a footer
 * at all. "The sections need to be clearly defined" was not unimplemented, it
 * was unrepresentable.
 *
 * ‼️EIGHT NOW, AND THE REASON IS THAT THREE CANNOT SPELL A NUMBER.
 *
 * Three rows bought bands — a plinth, a body, a header — and that was the right
 * first move: it is what stopped the arc reading as a wall of light. But the
 * owner's actual complaint (2026-09-04) was never about texture. It was that
 * "the score and the lights on the machine when they go up, this is not being
 * mirrored on the screen", and that "we haven't seen any kind of symbols or any
 * kind of attempts to create anything graphical". The one thing this machine
 * produces is a THREE DIGIT NUMBER, and a 20x3 grid physically cannot draw a
 * digit — the smallest legible numeral is 7 rows tall.
 *
 * Eight rows makes the arc a 20x8 matrix, which fits a 4x7 numeral with a
 * column of air between characters: four digits across 19 of the 20 columns, or
 * three across 14. The score the cabinet is counting can now be counted SIXTEEN
 * METRES WIDE behind it, in the same beat, off the same number. See
 * `shared/punch-show-glyphs.ts`.
 *
 * The cost is real and was accepted deliberately: 160 boxes rather than 60, on
 * an island whose boot pacing is budgeted. It is affordable because nothing
 * about the write path changed — `paintPanel` still skips a panel whose colour
 * has not moved, and a held numeral moves no panels at all.
 *
 * A row is 0.51 m at this height, read from inside a 9.7 m ring. That is below
 * the "deliberate stripe" threshold three rows was chosen for, which is exactly
 * right: a row is no longer a band you are meant to notice, it is a PIXEL. The
 * bands survive as the row-gain vignette below.
 */
export const PUNCH_WASH_ROWS = 8;

/** Total boxes in the wash. The paint array is indexed by punchWashIndex. */
export const PUNCH_WASH_PANELS = PUNCH_WASH_SEGMENTS * PUNCH_WASH_ROWS;

/** Flat index for a (column, row). Row 0 is the BOTTOM band. */
export function punchWashIndex(col: number, row: number): number {
  return col * PUNCH_WASH_ROWS + row;
}

/**
 * WHAT EACH BAND IS FOR, as a brightness multiplier on the column's colour.
 *
 * The rows are not a gradient, they are ROLES, and the gap between them is what
 * makes the arc read as a built display instead of a wall of light: a dim
 * plinth at the bottom, the body at full strength through the middle where a
 * standing player is actually looking, and a header capping it. With eight rows
 * those three roles become a soft vignette rather than three hard stripes, and
 * the arc keeps the framed look it gained without the banding fighting a
 * numeral drawn across it. Ordered bottom-up, matching row 0 = bottom.
 *
 * ‼️THE GLYPH LAYER IGNORES THIS ON PURPOSE. A digit drawn through a per-row
 * gain comes out striped and stops being a digit — see `punchWashGlyphGain`.
 */
export const PUNCH_WASH_ROW_GAIN: readonly number[] = [
  0.42, 0.68, 0.88, 1, 1, 0.94, 0.8, 0.62,
];

/**
 * What a row is multiplied by while a GLYPH is on the arc.
 *
 * Nearly flat, but not flat: a numeral has to read as one solid shape, and a
 * completely uniform field loses the framed look the vignette above buys for
 * every other frame. A few per cent of falloff at the extremes keeps the screen
 * looking like a screen without breaking the character.
 */
export function punchWashGlyphGain(row: number): number {
  if (row <= 0) return 0.9;
  if (row >= PUNCH_WASH_ROWS - 1) return 0.9;
  return 1;
}

export function punchWashSegment(
  col: number,
  row: number,
  rowShift = 0,
): {
  x: number;
  z: number;
  y: number;
  width: number;
  height: number;
  yawDeg: number;
} {
  const radius =
    PUNCH_BIG_SCREEN_AUTHORED_RADIUS * PUNCH_BIG_SCREEN_SCALE - PUNCH_WASH_INSET_M;
  const bottom = PUNCH_WASH_BOTTOM_M * PUNCH_BIG_SCREEN_SCALE;
  const top = PUNCH_WASH_TOP_M * PUNCH_BIG_SCREEN_SCALE;
  // The band split. Rows stack bottom-up and together they still cover exactly
  // the authored 0.55..4.35 face, so the arc gains structure without losing a
  // millimetre of height — the picture must still reach the full screen.
  //
  // `rowShift` is how a 7-row numeral centres on this 8-row face: half a row
  // of lift, so the leftover air splits above and below instead of kissing one
  // bezel. Patterns and icons pass 0 and still tile the authored band.
  const rowH = (top - bottom) / PUNCH_WASH_ROWS;
  const rowMid = bottom + rowH * (row + 0.5 + rowShift);
  // The screen fills the BACK half — the same 180 degrees the GLB is turned to
  // cover. Walk from the right post (+X) round through the apex (-Z) to the
  // left post (-X), so every panel lands on NEGATIVE z where the arc actually
  // is. Starting the sweep at -90 instead swings it onto the -X side, which put
  // the wash across the deck's left flank with the screen untouched behind it.
  const step = Math.PI / PUNCH_WASH_SEGMENTS;
  const angle = -step * (col + 0.5);
  // Face the centre: turn the box so its +Z axis points back down the radius.
  // Derived rather than offset by a constant, because a hand-picked +90 is
  // exactly how the sweep above ended up a quarter turn out in the first place.
  const yaw = Math.atan2(-Math.cos(angle), -Math.sin(angle));
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    y: rowMid,
    // A shade over the chord so neighbours overlap instead of leaving seams.
    width: 2 * radius * Math.sin(step / 2) * 1.06,
    // And a shade over the row height, for the same reason in the other axis:
    // three exactly-sized boxes leave two visible hairlines across the arc.
    height: rowH * 1.04,
    yawDeg: (yaw * 180) / Math.PI,
  };
}

/**
 * ‼️★★★THE ATTRACT MOODS ARE GONE, AND NOTHING REPLACES THEM WITH ANOTHER FILM.
 *
 * `PUNCH_ARENA_ATTRACT_CLIPS` used to live here — three twenty-second sections
 * cut from the house footage, shipped inside the scene so a championship had
 * nothing to phone home for. The engineering was fine and the result was not:
 * a turn lasts fifteen seconds, a mood lasted twenty, so the biggest surface on
 * the island spent most of every session showing something unrelated to the
 * game being played in front of it, and froze on a frame whenever an explorer
 * declined to restart on a source swap.
 *
 * The arc is now drawn from game state alone — see `ambientPaint` in
 * scene/src/plugins/punch-arena-screen.ts. Do not reintroduce a video source
 * here, and note that `videos/punch/` has come OFF the compact bundle's keep
 * prefixes in app/src/deploy/scene-bundle.ts to match.
 */

/**
 * THE PORTRAIT — the challenger's face, ON the curve rather than in front of it.
 *
 * ‼️This replaces a flat 2.4 m square with a 2.6 m border that hung 0.75 m off
 * the surface, and the owner reported it repeatedly as something floating in
 * front of the screen. It WAS floating: a flat plate cannot sit on a cylinder,
 * so it had to stand proud far enough for its own CORNERS to clear, and at that
 * distance it read as an object hanging in the arena rather than as a picture.
 *
 * The fix is the one the wash already uses — stop trying to be one flat thing.
 * The face is cut into COLUMNS that follow the arc, occupying the same angular
 * slots as wash panels `PUNCH_PORTRAIT_COLUMN_START..+COLUMNS`, each carrying
 * its own slice of the avatar texture through the plane's UVs. Reassembled they
 * are a face; individually each is 0.84 m wide and deviates from the curve by
 * 1.6 cm, which is not a thing an eye can find at sixteen metres.
 *
 * `AvatarTexture` still has no offset or tiling fields — that was never the
 * lever. The UVs live on the GEOMETRY (`MeshRenderer.setPlane(entity, uvs)`),
 * so the slicing is done by the mesh and the texture is left alone.
 *
 * THREE columns, not more: at 27 degrees the picture bulges 14 cm toward the
 * deck over its 2.39 m width — a curved-TV amount, which a face survives. Widen
 * the span and you are back to the problem that took the scoreboard off this
 * surface, where the two ends of the picture point away from whoever is
 * standing in front of it.
 */
export const PUNCH_PORTRAIT_COLUMNS = 3;

/**
 * THE SNAPSHOT'S OWN SHAPE — width over height — AND WHY IT IS A CONSTANT.
 *
 * ‼️The explorer decides which profile snapshot `AvatarTexture` resolves to and
 * the SDK does not say which; the owner's own screen (2026-09-04) shows an
 * OUTFIT, so it is the body shot, which the Catalyst writes at 1:2. Nothing in
 * a scene can measure a texture, so this cannot be derived — it is declared,
 * once, and everything that lays the picture out reads it from here.
 *
 * ★If a build ever comes back with the face crop instead, this is the ONE line
 * to change (to 1) and the layout follows: `punchPortraitColumn` fits by
 * CROPPING the axis that overflows, so a wrong value here shows too much or too
 * little of a person, never a stretched one.
 */
export const PUNCH_PORTRAIT_SOURCE_ASPECT = 0.5;
/**
 * Which wash slot the face starts at, counting from the +X post.
 *
 * 4..6 centres it on -49.5 degrees, which is where the flat panel already
 * stood — the crowd's LEFT third. Not the middle, and the reason is physical:
 * four metres of cabinet stands between the deck and the centre of the arc, so
 * the centre of this screen is the one place a face cannot be seen from.
 */
export const PUNCH_PORTRAIT_COLUMN_START = 4;
/**
 * A centimetre proud of the wash, ten off the picture.
 *
 * The wash boxes sit at 0.07 with 0.04 of depth, so their front face is at
 * 0.09. Landing on exactly that is the coplanar z-fight this project keeps
 * re-learning; a centimetre is enough and stays invisible.
 */
export const PUNCH_PORTRAIT_INSET_M = 0.1;
/**
 * Overlap, IDENTICAL to the wash's, and it has to be paid for in the UVs.
 *
 * The panels are placed at the full radius rather than on the apothem, so
 * consecutive chords cross rather than meet and a 1:1 width leaves a ~1.5 cm
 * seam showing the lit wash between two pieces of a face. Widening them closes
 * it — but a wider panel showing the same slice would COMPRESS the picture at
 * every seam, so `punchPortraitColumn` widens the UV window by the same
 * fraction. The overlapping geometry then carries the overlapping part of the
 * image and the face stays continuous across the join.
 */
export const PUNCH_PORTRAIT_OVERLAP = 1.06;

/**
 * One portrait column: where it sits, and which slice of the face it carries.
 *
 * `index` is 0..PUNCH_PORTRAIT_COLUMNS-1, running LEFT TO RIGHT as the crowd
 * sees it — column 0 is the +X end, and the file's own rule says a viewer
 * turned to face -Z has +X on their left.
 *
 * `yawDeg` is the wash's yaw turned by 180, because a plane presents its -Z
 * face and a box presents +Z. With -Z toward the deck the panel's own +X lands
 * on the VIEWER'S RIGHT, which is why `u` can run forward with the index
 * instead of against it.
 */
export function punchPortraitColumn(index: number): {
  x: number;
  z: number;
  y: number;
  width: number;
  height: number;
  yawDeg: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
} {
  const radius =
    PUNCH_BIG_SCREEN_AUTHORED_RADIUS * PUNCH_BIG_SCREEN_SCALE -
    PUNCH_PORTRAIT_INSET_M;
  const step = Math.PI / PUNCH_WASH_SEGMENTS;
  const slot = PUNCH_PORTRAIT_COLUMN_START + index;
  const angle = -step * (slot + 0.5);
  const yaw = Math.atan2(-Math.cos(angle), -Math.sin(angle)) + Math.PI;
  // Square: the tile is as tall as the arc it covers is long, because an avatar
  // snapshot is square and a non-square tile stretches the face it is holding.
  const bottom = PUNCH_WASH_BOTTOM_M * PUNCH_BIG_SCREEN_SCALE;
  const top = PUNCH_WASH_TOP_M * PUNCH_BIG_SCREEN_SCALE;
  /**
   * ‼️FULL BLEED, TOP TO BOTTOM — the tile is as tall as the WASH, not as tall
   * as the arc it covers.
   *
   * Owner, 2026-09-04: "it's way too small... if we show it turned by 90 degrees
   * it needs to be full height". It was 58% of the height, and the arithmetic
   * says why: the tile was forced SQUARE off its own arc length (3 columns =
   * 2.39 m) inside a screen 4.09 m tall, so the face floated in a band in the
   * middle of the surface it was the subject of.
   *
   * Height comes off the screen now and the picture is FITTED into it by
   * cropping — never by stretching, and never by widening the span, which is
   * capped by the bulge limit `PUNCH_PORTRAIT_COLUMNS` documents.
   */
  const size = top - bottom;
  // Half the overlap, in slices — what each side of the window has to grow by
  // for the widened panel to still show its own part of the picture.
  const bleed = (PUNCH_PORTRAIT_OVERLAP - 1) / 2 / PUNCH_PORTRAIT_COLUMNS;
  /**
   * THE FIT — a centre crop, never a stretch.
   *
   * The tile is `width * COLUMNS` across and `size` tall; the picture inside it
   * is `PUNCH_PORTRAIT_SOURCE_ASPECT`. Whichever axis of the source overflows
   * the tile is windowed down and CENTRED, so a person on this screen always
   * has their real proportions and the only thing that varies is how much of
   * them is shown. A body shot loses its feet; a face crop loses its margins.
   */
  const tileAspect = (radius * step * PUNCH_PORTRAIT_COLUMNS) / size;
  const vSpan = Math.min(1, PUNCH_PORTRAIT_SOURCE_ASPECT / tileAspect);
  const uSpan = Math.min(1, tileAspect / PUNCH_PORTRAIT_SOURCE_ASPECT);
  // ★THE VERTICAL CROP IS TOP-ANCHORED, not centred: on a body shot the half
  // worth keeping is the half with the head in it. V runs bottom-to-top on a
  // plane, so "keep the top" means starting at `1 - vSpan`.
  const v0 = 1 - vSpan;
  const uInset = (1 - uSpan) / 2;
  /** One column's share of the VISIBLE window, not of the whole texture. */
  const uStep = uSpan / PUNCH_PORTRAIT_COLUMNS;
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    y: (bottom + top) / 2,
    width: 2 * radius * Math.sin(step / 2) * PUNCH_PORTRAIT_OVERLAP,
    height: size,
    yawDeg: (yaw * 180) / Math.PI,
    // Clamped at the OUTER edges only: bleeding past 0 or 1 wraps the texture
    // and puts a sliver of the far cheek on the near one. The interior seams
    // keep their bleed, which is the only place it does any work.
    u0: Math.max(uInset, uInset + index * uStep - bleed * uSpan),
    u1: Math.min(1 - uInset, uInset + (index + 1) * uStep + bleed * uSpan),
    v0,
    v1: 1,
  };
}

/** Uniform scale that fits the authored parts to their declared envelope. */
export function punchCabinetScale(declaredWidthM: number): number {
  return declaredWidthM / PUNCH_AUTHORED_WIDTH_M;
}

/** Where the turned, scaled cabinet sits in machine-root space. */
export function punchCabinetOffsetZ(scale: number): number {
  return PUNCH_BAG_Z + PUNCH_HINGE_Z * scale;
}

/**
 * Cabinet-local metres to machine-root metres. Anything a renderer pins to the ROOT
 * rather than the cabinet — the text displays, which must stay unrotated to read the
 * right way round, plus the indicator and marquee lights — has to come through here
 * or it is left behind where the old model used to stand.
 */
export function punchOnCabinet(
  x: number,
  y: number,
  z: number,
  scale: number,
): { x: number; y: number; z: number } {
  return {
    x: -x * scale,
    y: y * scale,
    z: -z * scale + punchCabinetOffsetZ(scale),
  };
}

/**
 * Audience standing slots, clamped inside the deck by construction: no crowd size
 * can push the back row over the edge the way fixed rows did.
 */
export function punchAudienceSlot(
  index: number,
): { radius: number; angleRad: number } {
  const ring = Math.floor(index / 5);
  const inRing = index % 5;
  return {
    radius: Math.min(PUNCH_DECK_RADIUS - 0.8, 2.6 + ring * 1.5),
    angleRad: Math.PI / 2 + ((inRing - 2) / 5) * Math.PI * 0.95,
  };
}

/** Where the player stands to punch, metres in front of the machine centre. */
export const PUNCH_STRIKE_Z = 1.35;
/**
 * The fighting zone: stand this close to the strike spot, at deck level, and
 * the stance is simply your default there — in, you are squared up; out, you
 * are not. Anything looser (a look-direction test, a big radius) made the pose
 * fire at a distance for no reason a player could see.
 */
export const PUNCH_STANCE_RADIUS = 1.5;
export const PUNCH_STANCE_Y_BAND = 1.6;

/** Feet height above the deck when the system seats you on the mark. */
export const PUNCH_STRIKE_STAND_Y = 0.2;
/**
 * Look-at height for a seated puncher — the bag's hitting face, not the floor
 * ring. Without this, movePlayerTo keeps the previous facing and AIM / stance
 * still tax a player who is standing in the right disc.
 */
export const PUNCH_STRIKE_LOOK_Y = 1.45;
/**
 * Side-step when someone else owns the bag. Outside the stance disc, still on
 * the deck, so the next puncher can take the mark without a body in the way.
 */
export const PUNCH_STRIKE_EVICT_X = 2.4;
export const PUNCH_STRIKE_EVICT_DZ = 1.6;

export function punchStrikeStand(
  centerX: number,
  deckY: number,
  centerZ: number,
): { x: number; y: number; z: number } {
  return {
    x: centerX,
    y: deckY + PUNCH_STRIKE_STAND_Y,
    z: centerZ + PUNCH_STRIKE_Z,
  };
}

export function punchStrikeLook(
  centerX: number,
  deckY: number,
  centerZ: number,
): { x: number; y: number; z: number } {
  return {
    x: centerX,
    y: deckY + PUNCH_STRIKE_LOOK_Y,
    z: centerZ + PUNCH_BAG_Z,
  };
}

export function punchStrikeEvict(
  centerX: number,
  deckY: number,
  centerZ: number,
): { x: number; y: number; z: number } {
  return {
    x: centerX + PUNCH_STRIKE_EVICT_X,
    y: deckY + PUNCH_STRIKE_STAND_Y,
    z: centerZ + PUNCH_STRIKE_Z + PUNCH_STRIKE_EVICT_DZ,
  };
}

/**
 * How many bots watch at once. A dozen shoulder to shoulder read as a mob and
 * jammed each other into spinning. Successive cuts took it to five, then three,
 * then to ONE — and one bot is not an audience, it is a bystander. FOUR is the
 * settled number (the owner's, 2026-09-03), and it suits the arc maths below
 * better than three did: an EVEN count is dealt as two clean wings, so no slot
 * can land dead centre behind the player at all. The four sit at ±34° and
 * ±118°, which at r 2.9 m puts the closest pair 3.24 m apart — nobody shuffles,
 * nobody spins, nobody is standing on anyone. Every human who shows up still
 * takes a bot's place, so a busy deck belongs entirely to people.
 */
export const PUNCH_WATCHERS_MAX = 4;
export const PUNCH_WATCHERS_MIN = 0;
export function punchWatcherCount(humansNear: number): number {
  return Math.max(PUNCH_WATCHERS_MIN, PUNCH_WATCHERS_MAX - Math.max(0, humansNear - 1));
}

/**
 * HOW MANY NPCs THE ISLAND MAY HOLD AT ALL — not just how many are on the arc.
 *
 * The watcher count above only decides who STANDS in the arc; the surplus was
 * parked offstage behind the cabinet, which on a 5.6 m deck is still on screen
 * and still costs an avatar. Ten of them read as a mob on a phone, and one of
 * them stands directly behind the player at the strike spot.
 *
 * Held EQUAL to PUNCH_WATCHERS_MAX on purpose: at four, every bot the island
 * owns has a slot on the arc and nobody is parked offstage, so there is no
 * second crowd milling behind the cabinet.
 *
 * This is the hard ceiling the runtime clamps a saved config down to, so an
 * already-published island with `npc.count: 10` obeys it without a re-publish.
 *
 * ‼️THE CEILING IS ONLY WORTH THE MOMENT IT IS APPLIED. It used to be clamped
 * inside `startPunchMachinePlugin`, which the kernel schedules as `deferred` —
 * several seconds after boot, and `initDanceVenue` spawns the troupe in the
 * SAME TICK as the config load. The number was corrected long after ten bots
 * were already standing on the deck. `clampPunchIslandCrowd` below is called
 * from `loadSocialSystems` BEFORE any of that, which is the only place it can
 * be called and still mean something.
 */
export const PUNCH_ISLAND_CROWD_MAX = 4;

/**
 * THE SHOT CLOCK, MADE IMPOSSIBLE TO MISS.
 *
 * The turn timer had always been running and had always been a 22 px chip in
 * the top rail, which on a phone is a place nobody looks while they are trying
 * to hold a swinging bag. A player who lost a punch to the clock could not tell
 * you the clock existed. Inside this many seconds the countdown becomes a large
 * centred readout AND starts speaking — one tick a second, the last one urgent.
 *
 * Ten, not five: five seconds of warning on a control you have to find, walk to
 * and hold is not warning, it is an announcement of the loss.
 */
export const PUNCH_TURN_COUNTDOWN_S = 10;

/** Below this the countdown is red, the number is biggest and the beat fastest. */
export const PUNCH_TURN_URGENT_S = 5;

/** The shape this clamp needs, and nothing else — it must not import the scene. */
export type PunchIslandCrowdConfig = {
  npc: { count: number; groups?: { count: number }[] };
};

/**
 * Cut a saved island cast down to the ceiling, IN PLACE.
 *
 * In place because the troupe reads the very object the publish loaded, and a
 * copy would be a number nobody looks at. Returns whether it changed anything
 * so a caller can say so in the log.
 */
export function clampPunchIslandCrowd(dance: PunchIslandCrowdConfig): boolean {
  let changed = false;
  if (dance.npc.count > PUNCH_ISLAND_CROWD_MAX) {
    dance.npc.count = PUNCH_ISLAND_CROWD_MAX;
    changed = true;
  }
  for (const group of dance.npc.groups ?? []) {
    if (group.count > PUNCH_ISLAND_CROWD_MAX) {
      group.count = PUNCH_ISLAND_CROWD_MAX;
      changed = true;
    }
  }
  return changed;
}

/**
 * Spectator offsets from the STRIKE SPOT, as an arc BEHIND and beside the
 * player. Angles run from straight-behind, and the arc stops at ±118°, so a
 * 124° wedge toward the machine stays clear: nobody stands between the player
 * and the bag, and nobody crowds their elbows. Slots are ≥2.7 m apart at the
 * default radius, which is what stops the shuffling and spinning.
 */
export const PUNCH_WATCHER_CENTRE_GAP_DEG = 34;
export function punchWatcherSlot(
  index: number,
  total: number,
  radius = 2.9,
): { dx: number; dz: number } {
  const span = 118;
  const count = Math.max(1, total);
  // Index is clamped, not trusted: callers hand this a BOT INDEX as often as a
  // slot number, and an index past the count used to run the old parameter past
  // 1 and throw that bot outside the arc entirely.
  const i = Math.max(0, Math.min(count - 1, Math.floor(index)));
  // ★ NOBODY STANDS DEAD CENTRE BEHIND THE PLAYER.
  //
  // The old spread put the middle slot of an odd crowd at exactly 0° — 2.9 m
  // directly behind whoever is at the bag, in the one place a third-person
  // camera looks straight through. Every player read that as somebody standing
  // on their shoulder, and on a phone (short draw distance, wide FOV) it read
  // as a second copy of themselves.
  //
  // So the arc is dealt as two wings out of a centre gap: alternate sides, each
  // side stepping outward, and the innermost pair starts at the gap rather than
  // at the middle. Same even half-ring to look at, sight line behind the player
  // kept clear, and at the island's three watchers no two are closer than 3.2 m.
  const half = Math.ceil(count / 2);
  const side = i % 2 === 0 ? -1 : 1;
  const rank = Math.floor(i / 2);
  const f = half <= 1 ? 0 : rank / (half - 1);
  const deg =
    side * (PUNCH_WATCHER_CENTRE_GAP_DEG + (span - PUNCH_WATCHER_CENTRE_GAP_DEG) * f);
  const rad = (deg * Math.PI) / 180;
  return { dx: Math.sin(rad) * radius, dz: Math.cos(rad) * radius };
}

/**
 * Where the bots nobody needs go: behind the cabinet, out of the sight line
 * from the strike spot to the bag. Machine-root metres. The cabinet occupies
 * roughly x ±1.1, z -2.0..0.8, so these sit clear of it and of the barrier.
 */
export const PUNCH_OFFSTAGE_SPOTS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -2.7, z: -2.5 },
  { x: 2.7, z: -2.5 },
  { x: -3.7, z: -1.1 },
  { x: 3.7, z: -1.1 },
  { x: -1.3, z: -3.4 },
  { x: 1.3, z: -3.4 },
  { x: -3.9, z: 0.6 },
  { x: 3.9, z: 0.6 },
];

/**
 * ‼️THE HOUSE RIG — REAL, AIMED LIGHT ON THE CABINET AND ON THE PEOPLE.
 *
 * Everything glowing on this machine is EMISSIVE material: it looks lit from
 * any distance and it illuminates NOTHING. Under a dark sky, and on mobile
 * where the ambient term is weaker again, that leaves the cabinet and everyone
 * around it reading as flat grey shapes — owner, 2026-09-08: *"this whole scene
 * is not lit at all… we need spotlighting so that no matter what the weather or
 * the time of day, the machine colours are proper and look warm and clean and
 * bright."*
 *
 * Four unaimed POINT lamps used to hang here and they were the right idea at
 * the wrong aperture: a point light at 9000 cd spends most of its budget on the
 * sky. This is the same fixture count as a small stage rig and it is AIMED —
 * each lamp names the spot it is pointed at, in machine-root metres, and the
 * runtime derives the rotation from the vector (see `spawnIslandLights`). A
 * cone puts the candela on the cabinet face instead of scattering it.
 *
 * THE BUDGET IS THE DESIGN. The Explorer keeps only the nearest 4–10 lights in
 * a scene and silently drops the rest, so the list stays at SIX: a key on the
 * cabinet, two coloured kickers for the silhouette, two TUNGSTEN house lamps
 * that light the deck itself (front and back), and one over the spectator arc.
 * `shadow: false` on every one — a shadow map per lamp is the expensive half
 * and none of this is a shadow effect. The scene's only shadows are the sun's,
 * which is why `punchSkyFixedTime()` exists below.
 *
 * ★★★ AND HALF OF THIS RIG MUST POINT AT THE FLOOR, NOT AT THE MACHINE. The
 * first version aimed everything at the cabinet and the arc and left the deck
 * itself unlit; at midnight that reads as a lit machine standing in a blackout
 * (owner, 2026-09-09). A room is lit when its FLOOR is lit. See HOUSE and
 * HOUSE BACK below.
 *
 * Machine-root metres, Y up, +Z is the FRONT of the cabinet (the parts are
 * authored facing -Z and the whole cabinet is turned by
 * `PUNCH_CABINET_FACE_DEG`, so the player stands at +Z).
 */
export interface PunchLamp {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /**
   * What the beam is pointed AT, machine-root metres. Present = a spotlight
   * whose rotation the runtime derives from (aim - position); absent = an omni
   * point lamp, which is right only for a soft fill.
   */
  readonly aim?: { readonly x: number; readonly y: number; readonly z: number };
  /** Cone angles in degrees. Read only when `aim` is present. */
  readonly innerDeg?: number;
  readonly outerDeg?: number;
  /** 0..1 linear RGB. */
  readonly color: { readonly r: number; readonly g: number; readonly b: number };
  readonly candela: number;
  readonly rangeM: number;
}

export const PUNCH_ISLAND_LAMPS: ReadonlyArray<PunchLamp> = [
  // KEY — warm white, high and in front, aimed down the face of the cabinet and
  // through the bag. This is the lamp that decides what colour the machine is.
  {
    x: 0,
    y: 6.2,
    z: 3.6,
    aim: { x: 0, y: 1.6, z: -0.2 },
    innerDeg: 24,
    outerDeg: 52,
    color: { r: 1, g: 0.93, b: 0.8 },
    candela: 24000,
    rangeM: 18,
  },
  // ★★★ HOUSE — THE ARENA'S OWN ELECTRICITY. The lamp this rig was missing.
  //
  // Owner, 2026-09-09: *"it feels like there's only one lighting source, the
  // moonlight from the back… as if you have an electricity outage and the
  // machine is running on the battery. There is no internal soft or yellow
  // light around it. The arena needs to be lit by its own light source, not by
  // the moon."*
  //
  // The five lamps that stood here before were all aimed AT THE CABINET or at
  // the arc, in near-white and in the cabinet's own cyan and gold. Not one of
  // them washed the DECK, and the soft one — a 4200 cd point, a quarter of the
  // SDK's own default — was too weak to register at midnight, where the
  // Explorer's ambient term is nearly nothing. So the machine glowed, the floor
  // stayed black, and the only thing shaping a body was the moon behind it.
  // That is a torch in a power cut, exactly as reported.
  //
  // This is a TUNGSTEN lamp — 2700 K, not stage white — hung over the strike
  // spot at lamp-post height, unaimed on purpose so it spills onto the floor,
  // the player, the watchers and the underside of the cabinet at once. The
  // warmth is the message: warm light is mains light, and a warm floor under a
  // cold moon is what makes the dark AROUND the deck read as chosen.
  //
  // ★ It is also the lamp NEAREST the player, and that is deliberate. The
  // Explorer keeps only the closest 4–10 lights and a phone sits at the bottom
  // of that range, so on the device the owner actually plays on, this is the
  // one lamp that can never be the one dropped.
  {
    x: 0,
    y: 4.3,
    z: 1.9,
    color: { r: 1, g: 0.74, b: 0.44 },
    candela: 15000,
    rangeM: 12,
  },
  // HOUSE BACK — the same tungsten, aimed at the FLOOR behind the cabinet.
  //
  // The back half of the deck is where the complaint starts: it is the half the
  // moon rakes, the half the arena screen shades, and the half no fixture ever
  // pointed at. Aiming at the floor rather than at the machine is the whole
  // point of it — a lamp aimed at a cabinet lights a cabinet, and a deck is
  // only lit when something is pointed at the deck.
  {
    x: 0,
    y: 5.4,
    z: -3,
    aim: { x: 0, y: 0.15, z: -3.2 },
    innerDeg: 44,
    outerDeg: 86,
    color: { r: 1, g: 0.78, b: 0.5 },
    candela: 11000,
    rangeM: 13,
  },
  // KICKER LEFT — the cabinet's cyan, from behind and above, aimed back at the
  // shoulder of the machine so the silhouette separates from the sky rather
  // than sinking into it at night.
  {
    x: -3.4,
    y: 4.9,
    z: -2.4,
    aim: { x: -0.5, y: 2.0, z: -0.3 },
    innerDeg: 28,
    outerDeg: 60,
    color: { r: 0.2, g: 0.91, b: 0.95 },
    candela: 9500,
    rangeM: 14,
  },
  // KICKER RIGHT — the cabinet's gold, mirrored.
  {
    x: 3.4,
    y: 4.9,
    z: -2.4,
    aim: { x: 0.5, y: 2.0, z: -0.3 },
    innerDeg: 28,
    outerDeg: 60,
    color: { r: 1, g: 0.82, b: 0.35 },
    candela: 9500,
    rangeM: 14,
  },
  // CROWD — a wide wash over the spectator arc behind the strike spot. Without
  // it the people watching stand in the dark while only the machine is lit, and
  // the arc is where half the game's audience is.
  //
  // ‼️IT USED TO AIM OFF THE ISLAND. The old aim point was z 5.2 and the deck
  // stops at PUNCH_DECK_RADIUS 4.85, so the brightest part of the cone landed
  // on empty sky past the rope while the watchers — who stand on a 2.9 m arc
  // out of PUNCH_STRIKE_Z, i.e. z 1.4 to about 4.2 — caught only its edge. It
  // is pulled back onto the deck and dropped to knee height so the cone takes
  // the FLOOR the crowd stands on as well as the crowd, and warmed to match the
  // house: a near-white crowd under a tungsten deck reads as two rooms.
  {
    x: 0,
    y: 5.8,
    z: 4.2,
    aim: { x: 0, y: 0.6, z: 4.6 },
    innerDeg: 34,
    outerDeg: 70,
    color: { r: 1, g: 0.86, b: 0.62 },
    candela: 12000,
    rangeM: 14,
  },
];

/**
 * THE FESTOON IS RETIRED - THE ARENA IS LIT BY LAMPS ALONE.
 *
 * Eleven emissive bulbs used to hang on the front arc of the rope here, on the
 * theory that light with no visible source reads as no light at all. In world
 * they did not read as a strung festoon: a `LightSource` has no body and
 * neither does a bare emissive sphere, so what the owner saw at midnight was
 * eleven white balls floating in the air round the deck with no wire, no
 * fitting and nothing holding them up (owner, 2026-09-09: "I don't want to see
 * the actual lamps floating").
 *
 * THEY LIT NOTHING, SO REMOVING THEM COSTS NO BRIGHTNESS. All six real
 * fixtures are in `PUNCH_ISLAND_LAMPS` above and are untouched - HOUSE and
 * HOUSE BACK still put tungsten on the floor. Only the decoration is gone.
 *
 * If a visible source is ever wanted again it needs a BODY, not a brighter
 * sphere: bulbs capped onto the modelled rope posts, or a dark cable arc drawn
 * between them. A glowing ball on its own will float no matter how small it is.
 */

/**
 * ‼️THE SUN IS THE ONLY THING IN THIS SCENE THAT CASTS A SHADOW.
 *
 * Owner, 2026-09-08: *"there are some weird shadows if you choose the wrong
 * time of day."* Every lamp above carries `shadow: false`, so nothing we hang
 * can produce one; what the owner is seeing is the Explorer's directional sun
 * at a low angle, raking long hard shadows across a deck that is 80 m up with
 * nothing around it to break them up.
 *
 * A scene cannot turn that sun off, but it CAN say what hour it is standing in.
 * `SkyboxTime` pins the cycle for everyone in the scene. The Championship is a
 * night venue: its neon, lightning, screen flashes and cabinet lamps are all
 * authored against a dark sky. Zero is Decentraland midnight.
 *
 * ‼️IT IS A DEFAULT, NOT A LOCK. A venue that has deliberately published
 * `timeOfDay: club | night | sunset` has made a choice, and this must not
 * overrule it — see `applyDayNight` in effects/admin-fx, which owns that lock.
 * This value is only ever applied when nothing else has claimed the sky.
 */
export const PUNCH_SKY_FIXED_TIME_S = 0;

/** Idle bag spin, degrees per second — the clock the seam secret reads. */
export const PUNCH_BAG_SPIN_DPS = 24;

/**
 * The hidden seam bonus: release while the bag's seam faces the player and the
 * aim channel is boosted up to 8%. Riding accuracy01 keeps solo, the
 * coordinator and spectators in agreement without touching the score contract.
 * yawDeg is the bag's idle rotation at the release moment; the window is
 * ±24° — at 24°/s the seam "faces you" for two seconds of each 15 s turn.
 */
export function punchSeamBoost(yawDeg: number): number {
  const off = Math.abs((((yawDeg % 360) + 540) % 360) - 180); // 180 = seam front
  const window = 24;
  if (off > window) return 1;
  return 1 + 0.08 * (1 - off / window);
}

/**
 * The Knock (second secret): tap 1-3-1 at the machine and the NEXT punch's
 * release marker is pulled 40% toward the sweet spot. Rides the submitted
 * timingMarker01 — same law as the seam: fold into the scoring inputs, never
 * the contract, so solo, the coordinator and spectators stay in agreement.
 */
export function punchKnockAssist(marker01: number, target01: number): number {
  const m = Math.max(0, Math.min(1, marker01));
  return target01 + (m - target01) * 0.6;
}

/**
 * The Twist (third secret): hold F through the charge and the wrist locks —
 * the held time is pulled 40% toward the ideal charge. Power plateaus at
 * ideal, so this is a safety net for an early release, not a ceiling raise:
 * the seam owns the ceiling, the knock owns consistency, the twist owns the
 * floor. Rides heldMs.
 */
export function punchTwistAssist(heldMs: number, idealChargeMs: number): number {
  const held = Math.max(0, heldMs);
  if (held >= idealChargeMs) return held;
  return idealChargeMs + (held - idealChargeMs) * 0.6;
}
