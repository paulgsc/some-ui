#!/usr/bin/env node
// Evaluates an expression in the app's page over the WebView's DevTools
// socket, for android-compat.yml's storm scenario (COMPAT2): setting the
// stand-in home's address up and reading what the page shows. The gestures
// themselves are real (`adb shell input swipe`); this only sets up and looks.
//
//   node apps/mobile/compat/page.mjs '<expression>'
//
// Prints the value as JSON. Needs a debuggable build (the debug APK:
// Capacitor enables WebView debugging only there) and `adb` on PATH. Each
// call finds the app's socket afresh, since the process can change across a
// network toggle or a return from the background.
import { execFileSync } from "node:child_process"

const PKG = "dev.paulgsc.someui"
const PORT = 9333
const expression = process.argv[2]
if (!expression) throw new Error("usage: page.mjs '<expression>'")

const adb = (...args) => execFileSync("adb", args, { encoding: "utf8" }).trim()

const pid = adb("shell", "pidof", PKG).replace(/\r/g, "")
if (!pid) throw new Error(`${PKG} is not running`)
const socket = `webview_devtools_remote_${pid}`
adb("forward", `tcp:${PORT}`, `localabstract:${socket}`)

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = targets.find((t) => t.type === "page")
if (!page) throw new Error(`no page in ${socket}: ${JSON.stringify(targets)}`)

// The socket's address is built here, on the forwarded local port: only the
// page's id comes from the listing, never a host to connect to.
if (typeof page.id !== "string" || !/^[A-Za-z0-9-]+$/.test(page.id)) {
  throw new Error(
    `the page's DevTools id is not one: ${JSON.stringify(page.id)}`
  )
}
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/devtools/page/${page.id}`)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
const answer = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("no answer in 30 s")), 30_000)
  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data))
    if (message.id !== 1) return
    clearTimeout(timer)
    resolve(message)
  }
  ws.send(
    JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression, awaitPromise: true, returnByValue: true },
    })
  )
})
ws.close()
const { result, exceptionDetails } = answer.result ?? {}
if (exceptionDetails) {
  throw new Error(`the page threw: ${JSON.stringify(exceptionDetails)}`)
}
process.stdout.write(`${JSON.stringify(result?.value ?? null)}\n`)
