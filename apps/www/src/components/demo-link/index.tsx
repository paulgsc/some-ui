import type { JSX } from "react"
import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@some-ui/shared"
import { Play } from "lucide-react"

/**
 * A short demo of one artifact (CLAUDE.md, "A way in for every reader"): a
 * chip that opens the video in a dialog. The player is created only once the
 * dialog opens, so a page with demos asks YouTube for nothing until someone
 * wants one.
 */
export const DemoLink = ({
  youtubeId,
  title,
}: {
  youtubeId: string
  title: string
}): JSX.Element => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs"
      >
        <Play aria-hidden className="size-3" />
        Demo
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            A short demo video of {title}.
          </DialogDescription>
          {open && (
            <iframe
              title={`${title}: demo`}
              src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
              className="aspect-[9/16] w-full rounded-lg"
              allow="encrypted-media; picture-in-picture"
              allowFullScreen
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
