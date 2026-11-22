/**
 * The cards' monospace, JetBrains Mono (SIL OFL 1.1, `@fontsource/jetbrains-mono`
 * 5.3.0's latin files), for what a person types: commands, paths, a
 * terminal's lines. Every character it draws is 0.6 em wide, so a row's
 * width is its length; a character it lacks would be drawn by another font
 * at another width, so a card refuses it by name (`missingChar`) rather than
 * measure it wrong.
 */

/** The characters the latin files draw, each 600/1000 em, read with fontTools. Generated. */
const MONO_CHARS = new Set(
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿĂıŒœʼˆ˚˜–—‘’‚“”„•…′″‹›⁄€™↑↓−∕"
)

export const MONO_FAMILY = '"JetBrains Mono", monospace'

/** Each character's advance, in ems. */
const ADVANCE = 0.6

/** How wide `text` draws at `sizePx`. */
export const monoWidth = (text: string, sizePx: number): number =>
  [...text].length * ADVANCE * sizePx

/** The first character of `text` the font can't draw, or null. */
export const missingChar = (text: string): string | null =>
  [...text].find((c) => !MONO_CHARS.has(c)) ?? null
