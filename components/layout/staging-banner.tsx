export function StagingBanner() {
  if (process.env.NEXT_PUBLIC_ENV !== 'staging') return null

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500 text-black text-center text-xs font-black py-1.5 tracking-widest uppercase">
      ⚠ Staging Environment — Not Production
    </div>
  )
}
