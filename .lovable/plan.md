

## Plan: Mejoras en Dashboard, Finanzas e Inventario

### Problema identificado

1. **Dashboard** tiene botones de "Venta" y "Gasto" que solo redirigen a Finanzas — deben eliminarse del Dashboard
2. **Dashboard** necesita quick actions más relevantes (no ingreso de datos)
3. **Inventario** no tiene forma de agregar stock manualmente (ajustes, entrada inicial, daños, muestras, devoluciones) — solo entra por Envíos
4. **Reglas contables actuales**:
   - Existe trigger `on_sale_item_deduct_inventory` que auto-deduce inventario al crear `sale_items`
   - Pero la Finanzas/VentasTab TAMBIÉN deduce manualmente → **doble deducción**
   - Movement types disponibles: `receipt`, `sale`, `adjustment`, `sample`, `return`, `damage` — pero solo `receipt` y `sale` se usan

### Cambios propuestos

**1. Dashboard — Limpiar quick actions**
- Eliminar botones "Venta" y "Gasto" del Dashboard
- Dejar solo: Actividad CRM, AI Business Review
- Agregar botón rápido: "Ir a Inventario"

**2. Finanzas — Agregar más categorías de transacciones**
- Agregar pestaña "Compras" (o integrar dentro del flujo de Envíos)
- En Gastos, agregar categorías: `purchases` (compras de inventario), `payroll` (nómina), `insurance` (seguros), `rent` (alquiler), `utilities` (servicios), `maintenance` (mantenimiento)
- Esto requiere migración para agregar valores al enum `expense_category`

**3. Inventario — Agregar movimientos manuales**
- Nueva pestaña o sección "Movimientos" en Inventario con formulario para:
  - **Ajuste** (corrección de conteo físico)
  - **Muestra** (salida por muestra a cliente)
  - **Devolución** (entrada por devolución)
  - **Daño** (salida por producto dañado)
  - **Entrada manual** (receipt sin envío)
- Tabla de historial de movimientos con filtros
- Cada movimiento actualiza `inventory.quantity_on_hand` y crea registro en `inventory_movements`

**4. Corregir doble deducción de inventario**
- El trigger `handle_sale_item_inventory` YA deduce stock automáticamente al insertar en `sale_items`
- Eliminar la deducción manual en `FinanzasPage.tsx` (líneas ~412-416) que duplica la operación
- Esto corrige un bug real donde cada venta resta inventario 2 veces

**5. Nuevas categorías de gasto (migración)**
```sql
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'purchases';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'payroll';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'insurance';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'rent';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'utilities';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'maintenance';
```

### Archivos a modificar
- `src/pages/DashboardPage.tsx` — quitar botones Venta/Gasto
- `src/pages/FinanzasPage.tsx` — agregar categorías, eliminar deducción manual de inventario
- `src/pages/InventarioPage.tsx` — agregar pestaña "Movimientos" con formulario y tabla
- Migración SQL para nuevos valores de `expense_category`

### Resumen de reglas contables después del cambio
- **Venta** → trigger auto-deduce inventario + crea movement `sale`
- **Envío recibido** → código en ShipmentsTab suma inventario + movement `receipt`
- **Ajuste manual** → nuevo formulario en Inventario + movement `adjustment/sample/return/damage`
- **Gastos** → solo registro financiero, NO afectan inventario (excepto `purchases` que se registra como gasto operativo)

