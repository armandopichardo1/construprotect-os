

# Auditoría Completa — ConstruProtect OS

## Bugs y Glitches Encontrados

### 1. BUG CRÍTICO: `SelectItem value=""` en formularios de Gasto/Costo
**Archivo:** `src/pages/FinanzasPage.tsx` (líneas 856, 1066)
**Problema:** `<SelectItem value="">Sin asignar</SelectItem>` — Radix UI Select no permite strings vacíos como valor. Esto causa un error silencioso donde el select no puede ser "reseteado" a "Sin asignar" una vez que se elige una cuenta. El componente puede crashear o no funcionar correctamente.
**Fix:** Cambiar `value=""` a `value="none"` y mapear "none" → null al guardar.

### 2. BUG: ExchangeRateKpi invalida query key incorrecto
**Archivo:** `src/pages/FinanzasPage.tsx` (línea 83)
**Problema:** `queryClient.invalidateQueries({ queryKey: ['latest-rate'] })` — pero el hook `useExchangeRate` usa `queryKey: ['all-exchange-rates']`. Cuando actualizas la tasa desde el botón refresh en Finanzas > Resumen, el KPI se actualiza pero los cálculos del resto de la página (que usan `rateForMonth`) no se refrescan.
**Fix:** Agregar invalidación de `['all-exchange-rates']` junto con `['latest-rate']`.

### 3. BUG: Gastos tab muestra empty state incorrecto
**Archivo:** `src/pages/FinanzasPage.tsx` (línea 758)
**Problema:** `{expenses.length === 0 && ...}` usa el array sin filtrar, no `filteredExpenses`. Si hay gastos pero están fuera del rango del filtro, el usuario verá una tabla vacía sin mensaje.
**Fix:** Cambiar a `{filteredExpenses.length === 0 && ...}`. Lo mismo aplica para Costos (línea 969).

### 4. BUG: Ventas editadas pierden payment_status
**Archivo:** `src/pages/FinanzasPage.tsx` (línea 573)
**Problema:** `SaleFormDialog.handleSave` siempre setea `payment_status: 'pending'` al editar. Si una venta estaba marcada como "Pagado", al editarla se revierte a "Pendiente".
**Fix:** Preservar el `editSale.payment_status` existente al editar.

### 5. BUG: Sale form dialog no genera asiento contable
**Archivo:** `src/pages/FinanzasPage.tsx` (SaleFormDialog)
**Problema:** El formulario de venta dentro de Finanzas > Ventas NO genera asiento contable automático, pero el formulario en "Crear Transacción" sí lo hace. Inconsistencia funcional.
**Fix:** Unificar la lógica o agregar generación de asiento en SaleFormDialog.

### 6. GLITCH: P&L usa `amount_usd` para gastos — inconsistencia con moneda
**Archivo:** `src/pages/FinanzasPage.tsx` (línea 1124, 1126)
**Problema:** `calcPeriodTotals` suma `amount_usd` para gastos, pero algunos gastos pueden haber sido ingresados en DOP (con `amount_usd` calculado via tasa). Cuando la tasa cambia, los valores históricos se distorsionan. Este es un issue de diseño menor pero consistente.
**Fix:** El diseño actual es aceptable (USD como moneda base interna), pero conviene verificar que `amount_usd` siempre se popula correctamente.

### 7. BUG: Expense/Cost form dialogs no auto-asignan cuenta
**Archivo:** `src/pages/FinanzasPage.tsx` (ExpenseFormDialog, CostFormDialog)
**Problema:** Los formularios de edición rápida (Gastos tab, Costos tab) no aplican la lógica de auto-asignación de cuenta contable al cambiar categoría, a diferencia del formulario en "Crear Transacción" que sí lo hace.
**Fix:** Agregar la misma lógica `EXPENSE_ACCOUNT_MAP` / `COST_ACCOUNT_MAP` a estos dialogs.

### 8. GLITCH: Login page muestra hint de usuarios
**Archivo:** `src/pages/LoginPage.tsx` (línea 120-122)
**Problema:** `<p>Usuarios: apichardo, lazar, dazar</p>` — esto es información sensible visible en producción.
**Fix:** Eliminar esta línea.

### 9. BUG MENOR: Sale deletion no revierte inventario
**Archivo:** `src/pages/FinanzasPage.tsx` (handleDeleteSale)
**Problema:** Al eliminar una venta, se eliminan los `sale_items` pero no se revierte la deducción de inventario que hizo el trigger `handle_sale_item_inventory`. La venta se borra pero el inventario queda descontado.
**Fix:** Antes de eliminar los sale_items, recalcular y devolver cantidades al inventario.

### 10. GLITCH: Receipt upload en Costos tab pasa `expenseId`
**Archivo:** `src/pages/FinanzasPage.tsx` (línea 950)
**Problema:** `<ReceiptUpload expenseId={c.id} ...>` — el componente está diseñado para gastos, pero se usa para costos. Si el ReceiptUpload actualiza la tabla `expenses`, el receipt del costo se perdería.
**Fix:** Verificar que ReceiptUpload sea genérico o crear una variante para costos.

## Plan de Corrección (Priorizado)

### Paso 1: Fixes críticos de UI
- Cambiar `SelectItem value=""` → `value="none"` en ExpenseFormDialog y CostFormDialog
- Corregir invalidación de exchange rate queries
- Corregir empty state condicional en Gastos/Costos tabs

### Paso 2: Fixes de lógica de negocio
- Preservar `payment_status` al editar ventas
- Agregar auto-asignación de cuenta contable en ExpenseFormDialog y CostFormDialog
- Eliminar hint de usuarios en login page

### Paso 3: Fixes de integridad de datos
- Agregar reversión de inventario al eliminar ventas
- Verificar ReceiptUpload funcione para tabla de costos

### Archivos a modificar:
1. `src/pages/FinanzasPage.tsx` — fixes 1, 2, 3, 4, 5, 7, 9, 10
2. `src/pages/LoginPage.tsx` — fix 8

Total: ~10 correcciones en 2 archivos.

