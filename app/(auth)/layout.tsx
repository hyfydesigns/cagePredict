import { Shield } from 'lucide-react'
import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#080808] relative">
      <div className="absolute inset-0 bg-hero-gradient opacity-60 pointer-events-none" />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-[0_0_16px_rgba(239,68,68,0.5)]">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl font-black text-white">
              Cage<span className="text-primary">Predict</span>
            </span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  )
}
