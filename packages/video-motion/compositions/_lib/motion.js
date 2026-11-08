// What every composition here animates with, copied into each render as
// lib/motion.js (src/render.ts). No GSAP (ask #2723), and no CSS or Web
// Animations either: each frame's styles are a pure function of its time,
// set on the page when HyperFrames seeks to it (its `hf-seek` event), so
// nothing runs on an animation timeline of the browser's own. A WAAPI
// version gave two sums on one CI machine (#2737's run of `motion prove`).
//
// `track(el, keys)` gives an element one track over the whole scene: `keys`
// are [seconds, values, the ease from this key to the next], the values
// numbers (opacity; x and y in px; yPct, a share of its own height; scale,
// scaleX; rotate in degrees). Before the first key the element holds its
// first values, after the last its last.
window.motion = (() => {
  const root = document.querySelector("[data-composition-id]")
  const length = Number(root.getAttribute("data-duration"))

  // A cubic Bézier easing, solved by bisection: plain arithmetic, the same
  // on every machine.
  const bezier = (x1, y1, x2, y2) => (p) => {
    const at = (a, b, s) =>
      3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3
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
        const e = t1 > t0 ? EASE[ease ?? "out"]((t - t0) / (t1 - t0)) : 1
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
  window.addEventListener("hf-seek", (event) => {
    for (const [el, keys] of tracks) draw(el, valuesAt(keys, event.detail.time))
  })

  // "|" splits a string into lines, each its own element to move.
  const lines = (el, text) => {
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
  const vars = window.__hyperframes.getVariables()
  const style = document.documentElement.style
  for (const key of ["ground", "ink", "mute", "accent", "accentInk"]) {
    if (vars[key]) style.setProperty(`--${key}`, vars[key])
  }
  return { length, track, lines, vars }
})()
