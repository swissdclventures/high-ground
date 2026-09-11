/**
 * How a video fills a screen whose shape is not the video's shape.
 *
 * A media screen is free-form: the owner drags its edges in the 3D view and the
 * runtime scales one box to whatever width × height came out. The picture,
 * though, arrives at ONE fixed shape — an MP4 is 16:9, a phone clip is 9:16,
 * Decentraland Cast is 16:9 — and stretching it onto a tall billboard is the
 * one outcome nobody wants: a skewed video has no value, a cropped one does.
 *
 * So the mesh keeps the owner's shape and the TEXTURE gets a window: sample the
 * middle of the source at the screen's own aspect and let the overflow fall off
 * the edges. This is CSS `object-fit: cover`, expressed as UV coordinates,
 * because UVs are the only lever SDK7 gives us here —
 * `Material.Texture.Video` has no `offset`/`tiling` (only the common image
 * texture does; see decentraland/common/texture.proto), and `VideoEvent`
 * never reports the decoded frame's dimensions, so the source shape has to be
 * declared rather than measured.
 */

export type MediaScreenFit = "crop" | "stretch";

/** What an owner is overwhelmingly uploading unless they say otherwise. */
export const MEDIA_SCREEN_DEFAULT_SOURCE_ASPECT = 16 / 9;

/**
 * Below this the two shapes are the same shape and the crop is a no-op — return
 * no UV list at all so the explorer keeps its own default mapping. Half a
 * percent is far under what an eye can see and well over float noise.
 */
const ASPECT_EPSILON = 0.005;

export interface MediaScreenSourceAspectOption {
  id: string;
  label: string;
  value: number;
}

/** The shapes worth naming in a dropdown. Anything else can be typed as a number. */
export const MEDIA_SCREEN_SOURCE_ASPECTS: readonly MediaScreenSourceAspectOption[] = [
  { id: "16:9", label: "16:9 · landscape", value: 16 / 9 },
  { id: "9:16", label: "9:16 · portrait", value: 9 / 16 },
  { id: "4:3", label: "4:3 · classic", value: 4 / 3 },
  { id: "1:1", label: "1:1 · square", value: 1 },
  { id: "21:9", label: "21:9 · cinema", value: 21 / 9 },
];

export interface MediaScreenUvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export function parseMediaScreenFit(value: string | null | undefined): MediaScreenFit {
  return value === "stretch" ? "stretch" : "crop";
}

export function normalizeMediaScreenSourceAspect(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return MEDIA_SCREEN_DEFAULT_SOURCE_ASPECT;
  // A 8:1 ribbon and a 1:8 totem are both real screens; past that it is a typo.
  return Math.min(8, Math.max(0.125, n));
}

/** The named option whose ratio matches, for round-tripping a dropdown. */
export function mediaScreenSourceAspectId(value: number): string {
  let best = MEDIA_SCREEN_SOURCE_ASPECTS[0]!;
  let bestGap = Infinity;
  for (const option of MEDIA_SCREEN_SOURCE_ASPECTS) {
    const gap = Math.abs(option.value - value);
    if (gap < bestGap) {
      bestGap = gap;
      best = option;
    }
  }
  return bestGap <= ASPECT_EPSILON ? best.id : "custom";
}

/**
 * The centred window into the source that fills a screen of this shape.
 *
 * Wider screen than source → the source's width is the binding constraint, so
 * the visible slice of its HEIGHT shrinks (bands off the top and bottom).
 * Taller screen than source → the sides go instead. Never both: one axis always
 * stays whole, which is what makes this cover and not zoom.
 */
export function mediaScreenCropRect(screenAspect: number, sourceAspect: number): MediaScreenUvRect {
  const screen = Number.isFinite(screenAspect) && screenAspect > 0 ? screenAspect : 1;
  const source = normalizeMediaScreenSourceAspect(sourceAspect);
  const su = screen >= source ? 1 : screen / source;
  const sv = screen >= source ? source / screen : 1;
  return {
    u0: (1 - su) / 2,
    v0: (1 - sv) / 2,
    u1: (1 + su) / 2,
    v1: (1 + sv) / 2,
  };
}

/**
 * Set to true if a cropped screen comes out ROTATED 90° in-world.
 *
 * The explorer owns the vertex order behind `MeshRenderer.setBox`, and the
 * gallery already paid for guessing at it once (hand-authored plane UVs turned
 * every picture on its side). The order below is the documented one and a
 * centred window is immune to a mirrored corner order — the same middle band
 * comes out either way — so the only way this can be wrong is if the explorer
 * swaps the two axes, and this flag is the whole fix for that.
 */
export const MEDIA_SCREEN_UV_AXES_SWAPPED = false;

/**
 * A box UV list that puts the SAME window on every face.
 *
 * `decentraland/sdk/components/mesh_renderer.proto` specifies 96 floats for a
 * box (2D × 6 faces × 2 sides × 4 vertices). Giving all twelve sides one
 * identical rect is what makes this safe: face order stops mattering, and a
 * reader that only consumes the first 48 floats still sees six correct faces,
 * because the pattern repeats every eight.
 *
 * Per side, the corners run lower-left → lower-right → upper-right → upper-left.
 */
export function mediaScreenBoxUvs(
  rect: MediaScreenUvRect,
  axesSwapped: boolean = MEDIA_SCREEN_UV_AXES_SWAPPED
): number[] {
  const { u0, v0, u1, v1 } = axesSwapped
    ? { u0: rect.v0, v0: rect.u0, u1: rect.v1, v1: rect.u1 }
    : rect;
  const side = [u0, v0, u1, v0, u1, v1, u0, v1];
  const uvs: number[] = [];
  for (let i = 0; i < 12; i += 1) uvs.push(...side);
  return uvs;
}

export interface MediaScreenFitInput {
  widthM: number;
  heightM: number;
  fit: MediaScreenFit;
  sourceAspect: number;
}

/**
 * UVs for one screen, or null when the explorer's own mapping is already right
 * (stretch mode, or a screen already cut to the source's shape).
 */
export function mediaScreenVideoUvs(input: MediaScreenFitInput): number[] | null {
  if (input.fit !== "crop") return null;
  const width = Number(input.widthM);
  const height = Number(input.heightM);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const screenAspect = width / height;
  const source = normalizeMediaScreenSourceAspect(input.sourceAspect);
  if (Math.abs(screenAspect - source) <= ASPECT_EPSILON * source) return null;
  return mediaScreenBoxUvs(mediaScreenCropRect(screenAspect, source));
}
