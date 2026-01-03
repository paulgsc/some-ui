import { useEffect, useState } from "react"
import { loadCodeFile } from "@input/lib/leetype/load-code-file"
import type { FormattedCodeState } from "@input/types/load-code-file"

type Options = {
  prettierParser: "typescript" | "babel" | "rust" | "cpp"
}

const TIMEOUT_MS = 5000

// ============================================================================
// GLOBAL PRETTIER CACHE - Load once, cache forever
// ============================================================================

let prettierCache: Promise<{
  format: Function
  plugins: Array<any>
}> | null = null

/**
 * Get Prettier with plugins (TypeScript or Babel).
 * Only imports modules ONCE, then caches the result forever.
 * No retries - import failures are logic errors, not transient failures.
 */
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

      // Handle both ESM default exports and direct exports
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

/**
 * Format code according to language capabilities.
 * Uses exhaustive case matching - all parsers are valid inputs,
 * but only some support formatting.
 */
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
      // Explicitly unsupported by Prettier — return as-is
      return raw

    default: {
      // Exhaustiveness check — should be unreachable
      parser satisfies never
      return raw
    }
  }
}

const initialState: FormattedCodeState = {
  status: "IDLE",
  code: undefined,
  error: undefined,
  attempt: 0,
}

export function useFormattedCode(
  path: string,
  { prettierParser }: Options
): FormattedCodeState {
  const [state, setState] = useState<FormattedCodeState>(initialState)

  useEffect(() => {
    if (!path) {
      setState(initialState)
      return
    }

    let cancelled = false

    async function run() {
      setState({
        status: "LOADING",
        code: undefined,
        error: undefined,
        attempt: 1,
      })

      try {
        // Set up timeout promise
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${TIMEOUT_MS}ms`)),
            TIMEOUT_MS
          )
        )

        // Race: format operation vs timeout
        // NOTE: Timeout only applies to formatting, NOT to Prettier imports
        const formatted = await Promise.race([
          (async () => {
            const raw = await loadCodeFile(path)
            return formatCode(raw, prettierParser)
          })(),
          timeoutPromise,
        ])

        if (!cancelled) {
          setState({
            status: "SUCCESS",
            code: formatted,
            error: undefined,
          })
        }
      } catch (err) {
        if (cancelled) return

        const error =
          err instanceof Error
            ? err
            : new Error(`Unknown error: ${String(err)}`)

        console.error(`Failed to format code:`, error.message)

        setState({
          status: "ERROR",
          code: undefined,
          error,
        })
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [path, prettierParser])

  return state
}

// ============================================================================
// OPTIONAL: Preload Prettier at app bootstrap
// ============================================================================

/**
 * Call this at app initialization to preload Prettier.
 * Example: in your root App.tsx or main.tsx
 *
 * ```ts
 * preloadPrettier("typescript").catch(console.error)
 * ```
 */
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
