/**
 * Crowd walk steering — keeps NPC walk PATHS out of the baked no-go discs
 * (amphitheatre tiers, benches, statues, columns).
 *
 * Targets were already nudged clear of mesh (clearSpawnComposerXZ), but bots
 * walked to them in a straight lerp — passing THROUGH anything in between, which
 * read as ghosts strolling through the seating. This module makes each step
 * disc-aware: straight when clear, sliding along a disc's tangent when the step
 * would enter one. Pure 2D math (no SDK imports) so it unit-tests in vitest and
 * runs identically in the scene runtime.
 *
 * Discs and positions must share ONE coordinate space — the runtime converts
 * the baked composer-local discs to scene space once, then steers in scene space.
 */

export interface SteerDisc {
  x: number;
  z: number;
  r: number;
  /** Capsule endpoint — wall/glass segment when set with `z2`. */
  x2?: number;
  z2?: number;
  /** Optional AABB half-extents. When both are set, this blocker is a rectangle. */
  hx?: number;
  hz?: number;
}

/** Personal space added around every disc so avatars skirt visibly clear of mesh. */
export const STEER_CLEARANCE_M = 0.35;

function boxHalf(d: SteerDisc): { hx: number; hz: number } | null {
  if (d.hx != null && d.hz != null && d.hx > 0 && d.hz > 0) return { hx: d.hx, hz: d.hz };
  return null;
}

function closestOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): { x: number; z: number; dist: number } {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  const t =
    len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / len2));
  const x = ax + t * abx;
  const z = az + t * abz;
  return { x, z, dist: Math.hypot(px - x, pz - z) };
}

function firstBlockingDisc(
  x: number,
  z: number,
  discs: readonly SteerDisc[]
): SteerDisc | null {
  for (const d of discs) {
    if (d.x2 != null && d.z2 != null && Number.isFinite(d.x2) && Number.isFinite(d.z2)) {
      const c = closestOnSegment(x, z, d.x, d.z, d.x2, d.z2);
      if (c.dist < d.r + STEER_CLEARANCE_M) return d;
      continue;
    }
    const r = boxHalf(d) ? Math.hypot(d.hx!, d.hz!) : d.r;
    if (Math.hypot(x - d.x, z - d.z) < r + STEER_CLEARANCE_M) return d;
  }
  return null;
}

export function insideAnyDisc(x: number, z: number, discs: readonly SteerDisc[]): boolean {
  return firstBlockingDisc(x, z, discs) !== null;
}

export function projectOutOfDiscs(
  x: number,
  z: number,
  discs: readonly SteerDisc[]
): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 4; pass++) {
    const d = firstBlockingDisc(px, pz, discs);
    if (!d) break;
    if (d.x2 != null && d.z2 != null) {
      const c = closestOnSegment(px, pz, d.x, d.z, d.x2, d.z2);
      const dx = px - c.x;
      const dz = pz - c.z;
      const len = Math.hypot(dx, dz);
      const want = d.r + STEER_CLEARANCE_M + 0.05;
      if (len < 0.01) {
        const sx = d.x2 - d.x;
        const sz = d.z2 - d.z;
        const slen = Math.hypot(sx, sz) || 1;
        px = c.x + (-sz / slen) * want;
        pz = c.z + (sx / slen) * want;
      } else {
        px = c.x + (dx / len) * want;
        pz = c.z + (dz / len) * want;
      }
      continue;
    }
    const r = boxHalf(d) ? Math.hypot(d.hx!, d.hz!) : d.r;
    const dx = px - d.x;
    const dz = pz - d.z;
    const len = Math.hypot(dx, dz);
    const want = r + STEER_CLEARANCE_M + 0.05;
    if (len < 0.01) {
      px = d.x + want;
      pz = d.z;
    } else {
      px = d.x + (dx / len) * want;
      pz = d.z + (dz / len) * want;
    }
  }
  return { x: px, z: pz };
}

/**
 * One walk step from `pos` toward `target`, at most `stepLen` long, never ending
 * inside a disc. When the straight step would enter a disc, the bot slides along
 * that disc's tangent (the side that keeps progress toward the target, with a
 * slight outward bias so it rounds the rim instead of hugging it). Returns the
 * current position unchanged when boxed in (bot pauses rather than clips).
 */
export function steerStep(
  pos: { x: number; z: number },
  target: { x: number; z: number },
  discs: readonly SteerDisc[],
  stepLen: number
): { x: number; z: number } {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return { x: pos.x, z: pos.z };
  const step = Math.min(dist, stepLen);
  const dirX = dx / dist;
  const dirZ = dz / dist;

  const straight = { x: pos.x + dirX * step, z: pos.z + dirZ * step };
  const hit = firstBlockingDisc(straight.x, straight.z, discs);
  if (!hit) return straight;

  let discHit = hit;
  if (hit.x2 != null && hit.z2 != null) {
    const c = closestOnSegment(pos.x, pos.z, hit.x, hit.z, hit.x2, hit.z2);
    const abx = hit.x2 - hit.x;
    const abz = hit.z2 - hit.z;
    const len2 = abx * abx + abz * abz;
    const t =
      len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((pos.x - hit.x) * abx + (pos.z - hit.z) * abz) / len2));
    if (t > 0.02 && t < 0.98) {
      const slen = Math.hypot(abx, abz) || 1;
      const ux = abx / slen;
      const uz = abz / slen;
      const ox = pos.x - c.x;
      const oz = pos.z - c.z;
      const olen = Math.hypot(ox, oz);
      const nx = olen < 0.01 ? -uz : ox / olen;
      const nz = olen < 0.01 ? ux : oz / olen;
      const alongDot = ux * dirX + uz * dirZ;
      const midX = (hit.x + hit.x2) / 2;
      const midZ = (hit.z + hit.z2) / 2;
      const fromMid = (pos.x - midX) * ux + (pos.z - midZ) * uz;
      const along =
        Math.abs(alongDot) >= 0.15 ? Math.sign(alongDot) : Math.abs(fromMid) >= 0.1 ? Math.sign(fromMid) : 1;
      const tryAlong = (sign: number) => {
        const mx = ux * sign + nx * 0.35;
        const mz = uz * sign + nz * 0.35;
        const mlen = Math.hypot(mx, mz) || 1;
        const next = { x: pos.x + (mx / mlen) * step, z: pos.z + (mz / mlen) * step };
        return firstBlockingDisc(next.x, next.z, discs) ? null : next;
      };
      return tryAlong(along) ?? tryAlong(-along) ?? { x: pos.x, z: pos.z };
    }
    discHit = { x: c.x, z: c.z, r: hit.r };
  }

  // Tangent directions around the blocking disc, from the bot's current angle.
  const rx = pos.x - discHit.x;
  const rz = pos.z - discHit.z;
  const rlen = Math.hypot(rx, rz) || 1;
  const outX = rx / rlen;
  const outZ = rz / rlen;
  // Two tangents: (-outZ, outX) and (outZ, -outX); prefer the one aligned with
  // the desired direction so the bot rounds the disc toward the target.
  const candidates =
    -outZ * dirX + outX * dirZ >= 0
      ? [
          { tx: -outZ, tz: outX },
          { tx: outZ, tz: -outX },
        ]
      : [
          { tx: outZ, tz: -outX },
          { tx: -outZ, tz: outX },
        ];

  for (const { tx, tz } of candidates) {
    // Slight outward bias rounds the rim instead of grazing it.
    const mx = tx + outX * 0.35;
    const mz = tz + outZ * 0.35;
    const mlen = Math.hypot(mx, mz) || 1;
    const next = { x: pos.x + (mx / mlen) * step, z: pos.z + (mz / mlen) * step };
    if (!firstBlockingDisc(next.x, next.z, discs)) return next;
  }

  // Both tangents blocked (disc cluster) — try stepping straight out.
  const away = { x: pos.x + outX * step, z: pos.z + outZ * step };
  if (!firstBlockingDisc(away.x, away.z, discs)) return away;
  return { x: pos.x, z: pos.z };
}

/**
 * Repel one proposed walk step from nearby moving agents. This complements
 * static-disc steering: waypoint targets may be shared, but avatar bodies must
 * never collapse into the same point.
 */
export function separateAgentStep(
  botIndex: number,
  pos: { x: number; z: number },
  proposed: { x: number; z: number },
  others: readonly { index: number; x: number; z: number }[],
  minGap = 0.8
): { x: number; z: number } {
  let pushX = 0;
  let pushZ = 0;
  for (const other of others) {
    // Stable right-of-way: lower-index agents keep their line, higher-index
    // agents yield. Symmetric repulsion made both avatars reverse every frame,
    // producing the visible spinning/vibration under dense stress tests.
    if (other.index >= botIndex) continue;
    const dx = proposed.x - other.x;
    const dz = proposed.z - other.z;
    const dist = Math.hypot(dx, dz);
    if (dist >= minGap) continue;
    const strength = minGap - dist;
    if (dist < 0.01) {
      // Stable opposite directions for coincident agents.
      const angle = (botIndex + 1) * 2.399963229728653;
      pushX += Math.cos(angle) * strength;
      pushZ += Math.sin(angle) * strength;
    } else {
      pushX += (dx / dist) * strength;
      pushZ += (dz / dist) * strength;
    }
  }
  if (Math.hypot(pushX, pushZ) < 1e-6) return proposed;

  const stepX = proposed.x - pos.x;
  const stepZ = proposed.z - pos.z;
  const maxStep = Math.max(0.02, Math.hypot(stepX, stepZ));
  const mixedX = stepX + pushX * 0.6;
  const mixedZ = stepZ + pushZ * 0.6;
  const mixedLen = Math.hypot(mixedX, mixedZ) || 1;
  const scale = Math.min(1, maxStep / mixedLen);
  return { x: pos.x + mixedX * scale, z: pos.z + mixedZ * scale };
}

/**
 * Minimum body-to-body gap for two STANDING avatars. Below this the two
 * silhouettes read as one fused person — the overlap glitch. Shoulders are
 * ~0.55 m wide and large wearables add to that, so 0.75 m is the floor.
 */
export const STAND_PERSONAL_M = 0.75;

/**
 * Personal space for an agent that is NOT walking.
 *
 * `separateAgentStep` only ever runs on a walk step, so the moment an agent
 * reaches its target, stops to acknowledge a guest, or is snapped onto a spawn
 * point, nothing keeps it out of its neighbours again. Two agents whose targets
 * land within a body width stand fused forever — the "two avatars on top of each
 * other" glitch.
 *
 * Right-of-way matches the walk pass: the LOWER index keeps its spot, the higher
 * index yields. Symmetric pushes make both avatars vibrate.
 *
 * Returns the settled position, or `null` when the agent is already clear (so
 * the caller can skip the transform write entirely).
 */
export function settleStandingStep(
  agentIndex: number,
  pos: { x: number; z: number },
  others: readonly { index: number; x: number; z: number }[],
  step: number,
  minGap = STAND_PERSONAL_M
): { x: number; z: number } | null {
  if (!(step > 0)) return null;
  let pushX = 0;
  let pushZ = 0;
  for (const other of others) {
    if (other.index >= agentIndex) continue;
    const dx = pos.x - other.x;
    const dz = pos.z - other.z;
    const dist = Math.hypot(dx, dz);
    if (dist >= minGap) continue;
    const strength = minGap - dist;
    if (dist < 0.01) {
      // Deterministic opposite headings for coincident agents — the same golden
      // angle the walk pass uses, so a stack fans out instead of jittering.
      const angle = (agentIndex + 1) * 2.399963229728653;
      pushX += Math.cos(angle) * strength;
      pushZ += Math.sin(angle) * strength;
    } else {
      pushX += (dx / dist) * strength;
      pushZ += (dz / dist) * strength;
    }
  }
  const len = Math.hypot(pushX, pushZ);
  // Deadband — never twitch over a rounding error.
  if (len < 0.02) return null;
  // Never overshoot the gap that is actually missing.
  const move = Math.min(step, len);
  return { x: pos.x + (pushX / len) * move, z: pos.z + (pushZ / len) * move };
}
