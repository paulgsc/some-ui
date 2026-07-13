#!/usr/bin/env node
// Shared single-pass styles build runner — invoked as `some-styles-build
// [target]` from a workspace's package.json (cwd = that workspace's root, set
// by pnpm). This is the styles analogue of extensions/common/ext-build/run.mjs.
//
// Reads ./style.context.ts (a StyleContext object, see types.ts) and compiles
// the shared Tailwind layer ONCE over the declared `@source` union, emitting a
// single deterministic stylesheet. The abstract engine lives here; consumers
// only declare context.
import { relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { createJiti } from "jiti"

import { compileStyles } from "./compile.mjs"
import { resolveContext } from "./resolve-context.mjs"

const root = process.cwd()
const target = process.argv[2] || "default"

// style.context.ts is TypeScript; jiti loads it without a build step (same
// mechanism eslint uses to load flat configs).
const jiti = createJiti(
  pathToFileURL(resolve(root, "styles-build-runner")).href
)
const contextPath = resolve(root, "style.context.ts")

let context
try {
  context = await jiti.import(contextPath, { default: true })
} catch (error) {
  throw new Error(
    `some-styles-build: could not load style.context.ts in ${root}\n${
      error instanceof Error ? error.message : String(error)
    }`
  )
}

const { content, entry, outFile, minify } = resolveContext(
  context,
  root,
  target
)

const started = Date.now()
const { css } = await compileStyles({ content, entry, outFile, minify })

// eslint-disable-next-line no-console
console.log(
  `[some-styles-build] ${relative(root, outFile) || outFile} — ${(
    css.length / 1024
  ).toFixed(1)} kB from ${content.length} source glob(s) in ${
    Date.now() - started
  }ms`
)
