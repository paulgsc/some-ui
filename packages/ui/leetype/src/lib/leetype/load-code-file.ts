import type { PrettierParser } from "./format-code"
import { formatCode } from "./format-code"

const modelCache = new Map<string, Promise<TextModel>>()

export type CodeChunk = {
  content: string
  startLine: number
  endLine: number
  hasMore: boolean
}

/**
 * Editor-style resident text model.
 * - Full document is held once
 * - Lines are indexed by offsets
 * - No per-line string allocation
 */
export class TextModel {
  private readonly text: string
  private readonly lineStarts: Array<number>
  private readonly linesPerChunk: number

  constructor(text: string, linesPerChunk = 100) {
    this.text = text
    this.linesPerChunk = linesPerChunk
    this.lineStarts = computeLineStarts(text)
  }

  getTotalLines(): number {
    return this.lineStarts.length
  }

  getChunk(startLine: number): CodeChunk {
    const totalLines = this.getTotalLines()

    if (startLine < 0 || startLine >= totalLines) {
      throw new RangeError(`Invalid startLine ${startLine}`)
    }

    const endLine = Math.min(startLine + this.linesPerChunk, totalLines)

    const startOffset = this.lineStarts[startLine]
    const endOffset =
      endLine < totalLines ? this.lineStarts[endLine] : this.text.length

    const content = this.text.slice(startOffset, endOffset)

    return {
      content,
      startLine,
      endLine,
      hasMore: endLine < totalLines,
    }
  }
}

/**
 * Loads a text model and caches it by path (+ formatting intent, so a path
 * requested both raw and through prettier never share a cache slot).
 * Editor semantics: one resident model per open file.
 *
 * When `prettierParser` is given, the fetched text is formatted once here,
 * before the model ever slices it into chunks - so every chunk (including
 * ones loaded later via `getChunk`) is already-formatted text, not just the
 * first one. Omitting it preserves the previous raw-text behavior exactly.
 */
export async function loadTextModel(
  path: string,
  linesPerChunk = 100,
  prettierParser?: PrettierParser
): Promise<TextModel> {
  const cacheKey = `${path}::${prettierParser ?? "raw"}`
  if (modelCache.has(cacheKey)) {
    return modelCache.get(cacheKey)!
  }

  const promise = (async () => {
    const res = await fetch(path)
    if (!res.ok) {
      throw new Error(`Failed to load code file: ${path}, status ${res.status}`)
    }

    const raw = await res.text()
    const text = prettierParser ? await formatCode(raw, prettierParser) : raw
    return new TextModel(text, linesPerChunk)
  })()

  modelCache.set(cacheKey, promise)
  return promise
}

/**
 * Computes the starting character offset of each line.
 * Similar to how Monaco builds its line index.
 */
function computeLineStarts(text: string): Array<number> {
  const lineStarts = [0]

  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      lineStarts.push(i + 1)
    }
  }

  return lineStarts
}
