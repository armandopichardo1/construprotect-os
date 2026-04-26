/**
 * Pure helpers para el cálculo del costo aterrizado (landed cost) de un envío.
 * Extraídos de `ShipmentExpensesDialog` para poder testearlos sin montar el modal.
 *
 * Modelo:
 *  - Cada `shipment_item` trae un `unit_cost_usd` que YA incluye los addons previos
 *    prorrateados (Flete + Aduanas + Otros).
 *  - Para recalcular cuando cambian los addons, primero "des-prorrateamos" para
 *    obtener el FOB unitario, luego aplicamos los nuevos addons con el método
 *    elegido (FOB, unidades, peso, volumen) y devolvemos el costo aterrizado nuevo.
 */

export type ProrationMethod = 'fob' | 'units' | 'weight' | 'volume';

export interface ShipmentItemInput {
  id: string;
  product_id?: string | null;
  quantity_ordered: number;
  unit_cost_usd: number; // costo aterrizado actual (FOB + addons prorrateados)
  products?: { name?: string; sku?: string } | null;
}

export interface ShipmentInput {
  shipping_cost_usd?: number | null;
  customs_cost_usd?: number | null;
  other_cost_usd?: number | null;
  notes?: string | null;
}

export interface ProductInfo {
  weightKg?: number;
  cbm?: number;
}

export interface PreviewLine {
  id: string;
  qty: number;
  productName: string;
  sku: string;
  fobUnit: number;
  lineFobTotal: number;
  lineAddon: number;
  newUnitCost: number;
  newLineLanded: number;
}

export interface LandedCalc {
  currentFreight: number;
  currentCustoms: number;
  currentOther: number;
  currentAddons: number;
  newFreight: number;
  newCustoms: number;
  newOther: number;
  newAddons: number;
  deltaAddons: number;
  totalFob: number;
  preview: PreviewLine[];
}

/** Extrae addons "Otros" desde el campo estructurado o del fallback en notas. */
export function extractCurrentOther(shipment: ShipmentInput): number {
  const structured = Number(shipment?.other_cost_usd);
  if (Number.isFinite(structured) && structured > 0) return structured;
  const m = String(shipment?.notes || '').match(/Otros \$([0-9.]+)/);
  return m ? Number(m[1]) : 0;
}

/** Calcula el escenario completo de prorrateo dado el envío, items y nuevos addons. */
export function computeLanded(
  shipment: ShipmentInput,
  items: ShipmentItemInput[],
  newAddonsInput: { freight: number; customs: number; other: number },
  prorationMethod: ProrationMethod = 'fob',
  productInfo: Record<string, ProductInfo> = {},
): LandedCalc {
  const currentFreight = Number(shipment?.shipping_cost_usd || 0);
  const currentCustoms = Number(shipment?.customs_cost_usd || 0);
  const currentOther = extractCurrentOther(shipment);
  const currentAddons = currentFreight + currentCustoms + currentOther;

  const totalLanded = items.reduce(
    (s, it) => s + Number(it.unit_cost_usd || 0) * Number(it.quantity_ordered || 0),
    0,
  );
  // Factor para "des-prorratear" addons existentes y obtener FOB puro
  const factor =
    totalLanded > 0 && totalLanded - currentAddons > 0
      ? (totalLanded - currentAddons) / totalLanded
      : 1;

  const baselineFob = items.map((it) => ({
    id: it.id,
    qty: Number(it.quantity_ordered || 0),
    productName: it.products?.name || '—',
    sku: it.products?.sku || '',
    fobUnit: Number(it.unit_cost_usd || 0) * factor,
    productId: it.product_id || null,
  }));
  const totalFob = baselineFob.reduce((s, it) => s + it.fobUnit * it.qty, 0);

  const newFreight = Math.max(0, Number(newAddonsInput.freight) || 0);
  const newCustoms = Math.max(0, Number(newAddonsInput.customs) || 0);
  const newOther = Math.max(0, Number(newAddonsInput.other) || 0);
  const newAddons = newFreight + newCustoms + newOther;
  const deltaAddons = newAddons - currentAddons;

  const lineWeight = (it: typeof baselineFob[number]): number => {
    const info = it.productId ? productInfo[it.productId] : null;
    switch (prorationMethod) {
      case 'units':
        return it.qty;
      case 'weight':
        return it.qty * Number(info?.weightKg || 0);
      case 'volume':
        return it.qty * Number(info?.cbm || 0);
      case 'fob':
      default:
        return it.fobUnit * it.qty;
    }
  };

  const weights = baselineFob.map((it) => ({ id: it.id, w: lineWeight(it) }));
  const sumW = weights.reduce((s, x) => s + x.w, 0);
  const useFobFallback = sumW <= 0 && totalFob > 0;

  const preview: PreviewLine[] = baselineFob.map((it) => {
    const lineFobTotal = it.fobUnit * it.qty;
    let lineAddon = 0;
    if (useFobFallback) {
      lineAddon = totalFob > 0 ? (lineFobTotal / totalFob) * newAddons : 0;
    } else if (sumW > 0) {
      const w = weights.find((x) => x.id === it.id)?.w || 0;
      lineAddon = (w / sumW) * newAddons;
    }
    const newUnitCost = it.qty > 0 ? it.fobUnit + lineAddon / it.qty : it.fobUnit;
    return {
      id: it.id,
      qty: it.qty,
      productName: it.productName,
      sku: it.sku,
      fobUnit: it.fobUnit,
      lineFobTotal,
      lineAddon,
      newUnitCost,
      newLineLanded: newUnitCost * it.qty,
    };
  });

  return {
    currentFreight,
    currentCustoms,
    currentOther,
    currentAddons,
    newFreight,
    newCustoms,
    newOther,
    newAddons,
    deltaAddons,
    totalFob,
    preview,
  };
}
