// What every composition here animates with, copied into each render as
// lib/motion.js (src/render.ts). It draws each frame from the time HyperFrames
// seeks to: the README's "Writing a composition" says why.
//
// `track(el, keys)` gives an element one track over the whole scene: `keys`
// are [seconds, values, the ease from this key to the next], the values
// numbers (opacity; x and y in px; yPct, a share of its own height; scale,
// scaleX; rotate in degrees), and a value a key leaves out is its rest value
// (`REST`), not the key before's. Before the first key the element holds its
// first values, after the last its last.
window.motion = (() => {
  const root = document.querySelector("[data-composition-id]")
  const length = Number(root.getAttribute("data-duration"))

  // A cubic Bézier easing, solved by bisection in plain arithmetic, exact at
  // its ends as CSS's is.
  const bezier = (x1, y1, x2, y2) => (p) => {
    if (p <= 0 || p >= 1) return p
    const at = (a, b, s) =>
      3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s
    let lo = 0
    let hi = 1
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (at(x1, x2, mid) < p) lo = mid
      else hi = mid
    }
    return at(y1, y2, (lo + hi) / 2)
  }
  const EASE = {
    out: bezier(0.16, 1, 0.3, 1),
    in: bezier(0.32, 0, 0.67, 0),
    inOut: bezier(0.37, 0, 0.63, 1),
    back: bezier(0.34, 1.56, 0.64, 1),
    linear: (p) => p,
  }
  const REST = {
    opacity: 1,
    x: 0,
    y: 0,
    yPct: 0,
    scale: 1,
    scaleX: 1,
    rotate: 0,
  }

  const draw = (el, v) => {
    el.style.opacity = String(v.opacity)
    el.style.transform =
      `translate(${v.x}px, ${v.y}px) translateY(${v.yPct}%) ` +
      `scale(${v.scale}) scaleX(${v.scaleX}) rotate(${v.rotate}deg)`
  }
  const valuesAt = (keys, t) => {
    const full = (k) => ({ ...REST, ...k[1] })
    if (t <= keys[0][0]) return full(keys[0])
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, , ease] = keys[i]
      const t1 = keys[i + 1][0]
      if (t < t1) {
        const a = full(keys[i])
        const b = full(keys[i + 1])
        const e = EASE[ease ?? "out"]((t - t0) / (t1 - t0))
        const v = {}
        for (const name of Object.keys(REST))
          v[name] = a[name] + (b[name] - a[name]) * e
        return v
      }
    }
    return full(keys[keys.length - 1])
  }

  const tracks = []
  const track = (el, keys) => {
    tracks.push([el, keys])
    draw(el, valuesAt(keys, 0))
  }

  // Words fitted to their box, never grown: a block of `lines` takes a
  // smaller size until its widest line fits its content width, and a `row`
  // scales down about its centre until its items and their gaps do. Fitted
  // at every seek, since HyperFrames seeks only once document.fonts is ready,
  // so the measure is of the font that draws.
  const blocks = []
  const rows = []
  const inner = (el) => {
    const style = getComputedStyle(el)
    return (
      el.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight)
    )
  }
  const fit = () => {
    for (const [el, base] of blocks) {
      el.style.fontSize = `${base}px`
      const widest = Math.max(
        ...Array.from(el.querySelectorAll(".line"), (line) => line.offsetWidth)
      )
      const room = inner(el)
      if (widest > room)
        el.style.fontSize = `${Math.floor((base * room) / widest)}px`
    }
    for (const el of rows) {
      const items = Array.from(el.children)
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0
      const needed =
        items.reduce((sum, item) => sum + item.offsetWidth, 0) +
        gap * (items.length - 1)
      const room = inner(el)
      el.style.transform = needed > room ? `scale(${room / needed})` : ""
    }
  }
  const row = (el) => rows.push(el)
  window.addEventListener("hf-seek", (event) => {
    fit()
    for (const [el, keys] of tracks) draw(el, valuesAt(keys, event.detail.time))
  })

  // "|" splits a string into lines, each its own element to move, fitted as
  // one block.
  const lines = (el, text) => {
    blocks.push([el, parseFloat(getComputedStyle(el).fontSize)])
    el.textContent = ""
    return text.split("|").map((line) => {
      const mask = document.createElement("span")
      mask.className = "mask"
      const span = document.createElement("span")
      span.className = "line"
      span.textContent = line
      mask.appendChild(span)
      el.appendChild(mask)
      return span
    })
  }
  const $ = (id) => document.getElementById(id)
  /** A new `tag` of `className`, appended to `parent`. */
  const make = (tag, className, parent) => {
    const el = document.createElement(tag)
    el.className = className
    parent.appendChild(el)
    return el
  }
  const vars = window.__hyperframes.getVariables()
  const style = document.documentElement.style
  for (const key of ["ground", "ink", "accent", "accentInk"]) {
    if (vars[key]) style.setProperty(`--${key}`, vars[key])
  }
  return { length, track, lines, row, vars, $, make }
})()
