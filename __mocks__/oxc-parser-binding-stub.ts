/**
 * Stub for `@oxc-parser/binding-wasm32-wasi`.
 *
 * Why this exists:
 *   `oxc-parser` is dragged into the Storybook *client* graph only transitively,
 *   via `@unocss/transformer-attributify-jsx` — a transformer the `unocss`
 *   meta-package bundles but that none of this repo's UnoCSS configs use. pnpm
 *   installs the *native* binding for the host platform (e.g.
 *   `@oxc-parser/binding-linux-x64-gnu`), not the wasm one that oxc-parser's
 *   `browser` entry (`src-js/wasm.js`) statically imports — so Vite's
 *   import-analysis / dep-optimization fails to resolve it.
 *
 *   oxc-parser only dereferences the binding when `parse`/`parseSync` are
 *   actually called, which never happens in Storybook. Aliasing the missing wasm
 *   binding to this stub resolves the import without shipping any wasm/native
 *   code and stays platform-neutral. If the parser is ever genuinely invoked in
 *   the browser bundle, these throw a clear error rather than failing obscurely.
 */
const notSupported = (): never => {
  throw new Error(
    "[oxc-parser stub] The WASM parser binding is stubbed in the browser bundle. " +
      "attributify-jsx is not used here; if you need oxc-parser at runtime, wire a real binding."
  )
}

export const parseSync = notSupported
export const parseAsync = async (): Promise<never> => notSupported()
export const parse = async (): Promise<never> => notSupported()
export const ParseResult = class {}
export const Comment = class {}
export const ExportExportNameKind = {}
export const ExportImportNameKind = {}
export const ExportLocalNameKind = {}
export const ImportNameKind = {}
export const Severity = {}
export default {}
