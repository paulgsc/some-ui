export const LoadingState = (): React.JSX.Element => {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-gradient-to-br from-background via-purple-900 to-background flex items-center justify-center">
      <div className="glass-effect rounded-3xl px-12 py-8 text-white text-center">
        <div className="text-2xl font-bold mb-4">Loading WASM...</div>
        <div className="text-white/70">Initializing game core</div>
        <div className="mt-4 flex justify-center">
          <div className="w-8 h-8 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      </div>
    </div>
  )
}
