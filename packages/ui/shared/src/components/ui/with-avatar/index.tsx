import type { ComponentProps, CSSProperties, FC } from "react"
import { getAcronymFromString } from "some-ui-utils"

import { cn } from "../../../lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "../avatar"

export type AvatarOptions = ComponentProps<typeof AvatarImage>

type WithAvatarProps = {
  avatar: AvatarOptions
  className?: string
  avatarSize?: number
}

export const WithAvatar: FC<WithAvatarProps> = ({
  className,
  avatarSize = 75,
  avatar,
}) => {
  return (
    <Avatar
      style={{ "--avatar-size": avatarSize } as CSSProperties}
      className={cn("size-[calc(var(--avatar-size)*1px)]", className)}
    >
      <AvatarImage className="" src={avatar.src} />
      <AvatarFallback>{getAcronymFromString(avatar.alt ?? "")}</AvatarFallback>
    </Avatar>
  )
}
