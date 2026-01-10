import { useCallback, useEffect, useRef, useState } from "react"
import {
  ChunkedCodeLoader,
  loadCodeFile,
  shouldUseChunking,
  type CodeChunk,
} from "@input/lib/leetype/load-code-file"

type Options = {
  prettierParser: "typescript" | "babel" | "rust" | "cpp"
  linesPerChunk?: number
  initialChunkCount?: number
}

export type ChunkedCodeState = {
  status: "IDLE" | "LOADING" | "SUCCESS" | "ERROR"
  chunks: Array<CodeChunk>
  fullContent: string | undefined
  useChunking: boolean
  hasMore: boolean
  error: Error | undefined
  loadMore: () => void
}

const TIMEOUT_MS = 5000

let prettierCache: Promise<{
  format: Function
  plugins: Array<any>
}> | null = null

function getPrettier(parser: "typescript" | "babel") {
  if (!prettierCache) {
    prettierCache = (async () => {
      const [{ format }, estreeMod, parserMod] = await Promise.all([
        import("prettier/standalone"),
        import("prettier/plugins/estree"),
        parser === "typescript"
          ? import("prettier/parser-typescript")
          : import("prettier/parser-babel"),
      ])

      const estree = "default" in estreeMod ? estreeMod.default : estreeMod
      const parserPlugin =
        "default" in parserMod ? parserMod.default : parserMod

      return {
        format,
        plugins: [parserPlugin, estree],
      }
    })()
  }

  return prettierCache
}

async function formatCode(
  raw: string,
  parser: Options["prettierParser"]
): Promise<string> {
  switch (parser) {
    case "typescript":
    case "babel": {
      const { format, plugins } = await getPrettier(parser)
      return format(raw, {
        parser,
        plugins,
      })
    }

    case "rust":
    case "cpp":
      return raw

    default: {
      parser satisfies never
      return raw
    }
  }
}

/**
 * Hook for loading code with automatic chunking for large files.
 * Small files are loaded fully and formatted.
 * Large files are chunked and loaded progressively (no formatting).
 */
export function useChunkedCode(
  path: string,
  { prettierParser, linesPerChunk = 50, initialChunkCount = 3 }: Options
): ChunkedCodeState {
  const [status, setStatus] = useState<ChunkedCodeState["status"]>("IDLE")
  const [chunks, setChunks] = useState<Array<CodeChunk>>([])
  const [fullContent, setFullContent] = useState<string>()
  const [useChunking, setUseChunking] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<Error>()

  const loaderRef = useRef<ChunkedCodeLoader | null>(null)
  const nextLineRef = useRef(0)

  const loadMore = useCallback(() => {
    if (!loaderRef.current || status !== "SUCCESS" || !hasMore) return

    try {
      const newChunks = loaderRef.current.getChunks(nextLineRef.current, 1)
      setChunks((prev) => [...prev, ...newChunks])

      const lastChunk = newChunks[newChunks.length - 1]
      if (lastChunk) {
        nextLineRef.current = lastChunk.endLine
        setHasMore(lastChunk.hasMore)
      }
    } catch (err) {
      console.error("Failed to load more chunks:", err)
      setError(
        err instanceof Error ? err : new Error(`Unknown error: ${String(err)}`)
      )
    }
  }, [status, hasMore])

  useEffect(() => {
    if (!path) {
      setStatus("IDLE")
      setChunks([])
      setFullContent(undefined)
      setUseChunking(false)
      setHasMore(false)
      setError(undefined)
      nextLineRef.current = 0
      loaderRef.current = null
      return
    }

    let cancelled = false

    async function run() {
      setStatus("LOADING")
      setChunks([])
      setFullContent(undefined)
      setError(undefined)
      nextLineRef.current = 0

      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${TIMEOUT_MS}ms`)),
            TIMEOUT_MS
          )
        )

        const result = await Promise.race([
          (async () => {
            // Load full content first
            const raw = await loadCodeFile(path)
            const needsChunking = shouldUseChunking(raw)

            if (needsChunking) {
              // Large file: use chunking, skip formatting
              const loader = new ChunkedCodeLoader(linesPerChunk)
              await loader.initialize(path)
              loaderRef.current = loader

              const initialChunks = loader.getChunks(0, initialChunkCount)
              const lastChunk = initialChunks[initialChunks.length - 1]

              return {
                chunks: initialChunks,
                fullContent: undefined,
                useChunking: true,
                hasMore: lastChunk.hasMore ?? false,
                nextLine: lastChunk.endLine ?? 0,
              }
            }
            // Small file: format and load fully
            const formatted = await formatCode(raw, prettierParser)
            return {
              chunks: [],
              fullContent: formatted,
              useChunking: false,
              hasMore: false,
              nextLine: 0,
            }
          })(),
          timeoutPromise,
        ])

        if (!cancelled) {
          setChunks(result.chunks)
          setFullContent(result.fullContent)
          setUseChunking(result.useChunking)
          setHasMore(result.hasMore)
          nextLineRef.current = result.nextLine
          setStatus("SUCCESS")
        }
      } catch (err) {
        if (cancelled) return

        const errorObj =
          err instanceof Error
            ? err
            : new Error(`Unknown error: ${String(err)}`)

        console.error(`Failed to load code:`, errorObj.message)

        setStatus("ERROR")
        setError(errorObj)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [path, prettierParser, linesPerChunk, initialChunkCount])

  return {
    status,
    chunks,
    fullContent,
    useChunking,
    hasMore,
    error,
    loadMore,
  }
}

export async function preloadPrettier(
  parser: "typescript" | "babel" = "typescript"
) {
  try {
    await getPrettier(parser)
    console.log(`✅ Prettier preloaded with ${parser} parser`)
  } catch (err) {
    console.error(`❌ Failed to preload Prettier:`, err)
    throw err
  }
}
