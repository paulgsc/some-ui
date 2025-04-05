import type { ChangeEvent, CSSProperties, FC } from "react"
import type { AvatarGroupProps } from "some-ui-shared"
import {
  AvatarGroup,
  Button,
  CardHeader,
  CardTitle,
  OverlayInput,
  SvgIcons,
} from "some-ui-shared"
import { cn, useLocalStorage } from "some-ui-utils"

type ChatHeaderProps = {
  characters: AvatarGroupProps["avatars"]
  height?: number
}

export const ChatHeader: FC<ChatHeaderProps> = ({
  characters,
  height,
}): React.JSX.Element => {
  const RefreshIcon = SvgIcons.refresh
  const initialTitle = "Change me..."
  const { value: chatbotTitle, setValue: updateTitle } = useLocalStorage(
    "chatbot",
    initialTitle
  )
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    updateTitle(e.target.value)
  }
  return (
    <CardHeader
      style={
        {
          "--chat-header-height": `${height ?? 0}px`,
        } as CSSProperties
      }
      className={cn(
        "flex flex-row items-center justify-between gap-1.5 rounded-t-xl bg-blue-600 p-2.5",
        {
          "h-[var(--chat-header-height)]": height !== undefined,
        }
      )}
    >
      <AvatarGroup avatarSize={30} avatarSpacing={10} avatars={characters} />
      <CardTitle className="relative flex-1 pb-2 ps-1 text-2xl text-white ">
        <span>{chatbotTitle}</span>
        <OverlayInput
          className="focus:backdrop-blur-none"
          value={chatbotTitle}
          onChange={handleInputChange}
        />
      </CardTitle>
      <Button
        variant="ghost"
        className="scale-90 hover:scale-100 hover:bg-inherit"
      >
        <RefreshIcon className="text-muted/60 hover:text-muted size-4" />
      </Button>
    </CardHeader>
  )
}
