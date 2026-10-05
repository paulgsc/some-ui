// Which source modules a written chunk actually carries, from its sourcemap.
//
// A map's `sources` is not that list. Rolldown lists modules whose code was
// dropped after chunking (a branch folded on a constant imported from
// another module) with no segment at all, and gives a dropped declaration a
// stray segment at the boundary of the statement that follows it: `var `,
// four bytes of someone else's code, mapped to the first line of the dead
// one. Counting either as present reports code that does not ship. So a
// source counts only where a segment maps something other than a keyword,
// punctuation or whitespace to it.
//
// The other direction is a declared limit, not a bug: code the bundler emits
// with no mapping at all (a JSON module, a virtual module) belongs to no
// source here. `readBuild` reports a chunk with no map as unattributed for
// that reason.

/** The parts of a v3 sourcemap this reads. */
export type SourceMapLike = {
  readonly sources: ReadonlyArray<string | null>
  readonly mappings: string
  readonly sourceRoot?: string
}

const BASE64 = new Map(
  [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"].map(
    (char, index) => [char, index]
  )
)

/** Generated text that says nothing about which module it came from. */
const NOISE =
  /^(?:\s|[;,(){}[\]=:.]|\b(?:var|let|const|function|class|export|import|return|async|await|new)\b)*$/

function decodeSegment(segment: string): Array<number> {
  const values: Array<number> = []
  let value = 0
  let shift = 0
  for (const char of segment) {
    const digit = BASE64.get(char)
    if (digit === undefined) throw new Error(`invalid VLQ digit "${char}"`)
    value += (digit & 31) << shift
    if (digit & 32) {
      shift += 5
    } else {
      values.push(value & 1 ? -(value >>> 1) : value >>> 1)
      value = 0
      shift = 0
    }
  }
  return values
}

/**
 * Bytes of `code` each source carries, by the segments that map substantive
 * generated text to it. A source missing from the result is not in the chunk.
 */
export function presentSources(
  code: string,
  map: SourceMapLike
): Map<number, number> {
  const lines = code.split("\n")
  const bytes = new Map<number, number>()
  let source = 0
  map.mappings.split(";").forEach((line, lineIndex) => {
    const text = lines[lineIndex] ?? ""
    const starts: Array<[column: number, source: number | null]> = []
    let column = 0
    for (const segment of line.split(",")) {
      if (segment === "") continue
      const values = decodeSegment(segment)
      column += values[0] ?? 0
      if (values.length >= 4) {
        source += values[1] ?? 0
        starts.push([column, source])
      } else {
        starts.push([column, null])
      }
    }
    starts.forEach(([start, owner], index) => {
      if (owner === null) return
      const end = starts[index + 1]?.[0] ?? text.length
      const slice = text.slice(start, end)
      if (NOISE.test(slice)) return
      bytes.set(owner, (bytes.get(owner) ?? 0) + slice.length)
    })
  })
  return bytes
}
