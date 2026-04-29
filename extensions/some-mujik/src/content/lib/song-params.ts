// Deterministic mapping: song metadata → WaveformParams
//
// Pipeline: canonicalize → FNV-1a hash (uint32) → mulberry32 PRNG → shaped params
// Properties:
//   • stable   — same meta fields → identical params, session-independent
//   • decorrelated — distinct songs → decorrelated seeds
//   • bounded  — all outputs ∈ [0, 1]
//   • coherent — params are correlated to avoid unnatural combos
//
// Not musically accurate. Replace rand() calls with real audio features
// (Web Audio FFT, Spotify track analysis, etc.) when signal-based params
// are available. The shaping layer below stays valid either way.
// ─────────────────────────────────────────────────────────────────────────────

import type { WaveformParams } from "@mujik/components/ui/waveform"

// ── Stable identity fields ────────────────────────────────────────────────────
// Only pick fields that are stable across scrapes for the same track.
// Avoid: view counts, timestamps, like counts, recommendation state.

const CANONICAL_KEYS = ["title", "artist", "album", "duration"] as const

function canonicalizeSongMeta(meta: Record<string, unknown>): string {
  return CANONICAL_KEYS.map((k) => String(meta[k] ?? ""))
    .join("::")
    .toLowerCase()
    .trim()
}

// ── FNV-1a 32-bit hash ────────────────────────────────────────────────────────
// Fast, deterministic, well-distributed for short strings.
// Basis: 2166136261 (FNV offset basis), prime: 16777619

function hash32(str: string): number {
  let h = 2166136261 >>> 0

  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }

  return h >>> 0
}

// ── Mulberry32 seeded PRNG ────────────────────────────────────────────────────
// Produces uniform float ∈ [0, 1). Stateful; call sequentially.
// Do NOT use Math.random() — non-deterministic across sessions.

function mulberry32(seed: number): () => number {
  let t = seed >>> 0

  return function (): number {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

// ── Distribution shapers ──────────────────────────────────────────────────────

/** Bias toward lower values (calmer, quieter feel) */
function biasLow(x: number): number {
  return x * x
}

/** Bias toward higher values (more energetic) */
function biasHigh(x: number, y: number): number {
  return Math.max(x, y)
}

/** Soft mid-range bias via tent function — avoids extremes */
function biasMid(x: number): number {
  return 0.25 + x * 0.5
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derives stable WaveformParams from song metadata.
 *
 * Correlation model:
 *   base  → shared energy axis (correlates tempo + arousal)
 *   tempo = base                          (rhythm ground truth)
 *   arousal = 0.7·base + 0.3·rand        (mostly tempo-driven, slight variance)
 *   intensity = 0.5·base + 0.5·rand      (half-correlated with energy)
 *   valence = rand                        (emotionally independent of tempo)
 *
 * Distributions:
 *   tempo     — uniform (songs span full BPM range)
 *   arousal   — biased high (max of two draws → skews energetic)
 *   intensity — biased low (ease² → slightly calmer default)
 *   valence   — mid-biased (most songs avoid extreme ends)
 */
export function paramsFromSongMeta(
  meta: Record<string, unknown>
): WaveformParams {
  const key = canonicalizeSongMeta(meta)
  const seed = hash32(key)
  const rand = mulberry32(seed)

  const base = rand() // shared energy axis

  const tempo = base
  const arousal = clamp01(0.7 * base + 0.3 * biasHigh(rand(), rand()))
  const intensity = clamp01(0.5 * base + 0.5 * biasLow(rand()))
  const valence = biasMid(rand())

  return { tempo, intensity, valence, arousal }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

// ── Fallback ──────────────────────────────────────────────────────────────────
// Used when meta is absent / card mounts before any song event fires.

export const FALLBACK_PARAMS: WaveformParams = {
  arousal: 0.5,
  valence: 0.55,
  tempo: 0.5,
  intensity: 0.6,
}
