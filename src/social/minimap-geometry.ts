/**
 * The half of the minimap with no SDK in it: parcels in, rectangles out.
 *
 * Kept separate for the same reason `shared/site-plan.ts` is separate from the SVG
 * that draws it — the arithmetic is what goes wrong (anchoring, the north-up flip,
 * which building source is authoritative), and arithmetic behind an `@dcl/sdk`
 * import cannot be unit-tested. Nothing here knows what a building IS.
 */

/** A block of ground in WORLD parcel space. x1/y1 are exclusive edges and may be
 * fractional, because a building silhouette is not parcel-aligned. */
export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Parcel {
  x: number
  y: number
}

/** Parse a `"x,y"` coordinate. Anything else is null — the callers all treat a bad
 * coordinate as absent rather than guessing. */
export function parseParcel(s: unknown): Parcel | null {
  if (typeof s !== 'string') return null
  const [a, b] = s.split(',')
  const x = Number(a)
  const y = Number(b)
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

/**
 * Merge parcel cells into horizontal runs, one per row.
 *
 * A 45×45 plot is 2025 parcels. Emitting a UiEntity per parcel costs thousands of UI
 * nodes every frame for a 150 px map where each parcel is barely one pixel — and two
 * plots of that size is what the owner's World actually holds. Row runs are EXACT (no
 * shape is approximated, an L-plan stays an L) and cut it to ~45 rectangles.
 */
export function mergeRows(cells: Parcel[]): Rect[] {
  const byRow = new Map<number, number[]>()
  for (const c of cells) {
    const row = byRow.get(c.y)
    if (row) row.push(c.x)
    else byRow.set(c.y, [c.x])
  }
  const out: Rect[] = []
  for (const [y, xsRaw] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    const xs = [...new Set(xsRaw)].sort((a, b) => a - b)
    let start = xs[0]!
    let prev = start
    for (let i = 1; i <= xs.length; i++) {
      const x = xs[i]
      if (x === prev + 1) {
        prev = x
        continue
      }
      out.push({ x0: start, y0: y, x1: prev + 1, y1: y + 1 })
      if (x === undefined) break
      start = x
      prev = x
    }
  }
  return out
}

/** The shape of a published building-config, as far as the map cares. */
export interface FootprintSource {
  builtFootprint?: { cells?: unknown } | undefined
  buildingOutlines?: unknown
}

/**
 * The building footprints of one deployed scene, in WORLD parcel space.
 *
 * `buildingOutlines` is the authoritative source: it holds EVERY placed building,
 * while `builtFootprint.cells` only ever described the primary one. The 45×45 plot
 * live on the owner's World today carries 7 outlines and 9 cells — reading cells
 * alone drew one building out of seven, which is what made the in-world map look
 * like it had lost the others.
 *
 * Outlines collapse to their bounding box because a parcel is about ONE PIXEL on
 * this map, so facets and rotation are not representable; the builder's world map
 * is where the true silhouette is drawn. Cells stay as the fallback for scenes
 * published before outlines existed (the 20×20 next door is one of them).
 *
 * `anchor` is the scene's SW corner, NOT pointers[0]: pointer order is whatever the
 * deploy produced, and footprint coordinates are measured from the corner.
 */
export function footprintRects(
  cfg: FootprintSource,
  anchorX: number,
  anchorY: number
): Rect[] {
  const outlines = Array.isArray(cfg.buildingOutlines) ? cfg.buildingOutlines : []
  const out: Rect[] = []
  for (const raw of outlines) {
    if (!raw || typeof raw !== 'object') continue
    const points = (raw as { points?: unknown }).points
    if (!Array.isArray(points) || points.length < 3) continue
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const point of points) {
      if (!point || typeof point !== 'object') continue
      const x = Number((point as { x?: unknown }).x)
      const y = Number((point as { y?: unknown }).y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
    if (x0 === Infinity || x1 <= x0 || y1 <= y0) continue
    out.push({ x0: anchorX + x0, y0: anchorY + y0, x1: anchorX + x1, y1: anchorY + y1 })
  }
  if (out.length) return out

  const cells = Array.isArray(cfg.builtFootprint?.cells) ? cfg.builtFootprint!.cells! : []
  const parsed: Parcel[] = []
  for (const c of cells as unknown[]) {
    const p = parseParcel(c)
    if (p) parsed.push({ x: anchorX + p.x, y: anchorY + p.y })
  }
  return mergeRows(parsed)
}
