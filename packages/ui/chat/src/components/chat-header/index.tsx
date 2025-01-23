import type { ChangeEvent, FC } from "react"
import type { AvatarGroupProps } from "some-ui-shared"
import {
  AvatarGroup,
  Button,
  CardHeader,
  CardTitle,
  OverlayInput,
  SvgIcons,
} from "some-ui-shared"
import { useLocalStorage } from "some-ui-utils"

type ChatHeaderProps = {
  characters: AvatarGroupProps["avatars"]
}

const ChatHeader: FC<ChatHeaderProps> = ({ characters }): React.JSX.Element => {
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
    <CardHeader className="flex flex-row items-center justify-between gap-1.5 rounded-t-xl bg-blue-600">
      <AvatarGroup avatars={characters} />
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
        <RefreshIcon className="size-4 text-muted/60 hover:text-muted" />
      </Button>
    </CardHeader>
  )
}

export default ChatHeader
