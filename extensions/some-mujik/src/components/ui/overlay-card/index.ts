// ─── Overlay Card UI ──────────────────────────────────────────────────────────
// Pure DOM construction module. No imports.
// Returns { root, update(song), destroy() }

// ── Inlined color helpers (no shared import) ──────────────────────────────────

type RGB = { r: number; g: number; b: number }

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
  const t = idx - lo
  return {
    r: Math.round(PALETTE[lo].r + (PALETTE[hi].r - PALETTE[lo].r) * t),
    g: Math.round(PALETTE[lo].g + (PALETTE[hi].g - PALETTE[lo].g) * t),
    b: Math.round(PALETTE[lo].b + (PALETTE[hi].b - PALETTE[lo].b) * t),
  }
}

function rgbStr({ r, g, b }: RGB, a = 1) {
  return `rgba(${r},${g},${b},${a})`
}

function emotionLabel(valence: number, arousal: number): string {
  if (valence < 0.3 && arousal < 0.4) return "melancholic"
  if (valence < 0.4 && arousal >= 0.4) return "tense"
  if (valence >= 0.3 && valence < 0.6 && arousal < 0.4) return "dreamy"
  if (valence >= 0.6 && arousal < 0.5) return "nostalgic"
  if (valence >= 0.6 && arousal >= 0.5 && arousal < 0.7) return "uplifting"
  if (valence >= 0.7 && arousal >= 0.7) return "euphoric"
  return "atmospheric"
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Builder ───────────────────────────────────────────────────────────────────

export function createOverlayCard(): OverlayCard {
  // ── Root wrapper ──────────────────────────────────────────────────────────
  const root = document.createElement("div")
  root.className = "ytmo-card"

  // ── Glow border overlay ───────────────────────────────────────────────────
  const glowBorder = document.createElement("div")
  glowBorder.className = "ytmo-glow-border"
  root.appendChild(glowBorder)

  // ── Canvas (waveform) ─────────────────────────────────────────────────────
  const canvas = document.createElement("canvas")
  canvas.className = "ytmo-canvas"
  root.appendChild(canvas)

  // ── Emotion tag ───────────────────────────────────────────────────────────
  const emotionTag = document.createElement("span")
  emotionTag.className = "ytmo-emotion-tag"
  root.appendChild(emotionTag)

  // ── Metadata block ────────────────────────────────────────────────────────
  const meta = document.createElement("div")
  meta.className = "ytmo-meta"

  // Now playing row
  const nowPlayingRow = document.createElement("div")
  nowPlayingRow.className = "ytmo-now-playing-row"

  const musicDot = document.createElement("span")
  musicDot.className = "ytmo-music-dot"

  const nowPlayingLabel = document.createElement("span")
  nowPlayingLabel.className = "ytmo-now-playing-label"
  nowPlayingLabel.textContent = "Now Playing"

  nowPlayingRow.appendChild(musicDot)
  nowPlayingRow.appendChild(nowPlayingLabel)

  // Title
  const titleEl = document.createElement("h3")
  titleEl.className = "ytmo-title"

  // Artist
  const artistEl = document.createElement("p")
  artistEl.className = "ytmo-artist"

  // Progress bar container
  const progressWrap = document.createElement("div")
  progressWrap.className = "ytmo-progress-wrap"

  const progressBar = document.createElement("div")
  progressBar.className = "ytmo-progress-bar"

  const progressFill = document.createElement("div")
  progressFill.className = "ytmo-progress-fill"
  progressBar.appendChild(progressFill)

  const progressTimes = document.createElement("div")
  progressTimes.className = "ytmo-progress-times"

  const currentTimeEl = document.createElement("span")
  const durationEl = document.createElement("span")
  progressTimes.appendChild(currentTimeEl)
  progressTimes.appendChild(durationEl)

  progressWrap.appendChild(progressBar)
  progressWrap.appendChild(progressTimes)

  meta.appendChild(nowPlayingRow)
  meta.appendChild(titleEl)
  meta.appendChild(artistEl)
  meta.appendChild(progressWrap)
  root.appendChild(meta)

  // ── Metadata visibility cycle ─────────────────────────────────────────────
  let metaVisible = true
  let metaCycleTimer: number | null = null

  function startMetaCycle() {
    if (metaCycleTimer !== null) clearInterval(metaCycleTimer)
    metaVisible = true
    meta.classList.remove("ytmo-meta--hidden")
    emotionTag.classList.remove("ytmo-emotion-tag--hidden")

    metaCycleTimer = window.setInterval(
      () => {
        metaVisible = !metaVisible
        if (metaVisible) {
          meta.classList.remove("ytmo-meta--hidden")
          emotionTag.classList.remove("ytmo-emotion-tag--hidden")
        } else {
          meta.classList.add("ytmo-meta--hidden")
          emotionTag.classList.add("ytmo-emotion-tag--hidden")
        }
      },
      metaVisible ? 8000 : 20000
    )
  }

  // ── Update function ───────────────────────────────────────────────────────
  let progressAnimId: number | null = null
  let songStartWallTime = Date.now()
  let songBaseTime = 0

  function applyColor(song: OverlaySong) {
    const c = emotionColor(song.valence)
    const cs = rgbStr(c)

    root.style.boxShadow = `0 0 40px ${rgbStr(c, 0.12)}, 0 0 80px ${rgbStr(c, 0.06)}`
    glowBorder.style.background = `linear-gradient(135deg, ${rgbStr(c, 0.3)} 0%, transparent 50%, ${rgbStr(c, 0.2)} 100%)`
    emotionTag.style.background = rgbStr(c, 0.4)
    musicDot.style.background = cs
    nowPlayingLabel.style.color = cs
  }

  function animateProgress(song: OverlaySong) {
    if (progressAnimId !== null) cancelAnimationFrame(progressAnimId)

    const totalDuration = song.duration || 1
    songBaseTime = song.currentTime
    songStartWallTime = Date.now()

    function tick() {
      const elapsed = (Date.now() - songStartWallTime) / 1000
      const t = Math.min(1, (songBaseTime + elapsed) / totalDuration)
      progressFill.style.width = `${t * 100}%`
      currentTimeEl.textContent = formatTime(songBaseTime + elapsed)
      durationEl.textContent = formatTime(totalDuration)
      progressAnimId = requestAnimationFrame(tick)
    }
    progressAnimId = requestAnimationFrame(tick)
  }

  function update(song: OverlaySong) {
    // Text
    titleEl.textContent = song.title
    artistEl.textContent = song.artist
    emotionTag.textContent = emotionLabel(song.valence, song.arousal)

    // Transition flash on new track
    root.classList.add("ytmo-card--transitioning")
    setTimeout(() => root.classList.remove("ytmo-card--transitioning"), 600)

    applyColor(song)
    animateProgress(song)
    startMetaCycle()

    // Set color vars for CSS (progress fill, dot)
    const c = emotionColor(song.valence)
    progressFill.style.background = `linear-gradient(90deg, ${rgbStr(c)}, ${rgbStr(c, 0.7)})`
  }

  function destroy() {
    if (progressAnimId !== null) cancelAnimationFrame(progressAnimId)
    if (metaCycleTimer !== null) clearInterval(metaCycleTimer)
    root.remove()
  }

  return { root, canvas, update, destroy }
}
