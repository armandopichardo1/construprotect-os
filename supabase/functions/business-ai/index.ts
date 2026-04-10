import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, payload } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "review") {
      // Business Review: pull last 30 days of everything
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const [{ data: sales }, { data: expenses }, { data: inventory }, { data: deals }, { data: products }, { data: rates }] = await Promise.all([
        supabase.from("sales").select("*, sale_items(*, products(name, sku))").gte("date", thirtyDaysAgo),
        supabase.from("expenses").select("*").gte("date", thirtyDaysAgo),
        supabase.from("inventory").select("*, products(name, sku, category, unit_cost_usd, reorder_point)"),
        supabase.from("deals").select("*, contacts(contact_name, company_name)").neq("stage", "lost"),
        supabase.from("products").select("id, name, category").eq("is_active", true),
        supabase.from("exchange_rates").select("*").order("date", { ascending: false }).limit(1),
      ]);

      const totalRevenue = (sales || []).reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
      const totalExpenses = (expenses || []).reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);
      const totalCogs = (sales || []).flatMap((s: any) => s.sale_items || []).reduce((s: number, si: any) => s + Number(si.unit_cost_usd || 0) * Number(si.quantity || 0), 0);
      
      const lowStock = (inventory || []).filter((i: any) => i.products && i.quantity_on_hand <= Number(i.products.reorder_point));
      const outOfStock = (inventory || []).filter((i: any) => i.quantity_on_hand === 0);
      const pipelineValue = (deals || []).filter((d: any) => d.stage !== "won").reduce((s: number, d: any) => s + Number(d.value_usd || 0), 0);
      const wonDeals = (deals || []).filter((d: any) => d.stage === "won");

      const expByCat: Record<string, number> = {};
      (expenses || []).forEach((e: any) => { expByCat[e.category] = (expByCat[e.category] || 0) + Number(e.amount_usd || 0); });

      const revByCat: Record<string, number> = {};
      (sales || []).flatMap((s: any) => s.sale_items || []).forEach((si: any) => {
        const cat = si.products?.category || "otros";
        revByCat[cat] = (revByCat[cat] || 0) + Number(si.line_total_usd || 0);
      });

      systemPrompt = `Eres el Director de Inteligencia de Negocios de ConstruProtect SRL, empresa de distribución de materiales de construcción premium en República Dominicana. Genera un reporte ejecutivo semanal en español profesional con markdown.

Estructura obligatoria:
## 📊 Resumen Ejecutivo
Párrafo breve con KPIs principales.

## 💰 Ventas & Ingresos
- Total, margen bruto, tendencia
- Top categorías por ingreso
- Tickets promedio

## 💸 Control de Gastos
- Total por categoría
- Alertas si alguna categoría creció >20%

## 📦 Inventario
- Alertas de stock bajo/agotado
- Recomendaciones de reorden

## 🎯 Pipeline Comercial
- Valor total pipeline
- Deals ganados
- Deals en riesgo (más de 14 días sin movimiento)

## 🔮 Recomendaciones
- 3-5 acciones concretas priorizadas

Sé directo, usa datos reales, formatea con emojis y negritas.`;

      userPrompt = `DATOS ÚLTIMOS 30 DÍAS:
- Ingresos: $${totalRevenue.toFixed(0)} USD (${(sales || []).length} ventas)
- COGS: $${totalCogs.toFixed(0)} | Margen Bruto: ${totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue * 100).toFixed(1) : 0}%
- Gastos operativos: $${totalExpenses.toFixed(0)} USD
- Gastos por categoría: ${Object.entries(expByCat).map(([k, v]) => `${k}: $${v.toFixed(0)}`).join(", ")}
- Ingresos por categoría: ${Object.entries(revByCat).map(([k, v]) => `${k}: $${v.toFixed(0)}`).join(", ")}
- Pipeline activo: $${pipelineValue.toFixed(0)} (${(deals || []).filter((d: any) => d.stage !== "won").length} deals)
- Deals ganados: ${wonDeals.length} por $${wonDeals.reduce((s: number, d: any) => s + Number(d.value_usd || 0), 0).toFixed(0)}
- Stock bajo: ${lowStock.length} productos | Agotados: ${outOfStock.length}
- Productos agotados: ${outOfStock.map((i: any) => i.products?.name).filter(Boolean).join(", ") || "ninguno"}
- Stock bajo: ${lowStock.map((i: any) => `${i.products?.name} (${i.quantity_on_hand}/${i.products?.reorder_point})`).join(", ") || "ninguno"}
- Tasa USD/DOP: ${rates?.[0]?.usd_sell || 60.76}

Genera el reporte ejecutivo semanal.`;

    } else if (action === "deal-plan") {
      const deal = payload?.deal;
      const contact = payload?.contact;
      
      systemPrompt = `Eres un estratega comercial experto en la industria de materiales de construcción premium en República Dominicana. Genera un plan de acción detallado en español para cerrar este deal.

Estructura obligatoria con markdown:
## 🎯 Resumen del Deal
Contexto breve del deal y el cliente.

## 📋 Plan de Acción Paso a Paso
Pasos numerados con acciones concretas, responsable sugerido y plazo.

## ⚠️ Objeciones Anticipadas
Lista de objeciones probables y cómo manejar cada una.

## ⏱️ Cronograma Sugerido
Timeline con hitos clave.

## 🛒 Cross-sell / Upsell
Productos complementarios que podrían interesar al cliente.

## 💡 Consejos Clave
Tips específicos para este tipo de cliente/proyecto.

Sé concreto, usa datos del deal, y prioriza acciones por impacto.`;

      userPrompt = `DEAL: ${deal?.title || "Sin título"}
VALOR: $${Number(deal?.value_usd || 0).toLocaleString()}
ETAPA: ${deal?.stage || "prospecting"}
PROBABILIDAD: ${deal?.probability || 50}%
PROYECTO: ${deal?.project_name || "No especificado"} (${deal?.project_size_m2 || "?"} m²)
PRODUCTOS DE INTERÉS: ${JSON.stringify(deal?.products_of_interest || [])}
NOTAS: ${deal?.notes || "Sin notas"}

CLIENTE: ${contact?.contact_name || "Desconocido"}
EMPRESA: ${contact?.company_name || "No especificada"}
SEGMENTO: ${contact?.segment || "No definido"}
TERRITORIO: ${contact?.territory || "No definido"}
TIER DE PRECIO: ${contact?.price_tier || "list"}
INGRESOS HISTÓRICOS: $${Number(contact?.lifetime_revenue_usd || 0).toLocaleString()}
TOTAL PEDIDOS: ${contact?.total_orders || 0}
PRIORIDAD: ${contact?.priority || 3}/5

Genera el plan de acción para cerrar este deal.`;

    } else if (action === "weekly-agenda") {
      const [{ data: activities }, { data: deals }, { data: contacts }] = await Promise.all([
        supabase.from("activities").select("*, contacts(contact_name, company_name, priority, segment), deals(title, value_usd, stage)").eq("is_completed", false).order("due_date"),
        supabase.from("deals").select("*, contacts(contact_name, company_name)").not("stage", "in", '("won","lost")').order("updated_at"),
        supabase.from("contacts").select("*").eq("is_active", true).order("priority").limit(20),
      ]);

      const todayStr = new Date().toISOString().split("T")[0];
      const overdue = (activities || []).filter((a: any) => a.due_date && a.due_date < todayStr);
      const today = (activities || []).filter((a: any) => a.due_date?.startsWith(todayStr));
      
      const staleDeals = (deals || []).filter((d: any) => {
        const days = Math.floor((Date.now() - new Date(d.updated_at).getTime()) / 86400000);
        return days > 7;
      });

      systemPrompt = `Eres el Gerente de Operaciones Comerciales de ConstruProtect SRL. Genera una agenda semanal priorizada en español.

Estructura obligatoria:
## 🔥 Urgente (Hoy)
Acciones que deben ejecutarse inmediatamente.

## ⚡ Alta Prioridad (Esta Semana)
Acciones críticas para esta semana.

## 📋 Seguimiento
Deals y clientes que necesitan atención.

## 🎯 Objetivos de la Semana
3-5 objetivos medibles.

## 💡 Recomendación Estratégica
Una recomendación principal para la semana.

Prioriza por: 1) Actividades vencidas, 2) Valor del deal, 3) Prioridad del cliente, 4) Tiempo sin contacto.`;

      userPrompt = `ACTIVIDADES PENDIENTES:
- Vencidas: ${overdue.length} — ${overdue.slice(0, 5).map((a: any) => `${a.title} (${a.contacts?.contact_name || "?"})`).join(", ")}
- Hoy: ${today.length} — ${today.map((a: any) => `${a.title} (${a.contacts?.contact_name || "?"})`).join(", ")}
- Total pendientes: ${(activities || []).length}

DEALS SIN MOVIMIENTO (>7 días):
${staleDeals.slice(0, 10).map((d: any) => `- ${d.title} ($${Number(d.value_usd).toLocaleString()}) — ${d.contacts?.contact_name} — Etapa: ${d.stage}`).join("\n")}

PIPELINE ACTIVO:
${(deals || []).slice(0, 10).map((d: any) => `- ${d.title}: $${Number(d.value_usd).toLocaleString()} (${d.stage}, ${d.probability || 50}%)`).join("\n")}

TOP CLIENTES POR PRIORIDAD:
${(contacts || []).slice(0, 10).map((c: any) => `- ${c.contact_name} (${c.company_name || "?"}) — Seg: ${c.segment || "?"}, Rev: $${Number(c.lifetime_revenue_usd || 0).toLocaleString()}`).join("\n")}

Genera la agenda semanal priorizada.`;

    } else if (action === "po-recommender") {
      const [{ data: inventory }, { data: movements }, { data: deals }, { data: sales }, { data: expenses }, { data: rates }] = await Promise.all([
        supabase.from("inventory").select("*, products(id, name, sku, category, unit_cost_usd, reorder_point, reorder_qty, lead_time_days, brand)"),
        supabase.from("inventory_movements").select("product_id, quantity, movement_type, created_at").order("created_at"),
        supabase.from("deals").select("products_of_interest, value_usd, stage, probability").not("stage", "in", '("won","lost")'),
        supabase.from("sales").select("total_usd, date").order("date", { ascending: false }).limit(90),
        supabase.from("expenses").select("amount_usd, date").order("date", { ascending: false }).limit(90),
        supabase.from("exchange_rates").select("*").order("date", { ascending: false }).limit(1),
      ]);

      // Calculate velocity per product (last 6 months)
      const now = new Date();
      const velocities: Record<string, { sold: number; months: number[] }> = {};
      (movements || []).forEach((m: any) => {
        if (m.movement_type !== "sale") return;
        const date = new Date(m.created_at);
        const monthsAgo = (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth();
        if (monthsAgo > 5 || monthsAgo < 0) return;
        if (!velocities[m.product_id]) velocities[m.product_id] = { sold: 0, months: [0,0,0,0,0,0] };
        velocities[m.product_id].sold += Math.abs(m.quantity);
        velocities[m.product_id].months[5 - monthsAgo] += Math.abs(m.quantity);
      });

      // Cash flow estimate
      const last30Sales = (sales || []).filter((s: any) => {
        const d = new Date(s.date);
        return (now.getTime() - d.getTime()) < 30 * 86400000;
      }).reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
      const last30Expenses = (expenses || []).filter((e: any) => {
        const d = new Date(e.date);
        return (now.getTime() - d.getTime()) < 30 * 86400000;
      }).reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);

      const inventoryLines = (inventory || []).map((i: any) => {
        const p = i.products;
        if (!p) return null;
        const vel = velocities[p.id];
        const avgMonthly = vel ? vel.sold / 6 : 0;
        const daysOfSupply = avgMonthly > 0 ? Math.round((i.quantity_on_hand / avgMonthly) * 30) : 999;
        const trend = vel?.months || [0,0,0,0,0,0];
        return `SKU:${p.sku} | ${p.name} | Stock:${i.quantity_on_hand} | Reorden:${p.reorder_point} | ReordenQty:${p.reorder_qty} | Costo:$${p.unit_cost_usd} | Lead:${p.lead_time_days}d | VelProm:${avgMonthly.toFixed(1)}/mes | DiasStock:${daysOfSupply} | Tendencia:[${trend.join(",")}] | Marca:${p.brand || "?"}`;
      }).filter(Boolean);

      systemPrompt = `Eres el Director de Compras de ConstruProtect SRL. Genera una orden de compra recomendada basada en análisis de inventario.

Estructura obligatoria:
## 🛒 Orden de Compra Recomendada

### Tabla de SKUs
Para cada producto que necesita reorden, genera una línea con:
- **SKU** | **Producto** | **Cantidad Sugerida** | **Urgencia** (🔴 URGENTE / 🟡 ALTO / 🟢 NORMAL / 🔵 BAJO) | **Costo Estimado**

Criterios de urgencia:
- 🔴 URGENTE: Stock = 0 o días de suministro < lead time
- 🟡 ALTO: Stock ≤ reorder point
- 🟢 NORMAL: Stock entre reorder point y 2x reorder point, pero tendencia creciente
- 🔵 BAJO: Nice to have por pipeline

## 💰 Resumen Financiero
- Costo total de la orden
- Estimado de shipping + aduanas (15% del costo)
- Total con importación
- Comparación con cash flow disponible

## 📊 Análisis de Velocidad
Productos con velocidad creciente vs decreciente.

## ⚠️ Alertas
Productos con demanda desde pipeline que aún no tienen stock suficiente.

## 💡 Recomendaciones
Sugerencias de optimización de inventario.

Usa datos reales, sé preciso con cantidades y costos.`;

      userPrompt = `INVENTARIO ACTUAL:
${inventoryLines.join("\n")}

PIPELINE DEALS (productos de interés):
${(deals || []).slice(0, 10).map((d: any) => `- $${Number(d.value_usd).toLocaleString()} (${d.stage}, ${d.probability}%) — Productos: ${JSON.stringify(d.products_of_interest || [])}`).join("\n") || "Sin deals activos"}

CASH FLOW (últimos 30 días):
- Ingresos: $${last30Sales.toFixed(0)}
- Gastos: $${last30Expenses.toFixed(0)}
- Flujo neto estimado: $${(last30Sales - last30Expenses).toFixed(0)}

TASA: ${rates?.[0]?.usd_sell || 60.76} DOP/USD

Genera la orden de compra recomendada.`;

    } else if (action === "pitch") {
      const deal = payload?.deal;
      const contact = payload?.contact;
      
      const [{ data: products }] = await Promise.all([
        supabase.from("products").select("name, sku, category, price_list_usd").eq("is_active", true),
      ]);

      systemPrompt = `Eres un experto en ventas B2B de materiales de construcción premium en República Dominicana. Genera un pitch de venta personalizado en español dominicano profesional.

Estructura:
## 🎤 Pitch de Venta

### Apertura (30 seg)
Frase de apertura personalizada al cliente y su proyecto.

### Propuesta de Valor (1 min)
Beneficios específicos de los productos Ram Board para su proyecto.

### Diferenciadores
Por qué Ram Board vs la competencia.

### Números que Importan
ROI, ahorro en tiempo, protección garantizada.

### Cierre
Call-to-action específico con próximo paso concreto.

### Objeciones Frecuentes
Respuestas preparadas para las 3 objeciones más comunes.

Sé persuasivo pero auténtico. Usa datos reales del deal.`;

      userPrompt = `DEAL: ${deal?.title || "Sin título"} — $${Number(deal?.value_usd || 0).toLocaleString()}
ETAPA: ${deal?.stage} | PROB: ${deal?.probability}%
PROYECTO: ${deal?.project_name || "?"} (${deal?.project_size_m2 || "?"} m²)
CLIENTE: ${contact?.contact_name || "?"} — ${contact?.company_name || "?"}
SEGMENTO: ${contact?.segment || "?"} | TIER: ${contact?.price_tier || "list"}
PRODUCTOS DISPONIBLES: ${(products || []).slice(0, 15).map((p: any) => `${p.name} ($${p.price_list_usd})`).join(", ")}

Genera el pitch personalizado.`;

    } else if (action === "cross-sell") {
      const contact = payload?.contact;
      const purchaseHistory = payload?.purchaseHistory;
      
      const [{ data: products }] = await Promise.all([
        supabase.from("products").select("name, sku, category, price_list_usd, unit_cost_usd").eq("is_active", true),
      ]);

      systemPrompt = `Eres un asesor de ventas experto en cross-selling de materiales de construcción premium. Analiza el historial de compras del cliente y recomienda productos complementarios.

Estructura:
## 🛒 Recomendaciones de Cross-sell

### Productos Recomendados
Para cada producto recomendado:
- **Nombre** — Por qué le conviene al cliente
- Precio y margen estimado
- Frecuencia de recompra sugerida

### Bundles Sugeridos
Combinaciones de productos que funcionan juntos.

### Estrategia de Upsell
Cómo mover al cliente al siguiente tier de precio.

### Timing
Cuándo hacer la próxima oferta basado en su ciclo de compra.

Usa datos reales del historial. Máximo 5 recomendaciones priorizadas.`;

      userPrompt = `CLIENTE: ${contact?.contact_name || "?"} — ${contact?.company_name || "?"}
SEGMENTO: ${contact?.segment || "?"} | TIER: ${contact?.price_tier || "list"}
INGRESOS HISTÓRICOS: $${Number(contact?.lifetime_revenue_usd || 0).toLocaleString()}
TOTAL PEDIDOS: ${contact?.total_orders || 0}

HISTORIAL DE COMPRAS:
${purchaseHistory || "Sin historial disponible"}

CATÁLOGO COMPLETO:
${(products || []).map((p: any) => `${p.name} (SKU:${p.sku}, Cat:${p.category}, $${p.price_list_usd})`).join("\n")}

Genera las recomendaciones de cross-sell.`;

    } else {
      return new Response(JSON.stringify({ error: "Acción no válida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
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
    console.error("business-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
