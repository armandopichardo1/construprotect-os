import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Fetch BCRD homepage and extract exchange rate
    const response = await fetch("https://www.bancentral.gov.do/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ConstruProtect/1.0)",
        "Accept": "text/html",
      },
    });

    if (!response.ok) {
      throw new Error(`BCRD returned status ${response.status}`);
    }

    const html = await response.text();

    // Extract exchange rates from the "Tipo de cambio" section
    // Pattern: Compra followed by a number, then Venta followed by a number
    const compraMatch = html.match(/Compra[\s\S]*?(\d{2}\.\d{4})/);
    const ventaMatch = html.match(/Venta[\s\S]*?(\d{2}\.\d{4})/);

    if (!compraMatch || !ventaMatch) {
      // Fallback: try broader pattern
      const rateSection = html.match(/Tipo de cambio[\s\S]*?(\d{2}\.\d{2,4})[\s\S]*?(\d{2}\.\d{2,4})/);
      if (!rateSection) {
        throw new Error("No se pudo extraer la tasa de cambio del sitio del Banco Central");
      }
      const usdBuy = parseFloat(rateSection[1]);
      const usdSell = parseFloat(rateSection[2]);

      return saveAndRespond(usdBuy, usdSell, req);
    }

    const usdBuy = parseFloat(compraMatch[1]);
    const usdSell = parseFloat(ventaMatch[1]);

    if (isNaN(usdBuy) || isNaN(usdSell) || usdBuy < 30 || usdBuy > 100) {
      throw new Error(`Valores de tasa inválidos: compra=${usdBuy}, venta=${usdSell}`);
    }

    return saveAndRespond(usdBuy, usdSell, req);
  } catch (error) {
    console.error("Error fetching exchange rate:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function saveAndRespond(usdBuy: number, usdSell: number, req: Request) {
  const today = new Date().toISOString().split("T")[0];

  // Save to database
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { error: dbError } = await supabase
    .from("exchange_rates")
    .upsert(
      { date: today, usd_buy: usdBuy, usd_sell: usdSell, source: "bancentral" },
      { onConflict: "date" }
    );

  if (dbError) {
    console.error("DB error:", dbError);
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  return new Response(
    JSON.stringify({
      success: true,
      data: { date: today, usd_buy: usdBuy, usd_sell: usdSell, source: "bancentral" },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
