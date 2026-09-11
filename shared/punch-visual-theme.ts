/** Friend Zone / High Ground materials translated into readable interface colors.
 * Enamel red = action, petrol = instrument, ivory = type/cloud, brass = trim.
 * Green and bright gold retain their gameplay meanings: focus earns / reward.
 */
export const PUNCH_VISUAL_THEME = {
  ink: '#132F35',
  panel: '#102C32',
  panelRaised: '#23494E',
  ivory: '#F5ECD9',
  muted: '#BBCBC6',
  inkSoft: '#49676A',
  red: '#B82E24',
  redHot: '#CE4436',
  brass: '#C6A66B',
  metal: '#AEC2BF',
  petrol: '#247E84',
  channel: '#6DDDD7',
  channelHot: '#BCF4E9',
  focus: '#58DB91',
  gold: '#FFD15A',
  goldHot: '#FFF6D6',
  danger: '#F17764',
} as const;

/** The value is drawn over both washes; their combined brightness is bounded. */
export const PUNCH_METER_PAINT = {window: .18, windowHot: .24, fill: .12, fillHot: .15, spill: .22} as const;

/** Same leather mesh and seams, with a readable gold finish under the sparkle. */
export const PUNCH_GOLD_MATERIAL = {
  albedo: [1, .72, .18], emissive: [1, .45, .05],
  emissiveIntensity: .25, metallic: .86, roughness: .3,
} as const;
