import { assertNever } from "@leetype/utils"

/**
 * Matches `Language` 1:1 - every supported language routes through here,
 * even the ones prettier can't format on its own (see `formatCode` below).
 */
export type PrettierParser = "typescript" | "rust" | "cpp" | "c"

type PrettierModule = {
  format: (
    content: string,
    options?: Record<string, unknown>
  ) => Promise<string>
  plugins: Array<unknown>
}

// Module-level cache (not per-hook-instance) so every caller - the real
// chunked-code loader and the storybook-only formatted-code preview alike -
// shares one lazily-loaded prettier bundle instead of each paying its own
// dynamic-import cost.
let prettierCache: Promise<PrettierModule> | undefined

function getPrettier(): Promise<PrettierModule> {
  if (prettierCache) {
    return prettierCache
  }

  const promise: Promise<PrettierModule> = (async () => {
    const [standaloneMod, estreeMod, typescriptMod] = await Promise.all([
      import("prettier/standalone"),
      import("prettier/plugins/estree"),
      import("prettier/plugins/typescript"),
    ])

    const standalone =
      "default" in standaloneMod ? standaloneMod.default : standaloneMod
    const estree = "default" in estreeMod ? estreeMod.default : estreeMod
    const typescript =
      "default" in typescriptMod ? typescriptMod.default : typescriptMod

    return {
      format: standalone.format,
      plugins: [typescript, estree],
    }
  })()

  prettierCache = promise
  return promise
}

/**
 * Formats `raw` for display. Only `typescript` has a bundled prettier
 * plugin here - rust/cpp/c pass through unchanged rather than being run
 * through a parser that can't understand their syntax (prettier has no
 * built-in support for them, and no community plugin is bundled).
 */
export async function formatCode(
  raw: string,
  parser: PrettierParser
): Promise<string> {
  switch (parser) {
    case "typescript": {
      const { format, plugins } = await getPrettier()
      return format(raw, { parser: "typescript", plugins })
    }

    case "rust":
    case "cpp":
    case "c": {
      return raw
    }

    default: {
      parser satisfies never
      return assertNever(parser)
    }
  }
}

export async function preloadPrettier(): Promise<void> {
  await getPrettier()
}
