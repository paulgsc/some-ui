import { useEffect, useState } from "react"
import { loadTextModel } from "@leetype/lib/leetype/load-code-file"
import type { FormattedCodeState } from "@leetype/types/load-code-file"
import { assertNever, withTimeout } from "@leetype/utils"

export type PrettierParser = "typescript" | "babel"

type Options = {
  prettierParser: PrettierParser | "rust" | "cpp"
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

function getPrettier(parser: PrettierParser): Promise<PrettierModule> {
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

async function loadFormattedCode(
  path: string,
  prettierParser: Options["prettierParser"],
  signal: AbortSignal
): Promise<string> {
  const model = await loadTextModel(path)
  const fullChunk = model.getChunk(0)

  const raw = fullChunk.hasMore
    ? await fetch(path, { signal }).then((r) => r.text())
    : fullChunk.content

  return formatCode(raw, prettierParser)
}

const idleState: FormattedCodeState = {
  status: "IDLE",
  code: undefined,
  error: undefined,
  attempt: 0,
}

const loadingState = (): FormattedCodeState => ({
  status: "LOADING",
  code: undefined,
  error: undefined,
  attempt: 1,
})

const successState = (code: string): FormattedCodeState => ({
  status: "SUCCESS",
  code,
  error: undefined,
})

const errorState = (error: Error): FormattedCodeState => ({
  status: "ERROR",
  code: undefined,
  error,
})

export function useFormattedCode(
  path: string,
  { prettierParser }: Options
): FormattedCodeState {
  const [state, setState] = useState<FormattedCodeState>(idleState)

  useEffect(() => {
    const controller = new AbortController()

    async function run(): Promise<void> {
      if (!path) {
        setState(idleState)
        return
      }

      setState(loadingState())

      try {
        const formatted = await withTimeout(
          loadFormattedCode(path, prettierParser, controller.signal),
          TIMEOUT_MS,
          controller.signal
        )

        if (!controller.signal.aborted) {
          setState(successState(formatted))
        }
      } catch (err) {
        if (controller.signal.aborted) return

        const error =
          err instanceof Error
            ? err
            : new Error(`Unknown error: ${String(err)}`)

        // eslint-disable-next-line no-console
        console.error("Failed to format code:", error.message)

        setState(errorState(error))
      }
    }

    void run()

    return (): void => controller.abort()
  }, [path, prettierParser])

  return state
}

export async function preloadPrettier(
  parser: PrettierParser = "typescript"
): Promise<void> {
  await getPrettier(parser)
}
