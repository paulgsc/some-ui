/**
 * The comb's geometry, shared by the comb and the field behind it. They must
 * agree exactly: the field is only an extension of the comb if every one of
 * its cells lands where the comb's own lattice would have put the next one.
 */

/**
 * Natural hex circumradius, in viewBox units. `HexGrid` never draws larger
 * than this (it letterbox-scales *down* to its box), so it is also the comb's
 * size cap on a large desktop: a radius-1 pointy-top comb is 5.2 × 5 of these.
 * Every size in the comb is in the same units, so type and glyphs scale with
 * the cells and the ratio of ink to cell is the same on every screen.
 */
export const HEX = 140

/**
 * How much of its wax socket a cell fills. The remaining band is the wall
 * between neighbours: without it seven tessellated hexes read as one blob.
 */
export const INSET = 0.9

/** Breathing room `HexGrid` leaves around the comb, for the hover lift. */
export const VIEWBOX_FACTOR = 1.04

/**
 * The comb's viewBox at natural size, from `measureHexGridBounds(1, HEX)`
 * scaled by `VIEWBOX_FACTOR`. `HexGrid` caps its drawing at this many CSS
 * pixels, which is what lets the field recover the comb's on-screen scale
 * from nothing but the size of the box the comb was given.
 */
export const COMB_VIEWBOX = {
  width: HEX * Math.sqrt(3) * 3 * VIEWBOX_FACTOR,
  height: HEX * 5 * VIEWBOX_FACTOR,
} as const
