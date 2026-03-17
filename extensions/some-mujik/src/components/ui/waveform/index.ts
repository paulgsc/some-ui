// ─── Waveform Canvas Renderer ─────────────────────────────────────────────────
// Pure rendering module. Owns its own animation loop.
// Caller: mount once, call destroy() on teardown.

type RGB = { r: number; g: number; b: number }

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
}

type VisualizerState = {
  time: number
  bars: Array<number>
  targetBars: Array<number>
  particles: Array<Particle>
  lastBeatTime: number
  beatAccent: number
}

const BAR_COUNT = 32
const MAX_PARTICLES = 40

// ─── Color helpers (inlined — no shared import) ───────────────────────────────

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  }
}

const PALETTE: Array<RGB> = [
  { r: 139, g: 92, b: 246 },
  { r: 99, g: 102, b: 241 },
  { r: 34, g: 211, b: 238 },
  { r: 251, g: 146, b: 60 },
  { r: 251, g: 113, b: 133 },
]

function emotionColor(valence: number): RGB {
  const idx = valence * (PALETTE.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.min(lo + 1, PALETTE.length - 1)
  return lerpColor(PALETTE[lo], PALETTE[hi], idx - lo)
}

function rgb(c: RGB, alpha = 1) {
  return `rgba(${c.r},${c.g},${c.b},${alpha})`
}

// ─── Spectrum generation ──────────────────────────────────────────────────────

function generateSpectrum(
  tempo: number,
  intensity: number,
  valence: number,
  arousal: number,
  time: number,
  beatAccent: number
): Array<number> {
  const bpm = 60 + tempo * 120
  const beatFreq = bpm / 60
  const beatPhase = time * beatFreq * Math.PI * 2
  const onBeat = Math.pow(Math.max(0, Math.sin(beatPhase)), 4)
  const offBeat = Math.pow(Math.max(0, Math.sin(beatPhase + Math.PI)), 4)

  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const n = i / BAR_COUNT
    let h = 0.3 + 0.4 * Math.pow(1 - n, 0.5)
    h *= 0.3 + intensity * 0.7

    if (arousal > 0.6) {
      h += Math.sin(i * 0.8 + time * 3) * 0.2 * arousal
      h += onBeat * 0.4 * (i < 8 ? 1.5 : 0.5)
    } else if (arousal < 0.4) {
      h += Math.sin(i * 0.3 + time * 0.8) * 0.15
      h *= 0.7 + Math.sin(time * 0.5) * 0.2
    }

    if (valence > 0.6) {
      h += Math.abs(Math.sin(i * 0.5 + time * 2)) * 0.15
      h += offBeat * 0.2 * (1 - n)
    } else if (valence < 0.4) {
      h += Math.sin(i * 1.2 + time * 0.6) * 0.1
      h *= 0.6 + 0.3 * Math.sin(i * 0.7)
    }

    const noise = Math.sin(i * 12.9898 + time * 43.758) * 0.5 + 0.5
    h += noise * 0.15 * arousal

    if (i < 10) h += beatAccent * 0.4 * (1 - n / 10)

    return Math.max(0.08, Math.min(1, h))
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type WaveformParams = {
  tempo: number
  intensity: number
  valence: number
  arousal: number
}

export type WaveformRenderer = {
  updateParams(p: WaveformParams): void
  setTransitioning(v: boolean): void
  destroy(): void
}

export function createWaveformRenderer(
  canvas: HTMLCanvasElement,
  params: WaveformParams
): WaveformRenderer {
  const dpr = window.devicePixelRatio || 1
  let logicalW = canvas.clientWidth || 216
  let logicalH = canvas.clientHeight || 72
  let currentParams = { ...params }
  let isTransitioning = false
  let transitionProgress = 0
  let rafId: number | null = null

  // Size canvas for DPR
  function resize() {
    logicalW = canvas.clientWidth || 216
    logicalH = canvas.clientHeight || 72
    canvas.width = logicalW * dpr
    canvas.height = logicalH * dpr
    const ctx = canvas.getContext("2d")!
    ctx.scale(dpr, dpr)
  }
  resize()

  const state: VisualizerState = {
    time: 0,
    bars: Array(BAR_COUNT).fill(0),
    targetBars: Array(BAR_COUNT).fill(0),
    particles: [],
    lastBeatTime: 0,
    beatAccent: 0,
  }

  function spawnParticles(_color: RGB, intensity: number) {
    const count = Math.floor(2 + intensity * 4)
    for (let i = 0; i < count && state.particles.length < MAX_PARTICLES; i++) {
      state.particles.push({
        x: Math.random() * logicalW,
        y: logicalH,
        vx: (Math.random() - 0.5) * 2,
        vy: -1 - Math.random() * 3 * intensity,
        life: 1,
        maxLife: 0.8 + Math.random() * 0.8,
        size: 1 + Math.random() * 2,
      })
    }
  }

  function frame() {
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dt = 1 / 60
    state.time += dt

    const { tempo, intensity, valence, arousal } = currentParams
    const color = emotionColor(valence)

    // Beat
    const beatInterval = 60 / (60 + tempo * 120)
    if (state.time - state.lastBeatTime >= beatInterval) {
      state.lastBeatTime = state.time
      state.beatAccent = 1
      spawnParticles(color, intensity)
    }
    state.beatAccent *= 0.85

    // Transition flash
    if (isTransitioning)
      transitionProgress = Math.min(transitionProgress + dt * 3, 1)
    else transitionProgress = Math.max(transitionProgress - dt * 2, 0)

    // Smooth bars
    state.targetBars = generateSpectrum(
      tempo,
      intensity,
      valence,
      arousal,
      state.time,
      state.beatAccent
    )
    const smoothing = 0.15 + arousal * 0.2
    for (let i = 0; i < BAR_COUNT; i++) {
      state.bars[i] += (state.targetBars[i] - state.bars[i]) * smoothing
    }

    // ── Draw ──────────────────────────────────────────────────────────────────
    const W = logicalW
    const H = logicalH

    // Trail
    ctx.fillStyle = "rgba(0,0,0,0.25)"
    ctx.fillRect(0, 0, W, H)

    // BG glow
    const glow = 0.1 + state.beatAccent * 0.15
    const bg = ctx.createRadialGradient(W / 2, H, 0, W / 2, H, H * 1.5)
    bg.addColorStop(0, rgb(color, glow))
    bg.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // Bars
    const barW = (W - 8) / BAR_COUNT
    const maxH = H * 0.85

    for (let i = 0; i < BAR_COUNT; i++) {
      const bh = state.bars[i] * maxH
      const x = 4 + i * barW
      const y = H - bh - 2
      const radius = Math.min(barW - 1, bh) / 2

      const grad = ctx.createLinearGradient(x, H, x, y)
      grad.addColorStop(0, rgb(color, 0.9))
      grad.addColorStop(
        0.5,
        rgb(
          {
            r: Math.min(255, color.r + 30),
            g: Math.min(255, color.g + 20),
            b: Math.min(255, color.b + 20),
          },
          0.8
        )
      )
      grad.addColorStop(1, rgb(color, 0.6))

      ctx.fillStyle = grad
      ctx.beginPath()
      ;(ctx as any).roundRect?.(x, y, barW - 1, bh, [radius, radius, 0, 0]) ??
        ctx.rect(x, y, barW - 1, bh)
      ctx.fill()

      // Glow on tall bars
      if (state.bars[i] > 0.5) {
        ctx.shadowColor = rgb(color)
        ctx.shadowBlur = 8 + state.bars[i] * 12
        ctx.fillStyle = rgb(color, 0.3)
        ctx.beginPath()
        ;(ctx as any).roundRect?.(x, y, barW - 1, bh, [radius, radius, 0, 0]) ??
          ctx.rect(x, y, barW - 1, bh)
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    // Peak dots
    ctx.shadowColor = rgb(color)
    ctx.shadowBlur = 6
    for (let i = 0; i < BAR_COUNT; i++) {
      if (state.bars[i] > 0.4) {
        const bh = state.bars[i] * maxH
        const x = 4 + i * barW + (barW - 1) / 2
        const y = H - bh - 4
        ctx.fillStyle = `rgba(255,255,255,${0.4 + state.bars[i] * 0.5})`
        ctx.beginPath()
        ctx.arc(x, y, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.shadowBlur = 0

    // Particles
    state.particles = state.particles.filter((p) => {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.02
      p.life -= dt / p.maxLife
      if (p.life <= 0) return false
      ctx.fillStyle = rgb(color, p.life * 0.6)
      ctx.shadowColor = rgb(color)
      ctx.shadowBlur = 4
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
      ctx.fill()
      return true
    })
    ctx.shadowBlur = 0

    // Ambient stars
    const starCount = 8 + Math.floor(valence * 8)
    for (let i = 0; i < starCount; i++) {
      const sx =
        (Math.sin(i * 7.13 + state.time * 0.1 * (1 + i * 0.1)) * 0.5 + 0.5) * W
      const sy = (Math.cos(i * 11.47 + state.time * 0.08) * 0.5 + 0.5) * H * 0.7
      const sz = 0.5 + Math.sin(i + state.time * 2) * 0.3
      const sa = 0.2 + Math.sin(i * 3 + state.time) * 0.15
      ctx.fillStyle = `rgba(255,255,255,${sa})`
      ctx.beginPath()
      ctx.arc(sx, sy, sz, 0, Math.PI * 2)
      ctx.fill()
    }

    // Beat flash
    if (state.beatAccent > 0.3 && arousal > 0.5) {
      ctx.fillStyle = rgb(color, state.beatAccent * 0.1)
      ctx.fillRect(0, 0, W, H)
    }

    // Transition white flash
    if (transitionProgress > 0) {
      ctx.fillStyle = `rgba(255,255,255,${transitionProgress * 0.3})`
      ctx.fillRect(0, 0, W, H)
    }

    rafId = requestAnimationFrame(frame)
  }

  rafId = requestAnimationFrame(frame)

  return {
    updateParams(p) {
      isTransitioning = true
      setTimeout(() => {
        isTransitioning = false
      }, 800)
      currentParams = { ...p }
      state.time = 0
      state.beatAccent = 1
      state.particles = []
    },
    setTransitioning(v) {
      isTransitioning = v
    },
    destroy() {
      if (rafId !== null) cancelAnimationFrame(rafId)
    },
  }
}
