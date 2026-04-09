import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, action } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch context data for the AI
    const [{ data: products }, { data: clients }, { data: rates }] = await Promise.all([
      supabase.from("products").select("id, sku, name, unit_cost_usd, price_list_usd, price_architect_usd, price_project_usd, price_wholesale_usd, category").eq("is_active", true),
      supabase.from("crm_clients").select("id, name, company"),
      supabase.from("exchange_rates").select("*").order("date", { ascending: false }).limit(1),
    ]);

    const rate = rates?.[0];
    const productList = (products || []).map(p => `${p.name} (SKU:${p.sku}, costo:$${p.unit_cost_usd}, lista:$${p.price_list_usd}, arq:$${p.price_architect_usd})`).join("\n");
    const clientList = (clients || []).map(c => `${c.name} - ${c.company || 'Sin empresa'} (ID:${c.id})`).join("\n");

    const systemPrompt = action === "classify" ? `Eres un asistente financiero para ConstruProtect OS, una empresa de distribución de materiales de construcción en República Dominicana.

TASA DE CAMBIO HOY: Compra ${rate?.usd_buy || 60} / Venta ${rate?.usd_sell || 60.76} DOP/USD

PRODUCTOS DISPONIBLES:
${productList}

CLIENTES:
${clientList}

CATEGORÍAS DE GASTOS: warehouse, software, accounting, marketing, shipping, customs, travel, samples, office, bank_fees, other

Cuando el usuario describe una transacción en lenguaje natural, debes clasificarla y responder SIEMPRE con un JSON válido con esta estructura:
{
  "type": "expense" | "sale",
  "confidence": 0.0-1.0,
  "data": {
    // Para gastos:
    "category": "expense_category_enum",
    "description": "descripción",
    "vendor": "proveedor si aplica",
    "amount_usd": number,
    "amount_dop": number,
    "exchange_rate": number,
    // Para ventas:
    "contact_id": "uuid del cliente o null",
    "contact_name": "nombre",
    "items": [{"product_id": "uuid", "product_name": "nombre", "quantity": number, "unit_price_usd": number, "unit_cost_usd": number, "line_total_usd": number, "margin_pct": number}],
    "subtotal_usd": number,
    "itbis_usd": number,
    "total_usd": number,
    "total_dop": number,
    "exchange_rate": number
  },
  "explanation": "Explicación breve en español de la clasificación"
}

Si el monto está en DOP, convierte a USD usando la tasa. Si está en USD, convierte a DOP.
Calcula el ITBIS (18%) sobre el subtotal para ventas.
Para ventas, usa el precio de lista por defecto salvo que se mencione un tier específico.
Responde SOLO con el JSON, sin markdown ni explicaciones adicionales.` 
    : `Eres un asesor financiero experto para ConstruProtect OS, una empresa de distribución de materiales de construcción en República Dominicana.

TASA DE CAMBIO: Compra ${rate?.usd_buy || 60} / Venta ${rate?.usd_sell || 60.76} DOP/USD

Responde siempre en español dominicano profesional. Sé conciso, directo y orientado a acción.
Usa datos reales cuando se proporcionan. Formatea con markdown.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Límite de solicitudes excedido. Intenta en unos segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos agotados. Agrega fondos en Configuración." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(JSON.stringify({ error: "Error del servicio de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("financial-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
