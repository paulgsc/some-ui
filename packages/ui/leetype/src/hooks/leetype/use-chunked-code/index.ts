import { useCallback, useEffect, useRef, useState } from "react"
import type { CodeChunk, TextModel } from "@leetype/lib/leetype/load-code-file"
import { loadTextModel } from "@leetype/lib/leetype/load-code-file"
import { withTimeout } from "@leetype/utils"

type Options = {
  prettierParser: "typescript" | "babel" | "rust" | "cpp"
  linesPerChunk?: number
}

export type ChunkedCodeState = {
  status: "IDLE" | "LOADING" | "SUCCESS" | "ERROR"
  currentChunk: CodeChunk | undefined
  totalLines: number
  currentLine: number
  hasMore: boolean
  error: Error | null
  loadNextChunk: () => void
}

const TIMEOUT_MS = 5000

type FirstChunkResult = {
  model: TextModel
  chunk: CodeChunk
  totalLines: number
}

async function loadFirstChunk(
  path: string,
  linesPerChunk: number
): Promise<FirstChunkResult> {
  const model = await loadTextModel(path, linesPerChunk)

  return {
    model,
    chunk: model.getChunk(0),
    totalLines: model.getTotalLines(),
  }
}

/**
 * Hook for bounded-memory code loading.
 * Only keeps current chunk in memory, discards previous chunks.
 */

export function useChunkedCode(
  path: string,
  { linesPerChunk = 100 }: Options
): ChunkedCodeState {
  const [status, setStatus] = useState<ChunkedCodeState["status"]>("IDLE")
  const [currentChunk, setCurrentChunk] = useState<CodeChunk>()
  const [totalLines, setTotatLines] = useState(0)
  const [currentLine, setCurrentLine] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const loaderRef = useRef<TextModel | null>(null)

  const loadNextChunk = useCallback(() => {
    const loader = loaderRef.current
    if (!loader || status !== "SUCCESS" || !hasMore) return

    try {
      const chunk = loader.getChunk(currentLine)

      // Replace current chunk (bounded memory - old chunk is GC'd)
      setCurrentChunk(chunk)
      setCurrentLine(chunk.endLine)
      setHasMore(chunk.hasMore)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to load next chunk:", err)
      setStatus("ERROR")
      setError(
        err instanceof Error ? err : new Error(`Unknown error: ${String(err)}`)
      )
    }
  }, [status, hasMore, currentLine])

  useEffect(() => {
    const controller = new AbortController()

    async function run(): Promise<void> {
      if (!path) {
        setStatus("IDLE")
        setCurrentChunk(undefined)
        setTotatLines(0)
        setCurrentLine(0)
        setHasMore(false)
        setError(null)
        loaderRef.current = null
        return
      }

      setStatus("LOADING")
      setCurrentChunk(undefined)
      setError(null)
      setCurrentLine(0)
      loaderRef.current = null

      try {
        const result = await withTimeout(
          loadFirstChunk(path, linesPerChunk),
          TIMEOUT_MS,
          controller.signal
        )

        if (controller.signal.aborted) return

        loaderRef.current = result.model
        setCurrentChunk(result.chunk)
        setTotatLines(result.totalLines)
        setCurrentLine(result.chunk.endLine)
        setHasMore(result.chunk.hasMore)
        setStatus("SUCCESS")
      } catch (err) {
        if (controller.signal.aborted) return

        const errorObj =
          err instanceof Error
            ? err
            : new Error(`Unknown error: ${String(err)}`)

        // eslint-disable-next-line no-console
        console.error(`Failed to load code:`, errorObj.message)

        setStatus("ERROR")
        setError(errorObj)
        loaderRef.current = null
      }
    }

    void run()

    return (): void => controller.abort()
  }, [path, linesPerChunk])

  return {
    status,
    currentChunk,
    totalLines,
    currentLine,
    hasMore,
    error,
    loadNextChunk,
  }
}
