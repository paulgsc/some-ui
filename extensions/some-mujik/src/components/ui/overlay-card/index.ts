// ─── Overlay Card UI ──────────────────────────────────────────────────────────
// Pure DOM construction module. No imports.
// Returns { root, update(song), destroy() }

// ── Inlined color helpers (no shared import) ──────────────────────────────────

// ─── Overlay Card UI ─────────────────────────────────────────────────────────

type RGB = { r: number; g: number; b: number }

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Color ────────────────────────────────────────────────────────────────────

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

  const t = idx - lo

  return {
    r: Math.round(c0.r + (c1.r - c0.r) * t),
    g: Math.round(c0.g + (c1.g - c0.g) * t),
    b: Math.round(c0.b + (c1.b - c0.b) * t),
  }
}

function rgbStr({ r, g, b }: RGB, a = 1): string {
  return `rgba(${r},${g},${b},${a})`
}

// ── Domain helpers ───────────────────────────────────────────────────────────

function emotionLabel(valence: number, arousal: number): string {
  if (valence < 0.3 && arousal < 0.4) return "melancholic"
  if (valence < 0.4 && arousal >= 0.4) return "tense"
  if (valence < 0.6 && arousal < 0.4) return "dreamy"
  if (valence >= 0.6 && arousal < 0.5) return "nostalgic"
  if (valence >= 0.6 && arousal < 0.7) return "uplifting"
  if (valence >= 0.7 && arousal >= 0.7) return "euphoric"
  return "atmospheric"
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// ── Types ────────────────────────────────────────────────────────────────────

export type OverlaySong = {
  title: string
  artist: string
  videoId: string
  thumbnailUrl: string
  currentTime: number
  duration: number
  valence: number
  arousal: number
  tempo: number
  intensity: number
}

export type OverlayCard = {
  root: HTMLElement
  canvas: HTMLCanvasElement
  update(song: OverlaySong): void
  destroy(): void
}

// ── Builder ──────────────────────────────────────────────────────────────────

export function createOverlayCard(): OverlayCard {
  // Root
  const root: HTMLDivElement = document.createElement("div")
  root.className = "ytmo-card"

  const glowBorder: HTMLDivElement = document.createElement("div")
  glowBorder.className = "ytmo-glow-border"
  root.appendChild(glowBorder)

  const canvas: HTMLCanvasElement = document.createElement("canvas")
  canvas.className = "ytmo-canvas"
  root.appendChild(canvas)

  const emotionTag: HTMLSpanElement = document.createElement("span")
  emotionTag.className = "ytmo-emotion-tag"
  root.appendChild(emotionTag)

  const meta: HTMLDivElement = document.createElement("div")
  meta.className = "ytmo-meta"

  const nowPlayingRow: HTMLDivElement = document.createElement("div")
  nowPlayingRow.className = "ytmo-now-playing-row"

  const musicDot: HTMLSpanElement = document.createElement("span")
  musicDot.className = "ytmo-music-dot"

  const nowPlayingLabel: HTMLSpanElement = document.createElement("span")
  nowPlayingLabel.className = "ytmo-now-playing-label"
  nowPlayingLabel.textContent = "Now Playing"

  nowPlayingRow.append(musicDot, nowPlayingLabel)

  const titleEl: HTMLHeadingElement = document.createElement("h3")
  titleEl.className = "ytmo-title"

  const artistEl: HTMLParagraphElement = document.createElement("p")
  artistEl.className = "ytmo-artist"

  const progressWrap: HTMLDivElement = document.createElement("div")
  progressWrap.className = "ytmo-progress-wrap"

  const progressBar: HTMLDivElement = document.createElement("div")
  progressBar.className = "ytmo-progress-bar"

  const progressFill: HTMLDivElement = document.createElement("div")
  progressFill.className = "ytmo-progress-fill"
  progressBar.appendChild(progressFill)

  const progressTimes: HTMLDivElement = document.createElement("div")
  progressTimes.className = "ytmo-progress-times"

  const currentTimeEl: HTMLSpanElement = document.createElement("span")
  const durationEl: HTMLSpanElement = document.createElement("span")

  progressTimes.append(currentTimeEl, durationEl)
  progressWrap.append(progressBar, progressTimes)

  meta.append(nowPlayingRow, titleEl, artistEl, progressWrap)
  root.appendChild(meta)

  // ── Meta cycle ────────────────────────────────────────────────────────────

  let metaVisible = true
  let metaCycleTimer: number | null = null

  function startMetaCycle(): void {
    if (metaCycleTimer !== null) {
      clearInterval(metaCycleTimer)
    }

    metaVisible = true
    meta.classList.remove("ytmo-meta--hidden")
    emotionTag.classList.remove("ytmo-emotion-tag--hidden")

    metaCycleTimer = window.setInterval((): void => {
      metaVisible = !metaVisible

      meta.classList.toggle("ytmo-meta--hidden", !metaVisible)
      emotionTag.classList.toggle("ytmo-emotion-tag--hidden", !metaVisible)
    }, 8000)
  }

  // ── Progress animation ─────────────────────────────────────────────────────

  let progressAnimId: number | null = null
  let songStartWallTime = 0
  let songBaseTime = 0

  function animateProgress(song: OverlaySong): void {
    if (progressAnimId !== null) {
      cancelAnimationFrame(progressAnimId)
    }

    const totalDuration = song.duration > 0 ? song.duration : 1

    songBaseTime = song.currentTime
    songStartWallTime = Date.now()

    const tick = (): void => {
      const elapsed = (Date.now() - songStartWallTime) / 1000
      const t = Math.min(1, (songBaseTime + elapsed) / totalDuration)

      progressFill.style.width = `${t * 100}%`
      currentTimeEl.textContent = formatTime(songBaseTime + elapsed)
      durationEl.textContent = formatTime(totalDuration)

      progressAnimId = requestAnimationFrame(tick)
    }

    progressAnimId = requestAnimationFrame(tick)
  }

  // ── Color application ──────────────────────────────────────────────────────

  function applyColor(song: OverlaySong): void {
    const c = emotionColor(song.valence)
    const base = rgbStr(c)

    root.style.boxShadow = `0 0 40px ${rgbStr(c, 0.12)}, 0 0 80px ${rgbStr(
      c,
      0.06
    )}`

    glowBorder.style.background = `linear-gradient(135deg, ${rgbStr(
      c,
      0.3
    )} 0%, transparent 50%, ${rgbStr(c, 0.2)} 100%)`

    emotionTag.style.background = rgbStr(c, 0.4)
    musicDot.style.background = base
    nowPlayingLabel.style.color = base

    progressFill.style.background = `linear-gradient(90deg, ${base}, ${rgbStr(
      c,
      0.7
    )})`
  }

  // ── Public update ──────────────────────────────────────────────────────────

  function update(song: OverlaySong): void {
    titleEl.textContent = song.title
    artistEl.textContent = song.artist
    emotionTag.textContent = emotionLabel(song.valence, song.arousal)

    root.classList.add("ytmo-card--transitioning")
    setTimeout((): void => {
      root.classList.remove("ytmo-card--transitioning")
    }, 600)

    applyColor(song)
    animateProgress(song)
    startMetaCycle()
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  function destroy(): void {
    if (progressAnimId !== null) {
      cancelAnimationFrame(progressAnimId)
    }

    if (metaCycleTimer !== null) {
      clearInterval(metaCycleTimer)
    }

    root.remove()
  }

  return { root, canvas, update, destroy }
}
