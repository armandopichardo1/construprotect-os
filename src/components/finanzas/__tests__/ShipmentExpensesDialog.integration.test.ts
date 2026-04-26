/**
 * Integración: editar flete en una PO.
 *
 * Verifica que al cambiar el flete de un envío:
 *   1. Se calcula el delta de addons correctamente.
 *   2. Se prorratea el nuevo flete sobre los `shipment_items` (método FOB).
 *   3. Se actualizan los `unit_cost_usd` de cada `shipment_item` (capitalización en Inventario).
 *   4. Se inserta UN journal_entry con DR Inventarios / CR CxP por el delta.
 *
 * No montamos el modal completo (Dialog + Select + QueryProvider) — testeamos
 * la lógica pura (`computeLanded`) y simulamos la pipeline de save contra un
 * mock del cliente Supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeLanded } from '@/lib/landed-cost';

// ──────────────────────────────────────────────────────────────
// Mock del cliente Supabase con captura de inserts/updates
// ──────────────────────────────────────────────────────────────
type Captured = {
  table: string;
  op: 'update' | 'insert';
  payload: any;
  filter?: { col: string; val: any };
};

function makeSupabaseMock() {
  const captured: Captured[] = [];

  const accountsCatalog = [
    { id: 'acc-13000', code: '13000', description: 'Inventarios', account_type: 'Activo' },
    { id: 'acc-20150', code: '20150', description: 'CxP Proveedores', account_type: 'Pasivo' },
  ];

  const lastInsertedJE = { id: 'je-generated-1' };

  const supabase = {
    from(table: string) {
      const ctx: any = { table, _filter: undefined };

      ctx.update = (payload: any) => {
        ctx._pendingOp = { op: 'update', payload };
        return ctx;
      };
      ctx.insert = (payload: any) => {
        captured.push({ table, op: 'insert', payload });
        ctx._pendingOp = { op: 'insert', payload };
        // Cadena .select().single() devuelve la JE simulada
        return {
          select: () => ({
            single: async () =>
              table === 'journal_entries'
                ? { data: lastInsertedJE, error: null }
                : { data: payload, error: null },
          }),
          // Para inserts sin select (las journal_entry_lines)
          then: (resolve: any) => resolve({ error: null }),
        };
      };
      ctx.eq = (col: string, val: any) => {
        if (ctx._pendingOp?.op === 'update') {
          captured.push({
            table,
            op: 'update',
            payload: ctx._pendingOp.payload,
            filter: { col, val },
          });
        }
        return Promise.resolve({ error: null });
      };
      ctx.select = (_cols?: string) => {
        // Catálogo de cuentas
        if (table === 'chart_of_accounts') {
          return {
            eq: () => ({
              order: async () => ({ data: accountsCatalog, error: null }),
            }),
          };
        }
        return ctx;
      };
      return ctx;
    },
  };

  return { supabase, captured, lastInsertedJE };
}

// ──────────────────────────────────────────────────────────────
// Función bajo prueba: replica lo que hace ShipmentExpensesDialog.performSave
// (versión simplificada, mismas operaciones contra Supabase)
// ──────────────────────────────────────────────────────────────
async function simulateEditFreight(opts: {
  supabase: any;
  shipment: any;
  items: any[];
  newFreight: number;
}) {
  const { supabase, shipment, items, newFreight } = opts;

  const calc = computeLanded(
    shipment,
    items,
    {
      freight: newFreight,
      customs: Number(shipment.customs_cost_usd || 0),
      other: Number(shipment.other_cost_usd || 0),
    },
    'fob',
  );

  // 1) Update header del envío
  await supabase
    .from('shipments')
    .update({
      shipping_cost_usd: calc.newFreight,
      customs_cost_usd: calc.newCustoms,
      other_cost_usd: calc.newOther,
      total_cost_usd: calc.totalFob,
    })
    .eq('id', shipment.id);

  // 2) Update unit_cost_usd de cada shipment_item (capitalización inventario)
  for (const p of calc.preview) {
    await supabase
      .from('shipment_items')
      .update({ unit_cost_usd: Number(p.newUnitCost.toFixed(4)) })
      .eq('id', p.id);
  }

  // 3) Si hay delta, insertar journal entry: DR Inventarios / CR CxP
  if (Math.abs(calc.deltaAddons) > 0.01) {
    const { data: entry } = await supabase
      .from('journal_entries')
      .insert({
        description: `Ajuste flete — PO ${shipment.po_number}`,
        total_debit_usd: calc.deltaAddons,
        total_credit_usd: calc.deltaAddons,
      })
      .select()
      .single();

    await supabase.from('journal_entry_lines').insert([
      {
        journal_entry_id: entry.id,
        account_id: 'acc-13000',
        debit_usd: calc.deltaAddons,
        credit_usd: 0,
        description: 'Capitalización flete',
      },
      {
        journal_entry_id: entry.id,
        account_id: 'acc-20150',
        debit_usd: 0,
        credit_usd: calc.deltaAddons,
        description: 'Obligación flete',
      },
    ]);
  }

  return calc;
}

// ──────────────────────────────────────────────────────────────
// Suites
// ──────────────────────────────────────────────────────────────
describe('Edición de flete en PO — integración', () => {
  let mock: ReturnType<typeof makeSupabaseMock>;

  beforeEach(() => {
    mock = makeSupabaseMock();
  });

  it('prorratea el nuevo flete por FOB y recalcula unit_cost por línea', () => {
    // PO con 2 productos, FOB puro $1000 + $3000 = $4000, sin addons previos
    const shipment = {
      id: 'ship-1',
      po_number: 'PO-TEST-001',
      shipping_cost_usd: 0,
      customs_cost_usd: 0,
      other_cost_usd: 0,
    };
    const items = [
      { id: 'item-A', product_id: 'p-A', quantity_ordered: 10, unit_cost_usd: 100 }, // $1000
      { id: 'item-B', product_id: 'p-B', quantity_ordered: 30, unit_cost_usd: 100 }, // $3000
    ];

    const calc = computeLanded(shipment, items, { freight: 400, customs: 0, other: 0 }, 'fob');

    expect(calc.totalFob).toBe(4000);
    expect(calc.deltaAddons).toBe(400);
    // Item A recibe 25% del flete = $100, item B recibe 75% = $300
    const itemA = calc.preview.find((p) => p.id === 'item-A')!;
    const itemB = calc.preview.find((p) => p.id === 'item-B')!;
    expect(itemA.lineAddon).toBeCloseTo(100, 4);
    expect(itemB.lineAddon).toBeCloseTo(300, 4);
    // Costos unitarios nuevos: A = $100 + $10 = $110, B = $100 + $10 = $110
    expect(itemA.newUnitCost).toBeCloseTo(110, 4);
    expect(itemB.newUnitCost).toBeCloseTo(110, 4);
    // La suma de addons prorrateados conserva el total
    const sumAddons = calc.preview.reduce((s, p) => s + p.lineAddon, 0);
    expect(sumAddons).toBeCloseTo(400, 4);
  });

  it('crea asiento contable y actualiza inventario al editar flete', async () => {
    const shipment = {
      id: 'ship-2',
      po_number: 'PO-TEST-002',
      shipping_cost_usd: 0,
      customs_cost_usd: 0,
      other_cost_usd: 0,
    };
    const items = [
      { id: 'item-A', product_id: 'p-A', quantity_ordered: 10, unit_cost_usd: 100 },
      { id: 'item-B', product_id: 'p-B', quantity_ordered: 30, unit_cost_usd: 100 },
    ];

    const calc = await simulateEditFreight({
      supabase: mock.supabase,
      shipment,
      items,
      newFreight: 400,
    });

    expect(calc.deltaAddons).toBe(400);

    // ── Verifica el update del header del shipment ──
    const shipUpdate = mock.captured.find(
      (c) => c.table === 'shipments' && c.op === 'update' && c.filter?.val === 'ship-2',
    );
    expect(shipUpdate).toBeDefined();
    expect(shipUpdate!.payload.shipping_cost_usd).toBe(400);
    expect(shipUpdate!.payload.total_cost_usd).toBe(4000);

    // ── Verifica los updates de costo unitario en shipment_items ──
    const itemUpdates = mock.captured.filter(
      (c) => c.table === 'shipment_items' && c.op === 'update',
    );
    expect(itemUpdates).toHaveLength(2);
    const updA = itemUpdates.find((u) => u.filter?.val === 'item-A');
    const updB = itemUpdates.find((u) => u.filter?.val === 'item-B');
    expect(updA!.payload.unit_cost_usd).toBeCloseTo(110, 2);
    expect(updB!.payload.unit_cost_usd).toBeCloseTo(110, 2);

    // ── Verifica el journal entry (header + 2 líneas balanceadas) ──
    const jeInsert = mock.captured.find(
      (c) => c.table === 'journal_entries' && c.op === 'insert',
    );
    expect(jeInsert).toBeDefined();
    expect(jeInsert!.payload.total_debit_usd).toBe(400);
    expect(jeInsert!.payload.total_credit_usd).toBe(400);
    expect(jeInsert!.payload.description).toContain('PO-TEST-002');

    const jelInsert = mock.captured.find(
      (c) => c.table === 'journal_entry_lines' && c.op === 'insert',
    );
    expect(jelInsert).toBeDefined();
    const lines = jelInsert!.payload as any[];
    expect(lines).toHaveLength(2);
    const debitLine = lines.find((l) => l.debit_usd > 0);
    const creditLine = lines.find((l) => l.credit_usd > 0);
    expect(debitLine.account_id).toBe('acc-13000'); // Inventarios
    expect(debitLine.debit_usd).toBe(400);
    expect(creditLine.account_id).toBe('acc-20150'); // CxP
    expect(creditLine.credit_usd).toBe(400);
    // Asiento balanceado: DR == CR
    expect(debitLine.debit_usd).toBe(creditLine.credit_usd);
  });

  it('NO crea asiento si el delta es cero (flete idéntico al actual)', async () => {
    const shipment = {
      id: 'ship-3',
      po_number: 'PO-TEST-003',
      shipping_cost_usd: 100,
      customs_cost_usd: 0,
      other_cost_usd: 0,
    };
    const items = [
      // unit_cost ya incluye los $100 de flete prorrateados
      { id: 'item-A', product_id: 'p-A', quantity_ordered: 10, unit_cost_usd: 110 },
    ];

    await simulateEditFreight({
      supabase: mock.supabase,
      shipment,
      items,
      newFreight: 100, // mismo valor
    });

    const jeInsert = mock.captured.find((c) => c.table === 'journal_entries');
    expect(jeInsert).toBeUndefined();
  });

  it('genera delta NEGATIVO (reverso) cuando se reduce el flete', async () => {
    const shipment = {
      id: 'ship-4',
      po_number: 'PO-TEST-004',
      shipping_cost_usd: 400, // flete previo
      customs_cost_usd: 0,
      other_cost_usd: 0,
    };
    const items = [
      // FOB $1000 + $100 flete prorrateado = $110/u; FOB $3000 + $300 = $110/u
      { id: 'item-A', product_id: 'p-A', quantity_ordered: 10, unit_cost_usd: 110 },
      { id: 'item-B', product_id: 'p-B', quantity_ordered: 30, unit_cost_usd: 110 },
    ];

    const calc = await simulateEditFreight({
      supabase: mock.supabase,
      shipment,
      items,
      newFreight: 200, // baja a la mitad
    });

    expect(calc.deltaAddons).toBe(-200);
    // El nuevo costo unitario debería volver a FOB ($100) + nuevo prorrateo ($5/u)
    const itemA = calc.preview.find((p) => p.id === 'item-A')!;
    expect(itemA.fobUnit).toBeCloseTo(100, 4);
    expect(itemA.newUnitCost).toBeCloseTo(105, 4);

    const jeInsert = mock.captured.find(
      (c) => c.table === 'journal_entries' && c.op === 'insert',
    );
    expect(jeInsert).toBeDefined();
    expect(jeInsert!.payload.total_debit_usd).toBe(-200);
  });
});
