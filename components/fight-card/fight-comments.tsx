'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Send, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { addComment, deleteComment } from '@/lib/actions/comments'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import type { CommentWithProfile } from '@/types/database'

interface FightCommentsProps {
  fightId: string
  initialComments: CommentWithProfile[]
  currentUserId?: string
}

export function FightComments({ fightId, initialComments, currentUserId }: FightCommentsProps) {
  const [comments, setComments] = useState<CommentWithProfile[]>(initialComments)
  const [text, setText] = useState('')
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Real-time subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`comments:${fightId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `fight_id=eq.${fightId}` },
        async (payload) => {
          // Fetch the full comment with profile
          const { data } = await supabase
            .from('comments')
            .select('*, profile:profiles!comments_user_id_fkey(*)')
            .eq('id', payload.new.id)
            .single()
          if (data) setComments((prev) => [...prev, data as unknown as CommentWithProfile])
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comments', filter: `fight_id=eq.${fightId}` },
        (payload) => {
          setComments((prev) => prev.filter((c) => c.id !== payload.old.id))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fightId])

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || isPending) return
    const content = text.trim()
    setText('')
    startTransition(async () => {
      const result = await addComment(fightId, content)
      if (result.error) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
        setText(content) // restore
      }
    })
  }

  function handleDelete(commentId: string) {
    startTransition(async () => {
      // Optimistic remove
      setComments((prev) => prev.filter((c) => c.id !== commentId))
      const result = await deleteComment(commentId)
      if (result.error) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      }
    })
  }

  return (
    <div className="space-y-3">
      {/* Comment list */}
      {comments.length === 0 ? (
        <p className="text-center text-xs text-foreground-muted py-4">
          No trash talk yet — be the first 🗣️
        </p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {comments.map((comment) => {
            const isOwn = comment.user_id === currentUserId
            return (
              <div key={comment.id} className={cn('flex gap-2', isOwn && 'flex-row-reverse')}>
                {/* Avatar */}
                <div className="shrink-0 h-7 w-7 rounded-full bg-surface-2 border border-border flex items-center justify-center text-sm leading-none">
                  {comment.profile?.avatar_emoji ?? '🥊'}
                </div>
                {/* Bubble */}
                <div className={cn(
                  'flex-1 min-w-0 max-w-[80%]',
                  isOwn && 'flex flex-col items-end'
                )}>
                  <div className={cn(
                    'rounded-2xl px-3 py-2 text-sm break-words',
                    isOwn
                      ? 'bg-primary/20 border border-primary/30 text-foreground rounded-tr-sm'
                      : 'bg-surface-2 border border-border text-foreground rounded-tl-sm'
                  )}>
                    {!isOwn && (
                      <p className="text-[10px] font-bold text-foreground-secondary mb-0.5">
                        {comment.profile?.display_name ?? comment.profile?.username}
                      </p>
                    )}
                    {comment.content}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 px-1">
                    <span className="text-[10px] text-foreground-muted">
                      {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                    </span>
                    {isOwn && (
                      <button
                        onClick={() => handleDelete(comment.id)}
                        className="text-[10px] text-foreground-secondary hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      {currentUserId ? (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={280}
            placeholder="Talk your trash… 🥊"
            className="flex-1 min-w-0 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-primary transition-colors"
          />
          <button
            type="submit"
            disabled={!text.trim() || isPending}
            className="shrink-0 rounded-xl bg-primary px-3 py-2 text-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <p className="text-center text-xs text-foreground-muted">
          <a href="/login" className="text-primary hover:underline">Sign in</a> to join the trash talk
        </p>
      )}
    </div>
  )
}
