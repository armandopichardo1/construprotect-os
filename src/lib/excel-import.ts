import { z } from 'zod';
import * as XLSX from 'xlsx';

// Column name mapping: Spanish headers → DB field names
const COLUMN_MAP: Record<string, string> = {
  'sku': 'sku',
  'código': 'sku',
  'codigo': 'sku',
  'nombre': 'name',
  'name': 'name',
  'producto': 'name',
  'marca': 'brand',
  'brand': 'brand',
  'categoría': 'category',
  'categoria': 'category',
  'category': 'category',
  'costo': 'unit_cost_usd',
  'costo_usd': 'unit_cost_usd',
  'unit_cost_usd': 'unit_cost_usd',
  'costo_total': 'total_unit_cost_usd',
  'total_unit_cost_usd': 'total_unit_cost_usd',
  'precio_lista': 'price_list_usd',
  'price_list_usd': 'price_list_usd',
  'precio_arquitecto': 'price_architect_usd',
  'price_architect_usd': 'price_architect_usd',
  'precio_proyecto': 'price_project_usd',
  'price_project_usd': 'price_project_usd',
  'precio_mayoreo': 'price_wholesale_usd',
  'price_wholesale_usd': 'price_wholesale_usd',
  'margen_lista': 'margin_list_pct',
  'margen_arquitecto': 'margin_architect_pct',
  'margen_proyecto': 'margin_project_pct',
  'margen_mayoreo': 'margin_wholesale_pct',
  'cobertura_m2': 'coverage_m2',
  'coverage_m2': 'coverage_m2',
  'dimensiones': 'dimensions',
  'dimensions': 'dimensions',
  'unidades_paquete': 'units_per_pack',
  'units_per_pack': 'units_per_pack',
  'punto_reorden': 'reorder_point',
  'reorder_point': 'reorder_point',
  'cantidad_reorden': 'reorder_qty',
  'reorder_qty': 'reorder_qty',
  'lead_time': 'lead_time_days',
  'lead_time_days': 'lead_time_days',
};

const productRowSchema = z.object({
  sku: z.string().trim().min(1, 'SKU es requerido').max(50, 'SKU muy largo'),
  name: z.string().trim().min(1, 'Nombre es requerido').max(200, 'Nombre muy largo'),
  brand: z.string().trim().max(100).optional().nullable(),
  category: z.string().trim().max(50).optional().nullable(),
  unit_cost_usd: z.coerce.number().min(0).optional().default(0),
  total_unit_cost_usd: z.coerce.number().min(0).optional().default(0),
  price_list_usd: z.coerce.number().min(0).optional().default(0),
  price_architect_usd: z.coerce.number().min(0).optional().default(0),
  price_project_usd: z.coerce.number().min(0).optional().default(0),
  price_wholesale_usd: z.coerce.number().min(0).optional().default(0),
  margin_list_pct: z.coerce.number().min(0).max(100).optional().default(0),
  margin_architect_pct: z.coerce.number().min(0).max(100).optional().default(0),
  margin_project_pct: z.coerce.number().min(0).max(100).optional().default(0),
  margin_wholesale_pct: z.coerce.number().min(0).max(100).optional().default(0),
  coverage_m2: z.coerce.number().min(0).optional().nullable(),
  dimensions: z.string().trim().max(50).optional().nullable(),
  units_per_pack: z.coerce.number().int().min(1).optional().default(1),
  reorder_point: z.coerce.number().int().min(0).optional().default(10),
  reorder_qty: z.coerce.number().int().min(0).optional().default(50),
  lead_time_days: z.coerce.number().int().min(0).optional().default(21),
});

export type ProductRow = z.infer<typeof productRowSchema>;

export interface ImportResult {
  valid: ProductRow[];
  errors: { row: number; field: string; message: string }[];
  totalRows: number;
}

function normalizeHeader(header: string): string | null {
  const key = header.toLowerCase().trim().replace(/[\s\-]+/g, '_').replace(/[^a-z0-9_áéíóúñü]/g, '');
  return COLUMN_MAP[key] || null;
}

export function parseExcelFile(file: File): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

        if (rawRows.length === 0) {
          resolve({ valid: [], errors: [{ row: 0, field: '', message: 'El archivo está vacío' }], totalRows: 0 });
          return;
        }

        // Map headers
        const rawHeaders = Object.keys(rawRows[0]);
        const headerMap: Record<string, string> = {};
        rawHeaders.forEach(h => {
          const mapped = normalizeHeader(h);
          if (mapped) headerMap[h] = mapped;
        });

        if (!Object.values(headerMap).includes('sku') || !Object.values(headerMap).includes('name')) {
          resolve({
            valid: [],
            errors: [{ row: 0, field: '', message: 'El archivo debe tener columnas "SKU" y "Nombre" (o equivalentes)' }],
            totalRows: rawRows.length,
          });
          return;
        }

        const valid: ProductRow[] = [];
        const errors: ImportResult['errors'] = [];

        rawRows.forEach((raw, idx) => {
          const mapped: Record<string, unknown> = {};
          Object.entries(raw).forEach(([key, value]) => {
            const dbField = headerMap[key];
            if (dbField) {
              mapped[dbField] = value === '' || value === null || value === undefined ? undefined : value;
            }
          });

          const result = productRowSchema.safeParse(mapped);
          if (result.success) {
            valid.push(result.data);
          } else {
            result.error.issues.forEach(issue => {
              errors.push({
                row: idx + 2, // +2: 1-indexed + header row
                field: issue.path.join('.'),
                message: issue.message,
              });
            });
          }
        });

        resolve({ valid, errors, totalRows: rawRows.length });
      } catch (err) {
        reject(new Error('No se pudo leer el archivo Excel'));
      }
    };
    reader.onerror = () => reject(new Error('Error leyendo el archivo'));
    reader.readAsArrayBuffer(file);
  });
}

export const EXPECTED_COLUMNS = [
  { header: 'SKU', field: 'sku', required: true },
  { header: 'Nombre', field: 'name', required: true },
  { header: 'Marca', field: 'brand', required: false },
  { header: 'Categoría', field: 'category', required: false },
  { header: 'Costo', field: 'unit_cost_usd', required: false },
  { header: 'Precio Lista', field: 'price_list_usd', required: false },
  { header: 'Precio Arquitecto', field: 'price_architect_usd', required: false },
  { header: 'Precio Proyecto', field: 'price_project_usd', required: false },
  { header: 'Precio Mayoreo', field: 'price_wholesale_usd', required: false },
  { header: 'Cobertura m²', field: 'coverage_m2', required: false },
  { header: 'Punto Reorden', field: 'reorder_point', required: false },
];
