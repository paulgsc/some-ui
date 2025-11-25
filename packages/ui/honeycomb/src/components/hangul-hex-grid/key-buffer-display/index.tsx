type KeyBufferDisplayProps = {
  buffer: string
}

export const KeyBufferDisplay = ({
  buffer,
}: KeyBufferDisplayProps): React.JSX.Element | null => {
  if (!buffer) return null

  return (
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40">
      <div className="glass-effect rounded-xl px-6 py-3 text-white text-2xl font-mono font-bold shadow-2xl">
        {buffer}
      </div>
    </div>
  )
}
