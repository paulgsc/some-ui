import type { JSX } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { NodeData, TaskStatus } from "@calendar/types/life-scheduler"
import { createPortal } from "react-dom"

type Props = {
  data: NodeData
  type: "outer" | "inner"
  nodeIndex: number
  onClose: () => void
}

const STATUS_DOT: Record<TaskStatus, string> = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  err: "bg-status-err",
}

const STATUS_TEXT: Record<TaskStatus, string> = {
  ok: "text-status-ok",
  warn: "text-status-warn",
  err: "text-status-err",
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  ok: "ok",
  warn: "warn",
  err: "err",
}

const LoadBar = ({ value }: { value: number }): JSX.Element => {
  const fill =
    value > 75 ? "bg-rose-500" : value > 50 ? "bg-amber-400" : "bg-emerald-400"
  return (
    <div className="mt-1.5 h-1.5 w-full rounded-full bg-ink-800 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${fill}`}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

// Invariant: position is always within viewport bounds after any drag
function clampToViewport(
  x: number,
  y: number,
  w: number,
  h: number
): Record<"x" | "y", number> {
  return {
    x: Math.max(0, Math.min(x, window.innerWidth - w)),
    y: Math.max(0, Math.min(y, window.innerHeight - h)),
  }
}

const POPUP_W = 480
const POPUP_H_APPROX = 520

export const NodePopup = ({
  data,
  type,
  nodeIndex,
  onClose,
}: Props): JSX.Element => {
  const isOuter = type === "outer"

  // Default: centered in viewport
  const [pos, setPos] = useState(() => ({
    x: Math.round((window.innerWidth - POPUP_W) / 2),
    y: Math.round((window.innerHeight - POPUP_H_APPROX) / 2),
  }))
  const [expanded, setExpanded] = useState(false)

  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const popupRef = useRef<HTMLDivElement>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (expanded) return
      dragging.current = true
      dragOffset.current = {
        x: e.clientX - pos.x,
        y: e.clientY - pos.y,
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      e.preventDefault()
    },
    [pos, expanded]
  )

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const el = popupRef.current
    const w = el?.offsetWidth ?? POPUP_W
    const h = el?.offsetHeight ?? POPUP_H_APPROX
    setPos(
      clampToViewport(
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y,
        w,
        h
      )
    )
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  // Recenter on expand/collapse
  useEffect(() => {
    if (expanded) return
    const el = popupRef.current
    const w = el?.offsetWidth ?? POPUP_W
    const h = el?.offsetHeight ?? POPUP_H_APPROX
    setPos({
      x: Math.round((window.innerWidth - w) / 2),
      y: Math.round((window.innerHeight - h) / 2),
    })
  }, [expanded])

  const style = expanded
    ? { inset: 0, width: "100vw", height: "100vh", position: "fixed" as const }
    : { left: pos.x, top: pos.y, width: POPUP_W, position: "fixed" as const }

  return createPortal(
    <div
      ref={popupRef}
      style={style}
      className={`scheduler z-50 rounded-xl border border-ink-700 bg-ink-900 overflow-hidden animate-[popup-in_220ms_ease] shadow-2xl ${
        expanded ? "rounded-none" : ""
      }`}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div
        className={`flex items-center gap-3 px-4 py-3 border-b border-ink-800 ${
          isOuter ? "bg-violet-500/10" : "bg-emerald-500/10"
        }`}
      >
        {/* Status badge */}
        <span
          className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
            isOuter
              ? "text-violet-400 border-violet-500/40 bg-violet-500/10"
              : "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
          }`}
        >
          {isOuter ? "outer · 24" : "inner · 60"}
        </span>

        {/* Draggable area */}
        <span
          className={`font-mono text-[13px] font-medium text-ink-100 flex-1 truncate ${
            expanded ? "" : "cursor-grab active:cursor-grabbing"
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {isOuter
            ? `node ${String(nodeIndex).padStart(2, "0")} · ${data.label}`
            : data.label}
        </span>

        {/* Buttons */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-ink-500 hover:text-ink-200 transition-colors text-sm leading-none px-1 font-mono"
          title={expanded ? "restore" : "expand"}
        >
          {expanded ? "⊡" : "⊞"}
        </button>

        <button
          onClick={onClose}
          className="text-ink-500 hover:text-ink-200 transition-colors text-lg leading-none"
          title="close"
        >
          ×
        </button>
      </div>
      {/* ── Body ───────────────────────────────────────── */}
      <div
        className={`px-4 py-3 space-y-3 overflow-y-auto ${expanded ? "h-[calc(100vh-52px)]" : ""}`}
      >
        <p className="text-[12px] text-ink-400 leading-relaxed">
          {data.description}
        </p>

        <div className="grid grid-cols-3 gap-2">
          {(["bucket", "slot", "tasks"] as const).map((key) => (
            <div key={key} className="rounded-lg bg-ink-800 px-3 py-2">
              <div className="text-[11px] text-ink-500 font-mono mb-0.5">
                {key}
              </div>
              <div className="text-[12px] font-mono font-medium text-ink-200 truncate">
                {key === "tasks"
                  ? data.tasks.length
                  : ((data as Record<string, unknown>)[key] as string)}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-ink-800 px-3 py-2">
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-ink-500 font-mono">load</span>
            <span
              className={`text-[12px] font-mono font-semibold ${
                data.load > 75
                  ? "text-rose-500"
                  : data.load > 50
                    ? "text-amber-400"
                    : "text-emerald-400"
              }`}
            >
              {data.load}%
            </span>
          </div>
          <LoadBar value={data.load} />
        </div>

        <div>
          <div className="text-[11px] text-ink-600 font-mono uppercase tracking-widest mb-2">
            scheduled tasks
          </div>
          <div className="space-y-1">
            {data.tasks.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-ink-800/60 border border-ink-800"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[t.status]}`}
                />
                <span className="font-mono text-[12px] text-ink-200 flex-1">
                  {t.name}
                </span>
                <span
                  className={`font-mono text-[11px] ${STATUS_TEXT[t.status]}`}
                >
                  {STATUS_LABEL[t.status]}
                </span>
                <span className="text-[11px] text-ink-600 font-mono">
                  {t.interval}
                </span>
                <span className="text-[11px] text-ink-700 font-mono hidden sm:block">
                  {t.lastRun}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
