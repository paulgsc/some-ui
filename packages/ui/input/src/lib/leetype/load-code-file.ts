const cache = new Map<string, Promise<string>>()

/**
 * Loads a code file from a given path, caching the promise to avoid
 * re-fetching.
 * @param path The URL path to the code file.
 * @returns A promise that resolves to the code file content (string).
 */
export function loadCodeFile(path: string): Promise<string> {
  if (cache.has(path)) {
    return cache.get(path) as Promise<string>
  }

  const promise = fetch(path).then(async (res) => {
    if (!res.ok) {
      throw new Error(
        `Failed to load code file: ${path}, Status: ${res.status}`
      )
    }

    if (!res.body) {
      return res.text()
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let result = ""

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      result += decoder.decode(value, { stream: true })
    }

    result += decoder.decode()
    return result
  })

  cache.set(path, promise)
  return promise
}

// ============================================================================
// CHUNKED CODE LOADER
// ============================================================================

export type CodeChunk = {
  content: string
  startLine: number
  endLine: number
  hasMore: boolean
}

export type ChunkedCodeState = {
  chunks: Array<CodeChunk>
  totalLines: number | null
  isLoading: boolean
  error: Error | null
}

/**
 * Manages chunked loading of code files for virtual scrolling/pagination.
 * Loads initial chunk, then additional chunks on demand.
 */
export class ChunkedCodeLoader {
  private fullContent: string | null = null
  private lines: Array<string> | null = null
  private readonly linesPerChunk: number

  constructor(linesPerChunk: number = 50) {
    this.linesPerChunk = linesPerChunk
  }

  /**
   * Initialize the loader by fetching the full file content.
   * This happens once and is cached.
   */
  async initialize(path: string): Promise<void> {
    this.fullContent = await loadCodeFile(path)
    this.lines = this.fullContent.split("\n")
  }

  /**
   * Get total number of lines in the file.
   */
  getTotalLines(): number {
    return this.lines?.length ?? 0
  }

  /**
   * Get a specific chunk of lines.
   * @param startLine 0-indexed line number to start from
   * @returns CodeChunk with content and metadata
   */
  getChunk(startLine: number): CodeChunk {
    if (!this.lines) {
      throw new Error("ChunkedCodeLoader not initialized")
    }

    const endLine = Math.min(startLine + this.linesPerChunk, this.lines.length)
    const content = this.lines.slice(startLine, endLine).join("\n")
    const hasMore = endLine < this.lines.length

    return {
      content,
      startLine,
      endLine,
      hasMore,
    }
  }

  /**
   * Get multiple chunks at once.
   * @param startLine Starting line number
   * @param chunkCount Number of chunks to retrieve
   */
  getChunks(startLine: number, chunkCount: number): Array<CodeChunk> {
    const chunks: Array<CodeChunk> = []
    let currentLine = startLine

    for (let i = 0; i < chunkCount; i++) {
      const chunk = this.getChunk(currentLine)
      chunks.push(chunk)
      currentLine = chunk.endLine

      if (!chunk.hasMore) break
    }

    return chunks
  }

  /**
   * Get the full content (for formatting or small files).
   */
  getFullContent(): string {
    if (!this.fullContent) {
      throw new Error("ChunkedCodeLoader not initialized")
    }
    return this.fullContent
  }
}

// ============================================================================
// HELPER: Determine if chunking is needed
// ============================================================================

const CHUNK_THRESHOLD_LINES = 200

/**
 * Determine if a file should use chunked loading based on its size.
 * @param content Full file content
 * @returns true if chunking should be used
 */
export function shouldUseChunking(content: string): boolean {
  const lineCount = content.split("\n").length
  return lineCount > CHUNK_THRESHOLD_LINES
}
