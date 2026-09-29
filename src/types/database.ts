/**
 * Types de la base Supabase — GÉNÉRÉS, ne pas éditer à la main.
 *
 * Régénérer après toute migration :
 *
 *   npm run db:types
 *
 * Le script remet lui-même cet en-tête et les alias d'enums ; ne pas rediriger `supabase gen types` vers ce fichier à la main, la redirection les perd (et, sous PowerShell, écrit en UTF-16).
 *
 * Toujours régénérer depuis --linked, jamais depuis --local : la pile locale tourne une autre version de PostgREST et omet le bloc __InternalSupabase. Si la migration n'est pas encore poussée, la pousser d'abord.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_deletions: {
        Row: {
          deleted_at: string
          user_id: string
        }
        Insert: {
          deleted_at?: string
          user_id: string
        }
        Update: {
          deleted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      account_memberships: {
        Row: {
          created_at: string
          group_id: string
          id: string
          role: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "budget_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: Database["public"]["Enums"]["activity_action"]
          actor_id: string | null
          actor_name: string | null
          changed_fields: string[]
          group_id: string
          id: string
          new_values: Json | null
          occurred_at: string
          old_values: Json | null
          subject: Database["public"]["Enums"]["activity_subject"]
          subject_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["activity_action"]
          actor_id?: string | null
          actor_name?: string | null
          changed_fields: string[]
          group_id: string
          id?: string
          new_values?: Json | null
          occurred_at?: string
          old_values?: Json | null
          subject: Database["public"]["Enums"]["activity_subject"]
          subject_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["activity_action"]
          actor_id?: string | null
          actor_name?: string | null
          changed_fields?: string[]
          group_id?: string
          id?: string
          new_values?: Json | null
          occurred_at?: string
          old_values?: Json | null
          subject?: Database["public"]["Enums"]["activity_subject"]
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "budget_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      applied_requests: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applied_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_groups: {
        Row: {
          created_at: string
          id: string
          is_personal: boolean
          name: string
          owner_id: string
          period_start_day: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_personal?: boolean
          name: string
          owner_id: string
          period_start_day?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_personal?: boolean
          name?: string
          owner_id?: string
          period_start_day?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          group_id: string
          id: string
          period: Database["public"]["Enums"]["budget_period"]
          updated_at: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          group_id: string
          id?: string
          period?: Database["public"]["Enums"]["budget_period"]
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          group_id?: string
          id?: string
          period?: Database["public"]["Enums"]["budget_period"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "budget_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          group_id: string | null
          icon: string
          id: string
          name: string
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          icon?: string
          id?: string
          name: string
          type?: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          created_at?: string
          group_id?: string | null
          icon?: string
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "categories_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "budget_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          amount: number
          author_name: string | null
          counterparty: string
          created_at: string
          direction: Database["public"]["Enums"]["debt_direction"]
          due_on: string | null
          group_id: string
          id: string
          note: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          author_name?: string | null
          counterparty: string
          created_at?: string
          direction: Database["public"]["Enums"]["debt_direction"]
          due_on?: string | null
          group_id: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          author_name?: string | null
          counterparty?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["debt_direction"]
          due_on?: string | null
          group_id?: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "budget_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      former_members: {
        Row: {
          avatar: string | null
          display_name: string
          group_id: string
          left_at: string
          user_id: string
        }
        Insert: {
          avatar?: string | null
          display_name: string
          group_id: string
          left_at?: string
          user_id: string
        }
        Update: {
          avatar?: string | null
          display_name?: string
          group_id?: string
          left_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "former_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "budget_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invitations: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          group_id: string
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["membership_role"]
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code?: string
          created_at?: string
          created_by: string
          expires_at?: string
          group_id: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["membership_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          group_id?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["membership_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "budget_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invitations_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_attempts: {
        Row: {
          attempted_at: string
          user_id: string
        }
        Insert: {
          attempted_at?: string
          user_id: string
        }
        Update: {
          attempted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_events: {
        Row: {
          event: string
          occurred_on: string
          user_id: string
        }
        Insert: {
          event: string
          occurred_on?: string
          user_id: string
        }
        Update: {
          event?: string
          occurred_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_transactions: {
        Row: {
          amount: number
          anchor_day: number
          author_name: string | null
          category_id: string | null
          created_at: string
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          group_id: string
          id: string
          next_due_on: string
          note: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string | null
          wallet_id: string | null
        }
        Insert: {
          amount: number
          anchor_day: number
          author_name?: string | null
          category_id?: string | null
          created_at?: string
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          group_id: string
          id?: string
          next_due_on: string
          note?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string | null
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          anchor_day?: number
          author_name?: string | null
          category_id?: string | null
          created_at?: string
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          group_id?: string
          id?: string
          next_due_on?: string
          note?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "budget_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          created_at: string
          current_amount: number
          icon: string
          id: string
          name: string
          target_amount: number
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_amount?: number
          icon?: string
          id?: string
          name: string
          target_amount: number
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_amount?: number
          icon?: string
          id?: string
          name?: string
          target_amount?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          author_name: string | null
          category_id: string | null
          created_at: string
          debt_id: string | null
          group_id: string
          id: string
          is_savings: boolean
          note: string | null
          occurred_on: string
          savings_goal_id: string | null
          tags: string[]
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string | null
          wallet_id: string | null
        }
        Insert: {
          amount: number
          author_name?: string | null
          category_id?: string | null
          created_at?: string
          debt_id?: string | null
          group_id: string
          id?: string
          is_savings?: boolean
          note?: string | null
          occurred_on?: string
          savings_goal_id?: string | null
          tags?: string[]
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string | null
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          author_name?: string | null
          category_id?: string | null
          created_at?: string
          debt_id?: string | null
          group_id?: string
          id?: string
          is_savings?: boolean
          note?: string | null
          occurred_on?: string
          savings_goal_id?: string | null
          tags?: string[]
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "budget_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_savings_goal_id_fkey"
            columns: ["savings_goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar: string | null
          created_at: string
          display_name: string
          email: string
          id: string
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          display_name: string
          email: string
          id: string
        }
        Update: {
          avatar?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      wallet_transfers: {
        Row: {
          amount: number
          author_name: string | null
          created_at: string
          fee_transaction_id: string | null
          from_wallet_id: string
          group_id: string
          id: string
          note: string | null
          occurred_on: string
          to_wallet_id: string
          user_id: string | null
        }
        Insert: {
          amount: number
          author_name?: string | null
          created_at?: string
          fee_transaction_id?: string | null
          from_wallet_id: string
          group_id: string
          id?: string
          note?: string | null
          occurred_on: string
          to_wallet_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          author_name?: string | null
          created_at?: string
          fee_transaction_id?: string | null
          from_wallet_id?: string
          group_id?: string
          id?: string
          note?: string | null
          occurred_on?: string
          to_wallet_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transfers_fee_transaction_id_fkey"
            columns: ["fee_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transfers_from_wallet_id_fkey"
            columns: ["from_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transfers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "budget_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transfers_to_wallet_id_fkey"
            columns: ["to_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transfers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          created_at: string
          group_id: string
          id: string
          is_default: boolean
          kind: Database["public"]["Enums"]["wallet_kind"]
          name: string
          opening_balance: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          is_default?: boolean
          kind?: Database["public"]["Enums"]["wallet_kind"]
          name: string
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          is_default?: boolean
          kind?: Database["public"]["Enums"]["wallet_kind"]
          name?: string
          opening_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "budget_groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_to_savings_goal: {
        Args: {
          p_delta: number
          p_goal_id: string
          p_id?: string
          p_occurred_on?: string
          p_wallet_id?: string
        }
        Returns: {
          created_at: string
          current_amount: number
          icon: string
          id: string
          name: string
          target_amount: number
          target_date: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "savings_goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      adjust_budget_amount: {
        Args: { p_budget_id: string; p_delta: number; p_id?: string }
        Returns: {
          amount: number
          category_id: string
          created_at: string
          group_id: string
          id: string
          period: Database["public"]["Enums"]["budget_period"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "budgets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      adjust_wallet_balance: {
        Args: { p_actual: number; p_wallet_id: string }
        Returns: number
      }
      budget_totals: {
        Args: { p_from: string; p_group_id: string; p_to: string }
        Returns: {
          ceiling: number
          remaining: number
          spent: number
        }[]
      }
      category_breakdown: {
        Args: { p_from: string; p_group_id: string; p_to: string }
        Returns: {
          category_id: string
          icon: string
          name: string
          total: number
        }[]
      }
      claim_request: { Args: { p_id: string }; Returns: boolean }
      commerce_category: { Args: { p_group_id: string }; Returns: string }
      commerce_summary: {
        Args: { p_from: string; p_group_id: string; p_to: string }
        Returns: {
          margin: number
          sales: number
          stock: number
          tx_count: number
        }[]
      }
      confirm_recurring: {
        Args: {
          p_amount?: number
          p_due_on: string
          p_id: string
          p_occurred_on?: string
          p_transaction_id: string
          p_wallet_id?: string
        }
        Returns: {
          amount: number
          author_name: string | null
          category_id: string | null
          created_at: string
          debt_id: string | null
          group_id: string
          id: string
          is_savings: boolean
          note: string | null
          occurred_on: string
          savings_goal_id: string | null
          tags: string[]
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string | null
          wallet_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_debt: {
        Args: {
          p_amount: number
          p_counterparty: string
          p_direction: Database["public"]["Enums"]["debt_direction"]
          p_due_on?: string
          p_group_id: string
          p_id: string
          p_note?: string
          p_occurred_on: string
          p_transaction_id: string
          p_wallet_id?: string
        }
        Returns: {
          amount: number
          author_name: string | null
          counterparty: string
          created_at: string
          direction: Database["public"]["Enums"]["debt_direction"]
          due_on: string | null
          group_id: string
          id: string
          note: string | null
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "debts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_shared_group: { Args: { name: string }; Returns: string }
      daily_totals: {
        Args: {
          p_category_id?: string
          p_category_ids?: string[]
          p_from?: string
          p_group_id: string
          p_search?: string
          p_tag?: string
          p_to?: string
          p_type?: Database["public"]["Enums"]["transaction_type"]
          p_wallet_id?: string
        }
        Returns: {
          occurred_on: string
          total: number
          tx_count: number
        }[]
      }
      debts_overview: {
        Args: { p_group_id: string }
        Returns: {
          amount: number
          counterparty: string
          created_at: string
          direction: Database["public"]["Enums"]["debt_direction"]
          due_on: string
          id: string
          note: string
          paid: number
          remaining: number
        }[]
      }
      debts_totals: {
        Args: { p_group_id: string }
        Returns: {
          open_count: number
          owed_to_us: number
          we_owe: number
        }[]
      }
      delete_own_account: { Args: never; Returns: undefined }
      export_my_data: { Args: never; Returns: Json }
      filtered_category_totals: {
        Args: {
          p_category_id?: string
          p_category_ids?: string[]
          p_from?: string
          p_group_id: string
          p_search?: string
          p_tag?: string
          p_to?: string
          p_type?: Database["public"]["Enums"]["transaction_type"]
          p_wallet_id?: string
        }
        Returns: {
          category_id: string
          name: string
          total: number
          tx_count: number
          type: Database["public"]["Enums"]["transaction_type"]
        }[]
      }
      filtered_totals: {
        Args: {
          p_category_id?: string
          p_category_ids?: string[]
          p_from?: string
          p_group_id: string
          p_search?: string
          p_tag?: string
          p_to?: string
          p_type?: Database["public"]["Enums"]["transaction_type"]
          p_wallet_id?: string
        }
        Returns: {
          balance: number
          debts: number
          expense: number
          income: number
          savings: number
          tx_count: number
        }[]
      }
      filtered_transactions: {
        Args: {
          p_category_id?: string
          p_category_ids?: string[]
          p_from?: string
          p_group_id: string
          p_search?: string
          p_tag?: string
          p_to?: string
          p_type?: Database["public"]["Enums"]["transaction_type"]
          p_wallet_id?: string
        }
        Returns: {
          amount: number
          author_name: string | null
          category_id: string | null
          created_at: string
          debt_id: string | null
          group_id: string
          id: string
          is_savings: boolean
          note: string | null
          occurred_on: string
          savings_goal_id: string | null
          tags: string[]
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string | null
          wallet_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      frequent_amounts: {
        Args: {
          p_group_id: string
          p_limit?: number
          p_type: Database["public"]["Enums"]["transaction_type"]
        }
        Returns: {
          amount: number
        }[]
      }
      generate_invitation_code: { Args: never; Returns: string }
      group_overviews: {
        Args: never
        Returns: {
          group_id: string
          member_avatars: string[]
          member_count: number
          member_names: string[]
          monthly_budget: number
          shared_monthly_total: number
        }[]
      }
      is_author_departure: {
        Args: { p_new: Json; p_old: Json }
        Returns: boolean
      }
      is_group_member: { Args: { gid: string }; Returns: boolean }
      is_group_owner: { Args: { gid: string }; Returns: boolean }
      is_group_viewer: { Args: { p_group_id: string }; Returns: boolean }
      join_group_with_code: {
        Args: { invitation_code: string }
        Returns: string
      }
      log_product_event: { Args: { p_event: string }; Returns: undefined }
      next_recurrence: {
        Args: {
          p_anchor_day: number
          p_due_on: string
          p_frequency: Database["public"]["Enums"]["recurrence_frequency"]
        }
        Returns: string
      }
      owned_groups_with_other_members: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      period_summary: {
        Args: { p_from: string; p_group_id: string; p_to: string }
        Returns: {
          balance: number
          debts: number
          expense: number
          income: number
          savings: number
          tx_count: number
        }[]
      }
      purge_expired_data: { Args: never; Returns: undefined }
      record_debt_payment: {
        Args: {
          p_amount: number
          p_debt_id: string
          p_occurred_on: string
          p_transaction_id: string
          p_wallet_id?: string
        }
        Returns: {
          amount: number
          author_name: string | null
          category_id: string | null
          created_at: string
          debt_id: string | null
          group_id: string
          id: string
          is_savings: boolean
          note: string | null
          occurred_on: string
          savings_goal_id: string | null
          tags: string[]
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string | null
          wallet_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      savings_overview: {
        Args: { p_today: string }
        Returns: {
          monthly_effort: number
          total_saved: number
        }[]
      }
      savings_plans: {
        Args: { p_today: string }
        Returns: {
          goal_id: string
          monthly_rhythm: number
        }[]
      }
      set_member_role: {
        Args: {
          p_group_id: string
          p_role: Database["public"]["Enums"]["membership_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      shares_group_with: { Args: { other_user_id: string }; Returns: boolean }
      skip_recurring: {
        Args: { p_due_on: string; p_id: string }
        Returns: undefined
      }
      tags_are_valid: { Args: { p_tags: string[] }; Returns: boolean }
      transaction_tags: {
        Args: { p_group_id: string }
        Returns: {
          tag: string
          uses: number
        }[]
      }
      transfer_between_wallets: {
        Args: {
          p_amount: number
          p_fee?: number
          p_fee_transaction_id: string
          p_from_wallet_id: string
          p_id: string
          p_note?: string
          p_occurred_on: string
          p_to_wallet_id: string
        }
        Returns: {
          amount: number
          author_name: string | null
          created_at: string
          fee_transaction_id: string | null
          from_wallet_id: string
          group_id: string
          id: string
          note: string | null
          occurred_on: string
          to_wallet_id: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "wallet_transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transfer_ownership: {
        Args: { p_group_id: string; p_new_owner: string }
        Returns: undefined
      }
      wallets_overview: {
        Args: { p_group_id: string }
        Returns: {
          balance: number
          id: string
          is_default: boolean
          kind: Database["public"]["Enums"]["wallet_kind"]
          name: string
          opening_balance: number
        }[]
      }
    }
    Enums: {
      activity_action: "update" | "delete" | "insert"
      activity_subject:
        | "transaction"
        | "budget"
        | "debt"
        | "wallet"
        | "transfer"
        | "membership"
      budget_period: "weekly" | "monthly"
      debt_direction: "lent" | "borrowed" | "credit_sale"
      membership_role: "owner" | "member" | "viewer"
      recurrence_frequency: "weekly" | "monthly"
      transaction_type: "expense" | "income"
      wallet_kind: "cash" | "mobile_money" | "bank" | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_action: ["update", "delete", "insert"],
      activity_subject: [
        "transaction",
        "budget",
        "debt",
        "wallet",
        "transfer",
        "membership",
      ],
      budget_period: ["weekly", "monthly"],
      debt_direction: ["lent", "borrowed", "credit_sale"],
      membership_role: ["owner", "member", "viewer"],
      recurrence_frequency: ["weekly", "monthly"],
      transaction_type: ["expense", "income"],
      wallet_kind: ["cash", "mobile_money", "bank", "other"],
    },
  },
} as const

// Alias lisibles pour les enums du schéma, utilisés dans le code applicatif.
export type MembershipRole = Enums<'membership_role'>;
export type TransactionType = Enums<'transaction_type'>;
export type BudgetPeriod = Enums<'budget_period'>;
export type ActivitySubject = Enums<'activity_subject'>;
export type ActivityAction = Enums<'activity_action'>;
export type RecurrenceFrequency = Enums<'recurrence_frequency'>;
export type DebtDirection = Enums<'debt_direction'>;
export type WalletKind = Enums<'wallet_kind'>;
