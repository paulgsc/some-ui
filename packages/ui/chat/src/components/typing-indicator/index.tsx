const TypingIndicator = (): React.JSX.Element => {
  return (
    <div className="flex items-center space-x-1">
      <div
        className="size-2 animate-bounce rounded-full bg-gray-400"
        style={{ animationDelay: "0ms" }}
      ></div>
      <div
        className="size-2 animate-bounce rounded-full bg-gray-400"
        style={{ animationDelay: "150ms" }}
      ></div>
      <div
        className="size-2 animate-bounce rounded-full bg-gray-400"
        style={{ animationDelay: "300ms" }}
      ></div>
    </div>
  )
}

export default TypingIndicator
