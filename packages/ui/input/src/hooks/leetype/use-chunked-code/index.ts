import { useCallback, useEffect, useRef, useState } from "react"
import type { CodeChunk, TextModel } from "@input/lib/leetype/load-code-file"
import { loadTextModel } from "@input/lib/leetype/load-code-file"

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
      setError(
        err instanceof Error ? err : new Error(`Unknown error: ${String(err)}`)
      )
    }
  }, [status, hasMore, currentLine])

  useEffect(() => {
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

    let cancelled = false

    async function run(): Promise<void> {
      setStatus("LOADING")
      setCurrentChunk(undefined)
      setError(null)
      setCurrentLine(0)

      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${TIMEOUT_MS}ms`)),
            TIMEOUT_MS
          )
        )

        const result = await Promise.race([
          (async () => {
            // Initialize loader (loads full file for chunking)
            const model = await loadTextModel(path, linesPerChunk)
            loaderRef.current = model

            // Get first chunk only
            const firstChunk = model.getChunk(0)
            const total = model.getTotalLines()

            return {
              chunk: firstChunk,
              totalLines: total,
              nextLine: firstChunk.endLine,
              hasMore: firstChunk.hasMore,
            }
          })(),
          timeoutPromise,
        ])

        if (!cancelled) {
          setCurrentChunk(result.chunk)
          setTotatLines(result.totalLines)
          setCurrentLine(result.nextLine)
          setHasMore(result.hasMore)
          setStatus("SUCCESS")
        }
      } catch (err) {
        if (cancelled) return

        const errorObj =
          err instanceof Error
            ? err
            : new Error(`Unknown error: ${String(err)}`)

        // eslint-disable-next-line no-console
        console.error(`Failed to load code:`, errorObj.message)

        setStatus("ERROR")
        setError(errorObj)
      }
    }

    run()

    return (): void => {
      cancelled = true
    }
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
