// ─── Waveform Canvas Renderer ─────────────────────────────────────────────────
// Pure rendering module. Owns its own animation loop.
// Caller: mount once, call destroy() on teardown.

// ─── Waveform Canvas Renderer ────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

function at<T>(arr: ReadonlyArray<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) {
    throw new Error(`Index ${i} out of bounds`)
  }
  return v
}

function getCtx(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2D context unavailable")
  return ctx
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()

  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, [r, r, 0, 0])
  } else {
    ctx.rect(x, y, w, h)
  }
}

// ─── Color ───────────────────────────────────────────────────────────────────

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  }
}

const PALETTE: readonly [RGB, ...Array<RGB>] = [
  { r: 139, g: 92, b: 246 },
  { r: 99, g: 102, b: 241 },
  { r: 34, g: 211, b: 238 },
  { r: 251, g: 146, b: 60 },
  { r: 251, g: 113, b: 133 },
]

function emotionColor(valence: number): RGB {
  const v = clamp01(valence)
  const max = PALETTE.length - 1

  const idx = v * max
  const lo = Math.floor(idx)
  const hi = Math.min(lo + 1, max)

  const c0 = at(PALETTE, lo)
  const c1 = at(PALETTE, hi)

  return lerpColor(c0, c1, idx - lo)
}

function rgb(c: RGB, alpha = 1): string {
  return `rgba(${c.r},${c.g},${c.b},${alpha})`
}

// ─── Spectrum ────────────────────────────────────────────────────────────────

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

  const out: Array<number> = new Array(BAR_COUNT)

  for (let i = 0; i < BAR_COUNT; i++) {
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

    out[i] = Math.max(0.08, Math.min(1, h))
  }

  return out
}

// ─── Public API ──────────────────────────────────────────────────────────────

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
  const ctx = getCtx(canvas)

  let logicalW = canvas.clientWidth || 216
  let logicalH = canvas.clientHeight || 72

  let currentParams: WaveformParams = { ...params }
  let isTransitioning = false
  let transitionProgress = 0
  let rafId: number | null = null

  function resize(): void {
    logicalW = canvas.clientWidth || 216
    logicalH = canvas.clientHeight || 72

    canvas.width = logicalW * dpr
    canvas.height = logicalH * dpr

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  resize()

  const state: VisualizerState = {
    time: 0,
    bars: new Array(BAR_COUNT).fill(0),
    targetBars: new Array(BAR_COUNT).fill(0),
    particles: [],
    lastBeatTime: 0,
    beatAccent: 0,
  }

  function spawnParticles(intensity: number): void {
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

  function frame(): void {
    const dt = 1 / 60
    state.time += dt

    const { tempo, intensity, valence, arousal } = currentParams
    const color = emotionColor(valence)

    // Beat
    const beatInterval = 60 / (60 + tempo * 120)
    if (state.time - state.lastBeatTime >= beatInterval) {
      state.lastBeatTime = state.time
      state.beatAccent = 1
      spawnParticles(intensity)
    }
    state.beatAccent *= 0.85

    // Transition
    if (isTransitioning) {
      transitionProgress = Math.min(transitionProgress + dt * 3, 1)
    } else {
      transitionProgress = Math.max(transitionProgress - dt * 2, 0)
    }

    // Bars
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
      const b = at(state.bars, i)
      const t = at(state.targetBars, i)
      state.bars[i] = b + (t - b) * smoothing
    }

    // ── Draw ────────────────────────────────────────────────────────────────

    const W = logicalW
    const H = logicalH

    ctx.fillStyle = "rgba(0,0,0,0.25)"
    ctx.fillRect(0, 0, W, H)

    const glow = 0.1 + state.beatAccent * 0.15
    const bg = ctx.createRadialGradient(W / 2, H, 0, W / 2, H, H * 1.5)
    bg.addColorStop(0, rgb(color, glow))
    bg.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    const barW = (W - 8) / BAR_COUNT
    const maxH = H * 0.85

    for (let i = 0; i < BAR_COUNT; i++) {
      const b = at(state.bars, i)

      const bh = b * maxH
      const x = 4 + i * barW
      const y = H - bh - 2
      const radius = Math.min(barW - 1, bh) / 2

      const grad = ctx.createLinearGradient(x, H, x, y)
      grad.addColorStop(0, rgb(color, 0.9))
      grad.addColorStop(1, rgb(color, 0.6))

      ctx.fillStyle = grad
      drawRoundRect(ctx, x, y, barW - 1, bh, radius)
      ctx.fill()

      if (b > 0.5) {
        ctx.shadowColor = rgb(color)
        ctx.shadowBlur = 8 + b * 12
        ctx.fillStyle = rgb(color, 0.3)

        drawRoundRect(ctx, x, y, barW - 1, bh, radius)
        ctx.fill()

        ctx.shadowBlur = 0
      }
    }

    rafId = requestAnimationFrame(frame)
  }

  rafId = requestAnimationFrame(frame)

  return {
    updateParams(p: WaveformParams): void {
      isTransitioning = true
      setTimeout(() => {
        isTransitioning = false
      }, 800)

      currentParams = { ...p }
      state.time = 0
      state.beatAccent = 1
      state.particles = []
    },

    setTransitioning(v: boolean): void {
      isTransitioning = v
    },

    destroy(): void {
      if (rafId !== null) cancelAnimationFrame(rafId)
    },
  }
}
