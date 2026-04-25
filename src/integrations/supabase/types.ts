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
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean | null
          outcome: string | null
          title: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          outcome?: string | null
          title: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          outcome?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_history: {
        Row: {
          alert_count: number
          category: string
          fired_at: string
          id: string
          label: string
          message: string
          rule_id: string
          severity: string
        }
        Insert: {
          alert_count?: number
          category: string
          fired_at?: string
          id?: string
          label: string
          message: string
          rule_id: string
          severity: string
        }
        Update: {
          alert_count?: number
          category?: string
          fired_at?: string
          id?: string
          label?: string
          message?: string
          rule_id?: string
          severity?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          module: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          summary: string
          table_name: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          module: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          summary: string
          table_name: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          module?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          summary?: string
          table_name?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      chart_of_accounts: {
        Row: {
          account_type: string
          classification: string | null
          code: string | null
          created_at: string
          currency: string | null
          description: string
          financial_statement: string | null
          id: string
          is_active: boolean
          normal_balance: string | null
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          account_type: string
          classification?: string | null
          code?: string | null
          created_at?: string
          currency?: string | null
          description: string
          financial_statement?: string | null
          id?: string
          is_active?: boolean
          normal_balance?: string | null
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          classification?: string | null
          code?: string | null
          created_at?: string
          currency?: string | null
          description?: string
          financial_statement?: string | null
          id?: string
          is_active?: boolean
          normal_balance?: string | null
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_projects: {
        Row: {
          area_m2: number | null
          contact_id: string
          created_at: string
          created_by: string | null
          deal_id: string | null
          end_date: string | null
          estimated_value_usd: number | null
          id: string
          location: string | null
          notes: string | null
          product_needs: Json | null
          project_name: string
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          area_m2?: number | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          end_date?: string | null
          estimated_value_usd?: number | null
          id?: string
          location?: string | null
          notes?: string | null
          product_needs?: Json | null
          project_name: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          area_m2?: number | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          end_date?: string | null
          estimated_value_usd?: number | null
          id?: string
          location?: string | null
          notes?: string | null
          product_needs?: Json | null
          project_name?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_projects_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_projects_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_entries: {
        Row: {
          competitor_name: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          our_price_usd: number | null
          price_usd: number | null
          product_category: string | null
          source: string | null
          spotted_at: string
        }
        Insert: {
          competitor_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          our_price_usd?: number | null
          price_usd?: number | null
          product_category?: string | null
          source?: string | null
          spotted_at?: string
        }
        Update: {
          competitor_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          our_price_usd?: number | null
          price_usd?: number | null
          product_category?: string | null
          source?: string | null
          spotted_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          address: string | null
          company_name: string | null
          contact_name: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          last_activity_date: string | null
          last_order_date: string | null
          lifetime_revenue_usd: number | null
          notes: string | null
          phone: string | null
          price_tier: string | null
          priority: number | null
          rnc: string | null
          segment: string | null
          source: string | null
          tags: string[] | null
          territory: string | null
          total_orders: number | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          company_name?: string | null
          contact_name: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          last_activity_date?: string | null
          last_order_date?: string | null
          lifetime_revenue_usd?: number | null
          notes?: string | null
          phone?: string | null
          price_tier?: string | null
          priority?: number | null
          rnc?: string | null
          segment?: string | null
          source?: string | null
          tags?: string[] | null
          territory?: string | null
          total_orders?: number | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          company_name?: string | null
          contact_name?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          last_activity_date?: string | null
          last_order_date?: string | null
          lifetime_revenue_usd?: number | null
          notes?: string | null
          phone?: string | null
          price_tier?: string | null
          priority?: number | null
          rnc?: string | null
          segment?: string | null
          source?: string | null
          tags?: string[] | null
          territory?: string | null
          total_orders?: number | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      costs: {
        Row: {
          account_id: string | null
          amount_dop: number
          amount_usd: number
          category: Database["public"]["Enums"]["cost_category"]
          created_at: string
          created_by: string | null
          date: string
          description: string
          exchange_rate: number | null
          id: string
          is_recurring: boolean | null
          receipt_url: string | null
          recurring_frequency: string | null
          subcategory: string | null
          vendor: string | null
        }
        Insert: {
          account_id?: string | null
          amount_dop?: number
          amount_usd?: number
          category?: Database["public"]["Enums"]["cost_category"]
          created_at?: string
          created_by?: string | null
          date?: string
          description: string
          exchange_rate?: number | null
          id?: string
          is_recurring?: boolean | null
          receipt_url?: string | null
          recurring_frequency?: string | null
          subcategory?: string | null
          vendor?: string | null
        }
        Update: {
          account_id?: string | null
          amount_dop?: number
          amount_usd?: number
          category?: Database["public"]["Enums"]["cost_category"]
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          exchange_rate?: number | null
          id?: string
          is_recurring?: boolean | null
          receipt_url?: string | null
          recurring_frequency?: string | null
          subcategory?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "costs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_clients: {
        Row: {
          company: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_opportunities: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          expected_close_date: string | null
          id: string
          notes: string | null
          probability_pct: number | null
          stage: Database["public"]["Enums"]["pipeline_stage"]
          title: string
          updated_at: string
          value_usd: number
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          probability_pct?: number | null
          stage?: Database["public"]["Enums"]["pipeline_stage"]
          title: string
          updated_at?: string
          value_usd?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          probability_pct?: number | null
          stage?: Database["public"]["Enums"]["pipeline_stage"]
          title?: string
          updated_at?: string
          value_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          actual_close_date: string | null
          assigned_to: string | null
          contact_id: string
          created_at: string
          expected_close_date: string | null
          id: string
          is_recurring: boolean | null
          loss_reason: string | null
          notes: string | null
          probability: number | null
          products_of_interest: Json | null
          project_location: string | null
          project_name: string | null
          project_size_m2: number | null
          stage: Database["public"]["Enums"]["deal_stage"]
          title: string
          updated_at: string
          value_usd: number | null
        }
        Insert: {
          actual_close_date?: string | null
          assigned_to?: string | null
          contact_id: string
          created_at?: string
          expected_close_date?: string | null
          id?: string
          is_recurring?: boolean | null
          loss_reason?: string | null
          notes?: string | null
          probability?: number | null
          products_of_interest?: Json | null
          project_location?: string | null
          project_name?: string | null
          project_size_m2?: number | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          title: string
          updated_at?: string
          value_usd?: number | null
        }
        Update: {
          actual_close_date?: string | null
          assigned_to?: string | null
          contact_id?: string
          created_at?: string
          expected_close_date?: string | null
          id?: string
          is_recurring?: boolean | null
          loss_reason?: string | null
          notes?: string | null
          probability?: number | null
          products_of_interest?: Json | null
          project_location?: string | null
          project_name?: string | null
          project_size_m2?: number | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          title?: string
          updated_at?: string
          value_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_rules: {
        Row: {
          category: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          discount_amount_usd: number
          discount_pct: number
          discount_type: string
          id: string
          is_active: boolean
          name: string | null
          notes: string | null
          priority: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount_usd?: number
          discount_pct?: number
          discount_type?: string
          id?: string
          is_active?: boolean
          name?: string | null
          notes?: string | null
          priority?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount_usd?: number
          discount_pct?: number
          discount_type?: string
          id?: string
          is_active?: boolean
          name?: string | null
          notes?: string | null
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_rules_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          date: string
          id: string
          source: string | null
          usd_buy: number
          usd_sell: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          source?: string | null
          usd_buy: number
          usd_sell: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          source?: string | null
          usd_buy?: number
          usd_sell?: number
        }
        Relationships: []
      }
      expenses: {
        Row: {
          account_id: string | null
          amount_dop: number
          amount_usd: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string | null
          date: string
          description: string
          exchange_rate: number | null
          id: string
          is_recurring: boolean | null
          receipt_url: string | null
          recurring_frequency: string | null
          subcategory: string | null
          vendor: string | null
        }
        Insert: {
          account_id?: string | null
          amount_dop?: number
          amount_usd?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          date?: string
          description: string
          exchange_rate?: number | null
          id?: string
          is_recurring?: boolean | null
          receipt_url?: string | null
          recurring_frequency?: string | null
          subcategory?: string | null
          vendor?: string | null
        }
        Update: {
          account_id?: string | null
          amount_dop?: number
          amount_usd?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          exchange_rate?: number | null
          id?: string
          is_recurring?: boolean | null
          receipt_url?: string | null
          recurring_frequency?: string | null
          subcategory?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          id: string
          location_id: string | null
          product_id: string
          quantity_on_hand: number
          quantity_reserved: number
          updated_at: string
        }
        Insert: {
          id?: string
          location_id?: string | null
          product_id: string
          quantity_on_hand?: number
          quantity_reserved?: number
          updated_at?: string
        }
        Update: {
          id?: string
          location_id?: string | null
          product_id?: string
          quantity_on_hand?: number
          quantity_reserved?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes: string | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          unit_cost_usd: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          unit_cost_usd?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          unit_cost_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          description: string
          exchange_rate: number | null
          id: string
          notes: string | null
          total_credit_usd: number
          total_debit_usd: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date?: string
          description: string
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          total_credit_usd?: number
          total_debit_usd?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          total_credit_usd?: number
          total_debit_usd?: number
        }
        Relationships: []
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          created_at: string
          credit_usd: number
          debit_usd: number
          description: string | null
          id: string
          journal_entry_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credit_usd?: number
          debit_usd?: number
          description?: string | null
          id?: string
          journal_entry_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credit_usd?: number
          debit_usd?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          name: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          name: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          name?: string
        }
        Relationships: []
      }
      physical_count_items: {
        Row: {
          adjustment_value_usd: number
          counted_qty: number
          difference: number
          id: string
          physical_count_id: string
          product_id: string | null
          product_name: string
          sku: string
          system_qty: number
          unit_cost_usd: number
        }
        Insert: {
          adjustment_value_usd?: number
          counted_qty?: number
          difference?: number
          id?: string
          physical_count_id: string
          product_id?: string | null
          product_name: string
          sku: string
          system_qty?: number
          unit_cost_usd?: number
        }
        Update: {
          adjustment_value_usd?: number
          counted_qty?: number
          difference?: number
          id?: string
          physical_count_id?: string
          product_id?: string | null
          product_name?: string
          sku?: string
          system_qty?: number
          unit_cost_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "physical_count_items_physical_count_id_fkey"
            columns: ["physical_count_id"]
            isOneToOne: false
            referencedRelation: "physical_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      physical_counts: {
        Row: {
          created_at: string
          id: string
          net_adjustment_value_usd: number
          notes: string | null
          performed_by: string | null
          performed_by_name: string | null
          shortfall_value_usd: number
          surplus_value_usd: number
          total_differences: number
          total_products_counted: number
          total_shortfall: number
          total_surplus: number
        }
        Insert: {
          created_at?: string
          id?: string
          net_adjustment_value_usd?: number
          notes?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          shortfall_value_usd?: number
          surplus_value_usd?: number
          total_differences?: number
          total_products_counted?: number
          total_shortfall?: number
          total_surplus?: number
        }
        Update: {
          created_at?: string
          id?: string
          net_adjustment_value_usd?: number
          notes?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          shortfall_value_usd?: number
          surplus_value_usd?: number
          total_differences?: number
          total_products_counted?: number
          total_shortfall?: number
          total_surplus?: number
        }
        Relationships: []
      }
      product_requests: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          priority: number | null
          product_description: string
          requested_by_contact_id: string | null
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          priority?: number | null
          product_description: string
          requested_by_contact_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          priority?: number | null
          product_description?: string
          requested_by_contact_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_requests_requested_by_contact_id_fkey"
            columns: ["requested_by_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          additional_costs_usd: number | null
          brand: string | null
          category: string | null
          cbm_per_unit: number | null
          coverage_m2: number | null
          created_at: string
          dimensions: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          lead_time_days: number | null
          margin_architect_pct: number | null
          margin_list_pct: number | null
          margin_project_pct: number | null
          margin_wholesale_pct: number | null
          min_order_qty: number | null
          name: string
          notes: string | null
          price_architect_usd: number | null
          price_list_usd: number | null
          price_project_usd: number | null
          price_wholesale_usd: number | null
          reorder_point: number | null
          reorder_qty: number | null
          sku: string
          taxes_per_unit_usd: number | null
          total_unit_cost_usd: number | null
          unit_cost_usd: number | null
          units_per_pack: number | null
          updated_at: string
          weight_kg_per_unit: number | null
        }
        Insert: {
          additional_costs_usd?: number | null
          brand?: string | null
          category?: string | null
          cbm_per_unit?: number | null
          coverage_m2?: number | null
          created_at?: string
          dimensions?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          lead_time_days?: number | null
          margin_architect_pct?: number | null
          margin_list_pct?: number | null
          margin_project_pct?: number | null
          margin_wholesale_pct?: number | null
          min_order_qty?: number | null
          name: string
          notes?: string | null
          price_architect_usd?: number | null
          price_list_usd?: number | null
          price_project_usd?: number | null
          price_wholesale_usd?: number | null
          reorder_point?: number | null
          reorder_qty?: number | null
          sku: string
          taxes_per_unit_usd?: number | null
          total_unit_cost_usd?: number | null
          unit_cost_usd?: number | null
          units_per_pack?: number | null
          updated_at?: string
          weight_kg_per_unit?: number | null
        }
        Update: {
          additional_costs_usd?: number | null
          brand?: string | null
          category?: string | null
          cbm_per_unit?: number | null
          coverage_m2?: number | null
          created_at?: string
          dimensions?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          lead_time_days?: number | null
          margin_architect_pct?: number | null
          margin_list_pct?: number | null
          margin_project_pct?: number | null
          margin_wholesale_pct?: number | null
          min_order_qty?: number | null
          name?: string
          notes?: string | null
          price_architect_usd?: number | null
          price_list_usd?: number | null
          price_project_usd?: number | null
          price_wholesale_usd?: number | null
          reorder_point?: number | null
          reorder_qty?: number | null
          sku?: string
          taxes_per_unit_usd?: number | null
          total_unit_cost_usd?: number | null
          unit_cost_usd?: number | null
          units_per_pack?: number | null
          updated_at?: string
          weight_kg_per_unit?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: string | null
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          role?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: string | null
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          created_at: string
          discount_pct: number | null
          id: string
          line_total_usd: number
          product_id: string | null
          quantity: number
          quote_id: string
          unit_price_usd: number
        }
        Insert: {
          created_at?: string
          discount_pct?: number | null
          id?: string
          line_total_usd?: number
          product_id?: string | null
          quantity?: number
          quote_id: string
          unit_price_usd?: number
        }
        Update: {
          created_at?: string
          discount_pct?: number | null
          id?: string
          line_total_usd?: number
          product_id?: string | null
          quantity?: number
          quote_id?: string
          unit_price_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string | null
          deal_id: string | null
          exchange_rate: number | null
          id: string
          itbis_usd: number | null
          notes: string | null
          quote_number: string
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal_usd: number | null
          total_dop: number | null
          total_usd: number | null
          valid_until: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          exchange_rate?: number | null
          id?: string
          itbis_usd?: number | null
          notes?: string | null
          quote_number: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal_usd?: number | null
          total_dop?: number | null
          total_usd?: number | null
          valid_until?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          exchange_rate?: number | null
          id?: string
          itbis_usd?: number | null
          notes?: string | null
          quote_number?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal_usd?: number | null
          total_dop?: number | null
          total_usd?: number | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          discount_amount_usd: number
          discount_pct: number
          discount_type: string
          gross_unit_price_usd: number
          id: string
          line_total_usd: number
          margin_pct: number | null
          product_id: string | null
          quantity: number
          sale_id: string
          unit_cost_usd: number
          unit_price_usd: number
        }
        Insert: {
          created_at?: string
          discount_amount_usd?: number
          discount_pct?: number
          discount_type?: string
          gross_unit_price_usd?: number
          id?: string
          line_total_usd?: number
          margin_pct?: number | null
          product_id?: string | null
          quantity?: number
          sale_id: string
          unit_cost_usd?: number
          unit_price_usd?: number
        }
        Update: {
          created_at?: string
          discount_amount_usd?: number
          discount_pct?: number
          discount_type?: string
          gross_unit_price_usd?: number
          id?: string
          line_total_usd?: number
          margin_pct?: number | null
          product_id?: string | null
          quantity?: number
          sale_id?: string
          unit_cost_usd?: number
          unit_price_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          account_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          date: string
          deal_id: string | null
          exchange_rate: number | null
          id: string
          invoice_ref: string | null
          itbis_usd: number
          notes: string | null
          payment_date: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          subtotal_usd: number
          total_dop: number
          total_usd: number
        }
        Insert: {
          account_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          deal_id?: string | null
          exchange_rate?: number | null
          id?: string
          invoice_ref?: string | null
          itbis_usd?: number
          notes?: string | null
          payment_date?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          subtotal_usd?: number
          total_dop?: number
          total_usd?: number
        }
        Update: {
          account_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          deal_id?: string | null
          exchange_rate?: number | null
          id?: string
          invoice_ref?: string | null
          itbis_usd?: number
          notes?: string | null
          payment_date?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          subtotal_usd?: number
          total_dop?: number
          total_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          business_line: string | null
          created_at: string
          description: string
          family: string | null
          id: string
          is_active: boolean
          sku: string
          updated_at: string
        }
        Insert: {
          business_line?: string | null
          created_at?: string
          description: string
          family?: string | null
          id?: string
          is_active?: boolean
          sku: string
          updated_at?: string
        }
        Update: {
          business_line?: string | null
          created_at?: string
          description?: string
          family?: string | null
          id?: string
          is_active?: boolean
          sku?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value?: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      shipment_expense_history: {
        Row: {
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          delta_total_usd: number
          id: string
          journal_entry_id: string | null
          new_customs_usd: number
          new_freight_usd: number
          new_other_usd: number
          notes: string | null
          payment_mode: string | null
          previous_customs_usd: number
          previous_freight_usd: number
          previous_other_usd: number
          shipment_id: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          delta_total_usd?: number
          id?: string
          journal_entry_id?: string | null
          new_customs_usd?: number
          new_freight_usd?: number
          new_other_usd?: number
          notes?: string | null
          payment_mode?: string | null
          previous_customs_usd?: number
          previous_freight_usd?: number
          previous_other_usd?: number
          shipment_id: string
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          delta_total_usd?: number
          id?: string
          journal_entry_id?: string | null
          new_customs_usd?: number
          new_freight_usd?: number
          new_other_usd?: number
          notes?: string | null
          payment_mode?: string | null
          previous_customs_usd?: number
          previous_freight_usd?: number
          previous_other_usd?: number
          shipment_id?: string
        }
        Relationships: []
      }
      shipment_items: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          quantity_ordered: number
          quantity_received: number
          shipment_id: string
          unit_cost_usd: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          quantity_ordered?: number
          quantity_received?: number
          shipment_id: string
          unit_cost_usd?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          quantity_ordered?: number
          quantity_received?: number
          shipment_id?: string
          unit_cost_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_payments: {
        Row: {
          account_id: string
          amount_usd: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          shipment_id: string
        }
        Insert: {
          account_id: string
          amount_usd?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          shipment_id: string
        }
        Update: {
          account_id?: string
          amount_usd?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_payments_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          actual_arrival: string | null
          amount_paid_usd: number
          created_at: string
          created_by: string | null
          customs_cost_usd: number | null
          estimated_arrival: string | null
          id: string
          notes: string | null
          order_date: string
          payment_account_id: string | null
          payment_date: string | null
          payment_status: string
          po_number: string | null
          shipping_cost_usd: number | null
          status: Database["public"]["Enums"]["shipment_status"]
          supplier_id: string | null
          supplier_name: string
          total_cost_usd: number | null
          updated_at: string
        }
        Insert: {
          actual_arrival?: string | null
          amount_paid_usd?: number
          created_at?: string
          created_by?: string | null
          customs_cost_usd?: number | null
          estimated_arrival?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          payment_account_id?: string | null
          payment_date?: string | null
          payment_status?: string
          po_number?: string | null
          shipping_cost_usd?: number | null
          status?: Database["public"]["Enums"]["shipment_status"]
          supplier_id?: string | null
          supplier_name: string
          total_cost_usd?: number | null
          updated_at?: string
        }
        Update: {
          actual_arrival?: string | null
          amount_paid_usd?: number
          created_at?: string
          created_by?: string | null
          customs_cost_usd?: number | null
          estimated_arrival?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          payment_account_id?: string | null
          payment_date?: string | null
          payment_status?: string
          po_number?: string | null
          shipping_cost_usd?: number | null
          status?: Database["public"]["Enums"]["shipment_status"]
          supplier_id?: string | null
          supplier_name?: string
          total_cost_usd?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      build_audit_summary: {
        Args: { action: string; rec: Json; tbl: string }
        Returns: string
      }
      get_module_for_table: { Args: { tbl: string }; Returns: string }
    }
    Enums: {
      activity_type:
        | "call"
        | "whatsapp"
        | "email"
        | "visit"
        | "meeting"
        | "demo"
        | "sample_sent"
        | "quote_sent"
        | "follow_up"
        | "note"
        | "delivery"
      cost_category:
        | "freight"
        | "customs"
        | "raw_materials"
        | "packaging"
        | "labor"
        | "logistics"
        | "warehousing"
        | "insurance"
        | "other"
      deal_stage:
        | "prospecting"
        | "initial_contact"
        | "demo_sample"
        | "quote_sent"
        | "negotiation"
        | "closing"
        | "delivered"
        | "won"
        | "lost"
      expense_category:
        | "warehouse"
        | "software"
        | "accounting"
        | "marketing"
        | "shipping"
        | "customs"
        | "travel"
        | "samples"
        | "office"
        | "bank_fees"
        | "other"
        | "purchases"
        | "payroll"
        | "insurance"
        | "rent"
        | "utilities"
        | "maintenance"
      movement_type:
        | "receipt"
        | "sale"
        | "adjustment"
        | "sample"
        | "return"
        | "damage"
      payment_status: "pending" | "paid" | "partial" | "overdue" | "cancelled"
      pipeline_stage:
        | "prospecto"
        | "contactado"
        | "cotizado"
        | "negociacion"
        | "cerrado_ganado"
        | "cerrado_perdido"
      project_status: "planning" | "active" | "completed" | "cancelled"
      quote_status: "draft" | "sent" | "accepted" | "rejected" | "expired"
      request_status: "pending" | "sourcing" | "available" | "declined"
      shipment_status:
        | "ordered"
        | "in_transit"
        | "customs"
        | "warehouse"
        | "received"
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
      activity_type: [
        "call",
        "whatsapp",
        "email",
        "visit",
        "meeting",
        "demo",
        "sample_sent",
        "quote_sent",
        "follow_up",
        "note",
        "delivery",
      ],
      cost_category: [
        "freight",
        "customs",
        "raw_materials",
        "packaging",
        "labor",
        "logistics",
        "warehousing",
        "insurance",
        "other",
      ],
      deal_stage: [
        "prospecting",
        "initial_contact",
        "demo_sample",
        "quote_sent",
        "negotiation",
        "closing",
        "delivered",
        "won",
        "lost",
      ],
      expense_category: [
        "warehouse",
        "software",
        "accounting",
        "marketing",
        "shipping",
        "customs",
        "travel",
        "samples",
        "office",
        "bank_fees",
        "other",
        "purchases",
        "payroll",
        "insurance",
        "rent",
        "utilities",
        "maintenance",
      ],
      movement_type: [
        "receipt",
        "sale",
        "adjustment",
        "sample",
        "return",
        "damage",
      ],
      payment_status: ["pending", "paid", "partial", "overdue", "cancelled"],
      pipeline_stage: [
        "prospecto",
        "contactado",
        "cotizado",
        "negociacion",
        "cerrado_ganado",
        "cerrado_perdido",
      ],
      project_status: ["planning", "active", "completed", "cancelled"],
      quote_status: ["draft", "sent", "accepted", "rejected", "expired"],
      request_status: ["pending", "sourcing", "available", "declined"],
      shipment_status: [
        "ordered",
        "in_transit",
        "customs",
        "warehouse",
        "received",
      ],
    },
  },
} as const
