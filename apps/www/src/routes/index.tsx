import { createFileRoute } from "@tanstack/react-router"
import { ClueCard } from "some-ui-input"

import "some-ui-input/style.css"

export const Route = createFileRoute("/")({
  component: App,
})

const App = () => {
  const args = {
    isActive: true,
    thumbnail:
      "https://dramanice.cyou/wp-content/uploads/2025/04/Duo-Tian-Que-2025-220x220.jpg",
    className: "size-full max-w-md",
    clue: "This should be a very long clue, how is it rendered? Let use see. Adding some more words to make it longer.",
    clueNum: 12,
  }
  return <ClueCard {...args} />
}
