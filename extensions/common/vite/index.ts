// Shared extension build for the browser-extension workspaces. One `vite build`
// per extension, driven by a single `extensionConfig({ … })` in that
// extension's `vite.config.ts` — no bespoke build runner, no per-entry shell
// soup. After Rollup optimizes the shared graph, each entry is flattened into
// one self-contained file: classic entries (content/background) as IIFEs,
// module pages (popup) as self-contained ESM. See ./flatten-entries.ts for why.
export { extensionConfig } from "./extension-config"
export type { ExtensionConfigOptions, ExtensionEntry } from "./extension-config"
export { flattenEntries } from "./flatten-entries"
export type { FlattenTarget } from "./flatten-entries"
export { copyFiles } from "./copy-files"
export type { CopyStep } from "./copy-files"
export { emitUnocss } from "./emit-unocss"
export type { UnocssBuild } from "./emit-unocss"
