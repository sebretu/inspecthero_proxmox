export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      buildings: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          id: string
          name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buildings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      floors: {
        Row: {
          building_id: string
          created_at: string
          id: string
          level: number
          name: string
          updated_at: string
        }
        Insert: {
          building_id: string
          created_at?: string
          id?: string
          level: number
          name: string
          updated_at?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          id?: string
          level?: number
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floors_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          floor_id: string
          id: string
          image_height: number | null
          image_path: string | null
          image_width: number | null
          is_current: boolean
          pdf_path: string
          processing_error: string | null
          project_id: string
          status: Database["public"]["Enums"]["plan_status"]
          storage_bucket: string
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          floor_id: string
          id?: string
          image_height?: number | null
          image_path?: string | null
          image_width?: number | null
          is_current?: boolean
          pdf_path: string
          processing_error?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["plan_status"]
          storage_bucket?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          floor_id?: string
          id?: string
          image_height?: number | null
          image_path?: string | null
          image_width?: number | null
          is_current?: boolean
          pdf_path?: string
          processing_error?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["plan_status"]
          storage_bucket?: string
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plans_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          language: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          language?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          language?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          project_id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          project_id: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_archived: boolean
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_task_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_tasks_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          action: string
          changed_by: string
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          task_id: string
        }
        Insert: {
          action: string
          changed_by: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          task_id: string
        }
        Update: {
          action?: string
          changed_by?: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_task_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_tasks_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      task_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          storage_bucket: string
          storage_path: string | null
          task_id: string
          uploaded_by: string
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          storage_bucket?: string
          storage_path?: string | null
          task_id: string
          uploaded_by: string
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          storage_bucket?: string
          storage_path?: string | null
          task_id?: string
          uploaded_by?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_photos_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_photos_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_task_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_photos_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_tasks_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assigned_company_id: string | null
          assigned_user_id: string | null
          created_at: string
          created_by: string
          description: string | null
          done_note: string | null
          done_reported_at: string | null
          done_reported_by: string | null
          due_date: string | null
          id: string
          plan_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          x_norm: number
          y_norm: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_company_id?: string | null
          assigned_user_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          done_note?: string | null
          done_reported_at?: string | null
          done_reported_by?: string | null
          due_date?: string | null
          id?: string
          plan_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          x_norm: number
          y_norm: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_company_id?: string | null
          assigned_user_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          done_note?: string | null
          done_reported_at?: string | null
          done_reported_by?: string | null
          due_date?: string | null
          id?: string
          plan_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          x_norm?: number
          y_norm?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasks_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_company_id_fkey"
            columns: ["assigned_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_done_reported_by_fkey"
            columns: ["done_reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_task_detail: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assigned_company_id: string | null
          assigned_user_id: string | null
          comments_count: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          done_note: string | null
          done_reported_at: string | null
          done_reported_by: string | null
          due_date: string | null
          id: string | null
          last_action: string | null
          last_changed_by: string | null
          last_changed_cols: Json | null
          last_event_at: string | null
          last_from_status: string | null
          last_row_snapshot: Json | null
          last_to_status: string | null
          photos_count: number | null
          plan_id: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          project_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string | null
          updated_at: string | null
          x_norm: number | null
          y_norm: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_history_changed_by_fkey"
            columns: ["last_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_company_id_fkey"
            columns: ["assigned_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_done_reported_by_fkey"
            columns: ["done_reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_task_history: {
        Row: {
          action: string | null
          approved_at: string | null
          approved_by: string | null
          changed_by: string | null
          changed_cols: Json | null
          created_at: string | null
          done_note: string | null
          event_kind: string | null
          from_status: string | null
          id: string | null
          rejection_reason: string | null
          row_snapshot: Json | null
          task_id: string | null
          to_status: string | null
        }
        Insert: {
          action?: string | null
          approved_at?: never
          approved_by?: never
          changed_by?: string | null
          changed_cols?: never
          created_at?: string | null
          done_note?: never
          event_kind?: never
          from_status?: never
          id?: string | null
          rejection_reason?: never
          row_snapshot?: never
          task_id?: string | null
          to_status?: never
        }
        Update: {
          action?: string | null
          approved_at?: never
          approved_by?: never
          changed_by?: string | null
          changed_cols?: never
          created_at?: string | null
          done_note?: never
          event_kind?: never
          from_status?: never
          id?: string | null
          rejection_reason?: never
          row_snapshot?: never
          task_id?: string | null
          to_status?: never
        }
        Relationships: [
          {
            foreignKeyName: "task_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_task_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_tasks_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      v_task_last_event: {
        Row: {
          last_action: string | null
          last_changed_by: string | null
          last_changed_cols: Json | null
          last_event_at: string | null
          last_from_status: string | null
          last_row_snapshot: Json | null
          last_to_status: string | null
          task_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_history_changed_by_fkey"
            columns: ["last_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_task_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_tasks_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tasks_feed: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assigned_company_id: string | null
          assigned_user_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          done_note: string | null
          done_reported_at: string | null
          done_reported_by: string | null
          due_date: string | null
          id: string | null
          last_action: string | null
          last_changed_by: string | null
          last_changed_cols: Json | null
          last_event_at: string | null
          last_from_status: string | null
          last_row_snapshot: Json | null
          last_to_status: string | null
          plan_id: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          project_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string | null
          updated_at: string | null
          x_norm: number | null
          y_norm: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_history_changed_by_fkey"
            columns: ["last_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_company_id_fkey"
            columns: ["assigned_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_done_reported_by_fkey"
            columns: ["done_reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_task_comment: {
        Args: { p_content: string; p_task_id: string }
        Returns: {
          author_id: string
          content: string
          created_at: string
          id: string
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "task_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_task_photo: {
        Args: {
          p_caption?: string
          p_storage_bucket?: string
          p_storage_path?: string
          p_task_id: string
          p_url: string
        }
        Returns: {
          caption: string | null
          created_at: string
          id: string
          storage_bucket: string
          storage_path: string | null
          task_id: string
          uploaded_by: string
          url: string
        }
        SetofOptions: {
          from: "*"
          to: "task_photos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_reset_task_to_open: {
        Args: { p_task_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          assigned_company_id: string | null
          assigned_user_id: string | null
          created_at: string
          created_by: string
          description: string | null
          done_note: string | null
          done_reported_at: string | null
          done_reported_by: string | null
          due_date: string | null
          id: string
          plan_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          x_norm: number
          y_norm: number
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_task: {
        Args: { p_task_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          assigned_company_id: string | null
          assigned_user_id: string | null
          created_at: string
          created_by: string
          description: string | null
          done_note: string | null
          done_reported_at: string | null
          done_reported_by: string | null
          due_date: string | null
          id: string
          plan_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          x_norm: number
          y_norm: number
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_task: {
        Args: {
          p_assigned_company_id?: string
          p_assigned_user_id?: string
          p_description?: string
          p_due_date?: string
          p_plan_id: string
          p_priority?: Database["public"]["Enums"]["task_priority"]
          p_project_id: string
          p_title: string
          p_x_norm: number
          p_y_norm: number
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          assigned_company_id: string | null
          assigned_user_id: string | null
          created_at: string
          created_by: string
          description: string | null
          done_note: string | null
          done_reported_at: string | null
          done_reported_by: string | null
          due_date: string | null
          id: string
          plan_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          x_norm: number
          y_norm: number
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_company_id: { Args: never; Returns: string }
      floor_project_id: { Args: { p_floor_id: string }; Returns: string }
      get_task: {
        Args: { p_task_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          assigned_company_id: string | null
          assigned_user_id: string | null
          comments_count: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          done_note: string | null
          done_reported_at: string | null
          done_reported_by: string | null
          due_date: string | null
          id: string | null
          last_action: string | null
          last_changed_by: string | null
          last_changed_cols: Json | null
          last_event_at: string | null
          last_from_status: string | null
          last_row_snapshot: Json | null
          last_to_status: string | null
          photos_count: number | null
          plan_id: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          project_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string | null
          updated_at: string | null
          x_norm: number | null
          y_norm: number | null
        }
        SetofOptions: {
          from: "*"
          to: "v_task_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_project_admin_or_mod: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      is_project_member: { Args: { p_project_id: string }; Returns: boolean }
      is_task_admin_or_mod: { Args: { p_task_id: string }; Returns: boolean }
      list_task_comments: {
        Args: { p_limit?: number; p_offset?: number; p_task_id: string }
        Returns: {
          author_id: string
          content: string
          created_at: string
          id: string
          task_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "task_comments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_task_history: {
        Args: { p_limit?: number; p_offset?: number; p_task_id: string }
        Returns: {
          action: string | null
          approved_at: string | null
          approved_by: string | null
          changed_by: string | null
          changed_cols: Json | null
          created_at: string | null
          done_note: string | null
          event_kind: string | null
          from_status: string | null
          id: string | null
          rejection_reason: string | null
          row_snapshot: Json | null
          task_id: string | null
          to_status: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "v_task_history"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_task_photos: {
        Args: { p_limit?: number; p_offset?: number; p_task_id: string }
        Returns: {
          caption: string | null
          created_at: string
          id: string
          storage_bucket: string
          storage_path: string | null
          task_id: string
          uploaded_by: string
          url: string
        }[]
        SetofOptions: {
          from: "*"
          to: "task_photos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_tasks: {
        Args: {
          p_assigned_user_id?: string
          p_due_from?: string
          p_due_to?: string
          p_limit?: number
          p_offset?: number
          p_plan_id?: string
          p_project_id: string
          p_q?: string
          p_status?: Database["public"]["Enums"]["task_status"]
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          assigned_company_id: string | null
          assigned_user_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          done_note: string | null
          done_reported_at: string | null
          done_reported_by: string | null
          due_date: string | null
          id: string | null
          last_action: string | null
          last_changed_by: string | null
          last_changed_cols: Json | null
          last_event_at: string | null
          last_from_status: string | null
          last_row_snapshot: Json | null
          last_to_status: string | null
          plan_id: string | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          project_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string | null
          updated_at: string | null
          x_norm: number | null
          y_norm: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "v_tasks_feed"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      plan_project_id: { Args: { p_plan_id: string }; Returns: string }
      reject_task: {
        Args: { p_reason: string; p_task_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          assigned_company_id: string | null
          assigned_user_id: string | null
          created_at: string
          created_by: string
          description: string | null
          done_note: string | null
          done_reported_at: string | null
          done_reported_by: string | null
          due_date: string | null
          id: string
          plan_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          x_norm: number
          y_norm: number
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reopen_task: {
        Args: {
          p_task_id: string
          p_to_status?: Database["public"]["Enums"]["task_status"]
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          assigned_company_id: string | null
          assigned_user_id: string | null
          created_at: string
          created_by: string
          description: string | null
          done_note: string | null
          done_reported_at: string | null
          done_reported_by: string | null
          due_date: string | null
          id: string
          plan_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          x_norm: number
          y_norm: number
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_task: {
        Args: { p_task_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          assigned_company_id: string | null
          assigned_user_id: string | null
          created_at: string
          created_by: string
          description: string | null
          done_note: string | null
          done_reported_at: string | null
          done_reported_by: string | null
          due_date: string | null
          id: string
          plan_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          x_norm: number
          y_norm: number
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_task_done: {
        Args: { p_done_note?: string; p_task_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          assigned_company_id: string | null
          assigned_user_id: string | null
          created_at: string
          created_by: string
          description: string | null
          done_note: string | null
          done_reported_at: string | null
          done_reported_by: string | null
          due_date: string | null
          id: string
          plan_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          x_norm: number
          y_norm: number
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_task: {
        Args: {
          p_assigned_company_id?: string
          p_assigned_user_id?: string
          p_description?: string
          p_due_date?: string
          p_priority?: Database["public"]["Enums"]["task_priority"]
          p_task_id: string
          p_title?: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          assigned_company_id: string | null
          assigned_user_id: string | null
          created_at: string
          created_by: string
          description: string | null
          done_note: string | null
          done_reported_at: string | null
          done_reported_by: string | null
          due_date: string | null
          id: string
          plan_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          x_norm: number
          y_norm: number
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      plan_status: "PROCESSING" | "READY" | "FAILED"
      task_priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      task_status:
        | "OPEN"
        | "IN_PROGRESS"
        | "DONE_WAITING_APPROVAL"
        | "APPROVED"
        | "REJECTED"
      user_role: "ADMIN" | "MODERATOR" | "USER"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      plan_status: ["PROCESSING", "READY", "FAILED"],
      task_priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      task_status: [
        "OPEN",
        "IN_PROGRESS",
        "DONE_WAITING_APPROVAL",
        "APPROVED",
        "REJECTED",
      ],
      user_role: ["ADMIN", "MODERATOR", "USER"],
    },
  },
} as const

