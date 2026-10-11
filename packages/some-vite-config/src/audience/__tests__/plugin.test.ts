import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"
import { audiencePlugin } from "@/audience/plugin.js"
import { defineProfiles } from "@/audience/schema.js"
import type { Rolldown } from "vite"
import { build } from "vite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

// Markers the assertions look for in the bundle. Each lives in exactly one
// fixture file, so finding one means that file shipped.
const IMPL = "LAN_IMPLEMENTATION_MARKER"
const REEXPORTED = "LAN_REEXPORTED_MARKER"
const CONTRACT = "LAN_CONTRACT_MARKER"
const CSS = "lan-authored-css-marker"
const PUBLIC = "PUBLIC_IMPLEMENTATION_MARKER"
const HOSTILE_NAME = "</script><!--\u2028"

const profiles = defineProfiles({
  pages: { audiences: ["public"] },
  lan: { audiences: ["public", "lan"] },
})

let root: string

function write(path: string, content: string): void {
  const file = join(root, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

function workspace(
  dir: string,
  name: string,
  someUi: unknown,
  files: Record<string, string>
): void {
  write(
    `packages/ui/${dir}/package.json`,
    JSON.stringify({
      name,
      type: "module",
      ...(someUi === undefined ? {} : { someUi }),
      exports: {
        ".": "./dist/index.js",
        "./contract": "./dist/contract.js",
      },
    })
  )
  for (const [path, content] of Object.entries(files)) {
    write(`packages/ui/${dir}/${path}`, content)
  }
  // What pnpm does for a workspace dependency.
  mkdirSync(join(root, "app/node_modules/@fx"), { recursive: true })
  symlinkSync(
    join(root, `packages/ui/${dir}`),
    join(root, `app/node_modules/${name}`)
  )
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "build-audience-"))

  workspace(
    "lan-panel",
    "@fx/lan-panel",
    { audience: "lan" },
    {
      "dist/index.js": [
        `export * from "./more.js"`,
        `export const marker = "${IMPL}"`,
        `export function Panel() { return marker }`,
        `export default Panel`,
        // An export name that is no identifier (ES2022 allows any string):
        // the stub has to re-export it verbatim and splice it into code
        // safely, markup and line separators included.
        // Destructuring declarations export every name their pattern binds.
        `export const { destructured, nested: { deep }, ...restProps } = { destructured: 1, nested: { deep: 2 }, extra: 3 }`,
        `export const [first, [second = 2], ...others] = [1, [], 3]`,
        `const hostile = 1`,
        `export { hostile as ${JSON.stringify(HOSTILE_NAME)} }`,
      ].join("\n"),
      "dist/more.js": `export const more = () => "${REEXPORTED}"`,
      "dist/contract.js": `export const searchSchema = "${CONTRACT}"`,
      "src/panel.css": `.${CSS} { color: red }`,
    }
  )
  workspace(
    "shared",
    "@fx/shared",
    { audience: "public" },
    {
      "dist/index.js": `export const shared = "${PUBLIC}"`,
      "dist/contract.js": "export {}",
    }
  )

  write(
    "app/src/main.js",
    [
      `import { shared } from "@fx/shared"`,
      `import { searchSchema } from "@fx/lan-panel/contract"`,
      `import { profile, hasAudience } from "virtual:build-profile"`,
      // main.tsx's eager glob over authored package CSS, reduced to one file.
      `import "../../packages/ui/lan-panel/src/panel.css"`,
      `console.log(shared, searchSchema, profile, hasAudience("lan"))`,
      `export const route = () => import("./routes/_lan/panel.js")`,
    ].join("\n")
  )
  write(
    "app/src/routes/_lan/panel.js",
    [
      `import Panel, { Panel as Named, more, ${JSON.stringify(HOSTILE_NAME)} as hostile } from "@fx/lan-panel"`,
      `import { destructured, deep, restProps, first, second, others } from "@fx/lan-panel"`,
      `export const component = [Panel, Named, more, hostile, destructured, deep, restProps, first, second, others]`,
    ].join("\n")
  )
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function isOutput(value: unknown): value is Rolldown.RolldownOutput {
  return typeof value === "object" && value !== null && "output" in value
}

type Built = {
  code: string
  css: string
  /** Every stub module exactly as the plugin generated it, before bundling. */
  stubs: Array<string>
}

async function buildApp(
  profile: string | undefined,
  entry = "src/main.js",
  extra: { checkGates?: boolean } = {}
): Promise<Built> {
  const stubs: Array<string> = []
  const result = await build({
    root: join(root, "app"),
    logLevel: "silent",
    configFile: false,
    plugins: [
      audiencePlugin({
        profiles,
        profile,
        defaultProfile: "lan",
        workspaceRoots: [join(root, "packages/ui")],
        gates: { lan: ["src/routes/_lan"], apk: [], web: [] },
        ...extra,
      }),
      // The bundle re-generates code (renames bindings, re-escapes strings),
      // so what the plugin itself spliced together is only visible here.
      {
        name: "capture-stubs",
        transform(code: string, id: string): null {
          if (id.startsWith("\0audience-stub:")) stubs.push(code)
          return null
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ["es"], cssFileName: "style" },
    },
  })
  const outputs: Array<unknown> = Array.isArray(result) ? result : [result]
  const files = outputs.flatMap((o) => (isOutput(o) ? o.output : []))
  return {
    stubs,
    code: files.map((f) => (f.type === "chunk" ? f.code : "")).join("\n"),
    css: files
      .map((f) =>
        f.type === "asset" && f.fileName.endsWith(".css")
          ? String(f.source)
          : ""
      )
      .join("\n"),
  }
}

// Each case runs a real vite build over a fixture workspace: well past the
// default 5s on a loaded CI runner, so the budget is set here rather than in
// the package-wide vitest.config.ts.
describe("audiencePlugin", { timeout: 30_000 }, () => {
  it("bundles a workspace whose audience the profile carries", async () => {
    const { code, css } = await buildApp("lan")

    expect(code).toContain(IMPL)
    expect(code).toContain(REEXPORTED)
    expect(css).toContain(CSS)
    expect(code).toContain('"lan"')
  })

  it("stubs a workspace the profile leaves out, keeping its contract", async () => {
    const { code, css, stubs } = await buildApp("pages")

    expect(code).not.toContain(IMPL)
    expect(code).not.toContain(REEXPORTED)
    expect(css).not.toContain(CSS)
    // The contract ships everywhere; public workspaces are untouched.
    expect(code).toContain(CONTRACT)
    expect(code).toContain(PUBLIC)
    expect(code).toContain('"pages"')
    // The stub re-exported the hostile name (the import above linked it),
    // and spliced it into its own source escaped, not raw.
    expect(stubs).toHaveLength(1)
    const [stub] = stubs
    expect(stub).toContain("\\u003c\\u002fscript\\u003e\\u003c!--\\u2028")
    expect(stub).not.toContain("</script>")
    expect(stub).not.toContain("<!--")
    expect(stub).not.toContain("\u2028")
  })

  it("falls back to the default profile when none is requested", async () => {
    const { code } = await buildApp(undefined)

    expect(code).toContain(IMPL)
  })

  it.each(["lan", "pages"])(
    "rejects an import outside the audience's gate in the %s profile",
    async (profile) => {
      write("app/src/nav.js", `export { Panel } from "@fx/lan-panel"`)

      await expect(buildApp(profile, "src/nav.js")).rejects.toThrow(
        /src\/nav\.js imports @fx\/lan-panel, a "lan"-audience workspace, from outside src\/routes\/_lan/
      )
    }
  )

  it("lets an import outside the gate through when checkGates is off", async () => {
    write("app/src/nav.js", `export { Panel } from "@fx/lan-panel"`)

    const { code } = await buildApp("lan", "src/nav.js", { checkGates: false })
    expect(code).toContain(IMPL)
  })

  it("rejects a workspace manifest without a valid someUi field", () => {
    workspace("unmarked", "@fx/unmarked", undefined, {})

    expect(() =>
      audiencePlugin({
        profiles,
        profile: "lan",
        defaultProfile: "lan",
        workspaceRoots: [join(root, "packages/ui")],
        gates: { lan: ["src/routes/_lan"], apk: [], web: [] },
      })
    ).toThrow(/unmarked\/package\.json: "someUi" is missing or invalid/)
  })

  it("rejects an unknown profile name", () => {
    expect(() =>
      audiencePlugin({
        profiles,
        profile: "vps",
        defaultProfile: "lan",
        workspaceRoots: [join(root, "packages/ui")],
        gates: { lan: ["src/routes/_lan"], apk: [], web: [] },
      })
    ).toThrow(/unknown build profile "vps". Known profiles: pages, lan/)
  })
})
