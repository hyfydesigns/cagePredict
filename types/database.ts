export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ============================================================
// Raw database types (matches Supabase schema exactly)
// ============================================================
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string | null
          avatar_url: string | null
          avatar_emoji: string
          bio: string | null
          total_points: number
          total_picks: number
          correct_picks: number
          current_streak: number
          longest_streak: number
          favorite_fighter: string | null
          onboarding_complete: boolean
          email_notifications: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          display_name?: string | null
          avatar_url?: string | null
          avatar_emoji?: string
          bio?: string | null
          total_points?: number
          total_picks?: number
          correct_picks?: number
          current_streak?: number
          longest_streak?: number
          favorite_fighter?: string | null
          onboarding_complete?: boolean
          email_notifications?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      fighters: {
        Row: {
          id: string
          name: string
          nickname: string | null
          image_url: string | null
          nationality: string | null
          flag_emoji: string | null
          record: string
          wins: number
          losses: number
          draws: number
          height_cm: number | null
          reach_cm: number | null
          weight_class: string
          age: number | null
          striking_accuracy: number | null
          td_avg: number | null
          sub_avg: number | null
          sig_str_landed: number | null
          fighting_style: string | null
          last_5_form: string | null
          ko_tko_wins: number | null
          sub_wins: number | null
          dec_wins: number | null
          analysis: string | null
          x_handle: string | null
          instagram_handle: string | null
          ufc_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          nickname?: string | null
          image_url?: string | null
          nationality?: string | null
          flag_emoji?: string | null
          record?: string
          wins?: number
          losses?: number
          draws?: number
          height_cm?: number | null
          reach_cm?: number | null
          weight_class: string
          age?: number | null
          striking_accuracy?: number | null
          td_avg?: number | null
          sub_avg?: number | null
          sig_str_landed?: number | null
          fighting_style?: string | null
          last_5_form?: string | null
          ko_tko_wins?: number | null
          sub_wins?: number | null
          dec_wins?: number | null
          analysis?: string | null
          x_handle?: string | null
          instagram_handle?: string | null
          ufc_url?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['fighters']['Insert']>
      }
      events: {
        Row: {
          id: string
          name: string
          date: string
          location: string | null
          venue: string | null
          image_url: string | null
          status: 'upcoming' | 'live' | 'completed'
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          date: string
          location?: string | null
          venue?: string | null
          image_url?: string | null
          status?: 'upcoming' | 'live' | 'completed'
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['events']['Insert']>
      }
      fights: {
        Row: {
          id: string
          event_id: string
          fighter1_id: string
          fighter2_id: string
          fight_time: string
          status: 'upcoming' | 'live' | 'completed' | 'cancelled'
          winner_id: string | null
          method: string | null
          round: number | null
          time_of_finish: string | null
          odds_f1: number
          odds_f2: number
          odds_f1_open: number | null
          odds_f2_open: number | null
          odds_history: Json | null
          /** Per-bookmaker odds: Record<bookmakerKey, { odds_f1: number; odds_f2: number }> */
          odds_by_book: Json | null
          analysis_f1: string | null
          analysis_f2: string | null
          is_main_event: boolean
          is_title_fight: boolean
          weight_class: string | null
          display_order: number
          fight_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          fighter1_id: string
          fighter2_id: string
          fight_time: string
          status?: 'upcoming' | 'live' | 'completed' | 'cancelled'
          winner_id?: string | null
          method?: string | null
          round?: number | null
          time_of_finish?: string | null
          odds_f1: number
          odds_f2: number
          odds_f1_open?: number | null
          odds_f2_open?: number | null
          odds_history?: Json | null
          odds_by_book?: Json | null
          analysis_f1?: string | null
          analysis_f2?: string | null
          is_main_event?: boolean
          is_title_fight?: boolean
          weight_class?: string | null
          display_order?: number
          fight_type?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['fights']['Insert']>
      }
      predictions: {
        Row: {
          id: string
          user_id: string
          fight_id: string
          predicted_winner_id: string
          is_correct: boolean | null
          points_earned: number
          confidence: number
          is_confidence: boolean
          predicted_method: string | null
          predicted_round: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          fight_id: string
          predicted_winner_id: string
          is_correct?: boolean | null
          points_earned?: number
          confidence?: number
          is_confidence?: boolean
          predicted_method?: string | null
          predicted_round?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['predictions']['Insert']>
      }
      badge_definitions: {
        Row: { id: string; name: string; description: string; icon: string; created_at: string }
        Insert: { id: string; name: string; description: string; icon: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['badge_definitions']['Insert']>
      }
      user_badges: {
        Row: {
          id: string; user_id: string; badge_id: string; awarded_at: string
          context_fight_id: string | null; context_event_id: string | null
        }
        Insert: {
          id?: string; user_id: string; badge_id: string; awarded_at?: string
          context_fight_id?: string | null; context_event_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['user_badges']['Insert']>
      }
      comments: {
        Row: {
          id: string; fight_id: string; user_id: string
          content: string; created_at: string
        }
        Insert: {
          id?: string; fight_id: string; user_id: string
          content: string; created_at?: string
        }
        Update: Partial<Database['public']['Tables']['comments']['Insert']>
      }
      friends: {
        Row: {
          id: string
          user_id: string
          friend_id: string
          status: 'pending' | 'accepted' | 'rejected'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          friend_id: string
          status?: 'pending' | 'accepted' | 'rejected'
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['friends']['Insert']>
      }
      crews: {
        Row: {
          id: string
          name: string
          description: string | null
          owner_id: string
          invite_code: string
          max_members: number
          image_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          owner_id: string
          invite_code?: string
          max_members?: number
          image_url?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['crews']['Insert']>
      }
      crew_members: {
        Row: {
          id: string
          crew_id: string
          user_id: string
          joined_at: string
        }
        Insert: {
          id?: string
          crew_id: string
          user_id: string
          joined_at?: string
        }
        Update: Partial<Database['public']['Tables']['crew_members']['Insert']>
      }
      crew_invites: {
        Row: {
          id: string
          crew_id: string
          invited_by: string
          invited_user: string
          status: 'pending' | 'accepted' | 'declined'
          created_at: string
        }
        Insert: {
          id?: string
          crew_id: string
          invited_by: string
          invited_user: string
          status?: 'pending' | 'accepted' | 'declined'
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['crew_invites']['Insert']>
      }
    }
    Functions: {
      complete_fight: {
        Args: {
          p_fight_id: string
          p_winner_id: string
          p_method?: string
          p_round?: number
          p_time?: string
        }
        Returns: void
      }
    }
    // Required by @supabase/supabase-js GenericSchema
    Views: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// ============================================================
// Convenience row types
// ============================================================
export type ProfileRow          = Database['public']['Tables']['profiles']['Row']
export type FighterRow          = Database['public']['Tables']['fighters']['Row']
export type EventRow            = Database['public']['Tables']['events']['Row']
export type FightRow            = Database['public']['Tables']['fights']['Row']
export type PredictionRow       = Database['public']['Tables']['predictions']['Row']
export type FriendRow           = Database['public']['Tables']['friends']['Row']
export type CrewRow             = Database['public']['Tables']['crews']['Row']
export type CrewMemberRow       = Database['public']['Tables']['crew_members']['Row']
export type CrewInviteRow       = Database['public']['Tables']['crew_invites']['Row']
export type BadgeDefinitionRow  = Database['public']['Tables']['badge_definitions']['Row']
export type UserBadgeRow        = Database['public']['Tables']['user_badges']['Row']

export type UserBadgeWithDefinition = UserBadgeRow & { definition: BadgeDefinitionRow }
export type CommentRow = Database['public']['Tables']['comments']['Row']
export type CommentWithProfile = CommentRow & { profile: ProfileRow }

// ============================================================
// Extended / joined types used in the UI
// ============================================================
export type FightWithDetails = FightRow & {
  fighter1: FighterRow
  fighter2: FighterRow
  event: EventRow
}

export type EventWithFights = EventRow & {
  fights: FightWithDetails[]
}

export type PredictionWithFight = PredictionRow & {
  fight: FightWithDetails
}

export type LeaderboardEntry = ProfileRow & {
  rank: number
  win_rate: number
}

export type CrewWithMembers = CrewRow & {
  crew_members: Array<CrewMemberRow & { profile: ProfileRow }>
  member_count: number
}

export type CrewInviteWithDetails = CrewInviteRow & {
  crew: { id: string; name: string; owner_id: string }
  inviter: { username: string; avatar_emoji: string }
}

export type FriendWithProfile = FriendRow & {
  profile: ProfileRow
}

export type ProfileWithStats = ProfileRow & {
  win_rate: number
  rank?: number
}

// ============================================================
// UI-only types
// ============================================================
export type AvatarOption = {
  emoji: string
  label: string
}

export type WeightClass =
  | 'Strawweight'
  | 'Flyweight'
  | 'Bantamweight'
  | 'Featherweight'
  | 'Lightweight'
  | 'Welterweight'
  | 'Middleweight'
  | 'Light Heavyweight'
  | 'Heavyweight'
  | "Women's Strawweight"
  | "Women's Flyweight"
  | "Women's Bantamweight"
  | "Women's Featherweight"
