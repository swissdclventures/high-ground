/**
 * Shared right-side HUD layout contract — ONE source of truth for where every
 * on-screen surface sits.
 *
 * The LEFT edge of the screen is busy (DCL's own jump button, chat), so everything
 * we draw docks to the RIGHT and stacks toward the bottom — except the navigation
 * map, which lives top-right so it does not sit on the action bars.
 *
 * Each surface reads its spot from here instead of hardcoding its own margins, and
 * every spot is reserved AS IF all surfaces are on screen at once. So nothing shifts
 * and nothing overlaps, no matter which surfaces happen to be visible at a given
 * moment — each component has its spot and stays in it.
 *
 * Vertical stack, bottom → up (all right-aligned unless noted):
 *   FRESHNESS      — thin "published MM-DD HH:MM:SS UTC" line, very bottom (centered)
 *   TOOLBAR        — the scene launcher chips (Exchange / Dance / Guests / Host)
 *   DANCE MINI     — Dance Bug play/stop/loop, ABOVE the toolbar with a gap
 *   PARTICIPATION  — joined-dancer status band (centered, above the dance mini)
 *   PANEL          — the big panels (Dance Studio / Host / Guests) open here
 *   SPEAKEASY      — private-room occupancy pill, above participation
 *   PANEL_TOP      — top-anchored variants (Host console / Guests roster / pill)
 *   MINIMAP        — top-right, chevron collapses it to a small map (not in the bottom stack)
 *   AMBIENT AUDIO  — top-right under the map: play/pause for the background bed
 *
 * If you move a surface, move its NUMBER here — never re-hardcode a margin in a
 * component. That is what keeps the ecosystem aware of each other's spots.
 */

/** One right-edge inset shared by every docked surface. */
export const HUD_RIGHT = 22

/** Vertical gap between the scene launcher and the Dance Bug transport. */
export const HUD_ROW_GAP = 24

/** Height of the minimized Dance Bug play/stop/loop bar. */
export const HUD_DANCE_MINI_HEIGHT = 64

/**
 * HOW MUCH OF THE BOTTOM-LEFT CORNER THE EXPLORER'S CHAT OWNS.
 *
 * The header above says the left edge is busy and that we dock right. Two
 * surfaces legitimately break that rule -- the Boost pill and the rescue panel
 * are the crowd's controls and belong under the left thumb -- so the rule they
 * DO have to keep is this one: sit above the chat, never on it.
 *
 * ‼️This is the Explorer's furniture, not ours, so the number is measured, not
 * derived. It covers the message log plus the input bar at desktop scale. If the
 * pill ever lands on chat again, this is the single number to raise.
 */
export const DCL_CHAT_BLOCK = 150

export const HUD = {
  right: HUD_RIGHT,

  /** Personal movement tool. Top-centre, directly below the active ride hint. */
  hoverboard: {
    top: 58,
    width: 164,
    height: 40,
  },

  /**
   * Bottom launcher/toolbar row — the persistent dock the rest measures from.
   * Kept low (near the screen edge) so the Dance Bug transport can sit above it
   * without covering the chip labels.
   */
  toolbar: {
    bottom: 6,
    height: 44,
    chipGap: 8,
  },

  /**
   * Joined-dancer status band (queue / rules / survival). Reserved above the
   * Dance Bug transport (miniBottom + mini height + gap) so a participant can
   * always read it even while both bottom rows are on screen.
   */
  participation: {
    bottom: 212,
  },

  /** The big panels all share ONE slot (only one is ever open at a time). Docked
   *  bottom-right; the studio is tall, so it fills the right side upward from
   *  here. `miniBottom` is where the Dance Bug transport sits — clear of the
   *  toolbar row below it. */
  panel: {
    bottom: 22,
    // toolbar.bottom (6) + toolbar.height (44) + HUD_ROW_GAP (24) = 74,
    // then extra lift so the wearable's play/stop row cannot sit on the chips.
    miniBottom: 124,
  },

  /** Top-anchored panels (Host console / Guests roster / minimized host pill). */
  panelTop: {
    top: 12,
  },

  /** The very-bottom freshness strip (centered, owns the last few px). */
  freshness: {
    bottom: 4,
  },

  /**
   * The floor picker — opens while you STAND on a building pad, closes when you step
   * off. Centered above the participation band: it appears mid-stride, so it must sit
   * where the eye already is, clear of the right-side dock and DCL's left-edge chrome.
   */
  floorPicker: {
    bottom: 130,
    maxWidth: 460,
  },

  /**
   * Speed-corridor bail control — only while a cancelable boost is carrying you.
   * Centered, same mid-stride band as the floor picker (they never share a frame:
   * picker is closed during flight).
   */
  corridorBoost: {
    bottom: 130,
    maxWidth: 320,
  },

  bubbleBash: {
    bottom: 130,
    width: 280,
    height: 148,
    barW: 248,
    barH: 16,
    buttonW: 160,
    buttonH: 40,
  },
  bubbleScore: {
    top: 58,
    width: 460,
    height: 186,
  },

  /**
   * The building floor directory.
   *
   * Top-docked BELOW the map and ambient-audio row, so it never grows upward over the
   * navigation map. The compact FLOORS chip uses the same slot after the guest
   * explicitly closes the directory, so opening and closing it never shifts another
   * HUD surface.
   *
   * ★THE GRID NEVER SCROLLS (owner, 2026-08-24). A scrollbar hides floors behind a
   * gesture, and the one thing this control exists to do is show every floor at once.
   * The button carries only its number, so it is a small square key; when a tower has
   * more levels than `maxRows` can stack, the grid grows a COLUMN instead of a
   * scrollbar. Width is therefore derived, never fixed.
   */
  floorChip: {
    top: 224,
    width: 168,
    height: 34,
    /** One number-only key — one or two digits, so a square reads best. */
    keySize: 34,
    keyHeight: 30,
    /** Rows stop here and columns take over; 8 rows clears the bottom action stack. */
    maxRows: 8,
    /** Never narrower than this, so the header and the ✕ always fit. */
    minCols: 5,
  },

  /**
   * Navigation minimap — top-right, out of the bottom action stack.
   *
   * An open HOST / Dance / Guests panel still covers this corner. That is
   * deliberate: panels are opened on purpose and while one is open you are
   * reading it, not walking. The N button hides the map when you do not need it.
   */
  minimap: {
    top: 16,
  },

  /**
   * Gallery frame picker — opens when a curator clicks a frame, closes on Done.
   *
   * Centered and a little higher than the floor picker: you open it while facing
   * a wall, so it must not sit over the picture you are judging it against. It
   * never shares a frame with the floor picker (that one needs you standing on a
   * pad; this one needs you looking at a painting), so the overlap is free.
   */
  galleryPicker: {
    bottom: 180,
    maxWidth: 520,
    listMaxHeight: 260,
  },

  /**
   * Ambient audio widget — the guest's play/pause (and next) for the background
   * bed. Top-right, DIRECTLY under the minimap, because it is chrome you glance
   * at rather than a surface you work in: the map is where the eye already goes
   * when it leaves the world, and the two together read as one corner of tools.
   *
   * The slot is reserved below the map at its FULL height (minimap.top 16 + the
   * 150px map + a 10px gap), per this file's rule — collapsing the map must not
   * make the audio widget jump up the screen.
   */
  ambientAudio: {
    top: 176,
    height: 34,
    buttonWidth: 40,
    gap: 6,
  },

  /**
   * Speakeasy room status — occupancy and whether the door is OPEN or FULL.
   * Sits above the participation band on the right. The map used to live under
   * this pill; it now lives top-right, so this number no longer has to clear a
   * 150px map card.
   */
  speakeasy: {
    bottom: 256,
  },
} as const
