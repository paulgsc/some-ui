import type { ComponentProps, FC } from "react"
import { useMemo, useState } from "react"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
} from "@shared/components/ui"
import { getAcronymFromString } from "some-ui-utils"

type AvatarGroupProps = {
  avatars: Array<ComponentProps<typeof AvatarImage>>
  limit?: number
  isExpandable?: boolean
}

const AvatarGroup: FC<AvatarGroupProps> = ({
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
    <div className="flex -space-x-3 rtl:space-x-reverse">
      {renderAvatars.map((avatar, index) => (
        <Avatar key={index} className="size-6">
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
