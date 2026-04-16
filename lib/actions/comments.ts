'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { CommentWithProfile } from '@/types/database'

type ActionResult = { error?: string; success?: boolean }

export async function addComment(fightId: string, content: string): Promise<ActionResult> {
  const trimmed = content.trim()
  if (!trimmed) return { error: 'Comment cannot be empty' }
  if (trimmed.length > 280) return { error: 'Max 280 characters' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sign in to comment' }

  const { error } = await supabase
    .from('comments')
    .insert({ fight_id: fightId, user_id: user.id, content: trimmed })

  if (error) return { error: error.message }
  revalidatePath('/')
  return { success: true }
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/')
  return { success: true }
}

export async function getCommentsForFight(fightId: string): Promise<CommentWithProfile[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('comments')
    .select('*, profile:profiles!comments_user_id_fkey(*)')
    .eq('fight_id', fightId)
    .order('created_at', { ascending: true })
    .limit(100)
  return (data ?? []) as unknown as CommentWithProfile[]
}
