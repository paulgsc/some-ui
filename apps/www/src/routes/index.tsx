import { createFileRoute } from "@tanstack/react-router"
import { RotatingNeonSign } from "some-ui-slideshow"

export const Route = createFileRoute("/")({
  component: App,
})

const App = () => {
  const args = {
    className: "w-full max-w-xl h-32",
    faceClassName: "bg-sky-200",
    perspective: 1250,
    dof: "X-axis",
  }
  return <RotatingNeonSign {...args} />
}
