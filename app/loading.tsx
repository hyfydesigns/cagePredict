import { Skeleton } from '@/components/ui/skeleton'

function FightCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden border border-border/60 bg-gradient-to-b from-surface to-background">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      {/* Fighters row */}
      <div className="grid grid-cols-[1fr,72px,1fr] items-center">
        {/* Fighter 1 */}
        <div className="flex flex-col items-center gap-2 p-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-14" />
        </div>
        {/* Center */}
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-5 w-8" />
          <Skeleton className="h-6 w-6" />
        </div>
        {/* Fighter 2 */}
        <div className="flex flex-col items-center gap-2 p-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
      {/* Bottom bar */}
      <div className="border-t border-border/40 grid grid-cols-2">
        <div className="py-2 flex justify-center">
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="py-2 flex justify-center border-l border-border/40">
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  )
}

function EventSkeleton() {
  return (
    <div className="space-y-4">
      {/* Event header */}
      <div className="rounded-2xl overflow-hidden border border-border/60">
        <Skeleton className="h-32 sm:h-40 w-full rounded-none" />
      </div>
      {/* Section label */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-3.5 w-3.5 rounded-full" />
        <Skeleton className="h-3 w-20" />
        <div className="flex-1 h-px bg-surface-2" />
      </div>
      {/* Fight cards */}
      <div className="space-y-4">
        <FightCardSkeleton />
        <FightCardSkeleton />
        <FightCardSkeleton />
      </div>
    </div>
  )
}

export default function HomeLoading() {
  return (
    <div className="container mx-auto py-8 space-y-12 max-w-3xl">
      {/* Hero skeleton */}
      <div className="text-center space-y-3 py-6">
        <Skeleton className="h-5 w-24 mx-auto rounded-full" />
        <Skeleton className="h-10 w-64 mx-auto" />
        <Skeleton className="h-10 w-48 mx-auto" />
        <Skeleton className="h-10 w-56 mx-auto" />
        <Skeleton className="h-4 w-80 mx-auto" />
      </div>
      {/* Events */}
      <div className="space-y-12">
        <EventSkeleton />
      </div>
    </div>
  )
}
