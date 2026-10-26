/**
 * Lint-time tests for catch-guard/require-ignored-reason (FT2): a catch that
 * drops its error with no statement says why, in an `Ignored:` line.
 */

import catchGuardConfig from "@eslint/configs/catch-guard.config.js"
import { extensionsRecommended, maishatuRecommended } from "@eslint/index.js"
import typescriptParser from "@typescript-eslint/parser"
import type { Linter } from "eslint"
import { defineConfig } from "eslint/config"
import type { Config } from "typescript-eslint"
import { describe, expect, it } from "vitest"

import {
  expectMessageForRule,
  expectNoMessageForRule,
  lintSnippet,
} from "./helpers/eslint-resolver.js"

// typescript-eslint's `Config` (the presets' type) and eslint's
// `Linter.Config` describe the same flat config, with languageOptions types
// that do not line up; ESLint takes either at runtime.
const flat = (preset: Config): Array<Linter.Config> =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
  preset as unknown as Array<Linter.Config>

const RULE = "catch-guard/require-ignored-reason"
const TS_FILE = "src/index.ts"
const config = defineConfig([
  { files: ["**/*.ts"], languageOptions: { parser: typescriptParser } },
  ...catchGuardConfig,
])

const lint = async (
  code: string,
  file = TS_FILE
): ReturnType<typeof lintSnippet> => {
  const msgs = await lintSnippet(config, code, file)
  expect(
    msgs.filter((m) => m.fatal === true),
    code
  ).toEqual([])
  return msgs
}

describe("lint: catch-guard/require-ignored-reason (FT2)", () => {
  it("fires on a catch clause that drops its error with no reason", async () => {
    for (const code of [
      `try { f() } catch {}`,
      `try { f() } catch (error) {}`,
      `try { f() } catch {\n  // storage may be gone\n}`,
      // The word must open the line.
      `try { f() } catch {\n  // Not Ignored: here\n}`,
      // A reason above the try is not the catch's.
      `// Ignored: above the try\ntry { f() } catch {}`,
    ]) {
      expectMessageForRule(await lint(code), RULE, code)
    }
  })

  it("fires on a .catch whose handler does nothing, with no reason", async () => {
    for (const code of [
      `p.catch(() => {})`,
      `p.catch(() => undefined)`,
      `p.catch(() => null)`,
      `p.catch(() => void 0)`,
      `p.catch(function () {})`,
      `void p.then(f).catch((_error: unknown) => undefined)`,
      // A code line breaks the block above.
      `// Ignored: about something else\nconst x = 1\np.catch(() => undefined)`,
      // A blank line breaks it too.
      `// Ignored: about something else\n\np.catch(() => undefined)`,
    ]) {
      expectMessageForRule(await lint(code), RULE, code)
    }
  })

  it("does NOT fire when the catch says why", async () => {
    for (const code of [
      `try { f() } catch {\n  // Ignored: a missing file is the empty list.\n}`,
      `try { f() } catch {\n  // Storage may be gone.\n  // Ignored: the record stays in memory.\n}`,
      `try { f() } catch {\n  /* Ignored: best effort */\n}`,
      `try { f() } catch {\n  /*\n   * Ignored: best effort\n   */\n}`,
      `p.catch(() => {\n  // Ignored: the next sweep clears it.\n})`,
      `// Ignored: the next sweep clears it.\np.catch(() => undefined)`,
      `void p\n  .then(f)\n  // Ignored: the next sweep clears it.\n  .catch(() => undefined)`,
      `// Ignored: the next sweep clears it.\n//\n// More on why.\nvoid p\n  .then(f)\n  .catch(() => undefined)`,
    ]) {
      expectNoMessageForRule(await lint(code), RULE, code)
    }
  })

  it("does NOT fire on a catch that does something", async () => {
    for (const code of [
      `try { f() } catch { return null }`,
      `try { f() } catch (error) { report(error) }`,
      `p.catch((error: unknown) => report(error))`,
      `p.catch(() => fallback)`,
      `p.catch(report)`,
      // Not a promise's catch.
      `p.catch()`,
      `p["catch"](() => undefined)`,
    ]) {
      expectNoMessageForRule(await lint(code), RULE, code)
    }
  })

  it("is on in every preset outside tests", async () => {
    const code = `try { f() } catch {}`
    for (const preset of [maishatuRecommended, extensionsRecommended]) {
      // A .mjs outside src/ needs no tsconfig to parse.
      for (const file of ["src/index.ts", "scripts/tool.mjs"]) {
        const msgs = await lintSnippet(flat(preset), code, file)
        expectMessageForRule(msgs, RULE, `${file}: ${code}`)
      }
      for (const file of ["src/__tests__/a.test.mjs", "tests/a.mjs"]) {
        const msgs = await lintSnippet(flat(preset), code, file)
        expect(
          msgs.filter((m) => m.fatal === true),
          file
        ).toEqual([])
        expectNoMessageForRule(msgs, RULE, `${file}: ${code}`)
      }
    }
  })
})
