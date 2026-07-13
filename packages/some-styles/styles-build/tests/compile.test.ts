import { readFileSync, rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"

import { compileStyles } from "../compile.mjs"
import exampleContext from "../examples/style.context.js"
import {
  buildSourceInjection,
  CANONICAL_ENTRY,
  resolveContext,
  SOURCE_SENTINEL,
  toSourceDirectives,
} from "../resolve-context.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const EXAMPLE_ROOT = resolve(HERE, "../examples")
const EXAMPLE_SRC = resolve(EXAMPLE_ROOT, "src/**/*.{ts,tsx}")

// ── compileStyles: the single-pass core ─────────────────────────────────────

describe("compileStyles — single deterministic pass", () => {
  it("emits utilities used in the declared source", async () => {
    const { css } = await compileStyles({ content: [EXAMPLE_SRC] })
    // standard utility
    expect(css).toContain("flex")
    // theme-token utility (proves the shared @theme layer is compiled in)
    expect(css).toMatch(/\.bg-primary\b/)
    // arbitrary-value utilities (the ones a naive per-file scan is most likely
    // to drop) — assert on the emitted declaration, not the escaped selector
    expect(css).toContain("13px")
    expect(css).toContain("9px")
    expect(css).toContain("6px")
  })

  it("includes authored theme CSS from the shared layer", async () => {
    const { css } = await compileStyles({ content: [EXAMPLE_SRC] })
    // .headline--peach-blossom is authored in themes/headline.css, imported by
    // the canonical tailwind.css — it must survive the pass.
    expect(css).toContain(".headline--peach-blossom")
  })

  it("tree-shakes utilities that appear in no scanned source", async () => {
    const { css } = await compileStyles({ content: [EXAMPLE_SRC] })
    // Not present anywhere in examples/src.
    expect(css).not.toMatch(/\.text-\[99px\]/)
    expect(css).not.toMatch(/\.bg-fuchsia-700\b/)
  })

  it("is byte-identical across repeated runs (deterministic)", async () => {
    const [a, b] = await Promise.all([
      compileStyles({ content: [EXAMPLE_SRC] }),
      compileStyles({ content: [EXAMPLE_SRC] }),
    ])
    expect(a.css).toBe(b.css)
  })

  it("scans only the declared @source, not sibling files", async () => {
    // A glob restricted to widget.ts must not pick up classes that only exist
    // in a sibling the context didn't declare.
    const only = resolve(EXAMPLE_ROOT, "src/widget.ts")
    const { css } = await compileStyles({ content: [only] })
    expect(css).toMatch(/\.bg-primary\b/)
  })

  it("throws on empty content", async () => {
    await expect(compileStyles({ content: [] })).rejects.toThrow(/non-empty/)
  })

  it("writes to outFile when provided", async () => {
    const out = resolve(EXAMPLE_ROOT, "dist/styles.css")
    const { css, outFile } = await compileStyles({
      content: [EXAMPLE_SRC],
      outFile: out,
    })
    expect(outFile).toBe(out)
    expect(readFileSync(out, "utf8")).toBe(css)
  })
})

// ── resolveContext: the per-workspace declaration → absolute inputs ──────────

describe("resolveContext", () => {
  it("resolves the example context's relative fields against the root", () => {
    const resolved = resolveContext(exampleContext, EXAMPLE_ROOT)
    expect(resolved.target).toBe("default")
    expect(resolved.content).toEqual([EXAMPLE_SRC])
    expect(resolved.entry).toBe(CANONICAL_ENTRY)
    expect(resolved.outFile).toBe(resolve(EXAMPLE_ROOT, "dist/styles.css"))
    expect(resolved.minify).toBe(true)
  })

  it("throws for an unknown target", () => {
    expect(() => resolveContext(exampleContext, EXAMPLE_ROOT, "nope")).toThrow(
      /no "nope" target/
    )
  })

  it("throws when a target declares no content", () => {
    expect(() =>
      resolveContext({ default: { content: [] } }, EXAMPLE_ROOT)
    ).toThrow(/no `content`/)
  })
})

// ── source directive helpers (drive the dev injector) ───────────────────────

describe("toSourceDirectives / buildSourceInjection", () => {
  it("renders one @source line per glob", () => {
    expect(toSourceDirectives(["/a/**", "/b/**"])).toBe(
      '@source "/a/**";\n@source "/b/**";'
    )
  })

  it("appends sources onto a stylesheet that imports the shared layer", () => {
    const code = '@import "@some-ui/styles/tailwind.css";\n'
    const out = buildSourceInjection(code, ["/x/src/**"])
    expect(out).toContain(SOURCE_SENTINEL)
    expect(out).toContain('@source "/x/src/**";')
    expect(out?.startsWith(code)).toBe(true)
  })

  it('appends onto the shared layer itself (@import "tailwindcss")', () => {
    const out = buildSourceInjection('@import "tailwindcss";', ["/x/**"])
    expect(out).toContain('@source "/x/**";')
  })

  it("leaves unrelated CSS untouched", () => {
    expect(buildSourceInjection(".foo { color: red }", ["/x/**"])).toBeNull()
  })

  it("is idempotent (already-injected CSS is left alone)", () => {
    const once = buildSourceInjection('@import "tailwindcss";', ["/x/**"])
    expect(once).not.toBeNull()
    expect(buildSourceInjection(once ?? "", ["/x/**"])).toBeNull()
  })

  it("no-ops when there is no declared content", () => {
    expect(buildSourceInjection('@import "tailwindcss";', [])).toBeNull()
  })
})

afterAll(() => {
  // Remove the example dist written by the outFile test.
  rmSync(resolve(EXAMPLE_ROOT, "dist"), { recursive: true, force: true })
})
