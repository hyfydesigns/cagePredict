import { Skeleton } from '@/components/ui/skeleton'

export default function EventLoading() {
  return (
    <div className="container mx-auto py-8 max-w-3xl space-y-8">
      {/* Hero */}
      <Skeleton className="h-48 sm:h-64 w-full rounded-2xl" />
      {/* Main event callout */}
      <Skeleton className="h-28 w-full rounded-2xl" />
      {/* Fight rows */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
