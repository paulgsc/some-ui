const TypingIndicator = (): React.JSX.Element => {
  return (
    <div className="flex items-center space-x-1">
      <div
        className="size-2 animate-bounce rounded-full bg-muted-foreground"
        style={{ animationDelay: "0ms" }}
      />
      <div
        className="size-2 animate-bounce rounded-full bg-muted-foreground"
        style={{ animationDelay: "150ms" }}
      />
      <div
        className="size-2 animate-bounce rounded-full bg-muted-foreground"
        style={{ animationDelay: "300ms" }}
      />
    </div>
  )
}

export default TypingIndicator
