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
 *   marks of what this phone keeps on home (LA15; its voice run also sends
 *   one `PUT /voice-notes/:id/set-aside` per note let go on the phone that
 *   home holds, from `lib/home-link/set-aside`, MIC2), what hands aph's lane to
 *   them, Settings' readout of what is kept where, the readout and port
 *   of the routine's files in Korean (whose read sends one
 *   `GET /routine/files` and whose telling of what was opened one
 *   `PUT /routine/opened`), and Studio's idea answers asking home for a
 *   take's words (`lib/idea-hearing`, whose read sends one
 *   `GET /voice-notes/:id/heard`) may call `lib/home-link`. The voice lane
 *   also hands Rust Rounds' notes a way to hear a note from home
 *   (`lib/home-link/voice-audio`, RR6, whose read sends one
 *   `GET /voice-notes/:id/audio` per play), read only by that lane. My data
 *   (`lib/my-data`, MD2) asks home what it keeps
 *   (`lib/home-link/kept-read`, whose read sends one `GET /voice-notes/kept`
 *   per open or drag down, and on the overview one `GET /subjects/me/kept`
 *   of the record kept for good, MD2b), and what home deleted for good
 *   (`lib/home-link/deleted-read`, MD3, whose read sends one
 *   `GET /voice-notes/deleted` per open or drag down of its Deleted page).
 *   Studio's Takes on home (`lib/take-library`, ST32) asks home for the
 *   takes it keeps (`lib/home-link/takes-read`, whose read sends one
 *   `GET /voice-notes/takes` per open, Try again, search or Show the
 *   newest, a blank search showing the newest, `?q=` holding the search's
 *   words) and, per Play, for one take's audio, through the same read Rust
 *   Rounds' notes use (`lib/home-link/voice-audio`). Studio's feed videos
 *   (`lib/call-videos`, ST38, FEED4) asks home for the episodes of a feed
 *   (the weekly call or Playoff Delta) it holds (`lib/home-link/call-videos`,
 *   one `GET /feeds/:feed/videos` per open, drag down, Try again or Save home
 *   kept), for an episode's video on Watch, a part at a time (one
 *   `GET /feeds/:feed/videos/:key/video` per part), and sends an episode's
 *   link on Save (one `PUT /feeds/:feed/videos/:key/link`).
 *
 * - **LA19 (MY-DATA MD5): only My data deletes a record on home.** Only
 *   `lib/home-link/delete-note` sends home a `DELETE` (a recording's notes,
 *   or a step of a feed's episode), only `lib/my-data` imports it, and only its
 *   two delete runtimes call it, once a run each
 *   (docs/learner-data-authority.md holds the rest).
 *
 * The last group feeds the checks known-bad sources, so a check that stopped
 * looking cannot stay green.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, posix, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"

// EG1: a scan fails only on a violation, not on a busy CI host. Each scan
// reads and parses every source file in www; vitest's 5 s default left no
// room on a busy host, where the LA8 scan took 5.1 s. 30 s covers host load
// on today's tree. Tolerance: a tree whose scan nears 30 s, which then wants
// the files parsed once for every check, not a larger number here.
vi.setConfig({ testTimeout: 30_000 })

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
  // home for a take's words while the screen shows it being heard; and a new
  // idea's screen (ST26, `ideaHome`), which reads whether the phone is paired
  // and how the voice lane's last run ended, and listens for either
  // changing, asking home nothing.
  "lib/idea-hearing/index.ts",
  // LA8 (RR13): Rust Rounds' week, which reads whether the phone is paired
  // (`ideaHome`) and asks home once per opening for the words of each take
  // sent that the phone has none of.
  "routes/_dashboard/_apk/rust-rounds.tsx",
  // LA15, PULL2: a pull on a Jobs screen or the status page hears how the
  // jobs lane's run in the pull of home ended (`pulledLane`), asking nothing
  // of its own.
  "lib/jobs/pull.ts",
  // LA8 (MY-DATA MD2): My data, which reads the recordings the voice lane
  // lists and where each is kept, and asks home what it keeps.
  "lib/my-data/index.ts",
  // LA8 (ST26 c): Studio's Ideas on home, which asks home for the ideas and
  // their lists as the screen opens or is asked again, and writes a mark or a
  // list's entry on a tap.
  "lib/idea-home/index.ts",
  // LA8 (ST32): Studio's Takes on home, which asks home for the takes it
  // keeps as the screen opens and on Try again, a search (a blank one reads
  // the newest) or Show the newest, and for one take's audio on each Play.
  "lib/take-library/index.ts",
  // LA8 (ST38, FEED4): Studio's feed videos, which asks home for a feed's
  // episodes it holds as the screen opens, on a drag down, on Try again and
  // after a Save, for an episode's video a part at a time on Watch, and sends
  // an episode's link on Save.
  "lib/call-videos/index.ts",
  // LA8 (ST33): Studio's Finish, which hands the voice lane a video kept for
  // home to make and hears what home answered and lists of it
  // (`studioVideos`), sending nothing of its own.
  "routes/_dashboard/_apk/journal/episodes/making.tsx",
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
  "lib/home-link/voice-audio.ts",
  "lib/home-link/kept-read.ts",
  "lib/home-link/deleted-read.ts",
  "lib/home-link/idea-reads.ts",
  "lib/home-link/takes-read.ts",
  "lib/home-link/call-videos.ts",
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

/**
 * LA8, RR6, ST32: the read of one note's audio (a Rust Rounds note, or a
 * Studio take on Takes on home), and the one request it may send.
 */
const AUDIO_READ = "lib/home-link/voice-audio.ts"
const AUDIO_SENDS = [['"GET"', "audioPath(id)"]]

/** LA8, MD2: the read of what home keeps, and the one request it may send. */
const KEPT_READ = "lib/home-link/kept-read.ts"
const KEPT_SENDS = [
  ['"GET"', "keptPath(of, note)"],
  ['"GET"', '"/subjects/me/kept"'],
]

/** LA8, ST32: the read of the takes home keeps, and the one request it may send. */
const TAKES_READ = "lib/home-link/takes-read.ts"
const TAKES_SENDS = [['"GET"', "takesPath(q)"]]

/**
 * LA8, ST38, FEED4: Studio's feed videos' reads of a feed's episodes and of an
 * episode's video, a part at a time, and its one send of an episode's link.
 */
const CALLS_READ = "lib/home-link/call-videos.ts"
const CALLS_SENDS = [
  ['"GET"', "episodesPath(feed)"],
  ['"GET"', "videoPath(feed, key)", "undefined", "{ start, end }"],
  ['"PUT"', "linkPath(feed, key)", "JSON.stringify({ link })"],
]
/** The three paths those requests reach, as the read writes them. */
const CALLS_PATHS = [
  "return `/feeds/${feed}/videos`",
  "return `/feeds/${feed}/videos/${encodeURIComponent(key)}/video`",
  "return `/feeds/${feed}/videos/${encodeURIComponent(key)}/link`",
]

/** LA8, MD3: the read of what home deleted, and the one request it may send. */
const DELETED_READ = "lib/home-link/deleted-read.ts"
const DELETED_SENDS = [['"GET"', "DELETED_PATH"]]

/** LA8, ST26 (c): Ideas on home's requests, one per ask, and the ones it may send. */
const IDEA_READS = "lib/home-link/idea-reads.ts"
const IDEA_SENDS = [
  ['"GET"', "path"],
  ['"PUT"', "path", "JSON.stringify({ furnishing: ask.furnishing })"],
  ['"PUT"', "path"],
  ['ask.listed ? "PUT" : "DELETE"', "path"],
]

/**
 * LA8, LA13 (MIC2): the voice lane's set-aside marks, and the one request
 * they may send, once per mark due.
 */
const SET_ASIDE_SEND = "lib/home-link/set-aside.ts"
const SET_ASIDE_SENDS = [['"PUT"', "setAsidePath(mark)"]]

/** LA19 (MD5): the one module that sends home a delete, and what it sends. */
const DELETE_SEND = "lib/home-link/delete-note.ts"
const DELETE_SENDS = [
  // A recording's notes, one per note.
  [expect.stringMatching(/^async \(send\) =>/)],
  ['"DELETE"', "deletePath(id)"],
  // A feed episode's step (ST38, FEED4), one per confirm.
  [expect.stringMatching(/^\(send\) =>/)],
  ['"DELETE"', "callStepPath(feed, key, step)"],
]

/**
 * LA19 (MD5): the requests to home whose method is not written where they
 * are sent, and why none of them can be a `DELETE`.
 */
const VARIABLE_METHOD_SENDS = [
  // The Jobs notice's filing, `PUT` or `DELETE` of `/jobs/notice` alone: it
  // files and unfiles a push token, never a record.
  "lib/jobs/home.ts",
  // `noticingBusy`'s wrapper, which passes its caller's method through.
  "lib/home-link/runtime.ts",
  // The sessions copy's transport, which throws on anything but `GET`,
  // `POST` and `PATCH` before it sends.
  "lib/home-link/sessions.ts",
  // The shelf's `answerOrEnd`, whose method is typed `"GET" | "PUT"`.
  "lib/home-link/shelf.ts",
  // Ideas on home's list entry (ST26 c), `PUT` or `DELETE` of
  // `/idea-lists/{topics,keywords}/:name` alone: it puts an entry on a list
  // home keeps or takes it off, a mark home keeps (paulgsc/server invariant
  // 32), never a record.
  "lib/home-link/idea-reads.ts",
]

/** LA19 (MD5): the one module that hands My data's delete runtimes their ports. */
const DELETE_WIRING = "lib/my-data/index.ts"
const DELETE_RUNTIME = "lib/my-data/deleting-runtime.ts"
const CALL_DELETE_RUNTIME = "lib/my-data/call-deleting-runtime.ts"

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

/**
 * LA19: every request to home in `text` (a `send` with a method and a path)
 * whose method is a `DELETE`, or is not written there, as its arguments.
 */
function deleteRisks(
  path: string,
  text: string
): { deletes: Array<Array<string>>; variable: Array<Array<string>> } {
  const requests = sendCalls(path, text).filter((args) => args.length >= 2)
  // A template with a substitution names its method elsewhere.
  const literal = (arg: string | undefined): boolean =>
    arg !== undefined && /^(["'`]).*\1$/s.test(arg) && !arg.includes("${")
  return {
    deletes: requests.filter((args) =>
      /^["'`]DELETE["'`]$/.test(args[0] ?? "")
    ),
    variable: requests.filter((args) => !literal(args[0])),
  }
}

/**
 * LA19: whether `text` names a `DELETE` in a string beside a string naming a
 * `/voice-notes/`, `/call/videos/` or `/feeds/` path: a request to one of
 * home's deletes however it is sent.
 */
function namesRecordDelete(path: string, text: string): boolean {
  const found = { method: false, record: false }
  walk(parse(path, text), (node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node)) {
      if (node.text === "DELETE") found.method = true
      if (/\/voice-notes\/|\/call\/videos\/|\/feeds\//.test(node.text))
        found.record = true
    }
  })
  return found.method && found.record
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
      "lib/testing-data/index.ts",
      "lib/topik-content/index.ts",
      "lib/web-surface/hangul/vocab.ts",
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

  it("runs the link's drain only from the lanes' wiring (LA15)", () => {
    const drains = (f: string): boolean => /\.drain\(/.test(read(f))
    expect(
      sources.filter(
        (f) =>
          (f.startsWith("lib/home-link/") || HOME_LINK_CALLERS.has(f)) &&
          drains(f)
      )
    ).toEqual(["lib/home-link/lanes.ts"])
  })

  it("calls the link's keep only from the drain and Korean's look (LA15)", () => {
    const keeps = (f: string): boolean => /\.keep\(/.test(read(f))
    const reach = sources.filter(
      (f) =>
        (f.startsWith("lib/home-link/") || HOME_LINK_CALLERS.has(f)) &&
        !KEEPERS.has(f)
    )
    expect(reach.filter(keeps)).toEqual([])
    expect(read(ROUTINE_READ)).toContain("homeLink().keep(")
    expect(read(HEARD_READ)).toContain("homeLink().keep(")
    expect(read(AUDIO_READ)).toContain("homeLink().keep(")
    expect(read(KEPT_READ)).toContain("homeLink().keep(")
    expect(read(DELETED_READ)).toContain("homeLink().keep(")
    expect(read(TAKES_READ)).toContain("homeLink().keep(")
    expect(read(CALLS_READ)).toContain("homeLink().keep(")
  })

  it("sends nothing from the read of what home deleted but one GET of /voice-notes/deleted, and only My data reads it (MD3)", () => {
    expect(sendCalls(DELETED_READ, read(DELETED_READ))).toEqual(DELETED_SENDS)
    expect(read(DELETED_READ)).toContain('"/voice-notes/deleted"')
    const readers = sourceFiles()
      .filter((f) => !isTestFile(f))
      .filter((f) =>
        /from "\.\/deleted-read"|from "@\/lib\/home-link\/deleted-read"/.test(
          read(f)
        )
      )
    expect(readers).toEqual(["lib/my-data/index.ts"])
  })

  it("sends nothing from the read of what home keeps but one GET of /voice-notes/kept and one of /subjects/me/kept, and only My data reads it (MD2, MD2b)", () => {
    expect(sendCalls(KEPT_READ, read(KEPT_READ))).toEqual(KEPT_SENDS)
    expect(read(KEPT_READ)).toContain('"/voice-notes/kept"')
    const readers = sourceFiles()
      .filter((f) => !isTestFile(f))
      .filter((f) =>
        /from "\.\/kept-read"|from "@\/lib\/home-link\/kept-read"/.test(read(f))
      )
    expect(readers).toEqual(["lib/my-data/index.ts"])
  })

  it("sends nothing from the read of the takes home keeps but one GET of /voice-notes/takes, and only Takes on home reads it (ST32)", () => {
    expect(sendCalls(TAKES_READ, read(TAKES_READ))).toEqual(TAKES_SENDS)
    expect(read(TAKES_READ)).toContain('"/voice-notes/takes"')
    const readers = sourceFiles()
      .filter((f) => !isTestFile(f))
      .filter((f) =>
        /from "\.\/takes-read"|from "@\/lib\/home-link\/takes-read"/.test(
          read(f)
        )
      )
    expect(readers).toEqual(["lib/take-library/index.ts"])
  })

  it("sends nothing from Studio's feed videos but a feed's list, its video's parts and an episode's link, and only Studio's feed videos asks them (ST38, FEED4)", () => {
    expect(sendCalls(CALLS_READ, read(CALLS_READ))).toEqual(CALLS_SENDS)
    for (const path of CALLS_PATHS) expect(read(CALLS_READ)).toContain(path)
    const readers = sourceFiles()
      .filter((f) => !isTestFile(f))
      .filter((f) =>
        /from "\.\/call-videos"|from "@\/lib\/home-link\/call-videos"/.test(
          read(f)
        )
      )
    expect(readers).toEqual(["lib/call-videos/index.ts"])
  })

  it("sends nothing from Ideas on home but its four requests, and only it asks them (ST26 c)", () => {
    expect(sendCalls(IDEA_READS, read(IDEA_READS))).toEqual(IDEA_SENDS)
    expect(read(IDEA_READS)).toContain("homeLink().keep(")
    const callers = sourceFiles()
      .filter((f) => !isTestFile(f))
      .filter((f) =>
        /from "\.\/idea-reads"|from "@\/lib\/home-link\/idea-reads"/.test(
          read(f)
        )
      )
    expect(callers).toEqual(["lib/idea-home/index.ts"])
  })

  it("sends nothing from the read of a note's audio but one GET of /voice-notes/:id/audio, and only the voice lane and Takes on home read it (RR6, ST32)", () => {
    expect(sendCalls(AUDIO_READ, read(AUDIO_READ))).toEqual(AUDIO_SENDS)
    const readers = sourceFiles()
      .filter((f) => !isTestFile(f))
      .filter((f) =>
        /from "\.\/voice-audio"|from "@\/lib\/home-link\/voice-audio"/.test(
          read(f)
        )
      )
    expect(readers).toEqual([
      "lib/home-link/voice-copy.ts",
      "lib/take-library/index.ts",
    ])
  })

  it("sends nothing from the read of a take's words but one GET of /voice-notes/:id/heard, and only Studio's idea answers and Rust Rounds' week read it (IH1, RR13)", () => {
    expect(sendCalls(HEARD_READ, read(HEARD_READ))).toEqual(HEARD_SENDS)
    expect(read(HEARD_READ)).toContain("/heard`")
    const readers = sourceFiles()
      .filter((f) => !isTestFile(f))
      .filter((f) =>
        /from "\.\/heard"|from "@\/lib\/home-link\/heard"/.test(read(f))
      )
    expect(readers).toEqual([
      "lib/idea-hearing/index.ts",
      "routes/_dashboard/_apk/rust-rounds.tsx",
    ])
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

  it("sends nothing from the set-aside marks but one bodiless PUT of /voice-notes/:id/set-aside per mark, and only the voice lane's run sends them (MIC2)", () => {
    expect(sendCalls(SET_ASIDE_SEND, read(SET_ASIDE_SEND))).toEqual(
      SET_ASIDE_SENDS
    )
    expect(read(SET_ASIDE_SEND)).toContain("/set-aside?")
    const senders = sourceFiles()
      .filter((f) => !isTestFile(f))
      .filter((f) =>
        /from "\.\/set-aside"|from "@\/lib\/home-link\/set-aside"/.test(read(f))
      )
    expect(senders).toEqual(["lib/home-link/voice-copy.ts"])
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

describe("LA19 (MD5): only My data deletes a record on home", () => {
  const sources = sourceFiles().filter((f) => !isTestFile(f))
  const read = (f: string): string => readFileSync(join(SRC, f), "utf8")

  it("sends a DELETE to home from delete-note alone, a note's or a feed episode's step", () => {
    const deleting = sources.filter(
      (f) => deleteRisks(f, read(f)).deletes.length > 0
    )
    expect(deleting).toEqual([DELETE_SEND])
    expect(sendCalls(DELETE_SEND, read(DELETE_SEND))).toEqual(DELETE_SENDS)
    expect(read(DELETE_SEND)).toContain(
      "return `/feeds/${feed}/videos/${encodeURIComponent(key)}/${step}`"
    )
  })

  it("sends a method not written where it is sent only from the five callers that can't be a DELETE of a record", () => {
    expect(
      sources.filter((f) => deleteRisks(f, read(f)).variable.length > 0).sort()
    ).toEqual([...VARIABLE_METHOD_SENDS].sort())
    expect(
      deleteRisks("lib/jobs/home.ts", read("lib/jobs/home.ts")).variable
    ).toEqual([
      [
        "filing.method",
        '"/jobs/notice"',
        "JSON.stringify({ token: filing.token })",
      ],
    ])
    expect(read("lib/home-link/sessions.ts")).toContain(
      'if (method !== "GET" && method !== "POST" && method !== "PATCH")'
    )
    expect(read("lib/home-link/shelf.ts")).toContain('method: "GET" | "PUT"')
    expect(deleteRisks(IDEA_READS, read(IDEA_READS)).variable).toEqual([
      ['ask.listed ? "PUT" : "DELETE"', "path"],
    ])
    expect(read(IDEA_READS)).toContain(
      "return `/idea-lists/${ask.list}/${encodeURIComponent(ask.name)}`"
    )
  })

  it("names a DELETE beside a voice-notes, call videos or feeds path nowhere but delete-note", () => {
    expect(sources.filter((f) => namesRecordDelete(f, read(f)))).toEqual([
      DELETE_SEND,
    ])
  })

  it("is imported by My data alone, which hands each delete runtime its one port", () => {
    const isDelete = (module: string): boolean =>
      module === "lib/home-link/delete-note"
    expect(
      sources.filter((f) => valueImportsOf(f, read(f), isDelete).length > 0)
    ).toEqual([DELETE_WIRING])
    const wiring = read(DELETE_WIRING)
    expect(wiring.match(/\bdeleteNotes\b/g)).toHaveLength(2)
    expect(wiring).toMatch(/createDeleting\(\{\s*deleteNotes,/)
    expect(wiring.match(/\bdeleteCallStep\b/g)).toHaveLength(2)
    expect(wiring).toMatch(/createCallDeleting\(\{\s*deleteCallStep,/)
    // Each runtime calls its port once, in its run.
    expect(read(DELETE_RUNTIME).match(/ports\.deleteNotes\(/g)).toHaveLength(1)
    expect(
      read(CALL_DELETE_RUNTIME).match(/ports\.deleteCallStep\(/g)
    ).toHaveLength(1)
    expect(
      sources
        .filter((f) => f !== DELETE_RUNTIME)
        .filter((f) => /\.deleteNotes\(/.test(read(f)))
    ).toEqual([])
    expect(
      sources
        .filter((f) => f !== CALL_DELETE_RUNTIME)
        .filter((f) => /\.deleteCallStep\(/.test(read(f)))
    ).toEqual([])
  })

  it("flags a second sender, a variable method and a hidden record delete", () => {
    expect(
      deleteRisks("x.ts", 'void send("DELETE", `/voice-notes/${id}`)').deletes
    ).toHaveLength(1)
    expect(
      deleteRisks("x.ts", "void send(how, path); void homeLink().send(run)")
        .variable
    ).toEqual([["how", "path"]])
    expect(
      deleteRisks("x.ts", "void send(`${how}`, path)").variable
    ).toHaveLength(1)
    expect(
      namesRecordDelete(
        "x.ts",
        'void request(`/voice-notes/${id}`, { method: "DELETE" })'
      )
    ).toBe(true)
    expect(
      namesRecordDelete(
        "x.ts",
        '// "DELETE" /voice-notes/x\nvoid get("/voice-notes/kept")'
      )
    ).toBe(false)
    expect(
      namesRecordDelete(
        "x.ts",
        'void request(`/call/videos/${from}/rest`, { method: "DELETE" })'
      )
    ).toBe(true)
    expect(
      namesRecordDelete(
        "x.ts",
        'void request(`/feeds/${feed}/videos/${key}/rest`, { method: "DELETE" })'
      )
    ).toBe(true)
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
