import { Skeleton } from '@/components/ui/skeleton'
import { Trophy } from 'lucide-react'

export default function LeaderboardLoading() {
  return (
    <div className="container mx-auto py-8 max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Trophy className="h-6 w-6 text-amber-400" />
          <h1 className="text-3xl font-black text-foreground">Leaderboard</h1>
        </div>
        <Skeleton className="h-4 w-36 ml-9" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-2 rounded-lg bg-surface-2/60 p-1">
        <Skeleton className="h-8 flex-1 rounded-md" />
        <Skeleton className="h-8 flex-1 rounded-md" />
      </div>

      {/* Table rows */}
      <div className="space-y-1.5">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface/60 px-4 py-3">
            <Skeleton className="h-5 w-6 shrink-0" />
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  )
}
