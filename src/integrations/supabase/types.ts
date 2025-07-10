export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
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
          location: string | null
          outgoing_qty: number | null
          product_category: string | null
          product_id: number | null
          product_name: string | null
          quantity_available: number | null
          quantity_on_hand: number | null
          reorder_max: number | null
          reorder_min: number | null
          virtual_available: number | null
        }
        Insert: {
          cost?: number | null
          id: string
          incoming_qty?: number | null
          location?: string | null
          outgoing_qty?: number | null
          product_category?: string | null
          product_id?: number | null
          product_name?: string | null
          quantity_available?: number | null
          quantity_on_hand?: number | null
          reorder_max?: number | null
          reorder_min?: number | null
          virtual_available?: number | null
        }
        Update: {
          cost?: number | null
          id?: string
          incoming_qty?: number | null
          location?: string | null
          outgoing_qty?: number | null
          product_category?: string | null
          product_id?: number | null
          product_name?: string | null
          quantity_available?: number | null
          quantity_on_hand?: number | null
          reorder_max?: number | null
          reorder_min?: number | null
          virtual_available?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_inventory_product"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
      products: {
        Row: {
          active: boolean | null
          category_id: number | null
          created_at: string | null
          default_code: string | null
          id: number
          name: string
          product_category: string | null
          sub_category: string | null
          type: string | null
          uom: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          category_id?: number | null
          created_at?: string | null
          default_code?: string | null
          id: number
          name: string
          product_category?: string | null
          sub_category?: string | null
          type?: string | null
          uom?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          category_id?: number | null
          created_at?: string | null
          default_code?: string | null
          id?: number
          name?: string
          product_category?: string | null
          sub_category?: string | null
          type?: string | null
          uom?: string | null
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
      purchase_holds: {
        Row: {
          created_at: string | null
          held_until: string
          id: string
          purchase_id: string
        }
        Insert: {
          created_at?: string | null
          held_until: string
          id?: string
          purchase_id: string
        }
        Update: {
          created_at?: string | null
          held_until?: string
          id?: string
          purchase_id?: string
        }
        Relationships: []
      }
      purchase_lines: {
        Row: {
          created_at: string | null
          id: string
          price_unit: number
          product_category: string | null
          product_name: string
          purchase_id: string | null
          qty_ordered: number
          qty_received: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          price_unit?: number
          product_category?: string | null
          product_name: string
          purchase_id?: string | null
          qty_ordered?: number
          qty_received?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          price_unit?: number
          product_category?: string | null
          product_name?: string
          purchase_id?: string | null
          qty_ordered?: number
          qty_received?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_lines_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          amount_total: number | null
          date_order: string | null
          expected_date: string | null
          id: string
          name: string | null
          order_lines: Json | null
          partner_name: string | null
          pending_qty: number | null
          received_qty: number | null
          state: string | null
        }
        Insert: {
          amount_total?: number | null
          date_order?: string | null
          expected_date?: string | null
          id: string
          name?: string | null
          order_lines?: Json | null
          partner_name?: string | null
          pending_qty?: number | null
          received_qty?: number | null
          state?: string | null
        }
        Update: {
          amount_total?: number | null
          date_order?: string | null
          expected_date?: string | null
          id?: string
          name?: string | null
          order_lines?: Json | null
          partner_name?: string | null
          pending_qty?: number | null
          received_qty?: number | null
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
  public: {
    Enums: {
      order_status: ["pending", "scheduled", "in_progress", "completed"],
      user_role: ["superuser", "planner"],
    },
  },
} as const
