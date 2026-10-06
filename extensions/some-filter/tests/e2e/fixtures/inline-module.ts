/**
 * Compiles one of `src/adapter`'s zero-runtime-import modules
 * (`scope-registry.ts`, `custody-primitive.ts`) into a classic script to
 * inject into a bare test page.
 *
 * Their one cross-module reference is `import type` (erased), so there is no
 * module graph to resolve: `ts.transpileModule` strips types without a
 * bundler or a new test-only dependency.
 *
 * Wrapped in an IIFE assigning to `window[globalName]`: CommonJS output
 * needs only a local `exports`, and an inline `addScriptTag({ content })`
 * has no URL to resolve ES imports against.
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
