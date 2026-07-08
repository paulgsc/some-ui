import { useEffect, useState } from "react"
import { loadTextModel } from "@input/lib/leetype/load-code-file"
import type { FormattedCodeState } from "@input/types/load-code-file"
import { assertNever } from "@input/utils"

type Options = {
  prettierParser: "typescript" | "babel" | "rust" | "cpp"
}

const TIMEOUT_MS = 5000

// ============================================================================
// PRETTIER CACHE
// ============================================================================

type PrettierModule = {
  format: (
    content: string,
    options?: Record<string, unknown>
  ) => Promise<string>
  plugins: Array<unknown>
}

let prettierCache: Promise<PrettierModule> | undefined

function getPrettier(parser: "typescript" | "babel"): Promise<PrettierModule> {
  if (prettierCache) {
    return prettierCache
  }

  const promise: Promise<PrettierModule> = (async () => {
    const [standaloneMod, estreeMod, parserMod] = await Promise.all([
      import("prettier/standalone"),
      import("prettier/plugins/estree"),
      parser === "typescript"
        ? import("prettier/plugins/typescript")
        : import("prettier/plugins/babel"),
    ])

    const standalone =
      "default" in standaloneMod ? standaloneMod.default : standaloneMod

    const estree = "default" in estreeMod ? estreeMod.default : estreeMod

    const parserPlugin = "default" in parserMod ? parserMod.default : parserMod

    return {
      format: standalone.format,
      plugins: [parserPlugin, estree],
    }
  })()

  prettierCache = promise
  return promise
}

async function formatCode(
  raw: string,
  parser: Options["prettierParser"]
): Promise<string> {
  switch (parser) {
    case "typescript":
    case "babel": {
      const { format, plugins } = await getPrettier(parser)
      return format(raw, { parser, plugins })
    }

    case "rust":
    case "cpp": {
      return raw
    }

    default: {
      parser satisfies never
      assertNever(parser)
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

    async function run(): Promise<void> {
      setState({
        status: "LOADING",
        code: undefined,
        error: undefined,
        attempt: 1,
      })

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          const id = setTimeout(() => {
            reject(new Error(`Timeout after ${TIMEOUT_MS}ms`))
          }, TIMEOUT_MS)

          return (): void => clearTimeout(id)
        })

        const formatted = await Promise.race([
          (async () => {
            const model = await loadTextModel(path)
            const fullChunk = model.getChunk(0)

            const raw = fullChunk.hasMore
              ? await fetch(path).then((r) => r.text())
              : fullChunk.content

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

        // eslint-disable-next-line no-console
        console.error("Failed to format code:", error.message)

        setState({
          status: "ERROR",
          code: undefined,
          error,
        })
      }
    }

    void run()

    return (): void => {
      cancelled = true
    }
  }, [path, prettierParser])

  return state
}

export async function preloadPrettier(
  parser: "typescript" | "babel" = "typescript"
): Promise<void> {
  await getPrettier(parser)
}
