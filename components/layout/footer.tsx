import Link from 'next/link'

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-zinc-800/60 bg-[#080808] mt-16">
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          {/* Brand */}
          <div className="space-y-1.5">
            <Link href="/" className="flex items-center gap-2 group w-fit">
              <img
                src="/logo.svg"
                alt="CagePredict"
                className="h-7 w-7 drop-shadow-[0_0_6px_rgba(239,68,68,0.4)]"
              />
              <span className="text-base font-black tracking-tight text-white">
                Cage<span className="text-primary">Predict</span>
              </span>
            </Link>
            <p className="text-zinc-600 text-xs pl-0.5">
              Free-to-play UFC predictions. No real money, just bragging rights.
            </p>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500">
            <Link href="/help"    className="hover:text-zinc-300 transition-colors">Help</Link>
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
            <Link href="/terms"   className="hover:text-zinc-300 transition-colors">Terms</Link>
          </nav>
        </div>

        {/* Bottom row */}
        <div className="mt-8 pt-6 border-t border-zinc-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-zinc-600">
          <p>© {year} CagePredict. All rights reserved.</p>
          <p className="text-zinc-700">
            Not affiliated with the UFC or Zuffa LLC.
          </p>
        </div>
      </div>
    </footer>
  )
}
