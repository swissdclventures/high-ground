/**
 * Custom pieces — AI-generated furniture as PRIMITIVE ASSEMBLIES (boxes, cylinders,
 * wedges, spheres, planes), the DCL-honest answer to "create a futuristic club bar
 * from a prompt". The model composes parts inside a strict budget; it never emits raw
 * meshes. Pieces live on BuildingConfig.customPieces so they persist through drafts/
 * recipes and are placeable + reusable exactly like catalog modules.
 */

export type CustomPieceShape =
  | "box"
  | "cylinder"
  | "wedge"
  | "sphere"
  | "plane"
  | "ngon"
  | "arch";

export type CustomPieceFinish = "matte" | "satin" | "metal" | "glass";

export type CustomPieceSurface = "flat" | "wood" | "brushed_metal" | "fabric" | "screen";

export type CustomPieceSegments = 8 | 16 | 24;

export interface CustomPiecePart {
  shape: CustomPieceShape;
  /** Box/wedge: width. Cylinder/sphere: diameter. Plane: width. */
  w: number;
  h: number;
  /** Box/wedge depth. Cylinder: ignored. Plane: height. */
  d: number;
  /** Cylinder length axis: "y" upright (default), "x"/"z" lying down. */
  axis?: "x" | "y" | "z";
  /** Part center offset from the piece origin (y measured up from the floor). */
  x: number;
  y: number;
  z: number;
  rotYDeg?: number;
  color: string; // #rrggbb
  /** Link this part to a building preset material instead of its own `color`:
   * "wall" renders with the shell's solid-wall material, "glass" with the shared
   * facade glass (so the Look color/opacity/shine controls restyle it live and it
   * exports with the building's look). `color` stays as the fallback where the
   * preset system isn't available. */
  buildingMaterial?: "wall" | "glass";
  /** Emissive glow hex — neon strips, screens. Omit for matte. */
  emissive?: string;
  finish?: CustomPieceFinish;
  surface?: CustomPieceSurface;
  /** Cylinder/sphere radial segments — default 16 / 8. */
  segments?: CustomPieceSegments;
  /** ngon: flat side count (3–8) — hexagonal columns, faceted drums.
   * arch: curve facet count (2–8) — voussoirs in the arched top.
   * An intentional low-poly form; ignored for every other shape. */
  sides?: number;
}

export interface CustomPiece {
  id: string; // "custom_<slug>"
  name: string;
  parts: CustomPiecePart[];
}

// Structure-scale budget: pieces are no longer only furniture.
export const CUSTOM_PIECE_MAX_PARTS = 64;
export const CUSTOM_PIECE_MAX_DIM_M = 20;
export const CUSTOM_PIECE_MAX_TRIS = 4000;

/** Soft AI furniture budget (prompt + client context). */
export const CUSTOM_PIECE_SOFT_MAX_PARTS = 20;
export const CUSTOM_PIECE_SOFT_MAX_TRIS = 1400;

const TRIS_PER_BOX = 12;
const TRIS_PER_WEDGE = 12; // triangular prism (3-segment cylinder)
const TRIS_PER_PLANE = 4; // double-sided plane mesh

const SHAPES: CustomPieceShape[] = [
  "box",
  "cylinder",
  "wedge",
  "sphere",
  "plane",
  "ngon",
  "arch",
];

/** ngon side-count range — 3 (triangular prism) … 8 (octagonal). */
export const NGON_MIN_SIDES = 3;
export const NGON_MAX_SIDES = 8;
export const NGON_DEFAULT_SIDES = 6;

/** arch curve facet range — 2 (blocky) … 8 (smooth). */
export const ARCH_MIN_SIDES = 2;
export const ARCH_MAX_SIDES = 8;
export const ARCH_DEFAULT_SIDES = 4;
const FINISHES: CustomPieceFinish[] = ["matte", "satin", "metal", "glass"];
const SURFACES: CustomPieceSurface[] = ["flat", "wood", "brushed_metal", "fabric", "screen"];
const SEGMENTS: CustomPieceSegments[] = [8, 16, 24];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Fallback when AI emits an unparseable color — keep the module, don't reject. */
export const DEFAULT_PART_COLOR = "#888888";

/** Common CSS / design-tool named colors the model often emits instead of hex. */
const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  orange: "#ffa500",
  purple: "#800080",
  pink: "#ffc0cb",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  gold: "#ffd700",
  navy: "#000080",
  teal: "#008080",
  lime: "#00ff00",
  olive: "#808000",
  maroon: "#800000",
  aqua: "#00ffff",
  fuchsia: "#ff00ff",
  coral: "#ff7f50",
  crimson: "#dc143c",
  indigo: "#4b0082",
  violet: "#ee82ee",
  turquoise: "#40e0d0",
  chocolate: "#d2691e",
  beige: "#f5f5dc",
  ivory: "#fffff0",
  snow: "#fffafa",
  transparent: "#000000",
};

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function channelToByte(raw: string): number {
  const s = raw.trim();
  if (s.endsWith("%")) {
    return clampByte((parseFloat(s) / 100) * 255);
  }
  const n = parseFloat(s);
  // Models sometimes emit 0–1 floats instead of 0–255.
  if (n >= 0 && n <= 1 && !/^\d+$/.test(s)) return clampByte(n * 255);
  return clampByte(n);
}

function bytesToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Coerce common AI color spellings into `#rrggbb`.
 * Accepts hex (#rgb / #rrggbb / #rrggbbaa / bare rrggbb), css rgb()/rgba()/hsl(),
 * named colors, "r,g,b", [r,g,b], and {r,g,b}. Returns null when unparseable.
 */
export function coerceHexColor(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Packed 0xRRGGBB integer
    const n = Math.max(0, Math.min(0xffffff, Math.round(raw)));
    return `#${n.toString(16).padStart(6, "0")}`;
  }
  if (typeof raw === "string") {
    let s = raw.trim().replace(/^['"]|['"]$/g, "");
    if (!s) return null;
    const named = NAMED_COLORS[s.toLowerCase()];
    if (named) return named;
    // 0xRRGGBB / 0xRGB
    if (/^0x[0-9a-fA-F]{3,8}$/i.test(s)) s = `#${s.slice(2)}`;
    if (HEX.test(s)) return s.toLowerCase();
    const short = /^#([0-9a-fA-F]{3})$/.exec(s);
    if (short) {
      const [r, g, b] = short[1]!;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    const long = /^#([0-9a-fA-F]{8})$/.exec(s);
    if (long) return `#${long[1]!.slice(0, 6)}`.toLowerCase();
    // Bare hex without '#'
    if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
    if (/^[0-9a-fA-F]{3}$/.test(s)) {
      const [r, g, b] = s;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    const rgb = /^rgba?\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,/)]+)(?:\s*[,/]\s*[^)]+)?\s*\)$/i.exec(s);
    if (rgb) return bytesToHex(channelToByte(rgb[1]!), channelToByte(rgb[2]!), channelToByte(rgb[3]!));
    // rgb 255 0 0 / RGB: 255,0,0
    const rgbLoose = /^rgba?\s*:?\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*$/i.exec(s);
    if (rgbLoose)
      return bytesToHex(channelToByte(rgbLoose[1]!), channelToByte(rgbLoose[2]!), channelToByte(rgbLoose[3]!));
    const hsl = /^hsla?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?(?:[,/][^)]+)?\s*\)$/i.exec(s);
    if (hsl) {
      const h = ((parseFloat(hsl[1]!) % 360) + 360) % 360;
      const sat = Math.max(0, Math.min(1, parseFloat(hsl[2]!) / 100));
      const lit = Math.max(0, Math.min(1, parseFloat(hsl[3]!) / 100));
      const c = (1 - Math.abs(2 * lit - 1)) * sat;
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = lit - c / 2;
      let r = 0,
        g = 0,
        b = 0;
      if (h < 60) [r, g, b] = [c, x, 0];
      else if (h < 120) [r, g, b] = [x, c, 0];
      else if (h < 180) [r, g, b] = [0, c, x];
      else if (h < 240) [r, g, b] = [0, x, c];
      else if (h < 300) [r, g, b] = [x, 0, c];
      else [r, g, b] = [c, 0, x];
      return bytesToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
    }
    const csv = /^\[?\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*\]?$/.exec(s);
    if (csv) return bytesToHex(channelToByte(csv[1]!), channelToByte(csv[2]!), channelToByte(csv[3]!));
    return null;
  }
  if (Array.isArray(raw) && raw.length >= 3) {
    const [r, g, b] = raw;
    if ([r, g, b].every((v) => typeof v === "number" || (typeof v === "string" && v.trim() !== ""))) {
      return bytesToHex(channelToByte(String(r)), channelToByte(String(g)), channelToByte(String(b)));
    }
    return null;
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const r = o.r ?? o.R ?? o.red;
    const g = o.g ?? o.G ?? o.green;
    const b = o.b ?? o.B ?? o.blue;
    if ([r, g, b].every((v) => typeof v === "number" || typeof v === "string")) {
      return bytesToHex(channelToByte(String(r)), channelToByte(String(g)), channelToByte(String(b)));
    }
  }
  return null;
}

/**
 * Normalize part color / emissive for AI / import payloads.
 * Unparseable colors fall back to DEFAULT_PART_COLOR so modules are not rejected for color alone.
 */
export function normalizePartColors<T extends { color?: unknown; emissive?: unknown }>(part: T): T {
  const out: T & { color?: unknown; emissive?: unknown } = { ...part };
  out.color = coerceHexColor(part.color) ?? DEFAULT_PART_COLOR;
  if (part.emissive === null || part.emissive === undefined || part.emissive === "") {
    delete out.emissive;
  } else {
    const emissive = coerceHexColor(part.emissive);
    if (emissive) out.emissive = emissive;
    else delete out.emissive;
  }
  return out;
}

function defaultSegments(shape: CustomPieceShape): CustomPieceSegments {
  return shape === "sphere" ? 8 : 16;
}

function resolvedSegments(part: CustomPiecePart): CustomPieceSegments {
  if (part.segments !== undefined) return part.segments;
  return defaultSegments(part.shape);
}

/** CylinderGeometry: 4 × radial segments (sides + two caps). */
export function cylinderTris(segments: number): number {
  return 4 * segments;
}

/** ngon prism (built as a low-side CylinderGeometry): 4 × sides. A hexagon is
 * 24 tris vs a 16-segment cylinder's 64 — the triangle-economy win. */
export function ngonTris(sides: number): number {
  return 4 * Math.max(NGON_MIN_SIDES, Math.min(NGON_MAX_SIDES, Math.round(sides)));
}

export function resolvedNgonSides(part: CustomPiecePart): number {
  const n = part.sides ?? NGON_DEFAULT_SIDES;
  return Math.max(NGON_MIN_SIDES, Math.min(NGON_MAX_SIDES, Math.round(n)));
}

/** arch = 2 jamb boxes (24 tris) + one box voussoir per facet (12 each). Exact and
 * predictable — the budget gate never guesses. A 4-facet arch is 72 tris. */
export function archTris(sides: number): number {
  const n = Math.max(ARCH_MIN_SIDES, Math.min(ARCH_MAX_SIDES, Math.round(sides)));
  return 24 + 12 * n;
}

export function resolvedArchSides(part: CustomPiecePart): number {
  const n = part.sides ?? ARCH_DEFAULT_SIDES;
  return Math.max(ARCH_MIN_SIDES, Math.min(ARCH_MAX_SIDES, Math.round(n)));
}

/** SphereGeometry: widthSegments × heightSegments × 2 (matches builder). */
export function sphereTris(segments: number): number {
  const heightSegments = Math.max(4, Math.round(segments * 0.75));
  return 2 * segments * heightSegments;
}

export function partTris(part: CustomPiecePart): number {
  switch (part.shape) {
    case "box":
      return TRIS_PER_BOX;
    case "wedge":
      return TRIS_PER_WEDGE;
    case "plane":
      return TRIS_PER_PLANE;
    case "cylinder":
      return cylinderTris(resolvedSegments(part));
    case "sphere":
      return sphereTris(resolvedSegments(part));
    case "ngon":
      return ngonTris(resolvedNgonSides(part));
    case "arch":
      return archTris(resolvedArchSides(part));
    default:
      return TRIS_PER_BOX;
  }
}

export function customPieceTris(piece: Pick<CustomPiece, "parts">): number {
  return piece.parts.reduce((s, p) => s + partTris(p), 0);
}

/** Validate an untrusted piece (AI output / imported JSON). Null = OK. */
export function normalizeCustomPieceParts(piece: CustomPiece): CustomPiece {
  const parts = piece.parts.map((p) => ({ ...p, ...normalizePartColors(p) }));
  const COPLANAR_EPS = 0.005;
  const NUDGE_M = 0.01;
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i];
      const b = parts[j];
      const aTop = a.y + partHalfHeight(a);
      const bTop = b.y + partHalfHeight(b);
      if (Math.abs(aTop - bTop) > COPLANAR_EPS) continue;
      if (!footprintsOverlap(a, b)) continue;
      // Nudge the higher-index part down to break z-fight.
      parts[j] = { ...b, y: b.y - NUDGE_M };
    }
  }
  return { ...piece, parts };
}

function partHalfHeight(p: CustomPiecePart): number {
  if (p.shape === "cylinder" || p.shape === "ngon") {
    const axis = p.axis ?? "y";
    return axis === "y" ? p.h / 2 : p.w / 2;
  }
  if (p.shape === "sphere") return p.w / 2;
  if (p.shape === "plane") return p.h / 2;
  return p.h / 2;
}

function partFootprint(p: CustomPiecePart): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let hx: number;
  let hz: number;
  if (p.shape === "cylinder" || p.shape === "ngon") {
    const axis = p.axis ?? "y";
    if (axis === "x") [hx, hz] = [p.h / 2, p.w / 2];
    else if (axis === "z") [hx, hz] = [p.w / 2, p.h / 2];
    else [hx, hz] = [p.w / 2, p.w / 2];
  } else if (p.shape === "sphere") {
    hx = hz = p.w / 2;
  } else if (p.shape === "plane") {
    [hx, hz] = [p.w / 2, 0.01];
  } else {
    [hx, hz] = [p.w / 2, p.d / 2];
  }
  return { minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz };
}

function footprintsOverlap(a: CustomPiecePart, b: CustomPiecePart): boolean {
  const fa = partFootprint(a);
  const fb = partFootprint(b);
  return fa.minX < fb.maxX && fa.maxX > fb.minX && fa.minZ < fb.maxZ && fa.maxZ > fb.minZ;
}

function partVolumeApprox(p: CustomPiecePart): number {
  if (p.shape === "sphere") return (4 / 3) * Math.PI * (p.w / 2) ** 3;
  if (p.shape === "cylinder" || p.shape === "ngon") {
    const axis = p.axis ?? "y";
    const r = p.w / 2;
    const len = axis === "y" ? p.h : p.w;
    return Math.PI * r * r * len;
  }
  if (p.shape === "plane") return p.w * p.h * 0.02;
  return p.w * p.h * p.d;
}

function intersectionVolumeApprox(a: CustomPiecePart, b: CustomPiecePart): number {
  const fa = partFootprint(a);
  const fb = partFootprint(b);
  const ix = Math.max(0, Math.min(fa.maxX, fb.maxX) - Math.max(fa.minX, fb.minX));
  const iz = Math.max(0, Math.min(fa.maxZ, fb.maxZ) - Math.max(fa.minZ, fb.minZ));
  if (ix <= 0 || iz <= 0) return 0;
  const aY0 = a.y - partHalfHeight(a);
  const aY1 = a.y + partHalfHeight(a);
  const bY0 = b.y - partHalfHeight(b);
  const bY1 = b.y + partHalfHeight(b);
  const iy = Math.max(0, Math.min(aY1, bY1) - Math.max(aY0, bY0));
  return ix * iz * iy;
}

/** Non-fatal quality hints for dry-run / repair rounds. */
export function customPieceWarnings(piece: CustomPiece): string[] {
  const warnings: string[] = [];
  const parts = piece.parts;
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i];
      const b = parts[j];
      const volA = partVolumeApprox(a);
      const volB = partVolumeApprox(b);
      const inter = intersectionVolumeApprox(a, b);
      const smaller = Math.min(volA, volB);
      if (smaller > 0 && inter / smaller > 0.6) {
        warnings.push(`parts ${i + 1} and ${j + 1} overlap heavily (>60% volume)`);
      }
    }
  }
  if (parts.length === 1 && parts[0].shape === "box") {
    warnings.push("figurative piece is a single box — add base, body, and detail masses");
  }
  for (const [i, p] of parts.entries()) {
    if (p.shape === "sphere" && p.w > 1) {
      warnings.push(`part ${i + 1}: sphere >1 m is expensive — prefer faceted cylinders (segments 8)`);
    }
    if ((p.shape === "cylinder" || p.shape === "sphere") && (p.segments ?? 16) >= 24) {
      warnings.push(`part ${i + 1}: segments ${p.segments} is high — default 8 unless silhouette needs round`);
    }
  }
  return [...new Set(warnings)];
}

export function customPieceIssue(piece: CustomPiece): string | null {
  if (!piece.name?.trim() || piece.name.length > 40) return "Name must be 1–40 characters";
  if (!Array.isArray(piece.parts) || piece.parts.length === 0) return "A piece needs at least one part";
  if (piece.parts.length > CUSTOM_PIECE_MAX_PARTS)
    return `Too many parts (${piece.parts.length} — max ${CUSTOM_PIECE_MAX_PARTS})`;
  const tris = customPieceTris(piece);
  if (tris > CUSTOM_PIECE_MAX_TRIS)
    return `Too heavy: ~${tris} triangles (max ${CUSTOM_PIECE_MAX_TRIS}) — use fewer round parts or lower segments`;
  for (const [i, p] of piece.parts.entries()) {
    const label = `Part ${i + 1}`;
    if (!SHAPES.includes(p.shape)) return `${label}: unknown shape "${p.shape}"`;
    if (p.finish !== undefined && !FINISHES.includes(p.finish))
      return `${label}: finish must be matte, satin, metal, or glass`;
    if (p.surface !== undefined && !SURFACES.includes(p.surface))
      return `${label}: surface must be flat, wood, brushed_metal, fabric, or screen`;
    if (p.segments !== undefined && !SEGMENTS.includes(p.segments))
      return `${label}: segments must be 8, 16, or 24`;
    if (
      (p.shape === "cylinder" || p.shape === "sphere") &&
      p.segments !== undefined &&
      !SEGMENTS.includes(p.segments)
    ) {
      return `${label}: segments must be 8, 16, or 24`;
    }
    if (p.shape !== "cylinder" && p.shape !== "sphere" && p.segments !== undefined)
      return `${label}: segments only apply to cylinders and spheres`;
    if (p.shape === "ngon") {
      if (
        p.sides === undefined ||
        !Number.isInteger(p.sides) ||
        p.sides < NGON_MIN_SIDES ||
        p.sides > NGON_MAX_SIDES
      ) {
        return `${label}: ngon needs "sides" ${NGON_MIN_SIDES}–${NGON_MAX_SIDES}`;
      }
    } else if (p.shape === "arch") {
      // arch "sides" is optional (defaults to 4); if given it must be 2–8.
      if (
        p.sides !== undefined &&
        (!Number.isInteger(p.sides) || p.sides < ARCH_MIN_SIDES || p.sides > ARCH_MAX_SIDES)
      ) {
        return `${label}: arch "sides" must be ${ARCH_MIN_SIDES}–${ARCH_MAX_SIDES}`;
      }
    } else if (p.sides !== undefined) {
      return `${label}: "sides" only applies to ngon and arch`;
    }
    for (const [k, v] of [["w", p.w], ["h", p.h], ["d", p.d]] as const) {
      if (typeof v !== "number" || !(v > 0) || v > CUSTOM_PIECE_MAX_DIM_M)
        return `${label}: ${k} must be 0–${CUSTOM_PIECE_MAX_DIM_M} m`;
    }
    if (![p.x, p.y, p.z].every((v) => typeof v === "number" && Math.abs(v) <= CUSTOM_PIECE_MAX_DIM_M))
      return `${label}: offsets must stay within ±${CUSTOM_PIECE_MAX_DIM_M} m of the origin`;
    if (p.y < 0) return `${label}: y must not go below the floor`;
    if (p.axis !== undefined && !["x", "y", "z"].includes(p.axis))
      return `${label}: axis must be "x", "y" or "z"`;
    if (!HEX.test(p.color)) return `${label}: color must be #rrggbb`;
    if (p.emissive !== undefined && !HEX.test(p.emissive)) return `${label}: emissive must be #rrggbb`;
  }
  return null;
}

/** Axis-aligned bounding box of a piece in meters — {w (x), h (y), d (z)}. This is what
 * placement validation and AI context use so a piece's physical size is never invisible:
 * a 20 m amphitheatre bowl must read as 20 m, not as a name. Accounts for per-part
 * rotYDeg and cylinder axis orientation. */
export function customPieceBoundsM(piece: Pick<CustomPiece, "parts">): {
  w: number;
  h: number;
  d: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxY = 0;
  for (const p of piece.parts) {
    // Footprint extents (x, z) and height extent (y) per shape, before yaw rotation.
    let ex: number;
    let ez: number;
    let ey: number;
    switch (p.shape) {
      case "cylinder":
      case "ngon": {
        const axis = p.axis ?? "y";
        if (axis === "x") [ex, ez, ey] = [p.h, p.w, p.w];
        else if (axis === "z") [ex, ez, ey] = [p.w, p.h, p.w];
        else [ex, ez, ey] = [p.w, p.w, p.h];
        break;
      }
      case "sphere":
        ex = ez = ey = p.w;
        break;
      case "plane":
        // Vertical panel: w wide, h tall, negligible depth.
        [ex, ez, ey] = [p.w, 0.01, p.h];
        break;
      default:
        // box / wedge
        [ex, ez, ey] = [p.w, p.d, p.h];
    }
    const theta = ((p.rotYDeg ?? 0) * Math.PI) / 180;
    const c = Math.abs(Math.cos(theta));
    const s = Math.abs(Math.sin(theta));
    const hx = (ex * c + ez * s) / 2;
    const hz = (ex * s + ez * c) / 2;
    minX = Math.min(minX, p.x - hx);
    maxX = Math.max(maxX, p.x + hx);
    minZ = Math.min(minZ, p.z - hz);
    maxZ = Math.max(maxZ, p.z + hz);
    maxY = Math.max(maxY, p.y + ey / 2);
  }
  if (!Number.isFinite(minX)) return { w: 0, h: 0, d: 0 };
  const round = (n: number) => Math.round(n * 10) / 10;
  return { w: round(maxX - minX), h: round(maxY), d: round(maxZ - minZ) };
}

export function customPieceIdFromName(name: string, taken: Set<string>): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "piece";
  let id = `custom_${slug}`;
  let n = 2;
  while (taken.has(id)) id = `custom_${slug}_${n++}`;
  return id;
}

export function findCustomPiece(
  pieces: CustomPiece[] | undefined,
  moduleId: string
): CustomPiece | undefined {
  return (pieces ?? []).find((p) => p.id === moduleId);
}
