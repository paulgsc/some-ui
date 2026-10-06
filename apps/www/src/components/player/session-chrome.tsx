/**
 * Everything that is not the activity, on a phone, behind one icon.
 *
 * On a 390px phone the header, the now/next strip and the transport row
 * would take more of the screen than the activity. Shrinking leaves a
 * permanent band with sub-thumb buttons; folding fits the frequency (Pause
 * once a session, Theme almost never). One control, not two: both mean "not
 * the exercise", and the sheet keeps them visibly grouped (session controls
 * first, app chrome under a rule).
 *
 * The sheet is on the overlay plane
 * (`docs/session-viewport/01-overflow-doctrine-and-audit.md` §2); the trigger
 * is not. The host cannot know what an applet paints in any corner (floated,
 * it covered LeetType's progress counter), so the trigger gets a 36px strip
 * of its own above `V`, and no activity is ever painted over.
 */

import type { JSX } from "react"
import { useState } from "react"
import {
  Button,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SidebarTrigger,
} from "@some-ui/shared"
import type { SceneConfig } from "@some-ui/types"
import {
  LogOut,
  Pause,
  Play,
  SkipForward,
  SlidersHorizontal,
  Square,
} from "lucide-react"

import { formatTimecode } from "@/lib/format"
import {
  useIsPaused,
  useIsRunning,
  useOrchestratorClock,
  useOrchestratorStore,
  usePrimaryScene,
} from "@/lib/orchestrator"
import { isWindingDown } from "@/lib/wind-down"
import { AudioIndicator } from "@/components/audio/audio-indicator"
import { ThemeSwitcher } from "@/components/theme-switcher"

import { friendlyActivityName } from "./utils"
import { WindDownNudge } from "./wind-down-nudge"

type SessionChromeProps = {
  scenes: Array<SceneConfig>
  onPlay: () => void
  /** Stops now and keeps the stop; the player shows what follows. */
  onGotToGo: () => void
  /** A stop is open: its dialog replaces the controls sheet. */
  stopped: boolean
}

export const SessionChrome = ({
  scenes,
  onPlay,
  onGotToGo,
  stopped,
}: SessionChromeProps): JSX.Element => {
  const [open, setOpen] = useState(false)
  const isRunning = useIsRunning()
  const isPaused = useIsPaused()
  const {
    current_time: currentTime,
    time_remaining: timeRemaining,
    total_duration: totalDuration,
  } = useOrchestratorClock()
  const primaryScene = usePrimaryScene()
  const pause = useOrchestratorStore((s) => s.pause)
  const resume = useOrchestratorStore((s) => s.resume)
  const stop = useOrchestratorStore((s) => s.stop)
  const skipCurrentScene = useOrchestratorStore((s) => s.skipCurrentScene)
  // Read here: the header is not rendered on this route at this width, and
  // an ambient signal must never be silent when there is something to say.

  const nowPlaying = primaryScene
    ? friendlyActivityName(
        primaryScene.kind.Scene.scene_name,
        primaryScene.kind.Scene.ui
      )
    : null

  const upNext = scenes
    .filter((scene) => scene.start_time > currentTime)
    .sort((a, b) => a.start_time - b.start_time)
    .at(0)

  // Every control closes the sheet after acting: the person wants the
  // activity back.
  const act = (run: () => void) => (): void => {
    run()
    setOpen(false)
  }

  return (
    <>
      {/* The strip: transparent and just tall enough for the trigger, but
          real layout, so nothing below it is painted over. */}
      <div className="flex min-h-9 shrink-0 items-center justify-end gap-2 px-2 pt-[env(safe-area-inset-top)]">
        {/* In the last minutes the nudge's "Wrap up" is the way out. */}
        {isRunning && !isWindingDown(timeRemaining, totalDuration) && (
          <Button
            type="button"
            variant="secondary"
            onClick={onGotToGo}
            className="mr-auto h-9 gap-1.5 rounded-full"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Got to go
          </Button>
        )}
        <WindDownNudge className="min-w-0 flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Session controls"
          onClick={() => setOpen(true)}
          className="size-9 rounded-full text-muted-foreground"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <Sheet open={open && !stopped} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="gap-0 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="px-0 text-left">
            <SheetTitle>{nowPlaying ?? "Ready to play"}</SheetTitle>
            <SheetDescription>
              {nowPlaying
                ? `${formatTimecode(timeRemaining)} remaining${
                    upNext
                      ? ` · up next ${friendlyActivityName(upNext.scene_name, upNext.ui)}`
                      : ""
                  }`
                : "Nothing is playing yet."}
            </SheetDescription>
          </SheetHeader>

          {/* Session transport: full-width 44px rows for a thumb. */}
          <div className="mt-4 flex flex-col gap-2">
            {!isRunning && !isPaused && (
              <Button className="h-11 w-full" onClick={act(onPlay)}>
                <Play className="mr-2 size-4" aria-hidden="true" />
                Play
              </Button>
            )}
            {isRunning && (
              <Button
                className="h-11 w-full"
                variant="secondary"
                onClick={act(() => void pause())}
              >
                <Pause className="mr-2 size-4" aria-hidden="true" />
                Pause
              </Button>
            )}
            {isPaused && (
              <Button
                className="h-11 w-full"
                onClick={act(() => void resume())}
              >
                <Play className="mr-2 size-4" aria-hidden="true" />
                Resume
              </Button>
            )}
            {(isRunning || isPaused) && (
              <>
                <Button
                  className="h-11 w-full"
                  variant="outline"
                  onClick={act(() => void skipCurrentScene())}
                >
                  <SkipForward className="mr-2 size-4" aria-hidden="true" />
                  Skip
                </Button>
                <Button
                  className="h-11 w-full"
                  variant="destructive"
                  onClick={act(() => void stop())}
                >
                  <Square className="mr-2 size-4" aria-hidden="true" />
                  Stop
                </Button>
              </>
            )}
          </div>

          <Separator className="my-4" />

          {/* The dashboard header's contents, subordinate to the transport.
              Right-aligned for thumb reach, and clear of the dev-only TanStack
              devtools button in the bottom-left corner. */}
          <div className="flex items-center justify-end gap-2">
            <SidebarTrigger />
            <ThemeSwitcher />
            <AudioIndicator />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
