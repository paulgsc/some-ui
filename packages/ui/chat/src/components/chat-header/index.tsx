import type { ChangeEvent, FC, JSX } from "react"
import type { AvatarGroupProps } from "@some-ui/shared"
import {
  AvatarGroup,
  Button,
  CardHeader,
  OverlayInput,
  SvgIcons,
} from "@some-ui/shared"
import { cn, useLocalStorage } from "some-ui-utils"

type ChatHeaderProps = {
  characters: AvatarGroupProps["avatars"]
  height?: number
  title?: string
}

export const ChatHeader: FC<ChatHeaderProps> = ({
  characters,
  height,
  title = "Change me...",
}): JSX.Element => {
  const RefreshIcon = SvgIcons.refresh
  const { value: chatbotTitle, setValue: updateTitle } = useLocalStorage(
    "chatbot",
    title
  )
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    updateTitle(e.target.value)
  }
  return (
    <CardHeader
      style={{
        "--chat-header-height": `${height ?? 0}px`,
      }}
      className={cn(
        "flex flex-row items-center justify-between gap-1.5 rounded-t-xl bg-blue-600 p-2.5",
        {
          "h-[var(--chat-header-height)]": height !== undefined,
        }
      )}
    >
      <AvatarGroup avatarSize={30} avatarSpacing={10} avatars={characters} />
      <h1 className="relative w-full flex-grow truncate text-[clamp(1rem,5vw,2.5rem)] font-semibold leading-tight text-white">
        <span>{chatbotTitle}</span>
        <OverlayInput
          className="focus:backdrop-blur-none"
          value={chatbotTitle}
          onChange={handleInputChange}
        />
      </h1>
      <Button
        variant="ghost"
        className="size-fit shrink scale-90 p-0.5 hover:scale-100 hover:bg-inherit"
      >
        <RefreshIcon className="text-muted/60 hover:text-muted size-4" />
      </Button>
    </CardHeader>
  )
}
