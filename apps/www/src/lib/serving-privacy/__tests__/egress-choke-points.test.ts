/**
 * Where `apps/www/src` makes network requests (docs/learner-data-authority.md,
 * LA1 and LA4), pinned by reading the source: no browser, no build.
 *
 * - **LA4: a corpus read carries no credentials.** Every `createDataSource`
 *   call passes `PUBLIC_READ`; one that forgets sends the session cookie with
 *   a lesson request, and nothing fails.
 * - **LA1: nothing but the choke points names a network global.** The lint
 *   rule in `apps/www/eslint.config.js` restricts `fetch`, `XMLHttpRequest`,
 *   `WebSocket`, `EventSource` and `navigator.sendBeacon`; this also pins the
 *   files that `eslint-disable` it, and the config's exemption list.
 *
 * - **LA8: the phone reaches its home server through one module, and one
 *   block.** Native HTTP (`CapacitorHttp`) is not a browser global, so
 *   `no-restricted-globals` cannot see it, and `no-restricted-imports`
 *   misses a dynamic `import()` and `Capacitor.Plugins.CapacitorHttp`: only
 *   `lib/device-backend/native-http` may name it, only `lib/home-link` may
 *   call that module, and only the Home server block, the study list's
 *   "Let it go" and the phone-full offer's "Remove it", the drain and
 *   marks of what this phone keeps on home (LA15), what hands aph's lane to
 *   them, Settings' readout of what is kept where, the readout and port
 *   of the routine's files in Korean (whose read sends one
 *   `GET /routine/files` and whose telling of what was opened one
 *   `PUT /routine/opened`), and Studio's idea answers asking home for a
 *   take's words (`lib/idea-hearing`, whose read sends one
 *   `GET /voice-notes/:id/heard`) may call `lib/home-link`.
 *
 * The last group feeds the checks known-bad sources, so a check that stopped
 * looking cannot stay green.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, posix, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/** apps/www/src/lib/serving-privacy/__tests__ -> apps/www/src. */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

/** Files that are the choke point, or stub the network on purpose. */
const NETWORK_EXEMPT = new Set([
  "lib/file-host-config/client.ts",
  "lib/device-backend/interceptor/index.ts",
])

/** LA8: the one module that may reach the home server over native HTTP. */
const NATIVE_HTTP = "lib/device-backend/native-http/index.ts"

/** LA8: who may call the native-HTTP module, and who may call the link. */
const NATIVE_HTTP_CALLERS = new Set(["lib/home-link/index.ts"])
const HOME_LINK_CALLERS = new Set([
  "components/settings/device-section.tsx",
  // Settings' readout of what this phone keeps on home and what waits
  // (LA15), with Send now; the status page's rows for the same records are
  // read here too, sending nothing of their own.
  "components/settings/device-kept-on-home.tsx",
  // LA15: the drain, mounted by the app shell, the mark of a record in the
  // header, and what hands aph's lane to them.
  "components/device-home-glyph.tsx",
  "components/aph/device-aph-lane.tsx",
  // Settings' readout of Korean's look at the routine's files, and the port
  // Korean reads them through.
  "components/settings/device-routine-reads.tsx",
  "components/player/device-routine-files.ts",
  // LA13: game day's line of what of its bites waits on the phone for home
  // (`gameOutbox`), which reads and sends nothing.
  "routes/_dashboard/_apk/game-week.tsx",
  // LA8: the study list's "Let it go" of one session, a tap after a confirm,
  // which copies it home and reads it back before the phone lets it go.
  "components/sessions/device-let-go.tsx",
  // LA8, PF1: the phone-full offer's "Remove it", the same let-go of the one
  // session it names, on its press.
  "components/settings/device-storage.tsx",
  // LA8, IH1 (MIC10): Studio's idea answers, which read the pairing and ask
  // home for a take's words while the screen shows it being heard.
  "lib/idea-hearing/index.ts",
])

/**
 * LA8: who may start a session's let-go (`components/sessions/device-let-go`,
 * whose `useSessionLetGo` starts it with no confirm): the study list's row,
 * after its confirm, and the phone-full offer's "Remove it".
 */
const LET_GO_CALLERS = [
  "components/settings/device-storage.tsx",
  "routes/_dashboard/sessions/index.tsx",
]

/**
 * LA15: the one wiring of every record this phone drains to home, which
 * calls the link's `keep`, and the runtime it hands that port; and Korean's
 * read of the routine's files.
 */
const KEEPERS = new Set([
  "lib/home-link/lanes.ts",
  "lib/home-link/kept-runtime.ts",
  "lib/home-link/routine.ts",
  "lib/home-link/heard.ts",
])

/** The routine's read, and the two requests it may send. */
const ROUTINE_READ = "lib/home-link/routine.ts"
const ROUTINE_SENDS = [
  ['"GET"', '"/routine/files"'],
  ['"PUT"', '"/routine/opened"', "JSON.stringify({ opened: keys })"],
]

/**
 * LA8, LA15 (HF11): the voice lane's read of which Studio takes home knows
 * Drive holds, and the one request it may send.
 */
const ON_DRIVE_READ = "lib/home-link/on-drive.ts"
const ON_DRIVE_SENDS = [['"GET"', "onDrivePath(chunk)"]]

/** LA8, IH1: the read of one take's words, and the one request it may send. */
const HEARD_READ = "lib/home-link/heard.ts"
const HEARD_SENDS = [['"GET"', "heardPath(id)"]]

/** Every call of a function named `send` in `text`, as its arguments' text. */
function sendCalls(path: string, text: string): Array<Array<string>> {
  const found: Array<Array<string>> = []
  const file = parse(path, text)
  walk(file, (node) => {
    if (
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === "send") ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "send"))
    ) {
      found.push(node.arguments.map((argument) => argument.getText(file)))
    }
  })
  return found
}

/** Every mention of `CapacitorHttp` in `text`: an import, a member, a string. */
function nativeHttpUses(path: string, text: string): Array<string> {
  const found: Array<string> = []
  const file = parse(path, text)
  walk(file, (node) => {
    if (
      (ts.isIdentifier(node) && node.text === "CapacitorHttp") ||
      (ts.isStringLiteralLike(node) && node.text.includes("CapacitorHttp"))
    ) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file))
      found.push(
        `${path}:${String(line + 1)} names CapacitorHttp outside ${NATIVE_HTTP} (LA8)`
      )
    }
  })
  return found
}

/** Is this import or re-export one that brings in only types? */
function typeOnly(node: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  if (ts.isExportDeclaration(node)) return node.isTypeOnly
  const clause = node.importClause
  if (clause === undefined) return false
  if (clause.isTypeOnly) return true
  const bindings = clause.namedBindings
  return (
    clause.name === undefined &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.every((element) => element.isTypeOnly)
  )
}

/**
 * The `src`-relative module a specifier names, however it is spelt (`@/`,
 * `./`, a trailing `/index` or extension); `null` for a package.
 */
function moduleOf(from: string, specifier: string): string | null {
  let path: string
  if (specifier.startsWith("@/")) path = specifier.slice(2)
  else if (specifier.startsWith(".")) {
    path = posix.join(posix.dirname(from), specifier)
  } else return null
  return path
    .replace(/\.[cm]?[jt]sx?$/, "")
    .replace(/\/+$/, "")
    .replace(/\/index$/, "")
}

/** Every value import, re-export or `import()` of a module `matches` names. */
function valueImportsOf(
  path: string,
  text: string,
  matches: (specifier: string) => boolean
): Array<string> {
  const found: Array<string> = []
  const file = parse(path, text)
  walk(file, (node) => {
    let specifier: ts.Expression | undefined
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      !typeOnly(node)
    ) {
      specifier = node.moduleSpecifier
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      specifier = node.arguments[0]
    }
    if (specifier === undefined || !ts.isStringLiteralLike(specifier)) return
    const module = moduleOf(path, specifier.text)
    if (module !== null && matches(module)) {
      found.push(`${path} imports ${specifier.text}`)
    }
  })
  return found
}

// The index alone: `native-http/no-answer` holds an error class, no request.
const isNativeHttp = (module: string): boolean =>
  module === "lib/device-backend/native-http"
const isHomeLink = (module: string): boolean =>
  module === "lib/home-link" || module.startsWith("lib/home-link/")

function isTestFile(path: string): boolean {
  return (
    /(^|\/)__tests__\//.test(path) ||
    /\.test\.[cm]?tsx?$/.test(path) ||
    path.startsWith("test-support/")
  )
}

function sourceFiles(dir = SRC): Array<string> {
  const out: Array<string> = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.[cm]?tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts"))
      out.push(relative(SRC, full))
  }
  return out
}

function parse(path: string, text: string): ts.SourceFile {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

/** Every `createDataSource(...)` call in `text` whose text lacks `PUBLIC_READ`. */
function dataSourcesWithoutPublicRead(
  path: string,
  text: string
): Array<string> {
  const problems: Array<string> = []
  const file = parse(path, text)
  walk(file, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "createDataSource" &&
      !node.getText(file).includes("PUBLIC_READ")
    ) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file))
      problems.push(
        `${path}:${String(line + 1)} createDataSource without PUBLIC_READ (LA4)`
      )
    }
  })
  return problems
}

const NETWORK_GLOBALS = new Set([
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
])

/** Every `eslint-disable` naming a restricted-network rule, with its line. */
function networkLintDisables(path: string, text: string): Array<string> {
  const problems: Array<string> = []
  text.split("\n").forEach((line, i) => {
    if (
      /eslint-disable/.test(line) &&
      /no-restricted-(globals|properties)/.test(line)
    ) {
      problems.push(
        `${path}:${String(i + 1)} disables the network-global lint rule (LA1)`
      )
    }
  })
  return problems
}

/** Identifiers read as a network global in a file that is not a choke point. */
function networkGlobalUses(path: string, text: string): Array<string> {
  const problems: Array<string> = []
  const file = parse(path, text)
  walk(file, (node) => {
    const isCallee =
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      NETWORK_GLOBALS.has(node.expression.text)
    const isConstruct =
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      NETWORK_GLOBALS.has(node.expression.text)
    if (isCallee || isConstruct) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file))
      problems.push(
        `${path}:${String(line + 1)} uses a network global outside a choke point (LA1)`
      )
    }
  })
  return problems
}

/**
 * LA2: where the transfer of device sessions to the account may be started.
 * Each name is called only from the files listed: the button's action,
 * through its hook, through the one function that copies; and the phone's
 * copy to its paired home, called only by the Home server block's (LA8),
 * with the read-back that decides what may leave the phone (`confirmHeld`).
 * The plan and the run are called by those two copies alone.
 */
const TRANSFER_CALLERS: Record<string, ReadonlyArray<string>> = {
  copySessionsTo: ["lib/home-link/sessions.ts"],
  confirmHeld: ["lib/home-link/sessions.ts"],
  useCopyDeviceSessions: ["components/settings/data-home-section.tsx"],
  copyDeviceSessionsAndRefresh: ["lib/tenant/hooks.ts"],
  copyDeviceSessions: ["lib/tenant/sessions-transfer/index.ts"],
  planTransfer: [
    "lib/tenant/sessions-transfer/index.ts",
    "lib/tenant/sessions-copy/index.ts",
  ],
  runTransfer: [
    "lib/tenant/sessions-transfer/index.ts",
    "lib/tenant/sessions-copy/index.ts",
  ],
}

function transferCalls(path: string, text: string): Array<string> {
  const found: Array<string> = []
  const file = parse(path, text)
  walk(file, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      // Own keys only: `in` would match a call named `valueOf` or
      // `toString` to the object's prototype.
      Object.hasOwn(TRANSFER_CALLERS, node.expression.text)
    ) {
      found.push(node.expression.text)
    }
  })
  return found
}

function transferCallProblems(path: string, text: string): Array<string> {
  return transferCalls(path, text)
    .filter((name) => !(TRANSFER_CALLERS[name] ?? []).includes(path))
    .map(
      (name) =>
        `${path} calls ${name}, which only ${(TRANSFER_CALLERS[name] ?? []).join(" and ")} may (LA2)`
    )
}

describe("LA4: a corpus read carries no credentials", () => {
  it("passes PUBLIC_READ in every createDataSource call", () => {
    const problems = sourceFiles()
      .filter((f) => !isTestFile(f))
      .flatMap((f) =>
        dataSourcesWithoutPublicRead(f, readFileSync(join(SRC, f), "utf8"))
      )
    expect(problems).toEqual([])
  })

  it("still finds the data sources it is meant to guard", () => {
    const found = sourceFiles()
      .filter((f) => !isTestFile(f))
      .filter((f) =>
        /createDataSource\s*[<(]/.test(readFileSync(join(SRC, f), "utf8"))
      )
    expect(found.sort()).toEqual([
      "lib/topik-content/index.ts",
      "lib/web-surface/hangul/vocab.ts",
      "lib/web-surface/playoff-delta/stage.tsx",
    ])
  })
})

describe("LA1: only the choke points name a network global", () => {
  it("has no fetch, XMLHttpRequest, WebSocket or EventSource call outside them", () => {
    const problems = sourceFiles()
      .filter((f) => !isTestFile(f) && !NETWORK_EXEMPT.has(f))
      .flatMap((f) => networkGlobalUses(f, readFileSync(join(SRC, f), "utf8")))
    expect(problems).toEqual([])
  })

  it("has no eslint-disable for the network-global rules", () => {
    const problems = sourceFiles()
      .filter((f) => !isTestFile(f))
      .flatMap((f) =>
        networkLintDisables(f, readFileSync(join(SRC, f), "utf8"))
      )
    expect(problems).toEqual([])
  })

  it("keeps the exemption list in eslint.config.js to the same two files", () => {
    const config = readFileSync(join(SRC, "../eslint.config.js"), "utf8")
    // The `files` of every block that turns either network rule off.
    const blocks = [
      ...config.matchAll(/"no-restricted-(globals|properties)": "off"/g),
    ].map(({ index }) => {
      const before = config.slice(0, index)
      return before.slice(before.lastIndexOf("files: ["))
    })
    const listed = [
      ...new Set(
        blocks.flatMap((block) =>
          [...block.matchAll(/"(src\/lib\/[^"]+\.ts)"/g)].map((m) => m[1])
        )
      ),
    ]
    expect(listed.sort()).toEqual(
      [...NETWORK_EXEMPT].map((f) => `src/${f}`).sort()
    )
  })
})

describe("LA2: the transfer to the account starts from one button", () => {
  it("is called from nowhere but the places that own each step", () => {
    const problems = sourceFiles()
      .filter((f) => !isTestFile(f))
      .flatMap((f) =>
        transferCallProblems(f, readFileSync(join(SRC, f), "utf8"))
      )
    expect(problems).toEqual([])
  })

  it("still finds each of those calls where it is expected", () => {
    for (const [name, owners] of Object.entries(TRANSFER_CALLERS)) {
      for (const owner of owners) {
        const calls = transferCalls(
          owner,
          readFileSync(join(SRC, owner), "utf8")
        )
        expect(calls, `${owner} should call ${name}`).toContain(name)
      }
    }
  })

  it("is not started by a ceremony or the sessions backend", () => {
    for (const file of [
      "lib/auth/session.ts",
      "lib/auth/enter.ts",
      "lib/tenant/sessions-backend.ts",
    ]) {
      const source = parse(file, readFileSync(join(SRC, file), "utf8"))
      const imports = source.statements
        .filter(ts.isImportDeclaration)
        .map((node) => node.moduleSpecifier.getText(source))
      expect(
        imports.filter((specifier) =>
          /sessions-(transfer|copy)/.test(specifier)
        ),
        file
      ).toEqual([])
    }
  })
})

describe("LA8: the phone reaches home through one module", () => {
  const sources = sourceFiles().filter((f) => !isTestFile(f))
  const read = (f: string): string => readFileSync(join(SRC, f), "utf8")

  it("names CapacitorHttp nowhere else", () => {
    const problems = sources
      .filter((f) => f !== NATIVE_HTTP)
      .flatMap((f) => nativeHttpUses(f, read(f)))
    expect(problems).toEqual([])
  })

  it("calls native-http only from the link, and the link only from the Home server block, the kept-on-home mark and Korean's look", () => {
    const outsideLink = sources.filter((f) => !f.startsWith("lib/home-link/"))
    expect(
      sources
        .filter((f) => !NATIVE_HTTP_CALLERS.has(f))
        .flatMap((f) => valueImportsOf(f, read(f), isNativeHttp))
    ).toEqual([])
    expect(
      outsideLink
        .filter((f) => !HOME_LINK_CALLERS.has(f))
        .flatMap((f) => valueImportsOf(f, read(f), isHomeLink))
    ).toEqual([])
  })

  it("starts a session's let-go only from the study list and the phone-full offer (LA8)", () => {
    // `useSessionLetGo` hands out a `start` with no confirm of its own: each
    // caller asks first, in its own words.
    const isLetGo = (module: string): boolean =>
      module === "components/sessions/device-let-go"
    expect(
      sources
        .filter((f) => valueImportsOf(f, read(f), isLetGo).length > 0)
        .sort()
    ).toEqual(LET_GO_CALLERS)
  })

  it("calls the link's keep only from the drain and Korean's look (LA15)", () => {
    const keeps = (f: string): boolean => /\.keep\(/.test(read(f))
    const reach = sources.filter(
      (f) =>
        (f.startsWith("lib/home-link/") || HOME_LINK_CALLERS.has(f)) &&
        !KEEPERS.has(f)
    )
    expect(reach.filter(keeps)).toEqual([])
    expect(read("lib/home-link/lanes.ts")).toContain("homeLink().keep(")
    expect(read(ROUTINE_READ)).toContain("homeLink().keep(")
    expect(read(HEARD_READ)).toContain("homeLink().keep(")
  })

  it("sends nothing from the read of a take's words but one GET of /voice-notes/:id/heard, and only Studio's idea answers read it (IH1)", () => {
    expect(sendCalls(HEARD_READ, read(HEARD_READ))).toEqual(HEARD_SENDS)
    expect(read(HEARD_READ)).toContain("/heard`")
    const readers = sourceFiles()
      .filter((f) => !isTestFile(f))
      .filter((f) =>
        /from "\.\/heard"|from "@\/lib\/home-link\/heard"/.test(read(f))
      )
    expect(readers).toEqual(["lib/idea-hearing/index.ts"])
  })

  it("sends nothing from the routine's read but one GET /routine/files and one PUT /routine/opened", () => {
    expect(sendCalls(ROUTINE_READ, read(ROUTINE_READ))).toEqual(ROUTINE_SENDS)
  })

  it("sends nothing from the read of which takes Drive has but its GETs of /voice-notes/on-drive, one per 100 waiting takes, and only the voice lane's run reads it (HF11)", () => {
    expect(sendCalls(ON_DRIVE_READ, read(ON_DRIVE_READ))).toEqual(
      ON_DRIVE_SENDS
    )
    expect(read(ON_DRIVE_READ)).toContain("/voice-notes/on-drive?ids=")
    const readers = sourceFiles()
      .filter((f) => !isTestFile(f))
      .filter((f) =>
        /from "\.\/on-drive"|from "@\/lib\/home-link\/on-drive"/.test(read(f))
      )
    expect(readers).toEqual(["lib/home-link/voice-copy.ts"])
  })

  it("still finds what it is meant to guard", () => {
    expect(
      nativeHttpUses(NATIVE_HTTP, read(NATIVE_HTTP)).length
    ).toBeGreaterThan(0)
    for (const caller of NATIVE_HTTP_CALLERS) {
      expect(valueImportsOf(caller, read(caller), isNativeHttp)).toHaveLength(1)
    }
    for (const caller of HOME_LINK_CALLERS) {
      expect(
        valueImportsOf(caller, read(caller), isHomeLink).length
      ).toBeGreaterThan(0)
    }
  })
})

describe("the checks themselves", () => {
  it("flags a data source with no PUBLIC_READ, in any call shape", () => {
    expect(
      dataSourcesWithoutPublicRead(
        "x.ts",
        'const a = createDataSource<string, unknown>(url, { mode: "static" })'
      )
    ).toHaveLength(1)
    expect(
      dataSourcesWithoutPublicRead(
        "x.ts",
        "const a = createDataSource(url, { fetchOptions: { ...PUBLIC_READ } })"
      )
    ).toEqual([])
  })

  it("flags a bare network global call and a construct, not a type or a string", () => {
    expect(
      networkGlobalUses(
        "x.ts",
        'void fetch("/a"); new WebSocket("ws://b"); new EventSource("/c")'
      )
    ).toHaveLength(3)
    expect(
      networkGlobalUses(
        "x.ts",
        'type F = typeof fetch; const s = "fetch("; // fetch("/x")'
      )
    ).toEqual([])
  })

  it("flags a transfer started from anywhere but its owner", () => {
    expect(
      transferCallProblems("lib/auth/session.ts", "void copyDeviceSessions()")
    ).toHaveLength(1)
    expect(
      transferCallProblems(
        "lib/tenant/sessions-transfer/index.ts",
        "await copyDeviceSessions()"
      )
    ).toEqual([])
    expect(
      transferCallProblems("x.ts", "const copy = copyDeviceSessions")
    ).toEqual([])
  })

  it("flags CapacitorHttp however it is reached, and a value import of the guarded modules", () => {
    expect(
      nativeHttpUses(
        "x.ts",
        'import { Capacitor } from "@capacitor/core"; Capacitor.Plugins.CapacitorHttp; Capacitor.Plugins["CapacitorHttp"]'
      )
    ).toHaveLength(2)
    expect(
      valueImportsOf(
        "x.ts",
        'import { homeLink } from "@/lib/home-link"; export { syncLessonsFrom } from "@/lib/home-link/sync"; void import("@/lib/home-link/runtime")',
        isHomeLink
      )
    ).toHaveLength(3)
    expect(
      valueImportsOf(
        "lib/device-backend/x.ts",
        'import { homeRequest } from "./native-http"; export * from "@/lib/device-backend/native-http/index.ts"; void import("./native-http/")',
        isNativeHttp
      )
    ).toHaveLength(3)
    expect(
      valueImportsOf(
        "lib/x.ts",
        'import { homeLink } from "./home-link"',
        isHomeLink
      )
    ).toHaveLength(1)
    expect(
      valueImportsOf(
        "x.ts",
        'import type { HomeCall } from "@/lib/device-backend/native-http"; import { type HomeAnswer } from "@/lib/device-backend/native-http"; import { x } from "@/lib/device-backend/native-http-other"',
        isNativeHttp
      )
    ).toEqual([])
  })

  it("finds every send, by name or as a member, with what it sends", () => {
    expect(
      sendCalls(
        "x.ts",
        'void send("GET", "/routine/files"); void link.send("PUT", path, body); void sender("GET", "/x")'
      )
    ).toEqual([ROUTINE_SENDS[0], ['"PUT"', "path", "body"]])
  })

  it("flags an eslint-disable of the rule and nothing else", () => {
    expect(
      networkLintDisables(
        "x.ts",
        "// eslint-disable-next-line no-restricted-globals\nfetch(x)"
      )
    ).toHaveLength(1)
    expect(
      networkLintDisables("x.ts", "// eslint-disable-next-line no-console")
    ).toEqual([])
  })
})

describe("LA13: what copies a voice note for home", () => {
  /** Each non-test file whose text matches `pattern`. */
  const using = (pattern: RegExp): Array<string> =>
    sourceFiles()
      .filter((f) => !isTestFile(f))
      .filter((f) => pattern.test(readFileSync(join(SRC, f), "utf8")))
      .sort()

  it("reaches the copies' store only from the voice lane, and copies only in voice-copy", () => {
    expect(using(/from "@\/lib\/voice-home"/)).toEqual([
      "lib/home-link/voice-copy.ts",
      "lib/home-link/voice.ts",
    ])
    expect(
      using(/\.copy\(/).filter((f) => f.startsWith("lib/home-link/"))
    ).toEqual(["lib/home-link/voice-copy.ts"])
  })

  it("starts the watch only from the lane's hook, and reads scene notes for home only there", () => {
    expect(using(/watchVoiceNotes\(/)).toEqual([
      "lib/home-link/voice-copy.ts",
      "lib/home-link/voice.ts",
    ])
    expect(using(/sceneNotes\./)).toEqual(["lib/home-link/voice-copy.ts"])
  })
})
