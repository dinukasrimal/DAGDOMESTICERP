export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      holiday_production_lines: {
        Row: {
          created_at: string
          holiday_id: string
          id: string
          production_line_id: string
        }
        Insert: {
          created_at?: string
          holiday_id: string
          id?: string
          production_line_id: string
        }
        Update: {
          created_at?: string
          holiday_id?: string
          id?: string
          production_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holiday_production_lines_holiday_id_fkey"
            columns: ["holiday_id"]
            isOneToOne: false
            referencedRelation: "holidays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holiday_production_lines_production_line_id_fkey"
            columns: ["production_line_id"]
            isOneToOne: false
            referencedRelation: "production_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string | null
          date: string
          id: string
          is_global: boolean
          name: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          is_global?: boolean
          name: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          is_global?: boolean
          name?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          cost: number | null
          id: string
          incoming_qty: number | null
          outgoing_qty: number | null
          product_category: string | null
          product_name: string | null
          quantity_available: number | null
          quantity_on_hand: number | null
          reorder_min: number | null
        }
        Insert: {
          cost?: number | null
          id: string
          incoming_qty?: number | null
          outgoing_qty?: number | null
          product_category?: string | null
          product_name?: string | null
          quantity_available?: number | null
          quantity_on_hand?: number | null
          reorder_min?: number | null
        }
        Update: {
          cost?: number | null
          id?: string
          incoming_qty?: number | null
          outgoing_qty?: number | null
          product_category?: string | null
          product_name?: string | null
          quantity_available?: number | null
          quantity_on_hand?: number | null
          reorder_min?: number | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_total: number | null
          date_order: string | null
          id: string
          name: string | null
          order_lines: Json | null
          partner_name: string | null
          state: string | null
        }
        Insert: {
          amount_total?: number | null
          date_order?: string | null
          id: string
          name?: string | null
          order_lines?: Json | null
          partner_name?: string | null
          state?: string | null
        }
        Update: {
          amount_total?: number | null
          date_order?: string | null
          id?: string
          name?: string | null
          order_lines?: Json | null
          partner_name?: string | null
          state?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          actual_production: Json | null
          assigned_line_id: string | null
          base_po_number: string | null
          created_at: string | null
          cut_quantity: number
          id: string
          issue_quantity: number
          mo_count: number
          order_quantity: number
          plan_end_date: string | null
          plan_start_date: string | null
          po_number: string
          smv: number
          split_number: number | null
          status: Database["public"]["Enums"]["order_status"] | null
          style_id: string
          updated_at: string | null
        }
        Insert: {
          actual_production?: Json | null
          assigned_line_id?: string | null
          base_po_number?: string | null
          created_at?: string | null
          cut_quantity: number
          id?: string
          issue_quantity: number
          mo_count: number
          order_quantity: number
          plan_end_date?: string | null
          plan_start_date?: string | null
          po_number: string
          smv: number
          split_number?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          style_id: string
          updated_at?: string | null
        }
        Update: {
          actual_production?: Json | null
          assigned_line_id?: string | null
          base_po_number?: string | null
          created_at?: string | null
          cut_quantity?: number
          id?: string
          issue_quantity?: number
          mo_count?: number
          order_quantity?: number
          plan_end_date?: string | null
          plan_start_date?: string | null
          po_number?: string
          smv?: number
          split_number?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          style_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_line_id_fkey"
            columns: ["assigned_line_id"]
            isOneToOne: false
            referencedRelation: "production_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      production_lines: {
        Row: {
          capacity: number
          created_at: string | null
          id: string
          mo_count: number
          name: string
          updated_at: string | null
        }
        Insert: {
          capacity?: number
          created_at?: string | null
          id?: string
          mo_count?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          capacity?: number
          created_at?: string | null
          id?: string
          mo_count?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      purchases: {
        Row: {
          amount_total: number | null
          date_order: string | null
          id: string
          name: string | null
          order_lines: Json | null
          partner_name: string | null
          state: string | null
        }
        Insert: {
          amount_total?: number | null
          date_order?: string | null
          id: string
          name?: string | null
          order_lines?: Json | null
          partner_name?: string | null
          state?: string | null
        }
        Update: {
          amount_total?: number | null
          date_order?: string | null
          id?: string
          name?: string | null
          order_lines?: Json | null
          partner_name?: string | null
          state?: string | null
        }
        Relationships: []
      }
      ramp_up_plans: {
        Row: {
          created_at: string | null
          efficiencies: Json
          final_efficiency: number
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          efficiencies: Json
          final_efficiency?: number
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          efficiencies?: Json
          final_efficiency?: number
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_superuser: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      order_status: "pending" | "scheduled" | "in_progress" | "completed"
      user_role: "superuser" | "planner"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      order_status: ["pending", "scheduled", "in_progress", "completed"],
      user_role: ["superuser", "planner"],
    },
  },
} as const
