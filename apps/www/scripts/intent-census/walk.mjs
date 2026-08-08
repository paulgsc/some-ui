/**
 * The AST half of the census: mechanically enumerate every intent-producer
 * call site under `apps/www/src`. What a producer *means* — its gesture, its
 * rendered states, whether it should be silent — is not something an AST can
 * know; that judgment lives in `annotations.mjs` and is cross-checked against
 * this walk's output rather than typed in free-hand.
 *
 * Four producer shapes, matching #938's task list:
 *  - `mutate`/`mutateAsync` call sites (TanStack mutations already defined
 *    in `lib/tenant/hooks.ts`).
 *  - `useMutation(` definitions themselves (the 8 in hooks.ts).
 *  - Browser-API call sites: `Notification.requestPermission`,
 *    `*.showNotification`, `navigator.serviceWorker.register`,
 *    `*.pushManager.subscribe`/`getSubscription`, `*.unsubscribe`,
 *    `*.localStorage.setItem`/`removeItem`, the raw `fetch(` inside
 *    `file-host-config/client.ts`.
 *  - `confirm(` gates, which are not producers themselves but are the
 *    pre-condition on two of them (session delete, bulk delete) and worth
 *    recording for the same reason `showNudge`'s `toast` is: they are a
 *    signal already present, and a census that only lists silence would
 *    misrepresent the app.
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { extname, join, relative } from "node:path"
import ts from "typescript"

const BROWSER_API_PROPERTY_NAMES = new Set([
  "showNotification",
  "requestPermission",
  "register",
  "subscribe",
  "getSubscription",
  "unsubscribe",
])

const LOCAL_STORAGE_PROPERTY_NAMES = new Set(["setItem", "removeItem"])

/**
 * `lib/study-nudge/service-worker.ts` wraps every browser-API call behind a
 * named async function (`requestNudgePermission`, `showNudge`, ...) so that
 * `nudgesSupported()` can gate all of them in one place. That means the
 * *call sites* a gesture handler actually writes are bare identifier calls,
 * not property access - structurally indistinguishable from any other
 * function call in the file. Flagging every identifier call would bury the
 * signal in noise, so this is a fixed allow-list of the module's own public
 * surface (its exported names) rather than a structural pattern - the
 * tradeoff named in this script's own header.
 */
const NUDGE_PRODUCER_FUNCTION_NAMES = new Set([
  "requestNudgePermission",
  "registerNudgeWorker",
  "showNudge",
  "subscribeToPush",
  "unsubscribeFromPush",
  "hasPushSubscription",
  "fetchPushTopics",
  "reconcilePushSubscription",
])

/** The two ambient (non-gesture) producers #940 names explicitly by
 * file:line in the epic body - same allow-list tradeoff as the nudge set
 * above, for the same reason: `reportSessionTransition` and
 * `migrateLocalSessions` are bare identifier calls with no structural
 * signature of their own. */
const AMBIENT_PRODUCER_FUNCTION_NAMES = new Set([
  "reportSessionTransition",
  "migrateLocalSessions",
])

/** Files under apps/www/src the census walks. Tests are evidence *about*
 * producers, not producers themselves - counting them would inflate every
 * number by however thorough the test suite happens to be. */
function isCensusSource(fileName) {
  if (!/\.(ts|tsx)$/.test(fileName)) return false
  if (/\.(test|spec)\.(ts|tsx)$/.test(fileName)) return false
  return true
}

function walkDir(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walkDir(full, out)
    } else if (isCensusSource(entry)) {
      out.push(full)
    }
  }
  return out
}

function lineOf(sourceFile, node) {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  )
}

/** Nearest named function/arrow/method ancestor - the census's "gesture
 * handler" column. Falls back to the nearest top-level declaration name so a
 * hook body (no enclosing function of its own) still gets a sensible label. */
function isFunctionLike(node) {
  return (
    !!node &&
    (ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node))
  )
}

function enclosingNameOf(node) {
  let current = node.parent
  while (current) {
    if (
      (ts.isFunctionDeclaration(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isFunctionExpression(current)) &&
      current.name
    ) {
      return current.name.getText()
    }
    // Only a stopping point when the name actually labels a function value
    // (`const handleSave = (): void => {...}`, `onSuccess: (session) => {...}`)
    // - a plain local like `const subscription = await active.pushManager...`
    // is not a gesture handler and should be walked past, not reported as one.
    if (
      (ts.isVariableDeclaration(current) || ts.isPropertyAssignment(current)) &&
      current.name &&
      ts.isIdentifier(current.name) &&
      isFunctionLike(current.initializer)
    ) {
      return current.name.text
    }
    current = current.parent
  }
  return "<module scope>"
}

function propertyChainText(expr) {
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text
  return null
}

/**
 * Walk one file's AST, returning every producer-shaped call site found in
 * it. `relFile` is repo-relative so the census doesn't embed this machine's
 * absolute path.
 */
function walkFile(filePath, relFile, sourceText) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )

  const sites = []

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const { expression } = node
      const line = lineOf(sourceFile, node)
      const enclosing = enclosingNameOf(node)

      if (ts.isPropertyAccessExpression(expression)) {
        const prop = expression.name.text
        if (prop === "mutate" || prop === "mutateAsync") {
          sites.push({
            kind: "mutate-call",
            file: relFile,
            line,
            enclosing,
            receiver: expression.expression.getText(),
            prop,
          })
        } else if (BROWSER_API_PROPERTY_NAMES.has(prop)) {
          // `useMutation`'s own definitions never take this shape (a bare
          // identifier call, handled below), so no overlap to de-dupe.
          sites.push({
            kind: "browser-api-call",
            file: relFile,
            line,
            enclosing,
            receiver: expression.expression.getText(),
            prop,
          })
        } else if (LOCAL_STORAGE_PROPERTY_NAMES.has(prop)) {
          const receiverText = expression.expression.getText()
          if (/localStorage/.test(receiverText)) {
            sites.push({
              kind: "local-storage-call",
              file: relFile,
              line,
              enclosing,
              receiver: receiverText,
              prop,
            })
          }
        }
      } else if (ts.isIdentifier(expression)) {
        if (expression.text === "useMutation") {
          sites.push({
            kind: "use-mutation-definition",
            file: relFile,
            line,
            enclosing,
          })
        } else if (expression.text === "fetch") {
          sites.push({
            kind: "fetch-call",
            file: relFile,
            line,
            enclosing,
          })
        } else if (expression.text === "confirm") {
          sites.push({
            kind: "confirm-call",
            file: relFile,
            line,
            enclosing,
          })
        } else if (NUDGE_PRODUCER_FUNCTION_NAMES.has(expression.text)) {
          sites.push({
            kind: "nudge-producer-call",
            file: relFile,
            line,
            enclosing,
            callee: expression.text,
          })
        } else if (AMBIENT_PRODUCER_FUNCTION_NAMES.has(expression.text)) {
          sites.push({
            kind: "ambient-producer-call",
            file: relFile,
            line,
            enclosing,
            callee: expression.text,
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return sites
}

/**
 * Entry point: walk `srcRoot` (an absolute path to `apps/www/src`) and
 * return every producer-shaped call site, sorted for a deterministic diff.
 */
export function walkIntentProducers(srcRoot, repoRoot) {
  const files = walkDir(srcRoot, [])
  const sites = []
  for (const filePath of files) {
    const relFile = relative(repoRoot, filePath).split("\\").join("/")
    const sourceText = readFileSync(filePath, "utf8")
    sites.push(...walkFile(filePath, relFile, sourceText))
  }
  sites.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  return sites
}

export function idOf(site) {
  return `${site.file}:${site.line}`
}
