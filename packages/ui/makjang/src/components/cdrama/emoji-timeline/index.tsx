interface EmojiReaction {
  minute: number
  emoji: string
  context: string
}

interface EmojiTimelineProps {
  reactions: EmojiReaction[]
  currentMinute: number
}

export function EmojiTimeline({
  reactions,
  currentMinute,
}: EmojiTimelineProps) {
  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-900/90 via-blue-900/70 to-purple-900/90 p-6 backdrop-blur-xl">
      <h2 className="mb-4 font-mono text-sm font-bold uppercase tracking-wider text-cyan-400">
        Instant Reactions
      </h2>

      <div className="relative">
        {/* Timeline bar */}
        <div className="absolute left-0 top-8 h-1 w-full rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-300"
            style={{ width: `${(currentMinute / 45) * 100}%` }}
          />
        </div>

        {/* Reactions */}
        <div className="relative flex justify-between">
          {reactions.map((reaction, index) => {
            const isPast = reaction.minute <= currentMinute
            return (
              <div
                key={index}
                className="group relative flex flex-col items-center"
                style={{ left: `${(reaction.minute / 45) * 100}%` }}
              >
                <div
                  className={`relative z-10 flex h-16 w-16 items-center justify-center rounded-full border-2 text-3xl transition-all ${
                    isPast
                      ? "scale-110 border-cyan-400 bg-slate-900 shadow-lg shadow-cyan-500/50"
                      : "border-slate-700 bg-slate-800/50 opacity-50"
                  }`}
                >
                  {reaction.emoji}
                </div>

                <div className="mt-2 text-center">
                  <div className="font-mono text-xs text-slate-400">
                    {reaction.minute}:00
                  </div>
                  <div
                    className={`mt-1 max-w-[100px] truncate font-mono text-xs transition-opacity ${
                      isPast ? "text-cyan-300" : "text-slate-600"
                    }`}
                  >
                    {reaction.context}
                  </div>
                </div>

                {/* Tooltip on hover */}
                <div className="pointer-events-none absolute -top-16 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg border border-cyan-400/30 bg-slate-900 px-3 py-2 font-mono text-xs text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                  {reaction.context}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
