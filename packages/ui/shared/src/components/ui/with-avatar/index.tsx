import type { ComponentProps, CSSProperties, FC } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@shared/components/ui"
import { cn } from "@shared/lib/utils"
import { getAcronymFromString } from "some-ui-utils"

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
