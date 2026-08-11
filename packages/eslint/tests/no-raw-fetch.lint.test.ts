import { defineConfig } from "eslint/config"
import { describe, expect, it } from "vitest"

import { noRawFetch } from "../src/rules/no-raw-fetch.js"
import { lintSnippet } from "./helpers/eslint-resolver.js"

const config = defineConfig({
  files: ["**/*.ts"],
  plugins: { boundary: { rules: { "no-raw-fetch": noRawFetch } } },
  rules: { "boundary/no-raw-fetch": "error" },
})

describe("no-raw-fetch", () => {
  it("flags bare fetch in package code and points at fetch-kit", async () => {
    const messages = await lintSnippet(
      config,
      `export const load = () => fetch("/data")`,
      "packages/example/src/load.ts"
    )
    expect(messages).toHaveLength(1)
    expect(messages[0]?.message).toContain("@some-ui/fetch-kit")
  })

  it("does not confuse a member method with the global", async () => {
    const messages = await lintSnippet(
      config,
      `export const load = (source) => source.fetch()`,
      "packages/example/src/load.ts"
    )
    expect(messages).toHaveLength(0)
  })

  it("supports a path allowlist", async () => {
    const allowlisted = defineConfig({
      ...config[0],
      rules: {
        "boundary/no-raw-fetch": [
          "error",
          { allowlist: ["packages/example/src/load.ts"] },
        ],
      },
    })
    const messages = await lintSnippet(
      allowlisted,
      `export const load = () => fetch("/data")`,
      "packages/example/src/load.ts"
    )
    expect(messages).toHaveLength(0)
  })

  it("does not cover extension workspaces", async () => {
    const messages = await lintSnippet(
      config,
      `export const load = () => fetch("/data")`,
      "extensions/example/src/load.ts"
    )
    expect(messages).toHaveLength(0)
  })
})
