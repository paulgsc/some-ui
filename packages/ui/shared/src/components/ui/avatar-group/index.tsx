import type { ComponentProps, CSSProperties, FC } from "react"
import { useMemo, useState } from "react"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
} from "@shared/components/ui"
import { cn } from "@shared/lib/utils"
import { getAcronymFromString } from "some-ui-utils"

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
  isExpandable = true,
}) => {
  const [showMore, setShowMore] = useState(false)

  const renderAvatars = useMemo(
    () => avatars.slice(0, showMore ? avatars.length : limit),
    [showMore, avatars, limit]
  )

  return (
    <div
      style={{ "--avatar-spacing": avatarSpacing } as CSSProperties}
      className={cn(
        "flex items-center rtl:space-x-reverse",
        "-space-x-[calc(var(--avatar-spacing)*1px)]",
        className
      )}
    >
      {renderAvatars.map((avatar, index) => (
        <Avatar
          style={{ "--avatar-size": avatarSize } as CSSProperties}
          key={index}
          className="size-[calc(var(--avatar-size)*1px)]"
        >
          <AvatarImage className="" src={avatar.src} />
          <AvatarFallback>
            {getAcronymFromString(avatar.alt ?? "")}
          </AvatarFallback>
        </Avatar>
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
