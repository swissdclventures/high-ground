/** Maximum resident emote clips carried by one AvatarShape NPC. */
export const NPC_EMOTE_SLOTS = 10;

export function dedupeNpcEmoteUrns(urns: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const urn of urns) {
    if (!urn || seen.has(urn)) continue;
    seen.add(urn);
    out.push(urn);
  }
  return out;
}

/**
 * Replace the NPC's resident clips only when the ordered slot list actually
 * changed. Rewriting an identical list makes Explorer rebind every animation
 * to the avatar armature and can swallow a trigger fired during that rebind.
 */
export function setNpcEmotesIfChanged(shape: { emotes: string[] }, urns: readonly string[]): boolean {
  const next = dedupeNpcEmoteUrns(urns).slice(0, NPC_EMOTE_SLOTS);
  const have = shape.emotes ?? [];
  if (have.length === next.length && have.every((urn, index) => urn === next[index])) return false;
  shape.emotes = next;
  return true;
}
