// What every composition here animates with, copied into each render as
// lib/motion.js (src/render.ts). Web Animations only, no GSAP (ask #2723).
//
// `track(el, keys)` gives an element one animation over the whole scene, so
// two animations never fight over a property: `keys` are [seconds, style,
// the ease from this key to the next], and the element holds its first style
// before the first key and its last after the last. Paused, so HyperFrames
// seeks it.
window.motion = (() => {
  const root = document.querySelector("[data-composition-id]")
  const length = Number(root.getAttribute("data-duration"))
  const EASE = {
    out: "cubic-bezier(0.16, 1, 0.3, 1)",
    in: "cubic-bezier(0.32, 0, 0.67, 0)",
    inOut: "cubic-bezier(0.37, 0, 0.63, 1)",
    back: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    linear: "linear",
  }
  const track = (el, keys) => {
    const at = (s) => Math.min(1, Math.max(0, s / length))
    const frames = keys.map(([s, style, ease]) => ({
      ...style,
      offset: at(s),
      easing: EASE[ease ?? "out"],
    }))
    const first = frames[0]
    const last = frames[frames.length - 1]
    if (first.offset > 0) frames.unshift({ ...first, offset: 0 })
    if (last.offset < 1) frames.push({ ...last, offset: 1, easing: "linear" })
    el.animate(frames, { duration: length * 1000, fill: "both" }).pause()
  }
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
