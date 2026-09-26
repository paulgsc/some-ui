import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"
import ts from "typescript"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { DeclarationLayout } from "@/lib/declarations.js"
import {
  aliasSource,
  aliasTargets,
  assertDeclarationSettings,
  clearOutDirExceptDeclarations,
  createDeclarationsPlugin,
  declarationSpecifier,
  emittedDeclaration,
  rewriteDeclarationText,
  substituteStar,
  typesEntrySource,
} from "@/lib/declarations.js"

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "some-ui-declarations-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function write(path: string, text = ""): string {
  const full = join(root, path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, text)
  return full
}

function layout(paths: ts.MapLike<Array<string>>): DeclarationLayout {
  return {
    rootDir: root,
    declarationDir: join(root, "dist/types"),
    paths,
    pathsBase: root,
  }
}

describe("aliasTargets", () => {
  it("matches an exact key only by equality, never as a prefix", () => {
    const paths = { "@some-ui/leetype-wasm": ["./src/wasm.d.ts"] }
    expect(aliasTargets("@some-ui/leetype-wasm", paths, root)).toEqual([
      join(root, "src/wasm.d.ts"),
    ])
    expect(
      aliasTargets("@some-ui/leetype-wasm/dist/leetype_wasm", paths, root)
    ).toEqual([])
  })

  it("matches a wildcard key by prefix and suffix, substituting the star", () => {
    const paths = { "@topik/*": ["./src/*"], "~*.css": ["./styles/*.css"] }
    expect(aliasTargets("@topik/lib/topik", paths, root)).toEqual([
      join(root, "src/lib/topik"),
    ])
    expect(aliasTargets("~theme.css", paths, root)).toEqual([
      join(root, "styles/theme.css"),
    ])
    expect(aliasTargets("@other/x", paths, root)).toEqual([])
  })

  it("sends every match of a wildcard key to a star-less target", () => {
    const paths = { "@icons/*": ["./src/icons/index.ts"] }
    expect(aliasTargets("@icons/star", paths, root)).toEqual([
      join(root, "src/icons/index.ts"),
    ])
  })
})

describe("substituteStar", () => {
  it("replaces the target's one star, wherever it sits, or leaves a star-less target", () => {
    expect(substituteStar("./src/*", "lib/a")).toBe("./src/lib/a")
    expect(substituteStar("./styles/*.css", "theme")).toBe("./styles/theme.css")
    expect(substituteStar("./src/index.ts", "x")).toBe("./src/index.ts")
  })
})

describe("aliasSource (A4: an alias use is a match whose target exists)", () => {
  it("treats a match with no target file as a package import", () => {
    // chat's shape: "@some-ui/*" points at assets, and also matches the
    // real package "@some-ui/shared", which TypeScript takes from
    // node_modules because assets/shared does not exist.
    write("assets/logo.ts")
    const paths = { "@some-ui/*": ["./assets/*"] }
    expect(aliasSource("@some-ui/shared", paths, root)).toBeNull()
    expect(aliasSource("@some-ui/logo", paths, root)).toBe(
      join(root, "assets/logo.ts")
    )
  })

  it("completes a directory target to its index, as TypeScript does", () => {
    write("src/lib/topik/index.ts")
    expect(
      aliasSource("@topik/lib/topik", { "@topik/*": ["./src/*"] }, root)
    ).toBe(join(root, "src/lib/topik/index.ts"))
  })
})

describe("emittedDeclaration (A5)", () => {
  it("finds the declaration tsc wrote for a source under rootDir", () => {
    write("dist/types/src/a.d.ts")
    expect(emittedDeclaration(join(root, "src/a.tsx"), layout({}))).toBe(
      join(root, "dist/types/src/a.d.ts")
    )
  })

  it("has nothing for a .d.ts input, a file outside rootDir, or an unemitted file", () => {
    expect(emittedDeclaration(join(root, "src/w.d.ts"), layout({}))).toBeNull()
    expect(emittedDeclaration(join(root, "../x.ts"), layout({}))).toBeNull()
    expect(emittedDeclaration(join(root, "src/none.ts"), layout({}))).toBeNull()
  })
})

describe("rewriteDeclarationText (step 2)", () => {
  const paths = { "@topik/*": ["./src/*"], "@some-ui/*": ["./assets/*"] }

  it("rewrites an alias to a relative .js specifier and leaves everything else", () => {
    write("src/lib/topik/index.ts")
    write("dist/types/src/lib/topik/index.d.ts")
    const file = join(root, "dist/types/src/components/card/index.d.ts")
    const text = [
      `import type { A } from "@topik/lib/topik";`,
      `export { B } from '@topik/lib/topik';`,
      `type C = import("@topik/lib/topik").C;`,
      `import { D } from "@some-ui/shared";`,
      `import { E } from "../sibling";`,
      `import type { F } from "react";`,
    ].join("\n")
    const result = rewriteDeclarationText(file, text, layout(paths))
    expect(result.problems).toEqual([])
    expect(result.text.split("\n")).toEqual([
      `import type { A } from "../../lib/topik/index.js";`,
      `export { B } from '../../lib/topik/index.js';`,
      `type C = import("../../lib/topik/index.js").C;`,
      `import { D } from "@some-ui/shared";`,
      `import { E } from "../sibling";`,
      `import type { F } from "react";`,
    ])
  })

  it("reports an alias whose target has no emitted declaration, and leaves it", () => {
    write("src/wasm.d.ts")
    const file = join(root, "dist/types/src/index.d.ts")
    const text = `import type { W } from "@topik/wasm.d.ts";`
    const result = rewriteDeclarationText(file, text, layout(paths))
    expect(result.text).toBe(text)
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]).toContain(`"@topik/wasm.d.ts"`)
  })
})

describe("the types entry (A6)", () => {
  it("re-exports the default only when the entry has one", () => {
    expect(
      typesEntrySource("../types/src/index.js", "export declare const a = 1;")
    ).toBe(`export * from "../types/src/index.js"\nexport {}\n`)
    expect(
      typesEntrySource(
        "./types/index.js",
        "declare const X: 1;\nexport default X;"
      )
    ).toContain(`export { default } from "./types/index.js"`)
    expect(
      typesEntrySource("./types/index.js", "export { X as default };")
    ).toContain(`export { default } from "./types/index.js"`)
  })

  it("writes a specifier relative to the entry file, with ./ for a descendant", () => {
    expect(
      declarationSpecifier(
        join(root, "dist/@some-ui/topik.d.ts"),
        join(root, "dist/types/src/index.d.ts")
      )
    ).toBe("../types/src/index.js")
    expect(
      declarationSpecifier(
        join(root, "dist/stepper.d.ts"),
        join(root, "dist/types/index.d.ts")
      )
    ).toBe("./types/index.js")
  })
})

describe("assertDeclarationSettings (A2, A3, A7)", () => {
  const declarationDir = "/pkg/dist/types"
  const valid: ts.CompilerOptions = {
    emitDeclarationOnly: true,
    declarationDir,
    rootDir: "/pkg/src",
    composite: true,
    tsBuildInfoFile: "/pkg/dist/types/tsconfig.build.tsbuildinfo",
  }

  it("returns the explicit rootDir when every setting holds", () => {
    expect(
      assertDeclarationSettings(valid, "tsconfig.build.json", declarationDir)
    ).toBe("/pkg/src")
  })

  it.each([
    [{ emitDeclarationOnly: false }, `"emitDeclarationOnly" must be true`],
    [{ declarationDir: "/pkg/dist" }, `"declarationDir" must be`],
    [{ rootDir: undefined }, `"rootDir" must be set explicitly`],
    [
      { tsBuildInfoFile: "/pkg/tsconfig.build.tsbuildinfo" },
      `"tsBuildInfoFile" must be inside`,
    ],
    [{ tsBuildInfoFile: undefined }, `must be set inside`],
  ])("refuses %o", (override, message) => {
    expect(() =>
      assertDeclarationSettings(
        { ...valid, ...override },
        "tsconfig.build.json",
        declarationDir
      )
    ).toThrow(message)
  })
})

describe("clearOutDirExceptDeclarations (step 1)", () => {
  it("empties dist/ but keeps what tsc wrote, build info included", () => {
    write("dist/@some-ui/topik.es.js")
    write("dist/topik.css")
    write("dist/types/src/index.d.ts")
    write("dist/types/tsconfig.build.tsbuildinfo")
    clearOutDirExceptDeclarations(join(root, "dist"), join(root, "dist/types"))
    expect(existsSync(join(root, "dist/@some-ui"))).toBe(false)
    expect(existsSync(join(root, "dist/topik.css"))).toBe(false)
    expect(existsSync(join(root, "dist/types/src/index.d.ts"))).toBe(true)
    expect(
      existsSync(join(root, "dist/types/tsconfig.build.tsbuildinfo"))
    ).toBe(true)
  })
})

/** Runs one of the plugin's hooks, which it defines as plain functions. */
async function run(hook: unknown): Promise<void> {
  if (typeof hook !== "function") throw new Error("expected a function hook")
  await Reflect.apply(hook, undefined, [])
}

describe("createDeclarationsPlugin, end to end over a real tsc emit", () => {
  function emit(): void {
    const parsed = ts.getParsedCommandLineOfConfigFile(
      join(root, "tsconfig.build.json"),
      {},
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined }
    )
    if (!parsed) throw new Error("unreadable tsconfig")
    const program = ts.createProgram(parsed.fileNames, parsed.options)
    const result = program.emit()
    const errors = ts
      .getPreEmitDiagnostics(program)
      .concat(result.diagnostics)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "))
    expect(errors).toEqual([])
  }

  beforeEach(() => {
    write(
      "tsconfig.build.json",
      JSON.stringify({
        compilerOptions: {
          strict: true,
          module: "ESNext",
          moduleResolution: "Bundler",
          target: "ES2022",
          rootDir: ".",
          declaration: true,
          emitDeclarationOnly: true,
          declarationDir: "./dist/types",
          incremental: true,
          tsBuildInfoFile: "./dist/types/tsconfig.build.tsbuildinfo",
          paths: { "@demo/*": ["./src/*"] },
        },
        include: ["src"],
      })
    )
    write("src/lib/card.ts", `export type Card = { title: string }\n`)
    write(
      "src/index.ts",
      [
        `import type { Card } from "@demo/lib/card"`,
        `export type { Card }`,
        `export const first = (cards: Array<Card>): Card | undefined => cards[0]`,
        `const version = 1`,
        `export default version`,
        ``,
      ].join("\n")
    )
  })

  it("publishes tsc's declarations with aliases rewritten and the types entry written", async () => {
    emit()
    write("dist/stale.cjs.js", "stale")
    const plugin = createDeclarationsPlugin({ packageName: "@demo/pkg" }, root)

    await run(plugin.buildStart)
    expect(existsSync(join(root, "dist/stale.cjs.js"))).toBe(false)

    await run(plugin.closeBundle)
    const index = readFileSync(join(root, "dist/types/src/index.d.ts"), "utf-8")
    expect(index).toContain(`from "./lib/card.js"`)
    expect(index).not.toContain("@demo/")
    expect(readFileSync(join(root, "dist/@demo/pkg.d.ts"), "utf-8")).toBe(
      [
        `export * from "../types/src/index.js"`,
        `export { default } from "../types/src/index.js"`,
        `export {}`,
        ``,
      ].join("\n")
    )
  })

  it("fails, naming the fix, when vite build runs without tsc first (A1)", async () => {
    const plugin = createDeclarationsPlugin({ packageName: "@demo/pkg" }, root)
    await expect(run(plugin.closeBundle)).rejects.toThrow(
      "Run `tsc -p tsconfig.build.json` before `vite build`"
    )
  })
})
