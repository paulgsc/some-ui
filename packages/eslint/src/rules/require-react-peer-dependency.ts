import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { Rule } from "eslint"

// ESTree JSX nodes (JSXElement/JSXFragment) aren't in @types/eslint's Node
// union, so those visitor keys are read loosely and narrowed by `.type`,
// matching the convention documented in the other rules in this directory.
/* eslint-disable @typescript-eslint/no-explicit-any -- ESTree JSX shapes not modeled by @types/eslint's Node union, see comment above */

/**
 * A workspace that builds with the shared `@some-ui/vite-config` has react and
 * react-dom force-externalized (they're never bundled). For that externalized
 * reference to survive as a clean ESM `import ... from "react"` — rather than a
 * runtime `require("react")` that throws in the browser — the package MUST
 * declare react/react-dom in `peerDependencies`, so the bundler treats them as
 * consumer-provided peers. Every React library in the repo does this; the ones
 * that forgot only fail at runtime in a consuming app, never at build time.
 */
type PkgInfo = {
  /** Builds with the shared react-externalizing vite config. */
  isViteConfigLib: boolean
  peerDeps: Set<string>
  name: string
}

// Keyed by directory; every dir walked while resolving a file is memoized to
// the same result so the package.json read happens at most once per package
// across the whole lint run.
const dirCache = new Map<string, PkgInfo | null>()

function resolvePkgInfo(fromFile: string): PkgInfo | null {
  const chain: Array<string> = []
  let dir = dirname(fromFile)

  for (;;) {
    const cached = dirCache.get(dir)
    if (cached !== undefined) {
      for (const d of chain) dirCache.set(d, cached)
      return cached
    }
    chain.push(dir)

    const pkgPath = join(dir, "package.json")
    if (existsSync(pkgPath)) {
      let info: PkgInfo | null
      try {
        const pkg: {
          name?: string
          devDependencies?: Record<string, string>
          peerDependencies?: Record<string, string>
        } = JSON.parse(readFileSync(pkgPath, "utf8"))
        info = {
          isViteConfigLib: Boolean(
            pkg.devDependencies?.["@some-ui/vite-config"]
          ),
          peerDeps: new Set(Object.keys(pkg.peerDependencies ?? {})),
          name: pkg.name ?? dir,
        }
      } catch {
        info = null
      }
      for (const d of chain) dirCache.set(d, info)
      return info
    }

    const parent = dirname(dir)
    if (parent === dir) {
      for (const d of chain) dirCache.set(d, null)
      return null
    }
    dir = parent
  }
}

function isReactDomSource(value: string): boolean {
  return value === "react-dom" || value.startsWith("react-dom/")
}

function isReactSource(value: string): boolean {
  // react/jsx-runtime etc. still imply the react peer; react-dom is handled
  // separately so its own peer entry gets checked.
  return (
    (value === "react" || value.startsWith("react/")) &&
    !isReactDomSource(value)
  )
}

export const requireReactPeerDependency: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Require react/react-dom in peerDependencies for packages that build with the shared @some-ui/vite-config, which force-externalizes them. Missing the peer entry lets the bundler emit a runtime require("react") into the ESM output that only fails when a consuming app loads it.',
    },
    schema: [],
    messages: {
      missingReactPeer:
        '{{name}} uses React but does not list "react" in peerDependencies. The shared @some-ui/vite-config externalizes react, so without the peer entry the emitted bundle can call require("react") and fail at runtime in a consumer. Add "react" to peerDependencies.',
      missingReactDomPeer:
        '{{name}} imports react-dom but does not list "react-dom" in peerDependencies. The shared @some-ui/vite-config externalizes react-dom; add "react-dom" to peerDependencies so the emitted bundle references it as a consumer-provided peer.',
    },
  },
  create(context) {
    let reactNode: any = null
    let reactDomNode: any = null

    const noteReact = (node: any): void => {
      if (!reactNode) reactNode = node
    }
    const noteReactDom = (node: any): void => {
      if (!reactDomNode) reactDomNode = node
    }

    return {
      ImportDeclaration(node): void {
        const value = node.source.value
        if (typeof value !== "string") return
        if (isReactDomSource(value)) noteReactDom(node)
        else if (isReactSource(value)) noteReact(node)
      },
      // JSX compiles to react/jsx-runtime under the automatic runtime, so a
      // component can use React with no `import ... from "react"` at all —
      // catch that too, otherwise the most common case slips through.
      JSXElement(node: any): void {
        noteReact(node)
      },
      JSXFragment(node: any): void {
        noteReact(node)
      },
      "Program:exit"(): void {
        if (!reactNode && !reactDomNode) return

        const info = resolvePkgInfo(context.filename)
        // Only packages built with the shared react-externalizing vite config
        // need the peer entries. Apps (e.g. www) bundle react as a direct
        // dependency and have no @some-ui/vite-config — skip them.
        if (!info?.isViteConfigLib) return

        if (reactNode && !info.peerDeps.has("react")) {
          context.report({
            node: reactNode,
            messageId: "missingReactPeer",
            data: { name: info.name },
          })
        }
        if (reactDomNode && !info.peerDeps.has("react-dom")) {
          context.report({
            node: reactDomNode,
            messageId: "missingReactDomPeer",
            data: { name: info.name },
          })
        }
      },
    }
  },
}
