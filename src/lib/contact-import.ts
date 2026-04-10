import { z } from 'zod';
import * as XLSX from 'xlsx';

const COLUMN_MAP: Record<string, string> = {
  'nombre': 'contact_name', 'name': 'contact_name', 'contacto': 'contact_name', 'contact_name': 'contact_name',
  'empresa': 'company_name', 'company': 'company_name', 'company_name': 'company_name', 'compañia': 'company_name',
  'rnc': 'rnc',
  'email': 'email', 'correo': 'email', 'e-mail': 'email',
  'telefono': 'phone', 'teléfono': 'phone', 'phone': 'phone', 'tel': 'phone',
  'whatsapp': 'whatsapp', 'wsp': 'whatsapp', 'wa': 'whatsapp',
  'segmento': 'segment', 'segment': 'segment',
  'prioridad': 'priority', 'priority': 'priority',
  'territorio': 'territory', 'territory': 'territory', 'zona': 'territory',
  'direccion': 'address', 'dirección': 'address', 'address': 'address',
  'fuente': 'source', 'source': 'source', 'origen': 'source',
  'tier_precio': 'price_tier', 'price_tier': 'price_tier', 'tier': 'price_tier',
  'notas': 'notes', 'notes': 'notes', 'observaciones': 'notes',
  'tags': 'tags', 'etiquetas': 'tags',
};

const contactRowSchema = z.object({
  contact_name: z.string().trim().min(1, 'Nombre es requerido').max(200),
  company_name: z.string().trim().max(200).optional().nullable(),
  rnc: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().max(100).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  whatsapp: z.string().trim().max(30).optional().nullable(),
  segment: z.string().trim().max(50).optional().nullable(),
  priority: z.coerce.number().int().min(1).max(5).optional().default(3),
  territory: z.string().trim().max(100).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  source: z.string().trim().max(100).optional().nullable(),
  price_tier: z.string().trim().max(20).optional().default('list'),
  notes: z.string().trim().max(500).optional().nullable(),
  tags: z.string().trim().optional().nullable(),
});

export type ContactRow = z.infer<typeof contactRowSchema>;

export interface ContactImportResult {
  valid: ContactRow[];
  errors: { row: number; field: string; message: string }[];
  totalRows: number;
}

function normalizeHeader(header: string): string | null {
  const key = header.toLowerCase().trim().replace(/[\s\-]+/g, '_').replace(/[^a-z0-9_áéíóúñü]/g, '');
  return COLUMN_MAP[key] || null;
}

export function parseContactExcel(file: File): Promise<ContactImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

        if (rawRows.length === 0) {
          resolve({ valid: [], errors: [{ row: 0, field: '', message: 'El archivo está vacío' }], totalRows: 0 });
          return;
        }

        const rawHeaders = Object.keys(rawRows[0]);
        const headerMap: Record<string, string> = {};
        rawHeaders.forEach(h => { const m = normalizeHeader(h); if (m) headerMap[h] = m; });

        if (!Object.values(headerMap).includes('contact_name')) {
          resolve({ valid: [], errors: [{ row: 0, field: '', message: 'El archivo debe tener una columna "Nombre" o "Contacto"' }], totalRows: rawRows.length });
          return;
        }

        const valid: ContactRow[] = [];
        const errors: ContactImportResult['errors'] = [];

        rawRows.forEach((raw, idx) => {
          const mapped: Record<string, unknown> = {};
          Object.entries(raw).forEach(([key, value]) => {
            const dbField = headerMap[key];
            if (dbField) mapped[dbField] = value === '' || value === null || value === undefined ? undefined : String(value);
          });
          const result = contactRowSchema.safeParse(mapped);
          if (result.success) { valid.push(result.data); }
          else { result.error.issues.forEach(issue => { errors.push({ row: idx + 2, field: issue.path.join('.'), message: issue.message }); }); }
        });

        resolve({ valid, errors, totalRows: rawRows.length });
      } catch { reject(new Error('No se pudo leer el archivo Excel')); }
    };
    reader.onerror = () => reject(new Error('Error leyendo el archivo'));
    reader.readAsArrayBuffer(file);
  });
}

export const CONTACT_COLUMNS = [
  { header: 'Nombre', field: 'contact_name', required: true },
  { header: 'Empresa', field: 'company_name', required: false },
  { header: 'RNC', field: 'rnc', required: false },
  { header: 'Email', field: 'email', required: false },
  { header: 'Teléfono', field: 'phone', required: false },
  { header: 'WhatsApp', field: 'whatsapp', required: false },
  { header: 'Segmento', field: 'segment', required: false },
  { header: 'Prioridad', field: 'priority', required: false },
  { header: 'Territorio', field: 'territory', required: false },
  { header: 'Dirección', field: 'address', required: false },
  { header: 'Fuente', field: 'source', required: false },
  { header: 'Tier Precio', field: 'price_tier', required: false },
  { header: 'Notas', field: 'notes', required: false },
  { header: 'Tags', field: 'tags', required: false },
];

export function downloadContactTemplate() {
  const headers = CONTACT_COLUMNS.map(c => c.header);
  const example = ['Juan Pérez', 'Constructora ABC', '130-12345-6', 'juan@abc.com', '809-555-0001', '18095550001', 'Constructor', '4', 'Santo Domingo', 'Av. Winston Churchill 123', 'Referido', 'architect', 'Cliente importante', 'VIP,frecuente'];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contactos');
  XLSX.writeFile(wb, 'plantilla_contactos.xlsx');
}
