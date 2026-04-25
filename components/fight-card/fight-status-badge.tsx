import { Badge } from '@/components/ui/badge'
import { Radio, Clock, CheckCircle2 } from 'lucide-react'

interface FightStatusBadgeProps {
  status: 'upcoming' | 'live' | 'completed' | 'cancelled'
}

export function FightStatusBadge({ status }: FightStatusBadgeProps) {
  if (status === 'live') {
    return (
      <Badge variant="live" className="gap-1">
        <Radio className="h-3 w-3" />
        LIVE
      </Badge>
    )
  }
  if (status === 'completed') {
    return (
      <Badge variant="outline" className="gap-1 border-border text-foreground-secondary">
        <CheckCircle2 className="h-3 w-3" />
        Final
      </Badge>
    )
  }
  if (status === 'cancelled') {
    return (
      <Badge variant="destructive" className="gap-1">
        Cancelled
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 border-border text-foreground-secondary">
      <Clock className="h-3 w-3" />
      Upcoming
    </Badge>
  )
}
