import { useRef, useState } from "react"
import type { MotifPoint } from "@portfolio/types"

export type MotifPanelProps = {
  points: Array<MotifPoint>
  onToggle: (id: string) => void
  onAdd: (text: string) => void
  onRemove: (id: string) => void
  onUpdate: (id: string, text: string) => void
}

type PointRowProps = {
  point: MotifPoint
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onUpdate: (id: string, text: string) => void
}

const PointRow: React.FC<PointRowProps> = ({ point, onToggle, onRemove, onUpdate }) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(point.text)
  const ref = useRef<HTMLInputElement>(null)

  const commit = () => {
    if (draft.trim()) onUpdate(point.id, draft.trim())
    setEditing(false)
  }

  return (
    <div
      className="group flex items-start gap-2 rounded px-2 py-1.5 transition-colors hover:bg-neutral-800/60"
      style={{ opacity: point.checked ? 0.45 : 1 }}
    >
      <button
        onClick={() => onToggle(point.id)}
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-neutral-600 transition-colors"
        style={{
          background: point.checked ? "#22c55e" : "transparent",
          borderColor: point.checked ? "#22c55e" : undefined,
        }}
        aria-label="toggle"
      >
        {point.checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {editing ? (
        <input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") { setDraft(point.text); setEditing(false) }
          }}
          autoFocus
          className="flex-1 bg-transparent font-mono text-[12px] text-neutral-100 outline-none"
        />
      ) : (
        <span
          onDoubleClick={() => setEditing(true)}
          className="flex-1 cursor-default font-mono text-[12px] leading-relaxed text-neutral-300"
          style={{ textDecoration: point.checked ? "line-through" : "none" }}
        >
          {point.text}
        </span>
      )}

      <button
        onClick={() => onRemove(point.id)}
        className="invisible mt-0.5 text-neutral-700 transition-colors hover:text-red-400 group-hover:visible"
        aria-label="remove"
      >
        ×
      </button>
    </div>
  )
}

export const MotifPanel: React.FC<MotifPanelProps> = ({
  points,
  onToggle,
  onAdd,
  onRemove,
  onUpdate,
}) => {
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const handleAdd = () => {
    if (draft.trim()) {
      onAdd(draft.trim())
      setDraft("")
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {points.length === 0 && (
        <p className="px-2 font-mono text-[11px] italic text-neutral-600">
          no points yet · add talking points below
        </p>
      )}

      {points.map((p) => (
        <PointRow key={p.id} point={p} onToggle={onToggle} onRemove={onRemove} onUpdate={onUpdate} />
      ))}

      <div className="mt-1 flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd() }}
          placeholder="add talking point…"
          className="flex-1 rounded border border-neutral-800 bg-transparent px-2 py-1 font-mono text-[11px] text-neutral-400 placeholder-neutral-700 outline-none focus:border-neutral-600"
        />
        <button
          onClick={handleAdd}
          className="rounded border border-neutral-700 px-2 py-1 font-mono text-[11px] text-neutral-500 transition-colors hover:text-neutral-200"
        >
          +
        </button>
      </div>
    </div>
  )
}
