import type { ComponentProps, FC } from "react"
import { useMemo, useState } from "react"

import type { AvatarImage } from ".."
import { cn } from "../../../lib/utils"
import type { CSSVarProperties } from "../../../types"
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

  const groupStyle: CSSVarProperties = { "--avatar-spacing": avatarSpacing }

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

      {avatars.length > limit && (
        <Button
          onClick={
            isExpandable ? (): void => setShowMore((prev) => !prev) : undefined
          }
          className="-ml-2 size-8 shrink-0 cursor-pointer first:ml-0"
        >
          <span className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-neutral-100 object-cover text-xs text-neutral-800 dark:border-neutral-950 dark:bg-neutral-900 dark:text-neutral-300">
            {`${showMore ? "-" : "+"}${avatars.length - limit}`}
          </span>
        </Button>
      )}
    </div>
  )
}

export default AvatarGroup
