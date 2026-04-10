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
        Relationships: []
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
        }
        Insert: {
          additional_costs_usd?: number | null
          brand?: string | null
          category?: string | null
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
        }
        Update: {
          additional_costs_usd?: number | null
          brand?: string | null
          category?: string | null
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
            foreignKeyName: "sales_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_clients"
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
      shipments: {
        Row: {
          actual_arrival: string | null
          created_at: string
          created_by: string | null
          customs_cost_usd: number | null
          estimated_arrival: string | null
          id: string
          notes: string | null
          order_date: string
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
          created_at?: string
          created_by?: string | null
          customs_cost_usd?: number | null
          estimated_arrival?: string | null
          id?: string
          notes?: string | null
          order_date?: string
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
          created_at?: string
          created_by?: string | null
          customs_cost_usd?: number | null
          estimated_arrival?: string | null
          id?: string
          notes?: string | null
          order_date?: string
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
      [_ in never]: never
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
