import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="container mx-auto py-8 max-w-2xl space-y-6">
      {/* Profile header */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <Skeleton className="h-20 w-20 rounded-full shrink-0" />
          <div className="flex-1 space-y-2 w-full">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-24" />
            <div className="flex gap-2 mt-3">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>
        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-3 mt-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl bg-zinc-800/60 border border-zinc-700/40 p-3 text-center space-y-2">
              <Skeleton className="h-4 w-4 mx-auto rounded-full" />
              <Skeleton className="h-6 w-10 mx-auto" />
              <Skeleton className="h-2.5 w-12 mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* Badge shelf */}
      <div className="flex gap-2">
        {[...Array(7)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-10 rounded-xl" />
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center space-y-2">
            <Skeleton className="h-5 w-5 mx-auto rounded-full" />
            <Skeleton className="h-3 w-16 mx-auto" />
            <Skeleton className="h-2.5 w-12 mx-auto" />
          </div>
        ))}
      </div>

      {/* Recent predictions label */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-20" />
      </div>

      {/* Prediction rows */}
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
