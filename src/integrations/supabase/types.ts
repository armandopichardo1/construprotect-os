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
      products: {
        Row: {
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
          price_architect_usd: number | null
          price_list_usd: number | null
          price_project_usd: number | null
          price_wholesale_usd: number | null
          reorder_point: number | null
          reorder_qty: number | null
          sku: string
          total_unit_cost_usd: number | null
          unit_cost_usd: number | null
          units_per_pack: number | null
          updated_at: string
        }
        Insert: {
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
          price_architect_usd?: number | null
          price_list_usd?: number | null
          price_project_usd?: number | null
          price_wholesale_usd?: number | null
          reorder_point?: number | null
          reorder_qty?: number | null
          sku: string
          total_unit_cost_usd?: number | null
          unit_cost_usd?: number | null
          units_per_pack?: number | null
          updated_at?: string
        }
        Update: {
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
          price_architect_usd?: number | null
          price_list_usd?: number | null
          price_project_usd?: number | null
          price_wholesale_usd?: number | null
          reorder_point?: number | null
          reorder_qty?: number | null
          sku?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      movement_type:
        | "receipt"
        | "sale"
        | "adjustment"
        | "sample"
        | "return"
        | "damage"
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
      movement_type: [
        "receipt",
        "sale",
        "adjustment",
        "sample",
        "return",
        "damage",
      ],
    },
  },
} as const
