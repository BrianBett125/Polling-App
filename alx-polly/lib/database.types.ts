// Database types for Supabase. Hand-maintained to match supabase/migrations.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      polls: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      poll_options: {
        Row: {
          id: string;
          poll_id: string;
          text: string;
          votes: number;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          poll_id: string;
          text: string;
          votes?: number;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          poll_id?: string;
          text?: string;
          votes?: number;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'poll_options_poll_id_fkey';
            columns: ['poll_id'];
            isOneToOne: false;
            referencedRelation: 'polls';
            referencedColumns: ['id'];
          },
        ];
      };
      votes: {
        Row: {
          id: string;
          poll_id: string;
          option_id: string;
          user_id: string | null;
          ip_address: string | null;
          voter_token: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          poll_id: string;
          option_id: string;
          user_id?: string | null;
          ip_address?: string | null;
          voter_token?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          poll_id?: string;
          option_id?: string;
          user_id?: string | null;
          ip_address?: string | null;
          voter_token?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      polls_with_totals: {
        Row: {
          id: string;
          title: string;
          created_by: string | null;
          created_at: string;
          total_votes: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      /** Server-only (service role). Errors carry codes VT001..VT004, see lib/vote-errors.ts. */
      cast_vote: {
        Args: {
          p_poll_id: string;
          p_option_id: string;
          p_voter_token: string;
          p_user_id?: string | null;
        };
        Returns: string;
      };
      /** Signed-in users only. Errors carry codes VT005..VT007. */
      create_poll_with_options: {
        Args: {
          p_title: string;
          p_description: string | null;
          p_options: string[];
        };
        Returns: string;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
}

// Helper types for common operations
export type Poll = Database['public']['Tables']['polls']['Row'];
export type PollInsert = Database['public']['Tables']['polls']['Insert'];
export type PollUpdate = Database['public']['Tables']['polls']['Update'];

export type PollOption = Database['public']['Tables']['poll_options']['Row'];
export type PollOptionInsert = Database['public']['Tables']['poll_options']['Insert'];
export type PollOptionUpdate = Database['public']['Tables']['poll_options']['Update'];

export type Vote = Database['public']['Tables']['votes']['Row'];
export type VoteInsert = Database['public']['Tables']['votes']['Insert'];

// Type for a poll with its options
export type PollWithOptions = Poll & {
  options: PollOption[];
};
