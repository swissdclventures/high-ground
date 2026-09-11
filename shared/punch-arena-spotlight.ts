/** One stadium card at a time. Names stay on the flat HUD, digits on the LED arc. */
export interface PunchArenaSpotlight {
  label: string
  glyph: string
  score: number
}

type ScoreEntry = { name: string; score: number }
const SLOT_MS = 8_000
const CARD_MS = 6_000
const INTRO_MS = 1_200

export function punchArenaSpotlight(
  tonight: readonly ScoreEntry[],
  saved: readonly ScoreEntry[],
  lastHit: number,
  now: number
): PunchArenaSpotlight | null {
  const valid = (score: number) => Number.isSafeInteger(score) && score > 0
  const cards = tonight.slice(0, 3).flatMap((entry, index) => valid(entry.score)
    ? [{ label: `TONIGHT #${index + 1} · ${entry.name.slice(0, 16).toUpperCase()}`, score: entry.score, icon: index === 0 ? 'crown' : 'star' }]
    : [])
  if (saved[0] && valid(saved[0].score)) {
    cards.push({ label: `ALL-TIME RECORD · ${saved[0].name.slice(0, 16).toUpperCase()}`, score: saved[0].score, icon: 'crown' })
  }
  if (valid(lastHit)) cards.push({ label: 'LATEST HIT', score: lastHit, icon: 'flame' })
  const clock = Math.max(0, now)
  const intoSlot = clock % SLOT_MS
  // Two seconds of the existing music-reactive patterns between cards.
  if (!cards.length || intoSlot >= CARD_MS) return null
  const card = cards[Math.floor(clock / SLOT_MS) % cards.length]!
  return {
    label: `${card.label} · ${card.score.toLocaleString('en-US')}`,
    // Four digits is the physical matrix limit. Larger totals keep their exact
    // value in the caption and show a mark, never a misleading truncated number.
    glyph: intoSlot < INTRO_MS || card.score > 9999 ? `#${card.icon}` : String(card.score),
    score: card.score
  }
}
