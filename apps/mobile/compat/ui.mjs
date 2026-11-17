#!/usr/bin/env node
// Drives the app's screen as a person would, for android-compat.yml's storm
// scenario (COMPAT2): finds a control in the accessibility tree
// (`uiautomator dump`, where the WebView exposes its controls by label, text,
// placeholder and HTML id) and taps it or types into it with `adb shell
// input`. It works on the release APK, which keeps DevTools closed.
//
//   node apps/mobile/compat/ui.mjs find '<pattern>'
//   node apps/mobile/compat/ui.mjs tap '<pattern>'
//   node apps/mobile/compat/ui.mjs type '<pattern>' '<text>'
//
// <pattern> is a case-insensitive regular expression matched against each
// node's text, content-desc, hint and resource-id. Retries for up to 30 s,
// since a slowed emulator renders late. Exits non-zero when nothing
// matches, and leaves the last dump at ui-last.xml in the working directory
// for reading why.
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"

const [action, pattern, text] = process.argv.slice(2)
if (!action || !pattern) {
  throw new Error("usage: ui.mjs find|tap|type '<pattern>' ['<text>']")
}
const wanted = new RegExp(pattern, "i")

const adb = (...args) => execFileSync("adb", args, { encoding: "utf8" })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const attribute = (node, name) =>
  (node.match(new RegExp(`\\b${name}="([^"]*)"`)) ?? [])[1] ?? ""

/** The first matching node's centre, or null. */
function find(xml) {
  for (const node of xml.match(/<node\b[^>]*>/g) ?? []) {
    const names = ["text", "content-desc", "hint", "resource-id"].map((n) =>
      attribute(node, n)
    )
    if (!names.some((name) => name !== "" && wanted.test(name))) continue
    const bounds = attribute(node, "bounds").match(/-?\d+/g)?.map(Number)
    if (!bounds || bounds.length !== 4) continue
    const [left, top, right, bottom] = bounds
    if (right <= left || bottom <= top) continue
    return {
      x: Math.round((left + right) / 2),
      y: Math.round((top + bottom) / 2),
    }
  }
  return null
}

let found = null
let xml = ""
for (const end = Date.now() + 30_000; Date.now() < end; await sleep(1_000)) {
  adb("shell", "uiautomator", "dump", "/sdcard/ui.xml")
  xml = adb("exec-out", "cat", "/sdcard/ui.xml")
  found = find(xml)
  if (found) break
}
writeFileSync("ui-last.xml", xml)
if (!found) throw new Error(`nothing on screen matches /${pattern}/i`)

if (action === "tap" || action === "type") {
  adb("shell", "input", "tap", String(found.x), String(found.y))
}
if (action === "type") {
  // `input text` takes no spaces; %s is its space.
  adb("shell", "input", "text", (text ?? "").replace(/ /g, "%s"))
}
process.stdout.write(`${found.x} ${found.y}\n`)
