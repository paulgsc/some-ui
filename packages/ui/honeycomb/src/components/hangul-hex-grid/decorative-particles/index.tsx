export const DecorativeParticles = (): React.JSX.Element => {
  return (
    <>
      <div
        className="absolute top-32 right-20 w-3 h-3 bg-cyan-400/40 rounded-full blur-sm animate-pulse pointer-events-none"
        style={{ animationDuration: "3s" }}
      />
      <div
        className="absolute bottom-40 right-32 w-2 h-2 bg-purple-400/50 rounded-full blur-sm animate-pulse pointer-events-none"
        style={{ animationDuration: "4s", animationDelay: "1s" }}
      />
      <div
        className="absolute top-1/2 left-20 w-2 h-2 bg-pink-400/40 rounded-full blur-sm animate-pulse pointer-events-none"
        style={{ animationDuration: "5s", animationDelay: "2s" }}
      />
    </>
  )
}
