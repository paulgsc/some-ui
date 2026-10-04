import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"
import type { EmittedChunk } from "@/bundle-paths/index.js"
import {
  checkExclusivity,
  checkPaths,
  definePaths,
  describePathViolation,
  globToRegExp,
  moduleId,
  presentSources,
  readBuild,
} from "@/bundle-paths/index.js"
import { build } from "vite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// One real build of a small app, the way www builds: minified, with
// `moduleSideEffects: false`, read back from disk with `--manifest` and
// hidden sourcemaps. Built once with the flag off (a web build) and once on.
let root: string

function write(path: string, content: string): void {
  const file = join(root, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

async function buildApp(flag: boolean): Promise<ReturnType<typeof readBuild>> {
  const outDir = join(root, flag ? "dist-native" : "dist-web")
  await build({
    root,
    logLevel: "silent",
    configFile: false,
    define: {
      "import.meta.env.VITE_FX_NATIVE": JSON.stringify(flag ? "true" : ""),
    },
    build: {
      outDir,
      emptyOutDir: true,
      manifest: true,
      sourcemap: "hidden",
      rolldownOptions: { treeshake: { moduleSideEffects: false } },
    },
  })
  return readBuild(outDir, root, root)
}

let web: ReturnType<typeof readBuild>
let native: ReturnType<typeof readBuild>

beforeAll(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "bundle-paths-")))
  write(
    "index.html",
    `<!doctype html><script type="module" src="/main.js"></script>`
  )
  // The leak this check exists for: a flag read in one module and exported,
  // guarding an import() in another. The bundler folds the branch, but only
  // after it has laid out the chunk the import() named.
  write(
    "flag.js",
    `export const NATIVE = import.meta.env.VITE_FX_NATIVE === "true"`
  )
  write(
    "leaky.js",
    `import { NATIVE } from "./flag.js"
export function leaky() {
  if (NATIVE) return import("./native/exported.js").then((m) => m.run())
  return Promise.resolve("web")
}`
  )
  // The same branch, with the flag read where it is branched on.
  write(
    "tight.js",
    `export function tight() {
  if (import.meta.env.VITE_FX_NATIVE === "true")
    return import("./native/literal.js").then((m) => m.run())
  return Promise.resolve("web")
}`
  )
  write(
    "native/exported.js",
    `export function run() { return "EXPORTED_NATIVE_" + Date.now() }`
  )
  write(
    "native/literal.js",
    `export function run() { return "LITERAL_NATIVE_" + Date.now() }`
  )
  // Pages: one on the path, one off it, and a chunk only the off one loads.
  write(
    "pages/on.js",
    `export function page() { return "ON_PAGE_" + Date.now() }`
  )
  write(
    "pages/off.js",
    `export function page() { return import("../deep/only-off.js").then((m) => m.deep() + "OFF_PAGE") }`
  )
  write(
    "deep/only-off.js",
    `export function deep() { return "ONLY_OFF_" + Date.now() }`
  )
  write(
    "main.js",
    `import { leaky } from "./leaky.js"
import { tight } from "./tight.js"
leaky().then((a) => tight().then((b) => { document.title = a + b }))
document.body.onclick = () => import("./pages/on.js").then((m) => m.page())
document.body.ondblclick = () => import("./pages/off.js").then((m) => m.page())`
  )
  web = await buildApp(false)
  native = await buildApp(true)
}, 60_000)

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const none = definePaths<"web" | "native">({
  exclusive: [],
  allowlists: [],
  required: [],
  debt: [],
  decidedElsewhere: [],
})

const modules = (contents: ReturnType<typeof readBuild>): Array<string> =>
  contents.chunks.flatMap((chunk) => [...chunk.modules.keys()]).sort()

describe("moduleId", () => {
  it("names repo files from the root, and npm files from inside node_modules", () => {
    expect(
      moduleId("/repo/apps/www/src/a.ts?tsr-split=component", "/repo")
    ).toBe("apps/www/src/a.ts?tsr-split=component")
    expect(
      moduleId(
        "/repo/node_modules/.pnpm/@capacitor+core@8.5.2/node_modules/@capacitor/core/dist/index.js",
        "/repo"
      )
    ).toBe("node_modules/@capacitor/core/dist/index.js")
    expect(moduleId("/elsewhere/x.js", "/repo")).toBe("/elsewhere/x.js")
  })
})

describe("readBuild", () => {
  it("names the modules a chunk carries, relative to the repo", () => {
    expect(modules(native)).toEqual(
      expect.arrayContaining([
        "main.js",
        "native/exported.js",
        "native/literal.js",
        "pages/on.js",
        "pages/off.js",
        "deep/only-off.js",
      ])
    )
  })

  it("does not count a module whose code the bundler dropped", () => {
    expect(modules(web)).not.toContain("native/literal.js")
    // Its chunk is still written, and carries it (below).
    expect(modules(web)).toContain("native/exported.js")
  })

  it("keeps the chunk behind a flag read through an exported constant, loaded by nothing", () => {
    // Pins the bundler behaviour the check exists for. If this fails, the
    // bundler now folds before laying out chunks: good news, and the reason
    // to read VITE_ flags in place (apps/www/src/vite-env.d.ts) is gone.
    const orphans: Array<EmittedChunk> = web.chunks.filter(
      (chunk) => !chunk.reachable
    )
    expect(orphans).toHaveLength(1)
    const [orphan] = orphans
    expect(orphan?.facades).toEqual(["native/exported.js"])
  })

  it("emits nothing for the same branch with the flag read in place", () => {
    const facades = web.chunks.flatMap((chunk) => chunk.facades)
    expect(facades).not.toContain("native/literal.js")
  })
})

describe("checkPaths", () => {
  it("reports an orphan chunk, and says what usually leaves one", () => {
    const violations = checkPaths("web", web, none)
    expect(violations).toEqual([
      expect.objectContaining({ kind: "orphan-chunk" }),
    ])
    expect(violations.map(describePathViolation)).toEqual([
      expect.stringContaining("read the flag where you branch on it"),
    ])
    expect(checkPaths("native", native, none)).toEqual([])
  })

  it("reports a module that is exclusive to another profile", () => {
    const rules = {
      ...none,
      exclusive: [
        { modules: ["native/**"], profiles: ["native" as const], why: "phone" },
      ],
    }
    expect(checkPaths("native", native, rules)).toEqual([])
    const violations = checkPaths("web", native, rules)
    expect(
      violations.map((v) => v.kind === "off-path" && v.module).sort()
    ).toEqual(["native/exported.js", "native/literal.js"])
  })

  it("charges an off-path import() target with every chunk only it loads", () => {
    const rules = {
      ...none,
      allowlists: [
        {
          profile: "native" as const,
          within: "pages/**",
          allow: ["pages/on.js"],
          why: "surface",
        },
      ],
    }
    const [violation, ...rest] = checkPaths("native", native, rules)
    expect(rest).toEqual([])
    expect(violation).toMatchObject({
      kind: "off-path",
      module: "pages/off.js",
    })
    if (violation?.kind !== "off-path") throw new Error("unreachable")
    const deep = native.chunks.find((chunk) =>
      chunk.modules.has("deep/only-off.js")
    )
    const off = native.chunks.find((chunk) => chunk.modules.has("pages/off.js"))
    expect([...violation.behind].sort()).toEqual([deep?.file, off?.file].sort())
  })

  it("tolerates debt, and reports debt that matches nothing", () => {
    const rules = {
      ...none,
      allowlists: [
        {
          profile: "native" as const,
          within: "pages/**",
          allow: ["pages/on.js"],
          why: "surface",
        },
      ],
      debt: [
        {
          profile: "native" as const,
          module: "pages/off.js",
          why: "shared tree",
        },
        {
          profile: "native" as const,
          module: "pages/gone.js",
          why: "paid off",
        },
        {
          profile: "web" as const,
          module: "pages/off.js",
          why: "another profile's",
        },
      ],
    }
    expect(checkPaths("native", native, rules)).toEqual([
      { kind: "stale-debt", module: "pages/gone.js", why: "paid off" },
    ])
  })

  it("reports a required module the output lacks", () => {
    const rules = {
      ...none,
      required: [
        {
          profile: "web" as const,
          modules: ["native/literal.js"],
          why: "the point",
        },
      ],
    }
    expect(checkPaths("web", web, rules)).toContainEqual({
      kind: "missing",
      module: "native/literal.js",
      why: "the point",
    })
  })
})

describe("checkExclusivity", () => {
  const both = (): Map<"web" | "native", ReturnType<typeof readBuild>> =>
    new Map([
      ["web", web],
      ["native", native],
    ])

  it("asks for a declaration for a module some profiles carry and others do not", () => {
    // Everything the native build carries that the web one does not: the
    // literal branch's target (the exported one ships in both, as an orphan).
    expect(checkExclusivity(both(), none)).toEqual([
      {
        kind: "undeclared-exclusive",
        module: "native/literal.js",
        profiles: ["native"],
      },
    ])
    const declared = {
      ...none,
      exclusive: [
        { modules: ["native/**"], profiles: ["native" as const], why: "phone" },
      ],
    }
    expect(checkExclusivity(both(), declared)).toEqual([])
    const elsewhere = {
      ...none,
      decidedElsewhere: [{ modules: ["native/literal.js"], why: "audience" }],
    }
    expect(checkExclusivity(both(), elsewhere)).toEqual([])
  })
})

describe("presentSources", () => {
  // Two sources; line 0 maps "a=1;" to source 0, then "var " to source 1 at
  // a statement boundary: the stray segment a dropped declaration leaves.
  // Segments: [col 0, src 0, line 0, col 0], [col +4, src +1, line 0, col 0].
  it("ignores a segment that covers only a keyword or punctuation", () => {
    const map = { sources: ["kept.js", "dropped.js"], mappings: "AAAA,ICAA" }
    expect(presentSources("a=1;var ", map)).toEqual(new Map([[0, 4]]))
    expect(presentSources("a=1;b=2;", map)).toEqual(
      new Map([
        [0, 4],
        [1, 4],
      ])
    )
  })
})

describe("globToRegExp", () => {
  it("matches path segments, any depth, and a literal query", () => {
    expect(
      globToRegExp("src/routes/*.tsx*").test(
        "src/routes/a.tsx?tsr-split=component"
      )
    ).toBe(true)
    expect(globToRegExp("src/routes/*.tsx*").test("src/routes/a/b.tsx")).toBe(
      false
    )
    expect(
      globToRegExp("src/routes/_apk**").test("src/routes/_apk/aph/x.tsx")
    ).toBe(true)
    expect(globToRegExp("a?b").test("axb")).toBe(false)
  })
})
