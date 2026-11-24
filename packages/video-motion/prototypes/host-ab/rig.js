// The host's rig (HOST-AB prototype). Everything on screen is a pure
// function of (time, beats, seed): no Math.random, no clock, no CSS
// animation. HyperFrames seeks; we draw that instant.
window.hostRig = (() => {
  // Seeded PRNG: the same seed gives the same blinks and glances, forever.
  const mulberry = (seed) => {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  const TAU = Math.PI * 2
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const smooth = (p) => {
    p = clamp(p, 0, 1)
    return p * p * (3 - 2 * p)
  }

  // ---- The closed sets (the proposed schema's members) ----
  const EXPRESSIONS = ["neutral", "pleased", "upset", "desperate", "thinking", "surprised"]
  const POSES = ["idle", "look", "point", "present", "facepalm", "think"]

  // Each expression is a fixed vector. lidTilt > 0 = inner corners up (worried).
  const BASE = { lid: 0.16, lidTilt: 0, low: 0, pupil: 1, led: 1, tuft: 0, beak: 0, sweat: 0, steam: 0, spark: 0, q: 0, bang: 0, tremble: 0, flicker: 0, gx: 0, gy: 0 }
  const EXPR = {
    neutral: {},
    pleased: { lid: 0.08, low: 0.62, pupil: 1.12, led: 1.3, tuft: -10, beak: 0.12, spark: 1 },
    upset: { lid: 0.46, lidTilt: -18, low: 0.18, pupil: 0.82, led: 0.95, tuft: -16, steam: 1 },
    desperate: { lid: 0.3, lidTilt: 24, low: 0.08, pupil: 0.7, led: 0.7, tuft: 34, beak: 0.3, sweat: 1, tremble: 1, flicker: 1 },
    thinking: { lid: 0.34, lidTilt: 6, low: 0.22, pupil: 0.92, q: 1, gx: -0.55, gy: -0.8 },
    surprised: { lid: 0, low: 0, pupil: 0.58, led: 1.45, tuft: -22, beak: 0.75, bang: 1 },
  }
  // Wing angles (deg, SVG: 0 = right, 90 = down). Rest hangs at the sides.
  const REST = { wr: 80, wl: 100 }
  const POSE = {
    idle: { ...REST },
    look: { ...REST },
    point: { ...REST }, // the near wing is aimed at run time
    present: { wr: -18, wl: 198 },
    facepalm: { wr: -106, wl: -74 },
    think: { wr: 197, wl: 100 },
  }
  const KEYS = [...Object.keys(BASE), "wr", "wl", "speak"]

  // Geometry of the drawing (viewBox units) the aim is measured from.
  const EYES = { x: 48, y: 41 }
  const PIVOT = { r: { x: 69, y: 60 }, l: { x: 27, y: 60 } }

  // ---- Seeded schedules: blinks and idle glances ----
  const schedule = (seed, every, spread, until) => {
    const r = mulberry(seed)
    const out = []
    for (let t = 0.6 + r() * every; t < until; t += every + r() * spread) {
      out.push({ t, a: r(), b: r(), c: r() })
    }
    return out
  }
  const prepare = (beats, seed, until = 600) => ({
    beats: [...beats].sort((a, b) => a.at - b.at),
    blinks: schedule(seed, 2.3, 3.2, until),
    glances: schedule(seed ^ 0x9e3779b9, 1.4, 2.2, until),
  })
  const blinkAt = (tl, t) => {
    let c = 0
    for (const b of tl.blinks) {
      if (b.t > t) break
      for (const at of b.a < 0.22 ? [b.t, b.t + 0.3] : [b.t]) {
        const p = (t - at) / 0.19
        if (p >= 0 && p <= 1) c = Math.max(c, 1 - Math.abs(2 * p - 1))
      }
    }
    return smooth(c)
  }
  const glanceAt = (tl, t) => {
    let g = { gx: 0, gy: 0 }
    for (const s of tl.glances) {
      if (s.t > t) break
      // a third of glances come back to the viewer
      g = s.c < 0.33 ? { gx: 0, gy: 0 } : { gx: (s.a - 0.5) * 0.7, gy: (s.b - 0.5) * 0.4 }
    }
    return g
  }

  // How long the host has been speaking by `t` (for the key's wind).
  const spokenBy = (tl, t) => {
    let s = 0
    tl.beats.forEach((b, i) => {
      const end = tl.beats[i + 1]?.at ?? Infinity
      if (b.speaking && t > b.at) s += Math.min(t, end) - b.at
    })
    return s
  }

  // ---- A beat's target state (no idle life yet) ----
  // `geo(t)` gives where the drawing sits in the frame: {x, y, scale} (px per unit, origin of viewBox 0,0).
  const aimFrom = (from, target, geo) => {
    const fx = geo.x + from.x * geo.scale
    const fy = geo.y + from.y * geo.scale
    return Math.atan2(target.y - fy, target.x - fx)
  }
  const beatState = (beat, geo) => {
    const s = { ...BASE, ...EXPR[beat.expression ?? "neutral"], ...POSE[beat.pose ?? "idle"], speak: beat.speaking ? 1 : 0 }
    const target = beat.at_ ?? beat.target
    if (target && (beat.pose === "look" || beat.pose === "point")) {
      const a = aimFrom(EYES, target, geo)
      s.gx = clamp(Math.cos(a) * 1.1, -1, 1)
      s.gy = clamp(Math.sin(a) * 1.1, -1, 1)
      if (beat.pose === "point") {
        const right = target.x >= geo.x + EYES.x * geo.scale
        const deg = (aimFrom(right ? PIVOT.r : PIVOT.l, target, geo) * 180) / Math.PI
        if (right) s.wr = deg
        else s.wl = deg < 0 ? deg + 360 : deg
      }
    }
    return s
  }
  const mix = (a, b, e) => {
    const o = {}
    for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * e
    return o
  }

  // ---- The state at time t ----
  const BLEND = 0.38 // seconds a beat takes to arrive
  const stateAt = (tl, t, geo) => {
    const bs = tl.beats
    let i = bs.findLastIndex((b) => b.at <= t)
    if (i < 0) i = 0
    const cur = beatState(bs[i], geo)
    const prev = i > 0 ? beatState(bs[i - 1], geo) : cur
    const e = smooth((t - bs[i].at) / BLEND)
    const s = mix(prev, cur, e)
    s.blink = blinkAt(tl, t)
    s.t = t
    s.wind = 130 * t + 420 * spokenBy(tl, t)
    // idle eyes wander only when nothing is being looked at
    const free = !["look", "point"].includes(bs[i].pose) && bs[i].expression !== "thinking"
    if (free) {
      const g = glanceAt(tl, t)
      s.gx += g.gx * e
      s.gy += g.gy * e
    }
    return s
  }

  // ---- A sprite cell's canonical state (for sheet B) ----
  // frame: 0..15 idle loop at 8 fps (2 s), blink on 12-13; talk: 0..3 beak positions.
  const cellState = (pose, expression, frame, talk, aimDeg) => {
    const s = { ...BASE, ...EXPR[expression], ...POSE[pose], speak: 0 }
    if (pose === "point") {
      const a = (aimDeg * Math.PI) / 180
      s.gx = Math.cos(a)
      s.gy = Math.sin(a)
      if (Math.cos(a) >= 0) s.wr = aimDeg
      else s.wl = aimDeg < 0 ? aimDeg + 360 : aimDeg
    }
    const t = frame / 8
    s.t = t
    s.blink = frame === 12 ? 0.7 : frame === 13 ? 1 : 0
    s.wind = frame * 45
    s.talkOpen = talk === null ? null : [0.1, 0.7, 0.35, 0.9][talk]
    return s
  }

  // ---- Draw a state onto the parts ----
  const parts = (svg) => {
    const p = {}
    svg.querySelectorAll("[data-part]").forEach((el) => (p[el.getAttribute("data-part")] = el))
    return p
  }
  const set = (el, tf) => el && el.setAttribute("transform", tf)
  const apply = (p, s) => {
    const t = s.t
    const breath = Math.sin((TAU * t) / 3.4)
    const sway = 1.3 * Math.sin((TAU * t) / 7.7 + 0.8)
    const spk = s.speak
    const shake = spk * 0.9 * Math.sin(TAU * 6.3 * t) + s.tremble * 0.7 * Math.sin(TAU * 13.1 * t)
    const jx = spk * 0.35 * Math.sin(TAU * 10.7 * t) + s.tremble * 0.45 * Math.sin(TAU * 17.3 * t)
    const lean = s.gx * 3
    const bob = -0.9 * (0.5 - 0.5 * Math.cos((TAU * t) / 3.4))
    set(p.bob, `translate(${jx} ${bob}) rotate(${sway + shake + lean} 48 84) translate(48 84) scale(${1 - 0.006 * breath} ${1 + 0.013 * breath}) translate(-48 -84)`)
    set(p.shadow, `translate(48 86) scale(${1 + bob * 0.02} 1) translate(-48 -86)`)
    // the face turns a little toward what it looks at
    set(p.face, `translate(${s.gx * 1.5} ${s.gy * 1.0})`)
    for (const side of ["l", "r"]) {
      const iris = p[`iris-${side}`]
      const cx = Number(iris.dataset.cx)
      set(iris, `translate(${s.gx * 2.1} ${s.gy * 2.1}) translate(${cx} 41) scale(${s.pupil}) translate(${-cx} -41)`)
      const flick = s.flicker * 0.45 * (Math.sin(TAU * 7.9 * t) * Math.sin(TAU * 3.1 * t) > 0.3 ? 1 : 0)
      iris.setAttribute("opacity", String(clamp(s.led * (1 - flick), 0.25, 1)))
      const close = s.lid + (1 - s.lid) * s.blink
      const tilt = side === "l" ? -s.lidTilt : s.lidTilt
      set(p[`lid-${side}`], `rotate(${tilt} ${cx} 41) translate(0 ${14.6 * close - 0.4})`)
      set(p[`low-${side}`], `translate(0 ${-7.4 * s.low * (1 - s.blink)})`)
    }
    set(p["tuft-l"], `rotate(${-s.tuft})`)
    set(p["tuft-r"], `rotate(${s.tuft})`)
    const syll = Math.pow(Math.abs(Math.sin(Math.PI * 3.9 * t)), 0.7) * (0.65 + 0.35 * Math.sin(TAU * 0.83 * t))
    const open = clamp(s.talkOpen ?? Math.max(s.beak, spk * syll), 0, 1)
    set(p.mouth, `translate(48 53) scale(1 ${0.05 + open}) translate(-48 -53)`)
    set(p["beak-low"], `translate(0 ${open * 2.8})`)
    set(p["wing-r"], `rotate(${s.wr + 3 * Math.sin((TAU * t) / 2.9)})`)
    set(p["wing-l"], `rotate(${s.wl - 3 * Math.sin((TAU * t) / 3.3)})`)
    const turn = (s.wind * Math.PI) / 180
    const c = Math.cos(turn)
    set(p["key-bow"], `scale(1 ${Math.sign(c || 1) * Math.max(0.1, Math.abs(c))})`)
    // effects
    const fx = (name, o, tf) => {
      const el = p[name]
      el.setAttribute("opacity", String(clamp(o, 0, 1)))
      set(el, tf)
    }
    const drip = (t * 0.8) % 1
    fx("fx-sweat", s.sweat * (drip < 0.85 ? 1 : (1 - drip) / 0.15), `translate(${76} ${26 + drip * 16})`)
    const puff = (t * 1.1) % 1
    fx("fx-steam", s.steam * Math.sin(Math.PI * puff), `translate(48 ${8 - puff * 8}) scale(${0.7 + puff * 0.6}) translate(-48 -8)`)
    fx("fx-spark", s.spark * Math.max(0, Math.sin(TAU * t * 0.9)), `translate(16 22) rotate(${t * 40})`)
    fx("fx-spark2", s.spark * Math.max(0, Math.sin(TAU * t * 0.9 + 2.2)), `translate(84 30) rotate(${-t * 50})`)
    fx("fx-q", s.q, `translate(84 ${16 + Math.sin(TAU * t * 0.7) * 1.5})`)
    fx("fx-bang", s.bang, `translate(84 ${16 - Math.abs(Math.sin(TAU * t * 1.2)) * 2})`)
  }

  return { EXPRESSIONS, POSES, prepare, stateAt, cellState, parts, apply, EYES, PIVOT, mulberry }
})()
