/**
 * Everything that is not the activity, on a phone, behind one icon.
 *
 * # What this replaces, and why folding rather than shrinking
 *
 * On a wide screen the session player wears three pieces of chrome around
 * the viewport: the dashboard header (sidebar trigger, theme, audio), the
 * now/next strip, and the transport row. Each is a reasonable use of space
 * that a desktop has spare. On a 390px phone they are three stacked bands
 * that between them take more of the screen than the activity does — and
 * the activity is the entire point of the route.
 *
 * The instinct is to shrink them. That is the wrong move twice over: a
 * shrunken transport row is still a permanent band, and the buttons inside
 * it get smaller than a thumb. Folding is the honest answer, because the
 * frequency actually justifies it — over a ten-minute session a person
 * touches Pause perhaps once and Theme approximately never, while they look
 * at the exercise continuously. Chrome that is used once should not be
 * resident for ten minutes.
 *
 * # Why one control and not two
 *
 * The bottom transport and the top header are separate concerns on a
 * desktop and are folded together here. Two floating buttons on a phone is
 * two things to aim at and two things obscuring the activity, and from the
 * reader's position mid-exercise both mean the same thing: *not the
 * exercise*. They stay visibly separate inside the sheet — the session's own
 * controls first, the app's chrome under a rule beneath — so the grouping is
 * preserved without spending a second corner of the screen on it.
 *
 * # The sheet is on the overlay plane; the trigger is not
 *
 * `docs/session-viewport/01-overflow-doctrine-and-audit.md` §2 carves out an
 * overlay plane: toasts and "any future command palette / modal" paint
 * *above* `V` rather than tiling it, and are not part of `Layout(t)`. The
 * sheet is exactly that.
 *
 * The **trigger** deliberately is not, and the first draft of this component
 * getting that wrong is worth recording. Floated into the viewport's
 * top-right corner it landed squarely on LeetType's own progress counter —
 * and that was not a LeetType problem: the host has no idea what any applet
 * paints in any corner, so *every* corner is somebody's content. A floating
 * trigger over a full-bleed leaf is a collision waiting for whichever
 * activity is unlucky.
 *
 * So the trigger gets a strip of its own, above `V`, and `V` is what remains.
 * It costs 36px of an 800px viewport — against the ~200px the header, the
 * now/next strip and the transport row were taking between them — and in
 * exchange no activity ever has the host painted across it. That is the
 * honest trade: the host needs *somewhere* to be, and a thin strip it owns
 * beats an overlay it does not.
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
  Pause,
  Play,
  SkipForward,
  SlidersHorizontal,
  Square,
} from "lucide-react"
import {
  useIsPaused,
  useIsRunning,
  useOrchestratorClock,
  useOrchestratorStore,
  usePrimaryScene,
} from "some-ui-utils"

import { formatTimecode } from "@/lib/format"
import { AmbientIntentStatus } from "@/lib/intent/render"
import { useMigrationSignal } from "@/lib/tenant/migration-signal"
import { AudioIndicator } from "@/components/audio/audio-indicator"
import { ThemeSwitcher } from "@/components/theme-switcher"

import { friendlyActivityName } from "./utils"

type SessionChromeProps = {
  scenes: Array<SceneConfig>
  onPlay: () => void
}

export const SessionChrome = ({
  scenes,
  onPlay,
}: SessionChromeProps): JSX.Element => {
  const [open, setOpen] = useState(false)
  const isRunning = useIsRunning()
  const isPaused = useIsPaused()
  const { current_time: currentTime, time_remaining: timeRemaining } =
    useOrchestratorClock()
  const primaryScene = usePrimaryScene()
  const pause = useOrchestratorStore((s) => s.pause)
  const resume = useOrchestratorStore((s) => s.resume)
  const stop = useOrchestratorStore((s) => s.stop)
  const skipCurrentScene = useOrchestratorStore((s) => s.skipCurrentScene)
  // Read here rather than passed down from the header this replaces: the
  // header is not rendered on this route at this width, and #940's rule is
  // that an ambient signal is quiet when there is nothing to say and never
  // silent when there is. Folding the chrome must not turn it into the
  // latter.
  const migrationSignal = useMigrationSignal()

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

  // Every control closes the sheet after acting. A person who taps Pause
  // wants the activity back, not the menu they used to pause it.
  const act = (run: () => void) => (): void => {
    run()
    setOpen(false)
  }

  return (
    <>
      {/* The strip. Transparent and exactly tall enough for the trigger, so
          it reads as the activity starting just below rather than as a bar
          across the top — but it is real layout, which is the whole point:
          nothing below it is ever painted over. */}
      <div className="flex h-9 shrink-0 items-center justify-end pr-2 pt-[env(safe-area-inset-top)]">
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

      <Sheet open={open} onOpenChange={setOpen}>
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

          {/* Session transport. Full-width rows rather than the desktop's
              inline button cluster — a thumb needs the whole width and 44px
              of height, and there is room for it here in a way there was
              never room for it in a resident band. */}
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

          {/* The dashboard header's own contents, which this route does not
              render at this width. Kept visibly subordinate to the transport
              above: on this screen they are the rare case. */}
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <ThemeSwitcher />
            <AudioIndicator />
          </div>

          <AmbientIntentStatus state={migrationSignal} className="mt-3" />
        </SheetContent>
      </Sheet>
    </>
  )
}
