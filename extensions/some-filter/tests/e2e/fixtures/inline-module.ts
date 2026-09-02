/**
 * Compiles one of `src/adapter`'s zero-runtime-import modules
 * (`scope-registry.ts`, `custody-primitive.ts`) into a browser-runnable
 * classic script, for SF-RG's (#1265) own e2e specs to inject directly into
 * a bare test page — no wiring into `content.ts`/`pipeline.ts`/the real
 * built extension, per that story's own acceptance criteria.
 *
 * Both source modules were written to have zero runtime imports (their one
 * cross-module reference, `custody-primitive.ts`'s `import type { ...} from
 * "./scope-registry"`, is `import type` and is erased by the compiler,
 * confirmed directly: `ts.transpileModule` on either file emits no `import`/
 * `require` at all — see each file's own header comment). That is what
 * makes this the right tool for the job instead of a real bundler
 * (esbuild/vite): there is no cross-file module graph to resolve, so
 * `ts.transpileModule` (the TypeScript compiler already a real dependency
 * everywhere else in this monorepo) is enough to strip types, and no new
 * npm dependency needs to be added to the lockfile for a test-only need —
 * the same discipline `frames.ts`'s own header comment documents for why it
 * hand-decodes PNGs instead of adding a decoder package.
 *
 * The output is wrapped in an IIFE assigning to `window[globalName]`, not
 * loaded as an ES module: CommonJS's `exports.foo = foo` output needs only a
 * local `exports` object in scope, not a real module loader resolving a
 * specifier — which an inline `page.addScriptTag({ content })` (no real URL
 * for relative imports to resolve against) cannot provide anyway.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import ts from "typescript"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_ADAPTER = path.resolve(__dirname, "../../../src/adapter")

export function compileAdapterModuleForBrowser(
  fileName: string,
  globalName: string
): string {
  const filePath = path.join(SRC_ADAPTER, fileName)
  const source = fs.readFileSync(filePath, "utf8")

  const { outputText, diagnostics } = ts.transpileModule(source, {
    fileName: filePath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  })

  const errors = (diagnostics ?? []).filter(
    (d) => d.category === ts.DiagnosticCategory.Error
  )
  if (errors.length > 0) {
    const messages = errors
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
      .join("; ")
    throw new Error(
      `[inline-module] ${fileName} failed to transpile for browser injection: ${messages}`
    )
  }

  return [
    `window[${JSON.stringify(globalName)}] = (function () {`,
    `  const exports = {};`,
    outputText,
    `  return exports;`,
    `})();`,
  ].join("\n")
}
