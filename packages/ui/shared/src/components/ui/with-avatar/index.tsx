import type { ComponentProps, FC } from "react"
import { getAcronymFromString } from "some-ui-utils"

import { cn } from "../../../lib/utils"
import type { CSSVarProperties } from "../../../types"
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
  const avatarStyle: CSSVarProperties = { "--avatar-size": avatarSize }

  return (
    <Avatar
      style={avatarStyle}
      className={cn("size-[calc(var(--avatar-size)*1px)]", className)}
    >
      <AvatarImage className="" src={avatar.src} />
      <AvatarFallback>{getAcronymFromString(avatar.alt ?? "")}</AvatarFallback>
    </Avatar>
  )
}
