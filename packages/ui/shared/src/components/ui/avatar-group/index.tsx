import type { ComponentProps, FC } from "react"
import { useMemo, useState } from "react"

import type { AvatarImage } from ".."
import { cn } from "../../../lib/utils"
import type { CSSVarProperties } from "../../../types"
import { AvatarGroupCount } from "../avatar"
import { Button } from "../button"
import { WithAvatar } from "../with-avatar"

export type AvatarGroupProps = {
  avatars: Array<ComponentProps<typeof AvatarImage>>
  className?: string
  avatarSize?: number
  avatarSpacing?: number
  limit?: number
  isExpandable?: boolean
}

const AvatarGroup: FC<AvatarGroupProps> = ({
  className,
  avatarSize = 75,
  avatarSpacing = 30,
  avatars,
  limit = 10,
  isExpandable = false,
}) => {
  const [showMore, setShowMore] = useState(false)

  const renderAvatars = useMemo(
    () => avatars.slice(0, showMore ? avatars.length : limit),
    [showMore, avatars, limit]
  )

  // `--avatar-size` is set here as well as per-avatar by WithAvatar, so the
  // overflow chip inherits the group's diameter rather than guessing one.
  const groupStyle: CSSVarProperties = {
    "--avatar-spacing": avatarSpacing,
    "--avatar-size": avatarSize,
  }

  const overflow = avatars.length - limit

  return (
    <div
      style={groupStyle}
      className={cn(
        "flex items-center rtl:space-x-reverse",
        "-space-x-[calc(var(--avatar-spacing)*1px)]",
        className
      )}
    >
      {renderAvatars.map((avatar) => (
        <WithAvatar
          key={avatar.src ?? avatar.alt}
          avatarSize={avatarSize}
          avatar={avatar}
        />
      ))}

      {/*
        The chip is interactive only when it does something. It used to be a
        Button unconditionally, with `onClick={undefined}` in the collapsed
        case — a focus stop that swallowed a tab press and then did nothing.
      */}
      {overflow > 0 &&
        (isExpandable ? (
          <Button
            type="button"
            variant="ghost"
            onClick={(): void => setShowMore((prev) => !prev)}
            aria-expanded={showMore}
            aria-label={
              showMore
                ? `Collapse to the first ${limit}`
                : `Show ${overflow} more`
            }
            className="size-auto shrink-0 rounded-full p-0 hover:bg-transparent"
          >
            <AvatarGroupCount>{`${showMore ? "−" : "+"}${overflow}`}</AvatarGroupCount>
          </Button>
        ) : (
          <AvatarGroupCount>{`+${overflow}`}</AvatarGroupCount>
        ))}
    </div>
  )
}

export default AvatarGroup
