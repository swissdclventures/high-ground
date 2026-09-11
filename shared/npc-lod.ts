/**
 * NPC presence LOD — the host caps how many AvatarShapes are alive.
 *
 * The recipe may author 100 people. Explorer only renders the nearest
 * `liveCap`. Far bots keep a Transform (the crowd still walks) but drop the
 * wearable mesh. Landing among the plaza crowd still works: those people are
 * the nearest.
 *
 * Hysteresis (nearM / farM) stops flicker at the ring.
 */
export const NPC_LOD = {
  /** Concurrent AvatarShapes when you are alone. Above this, mobile hitch-recovers. */
  liveCap: 28,
  /** Floor when the plaza is full of real guests. Humans are the crowd. */
  minLiveCap: 8,
  /** Not-yet-live bots become eligible inside this radius (metres). */
  nearM: 32,
  /** Already-live bots stay until they walk past this (metres). */
  farM: 44,
  /** AvatarShapes created on a later troupe tick. */
  promotePerTick: 3,
  /** First wave — plaza crowd in the player's face. */
  promoteOnLanding: 20,
  /**
   * A live bot keeps its slot unless a newcomer is closer by at least this.
   * Below it the cut line churned through the crowd every tick.
   */
  swapMarginM: 6,
} as const;

export interface NpcLodAgent {
  id: number;
  dist: number;
  live: boolean;
  /** Center-stage / scrap / other must-render. Counts against the cap. */
  pin?: boolean;
}

export function npcLodEligible(
  dist: number,
  currentlyLive: boolean,
  nearM: number = NPC_LOD.nearM,
  farM: number = NPC_LOD.farM
): boolean {
  return dist <= (currentlyLive ? farM : nearM);
}

/**
 * Closest eligible agents, pinned first, never more than `cap` — and STICKY.
 *
 * The distance hysteresis only protects the far ring. When a plaza holds more
 * people than the cap (50 in a crowd, 28 slots), the cut line runs THROUGH the
 * crowd, and a hard sort by distance re-decides it every tick as people
 * shuffle: one avatar vanishes and another materialises where you were
 * looking, with a different name and a different body. That is the "names
 * keep rotating, first a girl then a boy" report.
 *
 * So a bot that is already live keeps its slot unless a newcomer is closer by
 * more than `swapMarginM`. Slots still flow toward the player; they just stop
 * churning over centimetres.
 */
export function pickNpcLodLive(
  agents: readonly NpcLodAgent[],
  cap: number = NPC_LOD.liveCap,
  nearM: number = NPC_LOD.nearM,
  farM: number = NPC_LOD.farM,
  swapMarginM: number = NPC_LOD.swapMarginM
): number[] {
  const pinned = agents.filter((agent) => agent.pin).map((agent) => agent.id);
  const pinnedSet = new Set(pinned);
  const restCap = Math.max(0, cap - pinned.length);
  const eligible = agents
    .filter(
      (agent) =>
        !pinnedSet.has(agent.id) && npcLodEligible(agent.dist, agent.live, nearM, farM)
    )
    .sort((a, b) => a.dist - b.dist || a.id - b.id);
  const live = eligible.filter((agent) => agent.live);
  const waiting = eligible.filter((agent) => !agent.live);

  // Incumbents first, nearest first. They keep their slots.
  const chosen: NpcLodAgent[] = live.slice(0, restCap);
  // Genuinely free slots go to the nearest newcomers.
  for (const agent of waiting) {
    if (chosen.length >= restCap) break;
    chosen.push(agent);
  }
  // A newcomer may evict the FARTHEST incumbent only if it is clearly closer.
  for (const agent of waiting) {
    if (chosen.includes(agent)) continue;
    let farthestIdx = -1;
    let farthestDist = -Infinity;
    chosen.forEach((c, i) => {
      if (c.live && c.dist > farthestDist) {
        farthestDist = c.dist;
        farthestIdx = i;
      }
    });
    if (farthestIdx < 0) break;
    if (agent.dist + swapMarginM < farthestDist) chosen[farthestIdx] = agent;
    else break; // waiting is sorted: nobody further back can qualify either
  }
  return [...pinned, ...chosen.map((agent) => agent.id)];
}

export function npcLodPromoteBudget(currentlyLive: number): number {
  if (currentlyLive <= 0) return NPC_LOD.promoteOnLanding;
  return NPC_LOD.promotePerTick;
}

/**
 * How many NPC meshes this client may draw. Each nearby real guest is an
 * AvatarShape we cannot LOD, so bots give up their slots.
 */
export function npcLodLiveCap(
  nearbyGuests: number,
  liveCap: number = NPC_LOD.liveCap,
  minLiveCap: number = NPC_LOD.minLiveCap
): number {
  const guests = Math.max(0, Math.floor(nearbyGuests));
  return Math.max(minLiveCap, liveCap - guests);
}

export function countPointsInside(
  points: readonly { x: number; z: number }[],
  origin: { x: number; z: number },
  radiusM: number
): number {
  const r2 = radiusM * radiusM;
  let n = 0;
  for (const point of points) {
    const dx = point.x - origin.x;
    const dz = point.z - origin.z;
    if (dx * dx + dz * dz <= r2) n += 1;
  }
  return n;
}

export function npcLodDiff(
  wantLive: readonly number[],
  currentlyLive: readonly number[],
  maxPromote: number
): { promote: number[]; demote: number[] } {
  const want = new Set(wantLive);
  const have = new Set(currentlyLive);
  const demote = currentlyLive.filter((id) => !want.has(id));
  const promote = wantLive.filter((id) => !have.has(id)).slice(0, Math.max(0, maxPromote));
  return { promote, demote };
}
