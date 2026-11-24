// B: bake the same rig into a sprite sheet of fixed cells (256 px each).
const { chromium } = require("playwright")
const fs = require("fs")
const { execFileSync } = require("child_process")
const out = process.argv[2]
;(async () => {
  const svg = fs.readFileSync("rig.svg", "utf8")
  const rig = fs.readFileSync("rig.js", "utf8")
  const b = await chromium.launch()
  const page = await b.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 })
  await page.setContent(`<html><head><style>@font-face{font-family:Display;src:url(data:font/woff2;base64,${fs.readFileSync("/home/user/some-ui/node_modules/.pnpm/node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2").toString("base64")}) format("woff2");font-weight:800}</style></head><body style="margin:0;background:transparent">${svg.replace("<svg ", '<svg width="256" height="256" ')}</body></html>`)
  await page.addScriptTag({ content: rig })
  await page.evaluate(() => document.fonts.ready)
  const VARIANTS = ["idle", "present", "facepalm", "think", "look-W", "look-NW", "look-NE", "look-E", "point-W", "point-NW", "point-NE", "point-E"]
  const AIMS = { W: 180, NW: -135, NE: -45, E: 0 }
  fs.rmSync("cells", { recursive: true, force: true }); fs.mkdirSync("cells")
  let n = 0
  const t0 = Date.now()
  for (const v of VARIANTS) for (const e of ["neutral", "pleased", "upset", "desperate", "thinking", "surprised"]) for (let f = 0; f < 20; f++) {
    await page.evaluate(([v, e, f, AIMS]) => {
      const R = window.hostRig
      const [pose, dir] = v.split("-")
      const aim = dir ? AIMS[dir] : 0
      const s = R.cellState(pose === "look" ? "point" : pose, e, f < 16 ? f : f % 4, f < 16 ? null : f - 16, aim)
      if (pose === "look") { s.wr = 80; s.wl = 100 }
      R.apply(R.parts(document.querySelector("svg")), s)
    }, [v, e, f, AIMS])
    await page.screenshot({ path: `cells/${String(n++).padStart(4, "0")}.png`, omitBackground: true })
  }
  await b.close()
  console.log(`${n} cells in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", "1", "-i", "cells/%04d.png", "-filter_complex", "tile=40x36:color=0x00000000", "-frames:v", "1", "-pix_fmt", "rgba", out])
})()
