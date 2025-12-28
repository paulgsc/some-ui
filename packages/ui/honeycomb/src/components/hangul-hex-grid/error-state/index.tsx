type ErrorStateProps = {
  error?: string | null
}

export const ErrorState = ({ error }: ErrorStateProps): React.JSX.Element => {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="glass-effect rounded-3xl px-12 py-8 text-white text-center max-w-md">
        <div className="text-2xl font-bold mb-4 text-red-400">⚠️ Error</div>
        <div className="text-white/70 mb-4">
          {error || "Failed to initialize game"}
        </div>
        <div className="text-sm text-white/50">
          Make sure the WASM module is built and available.
        </div>
      </div>
    </div>
  )
}
