/**
 * Motion — one optional attribute that makes a decorative thing move.
 *
 * A mover is a smart entity (`type: "mover"`, `behavior: "motion"`) whose mesh is a
 * custom piece and whose `spec.motion` is a MotionSpec. The Builder exports the piece
 * as its own GLB, exactly like a launch pad or a screen, and the scene runtime drives
 * it with the platform's Tween + TweenSequence — the same primitive that bobs the
 * clouds on the punch island. Canon: docs/city-kit-phase-2-2026-09.md, shelf 1, item 1.
 *
 * Laws:
 *  - A mover never carries a collider. A moving mesh whose collider does not move
 *    with it is a ghost; one that does would carry the avatar, which is a different
 *    feature (elevators). Decorative only.
 *  - Above MOTION_ALWAYS_CAP movers in a scene, the extra ones only move while a
 *    player is near, so a city of windmills stays cheap.
 *  - `phase` is per instance so twenty windmills never turn in step; seeded bulk
 *    edits set it.
 *
 * This file is pure: no three.js, no SDK. `planMotion` returns numbers the runtime
 * maps onto Tween modes, so the plan is testable without either.
 */

export type MotionKind = "spin" | "swing" | "bob" | "slide" | "orbit" | "pulse";
export type MotionAxis = "x" | "y" | "z";
export type MotionEasing = "linear" | "ease_in" | "ease_out" | "ease_in_out" | "bounce";
export type MotionLoop = "repeat" | "yoyo" | "once";
export type MotionTrigger = "always" | "near" | "click";

export const MOTION_KINDS: readonly MotionKind[] = ["spin", "swing", "bob", "slide", "orbit", "pulse"];
export const MOTION_AXES: readonly MotionAxis[] = ["x", "y", "z"];
export const MOTION_EASINGS: readonly MotionEasing[] = ["linear", "ease_in", "ease_out", "ease_in_out", "bounce"];
export const MOTION_LOOPS: readonly MotionLoop[] = ["repeat", "yoyo", "once"];
export const MOTION_TRIGGERS: readonly MotionTrigger[] = ["always", "near", "click"];

/** Movers that may run unconditionally per scene; the rest fall back to `near`. */
export const MOTION_ALWAYS_CAP = 50;
/** Default radius for the `near` trigger, metres. */
export const MOTION_NEAR_RADIUS_M = 24;
/** Bounds that keep a mover legible and cheap. */
export const MOTION_LIMITS = {
  speedDegPerS: { min: 1, max: 720 },
  speedMps: { min: 0.05, max: 20 },
  amplitudeDeg: { min: 1, max: 180 },
  amplitudeM: { min: 0.05, max: 60 },
  pulse: { min: 0.02, max: 2 },
  orbitRadiusM: { min: 0.25, max: 60 },
  nearRadiusM: { min: 4, max: 120 },
} as const;

export interface MotionSpec {
  kind: MotionKind;
  axis: MotionAxis;
  /** +1 or -1: clockwise / up / forward versus the opposite. */
  direction: 1 | -1;
  /** Degrees per second for spin, swing and orbit; metres per second for bob and slide; scale units per second for pulse. */
  speed: number;
  /** Degrees for swing; metres for bob and slide; scale delta (0.15 = grows to 115 %) for pulse. Unused by spin and orbit. */
  amplitude: number;
  easing: MotionEasing;
  loop: MotionLoop;
  /** 0 … 1, where in its first cycle the mover starts. */
  phase: number;
  trigger: MotionTrigger;
  /** Metres, only for `near`. */
  nearRadiusM: number;
  /** Metres, only for `orbit`: distance from the pivot at which the piece circles. */
  orbitRadiusM: number;
}

/** What a kind moves: turning, travelling, or growing. */
export type MotionMode = "rotate" | "move" | "scale";

export function motionMode(kind: MotionKind): MotionMode {
  switch (kind) {
    case "spin":
    case "swing":
    case "orbit":
      return "rotate";
    case "bob":
    case "slide":
      return "move";
    case "pulse":
      return "scale";
  }
}

/** Sensible starting values per kind, so a bare `{ kind: "spin" }` already reads well. */
export function defaultMotionSpec(kind: MotionKind = "spin"): MotionSpec {
  const base: MotionSpec = {
    kind,
    axis: "y",
    direction: 1,
    speed: 30,
    amplitude: 0,
    easing: "linear",
    loop: "repeat",
    phase: 0,
    trigger: "always",
    nearRadiusM: MOTION_NEAR_RADIUS_M,
    orbitRadiusM: 3,
  };
  switch (kind) {
    case "spin":
      return base;
    case "orbit":
      return { ...base, orbitRadiusM: 3 };
    case "swing":
      return { ...base, speed: 20, amplitude: 20, easing: "ease_in_out", loop: "yoyo" };
    case "bob":
      return { ...base, speed: 0.5, amplitude: 0.5, easing: "ease_in_out", loop: "yoyo" };
    case "slide":
      return { ...base, axis: "x", speed: 1, amplitude: 4, easing: "ease_in_out", loop: "yoyo" };
    case "pulse":
      return { ...base, speed: 0.15, amplitude: 0.15, easing: "ease_in_out", loop: "yoyo" };
  }
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Fill every field from the kind's defaults and clamp into the limits. Never throws;
 * use `motionSpecIssue` to tell the author what was out of range.
 */
export function normalizeMotionSpec(raw: unknown): MotionSpec {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = pick(r.kind, MOTION_KINDS, "spin");
  const d = defaultMotionSpec(kind);
  const mode = motionMode(kind);
  const direction: 1 | -1 = num(r.direction, 1) < 0 ? -1 : 1;
  const speedLimit = mode === "rotate" ? MOTION_LIMITS.speedDegPerS : mode === "move" ? MOTION_LIMITS.speedMps : MOTION_LIMITS.pulse;
  const ampLimit = mode === "rotate" ? MOTION_LIMITS.amplitudeDeg : mode === "move" ? MOTION_LIMITS.amplitudeM : MOTION_LIMITS.pulse;
  const usesAmplitude = kind !== "spin" && kind !== "orbit";
  return {
    kind,
    axis: pick(r.axis, MOTION_AXES, d.axis),
    direction,
    speed: clamp(num(r.speed, d.speed), speedLimit.min, speedLimit.max),
    amplitude: usesAmplitude ? clamp(num(r.amplitude, d.amplitude), ampLimit.min, ampLimit.max) : 0,
    easing: pick(r.easing, MOTION_EASINGS, d.easing),
    loop: pick(r.loop, MOTION_LOOPS, d.loop),
    phase: clamp(num(r.phase, 0), 0, 1),
    trigger: pick(r.trigger, MOTION_TRIGGERS, d.trigger),
    nearRadiusM: clamp(num(r.nearRadiusM, d.nearRadiusM), MOTION_LIMITS.nearRadiusM.min, MOTION_LIMITS.nearRadiusM.max),
    orbitRadiusM: clamp(num(r.orbitRadiusM, d.orbitRadiusM), MOTION_LIMITS.orbitRadiusM.min, MOTION_LIMITS.orbitRadiusM.max),
  };
}

/** A quotable reason the raw spec was changed by normalisation, or null when it was taken as written. */
export function motionSpecIssue(raw: unknown): string | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (r.kind !== undefined && !(MOTION_KINDS as readonly unknown[]).includes(r.kind)) {
    return `kind must be one of ${MOTION_KINDS.join(", ")}.`;
  }
  const spec = normalizeMotionSpec(raw);
  if (r.axis !== undefined && r.axis !== spec.axis) return `axis must be x, y or z.`;
  if (r.speed !== undefined && num(r.speed, NaN) !== spec.speed) {
    const mode = motionMode(spec.kind);
    const unit = mode === "rotate" ? "degrees per second" : mode === "move" ? "metres per second" : "scale units per second";
    return `speed ${String(r.speed)} is out of range; it was clamped to ${spec.speed} ${unit}.`;
  }
  if (r.amplitude !== undefined && spec.kind !== "spin" && spec.kind !== "orbit" && num(r.amplitude, NaN) !== spec.amplitude) {
    return `amplitude ${String(r.amplitude)} is out of range; it was clamped to ${spec.amplitude}.`;
  }
  if (r.easing !== undefined && r.easing !== spec.easing) return `easing must be one of ${MOTION_EASINGS.join(", ")}.`;
  if (r.loop !== undefined && r.loop !== spec.loop) return `loop must be repeat, yoyo or once.`;
  if (r.trigger !== undefined && r.trigger !== spec.trigger) return `trigger must be always, near or click.`;
  if (r.phase !== undefined && num(r.phase, NaN) !== spec.phase) return `phase must be between 0 and 1.`;
  return null;
}

/** Seconds for one full cycle: one turn, one there-and-back, one grow-and-shrink. */
export function motionCycleSeconds(spec: MotionSpec): number {
  switch (spec.kind) {
    case "spin":
    case "orbit":
      return 360 / spec.speed;
    case "swing":
    case "bob":
    case "slide":
    case "pulse":
      // there and back
      return (2 * spec.amplitude) / spec.speed;
  }
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type MotionStep =
  | { mode: "rotate"; fromDeg: Vec3; toDeg: Vec3; durationMs: number }
  | { mode: "move"; from: Vec3; to: Vec3; durationMs: number }
  | { mode: "scale"; from: number; to: number; durationMs: number };

export interface MotionPlan {
  kind: MotionKind;
  /** First step plays with `currentTime = phase`; the rest follow in a sequence. */
  steps: MotionStep[];
  loop: MotionLoop;
  easing: MotionEasing;
  phase: number;
  trigger: MotionTrigger;
  nearRadiusM: number;
  /** Only for orbit: where the piece sits relative to the pivot that turns. */
  orbitOffset?: Vec3;
}

export interface MotionBase {
  /** Rest position in the frame the plan is used in. */
  position: Vec3;
  /** Rest yaw in degrees, same frame. */
  rotationYDeg: number;
}

/**
 * Turn a spec into concrete tween steps around a rest pose.
 *
 * `mirrorZ` is the composer→scene mirror the runtime applies to every placed thing:
 * a reflection flips handedness, so a turn about x or y reverses and travel along z
 * reverses, while a turn about z and travel along x or y stay as authored. Pass true
 * in the runtime, false in the Builder preview, and the same authored motion reads
 * the same way in both.
 */
export function planMotion(spec: MotionSpec, base: MotionBase, mirrorZ = false): MotionPlan {
  const dir = spec.direction * (mirrorZ && spec.axis !== "z" && motionMode(spec.kind) === "rotate" ? -1 : 1);
  const travelSign = spec.direction * (mirrorZ && spec.axis === "z" ? -1 : 1);
  const axisVec = (amount: number): Vec3 => ({
    x: spec.axis === "x" ? amount : 0,
    y: spec.axis === "y" ? amount : 0,
    z: spec.axis === "z" ? amount : 0,
  });
  const yaw: Vec3 = { x: 0, y: base.rotationYDeg, z: 0 };
  const addDeg = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const plan: MotionPlan = {
    kind: spec.kind,
    steps: [],
    loop: spec.loop,
    easing: spec.easing,
    phase: spec.phase,
    trigger: spec.trigger,
    nearRadiusM: spec.nearRadiusM,
  };

  switch (spec.kind) {
    case "spin":
    case "orbit": {
      // A quaternion tween takes the shortest path, so a full turn is three thirds:
      // 120° is unambiguous, 180° is not, 360° is nothing.
      const thirdMs = Math.round((120 / spec.speed) * 1000);
      for (let i = 0; i < 3; i++) {
        plan.steps.push({
          mode: "rotate",
          fromDeg: addDeg(yaw, axisVec(dir * 120 * i)),
          toDeg: addDeg(yaw, axisVec(dir * 120 * (i + 1))),
          durationMs: thirdMs,
        });
      }
      if (spec.loop === "yoyo") plan.loop = "repeat"; // a turn has no "back"
      if (spec.kind === "orbit") plan.orbitOffset = { x: spec.orbitRadiusM, y: 0, z: 0 };
      break;
    }
    case "swing": {
      const ms = Math.round(((2 * spec.amplitude) / spec.speed) * 1000);
      plan.steps.push({
        mode: "rotate",
        fromDeg: addDeg(yaw, axisVec(-dir * spec.amplitude)),
        toDeg: addDeg(yaw, axisVec(dir * spec.amplitude)),
        durationMs: ms,
      });
      if (plan.loop === "repeat") plan.loop = "yoyo"; // a swing that restarts snaps
      break;
    }
    case "bob": {
      const ms = Math.round(((2 * spec.amplitude) / spec.speed) * 1000);
      const half = axisVec(travelSign * spec.amplitude);
      plan.steps.push({
        mode: "move",
        from: { x: base.position.x - half.x, y: base.position.y - half.y, z: base.position.z - half.z },
        to: { x: base.position.x + half.x, y: base.position.y + half.y, z: base.position.z + half.z },
        durationMs: ms,
      });
      if (plan.loop === "repeat") plan.loop = "yoyo";
      break;
    }
    case "slide": {
      const ms = Math.round((spec.amplitude / spec.speed) * 1000);
      const d = axisVec(travelSign * spec.amplitude);
      plan.steps.push({
        mode: "move",
        from: { ...base.position },
        to: { x: base.position.x + d.x, y: base.position.y + d.y, z: base.position.z + d.z },
        durationMs: ms,
      });
      break;
    }
    case "pulse": {
      const ms = Math.round((spec.amplitude / spec.speed) * 1000);
      plan.steps.push({ mode: "scale", from: 1, to: 1 + spec.amplitude, durationMs: ms });
      if (plan.loop === "repeat") plan.loop = "yoyo";
      break;
    }
  }
  return plan;
}

/**
 * Which movers may run unconditionally. The first `MOTION_ALWAYS_CAP` `always` movers
 * keep their trigger; the rest are demoted to `near`. Order is the authored order, so
 * the result is stable across loads.
 */
export function effectiveTriggers(specs: readonly MotionSpec[]): MotionTrigger[] {
  let always = 0;
  return specs.map((spec) => {
    if (spec.trigger !== "always") return spec.trigger;
    always += 1;
    return always <= MOTION_ALWAYS_CAP ? "always" : "near";
  });
}

/** One line a panel or an agent can read back. */
export function describeMotion(spec: MotionSpec): string {
  const mode = motionMode(spec.kind);
  const unit = mode === "rotate" ? "°/s" : mode === "move" ? " m/s" : "/s";
  const amp =
    spec.kind === "spin" || spec.kind === "orbit"
      ? spec.kind === "orbit"
        ? ` at ${spec.orbitRadiusM} m`
        : ""
      : ` by ${spec.amplitude}${mode === "rotate" ? "°" : mode === "move" ? " m" : ""}`;
  const dir = spec.direction < 0 ? " reversed" : "";
  const when = spec.trigger === "always" ? "" : spec.trigger === "near" ? ` when a player is within ${spec.nearRadiusM} m` : " on click";
  return `${spec.kind} about ${spec.axis}${amp} at ${spec.speed}${unit}${dir}, ${spec.easing}, ${spec.loop}${when}`;
}
