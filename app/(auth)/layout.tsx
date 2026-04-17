export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#080808] relative">
      <div className="absolute inset-0 bg-hero-gradient opacity-60 pointer-events-none" />
      <div className="w-full max-w-md relative z-10">
        {children}
      </div>
    </div>
  )
}
