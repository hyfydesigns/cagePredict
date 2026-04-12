import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { Shield, Users, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface Props { params: Promise<{ code: string }> }

export const metadata: Metadata = { title: 'Join Crew — CagePredict' }

export default async function InvitePage({ params }: Props) {
  const { code } = await params
  const supabase = await createClient()

  const { data: crewRaw } = await supabase
    .from('crews')
    .select('id, name, description, invite_code, max_members, crew_members(id)')
    .eq('invite_code', code.toUpperCase())
    .single()

  const crew = crewRaw as {
    id: string; name: string; description: string | null
    invite_code: string; max_members: number
    crew_members: { id: string }[]
  } | null

  if (!crew) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#080808]">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-xl font-bold text-white">Invalid invite link</h1>
          <p className="text-zinc-500 text-sm mt-2 mb-6">
            This crew invite code doesn&apos;t exist or has expired.
          </p>
          <Link href="/"><Button variant="outline">Go Home</Button></Link>
        </div>
      </div>
    )
  }

  const { data: { user } } = await supabase.auth.getUser()
  const memberCount = Array.isArray(crew.crew_members) ? crew.crew_members.length : 0

  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from('crew_members').insert({ crew_id: crew.id, user_id: user.id } as any)
    if (!error || error.code === '23505') {
      redirect(`/crews/${crew.id}`)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#080808]">
      <div className="absolute inset-0 bg-hero-gradient opacity-50 pointer-events-none" />

      <div className="relative w-full max-w-sm space-y-6 text-center">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-[0_0_20px_rgba(239,68,68,0.5)]">
            <Shield className="h-6 w-6 text-white" />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-800 border border-zinc-700 text-3xl mb-4 mx-auto">
            🏆
          </div>
          <h1 className="text-2xl font-black text-white">You&apos;re invited!</h1>
          <p className="text-zinc-400 text-sm mt-1 mb-4">
            Join <span className="text-white font-bold">{crew.name}</span> on CagePredict
          </p>
          {crew.description && (
            <p className="text-zinc-500 text-sm mb-4">{crew.description}</p>
          )}
          <div className="flex items-center justify-center gap-1.5 text-zinc-500 text-sm mb-6">
            <Users className="h-4 w-4" />
            <span>{memberCount} / {crew.max_members} members</span>
          </div>

          <div className="space-y-3">
            <Link href={`/signup?invite=${code}`} className="block">
              <Button className="w-full" size="lg">
                Create Account & Join
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <Link href={`/login?invite=${code}`} className="block">
              <Button variant="outline" className="w-full">Sign In & Join</Button>
            </Link>
          </div>
        </div>

        <p className="text-zinc-600 text-xs">CagePredict is free to play. No credit card needed.</p>
      </div>
    </div>
  )
}
