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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      auto_sync_logs: {
        Row: {
          created_at: string | null
          cross_project_invoices_synced: number | null
          cross_project_lines_synced: number | null
          details: Json | null
          duration_ms: number | null
          id: string
          internal_movements_created: number | null
          message: string | null
          phases_completed: Json | null
          status: string
          sync_id: string
          total_errors: number | null
        }
        Insert: {
          created_at?: string | null
          cross_project_invoices_synced?: number | null
          cross_project_lines_synced?: number | null
          details?: Json | null
          duration_ms?: number | null
          id?: string
          internal_movements_created?: number | null
          message?: string | null
          phases_completed?: Json | null
          status: string
          sync_id: string
          total_errors?: number | null
        }
        Update: {
          created_at?: string | null
          cross_project_invoices_synced?: number | null
          cross_project_lines_synced?: number | null
          details?: Json | null
          duration_ms?: number | null
          id?: string
          internal_movements_created?: number | null
          message?: string | null
          phases_completed?: Json | null
          status?: string
          sync_id?: string
          total_errors?: number | null
        }
        Relationships: []
      }
      bom_headers: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          is_category_wise: boolean | null
          name: string
          product_id: number | null
          quantity: number
          unit: string
          updated_at: string | null
          version: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          is_category_wise?: boolean | null
          name: string
          product_id?: number | null
          quantity?: number
          unit: string
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          is_category_wise?: boolean | null
          name?: string
          product_id?: number | null
          quantity?: number
          unit?: string
          updated_at?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_headers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_lines: {
        Row: {
          bom_header_id: string | null
          category_id: number | null
          created_at: string | null
          id: string
          notes: string | null
          quantity: number
          raw_material_id: number | null
          sort_order: number | null
          unit: string
          updated_at: string | null
          waste_percentage: number | null
        }
        Insert: {
          bom_header_id?: string | null
          category_id?: number | null
          created_at?: string | null
          id?: string
          notes?: string | null
          quantity: number
          raw_material_id?: number | null
          sort_order?: number | null
          unit: string
          updated_at?: string | null
          waste_percentage?: number | null
        }
        Update: {
          bom_header_id?: string | null
          category_id?: number | null
          created_at?: string | null
          id?: string
          notes?: string | null
          quantity?: number
          raw_material_id?: number | null
          sort_order?: number | null
          unit?: string
          updated_at?: string | null
          waste_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_lines_bom_header_id_fkey"
            columns: ["bom_header_id"]
            isOneToOne: false
            referencedRelation: "bom_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      holiday_line_assignments_main: {
        Row: {
          created_at: string | null
          holiday_id: string
          id: string
          line_id: string
        }
        Insert: {
          created_at?: string | null
          holiday_id: string
          id?: string
          line_id: string
        }
        Update: {
          created_at?: string | null
          holiday_id?: string
          id?: string
          line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holiday_line_assignments_main_holiday_id_fkey"
            columns: ["holiday_id"]
            isOneToOne: false
            referencedRelation: "holidays_main"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holiday_line_assignments_main_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "production_lines_main"
            referencedColumns: ["id"]
          },
        ]
      }
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
      holidays_main: {
        Row: {
          created_at: string | null
          date: string
          id: string
          is_global: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          is_global?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          is_global?: boolean | null
          name?: string
          updated_at?: string | null
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
      line_groups: {
        Row: {
          created_at: string | null
          id: string
          is_expanded: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_expanded?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_expanded?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      line_groups_production: {
        Row: {
          created_at: string | null
          id: string
          is_expanded: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_expanded?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_expanded?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      material_categories: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      material_suppliers: {
        Row: {
          active: boolean | null
          contact_info: string | null
          created_at: string | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          contact_info?: string | null
          created_at?: string | null
          id?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          contact_info?: string | null
          created_at?: string | null
          id?: number
          name?: string
          updated_at?: string | null
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
      planned_orders: {
        Row: {
          created_at: string | null
          id: number
          line_id: string
          order_index: number
          planned_date: string
          planned_quantity: number
          purchase_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          line_id: string
          order_index: number
          planned_date: string
          planned_quantity: number
          purchase_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          line_id?: string
          order_index?: number
          planned_date?: string
          planned_quantity?: number
          purchase_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      planned_orders_main: {
        Row: {
          created_at: string | null
          id: string
          line_id: string
          order_index: number | null
          planned_date: string | null
          planned_quantity: number | null
          po_id: string
          purchase_id: number | null
          quantity: number
          scheduled_date: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          line_id: string
          order_index?: number | null
          planned_date?: string | null
          planned_quantity?: number | null
          po_id: string
          purchase_id?: number | null
          quantity?: number
          scheduled_date: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          line_id?: string
          order_index?: number | null
          planned_date?: string | null
          planned_quantity?: number | null
          po_id?: string
          purchase_id?: number | null
          quantity?: number
          scheduled_date?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planned_orders_main_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "production_lines_main"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_production: {
        Row: {
          actual_quantity: number | null
          created_at: string | null
          id: string
          line_id: string
          order_index: number | null
          planned_date: string
          planned_quantity: number
          purchase_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          actual_quantity?: number | null
          created_at?: string | null
          id?: string
          line_id: string
          order_index?: number | null
          planned_date: string
          planned_quantity: number
          purchase_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_quantity?: number | null
          created_at?: string | null
          id?: string
          line_id?: string
          order_index?: number | null
          planned_date?: string
          planned_quantity?: number
          purchase_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planned_production_line_id_fkey"
            columns: ["line_id"]
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
      production_lines_main: {
        Row: {
          capacity: number
          created_at: string | null
          current_load: number | null
          efficiency: number | null
          group_id: string | null
          id: string
          name: string
          sort_order: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          capacity?: number
          created_at?: string | null
          current_load?: number | null
          efficiency?: number | null
          group_id?: string | null
          id?: string
          name: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          capacity?: number
          created_at?: string | null
          current_load?: number | null
          efficiency?: number | null
          group_id?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_lines_main_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "line_groups_production"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean | null
          category_id: number | null
          colour: string | null
          created_at: string | null
          default_code: string | null
          id: number
          name: string
          product_category: string | null
          size: string | null
          sub_category: string | null
          type: string | null
          uom: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          category_id?: number | null
          colour?: string | null
          created_at?: string | null
          default_code?: string | null
          id: number
          name: string
          product_category?: string | null
          size?: string | null
          sub_category?: string | null
          type?: string | null
          uom?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          category_id?: number | null
          colour?: string | null
          created_at?: string | null
          default_code?: string | null
          id?: number
          name?: string
          product_category?: string | null
          size?: string | null
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
      raw_material_inventory: {
        Row: {
          id: string
          last_updated: string | null
          location: string | null
          quantity_available: number
          quantity_on_hand: number
          quantity_reserved: number
          raw_material_id: number | null
        }
        Insert: {
          id?: string
          last_updated?: string | null
          location?: string | null
          quantity_available?: number
          quantity_on_hand?: number
          quantity_reserved?: number
          raw_material_id?: number | null
        }
        Update: {
          id?: string
          last_updated?: string | null
          location?: string | null
          quantity_available?: number
          quantity_on_hand?: number
          quantity_reserved?: number
          raw_material_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_material_inventory_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_materials: {
        Row: {
          active: boolean | null
          base_unit: string
          category_id: number | null
          code: string | null
          conversion_factor: number
          cost_per_unit: number | null
          created_at: string | null
          description: string | null
          id: number
          name: string
          purchase_unit: string
          reorder_level: number | null
          supplier_id: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          base_unit: string
          category_id?: number | null
          code?: string | null
          conversion_factor?: number
          cost_per_unit?: number | null
          created_at?: string | null
          description?: string | null
          id?: number
          name: string
          purchase_unit: string
          reorder_level?: number | null
          supplier_id?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          base_unit?: string
          category_id?: number | null
          code?: string | null
          conversion_factor?: number
          cost_per_unit?: number | null
          created_at?: string | null
          description?: string | null
          id?: number
          name?: string
          purchase_unit?: string
          reorder_level?: number | null
          supplier_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_materials_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "material_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_materials_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "material_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_targets: {
        Row: {
          adjusted_total_qty: number
          adjusted_total_value: number
          base_year: string
          created_at: string
          created_by: string | null
          customer_name: string
          id: string
          initial_total_qty: number
          initial_total_value: number
          percentage_increase: number
          target_data: Json
          target_months: string[]
          target_year: string
          updated_at: string
        }
        Insert: {
          adjusted_total_qty?: number
          adjusted_total_value?: number
          base_year: string
          created_at?: string
          created_by?: string | null
          customer_name: string
          id?: string
          initial_total_qty?: number
          initial_total_value?: number
          percentage_increase?: number
          target_data: Json
          target_months: string[]
          target_year: string
          updated_at?: string
        }
        Update: {
          adjusted_total_qty?: number
          adjusted_total_value?: number
          base_year?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string
          id?: string
          initial_total_qty?: number
          initial_total_value?: number
          percentage_increase?: number
          target_data?: Json
          target_months?: string[]
          target_year?: string
          updated_at?: string
        }
        Relationships: []
      }
      split_orders: {
        Row: {
          amount_total: number | null
          created_at: string | null
          date_order: string | null
          id: string
          order_lines: Json | null
          original_po_id: string
          original_po_name: string
          partner_name: string | null
          quantity: number
          split_index: number
          split_name: string
          state: string | null
          updated_at: string | null
        }
        Insert: {
          amount_total?: number | null
          created_at?: string | null
          date_order?: string | null
          id?: string
          order_lines?: Json | null
          original_po_id: string
          original_po_name: string
          partner_name?: string | null
          quantity: number
          split_index: number
          split_name: string
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          amount_total?: number | null
          created_at?: string | null
          date_order?: string | null
          id?: string
          order_lines?: Json | null
          original_po_id?: string
          original_po_name?: string
          partner_name?: string | null
          quantity?: number
          split_index?: number
          split_name?: string
          state?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sync_status: {
        Row: {
          created_at: string | null
          error_message: string | null
          failed_records: number | null
          id: string
          last_sync_timestamp: string | null
          status: string
          sync_type: string
          synced_records: number | null
          total_records: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          failed_records?: number | null
          id?: string
          last_sync_timestamp?: string | null
          status?: string
          sync_type: string
          synced_records?: number | null
          total_records?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          failed_records?: number | null
          id?: string
          last_sync_timestamp?: string | null
          status?: string
          sync_type?: string
          synced_records?: number | null
          total_records?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      auto_sync_stats: {
        Row: {
          avg_duration_ms: number | null
          failed_syncs: number | null
          first_sync_at: string | null
          last_sync_at: string | null
          success_rate_percent: number | null
          successful_syncs: number | null
          syncs_last_24h: number | null
          syncs_last_week: number | null
          total_invoices_synced: number | null
          total_lines_synced: number | null
          total_movements_created: number | null
          total_sync_operations: number | null
        }
        Relationships: []
      }
      recent_auto_sync_activity: {
        Row: {
          created_at: string | null
          cross_project_invoices_synced: number | null
          cross_project_lines_synced: number | null
          duration_ms: number | null
          internal_movements_created: number | null
          message: string | null
          phases_completed: Json | null
          row_num: number | null
          status: string | null
          sync_id: string | null
          total_errors: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      extract_colour_from_name: {
        Args: { product_name: string }
        Returns: string
      }
      extract_size_from_name: {
        Args: { product_name: string }
        Returns: string
      }
      is_superuser: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      update_sync_status: {
        Args: {
          p_error_message?: string
          p_failed_records?: number
          p_status: string
          p_sync_type: string
          p_synced_records?: number
          p_total_records?: number
        }
        Returns: string
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