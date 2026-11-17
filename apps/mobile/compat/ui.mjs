#!/usr/bin/env node
// Drives the app's screen as a person would, for android-compat.yml's storm
// scenario (COMPAT2): finds a control in the accessibility tree
// (`uiautomator dump`, where the WebView exposes its controls by label, text,
// placeholder and HTML id) and taps it or types into it with `adb shell
// input`. It works on the release APK, which keeps DevTools closed.
//
//   node apps/mobile/compat/ui.mjs find '<names>'
//   node apps/mobile/compat/ui.mjs tap '<names>'
//   node apps/mobile/compat/ui.mjs type '<names>' '<text>'
//
// <names> is one or more names separated by `|`, each compared, ignoring
// case, with a node's text, content-desc, hint and resource-id: equal, or
// starting with it when it ends in `*` ("Pair with*"). Literal text, never
// a pattern, so no argument is compiled into a regular expression. Retries for up to 30 s,
// since a slowed emulator renders late; `find` accepts a match scrolled out
// of view, while `tap` and `type` scroll the page down until it is on
// screen. Exits non-zero when nothing
// matches, and leaves the last dump at ui-last.xml in the working directory
// for reading why.
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"

const [action, pattern, text] = process.argv.slice(2)
if (!action || !pattern) {
  throw new Error("usage: ui.mjs find|tap|type '<names>' ['<text>']")
}
const names = pattern.split("|").map((name) => name.toLowerCase())
const wanted = (label) => {
  const seen = label.toLowerCase()
  return names.some((name) =>
    name.endsWith("*") ? seen.startsWith(name.slice(0, -1)) : seen === name
  )
}

const adb = (...args) => execFileSync("adb", args, { encoding: "utf8" })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const attribute = (node, name) =>
  (node.match(new RegExp(`\\b${name}="([^"]*)"`)) ?? [])[1] ?? ""

/**
 * The first matching node: its centre, and whether it is on screen. A node
 * scrolled out of the WebView's view is still in the tree, with no height.
 */
function find(xml) {
  let offScreen = null
  for (const node of xml.match(/<node\b[^>]*>/g) ?? []) {
    const labels = ["text", "content-desc", "hint", "resource-id"].map((n) =>
      attribute(node, n)
    )
    if (!labels.some((label) => label !== "" && wanted(label))) continue
    // A disabled control does nothing when tapped: wait for it to enable.
    if (action !== "find" && attribute(node, "enabled") === "false") continue
    const bounds = attribute(node, "bounds").match(/-?\d+/g)?.map(Number)
    if (!bounds || bounds.length !== 4) continue
    const [left, top, right, bottom] = bounds
    const centre = {
      x: Math.round((left + right) / 2),
      y: Math.round((top + bottom) / 2),
    }
    if (right > left && bottom > top) return { ...centre, visible: true }
    offScreen ??= { ...centre, visible: false }
  }
  return offScreen
}

// Scrolls the page down a third of the screen: a drag upwards, never down,
// which at the page's top would be a pull.
function scrollDown() {
  const size = adb("shell", "wm", "size").match(/(\d+)x(\d+)\s*$/m)
  const [width, height] = size
    ? [Number(size[1]), Number(size[2])]
    : [1080, 1920]
  const x = String(Math.round(width / 2))
  adb(
    "shell",
    "input",
    "swipe",
    x,
    String(Math.round(height * 0.7)),
    x,
    String(Math.round(height * 0.4)),
    "400"
  )
}

let found = null
let xml = ""
// UI_WAIT_SECONDS shortens the wait, to ask whether something is on screen.
const waitMs = Number(process.env.UI_WAIT_SECONDS || 30) * 1000
for (const end = Date.now() + waitMs; Date.now() < end; await sleep(1_000)) {
  adb("shell", "uiautomator", "dump", "/sdcard/ui.xml")
  xml = adb("exec-out", "cat", "/sdcard/ui.xml")
  found = find(xml)
  if (found && (found.visible || action === "find")) break
  if (action !== "find") scrollDown()
}
if (found && !found.visible && action !== "find") found = null
writeFileSync("ui-last.xml", xml)
if (!found) throw new Error(`nothing on screen is named ${pattern}`)

if (action === "tap" || action === "type") {
  adb("shell", "input", "tap", String(found.x), String(found.y))
}
if (action === "type") {
  // `input text` takes no spaces; %s is its space.
  adb("shell", "input", "text", (text ?? "").replace(/ /g, "%s"))
}
process.stdout.write(`${found.x} ${found.y}\n`)
