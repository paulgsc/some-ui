/**
 * Subtitles (FEED7 #2664, SFEED2 #2670): the words said, drawn at the foot
 * of the frame a line at a time, as an ASS script ffmpeg's libass draws over
 * the joined video (`planAssembly`). Pure: the words come from each take's
 * own timings (home's speaker's `/timed`), so the same takes give the same
 * script.
 *
 * Under `word`, each word is lit as it is said (ASS karaoke: a word is
 * `SecondaryColour` until it is reached, then `PrimaryColour`); under `line`,
 * a line is drawn whole for as long as it is said.
 *
 * A line is drawn in the band at the frame's foot (`subtitleBand`), never
 * above it, so a template that leaves that band empty has nothing drawn over
 * its picture.
 */

/** A word said, and when, in ms. */
export type TimedWord = {
  readonly text: string
  readonly startMs: number
  readonly endMs: number
}

export type SubtitleStyle = "line" | "word"

/** One line of subtitles: its words, and when it shows. */
export type SubtitleLine = {
  readonly words: ReadonlyArray<TimedWord>
  readonly startMs: number
  readonly endMs: number
}

/** The most characters a line holds, so it fits the frame on one row. */
export const LINE_CHARS = 56

/** A pause this long, or longer, between two words starts a new line. */
const PAUSE_MS = 700

/** How long a line stays after its last word, unless the next comes sooner. */
const LINGER_MS = 600

/** A word that ends a sentence or a clause ends its line. */
const ENDS = /[.?!:;]$/

/**
 * The words, in the order said, broken into lines: at a sentence's or a
 * clause's end, at a pause, and before a line would pass `LINE_CHARS`.
 * Each line shows from its first word to its last, and lingers a little
 * unless the next line starts sooner.
 */
export function subtitleLines(
  words: ReadonlyArray<TimedWord>
): ReadonlyArray<SubtitleLine> {
  const groups: Array<Array<TimedWord>> = []
  let current: Array<TimedWord> = []
  let chars = 0
  for (const word of words) {
    const last = current.at(-1)
    const longer = chars + (current.length > 0 ? 1 : 0) + word.text.length
    if (
      last !== undefined &&
      (ENDS.test(last.text) ||
        word.startMs - last.endMs >= PAUSE_MS ||
        longer > LINE_CHARS)
    ) {
      groups.push(current)
      current = []
      chars = 0
    }
    chars += (current.length > 0 ? 1 : 0) + word.text.length
    current.push(word)
  }
  if (current.length > 0) groups.push(current)
  return groups.map((group, i) => {
    const first = group[0]
    const last = group.at(-1)
    if (!first || !last) throw new Error("a line has words")
    const next = groups[i + 1]?.[0]?.startMs ?? Number.POSITIVE_INFINITY
    return {
      words: group,
      startMs: first.startMs,
      endMs: Math.max(last.endMs, Math.min(last.endMs + LINGER_MS, next)),
    }
  })
}

/**
 * Where subtitles are drawn in a frame `height` px tall: the band at its foot,
 * as the share of the height a template leaves empty for them, the line's
 * size, and its margin from the bottom.
 */
export function subtitleBand(height: number): {
  readonly bandPx: number
  readonly fontPx: number
  readonly marginPx: number
} {
  const fontPx = Math.round(height * 0.04)
  const marginPx = Math.round(height * 0.03)
  // One row of text, its box's padding, and the margin under it.
  return { bandPx: Math.ceil(fontPx * 1.6 + marginPx * 2), fontPx, marginPx }
}

/** `ms` as ASS writes a time: H:MM:SS.cc. */
const time = (ms: number): string => {
  const cs = Math.max(0, Math.round(ms / 10))
  const h = Math.floor(cs / 360_000)
  const m = Math.floor(cs / 6_000) % 60
  const s = Math.floor(cs / 100) % 60
  const c = cs % 100
  const two = (n: number): string => String(n).padStart(2, "0")
  return `${h}:${two(m)}:${two(s)}.${two(c)}`
}

/** A word as ASS draws it: braces and backslashes would be read as tags. */
const plain = (text: string): string => text.replace(/[{}\\]/g, "")

/** The words of a line, each lit as it is said (`\k`, in centiseconds). */
function karaoke(line: SubtitleLine): string {
  return line.words
    .map((word, i) => {
      const until = line.words[i + 1]?.startMs ?? word.endMs
      const cs = Math.max(1, Math.round((until - word.startMs) / 10))
      return `{\\k${cs}}${plain(word.text)}`
    })
    .join(" ")
}

/**
 * The ASS script that draws `lines` over a `width`×`height` frame in
 * `style`: light text on a dark box, centred in the band at the foot.
 */
export function subtitlesAss(
  lines: ReadonlyArray<SubtitleLine>,
  frame: { readonly width: number; readonly height: number },
  style: SubtitleStyle
): string {
  const { fontPx, marginPx } = subtitleBand(frame.height)
  const side = Math.round(frame.width * 0.05)
  // &HAABBGGRR: lit words white, words not yet said grey, on one box of
  // near black at about three quarters behind the whole line (libass's
  // BorderStyle 4; under 3 each word gets a box, and they overlap in
  // stripes). The outline is clear: its width is only the box's padding.
  const lit = "&H00F0F0F0"
  const unlit = style === "word" ? "&H00A0A0A0" : lit
  const clear = "&HFF000000"
  const box = "&H40101010"
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${frame.width}`,
    `PlayResY: ${frame.height}`,
    // Lines are broken here, never by libass.
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Said,sans-serif,${fontPx},${lit},${unlit},${clear},${box},0,0,0,0,100,100,0,0,4,${Math.round(fontPx * 0.25)},0,2,${side},${side},${marginPx},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...lines.map(
      (line) =>
        `Dialogue: 0,${time(line.startMs)},${time(line.endMs)},Said,,0,0,0,,${
          style === "word"
            ? karaoke(line)
            : line.words.map((w) => plain(w.text)).join(" ")
        }`
    ),
    "",
  ].join("\n")
}
