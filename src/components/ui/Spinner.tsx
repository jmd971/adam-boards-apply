interface SpinnerProps { size?: number }

export function Spinner({ size = 32 }: SpinnerProps) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full border-2 border-white/10 border-t-brand-blue animate-spin"
    />
  )
}
