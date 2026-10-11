// Database types for Supabase. Hand-maintained to match supabase/migrations.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ResultsVisibility = 'always' | 'after_close';

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
          closes_at: string | null;
          closed_at: string | null;
          require_login: boolean;
          results_visibility: ResultsVisibility;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          closes_at?: string | null;
          closed_at?: string | null;
          require_login?: boolean;
          results_visibility?: ResultsVisibility;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          closes_at?: string | null;
          closed_at?: string | null;
          require_login?: boolean;
          results_visibility?: ResultsVisibility;
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
          closes_at: string | null;
          closed_at: string | null;
          require_login: boolean;
        };
        Relationships: [];
      };
    };
    Functions: {
      /** Server-only (service role). Errors carry codes VT001..VT004, VT009, VT010, see lib/vote-errors.ts. */
      cast_vote: {
        Args: {
          p_poll_id: string;
          p_option_id: string;
          p_voter_token: string;
          p_user_id?: string | null;
        };
        Returns: string;
      };
      /** Signed-in users only. Errors carry codes VT005..VT007 and VT012. */
      create_poll_with_options: {
        Args: {
          p_title: string;
          p_description: string | null;
          p_options: string[];
          p_closes_at?: string | null;
          p_require_login?: boolean;
          p_results_visibility?: ResultsVisibility;
        };
        Returns: string;
      };
      /** Anyone with the link. Returns null for an unknown poll. See lib/poll-view.ts for the shape. */
      get_poll: {
        Args: { p_poll_id: string };
        Returns: Json;
      };
      /** Owner only, and only while the poll has no votes. Errors VT005, VT007, VT008, VT011. */
      replace_poll_options: {
        Args: { p_poll_id: string; p_options: string[] };
        Returns: undefined;
      };
      /** Server-only (service role). True while within the limit. */
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
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
