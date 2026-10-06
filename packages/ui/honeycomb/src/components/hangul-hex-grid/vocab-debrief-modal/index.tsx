import { useCallback, useEffect, useState } from "react"
import type { WordEntry } from "@honeycomb/data"
import { useAutoDismiss } from "@honeycomb/hooks/use-auto-dismiss"
import { sayWord } from "@honeycomb/lib/hangul/speech"
import type { MissedWord } from "@honeycomb/types/hangul-types"
import { useSpeaker } from "@some-ui/speech"

import "./index.css"

/**
 * How long the debrief holds the session: long enough for a sentence and an
 * example. Any engagement freezes the clock (see `useAutoDismiss`).
 */
const AUTO_DISMISS_MS = 9000

type VocabDebriefModalProps = {
  /** The expired-unfinished word, or null when there is nothing to debrief. */
  missed: MissedWord | null
  /**
   * The full seed entry for `missed`, when it resolved. Absent for an
   * unmatched host word; the panel then runs off `missed` alone.
   */
  entry: WordEntry | undefined
  /** Move on to the next word. Called on Escape, on timeout, or on the button. */
  onDismiss: () => void
}

/**
 * The pedagogical half of a missed vocabulary word (the board, where
 * `HangulHexCell` reveals the unreached jamo, is the other). A word that ran
 * out of time is the one moment worth spending attention on prose, so the run
 * stops here: the word, its jamo with misses marked, and a line each of
 * motivation and usage.
 *
 * It leaves on its own (`useAutoDismiss`), but the countdown freezes while
 * the player engages (hover or focus inside). Escape leaves immediately.
 */
export const VocabDebriefModal = ({
  missed,
  entry,
  onDismiss,
}: VocabDebriefModalProps): React.JSX.Element | null => {
  const speaker = useSpeaker()
  // Tracked apart: a pointer-leave must not cancel engagement held by focus.
  const [isHovered, setIsHovered] = useState(false)
  const [isFocusWithin, setIsFocusWithin] = useState(false)
  const isEngaged = isHovered || isFocusWithin
  const active = missed !== null
  const [wasActive, setWasActive] = useState(active)

  // Engagement is per-debrief, cleared during render on the active edge (as
  // in useAutoDismiss): the panel is usually torn down under the pointer, so
  // no pointerleave arrives and `isHovered` would stick for the next word.
  if (wasActive !== active) {
    setWasActive(active)
    setIsHovered(false)
    setIsFocusWithin(false)
  }

  const { progress, remainingMs } = useAutoDismiss({
    active,
    durationMs: AUTO_DISMISS_MS,
    paused: isEngaged,
    onElapsed: onDismiss,
  })

  useEffect((): (() => void) | undefined => {
    if (!active) return undefined
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      // The game's own keyboard capture is idle while this is up (the host
      // pauses it), so Escape is unambiguous here.
      event.preventDefault()
      onDismiss()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [active, onDismiss])

  const onPointerEnter = useCallback(() => setIsHovered(true), [])
  const onPointerLeave = useCallback(() => setIsHovered(false), [])
  // React's onFocus/onBlur bubble (focusin/focusout), so focus on any
  // descendant counts.
  const onFocus = useCallback(() => setIsFocusWithin(true), [])
  const onBlur = useCallback(() => setIsFocusWithin(false), [])

  if (!missed) return null

  const word = entry?.word ?? missed.answerGlyphs.join("")
  const pedagogy = entry?.pedagogy

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md"
      // Presentational: the ways out are a control inside, Escape, or the
      // timer. Clicking the scrim deliberately is not one.
      role="presentation"
    >
      <div
        className={
          // scroll-intent: long-form — the corpus decides the prose's length.
          // Tabs or paging would put a click before the sentence on a
          // self-dismissing panel already the board's full height; scrolling
          // is safe because engagement pauses the countdown.

          "hangul-debrief-panel relative mx-4 flex max-h-[calc(100%-2rem)] w-full max-w-lg flex-col gap-5 overflow-y-auto rounded-3xl border border-white/15 bg-slate-950/85 px-6 py-7 text-center text-white shadow-2xl sm:px-10"
        }
        data-scroll-intent="long-form"
        role="dialog"
        aria-modal="true"
        aria-label={`Missed word: ${word}`}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400/80">
            Missed
          </span>
          {entry && (
            <div className="text-5xl" aria-hidden>
              {entry.icon}
            </div>
          )}
        </div>

        {/* The word itself, in the register the whole panel is built around. */}
        <div className="py-1">
          <div className="hangul-neon-word text-6xl font-black tracking-widest">
            {word}
          </div>
          {entry && (
            <div className="mt-3 text-sm text-white/50">
              {entry.romanization}
              {pedagogy && (
                <>
                  {" · "}
                  <span className="text-white/70">{pedagogy.gloss}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Jamo strip: what they got, and what the clock took. */}
        <div className="flex flex-wrap justify-center gap-1.5 font-mono text-2xl font-bold">
          {missed.answerGlyphs.map((glyph, index) => {
            const wasTyped = index < missed.cursor
            return (
              <span
                // eslint-disable-next-line react/no-array-index-key -- token position within one challenge's fixed-length answer is a stable identity here
                key={index}
                className={
                  wasTyped
                    ? "rounded-md bg-emerald-500/15 px-2 py-0.5 text-emerald-300"
                    : "rounded-md bg-red-500/15 px-2 py-0.5 text-red-300"
                }
              >
                {glyph}
              </span>
            )
          })}
        </div>
        <div className="-mt-3 text-xs text-white/40">
          {missed.cursor} of {missed.answerGlyphs.length} jamo typed
        </div>

        {pedagogy && (
          <div className="flex flex-col gap-4 rounded-2xl bg-white/5 p-5 text-left">
            <p className="text-sm leading-relaxed text-white/80">
              {pedagogy.note}
            </p>
            <div className="border-t border-white/10 pt-4">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                In use
              </div>
              <p className="text-lg leading-snug">{pedagogy.example.korean}</p>
              <p className="mt-1 text-sm italic text-white/55">
                {pedagogy.example.english}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          {entry && (
            <button
              type="button"
              onClick={() => sayWord(speaker, entry.ttsText, "now")}
              className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/20"
            >
              🔊 Hear it
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/20"
          >
            Next word →
          </button>
        </div>

        {/* The countdown, stated rather than implied - a panel that leaves on
            its own has to say so, or its disappearance reads as a glitch. */}
        <div className="flex flex-col gap-1.5">
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Time until the next word"
          >
            <div
              className="h-full rounded-full bg-red-400/70"
              style={{ width: `${(1 - progress) * 100}%` }}
            />
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">
            {isEngaged
              ? "Paused while you read · Esc to continue"
              : `Next word in ${Math.ceil(remainingMs / 1000)}s · Esc to continue`}
          </div>
        </div>
      </div>
    </div>
  )
}
