

## Plan: P&L con comparación mes a mes y año anterior

### Situación actual
El P&L actual solo muestra el mes corriente y una tendencia de 6 meses. No tiene filtros de período ni comparación con el año anterior.

### Cambios propuestos

**Rediseñar `PLTab` en `src/pages/FinanzasPage.tsx`:**

1. **Filtro de período** — Selector con opciones:
   - Mes actual (default)
   - Mes anterior
   - YTD (año en curso acumulado)
   - Último trimestre
   - Año completo

2. **Tabla comparativa de 3 columnas:**
   - Columna 1: Período seleccionado
   - Columna 2: Mes anterior (o período equivalente anterior)
   - Columna 3: Mismo período del año pasado
   - Delta (%) entre columnas para ver variación

3. **Filas del P&L** (sin cambio en estructura):
   - Ingresos → (-) COGS → Utilidad Bruta → Gastos por categoría → Utilidad Neta
   - Cada fila muestra valor actual, anterior, año pasado, y % cambio

4. **Pasar `sales`, `saleItems`, `expenses` completos** al PLTab (actualmente solo recibe `monthlyData` pre-filtrado a 6 meses) para que pueda calcular cualquier rango de fechas

5. **Gráfica de tendencia** — Expandir a 12 meses con línea comparativa del año anterior

### Archivos a modificar
- `src/pages/FinanzasPage.tsx` — Rediseñar PLTab con filtros, comparación multi-columna y cálculos dinámicos por período

### Detalles técnicos
- Lógica de agrupación: helper `calcPeriodTotals(sales, saleItems, expenses, startDate, endDate)` que retorna `{ revenue, cogs, grossProfit, expensesByCategory, totalExpenses, netIncome }`
- La comparación "mismo mes año pasado" resta 12 meses a la fecha seleccionada
- YTD = enero 1 del año actual hasta hoy
- Sin migración de base de datos necesaria

