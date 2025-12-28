import type { HTMLAttributes } from "react"
import { forwardRef } from "react"
import { Music } from "lucide-react"
import { cn } from "some-ui-utils"

export const StreamingNotes = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(className, "pointer-events-none absolute inset-0")}
      {...props}
    >
      {/* Ring 1 - Close to disc */}
      <div className="absolute left-20 top-12">
        <Music className="animate-stream-1 size-4 text-purple-400 opacity-0" />
      </div>
      <div className="absolute left-12 top-20">
        <Music className="animate-stream-2 size-3 text-blue-300 opacity-0" />
      </div>
      <div className="absolute left-28 top-24">
        <Music className="animate-stream-3 size-5 text-cyan-400 opacity-0" />
      </div>
      <div className="absolute left-32 top-16">
        <Music className="animate-stream-4 size-4 text-pink-300 opacity-0" />
      </div>

      {/* Ring 2 - Medium distance */}
      <div className="absolute left-16 top-8">
        <Music className="animate-stream-5 size-6 text-purple-300 opacity-0" />
      </div>
      <div className="absolute left-8 top-28">
        <Music className="animate-stream-6 size-4 text-blue-400 opacity-0" />
      </div>
      <div className="absolute left-24 top-32">
        <Music className="animate-stream-7 size-5 text-cyan-300 opacity-0" />
      </div>
      <div className="absolute left-24 top-4">
        <Music className="animate-stream-8 size-3 text-pink-400 opacity-0" />
      </div>
      <div className="absolute left-4 top-20">
        <Music className="animate-stream-9 size-4 text-purple-500 opacity-0" />
      </div>

      {/* Ring 3 - Far from disc */}
      <div className="absolute left-8 top-2">
        <Music className="animate-stream-10 size-7 text-purple-400 opacity-0" />
      </div>
      <div className="absolute left-2 top-36">
        <Music className="animate-stream-11 size-5 text-blue-300 opacity-0" />
      </div>
      <div className="absolute left-16 top-40">
        <Music className="animate-stream-12 size-6 text-cyan-400 opacity-0" />
      </div>
      <div className="absolute left-32 top-2">
        <Music className="animate-stream-13 size-4 text-pink-300 opacity-0" />
      </div>
      <div className="absolute left-36 top-36">
        <Music className="animate-stream-14 size-5 text-purple-300 opacity-0" />
      </div>

      {/* Right side streams */}
      <div className="absolute right-20 top-12">
        <Music className="animate-stream-15 size-4 text-blue-400 opacity-0" />
      </div>
      <div className="absolute right-12 top-20">
        <Music className="animate-stream-16 size-6 text-purple-300 opacity-0" />
      </div>
      <div className="absolute right-8 top-28">
        <Music className="animate-stream-17 size-3 text-cyan-400 opacity-0" />
      </div>
      <div className="absolute right-16 top-8">
        <Music className="animate-stream-18 size-5 text-pink-400 opacity-0" />
      </div>
      <div className="absolute right-24 top-32">
        <Music className="animate-stream-19 size-4 text-purple-400 opacity-0" />
      </div>
      <div className="absolute right-4 top-4">
        <Music className="animate-stream-20 size-7 text-blue-300 opacity-0" />
      </div>
    </div>
  )
})

StreamingNotes.displayName = "StreamingNotes"
